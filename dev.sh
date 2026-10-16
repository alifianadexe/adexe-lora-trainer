#!/usr/bin/env bash
# Development: API with auto-reload on :7862 + Next.js dev server on :3000 (open :3000).
set -e
cd "$(dirname "$0")"
[ -d .venv ] || { python3 -m venv .venv && .venv/bin/pip install -q -r requirements.txt; }
[ -d frontend/node_modules ] || (cd frontend && npm install --no-audit --no-fund)
.venv/bin/python -m uvicorn app.main:app --port 7862 --reload &
API=$!
trap 'kill $API' EXIT
cd frontend && NEXT_TELEMETRY_DISABLED=1 npm run dev
