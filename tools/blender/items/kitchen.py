"""
The kitchen's ingredients in the hand (src/core/v3/kitchen/pantry.ts, docs/V3/plan/cooking.md): one model to each of
the sixty, whole as it is found, and the thirteen shapes they take once prepared (sliced, diced, shredded, in wedges,
in florets, a fillet, minced, in strips, cracked, a mound, a nest, a pool) —

    blender -b --factory-startup --python tools/blender/build.py -- items/kitchen [<model>|all] [--norender] [--look]

Writes public/models/modcar/items/food_<id>.glb and prep_<shape>.glb: root mesh PART, origin at the bottom centre,
resting on z = 0, conventional material names only, AO in 'Col'. `paint` and `paint_b` take the ingredient's two
colours: whole, its skin and what is second on it (a tomato's red and its green calyx, a fish's back and its belly);
prepared, its flesh and its skin (one shape serves every ingredient that is cut that way). Small things seen in the
hand, on a board and in a pot: a handful of simple solids each, some 100 to 500 triangles.

--look also writes a cel preview in the ingredient's own colours (D:/modcar-scratch/parts/<id>_look_1.png), back
faces culled as the game culls them.
"""
import math

from mathutils import Matrix

from parts import _kit as K
from parts._kit import mat4
from items.junk import settle, mark, xform

OUT = 'public/models/modcar/items'
TAU = math.tau


def jit(k, a=0.0):
    """A fixed pseudo-random number in [-0.5, 0.5) (the same on every run)."""
    v = math.sin(k * 12.9898 + a * 78.233) * 43758.5453
    return (v - math.floor(v)) - 0.5


def R(x=0.0, y=0.0, z=0.0):
    """Radians in, the kit's degrees out."""
    return (math.degrees(x), math.degrees(y), math.degrees(z))


def ring(n, r, z=0.0, a0=0.0):
    return [(r * math.cos(a0 + TAU * i / n), r * math.sin(a0 + TAU * i / n), z) for i in range(n)]


def on_ell(c, rad, az, el, out=1.0):
    """The point of an ellipsoid (centre c, radii rad) in the direction of an azimuth and an elevation."""
    return (c[0] + rad[0] * math.cos(el) * math.cos(az) * out, c[1] + rad[1] * math.cos(el) * math.sin(az) * out,
            c[2] + rad[2] * math.sin(el) * out)


def leaf(P, name, base, size, yaw, tilt, mat='paint_b', shape=(1.0, 0.5, 0.12), u=8, v=4):
    """A leaf growing from `base` towards yaw, raised by tilt (radians): a flat ellipsoid `size` long."""
    d = (math.cos(yaw) * math.cos(tilt), math.sin(yaw) * math.cos(tilt), math.sin(tilt))
    c = tuple(base[i] + d[i] * size * 0.5 for i in range(3))
    P.sphere(name, size * 0.5, c, mat, u=u, v=v, scale=shape, rot=R(0.0, -tilt, yaw))


def stalk(P, z, h=0.014, mat='wood', r=0.003, x=0.0, y=0.0):
    P.cyl('stalk', r, h, (x, y, z + h / 2), mat, segs=6, r2=r * 0.8, bev=None)


# ------------------------------------------------------------------------------------------------ vegetables

def tomato(P):
    P.sphere('fruit', 0.037, (0, 0, 0.032), 'paint', u=12, v=7, scale=(1.0, 1.0, 0.86))
    for i in range(5):
        leaf(P, f'calyx{i}', (0, 0, 0.062), 0.03, TAU * i / 5 + 0.3, -0.1, shape=(1.0, 0.42, 0.16), u=6, v=4)
    stalk(P, 0.061, 0.012, 'paint_b', r=0.0035)


def potato(P):
    c, rad = (0.0, 0.0, 0.028), (0.047, 0.034, 0.028)
    P.sphere('a', 1.0, c, 'paint', u=12, v=7, scale=rad)
    P.sphere('b', 1.0, (0.03, 0.008, 0.03), 'paint', u=10, v=6, scale=(0.026, 0.024, 0.021))
    for i, (az, el) in enumerate([(2.4, 0.7), (3.6, 0.5), (4.6, 0.9), (1.2, 0.3), (5.6, 0.4)]):
        P.sphere(f'eye{i}', 0.0036, on_ell(c, rad, az, el, 0.99), 'paint_b', u=5, v=3)


def carrot(P):
    P.lathe('root', [(0.0, 0.0), (0.007, 0.004), (0.014, 0.05), (0.021, 0.105), (0.022, 0.128), (0.015, 0.14), (0.0, 0.142)], (-0.075, 0, 0.022), 'paint', axis='X', segs=10, sharp=60.0)
    for i in range(5):
        a = (i - 2) * 0.32
        P.tube(f'top{i}', [(0.064, 0, 0.022), (0.09, 0.03 * math.sin(a), 0.024 + 0.006 * (i % 2)), (0.118 - 0.008 * abs(i - 2), 0.07 * math.sin(a), 0.03 + 0.01 * (i % 2))], 0.0048, 'paint_b', segs=5, radius_fn=lambda t: 1.0 + 0.6 * t)


def onion(P):
    P.lathe('bulb', [(0.0, 0.0), (0.026, 0.003), (0.044, 0.026), (0.042, 0.046), (0.026, 0.062), (0.01, 0.07), (0.0055, 0.078), (0.0, 0.079)], (0, 0, 0), 'paint', segs=12, sharp=70.0)
    P.cyl('root', 0.011, 0.005, (0, 0, 0.0015), 'paint_b', segs=8, bev=None)
    P.cyl('tip', 0.0062, 0.008, (0, 0, 0.081), 'paint_b', segs=6, r2=0.003, bev=None)


def cabbage(P):
    P.sphere('head', 0.06, (0, 0, 0.056), 'paint', u=12, v=7, scale=(1.0, 1.0, 0.92))
    for i, (x, y, _) in enumerate(ring(5, 0.03)):
        P.sphere(f'leaf{i}', 0.058, (x, y, 0.046), 'paint_b', u=8, v=6, scale=(0.5, 1.0, 0.86), rot=R(0.0, 0.25, math.atan2(y, x)))


def cucumber(P):
    P.tube('body', [(-0.085, 0.0, 0.021), (-0.03, 0.007, 0.021), (0.03, 0.007, 0.021), (0.085, 0.0, 0.021)], 0.02, 'paint', segs=9, radius_fn=lambda t: 0.66 + 1.36 * t * (1 - t))
    P.sphere('tip', 0.007, (0.088, 0.0, 0.021), 'paint_b', u=6, v=4)


def corn(P):
    P.lathe('cob', [(0.0, 0.0), (0.014, 0.004), (0.024, 0.03), (0.025, 0.09), (0.016, 0.135), (0.0, 0.148)], (-0.06, 0, 0.026), 'paint', axis='X', segs=10, sharp=70.0)
    for i in range(3):
        a = TAU * i / 3 + 0.5
        leaf(P, f'husk{i}', (-0.064, 0.017 * math.cos(a), 0.026 + 0.017 * math.sin(a)), 0.105, 0.3 * math.cos(a), 0.26 * math.sin(a) + 0.03, shape=(1.0, 0.4, 0.3), u=7, v=4)
    P.cyl('stem', 0.008, 0.02, (-0.066, 0, 0.026), 'paint_b', axis='X', segs=6, bev=None)


def lettuce(P):
    P.sphere('heart', 0.03, (0, 0, 0.036), 'paint_b', u=9, v=6, scale=(1.0, 1.0, 1.1))
    for k, (n, size, tilt) in enumerate([(5, 0.085, 1.0), (7, 0.1, 0.62)]):
        for i in range(n):
            leaf(P, f'l{k}{i}', (0, 0, 0.006), size, TAU * i / n + k * 0.45, tilt, 'paint', shape=(1.0, 0.86, 0.2), u=8, v=5)


def pepper(P):
    for i, (x, y, _) in enumerate(ring(4, 0.016, a0=0.4)):
        P.sphere(f'lobe{i}', 0.024, (x, y, 0.039), 'paint', u=8, v=6, scale=(1.0, 1.0, 1.62))
    P.cyl('stalk', 0.006, 0.022, (0.0, 0.0, 0.082), 'paint_b', segs=6, r2=0.0045, rot=R(0.0, 0.2, 0.0), bev=None)
    P.cyl('cap', 0.014, 0.006, (0.0, 0.0, 0.072), 'paint_b', segs=7, bev=None)


def eggplant(P):
    P.lathe('body', [(0.0, 0.0), (0.021, 0.006), (0.038, 0.045), (0.034, 0.09), (0.022, 0.135), (0.013, 0.15), (0.0, 0.152)], (-0.08, 0, 0.038), 'paint', axis='X', segs=10, sharp=70.0)
    P.lathe('calyx', [(0.0, 0.0), (0.017, 0.0), (0.021, 0.014), (0.007, 0.02), (0.0045, 0.04), (0.0, 0.04)], (0.06, 0, 0.038), 'paint_b', axis='X', segs=7, sharp=60.0)


def pumpkin(P):
    for i, (x, y, _) in enumerate(ring(8, 0.034)):
        P.sphere(f'lobe{i}', 0.05, (x, y, 0.052), 'paint', u=8, v=6, scale=(0.9, 0.9, 1.04))
    P.cyl('stalk', 0.008, 0.03, (0.0, 0.0, 0.108), 'paint_b', segs=6, r2=0.006, rot=R(0.0, 0.15, 0.0), bev=None)


def broccoli(P):
    P.cyl('stem', 0.016, 0.06, (0, 0, 0.03), 'paint_b', segs=7, r2=0.02, bev=None)
    for i, (x, y, _) in enumerate(ring(7, 0.032) + [(0.0, 0.0, 0.0)]):
        P.sphere(f'floret{i}', 0.026 + 0.004 * jit(i), (x, y, 0.074 + (0.016 if i == 7 else 0.006 * jit(i, 2))), 'paint', u=7, v=5)


def garlic(P):
    for i, (x, y, _) in enumerate(ring(6, 0.013)):
        P.sphere(f'clove{i}', 0.016, (x, y, 0.022), 'paint', u=7, v=5, scale=(1.0, 1.0, 1.35))
    P.cyl('neck', 0.008, 0.026, (0, 0, 0.05), 'paint', segs=6, r2=0.0035, bev=None)
    P.cyl('root', 0.009, 0.004, (0, 0, 0.002), 'paint_b', segs=7, bev=None)


def scallion(P):
    for i in range(4):
        y = 0.009 * (i - 1.5)
        P.tube(f'white{i}', [(-0.11, y, 0.008), (-0.045, y, 0.008)], 0.0066, 'paint_b', segs=6)
        P.tube(f'green{i}', [(-0.047, y, 0.008), (0.03, y * 1.8, 0.009), (0.11, y * 3.4, 0.008 + 0.005 * i)], 0.0056, 'paint', segs=6)


def ginger(P):
    for i, (x, y, r) in enumerate([(0.0, 0.0, 0.024), (0.03, 0.012, 0.018), (-0.03, 0.006, 0.019), (0.012, -0.024, 0.015), (0.05, 0.03, 0.012)]):
        P.sphere(f'knob{i}', r, (x, y, r * 0.9), 'paint', u=8, v=5, scale=(1.25, 1.0, 0.85))
    P.cyl('cut', 0.012, 0.004, (-0.054, 0.006, 0.018), 'paint_b', axis='X', segs=7, bev=None)


def chili(P):
    P.tube('pod', [(-0.06, 0.0, 0.013), (-0.02, 0.009, 0.013), (0.03, 0.007, 0.013), (0.07, -0.014, 0.013)], 0.013, 'paint', segs=8, radius_fn=lambda t: 1.0 - 0.86 * t)
    P.tube('stem', [(-0.06, 0.0, 0.013), (-0.074, -0.004, 0.018), (-0.084, -0.012, 0.026)], 0.0034, 'paint_b', segs=5)
    P.cyl('cap', 0.0105, 0.006, (-0.061, 0.0, 0.013), 'paint_b', axis='X', segs=7, bev=None)


# ------------------------------------------------------------------------------------------------ mushrooms, greens

def cap(P, name, r, z, mat='paint', dome=0.6, loc=(0, 0)):
    P.lathe(name, [(0.0, 0.0), (r * 0.6, -r * 0.04), (r, 0.0), (r * 0.96, r * dome * 0.3), (r * 0.6, r * dome * 0.8), (0.0, r * dome)], (loc[0], loc[1], z), mat, segs=10, sharp=70.0)


def stem(P, name, r, h, mat='paint_b', loc=(0, 0), r2=None):
    P.cyl(name, r, h, (loc[0], loc[1], h / 2), mat, segs=7, r2=r2 or r * 0.8, bev=None)


def funnel(P, name, r, h, loc, lean, yaw, mat='paint', stem_mat='paint_b'):
    """A funnel of a mushroom (a chanterelle, an oyster's fan) leaning away from the upright towards yaw."""
    rot = R(0.0, lean, yaw)
    P.lathe(name, [(r * 0.22, h * 0.42), (r * 0.62, h * 0.86), (r, h), (r * 0.92, h * 1.07), (r * 0.3, h * 0.97), (0.0, h * 0.93)], loc, mat, rot=rot, segs=9, sharp=70.0)
    P.lathe(name + 's', [(0.0, 0.0), (r * 0.2, 0.0), (r * 0.22, h * 0.42)], loc, stem_mat, rot=rot, segs=9, sharp=70.0)


def oyster(P):
    for i, (r, h, lean, yaw) in enumerate([(0.04, 0.058, 0.5, 0.2), (0.034, 0.05, 0.62, 2.1), (0.03, 0.046, 0.6, 4.0), (0.024, 0.066, 0.1, 5.2)]):
        funnel(P, f'fan{i}', r, h, (0.0, 0.0, 0.0), lean, yaw)


def shiitake(P):
    stem(P, 'stem', 0.009, 0.035)
    cap(P, 'cap', 0.036, 0.032, dome=0.5)
    stem(P, 'stem2', 0.007, 0.022, loc=(0.05, 0.022))
    cap(P, 'cap2', 0.024, 0.02, dome=0.5, loc=(0.05, 0.022))


def porcini(P):
    P.lathe('stem', [(0.0, 0.0), (0.024, 0.0), (0.028, 0.02), (0.02, 0.05), (0.0, 0.052)], (0, 0, 0), 'paint_b', segs=9, sharp=60.0)
    cap(P, 'cap', 0.042, 0.046, dome=0.75)


def chanterelle(P):
    funnel(P, 'a', 0.04, 0.064, (0.0, 0.0, 0.0), 0.0, 0.0, 'paint', 'paint')
    funnel(P, 'b', 0.022, 0.036, (0.042, 0.016, 0.0), 0.2, 0.4, 'paint', 'paint')
    P.torus('gill', 0.03, 0.004, (0, 0, 0.056), 'paint_b', segs=9, rsegs=4)


def matsutake(P):
    P.lathe('stem', [(0.0, 0.0), (0.016, 0.0), (0.019, 0.03), (0.015, 0.085), (0.0, 0.086)], (0, 0, 0), 'paint_b', segs=9, sharp=60.0)
    cap(P, 'cap', 0.028, 0.078, dome=0.9)
    P.torus('veil', 0.0165, 0.003, (0, 0, 0.066), 'paint', segs=9, rsegs=4)


def truffle(P):
    for i in range(6):
        P.sphere(f'lump{i}', 0.018 + 0.004 * jit(i), (0.014 * jit(i, 1) * 2, 0.014 * jit(i, 2) * 2, 0.02 + 0.008 * jit(i, 3)), 'paint', u=7, v=5)
    P.cyl('cut', 0.0135, 0.006, (0.0235, 0.002, 0.021), 'paint_b', axis='X', segs=8, bev=None)


def shepherds(P):
    for i in range(9):
        leaf(P, f'leaf{i}', (0, 0, 0.004), 0.075 - 0.012 * (i % 2), TAU * i / 9, 0.22 + 0.2 * (i % 3), 'paint', shape=(1.0, 0.3, 0.1), u=7, v=4)
    P.tube('root', [(0, 0, 0.006), (-0.012, 0.004, 0.004), (-0.03, 0.0, 0.003)], 0.004, 'paint_b', segs=5, radius_fn=lambda t: 1.0 - 0.7 * t)


def mint(P):
    P.tube('stem', [(-0.05, 0.0, 0.004), (0.0, 0.004, 0.014), (0.05, 0.0, 0.034)], 0.003, 'paint_b', segs=5)
    for i in range(7):
        t = i / 6
        s = 1 if i % 2 else -1
        leaf(P, f'leaf{i}', (-0.04 + 0.085 * t, 0.0, 0.007 + 0.025 * t), 0.044 - 0.014 * t, s * 1.2 if i < 6 else 0.0, 0.25, 'paint', shape=(1.0, 0.62, 0.16), u=7, v=4)


def bamboo(P):
    P.lathe('shoot', [(0.0, 0.0), (0.03, 0.0), (0.034, 0.02), (0.026, 0.07), (0.012, 0.115), (0.0, 0.135)], (0, 0, 0), 'paint', segs=9, sharp=70.0)
    for i in range(4):
        z = 0.012 + 0.028 * i
        P.lathe(f'sheath{i}', [(0.0345 - 0.0055 * i, z), (0.036 - 0.0055 * i, z + 0.004), (0.031 - 0.006 * i, z + 0.03)], (0, 0, 0), 'paint_b', segs=9, sharp=80.0)


# ------------------------------------------------------------------------------------------------ fruit

def apple(P):
    P.lathe('fruit', [(0.0, 0.006), (0.02, 0.0), (0.036, 0.018), (0.039, 0.042), (0.029, 0.064), (0.011, 0.069), (0.0, 0.06)], (0, 0, 0), 'paint', segs=12, sharp=80.0)
    stalk(P, 0.06, 0.018)
    leaf(P, 'leaf', (0.0, 0.0, 0.074), 0.034, 0.3, 0.3, shape=(1.0, 0.52, 0.12))


def berry(P):
    for i in range(11):
        P.sphere(f'b{i}', 0.011, (0.02 * jit(i) * 2, 0.02 * jit(i, 1) * 2, 0.011 + 0.008 * (i % 3)), 'paint', u=7, v=5)
    for i in range(2):
        leaf(P, f'leaf{i}', (0.0, 0.0, 0.03), 0.034, 0.6 + i * 2.6, 0.2, shape=(1.0, 0.56, 0.14))


def strawberry(P):
    prof = [(0.0, 0.0), (0.009, 0.004), (0.025, 0.03), (0.028, 0.045), (0.019, 0.057), (0.0, 0.057)]
    P.lathe('fruit', prof, (0, 0, 0), 'paint', segs=10, sharp=80.0)
    for i in range(6):
        leaf(P, f'calyx{i}', (0, 0, 0.057), 0.024, TAU * i / 6, -0.12, shape=(1.0, 0.46, 0.2), u=6, v=4)
    stalk(P, 0.056, 0.012, 'paint_b')
    for i in range(9):
        a = TAU * (i // 2 * 2 + 0.5) / 10 + TAU / 20 * (i % 2)       # (on the faces of a ten-sided fruit, not on its edges)
        z = 0.018 + 0.017 * (i % 2)
        r = (0.004 + 0.021 * z / 0.03 if z < 0.03 else 0.025 + 0.003 * (z - 0.03) / 0.015) * math.cos(TAU / 20)
        P.sphere(f'seed{i}', 0.0017, (r * math.cos(a), r * math.sin(a), z), 'ceramic', u=4, v=3)


def orange(P):
    P.sphere('fruit', 0.04, (0, 0, 0.039), 'paint', u=12, v=7, scale=(1.0, 1.0, 0.96))
    P.cyl('navel', 0.005, 0.003, (0, 0, 0.0775), 'paint_b', segs=6, bev=None)


def lemon(P):
    P.lathe('fruit', [(0.0, 0.0), (0.006, 0.004), (0.022, 0.02), (0.03, 0.045), (0.022, 0.07), (0.007, 0.086), (0.0, 0.09)], (-0.045, 0, 0.03), 'paint', axis='X', segs=10, sharp=80.0)
    P.sphere('tip', 0.0045, (0.046, 0, 0.03), 'paint_b', u=5, v=3)


def banana(P):
    for i in range(3):
        y = 0.026 * (i - 1)
        P.tube(f'b{i}', [(-0.075, y * 0.4, 0.05), (-0.04, y, 0.024), (0.02, y * 1.2, 0.017), (0.075, y * 1.1, 0.036)], 0.016, 'paint', segs=6, radius_fn=lambda t: 0.6 + 1.6 * t * (1 - t))
        P.sphere(f'tip{i}', 0.006, (0.078, y * 1.1, 0.037), 'paint_b', u=5, v=3)
    P.cyl('crown', 0.011, 0.022, (-0.078, 0.0, 0.054), 'paint_b', segs=6, rot=R(0.0, 0.9, 0.0), bev=None)


def watermelon(P):
    prof = [(0.0, 0.0), (0.05, 0.012), (0.085, 0.05), (0.098, 0.11), (0.085, 0.17), (0.05, 0.208), (0.0, 0.22)]
    wide, thin = TAU / 6 * 0.64, TAU / 6 * 0.36
    for i in range(6):
        a = TAU * i / 6
        P.lathe(f'rind{i}', prof, (-0.11, 0, 0.098), 'paint', axis='X', segs=2, angle=wide, start=a, sharp=80.0)
        P.lathe(f'stripe{i}', prof, (-0.11, 0, 0.098), 'paint_b', axis='X', segs=1, angle=thin, start=a + wide, sharp=80.0)
    P.tube('stalk', [(0.108, 0, 0.098), (0.122, 0.0, 0.104), (0.13, 0.008, 0.116)], 0.004, 'wood', segs=5)


# ------------------------------------------------------------------------------------------------ grain

def rice(P):
    P.lathe('sack', [(0.0, 0.0), (0.05, 0.0), (0.063, 0.02), (0.066, 0.07), (0.052, 0.108), (0.023, 0.124), (0.021, 0.132), (0.036, 0.15), (0.031, 0.154), (0.0, 0.142)], (0, 0, 0), 'paint', segs=10, sharp=70.0)
    P.torus('tie', 0.0225, 0.005, (0, 0, 0.128), 'paint_b', segs=10, rsegs=4)
    P.lathe('band', [(0.0657, 0.04), (0.0675, 0.07), (0.0609, 0.088)], (0, 0, 0), 'paint_b', segs=2, sharp=80.0, angle=TAU * 0.2, start=-TAU * 0.1)


def flour(P):
    P.box('bag', (0.09, 0.07, 0.14), (0, 0, 0.07), 'paint_b', bev=0.008)
    P.box('fold', (0.094, 0.074, 0.02), (0, 0, 0.142), 'paint_b', rot=R(0.25, 0, 0), bev=0.004)
    P.box('label', (0.004, 0.05, 0.05), (0.046, 0, 0.075), 'paint', bev=None)


def noodle(P):
    for i, (y, z, _) in enumerate(ring(7, 0.012) + [(0.0, 0.0, 0.0)]):
        P.cyl(f'n{i}', 0.0045, 0.2, (0, y, 0.018 + z), 'paint', segs=5, axis='X', bev=None)
    P.cyl('band', 0.02, 0.022, (0, 0, 0.018), 'paint_b', segs=9, axis='X', bev=None)


def bread(P):
    P.lathe('loaf', [(0.0, 0.0), (0.03, 0.008), (0.043, 0.04), (0.046, 0.085), (0.043, 0.13), (0.03, 0.162), (0.0, 0.17)], (-0.085, 0, 0.046), 'paint', axis='X', segs=10, sharp=80.0)
    for i in range(3):
        P.sphere(f'slash{i}', 0.026, (-0.04 + 0.04 * i, 0, 0.089), 'paint_b', u=6, v=4, scale=(0.22, 1.0, 0.16), rot=R(0, 0, 0.5))


def bean(P):
    P.lathe('dish', [(0.0, 0.0), (0.04, 0.0), (0.055, 0.022), (0.052, 0.024), (0.038, 0.006), (0.0, 0.006)], (0, 0, 0), 'ceramic', segs=12, sharp=60.0)
    for i in range(14):
        P.sphere(f'bean{i}', 0.008, (0.03 * jit(i) * 2, 0.03 * jit(i, 1) * 2, 0.012 + 0.006 * (i % 3)), 'paint', u=6, v=4, scale=(1.4, 0.9, 0.8), rot=R(0, 0, jit(i, 2) * 6))


# ------------------------------------------------------------------------------------------------ eggs, dairy

def ovoid(P, name, r, loc, mat='paint', yaw=0.0):
    """An egg lying on its side."""
    P.sphere(name, r, (loc[0], loc[1], r), mat, u=10, v=7, scale=(1.3, 1.0, 1.0), rot=R(0, 0, yaw))


def egg(P):
    ovoid(P, 'egg', 0.023, (0, 0))
    P.sphere('shine', 0.006, on_ell((0, 0, 0.023), (0.03, 0.023, 0.023), 2.2, 0.9, 0.96), 'paint_b', u=5, v=3, scale=(1.4, 1.0, 0.5))


def wildegg(P):
    for k, (x, y, r, yaw) in enumerate([(0.0, 0.016, 0.019, 0.3), (0.012, -0.03, 0.018, 1.9)]):
        ovoid(P, f'egg{k}', r, (x, y), yaw=yaw)
        for i in range(6):
            az, el = TAU * i / 6 + k, 0.5 + 0.5 * jit(i, k)
            P.sphere(f'speck{k}{i}', 0.0026, on_ell((x, y, r), (r * 1.1, r * 1.1, r), az, el, 0.96), 'paint_b', u=5, v=3)


def milk(P):
    P.lathe('bottle', [(0.0, 0.0), (0.034, 0.0), (0.036, 0.01), (0.036, 0.11), (0.02, 0.145), (0.018, 0.17), (0.0, 0.17)], (0, 0, 0), 'ceramic', segs=12, sharp=60.0)
    P.cyl('cap', 0.021, 0.014, (0, 0, 0.176), 'paint', segs=10, bev=None)
    P.cyl('label', 0.0368, 0.045, (0, 0, 0.07), 'paint_b', segs=12, bev=None)


def butter(P):
    P.box('paper', (0.11, 0.07, 0.003), (0, 0, 0.0015), 'paint_b', bev=None)
    P.box('block', (0.085, 0.045, 0.035), (0, 0, 0.02), 'paint', bev=0.004)
    P.box('pat', (0.018, 0.045, 0.035), (0.062, 0.006, 0.02), 'paint', rot=R(0, 0, 0.3), bev=0.003)


def cheese(P):
    P.prism('wedge', [(0.0, 0.0), (0.11, -0.036), (0.11, 0.036)], 0.05, (-0.055, 0, 0.025), 'paint', bev=0.004)
    P.box('rind', (0.006, 0.074, 0.05), (0.057, 0, 0.025), 'paint_b', bev=0.002)
    for i, (x, y) in enumerate([(-0.012, 0.0), (0.014, 0.012), (0.032, -0.014), (0.04, 0.016)]):
        P.cyl(f'hole{i}', 0.006 + 0.002 * (i % 2), 0.0016, (x, y, 0.0505), 'paint_b', segs=7, bev=None)


# ------------------------------------------------------------------------------------------------ meat

def chicken(P):
    P.lathe('leg', [(0.0, 0.0), (0.024, 0.006), (0.037, 0.04), (0.03, 0.075), (0.013, 0.1), (0.0, 0.1)], (-0.07, 0, 0.037), 'paint', axis='X', segs=10, sharp=80.0)
    P.cyl('bone', 0.0075, 0.05, (0.05, 0, 0.037), 'ceramic', segs=6, axis='X', bev=None)
    P.sphere('knob', 0.012, (0.078, 0, 0.037), 'ceramic', u=7, v=4)
    P.sphere('skin', 0.033, (-0.036, 0, 0.043), 'paint_b', u=9, v=5, scale=(1.2, 1.02, 0.9))


def pork(P):
    for i, (y, w, m) in enumerate([(-0.031, 0.03, 'paint'), (-0.01, 0.012, 'paint_b'), (0.011, 0.03, 'paint'), (0.034, 0.016, 'paint_b')]):
        P.box(f'layer{i}', (0.13, w, 0.036 - 0.002 * (i % 2)), (0, y, 0.018), m, bev=0.004)


def bacon(P):
    # (a sweep's section: its first axis stands up from the path, its second lies across it)
    lean = [(-0.0025, -0.015), (0.0025, -0.015), (0.0025, 0.007), (-0.0025, 0.007)]
    fat = [(-0.0025, 0.007), (0.0025, 0.007), (0.0025, 0.016), (-0.0025, 0.016)]
    for i in range(3):
        y = 0.036 * (i - 1)
        pts = [(-0.08 + 0.032 * k, y + 0.003 * math.sin(k * 2.0 + i), 0.006 + 0.0035 * math.sin(k * 1.9 + i * 1.3)) for k in range(6)]
        P.tube(f'lean{i}', pts, 1.0, 'paint', profile=lean, bend=0.0, sharp=60.0)
        P.tube(f'fat{i}', pts, 1.0, 'paint_b', profile=fat, bend=0.0, sharp=60.0)


def oval(a, b, n=10, k=0.0):
    """An egg-shaped outline, anticlockwise: blunter towards +x by k."""
    return [((a + k * a * math.cos(TAU * i / n)) * math.cos(TAU * i / n), b * math.sin(TAU * i / n)) for i in range(n)]


def duck(P):
    P.prism('breast', oval(0.072, 0.045, 12, 0.14), 0.03, (0, 0, 0.015), 'paint', bev=0.006)
    P.prism('skin', oval(0.068, 0.041, 12, 0.14), 0.008, (0, 0, 0.034), 'paint_b', bev=0.003)
    for i in range(4):
        P.box(f'score{i}', (0.003, 0.06 - 0.012 * abs(i - 1.5), 0.003), (-0.036 + 0.026 * i, 0, 0.0385), 'paint', rot=R(0, 0, 0.5), bev=None)


def beef(P):
    P.prism('steak', oval(0.076, 0.05, 12, 0.1), 0.028, (0, 0, 0.014), 'paint', bev=0.006)
    P.tube('fat', [(-0.066, 0.02, 0.014), (-0.03, 0.045, 0.014), (0.03, 0.048, 0.014), (0.072, 0.026, 0.014)], 0.012, 'paint_b', segs=6)
    for i in range(3):
        P.box(f'marble{i}', (0.04, 0.0035, 0.0295), (-0.03 + 0.03 * i, -0.012 + 0.012 * i, 0.014), 'paint_b', rot=R(0, 0, 0.4 + 0.3 * i), bev=None)


def lamb(P):
    P.sphere('eye', 0.04, (-0.03, 0, 0.018), 'paint', u=10, v=5, scale=(1.2, 1.0, 0.45))
    P.tube('fat', [(-0.074, 0.01, 0.018), (-0.044, 0.04, 0.018), (0.0, 0.034, 0.018)], 0.01, 'paint_b', segs=6)
    P.tube('bone', [(0.0, 0.0, 0.016), (0.06, -0.012, 0.016), (0.118, -0.03, 0.018)], 0.0095, 'ceramic', segs=6)


def venison(P):
    P.sphere('haunch', 1.0, (0, 0, 0.027), 'paint', u=10, v=6, scale=(0.07, 0.045, 0.027))
    P.cyl('bone', 0.009, 0.05, (0.085, 0, 0.027), 'ceramic', segs=6, axis='X', bev=None)
    P.sphere('knob', 0.013, (0.112, 0, 0.027), 'ceramic', u=6, v=4)
    P.sphere('silver', 1.0, (-0.012, 0.022, 0.032), 'paint_b', u=8, v=4, scale=(0.045, 0.02, 0.022))


# ------------------------------------------------------------------------------------------------ fish, shellfish

def fish(P, L, h, w, tail=0.5, moon=False):
    """A fish lying on its side along x, its head at +x: its back in `paint`, its belly in `paint_b`."""
    zc = w / 2
    P.sphere('body', 0.5, (0.0, 0.0, zc), 'paint', u=12, v=7, scale=(L, h, w))
    P.sphere('belly', 0.5, (L * 0.03, -h * 0.19, zc), 'paint_b', u=10, v=6, scale=(L * 0.84, h * 0.64, w * 1.06))
    a, b = L * 0.2, h * tail
    poly = [(0.0, 0.0), (-a * 0.5, b * 0.8), (-a, b), (-a * 0.56, 0.0), (-a, -b), (-a * 0.5, -b * 0.8)] if moon else [(0.0, 0.0), (-a, b), (-a * 0.68, 0.0), (-a, -b)]
    P.prism('tail', poly, w * 0.22, (-L * 0.44, 0.0, zc), 'paint', bev=None)
    P.prism('fin', [(0.0, 0.0), (L * 0.22, 0.0), (L * 0.05, h * 0.26)], w * 0.18, (-L * 0.12, h * 0.4, zc), 'paint', bev=None)
    leaf(P, 'pec', (L * 0.2, -h * 0.1, w * 0.96), L * 0.14, math.pi + 0.5, 0.12, 'paint', shape=(1.0, 0.5, 0.2), u=6, v=4)
    P.sphere('eye', h * 0.075, (L * 0.37, h * 0.1, w * 0.9), 'trim', u=6, v=4)


def brookfish(P):
    fish(P, 0.15, 0.046, 0.03)


def trout(P):
    fish(P, 0.24, 0.068, 0.042)
    for i in range(6):
        x = -0.06 + 0.028 * i
        y = 0.014 + 0.008 * jit(i) * 2
        z = 0.021 * (1.0 + math.sqrt(max(0.0, 1.0 - (x / 0.12) ** 2 - (y / 0.034) ** 2)))
        P.sphere(f'spot{i}', 0.0042, (x, y, z), 'trim', u=5, v=3)


def salmon(P):
    fish(P, 0.34, 0.098, 0.06, tail=0.55)


def tuna(P):
    fish(P, 0.42, 0.15, 0.11, tail=0.72, moon=True)
    P.prism('fin2', [(0.0, 0.0), (0.0, -0.06), (0.08, 0.0)], 0.014, (-0.04, -0.066, 0.055), 'paint', bev=None)


def shrimp(P):
    pts = [(0.045 * math.cos(a), 0.045 * math.sin(a), 0.014) for a in [0.2 + 0.42 * k for k in range(8)]]
    P.tube('body', pts, 0.015, 'paint', segs=7, radius_fn=lambda t: 1.0 - 0.6 * t)
    P.prism('tail', [(0.0, 0.0), (0.03, -0.014), (0.03, 0.014)], 0.006, (pts[-1][0], pts[-1][1], 0.014), 'paint_b', rot=R(0, 0, 3.4), bev=None)
    P.sphere('head', 0.017, (pts[0][0] + 0.006, pts[0][1] - 0.012, 0.015), 'paint', u=8, v=5, scale=(1.3, 0.9, 0.9))
    for s in (-1, 1):
        P.tube(f'feeler{s}', [(pts[0][0] + 0.02, pts[0][1] - 0.02, 0.016), (pts[0][0] + 0.06, pts[0][1] - 0.03 + 0.012 * s, 0.01)], 0.0018, 'paint_b', segs=4)
    P.sphere('eye', 0.0035, (pts[0][0] + 0.02, pts[0][1] - 0.016, 0.024), 'trim', u=5, v=3)


def shell(P, name, mat, up=1.0):
    """Half of a clam, its hinge at the origin and its lip towards +x."""
    P.sphere(name, 0.03, (0.03, 0.0, 0.0), mat, u=10, v=5, scale=(1.0, 0.9, 0.34))
    if up > 0:
        for k in range(5):
            a = (k - 2) * 0.5
            rim = (0.03 + 0.029 * math.cos(a), 0.026 * math.sin(a), 0.002)
            P.tube(f'{name}r{k}', [(0.004, 0.0, 0.004), ((0.004 + rim[0]) / 2, rim[1] / 2, 0.0112), rim], 0.0022, 'paint_b', segs=4)


def clam(P):
    # one shut
    m = mark(P)
    shell(P, 'a_top', 'paint')
    xform(P, m, mat4((0.0, 0.0, 0.016)))
    m = mark(P)
    shell(P, 'a_bot', 'paint_b', up=0.0)
    xform(P, m, mat4((0.0, 0.0, 0.009)))
    # one open: its upper shell swung up about the hinge, its meat showing
    m = mark(P)
    shell(P, 'b_top', 'paint')
    xform(P, m, mat4((0.0, 0.0, 0.014), R(0.0, -0.75, 0.0)))
    k = mark(P)
    shell(P, 'b_bot', 'paint_b', up=0.0)
    P.sphere('meat', 0.016, (0.03, 0.0, 0.009), 'ceramic', u=7, v=4, scale=(1.1, 1.0, 0.6))
    xform(P, k, mat4((0.0, 0.0, 0.009)))
    xform(P, m, mat4((0.03, 0.056, 0.0), R(0.0, 0.0, 2.2)))


def crab(P):
    P.sphere('shell', 0.05, (0, 0, 0.026), 'paint', u=10, v=6, scale=(0.8, 1.2, 0.42))
    for s in (-1, 1):
        P.tube(f'arm{s}', [(0.02, 0.05 * s, 0.022), (0.06, 0.07 * s, 0.024), (0.085, 0.045 * s, 0.024)], 0.01, 'paint', segs=5)
        P.sphere(f'claw{s}', 0.02, (0.095, 0.036 * s, 0.024), 'paint_b', u=7, v=5, scale=(1.4, 0.8, 0.7))
        for i in range(3):
            y0 = 0.055 * s
            P.tube(f'leg{s}{i}', [(-0.015 * i, y0, 0.02), (-0.01 - 0.02 * i, y0 + 0.035 * s, 0.03), (-0.02 - 0.03 * i, y0 + 0.06 * s, 0.004)], 0.005, 'paint', segs=4)
        P.sphere(f'eye{s}', 0.005, (0.04, 0.014 * s, 0.04), 'trim', u=5, v=3)


def lobster(P):
    P.lathe('head', [(0.0, 0.0), (0.02, 0.006), (0.03, 0.05), (0.026, 0.1), (0.0, 0.105)], (0.0, 0, 0.03), 'paint', axis='X', segs=8, sharp=80.0)
    for i in range(5):
        P.sphere(f'seg{i}', 0.028 - 0.003 * i, (-0.02 - 0.028 * i, 0, 0.028 - 0.002 * i), 'paint', u=7, v=5, scale=(0.7, 1.0, 0.8))
    P.prism('fan', [(0.0, 0.0), (-0.05, 0.04), (-0.06, 0.0), (-0.05, -0.04)], 0.008, (-0.15, 0, 0.012), 'paint_b', bev=None)
    for s in (-1, 1):
        P.tube(f'arm{s}', [(0.08, 0.02 * s, 0.026), (0.13, 0.06 * s, 0.03), (0.175, 0.05 * s, 0.03)], 0.011, 'paint', segs=5)
        P.sphere(f'claw{s}', 0.03, (0.2, 0.046 * s, 0.03), 'paint_b', u=7, v=5, scale=(1.5, 0.75, 0.6))
        P.tube(f'feeler{s}', [(0.1, 0.008 * s, 0.04), (0.17, 0.03 * s, 0.07), (0.24, 0.07 * s, 0.05)], 0.002, 'paint_b', segs=4)
        for i in range(3):
            P.tube(f'leg{s}{i}', [(0.04 - 0.025 * i, 0.02 * s, 0.02), (0.04 - 0.025 * i, 0.055 * s, 0.03), (0.035 - 0.025 * i, 0.075 * s, 0.003)], 0.004, 'paint', segs=4)
        P.sphere(f'eye{s}', 0.005, (0.098, 0.012 * s, 0.05), 'trim', u=5, v=3)


# ------------------------------------------------------------------------------------------------ the rest

def walnut(P):
    for i, (x, y) in enumerate([(0.0, 0.0), (0.04, 0.012), (0.014, 0.04)]):
        P.sphere(f'nut{i}', 0.019, (x, y, 0.018), 'paint', u=8, v=6, scale=(1.0, 0.92, 0.95), rot=R(0, 0, i * 1.1))
        P.torus(f'seam{i}', 0.0185, 0.0022, (x, y, 0.018), 'paint_b', segs=10, rsegs=4, rot=R(math.pi / 2, 0, i * 1.1))


def honey(P):
    P.lathe('jar', [(0.0, 0.0), (0.032, 0.0), (0.038, 0.012), (0.038, 0.07), (0.03, 0.082), (0.03, 0.09), (0.0, 0.09)], (0, 0, 0), 'paint', segs=12, sharp=60.0)
    P.cyl('lid', 0.033, 0.014, (0, 0, 0.097), 'paint_b', segs=12, bev=0.002)
    P.lathe('label', [(0.0388, 0.03), (0.0388, 0.058)], (0, 0, 0), 'ceramic', segs=4, angle=TAU * 0.22, start=-TAU * 0.11, sharp=80.0)


def tofu(P):
    P.box('block', (0.1, 0.075, 0.045), (0, 0, 0.0225), 'paint', bev=0.006)
    P.box('tray', (0.115, 0.09, 0.004), (0, 0, 0.002), 'paint_b', bev=None)


FOODS = [tomato, potato, carrot, onion, cabbage, cucumber, corn, lettuce, pepper, eggplant, pumpkin, broccoli, garlic, scallion, ginger, chili,
         oyster, shiitake, porcini, chanterelle, matsutake, truffle, shepherds, mint, bamboo,
         apple, berry, strawberry, orange, lemon, banana, watermelon, rice, flour, noodle, bread, bean,
         egg, wildegg, milk, butter, cheese, chicken, pork, bacon, duck, beef, lamb, venison,
         brookfish, trout, salmon, tuna, shrimp, clam, crab, lobster, walnut, honey, tofu]


# ------------------------------------------------------------------------------------------------ prepared
# What an ingredient becomes on the board and what lies in the pot: `paint` its flesh, `paint_b` its skin.

def prep_slices(P):
    """Five round slices fallen over one another."""
    for i in range(5):
        x = -0.04 + 0.02 * i
        rot = R(0.0, 1.05 if i else math.pi / 2, 0.0)
        P.cyl(f'flesh{i}', 0.021, 0.006, (x, 0.004 * jit(i) * 2, 0.012 if i else 0.003), 'paint', segs=10, rot=rot, bev=None)
        P.torus(f'skin{i}', 0.021, 0.0032, (x, 0.004 * jit(i) * 2, 0.012 if i else 0.003), 'paint_b', segs=10, rsegs=4, rot=rot)


def prep_dice(P):
    """A small heap of cubes."""
    for i, (x, y, z, yaw) in enumerate([(-0.022, -0.014, 0, 0.2), (0.012, -0.02, 0, 0.9), (0.03, 0.01, 0, 0.4), (-0.004, 0.02, 0, 1.2), (-0.03, 0.016, 0, 0.7), (0.002, -0.002, 1, 0.5), (0.018, 0.008, 1, 1.0)]):
        s = 0.021 - 0.002 * (i % 3)
        P.box(f'cube{i}', (s, s, s), (x, y, s / 2 + z * 0.019), 'paint' if i % 4 else 'paint_b', rot=R(0.0, 0.0, yaw), bev=0.002, segs=1)


def prep_shreds(P):
    """A loose heap of strips and torn leaves."""
    for i in range(12):
        a = TAU * i / 12 + jit(i)
        r = 0.022 * (0.4 + abs(jit(i, 1)) * 1.6)
        leaf(P, f's{i}', (r * math.cos(a), r * math.sin(a), 0.004 + 0.003 * (i % 4)), 0.045, a + 1.3 + jit(i, 2), 0.25 * (i % 3), 'paint' if i % 3 else 'paint_b', shape=(1.0, 0.24, 0.1), u=6, v=3)


def prep_wedges(P):
    """Four wedges lying about, their skin outward."""
    pts = [(0.0, -0.03), (0.018, -0.024), (0.03, 0.0), (0.018, 0.024), (0.0, 0.03)]
    for i in range(4):
        a = TAU * i / 4 + 0.4
        m = mark(P)
        P.lathe(f'skin{i}', pts, (0, 0, 0), 'paint_b', segs=3, angle=TAU / 6, sharp=80.0)
        # the two cut faces (a lathe's sector is open at its sides)
        P.prism(f'face{i}a', pts, 0.0004, (0, 0, 0), 'paint', matrix=Matrix.Rotation(math.pi / 2, 4, 'X'), center=True, bev=None)
        P.prism(f'face{i}b', pts, 0.0004, (0, 0, 0), 'paint', matrix=Matrix.Rotation(TAU / 6, 4, 'Z') @ Matrix.Rotation(math.pi / 2, 4, 'X'), center=True, bev=None)
        xform(P, m, mat4((0.034 * math.cos(a), 0.034 * math.sin(a), 0.0), R(math.pi / 2, 0.0, a + 2.2)))


def prep_florets(P):
    """Little trees: a floret's stalk and its head."""
    for i, (x, y, yaw) in enumerate([(-0.022, -0.012, 0.3), (0.016, -0.018, 1.4), (0.024, 0.016, 2.6), (-0.012, 0.022, 4.0)]):
        P.cyl(f'stalk{i}', 0.006, 0.02, (x, y, 0.01), 'paint_b', segs=6, r2=0.007, bev=None)
        for k in range(3):
            a = yaw + TAU * k / 3
            P.sphere(f'head{i}{k}', 0.0105, (x + 0.007 * math.cos(a), y + 0.007 * math.sin(a), 0.024 + 0.002 * k), 'paint', u=6, v=4)


def prep_caps(P):
    """Slices of a mushroom, each the outline of its cap and stem."""
    out = [(-0.006, 0.0), (0.006, 0.0), (0.006, 0.018), (0.022, 0.02), (0.019, 0.03), (0.01, 0.037), (-0.01, 0.037), (-0.019, 0.03), (-0.022, 0.02), (-0.006, 0.018)]
    for i in range(4):
        x = -0.03 + 0.02 * i
        P.prism(f'slice{i}', out, 0.005, (x, 0.006 * jit(i) * 2, 0.0035 + 0.004 * i), 'paint_b', rot=R(0.0, 0.0, 1.57 + 0.5 * jit(i, 1)), bev=None)
        P.prism(f'cap{i}', [(0.022, 0.02), (0.019, 0.03), (0.01, 0.037), (-0.01, 0.037), (-0.019, 0.03), (-0.022, 0.02)], 0.0062, (x, 0.006 * jit(i) * 2, 0.0035 + 0.004 * i), 'paint', rot=R(0.0, 0.0, 1.57 + 0.5 * jit(i, 1)), bev=None)


def prep_fillet(P):
    """Two fillets, flesh up, the skin showing under their edges."""
    for i in range(2):
        m = mark(P)
        P.prism(f'flesh{i}', oval(0.05, 0.02, 10, 0.2), 0.012, (0, 0, 0.006), 'paint', bev=0.003)
        P.prism(f'skin{i}', oval(0.052, 0.022, 10, 0.2), 0.004, (0, 0, 0.002), 'paint_b', bev=None)
        for k in range(3):
            P.box(f'line{i}{k}', (0.002, 0.028 - 0.006 * k, 0.001), (-0.02 + 0.022 * k, 0, 0.0124), 'paint_b', rot=R(0, 0, 0.4), bev=None)
        xform(P, m, mat4((0.0, -0.024 + 0.05 * i, 0.0), R(0.0, 0.0, 0.2 - 0.5 * i)))


def prep_mince(P):
    """A little mound of fine bits."""
    P.lathe('heap', [(0.0, 0.0), (0.03, 0.0), (0.026, 0.006), (0.014, 0.014), (0.0, 0.016)], (0, 0, 0), 'paint', segs=8, sharp=80.0)
    for i in range(14):
        a = TAU * i / 14 + jit(i)
        r = 0.032 * math.sqrt(abs(jit(i, 1)) * 2)
        s = 0.011 - 0.003 * (i % 3)
        z = 0.016 * max(0.0, 1.0 - r / 0.03)
        P.box(f'bit{i}', (s, s * 0.8, s * 0.7), (r * math.cos(a), r * math.sin(a), z + s * 0.3), 'paint' if i % 3 else 'paint_b', rot=R(0.0, 0.0, a * 3), bev=None)


def prep_strips(P):
    """Strips of meat, a rind of fat along each."""
    for i in range(5):
        y = -0.03 + 0.015 * i
        yaw = 0.25 * jit(i) * 2
        P.box(f'lean{i}', (0.056, 0.011, 0.009), (0.006 * jit(i, 1) * 2, y, 0.0045 + 0.003 * (i % 2)), 'paint', rot=R(0.0, 0.0, yaw), bev=0.002, segs=1)
        P.box(f'fat{i}', (0.056, 0.0035, 0.0094), (0.006 * jit(i, 1) * 2 - 0.0072 * math.sin(yaw), y + 0.0072 * math.cos(yaw), 0.0045 + 0.003 * (i % 2)), 'paint_b', rot=R(0.0, 0.0, yaw), bev=None)


def prep_egg(P):
    """An egg cracked open: its white spread out, its yolk on it."""
    out = [((0.036 + 0.007 * math.sin(3 * TAU * i / 12 + 0.7)) * math.cos(TAU * i / 12), (0.031 + 0.006 * math.cos(2 * TAU * i / 12)) * math.sin(TAU * i / 12)) for i in range(12)]
    P.prism('white', out, 0.005, (0, 0, 0.0025), 'paint_b', bev=0.002, segs=1)
    P.sphere('yolk', 0.014, (0.004, 0.002, 0.006), 'paint', u=9, v=5, scale=(1.0, 1.0, 0.6))


def prep_mound(P):
    """A mound of grains: rice, flour, beans, nuts."""
    P.lathe('mound', [(0.0, 0.0), (0.04, 0.0), (0.036, 0.008), (0.024, 0.02), (0.01, 0.027), (0.0, 0.028)], (0, 0, 0), 'paint', segs=9, sharp=80.0)
    for i in range(10):
        a = TAU * i / 10 + jit(i)
        r = 0.036 * (0.35 + abs(jit(i, 1)) * 1.4)
        z = 0.003 if r > 0.036 else 0.004 + 0.024 * (1 - r / 0.04)
        P.sphere(f'grain{i}', 0.0042, (r * math.cos(a), r * math.sin(a), z), 'paint_b' if i % 3 == 0 else 'paint', u=5, v=3, scale=(1.5, 0.9, 0.8), rot=R(0, 0, a * 2))


def prep_nest(P):
    """A nest of noodles."""
    for k in range(3):
        n = 14
        r0 = 0.03 - 0.007 * k
        pts = [((r0 + 0.004 * math.sin(i * 2.3 + k)) * math.cos(TAU * i / n + k), (r0 + 0.004 * math.cos(i * 1.7 + k)) * math.sin(TAU * i / n + k), 0.005 + 0.006 * k + 0.003 * math.sin(i * 1.3 + k)) for i in range(n)]
        P.tube(f'coil{k}', pts, 0.0048, 'paint' if k != 1 else 'paint_b', segs=5, closed=True)


def prep_pool(P):
    """What was poured: a pool of milk, of honey."""
    out = [((0.04 + 0.006 * math.sin(3 * TAU * i / 14)) * math.cos(TAU * i / 14), (0.034 + 0.005 * math.cos(2 * TAU * i / 14 + 1)) * math.sin(TAU * i / 14)) for i in range(14)]
    P.prism('pool', out, 0.003, (0, 0, 0.0015), 'paint', bev=0.0012, segs=1)
    P.sphere('shine', 0.012, (0.008, 0.008, 0.0028), 'paint_b', u=7, v=3, scale=(1.3, 0.7, 0.12), rot=R(0, 0, 0.6))


PREPS = [prep_slices, prep_dice, prep_shreds, prep_wedges, prep_florets, prep_caps, prep_fillet, prep_mince, prep_strips, prep_egg, prep_mound, prep_nest, prep_pool]

MODELS = {**{f'food_{f.__name__}': f for f in FOODS}, **{f.__name__: f for f in PREPS}}

# the two colours each is painted in the game (src/core/v3/kitchen/items.ts), for the --look previews only
COLORS = {
    'tomato': (0xd8432e, 0x4f8a3a), 'potato': (0xc9a468, 0x8a6a40), 'carrot': (0xe8822a, 0x5fa84a), 'onion': (0xc88a45, 0xe8dcc0),
    'cabbage': (0xb4d684, 0x7fb060), 'cucumber': (0x4f8f3f, 0xc9d88a), 'corn': (0xf2cf4a, 0x9fc46a), 'lettuce': (0x8fca5a, 0xd4e89a),
    'pepper': (0x4f9a3f, 0x3f7030), 'eggplant': (0x5a3578, 0x4f8a3a), 'pumpkin': (0xe8922a, 0x6f7a3a), 'broccoli': (0x3f8a3a, 0x9fc46a),
    'garlic': (0xf0e8d8, 0xc9b890), 'scallion': (0x5fae4a, 0xf0f0e0), 'ginger': (0xd2ab64, 0xf0dc9a), 'chili': (0xd6281e, 0x4f8a3a),
    'oyster': (0xb9ada0, 0xf0e8d8), 'shiitake': (0x8a5a3a, 0xe8d8b8), 'porcini': (0xa86a38, 0xf0e0c0), 'chanterelle': (0xf0a830, 0xd88a20),
    'matsutake': (0xb98a5a, 0xf0e4cc), 'truffle': (0x3a2e28, 0x8a7460), 'shepherds': (0x5fa84a, 0xe8dcc0), 'mint': (0x4fb06a, 0x3f8050),
    'bamboo': (0xe8d49a, 0x8a6a48), 'apple': (0xd8382e, 0x5fa84a), 'berry': (0x5a3f9a, 0x5fa84a), 'strawberry': (0xe0303a, 0x4f9a3f),
    'orange': (0xf08a1e, 0x8a6a30), 'lemon': (0xf4d83a, 0xa8a030), 'banana': (0xf4d24a, 0x6a5030), 'watermelon': (0x3f8a3a, 0x1f5a2a),
    'rice': (0xe8dcc0, 0xc8323a), 'flour': (0x3a6a9a, 0xf0e8d8), 'noodle': (0xf0d890, 0xc8323a), 'bread': (0xc98a45, 0xf0d8a0),
    'bean': (0x8a2f2a, 0xf0e8d8), 'egg': (0xf0d8b8, 0xfaf0e0), 'wildegg': (0xc9d8d0, 0x6a5a48), 'milk': (0x3a6a9a, 0x9fc4e8),
    'butter': (0xf4d870, 0xf0f0e8), 'cheese': (0xf0b83a, 0xd8902a), 'chicken': (0xf0b8a0, 0xf4d8b0), 'pork': (0xe07a7a, 0xf8e8e0),
    'bacon': (0xb8483a, 0xf4d8c8), 'duck': (0xb0404a, 0xf0d8a8), 'beef': (0xa82a2a, 0xf8ece0), 'lamb': (0xc04a4a, 0xf8ece0),
    'venison': (0x7a2028, 0xc8a0a0), 'brookfish': (0x7a8a6a, 0xe8e8d8), 'trout': (0x6a8a7a, 0xf0d8c8), 'salmon': (0x7a8a9a, 0xe8e8e8),
    'tuna': (0x2f4a6a, 0xd8dce0), 'shrimp': (0xe8a090, 0xd86a4a), 'clam': (0xc9b89a, 0xe8dcc8), 'crab': (0xc84a2a, 0xe06a3a),
    'lobster': (0xb8302a, 0xd84a30), 'walnut': (0xb08a5a, 0x7a5a38), 'honey': (0xe8a020, 0x8a5a2a), 'tofu': (0xf4f0e0, 0x4f9a8a),
    # the prepared shapes, each in the colours of one ingredient that takes it
    'prep_slices': (0xf0b8a0, 0xd8432e), 'prep_dice': (0xf0d890, 0xc9a468), 'prep_shreds': (0xd4e89a, 0x8fca5a), 'prep_wedges': (0xf8e8b0, 0xd8382e),
    'prep_florets': (0x3f8a3a, 0x9fc46a), 'prep_caps': (0x8a5a3a, 0xf0e4cc), 'prep_fillet': (0xf08a5a, 0x7a8a9a), 'prep_mince': (0xf0e8d8, 0x5fae4a),
    'prep_strips': (0xa82a2a, 0xf8ece0), 'prep_egg': (0xf4b82a, 0xfaf6ea), 'prep_mound': (0xf4f0e4, 0xe8dcc0), 'prep_nest': (0xf0d890, 0xe8c870),
    'prep_pool': (0xfaf6ea, 0xffffff),
}


def _lin(h):
    c = (((h >> 16) & 255) / 255, ((h >> 8) & 255) / 255, (h & 255) / 255)
    return tuple(x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c)


def _after(P, opts):
    """--look: a cel preview in the ingredient's own colours, back faces culled as the game culls them."""
    if not opts.get('look'):
        return
    names = K.mc.MAT_NAMES
    saved = {k: names[k] for k in ('paint', 'paint_b')}
    for key, h in zip(('paint', 'paint_b'), COLORS.get(P.id.replace('food_', ''), ())):
        names[key] = (_lin(h), saved[key][1], saved[key][2])
    try:
        for m in K.bpy.data.materials:
            m.use_backface_culling = True
        K.render_toon(P, views=[('1', 35, 28)], size=(360, 300), suffix='_look')
    finally:
        names.update(saved)


def main(args):
    table = {}
    for pid, build in MODELS.items():
        def settled(P, build=build):
            P.ao_distance = 0.04
            build(P)
            settle(P, center=True)
        table[pid] = settled
    K.run(table, args, after=_after, out_dir=OUT, geo=False)
