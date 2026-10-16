"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { GitCompareArrows, LineChart, Plus } from "lucide-react";
import { useState } from "react";
import { Card, Empty, Loading, PageHeader, Progress, StatusBadge, cx } from "@/components/ui";
import { fmtNum, fmtTime, modelLabel } from "@/lib/format";
import { useApi } from "@/lib/hooks";
import type { Job } from "@/lib/types";

export default function JobsPage() {
  const { data, loading } = useApi<Job[]>("/api/jobs", 3000);
  const [sel, setSel] = useState<string[]>([]);
  const router = useRouter();
  const toggle = (id: string) => setSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id].slice(-6)));
  return (
    <div>
      <PageHeader title="Jobs & Monitor" subtitle="Semua eksperimenmu. Centang 2+ run untuk membandingkan parameter, kurva loss, dan hasil evaluasinya."
        actions={<>
          <button className="btn" disabled={sel.length < 2} onClick={() => router.push(`/compare/?ids=${sel.join(",")}`)}><GitCompareArrows className="size-4" />Bandingkan ({sel.length})</button>
          <Link href="/train/" className="btn btn-primary"><Plus className="size-4" />Training baru</Link>
        </>} />
      {loading ? <Loading /> : !data?.length ? (
        <Card><Empty icon={<LineChart className="size-5" />} title="Belum ada job">Buat training pertamamu dari halaman Training Baru.</Empty></Card>
      ) : (
        <Card className="overflow-x-auto p-0">
          <table className="w-full min-w-[900px] text-left text-[13.5px]">
            <thead className="border-b border-white/[0.07] text-[11.5px] uppercase tracking-wider text-ink-400">
              <tr>{["", "Run", "Model", "Rank", "LR", "Steps", "Progress", "Evaluasi", "Status", "Dibuat"].map((h) => <th key={h} className="px-4 py-3 font-medium">{h}</th>)}</tr>
            </thead>
            <tbody>
              {data.map((j) => {
                const evs = Object.keys(j.evaluations || {}).length;
                return (
                  <tr key={j.id} className={cx("cursor-pointer border-b border-white/[0.04] transition hover:bg-white/[0.03]", sel.includes(j.id) && "bg-brand-500/[0.06]")}
                    onClick={() => router.push(`/jobs/view/?id=${j.id}`)}>
                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}><input type="checkbox" className="accent-violet-500" checked={sel.includes(j.id)} onChange={() => toggle(j.id)} /></td>
                    <td className="px-4 py-3"><div className="font-medium">{j.name}</div>{j.notes && <div className="max-w-[260px] truncate text-xs text-ink-400">{j.notes}</div>}</td>
                    <td className="px-4 py-3">{modelLabel(j.model)}<div className="text-xs text-ink-400">{j.dataset}</div></td>
                    <td className="px-4 py-3 tabular-nums">{j.params.rank}</td>
                    <td className="px-4 py-3 font-mono text-xs">{fmtNum(j.params.lr)}</td>
                    <td className="px-4 py-3 tabular-nums">{j.params.steps}</td>
                    <td className="w-44 px-4 py-3"><Progress value={100 * j.progress.step / Math.max(1, j.progress.total)} className="h-1.5" />
                      <div className="mt-1 text-xs tabular-nums text-ink-400">{j.progress.step}/{j.progress.total}{j.progress.loss != null && ` · ${fmtNum(j.progress.loss)}`}</div></td>
                    <td className="px-4 py-3 text-xs text-ink-400">{evs ? `${evs} checkpoint` : "–"}</td>
                    <td className="px-4 py-3"><StatusBadge status={j.status} /></td>
                    <td className="px-4 py-3 text-xs text-ink-400">{fmtTime(j.created)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
