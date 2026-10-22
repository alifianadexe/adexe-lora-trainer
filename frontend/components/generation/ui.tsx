"use client";
import { url } from "@/lib/api";

import { useEffect, useRef, useState } from "react";
import type { Appearance, Job } from "./api";

export const ACCEPT = "image/png,image/jpeg,image/webp";
const MAX = 20 * 1024 * 1024;

export function validImage(f: File) {
  if (!/^image\/(png|jpeg|webp)$/.test(f.type)) return "Pilih gambar PNG, JPG, atau WebP.";
  if (f.size > MAX) return "Ukuran gambar maksimal 20 MB.";
  return "";
}

/** Drag-and-drop / click upload. multiple=true returns every valid file. */
export function Dropzone({ onFiles, multiple = false, preview, title, hint }: {
  onFiles: (files: File[]) => void; multiple?: boolean; preview?: string; title: string; hint?: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [error, setError] = useState("");
  const take = (list: FileList | null) => {
    const all = Array.from(list || []);
    const invalid = all.filter(f => validImage(f));
    setError(invalid.length ? `${invalid.length} file dilewati: ${validImage(invalid[0])}` : "");
    const files = all.filter((f) => !validImage(f));
    if (files.length) onFiles(multiple ? files : files.slice(0, 1));
  };
  return (
    <>
      <div
        className={`drop ${over ? "over" : ""} ${preview ? "has" : ""}`}
        role="button" tabIndex={0} aria-label={title}
        onClick={() => ref.current?.click()}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); ref.current?.click(); } }}
        onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); take(e.dataTransfer.files); }}
      >
        {preview ? <img src={preview} alt="pratinjau" /> : (
          <div className="drop-empty">
            <span className="drop-icon">↥</span>
            <strong>{title}</strong>
            <span>{hint || "Tarik ke sini atau klik untuk memilih"}</span>
            <small>PNG, JPG, WebP · maks. 20 MB{multiple ? " per file" : ""}</small>
          </div>
        )}
      </div>
      {error && <p role="alert" className="error">{error}</p>}
      <input ref={ref} type="file" accept={ACCEPT} multiple={multiple} hidden onChange={(e) => { take(e.target.files); e.target.value = ""; }} />
    </>
  );
}

/** Ordered multi-select of characters (order = left to right in the panel). */
export function CharacterPicker({ table, value, onChange, max = 4, compact = false }: {
  table: Record<string, Appearance>; value: string[]; onChange: (v: string[]) => void; max?: number; compact?: boolean;
}) {
  const toggle = (c: string) => onChange(value.includes(c) ? value.filter((x) => x !== c) : value.length >= max ? value : [...value, c]);
  return (
    <div className={`chars ${compact ? "compact" : ""}`}>
      {Object.entries(table).map(([c, a]) => {
        const i = value.indexOf(c);
        return (
          <button key={c} type="button" title={a.caption} aria-pressed={i >= 0}
            disabled={i < 0 && value.length >= max} className={`char ${i >= 0 ? "on" : ""}`} onClick={() => toggle(c)}>
            {!compact && <img src={url(`/api/generate/characters/${encodeURIComponent(c)}/face`)} alt="" loading="lazy" />}
            <span>{i >= 0 && <b>{i + 1}</b>}{c}</span>
          </button>
        );
      })}
    </div>
  );
}

export function Lightbox({ src, alt, onClose }: { src: string | null; alt?: string; onClose: () => void }) {
  useEffect(() => {
    if (!src) return;
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [src, onClose]);
  if (!src) return null;
  return (
    <div className="lightbox" role="dialog" aria-label="Gambar ukuran penuh" onClick={onClose}>
      <img src={src} alt={alt || ""} onClick={(e) => e.stopPropagation()} />
      <button className="btn ghost lb-close" onClick={onClose} aria-label="Tutup">✕</button>
    </div>
  );
}

/** Before/after slider: left = a, right = b. */
export function CompareSlider({ a, b, labelA, labelB }: { a: string; b: string; labelA: string; labelB: string }) {
  const [pos, setPos] = useState(50);
  return (
    <div className="compare">
      <img src={b} alt={labelB} />
      <div className="compare-top" style={{ clipPath: `inset(0 ${100 - pos}% 0 0)` }}><img src={a} alt={labelA} /></div>
      <div className="compare-line" style={{ left: `${pos}%` }} />
      <span className="compare-tag left">{labelA}</span><span className="compare-tag right">{labelB}</span>
      <input type="range" min={0} max={100} value={pos} onChange={(e) => setPos(Number(e.target.value))} aria-label="Geser perbandingan" />
    </div>
  );
}

export function statusLabel(j: Job) {
  switch (j.status) {
    case "queued": return j.queue_position ? `Antrean #${j.queue_position}` : "Antrean";
    case "running": return j.total ? `${stageName(j.stage)} ${j.step}/${j.total}` : stageName(j.stage);
    case "done": return "Selesai";
    case "error": return "Gagal";
    default: return "Dibatalkan";
  }
}

export function stageName(s: string) {
  return ({ s2f: "Generate", stage1: "Lineart", stage2: "Warna", upscale: "Upscale", lineart: "Ekstrak lineart",
    waiting_engine: "Menunggu engine", queued: "Antrean", done: "Selesai" } as Record<string, string>)[s] || s;
}

export function Pill({ job }: { job: Job }) {
  return <span className={`pill ${job.status}`}>{statusLabel(job)}</span>;
}

export function Progress({ job }: { job: Job }) {
  const pct = job.status === "done" ? 100 : job.total ? Math.round((job.step / job.total) * 100) : job.status === "running" ? 8 : 0;
  return <div className={`bar ${job.status}`}><div style={{ width: `${pct}%` }} /></div>;
}

export function errText(e: unknown) {
  return e instanceof Error ? e.message : String(e);
}
