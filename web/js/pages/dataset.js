import { api, enc, catalog } from '../api.js';
import { h, mount, toast, errToast, lightbox, confirmBox, notes, modal } from '../ui.js';

export async function render(view, [name]) {
  const cat = await catalog();
  let data = null;
  let filter = 'all';
  let search = '';
  const selected = new Set();
  let pollTimer = null;
  const base = `/api/datasets/${enc(name)}`;

  const body = h('div');
  mount(view, body);

  async function load() {
    data = await api.get(base);
    draw();
  }

  function visibleItems() {
    const trig = (data.trigger_word || '').toLowerCase();
    return data.items.filter((i) => {
      if (filter === 'missing' && i.caption) return false;
      if (filter === 'notrigger' && (!trig || i.caption.toLowerCase().includes(trig))) return false;
      if (filter === 'small' && Math.min(i.width, i.height) >= 512) return false;
      if (search && !i.caption.toLowerCase().includes(search.toLowerCase()) && !i.file.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }

  async function bulk(op, args) {
    try {
      const files = selected.size ? [...selected] : undefined;
      const r = await api.post(`${base}/bulk`, { op, args: { ...args, files } });
      toast(`${r.changed} caption diubah`);
      await load();
    } catch (e) { errToast(e); }
  }

  async function uploadFiles(fileList) {
    const files = [...fileList];
    if (!files.length) return;
    const chunk = 20;
    let saved = 0;
    for (let i = 0; i < files.length; i += chunk) {
      const fd = new FormData();
      files.slice(i, i + chunk).forEach((f) => fd.append('files', f, f.name));
      try {
        const r = await api.upload(`${base}/upload`, fd);
        saved += r.saved.length;
        r.errors.forEach((e) => toast(e, 'bad'));
      } catch (e) { errToast(e); }
      toast(`Upload ${Math.min(i + chunk, files.length)}/${files.length}…`);
    }
    toast(`${saved} file tersimpan`);
    await load();
  }

  function promptBox(title, fields, onOk) {
    const inputs = fields.map((f) => h('input', { placeholder: f.placeholder || '', value: f.value || '' }));
    let close;
    close = modal(h('div', { class: 'modal stack' }, h('h2', {}, title),
      fields.map((f, i) => h('label', { class: 'field' }, h('span', {}, f.label), inputs[i])),
      h('div', { class: 'muted small' }, selected.size ? `Hanya untuk ${selected.size} gambar terpilih.` : 'Berlaku untuk semua gambar.'),
      h('div', { class: 'row', style: { justifyContent: 'flex-end' } },
        h('button', { class: 'btn', onclick: () => close() }, 'Batal'),
        h('button', { class: 'btn primary', onclick: () => { close(); onOk(inputs.map((x) => x.value)); } }, 'Terapkan'))));
    inputs[0] && inputs[0].focus();
  }

  function autoCaptionBox() {
    const style = h('select', {}, h('option', { value: 'natural' }, 'Kalimat natural'), h('option', { value: 'tags' }, 'Tag Danbooru'));
    style.value = data.caption_style;
    const overwrite = h('input', { type: 'checkbox' });
    const extra = h('input', { placeholder: '(opsional) instruksi tambahan, misal: "sebutkan warna rambut"' });
    let close;
    close = modal(h('div', { class: 'modal stack' }, h('h2', {}, '🤖 Auto-caption'),
      h('div', { class: 'note info' }, 'Memakai model vision lokal lewat API OpenAI-compatible (Ollama / LM Studio / vLLM). Atur endpoint & model di Pengaturan. Selalu periksa ulang hasilnya!'),
      h('label', { class: 'field' }, h('span', {}, 'Gaya'), style),
      h('label', { class: 'check' }, overwrite, 'Timpa caption yang sudah ada'),
      h('label', { class: 'field' }, h('span', {}, 'Instruksi tambahan'), extra),
      h('div', { class: 'muted small' }, selected.size ? `Untuk ${selected.size} gambar terpilih.` : 'Untuk semua gambar (yang belum ber-caption jika tidak menimpa).'),
      h('div', { class: 'row', style: { justifyContent: 'flex-end' } },
        h('button', { class: 'btn', onclick: () => close() }, 'Batal'),
        h('button', {
          class: 'btn primary', onclick: async () => {
            try {
              await api.post(`${base}/autocaption`, { style: style.value, overwrite: overwrite.checked, extra: extra.value, files: selected.size ? [...selected] : null });
              close();
              pollCaption();
            } catch (e) { errToast(e); }
          },
        }, 'Mulai'))));
  }

  const capStatus = h('div');
  async function pollCaption() {
    clearTimeout(pollTimer);
    try {
      const t = await api.get(`${base}/autocaption`);
      if (t.running) {
        mount(capStatus, h('div', { class: 'note info row' }, `🤖 Auto-caption ${t.done}/${t.total} — ${t.current || ''}`,
          h('span', { class: 'spacer' }), h('button', { class: 'btn sm', onclick: () => api.del(`${base}/autocaption`) }, 'Batalkan')));
        pollTimer = setTimeout(pollCaption, 1500);
      } else {
        if (t.total) {
          mount(capStatus, t.errors.length ? h('div', { class: 'note bad' }, `Auto-caption selesai dengan ${t.errors.length} error: ${t.errors.slice(0, 3).join(' | ')}`) : null);
          await load();
        }
      }
    } catch (_) { /* ignore */ }
  }

  function card(item) {
    const ta = h('textarea', { spellcheck: 'false' });
    ta.value = item.caption;
    const words = h('span', {}, `${item.caption.split(/\s+/).filter(Boolean).length} kata`);
    const save = async () => {
      if (ta.value.trim() === item.caption) return;
      try {
        await api.put(`${base}/caption/${enc(item.file)}`, { caption: ta.value });
        item.caption = ta.value.trim();
        ta.classList.remove('dirty');
      } catch (e) { errToast(e); }
    };
    ta.addEventListener('input', () => { ta.classList.toggle('dirty', ta.value.trim() !== item.caption); words.textContent = `${ta.value.split(/\s+/).filter(Boolean).length} kata`; });
    ta.addEventListener('blur', save);
    ta.addEventListener('keydown', (e) => { if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); save(); } });
    const sel = h('input', { type: 'checkbox', class: 'sel', onclick: (e) => e.stopPropagation() });
    sel.checked = selected.has(item.file);
    sel.addEventListener('change', () => { sel.checked ? selected.add(item.file) : selected.delete(item.file); selInfo(); });
    const small = Math.min(item.width, item.height) < 512;
    const trig = data.trigger_word && item.caption && !item.caption.toLowerCase().includes(data.trigger_word.toLowerCase());
    return h('div', { class: 'card img-item' },
      h('div', { class: 'thumb', onclick: () => lightbox(`${base}/image/${enc(item.file)}`, item.caption) },
        h('img', { src: `${base}/thumb/${enc(item.file)}`, loading: 'lazy' }),
        h('div', { class: 'tags' },
          !item.caption ? h('span', { class: 'badge failed' }, 'tanpa caption') : null,
          small ? h('span', { class: 'badge queued' }, 'resolusi kecil') : null,
          trig ? h('span', { class: 'badge queued' }, 'tanpa trigger') : null,
          item.alpha ? h('span', { class: 'badge' }, 'alpha') : null),
        sel),
      ta,
      h('div', { class: 'foot' },
        h('span', {}, `${item.width}×${item.height} · `, words),
        h('button', {
          class: 'btn sm danger', onclick: async () => {
            if (!(await confirmBox(`Hapus ${item.file} beserta caption-nya?`))) return;
            await api.del(`${base}/image/${enc(item.file)}`);
            await load();
          },
        }, 'Hapus')));
  }

  const selInfoEl = h('span', { class: 'muted small' });
  function selInfo() { selInfoEl.textContent = selected.size ? `${selected.size} terpilih` : ''; }

  function draw() {
    const style = data.caption_style;
    const modelHint = style === 'tags' ? cat.models.anima : cat.models.qwen_image_2;
    const trigInput = h('input', { value: data.trigger_word });
    const styleSel = h('select', {}, h('option', { value: 'natural' }, 'Kalimat natural'), h('option', { value: 'tags' }, 'Tag Danbooru'));
    styleSel.value = style;
    const saveMeta = async () => {
      try { await api.patch(base, { trigger_word: trigInput.value.trim(), caption_style: styleSel.value }); await load(); toast('Disimpan'); } catch (e) { errToast(e); }
    };

    const fileInput = h('input', { type: 'file', multiple: true, accept: 'image/*,.txt', class: 'hidden', onchange: (e) => uploadFiles(e.target.files) });
    const drop = h('div', { class: 'dropzone' }, '📥 Tarik & lepas gambar (dan .txt caption) ke sini, atau ',
      h('a', { href: '#', onclick: (e) => { e.preventDefault(); fileInput.click(); } }, 'pilih file'), fileInput);
    drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('over'); });
    drop.addEventListener('dragleave', () => drop.classList.remove('over'));
    drop.addEventListener('drop', (e) => { e.preventDefault(); drop.classList.remove('over'); uploadFiles(e.dataTransfer.files); });

    const items = visibleItems();
    const searchInput = h('input', { placeholder: 'Cari caption…', value: search, style: { width: '200px' } });
    searchInput.addEventListener('input', () => { search = searchInput.value; drawGrid(); });
    const filterSel = h('select', { style: { width: '190px' } },
      h('option', { value: 'all' }, `Semua (${data.items.length})`),
      h('option', { value: 'missing' }, `Tanpa caption (${data.stats.missing.length})`),
      h('option', { value: 'notrigger' }, `Tanpa trigger (${data.stats.no_trigger.length})`),
      h('option', { value: 'small' }, `Resolusi kecil (${data.stats.small.length})`));
    filterSel.value = filter;
    filterSel.addEventListener('change', () => { filter = filterSel.value; drawGrid(); });

    const grid = h('div', { class: 'img-grid' });
    function drawGrid() {
      const its = visibleItems();
      mount(grid, its.length ? its.map(card) : h('div', { class: 'empty' }, 'Tidak ada gambar.'));
    }

    mount(body,
      h('div', { class: 'page-head' },
        h('div', {}, h('a', { href: '#/datasets', class: 'small' }, '← Dataset'), h('h1', {}, data.name),
          h('div', { class: 'muted small' }, data.path)),
        h('div', { class: 'row' },
          h('a', { class: 'btn primary', href: `#/train?dataset=${enc(data.name)}` }, '🧪 Train dengan dataset ini'),
          h('button', {
            class: 'btn danger', onclick: async () => {
              if (!(await confirmBox(data.linked ? 'Hapus dataset dari studio? (folder tertaut TIDAK ikut dihapus)' : 'Hapus dataset beserta SEMUA gambarnya?'))) return;
              await api.del(base); location.hash = '#/datasets';
            },
          }, 'Hapus'))),
      h('div', { class: 'split' },
        h('div', { class: 'stack' },
          drop,
          capStatus,
          h('div', { class: 'card row' },
            h('b', {}, 'Alat caption:'),
            h('button', { class: 'btn sm', onclick: () => data.trigger_word ? bulk('prepend_trigger', { trigger: data.trigger_word }) : toast('Isi trigger word dulu', 'bad') }, '➕ Trigger di depan'),
            h('button', { class: 'btn sm', onclick: () => promptBox('Cari & ganti', [{ label: 'Cari' }, { label: 'Ganti dengan' }], ([f, r]) => bulk('replace', { find: f, replace: r })) }, '🔁 Cari & ganti'),
            h('button', { class: 'btn sm', onclick: () => promptBox('Tambah di akhir', [{ label: 'Teks / tag' }], ([t]) => bulk('append', { text: t })) }, '➕ Tambah di akhir'),
            h('button', { class: 'btn sm', onclick: () => promptBox('Hapus tag', [{ label: 'Tag (persis)' }], ([t]) => bulk('remove_tag', { tag: t })) }, '✂️ Hapus tag'),
            h('button', { class: 'btn sm', onclick: () => promptBox('Isi caption kosong', [{ label: 'Caption default' }], ([t]) => bulk('fill_empty', { text: t })) }, '📝 Isi yang kosong'),
            style === 'tags' ? h('button', { class: 'btn sm', onclick: () => bulk('underscores_to_spaces', {}) }, '␣ underscore → spasi') : null,
            h('button', { class: 'btn sm primary', onclick: autoCaptionBox }, '🤖 Auto-caption')),
          h('div', { class: 'row' }, filterSel, searchInput,
            h('button', { class: 'btn sm', onclick: () => { visibleItems().forEach((i) => selected.add(i.file)); drawGrid(); selInfo(); } }, 'Pilih semua'),
            h('button', { class: 'btn sm', onclick: () => { selected.clear(); drawGrid(); selInfo(); } }, 'Batal pilih'),
            selInfoEl),
          grid),
        h('div', { class: 'stack sticky-summary' },
          h('div', { class: 'card stack' },
            h('h3', {}, 'Pengaturan dataset'),
            h('label', { class: 'field' }, h('span', {}, 'Trigger word'), trigInput),
            h('label', { class: 'field' }, h('span', {}, 'Gaya caption'), styleSel),
            h('button', { class: 'btn sm', onclick: saveMeta }, 'Simpan')),
          h('div', { class: 'card stack' },
            h('h3', {}, 'Kesehatan dataset'),
            h('div', { class: 'grid g2' },
              h('div', { class: 'stat' }, h('b', {}, data.count), h('span', {}, 'gambar')),
              h('div', { class: 'stat' }, h('b', {}, `${data.captioned}`), h('span', {}, 'ber-caption')),
              h('div', { class: 'stat' }, h('b', {}, data.stats.avg_words), h('span', {}, 'rata-rata kata/caption'))),
            data.stats.warnings.length ? notes(data.stats.warnings) : h('div', { class: 'note ok' }, 'Dataset terlihat siap.')),
          h('div', { class: 'card stack' },
            h('h3', {}, `Panduan caption (${style === 'tags' ? 'tag' : 'natural'})`),
            h('div', { class: 'small' }, modelHint.caption_hint),
            h('div', { class: 'small muted' }, 'Prinsip utama: apa yang kamu TULIS di caption dianggap "bisa diganti", sedangkan apa yang TIDAK ditulis akan diserap ke trigger word.')),
          data.stats.top_tags.length && style === 'tags' ? h('div', { class: 'card stack' },
            h('h3', {}, 'Tag terbanyak'),
            h('div', { class: 'muted small' }, 'Klik tag untuk memfilter. Tag yang muncul di hampir semua gambar biasanya sifat tetap karakter — pertimbangkan menghapusnya agar diserap trigger word.'),
            h('div', { class: 'tag-cloud' }, data.stats.top_tags.map(([t, c]) => h('span', { class: 'badge', onclick: () => { search = t; draw(); } }, `${t} · ${c}`)))) : null)));
    drawGrid();
    selInfo();
  }

  await load();
  pollCaption();
  return () => clearTimeout(pollTimer);
}
