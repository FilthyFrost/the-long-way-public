#!/usr/bin/env python3
"""Pixel difference between two folders of screenshots with the same names.

    python3 -I harness/shots/pixdiff.py <before_dir> <after_dir> [name ...]

Prints, per picture: mean absolute difference (0–255), the largest one, and the share of pixels
that changed by more than 8 levels. Used to prove a change left a set of pictures alone.
Exit code 1 when any picture has more than 0.5 % of its pixels changed that much.
"""
import os
import sys

from PIL import Image, ImageChops

a_dir, b_dir = sys.argv[1], sys.argv[2]
names = sys.argv[3:] or sorted(f[:-4] for f in os.listdir(a_dir) if f.endswith('.png'))
worst = 0.0
for n in names:
    pa = os.path.join(a_dir, n + '.png')
    pb = os.path.join(b_dir, n + '.png')
    if not (os.path.exists(pa) and os.path.exists(pb)):
        print(f'{n:28s} missing')
        continue
    a = Image.open(pa).convert('RGB')
    b = Image.open(pb).convert('RGB')
    if a.size != b.size:
        print(f'{n:28s} size differs {a.size} {b.size}')
        worst = 100.0
        continue
    d = ImageChops.difference(a, b).convert('L')
    hist = d.histogram()
    total = a.size[0] * a.size[1]
    mean = sum(i * c for i, c in enumerate(hist)) / total
    mx = max(i for i, c in enumerate(hist) if c)
    changed = sum(hist[9:]) / total * 100
    worst = max(worst, changed)
    print(f'{n:28s} mean {mean:6.3f}  max {mx:3d}  changed>8: {changed:6.3f} %')
sys.exit(1 if worst > 0.5 else 0)
