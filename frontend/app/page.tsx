"use client";
import Link from "next/link";
import { ArrowRight, BookOpen, CheckCircle2, Cpu, HardDrive, Images, Layers, Plus, Activity, FolderOpen, Sparkles, GraduationCap } from "lucide-react";
import { Card, CardTitle, Callout, Progress, StatusBadge } from "@/components/ui";
import { useApi } from "@/lib/hooks";
import { enc, url } from "@/lib/api";
import type { DatasetSummary, Job, Status, Workspace } from "@/lib/types";

export default function Dashboard() {
  const { data: st, error } = useApi<Status>("/api/status", 10000);
  const { data: jobs } = useApi<Job[]>("/api/jobs", 4000);
  const { data: ds } = useApi<DatasetSummary[]>("/api/datasets");
  const { data: w } = useApi<Workspace>("/api/workspace", 15000);
  const running = jobs?.find((j) => j.status === "running");
  const gpu = st?.gpus?.[0];
  const preview = w?.samples?.[0];
  const next = w?.job_id ? `/jobs/view/?id=${w.job_id}` : "/workspace/";
  return (
    <div className="space-y-7">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="section-title mb-2">ADEXE / MODEL WORKSPACE</div>
          <h1 className="text-3xl font-semibold tracking-tight">Buat, pelajari, sempurnakan.</h1>
          <p className="mt-2 text-sm text-ink-400">Latih gaya, wujudkan panel, dan pelajari setiap keputusan dalam satu studio.</p>
        </div>
        <Link href="/train/" className="btn btn-primary">
          <Plus size={16} />
          Eksperimen baru
        </Link>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        {[
          { href: "/jobs/", icon: Activity, number: "01", title: "Latih & evaluasi", description: "Ikuti eksperimen dan pilih checkpoint yang paling sesuai.", action: "Ruang training" },
          { href: "/generate/", icon: Sparkles, number: "02", title: "Wujudkan karya", description: "Sketch ke final, lineart, dan produksi batch dalam satu alur.", action: "Generate Studio" },
          { href: "/learn/lab/", icon: GraduationCap, number: "03", title: "Bangun intuisi", description: "Misi singkat dan simulator interaktif yang berjalan tanpa GPU.", action: "Mulai belajar" },
        ].map(({ href, icon: Icon, number, title, description, action }) => <Link key={href} href={href} className="card card-hover group relative overflow-hidden !p-5">
          <div className="mb-5 flex items-center justify-between"><span className="grid size-10 place-items-center rounded-xl border border-brand-500/15 bg-brand-500/[0.07] text-brand-400"><Icon size={19} /></span><span className="font-mono text-xs text-ink-400">{number}</span></div>
          <h2 className="text-base font-semibold">{title}</h2><p className="mt-2 min-h-10 text-xs leading-5 text-ink-400">{description}</p><span className="mt-5 flex items-center gap-2 text-xs font-medium text-brand-400">{action}<ArrowRight size={13} className="transition group-hover:translate-x-1" /></span>
        </Link>)}
      </div>
      {error && (
        <Callout level="bad" title="Koneksi ke backend terputus">
          {error}. Pastikan server studio tetap berjalan.
        </Callout>
      )}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          {
            icon: Cpu,
            label: "GPU lokal",
            value: gpu?.name.replace("NVIDIA GeForce ", "") || "Menunggu sistem",
            hint: gpu
              ? `${(gpu.mem_used_mb / 1024).toFixed(1)} / ${(gpu.mem_total_mb / 1024).toFixed(1)} GB VRAM`
              : "Status dari nvidia-smi",
          },
          {
            icon: Images,
            label: "Pasangan Stage 1",
            value: w?.available ? w.dataset_count.toString() : "—",
            hint: "Sketch + target + referensi",
          },
          {
            icon: Activity,
            label: "Proses di studio",
            value: running ? "Sedang training" : "Tidak ada training aktif",
            hint: running ? running.name : "Status ini hanya untuk job kelolaan studio",
          },
          {
            icon: HardDrive,
            label: "Penyimpanan kosong",
            value: st ? `${st.host.disk_free_gb} GB` : "—",
            hint: "Untuk cache, sample, dan checkpoint",
          },
        ].map(({ icon: Icon, label, value, hint }) => (
          <Card key={label}>
            <div className="mb-4 flex items-center justify-between text-xs text-ink-400">
              <span>{label}</span>
              <Icon size={16} />
            </div>
            <div className="text-lg font-semibold tracking-tight">{value}</div>
            <p className="mt-2 truncate text-xs text-ink-400" title={hint}>
              {hint}
            </p>
          </Card>
        ))}
      </div>
      <div className="hero-workspace grid lg:grid-cols-[1.3fr_1fr]">
        <div className="hero-copy">
          <div className="mb-5 flex items-center gap-2 text-xs font-medium text-brand-400">
            <span className="size-2 rounded-full bg-brand-500" />
            PROYEK AKTIF · {(w?.name || "").toUpperCase()}
          </div>
          <h2 className="text-3xl font-semibold leading-tight tracking-tight">
            Sketch sederhana.
            <br />
            Lineart yang bercerita.
          </h2>
          <p className="mt-4 max-w-lg text-sm leading-7 text-ink-300">
            Latih model untuk menyelesaikan bentuk, memperbaiki anatomi, dan menambah detail sesuai adegan. Jaga identitas lewat referensi
            karakter.
          </p>
          {w?.available && (
            <div className="mt-6 max-w-lg">
              <div className="mb-2 flex justify-between text-xs">
                <span className="text-ink-400">Checkpoint Stage 1 terakhir</span>
                <span className="font-medium">
                  {w.checkpoint.step.toLocaleString("id-ID")} / {w.total_steps.toLocaleString("id-ID")}
                </span>
              </div>
              <Progress value={(100 * w.checkpoint.step) / w.total_steps} />
              <p className="mt-2 text-xs text-ink-400">Progress tersimpan di disk; bukan indikator proses aktif.</p>
            </div>
          )}
          <div className="mt-6 flex flex-wrap gap-3">
            <Link href="/workspace/" className="btn btn-primary">
              Buka proyek
              <ArrowRight size={16} />
            </Link>
            <Link href={next} className="btn">
              <FolderOpen size={16} />
              {w?.job_id ? "Monitor & evaluasi" : "Hubungkan training lama"}
            </Link>
          </div>
        </div>
        <div className="relative grid min-h-[350px] grid-cols-2 items-center gap-4 border-l border-white/10 bg-ink-950/50 p-7">
          {preview && w?.available ? (
            <>
              <img
                className="sample-image h-[300px] w-full -rotate-3 shadow-sm"
                src={url(`/api/workspace/sample/${enc(preview.file)}`)}
                alt="Sample lineart dari checkpoint Stage 1 terakhir"
              />
              <div>
                <span className="chip mb-4">Sample nyata</span>
                <h3 className="text-lg font-semibold">Setiap garis bisa dievaluasi.</h3>
                <p className="mt-3 text-sm leading-6 text-ink-400">
                  Lihat kemiripan karakter, aksi, ekspresi, dan kualitas garis pada prompt yang sama.
                </p>
                <Link href="/workspace/" className="mt-5 inline-flex items-center gap-2 text-sm text-brand-400">
                  Lihat 6 sample
                  <ArrowRight size={15} />
                </Link>
              </div>
            </>
          ) : (
            <div className="col-span-2 p-5">
              <Layers className="mb-4 text-brand-400" size={32} />
              <h3 className="text-xl font-semibold">Mulai dari data yang jelas.</h3>
              <p className="mt-3 text-sm leading-7 text-ink-400">
                Hubungkan config training untuk membaca checkpoint dan sample yang sudah ada.
              </p>
              <Link href="/workspace/" className="btn mt-5">
                Hubungkan proyek
                <ArrowRight size={15} />
              </Link>
            </div>
          )}
        </div>
      </div>
      {running && (
        <Link href={`/jobs/view/?id=${running.id}`} className="block">
          <Card>
            <div className="mb-3 flex items-center gap-3">
              <StatusBadge status="running" />
              <span className="font-medium">{running.name}</span>
              <span className="ml-auto text-sm text-ink-400">
                {running.progress.step}/{running.progress.total} langkah
              </span>
            </div>
            <Progress value={(100 * running.progress.step) / Math.max(1, running.progress.total)} />
          </Card>
        </Link>
      )}
      <div className="grid gap-6 xl:grid-cols-[1.5fr_1fr]">
        <Card>
          <CardTitle
            sub="Lanjutkan dari pekerjaan terakhir atau hubungkan training yang sudah ada."
            right={
              <Link className="text-xs text-brand-400" href="/jobs/">
                Lihat semua →
              </Link>
            }
          >
            Eksperimen terbaru
          </CardTitle>
          {jobs?.length ? (
            <div className="space-y-2">
              {jobs.slice(0, 4).map((j) => (
                <Link
                  href={`/jobs/view/?id=${j.id}`}
                  className="flex items-center gap-3 rounded-xl border border-white/10 p-4 hover:border-brand-400/40"
                  key={j.id}
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{j.name}</div>
                    <div className="mt-1 text-xs text-ink-400">
                      {j.progress.step}/{j.progress.total} langkah · rank {j.params.rank}
                      {j.imported_config ? " · config impor" : ""}
                    </div>
                  </div>
                  <StatusBadge status={j.status} />
                  <ArrowRight size={15} className="text-ink-400" />
                </Link>
              ))}
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-white/10 p-8">
              <FolderOpen size={24} className="mb-3 text-ink-400" />
              <h3 className="font-medium">Training lama belum terhubung.</h3>
              <p className="mt-2 text-sm leading-6 text-ink-400">
                Checkpoint dan sample tetap ada di komputer. Impor config untuk membacanya di studio.
              </p>
              <Link href="/workspace/" className="btn mt-4">
                Impor config
                <ArrowRight size={15} />
              </Link>
            </div>
          )}
        </Card>
        <Card>
          <CardTitle icon={<BookOpen size={17} />}>Belajar dari eksperimenmu</CardTitle>
          <div className="space-y-5">
            {[
              {
                title: "Loss turun, hasil belum tentu lebih baik",
                desc: "Baca kurva sebagai sinyal proses. Pilih checkpoint lewat evaluasi visual yang konsisten.",
                href: "/learn/",
              },
              {
                title: "Sample dan eval punya peran berbeda",
                desc: "Sample memantau prompt tetap. Uji sketsa baru untuk melihat seberapa baik model menggeneralisasi.",
                href: "/workspace/",
              },
              {
                title: "Ubah satu variabel, catat hasilnya",
                desc: "Bandingkan resolusi, learning rate, atau jumlah langkah secara bergantian.",
                href: "/compare/",
              },
            ].map((t) => (
              <Link key={t.title} href={t.href} className="group block">
                <h3 className="text-sm font-medium group-hover:text-brand-400">
                  {t.title}
                  <ArrowRight size={13} className="ml-2 inline" />
                </h3>
                <p className="mt-1.5 text-xs leading-6 text-ink-400">{t.desc}</p>
              </Link>
            ))}
          </div>
        </Card>
      </div>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-white/10 pt-5 text-xs text-ink-400">
        <span className="flex items-center gap-2">
          <CheckCircle2 size={14} className={st?.backends["ai-toolkit"]?.found ? "text-emerald-400" : "text-amber-400"} />
          AI Toolkit {st?.backends["ai-toolkit"]?.found ? "terhubung" : "belum terhubung"}
        </span>
        <span>Qwen-Image 2.1 · Anima</span>
        <span>{ds?.length ?? 0} dataset terdaftar</span>
        <span className="sm:ml-auto">Lokal di komputer ini</span>
      </div>
    </div>
  );
}
