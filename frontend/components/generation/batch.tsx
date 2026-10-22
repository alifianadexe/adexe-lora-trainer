"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api, Batch, Job, Options } from "./api";
import { JobView } from "./job";
import { defaultSettings, S2FSettings, SettingsFields, settingsBody } from "./studio";
import { CharacterPicker, Dropzone, errText, Lightbox, Pill, Progress } from "./ui";

type Row = { key: string; file: File; url: string; name: string; characters: string[]; chibi: boolean; scene: string; expression: string; outfit: string; props: string };

const stem = (n: string) => n.replace(/\.[^.]+$/, "").toLowerCase();

/** Minimal CSV parser (quoted fields, commas, newlines). */
function parseCSV(text: string): Record<string, string>[] {
  const rows: string[][] = []; let cur: string[] = []; let f = ""; let q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) { if (ch === '"' && text[i + 1] === '"') { f += '"'; i++; } else if (ch === '"') q = false; else f += ch; }
    else if (ch === '"') q = true;
    else if (ch === ",") { cur.push(f); f = ""; }
    else if (ch === "\n" || ch === "\r") { if (ch === "\r" && text[i + 1] === "\n") i++; cur.push(f); rows.push(cur); cur = []; f = ""; }
    else f += ch;
  }
  if (f || cur.length) { cur.push(f); rows.push(cur); }
  const [head, ...body] = rows.filter((r) => r.some((x) => x.trim()));
  if (!head) return [];
  const h = head.map((x) => x.trim().toLowerCase().replace(/^﻿/, ""));
  return body.map((r) => Object.fromEntries(h.map((k, i) => [k, (r[i] || "").trim()])));
}

const q = (s: string) => `"${String(s).replaceAll('"', '""')}"`;

function Builder({ options, onSubmitted }: { options: Options; onSubmitted: (batch: string) => void }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [label, setLabel] = useState("");
  const [defChars, setDefChars] = useState<string[]>([]);
  const [defChibi, setDefChibi] = useState(false);
  const [settings, setSettings] = useState<S2FSettings>(() => defaultSettings(options));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [note, setNote] = useState("");
  const csvRef = useRef<HTMLInputElement>(null);
  const known = new Set(Object.keys(options.s2f.characters));

  useEffect(() => () => rows.forEach((r) => URL.revokeObjectURL(r.url)), []); // eslint-disable-line react-hooks/exhaustive-deps

  const add = (files: File[]) => setRows((cur) => {
    const have = new Set(cur.map((r) => r.name));
    const fresh = files.filter((f) => !have.has(f.name)).map((f) => ({
      key: `${f.name}-${f.size}-${Math.random()}`, file: f, url: URL.createObjectURL(f), name: f.name,
      characters: [...defChars], chibi: defChibi, scene: "", expression: "", outfit: "", props: "",
    }));
    return [...cur, ...fresh].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  });
  const update = (key: string, patch: Partial<Row>) => setRows((cur) => cur.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const remove = (key: string) => setRows((cur) => { const r = cur.find((x) => x.key === key); if (r) URL.revokeObjectURL(r.url); return cur.filter((x) => x.key !== key); });
  const applyAll = () => setRows((cur) => cur.map((r) => ({ ...r, characters: [...defChars], chibi: defChibi })));

  const importCSV = async (f: File) => {
    const recs = parseCSV(await f.text());
    let hit = 0; const unknown = new Set<string>();
    setRows((cur) => cur.map((r) => {
      const rec = recs.find((x) => stem(x.filename || x.file || x.name || "") === stem(r.name));
      if (!rec) return r;
      hit++;
      const chars = (rec.characters || rec.karakter || "").split(/[;|+]/).map((s) => s.trim()).filter(Boolean);
      chars.filter((c) => !known.has(c)).forEach((c) => unknown.add(c));
      return { ...r, characters: chars.filter((c) => known.has(c)).slice(0, 4), chibi: /^(1|y|yes|ya|true)$/i.test(rec.chibi || ""),
        scene: rec.scene || "", expression: rec.expression || rec.ekspresi || "", outfit: rec.outfit || "", props: rec.props || "" };
    }));
    setNote(`CSV: ${hit} baris cocok dari ${recs.length}.` + (unknown.size ? ` Karakter tidak dikenal: ${[...unknown].join(", ")}.` : ""));
  };
  const template = () => {
    const lines = ["filename,characters,chibi,scene,expression,outfit,props",
      ...rows.map((r) => [r.name, r.characters.join(";"), r.chibi ? "1" : "0", r.scene, r.expression, r.outfit, r.props].map(q).join(","))];
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv" }));
    a.download = "batch_template.csv"; a.click();
  };

  const invalid = rows.filter((r) => !r.characters.length).length;
  const submit = async () => {
    setBusy(true); setErr("");
    try {
      const body = rows.map((r) => ({
        name: r.name, characters: r.characters, chibi: r.chibi, scene: r.scene, expression: r.expression,
        outfits: r.outfit ? Object.fromEntries(r.characters.map((c) => [c, r.outfit])) : {},
        props: r.props.split(",").map((s) => s.trim()).filter(Boolean),
      }));
      const res = await api.createBatch(label, { mode: "s2f", ...settingsBody(settings) }, body, rows.map((r) => r.file));
      rows.forEach((r) => URL.revokeObjectURL(r.url)); setRows([]); onSubmitted(res.batch);
    } catch (e) { setErr(errText(e)); } finally { setBusy(false); }
  };

  return (
    <section className="card">
      <div className="card-head">
        <div><span className="eyebrow">Bulk generate</span><h2>Batch baru</h2></div>
        <div className="row tight">
          <button className="btn small ghost" onClick={() => csvRef.current?.click()} disabled={!rows.length}>Impor CSV</button>
          <button className="btn small ghost" onClick={template} disabled={!rows.length}>Unduh template CSV</button>
        </div>
      </div>
      <input ref={csvRef} type="file" accept=".csv,text/csv" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) importCSV(f); e.target.value = ""; }} />
      <Dropzone multiple title="Tarik banyak sketch sekaligus" hint="atau klik untuk memilih beberapa file" onFiles={add} />
      {note && <p className="muted small">{note}</p>}

      {rows.length > 0 && (
        <>
          <div className="defaults">
            <span className="muted small">Default untuk semua baris:</span>
            <CharacterPicker compact table={options.s2f.characters} value={defChars} onChange={setDefChars} />
            <label className="check"><input type="checkbox" checked={defChibi} onChange={(e) => setDefChibi(e.target.checked)} /> Chibi</label>
            <button className="btn small" onClick={applyAll}>Terapkan ke semua</button>
          </div>
          <div className="table-wrap">
            <table className="batch-table">
              <thead><tr><th></th><th>File</th><th>Karakter (urut kiri → kanan)</th><th>Chibi</th><th>Scene</th><th>Ekspresi</th><th>Pakaian</th><th></th></tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.key} className={r.characters.length ? "" : "warn"}>
                    <td><img className="row-thumb" src={r.url} alt="" /></td>
                    <td className="fname">{r.name}</td>
                    <td><CharacterPicker compact table={options.s2f.characters} value={r.characters} onChange={(v) => update(r.key, { characters: v })} /></td>
                    <td><input type="checkbox" checked={r.chibi} onChange={(e) => update(r.key, { chibi: e.target.checked })} aria-label="chibi" /></td>
                    <td><textarea rows={2} value={r.scene} onChange={(e) => update(r.key, { scene: e.target.value })} placeholder="opsional" /></td>
                    <td><input value={r.expression} onChange={(e) => update(r.key, { expression: e.target.value })} placeholder="opsional" /></td>
                    <td><input value={r.outfit} onChange={(e) => update(r.key, { outfit: e.target.value })} placeholder="school uniform" /></td>
                    <td><button className="btn small ghost" onClick={() => remove(r.key)} aria-label="hapus baris">✕</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <details className="advanced" open>
            <summary>Pengaturan batch</summary>
            <label className="field">Nama batch<input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="misal: chapter12" /></label>
            <SettingsFields options={options} value={settings} onChange={setSettings} />
            <p className="muted small">Seed kosong = acak per gambar. Hasil disimpan ke {options.s2f.defaults.outputs_dir}\&lt;batch&gt;\.</p>
          </details>
          <div className="row">
            <button className="btn primary" disabled={busy || invalid > 0} onClick={submit}>{busy ? "Mengirim…" : `Antrekan ${rows.length} gambar`}</button>
            {invalid > 0 && <span className="error">{invalid} baris belum punya karakter</span>}
          </div>
          {err && <p className="error">{err}</p>}
        </>
      )}
    </section>
  );
}

function BatchDetail({ id, onCreated }: { id: string; onCreated: (j: Job) => void }) {
  const [items, setItems] = useState<Job[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [zoom, setZoom] = useState<string | null>(null);
  const load = useCallback(() => api.batch(id).then(setItems).catch(() => {}), [id]);
  useEffect(() => { load(); }, [load]);
  const active = items.some((j) => j.status === "queued" || j.status === "running");
  useEffect(() => { const t = setInterval(load, active ? 2500 : 15000); return () => clearInterval(t); }, [active, load]);
  // latest attempt per file name
  const latest = Object.values(items.reduce<Record<string, Job>>((m, j) => { m[j.name || j.id] = j; return m; }, {}));
  const done = latest.filter((j) => j.status === "done").length;
  const opened = latest.find((j) => j.id === open) || null;
  return (
    <div className="card">
      <div className="card-head">
        <div><span className="eyebrow">Batch</span><h2>{id}</h2><p className="muted small">{done}/{latest.length} selesai</p></div>
        <a className={`btn small ${done ? "" : "disabled"}`} href={done ? api.zipUrl(id) : undefined}>Unduh ZIP</a>
      </div>
      <div className="bar"><div style={{ width: `${latest.length ? (done / latest.length) * 100 : 0}%` }} /></div>
      <div className="batch-grid">
        {latest.map((j) => (
          <div key={j.id} className={`batch-item ${j.status}`}>
            <div className="pair">
              <button onClick={() => j.urls.final ? setZoom(j.urls.final_2k || j.urls.final) : setOpen(j.id)}>
                <img src={j.urls.final || j.urls.sketch} alt="final" loading="lazy" />
              </button>
              <button onClick={() => j.urls.lineart ? setZoom(j.urls.lineart_2k || j.urls.lineart) : setOpen(j.id)}>
                {j.urls.lineart ? <img src={j.urls.lineart} alt="lineart" loading="lazy" /> : <div className="ph">lineart</div>}
              </button>
            </div>
            <div className="item-meta">
              <span className="fname" title={j.name || ""}>{j.name}</span>
              <Pill job={j} />
            </div>
            {(j.status === "running" || j.status === "queued") && <Progress job={j} />}
            <div className="row tight">
              <button className="btn small ghost" onClick={() => setOpen(j.id)}>Detail</button>
              {(j.status === "error" || j.status === "done" || j.status === "cancelled") && (
                <button className="btn small ghost" onClick={async () => { onCreated(await api.derive(j.id, "all")); load(); }}>Ulangi</button>
              )}
            </div>
          </div>
        ))}
      </div>
      {opened && (
        <div className="modal" onClick={() => setOpen(null)}>
          <div className="modal-body card" onClick={(e) => e.stopPropagation()}>
            <button className="btn ghost lb-close" onClick={() => setOpen(null)} aria-label="Tutup">✕</button>
            <JobView job={opened} onCreated={(j) => { onCreated(j); load(); }} onChanged={load} />
          </div>
        </div>
      )}
      <Lightbox src={zoom} onClose={() => setZoom(null)} />
    </div>
  );
}

export function BatchView({ options, onCreated }: { options: Options; onCreated: (j: Job) => void }) {
  const [batches, setBatches] = useState<Batch[]>([]);
  const [sel, setSel] = useState<string | null>(null);
  const load = useCallback(() => api.batches().then(setBatches).catch(() => {}), []);
  useEffect(() => { load(); const t = setInterval(load, 5000); return () => clearInterval(t); }, [load]);
  const current = sel || batches[0]?.batch || null;
  return (
    <div className="batch-view">
      <Builder options={options} onSubmitted={(b) => { setSel(b); load(); }} />
      {batches.length > 0 && (
        <div className="batch-tabs">
          {batches.map((b) => (
            <button key={b.batch} className={`batch-tab ${current === b.batch ? "sel" : ""}`} onClick={() => setSel(b.batch)}>
              <strong>{b.batch}</strong>
              <span className="muted small">{b.done}/{b.n} selesai{b.active ? ` · ${b.active} aktif` : ""}{b.failed ? ` · ${b.failed} gagal` : ""}</span>
            </button>
          ))}
        </div>
      )}
      {current && <BatchDetail key={current} id={current} onCreated={onCreated} />}
    </div>
  );
}
