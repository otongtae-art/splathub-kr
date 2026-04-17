"""VGGT-1B-Commercial wrapper — pose & depth estimation in a single forward pass.

Only the *commercial* weights variant is permitted. The stock VGGT-1B checkpoint
is research-only and must never be referenced from this file.

The real integration will clone facebookresearch/vggt at build time and load
checkpoints from the Hugging Face hub with a commercial-license-gated token.
Here we provide a thin wrapper with a clean signature so the rest of the
pipeline can be developed and tested against a mock.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass

import numpy as np

logger = logging.getLogger(__name__)


@dataclass
class PoseResult:
    """Per-view extrinsics + intrinsics + a shared sparse point cloud."""

    intrinsics: np.ndarray  # (N, 3, 3)
    extrinsics: np.ndarray  # (N, 4, 4) world-to-camera
    point_cloud_xyz: np.ndarray  # (P, 3) — world coords
    point_cloud_rgb: np.ndarray  # (P, 3) — uint8
    depth_maps: np.ndarray  # (N, H, W) float32


def estimate_poses(images: np.ndarray) -> PoseResult:
    """Run VGGT-1B-Commercial on a (N, 3, H, W) float tensor.

    Raises:
        RuntimeError: if the commercial weights are unavailable at runtime.
    """
    n, c, h, w = images.shape
    if c != 3:
        raise ValueError(f"expected 3-channel RGB images, got {c}")
    if n < 1:
        raise ValueError("at least one image is required")

    # TODO(M3): wire in real inference.
    # Pseudocode sketch:
    #   from vggt import VGGT
    #   model = VGGT.from_pretrained("facebook/VGGT-1B-Commercial", token=os.environ["HF_TOKEN"])
    #   with torch.inference_mode():
    #       out = model(torch.from_numpy(images).cuda())
    #   return PoseResult(
    #       intrinsics=out.K.cpu().numpy(),
    #       extrinsics=out.T.cpu().numpy(),
    #       point_cloud_xyz=out.points.cpu().numpy(),
    #       point_cloud_rgb=out.colors.cpu().numpy(),
    #       depth_maps=out.depth.cpu().numpy(),
    #   )

    logger.warning(
        "[vggt] Using placeholder pose estimate. Wire real weights before production."
    )

    # Placeholder: evenly-spaced cameras on a unit circle, identity depth.
    angles = np.linspace(0.0, 2.0 * np.pi, n, endpoint=False, dtype=np.float32)
    extrinsics = np.stack([_circle_extrinsic(a) for a in angles], axis=0)
    intrinsics = np.broadcast_to(
        np.array([[max(h, w), 0, w / 2], [0, max(h, w), h / 2], [0, 0, 1]], dtype=np.float32),
        (n, 3, 3),
    ).copy()
    depth_maps = np.ones((n, h, w), dtype=np.float32)
    point_cloud_xyz = np.random.default_rng(42).normal(0.0, 0.3, size=(2048, 3)).astype(np.float32)
    point_cloud_rgb = np.full((2048, 3), 180, dtype=np.uint8)

    return PoseResult(intrinsics, extrinsics, point_cloud_xyz, point_cloud_rgb, depth_maps)


def _circle_extrinsic(angle: float, radius: float = 2.0) -> np.ndarray:
    c, s = float(np.cos(angle)), float(np.sin(angle))
    # Camera at (radius*cos, 0, radius*sin), looking at origin.
    eye = np.array([radius * c, 0.0, radius * s], dtype=np.float32)
    forward = -eye / (np.linalg.norm(eye) + 1e-6)
    up = np.array([0.0, 1.0, 0.0], dtype=np.float32)
    right = np.cross(forward, up)
    right /= np.linalg.norm(right) + 1e-6
    up = np.cross(right, forward)
    rot = np.stack([right, up, -forward], axis=0)  # world→cam
    mat = np.eye(4, dtype=np.float32)
    mat[:3, :3] = rot
    mat[:3, 3] = -rot @ eye
    return mat
