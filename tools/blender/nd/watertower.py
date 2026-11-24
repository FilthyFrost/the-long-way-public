"""
The water tower (docs/ND/PLAN.md, ND6): a prefab place of Nomad Drive's WaterTower class (8.53 x 9.57 m, 16.44 m
high; its legs braced between 1.44 and 5.62 m, a walkway round the tank 10.81 m up, about a metre wide and out to 3.5
m, its railing 1.02 m high with a gap at the ladder's head; the tank's floor 10.87 m up, its wall to 14.74 m, its cone
to 16.43 m; the tank's door opposite the ladder (0.65 x 1.93 m, metal, 160° in 1.0 s); the ladder leaning 6.4° from
its foot 0.61 m up to its head 10.95 m up, let go at the walkway 10.85 m up) in our own design:

    blender -b --factory-startup --python tools/blender/build.py -- nd/watertower [watertower] [--norender] [--noao] [--toon]

Four steel legs in the tower's colour (paint) splayed on their footings, X-braced; a tank of wooden staves bound with
iron hoops, its cone roof of tin and a ball on its point; the walkway of boards on brackets, its railing of pipe; the
caged ladder up its road side; a pipe down the middle to a valve at its foot. Its frame and its card: nd/_nd.py.
"""
import math

import bmesh
from mathutils import Matrix, Vector

from parts import _kit as K
from parts._kit import V
from places import _common as C
from nd import _nd as N
from nd._nd import Face, face_box

TAU = math.tau
DECK, TFLOOR, TWALL, TCONE = 10.81, 10.87, 14.74, 16.43
R_TANK, R_DECK = 2.45, 3.5
LEG_TOP, LEG_BASE = 2.25, 3.1          # the legs' corners (each axis) at the deck and on the ground
FOOT = (0.0, 5.10, 0.61)
HEAD = (0.0, 3.93, 10.95)
EXIT = (0.0, 3.00, 10.85)
FACE = -90.0                            # (one climbs it looking at the tower: towards -Y)
SEG = 20                                # the rings' segments


def jit(k, a=0.0):
    return C.jit(k, a)


def ring_box(card, r0, r1, z0, z1, a0, a1, floor=False):
    """a segment of a ring between radii r0..r1 and angles a0..a1 as a turned box of the card"""
    am = (a0 + a1) / 2
    rm = (r0 + r1) / 2
    x, y = math.cos(am) * rm, math.sin(am) * rm
    half_t = math.sin((a1 - a0) / 2) * r1 + 0.02
    d = dict(u=N.r4(x), v=N.r4(-y), hx=N.r4((r1 - r0) / 2), hz=N.r4(half_t), y0=N.r4(z0), y1=N.r4(z1), turn=N.r4(-am))
    if floor:
        d['floor'] = True
    card.solids.append(d)


def legs(P, B, card):
    """the four legs, splayed, on their footings; their braces; the pipe down the middle and its valve"""
    corners = [(sx, sy) for sx in (-1, 1) for sy in (-1, 1)]
    for (sx, sy) in corners:
        a = V((sx * LEG_BASE, sy * LEG_BASE, 0.0))
        b = V((sx * LEG_TOP, sy * LEG_TOP, DECK - 0.15))
        C.post(P, 'leg', a, b, 0.11, 'paint', segs=10)
        N.bm_box(B['ceramic'], (a.x, a.y, 0.12), (0.62, 0.62, 0.3))
        card.post(a.x, a.y, 0.34, -0.3, 0.3)
        # (the leg's solid: a post at its height's middle, wide enough for its slant)
        m = (a + b) / 2
        card.post(m.x, m.y, 0.22, 0.0, DECK - 0.2)
    # braces between neighbouring legs: two bays of X, a ring of ties
    def at(sx, sy, z):
        k = z / (DECK - 0.15)
        c = LEG_BASE + (LEG_TOP - LEG_BASE) * k
        return V((sx * c, sy * c, z))
    for (p, q) in (((-1, -1), (1, -1)), ((1, -1), (1, 1)), ((1, 1), (-1, 1)), ((-1, 1), (-1, -1))):
        for (z0, z1) in ((1.44, 5.62), (5.62, 9.6)):
            C.post(P, 'brace', at(*p, z0), at(*q, z1), 0.035, 'paint', segs=6)
            C.post(P, 'brace', at(*q, z0), at(*p, z1), 0.035, 'paint', segs=6)
        for z in (1.44, 5.62, 9.6):
            C.post(P, 'tie', at(*p, z), at(*q, z), 0.05, 'paint', segs=8)
    C.post(P, 'pipe', (0.0, 0.0, 0.0), (0.0, 0.0, TFLOOR - 0.05), 0.2, 'steel', segs=14)
    card.post(0.0, 0.0, 0.22, -0.3, TFLOOR - 0.05)
    P.cyl('valve_body', 0.26, 0.4, loc=(0.0, 0.0, 0.7), material='trim', segs=14)
    P.torus('valve_wheel', 0.2, 0.02, loc=(0.0, 0.34, 1.05), material='paint', axis='Y', segs=16, rsegs=4)
    C.post(P, 'valve_stem', (0.0, 0.0, 1.05), (0.0, 0.34, 1.05), 0.02, 'steel', segs=6)
    C.post(P, 'spout', (0.0, 0.18, 0.55), (0.0, 0.62, 0.4), 0.06, 'steel', segs=10)


def deck(P, B, card):
    """the walkway round the tank: boards on brackets from the legs' heads, its railing of pipe (a gap at the
    ladder's head, on +Y); its floor and its railing as the card's"""
    # (the ring cut so that one segment's middle is the ladder's head, on +Y: the gap is in that one alone)
    off = math.pi / 2 - TAU / SEG / 2
    for i in range(SEG):
        a0 = off + TAU * i / SEG
        a1 = off + TAU * (i + 1) / SEG
        am = (a0 + a1) / 2
        # a board's wedge: an annular sector of boards across the way
        bm = bmesh.new()
        pts = []
        for (r, a) in ((R_TANK - 0.05, a0), (R_DECK + 0.05, a0), (R_DECK + 0.05, a1), (R_TANK - 0.05, a1)):
            pts.append((math.cos(a) * r, math.sin(a) * r))
        vs_b = [bm.verts.new((x, y, DECK - 0.06)) for (x, y) in pts]
        vs_t = [bm.verts.new((x, y, DECK)) for (x, y) in pts]
        bm.faces.new(vs_t)
        bm.faces.new(vs_b[::-1])
        for k in range(4):
            j = (k + 1) % 4
            bm.faces.new((vs_b[k], vs_b[j], vs_t[j], vs_t[k]))
        P.mesh('deck_boards', bm, 'wood', sharp=30.0)
        # (the joints between boards: dark lines across the way)
        for t in (0.33, 0.66):
            a = a0 + (a1 - a0) * t
            N.bm_box(B['trim'], (math.cos(a) * (R_TANK + R_DECK) / 2, math.sin(a) * (R_TANK + R_DECK) / 2, DECK + 0.001),
                     (R_DECK - R_TANK + 0.05, 0.012, 0.002), Matrix.Rotation(a, 3, 'Z'))
        ring_box(card, R_TANK - 0.05, R_DECK + 0.05, DECK - 0.25, DECK, a0, a1, floor=True)
        # the railing: posts at the segments' ends, a top rail and a mid rail between them, but at the ladder's head
        gap = i == 0
        p0 = V((math.cos(a0) * R_DECK, math.sin(a0) * R_DECK, DECK))
        p1 = V((math.cos(a1) * R_DECK, math.sin(a1) * R_DECK, DECK))
        C.post(P, 'rail_post', p0, p0 + V((0, 0, 1.02)), 0.025, 'paint', segs=8)
        if gap:
            # (the ladder's head: two stubs either side of a gap 0.6 m wide)
            mid = (p0 + p1) / 2
            d = (p1 - p0).normalized()
            for sg in (-1, 1):
                e = mid + d * (sg * 0.3)
                f = p0 if sg < 0 else p1
                for z in (1.02, 0.5):
                    C.post(P, 'rail', f + V((0, 0, z)), e + V((0, 0, z)), 0.022, 'paint', segs=8)
                C.post(P, 'rail_post', e, e + V((0, 0, 1.02)), 0.025, 'paint', segs=8)
                m2 = (f + e) / 2
                card.solids.append(dict(u=N.r4(m2.x), v=N.r4(-m2.y), hx=N.r4((e - f).length / 2), hz=0.04, y0=N.r4(DECK), y1=N.r4(DECK + 1.02),
                                        turn=N.r4(-math.atan2(d.y, d.x))))
            continue
        for z in (1.02, 0.5):
            C.post(P, 'rail', p0 + V((0, 0, z)), p1 + V((0, 0, z)), 0.022, 'paint', segs=8)
        ring_box(card, R_DECK - 0.02, R_DECK + 0.06, DECK, DECK + 1.02, a0, a1)
    # the brackets under the walkway at each leg's head
    for (sx, sy) in [(sx, sy) for sx in (-1, 1) for sy in (-1, 1)]:
        a = V((sx * LEG_TOP, sy * LEG_TOP, DECK - 0.15))
        r = R_DECK / math.hypot(LEG_TOP, LEG_TOP)
        b = V((sx * LEG_TOP * r, sy * LEG_TOP * r, DECK - 0.07))
        C.post(P, 'bracket', a, b, 0.05, 'paint', segs=8)
        C.post(P, 'bracket', a - V((0, 0, 1.0)), b - V((0, 0, 0.05)), 0.035, 'paint', segs=6)


def tank(P, B, card):
    """the tank: wooden staves round its floor, iron hoops about them, its cone of tin and its ball; the door in its
    side away from the ladder (−Y); its floor and its walls as the card's"""
    n = 28
    door_a = -math.pi / 2
    dw = 0.65
    half = dw / 2 / R_TANK
    for i in range(n):
        a0 = TAU * i / n
        a1 = TAU * (i + 1) / n
        am = (a0 + a1) / 2
        dd = math.atan2(math.sin(am - door_a), math.cos(am - door_a))
        in_door = abs(dd) < half + TAU / n * 0.25
        z0 = TFLOOR + (1.93 if in_door else -0.05)
        w = 2 * math.sin((a1 - a0) / 2) * R_TANK - 0.008
        N.bm_box(B['wood'], (math.cos(am) * (R_TANK - 0.04), math.sin(am) * (R_TANK - 0.04), (z0 + TWALL) / 2), (0.08, w, TWALL - z0), Matrix.Rotation(am, 3, 'Z'))
        if not in_door:
            ring_box(card, R_TANK - 0.09, R_TANK + 0.02, TFLOOR - 0.05, TWALL, a0, a1)
    for z in (TFLOOR + 0.25, TFLOOR + 1.2, TFLOOR + 2.2, TWALL - 0.3):
        P.torus('hoop', R_TANK + 0.005, 0.022, loc=(0.0, 0.0, z), material='trim', segs=40, rsegs=4)
    # the floor inside, of boards on the pipe's head
    N.bm_box(B['wood'], (0.0, 0.0, TFLOOR - 0.03), (2 * R_TANK - 0.2, 2 * R_TANK - 0.2, 0.06))
    for (hx, hy) in ((R_TANK - 0.2, (R_TANK - 0.2) * 0.42), ((R_TANK - 0.2) * 0.42, R_TANK - 0.2)):
        card.box(-hx, hx, -hy, hy, TFLOOR - 0.3, TFLOOR, floor=True)
    # its cone of tin, the eave's lip, the ball on its point
    bm = bmesh.new()
    # (the cone centred between its eave and its point: bm_cyl is centred on its origin)
    K.bm_cyl(bm, R_TANK + 0.25, TCONE - TWALL + 0.07, segs=28, r2=0.08, matrix=Matrix.Translation((0.0, 0.0, (TWALL - 0.07 + TCONE) / 2)))
    P.mesh('cone', bm, 'rust', sharp=30.0)
    P.torus('cone_lip', R_TANK + 0.22, 0.03, loc=(0.0, 0.0, TWALL - 0.06), material='trim', segs=40, rsegs=4)
    P.sphere('finial', 0.16, loc=(0.0, 0.0, TCONE + 0.14), material='paint', u=14, v=8)
    C.post(P, 'finial_rod', (0.0, 0.0, TCONE), (0.0, 0.0, TCONE + 0.55), 0.02, 'steel', segs=6)
    card.post(0.0, 0.0, R_TANK + 0.2, TWALL, TCONE)
    # the door: a riveted iron leaf on its hinge, swinging out 160° (Nomad Drive's 1.0 s)
    a = door_a
    c, s = math.cos(a), math.sin(a)
    tx, ty = -s, c                                     # (round the tank, anticlockwise)
    hx = c * (R_TANK + 0.03) - tx * dw / 2
    hy = s * (R_TANK + 0.03) - ty * dw / 2
    since = len(P.statics)
    mid = (hx + tx * dw / 2, hy + ty * dw / 2)
    P.box('tank_door', (0.04, dw - 0.02, 1.9), (mid[0], mid[1], TFLOOR + 0.96), 'trim', rot=(0, 0, math.degrees(a)), bev=0.006)
    for k in range(3):
        z = TFLOOR + 0.3 + k * 0.65
        P.box('door_rivets', (0.045, dw - 0.1, 0.03), (mid[0] + c * 0.01, mid[1] + s * 0.01, z), 'steel', rot=(0, 0, math.degrees(a)), bev=None)
    P.box('door_handle', (0.06, 0.03, 0.14), (mid[0] + c * 0.05 + tx * (dw / 2 - 0.1), mid[1] + s * 0.05 + ty * (dw / 2 - 0.1), TFLOOR + 1.0), 'steel', bev=0.004)
    P.mover('DOOR_tank', P.statics[since:], (hx, hy, TFLOOR))
    # (out of the tank, back against its wall: the leaf turned from its way round towards the outward (c, s) — to its
    # left if that is the leaf's left, the card's +1)
    card.door('DOOR_tank', (hx, hy), dw - 0.02, 0.04, 160.0, TFLOOR + 1.93, (tx, ty), 1 if (tx * s - ty * c) > 0 else -1,
              pry='none', z0=TFLOOR, secs=1.0, mat='metal')


def ladder(P, B, card):
    """the ladder up the road side to the walkway's gap, caged above head height"""
    N.ladder_mesh(P, FOOT, HEAD, FACE, 0.0, w=0.49, mat='paint', cage=True, over=1.0)
    card.ladder('iron', FOOT, HEAD, EXIT, FACE, w=0.49)


def watertower(P):
    card = N.Card('watertower')
    B = N.new_set()
    legs(P, B, card)
    deck(P, B, card)
    tank(P, B, card)
    ladder(P, B, card)
    # where things are left: in the tank, on the walkway, on the ground about its legs
    for k in range(6):
        a = TAU * k / 6 + 0.4
        r = 1.0 + 0.6 * (k % 2)
        card.spot(f't_{"abcdef"[k]}', math.cos(a) * r, math.sin(a) * r, TFLOOR, math.degrees(a) + 90)
    for k, a in enumerate((0.3, 2.0, 3.6, 5.0)):
        card.spot(f'w_{"abcd"[k]}', math.cos(a) * (R_TANK + R_DECK) / 2, math.sin(a) * (R_TANK + R_DECK) / 2, DECK, math.degrees(a) + 90)
    for k, (x, y, f) in enumerate(((1.0, 1.2, 30), (-1.3, 0.9, 140), (2.0, -1.6, 220), (-2.3, -2.0, 300), (0.8, -3.6, 80))):
        card.spot(f'g_{"abcde"[k]}', x, y, 0.0, f)
    # (by its valve, where Nomad Drive always leaves its water kit: two cans, a bucket; a can and two bottles up in the tank)
    card.spot('kit_a', 0.55, 0.75, 0.0, 120)
    card.spot('kit_b', -0.6, 0.7, 0.0, 60)
    card.spot('kit_c', 0.2, 1.25, 0.0, 200)
    card.spot('kit_d', -1.4, -0.6, TFLOOR, 30)
    card.spot('kit_e', 1.2, -0.9, TFLOOR, 150)
    card.spot('kit_f', 1.35, -0.6, TFLOOR, 170)
    N.finish_bms(P, B)
    P.views = [('a', -60, 15), ('b', 40, 25), ('c', 150, 15)]
    card.extra['plinth'] = 0.0
    return card, (8.53, 9.57, 16.44), {'DOOR_tank': dict(move='hinge', axis='y', open=160.0)}


TABLE = {'watertower': watertower}


def main(args):
    N.run(TABLE, args)
