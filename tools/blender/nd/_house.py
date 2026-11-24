"""
A wooden house for the ND prefabs (docs/ND/PLAN.md, ND5: the commune's houses, the roadside starter house) — the
cabin's way of building (nd/cabin.py) made general: walls of lap siding (paint) on a sill, boarded inside (wood),
corner boards (paint_b); a gable roof of tin on its sheathing (wood, seen from inside and under the eaves), its
bargeboards and ridge cap; sash windows (shuttered where asked); doors of boards on ledges (DOOR_<name>); a floor of
boards; an upper floor on joists where it has one; a pendant lamp (its bulb N_lit_<lamp>) and its switch; a lean-to on
a side. All in the building's frame: z = 0 the prefab's floor, the yard at G.
"""
import math

import bmesh
from mathutils import Matrix, Vector

from parts import _kit as K
from parts._kit import V
from places import _common as C
from nd import _nd as N
from nd._nd import Face, face_box


class House:
    """
    A box of walls from (x0, y0) to (x1, y1), its floor at z0 (over the prefab's floor), its eaves at ze over its
    floor; its ridge along X or Y, the roof pitched at `pitch` degrees. Holes go into its faces ('n', 's', 'e', 'w':
    +Y, -Y, +X, -X), each in that face's s (from its start: n from x0, s from x1, w from y0, e from y1).
    """

    def __init__(self, P, B, card, tag, x0, y0, x1, y1, ze, pitch=30.0, ridge='x', z0=0.0, t=0.14, ground=-0.15, over=0.35, siding='paint'):
        self.P, self.B, self.card, self.tag = P, B, card, tag
        self.siding = siding
        self.x0, self.y0, self.x1, self.y1 = x0, y0, x1, y1
        self.ze, self.z0, self.t, self.ground, self.over = ze, z0, t, ground, over
        self.k = math.tan(math.radians(pitch))
        self.ridge = ridge
        self.faces = {
            'n': Face((x0, y1), (x1, y1), (0, 1), t),
            's': Face((x1, y0), (x0, y0), (0, -1), t),
            'w': Face((x0, y0), (x0, y1), (-1, 0), t),
            'e': Face((x1, y1), (x1, y0), (1, 0), t),
        }
        self.holes = {f: [] for f in self.faces}
        self.doors = {f: [] for f in self.faces}
        self.door_secs = {}
        self.openings = {f: [] for f in self.faces}
        self.windows = []
        self.half = ((y1 - y0) if ridge == 'x' else (x1 - x0)) / 2

    # -------------------------------------------------------------- what goes in it
    def window(self, f, s0, s1, z0, z1, rows=2, cols=2, shutters=False):
        self.holes[f].append((s0, s1, self.z0 + z0, self.z0 + z1))
        self.windows.append((f, s0, s1, self.z0 + z0, self.z0 + z1, rows, cols, shutters))

    def door(self, f, s0, s1, name, h=2.05, hinge='lo', into=True, pry='house', mat='paint_b', open_deg=95.0, glass=False, secs=1.0):
        """a door in face f (s0..s1): `secs` how long it takes to swing (Nomad Drive's: a house's 1.0 s, a garage's 1.2)"""
        self.door_secs[name] = secs
        self.holes[f].append((s0, s1, self.z0, self.z0 + h))
        self.doors[f].append((s0, s1, h, name, hinge, into, pry, mat, open_deg, glass))

    def opening(self, f, s0, s1, h=2.05):
        """a doorway with no door in it (into a lean-to): cased like a door's, walked through"""
        self.holes[f].append((s0, s1, self.z0, self.z0 + h))
        self.openings[f].append((s0, s1, h))

    def gable(self, f):
        """the face's top: up to the eaves on a long side, the gable's line on an end"""
        L = self.faces[f].L
        if (self.ridge == 'x') == (f in ('w', 'e')):
            g = N.gable_top(L, self.z0 + self.ze, self.k)
            return g
        return None

    def roof_z(self, off):
        """the roof's underside at a distance `off` from the ridge line"""
        return self.z0 + self.ze + (self.half - abs(off)) * self.k

    # -------------------------------------------------------------- making it
    def build(self, lining=True, floor=True, lamp=True, roof=True, sill=True, expo=0.22, board=0.2, skip=''):
        P, B, card = self.P, self.B, self.card
        self.skip = skip
        for f, face in self.faces.items():
            if f in skip:
                continue
            top = self.gable(f)
            zt = self.z0 + self.ze
            N.siding(B[self.siding], face, self.z0 - 0.02, zt if top is None else 9.0, self.holes[f], top=top, expo=expo)
            if lining:
                N.lining(B['wood'], face, self.z0, (zt - 0.12) if top is None else 9.0, self.holes[f], w=board, top=(None if top is None else (lambda s, top=top: top(s) - 0.05)))
            if sill:
                face_box(B['wood'], face, -0.03, face.L + 0.03, -face.t, 0.035, self.ground, self.z0 - 0.02)
            if top is None:
                face_box(B['wood'], face, 0.0, face.L, -face.t - 0.02, 0.0, zt - 0.12, zt)
        # corner boards
        zt = self.z0 + self.ze
        for (x, y, sx, sy) in ((self.x0, self.y1, -1, 1), (self.x1, self.y1, 1, 1), (self.x0, self.y0, -1, -1), (self.x1, self.y0, 1, -1)):
            N.bm_box(B['paint_b'], (x + sx * 0.02, y - sy * 0.045, (self.z0 + zt) / 2 - 0.01), (0.04, 0.11, zt - self.z0 + 0.02))
            N.bm_box(B['paint_b'], (x - sx * 0.045, y + sy * 0.02, (self.z0 + zt) / 2 - 0.01), (0.11, 0.04, zt - self.z0 + 0.02))
        for (f, s0, s1, z0, z1, rows, cols, shutters) in self.windows:
            N.window(B, self.faces[f], s0, s1, z0, z1, rows=rows, cols=cols, shutters=shutters)
        for f, face in self.faces.items():
            for d in self.doors[f]:
                self._door(face, *d)
            for (s0, s1, h) in self.openings[f]:
                self._casing(face, s0, s1, h)
        self._solids()
        if floor:
            self._floor()
        if roof:
            self._roof()
        return self

    def _solids(self):
        """the walls as the card's boxes: each face's lengths between its doors, the lintels over them"""
        card = self.card
        for f, face in self.faces.items():
            if f in getattr(self, 'skip', ''):
                continue
            top = self.z0 + self.ze + (self.half * self.k if self.gable(f) else 0.0)
            doors = sorted([(d[0], d[1], d[2]) for d in self.doors[f]] + list(self.openings[f]))
            at = 0.0
            pieces = []
            for (s0, s1, h) in doors:
                pieces.append((at, s0, self.ground, top))
                pieces.append((s0, s1, self.z0 + h, top))
                at = s1
            pieces.append((at, face.L, self.ground, top))
            for (a, b, z0, z1) in pieces:
                if b - a < 0.02:
                    continue
                p0 = face.p(a, 0.0, 0.0)
                p1 = face.p(b, -face.t, 0.0)
                card.box(min(p0.x, p1.x), max(p0.x, p1.x), min(p0.y, p1.y), max(p0.y, p1.y), z0, z1)

    def _floor(self):
        B, card = self.B, self.card
        t = self.t
        x0, y0, x1, y1 = self.x0 + t, self.y0 + t, self.x1 - t, self.y1 - t
        along_x = (x1 - x0) >= (y1 - y0)
        n = int(((y1 - y0) if along_x else (x1 - x0)) / 0.14)
        for i in range(n):
            if along_x:
                a = y0 + i * (y1 - y0) / n
                N.bm_box(B['wood'], ((x0 + x1) / 2, a + (y1 - y0) / n / 2, self.z0 - 0.015), (x1 - x0, (y1 - y0) / n - 0.004, 0.03))
            else:
                a = x0 + i * (x1 - x0) / n
                N.bm_box(B['wood'], (a + (x1 - x0) / n / 2, (y0 + y1) / 2, self.z0 - 0.015), ((x1 - x0) / n - 0.004, y1 - y0, 0.03))
        N.bm_box(B['trim'], ((x0 + x1) / 2, (y0 + y1) / 2, (self.ground + self.z0) / 2 - 0.02), (x1 - x0, y1 - y0, max(0.02, self.z0 - self.ground - 0.04)))
        card.box(self.x0, self.x1, self.y0, self.y1, self.ground - 0.5, self.z0, floor=True)

    def _roof(self):
        """sheathing over the rafters, the tin over it on both slopes, the ridge cap, the bargeboards, a tie or two"""
        B, P = self.B, self.P
        k, o, half = self.k, self.over, self.half
        cosp = 1 / math.sqrt(1 + k * k)
        th = 0.024 / cosp
        if self.ridge == 'x':
            a0, a1 = self.x0 - 0.3, self.x1 + 0.3
            mid = (self.y0 + self.y1) / 2
            ztop = self.roof_z(0.0) + 0.06
            for sg in (1, -1):
                f = Face((a0, mid), (a1, mid), (0, sg), 0.0)
                prof = [(0.0, ztop), (half + o, ztop - (half + o) * k), (half + o, ztop - (half + o) * k + th), (0.0, ztop + th)]
                N.prism(B['wood'], f, prof, 0.0, f.L, nseg=max(1, int(f.L / 0.8)))
            down = {1: V((0, 1, -k)).normalized(), -1: V((0, -1, -k)).normalized()}
            zt = ztop + th + 0.002
            N.tin(B, (a0 - 0.02, mid, zt), (1, 0, 0), tuple(down[1]), a1 - a0 + 0.04, (half + o + 0.03) / cosp, seed=self.x0 * 0.13, rust_every=7, segs=3, rowlen=2.6)
            N.tin(B, (a1 + 0.02, mid, zt), (-1, 0, 0), tuple(down[-1]), a1 - a0 + 0.04, (half + o + 0.03) / cosp, seed=self.y0 * 0.17, rust_every=7, segs=3, rowlen=2.6)
            for sg in (1, -1):
                f = Face((a0 - 0.03, mid), (a1 + 0.03, mid), (0, sg), 0.0)
                prof = [(0.0, zt + 0.035), (0.18, zt + 0.035 - 0.18 * k), (0.18, zt + 0.03 - 0.18 * k), (0.0, zt + 0.03)]
                N.prism(B['steel'], f, prof, 0.0, f.L, nseg=max(1, int(f.L / 1.2)))
            for x in (a0 - 0.02, a1 + 0.02):
                for sg in (1, -1):
                    a = V((x, mid, zt - 0.02))
                    b = V((x, mid + sg * (half + o + 0.02), zt - (half + o + 0.02) * k - 0.02))
                    C.plank(P, 'barge', a, b, 0.03, 0.18, 'paint_b', up=(0, -sg * k, 1), bev=0.004, floor=False)
            for sg in (1, -1):
                zf = ztop - (half + o) * k - 0.06
                N.bm_box(B['paint_b'], ((a0 + a1) / 2, mid + sg * (half + o), zf), (a1 - a0, 0.03, 0.15))
            for x in [self.x0 + (self.x1 - self.x0) * q for q in (0.33, 0.67)]:
                C.plank(P, 'tie', (x, self.y0 + 0.05, self.z0 + self.ze - 0.06), (x, self.y1 - 0.05, self.z0 + self.ze - 0.06), 0.1, 0.12, 'wood', up=(0, 0, 1), bev=0.005, floor=False)
        else:
            a0, a1 = self.y0 - 0.3, self.y1 + 0.3
            mid = (self.x0 + self.x1) / 2
            ztop = self.roof_z(0.0) + 0.06
            for sg in (1, -1):
                f = Face((mid, a0), (mid, a1), (sg, 0), 0.0)
                prof = [(0.0, ztop), (half + o, ztop - (half + o) * k), (half + o, ztop - (half + o) * k + th), (0.0, ztop + th)]
                N.prism(B['wood'], f, prof, 0.0, f.L, nseg=max(1, int(f.L / 0.8)))
            zt = ztop + th + 0.002
            N.tin(B, (mid, a1 + 0.02, zt), (0, -1, 0), tuple(V((1, 0, -k)).normalized()), a1 - a0 + 0.04, (half + o + 0.03) / cosp, seed=self.x0 * 0.11, rust_every=7, segs=3, rowlen=2.6)
            N.tin(B, (mid, a0 - 0.02, zt), (0, 1, 0), tuple(V((-1, 0, -k)).normalized()), a1 - a0 + 0.04, (half + o + 0.03) / cosp, seed=self.y0 * 0.19, rust_every=7, segs=3, rowlen=2.6)
            for sg in (1, -1):
                f = Face((mid, a0 - 0.03), (mid, a1 + 0.03), (sg, 0), 0.0)
                prof = [(0.0, zt + 0.035), (0.18, zt + 0.035 - 0.18 * k), (0.18, zt + 0.03 - 0.18 * k), (0.0, zt + 0.03)]
                N.prism(B['steel'], f, prof, 0.0, f.L, nseg=max(1, int(f.L / 1.2)))
            for y in (a0 - 0.02, a1 + 0.02):
                for sg in (1, -1):
                    a = V((mid, y, zt - 0.02))
                    b = V((mid + sg * (half + o + 0.02), y, zt - (half + o + 0.02) * k - 0.02))
                    C.plank(P, 'barge', a, b, 0.03, 0.18, 'paint_b', up=(-sg * k, 0, 1), bev=0.004, floor=False)
            for sg in (1, -1):
                zf = ztop - (half + o) * k - 0.06
                N.bm_box(B['paint_b'], (mid + sg * (half + o), (a0 + a1) / 2, zf), (0.03, a1 - a0, 0.15))
            for y in [self.y0 + (self.y1 - self.y0) * q for q in (0.33, 0.67)]:
                C.plank(P, 'tie', (self.x0 + 0.05, y, self.z0 + self.ze - 0.06), (self.x1 - 0.05, y, self.z0 + self.ze - 0.06), 0.1, 0.12, 'wood', up=(0, 0, 1), bev=0.005, floor=False)

    def _casing(self, face, s0, s1, h):
        B, t, z0 = self.B, face.t, self.z0
        face_box(B['paint_b'], face, s0 - 0.08, s0, 0.0, 0.035, z0 - 0.02, z0 + h + 0.1)
        face_box(B['paint_b'], face, s1, s1 + 0.08, 0.0, 0.035, z0 - 0.02, z0 + h + 0.1)
        face_box(B['paint_b'], face, s0 - 0.1, s1 + 0.1, 0.0, 0.05, z0 + h + 0.1, z0 + h + 0.19)
        face_box(B['wood'], face, s0, s0 + 0.02, -t, 0.0, z0, z0 + h)
        face_box(B['wood'], face, s1 - 0.02, s1, -t, 0.0, z0, z0 + h)
        face_box(B['wood'], face, s0, s1, -t, 0.0, z0 + h - 0.02, z0 + h)

    def _door(self, face, s0, s1, h, name, hinge, into, pry, mat, open_deg, glass):
        """a doorway (cased outside, its reveal boarded) and its leaf: boards on ledges, a knob; hung at s0 ('lo') or
        s1 ('hi'), opening into the house or out of it"""
        P, B, card, t = self.P, self.B, self.card, face.t
        z0 = self.z0
        face_box(B['paint_b'], face, s0 - 0.08, s0, 0.0, 0.035, z0 - 0.02, z0 + h + 0.1)
        face_box(B['paint_b'], face, s1, s1 + 0.08, 0.0, 0.035, z0 - 0.02, z0 + h + 0.1)
        face_box(B['paint_b'], face, s0 - 0.1, s1 + 0.1, 0.0, 0.05, z0 + h + 0.1, z0 + h + 0.19)
        face_box(B['wood'], face, s0, s0 + 0.02, -t, 0.0, z0, z0 + h)
        face_box(B['wood'], face, s1 - 0.02, s1, -t, 0.0, z0, z0 + h)
        face_box(B['wood'], face, s0, s1, -t, 0.0, z0 + h - 0.02, z0 + h)
        w = s1 - s0 - 0.04
        dt = 0.045
        sh = s0 + 0.02 if hinge == 'lo' else s1 - 0.02
        sd = 1 if hinge == 'lo' else -1
        hp = face.p(sh, -t / 2, 0.0)
        since = len(P.statics)
        n = 5
        for j in range(n):
            a = sh + sd * (j * w / n + 0.003)
            b = sh + sd * ((j + 1) * w / n - 0.003)
            c = face.p((a + b) / 2, -t / 2, 0.0)
            sz = (abs(b - a), dt, h - 0.02) if abs(face.s.x) > 0.5 else (dt, abs(b - a), h - 0.02)
            if glass and 0 < j < n - 1:
                P.box('door_board', sz[:2] + (0.5,), (c.x, c.y, z0 + 0.26), mat, bev=0.003)
                P.box('door_board', sz[:2] + (0.3,), (c.x, c.y, z0 + h - 0.16), mat, bev=0.003)
                gz = (sz[0], 0.01, h - 0.92) if abs(face.s.x) > 0.5 else (0.01, sz[1], h - 0.92)
                P.box('door_glass', gz, (c.x, c.y, z0 + 0.51 + (h - 0.92) / 2), 'glass', bev=None)
            else:
                P.box('door_board', sz, (c.x, c.y, z0 + h / 2 + 0.005), mat, bev=0.003)
        for z in (0.3, h - 0.35):
            c = face.p(sh + sd * w / 2, -t / 2 - (dt / 2 + 0.014), 0.0)
            sz = (w - 0.06, 0.028, 0.11) if abs(face.s.x) > 0.5 else (0.028, w - 0.06, 0.11)
            P.box('door_ledge', sz, (c.x, c.y, z0 + z), mat, bev=0.003)
        for sgo in (1, -1):
            kn = face.p(sh + sd * (w - 0.08), -t / 2 + sgo * (dt / 2 + 0.03), 0.0)
            P.sphere('knob', 0.028, loc=(kn.x, kn.y, z0 + 1.0), material='chrome', u=8, v=4)
        P.mover(f'DOOR_{name}', P.statics[since:], (hp.x, hp.y, z0))
        leaf = face.s * sd
        inn = -face.o if into else face.o
        cross = leaf.x * inn.y - leaf.y * inn.x
        card.door(f'DOOR_{name}', (hp.x, hp.y), w, dt, open_deg, z0 + h, (leaf.x, leaf.y), 1 if cross > 0 else -1, pry=pry, z0=z0 if z0 > 1e-4 else 0.0,
                  secs=self.door_secs.get(name, 1.0), mat='metal' if mat == 'steel' else None)

    # -------------------------------------------------------------- inside
    def lamp(self, name, x, y, switch_at, cord_top=None):
        """a pendant lamp from the roof (or the ceiling) over (x, y), its bulb lit with it; its switch at (x, y, face)"""
        P, B, card = self.P, self.B, self.card
        z = self.z0 + min(2.35, self.ze - 0.1)
        top = cord_top if cord_top is not None else self.z0 + self.ze - 0.06
        C.post(P, 'cord', (x, y, top), (x, y, z + 0.13), 0.006, 'trim', segs=5)
        P.lathe('shade', [(0.015, z + 0.13), (0.04, z + 0.125), (0.2, z - 0.01), (0.21, z - 0.025), (0.205, z - 0.03), (0.19, z - 0.015), (0.035, z + 0.11), (0.0, z + 0.115)],
                loc=(x, y, 0.0), material='paint_b', segs=20, sharp=50.0)
        o = P.sphere('bulb', 0.045, loc=(x, y, z + 0.01), material='glass', u=10, v=6)
        P.mover(f'N_lit_{name}', [o], (x, y, z + 0.01))
        card.lamp(name, x, y, z + 0.01, 5.5)
        sx, sy, face = switch_at
        nx, ny = face
        P.box('switch_plate', (0.075 if abs(ny) > 0.5 else 0.012, 0.012 if abs(ny) > 0.5 else 0.075, 0.12), (sx + nx * 0.006, sy + ny * 0.006, self.z0 + 1.35), 'paint_b', bev=0.003)
        card.switch(name, sx + nx * 0.02, sy + ny * 0.02, self.z0 + 1.35, [name])


def upper_floor(P, B, card, x0, y0, x1, y1, z, hole=None, ground=-0.15):
    """an upper floor of boards on joists at z (its top), a stair's hole in it (x0, y0, x1, y1) left open; the card's
    floor boxes about the hole"""
    pieces = [(x0, y0, x1, y1)]
    if hole:
        hx0, hy0, hx1, hy1 = hole
        pieces = [(x0, y0, x1, hy0), (x0, hy1, x1, y1), (x0, hy0, hx0, hy1), (hx1, hy0, x1, hy1)]
    for (a0, b0, a1, b1) in pieces:
        if a1 - a0 < 0.02 or b1 - b0 < 0.02:
            continue
        N.bm_box(B['wood'], ((a0 + a1) / 2, (b0 + b1) / 2, z - 0.015), (a1 - a0, b1 - b0, 0.03))
        N.bm_box(B['wood'], ((a0 + a1) / 2, (b0 + b1) / 2, z - 0.05), (a1 - a0, b1 - b0, 0.04))
        card.box(a0, a1, b0, b1, z - 0.2, z, floor=True)
    n = int((x1 - x0) / 0.45)
    for i in range(n + 1):
        x = x0 + i * (x1 - x0) / n
        N.bm_box(B['wood'], (x, (y0 + y1) / 2, z - 0.14), (0.07, y1 - y0, 0.16))


def stair(P, B, card, x, y0, y1, z0, z1, w=0.9, along='y'):
    """a straight stair of boards from (x, y0) at z0 up to y1 at z1 (or along x), its treads the card's floors, its
    strings at its sides"""
    rise = z1 - z0
    n = max(2, int(round(rise / 0.19)))
    for i in range(n):
        zt = z0 + rise * (i + 1) / n
        a = y0 + (y1 - y0) * i / n
        b = y0 + (y1 - y0) * (i + 1) / n
        if along == 'y':
            N.bm_box(B['wood'], (x, (a + b) / 2, zt - 0.02), (w, abs(b - a) + 0.03, 0.04))
            N.bm_box(B['paint_b'], (x, min(a, b) + (0 if b > a else abs(b - a)), zt - rise / n / 2 - 0.02), (w - 0.02, 0.02, rise / n))
            card.box(x - w / 2, x + w / 2, min(a, b), max(a, b), zt - 0.3, zt, floor=True)
        else:
            N.bm_box(B['wood'], ((a + b) / 2, x, zt - 0.02), (abs(b - a) + 0.03, w, 0.04))
            card.box(min(a, b), max(a, b), x - w / 2, x + w / 2, zt - 0.3, zt, floor=True)
    for sg in (-1, 1):
        if along == 'y':
            C.plank(P, 'string', (x + sg * (w / 2 + 0.02), y0, z0), (x + sg * (w / 2 + 0.02), y1, z1), 0.04, 0.22, 'wood', up=(0, 0, 1), bev=0.004, floor=False)
        else:
            C.plank(P, 'string', (y0, x + sg * (w / 2 + 0.02), z0), (y1, x + sg * (w / 2 + 0.02), z1), 0.04, 0.22, 'wood', up=(0, 0, 1), bev=0.004, floor=False)


def lean_to(P, B, card, x0, y0, x1, y1, z_hi, z_lo, falls='e', walls='nse', ground=-0.15, z0=0.0, holes=None):
    """a lean-to against a house: its walls of siding on the sides given (n, s, e, w), its tin roof falling one way
    (towards `falls`) from z_hi at the house to z_lo"""
    holes = holes or {}
    faces = {
        'n': Face((x0, y1), (x1, y1), (0, 1), 0.12),
        's': Face((x1, y0), (x0, y0), (0, -1), 0.12),
        'w': Face((x0, y0), (x0, y1), (-1, 0), 0.12),
        'e': Face((x1, y1), (x1, y0), (1, 0), 0.12),
    }
    def zr(x, y):
        if falls == 'e':
            t = (x - x0) / (x1 - x0)
        elif falls == 'w':
            t = (x1 - x) / (x1 - x0)
        elif falls == 'n':
            t = (y - y0) / (y1 - y0)
        else:
            t = (y1 - y) / (y1 - y0)
        return z_hi + (z_lo - z_hi) * t
    for f in walls:
        face = faces[f]
        top = lambda s, face=face: zr(*face.xy(s)) - 0.04
        N.siding(B['paint'], face, z0 - 0.02, 9.0, holes.get(f, []), top=top, expo=0.22)
        face_box(B['wood'], face, -0.03, face.L + 0.03, -face.t, 0.035, ground, z0 - 0.02)
        p0 = face.p(0.0, 0.0, 0.0)
        p1 = face.p(face.L, -face.t, 0.0)
        card.box(min(p0.x, p1.x), max(p0.x, p1.x), min(p0.y, p1.y), max(p0.y, p1.y), ground, max(z_hi, z_lo))
    # the roof
    if falls in ('e', 'w'):
        xa, xb = (x0, x1 + 0.3) if falls == 'e' else (x1, x0 - 0.3)
        za, zb = zr(x0 if falls == 'e' else x1, y0), zr(x1 if falls == 'e' else x0, y0) + (z_lo - z_hi) * 0.3 / (x1 - x0)
        L = math.hypot(xb - xa, zb - za)
        d = V(((xb - xa) / L, 0.0, (zb - za) / L))
        if falls == 'e':
            N.tin(B, (xa, y1 + 0.2, za + 0.03), (0, -1, 0), tuple(d), y1 - y0 + 0.4, L, seed=x0 * 0.3, rust_every=4, segs=3, rowlen=2.6)
        else:
            N.tin(B, (xa, y0 - 0.2, za + 0.03), (0, 1, 0), tuple(d), y1 - y0 + 0.4, L, seed=x0 * 0.3, rust_every=4, segs=3, rowlen=2.6)
    else:
        ya, yb = (y0, y1 + 0.3) if falls == 'n' else (y1, y0 - 0.3)
        za, zb = zr(x0, y0 if falls == 'n' else y1), zr(x0, y1 if falls == 'n' else y0) + (z_lo - z_hi) * 0.3 / (y1 - y0)
        L = math.hypot(yb - ya, zb - za)
        d = V((0.0, (yb - ya) / L, (zb - za) / L))
        if falls == 'n':
            N.tin(B, (x0 - 0.2, ya, za + 0.03), (1, 0, 0), tuple(d), x1 - x0 + 0.4, L, seed=y0 * 0.3, rust_every=4, segs=3, rowlen=2.6)
        else:
            N.tin(B, (x1 + 0.2, ya, za + 0.03), (-1, 0, 0), tuple(d), x1 - x0 + 0.4, L, seed=y0 * 0.3, rust_every=4, segs=3, rowlen=2.6)
    N.bm_box(B['wood'], ((x0 + x1) / 2, (y0 + y1) / 2, z0 - 0.015), (x1 - x0 - 0.2, y1 - y0 - 0.2, 0.03))
    card.box(x0, x1, y0, y1, ground - 0.5, z0, floor=True)
    return faces
