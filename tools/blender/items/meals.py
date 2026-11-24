"""
The kitchen's dishes as they come to the table (src/core/v3/kitchen/looks.ts, docs/V3/plan/cooking.md §3): some thirty
shapes, each serving every dish of its sort — a plate of stir-fry, a seared cut, a whole fish, a bowl of soup, of
noodles, of rice, a pie, a cake, a glass, a mug ... and the two a cook would rather not have made —

    blender -b --factory-startup --python tools/blender/build.py -- items/meals [<model>|all] [--norender] [--look]

Writes public/models/modcar/items/meal_<shape>.glb: root mesh PART, origin at the bottom centre, resting on z = 0,
conventional material names only, AO in 'Col'. `paint` is what the dish is mostly made of and `paint_b` what is
second in it (a dish's two colours come from its ingredients); crockery is `ceramic`, crust and boards `wood`, what
is fried golden or a clear broth `cap_oil`, a sear `rust`, char `trim`.
"""
import math

from parts import _kit as K
from parts._kit import mat4
from items.junk import mark, xform

OUT = 'public/models/modcar/items'
TAU = math.tau


def jit(k, a=0.0):
    v = math.sin(k * 12.9898 + a * 78.233) * 43758.5453
    return (v - math.floor(v)) - 0.5


def D(x=0.0, y=0.0, z=0.0):
    return (math.degrees(x), math.degrees(y), math.degrees(z))


def oval(a, b, n=12, k=0.0):
    return [((a + k * a * math.cos(TAU * i / n)) * math.cos(TAU * i / n), b * math.sin(TAU * i / n)) for i in range(n)]


# ------------------------------------------------------------------------------------------------ crockery

def plate(P, r=0.105, mat='ceramic'):
    """A plate: its well's floor at z = 0.009."""
    P.lathe('plate', [(0.0, 0.0), (r * 0.55, 0.0), (r * 0.6, 0.005), (r * 0.86, 0.009), (r, 0.018), (r - 0.004, 0.021), (r * 0.84, 0.013), (r * 0.58, 0.009), (0.0, 0.009)], (0, 0, 0), mat, segs=48, sharp=50.0)
    return 0.009


def platter(P, a=0.14, b=0.095):
    """An oval platter: its floor at z = 0.008."""
    P.prism('platter', oval(a, b, 14), 0.008, (0, 0, 0.004), 'ceramic', bev=0.003, segs=1)
    P.prism('rim', oval(a - 0.012, b - 0.012, 14), 0.0012, (0, 0, 0.0084), 'ceramic', bev=None)
    return 0.0088


def bowl(P, r=0.075, h=0.055, mat='ceramic'):
    P.lathe('bowl', [(0.0, 0.0), (r * 0.42, 0.0), (r * 0.46, 0.008), (r * 0.84, h * 0.5), (r, h), (r - 0.004, h + 0.002), (r * 0.8, h * 0.5), (r * 0.42, 0.013), (0.0, 0.012)], (0, 0, 0), mat, segs=42, sharp=50.0)


def fill(P, r, h, level, mat, name='liquid'):
    """What stands in a bowl of (r, h) up to `level` of its height: a flat round top."""
    rr = r * (0.46 + (1.0 - 0.46) * (0.5 * level / 0.5 if level < 0.5 else 0.84 / 1.0)) if level < 0.5 else r * (0.8 + 0.16 * (level - 0.5) / 0.5)
    P.lathe(name, [(0.0, h * level - 0.004), (rr, h * level - 0.004), (rr, h * level), (0.0, h * level)], (0, 0, 0), mat, segs=42, sharp=80.0)
    return h * level


def chunk(P, name, loc, s, mat, yaw=0.0, flat=1.0):
    P.box(name, (s, s * 0.9, s * 0.8 * flat), (loc[0], loc[1], loc[2] + s * 0.4 * flat), mat, rot=D(0.1 * math.sin(yaw * 7), 0.1 * math.cos(yaw * 5), yaw), bev=s * 0.14, segs=1)


def ball(P, name, loc, r, mat, squash=0.8):
    P.sphere(name, r, (loc[0], loc[1], loc[2] + r * squash), mat, u=14, v=10, scale=(1.0, 1.0, squash))


def leaf(P, name, loc, size, yaw, tilt, mat, wide=0.55):
    d = (math.cos(yaw) * math.cos(tilt), math.sin(yaw) * math.cos(tilt), math.sin(tilt))
    c = tuple(loc[i] + d[i] * size * 0.5 for i in range(3))
    P.sphere(name, size * 0.5, c, mat, u=14, v=8, scale=(1.0, wide, 0.14), rot=D(0.0, -tilt, yaw))


def heap(P, n, r, z, s, mats, kind='chunk', rise=0.02, seed=0):
    """n pieces heaped within r, higher towards the middle."""
    for i in range(n):
        a = TAU * i * 0.618 + seed
        q = math.sqrt((i + 0.5) / n)
        x, y = r * q * math.cos(a), r * q * math.sin(a)
        zz = z + rise * (1.0 - q) + 0.002 * (i % 3)
        m = mats[i % len(mats)]
        if kind == 'chunk':
            chunk(P, f'h{i}', (x, y, zz), s * (0.85 + 0.3 * abs(jit(i, seed))), m, yaw=a * 1.7)
        elif kind == 'ball':
            ball(P, f'h{i}', (x, y, zz), s * 0.5, m)
        else:
            leaf(P, f'h{i}', (x * 0.5, y * 0.5, zz), s * 2.2, a, 0.2 + 0.5 * (1.0 - q), m)


def wedge(P, name, loc, r, mat, mat_skin, yaw=0.0):
    """A wedge of lemon standing on its rind."""
    m = mark(P)
    P.lathe(name, [(0.0, -r), (r * 0.7, -r * 0.7), (r, 0.0), (r * 0.7, r * 0.7), (0.0, r)], (0, 0, 0), mat_skin, segs=2, angle=TAU / 5, sharp=80.0)
    pts = [(0.0, -r), (r * 0.7, -r * 0.7), (r, 0.0), (r * 0.7, r * 0.7), (0.0, r)]
    from mathutils import Matrix
    P.prism(name + 'a', pts, 0.0004, (0, 0, 0), mat, matrix=Matrix.Rotation(math.pi / 2, 4, 'X'), bev=None)
    P.prism(name + 'b', pts, 0.0004, (0, 0, 0), mat, matrix=Matrix.Rotation(TAU / 5, 4, 'Z') @ Matrix.Rotation(math.pi / 2, 4, 'X'), bev=None)
    xform(P, m, mat4(loc, D(math.pi / 2, 0.0, yaw)))


def spoon(P, loc, yaw=0.5):
    m = mark(P)
    P.sphere('spoon', 0.014, (0, 0, 0), 'steel', u=14, v=8, scale=(1.3, 1.0, 0.3))
    P.tube('spoon_h', [(0.014, 0, 0.002), (0.05, 0, 0.022), (0.09, 0, 0.04)], 0.003, 'steel', segs=4)
    xform(P, m, mat4(loc, D(0.0, 0.0, yaw)))


# ------------------------------------------------------------------------------------------------ on a plate

def meal_stirfry(P):
    z = plate(P)
    heap(P, 15, 0.058, z, 0.024, ['paint', 'paint_b', 'paint'], 'chunk', rise=0.028)
    for i in range(4):
        leaf(P, f'g{i}', (0.03 * math.cos(i * 1.7), 0.03 * math.sin(i * 1.7), z + 0.03), 0.03, i * 1.7 + 1.0, 0.3, 'paint_b', wide=0.3)


def meal_cutlet(P):
    z = plate(P)
    P.prism('cut', oval(0.052, 0.034, 12, 0.14), 0.02, (-0.012, -0.012, z + 0.01), 'paint', rot=D(0, 0, 0.3), bev=0.005)
    for i in range(3):
        P.box(f'sear{i}', (0.004, 0.05 - 0.01 * abs(i - 1), 0.0015), (-0.034 + 0.022 * i, -0.012 + 0.006 * (i - 1), z + 0.0205), 'rust', rot=D(0, 0, 0.9), bev=None)
    for i in range(4):
        ball(P, f'side{i}', (0.05 + 0.014 * math.cos(i * 1.6), 0.04 + 0.016 * math.sin(i * 1.6), z), 0.011, 'paint_b')
    wedge(P, 'lemon', (0.04, -0.05, z + 0.0), 0.016, 'cap_oil', 'cap_oil', yaw=0.6)
    leaf(P, 'herb', (-0.02, -0.012, z + 0.02), 0.04, 0.9, 0.1, 'paint_b', wide=0.4)


def fish_body(P, z, L=0.19, mat='paint'):
    P.sphere('fish', 0.5, (0.0, 0.0, z + 0.014), mat, u=12, v=6, scale=(L, 0.06, 0.03))
    P.prism('tail', [(0.0, 0.0), (-0.036, 0.026), (-0.026, 0.0), (-0.036, -0.026)], 0.007, (-L * 0.45, 0.0, z + 0.012), mat, bev=None)
    for i in range(3):
        P.box(f'slash{i}', (0.004, 0.034, 0.002), (-0.03 + 0.03 * i, 0.002, z + 0.0282 - 0.0016 * abs(i - 1)), 'rust', rot=D(0, 0, 0.5), bev=None)
    P.sphere('eye', 0.0045, (L * 0.37, 0.006, z + 0.024), 'trim', u=10, v=6)


def meal_fish(P):
    z = platter(P)
    fish_body(P, z)
    for i in range(3):
        P.cyl(f'slice{i}', 0.014, 0.003, (0.03 - 0.03 * i, -0.052 - 0.004 * (i % 2), z + 0.002), 'paint_b', segs=24, bev=None)
    for i in range(4):
        leaf(P, f'g{i}', (-0.05 + 0.03 * i, 0.012 * jit(i), z + 0.028), 0.03, 0.4 + i, 0.15, 'paint_b', wide=0.28)


def meal_egg(P):
    z = plate(P)
    for k, (x, y, a) in enumerate([(-0.028, -0.01, 0.0), (0.026, 0.022, 1.4)]):
        out = [((0.036 + 0.006 * math.sin(3 * TAU * i / 12 + a)) * math.cos(TAU * i / 12), (0.031 + 0.005 * math.cos(2 * TAU * i / 12 + a)) * math.sin(TAU * i / 12)) for i in range(12)]
        P.prism(f'white{k}', out, 0.005, (x, y, z + 0.0035), 'ceramic', bev=0.002, segs=1)
        # (fried: a lacy golden edge under the white, or it is lost on a white plate)
        P.prism(f'crisp{k}', [(px * 1.12, py * 1.12) for px, py in out], 0.002, (x, y, z + 0.001), 'cap_oil', bev=None)
        P.sphere(f'yolk{k}', 0.013, (x + 0.003, y, z + 0.006), 'paint', u=16, v=10, scale=(1.0, 1.0, 0.6))
    for i in range(3):
        P.box(f'strip{i}', (0.06, 0.013, 0.004), (0.0, -0.058 + 0.004 * i, z + 0.002 + 0.003 * i), 'paint_b', rot=D(0, 0, 0.25 * (i - 1) + 0.1), bev=0.0015, segs=1)


def meal_omelette(P):
    z = plate(P)
    P.sphere('omelette', 0.5, (0.0, 0.0, z + 0.016), 'paint', u=12, v=6, scale=(0.13, 0.066, 0.036))
    P.sphere('fold', 0.5, (0.0, -0.012, z + 0.02), 'paint', u=10, v=5, scale=(0.118, 0.05, 0.034))
    for i in range(5):
        chunk(P, f'fill{i}', (-0.04 + 0.02 * i, 0.03, z + 0.002), 0.014, 'paint_b', yaw=i * 1.3)
    for i in range(3):
        leaf(P, f'g{i}', (-0.02 + 0.02 * i, -0.01, z + 0.035), 0.022, 0.6 + i * 1.1, 0.1, 'paint_b', wide=0.3)


def meal_friedrice(P):
    z = plate(P)
    P.lathe('mound', [(0.0, z), (0.07, z), (0.064, z + 0.012), (0.045, z + 0.03), (0.02, z + 0.04), (0.0, z + 0.042)], (0, 0, 0), 'paint', segs=40, sharp=80.0)
    for i in range(12):
        a = TAU * i * 0.618
        q = 0.2 + 0.75 * math.sqrt((i + 0.5) / 12)
        r = 0.066 * q
        zz = z + 0.042 * (1.0 - q ** 1.5) + 0.002
        chunk(P, f'bit{i}', (r * math.cos(a), r * math.sin(a), zz), 0.011, 'paint_b' if i % 3 else 'ceramic', yaw=a)


def meal_noodles(P):
    z = plate(P)
    for k in range(3):
        n = 12
        r0 = 0.058 - 0.016 * k
        pts = [((r0 + 0.006 * math.sin(i * 2.3 + k)) * math.cos(TAU * i / n + k), (r0 + 0.006 * math.cos(i * 1.7 + k)) * math.sin(TAU * i / n + k), z + 0.007 + 0.009 * k + 0.003 * math.sin(i * 1.3 + k)) for i in range(n)]
        P.tube(f'coil{k}', pts, 0.0075, 'paint', segs=5, closed=True)
    heap(P, 6, 0.022, z + 0.026, 0.018, ['paint_b'], 'chunk', rise=0.012, seed=1)
    for i in range(3):
        leaf(P, f'g{i}', (0.0, 0.0, z + 0.044), 0.026, i * 2.1, 0.2, 'paint_b', wide=0.3)


def meal_toast(P):
    z = plate(P)
    for k, (x, y, yaw, lift) in enumerate([(-0.022, -0.012, 0.2, 0.0), (0.024, 0.016, -0.35, 0.012)]):
        m = mark(P)
        P.prism(f'crust{k}', K.rounded_rect(0.078, 0.07, 0.016, 3), 0.012, (0, 0, 0.006), 'wood', bev=0.002, segs=1)
        P.prism(f'crumb{k}', K.rounded_rect(0.066, 0.058, 0.012, 3), 0.0126, (0, 0, 0.0064), 'paint', bev=None)
        xform(P, m, mat4((x, y, z + lift), D(0.16 * k, 0.0, yaw)))
    P.box('pat', (0.022, 0.022, 0.008), (0.024, 0.016, z + 0.03), 'paint_b', rot=D(0.16, 0.0, 0.4), bev=0.002, segs=1)


def meal_pancake(P):
    z = plate(P)
    for k in range(3):
        P.lathe(f'cake{k}', [(0.0, 0.0), (0.066 - 0.003 * k, 0.0), (0.07 - 0.003 * k, 0.004), (0.07 - 0.003 * k, 0.009), (0.064 - 0.003 * k, 0.013), (0.0, 0.013)], (0.003 * jit(k) * 2, 0.003 * jit(k, 1) * 2, z + 0.0125 * k), 'paint', segs=40, sharp=60.0)
    zt = z + 0.0125 * 3
    out = [((0.04 + 0.012 * math.sin(4 * TAU * i / 12)) * math.cos(TAU * i / 12), (0.036 + 0.012 * math.cos(3 * TAU * i / 12)) * math.sin(TAU * i / 12)) for i in range(12)]
    P.prism('syrup', out, 0.003, (0, 0, zt + 0.0018), 'paint_b', bev=0.001, segs=1)
    for i in range(3):
        P.tube(f'drip{i}', [(0.05 * math.cos(1.0 + i * 2.1), 0.05 * math.sin(1.0 + i * 2.1), zt), (0.071 * math.cos(1.0 + i * 2.1), 0.071 * math.sin(1.0 + i * 2.1), zt - 0.004), (0.072 * math.cos(1.0 + i * 2.1), 0.072 * math.sin(1.0 + i * 2.1), zt - 0.02 - 0.006 * i)], 0.005, 'paint_b', segs=5)
    P.box('pat', (0.02, 0.02, 0.008), (0.004, -0.002, zt + 0.007), 'ceramic', rot=D(0, 0, 0.5), bev=0.002, segs=1)


def meal_sandwich(P):
    # (on a board: white bread is lost on a white plate)
    P.prism('board', K.rounded_rect(0.2, 0.15, 0.02, 3), 0.012, (0, 0, 0.006), 'wood', bev=0.003, segs=1)
    z = 0.012
    tri = [(-0.045, -0.04), (0.045, -0.04), (0.045, 0.045)]
    for k, (x, y, yaw) in enumerate([(-0.026, 0.0, 0.2), (0.03, 0.006, 3.5)]):
        m = mark(P)
        for j, (zz, t, mat) in enumerate([(0.0, 0.011, 'ceramic'), (0.011, 0.005, 'paint_b'), (0.016, 0.006, 'paint'), (0.022, 0.004, 'paint_b'), (0.026, 0.011, 'ceramic')]):
            s = 1.0 + (0.06 if mat != 'ceramic' else 0.0)
            P.prism(f'l{k}{j}', [(px * s, py * s) for px, py in tri], t, (0, 0, zz + t / 2), mat, bev=None)
        # toasted on both faces
        P.prism(f'top{k}', tri, 0.0016, (0, 0, 0.0378), 'cap_oil', bev=None)
        xform(P, m, mat4((x, y, z), D(0.0, 0.0, yaw)))


def meal_skewer(P):
    z = plate(P)
    for k in range(3):
        y = -0.04 + 0.04 * k
        yaw = 0.12 * (k - 1)
        m = mark(P)
        P.cyl(f'stick{k}', 0.0022, 0.2, (0.0, 0.0, 0.012), 'wood', axis='X', segs=5, bev=None)
        for i in range(5):
            chunk(P, f'p{k}{i}', (-0.06 + 0.026 * i, 0.0, 0.002), 0.022, 'paint' if (i + k) % 2 == 0 else 'paint_b', yaw=i * 0.9 + k)
        xform(P, m, mat4((0.0, y, z), D(0.0, 0.0, yaw)))


def meal_roast(P):
    z = platter(P, 0.15, 0.105)
    P.sphere('body', 0.5, (0.0, 0.0, z + 0.036), 'paint', u=12, v=7, scale=(0.15, 0.11, 0.078))
    for s in (-1, 1):
        P.lathe(f'leg{s}', [(0.0, 0.0), (0.016, 0.004), (0.022, 0.03), (0.012, 0.056), (0.0, 0.058)], (0.03, s * 0.05, z + 0.03), 'paint', rot=D(0.0, 0.9, s * 0.5), segs=24, sharp=70.0)
        P.sphere(f'knob{s}', 0.008, (0.075, s * 0.076, z + 0.062), 'ceramic', u=12, v=8)
    for i in range(3):
        P.box(f'sear{i}', (0.05 - 0.012 * abs(i - 1), 0.005, 0.002), (-0.012, -0.022 + 0.022 * i, z + 0.0745 - 0.004 * abs(i - 1)), 'rust', rot=D(0.3 * (i - 1), 0, 0), bev=None)
    for i in range(8):
        a = TAU * i / 8 + 0.2
        ball(P, f'side{i}', (0.118 * math.cos(a), 0.078 * math.sin(a), z), 0.012, 'paint_b' if i % 2 else 'cap_oil')


def meal_shell(P):
    z = plate(P)
    for i in range(6):
        a = TAU * i / 6 + 0.3
        r = 0.05
        m = mark(P)
        pts = [(0.022 * math.cos(t), 0.022 * math.sin(t), 0.008) for t in [0.3 + 0.68 * k for k in range(5)]]
        P.tube(f's{i}', pts, 0.009, 'paint', segs=5, bend=0.0, radius_fn=lambda t: 1.0 - 0.55 * t)
        P.prism(f't{i}', [(0.0, 0.0), (0.014, -0.008), (0.014, 0.008)], 0.004, (pts[-1][0], pts[-1][1], 0.008), 'paint_b', rot=D(0, 0, 3.6), bev=None)
        xform(P, m, mat4((r * math.cos(a), r * math.sin(a), z), D(0.0, 0.0, a + 1.2)))
    wedge(P, 'lemon', (0.0, 0.0, z), 0.02, 'cap_oil', 'cap_oil', yaw=0.4)
    for i in range(4):
        leaf(P, f'g{i}', (0.012 * math.cos(i * 1.6), 0.012 * math.sin(i * 1.6), z + 0.018), 0.03, i * 1.6 + 0.5, 0.3, 'paint_b', wide=0.3)


def meal_sashimi(P):
    P.box('board', (0.16, 0.24, 0.014), (0, 0, 0.007), 'wood', bev=0.004, segs=1)
    for s in (-1, 1):
        P.box(f'leg{s}', (0.16, 0.014, 0.01), (0.0, s * 0.09, -0.005), 'wood', bev=None)
    z = 0.014
    for row, (x, mat) in enumerate([(-0.036, 'paint'), (0.036, 'paint_b')]):
        for i in range(5):
            P.box(f'slice{row}{i}', (0.05, 0.02, 0.01), (x, -0.07 + 0.03 * i, z + 0.009), mat, rot=D(0.5, 0.0, 0.08 * (i - 2)), bev=0.003, segs=1)
    P.lathe('wasabi', [(0.0, 0.0), (0.012, 0.0), (0.008, 0.01), (0.0, 0.014)], (0.0, 0.1, z), 'paint_b', segs=18, sharp=80.0)
    for i in range(3):
        leaf(P, f'shiso{i}', (0.0, -0.1, z + 0.001), 0.045, 1.0 + i * 0.5, 0.15, 'ceramic', wide=0.5)


def meal_dumpling(P):
    r = 0.105
    P.lathe('basket', [(r - 0.01, 0.0), (r, 0.0), (r, 0.04), (r - 0.01, 0.04)], (0, 0, 0), 'wood', segs=42, sharp=50.0, loop=True)
    P.cyl('floor', r - 0.008, 0.006, (0, 0, 0.006), 'wood', segs=42, bev=None)
    P.cyl('cloth', r - 0.014, 0.002, (0, 0, 0.0095), 'ceramic', segs=42, bev=None)
    z = 0.0105
    for i in range(7):
        a = TAU * i / 6
        rr = 0.0 if i == 6 else 0.058
        m = mark(P)
        P.sphere(f'd{i}', 0.5, (0.0, 0.0, 0.012), 'ceramic', u=16, v=10, scale=(0.056, 0.03, 0.026))
        for k in range(4):
            P.sphere(f'pleat{i}{k}', 0.006, (-0.018 + 0.012 * k, 0.0, 0.025), 'paint', u=10, v=6, scale=(1.0, 0.7, 0.7))
        xform(P, m, mat4((rr * math.cos(a), rr * math.sin(a), z), D(0.0, 0.0, a + 1.57)))
    bowl_r = 0.022
    P.lathe('dip', [(0.0, 0.0), (bowl_r * 0.6, 0.0), (bowl_r, 0.012), (bowl_r - 0.003, 0.012), (bowl_r * 0.55, 0.004), (0.0, 0.004)], (r + 0.03, 0.0, 0.0), 'ceramic', segs=24, sharp=60.0)
    P.cyl('sauce', bowl_r * 0.78, 0.002, (r + 0.03, 0.0, 0.0095), 'paint_b', segs=24, bev=None)


def meal_stuffed(P):
    z = plate(P)
    for k, (x, y, yaw) in enumerate([(-0.03, -0.012, 0.3), (0.034, 0.016, 1.9)]):
        m = mark(P)
        P.lathe(f'shell{k}', [(0.0, 0.0), (0.02, 0.002), (0.034, 0.014), (0.036, 0.028), (0.03, 0.03), (0.027, 0.02), (0.0, 0.012)], (0, 0, 0), 'paint', segs=27, sharp=60.0)
        P.sphere(f'fill{k}', 0.029, (0, 0, 0.022), 'paint_b', u=16, v=10, scale=(1.0, 1.0, 0.55))
        for i in range(4):
            chunk(P, f'bit{k}{i}', (0.012 * math.cos(i * 1.6), 0.012 * math.sin(i * 1.6), 0.033), 0.008, 'cap_oil' if i % 2 else 'paint', yaw=i)
        xform(P, m, mat4((x, y, z), D(0.0, 0.0, yaw), (1.25, 0.95, 1.0)))


def meal_curry(P):
    z = plate(P)
    P.sphere('rice', 0.5, (-0.03, 0.0, z + 0.012), 'ceramic', u=10, v=5, scale=(0.09, 0.12, 0.05))
    out = [(0.004 + 0.064 * max(0.0, math.cos(TAU * i / 14)) ** 0.7 * (1 if math.cos(TAU * i / 14) > 0 else 0) + (0.0 if math.cos(TAU * i / 14) > 0 else -0.006 * 0), 0.072 * math.sin(TAU * i / 14)) for i in range(14)]
    P.prism('sauce', out, 0.008, (0.0, 0.0, z + 0.004), 'paint', bev=0.002, segs=1)
    for i in range(6):
        a = -1.2 + 0.48 * i
        chunk(P, f'c{i}', (0.036 * math.cos(a) + 0.006, 0.046 * math.sin(a), z + 0.006), 0.019, 'paint_b' if i % 3 else 'cap_oil', yaw=i * 1.3)


def meal_cookie(P):
    z = plate(P)
    for i, (x, y, zz) in enumerate([(-0.04, -0.02, 0.0), (0.02, -0.04, 0.0), (0.045, 0.02, 0.0), (-0.012, 0.042, 0.0), (0.0, 0.0, 0.011)]):
        P.lathe(f'c{i}', [(0.0, 0.0), (0.028, 0.0), (0.031, 0.004), (0.028, 0.009), (0.0, 0.011)], (x, y, z + zz), 'paint', segs=27, sharp=70.0)
        for k in range(4):
            a = TAU * k / 4 + i
            P.sphere(f'chip{i}{k}', 0.0045, (x + 0.015 * math.cos(a), y + 0.015 * math.sin(a), z + zz + 0.0095), 'paint_b', u=10, v=6, scale=(1.0, 1.0, 0.6))


def meal_loaf(P):
    P.box('board', (0.12, 0.22, 0.012), (0, 0, 0.006), 'wood', bev=0.004, segs=1)
    z = 0.012
    P.lathe('loaf', [(0.0, 0.0), (0.03, 0.006), (0.04, 0.03), (0.04, 0.1), (0.0, 0.1)], (0.0, -0.085, z + 0.036), 'paint', axis='Y', segs=40, sharp=70.0)
    P.cyl('face', 0.038, 0.002, (0.0, 0.016, z + 0.036), 'cap_oil', axis='Y', segs=40, bev=None)
    for i in range(2):
        P.cyl(f'slice{i}', 0.04, 0.012, (0.0, 0.05 + 0.03 * i, z + 0.007 + 0.006 * i), 'paint', segs=40, rot=D(0.25 * i, 0.0, 0.0), bev=0.002)
        P.cyl(f'crumb{i}', 0.034, 0.0125, (0.0, 0.05 + 0.03 * i, z + 0.0074 + 0.006 * i), 'cap_oil', segs=40, rot=D(0.25 * i, 0.0, 0.0), bev=None)
    for i in range(6):
        P.sphere(f'nut{i}', 0.005, (0.02 * math.cos(i * 1.1), -0.07 + 0.016 * i, z + 0.074), 'paint_b', u=10, v=6)


# ------------------------------------------------------------------------------------------------ in a bowl

def meal_soup(P):
    r, h = 0.08, 0.055
    bowl(P, r, h)
    z = fill(P, r, h, 0.78, 'paint')
    for i in range(7):
        a = TAU * i * 0.618
        q = 0.25 + 0.6 * math.sqrt((i + 0.5) / 7)
        chunk(P, f'f{i}', (r * 0.8 * q * math.cos(a), r * 0.8 * q * math.sin(a), z - 0.006), 0.016, 'paint_b' if i % 3 else 'cap_oil', yaw=a)
    for i in range(3):
        leaf(P, f'g{i}', (0.012 * math.cos(i * 2.1), 0.012 * math.sin(i * 2.1), z + 0.001), 0.022, i * 2.1 + 0.4, 0.05, 'paint_b', wide=0.3)
    spoon(P, (0.02, -0.02, z + 0.002), yaw=-0.9)


def meal_stew(P):
    r, h = 0.085, 0.06
    bowl(P, r, h)
    z = fill(P, r, h, 0.7, 'paint')
    heap(P, 9, r * 0.6, z - 0.008, 0.026, ['paint_b', 'paint_b', 'cap_oil'], 'chunk', rise=0.014)
    for i in range(3):
        leaf(P, f'g{i}', (0.0, 0.0, z + 0.022), 0.024, i * 2.1, 0.25, 'paint_b', wide=0.3)


def meal_noodlesoup(P):
    r, h = 0.09, 0.065
    bowl(P, r, h)
    z = fill(P, r, h, 0.76, 'paint')
    for k in range(2):
        n = 12
        r0 = 0.05 - 0.02 * k
        pts = [((r0 + 0.005 * math.sin(i * 2.3 + k)) * math.cos(TAU * i / n + k), (r0 + 0.005 * math.cos(i * 1.7 + k)) * math.sin(TAU * i / n + k), z + 0.001 + 0.005 * k + 0.002 * math.sin(i * 1.3 + k)) for i in range(n)]
        P.tube(f'coil{k}', pts, 0.006, 'ceramic', segs=5, closed=True)
    for i in range(3):
        P.box(f'top{i}', (0.036, 0.022, 0.006), (-0.024 + 0.012 * i, 0.026 - 0.004 * i, z + 0.012 + 0.003 * i), 'paint_b', rot=D(0.2, 0.0, 0.5), bev=0.002, segs=1)
    P.cyl('egg', 0.016, 0.006, (0.03, -0.022, z + 0.008), 'ceramic', segs=24, bev=0.002)
    P.sphere('yolk', 0.009, (0.03, -0.022, z + 0.01), 'cap_oil', u=12, v=8, scale=(1, 1, 0.6))
    for s in (-1, 1):
        P.cyl(f'stick{s}', 0.0024, 0.2, (0.02, 0.0 + 0.008 * s, h + 0.006), 'wood', segs=5, rot=D(0.0, 1.5, 0.5), bev=None)


def meal_congee(P):
    r, h = 0.08, 0.055
    bowl(P, r, h)
    z = fill(P, r, h, 0.82, 'ceramic')
    heap(P, 5, 0.022, z - 0.004, 0.018, ['paint'], 'chunk', rise=0.01)
    for i in range(6):
        a = TAU * i / 6 + 0.3
        P.cyl(f'ring{i}', 0.005, 0.003, (0.042 * math.cos(a), 0.042 * math.sin(a), z + 0.001), 'paint_b', segs=18, bev=None)
    spoon(P, (0.03, -0.03, z + 0.002), yaw=-0.8)


def meal_ricebowl(P):
    r, h = 0.085, 0.062
    bowl(P, r, h)
    R, rz, zc = r * 0.9, r * 0.4, h * 0.62
    P.sphere('rice', R, (0, 0, zc), 'ceramic', u=12, v=6, scale=(1.0, 1.0, rz / R))
    top = lambda x, y: zc + rz * math.sqrt(max(0.0, 1.0 - (x * x + y * y) / (R * R)))
    for i in range(6):
        a = -1.3 + 0.52 * i
        x, y = 0.026 * math.cos(a) - 0.022, 0.04 * math.sin(a)
        P.box(f'top{i}', (0.04, 0.018, 0.008), (x, y, top(x, y) + 0.003), 'paint', rot=D(0.0, 0.2, a * 0.3), bev=0.003, segs=1)
    P.sphere('yolk', 0.012, (0.03, 0.0, top(0.03, 0.0) + 0.004), 'cap_oil', u=14, v=8, scale=(1, 1, 0.6))
    for i in range(5):
        x, y = 0.034 + 0.014 * math.cos(i * 1.3), 0.036 * math.sin(i * 1.3 + 1)
        P.cyl(f'ring{i}', 0.005, 0.003, (x, y, top(x, y) + 0.001), 'paint_b', segs=18, bev=None)


def meal_salad(P):
    r, h = 0.09, 0.055
    bowl(P, r, h)
    for i in range(11):
        a = TAU * i * 0.618
        q = math.sqrt((i + 0.5) / 11)
        leaf(P, f'l{i}', (r * 0.42 * q * math.cos(a), r * 0.42 * q * math.sin(a), h * 0.55 + 0.012 * (1 - q)), 0.07, a, 0.25 + 0.5 * (1 - q), 'paint', wide=0.7)
    heap(P, 8, r * 0.6, h * 0.86, 0.017, ['paint_b', 'paint_b', 'ceramic'], 'ball', rise=0.016, seed=2)


def meal_custard(P):
    r, h = 0.05, 0.045
    P.lathe('cup', [(0.0, 0.0), (r * 0.8, 0.0), (r, h), (r + 0.004, h), (r + 0.004, h + 0.004), (r - 0.004, h + 0.004), (r - 0.004, h - 0.004), (0.0, h - 0.004)], (0, 0, 0), 'ceramic', segs=40, sharp=50.0)
    P.lathe('custard', [(0.0, h - 0.004), (r - 0.004, h - 0.004), (r - 0.006, h + 0.002), (0.0, h + 0.005)], (0, 0, 0), 'paint', segs=40, sharp=80.0)
    heap(P, 4, 0.016, h + 0.003, 0.014, ['paint_b'], 'ball', rise=0.004)
    P.cyl('saucer', r + 0.03, 0.005, (0, 0, -0.0025), 'ceramic', segs=40, bev=0.002)
    spoon(P, (0.04, -0.062, 0.002), yaw=0.4)


def meal_hotpot(P):
    r, h = 0.125, 0.07
    P.lathe('pot', [(0.0, 0.0), (r - 0.014, 0.0), (r, 0.012), (r + 0.002, h), (r + 0.008, h + 0.002), (r + 0.008, h + 0.006), (r - 0.004, h + 0.006), (r - 0.006, h - 0.012), (0.0, h - 0.012)], (0, 0, 0), 'trim', segs=48, sharp=50.0)
    for s in (-1, 1):
        P.torus(f'ear{s}', 0.022, 0.006, (0.0, s * (r + 0.01), h - 0.01), 'trim', segs=24, rsegs=8, arc=math.pi, a0=0.0 if s > 0 else math.pi)
    z = h - 0.012
    P.cyl('broth', r - 0.007, 0.004, (0, 0, z + 0.002), 'paint', segs=48, bev=None)
    heap(P, 13, r * 0.7, z, 0.03, ['paint_b', 'ceramic', 'paint_b', 'cap_oil'], 'chunk', rise=0.016)
    for i in range(5):
        leaf(P, f'g{i}', (0.03 * math.cos(i * 1.3), 0.03 * math.sin(i * 1.3), z + 0.026), 0.04, i * 1.3 + 0.5, 0.3, 'paint_b', wide=0.4)


# ------------------------------------------------------------------------------------------------ to drink

def meal_glass(P):
    r, h = 0.034, 0.12
    # (the drink is the glass's own shape, the glass a foot under it and a rim over it: what is drawn through glass is dimmed)
    P.lathe('foot', [(0.0, 0.0), (r * 0.78, 0.0), (r * 0.8, 0.008), (0.0, 0.008)], (0, 0, 0), 'glass', segs=40, sharp=50.0)
    P.lathe('drink', [(0.0, 0.008), (r * 0.8, 0.008), (r * 0.97, h * 0.86), (0.0, h * 0.86)], (0, 0, 0), 'paint', segs=40, sharp=80.0)
    P.lathe('rim', [(r * 0.97, h * 0.86), (r, h), (r - 0.003, h), (r * 0.97 - 0.003, h * 0.86)], (0, 0, 0), 'glass', segs=40, sharp=50.0, loop=True)
    P.cyl('straw', 0.0035, 0.15, (0.008, 0.0, 0.085), 'paint_b', segs=5, rot=D(0.0, 0.22, 0.0), bev=None)
    P.cyl('slice', 0.02, 0.004, (0.0, r - 0.002, h + 0.006), 'paint_b', segs=40, rot=D(0.0, math.pi / 2, math.pi / 2), bev=None)


def meal_mug(P):
    r, h = 0.042, 0.085
    P.lathe('mug', [(0.0, 0.0), (r - 0.004, 0.0), (r, 0.006), (r, h), (r - 0.004, h), (r - 0.004, h - 0.012), (0.0, h - 0.012)], (0, 0, 0), 'ceramic', segs=40, sharp=50.0)
    P.torus('ear', 0.024, 0.006, (0.0, r + 0.002, h * 0.5), 'ceramic', segs=40, rsegs=8, arc=math.pi, a0=0.0, rot=D(0.0, math.pi / 2, 0.0))
    P.cyl('drink', r - 0.0045, 0.003, (0, 0, h - 0.0105), 'paint', segs=40, bev=None)
    P.cyl('slice', 0.016, 0.003, (0.008, -0.006, h - 0.0085), 'paint_b', segs=24, bev=None)
    P.torus('band', r + 0.0005, 0.003, (0, 0, h * 0.3), 'paint_b', segs=40, rsegs=7)


# ------------------------------------------------------------------------------------------------ baked

def meal_pie(P):
    r = 0.1
    P.lathe('tin', [(0.0, 0.0), (r * 0.8, 0.0), (r, 0.03), (r + 0.006, 0.03), (r + 0.006, 0.034), (r - 0.004, 0.034), (r * 0.78, 0.006), (0.0, 0.006)], (0, 0, 0), 'steel', segs=42, sharp=50.0)
    cut = TAU * 0.16
    P.lathe('filling', [(0.0, 0.006), (r * 0.8, 0.008), (r - 0.006, 0.03), (0.0, 0.03)], (0, 0, 0), 'paint', segs=40, sharp=80.0, angle=TAU - cut, start=cut / 2)
    P.lathe('crust', [(r - 0.02, 0.03), (r + 0.004, 0.034), (r + 0.004, 0.04), (r - 0.02, 0.04)], (0, 0, 0), 'wood', segs=40, sharp=60.0, angle=TAU - cut, start=cut / 2, loop=True)
    for i in range(4):
        P.box(f'lat{i}', (0.012, 2 * math.sqrt(max(1e-6, (r - 0.016) ** 2 - (0.052 - 0.035 * i) ** 2)) * (0.62 if i < 1 else 1.0), 0.004), (-0.052 + 0.035 * i, 0.0 if i else 0.018, 0.034), 'wood', bev=0.001, segs=1)
    for i in range(3):
        P.box(f'lat_b{i}', (2 * math.sqrt(max(1e-6, (r - 0.016) ** 2 - (0.05 - 0.05 * i) ** 2)) * (0.56 if i == 1 else 0.9), 0.012, 0.004), (-0.022 if i == 1 else -0.004, -0.05 + 0.05 * i, 0.037), 'wood', bev=0.001, segs=1)
    for i in range(5):
        ball(P, f'top{i}', (0.03 * math.cos(i * 1.26 + 2.2) - 0.02, 0.03 * math.sin(i * 1.26 + 2.2), 0.038), 0.008, 'paint_b')


def meal_pizza(P):
    r = 0.12
    P.cyl('board', r + 0.012, 0.01, (0, 0, 0.005), 'wood', segs=42, bev=0.003)
    cut = TAU / 8
    P.lathe('base', [(0.0, 0.01), (r, 0.01), (r, 0.022), (r - 0.012, 0.024), (r - 0.016, 0.017), (0.0, 0.017)], (0, 0, 0), 'cap_oil', segs=42, sharp=60.0, angle=TAU - cut, start=cut)
    P.lathe('sauce', [(0.0, 0.017), (r - 0.017, 0.017), (r - 0.017, 0.0185), (0.0, 0.0185)], (0, 0, 0), 'paint', segs=42, sharp=80.0, angle=TAU - cut, start=cut)
    k = 0
    for i in range(12):
        a = cut + (TAU - cut) * ((i * 0.618) % 1.0)
        q = 0.25 + 0.6 * math.sqrt((i + 0.5) / 12)
        x, y = (r - 0.02) * q * math.cos(a), (r - 0.02) * q * math.sin(a)
        if i % 3 == 0:
            P.cyl(f'cheese{i}', 0.014, 0.003, (x, y, 0.02), 'ceramic', segs=21, bev=None)
        else:
            P.cyl(f'top{i}', 0.011, 0.004, (x, y, 0.0205), 'paint_b', segs=21, bev=None)
        k += 1
    # the slice drawn out
    m = mark(P)
    P.lathe('base_s', [(0.0, 0.0), (r, 0.0), (r, 0.012), (r - 0.012, 0.014), (r - 0.016, 0.007), (0.0, 0.007)], (0, 0, 0), 'cap_oil', segs=2, sharp=60.0, angle=cut, start=0.0)
    P.lathe('sauce_s', [(0.0, 0.007), (r - 0.017, 0.007), (r - 0.017, 0.0085), (0.0, 0.0085)], (0, 0, 0), 'paint', segs=2, sharp=80.0, angle=cut, start=0.0)
    P.cyl('top_s', 0.011, 0.004, (0.07 * math.cos(cut / 2), 0.07 * math.sin(cut / 2), 0.0105), 'paint_b', segs=21, bev=None)
    xform(P, m, mat4((0.03 * math.cos(cut / 2), 0.03 * math.sin(cut / 2), 0.01)))


def meal_cake(P):
    z = plate(P)
    r, h = 0.066, 0.05
    cut = TAU * 0.14
    P.lathe('sponge', [(0.0, z), (r, z), (r, z + h), (0.0, z + h)], (0, 0, 0), 'paint_b', segs=42, sharp=70.0, angle=TAU - cut, start=cut / 2)
    P.lathe('icing', [(0.0, z + h), (r + 0.002, z + h), (r + 0.002, z + h + 0.008), (0.0, z + h + 0.008)], (0, 0, 0), 'ceramic', segs=42, sharp=70.0, angle=TAU - cut, start=cut / 2)
    P.lathe('layer', [(r + 0.001, z + h * 0.45), (r + 0.001, z + h * 0.58)], (0, 0, 0), 'ceramic', segs=42, sharp=80.0, angle=TAU - cut, start=cut / 2)
    # the two cut faces
    from mathutils import Matrix
    for s, ang in ((0, cut / 2), (1, TAU - cut / 2)):
        pts = [(0.0, z), (r, z), (r, z + h), (0.0, z + h)]
        P.prism(f'face{s}', pts, 0.0006, (0, 0, 0), 'paint_b', matrix=Matrix.Rotation(ang, 4, 'Z') @ Matrix.Rotation(math.pi / 2, 4, 'X'), bev=None)
        P.prism(f'cream{s}', [(0.0, z + h * 0.45), (r, z + h * 0.45), (r, z + h * 0.58), (0.0, z + h * 0.58)], 0.001, (0, 0, 0), 'ceramic', matrix=Matrix.Rotation(ang, 4, 'Z') @ Matrix.Rotation(math.pi / 2, 4, 'X'), bev=None)
    for i in range(7):
        a = cut / 2 + (TAU - cut) * (i + 0.5) / 7
        ball(P, f'fruit{i}', (0.046 * math.cos(a), 0.046 * math.sin(a), z + h + 0.008), 0.011, 'paint', squash=0.9)


# ------------------------------------------------------------------------------------------------ gone wrong

def meal_mess(P):
    """What no recipe knows: a dubious heap, bones and all."""
    z = plate(P)
    for i in range(7):
        a = TAU * i * 0.618
        q = math.sqrt((i + 0.5) / 7)
        P.sphere(f'lump{i}', 0.024 + 0.008 * jit(i), (0.045 * q * math.cos(a), 0.045 * q * math.sin(a), z + 0.014 + 0.016 * (1 - q)), 'paint', u=14, v=10, scale=(1.0, 0.9, 0.7))
    for i in range(5):
        P.sphere(f'bubble{i}', 0.007 + 0.002 * (i % 2), (0.04 * math.cos(i * 1.9 + 0.5), 0.04 * math.sin(i * 1.9 + 0.5), z + 0.034 - 0.004 * (i % 3)), 'paint_b', u=12, v=8)
    P.tube('bone', [(-0.01, 0.0, z + 0.03), (0.02, 0.016, z + 0.06), (0.036, 0.024, z + 0.074)], 0.004, 'ceramic', segs=5)
    P.sphere('knob', 0.007, (0.038, 0.025, z + 0.076), 'ceramic', u=10, v=6)
    P.prism('fin', [(0.0, 0.0), (0.03, -0.012), (0.026, 0.0), (0.03, 0.012)], 0.003, (-0.03, -0.02, z + 0.046), 'trim', rot=D(0.0, -1.0, 2.4), bev=None)


def meal_burnt(P):
    """Left too long: black lumps, a glow still in the cracks."""
    z = plate(P)
    for i in range(8):
        a = TAU * i * 0.618
        q = math.sqrt((i + 0.5) / 8)
        chunk(P, f'coal{i}', (0.05 * q * math.cos(a), 0.05 * q * math.sin(a), z + 0.008 * (1 - q)), 0.034 - 0.006 * (i % 3), 'trim', yaw=a * 1.3)
    for i in range(5):
        P.box(f'ember{i}', (0.012, 0.004, 0.003), (0.034 * math.cos(i * 1.4), 0.034 * math.sin(i * 1.4), z + 0.03 - 0.003 * (i % 2)), 'paint', rot=D(0.3, 0.2, i * 0.9), bev=None)
    for i in range(3):
        P.sphere(f'ash{i}', 0.01, (0.07 * math.cos(i * 2.2 + 1), 0.07 * math.sin(i * 2.2 + 1), z + 0.004), 'paint_b', u=12, v=6, scale=(1.3, 1.0, 0.3))


MODELS = {f.__name__: f for f in [
    meal_stirfry, meal_cutlet, meal_fish, meal_egg, meal_omelette, meal_friedrice, meal_noodles, meal_toast, meal_pancake, meal_sandwich,
    meal_skewer, meal_roast, meal_shell, meal_sashimi, meal_dumpling, meal_stuffed, meal_curry, meal_cookie, meal_loaf,
    meal_soup, meal_stew, meal_noodlesoup, meal_congee, meal_ricebowl, meal_salad, meal_custard, meal_hotpot,
    meal_glass, meal_mug, meal_pie, meal_pizza, meal_cake, meal_mess, meal_burnt]}

# two colours of one dish that takes each shape, for the --look previews only
COLORS = {
    'meal_stirfry': (0xd8432e, 0xf4c84a), 'meal_cutlet': (0x8a4a2a, 0x4f8f3a), 'meal_fish': (0xc98a4a, 0x7fc060), 'meal_egg': (0xf4b82a, 0xb8483a),
    'meal_omelette': (0xf4c84a, 0x8a5a3a), 'meal_friedrice': (0xe8c070, 0x5fae4a), 'meal_noodles': (0xe8c070, 0xb8483a), 'meal_toast': (0xe8b060, 0xf4d870),
    'meal_pancake': (0xe8b060, 0xb0621e), 'meal_sandwich': (0x8fca5a, 0xd8432e), 'meal_skewer': (0x9a4a2a, 0x4f9a3f), 'meal_roast': (0xb86a2a, 0x5fa84a),
    'meal_shell': (0xe8603a, 0x5fa84a), 'meal_sashimi': (0xf08a5a, 0xb8303a), 'meal_dumpling': (0x8fca5a, 0x3a2a20), 'meal_stuffed': (0x4f9a3f, 0xb86a4a),
    'meal_curry': (0xc8882a, 0xd9b877), 'meal_cookie': (0xc8904a, 0x5a3a2a), 'meal_loaf': (0xb07a3a, 0x7a5a38),
    'meal_soup': (0xe8922a, 0xf4f0e0), 'meal_stew': (0x9a4a2a, 0xd9b877), 'meal_noodlesoup': (0xb86a3a, 0x8a3a2a), 'meal_congee': (0xe8a090, 0x5fae4a),
    'meal_ricebowl': (0xb8303a, 0x5fae4a), 'meal_salad': (0x8fca5a, 0xd8432e), 'meal_custard': (0xf4d870, 0xe0303a), 'meal_hotpot': (0xd86a3a, 0xc84a2a),
    'meal_glass': (0xe86a7a, 0xf4d83a), 'meal_mug': (0xc8882a, 0xf4d83a), 'meal_pie': (0xd8a03a, 0xd8382e), 'meal_pizza': (0xd8432e, 0x4f9a3f),
    'meal_cake': (0xe0303a, 0xf4e0b0), 'meal_mess': (0x6a5a7a, 0x8fa04a), 'meal_burnt': (0xe86a1e, 0x8a8a8a),
}


def _lin(h):
    c = (((h >> 16) & 255) / 255, ((h >> 8) & 255) / 255, (h & 255) / 255)
    return tuple(x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c)


def _after(P, opts):
    """--look: a cel preview in a dish's own colours, back faces culled as the game culls them."""
    if not opts.get('look'):
        return
    names = K.mc.MAT_NAMES
    saved = {k: names[k] for k in ('paint', 'paint_b')}
    for key, h in zip(('paint', 'paint_b'), COLORS.get(P.id, ())):
        names[key] = (_lin(h), saved[key][1], saved[key][2])
    try:
        for m in K.bpy.data.materials:
            m.use_backface_culling = True
        K.render_toon(P, views=[('1', 35, 34)], size=(400, 330), suffix='_look')
    finally:
        names.update(saved)


def main(args):
    table = {}
    for pid, build in MODELS.items():
        def made(P, build=build):
            P.ao_distance = 0.04
            build(P)
        table[pid] = made
    K.run(table, args, after=_after, out_dir=OUT, geo=False)
