"use client";
import {
  Area, AreaChart, CartesianGrid, Legend, Line, LineChart, ReferenceArea, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { fmtNum } from "@/lib/format";

const AX = { stroke: "var(--chart-tick)", fontSize: 11, tickLine: false, axisLine: false } as const;
const GRID = <CartesianGrid stroke="var(--chart-grid)" vertical={false} />;
const TT = {
  contentStyle: { background: "var(--surface)", border: "1px solid var(--stroke)", borderRadius: 12, fontSize: 12 },
  labelStyle: { color: "var(--color-ink-300)" },
};
export const SERIES_COLORS = ["#a78bfa", "#22d3ee", "#f472b6", "#fbbf24", "#34d399", "#fb7185"];

function quantileDomain(vals: number[]): [number, number] {
  if (!vals.length) return [0, 1];
  const s = [...vals].sort((a, b) => a - b);
  const lo = s[Math.floor(s.length * 0.01)], hi = s[Math.floor(s.length * 0.98)] ?? s[s.length - 1];
  const pad = (hi - lo) * 0.08 || 0.01;
  return [Math.max(0, lo - pad), hi + pad];
}

export function LossChart({ series, marks = [], evaluated = [], best, total, height = 300 }: {
  series: { step: number; loss: number; ema: number }[];
  marks?: { step: number; label: string }[];
  evaluated?: number[]; best?: number | null; total?: number; height?: number;
}) {
  const domain = quantileDomain(series.map((d) => d.loss));
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={series} margin={{ top: 18, right: 12, left: -8, bottom: 0 }}>
        {GRID}
        <XAxis dataKey="step" type="number" domain={[0, total || "dataMax"]} {...AX} />
        <YAxis domain={domain} allowDataOverflow tickFormatter={(v) => Number(v).toFixed(3)} {...AX} width={56} />
        <Tooltip {...TT} formatter={(v, n) => [fmtNum(v), n === "ema" ? "rata-rata (EMA)" : "loss mentah"]} labelFormatter={(l) => `step ${l}`} />
        {marks.map((m) => (
          <ReferenceLine key={m.step} x={m.step} stroke="rgb(34 211 238 / 0.35)" strokeDasharray="4 4"
            label={{ value: m.label, position: "insideTopLeft", fill: "#67e8f9", fontSize: 10 }} />
        ))}
        {evaluated.map((s) => <ReferenceLine key={`e${s}`} x={s} stroke="rgb(251 191 36 / 0.25)" />)}
        {best != null && <ReferenceLine x={best} stroke="#34d399" strokeWidth={2} label={{ value: "★ terbaik", position: "top", fill: "#6ee7b7", fontSize: 11 }} />}
        <Line dataKey="loss" stroke="#a78bfa" strokeOpacity={0.28} dot={false} strokeWidth={1} isAnimationActive={false} />
        <Line dataKey="ema" stroke="url(#lossGrad)" dot={false} strokeWidth={2.6} isAnimationActive={false} />
        <defs>
          <linearGradient id="lossGrad" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#a78bfa" /><stop offset="0.6" stopColor="#e879f9" /><stop offset="1" stopColor="#22d3ee" />
          </linearGradient>
        </defs>
      </LineChart>
    </ResponsiveContainer>
  );
}

export function LRChart({ data, current, height = 160 }: { data: { step: number; lr: number }[]; current?: number; height?: number }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
        <defs>
          <linearGradient id="lrFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#8b5cf6" stopOpacity={0.45} /><stop offset="1" stopColor="#8b5cf6" stopOpacity={0} />
          </linearGradient>
        </defs>
        {GRID}
        <XAxis dataKey="step" type="number" domain={[0, "dataMax"]} {...AX} />
        <YAxis tickFormatter={(v) => fmtNum(v)} {...AX} width={56} domain={[0, "auto"]} />
        <Tooltip {...TT} formatter={(v) => [fmtNum(v), "learning rate"]} labelFormatter={(l) => `step ${l}`} />
        {current != null && current > 0 && <ReferenceArea x1={0} x2={current} fill="rgb(255 255 255 / 0.03)" />}
        {current != null && current > 0 && <ReferenceLine x={current} stroke="#22d3ee" strokeDasharray="3 3" />}
        <Area dataKey="lr" stroke="#a78bfa" strokeWidth={2} fill="url(#lrFill)" isAnimationActive={false} type="monotone" />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function MultiLossChart({ runs, height = 320 }: { runs: { name: string; series: { step: number; ema: number }[] }[]; height?: number }) {
  const steps = new Set<number>();
  runs.forEach((r) => r.series.forEach((p) => steps.add(p.step)));
  const map = new Map<number, Record<string, number>>();
  runs.forEach((r) => r.series.forEach((p) => {
    const row = map.get(p.step) || { step: p.step };
    row[r.name] = p.ema;
    map.set(p.step, row);
  }));
  const data = [...map.values()].sort((a, b) => a.step - b.step);
  const domain = quantileDomain(runs.flatMap((r) => r.series.map((p) => p.ema)));
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 8, right: 12, left: -8, bottom: 0 }}>
        {GRID}
        <XAxis dataKey="step" type="number" domain={[0, "dataMax"]} {...AX} />
        <YAxis domain={domain} allowDataOverflow tickFormatter={(v) => Number(v).toFixed(3)} {...AX} width={56} />
        <Tooltip {...TT} formatter={(v) => fmtNum(v)} labelFormatter={(l) => `step ${l}`} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        {runs.map((r, i) => (
          <Line key={r.name} dataKey={r.name} stroke={SERIES_COLORS[i % SERIES_COLORS.length]} dot={false} strokeWidth={2.2} connectNulls isAnimationActive={false} />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}

export function Sparkline({ values, color = "#a78bfa", height = 36 }: { values: number[]; color?: string; height?: number }) {
  if (values.length < 2) return <div style={{ height }} />;
  const data = values.map((v, i) => ({ i, v }));
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 2, right: 0, left: 0, bottom: 2 }}>
        <YAxis hide domain={quantileDomain(values)} />
        <Line dataKey="v" stroke={color} dot={false} strokeWidth={1.6} isAnimationActive={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}
