"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookOpen, Cpu, FlaskConical, GitCompareArrows, GraduationCap, Images, LayoutDashboard, LineChart, Settings, Sparkles, TriangleAlert } from "lucide-react";
import { useApi } from "@/lib/hooks";
import type { Job, Status } from "@/lib/types";
import { cx } from "./ui";

const NAV = [
  { group: "Studio", items: [
    { href: "/", label: "Ringkasan", icon: LayoutDashboard },
    { href: "/models/", label: "Model Lab", icon: FlaskConical },
    { href: "/workspace/", label: "Proyek manhwa", icon: Sparkles },
    { href: "/datasets/", label: "Dataset", icon: Images },
    { href: "/train/", label: "Eksperimen baru", icon: Sparkles },
    { href: "/jobs/", label: "Training & evaluasi", icon: LineChart },
    { href: "/compare/", label: "Bandingkan", icon: GitCompareArrows },
  ] },
  { group: "Belajar", items: [
    { href: "/learn/", label: "Akademi LoRA", icon: GraduationCap },
    { href: "/learn/params/", label: "Ensiklopedia Parameter", icon: BookOpen },
    { href: "/learn/mistakes/", label: "Kesalahan Umum", icon: TriangleAlert },
    { href: "/learn/lab/", label: "Lab Interaktif", icon: FlaskConical },
  ] },
  { group: "Sistem", items: [{ href: "/data/", label: "Data & LAN", icon: Cpu }, { href: "/settings/", label: "Pengaturan", icon: Settings }] },
];

export function Sidebar() {
  const path = usePathname() || "/";
  const { data: st } = useApi<Status>("/api/status", 10000);
  const { data: jobs } = useApi<Job[]>("/api/jobs", 5000);
  const running = jobs?.find((j) => j.status === "running");
  const gpu = st?.gpus?.[0];
  const all = NAV.flatMap((g) => g.items.map((i) => i.href));
  // longest matching prefix wins, so /learn/lab/ doesn't also light up /learn/
  const best = all.filter((h) => (h === "/" ? path === "/" : path.startsWith(h))).sort((a, b) => b.length - a.length)[0];
  const active = (href: string) => href === best;

  return (
    <aside className="sticky top-0 hidden h-screen w-[248px] shrink-0 flex-col border-r border-white/[0.06] bg-ink-900/60 backdrop-blur-xl lg:flex">
      <Link href="/" className="flex items-center gap-3 px-5 pb-4 pt-5">
        <div className="grid size-9 place-items-center rounded-xl bg-gradient-to-br from-brand-600 to-brand-500 brandmark font-bold text-ink-100 shadow-[0_0_24px_-4px_rgb(139_92_246/0.8)]">A</div>
        <div>
          <div className="font-semibold leading-tight">Adexe Studio</div>
          <div className="text-[11px] text-ink-400">train · pahami · ulangi</div>
        </div>
      </Link>
      <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-2">
        {NAV.map((g) => (
          <div key={g.group}>
            <div className="section-title mb-1.5 px-3">{g.group}</div>
            {g.items.map(({ href, label, icon: Icon }) => (
              <Link key={href} href={href}
                className={cx("group flex items-center gap-3 rounded-xl px-3 py-2 text-[13.5px] transition",
                  active(href) ? "bg-gradient-to-r from-brand-500/20 to-transparent text-ink-100" : "text-ink-300 hover:bg-white/[0.04] hover:text-ink-100")}>
                <Icon className={cx("size-4", active(href) ? "text-brand-300" : "text-ink-400 group-hover:text-ink-100")} />
                {label}
                {href === "/jobs/" && running && <span className="ml-auto size-2 rounded-full bg-sky-400 animate-pulse-soft" />}
              </Link>
            ))}
          </div>
        ))}
      </nav>
      {running && (
        <Link href={`/jobs/view/?id=${running.id}`} className="mx-3 mb-3 rounded-xl border border-sky-500/20 bg-sky-500/[0.06] p-3 text-xs">
          <div className="mb-1.5 flex justify-between"><span className="truncate font-medium text-sky-200">{running.name}</span><span className="text-ink-400">{Math.round(100 * running.progress.step / Math.max(1, running.progress.total))}%</span></div>
          <div className="h-1 overflow-hidden rounded-full bg-white/10"><div className="h-full bg-sky-400" style={{ width: `${100 * running.progress.step / Math.max(1, running.progress.total)}%` }} /></div>
        </Link>
      )}
      <div className="border-t border-white/[0.06] px-5 py-3.5 text-[11.5px] text-ink-400">
        <div className="flex items-center gap-2"><Cpu className="size-3.5" />{gpu ? gpu.name : "GPU NVIDIA tidak terdeteksi"}</div>
        {gpu && (
          <div className="mt-2">
            <div className="mb-1 flex justify-between"><span>VRAM</span><span className="tabular-nums">{(gpu.mem_used_mb / 1024).toFixed(1)} / {Math.round(gpu.mem_total_mb / 1024)} GB</span></div>
            <div className="h-1 overflow-hidden rounded-full bg-white/10"><div className="h-full bg-gradient-to-r from-brand-500 to-fuchsia-500" style={{ width: `${100 * gpu.mem_used_mb / gpu.mem_total_mb}%` }} /></div>
          </div>
        )}
      </div>
    </aside>
  );
}

export function MobileNav() {
  const path = usePathname() || "/";
  const items = NAV.flatMap((g) => g.items).filter((i) => ["/", "/workspace/", "/datasets/", "/train/", "/jobs/", "/learn/", "/models/", "/data/", "/settings/"].includes(i.href));
  return (
    <nav className="sticky top-0 z-30 flex gap-1 overflow-x-auto border-b border-white/[0.06] bg-ink-900/80 px-3 py-2 backdrop-blur-xl lg:hidden">
      {items.map(({ href, label, icon: Icon }) => (
        <Link key={href} href={href} className={cx("flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs",
          (href === "/" ? path === "/" : path.startsWith(href)) ? "bg-brand-500/20 text-ink-100" : "text-ink-400")}>
          <Icon className="size-3.5" />{label}
        </Link>
      ))}
    </nav>
  );
}
