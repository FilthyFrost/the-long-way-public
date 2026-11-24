"""
The warehouse (docs/ND/PLAN.md, ND6): a prefab place of Nomad Drive's Factory-02 (26.95 x 22.00 m, 7.66 m high; a hall
of 13.19 x 12.69 m outside, 12.38 x 11.81 inside, its walls 5.63 m high, its roof's deck at 5.70 behind a parapet to
6.30 with a railing on it to 7.33; a steel stair of 35 treads up its west wall to a landing of 1.60 x 1.40 m at 6.42;
eleven shelving units of 0.64 x 2.08 x 2.22 m, what is on them at 1.02 and 1.62; a lying tank; a roof vent; its
doors' panels fixed — none that opens — and no lamps) in our own design:

    blender -b --factory-startup --python tools/blender/build.py -- nd/factory2 [factory2] [--norender] [--noao] [--toon]

A hall of painted block on a dark plinth: its big shutter at the front raised over head height, the door beside it
gone (its panel lying in the grass), two shutters down on its east side and a door shut at its back; skylights in its
roof; the stair of steel up its west side, steps down inside the parapet at its head. Inside, the shelving in rows
either side of a lane from the shutter. Its frame and its card: nd/_nd.py; its parts: nd/_props.py.
"""
import math

from mathutils import Matrix, Vector

from parts._kit import V
from places import _common as C
from nd import _nd as N
from nd._nd import face_box
from nd import _props as Pr

T = 0.41
X0, X1, Y0, Y1 = -4.0, 9.19, -9.0, 3.69
WALL, DECK, PARA, RAIL = 5.63, 5.70, 6.30, 7.33
SX, SFOOT, SHEAD, STOP = -4.55, 3.0, -6.45, 6.42
LAND = (-5.65, -4.05, -7.85, -6.45)
SHUTTER = (1.5, 5.5, 4.0, 2.6)               # x0, x1, its top, how far it is raised
DOORWAY = (-2.6, -1.6)


def hall(P, B, card):
    holes = {
        'n': [(SHUTTER[0], SHUTTER[1], 0.0, SHUTTER[2], 'gap'), (DOORWAY[0], DOORWAY[1], 0.0, 2.1, 'door'),
              (-3.4, -2.9, 3.6, 4.6, 'window'), (6.4, 8.2, 3.6, 4.6, 'window')],
        'e': [(0.2, -3.0, 0.0, 3.6, 'gap'), (-3.8, -7.0, 0.0, 3.6, 'gap'), (2.6, 1.0, 3.9, 4.7, 'window')],
        's': [(3.0, 4.0, 0.0, 2.1, 'door'), (-2.8, 0.6, 3.9, 4.7, 'window'), (5.6, 8.0, 3.9, 4.7, 'window')],
        'w': [(-1.6, 0.8, 3.9, 4.7, 'window')],
    }
    faces = Pr.block_walls(B, card, X0, X1, Y0, Y1, -0.15, PARA, T, holes, outer='paint', inner='ceramic')
    n, e, s = faces['n'], faces['e'], faces['s']
    # the shutters: the front's raised, the east side's two down to the floor; their card (the raised one's slats over
    # head height, the shut ones walls)
    Pr.roller_shutter(P, B, n, SHUTTER[0] - X0, SHUTTER[1] - X0, 0.0, SHUTTER[2], SHUTTER[3])
    card.box(SHUTTER[0], SHUTTER[1], Y1 - T, Y1, SHUTTER[3], PARA)
    for (a, b) in ((0.2, -3.0), (-3.8, -7.0)):
        sa, sb = (Y1 - T) - a, (Y1 - T) - b
        Pr.roller_shutter(P, B, e, sa, sb, 0.0, 3.6, 0.0)
        card.box(X1 - T, X1, min(a, b), max(a, b), -0.3, 3.6)
    # the back door, shut: a steel leaf fixed in its frame
    face_box(B['paint_b'], s, X1 - 4.0, X1 - 3.0, -0.2, -0.16, 0.0, 2.1)
    face_box(B['steel'], s, X1 - 3.15, X1 - 3.08, -0.15, -0.12, 0.95, 1.1)
    card.box(3.0, 4.0, Y0, Y0 + T, -0.3, 2.1)
    # the front door's leaf, gone off its hinges: lying in the grass before it
    P.box('door_fallen', (1.0, 2.05, 0.05), (-2.4, 5.4, 0.04), 'paint_b', rot=(0, 0, 14), bev=0.006)
    P.box('door_fallen_plate', (0.3, 0.12, 0.01), (-2.35, 5.0, 0.07), 'steel', rot=(0, 0, 14), bev=None)
    card.solids.append(dict(u=N.r4(-2.4), v=N.r4(-5.4), hx=0.55, hz=1.05, y0=-0.3, y1=0.07, turn=N.r4(-math.radians(14)), floor=True))
    # the floor; the roof's slab and its deck; skylights in it
    Pr.slab(B, card, X0 + T, X1 - T, Y0 + T, Y1 - T, 0.0, th=0.2, top='ceramic', under='ceramic')
    sky = [(0.0, 2.0, -6.0, -4.6), (0.0, 2.0, -1.6, -0.2), (5.0, 7.0, -4.0, -2.6)]
    Pr.slab(B, card, X0 + T, X1 - T, Y0 + T, Y1 - T, DECK, th=0.3, top='rubber', under='ceramic', holes=sky)
    for (a, b, c, d) in sky:
        N.bm_box(B['trim'], ((a + b) / 2, (c + d) / 2, DECK + 0.1), (b - a + 0.12, d - c + 0.12, 0.2))
        N.bm_box(B['glass'], ((a + b) / 2, (c + d) / 2, DECK + 0.22), (b - a, d - c, 0.03))
        card.box(a - 0.06, b + 0.06, c - 0.06, d + 0.06, DECK - 0.3, DECK + 0.25, floor=True)
    # the roof's vent
    C.post(P, 'roof_vent', (6.8, -7.2, DECK), (6.8, -7.2, DECK + 1.0), 0.18, 'alu', segs=12)
    P.cyl('roof_vent_cap', 0.34, 0.25, (6.8, -7.2, DECK + 1.12), 'alu', segs=12, r2=0.06)
    card.post(6.8, -7.2, 0.22, DECK - 0.1, DECK + 1.2)


def roof_rail(P, B, card):
    """the railing on the parapet round the roof, an opening in it where the stair's landing meets it; the steps down
    inside the parapet"""
    pts = [(X0 + T / 2, Y1 - T / 2), (X1 - T / 2, Y1 - T / 2), (X1 - T / 2, Y0 + T / 2), (X0 + T / 2, Y0 + T / 2), (X0 + T / 2, Y1 - T / 2)]
    # (the west side runs from the back corner to the front: the landing's opening along it)
    g0 = LAND[2] - (Y0 + T / 2)
    g1 = LAND[3] - (Y0 + T / 2)
    Pr.railing(P, card, pts, PARA, h=RAIL - PARA, gap=(3, g0, g1))
    # the parapet's top where one steps over it: a floor; the step inside it
    card.box(X0, X0 + T, LAND[2], LAND[3], DECK, PARA, floor=True)
    Pr.landing(P, B, card, X0 + T, X0 + T + 0.6, LAND[2], LAND[3], 6.0, rails='', legs=False)
    N.bm_box(B['paint_b'], (X0 + T + 0.3, (LAND[2] + LAND[3]) / 2, (DECK + 6.0) / 2), (0.6, LAND[3] - LAND[2], 6.0 - DECK - 0.04))


def stair(P, B, card):
    Pr.steel_stair(P, B, card, (SX, SFOOT), (SX, SHEAD), 0.0, STOP, w=1.0, n=35, rails=(False, True), name='stair')
    Pr.landing(P, B, card, *LAND, STOP, rails='ws')
    for y in (1.0, -2.0, -5.0):
        z = STOP * (SFOOT - y) / (SFOOT - SHEAD)
        N.bm_box(B['paint_b'], (X0 - 0.3, y, z - 0.28), (0.6, 0.08, 0.08))


def shelves(P, B, card):
    """eleven shelving units: two rows of two and one of one either side of the lane from the shutter, two against
    the back wall in the lane"""
    k = 0
    for y in (-7.4, -4.4, -1.4):
        for x in (-2.3, 0.0, 7.2):
            Pr.shelving(P, B, card, f'sh{k}', x, y, yaw=0.0 if k % 2 else 180.0, k=k)
            k += 1
    for x in (2.4, 4.6):
        Pr.shelving(P, B, card, f'sh{k}', x, Y0 + T + 0.36, yaw=0.0, k=k)
        k += 1
    return k


def warehouse(P):
    card = N.Card('factory2')
    B = N.new_set()
    hall(P, B, card)
    roof_rail(P, B, card)
    stair(P, B, card)
    shelves(P, B, card)
    Pr.tank(P, B, card, 11.6, -4.0, 'lying', yaw=90.0, mat='paint_b')
    # on its floor: in the lane and the aisles
    for k, (x, y) in enumerate(((3.5, 1.8), (2.6, -2.9), (4.4, -5.9), (-1.2, -2.9), (-1.0, -5.9), (6.6, -2.9), (8.0, 0.4), (-3.0, 1.6),
                                (3.2, -7.4), (-2.8, -8.0), (7.8, -8.0), (5.0, -0.2), (1.9, 0.6), (-2.0, 0.2), (8.2, -5.9))):
        card.spot(f'f_{"abcdefghijklmno"[k]}', x, y, 0.0, 37 * k)
    # on the ground about it
    for k, (x, y) in enumerate(((-8.0, 8.0), (-3.0, 7.5), (4.0, 8.4), (9.5, 7.0), (12.2, 3.0), (12.6, -8.5), (10.0, -10.2), (4.0, -10.4),
                                (-2.0, -10.2), (-7.5, -9.8), (-9.5, -5.0), (-8.6, 0.5), (-11.5, 4.0), (-12.5, -1.5), (0.0, 5.6),
                                (6.5, 5.5), (11.2, -1.0), (-6.4, 6.2), (2.0, 9.6), (-10.8, 9.2), (12.9, 9.6), (7.4, -10.6), (-12.8, -9.6), (10.2, 4.6))):
        card.spot(f'g_{k:02d}', x, y, 0.0, 51 * k)
    N.finish_bms(P, B)
    P.views = [('a', -50, 26), ('b', 40, 30), ('c', 160, 24)]
    card.extra['plinth'] = 0.0
    return card, (26.95, 22.00, 7.66), {}


TABLE = {'factory2': warehouse}


def main(args):
    N.run(TABLE, args)
