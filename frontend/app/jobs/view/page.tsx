"use client";
import Link from "next/link";
import { RunReport } from "@/components/run-report";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Activity, ArrowRight, Download, FileCode2, FlaskConical, Images, Play, Repeat2, ScrollText, SlidersHorizontal, Square, Star, Stethoscope, Trash2,
} from "lucide-react";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { LossChart, LRChart } from "@/components/charts";
import { HelpButton } from "@/components/param-info";
import { Callout, Card, CardTitle, HealthRing, Lightbox, Loading, PageHeader, Progress, Stat, StatusBadge, Tabs, cx, useUI } from "@/components/ui";
import { api, enc, url } from "@/lib/api";
import { fmtDur, fmtNum, fmtTime, fmtValue } from "@/lib/format";
import { useApi, useCatalog } from "@/lib/hooks";
import type { Evaluation, Insights, Job, Outputs } from "@/lib/types";

type Tab = "report" | "diagnosa" | "preview" | "evaluasi" | "ckpt" | "log" | "params" | "config";

function JobView() {
  const id = useSearchParams().get("id") || "";
  const base = `/api/jobs/${id}`;
  const router = useRouter();
  const { toast, confirm } = useUI();
  const cat = useCatalog();
  const { data: job, reload, setData: setJob } = useApi<Job>(id ? base : null, 2500);
  const live = job?.status === "running" || job?.status === "queued";
  const { data: ins, reload: reloadIns } = useApi<Insights>(id ? `${base}/insights` : null, live ? 5000 : false);
  const { data: out } = useApi<Outputs>(id ? `${base}/outputs` : null, live ? 6000 : false);
  const [tab, setTab] = useState<Tab>("diagnosa");

  if (!id) return <Callout level="bad">Job tidak ditentukan.</Callout>;
  if (!job || !cat) return <Loading />;

  const p = job.progress;
  const pct = (100 * (p.step || 0)) / Math.max(1, p.total || 1);
  const elapsed = job.started ? (job.finished || Date.now() / 1000) - job.started : 0;
  const phase = ({ training: "training", sampling: "membuat preview", saving: "menyimpan checkpoint", caching: "caching latent/teks" } as Record<string, string>)[p.phase || ""];

  const start = async () => { try { setJob(await api.post<Job>(`${base}/start`)); toast("Masuk antrian"); } catch (e) { toast((e as Error).message, "bad"); } };
  const stop = async () => { if (await confirm("Hentikan training? Checkpoint yang sudah tersimpan tetap ada.")) setJob(await api.post<Job>(`${base}/stop`)); };
  const del = async () => {
    if (!(await confirm("Hapus job ini?"))) return;
    const outputs = await confirm("Hapus juga folder output (checkpoint & preview)?");
    await api.del(`${base}?outputs=${outputs}`);
    router.push("/jobs/");
  };

  const evalCount = Object.keys(job.evaluations || {}).length;
  return (
    <div>
      <PageHeader eyebrow={<Link href="/jobs/" className="hover:text-white">← Jobs</Link>}
        title={<span className="flex flex-wrap items-center gap-3">{job.name}<StatusBadge status={job.status} /></span>}
        subtitle={<span>{cat.models[job.model]?.label} · {cat.goals[job.goal]?.label || job.goal} · dataset <Link className="text-brand-300 hover:underline" href={`/datasets/view/?name=${enc(job.dataset)}`}>{job.dataset}</Link> · {job.backend} · {fmtTime(job.created)}</span>}
        actions={<>
          {live ? <button className="btn btn-danger" onClick={stop}><Square className="size-4" />Hentikan</button>
            : <button className="btn btn-primary" onClick={start}><Play className="size-4" />{job.status === "draft" ? "Mulai" : "Jalankan lagi / lanjutkan"}</button>}
          {!job.imported_config && <Link href={`/train/?from=${job.id}`} className="btn"><Repeat2 className="size-4" />Iterasi</Link>}
          {!live && <button className="btn btn-danger" onClick={del}><Trash2 className="size-4" /></button>}
        </>} />

      {job.notes && <div className="-mt-3 mb-6 text-sm text-ink-300">📝 {job.notes}</div>}

      <Card className="mb-6">
        <div className="flex flex-wrap items-center gap-6">
          {ins?.health != null && <HealthRing value={ins.health} />}
          <div className="grid flex-1 grid-cols-2 gap-5 md:grid-cols-5">
            <Stat label="step" value={<span>{p.step || 0}<span className="text-base text-ink-400">/{p.total}</span></span>} />
            <Stat label="loss terakhir" value={fmtNum(p.loss)} />
            <Stat label="loss rata-rata (EMA)" value={fmtNum(ins?.summary.last_ema)} hint={ins?.summary.change_pct != null ? `${ins.summary.change_pct > 0 ? "+" : ""}${ins.summary.change_pct.toFixed(1)}% dari awal` : undefined} />
            <Stat label={job.status === "running" ? `sisa waktu${phase ? ` · ${phase}` : ""}` : "durasi"} value={job.status === "running" ? p.eta || "–" : job.imported_config && !job.started ? "—" : fmtDur(elapsed)} />
            <Stat label="LR efektif" value={fmtNum(ins?.effective_lr)} />
          </div>
        </div>
        <Progress className="mt-5" value={pct} />
        {job.status === "failed" && (
          <div className="mt-4 space-y-2">
            {job.error_hint && <Callout level="warn" title="Kemungkinan penyebab">{job.error_hint}</Callout>}
            <pre className="max-h-48 overflow-auto rounded-xl bg-ink-950/70 p-3 font-mono text-xs text-rose-200">{job.error || `exit code ${job.exit_code}`}</pre>
          </div>
        )}
      </Card>

      {job.imported_config && <div className="mb-5"><Callout title="Config training asli terhubung">Sketch, referensi, dan lokasi checkpoint dipertahankan. Log loss lama tidak tersedia; kurva akan terisi setelah training dilanjutkan melalui studio. Menghapus job di studio tidak menghapus output asli.</Callout></div>}
      <Tabs<Tab> value={tab} onChange={setTab} tabs={[
        { id: "report", label: <><FileCode2 className="size-4" />Report & LR</> },
        { id: "diagnosa", label: <><Stethoscope className="size-4" />Diagnosa</>, badge: ins && ins.insights.filter((i) => i.level === "bad" || i.level === "warn").length > 0 ? <span className="rounded-full bg-amber-500/20 px-1.5 text-[11px] text-amber-200">{ins.insights.filter((i) => i.level === "bad" || i.level === "warn").length}</span> : undefined },
        { id: "preview", label: <><Images className="size-4" />Preview</>, badge: out?.samples.length ? <span className="text-[11px] text-ink-400">{out.samples.length}</span> : undefined },
        { id: "evaluasi", label: <><FlaskConical className="size-4" />Evaluasi</>, badge: evalCount ? <span className="text-[11px] text-emerald-300">{evalCount}</span> : undefined },
        { id: "ckpt", label: <><Download className="size-4" />Checkpoint</> },
        { id: "log", label: <><ScrollText className="size-4" />Log</> },
        { id: "params", label: <><SlidersHorizontal className="size-4" />Parameter</> },
        { id: "config", label: <><FileCode2 className="size-4" />Config</> },
      ]} />

      {tab === "report" && <RunReport base={base} />}
      {tab === "diagnosa" && <Diagnosa ins={ins} job={job} />}
      {tab === "preview" && <Preview job={job} out={out} base={base} />}
      {tab === "evaluasi" && <Evaluate job={job} out={out} base={base} ins={ins} onSaved={() => { reload(); reloadIns(); }} />}
      {tab === "ckpt" && <Checkpoints job={job} out={out} base={base} best={ins?.advice.best_step} />}
      {tab === "log" && <Log base={base} live={live} />}
      {tab === "params" && <ParamsTable job={job} />}
      {tab === "config" && <Config base={base} job={job} />}
    </div>
  );
}

// ------------------------------------------------------------------ diagnosa
function Diagnosa({ ins, job }: { ins: Insights | null; job: Job }) {
  if (!ins) return <Loading />;
  const s = ins.summary;
  const evaluated = Object.keys(job.evaluations || {}).map(Number);
  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_400px]">
      <div className="min-w-0 space-y-6">
        <Card>
          <CardTitle icon={<Activity className="size-4" />} sub="Garis tipis = loss tiap step (berisik). Garis tebal = rata-rata bergerak (EMA) — inilah yang dibaca. Garis biru putus-putus = berapa kali tiap gambar sudah dilihat.">Kurva loss</CardTitle>
          {s.series?.length ? <LossChart series={s.series} marks={ins.epoch_marks} evaluated={evaluated} best={ins.advice.best_step} total={job.progress.total} />
            : <div className="py-16 text-center text-sm text-ink-400">Belum ada data loss.</div>}
          {s.n > 0 && (
            <div className="mt-5 grid grid-cols-2 gap-4 border-t border-white/5 pt-5 md:grid-cols-4">
              <Stat label="EMA awal → akhir" value={<span className="text-lg">{fmtNum(s.first_ema)} → {fmtNum(s.last_ema)}</span>} />
              <Stat label="loss minimum" value={<span className="text-lg">{fmtNum(s.min)}</span>} />
              <Stat label="tingkat 'berisik'" value={<span className="text-lg">±{((s.noise || 0) * 100).toFixed(0)}%</span>} hint="normal untuk diffusion" />
              <Stat label="lonjakan" value={<span className="text-lg">{((s.spike_ratio || 0) * 100).toFixed(1)}%</span>} hint="> 4% patut dicurigai" />
            </div>
          )}
        </Card>
        <Card>
          <CardTitle sub="Garis biru = posisi training saat ini">Jadwal learning rate</CardTitle>
          <LRChart data={ins.lr_schedule} current={job.progress.step} />
        </Card>
        <Card className="border-sky-500/15">
          <CardTitle>Cara membaca loss pada LoRA diffusion</CardTitle>
          <ul className="space-y-2 text-[13.5px] leading-relaxed text-ink-300">
            <li>• <b className="text-ink-100">Loss tidak turun drastis itu normal.</b> Model dasar sudah pintar; LoRA hanya mempelajari detail kecil yang hampir tidak terlihat di angka loss.</li>
            <li>• <b className="text-ink-100">Zig-zag besar itu normal.</b> Setiap step memakai tingkat noise acak — tingkat noise memengaruhi nilai loss.</li>
            <li>• <b className="text-ink-100">Yang berbahaya:</b> tren rata-rata yang <i>naik</i>, nilai NaN, atau lonjakan yang makin sering.</li>
            <li>• <b className="text-ink-100">Loss terendah ≠ checkpoint terbaik.</b> Keputusan akhir selalu dari preview dan evaluasi.</li>
          </ul>
        </Card>
      </div>
      <div className="space-y-4">
        <div className="section-title">Temuan ({ins.insights.length})</div>
        {ins.insights.map((i, k) => (
          <Callout key={k} level={i.level} title={i.title}>
            <div>{i.detail}</div>
            {i.action && <div className="mt-1.5 font-medium">→ {i.action}</div>}
            {i.mistake && <Link href={`/learn/mistakes/#${i.mistake}`} className="mt-1.5 inline-flex items-center gap-1 text-xs underline-offset-2 opacity-80 hover:underline">Pelajari: {i.mistake_title}<ArrowRight className="size-3" /></Link>}
          </Callout>
        ))}
        {ins.advice.summary && (
          <Card className="border-emerald-500/20">
            <CardTitle icon={<FlaskConical className="size-4" />}>Dari evaluasimu</CardTitle>
            <p className="text-sm text-ink-300">{ins.advice.summary}</p>
          </Card>
        )}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ preview grid
function groupSamples(out: Outputs | null) {
  const by = new Map<number, Outputs["samples"]>();
  out?.samples.forEach((s) => { const k = s.step ?? -1; by.set(k, [...(by.get(k) || []), s]); });
  return [...by.entries()].sort((a, b) => b[0] - a[0]).map(([step, xs]) => ({ step, items: xs.sort((a, b) => a.index - b.index) }));
}
const fileUrl = (base: string, f: string) => url(`${base}/file/${f.split("/").map(enc).join("/")}`);

function Preview({ job, out, base }: { job: Job; out: Outputs | null; base: string }) {
  const [lb, setLb] = useState<{ src: string; cap: string } | null>(null);
  const [size, setSize] = useState(170);
  const rows = groupSamples(out);
  const prompts: string[] = job.params.sample_prompts || [];
  return (
    <div className="space-y-5">
      <Card className="border-sky-500/15">
        <div className="grid gap-4 text-[13.5px] md:grid-cols-4">
          {[["Baris bawah (step 0)", "Model TANPA LoRA — patokan pembanding."], ["Underfit", "Subjek/gaya belum muncul. Lanjutkan training."], ["Pas ✓", "Mirip, DAN prompt baru (baju, tempat) tetap diikuti."], ["Overfit", "Semua mirip dataset, pose & latar terkunci, warna gosong."]].map(([t, d]) => (
            <div key={t}><div className="font-semibold text-sky-200">{t}</div><div className="text-ink-400">{d}</div></div>
          ))}
        </div>
      </Card>
      {!rows.length ? <Card><div className="py-12 text-center text-sm text-ink-400">Belum ada preview{job.status === "running" ? ` — muncul tiap ${job.params.sample_every} step.` : "."}</div></Card> : (
        <Card className="p-0">
          <div className="flex items-center justify-end gap-2 border-b border-white/5 px-4 py-2 text-xs text-ink-400">ukuran<input type="range" min={100} max={320} value={size} onChange={(e) => setSize(+e.target.value)} className="accent-violet-500" /></div>
          <div className="overflow-x-auto p-4">
            <table className="border-separate border-spacing-2">
              <thead><tr><th className="sticky left-0 z-10 bg-ink-850 text-left text-xs text-ink-400">step</th>
                {prompts.map((pr, i) => <th key={i} className="text-left text-[11.5px] font-normal text-ink-400" style={{ maxWidth: size }}><div className="line-clamp-2" title={pr}>{pr}</div></th>)}</tr></thead>
              <tbody>{rows.map((r) => (
                <tr key={r.step}>
                  <th className="sticky left-0 z-10 bg-ink-850 pr-2 text-left align-middle font-mono text-sm tabular-nums">{r.step < 0 ? "?" : r.step}
                    {job.evaluations?.[String(r.step)] && <Star className="ml-1 inline size-3 fill-amber-300 text-amber-300" />}</th>
                  {r.items.map((s) => (
                    <td key={s.file}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={fileUrl(base, s.file)} alt="" loading="lazy" onClick={() => setLb({ src: fileUrl(base, s.file), cap: `step ${r.step} · ${prompts[s.index] || ""}` })}
                        className="cursor-zoom-in rounded-lg object-cover ring-1 ring-white/10 transition hover:ring-brand-400" style={{ width: size, height: size }} />
                    </td>
                  ))}
                </tr>
              ))}</tbody>
            </table>
          </div>
        </Card>
      )}
      <Lightbox src={lb?.src || null} caption={lb?.cap} onClose={() => setLb(null)} />
    </div>
  );
}

// ------------------------------------------------------------------ evaluation
const CRITERIA: { key: keyof Evaluation; label: string; help: string }[] = [
  { key: "likeness", label: "Kemiripan", help: "Seberapa mirip dengan subjek/gaya yang diajarkan?" },
  { key: "flexibility", label: "Fleksibilitas", help: "Apakah prompt baru (baju, tempat, pose) tetap diikuti?" },
  { key: "quality", label: "Kualitas", help: "Bebas artefak, warna wajar, anatomi benar?" },
];

function Stars({ value, onChange }: { value?: number; onChange: (v: number) => void }) {
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((n) => (
        <button key={n} type="button" onClick={() => onChange(n)} className="p-0.5">
          <Star className={cx("size-[18px] transition", value && n <= value ? "fill-amber-300 text-amber-300" : "text-ink-600 hover:text-amber-200")} />
        </button>
      ))}
    </div>
  );
}

function Evaluate({ job, out, base, ins, onSaved }: { job: Job; out: Outputs | null; base: string; ins: Insights | null; onSaved: () => void }) {
  const rows = groupSamples(out).filter((r) => r.step > 0);
  const [local, setLocal] = useState<Record<string, Evaluation>>(job.evaluations || {});
  const [lb, setLb] = useState<string | null>(null);
  useEffect(() => setLocal(job.evaluations || {}), [job.evaluations]);
  const save = async (step: number, ev: Evaluation) => {
    setLocal((l) => ({ ...l, [step]: ev }));
    await api.put(`${base}/evaluation/${step}`, ev);
    onSaved();
  };
  const advice = ins?.advice;
  const applyable = advice?.suggestions.filter((s) => s.param) || [];
  const applyHref = `/train/?from=${job.id}&apply=${enc(JSON.stringify(Object.fromEntries(applyable.map((s) => [s.param, s.to]))))}`;
  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
      <div className="min-w-0 space-y-4">
        <Callout level="info" title="Kenapa menilai checkpoint?">Kualitas LoRA biasanya naik lalu turun. Dengan memberi skor beberapa checkpoint, kamu menemukan puncaknya — dan studio bisa menyimpulkan apakah run ini overtrain atau undertrain, lalu menyarankan eksperimen berikutnya.</Callout>
        {!rows.length && <Card><div className="py-10 text-center text-sm text-ink-400">Belum ada preview untuk dinilai.</div></Card>}
        {rows.map((r) => {
          const ev = local[String(r.step)] || {};
          const best = advice?.best_step === r.step;
          return (
            <Card key={r.step} className={cx(best && "border-emerald-500/40 ring-1 ring-emerald-500/20")}>
              <div className="flex flex-wrap items-start gap-5">
                <div className="w-24 shrink-0">
                  <div className="text-xs text-ink-400">step</div>
                  <div className="font-mono text-2xl font-semibold tabular-nums">{r.step}</div>
                  {best && <div className="mt-1 inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-medium text-emerald-300"><Star className="size-3 fill-current" />terbaik</div>}
                </div>
                <div className="flex min-w-0 flex-1 gap-2 overflow-x-auto">
                  {r.items.map((s) => (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img key={s.file} src={fileUrl(base, s.file)} alt="" loading="lazy" onClick={() => setLb(fileUrl(base, s.file))} className="size-24 shrink-0 cursor-zoom-in rounded-lg object-cover ring-1 ring-white/10" />
                  ))}
                </div>
                <div className="w-full space-y-2 md:w-auto">
                  {CRITERIA.map((c) => (
                    <div key={c.key} className="flex items-center justify-between gap-3" title={c.help}>
                      <span className="text-[13px] text-ink-300">{c.label}</span>
                      <Stars value={ev[c.key] as number | undefined} onChange={(v) => save(r.step, { ...ev, [c.key]: v })} />
                    </div>
                  ))}
                  <input className="input py-1.5 text-xs" placeholder="catatan (opsional)" defaultValue={ev.note || ""} onBlur={(e) => e.target.value !== (ev.note || "") && save(r.step, { ...ev, note: e.target.value })} />
                </div>
              </div>
            </Card>
          );
        })}
      </div>
      <div className="space-y-5 xl:sticky xl:top-6 xl:self-start">
        <Card className="border-emerald-500/20 bg-gradient-to-b from-emerald-500/[0.06] to-transparent">
          <CardTitle icon={<FlaskConical className="size-4" />}>Saran eksperimen berikutnya</CardTitle>
          {!advice?.summary ? <p className="text-sm text-ink-400">Nilai minimal 2–3 checkpoint (awal, tengah, akhir) untuk mendapat saran.</p> : <>
            <p className="text-sm leading-relaxed text-ink-200">{advice.summary}</p>
            <div className="mt-4 space-y-2.5">
              {advice.suggestions.map((s, i) => (
                <div key={i} className="rounded-xl border border-white/[0.07] bg-ink-950/40 p-3 text-[13px]">
                  {s.param && <div className="mb-1 flex items-center gap-1.5 font-mono text-xs"><span className="text-brand-200">{s.param}</span><HelpButton k={s.param} /><span className="ml-auto text-ink-400">{fmtValue(s.from)} → <span className="text-emerald-300">{fmtValue(s.to)}</span></span></div>}
                  <div className="text-ink-300">{s.why}</div>
                </div>
              ))}
            </div>
            <Link href={applyable.length ? applyHref : `/train/?from=${job.id}`} className="btn btn-primary mt-4 w-full"><Repeat2 className="size-4" />{applyable.length ? "Buat iterasi dengan saran ini" : "Buat iterasi"}</Link>
          </>}
        </Card>
      </div>
      <Lightbox src={lb} onClose={() => setLb(null)} />
    </div>
  );
}

// ------------------------------------------------------------------ others
function Checkpoints({ job, out, base, best }: { job: Job; out: Outputs | null; base: string; best?: number | null }) {
  return (
    <div className="space-y-5">
      <Card className="p-0">
        {out?.checkpoints.length ? (
          <table className="w-full text-[13.5px]">
            <thead className="border-b border-white/[0.07] text-left text-[11.5px] uppercase tracking-wider text-ink-400"><tr><th className="px-5 py-3">File</th><th className="px-5 py-3">Step</th><th className="px-5 py-3">Ukuran</th><th /></tr></thead>
            <tbody>{out.checkpoints.map((c) => (
              <tr key={c.file} className={cx("border-b border-white/[0.04]", best != null && c.step === best && "bg-emerald-500/[0.06]")}>
                <td className="px-5 py-3 font-mono text-xs">{c.file}{best != null && c.step === best && <span className="ml-2 text-emerald-300">★ terbaik menurut evaluasimu</span>}</td>
                <td className="px-5 py-3 tabular-nums">{c.step ?? "final"}</td><td className="px-5 py-3 tabular-nums">{c.size_mb} MB</td>
                <td className="px-5 py-3 text-right"><a className="btn btn-sm" href={url(`${base}/file/${enc(c.file)}?download=true`)}><Download className="size-3.5" />Unduh</a></td>
              </tr>
            ))}</tbody>
          </table>
        ) : <div className="py-12 text-center text-sm text-ink-400">Belum ada checkpoint.</div>}
      </Card>
      <Callout level="info" title="Memakai LoRA di ComfyUI">
        Taruh file .safetensors di <code className="kbd">models/loras</code>. {job.model === "anima"
          ? "Gunakan LoraLoaderModelOnly dengan Anima. LoRA dari Anima-Base juga bisa dicoba di varian Aesthetic/Turbo."
          : "Muat bersama Qwen-Image 2.1. Mulai dari strength 1.0, turunkan ke 0.7–0.8 jika terlalu kuat."} Folder: <code className="kbd">{out?.root}</code>
      </Callout>
    </div>
  );
}

function Log({ base, live }: { base: string; live: boolean }) {
  const [text, setText] = useState("");
  const off = useRef(0);
  const box = useRef<HTMLPreElement>(null);
  useEffect(() => {
    let stop = false;
    off.current = 0;
    setText("");
    const tick = async () => {
      const r = await api.get<{ text: string; offset: number }>(`${base}/log?offset=${off.current}`).catch(() => null);
      if (r && !stop) {
        off.current = r.offset;
        if (r.text) {
          const el = box.current;
          const stick = !el || el.scrollTop + el.clientHeight >= el.scrollHeight - 40;
          setText((t) => (t + r.text).slice(-300000));
          if (stick) requestAnimationFrame(() => box.current && (box.current.scrollTop = box.current.scrollHeight));
        }
      }
      if (live && !stop) setTimeout(tick, 2000);
    };
    tick();
    return () => { stop = true; };
  }, [base, live]);
  return <pre ref={box} className="h-[560px] overflow-auto whitespace-pre-wrap break-all rounded-2xl border border-white/[0.07] bg-black/60 p-4 font-mono text-[12px] leading-relaxed text-ink-200">{text || "(log kosong)"}</pre>;
}

function ParamsTable({ job }: { job: Job }) {
  const cat = useCatalog();
  const rows = useMemo(() => (cat ? cat.params.filter((p) => job.params[p.key] !== undefined) : []), [cat, job]);
  return (
    <Card className="p-0">
      <table className="w-full text-[13.5px]">
        <thead className="border-b border-white/[0.07] text-left text-[11.5px] uppercase tracking-wider text-ink-400"><tr><th className="px-5 py-3">Parameter</th><th className="px-5 py-3">Nilai</th><th className="px-5 py-3">Artinya</th></tr></thead>
        <tbody>{rows.map((p) => (
          <tr key={p.key} className="border-b border-white/[0.04] align-top">
            <td className="whitespace-nowrap px-5 py-3"><span className="inline-flex items-center gap-1.5 font-medium">{p.label}<HelpButton k={p.key} /></span></td>
            <td className="px-5 py-3 font-mono text-xs text-brand-200">{fmtValue(job.params[p.key])}</td>
            <td className="px-5 py-3 text-ink-400">{p.what}</td>
          </tr>
        ))}</tbody>
      </table>
    </Card>
  );
}

function Config({ base, job }: { base: string; job: Job }) {
  const { data } = useApi<Record<string, string>>(`${base}/files`);
  return (
    <div className="space-y-5">
      {data && Object.entries(data).map(([k, v]) => (
        <Card key={k}><CardTitle>{k}</CardTitle><pre className="max-h-[480px] overflow-auto rounded-xl bg-ink-950/70 p-4 font-mono text-[12px] leading-relaxed text-ink-200">{v}</pre></Card>
      ))}
      <Card><CardTitle>Perintah</CardTitle><pre className="overflow-auto rounded-xl bg-ink-950/70 p-4 font-mono text-[12px] text-ink-200">{job.command_text}</pre></Card>
    </div>
  );
}

export default function Page() {
  return <Suspense fallback={<Loading />}><JobView /></Suspense>;
}
