"""SplatHub → TRELLIS fallback on Modal.

Modal 에 배포되는 FastAPI 앱. HF Space 의 인증 ZeroGPU 쿼터가 소진됐을 때
브라우저가 자동으로 이쪽으로 fallback 한다.

핵심:
- GPU 를 Modal 에서 돌리지 않음 — Modal 은 "다른 IP 에서 나가는 proxy" 역할만
- Modal 컨테이너에서 microsoft/TRELLIS 를 **익명**으로 호출
- Vercel IP 풀과 다른 IP 에서 나가므로 익명 쿼터가 독립적으로 계산됨
- Modal 과금: CPU only, ~$0.0005/call, $30 크레딧이 수천 건 감당

배포:
  pip install modal>=0.70.0
  modal token new
  modal deploy app.py

배포 성공 시 출력되는 URL (아래는 예시):
  https://<USER>--splathub-trellis-fallback-app.modal.run

이 URL 이 실질적 endpoint base. 라우트:
  POST /convert   JSON {image_b64} → JSON {ok, glb_b64, size}
  GET  /health    헬스체크
"""

from __future__ import annotations

import os
import tempfile
import traceback

import modal

app = modal.App("splathub-trellis-fallback")

# CPU only 이미지 — GPU 쓸 일 없음
image = (
    modal.Image.debian_slim(python_version="3.11")
    .pip_install(
        "gradio_client==1.3.0",
        "huggingface_hub==0.26.5",
        "fastapi[standard]>=0.115",
        "python-multipart",
    )
)

TRELLIS_SPACE_ID = "microsoft/TRELLIS"


# ─── FastAPI app (전체 라우팅을 여기서) ─────────────────────────────────

def create_fastapi_app():
    """FastAPI 앱을 Modal 컨테이너 안에서 생성 — CORS + 라우트 정의."""
    import base64

    from fastapi import FastAPI, HTTPException
    from fastapi.middleware.cors import CORSMiddleware
    from pydantic import BaseModel

    from gradio_client import Client, handle_file

    web = FastAPI(title="SplatHub TRELLIS Fallback")

    # 브라우저에서 직접 호출하므로 CORS 모두 open
    web.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_methods=["GET", "POST", "OPTIONS"],
        allow_headers=["*"],
        max_age=3600,
    )

    class ConvertRequest(BaseModel):
        image_b64: str

    @web.get("/health")
    def health():
        return {
            "status": "ok",
            "service": "splathub-trellis-fallback",
            "target": TRELLIS_SPACE_ID,
            "mode": "anonymous-proxy",
        }

    @web.post("/convert")
    def convert(req: ConvertRequest):
        """이미지(base64) → TRELLIS 익명 호출 → .glb(base64)."""
        if not req.image_b64:
            raise HTTPException(status_code=400, detail="image_b64 required")

        try:
            image_bytes = base64.b64decode(req.image_b64)
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"invalid base64: {e}")

        with tempfile.NamedTemporaryFile(suffix=".jpg", delete=False) as tf:
            tf.write(image_bytes)
            tmp_path = tf.name

        try:
            # 익명 호출 — token 생략. Modal IP 에서 나가므로 Vercel 쿼터와 독립.
            client = Client(TRELLIS_SPACE_ID)

            client.predict(api_name="/start_session")

            pre = client.predict(
                image=handle_file(tmp_path),
                api_name="/preprocess_image",
            )

            client.predict(
                image=handle_file(pre),
                multiimages=[],
                seed=0,
                ss_guidance_strength=7.5,
                ss_sampling_steps=12,
                slat_guidance_strength=3.0,
                slat_sampling_steps=12,
                multiimage_algo="stochastic",
                api_name="/image_to_3d",
            )

            glb = client.predict(
                mesh_simplify=0.95,
                texture_size=1024,
                api_name="/extract_glb",
            )
            glb_path = glb[0] if isinstance(glb, (list, tuple)) else glb

            with open(glb_path, "rb") as f:
                glb_data = f.read()

            return {
                "ok": True,
                "glb_b64": base64.b64encode(glb_data).decode("ascii"),
                "size": len(glb_data),
                "backend": "modal-fallback",
            }

        except Exception as e:
            tb = traceback.format_exc()
            print(f"[modal-fallback] conversion failed: {e}\n{tb}")
            return {
                "ok": False,
                "error": str(e)[:500],
                "backend": "modal-fallback",
            }
        finally:
            try:
                os.unlink(tmp_path)
            except Exception:
                pass

    return web


# ─── Modal 에 web endpoint 하나만 expose ──────────────────────────────

@app.function(
    image=image,
    timeout=300,
    scaledown_window=120,  # 2분 warm keep — 연속 호출 시 빠름
    min_containers=0,      # idle 시 scale to zero, $0 보장
)
@modal.asgi_app(label="app")
def fastapi_app():
    """Modal 이 이 ASGI 앱을 HTTPS endpoint 로 노출."""
    return create_fastapi_app()
