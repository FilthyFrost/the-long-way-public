"""
The big works hall (docs/ND/PLAN.md, ND6): a prefab place of Nomad Drive's Factory-01 (26.63 x 23.34 m, 15.15 m high;
a hall of 18.28 x 11.56 m, its floor at a loading dock's height, 1.02 m, five steps up to it; three flights of
nineteen steps of steel, 0.21 m risers on 0.31 m treads, up to galleries at 4.92 and 8.80 and to its roof at 12.72; a
mezzanine at 7.04; two rooms off its floor; a housing over the stair's head on the roof to 15.12, its door 0.4 s; the
roof's fan of 5.15 x 5.29 m turning 20 degrees a second; an upright tank, a roof vent, five air conditioners, barrels,
pallets, an awning, eight panels of wire fence; two lamps on its walls lit from seven in the evening) in our own design:

    blender -b --factory-startup --python tools/blender/build.py -- nd/factory1 [factory1] [--norender] [--noao] [--toon]

A tall hall of painted block on a dark plinth, high windows along it, its parapet capped; the dock of concrete along
its front with its rubber buffers, the big shutter down behind it, the door by its steps under an awning; inside, the
stair of steel in its back corner, the galleries along its walls, a crane's runway and its bridge over the floor,
machines and pallets; the storeroom and the office under the mezzanine. Its frame and its card: nd/_nd.py; its
parts: nd/_props.py.
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
from nd import station as S

T = 0.35
X0, X1, Y0, Y1 = -9.14, 9.14, -8.4, 3.16
XI0, XI1, YI0, YI1 = X0 + T, X1 - T, Y0 + T, Y1 - T
FL, ROOF, TOP, HOUSE = 1.02, 12.72, 13.3, 15.12
G1, MEZ, G2 = 4.92, 7.04, 8.80
SA, SB = 1.5, 1.5 + 19 * 0.31                    # the flights' west and east ends
DOOR = (5.8, 6.94)
SHUT = (-4.8, -0.8)
DOCK = (-6.0, 7.4, Y1, 5.6)
HX0, HY1 = 1.2, -5.4                              # the housing over the stair's head: its west end, its north side
ROOF_DOOR = (7.5, 8.64)
FAN = (-3.5, -2.5)


def hall(P, B, card):
    holes = {
        'n': [(DOOR[0], DOOR[1], FL, FL + 2.15, 'door'), (SHUT[0], SHUT[1], FL, FL + 4.0, 'hole')],
        's': [], 'e': [], 'w': [(-2.0, -0.6, FL + 1.0, FL + 2.0, 'window'), (-7.0, -5.6, FL + 1.0, FL + 2.0, 'window')],
    }
    for (a, b) in ((-8.0, -6.0), (-3.6, -1.6), (1.0, 3.0), (6.0, 8.0)):
        holes['n'].append((a, b, 7.6, 9.2, 'window'))
        holes['s'].append((a, b, 7.6, 9.2, 'window'))
    for (a, b) in ((1.6, -0.4), (-3.4, -5.4)):
        holes['e'].append((a, b, 7.6, 9.2, 'window'))
    faces = Pr.block_walls(B, card, X0, X1, Y0, Y1, -0.15, TOP, T, holes, outer='paint', inner='ceramic', floor_at=FL)
    n = faces['n']
    Pr.roller_shutter(P, B, n, SHUT[0] - X0, SHUT[1] - X0, FL, FL + 4.0, FL)
    card.box(SHUT[0], SHUT[1], Y1 - T, Y1, -0.3, TOP)
    # its floor: a slab at the dock's height on its foundation; its roof's, over the stair's last flight a hole
    Pr.slab(B, card, XI0, XI1, YI0, YI1, FL, th=FL + 0.15)
    Pr.slab(B, card, XI0, XI1, YI0, YI1, ROOF, th=0.3, top='rubber', under='ceramic', holes=[(SA, SB, YI0, YI0 + 1.1)])
    # bands along it at the galleries' heights
    for z in (G1, G2):
        for (f, L) in ((n, n.L), (faces['s'], faces['s'].L)):
            face_box(B['trim'], f, -0.03, L + 0.03, 0.0, 0.05, z - 0.1, z + 0.04)


def dock(P, B, card):
    """the dock along its front: concrete at the floor's height, rubber buffers on its face, the five steps at its east
    end; the awning over the door; the lamps over the door and the shutter"""
    x0, x1, y0, y1 = DOCK
    N.bm_box(B['ceramic'], ((x0 + x1) / 2, (y0 + y1) / 2, (FL - 0.15) / 2), (x1 - x0, y1 - y0, FL + 0.15))
    N.bm_box(B['trim'], ((x0 + x1) / 2, y1 - 0.04, FL - 0.03), (x1 - x0 + 0.02, 0.1, 0.08))
    card.box(x0, x1, y0, y1, -0.3, FL, floor=True)
    for k in range(6):
        x = x0 + 0.8 + k * 2.2
        if x > x1 - 0.6:
            break
        N.bm_box(B['rubber'], (x, y1 + 0.06, FL - 0.35), (0.3, 0.12, 0.45))
    # the steps: four of concrete down from its east end, the fifth the dock's own edge
    for k in range(1, 5):
        a = x1 + 0.31 * (5 - k - 1)
        N.bm_box(B['ceramic'], (a + 0.155, (y0 + y1 - 0.3) / 2, (0.204 * k - 0.15) / 2), (0.31, y1 - y0 - 0.3, 0.204 * k + 0.15))
        card.box(a, a + 0.31, y0, y1 - 0.3, -0.3, 0.204 * k, floor=True)
    Pr.railing(P, card, [(x1 + 1.24, y1 - 0.3), (x1, y1 - 0.3), (x1, y1)], FL - 0.2, h=1.0, name='dock_rail')
    # the awning over the door
    ax0, ax1 = DOOR[0] - 0.8, DOOR[1] + 0.8
    N.bm_box(B['paint_b'], ((ax0 + ax1) / 2, Y1 + 0.75, FL + 2.75), (ax1 - ax0, 1.5, 0.06))
    N.bm_box(B['trim'], ((ax0 + ax1) / 2, Y1 + 1.47, FL + 2.69), (ax1 - ax0, 0.06, 0.14))
    for x in (ax0 + 0.05, ax1 - 0.05):
        C.post(P, 'awning_tie', (x, Y1 + 1.45, FL + 2.75), (x, Y1, FL + 3.6), 0.012, 'steel', segs=4, bev=None)
    card.box(ax0, ax1, Y1, Y1 + 1.5, FL + 2.6, FL + 2.78, floor=True)
    for (name, x, z) in (('door_lamp', (DOOR[0] + DOOR[1]) / 2, FL + 2.45), ('dock_lamp', (SHUT[0] + SHUT[1]) / 2, FL + 4.6)):
        P.box(f'{name}_back', (0.24, 0.05, 0.3), (x, Y1 + 0.025, z), 'trim', bev=0.006)
        S.lit_panel(P, f'{name}_glass', name, (0.16, 0.1, 0.2), (x, Y1 + 0.1, z))
        card.lamp(name, x, Y1 + 0.15, z - 0.05, 9.0, hours=(19, 6), pool=FL)


def door(P, card):
    """its door at the dock: metal, opening in, 0.4 s"""
    hx, hy = DOOR[0] + 0.02, Y1 - T / 2
    dw, dh = DOOR[1] - DOOR[0] - 0.04, 2.13
    since = len(P.statics)
    P.box('door', (dw, 0.05, dh), (hx + dw / 2, hy, FL + dh / 2), 'paint_b', bev=0.006)
    P.box('door_kick', (dw - 0.1, 0.06, 0.25), (hx + dw / 2, hy, FL + 0.16), 'alu', bev=None)
    for s in (0.05, -0.05):
        P.box('door_handle', (0.14, 0.04, 0.03), (hx + dw - 0.12, hy + s, FL + 1.05), 'steel', bev=0.004)
    P.mover('DOOR_main', P.statics[since:], (hx, hy, FL))
    card.door('DOOR_main', (hx, hy), dw, 0.05, 90.0, FL + dh, (1.0, 0.0), -1, pry='none', z0=FL, secs=0.4, mat='metal')


def stair(P, B, card):
    """three flights of nineteen up the back corner: along the back wall to the landing at the east wall, back along
    beside the first to the second gallery's end, along the back wall again up through the roof into its housing"""
    ya, yb = YI0 + 0.55, YI0 + 1.75
    Pr.steel_stair(P, B, card, (SA, ya), (SB, ya), FL, G1, w=1.1, n=19, rails=(True, False), name='stair')
    Pr.landing(P, B, card, SB, XI1, YI0, YI0 + 2.3, G1, rails='', legs=True)
    Pr.steel_stair(P, B, card, (SB, yb), (SA, yb), G1, G2, w=1.1, n=19, rails=(True, True), name='stair')
    Pr.landing(P, B, card, 0.1, SA, YI0, YI0 + 2.3, G2, rails='n', legs=False)
    Pr.railing(P, card, [(0.1, YI0 + 1.1), (0.1, YI0 + 2.3)], G2, h=1.0, name='g2_rail')
    Pr.steel_stair(P, B, card, (SA, ya), (SB, ya), G2, ROOF, w=1.1, n=19, rails=(True, False), name='stair')
    # the first gallery along the east wall from the landing to the front; the second along the back wall to the west
    Pr.landing(P, B, card, XI1 - 1.1, XI1, YI0 + 2.3, YI1, G1, rails='w', legs=False)
    Pr.landing(P, B, card, XI0, 0.1, YI0, YI0 + 1.1, G2, rails='', legs=False)
    Pr.railing(P, card, [(0.1, YI0 + 1.1), (XI0, YI0 + 1.1)], G2, h=1.0, gap=(0, 0.1 + 6.1, 0.1 + 7.2), name='g2_rail')
    for x in (-8.0, -4.0, 0.0):
        C.post(P, 'gallery_hanger', (x, YI0 + 1.05, G2), (x, YI0 + 1.05, ROOF - 0.3), 0.02, 'paint_b', segs=5, bev=None)
    for y in (-3.0, 0.5):
        C.post(P, 'gallery_hanger', (XI1 - 1.05, y, G1), (XI1 - 1.05, y, ROOF - 0.3), 0.02, 'paint_b', segs=5, bev=None)
    # down from the second gallery to the mezzanine: nine treads; the mezzanine on its legs, its rails
    Pr.steel_stair(P, B, card, (-6.65, YI0 + 1.1 + 9 * 0.31), (-6.65, YI0 + 1.1), MEZ, G2, w=1.1, n=9, rails=(True, True), name='mez_stair')
    my0 = YI0 + 1.1 + 9 * 0.31
    Pr.landing(P, B, card, XI0, -4.2, my0, 1.6, MEZ, rails='en', legs=True)
    # (its south edge from its east corner: the stair down from the gallery arrives between x -6.1 and -7.2)
    Pr.railing(P, card, [(-4.2, my0), (XI0, my0)], MEZ, h=1.0, gap=(0, 1.9, 3.0), name='mez_rail')


def rooms(P, B, card):
    """the storeroom and the office off the floor under the mezzanine: block partitions with their doorways, their
    ceilings; the storeroom's two shelving units, the office's table and its chairs, a filing cabinet"""
    top = FL + 3.2
    t = 0.15
    # (x of the partitions' east faces; y of the rooms' sides)
    ex = -5.2
    walls = [
        ((ex, YI0), (ex, -4.6), [(-6.8, -5.8)]),        # the storeroom's east side, its doorway
        ((XI0, -4.6), (ex, -4.6), []),                  # its north side
        ((XI0, -3.2), (ex, -3.2), []),                  # the office's south side
        ((ex, -3.2), (ex, 1.4), [(-1.4, -0.4)]),        # its east side, its doorway
        ((XI0, 1.4), (ex, 1.4), []),                    # its north side
    ]
    for ((ax, ay), (bx, by), gaps) in walls:
        f = Face((ax, ay), (bx, by), (1, 0) if ax == bx else (0, 1), t)
        along_y = ax == bx
        hs = []
        for (g0, g1) in gaps:
            s0, s1 = (g0 - ay, g1 - ay) if along_y else (g0 - ax, g1 - ax)
            hs.append((min(s0, s1), max(s0, s1), FL, FL + 2.1))
        S.solid_wall(B, f, FL, top, hs, 'ceramic', inner='ceramic')
        for h in hs:
            S.opening_trim(B, f, *h, mat='paint_b')
        # (the card: the partition's runs, a doorway left in it)
        cuts = sorted((h[0], h[1]) for h in hs)
        at = 0.0
        runs = []
        for (a, b) in cuts:
            runs.append((at, a))
            at = b
        runs.append((at, f.L))
        for (a, b) in runs:
            p0, p1 = f.p(a, -t, 0.0), f.p(b, 0.0, 0.0)
            card.box(min(p0.x, p1.x), max(p0.x, p1.x), min(p0.y, p1.y), max(p0.y, p1.y), FL - 0.1, top)
    for (y0, y1) in ((YI0, -4.6), (-3.2, 1.4)):
        N.bm_box(B['ceramic'], ((XI0 + ex) / 2, (y0 + y1) / 2, top + 0.06), (ex - XI0 + 0.15, y1 - y0 + 0.15, 0.12))
    # the storeroom's shelving, the office's table, chairs, cabinet
    Pr.shelving(P, B, card, 'st0', -7.9, -7.6, yaw=0.0, z=FL, per=2, k=0)
    Pr.shelving(P, B, card, 'st1', -8.4, -5.6, yaw=90.0, z=FL, per=2, k=3)
    tx, ty = -7.0, -0.9
    N.bm_box(B['wood'], (tx, ty, FL + 0.74), (1.8, 0.9, 0.04))
    for (dx, dy) in ((-0.82, -0.38), (0.82, -0.38), (-0.82, 0.38), (0.82, 0.38)):
        N.bm_box(B['paint_b'], (tx + dx, ty + dy, FL + 0.36), (0.05, 0.05, 0.72))
    card.box(tx - 0.9, tx + 0.9, ty - 0.45, ty + 0.45, FL - 0.1, FL + 0.76, floor=True)
    for k, (x, y) in enumerate(((tx - 0.55, ty - 0.2), (tx, ty + 0.2), (tx + 0.55, ty - 0.15), (tx - 0.3, ty + 0.25), (tx + 0.35, ty + 0.25))):
        card.spot(f'table_{"abcde"[k]}', x, y, FL + 0.76, 90 + 40 * C.jit(k, 9.0))
    for (x, y, f) in ((tx - 0.4, ty - 0.85, 90), (tx + 0.5, ty + 0.85, -90)):
        a = math.radians(f)
        R = Matrix.Rotation(a, 3, 'Z')
        N.bm_box(B['wood'], (x, y, FL + 0.45), (0.42, 0.42, 0.04), R)
        N.bm_box(B['wood'], V((x, y, FL + 0.7)) + R @ V((-0.2, 0.0, 0.0)), (0.04, 0.42, 0.5), R)
        for (dx, dy) in ((-0.18, -0.18), (0.18, -0.18), (-0.18, 0.18), (0.18, 0.18)):
            q = V((x, y, 0.0)) + R @ V((dx, dy, 0.0))
            N.bm_box(B['wood'], (q.x, q.y, FL + 0.22), (0.035, 0.035, 0.44))
        card.post(x, y, 0.25, FL - 0.1, FL + 0.95)
    N.bm_box(B['alu'], (XI0 + 0.3, 0.6, FL + 0.65), (0.5, 0.6, 1.3))
    for k in range(3):
        N.bm_box(B['trim'], (XI0 + 0.555, 0.6, FL + 0.3 + 0.4 * k), (0.012, 0.2, 0.03))
    card.box(XI0, XI0 + 0.55, 0.3, 0.9, FL - 0.1, FL + 1.3)


def crane(P, B, card):
    """the crane's runway along the hall's long walls, its bridge across, the hoist and its hook"""
    zr = 10.4
    for y in (YI0 + 0.25, YI1 - 0.25):
        N.bm_box(B['paint_b'], (0.0, y, zr), (XI1 - XI0, 0.3, 0.4))
        for x in (-7.5, -3.0, 1.5, 6.0):
            N.bm_box(B['paint_b'], (x, y + (0.2 if y < 0 else -0.2), zr - 0.5), (0.2, 0.3, 0.6))
    bx = 3.4
    N.bm_box(B['paint_b'], (bx, (YI0 + YI1) / 2, zr + 0.45), (0.5, YI1 - YI0 - 0.3, 0.5))
    for y in (YI0 + 0.25, YI1 - 0.25):
        N.bm_box(B['trim'], (bx, y, zr + 0.3), (0.9, 0.36, 0.3))
    hy = -1.6
    N.bm_box(B['trim'], (bx, hy, zr + 0.05), (0.7, 0.6, 0.5))
    C.post(P, 'hoist_chain', (bx, hy, zr - 0.2), (bx, hy, 4.2), 0.012, 'steel', segs=4, bev=None)
    bm = bmesh.new()
    K.bm_cyl(bm, 0.12, 0.25, segs=10, matrix=Matrix.Translation((bx, hy, 4.1)))
    P.mesh('hoist_block', bm, 'paint', sharp=40.0)
    P.torus('hook', 0.09, 0.025, loc=(bx, hy, 3.85), material='steel', axis=(1, 0, 0), segs=12, rsegs=4, arc=math.pi * 1.4)


def machines(P, B, card):
    """three machines on the floor, pallets with their loads, drums"""
    for k, (x, y, w, d, h, f) in enumerate(((-2.4, 0.2, 2.4, 1.4, 2.0, 0), (1.4, -0.4, 1.6, 1.2, 1.5, 90), (5.0, -2.6, 2.0, 1.0, 1.7, 0))):
        N.bm_box(B['paint_b'], (x, y, FL + h / 2), (w, d, h))
        N.bm_box(B['trim'], (x, y, FL + 0.06), (w + 0.1, d + 0.1, 0.12))
        N.bm_box(B['alu'], (x + w / 2 - 0.3, y - d / 2 - 0.01, FL + h * 0.65), (0.4, 0.02, 0.3))
        P.cyl('machine_wheel', 0.22, 0.05, (x - w / 2 + 0.4, y - d / 2 - 0.03, FL + h * 0.7), 'trim', axis=(0, 1, 0), segs=14)
        card.box(x - w / 2 - 0.05, x + w / 2 + 0.05, y - d / 2 - 0.05, y + d / 2 + 0.05, FL - 0.1, FL + h)
    for k, (x, y, a) in enumerate(((-6.0, 2.15, 5), (6.6, 1.4, -8), (-3.0, -6.4, 12))):
        R = Matrix.Rotation(math.radians(a), 3, 'Z')
        for j in range(5):
            N.bm_box(B['wood'], V((x, y, FL + 0.13)) + R @ V((0.0, -0.48 + 0.24 * j, 0.0)), (1.2, 0.1, 0.022), R)
        for j in (-0.5, 0.0, 0.5):
            N.bm_box(B['wood'], V((x, y, FL + 0.065)) + R @ V((j, 0.0, 0.0)), (0.1, 1.0, 0.1), R)
        N.bm_box(B['fabric'], (x, y, FL + 0.6), (1.1, 0.95, 0.9), R)
        card.box(x - 0.65, x + 0.65, y - 0.6, y + 0.6, FL - 0.1, FL + 1.05, floor=True)
        card.spot(f'pallet_{k}', x, y, FL + 1.05, a + 90)


def roof(P, B, card):
    """on the roof: the housing over the stair's head with its door, the fan turning in its frame, five air
    conditioners, a vent; the parapet's coping is the walls'"""
    walls = Pr.block_walls(B, card, HX0, X1, Y0, HY1, ROOF, HOUSE, 0.25,
                           {'n': [(ROOF_DOOR[0], ROOF_DOOR[1], ROOF, ROOF + 2.15, 'door')], 's': [], 'e': [], 'w': []},
                           outer='paint', inner='ceramic', band=0.0, coping=True, floor_at=ROOF)
    Pr.slab(B, card, HX0, X1, Y0, HY1, HOUSE, th=0.2, top='rubber', under='ceramic', floor=False)
    hx, hy = ROOF_DOOR[0] + 0.02, HY1 - 0.125
    dw, dh = ROOF_DOOR[1] - ROOF_DOOR[0] - 0.04, 2.13
    since = len(P.statics)
    P.box('roof_door', (dw, 0.05, dh), (hx + dw / 2, hy, ROOF + dh / 2), 'paint_b', bev=0.006)
    for s in (0.05, -0.05):
        P.box('roof_door_handle', (0.14, 0.04, 0.03), (hx + dw - 0.12, hy + s, ROOF + 1.05), 'steel', bev=0.004)
    P.mover('DOOR_roof', P.statics[since:], (hx, hy, ROOF))
    card.door('DOOR_roof', (hx, hy), dw, 0.05, 90.0, ROOF + dh, (1.0, 0.0), 1, pry='none', z0=ROOF, secs=0.4, mat='metal')
    # the fan: its frame of 5.15 x 5.29 m on legs over the roof, its grille, its blades turning (N_spin_fan)
    fx, fy = FAN
    fw, fd = 5.15, 5.29
    for (dx, dy) in ((-fw / 2, -fd / 2), (fw / 2, -fd / 2), (-fw / 2, fd / 2), (fw / 2, fd / 2)):
        N.bm_box(B['trim'], (fx + dx * 0.96, fy + dy * 0.96, ROOF + 0.55), (0.12, 0.12, 1.1))
    for (cx, cy, sx, sy) in ((fx, fy - fd / 2 + 0.06, fw, 0.12), (fx, fy + fd / 2 - 0.06, fw, 0.12), (fx - fw / 2 + 0.06, fy, 0.12, fd), (fx + fw / 2 - 0.06, fy, 0.12, fd)):
        N.bm_box(B['alu'], (cx, cy, ROOF + 0.68), (sx, sy, 0.8))
    for k in range(9):
        N.bm_box(B['trim'], (fx - fw / 2 + 0.3 + k * (fw - 0.6) / 8, fy, ROOF + 1.1), (0.025, fd - 0.2, 0.03))
    P.cyl('fan_hub', 0.3, 0.3, (fx, fy, ROOF + 0.62), 'trim', segs=14)
    since = len(P.statics)
    for k in range(6):
        a = k * math.tau / 6
        c = (fx + math.cos(a) * 1.25, fy + math.sin(a) * 1.25, ROOF + 0.66)
        P.box('fan_blade', (2.0, 0.42, 0.03), c, 'alu', rot=(14, 0, math.degrees(a)), bev=None)
    P.mover('N_spin_fan', P.statics[since:], (fx, fy, ROOF + 0.66))
    card.spin('fan', 'y', deg_s=20.0)
    card.box(fx - fw / 2, fx + fw / 2, fy - fd / 2, fy + fd / 2, ROOF - 0.1, ROOF + 1.12)
    # air conditioners, a vent
    for k, (x, y) in enumerate(((-7.6, 1.6), (-5.4, 1.6), (-0.4, 1.6), (2.0, 1.6), (4.6, 1.2))):
        N.bm_box(B['alu'], (x, y, ROOF + 0.45), (1.0, 0.8, 0.9))
        P.cyl('ac_fan', 0.3, 0.03, (x, y, ROOF + 0.91), 'trim', segs=14)
        card.box(x - 0.5, x + 0.5, y - 0.4, y + 0.4, ROOF - 0.1, ROOF + 0.9)
    C.post(P, 'roof_vent', (-7.6, -6.4, ROOF), (-7.6, -6.4, ROOF + 1.1), 0.18, 'alu', segs=12)
    P.cyl('roof_vent_cap', 0.34, 0.25, (-7.6, -6.4, ROOF + 1.22), 'alu', segs=12, r2=0.06)
    card.post(-7.6, -6.4, 0.22, ROOF - 0.1, ROOF + 1.3)


def yard(P, B, card):
    """about it: the upright tank, a fenced yard at its west end with drums and pallets in it"""
    Pr.tank(P, B, card, 11.2, -4.6, 'upright', mat='paint_b')
    pts = [(X0, 6.2), (-12.9, 6.2), (-12.9, -11.2), (6.0, -11.2), (6.0, Y0)]
    Pr.fence(P, B, card, pts, h=2.4, mat='alu', strands=6, barbed=False, gap=(1, 7.0, 11.4), post_every=5.29)
    for k, (x, y, fallen) in enumerate(((-11.6, -9.6, False), (-11.0, -9.9, False), (-11.9, -8.9, False), (-10.4, -2.4, True), (-11.8, 2.0, False), (-11.2, 2.4, False))):
        if fallen:
            P.cyl('drum', 0.29, 0.88, (x, y, 0.29), 'rust', axis=(0.3, 1.0, 0), segs=16)
            card.solids.append(dict(u=N.r4(x), v=N.r4(-y), hx=0.44, hz=0.3, y0=-0.3, y1=0.58, turn=N.r4(-math.atan2(1.0, 0.3))))
            continue
        P.cyl('drum', 0.29, 0.88, (x, y, 0.44), 'paint' if k % 2 else 'paint_b', segs=16)
        for z in (0.29, 0.59):
            P.torus('drum_hoop', 0.293, 0.012, loc=(x, y, z), material='trim', segs=16, rsegs=4)
        card.post(x, y, 0.3, -0.3, 0.88)
    for k, (x, y) in enumerate(((-11.4, -5.8), (2.4, -10.0))):
        for j in range(4):
            for i in range(5):
                N.bm_box(B['wood'], (x, y - 0.48 + 0.24 * i, 0.13 + 0.145 * j), (1.2, 0.1, 0.022))
            for i in (-0.5, 0.0, 0.5):
                N.bm_box(B['wood'], (x + i, y, 0.065 + 0.145 * j), (0.1, 1.0, 0.1))
        card.box(x - 0.6, x + 0.6, y - 0.5, y + 0.5, -0.3, 0.58)
        card.spot(f'yard_pallet_{k}', x, y, 0.58, 90 * k)


def bigworks(P):
    card = N.Card('factory1')
    B = N.new_set()
    hall(P, B, card)
    dock(P, B, card)
    door(P, card)
    stair(P, B, card)
    rooms(P, B, card)
    crane(P, B, card)
    machines(P, B, card)
    roof(P, B, card)
    yard(P, B, card)
    # on its floor among the machines; on the ground about it
    for k, (x, y) in enumerate(((-4.0, 2.2), (-1.0, 2.3), (2.2, 2.2), (4.6, 2.0), (7.6, 2.2), (-4.4, -1.8), (-0.2, -2.0), (3.0, -2.2), (7.0, -4.6),
                                (-3.8, -4.6), (-0.6, -5.0), (0.8, -7.2), (-4.4, -7.6), (6.2, 0.2), (-4.6, 0.4), (0.2, 1.0), (3.6, 1.2), (-2.0, -3.4),
                                (2.2, -4.2), (5.0, -0.4), (-1.6, -6.4), (7.8, -1.0), (-4.2, -3.0), (4.0, 2.4), (1.4, -5.6), (-2.8, 1.8),
                                (6.8, -2.6), (-0.8, 0.0), (2.6, 0.4), (4.8, -4.8))):
        card.spot(f'f_{k:02d}', x, y, FL, 31 * k)
    for k, (x, y) in enumerate(((-12.0, 9.0), (-8.0, 8.4), (-2.0, 7.6), (3.0, 8.0), (8.0, 7.2), (11.8, 9.6), (12.4, 4.0), (12.6, -0.6), (12.8, -8.0),
                                (10.0, -10.4), (8.0, -9.6), (-6.0, -9.8), (-8.4, -10.6), (-12.2, -4.2), (-12.4, 0.0), (-10.0, 4.6), (-6.0, 6.6),
                                (0.6, 6.6), (5.6, 6.8), (9.8, 2.0), (10.4, 5.6), (-11.0, -6.6), (-1.0, -10.0), (4.2, -9.0))):
        card.spot(f'g_{k:02d}', x, y, 0.0, 47 * k)
    N.finish_bms(P, B)
    P.views = [('a', -55, 26), ('b', 35, 32), ('c', 150, 26)]
    card.extra['plinth'] = 0.0
    movers = {d['name']: dict(move='hinge', axis='y', open=float(d['open'])) for d in card.doors}
    movers['N_spin_fan'] = dict(move='spin', axis='y')
    return card, (26.63, 23.34, 15.15), movers


TABLE = {'factory1': bigworks}


def main(args):
    N.run(TABLE, args)
