# Adexe Studio

Local creative workspace: datasets, LoRA training, sketch-to-final generation, batch production, galleries and interactive learning in one app.

## Run on this computer

```powershell
cd adexe-lora-trainer
.\run.bat
```

Open **http://127.0.0.1:7862**. For LAN access, use `.\run-lan.bat` instead. See **Data & LAN** on the host for LAN addresses and the access code.

If Windows blocks inbound connections, run this once from PowerShell as Administrator:

```powershell
cd adexe-lora-trainer
.\scripts\allow-lan.ps1 -Port 7862
```

The rule permits only LocalSubnet on LAN interfaces. No router port forwarding is required.

Linux / WSL: `./run.sh` (local) or `./run-lan.sh` (LAN). Development: `./dev.sh` → http://localhost:3000.

The launcher refreshes Python dependencies and rebuilds the frontend automatically when source files change. `REBUILD=1` forces a rebuild. Restart only after active training/generation finishes.

## Features
- Light, dark, and system themes; compact cards, workflow diagrams and expandable explanations.
- SQLite history: experiments, session parameter/config snapshots, dataset versions, loss and observed LR, evaluations and events.
- Versioned datasets by SHA256 image/caption manifests. Capture a version manually or automatically before a training session.
- Reports per training session: HTML with embedded sample previews, Markdown, JSON, CSV. Download from **Report & LR**.
- History ZIP export/import plus path remapping to move to another PC. Large assets and credentials are excluded.
- Qwen-Image 2.1, Anima Base, FLUX.2 Klein Base 4B and Z-Image Base LoRA presets.
- **Proyek manhwa** follows the most recently imported AI Toolkit config (or the `project_config_path` setting).
- Optional sketch/reference conditioning for Qwen/Klein, original config import, same-name pair validation before starting.
- Model Lab: comparisons, two-stage versus direct sketch→final guides, LoRA/full fine-tuning/from-scratch/MoE explanations with source links.

## Fresh installation
Python 3.10+, Node.js 20+, git. NVIDIA/CUDA for actual training. The web's venv is separate from the trainer venv.

`run.bat` creates the web environment and builds the frontend initially. Source changes are detected automatically. Configure an existing AI Toolkit checkout and Python interpreter in Settings. Backend installation scripts remain available if needed; installing the web does not download model weights.

## Data
Default folder: `studio-data/`. Database: `studio.sqlite3`. `LORA_STUDIO_DATA` selects another folder. Legacy files are migrated once and retained as archives. Images, checkpoints and raw logs remain files. Do not copy only the SQLite file while the app is writing; use the history export.

For a new PC, start with an empty LORA_STUDIO_DATA directory, import the ZIP, copy assets separately, and remap the old/new workspace root. Reinstall Python environments instead of copying a venv across machines.

## Supported execution
Wizard: LoRA. Config import: supported AI Toolkit model configs, including appropriate full fine-tune configs. From-scratch and MoE are educational guides, not executable trainers in this app. Direct sketch→final requires suitable aligned pairs; no direct dataset or training is generated automatically.

Preset values and memory estimates are starting points, not measured guarantees. Backend code support is not a successful training benchmark. Per-group LR is recorded only when explicitly logged; historical logs are not fabricated.

Architecture and migration: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md). Research: [docs/MODEL_RESEARCH.md](docs/MODEL_RESEARCH.md).

## Unified creative studio

- **Generate Studio**: Sketch → Final v3 with character references, extracted lineart, 2K/4K exports, comparison slider, and the existing two-stage workflow.
- **Batch produksi**: multi-file upload, per-panel settings, CSV import, sequential queue, retries and ZIP download.
- **Galeri karya**: search, status filters, date sorting and browser-local favorites.
- **Training → Generate**: compatible Qwen-Image 2.1 LoRA checkpoints have a **Gunakan untuk generate** action. Use checkpoints trained for the sketch/reference workflow.
- **Lab Interaktif**: three guided decision missions with hints, answer explanations and browser-local progress, plus the existing parameter simulators. No GPU is used for learning.
- Training and generation share a GPU lease. Starting training releases the resident inference engine first; CPU lineart extraction can run independently.

Import an existing Aqstyle workspace while its queue is idle:

```powershell
.venv/Scripts/python scripts/import_aqstyle.py ../aqstyle-studio
```

The import copies the job database, images, exports and upscaler into ignored `studio-data/generation/`. It leaves source files intact. Existing training checkpoints and shared character references stay at their configured locations. Private generation configuration and character presets live in `studio-data/generation-config.json`; it is never committed. CUDA upscaling uses the configured AI Toolkit Python in a subprocess, so the web API does not need PyTorch.

The old studio can still have independent engine work. An imported workspace checks that engine before starting GPU work and refuses to interrupt it. Finish that work and stop the old studio before using GPU actions in Adexe.

## Before publishing code

The launcher installs this repository's `scripts/hooks/pre-push` guard through local Git configuration. The guard examines outgoing Git objects for runtime files, artwork, model weights, binaries and common credential patterns. `.gitignore` also excludes these files. Keep private data in `studio-data/`; do not force-add ignored data or bypass the hook.

```powershell
.venv/Scripts/python scripts/check_publish.py
.venv/Scripts/python tests/test_generation.py
cd frontend
npm run build
```

The generation suite uses synthetic references, temporary storage and a fake inference engine. It covers both pipelines, batch exports, lineart, checkpoint handoff, GPU coordination, API isolation and publish checks. It does not benchmark the real GPU or assess model quality.
