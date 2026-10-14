import { api, enc, catalog } from '../api.js';
import { h, mount, statusBadge, fmtTime, fmtDur, fmtNum, toast, errToast, confirmBox, lightbox, helpBtn } from '../ui.js';

export async function render(view, [id]) {
  const cat = await catalog();
  const base = `/api/jobs/${id}`;
  let job = await api.get(base);
  let tab = job.status === 'draft' ? 'config' : 'samples';
  let timer = null;
  let logOffset = 0;
  let logText = '';
  let disposed = false;

  const head = h('div');
  const progressEl = h('div');
  const tabsEl = h('div', { class: 'tabs' });
  const pane = h('div');
  mount(view, head, progressEl, h('div', { class: 'card', style: { marginTop: '16px' } }, tabsEl, pane));

  // ---------------------------------------------------------------- header
  function drawHead() {
    const active = job.status === 'running' || job.status === 'queued';
    mount(head, h('div', { class: 'page-head' },
      h('div', {},
        h('a', { href: '#/jobs', class: 'small' }, '← Jobs'),
        h('h1', { class: 'row' }, job.name, statusBadge(job.status)),
        h('div', { class: 'muted small' }, `${cat.models[job.model].label} · ${cat.goals[job.goal] ? cat.goals[job.goal].label : job.goal} · dataset `,
          h('a', { href: `#/datasets/${enc(job.dataset)}` }, job.dataset), ` · ${job.backend} · dibuat ${fmtTime(job.created)}`),
        job.notes ? h('div', { class: 'small', style: { marginTop: '4px' } }, '📝 ', job.notes) : null),
      h('div', { class: 'row' },
        active ? h('button', { class: 'btn danger', onclick: async () => { if (await confirmBox('Hentikan training? Checkpoint yang sudah tersimpan tetap ada.')) { job = await api.post(`${base}/stop`); refresh(); } } }, '⏹ Hentikan')
          : h('button', { class: 'btn primary', onclick: async () => { try { job = await api.post(`${base}/start`); toast('Masuk antrian'); refresh(); } catch (e) { errToast(e); } } },
            job.status === 'draft' ? '▶ Mulai' : '▶ Jalankan lagi / lanjutkan'),
        h('a', { class: 'btn', href: `#/train/from/${job.id}` }, '🔁 Iterasi (v berikutnya)'),
        !active ? h('button', {
          class: 'btn danger', onclick: async () => {
            if (!(await confirmBox('Hapus job ini? (centang di dialog berikut untuk juga menghapus checkpoint)'))) return;
            const alsoOut = await confirmBox('Hapus juga folder output (checkpoint & sample)?');
            await api.del(`${base}?outputs=${alsoOut}`);
            location.hash = '#/jobs';
          },
        }, 'Hapus') : null)));
  }

  function drawProgress() {
    const p = job.progress || {};
    const pct = 100 * (p.step || 0) / Math.max(1, p.total || 1);
    const elapsed = job.started ? ((job.finished || Date.now() / 1000) - job.started) : 0;
    const phase = { training: 'training', sampling: 'membuat preview', saving: 'menyimpan', caching: 'caching latent/teks' }[p.phase] || '';
    mount(progressEl, h('div', { class: 'card stack' },
      h('div', { class: 'progress' }, h('div', { style: { width: `${pct.toFixed(1)}%` } })),
      h('div', { class: 'grid g4' },
        h('div', { class: 'stat' }, h('b', {}, `${p.step || 0} / ${p.total || job.params.steps}`), h('span', {}, 'step')),
        h('div', { class: 'stat' }, h('b', {}, fmtNum(p.loss)), h('span', {}, 'loss terakhir')),
        h('div', { class: 'stat' }, h('b', {}, job.status === 'running' ? (p.eta || '-') : '-'), h('span', {}, 'sisa waktu (perkiraan)')),
        h('div', { class: 'stat' }, h('b', {}, fmtDur(elapsed)), h('span', {}, job.status === 'running' && phase ? `berjalan · ${phase}` : 'durasi'))),
      job.status === 'failed' ? h('div', { class: 'stack' },
        job.error_hint ? h('div', { class: 'note warn' }, '💡 ', job.error_hint) : null,
        h('pre', { class: 'code', style: { maxHeight: '200px' } }, job.error || `exit code ${job.exit_code}`)) : null,
      job.status === 'stopped' && job.error ? h('div', { class: 'note warn' }, job.error) : null));
  }

  // ---------------------------------------------------------------- tabs
  const TABS = [
    ['samples', '🖼️ Preview'],
    ['loss', '📉 Loss'],
    ['ckpt', '💾 Checkpoint'],
    ['log', '🧾 Log'],
    ['params', '🎛️ Parameter'],
    ['config', '📄 Config'],
  ];
  function drawTabs() {
    mount(tabsEl, TABS.map(([k, l]) => h('button', { class: tab === k ? 'on' : '', onclick: () => { tab = k; drawTabs(); drawPane(); } }, l)));
  }

  async function drawPane() {
    if (tab === 'samples') return drawSamples();
    if (tab === 'loss') return drawLoss();
    if (tab === 'ckpt') return drawCkpt();
    if (tab === 'log') return drawLog(true);
    if (tab === 'params') return drawParams();
    if (tab === 'config') return drawConfig();
  }

  async function drawSamples() {
    const out = await api.get(`${base}/outputs`);
    const prompts = (job.params.sample_prompts || []);
    const bySteps = {};
    out.samples.forEach((s) => { const k = s.step ?? -1; (bySteps[k] = bySteps[k] || []).push(s); });
    const steps = Object.keys(bySteps).map(Number).sort((a, b) => b - a);
    const guide = h('details', { class: 'note info' },
      h('summary', {}, 'Cara membaca preview (klik)'),
      h('ul', { style: { margin: '6px 0 0', paddingLeft: '18px' } },
        h('li', {}, 'Baris paling bawah (step 0) = model TANPA LoRA. Bandingkan untuk melihat apa yang benar-benar dipelajari.'),
        h('li', {}, 'Underfit: subjek belum mirip / gaya belum terasa → butuh step lebih banyak atau LR lebih tinggi.'),
        h('li', {}, 'Pas: subjek mirip TAPI prompt baru (baju, tempat, pose) tetap diikuti.'),
        h('li', {}, 'Overfit: semua gambar mirip foto dataset, background/pose sama terus, warna gosong/kontras berlebihan, artefak → pakai checkpoint lebih awal, atau turunkan LR / step.'),
        h('li', {}, 'Checkpoint terbaik biasanya beberapa ratus step SEBELUM tanda overfit pertama muncul.')));
    if (!steps.length) {
      mount(pane, guide, h('div', { class: 'empty' }, job.status === 'running' ? 'Preview belum ada - akan muncul setiap ' + job.params.sample_every + ' step.' : 'Belum ada preview.'));
      return;
    }
    const cols = Math.max(...steps.map((s) => bySteps[s].length));
    mount(pane, guide, h('div', { class: 'samples-table', style: { marginTop: '12px' } }, h('table', {},
      h('tr', {}, h('th', {}, 'Step'), [...Array(cols)].map((_, i) => h('th', { class: 'small', title: prompts[i] || '' }, (prompts[i] || `#${i}`).slice(0, 28) + ((prompts[i] || '').length > 28 ? '…' : '')))),
      steps.map((s) => h('tr', {}, h('th', {}, s < 0 ? '?' : s),
        bySteps[s].sort((a, b) => a.index - b.index).map((smp) => h('td', {}, h('img', {
          src: `${base}/file/${smp.file.split('/').map(enc).join('/')}`, loading: 'lazy',
          onclick: () => lightbox(`${base}/file/${smp.file.split('/').map(enc).join('/')}`, `step ${s} · ${prompts[smp.index] || ''}`),
        }))))))));
  }

  async function drawLoss() {
    const m = await api.get(`${base}/metrics`);
    const canvas = h('canvas', { class: 'chart' });
    mount(pane,
      h('div', { class: 'note info', style: { marginBottom: '10px' } },
        'Loss pada diffusion training sangat "berisik" karena tiap step memakai level noise acak. Jangan panik melihat zig-zag; perhatikan GARIS HALUS (rata-rata). Loss yang turun tidak selalu berarti hasil lebih baik — keputusan akhir tetap dari preview.'),
      m.length ? canvas : h('div', { class: 'empty' }, 'Belum ada data loss.'));
    if (m.length) requestAnimationFrame(() => drawChart(canvas, m));
  }

  async function drawCkpt() {
    const out = await api.get(`${base}/outputs`);
    mount(pane,
      h('div', { class: 'muted small', style: { marginBottom: '8px' } }, `Folder: ${out.root}`),
      out.checkpoints.length ? h('table', {},
        h('tr', {}, h('th', {}, 'File'), h('th', {}, 'Step'), h('th', {}, 'Ukuran'), h('th', {}, '')),
        out.checkpoints.map((c) => h('tr', {},
          h('td', {}, h('code', {}, c.file)), h('td', {}, c.step ?? 'final'), h('td', {}, `${c.size_mb} MB`),
          h('td', {}, h('a', { class: 'btn sm', href: `${base}/file/${enc(c.file)}?download=true` }, '⬇ Download')))))
        : h('div', { class: 'empty' }, 'Belum ada checkpoint.'),
      h('div', { class: 'note info', style: { marginTop: '12px' } },
        job.model === 'anima'
          ? 'Pakai di ComfyUI: taruh file .safetensors di models/loras lalu gunakan node LoraLoaderModelOnly dengan Anima. LoRA dari Anima-Base juga bisa dicoba di varian Aesthetic/Turbo.'
          : 'Pakai di ComfyUI: taruh file .safetensors di models/loras, lalu muat bersama Qwen-Image 2.1. Mulai dengan strength 1.0, turunkan ke 0.7-0.8 jika terlalu kuat.'));
  }

  const logEl = h('div', { class: 'log' });
  async function drawLog(reset) {
    if (reset) { logOffset = 0; logText = ''; }
    const r = await api.get(`${base}/log?offset=${logOffset}`);
    const stick = logEl.scrollTop + logEl.clientHeight >= logEl.scrollHeight - 30;
    logOffset = r.offset;
    logText = (logText + r.text).slice(-300000);
    logEl.textContent = logText || '(log kosong)';
    if (tab === 'log' && pane.firstChild !== logEl) mount(pane, logEl);
    if (stick || reset) logEl.scrollTop = logEl.scrollHeight;
  }

  function drawParams() {
    const idx = Object.fromEntries(cat.params.map((p) => [p.key, p]));
    const rows = Object.entries(job.params).filter(([k]) => idx[k] && !['sample_prompts'].includes(k));
    mount(pane, h('table', {},
      h('tr', {}, h('th', {}, 'Parameter'), h('th', {}, 'Nilai'), h('th', {}, 'Penjelasan')),
      rows.map(([k, v]) => h('tr', {},
        h('td', {}, h('span', { class: 'row' }, idx[k].label, helpBtn(idx[k]))),
        h('td', {}, h('code', {}, Array.isArray(v) ? v.join(', ') : typeof v === 'number' ? fmtNum(v) : String(v))),
        h('td', { class: 'muted small' }, idx[k].what)))));
  }

  async function drawConfig() {
    const files = await api.get(`${base}/files`);
    mount(pane,
      Object.entries(files).map(([k, v]) => h('div', { class: 'stack', style: { marginBottom: '14px' } }, h('h3', {}, k), h('pre', { class: 'code' }, v))),
      h('h3', {}, 'Perintah'), h('pre', { class: 'code' }, job.command_text || ''));
  }

  // ---------------------------------------------------------------- loop
  let lastSampleCount = -1;
  async function refresh() {
    clearTimeout(timer);
    if (disposed) return;
    try {
      job = await api.get(base);
      drawHead();
      drawProgress();
      if (tab === 'log') await drawLog(false);
      else if (tab === 'loss' && job.status === 'running') await drawLoss();
      else if (tab === 'samples' && job.status === 'running') {
        const out = await api.get(`${base}/outputs`);
        if (out.samples.length !== lastSampleCount) { lastSampleCount = out.samples.length; await drawSamples(); }
      }
    } catch (_) { /* transient */ }
    if (job.status === 'running' || job.status === 'queued') timer = setTimeout(refresh, 2500);
  }

  drawHead();
  drawProgress();
  drawTabs();
  await drawPane();
  refresh();
  return () => { disposed = true; clearTimeout(timer); };
}

function drawChart(canvas, m) {
  const dpr = window.devicePixelRatio || 1;
  const W = canvas.clientWidth, H = canvas.clientHeight;
  canvas.width = W * dpr; canvas.height = H * dpr;
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  const css = getComputedStyle(document.documentElement);
  const accent = css.getPropertyValue('--accent').trim();
  const muted = css.getPropertyValue('--muted').trim();
  const border = css.getPropertyValue('--border').trim();
  const pad = { l: 52, r: 12, t: 10, b: 24 };
  const xs = m.map((d) => d.step), ys = m.map((d) => d.loss);
  const sorted = [...ys].sort((a, b) => a - b);
  const yMin = sorted[0], yMax = sorted[Math.floor(sorted.length * 0.98)] || sorted[sorted.length - 1];
  const xMin = Math.min(...xs), xMax = Math.max(...xs, xMin + 1);
  const X = (v) => pad.l + (v - xMin) / (xMax - xMin) * (W - pad.l - pad.r);
  const Y = (v) => pad.t + (1 - (Math.min(v, yMax) - yMin) / Math.max(1e-9, yMax - yMin)) * (H - pad.t - pad.b);
  ctx.font = '11px system-ui'; ctx.fillStyle = muted; ctx.strokeStyle = border; ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const v = yMin + (yMax - yMin) * i / 4, y = Y(v);
    ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(W - pad.r, y); ctx.stroke();
    ctx.fillText(v.toFixed(3), 4, y + 4);
  }
  ctx.fillText(`step ${xMin}`, pad.l, H - 6);
  ctx.textAlign = 'right'; ctx.fillText(`step ${xMax}`, W - pad.r, H - 6); ctx.textAlign = 'left';
  // raw
  ctx.globalAlpha = 0.25; ctx.strokeStyle = accent; ctx.beginPath();
  m.forEach((d, i) => (i ? ctx.lineTo(X(d.step), Y(d.loss)) : ctx.moveTo(X(d.step), Y(d.loss))));
  ctx.stroke();
  // EMA
  ctx.globalAlpha = 1; ctx.lineWidth = 2.5; ctx.beginPath();
  let ema = ys[0];
  const a = Math.min(0.2, 10 / Math.max(10, m.length));
  m.forEach((d, i) => { ema = i ? ema * (1 - a) + d.loss * a : d.loss; i ? ctx.lineTo(X(d.step), Y(ema)) : ctx.moveTo(X(d.step), Y(ema)); });
  ctx.stroke();
}
