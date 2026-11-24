"""
The wooden cabin (docs/ND/PLAN.md, ND1): a prefab building of Nomad Drive's "wooden cabin" class (WoodenCabin01:
about 9.4 x 8.8 m, a floor raised some 0.6 m, one room with a nook, a porch with steps at one end, its door onto
the porch, a ceiling lamp and its switch by the door, a lamp over the porch) in our own design:

    blender -b --factory-startup --python tools/blender/build.py -- nd/cabin [cabin] [--norender] [--noao] [--toon]

A trapper's cabin of lap-sided boards (paint) with cream trim (paint_b) on stone piers (ceramic), a gabled roof of
corrugated tin (steel, a rusted sheet here and there) on open rafters, the roof run on over a porch at its west
end (its own open gable, posts, a railing, three steps down to the road side), a lean-to woodshed against its east
end stacked with split logs, a window nook with a seat at the back. Inside: boarded walls (wood), open rafters and
tie beams, a plank floor, a box stove on a stone hearth with its pipe out through the roof, a rag rug, the lamp.
Its frame and its card: nd/_nd.py.
"""
import math

import bmesh
from mathutils import Matrix, Vector

from parts import _kit as K
from parts._kit import V, mat4
from places import _common as C
from nd import _nd as N
from nd._nd import Face, face_box

TAU = math.tau
PITCH = math.radians(32.0)
KS = math.tan(PITCH)
T = 0.16                         # the walls' thickness
BX0, BX1 = -2.75, 3.25           # the body's ends (outer faces)
BY = 2.7                         # its sides at +-BY
ZW = 2.5                         # the walls' top (eaves)
ZR0 = ZW + 0.13                  # the roof's underside at the walls' outer line (the rafters stand on the walls)
XR0, XR1 = -4.7, 3.55            # the main roof's ends: over the porch, the east gable's overhang
YE = 3.15                        # the eaves' edge
NX0, NX1, NY = 0.25, 1.8, -3.45  # the nook
PX0 = -4.55                      # the porch's outer edge
PZ = -0.06                       # the porch deck's top
SX1 = 4.65                       # the woodshed's outer edge
GROUND = -0.6                    # the levelled ground under the floor


def roof_z(y):
    """The main roof's underside (the rafters' tops) over a point of the plan."""
    return ZR0 + (BY - abs(y)) * KS


def jit(k, a=0.0):
    return C.jit(k, a)


def cabin(P):
    card = N.Card('cabin')
    B = N.new_set()
    # ---------------------------------------------------------------------------------------- the walls
    front = Face((BX0, BY), (BX1, BY), (0, 1), T)
    back = Face((BX1, -BY), (BX0, -BY), (0, -1), T)
    west = Face((BX0, -BY), (BX0, BY), (-1, 0), T)
    east = Face((BX1, BY), (BX1, -BY), (1, 0), T)
    gable = N.gable_top(2 * BY, ZW, KS)
    win_front = [(1.15, 2.15, 0.95, 2.05), (3.7, 4.7, 0.95, 2.05)]
    win_back = [(3.9, 4.7, 1.0, 1.9)]
    nook_hole = (BX1 - NX1, BX1 - NX0, 0.0, 1.95)
    door_hole = (2.85, 3.75, 0.0, 2.05)
    N.siding(B['paint'], front, -0.02, ZW, win_front)
    N.siding(B['paint'], back, -0.02, ZW, win_back + [nook_hole])
    N.siding(B['paint'], west, -0.02, 6.0, [door_hole], top=gable)
    N.siding(B['paint'], east, -0.02, 6.0, [], top=gable)
    # the boarded walls inside, up to the roof on the gable ends
    N.lining(B['wood'], front, 0.0, ZW - 0.12, win_front)
    N.lining(B['wood'], back, 0.0, ZW - 0.12, win_back + [nook_hole])
    N.lining(B['wood'], west, 0.0, 6.0, [door_hole], top=lambda s: gable(s) - 0.05)
    N.lining(B['wood'], east, 0.0, 6.0, [], top=lambda s: gable(s) - 0.05)
    # the sill beam the boards start over, the top plates under the rafters, the corner boards
    for f in (front, back, west, east):
        face_box(B['wood'], f, -0.03, f.L + 0.03, -f.t, 0.035, -0.3, -0.02)
    for f in (front, back):
        face_box(B['wood'], f, 0.0, f.L, -f.t - 0.02, 0.0, ZW - 0.12, ZW)
    for (x, y, sx, sy) in ((BX0, BY, -1, 1), (BX1, BY, 1, 1), (BX0, -BY, -1, -1), (BX1, -BY, 1, -1)):
        N.bm_box(B['paint_b'], (x + sx * 0.02, y - sy * 0.045, ZW / 2 - 0.01), (0.04, 0.11, ZW + 0.02))
        N.bm_box(B['paint_b'], (x - sx * 0.045, y + sy * 0.02, ZW / 2 - 0.01), (0.11, 0.04, ZW + 0.02))
    # the windows: two in front, one at the back by the stove, one in the nook
    for (s0, s1, z0, z1) in win_front:
        N.window(B, front, s0, s1, z0, z1, rows=2, cols=2, shutters=True)
    for (s0, s1, z0, z1) in win_back:
        N.window(B, back, s0, s1, z0, z1, rows=1, cols=2)
    # the doorway: cased outside (paint_b) and in, its reveal boarded
    s0, s1 = door_hole[0], door_hole[1]
    face_box(B['paint_b'], west, s0 - 0.09, s0, 0.0, 0.035, -0.02, 2.05 + 0.1)
    face_box(B['paint_b'], west, s1, s1 + 0.09, 0.0, 0.035, -0.02, 2.05 + 0.1)
    face_box(B['paint_b'], west, s0 - 0.11, s1 + 0.11, 0.0, 0.05, 2.05 + 0.1, 2.05 + 0.2)
    face_box(B['wood'], west, s0 - 0.06, s0, -T - 0.035, -T, 0.0, 2.11)
    face_box(B['wood'], west, s1, s1 + 0.06, -T - 0.035, -T, 0.0, 2.11)
    face_box(B['wood'], west, s0 - 0.06, s1 + 0.06, -T - 0.035, -T, 2.05, 2.11)
    face_box(B['wood'], west, s0, s0 + 0.02, -T, 0.0, 0.0, 2.05)
    face_box(B['wood'], west, s1 - 0.02, s1, -T, 0.0, 0.0, 2.05)
    face_box(B['wood'], west, s0, s1, -T, 0.0, 2.03, 2.05)
    # the opening into the nook: a header over it, cased inside
    s0, s1 = nook_hole[0], nook_hole[1]
    face_box(B['wood'], back, s0 - 0.08, s1 + 0.08, -T - 0.05, 0.0, 1.95, 2.1)
    face_box(B['wood'], back, s0 - 0.07, s0, -T - 0.04, 0.0, 0.0, 1.95)
    face_box(B['wood'], back, s1, s1 + 0.07, -T - 0.04, 0.0, 0.0, 1.95)
    # ---------------------------------------------------------------------------------------- the nook
    nz = lambda y: 2.18 - (abs(y) - BY) * (0.22 / 0.85)       # its roof's underside, falling outwards
    n_back = Face((NX1, NY), (NX0, NY), (0, -1), 0.12)
    n_w = Face((NX0, NY), (NX0, -BY), (-1, 0), 0.12)
    n_e = Face((NX1, -BY), (NX1, NY), (1, 0), 0.12)
    nwin = [(0.3, 1.25, 0.6, 1.45)]
    N.siding(B['paint'], n_back, -0.02, nz(NY) - 0.05, nwin)
    N.siding(B['paint'], n_w, -0.02, 2.3, [], top=lambda s: nz(NY + s) - 0.04)
    N.siding(B['paint'], n_e, -0.02, 2.3, [], top=lambda s: nz(-BY - s) - 0.04)
    N.lining(B['wood'], n_back, 0.0, nz(NY) - 0.08, nwin, s0=0.02, s1=n_back.L - 0.02)
    N.lining(B['wood'], n_w, 0.0, 2.3, [], top=lambda s: nz(NY + s) - 0.07, s0=0.02, s1=n_w.L - 0.12)
    N.lining(B['wood'], n_e, 0.0, 2.3, [], top=lambda s: nz(-BY - s) - 0.07, s0=0.12, s1=n_e.L - 0.02)
    for f in (n_back, n_w, n_e):
        face_box(B['wood'], f, -0.03, f.L + 0.03, -f.t, 0.035, -0.3, -0.02)
    N.window(B, n_back, *nwin[0], rows=1, cols=3)
    for (x, sx) in ((NX0, -1), (NX1, 1)):
        N.bm_box(B['paint_b'], (x + sx * 0.02, NY + 0.045, 0.99), (0.04, 0.11, 2.02))
        N.bm_box(B['paint_b'], (x - sx * 0.045, NY - 0.02, 0.99), (0.11, 0.04, 2.02))
    # its little roof: boards under, tin over, falling away from the cabin
    nb = math.atan2(0.22, 0.85)
    for (y0, y1) in ((-BY + 0.05, NY - 0.12),):
        L = (abs(y1 - y0)) / math.cos(nb)
        for k in range(7):
            x = NX0 - 0.1 + k * (NX1 - NX0 + 0.2) / 6
            a = V((x, y0, nz(y0)))
            b = V((x, y1, nz(y1)))
            C.plank(P, 'nook_rafter', a - V((0, 0, 0.05)), b - V((0, 0, 0.05)), 0.045, 0.1, 'wood', up=(0, 0.25, 1), bev=0.004, floor=False)
        N.bm_box(B['wood'], ((NX0 + NX1) / 2, (y0 + y1) / 2, (nz(y0) + nz(y1)) / 2 + 0.012),
                 (NX1 - NX0 + 0.3, abs(y1 - y0), 0.022), Matrix.Rotation(nb, 3, 'X'))
        dn = V((0, -math.cos(nb), -math.sin(nb)))
        N.tin(B, (NX1 + 0.15, -BY + 0.02, nz(-BY) + 0.03), (-1, 0, 0), tuple(dn), NX1 - NX0 + 0.3, L + 0.12, seed=0.3,
              rust_every=0, panel=0.6)
    # ---------------------------------------------------------------------------------------- floors
    # the room: boards along X, the nook's the same way
    def boards(x0, x1, y0, y1, w=0.14, z0=-0.04, along='x', name='floor'):
        if along == 'x':
            n = int(round((y1 - y0) / w))
            bw = (y1 - y0) / n
            for i in range(n):
                ya, yb = y0 + i * bw + 0.002, y0 + (i + 1) * bw - 0.002
                bm = B['wood']
                L = x1 - x0
                f = Face((x0, (ya + yb) / 2), (x1, (ya + yb) / 2), (0, 1), 0.0)
                N.prism(bm, f, [(-(yb - ya) / 2, z0), ((yb - ya) / 2, z0), ((yb - ya) / 2, 0.0), (-(yb - ya) / 2, 0.0)],
                        0.0, L, nseg=max(1, int(L / 0.5)))
        else:
            n = int(round((x1 - x0) / w))
            bw = (x1 - x0) / n
            for i in range(n):
                xa, xb = x0 + i * bw + 0.004, x0 + (i + 1) * bw - 0.004
                f = Face(((xa + xb) / 2, y0), ((xa + xb) / 2, y1), (-1, 0), 0.0)
                N.prism(B['wood'], f, [(-(xb - xa) / 2, z0), ((xb - xa) / 2, z0), ((xb - xa) / 2, 0.0), (-(xb - xa) / 2, 0.0)],
                        0.0, y1 - y0, nseg=max(1, int((y1 - y0) / 0.5)))

    boards(BX0 + 0.12, BX1 - 0.12, -BY + 0.12, BY - 0.12)
    boards(NX0 + 0.1, NX1 - 0.1, NY + 0.1, -BY + 0.12)
    # the threshold at the door
    N.bm_box(B['wood'], (BX0 + T / 2, 0.6, -0.015), (T + 0.04, 0.96, 0.05))
    card.box(BX0, BX1, -BY, BY, -1.2, 0.0, floor=True)
    card.box(NX0, NX1, NY, -BY, -1.2, 0.0, floor=True)
    # ---------------------------------------------------------------------------------------- the walls' solids
    card.box(BX0, BX1, BY - T - 0.02, BY + 0.03, -0.3, ZW + 0.1)
    card.box(BX0, NX0, -BY - 0.03, -BY + T + 0.02, -0.3, ZW + 0.1)
    card.box(NX1, BX1, -BY - 0.03, -BY + T + 0.02, -0.3, ZW + 0.1)
    card.box(BX1 - T - 0.02, BX1 + 0.03, -BY, BY, -0.3, ZW + 0.1)
    card.box(BX0 - 0.03, BX0 + T + 0.02, -BY, 0.15, -0.3, ZW + 0.1)
    card.box(BX0 - 0.03, BX0 + T + 0.02, 1.05, BY, -0.3, ZW + 0.1)
    card.box(BX0 - 0.03, BX0 + T + 0.02, 0.15, 1.05, 2.05, ZW + 0.1)
    card.box(NX0, NX1, NY - 0.03, NY + 0.14, -0.3, 2.1)
    card.box(NX0 - 0.03, NX0 + 0.14, NY, -BY, -0.3, 2.1)
    card.box(NX1 - 0.14, NX1 + 0.03, NY, -BY, -0.3, 2.1)
    # ---------------------------------------------------------------------------------------- the main roof
    # rafters on both slopes from the ridge to the eaves, the ridge beam, tie beams across the room
    nrm = {1: V((0, KS, 1)).normalized(), -1: V((0, -KS, 1)).normalized()}
    xs = [XR0 + 0.04] + [XR0 + 0.3 + 0.6 * k for k in range(int((XR1 - XR0 - 0.4) / 0.6) + 1)] + [XR1 - 0.04]
    xs = sorted(set(round(x, 3) for x in xs if XR0 <= x <= XR1))
    for x in xs:
        for sg in (1, -1):
            top0 = V((x, 0.0, roof_z(0.0)))
            top1 = V((x, sg * YE, roof_z(YE)))
            n = nrm[sg]
            a, b = top0 - n * 0.065, top1 - n * 0.065
            barge = x in (xs[0], xs[-1])
            C.plank(P, 'rafter', a, b, 0.05 if not barge else 0.06, 0.13, 'wood', up=tuple(n), bev=0.004, floor=False)
    C.plank(P, 'ridge', (XR0, 0.0, roof_z(0.0) - 0.11), (XR1, 0.0, roof_z(0.0) - 0.11), 0.09, 0.2, 'wood', up=(0, 0, 1),
            bev=0.006, floor=False)
    for x in (-1.0, 1.25):
        C.plank(P, 'tie', (x, -BY + 0.05, ZW - 0.06), (x, BY - 0.05, ZW - 0.06), 0.1, 0.14, 'wood', up=(0, 0, 1), bev=0.006,
                floor=False)
        C.plank(P, 'king', (x, 0.0, ZW + 0.01), (x, 0.0, roof_z(0.0) - 0.2), 0.09, 0.09, 'wood', up=(1, 0, 0), bev=0.005,
                floor=False)
    # sheathing over the rafters (wood, seen from inside and under the eaves), the tin over that
    for sg in (1, -1):
        f = Face((XR0 - 0.02, 0.0), (XR1 + 0.02, 0.0), (0, sg), 0.0)
        prof = [(0.0, roof_z(0.0)), (YE + 0.02, roof_z(YE + 0.02)), (YE + 0.02, roof_z(YE + 0.02) + 0.024 / math.cos(PITCH)),
                (0.0, roof_z(0.0) + 0.024 / math.cos(PITCH))]
        N.prism(B['wood'], f, prof, 0.0, f.L, nseg=int(f.L / 0.6))
    down = {1: V((0, 1, -KS)).normalized(), -1: V((0, -1, -KS)).normalized()}
    z_top = roof_z(0.0) + 0.024 / math.cos(PITCH) + 0.002
    N.tin(B, (XR0 - 0.04, 0.0, z_top), (1, 0, 0), tuple(down[1]), XR1 - XR0 + 0.08, (YE + 0.06) / math.cos(PITCH), seed=0.1,
          lift=lambda i: 0.03 if i % 4 == 1 else 0.0)
    N.tin(B, (XR1 + 0.04, 0.0, z_top), (-1, 0, 0), tuple(down[-1]), XR1 - XR0 + 0.08, (YE + 0.06) / math.cos(PITCH), seed=0.7,
          lift=lambda i: 0.025 if i % 5 == 3 else 0.0)
    # the ridge cap
    for sg in (1, -1):
        f = Face((XR0 - 0.05, 0.0), (XR1 + 0.05, 0.0), (0, sg), 0.0)
        prof = [(0.0, z_top + 0.035), (0.2, z_top + 0.035 - 0.2 * KS), (0.2, z_top + 0.03 - 0.2 * KS), (0.0, z_top + 0.03)]
        N.prism(B['steel'], f, prof, 0.0, f.L, nseg=int(f.L / 0.8))
    # bargeboards on both gables, fascia boards along the eaves
    for x in (XR0 - 0.03, XR1 + 0.03):
        for sg in (1, -1):
            a = V((x, 0.0, z_top + 0.02))
            b = V((x, sg * (YE + 0.03), roof_z(YE + 0.03) + 0.02))
            C.plank(P, 'barge', a - nrm[sg] * 0.09, b - nrm[sg] * 0.09, 0.03, 0.2, 'paint_b', up=tuple(nrm[sg]), bev=0.004,
                    floor=False)
    for sg in (1, -1):
        zf = roof_z(YE) - 0.05
        N.bm_box(B['paint_b'], ((XR0 + XR1) / 2, sg * (YE + 0.015), zf), (XR1 - XR0 + 0.08, 0.03, 0.16))
    # a gutter along the front eaves and its downpipe to the rain barrel at the corner
    gz = roof_z(YE) - 0.12
    f = Face((BX0 - 0.2, YE + 0.09), (BX1 + 0.15, YE + 0.09), (0, 1), 0.0)
    prof = [(0.07 * math.cos(a), gz + 0.07 * math.sin(a)) for a in [math.pi + k * math.pi / 6 for k in range(7)]]
    prof = prof + [(p[0] * 0.86, gz + (p[1] - gz) * 0.86) for p in prof[::-1]]
    N.prism(B['steel'], f, prof, 0.0, f.L, nseg=8)
    C.post(P, 'downpipe', (BX1 + 0.05, YE + 0.09, gz - 0.02), (BX1 + 0.05, YE + 0.09, 0.45), 0.035, 'steel', segs=10)
    C.post(P, 'downpipe_kick', (BX1 + 0.05, YE + 0.09, 0.47), (BX1 - 0.12, YE - 0.05, 0.25), 0.035, 'steel', segs=10)
    # ---------------------------------------------------------------------------------------- the porch
    boards(PX0, BX0, -BY, BY, w=0.12, z0=PZ - 0.04, along='y')
    for f in (Face((PX0, -BY), (PX0, BY), (-1, 0), 0.0), Face((PX0, -BY), (BX0, -BY), (0, -1), 0.0),
              Face((BX0, BY), (PX0, BY), (0, 1), 0.0)):
        face_box(B['wood'], f, -0.02, f.L + 0.02, -0.06, 0.0, -0.32, PZ - 0.04)
    # its posts, the plates along its sides and the open gable's tie beam, knee braces
    for sg in (1, -1):
        y = sg * 2.55
        N.bm_box(B['wood'], (-4.45, y, (PZ + ZW) / 2), (0.11, 0.11, ZW - PZ))
        C.plank(P, 'porch_plate', (PX0 - 0.1, y, ZW - 0.06), (BX0, y, ZW - 0.06), 0.11, 0.12, 'wood', up=(0, 0, 1), bev=0.005,
                floor=False)
        C.plank(P, 'brace', (-4.45, y, ZW - 0.62), (-3.95, y, ZW - 0.12), 0.07, 0.07, 'wood', up=(0, 1, 0), bev=0.004, floor=False)
        C.plank(P, 'brace', (-4.45, y - sg * 0.02, ZW - 0.62), (-4.45, y - sg * 0.5, ZW - 0.12), 0.07, 0.07, 'wood',
                up=(1, 0, 0), bev=0.004, floor=False)
        card.post(-4.45, y, 0.08, PZ, ZW)
    C.plank(P, 'porch_tie', (-4.45, -2.62, ZW - 0.06), (-4.45, 2.62, ZW - 0.06), 0.11, 0.14, 'wood', up=(0, 0, 1), bev=0.005,
            floor=False)
    C.plank(P, 'porch_king', (-4.45, 0.0, ZW + 0.01), (-4.45, 0.0, roof_z(0.0) - 0.2), 0.09, 0.09, 'wood', up=(1, 0, 0),
            bev=0.005, floor=False)
    # the railing: west side, south side, and stubs either side of the steps
    def rail(a, b, name='rail'):
        a, b = V(a), V(b)
        L = (b - a).length
        d = (b - a).normalized()
        C.plank(P, name + '_top', a + V((0, 0, 0.9)), b + V((0, 0, 0.9)), 0.09, 0.045, 'wood', up=(0, 0, 1), bev=0.006,
                floor=False)
        C.plank(P, name + '_low', a + V((0, 0, 0.1)), b + V((0, 0, 0.1)), 0.06, 0.04, 'wood', up=(0, 0, 1), bev=0.004,
                floor=False)
        n = max(1, int(L / 0.13))
        for k in range(1, n):
            p = a + d * (L * k / n)
            N.bm_box(B['wood'], (p.x, p.y, PZ + 0.5), (0.035, 0.035, 0.78))

    rail((-4.45, -2.5, PZ), (-4.45, 2.5, PZ))
    rail((-4.4, -2.55, PZ), (BX0, -2.55, PZ))
    rail((-4.4, 2.55, PZ), (-4.3, 2.55, PZ), 'stub')
    rail((-3.0, 2.55, PZ), (BX0, 2.55, PZ), 'stub')
    card.box(-4.52, -4.38, -2.6, 2.6, PZ, PZ + 0.95)
    card.box(-4.45, BX0, -2.62, -2.48, PZ, PZ + 0.95)
    card.box(-4.45, -4.28, 2.48, 2.62, PZ, PZ + 0.95)
    card.box(-3.02, BX0, 2.48, 2.62, PZ, PZ + 0.95)
    card.box(PX0, BX0, -BY, BY, -1.2, PZ, floor=True)
    # the steps down to the road side: stringers and three treads
    for (y0, y1, z) in ((BY, 2.98, -0.25), (2.98, 3.26, -0.43)):
        N.bm_box(B['wood'], (-3.65, (y0 + y1) / 2 + 0.01, z - 0.02), (1.3, y1 - y0 + 0.04, 0.04))
        card.box(-4.3, -3.0, y0, y1, -1.2, z, floor=True)
    for x in (-4.27, -3.03):
        bm = bmesh.new()
        K.bm_prism(bm, [(BY - 0.05, PZ - 0.06), (3.34, GROUND - 0.02), (3.18, GROUND - 0.02), (BY - 0.05, PZ - 0.2)], 0.05,
                   matrix=mat4((x, 0, 0), (90, 0, 90)))
        P.mesh('stringer', bm, 'wood', bev=0.004)
    # ---------------------------------------------------------------------------------------- piers under it all
    piers = [(x, y) for x in (BX0 + 0.15, -0.95, 0.9, BX1 - 0.15) for y in (-BY + 0.15, BY - 0.15)]
    piers += [(x, 0.0) for x in (BX0 + 0.15, BX1 - 0.15)]
    piers += [(PX0 + 0.12, y) for y in (-2.55, 0.0, 2.55)]
    piers += [(NX0 + 0.1, NY + 0.12), (NX1 - 0.1, NY + 0.12)]
    for i, (x, y) in enumerate(piers):
        z = -0.3 if abs(x - PX0 - 0.12) > 0.05 else PZ - 0.32
        for c in range(4):
            h = 0.2 + 0.03 * jit(i, c)
            s = 0.3 + 0.04 * jit(i, c + 7)
            N.bm_box(B['ceramic'], (x + 0.015 * jit(i, c + 2), y + 0.015 * jit(i, c + 3), z - h / 2),
                     (s, s * (0.92 + 0.1 * jit(i, c + 4)), h - 0.012), Matrix.Rotation(0.12 * jit(i, c + 5), 3, 'Z'))
            z -= h
    # skirting boards between the piers along the front and the ends (the crawl space behind them dark)
    for f in (front, west, east):
        n = int(f.L / 0.1)
        for k in range(n):
            s = (k + 0.5) * f.L / n
            if f is west:
                continue
            face_box(B['wood'], f, s - 0.035, s + 0.035, -0.02, 0.0, GROUND - 0.08, -0.32)
    # ---------------------------------------------------------------------------------------- the woodshed
    sz0, sz1 = 2.2, 1.72
    sslope = math.atan2(sz0 - sz1, SX1 - BX1)
    for y in (-2.45, 0.0, 2.45):
        N.bm_box(B['wood'], (SX1 - 0.12, y, (GROUND + sz1) / 2), (0.1, 0.1, sz1 - GROUND - 0.04))
        card.post(SX1 - 0.12, y, 0.07, GROUND, sz1)
    C.plank(P, 'shed_beam', (SX1 - 0.12, -2.6, sz1 - 0.07), (SX1 - 0.12, 2.6, sz1 - 0.07), 0.1, 0.12, 'wood', up=(0, 0, 1),
            bev=0.005, floor=False)
    C.plank(P, 'shed_ledger', (BX1 + 0.04, -2.6, sz0 - 0.1), (BX1 + 0.04, 2.6, sz0 - 0.1), 0.05, 0.14, 'wood', up=(1, 0, 0),
            bev=0.004, floor=False)
    for k in range(9):
        y = -2.6 + k * 5.2 / 8
        C.plank(P, 'shed_rafter', (BX1, y, sz0 - 0.04), (SX1 + 0.05, y, sz1 - 0.04 - 0.05 * math.tan(sslope)), 0.045, 0.1,
                'wood', up=(math.sin(sslope), 0, math.cos(sslope)), bev=0.004, floor=False)
    dn = V((math.cos(sslope), 0, -math.sin(sslope)))
    N.tin(B, (BX1 + 0.02, 2.72, sz0 + 0.02), (0, -1, 0), tuple(dn), 5.44, (SX1 + 0.07 - BX1) / math.cos(sslope), seed=0.5,
          rust_every=3, panel=0.8)
    # split logs stacked against the wall in two ricks, a few lying about
    logs = bmesh.new()
    for (y0, y1, rows) in ((-2.3, -0.25, 8), (0.25, 2.25, 7)):
        n = int((y1 - y0) / 0.15)
        for rw in range(rows):
            for k in range(n):
                y = y0 + (k + 0.5) * (y1 - y0) / n + 0.02 * jit(rw * 31 + k, y0)
                z = GROUND + 0.075 + rw * 0.13
                rr = 0.06 + 0.012 * jit(rw * 17 + k, 3.0)
                L = 0.42 + 0.06 * jit(k, rw)
                m = (Matrix.Translation((BX1 + 0.08 + L / 2 + 0.03 * jit(k, rw + 9), y, z)) @
                     Matrix.Rotation(math.pi / 2, 4, 'Y') @ Matrix.Rotation(jit(k * 3, rw) * 3.0, 4, 'Z'))
                segs = 3 if (rw + k) % 4 == 0 else 6
                K.bm_cyl(logs, rr * (1.25 if segs == 3 else 1.0), L, segs=segs, matrix=m)
    P.mesh('logs', logs, 'wood', sharp=50.0)
    card.box(BX1, BX1 + 0.58, -2.35, -0.2, GROUND, GROUND + 1.1)
    card.box(BX1, BX1 + 0.58, 0.2, 2.3, GROUND, GROUND + 1.0)
    # the chopping block before it, an axe in it
    C.post(P, 'block', (4.05, 3.25, GROUND - 0.05), (4.05, 3.25, GROUND + 0.45), 0.24, 'wood', segs=12)
    C.post(P, 'axe_haft', (4.0, 3.2, GROUND + 0.5), (3.72, 3.05, GROUND + 1.08), 0.018, 'wood', segs=8)
    N.bm_box(B['steel'], (4.03, 3.22, GROUND + 0.47), (0.16, 0.03, 0.09), Matrix.Rotation(0.4, 3, 'Z'))
    card.post(4.05, 3.25, 0.25, GROUND, GROUND + 0.45)
    # the rain barrel under the downpipe
    bar = [(0.0, 0.0), (0.27, 0.0), (0.31, 0.15), (0.33, 0.42), (0.31, 0.7), (0.28, 0.85), (0.25, 0.85), (0.27, 0.7),
           (0.29, 0.42), (0.27, 0.15), (0.24, 0.06), (0.0, 0.06)]
    P.lathe('barrel', [(r, GROUND + z) for (r, z) in bar], loc=(BX1 - 0.12, YE - 0.1, 0.0), material='wood', segs=20,
            sharp=40.0)
    for zz, rr in ((0.12, 0.312), (0.42, 0.333), (0.72, 0.302)):
        P.torus('hoop', rr, 0.012, loc=(BX1 - 0.12, YE - 0.1, GROUND + zz), material='steel', segs=24, rsegs=4)
    P.cyl('water', 0.255, 0.01, loc=(BX1 - 0.12, YE - 0.1, GROUND + 0.78), material='glass_dark', segs=20)
    card.post(BX1 - 0.12, YE - 0.1, 0.33, GROUND, GROUND + 0.86)
    # ---------------------------------------------------------------------------------------- inside
    # the stove on its hearth in the back corner, its pipe up through the roof
    sx, sy = -2.0, -1.95
    N.bm_box(B['ceramic'], (sx - 0.05, sy - 0.05, 0.025), (0.95, 0.95, 0.05))
    for (dx, dy) in ((-0.18, -0.14), (0.18, -0.14), (-0.18, 0.14), (0.18, 0.14)):
        C.post(P, 'stove_leg', (sx + dx, sy + dy, 0.05), (sx + dx * 1.08, sy + dy * 1.08, 0.22), 0.022, 'trim', segs=6)
    P.box('stove', (0.5, 0.4, 0.42), (sx, sy, 0.43), 'trim', bev=0.02, segs=2)
    P.box('stove_top', (0.56, 0.46, 0.035), (sx, sy, 0.655), 'trim', bev=0.01, segs=1)
    P.box('stove_door', (0.025, 0.26, 0.22), (sx + 0.26, sy, 0.42), 'trim', bev=0.006, segs=1)
    P.cyl('stove_knob', 0.018, 0.04, loc=(sx + 0.29, sy + 0.09, 0.44), material='alu', axis='X', segs=8)
    for k in range(3):
        P.box('vent', (0.012, 0.18, 0.012), (sx + 0.275, sy, 0.33 + k * 0.025), 'steel', bev=None)
    C.post(P, 'flue', (sx - 0.05, sy - 0.03, 0.67), (sx - 0.05, sy - 0.03, roof_z(sy) + 0.6), 0.065, 'trim', segs=12)
    C.post(P, 'flue_out', (sx - 0.05, sy - 0.03, roof_z(sy) + 0.55), (sx - 0.05, sy - 0.03, roof_z(0.0) + 0.55), 0.065,
           'steel', segs=12)
    P.lathe('flue_cap', [(0.0, 0.0), (0.16, 0.0), (0.0, 0.13)], loc=(sx - 0.05, sy - 0.03, roof_z(0.0) + 0.62),
            material='steel', segs=12)
    P.lathe('flue_boot', [(0.07, 0.0), (0.2, 0.0), (0.07, 0.12)], loc=(sx - 0.05, sy - 0.03, roof_z(sy) + 0.025),
            material='steel', segs=12)
    # the heat shield on the walls behind it
    face_box(B['steel'], back, back.L - 1.25, back.L - 0.25, -T - 0.06, -T - 0.04, 0.3, 1.5)
    face_box(B['steel'], west, 0.25, 1.25, -T - 0.06, -T - 0.04, 0.3, 1.5)
    card.box(sx - 0.32, sx + 0.3, sy - 0.25, sy + 0.24, 0.0, 0.7)
    # the window seat in the nook, its cushion and a pillow
    N.bm_box(B['wood'], ((NX0 + NX1) / 2, NY + 0.32, 0.21), (NX1 - NX0 - 0.26, 0.42, 0.42))
    P.pillow('seat_cushion', (NX1 - NX0 - 0.3, 0.4, 0.08), loc=((NX0 + NX1) / 2, NY + 0.33, 0.46), material='fabric',
             r=0.025, puff=0.01)
    P.pillow('pillow', (0.36, 0.12, 0.28), loc=(NX0 + 0.35, NY + 0.22, 0.62), rot=(0, 0, 12), material='fabric',
             r=0.04, puff=0.02)
    card.box(NX0 + 0.13, NX1 - 0.13, NY + 0.11, NY + 0.53, 0.0, 0.5, floor=True)
    # a rag rug on the floor
    rug = [(0.95 * math.cos(a), 0.6 * math.sin(a)) for a in [k * TAU / 28 for k in range(28)]]
    bm = bmesh.new()
    K.bm_prism(bm, rug, 0.01, matrix=mat4((0.55, -0.25, 0.005), (0, 0, 8)))
    P.mesh('rug', bm, 'fabric', sharp=60.0)
    # the ceiling lamp on its cord from the ridge, the switch by the door, the porch lamp
    lx, ly = 0.25, 0.0
    C.post(P, 'cord', (lx, ly, roof_z(0.0) - 0.21), (lx, ly, 2.36), 0.006, 'trim', segs=5)
    P.lathe('shade', [(0.015, 2.36), (0.04, 2.355), (0.2, 2.22), (0.21, 2.205), (0.205, 2.2), (0.19, 2.215), (0.035, 2.34),
                      (0.0, 2.345)], loc=(lx, ly, 0.0), material='paint_b', segs=20, sharp=50.0)
    P.sphere('bulb', 0.045, loc=(lx, ly, 2.24), material='glass', u=10, v=6)
    P.empty('M_lamp', loc=(lx, ly, 2.24))
    card.lamp('ceiling', lx, ly, 2.24, 5.5)
    P.box('switch_plate', (0.012, 0.075, 0.12), (BX0 + T + 0.006, -0.05, 1.35), 'paint_b', bev=0.003)
    P.box('switch', (0.02, 0.016, 0.03), (BX0 + T + 0.02, -0.05, 1.355), 'trim', bev=0.003)
    P.empty('M_switch', loc=(BX0 + T + 0.02, -0.05, 1.35))
    lp = (BX0 - 0.13, 1.42, 2.05)
    P.box('lantern_back', (0.03, 0.12, 0.2), (BX0 - 0.015, lp[1], lp[2] + 0.05), 'trim', bev=0.004)
    P.box('lantern_arm', (0.12, 0.02, 0.02), (BX0 - 0.07, lp[1], lp[2] + 0.18), 'trim', bev=None)
    P.box('lantern_glass', (0.13, 0.13, 0.17), lp, 'glass', bev=0.004)
    P.lathe('lantern_cap', [(0.0, 0.0), (0.11, 0.0), (0.0, 0.07)], loc=(lp[0], lp[1], lp[2] + 0.085), material='trim', segs=4)
    P.empty('M_porchlamp', loc=lp)
    card.lamp('porch', lp[0], lp[1], lp[2], 4.0)
    card.switch('switch', BX0 + T + 0.02, -0.05, 1.35, ['ceiling', 'porch'])
    # ---------------------------------------------------------------------------------------- the door
    # a ledged and braced door of six boards, hung on its edge towards the front, opening into the room
    hx, hy = BX0 + T - 0.02, 1.05
    dw, dh, dt = 0.88, 2.03, 0.045
    dx = hx - dt / 2
    since = len(P.statics)
    for k in range(6):
        y0 = hy - 0.005 - (k + 1) * dw / 6
        P.box('door_board', (dt, dw / 6 - 0.004, dh), (dx, y0 + dw / 12, dh / 2 + 0.005), 'paint', bev=0.003)
    for z in (0.25, 1.0, 1.75):
        P.box('door_ledge', (0.03, dw - 0.08, 0.12), (dx + dt / 2 + 0.015, hy - dw / 2, z), 'paint', bev=0.004)
    for (za, zb) in ((0.31, 0.94), (1.06, 1.69)):
        a = V((dx + dt / 2 + 0.015, hy - 0.08, za))
        b = V((dx + dt / 2 + 0.015, hy - dw + 0.08, zb))
        C.plank(P, 'door_brace', a, b, 0.1, 0.03, 'paint', up=(1, 0, 0), bev=0.003, floor=False)
    for z in (0.3, 1.75):
        P.box('strap', (0.008, 0.42, 0.04), (dx - dt / 2 - 0.004, hy - 0.2, z), 'trim', bev=0.002)
    P.cyl('latch', 0.018, 0.05, loc=(dx - dt / 2 - 0.025, hy - dw + 0.1, 1.05), material='trim', axis='X', segs=8)
    P.box('latch_bar', (0.012, 0.16, 0.02), (dx + dt / 2 + 0.03, hy - dw + 0.12, 1.08), 'trim', bev=0.002)
    P.torus('ring', 0.035, 0.006, loc=(dx - dt / 2 - 0.05, hy - dw + 0.1, 1.01), material='trim', axis='X', segs=12, rsegs=4)
    P.mover('DOOR', P.statics[since:], (hx, hy, 0.0))
    card.door('DOOR', (hx, hy), dw, dt, 95.0, dh, (0.0, -1.0), +1, secs=1.0)
    # ---------------------------------------------------------------------------------------- where things stand
    card.spot('table', -1.15, 1.95, 0.0, -90)
    card.spot('chair_a', -1.85, 1.85, 0.0, 0)
    card.spot('chair_b', -0.45, 1.85, 0.0, 180)
    card.spot('sofa', -0.45, -1.35, 0.0, 180)
    card.spot('bookshelf', 2.3, -2.3, 0.0, 90)
    card.spot('fridge', 2.75, -1.3, 0.0, 180)
    card.spot('kitchen', 2.78, 0.55, 0.0, 180)
    card.spot('wallcab', 2.93, 0.55, 1.5, 180)
    card.spot('worktop_a', 2.78, 0.95, 0.9, 180)
    card.spot('worktop_b', 2.8, 0.62, 0.9, 200)
    card.spot('worktop_c', 2.82, 1.17, 0.9, 170)
    card.spot('worktop_d', 2.76, 0.18, 0.9, 180)
    card.spot('worktop_e', 2.86, -0.08, 0.9, 160)
    card.spot('table_c', -0.74, 1.9, 0.76, 60)
    card.spot('table_a', -1.0, 2.05, 0.76, -100)
    card.spot('table_b', -1.38, 1.85, 0.76, 30)
    # (on the bookshelf: its second shelf's free end, its top; on the fridge's round top)
    card.spot('shelf_a', 2.05, -2.28, 0.46, 90)
    card.spot('top_a', 2.12, -2.3, 1.54, 80)
    card.spot('top_b', 2.47, -2.33, 1.54, 105)
    card.spot('fridge_top', 2.8, -1.36, 1.37, 170)
    card.spot('nook_seat', 1.25, NY + 0.33, 0.5, 90)
    # (ND4: a tape at one end of the window seat, a picture frame standing at the other)
    card.spot('nook_b', 0.55, NY + 0.3, 0.5, 80)
    card.spot('nook_c', 1.62, NY + 0.22, 0.5, 90)
    card.spot('sill_front', -1.1, BY - T - 0.06, 0.92, -90)
    card.spot('floor_a', 0.9, 0.6, 0.0, 30)
    card.spot('floor_b', 1.9, 1.75, 0.0, 120)
    card.spot('floor_c', -1.55, -0.35, 0.0, 200)
    card.spot('floor_d', 1.4, -1.85, 0.0, 75)
    card.spot('porch_a', -3.85, -2.1, PZ, 15)
    card.spot('porch_b', -4.05, 1.85, PZ, -60)
    card.spot('porch_c', -3.3, -2.25, PZ, 110)
    card.spot('ground_a', 3.75, 3.7, GROUND, 40)
    card.spot('ground_b', -5.3, -1.0, GROUND, 160)
    card.spot('ground_c', -3.55, 3.95, GROUND, -20)
    card.spot('shed', 4.25, 0.05, GROUND, 180)
    # ---------------------------------------------------------------------------------------- done
    N.finish_bms(P, B)
    P.views = [('a', -130, 16), ('b', -45, 20), ('c', 130, 22)]
    size = (9.4, 7.2, roof_z(0.0) + 0.65 - GROUND)
    card.extra['plinth'] = -GROUND
    return card, size, {'DOOR': dict(move='hinge', axis='y', open=95.0)}


TABLE = {'cabin': cabin}


def main(args):
    N.run(TABLE, args)
