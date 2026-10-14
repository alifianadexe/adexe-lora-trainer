import { api } from '../api.js';
import { h, mount, toast, errToast } from '../ui.js';

const FIELDS = [
  ['Backend: ai-toolkit (Qwen 2.1 & Anima)', [
    ['ai_toolkit_path', 'Folder ai-toolkit', 'Folder hasil git clone github.com/ostris/ai-toolkit (berisi run.py).'],
    ['ai_toolkit_python', 'Python ai-toolkit', 'Kosongkan untuk deteksi otomatis venv di folder itu (venv/ atau .venv/).'],
  ]],
  ['Backend: sd-scripts (opsional, Anima)', [
    ['sd_scripts_path', 'Folder sd-scripts', 'Folder hasil git clone github.com/kohya-ss/sd-scripts (berisi anima_train_network.py).'],
    ['sd_scripts_python', 'Python sd-scripts', 'Kosongkan untuk deteksi otomatis venv.'],
    ['anima_dit_path', 'Anima DiT (.safetensors)', 'File diffusion model Anima-Base dari circlestone-labs/Anima (split_files/diffusion_models).'],
    ['anima_qwen3_path', 'Qwen3-0.6B text encoder', 'File .safetensors atau folder HF (split_files/text_encoders).'],
    ['anima_vae_path', 'Qwen-Image VAE', 'File VAE (split_files/vae).'],
  ]],
  ['HuggingFace', [
    ['hf_token', 'HF token', 'Opsional. Dibutuhkan jika repo model gated / untuk download lebih cepat.', 'password'],
  ]],
  ['Auto-caption (model vision lokal)', [
    ['caption_api_base', 'Endpoint API (OpenAI-compatible)', 'Ollama: http://localhost:11434/v1 · LM Studio: http://localhost:1234/v1'],
    ['caption_model', 'Nama model', 'Contoh Ollama: qwen2.5vl:7b, gemma3:12b. Model JoyCaption via LM Studio juga bisa.'],
    ['caption_api_key', 'API key', 'Biasanya kosong untuk server lokal.', 'password'],
  ]],
];

export async function render(view) {
  const [s, st] = await Promise.all([api.get('/api/settings'), api.get('/api/status')]);
  const inputs = {};
  const save = async () => {
    const data = {};
    for (const [k, el] of Object.entries(inputs)) data[k] = el.value.trim();
    try { await api.put('/api/settings', data); toast('Pengaturan disimpan'); render(view); } catch (e) { errToast(e); }
  };
  mount(view,
    h('div', { class: 'page-head' }, h('div', {}, h('h1', {}, 'Pengaturan'), h('div', { class: 'muted' }, 'Lokasi backend training dan model.')),
      h('button', { class: 'btn primary', onclick: save }, 'Simpan')),
    h('div', { class: 'grid g2' },
      FIELDS.map(([title, fields]) => h('div', { class: 'card stack' }, h('h2', {}, title),
        title.includes('ai-toolkit') ? statusNote(st.backends['ai-toolkit']) : null,
        title.includes('sd-scripts') ? statusNote(st.backends['sd-scripts']) : null,
        fields.map(([k, label, hint, type]) => {
          inputs[k] = h('input', { value: s[k] || '', type: type || 'text' });
          return h('label', { class: 'field' }, h('span', {}, label), inputs[k], h('div', { class: 'muted small' }, hint));
        })))),
    h('div', { class: 'card stack', style: { marginTop: '16px' } },
      h('h2', {}, 'Instalasi cepat backend'),
      h('div', {}, 'Jalankan script ini dari folder studio untuk meng-clone dan menginstall ai-toolkit (dan sd-scripts) ke ', h('code', {}, 'backends/'), ':'),
      h('pre', { class: 'code' }, 'Linux / WSL:  bash scripts/install_backends.sh\nWindows:      scripts\\install_backends.bat'),
      h('div', { class: 'muted small' }, 'Setelah itu path di atas otomatis terdeteksi (default: backends/ai-toolkit dan backends/sd-scripts).')));
}

function statusNote(b) {
  return b.found
    ? h('div', { class: 'note ok' }, `Ditemukan · python: ${b.python}`)
    : h('div', { class: 'note warn' }, `Belum ditemukan di ${b.path || '(kosong)'}`);
}
