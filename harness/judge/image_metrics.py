#!/usr/bin/env python3
"""
Image metrics for a screenshot set: exposure and colour checks that need no human.
  python3 harness/judge/image_metrics.py <set> [<set> ...]
Writes loop/metrics/image_<set>.json
"""
import json, os, sys
import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

def srgb_to_linear(c):
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)

def analyse(path):
    im = np.asarray(Image.open(path).convert('RGB'), dtype=np.float32) / 255.0
    h, w, _ = im.shape
    luma = 0.2126 * im[..., 0] + 0.7152 * im[..., 1] + 0.0722 * im[..., 2]   # display-referred
    out = {
        'mean_luma': float(luma.mean()),
        'black_pct': float((luma < 8 / 255).mean() * 100),
        'white_pct': float((luma > 248 / 255).mean() * 100),
    }
    # the world as seen through and around the windscreen: skip the top sky band and the dash
    reg = im[int(h * 0.30):int(h * 0.62), :, :]
    rl = 0.2126 * reg[..., 0] + 0.7152 * reg[..., 1] + 0.0722 * reg[..., 2]
    mx = reg.max(axis=2)
    mn = reg.min(axis=2)
    sat = np.where(mx > 1e-4, (mx - mn) / np.maximum(mx, 1e-4), 0)
    out['world_mean_luma'] = float(rl.mean())
    out['world_mean_sat'] = float(sat.mean())
    # shadow tint: the darkest fifth of the world region should lean cool (blue >= red) and keep some chroma
    thr = np.quantile(rl, 0.2)
    dark = reg[rl <= thr]
    if len(dark):
        r, g, b = dark[:, 0].mean(), dark[:, 1].mean(), dark[:, 2].mean()
        out['shadow_blue_minus_red'] = float(b - r)
        out['shadow_chroma'] = float(max(r, g, b) - min(r, g, b))
    # luminance layering: how much of the histogram sits in its three strongest bands (cel look → high)
    hist, _ = np.histogram(rl, bins=24, range=(0, 1))
    hist = hist / max(1, hist.sum())
    out['luma_top3_bins'] = float(np.sort(hist)[-3:].sum())
    return out

for set_name in sys.argv[1:]:
    d = os.path.join(ROOT, 'loop/shots', set_name)
    shots = {}
    for f in sorted(os.listdir(d)):
        if f.endswith('.png'):
            shots[f[:-4]] = analyse(os.path.join(d, f))
    night = {k: v for k, v in shots.items() if any(t in k for t in ('night', 'aurora', '_blue', '2300', '0100'))}
    day = {k: v for k, v in shots.items() if k not in night}
    clear_day = {k: v for k, v in day.items() if not any(t in k for t in ('storm', 'fog', 'sand', 'blizzard', 'snow', 'hail'))}
    metrics = {
        'images': len(shots),
        'max_black_pct': max(v['black_pct'] for v in shots.values()),
        'max_white_pct': max(v['white_pct'] for v in shots.values()),
        'min_mean_luma': min(v['mean_luma'] for v in shots.values()),
        'max_mean_luma': max(v['mean_luma'] for v in shots.values()),
    }
    if night:
        metrics['night_min_world_luma'] = min(v['world_mean_luma'] for v in night.values())
        metrics['night_max_world_luma'] = max(v['world_mean_luma'] for v in night.values())
    if clear_day:
        metrics['day_min_shadow_blue_minus_red'] = min(v.get('shadow_blue_minus_red', 0) for v in clear_day.values())
        metrics['day_min_shadow_chroma'] = min(v.get('shadow_chroma', 0) for v in clear_day.values())
        metrics['day_mean_world_sat'] = float(np.mean([v['world_mean_sat'] for v in clear_day.values()]))
    metrics = {k: (round(v, 4) if isinstance(v, float) else v) for k, v in metrics.items()}
    with open(os.path.join(ROOT, 'loop/metrics', f'image_{set_name}.json'), 'w') as fh:
        json.dump({'system': 'image', 'id': set_name, 'metrics': metrics, 'shots': shots}, fh, indent=2)
        fh.write('\n')
    print(set_name, json.dumps(metrics, ensure_ascii=False))
