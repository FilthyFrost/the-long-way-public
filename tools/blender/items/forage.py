"""
Forage in the hand (src/core/v3/forage/items.ts, node W3): one model a family of thing — a mushroom, a handful of
berries, a fruit, a bunch of leaves, a root … — and the forager's tools, as models:

    blender -b --factory-startup --python tools/blender/build.py -- items/forage [<model>|all] [--norender]

Writes public/models/modcar/items/<model>.glb: root mesh PART, origin at the bottom centre, x forward, resting
on z = 0 the way it lies on the ground or in a boot, conventional material names only, AO in 'Col'. `paint` and
`paint_b` take the item's paint and paint2 (a forage kind's first two colours: the cap and the stem of a
mushroom, the berry and its leaf), so one model serves every kind of its family. These are small things seen in
the hand and in a hotbar picture: a handful of simple solids each, no text, no images.
"""
import math

from parts import _kit as K
from items.junk import settle

OUT = 'public/models/modcar/items'


def jit(k, a=0.0):
    """A fixed pseudo-random number in [-0.5, 0.5) (the same on every run)."""
    v = math.sin(k * 12.9898 + a * 78.233) * 43758.5453
    return (v - math.floor(v)) - 0.5


# ------------------------------------------------------------------------------------------------ what is picked

def forage_mushroom(P):
    """A stout mushroom and a small one beside it: caps in the main colour, stems in the second."""
    P.ao_distance = 0.03
    P.lathe('stem', [(0.0, 0.0), (0.018, 0.0), (0.021, 0.012), (0.016, 0.04), (0.013, 0.058), (0.0, 0.058)],
            material='paint_b', segs=14, sharp=50.0)
    P.lathe('cap', [(0.0, 0.052), (0.03, 0.05), (0.043, 0.054), (0.045, 0.062), (0.036, 0.08), (0.02, 0.09),
                    (0.0, 0.093)], material='paint', segs=16, sharp=60.0)
    P.lathe('stem2', [(0.0, 0.0), (0.009, 0.0), (0.01, 0.008), (0.008, 0.03), (0.0, 0.03)], loc=(0.046, 0.022, 0.0),
            material='paint_b', segs=10, sharp=50.0)
    P.lathe('cap2', [(0.0, 0.027), (0.016, 0.026), (0.022, 0.03), (0.021, 0.036), (0.012, 0.046), (0.0, 0.049)],
            loc=(0.046, 0.022, 0.0), material='paint', segs=12, sharp=60.0)
    P.views = [('a', 35, 20), ('b', 215, 25)]


def forage_truffle(P):
    """A knobbly lump out of the ground, a shaving cut off it showing the marbled inside."""
    P.ao_distance = 0.03
    knobs = [(0.0, 0.0, 0.02, 0.022, (1.1, 0.9, 0.85)), (0.014, 0.01, 0.022, 0.016, (1.0, 1.0, 0.9)),
             (-0.012, 0.012, 0.017, 0.015, (1.0, 1.1, 0.8)), (0.004, -0.015, 0.016, 0.014, (1.2, 1.0, 0.8))]
    for i, (x, y, z, r, s) in enumerate(knobs):
        P.sphere('knob', r, (x, y, z), 'paint', u=8, v=5, scale=s, rot=(i * 0.7, i * 0.4, i))
    P.sphere('cut', 0.011, (0.02, -0.003, 0.032), 'paint_b', u=8, v=4, scale=(1.0, 1.0, 0.3))
    P.views = [('a', 35, 25), ('b', 215, 25)]


def forage_berries(P):
    """A handful of berries heaped on a leaf."""
    P.ao_distance = 0.02
    P.sphere('leaf', 0.045, (0.0, 0.0, 0.004), 'paint_b', u=10, v=4, scale=(1.2, 0.8, 0.09))
    spots = [(0.0, 0.0, 0.014), (0.02, 0.006, 0.013), (-0.018, 0.01, 0.013), (0.006, -0.02, 0.013),
             (-0.012, -0.014, 0.013), (0.022, -0.012, 0.012), (0.004, 0.004, 0.03), (-0.008, -0.004, 0.029),
             (0.013, -0.006, 0.028)]
    for k, (x, y, z) in enumerate(spots):
        P.sphere('berry', 0.0105 + 0.002 * jit(k), (x, y, z), 'paint', u=8, v=5)
    P.views = [('a', 35, 30), ('b', 215, 30)]


def forage_fruit(P):
    """One round fruit with its stalk and a leaf."""
    P.ao_distance = 0.03
    P.sphere('fruit', 0.036, (0.0, 0.0, 0.033), 'paint', u=14, v=8, scale=(1.0, 1.0, 0.92))
    P.cyl('stalk', 0.0025, 0.018, (0.002, 0.0, 0.073), 'wood', segs=6, bev=None)
    P.sphere('leaf', 0.016, (0.017, 0.004, 0.072), 'paint_b', u=8, v=4, scale=(1.3, 0.7, 0.12), rot=(0.0, -0.4, 0.3))
    P.views = [('a', 35, 20), ('b', 215, 20)]


def forage_leaves(P):
    """A bunch of leaves, fanned out from the stalks they are held by."""
    P.ao_distance = 0.02
    for i in range(6):
        a = -0.6 + i * 0.24
        P.sphere('leaf', 0.05, (0.015 + 0.03 * math.cos(a), 0.045 * math.sin(a), 0.006 + 0.004 * (i % 3)), 'paint',
                 u=10, v=4, scale=(1.25, 0.42, 0.08), rot=(0.15 * jit(i), 0.1 * jit(i, 1), a))
    P.cyl('stalks', 0.008, 0.04, (-0.05, 0.0, 0.008), 'paint_b', axis='X', segs=8, bev=None)
    P.views = [('a', 35, 35), ('b', 215, 35)]


def forage_sprig(P):
    """A sprig: a thin stem with small leaves down both sides."""
    P.ao_distance = 0.02
    P.tube('stem', [(-0.06, 0.0, 0.004), (-0.02, 0.004, 0.006), (0.03, -0.004, 0.007), (0.065, 0.002, 0.006)], 0.0022,
           'paint_b', segs=6, bend=0.02)
    for i in range(9):
        s = 1 if i % 2 else -1
        P.sphere('leaf', 0.014, (-0.045 + i * 0.013, s * 0.011, 0.007), 'paint', u=8, v=4, scale=(1.0, 0.5, 0.12),
                 rot=(0.0, 0.0, s * 1.0))
    P.sphere('tip', 0.012, (0.072, 0.002, 0.007), 'paint', u=8, v=4, scale=(1.1, 0.5, 0.15))
    P.views = [('a', 35, 35), ('b', 215, 35)]


def forage_root(P):
    """A long tapered root on its side, the stub of its leaf stalks at the head."""
    P.ao_distance = 0.03
    P.lathe('root', [(0.0, 0.0), (0.004, 0.004), (0.009, 0.05), (0.014, 0.11), (0.017, 0.15), (0.012, 0.165),
                     (0.0, 0.168)], loc=(-0.085, 0.0, 0.017), material='paint', axis='X', segs=12, sharp=60.0)
    P.cyl('stalks', 0.007, 0.024, (0.094, 0.0, 0.017), 'paint_b', axis='X', segs=8, bev=None)
    P.views = [('a', 35, 25), ('b', 215, 25)]


def forage_tuber(P):
    """A tuber, lumpy, with its eyes."""
    P.ao_distance = 0.03
    P.sphere('tuber', 0.035, (0.0, 0.0, 0.026), 'paint', u=12, v=7, scale=(1.35, 1.0, 0.75), rot=(0.1, 0.05, 0.3))
    for (x, y, z) in [(0.03, 0.01, 0.042), (-0.025, -0.012, 0.044), (0.005, 0.03, 0.032)]:
        P.sphere('eye', 0.006, (x, y, z), 'paint_b', u=6, v=4, scale=(1.0, 1.0, 0.5))
    P.views = [('a', 35, 25), ('b', 215, 25)]


def forage_nuts(P):
    """A few nuts, each with its cap."""
    P.ao_distance = 0.02
    spots = [(0.0, 0.0, 0.014, 0.0), (0.03, 0.008, 0.013, 0.8), (-0.012, 0.028, 0.013, 1.9),
             (0.014, -0.026, 0.013, 2.7), (-0.03, -0.012, 0.012, 4.0)]
    for (x, y, z, a) in spots:
        P.sphere('nut', 0.0135, (x, y, z), 'paint', u=10, v=6, scale=(1.15, 1.0, 0.95), rot=(0.0, 0.0, a))
        P.sphere('cap', 0.009, (x - 0.011 * math.cos(a), y - 0.011 * math.sin(a), z + 0.002), 'paint_b', u=8, v=4,
                 scale=(0.7, 1.0, 1.0), rot=(0.0, 0.0, a))
    P.views = [('a', 35, 30), ('b', 215, 30)]


def forage_grain(P):
    """An ear of grain on its stalk."""
    P.ao_distance = 0.02
    P.tube('stalk', [(-0.09, 0.0, 0.004), (-0.02, 0.002, 0.005), (0.02, 0.0, 0.007)], 0.0018, 'paint_b', segs=6,
           bend=0.02)
    for i in range(14):
        s = 1 if i % 2 else -1
        P.sphere('grain', 0.0065, (0.01 + 0.075 * i / 13, s * 0.0055, 0.008 + 0.002 * (i % 3)), 'paint', u=6, v=4,
                 scale=(1.5, 0.8, 0.8), rot=(0.0, 0.0, s * 0.35))
    P.views = [('a', 35, 35), ('b', 215, 35)]


def forage_flower(P):
    """A flower head on a short stem: petals in the main colour round a middle in the second."""
    P.ao_distance = 0.02
    P.tube('stem', [(-0.075, 0.0, 0.004), (-0.035, 0.003, 0.006), (-0.004, 0.0, 0.01)], 0.002, 'paint_b', segs=6,
           bend=0.02)
    for i in range(10):
        a = i * math.tau / 10
        P.sphere('petal', 0.014, (0.02 * math.cos(a), 0.02 * math.sin(a), 0.011), 'paint', u=8, v=4,
                 scale=(1.3, 0.55, 0.14), rot=(0.0, 0.0, a))
    P.sphere('eye', 0.0095, (0.0, 0.0, 0.014), 'paint_b', u=10, v=5, scale=(1.0, 1.0, 0.6))
    P.views = [('a', 35, 40), ('b', 215, 40)]


def forage_shell(P):
    """Two shells, one leaning on the other."""
    P.ao_distance = 0.03
    prof = [(0.0, 0.0), (0.036, 0.0), (0.038, 0.003), (0.034, 0.011), (0.025, 0.018), (0.012, 0.022), (0.0, 0.023)]
    P.lathe('shell', prof, material='paint', segs=14, sharp=40.0)
    P.lathe('shell2', [(r * 0.8, z * 0.8) for (r, z) in prof], loc=(0.04, 0.02, 0.012), rot=(0.5, -0.6, 0.4),
            material='paint', segs=12, sharp=40.0)
    # the hinge of each, in the second colour
    P.sphere('hinge', 0.007, (-0.03, 0.0, 0.006), 'paint_b', u=6, v=4, scale=(0.8, 1.6, 0.7))
    P.views = [('a', 35, 30), ('b', 215, 30)]


def forage_crab(P):
    """A crab: the shell, two claws, six legs."""
    P.ao_distance = 0.03
    P.sphere('body', 0.04, (0.0, 0.0, 0.022), 'paint', u=12, v=6, scale=(0.8, 1.15, 0.45))
    for s in (1, -1):
        P.tube('arm', [(0.02, s * 0.03, 0.02), (0.045, s * 0.045, 0.024), (0.06, s * 0.03, 0.022)], 0.006, 'paint',
               segs=6, bend=0.01)
        P.sphere('claw', 0.014, (0.066, s * 0.024, 0.022), 'paint_b', u=8, v=5, scale=(1.3, 0.8, 0.6))
        for i in range(3):
            x0 = 0.008 - i * 0.016
            P.tube('leg', [(x0, s * 0.04, 0.02), (x0 - 0.004, s * 0.066, 0.03), (x0 - 0.01, s * 0.082, 0.003)], 0.0035,
                   'paint', segs=5, bend=0.01)
        P.sphere('eye', 0.004, (0.03, s * 0.012, 0.037), 'trim', u=6, v=4)
    P.views = [('a', 35, 35), ('b', 215, 35)]


def forage_kelp(P):
    """A length of kelp folded over itself: three blades off one stipe."""
    P.ao_distance = 0.02
    for i, (x, y, a, l) in enumerate([(0.0, 0.0, 0.1, 0.11), (0.01, 0.022, -0.25, 0.09), (-0.012, -0.02, 0.4, 0.085)]):
        P.sphere('blade', l, (x, y, 0.004 + 0.003 * i), 'paint', u=12, v=4, scale=(1.0, 0.2, 0.03),
                 rot=(0.05 * jit(i), 0.04 * jit(i, 2), a))
    P.tube('stipe', [(-0.1, -0.012, 0.004), (-0.05, -0.004, 0.006), (0.0, 0.0, 0.009)], 0.003, 'paint_b', segs=6,
           bend=0.03)
    P.views = [('a', 35, 40), ('b', 215, 40)]


def forage_stone(P):
    """A stone with flat faces, and a chip struck off it."""
    P.ao_distance = 0.03
    P.sphere('stone', 0.034, (0.0, 0.0, 0.022), 'paint', u=6, v=4, scale=(1.25, 0.95, 0.68), rot=(0.3, 0.2, 0.5),
             smooth=False, sharp=5.0)
    P.sphere('chip', 0.015, (0.045, 0.02, 0.009), 'paint_b', u=5, v=3, scale=(1.2, 0.8, 0.6), rot=(0.5, 0.1, 1.2),
             smooth=False, sharp=5.0)
    P.views = [('a', 35, 25), ('b', 215, 25)]


def forage_lump(P):
    """A lump of something soft or crusted: clay, salt, resin — and what forage becomes when it has gone off."""
    P.ao_distance = 0.03
    lumps = [(0.0, 0.0, 0.02, 0.026, (1.2, 1.0, 0.75)), (0.02, 0.012, 0.016, 0.018, (1.0, 1.1, 0.8)),
             (-0.018, 0.008, 0.014, 0.016, (1.1, 0.9, 0.8)), (0.002, -0.02, 0.013, 0.015, (1.2, 1.0, 0.75))]
    for i, (x, y, z, r, s) in enumerate(lumps):
        P.sphere('lump', r, (x, y, z), 'paint', u=8, v=5, scale=s, rot=(0.6 * i, 0.3 * i, i))
    for (x, y, z) in [(0.008, 0.004, 0.039), (-0.014, -0.006, 0.03), (0.024, -0.006, 0.027), (0.0, 0.02, 0.03)]:
        P.sphere('speck', 0.005, (x, y, z), 'paint_b', u=6, v=4, scale=(1.0, 1.0, 0.6))
    P.views = [('a', 35, 25), ('b', 215, 25)]


def forage_jar(P):
    """A squat jar: what is in it shows in the main colour, a cloth lid tied over it in the second."""
    P.ao_distance = 0.04
    P.lathe('jar', [(0.0, 0.0), (0.03, 0.0), (0.034, 0.004), (0.036, 0.03), (0.034, 0.055), (0.027, 0.062),
                    (0.027, 0.07), (0.0, 0.07)], material='paint', segs=18, sharp=40.0)
    P.lathe('lid', [(0.0, 0.068), (0.031, 0.068), (0.033, 0.064), (0.034, 0.074), (0.03, 0.08), (0.0, 0.083)],
            material='paint_b', segs=18, sharp=40.0)
    P.torus('string', 0.029, 0.0018, loc=(0.0, 0.0, 0.066), material='trim', segs=18, rsegs=5)
    P.views = [('a', 35, 20), ('b', 215, 20)]


def forage_cane(P):
    """Three lengths of cane, tied twice."""
    P.ao_distance = 0.04
    for i, (y, z, l) in enumerate([(-0.014, 0.012, 0.3), (0.014, 0.012, 0.28), (0.0, 0.035, 0.29)]):
        P.cyl('cane', 0.0115, l, (0.0, y, z), 'paint', axis='X', segs=10, bev=None)
        for k in range(3):
            P.torus('node', 0.0118, 0.0022, loc=(-l / 2 + l * (k + 0.5) / 3 + 0.02 * jit(i, k), y, z), axis='X',
                    material='paint', segs=10, rsegs=4)
    for x in (-0.09, 0.09):
        P.torus('tie', 0.027, 0.003, loc=(x, 0.0, 0.02), axis='X', material='paint_b', segs=14, rsegs=5)
    P.views = [('a', 35, 25), ('b', 215, 25)]


def forage_fibre(P):
    """A hank of fibre, twisted and tied in the middle."""
    P.ao_distance = 0.03
    pts = [(-0.08, 0.0, 0.012), (-0.04, 0.012, 0.014), (0.0, 0.0, 0.012), (0.04, -0.012, 0.014), (0.08, 0.0, 0.012)]
    for i in range(4):
        dy = 0.008 * (i - 1.5)
        P.tube('strand', [(x, y + dy * (1.0 if abs(x) > 0.03 else 0.3), z + 0.003 * (i % 2)) for (x, y, z) in pts],
               0.006, 'paint', segs=6, bend=0.03)
    P.torus('tie', 0.011, 0.0035, loc=(0.0, 0.0, 0.013), axis='X', material='paint_b', segs=12, rsegs=5)
    P.views = [('a', 35, 30), ('b', 215, 30)]


# ------------------------------------------------------------------------------------------------ the forager's things

def forage_knife(P):
    """A short knife on its side: the blade in the main colour, the wooden handle in the second."""
    P.ao_distance = 0.03
    P.box('blade', (0.095, 0.02, 0.002), (0.052, 0.002, 0.007), 'paint', bev=0.0006)
    P.box('handle', (0.085, 0.022, 0.014), (-0.04, 0.0, 0.007), 'paint_b', bev=0.004)
    P.box('guard', (0.007, 0.028, 0.016), (0.004, 0.0, 0.008), 'steel', bev=0.001)
    P.views = [('a', 35, 35), ('b', 215, 35)]


def forage_trowel(P):
    """A trowel: a pointed scoop, a tang, a turned handle."""
    P.ao_distance = 0.03
    P.sphere('scoop', 0.045, (0.062, 0.0, 0.008), 'paint', u=12, v=5, scale=(1.5, 0.75, 0.16))
    P.cyl('tang', 0.005, 0.05, (-0.015, 0.0, 0.013), 'paint', axis='X', segs=8, bev=None)
    P.cyl('handle', 0.013, 0.09, (-0.085, 0.0, 0.013), 'paint_b', axis='X', segs=12, bev=0.004)
    P.views = [('a', 35, 35), ('b', 215, 35)]


def forage_sickle(P):
    """A sickle: a curved blade drawn out to a point, a handle."""
    P.ao_distance = 0.03
    R = 0.085
    arc = [(0.03 + R * math.cos(t), 0.035 + R * math.sin(t), 0.006) for t in [-2.0 + 0.3 * k for k in range(10)]]
    P.tube('blade', arc, 0.0075, 'paint', segs=6, bend=0.004, radius_fn=lambda u: 1.0 - 0.75 * u)
    # (the handle runs on from where the blade begins)
    P.cyl('handle', 0.012, 0.1, (arc[0][0] - 0.052, arc[0][1] + 0.004, 0.012), 'paint_b', axis='X', segs=12, bev=0.004)
    P.views = [('a', 35, 45), ('b', 215, 45)]


def forage_basket(P):
    """A round wicker basket with a hoop handle."""
    P.ao_distance = 0.08
    P.lathe('basket', [(0.0, 0.0), (0.085, 0.0), (0.095, 0.01), (0.115, 0.1), (0.12, 0.118), (0.113, 0.122),
                       (0.106, 0.118), (0.09, 0.016), (0.0, 0.012)], material='paint', segs=24, sharp=45.0)
    for z in (0.03, 0.055, 0.08):
        P.torus('weave', 0.0955 + (z - 0.01) * 0.222, 0.0035, loc=(0.0, 0.0, z), material='paint', segs=24, rsegs=5)
    P.torus('rim', 0.1165, 0.006, loc=(0.0, 0.0, 0.12), material='paint_b', segs=24, rsegs=6)
    P.torus('handle', 0.114, 0.005, loc=(0.0, 0.0, 0.12), axis='Y', material='paint_b', segs=20, rsegs=6, arc=math.pi,
            a0=math.pi)
    P.views = [('a', 35, 25), ('b', 215, 25)]


def forage_page(P):
    """A page torn from a field guide: a plate drawn on it in the second colour, a few lines of print."""
    P.ao_distance = 0.02
    P.box('page', (0.15, 0.105, 0.0016), (0.0, 0.0, 0.0008), 'paint', bev=None)
    P.box('plate', (0.06, 0.05, 0.0008), (-0.035, 0.016, 0.002), 'paint_b', bev=None)
    for i in range(4):
        P.box('line', (0.052 - 0.008 * (i % 2), 0.004, 0.0006), (0.04 - 0.004 * (i % 2), 0.034 - i * 0.014, 0.0019),
              'trim', bev=None)
    for i in range(2):
        P.box('line', (0.12, 0.004, 0.0006), (0.0, -0.028 - i * 0.014, 0.0019), 'trim', bev=None)
    P.views = [('a', 35, 55), ('b', 215, 55)]


MODELS = {
    'forage_mushroom': forage_mushroom,
    'forage_truffle': forage_truffle,
    'forage_berries': forage_berries,
    'forage_fruit': forage_fruit,
    'forage_leaves': forage_leaves,
    'forage_sprig': forage_sprig,
    'forage_root': forage_root,
    'forage_tuber': forage_tuber,
    'forage_nuts': forage_nuts,
    'forage_grain': forage_grain,
    'forage_flower': forage_flower,
    'forage_shell': forage_shell,
    'forage_crab': forage_crab,
    'forage_kelp': forage_kelp,
    'forage_stone': forage_stone,
    'forage_lump': forage_lump,
    'forage_jar': forage_jar,
    'forage_cane': forage_cane,
    'forage_fibre': forage_fibre,
    'forage_knife': forage_knife,
    'forage_trowel': forage_trowel,
    'forage_sickle': forage_sickle,
    'forage_basket': forage_basket,
    'forage_page': forage_page,
}


def main(args):
    # every model is set down on z = 0 with its footprint over the origin (the builders place things by eye)
    table = {}
    for pid, build in MODELS.items():
        def settled(P, build=build):
            build(P)
            settle(P, center=True)
        table[pid] = settled
    K.run(table, args, out_dir=OUT, geo=False)
