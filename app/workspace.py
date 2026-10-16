"""Inspect existing local training artifacts without changing their source files."""
import json
import re
import struct
from pathlib import Path
import yaml
from .config import ROOT, load_settings


def read_config(path: str):
    source = Path(path).expanduser().resolve()
    if not source.is_file() or source.suffix.lower() not in (".yaml", ".yml", ".json"):
        raise ValueError("Pilih file config YAML/JSON AI Toolkit yang sudah tersedia.")
    cfg = yaml.safe_load(source.read_text(encoding="utf-8-sig"))
    if not isinstance(cfg, dict):
        raise ValueError("Isi file bukan config AI Toolkit yang valid.")
    processes = cfg.get("config", {}).get("process", []) if isinstance(cfg, dict) else []
    if cfg.get("job") != "extension" or len(processes) != 1 or processes[0].get("type") != "sd_trainer":
        raise ValueError("Impor saat ini mendukung satu proses sd_trainer AI Toolkit.")
    proc = processes[0]
    if not re.fullmatch(r"[A-Za-z0-9_-]{1,64}", cfg["config"].get("name", "")):
        raise ValueError("Nama config harus berupa huruf, angka, _ atau -.")
    if not proc.get("datasets") or not proc.get("training_folder"):
        raise ValueError("Config membutuhkan datasets dan training_folder.")
    if proc.get("model", {}).get("arch") not in ("qwen_image_2", "anima","flux2_klein_4b","zimage"):
        raise ValueError("Pilih model yang didukung katalog studio.")
    if not isinstance(proc.get("train", {}).get("steps"), int) or proc["train"]["steps"] < 1:
        raise ValueError("Jumlah langkah training harus berupa bilangan positif.")
    for folder in [proc["training_folder"], *[d[k] for d in proc["datasets"] for k in ("folder_path", "control_path_1", "control_path_2") if d.get(k)]]:
        if not Path(folder).is_absolute():
            raise ValueError("Gunakan path absolut untuk dataset, control, dan training_folder pada config impor.")
    return source, cfg, proc


def latest_checkpoint(root):
    result = {"step": 0, "file": None, "mtime": None}
    for p in Path(root).glob("*.safetensors"):
        step = 0
        match = re.search(r"_(\d{9})\.safetensors$", p.name)
        if match: step = int(match[1])
        try:
            with p.open("rb") as f:
                length = struct.unpack("<Q", f.read(8))[0]
                if length < 20_000_000:
                    meta = json.loads(f.read(length)).get("__metadata__", {})
                    step = int(json.loads(meta.get("training_info", "{}" )).get("step", step))
        except (OSError, ValueError, struct.error):
            pass
        if step > result["step"] or (step == result["step"] and p.stat().st_mtime > (result["mtime"] or 0)):
            result = {"step": step, "file": p.name, "mtime": p.stat().st_mtime}
    return result


def project_summary():
    base = Path(load_settings()["ai_toolkit_path"]).resolve().parent
    data = base / "Dataset_2k"
    config = data / "configs/stage1_sketch2line_768_v3.yaml"
    from . import database
    saved=next((j for j in database.list_jobs() if j['name']=='stage1_sketch2line_768_v3' and j.get('imported_config')),None)
    if not config.exists() and not saved:
        return {"available": False, "message": "Impor config AI Toolkit untuk mulai menghubungkan proyek."}
    if saved:
        cfg=saved['imported_config'];proc=cfg['config']['process'][0];source=Path(saved.get('source_config',config))
    else:source, cfg, proc = read_config(str(config))
    ds = proc["datasets"][0]
    root = Path(proc["training_folder"]) / cfg["config"]["name"]
    checkpoint = latest_checkpoint(root)
    ids = sorted(p.stem for p in Path(ds["folder_path"]).glob("*.png"))
    pairs = []
    for key, label in [("control_path_1", "Sketch"), ("folder_path", "Target lineart"), ("control_path_2", "Referensi karakter")]:
        folder = Path(ds.get(key, ""))
        found = {p.stem for p in folder.glob("*.png")} if ds.get(key) else set()
        pairs.append({"label": label, "count": len(found), "complete": found == set(ids), "path": str(folder)})
    sample_files = sorted((root / "samples").glob("*.png"), key=lambda p: p.stat().st_mtime, reverse=True)
    latest = []
    for p in sample_files:
        match = re.search(r"__(\d{9})_(\d+)\.", p.name)
        if match and int(match[1]) == checkpoint["step"]:
            latest.append({"file": p.name, "index": int(match[2])})
    return {"available": True, "name": cfg["config"]["name"], "config_path": str(source), "output_root": str(root),
            "dataset_count": len(ids), "pairs": pairs, "size": [proc.get("sample", {}).get("width"), proc.get("sample", {}).get("height")],
            "total_steps": proc["train"]["steps"], "checkpoint": checkpoint, "samples": sorted(latest, key=lambda x:x["index"]),
            "stage2_count": len(list((data / "stage2_line2color_768_v3/target").glob("*.png"))),
            "heldout_count": len(list((data / "eval_768_v3").glob("*/sketch.png"))),
            "sample_every": proc.get("sample", {}).get("sample_every"), "save_every": proc.get("save", {}).get("save_every")}


def project_sample(name):
    info = project_summary()
    if not info.get("available") or Path(name).name != name or not name.endswith(".png"):
        raise FileNotFoundError(name)
    path = Path(info["output_root"]) / "samples" / name
    if not path.is_file(): raise FileNotFoundError(name)
    return path
