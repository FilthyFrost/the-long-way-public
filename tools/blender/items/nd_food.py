"""
The ND food, drink and medicine (docs/ND/PLAN.md, ND2): what Nomad Drive has to eat that ModCar did not — a tin of
baked beans, a squat tin of tomato soup, a flat tin of tuna, a bunch of bananas, a box of cereal, a chocolate bar,
a cluster of mushrooms, an orange, a jar of peanut butter, a carton of milk, a bottle of pills and a first-aid
kit — in our own design, at its sizes (baked beans 0.115 x 0.17 m, tomato soup 0.125 x 0.105, tuna can 0.11 x 0.053,
Banana 0.23, Cereal 0.21 x 0.15 x 0.064, chocolate bar 0.2 x 0.05, Mushroom 0.23, Orange 0.11, peanut butter 0.1 x
0.153, Milk 0.086 x 0.24, Pills 0.088 x 0.14, first aid kit 0.265 x 0.237 x 0.131):

    blender -b --factory-startup --python tools/blender/build.py -- items/nd_food [<model>|all] [--look] [--norender]

The junk script's conventions (items/junk.py): origin at the bottom centre, x forward, resting on z = 0; `paint`
and `paint_b` take the item's two colours (a tin's label and its band, a carton's print).
"""
import math

import bmesh
from mathutils import Matrix, Vector

from parts import _kit as K
from parts._kit import V, mat4
from items import junk as J
from items import nd_home as H
from items import nd_things as N

OUT = 'public/models/modcar/items'
TAU = math.tau

COLORS = {
    'nd_tin_beans': (0xd8673a, 0x3e7f96), 'nd_tin_soup': (0xc8372f, 0xf1e6c8), 'nd_tin_tuna': (0x3e6f8f, 0xf0c23c), 'nd_banana': (0xf0cf4a, 0x6b4a2f),
    'nd_cereal': (0xe8a23a, 0x3e7f96), 'nd_chocolate': (0x7a3b2e, 0xe8c25a), 'nd_mushroom': (0xb8573a, 0xefe4cc), 'nd_orange': (0xec8a2a, 0x5d8a34),
    'nd_peanut_jar': (0xb8783a, 0xc8372f), 'nd_milk': (0xf3efe6, 0x3e7fb0), 'nd_pills': (0xd88a3a, 0xf3efe6), 'nd_first_aid': (0xc8372f, 0xf3efe6),
}


def tin(P, r, h, ribs=3, label=(0.18, 0.82)):
    """A food tin: the steel shell (alu) with rolled seams top and bottom and a few ribs, its paper label round the
    middle (paint) with a band of the second colour (paint_b), a lid with its pull ring."""
    prof = [(0.0, 0.0), (r - 0.004, 0.0), (r, 0.004), (r, h - 0.004), (r - 0.004, h), (0.0, h)]
    P.lathe('shell', prof, loc=(0, 0, 0), material='alu', segs=32, sharp=50.0)
    for z in (0.003, h - 0.003):
        P.torus('seam', r - 0.001, 0.0025, loc=(0, 0, z), material='alu', segs=32, rsegs=6)
    z0, z1 = h * label[0], h * label[1]
    P.lathe('label', [(r + 0.0012, z0), (r + 0.0012, z1)], loc=(0, 0, 0), material='paint', segs=32, sharp=50.0)
    zb = z0 + (z1 - z0) * 0.62
    P.lathe('band', [(r + 0.0018, zb), (r + 0.0018, zb + (z1 - z0) * 0.16)], loc=(0, 0, 0), material='paint_b', segs=32, sharp=50.0)
    for k in range(ribs):
        z = z0 - 0.006 - k * 0.0 if k == 0 else z1 + 0.006
        if k > 1:
            break
        P.torus('rib', r + 0.0005, 0.0012, loc=(0, 0, z), material='alu', segs=32, rsegs=4)
    P.cyl('lid', r - 0.008, 0.002, loc=(0, 0, h - 0.001), material='alu', segs=28, bev=None)
    P.torus('ring', 0.011, 0.0018, loc=(r * 0.45, 0.0, h + 0.002), material='alu', segs=14, rsegs=4)
    P.box('tab', (0.012, 0.008, 0.0015), (r * 0.25, 0.0, h + 0.0015), 'alu', bev=None)


def nd_tin_beans(P):
    """A tin of baked beans (Nomad Drive's baked beans): a tall tin."""
    P.ao_distance = 0.03
    tin(P, 0.057, 0.17)
    P.views = [('a', 35, 25), ('b', 215, 30)]


def nd_tin_soup(P):
    """A tin of tomato soup (Nomad Drive's tomato soup): a squat, wide tin."""
    P.ao_distance = 0.03
    tin(P, 0.062, 0.105, label=(0.16, 0.84))
    P.views = [('a', 35, 25), ('b', 215, 30)]


def nd_tin_tuna(P):
    """A tin of tuna (Nomad Drive's tuna can): a flat round tin, its label a band round it."""
    P.ao_distance = 0.02
    tin(P, 0.055, 0.05, label=(0.2, 0.8))
    P.views = [('a', 35, 35), ('b', 215, 40)]


def nd_banana(P):
    """A bunch of three bananas (Nomad Drive's Banana): each a curved, faceted finger (paint) with a brown tip and
    a stalk (paint_b), joined at the crown."""
    P.ao_distance = 0.03
    # (lying on their sides, curving up at both ends; fanned out at the tips, gathered at the crown)
    L = 0.2
    for i, (lift, sc) in enumerate(((0.0, 0.97), (0.022, 1.0), (0.0, 0.94))):
        pts = []
        for k in range(11):
            t = k / 10
            x = -L / 2 + t * L * sc
            z = 0.018 + lift * (1 - t) + 0.05 * (2 * t - 1) ** 2 * (0.7 if t < 0.5 else 0.4)
            y = (i - 1) * 0.032 * (1 - t) ** 1.2
            pts.append((x, y, z))
        P.tube('finger', pts, 0.017, 'paint', segs=6, bend=0.4, radius_fn=lambda t: 0.35 + 0.65 * math.sin(min(1.0, max(0.0, t)) * math.pi) ** 0.45, sharp=30.0)
        e = pts[0]
        P.sphere('tip', 0.0055, loc=(e[0] - 0.003, e[1], e[2] + 0.002), material='paint_b', u=6, v=4)
    end = (-L / 2 + L * 0.97, 0.0, 0.018 + 0.05 * 0.4)
    P.sphere('crown', 0.014, loc=end, material='paint_b', u=10, v=6, scale=(1.2, 1.4, 1.0))
    P.cyl('stalk', 0.0065, 0.035, loc=(end[0] + 0.02, 0.0, end[2] + 0.008), material='paint_b', rot=(0, 70, 0), segs=8, bev=0.002)
    P.views = [('a', 35, 35), ('b', 200, 40)]


def nd_cereal(P):
    """A box of cereal (Nomad Drive's Cereal): a tall box (paint) standing on its end, a panel of the second
    colour on its front (paint_b), its top's flaps tucked."""
    P.ao_distance = 0.03
    D, W, Hh = 0.064, 0.15, 0.21
    P.box('box', (D, W, Hh), (0, 0, Hh / 2), 'paint', bev=0.003)
    P.box('panel', (0.002, W * 0.7, Hh * 0.42), (D / 2 + 0.001, 0.0, Hh * 0.48), 'paint_b', bev=None)
    P.box('flap', (D * 0.9, W, 0.003), (0.0, 0.0, Hh + 0.0015), 'paint', bev=None)
    P.sphere('dot', 0.018, loc=(D / 2 + 0.002, 0.03, Hh * 0.75), material='paint_b', u=12, v=6, scale=(0.15, 1, 1))
    P.views = [('a', 35, 20), ('b', 215, 25)]


def nd_chocolate(P):
    """A chocolate bar (Nomad Drive's chocolate bar): a flat bar in its wrapper (paint) with crimped ends and a foil
    band across it (paint_b), lying down."""
    P.ao_distance = 0.02
    L, W, T = 0.2, 0.05, 0.022
    N.soft(P, 'bar', (L - 0.02, W, T), (0.0, 0.0, T / 2), 'paint', r=0.006)
    for s in (-1, 1):
        P.box('crimp', (0.012, W * 0.96, T * 0.35), (s * (L / 2 - 0.006), 0.0, T / 2), 'paint', bev=0.001)
    P.box('foil', (0.05, W + 0.001, T + 0.001), (0.02, 0.0, T / 2), 'paint_b', bev=0.002)
    P.views = [('a', 35, 35), ('b', 215, 40)]


def nd_mushroom(P):
    """A cluster of wild mushrooms (Nomad Drive's Mushroom, poisonous): a big cap and two small (paint) on pale
    stems (paint_b), a clod of earth they came up with."""
    P.ao_distance = 0.03
    P.sphere('clod', 0.05, loc=(0.0, 0.0, 0.012), material='leather', u=10, v=6, scale=(1.6, 1.1, 0.35))
    for (x, y, h, r, tilt) in ((0.0, 0.0, 0.085, 0.055, 4), (0.06, 0.03, 0.05, 0.032, -16), (-0.055, -0.02, 0.045, 0.028, 18)):
        P.cyl('stem', r * 0.28, h, loc=(x, y, h / 2 + 0.01), material='paint_b', segs=10, bev=0.003, r2=r * 0.22)
        prof = [(0.0, 0.0), (r * 0.35, 0.0), (r, 0.006), (r * 1.02, 0.012), (r * 0.8, r * 0.55), (r * 0.4, r * 0.78), (0.0, r * 0.82)]
        P.lathe('cap', prof, loc=(x, y, h + 0.006), material='paint', rot=(tilt, 0, 0), segs=20, sharp=50.0)
        for k in range(3):
            a = k * TAU / 3 + x * 10
            P.sphere('spot', r * 0.13, loc=(x + math.cos(a) * r * 0.55, y + math.sin(a) * r * 0.55, h + 0.006 + r * 0.6), material='paint_b', u=6, v=4, scale=(1, 1, 0.4))
    P.views = [('a', 35, 25), ('b', 215, 30)]


def nd_orange(P):
    """An orange (Nomad Drive's Orange): a round fruit a little flattened (paint), its dimpled skin, a stalk with a
    leaf (paint_b)."""
    P.ao_distance = 0.03
    r = 0.053
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=3, radius=r)
    for v in bm.verts:
        n = v.co.normalized()
        v.co = n * (r * (1.0 + 0.012 * math.sin(n.x * 40) * math.sin(n.y * 37) * math.sin(n.z * 41)))
        v.co.z *= 0.93
    K.bm_transform(bm, mat4((0.0, 0.0, r * 0.93)))
    P.mesh('fruit', bm, 'paint', bev=None, sharp=80.0)
    P.cyl('stalk', 0.004, 0.01, loc=(0.0, 0.0, 2 * r * 0.93 + 0.002), material='paint_b', segs=6, bev=None)
    leaf = [(0.0, 0.0), (0.02, 0.008), (0.035, 0.0), (0.02, -0.008)]
    P.prism('leaf', leaf, 0.002, loc=(0.002, 0.0, 2 * r * 0.93 + 0.004), material='paint_b', rot=(0, -20, 30), bev=None)
    P.views = [('a', 35, 25), ('b', 215, 30)]


def nd_peanut_jar(P):
    """A jar of peanut butter (Nomad Drive's peanut butter): a squat glass jar full of it (paint: the peanut butter
    seen through), a screw lid of the second colour (paint_b), a label round it."""
    P.ao_distance = 0.03
    r, h = 0.05, 0.13
    prof = [(0.0, 0.0), (r - 0.006, 0.0), (r, 0.006), (r, h - 0.02), (r - 0.012, h - 0.008), (r - 0.012, h), (0.0, h)]
    P.lathe('jar', prof, loc=(0, 0, 0), material='paint', segs=28, sharp=50.0)
    P.cyl('lid', r - 0.008, 0.024, loc=(0, 0, h + 0.01), material='paint_b', segs=28, bev=0.004)
    for k in range(18):
        a = k * TAU / 18
        P.box('knurl', (0.004, 0.003, 0.018), (math.cos(a) * (r - 0.008), math.sin(a) * (r - 0.008), h + 0.01), 'paint_b', rot=(0, 0, math.degrees(a)), bev=None)
    P.lathe('label', [(r + 0.0012, h * 0.25), (r + 0.0012, h * 0.68)], loc=(0, 0, 0), material='ceramic', segs=28, sharp=50.0)
    P.views = [('a', 35, 25), ('b', 215, 30)]


def nd_milk(P):
    """A carton of milk (Nomad Drive's Milk, 1 L): a square carton (paint) with its gable top and the sealed fin,
    a band of print round it (paint_b), a little screw spout on the gable."""
    P.ao_distance = 0.03
    s, h, g = 0.086, 0.19, 0.04
    P.box('carton', (s, s, h), (0, 0, h / 2), 'paint', bev=0.002)
    P.box('print', (s + 0.001, s + 0.001, 0.06), (0, 0, h * 0.42), 'paint_b', bev=0.001)
    # the gable: two sloping faces up to the fin
    gable = [(-s / 2, 0.0), (s / 2, 0.0), (0.0, g)]
    P.prism('gable', gable, s, loc=(0.0, 0.0, h), material='paint', rot=(90, 0, 0), bev=0.001)
    P.box('fin', (0.006, s, 0.012), (0.0, 0.0, h + g + 0.004), 'paint', bev=0.001)
    P.cyl('spout', 0.011, 0.012, loc=(0.02, 0.0, h + g * 0.45), material='paint_b', rot=(0, 45, 0), segs=12, bev=0.002)
    P.empty('M_spout', loc=(0.026, 0.0, h + g * 0.6))
    P.empty('M_mouth', loc=(0.026, 0.0, h + g * 0.6))
    P.views = [('a', 35, 20), ('b', 215, 25)]


def nd_pills(P):
    """A bottle of pills (Nomad Drive's Pills): an amber pill bottle (paint) with a white child-proof cap and a
    label (paint_b)."""
    P.ao_distance = 0.02
    r, h = 0.04, 0.11
    prof = [(0.0, 0.0), (r - 0.004, 0.0), (r, 0.004), (r, h), (r - 0.006, h + 0.004), (0.0, h + 0.004)]
    P.lathe('bottle', prof, loc=(0, 0, 0), material='paint', segs=24, sharp=50.0)
    P.cyl('cap', r + 0.003, 0.025, loc=(0, 0, h + 0.016), material='paint_b', segs=24, bev=0.004)
    for k in range(16):
        a = k * TAU / 16
        P.box('ridge', (0.003, 0.003, 0.02), (math.cos(a) * (r + 0.003), math.sin(a) * (r + 0.003), h + 0.016), 'paint_b', rot=(0, 0, math.degrees(a)), bev=None)
    P.lathe('label', [(r + 0.0012, h * 0.2), (r + 0.0012, h * 0.75)], loc=(0, 0, 0), material='paint_b', segs=24, sharp=50.0)
    P.views = [('a', 35, 25), ('b', 215, 30)]


def nd_first_aid(P):
    """A first-aid kit (Nomad Drive's first aid kit): a rounded hard case (paint) with a white cross on its lid
    (paint_b), its two catches, a carrying handle on top."""
    P.ao_distance = 0.05
    D, W, Hh = 0.13, 0.26, 0.2
    N.soft(P, 'case', (D, W, Hh), (0, 0, Hh / 2), 'paint', r=0.02)
    P.box('seam', (D + 0.002, W + 0.002, 0.006), (0, 0, Hh * 0.62), 'trim', bev=0.002)
    for (sx, sz) in ((0.022, 0.07), (0.07, 0.022)):
        P.box('cross', (0.004, sx * 1.0 if sx > sz else 0.022, sz if sz > sx else 0.022), (D / 2 + 0.001, 0.0, Hh * 0.42), 'paint_b', bev=None)
    for s in (-1, 1):
        P.box('catch', (0.012, 0.03, 0.03), (D / 2 + 0.004, s * 0.08, Hh * 0.62), 'alu', bev=0.003)
    J.bar(P, 'handle', (0.0, -0.06, Hh + 0.025), (0.0, 0.06, Hh + 0.025), 0.02, 0.018, 'trim', x_hint=(0, 0, 1), bev=0.007)
    for y in (-0.06, 0.06):
        P.box('handle_foot', (0.02, 0.016, 0.03), (0.0, y, Hh + 0.01), 'trim', bev=0.004)
    P.views = [('a', 35, 25), ('b', 215, 30)]


MODELS = {
    'nd_tin_beans': nd_tin_beans,
    'nd_tin_soup': nd_tin_soup,
    'nd_tin_tuna': nd_tin_tuna,
    'nd_banana': nd_banana,
    'nd_cereal': nd_cereal,
    'nd_chocolate': nd_chocolate,
    'nd_mushroom': nd_mushroom,
    'nd_orange': nd_orange,
    'nd_peanut_jar': nd_peanut_jar,
    'nd_milk': nd_milk,
    'nd_pills': nd_pills,
    'nd_first_aid': nd_first_aid,
}
MODELS = {k: H.settled(f) for k, f in MODELS.items()}


def _after(P, opts):
    J.COLORS.update(COLORS)
    J._after(P, opts)


def main(args):
    K.run(MODELS, args, after=_after, out_dir=OUT, geo=False)
