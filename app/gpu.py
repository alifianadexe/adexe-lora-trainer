"""One process-wide GPU lease shared by training and generation workers."""
import threading

lease = threading.RLock()
owner = None


def check_external_engine():
    """An imported studio may still be running a separate job. Never interrupt it."""
    import json
    import requests
    from .generation.settings import CFG, path
    info = CFG.get("legacy_engine_info")
    if not info or not path(info).is_file():
        return
    try:
        legacy = json.loads(path(info).read_text(encoding="utf-8"))
        health = requests.get(f"http://127.0.0.1:{int(legacy['port'])}/health", timeout=2).json()
    except (OSError, ValueError, KeyError, requests.RequestException):
        return
    if health.get("active") or health.get("busy"):
        raise ValueError("Engine Aqstyle lama masih memakai GPU. Tunggu job lama selesai lalu hentikan studio lama sebelum training/generate di Adexe Studio.")
