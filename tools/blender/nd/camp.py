"""
The camp site (docs/ND/PLAN.md, ND5): a prefab place of Nomad Drive's CampSite class (11 x 11 m, 1.7 m high; four
tents in a ring some 4.2-4.6 m round a camp fire, each tent's floor 1.7 x 1.75 m under 0.8 m of headroom, eight bare
patches of ground about it 3.4-7.3 m from the fire, three places on the fire where meat lies) in our own design:

    blender -b --factory-startup --python tools/blender/build.py -- nd/camp [camp] [--norender] [--noao] [--toon]

Four ridge tents of canvas (two in the place's colour, paint; two cream, paint_b) on their poles and guy lines, their
doors tied back towards the fire; the fire in a ring of stones, charred logs in its ash and a grill on two stones over it
(the meat lies on it), log benches round it, a split-log pile and a chopping stump by one tent, a clothes line between
two posts. The fire is a lamp the hand lights (its switch: the fire itself). Its frame and its card: nd/_nd.py.
"""
import math

import bmesh
from mathutils import Matrix, Vector

from parts import _kit as K
from parts._kit import V, mat4
from places import _common as C
from nd import _nd as N

TAU = math.tau
FIRE = (-0.25, 0.33)
# the tents: their middles (Nomad Drive's CampSite preset, its x and z)
TENTS = [(1.02, -3.64), (4.03, -0.78), (-0.22, 4.66), (-3.86, 3.12)]
TL, TW, TH = 1.75, 1.7, 0.8   # a tent's floor (along its ridge, across) and its height


def jit(k, a=0.0):
    return C.jit(k, a)


def tent(P, B, card, i, cx, cy):
    """A ridge tent standing at (cx, cy), its door towards the fire: canvas slopes and a closed back, the door's flaps
    rolled and tied back, the ridge pole and the two uprights, guy lines to pegs, a groundsheet; its floor's spots."""
    fx, fy = FIRE
    face = math.atan2(fy - cy, fx - cx)            # its door faces the fire
    mat = 'paint' if i % 2 == 0 else 'paint_b'
    R = Matrix.Rotation(face, 4, 'Z')
    T = Matrix.Translation((cx, cy, 0.0)) @ R

    def at(x, y, z):
        return T @ V((x, y, z))

    # (in the tent's own frame: +x out of its door, y across, z up; the ridge along x)
    hw = TW / 2 + 0.06
    for sg in (1, -1):
        bm = bmesh.new()
        a0 = at(-TL / 2 - 0.05, 0.0, TH)
        a1 = at(TL / 2 + 0.05, 0.0, TH)
        b0 = at(-TL / 2 - 0.05, sg * hw, 0.02)
        b1 = at(TL / 2 + 0.05, sg * hw, 0.02)
        vs = [bm.verts.new(p) for p in (a0, a1, b1, b0)]
        bm.faces.new(vs if sg > 0 else vs[::-1])
        bmesh.ops.solidify(bm, geom=bm.faces[:], thickness=0.012)
        P.mesh('canvas', bm, mat, sharp=40.0)
    # the closed back
    bm = bmesh.new()
    vs = [bm.verts.new(at(-TL / 2 - 0.04, s * hw * 0.98, 0.02)) for s in (1, -1)] + [bm.verts.new(at(-TL / 2 - 0.04, 0.0, TH - 0.01))]
    bm.faces.new(vs)
    bmesh.ops.solidify(bm, geom=bm.faces[:], thickness=0.01)
    P.mesh('canvas_back', bm, mat, sharp=40.0)
    # the door's flaps, rolled and tied back to each side
    for sg in (1, -1):
        a = at(TL / 2 + 0.05, sg * 0.12, TH - 0.08)
        b = at(TL / 2 + 0.05, sg * (hw - 0.08), 0.12)
        C.post(P, 'flap_roll', a, b, 0.045, mat, segs=8)
        C.post(P, 'tie', at(TL / 2 + 0.06, sg * 0.42, 0.45), at(TL / 2 + 0.07, sg * 0.44, 0.53), 0.01, 'fabric', segs=4)
    # the poles and the ridge, guy lines and pegs
    for x in (-TL / 2 - 0.05, TL / 2 + 0.05):
        C.post(P, 'pole', at(x, 0.0, 0.0), at(x, 0.0, TH + 0.08), 0.012, 'alu', segs=6)
        sx = 1 if x > 0 else -1
        p = at(x + sx * 0.55, 0.0, 0.0)
        C.post(P, 'guy', at(x, 0.0, TH + 0.06), p, 0.004, 'fabric', segs=4)
        C.post(P, 'peg', p + V((0, 0, -0.05)), p + V((0, 0, 0.06)), 0.01, 'steel', segs=4)
    for x in (-0.5, 0.5):
        for sg in (1, -1):
            p = at(x, sg * (hw + 0.45), 0.0)
            C.post(P, 'guy', at(x, sg * (hw - 0.25), TH * 0.35), p, 0.004, 'fabric', segs=4)
            C.post(P, 'peg', p + V((0, 0, -0.05)), p + V((0, 0, 0.06)), 0.01, 'steel', segs=4)
    # the groundsheet, a little proud of the canvas
    bm = bmesh.new()
    K.bm_cube(bm, (TL + 0.12, TW + 0.1, 0.012), matrix=T @ Matrix.Translation((0.0, 0.0, 0.006)))
    P.mesh('groundsheet', bm, 'fabric', sharp=40.0)
    # what one cannot walk through: the tent as a box; its floor's things
    c, s = math.cos(face), math.sin(face)
    card.solids.append(dict(u=N.r4(cx), v=N.r4(-cy), hx=N.r4(TL / 2 + 0.1), hz=N.r4(hw), y0=0.0, y1=N.r4(TH), turn=N.r4(-face)))
    for k, (lx, ly) in enumerate(((0.25, 0.4), (-0.35, -0.35))):
        x = cx + c * lx - s * ly
        y = cy + s * lx + c * ly
        card.spot(f't{i}_{"ab"[k]}', x, y, 0.012, math.degrees(face) + 180 + 25 * jit(i, k))


def fire(P, B, card):
    """The camp fire: a ring of stones, ash and charred logs in it, a grill on two flat stones over it."""
    fx, fy = FIRE
    n = 13
    for k in range(n):
        a = TAU * k / n + 0.12 * jit(k, 1.0)
        r = 0.55 + 0.04 * jit(k, 2.0)
        s = 0.16 + 0.04 * jit(k, 3.0)
        # (fire-blackened stones: dark, a rusty one between)
        N.bm_box(B['trim' if k % 3 else 'rust'], (fx + math.cos(a) * r, fy + math.sin(a) * r, s * 0.32), (s * 1.2, s, s * 0.7),
                 Matrix.Rotation(a + 0.4 * jit(k, 4.0), 3, 'Z'))
    # the ash bed and the logs burned down in it
    bm = bmesh.new()
    K.bm_cyl(bm, 0.47, 0.03, segs=20, matrix=Matrix.Translation((fx, fy, 0.015)))
    P.mesh('ash', bm, 'trim', sharp=40.0)
    for k in range(5):
        a = TAU * k / 5 + 0.3
        C.post(P, 'log', (fx + math.cos(a) * 0.36, fy + math.sin(a) * 0.36, 0.05), (fx + math.cos(a) * 0.04, fy + math.sin(a) * 0.04, 0.2),
               0.05 + 0.01 * jit(k, 5.0), 'wood' if k % 2 else 'trim', segs=7)
    for k in range(7):
        N.bm_box(B['rust'], (fx + 0.12 * jit(k, 6.0), fy + 0.12 * jit(k, 7.0), 0.04), (0.06, 0.05, 0.03), Matrix.Rotation(jit(k, 8.0) * 3, 3, 'Z'))
    # the grill: two flat stones, the grate across them
    for sg in (1, -1):
        N.bm_box(B['ceramic'], (fx + sg * 0.42, fy - 0.05, 0.12), (0.22, 0.26, 0.24), Matrix.Rotation(0.1 * sg, 3, 'Z'))
    gz = 0.25
    for k in range(7):
        y = fy - 0.2 + k * 0.4 / 6
        C.post(P, 'grate_bar', (fx - 0.48, y, gz), (fx + 0.48, y, gz), 0.006, 'steel', segs=5)
    for x in (fx - 0.46, fx + 0.46):
        C.post(P, 'grate_rail', (x, fy - 0.22, gz), (x, fy + 0.22, gz), 0.009, 'steel', segs=5)
    for k, dx in enumerate((-0.25, 0.02, 0.27)):
        card.spot(f'fire_{"abc"[k]}', fx + dx, fy - 0.02, gz + 0.01, 90 + 30 * jit(k, 9.0))
    card.box(fx - 0.7, fx + 0.7, fy - 0.7, fy + 0.7, 0.0, 0.3)
    # the fire's light, lit by the hand (the fire is its switch)
    P.empty('M_fire', loc=(fx, fy, 0.35))
    card.lamp('fire', fx, fy, 0.4, 8.0)
    card.switch('fire', fx, fy, 0.3, ['fire'])


def camp(P):
    card = N.Card('camp')
    B = N.new_set()
    for i, (x, y) in enumerate(TENTS):
        tent(P, B, card, i, x, y)
    fire(P, B, card)
    # log benches round the fire
    for k, a in enumerate((2.3, 4.1, 5.6)):
        r = 1.55
        cx, cy = FIRE[0] + math.cos(a) * r, FIRE[1] + math.sin(a) * r
        d = V((-math.sin(a), math.cos(a), 0.0))
        L = 1.1 + 0.15 * jit(k, 10.0)
        a0 = V((cx, cy, 0.2)) - d * (L / 2)
        a1 = V((cx, cy, 0.2)) + d * (L / 2)
        C.post(P, 'bench_log', a0, a1, 0.19, 'wood', segs=12)
        for sg in (-0.4, 0.4):
            p = V((cx, cy, 0.0)) + d * (L * sg)
            N.bm_box(B['wood'], (p.x, p.y, 0.05), (0.14, 0.32, 0.1), Matrix.Rotation(a, 3, 'Z'))
        card.solids.append(dict(u=N.r4(cx), v=N.r4(-cy), hx=N.r4(L / 2), hz=0.2, y0=0.0, y1=0.4, turn=N.r4(-(a + math.pi / 2))))
    # the split-log pile and the chopping stump by the back tent
    px, py = -4.6, -0.8
    for rw in range(4):
        for k in range(6 - rw):
            y = py - 0.55 + (k + 0.5 + rw * 0.5) * 0.19
            m = Matrix.Translation((px, y, 0.08 + rw * 0.15)) @ Matrix.Rotation(math.pi / 2, 4, 'Y') @ Matrix.Rotation(jit(k, rw) * 3, 4, 'Z')
            bm = bmesh.new()
            K.bm_cyl(bm, 0.075 + 0.01 * jit(k * 3, rw), 0.48, segs=6 if (k + rw) % 3 else 3, matrix=m)
            P.mesh('split_log', bm, 'wood', sharp=50.0)
    card.box(px - 0.3, px + 0.3, py - 0.65, py + 0.65, 0.0, 0.62)
    C.post(P, 'stump', (px + 0.9, py - 0.95, 0.0), (px + 0.9, py - 0.95, 0.42), 0.22, 'wood', segs=12)
    C.post(P, 'axe_haft', (px + 0.86, py - 0.98, 0.45), (px + 0.65, py - 1.15, 0.98), 0.016, 'wood', segs=8)
    N.bm_box(B['steel'], (px + 0.88, py - 0.96, 0.43), (0.15, 0.03, 0.08), Matrix.Rotation(0.6, 3, 'Z'))
    card.post(px + 0.9, py - 0.95, 0.24, 0.0, 0.42)
    # a clothes line between two posts, a towel and a shirt on it
    a, b = V((2.2, 2.9, 0.0)), V((4.6, 1.6, 0.0))
    for p in (a, b):
        C.post(P, 'line_post', p, p + V((0, 0, 1.75)), 0.04, 'wood', segs=8)
        card.post(p.x, p.y, 0.06, 0.0, 1.75)
    C.post(P, 'line', a + V((0, 0, 1.68)), b + V((0, 0, 1.68)), 0.004, 'fabric', segs=4)
    d = (b - a).normalized()
    for t, (w, h, m) in ((0.3, (0.42, 0.55, 'paint')), (0.62, (0.36, 0.42, 'paint_b'))):
        p = a + (b - a) * t + V((0, 0, 1.68 - h / 2))
        bm = bmesh.new()
        K.bm_cube(bm, (w, 0.012, h), matrix=Matrix.Translation(p) @ Matrix.Rotation(math.atan2(d.y, d.x), 4, 'Z'))
        P.mesh('laundry', bm, m, sharp=40.0)
    # the bare patches of ground about it (Nomad Drive's eight, where things are left)
    patches = [(3.6, 3.9, 20), (5.3, 0.8, -30), (4.2, -3.6, 70), (-1.6, -4.5, 120), (-4.5, 1.2, 180), (-2.2, 5.4, 210), (1.5, 6.1, 260), (-5.6, -3.0, 140)]
    for k, (x, y, f) in enumerate(patches):
        card.spot(f'ground_{"abcdefgh"[k]}', x, y, 0.0, f)
        if k in (0, 2, 4):
            card.spot(f'ground_{"abcdefgh"[k]}2', x + 0.6 * math.cos(math.radians(f + 90)), y + 0.6 * math.sin(math.radians(f + 90)), 0.0, f + 60)
    N.finish_bms(P, B)
    P.views = [('a', -130, 25), ('b', 40, 30)]
    card.extra['plinth'] = 0.0
    return card, (11.0, 11.0, 1.7), {}


TABLE = {'camp': camp}


def main(args):
    N.run(TABLE, args)
