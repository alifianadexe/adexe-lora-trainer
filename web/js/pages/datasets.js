import { api, enc } from '../api.js';
import { h, mount, modal, errToast } from '../ui.js';

export async function render(view) {
  const list = await api.get('/api/datasets');

  const openCreate = () => {
    const name = h('input', { placeholder: 'contoh: aiko_character' });
    const trig = h('input', { placeholder: 'contoh: ak1k0 (kata unik, bukan kata umum)' });
    const style = h('select', {}, h('option', { value: 'natural' }, 'Kalimat natural (cocok Qwen 2.1)'), h('option', { value: 'tags' }, 'Tag Danbooru (cocok Anima)'));
    const link = h('input', { placeholder: '(opsional) /path/ke/folder/gambar yang sudah ada' });
    let close;
    const box = h('div', { class: 'modal stack' },
      h('h2', {}, 'Dataset baru'),
      h('label', { class: 'field' }, h('span', {}, 'Nama'), name),
      h('label', { class: 'field' }, h('span', {}, 'Trigger word'), trig,
        h('div', { class: 'muted small' }, 'Kata unik yang nanti dipakai di prompt untuk memanggil LoRA. Gunakan kata langka (misal "ak1k0", "zxstyle") supaya tidak bentrok dengan pengetahuan model.')),
      h('label', { class: 'field' }, h('span', {}, 'Gaya caption'), style),
      h('label', { class: 'field' }, h('span', {}, 'Tautkan folder lokal'), link,
        h('div', { class: 'muted small' }, 'Jika diisi, studio memakai folder itu langsung (tidak menyalin). Caption .txt akan ditulis di folder itu.')),
      h('div', { class: 'row', style: { justifyContent: 'flex-end' } },
        h('button', { class: 'btn', onclick: () => close() }, 'Batal'),
        h('button', {
          class: 'btn primary', onclick: async () => {
            try {
              const d = await api.post('/api/datasets', { name: name.value, trigger_word: trig.value, caption_style: style.value, linked_path: link.value });
              close();
              location.hash = `#/datasets/${enc(d.name)}`;
            } catch (e) { errToast(e); }
          },
        }, 'Buat')));
    close = modal(box);
    name.focus();
  };

  mount(view,
    h('div', { class: 'page-head' },
      h('div', {}, h('h1', {}, 'Dataset'), h('div', { class: 'muted' }, 'Kualitas dataset menentukan 80% kualitas LoRA.')),
      h('button', { class: 'btn primary', onclick: openCreate }, '+ Dataset baru')),
    list.length ? h('div', { class: 'ds-grid' }, list.map((d) => h('div', { class: 'card ds-card', onclick: () => { location.hash = `#/datasets/${enc(d.name)}`; } },
      h('div', { class: 'cover' }, d.cover ? h('img', { src: `/api/datasets/${enc(d.name)}/thumb/${enc(d.cover)}`, loading: 'lazy' }) : h('span', { class: 'muted' }, 'kosong')),
      h('div', { class: 'meta' },
        h('b', {}, d.name),
        h('div', { class: 'muted small' }, `${d.count} gambar · ${d.captioned}/${d.count} ber-caption`),
        h('div', { class: 'row small', style: { marginTop: '4px' } },
          d.trigger_word ? h('span', { class: 'badge accent' }, d.trigger_word) : null,
          h('span', { class: 'badge' }, d.caption_style === 'tags' ? 'tags' : 'natural'),
          d.linked ? h('span', { class: 'badge' }, 'folder tertaut') : null)))))
      : h('div', { class: 'card empty' }, h('p', {}, 'Belum ada dataset.'), h('button', { class: 'btn primary', onclick: openCreate }, 'Buat dataset pertama')),
  );
}
