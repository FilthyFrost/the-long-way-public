"""
The ND water things (docs/ND/PLAN.md, ND2): Nomad Drive's water can (water can, 15 L), its bucket (Bucket, 10 L:
it catches rain) and its hand pump (water pump fixture: the pump of its Waterpump place, its handle rocking while
the water runs) — in our own design:

    blender -b --factory-startup --python tools/blender/build.py -- items/nd_water [<model>|all] [--look] [--norender]

The junk script's conventions (items/junk.py): origin at the bottom centre, x forward, resting on z = 0; `paint`
and `paint_b` take the item's two colours. Markers: M_mouth where what is poured in goes (and the rain), M_spout
where it pours out from, M_water the bottom of what is in it (a bucket's water is drawn by the game between there
and M_mouth). The pump's handle is its own child LEVER, its origin on the hinge (the game rocks it about the
hinge's axis across the pump, Blender Y; so named because the game's loader keeps a LEVER apart).
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
    'nd_water_can': (0x3d78b0, 0xf1ece0), 'nd_bucket': (0xe9e1cd, 0x3e6f8f), 'nd_hand_pump': (0x3f6b4f, 0xc89a46),
}


# ------------------------------------------------------------------------------------------------ the water can

def nd_water_can(P):
    """A fifteen-litre water can (Nomad Drive's water can): a flat-sided jerrycan of blue plastic (paint) with ribs
    pressed into its flanks, a carrying grip moulded over its top, a white screw cap on a short neck at its front top
    corner (paint_b) and an air vent behind it; M_spout and M_mouth at the neck's lip."""
    P.ao_distance = 0.05
    L, W, Hh = 0.34, 0.17, 0.4
    N.soft(P, 'body', (L, W, Hh - 0.02), (0.0, 0.0, (Hh - 0.02) / 2), 'paint', r=0.03)
    # the flanks' pressed ribs (a raised panel each side, with an X across it)
    for s in (-1, 1):
        N.soft(P, 'panel', (L - 0.09, 0.01, Hh - 0.13), (-0.005, s * (W / 2 + 0.001), 0.18), 'paint', r=0.012)
        for a in (1, -1):
            J.bar(P, 'rib', (-0.13, s * (W / 2 + 0.006), 0.18 - a * 0.11), (0.12, s * (W / 2 + 0.006), 0.18 + a * 0.11), 0.012, 0.004,
                  'paint', x_hint=(0, s, 0), bev=0.002)
    # the shoulder the neck stands on, the grip over the top (a bridge with its hole through)
    N.soft(P, 'shoulder', (0.09, W - 0.03, 0.04), (0.12, 0.0, Hh - 0.01), 'paint', r=0.014)
    J.bar(P, 'grip', (-0.12, 0.0, Hh + 0.055), (0.04, 0.0, Hh + 0.055), 0.03, 0.026, 'paint', x_hint=(0, 0, 1), bev=0.01)
    for x in (-0.135, 0.055):
        N.soft(P, 'grip_post', (0.03, 0.03, 0.07), (x, 0.0, Hh + 0.02), 'paint', r=0.01)
    # the neck and its cap, the vent
    P.cyl('neck', 0.024, 0.03, loc=(0.135, 0.0, Hh + 0.025), material='paint', segs=18, bev=0.003)
    P.cyl('cap', 0.03, 0.026, loc=(0.135, 0.0, Hh + 0.05), material='paint_b', segs=20, bev=0.004)
    for k in range(10):
        a = k * TAU / 10
        P.box('cap_knurl', (0.006, 0.004, 0.02), (0.135 + math.cos(a) * 0.03, math.sin(a) * 0.03, Hh + 0.05), 'paint_b', rot=(0, 0, math.degrees(a)), bev=None)
    P.cyl('vent', 0.009, 0.012, loc=(-0.15, 0.04, Hh - 0.004), material='paint_b', segs=12, bev=0.002)
    P.empty('M_spout', loc=(0.135, 0.0, Hh + 0.065))
    P.empty('M_mouth', loc=(0.135, 0.0, Hh + 0.065))
    P.views = [('a', 35, 25), ('b', 215, 30)]


# ------------------------------------------------------------------------------------------------ the bucket

def nd_bucket(P):
    """A ten-litre enamel bucket (Nomad Drive's Bucket): a tapering pail (paint) with a rolled rim and a band of
    the second colour at its rim and its foot (paint_b), two ears riveted on, a wire bail lying over to one side with
    a wooden grip; M_mouth the rim's middle, M_spout its front edge, M_water the inside of its bottom."""
    P.ao_distance = 0.05
    r0, r1, h, t = 0.105, 0.14, 0.27, 0.004
    prof = [(0.0, 0.004), (r0 - 0.01, 0.0), (r0, 0.008), (r1, h - 0.006), (r1 + 0.002, h), (r1 - t, h), (r0 - t, 0.014), (0.0, 0.012)]
    P.lathe('pail', prof, loc=(0.0, 0.0, 0.0), material='paint', segs=36, sharp=60.0)
    P.torus('rim', r1 + 0.001, 0.0045, loc=(0.0, 0.0, h), material='paint_b', segs=36, rsegs=6)
    # the bands: a ring of the second colour under the rim and at the foot
    k = lambda z: r0 + (r1 - r0) * (z / h)
    P.lathe('band_top', [(k(h - 0.04) + 0.0006, h - 0.04), (k(h - 0.012) + 0.0006, h - 0.012)], loc=(0, 0, 0), material='paint_b', segs=36, sharp=60.0)
    P.lathe('band_foot', [(r0 + 0.0008, 0.0), (k(0.025) + 0.0008, 0.025)], loc=(0, 0, 0), material='paint_b', segs=36, sharp=60.0)
    # the ears, the bail over to the side (lying against the rim), its grip
    ear_z = h - 0.03
    for s in (-1, 1):
        y = s * (k(ear_z) + 0.004)
        P.box('ear', (0.03, 0.006, 0.04), (0.0, y, ear_z), 'paint_b', bev=0.002)
        P.cyl('rivet', 0.004, 0.004, loc=(0.0, y + s * 0.004, ear_z - 0.008), material='steel', axis='Y', segs=8, bev=None)
    lean = math.radians(62.0)
    arc = []
    R = k(ear_z) + 0.012
    for i in range(13):
        a = math.pi * i / 12
        y = -math.cos(a) * R
        up = math.sin(a) * 0.2
        arc.append((up * math.sin(lean) * 0.95, y, ear_z + up * math.cos(lean)))
    P.tube('bail', arc, 0.0028, 'steel', segs=8, bend=0.2)
    gx, gz = 0.2 * math.sin(lean) * 0.95, ear_z + 0.2 * math.cos(lean)
    P.cyl('grip', 0.011, 0.09, loc=(gx, 0.0, gz), material='wood', axis='Y', segs=12, bev=0.004)
    P.empty('M_mouth', loc=(0.0, 0.0, h - 0.004))
    P.empty('M_spout', loc=(r1 - 0.004, 0.0, h))
    P.empty('M_water', loc=(0.0, 0.0, 0.014))
    P.views = [('a', 35, 30), ('b', 215, 40)]


# ------------------------------------------------------------------------------------------------ the hand pump

def nd_hand_pump(P):
    """A cast-iron pitcher pump (Nomad Drive's water pump fixture, its water the reservoir's 20 L): a fluted barrel
    (paint) on a flanged foot bolted to its stand, a cap on top with the plunger's rod and its link, a spout curling
    out and down at the front, its lip M_spout; the long handle behind, its own child turning on the hinge
    at the cap's back (LEVER; the grip of the second colour, paint_b)."""
    P.ao_distance = 0.06
    z0 = 0.0
    # the foot and its bolts, the barrel, the bands
    P.lathe('foot', [(0.0, 0.0), (0.1, 0.0), (0.1, 0.016), (0.075, 0.03), (0.06, 0.045), (0.0, 0.045)], loc=(0, 0, z0), material='paint', segs=28, sharp=50.0)
    for k in range(4):
        a = k * TAU / 4 + TAU / 8
        P.cyl('bolt', 0.009, 0.012, loc=(math.cos(a) * 0.082, math.sin(a) * 0.082, 0.02), material='steel', segs=6, bev=0.002)
    P.lathe('barrel', [(0.0, 0.04), (0.058, 0.04), (0.062, 0.06), (0.062, 0.33), (0.066, 0.345), (0.0, 0.345)], loc=(0, 0, 0), material='paint', segs=28,
            sharp=50.0)
    for z in (0.07, 0.2, 0.32):
        P.torus('band', 0.064, 0.006, loc=(0.0, 0.0, z), material='paint', segs=28, rsegs=6)
    for k in range(10):
        a = k * TAU / 10
        P.box('flute', (0.006, 0.008, 0.11), (math.cos(a) * 0.062, math.sin(a) * 0.062, 0.135), 'paint', rot=(0, 0, math.degrees(a)), bev=0.002)
    # the cap and its pivot lugs at the back, the rod coming up through it
    P.lathe('cap', [(0.0, 0.345), (0.072, 0.345), (0.074, 0.36), (0.055, 0.385), (0.03, 0.4), (0.0, 0.405)], loc=(0, 0, 0), material='paint', segs=28,
            sharp=50.0)
    for s in (-1, 1):
        N.soft(P, 'lug', (0.05, 0.012, 0.07), (-0.07, s * 0.022, 0.39), 'paint', r=0.005)
    P.cyl('pin', 0.007, 0.06, loc=(-0.075, 0.0, 0.41), material='steel', axis='Y', segs=10, bev=0.002)
    # the spout: out of the barrel's front, curling down to its lip
    sp = [(0.04, 0.0, 0.285), (0.12, 0.0, 0.29), (0.175, 0.0, 0.27), (0.195, 0.0, 0.225)]
    P.tube('spout', sp, 0.026, 'paint', segs=16, bend=0.5, radius_fn=lambda t: 1.0 - 0.25 * t)
    P.cyl('spout_lip', 0.022, 0.012, loc=(0.196, 0.0, 0.222), material='paint', segs=16, bev=0.003)
    P.cyl('spout_hole', 0.014, 0.004, loc=(0.196, 0.0, 0.2155), material='trim', segs=14, bev=None)
    P.empty('M_spout', loc=(0.196, 0.0, 0.214))
    # the handle: from its nose over the rod, through the hinge, up and back to its grip; with the rod's link
    since = H.mark_since(P)
    hx, hz = -0.075, 0.41
    lever = [(0.06, 0.0, 0.44), (hx, 0.0, hz + 0.012), (-0.25, 0.0, 0.5), (-0.42, 0.0, 0.6)]
    P.tube('lever', lever, 0.013, 'paint', segs=10, bend=0.25, radius_fn=lambda t: 1.0 - 0.3 * t)
    N.soft(P, 'nose', (0.05, 0.03, 0.03), (0.06, 0.0, 0.44), 'paint', r=0.008)
    J.bar(P, 'grip', (-0.43, 0.0, 0.605), (-0.54, 0.0, 0.67), 0.03, 0.03, 'paint_b', x_hint=(0, 0, 1), bev=0.012, taper=0.9)
    P.cyl('link', 0.008, 0.06, loc=(0.06, 0.0, 0.405), material='steel', segs=10, bev=0.002)
    P.mover('LEVER', P.statics[since:], (hx, 0.0, hz))
    P.cyl('rod', 0.008, 0.03, loc=(0.06, 0.0, 0.385), material='steel', segs=10, bev=0.002)
    P.views = [('a', 35, 20), ('b', 215, 25), ('c', 100, 10)]


MODELS = {
    'nd_water_can': nd_water_can,
    'nd_bucket': nd_bucket,
    'nd_hand_pump': nd_hand_pump,
}
MODELS = {k: H.settled(f) for k, f in MODELS.items()}


def _after(P, opts):
    J.COLORS.update(COLORS)
    J._after(P, opts)


def main(args):
    K.run(MODELS, args, after=_after, out_dir=OUT, geo=False)
