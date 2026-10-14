"""Auto-caption through any OpenAI-compatible vision endpoint (Ollama, LM Studio, vLLM...)."""

import base64
import io

import httpx
from PIL import Image, ImageOps

from .config import load_settings

PROMPTS = {
    "natural": (
        "Describe this image as a single detailed caption for training an image generation model. "
        "Write 1-3 natural English sentences covering subject, clothing, pose, expression, camera angle, "
        "lighting, background and art medium. Do not start with 'This image' or 'The image'. "
        "Output only the caption."
    ),
    "tags": (
        "Tag this image with Danbooru-style tags for training an anime image model. "
        "Output ONLY a comma-separated list of lowercase tags with spaces instead of underscores, "
        "starting with the subject count (e.g. 1girl, solo), then hair, eyes, clothing, pose, expression, "
        "background and composition tags. No quality tags, no explanations."
    ),
}


def _encode(path, max_side=1024) -> str:
    with Image.open(path) as im:
        im = ImageOps.exif_transpose(im).convert("RGB")
        im.thumbnail((max_side, max_side))
        buf = io.BytesIO()
        im.save(buf, "JPEG", quality=90)
    return base64.b64encode(buf.getvalue()).decode()


def caption_image(path, style: str = "natural", trigger: str = "", extra: str = "") -> str:
    s = load_settings()
    base = s["caption_api_base"].rstrip("/")
    prompt = PROMPTS.get(style, PROMPTS["natural"])
    if trigger:
        prompt += (
            f" The main subject is called '{trigger}'. Refer to it by that name instead of describing its "
            "fixed identity features." if style == "natural" else ""
        )
    if extra:
        prompt += " " + extra
    headers = {"Content-Type": "application/json"}
    if s.get("caption_api_key"):
        headers["Authorization"] = f"Bearer {s['caption_api_key']}"
    body = {
        "model": s["caption_model"],
        "messages": [{
            "role": "user",
            "content": [
                {"type": "text", "text": prompt},
                {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{_encode(path)}"}},
            ],
        }],
        "temperature": 0.2,
        "max_tokens": 300,
    }
    r = httpx.post(f"{base}/chat/completions", json=body, headers=headers, timeout=180)
    r.raise_for_status()
    text = r.json()["choices"][0]["message"]["content"].strip().strip('"').replace("\n", " ")
    if trigger and style == "tags":
        # trigger always first so keep_tokens=1 protects it from shuffling
        rest = [t.strip() for t in text.split(",") if t.strip() and t.strip().lower() != trigger.lower()]
        text = ", ".join([trigger] + rest)
    elif trigger and trigger.lower() not in text.lower():
        text = f"{trigger}, {text}"
    return text
