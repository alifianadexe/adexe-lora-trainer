"""Starts and talks to AI Toolkit's resident Inference Engine. The base model
stays loaded; LoRAs are applied in hook mode per request, so switching between
Stage 1 and Stage 2 does not reload Qwen-Image."""
import json
import os
import secrets
import struct
import subprocess
import threading
import time
from pathlib import Path

import requests
import yaml

from .settings import CFG, ENGINE_DIR, LOG_DIR, path

_HDR = struct.Struct("<I")
_LEN = struct.Struct("<Q")


class EngineError(RuntimeError):
    pass


class Engine:
    def __init__(self):
        self.port = int(CFG.get("engine_port", 8866))
        self.base = f"http://127.0.0.1:{self.port}"
        self.token = None
        self.proc = None
        self.state = "stopped"  # stopped | starting | ready | error
        self.message = ""
        self._lock = threading.Lock()

    # ------------------------------------------------------------ lifecycle
    def _headers(self):
        return {"X-Engine-Token": self.token or ""}

    def _try_existing(self):
        info = ENGINE_DIR / "engine.json"
        if not info.exists():
            return False
        try:
            data = json.loads(info.read_text(encoding="utf-8"))
            if int(data.get("port", 0)) != self.port:
                return False
            self.token = data.get("token")
            r = requests.get(f"{self.base}/queue", headers=self._headers(), timeout=3)
            # our own engine left running by a previous studio process (same job folder): adopt it
            own = Path(data.get("job_folder", "")).resolve() == ENGINE_DIR.resolve()
            self.adopted_pid = int(data["pid"]) if own and data.get("pid") else None
            return r.status_code == 200
        except Exception:
            return False

    def start(self):
        with self._lock:
            if self.state in ("starting", "ready"):
                return
            self.state, self.message = "starting", "Menyalakan engine"
        threading.Thread(target=self._start, daemon=True, name="engine-start").start()

    def _start(self):
        try:
            if self._try_existing():
                self.state, self.message = "ready", "Engine sudah berjalan"
                return
            self.token = secrets.token_urlsafe(24)
            cfg = {
                "job": "extension",
                "config": {
                    "name": "aqstyle_studio_engine",
                    "process": [{
                        "type": "InferenceEngine",
                        "device": "cuda",
                        "engine": {
                            "job_folder": ENGINE_DIR.as_posix(),
                            "port": self.port,
                            "token": self.token,
                            "default_model": dict(CFG["model"]),
                        },
                    }],
                },
            }
            cfg_path = ENGINE_DIR / "engine.yaml"
            cfg_path.write_text(yaml.safe_dump(cfg, sort_keys=False), encoding="utf-8")
            env = dict(os.environ, HF_HUB_DISABLE_SYMLINKS="1", PYTHONIOENCODING="utf-8")
            log = open(LOG_DIR / "engine.log", "a", encoding="utf-8")
            aitk = path(CFG["aitk_dir"])
            flags = getattr(subprocess, "CREATE_NEW_PROCESS_GROUP", 0) | getattr(subprocess, "CREATE_NO_WINDOW", 0)
            self.proc = subprocess.Popen(
                [self._python(aitk), "run.py", str(cfg_path)],
                cwd=str(aitk), env=env, stdout=log, stderr=subprocess.STDOUT, creationflags=flags,
            )
            deadline = time.time() + 900
            while time.time() < deadline:
                if self.proc.poll() is not None:
                    raise EngineError(f"Engine berhenti (exit {self.proc.returncode}); lihat data/logs/engine.log")
                try:
                    requests.get(f"{self.base}/health", timeout=2)
                    if requests.get(f"{self.base}/queue", headers=self._headers(), timeout=2).status_code == 200:
                        self.state = "ready"
                        return
                except requests.RequestException:
                    pass
                time.sleep(2)
            raise EngineError("Engine tidak merespons dalam 15 menit")
        except Exception as e:
            self.state, self.message = "error", str(e)

    def health(self):
        try:
            h = requests.get(f"{self.base}/health", timeout=2).json()
        except Exception:
            h = None
        loaded = bool(h and h.get("active"))
        busy = bool(h and h.get("busy"))
        if self.state == "ready" and h is None:
            self.state, self.message = "error", "Koneksi engine terputus. Nyalakan ulang engine."
        if self.state == "ready":
            self.message = "Siap" if loaded and not busy else ("Sedang bekerja" if loaded else "Memuat Qwen-Image 2.1")
        return {"state": self.state, "message": self.message, "model_loaded": loaded, "busy": busy,
                "vram": (h or {}).get("vram")}

    def _python(self, aitk):
        from ..config import load_settings, resolve_python
        configured = CFG.get("python") or load_settings().get("ai_toolkit_python", "")
        return str(path(configured)) if configured else resolve_python(str(aitk), "")

    def stop(self):
        if self.proc is None and getattr(self, "adopted_pid", None):
            if os.name == "nt":
                subprocess.run(["taskkill", "/PID", str(self.adopted_pid), "/T", "/F"],
                               stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                               creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
            else:
                os.kill(self.adopted_pid, 15)
            self.adopted_pid = None
            self.state, self.message = "stopped", "Engine mati; GPU tersedia untuk training"
            return
        if self.state in ("ready", "starting") and self.proc is None:
            raise EngineError("Engine dipakai aplikasi lain. Hentikan studio lama sebelum training.")
        if self.proc and self.proc.poll() is None:
            if os.name == "nt":
                subprocess.run(["taskkill", "/PID", str(self.proc.pid), "/T", "/F"],
                               stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                               creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
            else:
                self.proc.terminate()
            self.proc.wait(timeout=30)
        self.proc = None
        self.state, self.message = "stopped", "Engine mati; GPU tersedia untuk training"

    # ------------------------------------------------------------ generate
    def cancel(self, request_id):
        try:
            requests.post(f"{self.base}/cancel/{request_id}", headers=self._headers(), timeout=5)
        except requests.RequestException:
            pass

    def generate(self, lora_path, prompt, ctrl_imgs, seed, on_progress=None, on_request=None, sample_overrides=None,
                 strength=1.0):
        """Blocks until the image is done; returns the produced file path.
        sample_overrides: e.g. {"guidance_scale": 2.5, "num_inference_steps": 30} (sketch->final mode)."""
        if self.state != "ready":
            raise EngineError("Engine belum siap: " + (self.message or self.state))
        loras = [{"path": str(path(lora_path)), "strength": float(strength)}] if lora_path else []
        model = dict(CFG["model"], loras=loras, lora_mode="hook")
        sample = dict(CFG["sample"], **(sample_overrides or {}), prompt=prompt, seed=int(seed), output_ext="png")
        for i, img in enumerate(ctrl_imgs, start=1):
            sample[f"ctrl_img_{i}"] = str(img)
        sample["ctrl_img"] = str(ctrl_imgs[0])
        body = {"model": model, "sample": sample, "stream": {"latents": "none"}}
        request_id = None
        result = None
        # A quiet GPU/offload stage can outlive the HTTP read timeout. Reattach
        # to the same request (the engine replays frames); never submit twice.
        deadline = time.monotonic() + float(CFG.get("generation_timeout_seconds", 21600))
        while time.monotonic() < deadline:
            try:
                response = (requests.get(f"{self.base}/stream/{request_id}", headers=self._headers(),
                                         stream=True, timeout=(10, 120)) if request_id else
                            requests.post(f"{self.base}/generate", json=body, headers=self._headers(),
                                          stream=True, timeout=(10, 120)))
                with response as r:
                    if r.status_code != 200:
                        raise EngineError(f"Engine menolak request ({r.status_code}): {r.text[:300]}")
                    request_id = request_id or r.headers.get("X-Request-Id")
                    if on_request:
                        on_request(request_id)
                    for header in _frames(r.iter_content(chunk_size=None)):
                        t = header.get("type")
                        if t == "progress" and on_progress:
                            on_progress(header.get("step") or 0, header.get("total") or 0, None)
                        elif t == "status" and on_progress:
                            on_progress(None, None, header.get("message"))
                        elif t == "result":
                            result = header.get("path")
                        elif t == "error":
                            raise EngineError("cancelled" if header.get("cancelled") else header.get("message") or "error")
                        if time.monotonic() >= deadline:
                            break
                    if result:
                        return result
                    if time.monotonic() < deadline:
                        raise EngineError("Engine selesai tanpa gambar")
            except requests.RequestException as exc:
                if not request_id:
                    raise EngineError("Koneksi engine gagal sebelum ID proses diterima; periksa status engine sebelum mencoba lagi") from exc
                if on_progress:
                    on_progress(None, None, "Menyambungkan kembali ke proses yang sama…")
                time.sleep(2)
        if request_id:
            self.cancel(request_id)
        raise EngineError("Batas waktu generate tercapai (6 jam); proses dibatalkan")



def _frames(chunks):
    buf = bytearray()
    it = iter(chunks)

    def fill(n):
        while len(buf) < n:
            try:
                buf.extend(next(it))
            except StopIteration:
                return False
        return True

    while fill(_HDR.size):
        (hlen,) = _HDR.unpack(bytes(buf[:_HDR.size]))
        del buf[:_HDR.size]
        if not fill(hlen + _LEN.size):
            raise EngineError("Stream engine terputus")
        header = json.loads(bytes(buf[:hlen]).decode("utf-8"))
        del buf[:hlen]
        (plen,) = _LEN.unpack(bytes(buf[:_LEN.size]))
        del buf[:_LEN.size]
        if not fill(plen):
            raise EngineError("Stream engine terputus")
        del buf[:plen]
        yield header


ENGINE = Engine()
