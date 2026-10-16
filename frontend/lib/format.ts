export function fmtNum(v: unknown): string {
  if (v === null || v === undefined || v === "") return "–";
  const n = Number(v);
  if (!Number.isFinite(n)) return String(v);
  if (n !== 0 && (Math.abs(n) < 1e-3 || Math.abs(n) >= 1e5)) return n.toExponential(1);
  return String(Math.round(n * 10000) / 10000);
}
export function fmtTime(ts: number | null | undefined): string {
  if (!ts) return "–";
  return new Date(ts * 1000).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" });
}
export function fmtDur(sec: number | null | undefined): string {
  if (!sec || sec < 0) return "–";
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = Math.floor(sec % 60);
  return h ? `${h}j ${m}m` : m ? `${m}m ${s}d` : `${s}d`;
}
export function fmtValue(v: unknown): string {
  if (Array.isArray(v)) return v.join(", ");
  if (typeof v === "boolean") return v ? "on" : "off";
  if (typeof v === "number") return fmtNum(v);
  return v === undefined || v === null || v === "" ? "–" : String(v);
}
export const modelLabel = (m: string) => (m === "anima" ? "Anima" : m === "qwen_image_2" ? "Qwen 2.1" : m);
