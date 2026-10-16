// Same-origin in production (FastAPI serves the static export).
// During `next dev` (port 3000) talk to the API directly on :7860.
export function apiBase(): string {
  if (process.env.NEXT_PUBLIC_API_URL) return process.env.NEXT_PUBLIC_API_URL;
  if (typeof window === "undefined") return "";
  if (window.location.port === "3000") return `${window.location.protocol}//${window.location.hostname}:7860`;
  return "";
}

export const url = (path: string) => `${apiBase()}${path}`;
export const enc = encodeURIComponent;

async function req<T>(method: string, path: string, body?: unknown, form?: FormData): Promise<T> {
  const init: RequestInit = { method, headers: {} };
  if (form) init.body = form;
  else if (body !== undefined) {
    (init.headers as Record<string, string>)["Content-Type"] = "application/json";
    init.body = JSON.stringify(body);
  }
  const r = await fetch(url(path), init);
  const ct = r.headers.get("content-type") || "";
  const data = ct.includes("json") ? await r.json() : await r.text();
  if (!r.ok) {
    const d = (data as { detail?: unknown })?.detail;
    throw new Error(typeof d === "string" ? d : d ? JSON.stringify(d) : r.statusText);
  }
  return data as T;
}

export const api = {
  get: <T>(p: string) => req<T>("GET", p),
  post: <T>(p: string, b: unknown = {}) => req<T>("POST", p, b),
  put: <T>(p: string, b: unknown) => req<T>("PUT", p, b),
  patch: <T>(p: string, b: unknown) => req<T>("PATCH", p, b),
  del: <T>(p: string) => req<T>("DELETE", p),
  upload: <T>(p: string, f: FormData) => req<T>("POST", p, undefined, f),
};
