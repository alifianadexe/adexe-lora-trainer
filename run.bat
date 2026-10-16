@echo off
REM Start LoRA Studio at http://127.0.0.1:7860 (API + built Next.js frontend on one port).
REM   set REBUILD=1 & run.bat   -> force rebuilding the frontend
cd /d "%~dp0"
if not exist .venv (
  python -m venv .venv
  .venv\Scripts\python -m pip install -q --upgrade pip
  .venv\Scripts\python -m pip install -q -r requirements.txt
)
if not exist frontend\out\index.html set REBUILD=1
if "%REBUILD%"=="1" (
  echo Membangun frontend Next.js...
  pushd frontend
  call npm install --no-audit --no-fund
  set NEXT_TELEMETRY_DISABLED=1
  call npm run build
  popd
)
if "%PORT%"=="" set PORT=7860
echo LoRA Studio -^> http://127.0.0.1:%PORT%
.venv\Scripts\python -m uvicorn app.main:app --host 127.0.0.1 --port %PORT%
