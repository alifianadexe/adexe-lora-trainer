# Adexe LoRA Studio

Web GUI lokal untuk **training LoRA Qwen-Image 2.1 dan Anima Base**, dirancang sambil
**belajar**: setiap parameter punya penjelasan ("apa ini, kalau dinaikkan/diturunkan apa
efeknya, berapa sarannya"), parameter awal direkomendasikan beserta alasannya, dan hasil
training ditampilkan sebagai grid preview per-checkpoint supaya kamu bisa melihat kapan
LoRA mulai bagus dan kapan mulai overfit.

Studio ini **bukan trainer baru**. Ia membuat konfigurasi lalu menjalankan trainer yang sudah
terbukti:

| Model | Backend | Catatan |
|---|---|---|
| Qwen-Image 2.1 | [ostris/ai-toolkit](https://github.com/ostris/ai-toolkit) (`arch: qwen_image_2`) | bobot otomatis diunduh dari `Comfy-Org/Qwen-Image-2.1` (int8 convrot) |
| Anima Base | ai-toolkit (`arch: anima`) **atau** [kohya-ss/sd-scripts](https://github.com/kohya-ss/sd-scripts) (`anima_train_network.py`) | ai-toolkit unduh otomatis dari `circlestone-labs/Anima-Base-v1.0-Diffusers`; sd-scripts butuh file model lokal |

## Fitur

- **Dataset manager** — drag & drop gambar, edit caption per gambar (autosave), alat massal
  (tambah trigger di depan, cari & ganti, hapus tag, underscore → spasi), filter
  "tanpa caption / tanpa trigger / resolusi kecil", statistik tag, dan pemeriksaan kesehatan dataset.
- **Auto-caption** lewat model vision lokal apa pun yang punya API OpenAI-compatible
  (Ollama, LM Studio, vLLM) — gaya kalimat natural (Qwen) atau tag Danbooru (Anima).
- **Wizard training** — pilih model → tujuan (karakter / style / konsep) → dataset + VRAM →
  parameter yang direkomendasikan *dengan alasan*, analisis langsung (LR efektif, berapa kali
  tiap gambar dilihat, risiko overfit), dan preview file konfigurasi asli sebelum dijalankan.
- **Monitor job** — progress, ETA, grafik loss (mentah + rata-rata), grid preview
  step × prompt, daftar checkpoint untuk diunduh, log lengkap, dan petunjuk otomatis saat error
  (OOM, package hilang, HF gagal, dll).
- **Iterasi** — tombol "Iterasi (v berikutnya)" menyalin semua parameter job agar kamu cukup
  mengubah satu hal, plus kolom "catatan eksperimen".
- **Halaman Belajar LoRA** — panduan berbahasa Indonesia: dataset, caption & trigger word,
  rumus parameter, membaca underfit/overfit, resep per model, troubleshooting, kamus parameter.

## Kebutuhan

- GPU NVIDIA + driver CUDA. Perkiraan VRAM:
  - **Qwen-Image 2.1**: 24GB nyaman; 16GB bisa dengan low VRAM; 12GB sangat mepet (layer offloading, RAM sistem 32GB+).
  - **Anima**: ~10GB di 512px, ~14GB di 1024px.
- Python 3.10+ dan git. Ruang disk besar (Qwen-Image 2.1 + text encoder 8B = puluhan GB).

## Instalasi

```bash
git clone <repo ini> adexe-lora-trainer
cd adexe-lora-trainer

# 1. Install backend training ke ./backends (sekali saja)
bash scripts/install_backends.sh              # ai-toolkit
bash scripts/install_backends.sh --sd-scripts # + sd-scripts (opsional, Anima)
#   Windows: scripts\install_backends.bat [--sd-scripts]
#   Ganti versi CUDA PyTorch: TORCH_INDEX=https://download.pytorch.org/whl/cu126 bash scripts/install_backends.sh

# 2. Jalankan studio
./run.sh          # Windows: run.bat
```

Buka **http://127.0.0.1:7860**.

Sudah punya ai-toolkit / sd-scripts di tempat lain? Lewati langkah 1 dan isi path-nya di
halaman **Pengaturan**. Python backend dideteksi otomatis dari `venv/` atau `.venv/` di folder itu.

> ai-toolkit harus versi terbaru (yang punya folder
> `extensions_built_in/diffusion_models/qwen_image_2` dan `anima`). Dashboard menunjukkan
> apakah kedua model terdeteksi.

### Anima via sd-scripts

Unduh dari [circlestone-labs/Anima](https://huggingface.co/circlestone-labs/Anima) folder
`split_files/`: file diffusion model **Anima-Base**, text encoder Qwen3-0.6B, dan VAE. Isi ketiga
path di Pengaturan.

### Auto-caption (opsional)

Contoh dengan Ollama:

```bash
ollama pull qwen2.5vl:7b
```

Default Pengaturan sudah mengarah ke `http://localhost:11434/v1` dengan model `qwen2.5vl:7b`.

## Alur kerja

1. **Dataset** → buat dataset, isi trigger word, upload gambar, tulis/auto caption, cek panel kesehatan.
2. **Training Baru** → pilih model & tujuan, baca alasan rekomendasi, ubah bila perlu, review config, mulai.
3. **Jobs** → pantau preview tiap checkpoint. Pilih checkpoint terbaik (biasanya sebelum tanda overfit).
4. **Iterasi** → ubah SATU parameter, tulis catatannya, bandingkan dengan versi sebelumnya.

## Struktur

```
app/            FastAPI backend
  presets.py    pengetahuan model, penjelasan parameter, mesin rekomendasi & analisis
  builders.py   konversi parameter -> ai-toolkit YAML / sd-scripts TOML + command
  jobs.py       antrian job, subprocess, parsing progress/loss, output
  datasets.py   dataset, caption, thumbnail, operasi massal
  captioner.py  auto-caption via API OpenAI-compatible
web/            frontend tanpa build step (HTML + CSS + ES modules)
data/           (dibuat otomatis) datasets/, jobs/, outputs/, settings.json
backends/       (opsional) ai-toolkit & sd-scripts hasil script install
```

Lokasi `data/` bisa diganti dengan env `LORA_STUDIO_DATA=/path/lain`. Port/host: `PORT=7861 HOST=0.0.0.0 ./run.sh`.

## Catatan lisensi model

Qwen-Image 2.1 (Qwen Research License) dan Anima (CircleStone Labs Non-Commercial License)
**bukan** lisensi komersial bebas — cek lisensinya sebelum memakai LoRA hasil training secara komersial.
