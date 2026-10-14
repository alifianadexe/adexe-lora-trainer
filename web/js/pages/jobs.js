import { api } from '../api.js';
import { h, mount, statusBadge, fmtTime, fmtNum } from '../ui.js';

export async function render(view) {
  let timer = null;
  async function draw() {
    const jobs = await api.get('/api/jobs');
    mount(view,
      h('div', { class: 'page-head' }, h('div', {}, h('h1', {}, 'Jobs'), h('div', { class: 'muted' }, 'Semua eksperimen training-mu. Satu job berjalan dalam satu waktu; sisanya antri.')),
        h('a', { class: 'btn primary', href: '#/train' }, '+ Training baru')),
      h('div', { class: 'card' }, jobs.length ? h('table', {},
        h('tr', {}, ['Nama', 'Model', 'Dataset', 'Rank', 'LR', 'Steps', 'Progress', 'Status', 'Dibuat'].map((t) => h('th', {}, t))),
        jobs.map((j) => h('tr', { class: 'click', onclick: () => { location.hash = `#/jobs/${j.id}`; } },
          h('td', {}, h('b', {}, j.name), j.notes ? h('div', { class: 'muted small' }, j.notes.slice(0, 80)) : null),
          h('td', {}, j.model === 'anima' ? 'Anima' : 'Qwen 2.1', h('div', { class: 'muted small' }, j.backend)),
          h('td', {}, j.dataset),
          h('td', {}, j.params.rank),
          h('td', {}, fmtNum(j.params.lr)),
          h('td', {}, j.params.steps),
          h('td', { style: { minWidth: '120px' } }, h('div', { class: 'progress' }, h('div', { style: { width: `${(100 * (j.progress.step || 0) / Math.max(1, j.progress.total)).toFixed(1)}%` } })),
            h('div', { class: 'muted small' }, `${j.progress.step || 0}/${j.progress.total}${j.progress.loss != null ? ` · loss ${fmtNum(j.progress.loss)}` : ''}`)),
          h('td', {}, statusBadge(j.status)),
          h('td', { class: 'muted small' }, fmtTime(j.created)))))
        : h('div', { class: 'empty' }, 'Belum ada job.')));
    if (jobs.some((j) => j.status === 'running' || j.status === 'queued')) timer = setTimeout(draw, 3000);
  }
  await draw();
  return () => clearTimeout(timer);
}
