# LoRA Studio

Web lokal untuk **training LoRA Qwen-Image 2.1 dan Anima Base**, sekaligus tempat **belajar**
membuat LoRA yang baik. Studio menjelaskan setiap parameter, menganalisis kurva loss secara
otomatis, menunjukkan kesalahan training yang terdeteksi beserta solusinya, dan setelah kamu
menilai checkpoint, ia menyarankan eksperimen berikutnya.

Studio ini **tidak membuat trainer baru**: ia menyusun konfigurasi lalu menjalankan trainer yang sudah terbukti.

| Model | Backend | Catatan |
|---|---|---|
| Qwen-Image 2.1 | [ostris/ai-toolkit](https://github.com/ostris/ai-toolkit) (`arch: qwen_image_2`) | bobot otomatis dari `Comfy-Org/Qwen-Image-2.1` (int8 convrot) |
| Anima Base | ai-toolkit (`arch: anima`) **atau** [kohya-ss/sd-scripts](https://github.com/kohya-ss/sd-scripts) | sd-scripts butuh file model lokal |

## Fitur

**Studio**
- **Dataset**: drag & drop gambar, edit caption langsung, alat massal (trigger di depan, cari & ganti,
  hapus tag, `_` → spasi), auto-caption lewat model vision lokal (Ollama / LM Studio / vLLM), skor
  kesiapan dataset, dan **Caption Coach** yang menandai tiap caption (trigger hilang, quality tag,
  caption duplikat, terlalu singkat, resolusi kecil).
- **Wizard training**: pilih model → tujuan → dataset & VRAM → parameter rekomendasi **beserta
  alasannya**. Panel analisis langsung menampilkan LR efektif, berapa kali tiap gambar dilihat,
  **perkiraan VRAM** per komponen, dan jadwal learning rate. Mode Esensial / Semua parameter.
  Perubahan dari rekomendasi ditandai dan bisa di-reset.
- **Monitor job**
  - **Diagnosa**: skor kesehatan run, kurva loss mentah + EMA dengan penanda paparan (50×/100×/150×),
    dan temuan otomatis seperti loss naik, NaN, lonjakan, plateau, LR terlalu tinggi, atau risiko overfit.
    Setiap temuan tertaut ke halaman kesalahan umum.
  - **Preview**: grid step × prompt.
  - **Evaluasi**: beri bintang kemiripan, fleksibilitas, dan kualitas untuk tiap checkpoint. Studio lalu
    menyimpulkan apakah run overtrain atau undertrain, menyarankan perubahan parameter, dan bisa
    membuat iterasi dengan saran itu dalam satu klik.
  - **Checkpoint**: unduh file LoRA. Tab lain: log, parameter beserta artinya, dan config asli.
- **Bandingkan**: diff parameter antar run (dengan peringatan jika lebih dari satu hal diubah),
  overlay kurva loss, dan ringkasan skor evaluasi.

**Belajar**
- **Akademi LoRA**: panduan bab demi bab (diagram LoRA, dataset, caption, tiga rumus inti,
  membaca underfit/overfit, resep per model, kamus konsep).
- **Ensiklopedia Parameter**: tiap parameter dengan analogi, rumus, gejala jika terlalu tinggi
  atau rendah, saran per model, dan kesalahan terkait. Juga bisa dibuka dari tombol **?** di mana saja.
- **Kesalahan Umum**: 22 kasus gejala → penyebab → solusi, bisa dicari dari gejalanya
  (misal "gosong", "NaN", "mirip dataset").
- **Lab Interaktif**: simulator di browser untuk LR efektif, paparan vs overfit, kurva loss yang
  berisik, distribusi timestep, LR scheduler, dan matematika rank.

## Kebutuhan

- GPU NVIDIA + CUDA. Qwen-Image 2.1: 24GB nyaman, 16GB dengan low VRAM. Anima: ~10GB @512px, ~14GB @1024px.
- Python 3.10+, **Node.js 20+** (untuk build frontend), git, dan ruang disk besar.

## Instalasi & menjalankan

```bash
# 1. Backend training (sekali)
bash scripts/install_backends.sh              # ai-toolkit
bash scripts/install_backends.sh --sd-scripts # + sd-scripts (opsional, Anima)
#   Windows: scripts\install_backends.bat [--sd-scripts]

# 2. Jalankan studio (build frontend otomatis saat pertama kali)
./run.sh            # Windows: run.bat
```

Buka **http://127.0.0.1:7860**. Setelah `git pull`, jalankan `REBUILD=1 ./run.sh` untuk membangun ulang frontend.

Sudah punya ai-toolkit / sd-scripts di tempat lain? Isi path-nya di **Pengaturan**.

### Mode pengembangan

```bash
./dev.sh   # API :7860 (auto-reload) + Next.js dev :3000 → buka http://localhost:3000
```

## Arsitektur

```
app/                FastAPI (API + menyajikan frontend hasil build)
  presets.py        info model, parameter, mesin rekomendasi, analisis langsung
  knowledge.py      materi belajar: detail parameter, kesalahan umum, konsep
  insights.py       diagnosa run, saran dari evaluasi, perkiraan VRAM, jadwal LR
  builders.py       parameter → ai-toolkit YAML / sd-scripts TOML + command
  jobs.py           antrian, subprocess, parsing progress/loss/NaN, evaluasi
  datasets.py       dataset, caption, thumbnail, operasi massal
frontend/           Next.js 16 (App Router, static export) + Tailwind 4 + Recharts
  app/              halaman: dashboard, datasets, train, jobs, compare, learn/*, settings
  components/       UI, grafik, panel penjelasan parameter
data/               (otomatis) datasets/, jobs/, outputs/, settings.json
```

Angka di studio (rekomendasi, perkiraan VRAM, kurva di Lab) adalah **titik awal dan alat belajar**,
bukan jaminan. Itulah gunanya evaluasi dan iterasi.

## Lisensi model

Qwen-Image 2.1 (Qwen Research License) dan Anima (CircleStone Labs Non-Commercial License) bukan
lisensi komersial bebas. Cek lisensinya sebelum memakai hasil training secara komersial.
