"""
SplatHub GPU Worker — HF Space ZeroGPU(H200) 무료 3D 재구성 파이프라인.

TripoSR은 공식적으로 pip 패키지가 아니므로 앱 시작 시 `git clone`으로 소스를
받아 sys.path에 추가한 뒤 `from tsr.system import TSR`로 import 한다.
( hysts/TripoSR, stabilityai/TripoSR 등 공식 HF Space 배포와 같은 방식 )
"""

from __future__ import annotations

import os
import subprocess
import sys
import logging
import tempfile
from pathlib import Path

# ─── TripoSR 소스 설치 (최초 실행 시에만) ─────────────────────────────
TRIPOSR_DIR = "/home/user/triposr"
if not os.path.isdir(TRIPOSR_DIR):
    print(f"[setup] cloning TripoSR to {TRIPOSR_DIR}")
    subprocess.run(
        ["git", "clone", "--depth", "1", "https://github.com/VAST-AI-Research/TripoSR.git", TRIPOSR_DIR],
        check=True,
    )
sys.path.insert(0, TRIPOSR_DIR)

import gradio as gr
import numpy as np
import torch
from PIL import Image

try:
    import spaces  # type: ignore[import-not-found]
except ImportError:  # pragma: no cover
    spaces = None  # type: ignore[assignment]

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)
logger = logging.getLogger("splathub.worker")

GPU_DURATION_SECONDS = int(os.environ.get("SPLATHUB_GPU_DURATION", "60"))


def gpu_required(fn):
    if spaces is None:
        return fn
    return spaces.GPU(duration=GPU_DURATION_SECONDS)(fn)


# ─── 모델 로더 ─────────────────────────────────────────────────────────

_bg_session = None
_triposr_model = None


def get_bg_session():
    """rembg(U2Net 기반, MIT) 배경 제거 세션."""
    global _bg_session
    if _bg_session is not None:
        return _bg_session
    from rembg import new_session
    _bg_session = new_session("u2net")
    return _bg_session


def get_triposr():
    """TripoSR 모델 초기화. 첫 호출 시 HF에서 weight 다운로드."""
    global _triposr_model
    if _triposr_model is not None:
        return _triposr_model
    from tsr.system import TSR  # type: ignore[import-not-found]
    device = "cuda" if torch.cuda.is_available() else "cpu"
    logger.info("[triposr] loading weights on %s", device)
    model = TSR.from_pretrained(
        "stabilityai/TripoSR",
        config_name="config.yaml",
        weight_name="model.ckpt",
    )
    model.renderer.set_chunk_size(8192)
    model.to(device)
    model.eval()
    _triposr_model = model
    return model


# ─── 전처리 ────────────────────────────────────────────────────────────


def remove_background_and_crop(image: Image.Image, padding: float = 0.1) -> Image.Image:
    """RMBG 배경 제거 + alpha 기반 중앙 정사각 크롭 + 512 리사이즈."""
    try:
        from rembg import remove
        session = get_bg_session()
        image_rgba = remove(image.convert("RGBA"), session=session)
    except Exception as e:
        logger.warning("[rembg] fallback to original: %s", e)
        image_rgba = image.convert("RGBA")

    if image_rgba.mode == "RGBA":
        alpha = np.array(image_rgba.split()[-1])
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
            r = min(image_rgba.width, cx + half)
            b = min(image_rgba.height, cy + half)
            image_rgba = image_rgba.crop((l, t, r, b))

    return image_rgba.resize((512, 512), Image.LANCZOS)


# ─── 메인 함수 ─────────────────────────────────────────────────────────


@gpu_required
def image_to_3d(image_path: str, remove_bg: bool = True) -> str:
    """단일 이미지 → 3D mesh (.glb) 파일 경로."""
    logger.info("[worker] input=%s, remove_bg=%s", image_path, remove_bg)
    image = Image.open(image_path).convert("RGB")

    if remove_bg:
        image = remove_background_and_crop(image)
    else:
        # 크롭만 수행
        s = min(image.width, image.height)
        l = (image.width - s) // 2
        t = (image.height - s) // 2
        image = image.crop((l, t, l + s, t + s)).resize((512, 512), Image.LANCZOS)

    model = get_triposr()
    with torch.no_grad():
        scene_codes = model([image], device=model.device)
        meshes = model.extract_mesh(scene_codes, has_vertex_color=True, resolution=256)

    mesh = meshes[0]
    out_path = os.path.join(tempfile.gettempdir(), f"splathub_{os.getpid()}.glb")
    mesh.export(out_path, file_type="glb")
    logger.info("[worker] exported %s (%d bytes)", out_path, os.path.getsize(out_path))
    return out_path


# ─── Gradio UI ─────────────────────────────────────────────────────────


DESCRIPTION = """
# SplatHub Worker — Single Image → 3D Mesh

사진 한 장을 업로드하면 **실제 객체 모양의 3D textured mesh (.glb)** 를
생성합니다. NVIDIA H200 (ZeroGPU) 에서 약 3-5초 소요.

- **모델**: TripoSR (Stability AI, MIT)
- **배경 제거**: rembg U2Net (MIT)
- **출력**: .glb (Three.js / Blender / Unity 모두 호환)
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
            api_name="predict",
        )
    return demo


demo = build_ui()

if __name__ == "__main__":
    demo.queue(max_size=10).launch(
        server_name="0.0.0.0",
        server_port=int(os.environ.get("PORT", 7860)),
    )
