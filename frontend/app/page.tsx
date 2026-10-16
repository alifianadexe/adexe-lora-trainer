"use client";
import Link from "next/link";
import { ArrowRight, BookOpen, Check, Cpu, FlaskConical, HardDrive, Images, LineChart, Sparkles, TriangleAlert } from "lucide-react";
import { useMemo } from "react";
import { Card, CardTitle, Progress, StatusBadge, cx } from "@/components/ui";
import { useApi, useCatalog } from "@/lib/hooks";
import { fmtNum, fmtTime, modelLabel } from "@/lib/format";
import type { DatasetSummary, Job, Status } from "@/lib/types";

export default function Dashboard() {
  const { data: st } = useApi<Status>("/api/status", 10000);
  const { data: jobs } = useApi<Job[]>("/api/jobs", 4000);
  const { data: ds } = useApi<DatasetSummary[]>("/api/datasets");
  const cat = useCatalog();
  const concept = useMemo(() => (cat ? cat.concepts[new Date().getDate() % cat.concepts.length] : null), [cat]);

  const at = st?.backends["ai-toolkit"];
  const sd = st?.backends["sd-scripts"];
  const running = jobs?.find((j) => j.status === "running");
  const done = jobs?.filter((j) => j.status === "completed").length ?? 0;
  const evaluated = jobs?.filter((j) => j.evaluations && Object.keys(j.evaluations).length).length ?? 0;

  const path = [
    { done: !!(at?.found || sd?.found), title: "Siapkan backend", desc: "Install ai-toolkit, atur path di Pengaturan.", href: "/settings/" },
    { done: (ds?.length ?? 0) > 0, title: "Kumpulkan & caption dataset", desc: "15–40 gambar bervariasi, caption yang disengaja.", href: "/datasets/" },
    { done: (jobs?.length ?? 0) > 0, title: "Training pertama", desc: "Pakai rekomendasi, baca alasannya.", href: "/train/" },
    { done: evaluated > 0, title: "Nilai checkpoint", desc: "Beri skor tiap checkpoint, temukan puncaknya.", href: "/jobs/" },
    { done: (jobs?.length ?? 0) > 1, title: "Iterasi & bandingkan", desc: "Ubah satu hal, bandingkan v1 vs v2.", href: "/compare/" },
  ];
  const progressPct = (path.filter((p) => p.done).length / path.length) * 100;

  return (
    <div className="space-y-6">
      {/* hero */}
      <div className="relative overflow-hidden rounded-3xl border border-white/[0.08] bg-gradient-to-br from-brand-600/25 via-ink-850 to-cyan-500/10 p-7 md:p-9 animate-fade-up">
        <div className="pointer-events-none absolute -right-16 -top-24 size-72 rounded-full bg-fuchsia-500/20 blur-3xl" />
        <div className="relative grid gap-8 md:grid-cols-[1.4fr_1fr] md:items-end">
          <div>
            <div className="chip mb-4 border-brand-400/30 text-brand-200"><Sparkles className="size-3" /> Qwen-Image 2.1 · Anima Base</div>
            <h1 className="text-3xl font-semibold leading-tight tracking-tight md:text-[40px]">
              Train LoRA, <span className="gradient-text">pahami setiap angkanya.</span>
            </h1>
            <p className="mt-3 max-w-xl text-[15px] leading-relaxed text-ink-300">
              Setiap parameter dijelaskan, setiap kurva loss dianalisis, dan setiap run ditutup dengan saran eksperimen berikutnya.
            </p>
            <div className="mt-6 flex flex-wrap gap-2.5">
              <Link href="/train/" className="btn btn-primary px-5 py-2.5"><Sparkles className="size-4" /> Mulai training</Link>
              <Link href="/learn/" className="btn px-5 py-2.5"><BookOpen className="size-4" /> Akademi LoRA</Link>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {[
              { icon: Images, label: "Dataset", value: ds?.length ?? "–" },
              { icon: LineChart, label: "Total run", value: jobs?.length ?? "–" },
              { icon: Check, label: "Selesai", value: done },
              { icon: FlaskConical, label: "Dievaluasi", value: evaluated },
            ].map(({ icon: Icon, label, value }) => (
              <div key={label} className="rounded-2xl border border-white/[0.07] bg-ink-950/40 p-4 backdrop-blur">
                <Icon className="mb-2 size-4 text-brand-300" />
                <div className="text-2xl font-semibold tabular-nums">{value}</div>
                <div className="text-xs text-ink-400">{label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {running && (
        <Link href={`/jobs/view/?id=${running.id}`} className="block">
          <Card hover className="border-sky-500/20">
            <div className="flex flex-wrap items-center gap-3">
              <StatusBadge status="running" />
              <span className="font-semibold">{running.name}</span>
              <span className="text-sm text-ink-400">{modelLabel(running.model)}</span>
              <span className="ml-auto text-sm tabular-nums text-ink-300">step {running.progress.step}/{running.progress.total} · loss {fmtNum(running.progress.loss)} · sisa {running.progress.eta || "–"}</span>
            </div>
            <Progress className="mt-3" value={100 * running.progress.step / Math.max(1, running.progress.total)} />
          </Card>
        </Link>
      )}

      <div className="grid gap-6 lg:grid-cols-[1.25fr_1fr]">
        <Card>
          <CardTitle icon={<FlaskConical className="size-4" />} sub="Siklus yang membuat kamu benar-benar paham LoRA" right={<span className="text-sm tabular-nums text-ink-400">{Math.round(progressPct)}%</span>}>
            Jalur belajar
          </CardTitle>
          <Progress value={progressPct} className="mb-5" />
          <ol className="space-y-1">
            {path.map((p, i) => (
              <li key={p.title}>
                <Link href={p.href} className="group flex items-center gap-3.5 rounded-xl p-2.5 transition hover:bg-white/[0.03]">
                  <div className={cx("grid size-8 shrink-0 place-items-center rounded-full border text-sm font-semibold",
                    p.done ? "border-emerald-400/40 bg-emerald-500/15 text-emerald-300" : "border-white/10 bg-white/5 text-ink-300")}>
                    {p.done ? <Check className="size-4" /> : i + 1}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className={cx("text-[14px] font-medium", p.done && "text-ink-300")}>{p.title}</div>
                    <div className="text-[12.5px] text-ink-400">{p.desc}</div>
                  </div>
                  <ArrowRight className="size-4 text-ink-400 opacity-0 transition group-hover:translate-x-0.5 group-hover:opacity-100" />
                </Link>
              </li>
            ))}
          </ol>
        </Card>

        <div className="space-y-6">
          {concept && (
            <Card className="border-brand-500/20 bg-gradient-to-br from-brand-500/[0.08] to-transparent">
              <div className="section-title mb-2">Konsep hari ini</div>
              <div className="text-lg font-semibold">{concept.term}</div>
              <div className="mt-1 text-sm text-brand-200">{concept.short}</div>
              <p className="mt-2.5 text-[13.5px] leading-relaxed text-ink-300">{concept.body}</p>
              <Link href="/learn/#konsep" className="mt-3 inline-flex items-center gap-1 text-sm text-brand-300 hover:underline">Semua konsep <ArrowRight className="size-3.5" /></Link>
            </Card>
          )}
          <Card>
            <CardTitle icon={<Cpu className="size-4" />}>Sistem</CardTitle>
            <div className="space-y-2.5 text-sm">
              {[["ai-toolkit", at, at?.found ? `Qwen 2.1 ${at.supports_qwen_image_2 ? "✓" : "✗"} · Anima ${at.supports_anima ? "✓" : "✗"}` : "belum ditemukan"],
                ["sd-scripts", sd, sd?.found ? "siap (Anima)" : "opsional"]].map(([name, b, txt]) => (
                <div key={name as string} className="flex items-center gap-2.5">
                  <span className={cx("size-2 rounded-full", (b as Status["backends"][string])?.found ? "bg-emerald-400" : "bg-amber-400")} />
                  <span className="font-medium">{name as string}</span>
                  <span className="text-ink-400">{txt as string}</span>
                </div>
              ))}
              {st?.gpus.length ? st.gpus.map((g) => (
                <div key={g.name} className="flex items-center gap-2.5"><span className="size-2 rounded-full bg-emerald-400" /><span className="font-medium">{g.name}</span><span className="text-ink-400">{Math.round(g.mem_total_mb / 1024)} GB · {g.temp}°C</span></div>
              )) : <div className="flex items-center gap-2 text-amber-200"><TriangleAlert className="size-4" />nvidia-smi tidak ditemukan</div>}
              <div className="flex items-center gap-2.5 text-ink-400"><HardDrive className="size-3.5" />disk kosong {st?.host.disk_free_gb ?? "–"} GB</div>
            </div>
          </Card>
        </div>
      </div>

      <Card>
        <CardTitle icon={<LineChart className="size-4" />} right={<Link href="/jobs/" className="btn btn-sm">Semua job</Link>}>Run terbaru</CardTitle>
        {jobs?.length ? (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {jobs.slice(0, 6).map((j) => (
              <Link key={j.id} href={`/jobs/view/?id=${j.id}`} className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-4 transition hover:border-brand-500/40 hover:bg-white/[0.04]">
                <div className="flex items-center justify-between gap-2"><span className="truncate font-medium">{j.name}</span><StatusBadge status={j.status} /></div>
                <div className="mt-1 text-xs text-ink-400">{modelLabel(j.model)} · rank {j.params.rank} · lr {fmtNum(j.params.lr)} · {fmtTime(j.created)}</div>
                <Progress className="mt-3 h-1.5" value={100 * j.progress.step / Math.max(1, j.progress.total)} />
              </Link>
            ))}
          </div>
        ) : <div className="py-8 text-center text-sm text-ink-400">Belum ada run. <Link href="/train/" className="text-brand-300 hover:underline">Buat yang pertama →</Link></div>}
      </Card>
    </div>
  );
}
