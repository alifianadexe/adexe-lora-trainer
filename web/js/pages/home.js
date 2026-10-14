import { api } from '../api.js';
import { h, mount, statusBadge, fmtTime } from '../ui.js';

export async function render(view) {
  const [st, jobs, ds] = await Promise.all([api.get('/api/status'), api.get('/api/jobs'), api.get('/api/datasets')]);
  const at = st.backends['ai-toolkit'];
  const sd = st.backends['sd-scripts'];
  const running = jobs.find((j) => j.status === 'running');

  const backendRow = (name, b, extra) => h('div', { class: 'row' },
    h('span', {}, b.found ? '✅' : '⚠️'), h('b', {}, name),
    h('code', { class: 'muted small' }, b.path || '(belum diatur)'), extra);

  const stepsDone = [at.found || sd.found, ds.length > 0, jobs.length > 0, jobs.some((j) => j.status === 'completed')];
  const guide = [
    ['Siapkan backend training', 'Install ai-toolkit (dan opsional sd-scripts) lalu atur path-nya.', '#/settings'],
    ['Buat dataset', 'Upload gambar dan tulis caption untuk tiap gambar.', '#/datasets'],
    ['Buat training', 'Pilih model + tujuan, studio akan merekomendasikan parameter beserta alasannya.', '#/train'],
    ['Evaluasi hasil', 'Bandingkan preview tiap checkpoint, pilih yang terbaik, catat pelajarannya.', '#/jobs'],
  ];

  mount(view,
    h('div', { class: 'page-head' }, h('div', {}, h('h1', {}, 'Dashboard'), h('div', { class: 'muted' }, 'Studio LoRA pribadi untuk Qwen-Image 2.1 & Anima Base'))),
    running ? h('a', { href: `#/jobs/${running.id}`, class: 'card', style: { display: 'block', marginBottom: '16px' } },
      h('div', { class: 'row' }, statusBadge('running'), h('b', {}, running.name), h('span', { class: 'spacer' }),
        h('span', { class: 'muted' }, `step ${running.progress.step}/${running.progress.total}`)),
      h('div', { class: 'progress', style: { marginTop: '10px' } }, h('div', { style: { width: `${(100 * running.progress.step / Math.max(1, running.progress.total)).toFixed(1)}%` } }))) : null,
    h('div', { class: 'grid g2' },
      h('div', { class: 'card' },
        h('h2', {}, 'Langkah memulai'),
        h('div', { class: 'stack' }, guide.map(([t, d, href], i) => h('a', { href, class: 'row', style: { color: 'inherit', alignItems: 'flex-start' } },
          h('span', { class: `badge ${stepsDone[i] ? 'completed' : 'accent'}` }, stepsDone[i] ? '✓' : String(i + 1)),
          h('div', {}, h('b', {}, t), h('div', { class: 'muted small' }, d)))))),
      h('div', { class: 'card stack' },
        h('h2', {}, 'Sistem'),
        backendRow('ai-toolkit', at, at.found ? h('span', { class: 'small muted' },
          `Qwen 2.1: ${at.supports_qwen_image_2 ? '✓' : '✗ (update ai-toolkit)'} · Anima: ${at.supports_anima ? '✓' : '✗'}`) : null),
        backendRow('sd-scripts', sd, h('span', { class: 'small muted' }, '(opsional, Anima)')),
        st.gpus.length ? st.gpus.map((g) => h('div', { class: 'row' }, '🎮', h('b', {}, g.name),
          h('span', { class: 'muted' }, `${Math.round(g.mem_total_mb / 1024)} GB VRAM · ${g.temp}°C`)))
          : h('div', { class: 'note warn' }, 'nvidia-smi tidak ditemukan. Training butuh GPU NVIDIA dengan CUDA.'),
        h('div', { class: 'muted small' }, `${st.host.os} · Python ${st.host.python} · disk kosong ${st.host.disk_free_gb} GB`),
        h('div', { class: 'muted small' }, `Data: ${st.host.data_dir}`))),
    h('div', { class: 'card', style: { marginTop: '16px' } },
      h('div', { class: 'row' }, h('h2', {}, 'Job terbaru'), h('span', { class: 'spacer' }), h('a', { class: 'btn primary', href: '#/train' }, '+ Training baru')),
      jobs.length ? h('table', {},
        h('tr', {}, h('th', {}, 'Nama'), h('th', {}, 'Model'), h('th', {}, 'Dataset'), h('th', {}, 'Status'), h('th', {}, 'Dibuat')),
        jobs.slice(0, 8).map((j) => h('tr', { class: 'click', onclick: () => { location.hash = `#/jobs/${j.id}`; } },
          h('td', {}, h('b', {}, j.name)), h('td', {}, j.model === 'anima' ? 'Anima' : 'Qwen 2.1'), h('td', {}, j.dataset),
          h('td', {}, statusBadge(j.status)), h('td', { class: 'muted' }, fmtTime(j.created)))))
        : h('div', { class: 'empty' }, 'Belum ada job.')),
  );
}
