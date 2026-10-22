#!/usr/bin/env bash
# Start LoRA Studio at http://127.0.0.1:7862 (API + built Next.js frontend on one port).
#   REBUILD=1 ./run.sh   -> force rebuilding the frontend
set -e
cd "$(dirname "$0")"

if [ ! -d .venv ]; then
  python3 -m venv .venv
  .venv/bin/pip install -q --upgrade pip
  .venv/bin/pip install -q -r requirements.txt
fi

.venv/bin/python scripts/prepare.py

HOST="${HOST:-127.0.0.1}"
PORT="${PORT:-7862}"
echo "LoRA Studio -> http://${HOST}:${PORT}"
exec .venv/bin/python -m uvicorn app.main:app --host "$HOST" --port "$PORT"
