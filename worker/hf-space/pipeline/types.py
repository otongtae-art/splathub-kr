"""Shared dataclasses for the worker pipeline."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Literal


JobStatus = Literal[
    "queued",
    "preprocessing",
    "pose_estimation",
    "training",
    "postprocessing",
    "uploading",
    "done",
    "failed",
    "canceled",
]


@dataclass
class PipelineInput:
    """Resolved input for a single conversion job."""

    job_id: str
    image_paths: list[str]  # local paths on the Space worker
    resize_px: int = 512


@dataclass
class PipelineOutput:
    """Artifacts produced by a successful run."""

    spz_path: str
    ply_path: str | None = None
    sog_path: str | None = None
    thumbnail_path: str | None = None
    preview_paths: list[str] = field(default_factory=list)
    gaussian_count: int = 0
    spz_size_bytes: int = 0
    ply_size_bytes: int | None = None


@dataclass
class PipelineError(Exception):
    """Structured error so the API layer can map to a stable error_code."""

    code: str
    message: str

    def __str__(self) -> str:  # pragma: no cover - trivial
        return f"{self.code}: {self.message}"
