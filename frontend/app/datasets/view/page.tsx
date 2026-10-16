"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Bot, CheckSquare, Eraser, ListPlus, Replace, Scissors, Search, Sparkles, Trash2, Upload, Wand2 } from "lucide-react";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Callout, Card, CardTitle, Lightbox, Loading, Modal, Notes, PageHeader, Segmented, Stat, Toggle, cx, useUI } from "@/components/ui";
import { api, enc, url } from "@/lib/api";
import { useApi, useCatalog } from "@/lib/hooks";
import type { DatasetDetail, DatasetItem, Level } from "@/lib/types";

const QUALITY_TAGS = /\b(masterpiece|best quality|high quality|score_\d|absurdres|highres)\b/i;

/** Per-caption teaching hints, computed in the browser while typing. */
function coach(item: DatasetItem, style: string, trigger: string, dupCount: number): { level: Level; msg: string }[] {
  const c = item.caption.trim();
  const out: { level: Level; msg: string }[] = [];
  if (!c) return [{ level: "bad", msg: "Belum ada caption" }];
  const words = c.split(/\s+/).length;
  if (trigger && !c.toLowerCase().includes(trigger.toLowerCase())) out.push({ level: "warn", msg: "Trigger word tidak ada" });
  if (style === "tags") {
    if (/[a-z]_[a-z]/i.test(c.replace(/score_\d/g, ""))) out.push({ level: "warn", msg: "Pakai spasi, bukan underscore" });
    if (QUALITY_TAGS.test(c)) out.push({ level: "warn", msg: "Ada quality tag — biasanya jangan di dataset LoRA" });
    if (trigger && !c.toLowerCase().startsWith(trigger.toLowerCase())) out.push({ level: "info", msg: "Taruh trigger di depan (keep_tokens=1)" });
    if (c.split(",").length < 5) out.push({ level: "info", msg: "Tag sedikit — sebutkan pakaian, pose, latar" });
  } else {
    if (words < 8) out.push({ level: "info", msg: "Terlalu singkat — deskripsikan pakaian, pose, latar, cahaya" });
    if (/^(this|the) image/i.test(c)) out.push({ level: "info", msg: "Hindari pembuka 'This image…'" });
  }
  if (dupCount > 1) out.push({ level: "warn", msg: `Caption identik dengan ${dupCount - 1} gambar lain` });
  if (item.width && Math.min(item.width, item.height) < 512) out.push({ level: "warn", msg: "Resolusi < 512px" });
  return out;
}

const DOT: Record<Level, string> = { ok: "bg-emerald-400", info: "bg-sky-400", warn: "bg-amber-400", bad: "bg-rose-400" };

function DatasetView() {
  const name = useSearchParams().get("name") || "";
  const base = `/api/datasets/${enc(name)}`;
  const router = useRouter();
  const { toast, confirm } = useUI();
  const cat = useCatalog();
  const { data, reload, loading } = useApi<DatasetDetail>(name ? base : null);
  const [filter, setFilter] = useState("all");
  const [q, setQ] = useState("");
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [lightbox, setLightbox] = useState<{ src: string; cap: string } | null>(null);
  const [prompt, setPrompt] = useState<null | { title: string; fields: string[]; run: (v: string[]) => void }>(null);
  const [capOpen, setCapOpen] = useState(false);
  const [meta, setMeta] = useState({ trigger_word: "", caption_style: "natural" });
  const [capTask, setCapTask] = useState<{ running: boolean; done: number; total: number; errors: string[]; current?: string } | null>(null);
  const [drag, setDrag] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => { if (data) setMeta({ trigger_word: data.trigger_word, caption_style: data.caption_style }); }, [data]);

  const dupMap = useMemo(() => {
    const m = new Map<string, number>();
    data?.items.forEach((i) => i.caption && m.set(i.caption.trim().toLowerCase(), (m.get(i.caption.trim().toLowerCase()) || 0) + 1));
    return m;
  }, [data]);

  const items = useMemo(() => (data?.items || []).filter((i) => {
    const hints = coach(i, data!.caption_style, data!.trigger_word, dupMap.get(i.caption.trim().toLowerCase()) || 0);
    if (filter === "missing" && i.caption) return false;
    if (filter === "issues" && !hints.some((h) => h.level === "warn" || h.level === "bad")) return false;
    if (filter === "small" && Math.min(i.width, i.height) >= 512) return false;
    if (q && !(`${i.caption} ${i.file}`.toLowerCase().includes(q.toLowerCase()))) return false;
    return true;
  }), [data, filter, q, dupMap]);

  const pollCaption = useCallback(async () => {
    const t = await api.get<typeof capTask>(`${base}/autocaption`).catch(() => null);
    setCapTask(t);
    if (t?.running) setTimeout(pollCaption, 1500);
    else if (t?.total) reload();
  }, [base, reload]);
  useEffect(() => { if (name) pollCaption(); }, [name, pollCaption]);

  if (!name) return <Callout level="bad">Dataset tidak ditentukan.</Callout>;
  if (loading && !data) return <Loading />;
  if (!data) return <Callout level="bad">Dataset tidak ditemukan.</Callout>;

  const upload = async (files: FileList | File[]) => {
    const list = [...files];
    let saved = 0;
    for (let i = 0; i < list.length; i += 20) {
      const fd = new FormData();
      list.slice(i, i + 20).forEach((f) => fd.append("files", f, f.name));
      try {
        const r = await api.upload<{ saved: string[]; errors: string[] }>(`${base}/upload`, fd);
        saved += r.saved.length;
        r.errors.forEach((e) => toast(e, "bad"));
      } catch (e) { toast((e as Error).message, "bad"); }
    }
    toast(`${saved} file diunggah`);
    reload();
  };

  const bulk = async (op: string, args: Record<string, string> = {}) => {
    try {
      const r = await api.post<{ changed: number }>(`${base}/bulk`, { op, args: { ...args, files: sel.size ? [...sel] : undefined } });
      toast(`${r.changed} caption diubah`);
      reload();
    } catch (e) { toast((e as Error).message, "bad"); }
  };

  const saveMeta = async () => {
    await api.patch(base, meta).then(() => { toast("Disimpan"); reload(); }).catch((e) => toast(e.message, "bad"));
  };

  const scope = sel.size ? `${sel.size} gambar terpilih` : "semua gambar";
  const st = data.stats;
  const issues = data.items.filter((i) => coach(i, data.caption_style, data.trigger_word, dupMap.get(i.caption.trim().toLowerCase()) || 0).some((h) => h.level !== "info")).length;
  const readiness = data.count ? Math.round(100 * (data.captioned / data.count) * 0.6 + 40 * Math.min(1, data.count / 15) - Math.min(30, issues * 3)) : 0;
  const hint = cat ? (data.caption_style === "tags" ? cat.models.anima : cat.models.qwen_image_2).caption_hint : "";

  return (
    <div onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={(e) => e.currentTarget === e.target && setDrag(false)}
      onDrop={(e) => { e.preventDefault(); setDrag(false); upload(e.dataTransfer.files); }}>
      <PageHeader eyebrow={<Link href="/datasets/" className="hover:text-white">← Dataset</Link>} title={data.name}
        subtitle={<span className="font-mono text-xs">{data.path}</span>}
        actions={<>
          <Link href={`/train/?dataset=${enc(data.name)}`} className="btn btn-primary"><Sparkles className="size-4" />Train dataset ini</Link>
          <button className="btn btn-danger" onClick={async () => {
            if (!(await confirm(data.linked ? "Hapus dataset dari studio? Folder tertaut tidak ikut terhapus." : "Hapus dataset beserta SEMUA gambarnya?"))) return;
            await api.del(base); router.push("/datasets/");
          }}><Trash2 className="size-4" /></button>
        </>} />

      <div className="grid gap-6 xl:grid-cols-[1fr_340px]">
        <div className="min-w-0 space-y-4">
          <button onClick={() => fileRef.current?.click()}
            className={cx("flex w-full flex-col items-center gap-2 rounded-2xl border-2 border-dashed px-6 py-7 text-sm transition",
              drag ? "border-brand-400 bg-brand-500/10 text-brand-200" : "border-white/10 text-ink-400 hover:border-brand-500/40 hover:text-ink-200")}>
            <Upload className="size-5" />
            <span><b className="text-ink-100">Tarik & lepas</b> gambar (dan .txt caption) ke mana saja di halaman ini, atau klik untuk memilih</span>
          </button>
          <input ref={fileRef} type="file" multiple accept="image/*,.txt" className="hidden" onChange={(e) => e.target.files && upload(e.target.files)} />

          {capTask?.running && (
            <Callout level="info" title={`Auto-caption ${capTask.done}/${capTask.total}`}>
              <div className="flex items-center gap-3">{capTask.current}<button className="btn btn-sm ml-auto" onClick={() => api.del(`${base}/autocaption`)}>Batalkan</button></div>
            </Callout>
          )}
          {!capTask?.running && !!capTask?.errors?.length && <Callout level="bad" title="Auto-caption gagal sebagian">{capTask.errors.slice(-2).join(" · ")}</Callout>}

          <Card className="p-3">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="px-2 text-xs text-ink-400">Untuk {scope}:</span>
              <button className="btn btn-sm" onClick={() => data.trigger_word ? bulk("prepend_trigger", { trigger: data.trigger_word }) : toast("Isi trigger word dulu", "bad")}><ListPlus className="size-3.5" />Trigger di depan</button>
              <button className="btn btn-sm" onClick={() => setPrompt({ title: "Cari & ganti", fields: ["Cari", "Ganti dengan"], run: ([a, b]) => bulk("replace", { find: a, replace: b }) })}><Replace className="size-3.5" />Cari & ganti</button>
              <button className="btn btn-sm" onClick={() => setPrompt({ title: "Tambah di akhir", fields: ["Teks / tag"], run: ([a]) => bulk("append", { text: a }) })}><ListPlus className="size-3.5" />Tambah di akhir</button>
              <button className="btn btn-sm" onClick={() => setPrompt({ title: "Hapus tag", fields: ["Tag (persis)"], run: ([a]) => bulk("remove_tag", { tag: a }) })}><Scissors className="size-3.5" />Hapus tag</button>
              <button className="btn btn-sm" onClick={() => setPrompt({ title: "Isi caption kosong", fields: ["Caption default"], run: ([a]) => bulk("fill_empty", { text: a }) })}><Eraser className="size-3.5" />Isi yang kosong</button>
              {data.caption_style === "tags" && <button className="btn btn-sm" onClick={() => bulk("underscores_to_spaces")}>_ → spasi</button>}
              <button className="btn btn-sm btn-primary ml-auto" onClick={() => setCapOpen(true)}><Bot className="size-3.5" />Auto-caption</button>
            </div>
          </Card>

          <div className="flex flex-wrap items-center gap-2">
            <Segmented value={filter} onChange={setFilter} options={[
              { value: "all", label: `Semua ${data.items.length}` },
              { value: "issues", label: `Perlu perhatian ${issues}` },
              { value: "missing", label: `Tanpa caption ${st.missing.length}` },
              { value: "small", label: `Kecil ${st.small.length}` },
            ]} />
            <div className="relative min-w-[180px] flex-1"><Search className="absolute left-3 top-2.5 size-4 text-ink-400" /><input className="input pl-9" placeholder="Cari caption / file…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
            <button className="btn btn-sm" onClick={() => setSel(new Set(items.map((i) => i.file)))}><CheckSquare className="size-3.5" />Pilih tampil</button>
            {sel.size > 0 && <button className="btn btn-sm" onClick={() => setSel(new Set())}>Batal pilih ({sel.size})</button>}
          </div>

          <div className="grid gap-4 sm:grid-cols-2 2xl:grid-cols-3">
            {items.map((it) => (
              <ImageCard key={it.file} item={it} base={base} style={data.caption_style} trigger={data.trigger_word}
                dup={dupMap.get(it.caption.trim().toLowerCase()) || 0} selected={sel.has(it.file)}
                onSelect={(v) => setSel((s) => { const n = new Set(s); if (v) n.add(it.file); else n.delete(it.file); return n; })}
                onOpen={() => setLightbox({ src: url(`${base}/image/${enc(it.file)}`), cap: it.caption })}
                onDelete={async () => { if (await confirm(`Hapus ${it.file} beserta caption-nya?`)) { await api.del(`${base}/image/${enc(it.file)}`); reload(); } }}
                onSaved={reload} />
            ))}
          </div>
          {!items.length && <div className="py-12 text-center text-sm text-ink-400">Tidak ada gambar yang cocok.</div>}
        </div>

        <div className="space-y-5 xl:sticky xl:top-6 xl:self-start">
          <Card>
            <CardTitle>Kesiapan dataset</CardTitle>
            <div className="mb-4 flex items-end gap-3">
              <div className="text-4xl font-semibold tabular-nums gradient-text">{Math.max(0, Math.min(100, readiness))}</div>
              <div className="pb-1 text-sm text-ink-400">/ 100</div>
            </div>
            <div className="grid grid-cols-3 gap-3"><Stat label="gambar" value={data.count} /><Stat label="ber-caption" value={data.captioned} /><Stat label="kata/caption" value={st.avg_words} /></div>
            <div className="mt-4"><Notes notes={st.warnings.length ? st.warnings : [{ level: "ok", msg: "Dataset terlihat siap untuk training." }]} /></div>
          </Card>
          <Card>
            <CardTitle>Pengaturan</CardTitle>
            <div className="space-y-3">
              <div><div className="label">Trigger word</div><input className="input" value={meta.trigger_word} onChange={(e) => setMeta({ ...meta, trigger_word: e.target.value })} /></div>
              <div><div className="label">Gaya caption</div><Segmented value={meta.caption_style} onChange={(v) => setMeta({ ...meta, caption_style: v })} options={[{ value: "natural", label: "Natural" }, { value: "tags", label: "Tag" }]} /></div>
              <button className="btn btn-sm" onClick={saveMeta}>Simpan</button>
            </div>
          </Card>
          <Card className="border-brand-500/20 bg-gradient-to-b from-brand-500/[0.06] to-transparent">
            <CardTitle icon={<Wand2 className="size-4" />}>Caption coach</CardTitle>
            <p className="text-[13.5px] leading-relaxed text-ink-300">{hint}</p>
            <div className="mt-3 rounded-xl border border-white/[0.07] bg-ink-950/40 p-3 text-[13px] leading-relaxed">
              <b className="text-brand-200">Aturan emas:</b> yang kamu <u>tulis</u> = bisa diganti saat prompting. Yang <u>tidak ditulis</u> tapi selalu ada = diserap ke trigger word.
            </div>
            <Link href="/learn/mistakes/#caption_describes_identity" className="mt-3 inline-block text-sm text-brand-300 hover:underline">Kesalahan caption yang umum →</Link>
          </Card>
          {data.caption_style === "tags" && st.top_tags.length > 0 && (
            <Card>
              <CardTitle sub="Tag yang ada di hampir semua gambar biasanya ciri tetap — pertimbangkan menghapusnya agar diserap trigger.">Tag terbanyak</CardTitle>
              <div className="flex flex-wrap gap-1.5">
                {st.top_tags.map(([t, c]) => (
                  <button key={t} onClick={() => setQ(t)} className={cx("chip hover:border-brand-400/50 hover:text-white", c >= data.count * 0.9 && "border-amber-500/40 text-amber-200")}>{t}<span className="text-ink-400">{c}</span></button>
                ))}
              </div>
            </Card>
          )}
        </div>
      </div>

      <Lightbox src={lightbox?.src || null} caption={lightbox?.cap} onClose={() => setLightbox(null)} />
      <PromptModal p={prompt} scope={scope} onClose={() => setPrompt(null)} />
      <AutoCaptionModal open={capOpen} onClose={() => setCapOpen(false)} base={base} style={data.caption_style} files={sel.size ? [...sel] : null}
        onStarted={() => { setCapOpen(false); pollCaption(); }} />
    </div>
  );
}

function ImageCard({ item, base, style, trigger, dup, selected, onSelect, onOpen, onDelete, onSaved }: {
  item: DatasetItem; base: string; style: string; trigger: string; dup: number; selected: boolean;
  onSelect: (v: boolean) => void; onOpen: () => void; onDelete: () => void; onSaved: () => void;
}) {
  const [cap, setCap] = useState(item.caption);
  const { toast } = useUI();
  useEffect(() => setCap(item.caption), [item.caption]);
  const dirty = cap.trim() !== item.caption;
  const hints = coach({ ...item, caption: cap }, style, trigger, dup);
  const save = async () => {
    if (!dirty) return;
    try { await api.put(`${base}/caption/${enc(item.file)}`, { caption: cap }); onSaved(); } catch (e) { toast((e as Error).message, "bad"); }
  };
  return (
    <div className={cx("card flex flex-col overflow-hidden p-0 transition", selected && "border-brand-400/60 ring-2 ring-brand-500/30")}>
      <div className="relative aspect-square cursor-zoom-in bg-[conic-gradient(#1a1a28_25%,#12121d_0_50%,#1a1a28_0_75%,#12121d_0)] bg-[length:18px_18px]" onClick={onOpen}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={url(`${base}/thumb/${enc(item.file)}`)} alt="" loading="lazy" className="absolute inset-0 size-full object-contain" />
        <label className="absolute right-2.5 top-2.5 grid size-6 cursor-pointer place-items-center rounded-md bg-black/50 backdrop-blur" onClick={(e) => e.stopPropagation()}>
          <input type="checkbox" checked={selected} onChange={(e) => onSelect(e.target.checked)} className="accent-violet-500" />
        </label>
        {item.alpha && <span className="chip absolute left-2.5 top-2.5 bg-black/50">alpha</span>}
      </div>
      <textarea value={cap} onChange={(e) => setCap(e.target.value)} onBlur={save} spellCheck={false}
        onKeyDown={(e) => { if ((e.ctrlKey || e.metaKey) && e.key === "s") { e.preventDefault(); save(); } }}
        placeholder="Tulis caption…"
        className={cx("min-h-[92px] resize-y border-t border-white/[0.07] bg-transparent px-3.5 py-2.5 text-[13px] leading-relaxed outline-none placeholder:text-ink-400",
          dirty && "bg-amber-500/[0.06]")} />
      <div className="space-y-1 border-t border-white/[0.07] px-3.5 py-2">
        {hints.slice(0, 3).map((h) => (
          <div key={h.msg} className="flex items-center gap-2 text-[11.5px] text-ink-300"><span className={cx("size-1.5 shrink-0 rounded-full", DOT[h.level])} />{h.msg}</div>
        ))}
        {!hints.length && <div className="flex items-center gap-2 text-[11.5px] text-emerald-300"><span className="size-1.5 rounded-full bg-emerald-400" />Caption terlihat baik</div>}
      </div>
      <div className="flex items-center justify-between border-t border-white/[0.07] px-3.5 py-2 text-[11.5px] text-ink-400">
        <span className="tabular-nums">{item.width}×{item.height} · {cap.split(/\s+/).filter(Boolean).length} kata{dirty && " · belum disimpan"}</span>
        <button onClick={onDelete} className="rounded-md p-1 hover:bg-rose-500/10 hover:text-rose-300"><Trash2 className="size-3.5" /></button>
      </div>
    </div>
  );
}

function PromptModal({ p, scope, onClose }: { p: null | { title: string; fields: string[]; run: (v: string[]) => void }; scope: string; onClose: () => void }) {
  const [vals, setVals] = useState<string[]>([]);
  useEffect(() => setVals(p ? p.fields.map(() => "") : []), [p]);
  return (
    <Modal open={!!p} onClose={onClose}>
      {p && <>
        <h2 className="mb-4 text-lg font-semibold">{p.title}</h2>
        <div className="space-y-3">{p.fields.map((f, i) => (
          <div key={f}><div className="label">{f}</div><input className="input" autoFocus={i === 0} value={vals[i] || ""} onChange={(e) => setVals(vals.map((v, j) => (j === i ? e.target.value : v)))} /></div>
        ))}</div>
        <p className="mt-3 text-xs text-ink-400">Berlaku untuk {scope}.</p>
        <div className="mt-5 flex justify-end gap-2"><button className="btn" onClick={onClose}>Batal</button><button className="btn btn-primary" onClick={() => { onClose(); p.run(vals); }}>Terapkan</button></div>
      </>}
    </Modal>
  );
}

function AutoCaptionModal({ open, onClose, base, style, files, onStarted }: { open: boolean; onClose: () => void; base: string; style: string; files: string[] | null; onStarted: () => void }) {
  const [s, setS] = useState(style);
  const [overwrite, setOverwrite] = useState(false);
  const [extra, setExtra] = useState("");
  const { toast } = useUI();
  useEffect(() => setS(style), [style]);
  return (
    <Modal open={open} onClose={onClose}>
      <h2 className="mb-2 flex items-center gap-2 text-lg font-semibold"><Bot className="size-5 text-brand-300" />Auto-caption</h2>
      <Callout level="info">Memakai model vision lokal via API OpenAI-compatible (Ollama, LM Studio, vLLM) — atur di Pengaturan. Hasil auto-caption <b>selalu</b> perlu dibaca ulang: hapus ciri tetap karakter, tambahkan yang terlewat.</Callout>
      <div className="mt-4 space-y-4">
        <Segmented value={s} onChange={setS} options={[{ value: "natural", label: "Kalimat natural" }, { value: "tags", label: "Tag Danbooru" }]} />
        <Toggle checked={overwrite} onChange={setOverwrite} label="Timpa caption yang sudah ada" />
        <div><div className="label">Instruksi tambahan</div><input className="input" placeholder='misal: "jangan sebut warna rambut"' value={extra} onChange={(e) => setExtra(e.target.value)} /></div>
        <p className="text-xs text-ink-400">{files ? `Untuk ${files.length} gambar terpilih.` : "Untuk semua gambar."}</p>
      </div>
      <div className="mt-5 flex justify-end gap-2">
        <button className="btn" onClick={onClose}>Batal</button>
        <button className="btn btn-primary" onClick={() => api.post(`${base}/autocaption`, { style: s, overwrite, extra, files }).then(onStarted).catch((e) => toast(e.message, "bad"))}>Mulai</button>
      </div>
    </Modal>
  );
}

export default function Page() {
  return <Suspense fallback={<Loading />}><DatasetView /></Suspense>;
}
