"""SplatHub → TRELLIS Thin Proxy Space with BiRefNet preprocessing.

우리 Vercel Next.js 앱에서 직접 호출할 수 있는 REST 엔드포인트를 노출.
microsoft/TRELLIS 를 호출하기 전에 BiRefNet 으로 배경을 깔끔하게 제거해서
TRELLIS 내부의 구식 U2Net(2020) 으로 인한 halo/blob 문제를 우회한다.

파이프라인:
  1. rembg + BiRefNet-general (2024, MIT) → RGBA PNG with clean alpha
  2. microsoft/TRELLIS 호출 — alpha 를 감지해 내장 U2Net 스킵 → 깨끗한 재구성

엔드포인트:
  POST /api/convert    multipart form { image: File } → model/gltf-binary
  GET  /api/health     { status: "ok", target: "microsoft/TRELLIS" }
  GET  /                Gradio UI (테스트용)

환경변수 (HF Space Settings → Variables):
  HF_TOKEN    필수. microsoft/TRELLIS 를 ZeroGPU 우선순위로 호출.

사전학습 모델 (직접 학습 X, 추론만):
  - briaai/BiRefNet (배경 제거, MIT) — rembg 를 통해 로드
  - microsoft/TRELLIS (이미지→3D, MIT) — gradio_client 로 호출
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


# ─── TRELLIS 클라이언트 연결 (lazy) ────────────────────────────────────

_trellis_client: Client | None = None


def get_trellis() -> Client:
    global _trellis_client
    if _trellis_client is None:
        logger.info("connecting to %s", TRELLIS_SPACE_ID)
        # gradio_client 1.3.0 은 `hf_token` 키워드 사용 (최신 버전은 `token`).
        _trellis_client = Client(TRELLIS_SPACE_ID, hf_token=HF_TOKEN)
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
    return {"status": "ok", "target": TRELLIS_SPACE_ID, "has_token": bool(HF_TOKEN)}


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
    allow_flagging="never",
)


# FastAPI 위에 Gradio UI 마운트
app = gr.mount_gradio_app(api, demo, path="/")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=int(os.environ.get("PORT", "7860")))
