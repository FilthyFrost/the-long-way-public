#!/usr/bin/env python3
"""
Style statistics of screenshots, and their distance to the reference set.

  python3 harness/judge/style_compare.py <image> [<image> ...]            print stats
  python3 harness/judge/style_compare.py --set <set> --ref <dir> [--ref <dir> ...] [--out f]   compare a shot set to references

The numbers describe what makes the painted-background look measurable without a human:
colourfulness, how much of the frame is saturated sky blue, how bright and how green the land is,
how flat the paint is (fine-detail energy), the value range, and a small palette per image.
"""
import json
import os
import sys

import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


def load(path, width=640):
    im = Image.open(path).convert('RGB')
    h = int(im.height * width / im.width)
    return np.asarray(im.resize((width, h), Image.LANCZOS), dtype=np.float32) / 255.0


def hsv(a):
    mx = a.max(axis=2)
    mn = a.min(axis=2)
    d = mx - mn
    s = np.where(mx > 1e-5, d / np.maximum(mx, 1e-5), 0)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    h = np.zeros_like(mx)
    m = d > 1e-5
    rc = np.where(m, (mx - r) / np.maximum(d, 1e-5), 0)
    gc = np.where(m, (mx - g) / np.maximum(d, 1e-5), 0)
    bc = np.where(m, (mx - b) / np.maximum(d, 1e-5), 0)
    h = np.where(r == mx, bc - gc, np.where(g == mx, 2.0 + rc - bc, 4.0 + gc - rc))
    h = (h / 6.0) % 1.0
    return h * 360, s, mx


def colourfulness(a):
    # Hasler & Suesstrunk (2003): ~ 0 grey, 30 moderately, 60+ highly colourful
    r, g, b = a[..., 0] * 255, a[..., 1] * 255, a[..., 2] * 255
    rg = r - g
    yb = 0.5 * (r + g) - b
    return float(np.sqrt(rg.std() ** 2 + yb.std() ** 2) + 0.3 * np.sqrt(rg.mean() ** 2 + yb.mean() ** 2))


def fine_energy(a):
    # energy of 1-px detail relative to the image: high = noisy/photographic, low = flat paint
    l = 0.2126 * a[..., 0] + 0.7152 * a[..., 1] + 0.0722 * a[..., 2]
    lap = np.abs(4 * l[1:-1, 1:-1] - l[:-2, 1:-1] - l[2:, 1:-1] - l[1:-1, :-2] - l[1:-1, 2:])
    return float(lap.mean() * 100)


def palette(a, k=6, iters=12):
    px = a.reshape(-1, 3)
    rng = np.random.default_rng(0)
    px = px[rng.choice(len(px), min(len(px), 20000), replace=False)]
    c = px[rng.choice(len(px), k, replace=False)]
    for _ in range(iters):
        d = ((px[:, None, :] - c[None, :, :]) ** 2).sum(-1)
        lab = d.argmin(1)
        for i in range(k):
            sel = px[lab == i]
            if len(sel):
                c[i] = sel.mean(0)
    share = np.bincount(lab, minlength=k) / len(px)
    order = np.argsort(-share)
    return [('#%02x%02x%02x' % tuple((c[i] * 255).astype(int)), round(float(share[i]), 3)) for i in order]


def stats(path):
    a = load(path)
    h, s, v = hsv(a)
    H = a.shape[0]
    sky_blue = ((h > 190) & (h < 230) & (s > 0.35) & (v > 0.45)).mean()
    white = ((s < 0.12) & (v > 0.86)).mean()
    green = ((h > 60) & (h < 160) & (s > 0.25)).mean()
    land = a[int(H * 0.45):]
    lh, ls, lv = hsv(land)
    gmask = (lh > 60) & (lh < 160) & (ls > 0.2)
    out = {
        'colourfulness': round(colourfulness(a), 1),
        'mean_sat': round(float(s.mean()), 3),
        'mean_value': round(float(v.mean()), 3),
        'sky_blue_share': round(float(sky_blue), 3),
        'white_share': round(float(white), 3),
        'green_share': round(float(green), 3),
        'land_green_sat': round(float(ls[gmask].mean()) if gmask.any() else 0.0, 3),
        'land_green_value': round(float(lv[gmask].mean()) if gmask.any() else 0.0, 3),
        'land_green_hue': round(float(lh[gmask].mean()) if gmask.any() else 0.0, 1),
        'value_p05': round(float(np.quantile(v, 0.05)), 3),
        'value_p95': round(float(np.quantile(v, 0.95)), 3),
        'fine_energy': round(fine_energy(a), 2),
        'palette': palette(a),
    }
    return out


KEYS = ['colourfulness', 'mean_sat', 'mean_value', 'sky_blue_share', 'white_share', 'land_green_sat', 'land_green_value', 'fine_energy']


def distance(s, refs):
    """Normalised distance of one image's stats to the mean of the references (0 = same)."""
    scale = {'colourfulness': 30, 'mean_sat': 0.25, 'mean_value': 0.25, 'sky_blue_share': 0.25, 'white_share': 0.15, 'land_green_sat': 0.25, 'land_green_value': 0.25, 'fine_energy': 3}
    d = {}
    for k in KEYS:
        r = float(np.mean([x[k] for x in refs]))
        d[k] = round(abs(s[k] - r) / scale[k], 3)
    return d, round(float(np.mean(list(d.values()))), 3)


if __name__ == '__main__':
    args = sys.argv[1:]
    if args and args[0] == '--set':
        set_name = args[1]
        # one or more reference folders (--ref a --ref b); missing or empty ones are skipped
        ref_dirs = [os.path.join(ROOT, args[i + 1]) if not os.path.isabs(args[i + 1]) else args[i + 1] for i, a in enumerate(args) if a == '--ref']
        out = args[args.index('--out') + 1] if '--out' in args else os.path.join(ROOT, 'loop/metrics', f'style_{set_name}.json')
        ref_files = sorted(
            os.path.join(d, f) for d in ref_dirs if os.path.isdir(d) for f in os.listdir(d) if f.lower().endswith(('.png', '.jpg', '.jpeg', '.webp')) and not f.startswith('_')
        )
        refs = [stats(f) for f in ref_files]
        shot_dir = os.path.join(ROOT, 'loop/shots', set_name)
        # only shots that name a reference in the set file are comparable (same biome, light and framing);
        # the rest (other biomes, other hours) are measured and reported but not scored
        set_file = os.path.join(ROOT, 'harness/shots/sets', f'{set_name}.json')
        comparable = None
        if os.path.exists(set_file):
            with open(set_file) as fh:
                comparable = {sh['name'] for sh in json.load(fh)['shots'] if sh.get('ref')}
        shots = {}
        for f in sorted(os.listdir(shot_dir)):
            if f.endswith('.png'):
                st = stats(os.path.join(shot_dir, f))
                st['distance'], st['distance_mean'] = distance(st, refs)
                st['scored'] = comparable is None or f[:-4] in comparable
                shots[f[:-4]] = st
        scored = [s for s in shots.values() if s['scored']] or list(shots.values())
        means = {k: round(float(np.mean([x[k] for x in refs])), 3) for k in KEYS}
        metrics = {
            'style_distance_mean': round(float(np.mean([s['distance_mean'] for s in scored])), 3),
            'style_distance_max': round(float(np.max([s['distance_mean'] for s in scored])), 3),
            'scored_shots': len(scored),
            'colourfulness_mean': round(float(np.mean([s['colourfulness'] for s in scored])), 1),
            'land_green_sat_mean': round(float(np.mean([s['land_green_sat'] for s in scored])), 3),
            'fine_energy_mean': round(float(np.mean([s['fine_energy'] for s in scored])), 2),
        }
        with open(out, 'w') as fh:
            json.dump({'system': 'style', 'id': set_name, 'metrics': metrics, 'reference_means': means, 'references': [os.path.relpath(f, ROOT) for f in ref_files], 'shots': shots}, fh, indent=2)
            fh.write('\n')
        print(json.dumps({'metrics': metrics, 'reference_means': means}, indent=1))
    else:
        for p in args:
            print(os.path.basename(p), json.dumps(stats(p)))
