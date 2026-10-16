export type Level = "ok" | "info" | "warn" | "bad";
export type Note = { level: Level; msg: string };

export type ModelSpec = {
  id: string; label: string; vendor: string; backends: string[]; hf: string; license: string;
  arch: string[]; caption_style: "natural" | "tags"; caption_hint: string; notes: string[];
  sample_defaults: { guidance: number; steps: number; width: number; height: number; neg: string };
};
export type Goal = { label: string; desc: string; dataset: string };
export type Param = {
  key: string; label: string; group: string; type: "int" | "float" | "bool" | "select" | "multiselect";
  min?: number; max?: number; step?: number | string; options?: (string | number)[];
  what: string; up?: string; down?: string; tip?: string;
  only_backend?: string; only_model?: string;
  level?: "pemula" | "menengah" | "lanjut"; analogy?: string; formula?: string;
  per_model?: Record<string, string>; too_high?: string[]; too_low?: string[]; mistakes?: string[];
};
export type Mistake = {
  id: string; title: string; category: string; severity: "rendah" | "sedang" | "tinggi";
  symptoms: string[]; cause: string; fix: string[]; params: string[];
};
export type Concept = { id: string; term: string; short: string; body: string };
export type Catalog = {
  models: Record<string, ModelSpec>; goals: Record<string, Goal>; vram_tiers: number[];
  params: Param[]; mistakes: Mistake[]; concepts: Concept[];
};

export type Params = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

export type Recommendation = { params: Params; reasons: string[]; warnings: string[] };
export type Analysis = {
  notes: Note[]; effective_lr: number; exposure: number; checkpoints: number;
  vram: { total_gb: number; parts: { label: string; gb: number }[]; note: string };
  lr_schedule: { step: number; lr: number }[];
};

export type Backend = { path: string; found: boolean; python: string; supports_qwen_image_2?: boolean; supports_anima?: boolean };
export type Status = {
  backends: Record<string, Backend>;
  gpus: { name: string; mem_total_mb: number; mem_used_mb: number; util: number; temp: number }[];
  host: { os: string; python: string; disk_free_gb: number; data_dir: string };
};

export type DatasetSummary = {
  name: string; path: string; linked: boolean; trigger_word: string; caption_style: "natural" | "tags";
  notes: string; count: number; captioned: number; cover: string | null;
};
export type DatasetItem = { file: string; caption: string; width: number; height: number; alpha: boolean; size_kb: number };
export type DatasetDetail = DatasetSummary & {
  items: DatasetItem[];
  stats: {
    warnings: Note[]; small: string[]; missing: string[]; no_trigger: string[];
    top_tags: [string, number][]; avg_words: number; captions_have_trigger: boolean;
  };
};

export type JobStatus = "draft" | "queued" | "running" | "completed" | "failed" | "stopped";
export type Evaluation = { likeness?: number; flexibility?: number; quality?: number; note?: string };
export type Job = {
  id: string; name: string; model: string; backend: string; dataset: string; trigger_word: string;
  goal: string; vram: number; params: Params; notes: string; status: JobStatus;
  created: number; started: number | null; finished: number | null;
  progress: { step: number; total: number; loss: number | null; eta: string | null; phase?: string | null };
  error: string | null; error_hint: string | null; exit_code?: number;
  command_text?: string; config_files?: string[]; evaluations?: Record<string, Evaluation>;
};
export type Outputs = {
  root: string;
  samples: { file: string; step: number | null; index: number }[];
  checkpoints: { file: string; step: number | null; size_mb: number; mtime: number }[];
};
export type Insight = { level: Level; title: string; detail: string; action?: string | null; mistake?: string; mistake_title?: string };
export type Suggestion = { param: string | null; from: unknown; to: unknown; why: string };
export type Advice = { best_step: number | null; best?: Evaluation; summary: string | null; suggestions: Suggestion[] };
export type Insights = {
  health: number;
  summary: {
    n: number; first_ema?: number; last_ema?: number; min?: number; change_pct?: number; tail_trend?: number;
    noise?: number; spike_ratio?: number; nan_steps: number[];
    series?: { step: number; loss: number; ema: number }[];
  };
  insights: Insight[];
  lr_schedule: { step: number; lr: number }[];
  epoch_marks: { step: number; label: string }[];
  effective_lr: number; exposure: number; advice: Advice;
};
export type CompareRow = {
  id: string; name: string; model: string; status: JobStatus; dataset: string; notes: string;
  params: Params; progress: Job["progress"]; evaluations: Record<string, Evaluation>; advice: Advice;
  loss: { first_ema?: number; last_ema?: number; min?: number; change_pct?: number; noise?: number };
  series: { step: number; ema: number }[];
};
