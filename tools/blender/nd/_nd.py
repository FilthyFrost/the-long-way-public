"""
What the ND prefab buildings share (docs/ND/PLAN.md, core/world/prefabs.ts): a building made whole, its card's
geometry written beside it, and the builders its walls, roofs, windows and doors are made of.

    blender -b --factory-startup --python tools/blender/build.py -- nd/<building> [all] [--norender] [--noao] [--toon]

Conventions:
  * Blender X along the road (the card's u), +Y towards the road (the card's front: v = -Y), Z up; z = 0 the top of
    the building's floor; the origin the middle of the card's footprint. The glTF exporter turns this into the game
    frame (x = X, y = Z, z = -Y): the game draws the model turned by -yaw, so its x lies along u and its z along v.
  * One GLB per building at public/models/modcar/places/nd/<id>.glb: the root mesh PART (conventional material names only;
    `paint` and `paint_b` take the place's two colours), its movers (a door: DOOR_<n>, origin on its hinge line,
    extras move/axis/open in the game frame as places/_common.py has them) and its markers (M_<name>).
  * Its card's geometry at src/core/v3/nd/cards/<id>.json, in the card's frame (u, v, y from the floor): `solids`
    (what cannot be walked through, its floors to stand on), `doors` (the hinge, the leaf's width and thickness, how
    far it opens), `lamps`, `switches`, `spots` (where its furniture and its things stand: the core's furnish reads
    them by name).
"""
import json
import math
import os

import bmesh
import bpy
from mathutils import Matrix, Vector

from parts import _kit as K
from parts._kit import V, mat4
from places import _common as C

OUT = 'public/models/modcar/places/nd'
CARDS = 'src/core/v3/nd/cards'
SCRATCH = 'D:/modcar-scratch/nd'
os.makedirs(SCRATCH, exist_ok=True)
TAU = math.tau


def r4(x):
    return round(float(x), 4)


# ------------------------------------------------------------------------------------------------ the card

class Card:
    """A prefab's geometry for the game, collected in Blender coordinates as the building is made."""

    def __init__(self, cid):
        self.id = cid
        self.solids = []
        self.doors = []
        self.lamps = []
        self.switches = []
        self.ladders = []
        self.spots = []
        self.extra = {}

    def box(self, x0, x1, y0, y1, z0, z1, floor=False):
        """An upright box between two corners (Blender X, Y) and two heights (from the floor)."""
        d = dict(u=r4((x0 + x1) / 2), v=r4(-(y0 + y1) / 2), hx=r4(abs(x1 - x0) / 2), hz=r4(abs(y1 - y0) / 2),
                 y0=r4(min(z0, z1)), y1=r4(max(z0, z1)))
        if floor:
            d['floor'] = True
        self.solids.append(d)

    def post(self, x, y, rad, z0, z1):
        self.solids.append(dict(u=r4(x), v=r4(-y), hx=r4(rad), hz=0, y0=r4(z0), y1=r4(z1)))

    def spot(self, name, x, y, z, face=0.0):
        """Where a thing stands: its base at (x, y, z), its front facing the Blender angle `face` (degrees from +X
        towards +Y). In the card's frame its yaw is turned from u towards v: -face."""
        self.spots.append(dict(name=name, u=r4(x), v=r4(-y), y=r4(z), yaw=r4(-math.radians(face))))

    def door(self, name, hinge, width, thick, open_deg, z1, axis_s, closed_into, pry='house', z0=0.0, box=None, secs=None,
             shut_secs=None, same=None, slide=False, mat=None, tilt_mid=None):
        """A door: its hinge line at (x, y), the leaf `width` along the Blender direction axis_s (unit 2D) when
        shut, opening by open_deg towards `closed_into` (+1: turning from axis_s towards its left, Blender +90°);
        `pry` the kind it is as to being found locked or stuck (core/v3/nd/pry.ts: house, locker, stuck, none)."""
        hx, hy = hinge
        sx, sy = axis_s
        self.doors.append(dict(name=name, u=r4(hx), v=r4(-hy), su=r4(sx), sv=r4(-sy), width=r4(width), thick=r4(thick),
                               open=r4(open_deg), turn=int(closed_into), y1=r4(z1), pry=pry, **({'y0': r4(z0)} if z0 > 1e-4 else {}),
                               **({'box': dict(u0=r4(min(box[0], box[1])), u1=r4(max(box[0], box[1])), v0=r4(-max(box[2], box[3])),
                                               v1=r4(-min(box[2], box[3])), y0=r4(box[4]), y1=r4(box[5]),
                                               **({'turn': r4(-box[6])} if len(box) > 6 and abs(box[6]) > 1e-6 else {}))} if box else {})))
        d = self.doors[-1]
        for k, v in (('secs', secs), ('shutSecs', shut_secs), ('same', same), ('mat', mat)):
            if v is not None:
                d[k] = r4(v) if isinstance(v, float) else v
        if slide:
            d['slide'] = True
        if tilt_mid is not None:
            # (a tilting leaf: its middle from its hinge when shut, Blender x, y, z; it turns about (axis_s, 0))
            d['tilt'] = dict(u=r4(tilt_mid[0]), v=r4(-tilt_mid[1]), y=r4(tilt_mid[2]))

    def lamp(self, name, x, y, z, reach, warm=True, hours=None, neon=False, pool=None, inside=False, tube=False, beacon=False,
             color=None, aim=None):
        """A lamp (its glass, if it has its own: the node N_lit_<name>); `hours` (from, to) lit by the clock instead
        of a switch, `neon` striking as it comes on (core/v3/nd/cards.ts CardLamp)."""
        d = dict(name=name, u=r4(x), v=r4(-y), y=r4(z), reach=r4(reach), warm=bool(warm))
        if hours:
            d['hours'] = [r4(hours[0]), r4(hours[1])]
        if neon:
            d['neon'] = True
        if pool is not None:
            d['pool'] = r4(pool)
        for k, v in (('inside', inside), ('tube', tube), ('beacon', beacon)):
            if v:
                d[k] = True
        if color is not None:
            d['color'] = int(color)
        if aim is not None:
            # (a floodlight's beam on the ground: its pool there)
            d['aim'] = dict(u=r4(aim[0]), v=r4(-aim[1]))
        self.lamps.append(d)

    def spin(self, name, axis, deg_s=None, rpm=None, gust=None, gust_hz=None, up_s=None, down_s=None, sign=None):
        """something of the model that turns (its node N_spin_<name>) about its own axis in the game's frame (x, y, z:
        Blender X, Z, -Y): always at deg_s (°/s), or with the wind at rpm at its strongest"""
        d = dict(name=name, axis=axis)
        if deg_s is not None:
            d['degS'] = r4(deg_s)
        if rpm is not None:
            d['rpm'] = r4(rpm)
        for (k, v) in (('gust', gust), ('gustHz', gust_hz), ('upS', up_s), ('downS', down_s)):
            if v is not None:
                d[k] = r4(v)
        if sign is not None:
            d['sign'] = int(sign)
        self.extra.setdefault('spins', []).append(d)

    def wreck(self, x, y, face, kind, stripped=False):
        """one of the road's own wrecks laid with the place (core/world/sites.ts: 0 a saloon, 1 a pick-up, 2 a van, 3 a
        bus) at (x, y), its nose looking the Blender angle `face`"""
        d = dict(u=r4(x), v=r4(-y), yaw=r4(-math.radians(face)), type=int(kind))
        if stripped:
            d['stripped'] = True
        self.extra.setdefault('wrecks', []).append(d)

    def ladder(self, name, foot, head, exit, face, w=0.45, wood=False):
        """A ladder (ND6, Nomad Drive's vehicle ladder): where the climber's feet are at its foot and at its head (x, y,
        z: a leaning ladder's line leans), `exit` where one is drawn to at its head and let go; climbed facing the
        Blender angle `face` (degrees from +X towards +Y: the way one looks at it); `w` its width between the rails.
        In the card's frame: u, v, its yaw turned as a spot's (-face)."""
        pt = lambda p: dict(u=r4(p[0]), v=r4(-p[1]), y=r4(p[2]))
        d = dict(name=name, foot=pt(foot), head=pt(head), exit=pt(exit), yaw=r4(-math.radians(face)), w=r4(w))
        if wood:
            d['wood'] = True
        self.ladders.append(d)

    def switch(self, name, x, y, z, lamps):
        self.switches.append(dict(name=name, u=r4(x), v=r4(-y), y=r4(z), lamps=list(lamps)))

    def write(self, size):
        os.makedirs(CARDS, exist_ok=True)
        if self.ladders:
            self.extra['ladders'] = self.ladders
        out = dict(id=self.id, w=r4(size[0]), d=r4(size[1]), h=r4(size[2]), solids=self.solids, doors=self.doors,
                   lamps=self.lamps, switches=self.switches, spots=self.spots, **self.extra)
        path = os.path.join(CARDS, f'{self.id}.json')
        with open(path, 'w', encoding='utf-8') as f:
            json.dump(out, f, indent=1, ensure_ascii=False)
        print(f'CARD {self.id}: {len(self.solids)} solids, {len(self.doors)} doors, {len(self.spots)} spots -> {path}')


# ------------------------------------------------------------------------------------------------ a wall's face

class Face:
    """
    A wall's outer face: its line from `a` towards `b` (Blender XY, on the face's outer plane), `out` its outward
    normal (2D), `t` the wall's thickness (the inner face at o = -t). Points are (s, o, z): s along the wall from a,
    o outwards, z up.
    """

    def __init__(self, a, b, out, t=0.16):
        self.a = V((a[0], a[1], 0.0))
        d = V((b[0] - a[0], b[1] - a[1], 0.0))
        self.L = d.length
        self.s = d.normalized()
        self.o = V((out[0], out[1], 0.0)).normalized()
        self.t = t

    def p(self, s, o, z):
        return self.a + self.s * s + self.o * o + V((0, 0, z))

    def xy(self, s, o=0.0):
        q = self.p(s, o, 0.0)
        return q.x, q.y


def prism(bm, face, prof, s0, s1, nseg=1, top=None):
    """A prism along a face from s0 to s1 with the profile `prof` [(o, z)] (any winding; C.outward fixes it).
    nseg: rings along s (vertex AO). top(s) -> z: the profile's points above it are pulled down to it (a gable)."""
    rings = []
    for k in range(nseg + 1):
        s = s0 + (s1 - s0) * k / nseg
        zt = top(s) if top else None
        ring = []
        for (o, z) in prof:
            if zt is not None and z > zt:
                z = zt
            ring.append(bm.verts.new(face.p(s, o, z)))
        rings.append(ring)
    n = len(prof)
    for k in range(nseg):
        r0, r1 = rings[k], rings[k + 1]
        for i in range(n):
            j = (i + 1) % n
            bm.faces.new((r0[i], r0[j], r1[j], r1[i]))
    bm.faces.new(rings[0][::-1])
    bm.faces.new(rings[-1])


def spans(L, holes, zlo, zhi, gap=0.0):
    """The parts of [0, L] not under any hole that the band zlo..zhi crosses: holes = [(s0, s1, z0, z1)]."""
    cut = sorted((s0 - gap, s1 + gap) for (s0, s1, z0, z1) in holes if z0 < zhi - 1e-4 and z1 > zlo + 1e-4)
    out = []
    at = 0.0
    for (c0, c1) in cut:
        if c0 > at + 0.02:
            out.append((at, min(c0, L)))
        at = max(at, c1)
    if at < L - 0.02:
        out.append((at, L))
    return out


def gable_top(L, z_eave, slope, inset=0.0):
    """A symmetric gable over a wall L long: its top's height at s."""
    return lambda s: z_eave + max(0.0, (L / 2 - abs(s - L / 2)) - inset) * slope


def siding(bm, face, z0, z1, holes=(), expo=0.17, t=0.024, top=None, lap=0.03, s0=0.0, s1=None):
    """Lap siding on a face's outer plane: board rows from z0 up to z1 (or the gable's top), each board's thick
    edge at its foot; cut round the holes [(s0, s1, z0, z1)] (face coordinates)."""
    s1 = face.L if s1 is None else s1
    z = z0
    row = 0
    zmax = z1 if top is None else max(top(s) for s in (s0, (s0 + s1) / 2, s1))
    while z < zmax - 0.02:
        h = expo + lap
        zb, zt = z, z + h
        lo, hi = s0, s1
        if top is not None:
            # (where the gable's line is above this row's middle)
            mid = (zb + zt) / 2
            ok = [s for s in [s0 + (s1 - s0) * i / 200 for i in range(201)] if top(s) >= mid]
            if not ok:
                break
            lo, hi = max(lo, ok[0]), min(hi, ok[-1])
        for (a, b) in spans(hi - lo, [(h0 - lo, h1 - lo, hz0, hz1) for (h0, h1, hz0, hz1) in holes], zb, zt):
            a, b = a + lo, b + lo
            prof = [(0.0, zb), (t, zb), (0.007, zt), (0.0, zt)]
            prism(bm, face, prof, a, b, nseg=max(1, int((b - a) / 0.6)), top=top)
        z += expo
        row += 1


def lining(bm, face, z0, z1, holes=(), w=0.14, t=0.018, top=None, gap=0.0, s0=0.05, s1=None):
    """Upright tongue-and-groove boards on a face's inner plane (o from -face.t inwards), cut round the holes,
    their tops sloped to the gable's line when there is one."""
    s1 = face.L - 0.05 if s1 is None else s1
    n = max(1, int(round((s1 - s0) / w)))
    bw = (s1 - s0) / n
    o1 = -face.t
    for i in range(n):
        # (boards butted, each a hair thicker or thinner than the next: their seams read without gaps to see through)
        o0 = -face.t - t * (1.0 + 0.14 * ((i * 7) % 3 - 1))
        a, b = s0 + i * bw + gap / 2, s0 + (i + 1) * bw - gap / 2
        za, zb = (top(a), top(b)) if top else (z1, z1)
        pieces = [(z0, max(za, zb))]
        for (h0, h1, hz0, hz1) in holes:
            if h1 <= a or h0 >= b:
                continue
            new = []
            for (p0, p1) in pieces:
                if hz1 <= p0 or hz0 >= p1:
                    new.append((p0, p1))
                    continue
                if hz0 > p0 + 0.02:
                    new.append((p0, hz0))
                if hz1 < p1 - 0.02:
                    new.append((hz1, p1))
            pieces = new
        for (p0, p1) in pieces:
            top_a = min(p1, za) if p1 >= max(za, zb) - 1e-6 else p1
            top_b = min(p1, zb) if p1 >= max(za, zb) - 1e-6 else p1
            q = [face.p(a, o0, p0), face.p(b, o0, p0), face.p(b, o1, p0), face.p(a, o1, p0),
                 face.p(a, o0, top_a), face.p(b, o0, top_b), face.p(b, o1, top_b), face.p(a, o1, top_a)]
            vs = [bm.verts.new(x) for x in q]
            for f in ((0, 1, 2, 3), (4, 7, 6, 5), (0, 4, 5, 1), (1, 5, 6, 2), (2, 6, 7, 3), (3, 7, 4, 0)):
                bm.faces.new([vs[k] for k in f])


def bm_box(bm, c, size, rot=None):
    """A box into bm at centre c (size along X, Y, Z), turned by the matrix rot (3x3) if given."""
    m = Matrix.Translation(V(c))
    if rot is not None:
        m = m @ rot.to_4x4()
    K.bm_cube(bm, tuple(size), m)


def face_box(bm, face, s0, s1, o0, o1, z0, z1):
    """A box in a face's frame (s0..s1 along it, o0..o1 out of it, z0..z1 up)."""
    q = [face.p(s0, o0, z0), face.p(s1, o0, z0), face.p(s1, o1, z0), face.p(s0, o1, z0),
         face.p(s0, o0, z1), face.p(s1, o0, z1), face.p(s1, o1, z1), face.p(s0, o1, z1)]
    vs = [bm.verts.new(x) for x in q]
    for f in ((0, 1, 2, 3), (4, 7, 6, 5), (0, 4, 5, 1), (1, 5, 6, 2), (2, 6, 7, 3), (3, 7, 4, 0)):
        bm.faces.new([vs[k] for k in f])


def window(B, face, s0, s1, z0, z1, rows=2, cols=2, casing=0.08, shutters=False):
    """
    A sash window in an opening of a face (s0..s1, z0..z1): the casing round it on the outside (paint_b) with its
    sill standing out, the reveal lining the hole through the wall (wood), the frame and the glazing bars (paint_b),
    the glass in the middle of the wall's thickness, the inside casing (wood).
    """
    t = face.t
    # outside casing and the sill
    face_box(B['paint_b'], face, s0 - casing, s0, 0.0, 0.035, z0, z1 + casing)
    face_box(B['paint_b'], face, s1, s1 + casing, 0.0, 0.035, z0, z1 + casing)
    face_box(B['paint_b'], face, s0 - casing - 0.02, s1 + casing + 0.02, 0.0, 0.045, z1, z1 + casing + 0.01)
    face_box(B['paint_b'], face, s0 - casing - 0.03, s1 + casing + 0.03, -0.04, 0.075, z0 - 0.045, z0)
    # the reveal
    face_box(B['wood'], face, s0, s0 + 0.02, -t, 0.0, z0, z1)
    face_box(B['wood'], face, s1 - 0.02, s1, -t, 0.0, z0, z1)
    face_box(B['wood'], face, s0, s1, -t, 0.0, z1 - 0.02, z1)
    face_box(B['wood'], face, s0, s1, -t - 0.03, 0.0, z0, z0 + 0.025)
    # the frame and its bars (two sashes of rows x cols panes)
    om = -t * 0.45
    fw = 0.045
    face_box(B['paint_b'], face, s0 + 0.02, s1 - 0.02, om - 0.025, om + 0.025, z0 + 0.025, z0 + 0.025 + fw)
    face_box(B['paint_b'], face, s0 + 0.02, s1 - 0.02, om - 0.025, om + 0.025, z1 - 0.02 - fw, z1 - 0.02)
    face_box(B['paint_b'], face, s0 + 0.02, s0 + 0.02 + fw, om - 0.025, om + 0.025, z0 + 0.025, z1 - 0.02)
    face_box(B['paint_b'], face, s1 - 0.02 - fw, s1 - 0.02, om - 0.025, om + 0.025, z0 + 0.025, z1 - 0.02)
    gs0, gs1, gz0, gz1 = s0 + 0.02 + fw, s1 - 0.02 - fw, z0 + 0.025 + fw, z1 - 0.02 - fw
    # the meeting rail between the two sashes, and the bars
    zm = (gz0 + gz1) / 2
    face_box(B['paint_b'], face, gs0, gs1, om - 0.03, om + 0.03, zm - 0.025, zm + 0.025)
    for c in range(1, cols):
        s = gs0 + (gs1 - gs0) * c / cols
        face_box(B['paint_b'], face, s - 0.012, s + 0.012, om - 0.018, om + 0.018, gz0, gz1)
    for rr in range(1, rows):
        for (za, zb) in ((gz0, zm), (zm, gz1)):
            z = za + (zb - za) * rr / rows
            face_box(B['paint_b'], face, gs0, gs1, om - 0.018, om + 0.018, z - 0.012, z + 0.012)
    face_box(B['glass'], face, gs0, gs1, om - 0.004, om + 0.004, gz0, gz1)
    # inside casing
    face_box(B['wood'], face, s0 - 0.06, s0, -t - 0.04, -t, z0 - 0.04, z1 + 0.06)
    face_box(B['wood'], face, s1, s1 + 0.06, -t - 0.04, -t, z0 - 0.04, z1 + 0.06)
    face_box(B['wood'], face, s0 - 0.06, s1 + 0.06, -t - 0.04, -t, z1, z1 + 0.06)
    face_box(B['wood'], face, s0 - 0.08, s1 + 0.08, -t - 0.07, -t, z0 - 0.06, z0 - 0.03)
    if shutters:
        for (a, b) in ((s0 - casing - 0.42 * (s1 - s0) - 0.02, s0 - casing - 0.02), (s1 + casing + 0.02, s1 + casing + 0.02 + 0.42 * (s1 - s0))):
            for k in range(3):
                w = (b - a) / 3
                face_box(B['paint'], face, a + k * w + 0.004, a + (k + 1) * w - 0.004, 0.02, 0.045, z0, z1 + 0.04)
            face_box(B['paint'], face, a, b, 0.045, 0.06, z0 + 0.18, z0 + 0.28)
            face_box(B['paint'], face, a, b, 0.045, 0.06, z1 - 0.22, z1 - 0.12)


def tin(bm_by_mat, origin, adir, bdir, w, L, period=0.145, amp=0.017, segs=6, rust_every=5, seed=0.0, panel=0.86,
        lap=0.06, lift=None, rowlen=0.7):
    """
    A roof of corrugated sheets: `w` across the corrugations (along adir), `L` along them (bdir, down the slope);
    its face's normal adir x bdir (keep it pointing up and out). Sheets `panel` wide overlapping by `lap`, every
    rust_every-th one rusted; each one double-faced (its underside seen from under the eaves), a sheet's lower
    edge a little crooked here and there (`lift(i)` -> m).
    """
    o = V(origin)
    a = V(adir).normalized()
    b = V(bdir).normalized()
    n = a.cross(b).normalized()
    count = max(1, int(math.ceil((w - lap) / (panel - lap))))
    for i in range(count):
        a0 = i * (panel - lap)
        a1 = min(w, a0 + panel)
        mat = 'rust' if rust_every and (i * 7 + int(seed * 13)) % rust_every == 2 else 'steel'
        bm = bm_by_mat[mat]
        nx = max(2, int(round((a1 - a0) / period * segs)))
        ny = max(2, int(math.ceil(L / rowlen)))
        up = 0.004 * (i % 2)
        dl = lift(i) if lift else 0.0
        top, bot = [], []
        for ix in range(nx + 1):
            aa = a0 + (a1 - a0) * ix / nx
            hgt = amp * (0.5 - 0.5 * math.cos(TAU * aa / period)) + up
            rt, rb = [], []
            for iy in range(ny + 1):
                bb = L * iy / ny
                sag = dl * (iy / ny) ** 3
                p = o + a * aa + b * bb + n * (hgt + sag)
                rt.append(bm.verts.new(p))
                rb.append(bm.verts.new(p - n * 0.003))
            top.append(rt)
            bot.append(rb)
        for ix in range(nx):
            for iy in range(ny):
                bm.faces.new((top[ix][iy], top[ix + 1][iy], top[ix + 1][iy + 1], top[ix][iy + 1]))
                bm.faces.new((bot[ix][iy + 1], bot[ix + 1][iy + 1], bot[ix + 1][iy], bot[ix][iy]))


def ladder_mesh(P, foot, head, face, base, w=0.45, mat='steel', cage=False, rung=0.3, name='ladder', stand_off=0.31, over=1.0):
    """A ladder's rails and rungs for a card ladder whose feet go from `foot` to `head` (x, y, z): its rungs' line
    stand_off out from the feet's, towards the way one faces it (`face`, Blender degrees); its rails from `base` (the
    height its legs stand on) up past the head by `over` (the hand holds); a hooped cage round the climb from 2.2 m
    over its foot if asked."""
    a = math.radians(face)
    fx, fy = math.cos(a), math.sin(a)
    sx, sy = -fy, fx
    f0 = V(foot) + V((fx, fy, 0.0)) * stand_off
    f1 = V(head) + V((fx, fy, 0.0)) * stand_off
    d = f1 - f0
    L = d.length
    dn = d / L
    # (the rails follow the rungs' line down to the base and up past the head)
    t0 = (base - f0.z) / dn.z
    t1 = L + over / dn.z
    for sg in (-1, 1):
        o = V((sx * sg * w / 2, sy * sg * w / 2, 0.0))
        C.post(P, f'{name}_rail', f0 + dn * t0 + o, f0 + dn * t1 + o, 0.022, mat, segs=8)
    n = int((f1.z + 0.2 - base) / rung)
    for i in range(1, n + 1):
        z = base + i * rung
        t = (z - f0.z) / dn.z
        c = f0 + dn * t
        C.post(P, f'{name}_rung', c - V((sx, sy, 0.0)) * (w / 2), c + V((sx, sy, 0.0)) * (w / 2), 0.014, mat, segs=6)
    if cage and f1.z - base > 2.6:
        r = 0.36
        zc = base + 2.2
        while zc < f1.z + over - 0.1:
            t = (zc - f0.z) / dn.z
            c = f0 + dn * t
            cx, cy = c.x - fx * r, c.y - fy * r
            P.torus(f'{name}_hoop', r, 0.012, loc=(cx, cy, zc), material=mat, segs=20, rsegs=4, arc=math.pi * 1.6,
                    a0=a + math.pi * 0.2)
            zc += 0.9
        for k in range(5):
            ang = a + math.pi * (0.4 + 0.3 * k)
            ta, tb = (base + 2.2 - f0.z) / dn.z, (f1.z + over - 0.1 - f0.z) / dn.z
            ca, cb = f0 + dn * ta, f0 + dn * tb
            pa = (ca.x - fx * r + math.cos(ang) * r, ca.y - fy * r + math.sin(ang) * r, ca.z)
            pb = (cb.x - fx * r + math.cos(ang) * r, cb.y - fy * r + math.sin(ang) * r, cb.z)
            C.post(P, f'{name}_strap', pa, pb, 0.01, mat, segs=4)


def finish_bms(P, B, bev=None):
    """Every material's bmesh into the part (closed islands made to face out first)."""
    for mat, bm in B.items():
        if not bm.faces:
            bm.free()
            continue
        if mat not in ('steel', 'rust'):
            C.outward(bm)
        P.mesh(f'b_{mat}', bm, mat, bev=bev, sharp=40.0)


def new_set():
    """One bmesh per material: the things of one material made into one object."""
    names = ('paint', 'paint_b', 'wood', 'ceramic', 'steel', 'rust', 'glass', 'trim', 'fabric', 'alu', 'rubber')
    return {k: bmesh.new() for k in names}


# ------------------------------------------------------------------------------------------------ running

def run(table, args):
    """Build the buildings asked for (all: every one), export each, write its card."""
    ids, opts = K.parse(args)
    if 'all' in ids:
        ids = list(table.keys())
    for pid in ids:
        if pid not in table:
            raise SystemExit(f'unknown building {pid!r}; known: {sorted(table)}')
        P = K.Part(pid, {'no_ao': True, 'stats': bool(opts.get('stats'))})
        P.ao_distance = 0.5
        P.ao_samples = 24
        card, size, movers = table[pid](P)
        root = P.finish()
        mv = {o.name: o for o in P.mover_objs}
        for name, meta in movers.items():
            o = mv.get(name)
            if o is None:
                raise RuntimeError(f'{pid}: mover {name} was not built')
            for k, v in meta.items():
                o[k] = v
        root['size'] = [float(x) for x in size]
        root['prefab'] = pid
        if not opts.get('noao'):
            K.bake_ao_bvh([root], distance=P.ao_distance, samples=P.ao_samples)
            for o in P.mover_objs:
                K.bake_ao_bvh([o], distance=0.25, samples=16)
        path = os.path.join(OUT, f'{pid}.glb')
        P.export(path)
        card.write(size)
        print(f'BUILDING {pid}: {P.tris} tris -> {path}')
        if not opts.get('norender'):
            K.SCRATCH = SCRATCH
            views = getattr(P, 'views', None)
            if opts.get('toon'):
                K.render_toon(P, views=views, size=(960, 640))
            else:
                K.render(P, views=views)
