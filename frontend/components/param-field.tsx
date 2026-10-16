"use client";
import { RotateCcw } from "lucide-react";
import { fmtNum, fmtValue } from "@/lib/format";
import type { Param } from "@/lib/types";
import { HelpButton } from "./param-info";
import { Toggle, cx } from "./ui";

const SD_TIMESTEPS = ["sigmoid", "shift", "flux_shift", "uniform", "sigma"];

export function ParamField({ p, value, rec, backend, onChange }: {
  p: Param; value: unknown; rec: unknown; backend: string; onChange: (v: unknown) => void;
}) {
  const changed = rec !== undefined && JSON.stringify(rec) !== JSON.stringify(value);
  let input: React.ReactNode;
  if (p.type === "bool") {
    input = <Toggle checked={!!value} onChange={onChange} label={<span className="text-ink-300">{value ? "aktif" : "nonaktif"}</span>} />;
  } else if (p.type === "select") {
    const opts = p.key === "timestep_type" && backend === "sd-scripts" ? SD_TIMESTEPS : p.options || [];
    input = (
      <select className="input" value={String(value)} onChange={(e) => onChange(e.target.value)}>
        {opts.map((o) => <option key={String(o)} value={String(o)}>{String(o)}</option>)}
      </select>
    );
  } else if (p.type === "multiselect") {
    const cur = (value as number[]) || [];
    input = (
      <div className="flex flex-wrap gap-1.5">
        {(p.options || []).map((o) => {
          const on = cur.includes(o as number);
          return (
            <button key={String(o)} type="button"
              onClick={() => onChange((on ? cur.filter((x) => x !== o) : [...cur, o as number]).sort((a, b) => a - b))}
              className={cx("rounded-lg border px-2.5 py-1 text-[12.5px] tabular-nums transition",
                on ? "border-brand-400/60 bg-brand-500/25 text-white" : "border-white/10 text-ink-400 hover:text-ink-100")}>{String(o)}</button>
          );
        })}
      </div>
    );
  } else {
    input = (
      <div className="flex items-center gap-2">
        <input className="input tabular-nums" type="number" min={p.min} max={p.max} step={p.step ?? (p.type === "int" ? 1 : "any")}
          value={value as number ?? ""} onChange={(e) => {
            const v = p.type === "int" ? parseInt(e.target.value, 10) : parseFloat(e.target.value);
            if (!Number.isNaN(v)) onChange(v);
          }} />
        {p.key === "lr" && <span className="shrink-0 rounded-lg bg-white/5 px-2 py-1.5 font-mono text-xs text-brand-200">{fmtNum(value)}</span>}
      </div>
    );
  }
  return (
    <div className={cx("rounded-xl border p-3.5 transition", changed ? "border-amber-500/30 bg-amber-500/[0.04]" : "border-white/[0.06] bg-white/[0.015]")}>
      <div className="mb-2 flex items-center gap-1.5">
        <span className="text-[13.5px] font-medium">{p.label}</span>
        <HelpButton k={p.key} />
        {changed && (
          <button type="button" onClick={() => onChange(structuredClone(rec))} title="Kembalikan ke rekomendasi"
            className="ml-auto inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] text-amber-300 hover:bg-amber-500/10">
            <RotateCcw className="size-3" />saran: {fmtValue(rec)}
          </button>
        )}
      </div>
      {input}
      <p className="mt-2 line-clamp-2 text-[12px] leading-snug text-ink-400">{p.what}</p>
    </div>
  );
}
