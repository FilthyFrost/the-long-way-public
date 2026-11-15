"""Side-by-side sheets: our style shots next to the reference each one names (specs/art/STYLE.md §9).

    python3 -I harness/shots/compare.py [set] [--out loop/shots/_compare]

For every shot in harness/shots/sets/<set>.json that has "ref", writes <name>.png = ours | ref,
and an overview sheet _all.png with every shot (ours left, reference or blank right).
"""
import json
import os
import sys

from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
args = sys.argv[1:]
out_dir = os.path.join(ROOT, 'loop/shots/_compare')
if '--out' in args:
    i = args.index('--out')
    out_dir = os.path.join(ROOT, args[i + 1])
    del args[i:i + 2]
set_name = args[0] if args else 'style'
spec = json.load(open(os.path.join(ROOT, 'harness/shots/sets', f'{set_name}.json')))
ref_dirs = [os.path.join(ROOT, 'refs/targets', d) for d in sorted(os.listdir(os.path.join(ROOT, 'refs/targets')))]
ref_dirs.append(os.path.join(ROOT, 'refs/artstation-1NKWJK'))
os.makedirs(out_dir, exist_ok=True)
W, H = 640, 360


def find_ref(name):
    for d in ref_dirs:
        p = os.path.join(d, name)
        if os.path.exists(p):
            return p
    return None


def label(im, text):
    d = ImageDraw.Draw(im)
    d.rectangle([0, 0, 8 + 7 * len(text), 18], fill=(0, 0, 0))
    d.text((4, 3), text, fill=(255, 255, 255))


rows = []
for shot in spec['shots']:
    ours_p = os.path.join(ROOT, 'loop/shots', spec['set'], shot['name'] + '.png')
    if not os.path.exists(ours_p):
        continue
    ours = Image.open(ours_p).convert('RGB').resize((W, H), Image.LANCZOS)
    label(ours, 'ours: ' + shot['name'])
    ref_p = find_ref(shot['ref']) if shot.get('ref') else None
    right = Image.new('RGB', (W, H), (40, 40, 40))
    if ref_p:
        right = Image.open(ref_p).convert('RGB').resize((W, H), Image.LANCZOS)
        label(right, 'ref: ' + shot['ref'])
    row = Image.new('RGB', (2 * W, H))
    row.paste(ours, (0, 0))
    row.paste(right, (W, 0))
    if ref_p:
        row.save(os.path.join(out_dir, shot['name'] + '.png'))
    rows.append(row)

if rows:
    sheet = Image.new('RGB', (2 * W, H * len(rows)))
    for i, r in enumerate(rows):
        sheet.paste(r, (0, i * H))
    sheet.save(os.path.join(out_dir, '_all.png'))
print(f'{len(rows)} rows -> {out_dir}')
