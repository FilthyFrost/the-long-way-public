"""
The radio station (docs/ND/PLAN.md, ND6): a prefab place of Nomad Drive's RadioStation (16.53 x 18.08 m, 30.54 m high;
a block building of 10.44 x 7.87 m, its hall's roof at 4.66 m behind a parapet to 4.91, its annex's at 3.04; a steel
stair of 26 treads up its side to 4.93 m; a lattice mast of 32.49 m that is not climbed, two big dishes and six small,
its red light at 30.96 m seen from 100 m; an L of desk 6.75 x 2.20 m, its top at 0.83; seventeen lockers along the
hall's back wall, eleven of one door of 0.32 x 1.65 m and six of two of 0.32 x 0.83, each locked one time in four,
opening 120 degrees in 0.4 s; an electric box of two doors of 0.20 x 0.56 m, stuck one time in four; its metal door,
0.4 s; a lamp over its door outside and two fluorescent tubes in its hall, lit from seven in the evening to six in
the morning; cameras, an awning over its door, a fence round it) in our own design:

    blender -b --factory-startup --python tools/blender/build.py -- nd/radiostation [radiostation] [--norender] [--noao] [--toon]

The building of painted block on a dark plinth, its parapet capped; inside, the hall plastered, the radios, the
monitors and the microphone on the desk, two racks of sets by the doorway to the annex where the electric box is; the
mast in the station's second colour on its concrete pad, its dishes of aluminium; a wire fence with barbed wire leaning
out over it, its gate's opening to the road. Its frame and its card: nd/_nd.py; the stair, the fence, the mast: nd/_props.py.
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

T = 0.25
X0, X1, Y0, Y1 = -6.9, 1.1, -2.6, 5.27          # the hall
AX1, AY1 = 3.54, 2.9                              # the annex, east of it
ROOF, PARA, SLAB = 4.66, 4.91, 0.3
AROOF, ALIP = 3.04, 3.14
SX, SY0, SY1, STOP = -7.4, 5.5, -1.52, 4.93       # the stair up the west wall: its middle, its foot, its head
MAST = (5.4, -5.6)
MAST_H, MAST_TOP = 30.6, 32.49
BEACON_Z = 30.96
DOOR = (1.75, 2.75)                               # the annex's door (x), in its front


def jit(k, a=0.0):
    return C.jit(k, a)


def walls(P, B, card):
    """the block walls: the hall's to its parapet, the annex's to its lip; their openings, the plinth's band, the coping"""
    hall_h, ann_h = PARA, ALIP
    front = Face((X0, Y1), (X1, Y1), (0, 1), T)
    west = Face((X0, Y0 + T), (X0, Y1 - T), (-1, 0), T)
    back_h = Face((X1, Y0), (X0, Y0), (0, -1), T)
    east = Face((X1, Y0 + T), (X1, Y1 - T), (1, 0), T)
    a_front = Face((X1, AY1), (AX1, AY1), (0, 1), T)
    a_east = Face((AX1, AY1 - T), (AX1, Y0 + T), (1, 0), T)
    back_a = Face((AX1, Y0), (X1, Y0), (0, -1), T)
    win = [(1.2, 2.6, 1.15, 2.35), (3.4, 4.8, 1.15, 2.35), (5.6, 7.0, 1.15, 2.35)]
    west_win = [(2.4, 3.6, 1.3, 2.3)]
    hall_door = (-1.4 - (Y0 + T), -0.4 - (Y0 + T), 0.0, 2.2)
    a_door = (DOOR[0] - X1, DOOR[1] - X1, 0.0, 2.15)
    a_win = [(0.6, 1.4, 1.5, 2.1)]
    for (f, z1, holes) in ((front, hall_h, win), (west, hall_h, west_win), (back_h, hall_h, []), (east, hall_h, [hall_door]),
                           (a_front, ann_h, [a_door]), (a_east, ann_h, a_win), (back_a, ann_h, [])):
        S.solid_wall(B, f, -0.15, z1, holes, 'paint', inner='ceramic')
        doors = [(h[0], h[1]) for h in holes if h[2] < 0.05]
        S.band(B, 'trim', f, 0.0, 0.03, -0.15, 0.32, gaps=[(a - 0.07, b + 0.07) for (a, b) in doors])
        S.band(B, 'trim', f, -T - 0.03, 0.05, z1 - 0.06, z1 + 0.03)
        for h in holes:
            if h[2] < 0.05:
                S.opening_trim(B, f, *h, mat='paint_b')
            else:
                N.window(B, f, *h, rows=1, cols=2)
    # the card: its walls (a door's opening left in them), the parapet over the stair's head a floor to step over
    card.box(X0, X1, Y1 - T, Y1, -0.3, PARA)
    card.box(X0, X1, Y0, Y0 + T, -0.3, PARA)
    card.box(X1, AX1, Y0, Y0 + T, -0.3, ALIP)
    card.box(X0, X0 + T, Y0 + T, Y1 - T, -0.3, ROOF)
    card.box(X0, X0 + T, -1.45, Y1 - T, ROOF, PARA)
    card.box(X0, X0 + T, Y0 + T, -1.45, ROOF, PARA, floor=True)
    card.box(X1 - T, X1, Y0 + T, -1.4, -0.3, PARA)
    card.box(X1 - T, X1, -0.4, Y1 - T, -0.3, PARA)
    card.box(X1 - T, X1, -1.4, -0.4, 2.2, PARA)
    card.box(X1, DOOR[0], AY1 - T, AY1, -0.3, ALIP)
    card.box(DOOR[1], AX1, AY1 - T, AY1, -0.3, ALIP)
    card.box(DOOR[0], DOOR[1], AY1 - T, AY1, 2.15, ALIP)
    card.box(AX1 - T, AX1, Y0 + T, AY1 - T, -0.3, ALIP)
    # the floors (concrete) and the roofs: the hall's slab and its felt, the annex's
    N.bm_box(B['ceramic'], ((X0 + X1) / 2, (Y0 + Y1) / 2, -0.02), (X1 - X0 - 2 * T + 0.02, Y1 - Y0 - 2 * T + 0.02, 0.04))
    N.bm_box(B['ceramic'], ((X1 - T + AX1 - T) / 2, (Y0 + AY1) / 2, -0.02), (AX1 - X1, AY1 - Y0 - 2 * T + 0.02, 0.04))
    card.box(X0 + T, X1 - T, Y0 + T, Y1 - T, -0.5, 0.0, floor=True)
    card.box(X1 - T, AX1 - T, Y0 + T, AY1 - T, -0.5, 0.0, floor=True)
    for (x0, x1, y0, y1, top) in ((X0 + T, X1 - T, Y0 + T, Y1 - T, ROOF), (X1, AX1 - T, Y0 + T, AY1 - T, AROOF)):
        N.bm_box(B['ceramic'], ((x0 + x1) / 2, (y0 + y1) / 2, top - SLAB / 2 - 0.01), (x1 - x0 + 0.02, y1 - y0 + 0.02, SLAB - 0.02))
        N.bm_box(B['rubber'], ((x0 + x1) / 2, (y0 + y1) / 2, top - 0.01), (x1 - x0 + 0.02, y1 - y0 + 0.02, 0.02))
        card.box(x0, x1, y0, y1, top - 0.3, top, floor=True)


def roof_things(P, B, card):
    """on the hall's roof: two air conditioners, a hatch, a vent; the conduit to the mast"""
    for k, (x, y) in enumerate(((-2.5, 1.6), (-0.6, -1.2))):
        N.bm_box(B['alu'], (x, y, ROOF + 0.45), (1.0, 0.8, 0.9))
        P.cyl('ac_fan', 0.3, 0.03, (x, y, ROOF + 0.91), 'trim', segs=16)
        for j in range(4):
            N.bm_box(B['trim'], (x, y - 0.3 + 0.2 * j, ROOF + 0.93), (0.62, 0.015, 0.02))
        N.bm_box(B['trim'], (x, y, ROOF + 0.04), (1.1, 0.9, 0.08))
        card.box(x - 0.5, x + 0.5, y - 0.4, y + 0.4, ROOF - 0.1, ROOF + 0.9)
    N.bm_box(B['paint_b'], (-5.6, -1.2, ROOF + 0.12), (0.9, 0.9, 0.24))
    N.bm_box(B['trim'], (-5.6, -1.2, ROOF + 0.26), (1.0, 1.0, 0.05))
    card.box(-6.1, -5.1, -1.7, -0.7, ROOF - 0.1, ROOF + 0.29, floor=True)
    C.post(P, 'roof_vent', (-3.6, -1.9, ROOF), (-3.6, -1.9, ROOF + 0.8), 0.07, 'alu', segs=10)
    P.cyl('vent_cap', 0.13, 0.08, (-3.6, -1.9, ROOF + 0.84), 'alu', segs=10)
    card.post(-3.6, -1.9, 0.1, ROOF - 0.1, ROOF + 0.88)
    for k, (x, y) in enumerate(((-5.8, 4.0), (-3.5, 3.6), (-1.0, 4.2), (-5.0, 0.6), (-2.0, -0.4), (0.3, 1.9), (-4.2, -1.7))):
        card.spot(f'roof_{"abcdefg"[k]}', x, y, ROOF, 90 * k + 30 * jit(k, 1.0))
    for k, (x, y) in enumerate(((2.3, 1.8), (2.0, -0.6), (2.9, -1.8))):
        card.spot(f'roof_{"hij"[k]}', x, y, AROOF, 120 * k)


def stair(P, B, card):
    """the steel stair up the hall's west wall: 26 treads to 4.93 m, its landing at the parapet, rails on its open sides"""
    Pr.steel_stair(P, B, card, (SX, SY0), (SX, SY1), 0.0, STOP, w=0.9, n=26, rails=(False, True), name='stair')
    Pr.landing(P, B, card, SX - 0.45, SX + 0.45, -2.5, SY1, STOP, rails='ws')
    # its brackets to the wall
    for y in (4.0, 1.5, -1.0):
        z = STOP * (SY0 - y) / (SY0 - SY1)
        N.bm_box(B['paint_b'], (X0 - 0.24, y, z - 0.25), (0.48, 0.08, 0.08))


def desk(P, B, card):
    """the L of desk along the front wall and the west, its radios, monitors, microphone; two chairs before it"""
    top = 0.83
    legs = [(-6.5, 0.25, 4.32, 5.02), (-6.65, -5.95, 2.82, 4.32)]
    for (x0, x1, y0, y1) in legs:
        N.bm_box(B['wood'], ((x0 + x1) / 2, (y0 + y1) / 2, top - 0.02), (x1 - x0, y1 - y0, 0.04))
        card.box(x0, x1, y0, y1, -0.3, top, floor=True)
    for (x, y) in ((-6.3, 4.67), (-3.6, 4.67), (-0.9, 4.67), (-6.3, 3.1)):
        N.bm_box(B['paint_b'], (x, y, (top - 0.04) / 2), (0.42, 0.62, top - 0.04))
        for j in range(3):
            N.bm_box(B['trim'], (x, y - 0.315, 0.12 + j * 0.25), (0.3, 0.012, 0.02))
    # the radios: grey sets with their dials, their speaker grilles
    for k, x in enumerate((-5.3, -2.6, 0.0)):
        y = 4.82
        N.bm_box(B['trim'], (x, y, top + 0.14), (0.62, 0.34, 0.28))
        N.bm_box(B['alu'], (x, y - 0.172, top + 0.14), (0.58, 0.006, 0.24))
        for j in range(4):
            P.cyl('radio_knob', 0.022, 0.03, (x - 0.2 + 0.13 * j, y - 0.19, top + 0.07), 'trim', axis=(0, 1, 0), segs=8)
        N.bm_box(B['glass'], (x - 0.1, y - 0.177, top + 0.2), (0.2, 0.004, 0.07))
        C.post(P, 'radio_whip', (x + 0.25, y + 0.1, top + 0.28), (x + 0.25, y + 0.1, top + 0.7), 0.004, 'steel', segs=4, bev=None)
    for k, x in enumerate((-3.9, -1.2)):
        P.box('monitor', (0.5, 0.06, 0.36), (x, 4.9, top + 0.3), 'trim', rot=(0, 0, 4 - 8 * k), bev=0.01)
        P.box('monitor_glass', (0.44, 0.006, 0.3), (x, 4.866, top + 0.3), 'glass', rot=(0, 0, 4 - 8 * k), bev=None)
        C.post(P, 'monitor_foot', (x, 4.92, top), (x, 4.92, top + 0.14), 0.02, 'trim', segs=6)
        P.box('monitor_base', (0.22, 0.16, 0.015), (x, 4.9, top + 0.008), 'trim', bev=0.004)
    # the microphone on its stand, a logbook, the headphones
    C.post(P, 'mic_stand', (-4.5, 4.75, top), (-4.5, 4.62, top + 0.3), 0.008, 'steel', segs=5)
    P.box('mic_base', (0.14, 0.14, 0.02), (-4.5, 4.75, top + 0.01), 'trim', bev=0.004)
    P.cyl('mic', 0.025, 0.1, (-4.5, 4.58, top + 0.33), 'trim', axis=(0, -1, 0.6), segs=8)
    P.box('logbook', (0.3, 0.22, 0.03), (-6.25, 3.6, top + 0.015), 'paint', rot=(0, 0, 12), bev=0.004)
    P.torus('headphones', 0.09, 0.012, loc=(-2.0, 4.85, top + 0.03), material='trim', segs=14, rsegs=4)
    # two chairs: a swivel's seat, its back, its pole and its feet
    for k, (x, y) in enumerate(((-4.3, 3.75), (-1.7, 3.8))):
        a = math.radians(15 - 30 * k)
        R = Matrix.Rotation(a, 3, 'Z')
        N.bm_box(B['fabric'], (x, y, 0.47), (0.46, 0.46, 0.08), R)
        N.bm_box(B['fabric'], V((x, y, 0.82)) + R @ V((0.0, -0.22, 0.0)), (0.44, 0.06, 0.5), R)
        C.post(P, 'chair_pole', (x, y, 0.1), (x, y, 0.43), 0.025, 'steel', segs=6)
        for j in range(5):
            b = a + j * TAU / 5
            C.post(P, 'chair_foot', (x, y, 0.08), (x + 0.3 * math.cos(b), y + 0.3 * math.sin(b), 0.04), 0.015, 'trim', segs=4)
        card.post(x, y, 0.3, -0.3, 1.05)
    for k, x in enumerate((-5.9, -4.8, -3.4, -2.3, -1.4, -0.4, 0.15)):
        card.spot(f'desk_{"abcdefg"[k]}', x, 4.47, top, 180 + 25 * jit(k, 2.0))
    for k, y in enumerate((3.05, 3.65, 4.1)):
        card.spot(f'desk_{"hij"[k]}', -6.25, y, top, 270 + 30 * jit(k, 3.0))


def racks(P, B, card):
    """two racks of sets by the doorway to the annex: their cases, their panels, their lit dials"""
    for k, (y0, y1) in enumerate(((0.3, 1.1), (1.3, 2.1))):
        x0, x1 = 0.25, X1 - T
        N.bm_box(B['trim'], ((x0 + x1) / 2, (y0 + y1) / 2, 1.0), (x1 - x0, y1 - y0, 2.0))
        for j in range(6):
            z = 0.25 + j * 0.3
            N.bm_box(B['alu'], (x0 - 0.005, (y0 + y1) / 2, z), (0.012, y1 - y0 - 0.1, 0.22))
            N.bm_box(B['glass'], (x0 - 0.012, y0 + 0.2, z + 0.04), (0.004, 0.12, 0.05))
        card.box(x0, x1, y0, y1, -0.3, 2.0)


def lockers(P, B, card):
    """seventeen lockers along the hall's back wall: eleven of one door (0.32 x 1.65 m), six of two (0.32 x 0.83);
    each door hung on its left side, locked one time in four, opening 120 degrees in 0.4 s"""
    LW, LD = 0.34, 0.5
    lx0 = -6.4
    ly = Y0 + T
    kinds = 'SSDSSDSSDSSDSDSDS'
    N.bm_box(B['steel'], (lx0 + len(kinds) * LW / 2, ly + LD / 2, 0.93), (len(kinds) * LW, LD, 1.86))
    N.bm_box(B['trim'], (lx0 + len(kinds) * LW / 2, ly + LD / 2, 1.88), (len(kinds) * LW + 0.04, LD + 0.04, 0.04))
    N.bm_box(B['trim'], (lx0 + len(kinds) * LW / 2, ly + LD / 2 + 0.02, 0.05), (len(kinds) * LW, LD - 0.04, 0.1))
    card.box(lx0, lx0 + len(kinds) * LW, ly, ly + LD, -0.3, 1.9, floor=True)
    for i, kind in enumerate(kinds):
        x = lx0 + i * LW
        doors = [(0.12, 1.77)] if kind == 'S' else [(0.12, 0.95), (0.97, 1.80)]
        for j, (za, zb) in enumerate(doors):
            name = f'lk{i}' + ('' if len(doors) == 1 else 'ab'[j])
            since = len(P.statics)
            P.box('lk_door', (LW - 0.02, 0.016, zb - za), (x + LW / 2, ly + LD + 0.008, (za + zb) / 2), 'paint_b', bev=0.003)
            for k in range(3):
                P.box('lk_vent', (LW - 0.12, 0.004, 0.012), (x + LW / 2, ly + LD + 0.018, zb - 0.1 - k * 0.04), 'trim', bev=None)
            P.box('lk_latch', (0.02, 0.02, 0.07), (x + LW - 0.05, ly + LD + 0.026, (za + zb) / 2), 'steel', bev=None)
            P.box('lk_tag', (0.06, 0.004, 0.035), (x + LW / 2, ly + LD + 0.018, zb - 0.26), 'alu', bev=None)
            P.mover(f'DOOR_{name}', P.statics[since:], (x + 0.01, ly + LD + 0.008, 0.0))
            card.door(f'DOOR_{name}', (x + 0.01, ly + LD + 0.008), LW - 0.02, 0.016, 120.0, zb, (1.0, 0.0), 1, pry='locker', z0=za,
                      box=(x + 0.01, x + LW - 0.01, ly, ly + LD, za, zb), secs=0.4, mat='metal')
            card.spot(name, x + LW / 2, ly + LD / 2, za + 0.02, 90)


def annex(P, B, card):
    """the annex: its metal door to the road (in, 0.4 s), the electric box on its east wall (two doors, stuck one time
    in four), a shelf along its back wall; the lamp over its door outside"""
    # the door: hung at its west side, opening in
    hx, hy = DOOR[0] + 0.02, AY1 - T / 2
    dw, dh = DOOR[1] - DOOR[0] - 0.04, 2.13
    since = len(P.statics)
    P.box('entry_door', (dw, 0.05, dh), (hx + dw / 2, hy, dh / 2), 'paint_b', bev=0.006)
    P.box('entry_kick', (dw - 0.1, 0.06, 0.25), (hx + dw / 2, hy, 0.16), 'alu', bev=None)
    P.box('entry_glass', (0.3, 0.06, 0.45), (hx + dw / 2, hy, 1.55), 'glass', bev=None)
    P.box('entry_handle', (0.14, 0.04, 0.03), (hx + dw - 0.12, hy + 0.05, 1.05), 'steel', bev=0.004)
    P.box('entry_handle', (0.14, 0.04, 0.03), (hx + dw - 0.12, hy - 0.05, 1.05), 'steel', bev=0.004)
    P.box('entry_plate', (0.22, 0.006, 0.12), (hx + dw / 2, hy + 0.03, 1.75), 'paint', bev=None)
    P.mover('DOOR_entry', P.statics[since:], (hx, hy, 0.0))
    card.door('DOOR_entry', (hx, hy), dw, 0.05, 100.0, dh, (1.0, 0.0), -1, pry='none', secs=0.4, mat='metal')
    # the electric box: its case on the wall, its two doors opening out of it, its conduits up to the ceiling
    bx = AX1 - T
    y0, y1, z0, z1 = 0.0, 0.44, 1.2, 1.82
    N.bm_box(B['alu'], (bx - 0.1, (y0 + y1) / 2, (z0 + z1) / 2), (0.2, y1 - y0, z1 - z0))
    N.bm_box(B['trim'], (bx - 0.1, (y0 + y1) / 2, (z0 + z1) / 2), (0.16, y1 - y0 - 0.06, z1 - z0 - 0.06))
    for k in range(3):
        C.post(P, 'conduit', (bx - 0.05, y0 + 0.1 + 0.12 * k, z1), (bx - 0.05, y0 + 0.1 + 0.12 * k, AROOF - SLAB), 0.016, 'alu', segs=6)
    card.box(bx - 0.2, bx, y0, y1, z0, z1)
    for side, (hy0, sd) in (('l', (y0 + 0.02, 1)), ('r', (y1 - 0.02, -1))):
        since = len(P.statics)
        P.box('ebox_door', (0.016, 0.2, 0.56), (bx - 0.208, hy0 + sd * 0.1, (z0 + z1) / 2), 'alu', bev=0.003)
        P.box('ebox_latch', (0.02, 0.02, 0.05), (bx - 0.22, hy0 + sd * 0.17, (z0 + z1) / 2), 'steel', bev=None)
        if side == 'l':
            P.box('ebox_sign', (0.004, 0.12, 0.1), (bx - 0.218, hy0 + 0.1, z1 - 0.12), 'paint', bev=None)
        P.mover(f'DOOR_ebox{side}', P.statics[since:], (bx - 0.208, hy0, 0.0))
        card.door(f'DOOR_ebox{side}', (bx - 0.208, hy0), 0.2, 0.016, 110.0, z0 + 0.59, (0.0, float(sd)), 1 if sd > 0 else -1, pry='stuck',
                  z0=z0 + 0.03, box=(bx - 0.2, bx, y0 + 0.02, y1 - 0.02, z0 + 0.02, z1 - 0.02), secs=0.4, mat='metal',
                  same='DOOR_eboxl' if side == 'r' else None)
    card.spot('ebox', bx - 0.1, (y0 + y1) / 2, z0 + 0.04, 180)
    # the shelf along its back wall
    sy = Y0 + T + 0.22
    for z in (0.1, 0.6, 1.1, 1.6):
        N.bm_box(B['steel'], (2.25, sy, z), (1.7, 0.42, 0.03))
    for (x, y) in ((1.42, sy - 0.19), (3.08, sy - 0.19), (1.42, sy + 0.19), (3.08, sy + 0.19)):
        N.bm_box(B['paint_b'], (x, y, 0.85), (0.035, 0.035, 1.7))
    card.box(1.4, 3.1, sy - 0.21, sy + 0.21, -0.3, 1.62, floor=True)
    card.spot('shelf_a', 1.9, sy, 0.615, 90)
    card.spot('shelf_b', 2.7, sy, 1.115, 80)
    # the lamp over the door outside: a caged bulkhead
    lx, ly, lz = (DOOR[0] + DOOR[1]) / 2, AY1 + 0.09, 2.42
    P.box('wall_lamp_back', (0.22, 0.04, 0.3), (lx, AY1 + 0.02, lz), 'trim', bev=0.006)
    S.lit_panel(P, 'wall_lamp_glass', 'wall', (0.14, 0.1, 0.2), (lx, ly, lz))
    for k in range(3):
        P.box('wall_lamp_cage', (0.16, 0.012, 0.012), (lx, ly + 0.055, lz - 0.07 + 0.07 * k), 'trim', bev=None)
    card.lamp('wall', lx, ly + 0.05, lz - 0.05, 7.0, hours=(19, 6), pool=0.0)


def awning(P, B, card):
    """the awning over the annex's door: a sheet of steel on its frame, leaning off the hall's wall, on two posts"""
    x0, x1, y0, y1 = X1, 3.84, AY1, 4.6
    zh, zl = 2.7, 2.56
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    tilt = math.atan2(zh - zl, y1 - y0)
    R = Matrix.Rotation(-tilt, 3, 'X')
    N.bm_box(B['paint_b'], (cx, cy, (zh + zl) / 2), (x1 - x0, (y1 - y0) / math.cos(tilt), 0.04), R)
    N.bm_box(B['trim'], (cx, y1 - 0.03, zl - 0.06), (x1 - x0, 0.06, 0.12))
    N.bm_box(B['trim'], (x1 - 0.03, cy, (zh + zl) / 2 - 0.06), (0.06, y1 - y0, 0.12))
    for (x, y) in ((x1 - 0.1, y1 - 0.1), (x0 + 0.15, y1 - 0.1)):
        C.post(P, 'awning_post', (x, y, 0.0), (x, y, zl - 0.04), 0.045, 'paint_b', segs=8)
        card.post(x, y, 0.06, -0.3, zl)
    card.box(x0, x1, y0, y1, zl - 0.1, (zh + zl) / 2, floor=True)
    for k, (x, y) in enumerate(((1.6, 3.6), (2.5, 4.1), (3.3, 3.4))):
        card.spot(f'awn_{"abc"[k]}', x, y, (zh + zl) / 2, 60 * k)


def lights(P, B, card):
    """the hall's two fluorescent tubes hung on their chains, lit by the clock"""
    for k, x in enumerate((-4.6, -1.6)):
        y, z = 1.3, 3.4
        name = 'tube_' + 'ab'[k]
        N.bm_box(B['paint_b'], (x, y, z + 0.05), (1.36, 0.22, 0.08))
        S.lit_panel(P, f'{name}_glass', name, (1.26, 0.14, 0.02), (x, y, z))
        for s in (-0.5, 0.5):
            C.post(P, 'tube_chain', (x + s, y, z + 0.09), (x + s, y, ROOF - SLAB), 0.006, 'steel', segs=3, bev=None)
        card.lamp(name, x, y, z - 0.03, 8.0, warm=False, hours=(19, 6), inside=True, tube=True)


def cameras(P, B, card):
    """three cameras: on the hall's two front corners, one on the mast"""
    for (x, y, z, face) in ((X0 + 0.12, Y1 + 0.12, 3.9, 120), (X1 - 0.12, Y1 + 0.12, 3.9, 60), (MAST[0] - 0.9, MAST[1] + 0.5, 6.0, 120)):
        a = math.radians(face)
        R = Matrix.Rotation(a, 3, 'Z') @ Matrix.Rotation(math.radians(20), 3, 'Y')
        c = V((x + math.cos(a) * 0.22, y + math.sin(a) * 0.22, z))
        C.post(P, 'cam_arm', (x, y, z + 0.1), tuple(c + V((0, 0, 0.08))), 0.015, 'trim', segs=5)
        N.bm_box(B['paint_b'], c, (0.26, 0.1, 0.1), R)
        N.bm_box(B['trim'], c + R @ V((0.14, 0.0, 0.0)), (0.03, 0.08, 0.08), R)
        N.bm_box(B['trim'], c + R @ V((0.04, 0.0, 0.07)), (0.32, 0.13, 0.015), R)


def mast(P, B, card):
    """the lattice mast on its pad: its dishes, its panels near the top, its whip, its light; the tray of its cables
    to the annex"""
    mx, my = MAST
    N.bm_box(B['ceramic'], (mx, my, 0.075), (3.6, 3.6, 0.15))
    card.box(mx - 1.8, mx + 1.8, my - 1.8, my + 1.8, -0.3, 0.15, floor=True)
    pt = Pr.lattice_mast(P, card, mx, my, MAST_H, 1.35, 0.32, 16, mat='paint_b')
    # the dishes, each on the leg nearest the way it looks
    big = [(16.0, 205.0, 0.9, 4.0), (21.5, 55.0, 0.9, 2.0)]
    small = [(8.5, 120.0), (11.0, 300.0), (13.5, 25.0), (24.0, 160.0), (26.0, 250.0), (28.0, 340.0)]
    for (z, f, r, tilt) in big + [(z, f, 0.32, 0.0) for (z, f) in small]:
        a = math.radians(f)
        rad = 1.35 + (0.32 - 1.35) * z / MAST_H
        at = (mx + math.cos(a) * (rad + 0.25 + r * 0.35), my + math.sin(a) * (rad + 0.25 + r * 0.35), z)
        legs = [pt(k, z) for k in range(3)]
        mount = min(legs, key=lambda p: (p[0] - at[0]) ** 2 + (p[1] - at[1]) ** 2)
        Pr.dish(P, at, f, tilt, r, mount=mount)
    for k in range(3):
        a = math.pi / 2 + k * TAU / 3 + math.pi / 3
        p = (mx + math.cos(a) * 0.55, my + math.sin(a) * 0.55)
        P.box('panel_antenna', (0.1, 0.3, 1.3), (p[0], p[1], 29.0), 'alu', rot=(0, 0, math.degrees(a)), bev=0.01)
    C.post(P, 'mast_pole', (mx, my, MAST_H - 0.2), (mx, my, MAST_TOP), 0.035, 'paint_b', segs=6)
    # its light: a red globe in a cage
    o = P.sphere('beacon_glass', 0.13, loc=(mx, my, BEACON_Z), material='glass', u=12, v=8)
    P.mover('N_lit_beacon', [o], (mx, my, BEACON_Z))
    P.cyl('beacon_base', 0.12, 0.06, (mx, my, BEACON_Z - 0.15), 'trim', segs=10)
    for k in range(4):
        b = k * math.pi / 2
        C.post(P, 'beacon_cage', (mx + 0.15 * math.cos(b), my + 0.15 * math.sin(b), BEACON_Z - 0.12), (mx + 0.15 * math.cos(b), my + 0.15 * math.sin(b), BEACON_Z + 0.14), 0.006, 'trim', segs=3, bev=None)
    card.lamp('beacon', mx, my, BEACON_Z, 100.0, warm=True, hours=(19, 6), beacon=True, color=0xff5a2a)
    # the cable tray from the mast to the annex's back wall
    a, b = V((mx - 0.75, my + 0.75, 3.0)), V((3.0, Y0 - 0.03, 3.0))
    d = (b - a).normalized()
    p = V((-d.y, d.x, 0.0)) * 0.2
    for s in (1, -1):
        C.post(P, 'tray_rail', tuple(a + p * s), tuple(b + p * s), 0.015, 'alu', segs=4)
    n = int((b - a).length / 0.3)
    for k in range(1, n):
        q = a + (b - a) * (k / n)
        C.post(P, 'tray_rung', tuple(q + p), tuple(q - p), 0.008, 'alu', segs=3, bev=None)
    for s in (0.4, 0.0, -0.4):
        C.post(P, 'tray_cable', tuple(a + p * s + V((0, 0, 0.03))), tuple(b + p * s + V((0, 0, 0.03))), 0.014, 'rubber', segs=5)


def fence(P, B, card):
    """the wire fence round the station, barbed over the top, its gate's opening to the road; the station's sign by it"""
    pts = [(-8.2, 8.6), (-8.2, -8.9), (8.2, -8.9), (8.2, 8.6), (-8.2, 8.6)]
    Pr.fence(P, B, card, pts, h=1.9, mat='alu', strands=5, barbed=True, gap=(3, 3.2, 7.9))
    for x in (5.0, 0.3):
        C.post(P, 'gate_post', (x, 8.6, -0.05), (x, 8.6, 2.2), 0.06, 'paint_b', segs=8)
        card.post(x, 8.6, 0.08, -0.3, 2.2)
    N.bm_box(B['paint'], (-1.8, 8.64, 1.25), (1.6, 0.03, 0.55))
    N.bm_box(B['paint_b'], (-1.8, 8.66, 1.25), (1.4, 0.01, 0.12))


def radiostation(P):
    card = N.Card('radiostation')
    B = N.new_set()
    walls(P, B, card)
    roof_things(P, B, card)
    stair(P, B, card)
    desk(P, B, card)
    racks(P, B, card)
    lockers(P, B, card)
    annex(P, B, card)
    awning(P, B, card)
    lights(P, B, card)
    cameras(P, B, card)
    mast(P, B, card)
    fence(P, B, card)
    # the ground's spots inside the fence; things lying about it
    for k, (x, y) in enumerate(((-5.5, 7.0), (-2.0, 7.6), (6.5, 7.2), (7.2, 3.5), (6.8, -1.0), (7.3, -7.8), (2.5, -7.8), (-1.5, -6.8),
                                (-5.0, -7.9), (-7.5, -6.5), (-7.6, -4.0), (5.0, 1.0), (4.6, 5.8), (0.0, 6.6), (-3.8, -4.3), (1.8, -4.6))):
        card.spot(f'g_{"abcdefghijklmnop"[k]}', x, y, 0.0, 47 * k)
    for k, (x, y) in enumerate(((-6.2, 6.3), (3.0, 7.9), (7.6, 0.8), (4.0, -3.4), (-2.6, -3.4), (-7.0, -8.2), (7.6, -4.6), (-3.0, 5.9))):
        card.spot(f's_{"abcdefgh"[k]}', x, y, 0.0, 83 * k)
    N.finish_bms(P, B)
    P.views = [('a', -55, 22), ('b', 30, 30), ('c', 150, 24)]
    card.extra['plinth'] = 0.0
    movers = {d['name']: dict(move='hinge', axis='y', open=float(d['open'])) for d in card.doors}
    return card, (16.53, 18.08, 30.54), movers


TAU = math.tau
TABLE = {'radiostation': radiostation}


def main(args):
    N.run(TABLE, args)
