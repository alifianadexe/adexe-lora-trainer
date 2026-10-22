"""SeedVR2 image upscale, owned by this app.

The upstream CLI (numz/ComfyUI-SeedVR2_VideoUpscaler) lives in backends/seedvr2,
installed by scripts/install_backends, pinned to COMMIT with our patch applied.
It runs in the AI Toolkit Python (same torch/CUDA), one subprocess per batch so
the 7B model loads once and its VRAM is returned on exit."""
import os
import shutil
import subprocess
from pathlib import Path

from ..config import ROOT

REPO = "https://github.com/numz/ComfyUI-SeedVR2_VideoUpscaler.git"
COMMIT = "4490bd1f482e026674543386bb2a4d176da245b9"
PATCH = ROOT / "scripts/patches/seedvr2-flash-attn.patch"
DEFAULT_DIR = ROOT / "backends/seedvr2"
DEFAULT_MODEL = "seedvr2_ema_7b_sharp_fp8_e4m3fn_mixed_block35_fp16.safetensors"
EXTRA_PACKAGES = ["rotary_embedding_torch"]


def cli(folder) -> Path:
    return Path(folder or DEFAULT_DIR) / "inference_cli.py"


def available(folder=None) -> bool:
    return cli(folder).is_file()


def model_present(folder=None, model=DEFAULT_MODEL) -> bool:
    return (Path(folder or DEFAULT_DIR) / "models/SEEDVR2" / model).is_file()


def patched(folder=None) -> bool:
    text = (Path(folder or DEFAULT_DIR) / "src/optimization/compatibility.py").read_text(encoding="utf-8")
    return "a stub breaks newer transformers" in text


def upscale(python, files, out_dir: Path, log_path: Path, folder=None, model=DEFAULT_MODEL, short_side=1536,
            on_proc=None) -> dict:
    """Upscale every file in one run. Returns {input name: output path} (outputs may be missing on failure)."""
    folder = Path(folder or DEFAULT_DIR)
    work = out_dir.parent / (out_dir.name + "_in")
    shutil.rmtree(work, ignore_errors=True)
    shutil.rmtree(out_dir, ignore_errors=True)
    work.mkdir(parents=True)
    for f in files:
        shutil.copyfile(f, work / Path(f).name)
    cmd = [str(python), "inference_cli.py", str(work), "--output", str(out_dir), "--dit_model", model,
           "--resolution", str(short_side), "--batch_size", "1", "--color_correction", "lab",
           "--vae_encode_tiled", "--vae_decode_tiled"]
    env = dict(os.environ, PYTHONIOENCODING="utf-8")
    with open(log_path, "w", encoding="utf-8") as log:
        proc = subprocess.Popen(cmd, cwd=str(folder), stdout=log, stderr=subprocess.STDOUT, env=env,
                                creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
        if on_proc:
            on_proc(proc)
        proc.wait()
    shutil.rmtree(work, ignore_errors=True)
    return {Path(f).name: out_dir / Path(f).name for f in files}
