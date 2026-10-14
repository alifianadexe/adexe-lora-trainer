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
