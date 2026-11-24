"""
The ND furniture (docs/ND/PLAN.md, ND1 and ND4): what Nomad Drive furnishes its houses with — a table, chairs, a
sofa, a bookshelf, a fridge, a kitchen stand and the cabinet over it — in our own design, at its sizes (the
research's 227 items: Table-01 0.87 x 0.68 m, Chair 0.94 m high, Sofa-01 1.59 m long, Bookshelf-01 0.78 x 1.48 m,
Fridge-02 0.64 x 1.33 m, kitchen stand 01 1.42 m long, Kitchen-top cabinet), as items one can carry back to the
vehicle:

    blender -b --factory-startup --python tools/blender/build.py -- items/nd_home [<model>|all] [--look] [--norender]

The junk script's conventions (items/junk.py): public/models/modcar/items/<model>.glb, root mesh PART, origin at
the bottom centre, x forward (its front), resting on z = 0; conventional material names only; `paint` and
`paint_b` take the item's two colours. What opens is a child of its own named P_<what> (P_door, P_door_a,
P_drawer_a), its origin on its hinge line (a door) or at its middle (a drawer): the game turns a door about its
up axis, pulls a drawer out along its x.
"""
import math

import bmesh
from mathutils import Matrix

from parts import _kit as K
from parts._kit import V, mat4
from items import junk as J

OUT = 'public/models/modcar/items'
TAU = math.tau

# the colours of the item that uses each model (src/core/v3/nd/items.ts), for the --look previews only
COLORS = {
    'nd_table': (0x7f9a86, 0xe9dcc0), 'nd_chair': (0xb08a5a, 0xc9a86a), 'nd_sofa': (0x7b8f6a, 0xd9b26a),
    'nd_bookshelf': (0xe6d6b4, 0x8a5a3c), 'nd_fridge': (0xe9e2cf, 0x6c8fae), 'nd_kitchen_stand': (0x8fb0a6, 0xf1e8d4),
    'nd_top_cabinet': (0x8fb0a6, 0xf1e8d4), 'nd_cot': (0x557a46, 0xede3c8),
}


def jit(k, a=0.0):
    """A repeatable wobble in −1 … 1."""
    x = math.sin(k * 127.1 + a * 311.7) * 43758.5453
    return (x - math.floor(x)) * 2 - 1


def panel(P, name, x, y0, y1, z0, z1, mat='paint', t=0.022, frame=0.055, sink=0.007):
    """A shaker front standing in the plane x (its face at x + t/2): two stiles and two rails round a sunk panel."""
    w, h = y1 - y0, z1 - z0
    yc, zc = (y0 + y1) / 2, (z0 + z1) / 2
    # (the sunk panel cut into a grid: its vertex AO is not decided by corners hidden under the frame)
    P.mesh(name + '_pnl', J.slab((t * 0.55, w - 2 * frame + 0.004, h - 2 * frame + 0.004), (x - t / 2 + t * 0.275 - sink * 0.1, yc, zc),
                                 step=0.05, axes=(1, 2)), mat, bev=0.002, segs=1)
    for yy in (y0 + frame / 2, y1 - frame / 2):
        P.box(name + '_stile', (t, frame, h), (x, yy, zc), mat, bev=0.004, segs=2)
    for zz in (z0 + frame / 2, z1 - frame / 2):
        P.box(name + '_rail', (t, w - 2 * frame + 0.002, frame), (x, yc, zz), mat, bev=0.004, segs=2)


def knob(P, x, y, z, mat='ceramic', r=0.017):
    """A round knob on a front facing +x."""
    P.lathe('knob', [(0.0, 0.0), (r * 0.45, 0.0), (r * 0.42, r * 0.6), (r, r * 1.05), (r * 0.95, r * 1.45), (r * 0.5, r * 1.62),
                     (0.0, r * 1.65)], loc=(x, y, z), material=mat, axis='X', segs=14, sharp=70.0)


def pull(P, x, y, z, w=0.11, mat='alu'):
    """A cup pull (a drawer's) on a front facing +x."""
    P.box('pull_plate', (0.006, w, 0.03), (x + 0.003, y, z + 0.004), mat, bev=0.002, segs=1)
    bm = bmesh.new()
    prof = [(0.0, -w / 2), (0.022, -w / 2 + 0.008), (0.026, 0.0), (0.022, w / 2 - 0.008), (0.0, w / 2)]
    for i in range(len(prof) - 1):
        a, b = prof[i], prof[i + 1]
        K.bm_cube(bm, (0.006, abs(b[1] - a[1]) + 0.002, 0.026),
                  matrix=Matrix.Translation((x + (a[0] + b[0]) / 2, y + (a[1] + b[1]) / 2, z - 0.006)))
    P.mesh('pull_cup', bm, mat, bev=0.002, segs=1)


def mark_since(P):
    return len(P.statics)


# ------------------------------------------------------------------------------------------------ the table

def nd_table(P):
    """A farmhouse table (Nomad Drive's dining tables, 0.87 x 0.68, 0.76 m high): a top of five planks between
    breadboard ends (wood, a little uneven), a painted base — square legs tapering to the floor, an apron with a
    drawer in its front, low stretchers."""
    P.ao_distance = 0.18
    W, L, H, th = 0.72, 1.14, 0.76, 0.042
    n, gap, ends = 5, 0.004, 0.075
    pw = (W - gap * (n - 1)) / n
    for i in range(n):
        x = -W / 2 + pw / 2 + i * (pw + gap)
        P.box('plank', (pw - 0.002 * abs(jit(i)), L - 2 * ends - 0.004, th - 0.004 * abs(jit(i, 3))),
              (x, 0.0, H - th / 2 - 0.002 * abs(jit(i, 5))), 'wood', bev=0.005, segs=2)
    for s in (-1, 1):
        P.box('breadboard', (W + 0.012, ends, th + 0.004), (0.0, s * (L / 2 - ends / 2), H - th / 2 - 0.002), 'wood', bev=0.007,
              segs=2)
        for i in range(3):
            P.cyl('peg', 0.008, 0.004, loc=(-W / 3 + i * W / 3, s * (L / 2 - ends / 2), H + 0.0005), material='wood', segs=8)
    za, ha = H - th - 0.06, 0.12
    lx, ly = W / 2 - 0.075, L / 2 - 0.11
    for sx in (-1, 1):
        for sy in (-1, 1):
            J.bar(P, 'leg', (sx * lx, sy * ly, H - th), (sx * (lx - 0.006), sy * (ly - 0.006), 0.0), 0.062, 0.062, 'paint',
                  x_hint=(1, 0, 0), bev=0.006, taper=0.66)
    # the apron, the drawer in the front one
    P.box('apron_back', (0.024, 2 * ly - 0.05, ha), (-lx, 0.0, za), 'paint', bev=0.004)
    P.box('apron_side', (2 * lx - 0.05, 0.024, ha), (0.0, -ly, za), 'paint', bev=0.004)
    P.box('apron_side', (2 * lx - 0.05, 0.024, ha), (0.0, ly, za), 'paint', bev=0.004)
    dw = 0.42
    for (y0, y1) in ((-ly + 0.025, -dw / 2 - 0.006), (dw / 2 + 0.006, ly - 0.025)):
        P.box('apron_front', (0.024, y1 - y0, ha), (lx, (y0 + y1) / 2, za), 'paint', bev=0.004)
    P.box('apron_top', (0.024, dw + 0.01, 0.022), (lx, 0.0, za + ha / 2 - 0.011), 'paint', bev=0.003)
    since = mark_since(P)
    P.box('drawer_front', (0.022, dw - 0.008, ha - 0.03), (lx + 0.004, 0.0, za - 0.012), 'paint_b', bev=0.004, segs=2)
    knob(P, lx + 0.015, 0.0, za - 0.012, 'ceramic', 0.015)
    P.box('drawer_box', (0.5, dw - 0.04, 0.008), (lx - 0.25, 0.0, za - ha / 2 + 0.012), 'wood', bev=0.002, segs=1)
    for s in (-1, 1):
        P.box('drawer_side', (0.5, 0.01, ha - 0.05), (lx - 0.25, s * (dw / 2 - 0.025), za - 0.02), 'wood', bev=0.002, segs=1)
    P.box('drawer_back', (0.01, dw - 0.04, ha - 0.05), (lx - 0.495, 0.0, za - 0.02), 'wood', bev=0.002, segs=1)
    P.mover('P_drawer', P.statics[since:], (lx, 0.0, za))
    # an H of stretchers low down
    for sy in (-1, 1):
        J.bar(P, 'stretcher', (-lx + 0.01, sy * (ly - 0.004), 0.15), (lx - 0.01, sy * (ly - 0.004), 0.15), 0.034, 0.03, 'paint',
              x_hint=(0, 0, 1), bev=0.004)
    J.bar(P, 'stretcher_mid', (0.0, -ly + 0.01, 0.17), (0.0, ly - 0.01, 0.17), 0.034, 0.03, 'paint', x_hint=(0, 0, 1), bev=0.004)
    P.views = [('a', 30, 22), ('b', 200, 30)]


# ------------------------------------------------------------------------------------------------ the chair

def nd_chair(P):
    """A ladder-back chair (Nomad Drive's Chair, 0.94 m high): turned legs, the back posts running up to round
    finials and leaning back a little, three bent slats between them, a woven rush seat on its rails, turned
    rungs low down."""
    P.ao_distance = 0.1
    zs = 0.45
    fx, bx, hy = 0.19, -0.18, 0.2
    leg = [(0.0, 0.0), (0.016, 0.0), (0.019, 0.03), (0.017, 0.07), (0.021, 0.14), (0.018, 0.2), (0.022, 0.28), (0.02, 0.36),
           (0.021, 0.43), (0.02, zs)]
    for s in (-1, 1):
        P.lathe('leg', leg, loc=(fx, s * hy, 0.0), material='paint', segs=10, sharp=60.0)
    top = 0.95
    lean = 0.05
    for s in (-1, 1):
        a = V((bx, s * hy, 0.0))
        b = V((bx - lean, s * (hy - 0.006), top - 0.04))
        L = (b - a).length
        prof = [(0.0, 0.0), (0.017, 0.0), (0.02, 0.04), (0.018, 0.12), (0.021, 0.3), (0.019, 0.44), (0.02, 0.6), (0.018, 0.8),
                (0.019, L - 0.03), (0.014, L - 0.01), (0.02, L + 0.005), (0.022, L + 0.022), (0.016, L + 0.04), (0.0, L + 0.045)]
        P.lathe('post', prof, loc=tuple(a), material='paint', axis=(b - a), segs=10, sharp=60.0)

    def post_x(z):
        return bx - lean * z / (top - 0.04)

    for i, z in enumerate((0.6, 0.72, 0.84)):
        bm = J.slab((0.016, 2 * hy - 0.02, 0.07 - 0.008 * i), step=0.05, axes=(1,))
        J.bend_y(bm, 0.55)
        K.bm_transform(bm, mat4((post_x(z) - 0.02, 0.0, z), (0, -math.degrees(math.atan2(lean, top)), 0)))
        P.mesh('slat', bm, 'paint', bev=0.004, segs=2)
    # the seat: four rails, the rush woven over them (ridges across, a little domed)
    for (a, b) in (((fx, -hy, zs), (fx, hy, zs)), ((bx, -hy, zs), (bx, hy, zs)), ((bx, -hy, zs), (fx, -hy, zs)),
                   ((bx, hy, zs), (fx, hy, zs))):
        P.tube('seat_rail', [a, b], 0.014, 'paint', segs=8)
    P.pleats('rush', 2 * hy - 0.01, fx - bx - 0.02, 14, 0.012, loc=((fx + bx) / 2, 0.0, zs + 0.006), material='fabric')
    P.box('rush_under', (fx - bx - 0.02, 2 * hy - 0.02, 0.012), ((fx + bx) / 2, 0.0, zs - 0.004), 'fabric', bev=0.004, segs=1)
    # rungs
    for z, pairs in ((0.14, (((fx, -hy), (fx, hy)), ((bx, -hy), (bx, hy)))), (0.2, (((bx, -hy), (fx, -hy)), ((bx, hy), (fx, hy))))):
        for (a, b) in pairs:
            P.tube('rung', [(a[0], a[1], z), (b[0], b[1], z)], 0.0105, 'paint', segs=8)
    P.views = [('a', 35, 16), ('b', 215, 18)]


# ------------------------------------------------------------------------------------------------ the sofa

def nd_sofa(P):
    """A two-seat sofa (Nomad Drive's Sofa-01, 1.59 m long): rolled arms, two plump seat cushions and two back
    cushions leaning on its back, piping along the edges, turned wooden feet; a throw pillow in one corner."""
    P.ao_distance = 0.25
    D, L = 0.82, 1.56
    for sx in (-1, 1):
        for sy in (-1, 1):
            P.lathe('foot', [(0.0, 0.0), (0.022, 0.0), (0.027, 0.03), (0.032, 0.07), (0.036, 0.1), (0.0, 0.1)],
                    loc=(sx * (D / 2 - 0.08), sy * (L / 2 - 0.08), 0.0), material='wood', segs=12, sharp=60.0)
    P.pillow('base', (D - 0.04, L - 0.06, 0.2), loc=(0.0, 0.0, 0.2), material='paint', r=0.035, puff=0.008)
    P.box('rail', (0.03, L - 0.24, 0.06), (D / 2 - 0.03, 0.0, 0.13), 'wood', bev=0.008, segs=2)
    # the back and its cushions
    P.pillow('back', (0.2, L - 0.06, 0.5), loc=(-D / 2 + 0.11, 0.0, 0.53), rot=(0, -6, 0), material='paint', r=0.05, puff=0.012)
    for s in (-1, 1):
        P.pillow('back_cushion', (0.17, 0.6, 0.38), loc=(-D / 2 + 0.26, s * 0.33, 0.58), rot=(0, -13, s * 2), material='paint',
                 r=0.06, puff=0.03)
        P.pillow('seat_cushion', (0.6, 0.62, 0.15), loc=(0.03, s * 0.33, 0.37), rot=(0, 0, 0), material='paint', r=0.05,
                 puff=0.025)
    # the rolled arms
    for s in (-1, 1):
        y = s * (L / 2 - 0.1)
        P.pillow('arm', (D - 0.06, 0.18, 0.3), loc=(0.0, y, 0.44), material='paint', r=0.04, puff=0.01)
        P.cyl('arm_roll', 0.1, D - 0.04, loc=(0.0, y + s * 0.01, 0.6), material='paint', axis='X', segs=20, bev=0.02)
        P.cyl('arm_face', 0.085, 0.02, loc=(D / 2 - 0.01, y + s * 0.01, 0.6), material='paint', axis='X', segs=20, bev=0.008)
        P.torus('piping', 0.1, 0.008, loc=(D / 2 - 0.022, y + s * 0.01, 0.6), material='paint_b', axis='X', segs=24, rsegs=5)
    P.pillow('throw', (0.12, 0.34, 0.32), loc=(-0.12, 0.5, 0.6), rot=(4, -18, 30), material='paint_b', r=0.06, puff=0.03)
    P.views = [('a', 30, 20), ('b', 160, 25)]


# ------------------------------------------------------------------------------------------------ the cot

def nd_cot(P):
    """A folding camp cot (docs/V3/plan/rv.md R3: a bed to put in a motorhome, the Camel's): two aluminium side rails, the
    end bars, three folding U-legs of tube with rubber feet, the canvas laced between the rails, sagging a little, and a
    pillow at its head. 0.70 x 1.90 m (its length along y, as the sofa's), the canvas 0.40 up."""
    P.ao_distance = 0.2
    W, L, H = 0.70, 1.90, 0.40
    for sx in (-1, 1):
        P.tube('rail', [(sx * W / 2, -L / 2, H - 0.012), (sx * W / 2, L / 2, H - 0.012)], 0.016, 'alu', segs=12, bend=0.0)
    for sy in (-1, 1):
        P.tube('end', [(-W / 2, sy * L / 2, H - 0.012), (W / 2, sy * L / 2, H - 0.012)], 0.014, 'alu', segs=12, bend=0.0)
        for sx in (-1, 1):
            P.sphere('corner', 0.019, loc=(sx * W / 2, sy * L / 2, H - 0.012), material='alu', u=12, v=6)
    for y in (-L / 2 + 0.16, 0.0, L / 2 - 0.16):
        pts = [(-W / 2 + 0.01, y, H - 0.03), (-W / 2 + 0.06, y - 0.04, 0.018), (W / 2 - 0.06, y - 0.04, 0.018), (W / 2 - 0.01, y, H - 0.03)]
        P.tube('leg', pts, 0.012, 'alu', segs=10, bend=0.05)
        for sx in (-1, 1):
            P.cyl('foot', 0.016, 0.02, (sx * (W / 2 - 0.06), y - 0.04, 0.01), 'rubber', segs=12, bev=None)
            P.cyl('hinge', 0.02, 0.03, (sx * W / 2, y, H - 0.03), 'steel', axis='X', segs=12, bev=None)
    # the canvas: a sheet between the rails, sagging towards its middle, its hem round the rails
    bm = K.bm_new() if hasattr(K, 'bm_new') else bmesh.new()
    nx, ny = 8, 24
    verts = {}
    for i in range(nx + 1):
        for j in range(ny + 1):
            x = -W / 2 + 0.012 + (W - 0.024) * i / nx
            y = -L / 2 + 0.02 + (L - 0.04) * j / ny
            sag = 0.035 * (1 - (2 * (i / nx) - 1) ** 2) * (1 - (2 * (j / ny) - 1) ** 4)
            verts[(i, j)] = bm.verts.new((x, y, H - 0.006 - sag))
    for i in range(nx):
        for j in range(ny):
            bm.faces.new((verts[(i, j)], verts[(i + 1, j)], verts[(i + 1, j + 1)], verts[(i, j + 1)]))
    bmesh.ops.solidify(bm, geom=bm.faces[:], thickness=0.006)
    P.mesh('canvas', bm, 'paint', bev=None, sharp=60.0)
    for sx in (-1, 1):
        P.tube('hem', [(sx * (W / 2 - 0.004), -L / 2 + 0.02, H - 0.004), (sx * (W / 2 - 0.004), L / 2 - 0.02, H - 0.004)], 0.02, 'paint', segs=10, bend=0.0)
    P.pillow('pillow', (0.38, 0.30, 0.09), loc=(0.0, -L / 2 + 0.24, H + 0.025), material='paint_b', r=0.035, puff=0.02)
    P.views = [('a', 30, 25), ('b', 150, 30)]


# ------------------------------------------------------------------------------------------------ the bookshelf

BOOK_MATS = ('paint_b', 'leather', 'fabric', 'ceramic', 'trim', 'rust', 'wood', 'paint_b', 'leather', 'fabric')


def books(P, bm_by, x0, y0, y1, z, k, depth=0.19):
    """A run of books standing on a shelf from y0 to y1 (their spines at x0), the last leaning."""
    y = y0
    i = 0
    while y < y1 - 0.03:
        w = 0.022 + 0.022 * (0.5 + 0.5 * jit(k * 37 + i, 1.0))
        h = 0.17 + 0.08 * (0.5 + 0.5 * jit(k * 11 + i, 2.0))
        d = depth - 0.03 * (0.5 + 0.5 * jit(k + i, 4.0))
        if y + w > y1:
            break
        mat = BOOK_MATS[int((jit(k * 5 + i, 7.0) + 1) * 5) % len(BOOK_MATS)]
        lean = 0.0
        if y + w + 0.06 > y1 - 0.03 and i > 2:
            lean = 18.0
        m = mat4((x0 - d / 2, y + w / 2 + (h / 2 * math.sin(math.radians(lean))), z + h / 2 * math.cos(math.radians(lean))),
                 (lean, 0, 0))
        K.bm_cube(bm_by[mat], (d, w, h), matrix=m)
        # (a band on the spine of one in three)
        if i % 3 == 1:
            K.bm_cube(bm_by['paint_b' if mat != 'paint_b' else 'trim'], (0.004, w + 0.001, 0.014),
                      matrix=m @ Matrix.Translation((d / 2, 0, h * 0.28)))
        y += w + 0.001
        i += 1
        if lean:
            break


def nd_bookshelf(P):
    """A painted bookshelf (Nomad Drive's Bookshelf-01, 0.78 x 1.48 m): two sides, a top with a moulded lip, a
    plinth, four shelves, a boarded back (wood); books on three shelves, some leaning, a stack lying flat, a jar."""
    P.ao_distance = 0.22
    D, W, H = 0.32, 0.8, 1.52
    for s in (-1, 1):
        P.box('side', (D, 0.024, H - 0.03), (0.0, s * (W / 2 - 0.012), (H - 0.03) / 2), 'paint', bev=0.004, segs=2)
    P.box('top', (D + 0.02, W + 0.03, 0.026), (0.006, 0.0, H - 0.017), 'paint', bev=0.005, segs=2)
    P.box('lip', (D + 0.04, W + 0.05, 0.022), (0.01, 0.0, H - 0.002), 'paint', bev=0.008, segs=2)
    P.box('plinth', (0.03, W - 0.048, 0.08), (D / 2 - 0.03, 0.0, 0.04), 'paint', bev=0.004)
    shelves = (0.085, 0.44, 0.8, 1.16)
    for z in shelves:
        P.box('shelf', (D - 0.02, W - 0.046, 0.022), (-0.005, 0.0, z), 'paint', bev=0.004, segs=2)
    n = 6
    for i in range(n):
        y = -W / 2 + 0.024 + (i + 0.5) * (W - 0.048) / n
        P.box('back', (0.01, (W - 0.048) / n - 0.003, H - 0.05), (-D / 2 + 0.008, y, (H - 0.05) / 2 + 0.01), 'wood', bev=0.002,
              segs=1)
    bm_by = {m: bmesh.new() for m in set(BOOK_MATS) | {'trim', 'paint_b'}}
    x0 = D / 2 - 0.03
    books(P, bm_by, x0, -W / 2 + 0.03, W / 2 - 0.03, shelves[0] + 0.011, 1)
    books(P, bm_by, x0, -W / 2 + 0.03, 0.12, shelves[1] + 0.011, 2)
    books(P, bm_by, x0, -W / 2 + 0.2, W / 2 - 0.03, shelves[2] + 0.011, 3)
    # a stack lying flat on the second shelf, a jar on the top one
    for i in range(3):
        K.bm_cube(bm_by[('leather', 'paint_b', 'fabric')[i]], (0.2 - 0.02 * i, 0.15 - 0.01 * i, 0.035),
                  matrix=mat4((x0 - 0.11, 0.25, shelves[1] + 0.011 + 0.0175 + i * 0.035), (0, 0, 6 * jit(i))))
    for mat, bm in bm_by.items():
        if bm.verts:
            P.mesh('books', bm, mat, bev=0.003, segs=1, sharp=40.0)
        else:
            bm.free()
    P.lathe('jar', [(0.0, 0.0), (0.045, 0.0), (0.05, 0.02), (0.05, 0.11), (0.034, 0.13), (0.032, 0.145), (0.0, 0.145)],
            loc=(0.0, 0.22, shelves[3] + 0.011), material='glass', segs=16, sharp=50.0)
    P.cyl('jar_lid', 0.036, 0.02, loc=(0.0, 0.22, shelves[3] + 0.011 + 0.155), material='alu', segs=16, bev=0.003)
    P.views = [('a', 30, 12), ('b', 150, 20)]


# ------------------------------------------------------------------------------------------------ the fridge

def rounded_profile(x0, x1, z0, z1, r, n=6, front=True, back=True):
    """A side outline (x, z) with its top corners rounded by r: the front one, the back one or both."""
    pts = [(x0, z0), (x1, z0)]
    if front:
        for k in range(n + 1):
            a = k / n * math.pi / 2
            pts.append((x1 - r + r * math.cos(a), z1 - r + r * math.sin(a)))
    else:
        pts.append((x1, z1))
    if back:
        for k in range(n + 1):
            a = math.pi / 2 + k / n * math.pi / 2
            pts.append((x0 + r + r * math.cos(a), z1 - r + r * math.sin(a)))
    else:
        pts.append((x0, z1))
    return pts


def side_prism(P, name, prof, y0, y1, mat, bev=0.006):
    """An outline in (x, z) made a solid from y0 to y1."""
    bm = bmesh.new()
    K.bm_prism(bm, prof, y1 - y0, matrix=mat4((0.0, (y0 + y1) / 2, 0.0), (90, 0, 0)))
    long = [e for e in bm.edges if (e.verts[0].co - e.verts[1].co).length > 0.2]
    if long:
        bmesh.ops.subdivide_edges(bm, edges=long, cuts=4, use_grid_fill=True)
    big = [f for f in bm.faces if len(f.verts) > 4]
    if big:
        bmesh.ops.poke(bm, faces=big)
    # (bm_prism extrudes along its local z: turned by 90 about x it runs along −y; centred, so either way)
    return P.mesh(name, bm, mat, bev=bev, segs=2, sharp=35.0)


def nd_fridge(P):
    """A rounded-top refrigerator (Nomad Drive's Fridge-02, 0.64 x 0.73 x 1.33 m): an enamelled body (paint) with
    its top's front and back rounded, a deep door with its liner and two shelves in it, a chrome lever handle, a
    badge, a kick grille and four feet. Inside, white enamel, two wire shelves and a crisper drawer."""
    P.ao_distance = 0.3
    D, W, H, R = 0.62, 0.64, 1.36, 0.11
    x0, x1 = -D / 2, D / 2 - 0.06
    body = side_prism(P, 'body', rounded_profile(x0, x1, 0.06, H, R, front=False), -W / 2, W / 2, 'paint')
    cav = bmesh.new()
    K.bm_cube(cav, (D - 0.1, W - 0.08, H - 0.24), matrix=Matrix.Translation((x1 - (D - 0.1) / 2 + 0.02, 0.0, 0.12 + (H - 0.24) / 2)))
    P.cut(body, cav)
    # the cabinet's inside: wire shelves, the crisper, the lamp's little box
    xi0, xi1 = x1 - (D - 0.1) + 0.02, x1 - 0.01
    for z in (0.52, 0.86):
        for k in range(9):
            y = -W / 2 + 0.06 + k * (W - 0.12) / 8
            P.box('wire', (xi1 - xi0 - 0.03, 0.005, 0.005), ((xi0 + xi1) / 2, y, z), 'alu', bev=None)
        P.box('wire_front', (0.008, W - 0.1, 0.008), (xi1 - 0.02, 0.0, z), 'alu', bev=0.002, segs=1)
    P.box('crisper', (xi1 - xi0 - 0.04, W - 0.12, 0.16), ((xi0 + xi1) / 2 - 0.01, 0.0, 0.21), 'glass_dark', bev=0.01, segs=2)
    P.box('crisper_lip', (0.02, W - 0.12, 0.03), (xi1 - 0.03, 0.0, 0.29), 'paint_b', bev=0.006, segs=2)
    P.box('lamp_box', (0.08, 0.1, 0.05), (xi0 + 0.06, 0.0, H - 0.14), 'ceramic', bev=0.008, segs=2)
    # the kick grille, the feet
    P.box('kick', (0.02, W - 0.1, 0.05), (x1 - 0.015, 0.0, 0.035), 'trim', bev=0.004)
    for k in range(6):
        P.box('kick_slot', (0.004, W - 0.16, 0.005), (x1 - 0.004, 0.0, 0.02 + k * 0.006), 'steel', bev=None)
    for sx in (x0 + 0.06, x1 - 0.06):
        for sy in (-1, 1):
            P.cyl('foot', 0.022, 0.06, loc=(sx, sy * (W / 2 - 0.06), 0.03), material='trim', segs=10)
    # the door: its own rounded top, the liner (ceramic) and its shelves inside, the handle and badge outside
    since = mark_since(P)
    hy = -W / 2 + 0.005
    side_prism(P, 'door', rounded_profile(x1, x1 + 0.07, 0.065, H, R * 0.9, back=False, front=True), -W / 2 + 0.004,
               W / 2 - 0.004, 'paint', bev=0.008)
    P.box('liner', (0.03, W - 0.1, H - 0.28), (x1 - 0.012, 0.0, 0.13 + (H - 0.28) / 2), 'ceramic', bev=0.012, segs=2)
    for z in (0.36, 0.7, 1.0):
        P.box('door_shelf', (0.08, W - 0.12, 0.012), (x1 - 0.065, 0.0, z), 'paint_b', bev=0.003, segs=1)
        P.box('door_rail', (0.008, W - 0.12, 0.05), (x1 - 0.105, 0.0, z + 0.03), 'paint_b', bev=0.002, segs=1)
    P.box('gasket', (0.012, W - 0.06, 0.02), (x1 - 0.004, 0.0, 0.13), 'rubber', bev=0.003, segs=1)
    hz = 0.98
    P.box('handle_base', (0.03, 0.04, 0.16), (x1 + 0.085, W / 2 - 0.07, hz), 'chrome', bev=0.008, segs=2)
    J.bar(P, 'handle', (x1 + 0.11, W / 2 - 0.07, hz + 0.06), (x1 + 0.11, W / 2 - 0.2, hz + 0.05), 0.024, 0.03, 'chrome',
          x_hint=(1, 0, 0), bev=0.01, taper=0.8)
    P.box('badge', (0.006, 0.16, 0.035), (x1 + 0.072, 0.0, H - 0.22), 'chrome', bev=0.004, segs=2)
    P.box('badge_fill', (0.006, 0.13, 0.016), (x1 + 0.075, 0.0, H - 0.22), 'paint_b', bev=0.002, segs=1)
    P.mover('P_door', P.statics[since:], (x1, hy, 0.0))
    P.views = [('a', 35, 14), ('b', 140, 18)]


# ------------------------------------------------------------------------------------------------ the kitchen stand

def cabinet_bay(P, tag, x1, y0, y1, z0, z1, drawer=True, hinge=-1):
    """One bay of a base cabinet's front from y0 to y1: a drawer over a door (or a door alone); each its own
    mover. hinge −1: the door hung on its −y edge."""
    zd = z1 - 0.15 if drawer else z1
    if drawer:
        since = mark_since(P)
        panel(P, 'drawer', x1 + 0.011, y0 + 0.004, y1 - 0.004, zd + 0.004, z1 - 0.004, frame=0.035)
        pull(P, x1 + 0.022, (y0 + y1) / 2, (zd + z1) / 2)
        dd = 0.42
        P.box('drawer_floor', (dd, y1 - y0 - 0.05, 0.008), (x1 - dd / 2, (y0 + y1) / 2, zd + 0.02), 'wood', bev=0.002, segs=1)
        for s in (y0 + 0.03, y1 - 0.03):
            P.box('drawer_side', (dd, 0.01, 0.1), (x1 - dd / 2, s, zd + 0.07), 'wood', bev=0.002, segs=1)
        P.box('drawer_back', (0.01, y1 - y0 - 0.05, 0.1), (x1 - dd + 0.005, (y0 + y1) / 2, zd + 0.07), 'wood', bev=0.002, segs=1)
        P.mover(f'P_drawer_{tag}', P.statics[since:], (x1, (y0 + y1) / 2, (zd + z1) / 2))
    since = mark_since(P)
    panel(P, 'door', x1 + 0.011, y0 + 0.004, y1 - 0.004, z0 + 0.004, zd - 0.004)
    ky = y1 - 0.05 if hinge < 0 else y0 + 0.05
    knob(P, x1 + 0.022, ky, zd - 0.09)
    P.mover(f'P_door_{tag}', P.statics[since:], (x1 + 0.011, y0 if hinge < 0 else y1, 0.0))


def nd_kitchen_stand(P):
    """A kitchen base cabinet (Nomad Drive's kitchen stand 01, 1.42 m long, 0.9 m high): a painted carcass hollow
    behind its fronts (a shelf in each bay), a recessed plinth, a butcher-block worktop with a backsplash, two
    bays of a drawer over a door, each front a shaker panel with a knob or a cup pull."""
    P.ao_distance = 0.3
    D, L, H = 0.6, 1.4, 0.88
    x1 = D / 2 - 0.03
    carcass = P.mesh('carcass', J.slab((D - 0.03, L, H - 0.1), (-0.015, 0.0, 0.1 + (H - 0.1) / 2), step=0.12), 'paint', bev=0.004)
    cav = bmesh.new()
    for s in (-1, 1):
        K.bm_cube(cav, (D - 0.07, L / 2 - 0.05, H - 0.18), matrix=Matrix.Translation((x1 - (D - 0.07) / 2 + 0.02, s * L / 4, 0.14 + (H - 0.18) / 2)))
    P.cut(carcass, cav)
    for s in (-1, 1):
        P.box('shelf', (D - 0.1, L / 2 - 0.06, 0.018), (x1 - (D - 0.1) / 2 - 0.01, s * L / 4, 0.42), 'paint', bev=0.003, segs=1)
    P.box('plinth', (D - 0.09, L - 0.04, 0.1), (-0.05, 0.0, 0.05), 'trim', bev=0.004)
    P.box('worktop', (D + 0.03, L + 0.03, 0.042), (0.0, 0.0, H + 0.021), 'wood', bev=0.008, segs=2)
    for i in range(7):
        y = -L / 2 + (i + 0.5) * L / 7
        P.box('seam', (D + 0.032, 0.003, 0.043), (0.0, y, H + 0.021), 'trim', bev=None)
    P.box('splash', (0.02, L + 0.03, 0.09), (-D / 2 + 0.005, 0.0, H + 0.087), 'paint_b', bev=0.005, segs=2)
    cabinet_bay(P, 'a', x1, -L / 2 + 0.012, -0.006, 0.1, H - 0.02, hinge=-1)
    cabinet_bay(P, 'b', x1, 0.006, L / 2 - 0.012, 0.1, H - 0.02, hinge=1)
    P.views = [('a', 30, 18), ('b', 150, 24)]


def nd_top_cabinet(P):
    """A wall cabinet (Nomad Drive's Kitchen-top cabinet, 0.96 x 0.61 m): a painted box hollow behind two glazed
    doors (a frame of four bars round a pane each, a knob), a shelf inside, a moulded lip over it and a little one
    under it; hung by its back (its bottom at z = 0)."""
    P.ao_distance = 0.2
    D, L, H = 0.32, 0.9, 0.6
    x1 = D / 2 - 0.02
    box = P.mesh('carcass', J.slab((D - 0.02, L, H), (-0.01, 0.0, H / 2), step=0.1), 'paint', bev=0.004)
    cav = bmesh.new()
    K.bm_cube(cav, (D - 0.05, L - 0.05, H - 0.05), matrix=Matrix.Translation((x1 - (D - 0.05) / 2 + 0.02, 0.0, H / 2)))
    P.cut(box, cav)
    P.box('shelf', (D - 0.07, L - 0.06, 0.016), (x1 - (D - 0.07) / 2 - 0.01, 0.0, H * 0.48), 'paint', bev=0.003, segs=1)
    P.box('lip', (D + 0.02, L + 0.04, 0.03), (0.0, 0.0, H + 0.015), 'paint', bev=0.008, segs=2)
    P.box('lip_low', (D + 0.0, L + 0.02, 0.018), (-0.01, 0.0, -0.009), 'paint', bev=0.005, segs=2)
    for (tag, y0, y1, hinge) in (('a', -L / 2 + 0.01, -0.004, -1), ('b', 0.004, L / 2 - 0.01, 1)):
        since = mark_since(P)
        f, t, x = 0.05, 0.022, x1 + 0.011
        yc, zc = (y0 + y1) / 2, H / 2
        for yy in (y0 + f / 2, y1 - f / 2):
            P.box('stile', (t, f, H - 0.01), (x, yy, zc), 'paint', bev=0.004, segs=2)
        for zz in (0.005 + f / 2, H - 0.005 - f / 2):
            P.box('rail', (t, y1 - y0 - 2 * f + 0.002, f), (x, yc, zz), 'paint', bev=0.004, segs=2)
        P.box('muntin', (t * 0.8, y1 - y0 - 2 * f + 0.002, 0.018), (x, yc, H * 0.5), 'paint', bev=0.003, segs=1)
        P.box('pane', (0.004, y1 - y0 - 2 * f + 0.01, H - 0.01 - 2 * f + 0.01), (x - 0.004, yc, zc), 'glass', bev=None)
        knob(P, x + 0.011, y1 - 0.035 if hinge < 0 else y0 + 0.035, H * 0.36, 'ceramic', 0.014)
        P.mover(f'P_door_{tag}', P.statics[since:], (x, y0 if hinge < 0 else y1, 0.0))
    P.views = [('a', 30, 10), ('b', 150, -10)]


MODELS = {
    'nd_table': nd_table,
    'nd_chair': nd_chair,
    'nd_sofa': nd_sofa,
    'nd_bookshelf': nd_bookshelf,
    'nd_fridge': nd_fridge,
    'nd_kitchen_stand': nd_kitchen_stand,
    'nd_top_cabinet': nd_top_cabinet,
    'nd_cot': nd_cot,
}


def settled(fn):
    """The builder, then the whole model set down on z = 0 — its movers with it (junk.py's settle moves the
    statics only)."""
    def build(P):
        res = fn(P)
        if res is None:
            d = J.settle(P, center=False)
            if d.length > 1e-7:
                m = Matrix.Translation(d)
                for (_, objs, pivot) in P.movers:
                    for o in objs:
                        o.data.transform(m)
                        for c in P.cfg[o.name]['cutters']:
                            c.data.transform(m)
                    pivot.x += d.x
                    pivot.y += d.y
                    pivot.z += d.z
        return res
    build.__doc__ = fn.__doc__
    return build


MODELS = {k: settled(f) for k, f in MODELS.items()}


def _after(P, opts):
    J.COLORS.update(COLORS)
    J._after(P, opts)


def main(args):
    K.run(MODELS, args, after=_after, out_dir=OUT, geo=False)
