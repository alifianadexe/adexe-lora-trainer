"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { GitCompareArrows, Star } from "lucide-react";
import { Suspense, useMemo } from "react";
import { MultiLossChart, SERIES_COLORS } from "@/components/charts";
import { HelpButton } from "@/components/param-info";
import { Callout, Card, CardTitle, Empty, Loading, PageHeader, StatusBadge, cx } from "@/components/ui";
import { fmtNum, fmtValue, modelLabel } from "@/lib/format";
import { useApi, useCatalog } from "@/lib/hooks";
import type { CompareRow, Job } from "@/lib/types";

function Compare() {
  const ids = useSearchParams().get("ids") || "";
  const router = useRouter();
  const cat = useCatalog();
  const { data: jobs } = useApi<Job[]>("/api/jobs");
  const { data: rows, loading } = useApi<CompareRow[]>(ids ? `/api/compare?ids=${ids}` : null);
  const sel = ids.split(",").filter(Boolean);
  const toggle = (id: string) => {
    const n = sel.includes(id) ? sel.filter((x) => x !== id) : [...sel, id].slice(-6);
    router.replace(`/compare/?ids=${n.join(",")}`);
  };

  const diff = useMemo(() => {
    if (!rows || !cat) return [];
    return cat.params.filter((p) => {
      const vals = rows.map((r) => JSON.stringify(r.params[p.key]));
      return vals.some((v) => v !== vals[0]);
    });
  }, [rows, cat]);

  return (
    <div>
      <PageHeader title="Bandingkan eksperimen" subtitle="Inti belajar LoRA: ubah satu hal, lalu lihat apa bedanya. Halaman ini menyorot parameter yang berbeda dan menumpuk kurva loss tiap run." />
      <Card className="mb-6">
        <div className="section-title mb-3">Pilih run (maks 6)</div>
        <div className="flex flex-wrap gap-2">
          {jobs?.map((j) => (
            <button key={j.id} onClick={() => toggle(j.id)} className={cx("chip px-3 py-1 text-[12.5px] transition", sel.includes(j.id) ? "border-brand-400/60 bg-brand-500/20 text-white" : "hover:text-white")}>
              {sel.includes(j.id) && <span className="size-2 rounded-full" style={{ background: SERIES_COLORS[sel.indexOf(j.id) % SERIES_COLORS.length] }} />}
              {j.name}
            </button>
          ))}
        </div>
      </Card>
      {sel.length < 2 ? <Card><Empty icon={<GitCompareArrows className="size-5" />} title="Pilih minimal 2 run">Tips: buat run v2 lewat tombol &quot;Iterasi&quot; di halaman job, ubah satu parameter, lalu bandingkan di sini.</Empty></Card>
        : loading || !rows || !cat ? <Loading /> : (
          <div className="space-y-6">
            <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(${rows.length}, minmax(0, 1fr))` }}>
              {rows.map((r, i) => (
                <Link key={r.id} href={`/jobs/view/?id=${r.id}`} className="card card-hover border-t-2 p-4" style={{ borderTopColor: SERIES_COLORS[i % SERIES_COLORS.length] }}>
                  <div className="flex items-center justify-between gap-2"><span className="truncate font-semibold">{r.name}</span><StatusBadge status={r.status} /></div>
                  <div className="mt-1 text-xs text-ink-400">{modelLabel(r.model)} · {r.dataset}</div>
                  {r.notes && <div className="mt-2 line-clamp-3 text-[12.5px] text-ink-300">📝 {r.notes}</div>}
                  {r.advice.best_step != null && <div className="mt-2 flex items-center gap-1 text-xs text-emerald-300"><Star className="size-3 fill-current" />terbaik: step {r.advice.best_step}</div>}
                </Link>
              ))}
            </div>

            <Card>
              <CardTitle sub={`${diff.length} parameter berbeda. Jika lebih dari satu, sulit memastikan mana yang menyebabkan perbedaan hasil.`}>Perbedaan parameter</CardTitle>
              {diff.length > 2 && <Callout level="warn" className="mb-4">Run ini berbeda di {diff.length} parameter. Untuk eksperimen yang bersih, ubah satu hal per run.</Callout>}
              {diff.length ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-[13.5px]">
                    <thead><tr className="border-b border-white/[0.07] text-left text-[11.5px] uppercase tracking-wider text-ink-400"><th className="py-2.5 pr-4">Parameter</th>{rows.map((r) => <th key={r.id} className="px-3 py-2.5">{r.name}</th>)}</tr></thead>
                    <tbody>{diff.map((p) => (
                      <tr key={p.key} className="border-b border-white/[0.04]">
                        <td className="py-2.5 pr-4"><span className="inline-flex items-center gap-1.5">{p.label}<HelpButton k={p.key} /></span></td>
                        {rows.map((r) => <td key={r.id} className="px-3 py-2.5 font-mono text-xs text-amber-200">{fmtValue(r.params[p.key])}</td>)}
                      </tr>
                    ))}</tbody>
                  </table>
                </div>
              ) : <p className="text-sm text-ink-400">Semua parameter sama.</p>}
            </Card>

            <Card>
              <CardTitle sub="Rata-rata bergerak (EMA) tiap run. Ingat: kurva lebih rendah belum tentu LoRA lebih bagus.">Kurva loss</CardTitle>
              <MultiLossChart runs={rows.map((r) => ({ name: r.name, series: r.series }))} />
            </Card>

            <Card>
              <CardTitle>Ringkasan angka</CardTitle>
              <div className="overflow-x-auto">
                <table className="w-full text-[13.5px]">
                  <thead><tr className="border-b border-white/[0.07] text-left text-[11.5px] uppercase tracking-wider text-ink-400"><th className="py-2.5 pr-4">Metrik</th>{rows.map((r) => <th key={r.id} className="px-3 py-2.5">{r.name}</th>)}</tr></thead>
                  <tbody>
                    {([
                      ["Loss EMA akhir", (r: CompareRow) => fmtNum(r.loss.last_ema)],
                      ["Perubahan loss", (r: CompareRow) => (r.loss.change_pct != null ? `${r.loss.change_pct.toFixed(1)}%` : "–")],
                      ["Step selesai", (r: CompareRow) => `${r.progress.step}/${r.progress.total}`],
                      ["Checkpoint dinilai", (r: CompareRow) => Object.keys(r.evaluations).length],
                      ["Checkpoint terbaik", (r: CompareRow) => r.advice.best_step ?? "–"],
                      ["Skor terbaik", (r: CompareRow) => r.advice.best ? `${r.advice.best.likeness ?? "-"}/${r.advice.best.flexibility ?? "-"}/${r.advice.best.quality ?? "-"}` : "–"],
                    ] as [string, (r: CompareRow) => React.ReactNode][]).map(([k, f]) => (
                      <tr key={k} className="border-b border-white/[0.04]"><td className="py-2.5 pr-4 text-ink-300">{k}</td>{rows.map((r) => <td key={r.id} className="px-3 py-2.5 tabular-nums">{f(r)}</td>)}</tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="mt-3 text-xs text-ink-400">Skor = kemiripan / fleksibilitas / kualitas (1–5) dari tab Evaluasi.</p>
            </Card>
          </div>
        )}
    </div>
  );
}

export default function Page() {
  return <Suspense fallback={<Loading />}><Compare /></Suspense>;
}
