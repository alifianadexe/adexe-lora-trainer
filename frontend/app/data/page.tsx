"use client";
import {
  ArrowRight,
  Check,
  Copy,
  Database,
  Download,
  Eye,
  EyeOff,
  FolderSync,
  Laptop,
  Network,
  ShieldCheck,
  Upload,
  Wifi,
} from "lucide-react";
import { useRef, useState, type ReactNode } from "react";
import { Callout, Card, CardTitle, Loading, PageHeader, Stat, cx, useUI } from "@/components/ui";
import { api, url } from "@/lib/api";
import { useApi } from "@/lib/hooks";

type Storage = { engine: string; schema_version: number; path: string; counts: Record<string, number> };
type Access = { authorized: boolean; local: boolean; code: string | null; port: number; lan_urls: string[]; expires_hours: number };
type RemapChange = { field: string; old: string; new: string; exists: boolean; required: boolean };
type Remap = { applied: boolean; changes: RemapChange[] };

function Step({ n, title, done, children }: { n: number; title: string; done?: boolean; children: ReactNode }) {
  return (
    <div className="flex gap-4">
      <div
        className={cx(
          "grid size-8 shrink-0 place-items-center rounded-full border text-sm font-semibold",
          done ? "border-brand-500 bg-brand-500 text-white" : "border-white/15 text-ink-300",
        )}
      >
        {done ? <Check size={15} /> : n}
      </div>
      <div className="min-w-0 flex-1 pb-6">
        <div className="mb-2 font-medium">{title}</div>
        {children}
      </div>
    </div>
  );
}

function CopyField({ value, secret }: { value: string; secret?: boolean }) {
  const [shown, setShown] = useState(!secret);
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await navigator.clipboard?.writeText(value).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-ink-950 px-3 py-2">
      <code className="min-w-0 flex-1 truncate font-mono text-sm">{shown ? value : "•".repeat(Math.min(24, value.length))}</code>
      {secret && (
        <button className="rounded-md p-1 text-ink-400 hover:text-ink-100" onClick={() => setShown(!shown)} aria-label="Tampilkan kode">
          {shown ? <EyeOff size={15} /> : <Eye size={15} />}
        </button>
      )}
      <button className="rounded-md p-1 text-ink-400 hover:text-ink-100" onClick={copy} aria-label="Salin">
        {copied ? <Check size={15} className="text-brand-400" /> : <Copy size={15} />}
      </button>
    </div>
  );
}

function LanCard({ access }: { access: Access }) {
  if (!access.local) {
    return (
      <Card>
        <CardTitle icon={<Wifi size={18} />}>Akses LAN</CardTitle>
        <Callout level="ok">Kamu terhubung dari perangkat lain di jaringan lokal. Sesi berlaku {access.expires_hours} jam.</Callout>
      </Card>
    );
  }
  const lan = access.lan_urls.length > 0;
  return (
    <Card>
      <CardTitle icon={<Wifi size={18} />} sub="Buka studio dari laptop atau tablet di Wi-Fi yang sama.">
        Akses LAN
      </CardTitle>
      <Step n={1} title="Jalankan mode LAN" done={lan}>
        <code className="kbd">run-lan.bat</code> <span className="text-xs text-ink-400">atau</span>{" "}
        <code className="kbd">./run-lan.sh</code>
      </Step>
      <Step n={2} title="Izinkan port di firewall (sekali, Windows)">
        <p className="mb-2 text-xs text-ink-400">PowerShell → Run as Administrator:</p>
        <CopyField value={`.\\scripts\\allow-lan.ps1 -Port ${access.port}`} />
      </Step>
      <Step n={3} title="Buka di perangkat lain">
        {lan ? (
          <div className="space-y-2">
            {access.lan_urls.map((u) => (
              <CopyField key={u} value={u} />
            ))}
          </div>
        ) : (
          <p className="text-xs text-ink-400">Alamat muncul setelah studio berjalan dengan mode LAN.</p>
        )}
      </Step>
      <Step n={4} title="Masukkan kode akses">
        {access.code && <CopyField value={access.code} secret />}
        <p className="mt-2 flex items-center gap-1.5 text-xs text-ink-400">
          <ShieldCheck size={13} /> Hanya alamat lokal yang diterima · sesi {access.expires_hours} jam
        </p>
      </Step>
    </Card>
  );
}

function MoveCard({ onImported }: { onImported: () => void }) {
  const { toast } = useUI();
  const file = useRef<HTMLInputElement>(null);
  const [oldRoot, setOldRoot] = useState("");
  const [newRoot, setNewRoot] = useState("");
  const [preview, setPreview] = useState<Remap | null>(null);
  const [busy, setBusy] = useState(false);

  const importZip = async (f: File) => {
    const form = new FormData();
    form.append("file", f);
    try {
      const r = await api.upload<{ message: string }>("/api/portability/import", form);
      toast(r.message);
      onImported();
    } catch (e) {
      toast((e as Error).message, "bad");
    }
  };
  const remap = async (apply: boolean) => {
    setBusy(true);
    try {
      const r = await api.post<Remap>("/api/portability/remap", { old_root: oldRoot, new_root: newRoot, apply });
      setPreview(r);
      if (apply) toast("Path diperbarui.");
    } catch (e) {
      toast((e as Error).message, "bad");
    } finally {
      setBusy(false);
    }
  };
  const blocked = preview?.changes.some((c) => c.required && !c.exists);

  return (
    <Card>
      <CardTitle icon={<FolderSync size={18} />} sub="Riwayat ikut, aset dipindah terpisah.">
        Pindah PC
      </CardTitle>
      <div className="mb-6 grid grid-cols-[1fr_auto_1fr] items-center gap-3 text-center text-xs text-ink-400">
        <div className="rounded-xl border border-white/10 p-3">
          <Laptop className="mx-auto mb-1" size={18} />
          PC lama
        </div>
        <ArrowRight size={16} />
        <div className="rounded-xl border border-white/10 p-3">
          <Laptop className="mx-auto mb-1 text-brand-400" size={18} />
          PC baru
        </div>
      </div>
      <Step n={1} title="Ekspor riwayat (PC lama)">
        <a className="btn" href={url("/api/portability/export")}>
          <Download size={15} /> Unduh history ZIP
        </a>
        <p className="mt-2 text-xs text-ink-400">Job, sesi, loss & LR, evaluasi, versi dataset. Tanpa token API.</p>
      </Step>
      <Step n={2} title="Salin aset secara manual">
        <div className="flex flex-wrap gap-1.5">
          {["studio-data/datasets", "studio-data/outputs", "folder dataset tertaut", "backends/ai-toolkit"].map((x) => (
            <span key={x} className="chip font-mono">
              {x}
            </span>
          ))}
        </div>
      </Step>
      <Step n={3} title="Impor di workspace kosong (PC baru)">
        <button className="btn" onClick={() => file.current?.click()}>
          <Upload size={15} /> Pilih history ZIP
        </button>
        <input
          ref={file}
          type="file"
          accept=".zip"
          className="hidden"
          onChange={(e) => e.target.files?.[0] && importZip(e.target.files[0])}
        />
      </Step>
      <Step n={4} title="Petakan ulang path" done={preview?.applied}>
        <div className="grid gap-2 sm:grid-cols-2">
          <input
            className="input font-mono text-xs"
            placeholder="Root lama, mis. D:/Adexe"
            value={oldRoot}
            onChange={(e) => setOldRoot(e.target.value)}
          />
          <input
            className="input font-mono text-xs"
            placeholder="Root baru, mis. E:/Adexe"
            value={newRoot}
            onChange={(e) => setNewRoot(e.target.value)}
          />
        </div>
        <div className="mt-3 flex gap-2">
          <button className="btn" disabled={busy || !oldRoot || !newRoot} onClick={() => remap(false)}>
            Preview
          </button>
          <button className="btn btn-primary" disabled={busy || !preview || blocked || preview.applied} onClick={() => remap(true)}>
            Terapkan
          </button>
        </div>
        {preview && (
          <div className="mt-4 max-h-64 space-y-1.5 overflow-auto">
            {!preview.changes.length && <p className="text-xs text-ink-400">Tidak ada path yang cocok dengan root lama.</p>}
            {preview.changes.map((c) => (
              <div key={c.field} className="flex items-center gap-2 rounded-lg bg-ink-950 px-3 py-2 text-xs">
                <span
                  className={cx("size-2 shrink-0 rounded-full", c.exists ? "bg-emerald-500" : c.required ? "bg-rose-500" : "bg-amber-500")}
                />
                <span className="min-w-0 flex-1 truncate font-mono" title={`${c.old} → ${c.new}`}>
                  {c.field.split("/").slice(-1)[0]} → {c.new}
                </span>
              </div>
            ))}
            {blocked && <Callout level="warn">Titik merah = lokasi tujuan belum ada. Salin asetnya dulu, lalu preview ulang.</Callout>}
          </div>
        )}
      </Step>
    </Card>
  );
}

export default function DataPage() {
  const { data: storage, reload } = useApi<Storage>("/api/storage");
  const { data: access } = useApi<Access>("/api/access/info");
  if (!storage || !access) return <Loading />;
  const c = storage.counts;
  return (
    <div className="space-y-6">
      <PageHeader eyebrow="DATA & LAN" title="Riwayat aman, bisa dibawa ke mana saja." />
      <Card>
        <CardTitle icon={<Database size={18} />} sub={<span className="break-all font-mono text-xs">{storage.path}</span>}>
          Database {storage.engine}
        </CardTitle>
        <div className="grid grid-cols-2 gap-5 md:grid-cols-5">
          <Stat label="eksperimen" value={c.jobs} />
          <Stat label="sesi training" value={c.runs} />
          <Stat label="observasi loss/LR" value={c.metrics.toLocaleString("id-ID")} />
          <Stat label="dataset" value={c.datasets} />
          <Stat label="versi dataset" value={c.dataset_versions} />
        </div>
      </Card>
      <div className="grid gap-6 xl:grid-cols-2">
        <LanCard access={access} />
        <MoveCard onImported={reload} />
      </div>
      <p className="flex items-center gap-2 text-xs text-ink-400">
        <Network size={13} /> Gambar, checkpoint, dan environment Python tidak masuk ZIP — salin manual sesuai langkah 2.
      </p>
    </div>
  );
}
