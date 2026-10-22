"use client";
import { useEffect, useState } from "react";
import { Heart, Search } from "lucide-react";
import { Job } from "./api";
import { JobView } from "./job";
import { Pill } from "./ui";
export function Gallery({ jobs, onChanged }: { jobs: Job[]; onChanged: () => void }) {
  const [filter, setFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const [sort, setSort] = useState("newest");
  const [favorites, setFavorites] = useState<string[]>([]);
  useEffect(() => {
    try { const saved = JSON.parse(localStorage.getItem("adexe-favorite-artworks") || "[]"); if (Array.isArray(saved)) setFavorites(saved.filter((id): id is string => typeof id === "string")); } catch {}
  }, []);
  useEffect(() => {
    if (!open) return;
    const key = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(null); };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [open]);
  function favorite(id: string) {
    setFavorites(current => {
      const next = current.includes(id) ? current.filter(item => item !== id) : [...current, id];
      try { localStorage.setItem("adexe-favorite-artworks", JSON.stringify(next)); } catch {}
      return next;
    });
  }
  const list = jobs.filter((j) => (filter === "all" || (filter === "favorites" && favorites.includes(j.id)) || j.status === filter || (filter === "s2f" && j.params.mode === "s2f"))
    && `${j.params.characters.join(" ")} ${j.name || ""} ${j.batch || ""}`.toLowerCase().includes(query.toLowerCase())).sort((a, b) => sort === "oldest" ? a.created - b.created : b.created - a.created);
  const opened = jobs.find((j) => j.id === open) || null;
  return (
    <div className="card">
      <div className="card-head">
        <div><span className="eyebrow">Koleksi</span><h2>Galeri <small className="muted">{list.length}</small></h2></div>
        <div className="row tight">
          <input aria-label="Cari karya" placeholder="Cari karakter / file / batch…" value={query} onChange={(e) => setQuery(e.target.value)} />
          <select aria-label="Filter galeri" value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="all">Semua</option><option value="favorites">Favorit</option><option value="s2f">Sketch → Final</option><option value="done">Selesai</option>
            <option value="running">Diproses</option><option value="queued">Antrean</option><option value="error">Gagal</option>
          </select>
          <select aria-label="Urutan karya" value={sort} onChange={e => setSort(e.target.value)}><option value="newest">Terbaru dahulu</option><option value="oldest">Terlama dahulu</option></select>
        </div>
      </div>
      {!list.length ? <div className="empty"><Search size={28} className="mx-auto mb-3 text-ink-400" /><h3>{filter === "favorites" ? "Koleksi pilihanmu dimulai di sini." : "Belum ada karya yang cocok."}</h3><p className="muted">{filter === "favorites" ? "Tandai karya dengan ikon hati. Favorit disimpan di browser ini." : "Coba kata pencarian atau filter lain."}</p></div> : (
        <div className="gallery">
          {list.map((j) => (
            <article key={j.id} className="g-item">
            <button className="artwork-open" aria-label={`Buka ${j.name || j.params.characters.join(", ")}`} onClick={() => setOpen(j.id)}>
              <div className={`pair ${j.urls.lineart ? "" : "single"}`}>
                {j.urls.final ? <img src={j.urls.final} alt="" loading="lazy" /> : j.urls.sketch ? <img src={j.urls.sketch} alt="" loading="lazy" /> : <div className="ph" />}
                {j.urls.lineart && <img src={j.urls.lineart} alt="" loading="lazy" />}
              </div>
            </button>
              <div className="item-meta"><span className="fname" title={j.name || j.params.characters.join(", ")}>{j.name || j.params.characters.join(", ")}</span><button className={`favorite-toggle ${favorites.includes(j.id) ? "is-favorite" : ""}`} aria-label={favorites.includes(j.id) ? "Hapus dari favorit" : "Simpan ke favorit"} aria-pressed={favorites.includes(j.id)} onClick={() => favorite(j.id)}><Heart size={15} fill={favorites.includes(j.id) ? "currentColor" : "none"} /></button></div>
              <div className="item-meta"><Pill job={j} /><span className="small muted">{new Date(j.created * 1000).toLocaleDateString("id-ID", { day: "numeric", month: "short" })}</span></div>
            </article>
          ))}
        </div>
      )}
      {opened && (
        <div className="modal" role="dialog" aria-modal="true" aria-label="Detail karya" onClick={() => setOpen(null)}>
          <div className="modal-body card" onClick={(e) => e.stopPropagation()}>
            <button className="btn ghost lb-close" onClick={() => setOpen(null)} aria-label="Tutup">✕</button>
            <JobView job={opened} onCreated={(j) => { setOpen(j.id); onChanged(); }} onChanged={onChanged} />
          </div>
        </div>
      )}
    </div>
  );
}
