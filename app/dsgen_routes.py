"""HTTP interface for the charsheet dataset generator (/api/dsgen/...)."""

import io
from typing import List

from fastapi import APIRouter, File, Form, UploadFile
from fastapi.responses import FileResponse, Response
from PIL import Image

from . import dsgen


def _read(upload: UploadFile) -> bytes:
    data = upload.file.read(40 * 1024 * 1024 + 1)
    if not data:
        raise ValueError(f"File '{upload.filename}' kosong")
    return data


def _thumb(path, size: int) -> Response:
    with Image.open(path) as im:
        im.thumbnail((size, size))
        buf = io.BytesIO()
        im.convert("RGB").save(buf, "WEBP", quality=82)
    return Response(buf.getvalue(), media_type="image/webp", headers={"Cache-Control": "max-age=3600"})


def router() -> APIRouter:
    r = APIRouter(prefix="/api/dsgen")

    @r.get("/health")
    def health():
        return dsgen.health()

    @r.get("/config")
    def get_config():
        return dsgen.config()

    @r.put("/config")
    def put_config(data: dict):
        return dsgen.save_config(data)

    @r.get("/library")
    def library():
        return {"poses": dsgen.poses(), "expressions": dsgen.expressions()}

    @r.post("/poses")
    def add_poses(files: List[UploadFile] = File(...), label: str = Form(""), kind: str = Form("full"), prompt: str = Form("")):
        return [dsgen.add_pose(_read(f), label or f.filename.rsplit(".", 1)[0], kind, prompt) for f in files]

    @r.patch("/poses/{pid}")
    def patch_pose(pid: str, data: dict):
        return dsgen.update_pose(pid, data)

    @r.delete("/poses/{pid}")
    def del_pose(pid: str):
        dsgen.delete_pose(pid)
        return {"ok": True}

    @r.get("/poses/{pid}/image")
    def pose_image(pid: str, size: int = 384):
        return _thumb(dsgen.pose_path(pid), max(64, min(size, 1024)))

    @r.post("/sheets")
    def upload_sheets(files: List[UploadFile] = File(...)):
        return [dsgen.save_sheet(_read(f), f.filename) for f in files]

    @r.get("/sheets/{sid}/image")
    def sheet_image(sid: str, size: int = 512):
        return _thumb(dsgen.sheet_path(sid), max(64, min(size, 2048)))

    @r.get("/jobs")
    def jobs():
        return dsgen.list_jobs()

    @r.post("/jobs")
    def create(data: dict):
        return dsgen.create_job(data)

    @r.get("/jobs/{jid}")
    def job(jid: str):
        return dsgen.get_job(jid)

    @r.post("/jobs/{jid}/cancel")
    def cancel(jid: str):
        return dsgen.cancel_job(jid)

    @r.delete("/jobs/{jid}")
    def delete(jid: str):
        dsgen.delete_job(jid)
        return {"ok": True}

    @r.post("/jobs/{jid}/items/{iid}/approve")
    def approve(jid: str, iid: int, data: dict):
        return dsgen.set_approved(jid, iid, bool(data.get("approved", True)))

    @r.post("/jobs/{jid}/items/{iid}/retry")
    def retry(jid: str, iid: int, data: dict = None):
        return dsgen.retry_item(jid, iid, bool((data or {}).get("new_pose", False)))

    @r.get("/jobs/{jid}/files/{name}")
    def file(jid: str, name: str, size: int = 0):
        p = dsgen.job_file(jid, name)
        return _thumb(p, max(64, min(size, 1024))) if size else FileResponse(p)

    return r
