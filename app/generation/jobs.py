"""Job store (SQLite) and the single GPU worker. One job runs at a time:
prepare -> stage 1 -> binarize -> stage 2 -> upscale (2-stage mode), or
prepare -> sketch->final -> lineart extraction -> upscale (one-stage "s2f" mode)."""
import json
import queue
import random
import shutil
import sqlite3
import threading
import time
import traceback
import uuid
from contextlib import contextmanager
from pathlib import Path

from PIL import Image

from . import images
from . import prompts
from . import s2f
from .engine import ENGINE, EngineError
from .settings import CFG, DATA, JOBS_DIR, SIZE, path, pick, stage1_options, stage2_options
def upscale4x(*args, **kwargs):
    # Keep torch in the configured AI Toolkit environment, outside the lightweight API.
    from .upscale_client import upscale
    return upscale(*args, **kwargs)

DB = DATA / "studio.db"
_db_lock = threading.Lock()
_queue: "queue.Queue[str]" = queue.Queue()
_live = {}  # job id -> engine request id currently running


@contextmanager
def _conn():
    c = sqlite3.connect(DB, check_same_thread=False)
    c.row_factory = sqlite3.Row
    try:
        with c:
            yield c
    finally:
        c.close()


def init():
    with _db_lock, _conn() as c:
        c.execute("""create table if not exists jobs(
            id text primary key, created real, status text, stage text, step int, total int,
            message text, params text, files text, error text, finished real)""")
        cols = {r[1] for r in c.execute("pragma table_info(jobs)")}
        for col in ("batch", "name"):
            if col not in cols:
                c.execute(f"alter table jobs add column {col} text")
        # Jobs interrupted by a restart go back to the queue.
        for row in c.execute("select id from jobs where status in ('queued','running') order by created"):
            c.execute("update jobs set status='queued', stage='queued', message='Dilanjutkan setelah restart' where id=?", (row["id"],))
            _queue.put(row["id"])
    threading.Thread(target=_worker, daemon=True, name="gpu-worker").start()


def _update(job_id, **fields):
    for k in ("params", "files"):
        if k in fields and not isinstance(fields[k], str):
            fields[k] = json.dumps(fields[k], ensure_ascii=False)
    sets = ", ".join(f"{k}=?" for k in fields)
    with _db_lock, _conn() as c:
        c.execute(f"update jobs set {sets} where id=?", (*fields.values(), job_id))


def _row(r):
    d = dict(r)
    d["params"] = json.loads(d["params"] or "{}")
    d["files"] = json.loads(d["files"] or "{}")
    return d


def get(job_id):
    with _db_lock, _conn() as c:
        r = c.execute("select * from jobs where id=?", (job_id,)).fetchone()
    return _row(r) if r else None


def list_jobs(limit=60, batch=None):
    with _db_lock, _conn() as c:
        if batch:
            rows = c.execute("select * from jobs where batch=? order by created", (batch,)).fetchall()
        else:
            rows = c.execute("select * from jobs order by created desc limit ?", (limit,)).fetchall()
    return [_row(r) for r in rows]


def list_batches():
    with _db_lock, _conn() as c:
        rows = c.execute("""select batch, min(created) created, count(*) n,
            sum(status='done') done, sum(status='error') failed, sum(status in ('queued','running')) active
            from jobs where batch is not null group by batch order by created desc""").fetchall()
    return [dict(r) for r in rows]


def queue_position(job_id):
    with _db_lock, _conn() as c:
        rows = c.execute("select id from jobs where status='queued' order by created").fetchall()
    ids = [r["id"] for r in rows]
    return ids.index(job_id) + 1 if job_id in ids else 0


def _seed(p):
    seed = p.get("seed")
    seed = int(seed) if seed not in (None, "", -1, "-1") else random.randint(0, 2**31 - 1)
    if not 0 <= seed <= 2**32 - 1:
        raise ValueError("Seed harus antara 0 dan 4294967295")
    return seed


def resolve_s2f(p):
    """One-stage sketch->final: validate and freeze caption, checkpoint, sampling and lineart settings."""
    chars = [c for c in (p.get("characters") or []) if c]
    if not isinstance(p.get("characters"), list) or not 1 <= len(chars) <= 4 or len(set(chars)) != len(chars):
        raise ValueError("Pilih 1 sampai 4 karakter berbeda")
    table = s2f.characters()
    for c in chars:
        if c not in table:
            raise ValueError(f"Karakter tidak dikenal: {c}")
    ck = s2f.pick_checkpoint(p.get("checkpoint"))
    d = s2f.settings_view()
    common = dict(characters=chars, outfits=p.get("outfits") or {}, chibi=bool(p.get("chibi")), props=p.get("props") or [],
                  scene=(p.get("scene") or "").strip(), expression=(p.get("expression") or "").strip(), note=p.get("note") or "")
    prompt = (p.get("prompt_s2f") or "").strip() or s2f.caption(**common)
    guidance = float(p.get("guidance") if p.get("guidance") not in (None, "") else d["guidance"])
    steps = int(p.get("steps") or d["steps"])
    stroke = float(p.get("stroke_px") if p.get("stroke_px") not in (None, "") else d["stroke_px"])
    if not (1.0 <= guidance <= 8 and 10 <= steps <= 80 and 1.0 <= stroke <= 6):
        raise ValueError("Guidance 1-8, steps 10-80, ketebalan garis 1-6")
    sizes = [s for s in (p.get("sizes") or []) if s in CFG["outputs"]]
    orientation = p.get("orientation") or "auto"
    if orientation not in ("auto", "portrait", "landscape"):
        raise ValueError("Orientasi harus auto, portrait, atau landscape")
    return dict(common, mode="s2f", checkpoint=ck["id"], checkpoint_path=ck["path"], prompt_s2f=prompt, seed=_seed(p),
                train_size=list(ck.get("size") or SIZE), orientation=orientation,
                guidance=guidance, steps=steps, sizes=sizes, stroke_px=stroke, lineart_fills=bool(p.get("lineart_fills")),
                lineart_from_upscaled=bool(p.get("lineart_from_upscaled")) and bool(sizes),
                skip_stage1=False, parent=p.get("parent"))


def resolve_params(p):
    """Validate the form and freeze everything the run needs (prompts, LoRAs, seed)."""
    if p.get("mode") == "s2f":
        return resolve_s2f(p)
    if not isinstance(p.get("characters"), list) or not all(isinstance(c, str) for c in p["characters"]):
        raise ValueError("Pilih karakter dari daftar")
    chars = [c for c in p.get("characters", []) if c]
    if len(set(chars)) != len(chars):
        raise ValueError("Karakter tidak boleh dipilih dua kali")
    if not 1 <= len(chars) <= 4:
        raise ValueError("Pilih 1 sampai 4 karakter")
    known = set(images.characters())
    for c in chars:
        if c not in known:
            raise ValueError(f"Karakter tidak dikenal: {c}")
    s1 = pick(stage1_options(), p.get("stage1_lora"))
    s2 = pick(stage2_options(), p.get("stage2_lora"))
    common = dict(characters=chars, outfits=p.get("outfits") or {}, chibi=bool(p.get("chibi")),
                  props=p.get("props") or [], age=p.get("age") or "default", note=p.get("note") or "")
    prompt1 = (p.get("prompt_stage1") or "").strip() or prompts.build("stage1", with_props=s1["with_props"], **common)
    prompt2 = (p.get("prompt_stage2") or "").strip() or prompts.build("stage2", **common)
    seed = p.get("seed")
    seed = int(seed) if seed not in (None, "", -1, "-1") else random.randint(0, 2**31 - 1)
    if not 0 <= seed <= 2**32 - 1:
        raise ValueError("Seed harus antara 0 dan 4294967295")
    want_4k = p.get("want_4k", "4k" in (p.get("sizes") or []))
    sizes = ["2k"] + (["4k"] if want_4k else [])
    return dict(common, stage1_lora=s1["id"], stage1_lora_path=s1["path"], stage1_uses_reference=s1["uses_reference"],
                stage2_lora=s2["id"], stage2_lora_path=s2["path"], prompt_stage1=prompt1, prompt_stage2=prompt2,
                seed=seed, sizes=sizes, skip_stage1=bool(p.get("skip_stage1")), parent=p.get("parent"))


def create(params, sketch: Image.Image = None, lineart: Image.Image = None, batch=None, name=None):
    """sketch: user's rough sketch. lineart: optional corrected lineart (skips stage 1, 2-stage mode only)."""
    if sketch is None and lineart is None:
        raise ValueError("Upload sketch atau lineart")
    s2f_mode = params.get("mode") == "s2f"
    if s2f_mode and sketch is None:
        raise ValueError("Mode sketch->final butuh sketch")
    reference = s2f.reference(params["characters"]) if s2f_mode else images.composite_reference(params["characters"])
    params = dict(params, skip_stage1=lineart is not None and not s2f_mode)
    if s2f_mode:
        lineart = None
    job_id = time.strftime("%Y%m%d-%H%M%S") + "-" + uuid.uuid4().hex[:6]
    folder = JOBS_DIR / job_id
    folder.mkdir(parents=True)
    files = {}
    size = SIZE
    if s2f_mode:
        # Generate at the checkpoint's training resolution; landscape sketches (e.g. 16:9 MV frames) get the
        # same pixel budget turned sideways.
        w, h = params.get("train_size") or SIZE
        wide = params.get("orientation") == "landscape" or (params.get("orientation", "auto") == "auto" and sketch.width > sketch.height)
        size = (max(w, h), min(w, h)) if wide else (min(w, h), max(w, h))
        params["size"] = list(size)
    if sketch is not None:
        images.fit(images.rgb(sketch), size=size).save(folder / "sketch.png")
        files["sketch"] = "sketch.png"
    if lineart is not None:
        images.binarize(images.fit(images.rgb(lineart))).save(folder / "lineart.png")
        files["lineart"] = "lineart.png"
        params["skip_stage1"] = True
    if "sketch" not in files and "lineart" not in files:
        raise ValueError("Upload sketch atau lineart")
    reference.save(folder / "reference.png")
    files["reference"] = "reference.png"
    with _db_lock, _conn() as c:
        c.execute("insert into jobs(id, created, status, stage, step, total, message, params, files, batch, name) values(?,?,?,?,?,?,?,?,?,?,?)",
                  (job_id, time.time(), "queued", "queued", 0, 0, "Menunggu antrean",
                   json.dumps(params, ensure_ascii=False), json.dumps(files), batch, name))
    _queue.put(job_id)
    return job_id


def derive(parent_id, overrides, mode="stage2", lineart: Image.Image = None):
    """New job from an earlier one with the same sketch and characters.
    mode 'stage2': reuse the parent's (or a corrected) lineart, run only stage 2.
    mode 'all': run both stages again from the sketch."""
    parent = get(parent_id)
    if not parent:
        raise ValueError("Job asal tidak ditemukan")
    src = JOBS_DIR / parent_id
    p = dict(parent["params"])
    p.update({k: v for k, v in overrides.items() if v is not None})
    p["parent"] = parent_id
    if "seed" not in overrides or overrides.get("seed") in (None, ""):
        p["seed"] = None
    p["skip_stage1"] = False
    params = resolve_params(p)
    sketch = Image.open(src / "sketch.png") if (src / "sketch.png").exists() else None
    if params.get("mode") == "s2f":
        if sketch is None:
            raise ValueError("Job asal tidak punya sketch")
        return create(params, sketch=sketch, batch=parent.get("batch"), name=parent.get("name"))
    if mode == "stage2" and lineart is None:
        if not (src / "lineart.png").exists():
            raise ValueError("Job asal belum punya lineart")
        lineart = Image.open(src / "lineart.png")
    if mode == "all":
        lineart = None
        if sketch is None:
            raise ValueError("Job asal tidak punya sketch")
    return create(params, sketch=sketch, lineart=lineart)


def create_batch(label, items):
    """items: list of (params_dict_unresolved, sketch_image, name). All validated before anything is queued."""
    if not items:
        raise ValueError("Batch kosong")
    resolved = []
    for raw, sketch, name in items:
        try:
            resolved.append((resolve_params(dict(raw, mode="s2f")), sketch, name))
        except ValueError as e:
            raise ValueError(f"{name}: {e}")
    safe = "".join(ch if ch.isalnum() or ch in "-_" else "_" for ch in (label or "").strip())[:40]
    batch = time.strftime("%Y%m%d-%H%M%S") + (f"_{safe}" if safe else "")
    ids = [create(p, sketch=s, batch=batch, name=n) for p, s, n in resolved]
    return batch, ids


def outputs_dir(batch):
    return path(CFG.get("sketch2final", {}).get("outputs_dir", "outputs")) / batch


def _export(job_id, folder, files, p, batch, name):
    """Copy a finished batch item to outputs/<batch>/<name>/ (final, lineart, caption, settings)."""
    out = outputs_dir(batch) / Path(name).stem
    out.mkdir(parents=True, exist_ok=True)
    for key, fname in files.items():
        if key in ("sketch", "reference", "final", "lineart") or key.startswith(("final_", "lineart_")):
            shutil.copyfile(folder / fname, out / fname)
    s2f.save_meta(out, dict(p, job_id=job_id, source=name))


def relineart(job_id, stroke_px=None, fills=None, from_upscaled=None):
    """Re-extract lineart from a finished s2f final with new settings (CPU only, no engine)."""
    j = get(job_id)
    if not j or j["status"] != "done" or j["params"].get("mode") != "s2f":
        raise ValueError("Hanya untuk job sketch->final yang sudah selesai")
    p, files = dict(j["params"]), dict(j["files"])
    if stroke_px is not None:
        p["stroke_px"] = float(stroke_px)
    if fills is not None:
        p["lineart_fills"] = bool(fills)
    if from_upscaled is not None:
        p["lineart_from_upscaled"] = bool(from_upscaled) and bool(p.get("sizes"))
    _lineart(JOBS_DIR / job_id, files, p)
    _update(job_id, params=p, files=files, finished=time.time())
    if j.get("batch"):
        _export(job_id, JOBS_DIR / job_id, files, p, j["batch"], j.get("name") or job_id)
    return get(job_id)


def _size(p):
    return tuple(p.get("size") or SIZE)


def _out_size(k, p):
    """2K/4K output size, turned sideways for landscape jobs."""
    w, h = CFG["outputs"][k]
    s = _size(p)
    return (max(w, h), min(w, h)) if s[0] > s[1] else (min(w, h), max(w, h))


def _lineart(folder, files, p):
    """lineart.png (768) from final.png; lineart_<size>.png from the upscaled final when available."""
    big_key = next((f"final_{k}" for k in ("4k", "2k") if f"final_{k}" in files), None)
    with Image.open(folder / "final.png") as im:
        small = s2f.extract_lineart(im, _size(p), p["stroke_px"], p["lineart_fills"])
    small.save(folder / "lineart.png")
    files["lineart"] = "lineart.png"
    for k in p.get("sizes", []):
        size = _out_size(k, p)
        if p.get("lineart_from_upscaled") and big_key:
            with Image.open(folder / files[big_key]) as im:
                big = s2f.extract_lineart(im, size, p["stroke_px"], p["lineart_fills"])
        else:
            big = images.binarize(small.resize(size, Image.Resampling.LANCZOS))
        big.save(folder / f"lineart_{k}.png")
        files[f"lineart_{k}"] = f"lineart_{k}.png"


def cancel(job_id):
    j = get(job_id)
    if not j or j["status"] not in ("queued", "running"):
        return False
    _update(job_id, status="cancelled", stage="cancelled", message="Dibatalkan", finished=time.time())
    rid = _live.get(job_id)
    if rid:
        ENGINE.cancel(rid)
    return True


def _worker():
    while True:
        job_id = _queue.get()
        j = get(job_id)
        if not j or j["status"] != "queued":
            continue
        try:
            _run(j)
        except Exception as e:
            if get(job_id)["status"] == "cancelled":
                continue
            traceback.print_exc()
            _update(job_id, status="error", error=str(e), message="Gagal: " + str(e)[:200], finished=time.time())
        finally:
            _live.pop(job_id, None)


def _check_cancel(job_id):
    if get(job_id)["status"] == "cancelled":
        raise EngineError("cancelled")


def _run(j):
    from .. import gpu
    _update(j["id"], message="Menunggu giliran GPU", stage="waiting_gpu")
    with gpu.lease:
        _check_cancel(j["id"])
        gpu.owner = "generation"
        try:
            gpu.check_external_engine()
            return _run_generation(j)
        finally:
            gpu.owner = None


def _run_generation(j):
    job_id, p, files = j["id"], j["params"], dict(j["files"])
    folder = JOBS_DIR / job_id
    _update(job_id, status="running", stage="waiting_engine", message="Menunggu engine")
    while ENGINE.state in ("starting", "stopped"):
        if ENGINE.state == "stopped":
            ENGINE.start()
        _check_cancel(job_id)
        time.sleep(2)
    if ENGINE.state != "ready":
        raise EngineError("Engine gagal menyala: " + ENGINE.message)

    def run_stage(stage, label, lora, prompt, ctrls, out_name, overrides=None, out_size=SIZE):
        _update(job_id, stage=stage, step=0, total=(overrides or CFG["sample"]).get("num_inference_steps", 30), message=label)

        def progress(step, total, msg):
            if step is not None:
                _update(job_id, step=step, total=total or 0, message=f"{label} {step}/{total}")
            elif msg:
                _update(job_id, message=f"{label}: {msg}"[:300])

        result = ENGINE.generate(lora, prompt, ctrls, p["seed"], on_progress=progress,
                                 on_request=lambda rid: _live.__setitem__(job_id, rid), sample_overrides=overrides)
        _check_cancel(job_id)
        with Image.open(result) as im:
            im.convert("RGB").resize(out_size, Image.Resampling.LANCZOS).save(folder / out_name)

    if p.get("mode") == "s2f":
        run_stage("s2f", "Sketch ke final", p["checkpoint_path"], p["prompt_s2f"], [folder / "sketch.png", folder / "reference.png"],
                  "final.png", {"guidance_scale": p["guidance"], "num_inference_steps": p["steps"],
                                "width": _size(p)[0], "height": _size(p)[1]}, out_size=_size(p))
        files["final"] = "final.png"
        _update(job_id, files=files)
        if p.get("sizes"):
            _update(job_id, stage="upscale", step=0, total=0, message="Upscale 4x anime")
            with Image.open(folder / "final.png") as im:
                big = upscale4x(im)
            for k in p["sizes"]:
                big.resize(_out_size(k, p), Image.Resampling.LANCZOS).save(folder / f"final_{k}.png")
                files[f"final_{k}"] = f"final_{k}.png"
            _check_cancel(job_id)
        _update(job_id, stage="lineart", step=0, total=0, message="Ekstrak lineart dari final")
        _lineart(folder, files, p)
        if j.get("batch"):
            _export(job_id, folder, files, p, j["batch"], j.get("name") or job_id)
        _update(job_id, status="done", stage="done", message="Selesai", files=files, finished=time.time())
        return

    if not p.get("skip_stage1"):
        ctrls = [folder / "sketch.png"] + ([folder / "reference.png"] if p["stage1_uses_reference"] else [])
        run_stage("stage1", "Stage 1: sketch ke lineart", p["stage1_lora_path"], p["prompt_stage1"], ctrls, "lineart_raw.png")
        files["lineart_raw"] = "lineart_raw.png"
        with Image.open(folder / "lineart_raw.png") as raw:
            (images.binarize(raw) if CFG.get("binarize_lineart", True) else raw.convert("RGB")).save(folder / "lineart.png")
        files["lineart"] = "lineart.png"
        _update(job_id, files=files)

    run_stage("stage2", "Stage 2: mewarnai", p["stage2_lora_path"], p["prompt_stage2"],
              [folder / "lineart.png", folder / "reference.png"], "final.png")
    files["final"] = "final.png"
    _update(job_id, files=files)

    _update(job_id, stage="upscale", step=0, total=0, message="Upscale 4x anime")
    targets = {k: tuple(CFG["outputs"][k]) for k in p.get("sizes", ["2k"])}
    with Image.open(folder / "final.png") as im:
        big = upscale4x(im)
    for k, size in targets.items():
        big.resize(size, Image.Resampling.LANCZOS).save(folder / f"final_{k}.png")
        files[f"final_{k}"] = f"final_{k}.png"
    _check_cancel(job_id)
    with Image.open(folder / "lineart.png") as im:
        big = upscale4x(im)
    for k, size in targets.items():
        images.binarize(big.resize(size, Image.Resampling.LANCZOS)).save(folder / f"lineart_{k}.png")
        files[f"lineart_{k}"] = f"lineart_{k}.png"
    _check_cancel(job_id)
    _update(job_id, status="done", stage="done", message="Selesai", files=files, finished=time.time())


def delete(job_id):
    j = get(job_id)
    if not j or j["status"] in ("queued", "running"):
        return False
    with _db_lock, _conn() as c:
        c.execute("delete from jobs where id=?", (job_id,))
    shutil.rmtree(JOBS_DIR / job_id, ignore_errors=True)
    return True
