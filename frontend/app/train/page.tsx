"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, ArrowRight, Brain, Check, Cpu, Gauge, Lightbulb, Rocket, Save, Sparkles, Wand2 } from "lucide-react";
import { Suspense, useEffect, useMemo, useState } from "react";
import { LRChart } from "@/components/charts";
import { ParamField } from "@/components/param-field";
import { Callout, Card, CardTitle, Loading, Notes, PageHeader, Segmented, Stat, Tabs, cx, useUI } from "@/components/ui";
import { api, enc, url } from "@/lib/api";
import { fmtNum, fmtValue } from "@/lib/format";
import { useApi, useCatalog, useDebounced } from "@/lib/hooks";
import type { Analysis, DatasetDetail, DatasetSummary, Job, Params, Recommendation, Status } from "@/lib/types";

const STEPS = ["Model", "Tujuan & data", "Parameter", "Review"];
const BASIC_GROUPS = ["Network", "Optimizer", "Durasi", "Dataset"];

function bumpName(n: string) {
  const m = n.match(/^(.*?)(?:_v(\d+))?$/)!;
  return `${m[1]}_v${(Number(m[2]) || 1) + 1}`;
}

function Wizard() {
  const sp = useSearchParams();
  const router = useRouter();
  const { toast } = useUI();
  const cat = useCatalog();
  const { data: datasets } = useApi<DatasetSummary[]>("/api/datasets");
  const { data: status } = useApi<Status>("/api/status");
  const fromId = sp.get("from");

  const [step, setStep] = useState(0);
  const [model, setModel] = useState<string | null>(sp.get("model"));
  const [goal, setGoal] = useState("character");
  const [dataset, setDataset] = useState(sp.get("dataset") || "");
  const [trigger, setTrigger] = useState("");
  const [vram, setVram] = useState(24);
  const [backend, setBackend] = useState("ai-toolkit");
  const [name, setName] = useState("");
  const [notes, setNotes] = useState("");
  const [params, setParams] = useState<Params | null>(null);
  const [rec, setRec] = useState<Recommendation | null>(null);
  const [ds, setDs] = useState<DatasetDetail | null>(null);
  const [mode, setMode] = useState<"pemula" | "lengkap">("pemula");
  const [busy, setBusy] = useState(false);

  // auto-detect VRAM tier from the GPU
  useEffect(() => {
    const g = status?.gpus?.[0];
    if (g && cat && !fromId) {
      const gb = g.mem_total_mb / 1024;
      setVram(cat.vram_tiers.reduce((b, t) => (t <= gb + 1 ? t : b), cat.vram_tiers[0]));
    }
  }, [status, cat, fromId]);

  useEffect(() => {
    if (!dataset) {
      setDs(null);
      return;
    }
    api
      .get<DatasetDetail>(`/api/datasets/${enc(dataset)}`)
      .then((d) => {
        setDs(d);
        if (!fromId) setTrigger((t) => t || d.trigger_word);
      })
      .catch(() => setDs(null));
  }, [dataset, fromId]);

  // clone a previous run
  useEffect(() => {
    if (!fromId) return;
    api.get<Job>(`/api/jobs/${fromId}`).then(async (j) => {
      setModel(j.model);
      setGoal(j.goal);
      setDataset(j.dataset);
      setTrigger(j.trigger_word);
      setVram(j.vram);
      setBackend(j.backend);
      const next = structuredClone(j.params);
      const applied: string[] = [];
      try {
        const sugg = JSON.parse(sp.get("apply") || "{}") as Record<string, unknown>;
        for (const [k, v] of Object.entries(sugg)) {
          applied.push(`${k} ${next[k]} → ${v}`);
          next[k] = v;
        }
      } catch {
        /* ignore malformed */
      }
      setParams(next);
      setName(bumpName(j.name));
      setNotes(`Iterasi dari ${j.name}${applied.length ? ` (saran evaluasi: ${applied.join(", ")})` : ""}: `);
      const r = await api.post<Recommendation>("/api/recommend", {
        model: j.model,
        goal: j.goal,
        vram: j.vram,
        num_images: 20,
        backend: j.backend,
        trigger: j.trigger_word,
      });
      // when iterating, "changes" are measured against the previous run, not a fresh recommendation
      setRec({ ...r, params: structuredClone(j.params) });
      setStep(2);
    });
  }, [fromId]); // eslint-disable-line react-hooks/exhaustive-deps

  const recommend = async () => {
    const r = await api.post<Recommendation>("/api/recommend", { model, goal, vram, num_images: ds?.count || 20, backend, trigger });
    setRec(r);
    setParams(structuredClone(r.params));
    if (!name) {
      const taken = new Set((await api.get<Job[]>("/api/jobs").catch(() => [])).map((j) => j.name));
      let n = `${(dataset || "lora").toLowerCase()}_${model === "qwen_image_2" ? "qwen21" : model}_v1`;
      while (taken.has(n)) n = bumpName(n);
      setName(n);
    }
  };

  const dParams = useDebounced(params, 250);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  useEffect(() => {
    if (!dParams || !model) return;
    api
      .post<Analysis>("/api/analyze", {
        model,
        num_images: ds?.count || 20,
        params: { ...dParams, _vram: vram, _captions_have_trigger: ds ? ds.stats.captions_have_trigger : true },
      })
      .then(setAnalysis)
      .catch(() => {});
  }, [dParams, model, ds, vram]);

  if (!cat) return <Loading />;
  const m = model ? cat.models[model] : null;
  const set = (k: string, v: unknown) => setParams((p) => ({ ...p!, [k]: v }));

  return (
    <div>
      <PageHeader
        title={fromId ? "Iterasi eksperimen" : "Training baru"}
        subtitle={
          fromId
            ? "Parameter disalin dari run sebelumnya. Ubah SATU hal saja supaya kamu tahu persis efeknya."
            : "Pilih model dan tujuan — studio menyarankan parameter beserta alasannya, lalu menganalisis setiap perubahanmu secara langsung."
        }
      />

      <div className="mb-5">
        <Callout title="Pakai dataset sketch + referensi karakter?">
          <Link href="/workspace/" className="underline">
            Hubungkan config berpasangan dari halaman Proyek manhwa
          </Link>
          . Wizard mendukung conditioning opsional pada langkah Parameter; config impor mempertahankan pasangan sample berbeda dan seluruh
          pengaturan asli.
        </Callout>
      </div>
      <div className="mb-7 flex flex-wrap items-center gap-2">
        {STEPS.map((s, i) => (
          <div key={s} className="flex items-center gap-2">
            <button
              disabled={i > step}
              onClick={() => setStep(i)}
              className={cx(
                "flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-sm transition",
                i === step
                  ? "border-brand-400/60 bg-brand-500/20 text-white"
                  : i < step
                    ? "border-emerald-500/30 text-emerald-300"
                    : "border-white/10 text-ink-400",
              )}
            >
              <span
                className={cx(
                  "grid size-5 place-items-center rounded-full text-[11px] font-semibold",
                  i < step ? "bg-emerald-500/20" : "bg-white/10",
                )}
              >
                {i < step ? <Check className="size-3" /> : i + 1}
              </span>
              {s}
            </button>
            {i < STEPS.length - 1 && <div className="h-px w-6 bg-white/10" />}
          </div>
        ))}
      </div>

      {/* ------------------------------------------------------------ step 0 */}
      {step === 0 && (
        <div className="space-y-5 animate-fade-up">
          <div className="grid gap-5 md:grid-cols-2">
            {Object.values(cat.models).map((mm) => (
              <button
                key={mm.id}
                onClick={() => {
                  setModel(mm.id);
                  if (!mm.backends.includes(backend)) setBackend(mm.backends[0]);
                  setParams(null);
                }}
                className={cx(
                  "card card-hover text-left",
                  model === mm.id && "border-brand-400/60 bg-brand-500/[0.08] ring-1 ring-brand-500/30",
                )}
              >
                <div className="flex items-start justify-between">
                  <div>
                    <div className="text-xl font-semibold">{mm.label}</div>
                    <div className="mt-0.5 text-sm text-ink-400">{mm.vendor}</div>
                  </div>
                  <div
                    className={cx(
                      "grid size-10 place-items-center rounded-xl",
                      mm.id === "anima" ? "bg-fuchsia-500/15 text-fuchsia-300" : "bg-cyan-500/15 text-cyan-300",
                    )}
                  >
                    {mm.id === "anima" ? <Sparkles className="size-5" /> : <Brain className="size-5" />}
                  </div>
                </div>
                <ul className="mt-4 space-y-1.5 text-[13.5px] text-ink-300">
                  {mm.arch.map((a) => (
                    <li key={a} className="flex gap-2">
                      <span className="mt-2 size-1 shrink-0 rounded-full bg-brand-400" />
                      {a}
                    </li>
                  ))}
                </ul>
                <div className="mt-4 flex flex-wrap gap-1.5">
                  {mm.backends.map((b) => (
                    <span key={b} className="chip">
                      {b}
                    </span>
                  ))}
                  <span className="chip">{mm.caption_style === "tags" ? "caption: tag" : "caption: natural"}</span>
                </div>
              </button>
            ))}
          </div>
          {m && (
            <Card className="animate-fade-up">
              <CardTitle icon={<Lightbulb className="size-4" />}>Yang perlu kamu tahu tentang {m.label}</CardTitle>
              <ul className="space-y-2 text-[14px] text-ink-300">
                {m.notes.map((n) => (
                  <li key={n} className="flex gap-2.5">
                    <Check className="mt-0.5 size-4 shrink-0 text-emerald-400" />
                    {n}
                  </li>
                ))}
              </ul>
              <p className="mt-4 text-xs text-ink-400">Lisensi: {m.license}</p>
            </Card>
          )}
          <Nav next={model ? () => setStep(1) : undefined} />
        </div>
      )}

      {/* ------------------------------------------------------------ step 1 */}
      {step === 1 && m && (
        <div className="space-y-6 animate-fade-up">
          <div>
            <div className="section-title mb-3">Apa yang ingin diajarkan?</div>
            <div className="grid gap-4 md:grid-cols-3">
              {Object.entries(cat.goals).map(([k, g]) => (
                <button
                  key={k}
                  onClick={() => {
                    setGoal(k);
                    setParams(null);
                  }}
                  className={cx(
                    "card card-hover text-left",
                    goal === k && "border-brand-400/60 bg-brand-500/[0.08] ring-1 ring-brand-500/30",
                  )}
                >
                  <div className="font-semibold">{g.label}</div>
                  <p className="mt-1.5 text-[13px] text-ink-300">{g.desc}</p>
                  <p className="mt-3 border-t border-white/5 pt-3 text-[12px] text-ink-400">📁 {g.dataset}</p>
                </button>
              ))}
            </div>
          </div>
          <div>
            <div className="section-title mb-3">Dataset</div>
            {datasets?.length ? (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {datasets.map((d) => (
                  <button
                    key={d.name}
                    onClick={() => {
                      setDataset(d.name);
                      setTrigger(d.trigger_word);
                      setParams(null);
                    }}
                    className={cx(
                      "card card-hover flex items-center gap-3 p-3 text-left",
                      dataset === d.name && "border-brand-400/60 bg-brand-500/[0.08]",
                    )}
                  >
                    <div className="size-12 shrink-0 overflow-hidden rounded-lg bg-ink-950">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      {d.cover && (
                        <img src={url(`/api/datasets/${enc(d.name)}/thumb/${enc(d.cover)}`)} alt="" className="size-full object-cover" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className="truncate font-medium">{d.name}</div>
                      <div className="text-xs text-ink-400">
                        {d.count} gambar · {d.caption_style}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              <Callout level="warn">
                Belum ada dataset.{" "}
                <Link href="/datasets/" className="underline">
                  Buat dulu →
                </Link>
              </Callout>
            )}
          </div>
          <Card>
            <div className="grid gap-5 md:grid-cols-3">
              <div>
                <div className="label">Trigger word</div>
                <input
                  className="input"
                  value={trigger}
                  onChange={(e) => {
                    setTrigger(e.target.value.trim());
                    setParams(null);
                  }}
                  placeholder="ak1k0"
                />
              </div>
              <div>
                <div className="label">
                  <Cpu className="size-3.5" />
                  VRAM GPU
                </div>
                <Segmented
                  value={vram}
                  onChange={(v) => {
                    setVram(v);
                    setParams(null);
                  }}
                  options={cat.vram_tiers.map((t) => ({ value: t, label: t === 48 ? "48+" : `${t}GB` }))}
                />
                <p className="mt-1.5 text-xs text-ink-400">
                  {status?.gpus?.[0] ? `Terdeteksi: ${status.gpus[0].name}` : "GPU tidak terdeteksi — pilih manual."}
                </p>
              </div>
              <div>
                <div className="label">Backend</div>
                <Segmented
                  value={backend}
                  onChange={(v) => {
                    setBackend(v);
                    setParams(null);
                  }}
                  options={m.backends.map((b) => ({ value: b, label: b }))}
                />
                <p className="mt-1.5 text-xs text-ink-400">
                  {m.backends.length > 1
                    ? "ai-toolkit unduh model otomatis; sd-scripts adalah implementasi resmi Anima (model manual)."
                    : "Qwen 2.1 dilatih via ai-toolkit."}
                </p>
              </div>
            </div>
          </Card>
          {ds && (
            <div className="space-y-2">
              <Notes notes={ds.stats.warnings} />
              {(m.caption_style === "tags") !== (ds.caption_style === "tags") && (
                <Callout level="warn">
                  Dataset memakai caption &quot;{ds.caption_style}&quot;, sedangkan {m.label} paling cocok dengan{" "}
                  {m.caption_style === "tags" ? "tag Danbooru" : "kalimat natural"}.
                </Callout>
              )}
            </div>
          )}
          <Nav
            back={() => setStep(0)}
            next={
              dataset
                ? async () => {
                    if (!params) await recommend();
                    setStep(2);
                  }
                : undefined
            }
            nextLabel="Lihat rekomendasi"
          />
        </div>
      )}

      {/* ------------------------------------------------------------ step 2 */}
      {step === 2 && m && params && rec && (
        <div className="grid gap-6 xl:grid-cols-[1fr_380px] animate-fade-up">
          <div className="min-w-0 space-y-5">
            <Card className="border-brand-500/25 bg-gradient-to-br from-brand-500/[0.09] to-transparent">
              <CardTitle
                icon={<Wand2 className="size-4" />}
                right={
                  !fromId && (
                    <button className="btn btn-sm" onClick={recommend}>
                      Reset ke rekomendasi
                    </button>
                  )
                }
                sub={fromId ? "Penanda kuning sekarang berarti berbeda dari run sebelumnya." : undefined}
              >
                Kenapa nilai-nilai ini?
              </CardTitle>
              <ul className="space-y-2 text-[14px] text-ink-200">
                {rec.reasons.map((r) => (
                  <li key={r} className="flex gap-2.5">
                    <span className="mt-2 size-1.5 shrink-0 rounded-full bg-brand-400" />
                    {r}
                  </li>
                ))}
              </ul>
              {rec.warnings.length > 0 && (
                <div className="mt-4 space-y-2">
                  {rec.warnings.map((w) => (
                    <Callout key={w} level="warn">
                      {w}
                    </Callout>
                  ))}
                </div>
              )}
            </Card>
            <Card className="p-4">
              <div className="flex flex-wrap items-center gap-4">
                <div className="min-w-[220px] flex-1">
                  <div className="label">Nama run / file LoRA</div>
                  <input className="input font-mono" value={name} onChange={(e) => setName(e.target.value.trim())} />
                </div>
                <div>
                  <div className="label">Tampilan</div>
                  <Segmented
                    value={mode}
                    onChange={setMode}
                    options={[
                      { value: "pemula", label: "Esensial" },
                      { value: "lengkap", label: "Semua parameter" },
                    ]}
                  />
                </div>
              </div>
            </Card>
            <Card>
              <CardTitle sub="Opsional. Kosongkan untuk checkpoint resmi preset. Varian lokal harus kompatibel dengan arsitektur yang dipilih.">
                Model dasar milikmu
              </CardTitle>
              <input
                className="input font-mono"
                aria-label="Model dasar kustom"
                placeholder={m.hf}
                value={params.base_model_path || ""}
                onChange={(e) => set("base_model_path", e.target.value)}
              />
            </Card>
            <ParamGroups cat={cat} params={params} rec={rec.params} backend={backend} model={model!} mode={mode} onChange={set} />
            {(model === "qwen_image_2" || model === "flux2_klein_4b") && (
              <Card>
                <details>
                  <summary className="text-sm font-semibold">Conditioning sketch / referensi (opsional)</summary>
                  <p className="my-4 text-xs leading-6 text-ink-400">
                    Untuk sketch → lineart atau sketch → final, dataset yang dipilih berisi target akhir. Isi folder control dengan nama
                    file yang tepat sama. Caption menjelaskan aksi dan hasil akhir. Crop acak, flip, dan caption dropout dimatikan pada
                    pasangan control.
                  </p>
                  <div className="grid gap-4 md:grid-cols-2">
                    {[
                      ["control_path_1", "Folder sketch / control utama"],
                      ["control_path_2", "Folder referensi karakter"],
                      ["sample_control_1", "File sketch untuk sample"],
                      ["sample_control_2", "File referensi untuk sample"],
                    ].map(([k, label]) => (
                      <label key={k} className="text-xs text-ink-400">
                        {label}
                        <input
                          className="input mt-2 font-mono"
                          placeholder="Path absolut di komputer training"
                          value={params[k] || ""}
                          onChange={(e) => set(k, e.target.value)}
                        />
                      </label>
                    ))}
                  </div>
                  <p className="mt-4 text-xs text-ink-400">
                    Sample menggunakan dua file contoh ini untuk setiap prompt. Gunakan config impor untuk memberi pasangan sample berbeda
                    per prompt.
                  </p>
                </details>
              </Card>
            )}
            <Card>
              <CardTitle sub="Preview dibuat dari prompt ini setiap beberapa step — inilah cara kamu 'melihat' LoRA belajar. Gunakan skenario yang TIDAK ada di dataset dan satu prompt tanpa trigger untuk mendeteksi kebocoran.">
                Prompt preview
              </CardTitle>
              <textarea
                className="input min-h-[130px] font-mono text-[12.5px]"
                value={(params.sample_prompts || []).join("\n")}
                onChange={(e) => set("sample_prompts", e.target.value.split("\n"))}
              />
              <div className="mt-3">
                <div className="label">Negative prompt</div>
                <textarea
                  className="input min-h-[60px] text-[12.5px]"
                  value={params.sample_neg || ""}
                  onChange={(e) => set("sample_neg", e.target.value)}
                />
              </div>
            </Card>
            <Nav
              back={() => setStep(1)}
              next={() => {
                set("sample_prompts", (params.sample_prompts || []).map((s: string) => s.trim()).filter(Boolean));
                setStep(3);
              }}
              nextLabel="Review"
            />
          </div>
          <AnalysisPanel analysis={analysis} params={params} vram={vram} ds={ds} label={`${m.label} · ${cat.goals[goal].label}`} />
        </div>
      )}

      {/* ------------------------------------------------------------ step 3 */}
      {step === 3 && m && params && rec && (
        <Review
          job={{ name, model: model!, backend, dataset, trigger_word: trigger, params }}
          rec={rec.params}
          cat={cat}
          analysis={analysis}
          backendFound={!!status?.backends[backend]?.found}
          iterating={!!fromId}
          notes={notes}
          setNotes={setNotes}
          busy={busy}
          onBack={() => setStep(2)}
          onCreate={async (start) => {
            setBusy(true);
            try {
              const j = await api.post<Job>("/api/jobs", {
                name,
                model,
                backend,
                dataset,
                trigger_word: trigger,
                goal,
                vram,
                params,
                notes,
                start,
              });
              toast(start ? "Training masuk antrian 🚀" : "Disimpan sebagai draft");
              router.push(`/jobs/view/?id=${j.id}`);
            } catch (e) {
              toast((e as Error).message, "bad");
            } finally {
              setBusy(false);
            }
          }}
        />
      )}
      {step >= 2 && (!params || !rec) && <Loading />}
    </div>
  );
}

function ParamGroups({
  cat,
  params,
  rec,
  backend,
  model,
  mode,
  onChange,
}: {
  cat: NonNullable<ReturnType<typeof useCatalog>>;
  params: Params;
  rec: Params;
  backend: string;
  model: string;
  mode: string;
  onChange: (k: string, v: unknown) => void;
}) {
  const groups = useMemo(() => {
    const g: Record<string, typeof cat.params> = {};
    cat.params
      .filter((p) => (!p.only_backend || p.only_backend === backend) && (!p.only_model || p.only_model === model))
      .filter((p) => mode === "lengkap" || (BASIC_GROUPS.includes(p.group) && p.level !== "lanjut"))
      .forEach((p) => {
        (g[p.group] ||= []).push(p);
      });
    return g;
  }, [cat, backend, model, mode]);
  return (
    <div className="space-y-5">
      {Object.entries(groups).map(([g, ps]) => (
        <div key={g}>
          <div className="section-title mb-2.5">{g}</div>
          <div className="grid gap-3 md:grid-cols-2">
            {ps.map((p) => (
              <ParamField key={p.key} p={p} value={params[p.key]} rec={rec[p.key]} backend={backend} onChange={(v) => onChange(p.key, v)} />
            ))}
          </div>
        </div>
      ))}
      {mode === "pemula" && (
        <p className="text-xs text-ink-400">
          Parameter lanjutan (memori, timestep, preview) memakai nilai rekomendasi. Pilih &quot;Semua parameter&quot; untuk melihat dan
          mengubahnya.
        </p>
      )}
    </div>
  );
}

function AnalysisPanel({
  analysis,
  params,
  vram,
  ds,
  label,
}: {
  analysis: Analysis | null;
  params: Params;
  vram: number;
  ds: DatasetDetail | null;
  label: string;
}) {
  const exp = analysis?.exposure ?? 0;
  const zone =
    exp < 30
      ? ["kurang", "text-sky-300"]
      : exp <= 150
        ? ["zona umum", "text-emerald-300"]
        : exp <= 250
          ? ["tinggi", "text-amber-300"]
          : ["sangat tinggi", "text-rose-300"];
  const vr = analysis?.vram;
  const vramPct = vr ? Math.min(100, (100 * vr.total_gb) / vram) : 0;
  return (
    <div className="space-y-5 xl:sticky xl:top-6 xl:self-start">
      <Card>
        <CardTitle icon={<Gauge className="size-4" />} sub={label}>
          Analisis langsung
        </CardTitle>
        <div className="grid grid-cols-2 gap-4">
          <Stat label="LR efektif (lr × α/r)" value={fmtNum(analysis?.effective_lr)} accent />
          <Stat label="checkpoint" value={analysis?.checkpoints ?? "–"} />
          <Stat label="total step" value={params.steps} />
          <Stat
            label={
              <>
                kali tiap gambar dilihat · <span className={zone[1]}>{zone[0]}</span>
              </>
            }
            value={Math.round(exp)}
          />
        </div>
        <div className="mt-4">
          <div className="mb-1 flex justify-between text-[11px] text-ink-400">
            <span>0</span>
            <span>60–150 umum untuk karakter</span>
            <span>300+</span>
          </div>
          <div className="relative h-2 rounded-full bg-gradient-to-r from-sky-500/40 via-emerald-500/50 via-60% to-rose-500/50">
            <div
              className="absolute -top-1 h-4 w-1 rounded bg-white shadow transition-all"
              style={{ left: `${Math.min(100, (exp / 300) * 100)}%` }}
            />
          </div>
        </div>
        {ds && (
          <p className="mt-3 text-xs text-ink-400">
            {params.steps} step × batch {params.batch_size * (params.grad_accum || 1)} ÷ {ds.count} gambar
          </p>
        )}
      </Card>
      {vr && (
        <Card>
          <CardTitle icon={<Cpu className="size-4" />} sub={vr.note}>
            Perkiraan VRAM
          </CardTitle>
          <div className="mb-2 flex items-end justify-between">
            <span className={cx("text-2xl font-semibold tabular-nums", vr.total_gb > vram ? "text-rose-300" : "text-emerald-300")}>
              ~{vr.total_gb} GB
            </span>
            <span className="text-sm text-ink-400">dari {vram} GB</span>
          </div>
          <div className="h-2.5 overflow-hidden rounded-full bg-white/5">
            <div
              className={cx(
                "h-full rounded-full transition-all",
                vr.total_gb > vram ? "bg-rose-500" : "bg-gradient-to-r from-emerald-500 to-cyan-400",
              )}
              style={{ width: `${vramPct}%` }}
            />
          </div>
          <div className="mt-3 space-y-1">
            {vr.parts.map((p) => (
              <div key={p.label} className="flex justify-between text-[12.5px]">
                <span className="text-ink-400">{p.label}</span>
                <span className="tabular-nums">{p.gb} GB</span>
              </div>
            ))}
          </div>
        </Card>
      )}
      {analysis && (
        <Card>
          <CardTitle sub="Bagaimana learning rate berubah sepanjang training">Jadwal learning rate</CardTitle>
          <LRChart data={analysis.lr_schedule} height={140} />
        </Card>
      )}
      {analysis && (
        <Card>
          <CardTitle>Catatan</CardTitle>
          <Notes notes={analysis.notes} />
        </Card>
      )}
    </div>
  );
}

function Review({
  job,
  rec,
  cat,
  analysis,
  backendFound,
  notes,
  setNotes,
  busy,
  onBack,
  onCreate,
  iterating,
}: {
  job: { name: string; model: string; backend: string; dataset: string; trigger_word: string; params: Params };
  rec: Params;
  cat: NonNullable<ReturnType<typeof useCatalog>>;
  analysis: Analysis | null;
  backendFound: boolean;
  notes: string;
  setNotes: (s: string) => void;
  busy: boolean;
  onBack: () => void;
  onCreate: (start: boolean) => void;
  iterating?: boolean;
}) {
  const [files, setFiles] = useState<Record<string, string> | null>(null);
  const [cmd, setCmd] = useState("");
  const [tab, setTab] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const jobKey = JSON.stringify(job);
  useEffect(() => {
    api
      .post<{ files: Record<string, string>; command: string }>("/api/preview-config", JSON.parse(jobKey))
      .then((r) => {
        setFiles(r.files);
        setCmd(r.command);
        setTab((t) => t || Object.keys(r.files)[0]);
      })
      .catch((e) => setErr(e.message));
  }, [jobKey]);
  const changes = cat.params.filter((p) => rec[p.key] !== undefined && JSON.stringify(rec[p.key]) !== JSON.stringify(job.params[p.key]));
  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_380px] animate-fade-up">
      <div className="min-w-0 space-y-5">
        {analysis && <Notes notes={analysis.notes.filter((n) => n.level !== "ok")} />}
        {!backendFound && (
          <Callout level="bad" title={`Backend ${job.backend} belum ditemukan`}>
            Kamu tetap bisa menyimpan draft. Atur path di{" "}
            <Link href="/settings/" className="underline">
              Pengaturan
            </Link>{" "}
            sebelum menjalankan.
          </Callout>
        )}
        <Card>
          <CardTitle sub="File asli yang dikirim ke trainer. Membacanya adalah cara cepat belajar format ai-toolkit / sd-scripts.">
            Konfigurasi
          </CardTitle>
          {err && <Callout level="bad">{err}</Callout>}
          {files && (
            <>
              <Tabs
                value={tab}
                onChange={setTab}
                tabs={[...Object.keys(files).map((k) => ({ id: k, label: k })), { id: "__cmd", label: "command" }]}
              />
              <pre className="max-h-[460px] overflow-auto rounded-xl border border-white/[0.06] bg-ink-950/70 p-4 font-mono text-[12px] leading-relaxed text-ink-200">
                {tab === "__cmd" ? cmd : files[tab]}
              </pre>
            </>
          )}
        </Card>
        <Card>
          <CardTitle sub="Tulis hipotesismu. Saat membandingkan run nanti, catatan ini sangat berharga.">Catatan eksperimen</CardTitle>
          <textarea
            className="input min-h-[90px]"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder='contoh: "v1 kurang mirip di step 1500, coba LR 1.5e-4"'
          />
        </Card>
        <div className="flex flex-wrap items-center gap-2">
          <button className="btn" onClick={onBack}>
            <ArrowLeft className="size-4" />
            Kembali
          </button>
          <div className="flex-1" />
          <button className="btn" disabled={busy} onClick={() => onCreate(false)}>
            <Save className="size-4" />
            Simpan draft
          </button>
          <button className="btn btn-primary px-5" disabled={busy || !backendFound} onClick={() => onCreate(true)}>
            <Rocket className="size-4" />
            Mulai training
          </button>
        </div>
      </div>
      <div className="space-y-5 xl:sticky xl:top-6 xl:self-start">
        <Card>
          <CardTitle>Ringkasan run</CardTitle>
          <dl className="space-y-2 text-[13.5px]">
            {[
              ["Nama", job.name],
              ["Model", cat.models[job.model].label],
              ["Backend", job.backend],
              ["Dataset", job.dataset],
              ["Trigger", job.trigger_word || "–"],
              ["Rank / alpha", `${job.params.rank} / ${job.params.alpha}`],
              ["Learning rate", fmtNum(job.params.lr)],
              ["Steps", job.params.steps],
              ["Resolusi", fmtValue(job.params.resolutions)],
            ].map(([k, v]) => (
              <div key={k as string} className="flex justify-between gap-3">
                <dt className="text-ink-400">{k}</dt>
                <dd className="truncate font-medium">{v}</dd>
              </div>
            ))}
          </dl>
        </Card>
        <Card>
          <CardTitle sub={iterating ? "Dibanding run sebelumnya" : "Nilai yang kamu ubah dari rekomendasi"}>
            Perubahanmu ({changes.length})
          </CardTitle>
          {changes.length ? (
            <div className="space-y-2">
              {changes.map((p) => (
                <div key={p.key} className="flex items-center justify-between gap-2 text-[13px]">
                  <span className="text-ink-300">{p.label}</span>
                  <span className="font-mono text-xs">
                    <span className="text-ink-400 line-through">{fmtValue(rec[p.key])}</span> →{" "}
                    <span className="text-amber-200">{fmtValue(job.params[p.key])}</span>
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-ink-400">Memakai semua nilai rekomendasi — pilihan bagus untuk run pertama.</p>
          )}
          {changes.length > 2 && (
            <Callout level="info" className="mt-3">
              Kamu mengubah {changes.length} hal sekaligus. Jika hasilnya berbeda, akan sulit tahu perubahan mana penyebabnya.
            </Callout>
          )}
        </Card>
      </div>
    </div>
  );
}

function Nav({ back, next, nextLabel = "Lanjut" }: { back?: () => void; next?: () => void; nextLabel?: string }) {
  return (
    <div className="flex items-center gap-2 pt-2">
      {back && (
        <button className="btn" onClick={back}>
          <ArrowLeft className="size-4" />
          Kembali
        </button>
      )}
      <div className="flex-1" />
      <button className="btn btn-primary px-5" disabled={!next} onClick={next}>
        {nextLabel}
        <ArrowRight className="size-4" />
      </button>
    </div>
  );
}

export default function Page() {
  return (
    <Suspense fallback={<Loading />}>
      <Wizard />
    </Suspense>
  );
}
