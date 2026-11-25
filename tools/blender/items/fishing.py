"""
The fishing module's things (docs/V3/plan/fishing.md): the rods as they lie on the ground or picture on the hotbar
(in the hands the game draws the rod itself, bending on its line), the baits' packs, the creel, and what comes up out
of the water instead of a fish —

    blender -b --factory-startup --python tools/blender/build.py -- items/fishing [<model>|all] [--norender] [--look]

    rod_cane     a cane pole: a bamboo blank with its nodes, a cork grip, the line wound on two pegs
    rod_glass    a glass rod: a tapered blank, guides, a cork grip, a spinning reel to the side
    rod_carbon   a carbon rod: slimmer, more guides, a dark reel
    rod_heavy    a heavy rod: a stout blank, a foam grip, a big reel
    rod_surf     a surf rod: the longest, a long grip, a big spinning reel
    bait_tin     a tin with a lid (worms, the secret paste)       bait_bag    a paper bag folded over (dough, malt mash)
    bait_jar     a glass jar with its lid (sweetcorn, honey bait, the star bait)
    bait_box     a small box with air holes (crickets, shrimp, squid strips, king prawns)
    bait_lure    a lure on its card (a spoon, a spinner, a soft worm, a feather jig)
    fishing_creel    a wicker creel with its lid and a strap
    fishing_bottle   a drift bottle, corked, a note rolled up in it
    fishing_crate    a crate off a wreck, iron at its corners
    fishing_pearl    a big pearl in its opened mussel shell
    fishing_boot     a rubber boot       fishing_can     a crushed tin can

Writes public/models/modcar/items/<model>.glb: root mesh PART, origin at the bottom centre, resting on z = 0, +X its
front (a rod lies along +X, its tip forward, its reel to the side so it lies flat), conventional material names only,
AO in 'Col'. `paint` and `paint_b` take the item's two colours (src/core/v3/fishing/lite/items.ts).
"""
import math

from parts import _kit as K

OUT = 'public/models/modcar/items'
TAU = math.tau


def D(*rad):
    """Radians in, the kit's degrees out."""
    return tuple(math.degrees(a) for a in rad)


# ------------------------------------------------------------------------------------------------ rods

def _guides(P, x0, x1, n, r_at, z, size=0.008):
    """Line guides along the blank, smaller towards the tip: a ring on a little foot, standing up off the blank."""
    for k in range(n):
        t = k / max(1, n - 1)
        x = x0 + (x1 - x0) * t
        g = size * (1.0 - 0.55 * t)
        rr = r_at(x)
        P.torus(f'guide{k}', g, g * 0.16, (x, 0.0, z + rr + g * 1.25), 'steel', axis='X', segs=10, rsegs=4)
        P.box(f'foot{k}', (g * 0.9, g * 0.35, g * 1.1), (x, 0.0, z + rr + g * 0.45), 'steel', bev=None)


def _blank(P, L, r0, r1, z, x0=0.0, mat='paint', grip=0.3, grip_r=None, grip_mat='wood'):
    """A tapered blank along +X from x0 to x0 + L, its grip at the butt; returns the radius along it."""
    def r_at(x):
        t = max(0.0, min(1.0, (x - x0) / L))
        return r0 + (r1 - r0) * t
    P.cyl('blank', r0, L, (x0 + L / 2, 0.0, z), mat, axis='X', segs=10, r2=r1, bev=None)
    gr = grip_r or r0 * 1.9
    P.cyl('grip', gr, grip, (x0 + grip / 2 + 0.02, 0.0, z), grip_mat, axis='X', segs=10, r2=gr * 0.92, bev=0.002)
    P.cyl('butt', gr * 1.05, 0.02, (x0 + 0.01, 0.0, z), 'rubber', axis='X', segs=10, bev=0.002)
    P.cyl('tip', r1 * 1.6, 0.012, (x0 + L, 0.0, z), 'trim', axis='X', segs=6, bev=None)
    return r_at


def _spinning_reel(P, x, z, r, big=1.0):
    """A spinning reel hung to the side (+Y) of the reel seat at x: its foot, body, spool and handle."""
    s = big
    P.cyl('seat', r * 1.5, 0.07 * s, (x, 0.0, z), 'trim', axis='X', segs=10, bev=0.002)
    P.box('reel_foot', (0.03 * s, 0.03 * s, 0.008 * s), (x, 0.022 * s, z), 'trim', rot=D(TAU / 4, 0.0, 0.0), bev=0.002)
    P.cyl('reel_body', 0.022 * s, 0.05 * s, (x - 0.004 * s, 0.05 * s, z), 'paint_b', axis='X', segs=12, bev=0.004)
    P.cyl('spool', 0.026 * s, 0.026 * s, (x + 0.034 * s, 0.05 * s, z), 'alu', axis='X', segs=14, r2=0.023 * s, bev=0.002)
    P.cyl('line_on', 0.0235 * s, 0.018 * s, (x + 0.034 * s, 0.05 * s, z), 'gauge', axis='X', segs=14, bev=None)
    P.torus('bail', 0.028 * s, 0.0018 * s, (x + 0.046 * s, 0.05 * s, z), 'chrome', axis='X', segs=14, rsegs=4)
    P.tube('crank', [(x - 0.02 * s, 0.05 * s, z), (x - 0.02 * s, 0.05 * s + 0.0, z + 0.04 * s), (x - 0.03 * s, 0.05 * s, z + 0.05 * s)], 0.003 * s, 'trim', segs=6)
    P.cyl('knob', 0.007 * s, 0.016 * s, (x - 0.03 * s, 0.05 * s + 0.01 * s, z + 0.052 * s), 'paint_b', axis='Y', segs=8, bev=0.002)


def rod_cane(P):
    """A cane pole: a bamboo blank, its nodes in the second colour, a cork grip, the line wound on two pegs."""
    P.ao_distance = 0.03
    L, r0, r1 = 1.8, 0.0115, 0.004
    z = 0.0135
    r_at = _blank(P, L, r0, r1, z, grip=0.26, grip_r=0.016)
    for k in range(7):
        x = 0.34 + k * 0.21
        rr = r_at(x)
        P.cyl(f'node{k}', rr * 1.18, 0.012, (x, 0.0, z), 'paint_b', axis='X', segs=10, bev=0.002)
    for x in (0.33, 0.52):
        P.cyl(f'peg{x}', 0.0035, 0.03, (x, 0.0, z + r_at(x) + 0.012), 'wood', segs=6, bev=None)
    P.tube('line_wound', [(0.33, 0.0, z + 0.022), (0.52, 0.0, z + 0.02)], 0.003, 'gauge', segs=6)
    P.views = [('a', 25, 30)]


def rod_glass(P):
    P.ao_distance = 0.03
    L, r0, r1 = 1.8, 0.0085, 0.0028
    z = 0.016
    r_at = _blank(P, L, r0, r1, z, grip=0.3, grip_r=0.0145)
    _spinning_reel(P, 0.4, z, r0)
    _guides(P, 0.62, L - 0.06, 6, r_at, z)
    for k, x in enumerate((0.75, 1.1)):
        P.cyl(f'wrap{k}', r_at(x) * 1.25, 0.03, (x, 0.0, z), 'paint_b', axis='X', segs=10, bev=None)
    P.views = [('a', 25, 30)]


def rod_carbon(P):
    P.ao_distance = 0.03
    L, r0, r1 = 1.9, 0.0072, 0.0022
    z = 0.016
    r_at = _blank(P, L, r0, r1, z, grip=0.28, grip_r=0.0135)
    _spinning_reel(P, 0.38, z, r0, 0.95)
    _guides(P, 0.58, L - 0.05, 8, r_at, z, 0.007)
    P.views = [('a', 25, 30)]


def rod_heavy(P):
    P.ao_distance = 0.035
    L, r0, r1 = 1.9, 0.012, 0.004
    z = 0.022
    r_at = _blank(P, L, r0, r1, z, grip=0.4, grip_r=0.019, grip_mat='rubber')
    P.cyl('fore_grip', 0.016, 0.1, (0.62, 0.0, z), 'rubber', axis='X', segs=10, bev=0.003)
    _spinning_reel(P, 0.5, z, r0, 1.35)
    _guides(P, 0.78, L - 0.06, 6, r_at, z, 0.011)
    P.views = [('a', 25, 30)]


def rod_surf(P):
    P.ao_distance = 0.035
    L, r0, r1 = 2.3, 0.0105, 0.0032
    z = 0.022
    r_at = _blank(P, L, r0, r1, z, grip=0.55, grip_r=0.017)
    _spinning_reel(P, 0.66, z, r0, 1.45)
    _guides(P, 0.95, L - 0.06, 7, r_at, z, 0.012)
    P.cyl('band', r_at(1.4) * 1.3, 0.05, (1.4, 0.0, z), 'paint_b', axis='X', segs=10, bev=None)
    P.views = [('a', 25, 30)]


# ------------------------------------------------------------------------------------------------ baits

def bait_tin(P):
    """A round tin, its lid in the second colour, a few air holes punched in it."""
    P.ao_distance = 0.02
    r, h = 0.045, 0.04
    P.lathe('tin', [(0.0, 0.0), (r - 0.003, 0.0), (r, 0.003), (r, h - 0.004), (r - 0.002, h)], (0, 0, 0), 'paint', segs=16, sharp=60.0)
    P.lathe('lid', [(0.0, h), (r + 0.002, h), (r + 0.002, h + 0.008), (r - 0.002, h + 0.011), (0.0, h + 0.011)], (0, 0, 0), 'paint_b', segs=16, sharp=60.0)
    for k in range(6):
        a = TAU * k / 6
        P.cyl(f'hole{k}', 0.003, 0.0012, (0.022 * math.cos(a), 0.022 * math.sin(a), h + 0.0114), 'trim', segs=6, bev=None)
    P.box('label', (0.002, 0.05, 0.022), (r + 0.0006, 0.0, h * 0.48), 'paint_b', bev=None)
    P.views = [('a', 35, 35)]


def bait_bag(P):
    """A small paper bag folded over at the top, a band of the second colour round it."""
    P.ao_distance = 0.02
    w, d, h = 0.085, 0.055, 0.1
    P.pillow('bag', (w, d, h), (0, 0, h / 2), 'paint', r=0.012, puff=0.006)
    P.box('fold', (w * 0.98, d * 0.7, 0.022), (0, 0.006, h + 0.006), 'paint', rot=D(0.25, 0.0, 0.0), bev=0.004)
    P.box('band', (w * 1.01, d * 1.01, 0.03), (0, 0, h * 0.45), 'paint_b', bev=0.004)
    P.views = [('a', 35, 30)]


def bait_jar(P):
    """A glass jar, what is in it (the bait's colour) showing, its lid in the second colour."""
    P.ao_distance = 0.02
    r, h = 0.034, 0.075
    P.lathe('fill', [(0.0, 0.002), (r - 0.004, 0.002), (r - 0.004, h * 0.72), (0.0, h * 0.74)], (0, 0, 0), 'paint', segs=14, sharp=60.0)
    P.lathe('jar', [(0.0, 0.0), (r - 0.004, 0.0), (r, 0.004), (r, h - 0.012), (r - 0.006, h - 0.004), (r - 0.006, h)], (0, 0, 0), 'glass', segs=14, sharp=60.0)
    P.cyl('lid', r - 0.003, 0.014, (0, 0, h + 0.006), 'paint_b', segs=14, bev=0.003)
    P.views = [('a', 35, 30)]


def bait_box(P):
    """A small box with air holes along its lid."""
    P.ao_distance = 0.02
    w, d, h = 0.1, 0.065, 0.045
    P.box('box', (w, d, h), (0, 0, h / 2), 'paint_b', bev=0.006, segs=2)
    P.box('lid', (w + 0.004, d + 0.004, 0.01), (0, 0, h + 0.004), 'paint', bev=0.004, segs=2)
    for i in range(4):
        for j in range(2):
            P.cyl(f'hole{i}{j}', 0.003, 0.0015, (-0.033 + i * 0.022, -0.012 + j * 0.024, h + 0.0095), 'trim', segs=6, bev=None)
    P.views = [('a', 35, 35)]


def bait_lure(P):
    """A lure on its card: the card in the second colour, the lure in the bait's colour, its treble hook."""
    P.ao_distance = 0.015
    P.box('card', (0.12, 0.07, 0.003), (0, 0, 0.0015), 'paint_b', bev=0.001)
    P.sphere('lure', 0.016, (0.008, 0.0, 0.009), 'paint', scale=(2.2, 0.75, 0.42))
    P.sphere('eye', 0.004, (0.038, 0.007, 0.011), 'trim')
    P.torus('ring', 0.004, 0.0009, (0.052, 0.0, 0.008), 'steel', axis='Z', segs=8, rsegs=3)
    P.tube('shank', [(-0.03, 0.0, 0.008), (-0.045, 0.0, 0.008)], 0.0012, 'steel', segs=4)
    for k in range(3):
        a = TAU * k / 3
        P.tube(f'barb{k}', [(-0.045, 0.0, 0.008), (-0.05, 0.007 * math.cos(a), 0.008 + 0.007 * math.sin(a) * 0.4), (-0.044, 0.009 * math.cos(a), 0.008 + 0.009 * math.sin(a) * 0.4)], 0.001, 'steel', segs=4)
    P.views = [('a', 35, 40)]


# ------------------------------------------------------------------------------------------------ the creel and what comes up

def fishing_creel(P):
    """A wicker creel: woven bands round it, a lid with a hole to slip a fish through, a strap over the top."""
    P.ao_distance = 0.04
    w, d, h = 0.34, 0.2, 0.22
    P.pillow('basket', (w, d, h), (0, 0, h / 2), 'paint', r=0.035, puff=0.004)
    for k in range(5):
        P.box(f'weave{k}', (w + 0.006, d + 0.006, 0.012), (0, 0, 0.03 + k * 0.042), 'wood', bev=0.004)
    P.box('lid', (w + 0.01, d + 0.01, 0.025), (0, 0, h + 0.006), 'paint', bev=0.01, segs=2)
    P.cyl('hole', 0.035, 0.004, (0.06, 0.0, h + 0.02), 'trim', segs=12, bev=None)
    P.tube('strap', [(-w / 2 + 0.02, 0.0, h - 0.02), (-0.08, 0.0, h + 0.17), (0.08, 0.0, h + 0.17), (w / 2 - 0.02, 0.0, h - 0.02)], 0.009, 'paint_b', segs=6, bend=0.08)
    P.box('latch', (0.02, 0.012, 0.04), (0.0, d / 2 + 0.008, h - 0.01), 'steel', bev=0.003)
    P.views = [('a', 35, 30)]


def fishing_bottle(P):
    """A drift bottle lying on its side, corked, a note rolled up in it."""
    P.ao_distance = 0.03
    r, L = 0.036, 0.26
    P.lathe('bottle', [(0.0, 0.0), (r - 0.004, 0.0), (r, 0.006), (r, L * 0.62), (0.014, L * 0.82), (0.012, L * 0.95), (0.013, L)], (0, 0, r), 'glass', segs=14, sharp=60.0, axis='X', rot=None)
    P.cyl('cork', 0.012, 0.03, (L + 0.008, 0.0, r), 'wood', axis='X', segs=8, bev=0.002)
    P.cyl('note', 0.012, L * 0.5, (L * 0.32, 0.0, r), 'paint_b', axis='X', segs=8, bev=None)
    P.views = [('a', 35, 30)]


def fishing_crate(P):
    """A crate off a wreck: planks, iron at its corners, a stencil."""
    P.ao_distance = 0.06
    w, d, h = 0.5, 0.36, 0.32
    P.box('crate', (w, d, h), (0, 0, h / 2), 'paint', bev=0.008, segs=1)
    for k in range(3):
        P.box(f'plank{k}', (w + 0.008, 0.012, 0.06), (0, d / 2 + 0.002, 0.05 + k * 0.11), 'wood', bev=0.003)
        P.box(f'plankb{k}', (w + 0.008, 0.012, 0.06), (0, -d / 2 - 0.002, 0.05 + k * 0.11), 'wood', bev=0.003)
    for sx in (-1, 1):
        for sy in (-1, 1):
            for sz in (0, 1):
                P.box(f'iron{sx}{sy}{sz}', (0.05, 0.05, 0.05), (sx * (w / 2 - 0.02), sy * (d / 2 - 0.02), 0.025 + sz * (h - 0.05)), 'paint_b', bev=0.004)
    P.box('stencil', (0.16, 0.002, 0.07), (0.0, d / 2 + 0.009, h * 0.55), 'trim', bev=None)
    P.views = [('a', 35, 30)]


def fishing_pearl(P):
    """A big pearl in the opened mussel shell it came out of."""
    P.ao_distance = 0.015
    for k, a in enumerate((0.0, 0.5)):
        P.sphere(f'shell{k}', 0.04, (0.0, -0.02 + k * 0.04, 0.006 + k * 0.012), 'paint_b', scale=(1.0, 0.62, 0.18), rot=D(0.0 if k == 0 else -0.9, 0.0, 0.0))
    P.sphere('pearl', 0.012, (0.004, -0.018, 0.017), 'paint')
    P.views = [('a', 35, 40)]


def fishing_boot(P):
    """A rubber boot lying on its side, its sole in the second colour."""
    P.ao_distance = 0.04
    P.cyl('leg', 0.055, 0.3, (-0.04, 0.0, 0.055), 'paint', axis='X', segs=12, r2=0.06, bev=0.006)
    P.pillow('foot', (0.16, 0.1, 0.1), (0.13, 0.0, 0.05), 'paint', r=0.03, puff=0.004)
    P.box('sole', (0.24, 0.012, 0.1), (0.06, -0.052, 0.05), 'paint_b', bev=0.004)
    P.cyl('mouth', 0.05, 0.01, (-0.19, 0.0, 0.055), 'trim', axis='X', segs=12, bev=None)
    P.views = [('a', 35, 25)]


def fishing_can(P):
    """A tin can squashed flat in the middle, rust at its rim."""
    P.ao_distance = 0.02
    r, h = 0.033, 0.11
    P.lathe('can', [(0.0, 0.0), (r - 0.003, 0.0), (r, 0.004), (r * 0.62, h * 0.45), (r * 0.6, h * 0.55), (r, h - 0.004), (r - 0.004, h), (0.0, h)], (0, 0, r), 'paint', segs=12, sharp=40.0, axis='X', rot=None)
    P.torus('rim', r - 0.002, 0.003, (h - 0.002, 0.0, r), 'rust', axis='X', segs=12, rsegs=4)
    P.views = [('a', 35, 25)]


MODELS = {f.__name__: f for f in [rod_cane, rod_glass, rod_carbon, rod_heavy, rod_surf, bait_tin, bait_bag, bait_jar, bait_box, bait_lure, fishing_creel, fishing_bottle, fishing_crate, fishing_pearl, fishing_boot, fishing_can]}

# the colours each is painted in the game (src/core/v3/fishing/lite/items.ts), for the --look previews only
COLORS = {
    'rod_cane': (0xc8a85a, 0x6a4a2a), 'rod_glass': (0x3a6a8a, 0xd8c29a), 'rod_carbon': (0x2a2a30, 0xc0c4c8), 'rod_heavy': (0x4a5a6a, 0xb85c3e), 'rod_surf': (0x2a4a7a, 0xf0c23c),
    'bait_tin': (0x6f7a82, 0xc87a6a), 'bait_bag': (0xf0e0b0, 0xd8a050), 'bait_jar': (0xf2d03a, 0xf4efe2), 'bait_box': (0x8fb8c8, 0xe88a6a), 'bait_lure': (0xd8dce0, 0xd8392b),
    'fishing_creel': (0xc8a05a, 0x5a3a2a), 'fishing_bottle': (0x6aa88a, 0xf0e6cc), 'fishing_crate': (0x7a5a3a, 0x4a4a40), 'fishing_pearl': (0xf4eee8, 0xe8d8e0),
    'fishing_boot': (0x4a3a2a, 0x2a2a28), 'fishing_can': (0xb84a3a, 0x8a8a8a),
}


def _lin(h):
    c = (((h >> 16) & 255) / 255, ((h >> 8) & 255) / 255, (h & 255) / 255)
    return tuple(x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c)


def _after(P, opts):
    """--look: cel previews in the item's own colours, back faces culled as the game culls them."""
    if not opts.get('look'):
        return
    names = K.mc.MAT_NAMES
    saved = {k: names[k] for k in ('paint', 'paint_b')}
    for key, h in zip(('paint', 'paint_b'), COLORS.get(P.id, ())):
        names[key] = (_lin(h), saved[key][1], saved[key][2])
    try:
        for m in K.bpy.data.materials:
            m.use_backface_culling = True
        K.render_toon(P, views=[(f'{i + 1}', yaw, pitch) for i, (_, yaw, pitch) in enumerate(getattr(P, 'views', None) or [('a', 35, 28)])], size=(480, 400), suffix='_look')
    finally:
        names.update(saved)


def main(args):
    K.run(MODELS, args, after=_after, out_dir=OUT, geo=False)
