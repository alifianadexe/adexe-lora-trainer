"""Inference reference layout and caption prefix matching the v3 training pipeline."""
import json
import numpy as np
from PIL import Image
from .settings import CFG, path
REFS = path(CFG["references_dir"])

NEW = ("aqstyle final. Turn this rough sketch into a polished, finished full-color aqstyle manhwa panel on a green screen. "
       "Refine it into clean, bold lineart with polished flat cel shading, and add rich but on-model detail to hair, "
       "clothing folds and props. Complete and improve anatomy and forms creatively while keeping the pose, composition, "
       "described action and emotion. Keep each character's identity, hair and eye colors exactly as in the character reference.")

def load_chars():
    f = path(CFG["sketch2final"]["characters_file"])
    return json.loads(f.read_text(encoding="utf-8-sig")) if f.is_file() else {}


def describe(name, chars):
    c = chars.get(name)
    return f"{name} ({c['caption']})" if c else name


def ref_parts(name):
    im = Image.open(REFS / f"{name}.png").convert("RGB"); a = np.asarray(im)
    def box(x0, x1):
        sub = a[:, x0:x1]; ys, xs = np.nonzero((sub < 245).any(2))
        return im.crop((x0 + xs.min(), ys.min(), x0 + xs.max() + 1, ys.max() + 1))
    return box(0, 384), box(384, 768)  # body, face


def fit(im, w, h):
    s = min(w / im.width, h / im.height)
    return im.resize((max(1, round(im.width * s)), max(1, round(im.height * s))), Image.Resampling.LANCZOS)


def composite(names):
    W, H, n = 768, 1344, len(names)
    cw = W // n
    canvas = Image.new("RGB", (W, H), "white")
    for i, name in enumerate(names):
        body, face = ref_parts(name)
        f = fit(face, cw - 8, int(H * 0.36))
        b = fit(body, cw - 8, H - f.height - 24)
        x0 = i * cw
        canvas.paste(f, (x0 + (cw - f.width) // 2, 8))
        canvas.paste(b, (x0 + (cw - b.width) // 2, f.height + 16))
    return canvas

