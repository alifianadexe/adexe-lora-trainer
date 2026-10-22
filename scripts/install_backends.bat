@echo off
REM Clone + install the training backends into .\backends (Windows).
REM   scripts\install_backends.bat              -> ai-toolkit only
REM   scripts\install_backends.bat --sd-scripts -> also kohya sd-scripts (Anima)
cd /d "%~dp0\.."
if not exist backends mkdir backends
if "%TORCH_INDEX%"=="" set TORCH_INDEX=https://download.pytorch.org/whl/cu128

if not exist backends\ai-toolkit git clone https://github.com/ostris/ai-toolkit.git backends\ai-toolkit
pushd backends\ai-toolkit
git pull --ff-only
if not exist venv python -m venv venv
venv\Scripts\python -m pip install --upgrade pip
venv\Scripts\python -m pip install torch torchvision torchaudio --index-url %TORCH_INDEX%
venv\Scripts\python -m pip install -r requirements.txt
popd

REM SeedVR2 upscaler for the dataset generator (runs in the ai-toolkit venv; models download on first use)
if not exist backends\seedvr2 git clone https://github.com/numz/ComfyUI-SeedVR2_VideoUpscaler.git backends\seedvr2
pushd backends\seedvr2
git fetch origin 4490bd1f482e026674543386bb2a4d176da245b9
git checkout -q 4490bd1f482e026674543386bb2a4d176da245b9
git apply --reverse --check ..\..\scripts\patches\seedvr2-flash-attn.patch 2>nul || git apply ..\..\scripts\patches\seedvr2-flash-attn.patch
popd
backends\ai-toolkit\venv\Scripts\python -m pip install rotary_embedding_torch

if "%1"=="--sd-scripts" (
  if not exist backends\sd-scripts git clone https://github.com/kohya-ss/sd-scripts.git backends\sd-scripts
  pushd backends\sd-scripts
  git pull --ff-only
  if not exist venv python -m venv venv
  venv\Scripts\python -m pip install --upgrade pip
  venv\Scripts\python -m pip install torch torchvision --index-url %TORCH_INDEX%
  venv\Scripts\python -m pip install -r requirements.txt
  venv\Scripts\accelerate config default
  popd
)
echo Selesai. Jalankan run.bat lalu buka http://127.0.0.1:7860
