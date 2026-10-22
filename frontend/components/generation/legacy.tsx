"use client";
import { url } from "@/lib/api";

// The original two-stage form (sketch -> lineart -> colour), kept unchanged apart from layout.
import { useEffect, useRef, useState } from "react";
import { api, Job, Options } from "./api";

const SCHOOL = "school uniform";
const OTHER = "__other__";

export function LegacyForm({ options, onCreated }: { options: Options; onCreated: (j: Job) => void }) {
  const [inputMode, setInputMode] = useState<"sketch" | "lineart">("sketch");
  const [charSearch, setCharSearch] = useState("");
  const [sketch, setSketch] = useState<File | null>(null);
  const [sketchUrl, setSketchUrl] = useState("");
  const [chars, setChars] = useState<string[]>([]);
  const [outfitChoice, setOutfitChoice] = useState<Record<string, string>>({});
  const [outfitText, setOutfitText] = useState<Record<string, string>>({});
  const [chibi, setChibi] = useState(false);
  const [props, setProps] = useState("");
  const [note, setNote] = useState("");
  const [age, setAge] = useState("default");
  const [want4k, setWant4k] = useState(false);
  const [seed, setSeed] = useState("");
  const firstStage1 = options.stage1_loras.find((o) => o.available)?.id || "";
  const [stage1, setStage1] = useState(firstStage1);
  const [preview, setPreview] = useState<{ stage1?: string; stage2?: string; error?: string }>({});
  const [manual, setManual] = useState(false);
  const [p1, setP1] = useState("");
  const [p2, setP2] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const outfits: Record<string, string> = {};
  for (const c of chars) {
    const choice = outfitChoice[c] || SCHOOL;
    outfits[c] = choice === OTHER ? outfitText[c] || SCHOOL : choice;
  }
  const propList = props.split(",").map((s) => s.trim()).filter(Boolean);
  const body = { characters: chars, outfits, chibi, props: propList, note, age, stage1_lora: stage1 };
  const bodyKey = JSON.stringify(body);

  useEffect(() => {
    if (!chars.length) {
      setPreview({});
      return;
    }
    const t = setTimeout(() => api.preview(JSON.parse(bodyKey)).then(setPreview).catch(() => {}), 250);
    return () => clearTimeout(t);
  }, [bodyKey, chars.length]);

  const pickFile = (f: File | null) => {
    if (!f) return;
    if (!/^image\/(png|jpeg|webp)$/.test(f.type)) { setError("Pilih gambar PNG, JPG, atau WebP."); return; }
    if (f.size > 20 * 1024 * 1024) { setError("Ukuran gambar maksimal 20 MB."); return; }
    setError("");
    setSketch(f);
    if (sketchUrl) URL.revokeObjectURL(sketchUrl);
    setSketchUrl(URL.createObjectURL(f));
  };

  useEffect(() => () => { if (sketchUrl) URL.revokeObjectURL(sketchUrl); }, [sketchUrl]);

  const toggle = (c: string) => {
    setChars((cur) => (cur.includes(c) ? cur.filter((x) => x !== c) : cur.length >= options.max_characters ? cur : [...cur, c]));
  };
  const move = (i: number, d: number) => {
    setChars((cur) => {
      const next = [...cur];
      const j = i + d;
      if (j < 0 || j >= next.length) return cur;
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  };

  const submit = async () => {
    setError("");
    if (!sketch) return setError("Upload sketch dulu");
    if (!chars.length) return setError("Pilih minimal satu karakter");
    setBusy(true);
    try {
      const params = {
        ...body,
        want_4k: want4k,
        seed: seed === "" ? null : Number(seed),
        prompt_stage1: manual ? p1 : "",
        prompt_stage2: manual ? p2 : "",
      };
      onCreated(await api.create(params, inputMode === "sketch" ? sketch : null, inputMode === "lineart" ? sketch : null));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const stage1Opt = options.stage1_loras.find((o) => o.id === stage1);

  return (
    <div>
      <div className="segmented"><button className={inputMode === "sketch" ? "chosen" : ""} onClick={() => setInputMode("sketch")}>Dari sketch</button><button className={inputMode === "lineart" ? "chosen" : ""} onClick={() => setInputMode("lineart")}>Warnai lineart</button></div>
      <label className="label">01 <span>{inputMode === "sketch" ? "Upload sketch" : "Upload lineart"}</span></label>
      <div
        className={`drop ${sketchUrl ? "has" : ""}`}
        role="button" tabIndex={0} aria-label="Upload gambar"
        onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); fileRef.current?.click(); } }}
        onClick={() => fileRef.current?.click()}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          pickFile(e.dataTransfer.files?.[0] || null);
        }}
      >
        {sketchUrl ? <img src={sketchUrl} alt="sketch" /> : <><span className="upload-icon">↥</span><strong>Tarik gambar ke sini</strong><span>atau klik untuk memilih file</span><small>PNG, JPG, WEBP · Maks. 20 MB</small></>}
      </div>
      <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(e) => pickFile(e.target.files?.[0] || null)} />
      <p className="hint">{sketch ? `${sketch.name} · Klik gambar untuk mengganti` : "Gambar disesuaikan ke 768 × 1344, tanpa terpotong."}</p>

      <label className="label">02 <span>Pilih karakter</span><small>{chars.length}/{options.max_characters}</small></label>
      <input className="character-search" type="text" aria-label="Cari karakter" placeholder="Cari karakter…" value={charSearch} onChange={e => setCharSearch(e.target.value)} />
      <div className="chars">
        {options.characters.filter(c => c.toLowerCase().includes(charSearch.toLowerCase())).map((c) => (
          <button key={c} type="button" aria-pressed={chars.includes(c)} disabled={!chars.includes(c) && chars.length >= options.max_characters} className={`char ${chars.includes(c) ? "on" : ""}`} onClick={() => toggle(c)}>
            <img src={url(`/api/generate/characters/${encodeURIComponent(c)}/face`)} alt={c} loading="lazy" />
            <span>{chars.includes(c) && <b>{chars.indexOf(c) + 1} · </b>}{c}</span>
          </button>
        ))}
      </div>

      {chars.length > 0 && (
        <>
          <label className="label">Urutan kiri → kanan & pakaian</label>
          <ul className="order">
            {chars.map((c, i) => {
              const presets = options.outfit_presets[c] || [];
              const choice = outfitChoice[c] || SCHOOL;
              return (
                <li key={c}>
                  <span className="num">{i + 1}.</span>
                  <div>
                    <strong>{c}</strong>
                    <select value={choice} onChange={(e) => setOutfitChoice({ ...outfitChoice, [c]: e.target.value })} style={{ marginTop: 4 }}>
                      <option value={SCHOOL}>school uniform</option>
                      {presets.map((p) => (
                        <option key={p} value={p}>
                          {p}
                        </option>
                      ))}
                      <option value={OTHER}>lainnya (ketik sendiri)</option>
                    </select>
                    {choice === OTHER && (
                      <input
                        type="text"
                        placeholder="contoh: white T-shirt, navy shorts"
                        value={outfitText[c] || ""}
                        onChange={(e) => setOutfitText({ ...outfitText, [c]: e.target.value })}
                        style={{ marginTop: 4 }}
                      />
                    )}
                  </div>
                  <span className="ctl">
                    <button className="btn small" onClick={() => move(i, -1)} disabled={i === 0} aria-label="geser kiri">
                      ↑
                    </button>
                    <button className="btn small" onClick={() => move(i, 1)} disabled={i === chars.length - 1} aria-label="geser kanan">
                      ↓
                    </button>
                  </span>
                </li>
              );
            })}
          </ul>
        </>
      )}

      <label className="label">03 · Gaya & detail</label>
      <label className="check">
        <input type="checkbox" checked={chibi} onChange={(e) => setChibi(e.target.checked)} /> Chibi
      </label>
      <label className="label" style={{ fontWeight: 400 }}>
        Props (pisahkan dengan koma, maks 6)
      </label>
      <input type="text" list="props" value={props} onChange={(e) => setProps(e.target.value)} placeholder="contoh: brown desk with grey frame, black backpack" />
      <datalist id="props">
        {options.prop_presets.map((p) => (
          <option key={p} value={p} />
        ))}
      </datalist>
      <details>
        <summary>Opsi lanjutan</summary>
        <label className="label" style={{ fontWeight: 400 }}>
          Versi umur
        </label>
        <select value={age} onChange={(e) => setAge(e.target.value)}>
          {options.age_variants.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>
        <label className="label" style={{ fontWeight: 400 }}>
          Catatan tambahan (eksperimental, bahasa Inggris)
        </label>
        <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Di luar kosakata latih, bisa diabaikan model" />
        <label className="label" style={{ fontWeight: 400 }}>
          LoRA Stage 1
        </label>
        <select value={stage1} onChange={(e) => setStage1(e.target.value)}>
          {options.stage1_loras.map((o) => (
            <option key={o.id} value={o.id} disabled={!o.available}>
              {o.label}
              {o.available ? "" : " (belum ada)"}
            </option>
          ))}
        </select>
        <label className="label" style={{ fontWeight: 400 }}>
          Seed (kosong = acak)
        </label>
        <input type="number" value={seed} onChange={(e) => setSeed(e.target.value)} />
        <label className="check" style={{ marginTop: 10 }}>
          <input
            type="checkbox"
            checked={manual}
            onChange={(e) => {
              setManual(e.target.checked);
              setP1(preview.stage1 || "");
              setP2(preview.stage2 || "");
            }}
          />
          Edit prompt manual
        </label>
      </details>

      <details><summary>Lihat prompt yang dikirim</summary>
      {preview.error && <p className="error">{preview.error}</p>}
      {manual ? (
        <>
          <textarea value={p1} onChange={(e) => setP1(e.target.value)} />
          <textarea value={p2} onChange={(e) => setP2(e.target.value)} style={{ marginTop: 6 }} />
        </>
      ) : (
        <>
          <div className="prompt">{preview.stage1 || "Stage 1: pilih karakter dulu"}</div>
          <div className="prompt" style={{ marginTop: 6 }}>
            {preview.stage2 || "Stage 2: pilih karakter dulu"}
          </div>
        </>
      )}
      {stage1Opt && !stage1Opt.uses_reference && <p className="hint">Stage 1 v2 tidak memakai referensi karakter dan props. Stage 2 tetap memakai keduanya.</p>}

      </details>
      <label className="label">04 · Resolusi hasil</label>
      <label className="check">
        <input type="checkbox" checked disabled /> 2K (1440x2560)
      </label>
      <label className="check">
        <input type="checkbox" checked={want4k} onChange={(e) => setWant4k(e.target.checked)} /> 4K (2160x3840)
      </label>

      <div style={{ marginTop: 14 }}>
        <button className="btn primary" onClick={submit} disabled={busy || !sketch || !chars.length || !!preview.error}>
          {busy ? "Menyiapkan karya…" : inputMode === "lineart" ? "Warnai lineart  ↗" : "Generate karya  ↗"}
        </button>
      </div>
      <p className="hint">{!sketch ? "Upload gambar untuk memulai." : !chars.length ? "Pilih minimal satu karakter." : "Siap diproses. Hasil tersimpan otomatis di galeri."}</p>
      {error && <p role="alert" className="error">{error}</p>}
    </div>
  );
}

