import { api, enc, catalog } from '../api.js';
import { h, mount, helpBtn, notes, errToast, toast, fmtNum } from '../ui.js';

const SD_TIMESTEPS = ['sigmoid', 'shift', 'flux_shift', 'uniform', 'sigma'];
const STEP_NAMES = ['Model', 'Tujuan & Dataset', 'Parameter', 'Review'];

export async function render(view, routeArgs, query) {
  const cat = await catalog();
  const [dsList, status] = await Promise.all([api.get('/api/datasets'), api.get('/api/status')]);
  const gpuGb = status.gpus[0] ? Math.round(status.gpus[0].mem_total_mb / 1024) : 24;
  const nearestTier = cat.vram_tiers.reduce((best, t) => (t <= gpuGb + 1 ? t : best), cat.vram_tiers[0]);

  const st = {
    step: 0,
    model: null,
    goal: 'character',
    dataset: query.dataset || (dsList[0] && dsList[0].name) || '',
    trigger: '',
    vram: nearestTier,
    backend: 'ai-toolkit',
    name: '',
    params: null,
    rec: null,
    analysis: [],
    dsInfo: null,
    showAll: false,
  };

  // clone an existing job ("iterate on v1")
  const fromId = routeArgs && routeArgs[0];
  if (fromId) {
    const src = await api.get(`/api/jobs/${fromId}`);
    Object.assign(st, {
      model: src.model, goal: src.goal, dataset: src.dataset, trigger: src.trigger_word, vram: src.vram,
      backend: src.backend, params: structuredClone(src.params), name: bumpName(src.name), step: 2,
    });
    await loadDataset();
    st.rec = await api.post('/api/recommend', recReq());
  } else if (st.dataset) {
    await loadDataset();
  }

  function bumpName(n) {
    const m = n.match(/^(.*?)(?:_v(\d+))?$/);
    return `${m[1]}_v${(Number(m[2]) || 1) + 1}`;
  }

  async function loadDataset() {
    if (!st.dataset) { st.dsInfo = null; return; }
    try {
      st.dsInfo = await api.get(`/api/datasets/${enc(st.dataset)}`);
      if (!st.trigger) st.trigger = st.dsInfo.trigger_word || '';
    } catch (_) { st.dsInfo = null; }
  }

  function recReq() {
    return { model: st.model, goal: st.goal, vram: st.vram, num_images: st.dsInfo ? st.dsInfo.count : 20, backend: st.backend, trigger: st.trigger };
  }

  async function applyRecommendation() {
    st.rec = await api.post('/api/recommend', recReq());
    st.params = structuredClone(st.rec.params);
    if (!st.name) st.name = `${(st.dataset || 'lora').toLowerCase()}_${st.model === 'anima' ? 'anima' : 'qwen21'}_v1`;
  }

  let analyzeTimer = null;
  function scheduleAnalyze(target) {
    clearTimeout(analyzeTimer);
    analyzeTimer = setTimeout(async () => {
      const p = { ...st.params, _captions_have_trigger: st.dsInfo ? st.dsInfo.stats.captions_have_trigger : true };
      st.analysis = await api.post('/api/analyze', { model: st.model, params: p, num_images: st.dsInfo ? st.dsInfo.count : 20 });
      if (target) mount(target, notes(st.analysis));
    }, 250);
  }

  // ---------------------------------------------------------------- step 0: model
  function stepModel() {
    return h('div', { class: 'stack' },
      h('div', { class: 'choice-grid', style: { gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))' } },
        Object.values(cat.models).map((m) => h('div', {
          class: `choice ${st.model === m.id ? 'on' : ''}`,
          onclick: () => { st.model = m.id; if (!m.backends.includes(st.backend)) st.backend = m.backends[0]; st.params = null; draw(); },
        },
        h('h3', {}, m.label), h('div', { class: 'muted small' }, `${m.vendor} · ${m.license}`),
        h('ul', {}, m.arch.map((a) => h('li', {}, a)))))),
      st.model ? h('div', { class: 'card stack' }, h('h3', {}, `Hal penting tentang ${cat.models[st.model].label}`),
        h('ul', { style: { margin: 0, paddingLeft: '18px' } }, cat.models[st.model].notes.map((n) => h('li', {}, n)))) : null,
      nav(st.model ? () => { st.step = 1; draw(); } : null));
  }

  // ---------------------------------------------------------------- step 1: goal + dataset
  function stepGoal() {
    const m = cat.models[st.model];
    const dsSel = h('select', {}, h('option', { value: '' }, '— pilih dataset —'), dsList.map((d) => h('option', { value: d.name }, `${d.name} (${d.count} gambar)`)));
    dsSel.value = st.dataset;
    dsSel.addEventListener('change', async () => { st.dataset = dsSel.value; st.trigger = ''; await loadDataset(); st.params = null; draw(); });
    const trig = h('input', { value: st.trigger, placeholder: 'kata unik, misal ak1k0' });
    trig.addEventListener('input', () => { st.trigger = trig.value.trim(); st.params = null; });
    const vram = h('select', {}, cat.vram_tiers.map((v) => h('option', { value: v }, v === 48 ? '48 GB+' : `${v} GB`)));
    vram.value = st.vram;
    vram.addEventListener('change', () => { st.vram = Number(vram.value); st.params = null; });
    const be = h('select', {}, m.backends.map((b) => h('option', { value: b }, b === 'ai-toolkit' ? 'ai-toolkit (ostris)' : 'sd-scripts (kohya)')));
    be.value = st.backend;
    be.addEventListener('change', () => { st.backend = be.value; st.params = null; });
    const ds = st.dsInfo;
    const styleMismatch = ds && ((m.caption_style === 'tags') !== (ds.caption_style === 'tags'));

    return h('div', { class: 'stack' },
      h('h2', {}, 'Apa yang ingin diajarkan?'),
      h('div', { class: 'choice-grid' }, Object.entries(cat.goals).map(([k, g]) => h('div', {
        class: `choice ${st.goal === k ? 'on' : ''}`, onclick: () => { st.goal = k; st.params = null; draw(); },
      }, h('h3', {}, g.label), h('div', { class: 'small' }, g.desc), h('div', { class: 'muted small', style: { marginTop: '6px' } }, '📁 ', g.dataset)))),
      h('div', { class: 'card grid g2' },
        h('label', { class: 'field' }, h('span', {}, 'Dataset'), dsSel,
          !dsList.length ? h('div', { class: 'small' }, 'Belum ada dataset. ', h('a', { href: '#/datasets' }, 'Buat dulu →')) : null),
        h('label', { class: 'field' }, h('span', {}, 'Trigger word'), trig),
        h('label', { class: 'field' }, h('span', {}, 'VRAM GPU'), vram,
          h('div', { class: 'muted small' }, status.gpus[0] ? `Terdeteksi: ${status.gpus[0].name} (${gpuGb} GB)` : 'GPU tidak terdeteksi - pilih manual.')),
        h('label', { class: 'field' }, h('span', {}, 'Backend training'), be,
          h('div', { class: 'muted small' }, m.backends.length > 1 ? 'ai-toolkit lebih praktis (download model otomatis). sd-scripts adalah implementasi resmi yang direkomendasikan pembuat Anima, model harus diunduh manual (atur path di Pengaturan).' : 'Qwen-Image 2.1 dilatih lewat ai-toolkit.'))),
      ds ? h('div', { class: 'stack' },
        notes(ds.stats.warnings),
        styleMismatch ? h('div', { class: 'note warn' }, `Dataset memakai caption "${ds.caption_style}", sedangkan ${m.label} paling cocok dengan ${m.caption_style === 'tags' ? 'tag Danbooru' : 'kalimat natural'}. Masih bisa jalan, tapi pertimbangkan menyesuaikan caption.`) : null) : null,
      nav(st.dataset ? async () => { if (!st.params) await applyRecommendation(); st.step = 2; draw(); } : null, () => { st.step = 0; draw(); }));
  }

  // ---------------------------------------------------------------- step 2: params
  function paramVisible(p) {
    if (p.only_backend && p.only_backend !== st.backend) return false;
    if (p.only_model && p.only_model !== st.model) return false;
    return true;
  }

  function field(p, analysisEl) {
    const rec = st.rec ? st.rec.params[p.key] : undefined;
    const cur = st.params[p.key];
    const isChanged = rec !== undefined && JSON.stringify(rec) !== JSON.stringify(cur);
    const wrap = h('label', { class: `field ${isChanged ? 'changed' : ''}`, style: { paddingLeft: isChanged ? '8px' : '0' } });
    const set = (v) => {
      st.params[p.key] = v;
      const ch = rec !== undefined && JSON.stringify(rec) !== JSON.stringify(v);
      wrap.classList.toggle('changed', ch);
      wrap.style.paddingLeft = ch ? '8px' : '0';
      updateSummary();
      scheduleAnalyze(analysisEl);
    };
    let input;
    if (p.type === 'bool') {
      input = h('input', { type: 'checkbox' });
      input.checked = !!cur;
      input.addEventListener('change', () => set(input.checked));
      return mount(wrap, h('span', {}, h('label', { class: 'check' }, input, p.label), helpBtn(p),
        isChanged ? h('span', { class: 'muted small' }, `(saran: ${rec ? 'on' : 'off'})`) : null));
    }
    if (p.type === 'select') {
      const opts = p.key === 'timestep_type' && st.backend === 'sd-scripts' ? SD_TIMESTEPS : p.options;
      input = h('select', {}, opts.map((o) => h('option', { value: o }, o)));
      input.value = cur;
      input.addEventListener('change', () => set(input.value));
    } else if (p.type === 'multiselect') {
      input = h('div', { class: 'ms' }, p.options.map((o) => {
        const cb = h('input', { type: 'checkbox' });
        cb.checked = (cur || []).includes(o);
        const lab = h('label', { class: cb.checked ? 'on' : '' }, cb, String(o));
        cb.addEventListener('change', () => {
          lab.classList.toggle('on', cb.checked);
          const v = new Set(st.params[p.key] || []);
          cb.checked ? v.add(o) : v.delete(o);
          set([...v].sort((a, b) => a - b));
        });
        return lab;
      }));
    } else {
      input = h('input', { type: 'number', min: p.min, max: p.max, step: p.step || (p.type === 'int' ? 1 : 'any'), value: cur });
      input.addEventListener('input', () => { const v = p.type === 'int' ? parseInt(input.value, 10) : parseFloat(input.value); if (!Number.isNaN(v)) set(v); });
    }
    return mount(wrap,
      h('span', {}, p.label, helpBtn(p),
        p.key === 'lr' ? h('span', { class: 'muted small' }, `= ${fmtNum(cur)}`) : null,
        isChanged ? h('a', { href: '#', class: 'small', title: 'kembalikan ke saran', onclick: (e) => { e.preventDefault(); st.params[p.key] = structuredClone(rec); draw(); } }, `↺ saran: ${Array.isArray(rec) ? rec.join(', ') : fmtNum(rec)}`) : null),
      input);
  }

  let summaryEl = null;
  function updateSummary() {
    if (!summaryEl) return;
    const p = st.params;
    const n = st.dsInfo ? st.dsInfo.count : 0;
    const epochs = n ? (p.steps * p.batch_size * p.grad_accum / n) : 0;
    const ckpts = Math.floor(p.steps / Math.max(1, p.save_every));
    mount(summaryEl,
      h('div', { class: 'grid g2' },
        h('div', { class: 'stat' }, h('b', {}, p.steps), h('span', {}, 'total step')),
        h('div', { class: 'stat' }, h('b', {}, epochs.toFixed(0)), h('span', {}, 'kali tiap gambar dilihat')),
        h('div', { class: 'stat' }, h('b', {}, fmtNum(p.lr * (p.alpha / p.rank))), h('span', {}, 'LR efektif (lr × α/r)')),
        h('div', { class: 'stat' }, h('b', {}, ckpts), h('span', {}, 'checkpoint tersimpan'))));
  }

  function stepParams() {
    const analysisEl = h('div');
    summaryEl = h('div');
    const groups = {};
    cat.params.filter(paramVisible).forEach((p) => { (groups[p.group] = groups[p.group] || []).push(p); });
    const basic = ['Network', 'Optimizer', 'Durasi', 'Dataset'];
    const nameIn = h('input', { value: st.name });
    nameIn.addEventListener('input', () => { st.name = nameIn.value.trim(); });
    const prompts = h('textarea', { rows: 6 });
    prompts.value = (st.params.sample_prompts || []).join('\n');
    prompts.addEventListener('input', () => { st.params.sample_prompts = prompts.value.split('\n').map((s) => s.trim()).filter(Boolean); });
    const neg = h('textarea', { rows: 2 });
    neg.value = st.params.sample_neg || '';
    neg.addEventListener('input', () => { st.params.sample_neg = neg.value; });

    const out = h('div', { class: 'split' },
      h('div', { class: 'stack' },
        h('div', { class: 'card stack' },
          h('div', { class: 'row' }, h('h2', { style: { margin: 0 } }, '💡 Kenapa nilai-nilai ini?'), h('span', { class: 'spacer' }),
            h('button', { class: 'btn sm', onclick: async () => { await applyRecommendation(); draw(); toast('Parameter dikembalikan ke rekomendasi'); } }, '↺ Reset ke rekomendasi')),
          h('ul', { style: { margin: 0, paddingLeft: '18px' } }, st.rec.reasons.map((r) => h('li', {}, r))),
          st.rec.warnings.length ? notes(st.rec.warnings.map((w) => ({ level: 'warn', msg: w }))) : null,
          h('div', { class: 'muted small' }, 'Klik tombol ? di setiap parameter untuk penjelasan. Garis kuning di kiri = nilai yang kamu ubah dari rekomendasi.')),
        h('label', { class: 'field card' }, h('span', {}, 'Nama job / file LoRA'), nameIn),
        h('div', { class: 'param-groups' },
          Object.entries(groups).filter(([g]) => st.showAll || basic.includes(g)).map(([g, ps]) => h('div', { class: 'card param-group' },
            h('h3', {}, g), h('div', { class: 'fields' }, ps.map((p) => field(p, analysisEl)))))),
        h('button', { class: 'btn', onclick: () => { st.showAll = !st.showAll; draw(); } }, st.showAll ? '▲ Sembunyikan parameter lanjutan' : '▼ Tampilkan parameter lanjutan (memori, timestep, preview)'),
        h('div', { class: 'card stack' },
          h('h3', {}, 'Prompt preview (satu per baris)'),
          h('div', { class: 'muted small' }, 'Gambar preview dibuat dari prompt ini setiap beberapa step - inilah cara kamu "melihat" LoRA belajar. Pakai skenario yang TIDAK ada di dataset untuk menguji fleksibilitas. [trigger] akan diganti trigger word.'),
          prompts,
          h('label', { class: 'field' }, h('span', {}, 'Negative prompt preview'), neg)),
        nav(() => { st.step = 3; draw(); }, () => { st.step = 1; draw(); }, 'Review →')),
      h('div', { class: 'stack sticky-summary' },
        h('div', { class: 'card stack' }, h('h3', {}, 'Ringkasan'), summaryEl,
          h('div', { class: 'muted small' }, `${cat.models[st.model].label} · ${cat.goals[st.goal].label} · ${st.vram} GB · ${st.backend}`)),
        h('div', { class: 'card stack' }, h('h3', {}, 'Analisis langsung'), analysisEl)));
    updateSummary();
    scheduleAnalyze(analysisEl);
    return out;
  }

  // ---------------------------------------------------------------- step 3: review
  function stepReview() {
    const filesEl = h('div', { class: 'muted' }, 'Membuat konfigurasi…');
    const notesIn = h('textarea', { rows: 3, placeholder: 'Catatan eksperimen: apa yang ingin kamu uji di run ini? (misal: "coba LR 3e-5 karena v1 masih kurang mirip")' });
    api.post('/api/preview-config', { name: st.name, model: st.model, backend: st.backend, dataset: st.dataset, trigger_word: st.trigger, params: st.params })
      .then((r) => {
        const tabs = h('div', { class: 'tabs' });
        const pane = h('div');
        const entries = [...Object.entries(r.files), ['command', r.command]];
        const show = (i) => { [...tabs.children].forEach((b, j) => b.classList.toggle('on', i === j)); mount(pane, h('pre', { class: 'code' }, entries[i][1])); };
        entries.forEach(([k], i) => tabs.append(h('button', { onclick: () => show(i) }, k)));
        mount(filesEl, tabs, pane);
        show(0);
      })
      .catch((e) => mount(filesEl, h('div', { class: 'note bad' }, e.message)));

    const create = async (start) => {
      try {
        const job = await api.post('/api/jobs', { name: st.name, model: st.model, backend: st.backend, dataset: st.dataset, trigger_word: st.trigger, goal: st.goal, vram: st.vram, params: st.params, notes: notesIn.value, start });
        toast(start ? 'Training dimasukkan ke antrian' : 'Job disimpan sebagai draft');
        location.hash = `#/jobs/${job.id}`;
      } catch (e) { errToast(e); }
    };
    const be = status.backends[st.backend];
    return h('div', { class: 'stack' },
      notes(st.analysis),
      !be.found ? h('div', { class: 'note bad' }, `Backend ${st.backend} belum ditemukan. Kamu tetap bisa menyimpan job, tapi atur path di `, h('a', { href: '#/settings' }, 'Pengaturan'), ' sebelum menjalankan.') : null,
      h('div', { class: 'card stack' }, h('h3', {}, 'Konfigurasi yang akan dijalankan'),
        h('div', { class: 'muted small' }, 'Ini file asli yang dikirim ke trainer. Membacanya adalah cara bagus untuk belajar format ai-toolkit / sd-scripts.'),
        filesEl),
      h('label', { class: 'field card' }, h('span', {}, 'Catatan eksperimen'), notesIn),
      h('div', { class: 'row' },
        h('button', { class: 'btn', onclick: () => { st.step = 2; draw(); } }, '← Kembali'),
        h('span', { class: 'spacer' }),
        h('button', { class: 'btn', onclick: () => create(false) }, 'Simpan sebagai draft'),
        h('button', { class: 'btn primary', onclick: () => create(true), disabled: !be.found }, '🚀 Mulai training')));
  }

  function nav(next, back, nextLabel = 'Lanjut →') {
    return h('div', { class: 'row', style: { marginTop: '8px' } },
      back ? h('button', { class: 'btn', onclick: back }, '← Kembali') : null,
      h('span', { class: 'spacer' }),
      h('button', { class: 'btn primary', disabled: !next, onclick: next || undefined }, nextLabel));
  }

  function draw() {
    const steps = h('div', { class: 'steps' }, STEP_NAMES.map((s, i) => h('span', { class: `s ${i === st.step ? 'on' : i < st.step ? 'done' : ''}` }, `${i + 1}. ${s}`)));
    const body = [stepModel, stepGoal, stepParams, stepReview][st.step]();
    mount(view,
      h('div', { class: 'page-head' }, h('div', {}, h('h1', {}, fromId ? 'Iterasi training' : 'Training baru'),
        h('div', { class: 'muted' }, fromId ? 'Parameter disalin dari job sebelumnya - ubah SATU hal saja agar kamu tahu efeknya.' : 'Pilih model dan tujuan; studio akan menyarankan parameter beserta alasannya.'))),
      steps, body);
  }

  draw();
  return () => clearTimeout(analyzeTimer);
}
