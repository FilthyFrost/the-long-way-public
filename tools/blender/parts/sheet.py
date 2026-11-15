"""
Contact sheets of the part previews (system Python with Pillow, not Blender):

    python tools/blender/parts/sheet.py <name> <id> [<id> ...] [--suffix=_a] [--cols=4]

Reads D:/modcar-scratch/parts/<id><suffix>.png (default suffix _a) and the triangle counts from
src/core/modcar/data/parts_geo.json; writes D:/modcar-scratch/parts/sheet_<name>.png.
"""
import json
import os
import sys

from PIL import Image, ImageDraw, ImageFont

SCRATCH = 'D:/modcar-scratch/parts'
GEO = os.path.join(os.path.dirname(__file__), '..', '..', '..', 'src', 'core', 'modcar', 'data', 'parts_geo.json')


def main(argv):
    opts = {a[2:].split('=')[0]: a.split('=', 1)[1] for a in argv if a.startswith('--') and '=' in a}
    args = [a for a in argv if not a.startswith('--')]
    name, ids = args[0], args[1:]
    suffixes = opts.get('suffix', '_a').split(',')
    cols = int(opts.get('cols', 4))
    tw, th = int(opts.get('w', 450)), int(opts.get('h', 360))
    geo = {}
    if os.path.exists(GEO):
        with open(GEO, encoding='utf-8') as f:
            geo = json.load(f).get('parts', {})
    tiles = []
    for pid in ids:
        for suf in suffixes:
            path = os.path.join(SCRATCH, f'{pid}{suf}.png')
            if os.path.exists(path):
                tiles.append((pid, suf, path))
    rows = (len(tiles) + cols - 1) // cols
    sheet = Image.new('RGB', (cols * tw, rows * th), (40, 40, 44))
    draw = ImageDraw.Draw(sheet)
    try:
        font = ImageFont.truetype('arial.ttf', 18)
    except OSError:
        font = ImageFont.load_default()
    for i, (pid, suf, path) in enumerate(tiles):
        im = Image.open(path).convert('RGB')
        im.thumbnail((tw, th))
        x, y = (i % cols) * tw, (i // cols) * th
        sheet.paste(im, (x + (tw - im.width) // 2, y + (th - im.height) // 2))
        t = geo.get(pid, {}).get('triangles')
        label = f'{pid}{suf}  {t} tris' if t else f'{pid}{suf}'
        draw.rectangle([x, y, x + tw, y + 24], fill=(20, 20, 24))
        draw.text((x + 6, y + 3), label, fill=(235, 235, 235), font=font)
    out = os.path.join(SCRATCH, f'sheet_{name}.png')
    sheet.save(out)
    print(out)


if __name__ == '__main__':
    main(sys.argv[1:])
