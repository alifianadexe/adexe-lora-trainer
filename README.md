# Adexe Studio

Local image-model training workspace: manage datasets, training, evidence, and learning in one place.

## Run on this computer

```powershell
cd C:\Users\Procyon\Documents\Adexe\adexe-lora-trainer
.\run.bat
```

Open **http://127.0.0.1:7862**. For LAN access, use `.\run-lan.bat` instead. See **Data & LAN** on the host for LAN addresses and the access code.

If Windows blocks inbound connections, run this once from PowerShell as Administrator:

```powershell
cd C:\Users\Procyon\Documents\Adexe\adexe-lora-trainer
.\scripts\allow-lan.ps1 -Port 7862
```

The rule permits only LocalSubnet on LAN interfaces. No router port forwarding is required.

## Features
- Light, dark, and system themes; compact cards, workflow diagrams and expandable explanations.
- SQLite history: experiments, session parameter/config snapshots, dataset versions, loss and observed LR, evaluations and events.
- Versioned datasets by SHA256 image/caption manifests. Capture a version manually or automatically before a training session.
- Reports per training session: HTML with embedded sample previews, Markdown, JSON, CSV. Download from **Report & LR**.
- History ZIP export/import plus path remapping to move to another PC. Large assets and credentials are excluded.
- Qwen-Image 2.1, Anima Base, FLUX.2 Klein Base 4B and Z-Image Base LoRA presets.
- Optional sketch/reference conditioning for Qwen/Klein, original config import, same-name pair validation before starting.
- Model Lab: comparisons, two-stage versus direct sketch→final guides, LoRA/full fine-tuning/from-scratch/MoE explanations with source links.

## Fresh installation
Python 3.10+, Node.js 20+, git. NVIDIA/CUDA for actual training. The web's venv is separate from the trainer venv.

`run.bat` creates the web environment and builds the frontend initially. Set `REBUILD=1` to rebuild after source changes. Configure an existing AI Toolkit checkout and Python interpreter in Settings. Backend installation scripts remain available if needed; installing the web does not download model weights.

## Data
Default folder: `studio-data/`. Database: `studio.sqlite3`. `LORA_STUDIO_DATA` selects another folder. Legacy files are migrated once and retained as archives. Images, checkpoints and raw logs remain files. Do not copy only the SQLite file while the app is writing; use the history export.

For a new PC, start with an empty LORA_STUDIO_DATA directory, import the ZIP, copy assets separately, and remap the old/new workspace root. Reinstall Python environments instead of copying a venv across machines.

## Supported execution
Wizard: LoRA. Config import: supported AI Toolkit model configs, including appropriate full fine-tune configs. From-scratch and MoE are educational guides, not executable trainers in this app. Direct sketch→final requires suitable aligned pairs; no direct dataset or training is generated automatically.

Preset values and memory estimates are starting points, not measured guarantees. Backend code support is not a successful training benchmark. Per-group LR is recorded only when explicitly logged; historical logs are not fabricated.

Architecture and migration: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md). Research: [docs/MODEL_RESEARCH.md](docs/MODEL_RESEARCH.md).
