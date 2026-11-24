"""
The works block (docs/ND/PLAN.md, ND6): a prefab place of Nomad Drive's Factory-03 (16.55 x 27.36 m, 13.61 m high; a
block of 11.57 x 10.20 x 12.53 m, its floors at 0, 3.42 and 6.83, its roof at 11.95 not to be come to; dog-leg stairs,
their risers 0.28 m, their landings at 1.80 and 5.22; seventeen shelving units, fourteen with things on them at 1.02
and 1.62 over their floor; an upright tank, four air conditioners, one metal door and one lamp by it) in our own design:

    blender -b --factory-startup --python tools/blender/build.py -- nd/factory3 [factory3] [--norender] [--noao] [--toon]

Three storeys of painted block on a dark plinth, rows of windows on each, its parapet capped; the stair of steel in its
west corner, a rail round its well on the floors over it; the shelving in rows on every floor; the air conditioners on
its east wall, the tank behind it. Its frame and its card: nd/_nd.py; its parts: nd/_props.py.
"""
import math

from mathutils import Matrix, Vector

from parts._kit import V
from places import _common as C
from nd import _nd as N
from nd import _props as Pr
from nd import station as S

T = 0.3
X0, X1, Y0, Y1 = -5.785, 5.785, -3.5, 6.7
FLOORS = (0.0, 3.42, 6.83)
ROOF, TOP = 11.95, 12.53
XI0, XI1, YI0, YI1 = X0 + T, X1 - T, Y0 + T, Y1 - T
# the stair's well in the west corner: two flights a storey, side by side, the landing between at the east
WELL = (XI0 + 1.48, XI0 + 4.26, YI0, -1.0)
DOOR = (1.0, 2.1)


def block(P, B, card):
    holes = {'n': [(DOOR[0], DOOR[1], 0.0, 2.15, 'door')], 'e': [], 's': [], 'w': []}
    for z0 in (1.0, 4.4, 7.8, 9.9):
        h = 1.2 if z0 < 9 else 1.0
        for (a, b) in ((-4.6, -3.2), (-2.0, -0.6), (3.0, 4.4)):
            holes['n'].append((a, b, z0, z0 + h, 'window'))
        for (a, b) in ((-4.0, -2.6), (-0.6, 0.8)):
            holes['s'].append((a, b, z0, z0 + h, 'window'))
        for (a, b) in ((4.8, 3.4), (1.8, 0.4), (-1.0, -2.4)):
            holes['e'].append((a, b, z0, z0 + h, 'window'))
        for (a, b) in ((0.4, 1.8), (3.4, 4.8)):
            holes['w'].append((a, b, z0, z0 + h, 'window'))
    Pr.block_walls(B, card, X0, X1, Y0, Y1, -0.15, TOP, T, holes, outer='paint', inner='ceramic')
    # its floors (each over the stair's well but where one comes off it), the roof's slab
    Pr.slab(B, card, XI0, XI1, YI0, YI1, FLOORS[0], th=0.2)
    for z in FLOORS[1:]:
        Pr.slab(B, card, XI0, XI1, YI0, YI1, z, th=0.25, holes=[WELL])
        # the rail round the well
        Pr.railing(P, card, [(WELL[0], WELL[3]), (WELL[1], WELL[3]), (WELL[1], WELL[2])], z, h=1.0, name='well_rail')
    Pr.slab(B, card, XI0, XI1, YI0, YI1, ROOF, th=0.3, top='rubber', under='ceramic')
    # bands at the floors' levels outside
    for z in FLOORS[1:]:
        for (a, b, o) in (((X0, Y1), (X1, Y1), (0, 1)), ((X1, Y0), (X0, Y0), (0, -1)), ((X1, Y1), (X1, Y0), (1, 0)), ((X0, Y0), (X0, Y1), (-1, 0))):
            f = N.Face(a, b, o, T)
            N.face_box(B['trim'], f, -0.03, f.L + 0.03, 0.0, 0.05, z - 0.12, z + 0.04)


def stairs(P, B, card):
    """a storey's two flights: up along the back wall to the landing at its east end, back along beside it to the
    floor; the first's rail between them, the second's on its open side"""
    xa = XI0 + 1.2
    xb = xa + 7 * 0.28
    ya, yb = (YI0 + YI0 + 1.1) / 2, (YI0 + 1.1 + WELL[3]) / 2
    for (z0, zl, z1) in ((FLOORS[0], 1.80, FLOORS[1]), (FLOORS[1], 5.22, FLOORS[2])):
        Pr.steel_stair(P, B, card, (xa, ya), (xb, ya), z0, zl, w=1.1, n=7, rails=(True, False), name='stair')
        Pr.landing(P, B, card, xb, WELL[1], YI0, WELL[3], zl, rails='ne', legs=z0 < 0.1)
        Pr.steel_stair(P, B, card, (xb, yb), (xb - 6 * 0.28, yb), zl, z1, w=1.1, n=6, rails=(False, True), name='stair')


def shelves(P, B, card):
    """seventeen shelving units in rows on its floors: fourteen with things on them, three bare"""
    k = 0
    bare = {4, 10, 16}
    for (fi, z) in enumerate(FLOORS):
        rows = [(-3.6, 0.9), (0.0, 0.9), (3.6, 0.9), (-3.6, 3.4), (0.0, 3.4), (3.6, 3.4)]
        if fi == 0:
            rows = [r for r in rows if r != (3.6, 3.4)]
        for (x, y) in rows:
            name = f'sh{k}'
            Pr.shelving(P, B, card, name, x, y, yaw=180.0 if k % 2 else 0.0, z=z, spots=() if k in bare else (1.02, 1.62), k=k)
            k += 1
    return k


def outside(P, B, card):
    """its door (metal, in, 0.4 s), the lamp over it; four air conditioners on its east wall; the tank behind it"""
    hx, hy = DOOR[0] + 0.02, Y1 - T / 2
    dw, dh = DOOR[1] - DOOR[0] - 0.04, 2.13
    since = len(P.statics)
    P.box('door', (dw, 0.05, dh), (hx + dw / 2, hy, dh / 2), 'paint_b', bev=0.006)
    P.box('door_kick', (dw - 0.1, 0.06, 0.25), (hx + dw / 2, hy, 0.16), 'alu', bev=None)
    for s in (0.05, -0.05):
        P.box('door_handle', (0.14, 0.04, 0.03), (hx + dw - 0.12, hy + s, 1.05), 'steel', bev=0.004)
    P.box('door_plate', (0.26, 0.006, 0.14), (hx + dw / 2, hy + 0.03, 1.7), 'paint', bev=None)
    P.mover('DOOR_main', P.statics[since:], (hx, hy, 0.0))
    card.door('DOOR_main', (hx, hy), dw, 0.05, 100.0, dh, (1.0, 0.0), -1, pry='none', secs=0.4, mat='metal')
    lx, ly, lz = (DOOR[0] + DOOR[1]) / 2, Y1 + 0.09, 2.45
    P.box('lamp_back', (0.22, 0.04, 0.3), (lx, Y1 + 0.02, lz), 'trim', bev=0.006)
    S.lit_panel(P, 'lamp_glass', 'door', (0.14, 0.1, 0.2), (lx, ly, lz))
    card.lamp('door', lx, ly + 0.05, lz - 0.05, 7.0, hours=(19, 6), pool=0.0)
    # a step of concrete before the door
    N.bm_box(B['ceramic'], ((DOOR[0] + DOOR[1]) / 2, Y1 + 0.5, -0.05), (1.8, 1.0, 0.2))
    card.box(DOOR[0] - 0.35, DOOR[1] + 0.35, Y1, Y1 + 1.0, -0.4, 0.05, floor=True)
    for (k, y) in enumerate((-1.6, 0.2, 2.0, 3.8)):
        N.bm_box(B['alu'], (X1 + 0.3, y, 0.4), (0.5, 0.9, 0.7))
        P.cyl('ac_grill', 0.26, 0.02, (X1 + 0.56, y, 0.42), 'trim', axis=(1, 0, 0), segs=14)
        C.post(P, 'ac_pipe', (X1 + 0.1, y + 0.3, 0.7), (X1 + 0.1, y + 0.3, 2.4), 0.02, 'alu', segs=5, bev=None)
        card.box(X1, X1 + 0.56, y - 0.45, y + 0.45, -0.3, 0.75)
    Pr.tank(P, B, card, 2.8, -7.6, 'small', mat='paint_b')


def works(P):
    card = N.Card('factory3')
    B = N.new_set()
    block(P, B, card)
    stairs(P, B, card)
    shelves(P, B, card)
    outside(P, B, card)
    # on its floors, among the rows; on the ground about it
    for (fi, z) in enumerate(FLOORS):
        for k, (x, y) in enumerate(((-1.8, 2.15), (1.8, 2.15), (4.8, 5.5), (-4.6, 5.4), (1.6, 5.6), (-0.4, -0.4), (2.6, -2.2), (4.9, -2.5), (-0.5, -2.4), (4.6, 0.2))):
            card.spot(f'f{fi}_{k}', x, y, z, 41 * k + 90 * fi)
    for k, (x, y) in enumerate(((-7.2, 9.0), (-3.0, 8.6), (4.5, 9.5), (7.4, 7.2), (7.6, 1.0), (7.5, -4.6), (5.6, -9.8), (0.0, -6.0),
                                (-4.0, -8.5), (-7.3, -5.0), (-7.4, 0.8), (-7.0, 4.6), (0.5, 11.0), (-5.5, 12.6), (6.6, 12.4), (-1.6, -12.2),
                                (4.4, -12.8), (-7.6, -11.6), (7.8, -11.2))):
        card.spot(f'g_{k:02d}', x, y, 0.0, 47 * k)
    N.finish_bms(P, B)
    P.views = [('a', -55, 24), ('b', 35, 30), ('c', 150, 24)]
    card.extra['plinth'] = 0.0
    movers = {d['name']: dict(move='hinge', axis='y', open=float(d['open'])) for d in card.doors}
    return card, (16.55, 27.36, 13.61), movers


TABLE = {'factory3': works}


def main(args):
    N.run(TABLE, args)
