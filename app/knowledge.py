"""Learning content: deeper parameter notes, common training mistakes, and core concepts.

`PARAM_EXTRA` is merged into presets.PARAMS when the catalog is served, so the
basic fields (what/up/down/tip) stay next to the recommendation engine and the
long-form teaching material lives here.
"""

# ---------------------------------------------------------------------------
# Extra per-parameter teaching material
# ---------------------------------------------------------------------------

PARAM_EXTRA = {
    "rank": {
        "level": "pemula",
        "analogy": "Rank seperti jumlah halaman buku catatan LoRA. Buku tipis memaksa LoRA mencatat inti saja; buku tebal membuatnya bisa mencatat semua detail, termasuk hal yang tidak penting (noise, background, artefak JPEG).",
        "per_model": {
            "qwen_image_2": "16 untuk karakter/konsep, 32 untuk style. Model 7B sudah sangat pintar, rank kecil cukup.",
            "anima": "32 adalah titik awal resmi pembuat model. 16 untuk konsep sederhana.",
        },
        "too_high": ["File LoRA besar (ratusan MB)", "Cepat overfit: background & pose dataset ikut menempel", "LoRA sulit dikombinasikan dengan LoRA lain"],
        "too_low": ["Wajah 'mirip-mirip tapi bukan'", "Detail kecil (aksesori, motif baju) hilang"],
        "mistakes": ["rank_too_high_small_dataset"],
        "formula": "jumlah parameter LoRA per layer = rank × (d_in + d_out)",
    },
    "alpha": {
        "level": "menengah",
        "analogy": "Alpha adalah 'volume' LoRA. Rank menentukan besar speaker, alpha menentukan seberapa keras ia diputar.",
        "per_model": {
            "qwen_image_2": "Samakan dengan rank (skala 1.0).",
            "anima": "Samakan dengan rank. Ingat: contoh di dokumentasi sd-scripts memakai alpha=1 (skala 1/rank), jadi LR di contoh itu TIDAK bisa dibandingkan langsung.",
        },
        "too_high": ["Sama seperti LR terlalu tinggi: gosong, artefak"],
        "too_low": ["LoRA terasa lemah walau steps sudah banyak"],
        "mistakes": ["alpha_lr_confusion"],
        "formula": "skala LoRA = alpha / rank  →  LR efektif ≈ lr × alpha / rank",
    },
    "lr": {
        "level": "pemula",
        "analogy": "Bayangkan menuruni bukit dalam kabut. LR adalah panjang langkahmu. Langkah kecil = lambat tapi aman; langkah besar = cepat tapi bisa melompati lembah dan jatuh ke jurang (training rusak).",
        "per_model": {
            "qwen_image_2": "~1e-4. Jika cepat gosong turunkan ke 5e-5.",
            "anima": "~2e-5 (rank 32, alpha 32). Anima sangat sensitif; 1e-4 hampir pasti merusak.",
        },
        "too_high": ["Loss melonjak atau NaN", "Warna jenuh/kontras keras", "Wajah 'meleleh', tangan rusak", "Prompt yang tidak memakai trigger ikut berubah (merusak model dasar)"],
        "too_low": ["Preview di step akhir hampir sama dengan step 0", "Loss nyaris datar dari awal"],
        "mistakes": ["lr_too_high", "lr_too_low", "sdxl_habits_on_anima"],
        "formula": "w_baru = w_lama − lr × gradien",
    },
    "optimizer": {
        "level": "menengah",
        "analogy": "Optimizer adalah 'gaya berjalan'. AdamW mengingat arah langkah sebelumnya (momentum) sehingga tidak zig-zag.",
        "per_model": {"qwen_image_2": "adamw8bit.", "anima": "adamw8bit."},
        "too_high": [], "too_low": [],
        "mistakes": ["prodigy_wrong_lr"],
    },
    "lr_scheduler": {
        "level": "menengah",
        "analogy": "constant = jalan dengan kecepatan tetap. cosine = mulai cepat lalu melambat saat mendekati tujuan, sehingga 'parkir' lebih rapi.",
        "per_model": {"qwen_image_2": "constant untuk eksperimen, cosine untuk run final.", "anima": "constant untuk eksperimen, cosine untuk run final."},
        "too_high": [], "too_low": [],
        "mistakes": ["cosine_too_short"],
    },
    "warmup_steps": {"level": "lanjut", "too_high": [], "too_low": [], "mistakes": []},
    "steps": {
        "level": "pemula",
        "analogy": "Steps adalah berapa kali kamu latihan. Kurang latihan = belum hafal; terlalu banyak = hanya bisa mengulang persis contoh soal (overfit).",
        "per_model": {
            "qwen_image_2": "1500–3000 untuk 15–30 gambar.",
            "anima": "2000–4000 karena LR rendah.",
        },
        "too_high": ["Overfit: semua hasil seperti foto dataset", "Pose dan background terkunci", "Detail 'terbakar'"],
        "too_low": ["Underfit: subjek belum mirip"],
        "mistakes": ["overtraining", "undertraining", "only_last_checkpoint"],
        "formula": "epoch ≈ steps × batch × grad_accum ÷ jumlah gambar",
    },
    "batch_size": {
        "level": "menengah",
        "analogy": "Batch = berapa soal yang dikerjakan sebelum melihat kunci jawaban. Lebih banyak soal = koreksi lebih 'rata-rata' dan stabil.",
        "per_model": {"qwen_image_2": "1 (VRAM).", "anima": "1–2. Di 24GB dengan 768px, batch 2 masih mungkin."},
        "too_high": ["Out of memory", "Tanpa menyesuaikan steps, total paparan berlipat → overfit"],
        "too_low": [],
        "mistakes": ["batch_without_steps"],
    },
    "grad_accum": {"level": "lanjut", "too_high": [], "too_low": [], "mistakes": ["batch_without_steps"]},
    "resolutions": {
        "level": "pemula",
        "analogy": "Resolusi training adalah 'kaca pembesar'. Makin besar, makin banyak detail yang terlihat — dan makin berat bebannya.",
        "per_model": {
            "qwen_image_2": "512/768/1024. Model native hingga 2048 tapi VRAM jadi masalah.",
            "anima": "Base dilatih di 512, jadi 512/768 (+1024 jika VRAM cukup).",
        },
        "too_high": ["OOM", "Training sangat lambat", "Gambar kecil di-upscale → blur dipelajari"],
        "too_low": ["Detail halus (mata, tekstur) kurang tajam"],
        "mistakes": ["upscaled_small_images"],
        "formula": "biaya komputasi ∝ (resolusi)²  — 1024px ≈ 4× 512px",
    },
    "num_repeats": {"level": "lanjut", "too_high": [], "too_low": [], "mistakes": []},
    "caption_dropout": {
        "level": "menengah",
        "per_model": {"qwen_image_2": "0.05 (karakter), 0.1 (style).", "anima": "0.05–0.1."},
        "too_high": ["Trigger word tidak penting lagi; LoRA 'bocor' ke semua prompt"],
        "too_low": [],
        "mistakes": ["lora_leaks"],
    },
    "shuffle_tokens": {"level": "menengah", "too_high": [], "too_low": [], "mistakes": ["shuffle_with_cache"]},
    "keep_tokens": {"level": "menengah", "too_high": [], "too_low": [], "mistakes": []},
    "flip_x": {"level": "pemula", "too_high": [], "too_low": [], "mistakes": ["flip_asymmetric"]},
    "rgba": {"level": "lanjut", "too_high": [], "too_low": [], "mistakes": []},
    "timestep_type": {
        "level": "lanjut",
        "analogy": "Diffusion belajar menghapus noise. Timestep tinggi = gambar hampir seluruhnya noise (belajar komposisi); rendah = hampir bersih (belajar tekstur). Sampling menentukan porsi latihan di tiap tingkat.",
        "too_high": [], "too_low": [], "mistakes": [],
    },
    "content_or_style": {"level": "lanjut", "too_high": [], "too_low": [], "mistakes": []},
    "discrete_flow_shift": {"level": "lanjut", "too_high": [], "too_low": [], "mistakes": []},
    "quantize": {
        "level": "menengah",
        "analogy": "Quantize = mengompres bobot model dari 16-bit ke 8-bit, seperti menyimpan foto sebagai JPEG berkualitas tinggi: jauh lebih kecil, nyaris tidak terlihat bedanya.",
        "too_high": [], "too_low": [], "mistakes": [],
    },
    "low_vram": {"level": "menengah", "too_high": [], "too_low": [], "mistakes": ["oom"]},
    "layer_offloading": {"level": "lanjut", "too_high": [], "too_low": [], "mistakes": ["oom"]},
    "cache_text_embeddings": {"level": "menengah", "too_high": [], "too_low": [], "mistakes": ["trigger_missing_cached", "shuffle_with_cache"]},
    "gradient_checkpointing": {"level": "menengah", "too_high": [], "too_low": [], "mistakes": ["oom"]},
    "blocks_to_swap": {"level": "lanjut", "too_high": [], "too_low": [], "mistakes": ["oom"]},
    "save_every": {"level": "pemula", "too_high": [], "too_low": [], "mistakes": ["only_last_checkpoint"]},
    "max_saves": {"level": "pemula", "too_high": [], "too_low": [], "mistakes": ["only_last_checkpoint"]},
    "sample_every": {"level": "pemula", "too_high": [], "too_low": [], "mistakes": ["bad_sample_prompts"]},
    "guidance": {"level": "menengah", "too_high": [], "too_low": [], "mistakes": []},
    "sample_steps": {"level": "pemula", "too_high": [], "too_low": [], "mistakes": []},
}

# ---------------------------------------------------------------------------
# Common mistakes: symptom -> cause -> fix
# ---------------------------------------------------------------------------

MISTAKES = [
    {
        "id": "lr_too_high", "title": "Learning rate terlalu tinggi", "category": "Parameter", "severity": "tinggi",
        "symptoms": ["Loss melonjak tiba-tiba atau menjadi NaN", "Preview gosong: warna jenuh, kontras keras, noise", "Wajah dan tangan rusak lebih cepat dari biasanya", "Prompt TANPA trigger juga ikut berubah"],
        "cause": "Setiap update terlalu besar sehingga bobot melompat melewati titik optimal dan merusak pengetahuan model dasar.",
        "fix": ["Turunkan LR 2× lalu ulangi", "Cek LR efektif = lr × alpha/rank — mungkin alpha terlalu besar", "Pakai checkpoint sebelum kerusakan mulai terlihat"],
        "params": ["lr", "alpha"],
    },
    {
        "id": "lr_too_low", "title": "Learning rate terlalu rendah", "category": "Parameter", "severity": "sedang",
        "symptoms": ["Preview step akhir nyaris sama dengan step 0", "Loss datar sepanjang training", "LoRA harus dipakai di strength > 1.5 agar terasa"],
        "cause": "Update terlalu kecil; dalam jumlah step yang ada, LoRA belum sempat bergerak cukup jauh.",
        "fix": ["Naikkan LR 1.5–2×", "Atau tambah steps", "Cek alpha tidak terlalu kecil (alpha=1 dengan rank 32 = skala 1/32!)"],
        "params": ["lr", "alpha", "steps"],
    },
    {
        "id": "sdxl_habits_on_anima", "title": "Memakai kebiasaan SDXL di Anima", "category": "Model", "severity": "tinggi",
        "symptoms": ["LR 1e-4 di Anima → hasil cepat rusak", "Gaya anime khas Anima hilang"],
        "cause": "Anima adalah DiT dengan Rectified Flow dan sangat sensitif. Pembuatnya menyarankan LR jauh lebih rendah (~2e-5 untuk rank 32).",
        "fix": ["Mulai dari LR 2e-5, rank 32, alpha 32", "Naikkan pelan-pelan (3e-5, 5e-5) hanya jika underfit"],
        "params": ["lr"],
    },
    {
        "id": "alpha_lr_confusion", "title": "Menyalin LR tanpa memperhatikan alpha", "category": "Parameter", "severity": "sedang",
        "symptoms": ["Resep orang lain 'berhasil', punyamu gosong atau tidak belajar sama sekali"],
        "cause": "LR efektif bergantung pada alpha/rank. LR 1e-4 dengan alpha=1/rank=32 setara ~3e-6 pada alpha=rank.",
        "fix": ["Selalu bandingkan LR efektif (lr × alpha/rank), bukan LR mentah", "Gunakan alpha = rank agar konsisten"],
        "params": ["alpha", "lr", "rank"],
    },
    {
        "id": "overtraining", "title": "Overtraining / overfit", "category": "Durasi", "severity": "tinggi",
        "symptoms": ["Semua hasil terlihat seperti foto di dataset", "Background, pose, atau pakaian dataset selalu muncul", "Prompt baru (misal 'di pantai') diabaikan", "Detail mulai 'terbakar' di checkpoint akhir"],
        "cause": "Model melihat tiap gambar terlalu sering sehingga menghafal gambar, bukan konsep.",
        "fix": ["Pilih checkpoint lebih awal", "Kurangi steps atau LR", "Tambah variasi dataset", "Turunkan rank"],
        "params": ["steps", "lr", "rank"],
    },
    {
        "id": "undertraining", "title": "Undertraining", "category": "Durasi", "severity": "sedang",
        "symptoms": ["Subjek belum mirip bahkan di checkpoint terakhir", "Gaya baru 'samar-samar'"],
        "cause": "Total paparan (steps × batch ÷ gambar) atau LR belum cukup.",
        "fix": ["Lanjutkan training (tekan 'Jalankan lagi' — ai-toolkit melanjutkan dari checkpoint terakhir setelah steps dinaikkan)", "Naikkan LR 1.5×"],
        "params": ["steps", "lr"],
    },
    {
        "id": "only_last_checkpoint", "title": "Hanya memakai checkpoint terakhir", "category": "Evaluasi", "severity": "sedang",
        "symptoms": ["LoRA 'kebanyakan' padahal checkpoint tengah sebenarnya bagus"],
        "cause": "Kualitas LoRA biasanya naik lalu turun. Checkpoint terakhir sering sudah melewati puncaknya.",
        "fix": ["Simpan checkpoint tiap 200–500 step", "Bandingkan grid preview dan beri nilai di tab Evaluasi"],
        "params": ["save_every", "max_saves"],
    },
    {
        "id": "rank_too_high_small_dataset", "title": "Rank besar untuk dataset kecil", "category": "Parameter", "severity": "sedang",
        "symptoms": ["Overfit sangat cepat", "Artefak JPEG atau noise dari dataset ikut dipelajari"],
        "cause": "Kapasitas berlebih membuat LoRA mampu menghafal setiap gambar.",
        "fix": ["Rank 8–16 untuk < 20 gambar", "Tambah gambar"],
        "params": ["rank"],
    },
    {
        "id": "caption_describes_identity", "title": "Caption mendeskripsikan ciri tetap subjek", "category": "Caption", "severity": "tinggi",
        "symptoms": ["Trigger word saja tidak cukup; harus menulis 'silver hair, red eyes' agar karakter muncul", "Mengganti warna rambut lewat prompt malah mudah tapi identitas lemah"],
        "cause": "Hal yang ditulis di caption dianggap variabel. Jika ciri wajib ditulis, ciri itu terikat ke kata tersebut, bukan ke trigger.",
        "fix": ["Hapus ciri tetap (warna rambut, mata, bentuk wajah) dari caption karakter", "Tulis hal yang BERUBAH: pakaian, pose, background, ekspresi"],
        "params": [],
    },
    {
        "id": "caption_missing_context", "title": "Caption terlalu minim", "category": "Caption", "severity": "sedang",
        "symptoms": ["Objek background (tas, kursi, latar sama) selalu ikut muncul", "Pakaian dataset tidak bisa diganti"],
        "cause": "Semua yang tidak disebut diserap ke trigger word.",
        "fix": ["Sebutkan pakaian, latar, dan objek lain di setiap caption", "Gunakan auto-caption lalu rapikan"],
        "params": [],
    },
    {
        "id": "trigger_missing_cached", "title": "Trigger hilang saat text embeddings di-cache", "category": "Caption", "severity": "tinggi",
        "symptoms": ["Trigger word tidak berpengaruh", "LoRA aktif walau trigger tidak ditulis"],
        "cause": "Dengan cache, ai-toolkit tidak bisa menyisipkan trigger otomatis; trigger harus ada di file caption.",
        "fix": ["Gunakan tombol 'Trigger di depan' di halaman dataset"],
        "params": ["cache_text_embeddings"],
    },
    {
        "id": "shuffle_with_cache", "title": "Shuffle tag sambil cache embeddings", "category": "Caption", "severity": "rendah",
        "symptoms": ["Tidak ada error, tapi shuffle tidak berpengaruh"],
        "cause": "Embedding dihitung sekali di awal sehingga urutan tag tetap.",
        "fix": ["Matikan cache (Anima tidak perlu) atau terima caption tetap"],
        "params": ["shuffle_tokens", "cache_text_embeddings"],
    },
    {
        "id": "lora_leaks", "title": "LoRA 'bocor' ke semua prompt", "category": "Caption", "severity": "sedang",
        "symptoms": ["Gaya/karakter muncul walau trigger tidak ditulis"],
        "cause": "Caption dropout tinggi, trigger tidak konsisten, atau overtraining.",
        "fix": ["Turunkan caption dropout", "Pastikan semua caption memuat trigger", "Pakai checkpoint lebih awal"],
        "params": ["caption_dropout"],
    },
    {
        "id": "upscaled_small_images", "title": "Gambar kecil di-upscale", "category": "Dataset", "severity": "sedang",
        "symptoms": ["Hasil LoRA blur atau 'lembek'"],
        "cause": "Gambar 400px yang diperbesar ke bucket 1024 mengajari model bahwa blur itu normal.",
        "fix": ["Buang gambar < 512px atau upscale dengan upscaler AI yang bagus", "Batasi resolusi training sesuai dataset"],
        "params": ["resolutions"],
    },
    {
        "id": "low_variety", "title": "Dataset kurang variasi", "category": "Dataset", "severity": "tinggi",
        "symptoms": ["Selalu menghadap depan", "Ekspresi atau pencahayaan sama", "Sulit membuat sudut kamera lain"],
        "cause": "LoRA hanya mempelajari apa yang ia lihat.",
        "fix": ["Tambah sudut, jarak, ekspresi, dan pencahayaan berbeda", "Hapus gambar yang hampir identik"],
        "params": [],
    },
    {
        "id": "flip_asymmetric", "title": "Flip untuk karakter asimetris", "category": "Dataset", "severity": "rendah",
        "symptoms": ["Poni, tato, atau tulisan muncul di sisi yang salah/berganti-ganti"],
        "cause": "Flip horizontal membuat versi cermin yang tidak pernah ada.",
        "fix": ["Matikan flip untuk karakter"],
        "params": ["flip_x"],
    },
    {
        "id": "batch_without_steps", "title": "Menaikkan batch tanpa menyesuaikan steps", "category": "Parameter", "severity": "sedang",
        "symptoms": ["Run baru overfit padahal 'hanya' menaikkan batch"],
        "cause": "Batch 2 dengan steps sama = tiap gambar dilihat 2× lebih sering.",
        "fix": ["Bagi steps dengan faktor kenaikan batch"],
        "params": ["batch_size", "steps"],
    },
    {
        "id": "prodigy_wrong_lr", "title": "Prodigy dengan LR biasa", "category": "Parameter", "severity": "sedang",
        "symptoms": ["Training dengan Prodigy tidak belajar"],
        "cause": "Prodigy mengestimasi LR sendiri; nilai lr adalah pengali (biasanya 1.0).",
        "fix": ["Set lr = 1.0 saat memakai Prodigy"],
        "params": ["optimizer", "lr"],
    },
    {
        "id": "cosine_too_short", "title": "Cosine dengan steps terlalu sedikit", "category": "Parameter", "severity": "rendah",
        "symptoms": ["Checkpoint akhir hampir sama dengan checkpoint tengah"],
        "cause": "LR sudah mendekati 0 di bagian akhir sehingga sisa steps hampir tidak berguna.",
        "fix": ["Gunakan constant saat bereksperimen"],
        "params": ["lr_scheduler"],
    },
    {
        "id": "bad_sample_prompts", "title": "Prompt preview tidak menguji apa-apa", "category": "Evaluasi", "severity": "sedang",
        "symptoms": ["Preview selalu bagus tapi LoRA jelek saat dipakai"],
        "cause": "Prompt preview terlalu mirip dataset sehingga overfit tidak terlihat.",
        "fix": ["Sertakan prompt dengan pakaian, tempat, dan pose yang TIDAK ada di dataset", "Tambahkan 1 prompt tanpa trigger untuk mendeteksi kebocoran"],
        "params": ["sample_every"],
    },
    {
        "id": "oom", "title": "CUDA out of memory", "category": "Hardware", "severity": "tinggi",
        "symptoms": ["Training berhenti dengan 'CUDA out of memory'"],
        "cause": "Kombinasi model, resolusi, dan batch melebihi VRAM.",
        "fix": ["Turunkan resolusi tertinggi", "Batch 1", "Aktifkan gradient checkpointing, low VRAM, cache text embeddings", "Layer offloading / blocks to swap", "Tutup aplikasi lain yang memakai GPU"],
        "params": ["resolutions", "batch_size", "low_vram", "layer_offloading", "blocks_to_swap"],
    },
    {
        "id": "nan_loss", "title": "Loss NaN", "category": "Hardware", "severity": "tinggi",
        "symptoms": ["Loss menjadi nan / inf", "Preview hitam atau noise"],
        "cause": "LR terlalu tinggi, presisi fp16 di model yang butuh bf16, atau PyTorch lama (Anima butuh ≥ 2.5).",
        "fix": ["Turunkan LR", "Pastikan bf16", "Update PyTorch"],
        "params": ["lr"],
    },
]

MISTAKE_INDEX = {m["id"]: m for m in MISTAKES}

# ---------------------------------------------------------------------------
# Core concepts (glossary)
# ---------------------------------------------------------------------------

CONCEPTS = [
    {"id": "lora", "term": "LoRA", "short": "Adapter kecil yang ditempel ke model beku.",
     "body": "Low-Rank Adaptation menambahkan dua matriks kecil A (d×r) dan B (r×d) di samping bobot asli W. Output layer menjadi W·x + (alpha/r)·B·A·x. Hanya A dan B yang dilatih, sehingga file kecil dan model asli tetap utuh."},
    {"id": "loss", "term": "Loss", "short": "Seberapa salah tebakan noise model di satu step.",
     "body": "Pada flow-matching, model menebak arah dari gambar bernoise menuju gambar asli. Loss = rata-rata kuadrat selisih tebakan dengan jawaban (MSE). Karena tiap step memakai tingkat noise acak, loss sangat berisik — yang penting adalah tren rata-ratanya, dan bahkan tren itu tidak menjamin kualitas visual."},
    {"id": "step_epoch", "term": "Step vs Epoch", "short": "Step = 1 update; epoch = seluruh dataset dilihat sekali.",
     "body": "Dengan 20 gambar dan batch 1, satu epoch = 20 step. 2000 step = 100 epoch. Angka 'berapa kali tiap gambar dilihat' membantu membandingkan run dengan ukuran dataset berbeda."},
    {"id": "overfit", "term": "Overfitting", "short": "Model menghafal contoh, bukan konsep.",
     "body": "Tanda utamanya: hasil kehilangan fleksibilitas. Karakter hanya muncul dengan pose/baju/latar dataset. Loss yang terus turun justru bisa berarti model makin hafal. Gunakan checkpoint sebelum fleksibilitas hilang."},
    {"id": "underfit", "term": "Underfitting", "short": "Model belum cukup belajar.",
     "body": "Identitas atau gaya belum muncul. Solusi: lebih banyak step, LR sedikit lebih tinggi, atau caption yang lebih jelas memisahkan konsep."},
    {"id": "trigger", "term": "Trigger word", "short": "Kata 'kunci' yang memanggil LoRA.",
     "body": "Kata langka yang selalu muncul di caption. Karena ia hadir di setiap gambar, semua yang konsisten tetapi tidak dideskripsikan di caption akan terikat ke kata ini."},
    {"id": "timestep", "term": "Timestep / noise level", "short": "Seberapa banyak noise pada gambar latihan.",
     "body": "t≈1 hampir murni noise (belajar komposisi & bentuk global), t≈0 hampir bersih (belajar tekstur & detail). Distribusi timestep sampling menentukan fokus latihan."},
    {"id": "flow", "term": "Flow matching / Rectified Flow", "short": "Cara training model modern seperti Qwen-Image dan Anima.",
     "body": "Alih-alih memprediksi noise (DDPM), model mempelajari 'kecepatan' garis lurus dari noise ke gambar. Itulah kenapa sampler-nya 'flowmatch' dan ada parameter shift."},
    {"id": "latent", "term": "Latent & VAE", "short": "Gambar dikompres sebelum dilatih.",
     "body": "VAE mengubah gambar 1024×1024 menjadi latent kecil (Anima: 128×128×16, Qwen 2.1: 64×64×64). Training terjadi di ruang latent. 'Cache latents' menyimpan hasil kompresi ini agar tidak dihitung ulang."},
    {"id": "te", "term": "Text encoder", "short": "Mengubah caption menjadi vektor yang dipahami model.",
     "body": "Qwen 2.1 memakai Qwen3-VL-8B (besar, sehingga outputnya biasanya di-cache). Anima memakai Qwen3-0.6B + LLM adapter. LoRA di studio ini hanya melatih model gambar, text encoder dibekukan."},
    {"id": "bucket", "term": "Bucketing", "short": "Mengelompokkan gambar berdasarkan rasio aspek.",
     "body": "Agar gambar potret dan lanskap tidak di-crop paksa ke persegi, trainer membuat beberapa 'ember' resolusi (misal 832×1216) dan memasukkan gambar ke ember yang paling cocok."},
    {"id": "quant", "term": "Quantization", "short": "Menyimpan bobot dalam presisi lebih rendah.",
     "body": "8-bit memotong VRAM model hampir setengah dari bf16. Bobot LoRA sendiri tetap dilatih di presisi penuh."},
    {"id": "checkpoint", "term": "Checkpoint", "short": "Snapshot LoRA di step tertentu.",
     "body": "Simpan sering, lalu pilih berdasarkan preview, bukan berdasarkan angka loss."},
    {"id": "cfg", "term": "CFG / guidance", "short": "Seberapa kuat gambar mengikuti prompt saat sampling.",
     "body": "Hanya mempengaruhi preview (inference), bukan training. Gunakan nilai yang sama antar run agar preview bisa dibandingkan."},
]


def mistakes_for_param(key: str) -> list:
    return [m["id"] for m in MISTAKES if key in m.get("params", [])]
