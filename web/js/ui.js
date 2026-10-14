// Tiny DOM helpers - no framework, no build step.
export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'html') el.innerHTML = v;
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, v);
  }
  for (const c of children.flat(Infinity)) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

export function mount(el, ...children) {
  el.replaceChildren(...children.flat(Infinity).filter((c) => c !== null && c !== undefined && c !== false));
  return el;
}

export function toast(msg, kind = '') {
  const t = h('div', { class: `toast ${kind}` }, msg);
  document.getElementById('toasts').append(t);
  setTimeout(() => t.remove(), kind === 'bad' ? 7000 : 3500);
}

export function errToast(e) { toast(e.message || String(e), 'bad'); }

export function modal(content, { onClose } = {}) {
  const bg = h('div', { class: 'modal-bg' });
  const close = () => { bg.remove(); document.removeEventListener('keydown', esc); onClose && onClose(); };
  const esc = (e) => { if (e.key === 'Escape') close(); };
  bg.addEventListener('click', (e) => { if (e.target === bg) close(); });
  document.addEventListener('keydown', esc);
  bg.append(content);
  document.body.append(bg);
  return close;
}

export function lightbox(src, caption) {
  modal(h('div', { class: 'lightbox' }, h('img', { src }), caption ? h('div', { class: 'cap' }, caption) : null));
}

export function confirmBox(msg) {
  return new Promise((resolve) => {
    let close;
    const box = h('div', { class: 'modal' },
      h('p', {}, msg),
      h('div', { class: 'row', style: { justifyContent: 'flex-end' } },
        h('button', { class: 'btn', onclick: () => { close(); resolve(false); } }, 'Batal'),
        h('button', { class: 'btn primary', onclick: () => { close(); resolve(true); } }, 'Ya, lanjut')));
    close = modal(box);
  });
}

// "?" button that explains a parameter from the catalog
const pop = () => document.getElementById('popover');
document.addEventListener('click', (e) => {
  if (!e.target.closest('.popover') && !e.target.closest('.help-btn')) pop().classList.add('hidden');
});

export function helpBtn(param) {
  if (!param) return null;
  return h('button', {
    type: 'button', class: 'help-btn', title: 'Penjelasan',
    onclick: (e) => {
      e.preventDefault();
      const p = pop();
      mount(p,
        h('h4', {}, param.label),
        h('div', {}, param.what),
        h('dl', {},
          param.up && param.up !== '-' ? [h('dt', {}, '⬆ Jika dinaikkan'), h('dd', {}, param.up)] : null,
          param.down && param.down !== '-' ? [h('dt', {}, '⬇ Jika diturunkan'), h('dd', {}, param.down)] : null,
          param.tip ? [h('dt', {}, '💡 Saran'), h('dd', {}, param.tip)] : null));
      p.classList.remove('hidden');
      const r = e.target.getBoundingClientRect();
      const left = Math.min(window.innerWidth - 380, Math.max(10, r.left - 20));
      let top = r.bottom + 8;
      p.style.left = left + 'px';
      p.style.top = top + 'px';
      const pr = p.getBoundingClientRect();
      if (pr.bottom > window.innerHeight - 10) p.style.top = Math.max(10, r.top - pr.height - 8) + 'px';
    },
  }, '?');
}

export function notes(list) {
  return h('div', { class: 'notes' }, (list || []).map((n) => h('div', { class: `note ${n.level || 'info'}` }, n.msg || n)));
}

export function fmtTime(ts) {
  if (!ts) return '-';
  const d = new Date(ts * 1000);
  return d.toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' });
}

export function fmtDur(sec) {
  if (!sec || sec < 0) return '-';
  const h_ = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = Math.floor(sec % 60);
  return h_ ? `${h_}j ${m}m` : m ? `${m}m ${s}d` : `${s}d`;
}

export function fmtNum(v) {
  if (v === null || v === undefined || v === '') return '-';
  const n = Number(v);
  if (n !== 0 && (Math.abs(n) < 1e-3 || Math.abs(n) >= 1e5)) return n.toExponential(1);
  return String(n);
}

export function statusBadge(s) {
  const label = { draft: 'draft', queued: 'antri', running: 'berjalan', completed: 'selesai', failed: 'gagal', stopped: 'dihentikan' }[s] || s;
  return h('span', { class: `badge ${s}` }, label);
}
