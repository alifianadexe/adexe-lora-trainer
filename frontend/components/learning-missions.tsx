"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight, BookOpen, Check, CheckCircle2, Lightbulb, RotateCcw, Target } from "lucide-react";
import { Card, cx } from "./ui";

const MISSIONS = [
  {
    id: "checkpoint", title: "Pilih checkpoint", tag: "Evaluasi", minutes: "2 menit",
    question: "Loss terus turun. Checkpoint mana yang kamu pilih untuk produksi?",
    intro: "Nilai tiga checkpoint pada prompt, seed, dan referensi yang sama. Angka di bawah adalah contoh latihan.",
    rows: [
      ["Step 750", "0.24", "3/5", "5/5", "Identitas masih berubah"],
      ["Step 1.500", "0.19", "5/5", "4/5", "Identitas pas, pose baru diikuti"],
      ["Step 2.500", "0.15", "5/5", "1/5", "Pose kembali ke data latihan"],
    ],
    choices: ["Step 750 · fleksibilitas tertinggi", "Step 1.500 · identitas dan fleksibilitas seimbang", "Step 2.500 · loss terendah"],
    answer: 1,
    explanation: "Step 1.500 paling sesuai untuk skenario ini: identitas sudah kuat dan model masih mengikuti pose baru. Loss membantu memantau proses, sedangkan pemilihan checkpoint membutuhkan evaluasi hasil pada beberapa prompt.",
    hint: "Cari model yang mengenali karakter sekaligus tetap mengikuti arahan baru.", href: "/jobs/", action: "Buka evaluasi training",
  },
  {
    id: "comparison", title: "Eksperimen yang adil", tag: "Generate", minutes: "1 menit",
    question: "Kamu ingin tahu apakah guidance 3 lebih cocok daripada 2,5. Apa yang perlu kamu lakukan?",
    intro: "Bandingkan dua pengaturan tanpa membiarkan perubahan lain menyamarkan hasilnya.",
    rows: null,
    choices: ["Ganti guidance, seed, dan prompt sekaligus", "Pakai seed acak baru untuk setiap hasil", "Pertahankan seed, prompt, sketch, referensi, dan checkpoint; ubah guidance saja"],
    answer: 2,
    explanation: "Ubah satu faktor dalam setiap perbandingan. Seed yang tetap membantu mengurangi variasi noise. Setelah menemukan pengaturan yang menjanjikan, uji pada beberapa seed dan adegan untuk melihat apakah hasilnya konsisten.",
    hint: "Bayangkan dua foto percobaan: apa yang harus sama agar pengaruh guidance terlihat?", href: "/generate/", action: "Buka Generate Studio",
  },
  {
    id: "pairs", title: "Periksa pasangan data", tag: "Dataset", minutes: "1 menit",
    question: "Ada 40 target dan 40 sketch, tetapi nama file berbeda. Apakah dataset conditioning sudah siap?",
    intro: "Target berisi panel_001.png hingga panel_040.png. Sketch berisi sketch_001.png hingga sketch_040.png.",
    rows: null,
    choices: ["Siap, jumlah file sudah sama", "Cocokkan setiap pasangan dan samakan nama dasarnya terlebih dahulu", "Tambahkan training steps supaya model menemukan pasangannya"],
    answer: 1,
    explanation: "Jumlah yang sama belum menjamin pasangannya benar. Pastikan target, sketch, dan referensi berasal dari panel yang sama serta memakai nama dasar file yang sama. Steps tambahan tidak memperbaiki pasangan yang salah.",
    hint: "Model perlu menerima sketch yang memang sesuai dengan gambar targetnya.", href: "/datasets/", action: "Periksa dataset",
  },
] as const;

export function LearningMissions() {
  const [index, setIndex] = useState(0);
  const [choice, setChoice] = useState<number | null>(null);
  const [checked, setChecked] = useState(false);
  const [hint, setHint] = useState(false);
  const [completed, setCompleted] = useState<string[]>([]);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    try {
      const saved: unknown = JSON.parse(localStorage.getItem("adexe-learning-missions-v1") || "[]");
      if (Array.isArray(saved)) setCompleted(saved.filter((id): id is string => typeof id === "string" && MISSIONS.some(m => m.id === id)));
    } catch {}
    setLoaded(true);
  }, []);
  useEffect(() => {
    if (loaded) try { localStorage.setItem("adexe-learning-missions-v1", JSON.stringify(completed)); } catch {}
  }, [completed, loaded]);
  const mission = MISSIONS[index];
  const correct = checked && choice === mission.answer;
  function selectMission(next: number) { setIndex(next); setChoice(null); setChecked(false); setHint(false); }
  function check() {
    setChecked(true);
    if (choice === mission.answer) setCompleted(prev => prev.includes(mission.id) ? prev : [...prev, mission.id]);
  }
  return <section aria-label="Misi belajar interaktif" className="mb-8">
    <Card className="!p-0 overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[var(--stroke)] bg-brand-500/[0.04] p-5 md:px-6">
        <div>
          <div className="section-title mb-2 flex items-center gap-2"><Target size={14} /> Belajar lewat keputusan</div>
          <h2 className="text-lg font-semibold">Coba, pahami, lalu praktikkan.</h2>
          <p className="mt-1 text-xs text-ink-400">Tiga misi singkat · berjalan di browser · tanpa GPU</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right"><div className="text-sm font-semibold tabular-nums">{completed.length}/{MISSIONS.length}</div><div className="text-[11px] text-ink-400">misi dipahami</div></div>
          <svg width="42" height="42" viewBox="0 0 42 42" aria-hidden><circle cx="21" cy="21" r="17" fill="none" stroke="var(--stroke)" strokeWidth="4" /><circle cx="21" cy="21" r="17" fill="none" stroke="var(--color-brand-500)" strokeWidth="4" strokeDasharray={`${107 * completed.length / MISSIONS.length} 107`} strokeLinecap="round" transform="rotate(-90 21 21)" /></svg>
        </div>
      </div>
      <div className="grid lg:grid-cols-[240px_1fr]">
        <nav className="flex gap-2 overflow-x-auto border-b border-[var(--stroke)] p-4 lg:flex-col lg:border-b-0 lg:border-r" aria-label="Pilih misi">
          {MISSIONS.map((m, i) => <button key={m.id} onClick={() => selectMission(i)} aria-pressed={index === i} className={cx("flex shrink-0 items-center gap-3 rounded-xl border p-3 text-left transition", index === i ? "border-brand-500/30 bg-brand-500/[0.08]" : "border-transparent hover:bg-ink-800/60")}>
            <span className={cx("grid size-7 shrink-0 place-items-center rounded-lg text-xs", completed.includes(m.id) ? "bg-emerald-500/10 text-emerald-600" : "bg-ink-800 text-ink-400")}>{completed.includes(m.id) ? <Check size={15} /> : `0${i + 1}`}</span>
            <span><span className="block text-xs font-semibold">{m.title}</span><span className="mt-1 block text-[11px] text-ink-400">{m.tag} · {m.minutes}</span></span>
          </button>)}
          <button className="mt-auto flex items-center gap-2 px-3 py-2 text-xs text-ink-400 hover:text-brand-400" onClick={() => { setCompleted([]); selectMission(0); }}><RotateCcw size={12} /> Ulangi semua misi</button>
        </nav>
        <div className="min-w-0 space-y-5 p-5 md:p-6">
          <div><span className="chip mb-3">Misi {index + 1} · {mission.tag}</span><h3 className="text-base font-semibold leading-6">{mission.question}</h3><p className="mt-2 text-sm leading-6 text-ink-300">{mission.intro}</p></div>
          {mission.rows && <div className="overflow-x-auto rounded-xl border border-[var(--stroke)]"><table className="w-full min-w-[570px] text-left text-xs"><thead className="bg-ink-950 text-ink-400"><tr>{["Checkpoint", "Loss ↓", "Identitas", "Fleksibilitas", "Preview"].map(h => <th key={h} className="px-3 py-2.5 font-medium">{h}</th>)}</tr></thead><tbody>{mission.rows.map(row => <tr key={row[0]} className="border-t border-[var(--stroke)]">{row.map((cell, i) => <td key={i} className={cx("px-3 py-3", i === 0 ? "font-medium" : "text-ink-300")}>{cell}</td>)}</tr>)}</tbody></table></div>}
          <div className="space-y-2" role="group" aria-label="Pilihan jawaban">
            {mission.choices.map((answer, i) => <button key={answer} aria-pressed={choice === i} onClick={() => { setChoice(i); setChecked(false); }} className={cx("flex w-full items-center gap-3 rounded-xl border p-3 text-left text-sm transition", choice === i ? "border-brand-500/60 bg-brand-500/[0.06]" : "border-[var(--stroke)] hover:border-brand-500/30")}><span className={cx("grid size-6 shrink-0 place-items-center rounded-full border text-[11px]", choice === i ? "border-brand-500 bg-brand-500 text-white" : "border-[var(--stroke)] text-ink-400")}>{String.fromCharCode(65 + i)}</span>{answer}</button>)}
          </div>
          {hint && <p className="rounded-xl bg-amber-500/[0.08] p-3 text-sm leading-6 text-ink-300">{mission.hint}</p>}
          {checked && <div role="status" className={cx("rounded-xl border p-4", correct ? "border-emerald-500/25 bg-emerald-500/[0.06]" : "border-amber-500/25 bg-amber-500/[0.06]")}><div className="mb-2 flex items-center gap-2 text-sm font-semibold">{correct ? <CheckCircle2 size={16} /> : <Lightbulb size={16} />}{correct ? "Tepat. Ini alasan di baliknya." : "Coba pertimbangkan lagi."}</div><p className="text-sm leading-6 text-ink-300">{correct ? mission.explanation : mission.hint}</p>{correct && <Link href={mission.href} className="mt-3 inline-flex items-center gap-2 text-xs font-medium text-brand-400">{mission.action}<ArrowRight size={13} /></Link>}</div>}
          <div className="flex flex-wrap items-center gap-3"><button className="btn btn-primary" disabled={choice === null} onClick={check}>Periksa jawaban</button>{correct && index < MISSIONS.length - 1 ? <button className="btn" onClick={() => selectMission(index + 1)}>Misi berikutnya <ArrowRight size={14} /></button> : <button className="btn !border-transparent !bg-transparent !text-ink-400" onClick={() => setHint(!hint)}><Lightbulb size={14} /> {hint ? "Sembunyikan petunjuk" : "Petunjuk"}</button>}<span className="ml-auto flex items-center gap-1.5 text-[11px] text-ink-400"><BookOpen size={12} /> Progres tersimpan di browser ini</span></div>
        </div>
      </div>
    </Card>
  </section>;
}
