"""Image prep shared by the pipeline: sketch fitting, reference composites and
lineart binarization, matching Dataset_curated/scripts (common.py, 03, 06)."""
import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageOps

from .settings import CFG, SIZE, path

Image.MAX_IMAGE_PIXELS = 150_000_000


def rgb(src, bg="white"):
    im = src if isinstance(src, Image.Image) else Image.open(src)
    im = ImageOps.exif_transpose(im)
    rgba = im.convert("RGBA")
    canvas = Image.new("RGBA", rgba.size, bg)
    canvas.alpha_composite(rgba)
    return canvas.convert("RGB")


def fit(im, size=SIZE, bg="white"):
    im = ImageOps.contain(im, size, Image.Resampling.LANCZOS)
    canvas = Image.new("RGB", size, bg)
    canvas.paste(im, ((size[0] - im.width) // 2, (size[1] - im.height) // 2))
    return canvas


def lineart_pixels(rgb_array):
    """Training target ramp: max channel 70..100 -> 0..255."""
    mx = np.asarray(rgb_array).max(2)
    return np.clip((mx.astype(np.float32) - 70) * 255 / 30, 0, 255).astype(np.uint8)


def binarize(im):
    return Image.fromarray(lineart_pixels(np.asarray(im.convert("RGB")))).convert("RGB")


def characters():
    refs = path(CFG["references_dir"])
    return sorted(p.stem for p in refs.glob("*.png"))


def reference_file(name):
    f = path(CFG["references_dir"]) / f"{name}.png"
    if not f.exists():
        raise ValueError(f"Sheet karakter '{name}' tidak ada")
    return f


def _sources():
    p = path(CFG["character_sources"])
    return json.loads(p.read_text(encoding="utf-8-sig")) if p.exists() else {}


def _source_file(values):
    """Old datasets may contain absolute paths from another workstation."""
    for value in values or []:
        original = Path(value)
        if original.is_file():
            return original
        parts = value.replace("\\", "/").split("/")
        if "CharsheetGeneration" in parts:
            candidate = path(CFG["references_dir"]).parent.parent.joinpath(
                *parts[parts.index("CharsheetGeneration"):])
            if candidate.is_file():
                return candidate
    return None


def composite_reference(names):
    """Single character: the approved sheet. 2-4 characters: one column per character,
    left to right, name label, full body above face (scripts/06_references.py)."""
    if not 1 <= len(names) <= 4:
        raise ValueError("Pilih 1 sampai 4 karakter (data latih maksimal 4)")
    if len(names) == 1:
        return rgb(reference_file(names[0]))
    sources = _sources()
    canvas = Image.new("RGB", SIZE, "white")
    n = len(names)
    for i, name in enumerate(names):
        x0 = round(i * SIZE[0] / n)
        x1 = round((i + 1) * SIZE[0] / n)
        src = sources.get(name)
        ImageDraw.Draw(canvas).text((x0 + 6, 8), name, fill="black")
        body = _source_file((src or {}).get("body"))
        face = _source_file((src or {}).get("face"))
        if body:
            canvas.paste(fit(rgb(body), (x1 - x0, 952)), (x0, 32))
            if face:
                canvas.paste(fit(rgb(face), (x1 - x0, 360)), (x0, 984))
        else:
            # Fallback when raw sheets are missing: the stored side-by-side sheet, fitted.
            canvas.paste(fit(rgb(reference_file(name)), (x1 - x0, 1312)), (x0, 32))
    return canvas
