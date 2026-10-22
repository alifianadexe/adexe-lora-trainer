"use client";
import clsx from "clsx";
import { AlertTriangle, CheckCircle2, Info, Loader2, X, XCircle } from "lucide-react";
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import type { JobStatus, Level, Note } from "@/lib/types";

export const cx = clsx;

export function PageHeader({
  title,
  subtitle,
  eyebrow,
  actions,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  eyebrow?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-7 flex flex-wrap items-end justify-between gap-4 animate-fade-up">
      <div className="min-w-0">
        {eyebrow && <div className="mb-1.5 text-sm text-ink-400">{eyebrow}</div>}
        <h1 className="text-2xl font-semibold tracking-tight md:text-[28px]">{title}</h1>
        {subtitle && <div className="mt-1.5 max-w-3xl text-[15px] text-ink-400">{subtitle}</div>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Card({
  className,
  children,
  hover,
  ...rest
}: { className?: string; children: ReactNode; hover?: boolean } & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cx("card", hover && "card-hover", className)} {...rest}>
      {children}
    </div>
  );
}

export function CardTitle({ icon, children, right, sub }: { icon?: ReactNode; children: ReactNode; right?: ReactNode; sub?: ReactNode }) {
  return (
    <div className="mb-4 flex items-start justify-between gap-3">
      <div>
        <div className="flex items-center gap-2 text-[15px] font-semibold">
          {icon && <span className="text-brand-400">{icon}</span>}
          {children}
        </div>
        {sub && <div className="mt-0.5 text-[13px] text-ink-400">{sub}</div>}
      </div>
      {right}
    </div>
  );
}

const LEVEL_STYLE: Record<Level, { box: string; icon: ReactNode }> = {
  ok: {
    box: "border-emerald-500/25 bg-emerald-500/[0.07] text-emerald-200",
    icon: <CheckCircle2 className="size-4 shrink-0 text-emerald-400" />,
  },
  info: { box: "border-sky-500/25 bg-sky-500/[0.07] text-sky-200", icon: <Info className="size-4 shrink-0 text-sky-400" /> },
  warn: {
    box: "border-amber-500/25 bg-amber-500/[0.07] text-amber-100",
    icon: <AlertTriangle className="size-4 shrink-0 text-amber-400" />,
  },
  bad: { box: "border-rose-500/30 bg-rose-500/[0.08] text-rose-100", icon: <XCircle className="size-4 shrink-0 text-rose-400" /> },
};

export function Callout({
  level = "info",
  title,
  children,
  className,
}: {
  level?: Level;
  title?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  const s = LEVEL_STYLE[level];
  return (
    <div className={cx("flex gap-2.5 rounded-xl border px-3.5 py-2.5 text-[13.5px] leading-relaxed", s.box, className)}>
      <div className="pt-0.5">{s.icon}</div>
      <div className="min-w-0">
        {title && <div className="font-semibold">{title}</div>}
        {children && <div className={cx(title && "mt-0.5 opacity-90")}>{children}</div>}
      </div>
    </div>
  );
}

export function Notes({ notes }: { notes: Note[] }) {
  if (!notes?.length) return null;
  return (
    <div className="space-y-2">
      {notes.map((n, i) => (
        <Callout key={i} level={n.level}>
          {n.msg}
        </Callout>
      ))}
    </div>
  );
}

export function Stat({ label, value, hint, accent }: { label: ReactNode; value: ReactNode; hint?: ReactNode; accent?: boolean }) {
  return (
    <div>
      <div className={cx("text-2xl font-semibold tabular-nums tracking-tight", accent && "gradient-text")}>{value}</div>
      <div className="mt-0.5 text-[12.5px] text-ink-400">{label}</div>
      {hint && <div className="mt-1 text-[11.5px] text-ink-400/80">{hint}</div>}
    </div>
  );
}

const STATUS: Record<JobStatus, [string, string]> = {
  draft: ["draft", "bg-white/5 text-ink-300 border-white/10"],
  queued: ["antri", "bg-amber-500/10 text-amber-300 border-amber-500/30"],
  running: ["berjalan", "bg-sky-500/10 text-sky-300 border-sky-500/30"],
  completed: ["selesai", "bg-emerald-500/10 text-emerald-300 border-emerald-500/30"],
  failed: ["gagal", "bg-rose-500/10 text-rose-300 border-rose-500/30"],
  stopped: ["dihentikan", "bg-white/5 text-ink-300 border-white/10"],
};
export function StatusBadge({ status }: { status: JobStatus }) {
  const [label, cls] = STATUS[status] || [status, ""];
  return (
    <span className={cx("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11.5px] font-semibold", cls)}>
      {status === "running" && <span className="size-1.5 rounded-full bg-sky-400 animate-pulse-soft" />}
      {label}
    </span>
  );
}

export function Progress({ value, className }: { value: number; className?: string }) {
  return (
    <div className={cx("h-2 overflow-hidden rounded-full bg-white/[0.06]", className)}>
      <div
        className="h-full rounded-full bg-gradient-to-r from-brand-500 to-brand-400 transition-[width] duration-700"
        style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
      />
    </div>
  );
}

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cx("size-4 animate-spin", className)} />;
}

export function Loading({ label = "Memuat…" }: { label?: string }) {
  return (
    <div className="flex items-center gap-2 py-10 text-ink-400">
      <Spinner />
      {label}
    </div>
  );
}

export function Empty({ icon, title, children }: { icon?: ReactNode; title: ReactNode; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-14 text-center">
      {icon && <div className="grid size-12 place-items-center rounded-2xl bg-brand-500/10 text-brand-300">{icon}</div>}
      <div className="font-medium">{title}</div>
      {children && <div className="max-w-md text-sm text-ink-400">{children}</div>}
    </div>
  );
}

export function Tabs<T extends string>({
  tabs,
  value,
  onChange,
}: {
  tabs: { id: T; label: ReactNode; badge?: ReactNode }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="mb-5 flex gap-1 overflow-x-auto rounded-xl border border-white/[0.07] bg-ink-950/50 p-1">
      {tabs.map((t) => (
        <button
          key={t.id}
          onClick={() => onChange(t.id)}
          className={cx(
            "flex shrink-0 items-center gap-2 rounded-lg px-3.5 py-1.5 text-sm transition",
            value === t.id ? "bg-white/[0.09] font-medium text-white shadow" : "text-ink-400 hover:text-ink-100",
          )}
        >
          {t.label}
          {t.badge}
        </button>
      ))}
    </div>
  );
}

export function Segmented<T extends string | number>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: ReactNode }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="inline-flex flex-wrap gap-1 rounded-xl border border-white/10 bg-ink-950/50 p-1">
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          onClick={() => onChange(o.value)}
          className={cx(
            "rounded-lg px-3 py-1 text-[13px] transition",
            value === o.value ? "bg-brand-500/90 text-white" : "text-ink-300 hover:bg-white/5",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label?: ReactNode }) {
  return (
    <label className="inline-flex cursor-pointer items-center gap-2.5 text-sm">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cx("relative h-5 w-9 rounded-full transition", checked ? "bg-brand-500" : "bg-white/15")}
      >
        <span className={cx("absolute top-0.5 size-4 rounded-full bg-white shadow transition-all", checked ? "left-[18px]" : "left-0.5")} />
      </button>
      {label}
    </label>
  );
}

export function Modal({ open, onClose, children, wide }: { open: boolean; onClose: () => void; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4 backdrop-blur-sm"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className={cx("card relative max-h-[90vh] w-full overflow-auto animate-fade-up", wide ? "max-w-4xl" : "max-w-lg")}>
        <button className="absolute right-3 top-3 rounded-lg p-1 text-ink-400 hover:bg-white/5 hover:text-white" onClick={onClose}>
          <X className="size-4" />
        </button>
        {children}
      </div>
    </div>
  );
}

export function Lightbox({ src, caption, onClose }: { src: string | null; caption?: ReactNode; onClose: () => void }) {
  useEffect(() => {
    if (!src) return;
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [src, onClose]);
  if (!src) return null;
  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-3 bg-black/85 p-6 backdrop-blur" onClick={onClose}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt="" className="max-h-[84vh] max-w-[92vw] rounded-xl shadow-2xl" />
      {caption && <div className="max-w-3xl text-center text-sm text-ink-300">{caption}</div>}
    </div>
  );
}

// ---------------------------------------------------------------- toasts + confirm
type Toast = { id: number; msg: string; kind: "ok" | "bad" };
type Ctx = { toast: (m: string, k?: "ok" | "bad") => void; confirm: (m: ReactNode) => Promise<boolean> };
const UICtx = createContext<Ctx>({ toast: () => {}, confirm: async () => false });
export const useUI = () => useContext(UICtx);

export function UIProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [ask, setAsk] = useState<{ msg: ReactNode; resolve: (v: boolean) => void } | null>(null);
  const toast = useCallback((msg: string, kind: "ok" | "bad" = "ok") => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, msg, kind }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), kind === "bad" ? 7000 : 3200);
  }, []);
  const confirm = useCallback((msg: ReactNode) => new Promise<boolean>((resolve) => setAsk({ msg, resolve })), []);
  const answer = (v: boolean) => {
    ask?.resolve(v);
    setAsk(null);
  };
  return (
    <UICtx.Provider value={{ toast, confirm }}>
      {children}
      <div className="fixed bottom-5 right-5 z-[60] flex flex-col gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={cx(
              "max-w-sm rounded-xl border px-4 py-2.5 text-sm shadow-2xl backdrop-blur animate-fade-up",
              t.kind === "bad" ? "border-rose-500/40 bg-rose-950/90 text-rose-100" : "border-white/10 bg-ink-800/95 text-ink-100",
            )}
          >
            {t.msg}
          </div>
        ))}
      </div>
      <Modal open={!!ask} onClose={() => answer(false)}>
        <div className="pr-6 text-[15px] leading-relaxed">{ask?.msg}</div>
        <div className="mt-5 flex justify-end gap-2">
          <button className="btn" onClick={() => answer(false)}>
            Batal
          </button>
          <button className="btn btn-primary" onClick={() => answer(true)}>
            Ya, lanjut
          </button>
        </div>
      </Modal>
    </UICtx.Provider>
  );
}

export function HealthRing({ value, size = 92 }: { value: number; size?: number }) {
  const r = size / 2 - 7,
    c = 2 * Math.PI * r;
  const color = value >= 80 ? "#34d399" : value >= 55 ? "#fbbf24" : "#fb7185";
  return (
    <div className="relative grid place-items-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} stroke="var(--stroke)" strokeWidth="7" fill="none" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={color}
          strokeWidth="7"
          fill="none"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - value / 100)}
          style={{ transition: "stroke-dashoffset .8s" }}
        />
      </svg>
      <div className="absolute text-center">
        <div className="text-xl font-semibold tabular-nums">{value}</div>
        <div className="-mt-0.5 text-[9px] uppercase tracking-wider text-ink-400">sinyal</div>
      </div>
    </div>
  );
}

export const LEVEL_LABEL: Record<string, string> = { pemula: "Pemula", menengah: "Menengah", lanjut: "Lanjut" };
export function LevelChip({ level }: { level?: string }) {
  if (!level) return null;
  const cls =
    level === "pemula"
      ? "text-emerald-300 border-emerald-500/30"
      : level === "lanjut"
        ? "text-fuchsia-300 border-fuchsia-500/30"
        : "text-sky-300 border-sky-500/30";
  return <span className={cx("chip", cls)}>{LEVEL_LABEL[level] || level}</span>;
}
