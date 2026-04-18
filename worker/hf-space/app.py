"""SplatHub → TRELLIS Thin Proxy Space.

우리 Vercel Next.js 앱에서 직접 호출할 수 있는 REST 엔드포인트를 노출.
TRELLIS Space (microsoft/TRELLIS) 의 Gradio API 를 Python gradio_client 로 감싸서
"이미지 1장 → .glb 바이너리" 원샷 API 로 변환.

엔드포인트:
  POST /api/convert    multipart form { image: File } → model/gltf-binary
  GET  /api/health     { status: "ok", target: "microsoft/TRELLIS" }
  GET  /                Gradio UI (테스트용)

환경변수 (HF Space Settings → Variables):
  HF_TOKEN    필수. microsoft/TRELLIS 를 ZeroGPU 우선순위로 호출.

왜 이 Space 가 필요한가:
  - Vercel Node 의 @gradio/client JS 는 Gradio 4 Space 와 호환성 이슈로
    "An error occurred" 만 리턴하고 실제 에러 유실.
  - Python gradio_client 는 정상 동작 (검증됨, 14.8s 에 성공).
  - Vercel Python serverless 는 Hobby tier 10s timeout 으로 불가.
  - → 가장 간단한 해결은 우리 자체 HF Space 를 Python wrapper 로 두는 것.
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

TRELLIS_SPACE_ID = os.environ.get("TRELLIS_SPACE_ID", "microsoft/TRELLIS")


# ─── TRELLIS 클라이언트 연결 (lazy) ────────────────────────────────────

_trellis_client: Client | None = None


def get_trellis() -> Client:
    global _trellis_client
    if _trellis_client is None:
        logger.info("connecting to %s", TRELLIS_SPACE_ID)
        _trellis_client = Client(TRELLIS_SPACE_ID, token=HF_TOKEN)
    return _trellis_client


# ─── 핵심 변환 함수 ────────────────────────────────────────────────────


def convert_image_to_glb(image_path: str) -> str:
    """단일 이미지 파일 → .glb 파일 경로.

    TRELLIS 의 4-step 파이프라인을 순차 실행.
    """
    client = get_trellis()
    logger.info("[step 1/4] start_session")
    client.predict(api_name="/start_session")

    logger.info("[step 2/4] preprocess_image")
    preprocessed = client.predict(
        image=handle_file(image_path),
        api_name="/preprocess_image",
    )

    logger.info("[step 3/4] image_to_3d (GPU inference, 15-60s)")
    client.predict(
        image=handle_file(preprocessed),
        multiimages=[],
        seed=0,
        ss_guidance_strength=7.5,
        ss_sampling_steps=12,
        slat_guidance_strength=3.0,
        slat_sampling_steps=12,
        multiimage_algo="stochastic",
        api_name="/image_to_3d",
    )

    logger.info("[step 4/4] extract_glb")
    glb = client.predict(
        mesh_simplify=0.95,
        texture_size=1024,
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
