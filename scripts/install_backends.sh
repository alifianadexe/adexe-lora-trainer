#!/usr/bin/env bash
# Clone + install the training backends into ./backends (Linux / WSL).
#   bash scripts/install_backends.sh            -> ai-toolkit only
#   bash scripts/install_backends.sh --sd-scripts -> also kohya sd-scripts (Anima)
set -e
cd "$(dirname "$0")/.."
mkdir -p backends
TORCH_INDEX="${TORCH_INDEX:-https://download.pytorch.org/whl/cu128}"

if [ ! -d backends/ai-toolkit ]; then
  git clone https://github.com/ostris/ai-toolkit.git backends/ai-toolkit
fi
(
  cd backends/ai-toolkit
  git pull --ff-only || true
  [ -d venv ] || python3 -m venv venv
  venv/bin/pip install --upgrade pip
  venv/bin/pip install torch torchvision torchaudio --index-url "$TORCH_INDEX"
  venv/bin/pip install -r requirements.txt
)

# SeedVR2 upscaler for the dataset generator (runs in the ai-toolkit venv; models download on first use)
SEEDVR2_COMMIT=4490bd1f482e026674543386bb2a4d176da245b9
[ -d backends/seedvr2 ] || git clone https://github.com/numz/ComfyUI-SeedVR2_VideoUpscaler.git backends/seedvr2
(
  cd backends/seedvr2
  git fetch origin "$SEEDVR2_COMMIT" && git checkout -q "$SEEDVR2_COMMIT"
  git apply --reverse --check ../../scripts/patches/seedvr2-flash-attn.patch 2>/dev/null \
    || git apply ../../scripts/patches/seedvr2-flash-attn.patch
)
backends/ai-toolkit/venv/bin/pip install rotary_embedding_torch

if [ "$1" = "--sd-scripts" ]; then
  if [ ! -d backends/sd-scripts ]; then
    git clone https://github.com/kohya-ss/sd-scripts.git backends/sd-scripts
  fi
  (
    cd backends/sd-scripts
    git pull --ff-only || true
    [ -d venv ] || python3 -m venv venv
    venv/bin/pip install --upgrade pip
    venv/bin/pip install torch torchvision --index-url "$TORCH_INDEX"
    venv/bin/pip install -r requirements.txt
    venv/bin/accelerate config default || true
  )
fi
echo "Selesai. Jalankan ./run.sh lalu buka http://127.0.0.1:7860"
