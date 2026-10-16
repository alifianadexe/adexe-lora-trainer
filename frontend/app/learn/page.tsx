"use client";
import Link from "next/link";
import { ArrowRight, BookOpen, Check, FlaskConical, GraduationCap, TriangleAlert, X } from "lucide-react";
import { Card, CardTitle, Loading, PageHeader } from "@/components/ui";
import { useCatalog } from "@/lib/hooks";

const CHAPTERS = [
  ["apa", "Apa itu LoRA?"], ["alur", "Alur kerja"], ["dataset", "Dataset"], ["caption", "Caption & trigger"],
  ["parameter", "Parameter inti"], ["membaca", "Membaca hasil"], ["model", "Resep per model"], ["konsep", "Kamus konsep"],
];

function LoraDiagram() {
  // W (frozen) + B·A (trainable): shows why rank controls capacity and file size
  return (
    <svg viewBox="0 0 560 210" className="w-full" role="img" aria-label="Diagram LoRA: bobot W beku ditambah B kali A">
      <defs>
        <linearGradient id="lg1" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#8b5cf6" /><stop offset="1" stopColor="#d946ef" /></linearGradient>
      </defs>
      <text x="20" y="22" fill="#a3a3bf" fontSize="12">input x</text>
      <rect x="20" y="40" width="130" height="130" rx="10" fill="#1f1f33" stroke="#3a3a55" />
      <text x="85" y="102" fill="#e8e8f3" fontSize="22" textAnchor="middle" fontWeight="600">W</text>
      <text x="85" y="124" fill="#7c7c9c" fontSize="11" textAnchor="middle">d × d · beku ❄</text>
      <text x="185" y="112" fill="#e8e8f3" fontSize="26" textAnchor="middle">+</text>
      <rect x="225" y="40" width="26" height="130" rx="6" fill="url(#lg1)" opacity=".9" />
      <text x="238" y="190" fill="#c4b5fd" fontSize="11" textAnchor="middle">B (d×r)</text>
      <text x="268" y="112" fill="#e8e8f3" fontSize="18" textAnchor="middle">·</text>
      <rect x="285" y="92" width="130" height="26" rx="6" fill="url(#lg1)" opacity=".9" />
      <text x="350" y="138" fill="#c4b5fd" fontSize="11" textAnchor="middle">A (r×d)</text>
      <text x="350" y="80" fill="#f0abfc" fontSize="11" textAnchor="middle">dilatih 🔥</text>
      <text x="445" y="112" fill="#e8e8f3" fontSize="18" textAnchor="middle">×</text>
      <text x="500" y="108" fill="#67e8f9" fontSize="15" textAnchor="middle" fontWeight="600">α / r</text>
      <text x="500" y="128" fill="#7c7c9c" fontSize="11" textAnchor="middle">skala</text>
      <text x="280" y="206" fill="#7c7c9c" fontSize="11.5" textAnchor="middle">output = W·x + (α/r)·B·A·x  — r jauh lebih kecil dari d, jadi B dan A sangat kecil</text>
    </svg>
  );
}

export default function Learn() {
  const cat = useCatalog();
  if (!cat) return <Loading />;
  return (
    <div className="grid gap-8 xl:grid-cols-[220px_1fr]">
      <aside className="hidden xl:block">
        <div className="sticky top-8 space-y-1">
          <div className="section-title mb-2 px-3">Bab</div>
          {CHAPTERS.map(([id, t], i) => (
            <a key={id} href={`#${id}`} className="flex gap-2.5 rounded-lg px-3 py-1.5 text-[13.5px] text-ink-300 hover:bg-white/5 hover:text-white">
              <span className="w-4 text-ink-400 tabular-nums">{i + 1}</span>{t}
            </a>
          ))}
        </div>
      </aside>
      <div className="min-w-0 max-w-4xl space-y-12">
        <PageHeader eyebrow={<span className="flex items-center gap-1.5"><GraduationCap className="size-4" />Akademi LoRA</span>}
          title={<>Dari nol sampai <span className="gradient-text">paham kenapa</span> LoRA-mu bagus atau jelek</>}
          subtitle="Panduan praktis untuk Qwen-Image 2.1 dan Anima Base. Baca berurutan sekali, lalu pakai sebagai referensi." />

        <div className="grid gap-4 md:grid-cols-3">
          {[
            { href: "/learn/params/", icon: BookOpen, t: "Ensiklopedia Parameter", d: `${cat.params.length} parameter dengan analogi, rumus, dan gejala.` },
            { href: "/learn/mistakes/", icon: TriangleAlert, t: "Kesalahan Umum", d: `${cat.mistakes.length} gejala → penyebab → solusi.` },
            { href: "/learn/lab/", icon: FlaskConical, t: "Lab Interaktif", d: "Simulasi LR, paparan, jadwal, timestep, dan loss." },
          ].map(({ href, icon: Icon, t, d }) => (
            <Link key={href} href={href} className="card card-hover group">
              <Icon className="mb-3 size-5 text-brand-300" />
              <div className="font-semibold">{t}</div>
              <div className="mt-1 text-[13px] text-ink-400">{d}</div>
              <ArrowRight className="mt-3 size-4 text-ink-400 transition group-hover:translate-x-1 group-hover:text-brand-300" />
            </Link>
          ))}
        </div>

        <section id="apa" className="scroll-mt-8 space-y-4">
          <h2 className="text-xl font-semibold">1. Apa itu LoRA?</h2>
          <div className="prose-id space-y-3">
            <p>Qwen-Image 2.1 punya ~7 miliar bobot di bagian visualnya. Melatih ulang semuanya butuh puluhan GPU dan berisiko merusak pengetahuan model. <b className="text-white">LoRA (Low-Rank Adaptation)</b> membekukan model asli, lalu menambahkan &quot;tambalan&quot; kecil berupa dua matriks tipis di setiap layer. Hanya tambalan itu yang dilatih.</p>
          </div>
          <Card><LoraDiagram /></Card>
          <Card className="border-brand-500/20 bg-brand-500/[0.05]"><p className="text-[15px] leading-relaxed"><b>Intuisi satu kalimat:</b> LoRA mempelajari <i>perbedaan</i> antara apa yang sudah bisa digambar model dengan dataset-mu — dan perbedaan itu diikat ke kata-kata di caption, terutama trigger word.</p></Card>
        </section>

        <section id="alur" className="scroll-mt-8 space-y-4">
          <h2 className="text-xl font-semibold">2. Alur kerja yang membuatmu cepat belajar</h2>
          <div className="grid gap-3 md:grid-cols-5">
            {[["Dataset", "15–40 gambar bersih & bervariasi"], ["Caption", "sengaja, konsisten, ada trigger"], ["Train v1", "pakai rekomendasi, simpan sering"], ["Evaluasi", "nilai tiap checkpoint"], ["Iterasi", "ubah SATU hal → v2"]].map(([t, d], i) => (
              <div key={t} className="card relative p-4">
                <div className="mb-2 grid size-7 place-items-center rounded-full bg-brand-500/20 text-sm font-semibold text-brand-200">{i + 1}</div>
                <div className="font-semibold">{t}</div><div className="mt-1 text-[12.5px] text-ink-400">{d}</div>
              </div>
            ))}
          </div>
          <p className="text-ink-300">Kesalahan terbesar pemula adalah mengubah lima parameter sekaligus antar run. Hasilnya berbeda, tapi tidak ada yang dipelajari karena tidak tahu perubahan mana penyebabnya. Studio ini menandai hal tersebut di halaman Review dan Bandingkan.</p>
        </section>

        <section id="dataset" className="scroll-mt-8 space-y-4">
          <h2 className="text-xl font-semibold">3. Dataset</h2>
          <div className="grid gap-4 md:grid-cols-2">
            <Card className="border-emerald-500/20"><CardTitle icon={<Check className="size-4 text-emerald-400" />}>Lakukan</CardTitle>
              <ul className="space-y-2 text-[13.5px] text-ink-300">{["Sisi pendek ≥ 1024px jika bisa (minimal 512)", "Variasi sudut kamera, jarak, ekspresi, cahaya, latar", "Karakter: ~40% close-up, ~40% setengah badan, ~20% full body", "Style: gaya konsisten, subjek beragam (orang, hewan, benda, pemandangan)", "Crop agar subjek mengisi frame; buang watermark & teks"].map((x) => <li key={x} className="flex gap-2"><Check className="mt-0.5 size-4 shrink-0 text-emerald-400" />{x}</li>)}</ul></Card>
            <Card className="border-rose-500/20"><CardTitle icon={<X className="size-4 text-rose-400" />}>Hindari</CardTitle>
              <ul className="space-y-2 text-[13.5px] text-ink-300">{["Gambar blur, artefak JPEG, atau upscale jelek", "Banyak gambar hampir identik (frame berurutan)", "Latar yang sama di semua gambar — ikut menempel ke trigger", "Banyak karakter dalam satu gambar (LoRA karakter)", "Kuantitas di atas kualitas — 25 bagus > 150 campur aduk"].map((x) => <li key={x} className="flex gap-2"><X className="mt-0.5 size-4 shrink-0 text-rose-400" />{x}</li>)}</ul></Card>
          </div>
        </section>

        <section id="caption" className="scroll-mt-8 space-y-4">
          <h2 className="text-xl font-semibold">4. Caption & trigger word</h2>
          <Card className="border-amber-500/25 bg-amber-500/[0.05]">
            <div className="text-lg font-semibold text-amber-100">Aturan emas</div>
            <p className="mt-1 text-[15px] leading-relaxed text-ink-200">Yang kamu <b>tulis</b> di caption = hal yang bisa diganti saat prompting. Yang <b>tidak ditulis</b> tapi selalu ada = diserap ke trigger word.</p>
            <p className="mt-2 text-[13.5px] text-ink-300">Karakter berambut perak? JANGAN tulis &quot;silver hair&quot; jika ingin rambut perak muncul otomatis saat trigger dipakai. TULIS pakaian, pose, dan latar karena itu harus bisa diganti.</p>
          </Card>
          <div className="grid gap-4 md:grid-cols-2">
            <Card><CardTitle sub="Text encoder LLM 8B — kalimat deskriptif bekerja paling baik">Qwen-Image 2.1</CardTitle>
              <pre className="whitespace-pre-wrap rounded-xl bg-ink-950/70 p-3.5 font-mono text-[12.5px] leading-relaxed text-cyan-100">ak1k0, a young woman sitting on a wooden bench in a park, wearing a beige trench coat and a red scarf, holding a paper cup, soft afternoon light, shallow depth of field</pre></Card>
            <Card><CardTitle sub="Tag Danbooru: huruf kecil, spasi, trigger di depan">Anima Base</CardTitle>
              <pre className="whitespace-pre-wrap rounded-xl bg-ink-950/70 p-3.5 font-mono text-[12.5px] leading-relaxed text-fuchsia-100">ak1k0, 1girl, solo, sitting, bench, park, trench coat, red scarf, holding cup, outdoors, day, depth of field</pre></Card>
          </div>
          <p className="text-ink-300">Trigger word yang baik adalah kata langka tanpa arti kuat (<code className="kbd">ak1k0</code>, <code className="kbd">zxq style</code>). Kata umum seperti &quot;girl&quot; atau nama terkenal sudah punya asosiasi kuat di model dan akan bertabrakan.</p>
        </section>

        <section id="parameter" className="scroll-mt-8 space-y-4">
          <h2 className="text-xl font-semibold">5. Tiga rumus yang paling penting</h2>
          <div className="grid gap-4 md:grid-cols-3">
            {[["LR efektif", "lr × α / rank", "Bandingkan resep dengan angka ini, bukan LR mentah. Studio menyarankan α = rank."],
              ["Paparan", "steps × batch ÷ gambar", "Berapa kali tiap gambar dilihat. Karakter umumnya bagus di 60–150."],
              ["Biaya resolusi", "biaya ∝ resolusi²", "1024px ≈ 4× lebih berat dari 512px — VRAM dan waktu."]].map(([t, f, d]) => (
              <Card key={t}><div className="text-sm text-ink-400">{t}</div><div className="my-2 font-mono text-lg text-cyan-200">{f}</div><p className="text-[13px] text-ink-300">{d}</p></Card>
            ))}
          </div>
          <Link href="/learn/lab/" className="inline-flex items-center gap-1.5 text-sm text-brand-300 hover:underline">Coba langsung di Lab Interaktif <ArrowRight className="size-3.5" /></Link>
        </section>

        <section id="membaca" className="scroll-mt-8 space-y-4">
          <h2 className="text-xl font-semibold">6. Membaca hasil: underfit, pas, overfit</h2>
          <div className="grid gap-4 md:grid-cols-3">
            {[["Underfit", "text-sky-300", "Subjek belum mirip, gaya samar.", "Checkpoint lebih akhir, tambah steps, atau LR ×1.5."],
              ["Pas ✓", "text-emerald-300", "Mirip DAN prompt baru tetap diikuti.", "Pakai checkpoint ini, catat parameternya."],
              ["Overfit", "text-rose-300", "Semua mirip dataset; pose/latar terkunci; warna gosong.", "Checkpoint lebih awal, kurangi steps/LR, tambah variasi."]].map(([t, c, s, a]) => (
              <Card key={t}><div className={`text-lg font-semibold ${c}`}>{t}</div><p className="mt-2 text-[13.5px] text-ink-300">{s}</p><p className="mt-2 text-[13px] text-ink-400">→ {a}</p></Card>
            ))}
          </div>
          <p className="text-ink-300">Kualitas LoRA hampir selalu naik lalu turun. Karena itu simpan checkpoint sering, lalu beri nilai di tab <b className="text-white">Evaluasi</b> pada halaman job — studio akan menyimpulkan apakah run overtrain atau undertrain.</p>
        </section>

        <section id="model" className="scroll-mt-8 space-y-4">
          <h2 className="text-xl font-semibold">7. Resep per model</h2>
          <div className="grid gap-4 md:grid-cols-2">
            {Object.values(cat.models).map((m) => (
              <Card key={m.id}>
                <CardTitle sub={m.license}>{m.label}</CardTitle>
                <ul className="space-y-1.5 text-[13px] text-ink-300">{m.arch.map((a) => <li key={a}>• {a}</li>)}</ul>
                <div className="section-title mb-2 mt-4">Catatan training</div>
                <ul className="space-y-1.5 text-[13px] text-ink-300">{m.notes.map((a) => <li key={a}>• {a}</li>)}</ul>
              </Card>
            ))}
          </div>
          <Card className="overflow-x-auto p-0">
            <table className="w-full text-[13.5px]">
              <thead><tr className="border-b border-white/[0.07] text-left text-[11.5px] uppercase tracking-wider text-ink-400"><th className="px-5 py-3">Titik awal · karakter, 20 gambar</th><th className="px-5 py-3">Qwen-Image 2.1</th><th className="px-5 py-3">Anima Base</th></tr></thead>
              <tbody>{[["Rank / alpha", "16 / 16", "32 / 32"], ["Learning rate", "1e-4", "2e-5"], ["Steps", "~2000", "~2500"], ["Resolusi", "512, 768, 1024", "512, 768, 1024"], ["Timestep", "shift", "weighted / sigmoid"], ["Quantize", "ya (int8)", "tidak perlu"], ["Cache text embeddings", "ya", "tidak"], ["Preview CFG / steps", "3.0 / 25", "4.0 / 30"]].map((r) => (
                <tr key={r[0]} className="border-b border-white/[0.04]">{r.map((c, i) => <td key={i} className={`px-5 py-2.5 ${i ? "font-mono text-xs text-brand-200" : "text-ink-300"}`}>{c}</td>)}</tr>
              ))}</tbody>
            </table>
          </Card>
        </section>

        <section id="konsep" className="scroll-mt-8 space-y-4">
          <h2 className="text-xl font-semibold">8. Kamus konsep</h2>
          <div className="grid gap-4 md:grid-cols-2">
            {cat.concepts.map((c) => (
              <Card key={c.id}>
                <div className="font-semibold">{c.term}</div>
                <div className="mt-0.5 text-sm text-brand-200">{c.short}</div>
                <p className="mt-2 text-[13.5px] leading-relaxed text-ink-300">{c.body}</p>
              </Card>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
