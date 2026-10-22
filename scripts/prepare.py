"""Refresh dependencies and exported UI only when their source files changed."""
import os
from pathlib import Path
import shutil
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]


def main():
    os.chdir(ROOT)
    marker = ROOT / ".venv/.adexe-requirements"
    requirements = (ROOT / "requirements.txt").read_bytes()
    if not marker.exists() or marker.read_bytes() != requirements:
        subprocess.run([sys.executable, "-m", "pip", "install", "-q", "-r", "requirements.txt"], check=True)
        marker.write_bytes(requirements)
    web = ROOT / "frontend"
    index = web / "out/index.html"
    sources = [p for folder in ("app", "components", "lib") for p in (web / folder).rglob("*") if p.is_file()]
    sources += [web / f for f in ("package.json", "package-lock.json", "next.config.ts", "postcss.config.mjs", "tsconfig.json")]
    rebuild = os.environ.get("REBUILD") == "1" or not index.exists() or any(p.stat().st_mtime > index.stat().st_mtime for p in sources)
    if rebuild:
        npm = shutil.which("npm")
        if not npm:
            raise RuntimeError("Node.js/npm diperlukan untuk membangun tampilan studio.")
        subprocess.run([npm, "install", "--no-audit", "--no-fund"], cwd=web, check=True)
        subprocess.run([npm, "run", "build"], cwd=web, env=dict(os.environ, NEXT_TELEMETRY_DISABLED="1"), check=True)
    subprocess.run(["git", "config", "--local", "core.hooksPath", "scripts/hooks"], cwd=ROOT, check=True)


if __name__ == "__main__":
    main()
