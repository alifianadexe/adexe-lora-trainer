"""Generation API included in the main Adexe server under /api/generate/."""
import io
import json
import zipfile



from typing import List

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse, StreamingResponse
from PIL import Image

from . import images
from . import jobs
from . import prompts
from . import s2f
from .engine import ENGINE
from .settings import CFG, JOBS_DIR, stage1_options, stage2_options


app = FastAPI(title="Adexe Generate Studio")


def _image(upload: UploadFile):
    if upload is None:
        return None
    data = upload.file.read(20 * 1024 * 1024 + 1)
    if len(data) > 20 * 1024 * 1024:
        raise HTTPException(413, "Ukuran gambar maksimal 20 MB")
    if not data:
        return None
    try:
        im = Image.open(io.BytesIO(data))
        im.load()
        return im
    except Exception:
        raise HTTPException(400, f"File '{upload.filename}' bukan gambar yang valid")


def _job_view(j):
    j = dict(j)
    j["queue_position"] = jobs.queue_position(j["id"]) if j["status"] == "queued" else 0
    stamp = int((j.get("finished") or 0) * 1000)  # cache-busts re-extracted lineart
    j["urls"] = {k: f"/api/generate/jobs/{j['id']}/files/{v}?v={stamp}" for k, v in j["files"].items()}
    return j


@app.get("/api/generate/health")
def health():
    return {"engine": ENGINE.health()}


@app.post("/api/generate/engine/start")
def engine_start():
    raise HTTPException(409, "Engine menyala otomatis saat job mendapat giliran GPU.")


@app.post("/api/generate/engine/stop")
def engine_stop():
    from .. import gpu
    if not gpu.lease.acquire(blocking=False):
        raise HTTPException(409, "GPU sedang digunakan. Tunggu proses selesai atau batalkan job terlebih dahulu.")
    try:
        ENGINE.stop()
        return ENGINE.health()
    finally:
        gpu.lease.release()


@app.get("/api/generate/options")
def options():
    return {
        "characters": images.characters(),
        "outfit_presets": prompts.OUTFIT_PRESETS,
        "prop_presets": prompts.PROP_PRESETS,
        "age_variants": prompts.AGE_VARIANTS,
        "stage1_loras": [{k: o[k] for k in ("id", "label", "available", "uses_reference")} for o in stage1_options()],
        "stage2_loras": [{k: o[k] for k in ("id", "label", "available")} for o in stage2_options()],
        "outputs": CFG["outputs"],
        "max_characters": 4,
        "s2f": {
            "characters": s2f.characters(),
            "checkpoints": [{k: o[k] for k in ("id", "label", "available", "default")} for o in s2f.checkpoints()],
            "defaults": s2f.settings_view(),
        },
    }


@app.post("/api/generate/s2f/prompt-preview")
def s2f_preview(body: dict):
    try:
        p = jobs.resolve_s2f(dict(body, seed=0))
    except ValueError as e:
        return {"error": str(e)}
    return {"prompt": p["prompt_s2f"], "checkpoint": p["checkpoint"]}


@app.post("/api/generate/batches")
def create_batch(label: str = Form(""), settings: str = Form("{}"), rows: str = Form(...), sketches: List[UploadFile] = File(...)):
    """rows: JSON list, one per uploaded sketch in the same order: {name, characters, chibi, scene, expression,
    outfits, props, seed}. settings: shared fields (checkpoint, guidance, steps, sizes, stroke_px, ...)."""
    try:
        shared, items_raw = json.loads(settings), json.loads(rows)
        if len(items_raw) != len(sketches):
            raise ValueError("Jumlah baris tidak sama dengan jumlah sketch")
        items = []
        for raw, up in zip(items_raw, sketches):
            img = _image(up)
            if img is None:
                raise ValueError(f"{up.filename}: file kosong")
            items.append((dict(shared, **{k: v for k, v in raw.items() if v not in (None, "")}), img, raw.get("name") or up.filename))
        batch, ids = jobs.create_batch(label, items)
    except ValueError as e:
        raise HTTPException(400, str(e))
    return {"batch": batch, "jobs": ids}


@app.get("/api/generate/batches")
def batches():
    return jobs.list_batches()


@app.get("/api/generate/batches/{batch}")
def batch_jobs(batch: str):
    return [_job_view(j) for j in jobs.list_jobs(batch=batch)]


@app.get("/api/generate/batches/{batch}/zip")
def batch_zip(batch: str):
    root = jobs.outputs_dir(batch).resolve()
    if not root.is_relative_to(jobs.outputs_dir("").resolve()) or not root.is_dir():
        raise HTTPException(404, "Belum ada hasil untuk batch ini")
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        for f in sorted(root.rglob("*")):
            if f.is_file():
                z.write(f, f.relative_to(root.parent))
    buf.seek(0)
    return StreamingResponse(buf, media_type="application/zip",
                             headers={"Content-Disposition": f'attachment; filename="aqstyle_{batch}.zip"'})


@app.post("/api/generate/jobs/{job_id}/lineart")
def job_relineart(job_id: str, body: dict):
    try:
        j = jobs.relineart(job_id, body.get("stroke_px"), body.get("fills"), body.get("from_upscaled"))
    except ValueError as e:
        raise HTTPException(400, str(e))
    return _job_view(j)


@app.get("/api/generate/characters/{name}/sheet")
def character_sheet(name: str):
    if name not in images.characters():
        raise HTTPException(404)
    return FileResponse(images.reference_file(name), headers={"Cache-Control": "max-age=3600"})


_faces = {}


@app.get("/api/generate/characters/{name}/face")
def character_face(name: str):
    """Face crop of the reference sheet (for compact pickers)."""
    if name not in images.characters():
        raise HTTPException(404)
    if name not in _faces:
        face = s2f._train.ref_parts(name)[1]
        face.thumbnail((256, 256))
        buf = io.BytesIO(); face.save(buf, "PNG"); _faces[name] = buf.getvalue()
    return StreamingResponse(io.BytesIO(_faces[name]), media_type="image/png", headers={"Cache-Control": "max-age=3600"})


@app.post("/api/generate/prompt-preview")
def prompt_preview(body: dict):
    try:
        p = jobs.resolve_params(dict(body, seed=0))
    except ValueError as e:
        return {"error": str(e)}
    return {"stage1": p["prompt_stage1"], "stage2": p["prompt_stage2"], "stage1_lora": p["stage1_lora"]}


@app.post("/api/generate/jobs")
def create_job(params: str = Form(...), sketch: UploadFile = File(None), lineart: UploadFile = File(None)):
    try:
        body = json.loads(params)
        if not isinstance(body, dict):
            raise ValueError("Parameter harus berupa objek JSON")
        p = jobs.resolve_params(body)
        job_id = jobs.create(p, sketch=_image(sketch), lineart=_image(lineart))
    except ValueError as e:
        raise HTTPException(400, str(e))
    return _job_view(jobs.get(job_id))


@app.post("/api/generate/jobs/{job_id}/derive")
def derive_job(job_id: str, mode: str = Form("stage2"), seed: str = Form(""), lineart: UploadFile = File(None)):
    if mode not in ("stage2", "all"):
        raise HTTPException(400, "mode harus stage2 atau all")
    try:
        new_id = jobs.derive(job_id, {"seed": seed or None}, mode=mode, lineart=_image(lineart))
    except ValueError as e:
        raise HTTPException(400, str(e))
    return _job_view(jobs.get(new_id))


@app.get("/api/generate/jobs")
def list_jobs(limit: int = 60):
    return [_job_view(j) for j in jobs.list_jobs(limit)]


@app.get("/api/generate/jobs/{job_id}")
def get_job(job_id: str):
    j = jobs.get(job_id)
    if not j:
        raise HTTPException(404)
    return _job_view(j)


@app.post("/api/generate/jobs/{job_id}/cancel")
def cancel_job(job_id: str):
    return {"ok": jobs.cancel(job_id)}


@app.delete("/api/generate/jobs/{job_id}")
def delete_job(job_id: str):
    return {"ok": jobs.delete(job_id)}


@app.get("/api/generate/jobs/{job_id}/files/{name}")
def job_file(job_id: str, name: str, download: int = 0):
    root = JOBS_DIR.resolve()
    f = (JOBS_DIR / job_id / name).resolve()
    if not f.is_relative_to(root) or not f.is_file():
        raise HTTPException(404)
    headers = {"Cache-Control": "max-age=86400"}
    if download:
        headers["Content-Disposition"] = f'attachment; filename="aqstyle_{job_id}_{name}"'
    return FileResponse(f, headers=headers)

