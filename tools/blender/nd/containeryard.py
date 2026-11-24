"""
The container yard (docs/ND/PLAN.md, ND6): a prefab place of Nomad Drive's ContainerPack-01 (23.28 x 20.75 m, 6.66 m
high; eight shipping containers of 2.29 x 6.05 x 2.60 m lying at 0, 45, 90, 135, 180 and 315 degrees, one stacked on
another; each with two doors of 1.14 x 2.39 m swinging out 90 degrees in 0.4 s, the left one stuck one time in four and
the right one as the left; a pole of 8.71 m with two floodlights at 6.2 m lit from nine at night to seven in the
morning, reaching 20 m; its things on the containers' floors, two and up to four more in each, three and up to twelve
more on their roofs, four and up to twelve more on the ground) in our own design:

    blender -b --factory-startup --python tools/blender/build.py -- nd/containeryard [containeryard] [--norender] [--noao] [--toon]

The containers in the yard's two colours, one rusted, one bare aluminium, their walls corrugated, their corner posts
and castings dark; the floodlights' pole of galvanised steel with its cable down to a box; a cable reel, a stack of
pallets, oil drums and a pile of tyres about the yard. Its frame and its card: nd/_nd.py; the container: nd/_props.py.
"""
import math

import bmesh
from mathutils import Matrix, Vector

from parts import _kit as K
from parts._kit import V
from places import _common as C
from nd import _nd as N
from nd import _props as Pr

L, W, H = 6.05, 2.29, 2.60
# the containers (Blender frame: x along the road, +y towards it): their middles, their headings (their doors at the
# end they head to), what they are of, on what they lie
YARD = [
    ('c1', -8.2, -5.6, 0.0, 90.0, 'paint'),
    ('c2', -8.2, -5.6, H, 90.0, 'paint_b'),
    ('c3', -4.9, -5.6, 0.0, 90.0, 'rust'),
    ('c4', 1.0, -7.9, 0.0, 0.0, 'paint_b'),
    ('c5', 8.3, -3.2, 0.0, 135.0, 'paint'),
    ('c6', 7.6, 5.0, 0.0, 180.0, 'alu'),
    ('c7', -6.4, 5.8, 0.0, 315.0, 'paint_b'),
    ('c8', -0.6, 1.2, 0.0, 45.0, 'paint'),
]
POLE = (10.6, 8.6)
POLE_H = 8.71
FLOOD_Z = 6.2


def local(c, lx, ly):
    """a point of a container's own frame (x along it towards its doors) in the yard's"""
    _, x, y, _, yaw, _ = c
    a = math.radians(yaw)
    return (x + math.cos(a) * lx - math.sin(a) * ly, y + math.sin(a) * lx + math.cos(a) * ly)


def containers(P, B, card):
    for c in YARD:
        name, x, y, z, yaw, mat = c
        Pr.container(P, B, card, name, x, y, z, yaw=yaw, size=(L, W, H), mat=mat, pry='stuck', stacked=z > 0.01, secs=0.4)
        # where things are left on its floor: two by its doors, two in the middle, two at its far end; on its roof two
        fl = z + 0.155
        for k, (lx, ly) in enumerate(((L / 2 - 0.8, 0.55), (L / 2 - 0.9, -0.55), (0.3, 0.6), (-0.2, -0.6), (-L / 2 + 0.8, 0.5), (-L / 2 + 0.9, -0.55))):
            px, py = local(c, lx, ly)
            card.spot(f'{name}_{"abcdef"[k]}', px, py, fl, yaw + 90 + 70 * C.jit(k, x))
        if name != 'c1':
            for k, (lx, ly) in enumerate(((1.4, 0.3), (-1.6, -0.35))):
                px, py = local(c, lx, ly)
                card.spot(f'{name}_roof{"ab"[k]}', px, py, z + H, yaw + 40 * C.jit(k, y))


def floodlights(P, B, card):
    """the floodlights' pole: galvanised steel with its foot, its climbing pegs, its cross-arm and two floodlights
    turned on the yard, the cable down to its box"""
    px, py = POLE
    aim = math.atan2(-py, -px)
    dx, dy = math.cos(aim), math.sin(aim)
    nx, ny = -dy, dx
    N.bm_box(B['ceramic'], (px, py, 0.15), (0.7, 0.7, 0.3))
    card.box(px - 0.35, px + 0.35, py - 0.35, py + 0.35, -0.3, 0.3)
    P.cyl('pole', 0.13, POLE_H - 0.3, (px, py, 0.3 + (POLE_H - 0.3) / 2), 'alu', segs=14, r2=0.085)
    card.post(px, py, 0.16, -0.3, POLE_H)
    for k in range(4):
        P.box('pole_bolt', (0.06, 0.06, 0.08), (px + 0.26 * math.cos(k * math.pi / 2 + 0.78), py + 0.26 * math.sin(k * math.pi / 2 + 0.78), 0.34), 'steel', bev=None)
    # its pegs, side to side from 2.4 m (no ladder: Nomad Drive's pole is not climbed)
    for k in range(int((FLOOD_Z - 2.6) / 0.42)):
        z = 2.6 + k * 0.42
        s = 1 if k % 2 else -1
        C.post(P, 'pole_peg', (px, py, z), (px + nx * 0.28 * s, py + ny * 0.28 * s, z), 0.014, 'steel', segs=5)
    # the cross-arm and its two floodlights, tilted down onto the yard
    za = FLOOD_Z + 0.25
    C.post(P, 'pole_arm', (px - nx * 0.85, py - ny * 0.85, za), (px + nx * 0.85, py + ny * 0.85, za), 0.04, 'alu', segs=8)
    C.post(P, 'pole_brace', (px, py, za - 0.6), (px + nx * 0.6, py + ny * 0.6, za), 0.022, 'alu', segs=6)
    C.post(P, 'pole_brace', (px, py, za - 0.6), (px - nx * 0.6, py - ny * 0.6, za), 0.022, 'alu', segs=6)
    tilt = 38.0
    for i, s in enumerate((-0.6, 0.6)):
        # (the two splayed a little, their beams falling 8 m off on either side of the yard's middle)
        ai = aim + math.radians(14.0) * (1 if s > 0 else -1)
        R = Matrix.Rotation(ai, 3, 'Z') @ Matrix.Rotation(math.radians(tilt), 3, 'Y')
        cx, cy = px + nx * s + dx * 0.18, py + ny * s + dy * 0.18
        c = V((cx, cy, FLOOD_Z))
        N.bm_box(B['trim'], c, (0.22, 0.56, 0.42), R)
        N.bm_box(B['trim'], c - R @ V((0.14, 0.0, 0.0)), (0.06, 0.4, 0.3), R)
        for k in range(5):
            N.bm_box(B['trim'], c - R @ V((0.14, -0.16 + 0.08 * k, 0.0)), (0.1, 0.015, 0.34), R)
        C.post(P, 'flood_yoke', (cx - dx * 0.18, cy - dy * 0.18, za), (cx, cy, FLOOD_Z + 0.2), 0.02, 'steel', segs=6)
        g = c + R @ V((0.115, 0.0, 0.0))
        name = 'flood_' + 'ab'[i]
        o = P.box(f'{name}_glass', (0.02, 0.48, 0.34), tuple(g), 'glass', rot=(0, tilt, math.degrees(ai)), bev=None)
        P.mover(f'N_lit_{name}', [o], tuple(g))
        far = g.z / math.tan(math.radians(tilt))
        card.lamp(name, g.x, g.y, g.z, 20.0, warm=False, hours=(21, 7), color=0xeaf0ff,
                  aim=(g.x + math.cos(ai) * far, g.y + math.sin(ai) * far))
    # the cable down the pole to its box
    C.post(P, 'pole_cable', (px + dx * 0.14, py + dy * 0.14, 1.7), (px + dx * 0.11, py + dy * 0.11, za), 0.012, 'rubber', segs=5)
    P.box('pole_box', (0.16, 0.34, 0.46), (px + dx * 0.2, py + dy * 0.2, 1.45), 'paint_b', rot=(0, 0, math.degrees(aim)), bev=0.01)
    P.box('pole_box_lid', (0.02, 0.3, 0.42), (px + dx * 0.29, py + dy * 0.29, 1.45), 'trim', rot=(0, 0, math.degrees(aim)), bev=0.004)


def props(P, B, card):
    """what else lies about a yard: a cable reel on its rim, a stack of pallets, oil drums, a pile of tyres"""
    # the cable reel, its axle along X
    rx, ry = -2.3, -9.5
    for s in (-0.38, 0.38):
        P.cyl('reel_side', 0.62, 0.05, (rx + s, ry, 0.62), 'wood', axis=(1, 0, 0), segs=20)
    P.cyl('reel_drum', 0.3, 0.72, (rx, ry, 0.62), 'wood', axis=(1, 0, 0), segs=16)
    P.cyl('reel_cable', 0.42, 0.66, (rx, ry, 0.62), 'rubber', axis=(1, 0, 0), segs=18)
    card.box(rx - 0.42, rx + 0.42, ry - 0.62, ry + 0.62, -0.3, 1.24)
    # the pallets, stacked askew
    qx, qy = 8.6, 8.9
    for k in range(5):
        a = math.radians(8 * C.jit(k, 5.0))
        R = Matrix.Rotation(a, 3, 'Z')
        z = 0.145 * k
        for j in range(5):
            N.bm_box(B['wood'], V((qx, qy, z + 0.13)) + R @ V((0.0, -0.48 + 0.24 * j, 0.0)), (1.2, 0.1, 0.022), R)
        for j in (-0.5, 0.0, 0.5):
            N.bm_box(B['wood'], V((qx, qy, z + 0.065)) + R @ V((j, 0.0, 0.0)), (0.1, 1.0, 0.1), R)
    card.box(qx - 0.65, qx + 0.65, qy - 0.55, qy + 0.55, -0.3, 0.73)
    card.spot('pallets', qx, qy, 0.73, 200)
    # the oil drums by the back, one fallen
    for k, (x, y) in enumerate(((-10.6, -1.5), (-10.0, -1.9))):
        P.cyl('drum', 0.29, 0.88, (x, y, 0.44), 'paint_b', segs=16)
        for z in (0.29, 0.59):
            P.torus('drum_hoop', 0.293, 0.012, loc=(x, y, z), material='trim', segs=16, rsegs=4)
        card.post(x, y, 0.3, -0.3, 0.88)
    P.cyl('drum', 0.29, 0.88, (-9.8, -0.9, 0.29), 'rust', axis=(0.9, 0.44, 0), segs=16)
    card.solids.append(dict(u=N.r4(-9.8), v=N.r4(0.9), hx=0.44, hz=0.3, y0=-0.3, y1=0.58, turn=N.r4(-math.atan2(0.44, 0.9))))
    # the tyres, a pile of five
    tx, ty = 3.6, 9.3
    for k in range(5):
        P.torus('tyre', 0.34, 0.11, loc=(tx + 0.04 * C.jit(k, 6.0), ty + 0.04 * C.jit(k, 7.0), 0.11 + 0.2 * k), material='rubber', segs=18, rsegs=6)
    card.post(tx, ty, 0.46, -0.3, 1.05)
    card.spot('tyres', tx, ty, 1.05, 90)


def containeryard(P):
    card = N.Card('containeryard')
    B = N.new_set()
    containers(P, B, card)
    floodlights(P, B, card)
    props(P, B, card)
    # the ground's spots: in the lanes between the containers, about the pole and the drums
    for k, (x, y, f) in enumerate(((-1.6, -4.6, 0), (6.2, -9.2, 60), (2.4, 6.6, 120), (-10.3, 0.8, 200), (10.2, 2.0, 260),
                                   (-3.0, 9.0, 320), (6.0, 9.2, 30), (-10.6, -9.6, 90), (3.6, -3.4, 150), (-6.0, 1.0, 240))):
        card.spot(f'g_{"abcdefghij"[k]}', x, y, 0.0, f)
    N.finish_bms(P, B)
    P.views = [('a', -60, 28), ('b', 35, 32), ('c', 150, 26)]
    card.extra['plinth'] = 0.0
    movers = {d['name']: dict(move='hinge', axis='y', open=float(d['open'])) for d in card.doors}
    return card, (23.28, 20.75, 6.66), movers


TABLE = {'containeryard': containeryard}


def main(args):
    N.run(TABLE, args)
