"use client";
import { Search, Stethoscope, Wrench } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { HelpButton } from "@/components/param-info";
import { Card, Loading, PageHeader, Segmented, cx } from "@/components/ui";
import { useCatalog } from "@/lib/hooks";

const SEV = {
  tinggi: "border-rose-500/30 text-rose-300",
  sedang: "border-amber-500/30 text-amber-300",
  rendah: "border-sky-500/30 text-sky-300",
};

export default function Mistakes() {
  const cat = useCatalog();
  const [q, setQ] = useState("");
  const [catg, setCatg] = useState("Semua");
  const [hash, setHash] = useState("");
  useEffect(() => {
    const h = () => setHash(window.location.hash.slice(1));
    h();
    window.addEventListener("hashchange", h);
    return () => window.removeEventListener("hashchange", h);
  }, []);
  useEffect(() => {
    if (hash && cat) document.getElementById(hash)?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [hash, cat]);
  const list = useMemo(
    () =>
      (cat?.mistakes || []).filter(
        (m) =>
          (catg === "Semua" || m.category === catg) &&
          (!q || `${m.title} ${m.symptoms.join(" ")} ${m.cause}`.toLowerCase().includes(q.toLowerCase())),
      ),
    [cat, q, catg],
  );
  if (!cat) return <Loading />;
  const cats = ["Semua", ...new Set(cat.mistakes.map((m) => m.category))];
  return (
    <div>
      <PageHeader
        title="Kesalahan Umum Training"
        subtitle="Mulai dari apa yang kamu LIHAT. Ketik gejalanya (misal “gosong”, “mirip dataset”, “NaN”) untuk menemukan penyebab dan solusinya."
      />
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <div className="relative min-w-[260px] flex-1">
          <Search className="absolute left-3 top-2.5 size-4 text-ink-400" />
          <input className="input pl-9" placeholder="Saya melihat… (gejala)" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <Segmented value={catg} onChange={setCatg} options={cats.map((c) => ({ value: c, label: c }))} />
      </div>
      <div className="grid gap-5 lg:grid-cols-2">
        {list.map((m) => (
          <Card
            key={m.id}
            id={m.id}
            className={cx("scroll-mt-24 transition", hash === m.id && "border-brand-400/60 ring-2 ring-brand-500/30")}
          >
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <span className="chip">{m.category}</span>
              <span className={cx("chip", SEV[m.severity])}>dampak {m.severity}</span>
            </div>
            <h3 className="text-lg font-semibold">{m.title}</h3>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <div>
                <div className="mb-1.5 flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-wider text-ink-400">
                  <Stethoscope className="size-3.5" />
                  Gejala
                </div>
                <ul className="space-y-1 text-[13.5px] text-ink-200">
                  {m.symptoms.map((s) => (
                    <li key={s}>• {s}</li>
                  ))}
                </ul>
              </div>
              <div>
                <div className="mb-1.5 flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-wider text-emerald-400/80">
                  <Wrench className="size-3.5" />
                  Solusi
                </div>
                <ul className="space-y-1 text-[13.5px] text-emerald-100/90">
                  {m.fix.map((s) => (
                    <li key={s}>→ {s}</li>
                  ))}
                </ul>
              </div>
            </div>
            <div className="mt-4 rounded-xl border border-white/[0.06] bg-white/[0.02] p-3 text-[13.5px] text-ink-300">
              <b className="text-ink-100">Kenapa terjadi: </b>
              {m.cause}
            </div>
            {m.params.length > 0 && (
              <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-ink-400">
                Parameter terkait:
                {m.params.map((p) => (
                  <span key={p} className="chip gap-1.5">
                    {cat.params.find((x) => x.key === p)?.label || p}
                    <HelpButton k={p} />
                  </span>
                ))}
              </div>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}
