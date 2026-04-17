"""HF Space Gradio app — the 1st-priority free GPU worker for SplatHub-KR.

The Space exposes a single `predict` function decorated with `@spaces.GPU`
(ZeroGPU). The SplatHub web app invokes it via `gradio_client`. When a
`callback_url` is supplied, the worker also POSTs a HMAC-signed payload to the
web app so status transitions reach Supabase Realtime without requiring the
caller to poll.

Gradio was chosen (over FastAPI-only) because ZeroGPU's GPU scheduling is
tightly coupled to the Gradio event loop. Exposing a FastAPI route inside the
same process would bypass that scheduler.
"""

from __future__ import annotations

import hashlib
import hmac
import json
import logging
import os
import tempfile
import time
from pathlib import Path
from typing import Any

import gradio as gr
import httpx

try:
    import spaces  # type: ignore[import-not-found]
except ImportError:  # pragma: no cover — only available on HF Space
    spaces = None  # type: ignore[assignment]

from pipeline import run_photo_to_splat
from pipeline.types import PipelineError, PipelineInput

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
logger = logging.getLogger("splathub.worker")

# ZeroGPU decorator — no-op when running locally without the `spaces` package.
GPU_DURATION_SECONDS = int(os.environ.get("SPLATHUB_GPU_DURATION", "90"))


def _gpu_decorator(fn: Any) -> Any:
    if spaces is None:
        return fn
    return spaces.GPU(duration=GPU_DURATION_SECONDS)(fn)


# ───────────────────────── Callback signing ─────────────────────────

CALLBACK_SECRET = os.environ.get("JOB_CALLBACK_SECRET", "").encode("utf-8")


def _sign_callback(body: bytes) -> str:
    if not CALLBACK_SECRET:
        return ""
    return hmac.new(CALLBACK_SECRET, body, hashlib.sha256).hexdigest()


async def _post_callback(url: str, payload: dict) -> None:
    body = json.dumps(payload).encode("utf-8")
    signature = _sign_callback(body)
    async with httpx.AsyncClient(timeout=10.0) as client:
        await client.post(
            url,
            content=body,
            headers={
                "content-type": "application/json",
                "x-splathub-signature": signature,
            },
        )


# ───────────────────────── R2 upload ─────────────────────────


def _upload_to_r2(local_path: str, key: str) -> str | None:
    """Upload to R2 (S3 API). Returns the public URL, or None if not configured.

    Configuration is intentionally optional so the Gradio demo UI still works
    on a fresh Space without any environment variables set.
    """
    account = os.environ.get("R2_ACCOUNT_ID")
    access = os.environ.get("R2_ACCESS_KEY_ID")
    secret = os.environ.get("R2_SECRET_ACCESS_KEY")
    bucket = os.environ.get("R2_BUCKET")
    public_base = os.environ.get("R2_PUBLIC_BASE")
    if not all([account, access, secret, bucket, public_base]):
        logger.info("[r2] skipping upload — R2 env vars not set")
        return None

    try:
        import boto3  # type: ignore[import-not-found]
    except ImportError:
        logger.warning("[r2] boto3 not installed; skipping upload")
        return None

    endpoint = f"https://{account}.r2.cloudflarestorage.com"
    client = boto3.client(
        "s3",
        endpoint_url=endpoint,
        aws_access_key_id=access,
        aws_secret_access_key=secret,
        region_name="auto",
    )
    with open(local_path, "rb") as fh:
        client.put_object(Bucket=bucket, Key=key, Body=fh.read())
    return f"{public_base}/{key}"


# ───────────────────────── Gradio entry point ─────────────────────────


@_gpu_decorator
def predict(
    image_paths: list[str] | None,
    job_id: str = "",
    callback_url: str = "",
) -> tuple[str, dict]:
    """Run the photo→splat pipeline on uploaded files.

    Args:
        image_paths: Gradio provides local paths in `/tmp/gradio/...`.
        job_id: SplatHub web app's jobs.id (UUID). Blank for ad-hoc UI runs.
        callback_url: optional URL to POST the completion payload to.

    Returns:
        Tuple of (spz_file_path_for_download, json_summary).
    """
    if not image_paths:
        raise gr.Error("사진을 1장 이상 올려주세요.")

    inp = PipelineInput(
        job_id=job_id or f"ui_{int(time.time())}",
        image_paths=list(image_paths),
    )

    try:
        out = run_photo_to_splat(inp)
    except PipelineError as e:
        # Surface a clean user-facing message and let the caller decide how to retry.
        raise gr.Error(f"{e.code}: {e.message}") from e

    spz_url: str | None = None
    if job_id:
        key = f"jobs/{job_id}/model.spz"
        spz_url = _upload_to_r2(out.spz_path, key)

    result = {
        "job_id": inp.job_id,
        "gaussian_count": out.gaussian_count,
        "spz_size_bytes": out.spz_size_bytes,
        "spz_url": spz_url,
        "ply_size_bytes": out.ply_size_bytes,
    }

    # Fire-and-forget callback (best-effort). Web app is the source of truth.
    if callback_url:
        try:
            import asyncio

            asyncio.run(
                _post_callback(
                    callback_url,
                    {
                        "job_id": inp.job_id,
                        "status": "done" if spz_url else "uploading",
                        "progress": 100 if spz_url else 95,
                        "result": {
                            "spz_url": spz_url or "",
                            "thumbnail_url": "",
                            "preview_urls": [],
                            "gaussian_count": out.gaussian_count,
                            "spz_size_bytes": out.spz_size_bytes,
                            "ply_size_bytes": out.ply_size_bytes,
                        },
                    },
                )
            )
        except Exception as e:  # noqa: BLE001
            logger.warning("[callback] failed: %s", e)

    return out.spz_path, result


# ───────────────────────── Gradio UI ─────────────────────────

DESCRIPTION = """
# SplatHub Worker · Free Tier

사진 1-5장을 올리면 3D Gaussian Splat (`.spz`) 로 변환합니다.
최상의 결과를 위해 **대상 주변을 천천히 한 바퀴 돌며** 촬영한 사진들을 올려주세요.

> 이 Space는 [SplatHub-KR](https://splathub.pages.dev) 의 1순위 무료 변환 워커입니다.
"""


def _build_interface() -> gr.Blocks:
    with gr.Blocks(title="SplatHub Worker") as demo:
        gr.Markdown(DESCRIPTION)
        with gr.Row():
            with gr.Column(scale=1):
                images = gr.File(
                    label="사진 (여러 장 선택)",
                    file_count="multiple",
                    file_types=["image"],
                )
                job_id = gr.Textbox(
                    label="job_id (선택)",
                    placeholder="SplatHub 웹앱이 UUID를 넣습니다",
                    visible=False,
                )
                callback_url = gr.Textbox(
                    label="callback_url (선택)",
                    placeholder="https://splathub.pages.dev/api/jobs/UUID/callback",
                    visible=False,
                )
                btn = gr.Button("변환", variant="primary")
            with gr.Column(scale=1):
                spz_file = gr.File(label=".spz 결과 (다운로드)")
                summary = gr.JSON(label="요약")

        btn.click(predict, inputs=[images, job_id, callback_url], outputs=[spz_file, summary])
    return demo


demo = _build_interface()

if __name__ == "__main__":
    demo.queue().launch(server_name="0.0.0.0", server_port=int(os.environ.get("PORT", 7860)))
