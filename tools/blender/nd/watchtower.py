"""
The watch tower (docs/ND/PLAN.md, ND6): a prefab place of Nomad Drive's WatchTower class (7.99 x 7.99 m, 9.58 m high;
a timber frame 7.04 m tall, three flights of twelve treads 0.72 m wide up its sides — landings at 2.33 and 4.60 m —
to a walkway about a metre wide round the cabin 6.97 m up, its railing 1.07 m high; the cabin 5.72 x 5.72 m on its
floor at 7.04 m, its windows from 7.87 to 8.93 m all round, its roof at 9.55–9.69 m; its wooden door 90° in 1.0 s,
never locked; a lamp hanging in it, lit from seven in the evening) in our own design:

    blender -b --factory-startup --python tools/blender/build.py -- nd/watchtower [watchtower] [--norender] [--noao] [--toon]

A fire lookout of timber: four tall posts braced in X on every face, the stairs up three of its sides, the walkway of
boards round a cabin of siding in the tower's colour (paint), windows all round, a low hip roof of tin; inside the
fire finder on its stand, a cot, a stool. Its frame and its card: nd/_nd.py; the cabin's walls: nd/_house.py.
"""
import math

import bmesh
from mathutils import Matrix, Vector

from parts import _kit as K
from parts._kit import V
from places import _common as C
from nd import _nd as N
from nd._nd import Face, face_box
from nd import _house as Hs

WALK, CAB = 6.97, 7.04
P_OUT = 3.75                       # the posts' corners
C_HALF = 2.86                      # the cabin's half side
W_OUT = 3.89                       # the walkway's outer edge


def jit(k, a=0.0):
    return C.jit(k, a)


def frame(P, B, card):
    """the four posts and their braces on every face, the joists under the walkway"""
    for sx in (-1, 1):
        for sy in (-1, 1):
            x, y = sx * P_OUT, sy * P_OUT
            N.bm_box(B['wood'], (x, y, WALK / 2), (0.26, 0.26, WALK))
            N.bm_box(B['ceramic'], (x, y, 0.1), (0.5, 0.5, 0.3))
            card.box(x - 0.15, x + 0.15, y - 0.15, y + 0.15, -0.3, WALK)
    # X braces on the four faces, two bays high; a girt at each landing's height
    for (a, b, out) in (((-P_OUT, -P_OUT), (P_OUT, -P_OUT), (0, -1)), ((P_OUT, -P_OUT), (P_OUT, P_OUT), (1, 0)),
                        ((P_OUT, P_OUT), (-P_OUT, P_OUT), (0, 1)), ((-P_OUT, P_OUT), (-P_OUT, -P_OUT), (-1, 0))):
        o = V((out[0] * 0.15, out[1] * 0.15, 0.0))
        pa, pb = V((a[0], a[1], 0.0)) + o, V((b[0], b[1], 0.0)) + o
        for (z0, z1) in ((0.4, 3.5), (3.5, 6.8)):
            C.plank(P, 'brace', pa + V((0, 0, z0)), pb + V((0, 0, z1)), 0.12, 0.06, 'wood', up=(out[0], out[1], 0), bev=0.004, floor=False)
            C.plank(P, 'brace', pb + V((0, 0, z0)), pa + V((0, 0, z1)), 0.12, 0.06, 'wood', up=(out[0], out[1], 0), bev=0.004, floor=False)
        for z in (3.5, 6.85):
            C.plank(P, 'girt', pa + V((0, 0, z)), pb + V((0, 0, z)), 0.16, 0.08, 'wood', up=(out[0], out[1], 0), bev=0.004, floor=False)
    for k in range(9):
        x = -W_OUT + k * (2 * W_OUT) / 8
        N.bm_box(B['wood'], (x, 0.0, WALK - 0.14), (0.08, 2 * W_OUT, 0.16))


def stairs(P, B, card):
    """three flights of twelve up three sides inside the posts, their landings at the corners, their rails"""
    w = 0.72
    # (flight 1 along the south side going east; 2 up the east side going north; 3 along the north side going west)
    Hs.stair(P, B, card, -3.33, -2.2, 1.0, 0.05, 2.27, w=w, along='x')
    Hs.upper_floor(P, B, card, 1.0, -3.75, 2.6, -2.9, 2.33)
    Hs.stair(P, B, card, 3.33, -2.9, 0.3, 2.35, 4.56, w=w, along='y')
    Hs.upper_floor(P, B, card, 2.95, 0.3, 3.75, 1.9, 4.60)
    Hs.stair(P, B, card, 3.33, 2.6, -0.6, 4.68, 6.89, w=w, along='x')
    # the hand rails up each flight, on its open side
    for (a, b) in ((((-2.2, -2.95, 0.05)), (1.0, -2.95, 2.27)), ((2.95, -2.9, 2.35), (2.95, 0.3, 4.56)), ((2.6, 2.95, 4.68), (-0.6, 2.95, 6.89))):
        C.post(P, 'stair_rail', V(a) + V((0, 0, 0.95)), V(b) + V((0, 0, 0.95)), 0.022, 'wood', segs=6)
        for t in (0.0, 0.5, 1.0):
            p = V(a) + (V(b) - V(a)) * t
            C.post(P, 'stair_post', p, p + V((0, 0, 0.95)), 0.025, 'wood', segs=6)


def walkway(P, B, card):
    """the walkway round the cabin: its boards (an opening where the third flight comes up), its railing all round"""
    # the four strips (south, north, west, east) between the cabin's walls and the edge; the north one cut for the stair
    hole = (-0.7, 1.5)
    strips = [(-W_OUT, W_OUT, -W_OUT, -C_HALF), (-W_OUT, -C_HALF, -C_HALF, C_HALF), (C_HALF, W_OUT, -C_HALF, C_HALF),
              (-W_OUT, hole[0], C_HALF, W_OUT), (hole[1], W_OUT, C_HALF, W_OUT)]
    for (x0, x1, y0, y1) in strips:
        n = max(1, int((x1 - x0) / 0.14))
        for i in range(n):
            x = x0 + (i + 0.5) * (x1 - x0) / n
            N.bm_box(B['wood'], (x, (y0 + y1) / 2, WALK - 0.02), ((x1 - x0) / n - 0.006, y1 - y0, 0.04))
        card.box(x0, x1, y0, y1, WALK - 0.25, WALK, floor=True)
    # (a little lip over the stair's head, and its railing round the opening's sides)
    for x in hole:
        C.post(P, 'hole_rail', (x, C_HALF, WALK + 0.95), (x, W_OUT, WALK + 0.95), 0.022, 'wood', segs=6)
        C.post(P, 'hole_post', (x, W_OUT, WALK), (x, W_OUT, WALK + 0.95), 0.03, 'wood', segs=6)
    # the railing: posts and two rails all round its edge, open where the stair comes up
    edges = [((-W_OUT, -W_OUT), (W_OUT, -W_OUT)), ((W_OUT, -W_OUT), (W_OUT, W_OUT)), ((-W_OUT, W_OUT), (-W_OUT, -W_OUT))]
    edges += [((W_OUT, W_OUT), (hole[1], W_OUT)), ((hole[0], W_OUT), (-W_OUT, W_OUT))]
    for (a, b) in edges:
        pa, pb = V((a[0], a[1], WALK)), V((b[0], b[1], WALK))
        L = (pb - pa).length
        n = max(1, int(L / 1.3))
        for k in range(n + 1):
            p = pa + (pb - pa) * (k / n)
            C.post(P, 'rail_post', p, p + V((0, 0, 1.07)), 0.035, 'wood', segs=6)
        for z in (1.07, 0.55):
            C.plank(P, 'rail', pa + V((0, 0, z)), pb + V((0, 0, z)), 0.09, 0.04, 'wood', up=(0, 0, 1), bev=0.004, floor=False)
        card.box(min(pa.x, pb.x) - 0.04, max(pa.x, pb.x) + 0.04, min(pa.y, pb.y) - 0.04, max(pa.y, pb.y) + 0.04, WALK, WALK + 1.07)


def cabin(P, B, card):
    """the cabin: windows all round, its door on the south side; inside the fire finder, a cot, a stool; its lamp"""
    h = Hs.House(P, B, card, 'cab', -C_HALF, -C_HALF, C_HALF, C_HALF, 9.38 - CAB, pitch=22.0, ridge='x', z0=CAB, ground=CAB - 0.1, t=0.12)
    for f in ('n', 'e', 'w'):
        for (s0, s1) in ((0.35, 1.95), (2.06, 3.66), (3.77, 5.37)):
            h.window(f, s0, s1, 0.83, 1.89, rows=1, cols=2)
    h.window('s', 0.35, 1.95, 0.83, 1.89, rows=1, cols=2)
    h.window('s', 3.77, 5.37, 0.83, 1.89, rows=1, cols=2)
    h.door('s', 2.41, 3.31, 'cabin', h=1.92, hinge='lo', pry='none', mat='paint', open_deg=90.0)
    h.build(expo=0.22, board=0.2, sill=False)
    # (the door Nomad Drive's: a wooden one, a second to open)
    card.doors[-1]['secs'] = 1.0
    # the fire finder: a round table on its post, the map and the sighting ring on it
    C.post(P, 'finder_post', (0.0, 0.0, CAB), (0.0, 0.0, CAB + 0.95), 0.08, 'wood', segs=10)
    P.cyl('finder_top', 0.45, 0.05, loc=(0.0, 0.0, CAB + 0.98), material='wood', segs=24)
    P.cyl('finder_map', 0.4, 0.008, loc=(0.0, 0.0, CAB + 1.006), material='paint_b', segs=24)
    P.torus('finder_ring', 0.42, 0.012, loc=(0.0, 0.0, CAB + 1.03), material='chrome', segs=32, rsegs=4)
    for sg in (-1, 1):
        C.post(P, 'finder_sight', (sg * 0.4, 0.0, CAB + 1.02), (sg * 0.4, 0.0, CAB + 1.18), 0.008, 'chrome', segs=4)
    card.post(0.0, 0.0, 0.48, CAB, CAB + 1.0)
    card.spot('finder', 0.18, 0.12, CAB + 1.01, 40)
    # a cot along the west wall, a stool by the finder
    N.bm_box(B['wood'], (-2.35, -0.6, CAB + 0.22), (0.75, 1.9, 0.08))
    for (x, y) in ((-2.68, -1.5), (-2.02, -1.5), (-2.68, 0.3), (-2.02, 0.3)):
        N.bm_box(B['wood'], (x, y, CAB + 0.1), (0.05, 0.05, 0.2))
    N.bm_box(B['paint'], (-2.35, -0.6, CAB + 0.31), (0.7, 1.84, 0.1))
    N.bm_box(B['paint_b'], (-2.35, -1.35, CAB + 0.38), (0.55, 0.3, 0.08))
    card.box(-2.74, -1.96, -1.56, 0.36, CAB, CAB + 0.36, floor=True)
    card.spot('cot', -2.35, -0.4, CAB + 0.36, 0)
    for (name, x, y, f) in (('c_a', 1.6, 1.8, 30), ('c_b', 2.1, -1.9, 160), ('c_c', -1.4, 2.0, 250), ('c_d', 0.9, -0.9, 300), ('c_e', -0.8, -1.9, 90)):
        card.spot(name, x, y, CAB, f)
    h.lamp('cabin', 0.0, 0.6, (-0.9, -C_HALF + 0.12, (0, 1)))
    # (lit by the clock, not a switch: Nomad Drive's lamp hangs there from seven in the evening)
    card.switches.pop()
    lamp = card.lamps[-1]
    lamp['hours'] = [19.0, 6.0]
    lamp['inside'] = True
    card.spot('roof_a', 0.8, 1.2, 9.55 + 0.35, 20)
    card.spot('roof_b', -1.1, -1.4, 9.55 + 0.3, 200)


def watchtower(P):
    card = N.Card('watchtower')
    B = N.new_set()
    frame(P, B, card)
    stairs(P, B, card)
    walkway(P, B, card)
    cabin(P, B, card)
    # the walkway's and the ground's spots
    for k, (x, y, f) in enumerate(((-3.35, -3.35, 45), (3.35, -1.4, 180), (-3.35, 1.8, 0), (2.4, 3.35, 270), (-2.0, -3.35, 90), (0.2, -3.35, 120))):
        card.spot(f'w_{"abcdef"[k]}', x, y, WALK, f)
    for k, (x, y, f) in enumerate(((-1.5, -1.0, 30), (1.2, 1.4, 140), (-2.2, 2.4, 220), (4.6, 0.8, 300), (-4.6, -1.8, 80), (0.6, -4.7, 160), (-0.4, 4.7, 250), (2.0, -1.8, 10))):
        card.spot(f'g_{"abcdefgh"[k]}', x, y, 0.0, f)
    N.finish_bms(P, B)
    P.views = [('a', -55, 15), ('b', 40, 22), ('c', 150, 15)]
    card.extra['plinth'] = 0.0
    return card, (7.99, 7.99, 9.58), {'DOOR_cabin': dict(move='hinge', axis='y', open=90.0)}


TABLE = {'watchtower': watchtower}


def main(args):
    N.run(TABLE, args)
