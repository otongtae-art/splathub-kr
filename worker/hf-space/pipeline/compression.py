"""Invoke `@playcanvas/splat-transform` CLI to convert `.ply` → `.spz`.

Uses `npx` so the CLI version stays pinned by the Space's Node environment.
Runs as a subprocess because the upstream tool is a Node binary; we only
need the transform path, not the full npm package graph, in the Python app.
"""

from __future__ import annotations

import logging
import os
import shutil
import subprocess
from pathlib import Path

logger = logging.getLogger(__name__)


def ply_to_spz(ply_path: str, spz_path: str, sh_degree: int = 1) -> int:
    """Compress `ply_path` to `spz_path`. Returns the resulting file size in bytes.

    Raises RuntimeError if the CLI is unavailable or fails.
    """
    if not shutil.which("npx"):
        raise RuntimeError(
            "npx not found on PATH. Install Node via packages.txt (Space) or `brew install node` locally."
        )
    Path(spz_path).parent.mkdir(parents=True, exist_ok=True)
    cmd = [
        "npx",
        "--yes",
        "@playcanvas/splat-transform",
        ply_path,
        spz_path,
        "--sh-degree",
        str(sh_degree),
    ]
    logger.info("[compression] %s", " ".join(cmd))
    res = subprocess.run(cmd, capture_output=True, text=True, check=False)
    if res.returncode != 0:
        raise RuntimeError(
            f"splat-transform failed (exit {res.returncode}):\n"
            f"STDOUT: {res.stdout[-1000:]}\n"
            f"STDERR: {res.stderr[-1000:]}"
        )
    size = os.path.getsize(spz_path)
    logger.info("[compression] produced %s (%d bytes)", spz_path, size)
    return size
