"""LAN access uses a per-machine code and an expiring HttpOnly session."""

import hashlib
import hmac
import ipaddress
import secrets
import socket
import threading
import time
from urllib.parse import urlsplit
from fastapi.responses import JSONResponse
from .config import DATA_DIR

_file = DATA_DIR / "lan-access.key"
if not _file.exists():
    try:
        with _file.open("x", encoding="utf-8") as f:
            f.write(secrets.token_urlsafe(18))
    except FileExistsError:
        pass
_secret = _file.read_text(encoding="utf-8").strip()
_attempts = {}
_lock = threading.Lock()


def local(request):
    try:
        return ipaddress.ip_address(request.client.host).is_loopback
    except (ValueError, AttributeError):
        return False


def signed(exp):
    return hmac.new(_secret.encode(), str(exp).encode(), hashlib.sha256).hexdigest()


def authorized(request):
    if local(request):
        return True
    try:
        exp, sig = request.cookies.get("adexe_session", "").split(".")
        return time.time() < int(exp) and hmac.compare_digest(sig, signed(exp))
    except (ValueError, TypeError):
        return False


async def guard(request, call_next):
    if request.url.path.startswith("/api/"):
        hostname = (request.url.hostname or "").lower()
        try:
            allowed = ipaddress.ip_address(hostname).is_private or ipaddress.ip_address(hostname).is_loopback
        except ValueError:
            allowed = hostname in ("localhost", socket.gethostname().lower(), socket.getfqdn().lower())
        if not allowed:
            return JSONResponse({"detail": "Gunakan alamat lokal studio."}, status_code=403)
        origin = request.headers.get("origin")
        if (
            origin
            and urlsplit(origin).netloc != request.headers.get("host")
            and origin not in ("http://127.0.0.1:3000", "http://localhost:3000")
        ):
            return JSONResponse({"detail": "Origin tidak diizinkan."}, status_code=403)
        if request.url.path not in ("/api/access/info", "/api/access/login") and not authorized(request):
            return JSONResponse({"detail": "Masukkan kode akses dari komputer studio."}, status_code=401)
    return await call_next(request)


def info(request):
    hosts = []
    try:
        hosts = sorted(
            {
                x[4][0]
                for x in socket.getaddrinfo(socket.gethostname(), None, socket.AF_INET)
                if not x[4][0].startswith("127.")
            }
        )
    except OSError:
        pass
    return {
        "authorized": authorized(request),
        "local": local(request),
        "code": _secret if local(request) else None,
        "port": request.url.port or 80,
        "lan_urls": [f"http://{x}:{request.url.port or 80}" for x in hosts] if local(request) else [],
        "expires_hours": 12,
    }


def login(request, code):
    ip = request.client.host
    now = time.time()
    with _lock:
        attempts = [t for t in _attempts.get(ip, []) if now - t < 900]
        if len(attempts) >= 10:
            return JSONResponse({"detail": "Terlalu banyak percobaan. Tunggu 15 menit."}, status_code=429)
        if not hmac.compare_digest(str(code), _secret):
            _attempts[ip] = attempts + [now]
            return JSONResponse({"detail": "Kode akses salah."}, status_code=401)
        _attempts.pop(ip, None)
    exp = int(now + 12 * 3600)
    response = JSONResponse({"authorized": True})
    response.set_cookie("adexe_session", f"{exp}.{signed(exp)}", max_age=12 * 3600, httponly=True, samesite="strict")
    return response
