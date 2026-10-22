"""Builds prompts in exactly the caption format the LoRAs were trained on
(Dataset_curated/scripts/07_captions.py). Field order: chibi, outfit, props, age."""

TEMPLATES = {
    "stage1": "aqstyle lineart. Clean up this rough sketch into finished manhwa lineart. Characters: {names}.",
    "stage2": "aqstyle color. Color this lineart in flat cel-shaded manhwa style on a green screen, matching the character reference. Characters: {names}.",
}

SCHOOL = "school uniform"

# Character-specific presets are private workspace data, loaded from ignored config.
from .settings import CFG
OUTFIT_PRESETS = CFG.get("outfit_presets", {})
PROP_PRESETS = CFG.get("prop_presets", [])

AGE_VARIANTS = ["default", "child", "infant", "flashback"]


def build(stage: str, characters, outfits=None, chibi=False, props=None, age="default", note="", with_props=True):
    """stage: 'stage1' or 'stage2'. outfits: {name: description}; missing or blank = school uniform."""
    if not characters:
        raise ValueError("Pilih minimal satu karakter")
    outfits = outfits or {}
    caption = TEMPLATES[stage].format(names=", ".join(characters))
    if len(characters) > 1:
        caption = caption.replace("Characters: ", "Characters, left to right: ")
    tags = []
    if chibi:
        tags.append("chibi style.")
    descs = [(n, (outfits.get(n) or SCHOOL).strip().rstrip(".")) for n in characters]
    if all(d == SCHOOL for _, d in descs):
        tags.append("Outfit: school uniform.")
    elif len(descs) == 1:
        tags.append(f"Outfit: {descs[0][1]}.")
    else:
        tags.append("Outfit: " + "; ".join(f"{n} - {d}" for n, d in descs) + ".")
    props = [p.strip().rstrip(".") for p in (props or []) if p and p.strip()][:6]
    if props and with_props:
        tags.append("Props: " + ", ".join(props) + ".")
    if age and age != "default":
        tags.append(f"{age} version.")
    note = (note or "").strip()
    if note:
        tags.append(note if note.endswith(".") else note + ".")
    return caption + " " + " ".join(tags)
