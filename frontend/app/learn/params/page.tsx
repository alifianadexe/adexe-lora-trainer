"use client";
import { useRouter, useSearchParams } from "next/navigation";
import { Search } from "lucide-react";
import { Suspense, useMemo, useState } from "react";
import { ParamDetail } from "@/components/param-info";
import { Card, LevelChip, Loading, PageHeader, Segmented, cx } from "@/components/ui";
import { useCatalog } from "@/lib/hooks";

function Params() {
  const cat = useCatalog();
  const sp = useSearchParams();
  const router = useRouter();
  const [q, setQ] = useState("");
  const [level, setLevel] = useState("semua");
  const key = sp.get("key");
  const list = useMemo(() => (cat?.params || []).filter((p) =>
    (level === "semua" || p.level === level) &&
    (!q || `${p.label} ${p.key} ${p.what} ${p.group}`.toLowerCase().includes(q.toLowerCase()))), [cat, q, level]);
  if (!cat) return <Loading />;
  const sel = cat.params.find((p) => p.key === key) || list[0];
  const groups = [...new Set(list.map((p) => p.group))];
  return (
    <div>
      <PageHeader title="Ensiklopedia Parameter" subtitle="Setiap parameter: apa fungsinya, analogi, rumus, gejala jika terlalu tinggi/rendah, saran per model, dan kesalahan yang sering terjadi." />
      <div className="grid gap-6 lg:grid-cols-[340px_1fr]">
        <div className="space-y-3 lg:sticky lg:top-6 lg:max-h-[calc(100vh-3rem)] lg:self-start lg:overflow-y-auto lg:pr-1">
          <div className="relative"><Search className="absolute left-3 top-2.5 size-4 text-ink-400" /><input className="input pl-9" placeholder="Cari parameter…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
          <Segmented value={level} onChange={setLevel} options={[{ value: "semua", label: "Semua" }, { value: "pemula", label: "Pemula" }, { value: "menengah", label: "Menengah" }, { value: "lanjut", label: "Lanjut" }]} />
          {groups.map((g) => (
            <div key={g}>
              <div className="section-title mb-1.5 mt-3 px-1">{g}</div>
              {list.filter((p) => p.group === g).map((p) => (
                <button key={p.key} onClick={() => router.replace(`/learn/params/?key=${p.key}`, { scroll: false })}
                  className={cx("flex w-full items-center justify-between gap-2 rounded-xl px-3 py-2 text-left text-[13.5px] transition",
                    sel?.key === p.key ? "bg-brand-500/15 text-white" : "text-ink-300 hover:bg-white/[0.04]")}>
                  <span>{p.label}</span><LevelChip level={p.level} />
                </button>
              ))}
            </div>
          ))}
        </div>
        <Card className="min-h-[500px] p-6 md:p-8">{sel ? <ParamDetail key={sel.key} p={sel} cat={cat} /> : <div className="text-ink-400">Tidak ditemukan.</div>}</Card>
      </div>
    </div>
  );
}

export default function Page() {
  return <Suspense fallback={<Loading />}><Params /></Suspense>;
}
