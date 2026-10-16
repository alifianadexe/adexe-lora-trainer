"use client";
import Link from "next/link";
import { ArrowDown, ArrowUp, BookOpen, FlaskConical, HelpCircle, Lightbulb, Sigma, TriangleAlert, X } from "lucide-react";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useCatalog } from "@/lib/hooks";
import type { Catalog, Param } from "@/lib/types";
import { LevelChip, cx } from "./ui";

const Ctx = createContext<(key: string) => void>(() => {});
export const useParamInfo = () => useContext(Ctx);

export function ParamInfoProvider({ children }: { children: ReactNode }) {
  const [key, setKey] = useState<string | null>(null);
  const cat = useCatalog();
  useEffect(() => {
    if (!key) return;
    const k = (e: KeyboardEvent) => e.key === "Escape" && setKey(null);
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [key]);
  const p = cat && key ? cat.params.find((x) => x.key === key) : null;
  return (
    <Ctx.Provider value={setKey}>
      {children}
      <div
        className={cx("fixed inset-0 z-40 bg-black/50 backdrop-blur-[2px] transition", p ? "opacity-100" : "pointer-events-none opacity-0")}
        onClick={() => setKey(null)}
      />
      <aside
        className={cx(
          "fixed right-0 top-0 z-50 h-full w-full max-w-[460px] overflow-y-auto border-l border-white/10 bg-ink-900/95 p-6 shadow-2xl backdrop-blur-xl transition-transform duration-300",
          p ? "translate-x-0" : "translate-x-full",
        )}
      >
        {p && cat && <ParamDetail p={p} cat={cat} onClose={() => setKey(null)} compact />}
      </aside>
    </Ctx.Provider>
  );
}

export function HelpButton({ k }: { k: string }) {
  const open = useParamInfo();
  return (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        open(k);
      }}
      title="Pelajari parameter ini"
      className="inline-grid size-[18px] place-items-center rounded-full border border-white/15 bg-white/5 text-ink-400 transition hover:border-brand-400 hover:bg-brand-500 hover:text-white"
    >
      <HelpCircle className="size-3" />
    </button>
  );
}

function Block({ icon, title, children, tone = "" }: { icon: ReactNode; title: string; children: ReactNode; tone?: string }) {
  return (
    <div className={cx("rounded-xl border border-white/[0.07] bg-white/[0.02] p-3.5", tone)}>
      <div className="mb-1.5 flex items-center gap-2 text-[12px] font-semibold uppercase tracking-wider text-ink-400">
        {icon}
        {title}
      </div>
      <div className="text-[13.5px] leading-relaxed text-ink-100">{children}</div>
    </div>
  );
}

export function ParamDetail({ p, cat, onClose, compact }: { p: Param; cat: Catalog; onClose?: () => void; compact?: boolean }) {
  const mistakes = (p.mistakes || []).map((id) => cat.mistakes.find((m) => m.id === id)).filter(Boolean);
  return (
    <div className="space-y-3.5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="mb-2 flex flex-wrap gap-1.5">
            <span className="chip">{p.group}</span>
            <LevelChip level={p.level} />
            {p.only_backend && <span className="chip">{p.only_backend}</span>}
          </div>
          <h2 className="text-xl font-semibold">{p.label}</h2>
          <code className="text-xs text-ink-400">{p.key}</code>
        </div>
        {onClose && (
          <button onClick={onClose} className="rounded-lg p-1.5 text-ink-400 hover:bg-white/5 hover:text-white">
            <X className="size-4" />
          </button>
        )}
      </div>
      <p className="text-[15px] leading-relaxed text-ink-100">{p.what}</p>
      {p.analogy && (
        <Block icon={<Lightbulb className="size-3.5 text-amber-300" />} title="Analogi" tone="bg-amber-500/[0.04] border-amber-500/15">
          {p.analogy}
        </Block>
      )}
      {p.formula && (
        <Block icon={<Sigma className="size-3.5 text-cyan-300" />} title="Rumus">
          <code className="font-mono text-cyan-200">{p.formula}</code>
        </Block>
      )}
      <div className={cx("grid gap-3", !compact && "md:grid-cols-2")}>
        {p.up && p.up !== "-" && (
          <Block icon={<ArrowUp className="size-3.5 text-rose-300" />} title="Jika dinaikkan">
            {p.up}
            {!!p.too_high?.length && (
              <ul className="mt-2 list-disc space-y-0.5 pl-4 text-ink-300">
                {p.too_high.map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ul>
            )}
          </Block>
        )}
        {p.down && p.down !== "-" && (
          <Block icon={<ArrowDown className="size-3.5 text-sky-300" />} title="Jika diturunkan">
            {p.down}
            {!!p.too_low?.length && (
              <ul className="mt-2 list-disc space-y-0.5 pl-4 text-ink-300">
                {p.too_low.map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ul>
            )}
          </Block>
        )}
      </div>
      {p.tip && (
        <Block
          icon={<FlaskConical className="size-3.5 text-emerald-300" />}
          title="Saran"
          tone="bg-emerald-500/[0.04] border-emerald-500/15"
        >
          {p.tip}
        </Block>
      )}
      {p.per_model && (
        <Block icon={<BookOpen className="size-3.5 text-brand-300" />} title="Per model">
          <div className="space-y-2">
            {Object.entries(p.per_model).map(([m, t]) => (
              <div key={m}>
                <span className="font-semibold text-brand-300">{cat.models[m]?.label || m}: </span>
                {t}
              </div>
            ))}
          </div>
        </Block>
      )}
      {mistakes.length > 0 && (
        <Block icon={<TriangleAlert className="size-3.5 text-rose-300" />} title="Kesalahan umum terkait">
          <div className="flex flex-col gap-1.5">
            {mistakes.map(
              (m) =>
                m && (
                  <Link
                    key={m.id}
                    href={`/learn/mistakes/#${m.id}`}
                    onClick={onClose}
                    className="text-rose-200 underline-offset-2 hover:underline"
                  >
                    → {m.title}
                  </Link>
                ),
            )}
          </div>
        </Block>
      )}
      {compact && (
        <Link href={`/learn/params/?key=${p.key}`} onClick={onClose} className="btn w-full">
          Buka di Ensiklopedia Parameter
        </Link>
      )}
    </div>
  );
}
