"""HTTP API + static frontend for Adexe LoRA Studio."""

import threading
from typing import List, Optional

from fastapi import FastAPI, File, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from . import builders, captioner, datasets, insights, presets, system
from .config import WEB_DIR, backend_status, load_settings, save_settings
from .jobs import JobManager
from . import workspace
from . import access, data_routes
from . import model_catalog
from .generation.app import app as generation_app
from .generation import jobs as generation_jobs
from .generation.engine import ENGINE
from . import gpu
from . import dsgen, dsgen_routes

app = FastAPI(title="Adexe LoRA Studio")
# the Next.js dev server runs on another port; this is a local single-user tool
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_methods=["*"],
    allow_headers=["*"],
    allow_credentials=True,
)
app.middleware("http")(access.guard)
jobs = JobManager()
app.include_router(data_routes.router(jobs))
app.include_router(generation_app.router)
app.include_router(dsgen_routes.router())

@app.on_event("startup")
def start_generation_worker():
    generation_jobs.init()
    dsgen.WORKER.start()

@app.on_event("shutdown")
def stop_generation_engine():
    ENGINE.stop()

@app.post("/api/generate/checkpoint")
def use_training_checkpoint(data: dict):
    from .generation.settings import CFG, CONFIG_FILE
    from .generation import s2f
    import json
    job = jobs.get(data.get("job_id", ""))
    if job["model"] != "qwen_image_2" or job.get("training_type") == "full_finetune":
        raise ValueError("Generate Studio membutuhkan LoRA Qwen-Image 2.1 dengan conditioning sketch dan referensi.")
    filename = data.get("file", "")
    if filename not in {c["file"] for c in jobs.outputs(job["id"])["checkpoints"]}:
        raise ValueError("Pilih checkpoint yang tersedia dari hasil training.")
    checkpoint = jobs.output_file(job["id"], filename)
    key = "trained_" + job["id"] + "_" + checkpoint.stem
    from .generation.settings import CONFIG_LOCK
    with CONFIG_LOCK:
        entry = {"id": key, "label": job["name"] + " · " + checkpoint.name, "path": str(checkpoint)}
        config = dict(CFG["sketch2final"])
        config["extra_loras"] = [e for e in config.get("extra_loras", []) if e["id"] != key] + [entry]
        config["selected_checkpoint"] = key
        saved = json.loads(CONFIG_FILE.read_text(encoding="utf-8-sig")) if CONFIG_FILE.exists() else {}
        saved["sketch2final"] = config
        CONFIG_FILE.parent.mkdir(parents=True, exist_ok=True)
        temp = CONFIG_FILE.with_suffix(".tmp")
        temp.write_text(json.dumps(saved, indent=2), encoding="utf-8")
        temp.replace(CONFIG_FILE)
        CFG["sketch2final"].update(config)
        s2f.S2F.update(config)
    return {"checkpoint": key}



@app.get("/api/access/info")
def access_info(request: Request):
    return access.info(request)


@app.post("/api/access/login")
def access_login(request: Request, data: dict):
    return access.login(request, data.get("code", ""))


@app.exception_handler(ValueError)
async def _value_error(_: Request, exc: ValueError):
    return JSONResponse({"detail": str(exc)}, status_code=400)


@app.exception_handler(FileNotFoundError)
async def _not_found(_: Request, exc: FileNotFoundError):
    return JSONResponse({"detail": f"Tidak ditemukan: {exc}"}, status_code=404)


# --------------------------------------------------------------------------- system


@app.get("/api/status")
def status():
    return {"backends": backend_status(), "gpus": system.gpu_info(), "host": system.host_info()}


@app.get("/api/settings")
def get_settings():
    s = load_settings()
    if s.get("hf_token"):
        s["hf_token"] = "********"
    if s.get("caption_api_key"):
        s["caption_api_key"] = "********"
    return s


@app.put("/api/settings")
def put_settings(data: dict):
    for secret in ("hf_token", "caption_api_key"):
        if data.get(secret) == "********":
            data.pop(secret)
    save_settings(data)
    return get_settings()


@app.get("/api/catalog")
def catalog():
    return presets.public_catalog()


@app.get("/api/model-lab")
def model_lab():
    return model_catalog.catalog()


class RecommendReq(BaseModel):
    model: str
    goal: str = "character"
    vram: int = 24
    num_images: int = 20
    backend: str = "ai-toolkit"
    trigger: str = ""


@app.post("/api/recommend")
def recommend(req: RecommendReq):
    return presets.recommend(req.model, req.goal, req.vram, req.num_images, req.backend, req.trigger)


class AnalyzeReq(BaseModel):
    model: str
    params: dict
    num_images: int = 20


@app.post("/api/analyze")
def analyze(req: AnalyzeReq):
    return presets.analyze(req.model, req.params, req.num_images)


class PreviewReq(BaseModel):
    name: str = "preview"
    model: str
    backend: str = "ai-toolkit"
    dataset: str
    trigger_word: str = ""
    params: dict


@app.post("/api/preview-config")
def preview_config(req: PreviewReq):
    from .config import JOBS_DIR

    job = req.model_dump()
    ds = str(datasets.dataset_dir(req.dataset))
    r = builders.render(job, ds, JOBS_DIR / "_preview")
    return {"files": r["files"], "command": r["command_text"]}


# --------------------------------------------------------------------------- datasets


@app.get("/api/datasets")
def list_datasets():
    return datasets.list_datasets()


class DatasetCreate(BaseModel):
    name: str
    trigger_word: str = ""
    caption_style: str = "natural"
    linked_path: str = ""


@app.post("/api/datasets")
def create_dataset(req: DatasetCreate):
    return datasets.create(req.name, req.trigger_word, req.caption_style, req.linked_path)


@app.get("/api/datasets/{name}")
def get_dataset(name: str):
    return datasets.details(name)


@app.patch("/api/datasets/{name}")
def patch_dataset(name: str, data: dict):
    return datasets.update_meta(name, data)


@app.delete("/api/datasets/{name}")
def delete_dataset(name: str):
    datasets.delete(name)
    return {"ok": True}


@app.post("/api/datasets/{name}/upload")
async def upload(name: str, files: List[UploadFile] = File(...)):
    saved, errors = [], []
    for f in files:
        try:
            saved.append(datasets.save_upload(name, f.filename, await f.read()))
        except ValueError as e:
            errors.append(str(e))
    return {"saved": saved, "errors": errors}


@app.get("/api/datasets/{name}/image/{filename}")
def get_image(name: str, filename: str):
    return FileResponse(datasets.image_path(name, filename))


@app.get("/api/datasets/{name}/thumb/{filename}")
def get_thumb(name: str, filename: str):
    return FileResponse(datasets.thumbnail(name, filename), headers={"Cache-Control": "max-age=86400"})


class CaptionReq(BaseModel):
    caption: str


@app.put("/api/datasets/{name}/caption/{filename}")
def put_caption(name: str, filename: str, req: CaptionReq):
    datasets.set_caption(name, filename, req.caption)
    return {"ok": True}


@app.delete("/api/datasets/{name}/image/{filename}")
def delete_image(name: str, filename: str):
    datasets.delete_image(name, filename)
    return {"ok": True}


class BulkReq(BaseModel):
    op: str
    args: dict = {}


@app.post("/api/datasets/{name}/bulk")
def bulk(name: str, req: BulkReq):
    return {"changed": datasets.bulk(name, req.op, req.args)}


_caption_tasks = {}
_caption_lock = threading.Lock()


class AutoCaptionReq(BaseModel):
    style: str = "natural"
    overwrite: bool = False
    files: Optional[List[str]] = None
    extra: str = ""


@app.post("/api/datasets/{name}/autocaption")
def autocaption(name: str, req: AutoCaptionReq):
    info = datasets.details(name)
    targets = [
        i for i in info["items"] if (req.overwrite or not i["caption"]) and (not req.files or i["file"] in req.files)
    ]
    with _caption_lock:
        t = _caption_tasks.get(name)
        if t and t["running"]:
            raise ValueError("Auto-caption sedang berjalan")
        task = {"running": True, "done": 0, "total": len(targets), "errors": [], "current": None}
        _caption_tasks[name] = task

    def work():
        for item in targets:
            if not task["running"]:
                break
            task["current"] = item["file"]
            try:
                cap = captioner.caption_image(
                    datasets.image_path(name, item["file"]), req.style, info["trigger_word"], req.extra
                )
                datasets.set_caption(name, item["file"], cap)
                task["ok"] = task.get("ok", 0) + 1
            except Exception as e:
                task["errors"].append(f"{item['file']}: {e}")
                if len(task["errors"]) >= 3 and not task.get("ok"):
                    task["errors"].append(
                        "Dihentikan: 3 kegagalan berturut-turut. Cek endpoint auto-caption di Pengaturan."
                    )
                    break
            task["done"] += 1
        task["running"] = False
        task["current"] = None

    threading.Thread(target=work, daemon=True).start()
    return task


@app.get("/api/datasets/{name}/autocaption")
def autocaption_status(name: str):
    return _caption_tasks.get(name) or {"running": False, "done": 0, "total": 0, "errors": []}


@app.delete("/api/datasets/{name}/autocaption")
def autocaption_cancel(name: str):
    t = _caption_tasks.get(name)
    if t:
        t["running"] = False
    return {"ok": True}


# --------------------------------------------------------------------------- jobs


@app.get("/api/workspace")
def workspace_info():
    info = workspace.project_summary()
    info["job_id"] = next((j["id"] for j in jobs.list() if j["name"] == info.get("name")), None)
    return info


@app.get("/api/workspace/sample/{name}")
def workspace_sample(name: str):
    return FileResponse(workspace.project_sample(name))


@app.post("/api/jobs/import-config")
def import_job_config(data: dict):
    return jobs.import_config(data.get("path", ""))


@app.get("/api/jobs")
def list_jobs():
    return jobs.list()


@app.post("/api/jobs")
def create_job(data: dict):
    job = jobs.create(data)
    if data.get("start"):
        job = jobs.start(job["id"])
    return job


@app.get("/api/jobs/{job_id}")
def get_job(job_id: str):
    return jobs.get(job_id)


@app.patch("/api/jobs/{job_id}")
def patch_job(job_id: str, data: dict):
    return jobs.update(job_id, data)


@app.delete("/api/jobs/{job_id}")
def delete_job(job_id: str, outputs: bool = False):
    jobs.delete(job_id, outputs)
    return {"ok": True}


@app.post("/api/jobs/{job_id}/start")
def start_job(job_id: str):
    return jobs.start(job_id)


@app.post("/api/jobs/{job_id}/stop")
def stop_job(job_id: str):
    return jobs.stop(job_id)


@app.get("/api/jobs/{job_id}/files")
def job_files(job_id: str):
    return jobs.files(job_id)


@app.get("/api/jobs/{job_id}/log")
def job_log(job_id: str, offset: int = 0):
    return jobs.log(job_id, offset)


@app.get("/api/jobs/{job_id}/metrics")
def job_metrics(job_id: str):
    return jobs.metrics(job_id)


@app.get("/api/jobs/{job_id}/outputs")
def job_outputs(job_id: str):
    return jobs.outputs(job_id)


@app.get("/api/jobs/{job_id}/file/{rel:path}")
def job_file(job_id: str, rel: str, download: bool = False):
    p = jobs.output_file(job_id, rel)
    if not p.exists():
        raise FileNotFoundError(rel)
    return FileResponse(p, filename=p.name if download else None)


def _dataset_for(job: dict):
    try:
        return datasets.details(job["dataset"])
    except Exception:
        return None


@app.get("/api/jobs/{job_id}/insights")
def job_insights(job_id: str):
    job = jobs.get(job_id)
    return insights.analyze_job(job, jobs.metrics(job_id), jobs.outputs(job_id), _dataset_for(job))


class EvalReq(BaseModel):
    likeness: Optional[int] = Field(None, ge=1, le=5)
    flexibility: Optional[int] = Field(None, ge=1, le=5)
    quality: Optional[int] = Field(None, ge=1, le=5)
    note: str = ""


@app.put("/api/jobs/{job_id}/evaluation/{step}")
def put_evaluation(job_id: str, step: int, req: EvalReq):
    data = {k: v for k, v in req.model_dump().items() if v not in (None, "")}
    return jobs.set_evaluation(job_id, step, data)


@app.get("/api/compare")
def compare(ids: str):
    out = []
    for jid in [i for i in ids.split(",") if i][:6]:
        job = jobs.get(jid)
        summ = insights.summarize(jobs.metrics(jid))
        out.append(
            {
                "id": job["id"],
                "name": job["name"],
                "model": job["model"],
                "status": job["status"],
                "dataset": job["dataset"],
                "notes": job.get("notes", ""),
                "params": job["params"],
                "progress": job["progress"],
                "evaluations": job.get("evaluations", {}),
                "advice": insights.evaluation_advice(job),
                "loss": {k: summ.get(k) for k in ("first_ema", "last_ema", "min", "change_pct", "noise")},
                "series": [{"step": p["step"], "ema": p["ema"]} for p in summ.get("series", [])],
            }
        )
    return out


# --------------------------------------------------------------------------- frontend (Next.js static export)

if (WEB_DIR / "index.html").exists():
    app.mount("/", StaticFiles(directory=WEB_DIR, html=True), name="web")
else:

    @app.get("/", response_class=HTMLResponse)
    def _no_frontend():
        return (
            "<h2>Frontend belum di-build</h2><p>Jalankan <code>cd frontend && npm install && npm run build</code>, "
            "atau mode dev: <code>npm run dev</code> lalu buka http://localhost:3000</p>"
        )
