"""
The ND kitchen (docs/ND/PLAN.md, ND2): Nomad Drive's three stoves — a one-plate electric hot plate (Stove01, 0.35 x
0.38 m), a two-burner gas camp stove (Stove02, 0.71 x 0.40 m), a four-plate electric hob (Stove03, 0.65 x 0.72 m and
3 cm thin) — its frying pan (Pan, 0.62 m with its handle) and its stew pot (cooking pot 01, 0.31 m across), and the two
things it fries, a steak (0.23 x 0.18 m) and a drumstick (0.21 m), in our own design:

    blender -b --factory-startup --python tools/blender/build.py -- items/nd_kitchen [<model>|all] [--look] [--norender]

The junk script's conventions (items/junk.py). A stove's knobs are its own children KNOB_<n> (the game turns each a
quarter round, Nomad Drive's 90° in 0.4 s), its burners' middles markers M_burner_<n> (a pan stands there), each
knob's M_knob_<n>.
"""
import math

import bmesh
from mathutils import Matrix

from parts import _kit as K
from parts._kit import V, mat4
from items import junk as J
from items import nd_home as H
from items import nd_things as N

OUT = 'public/models/modcar/items'
TAU = math.tau

COLORS = {
    'nd_stove_1': (0xe8e0c8, 0x2f3236), 'nd_stove_2': (0x4f7a5a, 0xe8d8b0), 'nd_stove_3': (0x2b2d31, 0xd8d2c4),
    'nd_pan': (0x2f3236, 0x8a5a3c), 'nd_cooking_pot': (0xb8bcc0, 0x2f3236), 'nd_steak': (0xb5404a, 0xf0d8c8),
    'nd_drumstick': (0xd99a6a, 0xf3ead8),
}


def knob(P, n, x, y, z, r=0.016):
    """A stove's knob on a front facing +x: its own child KNOB_<n>, a pointer on its face, M_knob_<n>."""
    since = H.mark_since(P)
    P.lathe('knob', [(0.0, 0.0), (r * 0.9, 0.0), (r, 0.004), (r, 0.016), (r * 0.8, 0.02), (0.0, 0.021)], loc=(x, y, z), material='trim',
            axis='X', segs=16, sharp=60.0)
    P.box('pointer', (0.004, 0.003, r * 0.9), (x + 0.021, y, z + r * 0.4), 'paint_b', bev=None)
    P.mover(f'KNOB_{n}', P.statics[since:], (x, y, z))
    P.empty(f'M_knob_{n}', loc=(x + 0.012, y, z))


def coil_plate(P, x, y, z, r):
    """An electric plate: a dark disc with its coil's rings raised on it."""
    P.cyl('plate', r, 0.008, loc=(x, y, z + 0.004), material='trim', segs=28, bev=0.002)
    for k in range(4):
        P.torus('coil', r * (0.25 + 0.2 * k), 0.0028, loc=(x, y, z + 0.0085), material='steel', segs=28, rsegs=4)
    P.torus('plate_rim', r + 0.004, 0.003, loc=(x, y, z + 0.006), material='chrome', segs=28, rsegs=4)


def nd_stove_1(P):
    """A one-plate electric hot plate (Nomad Drive's Stove01): an enamelled box (paint) on four feet, its plate on top,
    its knob and its lamp on the front."""
    P.ao_distance = 0.05
    N.soft(P, 'body', (0.33, 0.3, 0.075), (0.0, 0.0, 0.0475), 'paint', r=0.018)
    for sx in (-1, 1):
        for sy in (-1, 1):
            P.cyl('foot', 0.012, 0.01, loc=(sx * 0.13, sy * 0.115, 0.005), material='rubber', segs=10)
    coil_plate(P, -0.02, 0.0, 0.085, 0.095)
    P.empty('M_burner_1', loc=(-0.02, 0.0, 0.094))
    knob(P, 1, 0.165, 0.08, 0.05)
    P.sphere('lamp', 0.006, loc=(0.166, -0.07, 0.055), material='lens_tail', u=10, v=6)
    P.box('badge', (0.004, 0.06, 0.012), (0.166, -0.01, 0.03), 'chrome', bev=0.002)
    P.views = [('a', 35, 30), ('b', 215, 30)]


def burner_grate(P, x, y, z, r=0.085):
    """A gas burner: its crown (alu) with the flame ring's holes, a steel grate of four arms over it."""
    P.lathe('crown', [(0.0, 0.0), (0.035, 0.0), (0.04, 0.008), (0.03, 0.016), (0.0, 0.016)], loc=(x, y, z), material='alu', segs=20,
            sharp=50.0)
    P.cyl('cap', 0.022, 0.006, loc=(x, y, z + 0.018), material='trim', segs=16, bev=0.002)
    P.torus('grate_ring', r, 0.004, loc=(x, y, z + 0.03), material='trim', segs=24, rsegs=4)
    for k in range(4):
        a = k * TAU / 4 + TAU / 8
        J.bar(P, 'grate_arm', (x + math.cos(a) * 0.03, y + math.sin(a) * 0.03, z + 0.034), (x + math.cos(a) * (r + 0.012),
              y + math.sin(a) * (r + 0.012), z + 0.03), 0.006, 0.006, 'trim', x_hint=(0, 0, 1), bev=0.001)


def nd_stove_2(P):
    """A two-burner gas camp stove (Nomad Drive's Stove02): a case (paint) with its lid stood up at the back as a wind
    guard and its two side flaps out, the tray inside (alu) with two burners under their grates, two knobs on the front,
    the cartridge's door at the side."""
    P.ao_distance = 0.06
    W, D = 0.62, 0.32
    N.soft(P, 'case', (D, W, 0.08), (0.0, 0.0, 0.04), 'paint', r=0.012)
    P.box('tray', (D - 0.03, W - 0.05, 0.006), (0.005, 0.0, 0.083), 'alu', bev=0.002, segs=1)
    N.soft(P, 'lid', (0.012, W, 0.3), (-D / 2 - 0.004, 0.0, 0.08 + 0.15), 'paint', r=0.006, rot=(0, -6, 0))
    for s in (-1, 1):
        N.soft(P, 'flap', (D * 0.8, 0.01, 0.16), (0.0, s * (W / 2 + 0.003), 0.08 + 0.08), 'paint', r=0.005, rot=(s * 8, 0, 0))
    for i, y in enumerate((-0.15, 0.15)):
        burner_grate(P, 0.01, y, 0.086)
        P.empty(f'M_burner_{i + 1}', loc=(0.01, y, 0.12))
        knob(P, i + 1, D / 2 + 0.002, y, 0.045, r=0.015)
    N.soft(P, 'cartridge_door', (0.2, 0.006, 0.05), (0.0, -W / 2 - 0.002, 0.04), 'paint_b', r=0.004)
    P.box('handle', (0.08, 0.012, 0.015), (0.0, W / 2 + 0.008, 0.05), 'trim', bev=0.004)
    P.views = [('a', 30, 30), ('b', 160, 35)]


def nd_stove_3(P):
    """A four-plate electric hob (Nomad Drive's Stove03, 3 cm thin): a dark glass top (paint) on a steel frame, four
    plates of two sizes, four knobs along its front edge."""
    P.ao_distance = 0.04
    D, W = 0.5, 0.6
    N.soft(P, 'frame', (D, W, 0.025), (0.0, 0.0, 0.0125), 'steel', r=0.006)
    P.box('glass', (D - 0.02, W - 0.02, 0.006), (0.0, 0.0, 0.026), 'paint', bev=0.003, segs=1)
    plates = [(-0.1, -0.15, 0.085), (-0.1, 0.15, 0.07), (0.1, -0.15, 0.07), (0.1, 0.15, 0.085)]
    for i, (x, y, r) in enumerate(plates):
        P.cyl('ring', r + 0.008, 0.001, loc=(x, y, 0.0295), material='paint_b', segs=28, bev=None)
        P.cyl('ring_in', r, 0.0012, loc=(x, y, 0.0297), material='paint', segs=28, bev=None)
        for k in range(3):
            P.torus('coil', r * (0.3 + 0.25 * k), 0.0018, loc=(x, y, 0.0302), material='trim', segs=24, rsegs=3)
        P.empty(f'M_burner_{i + 1}', loc=(x, y, 0.031))
    for i, y in enumerate((-0.21, -0.07, 0.07, 0.21)):
        knob(P, i + 1, D / 2 - 0.035, y, 0.031, r=0.013)
    P.views = [('a', 30, 40), ('b', 160, 40)]


def nd_pan(P):
    """A frying pan (Nomad Drive's Pan, 0.62 m with its handle): a cast pan (trim) with a flared side, a wooden handle
    with a steel collar and a hole to hang it by; M_food where what fries in it lies."""
    P.ao_distance = 0.04
    r = 0.13
    prof = [(0.0, 0.0), (r - 0.02, 0.0), (r - 0.004, 0.006), (r + 0.004, 0.04), (r + 0.007, 0.045), (r + 0.003, 0.046), (r - 0.004, 0.042),
            (r - 0.012, 0.012), (r - 0.024, 0.005), (0.0, 0.005)]
    P.lathe('pan', prof, loc=(0, 0, 0), material='trim', segs=36, sharp=50.0)
    P.cyl('collar', 0.016, 0.05, loc=(r + 0.03, 0.0, 0.035), material='steel', axis='X', segs=12, bev=0.003)
    J.bar(P, 'handle', (r + 0.05, 0.0, 0.037), (r + 0.25, 0.0, 0.052), 0.026, 0.034, 'paint_b', x_hint=(0, 0, 1), bev=0.01, taper=0.85)
    P.torus('hang_hole', 0.008, 0.003, loc=(r + 0.23, 0.0, 0.052), material='trim', segs=12, rsegs=4)
    P.empty('M_food', loc=(0.0, 0.0, 0.006))
    P.views = [('a', 35, 40), ('b', 215, 35)]


def nd_cooking_pot(P):
    """A shallow stew pot (Nomad Drive's cooking pot 01, 0.31 m across): an aluminium pot (paint) with a rolled rim and
    two side handles (trim); M_food where what cooks in it lies."""
    P.ao_distance = 0.04
    r = 0.125
    prof = [(0.0, 0.0), (r - 0.012, 0.0), (r, 0.01), (r, 0.07), (r + 0.004, 0.074), (r - 0.003, 0.074), (r - 0.003, 0.012),
            (r - 0.014, 0.004), (0.0, 0.004)]
    P.lathe('pot', prof, loc=(0, 0, 0), material='paint', segs=36, sharp=50.0)
    for s in (-1, 1):
        P.tube('handle', [(0.0, s * (r - 0.004), 0.058), (0.0, s * (r + 0.03), 0.062), (0.03, s * (r + 0.03), 0.062), (0.03, s * (r - 0.004), 0.058)],
               0.006, 'trim', segs=8, bend=0.3)
    P.empty('M_food', loc=(0.0, 0.0, 0.005))
    P.views = [('a', 35, 40), ('b', 215, 35)]


def nd_steak(P):
    """A steak (Nomad Drive's Steak, 0.23 x 0.18 m): a thick slab of meat (paint: its colour says how done it is) of an
    uneven outline, its rim of fat (paint_b) round one side."""
    P.ao_distance = 0.02
    pts = []
    for k in range(18):
        a = k * TAU / 18
        rr = 1.0 + 0.08 * math.sin(a * 3 + 0.5) + 0.05 * math.sin(a * 5)
        pts.append((0.11 * rr * math.cos(a), 0.08 * rr * math.sin(a)))
    bm = bmesh.new()
    K.bm_prism(bm, pts, 0.028, matrix=mat4((0.0, 0.0, 0.014)))
    for v in bm.verts:
        if v.co.z > 0.02:
            v.co.z += 0.004 * math.sin(v.co.x * 30) * math.cos(v.co.y * 25)
    P.mesh('meat', bm, 'paint', bev=0.006, segs=2, sharp=45.0)
    fat = bmesh.new()
    arc = [(0.115 * math.cos(a) * (1.0 + 0.05 * math.sin(a * 3)), 0.085 * math.sin(a)) for a in [math.pi * (0.55 + 0.9 * k / 10) for k in range(11)]]
    inner = [(x * 0.86, y * 0.86) for (x, y) in reversed(arc)]
    K.bm_prism(fat, arc + inner, 0.026, matrix=mat4((0.0, 0.0, 0.0145)))
    P.mesh('fat', fat, 'paint_b', bev=0.004, segs=1, sharp=45.0)
    P.views = [('a', 35, 45), ('b', 215, 40)]


def nd_drumstick(P):
    """A chicken drumstick (Nomad Drive's Drumstick, 0.21 m): its plump meat (paint: how done it is) narrowing to the
    knuckle of its bone (paint_b), lying on its side."""
    P.ao_distance = 0.02
    prof = [(0.0, 0.0), (0.026, 0.006), (0.04, 0.03), (0.046, 0.06), (0.042, 0.09), (0.03, 0.115), (0.016, 0.13), (0.012, 0.14), (0.0, 0.142)]
    bm = bmesh.new()
    K.bm_lathe(bm, prof, segs=20, matrix=Matrix.Translation((-0.08, 0.0, 0.046)) @ Matrix.Rotation(math.pi / 2, 4, 'Y'))
    for v in bm.verts:
        v.co.y *= 0.9
    P.mesh('meat', bm, 'paint', bev=None, sharp=80.0)
    P.cyl('bone', 0.009, 0.05, loc=(0.085, 0.0, 0.046), material='paint_b', axis='X', segs=10, bev=0.002)
    P.sphere('knuckle', 0.015, loc=(0.112, 0.0, 0.046), material='paint_b', u=12, v=8, scale=(0.8, 1.2, 1.0))
    P.views = [('a', 35, 35), ('b', 215, 30)]


MODELS = {
    'nd_stove_1': nd_stove_1,
    'nd_stove_2': nd_stove_2,
    'nd_stove_3': nd_stove_3,
    'nd_pan': nd_pan,
    'nd_cooking_pot': nd_cooking_pot,
    'nd_steak': nd_steak,
    'nd_drumstick': nd_drumstick,
}
MODELS = {k: H.settled(f) for k, f in MODELS.items()}


def _after(P, opts):
    J.COLORS.update(COLORS)
    J._after(P, opts)


def main(args):
    K.run(MODELS, args, after=_after, out_dir=OUT, geo=False)
