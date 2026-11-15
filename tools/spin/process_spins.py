"""Turn Arma spin screenshots into Codex 360° frames.

usage: python process_spins.py <screenshots folder> <orbat folder>

Reads 41st_<name>_NN.png, cuts out the magenta backdrop, crops every frame of a
spin to the same box (so the trooper doesn't jump), shrinks to 720 px tall and
writes web/public/codex/spin/<name>/NN.webp, then updates web/src/codex/spins.json.
"""
import json, os, re, sys
from collections import defaultdict

import numpy as np
from PIL import Image, ImageFilter

HEIGHT = 720


def key_out(im):
    a = np.asarray(im.convert("RGB")).astype(np.int16)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    # magenta: red and blue both well above green
    bg = (r - g > 60) & (b - g > 60) & (np.abs(r - b) < 90)
    alpha = np.where(bg, 0, 255).astype(np.uint8)
    # soften the edge a little, then pull magenta spill out of edge pixels
    m = Image.fromarray(alpha).filter(ImageFilter.MinFilter(3)).filter(ImageFilter.GaussianBlur(0.8))
    rgb = a.copy()
    spill = (np.minimum(r, b) - g) > 20
    cap = np.maximum(g, (r + b) // 4)
    rgb[..., 0] = np.where(spill, np.minimum(r, cap + 30), r)
    rgb[..., 2] = np.where(spill, np.minimum(b, cap + 30), b)
    out = Image.fromarray(rgb.clip(0, 255).astype(np.uint8)).convert("RGBA")
    out.putalpha(m)
    return out


def keep_trooper(img):
    """Drop stray bits (floor seams, specks): keep the biggest shape and anything
    large that sits inside its outline."""
    try:
        from scipy import ndimage
    except ImportError:
        return img
    a = np.asarray(img.getchannel("A"))
    lab, n = ndimage.label(a > 40)
    if n <= 1:
        return img
    sizes = ndimage.sum(np.ones_like(a), lab, range(1, n + 1))
    big = int(np.argmax(sizes)) + 1
    ys, xs = np.where(lab == big)
    y0, y1, x0, x1 = ys.min(), ys.max(), xs.min(), xs.max()
    keep = np.zeros(n + 1, bool)
    keep[big] = True
    for i, sl in enumerate(ndimage.find_objects(lab), start=1):
        if i == big or sizes[i - 1] < sizes[big - 1] * 0.01:
            continue
        cy, cx = (sl[0].start + sl[0].stop) / 2, (sl[1].start + sl[1].stop) / 2
        keep[i] = y0 <= cy <= y1 and x0 <= cx <= x1
    # keep the soft edge pixels next to kept shapes
    grown = ndimage.binary_dilation(keep[lab], iterations=3)
    out = img.copy()
    out.putalpha(Image.fromarray(np.where(grown, a, 0).astype(np.uint8)))
    return out


def main(src, orbat):
    groups = defaultdict(list)
    for f in os.listdir(src):
        m = re.match(r"^41st_(.+)_(\d{2,3})\.png$", f, re.I)
        if m:
            groups[m.group(1).lower()].append((int(m.group(2)), os.path.join(src, f)))
    manifest_path = os.path.join(orbat, "web", "src", "codex", "spins.json")
    manifest = json.load(open(manifest_path)) if os.path.exists(manifest_path) else {}
    for name, frames in sorted(groups.items()):
        frames.sort()
        cut = [keep_trooper(key_out(Image.open(p))) for _, p in frames]
        boxes = [c.getchannel("A").point(lambda v: 255 if v > 40 else 0).getbbox() for c in cut]
        boxes = [b for b in boxes if b]
        if not boxes:
            print("skip (nothing left after removing the backdrop):", name)
            continue
        x0 = min(b[0] for b in boxes); y0 = min(b[1] for b in boxes)
        x1 = max(b[2] for b in boxes); y1 = max(b[3] for b in boxes)
        pad = int((y1 - y0) * 0.04)
        W, H = cut[0].size
        box = (max(0, x0 - pad), max(0, y0 - pad), min(W, x1 + pad), min(H, y1 + pad))
        out_dir = os.path.join(orbat, "web", "public", "codex", "spin", name)
        os.makedirs(out_dir, exist_ok=True)
        for f in os.listdir(out_dir):
            os.remove(os.path.join(out_dir, f))
        size = None
        for i, c in enumerate(cut):
            c = c.crop(box)
            c = c.resize((round(c.width * HEIGHT / c.height), HEIGHT), Image.LANCZOS)
            size = c.size
            c.save(os.path.join(out_dir, f"{i:02d}.webp"), "WEBP", quality=80, method=4)
        manifest[name] = {"frames": len(cut), "width": size[0], "height": size[1], "srcHeight": box[3] - box[1]}
        print(f"{name}: {len(cut)} frames, {size[0]}x{size[1]}")
    json.dump(manifest, open(manifest_path, "w"), indent=1, sort_keys=True)


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
