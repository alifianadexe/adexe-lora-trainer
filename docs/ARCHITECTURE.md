# Storage & runtime architecture

## Modules
- `database.py`: SQLite v1 repository, legacy migration, jobs/settings/datasets, sessions, observations, events.
- `tracking.py`: immutable run provenance and SHA256 dataset/control manifests.
- `jobs.py`: single worker, preflight, trainer subprocess and observed metrics. Each launch/resume gets a new session ID.
- `reports.py`: HTML (offline preview thumbnails), Markdown, JSON and CSV. Artifacts saved after each finished session in `studio-data/reports/<job>/`.
- `portability.py`: sanitized history ZIP and transactional root remapping. Original run snapshots remain historical.
- `access.py`: private LAN sessions, same-origin requests, per-machine code, 12h HttpOnly cookie.
- `model_catalog.py`: sourced model choices, workflows and training-method guides.

## Data contract
SQLite is the authoritative record. WAL provides concurrent readers; transactions commit each update. A process lease allows one training worker per data directory. Legacy JSON/JSONL files are migration inputs and retained as archives; they are not updated as a second database. A copy of the legacy inputs is in migration-backups/ on this machine.

Images, weights, samples, logs and config files remain filesystem assets. The database stores their metadata and bindings. Dataset versions hash image bytes and caption content; control manifests hash reference bytes. They do not freeze/copy the actual images. Old runs lacking version hashes remain explicitly unverified.

## Observations vs plans
`params.lr` is configured LR. `metrics.lr` is the LR parsed from actual backend stdout. `group_lrs` only contains labels explicitly logged by the backend. An empty group map means unavailable, not zero. It is not a per-weight learning rate. Scheduler charts are plans, separate from observed charts. No historical curve is invented from checkpoint metadata.

## Migration and moving computers
1. Export history ZIP in Data & LAN.
2. Copy datasets, reference images, checkpoints and outputs separately. Reinstall Python environments and training backend on the new machine.
3. Start a fresh data directory: set LORA_STUDIO_DATA to an empty directory before running the studio.
4. Import the ZIP. Existing jobs are not overwritten; queued/running records become stopped.
5. Preview old root → new root, copy required assets, then apply. Optional uninstalled sd-scripts paths do not block rebinding.
6. Review backend Python path in Settings. API credentials and LAN sessions are not exported. Historical snapshots keep their old machine/path information.

ZIP is a portable history snapshot, not a full machine backup. API keys and model weights are excluded. Configs are regenerated from stored snapshots/params after import. Dataset sample assets must be copied separately.

## LAN
Run `run-lan.bat`; default port 7862. The host reveals the access code in Data & LAN. Remote clients must sign in. Use trusted local networks. No router port-forwarding is needed. `scripts/allow-lan.ps1` adds a port rule limited to LocalSubnet and active LAN interfaces; Windows Administrator rights are required for that rule.

## Validation limits
The frontend is built with Next.js/TypeScript. The unified studio has integration tests with synthetic fixtures and a fake engine, plus browser verification of the light/dark interfaces and learning missions. New GPU training and full generation are not run while existing GPU work is active.

## Integrated generation

`app/generation/` contains the imported generation pipeline as a proper Python package. Its API router is included under `/api/generate/`, preserving `/api/jobs` for training. The parent server's LAN authentication and origin checks protect both. One main startup lifecycle initializes the generation queue; importing generation modules does not start a GPU engine.

`app/gpu.py` provides a shared process lease. Workers wait for the lease before launching training or generation. Training releases an owned inference engine before starting; an external legacy engine is detected without interrupting its work. The PyTorch upscaler runs under the configured training interpreter in a subprocess and releases its allocation on exit. Re-extracting lineart uses CPU processing and image resizing only.

`frontend/components/generation/` preserves the generation features inside the existing layout. Generation CSS is scoped below `.generation-studio` and derives colors from trainer tokens. Navigation, typography, themes and access gates are shared. Favorites and guided-learning progress use browser local storage; image data is not stored there.

The non-destructive import uses SQLite's backup API, requires no queued/running legacy jobs, and copies job images and batch exports into the ignored workspace. Character-specific outfit presets are data in the ignored local config, separate from tracked prompt-building code. Shared dataset/checkpoint paths remain external references. The training-history ZIP does not currently include the generation database or artwork: copy `studio-data/generation/` and the private generation config separately when moving machines.
