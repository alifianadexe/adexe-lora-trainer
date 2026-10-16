"""Training jobs: persisted as data/jobs/<id>/job.json, run one at a time."""

import json
import math
import os
import re
import signal
import subprocess
import sys
import threading
import time
import uuid
from pathlib import Path

from . import builders, datasets
from .config import DATA_DIR, JOBS_DIR, OUTPUTS_DIR, backend_status, load_settings
from . import workspace
from . import database, tracking

STEP_RE = re.compile(r"(\d+)/(\d+)\s*\[")
LOSS_RE = re.compile(r"(?:avr_loss|loss)\s*[:=]\s*(nan|inf|[0-9.]+(?:e[-+]?\d+)?)", re.I)
LR_RE = re.compile(r"\blr\s*[:=]\s*([0-9.]+(?:e[-+]?\d+)?)", re.I)
ETA_RE = re.compile(r"<([0-9:]+),")
JOB_NAME_RE = re.compile(r"^[A-Za-z0-9_\-]{1,64}$")
ERROR_HINTS = [
    (re.compile(r"CUDA out of memory|OutOfMemoryError", re.I),
     "VRAM habis. Coba: turunkan resolusi tertinggi, aktifkan low VRAM / layer offloading, cache text embeddings, atau batch size 1."),
    (re.compile(r"No module named", re.I),
     "Ada package Python yang belum terinstall di environment backend. Jalankan instalasi requirements backend (lihat README)."),
    (re.compile(r"401|Repository Not Found|gated repo", re.I),
     "Gagal download model dari HuggingFace. Isi HF token di Pengaturan atau cek koneksi."),
    (re.compile(r"Diffusers is out of date", re.I),
     "Diffusers di environment ai-toolkit terlalu lama. Jalankan: pip install -r requirements.txt di folder ai-toolkit."),
    (re.compile(r"NaN", re.I),
     "Loss NaN: learning rate mungkin terlalu tinggi, atau PyTorch < 2.5 (untuk Anima)."),
]


def _now():
    return time.time()


class JobManager:
    def __init__(self):
        self._lease=(DATA_DIR/'.training-worker.lock').open('a+b')
        self._lease.seek(0);self._lease.write(b'0');self._lease.flush();self._lease.seek(0)
        try:
            if os.name=='nt':
                import msvcrt
                msvcrt.locking(self._lease.fileno(),msvcrt.LK_NBLCK,1)
            else:
                import fcntl
                fcntl.flock(self._lease,fcntl.LOCK_EX|fcntl.LOCK_NB)
        except OSError as e:raise RuntimeError('Studio lain memakai database ini. Gunakan satu instance per workspace.') from e
        self._lock = threading.RLock()
        self._proc = None
        self._running_id = None
        self._stop_requested = False
        self._cond = threading.Condition(self._lock)
        self._recover()
        threading.Thread(target=self._worker, daemon=True).start()

    # ------------------------------------------------------------------ storage
    def _dir(self, job_id: str) -> Path:
        if not re.match(r"^[a-f0-9]{12}$", job_id):
            raise ValueError("bad id")
        return JOBS_DIR / job_id

    def get(self, job_id: str) -> dict:
        self._dir(job_id)
        return database.get_job(job_id)

    def _save(self, job: dict):
        d = self._dir(job["id"])
        d.mkdir(parents=True, exist_ok=True)
        database.put_job(job)

    def list(self) -> list:
        return database.list_jobs()

    def _recover(self):
        with database.connect() as c:c.execute("UPDATE runs SET status='interrupted',finished=? WHERE status='running'",(_now(),))
        for j in self.list():
            if j["status"] in ("running","queued"):
                j["status"] = "stopped"
                j["error"] = "Server dimatikan saat training berjalan."
                self._save(j)
            elif j['status']=='stopped' and j.get('progress',{}).get('phase'):
                j['progress']['phase']=None;j['progress']['eta']=None;self._save(j)

    # ------------------------------------------------------------------ CRUD
    def create(self, data: dict) -> dict:
        name = (data.get("name") or "").strip()
        if not JOB_NAME_RE.match(name):
            raise ValueError("Nama job hanya boleh huruf, angka, _ dan - (maks 64)")
        if any(j["name"] == name for j in self.list()):
            raise ValueError("Nama job sudah dipakai. Gunakan nama lain (misal tambah _v2).")
        datasets.dataset_dir(data["dataset"])  # validates
        job = {
            "id": uuid.uuid4().hex[:12],
            "name": name,
            "model": data["model"],
            "backend": data.get("backend") or "ai-toolkit",
            "dataset": data["dataset"],
            "trigger_word": (data.get("trigger_word") or "").strip(),
            "goal": data.get("goal") or "character",
            "vram": int(data.get("vram") or 24),
            "params": data["params"],
            "notes": data.get("notes", ""),
            "status": "draft",
            "created": _now(),
            "started": None,
            "finished": None,
            "progress": {"step": 0, "total": int(data["params"].get("steps") or 0), "loss": None, "eta": None},
            "error": None,
            "error_hint": None,
            'training_type':'lora',
        }
        self._render(job)
        self._save(job)
        return job

    def update(self, job_id: str, data: dict) -> dict:
        with self._lock:
            job = self.get(job_id)
            if job["status"] in ("running", "queued"):
                raise ValueError("Job sedang berjalan / antri")
            if job.get("imported_config") and any(k in data for k in ("params", "backend", "dataset", "trigger_word")):
                raise ValueError("Config impor dipertahankan utuh. Ubah config sumber lalu impor dengan nama eksperimen baru.")
            for k in ("params", "trigger_word", "notes", "backend", "dataset"):
                if k in data:
                    job[k] = data[k]
            job["progress"]["total"] = int(job["params"].get("steps") or 0)
            self._render(job)
            self._save(job)
            return job

    def set_evaluation(self, job_id: str, step: int, data: dict) -> dict:
        with self._lock:
            job = self.get(job_id)
            evs = job.setdefault("evaluations", {})
            if data:
                evs[str(int(step))] = {k: data[k] for k in ("likeness", "flexibility", "quality", "note") if k in data}
            else:
                evs.pop(str(int(step)), None)
            self._save(job)
            return job

    def delete(self, job_id: str, delete_outputs: bool = False):
        import shutil
        with self._lock:
            job = self.get(job_id)
            if job["status"] in ("running", "queued"):
                raise ValueError("Hentikan job dulu")
            shutil.rmtree(self._dir(job_id), ignore_errors=True)
            database.delete_job(job_id)
            if delete_outputs and not job.get("imported_config"):
                shutil.rmtree(OUTPUTS_DIR / job["name"], ignore_errors=True)

    def import_config(self, path: str) -> dict:
        import copy
        source, cfg, proc = workspace.read_config(path)
        with self._lock:
            for existing in self.list():
                if existing["name"] == cfg["config"]["name"]:
                    if existing.get("imported_config"):
                        return existing
                    raise ValueError("Nama eksperimen sudah dipakai.")
            ds = proc["datasets"][0]; target = Path(ds["folder_path"])
            if not target.is_dir(): raise ValueError("Folder target dataset tidak ditemukan.")
            for key in ("control_path_1", "control_path_2"):
                if ds.get(key) and not Path(ds[key]).is_dir(): raise ValueError("Folder control tidak ditemukan: " + key)
            name = cfg["config"]["name"]
            dataset_name = name[:55] + "_linked"
            if not (datasets.DATASETS_DIR / dataset_name).exists():
                datasets.create(dataset_name, caption_style="natural", linked_path=str(target))
                datasets.update_meta(dataset_name, {"notes": "Target dari config impor. Config training mempertahankan semua control dan referensi."})
            output = Path(proc["training_folder"]) / name
            checkpoint = workspace.latest_checkpoint(output)
            train = proc["train"]; network = proc.get("network") or {}; sample = proc.get("sample", {})
            params = {"rank": network.get("linear", 0), "alpha": network.get("linear_alpha", 0), "lr": train.get("lr", 1e-4),
                      "steps": train["steps"], "batch_size": train.get("batch_size", 1), "grad_accum": train.get("gradient_accumulation", 1),
                      "optimizer": train.get("optimizer", "adamw8bit"), "lr_scheduler": train.get("lr_scheduler", "constant"),
                      "resolutions": ds.get("resolution", [1024]), "sample_every": sample.get("sample_every", 500),
                      "sample_prompts": [s.get("prompt", "") for s in sample.get("samples", [])],
                      "sample_width": sample.get("width", 768), "sample_height": sample.get("height", 1344),
                      "cache_text_embeddings": train.get("cache_text_embeddings", False), "gradient_checkpointing": train.get("gradient_checkpointing", True),
                      "quantize": proc.get("model", {}).get("quantize", True)}
            params.update({"layer_offloading": proc.get("model", {}).get("layer_offloading", False),
                           "layer_offloading_percent": proc.get("model", {}).get("layer_offloading_transformer_percent", 0),
                           "caption_dropout": ds.get("caption_dropout_rate", 0), "shuffle_tokens": ds.get("shuffle_tokens", False),
                           "flip_x": ds.get("flip_x", False), "save_every": proc.get("save", {}).get("save_every", 250)})
            step = checkpoint["step"]
            job = {"id": uuid.uuid4().hex[:12], "name": name, "model": proc["model"]["arch"], "backend": "ai-toolkit",
                   "dataset": dataset_name, "trigger_word": "", "goal": "style", "vram": 32, "params": params,
                   "notes": "Config asli diimpor utuh. Progress awal berasal dari checkpoint, bukan log loss. Mulai training hanya saat tombol Lanjutkan ditekan.",
                   "status": "stopped" if step < train["steps"] else "completed", "created": source.stat().st_mtime,
                   "started": None, "finished": None, "progress": {"step": step, "total": train["steps"], "loss": None, "eta": None},
                   "error": None, "error_hint": None, "imported_config": copy.deepcopy(cfg), "source_config": str(source),
                   "output_root": str(output.resolve()),'training_type':'lora' if network else 'full_finetune'}
            self._render(job); self._save(job)
            return job

    def _render(self, job: dict) -> dict:
        if job.get("imported_config"):
            import yaml
            d = self._dir(job["id"]); d.mkdir(parents=True, exist_ok=True)
            text = yaml.safe_dump(job["imported_config"], sort_keys=False, allow_unicode=True)
            (d / "config.yaml").write_text(text, encoding="utf-8")
            cmd = builders.ai_toolkit_command(job, d / "config.yaml")
            r = {"files": {"config.yaml": text}, "command": cmd, "command_text": builders.command_preview(cmd)}
            job["command_text"] = r["command_text"]; job["config_files"] = ["config.yaml"]
            return r
        ds_path = str(datasets.dataset_dir(job["dataset"]))
        r = builders.render(job, ds_path, self._dir(job["id"]))
        d = self._dir(job["id"])
        d.mkdir(parents=True, exist_ok=True)
        for fname, text in r["files"].items():
            (d / fname).write_text(text, encoding="utf-8")
        job["command_text"] = r["command_text"]
        job["config_files"] = list(r["files"].keys())
        return r

    def files(self, job_id: str) -> dict:
        job = self.get(job_id)
        d = self._dir(job_id)
        if any(not (d/f).exists() for f in job.get('config_files',[])):
            self._render(job)
        return {f: (d / f).read_text(encoding="utf-8") for f in job.get("config_files", []) if (d / f).exists()}

    # ------------------------------------------------------------------ control
    def start(self, job_id: str) -> dict:
        with self._lock:
            job = self.get(job_id)
            if job["status"] in ("running", "queued"):
                return job
            st = backend_status()[job["backend"]]
            if not st["found"]:
                raise ValueError(f"Backend {job['backend']} belum ditemukan di '{st['path']}'. Atur di halaman Pengaturan.")
            if job["backend"] == "sd-scripts":
                s = load_settings()
                missing = [k for k in ("anima_dit_path", "anima_qwen3_path", "anima_vae_path") if not s.get(k)]
                if missing:
                    raise ValueError("Path model Anima untuk sd-scripts belum diisi di Pengaturan: " + ", ".join(missing))
            if job['backend']=='ai-toolkit':
                if job.get('imported_config'):data_configs=job['imported_config']['config']['process'][0]['datasets']
                else:data_configs=[{'folder_path':str(datasets.dataset_dir(job['dataset'])),**{k:job['params'].get(k) for k in ('control_path_1','control_path_2')}}]
                for dc in data_configs:
                    target=Path(dc['folder_path'])
                    target_ids={p.stem for p in datasets.images_in(target)}
                    if not target_ids:raise ValueError('Dataset target kosong atau lokasinya belum tersedia.')
                    for key in ('control_path_1','control_path_2'):
                        if not dc.get(key):continue
                        ctrl=Path(dc[key]);control_ids={p.stem for p in datasets.images_in(ctrl)}
                        if target_ids!=control_ids:raise ValueError(f'{key}: nama file control harus tepat sama dengan target ({len(target_ids)} pasangan).')
                if not job.get('imported_config') and job['params'].get('control_path_1'):
                    p=job['params']
                    if not p.get('sample_control_1') or not Path(p['sample_control_1']).is_file():raise ValueError('Isi file sketch untuk sample saat memakai conditioning.')
                    if p.get('control_path_2') and (not p.get('sample_control_2') or not Path(p['sample_control_2']).is_file()):raise ValueError('Isi file referensi karakter untuk sample.')
            self._render(job)  # settings may have changed since creation
            job["status"] = "queued"
            job["error"] = None
            job["error_hint"] = None
            job["queued_at"] = _now()
            self._save(job)
            self._cond.notify_all()
            return job

    def stop(self, job_id: str) -> dict:
        with self._lock:
            job = self.get(job_id)
            if job["status"] == "queued":
                job["status"] = "stopped"
                self._save(job)
            elif job["status"] == "running" and self._running_id == job_id and self._proc:
                self._stop_requested = True
                _kill_tree(self._proc)
            return self.get(job_id)

    # ------------------------------------------------------------------ worker
    def _next_queued(self):
        q = [j for j in self.list() if j["status"] == "queued"]
        return sorted(q, key=lambda j: j.get("queued_at", 0))[0] if q else None

    def _worker(self):
        while True:
            with self._lock:
                job = self._next_queued()
                while job is None:
                    self._cond.wait(timeout=2)
                    job = self._next_queued()
            try:
                self._run(job)
            except Exception as e:  # never kill the worker
                job = self.get(job["id"])
                job["status"] = "failed"
                job["error"] = str(e)
                job["finished"] = _now()
                if job.get('active_run_id'):database.finish_run(job['active_run_id'],'failed')
                self._save(job)

    def _run(self, job: dict):
        job = self.get(job["id"])
        if job["status"] != "queued":
            return
        r = self._render(job)
        cmd = r["command"]
        d = self._dir(job["id"])
        run_id=uuid.uuid4().hex
        provenance=tracking.snapshot(job,r['files'].get('config.yaml',r['files']))
        database.start_run(job['id'],run_id,provenance)
        job['active_run_id']=run_id
        self._save(job)
        database.event(job['id'],run_id,'started',{'params':job['params']})
        log_path = d / "log.txt"
        metrics_path = d / "metrics.jsonl"
        env = dict(os.environ)
        env.update(cmd["env"])
        env["PYTHONUNBUFFERED"] = "1"
        env.setdefault("PYTHONIOENCODING", "utf-8")
        kwargs = {}
        if os.name == "nt":
            kwargs["creationflags"] = subprocess.CREATE_NEW_PROCESS_GROUP
        else:
            kwargs["start_new_session"] = True

        with open(log_path, "ab") as logf:
            logf.write(f"\n===== START {time.ctime()} =====\n$ {r['command_text']}\n\n".encode())
            logf.flush()
            proc = subprocess.Popen(cmd["argv"], cwd=cmd["cwd"], env=env, stdout=subprocess.PIPE,
                                    stderr=subprocess.STDOUT, stdin=subprocess.DEVNULL, **kwargs)
            with self._lock:
                self._proc = proc
                self._running_id = job["id"]
                self._stop_requested = False
                job = self.get(job["id"])
                job["status"] = "running"
                job["started"] = _now()
                job["finished"] = None
                job["pid"] = proc.pid
                self._save(job)

            buf = b""
            last_save = 0
            last_step = -1
            tail = []
            prog = dict(job["progress"])
            while True:
                chunk = proc.stdout.read1(4096) if hasattr(proc.stdout, "read1") else proc.stdout.read(4096)
                if not chunk:
                    break
                logf.write(chunk)
                logf.flush()
                buf += chunk
                parts = re.split(rb"[\r\n]", buf)
                buf = parts.pop()
                for raw in parts:
                    line = raw.decode("utf-8", "replace").strip()
                    if not line:
                        continue
                    tail.append(line)
                    tail = tail[-60:]
                    m = STEP_RE.search(line)
                    lm = LOSS_RE.search(line) if m else None
                    is_train_bar = bool(m) and (lm is not None or line.startswith(job["name"]) or line.startswith("steps"))
                    if is_train_bar:
                        step, total = int(m.group(1)), int(m.group(2))
                        if total >= 1:
                            prog["step"], prog["total"] = step, total
                            loss_val = None
                            if lm:
                                loss_val = float(lm.group(1))
                                if math.isfinite(loss_val):
                                    prog["loss"] = loss_val
                            em = ETA_RE.search(line)
                            if em:
                                prog["eta"] = em.group(1)
                            lrm = LR_RE.search(line)
                            if step != last_step and lm:
                                last_step = step
                                with open(metrics_path, "a", encoding="utf-8") as mf:
                                    finite = loss_val is not None and math.isfinite(loss_val)
                                    metric={"step": step, "loss": loss_val if finite else None, "nan": not finite,
                                                         "lr": float(lrm.group(1)) if lrm else None,
                                                         "group_lrs":{k:float(v) for k,v in re.findall(r'\blr[/_:]([A-Za-z0-9_]+)\s*[:=]\s*([0-9.]+(?:e[-+]?\d+)?)',line,re.I)},
                                                         "run_id":run_id,"t": round(_now(), 1)}
                                    mf.write(json.dumps(metric) + "\n")
                                    database.add_metric(job['id'],run_id,metric)
                    if "Generating" in line and "sample" in line.lower():
                        prog["phase"] = "sampling"
                    elif "Saving" in line or "saving" in line:
                        prog["phase"] = "saving"
                    elif "caching" in line.lower():
                        prog["phase"] = "caching"
                    elif is_train_bar:
                        prog["phase"] = "training"
                if _now() - last_save > 1.5:
                    last_save = _now()
                    with self._lock:
                        j = self.get(job["id"])
                        j["progress"] = prog
                        self._save(j)
            rc = proc.wait()

        with self._lock:
            j = self.get(job["id"])
            prog["phase"] = None
            j["progress"] = prog
            j["finished"] = _now()
            j["exit_code"] = rc
            j.pop("pid", None)
            if self._stop_requested:
                j["status"] = "stopped"
            elif rc == 0:
                j["status"] = "completed"
            else:
                j["status"] = "failed"
                text = "\n".join(tail)
                j["error"] = "\n".join(tail[-12:])
                for rx, hint in ERROR_HINTS:
                    if rx.search(text):
                        j["error_hint"] = hint
                        break
            self._save(j)
            database.finish_run(run_id,j['status'])
            database.event(j['id'],run_id,'finished',{'status':j['status'],'exit_code':rc})
            self._proc = None
            self._running_id = None
        try:
            from .reports import save_artifacts
            save_artifacts(self,j['id'],run_id)
        except Exception as error:
            database.event(j['id'],run_id,'report_failed',{'error':str(error)})

    # ------------------------------------------------------------------ outputs
    def log(self, job_id: str, offset: int = 0, max_bytes: int = 200_000) -> dict:
        p = self._dir(job_id) / "log.txt"
        if not p.exists():
            return {"text": "", "offset": 0}
        size = p.stat().st_size
        if offset > size:
            offset = 0
        if size - offset > max_bytes:
            offset = size - max_bytes
        with open(p, "rb") as f:
            f.seek(offset)
            data = f.read()
        # collapse tqdm carriage-return redraws into the final state of each line
        text = data.decode("utf-8", "replace")
        text = "\n".join(seg.split("\r")[-1] if "\r" in seg else seg for seg in text.split("\n"))
        return {"text": text, "offset": size}

    def metrics(self, job_id: str) -> list:
        self.get(job_id)
        return database.metrics(job_id)

    def outputs(self, job_id: str) -> dict:
        job = self.get(job_id)
        root = Path(job["output_root"]) if job.get("imported_config") else OUTPUTS_DIR / job["name"]
        samples, ckpts = [], []
        if root.exists():
            for sub in ("samples", "sample"):
                sd = root / sub
                if sd.exists():
                    for f in sorted(sd.iterdir()):
                        if f.suffix.lower() in (".jpg", ".jpeg", ".png", ".webp"):
                            samples.append({"file": f"{sub}/{f.name}", **_sample_info(f.name, job)})
            for f in sorted(root.glob("*.safetensors")):
                ckpts.append({"file": f.name, "step": _ckpt_step(f.name), "size_mb": round(f.stat().st_size / 1e6, 1),
                              "mtime": f.stat().st_mtime})
        ckpts.sort(key=lambda c: (c["step"] is None, c["step"] or 0))
        return {"root": str(root), "samples": samples, "checkpoints": ckpts}

    def output_file(self, job_id: str, rel: str) -> Path:
        job = self.get(job_id)
        root = (Path(job["output_root"]) if job.get("imported_config") else OUTPUTS_DIR / job["name"]).resolve()
        p = (root / rel).resolve()
        if root not in p.parents:
            raise ValueError("path tidak valid")
        return p


def _sample_info(name: str, job: dict) -> dict:
    # ai-toolkit: <time>__<step 9 digits>_<idx>.jpg
    m = re.match(r"^\d+__(\d{9})_(\d+)\.", name)
    if m:
        return {"step": int(m.group(1)), "index": int(m.group(2))}
    # sd-scripts: <name>_<step 6>_<idx 2>_<ts>_<seed>.png (also e000000 variants)
    m = re.search(r"_(\d{6})_(\d{2})_", name)
    if m:
        return {"step": int(m.group(1)), "index": int(m.group(2))}
    return {"step": None, "index": 0}


def _ckpt_step(name: str):
    m = re.search(r"_(\d{9})\.safetensors$", name) or re.search(r"-step(\d+)\.safetensors$", name)
    return int(m.group(1)) if m else None


def _kill_tree(proc: subprocess.Popen):
    try:
        if os.name == "nt":
            subprocess.run(["taskkill", "/F", "/T", "/PID", str(proc.pid)], capture_output=True)
        else:
            os.killpg(os.getpgid(proc.pid), signal.SIGTERM)

            def _hard():
                time.sleep(15)
                if proc.poll() is None:
                    try:
                        os.killpg(os.getpgid(proc.pid), signal.SIGKILL)
                    except Exception:
                        pass
            threading.Thread(target=_hard, daemon=True).start()
    except Exception:
        try:
            proc.kill()
        except Exception:
            pass
