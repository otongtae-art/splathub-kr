"""Image preprocessing: resize, EXIF rotation fix, optional background removal.

All operations operate on local files so the rest of the pipeline can use plain
path strings. ZeroGPU Spaces have a tmpfs at /tmp with ~10 GB.
"""

from __future__ import annotations

import os
from pathlib import Path

import numpy as np
from PIL import Image, ImageOps


def normalize_images(image_paths: list[str], max_px: int, out_dir: str) -> list[str]:
    """Resize, EXIF-rotate, and re-save each input as a uniform JPEG.

    Returns a parallel list of normalized paths. Originals are not modified.
    """
    os.makedirs(out_dir, exist_ok=True)
    out_paths: list[str] = []
    for idx, src in enumerate(image_paths):
        with Image.open(src) as im:
            im = ImageOps.exif_transpose(im).convert("RGB")
            im.thumbnail((max_px, max_px), Image.LANCZOS)
            dst = str(Path(out_dir) / f"norm_{idx:03d}.jpg")
            im.save(dst, "JPEG", quality=92, optimize=True)
        out_paths.append(dst)
    return out_paths


def remove_background_rmbg14(image_paths: list[str], out_dir: str) -> list[str]:
    """Optional RMBG-1.4 (MIT) background removal for product-style captures.

    Skipped silently if the model is unavailable; the pipeline must not fail
    just because optional preprocessing could not run.
    """
    try:
        from rembg import new_session, remove  # type: ignore[import-not-found]
    except Exception:
        return image_paths

    os.makedirs(out_dir, exist_ok=True)
    try:
        session = new_session(model_name="u2net")  # rembg default; MIT
    except Exception:
        return image_paths

    out_paths: list[str] = []
    for idx, src in enumerate(image_paths):
        try:
            with open(src, "rb") as fh:
                cut = remove(fh.read(), session=session)
            dst = str(Path(out_dir) / f"rmbg_{idx:03d}.png")
            with open(dst, "wb") as fh:
                fh.write(cut)
            out_paths.append(dst)
        except Exception:
            # Fall back to the original image on per-file failure.
            out_paths.append(src)
    return out_paths


def load_as_tensor_stack(image_paths: list[str]) -> np.ndarray:
    """Load a list of images into a (N, 3, H, W) float32 array in [0, 1].

    VGGT/FreeSplatter both expect a stack of RGB tensors at the same resolution.
    """
    arrays: list[np.ndarray] = []
    target_size: tuple[int, int] | None = None
    for path in image_paths:
        with Image.open(path) as im:
            im = im.convert("RGB")
            if target_size is None:
                target_size = im.size
            elif im.size != target_size:
                im = im.resize(target_size, Image.LANCZOS)
            arr = np.asarray(im, dtype=np.float32) / 255.0
            arrays.append(arr.transpose(2, 0, 1))  # HWC → CHW
    return np.stack(arrays, axis=0)  # (N, 3, H, W)
