"""
The motel (docs/ND/PLAN.md, ND5): a prefab place of Nomad Drive's Motel class (33.45 x 20.48 m, its eaves 2.65 m up;
eight rooms of a 4.28 x 3.48 m floor at 4.58 m apart — six in a row, two in a wing facing across the yard; a reception
with its desk (1.96 x 0.56 m and a side to it), eleven lockers (six of one door, five of two: each door locked one time
in four) and two electric boxes (each door stuck one time in four); a room's door locked one time in twenty and stuck
one in seven; a switch to each room's light, two or three found on) in our own design:

    blender -b --factory-startup --python tools/blender/build.py -- nd/motel [motel] [--norender] [--noao] [--toon]

An L of rooms round a yard, painted in the motel's colour (paint) and trimmed white (paint_b), under mono-pitch tin
roofs that run down over a covered walk at their doors; the rooms' doors stained wood, a lamp over each, the rooms'
numbers by them; in each room a double bed against its wall, a bathroom across its back (a sink, a shower, the
place of its WC); the reception at the road end of the wing, its lockers along its wall; the motel's sign on a pole by
the road (汽车旅馆, its vacancy below: neon from six in the evening). Its frame and its card: nd/_nd.py.
"""
import math

import bmesh
import bpy
from mathutils import Matrix, Vector

from parts import _kit as K
from parts._kit import V
from places import _common as C
from nd import _nd as N
from nd._nd import Face, face_box
from nd import station as S

PL = 0.15                      # the floor over the yard
G = -PL                        # the yard (the levelled ground) in the building's frame
TW, TP = 0.18, 0.12            # walls: outside, between rooms
RW = 4.58                      # a room's width (Nomad Drive's spacing)
DM, DE = 5.2, 5.92             # the rooms' depth: the row's, the wing's
X0, XE, XB = -16.7, 10.78, 16.7      # the row's west end; the wing's front (and the row's east end); the wing's back
YB, YF = -10.25, -5.05               # the row's back and its front
PD = 2.1                             # the covered walk's depth
YP, XP = YF + PD, XE - PD            # the walks' front edges
YR0, YR1 = 4.11, 10.25               # the reception, at the wing's road end
CEIL = 2.7
EAVE, TOP = 2.75, 3.55               # the roofs' low and high edges
SIGN = (-14.9, 9.1)
# a big roof's sheets: their waves coarser, their lengths in long rows (a few thousand faces, not a hundred thousand)
BIG = dict(period=0.2, segs=3, rowlen=2.6)


def zmain(y):
    """the row's roof over a point of it (falling from its back to the walk's edge)"""
    return EAVE + (TOP - EAVE) * (YP - y) / (YP - YB)


def zeast(x):
    """the wing's roof (falling from its back to its walk's edge)"""
    return EAVE + (TOP - EAVE) * (x - XP) / (XB - XP)


def jit(k, a=0.0):
    return C.jit(k, a)


class RF:
    """A room's frame: s along its front wall from its origin, d into it, z up (Blender XY). A mirrored room has its
    layout the other way round along s (its door at the other end): s is turned as it is asked."""

    def __init__(self, ox, oy, sx, sy, W, D, zr, mirror=False):
        self.o = V((ox, oy, 0.0))
        self.sv = V((sx, sy, 0.0))
        self.dv = V((sy, -sx, 0.0))
        self.W, self.D, self.zr, self.m = W, D, zr, mirror

    def s(self, s):
        return self.W - s if self.m else s

    def p(self, s, d, z=0.0, raw=False):
        return self.o + self.sv * (s if raw else self.s(s)) + self.dv * d + V((0.0, 0.0, z))

    def fs(self, a, b):
        """a span of the layout as a span of the front wall's face (unturned)"""
        a, b = self.s(a), self.s(b)
        return (min(a, b), max(a, b))

    def ang(self, ds, dd):
        """a direction in the room (along s, into it) as a Blender angle (degrees)"""
        v = self.sv * (-ds if self.m else ds) + self.dv * dd
        return math.degrees(math.atan2(v.y, v.x))

    def roof(self, d):
        """the roof over a depth into it"""
        q = self.o + self.dv * d
        return self.zr(q)


def rbox(bm, rf, s0, s1, d0, d1, z0, z1, rot=None):
    """an upright box in a room's frame (both wings lie square to the axes: a box in XY)"""
    a, b = rf.p(s0, d0), rf.p(s1, d1)
    N.bm_box(bm, ((a.x + b.x) / 2, (a.y + b.y) / 2, (z0 + z1) / 2), (abs(b.x - a.x), abs(b.y - a.y), z1 - z0), rot)


def rsolid(card, rf, s0, s1, d0, d1, z0, z1, floor=False):
    a, b = rf.p(s0, d0), rf.p(s1, d1)
    card.box(min(a.x, b.x), max(a.x, b.x), min(a.y, b.y), max(a.y, b.y), z0, z1, floor=floor)


def gable(B, face, t, zlo, top, mat='paint', inner='paint_b'):
    """a wall along a face whose top follows the roof (top(s) -> z), its inside coated"""
    prof = [(-t + 0.012, zlo), (0.0, zlo), (0.0, 9.0), (-t + 0.012, 9.0)]
    N.prism(B[mat], face, prof, 0.0, face.L, nseg=1, top=top)
    N.prism(B[inner], face, [(-t, zlo), (-t + 0.012, zlo), (-t + 0.012, 9.0), (-t, 9.0)], 0.0, face.L, nseg=1, top=top)


def room(P, B, card, k, rf, last=False, first=False, gable_lo=False, gable_hi=False):
    """
    Room k (its number k + 1): its front wall with its door and window, its back wall, the wall at its s = 0 end (and
    at its far end, for the last of a row), its floor and ceiling; inside, the bed against its end wall, the bathroom
    across its back (its partition with a doorway, a sink and its mirror, a shower, the WC's place); the light and its
    switch; the door with its number and the lamp over it; its spots.
    """
    W, D = rf.W, rf.D
    n = k + 1
    tag = f'r{n}'
    # ---- the walls: the front (door, window), the back, the ends
    front = Face(tuple(rf.p(0, 0, raw=True))[:2], tuple(rf.p(W, 0, raw=True))[:2], tuple(-rf.dv)[:2], TW)
    back = Face(tuple(rf.p(W, D, raw=True))[:2], tuple(rf.p(0, D, raw=True))[:2], tuple(rf.dv)[:2], TW)
    door = rf.fs(3.25, 4.15) + (0.0, 2.1)
    win = rf.fs(0.75, 2.15) + (0.9, 2.1)
    S.solid_wall(B, front, G, rf.roof(0.0), [door, win], 'paint', inner='paint_b')
    # (the back face runs the other way: its spans turned)
    bw = rf.fs(0.9, 1.5)
    bw = (W - bw[1], W - bw[0], 1.75, 2.25)
    S.solid_wall(B, back, G, rf.roof(D), [bw], 'paint', inner='paint_b')
    N.window(B, front, win[0], win[1], win[2], win[3], rows=2, cols=2, casing=0.07)
    N.window(B, back, *bw, rows=1, cols=1, casing=0.05)
    S.opening_trim(B, front, *door, mat='paint_b')
    for f in (front, back):
        S.band(B, 'trim', f, 0.0, 0.03, G, 0.12, gaps=[(door[0] - 0.07, door[1] + 0.07)] if f is front else ())
    # (the end walls: between two rooms a partition up to the ceiling; at a row's end one up to its roof)
    for (s_end, out_sign, hi) in ((0.0, -1, gable_lo), (W, 1, gable_hi)):
        if s_end == W and not last:
            continue
        a = rf.p(s_end, 0, raw=True)
        b = rf.p(s_end, D, raw=True)
        out = rf.sv * out_sign
        if hi:
            f = Face((a.x, a.y), (b.x, b.y), (out.x, out.y), TW)
            # (Face's s runs from the front: the roof over it by its depth; turned so it is the wall's outer face)
            if out_sign < 0:
                f = Face((b.x, b.y), (a.x, a.y), (out.x, out.y), TW)
                gable(B, f, TW, G, lambda s, f=f: rf.roof(D - s))
            else:
                gable(B, f, TW, G, lambda s: rf.roof(s))
        else:
            # a partition (its own two faces: both rooms' plaster)
            lo = a + rf.sv * (-TP / 2)
            hi_ = b + rf.sv * (TP / 2)
            N.bm_box(B['paint_b'], ((lo.x + hi_.x) / 2, (lo.y + hi_.y) / 2, (G + CEIL) / 2), (max(abs(hi_.x - lo.x), 0.001), max(abs(hi_.y - lo.y), 0.001), CEIL - G))
        e0 = rf.p(s_end, 0, raw=True) + rf.sv * (-TP / 2)
        e1 = rf.p(s_end, D, raw=True) + rf.sv * (TP / 2)
        card.box(min(e0.x, e1.x), max(e0.x, e1.x), min(e0.y, e1.y), max(e0.y, e1.y), G, CEIL if not hi else rf.roof(0.0))
    # the front and back walls' solids (the door's gap)
    for (a, b) in ((0.0, door[0]), (door[1], W)):
        q0, q1 = rf.p(a, 0, raw=True), rf.p(b, TW, raw=True)
        card.box(min(q0.x, q1.x), max(q0.x, q1.x), min(q0.y, q1.y), max(q0.y, q1.y), G, rf.roof(0.0))
    q0, q1 = rf.p(door[0], 0, raw=True), rf.p(door[1], TW, raw=True)
    card.box(min(q0.x, q1.x), max(q0.x, q1.x), min(q0.y, q1.y), max(q0.y, q1.y), 2.1, rf.roof(0.0))
    q0, q1 = rf.p(0, D - TW, raw=True), rf.p(W, D, raw=True)
    card.box(min(q0.x, q1.x), max(q0.x, q1.x), min(q0.y, q1.y), max(q0.y, q1.y), G, rf.roof(D))
    # ---- the floor (boards in the room, tiles in its bathroom), the ceiling
    bath = D - 1.62
    rbox(B['wood'], rf, 0.06, W - 0.06, TW - 0.02, bath, -0.03, 0.0)
    for j in range(1, 8):
        s = 0.06 + j * (W - 0.12) / 8
        rbox(B['trim'], rf, s - 0.004, s + 0.004, TW, bath, 0.0, 0.0012)
    rbox(B['ceramic'], rf, 0.06, W - 0.06, bath, D - TW + 0.02, -0.03, 0.0)
    rbox(B['paint_b'], rf, 0.06, W - 0.06, TW - 0.02, D - TW + 0.02, CEIL - 0.03, CEIL)
    rsolid(card, rf, 0.0, W, 0.0, D, G - 0.5, 0.0, floor=True)
    # ---- the bathroom: its partition and doorway, the sink and its mirror, the shower, the WC's place
    for (a, b, z0) in ((0.06, 3.3, 0.0), (4.1, W - 0.06, 0.0), (3.3, 4.1, 2.05)):
        rbox(B['paint_b'], rf, a, b, bath - 0.05, bath + 0.05, z0, CEIL)
        rsolid(card, rf, a, b, bath - 0.05, bath + 0.05, z0, CEIL)
    sx = 1.45
    rbox(B['ceramic'], rf, sx - 0.25, sx + 0.25, D - TW - 0.42, D - TW, 0.78, 0.86)
    rbox(B['ceramic'], rf, sx - 0.09, sx + 0.09, D - TW - 0.25, D - TW - 0.07, 0.0, 0.78)
    rbox(B['steel'], rf, sx - 0.015, sx + 0.015, D - TW - 0.1, D - TW - 0.02, 0.86, 1.0)
    rbox(B['glass'], rf, sx - 0.25, sx + 0.25, D - TW - 0.012, D - TW - 0.004, 1.15, 1.75)
    rsolid(card, rf, sx - 0.25, sx + 0.25, D - TW - 0.42, D - TW, 0.0, 0.86, floor=True)
    card.spot(f'{tag}_sink', *tuple(rf.p(sx + 0.12, D - TW - 0.2))[:2], 0.86, rf.ang(0, -1))
    rbox(B['ceramic'], rf, 2.05, 3.15, D - TW - 1.0, D - TW, 0.0, 0.08)
    for (a, b) in ((2.05, 2.08), (3.12, 3.15)):
        rbox(B['steel'], rf, a, b, D - TW - 1.0, D - TW, 2.02, 2.05)
    rbox(B['fabric'], rf, 2.1, 3.1, D - TW - 1.0, D - TW - 0.98, 0.5, 2.0)
    rbox(B['steel'], rf, 2.55, 2.6, D - TW - 0.06, D - TW, 1.6, 2.1)
    card.spot(f'{tag}_wc', *tuple(rf.p(0.55, D - TW - 0.34))[:2], 0.0, rf.ang(0, -1))
    # ---- the bed against the end wall at s = 0: its base and legs, mattress, spread, pillows, headboard
    rbox(B['wood'], rf, 0.12, 2.18, 0.98, 2.62, 0.14, 0.3)
    for (a, b) in ((0.14, 0.2), (2.1, 2.16)):
        for (c, d) in ((1.0, 1.06), (2.54, 2.6)):
            rbox(B['wood'], rf, a, b, c, d, 0.0, 0.14)
    rbox(B['paint_b'], rf, 0.14, 2.16, 1.0, 2.6, 0.3, 0.5)
    rbox(B['paint'], rf, 0.6, 2.2, 0.97, 2.63, 0.48, 0.535)
    for (c, d) in ((0.95, 0.97), (2.63, 2.65)):
        rbox(B['paint'], rf, 0.6, 2.2, c, d, 0.3, 0.535)
    rbox(B['paint'], rf, 2.2, 2.22, 0.97, 2.63, 0.3, 0.535)
    for (c, d) in ((1.12, 1.74), (1.86, 2.48)):
        rbox(B['paint_b'], rf, 0.2, 0.56, c, d, 0.5, 0.63)
    rbox(B['wood'], rf, 0.06, 0.13, 0.92, 2.68, 0.14, 1.12)
    rbox(B['wood'], rf, 0.05, 0.14, 0.9, 2.7, 1.08, 1.15)
    rsolid(card, rf, 0.06, 2.22, 0.95, 2.65, 0.0, 0.53, floor=True)
    card.spot(f'{tag}_bed', *tuple(rf.p(1.45, 1.55 + 0.35 * jit(k, 1.0)))[:2], 0.535, rf.ang(1, 0) + 40 * jit(k, 2.0))
    # ---- where things stand
    card.spot(f'{tag}_ns', *tuple(rf.p(0.36, 2.95))[:2], 0.0, rf.ang(0, -1))
    card.spot(f'{tag}_cab', *tuple(rf.p(W - 0.4, 2.05))[:2], 0.0, rf.ang(-1, 0))
    card.spot(f'{tag}_chair', *tuple(rf.p(2.75, 0.7))[:2], 0.0, rf.ang(-1, 0.4))
    card.spot(f'{tag}_fa', *tuple(rf.p(3.05, 2.2))[:2], 0.0, rf.ang(0.3, 1) + 50 * jit(k, 3.0))
    card.spot(f'{tag}_fb', *tuple(rf.p(1.35, 3.25))[:2], 0.0, rf.ang(1, 0.2) + 60 * jit(k, 4.0))
    # ---- the light and its switch inside the door
    lp = rf.p(W / 2, 1.85)
    P.box('lamp_rose', (0.16, 0.16, 0.04), (lp.x, lp.y, CEIL - 0.03), 'paint_b', bev=0.008)
    S.lit_panel(P, f'{tag}_globe', tag, (0.26, 0.26, 0.12), (lp.x, lp.y, CEIL - 0.11))
    card.lamp(tag, lp.x, lp.y, CEIL - 0.15, 5.0)
    sw = rf.p(3.05, TW + 0.008)
    plate = rf.p(3.05, TW + 0.006)
    N.bm_box(B['paint_b'], (plate.x, plate.y, 1.35), (0.075 if abs(rf.sv.x) > 0.5 else 0.012, 0.012 if abs(rf.sv.x) > 0.5 else 0.075, 0.12))
    card.switch(tag, sw.x, sw.y, 1.35, [tag])
    # ---- the door: stained boards in a frame, its knob; hung at its end nearer the room's middle, opening in
    dw, dh, dt = 0.88, 2.06, 0.045
    hinge = rf.p(3.27, TW / 2)
    leaf_dir = rf.sv * (1 if not rf.m else -1)
    since = len(P.statics)
    hz = (hinge.x, hinge.y)
    for j in range(4):
        a = 0.006 + j * dw / 4
        c = rf.p(3.27 + a + dw / 8 - 0.003, TW / 2)
        P.box('door_board', (dw / 4 - 0.006 if abs(rf.sv.x) > 0.5 else dt, dt if abs(rf.sv.x) > 0.5 else dw / 4 - 0.006, dh), (c.x, c.y, dh / 2 + 0.005), 'wood', bev=0.003)
    for z in (0.35, 1.7):
        c = rf.p(3.27 + dw / 2, TW / 2 + dt / 2 + 0.012)
        P.box('door_rail', (dw - 0.06 if abs(rf.sv.x) > 0.5 else 0.024, 0.024 if abs(rf.sv.x) > 0.5 else dw - 0.06, 0.1), (c.x, c.y, z), 'wood', bev=0.003)
    kn = rf.p(3.27 + dw - 0.08, TW / 2 - dt / 2 - 0.03)
    P.sphere('knob', 0.03, loc=(kn.x, kn.y, 1.0), material='chrome', u=8, v=4)
    kn2 = rf.p(3.27 + dw - 0.08, TW / 2 + dt / 2 + 0.03)
    P.sphere('knob', 0.03, loc=(kn2.x, kn2.y, 1.0), material='chrome', u=8, v=4)
    P.mover(f'DOOR_{tag}', P.statics[since:], (hinge.x, hinge.y, 0.0))
    # (opening into the room: turning from the leaf's direction towards the inside)
    into = rf.dv
    cross = leaf_dir.x * into.y - leaf_dir.y * into.x
    card.door(f'DOOR_{tag}', hz, dw, dt, 90.0, dh, (leaf_dir.x, leaf_dir.y), 1 if cross > 0 else -1, secs=1.0)
    # ---- its number by the door, the lamp over it (lit at night: its pool on the walk)
    nb = rf.p(4.38, -0.03)
    N.bm_box(B['paint_b'], (nb.x, nb.y, 1.6), (0.16 if abs(rf.sv.x) > 0.5 else 0.02, 0.02 if abs(rf.sv.x) > 0.5 else 0.16, 0.2))
    g = rf.p(4.38, -0.045)
    N.bm_box(B['trim'], (g.x, g.y, 1.6), (0.07 if abs(rf.sv.x) > 0.5 else 0.008, 0.008 if abs(rf.sv.x) > 0.5 else 0.07, 0.12))
    ll = rf.p(3.7, -0.12)
    P.box('porch_lamp_back', (0.14 if abs(rf.sv.x) > 0.5 else 0.03, 0.03 if abs(rf.sv.x) > 0.5 else 0.14, 0.2), tuple(rf.p(3.7, -0.015)) [:2] + (2.42,), 'trim', bev=0.004)
    S.lit_panel(P, f'{tag}_porch_glass', f'p{n}', (0.12, 0.12, 0.14), (ll.x, ll.y, 2.38))
    P.box('porch_lamp_cap', (0.16, 0.16, 0.03), (ll.x, ll.y, 2.47), 'trim', bev=0.004)
    card.lamp(f'p{n}', ll.x, ll.y, 2.38, 7.0, hours=(18, 6), pool=0.0)
    return rf


def walk(P, B, card):
    """The covered walks along the rooms' doors: their slabs and their edges' step, the posts and the beam under the
    roof's edge; the yard's parking bays."""
    # the slabs (the floor's level), their kerbs
    for (x0, x1, y0, y1) in ((X0, XE, YF, YP), (XP, XE, YP, YR1)):
        N.bm_box(B['paint_b'], ((x0 + x1) / 2, (y0 + y1) / 2, G / 2), (x1 - x0, y1 - y0, -G))
        card.box(x0, x1, y0, y1, G - 0.5, 0.0, floor=True)
    N.bm_box(B['trim'], ((X0 + XE) / 2, YP - 0.04, G / 2), (XE - X0, 0.08, -G))
    N.bm_box(B['trim'], (XP + 0.04, (YP + YR1) / 2, G / 2), (0.08, YR1 - YP, -G))
    # the posts at the rooms' partitions, the beam along the edge
    for k in range(7):
        x = X0 + 0.12 + k * RW if k < 6 else XP + 0.12
        C.post(P, 'walk_post', (x, YP - 0.12, 0.0), (x, YP - 0.12, zmain(YP - 0.12) - 0.08), 0.06, 'paint_b', segs=8)
        card.post(x, YP - 0.12, 0.07, 0.0, zmain(YP - 0.12))
    for j in range(1, 4):
        y = YP - 0.12 + j * (YR1 - 0.12 - (YP - 0.12)) / 3
        C.post(P, 'walk_post', (XP + 0.12, y, 0.0), (XP + 0.12, y, zeast(XP + 0.12) - 0.08), 0.06, 'paint_b', segs=8)
        card.post(XP + 0.12, y, 0.07, 0.0, zeast(XP + 0.12))
    N.bm_box(B['paint_b'], ((X0 + XE) / 2, YP - 0.12, zmain(YP - 0.12) - 0.08), (XE - X0, 0.12, 0.14))
    N.bm_box(B['paint_b'], (XP + 0.12, (YP + YR1) / 2, zeast(XP + 0.12) - 0.08), (0.12, YR1 - YP, 0.14))
    # the yard's bays, painted on it: one to a room
    for k in range(6):
        x = X0 + k * RW
        N.bm_box(B['paint_b'], (x + 0.06, YP + 2.6, G + 0.002), (0.1, 5.0, 0.004))
    N.bm_box(B['paint_b'], (X0 + 6 * RW - 0.06, YP + 2.6, G + 0.002), (0.1, 5.0, 0.004))
    for j in range(3):
        y = YF + 0.9 + j * RW
        N.bm_box(B['paint_b'], (XP - 2.6, y, G + 0.002), (5.0, 0.1, 0.004))
    # the yard's spots, the ground's behind
    for k, (x, y, f) in enumerate(((-9.5, 5.8, 30), (-1.0, 7.2, 130), (4.6, 3.4, 250))):
        card.spot(f'yard_{"abc"[k]}', x, y, G, f)
    for k, (x, y, f) in enumerate(((-13.0, YB - 1.0, 10), (-5.5, YB - 1.3, 80), (2.4, YB - 0.9, 200), (8.5, YB - 1.2, 300))):
        card.spot(f'back_{"abcd"[k]}', x, y, G, f)


def roofs(P, B, card):
    """The tin roofs: the row's falling over its walk to the yard, the wing's over its own walk to the west, its
    walk's strip beyond the corner; the gutters at their low edges; the spots on them (hard to come by)."""
    # the row's (its back edge a little behind the back wall, its low edge a little out past the walk's)
    def tin_main():
        yb, yf = YB - 0.3, YP + 0.12
        zb, zf = zmain(yb) + 0.07, zmain(yf) + 0.07
        L = math.hypot(yf - yb, zf - zb)
        N.tin(B, (X0 - 0.25, yb, zb), (1, 0, 0), (0, (yf - yb) / L, (zf - zb) / L), XE - X0 + 0.25, L, seed=0.2, rust_every=11, **BIG)
        N.bm_box(B['trim'], ((X0 + XE) / 2 - 0.12, yf + 0.05, zf - 0.05), (XE - X0 + 0.25, 0.1, 0.08))
    def tin_east():
        xb, xf = XB + 0.3, XE
        zb, zf = zeast(xb) + 0.07, zeast(xf) + 0.07
        L = math.hypot(xb - xf, zb - zf)
        N.tin(B, (xb, YB - 0.3, zb), (0, 1, 0), ((xf - xb) / L, 0, (zf - zb) / L), YR1 - YB + 0.55, L, seed=0.7, rust_every=11, **BIG)
        xb2, xf2 = XE, XP - 0.12
        zb2, zf2 = zeast(xb2) + 0.07, zeast(xf2) + 0.07
        L2 = math.hypot(xb2 - xf2, zb2 - zf2)
        N.tin(B, (xb2, YP + 0.12, zb2), (0, 1, 0), ((xf2 - xb2) / L2, 0, (zf2 - zb2) / L2), YR1 - YP + 0.13, L2, seed=0.9, rust_every=11, **BIG)
        N.bm_box(B['trim'], (xf2 - 0.05, (YP + YR1) / 2 + 0.06, zf2 - 0.05), (0.1, YR1 - YP + 0.13, 0.08))
    tin_main()
    tin_east()
    for k, (x, y) in enumerate(((-12.0, -7.0), (2.0, -8.5), (13.5, -2.0), (14.0, 7.5))):
        z = zmain(y) if x < XE else zeast(x)
        card.spot(f'eave_{"abcd"[k]}', x, y, z + 0.1, 40 + 90 * k)


def wing_ends(P, B, card):
    """The wing's two ends: the store room's back wall behind room 7 (to the yard behind) and its back door; the
    wing's walls at the back (east) between them; the store room's shelves."""
    # the store room: the corner behind room 6, its back wall (Y = YB) and the wing's back (X = XB) over it
    # (its back is the wing's end: below the door's head a wall with the doorway, above it to the roof as it falls)
    back = Face((XB, YB), (XE, YB), (0, -1), TW)
    S.solid_wall(B, back, G, 2.05, [(1.2, 2.1, 0.0, 2.05)], 'paint', inner='paint_b')
    N.prism(B['paint'], back, [(-TW + 0.012, 2.05), (0.0, 2.05), (0.0, 9.0), (-TW + 0.012, 9.0)], 0.0, back.L, nseg=1, top=lambda s: zeast(XB - s))
    N.prism(B['paint_b'], back, [(-TW, 2.05), (-TW + 0.012, 2.05), (-TW + 0.012, 9.0), (-TW, 9.0)], 0.0, back.L, nseg=1, top=lambda s: zeast(XB - s))
    # (the wing's back over the store room and the reception: the rooms between have their own)
    for (ya, yb) in ((YF, YB), (YR1, YR0)):
        S.solid_wall(B, Face((XB, ya), (XB, yb), (1, 0), TW), G, TOP, [], 'paint', inner='paint_b')
        S.band(B, 'trim', Face((XB, ya), (XB, yb), (1, 0), TW), 0.0, 0.03, G, 0.12)
    S.band(B, 'trim', back, 0.0, 0.03, G, 0.12, gaps=[(1.2 - 0.07, 2.1 + 0.07)])
    S.opening_trim(B, back, 1.2, 2.1, 0.0, 2.05, mat='paint_b')
    # (the store room's floor and ceiling; its shelves of linen)
    N.bm_box(B['ceramic'], ((XE + XB) / 2, (YB + YF) / 2, -0.015), (XB - XE - 0.3, YF - YB - 0.3, 0.03))
    N.bm_box(B['paint_b'], ((XE + XB) / 2, (YB + YF) / 2, CEIL - 0.015), (XB - XE - 0.3, YF - YB - 0.3, 0.03))
    card.box(XE, XB, YB, YF, G - 0.5, 0.0, floor=True)
    for z in (0.5, 1.2, 1.9):
        N.bm_box(B['wood'], (XB - TW - 0.25, (YB + YF) / 2, z), (0.5, 3.4, 0.03))
        for j in range(5):
            N.bm_box(B['paint_b'] if (j + int(z * 10)) % 3 else B['fabric'], (XB - TW - 0.25, (YB + YF) / 2 - 1.4 + j * 0.7, z + 0.09), (0.4, 0.5, 0.16))
    for y in ((YB + YF) / 2 - 1.7, (YB + YF) / 2 + 1.7):
        N.bm_box(B['wood'], (XB - TW - 0.25, y, 1.0), (0.5, 0.04, 2.0))
    card.box(XB - TW - 0.5, XB - TW, (YB + YF) / 2 - 1.72, (YB + YF) / 2 + 1.72, 0.0, 2.0)
    for z in (0.5, 1.2, 1.9):
        card.box(XB - TW - 0.48, XB - TW - 0.02, (YB + YF) / 2 - 1.68, (YB + YF) / 2 + 1.68, z - 0.03, z + 0.015, floor=True)
    P.cyl('heater', 0.28, 1.5, loc=(XE + 0.45, YB + TW + 0.4, 0.75), material='paint_b', segs=20)
    card.post(XE + 0.45, YB + TW + 0.4, 0.3, 0.0, 1.5)
    for k, (x, y, z, f) in enumerate(((XB - TW - 0.25, (YB + YF) / 2 - 0.35, 1.22, 180), (XE + 1.6, YF - 1.2, 0.0, 300), (XE + 3.4, YB + 1.3, 0.0, 60))):
        card.spot(f'ut_{"abc"[k]}', x, y, z, f)
    # its back door (stained boards, a hasp): hung at its west side, opening in
    hx, hy = XB - 2.1 + 0.02, YB + TW / 2
    dw, dh, dt = 0.88, 2.03, 0.045
    since = len(P.statics)
    for j in range(4):
        P.box('door_board', (dw / 4 - 0.006, dt, dh), (hx + (j + 0.5) * dw / 4, hy, dh / 2 + 0.005), 'wood', bev=0.003)
    P.box('hasp', (0.03, 0.02, 0.14), (hx + dw - 0.08, hy - dt / 2 - 0.01, 1.05), 'rust', bev=0.002)
    P.mover('DOOR_store', P.statics[since:], (hx, hy, 0.0))
    card.door('DOOR_store', (hx, hy), dw, dt, 90.0, dh, (1.0, 0.0), 1, pry='house', secs=1.0)
    card.box(XE, XB - 2.1, YB, YB + TW, G, TOP)
    card.box(XB - 1.2, XB, YB, YB + TW, G, TOP)
    card.box(XB - 2.1, XB - 1.2, YB, YB + TW, 2.05, TOP)
    card.box(XB - TW, XB, YB, YR1, G, TOP)
    # the electric boxes on the row's back wall, outside (two doors each, stuck one time in four)
    for j, x in enumerate((X0 + 1.6 * RW, X0 + 4.3 * RW)):
        y = YB - 0.02
        N.bm_box(B['steel'], (x, y - 0.12, 1.25), (0.62, 0.24, 0.8))
        N.bm_box(B['trim'], (x, y - 0.12, 1.67), (0.66, 0.28, 0.04))
        C.post(P, 'conduit', (x, y - 0.08, 1.67), (x, y - 0.08, TOP - 0.1), 0.02, 'steel', segs=6)
        card.box(x - 0.31, x + 0.31, y - 0.24, y, 0.85, 1.65)
        card.spot(f'eb{j}', x, y - 0.12, 0.86, 270)
        for side, sg in (('l', -1), ('r', 1)):
            hx2 = x + sg * 0.3
            since = len(P.statics)
            P.box('eb_door', (0.3, 0.02, 0.76), (x + sg * 0.15, y - 0.25, 1.25), 'steel', bev=0.003)
            P.box('eb_handle', (0.02, 0.02, 0.08), (x + sg * 0.03, y - 0.27, 1.25), 'trim', bev=None)
            P.mover(f'DOOR_eb{j}{side}', P.statics[since:], (hx2, y - 0.25, 0.0))
            card.door(f'DOOR_eb{j}{side}', (hx2, y - 0.25), 0.3, 0.02, 110.0, 1.63, (-sg, 0.0), -1 if sg < 0 else 1, pry='stuck', z0=0.87,
                      box=(x - 0.3, x + 0.3, y - 0.24, y, 0.85, 1.65), secs=0.4, mat='metal')


def reception(P, B, card):
    """The reception at the road end of the wing: its glass door and window on the walk, its window to the road; its
    desk and its side, the keys' board behind it, the lockers along its wall to room 8, a sofa's place by the window;
    its light (and the switch) and the lamp over its door."""
    x0, x1, y0, y1 = XE, XB, YR0, YR1
    front = Face((XE, YR1), (XE, YR0), (-1, 0), TW)
    road = Face((XB, YR1), (XE, YR1), (0, 1), TW)
    dr = (1.0, 2.0, 0.0, 2.2)
    wn = (2.5, 5.6, 0.8, 2.3)
    S.solid_wall(B, front, G, zeast(XE), [dr, wn], 'paint', inner='paint_b')
    S.shop_window(B, front, *wn, mullions=2)
    S.opening_trim(B, front, *dr, mat='paint_b')
    S.band(B, 'trim', front, 0.0, 0.03, G, 0.12, gaps=[(dr[0] - 0.07, dr[1] + 0.07)])
    # its road end: the wing's gable with its window
    prof = [(-TW + 0.012, G), (0.0, G), (0.0, 9.0), (-TW + 0.012, 9.0)]
    top = lambda s: zeast(XB - s)
    holes = [(1.2, 4.6, 0.9, 2.3)]
    for (a, b) in ((0.0, 1.2), (4.6, road.L)):
        N.prism(B['paint'], road, prof, a, b, nseg=1, top=top)
        N.prism(B['paint_b'], road, [(-TW, G), (-TW + 0.012, G), (-TW + 0.012, 9.0), (-TW, 9.0)], a, b, nseg=1, top=top)
    for (z0, z1) in ((G, 0.9), (2.3, 9.0)):
        N.prism(B['paint'], road, [(-TW + 0.012, z0), (0.0, z0), (0.0, z1), (-TW + 0.012, z1)], 1.2, 4.6, nseg=1, top=top)
        N.prism(B['paint_b'], road, [(-TW, z0), (-TW + 0.012, z0), (-TW + 0.012, z1), (-TW, z1)], 1.2, 4.6, nseg=1, top=top)
    S.shop_window(B, road, *holes[0], mullions=2)
    S.band(B, 'trim', road, 0.0, 0.03, G, 0.12)
    card.box(XE, XB, YR1 - TW, YR1, G, TOP)
    card.box(XE, XE + TW, YR0, YR1 - 2.0, G, zeast(XE))
    card.box(XE, XE + TW, YR1 - 1.0, YR1, G, zeast(XE))
    card.box(XE, XE + TW, YR1 - 2.0, YR1 - 1.0, 2.2, zeast(XE))
    # floor, ceiling
    N.bm_box(B['wood'], ((x0 + x1) / 2, (y0 + y1) / 2, -0.015), (x1 - x0 - 0.3, y1 - y0 - 0.2, 0.03))
    N.bm_box(B['paint_b'], ((x0 + x1) / 2, (y0 + y1) / 2, CEIL - 0.015), (x1 - x0 - 0.3, y1 - y0 - 0.2, 0.03))
    card.box(x0, x1, y0, y1, G - 0.5, 0.0, floor=True)
    # the desk: its counter along the room, its side at the north end; the bell, the register; the keys' board
    dx0, dx1, dy0, dy1 = 14.2, 14.76, 6.4, 8.36
    N.bm_box(B['paint'], ((dx0 + dx1) / 2, (dy0 + dy1) / 2, 0.5), (dx1 - dx0, dy1 - dy0, 1.0))
    N.bm_box(B['paint'], ((dx0 + 15.2) / 2, dy1 + 0.28, 0.5), (15.2 - dx0, 0.56, 1.0))
    N.bm_box(B['wood'], ((dx0 + dx1) / 2 - 0.02, (dy0 + dy1) / 2, 1.02), (dx1 - dx0 + 0.1, dy1 - dy0 + 0.04, 0.04))
    N.bm_box(B['wood'], ((dx0 + 15.2) / 2, dy1 + 0.28, 1.02), (15.2 - dx0 + 0.06, 0.62, 0.04))
    for j in range(4):
        N.bm_box(B['paint_b'], (dx0 - 0.012, dy0 + 0.25 + j * 0.49, 0.5), (0.012, 0.4, 0.78))
    card.box(dx0, dx1, dy0, dy1, 0.0, 1.04, floor=True)
    card.box(dx0, 15.2, dy1, dy1 + 0.56, 0.0, 1.04, floor=True)
    P.cyl('bell', 0.04, 0.03, loc=(dx0 + 0.15, dy0 + 0.35, 1.055), material='chrome', segs=14)
    P.sphere('bell_top', 0.035, loc=(dx0 + 0.15, dy0 + 0.35, 1.07), material='chrome', u=12, v=6, scale=(1, 1, 0.6))
    P.box('register', (0.3, 0.42, 0.03), (dx0 + 0.25, dy0 + 0.95, 1.055), 'paint_b', rot=(0, 0, 8), bev=0.004)
    for k, (y, f) in enumerate(((dy0 + 1.45, 180), (dy1 - 0.15, 200), (dy0 + 0.6, 160))):
        card.spot(f'desk_{"abc"[k]}', (dx0 + dx1) / 2, y, 1.04, f)
    for k, (x, y, f) in enumerate(((15.4, 6.9, 0), (15.9, 8.0, 90), (16.1, 6.0, 200))):
        card.spot(f'desk_{"def"[k]}', x, y, 0.0, f)
    N.bm_box(B['wood'], (XB - TW - 0.015, 7.3, 1.6), (0.03, 1.2, 0.7))
    for j in range(8):
        y = 6.85 + (j % 4) * 0.3
        z = 1.75 - (j // 4) * 0.32
        C.post(P, 'hook', (XB - TW - 0.03, y, z), (XB - TW - 0.07, y, z), 0.004, 'chrome', segs=4)
        if j % 3 != 1:
            N.bm_box(B['steel'], (XB - TW - 0.075, y, z - 0.06), (0.01, 0.025, 0.06))
            N.bm_box(B['paint'], (XB - TW - 0.075, y, z - 0.12), (0.012, 0.035, 0.06))
    # the lobby: a sofa's place by the road window, a low table's, a plant's
    card.spot('lobby_a', 12.4, YR1 - TW - 0.55, 0.0, -90)
    card.spot('lobby_b', 12.5, 8.2, 0.0, 0)
    card.spot('lobby_c', XE + TW + 0.3, YR1 - TW - 0.3, 0.0, 45)
    # the lockers along the wall to room 8: eleven, six of one tall door, five of two (each its own compartment)
    ly = YR0 + TP / 2
    lx0 = 11.3
    LW, LD = 0.38, 0.48
    N.bm_box(B['steel'], (lx0 + 11 * LW / 2, ly + LD / 2, 1.0), (11 * LW, LD, 2.0))
    N.bm_box(B['trim'], (lx0 + 11 * LW / 2, ly + LD / 2, 2.02), (11 * LW + 0.04, LD + 0.04, 0.04))
    card.box(lx0, lx0 + 11 * LW, ly, ly + LD, 0.0, 2.04)
    singles = (0, 2, 3, 6, 8, 10)
    for i in range(11):
        x = lx0 + i * LW
        doors = [(0.08, 1.92)] if i in singles else [(0.08, 0.96), (1.0, 1.92)]
        for j, (za, zb) in enumerate(doors):
            name = f'lk{i}' + ('' if len(doors) == 1 else 'ab'[j])
            since = len(P.statics)
            P.box('lk_door', (LW - 0.02, 0.016, zb - za), (x + LW / 2, ly + LD + 0.008, (za + zb) / 2), 'paint', bev=0.003)
            for k in range(3):
                P.box('lk_vent', (LW - 0.12, 0.004, 0.012), (x + LW / 2, ly + LD + 0.018, zb - 0.12 - k * 0.04), 'trim', bev=None)
            P.box('lk_latch', (0.02, 0.02, 0.07), (x + LW - 0.05, ly + LD + 0.026, (za + zb) / 2), 'chrome', bev=None)
            P.mover(f'DOOR_{name}', P.statics[since:], (x + 0.01, ly + LD + 0.008, 0.0))
            card.door(f'DOOR_{name}', (x + 0.01, ly + LD + 0.008), LW - 0.02, 0.016, 100.0, zb, (1.0, 0.0), 1, pry='locker', z0=za,
                      box=(x + 0.01, x + LW - 0.01, ly, ly + LD, za, zb), secs=0.4, mat='metal')
            # (a thing kept in it, at its compartment's floor; the box of the compartment behind the door)
            card.spot(name, x + LW / 2, ly + LD / 2, za + 0.02, 90)
    # the light and its switch by the door, the lamp over the door outside (at night)
    S.lit_panel(P, 'office_tube', 'office', (0.2, 1.4, 0.03), (13.6, 7.2, CEIL - 0.05))
    N.bm_box(B['paint_b'], (13.6, 7.2, CEIL - 0.025), (0.28, 1.5, 0.05))
    card.lamp('office', 13.6, 7.2, CEIL - 0.08, 6.0, warm=False)
    card.switch('office', XE + TW + 0.008, YR1 - 2.15, 1.35, ['office'])
    N.bm_box(B['paint_b'], (XE + TW + 0.006, YR1 - 2.15, 1.35), (0.012, 0.075, 0.12))
    S.lit_panel(P, 'office_porch_glass', 'po', (0.12, 0.12, 0.14), (XE - 0.12, YR1 - 1.5, 2.38))
    P.box('porch_lamp_cap', (0.16, 0.16, 0.03), (XE - 0.12, YR1 - 1.5, 2.47), 'trim', bev=0.004)
    card.lamp('po', XE - 0.12, YR1 - 1.5, 2.38, 7.0, hours=(18, 6), pool=0.0)
    # the glass door (never locked): hung at its north side, opening in
    hx, hy = XE + TW / 2, YR1 - 1.0 - 0.02
    dw, dh, dt = 0.96, 2.16, 0.05
    since = len(P.statics)
    P.box('door_stile', (dt, 0.09, dh), (hx, hy - 0.045, dh / 2), 'paint_b', bev=0.004)
    P.box('door_stile', (dt, 0.09, dh), (hx, hy - dw + 0.045, dh / 2), 'paint_b', bev=0.004)
    P.box('door_rail', (dt, dw, 0.18), (hx, hy - dw / 2, 0.09), 'paint_b', bev=0.004)
    P.box('door_rail', (dt, dw, 0.09), (hx, hy - dw / 2, dh - 0.045), 'paint_b', bev=0.004)
    P.box('door_glass', (0.012, dw - 0.16, dh - 0.3), (hx, hy - dw / 2, 0.18 + (dh - 0.3) / 2), 'glass', bev=None)
    P.box('door_pull', (0.03, 0.03, 0.3), (hx - 0.06, hy - dw + 0.15, 1.05), 'chrome', bev=0.008)
    P.box('door_sign', (0.006, 0.3, 0.12), (hx - 0.03, hy - dw / 2, 1.5), 'paint', bev=None)
    P.mover('DOOR_office', P.statics[since:], (hx, hy, 0.0))
    card.door('DOOR_office', (hx, hy), dw, dt, 100.0, dh, (0.0, -1.0), 1, pry='none', secs=1.0, mat='metal')


def sign(P, B, card):
    """The motel's sign by the road: a tall pole, its board (汽车旅馆) in the motel's colour faced white, its neon; a
    smaller board under it (有空房), its own neon."""
    sx, sy = SIGN
    C.post(P, 'sign_pole', (sx, sy, G), (sx, sy, G + 6.4), 0.11, 'steel', segs=12)
    N.bm_box(B['trim'], (sx, sy, G + 0.15), (0.45, 0.45, 0.3))
    card.post(sx, sy, 0.13, G, G + 6.4)
    zc = G + 5.9
    N.bm_box(B['paint'], (sx, sy, zc), (0.34, 3.4, 1.1))
    for sg in (-1, 1):
        N.bm_box(B['paint_b'], (sx + sg * 0.175, sy, zc), (0.02, 3.2, 0.92))
    N.bm_box(B['trim'], (sx, sy, zc + 0.58), (0.38, 3.46, 0.06))
    letters = [S.neon_text(P, '汽车旅馆', (sx + sg * 0.225, sy, zc), 0.0 if sg > 0 else math.pi, 0.62) for sg in (-1, 1)]
    P.mover('N_lit_sign', letters, (sx, sy, zc))
    card.lamp('sign', sx, sy, zc, 14.0, hours=(18, 6), neon=True)
    zv = G + 4.85
    N.bm_box(B['paint_b'], (sx, sy, zv), (0.26, 1.6, 0.5))
    N.bm_box(B['trim'], (sx, sy, zv + 0.27), (0.3, 1.66, 0.04))
    small = [S.neon_text(P, '有空房', (sx + sg * 0.165, sy, zv), 0.0 if sg > 0 else math.pi, 0.32) for sg in (-1, 1)]
    P.mover('N_lit_vacancy', small, (sx, sy, zv))
    card.lamp('vacancy', sx, sy, zv, 8.0, hours=(18, 6), neon=True)


def motel(P):
    card = N.Card('motel')
    B = N.new_set()
    # the row: rooms 1-6 along its back, their doors to the yard (every other one the other way round)
    for k in range(6):
        rf = RF(X0 + k * RW, YF, 1.0, 0.0, RW, DM, lambda q: zmain(q.y), mirror=k % 2 == 1)
        room(P, B, card, k, rf, last=k == 5, gable_lo=k == 0, gable_hi=k == 5)
    # the wing: rooms 7-8 facing across the yard (west), the store room behind them, the reception at the road end
    for k in range(2):
        rf = RF(XE, YF + k * RW, 0.0, 1.0, RW, DE, lambda q: zeast(q.x), mirror=k % 2 == 1)
        room(P, B, card, 6 + k, rf, last=k == 1, gable_lo=False, gable_hi=False)
    walk(P, B, card)
    roofs(P, B, card)
    wing_ends(P, B, card)
    reception(P, B, card)
    sign(P, B, card)
    N.finish_bms(P, B)
    P.views = [('a', -60, 25), ('b', 40, 30), ('c', 160, 25)]
    card.extra['plinth'] = PL
    movers = {}
    for d in card.doors:
        movers[d['name']] = dict(move='hinge', axis='y', open=float(d['open']))
    return card, (33.45, 20.5, 6.9), movers


TABLE = {'motel': motel}


def main(args):
    N.run(TABLE, args)
