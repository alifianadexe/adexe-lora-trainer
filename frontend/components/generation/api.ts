import { url } from "@/lib/api";
export type LoraOption = { id: string; label: string; available: boolean; uses_reference?: boolean };

export type Appearance = { hair: string; eyes: string; glasses: boolean; traits: string; caption: string; chibi?: string };

export type Options = {
  characters: string[];
  outfit_presets: Record<string, string[]>;
  prop_presets: string[];
  age_variants: string[];
  stage1_loras: LoraOption[];
  stage2_loras: LoraOption[];
  outputs: Record<string, [number, number]>;
  max_characters: number;
  s2f: {
    characters: Record<string, Appearance>;
    checkpoints: { id: string; label: string; available: boolean; default: boolean }[];
    defaults: { guidance: number; steps: number; stroke_px: number; outputs_dir: string };
  };
};

export type JobParams = {
  mode?: "s2f";
  characters: string[];
  seed: number;
  sizes: string[];
  stage1_lora?: string;
  stage2_lora?: string;
  prompt_stage1?: string;
  prompt_stage2?: string;
  prompt_s2f?: string;
  checkpoint?: string;
  guidance?: number;
  steps?: number;
  stroke_px?: number;
  lineart_fills?: boolean;
  lineart_from_upscaled?: boolean;
  chibi?: boolean;
  scene?: string;
  expression?: string;
  skip_stage1: boolean;
  parent?: string | null;
};

export type Job = {
  id: string;
  created: number;
  finished: number | null;
  status: "queued" | "running" | "done" | "error" | "cancelled";
  stage: string;
  step: number;
  total: number;
  message: string;
  error: string | null;
  batch: string | null;
  name: string | null;
  params: JobParams;
  files: Record<string, string>;
  urls: Record<string, string>;
  queue_position: number;
};

export type Batch = { batch: string; created: number; n: number; done: number; failed: number; active: number };

export type Health = {
  engine: { state: string; message: string; model_loaded?: boolean; busy?: boolean };
};

/** Adds a query flag to a URL that may already carry a query string. */
export const withQuery = (url: string, q: string) => url + (url.includes("?") ? "&" : "?") + q;

function rewriteUrls(data: any): any {
  if (data?.urls) data.urls = Object.fromEntries(Object.entries(data.urls).map(([k, v]) => [k, url(String(v))]));
  return data;
}

async function read<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let msg = res.statusText;
    try {
      const body = await res.json();
      msg = body.detail || msg;
    } catch {}
    throw new Error(msg);
  }
  const data = await res.json();
  if (Array.isArray(data)) return data.map(rewriteUrls) as T;
  return rewriteUrls(data) as T;
}

const fetch = (path: string, init?: RequestInit) => globalThis.fetch(url(path), { ...init, credentials: "include" });

const post = (url: string, body: object) =>
  fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

export const api = {
  health: () => fetch("/api/generate/health", { cache: "no-store" }).then((r) => read<Health>(r)),
  stopEngine: () => fetch("/api/generate/engine/stop", { method: "POST" }).then((r) => read<unknown>(r)),
  startEngine: () => fetch("/api/generate/engine/start", { method: "POST" }).then((r) => read<unknown>(r)),
  options: () => fetch("/api/generate/options").then((r) => read<Options>(r)),
  preview: (body: object) => post("/api/generate/prompt-preview", body).then((r) => read<{ stage1?: string; stage2?: string; error?: string }>(r)),
  previewS2F: (body: object) => post("/api/generate/s2f/prompt-preview", body).then((r) => read<{ prompt?: string; error?: string }>(r)),
  create: (params: object, sketch: File | null, lineart: File | null) => {
    const fd = new FormData();
    fd.append("params", JSON.stringify(params));
    if (sketch) fd.append("sketch", sketch);
    if (lineart) fd.append("lineart", lineart);
    return fetch("/api/generate/jobs", { method: "POST", body: fd }).then((r) => read<Job>(r));
  },
  derive: (id: string, mode: "stage2" | "all", lineart?: File | null) => {
    const fd = new FormData();
    fd.append("mode", mode);
    if (lineart) fd.append("lineart", lineart);
    return fetch(`/api/generate/jobs/${id}/derive`, { method: "POST", body: fd }).then((r) => read<Job>(r));
  },
  relineart: (id: string, body: { stroke_px?: number; fills?: boolean; from_upscaled?: boolean }) =>
    post(`/api/generate/jobs/${id}/lineart`, body).then((r) => read<Job>(r)),
  jobs: () => fetch("/api/generate/jobs?limit=200", { cache: "no-store" }).then((r) => read<Job[]>(r)),
  job: (id: string) => fetch(`/api/generate/jobs/${id}`, { cache: "no-store" }).then((r) => read<Job>(r)),
  cancel: (id: string) => fetch(`/api/generate/jobs/${id}/cancel`, { method: "POST" }).then((r) => read<unknown>(r)),
  remove: (id: string) => fetch(`/api/generate/jobs/${id}`, { method: "DELETE" }).then((r) => read<unknown>(r)),
  batches: () => fetch("/api/generate/batches", { cache: "no-store" }).then((r) => read<Batch[]>(r)),
  batch: (id: string) => fetch(`/api/generate/batches/${encodeURIComponent(id)}`, { cache: "no-store" }).then((r) => read<Job[]>(r)),
  createBatch: (label: string, settings: object, rows: object[], files: File[]) => {
    const fd = new FormData();
    fd.append("label", label);
    fd.append("settings", JSON.stringify(settings));
    fd.append("rows", JSON.stringify(rows));
    files.forEach((f) => fd.append("sketches", f));
    return fetch("/api/generate/batches", { method: "POST", body: fd }).then((r) => read<{ batch: string; jobs: string[] }>(r));
  },
  zipUrl: (id: string) => url(`/api/generate/batches/${encodeURIComponent(id)}/zip`),
};
