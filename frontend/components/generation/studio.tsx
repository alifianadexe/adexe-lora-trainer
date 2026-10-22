"use client";

import { useEffect, useState } from "react";
import { api, Job, Options } from "./api";
import { JobView } from "./job";
import { LegacyForm } from "./legacy";
import { CharacterPicker, Dropzone, errText, Pill } from "./ui";

export type S2FSettings = {
  checkpoint: string; guidance: number; steps: number; seed: string;
  sizes: string[]; stroke_px: number; lineart_fills: boolean; lineart_from_upscaled: boolean;
};

export function defaultSettings(o: Options): S2FSettings {
  const d = o.s2f.defaults;
  return {
    checkpoint: o.s2f.checkpoints.find((c) => c.default)?.id || o.s2f.checkpoints.at(-1)?.id || "",
    guidance: d.guidance, steps: d.steps, seed: "", sizes: ["2k"], stroke_px: d.stroke_px,
    lineart_fills: false, lineart_from_upscaled: true,
  };
}

export const settingsBody = (s: S2FSettings) => ({ ...s, seed: s.seed === "" ? null : Number(s.seed) });

/** Shared generation settings (single job and batch). */
export function SettingsFields({ options, value, onChange, showSeed = true }: {
  options: Options; value: S2FSettings; onChange: (v: S2FSettings) => void; showSeed?: boolean;
}) {
  const set = (k: Partial<S2FSettings>) => onChange({ ...value, ...k });
  const toggleSize = (k: string) => set({ sizes: value.sizes.includes(k) ? value.sizes.filter((x) => x !== k) : [...value.sizes, k] });
  return (
    <div className="fields">
      <label className="field">Checkpoint
        <select value={value.checkpoint} onChange={(e) => set({ checkpoint: e.target.value })}>
          {options.s2f.checkpoints.map((c) => <option key={c.id} value={c.id} disabled={!c.available}>{c.label}{c.default ? " · rekomendasi" : ""}</option>)}
        </select>
      </label>
      <div className="field-row">
        <label className="field">Guidance (CFG)<input type="number" min={1} max={8} step={0.5} value={value.guidance} onChange={(e) => set({ guidance: Number(e.target.value) })} /></label>
        <label className="field">Steps<input type="number" min={10} max={80} value={value.steps} onChange={(e) => set({ steps: Number(e.target.value) })} /></label>
        {showSeed && <label className="field">Seed<input type="number" placeholder="acak" value={value.seed} onChange={(e) => set({ seed: e.target.value })} /></label>}
      </div>
      <div className="field">Output besar (upscale anime 4x)
        <div className="row tight">
          {Object.entries(options.outputs).map(([k, [w, h]]) => (
            <label key={k} className="check"><input type="checkbox" checked={value.sizes.includes(k)} onChange={() => toggleSize(k)} /> {k.toUpperCase()} <span className="muted small">{w}×{h}</span></label>
          ))}
        </div>
      </div>
      <div className="field">Lineart dari final
        <label className="slider">Tebal garis <input type="range" min={1.5} max={4.5} step={0.1} value={value.stroke_px} onChange={(e) => set({ stroke_px: Number(e.target.value) })} /> <b>{value.stroke_px.toFixed(1)}px</b></label>
        <label className="check"><input type="checkbox" checked={value.lineart_fills} onChange={(e) => set({ lineart_fills: e.target.checked })} /> Area gelap (rambut hitam) diisi hitam</label>
        <label className="check"><input type="checkbox" checked={value.lineart_from_upscaled} disabled={!value.sizes.length} onChange={(e) => set({ lineart_from_upscaled: e.target.checked })} /> Ekstrak dari hasil upscale (garis lebih halus)</label>
      </div>
    </div>
  );
}

const SCHOOL = "school uniform";

function S2FForm({ options, onCreated }: { options: Options; onCreated: (j: Job) => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [url, setUrl] = useState("");
  const [chars, setChars] = useState<string[]>([]);
  const [outfits, setOutfits] = useState<Record<string, string>>({});
  const [chibi, setChibi] = useState(false);
  const [props, setProps] = useState("");
  const [scene, setScene] = useState("");
  const [expression, setExpression] = useState("");
  const [settings, setSettings] = useState<S2FSettings>(() => defaultSettings(options));
  const [preview, setPreview] = useState<{ prompt?: string; error?: string }>({});
  const [manual, setManual] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => () => { if (url) URL.revokeObjectURL(url); }, [url]);
  const body = {
    mode: "s2f", characters: chars, chibi, scene, expression,
    outfits: Object.fromEntries(chars.map((c) => [c, outfits[c] || SCHOOL])),
    props: props.split(",").map((s) => s.trim()).filter(Boolean), checkpoint: settings.checkpoint,
  };
  const key = JSON.stringify(body);
  useEffect(() => {
    if (!chars.length) { setPreview({}); return; }
    const t = setTimeout(() => api.previewS2F(JSON.parse(key)).then(setPreview).catch(() => {}), 250);
    return () => clearTimeout(t);
  }, [key, chars.length]);

  const move = (i: number, d: number) => setChars((cur) => {
    const n = [...cur]; const j = i + d;
    if (j < 0 || j >= n.length) return cur;
    [n[i], n[j]] = [n[j], n[i]]; return n;
  });

  const submit = async () => {
    setBusy(true); setErr("");
    try {
      onCreated(await api.create({ ...body, ...settingsBody(settings), prompt_s2f: manual ? prompt : "" }, file, null));
    } catch (e) { setErr(errText(e)); } finally { setBusy(false); }
  };

  return (
    <div>
      <h4 className="step-title"><span>1</span>Sketch</h4>
      <Dropzone title="Tarik sketch ke sini" preview={url} onFiles={([f]) => { setFile(f); if (url) URL.revokeObjectURL(url); setUrl(URL.createObjectURL(f)); }} />
      <p className="muted small">{file ? `${file.name} · klik untuk mengganti` : "Disesuaikan ke 768 × 1344 tanpa terpotong."}</p>

      <h4 className="step-title"><span>2</span>Karakter <small>{chars.length}/4 · urutan = kiri → kanan</small></h4>
      <CharacterPicker table={options.s2f.characters} value={chars} onChange={setChars} />
      {chars.length > 0 && (
        <ul className="order">
          {chars.map((c, i) => (
            <li key={c}>
              <span className="num">{i + 1}</span>
              <div className="grow">
                <strong>{c}</strong> <span className="muted small">{options.s2f.characters[c]?.caption}</span>
                <input list={`outfit-${c}`} placeholder="Pakaian (kosong = school uniform)" value={outfits[c] || ""} onChange={(e) => setOutfits({ ...outfits, [c]: e.target.value })} />
                <datalist id={`outfit-${c}`}>{(options.outfit_presets[c] || []).map((p) => <option key={p} value={p} />)}</datalist>
              </div>
              <span className="ctl">
                <button className="btn small ghost" onClick={() => move(i, -1)} disabled={i === 0} aria-label="ke kiri">←</button>
                <button className="btn small ghost" onClick={() => move(i, 1)} disabled={i === chars.length - 1} aria-label="ke kanan">→</button>
              </span>
            </li>
          ))}
        </ul>
      )}

      <h4 className="step-title"><span>3</span>Adegan</h4>
      <label className="check"><input type="checkbox" checked={chibi} onChange={(e) => setChibi(e.target.checked)} /> Chibi</label>
      <label className="field">Scene (bahasa Inggris)<textarea rows={2} value={scene} onChange={(e) => setScene(e.target.value)} placeholder="A character rests her head on folded arms at a desk." /></label>
      <label className="field">Ekspresi<input value={expression} onChange={(e) => setExpression(e.target.value)} placeholder="She looks sad, with downcast eyes and a small frown." /></label>
      <label className="field">Props (pisahkan koma)<input list="props" value={props} onChange={(e) => setProps(e.target.value)} placeholder="black backpack, white book" /></label>
      <datalist id="props">{options.prop_presets.map((p) => <option key={p} value={p} />)}</datalist>

      <details className="advanced">
        <summary>Pengaturan model & output</summary>
        <SettingsFields options={options} value={settings} onChange={setSettings} />
      </details>
      <details className="advanced">
        <summary>Prompt yang dikirim</summary>
        {preview.error && <p className="error">{preview.error}</p>}
        <label className="check"><input type="checkbox" checked={manual} onChange={(e) => { setManual(e.target.checked); setPrompt(preview.prompt || ""); }} /> Edit manual</label>
        {manual ? <textarea rows={7} value={prompt} onChange={(e) => setPrompt(e.target.value)} /> : <div className="prompt">{preview.prompt || "Pilih karakter dulu."}</div>}
      </details>

      <button className="btn primary wide" onClick={submit} disabled={busy || !file || !chars.length || !!preview.error}>
        {busy ? "Menyiapkan…" : "Generate final + lineart"}
      </button>
      <p className="muted small">{!file ? "Upload sketch untuk mulai." : !chars.length ? "Pilih minimal satu karakter." : "Hasil final dan lineart tampil berdampingan di kanan."}</p>
      {err && <p className="error">{err}</p>}
    </div>
  );
}

export function StudioView({ options, jobs, onCreated, onChanged }: {
  options: Options; jobs: Job[]; onCreated: (j: Job) => void; onChanged: () => void;
}) {
  const [mode, setMode] = useState<"s2f" | "legacy">("s2f");
  const [selected, setSelected] = useState<string | null>(null);
  const single = jobs.filter((j) => !j.batch);
  const current = single.find((j) => j.id === selected) || single.find((j) => j.status === "running") || single[0] || null;
  const created = (j: Job) => { setSelected(j.id); onCreated(j); };
  return (
    <div className="studio">
      <section className="card form-card">
        <div className="card-head">
          <div><span className="eyebrow">Buat baru</span><h2>Studio</h2></div>
        </div>
        <div className="segmented">
          <button className={mode === "s2f" ? "chosen" : ""} onClick={() => setMode("s2f")}>Sketch → Final <em>v3</em></button>
          <button className={mode === "legacy" ? "chosen" : ""} onClick={() => setMode("legacy")}>2 tahap (lama)</button>
        </div>
        {mode === "s2f" ? <S2FForm options={options} onCreated={created} /> : <LegacyForm options={options} onCreated={created} />}
      </section>
      <section className="result-col">
        <div className="card">
          <div className="card-head"><div><span className="eyebrow">Hasil</span><h2>Kanvas</h2></div></div>
          {current ? <JobView key={current.id} job={current} onCreated={created} onChanged={onChanged} /> : (
            <div className="empty"><span className="empty-mark">✳</span><h3>Belum ada hasil</h3><p className="muted">Upload sketch, pilih karakter, lalu generate. Final dan lineart tampil berdampingan di sini.</p></div>
          )}
        </div>
        {single.length > 0 && (
          <div className="card">
            <div className="card-head"><div><span className="eyebrow">Terbaru</span><h2>Riwayat</h2></div></div>
            <div className="strip">
              {single.slice(0, 24).map((j) => (
                <button key={j.id} className={`thumb ${current?.id === j.id ? "sel" : ""}`} onClick={() => setSelected(j.id)}>
                  {(j.urls.final || j.urls.sketch) ? <img src={j.urls.final || j.urls.sketch} alt="" loading="lazy" /> : <div className="ph" />}
                  <Pill job={j} />
                </button>
              ))}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
