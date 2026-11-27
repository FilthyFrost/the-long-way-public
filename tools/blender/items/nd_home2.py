"""
More ND furniture (docs/ND/PLAN.md, ND5: what Nomad Drive's motel, commune houses, camp site and starter house are
furnished with) — in our own design, at its sizes: Nightstand-01 0.45 x 0.46 x 0.60 m, Chair-Folding 0.65 x 0.72 x
0.89, dinner table 02 0.86 x 0.69 x 0.66, dinner seat 04 0.40 x 0.44 x 0.91, dinner seat 02 0.33 x 0.33 x 0.59, Sofa-02
1.40 x 0.86 x 0.79, WC-01 1.16 m tall, wall shelf 02 0.73 x 0.14 x 0.52, Cabinet-01 0.79 x 0.71 x 0.91:

    blender -b --factory-startup --python tools/blender/build.py -- items/nd_home2 [<model>|all] [--look] [--norender]

The conventions are nd_home.py's: origin at the bottom centre, x forward (its front), resting on z = 0; `paint` and
`paint_b` take the item's two colours; a door is P_door_<tag> (its origin on its hinge line), a drawer P_drawer_<tag>
(it slides out along +x): the game swings and slides them (src/game/modcar/v3/nd-home); a wall shelf hangs by its back.
"""
import math

import bmesh
from mathutils import Matrix, Vector

from parts import _kit as K
from parts._kit import V, mat4
from items import junk as J
from items import nd_home as H

OUT = 'public/models/modcar/items'
TAU = math.tau

COLORS = {
    'nd_nightstand': (0x8fb0a6, 0xe9dcc0), 'nd_chair_fold': (0x3e7f96, 0x5a5f66), 'nd_dinner_table': (0xd8673a, 0xe9dcc0),
    'nd_dinner_chair': (0x8a5a3c, 0xc8372f), 'nd_stool': (0xe8a23a, 0x8a5a3c), 'nd_sofa_2': (0xc4973f, 0x6b4a2f),
    'nd_wc': (0xf1ece0, 0x8a5a3c), 'nd_wall_shelf': (0x7d977a, 0x6b4a2f), 'nd_cabinet': (0x6c8fae, 0xf1e8d4),
}


def taper_leg(P, x, y, z0, z1, r0, r1, mat='paint'):
    P.lathe('leg', [(0.0, 0.0), (r1, 0.0), (r0 * 0.98, (z1 - z0) * 0.85), (r0, z1 - z0), (0.0, z1 - z0)], loc=(x, y, z0), material=mat,
            segs=10, sharp=60.0)


# ------------------------------------------------------------------------------------------------ the nightstand

def nd_nightstand(P):
    """A nightstand (Nomad Drive's Nightstand-01, 0.6 m high): a painted box on four tapered legs, a drawer at the top
    (P_drawer_a) with a little knob, an open shelf under it, a lipped top."""
    P.ao_distance = 0.15
    D, W, Hh = 0.42, 0.44, 0.6
    x1 = D / 2 - 0.01
    for sx in (-1, 1):
        for sy in (-1, 1):
            taper_leg(P, sx * (D / 2 - 0.04), sy * (W / 2 - 0.04), 0.0, 0.16, 0.018, 0.012)
    body = P.mesh('carcass', J.slab((D - 0.01, W, Hh - 0.2), (-0.005, 0.0, 0.16 + (Hh - 0.2) / 2), step=0.1), 'paint', bev=0.004)
    cav = bmesh.new()
    K.bm_cube(cav, (D - 0.04, W - 0.04, Hh - 0.2 - 0.04), matrix=Matrix.Translation((x1 - (D - 0.04) / 2 + 0.02, 0.0, 0.16 + (Hh - 0.2) / 2)))
    P.cut(body, cav)
    P.box('shelf', (D - 0.05, W - 0.05, 0.016), (-0.01, 0.0, 0.31), 'paint', bev=0.003, segs=1)
    P.box('top', (D + 0.03, W + 0.03, 0.03), (0.0, 0.0, Hh - 0.025), 'paint_b', bev=0.008, segs=2)
    since = H.mark_since(P)
    H.panel(P, 'drawer', x1 + 0.011, -W / 2 + 0.03, W / 2 - 0.03, Hh - 0.17, Hh - 0.045, frame=0.03)
    H.knob(P, x1 + 0.022, 0.0, Hh - 0.105, 'ceramic', 0.014)
    dd = 0.34
    P.box('drawer_floor', (dd, W - 0.08, 0.008), (x1 - dd / 2, 0.0, Hh - 0.16), 'wood', bev=0.002, segs=1)
    for s in (-1, 1):
        P.box('drawer_side', (dd, 0.01, 0.08), (x1 - dd / 2, s * (W / 2 - 0.045), Hh - 0.12), 'wood', bev=0.002, segs=1)
    P.mover('P_drawer_a', P.statics[since:], (x1, 0.0, Hh - 0.105))
    P.views = [('a', 30, 18), ('b', 150, 20)]


# ------------------------------------------------------------------------------------------------ the folding chair

def nd_chair_fold(P):
    """A folding camp chair (Nomad Drive's Chair-Folding, 0.89 m high): an aluminium frame crossed on each side,
    a canvas seat slung between its rails and a canvas back (paint), armrests (paint_b) with a cup holder in the right one."""
    P.ao_distance = 0.12
    D, W = 0.6, 0.56
    zs = 0.44
    for s in (-1, 1):
        y = s * W / 2
        P.tube('x_a', [(D / 2 - 0.04, y, 0.0), (-D / 2 + 0.06, y, zs)], 0.011, 'alu', segs=8)
        P.tube('x_b', [(-D / 2 + 0.04, y, 0.0), (D / 2 - 0.06, y, zs)], 0.011, 'alu', segs=8)
        P.cyl('pivot', 0.014, 0.012, loc=(0.0, y, zs / 2), material='steel', axis='Y', segs=10)
        P.tube('rail', [(D / 2 - 0.02, y, zs), (-D / 2 + 0.02, y, zs + 0.02)], 0.012, 'alu', segs=8)
        P.tube('back_post', [(-D / 2 + 0.03, y, zs + 0.02), (-D / 2 - 0.05, y, 0.89)], 0.012, 'alu', segs=8)
        for (x, z) in ((D / 2 - 0.04, 0.0), (-D / 2 + 0.04, 0.0)):
            P.cyl('foot', 0.016, 0.012, loc=(x, y, 0.006), material='rubber', segs=10)
        # the armrest
        P.box('arm', (0.36, 0.07, 0.025), (0.06, y + s * 0.012, 0.64), 'paint_b', bev=0.008, segs=2)
        P.tube('arm_post', [(0.2, y, zs), (0.2, y, 0.63)], 0.01, 'alu', segs=8)
        P.tube('arm_back', [(-0.12, y, 0.63), (-D / 2 - 0.0, y, 0.68)], 0.01, 'alu', segs=8)
    # the canvas: slung seat (sagging a little) and back
    J.cushion(P, 'seat', (D - 0.08, W - 0.02, 0.03), loc=(0.0, 0.0, zs - 0.01), material='paint', r=0.01, sag=0.03)
    J.cushion(P, 'back', (0.03, W - 0.02, 0.36), loc=(-D / 2 - 0.02, 0.0, 0.69), material='paint', rot=(0, -12, 0), r=0.01)
    P.torus('cup', 0.035, 0.006, loc=(0.06, W / 2 + 0.06, 0.645), material='paint_b', segs=18, rsegs=6)
    P.cyl('cup_base', 0.034, 0.004, loc=(0.06, W / 2 + 0.06, 0.6), material='paint_b', segs=18)
    P.views = [('a', 30, 15), ('b', 160, 15)]


# ------------------------------------------------------------------------------------------------ the kitchen table, chair, stool

def nd_dinner_table(P):
    """A kitchen table (Nomad Drive's dinner table 02, 0.86 x 0.69 m, 0.66 high): a top covered in checked oilcloth
    (paint, with paint_b checks) hanging a little over its edges, a painted apron, four turned legs."""
    P.ao_distance = 0.2
    D, W, Hh = 0.86, 0.69, 0.66
    lx, ly = D / 2 - 0.07, W / 2 - 0.07
    for sx in (-1, 1):
        for sy in (-1, 1):
            P.lathe('leg', [(0.0, 0.0), (0.02, 0.0), (0.024, 0.04), (0.019, 0.12), (0.026, 0.3), (0.02, 0.48), (0.026, Hh - 0.1), (0.026, Hh - 0.02),
                            (0.0, Hh - 0.02)], loc=(sx * lx, sy * ly, 0.0), material='wood', segs=10, sharp=60.0)
    for s in (-1, 1):
        P.box('apron', (0.02, 2 * ly, 0.09), (s * lx, 0.0, Hh - 0.07), 'wood', bev=0.003, segs=1)
        P.box('apron', (2 * lx, 0.02, 0.09), (0.0, s * ly, Hh - 0.07), 'wood', bev=0.003, segs=1)
    P.box('top', (D, W, 0.028), (0.0, 0.0, Hh - 0.014), 'wood', bev=0.006, segs=2)
    # the oilcloth: checks over it, its hem hanging over the edges
    P.box('cloth', (D + 0.03, W + 0.03, 0.004), (0.0, 0.0, Hh + 0.002), 'paint', bev=None)
    n = 8
    for i in range(n):
        for j in range(n):
            if (i + j) % 2:
                continue
            P.box('check', ((D + 0.03) / n, (W + 0.03) / n, 0.0012), (-(D + 0.03) / 2 + (i + 0.5) * (D + 0.03) / n, -(W + 0.03) / 2 + (j + 0.5) * (W + 0.03) / n, Hh + 0.0045), 'paint_b', bev=None)
    for s in (-1, 1):
        P.box('hem', (0.004, W + 0.03, 0.05), (s * (D / 2 + 0.015), 0.0, Hh - 0.022), 'paint', bev=None)
        P.box('hem', (D + 0.03, 0.004, 0.05), (0.0, s * (W / 2 + 0.015), Hh - 0.022), 'paint', bev=None)
    P.views = [('a', 30, 25), ('b', 150, 25)]


def nd_dinner_chair(P):
    """A kitchen chair (Nomad Drive's dinner seat 04, 0.9 m high): a bentwood café chair — a round seat (paint_b),
    four splayed legs and a ring between them, the back a bent hoop with a curved rail across it (paint)."""
    P.ao_distance = 0.1
    zs = 0.46
    r = 0.2
    for k in range(4):
        a = TAU * (k + 0.5) / 4
        x0, y0 = math.cos(a) * (r - 0.03), math.sin(a) * (r - 0.03)
        x1, y1 = math.cos(a) * (r + 0.025), math.sin(a) * (r + 0.025)
        P.tube('leg', [(x0, y0, zs - 0.02), (x1, y1, 0.0)], 0.013, 'paint', segs=8)
    P.torus('ring', r - 0.01, 0.008, loc=(0.0, 0.0, 0.2), material='paint', segs=24, rsegs=6)
    P.cyl('seat', r, 0.035, loc=(0.0, 0.0, zs - 0.0175), material='paint_b', segs=28, bev=0.008)
    # the back: a hoop from the seat's back edge, bent, its rail
    pts = []
    for i in range(13):
        t = i / 12
        a = math.pi * t
        pts.append((-r + 0.03 - 0.04 * math.sin(a), -0.17 * math.cos(a), zs + 0.02 + 0.42 * math.sin(a) ** 0.6))
    P.tube('hoop', pts, 0.012, 'paint', segs=8, bend=0.0)
    P.tube('rail', [(-r + 0.01, -0.15, zs + 0.24), (-r - 0.015, 0.0, zs + 0.25), (-r + 0.01, 0.15, zs + 0.24)], 0.01, 'paint', segs=8)
    P.views = [('a', 30, 15), ('b', 160, 15)]


def nd_stool(P):
    """A kitchen stool (Nomad Drive's dinner seat 02, 0.59 m high): a round seat (paint) on three splayed legs (wood)
    with a foot ring."""
    P.ao_distance = 0.08
    zs = 0.585
    r = 0.15
    for k in range(3):
        a = TAU * k / 3
        P.tube('leg', [(math.cos(a) * 0.07, math.sin(a) * 0.07, zs - 0.03), (math.cos(a) * 0.15, math.sin(a) * 0.15, 0.0)], 0.014, 'wood', segs=8)
    P.torus('ring', 0.115, 0.007, loc=(0.0, 0.0, 0.2), material='steel', segs=24, rsegs=6)
    P.lathe('seat', [(0.0, 0.0), (r - 0.01, 0.0), (r, 0.012), (r - 0.004, 0.03), (0.0, 0.035)], loc=(0.0, 0.0, zs - 0.035), material='paint', segs=28,
            close='end', sharp=50.0)
    P.views = [('a', 30, 20), ('b', 160, 20)]


# ------------------------------------------------------------------------------------------------ the second sofa

def nd_sofa_2(P):
    """A boxy sofa (Nomad Drive's Sofa-02, 1.4 m long): a wooden frame (paint_b) with flat arms and short legs, two
    square seat cushions and two back cushions (paint), buttoned."""
    P.ao_distance = 0.25
    D, L = 0.84, 1.4
    for sx in (-1, 1):
        for sy in (-1, 1):
            P.box('leg', (0.05, 0.05, 0.12), (sx * (D / 2 - 0.06), sy * (L / 2 - 0.06), 0.06), 'paint_b', bev=0.008, segs=1)
    P.box('base', (D - 0.04, L - 0.14, 0.14), (0.0, 0.0, 0.19), 'paint_b', bev=0.01, segs=2)
    P.box('back_frame', (0.1, L - 0.14, 0.42), (-D / 2 + 0.07, 0.0, 0.47), 'paint_b', bev=0.01, segs=2)
    for s in (-1, 1):
        y = s * (L / 2 - 0.05)
        P.box('arm_side', (D - 0.04, 0.06, 0.4), (0.0, y, 0.32), 'paint_b', bev=0.01, segs=2)
        P.box('arm_top', (D + 0.0, 0.12, 0.035), (0.0, y, 0.54), 'paint_b', bev=0.01, segs=2)
        P.pillow('seat_cushion', (0.6, 0.6, 0.13), loc=(0.04, s * 0.31, 0.33), material='paint', r=0.03, puff=0.018)
        P.pillow('back_cushion', (0.16, 0.6, 0.4), loc=(-D / 2 + 0.2, s * 0.31, 0.59), rot=(0, -10, 0), material='paint', r=0.04, puff=0.022)
        for (bz) in (0.52, 0.66):
            P.sphere('button', 0.01, loc=(-D / 2 + 0.29, s * 0.31, bz), material='paint_b', u=8, v=6, scale=(0.5, 1, 1))
    P.views = [('a', 30, 20), ('b', 160, 25)]


# ------------------------------------------------------------------------------------------------ the toilet

def nd_wc(P):
    """A toilet (Nomad Drive's WC-01, 1.16 m high): a glazed bowl on its pedestal (ceramic), a wooden seat and lid
    (paint_b) shut, a cistern up on the wall behind it with its chain and its pull, the pipe down to the bowl."""
    P.ao_distance = 0.12
    # the pedestal and the bowl
    P.lathe('pedestal', [(0.0, 0.0), (0.13, 0.0), (0.12, 0.03), (0.09, 0.12), (0.1, 0.26), (0.0, 0.3)], loc=(0.04, 0.0, 0.0), material='ceramic', segs=24,
            close='end', sharp=50.0)
    P.lathe('bowl', [(0.0, 0.22), (0.12, 0.24), (0.18, 0.3), (0.2, 0.36), (0.19, 0.39), (0.0, 0.39)], loc=(0.06, 0.0, 0.0), material='ceramic', segs=28,
                   close='end', sharp=50.0)
    P.box('tank_back', (0.14, 0.3, 0.12), (-0.13, 0.0, 0.33), 'ceramic', bev=0.02, segs=2)
    # the seat and its lid
    for (nm, z, t) in (('seat', 0.395, 0.018), ('lid', 0.415, 0.02)):
        P.cyl(nm, 0.2, t, loc=(0.06, 0.0, z), material='paint_b', segs=28, bev=0.006)
    P.box('hinge', (0.04, 0.14, 0.03), (-0.16, 0.0, 0.41), 'chrome', bev=0.006, segs=1)
    # the cistern on the wall, its pipe and its chain
    P.box('cistern', (0.18, 0.44, 0.24), (-0.24, 0.0, 1.03), 'ceramic', bev=0.02, segs=2)
    P.box('cistern_lid', (0.2, 0.46, 0.03), (-0.24, 0.0, 1.16), 'ceramic', bev=0.01, segs=1)
    for s in (-1, 1):
        P.box('bracket', (0.12, 0.03, 0.14), (-0.27, s * 0.16, 0.89), 'steel', bev=0.004, segs=1)
    P.tube('pipe', [(-0.2, 0.0, 0.91), (-0.2, 0.0, 0.5), (-0.13, 0.0, 0.39)], 0.022, 'steel', segs=10, bend=0.06)
    P.tube('chain', [(-0.16, 0.18, 1.0), (-0.12, 0.2, 0.72)], 0.003, 'steel', segs=4)
    P.lathe('pull', [(0.0, 0.0), (0.012, 0.0), (0.016, 0.03), (0.01, 0.06), (0.0, 0.065)], loc=(-0.12, 0.2, 0.66), material='paint_b', segs=10)
    P.views = [('a', 30, 15), ('b', 150, 15)]


# ------------------------------------------------------------------------------------------------ the wall shelf, the cabinet

def nd_wall_shelf(P):
    """A wall shelf (Nomad Drive's wall shelf 02, 0.73 m wide, 0.52 high, 0.14 deep): two planks (paint_b) on two
    shaped side boards (paint), hung by its back rail, its front +x."""
    P.ao_distance = 0.08
    D, W, Hh = 0.14, 0.72, 0.52
    for s in (-1, 1):
        prof = [(0.0, 0.0), (D * 0.55, 0.02), (D, 0.14), (D, 0.24), (D * 0.6, 0.3), (D, 0.36), (D, Hh - 0.02), (D * 0.7, Hh), (0.0, Hh)]
        bm = bmesh.new()
        n = len(prof)
        for (a, b) in ((s * (W / 2 - 0.02) - 0.009, s * (W / 2 - 0.02) + 0.009),):
            vs0 = [bm.verts.new((-D / 2 + x, a, z)) for (x, z) in prof]
            vs1 = [bm.verts.new((-D / 2 + x, b, z)) for (x, z) in prof]
            bm.faces.new(vs0)
            bm.faces.new(list(reversed(vs1)))
            for i in range(n):
                j = (i + 1) % n
                bm.faces.new((vs0[i], vs0[j], vs1[j], vs1[i]))
        P.mesh('side', bm, 'paint', bev=0.003, segs=1)
    for z in (0.02, 0.3):
        P.box('plank', (D, W - 0.02, 0.02), (0.0, 0.0, z + 0.01), 'paint_b', bev=0.004, segs=1)
    P.box('rail', (0.016, W - 0.04, 0.06), (-D / 2 + 0.008, 0.0, Hh - 0.05), 'paint', bev=0.004, segs=1)
    P.box('lip', (0.012, W - 0.06, 0.03), (D / 2 - 0.006, 0.0, 0.33 + 0.015), 'paint', bev=0.003, segs=1)
    P.views = [('a', 30, 15), ('b', 150, 15)]


def nd_cabinet(P):
    """A lowered ergonomic cupboard (0.78 m wide, 0.72 m top height): a painted carcass hollow behind its two shaker
    doors (P_door_a, P_door_b), a shelf inside, a plinth and a moulded top (paint_b)."""
    P.ao_distance = 0.22
    D, W, Hh = 0.6, 0.78, 0.685
    x1 = D / 2 - 0.02
    body = P.mesh('carcass', J.slab((D - 0.02, W, Hh - 0.07), (-0.01, 0.0, 0.07 + (Hh - 0.07) / 2), step=0.12), 'paint', bev=0.004)
    cav = bmesh.new()
    K.bm_cube(cav, (D - 0.06, W - 0.05, Hh - 0.13), matrix=Matrix.Translation((x1 - (D - 0.06) / 2 + 0.02, 0.0, 0.09 + (Hh - 0.13) / 2)))
    P.cut(body, cav)
    P.box('shelf', (D - 0.08, W - 0.06, 0.018), (-0.02, 0.0, 0.38), 'paint', bev=0.003, segs=1)
    P.box('plinth', (D - 0.06, W - 0.04, 0.07), (-0.03, 0.0, 0.035), 'trim', bev=0.004)
    P.box('top', (D + 0.03, W + 0.04, 0.035), (0.0, 0.0, Hh + 0.0175), 'paint_b', bev=0.008, segs=2)
    for (tag, y0, y1, hinge) in (('a', -W / 2 + 0.012, -0.004, -1), ('b', 0.004, W / 2 - 0.012, 1)):
        since = H.mark_since(P)
        H.panel(P, 'door', x1 + 0.011, y0, y1, 0.085, Hh - 0.015)
        H.knob(P, x1 + 0.022, y1 - 0.05 if hinge < 0 else y0 + 0.05, Hh * 0.62, 'ceramic', 0.015)
        P.mover(f'P_door_{tag}', P.statics[since:], (x1 + 0.011, y0 if hinge < 0 else y1, 0.0))
    P.views = [('a', 30, 18), ('b', 150, 24)]


MODELS = {
    'nd_nightstand': nd_nightstand,
    'nd_chair_fold': nd_chair_fold,
    'nd_dinner_table': nd_dinner_table,
    'nd_dinner_chair': nd_dinner_chair,
    'nd_stool': nd_stool,
    'nd_sofa_2': nd_sofa_2,
    'nd_wc': nd_wc,
    'nd_wall_shelf': nd_wall_shelf,
    'nd_cabinet': nd_cabinet,
}
MODELS = {k: H.settled(f) for k, f in MODELS.items()}


def _after(P, opts):
    J.COLORS.update(COLORS)
    J._after(P, opts)


def main(args):
    K.run(MODELS, args, after=_after, out_dir=OUT, geo=False)
