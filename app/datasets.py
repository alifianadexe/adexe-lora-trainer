"""Dataset folders: images + same-name .txt captions (the format both trainers read)."""

import hashlib
import json
import re
import shutil
from pathlib import Path

from PIL import Image, ImageOps

from .config import DATASETS_DIR, THUMBS_DIR

IMG_EXT = {".jpg", ".jpeg", ".png", ".webp", ".bmp"}
NAME_RE = re.compile(r"^[A-Za-z0-9_\-]{1,64}$")
META = "dataset.json"


def _safe_name(name: str) -> str:
    name = (name or "").strip().replace(" ", "_")
    if not NAME_RE.match(name):
        raise ValueError("Nama hanya boleh huruf, angka, _ dan - (maks 64)")
    return name


def _meta_path(d: Path) -> Path:
    return d / META


def _read_meta(d: Path) -> dict:
    mp = _meta_path(d)
    if mp.exists():
        try:
            return json.loads(mp.read_text(encoding="utf-8"))
        except Exception:
            pass
    return {}


def _write_meta(d: Path, meta: dict):
    _meta_path(d).write_text(json.dumps(meta, indent=2), encoding="utf-8")


def dataset_dir(name: str) -> Path:
    name = _safe_name(name)
    d = (DATASETS_DIR / name).resolve()
    if not d.exists():
        raise FileNotFoundError(name)
    # linked datasets store the real folder in meta
    meta = _read_meta(d)
    if meta.get("linked_path"):
        return Path(meta["linked_path"])
    return d


def _home_dir(name: str) -> Path:
    return DATASETS_DIR / _safe_name(name)


def images_in(d: Path) -> list:
    if not d.exists():
        return []
    return sorted([p for p in d.iterdir() if p.suffix.lower() in IMG_EXT and p.is_file()], key=lambda p: p.name.lower())


def list_datasets() -> list:
    out = []
    for d in sorted(DATASETS_DIR.iterdir()):
        if not d.is_dir():
            continue
        try:
            out.append(summary(d.name))
        except Exception:
            continue
    return out


def summary(name: str) -> dict:
    home = _home_dir(name)
    meta = _read_meta(home)
    d = dataset_dir(name)
    imgs = images_in(d)
    captioned = sum(1 for p in imgs if p.with_suffix(".txt").exists() and p.with_suffix(".txt").read_text(encoding="utf-8", errors="ignore").strip())
    return {
        "name": name,
        "path": str(d),
        "linked": bool(meta.get("linked_path")),
        "trigger_word": meta.get("trigger_word", ""),
        "caption_style": meta.get("caption_style", "natural"),
        "notes": meta.get("notes", ""),
        "count": len(imgs),
        "captioned": captioned,
        "cover": imgs[0].name if imgs else None,
    }


def create(name: str, trigger_word: str = "", caption_style: str = "natural", linked_path: str = "") -> dict:
    home = _home_dir(name)
    if home.exists():
        raise ValueError("Dataset sudah ada")
    meta = {"trigger_word": trigger_word.strip(), "caption_style": caption_style}
    if linked_path:
        lp = Path(linked_path).expanduser().resolve()
        if not lp.is_dir():
            raise ValueError(f"Folder tidak ditemukan: {lp}")
        meta["linked_path"] = str(lp)
    home.mkdir(parents=True)
    _write_meta(home, meta)
    return summary(name)


def update_meta(name: str, data: dict) -> dict:
    home = _home_dir(name)
    meta = _read_meta(home)
    for k in ("trigger_word", "caption_style", "notes"):
        if k in data:
            meta[k] = data[k]
    _write_meta(home, meta)
    return summary(name)


def delete(name: str):
    home = _home_dir(name)
    if home.exists():
        shutil.rmtree(home)  # linked folders are left untouched


def details(name: str) -> dict:
    d = dataset_dir(name)
    s = summary(name)
    items = []
    sizes = {}
    for p in images_in(d):
        cap_file = p.with_suffix(".txt")
        cap = cap_file.read_text(encoding="utf-8", errors="ignore").strip() if cap_file.exists() else ""
        try:
            with Image.open(p) as im:
                w, h = im.size
                mode = im.mode
        except Exception:
            w = h = 0
            mode = "?"
        bucket = "%dpx" % (min(w, h) // 256 * 256) if w else "?"
        sizes[bucket] = sizes.get(bucket, 0) + 1
        items.append({
            "file": p.name,
            "caption": cap,
            "width": w,
            "height": h,
            "alpha": mode in ("RGBA", "LA", "P"),
            "size_kb": round(p.stat().st_size / 1024),
        })
    s["items"] = items
    s["stats"] = _stats(items, s["trigger_word"])
    return s


def _stats(items: list, trigger: str) -> dict:
    warnings = []
    n = len(items)
    small = [i["file"] for i in items if i["width"] and min(i["width"], i["height"]) < 512]
    missing = [i["file"] for i in items if not i["caption"]]
    no_trig = [i["file"] for i in items if trigger and i["caption"] and trigger.lower() not in i["caption"].lower()]
    if n == 0:
        warnings.append({"level": "bad", "msg": "Belum ada gambar."})
    elif n < 10:
        warnings.append({"level": "warn", "msg": f"Hanya {n} gambar. 15-40 gambar berkualitas biasanya ideal."})
    if small:
        warnings.append({"level": "warn", "msg": f"{len(small)} gambar sisi terpendeknya < 512px - akan blur/jelek saat di-upscale ke bucket."})
    if missing:
        warnings.append({"level": "warn", "msg": f"{len(missing)} gambar belum punya caption."})
    if no_trig:
        warnings.append({"level": "warn", "msg": f"{len(no_trig)} caption tidak memuat trigger word '{trigger}'."})
    tag_counts = {}
    for i in items:
        for t in [t.strip().lower() for t in i["caption"].split(",") if t.strip()]:
            if len(t) <= 40:
                tag_counts[t] = tag_counts.get(t, 0) + 1
    top = sorted(tag_counts.items(), key=lambda kv: -kv[1])[:40]
    avg_words = (sum(len(i["caption"].split()) for i in items) / n) if n else 0
    return {
        "warnings": warnings,
        "small": small,
        "missing": missing,
        "no_trigger": no_trig,
        "top_tags": top,
        "avg_words": round(avg_words, 1),
        "captions_have_trigger": not no_trig and not missing,
    }


def _check_file(d: Path, filename: str) -> Path:
    p = (d / filename).resolve()
    if p.parent != d.resolve() or p.suffix.lower() not in IMG_EXT:
        raise ValueError("file tidak valid")
    return p


def image_path(name: str, filename: str) -> Path:
    return _check_file(dataset_dir(name), filename)


def thumbnail(name: str, filename: str, size: int = 384) -> Path:
    src = image_path(name, filename)
    st = src.stat()
    key = hashlib.sha1(f"{src}|{st.st_mtime_ns}|{size}".encode()).hexdigest()
    out = THUMBS_DIR / f"{key}.webp"
    if not out.exists():
        with Image.open(src) as im:
            im = ImageOps.exif_transpose(im)
            im.thumbnail((size, size))
            if im.mode not in ("RGB", "RGBA"):
                im = im.convert("RGBA")
            im.save(out, "WEBP", quality=82)
    return out


def save_upload(name: str, filename: str, data: bytes) -> str:
    d = dataset_dir(name)
    stem = re.sub(r"[^A-Za-z0-9_\-.]", "_", Path(filename).stem)[:80] or "img"
    ext = Path(filename).suffix.lower()
    if ext == ".txt":
        target = d / f"{stem}.txt"
        target.write_bytes(data)
        return target.name
    if ext not in IMG_EXT:
        raise ValueError(f"format tidak didukung: {ext}")
    target = d / f"{stem}{ext}"
    i = 1
    while target.exists():
        target = d / f"{stem}_{i}{ext}"
        i += 1
    target.write_bytes(data)
    try:
        with Image.open(target) as im:
            im.verify()
    except Exception:
        target.unlink(missing_ok=True)
        raise ValueError(f"{filename} bukan gambar valid")
    return target.name


def set_caption(name: str, filename: str, caption: str):
    p = image_path(name, filename)
    p.with_suffix(".txt").write_text(caption.strip() + "\n", encoding="utf-8")


def delete_image(name: str, filename: str):
    p = image_path(name, filename)
    p.unlink(missing_ok=True)
    p.with_suffix(".txt").unlink(missing_ok=True)


def bulk(name: str, op: str, args: dict) -> int:
    """Bulk caption operations. Returns number of files changed."""
    d = dataset_dir(name)
    changed = 0
    files = args.get("files") or None
    for p in images_in(d):
        if files and p.name not in files:
            continue
        cf = p.with_suffix(".txt")
        cap = cf.read_text(encoding="utf-8", errors="ignore").strip() if cf.exists() else ""
        new = cap
        if op == "prepend_trigger":
            trig = (args.get("trigger") or "").strip()
            if trig and not re.match(rf"^\s*{re.escape(trig)}\b", cap, re.I):
                new = f"{trig}, {cap}" if cap else trig
        elif op == "remove_trigger":
            trig = (args.get("trigger") or "").strip()
            if trig:
                new = re.sub(rf"(^|,\s*){re.escape(trig)}\s*(,\s*|$)", r"\1", cap).strip(" ,")
        elif op == "replace":
            find = args.get("find") or ""
            if find:
                new = cap.replace(find, args.get("replace") or "")
        elif op == "append":
            text = (args.get("text") or "").strip()
            if text and text not in cap:
                new = f"{cap}, {text}" if cap else text
        elif op == "remove_tag":
            tag = (args.get("tag") or "").strip().lower()
            if tag:
                parts = [t.strip() for t in cap.split(",")]
                new = ", ".join(t for t in parts if t and t.lower() != tag)
        elif op == "underscores_to_spaces":
            new = re.sub(r"(?<!score)_", " ", cap)
        elif op == "fill_empty":
            if not cap:
                new = (args.get("text") or "").strip()
        else:
            raise ValueError(f"operasi tidak dikenal: {op}")
        if new != cap:
            cf.write_text(new.strip() + "\n", encoding="utf-8")
            changed += 1
    return changed
