"""SplatHub HF Space pipeline package.

Exposes a single high-level function `run_photo_to_splat` that orchestrates:
    RMBG background removal → VGGT pose/depth → FreeSplatter 3D Gaussians
    → splat-transform compression to .spz.

Each step is implemented in its own module so individual pieces can be swapped
or mocked during local development.
"""

from .orchestrator import run_photo_to_splat  # noqa: F401
