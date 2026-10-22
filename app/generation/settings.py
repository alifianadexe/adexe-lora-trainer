"""Private generation settings; paths are absolute or relative to the Adexe app root."""
import threading
CONFIG_LOCK = threading.Lock()
import json
from pathlib import Path

from ..config import ROOT, DATA_DIR
import os

CONFIG_FILE = Path(os.environ.get("ADEXE_GENERATION_CONFIG", DATA_DIR / "generation-config.json"))
DEFAULTS = {
    "aitk_dir": str(ROOT / "backends/ai-toolkit"), "python": "",
    "engine_port": 8866, "data_dir": str(DATA_DIR / "generation"),
    "model": {"arch": "qwen_image_2", "name_or_path": "Comfy-Org/Qwen-Image-2.1",
              "quantize": True, "qtype": "convrot8", "quantize_te": True,
              "qtype_te": "convrot8", "low_vram": True,
              "model_kwargs": {"rgba": False, "match_target_res": True}},
    "sample": {"width": 768, "height": 1344, "num_inference_steps": 30, "guidance_scale": 1.0},
    "stage1_loras": [], "stage2_loras": [], "binarize_lineart": True,
    "references_dir": str(DATA_DIR / "references"),
    "character_sources": str(DATA_DIR / "character_sources.json"),
    "upscaler": str(DATA_DIR / "models/RealESRGAN_x4plus_anime_6B.pth"),
    "outputs": {"2k": [1440, 2560], "4k": [2160, 3840]},
    "sketch2final": {"run_dir": str(DATA_DIR / "checkpoints"),
                     "characters_file": str(DATA_DIR / "characters.json"),
                     "outputs_dir": str(DATA_DIR / "generation-outputs"),
                     "guidance": 2.5, "steps": 30, "stroke_px": 2.6},
    "engine_autostart": False,
}
CFG = dict(DEFAULTS)
if CONFIG_FILE.is_file():
    supplied = json.loads(CONFIG_FILE.read_text(encoding="utf-8-sig"))
    for key, value in supplied.items():
        CFG[key] = dict(DEFAULTS[key], **value) if isinstance(value, dict) and isinstance(DEFAULTS.get(key), dict) else value


def path(value) -> Path:
    p = Path(value)
    return p if p.is_absolute() else ROOT / p


DATA = path(CFG.get("data_dir", "data"))
JOBS_DIR = DATA / "jobs"
ENGINE_DIR = DATA / "engine"
LOG_DIR = DATA / "logs"
for d in (JOBS_DIR, ENGINE_DIR, LOG_DIR):
    d.mkdir(parents=True, exist_ok=True)

SIZE = (CFG["sample"]["width"], CFG["sample"]["height"])
GREEN = (18, 194, 0)


def stage1_options():
    """Every configured Stage 1 LoRA with whether its file exists; newest available first."""
    return [dict(o, available=path(o["path"]).exists()) for o in CFG["stage1_loras"]]


def stage2_options():
    return [dict(o, available=path(o["path"]).exists()) for o in CFG["stage2_loras"]]


def pick(options, wanted=None):
    avail = [o for o in options if o["available"]]
    if wanted:
        for o in avail:
            if o["id"] == wanted:
                return o
        raise ValueError(f"LoRA '{wanted}' tidak tersedia")
    if not avail:
        raise ValueError("Tidak ada file LoRA yang ditemukan; cek config.json")
    return avail[0]
