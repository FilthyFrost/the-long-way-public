"""
The old graveyard (docs/ND/PLAN.md, ND6): a prefab place of Nomad Drive's Graveyard class (10.22 x 9.95 m, 4.62 m
high; eight stone tombs in two rows of four — four kinds: 1.10 x 2.09 m with a headstone to 2.17 m, 1.10 x 2.09 m,
1.22 x 2.19 m with a flat lid, 1.03 x 2.38 x 0.61 m — their lids sliding aside 0.45–0.51 m, 1.2 s open, 1.0 s shut,
never locked nor stuck, what is in them out of reach while they are shut; four wooden crosses; an L of iron railing 2 m
high on posts of 2.46 m; a lamp post of 4.56 m lighting it from seven in the evening) in our own design:

    blender -b --factory-startup --python tools/blender/build.py -- nd/graveyard [graveyard] [--norender] [--noao] [--toon]

The tombs in weathered stone (paint: the place's stone) on their plinths, moss in their joints (rust), the headstone of
the first kind carved round; the railing of black iron pickets with spear points; the crosses of wood leaning a little;
the lamp's post of iron with its cold lamp. Its frame and its card: nd/_nd.py.
"""
import math

import bmesh
from mathutils import Matrix, Vector

from parts import _kit as K
from parts._kit import V
from places import _common as C
from nd import _nd as N
from nd._nd import Face, face_box
from nd import _props as Pr

# the four kinds of tomb (Nomad Drive's Tomb-01…04): width, length, height, how far the lid slides, a headstone's top
KINDS = {
    1: (1.10, 2.09, 0.70, 0.51, 2.17),
    2: (1.10, 2.09, 0.70, 0.51, None),
    3: (1.22, 2.19, 0.66, 0.46, None),
    4: (1.03, 2.38, 0.61, 0.45, None),
}
LAYOUT = [(1, -3.6, 1.7), (2, -1.2, 1.7), (3, 1.2, 1.7), (4, 3.6, 1.7), (2, -3.6, -1.7), (4, -1.2, -1.7), (3, 1.2, -1.7), (1, 3.6, -1.7)]


def jit(k, a=0.0):
    return C.jit(k, a)


def tomb(P, B, card, i, kind, x, y):
    """a tomb: its plinth, its chest of stone hollow inside, its lid (DOOR_tomb<i>) that slides aside along X; the
    head's stone of the first kind; moss in its joints; the place in it and, on a flat lid, on it"""
    w, L, h, slide, head = KINDS[kind]
    t = 0.08
    # the plinth and the chest's four walls (its inside open under the lid), the floor in it
    N.bm_box(B['paint'], (x, y, 0.06), (w + 0.16, L + 0.16, 0.12))
    for (cx, cy, sx, sy) in ((x, y - L / 2 + t / 2, w, t), (x, y + L / 2 - t / 2, w, t), (x - w / 2 + t / 2, y, t, L - 2 * t), (x + w / 2 - t / 2, y, t, L - 2 * t)):
        N.bm_box(B['paint'], (cx, cy, 0.12 + (h - 0.2) / 2), (sx, sy, h - 0.2))
    N.bm_box(B['trim'], (x, y, 0.16), (w - 2 * t, L - 2 * t, 0.04))
    for z in (0.14, h - 0.09):
        N.bm_box(B['trim'], (x, y, z), (w + 0.01, L + 0.01, 0.025))
    card.box(x - w / 2 - 0.08, x + w / 2 + 0.08, y - L / 2 - 0.08, y + L / 2 + 0.08, -0.3, h - 0.08)
    card.spot(f'in{i}', x, y + 0.2 * jit(i, 1.0), 0.18, 90 + 40 * jit(i, 2.0))
    # the lid: a slab over it (kind 3 flat, the others with a raised middle), sliding aside towards +X
    since = len(P.statics)
    lz = h - 0.08
    P.box('tomb_lid', (w + 0.06, L + 0.06, 0.09), (x, y, lz + 0.045), 'paint', bev=0.012, segs=2)
    if kind != 3:
        P.box('tomb_ridge', (w * 0.55, L * 0.85, 0.07), (x, y, lz + 0.12), 'paint', bev=0.02, segs=2)
        P.box('tomb_cross', (0.08, L * 0.5, 0.025), (x, y, lz + 0.165), 'trim', bev=0.006)
    P.mover(f'DOOR_tomb{i}', P.statics[since:], (x, y, lz))
    card.door(f'DOOR_tomb{i}', (x, y), w, 0.1, slide, lz + 0.1, (1.0, 0.0), 1, pry='none', z0=lz, secs=1.2, shut_secs=1.0,
              slide=True, mat='stone', box=(x - w / 2 + t, x + w / 2 - t, y - L / 2 + t, y + L / 2 - t, 0.12, h - 0.08))
    if kind == 3:
        card.spot(f'lid{i}', x - 0.15, y + 0.3, lz + 0.09, 60 + 30 * jit(i, 3.0))
    # the first kind's headstone at its head (the -Y end of the near row's, the +Y end of the far row's), carved round
    if head:
        hy = y + (L / 2 + 0.12) * (1 if y > 0 else -1)
        bm = bmesh.new()
        prof = [(-0.42, 0.0), (0.42, 0.0), (0.42, head - 0.42)] + [(0.42 * math.cos(a), head - 0.42 + 0.42 * math.sin(a)) for a in [math.pi * k / 10 for k in range(1, 10)]] + [(-0.42, head - 0.42)]
        K.bm_prism(bm, prof, 0.16, matrix=Matrix.Translation((x, hy, 0.0)) @ Matrix.Rotation(math.pi / 2, 4, 'X'))
        P.mesh('headstone', bm, 'paint', sharp=30.0)
        N.bm_box(B['paint'], (x, hy, 0.08), (1.0, 0.36, 0.16))
        N.bm_box(B['trim'], (x, hy + (0.085 if y > 0 else -0.085), head - 0.75), (0.5, 0.01, 0.06))
        card.box(x - 0.5, x + 0.5, hy - 0.18, hy + 0.18, -0.3, head)


def graveyard(P):
    card = N.Card('graveyard')
    B = N.new_set()
    for i, (kind, x, y) in enumerate(LAYOUT):
        tomb(P, B, card, i, kind, x, y)
    # four wooden crosses along the east, leaning a little; their mounds
    for k, (x, y) in enumerate(((-4.6, 4.1), (-2.8, 4.2), (2.9, 4.0), (4.6, 4.2))):
        Pr.headstone(P, B, card, x, y, 'wood', face=-90.0 + 10 * jit(k, 4.0), k=k)
    # the iron railing along the west and the north: pickets with spear points between posts
    west = [(-5.0, -4.85), (-5.0, 4.85)]
    north = [(-5.0, 4.85), (5.0, 4.85)]
    for line in (west, north):
        a, b = V((line[0][0], line[0][1], 0.0)), V((line[1][0], line[1][1], 0.0))
        d = (b - a).normalized()
        n = 5
        for k in range(n + 1):
            p = a + (b - a) * (k / n)
            N.bm_box(B['trim'], (p.x, p.y, 1.23), (0.12, 0.12, 2.46))
            P.sphere('post_cap', 0.09, loc=(p.x, p.y, 2.52), material='trim', u=10, v=6)
            card.box(p.x - 0.07, p.x + 0.07, p.y - 0.07, p.y + 0.07, -0.3, 2.46)
        for k in range(n):
            p0 = a + (b - a) * (k / n)
            p1 = a + (b - a) * ((k + 1) / n)
            for z in (0.25, 1.75):
                C.post(P, 'fence_rail', p0 + V((0, 0, z)), p1 + V((0, 0, z)), 0.018, 'trim', segs=6)
            m = int((p1 - p0).length / 0.16)
            for j in range(1, m):
                q = p0 + (p1 - p0) * (j / m)
                C.post(P, 'picket', q + V((0, 0, 0.05)), q + V((0, 0, 1.95)), 0.012, 'trim', segs=6)
                bm = bmesh.new()
                K.bm_cyl(bm, 0.035, 0.1, segs=4, r2=0.0, matrix=Matrix.Translation(q + V((0, 0, 1.95))))
                P.mesh('spear', bm, 'trim', sharp=30.0)
        mid = (a + b) / 2
        card.box(min(a.x, b.x) - 0.03, max(a.x, b.x) + 0.03, min(a.y, b.y) - 0.03, max(a.y, b.y) + 0.03, -0.3, 2.0)
    # the lamp post at the open corner, its cold lamp lighting the graves
    lx, ly = 4.6, -4.4
    C.post(P, 'lamp_post', (lx, ly, 0.0), (lx, ly, 4.4), 0.07, 'trim', segs=10)
    N.bm_box(B['trim'], (lx, ly, 0.2), (0.34, 0.34, 0.4))
    C.post(P, 'lamp_arm', (lx, ly, 4.3), (lx - 0.7, ly + 0.55, 4.42), 0.035, 'trim', segs=8)
    P.box('lamp_head', (0.34, 0.26, 0.14), (lx - 0.75, ly + 0.6, 4.4), 'trim', rot=(0, 0, 38), bev=0.02, segs=2)
    from nd import station as S
    S.lit_panel(P, 'lamp_glass', 'lamp', (0.26, 0.18, 0.02), (lx - 0.75, ly + 0.6, 4.32))
    card.post(lx, ly, 0.12, -0.3, 4.5)
    card.lamp('lamp', lx - 0.75, ly + 0.6, 4.3, 16.0, warm=False, hours=(19, 6), color=0xdce8ff)
    # the ground's spots: about the tombs and along the railing
    for k, (x, y, f) in enumerate(((-4.4, -0.1, 0), (0.0, 0.1, 90), (4.6, 0.0, 180), (-2.4, -3.9, 270), (2.4, -3.6, 300), (0.0, 3.9, 120))):
        card.spot(f'g_{"abcdef"[k]}', x, y, 0.0, f)
    N.finish_bms(P, B)
    P.views = [('a', -55, 25), ('b', 40, 30), ('c', 150, 25)]
    card.extra['plinth'] = 0.0
    movers = {d['name']: dict(move='slide', axis='x', open=float(d['open'])) for d in card.doors}
    return card, (10.22, 9.95, 4.62), movers


TABLE = {'graveyard': graveyard}


def main(args):
    N.run(TABLE, args)
