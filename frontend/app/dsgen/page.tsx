"use client";
import Link from "next/link";
import { Check, FlipHorizontal2, ImagePlus, Play, RefreshCw, Square, Trash2, Upload, Wand2, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Callout, Card, CardTitle, Empty, Lightbox, Loading, PageHeader, Progress, Segmented, Toggle, cx, useUI } from "@/components/ui";
import { api, enc, url } from "@/lib/api";
import { useApi } from "@/lib/hooks";

type Health = {
  ready: boolean;
  error: string;
  python_ok: boolean;
  seedvr2: boolean;
  seedvr2_model: boolean;
  engine: { state: string; message: string; model_loaded: boolean; busy: boolean };
};
type Pose = { id: string; file: string; label: string; kind: "full" | "portrait"; prompt: string };
type Expr = { id: string; group: string; label: string; prompt: string; tags: string; nsfw: boolean };
type Sheet = { id: string; name: string; width: number; height: number };
type Item = {
  id: number;
  expression: string | null;
  status: "queued" | "running" | "generated" | "upscaling" | "done" | "failed" | "skipped";
  file: string | null;
  display_file: string | null;
  lineart_file: string | null;
  dataset_file: string | null;
  error: string;
  approved: boolean;
  pose_label: string;
  expression_label: string;
};
type Job = {
  id: string;
  name: string;
  status: "queued" | "running" | "completed" | "failed" | "stopped";
  dataset: string;
  trigger: string;
  message: string;
  created: number;
  sheets: string[];
  lineart_dataset: string | null;
  progress: { done: number; failed: number; generated: number; total: number; approved: number };
  items?: Item[];
};

const BASIC = ["smile", "laughing", "angry", "annoyed", "sad", "crying", "surprised", "shocked", "smug", "deep-thought", "pout-face", "shy-smile"];
const STATUS_LABEL: Record<Job["status"], string> = {
  queued: "antri",
  running: "berjalan",
  completed: "selesai",
  failed: "gagal",
  stopped: "dihentikan",
};

export default function DatasetGeneratorPage() {
  const { toast } = useUI();
  const { data: health, reload: reloadHealth } = useApi<Health>("/api/dsgen/health", 15000);
  const { data: lib, reload: reloadLib } = useApi<{ poses: Pose[]; expressions: Expr[] }>("/api/dsgen/library");
  const { data: jobs, reload: reloadJobs } = useApi<Job[]>("/api/dsgen/jobs", 4000);
  const [active, setActive] = useState<string | null>(null);

  const [sheets, setSheets] = useState<Sheet[]>([]);
  const [dataset, setDataset] = useState("");
  const [trigger, setTrigger] = useState("");
  const [description, setDescription] = useState("");
  const [poseSel, setPoseSel] = useState<string[]>([]);
  const [exprSel, setExprSel] = useState<string[]>(BASIC);
  const [neutral, setNeutral] = useState(true);
  const [variants, setVariants] = useState(1);
  const [upscale, setUpscale] = useState(true);
  const [lineartTwin, setLineartTwin] = useState(true);
  const [captionStyle, setCaptionStyle] = useState<"natural" | "tags">("natural");
  const [limit, setLimit] = useState(0);
  const [showNsfw, setShowNsfw] = useState(false);
  const [filter, setFilter] = useState("");
  const [busy, setBusy] = useState(false);
  const sheetInput = useRef<HTMLInputElement>(null);
  const poseInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (lib && !poseSel.length) setPoseSel(lib.poses.filter((p) => p.kind === "full").map((p) => p.id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lib]);
  useEffect(() => {
    if (!active && jobs?.length) setActive(jobs[0].id);
  }, [jobs, active]);

  const exprs = useMemo(() => (lib?.expressions || []).filter((e) => showNsfw || !e.nsfw), [lib, showNsfw]);
  const groups = useMemo(() => {
    const q = filter.trim().toLowerCase();
    const m = new Map<string, Expr[]>();
    for (const e of exprs) {
      if (q && !`${e.label} ${e.tags}`.toLowerCase().includes(q)) continue;
      m.set(e.group, [...(m.get(e.group) || []), e]);
    }
    return [...m.entries()];
  }, [exprs, filter]);

  const perPose = exprSel.length + (neutral ? 1 : 0);
  const combos = sheets.length * poseSel.length * variants * perPose;
  const total = limit ? Math.min(limit, combos) : combos;

  const toggle = (list: string[], set: (v: string[]) => void, id: string) =>
    set(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);

  async function uploadSheets(files: FileList | null) {
    if (!files?.length) return;
    const f = new FormData();
    [...files].forEach((x) => f.append("files", x));
    try {
      const out = await api.upload<Sheet[]>("/api/dsgen/sheets", f);
      setSheets((s) => [...s, ...out]);
      if (!dataset && out[0]) setDataset(out[0].name.replace(/[^A-Za-z0-9_-]+/g, "_"));
    } catch (e) {
      toast((e as Error).message, "bad");
    }
  }

  async function uploadPoses(files: FileList | null) {
    if (!files?.length) return;
    const f = new FormData();
    [...files].forEach((x) => f.append("files", x));
    try {
      const out = await api.upload<Pose[]>("/api/dsgen/poses", f);
      await reloadLib();
      setPoseSel((s) => [...s, ...out.map((p) => p.id)]);
      toast(`${out.length} pose ditambahkan`, "ok");
    } catch (e) {
      toast((e as Error).message, "bad");
    }
  }

  async function start() {
    setBusy(true);
    try {
      const job = await api.post<Job>("/api/dsgen/jobs", {
        sheets: sheets.map((s) => s.id),
        dataset,
        trigger,
        description,
        poses: poseSel,
        expressions: exprSel,
        include_neutral: neutral,
        variants,
        upscale,
        lineart_twin: lineartTwin,
        caption_style: captionStyle,
        limit,
      });
      toast(`Batch dimulai: ${job.progress.total} gambar`, "ok");
      setActive(job.id);
      reloadJobs();
    } catch (e) {
      toast((e as Error).message, "bad");
    } finally {
      setBusy(false);
    }
  }

  
  return (
    <div>
      <PageHeader
        eyebrow="Kreasi"
        title="Generator dataset"
        subtitle="Dari satu charsheet jadi banyak gambar training: pose dari pustaka mannequin VNCCS, ekspresi dari EmotionCore, gaya garis mengikuti charsheet. Hasil langsung masuk ke Dataset lengkap dengan caption."
        actions={
          <button className="btn" onClick={() => reloadHealth()}>
            <RefreshCw className="size-4" /> Cek ComfyUI
          </button>
        }
      />

      {!health ? (
        <Loading label="Memeriksa engine…" />
      ) : !health.ready ? (
        <Callout level="bad" title="Engine AI Toolkit belum siap" className="mb-5">
          {health.error || "Python AI Toolkit tidak ditemukan; cek Pengaturan."}
        </Callout>
      ) : (
        <Callout level={health.seedvr2 ? "ok" : "warn"} className="mb-5">
          Qwen-Image 2.1 lewat engine aplikasi ini ({health.engine.message || health.engine.state}).{" "}
          {health.seedvr2
            ? `SeedVR2 7B sharp siap untuk upscale 2×${health.seedvr2_model ? "" : " (model diunduh otomatis saat pertama dipakai)"}.`
            : health.error}{" "}
          Generator menunggu jika training sedang berjalan.
        </Callout>
      )}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
        <div className="space-y-5">
          <Card>
            <CardTitle icon={<ImagePlus className="size-4" />} sub="Charsheet bersih, seluruh badan terlihat. Beberapa charsheet karakter yang sama akan dipakai bergantian.">
              1 · Charsheet
            </CardTitle>
            <input ref={sheetInput} type="file" accept="image/*" multiple hidden onChange={(e) => uploadSheets(e.target.files)} />
            <div className="flex flex-wrap gap-3">
              {sheets.map((s) => (
                <div key={s.id} className="relative h-40 w-28 overflow-hidden rounded-xl border border-white/10 bg-white">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={url(`/api/dsgen/sheets/${s.id}/image?size=320`)} alt={s.name} className="size-full object-contain" />
                  <button
                    className="absolute right-1 top-1 rounded-full bg-ink-950/80 p-1"
                    onClick={() => setSheets((x) => x.filter((y) => y.id !== s.id))}
                    aria-label="Hapus charsheet"
                  >
                    <X className="size-3" />
                  </button>
                </div>
              ))}
              <button className="grid h-40 w-28 place-items-center rounded-xl border border-dashed border-white/15 text-ink-400 hover:text-ink-100" onClick={() => sheetInput.current?.click()}>
                <span className="flex flex-col items-center gap-1 text-xs">
                  <Upload className="size-5" /> Upload
                </span>
              </button>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div>
                <div className="label">Dataset tujuan</div>
                <input className="input w-full" value={dataset} onChange={(e) => setDataset(e.target.value)} placeholder="nama_karakter_v1" />
              </div>
              <div>
                <div className="label">Trigger word</div>
                <input className="input w-full" value={trigger} onChange={(e) => setTrigger(e.target.value)} placeholder="amelchar" />
              </div>
            </div>
            <div className="mt-3">
              <div className="label">Deskripsi karakter untuk caption</div>
              <textarea
                className="input min-h-[64px] w-full"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="girl with short black bob hair, brown eyes, white school shirt, blue bow, blue pleated skirt, manga lineart"
              />
            </div>
          </Card>

          <Card>
            <CardTitle
              icon={<FlipHorizontal2 className="size-4" />}
              sub="Pustaka pose VNCCS. Qwen 2.1 mengikuti deskripsi pose (arahkan kursor ke gambar), mannequin jadi acuan visual."
              right={
                <div className="flex gap-2">
                  <button className="btn btn-sm" onClick={() => setPoseSel(poseSel.length ? [] : (lib?.poses || []).map((p) => p.id))}>
                    {poseSel.length ? "Kosongkan" : "Pilih semua"}
                  </button>
                  <button className="btn btn-sm" onClick={() => poseInput.current?.click()}>
                    <Upload className="size-3.5" /> Pose
                  </button>
                </div>
              }
            >
              2 · Pose ({poseSel.length})
            </CardTitle>
            <input ref={poseInput} type="file" accept="image/*" multiple hidden onChange={(e) => uploadPoses(e.target.files)} />
            <div className="grid grid-cols-4 gap-2 sm:grid-cols-7">
              {(lib?.poses || []).map((p) => {
                const on = poseSel.includes(p.id);
                return (
                  <button
                    key={p.id}
                    title={`${p.label}\n${p.prompt}`}
                    onClick={() => toggle(poseSel, setPoseSel, p.id)}
                    className={cx("relative overflow-hidden rounded-lg border bg-white", on ? "border-brand-400 ring-2 ring-brand-500/50" : "border-white/10 opacity-50")}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={url(`/api/dsgen/poses/${p.id}/image?size=256`)} alt={p.label} className="aspect-[5/12] w-full object-contain" />
                    {on && <Check className="absolute right-1 top-1 size-4 rounded-full bg-brand-500 p-0.5 text-white" />}
                  </button>
                );
              })}
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-5">
              <div className="flex items-center gap-2 text-sm text-ink-300">
                Variasi seed per pose
                <Segmented value={variants} onChange={setVariants} options={[1, 2, 3].map((v) => ({ value: v, label: String(v) }))} />
              </div>
            </div>
          </Card>

          <Card>
            <CardTitle
              icon={<Wand2 className="size-4" />}
              sub="Diambil dari daftar emosi VNCCS. Ekspresi dibuat di atas hasil pose, jadi satu pose dipakai ulang untuk semua ekspresi."
              right={
                <div className="flex gap-2">
                  <button className="btn btn-sm" onClick={() => setExprSel(BASIC.filter((b) => exprs.some((e) => e.id === b)))}>
                    Paket dasar
                  </button>
                  <button className="btn btn-sm" onClick={() => setExprSel([])}>
                    Kosongkan
                  </button>
                </div>
              }
            >
              3 · Ekspresi ({exprSel.length + (neutral ? 1 : 0)})
            </CardTitle>
            <div className="mb-3 flex flex-wrap items-center gap-4">
              <input className="input w-56" placeholder="Cari ekspresi…" value={filter} onChange={(e) => setFilter(e.target.value)} />
              <Toggle checked={neutral} onChange={setNeutral} label="Netral (wajah dari charsheet)" />
              <Toggle checked={showNsfw} onChange={setShowNsfw} label="Tampilkan NSFW" />
            </div>
            <div className="max-h-72 space-y-3 overflow-y-auto pr-1">
              {groups.map(([g, list]) => (
                <div key={g}>
                  <div className="section-title mb-1">{g}</div>
                  <div className="flex flex-wrap gap-1.5">
                    {list.map((e) => (
                      <button
                        key={e.id}
                        title={e.prompt}
                        onClick={() => toggle(exprSel, setExprSel, e.id)}
                        className={cx("chip", exprSel.includes(e.id) && "border-brand-400/50 bg-brand-500/25 text-ink-100")}
                      >
                        {e.label}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </Card>

          <Card>
            <CardTitle sub="Qwen 2.1 menghasilkan 768×1728, SeedVR2 7B sharp membesarkan 2× ke 1536×3456. Kembaran lineart diekstrak dari hasil berwarna sehingga pose dan garisnya identik.">4 · Output</CardTitle>
            <div className="flex flex-wrap items-center gap-5">
              <Toggle checked={upscale} onChange={setUpscale} label="Upscale SeedVR2 2×" />
              <Toggle checked={lineartTwin} onChange={setLineartTwin} label="Buat juga versi lineart" />
              <div className="flex items-center gap-2 text-sm text-ink-300">
                Caption
                <Segmented
                  value={captionStyle}
                  onChange={setCaptionStyle}
                  options={[
                    { value: "natural", label: "Kalimat" },
                    { value: "tags", label: "Tag" },
                  ]}
                />
              </div>
              <div className="flex items-center gap-2 text-sm text-ink-300">
                Batas gambar
                <input className="input w-24" type="number" min={0} value={limit} onChange={(e) => setLimit(Math.max(0, +e.target.value || 0))} />
                <span className="text-xs text-ink-400">0 = semua kombinasi (diacak bila dibatasi)</span>
              </div>
            </div>
            <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-4">
              <div className="text-sm text-ink-300">
                <span className="text-lg font-semibold text-ink-100">{total}</span> gambar{lineartTwin ? ` + ${total} lineart` : ""}
                <div className="text-xs text-ink-400">Sekitar 2 menit per gambar di 5090, ditambah ±12 detik per gambar untuk SeedVR2.</div>
              </div>
              <button className="btn btn-primary" disabled={busy || !total || !sheets.length || !dataset || !health?.ready} onClick={start}>
                <Play className="size-4" /> Mulai batch
              </button>
            </div>
          </Card>
        </div>

        <div className="space-y-5">
          <Card>
            <CardTitle sub="Klik satu batch untuk meninjau hasil.">Batch</CardTitle>
            {!jobs ? (
              <Loading />
            ) : !jobs.length ? (
              <Empty title="Belum ada batch">Upload charsheet lalu mulai batch pertama.</Empty>
            ) : (
              <div className="space-y-2">
                {jobs.map((j) => (
                  <button
                    key={j.id}
                    onClick={() => setActive(j.id)}
                    className={cx("w-full rounded-xl border p-3 text-left transition", active === j.id ? "border-brand-400/50 bg-brand-500/10" : "border-white/10 hover:bg-white/[0.03]")}
                  >
                    <div className="flex items-center justify-between gap-2 text-sm">
                      <span className="truncate font-medium">{j.name}</span>
                      <span className="chip">{STATUS_LABEL[j.status]}</span>
                    </div>
                    <Progress className="mt-2" value={(100 * (j.progress.generated + j.progress.done + j.progress.failed)) / Math.max(1, 2 * j.progress.total)} />
                    <div className="mt-1.5 flex justify-between text-xs text-ink-400">
                      <span className="truncate">{j.message}</span>
                      <span className="tabular-nums">
                        {j.progress.done}/{j.progress.total}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </Card>
          {active && <JobView id={active} onDeleted={() => (setActive(null), reloadJobs())} />}
        </div>
      </div>
    </div>
  );
}

function JobView({ id, onDeleted }: { id: string; onDeleted: () => void }) {
  const { toast, confirm } = useUI();
  const { data: job, reload, setData } = useApi<Job>(`/api/dsgen/jobs/${id}`, 3000);
  const [zoom, setZoom] = useState<Item | null>(null);
  const [only, setOnly] = useState<"all" | "done" | "failed">("all");
  if (!job) return <Loading />;
  const items = (job.items || []).filter((i) => only === "all" || i.status === only);

  const act = async (path: string, body: unknown = {}) => {
    try {
      setData(await api.post<Job>(`/api/dsgen/jobs/${id}${path}`, body));
    } catch (e) {
      toast((e as Error).message, "bad");
    }
  };
  const running = job.status === "running" || job.status === "queued";

  return (
    <Card>
      <CardTitle
        sub={
          <>
            {job.progress.approved} gambar disetujui masuk dataset{" "}
            <Link className="text-brand-300 underline" href={`/datasets/view/?name=${enc(job.dataset)}`}>
              {job.dataset}
            </Link>
            {job.lineart_dataset && (
              <>
                {" "}dan{" "}
                <Link className="text-brand-300 underline" href={`/datasets/view/?name=${enc(job.lineart_dataset)}`}>
                  {job.lineart_dataset}
                </Link>
              </>
            )}
            {job.trigger && <> · trigger {job.trigger}</>}
          </>
        }
        right={
          <div className="flex gap-2">
            {running ? (
              <button className="btn btn-sm" onClick={() => act("/cancel")}>
                <Square className="size-3.5" /> Hentikan
              </button>
            ) : (
              <button
                className="btn btn-sm btn-danger"
                onClick={async () => {
                  if (!(await confirm("Hapus batch ini? Gambar yang sudah masuk dataset tetap ada."))) return;
                  await api.del(`/api/dsgen/jobs/${id}`);
                  onDeleted();
                }}
              >
                <Trash2 className="size-3.5" /> Hapus
              </button>
            )}
          </div>
        }
      >
        {job.name}
      </CardTitle>
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="text-xs text-ink-400">{job.message}</div>
        <Segmented
          value={only}
          onChange={setOnly}
          options={[
            { value: "all", label: "Semua" },
            { value: "done", label: "Selesai" },
            { value: "failed", label: "Gagal" },
          ]}
        />
      </div>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 2xl:grid-cols-5">
        {items.map((it) => (
          <div key={it.id} className={cx("group relative overflow-hidden rounded-lg border bg-white", it.status === "done" && !it.approved ? "border-rose-500/50 opacity-40" : "border-white/10")}>
            {it.display_file ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={url(`/api/dsgen/jobs/${id}/files/${it.display_file}?size=384`)}
                alt=""
                className="aspect-[5/12] w-full cursor-zoom-in object-contain"
                onClick={() => setZoom(it)}
              />
            ) : (
              <div className="grid aspect-[5/12] w-full place-items-center bg-ink-950 p-2 text-center text-[11px] text-ink-400">
                {it.status === "running" ? "membuat…" : it.status === "upscaling" ? "SeedVR2…" : it.status === "failed" ? <span className="text-rose-300">{it.error.slice(0, 120)}</span> : it.status}
              </div>
            )}
            <div className="absolute inset-x-0 bottom-0 bg-ink-950/85 px-1.5 py-1 text-[10.5px] leading-tight text-ink-200">
              <div className="truncate font-medium">{it.expression_label}</div>
              <div className="truncate text-ink-400">{it.pose_label}</div>
            </div>
            <div className="absolute right-1 top-1 flex gap-1 opacity-0 transition group-hover:opacity-100">
              {it.status === "done" && (
                <button
                  className="rounded-md bg-ink-950/85 p-1"
                  title={it.approved ? "Keluarkan dari dataset" : "Masukkan ke dataset"}
                  onClick={() => act(`/items/${it.id}/approve`, { approved: !it.approved })}
                >
                  {it.approved ? <X className="size-3.5 text-rose-300" /> : <Check className="size-3.5 text-emerald-300" />}
                </button>
              )}
              {(it.status === "done" || it.status === "failed") && (
                <button className="rounded-md bg-ink-950/85 p-1" title="Generate ulang dengan seed baru" onClick={() => act(`/items/${it.id}/retry`, {})}>
                  <RefreshCw className="size-3.5" />
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
      <Lightbox
        src={zoom?.display_file ? url(`/api/dsgen/jobs/${id}/files/${zoom.display_file}`) : null}
        caption={zoom ? `${zoom.expression_label} · ${zoom.pose_label}` : undefined}
        onClose={() => setZoom(null)}
      />
      <div className="mt-3 text-right">
        <button className="btn btn-sm" onClick={() => reload()}>
          <RefreshCw className="size-3.5" /> Muat ulang
        </button>
      </div>
    </Card>
  );
}
