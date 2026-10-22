"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, Layers3, Palette, Sparkles } from "lucide-react";
import { api, Health, Job, Options } from "./api";
import { StudioView } from "./studio";
import { BatchView } from "./batch";
import { Gallery } from "./gallery";
import "./generation.css";

export function GenerationWorkspace({ view }: { view: "studio" | "batch" | "gallery" }) {
  const [options, setOptions] = useState<Options | null>(null);
  const [health, setHealth] = useState<Health | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const refresh = useCallback(async () => {
    try { setJobs(await api.jobs()); setError(""); }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  }, []);
  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const [o, h, j] = await Promise.all([api.options(), api.health(), api.jobs()]);
        if (alive) { setOptions(o); setHealth(h); setJobs(j); setError(""); }
      } catch (e) { if (alive) setError(e instanceof Error ? e.message : String(e)); }
    };
    load();
    const timer = setInterval(load, 5000);
    return () => { alive = false; clearInterval(timer); };
  }, []);
  const active = jobs.filter(j => j.status === "running" || j.status === "queued");
  const engine = health?.engine;
  const titles = { studio: "Dari sketsa, menjadi cerita.", batch: "Satu alur. Banyak karya.", gallery: "Ruang untuk setiap karya." };
  const descriptions = {
    studio: "Pilih karakter, arahkan adegan, lalu wujudkan panel final dan lineart dalam gaya yang kamu latih.",
    batch: "Susun banyak sketsa, sesuaikan detail per panel, dan biarkan antrean mengerjakannya berurutan.",
    gallery: "Temukan hasil terbaik, bandingkan detail, dan lanjutkan eksplorasi dari karya sebelumnya.",
  };
  return <div className="space-y-6 animate-fade-up">
    <section className="card relative overflow-hidden !p-6 md:!p-8">
      <div aria-hidden className="pointer-events-none absolute -right-16 -top-24 size-72 rounded-full bg-brand-500/[0.07] blur-3xl" />
      <div className="relative flex flex-wrap items-start justify-between gap-6">
        <div className="max-w-2xl">
          <div className="section-title mb-3 flex items-center gap-2"><Palette size={14} /> Adexe · Creative workspace</div>
          <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">{titles[view]}</h1>
          <p className="mt-3 max-w-xl text-sm leading-6 text-ink-300">{descriptions[view]}</p>
          <div className="mt-5 flex flex-wrap gap-2">
            <span className="chip"><Sparkles size={12} /> Sketch → Final</span>
            <span className="chip"><Layers3 size={12} /> Lineart · 2K · 4K</span>
            <Link href="/jobs/" className="chip hover:!text-brand-400">Training & evaluasi <ArrowRight size={12} /></Link>
          </div>
        </div>
        <div className="min-w-48 rounded-xl border border-[var(--stroke)] bg-ink-950/60 p-4 text-xs">
          <div className="mb-2 flex items-center gap-2 font-medium"><span className={`size-2 rounded-full ${engine?.state === "ready" ? "bg-emerald-500" : engine?.state === "error" ? "bg-rose-500" : "bg-ink-400"}`} />
            {engine?.state === "stopped" ? "Engine menyala saat diperlukan" : engine?.message || "Menghubungkan engine…"}</div>
          <div className="text-ink-400">{jobs.filter(j => j.status === "done").length} karya selesai · {active.length} dalam antrean</div>
          {engine && engine.state !== "stopped" && <button disabled={pending || active.length > 0} className="btn btn-sm mt-3 w-full" onClick={async () => {
            setPending(true);
            try { await api.stopEngine(); setHealth(await api.health()); } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
            finally { setPending(false); }
          }}>Lepaskan GPU untuk training</button>}
        </div>
      </div>
    </section>
    <div className="generation-studio">
      {error && <div role="alert" className="error banner">{error}</div>}
      {!options ? <div className="card empty">Menghubungkan studio…</div> : view === "studio" ?
        <StudioView options={options} jobs={jobs} onCreated={refresh} onChanged={refresh} /> : view === "batch" ?
        <BatchView options={options} onCreated={refresh} /> : <Gallery jobs={jobs} onChanged={refresh} />}
    </div>
  </div>;
}
