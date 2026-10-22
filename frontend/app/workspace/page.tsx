"use client";
import Link from "next/link";
import { ArrowRight, CheckCircle2, FileInput, FolderOpen, Layers, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import { Callout, Card, CardTitle, Loading, PageHeader, Progress, useUI } from "@/components/ui";
import { api, enc, url } from "@/lib/api";
import { useApi } from "@/lib/hooks";
import type { Job, Workspace } from "@/lib/types";

export default function WorkspacePage() {
  const { data: w, error, reload } = useApi<Workspace>("/api/workspace", 15000);
  const [path, setPath] = useState("");
  const [busy, setBusy] = useState(false);
  const { toast } = useUI();
  useEffect(() => {
    if (w?.config_path) setPath(w.config_path);
  }, [w?.config_path]);
  const importConfig = async () => {
    setBusy(true);
    try {
      const j = await api.post<Job>("/api/jobs/import-config", { path });
      toast("Config terhubung. Training belum dimulai.");
      reload();
      window.location.href = `/jobs/view/?id=${j.id}`;
    } catch (e) {
      toast((e as Error).message, "bad");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={`WORKSPACE / ${(w?.name || "PROYEK").toUpperCase()}`}
        title="Dari sketch ke cerita."
        subtitle="Satu tempat untuk dataset berpasangan, checkpoint, dan evaluasi lineart manhwa."
        actions={
          <button className="btn" onClick={reload}>
            <RefreshCw size={15} />
            Segarkan
          </button>
        }
      />
      {error && <Callout level="bad">{error}</Callout>}
      {!w ? (
        <Loading />
      ) : w.available ? (
        <>
          <div className="hero-workspace grid lg:grid-cols-[1.2fr_1fr]">
            <div className="hero-copy">
              <div className="section-title mb-3">Stage 1 · Sketch → lineart</div>
              <h2 className="text-2xl font-semibold tracking-tight">
                {w.checkpoint.step.toLocaleString("id-ID")}
                <span className="text-lg font-normal text-ink-400"> / {w.total_steps.toLocaleString("id-ID")} langkah tersimpan</span>
              </h2>
              <p className="mt-3 text-sm leading-6 text-ink-300">
                Progress ini dibaca dari checkpoint di disk. Angka ini menunjukkan pekerjaan yang tersimpan, bukan status proses yang sedang
                berjalan.
              </p>
              <Progress value={(100 * w.checkpoint.step) / w.total_steps} className="my-5" />
              <div className="flex flex-wrap gap-2">
                <span className="chip">{w.dataset_count} pasangan</span>
                <span className="chip">{w.size.join(" × ")}</span>
                <span className="chip">{w.heldout_count} eval terpisah</span>
              </div>
              {w.job_id && (
                <Link className="btn btn-primary mt-5" href={`/jobs/view/?id=${w.job_id}`}>
                  Buka monitor & evaluasi
                  <ArrowRight size={15} />
                </Link>
              )}
            </div>
            <div className="border-l border-white/10 bg-ink-950/50 p-7">
              <div className="section-title mb-4">Pipeline dataset</div>
              <div className="space-y-3">
                {w.pairs.map((p) => (
                  <div className="pipeline-node flex items-center gap-3" key={p.label}>
                    <CheckCircle2 className={p.complete ? "text-emerald-400" : "text-amber-400"} size={19} />
                    <span className="flex-1 text-sm font-medium">{p.label}</span>
                    <span className="text-sm tabular-nums text-ink-400">{p.count}</span>
                  </div>
                ))}
              </div>
              <p className="mt-4 text-xs leading-5 text-ink-400">
                Stage 2 tersedia: {w.stage2_count} pasangan lineart → warna. Pilih checkpoint Stage 1 melalui evaluasi visual sebelum
                melanjutkan.
              </p>
            </div>
          </div>
          <Card>
            <CardTitle
              sub="Bandingkan aksi, ekspresi, anatomi, identitas, dan ketegasan garis. Sample dari prompt tetap; belum membuktikan semua sketsa akan berhasil."
              right={<span className="chip">Langkah {w.checkpoint.step}</span>}
            >
              Sample checkpoint terakhir
            </CardTitle>
            {w.samples.length ? (
              <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
                {w.samples.map((s) => (
                  <a key={s.file} href={url(`/api/workspace/sample/${enc(s.file)}`)} target="_blank" rel="noreferrer" className="group">
                    <img
                      alt={`Sample prompt ${s.index + 1} pada langkah ${w.checkpoint.step}`}
                      loading="lazy"
                      className="sample-image aspect-[4/7] w-full transition group-hover:border-brand-400"
                      src={url(`/api/workspace/sample/${enc(s.file)}`)}
                    />
                    <p className="mt-2 text-xs text-ink-400">Prompt {s.index + 1} ↗</p>
                  </a>
                ))}
              </div>
            ) : (
              <p className="text-sm text-ink-400">Belum ada sample untuk checkpoint ini.</p>
            )}
          </Card>
          <div className="grid gap-5 md:grid-cols-3">
            {[
              [
                "01",
                "Adegan tetap terbaca",
                "Sketsa boleh sederhana. Hasil mengikuti aksi, ekspresi, dan komposisi yang dijelaskan dalam prompt.",
              ],
              [
                "02",
                "Detail bertambah masuk akal",
                "Nilai tangan, anatomi, pakaian, rambut, dan kemiripan karakter. Periksa apakah tambahan detail mendukung adegan.",
              ],
              [
                "03",
                "Pilih checkpoint dari hasil",
                "Bandingkan prompt dan seed yang sama pada beberapa checkpoint. Loss rendah saja belum cukup untuk menentukan yang terbaik.",
              ],
            ].map(([n, title, desc]) => (
              <Card key={n}>
                <span className="font-mono text-xs text-brand-400">{n} / EVALUASI</span>
                <h3 className="mt-3 font-semibold">{title}</h3>
                <p className="mt-2 text-sm leading-6 text-ink-300">{desc}</p>
              </Card>
            ))}
          </div>
        </>
      ) : (
        <Callout>{w.message}</Callout>
      )}
      <Card>
        <CardTitle icon={<FileInput size={18} />} sub="Hubungkan training yang sudah ada tanpa menyusun ulang seluruh parameter.">
          Impor config AI Toolkit
        </CardTitle>
        <div className="flex flex-col gap-3 sm:flex-row">
          <input
            className="input flex-1 font-mono"
            aria-label="Path config AI Toolkit"
            value={path}
            onChange={(e) => setPath(e.target.value)}
            placeholder="C:/.../stage1_sketch2line_768_v3.yaml"
          />
          <button className="btn btn-primary shrink-0" disabled={!path.trim() || busy} onClick={importConfig}>
            <FolderOpen size={16} />
            {busy ? "Mengimpor…" : "Hubungkan config"}
          </button>
        </div>
        <p className="mt-3 text-xs leading-5 text-ink-400">
          Config disalin ke studio dengan seluruh control, referensi, caption, dan lokasi output. Checkpoint lama dapat dibaca dan
          dilanjutkan. Proses training dimulai melalui tombol di monitor. Riwayat loss dari terminal lama tidak direka ulang.
        </p>
      </Card>
      <Card>
        <CardTitle icon={<Layers size={18} />}>Alur kerja yang disarankan</CardTitle>
        <p className="text-sm leading-7 text-ink-300">
          Review dataset → training Stage 1 → bandingkan checkpoint → uji sketch baru → pilih model lineart → lanjut Stage 2. Gunakan wizard
          untuk eksperimen baru dengan conditioning opsional; gunakan config impor untuk mempertahankan alur yang sudah dikurasi.
        </p>
      </Card>
    </div>
  );
}
