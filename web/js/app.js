import { api } from './api.js';
import { h, mount } from './ui.js';
import * as home from './pages/home.js';
import * as datasets from './pages/datasets.js';
import * as dataset from './pages/dataset.js';
import * as train from './pages/train.js';
import * as jobs from './pages/jobs.js';
import * as job from './pages/job.js';
import * as learn from './pages/learn.js';
import * as settings from './pages/settings.js';

const routes = [
  [/^\/$/, home, 'home'],
  [/^\/datasets$/, datasets, 'datasets'],
  [/^\/datasets\/([^/]+)$/, dataset, 'datasets'],
  [/^\/train$/, train, 'train'],
  [/^\/train\/from\/([a-f0-9]+)$/, train, 'train'],
  [/^\/jobs$/, jobs, 'jobs'],
  [/^\/jobs\/([a-f0-9]+)$/, job, 'jobs'],
  [/^\/learn$/, learn, 'learn'],
  [/^\/settings$/, settings, 'settings'],
];

let cleanup = null;
const view = document.getElementById('view');

async function route() {
  const path = (location.hash || '#/').slice(1).split('?')[0] || '/';
  const query = Object.fromEntries(new URLSearchParams((location.hash.split('?')[1]) || ''));
  if (cleanup) { try { cleanup(); } catch (_) { /* ignore */ } cleanup = null; }
  document.getElementById('popover').classList.add('hidden');
  for (const [rx, page, nav] of routes) {
    const m = path.match(rx);
    if (!m) continue;
    document.querySelectorAll('#nav a').forEach((a) => a.classList.toggle('active', a.dataset.nav === nav));
    mount(view, h('div', { class: 'muted' }, 'Memuat…'));
    try {
      cleanup = (await page.render(view, m.slice(1).map(decodeURIComponent), query)) || null;
    } catch (e) {
      mount(view, h('div', { class: 'card' }, h('h2', {}, 'Terjadi kesalahan'), h('pre', { class: 'code' }, e.message || String(e))));
    }
    window.scrollTo(0, 0);
    return;
  }
  mount(view, h('div', { class: 'empty' }, 'Halaman tidak ditemukan.'));
}

async function footer() {
  try {
    const st = await api.get('/api/status');
    const g = st.gpus[0];
    mount(document.getElementById('sidebar-foot'),
      g ? h('div', {}, `🟢 ${g.name}`, h('br'), `VRAM ${Math.round(g.mem_used_mb / 1024 * 10) / 10}/${Math.round(g.mem_total_mb / 1024)} GB · ${g.util}%`)
        : h('div', {}, '⚪ GPU NVIDIA tidak terdeteksi'));
  } catch (_) { /* server down */ }
}

window.addEventListener('hashchange', route);
route();
footer();
setInterval(footer, 10000);
