"""Copy an existing Aqstyle workspace into private studio-data without altering it."""
import argparse
import ast
import json
import shutil
import sqlite3
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.config import DATA_DIR


def migrate(source):
    source = source.resolve()
    config_file = DATA_DIR / "generation-config.json"
    target = DATA_DIR / "generation"
    if target.exists():
        raise ValueError("Folder generation sudah ada; impor tidak akan menimpa karya yang tersimpan.")
    config = json.loads((source / "config.json").read_text(encoding="utf-8-sig"))
    resolve = lambda value: Path(value) if Path(value).is_absolute() else source / value
    data = resolve(config.get("data_dir", "data"))
    database = data / "studio.db"
    if database.exists():
        with sqlite3.connect(database.as_uri() + "?mode=ro", uri=True) as db:
            if db.execute("select count(*) from jobs where status in ('queued','running')").fetchone()[0]:
                raise ValueError("Tunggu antrean studio lama selesai sebelum impor.")
    target.mkdir(parents=True)
    if database.exists():
        with sqlite3.connect(database.as_uri() + "?mode=ro", uri=True) as old, sqlite3.connect(target / "studio.db") as new:
            old.backup(new)
    if (data / "jobs").exists():
        shutil.copytree(data / "jobs", target / "jobs")
    output = resolve(config.get("sketch2final", {}).get("outputs_dir", "outputs"))
    if output.exists():
        shutil.copytree(output, target / "outputs")
    upscaler = resolve(config["upscaler"])
    if upscaler.is_file():
        (target / "models").mkdir()
        shutil.copy2(upscaler, target / "models" / upscaler.name)
        config["upscaler"] = str(target / "models" / upscaler.name)
    else:
        config["upscaler"] = str(upscaler)
    for key in ("aitk_dir", "python", "references_dir", "character_sources"):
        if config.get(key):
            config[key] = str(resolve(config[key]))
    for key in ("stage1_loras", "stage2_loras"):
        for lora in config.get(key, []):
            lora["path"] = str(resolve(lora["path"]))
    s2f = config.setdefault("sketch2final", {})
    scripts = resolve(s2f.get("dataset_scripts", "../Dataset_2k/scripts"))
    s2f["characters_file"] = str(scripts.parent / "stage_sketch2final_768_v2/characters.json")
    s2f.pop("dataset_scripts", None)
    s2f["run_dir"] = str(resolve(s2f.get("run_dir", "../TrainingRuns")))
    for lora in s2f.get("extra_loras", []):
        lora["path"] = str(resolve(lora["path"]))
    s2f["outputs_dir"] = str(target / "outputs")
    config["data_dir"] = str(target)
    # Preserve user-authored character/outfit data locally rather than publishing it in code.
    preset_source = source / "backend/prompts.py"
    if preset_source.exists():
        for node in ast.parse(preset_source.read_text(encoding="utf-8-sig")).body:
            if isinstance(node, ast.Assign) and isinstance(node.targets[0], ast.Name):
                name = node.targets[0].id
                if name in ("OUTFIT_PRESETS", "PROP_PRESETS"):
                    config[name.lower()] = ast.literal_eval(node.value)
    config["legacy_engine_info"] = str(data / "engine/engine.json")
    config["engine_port"] = int(config.get("engine_port", 8866)) + 1
    config["engine_autostart"] = False
    config_file.write_text(json.dumps(config, indent=2), encoding="utf-8")
    print("Impor selesai. Karya dan konfigurasi disimpan di studio-data/generation; sumber tetap utuh.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path)
    migrate(parser.parse_args().source)
