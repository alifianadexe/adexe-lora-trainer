"""Turn the studio's backend-agnostic params into real trainer configs."""

import re
import shlex
import os
from pathlib import Path

import yaml

from .config import OUTPUTS_DIR, load_settings, resolve_python
from .presets import MODELS

OPTIMIZER_SD_SCRIPTS = {
    "adamw8bit": "AdamW8bit",
    "adamw": "AdamW",
    "prodigy": "Prodigy",
    "adafactor": "Adafactor",
}


def _prompts(params: dict, trigger: str) -> list:
    out = []
    for pr in params.get("sample_prompts") or []:
        pr = (pr or "").strip()
        if not pr:
            continue
        if trigger:
            pr = pr.replace("[trigger]", trigger)
        else:
            pr = re.sub(r"\[trigger\]\s*,?\s*", "", pr).strip(" ,")
        out.append(pr)
    return out


# ---------------------------------------------------------------------------
# ai-toolkit
# ---------------------------------------------------------------------------


def build_ai_toolkit(job: dict, dataset_path: str) -> dict:
    p = job["params"]
    model = job["model"]
    trigger = (job.get("trigger_word") or "").strip()
    cache_te = bool(p.get("cache_text_embeddings"))

    model_cfg = {
        "name_or_path": p.get("base_model_path") or MODELS[model]["hf"],
        "arch": model,
        "quantize": bool(p.get("quantize")),
        "quantize_te": bool(p.get("quantize")),
        "low_vram": bool(p.get("low_vram")),
        "model_kwargs": {},
    }
    if model == "qwen_image_2":
        model_cfg["qtype"] = "convrot8"
        model_cfg["qtype_te"] = "convrot8"
        model_cfg["model_kwargs"] = {"rgba": bool(p.get("rgba"))}
    elif p.get("quantize"):
        model_cfg["qtype"] = "qfloat8"
        model_cfg["qtype_te"] = "qfloat8"
    if p.get("layer_offloading"):
        model_cfg["layer_offloading"] = True
        model_cfg["layer_offloading_transformer_percent"] = float(p.get("layer_offloading_percent", 1.0))
        model_cfg["layer_offloading_text_encoder_percent"] = 1.0

    dataset = {
        "folder_path": dataset_path,
        "caption_ext": "txt",
        "caption_dropout_rate": float(p.get("caption_dropout", 0.05)),
        "shuffle_tokens": bool(p.get("shuffle_tokens")) and not cache_te,
        "keep_tokens": int(p.get("keep_tokens") or 0),
        "cache_latents_to_disk": True,
        "resolution": sorted(int(r) for r in (p.get("resolutions") or [1024])),
        "num_repeats": int(p.get("num_repeats") or 1),
        "flip_x": bool(p.get("flip_x")),
    }
    for key in ("control_path_1", "control_path_2"):
        if p.get(key):
            dataset[key] = p[key]
    if p.get("control_path_1"):
        dataset.update(caption_dropout_rate=0.0, num_workers=0, random_crop=False, random_scale=False, flip_x=False)
        if model == "qwen_image_2":
            model_cfg["model_kwargs"]["match_target_res"] = True

    train = {
        "batch_size": int(p.get("batch_size") or 1),
        "steps": int(p["steps"]),
        "gradient_accumulation": int(p.get("grad_accum") or 1),
        "train_unet": True,
        "train_text_encoder": False,
        "gradient_checkpointing": bool(p.get("gradient_checkpointing", True)),
        "noise_scheduler": "flowmatch",
        "optimizer": p.get("optimizer", "adamw8bit"),
        "lr": float(p["lr"]),
        "lr_scheduler": p.get("lr_scheduler", "constant"),
        "timestep_type": p.get("timestep_type", "sigmoid"),
        "content_or_style": p.get("content_or_style", "balanced"),
        "cache_text_embeddings": cache_te,
        "dtype": "bf16",
        "optimizer_params": {"weight_decay": 1e-4},
    }
    if p.get("lr_scheduler") == "constant_with_warmup":
        train["lr_scheduler_params"] = {"num_warmup_steps": int(p.get("warmup_steps") or 0)}

    sample = {
        "sampler": "flowmatch",
        "sample_every": int(p.get("sample_every") or 250),
        "width": int(p.get("sample_width") or 1024),
        "height": int(p.get("sample_height") or 1024),
        "prompts": _prompts(p, trigger),
        "neg": p.get("sample_neg") or "",
        "seed": int(p.get("seed") or 42),
        "walk_seed": True,
        "guidance_scale": float(p.get("guidance") or 4.0),
        "sample_steps": int(p.get("sample_steps") or 25),
    }
    if not sample["prompts"]:
        sample["prompts"] = ["a photo"]
        train["disable_sampling"] = True
    if p.get("sample_control_1"):
        width, height = sample["width"], sample["height"]
        sample["samples"] = [
            {
                "prompt": re.sub(r"--[wh]\s+\d+", "", pr).strip() + f" --w {width} --h {height}",
                "ctrl_img_1": p["sample_control_1"],
                **({"ctrl_img_2": p["sample_control_2"]} if p.get("sample_control_2") else {}),
            }
            for pr in sample.pop("prompts")
        ]

    process = {
        "type": "sd_trainer",
        "training_folder": str(OUTPUTS_DIR),
        "device": "cuda:0",
        "network": {
            "type": "lora",
            "linear": int(p["rank"]),
            "linear_alpha": float(p.get("alpha") or p["rank"]),
        },
        "save": {
            "dtype": "bf16",
            "save_every": int(p.get("save_every") or 250),
            "max_step_saves_to_keep": int(p.get("max_saves") or 4),
        },
        "datasets": [dataset],
        "train": train,
        "model": model_cfg,
        "sample": sample,
    }
    # with cached embeddings ai-toolkit can't inject the trigger - captions carry it
    if trigger and not cache_te:
        process["trigger_word"] = trigger

    return {
        "job": "extension",
        "config": {"name": job["name"], "process": [process]},
        "meta": {"name": "[name]", "version": "1.0", "created_by": "adexe-lora-studio"},
    }


def ai_toolkit_command(job: dict, config_path: Path) -> dict:
    s = load_settings()
    repo = s["ai_toolkit_path"]
    py = resolve_python(repo, s["ai_toolkit_python"])
    env = {}
    if s.get("hf_token"):
        env["HF_TOKEN"] = s["hf_token"]
    return {"cwd": repo, "argv": [py, "run.py", str(config_path)], "env": env}


# ---------------------------------------------------------------------------
# kohya sd-scripts (Anima only)
# ---------------------------------------------------------------------------


def build_sd_scripts_dataset_toml(job: dict, dataset_path: str) -> str:
    p = job["params"]
    res = max(int(r) for r in (p.get("resolutions") or [1024]))
    lines = [
        "[general]",
        "shuffle_caption = %s" % ("true" if p.get("shuffle_tokens") else "false"),
        "caption_extension = '.txt'",
        "keep_tokens = %d" % int(p.get("keep_tokens") or 0),
        "",
        "[[datasets]]",
        "resolution = %d" % res,
        "batch_size = %d" % int(p.get("batch_size") or 1),
        "enable_bucket = true",
        "min_bucket_reso = 256",
        "max_bucket_reso = %d" % max(1024, int(res * 1.5)),
        "bucket_reso_steps = 64",
        "",
        "  [[datasets.subsets]]",
        "  image_dir = %s" % _toml_str(dataset_path),
        "  num_repeats = %d" % int(p.get("num_repeats") or 1),
        "  caption_dropout_rate = %s" % float(p.get("caption_dropout") or 0),
        "  flip_aug = %s" % ("true" if p.get("flip_x") else "false"),
    ]
    trig = (job.get("trigger_word") or "").strip()
    if trig:
        lines.append("  # trigger: %s (pastikan ada di caption)" % trig)
    return "\n".join(lines) + "\n"


def _toml_str(s: str) -> str:
    return "'" + s.replace("'", "") + "'"


def build_sd_scripts_prompts(job: dict) -> str:
    p = job["params"]
    trig = (job.get("trigger_word") or "").strip()
    neg = (p.get("sample_neg") or "").replace("\n", " ")
    out = []
    for i, pr in enumerate(_prompts(p, trig)):
        line = f"{pr} --w {int(p.get('sample_width') or 1024)} --h {int(p.get('sample_height') or 1024)}"
        line += f" --s {int(p.get('sample_steps') or 30)} --l {float(p.get('guidance') or 4.0)} --d {int(p.get('seed') or 42) + i}"
        if neg:
            line += f" --n {neg}"
        out.append(line)
    return "\n".join(out) + "\n"


def sd_scripts_command(job: dict, job_dir: Path) -> dict:
    s = load_settings()
    p = job["params"]
    repo = s["sd_scripts_path"]
    py = resolve_python(repo, s["sd_scripts_python"])
    out_dir = OUTPUTS_DIR / job["name"]
    argv = [
        py,
        "-m",
        "accelerate.commands.launch",
        "--num_cpu_threads_per_process",
        "1",
        "anima_train_network.py",
        f"--pretrained_model_name_or_path={s['anima_dit_path']}",
        f"--qwen3={s['anima_qwen3_path']}",
        f"--vae={s['anima_vae_path']}",
        f"--dataset_config={job_dir / 'dataset.toml'}",
        f"--output_dir={out_dir}",
        f"--output_name={job['name']}",
        "--save_model_as=safetensors",
        "--network_module=networks.lora_anima",
        f"--network_dim={int(p['rank'])}",
        f"--network_alpha={float(p.get('alpha') or p['rank'])}",
        "--network_train_unet_only",
        f"--learning_rate={float(p['lr'])}",
        f"--optimizer_type={OPTIMIZER_SD_SCRIPTS.get(p.get('optimizer', 'adamw8bit'), 'AdamW8bit')}",
        f"--lr_scheduler={p.get('lr_scheduler', 'constant')}",
        f"--timestep_sampling={p.get('timestep_type') if p.get('timestep_type') in ('sigma', 'uniform', 'sigmoid', 'shift', 'flux_shift') else 'sigmoid'}",
        f"--discrete_flow_shift={float(p.get('discrete_flow_shift') or 1.0)}",
        f"--max_train_steps={int(p['steps'])}",
        f"--gradient_accumulation_steps={int(p.get('grad_accum') or 1)}",
        f"--save_every_n_steps={int(p.get('save_every') or 250)}",
        f"--save_last_n_steps={int(p.get('save_every') or 250) * int(p.get('max_saves') or 4)}",
        "--mixed_precision=bf16",
        "--save_precision=bf16",
        "--cache_latents",
        "--cache_latents_to_disk",
        "--cache_text_encoder_outputs",
        "--qwen_image_vae_2d",
        f"--seed={int(p.get('seed') or 42)}",
        "--logging_dir=" + str(job_dir / "tb"),
    ]
    # sd-scripts caches TE outputs only when captions are static
    if p.get("shuffle_tokens") or float(p.get("caption_dropout") or 0) > 0:
        argv.remove("--cache_text_encoder_outputs")
    # sd-scripts refuses flip augmentation together with cached latents
    if p.get("flip_x"):
        argv.remove("--cache_latents")
        argv.remove("--cache_latents_to_disk")
    if p.get("gradient_checkpointing", True):
        argv.append("--gradient_checkpointing")
    if p.get("lr_scheduler") == "constant_with_warmup":
        argv.append(f"--lr_warmup_steps={int(p.get('warmup_steps') or 0)}")
    if int(p.get("blocks_to_swap") or 0) > 0:
        argv.append(f"--blocks_to_swap={int(p['blocks_to_swap'])}")
    if p.get("optimizer", "").startswith("prodigy") or p.get("optimizer") == "adafactor":
        argv.append("--optimizer_args")
        argv.append("weight_decay=0.01")
    if p.get("sample_prompts"):
        argv += [
            f"--sample_prompts={job_dir / 'prompts.txt'}",
            f"--sample_every_n_steps={int(p.get('sample_every') or 250)}",
            "--sample_at_first",
        ]
    env = {}
    if s.get("hf_token"):
        env["HF_TOKEN"] = s["hf_token"]
    return {"cwd": repo, "argv": argv, "env": env}


def command_preview(cmd: dict) -> str:
    if os.name == "nt":
        quote = lambda value: "'" + str(value).replace("'", "''") + "'"
        return "Set-Location -LiteralPath " + quote(cmd["cwd"]) + "\n& " + " ".join(quote(a) for a in cmd["argv"])
    return "cd " + shlex.quote(cmd["cwd"]) + " && \\\n  " + " \\\n  ".join(shlex.quote(a) for a in cmd["argv"])


def render(job: dict, dataset_path: str, job_dir: Path) -> dict:
    """Write config files for the job and return {files, command}."""
    files = {}
    if job["backend"] == "ai-toolkit":
        cfg = build_ai_toolkit(job, dataset_path)
        text = yaml.safe_dump(cfg, sort_keys=False, allow_unicode=True)
        files["config.yaml"] = text
        cmd = ai_toolkit_command(job, job_dir / "config.yaml")
    elif job["backend"] == "sd-scripts":
        if job["model"] != "anima":
            raise ValueError("sd-scripts backend hanya untuk Anima")
        files["dataset.toml"] = build_sd_scripts_dataset_toml(job, dataset_path)
        files["prompts.txt"] = build_sd_scripts_prompts(job)
        cmd = sd_scripts_command(job, job_dir)
    else:
        raise ValueError(f"unknown backend {job['backend']}")
    return {"files": files, "command": cmd, "command_text": command_preview(cmd)}
