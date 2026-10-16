"use client";
import { Bot, Database, KeyRound, Save, Server } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { Callout, Card, CardTitle, Loading, PageHeader, useUI } from "@/components/ui";
import { api } from "@/lib/api";
import { useApi } from "@/lib/hooks";
import type { Backend, Status } from "@/lib/types";

type F = [key: string, label: string, hint: string, type?: string];
const SECTIONS: { title: string; icon: ReactNode; backend?: string; fields: F[] }[] = [
  { title: "ai-toolkit · Qwen 2.1 & Anima", icon: <Server className="size-4" />, backend: "ai-toolkit", fields: [
    ["ai_toolkit_path", "Folder ai-toolkit", "Hasil git clone github.com/ostris/ai-toolkit (berisi run.py)."],
    ["ai_toolkit_python", "Python ai-toolkit", "Kosongkan untuk deteksi otomatis venv/ atau .venv/ di folder itu."],
  ] },
  { title: "sd-scripts · Anima (opsional)", icon: <Server className="size-4" />, backend: "sd-scripts", fields: [
    ["sd_scripts_path", "Folder sd-scripts", "Hasil git clone github.com/kohya-ss/sd-scripts (berisi anima_train_network.py)."],
    ["sd_scripts_python", "Python sd-scripts", "Kosongkan untuk deteksi otomatis."],
    ["anima_dit_path", "Anima DiT (.safetensors)", "circlestone-labs/Anima → split_files/diffusion_models (versi Base)."],
    ["anima_qwen3_path", "Qwen3-0.6B text encoder", "split_files/text_encoders."],
    ["anima_vae_path", "Qwen-Image VAE", "split_files/vae."],
  ] },
  { title: "HuggingFace", icon: <KeyRound className="size-4" />, fields: [["hf_token", "HF token", "Opsional — untuk repo gated atau download lebih cepat.", "password"]] },
  { title: "Auto-caption (vision lokal)", icon: <Bot className="size-4" />, fields: [
    ["caption_api_base", "Endpoint OpenAI-compatible", "Ollama: http://localhost:11434/v1 · LM Studio: http://localhost:1234/v1"],
    ["caption_model", "Nama model", "contoh: qwen2.5vl:7b, gemma3:12b"],
    ["caption_api_key", "API key", "Biasanya kosong untuk server lokal.", "password"],
  ] },
];

export default function Settings() {
  const { data, reload } = useApi<Record<string, string>>("/api/settings");
  const { data: st, reload: reloadSt } = useApi<Status>("/api/status");
  const [form, setForm] = useState<Record<string, string>>({});
  const { toast } = useUI();
  useEffect(() => { if (data) setForm(data); }, [data]);
  if (!data) return <Loading />;
  const save = async () => {
    try { await api.put("/api/settings", form); toast("Pengaturan disimpan"); reload(); reloadSt(); } catch (e) { toast((e as Error).message, "bad"); }
  };
  return (
    <div>
      <PageHeader title="Pengaturan" subtitle="Lokasi backend training, model, dan layanan auto-caption." actions={<button className="btn btn-primary" onClick={save}><Save className="size-4" />Simpan</button>} />
      <div className="grid gap-6 lg:grid-cols-2">
        {SECTIONS.map((s) => {
          const b: Backend | undefined = s.backend ? st?.backends[s.backend] : undefined;
          return (
            <Card key={s.title}>
              <CardTitle icon={s.icon}>{s.title}</CardTitle>
              {s.backend && b && (b.found
                ? <Callout level="ok" className="mb-4">Ditemukan · python <code className="font-mono text-xs">{b.python}</code></Callout>
                : <Callout level="warn" className="mb-4">Belum ditemukan di <code className="font-mono text-xs">{b.path || "(kosong)"}</code></Callout>)}
              <div className="space-y-4">
                {s.fields.map(([k, label, hint, type]) => (
                  <div key={k}>
                    <div className="label">{label}</div>
                    <input className="input font-mono text-[13px]" type={type || "text"} value={form[k] ?? ""} onChange={(e) => setForm({ ...form, [k]: e.target.value })} />
                    <p className="mt-1.5 text-xs text-ink-400">{hint}</p>
                  </div>
                ))}
              </div>
            </Card>
          );
        })}
      </div>
      <Card className="mt-6">
        <CardTitle icon={<Database className="size-4" />}>Instalasi cepat backend</CardTitle>
        <pre className="rounded-xl bg-ink-950/70 p-4 font-mono text-[12.5px] text-ink-200">{`# Linux / WSL
bash scripts/install_backends.sh              # ai-toolkit
bash scripts/install_backends.sh --sd-scripts # + sd-scripts

# Windows
scripts\\install_backends.bat [--sd-scripts]`}</pre>
        <p className="mt-3 text-sm text-ink-400">Path default <code className="kbd">backends/ai-toolkit</code> dan <code className="kbd">backends/sd-scripts</code> terdeteksi otomatis. Data studio: <code className="kbd">{st?.host.data_dir}</code></p>
      </Card>
    </div>
  );
}
