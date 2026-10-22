"""Sketch-to-final captions, references, checkpoint discovery and CPU lineart extraction."""
import json
import re
from pathlib import Path

import numpy as np
from PIL import Image

from . import images
from .settings import CFG, SIZE, path

S2F = CFG.get("sketch2final", {})
_STEP = re.compile(r"_(\d{9})\.safetensors$")


from . import reference as _train
from . import lineart as _bold


# ------------------------------------------------------------------ checkpoints
def checkpoints():
    """All checkpoints of the configured run (newest training last) plus extra LoRAs from config."""
    run = path(S2F["run_dir"])
    default = S2F.get("default_checkpoint")
    out = []
    for f in sorted(run.glob("*.safetensors")):
        m = _STEP.search(f.name)
        step = int(m.group(1)) if m else None
        tag = run.name.rsplit("_", 1)[-1]
        out.append(dict(id=f"{tag}_{step if step else 'final'}", label=f"{tag} step {step}" if step else f"{tag} final",
                        path=str(f), step=step or 10**9, default=f.name == default, available=True,
                        size=list(S2F.get("train_size", [768, 1344]))))
    out.sort(key=lambda o: o["step"])
    for e in S2F.get("extra_loras", []):
        out.append(dict({"size": [768, 1344]}, **e, step=None, default=False, available=path(e["path"]).exists()))
    selected = S2F.get("selected_checkpoint")
    if selected and any(o["id"] == selected and o["available"] for o in out):
        for option in out:
            option["default"] = option["id"] == selected
    return out


def pick_checkpoint(wanted=None):
    opts = [o for o in checkpoints() if o["available"]]
    if not opts:
        raise ValueError("Checkpoint sketch->final tidak ditemukan; cek config.json (sketch2final.run_dir)")
    for o in opts:
        if (wanted and o["id"] == wanted) or (not wanted and o["default"]):
            return o
    if wanted:
        raise ValueError(f"Checkpoint '{wanted}' tidak tersedia")
    return opts[-1]


# ------------------------------------------------------------------ characters & captions
def characters():
    """Characters with an appearance entry and a reference sheet."""
    known = set(images.characters())
    return {k: v for k, v in _train.load_chars().items() if k in known}


SCHOOL = "school uniform"


def caption(characters, chibi=False, outfits=None, props=None, scene="", expression="", note=""):
    """Same order as the v3 training captions: Characters (appearance), chibi, Outfit, Props, Scene, Expression."""
    chars = characters
    if not chars:
        raise ValueError("Pilih minimal satu karakter")
    table = globals()["characters"]()
    lead = "Characters, left to right: " if len(chars) > 1 else "Characters: "
    parts = [_train.NEW, lead + ", ".join(_train.describe(c, table) for c in chars) + "."]
    if chibi:
        parts.append("chibi style.")
    outfits = outfits or {}
    descs = [(c, (outfits.get(c) or SCHOOL).strip().rstrip(".")) for c in chars]
    if all(d == SCHOOL for _, d in descs):
        parts.append("Outfit: school uniform.")
    elif len(descs) == 1:
        parts.append(f"Outfit: {descs[0][1]}.")
    else:
        parts.append("Outfit: " + "; ".join(f"{c} - {d}" for c, d in descs) + ".")
    props = [p.strip().rstrip(".") for p in (props or []) if p and p.strip()][:6]
    if props:
        parts.append("Props: " + ", ".join(props) + ".")
    for label, text in (("Scene", scene), ("Expression", expression)):
        text = (text or "").strip()
        if text:
            parts.append(f"{label}: {text if text.endswith('.') else text + '.'}")
    note = (note or "").strip()
    if note:
        parts.append(note if note.endswith(".") else note + ".")
    return " ".join(parts)


def reference(chars):
    """Single character: the approved sheet (as in training). 2-4: large per-character columns (v2/v3 training)."""
    if not 1 <= len(chars) <= 4:
        raise ValueError("Pilih 1 sampai 4 karakter")
    if len(chars) == 1:
        return images.composite_reference(chars)
    return _train.composite(chars)


# ------------------------------------------------------------------ lineart from the final
def extract_lineart(final: Image.Image, size, stroke_px=2.6, fills=False):
    """final: coloured image on green screen, any resolution. Returns an RGB lineart at `size`.
    stroke_px is measured at 768-wide scale; fills=True keeps broad dark areas (black hair) solid."""
    rgb = final.convert("RGB")
    src, _ = _bold.extract(rgb, stroke_px=float(stroke_px))
    a = np.asarray(src).copy()
    if fills:
        arr = np.asarray(rgb)
        s = arr.shape[1] / _bold.OUT_W
        dark = _bold.masks(arr)[3]
        a[_bold.fill_regions(dark, s, arr) > 0] = 0
    g = np.asarray(Image.fromarray(a).resize(size, Image.Resampling.BOX)).astype(np.float32)
    g = np.clip((g - 60) * 255 / (230 - 60), 0, 255).astype(np.uint8)
    g, _ = _bold.bridge_gaps(g, gap=3.5 * size[0] / SIZE[0])
    return Image.fromarray(g).convert("RGB")


def settings_view():
    return dict(guidance=S2F.get("guidance", 2.5), steps=S2F.get("steps", 30),
                stroke_px=S2F.get("stroke_px", 2.6), outputs_dir=str(path(S2F.get("outputs_dir", "outputs"))))


def save_meta(folder: Path, p: dict):
    (folder / "caption.txt").write_text(p["prompt_s2f"] + "\n", encoding="utf-8")
    keep = {k: v for k, v in p.items() if k not in ("prompt_stage1", "prompt_stage2")}
    (folder / "settings.json").write_text(json.dumps(keep, indent=1, ensure_ascii=False), encoding="utf-8")
