"use client";
import Link from "next/link";
import { useState } from "react";
import { ArrowRight, ArrowUpRight, Box, GitBranch, Layers, Sparkles } from "lucide-react";
import { Card, CardTitle, PageHeader, Tabs, Loading, Callout } from "@/components/ui";
import { useApi } from "@/lib/hooks";
import type { ModelSpec } from "@/lib/types";
type Guide = { id: string; title: string; tag: string; effort: string; summary: string; steps: string[]; source: string };
type Flow = { id: string; title: string; status: string; nodes: string[]; why: string; data: string[]; evaluate: string[] };
type Catalog = {
  models: (ModelSpec & { source?: string })[];
  training_modes: Guide[];
  workflows: Flow[];
  researched_at: string;
  editing_reference: { label: string; source: string; status: string };
};
export default function Models() {
  const { data: c } = useApi<Catalog>("/api/model-lab");
  const [tab, setTab] = useState("models");
  const [mode, setMode] = useState("lora");
  const [flow, setFlow] = useState("two_stage");
  if (!c) return <Loading />;
  const guide = c.training_modes.find((x) => x.id === mode)!;
  const workflow = c.workflows.find((x) => x.id === flow)!;
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="MODEL LAB / EXPLORE WITH INTENT"
        title="Pilih alat. Pahami tujuannya."
        subtitle="Mulai dari hasil yang ingin dibuat, lalu cocokkan model, data, dan cara training."
      />
      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { id: "models", label: "Pilihan model" },
          { id: "methods", label: "Cara melatih" },
          { id: "workflow", label: "Sketch → final" },
        ]}
      />
      {tab === "models" && (
        <>
          <div className="grid gap-5 lg:grid-cols-2">
            {c.models.map((m, i) => (
              <Card key={m.id} className="model-card">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="section-title mb-2">{m.vendor}</div>
                    <h2 className="text-xl font-semibold">{m.label}</h2>
                  </div>
                  <div className="rounded-xl bg-brand-500/10 p-3 text-brand-400">
                    <Box size={24} />
                  </div>
                </div>
                <p className="mt-4 text-sm leading-6 text-ink-400">{m.arch[0]}</p>
                <div className="my-4 flex flex-wrap gap-2">
                  <span className="chip">LoRA</span>
                  <span className="chip">
                    {m.id === "anima" ? "Anime / ilustrasi" : m.id === "zimage" ? "Generasi gambar" : "Generasi + editing via config"}
                  </span>
                  <span className="chip">{m.id === "qwen_image_2" ? "Dipakai proyek kita" : "Preset tersedia · belum dibenchmark"}</span>
                </div>
                <details className="mb-5 rounded-xl bg-ink-950 p-3 text-sm">
                  <summary>Catatan model & caption</summary>
                  <p className="mt-3 text-xs leading-6 text-ink-400">{m.caption_hint}</p>
                  <ul className="mt-3 space-y-2 text-xs leading-6 text-ink-300">
                    {m.notes.slice(0, 3).map((n) => (
                      <li key={n}>{n}</li>
                    ))}
                  </ul>
                  <p className="mt-3 text-xs text-ink-400">Lisensi model: {m.license}</p>
                </details>
                <div className="flex flex-wrap gap-3">
                  <Link className="btn btn-primary" href={`/train/?model=${m.id}`}>
                    Siapkan LoRA
                    <ArrowRight size={15} />
                  </Link>
                  <a className="btn" href={m.source || `https://huggingface.co/${m.hf}`} target="_blank" rel="noreferrer">
                    Sumber model
                    <ArrowUpRight size={15} />
                  </a>
                </div>
              </Card>
            ))}
          </div>
          <Callout>
            Preset baru menyiapkan config; bobot model belum diunduh dan performa training belum diuji di PC ini. Dukungan editing
            membutuhkan data control yang sesuai, bukan hanya gambar final.
          </Callout>
          <p className="text-xs text-ink-400">
            Riset diperbarui {c.researched_at} · rujukan primer dari pembuat model dan dokumentasi backend.
          </p>
        </>
      )}
      {tab === "methods" && (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {c.training_modes.map((m) => (
              <button
                key={m.id}
                onClick={() => setMode(m.id)}
                className={`card text-left transition ${mode === m.id ? "border-brand-400 ring-1 ring-brand-400/30" : "hover:border-brand-400/40"}`}
              >
                <span className="section-title">{m.tag}</span>
                <h2 className="mt-3 font-semibold">{m.title}</h2>
                <p className="mt-2 text-xs leading-5 text-ink-400">{m.effort}</p>
              </button>
            ))}
          </div>
          <Card>
            <CardTitle icon={<Layers size={18} />} sub={guide.tag}>
              {guide.title}
            </CardTitle>
            <p className="max-w-3xl text-sm leading-7 text-ink-300">{guide.summary}</p>
            <div className="mt-6 grid gap-4 md:grid-cols-3">
              {guide.steps.map((s, i) => (
                <div key={s} className="pipeline-node">
                  <span className="font-mono text-xs text-brand-400">0{i + 1}</span>
                  <p className="mt-3 text-sm leading-6">{s}</p>
                </div>
              ))}
            </div>
            <a href={guide.source} target="_blank" rel="noreferrer" className="btn mt-5">
              Baca sumber
              <ArrowUpRight size={15} />
            </a>
            {mode === "lora" ? (
              <Link href="/train/" className="btn btn-primary ml-3 mt-5">
                Siapkan eksperimen
                <ArrowRight size={15} />
              </Link>
            ) : mode === "full" ? (
              <Link href="/workspace/" className="btn ml-3 mt-5">
                Impor config backend
              </Link>
            ) : null}
          </Card>
          {mode === "moe" && (
            <Callout title="LoRA expert ≠ MoE baru">
              Melatih adapter untuk expert yang sudah ada berbeda dari membuat arsitektur MoE. Router, pembagian data, dan evaluasi routing
              perlu dirancang serta didukung trainer.
            </Callout>
          )}
        </>
      )}
      {tab === "workflow" && (
        <>
          <div className="flex flex-wrap gap-3">
            {c.workflows.map((f) => (
              <button className={`btn ${flow === f.id ? "btn-primary" : ""}`} key={f.id} onClick={() => setFlow(f.id)}>
                {f.title}
              </button>
            ))}
          </div>
          <div className="hero-workspace p-6 md:p-8">
            <span className="chip">{workflow.status}</span>
            <h2 className="mt-4 text-2xl font-semibold">{workflow.title}</h2>
            <div className="my-7 flex flex-col items-stretch gap-3 md:flex-row md:items-center">
              {workflow.nodes.map((n, i) => (
                <div className="contents" key={n}>
                  <div className="pipeline-node flex-1 text-center text-sm font-medium">{n}</div>
                  {i < workflow.nodes.length - 1 && <ArrowRight className="shrink-0 self-center text-brand-400" size={20} />}
                </div>
              ))}
            </div>
            <p className="max-w-3xl text-sm leading-7 text-ink-300">{workflow.why}</p>
          </div>
          <div className="grid gap-6 md:grid-cols-2">
            <Card>
              <CardTitle icon={<GitBranch size={18} />}>Data yang dibutuhkan</CardTitle>
              <ul className="space-y-4 text-sm leading-7 text-ink-300">
                {workflow.data.map((d) => (
                  <li key={d} className="flex gap-3">
                    <span className="mt-2.5 size-1.5 shrink-0 rounded-full bg-brand-400" />
                    {d}
                  </li>
                ))}
              </ul>
              <Link href="/workspace/" className="btn mt-5">
                Buka dataset proyek
                <ArrowRight size={15} />
              </Link>
            </Card>
            <Card>
              <CardTitle icon={<Sparkles size={18} />}>Apa yang dinilai?</CardTitle>
              <div className="flex flex-wrap gap-2">
                {workflow.evaluate.map((v) => (
                  <span className="chip" key={v}>
                    {v}
                  </span>
                ))}
              </div>
              <details className="mt-6 text-sm">
                <summary>Contoh struktur prompt</summary>
                <div className="mt-3 rounded-xl bg-ink-950 p-4 text-xs leading-7">
                  Instruksi transformasi + identitas/referensi + aksi + ekspresi + detail akhir yang diinginkan. Contoh: Reni berdiri
                  memegang buku, tersenyum kecil, seragam sekolah, pertahankan pose dari sketch.
                </div>
              </details>
              <p className="mt-5 text-xs leading-6 text-ink-400">
                Untuk eksperimen langsung, gunakan pasangan sketch/final dari panel yang sama. Studio menyediakan panduan dan impor config;
                dataset eksperimen langsung belum dibuat otomatis.
              </p>
            </Card>
          </div>
          {flow === "direct" && (
            <Card>
              <CardTitle sub={c.editing_reference.status}>Rujukan model editing tambahan</CardTitle>
              <a className="btn" href={c.editing_reference.source} target="_blank" rel="noreferrer">
                {c.editing_reference.label}
                <ArrowUpRight size={15} />
              </a>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
