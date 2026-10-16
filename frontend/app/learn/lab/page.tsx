"use client";
import { Calculator, Dices, FlaskConical, Layers, LineChart as LineIcon, Timer } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { LRChart } from "@/components/charts";
import { Card, CardTitle, PageHeader, Segmented, cx } from "@/components/ui";
import { fmtNum } from "@/lib/format";

const AX = { stroke: "#5c5c7a", fontSize: 11, tickLine: false, axisLine: false } as const;
const TT = { contentStyle: { background: "rgba(16,16,27,.95)", border: "1px solid rgba(255,255,255,.1)", borderRadius: 12, fontSize: 12 } };

function Slider({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
  fmt = (v: number) => String(v),
  log,
}: {
  label: ReactNode;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
  fmt?: (v: number) => string;
  log?: boolean;
}) {
  // log sliders move in exponent space so 1e-6..1e-3 is usable
  const toPos = (v: number) => (log ? Math.log10(v) : v);
  const fromPos = (p: number) => (log ? Number((10 ** p).toPrecision(2)) : p);
  return (
    <div>
      <div className="mb-1.5 flex justify-between text-[13px]">
        <span className="text-ink-300">{label}</span>
        <span className="font-mono tabular-nums text-brand-200">{fmt(value)}</span>
      </div>
      <input
        type="range"
        className="w-full accent-violet-500"
        min={toPos(min)}
        max={toPos(max)}
        step={log ? 0.01 : step}
        value={toPos(value)}
        onChange={(e) => onChange(fromPos(parseFloat(e.target.value)))}
      />
    </div>
  );
}

// seeded RNG so charts don't jump on every render
function rng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}
function randn(r: () => number) {
  const u = Math.max(1e-9, r()),
    v = r();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function LrLab() {
  const [model, setModel] = useState<"qwen_image_2" | "anima">("anima");
  const [lr, setLr] = useState(1e-4);
  const [rank, setRank] = useState(32);
  const [alpha, setAlpha] = useState(32);
  const eff = lr * (alpha / rank);
  const zones = model === "anima" ? { lo: 1e-5, sweet: [1.5e-5, 4e-5], hi: 8e-5 } : { lo: 3e-5, sweet: [6e-5, 1.5e-4], hi: 3e-4 };
  const pos = (v: number) => Math.max(0, Math.min(100, ((Math.log10(v) + 6) / 3) * 100)); // 1e-6 .. 1e-3
  const verdict =
    eff < zones.lo
      ? ["Terlalu lemah — LoRA nyaris tidak belajar", "text-sky-300"]
      : eff <= zones.sweet[1] && eff >= zones.sweet[0]
        ? ["Zona aman yang umum dipakai", "text-emerald-300"]
        : eff > zones.hi
          ? ["Berbahaya — kemungkinan gosong / merusak model", "text-rose-300"]
          : ["Masih mungkin, awasi preview", "text-amber-300"];
  return (
    <Card>
      <CardTitle
        icon={<Calculator className="size-4" />}
        sub="Kenapa LR yang sama bisa berhasil di resep orang lain tapi gagal di punyamu."
      >
        Kalkulator LR efektif
      </CardTitle>
      <Segmented
        value={model}
        onChange={setModel}
        options={[
          { value: "anima", label: "Anima" },
          { value: "qwen_image_2", label: "Qwen 2.1" },
        ]}
      />
      <div className="mt-5 space-y-4">
        <Slider label="learning rate" value={lr} min={1e-6} max={1e-3} log onChange={setLr} fmt={fmtNum} />
        <Slider label="rank" value={rank} min={1} max={128} onChange={setRank} />
        <Slider label="alpha" value={alpha} min={1} max={128} onChange={setAlpha} />
      </div>
      <div className="mt-6 rounded-xl border border-white/[0.07] bg-ink-950/50 p-4">
        <div className="font-mono text-sm text-ink-300">
          {fmtNum(lr)} × {alpha}/{rank} = <span className="text-xl font-semibold text-cyan-200">{fmtNum(eff)}</span>
        </div>
        <div className="relative mt-4 h-3 rounded-full bg-white/5">
          <div
            className="absolute inset-y-0 rounded-full bg-emerald-500/40"
            style={{ left: `${pos(zones.sweet[0])}%`, width: `${pos(zones.sweet[1]) - pos(zones.sweet[0])}%` }}
          />
          <div className="absolute inset-y-0 right-0 rounded-r-full bg-rose-500/25" style={{ left: `${pos(zones.hi)}%` }} />
          <div
            className="absolute -top-1.5 h-6 w-1.5 rounded bg-white shadow-[0_0_12px_white] transition-all"
            style={{ left: `calc(${pos(eff)}% - 3px)` }}
          />
        </div>
        <div className="mt-1.5 flex justify-between font-mono text-[10.5px] text-ink-400">
          <span>1e-6</span>
          <span>1e-5</span>
          <span>1e-4</span>
          <span>1e-3</span>
        </div>
        <div className={cx("mt-3 text-sm font-medium", verdict[1])}>{verdict[0]}</div>
      </div>
      <p className="mt-4 text-[13px] text-ink-400">
        Coba: alpha = 1, rank = 32, lr = 1e-4 (contoh di dokumentasi sd-scripts). LR efektifnya hanya ~3e-6 — itulah kenapa resep tidak bisa
        disalin tanpa melihat alpha.
      </p>
    </Card>
  );
}

function ExposureLab() {
  const [imgs, setImgs] = useState(20);
  const [steps, setSteps] = useState(2000);
  const [batch, setBatch] = useState(1);
  const exp = (steps * batch) / imgs;
  const data = Array.from({ length: 41 }, (_, i) => {
    const s = Math.round((steps * i) / 40);
    const e = (s * batch) / imgs;
    // toy curve: likeness rises then flexibility collapses — illustration, not a measurement
    const likeness = 100 * (1 - Math.exp(-e / 45));
    const flex = 100 / (1 + Math.exp((e - 190) / 35));
    return { step: s, kemiripan: Math.round(likeness), fleksibilitas: Math.round(flex), gabungan: Math.round((likeness * flex) / 100) };
  });
  return (
    <Card>
      <CardTitle
        icon={<Timer className="size-4" />}
        sub="Ilustrasi konsep (bukan pengukuran): kemiripan naik, fleksibilitas turun saat model mulai menghafal."
      >
        Simulator paparan & overfit
      </CardTitle>
      <div className="grid gap-4 md:grid-cols-3">
        <Slider label="jumlah gambar" value={imgs} min={5} max={100} onChange={setImgs} />
        <Slider label="total steps" value={steps} min={250} max={8000} step={250} onChange={setSteps} />
        <Slider label="batch size" value={batch} min={1} max={4} onChange={setBatch} />
      </div>
      <div className="my-4 font-mono text-sm text-ink-300">
        {steps} × {batch} ÷ {imgs} = <span className="text-xl font-semibold text-cyan-200">{exp.toFixed(0)}×</span> per gambar
      </div>
      <ResponsiveContainer width="100%" height={230}>
        <LineChart data={data} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
          <CartesianGrid stroke="rgb(255 255 255 / 0.05)" vertical={false} />
          <XAxis dataKey="step" {...AX} />
          <YAxis domain={[0, 100]} {...AX} />
          <Tooltip {...TT} labelFormatter={(l) => `step ${l}`} />
          <Line dataKey="kemiripan" stroke="#22d3ee" dot={false} strokeWidth={2} isAnimationActive={false} />
          <Line dataKey="fleksibilitas" stroke="#f472b6" dot={false} strokeWidth={2} isAnimationActive={false} />
          <Line dataKey="gabungan" stroke="#34d399" dot={false} strokeWidth={3} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
      <p className="mt-2 text-[13px] text-ink-400">
        Garis hijau = kualitas LoRA yang kamu rasakan. Puncaknya di tengah, bukan di akhir — itulah kenapa checkpoint harus disimpan sering
        dan dinilai.
      </p>
    </Card>
  );
}

function ScheduleLab() {
  const [sched, setSched] = useState("constant");
  const [warm, setWarm] = useState(200);
  const steps = 2000,
    lr = 1e-4;
  const data = Array.from({ length: 101 }, (_, i) => {
    const s = (steps * i) / 100;
    let v = lr;
    if (sched === "cosine") v = lr * 0.5 * (1 + Math.cos((Math.PI * s) / steps));
    if (sched === "constant_with_warmup" && s < warm) v = (lr * s) / warm;
    return { step: Math.round(s), lr: v };
  });
  return (
    <Card>
      <CardTitle icon={<LineIcon className="size-4" />} sub="Bentuk LR sepanjang training">
        LR scheduler
      </CardTitle>
      <Segmented
        value={sched}
        onChange={setSched}
        options={[
          { value: "constant", label: "constant" },
          { value: "cosine", label: "cosine" },
          { value: "constant_with_warmup", label: "warmup" },
        ]}
      />
      {sched === "constant_with_warmup" && (
        <div className="mt-4">
          <Slider label="warmup steps" value={warm} min={0} max={1000} step={50} onChange={setWarm} />
        </div>
      )}
      <div className="mt-4">
        <LRChart data={data} height={180} />
      </div>
      <p className="mt-2 text-[13px] text-ink-400">
        {sched === "cosine"
          ? "Cosine: belajar cepat di awal, halus di akhir. Checkpoint akhir berubah sangat sedikit karena LR hampir 0."
          : sched === "constant"
            ? "Constant: tiap checkpoint mendapat 'dorongan' yang sama — paling mudah dibandingkan saat bereksperimen."
            : "Warmup: LR naik pelan di awal agar update pertama yang acak tidak merusak."}
      </p>
    </Card>
  );
}

function TimestepLab() {
  const [kind, setKind] = useState("sigmoid");
  const [shift, setShift] = useState(3);
  const data = useMemo(() => {
    const r = rng(7);
    const bins = Array.from({ length: 20 }, (_, i) => ({ t: ((i + 0.5) / 20).toFixed(2), n: 0 }));
    for (let i = 0; i < 20000; i++) {
      let t = kind === "uniform" ? r() : 1 / (1 + Math.exp(-randn(r)));
      if (kind === "shift") t = (t * shift) / (1 + (shift - 1) * t);
      bins[Math.min(19, Math.floor(t * 20))].n++;
    }
    return bins;
  }, [kind, shift]);
  return (
    <Card>
      <CardTitle icon={<Dices className="size-4" />} sub="Seberapa sering training berlatih di tiap tingkat noise">
        Distribusi timestep
      </CardTitle>
      <Segmented
        value={kind}
        onChange={setKind}
        options={[
          { value: "uniform", label: "uniform" },
          { value: "sigmoid", label: "sigmoid" },
          { value: "shift", label: "shift" },
        ]}
      />
      {kind === "shift" && (
        <div className="mt-4">
          <Slider label="shift" value={shift} min={1} max={8} step={0.5} onChange={setShift} />
        </div>
      )}
      <ResponsiveContainer width="100%" height={200} className="mt-4">
        <BarChart data={data} margin={{ top: 5, right: 5, left: -25, bottom: 0 }}>
          <XAxis dataKey="t" {...AX} interval={3} />
          <YAxis {...AX} />
          <Bar dataKey="n" fill="#a78bfa" radius={[4, 4, 0, 0]} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
      <div className="mt-2 flex justify-between text-[11.5px] text-ink-400">
        <span>← t≈0: hampir bersih (detail, tekstur)</span>
        <span>t≈1: hampir noise (komposisi, bentuk) →</span>
      </div>
      <p className="mt-3 text-[13px] text-ink-400">
        Shift mendorong latihan ke noise tinggi — berguna untuk struktur di resolusi besar. Qwen 2.1 memakai shift; Anima memakai
        weighted/sigmoid.
      </p>
    </Card>
  );
}

function LossNoiseLab() {
  const [smooth, setSmooth] = useState(0.05);
  const [lrMult, setLrMult] = useState(1);
  const data = useMemo(() => {
    const r = rng(42);
    let e = 0;
    return Array.from({ length: 400 }, (_, i) => {
      const t = r();
      const base = 0.18 + 0.32 * t; // loss depends heavily on the random noise level
      const learn = 0.03 * (1 - Math.exp(-i / 120));
      const diverge = lrMult > 2.5 ? Math.max(0, (i - 150) / 250) * 0.15 * (lrMult - 2.5) : 0;
      const loss = Math.max(0.02, base - learn + diverge + randn(r) * 0.02);
      e = i ? e * (1 - smooth) + loss * smooth : loss;
      return { step: i * 5, loss, ema: e };
    });
  }, [smooth, lrMult]);
  return (
    <Card>
      <CardTitle icon={<LineIcon className="size-4" />} sub="Kenapa loss diffusion zig-zag dan bagaimana rata-rata membuatnya terbaca">
        Simulasi kurva loss
      </CardTitle>
      <div className="grid gap-4 md:grid-cols-2">
        <Slider label="kehalusan EMA" value={smooth} min={0.005} max={0.5} step={0.005} onChange={setSmooth} />
        <Slider label="pengali learning rate" value={lrMult} min={0.5} max={5} step={0.5} onChange={setLrMult} fmt={(v) => `${v}×`} />
      </div>
      <ResponsiveContainer width="100%" height={230} className="mt-4">
        <LineChart data={data} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
          <CartesianGrid stroke="rgb(255 255 255 / 0.05)" vertical={false} />
          <XAxis dataKey="step" {...AX} />
          <YAxis {...AX} domain={[0, "auto"]} tickFormatter={(v) => Number(v).toFixed(2)} />
          <Line dataKey="loss" stroke="#a78bfa" strokeOpacity={0.3} dot={false} strokeWidth={1} isAnimationActive={false} />
          <Line dataKey="ema" stroke="#22d3ee" dot={false} strokeWidth={2.5} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
      <p className="mt-2 text-[13px] text-ink-400">
        Loss tiap step sebagian besar ditentukan oleh tingkat noise acak, bukan oleh seberapa bagus LoRA. Naikkan pengali LR di atas 2.5×
        untuk melihat pola divergensi: rata-rata yang <b className="text-rose-300">naik</b>.
      </p>
    </Card>
  );
}

function RankLab() {
  const [rank, setRank] = useState(16);
  const [d, setD] = useState(3072);
  const full = d * d,
    lora = rank * (d + d);
  return (
    <Card>
      <CardTitle icon={<Layers className="size-4" />} sub="Berapa kecil LoRA dibanding layer aslinya">
        Matematika rank
      </CardTitle>
      <div className="grid gap-4 md:grid-cols-2">
        <Slider label="rank" value={rank} min={1} max={128} onChange={setRank} />
        <Slider label="dimensi layer (d)" value={d} min={512} max={4096} step={256} onChange={setD} />
      </div>
      <div className="mt-5 grid grid-cols-3 gap-3 text-center">
        <div className="rounded-xl bg-white/[0.03] p-3">
          <div className="font-mono text-lg">{(full / 1e6).toFixed(1)}M</div>
          <div className="text-xs text-ink-400">bobot W (d×d)</div>
        </div>
        <div className="rounded-xl bg-brand-500/10 p-3">
          <div className="font-mono text-lg text-brand-200">{(lora / 1e3).toFixed(0)}K</div>
          <div className="text-xs text-ink-400">LoRA r×(d+d)</div>
        </div>
        <div className="rounded-xl bg-emerald-500/10 p-3">
          <div className="font-mono text-lg text-emerald-200">{((100 * lora) / full).toFixed(2)}%</div>
          <div className="text-xs text-ink-400">ukuran relatif</div>
        </div>
      </div>
      <div className="mt-4 h-3 overflow-hidden rounded-full bg-white/5">
        <div
          className="h-full bg-gradient-to-r from-brand-500 to-fuchsia-500"
          style={{ width: `${Math.max(0.5, (100 * lora) / full)}%` }}
        />
      </div>
      <p className="mt-3 text-[13px] text-ink-400">
        Rank ×2 = ukuran file ×2 dan kapasitas ×2. Kapasitas besar tidak otomatis lebih baik: dengan dataset kecil, ruang ekstra dipakai
        untuk menghafal noise.
      </p>
    </Card>
  );
}

export default function Lab() {
  return (
    <div>
      <PageHeader
        eyebrow={
          <span className="flex items-center gap-1.5">
            <FlaskConical className="size-4" />
            Lab Interaktif
          </span>
        }
        title="Mainkan angkanya, lihat akibatnya"
        subtitle="Simulator kecil yang berjalan di browser — tanpa GPU. Cocok untuk membangun intuisi sebelum menghabiskan jam-jam training."
      />
      <div className="grid gap-6 xl:grid-cols-2">
        <LrLab />
        <ExposureLab />
        <LossNoiseLab />
        <TimestepLab />
        <ScheduleLab />
        <RankLab />
      </div>
    </div>
  );
}
