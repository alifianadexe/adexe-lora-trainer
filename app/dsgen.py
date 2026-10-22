"""Dataset generator: charsheet -> many pose/expression images for LoRA training.

Pipeline (no ComfyUI; everything runs from this app):
  1. Qwen-Image 2.1 through the app's AI Toolkit inference engine. The charsheet is the
     reference image; pose and expression come from text (VNCCS pose library labels and
     VNCCS emotion prompts). Qwen 2.1 keeps the sheet's proportions, line weight and colors.
  2. SeedVR2 (standalone CLI, numz/ComfyUI-SeedVR2_VideoUpscaler) upscales 2x for ~2K.
  3. Optional lineart twin, extracted on CPU with the app's bold lineart extractor.
Results land in normal trainer datasets (image + same-name .txt caption).
"""

import io
import json
import os
import random
import shutil
import subprocess
import threading
import time
import uuid
from pathlib import Path

from PIL import Image, ImageOps

from . import datasets, gpu
from .config import DATA_DIR, ROOT as APP_ROOT

ROOT = DATA_DIR / "dataset-gen"
POSES_DIR = ROOT / "poses"
SHEETS_DIR = ROOT / "sheets"
JOBS_DIR = ROOT / "jobs"
CONFIG_FILE = ROOT / "config.json"
for _d in (POSES_DIR, SHEETS_DIR, JOBS_DIR):
    _d.mkdir(parents=True, exist_ok=True)

DEFAULT_CONFIG = {
    "width": 768,
    "height": 1728,
    "steps": 30,
    "guidance": 2.5,
    "seedvr2_dir": str(APP_ROOT.parent / "seedvr2-cli"),
    "seedvr2_model": "seedvr2_ema_7b_sharp_fp8_e4m3fn_mixed_block35_fp16.safetensors",
    "upscale_short_side": 1536,
    "lineart_stroke_px": 2.6,
    "vnccs_emotions": str(Path.home() / "ComfyUI-Installs/ComfyUI (1)/ComfyUI/custom_nodes/vnccs/emotions-config/emotions.json"),
}

LINEART_LOCK = " Clean black ink lineart only, no color, no gray fill, no shading."

# Used when the VNCCS emotion list is not on this machine.
FALLBACK_EXPRESSIONS = [
    ("smile", "Smile", "The character smiles happily with bright eyes and raised cheeks."),
    ("laughing", "Smile", "The character laughs with eyes squeezed shut and an open-mouthed grin."),
    ("angry", "Anger", "The character looks angry, with tense brows, a hard stare, and a tight scowling mouth."),
    ("annoyed", "Anger", "The character looks annoyed, with narrowed eyes, one eyebrow raised, and a flat closed mouth."),
    ("sad", "Emotional", "The character looks sad, with drooping brows, downcast eyes and a small frown."),
    ("crying", "Emotional", "The character is crying, tears running down the cheeks, brows knitted and mouth trembling."),
    ("surprised", "Surprise", "The character looks surprised, eyes wide open, brows raised high and mouth open in an O shape."),
    ("shy-smile", "Smile", "The character smiles shyly, blushing with eyes glancing away."),
    ("smug", "Smug", "The character looks smug, half-lidded eyes and a confident one-sided smirk."),
    ("deep-thought", "Focus/Thought", "The character looks thoughtful, eyes glancing up to the side and lips slightly pursed."),
]

# VNCCS Pose Studio library (mannequin renders bootstrapped from the VNCCS cache):
# label, framing, and the text Qwen 2.1 follows (it does not follow mannequin images).
BOOTSTRAP_POSES = [
    ("standing, one hand on chest", "full", "standing straight, right hand resting on the chest, left arm relaxed at the side"),
    ("standing relaxed, arms down", "full", "standing relaxed facing the viewer, both arms hanging naturally, feet slightly apart"),
    ("peace sign near face, hand on hip", "full", "making a peace sign next to the eye with the right hand, left hand on the hip, weight on one leg"),
    ("hand behind head, waving", "full", "right hand behind the head, left hand raised and waving, slight hip tilt"),
    ("walking, peace sign", "full", "walking forward mid-step, right hand making a peace sign near the face, left arm swinging"),
    ("hand on shoulder, leaning", "full", "leaning slightly, right hand touching the left shoulder, left arm bent with a loose fist"),
    ("raised fist, cheering", "full", "cheering with the right fist raised high above the head, left fist clenched at chest height, legs apart"),
    ("casual stance, looking aside", "full", "casual stance with weight on one leg, head turned to look to the side, arms relaxed"),
    ("hand on hip, confident stance", "full", "confident stance, left hand on the hip, right arm relaxed, legs apart, chin slightly raised"),
    ("back view, waving over shoulder", "full", "seen from behind, turning the head to look back over the shoulder, one hand raised waving"),
    ("back view, looking over shoulder", "full", "seen from behind, glancing back over the right shoulder, arms relaxed"),
    ("upper body, side view", "portrait", "upper body in three-quarter side view, head turned toward the viewer"),
    ("A-pose, front view", "full", "standing in an A-pose facing the viewer, arms angled down and away from the body"),
]
_BOOT_TEXT = {label: text for label, _, text in BOOTSTRAP_POSES}

_lock = threading.RLock()


def _read_json(path: Path, default):
    try:
        return json.loads(Path(path).read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return default


def _write_json(path: Path, data):
    tmp = path.with_suffix(".tmp")
    tmp.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")
    tmp.replace(path)


def config() -> dict:
    cfg = dict(DEFAULT_CONFIG)
    saved = _read_json(CONFIG_FILE, {})
    cfg.update({k: v for k, v in saved.items() if k in DEFAULT_CONFIG})
    return cfg


def save_config(data: dict) -> dict:
    cfg = config()
    for k in DEFAULT_CONFIG:
        if k in data:
            cfg[k] = type(DEFAULT_CONFIG[k])(data[k])
    _write_json(CONFIG_FILE, cfg)
    return cfg


def _python() -> str:
    from .generation.engine import ENGINE
    from .generation.settings import CFG, path
    return ENGINE._python(path(CFG["aitk_dir"]))


def health() -> dict:
    from .generation.engine import ENGINE
    cfg = config()
    out = {"engine": ENGINE.health(), "error": ""}
    try:
        py = _python()
        out["python"] = py
        out["python_ok"] = bool(py) and Path(py).exists()
    except Exception as exc:  # unresolved AI Toolkit install
        out["python_ok"] = False
        out["error"] = str(exc)
    sv = Path(cfg["seedvr2_dir"])
    out["seedvr2"] = (sv / "inference_cli.py").exists()
    out["seedvr2_model"] = (sv / "models" / "SEEDVR2" / cfg["seedvr2_model"]).exists()
    out["ready"] = out["python_ok"]
    if not out["seedvr2"]:
        out["error"] = f"SeedVR2 CLI tidak ditemukan di {sv}; upscale akan dilewati"
    return out


# ---------------------------------------------------------------- libraries

def _poses_index() -> list:
    return _read_json(POSES_DIR / "poses.json", [])


def poses() -> list:
    with _lock:
        out = []
        for p in _poses_index():
            if (POSES_DIR / p["file"]).exists():
                p.setdefault("prompt", _BOOT_TEXT.get(p["label"], p["label"]))
                out.append(p)
        return out


def add_pose(data: bytes, label: str, kind: str = "full", prompt: str = "") -> dict:
    im = _open_image(data)
    pid = uuid.uuid4().hex[:10]
    fname = f"{pid}.png"
    im.convert("RGB").save(POSES_DIR / fname)
    label = (label or "pose").strip()[:80]
    entry = {"id": pid, "file": fname, "label": label, "kind": kind if kind in ("full", "portrait") else "full",
             "prompt": (prompt or _BOOT_TEXT.get(label, label)).strip()[:300]}
    with _lock:
        idx = _poses_index()
        idx.append(entry)
        _write_json(POSES_DIR / "poses.json", idx)
    return entry


def update_pose(pid: str, data: dict) -> dict:
    with _lock:
        idx = _poses_index()
        for p in idx:
            if p["id"] == pid:
                if "label" in data:
                    p["label"] = str(data["label"]).strip()[:80] or p["label"]
                if "prompt" in data:
                    p["prompt"] = str(data["prompt"]).strip()[:300] or p.get("prompt", p["label"])
                if data.get("kind") in ("full", "portrait"):
                    p["kind"] = data["kind"]
                _write_json(POSES_DIR / "poses.json", idx)
                return p
    raise ValueError("Pose tidak ditemukan")


def delete_pose(pid: str):
    with _lock:
        idx = _poses_index()
        for p in idx:
            if p["id"] == pid:
                (POSES_DIR / p["file"]).unlink(missing_ok=True)
        _write_json(POSES_DIR / "poses.json", [p for p in idx if p["id"] != pid])


def pose_path(pid: str) -> Path:
    for p in poses():
        if p["id"] == pid:
            return POSES_DIR / p["file"]
    raise ValueError("Pose tidak ditemukan")


def bootstrap_poses(source_dir: Path) -> int:
    """Seed the library from extracted VNCCS Pose Studio renders (input_poses_NN.png)."""
    if poses():
        return 0
    files = sorted(Path(source_dir).glob("input_poses_*.png"))
    for i, f in enumerate(files):
        label, kind, text = BOOTSTRAP_POSES[i] if i < len(BOOTSTRAP_POSES) else (f"pose {i + 1}", "full", "")
        add_pose(f.read_bytes(), label, kind, text)
    return len(files)


_expr_cache = {"items": None}


def expressions() -> list:
    """VNCCS emotion list (natural-language prompts) from its emotions.json, else a built-in set."""
    if _expr_cache["items"] is not None:
        return _expr_cache["items"]
    items = []
    data = _read_json(config()["vnccs_emotions"], {})
    for group, entries in (data.items() if isinstance(data, dict) else []):
        for e in entries if isinstance(entries, list) else []:
            if e.get("safe_name") and e.get("natural_prompt"):
                items.append({
                    "id": e["safe_name"], "group": _clean_label(group), "label": _clean_label(e.get("key", e["safe_name"])),
                    "prompt": e["natural_prompt"], "tags": e.get("description", ""), "nsfw": "sexual" in str(group).lower(),
                })
    if not items:
        items = [{"id": i, "group": g, "label": i, "prompt": p, "tags": i, "nsfw": False} for i, g, p in FALLBACK_EXPRESSIONS]
    _expr_cache["items"] = items
    return items


def _clean_label(s: str) -> str:
    return "".join(ch for ch in str(s) if ch.isascii()).strip() or str(s).strip()


def _open_image(data: bytes) -> Image.Image:
    if len(data) > 40 * 1024 * 1024:
        raise ValueError("Ukuran gambar maksimal 40 MB")
    try:
        im = Image.open(io.BytesIO(data))
        im.load()
    except Exception:
        raise ValueError("File bukan gambar yang valid")
    return ImageOps.exif_transpose(im)


def is_lineart(path: Path) -> bool:
    """Uncolored charsheet: nearly no saturation and mostly white paper."""
    with Image.open(path) as im:
        small = im.convert("RGB").resize((256, 256))
    sat = sum(small.convert("HSV").getchannel("S").getdata()) / 65536
    white = sum(1 for x in small.convert("L").getdata() if x > 230) / 65536
    return sat < 12 and white > 0.6


def save_sheet(data: bytes, filename: str) -> dict:
    im = _open_image(data)
    sid = uuid.uuid4().hex[:10]
    if im.mode in ("RGBA", "LA", "P"):
        im = im.convert("RGBA")
        im = Image.alpha_composite(Image.new("RGBA", im.size, (255, 255, 255, 255)), im)
    im.convert("RGB").save(SHEETS_DIR / f"{sid}.png")
    return {"id": sid, "name": Path(filename or "charsheet").stem[:60], "width": im.width, "height": im.height,
            "lineart": is_lineart(SHEETS_DIR / f"{sid}.png")}


def sheet_path(sid: str) -> Path:
    p = SHEETS_DIR / f"{sid}.png"
    if not sid.isalnum() or not p.exists():
        raise ValueError("Charsheet tidak ditemukan")
    return p


def sheet_panels(sid: str) -> list:
    """Split a charsheet into its figures (full-body view, face close-up, ...).

    Returns [body] or [body, face]: the tallest panel is the full-body reference, and the
    largest other panel (if any) is passed as a face-detail reference. Feeding the whole
    sheet makes Qwen copy its layout (it redraws the extra close-up panel)."""
    import cv2
    import numpy as np
    src = sheet_path(sid)
    cached = [SHEETS_DIR / f"{sid}_body.png", SHEETS_DIR / f"{sid}_face.png"]
    if cached[0].exists():
        return [c for c in cached if c.exists()]
    im = Image.open(src).convert("RGB")
    scale = 512 / max(im.size)
    small = np.asarray(im.resize((max(1, int(im.width * scale)), max(1, int(im.height * scale)))).convert("L"))
    mask = (small < 235).astype(np.uint8)
    mask = cv2.dilate(mask, np.ones((7, 7), np.uint8))
    n, _, stats, _ = cv2.connectedComponentsWithStats(mask, connectivity=8)
    boxes = [stats[i] for i in range(1, n) if stats[i][4] > 0.01 * mask.size]
    if len(boxes) < 2:
        return [src]
    boxes.sort(key=lambda b: b[3], reverse=True)
    out = []
    for b, dst in zip(boxes[:2], cached):
        x, y, w, h = (int(v / scale) for v in b[:4])
        pad = int(0.04 * max(w, h))
        crop = im.crop((max(0, x - pad), max(0, y - pad), min(im.width, x + w + pad), min(im.height, y + h + pad)))
        crop.save(dst)
        out.append(dst)
    if boxes[0][3] < 0.5 * small.shape[0]:  # no clear full-body figure: keep the sheet as is
        for c in cached:
            c.unlink(missing_ok=True)
        return [src]
    return out


def build_prompt(pose: dict, expr: dict | None, lineart: bool, face_ref: bool = False) -> str:
    framing = "Upper body portrait" if pose.get("kind") == "portrait" else "Full body"
    face = expr["prompt"] if expr else "The character has a calm neutral expression."
    return (f"Draw the character from picture 1 in a new pose: {pose.get('prompt') or pose['label']}. {face} "
            "Keep the character's face, hair, accessories, outfit, shoes, body proportions, head-to-body ratio and height "
            "exactly as in picture 1, with the same art style, line weight, line quality and coloring. "
            + ("Picture 2 is a close-up of the same character's face; use it only for face, eye and hair details. " if face_ref else "")
            + f"Draw one single character only, no extra panels or close-ups. {framing}, plain white background."
            + (LINEART_LOCK if lineart else ""))


# ---------------------------------------------------------------- jobs

def _job_dir(jid: str) -> Path:
    if not jid.isalnum():
        raise ValueError("Job tidak valid")
    return JOBS_DIR / jid


def _load(jid: str) -> dict:
    job = _read_json(_job_dir(jid) / "job.json", None)
    if job is None:
        raise ValueError("Job tidak ditemukan")
    return job


def _save(job: dict):
    _write_json(_job_dir(job["id"]) / "job.json", job)


def _caption(job: dict, pose: dict, expr: dict | None, lineart: bool) -> str:
    tags = job.get("caption_style") == "tags"
    parts = [job.get("trigger", "").strip(), job.get("description", "").strip()]
    if expr:
        parts.append(expr["tags"].replace("_", " ") if tags else expr["prompt"])
    else:
        parts.append("neutral expression" if tags else "The character has a calm neutral expression")
    framing = "upper body" if pose.get("kind") == "portrait" else "full body"
    parts.append(f"{framing}, {pose['label']}")
    parts.append("black and white manga lineart, white background" if lineart else "simple white background")
    if job.get("caption_extra", "").strip():
        parts.append(job["caption_extra"].strip())
    return ", ".join(p.rstrip(".") for p in parts if p)


def create_job(data: dict) -> dict:
    sheets = [s for s in data.get("sheets", []) if s]
    for s in sheets:
        sheet_path(s)
    if not sheets:
        raise ValueError("Upload minimal satu charsheet")
    lib = {p["id"]: p for p in poses()}
    pose_ids = [p for p in data.get("poses", []) if p in lib]
    if not pose_ids:
        raise ValueError("Pilih minimal satu pose")
    exprs = {e["id"]: e for e in expressions()}
    expr_ids = [e for e in data.get("expressions", []) if e in exprs]
    include_neutral = bool(data.get("include_neutral", True))
    if not expr_ids and not include_neutral:
        raise ValueError("Pilih ekspresi atau aktifkan ekspresi netral")
    dataset = str(data.get("dataset", "")).strip()
    if not dataset:
        raise ValueError("Isi nama dataset tujuan")
    variants = max(1, min(4, int(data.get("variants", 1))))
    limit = int(data.get("limit", 0) or 0)

    rng = random.Random()
    items = []
    for sid in sheets:
        for pid in pose_ids:
            for eid in ([None] if include_neutral else []) + expr_ids:
                for _ in range(variants):
                    items.append({"sheet": sid, "pose": pid, "expression": eid, "seed": rng.randint(1, 2**31 - 1),
                                  "status": "queued", "file": None, "up_file": None, "lineart_file": None,
                                  "dataset_file": None, "lineart_dataset_file": None, "error": "", "approved": True})
    if limit and len(items) > limit:
        rng.shuffle(items)
        items = items[:limit]
    if len(items) > 2000:
        raise ValueError(f"Terlalu banyak kombinasi ({len(items)}). Batasi maksimal 2000 gambar.")
    for n, it in enumerate(items):
        it["id"] = n

    jid = uuid.uuid4().hex[:12]
    job = {
        "id": jid, "name": str(data.get("name") or dataset)[:80], "created": time.time(), "started": None, "finished": None,
        "status": "queued", "dataset": dataset, "trigger": str(data.get("trigger", "")).strip(),
        "description": str(data.get("description", "")).strip(), "caption_style": data.get("caption_style", "natural"),
        "caption_extra": str(data.get("caption_extra", "")), "sheets": sheets,
        "upscale": bool(data.get("upscale", True)), "lineart_twin": bool(data.get("lineart_twin", True)),
        "sheet_lineart": {s: is_lineart(sheet_path(s)) for s in sheets},
        "items": items, "message": "Menunggu giliran",
        "poses_snapshot": {pid: lib[pid] for pid in pose_ids},
        "expressions_snapshot": {eid: exprs[eid] for eid in expr_ids},
    }
    _job_dir(jid).mkdir(parents=True)
    _save(job)
    WORKER.enqueue(jid)
    return view(job)


def lineart_dataset(job: dict) -> str:
    return job["dataset"] + "_lineart"


def view(job: dict) -> dict:
    items = job["items"]
    out = {k: v for k, v in job.items() if k not in ("poses_snapshot", "expressions_snapshot")}
    out["progress"] = {"done": sum(1 for i in items if i["status"] == "done"),
                       "failed": sum(1 for i in items if i["status"] == "failed"),
                       "generated": sum(1 for i in items if i["file"]), "total": len(items),
                       "approved": sum(1 for i in items if i["status"] == "done" and i["approved"])}
    out["lineart_dataset"] = lineart_dataset(job) if job.get("lineart_twin") else None
    for it in out["items"]:
        pose = job["poses_snapshot"].get(it["pose"], {"label": "?"})
        expr = job["expressions_snapshot"].get(it["expression"]) if it["expression"] else None
        it["pose_label"] = pose["label"]
        it["expression_label"] = expr["label"] if expr else "neutral"
        it["display_file"] = it.get("up_file") or it.get("file")
    return out


def list_jobs() -> list:
    out = []
    for d in sorted(JOBS_DIR.iterdir(), key=lambda p: p.stat().st_mtime, reverse=True):
        job = _read_json(d / "job.json", None)
        if job and "groups" not in job:  # v1 (ComfyUI) jobs are no longer listed
            v = view(job)
            v.pop("items", None)
            out.append(v)
    return out


def get_job(jid: str) -> dict:
    with _lock:
        return view(_load(jid))


def job_file(jid: str, name: str) -> Path:
    p = (_job_dir(jid) / name).resolve()
    if p.parent != _job_dir(jid).resolve() or p.suffix != ".png" or not p.exists():
        raise ValueError("File tidak ditemukan")
    return p


def cancel_job(jid: str) -> dict:
    with _lock:
        job = _load(jid)
        if job["status"] in ("queued", "running"):
            job["status"] = "stopped"
            job["message"] = "Dihentikan"
            for it in job["items"]:
                if it["status"] in ("queued", "running", "upscaling"):
                    it["status"] = "skipped"
            _save(job)
    WORKER.cancel(jid)
    return get_job(jid)


def delete_job(jid: str):
    cancel_job(jid)
    shutil.rmtree(_job_dir(jid), ignore_errors=True)


def _unpublish(job: dict, it: dict):
    for key, ds in (("dataset_file", job["dataset"]), ("lineart_dataset_file", lineart_dataset(job))):
        if it.get(key):
            try:
                datasets.delete_image(ds, it[key])
            except ValueError:
                pass
            it[key] = None


def set_approved(jid: str, item_id: int, approved: bool) -> dict:
    with _lock:
        job = _load(jid)
        it = job["items"][int(item_id)]
        if it["status"] != "done":
            raise ValueError("Gambar belum selesai")
        it["approved"] = bool(approved)
        if approved and not it["dataset_file"]:
            _publish(job, it)
        elif not approved:
            _unpublish(job, it)
        _save(job)
        return view(job)


def retry_item(jid: str, item_id: int, new_pose: bool = False) -> dict:
    with _lock:
        job = _load(jid)
        it = job["items"][int(item_id)]
        if it["status"] in ("queued", "running", "upscaling"):
            raise ValueError("Gambar ini masih dalam antrean")
        _unpublish(job, it)
        it.update(status="queued", file=None, up_file=None, lineart_file=None, error="", approved=True,
                  seed=random.randint(1, 2**31 - 1))
        if job["status"] in ("completed", "failed", "stopped"):
            job["status"] = "queued"
            job["message"] = "Menunggu giliran"
        _save(job)
    WORKER.enqueue(jid)
    return get_job(jid)


def _ensure_dataset(name: str, trigger: str, style: str):
    if name not in {d["name"] for d in datasets.list_datasets()}:
        datasets.create(name, trigger_word=trigger, caption_style=style)


def _publish(job: dict, it: dict):
    pose = job["poses_snapshot"][it["pose"]]
    expr = job["expressions_snapshot"].get(it["expression"]) if it["expression"] else None
    sheet_is_lineart = job["sheet_lineart"].get(it["sheet"], False)
    jdir = _job_dir(job["id"])
    stem = f"{job['id'][:6]}_{it['id']:04d}_{(expr['id'] if expr else 'neutral')}"
    _ensure_dataset(job["dataset"], job["trigger"], job["caption_style"])
    src = jdir / (it.get("up_file") or it["file"])
    name = datasets.save_upload(job["dataset"], stem + ".png", src.read_bytes())
    datasets.set_caption(job["dataset"], name, _caption(job, pose, expr, sheet_is_lineart))
    it["dataset_file"] = name
    if it.get("lineart_file"):
        ds = lineart_dataset(job)
        _ensure_dataset(ds, job["trigger"], job["caption_style"])
        name = datasets.save_upload(ds, stem + ".png", (jdir / it["lineart_file"]).read_bytes())
        datasets.set_caption(ds, name, _caption(job, pose, expr, True))
        it["lineart_dataset_file"] = name


def _trim(im: Image.Image) -> Image.Image:
    """Trim empty white margins so the character fills the frame."""
    im = im.convert("RGB")
    box = im.convert("L").point(lambda v: 255 if v < 245 else 0).getbbox()
    if not box:
        return im
    pad = int(0.04 * max(im.size))
    box = (max(0, box[0] - pad), max(0, box[1] - pad), min(im.width, box[2] + pad), min(im.height, box[3] + pad))
    return im.crop(box) if (box[2] - box[0]) * (box[3] - box[1]) > 0.2 * im.width * im.height else im


def _lineart_twin(src: Path, dst: Path, stroke_px: float):
    from .generation import s2f
    with Image.open(src) as im:
        out = s2f.extract_lineart(im.convert("RGB"), im.size, stroke_px, fills=True)
    out.save(dst)


class Worker:
    def __init__(self):
        self.queue = []
        self.cv = threading.Condition()
        self.current = None
        self.cancelled = set()
        self.started = False
        self.proc = None

    def start(self):
        if self.started:
            return
        self.started = True
        for d in JOBS_DIR.iterdir():
            job = _read_json(d / "job.json", None)
            if job and "groups" not in job and job["status"] in ("queued", "running"):
                for it in job["items"]:
                    if it["status"] == "running":
                        it["status"] = "queued"
                    if it["status"] == "upscaling":
                        it["status"] = "generated"
                job["status"] = "queued"
                _save(job)
                self.queue.append(job["id"])
        threading.Thread(target=self._loop, daemon=True, name="dsgen-worker").start()

    def enqueue(self, jid: str):
        with self.cv:
            self.cancelled.discard(jid)
            if jid not in self.queue and jid != self.current:
                self.queue.append(jid)
            self.cv.notify()

    def cancel(self, jid: str):
        with self.cv:
            if jid in self.queue:
                self.queue.remove(jid)
            self.cancelled.add(jid)
            if self.current == jid and self.proc and self.proc.poll() is None:
                self.proc.kill()

    def _loop(self):
        while True:
            with self.cv:
                while not self.queue:
                    self.cv.wait()
                jid = self.queue.pop(0)
                self.current = jid
            try:
                while True:  # a retry during the run leaves queued items behind
                    self._run(jid)
                    if jid in self.cancelled or not any(i["status"] in ("queued", "generated") for i in _load(jid)["items"]):
                        break
            except Exception as exc:  # never kill the worker thread
                with _lock:
                    try:
                        job = _load(jid)
                        job["status"] = "failed"
                        job["message"] = str(exc)[:500]
                        _save(job)
                    except ValueError:
                        pass
            finally:
                with self.cv:
                    self.current = None

    def _update(self, jid, fn):
        with _lock:
            job = _load(jid)
            fn(job)
            _save(job)
            return job

    def _run(self, jid: str):
        from .generation.engine import ENGINE
        is_cancelled = lambda: jid in self.cancelled
        cfg = config()
        jdir = _job_dir(jid)
        self._update(jid, lambda j: j.update(message="Menunggu GPU (training/generate lain selesai dulu)"))
        with gpu.lease:
            if is_cancelled():
                return
            gpu.check_external_engine()
            job = self._update(jid, lambda j: j.update(status="running", started=j["started"] or time.time()))

            # ---- phase 1: Qwen-Image 2.1
            todo = [i for i in job["items"] if i["status"] == "queued"]
            if todo:
                if ENGINE.state != "ready":
                    self._update(jid, lambda j: j.update(message="Memuat Qwen-Image 2.1 (sekali per batch)"))
                    ENGINE.start()
                    while ENGINE.state == "starting":
                        if is_cancelled():
                            return
                        time.sleep(2)
                    if ENGINE.state != "ready":
                        raise RuntimeError("Engine Qwen-Image 2.1 gagal menyala: " + ENGINE.message)
                for it in todo:
                    if is_cancelled():
                        return
                    job = _load(jid)
                    pose = job["poses_snapshot"][it["pose"]]
                    expr = job["expressions_snapshot"].get(it["expression"]) if it["expression"] else None
                    lin = job["sheet_lineart"].get(it["sheet"], False)
                    label = f"{pose['label']} · {expr['label'] if expr else 'neutral'}"
                    self._update(jid, lambda j, iid=it["id"]: (j["items"][iid].update(status="running"),
                                 j.update(message=f"Generate {label}")))
                    try:
                        refs = sheet_panels(it["sheet"])
                        res = ENGINE.generate(None, build_prompt(pose, expr, lin, len(refs) > 1), refs, it["seed"],
                                              sample_overrides={"width": cfg["width"], "height": cfg["height"],
                                                                "num_inference_steps": cfg["steps"],
                                                                "guidance_scale": cfg["guidance"]})
                        ifile = f"item_{it['id']:04d}_{it['seed']}.png"
                        im = Image.open(res).convert("RGB")
                        (im.convert("L").convert("RGB") if lin else im).save(jdir / ifile)
                        self._update(jid, lambda j, iid=it["id"]: j["items"][iid].update(status="generated", file=ifile, error=""))
                    except Exception as exc:
                        if is_cancelled():
                            return
                        self._update(jid, lambda j, iid=it["id"], e=str(exc): j["items"][iid].update(status="failed", error=e[:300]))

            # ---- phase 2: SeedVR2 2x, then lineart twin + publish
            job = _load(jid)
            ready = [i for i in job["items"] if i["status"] == "generated"]
            if not ready:
                return self._finish(jid)
            ENGINE.stop()  # free VRAM for SeedVR2
            ups = {}
            if job.get("upscale") and (Path(cfg["seedvr2_dir"]) / "inference_cli.py").exists():
                self._update(jid, lambda j: ([j["items"][i["id"]].update(status="upscaling") for i in ready],
                                             j.update(message=f"SeedVR2: upscale {len(ready)} gambar")))
                ups = self._seedvr2(jid, [jdir / i["file"] for i in ready], cfg)
                if is_cancelled():
                    return
            for it in ready:
                if is_cancelled():
                    return
                try:
                    src = ups.get(it["file"])
                    up_file = None
                    if src and src.exists():
                        up_file = it["file"].replace(".png", "_2x.png")
                        im = Image.open(src).convert("RGB")
                        if job["sheet_lineart"].get(it["sheet"], False):
                            im = im.convert("L").convert("RGB")
                        _trim(im).save(jdir / up_file)
                    else:
                        _trim(Image.open(jdir / it["file"])).save(jdir / it["file"])
                    base = jdir / (up_file or it["file"])
                    lin_file = None
                    if job.get("lineart_twin") and not job["sheet_lineart"].get(it["sheet"], False):
                        lin_file = base.name.replace(".png", "_lineart.png")
                        _lineart_twin(base, jdir / lin_file, cfg["lineart_stroke_px"] * base.width / 768)

                    def done(j, iid=it["id"], u=up_file, l=lin_file):
                        item = j["items"][iid]
                        item.update(status="done", up_file=u, lineart_file=l, error="")
                        if item["approved"]:
                            _publish(j, item)
                    self._update(jid, done)
                except Exception as exc:
                    self._update(jid, lambda j, iid=it["id"], e=str(exc): j["items"][iid].update(status="failed", error=e[:300]))
            self._finish(jid)

    def _seedvr2(self, jid: str, files: list, cfg: dict) -> dict:
        """One CLI run for the whole batch (model loads once). Returns {input name: output path}."""
        work = _job_dir(jid) / "svr_in"
        out = _job_dir(jid) / "svr_out"
        shutil.rmtree(work, ignore_errors=True)
        shutil.rmtree(out, ignore_errors=True)
        work.mkdir()
        for f in files:
            shutil.copyfile(f, work / f.name)
        cmd = [_python(), "inference_cli.py", str(work), "--output", str(out), "--dit_model", cfg["seedvr2_model"],
               "--resolution", str(cfg["upscale_short_side"]), "--batch_size", "1", "--color_correction", "lab",
               "--vae_encode_tiled", "--vae_decode_tiled"]
        log = open(_job_dir(jid) / "seedvr2.log", "w", encoding="utf-8")
        env = dict(os.environ, PYTHONIOENCODING="utf-8")
        flags = getattr(subprocess, "CREATE_NO_WINDOW", 0)
        self.proc = subprocess.Popen(cmd, cwd=cfg["seedvr2_dir"], stdout=log, stderr=subprocess.STDOUT, env=env, creationflags=flags)
        self.proc.wait()
        log.close()
        self.proc = None
        shutil.rmtree(work, ignore_errors=True)
        return {f.name: out / f.name for f in files}

    def _finish(self, jid: str):
        def finish(j):
            if j["status"] != "running" or any(i["status"] in ("queued", "generated") for i in j["items"]):
                return
            failed = sum(1 for i in j["items"] if i["status"] == "failed")
            ok = sum(1 for i in j["items"] if i["status"] == "done")
            j["status"] = "completed" if ok else "failed"
            j["finished"] = time.time()
            extra = f" dan '{lineart_dataset(j)}'" if j.get("lineart_twin") and any(i.get("lineart_file") for i in j["items"]) else ""
            j["message"] = f"{ok} gambar masuk dataset '{j['dataset']}'{extra}" + (f", {failed} gagal" if failed else "")
        self._update(jid, finish)


WORKER = Worker()
