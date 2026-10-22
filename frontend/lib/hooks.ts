"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "./api";
import type { Catalog } from "./types";

/** Fetch JSON, optionally polling while `pollMs` is set. */
export function useApi<T>(path: string | null, pollMs?: number | false) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(!!path);
  const pathRef = useRef(path);
  pathRef.current = path;

  const reload = useCallback(async () => {
    if (!pathRef.current) return;
    try {
      const d = await api.get<T>(pathRef.current);
      setData(d);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!path) return;
    setLoading(true);
    reload();
    if (!pollMs) return;
    const t = setInterval(reload, pollMs);
    return () => clearInterval(t);
  }, [path, pollMs, reload]);

  return { data, error, loading, reload, setData };
}

let catalogCache: Promise<Catalog> | null = null;
export function useCatalog(): Catalog | null {
  const [cat, setCat] = useState<Catalog | null>(null);
  useEffect(() => {
    if (!catalogCache) catalogCache = api.get<Catalog>("/api/catalog");
    catalogCache.then(setCat).catch(() => {
      catalogCache = null;
    });
  }, []);
  return cat;
}

export function useDebounced<T>(value: T, ms = 300): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}
