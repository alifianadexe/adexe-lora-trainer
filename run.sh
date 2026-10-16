#!/usr/bin/env bash
# Start LoRA Studio at http://127.0.0.1:7860 (API + built Next.js frontend on one port).
#   REBUILD=1 ./run.sh   -> force rebuilding the frontend
set -e
cd "$(dirname "$0")"

if [ ! -d .venv ]; then
  python3 -m venv .venv
  .venv/bin/pip install -q --upgrade pip
  .venv/bin/pip install -q -r requirements.txt
fi

if [ ! -f frontend/out/index.html ] || [ "${REBUILD:-0}" = "1" ]; then
  command -v npm >/dev/null || { echo "Node.js 20+ dibutuhkan untuk build frontend (https://nodejs.org)"; exit 1; }
  echo "Membangun frontend Next.js..."
  (cd frontend && npm install --no-audit --no-fund && NEXT_TELEMETRY_DISABLED=1 npm run build)
fi

HOST="${HOST:-127.0.0.1}"
PORT="${PORT:-7860}"
echo "LoRA Studio -> http://${HOST}:${PORT}"
exec .venv/bin/python -m uvicorn app.main:app --host "$HOST" --port "$PORT"
