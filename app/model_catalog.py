"""Small, sourced catalog; execution support is distinct from research ideas."""

EXTRA_MODELS = {
    "flux2_klein_4b": {
        "id": "flux2_klein_4b",
        "label": "FLUX.2 Klein Base 4B",
        "vendor": "Black Forest Labs",
        "backends": ["ai-toolkit"],
        "hf": "black-forest-labs/FLUX.2-klein-base-4B",
        "license": "Apache 2.0",
        "caption_style": "natural",
        "caption_hint": "Deskripsikan subjek, aksi, ekspresi, komposisi dan detail yang boleh berubah.",
        "arch": [
            "Transformer sekitar 4B dengan text encoder Qwen3-4B",
            "Base tanpa distilasi, tersedia untuk fine-tuning",
            "Mendukung generasi dan referensi gambar; alur editing diimpor melalui config",
        ],
        "notes": [
            "Gunakan varian Base untuk eksperimen training ini.",
            "Backend lokal memiliki arch flux2_klein_4b; bobot belum diunduh atau dibenchmark oleh studio.",
            "Wizard mendukung LoRA dengan conditioning opsional. Impor config untuk pasangan sample yang berbeda per prompt.",
        ],
        "sample_defaults": {"guidance": 4.0, "steps": 30, "width": 1024, "height": 1024, "neg": ""},
        "source": "https://huggingface.co/black-forest-labs/FLUX.2-klein-base-4B",
    },
    "zimage": {
        "id": "zimage",
        "label": "Z-Image Base",
        "vendor": "Tongyi-MAI",
        "backends": ["ai-toolkit"],
        "hf": "Tongyi-MAI/Z-Image",
        "license": "Apache 2.0",
        "caption_style": "natural",
        "caption_hint": "Gunakan kalimat visual yang jelas; caption sesuai gambar target.",
        "arch": [
            "Model generasi gambar dengan transformer 6B",
            "Text encoder Qwen3; VAE keluarga FLUX.1",
            "Pilihan untuk mempelajari gaya dan karakter melalui LoRA text-to-image",
        ],
        "notes": [
            "Preset memakai Base, bukan Turbo. Keduanya mempunyai kebutuhan training yang berbeda.",
            "Dukungan kode backend terdeteksi lokal; model belum dibenchmark di PC ini.",
            "Tidak otomatis menjadi model sketch-to-image hanya dengan melatih gambar final. Perlu conditioning yang didukung backend.",
        ],
        "sample_defaults": {"guidance": 4.0, "steps": 30, "width": 1024, "height": 1024, "neg": ""},
        "source": "https://huggingface.co/Tongyi-MAI/Z-Image",
    },
}

GUIDES = [
    {
        "id": "lora",
        "title": "LoRA",
        "tag": "Bisa dijalankan",
        "effort": "Mulai di sini",
        "summary": "Latih adapter kecil di atas model dasar. Cocok untuk gaya, karakter, dan transformasi spesifik.",
        "steps": [
            "Pilih model dasar dan tujuan yang terukur.",
            "Bekukan versi dataset dan pisahkan eval.",
            "Simpan checkpoint, nilai hasil, lalu ubah satu variabel.",
        ],
        "source": "https://huggingface.co/docs/peft/package_reference/lora",
    },
    {
        "id": "full",
        "title": "Full fine-tuning",
        "tag": "Lewat config impor",
        "effort": "Eksperimen lanjutan",
        "summary": "Memperbarui bobot utama model. Biaya memori dan risiko lupa kemampuan lama lebih besar daripada LoRA.",
        "steps": [
            "Gunakan config backend yang memang mendukung full fine-tuning; jangan hanya menaikkan rank LoRA.",
            "Mulai dari model pretrained dan simpan baseline.",
            "Hitung memori optimizer dan kebutuhan hardware sebelum menjalankan.",
        ],
        "source": "https://github.com/ostris/ai-toolkit",
    },
    {
        "id": "scratch",
        "title": "Model dari nol",
        "tag": "Panduan riset",
        "effort": "Butuh proyek tersendiri",
        "summary": "Melatih arsitektur dari inisialisasi awal memerlukan data dan komputasi jauh lebih besar. Dataset manhwa kita cocok untuk adaptasi model pretrained.",
        "steps": [
            "Definisikan arsitektur, tokenizer/encoder dan objective.",
            "Siapkan dataset luas, evaluasi, dan rencana komputasi.",
            "Studio ini belum menyediakan trainer from-scratch.",
        ],
        "source": "https://huggingface.co/docs/diffusers/training/overview",
    },
    {
        "id": "moe",
        "title": "Mixture of Experts",
        "tag": "Panduan riset",
        "effort": "Arsitektur, bukan opsi optimizer",
        "summary": "Router memilih expert untuk suatu input. Menambahkan beberapa LoRA tidak otomatis menghasilkan MoE.",
        "steps": [
            "Bedakan fine-tuning model MoE dari membangun router dan expert baru.",
            "PEFT dapat menarget parameter expert tertentu pada model yang kompatibel.",
            "Studio ini belum mengeksekusi training MoE. Mulai dengan baseline LoRA yang bisa dievaluasi.",
        ],
        "source": "https://huggingface.co/docs/peft/package_reference/lora",
    },
]

WORKFLOWS = [
    {
        "id": "two_stage",
        "title": "Sketch → lineart → final",
        "status": "Dataset kita tersedia",
        "nodes": ["Sketch + adegan + referensi", "Lineart", "Final warna"],
        "why": "Setiap tahap bisa dinilai dan diperbaiki terpisah. Gunakan hasil Stage 1 terbaik sebagai bagian evaluasi Stage 2.",
        "data": [
            "Stage 1: sketch, target lineart, referensi identitas.",
            "Stage 2: lineart, target final, referensi desain/warna.",
        ],
        "evaluate": ["Aksi dan ekspresi", "Identitas karakter", "Ketegasan garis", "Warna dan konsistensi"],
    },
    {
        "id": "direct",
        "title": "Sketch → final cleanup",
        "status": "Eksperimen pasangan langsung",
        "nodes": ["Sketch + adegan + referensi", "Model editing + LoRA", "Final cleanup"],
        "why": "Memungkinkan eksperimen satu tahap, tetapi detail dan warna harus dipelajari bersama. Bandingkan dengan baseline dua tahap pada eval yang sama.",
        "data": [
            "Pasangkan sketch dengan final dari panel yang sama.",
            "Tambahkan identitas, aksi, ekspresi, pakaian, dan warna yang tidak jelas di sketch.",
            "Pisahkan panel eval dan hindari kebocoran adegan/duplikasi.",
        ],
        "evaluate": ["Komposisi dan pose", "Detail yang masuk akal", "Palet warna", "Stabilitas pada sketch baru"],
    },
]


def catalog():
    from .presets import MODELS

    return {
        "models": list(MODELS.values()),
        "training_modes": GUIDES,
        "workflows": WORKFLOWS,
        "researched_at": "2026-10-17",
        "editing_reference": {
            "label": "Qwen-Image-Edit-2511",
            "source": "https://huggingface.co/Qwen/Qwen-Image-Edit-2511",
            "status": "Kandidat editing untuk riset; belum tersedia sebagai preset wizard di studio ini.",
        },
    }
