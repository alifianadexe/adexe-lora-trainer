"use client";
import { usePathname } from "next/navigation";
import { ThemeSwitch } from "./theme";
const labels: Record<string, string> = {
  generate: "Generate Studio",
  batch: "Batch produksi",
  gallery: "Galeri karya",
  data: "Data & LAN",
  models: "Model Lab",
  "": "Ringkasan",
  datasets: "Dataset",
  train: "Eksperimen baru",
  jobs: "Training & evaluasi",
  compare: "Bandingkan eksperimen",
  learn: "Panduan belajar",
  settings: "Pengaturan",
  workspace: "Proyek manhwa",
};
export function Topbar() {
  const part = (usePathname() || "/").split("/")[1];
  return (
    <header className="studio-topbar">
      <div className="flex items-center gap-2 text-sm">
        <span className="text-ink-400">Studio</span>
        <span className="text-ink-400">/</span>
        <span className="font-medium">{labels[part] || "Workspace"}</span>
      </div>
      <ThemeSwitch />
    </header>
  );
}
