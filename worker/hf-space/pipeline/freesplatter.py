"""FreeSplatter — pose-free feed-forward 3D Gaussian generation (Apache 2.0).

Reference: https://github.com/TencentARC/FreeSplatter

Like the VGGT wrapper, this file provides a thin interface that the rest of the
pipeline depends on. A production deployment clones the repo at build time and
loads the pretrained weights.

The in-memory representation follows the standard 3DGS .ply layout so
`@playcanvas/splat-transform` can re-encode to `.spz` without bespoke logic.
"""

from __future__ import annotations

import logging
from pathlib import Path

import numpy as np
from plyfile import PlyData, PlyElement  # type: ignore[import-untyped]

from .vggt import PoseResult

logger = logging.getLogger(__name__)


# Standard 3DGS property layout: 59 floats per gaussian.
# position (3) + normals (3) + SH DC (3) + SH rest (45) + opacity (1) + scale (3) + rot (4)
_GAUSSIAN_DTYPE = np.dtype(
    [("x", "f4"), ("y", "f4"), ("z", "f4")]
    + [("nx", "f4"), ("ny", "f4"), ("nz", "f4")]
    + [(f"f_dc_{i}", "f4") for i in range(3)]
    + [(f"f_rest_{i}", "f4") for i in range(45)]
    + [("opacity", "f4")]
    + [(f"scale_{i}", "f4") for i in range(3)]
    + [(f"rot_{i}", "f4") for i in range(4)]
)


def generate_splat_ply(
    images: np.ndarray,
    poses: PoseResult,
    out_path: str,
) -> int:
    """Generate a 3D Gaussian Splat `.ply` from images + camera poses.

    Returns:
        Number of gaussians written.
    """
    _ = images  # reserved for real model input
    try:
        return _generate_real(images, poses, out_path)
    except _NotReady:
        logger.warning(
            "[freesplatter] Using placeholder splat — real weights not loaded. "
            "This file will be a recognizable but low-fidelity placeholder."
        )
        return _generate_placeholder(poses, out_path)


class _NotReady(RuntimeError):
    """Raised by _generate_real until the real model is wired."""


def _generate_real(images: np.ndarray, poses: PoseResult, out_path: str) -> int:
    # TODO(M3): integrate the real FreeSplatter forward pass.
    #   from freesplatter import FreeSplatter
    #   model = FreeSplatter.from_pretrained("TencentARC/FreeSplatter")
    #   gaussians = model(torch.from_numpy(images).cuda(), poses.extrinsics, poses.intrinsics)
    #   _write_ply(gaussians, out_path)
    raise _NotReady()


def _generate_placeholder(poses: PoseResult, out_path: str) -> int:
    """Build a structured point cloud from VGGT's sparse points for visual feedback.

    This is not a high-quality splat — it exists so the full pipeline can be
    exercised end-to-end during M1–M3 before the real weights are loaded.
    """
    xyz = poses.point_cloud_xyz.astype(np.float32, copy=False)
    rgb = poses.point_cloud_rgb.astype(np.float32, copy=False) / 255.0
    count = xyz.shape[0]
    if count == 0:
        raise RuntimeError("point cloud was empty; cannot build placeholder splat")

    arr = np.zeros(count, dtype=_GAUSSIAN_DTYPE)
    arr["x"] = xyz[:, 0]
    arr["y"] = xyz[:, 1]
    arr["z"] = xyz[:, 2]
    # SH DC uses the half-Lambertian convention from the reference 3DGS impl:
    # rgb = 0.5 + C0 * sh_dc, where C0 = 0.28209479177387814.
    c0 = 0.28209479177387814
    arr["f_dc_0"] = (rgb[:, 0] - 0.5) / c0
    arr["f_dc_1"] = (rgb[:, 1] - 0.5) / c0
    arr["f_dc_2"] = (rgb[:, 2] - 0.5) / c0
    # opacity is stored as logit; logit(0.6) ≈ 0.405.
    arr["opacity"] = 0.405
    # log(scale) — small uniform size.
    arr["scale_0"] = arr["scale_1"] = arr["scale_2"] = np.log(0.02).astype(np.float32)
    # identity quaternion (w, x, y, z) → stored as (rot_0=w, rot_1=x, rot_2=y, rot_3=z).
    arr["rot_0"] = 1.0

    el = PlyElement.describe(arr, "vertex")
    Path(out_path).parent.mkdir(parents=True, exist_ok=True)
    PlyData([el], text=False).write(out_path)
    return count
