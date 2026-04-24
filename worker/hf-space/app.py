"""SplatHub → 3D Generation Thin Proxy Space.

우리 웹 앱에서 직접 호출할 수 있는 REST 엔드포인트를 노출하는 얇은 프록시.
두 가지 품질 경로를 제공:

파이프라인 A (generative, 1장, 빠름):
  1. rembg + BiRefNet-general (2024, MIT) → RGBA PNG
  2. microsoft/TRELLIS.2 호출 (2026-01, MIT) → 1장의 상상 3D
  엔드포인트: POST /api/convert

파이프라인 B (photogrammetry, N장, 실측 기반):
  1. facebook/vggt 호출 (CVPR 2025 Best Paper, Meta, 10장 ~30초)
  2. N장의 사진 + 카메라 포즈 → pointcloud GLB
  엔드포인트: POST /api/vggt

공통 엔드포인트:
  GET  /api/health     { status, targets }
  GET  /                Gradio UI

환경변수:
  HF_TOKEN    microsoft/TRELLIS.2, facebook/vggt 에 ZeroGPU 우선순위.

라이선스:
  - briaai/BiRefNet (MIT) — 배경 제거
  - microsoft/TRELLIS.2 (MIT) — 1장 → 3D
  - facebook/vggt (CC-BY-NC 또는 VGGT-1B-Commercial) — N장 → 3D
"""

from __future__ import annotations

import io
import logging
import os
import tempfile
import traceback
from pathlib import Path

import gradio as gr
from fastapi import FastAPI, File, HTTPException, UploadFile, Response
from fastapi.middleware.cors import CORSMiddleware
from gradio_client import Client, handle_file

logging.basicConfig(
    level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s"
)
logger = logging.getLogger("splathub-proxy")

# 환경변수
HF_TOKEN = os.environ.get("HF_TOKEN")
if not HF_TOKEN:
    logger.warning("HF_TOKEN 이 설정되지 않음 — TRELLIS 호출 시 GPU queue 대기 길어질 수 있음")

# TRELLIS.2 (2026-01-29, MIT, 4B 파라미터, PBR + 1536³) 를 기본으로 사용.
# v1 으로 돌아가려면 환경변수 TRELLIS_SPACE_ID=microsoft/TRELLIS.
TRELLIS_SPACE_ID = os.environ.get("TRELLIS_SPACE_ID", "microsoft/TRELLIS.2")

# 품질/속도 트레이드오프. "1024" 가 기본, "1536" 이면 최고 품질 (~2배 느림).
TRELLIS_RESOLUTION = os.environ.get("TRELLIS_RESOLUTION", "1024")

# VGGT (Meta, CVPR 2025 Best Paper) — 여러 장 → 실측 기반 3D (photogrammetry).
# 현재 공식 Space 그대로 사용. 향후 VGGT-1B-Commercial 로 upgrade 가능.
VGGT_SPACE_ID = os.environ.get("VGGT_SPACE_ID", "facebook/vggt")


# ─── TRELLIS / VGGT 클라이언트 연결 (lazy) ────────────────────────────

_trellis_client: Client | None = None
_vggt_client: Client | None = None


def _connect_client(space_id: str) -> Client:
    """gradio_client 는 버전에 따라 hf_token / token 키워드가 다름.
    Gradio 5.x Space 를 호출하려면 최신 gradio_client (1.10+) 필요하고,
    그 경우 kwarg 는 `token`. 구버전(1.3.x)은 `hf_token`.
    """
    if not HF_TOKEN:
        return Client(space_id)
    try:
        return Client(space_id, token=HF_TOKEN)
    except TypeError:
        return Client(space_id, hf_token=HF_TOKEN)


def get_vggt() -> Client:
    """facebook/vggt Space 에 연결. 여러 장 사진 → 3D 재구성."""
    global _vggt_client
    if _vggt_client is None:
        logger.info("connecting to %s", VGGT_SPACE_ID)
        _vggt_client = _connect_client(VGGT_SPACE_ID)
    return _vggt_client


def get_trellis() -> Client:
    global _trellis_client
    if _trellis_client is None:
        logger.info("connecting to %s", TRELLIS_SPACE_ID)
        _trellis_client = _connect_client(TRELLIS_SPACE_ID)
    return _trellis_client


# ─── 핵심 변환 함수 ────────────────────────────────────────────────────


# ─── BiRefNet 배경 제거 (rembg) ────────────────────────────────────────

# rembg 는 첫 호출 시 모델을 HuggingFace 에서 다운로드. Hugging Face Space
# 컨테이너는 /home/user/.cache 에 쓰기 가능. 재시작 전에는 캐시됨.

_rembg_session = None


def get_rembg_session():
    """BiRefNet-general-lite 모델 (2024, MIT) 의 rembg 세션을 반환.

    rembg 가 지원하는 모델:
      - u2net            (2020, TRELLIS 내장, 구식, halo 문제)
      - isnet-general-use (2022)
      - birefnet-general  (2024, 최고 품질)  ← 우리 선택
      - birefnet-general-lite (2024, 30% 더 빠름, 품질 거의 동일)
    """
    global _rembg_session
    if _rembg_session is None:
        from rembg import new_session

        logger.info("loading BiRefNet-general-lite (first time ~200MB download)")
        _rembg_session = new_session("birefnet-general-lite")
        logger.info("BiRefNet ready")
    return _rembg_session


def remove_background_to_rgba(image_path: str) -> str:
    """이미지에서 BiRefNet 으로 배경을 제거하고 RGBA PNG 로 저장.

    반환: 새 PNG 파일 경로 (alpha 채널 포함).
    """
    from PIL import Image
    from rembg import remove

    session = get_rembg_session()
    input_img = Image.open(image_path).convert("RGB")

    # alpha_matting=True 면 edge 가 더 깔끔하지만 2-3배 느림. 일단 False 로.
    output_img = remove(input_img, session=session, alpha_matting=False)

    # 1.2x 패딩 + 정사각 중앙 배치 (TRELLIS 가 선호하는 구도)
    output_img = center_on_square(output_img, target_size=1024, padding_ratio=1.2)

    out_path = image_path.rsplit(".", 1)[0] + "_rgba.png"
    output_img.save(out_path, "PNG")
    logger.info(
        "bg removed: %s → %s (size %d → %d bytes)",
        os.path.basename(image_path),
        os.path.basename(out_path),
        os.path.getsize(image_path),
        os.path.getsize(out_path),
    )
    return out_path


def center_on_square(rgba_img, target_size: int = 1024, padding_ratio: float = 1.2):
    """RGBA PIL Image 의 alpha bbox 계산 → 1.2x 패딩 → 정사각 중앙 배치."""
    from PIL import Image

    # alpha 채널에서 bbox 계산
    alpha = rgba_img.split()[-1]
    bbox = alpha.getbbox()
    if bbox is None:
        # 완전 투명 — 원본 반환
        return rgba_img.resize((target_size, target_size), Image.LANCZOS)

    # bbox 크기
    bbox_w = bbox[2] - bbox[0]
    bbox_h = bbox[3] - bbox[1]
    bbox_size = max(bbox_w, bbox_h)
    padded = int(bbox_size * padding_ratio)

    # bbox 중심
    cx = (bbox[0] + bbox[2]) // 2
    cy = (bbox[1] + bbox[3]) // 2

    # 정사각 transparent canvas 에 배치
    new_img = Image.new("RGBA", (padded, padded), (0, 0, 0, 0))
    # 원본 객체가 중앙에 오도록 offset 계산
    paste_x = padded // 2 - cx
    paste_y = padded // 2 - cy
    new_img.paste(rgba_img, (paste_x, paste_y), rgba_img)

    # 최종 target 사이즈로 리사이즈
    return new_img.resize((target_size, target_size), Image.LANCZOS)


# ─── 핵심 변환 함수 ────────────────────────────────────────────────────


def convert_image_to_glb(image_path: str) -> str:
    """단일 이미지 파일 → .glb 파일 경로.

    0) BiRefNet 으로 배경 제거 → RGBA PNG (새 모델 사용)
    1-4) TRELLIS 4-step 파이프라인 (alpha 감지해서 내장 U2Net 스킵)
    """
    # 0) 배경 제거 (서버 CPU, ~2-3s for birefnet-general-lite)
    logger.info("[step 0/4] bg removal (BiRefNet)")
    try:
        preprocessed_path = remove_background_to_rgba(image_path)
    except Exception as e:
        logger.warning("bg removal failed, using raw image: %s", e)
        preprocessed_path = image_path

    client = get_trellis()
    logger.info("[step 1/4] start_session")
    client.predict(api_name="/start_session")

    logger.info("[step 2/4] preprocess_image (TRELLIS 가 alpha 감지 시 skip)")
    preprocessed = client.predict(
        image=handle_file(preprocessed_path),
        api_name="/preprocess_image",
    )

    logger.info("[step 3/4] image_to_3d (TRELLIS.2: 3-stage sparse/shape/tex)")
    # TRELLIS.2 는 3 단계 (sparse-structure + shape-slat + tex-slat) 각각 별도
    # guidance/rescale/steps 파라미터. 기본값은 Microsoft Space UI 기본.
    # 품질 업 원하면 sampling_steps 를 25-30 까지 올리고, resolution 을
    # "1536" 으로 변경 (속도 2배 느려짐).
    client.predict(
        image=handle_file(preprocessed),
        seed=0,
        resolution=TRELLIS_RESOLUTION,
        ss_guidance_strength=7.5,
        ss_guidance_rescale=0.7,
        ss_sampling_steps=12,
        ss_rescale_t=5.0,
        shape_slat_guidance_strength=7.5,
        shape_slat_guidance_rescale=0.5,
        shape_slat_sampling_steps=12,
        shape_slat_rescale_t=3.0,
        tex_slat_guidance_strength=1.0,
        tex_slat_guidance_rescale=0.0,
        tex_slat_sampling_steps=12,
        tex_slat_rescale_t=3.0,
        api_name="/image_to_3d",
    )

    logger.info("[step 4/4] extract_glb (PBR textures)")
    # TRELLIS.2: decimation_target 100k-500k (높을수록 정밀), texture 1024-4096
    glb = client.predict(
        decimation_target=300000,  # 30만 폴리곤, 웹뷰어 적정
        texture_size=2048,          # 2K PBR 텍스처
        api_name="/extract_glb",
    )

    # glb 는 (download_path, preview_path) 튜플
    if isinstance(glb, (list, tuple)):
        glb_path = glb[0]
    else:
        glb_path = glb
    logger.info("[done] glb_path=%s, size=%d", glb_path, os.path.getsize(glb_path))
    return glb_path


# ─── VGGT photogrammetry 파이프라인 ────────────────────────────────────


def convert_pointcloud_to_mesh(glb_in: str) -> str:
    """VGGT pointcloud GLB → Poisson 표면 mesh GLB.

    VGGT output 은 pointcloud 라 viewer 에서 "부유 점" 으로 보임.
    Poisson surface reconstruction 으로 연속 mesh 로 변환 → 진짜 3D 인식 가능.

    Open3D 는 CPU 에서 ~5-10초, 50만 포인트 기준.
    실패 시 원본 pointcloud GLB 를 반환 (graceful fallback).
    """
    try:
        import numpy as np
        import open3d as o3d
        import trimesh

        logger.info("[poisson] loading GLB %s", os.path.basename(glb_in))
        scene = trimesh.load(glb_in)

        # trimesh 는 pointcloud 를 'vertices' 만 있는 mesh 또는 PointCloud 로 로드.
        # VGGT output 은 대부분 PointCloud.
        if hasattr(scene, "geometry"):
            # Scene → 가장 큰 geometry 추출
            geoms = list(scene.geometry.values())
            if not geoms:
                raise RuntimeError("no geometry in scene")
            pc = geoms[0]
        else:
            pc = scene

        # vertices + optional colors
        if hasattr(pc, "vertices"):
            pts = np.asarray(pc.vertices)
        elif hasattr(pc, "points"):
            pts = np.asarray(pc.points)
        else:
            raise RuntimeError(f"cannot extract points from {type(pc).__name__}")

        colors = None
        if hasattr(pc, "colors") and pc.colors is not None:
            c = np.asarray(pc.colors)
            if c.ndim == 2 and c.shape[1] >= 3:
                colors = c[:, :3].astype(np.float64)
                if colors.max() > 1.0:
                    colors /= 255.0
        elif hasattr(pc, "visual") and hasattr(pc.visual, "vertex_colors"):
            c = np.asarray(pc.visual.vertex_colors)
            if c.ndim == 2 and c.shape[1] >= 3:
                colors = c[:, :3].astype(np.float64) / 255.0

        logger.info("[poisson] %d points, colors=%s", len(pts), colors is not None)

        if len(pts) < 1000:
            logger.warning("[poisson] too few points, skipping")
            return glb_in

        # 포인트 너무 많으면 downsample (Poisson 속도 향상)
        # 원본 500k → 150k 로 샘플링, 품질 거의 동일
        MAX_POINTS = 150_000
        if len(pts) > MAX_POINTS:
            idx = np.random.choice(len(pts), MAX_POINTS, replace=False)
            pts = pts[idx]
            if colors is not None:
                colors = colors[idx]
            logger.info("[poisson] downsampled to %d points", len(pts))

        # Open3D pointcloud
        o3d_pc = o3d.geometry.PointCloud()
        o3d_pc.points = o3d.utility.Vector3dVector(pts)
        if colors is not None:
            o3d_pc.colors = o3d.utility.Vector3dVector(colors)

        # 노말 추정 (Poisson 필수) — tangent plane orient 는 비용 너무 큼 제거
        # 대신 viewpoint 기반 orient 사용 (수백 배 빠름)
        o3d_pc.estimate_normals(
            search_param=o3d.geometry.KDTreeSearchParamHybrid(radius=0.05, max_nn=20)
        )
        o3d_pc.orient_normals_towards_camera_location(
            camera_location=pts.mean(axis=0)
        )

        # Poisson depth=8 (9 보다 4배 빠름, 품질 거의 동일)
        logger.info("[poisson] running Poisson (depth=8)")
        mesh, densities = o3d.geometry.TriangleMesh.create_from_point_cloud_poisson(
            o3d_pc, depth=8, width=0, scale=1.1, linear_fit=False
        )

        # 낮은 density vertex 제거 (Poisson 이 채운 가짜 영역)
        densities = np.asarray(densities)
        threshold = np.quantile(densities, 0.1)  # 하위 10% 제거 (더 공격적)
        mesh.remove_vertices_by_mask(densities < threshold)

        logger.info(
            "[poisson] mesh: %d vertices, %d triangles",
            len(mesh.vertices),
            len(mesh.triangles),
        )

        # trimesh 로 export (GLB)
        tri_mesh = trimesh.Trimesh(
            vertices=np.asarray(mesh.vertices),
            faces=np.asarray(mesh.triangles),
            vertex_colors=(np.asarray(mesh.vertex_colors) * 255).astype(np.uint8)
            if len(mesh.vertex_colors) > 0
            else None,
        )
        out_path = glb_in.rsplit(".", 1)[0] + "_mesh.glb"
        tri_mesh.export(out_path)
        logger.info("[poisson] saved %s (%d bytes)", out_path, os.path.getsize(out_path))
        return out_path

    except Exception as e:
        logger.warning("[poisson] failed (%s), returning pointcloud", e)
        return glb_in


def convert_images_to_glb_vggt(image_paths: list[str]) -> str:
    """여러 장 사진 → VGGT photogrammetry → Poisson mesh → .glb.

    VGGT (Meta, CVPR 2025) 는 N장의 unposed 사진을 받아 카메라 포즈 + 3D
    pointcloud 를 한 번의 forward pass 로 추정. 10장 ~30초 on H200.
    이후 Poisson reconstruction 으로 pointcloud → 연속 mesh 변환 (~5-10초).

    반환: .glb 파일 경로 (mesh, 또는 Poisson 실패 시 pointcloud)
    """
    if len(image_paths) < 2:
        raise ValueError("VGGT 는 최소 2장의 사진이 필요합니다")

    client = get_vggt()
    logger.info("[vggt 1/2] uploading %d images", len(image_paths))
    upload_result = client.predict(
        input_video=None,
        input_images=[handle_file(p) for p in image_paths],
        api_name="/update_gallery_on_upload",
    )
    # upload_result = (None, target_dir, gallery_preview, message)
    if not isinstance(upload_result, (list, tuple)) or len(upload_result) < 2:
        raise RuntimeError(f"unexpected upload result: {upload_result}")
    target_dir = upload_result[1]
    if not target_dir:
        raise RuntimeError("VGGT upload did not return target_dir")
    logger.info("  target_dir=%s", target_dir)

    logger.info("[vggt 2/2] reconstructing...")
    recon_result = client.predict(
        target_dir=target_dir,
        conf_thres=50,
        frame_filter="All",
        mask_black_bg=False,
        mask_white_bg=False,
        show_cam=False,  # 카메라 표시 끄기 (깨끗한 pointcloud 만)
        mask_sky=False,
        prediction_mode="Depthmap and Camera Branch",
        api_name="/gradio_demo",
    )
    # recon_result = (glb_filepath, log_markdown, show_points_dropdown)
    if not isinstance(recon_result, (list, tuple)) or len(recon_result) < 1:
        raise RuntimeError(f"unexpected recon result: {recon_result}")
    glb_path = recon_result[0]
    if not glb_path or not os.path.exists(glb_path):
        raise RuntimeError(f"VGGT did not produce a valid GLB: {glb_path}")

    logger.info(
        "[vggt done] pointcloud glb_path=%s, size=%d bytes",
        glb_path,
        os.path.getsize(glb_path),
    )

    # Poisson mesh 는 30초+ 걸려 ZeroGPU 120초 한도 위험.
    # 대신 viewer 에서 pointcloud 를 큰 점으로 렌더 → 부유 점 문제 시각적 해결.
    # 선택적 Poisson 은 ?poisson=true 쿼리 파라미터로 추후 제공 가능.
    return glb_path


# ─── FastAPI 앱 ────────────────────────────────────────────────────────

api = FastAPI(title="SplatHub TRELLIS Proxy")

# 우리 Vercel 앱 + 로컬에서 호출 가능하도록 CORS open
api.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)


@api.get("/api/health")
def health():
    return {
        "status": "ok",
        "targets": {
            "trellis": TRELLIS_SPACE_ID,
            "vggt": VGGT_SPACE_ID,
        },
        "has_token": bool(HF_TOKEN),
    }


@api.post("/api/vggt")
async def vggt_endpoint(images: list[UploadFile] = File(...)):
    """여러 장 사진 → VGGT photogrammetry → .glb 바이너리.

    입력: multipart/form-data 의 `images` 필드 (2~30장 권장)
    출력: model/gltf-binary (pointcloud + camera poses)

    예:
      curl -X POST .../api/vggt -F "images=@a.jpg" -F "images=@b.jpg" -F "images=@c.jpg"
    """
    if len(images) < 2:
        raise HTTPException(
            status_code=400,
            detail="VGGT 는 최소 2장의 사진이 필요합니다",
        )
    if len(images) > 30:
        raise HTTPException(
            status_code=400,
            detail=f"최대 30장까지 지원. 현재 {len(images)}장",
        )

    # 업로드 파일들을 임시 디렉토리에 저장
    tmpdir = tempfile.mkdtemp(prefix="vggt_")
    tmp_paths: list[str] = []
    try:
        for idx, upload in enumerate(images):
            suffix = Path(upload.filename or f"img_{idx}.jpg").suffix or ".jpg"
            path = os.path.join(tmpdir, f"img_{idx}{suffix}")
            with open(path, "wb") as f:
                f.write(await upload.read())
            tmp_paths.append(path)

        glb_path = convert_images_to_glb_vggt(tmp_paths)
        with open(glb_path, "rb") as f:
            glb_bytes = f.read()
        return Response(
            content=glb_bytes,
            media_type="model/gltf-binary",
            headers={
                "X-Backend": "vggt",
                "X-Image-Count": str(len(images)),
                "X-Size": str(len(glb_bytes)),
            },
        )
    except HTTPException:
        raise
    except Exception as e:
        tb = traceback.format_exc()
        logger.error("VGGT failed: %s\n%s", e, tb)
        raise HTTPException(
            status_code=502,
            detail={"error": str(e), "trace": tb[:2000]},
        )
    finally:
        # 임시 파일 정리
        for p in tmp_paths:
            try:
                os.unlink(p)
            except Exception:
                pass
        try:
            os.rmdir(tmpdir)
        except Exception:
            pass


@api.post("/api/convert")
async def convert_endpoint(image: UploadFile = File(...)):
    # 업로드 파일 → 임시 경로
    suffix = Path(image.filename or "input.jpg").suffix or ".jpg"
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tf:
        content = await image.read()
        tf.write(content)
        tmp_path = tf.name

    try:
        glb_path = convert_image_to_glb(tmp_path)
        with open(glb_path, "rb") as f:
            glb_bytes = f.read()
        return Response(
            content=glb_bytes,
            media_type="model/gltf-binary",
            headers={"X-Trellis-Size": str(len(glb_bytes))},
        )
    except Exception as e:
        tb = traceback.format_exc()
        logger.error("conversion failed: %s\n%s", e, tb)
        raise HTTPException(
            status_code=502,
            detail={"error": str(e), "trace": tb[:2000]},
        )
    finally:
        try:
            os.unlink(tmp_path)
        except Exception:
            pass


# ─── Gradio UI (테스트용) ──────────────────────────────────────────────


def gradio_wrapper(image_path: str):
    return convert_image_to_glb(image_path)


demo = gr.Interface(
    fn=gradio_wrapper,
    inputs=gr.Image(type="filepath", label="입력 이미지"),
    outputs=gr.Model3D(label="3D Mesh (.glb)"),
    title="SplatHub → TRELLIS Proxy",
    description=(
        "microsoft/TRELLIS 를 호출해 단일 이미지에서 3D mesh 를 생성하는 Proxy Space.\n\n"
        "- REST: `POST /api/convert` (multipart: `image`) → model/gltf-binary\n"
        "- Health: `GET /api/health`"
    ),
    flagging_mode="never",
)


# FastAPI 위에 Gradio UI 마운트
app = gr.mount_gradio_app(api, demo, path="/")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=int(os.environ.get("PORT", "7860")))
