#!/usr/bin/env python3
"""The motorhome next to its reference art (specs/vehicles/rv_model.md §6).

    python3 -I harness/shots/compare_rv.py [--refs refs/rv-reference] [--out loop/shots/_compare]

Puts rv_front34, rv_side_right, rv_cutaway_side and rv_room_rear (from loop/shots/vehicles/) side by
side with the pictures in the reference folder and writes loop/shots/_compare/rv_<shot>.jpg. A
reference is matched by name when a file starts with the shot's name (rv_front34*.jpg …); the others
are paired in sorted order. Without any reference picture it says so and does nothing.
"""
import os
import sys

from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
args = sys.argv[1:]


def opt(name, default):
    if name in args:
        i = args.index(name)
        return os.path.join(ROOT, args[i + 1])
    return os.path.join(ROOT, default)


refs_dir = opt('--refs', 'refs/rv-reference')
out_dir = opt('--out', 'loop/shots/_compare')
shots = ['rv_front34', 'rv_side_right', 'rv_cutaway_side', 'rv_room_rear']
exts = ('.png', '.jpg', '.jpeg', '.webp')
refs = sorted(f for f in os.listdir(refs_dir) if f.lower().endswith(exts)) if os.path.isdir(refs_dir) else []
if not refs:
    print(f'no reference pictures in {os.path.relpath(refs_dir, ROOT)}: nothing to compare (put the reference art there)')
    sys.exit(0)

os.makedirs(out_dir, exist_ok=True)
H = 540
unused = [r for r in refs if not any(r.startswith(s) for s in shots)]
for s in shots:
    ours = os.path.join(ROOT, 'loop/shots/vehicles', s + '.png')
    if not os.path.exists(ours):
        print(f'{s}: not rendered yet (node harness/shots/run.mjs vehicles)')
        continue
    named = [r for r in refs if r.startswith(s)]
    ref = named[0] if named else (unused.pop(0) if unused else None)
    if ref is None:
        print(f'{s}: no reference left to pair with')
        continue
    a = Image.open(ours).convert('RGB')
    b = Image.open(os.path.join(refs_dir, ref)).convert('RGB')
    a = a.resize((round(a.width * H / a.height), H), Image.LANCZOS)
    b = b.resize((round(b.width * H / b.height), H), Image.LANCZOS)
    sheet = Image.new('RGB', (a.width + b.width + 12, H), (22, 25, 30))
    sheet.paste(a, (0, 0))
    sheet.paste(b, (a.width + 12, 0))
    d = ImageDraw.Draw(sheet)
    for x, text in [(0, s), (a.width + 12, ref)]:
        d.rectangle([x, 0, x + 10 + 7 * len(text), 20], fill=(0, 0, 0))
        d.text((x + 5, 4), text, fill=(255, 255, 255))
    out = os.path.join(out_dir, s + '.jpg')
    sheet.save(out, quality=88)
    print(out)
