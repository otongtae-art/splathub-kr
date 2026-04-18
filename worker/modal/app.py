"""SplatHub → TRELLIS fallback on Modal.

Modal 에 배포되는 FastAPI 앱. HF Space 의 인증 ZeroGPU 쿼터가 소진됐을 때
브라우저가 자동으로 이쪽으로 fallback 한다.

핵심 설계:
- GPU 를 Modal 에서 돌리지 않음 — Modal 은 "얇은 Python 프록시" 역할만
- microsoft/TRELLIS 를 **다른 HF 계정의 토큰으로 authenticated 호출**
  → 1순위(HF Space, floerw 계정) 와 **완전히 독립된 daily quota 풀** 확보
  → 두 경로가 각각 하루치 쿼터를 갖게 되어 가용성 × 2
- Modal 과금: CPU only, ~$0.0005/call, $30 크레딧이 수천 건 감당

Modal Secret:
  splathub-hf-token → HF_TOKEN=<stjnstl 계정 토큰>

배포:
  modal secret create splathub-hf-token HF_TOKEN=hf_xxxxxx
  modal deploy app.py

엔드포인트 URL 형식:
  https://<USER>--app.modal.run
  라우트:
    POST /convert   JSON {image_b64} → JSON {ok, glb_b64, size}
    GET  /health    헬스체크
"""

from __future__ import annotations

import os
import tempfile
import traceback

import modal

app = modal.App("splathub-trellis-fallback")

# CPU only 이미지 — GPU 는 업스트림(TRELLIS Space)에서 돌림
# BiRefNet 전처리를 위해 rembg + onnxruntime + Pillow 추가
image = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install("libgl1", "libglib2.0-0", "libgomp1")
    .pip_install(
        "gradio_client==1.3.0",
        "huggingface_hub==0.26.5",
        "fastapi[standard]>=0.115",
        "python-multipart",
        "rembg==2.0.61",
        "Pillow==10.4.0",
        "onnxruntime==1.19.2",
    )
)

TRELLIS_SPACE_ID = "microsoft/TRELLIS.2"
TRELLIS_RESOLUTION = "1024"  # "512" | "1024" | "1536"


# ─── BiRefNet 배경 제거 헬퍼 ───────────────────────────────────────────

_rembg_session = None


def _get_rembg():
    """rembg + BiRefNet-general-lite (2024, MIT) 세션. lazy init."""
    global _rembg_session
    if _rembg_session is None:
        from rembg import new_session

        print("[modal] loading BiRefNet-general-lite (first time ~200MB)")
        _rembg_session = new_session("birefnet-general-lite")
        print("[modal] BiRefNet ready")
    return _rembg_session


def _remove_bg_to_rgba(image_path: str) -> str:
    """이미지에서 배경 제거 → RGBA PNG. 1.2x 패딩 + 정사각 중앙 배치."""
    from PIL import Image
    from rembg import remove

    session = _get_rembg()
    input_img = Image.open(image_path).convert("RGB")
    output_img = remove(input_img, session=session, alpha_matting=False)

    # 1.2x 패딩 + 정사각 1024 중앙
    alpha = output_img.split()[-1]
    bbox = alpha.getbbox()
    if bbox is None:
        canvas_img = output_img.resize((1024, 1024), Image.LANCZOS)
    else:
        bbox_w = bbox[2] - bbox[0]
        bbox_h = bbox[3] - bbox[1]
        bbox_size = max(bbox_w, bbox_h)
        padded = int(bbox_size * 1.2)
        cx = (bbox[0] + bbox[2]) // 2
        cy = (bbox[1] + bbox[3]) // 2
        canvas_img = Image.new("RGBA", (padded, padded), (0, 0, 0, 0))
        canvas_img.paste(output_img, (padded // 2 - cx, padded // 2 - cy), output_img)
        canvas_img = canvas_img.resize((1024, 1024), Image.LANCZOS)

    out_path = image_path.rsplit(".", 1)[0] + "_rgba.png"
    canvas_img.save(out_path, "PNG")
    print(f"[modal] bg removed: {image_path} → {out_path}")
    return out_path


# ─── FastAPI app (전체 라우팅을 여기서) ─────────────────────────────────

def create_fastapi_app():
    """FastAPI 앱을 Modal 컨테이너 안에서 생성 — CORS + 라우트 정의."""
    import base64

    from fastapi import Body, FastAPI, HTTPException
    from fastapi.middleware.cors import CORSMiddleware

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

    @web.get("/health")
    def health():
        return {
            "status": "ok",
            "service": "splathub-trellis-fallback",
            "target": TRELLIS_SPACE_ID,
            "mode": "anonymous-proxy",
        }

    @web.post("/convert")
    def convert(payload: dict = Body(...)):
        """이미지(base64) → TRELLIS 익명 호출 → .glb(base64).

        Body JSON: {"image_b64": "<base64 jpeg/png>"}
        Body(...) 강제로 query 파싱 방지 — FastAPI 0.136+ 에서 필요.
        """
        image_b64 = (payload or {}).get("image_b64")
        if not image_b64:
            raise HTTPException(status_code=400, detail="image_b64 required")

        try:
            image_bytes = base64.b64decode(image_b64)
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"invalid base64: {e}")

        with tempfile.NamedTemporaryFile(suffix=".jpg", delete=False) as tf:
            tf.write(image_bytes)
            tmp_path = tf.name

        try:
            # 0) BiRefNet 으로 배경 제거 — TRELLIS 내장 U2Net(2020) 우회
            try:
                preprocessed_path = _remove_bg_to_rgba(tmp_path)
            except Exception as e:
                print(f"[modal] bg removal failed, using raw: {e}")
                preprocessed_path = tmp_path

            # stjnstl 계정 토큰으로 authenticated 호출 — floerw(HF Space 1순위)
            # 와 완전히 독립된 daily quota 풀 확보.
            hf_token = os.environ.get("HF_TOKEN")
            if hf_token:
                client = Client(TRELLIS_SPACE_ID, hf_token=hf_token)
            else:
                # Secret 미설정 fallback — 익명 (쿼터 공유, 거의 실패)
                client = Client(TRELLIS_SPACE_ID)

            client.predict(api_name="/start_session")

            pre = client.predict(
                image=handle_file(preprocessed_path),
                api_name="/preprocess_image",
            )

            # TRELLIS.2 의 3-stage 파이프라인: sparse + shape_slat + tex_slat
            client.predict(
                image=handle_file(pre),
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

            glb = client.predict(
                decimation_target=300000,
                texture_size=2048,
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
    secrets=[modal.Secret.from_name("splathub-hf-token")],
    timeout=300,
    scaledown_window=120,  # 2분 warm keep — 연속 호출 시 빠름
    min_containers=0,      # idle 시 scale to zero, $0 보장
)
@modal.asgi_app(label="app")
def fastapi_app():
    """Modal 이 이 ASGI 앱을 HTTPS endpoint 로 노출."""
    return create_fastapi_app()
