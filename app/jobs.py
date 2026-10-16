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
from .config import JOBS_DIR, OUTPUTS_DIR, backend_status, load_settings

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
        p = self._dir(job_id) / "job.json"
        if not p.exists():
            raise FileNotFoundError(job_id)
        return json.loads(p.read_text(encoding="utf-8"))

    def _save(self, job: dict):
        d = self._dir(job["id"])
        d.mkdir(parents=True, exist_ok=True)
        tmp = d / "job.json.tmp"
        tmp.write_text(json.dumps(job, indent=2), encoding="utf-8")
        os.replace(tmp, d / "job.json")

    def list(self) -> list:
        out = []
        for d in JOBS_DIR.iterdir():
            f = d / "job.json"
            if f.exists():
                try:
                    out.append(json.loads(f.read_text(encoding="utf-8")))
                except Exception:
                    pass
        return sorted(out, key=lambda j: -j.get("created", 0))

    def _recover(self):
        for j in self.list():
            if j["status"] == "running":
                j["status"] = "stopped"
                j["error"] = "Server dimatikan saat training berjalan."
                self._save(j)

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
        }
        self._render(job)
        self._save(job)
        return job

    def update(self, job_id: str, data: dict) -> dict:
        with self._lock:
            job = self.get(job_id)
            if job["status"] in ("running", "queued"):
                raise ValueError("Job sedang berjalan / antri")
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
            if delete_outputs:
                shutil.rmtree(OUTPUTS_DIR / job["name"], ignore_errors=True)

    def _render(self, job: dict) -> dict:
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
                self._save(job)

    def _run(self, job: dict):
        job = self.get(job["id"])
        if job["status"] != "queued":
            return
        r = self._render(job)
        cmd = r["command"]
        d = self._dir(job["id"])
        log_path = d / "log.txt"
        metrics_path = d / "metrics.jsonl"
        if metrics_path.exists():
            metrics_path.unlink()
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
                                    mf.write(json.dumps({"step": step, "loss": loss_val if finite else None, "nan": not finite,
                                                         "lr": float(lrm.group(1)) if lrm else None,
                                                         "t": round(_now(), 1)}) + "\n")
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
            self._proc = None
            self._running_id = None

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
        p = self._dir(job_id) / "metrics.jsonl"
        if not p.exists():
            return []
        out = []
        for line in p.read_text(encoding="utf-8").splitlines():
            try:
                out.append(json.loads(line))
            except Exception:
                pass
        return out

    def outputs(self, job_id: str) -> dict:
        job = self.get(job_id)
        root = OUTPUTS_DIR / job["name"]
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
        root = (OUTPUTS_DIR / job["name"]).resolve()
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
