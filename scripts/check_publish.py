"""Reject private runtime files, model weights, artwork and likely credentials in Git."""
import argparse
import json
from pathlib import Path
import re
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
SOURCE_EXTENSIONS = {".py", ".ts", ".tsx", ".js", ".mjs", ".css", ".md", ".json", ".txt", ".sh", ".bat", ".ps1", ".toml", ".yml", ".yaml", ".patch"}
PRIVATE_DIRS = {"data", "studio-data", "outputs", "datasets", "models", "trainingruns", "backends", "node_modules", ".venv", "venv", "__pycache__", ".next", "out", "_backups"}
PRIVATE_NAMES = {"config.json", "generation-config.json", "characters.json", "character_sources.json"}
SECRET = re.compile(rb"(?:hf_[A-Za-z0-9]{20,}|sk-(?:proj-)?[A-Za-z0-9_-]{24,}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----)")
SECRET_FIELDS = {"hf_token", "api_key", "caption_api_key", "access_token", "auth_token", "password", "secret"}


def git(*args):
    return subprocess.check_output(["git", *args], cwd=ROOT)


def problems(name, content):
    p = Path(name)
    parts = {x.lower() for x in p.parts}
    if (p.parts[0].lower() in PRIVATE_DIRS or parts & {"node_modules", ".venv", "venv", "__pycache__", ".next", "out"}) or p.name.lower() in PRIVATE_NAMES or p.name.startswith(".env") and p.name != ".env.example":
        return "berkas data/konfigurasi privat"
    if p.suffix.lower() not in SOURCE_EXTENSIONS and p.name not in {".gitignore", "pre-push", "pre-commit"}:
        return "tipe berkas di luar kode sumber"
    if len(content) > 2_000_000 or b"\0" in content:
        return "berkas besar atau biner"
    if SECRET.search(content):
        return "pola kredensial"
    if p.suffix == ".json":
        def has_secret(value):
            if isinstance(value, dict):
                return any((k.lower() in SECRET_FIELDS and bool(v)) or has_secret(v) for k, v in value.items())
            return isinstance(value, list) and any(has_secret(v) for v in value)
        try:
            if has_secret(json.loads(content)):
                return "kredensial dalam JSON"
        except (ValueError, UnicodeError):
            return "JSON tidak valid"
    return None


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--ref", help="Audit all outgoing objects reachable from this commit.")
    parser.add_argument("--index", action="store_true")
    args = parser.parse_args()
    failures, checked = [], 0
    if args.ref:
        # Include the target tree even when the commit is already present on a remote.
        objects = {}
        for line in git("rev-list", "--objects", args.ref, "--not", "--remotes").decode().splitlines():
            oid, _, name = line.partition(" ")
            if name and git("cat-file", "-t", oid).strip() == b"blob":
                objects[(oid, name)] = None
        for record in git("ls-tree", "-r", "-z", args.ref).split(b"\0"):
            if record:
                meta, name = record.split(b"\t", 1)
                objects[(meta.split()[2].decode(), name.decode())] = None
        items = ((name, git("cat-file", "blob", oid)) for oid, name in objects)
    else:
        names = git("ls-files", "-z", "--cached", *([] if args.index else ["--others", "--exclude-standard"]))
        paths = sorted(set(n.decode() for n in names.split(b"\0") if n))
        items = ((name, git("show", ":" + name) if args.index else (ROOT / name).read_bytes()) for name in paths)
    for name, content in items:
        checked += 1
        reason = problems(name, content)
        if reason:
            failures.append(f"{name}: {reason}")
    if failures:
        print("Publish diblokir:\n" + "\n".join(failures), file=sys.stderr)
        return 1
    print(f"Audit publish lulus: {checked} berkas sumber; tidak ada data/model/karya atau pola kredensial terdeteksi.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
