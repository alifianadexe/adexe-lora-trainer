"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FolderOpen, ImagePlus, Images, Plus } from "lucide-react";
import { useState } from "react";
import { Card, Empty, Loading, Modal, PageHeader, Segmented, useUI } from "@/components/ui";
import { api, enc, url } from "@/lib/api";
import { useApi } from "@/lib/hooks";
import type { DatasetSummary } from "@/lib/types";

export default function DatasetsPage() {
  const { data, loading } = useApi<DatasetSummary[]>("/api/datasets");
  const [open, setOpen] = useState(false);
  return (
    <div>
      <PageHeader
        title="Dataset"
        subtitle="Kualitas dataset menentukan sebagian besar kualitas LoRA. Parameter terbaik tidak bisa menyelamatkan dataset yang buruk."
        actions={
          <button className="btn btn-primary" onClick={() => setOpen(true)}>
            <Plus className="size-4" />
            Dataset baru
          </button>
        }
      />
      {loading ? (
        <Loading />
      ) : data?.length ? (
        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
          {data.map((d) => (
            <Link key={d.name} href={`/datasets/view/?name=${enc(d.name)}`} className="card card-hover group overflow-hidden p-0">
              <div className="relative aspect-[4/3] overflow-hidden bg-ink-950">
                {d.cover ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={url(`/api/datasets/${enc(d.name)}/thumb/${enc(d.cover)}`)}
                    alt=""
                    className="size-full object-cover transition duration-500 group-hover:scale-105"
                  />
                ) : (
                  <div className="grid size-full place-items-center text-ink-400">
                    <Images className="size-8" />
                  </div>
                )}
                <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-ink-950/90 to-transparent" />
                <div className="absolute bottom-3 left-4 right-4 flex items-end justify-between">
                  <div className="font-semibold">{d.name}</div>
                  {d.trigger_word && <span className="chip border-brand-400/30 bg-brand-500/20 text-brand-100">{d.trigger_word}</span>}
                </div>
              </div>
              <div className="p-4">
                <div className="flex justify-between text-sm">
                  <span className="text-ink-300">{d.count} gambar</span>
                  <span className="text-ink-400">
                    {d.captioned}/{d.count} caption
                  </span>
                </div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/5">
                  <div
                    className="h-full bg-gradient-to-r from-brand-500 to-cyan-400"
                    style={{ width: `${d.count ? (100 * d.captioned) / d.count : 0}%` }}
                  />
                </div>
                <div className="mt-3 flex gap-1.5">
                  <span className="chip">{d.caption_style === "tags" ? "tag Danbooru" : "kalimat natural"}</span>
                  {d.linked && (
                    <span className="chip">
                      <FolderOpen className="size-3" />
                      tertaut
                    </span>
                  )}
                </div>
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <Card>
          <Empty icon={<ImagePlus className="size-5" />} title="Belum ada dataset">
            Buat dataset, upload gambar, lalu tulis caption untuk setiap gambar.
            <div className="mt-4">
              <button className="btn btn-primary" onClick={() => setOpen(true)}>
                Buat dataset pertama
              </button>
            </div>
          </Empty>
        </Card>
      )}
      <CreateDataset open={open} onClose={() => setOpen(false)} />
    </div>
  );
}

function CreateDataset({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const { toast } = useUI();
  const [f, setF] = useState({ name: "", trigger_word: "", caption_style: "natural", linked_path: "" });
  const submit = async () => {
    try {
      const d = await api.post<DatasetSummary>("/api/datasets", f);
      onClose();
      router.push(`/datasets/view/?name=${enc(d.name)}`);
    } catch (e) {
      toast((e as Error).message, "bad");
    }
  };
  return (
    <Modal open={open} onClose={onClose}>
      <h2 className="mb-5 text-lg font-semibold">Dataset baru</h2>
      <div className="space-y-4">
        <div>
          <div className="label">Nama</div>
          <input
            className="input"
            placeholder="aiko_character"
            value={f.name}
            onChange={(e) => setF({ ...f, name: e.target.value })}
            autoFocus
          />
        </div>
        <div>
          <div className="label">Trigger word</div>
          <input
            className="input"
            placeholder="ak1k0"
            value={f.trigger_word}
            onChange={(e) => setF({ ...f, trigger_word: e.target.value })}
          />
          <p className="mt-1.5 text-xs text-ink-400">
            Kata langka tanpa arti kuat. Hindari kata umum seperti &quot;girl&quot; atau nama terkenal — model sudah punya asosiasi yang
            akan bentrok.
          </p>
        </div>
        <div>
          <div className="label">Gaya caption</div>
          <Segmented
            value={f.caption_style}
            onChange={(v) => setF({ ...f, caption_style: v })}
            options={[
              { value: "natural", label: "Kalimat natural · Qwen" },
              { value: "tags", label: "Tag Danbooru · Anima" },
            ]}
          />
        </div>
        <div>
          <div className="label">Tautkan folder lokal (opsional)</div>
          <input
            className="input font-mono text-xs"
            placeholder="/home/kamu/dataset/aiko"
            value={f.linked_path}
            onChange={(e) => setF({ ...f, linked_path: e.target.value })}
          />
          <p className="mt-1.5 text-xs text-ink-400">Studio memakai folder itu langsung tanpa menyalin. Caption .txt ditulis di sana.</p>
        </div>
      </div>
      <div className="mt-6 flex justify-end gap-2">
        <button className="btn" onClick={onClose}>
          Batal
        </button>
        <button className="btn btn-primary" onClick={submit}>
          Buat dataset
        </button>
      </div>
    </Modal>
  );
}
