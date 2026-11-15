#!/usr/bin/env python3
"""Contact sheet: python3 harness/shots/sheet.py <set> <out.jpg> [cols] [name:label ...]"""
import json, os, sys
from PIL import Image, ImageDraw, ImageFont

root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
set_name, out = sys.argv[1], sys.argv[2]
cols = int(sys.argv[3]) if len(sys.argv) > 3 else 4
picks = sys.argv[4:]
spec = json.load(open(os.path.join(root, 'harness/shots/sets', set_name + '.json')))
items = [(p.split(':')[0], p.split(':', 1)[1] if ':' in p else p) for p in picks] if picks else [(s['name'], s['name']) for s in spec['shots']]
W, H, G = 480, 270, 6
rows = (len(items) + cols - 1) // cols
sheet = Image.new('RGB', (cols * (W + G) + G, rows * (H + G) + G), (22, 25, 30))
font = None
for cand in ['/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc', '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf']:
    if os.path.exists(cand):
        font = ImageFont.truetype(cand, 16)
        break
d = ImageDraw.Draw(sheet)
for i, (name, label) in enumerate(items):
    path = os.path.join(root, 'loop/shots', spec['set'], name + '.png')
    if not os.path.exists(path):
        continue
    im = Image.open(path).convert('RGB').resize((W, H), Image.LANCZOS)
    x = G + (i % cols) * (W + G)
    y = G + (i // cols) * (H + G)
    sheet.paste(im, (x, y))
    tw = d.textlength(label, font=font)
    d.rectangle([x, y + H - 24, x + tw + 14, y + H], fill=(18, 20, 24))
    d.text((x + 7, y + H - 22), label, font=font, fill=(243, 234, 214))
os.makedirs(os.path.dirname(out), exist_ok=True)
sheet.save(out, quality=88)
print(out, sheet.size, os.path.getsize(out) // 1024, 'KB')
