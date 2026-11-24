"""
The wind farm (docs/ND/PLAN.md, ND6): a prefab place of Nomad Drive's WindTurbines (77.93 x 10.13 m; two turbines
69.9 m apart, the second turned 16.4 degrees the other way; in each a spiral stair of 274 treads, 0.18 m each, to a
landing at the tower's head under the nacelle, its floor at 50.03 m; a metal door at its foot, 0.4 s; a red light on
its nose at 53.66 m from seven in the evening; its rotor's hub at 53.66 m, three blades of 32.4 m turning with the
wind, 16 turns a minute at its strongest, six seconds to speed up and twelve to slow, each rotor its own by 8 % and
from an angle of its own; things on the ground about them, on a shelf, in the nose and in the nacelle) in our own
design:

    blender -b --factory-startup --python tools/blender/build.py -- nd/windfarm [windfarm] [--norender] [--noao] [--toon]

The towers of white steel tapering on their concrete plinths, two steps up to the door; the stair's treads of grating
round a column, a rail along the wall; the nacelles boxy and white, their machinery inside, their noses with their red
lights; the blades white with red tips; a transformer's kiosk of concrete by each, a shelf inside. Its frame and its
card: nd/_nd.py; its parts: nd/_props.py.
"""
import math

import bmesh
from mathutils import Matrix, Vector

from parts import _kit as K
from parts._kit import V
from places import _common as C
from nd import _nd as N
from nd import _props as Pr
from nd import station as S

TAU = math.tau
TURBINES = [('a', -34.95, 0.0, 0.0), ('b', 34.95, 0.0, -16.4)]
PLINTH = 0.4
TOWER_TOP = 50.0
R_OUT0, R_OUT1, R_IN = 2.1, 1.75, 1.6
TREADS = 274
RISE = (49.92 - PLINTH) / TREADS
PER_TURN = 22
THETA = TAU / PER_TURN
A0 = math.radians(244.0)                 # the first tread's middle (its door at 90°: twelve treads over it)
R_STEP0, R_STEP1 = 0.3, 1.55
DECK = 50.03
HUB_Z, HUB_Y = 53.66, 3.0
BLADE = 32.4
NAC = (-2.4, 2.4, -6.5, 2.1, 49.8, 55.2)  # its outside: x, y, z


def quad(bm, pts, normal):
    """a quad made to face `normal`"""
    vs = [bm.verts.new(p) for p in pts]
    a, b, c = (V(pts[1]) - V(pts[0])), (V(pts[2]) - V(pts[1])), V(normal)
    if a.cross(b).dot(c) < 0:
        vs.reverse()
    bm.faces.new(vs)


class Frame:
    """a turbine's own frame: its tower's axis at (cx, cy), turned `yaw` degrees"""

    def __init__(self, cx, cy, yaw):
        self.cx, self.cy = cx, cy
        self.a = math.radians(yaw)
        self.c, self.s = math.cos(self.a), math.sin(self.a)
        self.R = Matrix.Rotation(self.a, 3, 'Z')

    def p(self, lx, ly, z=0.0):
        return V((self.cx + self.c * lx - self.s * ly, self.cy + self.s * lx + self.c * ly, z))

    def v(self, x, y, z=0.0):
        return self.R @ V((x, y, z))


def tower(P, B, card, F, k):
    """the plinth, its two steps, the tapered tower with its door's opening; its walls the card's (an opening left
    for the door), the plinth's top a floor"""
    # the plinth: an octagon of concrete
    for a in (0.0, math.pi / 4):
        N.bm_box(B['ceramic'], tuple(F.p(0.0, 0.0, (PLINTH - 0.3) / 2)), (5.54, 5.54, PLINTH + 0.3), F.R @ Matrix.Rotation(a, 3, 'Z'))
        q = F.p(0.0, 0.0)
        Pr.tsolid(card, q.x, q.y, 2.77, 2.77, -0.3, PLINTH, F.a + a, floor=True)
    for (y0, y1, top) in ((2.95, 3.35, 0.27), (3.35, 3.75, 0.13)):
        c = F.p(0.0, (y0 + y1) / 2, (top - 0.3) / 2)
        N.bm_box(B['ceramic'], tuple(c), (1.6, y1 - y0, top + 0.3), F.R)
        Pr.tsolid(card, c.x, c.y, 0.8, (y1 - y0) / 2, -0.3, top, F.a, floor=True)
    # the tower: 24 pieces round, two of them over the door's opening (75–105°)
    bm = bmesh.new()
    SEG = 24
    door = (5, 6)
    rad = lambda z: R_OUT0 + (R_OUT1 - R_OUT0) * (z / TOWER_TOP)
    for i in range(SEG):
        a0, a1 = i * TAU / SEG, (i + 1) * TAU / SEG
        bands = [(2.5, TOWER_TOP)] if i in door else [(-0.15, TOWER_TOP)]
        for (zb, zt) in bands:
            for (r, out) in ((None, 1), (R_IN, -1)):
                rb = rad(zb) if r is None else r
                rt = rad(zt) if r is None else r
                pts = [F.p(rb * math.cos(a0), rb * math.sin(a0), zb), F.p(rb * math.cos(a1), rb * math.sin(a1), zb),
                       F.p(rt * math.cos(a1), rt * math.sin(a1), zt), F.p(rt * math.cos(a0), rt * math.sin(a0), zt)]
                am = (a0 + a1) / 2
                quad(bm, [tuple(p) for p in pts], tuple(F.v(math.cos(am) * out, math.sin(am) * out)))
            # (its wall the card's: from the plinth's foot to under the nacelle, the door's two over its head)
            am = (a0 + a1) / 2
            q = F.p(math.cos(am) * (R_IN + 0.25), math.sin(am) * (R_IN + 0.25))
            Pr.tsolid(card, q.x, q.y, 0.25, R_OUT0 * math.tan(TAU / SEG / 2) + 0.02, max(-0.3, zb), 49.6, F.a + am)
    # the door's jambs and its head
    for (aj, nrm) in ((5 * TAU / SEG, 1), (7 * TAU / SEG, -1)):
        pts = [F.p(R_IN * math.cos(aj), R_IN * math.sin(aj), PLINTH), F.p(rad(0.4) * math.cos(aj), rad(0.4) * math.sin(aj), PLINTH),
               F.p(rad(2.5) * math.cos(aj), rad(2.5) * math.sin(aj), 2.5), F.p(R_IN * math.cos(aj), R_IN * math.sin(aj), 2.5)]
        quad(bm, [tuple(p) for p in pts], tuple(F.v(-math.sin(aj) * nrm, math.cos(aj) * nrm)))
    for i in door:
        a0, a1 = i * TAU / SEG, (i + 1) * TAU / SEG
        pts = [F.p(R_IN * math.cos(a0), R_IN * math.sin(a0), 2.5), F.p(R_IN * math.cos(a1), R_IN * math.sin(a1), 2.5),
               F.p(rad(2.5) * math.cos(a1), rad(2.5) * math.sin(a1), 2.5), F.p(rad(2.5) * math.cos(a0), rad(2.5) * math.sin(a0), 2.5)]
        quad(bm, [tuple(p) for p in pts], (0, 0, -1))
    P.mesh(f'tower_{k}', bm, 'paint', sharp=40.0)
    # a band of the second colour at its foot, the flange rings up it
    for z in (12.0, 24.0, 36.0):
        P.torus(f'flange_{k}', rad(z) + 0.01, 0.03, loc=tuple(F.p(0.0, 0.0, z)), material='paint', segs=32, rsegs=3)
    # the door: a steel leaf in the opening, hung at its west side, opening out
    hx, hy = -0.52, 2.06
    dw, dh = 1.0, 2.05
    since = len(P.statics)
    c = F.p(hx + dw / 2, hy, PLINTH + dh / 2)
    P.box(f'tower_door_{k}', (dw, 0.05, dh), tuple(c), 'paint_b', rot=(0, 0, math.degrees(F.a)), bev=0.006)
    for s in (0.05, -0.05):
        h = F.p(hx + dw - 0.12, hy + s, PLINTH + 1.05)
        P.box(f'tower_door_handle_{k}', (0.14, 0.04, 0.03), tuple(h), 'steel', rot=(0, 0, math.degrees(F.a)), bev=0.004)
    sign = F.p(hx + dw / 2, hy + 0.03, PLINTH + 1.65)
    P.box(f'tower_door_sign_{k}', (0.3, 0.006, 0.3), tuple(sign), 'paint', rot=(0, 0, math.degrees(F.a) + 0.0), bev=None)
    hp = F.p(hx, hy, PLINTH)
    P.mover(f'DOOR_base_{k}', P.statics[since:], tuple(hp))
    d = F.v(1.0, 0.0)
    card.door(f'DOOR_base_{k}', (hp.x, hp.y), dw, 0.05, 100.0, PLINTH + dh, (d.x, d.y), 1, pry='none', z0=PLINTH, secs=0.4, mat='metal')


def stair(P, B, card, F, k):
    """the spiral stair: 274 treads of grating round its column, 22 to a turn; a rail along the wall; at its head the
    landing, the nacelle's floor over the tower's head but over the stair's last turn"""
    bm = bmesh.new()
    for i in range(TREADS):
        a = A0 + i * THETA
        zt = PLINTH + (i + 1) * RISE
        a0, a1 = a - THETA / 2 - 0.01, a + THETA / 2 + 0.01
        lo = [F.p(r * math.cos(b), r * math.sin(b), zt - 0.05) for (r, b) in ((R_STEP0, a0), (R_STEP1, a0), (R_STEP1, a1), (R_STEP0, a1))]
        hi = [V((p.x, p.y, zt)) for p in lo]
        vl = [bm.verts.new(p) for p in lo]
        vh = [bm.verts.new(p) for p in hi]
        bm.faces.new(vl[::-1])
        bm.faces.new(vh)
        for j in range(4):
            jj = (j + 1) % 4
            bm.faces.new((vl[j], vl[jj], vh[jj], vh[j]))
        q = F.p(0.95 * math.cos(a), 0.95 * math.sin(a))
        Pr.tsolid(card, q.x, q.y, 0.66, 0.95 * math.tan(THETA / 2) + 0.06, zt - 0.3, zt, F.a + a, floor=True)
    C.outward(bm)
    P.mesh(f'spiral_{k}', bm, 'steel', sharp=40.0)
    col = F.p(0.0, 0.0, (PLINTH + 49.92) / 2)
    P.cyl(f'spiral_column_{k}', 0.16, 49.92 - PLINTH, tuple(col), 'paint_b', segs=10)
    q = F.p(0.0, 0.0)
    card.post(q.x, q.y, 0.17, PLINTH, 49.92)
    # the rail along the wall: a helix one metre over the treads
    pts = []
    for i in range(0, TREADS + 1, 2):
        a = A0 + i * THETA
        pts.append(F.p(1.5 * math.cos(a), 1.5 * math.sin(a), PLINTH + i * RISE + 1.0))
    for (p, q2) in zip(pts[:-1], pts[1:]):
        C.post(P, f'spiral_rail_{k}', tuple(p), tuple(q2), 0.02, 'paint_b', segs=4, bev=None)
    # the landing at its head (the sector of the tower's head not over its last turn) and the nacelle's floor
    a_end = A0 + (TREADS - 1) * THETA
    s0, s1 = a_end + THETA / 2, a_end + THETA / 2 + math.radians(164.0)
    n = 9
    lb = bmesh.new()
    for j in range(n):
        b0 = s0 + (s1 - s0) * j / n
        b1 = s0 + (s1 - s0) * (j + 1) / n
        bm_ = (b0 + b1) / 2
        q = F.p(1.2 * math.cos(bm_), 1.2 * math.sin(bm_))
        Pr.tsolid(card, q.x, q.y, 1.0, 1.2 * math.tan((b1 - b0) / 2) + 0.08, DECK - 0.15, DECK, F.a + bm_, floor=True)
        pts = [F.p(0.2 * math.cos(b0), 0.2 * math.sin(b0), DECK), F.p(2.2 * math.cos(b0), 2.2 * math.sin(b0), DECK),
               F.p(2.2 * math.cos(b1), 2.2 * math.sin(b1), DECK), F.p(0.2 * math.cos(b1), 0.2 * math.sin(b1), DECK)]
        quad(lb, [tuple(p) for p in pts], (0, 0, 1))
        quad(lb, [tuple(V((p.x, p.y, DECK - 0.06))) for p in pts], (0, 0, -1))
    P.mesh(f'landing_{k}', lb, 'steel', sharp=40.0)


def nacelle(P, B, card, F, k):
    """the nacelle on the tower's head: its shell, its floor round the tower's head, the machinery in it, the low
    cabinet in its nose; its yaw ring under it"""
    x0, x1, y0, y1, z0, z1 = NAC
    t = 0.2
    for (cx, cy, sx, sy) in (((x0 + x1) / 2, y0 + t / 2, x1 - x0, t), ((x0 + x1) / 2, y1 - t / 2, x1 - x0, t),
                             (x0 + t / 2, (y0 + y1) / 2, t, y1 - y0 - 2 * t), (x1 - t / 2, (y0 + y1) / 2, t, y1 - y0 - 2 * t)):
        c = F.p(cx, cy, (z0 + z1) / 2)
        N.bm_box(B['paint'], tuple(c), (sx, sy, z1 - z0), F.R)
        Pr.tsolid(card, c.x, c.y, sx / 2, sy / 2, DECK - 0.1, z1, F.a)
    c = F.p((x0 + x1) / 2, (y0 + y1) / 2, z1 - 0.1)
    N.bm_box(B['paint'], tuple(c), (x1 - x0, y1 - y0, 0.2), F.R)
    # its floor: behind the tower's head, the strips beside it; the yaw ring
    for (fx0, fx1, fy0, fy1) in ((x0 + t, x1 - t, y0 + t, -R_IN), (R_IN, x1 - t, -R_IN, y1 - t), (x0 + t, -R_IN, -R_IN, y1 - t)):
        c = F.p((fx0 + fx1) / 2, (fy0 + fy1) / 2, DECK - 0.1)
        N.bm_box(B['trim'], tuple(c), (fx1 - fx0, fy1 - fy0, 0.2), F.R)
        Pr.tsolid(card, c.x, c.y, (fx1 - fx0) / 2, (fy1 - fy0) / 2, DECK - 0.3, DECK, F.a, floor=True)
    P.torus(f'yaw_ring_{k}', 1.85, 0.08, loc=tuple(F.p(0.0, 0.0, TOWER_TOP - 0.05)), material='trim', segs=28, rsegs=4)
    # the machinery: the main shaft, the gearbox, the generator, a control cabinet; the low cabinet in the nose
    sh = F.p(0.0, 0.2, HUB_Z)
    P.cyl(f'shaft_{k}', 0.42, 3.8, tuple(sh), 'trim', axis=tuple(F.v(0, 1, 0)), segs=14)
    for (cx, cy, z, sx, sy, sz, mat) in ((0.0, -2.6, 52.3, 1.6, 1.6, 1.8, 'alu'), (1.75, -6.0, 50.93, 0.7, 0.5, 1.8, 'trim')):
        c = F.p(cx, cy, z)
        N.bm_box(B[mat], tuple(c), (sx, sy, sz), F.R)
        Pr.tsolid(card, c.x, c.y, sx / 2, sy / 2, DECK - 0.1, z + sz / 2, F.a)
    g = F.p(0.0, -4.8, 52.4)
    P.cyl(f'generator_{k}', 0.9, 1.6, tuple(g), 'trim', axis=tuple(F.v(0, 1, 0)), segs=18)
    Pr.tsolid(card, g.x, g.y, 0.9, 0.8, DECK - 0.1, 53.3, F.a)
    for (cx, cy) in ((-0.6, -4.8), (0.6, -4.8)):
        c = F.p(cx, cy, (DECK + 51.5) / 2)
        N.bm_box(B['trim'], tuple(c), (0.2, 1.2, 51.5 - DECK), F.R)
    nc = F.p(0.0, 1.35, (DECK + 50.4) / 2)
    N.bm_box(B['alu'], tuple(nc), (1.4, 0.4, 50.4 - DECK), F.R)
    Pr.tsolid(card, nc.x, nc.y, 0.7, 0.2, DECK - 0.1, 50.4, F.a, floor=True)
    for (j, sx) in enumerate((-0.4, 0.4)):
        q = F.p(sx, 1.35)
        card.spot(f'nose_{k}{j}', q.x, q.y, 50.4, math.degrees(F.a) - 90)
    for (j, (sx, sy)) in enumerate(((1.9, -0.8), (-1.9, -1.0), (1.5, -3.2), (-1.5, -4.4), (0.0, -6.0))):
        q = F.p(sx, sy)
        card.spot(f'nacelle_{k}{j}', q.x, q.y, DECK, math.degrees(F.a) + 70 * j)


def rotor(P, B, card, F, k):
    """the rotor: its hub and its spinner, three blades of 32.4 m white with red tips, turning (N_spin_rotor_<k>) about
    its axis (the game's z of its own frame); the red light on its nose (N_lit_nose_<k>)"""
    hub = F.p(0.0, HUB_Y, HUB_Z)
    ax = F.v(0.0, 1.0, 0.0)
    since = len(P.statics)
    P.cyl(f'hub_{k}', 1.7, 1.2, tuple(hub), 'paint', axis=tuple(ax), segs=20)
    P.cyl(f'spinner_{k}', 1.75, 2.4, tuple(hub + ax * 1.8), 'paint', axis=tuple(ax), segs=20, r2=0.25)
    # (the blades: sections from root to tip — their radius, chord, thickness, twist)
    secs = [(1.5, 1.6, 1.4, 20.0), (2.5, 2.4, 1.1, 18.0), (5.0, 3.0, 0.7, 14.0), (9.0, 2.6, 0.45, 9.0), (14.0, 2.1, 0.3, 5.0),
            (20.0, 1.6, 0.2, 3.0), (26.0, 1.1, 0.14, 1.5), (28.5, 0.9, 0.11, 1.0), (32.4, 0.45, 0.06, 0.0)]
    prof = [(0.35, 0.0), (0.12, 0.5), (-0.3, 0.32), (-0.65, 0.0), (-0.3, -0.22), (0.12, -0.4)]
    for b in range(3):
        ang = math.radians(90.0 + 120.0 * b)
        dr = V((math.cos(ang), 0.0, math.sin(ang)))
        tg = V((-math.sin(ang), 0.0, math.cos(ang)))
        yv = V((0.0, 1.0, 0.0))
        for (part, mat) in ((secs[:7], 'paint'), (secs[6:], 'paint_b')):
            bm = bmesh.new()
            rings = []
            for (r, ch, th, tw) in part:
                tw = math.radians(tw)
                cdir = tg * math.cos(tw) + yv * math.sin(tw)
                ndir = -tg * math.sin(tw) + yv * math.cos(tw)
                ring = []
                for (px, py) in prof:
                    loc = dr * r + cdir * (px * ch) + ndir * (py * th)
                    ring.append(bm.verts.new(tuple(hub + F.R @ loc)))
                rings.append(ring)
            for (ra, rb) in zip(rings[:-1], rings[1:]):
                for j in range(len(prof)):
                    jj = (j + 1) % len(prof)
                    bm.faces.new((ra[j], ra[jj], rb[jj], rb[j]))
            bm.faces.new(rings[0][::-1])
            bm.faces.new(rings[-1])
            C.outward(bm)
            P.mesh(f'blade_{k}', bm, mat, sharp=50.0)
    P.mover(f'N_spin_rotor_{k}', P.statics[since:], tuple(hub), rot_z=F.a)
    card.spin(f'rotor_{k}', 'z', rpm=16.0)
    # the light on its nose
    nose = hub + ax * 3.05
    o = P.sphere(f'nose_glass_{k}', 0.14, loc=tuple(nose), material='glass', u=12, v=8)
    P.mover(f'N_lit_nose_{k}', [o], tuple(nose))
    card.lamp(f'nose_{k}', nose.x, nose.y, nose.z, 80.0, warm=False, hours=(19, 6), beacon=True, color=0xff2a1a)


def kiosk(P, B, card, x, y, k):
    """the transformer's kiosk by a tower: concrete, its doorway open to the road, a shelf in it, its sign"""
    x0, x1, y0, y1 = x - 1.2, x + 1.2, y - 1.0, y + 1.0
    Pr.block_walls(B, card, x0, x1, y0, y1, -0.15, 2.4, 0.15, {'n': [(x - 0.5, x + 0.5, 0.0, 2.1, 'door')]}, outer='ceramic', inner='ceramic', band=0.15)
    Pr.slab(B, card, x0 + 0.15, x1 - 0.15, y0 + 0.15, y1 - 0.15, 0.0, th=0.15)
    Pr.slab(B, card, x0 - 0.1, x1 + 0.1, y0 - 0.1, y1 + 0.1, 2.55, th=0.15, top='rubber', under='ceramic', floor=False)
    Pr.shelving(P, B, card, f'kiosk_{k}', x, y0 + 0.5, yaw=0.0, k=7 * (1 if k == 'a' else 2))
    N.bm_box(B['paint_b'], (x + 0.85, y1 + 0.01, 1.5), (0.35, 0.02, 0.35))
    N.bm_box(B['trim'], (x + 0.85, y1 + 0.022, 1.5), (0.2, 0.004, 0.05))


def windfarm(P):
    card = N.Card('windfarm')
    B = N.new_set()
    for (k, cx, cy, yaw) in TURBINES:
        F = Frame(cx, cy, yaw)
        tower(P, B, card, F, k)
        stair(P, B, card, F, k)
        nacelle(P, B, card, F, k)
        rotor(P, B, card, F, k)
        kx = cx + (5.2 if k == 'a' else -5.2)
        kiosk(P, B, card, kx, -2.4, k)
        # the ground's spots round its foot (none in its kiosk nor on its steps)
        j = 0
        for i in range(36):
            a = math.radians(i * 10 + 5)
            r = 4.2 + 3.2 * abs(math.cos(a))
            x, y = cx + r * math.cos(a), cy + r * math.sin(a)
            if abs(x - kx) < 1.7 and abs(y + 2.4) < 1.5:
                continue
            if abs(y) > 4.7 or j >= 20:
                continue
            card.spot(f'g_{k}{j:02d}', x, y, 0.0, i * 37)
            j += 1
    N.finish_bms(P, B)
    P.views = [('a', -60, 12), ('b', 20, 18), ('c', 160, 14)]
    card.extra['plinth'] = 0.0
    movers = {d['name']: dict(move='hinge', axis='y', open=float(d['open'])) for d in card.doors}
    return card, (77.93, 10.13, 57.16), movers


TABLE = {'windfarm': windfarm}


def main(args):
    N.run(TABLE, args)
