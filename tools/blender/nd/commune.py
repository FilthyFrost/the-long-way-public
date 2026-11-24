"""
The commune's houses (docs/ND/PLAN.md, ND5): a prefab place of Nomad Drive's CommuneHouses-01 class (32.1 x 25.6 m,
8.2 m to its highest ridge; four houses about a yard — one of a 4.4 x 5.0 m room with a 1.4 x 3.2 m lean-to and a
porch 1.5 x 3.4 m on its west; one of 4.25 x 5.9 m with a 3.0 x 1.6 m entry; a hut of 3.9 x 2.8 m with a 2.1 x 1.3 m
shed; one of two storeys, its ground floor 2.45 x 3.4 m and its upper room 3.4 x 3.0 m 3.33 m up with a balcony;
pallets stacked, an air conditioner, an electric box whose doors may be stuck) in our own design:

    blender -b --factory-startup --python tools/blender/build.py -- nd/commune [commune] [--norender] [--noao] [--toon]

Four wooden houses of lap siding under tin, two painted in the commune's colour (paint), one of bare boards, the
tower's upper room white; a long table and its benches in the yard, raised beds of earth (nothing grows in them yet:
docs/ND/PLAN.md, plants are the game's own), a clothes line, a rain barrel. Its frame and its card: nd/_nd.py.
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

G = 0.0                 # the yard: the prefab's floor
F = 0.3                 # the houses' floors over it


def jit(k, a=0.0):
    return C.jit(k, a)


def porch_deck(P, B, card, x0, y0, x1, y1, z, posts, roof=None):
    """a porch's deck of boards at z on its joists, its posts, a lean-to roof over it from the house's wall"""
    n = int((y1 - y0) / 0.13)
    for i in range(n):
        y = y0 + (i + 0.5) * (y1 - y0) / n
        N.bm_box(B['wood'], ((x0 + x1) / 2, y, z - 0.015), (x1 - x0, (y1 - y0) / n - 0.006, 0.03))
    N.bm_box(B['wood'], ((x0 + x1) / 2, (y0 + y1) / 2, z - 0.1), (x1 - x0 - 0.1, y1 - y0 - 0.1, 0.12))
    card.box(x0, x1, y0, y1, G - 0.5, z, floor=True)
    for (x, y) in posts:
        C.post(P, 'porch_post', (x, y, G), (x, y, roof[2] if roof else z + 2.2), 0.05, 'paint_b', segs=8)
        card.post(x, y, 0.06, G, z + 2.2)
    if roof:
        xa, xb, za, zb = roof[0], roof[1], roof[3], roof[2]
        L = math.hypot(xb - xa, zb - za)
        d = V(((xb - xa) / L, 0.0, (zb - za) / L))
        N.tin(B, (xa, y0 - 0.15, za), (0, 1, 0), tuple(d), y1 - y0 + 0.3, L + 0.25, seed=x0, rust_every=4, segs=3, rowlen=2.6)
    # its step down to the yard
    N.bm_box(B['wood'], (x0 - 0.2, (y0 + y1) / 2, z / 2), (0.4, 1.0, z))
    card.box(x0 - 0.4, x0, (y0 + y1) / 2 - 0.5, (y0 + y1) / 2 + 0.5, G - 0.5, z / 2, floor=True)


def rail(P, pts, z0, z1, post_every=0.9):
    """a railing along a line of points: posts, a top rail and a mid rail (wood)"""
    for a, b in zip(pts[:-1], pts[1:]):
        a, b = V(a), V(b)
        L = (b - a).length
        n = max(1, int(L / post_every))
        for i in range(n + 1):
            p = a + (b - a) * (i / n)
            C.post(P, 'rail_post', (p.x, p.y, z0), (p.x, p.y, z1), 0.025, 'wood', segs=6)
        for z in (z1, (z0 + z1) / 2):
            C.post(P, 'rail', (a.x, a.y, z), (b.x, b.y, z), 0.02, 'wood', segs=6)


def h1(P, B, card):
    """House 1 by the road: its room (a door to the porch, windows round it), its lean-to kitchen through an opening
    on the east, the porch on the west; an electric box on its south wall, the rain barrel at its corner."""
    x0, y0, x1, y1 = 9.1, 4.1, 13.5, 9.1
    h = Hs.House(P, B, card, 'h1', x0, y0, x1, y1, 2.4, pitch=32.0, ridge='y', z0=F, ground=G)
    h.door('w', 1.7, 2.6, 'h1', hinge='lo')
    h.window('n', 1.4, 2.5, 0.95, 2.0, shutters=True)
    h.window('s', 1.0, 2.0, 0.95, 2.0, shutters=True)
    h.window('w', 3.6, 4.4, 1.0, 1.9)
    h.opening('e', 1.2, 2.0)
    h.build()
    # the lean-to kitchen on the east, its window to the yard
    faces = Hs.lean_to(P, B, card, x1, 5.0, 14.9, 8.2, F + 2.3, F + 1.75, falls='e', walls='nse', ground=G, z0=F,
                       holes={'e': [(1.0, 1.9, F + 1.0, F + 1.7)]})
    N.window(B, faces['e'], 1.0, 1.9, F + 1.0, F + 1.7, rows=1, cols=2)
    # the porch on the west
    porch_deck(P, B, card, 7.6, 4.9, x0, 8.3, F, [(7.68, 4.98), (7.68, 8.22)], roof=(x0, 7.45, F + 2.2, F + 2.55))
    # its light, and the switch inside the door
    h.lamp('h1', (x0 + x1) / 2, (y0 + y1) / 2, (x0 + h.t, y0 + 2.85, (1, 0)))
    # the electric box on the south wall, its two doors (stuck one time in four)
    ex, ey = 12.4, y0 - 0.02
    N.bm_box(B['steel'], (ex, ey - 0.12, F + 1.25), (0.6, 0.24, 0.78))
    N.bm_box(B['trim'], (ex, ey - 0.12, F + 1.66), (0.64, 0.28, 0.04))
    C.post(P, 'conduit', (ex, ey - 0.08, F + 1.66), (ex, ey - 0.08, F + 2.35), 0.02, 'steel', segs=6)
    card.box(ex - 0.3, ex + 0.3, ey - 0.24, ey, F + 0.85, F + 1.65)
    card.spot('eb0', ex, ey - 0.12, F + 0.87, 270)
    for side, sg in (('l', -1), ('r', 1)):
        hx2 = ex + sg * 0.29
        since = len(P.statics)
        P.box('eb_door', (0.29, 0.02, 0.74), (ex + sg * 0.145, ey - 0.25, F + 1.25), 'steel', bev=0.003)
        P.box('eb_handle', (0.02, 0.02, 0.08), (ex + sg * 0.03, ey - 0.27, F + 1.25), 'trim', bev=None)
        P.mover(f'DOOR_eb0{side}', P.statics[since:], (hx2, ey - 0.25, 0.0))
        card.door(f'DOOR_eb0{side}', (hx2, ey - 0.25), 0.29, 0.02, 110.0, F + 1.63, (-sg, 0.0), -1 if sg < 0 else 1, pry='stuck', z0=F + 0.87,
                  box=(ex - 0.3, ex + 0.3, ey - 0.24, ey, F + 0.85, F + 1.65), secs=0.4, mat='metal')
    # the rain barrel under the corner, a downpipe to it
    P.cyl('barrel', 0.3, 0.9, loc=(13.75, 9.45, G + 0.45), material='rust', segs=18)
    for z in (0.2, 0.7):
        P.torus('barrel_rib', 0.305, 0.012, loc=(13.75, 9.45, G + z), material='rust', segs=24, rsegs=4)
    card.post(13.75, 9.45, 0.32, G, G + 0.9)
    # where things stand in it, in its kitchen, on its porch
    for (name, x, y, z, f) in (('h1_table', 11.6, 7.4, F, 0), ('h1_chair_a', 10.8, 7.5, F, 0), ('h1_chair_b', 12.4, 7.3, F, 180),
                               ('h1_sofa', 10.0, 5.2, F, 90), ('h1_cab', 13.15, 4.7, F, 90), ('h1_fa', 12.4, 5.6, F, 30),
                               ('h1_fb', 10.0, 8.5, F, 200), ('h1_k_stand', 14.55, 7.6, F, 180), ('h1_k_fridge', 14.5, 5.5, F, 180),
                               ('h1_k_fa', 14.1, 6.6, F, 60), ('h1_porch_a', 8.1, 7.6, F, 0), ('h1_porch_b', 8.0, 5.4, F, 20)):
        card.spot(name, x, y, z, f)


def h2(P, B, card):
    """House 2 at the yard's west: its room of bare boards, its door on the east under a roofed entry; an air
    conditioner on its south wall."""
    x0, y0, x1, y1 = -16.0, -2.95, -11.75, 2.95
    h = Hs.House(P, B, card, 'h2', x0, y0, x1, y1, 2.5, pitch=30.0, ridge='y', z0=F, ground=G, siding='wood')
    h.door('e', 2.5, 3.4, 'h2', hinge='hi')
    h.window('w', 1.0, 2.0, 0.95, 2.0)
    h.window('w', 3.9, 4.9, 0.95, 2.0)
    h.window('n', 1.6, 2.6, 0.95, 2.0, shutters=True)
    h.window('s', 1.6, 2.6, 0.95, 2.0, shutters=True)
    h.build()
    # the entry: a deck under a lean-to, its sides boarded
    Hs.lean_to(P, B, card, x1, -1.5, -10.15, 1.5, F + 2.35, F + 2.0, falls='e', walls='ns', ground=G, z0=F)
    N.bm_box(B['wood'], (-10.0, 0.0, F / 2), (0.3, 1.2, F))
    card.box(-10.15, -9.85, -0.6, 0.6, G - 0.5, F / 2, floor=True)
    h.lamp('h2', (x0 + x1) / 2, (y0 + y1) / 2, (x1 - h.t, -0.8, (-1, 0)))
    # the air conditioner on the south wall
    ax, ay = -13.0, y0 - 0.32
    N.bm_box(B['paint_b'], (ax, ay, F + 0.4), (0.8, 0.5, 0.6))
    P.cyl('ac_fan', 0.22, 0.02, loc=(ax, ay - 0.255, F + 0.4), material='trim', axis='Y', segs=20)
    for k in range(5):
        N.bm_box(B['steel'], (ax, ay - 0.262, F + 0.22 + k * 0.09), (0.5, 0.01, 0.012))
    C.post(P, 'ac_pipe', (ax + 0.3, ay + 0.2, F + 0.65), (ax + 0.3, y0 - 0.02, F + 1.6), 0.018, 'steel', segs=6)
    card.box(ax - 0.4, ax + 0.4, ay - 0.25, ay + 0.25, G, F + 0.7)
    for (name, x, y, z, f) in (('h2_sofa', -15.4, 1.0, F, 0), ('h2_table', -14.3, -0.6, F, 90), ('h2_chair', -14.3, 0.3, F, 270),
                               ('h2_shelf', -15.55, -2.0, F, 0), ('h2_ns', -12.3, 2.4, F, 270), ('h2_fa', -13.2, -1.9, F, 40),
                               ('h2_fb', -12.6, 1.2, F, 160), ('h2_fc', -15.2, 2.3, F, 300), ('h2_v_a', -10.6, 1.0, F, 200),
                               ('h2_v_b', -10.6, -1.0, F, 120)):
        card.spot(name, x, y, z, f)


def h3(P, B, card):
    """House 3 at the back: a hut, its door to the yard, a woodshed on its east open to the yard."""
    x0, y0, x1, y1 = -6.25, -10.9, -2.35, -8.1
    h = Hs.House(P, B, card, 'h3', x0, y0, x1, y1, 2.3, pitch=33.0, ridge='x', z0=F, ground=G)
    h.door('n', 1.4, 2.3, 'h3', hinge='lo')
    h.window('n', 2.8, 3.6, 1.0, 1.8)
    h.window('w', 0.9, 1.8, 1.0, 1.8, shutters=True)
    h.build()
    Hs.lean_to(P, B, card, x1, -10.6, -0.25, -9.3, F + 2.0, F + 1.55, falls='e', walls='se', ground=G, z0=F)
    # split logs stacked in the shed
    for rw in range(3):
        for k in range(7 - rw):
            m = Matrix.Translation((-1.25, -10.42 + (k + 0.5 + rw * 0.5) * 0.17, F + 0.08 + rw * 0.14)) @ Matrix.Rotation(math.pi / 2, 4, 'Y')
            bm = bmesh.new()
            K.bm_cyl(bm, 0.07, 1.4, segs=6 if (k + rw) % 3 else 3, matrix=m)
            P.mesh('split_log', bm, 'wood', sharp=50.0)
    card.box(-1.95, -0.55, -10.5, -9.35, F, F + 0.45, floor=True)
    h.lamp('h3', (x0 + x1) / 2, (y0 + y1) / 2, (x0 + 1.2, y1 - h.t, (0, -1)))
    for (name, x, y, z, f) in (('h3_stove', -5.8, -10.45, F, 90), ('h3_table', -3.3, -9.8, F, 180), ('h3_chair', -4.0, -10.3, F, 0),
                               ('h3_fa', -5.4, -8.7, F, 300), ('h3_fb', -2.9, -8.7, F, 210), ('h3_s_a', -0.7, -9.6, F, 160),
                               ('h3_s_b', -1.9, -9.65, F + 0.45, 90)):
        card.spot(name, x, y, z, f)


def h4(P, B, card):
    """House 4: a store on the ground, a white room over it 3.33 m up overhanging it, its balcony on the west, an outside
    stair up to its door on the east and the landing there."""
    gx0, gy0, gx1, gy1 = 4.38, -10.0, 6.83, -6.6
    UP = 3.33
    g = Hs.House(P, B, card, 'h4g', gx0, gy0, gx1, gy1, UP - F, pitch=30.0, ridge='x', z0=F, ground=G, siding='wood')
    g.door('n', 0.8, 1.65, 'h4g', hinge='lo')
    g.window('w', 1.2, 2.1, 1.0, 1.8)
    g.build(roof=False)
    ux0, uy0, ux1, uy1 = 3.9, -9.8, 7.3, -6.8
    Hs.upper_floor(P, B, card, ux0, uy0, ux1, uy1, UP)
    u = Hs.House(P, B, card, 'h4u', ux0, uy0, ux1, uy1, 2.2, pitch=35.0, ridge='x', z0=UP, ground=UP - 0.2, siding='paint_b')
    u.door('e', 1.8, 2.6, 'h4u', hinge='lo')
    u.door('w', 1.0, 1.85, 'h4b', hinge='hi')
    u.window('n', 1.2, 2.2, 0.9, 1.9, shutters=True)
    u.window('s', 1.2, 2.2, 0.9, 1.9)
    u.build(floor=False, sill=False)
    # brackets under the overhangs
    for (x, xo) in ((gx0, ux0), (gx1, ux1)):
        for y in (uy0 + 0.3, uy1 - 0.3):
            C.plank(P, 'bracket', (x, y, UP - 0.9), (xo + (0.08 if xo < x else -0.08), y, UP - 0.15), 0.08, 0.08, 'wood', up=(0, 0, 1), bev=0.004, floor=False)
    # the balcony on the west
    bx0, by0, bx1, by1 = 2.8, -9.5, ux0, -7.1
    Hs.upper_floor(P, B, card, bx0, by0, bx1, by1, UP)
    rail(P, [(bx1, by0), (bx0, by0), (bx0, by1), (bx1, by1)], UP, UP + 0.95)
    for y in (by0 + 0.1, by1 - 0.1):
        C.plank(P, 'bracket', (gx0, y, UP - 1.2), (bx0 + 0.15, y, UP - 0.12), 0.08, 0.08, 'wood', up=(0, 0, 1), bev=0.004, floor=False)
    # the outside stair up the east, its landing at the door
    Hs.stair(P, B, card, 7.8, -5.1, -8.6, G, UP, w=0.9)
    Hs.upper_floor(P, B, card, 7.35, -9.6, 8.25, -8.6, UP)
    rail(P, [(7.35, -9.6), (8.25, -9.6), (8.25, -8.6)], UP, UP + 0.95)
    for (x, y) in ((8.2, -9.55), (8.2, -8.65), (7.4, -9.55)):
        C.post(P, 'landing_post', (x, y, G), (x, y, UP - 0.05), 0.05, 'wood', segs=8)
        card.post(x, y, 0.06, G, UP)
    for sg in (-1, 1):
        x = 7.8 + sg * 0.47
        C.post(P, 'stair_rail', (x, -5.1, G + 0.95), (x, -8.6, UP + 0.95), 0.02, 'wood', segs=6)
        for t in (0.25, 0.5, 0.75):
            yy = -5.1 + (-8.6 + 5.1) * t
            zz = G + (UP - G) * t
            C.post(P, 'stair_baluster', (x, yy, zz), (x, yy, zz + 0.95), 0.02, 'wood', segs=6)
    u.lamp('h4', (ux0 + ux1) / 2, (uy0 + uy1) / 2, (ux1 - u.t, -8.4, (-1, 0)))
    for (name, x, y, z, f) in (('h4_g_a', 5.0, -9.4, F, 30), ('h4_g_b', 6.3, -9.5, F, 120), ('h4_g_c', 5.2, -7.5, F, 250),
                               ('h4_u_ns', 4.3, -9.4, UP, 90), ('h4_u_a', 5.9, -9.35, UP, 90), ('h4_u_b', 4.6, -7.3, UP, 300),
                               ('h4_u_c', 6.6, -7.4, UP, 200), ('h4_bal_a', 3.3, -8.6, UP, 0), ('h4_bal_b', 3.2, -7.4, UP, 60)):
        card.spot(name, x, y, z, f)


def yard(P, B, card):
    """The yard: the long table and its benches, the raised beds, pallets stacked, a clothes line; its spots."""
    # the long table and two benches
    tx0, tx1, ty0, ty1 = -3.2, -0.6, 1.5, 2.4
    N.bm_box(B['wood'], ((tx0 + tx1) / 2, (ty0 + ty1) / 2, 0.74), (tx1 - tx0, ty1 - ty0, 0.05))
    for x in (tx0 + 0.15, tx1 - 0.15):
        for y in (ty0 + 0.12, ty1 - 0.12):
            N.bm_box(B['wood'], (x, y, 0.36), (0.08, 0.08, 0.72))
    card.box(tx0, tx1, ty0, ty1, G, 0.765, floor=True)
    for y in (ty0 - 0.42, ty1 + 0.42):
        N.bm_box(B['wood'], ((tx0 + tx1) / 2, y, 0.44), (tx1 - tx0 - 0.2, 0.3, 0.04))
        for x in (tx0 + 0.25, tx1 - 0.25):
            N.bm_box(B['wood'], (x, y, 0.21), (0.06, 0.24, 0.42))
        card.box(tx0 + 0.1, tx1 - 0.1, y - 0.15, y + 0.15, G, 0.46, floor=True)
    for k, x in enumerate((-2.85, -2.25, -1.65, -1.2, -0.85)):
        card.spot(f'tbl_{"abcde"[k]}', x, (ty0 + ty1) / 2 + 0.15 * jit(k, 1.0), 0.765, 360 * jit(k, 2.0))
    # the raised beds: a frame of boards round a bed of earth
    for k, (cx, cy) in enumerate(((-9.0, -4.6), (-6.6, -4.6), (-0.9, -4.9), (1.5, -4.9))):
        w, d, h = 1.2, 2.6, 0.34
        for (sx, sy, lx, ly) in ((0, -d / 2, w, 0.05), (0, d / 2, w, 0.05), (-w / 2, 0, 0.05, d), (w / 2, 0, 0.05, d)):
            N.bm_box(B['wood'], (cx + sx, cy + sy, h / 2), (lx + 0.05, ly + 0.05, h))
        N.bm_box(B['rust'], (cx, cy, h - 0.05), (w - 0.05, d - 0.05, 0.06))
        for j in range(4):
            N.bm_box(B['trim'], (cx + 0.3 * jit(k * 4 + j, 3.0), cy - 0.9 + j * 0.6, h - 0.015), (0.5, 0.06, 0.012))
        card.box(cx - w / 2, cx + w / 2, cy - d / 2, cy + d / 2, G, h, floor=True)
        card.spot(f'bed{k}_a', cx, cy - 0.6, h - 0.02, 90 + 20 * jit(k, 4.0))
        card.spot(f'bed{k}_b', cx + 0.75, cy + 0.5, G, 180 + 40 * jit(k, 5.0))
    # pallets stacked
    for k, (cx, cy, n) in enumerate(((-9.2, 8.6, 4), (2.2, 9.7, 3))):
        for j in range(n):
            z = j * 0.145
            for y in (-0.36, 0.0, 0.36):
                N.bm_box(B['wood'], (cx, cy + y, z + 0.05), (1.2, 0.1, 0.1))
            for x in (-0.55, -0.3, -0.05, 0.2, 0.45):
                N.bm_box(B['wood'], (cx + x + 0.05, cy, z + 0.125), (0.1, 0.8, 0.022))
        card.box(cx - 0.6, cx + 0.6, cy - 0.4, cy + 0.4, G, n * 0.145, floor=True)
        card.spot(f'pal_{"ab"[k]}', cx, cy, n * 0.145, 30 + 50 * k)
    # the clothes line between two posts, two things on it
    a, b = V((-11.0, -6.6, 0.0)), V((-7.6, -7.9, 0.0))
    for p in (a, b):
        C.post(P, 'line_post', p, p + V((0, 0, 1.8)), 0.045, 'wood', segs=8)
        card.post(p.x, p.y, 0.06, G, 1.8)
    C.post(P, 'line', a + V((0, 0, 1.72)), b + V((0, 0, 1.72)), 0.004, 'fabric', segs=4)
    d = (b - a).normalized()
    for t, (w, hh, m) in ((0.3, (0.5, 0.6, 'paint')), (0.66, (0.4, 0.45, 'paint_b'))):
        p = a + (b - a) * t + V((0, 0, 1.72 - hh / 2))
        bm = bmesh.new()
        K.bm_cube(bm, (w, 0.012, hh), matrix=Matrix.Translation(p) @ Matrix.Rotation(math.atan2(d.y, d.x), 4, 'Z'))
        P.mesh('laundry', bm, m, sharp=40.0)
    # the yard's own spots, about it
    for k, (x, y, f) in enumerate(((-6.0, 3.5, 20), (3.0, 3.0, 140), (-12.6, 6.4, 260), (6.5, 6.5, 80), (-8.5, -9.3, 200),
                                   (9.5, -6.5, 330), (-3.5, -6.6, 100), (13.0, 2.2, 250))):
        card.spot(f'gr_{"abcdefgh"[k]}', x, y, G, f)
    card.spot('roof_a', -13.9, 1.4, F + 2.5 + 1.0, 90)


def commune(P):
    card = N.Card('commune')
    B = N.new_set()
    h1(P, B, card)
    h2(P, B, card)
    h3(P, B, card)
    h4(P, B, card)
    yard(P, B, card)
    N.finish_bms(P, B)
    P.views = [('a', -55, 28), ('b', 35, 30), ('c', 150, 28)]
    card.extra['plinth'] = 0.0
    movers = {d['name']: dict(move='hinge', axis='y', open=float(d['open'])) for d in card.doors}
    return card, (32.1, 25.6, 8.2), movers


TABLE = {'commune': commune}


def main(args):
    N.run(TABLE, args)
