"""
SplatHub GPU Worker — HF Space ZeroGPU(H200) 무료로 돌아가는 실제 3D 재구성 파이프라인.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
파이프라인:
  1. 입력 이미지
  2. RMBG-1.4 (MIT, 배경 제거)
  3. TripoSR (MIT, 단일 이미지 → textured 3D mesh)
     - SUNO/Stability AI 2024년 공개, ~2초/이미지 H100 기준
     - 출력: .glb 파일 (PBR mesh + texture)
  4. Gradio 인터페이스 + API

웹 호출 형식 (gradio_client):
  from gradio_client import Client
  client = Client("YOUR_USERNAME/splathub-3d")
  result = client.predict(image_path, api_name="/predict")
  # result 는 .glb 파일 경로
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

레퍼런스:
  - TripoSR: https://github.com/VAST-AI-Research/TripoSR (MIT)
  - RMBG-1.4: https://huggingface.co/briaai/RMBG-1.4 (MIT)
  - HF Spaces ZeroGPU: https://huggingface.co/docs/hub/spaces-zerogpu
"""

from __future__ import annotations

import os
import logging
import tempfile
from pathlib import Path

import gradio as gr
import numpy as np
import torch
from PIL import Image

try:
    import spaces  # type: ignore[import-not-found]
except ImportError:  # pragma: no cover — 로컬 개발용
    spaces = None  # type: ignore[assignment]

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)
logger = logging.getLogger("splathub.worker")

# ZeroGPU 데코레이터 — 로컬 개발 시 no-op
GPU_DURATION_SECONDS = int(os.environ.get("SPLATHUB_GPU_DURATION", "60"))


def gpu_required(fn):
    if spaces is None:
        return fn
    return spaces.GPU(duration=GPU_DURATION_SECONDS)(fn)


# ─────────────────────────────── 모델 로더 ───────────────────────────────


_bg_remover = None
_triposr_model = None


def get_bg_remover():
    """RMBG-1.4 배경 제거 모델 (MIT)."""
    global _bg_remover
    if _bg_remover is not None:
        return _bg_remover
    from transformers import pipeline
    _bg_remover = pipeline(
        "image-segmentation",
        model="briaai/RMBG-1.4",
        trust_remote_code=True,
    )
    return _bg_remover


def get_triposr():
    """TripoSR 모델 (MIT) — 단일 이미지에서 textured 3D mesh 생성."""
    global _triposr_model
    if _triposr_model is not None:
        return _triposr_model
    # TripoSR 패키지 또는 HF Transformers 통해 로드
    # 공식: https://github.com/VAST-AI-Research/TripoSR
    from tsr.system import TSR  # type: ignore[import-not-found]

    device = "cuda" if torch.cuda.is_available() else "cpu"
    _triposr_model = TSR.from_pretrained(
        "stabilityai/TripoSR",
        config_name="config.yaml",
        weight_name="model.ckpt",
    )
    _triposr_model.renderer.set_chunk_size(8192)
    _triposr_model.to(device)
    _triposr_model.eval()
    return _triposr_model


# ─────────────────────────────── 전처리 ───────────────────────────────


def remove_background(image: Image.Image) -> Image.Image:
    """RMBG로 배경 제거. 실패하면 원본 반환."""
    try:
        remover = get_bg_remover()
        result = remover(image)
        if isinstance(result, dict) and "image" in result:
            return result["image"]
        if isinstance(result, list) and result and "mask" in result[0]:
            mask = result[0]["mask"]
            rgba = image.convert("RGBA")
            rgba.putalpha(mask)
            return rgba
        return image
    except Exception as e:  # noqa: BLE001
        logger.warning("[rmbg] failed, using original: %s", e)
        return image


def center_crop_square(image: Image.Image, padding: float = 0.1) -> Image.Image:
    """객체 중심 정사각 크롭 — TripoSR 입력 정규화."""
    # alpha 채널이 있으면 bounding box 기준, 없으면 centre crop
    if image.mode == "RGBA":
        alpha = np.array(image.split()[-1])
        rows = np.any(alpha > 10, axis=1)
        cols = np.any(alpha > 10, axis=0)
        if rows.any() and cols.any():
            y0, y1 = np.where(rows)[0][[0, -1]]
            x0, x1 = np.where(cols)[0][[0, -1]]
            w = x1 - x0
            h = y1 - y0
            side = int(max(w, h) * (1.0 + padding))
            cx = (x0 + x1) // 2
            cy = (y0 + y1) // 2
            half = side // 2
            l = max(0, cx - half)
            t = max(0, cy - half)
            r = min(image.width, cx + half)
            b = min(image.height, cy + half)
            return image.crop((l, t, r, b)).resize((512, 512), Image.LANCZOS)
    # fallback: center crop
    s = min(image.width, image.height)
    l = (image.width - s) // 2
    t = (image.height - s) // 2
    return image.crop((l, t, l + s, t + s)).resize((512, 512), Image.LANCZOS)


# ─────────────────────────────── 메인 함수 ───────────────────────────────


@gpu_required
def image_to_3d(image_path: str, remove_bg: bool = True) -> str:
    """단일 이미지 → 3D mesh (.glb) 파일 경로 반환.

    ZeroGPU 워커에서 실행되는 핵심 함수. duration=60초로 제한.
    """
    logger.info("[worker] input=%s, remove_bg=%s", image_path, remove_bg)
    image = Image.open(image_path).convert("RGBA")

    if remove_bg:
        image = remove_background(image)
    image = center_crop_square(image)

    # TripoSR 추론
    model = get_triposr()
    with torch.no_grad():
        scene_codes = model([image], device=model.device)
        meshes = model.extract_mesh(scene_codes, has_vertex_color=True, resolution=256)

    # 첫 mesh를 .glb로 export
    mesh = meshes[0]
    out_path = os.path.join(tempfile.gettempdir(), f"splathub_mesh_{os.getpid()}.glb")
    mesh.export(out_path, file_type="glb")
    logger.info("[worker] exported %s (%d bytes)", out_path, os.path.getsize(out_path))
    return out_path


# ─────────────────────────────── Gradio UI ───────────────────────────────


DESCRIPTION = """
# SplatHub Worker — Single Image → 3D Mesh

사진 한 장 업로드하면 실제 객체 모양의 3D mesh (.glb) 를 생성합니다.
NVIDIA H200 GPU (ZeroGPU) 에서 약 3-5초 소요.

- **모델**: TripoSR (Stability AI, MIT)
- **배경 제거**: RMBG-1.4 (MIT)
- **출력**: .glb (Three.js/Blender/Unity 에서 바로 열림)
"""


def build_ui() -> gr.Blocks:
    with gr.Blocks(title="SplatHub Worker") as demo:
        gr.Markdown(DESCRIPTION)
        with gr.Row():
            with gr.Column(scale=1):
                image_in = gr.Image(label="입력 이미지", type="filepath", sources=["upload"])
                remove_bg_checkbox = gr.Checkbox(label="배경 자동 제거", value=True)
                btn = gr.Button("3D 생성", variant="primary")
            with gr.Column(scale=1):
                model_out = gr.Model3D(label="결과 3D mesh")

        btn.click(
            fn=image_to_3d,
            inputs=[image_in, remove_bg_checkbox],
            outputs=[model_out],
            api_name="predict",  # ← gradio_client로 호출할 API 엔드포인트
        )
    return demo


demo = build_ui()

if __name__ == "__main__":
    demo.queue(max_size=10).launch(
        server_name="0.0.0.0",
        server_port=int(os.environ.get("PORT", 7860)),
    )
