"use client";
import { useEffect, useState, type ReactNode } from "react";
import { LockKeyhole } from "lucide-react";
import { api } from "@/lib/api";
export function AccessGate({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    api
      .get<{ authorized: boolean }>("/api/access/info")
      .then((x) => setReady(x.authorized))
      .catch(() => setError("Server belum terhubung. Pastikan studio sedang berjalan."));
  }, []);
  const login = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.post("/api/access/login", { code });
      setReady(true);
    } catch (e) {
      setError((e as Error).message);
    }
  };
  if (ready) return children;
  return (
    <div className="grid min-h-screen place-items-center p-6">
      <form onSubmit={login} className="card w-full max-w-md space-y-5">
        <LockKeyhole className="text-brand-400" size={30} />
        <div>
          <div className="section-title mb-2">ADEXE / PRIVATE WORKSPACE</div>
          <h1 className="text-2xl font-semibold">Masuk ke studio.</h1>
          <p className="mt-3 text-sm leading-6 text-ink-400">
            Minta kode akses dari halaman Data & LAN pada komputer yang menjalankan studio.
          </p>
        </div>
        <input
          aria-label="Kode akses LAN"
          className="input font-mono"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          type="password"
          autoComplete="current-password"
          placeholder="Kode akses"
          required
        />
        <button className="btn btn-primary w-full" type="submit">
          Hubungkan
        </button>
        {error && (
          <p role="alert" className="text-sm text-rose-300">
            {error}
          </p>
        )}
        <p className="text-xs text-ink-400">Sesi LAN berlaku 12 jam. Komputer host terhubung otomatis.</p>
      </form>
    </div>
  );
}
