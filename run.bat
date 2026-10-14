@echo off
REM Start Adexe LoRA Studio at http://127.0.0.1:7860
cd /d "%~dp0"
if not exist .venv (
  python -m venv .venv
  .venv\Scripts\python -m pip install -q --upgrade pip
  .venv\Scripts\python -m pip install -q -r requirements.txt
)
if "%PORT%"=="" set PORT=7860
echo LoRA Studio -^> http://127.0.0.1:%PORT%
.venv\Scripts\python -m uvicorn app.main:app --host 127.0.0.1 --port %PORT%
