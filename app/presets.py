"""Model knowledge base, parameter explanations and the recommendation engine.

Everything the UI teaches lives here so it can be tuned in one place. Numbers
are starting points collected from the model authors and the trainer docs, not
guarantees - the UI says so too.
"""

from copy import deepcopy

# ---------------------------------------------------------------------------
# Models
# ---------------------------------------------------------------------------

MODELS = {
    "qwen_image_2": {
        "id": "qwen_image_2",
        "label": "Qwen-Image 2.1",
        "vendor": "Alibaba Qwen",
        "backends": ["ai-toolkit"],
        "hf": "Comfy-Org/Qwen-Image-2.1",
        "license": "Qwen Research License (non-commercial tanpa lisensi terpisah)",
        "arch": [
            "DiT single-stream 32 layer, ~7B parameter (bagian visual)",
            "Text encoder: Qwen3-VL-8B",
            "VAE: RGBA, kompresi spasial 16x, 64 channel latent",
            "Satu checkpoint untuk text-to-image DAN editing (pakai gambar referensi)",
            "Resolusi native sampai 2048x2048, ukuran bucket kelipatan 32",
        ],
        "caption_style": "natural",
        "caption_hint": (
            "Gunakan kalimat natural language yang deskriptif (seperti prompt biasa). "
            "Qwen memakai LLM sebagai text encoder, jadi ia paham kalimat panjang. "
            "Deskripsikan hal yang BOLEH berubah (pakaian, pose, background), dan biarkan "
            "trigger word mewakili hal yang ingin dipelajari."
        ),
        "notes": [
            "Di ai-toolkit arch-nya `qwen_image_2` (bukan `qwen_image`). Bobot diambil dari repack Comfy-Org yang sudah pre-quantized int8 (convrot8).",
            "Text encoder 8B sangat besar - cache text embeddings hampir wajib di bawah 48GB VRAM. Konsekuensinya: trigger word harus tertulis langsung di caption, dan caption tidak bisa di-shuffle.",
            "Sampling preview default guidance 3.0.",
            "Opsi RGBA: aktifkan jika dataset kamu PNG transparan dan kamu ingin LoRA menghasilkan aset transparan.",
            "Model juga bisa di-train untuk editing (pasangan control/target), tapi studio ini fokus ke text-to-image LoRA dulu.",
        ],
        "sample_defaults": {"guidance": 3.0, "steps": 25, "width": 1024, "height": 1024, "neg": ""},
    },
    "anima": {
        "id": "anima",
        "label": "Anima Base",
        "vendor": "CircleStone Labs",
        "backends": ["ai-toolkit", "sd-scripts"],
        "hf": "circlestone-labs/Anima-Base-v1.0-Diffusers",
        "license": "CircleStone Labs Non-Commercial License",
        "arch": [
            "DiT ~2B parameter (desain MiniTrainDIT / Cosmos), Rectified Flow",
            "Text encoder: Qwen3-0.6B + LLM Adapter (jembatan 6 layer ke ruang T5)",
            "VAE: Qwen-Image VAE (16 channel, 8x downscale)",
            "Base dilatih utamanya di 512px - 768px adalah resolusi training yang praktis",
            "Spesialis anime / ilustrasi, paham tag Danbooru dan natural language",
        ],
        "caption_style": "tags",
        "caption_hint": (
            "Gabungan tag Danbooru (huruf kecil, pakai spasi bukan underscore) dan/atau kalimat. "
            "Urutan yang disarankan: [trigger], 1girl/1boy, karakter, seri, artist, lalu tag umum. "
            "Untuk dataset LoRA, JANGAN masukkan quality tag (masterpiece, score_9) kecuali kamu "
            "memang ingin LoRA mengubah arti tag tersebut."
        ),
        "notes": [
            "Selalu train di Anima-Base, bukan versi Aesthetic/Turbo - LoRA dari Base lebih fleksibel dan bisa dipakai di varian lain.",
            "Pembuat model menyarankan learning rate RENDAH: mulai 2e-5 untuk rank 32 (dengan alpha = rank). Jangan pakai kebiasaan SDXL 1e-4.",
            "LLM Adapter mudah rusak jika ikut di-train - biarkan off kecuali kamu tahu tujuannya.",
            "Hanya bf16 (tidak bisa fp16). VRAM kira-kira ~10GB di 512px dan ~14GB di 1024px (batch 1, gradient checkpointing).",
            "Text encoder kecil (0.6B) jadi TIDAK perlu cache text embeddings - sehingga shuffle tag dan caption dropout tetap berfungsi.",
        ],
        "sample_defaults": {
            "guidance": 4.0,
            "steps": 30,
            "width": 1024,
            "height": 1024,
            "neg": "worst quality, low quality, score_1, score_2, score_3, blurry, jpeg artifacts, sepia, signature, artist name",
        },
    },
}

GOALS = {
    "character": {
        "label": "Karakter / Orang",
        "desc": "Mengajari wajah, tubuh, dan ciri khas satu karakter atau orang.",
        "dataset": "15-40 gambar. Variasikan pose, ekspresi, sudut kamera, pakaian, dan background. Wajah harus jelas di sebagian besar gambar.",
    },
    "style": {
        "label": "Gaya Gambar / Art Style",
        "desc": "Mengajari gaya visual (goresan, warna, shading) tanpa mengunci objek tertentu.",
        "dataset": "30-100 gambar dengan gaya konsisten tapi SUBJEK yang beragam (orang, hewan, benda, pemandangan).",
    },
    "concept": {
        "label": "Konsep / Objek / Pakaian",
        "desc": "Mengajari benda, pakaian, pose khusus, atau efek tertentu.",
        "dataset": "15-40 gambar. Objek terlihat jelas, dengan konteks dan pemakai yang bervariasi.",
    },
}

VRAM_TIERS = [12, 16, 24, 32, 48]

# ---------------------------------------------------------------------------
# Parameter encyclopedia (shown as "?" help next to every field)
# ---------------------------------------------------------------------------

PARAMS = [
    # ---- Network
    {
        "key": "rank", "label": "Rank (network dim)", "group": "Network", "type": "int", "min": 1, "max": 256,
        "what": "Ukuran 'kapasitas' LoRA. LoRA menambahkan dua matriks kecil (A dan B) ke tiap layer; rank adalah lebar matriks itu.",
        "up": "Bisa menyimpan detail lebih banyak, file lebih besar, lebih mudah overfit (menghafal dataset).",
        "down": "File kecil, lebih general, tapi detail halus (wajah mirip, tekstur) bisa kurang.",
        "tip": "Karakter: 16-32. Style: 32-64. Jarang perlu > 64 untuk model modern.",
    },
    {
        "key": "alpha", "label": "Alpha", "group": "Network", "type": "float", "min": 0.01, "max": 256,
        "what": "Faktor skala output LoRA. Kekuatan efektif = alpha / rank. Alpha = rank berarti skala 1.0.",
        "up": "Update LoRA lebih kuat - sama efeknya seperti menaikkan learning rate.",
        "down": "Update lebih lemah - butuh learning rate lebih besar untuk hasil yang sama.",
        "tip": "Paling mudah: set alpha = rank, lalu atur kekuatan lewat learning rate saja. Semua rekomendasi di studio ini mengasumsikan alpha = rank.",
    },
    # ---- Optimizer
    {
        "key": "lr", "label": "Learning rate", "group": "Optimizer", "type": "float", "min": 0, "max": 0.01, "step": "any",
        "what": "Seberapa besar langkah perubahan bobot di setiap step. Parameter paling penting.",
        "up": "Belajar lebih cepat, tapi bisa 'gosong' (warna jenuh, artefak, wajah rusak) atau merusak pengetahuan dasar model.",
        "down": "Lebih aman dan halus, tapi butuh step lebih banyak; terlalu kecil = LoRA tidak terasa efeknya.",
        "tip": "Qwen-Image 2.1: ~1e-4. Anima: ~2e-5 (rank 32). Kalau sample cepat rusak, turunkan 2x. Kalau di 2000 step belum mirip, naikkan 1.5x.",
    },
    {
        "key": "optimizer", "label": "Optimizer", "group": "Optimizer", "type": "select",
        "options": ["adamw8bit", "adamw", "prodigy", "adafactor"],
        "what": "Algoritma yang memperbarui bobot. AdamW8bit = AdamW versi hemat VRAM.",
        "up": "-", "down": "-",
        "tip": "adamw8bit adalah pilihan aman. 'prodigy' mengatur LR sendiri (set lr = 1.0) - menarik untuk eksperimen tapi kurang bisa diprediksi.",
    },
    {
        "key": "lr_scheduler", "label": "LR scheduler", "group": "Optimizer", "type": "select",
        "options": ["constant", "cosine", "constant_with_warmup"],
        "what": "Bagaimana learning rate berubah sepanjang training.",
        "up": "-", "down": "-",
        "tip": "constant paling mudah dipelajari (efek tiap checkpoint mudah dibandingkan). cosine menurunkan LR pelan-pelan ke 0 di akhir sehingga hasil akhir lebih halus.",
    },
    {
        "key": "warmup_steps", "label": "Warmup steps", "group": "Optimizer", "type": "int", "min": 0, "max": 2000,
        "what": "Jumlah step awal di mana LR naik bertahap dari 0. Hanya dipakai scheduler constant_with_warmup.",
        "up": "Awal training lebih stabil.", "down": "-",
        "tip": "50-200 jika kamu melihat loss melonjak di awal.",
    },
    # ---- Training length
    {
        "key": "steps", "label": "Total steps", "group": "Durasi", "type": "int", "min": 50, "max": 50000,
        "what": "Berapa kali bobot di-update. 1 step = 1 batch gambar.",
        "up": "LoRA makin kuat dan makin mirip dataset - sampai titik overfit (semua hasil terlihat seperti foto dataset).",
        "down": "Underfit - LoRA lemah / belum mirip.",
        "tip": "Lihat angka 'epoch' di panel ringkasan: karakter biasanya bagus di 60-120 epoch-gambar (steps x batch / jumlah gambar). Simpan banyak checkpoint lalu pilih yang terbaik.",
    },
    {
        "key": "batch_size", "label": "Batch size", "group": "Durasi", "type": "int", "min": 1, "max": 16,
        "what": "Jumlah gambar yang diproses bersamaan dalam 1 step.",
        "up": "Gradien lebih stabil, tapi VRAM naik dan 1 step 'melihat' lebih banyak gambar (kurangi steps).",
        "down": "Hemat VRAM.",
        "tip": "Biarkan 1 untuk VRAM <= 24GB. Kalau naik ke 2, kurangi steps kira-kira setengah.",
    },
    {
        "key": "grad_accum", "label": "Gradient accumulation", "group": "Durasi", "type": "int", "min": 1, "max": 16,
        "what": "Mengumpulkan gradien beberapa step sebelum update - meniru batch besar tanpa VRAM besar.",
        "up": "Seperti batch besar (lebih stabil) tapi training lebih lambat.", "down": "-",
        "tip": "Biasanya 1.",
    },
    # ---- Dataset
    {
        "key": "resolutions", "label": "Resolusi (bucket)", "group": "Dataset", "type": "multiselect",
        "options": [512, 640, 768, 1024, 1280, 1536],
        "what": "Resolusi training. Gambar dikelompokkan ke 'bucket' berdasarkan rasio aspek, lalu di-resize. Memilih beberapa resolusi = multi-resolution training.",
        "up": "Detail lebih tajam, VRAM dan waktu naik signifikan (1024 ~ 4x lebih berat dari 512).",
        "down": "Cepat & hemat, tapi detail halus hilang.",
        "tip": "Multi-resolusi [512, 768, 1024] membantu LoRA bekerja di berbagai ukuran. Jangan pilih resolusi lebih besar dari gambar dataset-mu.",
    },
    {
        "key": "num_repeats", "label": "Repeats per gambar", "group": "Dataset", "type": "int", "min": 1, "max": 100,
        "what": "Berapa kali tiap gambar muncul per epoch.",
        "up": "Berguna untuk menyeimbangkan dataset kecil vs besar (multi-dataset).", "down": "-",
        "tip": "Karena kita mengatur total steps, repeats tidak mengubah total belajar - biarkan 1 kecuali kamu menggabungkan beberapa dataset.",
    },
    {
        "key": "caption_dropout", "label": "Caption dropout", "group": "Dataset", "type": "float", "min": 0, "max": 1, "step": 0.01,
        "what": "Peluang caption dikosongkan saat training.",
        "up": "LoRA belajar 'tanpa disuruh' - efek muncul walau tidak ditulis di prompt (bagus untuk style).",
        "down": "LoRA lebih patuh pada prompt.",
        "tip": "0.05 untuk karakter/konsep, 0.1-0.2 untuk style.",
    },
    {
        "key": "shuffle_tokens", "label": "Shuffle tag", "group": "Dataset", "type": "bool",
        "what": "Mengacak urutan tag (dipisah koma) setiap kali gambar dipakai.",
        "up": "Model tidak menghafal urutan tag - bagus untuk caption berbasis tag (Anima).", "down": "-",
        "tip": "Aktifkan untuk caption tag. Matikan untuk caption kalimat. Tidak berfungsi jika text embeddings di-cache.",
    },
    {
        "key": "keep_tokens", "label": "Keep tokens", "group": "Dataset", "type": "int", "min": 0, "max": 10,
        "what": "Jumlah tag pertama yang TIDAK ikut diacak (biasanya trigger word).",
        "up": "-", "down": "-",
        "tip": "1 jika caption diawali trigger word.",
    },
    {
        "key": "flip_x", "label": "Flip horizontal", "group": "Dataset", "type": "bool",
        "what": "Menambah versi cermin dari tiap gambar.",
        "up": "Data 2x lebih banyak.", "down": "-",
        "tip": "JANGAN untuk karakter asimetris (poni satu sisi, tato, tulisan). Aman untuk style.",
    },
    {
        "key": "rgba", "label": "Training RGBA (transparan)", "group": "Dataset", "type": "bool", "only_model": "qwen_image_2", "only_backend": "ai-toolkit",
        "what": "Qwen-Image 2.1 punya VAE RGBA. Jika aktif, channel alpha gambar PNG ikut dipelajari.",
        "up": "LoRA bisa menghasilkan aset dengan background transparan.", "down": "-",
        "tip": "Aktifkan hanya jika SEMUA gambar dataset adalah PNG transparan.",
    },
    # ---- Noise / timestep
    {
        "key": "timestep_type", "label": "Timestep sampling", "group": "Lanjutan", "type": "select",
        "options": ["sigmoid", "shift", "weighted", "linear", "lognorm_blend"],
        "what": "Seberapa sering training memilih tingkat noise tinggi vs rendah. Noise tinggi = komposisi & bentuk; noise rendah = detail & tekstur.",
        "up": "-", "down": "-",
        "tip": "Gunakan default per model (Qwen 2.1: shift, Anima: weighted). Ubah hanya untuk eksperimen.",
    },
    {
        "key": "content_or_style", "only_backend": "ai-toolkit", "label": "Fokus (content / style)", "group": "Lanjutan", "type": "select",
        "options": ["balanced", "content", "style"],
        "what": "Bias pemilihan timestep di ai-toolkit: 'content' fokus bentuk/identitas, 'style' fokus tekstur/gaya.",
        "up": "-", "down": "-",
        "tip": "balanced untuk karakter/konsep, style untuk LoRA gaya.",
    },
    {
        "key": "discrete_flow_shift", "only_backend": "sd-scripts", "label": "Flow shift (sd-scripts)", "group": "Lanjutan", "type": "float", "min": 0.1, "max": 10, "step": 0.1,
        "what": "Menggeser distribusi timestep di Rectified Flow (sd-scripts, timestep_sampling=shift).",
        "up": "Lebih banyak latihan di noise tinggi (struktur).", "down": "Lebih banyak di detail.",
        "tip": "Default 1.0 untuk Anima.",
    },
    # ---- Memory
    {
        "key": "quantize", "only_backend": "ai-toolkit", "label": "Quantize model (8-bit)", "group": "Memori", "type": "bool",
        "what": "Menyimpan bobot model dasar dalam 8-bit agar muat di VRAM.",
        "up": "Hemat VRAM sangat besar.", "down": "Sedikit lebih presisi, tapi butuh VRAM jauh lebih banyak.",
        "tip": "Qwen 2.1: aktif (bobot Comfy-Org memang sudah int8). Anima (2B): tidak perlu.",
    },
    {
        "key": "low_vram", "only_backend": "ai-toolkit", "label": "Low VRAM mode", "group": "Memori", "type": "bool",
        "what": "ai-toolkit memindahkan bagian model ke CPU saat tidak dipakai.",
        "up": "Muat di GPU lebih kecil.", "down": "Lebih cepat jika VRAM cukup.",
        "tip": "Aktifkan untuk <= 24GB pada Qwen 2.1.",
    },
    {
        "key": "layer_offloading", "only_backend": "ai-toolkit", "label": "Layer offloading", "group": "Memori", "type": "bool",
        "what": "Menyimpan sebagian layer transformer di RAM dan memindahkannya ke GPU saat dibutuhkan.",
        "up": "Bisa training model besar di 12-16GB.", "down": "-",
        "tip": "Butuh RAM sistem besar (32GB+) dan training jadi lebih lambat.",
    },
    {
        "key": "cache_text_embeddings", "only_backend": "ai-toolkit", "label": "Cache text embeddings", "group": "Memori", "type": "bool",
        "what": "Menghitung output text encoder sekali di awal, lalu text encoder dibuang dari VRAM.",
        "up": "Hemat VRAM besar (Qwen3-VL-8B ~ 8-16GB).", "down": "-",
        "tip": "Konsekuensi: trigger word harus ada di caption file, shuffle tag & caption dropout jadi tetap (tidak acak per step).",
    },
    {
        "key": "gradient_checkpointing", "label": "Gradient checkpointing", "group": "Memori", "type": "bool",
        "what": "Menghitung ulang aktivasi saat backward daripada menyimpannya.",
        "up": "Hemat VRAM banyak, ~20-30% lebih lambat.", "down": "-",
        "tip": "Hampir selalu aktif.",
    },
    {
        "key": "blocks_to_swap", "only_backend": "sd-scripts", "label": "Blocks to swap (sd-scripts)", "group": "Memori", "type": "int", "min": 0, "max": 34,
        "what": "Jumlah blok transformer yang ditukar CPU<->GPU (sd-scripts).",
        "up": "VRAM turun, training melambat.", "down": "-",
        "tip": "0 jika VRAM cukup. Coba 8-16 untuk 8-10GB.",
    },
    # ---- Saving / sampling
    {
        "key": "save_every", "label": "Simpan tiap N step", "group": "Simpan & Preview", "type": "int", "min": 10, "max": 10000,
        "what": "Interval menyimpan checkpoint LoRA.",
        "up": "-", "down": "Lebih banyak pilihan checkpoint untuk dibandingkan.",
        "tip": "Simpan sering (tiap 200-250 step). Checkpoint TERAKHIR sering bukan yang TERBAIK.",
    },
    {
        "key": "max_saves", "label": "Maks checkpoint disimpan", "group": "Simpan & Preview", "type": "int", "min": 1, "max": 100,
        "what": "Checkpoint lama dihapus jika melebihi jumlah ini.",
        "up": "-", "down": "-", "tip": "Untuk belajar, simpan banyak (10+) agar bisa membandingkan.",
    },
    {
        "key": "sample_every", "label": "Preview tiap N step", "group": "Simpan & Preview", "type": "int", "min": 10, "max": 10000,
        "what": "Interval membuat gambar preview dari prompt di bawah.",
        "up": "Training lebih cepat.", "down": "Lebih mudah melihat kapan LoRA mulai bagus / mulai overfit.",
        "tip": "Samakan dengan 'simpan tiap N step' supaya tiap checkpoint punya preview.",
    },
    {
        "key": "guidance", "label": "Guidance (CFG) preview", "group": "Simpan & Preview", "type": "float", "min": 1, "max": 15, "step": 0.5,
        "what": "Seberapa kuat preview mengikuti prompt.", "up": "-", "down": "-",
        "tip": "Qwen 2.1: 3.0. Anima: 4-5.",
    },
    {
        "key": "sample_steps", "label": "Sampling steps preview", "group": "Simpan & Preview", "type": "int", "min": 1, "max": 100,
        "what": "Jumlah langkah denoising untuk gambar preview.", "up": "-", "down": "-", "tip": "25-30.",
    },
]

PARAM_INDEX = {p["key"]: p for p in PARAMS}

# ---------------------------------------------------------------------------
# Recommendation engine
# ---------------------------------------------------------------------------


def _clamp(v, lo, hi):
    return max(lo, min(hi, v))


def _round_to(v, n):
    return int(round(v / n) * n)


def default_sample_prompts(model: str, goal: str, trigger: str) -> list:
    t = trigger or "[trigger]"
    if model == "anima":
        if goal == "style":
            return [
                f"{t}, 1girl, solo, standing in a flower field, wind, looking at viewer, smile",
                f"{t}, scenery, city street at night, rain, neon lights, no humans",
                f"{t}, 1boy, sitting in a cafe, reading a book, warm lighting",
                f"{t}, cat, sleeping on a windowsill, sunlight",
            ]
        return [
            f"{t}, 1girl, solo, upper body, looking at viewer, smile, simple background",
            f"{t}, 1girl, full body, standing, school uniform, cherry blossoms, outdoors",
            f"{t}, 1girl, sitting, cafe, holding cup, from side, warm lighting",
            f"{t}, 1girl, close-up, night, city lights, wind, serious",
        ]
    if goal == "style":
        return [
            f"a woman walking her dog in a park in autumn, in the style of {t}",
            f"a cozy coffee shop interior with plants, in the style of {t}",
            f"a dragon flying over snowy mountains at sunset, in the style of {t}",
            f"a bowl of ramen on a wooden table, in the style of {t}",
        ]
    return [
        f"a portrait photo of {t}, looking at the camera, soft studio lighting",
        f"{t} standing on a busy street in Tokyo at night, full body shot",
        f"{t} sitting in a cafe holding a cup of coffee, smiling, natural light",
        f"{t} wearing a red winter jacket in the snow, close-up",
    ]


def recommend(model: str, goal: str, vram: int, num_images: int, backend: str = "ai-toolkit", trigger: str = "") -> dict:
    """Return {params, reasons, warnings} for the given situation."""
    if model not in MODELS:
        raise ValueError(f"unknown model {model}")
    goal = goal if goal in GOALS else "character"
    n = max(1, int(num_images or 1))
    spec = MODELS[model]
    sd = spec["sample_defaults"]
    reasons = []
    warnings = []

    p = {
        "batch_size": 1,
        "grad_accum": 1,
        "optimizer": "adamw8bit",
        "lr_scheduler": "constant",
        "warmup_steps": 0,
        "num_repeats": 1,
        "flip_x": False,
        "gradient_checkpointing": True,
        "guidance": sd["guidance"],
        "sample_steps": sd["steps"],
        "sample_width": sd["width"],
        "sample_height": sd["height"],
        "sample_neg": sd["neg"],
        "seed": 42,
        "rgba": False,
        "layer_offloading": False,
        "blocks_to_swap": 0,
        "discrete_flow_shift": 1.0,
        "keep_tokens": 0,
        "shuffle_tokens": False,
        "content_or_style": "style" if goal == "style" else "balanced",
    }

    if model == "qwen_image_2":
        p["rank"] = 32 if goal == "style" else 16
        p["lr"] = 1e-4
        per_img = 80 if goal == "style" else 100
        p["steps"] = _clamp(_round_to(n * per_img, 250), 1500, 4000)
        p["timestep_type"] = "shift"
        p["quantize"] = True
        p["low_vram"] = vram <= 24
        p["cache_text_embeddings"] = vram < 48
        p["layer_offloading"] = vram <= 12
        if vram <= 12:
            p["resolutions"] = [512, 768]
        elif vram < 32:
            p["resolutions"] = [512, 768, 1024]
        else:
            p["resolutions"] = [768, 1024, 1280]
        p["caption_dropout"] = 0.1 if goal == "style" else 0.05
        reasons += [
            f"Rank {p['rank']} / alpha {p['rank']}: Qwen 2.1 adalah model besar (7B) dengan banyak pengetahuan, rank kecil sudah cukup untuk {GOALS[goal]['label'].lower()}.",
            "LR 1e-4 adalah titik awal yang dipakai mayoritas LoRA Qwen-Image di ai-toolkit.",
            "Model di-load dari repack Comfy-Org yang sudah int8 (convrot8) - hemat VRAM tanpa re-quantize.",
        ]
        if p["cache_text_embeddings"]:
            reasons.append("Text encoder Qwen3-VL-8B di-cache agar VRAM cukup untuk DiT. Pastikan trigger word sudah tertulis di setiap caption.")
        if vram <= 12:
            warnings.append("12GB sangat mepet untuk Qwen-Image 2.1. Layer offloading diaktifkan (butuh RAM sistem 32GB+), resolusi dibatasi 768, dan training akan lambat.")
    else:  # anima
        p["rank"] = 32
        p["lr"] = 2e-5
        per_img = 100 if goal == "style" else 120
        p["steps"] = _clamp(_round_to(n * per_img, 250), 2000, 5000)
        p["timestep_type"] = "weighted" if backend == "ai-toolkit" else "sigmoid"
        p["quantize"] = False
        p["low_vram"] = vram <= 12
        p["cache_text_embeddings"] = False
        p["resolutions"] = [512, 768] if vram <= 12 else [512, 768, 1024]
        p["caption_dropout"] = 0.1 if goal == "style" else 0.05
        p["shuffle_tokens"] = True
        p["keep_tokens"] = 1
        p["flip_x"] = goal == "style"
        if backend == "sd-scripts" and vram <= 10:
            p["blocks_to_swap"] = 12
        reasons += [
            "LR 2e-5 dengan rank 32 / alpha 32 mengikuti saran langsung dari pembuat Anima. Anima jauh lebih sensitif dibanding SDXL.",
            "Karena LR rendah, steps dibuat lebih panjang - simpan checkpoint sering dan pilih yang terbaik.",
            "Text encoder hanya 0.6B, jadi tidak di-cache: shuffle tag + keep_tokens=1 (trigger tetap di depan) dan caption dropout tetap aktif.",
            f"Resolusi {p['resolutions']}: base Anima dilatih di 512px, 768-1024 menambah detail.",
        ]
        if goal == "style":
            reasons.append("Flip horizontal diaktifkan karena untuk style, gambar cermin tetap valid.")

    # common
    p["alpha"] = p["rank"]
    p["save_every"] = 250 if p["steps"] <= 3000 else 500
    p["sample_every"] = p["save_every"]
    p["max_saves"] = max(4, p["steps"] // p["save_every"])
    p["sample_prompts"] = default_sample_prompts(model, goal, trigger)

    epochs = p["steps"] * p["batch_size"] / n
    reasons.append(f"{p['steps']} step untuk {n} gambar = ~{epochs:.0f} kali tiap gambar dilihat. Checkpoint disimpan tiap {p['save_every']} step.")

    if n < 8:
        warnings.append(f"Dataset hanya {n} gambar. Minimal 10-15 gambar berkualitas sangat disarankan agar LoRA tidak menghafal.")
    if goal == "style" and n < 25:
        warnings.append("LoRA style idealnya 30+ gambar dengan subjek yang beragam.")

    return {"params": p, "reasons": reasons, "warnings": warnings}


def analyze(model: str, params: dict, num_images: int) -> dict:
    """Live sanity checks + derived numbers shown while the user edits parameters."""
    from .insights import estimate_vram, lr_schedule

    notes = _analyze_notes(model, params, num_images)
    n = max(1, int(num_images or 1))
    rank = float(params.get("rank") or 1)
    bs = int(params.get("batch_size") or 1) * int(params.get("grad_accum") or 1)
    vram = estimate_vram(model, params)
    if params.get("_vram") and vram["total_gb"] > float(params["_vram"]):
        notes.insert(0, {"level": "bad", "msg": f"Perkiraan VRAM ~{vram['total_gb']} GB melebihi GPU {params['_vram']} GB. Turunkan resolusi, aktifkan cache/low VRAM, atau offloading."})
    return {
        "notes": notes,
        "effective_lr": float(params.get("lr") or 0) * float(params.get("alpha") or rank) / rank,
        "exposure": int(params.get("steps") or 0) * bs / n,
        "checkpoints": int(params.get("steps") or 0) // max(1, int(params.get("save_every") or 1)),
        "vram": vram,
        "lr_schedule": lr_schedule(params, 60),
    }


def _analyze_notes(model: str, params: dict, num_images: int) -> list:
    out = []
    n = max(1, int(num_images or 1))
    lr = float(params.get("lr") or 0)
    rank = float(params.get("rank") or 1)
    alpha = float(params.get("alpha") or rank)
    steps = int(params.get("steps") or 0)
    bs = int(params.get("batch_size") or 1) * int(params.get("grad_accum") or 1)
    eff_lr = lr * (alpha / rank)
    epochs = steps * bs / n

    def add(level, msg):
        out.append({"level": level, "msg": msg})

    if params.get("optimizer", "").startswith("prodigy"):
        if lr < 0.5:
            add("warn", "Prodigy mengatur LR sendiri: set learning rate ke 1.0.")
    elif model == "anima":
        if eff_lr > 1e-4:
            add("bad", f"LR efektif {eff_lr:.1e} sangat tinggi untuk Anima (saran ~2e-5). Kemungkinan besar hasil gosong / merusak model dasar.")
        elif eff_lr > 5e-5:
            add("warn", f"LR efektif {eff_lr:.1e} cukup tinggi untuk Anima. Awasi preview dengan teliti.")
    elif model == "qwen_image_2":
        if eff_lr > 3e-4:
            add("bad", f"LR efektif {eff_lr:.1e} terlalu tinggi untuk Qwen 2.1 (saran ~1e-4).")
        elif eff_lr < 2e-5:
            add("warn", f"LR efektif {eff_lr:.1e} rendah - kemungkinan butuh step jauh lebih banyak.")

    if alpha != rank:
        add("info", f"alpha/rank = {alpha/rank:.2f}: learning rate efektif = {eff_lr:.1e}.")
    if epochs > 250:
        add("warn", f"Tiap gambar dilihat ~{epochs:.0f} kali - risiko overfit tinggi. Pastikan simpan checkpoint sering.")
    elif epochs < 30:
        add("warn", f"Tiap gambar hanya dilihat ~{epochs:.0f} kali - LoRA kemungkinan masih lemah.")
    else:
        add("ok", f"Tiap gambar dilihat ~{epochs:.0f} kali (steps x batch / gambar).")
    if rank > 64:
        add("warn", "Rank > 64 jarang dibutuhkan dan mudah overfit.")
    if params.get("cache_text_embeddings") and params.get("shuffle_tokens"):
        add("warn", "Shuffle tag tidak berfungsi saat text embeddings di-cache.")
    if params.get("cache_text_embeddings") and not params.get("_captions_have_trigger", True):
        add("bad", "Text embeddings di-cache tapi ada caption tanpa trigger word - trigger tidak akan dipelajari untuk gambar itu.")
    res = params.get("resolutions") or []
    if model == "qwen_image_2" and max(res or [0]) > 1024 and not params.get("_vram_ok_hi", True):
        add("warn", "Resolusi > 1024 butuh VRAM sangat besar.")
    if params.get("save_every") and steps and steps / int(params["save_every"]) < 3:
        add("info", "Kurang dari 3 checkpoint akan tersimpan. Untuk belajar, simpan lebih sering.")
    return out


def public_catalog() -> dict:
    from .knowledge import CONCEPTS, MISTAKES, PARAM_EXTRA, mistakes_for_param

    params = deepcopy(PARAMS)
    for p in params:
        p.update(deepcopy(PARAM_EXTRA.get(p["key"], {})))
        p["mistakes"] = sorted(set(p.get("mistakes", [])) | set(mistakes_for_param(p["key"])))
        p.setdefault("level", "menengah")
    return {
        "models": deepcopy(MODELS),
        "goals": deepcopy(GOALS),
        "vram_tiers": VRAM_TIERS,
        "params": params,
        "mistakes": deepcopy(MISTAKES),
        "concepts": deepcopy(CONCEPTS),
    }
