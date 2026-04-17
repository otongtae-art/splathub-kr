"""Top-level orchestrator for a single photo→splat conversion.

The Gradio / FastAPI handler should only call `run_photo_to_splat`. All error
handling, logging, and intermediate artifact layout lives here.
"""

from __future__ import annotations

import logging
import tempfile
import traceback
from pathlib import Path

from .compression import ply_to_spz
from .freesplatter import generate_splat_ply
from .preprocess import load_as_tensor_stack, normalize_images
from .types import PipelineError, PipelineInput, PipelineOutput
from .vggt import estimate_poses

logger = logging.getLogger(__name__)


def run_photo_to_splat(inp: PipelineInput) -> PipelineOutput:
    """Run VGGT → FreeSplatter → splat-transform on the given inputs.

    Fails fast with a `PipelineError` carrying a stable `code` that the API
    layer translates to a user-friendly Korean message.
    """
    if not inp.image_paths:
        raise PipelineError("empty_input", "사진이 없습니다.")
    if len(inp.image_paths) < 1:
        raise PipelineError(
            "too_few_images",
            "최소 한 장 이상의 사진이 필요합니다. 가능하면 대상 주변을 3–8각도에서 촬영해 주세요.",
        )

    workdir = Path(tempfile.mkdtemp(prefix=f"splathub_{inp.job_id}_"))
    try:
        # 1) Normalize (resize + EXIF fix)
        norm_dir = workdir / "normalized"
        normalized = normalize_images(inp.image_paths, inp.resize_px, str(norm_dir))

        # 2) Load as tensor stack (N, 3, H, W)
        tensor = load_as_tensor_stack(normalized)

        # 3) VGGT pose estimation
        try:
            poses = estimate_poses(tensor)
        except Exception as e:
            raise PipelineError("pose_failed", "카메라 각도를 추정하지 못했습니다. 대상 주변을 더 넓게 촬영해 주세요.") from e

        # 4) FreeSplatter → .ply
        ply_path = str(workdir / "model.ply")
        try:
            gaussian_count = generate_splat_ply(tensor, poses, ply_path)
        except Exception as e:
            raise PipelineError("splat_failed", "3D 모델 생성 중 오류가 발생했습니다.") from e

        # 5) .ply → .spz compression
        spz_path = str(workdir / "model.spz")
        try:
            spz_size = ply_to_spz(ply_path, spz_path, sh_degree=1)
        except Exception as e:
            raise PipelineError("compression_failed", "압축 단계에서 오류가 발생했습니다.") from e

        return PipelineOutput(
            spz_path=spz_path,
            ply_path=ply_path,
            gaussian_count=gaussian_count,
            spz_size_bytes=spz_size,
            ply_size_bytes=Path(ply_path).stat().st_size,
        )
    except PipelineError:
        raise
    except Exception as e:
        logger.error("[orchestrator] unexpected failure: %s\n%s", e, traceback.format_exc())
        raise PipelineError("unknown", "알 수 없는 오류가 발생했습니다.") from e
