"""Paths and persistent settings for the local LoRA studio."""

import json
import os
import sys
import threading
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = Path(os.environ.get("LORA_STUDIO_DATA", ROOT / "studio-data")).resolve()
DATASETS_DIR = DATA_DIR / "datasets"
JOBS_DIR = DATA_DIR / "jobs"
OUTPUTS_DIR = DATA_DIR / "outputs"
THUMBS_DIR = DATA_DIR / ".thumbs"
SETTINGS_FILE = DATA_DIR / "settings.json"
BACKENDS_DIR = ROOT / "backends"
WEB_DIR = ROOT / "frontend" / "out"

for d in (DATA_DIR, DATASETS_DIR, JOBS_DIR, OUTPUTS_DIR, THUMBS_DIR):
    d.mkdir(parents=True, exist_ok=True)


def _venv_python(repo: Path) -> str:
    """Best guess at the python inside a backend's own venv."""
    for rel in ("venv/bin/python", ".venv/bin/python", "venv/Scripts/python.exe", ".venv/Scripts/python.exe"):
        p = repo / rel
        if p.exists():
            return str(p)
    return ""


DEFAULT_SETTINGS = {
    # ai-toolkit (ostris) - handles both Qwen-Image-2.1 and Anima
    "ai_toolkit_path": str(BACKENDS_DIR / "ai-toolkit"),
    "ai_toolkit_python": "",
    # kohya sd-scripts - optional second backend for Anima
    "sd_scripts_path": str(BACKENDS_DIR / "sd-scripts"),
    "sd_scripts_python": "",
    # model files for sd-scripts Anima (ai-toolkit downloads from HF by itself)
    "anima_dit_path": "",
    "anima_qwen3_path": "",
    "anima_vae_path": "",
    "hf_token": "",
    # paired-project page: AI Toolkit config to follow (empty = latest imported config)
    "project_config_path": "",
    # OpenAI-compatible vision endpoint for auto-captioning (Ollama, LM Studio, vLLM...)
    "caption_api_base": "http://localhost:11434/v1",
    "caption_api_key": "",
    "caption_model": "qwen2.5vl:7b",
}

_lock = threading.Lock()


def load_settings() -> dict:
    from . import database

    s = dict(DEFAULT_SETTINGS)
    s.update(database.settings())
    return s


def save_settings(new: dict) -> dict:
    with _lock:
        s = load_settings()
        for k, v in new.items():
            if k in DEFAULT_SETTINGS:
                s[k] = v
        from . import database

        database.save_settings(s)
        return s


def resolve_python(repo_path: str, configured: str) -> str:
    if configured:
        return configured
    guess = _venv_python(Path(repo_path)) if repo_path else ""
    return guess or sys.executable


def backend_status() -> dict:
    s = load_settings()
    out = {}
    for key, entry in (("ai-toolkit", "run.py"), ("sd-scripts", "anima_train_network.py")):
        prefix = key.replace("-", "_")
        path = Path(s[f"{prefix}_path"]) if s[f"{prefix}_path"] else None
        found = bool(path and (path / entry).exists())
        out[key] = {
            "path": str(path) if path else "",
            "found": found,
            "python": resolve_python(str(path) if path else "", s[f"{prefix}_python"]),
        }
    if out["ai-toolkit"]["found"]:
        p = Path(out["ai-toolkit"]["path"]) / "extensions_built_in" / "diffusion_models"
        out["ai-toolkit"]["supports_qwen_image_2"] = (p / "qwen_image_2").exists()
        out["ai-toolkit"]["supports_anima"] = (p / "anima").exists()
        out["ai-toolkit"]["model_support"] = {
            "qwen_image_2": (p / "qwen_image_2").is_dir(),
            "anima": (p / "anima").is_dir(),
            "flux2_klein_4b": (p / "flux2/flux2_klein_model.py").is_file(),
            "zimage": (p / "z_image/z_image.py").is_file(),
        }
    return out
