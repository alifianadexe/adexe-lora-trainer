"""GPU / host information for the dashboard."""

import platform
import shutil
import subprocess

from .config import DATA_DIR


def gpu_info() -> list:
    exe = shutil.which("nvidia-smi")
    if not exe:
        return []
    try:
        out = subprocess.run(
            [exe, "--query-gpu=name,memory.total,memory.used,utilization.gpu,temperature.gpu",
             "--format=csv,noheader,nounits"],
            capture_output=True, text=True, timeout=5,
        ).stdout
    except Exception:
        return []
    gpus = []
    for line in out.strip().splitlines():
        parts = [x.strip() for x in line.split(",")]
        if len(parts) >= 5:
            def num(x):
                try:
                    return float(x)
                except ValueError:
                    return None
            gpus.append({
                "name": parts[0],
                "mem_total_mb": num(parts[1]),
                "mem_used_mb": num(parts[2]),
                "util": num(parts[3]),
                "temp": num(parts[4]),
            })
    return gpus


def host_info() -> dict:
    du = shutil.disk_usage(DATA_DIR)
    return {
        "os": f"{platform.system()} {platform.release()}",
        "python": platform.python_version(),
        "disk_free_gb": round(du.free / 1e9, 1),
        "data_dir": str(DATA_DIR),
    }
