"""Run CUDA upscaling in the existing AI Toolkit Python, releasing VRAM on exit."""
import os
import subprocess
import tempfile
from pathlib import Path
from PIL import Image
from .engine import ENGINE
from .settings import CFG, DATA, ROOT, path


def upscale(image, tile=384, pad=16):
    with tempfile.TemporaryDirectory(prefix="upscale-", dir=DATA) as temp:
        source, target = Path(temp) / "source.png", Path(temp) / "result.png"
        image.save(source)
        python = ENGINE._python(path(CFG["aitk_dir"]))
        result = subprocess.run(
            [python, "-m", "app.generation.upscale_worker", str(source), str(target), str(tile), str(pad)],
            cwd=ROOT, env=dict(os.environ, PYTHONIOENCODING="utf-8"),
            capture_output=True, text=True, encoding="utf-8", errors="replace",
            creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
        )
        if result.returncode:
            raise RuntimeError("Upscale gagal di environment AI Toolkit: " + result.stderr[-1500:])
        with Image.open(target) as output:
            return output.copy()
