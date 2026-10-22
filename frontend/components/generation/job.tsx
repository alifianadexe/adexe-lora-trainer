"use client";

import { useEffect, useRef, useState } from "react";
import { api, Job, withQuery } from "./api";
import { CompareSlider, errText, Lightbox, Pill, Progress } from "./ui";

export function JobView({ job, onCreated, onChanged }: { job: Job; onCreated: (j: Job) => void; onChanged: () => void }) {
  const s2f = job.params.mode === "s2f";
  const [view, setView] = useState<"side" | "compare">("side");
  const [zoom, setZoom] = useState<string | null>(null);
  const [err, setErr] = useState("");
  const [acting, setActing] = useState(false);
  const lineRef = useRef<HTMLInputElement>(null);
  const running = job.status === "queued" || job.status === "running";
  const u = job.urls;
  const final = u.final, lineart = u.lineart;

  const act = async (fn: () => Promise<unknown>) => {
    if (acting) return;
    setActing(true); setErr("");
    try { await fn(); } catch (e) { setErr(errText(e)); } finally { setActing(false); }
  };
  const derive = (mode: "stage2" | "all", file?: File | null) => act(async () => onCreated(await api.derive(job.id, mode, file)));

  const tile = (key: string, big: string | undefined, label: string) => (
    <figure className="tile">
      <figcaption>{label}</figcaption>
      {u[key] ? (
        <button className="tile-img" onClick={() => setZoom(big || u[key])} title="Lihat ukuran penuh">
          <img src={u[key]} alt={label} />
        </button>
      ) : <div className="placeholder">{running ? "Sedang dibuat…" : "Belum ada"}</div>}
    </figure>
  );

  const dl = (key: string, label: string) => u[key] ? <a key={key} className="chip-link" href={withQuery(u[key], "download=1")}>{label}</a> : null;

  return (
    <div className="job">
      <div className="job-head">
        <div>
          <h3>{job.name || job.params.characters.join(", ")}</h3>
          <p className="muted small">
            {s2f ? `Sketch → Final · ${job.params.checkpoint} · CFG ${job.params.guidance}` : "2 tahap (lineart → warna)"} · seed {job.params.seed}
            {job.batch ? ` · batch ${job.batch}` : ""}
          </p>
        </div>
        <Pill job={job} />
      </div>
      {running && <><Progress job={job} /><p className="muted small">{job.message}</p></>}
      {job.status === "error" && <p className="error">{job.error || job.message}</p>}

      {final && lineart && (
        <div className="segmented small">
          <button className={view === "side" ? "chosen" : ""} onClick={() => setView("side")}>Berdampingan</button>
          <button className={view === "compare" ? "chosen" : ""} onClick={() => setView("compare")}>Geser bandingkan</button>
        </div>
      )}

      {view === "compare" && final && lineart ? (
        <CompareSlider a={final} b={lineart} labelA="Final" labelB="Lineart" />
      ) : (
        <div className={`tiles ${s2f ? "three" : "three"}`}>
          {tile("sketch", undefined, s2f ? "Sketch" : job.params.skip_stage1 ? "Lineart input" : "Sketch")}
          {tile("final", u.final_4k || u.final_2k, "Final")}
          {tile("lineart", u.lineart_4k || u.lineart_2k, s2f ? "Lineart (dari final)" : "Lineart")}
        </div>
      )}

      <div className="downloads">
        {dl("final_2k", "Final 2K")}{dl("final_4k", "Final 4K")}{dl("final", "Final 768")}
        {dl("lineart_2k", "Lineart 2K")}{dl("lineart_4k", "Lineart 4K")}{dl("lineart", "Lineart 768")}
        {dl("reference", "Referensi")}
      </div>

      {s2f && job.status === "done" && <LineartControls job={job} onChanged={onChanged} />}

      <div className="row">
        {running ? (
          <button className="btn danger" disabled={acting} onClick={() => act(async () => { await api.cancel(job.id); onChanged(); })}>Batalkan</button>
        ) : s2f ? (
          <button className="btn" disabled={acting || !job.files.sketch} onClick={() => derive("all")}>Generate ulang (seed baru)</button>
        ) : (
          <>
            <button className="btn" onClick={() => derive("stage2")} disabled={acting || !job.files.lineart}>Warnai ulang</button>
            <button className="btn" onClick={() => derive("all")} disabled={acting || !job.files.sketch}>Generate ulang semua</button>
            <button className="btn" disabled={acting} onClick={() => lineRef.current?.click()}>Upload lineart koreksi</button>
          </>
        )}
        {!running && <button className="btn ghost" disabled={acting} onClick={() => act(async () => { await api.remove(job.id); onChanged(); })}>Hapus</button>}
      </div>
      <input ref={lineRef} type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) derive("stage2", f); e.target.value = ""; }} />
      {err && <p className="error">{err}</p>}

      <details className="prompt-details">
        <summary>Prompt yang dipakai</summary>
        {s2f ? <div className="prompt">{job.params.prompt_s2f}</div> : <>
          {!job.params.skip_stage1 && <div className="prompt">{job.params.prompt_stage1}</div>}
          <div className="prompt">{job.params.prompt_stage2}</div>
        </>}
      </details>
      <Lightbox src={zoom} onClose={() => setZoom(null)} />
    </div>
  );
}

function LineartControls({ job, onChanged }: { job: Job; onChanged: () => void }) {
  const p = job.params;
  const [stroke, setStroke] = useState(p.stroke_px ?? 2.6);
  const [fills, setFills] = useState(!!p.lineart_fills);
  const [fromUp, setFromUp] = useState(!!p.lineart_from_upscaled);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  useEffect(() => { setStroke(p.stroke_px ?? 2.6); setFills(!!p.lineart_fills); setFromUp(!!p.lineart_from_upscaled); }, [job.id, p.stroke_px, p.lineart_fills, p.lineart_from_upscaled]);
  const changed = stroke !== (p.stroke_px ?? 2.6) || fills !== !!p.lineart_fills || fromUp !== !!p.lineart_from_upscaled;
  return (
    <div className="lineart-ctl">
      <strong>Lineart</strong>
      <label>Tebal garis <input type="range" min={1.5} max={4.5} step={0.1} value={stroke} onChange={(e) => setStroke(Number(e.target.value))} /> <b>{stroke.toFixed(1)}px</b></label>
      <label className="check"><input type="checkbox" checked={fills} onChange={(e) => setFills(e.target.checked)} /> Area gelap diisi hitam</label>
      <label className="check" title={p.sizes?.length ? "" : "Aktifkan output 2K/4K saat generate"}>
        <input type="checkbox" checked={fromUp} disabled={!p.sizes?.length} onChange={(e) => setFromUp(e.target.checked)} /> Ekstrak dari hasil upscale
      </label>
      <button className="btn small" disabled={busy || !changed} onClick={async () => {
        setBusy(true); setErr("");
        try { await api.relineart(job.id, { stroke_px: stroke, fills, from_upscaled: fromUp }); onChanged(); }
        catch (e) { setErr(errText(e)); } finally { setBusy(false); }
      }}>{busy ? "Mengekstrak…" : "Ekstrak ulang"}</button>
      {err && <span className="error">{err}</span>}
    </div>
  );
}
