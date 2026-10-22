"""Bold lineart extractor (v4). Derived from 25_refined_lineart.py.

Differences from v3:
- Broad dark fills (black hair, dark objects) become one smooth, closed outer
  contour drawn at the normal stroke width instead of an eroded, jagged ring.
  Lighter islands inside a fill (hair highlights, face/skin) only keep their
  outline when they are large enough to be real structure.
- Speckles are removed and short gaps bridged at 768-scale.
- Strokes are normalised to ~3 px at 768x1344 and rendered near-black with
  a narrow anti-aliased edge on white.
CPU-only extraction helpers; no files are written on import.
"""
from PIL import Image, ImageOps, ImageDraw
import numpy as np
import cv2
from skimage.morphology import skeletonize
from scipy.spatial import cKDTree

Image.MAX_IMAGE_PIXELS = 300_000_000
OUT_W = 756  # framefit content width used by the 768x1344 export
K3 = np.ones((3, 3), np.uint8)


def disk(r):
    r = max(1, int(round(r)))
    return cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2 * r + 1, 2 * r + 1))


def masks(a, dark_cut=100):
    wide = a.astype(np.int16)
    green = (wide[:, :, 1] > wide[:, :, 0] + 45) & (wide[:, :, 1] > wide[:, :, 2] + 45) & (wide[:, :, 1] > 90)
    gray = cv2.cvtColor(a, cv2.COLOR_RGB2GRAY)
    gray[green] = 255
    dark = ((a.max(2) < dark_cut) & ~green).astype(np.uint8)
    return wide, green, gray, dark


def fill_regions(dark, s, rgb):
    """Broad dark areas: survive an opening wider than any ink stroke."""
    fills = cv2.morphologyEx(dark, cv2.MORPH_OPEN, disk(max(7, 8 * s)))
    if not fills.any():
        return fills
    # Absorb grey sheen (hair highlights) that touches a fill: open the dark|grey mask
    # and keep only its parts that overlap a real dark fill.
    wide = rgb.astype(np.int16)
    grey = (wide.max(2) < 170) & ((wide.max(2) - wide.min(2)) < 40)
    cand = cv2.morphologyEx((dark | grey).astype(np.uint8), cv2.MORPH_OPEN, disk(max(7, 8 * s)))
    n, lab = cv2.connectedComponents(cand, connectivity=8)
    hit = np.unique(lab[(fills > 0) & (cand > 0)])
    keep = np.isin(lab, hit[hit > 0])
    fills = (fills | keep).astype(np.uint8)
    # grow back to the true dark boundary (opening shrinks concave tips)
    fills = cv2.dilate(fills, disk(2 * s)) & dark
    fills = cv2.morphologyEx(fills, cv2.MORPH_CLOSE, disk(3 * s))
    # fill small lighter islands (specular highlights) so they do not become blobs
    h, w = fills.shape
    pad = np.pad(fills, 1)
    flood = pad.copy()
    cv2.floodFill(flood, None, (0, 0), 1)
    holes = (flood[1:-1, 1:-1] == 0).astype(np.uint8)
    n, lab, st, _ = cv2.connectedComponentsWithStats(holes, connectivity=8)
    min_keep = (60 * s) ** 2  # a hole must be ~60x60 px at 768 scale to stay structural
    for i in range(1, n):
        x, y, bw, bh, area = st[i]
        thin = area / max(1, bw * bh) < 0.25
        region = lab[y:y + bh, x:x + bw] == i
        px = rgb[y:y + bh, x:x + bw][region].astype(np.int16)
        val = np.median(px.max(1)); sat = np.median(px.max(1) - px.min(1))
        highlight = val < 190 and sat < 40  # grey sheen on dark hair/objects, not skin or cloth
        if area < min_keep or (thin and area < 3 * min_keep) or highlight:
            fills[lab == i] = 1
    # smooth the boundary: blur + rethreshold removes stair-steps and hairline spikes
    sigma = max(1.0, 1.2 * s)
    sm = cv2.GaussianBlur(fills.astype(np.float32), (0, 0), sigma)
    fills = (sm > 0.5).astype(np.uint8)
    # drop tiny fills
    n, lab, st, _ = cv2.connectedComponentsWithStats(fills, connectivity=8)
    for i in range(1, n):
        if st[i, cv2.CC_STAT_AREA] < (12 * s) ** 2:
            fills[lab == i] = 0
    return fills


def extract(image, stroke_px=2.6, dark_cut=100):
    """Return (L image at source resolution, metrics). Strokes ~stroke_px at 768 scale."""
    a = np.asarray(image.convert("RGB"))
    s = a.shape[1] / OUT_W  # source pixels per output pixel
    wide, green, gray, dark = masks(a, dark_cut)
    fills = fill_regions(dark, s, a)
    width = max(1, int(round(stroke_px * s)))
    # contours of the fills, drawn at the normal stroke width
    contour = np.zeros_like(dark)
    if fills.any():
        cs, hier = cv2.findContours(fills, cv2.RETR_CCOMP, cv2.CHAIN_APPROX_NONE)
        cs = [cv2.approxPolyDP(c, 0.6 * s, True) for c in cs]
        cv2.drawContours(contour, cs, -1, 1, width, lineType=cv2.LINE_AA)
    inside = cv2.erode(fills, disk(width))  # interior of fills (excluding the new outline)
    strokes = (dark > 0) & (inside == 0) & (fills == 0)
    # Light-gray / neutral detail lines (as v3) outside fills
    response = np.zeros(gray.shape, np.uint8)
    for k in [max(3, int(3 * s) | 1), max(5, int(6 * s) | 1)]:
        response = np.maximum(response, cv2.morphologyEx(gray, cv2.MORPH_BLACKHAT, disk(k / 2)))
    neutral = (wide.max(2) - wide.min(2)) < 24
    detail = (response > 28) & (gray < 150) & neutral & ~green & (fills == 0)
    ink = (strokes | detail).astype(np.uint8)
    # normalise thin strokes upward: dilate so that thin lines reach ~stroke_px, thick ones barely change
    dt = cv2.distanceTransform(ink, cv2.DIST_L2, 3)
    sk = skeletonize(ink > 0)
    med = float(np.median(2 * dt[sk])) if sk.any() else width
    grow = max(0.0, (stroke_px * s - med) / 2)
    if grow >= 0.5:
        ink = cv2.dilate(ink, disk(grow))
    ink = np.maximum(ink, (contour > 0).astype(np.uint8))
    # speckles: components smaller than ~3x3 px at 768 scale
    n, lab, st, _ = cv2.connectedComponentsWithStats(ink, connectivity=8)
    small = np.zeros(n, bool)
    small[1:] = st[1:, cv2.CC_STAT_AREA] < (3.2 * s) ** 2
    ink[small[lab]] = 0
    out = np.where(ink > 0, 0, 255).astype(np.uint8)
    return Image.fromarray(out, "L"), dict(scale=round(s, 3), stroke_src_px=width, median_src_width=round(med, 2),
                                          grow=round(grow, 2), fill_frac=round(float(fills.mean()), 5))


def bridge_gaps(g, gap=3.5):
    """At output scale: join stroke end-points of different strokes that are <= gap px apart."""
    ink = (g < 128).astype(np.uint8)
    sk = skeletonize(ink > 0).astype(np.uint8)
    nb = cv2.filter2D(sk, -1, K3, borderType=cv2.BORDER_CONSTANT) - sk
    ys, xs = np.nonzero((sk == 1) & (nb == 1))
    if len(xs) < 2:
        return g, 0
    _, lab = cv2.connectedComponents(sk, connectivity=8)
    out = g.copy()
    used = set(); n = 0
    for i, j in cKDTree(np.c_[xs, ys]).query_pairs(gap):
        if i in used or j in used or lab[ys[i], xs[i]] == lab[ys[j], xs[j]]:
            continue
        cv2.line(out, (int(xs[i]), int(ys[i])), (int(xs[j]), int(ys[j])), 0, 2, cv2.LINE_AA)
        used.update((i, j)); n += 1
    return out, n


def to_768(lineart_src):
    """framefit to 768x1344 with area resampling, then a contrast curve so lines are near-black."""
    im = ImageOps.fit(lineart_src.convert("L"), (OUT_W, 1344), method=Image.Resampling.BOX)
    g = np.asarray(im).astype(np.float32)
    g = np.clip((g - 60) * 255 / (230 - 60), 0, 255).astype(np.uint8)
    g, bridged = bridge_gaps(g)
    canvas = Image.new("L", (768, 1344), 255)
    canvas.paste(Image.fromarray(g), (6, 0))
    return canvas.convert("RGB"), bridged


