"""
The starter house by the road (docs/ND/PLAN.md, ND5): a prefab place of Nomad Drive's StarterHouse class (18.2 x 15.74
m, 10.9 m to its ridge; its ground floor some 6.5 x 13.4 m — the living room, the stair hall, the kitchen —, its upper
floor 4.01 m up — a bedroom some 7.5 x 6.6 m with a bed and a closet of two compartments, a room of 3.7 m —, its attic
7.15 m up; the garage some 4.9 m wide beside it, its two doors swinging out 115 degrees; four wooden doors and four
storage doors, none ever locked or stuck; a yard with barrels and a box, a pallet and a lean-to behind) — one met
along the road, not the garage one starts from — in our own design:

    blender -b --factory-startup --python tools/blender/build.py -- nd/starter [starter] [--norender] [--noao] [--toon]

A tall grey clapboard house (paint) trimmed white (paint_b) under a steep tin roof; a porch at its front door, the
back door of sheet metal under a bulkhead lamp, a shade net over the patio behind it, a lean-to for firewood. Its
frame and its card: nd/_nd.py; its walls and roofs: nd/_house.py.
"""
import math

import bmesh
from mathutils import Matrix, Vector

from parts import _kit as K
from parts._kit import V
from places import _common as C
from nd import _nd as N
from nd._nd import Face, face_box
from nd import _house as Hs
from nd import station as S

G = 0.0                  # the yard
F = 0.4                  # the house's floor
UP, ATT = 4.01, 7.15     # the upper floor, the attic's floor
X0, Y0, X1, Y1 = -8.8, -3.5, 4.6, 3.0      # the house
GX1 = 9.4                                    # the garage, from the house's east wall
T = 0.14


def jit(k, a=0.0):
    return C.jit(k, a)


def pendant(P, card, name, x, y, z_ceil, switch_at, zf):
    """a lamp hanging under a ceiling at z_ceil, its bulb lit with it; its switch at (x, y, the way out of its wall)"""
    z = z_ceil - 0.5
    C.post(P, 'cord', (x, y, z_ceil), (x, y, z + 0.13), 0.006, 'trim', segs=5)
    P.lathe('shade', [(0.015, z + 0.13), (0.04, z + 0.125), (0.2, z - 0.01), (0.21, z - 0.025), (0.205, z - 0.03), (0.19, z - 0.015), (0.035, z + 0.11), (0.0, z + 0.115)],
            loc=(x, y, 0.0), material='paint_b', segs=20, sharp=50.0)
    o = P.sphere('bulb', 0.045, loc=(x, y, z + 0.01), material='glass', u=10, v=6)
    P.mover(f'N_lit_{name}', [o], (x, y, z + 0.01))
    card.lamp(name, x, y, z + 0.01, 5.5)
    sx, sy, (nx, ny) = switch_at
    P.box('switch_plate', (0.075 if abs(ny) > 0.5 else 0.012, 0.012 if abs(ny) > 0.5 else 0.075, 0.12), (sx + nx * 0.006, sy + ny * 0.006, zf + 1.35), 'paint_b', bev=0.003)
    card.switch(name, sx + nx * 0.02, sy + ny * 0.02, zf + 1.35, [name])


def partition(B, card, x, ya, yb, z0, z1, door=None):
    """a partition along Y at x from ya to yb between two floors, a doorway in it (y0, y1, height) left open"""
    pieces = [(ya, yb, z0, z1)]
    if door:
        d0, d1, h = door
        pieces = [(ya, d0, z0, z1), (d1, yb, z0, z1), (d0, d1, z0 + h, z1)]
    for (a, b, za, zb) in pieces:
        if b - a < 0.02:
            continue
        N.bm_box(B['paint_b'], (x, (a + b) / 2, (za + zb) / 2), (0.1, b - a, zb - za))
        card.box(x - 0.05, x + 0.05, a, b, za, zb)


def leaf(P, card, name, hx, hy, w, h, z0, axis, turn, mat='paint_b', pry='none', open_deg=95.0, thin=False):
    """a door's leaf of boards (or a thin cupboard door) hung at (hx, hy) along axis (unit, XY) from it, opening by turn"""
    dt = 0.022 if thin else 0.045
    ax, ay = axis
    since = len(P.statics)
    n = 2 if thin else 5
    for j in range(n):
        c = (hx + ax * (j + 0.5) * w / n, hy + ay * (j + 0.5) * w / n)
        sz = (w / n - 0.005, dt, h - 0.02) if abs(ax) > 0.5 else (dt, w / n - 0.005, h - 0.02)
        P.box('leaf_board', sz, (c[0], c[1], z0 + h / 2), mat, bev=0.003)
    kn = (hx + ax * (w - 0.07), hy + ay * (w - 0.07))
    P.sphere('knob', 0.02 if thin else 0.028, loc=(kn[0] + (0 if abs(ax) > 0.5 else 0.04), kn[1] + (0.04 if abs(ax) > 0.5 else 0), z0 + (h / 2 if thin else 1.0)), material='chrome', u=8, v=4)
    P.mover(f'DOOR_{name}', P.statics[since:], (hx, hy, z0))
    return dt


def house(P, B, card):
    """The house: its walls of two storeys in one, its windows on both floors and in the gables, its front door, the
    back door, the door to the garage; the upper floor and the attic's over it; the stair, the upper doors, the
    ship's ladder; its rooms' fixed things and lights."""
    h = Hs.House(P, B, card, 'house', X0, Y0, X1, Y1, ATT - F, pitch=45.0, ridge='x', z0=F, ground=G, t=T)
    up = UP - F
    for (s0, s1) in ((1.4, 2.5), (3.6, 4.7), (9.6, 10.6), (11.6, 12.4)):
        h.window('n', s0, s1, 0.95, 2.1, shutters=True)
    for (s0, s1) in ((1.4, 2.5), (4.4, 5.4), (9.6, 10.6), (11.6, 12.4)):
        h.window('n', s0, s1, up + 0.95, up + 2.1, shutters=True)
    for (s0, s1) in ((4.6, 5.6), (9.0, 10.1)):
        h.window('s', s0, s1, 0.95, 2.1)
    for (s0, s1) in ((1.5, 2.6), (5.0, 6.0), (9.5, 10.6)):
        h.window('s', s0, s1, up + 0.95, up + 2.1)
    h.window('w', 2.6, 3.9, 0.95, 2.1)
    h.window('w', 2.6, 3.9, up + 0.95, up + 2.1)
    h.window('w', 2.8, 3.7, ATT - F + 0.6, ATT - F + 1.35, rows=1, cols=2)
    h.window('e', 2.6, 3.9, up + 0.95, up + 2.1)
    h.window('e', 2.8, 3.7, ATT - F + 0.6, ATT - F + 1.35, rows=1, cols=2)
    h.door('n', 6.6, 7.5, 'front', hinge='lo', pry='none', mat='paint_b', open_deg=90.0, glass=True)
    h.door('s', 2.6, 3.5, 'back', hinge='hi', pry='none', mat='steel', open_deg=110.0)
    h.door('e', 4.6, 5.5, 'garage_in', hinge='lo', pry='none', mat='wood', open_deg=90.0)
    h.build(expo=0.2)
    ix0, iy0, ix1, iy1 = X0 + T, Y0 + T, X1 - T, Y1 - T
    # the upper floor (the stair's hole left open), the attic's (the ladder's)
    Hs.upper_floor(P, B, card, ix0, iy0, ix1, iy1, UP, hole=(-2.3, -2.4, -1.3, 2.45))
    Hs.upper_floor(P, B, card, ix0, iy0, ix1, iy1, ATT, hole=(2.55, -2.75, 3.45, -0.35))
    # the ceilings under them (plaster)
    for z in (UP - 0.18, ATT - 0.18):
        N.bm_box(B['paint_b'], ((ix0 + ix1) / 2, (iy0 + iy1) / 2, z - 0.06), (ix1 - ix0, iy1 - iy0, 0.02)) if False else None
    # the stair, up to the landing at the back; its rail round the hole above
    Hs.stair(P, B, card, -1.8, 2.45, -2.35, F, UP, w=0.92)
    for x in (-2.32, -1.28):
        C.post(P, 'stair_rail', (x, 2.45, F + 0.95), (x, -2.35, UP + 0.95), 0.022, 'wood', segs=6)
    for (a, b) in (((-2.3, 2.45), (-1.3, 2.45)),):
        C.post(P, 'hole_rail', (a[0], a[1], UP + 0.95), (b[0], b[1], UP + 0.95), 0.025, 'wood', segs=6)
        for x in (-2.3, -1.8, -1.3):
            C.post(P, 'hole_post', (x, 2.45, UP), (x, 2.45, UP + 0.95), 0.025, 'wood', segs=6)
    # upstairs: the bedroom's wall and the east room's, each with its door off the landing
    partition(B, card, -2.4, iy0, iy1, UP, ATT - 0.03, door=(-3.3, -2.45, 2.05))
    partition(B, card, -1.2, iy0, iy1, UP, ATT - 0.03, door=(-3.3, -2.45, 2.05))
    for (x, name, axis_y, turn) in ((-2.4, 'bed', -1, 1), (-1.2, 'room', -1, -1)):
        hy = -2.47
        dt = leaf(P, card, name, x, hy, 0.82, 2.03, UP, (0.0, axis_y), turn, mat='paint_b')
        card.door(f'DOOR_{name}', (x, hy), 0.82, dt, 90.0, UP + 2.03, (0.0, axis_y), turn, pry='none', z0=UP, secs=1.0)
    # the ship's ladder from the east room up into the attic
    Hs.stair(P, B, card, 3.0, -0.3, -2.7, UP, ATT, w=0.7)
    # ---- the ground floor's fixed things: the carpet, the TV on its stand; the kitchen's counter and its shelves
    N.bm_box(B['fabric'], (-5.6, 0.0, F + 0.004), (3.2, 2.2, 0.008))
    N.bm_box(B['wood'], (ix0 + 0.22, -0.4, F + 0.25), (0.44, 1.4, 0.5))
    N.bm_box(B['trim'], (ix0 + 0.25, -0.4, F + 0.82), (0.12, 0.9, 0.6))
    N.bm_box(B['glass'], (ix0 + 0.315, -0.4, F + 0.84), (0.005, 0.8, 0.5))
    card.box(ix0, ix0 + 0.44, -1.1, 0.3, F, F + 0.5, floor=True)
    card.spot('tv_top', ix0 + 0.22, 0.2, F + 0.5, 0)
    cx0, cx1 = 0.4, 3.4
    N.bm_box(B['paint_b'], ((cx0 + cx1) / 2, iy0 + 0.3, F + 0.44), (cx1 - cx0, 0.6, 0.88))
    N.bm_box(B['wood'], ((cx0 + cx1) / 2, iy0 + 0.32, F + 0.9), (cx1 - cx0 + 0.04, 0.66, 0.04))
    N.bm_box(B['ceramic'], (2.6, iy0 + 0.32, F + 0.85), (0.5, 0.4, 0.1))
    card.box(cx0, cx1, iy0, iy0 + 0.62, F, F + 0.92, floor=True)
    card.spot('kt_ctr_a', 1.2, iy0 + 0.32, F + 0.92, 90)
    card.spot('kt_ctr_b', 1.9, iy0 + 0.3, F + 0.92, 70)
    for k, z in enumerate((F + 1.45, F + 1.9)):
        N.bm_box(B['wood'], (ix1 - 0.13, 0.6, z), (0.26, 1.6, 0.03))
        card.box(ix1 - 0.26, ix1, -0.2, 1.4, z - 0.015, z + 0.015, floor=True)
        card.spot(f'kt_sh_{"ab"[k]}', ix1 - 0.13, 0.3 + 0.6 * k, z + 0.015, 180)
    # ---- upstairs: the bed, the closet of two compartments (two cupboard doors)
    bx0, by0 = ix0 + 0.05, -0.2
    N.bm_box(B['wood'], (bx0 + 1.03, by0 + 0.8, UP + 0.22), (2.06, 1.64, 0.16))
    N.bm_box(B['paint_b'], (bx0 + 1.03, by0 + 0.8, UP + 0.4), (2.0, 1.6, 0.2))
    N.bm_box(B['paint'], (bx0 + 1.25, by0 + 0.8, UP + 0.515), (1.6, 1.68, 0.05))
    for c in (by0 + 0.4, by0 + 1.2):
        N.bm_box(B['paint_b'], (bx0 + 0.28, c, UP + 0.56), (0.34, 0.62, 0.12))
    N.bm_box(B['wood'], (bx0 + 0.03, by0 + 0.8, UP + 0.6), (0.07, 1.76, 1.0))
    card.box(bx0, bx0 + 2.08, by0 - 0.02, by0 + 1.66, UP, UP + 0.54, floor=True)
    card.spot('bd_bed', bx0 + 1.3, by0 + 0.75, UP + 0.54, 30)
    wx0, wx1, wy0, wy1 = ix0 + 0.1, ix0 + 1.5, iy0, iy0 + 0.6
    N.bm_box(B['wood'], ((wx0 + wx1) / 2, (wy0 + wy1) / 2, UP + 1.05), (wx1 - wx0, wy1 - wy0, 2.1))
    card.box(wx0, wx1, wy0, wy1, UP, UP + 2.1)
    for j in range(2):
        a = wx0 + j * (wx1 - wx0) / 2
        name = f'cl{j}'
        hx = a + 0.01 if j == 0 else wx1 - 0.01
        axis = (1.0, 0.0) if j == 0 else (-1.0, 0.0)
        dt = leaf(P, card, name, hx, wy1 + 0.011, (wx1 - wx0) / 2 - 0.02, 1.9, UP + 0.1, axis, 1 if j == 0 else -1, mat='paint_b', thin=True)
        card.door(f'DOOR_{name}', (hx, wy1 + 0.011), (wx1 - wx0) / 2 - 0.02, dt, 95.0, UP + 2.0, axis, 1 if j == 0 else -1, pry='none', z0=UP + 0.1,
                  box=(a + 0.02, a + (wx1 - wx0) / 2 - 0.02, wy0, wy1, UP + 0.1, UP + 2.0), secs=0.4)
        card.spot(name, a + (wx1 - wx0) / 4, (wy0 + wy1) / 2, UP + 0.12, 90)
    # ---- the lights: the living room, the kitchen, the bedroom, the east room
    pendant(P, card, 'living', -5.6, 0.0, UP - 0.25, (-3.0, iy1, (0, -1)), F)
    pendant(P, card, 'kitchen', 2.0, 0.3, UP - 0.25, (-0.2, iy1, (0, -1)), F)
    pendant(P, card, 'bedroom', -5.4, 0.4, ATT - 0.25, (-2.45, -2.0, (-1, 0)), UP)
    pendant(P, card, 'room', 1.4, 0.8, ATT - 0.25, (-1.15, -2.0, (1, 0)), UP)
    # ---- the porch at the front door, its lamp; the back door's lamp
    deck_x0, deck_x1, deck_y1 = -2.9, -0.6, Y1 + 1.4
    for i in range(int((deck_x1 - deck_x0) / 0.13)):
        x = deck_x0 + (i + 0.5) * 0.13
        N.bm_box(B['wood'], (x, (Y1 + deck_y1) / 2, F - 0.015), (0.125, deck_y1 - Y1, 0.03))
    N.bm_box(B['wood'], ((deck_x0 + deck_x1) / 2, (Y1 + deck_y1) / 2, F / 2 - 0.02), (deck_x1 - deck_x0 - 0.1, deck_y1 - Y1 - 0.1, F - 0.04))
    card.box(deck_x0, deck_x1, Y1, deck_y1, G - 0.5, F, floor=True)
    N.bm_box(B['wood'], ((deck_x0 + deck_x1) / 2, deck_y1 + 0.2, F / 2), (1.2, 0.4, F / 2))
    card.box((deck_x0 + deck_x1) / 2 - 0.6, (deck_x0 + deck_x1) / 2 + 0.6, deck_y1, deck_y1 + 0.4, G - 0.5, F / 2, floor=True)
    for x in (deck_x0 + 0.08, deck_x1 - 0.08):
        C.post(P, 'porch_post', (x, deck_y1 - 0.08, G), (x, deck_y1 - 0.08, F + 2.5), 0.05, 'paint_b', segs=8)
        card.post(x, deck_y1 - 0.08, 0.06, G, F + 2.5)
    L = math.hypot(deck_y1 + 0.3 - Y1, 0.35)
    N.tin(B, (deck_x1 + 0.15, Y1, F + 2.9), (-1, 0, 0), (0.0, (deck_y1 + 0.3 - Y1) / L, -0.35 / L), deck_x1 - deck_x0 + 0.3, L, seed=0.4, rust_every=5, segs=3, rowlen=2.6)
    S.lit_panel(P, 'porch_glass', 'porch', (0.12, 0.12, 0.15), (deck_x1 + 0.25, Y1 + 0.12, F + 2.2))
    card.lamp('porch', deck_x1 + 0.25, Y1 + 0.12, F + 2.2, 6.0, hours=(18, 6), pool=F)
    S.lit_panel(P, 'back_glass', 'backdoor', (0.12, 0.12, 0.15), (1.55, Y0 - 0.12, F + 2.3))
    P.box('back_lamp_cage', (0.16, 0.08, 0.2), (1.55, Y0 - 0.08, F + 2.3), 'steel', bev=0.004)
    card.lamp('backdoor', 1.55, Y0 - 0.12, F + 2.3, 6.0, hours=(18, 6), pool=G)
    # the back door's steps
    N.bm_box(B['ceramic'], (1.55, Y0 - 0.35, F / 2), (1.2, 0.7, F))
    card.box(0.95, 2.15, Y0 - 0.7, Y0, G - 0.5, F, floor=True)
    # ---- where things stand
    for (name, x, y, z, f) in (
            ('lv_sofa', -5.6, 1.9, F, 270), ('lv_arm', -7.4, 1.7, F, 315), ('lv_table', -5.6, 0.2, F, 0), ('lv_shelf', -3.4, -2.95, F, 90),
            ('lv_fa', -7.6, -2.6, F, 40), ('lv_fb', -4.0, 1.9, F, 200), ('hl_a', -0.9, 2.3, F, 230), ('hl_b', -0.8, -2.8, F, 120),
            ('kt_table', 1.9, 1.0, F, 0), ('kt_chair_a', 1.2, 1.1, F, 0), ('kt_chair_b', 2.6, 0.95, F, 180), ('kt_stand', 3.9, -1.6, F, 180),
            ('kt_fridge', 0.0, -2.9, F, 90), ('kt_fa', 3.6, 2.3, F, 230),
            ('bd_ns', bx0 + 0.25, by0 - 0.35, UP, 90), ('bd_cab', -3.1, 2.4, UP, 270), ('bd_fa', -4.4, -1.8, UP, 30), ('bd_fb', -6.0, 2.3, UP, 150),
            ('er_table', 1.6, 2.1, UP, 0), ('er_chair', 1.6, 1.4, UP, 90), ('er_shelf', 4.15, 1.0, UP, 180), ('er_fa', 0.2, -2.6, UP, 60), ('er_fb', -0.6, 1.8, UP, 300),
            ('at_a', -7.0, -0.6, ATT, 30), ('at_b', -5.2, 0.9, ATT, 120), ('at_c', -3.0, -1.2, ATT, 210), ('at_d', -0.4, 0.6, ATT, 300),
            ('at_e', 1.6, -1.0, ATT, 60), ('at_f', 3.4, 1.2, ATT, 150), ('po_a', -1.0, Y1 + 0.7, F, 200)):
        card.spot(name, x, y, z, f)


def garage(P, B, card):
    """The garage against the house's east wall: its own walls and gable, its two doors swinging out, the workbench and
    its shelves, the tyres; its light; an electric box on its east wall outside."""
    g = Hs.House(P, B, card, 'gar', X1, Y0, GX1, Y1, 2.85, pitch=24.0, ridge='y', z0=0.05, ground=G, t=0.14)
    g.door('n', 0.45, 2.4, 'gar_l', h=2.4, hinge='lo', into=False, pry='none', mat='paint_b', open_deg=115.0, secs=1.2)
    g.door('n', 2.4, 4.35, 'gar_r', h=2.4, hinge='hi', into=False, pry='none', mat='paint_b', open_deg=115.0, secs=1.2)
    g.window('e', 2.4, 3.6, 1.1, 1.9)
    g.build(lining=False, floor=False, skip='w')
    N.bm_box(B['ceramic'], ((X1 + GX1) / 2, (Y0 + Y1) / 2, 0.025), (GX1 - X1 - 0.2, Y1 - Y0 - 0.2, 0.05))
    card.box(X1, GX1, Y0, Y1, G - 0.5, 0.05, floor=True)
    # the workbench along the back, its tool board; the shelves along the east wall; tyres
    bx = (X1 + GX1) / 2
    N.bm_box(B['wood'], (bx, Y0 + 0.5, 0.95), (3.0, 0.66, 0.06))
    for x in (bx - 1.4, bx + 1.4):
        for y in (Y0 + 0.25, Y0 + 0.75):
            N.bm_box(B['steel'], (x, y, 0.48), (0.06, 0.06, 0.9))
    N.bm_box(B['paint_b'], (bx, Y0 + 0.16, 1.55), (2.4, 0.03, 0.9))
    for k in range(8):
        C.post(P, 'tool', (bx - 1.0 + k * 0.28, Y0 + 0.19, 1.85), (bx - 1.0 + k * 0.28, Y0 + 0.19, 1.45 - 0.08 * (k % 3)), 0.012, 'steel' if k % 2 else 'trim', segs=6)
    card.box(bx - 1.5, bx + 1.5, Y0 + 0.14, Y0 + 0.84, 0.0, 0.98, floor=True)
    card.spot('gr_bench_a', bx - 0.8, Y0 + 0.5, 0.98, 90)
    card.spot('gr_bench_b', bx + 0.6, Y0 + 0.5, 0.98, 70)
    for k, z in enumerate((0.5, 1.1, 1.7)):
        N.bm_box(B['wood'], (GX1 - 0.14 - 0.25, 0.3, z), (0.5, 2.4, 0.03))
        card.spot(f'gr_sh_{"abc"[k]}', GX1 - 0.39, -0.3, z + 0.015, 180)
        card.spot(f'gr_sh_{"def"[k]}', GX1 - 0.39, 0.9, z + 0.015, 180)
    for y in (-0.9, 1.5):
        N.bm_box(B['wood'], (GX1 - 0.39, y, 1.0), (0.5, 0.04, 2.0))
    card.box(GX1 - 0.64, GX1 - 0.14, -0.92, 1.52, 0.0, 2.0)
    for z in (0.5, 1.1, 1.7):
        card.box(GX1 - 0.62, GX1 - 0.16, -0.88, 1.48, z - 0.03, z + 0.015, floor=True)
    for k in range(3):
        P.torus('tyre', 0.3, 0.11, loc=(X1 + 0.6, Y1 - 0.75, 0.17 + k * 0.23), material='rubber', segs=24, rsegs=8)
    card.post(X1 + 0.6, Y1 - 0.75, 0.42, G, 0.8)
    for k, (x, y, f) in enumerate(((6.4, 0.4, 30), (7.6, -1.6, 140), (5.8, -2.4, 260))):
        card.spot(f'gr_f{"abc"[k]}', x, y, 0.05, f)
    pendant(P, card, 'garage', bx, 0.0, 2.85, (X1 + 0.15, Y1 - 0.9, (1, 0)), 0.05)
    # the electric box outside on its east wall
    ex, ey = GX1 + 0.02, -1.6
    N.bm_box(B['steel'], (ex + 0.12, ey, 1.25), (0.24, 0.6, 0.78))
    N.bm_box(B['trim'], (ex + 0.12, ey, 1.66), (0.28, 0.64, 0.04))
    card.box(ex, ex + 0.24, ey - 0.3, ey + 0.3, 0.85, 1.65)
    card.spot('eb0', ex + 0.12, ey, 0.87, 0)
    for side, sg in (('l', -1), ('r', 1)):
        hy = ey + sg * 0.29
        since = len(P.statics)
        P.box('eb_door', (0.02, 0.29, 0.74), (ex + 0.25, ey + sg * 0.145, 1.25), 'steel', bev=0.003)
        P.box('eb_handle', (0.02, 0.02, 0.08), (ex + 0.27, ey + sg * 0.03, 1.25), 'trim', bev=None)
        P.mover(f'DOOR_eb0{side}', P.statics[since:], (ex + 0.25, hy, 0.0))
        card.door(f'DOOR_eb0{side}', (ex + 0.25, hy), 0.29, 0.02, 110.0, 1.63, (0.0, -sg), 1 if sg < 0 else -1, pry='stuck', z0=0.87,
                  box=(ex, ex + 0.24, ey - 0.3, ey + 0.3, 0.85, 1.65), secs=0.4, mat='metal')


def outside(P, B, card):
    """The yard and the back: barrels, a box, the air conditioner; the shade net over the patio, the lean-to, a pallet."""
    for k, (x, y, mat) in enumerate(((-7.6, 4.6, 'paint_b'), (-7.0, 4.9, 'rust'), (5.2, 4.4, 'paint_b'))):
        P.cyl('barrel', 0.29, 0.88, loc=(x, y, G + 0.44), material=mat, segs=18)
        for z in (0.2, 0.68):
            P.torus('barrel_rib', 0.295, 0.012, loc=(x, y, G + z), material=mat, segs=24, rsegs=4)
        card.post(x, y, 0.31, G, G + 0.9)
    N.bm_box(B['wood'], (-6.2, 5.3, 0.25), (0.7, 0.55, 0.5))
    card.box(-6.55, -5.85, 5.02, 5.58, G, 0.5, floor=True)
    card.spot('box_top', -6.2, 5.3, 0.5, 20)
    ax, ay = X0 - 0.32, -1.6
    N.bm_box(B['paint_b'], (ax, ay, F + 0.3), (0.5, 0.8, 0.6))
    P.cyl('ac_fan', 0.22, 0.02, loc=(ax - 0.255, ay, F + 0.3), material='trim', axis='X', segs=20)
    card.box(ax - 0.25, ax + 0.25, ay - 0.4, ay + 0.4, G, F + 0.6)
    # the patio behind under its shade net, on four posts
    px0, px1, py0, py1 = -6.4, -1.4, -7.3, -3.7
    for (x, y) in ((px0, py0), (px1, py0), (px0, py1 - 0.1), (px1, py1 - 0.1)):
        C.post(P, 'net_post', (x, y, G), (x, y, 2.5), 0.05, 'steel', segs=8)
        card.post(x, y, 0.06, G, 2.5)
    bm = bmesh.new()
    nx, ny = 8, 6
    vs = [[bm.verts.new((px0 + (px1 - px0) * i / nx, py0 + (py1 - 0.1 - py0) * j / ny, 2.48 - 0.18 * math.sin(math.pi * i / nx) * math.sin(math.pi * j / ny)))
           for j in range(ny + 1)] for i in range(nx + 1)]
    for i in range(nx):
        for j in range(ny):
            bm.faces.new((vs[i][j], vs[i + 1][j], vs[i + 1][j + 1], vs[i][j + 1]))
    bmesh.ops.solidify(bm, geom=bm.faces[:], thickness=0.01)
    P.mesh('shade_net', bm, 'fabric', sharp=40.0)
    N.bm_box(B['wood'], ((px0 + px1) / 2, (py0 + py1) / 2, 0.74), (1.6, 0.9, 0.05))
    card.box((px0 + px1) / 2 - 0.8, (px0 + px1) / 2 + 0.8, (py0 + py1) / 2 - 0.45, (py0 + py1) / 2 + 0.45, G, 0.765, floor=True)
    for x in ((px0 + px1) / 2 - 0.7, (px0 + px1) / 2 + 0.7):
        for y in ((py0 + py1) / 2 - 0.35, (py0 + py1) / 2 + 0.35):
            N.bm_box(B['wood'], (x, y, 0.36), (0.06, 0.06, 0.72))
    card.spot('pt_table', (px0 + px1) / 2 + 0.3, (py0 + py1) / 2, 0.765, 60)
    # the lean-to for firewood at the back west, a pallet by it
    Hs.lean_to(P, B, card, X0, -7.4, -7.0, -3.8, 2.3, 1.8, falls='s', walls='sw', ground=G, z0=0.05)
    for rw in range(3):
        for k in range(6 - rw):
            m = Matrix.Translation((-7.9, -7.0 + (k + 0.5 + rw * 0.5) * 0.17, 0.1 + rw * 0.14)) @ Matrix.Rotation(math.pi / 2, 4, 'Y')
            bm = bmesh.new()
            K.bm_cyl(bm, 0.07, 1.4, segs=6 if (k + rw) % 3 else 3, matrix=m)
            P.mesh('split_log', bm, 'wood', sharp=50.0)
    card.box(-8.6, -7.2, -7.1, -5.9, 0.05, 0.5)
    for j in range(2):
        z = j * 0.145
        for y in (-0.36, 0.0, 0.36):
            N.bm_box(B['wood'], (1.2, -6.2 + y, z + 0.05), (1.2, 0.1, 0.1))
        for x in (-0.55, -0.3, -0.05, 0.2, 0.45):
            N.bm_box(B['wood'], (1.25 + x, -6.2, z + 0.125), (0.1, 0.8, 0.022))
    card.box(0.6, 1.8, -6.6, -5.8, G, 0.29, floor=True)
    card.spot('pal_a', 1.2, -6.2, 0.29, 15)
    for k, (x, y, f) in enumerate(((-4.6, 5.6, 30), (-0.2, 6.6, 120), (3.6, 6.2, 240), (7.6, 5.6, 300), (-8.4, -2.4, 90), (3.0, -5.6, 200))):
        card.spot(f'yd_{"abcdef"[k]}', x, y, G, f)
    for k, (x, y, f) in enumerate(((-5.4, -6.4, 10), (-2.2, -5.0, 110), (-7.6, -4.4, 190), (6.6, -5.6, 280))):
        card.spot(f'bk_{"abcd"[k]}', x, y, G if x > -7 else 0.05, f)


def starter(P):
    card = N.Card('starter')
    B = N.new_set()
    house(P, B, card)
    garage(P, B, card)
    outside(P, B, card)
    N.finish_bms(P, B)
    P.views = [('a', -55, 22), ('b', 35, 25), ('c', 150, 25)]
    card.extra['plinth'] = 0.0
    movers = {d['name']: dict(move='hinge', axis='y', open=float(d['open'])) for d in card.doors}
    return card, (18.2, 15.74, 10.9), movers


TABLE = {'starter': starter}


def main(args):
    N.run(TABLE, args)
