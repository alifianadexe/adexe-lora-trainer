#!/usr/bin/env bash
# Start Adexe LoRA Studio at http://127.0.0.1:7860
set -e
cd "$(dirname "$0")"
if [ ! -d .venv ]; then
  python3 -m venv .venv
  .venv/bin/pip install -q --upgrade pip
  .venv/bin/pip install -q -r requirements.txt
fi
HOST="${HOST:-127.0.0.1}"
PORT="${PORT:-7860}"
echo "LoRA Studio -> http://${HOST}:${PORT}"
exec .venv/bin/python -m uvicorn app.main:app --host "$HOST" --port "$PORT"
