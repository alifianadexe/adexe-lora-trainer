"""Turn raw training signals into explanations a beginner can act on.

Inputs: the job (params, status), parsed loss metrics, sample/checkpoint outputs,
dataset stats and the user's own checkpoint ratings. Output: a health score, loss
statistics, a list of insights (each pointing at a known mistake when relevant)
and concrete suggestions for the next experiment.
"""

import math

from .knowledge import MISTAKE_INDEX


def ema_series(values, alpha=None):
    if not values:
        return []
    a = alpha or min(0.2, 10 / max(10, len(values)))
    out, e = [], values[0]
    for i, v in enumerate(values):
        e = v if i == 0 else e * (1 - a) + v * a
        out.append(e)
    return out


def _slope(xs, ys):
    n = len(xs)
    if n < 3:
        return 0.0
    mx, my = sum(xs) / n, sum(ys) / n
    den = sum((x - mx) ** 2 for x in xs)
    return sum((x - mx) * (y - my) for x, y in zip(xs, ys)) / den if den else 0.0


def lr_schedule(params: dict, points: int = 120) -> list:
    steps = max(1, int(params.get("steps") or 1))
    lr = float(params.get("lr") or 0)
    sched = params.get("lr_scheduler", "constant")
    warm = int(params.get("warmup_steps") or 0)
    out = []
    for i in range(points + 1):
        s = round(steps * i / points)
        if sched == "cosine":
            v = lr * 0.5 * (1 + math.cos(math.pi * s / steps))
        elif sched == "constant_with_warmup" and warm > 0 and s < warm:
            v = lr * s / warm
        else:
            v = lr
        out.append({"step": s, "lr": v})
    return out


def summarize(metrics: list) -> dict:
    pts = [m for m in metrics if m.get("loss") is not None]
    nan_steps = [m["step"] for m in metrics if m.get("nan")]
    if not pts:
        return {"n": 0, "nan_steps": nan_steps}
    steps = [m["step"] for m in pts]
    loss = [m["loss"] for m in pts]
    sm = ema_series(loss)
    n = len(loss)
    k = max(1, n // 10)
    first, last = sum(sm[:k]) / k, sum(sm[-k:]) / k
    tail = max(5, int(n * 0.4))
    span = (steps[-1] - steps[0]) or 1
    tail_slope = _slope(steps[-tail:], sm[-tail:]) * span / max(1e-9, abs(sum(sm) / n))
    resid = [l - s for l, s in zip(loss, sm)]
    noise = math.sqrt(sum(r * r for r in resid) / n) / max(1e-9, sum(sm) / n)
    spikes = [steps[i] for i in range(n) if i > 10 and loss[i] > sm[i] * 1.8]
    stride = max(1, n // 600)
    series = [{"step": steps[i], "loss": loss[i], "ema": round(sm[i], 6)} for i in range(0, n, stride)]
    if series[-1]["step"] != steps[-1]:
        series.append({"step": steps[-1], "loss": loss[-1], "ema": round(sm[-1], 6)})
    return {
        "n": n,
        "first_ema": first,
        "last_ema": last,
        "min": min(loss),
        "change_pct": (last - first) / first * 100 if first else 0,
        "tail_trend": tail_slope,  # relative change of smoothed loss across the run, from the last 40%
        "noise": noise,
        "spikes": spikes[:50],
        "spike_ratio": len(spikes) / n,
        "nan_steps": nan_steps,
        "series": series,
    }


def _score(ev: dict) -> float:
    return 0.4 * ev.get("likeness", 0) + 0.35 * ev.get("flexibility", 0) + 0.25 * ev.get("quality", 0)


def evaluation_advice(job: dict) -> dict:
    """Use the user's 1-5 ratings per checkpoint step to propose the next run."""
    evs = {int(k): v for k, v in (job.get("evaluations") or {}).items() if v}
    if not evs:
        return {"best_step": None, "suggestions": [], "summary": None}
    p = job["params"]
    total = int(job["progress"].get("total") or p.get("steps") or 1)
    ranked = sorted(evs.items(), key=lambda kv: (-_score(kv[1]), kv[0]))
    best_step, best = ranked[0]
    last_step = max(evs)
    sugg = []
    lr = float(p.get("lr") or 0)

    def change(param, to, why):
        sugg.append({"param": param, "from": p.get(param), "to": to, "why": why})

    summary = f"Checkpoint terbaik menurut penilaianmu: step {best_step} (skor {_score(best):.1f}/5)."
    if best_step <= 0.45 * total and len(evs) >= 2:
        summary += " Puncaknya jauh sebelum akhir training → run ini overtrain."
        change("steps", int(round(best_step * 1.3 / 50) * 50) or 250,
               f"Puncak di step {best_step}; sisakan sedikit ruang setelahnya.")
        if best.get("quality", 5) <= 3:
            change("lr", float(f"{lr * 0.7:.1e}"), "Kualitas sudah rendah di checkpoint terbaik - LR kemungkinan terlalu agresif.")
    elif best_step == last_step and best.get("likeness", 5) <= 3:
        summary += " Checkpoint terbaik adalah yang terakhir dan kemiripan masih kurang → undertrain."
        change("steps", int(round(total * 1.5 / 50) * 50), "Masih membaik di akhir; beri waktu lebih.")
        if best.get("quality", 0) >= 4:
            change("lr", float(f"{lr * 1.5:.1e}"), "Kualitas masih bagus, ada ruang untuk belajar lebih cepat.")
    else:
        summary += " Puncak berada di tengah-akhir training — panjang training sudah wajar."

    flex = [v.get("flexibility", 0) for v in evs.values()]
    if flex and max(flex) <= 2:
        sugg.append({"param": None, "from": None, "to": None,
                     "why": "Fleksibilitas rendah di SEMUA checkpoint: masalahnya kemungkinan di dataset/caption (variasi kurang atau caption tidak menyebut pakaian/latar), bukan di parameter."})
    late = [v for s, v in evs.items() if s >= 0.75 * total]
    if late and sum(v.get("quality", 0) for v in late) / len(late) <= 2:
        sugg.append({"param": "rank", "from": p.get("rank"), "to": max(8, int(p.get("rank", 16)) // 2),
                     "why": "Kualitas runtuh di checkpoint akhir - rank lebih kecil memperlambat overfit."})
    return {"best_step": best_step, "best": best, "summary": summary, "suggestions": sugg}


def analyze_job(job: dict, metrics: list, outputs: dict, dataset: dict) -> dict:
    p = job["params"]
    prog = job.get("progress") or {}
    total = int(prog.get("total") or p.get("steps") or 1)
    step = int(prog.get("step") or 0)
    frac = step / total if total else 0
    n_img = max(1, dataset.get("count") or 1) if dataset else 1
    bs = int(p.get("batch_size") or 1) * int(p.get("grad_accum") or 1)
    s = summarize(metrics)
    ins = []
    score = 100

    def add(level, title, detail, action=None, mistake=None, penalty=0):
        nonlocal score
        score -= penalty
        item = {"level": level, "title": title, "detail": detail, "action": action}
        if mistake and mistake in MISTAKE_INDEX:
            item["mistake"] = mistake
            item["mistake_title"] = MISTAKE_INDEX[mistake]["title"]
        ins.append(item)

    # ---- failures
    if job.get("status") == "failed":
        add("bad", "Training gagal", job.get("error_hint") or "Lihat log untuk detail error.",
            "Perbaiki penyebab di atas lalu tekan 'Jalankan lagi'.",
            "oom" if "VRAM" in (job.get("error_hint") or "") else None, 40)

    # ---- loss signals
    if s.get("nan_steps"):
        add("bad", "Loss menjadi NaN", f"Pertama terdeteksi di step {s['nan_steps'][0]}. Bobot sudah rusak setelah titik ini.",
            "Hentikan, turunkan LR 2×, pastikan bf16.", "nan_loss", 40)
    if s.get("n", 0) >= 30:
        if frac > 0.2 and s["change_pct"] > 15:
            add("bad", "Loss naik dibanding awal",
                f"Rata-rata loss naik {s['change_pct']:.0f}% dari awal. Pada LoRA, loss biasanya sedikit turun lalu mendatar; kenaikan menandakan training tidak stabil.",
                "Turunkan learning rate.", "lr_too_high", 25)
        elif s["change_pct"] < -3:
            add("ok", "Loss turun dengan wajar",
                f"Rata-rata loss turun {abs(s['change_pct']):.0f}% (dari {s['first_ema']:.3f} ke {s['last_ema']:.3f}). Ini normal - tapi loss turun ≠ hasil bagus; tetap nilai dari preview.")
        else:
            add("info", "Loss hampir datar",
                "Untuk LoRA diffusion ini sering normal: model dasar sudah pintar sehingga loss hanya turun sedikit. Yang belajar adalah detail kecil yang tidak terlihat di loss.",
                "Gunakan grid preview untuk menilai kemajuan.")
        if s["spike_ratio"] > 0.04:
            add("warn", "Banyak lonjakan loss",
                f"{len(s['spikes'])} lonjakan besar (>1.8× rata-rata). Sesekali wajar karena timestep acak, tapi jika sering dan makin besar bisa tanda LR tinggi.",
                "Jika preview mulai rusak di sekitar lonjakan, turunkan LR.", "lr_too_high", 8)
        if frac > 0.5 and abs(s["tail_trend"]) < 0.02:
            add("info", "Kurva sudah mendatar",
                "Di 40% terakhir rata-rata loss hampir tidak berubah. Model kemungkinan sudah menyerap sebagian besar yang bisa dipelajari; risiko berikutnya adalah overfit.",
                "Mulai bandingkan checkpoint dari titik ini.")
        if s["noise"] > 0.35:
            add("info", "Loss sangat berisik",
                f"Fluktuasi ±{s['noise'] * 100:.0f}% dari rata-rata. Ini karakter normal diffusion training (tingkat noise acak per step).")

    # ---- exposure / overfit risk
    epochs_total = p.get("steps", 0) * bs / n_img
    for target in (60, 100, 150):
        st = math.ceil(target * n_img / bs)
        if st < total and frac * total >= st and target == 100:
            add("info", "Masuk zona evaluasi",
                f"Sekitar step {st} tiap gambar sudah dilihat ~100 kali. Untuk karakter, checkpoint terbaik sering ada di sekitar 60-150 kali.",
                "Bandingkan preview mulai dari checkpoint ini.")
    if epochs_total > 200:
        add("warn", "Paparan per gambar tinggi",
            f"Run ini akan memperlihatkan tiap gambar ~{epochs_total:.0f} kali.",
            "Pantau tanda overfit; pilih checkpoint lebih awal jika perlu.", "overtraining", 10)

    # ---- params
    lr = float(p.get("lr") or 0)
    eff = lr * float(p.get("alpha") or p.get("rank") or 1) / float(p.get("rank") or 1)
    if not str(p.get("optimizer", "")).startswith("prodigy"):
        if job["model"] == "anima" and eff > 5e-5:
            add("warn", "LR efektif tinggi untuk Anima", f"LR efektif {eff:.1e}; pembuat Anima menyarankan ~2e-5.",
                "Turunkan LR jika preview cepat rusak.", "sdxl_habits_on_anima", 12)
        if job["model"] == "qwen_image_2" and eff > 3e-4:
            add("warn", "LR efektif tinggi untuk Qwen 2.1", f"LR efektif {eff:.1e}; titik awal umum ~1e-4.", None, "lr_too_high", 12)
    if int(p.get("save_every") or 0) and p.get("steps", 0) / int(p["save_every"]) < 4:
        add("warn", "Sedikit checkpoint", "Kurang dari 4 checkpoint akan tersimpan - sulit menemukan puncak.",
            "Simpan lebih sering di run berikutnya.", "only_last_checkpoint", 5)

    # ---- dataset
    if dataset:
        stt = dataset.get("stats", {})
        if dataset.get("count", 0) < 10:
            add("warn", "Dataset kecil", f"Hanya {dataset.get('count')} gambar.", "Tambah gambar bervariasi.", "low_variety", 8)
        if stt.get("small"):
            add("warn", "Gambar resolusi kecil", f"{len(stt['small'])} gambar < 512px.", "Ganti atau upscale dengan baik.", "upscaled_small_images", 5)
        if p.get("cache_text_embeddings") and not stt.get("captions_have_trigger", True) and job.get("trigger_word"):
            add("bad", "Caption tanpa trigger + cache aktif", "Trigger tidak akan dipelajari dari gambar tersebut.",
                "Gunakan 'Trigger di depan' di halaman dataset.", "trigger_missing_cached", 15)

    # ---- samples
    n_samples = len(outputs.get("samples", [])) if outputs else 0
    if job.get("status") == "running" and step > int(p.get("sample_every") or 10**9) and n_samples == 0:
        add("info", "Belum ada preview", "Preview seharusnya sudah dibuat. Periksa log jika tidak muncul.")

    if job.get("status") == "completed" and not job.get("evaluations"):
        add("info", "Langkah berikutnya: nilai checkpoint",
            "Buka tab Evaluasi dan beri nilai kemiripan, fleksibilitas, dan kualitas untuk beberapa checkpoint. Studio akan menyarankan eksperimen berikutnya.")

    order = {"bad": 0, "warn": 1, "info": 2, "ok": 3}
    ins.sort(key=lambda i: order[i["level"]])
    marks = []
    for target in (50, 100, 150, 200):
        st = math.ceil(target * n_img / bs)
        if st <= total:
            marks.append({"step": st, "label": f"{target}× / gambar"})
    s.pop("spikes", None)
    return {
        "health": max(0, min(100, score)),
        "summary": s,
        "insights": ins,
        "lr_schedule": lr_schedule(p),
        "epoch_marks": marks,
        "effective_lr": eff,
        "exposure": epochs_total,
        "advice": evaluation_advice(job),
    }


def estimate_vram(model: str, params: dict) -> dict:
    """Very rough VRAM estimate (GB) for teaching purposes - ±30%."""
    res = max(params.get("resolutions") or [1024])
    bs = int(params.get("batch_size") or 1)
    act_table = {512: 4, 640: 5, 768: 7, 1024: 11, 1280: 16, 1536: 23}
    act = act_table.get(int(res), 11) * (0.55 if model == "anima" else 1.0) * bs
    if not params.get("gradient_checkpointing", True):
        act *= 2.5
    parts = []
    if model == "qwen_image_2":
        base = 8.0 if params.get("quantize", True) else 15.0
        te = 0 if params.get("cache_text_embeddings") else (9.0 if params.get("quantize", True) else 17.0)
        parts = [("Transformer 7B (int8)" if params.get("quantize", True) else "Transformer 7B (bf16)", base), ("Text encoder Qwen3-VL-8B", te)]
    else:
        parts = [("Transformer 2B (bf16)", 4.2), ("Text encoder Qwen3-0.6B", 0 if params.get("cache_text_embeddings") else 1.2)]
    parts.append((f"Aktivasi @ {res}px × batch {bs}", round(act, 1)))
    lora = float(params.get("rank") or 16) / 16 * 0.3
    parts.append(("LoRA + optimizer state", round(lora, 1)))
    total = sum(v for _, v in parts)
    if params.get("layer_offloading"):
        total *= 0.6
        parts.append(("Layer offloading (≈ -40%)", round(-total / 0.6 * 0.4, 1)))
    elif params.get("low_vram"):
        total *= 0.9
    return {"total_gb": round(total, 1), "parts": [{"label": l, "gb": round(v, 1)} for l, v in parts],
            "note": "Perkiraan kasar (±30%) untuk belajar, bukan angka pasti."}
