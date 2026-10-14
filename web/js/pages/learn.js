import { catalog } from '../api.js';
import { h, mount } from '../ui.js';

const P = (...c) => h('p', {}, ...c);
const LI = (...c) => h('li', {}, ...c);
const B = (t) => h('b', {}, t);
const C = (t) => h('code', { class: 'kbd' }, t);

export async function render(view) {
  const cat = await catalog();
  const toc = [
    ['apa', 'Apa itu LoRA?'],
    ['alur', 'Alur kerja yang baik'],
    ['dataset', 'Dataset'],
    ['caption', 'Caption & trigger word'],
    ['param', 'Parameter inti (rumus)'],
    ['baca', 'Membaca hasil: underfit vs overfit'],
    ['model', 'Resep per model'],
    ['masalah', 'Troubleshooting'],
    ['kamus', 'Kamus parameter'],
  ];

  mount(view, h('div', { class: 'learn' },
    h('h1', {}, '📚 Belajar membuat LoRA yang baik'),
    h('div', { class: 'muted' }, 'Ringkasan praktis yang fokus pada Qwen-Image 2.1 dan Anima Base. Baca sekali dari atas, lalu jadikan referensi.'),
    h('div', { class: 'card row', style: { marginTop: '16px' } }, toc.map(([id, t]) => h('a', { href: '#', class: 'badge accent', onclick: (e) => { e.preventDefault(); document.getElementById(id).scrollIntoView({ behavior: 'smooth' }); } }, t))),

    h('h2', { id: 'apa' }, '1. Apa itu LoRA?'),
    P('Model seperti Qwen-Image 2.1 punya miliaran bobot. Melatih ulang semuanya mahal dan berisiko merusak pengetahuan model. ', B('LoRA (Low-Rank Adaptation)'), ' membekukan model asli, lalu menambahkan "tambalan" kecil di tiap layer berupa dua matriks tipis A (d×r) dan B (r×d). Hanya tambalan itu yang dilatih.'),
    P('Hasilnya file kecil (puluhan–ratusan MB) yang "membelokkan" model ke arah dataset-mu: wajah karakter, gaya gambar, atau konsep baru. Saat dipakai, kekuatan belokan bisa diatur (strength 0.0–1.0+).'),
    h('div', { class: 'card' }, h('h3', {}, 'Intuisi satu kalimat'),
      P('LoRA belajar ', B('perbedaan'), ' antara apa yang model sudah bisa gambar dengan dataset-mu — dan perbedaan itu diikat ke kata-kata di caption (terutama trigger word).')),

    h('h2', { id: 'alur' }, '2. Alur kerja yang baik'),
    h('ol', {},
      LI(B('Kumpulkan dataset kecil tapi bersih'), ' (15–40 gambar untuk karakter).'),
      LI(B('Caption dengan sengaja'), ' — ini langkah yang paling sering diremehkan.'),
      LI(B('Jalankan v1 dengan parameter rekomendasi'), ' dan simpan checkpoint sering.'),
      LI(B('Evaluasi preview per checkpoint'), ', cari titik "pas" sebelum overfit.'),
      LI(B('Iterasi: ubah SATU hal'), ' (LR, steps, rank, ATAU caption), jalankan v2, bandingkan. Tulis catatan di kolom "Catatan eksperimen". Mengubah banyak hal sekaligus membuatmu tidak belajar apa-apa.')),

    h('h2', { id: 'dataset' }, '3. Dataset'),
    h('div', { class: 'grid g2' },
      h('div', { class: 'card' }, h('h3', {}, '✅ Lakukan'), h('ul', {},
        LI('Resolusi minimal 1024px di sisi pendek jika bisa (minimal 512).'),
        LI('Variasi: sudut kamera, jarak (close-up, setengah badan, full body), ekspresi, pencahayaan, background.'),
        LI('Untuk karakter: ~40% close-up wajah, ~40% setengah badan, ~20% full body.'),
        LI('Untuk style: subjek beragam (orang, hewan, benda, pemandangan) dengan gaya konsisten.'),
        LI('Crop agar subjek mengisi frame; buang watermark dan teks.'))),
      h('div', { class: 'card' }, h('h3', {}, '❌ Hindari'), h('ul', {},
        LI('Gambar blur, buram karena kompres JPEG, atau hasil upscale jelek.'),
        LI('Banyak gambar yang hampir identik (frame berurutan) — model akan menghafalnya.'),
        LI('Background yang sama di semua gambar — akan ikut "menempel" ke trigger.'),
        LI('Beberapa karakter dalam satu gambar (untuk LoRA karakter).'),
        LI('Kuantitas di atas kualitas: 25 gambar bagus > 150 gambar campur aduk.')))),

    h('h2', { id: 'caption' }, '4. Caption & trigger word'),
    h('div', { class: 'card' }, h('h3', {}, 'Aturan emas'),
      P(B('Apa yang kamu tulis di caption = hal yang bisa berubah. Apa yang TIDAK kamu tulis = diserap oleh trigger word.')),
      P('Contoh: untuk LoRA karakter berambut perak, JANGAN tulis "silver hair" kalau kamu ingin rambut perak otomatis muncul saat trigger dipakai. TULIS pakaian, pose, dan background karena itu harus bisa diganti.')),
    h('div', { class: 'grid g2', style: { marginTop: '12px' } },
      h('div', { class: 'card' }, h('h3', {}, 'Qwen-Image 2.1 — kalimat natural'),
        h('pre', { class: 'code' }, 'ak1k0, a young woman sitting on a wooden bench in a park,\nwearing a beige trench coat and a red scarf, holding a\npaper cup, soft afternoon light, shallow depth of field'),
        P(h('span', { class: 'muted small' }, 'Text encoder-nya LLM (Qwen3-VL-8B), jadi kalimat deskriptif bekerja paling baik. Karena embeddings di-cache, trigger WAJIB tertulis di file caption.'))),
      h('div', { class: 'card' }, h('h3', {}, 'Anima — tag Danbooru (+ kalimat opsional)'),
        h('pre', { class: 'code' }, 'ak1k0, 1girl, solo, sitting, bench, park, trench coat,\nred scarf, holding cup, outdoors, day, depth of field'),
        P(h('span', { class: 'muted small' }, 'Huruf kecil, spasi (bukan underscore). Trigger di depan + keep_tokens=1 agar tidak ikut diacak. Tanpa quality tag (masterpiece, score_9) di dataset LoRA.')))),
    h('div', { class: 'card', style: { marginTop: '12px' } }, h('h3', {}, 'Memilih trigger word'),
      h('ul', {},
        LI('Pakai kata langka yang tidak punya arti kuat: ', C('ak1k0'), ', ', C('zxq style'), '.'),
        LI('Hindari kata umum (', C('girl'), ', ', C('anime'), ') atau nama terkenal — model sudah punya asosiasi kuat dan akan "bertabrakan".'),
        LI('Untuk style LoRA kadang tanpa trigger + caption dropout tinggi juga bisa: gaya menempel ke semua prompt.'))),

    h('h2', { id: 'param' }, '5. Parameter inti'),
    h('div', { class: 'card stack' },
      P(B('Kekuatan update per step ≈ learning rate × (alpha / rank).'), ' Karena itu studio ini selalu menyarankan alpha = rank, sehingga kamu cukup mengatur satu angka: learning rate.'),
      P(B('Total "paparan" = steps × batch size ÷ jumlah gambar.'), ' Angka ini (ditampilkan sebagai "kali tiap gambar dilihat") lebih bermakna daripada steps saja. Karakter umumnya pas di 60–150.'),
      P(B('Rank'), ' = kapasitas. Karakter: 16–32. Style: 32–64. Rank tinggi + dataset kecil = cepat menghafal.'),
      P(B('Checkpoint'), ' — simpan setiap 200–500 step. Checkpoint terbaik hampir tidak pernah yang terakhir.')),

    h('h2', { id: 'baca' }, '6. Membaca hasil'),
    h('table', { class: 'card' },
      h('tr', {}, h('th', {}, 'Gejala di preview'), h('th', {}, 'Diagnosis'), h('th', {}, 'Tindakan')),
      [
        ['Subjek belum mirip, gaya belum terasa', 'Underfit', 'Pakai checkpoint lebih akhir, tambah steps, atau naikkan LR 1.5×'],
        ['Mirip, dan prompt baru (baju/tempat) tetap diikuti', 'Pas 👍', 'Pakai checkpoint ini'],
        ['Semua gambar mirip foto dataset, pose/background sama', 'Overfit', 'Checkpoint lebih awal; kurangi steps / LR; tambah variasi dataset'],
        ['Warna jenuh, kontras keras, artefak, wajah "meleleh"', 'LR terlalu tinggi / overcooked', 'Turunkan LR 2×; untuk Anima pastikan ~2e-5'],
        ['Objek dari dataset (tas, background) selalu muncul', 'Caption kurang lengkap', 'Tulis objek itu di caption agar tidak terikat ke trigger'],
        ['Trigger tidak berpengaruh, LoRA aktif tanpa trigger', 'Trigger tidak dipelajari', 'Pastikan trigger ada di SEMUA caption; turunkan caption dropout'],
      ].map((r) => h('tr', {}, r.map((c) => h('td', {}, c))))),

    h('h2', { id: 'model' }, '7. Resep per model'),
    h('div', { class: 'grid g2' }, Object.values(cat.models).map((m) => h('div', { class: 'card stack' },
      h('h3', {}, m.label), h('div', { class: 'muted small' }, m.license),
      h('ul', {}, m.arch.map((a) => LI(a))),
      h('h3', {}, 'Catatan training'),
      h('ul', {}, m.notes.map((a) => LI(a))),
      h('h3', {}, 'Caption'), P(m.caption_hint)))),
    h('div', { class: 'card', style: { marginTop: '12px' } },
      h('h3', {}, 'Titik awal (karakter, 20 gambar, 24GB)'),
      h('table', {},
        h('tr', {}, ['', 'Qwen-Image 2.1', 'Anima Base'].map((t) => h('th', {}, t))),
        [
          ['Rank / alpha', '16 / 16', '32 / 32'],
          ['Learning rate', '1e-4', '2e-5'],
          ['Steps', '~2000', '~2500'],
          ['Resolusi', '512, 768, 1024', '512, 768, 1024'],
          ['Timestep', 'shift', 'weighted (ai-toolkit) / sigmoid (sd-scripts)'],
          ['Quantize', 'ya (int8 convrot)', 'tidak perlu'],
          ['Cache text embeddings', 'ya', 'tidak (agar shuffle tag jalan)'],
          ['Preview CFG / steps', '3.0 / 25', '4.0 / 30'],
        ].map((r) => h('tr', {}, r.map((c) => h('td', {}, c))))),
      P(h('span', { class: 'muted small' }, 'Angka ini adalah titik awal dari dokumentasi pembuat model & trainer, bukan jaminan. Itulah gunanya iterasi.'))),

    h('h2', { id: 'masalah' }, '8. Troubleshooting'),
    h('table', { class: 'card' },
      h('tr', {}, h('th', {}, 'Masalah'), h('th', {}, 'Solusi')),
      [
        ['CUDA out of memory', 'Turunkan resolusi tertinggi; aktifkan low VRAM / layer offloading; cache text embeddings; batch 1; tutup aplikasi lain yang memakai GPU.'],
        ['Loss NaN', 'LR terlalu tinggi; untuk Anima pastikan PyTorch ≥ 2.5 dan bf16.'],
        ['Training sangat lambat', 'Layer offloading / blocks_to_swap memperlambat; kurangi resolusi; matikan preview yang terlalu sering.'],
        ['Download model gagal', 'Isi HF token di Pengaturan; cek koneksi dan ruang disk (Qwen 2.1 butuh puluhan GB).'],
        ['"Diffusers is out of date"', 'Update ai-toolkit (git pull) lalu pip install -r requirements.txt di venv-nya.'],
      ].map((r) => h('tr', {}, r.map((c) => h('td', {}, c))))),

    h('h2', { id: 'kamus' }, '9. Kamus parameter'),
    h('div', { class: 'stack' }, cat.params.map((p) => h('div', { class: 'card' },
      h('h3', {}, p.label, ' ', h('span', { class: 'badge' }, p.group), p.only_backend ? h('span', { class: 'badge' }, p.only_backend) : null),
      P(p.what),
      h('ul', { class: 'small' },
        p.up && p.up !== '-' ? LI(B('⬆ Naik: '), p.up) : null,
        p.down && p.down !== '-' ? LI(B('⬇ Turun: '), p.down) : null,
        p.tip ? LI(B('💡 '), p.tip) : null)))),
  ));
}
