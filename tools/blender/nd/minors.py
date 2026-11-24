"""
The small places by the road (docs/ND/PLAN.md, ND7): prefab places of Nomad Drive's minor places, as it has them, in
our own design — a bus stop, two outhouses, a row of mailboxes, a little windmill, hay bales, wooden crosses and three
wrecks:

    blender -b --factory-startup --python tools/blender/build.py -- nd/minors [busstop|toilets|mailboxes|windmill|hays|crosses|wreck1|wreck2|wreck3|all] [--norender]

Each in Nomad Drive's footprint, its things where it keeps them (its benches, its bale tops, its roof, its ground)
as spots of its card; none has a lamp. The outhouses' doors (110 degrees, 1.0 s, stuck one time in four) and the
mailboxes' doors and lids (hinged at their foot or their back, tilting: 100 and 105 degrees, stuck one time in four)
shut what is in them; the windmill's wheel of sixteen blades turns with the wind (80 turns a minute at its strongest);
a wreck place lays one of the road's own wrecks (core/world/sites.ts), its roof and its bed places to leave things
on. No plants: the place's grass and flowers are the game's own. Its frame and its card: nd/_nd.py.
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

TAU = math.tau


def jit(k, a=0.0):
    return C.jit(k, a)


def spots_on(card, prefix, x0, x1, y0, y1, z, n, face=0.0, k=0, rows=1):
    """n spots over a rectangle (Blender x0..x1, y0..y1) at z: in `rows` rows, jittered a little"""
    per = int(math.ceil(n / rows))
    i = 0
    for r in range(rows):
        for j in range(per):
            if i >= n:
                return
            fx = (j + 0.5) / per
            fy = (r + 0.5) / rows
            x = x0 + (x1 - x0) * fx + 0.08 * jit(i + k, 1.0) * (x1 - x0) / max(1, per)
            y = y0 + (y1 - y0) * fy + 0.08 * jit(i + k, 2.0) * (y1 - y0)
            card.spot(f'{prefix}_{i}', x, y, z, face + 60 * jit(i + k, 3.0))
            i += 1


def stones(P, B, pts, k=0):
    """small stones on the ground about a place"""
    for i, (x, y, r) in enumerate(pts):
        bm = bmesh.new()
        K.bm_sphere(bm, r, u=7, v=4, matrix=Matrix.Translation((x, y, r * 0.25)) @ Matrix.Diagonal((1.0 + 0.3 * jit(i + k, 1.0), 0.8 + 0.2 * jit(i + k, 2.0), 0.55, 1.0)))
        P.mesh('stone', bm, 'ceramic', sharp=60.0)


# ------------------------------------------------------------------------------------------------ the bus stop

def busstop(P):
    """Nomad Drive's BusStop (3.73 x 2.00 x 2.83 m: a shelter of three posts, its roof falling from 2.81 m over the road
    side to 2.30 at the back, its back wall with a strip of glass, a pane at one end, a bench of slats 2.68 x 0.67 m at
    0.45 against the back, a bin whose lid stands open) in our own design: a timber shelter painted in the line's
    colour, a tin roof, its bench of slats on iron brackets, the line's round sign on its pole and the timetable in its
    frame. Its things: on the bench 3 and 4 more, on the roof 2 and 3, before it and behind it 2 and 4 each, one in the
    bin."""
    card = N.Card('busstop')
    B = N.new_set()
    x0, x1, y0, y1 = -1.6, 1.6, -0.9, 0.9
    zb, zf = 2.30, 2.81
    # the posts: two at the back, two at the front (the front taller: the roof falls to the back)
    for (x, y, h) in ((x0, y0, zb), (x1, y0, zb), (x0, y1, zf), (x1, y1, zf)):
        N.bm_box(B['paint'], (x, y, h / 2), (0.1, 0.1, h))
        N.bm_box(B['trim'], (x, y, 0.06), (0.16, 0.16, 0.12))
        card.post(x, y, 0.07, -0.3, h)
    # its roof: a sheet of tin on rafters, falling to the back, its fascia
    slope = math.atan2(zf - zb, y1 - y0)
    R = Matrix.Rotation(slope, 3, 'X')
    L = (y1 - y0 + 0.5) / math.cos(slope)
    N.bm_box(B['rust'], (0.0, 0.0, (zb + zf) / 2 + 0.07), (x1 - x0 + 0.5, L, 0.03), R)
    for x in (x0, -0.53, 0.53, x1):
        N.bm_box(B['paint'], (x, 0.0, (zb + zf) / 2 + 0.02), (0.07, L - 0.1, 0.09), R)
    N.bm_box(B['paint_b'], (0.0, y1 + 0.24, zf + 0.06), (x1 - x0 + 0.52, 0.04, 0.16))
    # the roof's strip where things are left (Nomad Drive's: 2.80 x 0.50 m at 2.61): flat over the rafters' middle
    card.box(-1.4, 1.4, -0.25, 0.25, 2.4, (zb + zf) / 2 + 0.09, floor=True)
    spots_on(card, 'roof', -1.3, 1.3, -0.2, 0.2, (zb + zf) / 2 + 0.09, 5, face=90, k=10)
    # the back wall: upright boards, a strip of glass at eye level; the pane at the right end
    back = Face((x1, y0 - 0.05), (x0, y0 - 0.05), (0, -1), 0.05)
    for (za, zb_) in ((0.12, 1.25), (1.8, zb - 0.05)):
        n = int((x1 - x0) / 0.16)
        for i in range(n):
            s0 = 0.05 + i * (x1 - x0 - 0.1) / n
            face_box(B['wood'], back, s0, s0 + (x1 - x0 - 0.1) / n - 0.01, -0.05, 0.0, za, zb_)
    face_box(B['glass'], back, 0.1, x1 - x0 - 0.1, -0.035, -0.015, 1.25, 1.8)
    face_box(B['paint'], back, 0.05, x1 - x0 - 0.05, -0.06, 0.01, 1.22, 1.27)
    face_box(B['paint'], back, 0.05, x1 - x0 - 0.05, -0.06, 0.01, 1.78, 1.83)
    card.box(x0, x1, y0 - 0.1, y0, -0.3, zb)
    N.bm_box(B['paint'], (x1, (y0 + y1) / 2 - 0.25, 1.25), (0.05, y1 - y0 - 0.5, 0.06))
    N.bm_box(B['glass'], (x1, (y0 + y1) / 2 - 0.25, 1.4), (0.02, y1 - y0 - 0.6, 1.9))
    card.box(x1 - 0.05, x1 + 0.05, y0, y1 - 0.5, -0.3, 2.3)
    # the timetable in its frame on the back wall, a little map beside it
    N.bm_box(B['paint_b'], (-0.9, y0 + 0.02, 1.52), (0.5, 0.02, 0.4))
    N.bm_box(B['ceramic'], (-0.9, y0 + 0.032, 1.52), (0.42, 0.01, 0.32))
    for j in range(6):
        N.bm_box(B['trim'], (-0.9, y0 + 0.038, 1.62 - j * 0.045), (0.34, 0.004, 0.012))
    # the bench: slats on iron brackets against the back wall (Nomad Drive's: 2.68 x 0.67 m at 0.45)
    bx0, bx1, by0, by1 = -1.34, 1.34, y0 + 0.03, y0 + 0.7
    for j in range(6):
        y = by0 + 0.05 + j * (by1 - by0 - 0.1) / 5
        N.bm_box(B['wood'], (0.0, y, 0.435), (bx1 - bx0, 0.08, 0.03))
    for x in (bx0 + 0.15, 0.0, bx1 - 0.15):
        N.bm_box(B['trim'], (x, (by0 + by1) / 2, 0.4), (0.05, by1 - by0, 0.04))
        N.bm_box(B['trim'], (x, by1 - 0.08, 0.2), (0.05, 0.05, 0.4))
        C.post(P, 'bench_brace', (x, by0 + 0.02, 0.7), (x, by1 - 0.1, 0.42), 0.015, 'trim', segs=5, bev=None)
    for j in range(2):
        N.bm_box(B['wood'], (0.0, y0 + 0.03, 0.62 + j * 0.16), (bx1 - bx0, 0.03, 0.1))
    card.box(bx0, bx1, by0, by1, -0.3, 0.45, floor=True)
    spots_on(card, 'bench', bx0 + 0.1, bx1 - 0.1, by0 + 0.15, by1 - 0.15, 0.45, 7, face=90, k=0, rows=2)
    # the bin by the front post, its lid standing open (Nomad Drive's: 0.41 x 0.61 x 0.41, a slot in it for small things)
    gx, gy = 1.95, 0.75
    P.cyl('bin', 0.2, 0.6, (gx, gy, 0.3), 'paint_b', segs=14, r2=0.18)
    P.cyl('bin_in', 0.17, 0.03, (gx, gy, 0.08), 'trim', segs=12)
    P.box('bin_lid', (0.42, 0.42, 0.03), (gx, gy - 0.2, 0.75), 'paint_b', rot=(-75, 0, 0), bev=0.006)
    C.post(P, 'bin_post', (gx + 0.24, gy, 0.0), (gx + 0.24, gy, 0.9), 0.025, 'trim', segs=6)
    card.post(gx, gy, 0.22, -0.3, 0.62)
    card.spot('bin', gx, gy, 0.1, 0)
    # the line's sign: a round plate on its pole by the road
    sx, sy = -2.05, 1.05
    C.post(P, 'sign_pole', (sx, sy, 0.0), (sx, sy, 2.45), 0.035, 'alu', segs=8)
    P.cyl('sign_plate', 0.28, 0.03, (sx, sy, 2.3), 'paint_b', axis=(0, 1, 0), segs=20)
    P.cyl('sign_face', 0.24, 0.035, (sx, sy, 2.3), 'ceramic', axis=(0, 1, 0), segs=20)
    P.box('sign_bus', (0.26, 0.04, 0.14), (sx, sy, 2.3), 'paint', bev=0.01)
    P.box('sign_bus_win', (0.2, 0.045, 0.05), (sx, sy, 2.33), 'glass', bev=None)
    P.box('sign_board', (0.34, 0.03, 0.16), (sx, sy, 1.85), 'paint_b', bev=0.006)
    card.post(sx, sy, 0.05, -0.3, 2.5)
    stones(P, B, ((2.3, -0.8, 0.12), (-2.2, -0.5, 0.09), (1.2, 1.4, 0.07)), k=1)
    # the ground before it and behind it (Nomad Drive's: 2 and 4 each)
    spots_on(card, 'front', -2.4, 2.4, 1.1, 1.6, 0.0, 6, face=-90, k=20, rows=2)
    spots_on(card, 'behind', -1.9, 1.9, -1.6, -1.15, 0.0, 6, face=90, k=30, rows=2)
    N.finish_bms(P, B)
    P.views = [('a', -55, 20), ('b', 30, 25), ('c', 160, 20)]
    card.extra['plinth'] = 0.0
    return card, (3.73, 2.0, 2.83), {}


# ------------------------------------------------------------------------------------------------ the outhouses

def crescent(cx, cz, r):
    """a crescent moon's outline (x, z) about (cx, cz)"""
    pts = []
    for i in range(13):
        a = math.radians(-120 + 240 * i / 12)
        pts.append((cx + r * math.cos(a), cz + r * math.sin(a)))
    for i in range(12, -1, -1):
        a = math.radians(-100 + 200 * i / 12)
        pts.append((cx + r * 0.35 + r * 0.72 * math.cos(a), cz + r * 0.72 * math.sin(a)))
    return pts


def toilets(P):
    """Nomad Drive's ToiletCabins (5.27 x 1.22 x 2.27 m: two wooden outhouses 1.28 x 1.14 x 2.24 m, 2.65 m apart, their
    rusted tin roofs tilted 6.4 degrees, a box bench with its hole at 0.44 m in each; their doors of five planks, 0.67 x
    2.11 m, facing the road, hinged at their +X edge, opening 110 degrees in 1.0 s and shutting in 1.0 s, stuck one time
    in four; a toilet bowl, to be taken, always in the first) in our own design: boards weathered in the place's paint,
    a crescent moon in each door, a roll of paper on a nail. Its things: the bowl in the first; on the second's bench
    two places of one and one more; on each roof 1 and 2, hard to come by; between them 2 and 4, behind each 1 and 4."""
    card = N.Card('toilets')
    B = N.new_set()
    W, D, H = 1.28, 1.14, 2.24
    t = 0.04
    for (k, cx) in (('a', 1.97), ('b', -1.97)):
        x0, x1, y0, y1 = cx - W / 2, cx + W / 2, -D / 2, D / 2
        front = Face((x0, y1), (x1, y1), (0, 1), t)
        back = Face((x1, y0), (x0, y0), (0, -1), t)
        left = Face((x0, y0 + t), (x0, y1 - t), (-1, 0), t)
        right = Face((x1, y1 - t), (x1, y0 + t), (1, 0), t)
        top = lambda s, f=None: H
        for (f, holes) in ((front, [(0.3, 0.97, 0.0, 2.11)]), (back, []), (left, []), (right, [])):
            n = int(f.L / 0.14)
            for i in range(n):
                s0 = i * f.L / n
                s1 = (i + 1) * f.L / n - 0.008
                # (each board from the plinth to the eave, cut round the doorway)
                spans = N.spans(f.L, holes, 0.05, H - 0.1)
                for (a, b) in [(max(s0, a), min(s1, b)) for (a, b) in [(0.0, f.L)]]:
                    inside = [h for h in holes if h[0] < (s0 + s1) / 2 < h[1]]
                    if inside:
                        h = inside[0]
                        face_box(B['paint'], f, a, b, -t, 0.0, h[3], H - 0.08)
                    else:
                        face_box(B['paint'], f, a, b, -t + 0.004 * ((i % 3) - 1), 0.0, 0.05, H - 0.08 - 0.03 * (i % 2))
            face_box(B['wood'], f, 0.0, f.L, 0.0, 0.025, 0.04, 0.16)
            face_box(B['wood'], f, 0.0, f.L, 0.0, 0.025, H - 0.3, H - 0.18)
        # its floor, its tin roof tilted to the back, the corner posts
        N.bm_box(B['wood'], (cx, 0.0, 0.03), (W - 0.06, D - 0.06, 0.06))
        slope = math.radians(6.4)
        N.bm_box(B['rust'], (cx, 0.0, H - 0.02), (1.35, 1.2, 0.03), Matrix.Rotation(-slope, 3, 'X'))
        for (dx, dy) in ((-1, -1), (1, -1), (-1, 1), (1, 1)):
            N.bm_box(B['wood'], (cx + dx * (W / 2 - 0.03), dy * (D / 2 - 0.03), H / 2 - 0.05), (0.06, 0.06, H - 0.1))
        # the box bench along its back, its hole and its lid; the paper on a nail
        N.bm_box(B['wood'], (cx, y0 + 0.24, 0.22), (W - 0.1, 0.42, 0.44))
        P.cyl(f'seat_hole_{k}', 0.13, 0.02, (cx, y0 + 0.26, 0.445), 'trim', segs=16)
        P.cyl(f'paper_{k}', 0.05, 0.1, (x0 + 0.12, y0 + 0.5, 0.85), 'ceramic', axis=(1, 0, 0), segs=10)
        card.box(x0 + 0.05, x1 - 0.05, y0 + 0.03, y0 + 0.45, -0.3, 0.44, floor=True)
        # its walls: the card's (the doorway left in the front)
        card.box(x0, x1, y0, y0 + t, -0.3, H)
        card.box(x0, x0 + t, y0, y1, -0.3, H)
        card.box(x1 - t, x1, y0, y1, -0.3, H)
        card.box(x0, x0 + 0.3, y1 - t, y1, -0.3, H)
        card.box(x0 + 0.97, x1, y1 - t, y1, -0.3, H)
        card.box(x0, x1, y0, y1, -0.3, 0.06, floor=True)
        # the roof: a place for things, hard to come by
        card.box(x0 - 0.03, x1 + 0.03, y0 - 0.03, y1 + 0.03, H - 0.2, H + 0.02, floor=True)
        spots_on(card, f'roof_{k}', x0 + 0.2, x1 - 0.2, -0.3, 0.3, H + 0.02, 3, face=90, k=40 + (k == 'b') * 5)
        # the door: five planks, its ledges, its crescent; hung at its +X edge, opening out 110 degrees
        hx, hy = x0 + 0.97, y1 + 0.02
        dw, dh = 0.67, 2.11
        since = len(P.statics)
        for i in range(5):
            P.box(f'door_plank_{k}', (dw / 5 - 0.008, 0.03, dh), (hx - dw / 10 - i * dw / 5, hy, dh / 2 + 0.01), 'paint', bev=0.003)
        for z in (0.35, 1.0, 1.75):
            P.box(f'door_ledge_{k}', (dw - 0.08, 0.025, 0.1), (hx - dw / 2, hy + 0.025, z), 'wood', bev=0.003)
        bm = bmesh.new()
        K.bm_prism(bm, crescent(0.0, 0.0, 0.09), 0.012, matrix=Matrix.Translation((hx - dw / 2, hy + 0.017, 1.82)) @ Matrix.Rotation(math.pi / 2, 4, 'X'))
        P.mesh(f'door_moon_{k}', bm, 'trim', sharp=30.0)
        P.box(f'door_latch_{k}', (0.08, 0.03, 0.025), (hx - dw + 0.08, hy + 0.04, 1.08), 'steel', bev=None)
        P.mover(f'DOOR_wc_{k}', P.statics[since:], (hx, hy, 0.0))
        card.door(f'DOOR_wc_{k}', (hx, hy), dw, 0.04, 110.0, dh, (-1.0, 0.0), -1, pry='stuck', secs=1.0, shut_secs=1.0, mat='wood',
                  box=(x0 + 0.05, x1 - 0.05, y0 + 0.05, y1 - 0.05, 0.0, 2.0))
    # the first's bowl, always (Nomad Drive's WC-01: on its floor before the bench); the second's bench
    card.spot('bowl', 1.97, 0.12, 0.06, -90)
    for (j, x) in enumerate((-2.25, -1.69)):
        card.spot(f'bench_b{j}0', x, -0.33, 0.44, 90)
        card.spot(f'bench_b{j}1', x + 0.08, -0.25, 0.44, 100)
    # the ground between them, behind each
    spots_on(card, 'between', -0.7, 0.7, -0.9, 1.0, 0.0, 6, face=-90, k=50, rows=3)
    spots_on(card, 'behind_a', 0.6, 3.3, -1.5, -0.85, 0.0, 5, face=90, k=60)
    spots_on(card, 'behind_b', -3.3, -0.6, -1.5, -0.85, 0.0, 5, face=90, k=70)
    stones(P, B, ((0.2, 1.1, 0.1), (-0.4, -0.9, 0.08), (3.0, 0.9, 0.11), (-2.9, 0.8, 0.07)), k=3)
    N.finish_bms(P, B)
    P.views = [('a', -60, 20), ('b', 20, 22), ('c', 150, 20)]
    card.extra['plinth'] = 0.0
    movers = {d['name']: dict(move='hinge', axis='y', open=float(d['open'])) for d in card.doors}
    return card, (5.27, 1.22, 2.27), movers


# ------------------------------------------------------------------------------------------------ the mailboxes

def rounded(w, h, n=16, z0=0.0):
    """a rural mailbox's end: straight sides, a half-round top (x across, y up), counter-clockwise from its foot's
    left; n segments round its top"""
    r = w / 2
    pts = [(-r, z0), (r, z0), (r, z0 + h - r)]
    for i in range(1, n):
        a = math.pi * i / n
        pts.append((r * math.cos(a), z0 + h - r + r * math.sin(a)))
    pts.append((-r, z0 + h - r))
    return pts


def face_to(bm, pts, normal):
    """a face through pts made to look along `normal`"""
    vs = [bm.verts.new(tuple(p)) for p in pts]
    e1 = V(pts[1]) - V(pts[0])
    e2 = V(pts[2]) - V(pts[1])
    if e1.cross(e2).dot(V(normal)) < 0:
        vs.reverse()
    bm.faces.new(vs)


def shell(bm_out, bm_in, prof_o, prof_i, at, y0, y1, yi0, front_open=True):
    """a hollow body: its outer profile swept from y0 to y1 (`at`: the box's frame — p(px, y, pz) a world point), its
    inner one from yi0 to y1, the rim between them at the open front, its back closed in and out"""
    no = len(prof_o)
    cxo = sum(p[0] for p in prof_o) / no
    czo = sum(p[1] for p in prof_o) / no
    for k in range(no):
        (a0, b0), (a1, b1) = prof_o[k], prof_o[(k + 1) % no]
        mx, mz = (a0 + a1) / 2, (b0 + b1) / 2
        nrm = at.d(mx - cxo, 0.0, mz - czo)
        face_to(bm_out, [at.p(a0, y0, b0), at.p(a1, y0, b1), at.p(a1, y1, b1), at.p(a0, y1, b0)], nrm)
        (c0, d0), (c1, d1) = prof_i[k], prof_i[(k + 1) % no]
        mx, mz = (c0 + c1) / 2, (d0 + d1) / 2
        face_to(bm_in, [at.p(c0, yi0, d0), at.p(c1, yi0, d1), at.p(c1, y1, d1), at.p(c0, y1, d0)], at.d(cxo - mx, 0.0, czo - mz))
        if front_open:
            face_to(bm_out, [at.p(a0, y1, b0), at.p(a1, y1, b1), at.p(c1, y1, d1), at.p(c0, y1, d0)], at.d(0.0, 1.0, 0.0))
    face_to(bm_out, [at.p(px, y0, pz) for (px, pz) in prof_o], at.d(0.0, -1.0, 0.0))
    face_to(bm_in, [at.p(px, yi0, pz) for (px, pz) in prof_i], at.d(0.0, 1.0, 0.0))


class BoxFrame:
    """a mailbox's own frame: x across it (sv), y out of its front (nv), z up, from its foot's middle `c`"""

    def __init__(self, c, sv, nv):
        self.c, self.sv, self.nv = c, sv, nv

    def p(self, x, y, z):
        return self.c + self.sv * x + self.nv * y + V((0.0, 0.0, z))

    def d(self, x, y, z):
        return self.sv * x + self.nv * y + V((0.0, 0.0, z))


def mailboxes(P):
    """Nomad Drive's Mailboxes-01 (4.26 x 0.66 x 1.20 m: eight boxes on posts of 0.82 m with their braces and a top
    plate; four with a door at the front hinged at its foot, 0.28 x 0.33 x 0.44 m, opening 100 degrees in 0.45 s and
    shutting in 0.35; two with a lid hinged at the back, 0.42 x 0.19 x 0.38, 105 degrees, 0.50 and 0.40 s; two big ones
    with a door, 0.37 x 0.36 x 0.48; every one stuck one time in four, of metal; a small thing's place in each) in our
    own design: rural boxes of folded sheet with half-round tops — hollow, dark inside, a door with its lip and its
    latch, its hinge's knuckles, a red flag on its pivot, a number on its side — and parcel boxes with a lid that
    overhangs, in the place's colour and galvanised, on posts with their mounting boards and braces. Its things: one in
    each box, small, on its floor; behind the row 2 and 4."""
    card = N.Card('mailboxes')
    B = N.new_set()
    kinds = ['F', 'F', 'T', 'L', 'F', 'T', 'L', 'F']
    yaw = {2: -4.8, 6: 11.6}
    size = {'F': (0.28, 0.33, 0.44), 'L': (0.37, 0.36, 0.48), 'T': (0.42, 0.19, 0.38)}
    t = 0.012
    for i, kind in enumerate(kinds):
        cx = -1.89 + i * 0.54
        cy = 0.0
        zb = 0.83 + 0.015 * jit(i, 7.0)
        a = math.radians(yaw.get(i, 0.0))
        deg = math.degrees(a)
        R3 = Matrix.Rotation(a, 3, 'Z')
        sv = Vector((math.cos(a), math.sin(a), 0.0))        # across the box
        nv = Vector((-math.sin(a), math.cos(a), 0.0))       # its front, to the road
        w, h, d = size[kind]
        mat = 'paint' if i % 2 == 0 else 'alu'
        F = BoxFrame(Vector((cx, cy, zb)), sv, nv)
        # its post, its mounting board, its two braces
        N.bm_box(B['wood'], (cx, cy - 0.04, (zb - 0.03) / 2), (0.08, 0.08, zb - 0.03))
        N.bm_box(B['wood'], (cx, cy - 0.04, zb - 0.03 + 0.004), (0.09, 0.09, 0.008))
        N.bm_box(B['wood'], tuple(F.p(0.0, 0.0, -0.015)), (0.14, d + 0.06, 0.03), R3)
        for s in (-1, 1):
            C.plank(P, 'mail_brace', tuple(V((cx, cy - 0.04, zb - 0.32)) + sv * 0.0), tuple(F.p(0.0, s * (d / 2 - 0.02), -0.03)), 0.035, 0.025, 'wood', up=tuple(sv), bev=0.002, floor=False)
        card.post(cx, cy - 0.04, 0.05, -0.3, zb)
        # the box: hollow, of folded sheet, its inside dark
        bo, bi = bmesh.new(), bmesh.new()
        if kind == 'T':
            # its walls as a sleeve along its depth, the front and the back closed, the top open
            outer = [(-w / 2, -d / 2), (w / 2, -d / 2), (w / 2, d / 2), (-w / 2, d / 2)]
            inner = [(-w / 2 + t, -d / 2 + t), (w / 2 - t, -d / 2 + t), (w / 2 - t, d / 2 - t), (-w / 2 + t, d / 2 - t)]
            for k in range(4):
                (x0, y0_), (x1, y1_) = outer[k], outer[(k + 1) % 4]
                mx, my = (x0 + x1) / 2, (y0_ + y1_) / 2
                face_to(bo, [F.p(x0, y0_, 0.0), F.p(x1, y1_, 0.0), F.p(x1, y1_, h), F.p(x0, y0_, h)], F.d(mx, my, 0.0))
                (u0, v0), (u1, v1) = inner[k], inner[(k + 1) % 4]
                mx, my = (u0 + u1) / 2, (v0 + v1) / 2
                face_to(bi, [F.p(u0, v0, t), F.p(u1, v1, t), F.p(u1, v1, h), F.p(u0, v0, h)], F.d(-mx, -my, 0.0))
                face_to(bo, [F.p(x0, y0_, h), F.p(x1, y1_, h), F.p(u1, v1, h), F.p(u0, v0, h)], F.d(0.0, 0.0, 1.0))
            face_to(bo, [F.p(x, y, 0.0) for (x, y) in outer], F.d(0.0, 0.0, -1.0))
            face_to(bi, [F.p(x, y, t) for (x, y) in inner], F.d(0.0, 0.0, 1.0))
            # (a band round its top, its foot's rail)
            for (zz, hh) in ((h - 0.03, 0.02), (0.0, 0.025)):
                N.bm_box(B['trim'], tuple(F.p(0.0, 0.0, zz + hh / 2)), (w + 0.008, d + 0.008, hh), R3)
        else:
            prof_o = rounded(w, h)
            prof_i = rounded(w - 2 * t, h - 2 * t, z0=t)
            shell(bo, bi, prof_o, prof_i, F, -d / 2, d / 2, -d / 2 + t)
            # (its back's rolled rim, the seams along its top)
            ring = rounded(w + 0.01, h + 0.005, z0=-0.0025)
            sh = bmesh.new()
            shell(sh, sh, ring, prof_o, F, -d / 2 - 0.004, -d / 2 + 0.012, -d / 2 - 0.004, front_open=True)
            P.mesh(f'mail_rim_{i}', sh, mat, sharp=60.0)
            for x in (-w / 2 + 0.004, w / 2 - 0.004):
                N.bm_box(B['trim'], tuple(F.p(x, 0.0, 0.006)), (0.008, d, 0.012), R3)
        P.mesh(f'mailbox_{i}', bo, mat, sharp=55.0)
        P.mesh(f'mailbox_in_{i}', bi, 'trim', sharp=55.0)
        if kind != 'T':
            # the flag on its pivot on the right, up or down; the number on the left
            up = i % 3 != 1
            pv = F.p(w / 2 + 0.008, -d * 0.18, h * 0.42)
            P.cyl(f'mail_flag_pivot_{i}', 0.012, 0.016, tuple(pv), 'steel', axis=tuple(sv), segs=10, bev=None)
            arm = F.d(0.0, 0.0, 1.0) if up else F.d(0.0, -1.0, 0.0)
            ac = pv + sv * 0.012 + arm * 0.11
            if up:
                P.box(f'mail_flag_arm_{i}', (0.006, 0.02, 0.22), tuple(ac), 'paint_b', rot=(0, 0, deg), bev=None)
                P.box(f'mail_flag_{i}', (0.006, 0.1, 0.065), tuple(pv + sv * 0.012 + arm * 0.2 + nv * 0.04), 'paint_b', rot=(0, 0, deg), bev=None)
            else:
                P.box(f'mail_flag_arm_{i}', (0.006, 0.22, 0.02), tuple(ac), 'paint_b', rot=(0, 0, deg), bev=None)
                P.box(f'mail_flag_{i}', (0.006, 0.065, 0.1), tuple(pv + sv * 0.012 + arm * 0.2 + V((0, 0, 0.04))), 'paint_b', rot=(0, 0, deg), bev=None)
            np_ = F.p(-w / 2 - 0.004, 0.02, h * 0.42)
            P.box(f'mail_plate_{i}', (0.005, 0.14, 0.05), tuple(np_), 'ceramic', rot=(0, 0, deg), bev=None)
            for k in range(3):
                P.box(f'mail_digit_{i}', (0.006, 0.018, 0.03), tuple(np_ + nv * (-0.04 + 0.04 * k) - sv * 0.0015), 'trim', rot=(0, 0, deg), bev=None)
        # its card: its sides and its back keep one out (its post the rest), its floor holds what is put in it
        for (x, hx, y, hy) in ((-w / 2 + t / 2, t / 2, 0.0, d / 2), (w / 2 - t / 2, t / 2, 0.0, d / 2), (0.0, w / 2, -d / 2 + t / 2, t / 2)):
            q = F.p(x, y, 0.0)
            Pr.tsolid(card, q.x, q.y, hx, hy, zb, zb + h, a)
        q = F.p(0.0, 0.0, 0.0)
        Pr.tsolid(card, q.x, q.y, w / 2 - t, d / 2 - t, zb - 0.03, zb + t, a, floor=True)
        # what is kept in it: one small thing on its floor, out of reach while it is shut
        inside = (cx - w / 2 + t, cx + w / 2 - t, cy - d / 2 + t, cy + d / 2 - t, zb + t - 0.01, zb + h - t, a)
        card.spot(f'box{i}', cx, cy, zb + t, deg + 90 + 25 * jit(i, 8.0))
        # its door: tilting about its foot (F, L) or its lid about its back (T)
        since = len(P.statics)
        if kind == 'T':
            hinge = F.p(-w / 2 - 0.015, -d / 2 - 0.012, h + 0.004)
            mid = sv * (w / 2 + 0.015) + nv * (d / 2 + 0.012)
            lc = F.p(0.0, 0.0, h + 0.012)
            P.box(f'mail_lid_{i}', (w + 0.03, d + 0.03, 0.016), tuple(lc), mat, rot=(0, 0, deg), bev=0.004)
            P.box(f'mail_lid_lip_{i}', (w + 0.03, 0.012, 0.04), tuple(F.p(0.0, d / 2 + 0.009, h - 0.006)), mat, rot=(0, 0, deg), bev=0.003)
            for s in (-1, 1):
                C.post(P, f'mail_lid_handle_{i}', tuple(F.p(s * 0.05, d / 2 + 0.016, h + 0.004)), tuple(F.p(s * 0.05, d / 2 + 0.04, h + 0.004)), 0.005, 'steel', segs=5, bev=None)
            C.post(P, f'mail_lid_handle_{i}', tuple(F.p(-0.055, d / 2 + 0.04, h + 0.004)), tuple(F.p(0.055, d / 2 + 0.04, h + 0.004)), 0.006, 'steel', segs=6, bev=None)
            for s in (-1, 1):
                P.cyl(f'mail_knuckle_{i}', 0.008, 0.05, tuple(F.p(s * (w / 2 - 0.06), -d / 2 - 0.012, h + 0.004)), 'steel', axis=tuple(sv), segs=8, bev=None)
            want = Vector((0.0, 0.0, 1.0))
            open_deg, secs, shut = 105.0, 0.50, 0.40
        else:
            hinge = F.p(-w / 2 - 0.004, d / 2 + 0.006, 0.0)
            mid = sv * (w / 2 + 0.004) + V((0.0, 0.0, h / 2))
            dp = bmesh.new()
            K.bm_prism(dp, rounded(w + 0.008, h + 0.004, z0=-0.002), 0.01, matrix=Matrix.Translation(tuple(F.p(0.0, d / 2 + 0.006, 0.0))) @ R3.to_4x4() @ Matrix.Rotation(math.pi / 2, 4, 'X'))
            P.mesh(f'mail_door_{i}', dp, mat, sharp=55.0)
            lp = bmesh.new()
            K.bm_prism(lp, rounded(w - 2 * t - 0.006, h - 2 * t - 0.006, z0=t + 0.003), 0.01, matrix=Matrix.Translation(tuple(F.p(0.0, d / 2 - 0.004, 0.0))) @ R3.to_4x4() @ Matrix.Rotation(math.pi / 2, 4, 'X'))
            P.mesh(f'mail_door_lip_{i}', lp, 'trim', sharp=55.0)
            P.box(f'mail_door_latch_{i}', (0.05, 0.022, 0.018), tuple(F.p(0.0, d / 2 + 0.018, h - 0.03)), 'steel', rot=(0, 0, deg), bev=None)
            P.box(f'mail_door_latch_tip_{i}', (0.05, 0.008, 0.03), tuple(F.p(0.0, d / 2 + 0.028, h - 0.042)), 'steel', rot=(0, 0, deg), bev=None)
            for s in (-1, 1):
                P.cyl(f'mail_knuckle_{i}', 0.007, 0.04, tuple(F.p(s * (w / 2 - 0.05), d / 2 + 0.006, 0.004)), 'steel', axis=tuple(sv), segs=8, bev=None)
            want = nv
            open_deg, secs, shut = 100.0, 0.45, 0.35
        # (which way it tilts: its middle moving out of the box's front, or up off its top)
        turn = 1 if sv.cross(mid).dot(want) > 0 else -1
        P.mover(f'DOOR_mail{i}', P.statics[since:], tuple(hinge))
        card.door(f'DOOR_mail{i}', (hinge.x, hinge.y), w + (0.008 if kind != 'T' else 0.03), 0.02, open_deg, hinge.z + (h if kind != 'T' else 0.02), (sv.x, sv.y), turn, pry='stuck',
                  z0=hinge.z, box=inside, secs=secs, shut_secs=shut, mat='metal', tilt_mid=(mid.x, mid.y, mid.z))
    # behind the row (Nomad Drive's: 2 and 4)
    spots_on(card, 'behind', -2.0, 2.0, -0.9, -0.5, 0.0, 6, face=90, k=80, rows=2)
    stones(P, B, ((-2.3, 0.3, 0.09), (2.25, -0.25, 0.07)), k=5)
    N.finish_bms(P, B)
    P.views = [('a', -50, 18), ('b', 20, 20), ('c', 150, 20)]
    card.extra['plinth'] = 0.0
    movers = {d['name']: dict(move='tilt', open=float(d['open'])) for d in card.doors}
    return card, (4.26, 0.66, 1.2), movers


# ------------------------------------------------------------------------------------------------ the windmill

def bale(B, card, x, y, z, a, name=None, spots=0, k=0):
    """a small square bale (Nomad Drive's: 0.78 x 0.77 x 1.44 m; ours 0.78 x 1.44 m, 0.66 high): three flakes, two
    bands of twine; its top a floor for things (spots on it), the card's"""
    R = Matrix.Rotation(math.radians(a), 3, 'Z')
    c = V((x, y, z))
    for j in range(3):
        o = R @ V((0.0, -0.48 + 0.48 * j, 0.0))
        N.bm_box(B['paint'], tuple(c + o + V((0, 0, 0.33))), (0.78 - 0.02 * (j % 2), 0.46, 0.66 - 0.015 * ((j + 1) % 2)), R)
    for s in (-0.22, 0.22):
        o = R @ V((s, 0.0, 0.0))
        N.bm_box(B['paint_b'], tuple(c + o + V((0, 0, 0.33))), (0.02, 1.445, 0.665), R)
    Pr.tsolid(card, x, y, 0.39, 0.72, z - 0.3 if z > 0.01 else -0.3, z + 0.66, math.radians(a), floor=True)
    if spots:
        for i in range(spots):
            o = R @ V((0.16 * jit(i + k, 1.0), -0.45 + 0.9 * (i + 0.5) / spots, 0.0))
            card.spot(f'{name}_{i}', x + o.x, y + o.y, z + 0.66, a + 90 + 40 * jit(i + k, 2.0))


def hay_pile(P, x, y, r, k=0):
    """a heap of loose hay"""
    bm = bmesh.new()
    K.bm_sphere(bm, r, u=10, v=5, matrix=Matrix.Translation((x, y, 0.0)) @ Matrix.Diagonal((1.0 + 0.25 * jit(k, 1.0), 0.8 + 0.2 * jit(k, 2.0), 0.35 + 0.1 * jit(k, 3.0), 1.0)))
    P.mesh('hay_pile', bm, 'paint', sharp=70.0)


def windmill(P):
    """Nomad Drive's Windmill (2.15 x 1.68 m: a wooden tower of four legs to 2.64 m, its braces, a rod down its middle, a
    little platform at 2.07; its wheel of sixteen blades, 1.46 m across, on the road side, its top at 3.41; turning
    with the wind, 80 turns a minute at its strongest, ±12 % in gusts, 1.5 s to speed up and 3 to slow, clockwise seen
    from the road; two bales and a heap of hay by it) in our own design: weathered timber, a galvanised wheel on its
    wooden frame, a vane in the place's colour behind it. Its things: on each bale 2 and 1 more, behind it 2 and 4, on
    either side 1 and 4."""
    card = N.Card('windmill')
    B = N.new_set()
    tx, ty = 0.07, -0.31
    top = 2.64
    base, head = 0.43, 0.13
    legs = []
    for (dx, dy) in ((-1, -1), (1, -1), (1, 1), (-1, 1)):
        a = V((tx + dx * base, ty + dy * base, 0.0))
        b = V((tx + dx * head, ty + dy * head, top))
        legs.append((a, b))
        C.plank(P, 'mill_leg', a, b, 0.08, 0.08, 'wood', up=(0, 0, 1), bev=0.004, floor=True)
        N.bm_box(B['ceramic'], (a.x, a.y, 0.05), (0.2, 0.2, 0.1))
    lerp = lambda p, q, f: p + (q - p) * f
    for z in (0.15, 0.45, 0.65, 1.17, 1.70, 2.03):
        f = z / top
        ring = [lerp(a, b, f) for (a, b) in legs]
        for j in range(4):
            C.post(P, 'mill_brace', tuple(ring[j]), tuple(ring[(j + 1) % 4]), 0.022, 'wood', segs=5, bev=None)
    for (zl, zh) in ((0.15, 1.17), (1.17, 2.03)):
        fl, fh = zl / top, zh / top
        for j in range(4):
            C.post(P, 'mill_diag', tuple(lerp(legs[j][0], legs[j][1], fl)), tuple(lerp(legs[(j + 1) % 4][0], legs[(j + 1) % 4][1], fh)), 0.016, 'wood', segs=4, bev=None)
    C.post(P, 'mill_rod', (tx, ty, 0.1), (tx, ty, 2.27), 0.018, 'steel', segs=6)
    N.bm_box(B['wood'], (tx, ty, 2.07), (0.42, 0.42, 0.04))
    card.box(tx - base, tx + base, ty - base, ty + base, -0.3, 2.6)
    # the head on its top: the gearbox, the shaft to the wheel, the vane behind it
    N.bm_box(B['trim'], (tx, ty, top + 0.04), (0.22, 0.34, 0.16))
    wx, wy, wz = -0.02 + tx, 0.48 + ty, 2.68
    C.post(P, 'mill_shaft', (tx, ty, top + 0.04), (wx, wy - 0.04, wz), 0.025, 'steel', segs=8)
    for s in (-0.03, 0.03):
        C.post(P, 'mill_tail_rail', (tx + s, ty - 0.12, top + 0.06), (tx + s, ty - 1.0, top + 0.1), 0.018, 'wood', segs=5, bev=None)
    P.box('mill_vane', (0.02, 0.6, 0.42), (tx, ty - 1.05, top + 0.12), 'paint_b', bev=0.004)
    # the wheel: sixteen blades on a frame of six double arms and two rings, its hub — turning (N_spin_wheel)
    since = len(P.statics)
    hub = V((wx, wy, wz))
    P.cyl('wheel_hub', 0.07, 0.12, tuple(hub), 'trim', axis=(0, 1, 0), segs=12)
    for rr in (0.215, 0.515):
        P.torus('wheel_ring', rr, 0.012, loc=tuple(hub), material='wood', axis=(0, 1, 0), segs=24, rsegs=3)
    for j in range(6):
        a = j * TAU / 6
        for s in (-0.02, 0.02):
            C.post(P, 'wheel_arm', tuple(hub + V((0, s, 0))), tuple(hub + V((math.cos(a) * 0.72, s, math.sin(a) * 0.72))), 0.012, 'wood', segs=4, bev=None)
    for j in range(16):
        a = j * TAU / 16
        rm = (0.22 + 0.73) / 2
        c = hub + V((math.cos(a) * rm, 0.0, math.sin(a) * rm))
        P.box('wheel_blade', (0.51, 0.006, 0.15), tuple(c), 'alu', rot=(0, -math.degrees(a), 0), bev=None)
    P.mover('N_spin_wheel', P.statics[since:], tuple(hub))
    card.spin('wheel', 'z', rpm=80.0, gust=0.12, gust_hz=0.25, up_s=1.5, down_s=3.0, sign=1)
    # its bales and its heap of hay
    bale(B, card, tx - 0.95, ty + 0.25, 0.0, 8.0, name='bale_l', spots=3, k=0)
    bale(B, card, tx + 0.95, ty - 0.1, 0.0, -14.0, name='bale_r', spots=3, k=4)
    hay_pile(P, tx + 0.55, ty + 0.75, 0.45, k=1)
    # the ground behind it, either side of it
    spots_on(card, 'behind', -2.2, 2.3, -1.85, -1.25, 0.0, 6, face=90, k=90, rows=2)
    spots_on(card, 'left', -2.0, -1.5, -1.2, 0.6, 0.0, 5, face=0, k=100, rows=3)
    spots_on(card, 'right', 1.65, 2.15, -1.2, 0.6, 0.0, 5, face=180, k=110, rows=3)
    N.finish_bms(P, B)
    P.views = [('a', -50, 15), ('b', 30, 20), ('c', 160, 15)]
    card.extra['plinth'] = 0.0
    return card, (2.15, 1.68, 3.41), {}


# ------------------------------------------------------------------------------------------------ the hay bales

def hays(P):
    """Nomad Drive's Hays (4.06 x 7.54 m: ten small square bales, eight on the ground in loose groups at angles of
    their own and two stacked on them; thirteen heaps of loose hay; the richest of the small places) in our own design.
    Its things: on the low bales' tops 1 and 2 (the north's, the west's), 2 and 3 (the south pair's); on the two
    stacked 1 and 2 each; along the east, the west and the back 1 and 4 each."""
    card = N.Card('hays')
    B = N.new_set()
    # (x, y, z, angle, spots' name, how many)
    bales = [
        (-0.35, 2.7, 0.0, 6.0, 'north', 3), (0.5, 2.55, 0.0, -9.0, None, 0),
        (-0.2, 0.35, 0.0, 84.0, None, 0), (-0.25, 0.4, 0.66, 78.0, 'stack_a', 3), (0.75, 0.2, 0.0, 12.0, None, 0),
        (-1.25, -1.55, 0.0, -4.0, 'west', 3),
        (0.15, -3.0, 0.0, 88.0, 'south', 5), (0.15, -2.2, 0.0, 91.0, None, 0), (0.2, -2.6, 0.66, 4.0, 'stack_b', 3),
        (1.35, -1.0, 0.0, 33.0, None, 0),
    ]
    for (i, (x, y, z, a, name, n)) in enumerate(bales):
        bale(B, card, x, y, z, a, name=name, spots=n, k=10 * i)
    for k in range(13):
        a = k * 2.399
        r = 0.6 + 2.4 * ((k * 0.618) % 1.0)
        x = 1.6 * math.cos(a) * min(1.0, r / 2.0)
        y = 3.6 * math.sin(a) * min(1.0, r / 2.5)
        hay_pile(P, x, y, 0.25 + 0.2 * ((k * 0.37) % 1.0), k=k)
    spots_on(card, 'g_east', 1.55, 2.0, -3.4, 3.4, 0.0, 5, face=180, k=200, rows=5)
    spots_on(card, 'g_west', -2.0, -1.6, -3.4, 3.4, 0.0, 5, face=0, k=210, rows=5)
    spots_on(card, 'g_back', -2.0, 2.0, -3.95, -3.6, 0.0, 5, face=90, k=220)
    N.finish_bms(P, B)
    P.views = [('a', -55, 25), ('b', 30, 30), ('c', 150, 25)]
    card.extra['plinth'] = 0.0
    return card, (4.06, 7.54, 1.39), {}


# ------------------------------------------------------------------------------------------------ the crosses

def crosses(P):
    """Nomad Drive's WoodenCrosses (3.91 x 3.03 m: ten small crosses of wood, 0.42 x 0.75 m, a nail through each, turned
    and leaning a little, scattered over 4.0 x 3.2 m; small stones) in our own design: weathered boards, a few painted,
    a ribbon on some, a jar with a candle stub. Its things all on the ground: between the crosses 2 and 2, 1 and 2, 1
    and 2, 1 and 1; behind 2 and 4; at either side 1 and 4."""
    card = N.Card('crosses')
    B = N.new_set()
    pts = [(-1.55, 0.9), (-0.8, 1.15), (0.05, 0.95), (0.95, 1.2), (1.6, 0.85), (-1.3, -0.3), (-0.45, -0.1), (0.4, -0.35), (1.25, -0.15), (0.0, -1.1)]
    for (i, (x, y)) in enumerate(pts):
        a = math.radians(90 + 25 * jit(i, 1.0))
        lean = Matrix.Rotation(math.radians(4.6) * jit(i, 2.0), 3, 'X') @ Matrix.Rotation(math.radians(4.6) * jit(i, 3.0), 3, 'Y')
        R = Matrix.Rotation(a - math.pi / 2, 3, 'Z') @ lean
        mat = 'paint' if i in (2, 6) else 'paint_b' if i == 8 else 'wood'
        c = V((x, y, 0.0))
        N.bm_box(B[mat], tuple(c + R @ V((0.0, 0.0, 0.375))), (0.06, 0.04, 0.75), R)
        N.bm_box(B[mat], tuple(c + R @ V((0.0, 0.0, 0.52))), (0.42, 0.04, 0.06), R)
        N.bm_box(B['steel'], tuple(c + R @ V((0.0, 0.025, 0.52))), (0.012, 0.012, 0.012), R)
        if i in (1, 4, 7):
            N.bm_box(B['fabric'], tuple(c + R @ V((0.07, 0.025, 0.48))), (0.05, 0.006, 0.18), R)
        card.post(x, y, 0.05, -0.3, 0.75)
    # a jar with its candle stub before the middle cross
    P.cyl('jar', 0.05, 0.12, (0.05, 1.32, 0.06), 'glass', segs=12)
    P.cyl('candle', 0.03, 0.06, (0.05, 1.32, 0.04), 'ceramic', segs=10)
    stones(P, B, [(x + 0.18 * jit(k, 4.0), y + 0.2, 0.06 + 0.03 * abs(jit(k, 5.0))) for k, (x, y) in enumerate(pts)], k=9)
    for (prefix, x0, x1, y0, y1, n, k) in (('mid_a', -1.2, 1.2, 0.3, 0.55, 4, 0), ('mid_b', -0.85, 0.85, -0.75, -0.55, 3, 10), ('mid_c', 0.6, 1.3, -1.2, -0.6, 3, 20),
                                         ('mid_d', -1.2, -0.5, -1.2, -0.7, 2, 30)):
        spots_on(card, prefix, x0, x1, y0, y1, 0.0, n, face=90, k=k)
    spots_on(card, 'behind', -2.2, 2.2, -1.7, -1.4, 0.0, 6, face=90, k=40)
    spots_on(card, 'left', -2.3, -1.95, -1.3, 1.3, 0.0, 5, face=0, k=50, rows=5)
    spots_on(card, 'right', 1.95, 2.3, -1.0, 1.0, 0.0, 5, face=180, k=60, rows=5)
    N.finish_bms(P, B)
    P.views = [('a', -55, 30), ('b', 30, 35), ('c', 150, 30)]
    card.extra['plinth'] = 0.0
    return card, (3.91, 3.03, 0.75), {}


# ------------------------------------------------------------------------------------------------ the wrecks

# the road's wrecks (core/world/sites.ts WRECK_SIZE): length, width, height; their roofs and a pick-up's bed over its x
WRECK = {0: (4.2, 1.7, 1.42), 1: (4.7, 1.8, 1.6)}


def wreck_place(P, cid, kind, stripped, nd):
    """a wreck by the road (Nomad Drive's car wreckage 01, -02, -03): one of the road's own wrecks across the verge, its
    nose to the road, what is left on its roof (and in a pick-up's bed, in a stripped one's engine bay) and about it;
    an oil stain under it, a hubcap and glass in the grass"""
    card = N.Card(cid)
    B = N.new_set()
    L, Wd, H = WRECK[kind]
    face = 90.0
    card.wreck(0.0, 0.0, face, kind, stripped=stripped)
    # (the car's own x is its nose, here +y; across it, -x)
    along = lambda lx: (0.0, lx)
    # an oil stain under it, a hubcap and glass about it
    bm = bmesh.new()
    K.bm_cyl(bm, 0.7, 0.006, segs=16, matrix=Matrix.Translation((0.15, 0.6, 0.004)) @ Matrix.Diagonal((1.0, 1.6, 1.0, 1.0)))
    P.mesh('oil_stain', bm, 'rubber', sharp=80.0)
    P.cyl('hubcap', 0.19, 0.04, (1.25, -0.9, 0.03), 'alu', segs=16, r2=0.15)
    for j in range(5):
        P.box('glass_bit', (0.06 + 0.03 * (j % 2), 0.04, 0.004), (-1.2 + 0.15 * j, 1.1 - 0.12 * j, 0.004), 'glass', rot=(0, 0, 37 * j), bev=None)
    # (what is in and on it is its own: the road's wrecks are the game's vehicles, their boot, their bed, their seats
    # filled by their own roll — core/modcar/wrecks.ts; a floor on its roof would stand in the vehicle's way)
    # about it (Nomad Drive's: its sides, behind it, before it)
    # (clear of the vehicle it is: the game's are a little bigger than the world's box of it)
    spots_on(card, 'right', 1.4, 1.85, -2.4, 2.4, 0.0, 6, face=180, k=10, rows=6)
    spots_on(card, 'left', -1.85, -1.4, -2.0, 2.0, 0.0, 5 if kind else 4, face=0, k=20, rows=5)
    spots_on(card, 'behind', -1.2, 1.2, -3.5, -3.0, 0.0, 6 if kind else 5, face=90, k=30, rows=2)
    spots_on(card, 'front', -0.8, 0.8, 3.0, 3.4, 0.0, 4 if stripped else 3 if kind == 0 else 2, face=-90, k=40)
    N.finish_bms(P, B)
    P.views = [('a', -55, 25), ('b', 30, 30), ('c', 150, 25)]
    card.extra['plinth'] = 0.0
    card.extra['nd'] = nd
    return card, (2.6, 6.0, H + 0.12), {}


def wreck1(P):
    return wreck_place(P, 'wreck1', 0, False, 'CarWreckage01')


def wreck2(P):
    return wreck_place(P, 'wreck2', 1, False, 'CarWreckage-02')


def wreck3(P):
    return wreck_place(P, 'wreck3', 0, True, 'CarWreckage-03')


TABLE = {'busstop': busstop, 'toilets': toilets, 'mailboxes': mailboxes, 'windmill': windmill, 'hays': hays, 'crosses': crosses,
         'wreck1': wreck1, 'wreck2': wreck2, 'wreck3': wreck3}


def main(args):
    N.run(TABLE, args)
