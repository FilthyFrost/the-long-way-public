"""
The kitchen's ingredients in the hand (src/core/v3/kitchen/pantry.ts, docs/V3/plan/cooking.md): one model to each of
the sixty, whole as it is found, and the thirteen shapes they take once prepared (sliced, diced, shredded, in wedges,
in florets, a fillet, minced, in strips, cracked, a mound, a nest, a pool) —

    blender -b --factory-startup --python tools/blender/build.py -- items/kitchen [<model>|all] [--norender] [--look]

Writes public/models/modcar/items/food_<id>.glb and prep_<shape>.glb: root mesh PART, origin at the bottom centre,
resting on z = 0, conventional material names only, AO in 'Col'. `paint` and `paint_b` take the ingredient's two
colours: whole, its skin and what is second on it (a tomato's red and its green calyx, a fish's back and its belly);
prepared, its flesh and its skin (one shape serves every ingredient that is cut that way).

J4 (docs/V3/plan/growth.md §一 4): every one made again to be known at a glance a metre off — round where it is round
(1,500 to 3,000 triangles a piece, soft shading), its own marks on it: a tomato's ribs and its five-pointed calyx, the
eyes of a potato, an egg's smooth shell, the dimpled peel of an orange, the seeds of a strawberry, the kernels of a
cob, the stripes of a watermelon, a fish's fins and gill. Real size, as before.

--look also writes a cel preview in the ingredient's own colours (D:/modcar-scratch/parts/<id>_look_1.png), back
faces culled as the game culls them.
"""
import math

import bmesh
from mathutils import Matrix, Vector, noise

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


def nz(x, y, z, seed=0.0, f=1.0):
    """Smooth noise in about [-1, 1] at a point (the same on every run)."""
    return noise.noise(Vector((x * f + seed * 7.13, y * f - seed * 3.71, z * f + seed * 1.97)))


def smooth01(t):
    t = max(0.0, min(1.0, t))
    return t * t * (3 - 2 * t)


def ring(n, r, z=0.0, a0=0.0):
    return [(r * math.cos(a0 + TAU * i / n), r * math.sin(a0 + TAU * i / n), z) for i in range(n)]


def on_ell(c, rad, az, el, out=1.0):
    """The point of an ellipsoid (centre c, radii rad) in the direction of an azimuth and an elevation."""
    return (c[0] + rad[0] * math.cos(el) * math.cos(az) * out, c[1] + rad[1] * math.cos(el) * math.sin(az) * out,
            c[2] + rad[2] * math.sin(el) * out)


def _register(P, name, bm, mat, sharp, sub):
    o = P.mesh(name, bm, mat, sharp=sharp)
    if sub:
        P.cfg[o.name]['sub'] = sub
    return o


# ------------------------------------------------------------------------------------------------ the shapes

def blob(P, name, rad, loc, mat='paint', u=32, v=20, f=None, rot=(0.0, 0.0, 0.0), sharp=75.0, sub=0, mat_fn=None):
    """
    An ellipsoid of radii rad about loc, its surface pushed out along its radius by f(az, el) (a share of the radius;
    el from −π/2 at its bottom to π/2 at its top), turned by rot (radians). mat: one name, or a list of names with
    mat_fn(az, el) → the index of each face's (its middle's direction).
    """
    bm = K.bm_new()
    K.bm_sphere(bm, 1.0, u=u, v=v)
    for vt in bm.verts:
        x, y, z = vt.co
        el = math.asin(max(-1.0, min(1.0, z)))
        az = math.atan2(y, x)
        k = 1.0 + (f(az, el) if f else 0.0)
        vt.co = Vector((x * rad[0] * k, y * rad[1] * k, z * rad[2] * k))
    if mat_fn is not None:
        for face in bm.faces:
            c = face.calc_center_median()
            d = Vector((c.x / rad[0], c.y / rad[1], c.z / rad[2])).normalized()
            el = math.asin(max(-1.0, min(1.0, d.z)))
            az = math.atan2(d.y, d.x)
            face.material_index = mat_fn(az, el)
    K.bm_transform(bm, mat4(loc, R(*rot)))
    return _register(P, name, bm, mat, sharp, sub)


def leafy(P, name, base, length, width, yaw=0.0, pitch=0.0, curl=0.0, fold=0.0, mat='paint_b', thick=0.0015, u=12, v=14,
          ruffle=0.0, roll=0.0, outline=None, twist=0.0, lobes=0, sharp=75.0):
    """
    A leaf, two-sided (thick), growing from base along its midrib: `length` long, `width` at its widest; outline(t) its
    half-width share along it (t 0 at its base, 1 at its tip); its halves folded up by `fold` (rad), the whole curled
    up by `curl` (rad over its length, negative down), its edge ruffled by `ruffle` (m), turned about its midrib by
    `roll`, then set out towards yaw and raised by pitch. lobes: so many notches down each side (a shepherd's purse).
    """
    bm = K.bm_new()
    K.bm_sphere(bm, 1.0, u=u, v=v)
    ol = outline or (lambda t: math.sin(math.pi * min(1.0, t) ** 0.85) ** 0.85)
    for vt in bm.verts:
        x, y, z = vt.co
        t = (z + 1.0) * 0.5
        rr = math.hypot(x, y)
        th = math.atan2(y, x)
        across = math.cos(th) if rr > 1e-9 else 0.0
        side = math.sin(th) if rr > 1e-9 else 0.0
        w = width * 0.5 * ol(t)
        if lobes:
            w *= 0.72 + 0.28 * abs(math.cos(math.pi * lobes * t))
        a = across * w
        up = side * thick * (0.35 + 0.65 * (w / max(1e-9, width * 0.5)))
        up += fold * abs(a)
        if ruffle:
            up += ruffle * math.sin(a / max(1e-9, width) * 18.0 + t * 11.0) * (abs(a) / max(1e-9, width * 0.5)) ** 1.5
        # (turned about the midrib)
        if roll:
            a, up = a * math.cos(roll) - up * math.sin(roll), a * math.sin(roll) + up * math.cos(roll)
        if twist:
            tw = twist * t
            a, up = a * math.cos(tw) - up * math.sin(tw), a * math.sin(tw) + up * math.cos(tw)
        # along the midrib, curled
        s = t * length
        if abs(curl) > 1e-6:
            k = curl / length
            X = math.sin(k * s) / k - up * math.sin(k * s)
            Z = (1.0 - math.cos(k * s)) / k + up * math.cos(k * s)
        else:
            X, Z = s, up
        vt.co = Vector((X, a, Z))
    m = Matrix.Translation(base) @ Matrix.Rotation(yaw, 4, 'Z') @ Matrix.Rotation(-pitch, 4, 'Y')
    K.bm_transform(bm, m)
    return _register(P, name, bm, mat, sharp, 0)


def stem(P, name, pts, r, mat='paint_b', segs=8, taper=0.8, bend=0.4):
    """A stalk along pts, r at its foot, tapering to r·taper."""
    return P.tube(name, pts, r, mat, segs=segs, bend=bend, radius_fn=lambda t: 1.0 - (1.0 - taper) * t, sharp=80.0)


def dot(P, name, at, r, mat, flat=0.55, u=7, v=5, normal=None):
    """A little bump on a surface (a seed, an eye, a speck), flattened along the normal there."""
    n = Vector(normal or (0.0, 0.0, 1.0)).normalized()
    z = Vector((0.0, 0.0, 1.0))
    q = z.rotation_difference(n).to_matrix().to_4x4()
    bm = K.bm_new()
    K.bm_sphere(bm, r, u=u, v=v, matrix=Matrix.Translation(at) @ q @ Matrix.Diagonal((1.0, 1.0, flat, 1.0)))
    return _register(P, name, bm, mat, 80.0, 0)


def ell_point(c, rad, az, el, f=None):
    """A point of a blob's surface (blob's own f) and the outward normal there."""
    k = 1.0 + (f(az, el) if f else 0.0)
    p = Vector(on_ell(c, rad, az, el, k))
    nrm = Vector((math.cos(el) * math.cos(az) / rad[0], math.cos(el) * math.sin(az) / rad[1], math.sin(el) / rad[2])).normalized()
    return p, nrm


def lobed(n, depth, sharp=1.0):
    """Lobes round an azimuth: 0 on a lobe's crown, −depth in the furrow between two."""
    return lambda az: -depth * (1.0 - abs(math.cos(n * az / 2.0)) ** sharp)


# ------------------------------------------------------------------------------------------------ vegetables

def tomato(P):
    lob = lobed(5, 0.06, 0.6)

    def f(az, el):
        top = max(0.0, math.sin(el))
        return lob(az + 0.3) * math.cos(el) ** 0.7 - 0.16 * top ** 14 - 0.05 * max(0.0, -math.sin(el)) ** 5 + 0.008 * nz(math.cos(az), math.sin(az), el, 1, 3)
    blob(P, 'fruit', (0.038, 0.038, 0.032), (0, 0, 0.032), 'paint', u=40, v=26, f=f)
    # the calyx: five narrow sepals lying out over the shoulders, their tips curling up, round the short stalk
    for i in range(5):
        a = TAU * i / 5 + 0.3 + 0.12 * jit(i)
        leafy(P, f'sepal{i}', (0.0, 0.0, 0.063), 0.03 + 0.004 * jit(i, 1), 0.019, a, -0.3, curl=0.35, fold=0.1,
              thick=0.0022, outline=lambda t: (1.0 - t) ** 0.7 * min(1.0, t * 3.0 + 0.35) + 0.05, twist=0.25 * jit(i, 2))
    blob(P, 'crown', (0.01, 0.01, 0.0035), (0, 0, 0.0625), 'paint_b', u=14, v=7)
    stem(P, 'stalk', [(0.0, 0.0, 0.062), (0.001, 0.0, 0.071), (0.005, 0.001, 0.078)], 0.0038, segs=8)


def potato(P):
    c, rad = (0.0, 0.0, 0.028), (0.048, 0.034, 0.028)
    eyes = [(2.4, 0.6), (3.5, 0.35), (4.6, 0.85), (1.1, 0.25), (5.7, 0.45), (0.2, -0.2), (3.0, -0.3)]

    def f(az, el):
        d = 0.0
        for (ea, ee) in eyes:
            cosd = math.sin(el) * math.sin(ee) + math.cos(el) * math.cos(ee) * math.cos(az - ea)
            d -= 0.07 * math.exp(-(1.0 - cosd) / 0.004)
        p = (math.cos(el) * math.cos(az), math.cos(el) * math.sin(az), math.sin(el))
        return 0.07 * nz(*p, seed=2, f=1.3) + 0.025 * nz(*p, seed=5, f=4.0) + d
    blob(P, 'tuber', rad, c, 'paint', u=40, v=24, f=f)
    for i, (az, el) in enumerate(eyes):
        p, n = ell_point(c, rad, az, el, lambda a, e: f(a, e) + 0.03)
        dot(P, f'eye{i}', p, 0.0022, 'paint_b', flat=0.5, normal=n)
    for i in range(9):
        az, el = TAU * jit(i, 3) + 3.1, 0.9 * jit(i, 4) * 2
        p, n = ell_point(c, rad, az, el, f)
        dot(P, f'speck{i}', p, 0.0013 + 0.0006 * jit(i, 5), 'paint_b', flat=0.25, normal=n, u=5, v=3)


def carrot(P):
    prof = [(0.0, 0.0)] + [(0.0225 * smooth01(min(1.0, z / 0.13)) ** 0.75 * (1.0 if z < 0.128 else 1.0 - (z - 0.128) / 0.016) + 0.0004, z) for z in [0.003 + 0.0072 * k for k in range(19)]] + [(0.0, 0.144)]

    def f(th, z):
        return -0.06 * max(0.0, math.sin(z * 260.0 + 0.6 * math.sin(th * 3.0))) ** 18 + 0.02 * nz(math.cos(th), math.sin(th), z * 30, 3)
    turned(P, 'root', prof, (-0.075, 0.0, 0.022), 'paint', segs=24, f=f, axis='X')
    # the top: four stems fanning out, each with its feathery leaflets
    for i in range(4):
        a = (i - 1.5) * 0.34
        base = (0.068, 0.0, 0.022)
        tip = (0.135 - 0.01 * abs(i - 1.5), 0.075 * math.sin(a), 0.03 + 0.012 * (i % 2))
        mid = ((base[0] + tip[0]) / 2 + 0.004, (base[1] + tip[1]) / 2, 0.028 + 0.006 * (i % 2))
        stem(P, f'stem{i}', [base, mid, tip], 0.0034, segs=6, taper=0.6)
        for k in range(3):
            t = 0.4 + 0.25 * k
            q = (base[0] + (tip[0] - base[0]) * t, base[1] + (tip[1] - base[1]) * t, mid[2] + 0.002)
            for s in (-1, 1):
                leafy(P, f'leaflet{i}{k}{s}', q, 0.03 - 0.005 * k, 0.014, a + s * 0.75, 0.2, curl=0.3, fold=0.3, mat='paint_b',
                      thick=0.0012, u=8, v=10, lobes=4)


def onion(P):
    prof = [(0.0, 0.0), (0.012, 0.0015), (0.03, 0.008), (0.042, 0.024), (0.0445, 0.04), (0.04, 0.054), (0.03, 0.065), (0.016, 0.073), (0.008, 0.079), (0.004, 0.086), (0.0, 0.09)]

    def f(th, z):
        # (the papery skin's meridians)
        return 0.012 * abs(math.sin(th * 7.0 + 0.3 * math.sin(z * 90.0))) + 0.006 * nz(math.cos(th), math.sin(th), z * 40, 4)
    turned(P, 'bulb', prof, (0, 0, 0), 'paint', segs=36, f=f)
    # the dry tip, twisted
    stem(P, 'tip', [(0.0, 0.0, 0.086), (0.002, 0.001, 0.094), (0.006, -0.001, 0.101)], 0.0035, mat='paint', segs=6, taper=0.3)
    # the root plate and its tuft
    blob(P, 'plate', (0.011, 0.011, 0.003), (0.0, 0.0, 0.0012), 'paint_b', u=12, v=6)
    for i in range(7):
        a = TAU * i / 7 + jit(i)
        stem(P, f'rootlet{i}', [(0.004 * math.cos(a), 0.004 * math.sin(a), 0.0008), (0.011 * math.cos(a), 0.011 * math.sin(a), 0.0005), (0.016 * math.cos(a + 0.3), 0.016 * math.sin(a + 0.3), 0.0)], 0.0008, segs=4, taper=0.5)


def cabbage(P):
    def f(az, el):
        p = (math.cos(el) * math.cos(az), math.cos(el) * math.sin(az), math.sin(el))
        return 0.02 * abs(math.sin(az * 3.0 + el * 2.0)) ** 3 + 0.02 * nz(*p, seed=6, f=2.0)
    blob(P, 'head', (0.052, 0.052, 0.05), (0, 0, 0.052), 'paint', u=36, v=24, f=f)
    # the loose outer leaves wrapped round it from below, open at the top, their midribs standing out
    for i in range(5):
        a = TAU * i / 5 + 0.4
        leafy(P, f'leaf{i}', (0.03 * math.cos(a), 0.03 * math.sin(a), 0.003), 0.115, 0.1, a, 0.5, curl=1.7, fold=0.25, mat='paint_b',
              thick=0.002, u=16, v=16, ruffle=0.003)
        # (the midrib: along the leaf's own curve)
        L, c, p0 = 0.115, 1.7, 0.5
        pts = []
        for k in range(5):
            s = L * k / 4 * 0.9
            kk = c / L
            X = math.sin(kk * s) / kk
            Z = (1.0 - math.cos(kk * s)) / kk
            # (raised by the pitch: the leaf's own frame turned up)
            x2 = X * math.cos(p0) - Z * math.sin(p0)
            z2 = X * math.sin(p0) + Z * math.cos(p0)
            pts.append(((0.03 + x2) * math.cos(a), (0.03 + x2) * math.sin(a), 0.003 + z2 + 0.0025))
        stem(P, f'rib{i}', pts, 0.0034, mat='paint', segs=6, taper=0.35)


def cucumber(P):
    pts = [(-0.088 + 0.0176 * k, 0.006 * math.sin(k * 0.35), 0.022) for k in range(11)]
    P.tube('body', pts, 0.021, 'paint', segs=20, bend=0.0, radius_fn=lambda t: 0.5 + 0.5 * math.sin(math.pi * min(1.0, 0.08 + t * 0.86)) ** 0.35, sharp=80.0)
    # the warts in rows along it, each a pale prick
    for i in range(26):
        t = 0.08 + 0.84 * ((i * 0.618) % 1.0)
        x = -0.088 + 0.176 * t
        a = TAU * ((i * 0.381) % 1.0)
        r = 0.021 * (0.5 + 0.5 * math.sin(math.pi * min(1.0, 0.08 + t * 0.86)) ** 0.35)
        n = (0.0, math.cos(a), math.sin(a))
        dot(P, f'wart{i}', (x, 0.006 * math.sin(t * 3.5) + r * n[1], 0.022 + r * n[2]), 0.0019, 'paint_b', flat=0.7, normal=n, u=6, v=4)
    blob(P, 'flower', (0.004, 0.006, 0.006), (0.09, 0.0, 0.022), 'paint_b', u=10, v=6)
    stem(P, 'stalk', [(-0.087, 0.0, 0.022), (-0.096, 0.0, 0.023), (-0.102, 0.002, 0.026)], 0.0035, segs=6)


def corn(P):
    L = 0.15
    prof = [(0.0, 0.0), (0.012, 0.002)] + [(0.0245 * math.sin(math.pi * min(1.0, 0.18 + 0.82 * z / L)) ** 0.4, z) for z in [0.006 + 0.0033 * k for k in range(44)]] + [(0.0, L + 0.002)]

    def f(th, z):
        # kernels: plump bumps, twelve rows round, each row a half kernel on from the next
        row = math.floor((th + math.pi) * 6.0 / math.pi)
        zz = z + (0.0048 if row % 2 else 0.0)
        return 0.11 * (abs(math.cos(th * 6.0)) ** 0.45 * abs(math.cos(zz * 330.0)) ** 0.45) - 0.055
    P.ao_distance = 0.008
    turned(P, 'cob', prof, (-0.064, 0, 0.027), 'paint', segs=36, f=f, axis='X')
    for i in range(12):
        th = (i + 0.5) * TAU / 12
        pts = [(-0.064 + z, r * 0.955 * math.cos(th), 0.027 + r * 0.955 * math.sin(th)) for (r, z) in prof[4:-4:4]]
        P.tube(f'furrow{i}', pts, 0.0011, 'wood', segs=4, bend=0.5, sharp=80.0)
    # the husk pulled back from its foot in three broad leaves, its stalk, the silk at its tip
    for i in range(3):
        a = TAU * i / 3 + 0.5
        leafy(P, f'husk{i}', (-0.06, 0.016 * math.cos(a), 0.027 + 0.016 * math.sin(a)), 0.12, 0.06, math.pi + 0.45 * math.cos(a), -0.12 + 0.1 * math.sin(a),
              curl=-0.25, fold=0.5, mat='paint_b', thick=0.0018, u=12, v=18, twist=0.25, roll=0.6 * math.cos(a))
    stem(P, 'shank', [(-0.062, 0.0, 0.027), (-0.078, 0.0, 0.026), (-0.09, 0.0, 0.024)], 0.009, segs=8, taper=0.7)
    for i in range(10):
        a = TAU * i / 10
        stem(P, f'silk{i}', [(0.086, 0.0, 0.027), (0.098, 0.004 * math.cos(a), 0.027 + 0.004 * math.sin(a)), (0.112, 0.011 * math.cos(a + 0.4), 0.025 + 0.009 * math.sin(a + 0.4))], 0.0009, mat='wood', segs=4, taper=0.4)


def lettuce(P):
    blob(P, 'heart', (0.03, 0.03, 0.036), (0, 0, 0.036), 'paint_b', u=20, v=14, f=lambda az, el: 0.04 * nz(math.cos(az), math.sin(az), el, 7, 3))
    for k, (n, size, tilt, curl) in enumerate([(5, 0.075, 1.05, 1.3), (7, 0.095, 0.7, 1.0), (8, 0.11, 0.42, 0.6)]):
        for i in range(n):
            a = TAU * i / n + k * 0.45
            leafy(P, f'l{k}{i}', (0.006 * math.cos(a), 0.006 * math.sin(a), 0.006), size, size * 0.85, a, tilt, curl=curl, fold=0.25,
                  mat='paint' if k else 'paint_b', thick=0.0015, u=14, v=12, ruffle=0.006 + 0.002 * k,
                  outline=lambda t: math.sin(math.pi * min(1.0, t * 0.92 + 0.08)) ** 0.6)


def pepper(P):
    def f(az, el):
        lobe = -0.11 * (1.0 - abs(math.cos(2.0 * az + 0.4)) ** 0.7)
        top = max(0.0, math.sin(el))
        bottom = max(0.0, -math.sin(el))
        return lobe * (0.4 + 0.6 * math.cos(el)) - 0.25 * top ** 10 + 0.06 * bottom ** 3 * (abs(math.cos(2.0 * az + 0.4)) - 0.4)
    blob(P, 'body', (0.04, 0.04, 0.046), (0, 0, 0.046), 'paint', u=36, v=24, f=f)
    blob(P, 'cap', (0.013, 0.013, 0.005), (0, 0, 0.087), 'paint_b', u=14, v=8, f=lambda az, el: 0.15 * abs(math.cos(2.5 * az)))
    stem(P, 'stalk', [(0.0, 0.0, 0.088), (0.002, 0.0, 0.098), (0.009, 0.0, 0.106)], 0.0048, segs=8, taper=0.75)


def eggplant(P):
    prof = [(0.0, 0.0), (0.012, 0.002), (0.03, 0.018), (0.038, 0.045), (0.035, 0.08), (0.026, 0.115), (0.018, 0.14), (0.012, 0.152), (0.0, 0.156)]
    turned(P, 'body', prof, (-0.08, 0, 0.038), 'paint', segs=32, axis='X', f=lambda th, z: 0.012 * nz(math.cos(th), math.sin(th), z * 20, 8))
    # the calyx: a cap with five pointed sepals laid along the fruit, and its woody stem
    turned(P, 'calyx', [(0.0, 0.0), (0.016, 0.0), (0.0185, 0.008), (0.012, 0.018), (0.0055, 0.022), (0.0, 0.023)], (0.064, 0.0, 0.038), 'paint_b', segs=20, axis='X')
    for i in range(5):
        a = TAU * i / 5 + 0.2
        leafy(P, f'sepal{i}', (0.064, 0.015 * math.cos(a), 0.038 + 0.015 * math.sin(a)), 0.032, 0.018, math.pi, 0.0, curl=0.0, fold=0.2,
              thick=0.0013, roll=a - math.pi / 2, outline=lambda t: (1.0 - t) ** 0.8 * min(1.0, t * 5 + 0.3))
    stem(P, 'stalk', [(0.082, 0.0, 0.038), (0.096, 0.0, 0.04), (0.106, 0.003, 0.046)], 0.0045, segs=8, taper=0.8)


def pumpkin(P):
    lob = lobed(10, 0.12, 0.45)

    def f(az, el):
        return lob(az) * math.cos(el) ** 0.5 - 0.22 * max(0.0, math.sin(el)) ** 8 - 0.12 * max(0.0, -math.sin(el)) ** 8
    blob(P, 'body', (0.082, 0.082, 0.056), (0, 0, 0.056), 'paint', u=48, v=26, f=f)
    # its stalk: ridged, thick, curving over
    P.tube('stalk', [(0.0, 0.0, 0.098), (0.003, 0.0, 0.114), (0.014, 0.002, 0.124)], 0.0085, 'paint_b', segs=7, bend=0.6,
           radius_fn=lambda t: 1.0 - 0.3 * t, sharp=40.0)


def broccoli(P):
    stem(P, 'trunk', [(0.0, 0.0, 0.0), (0.0, 0.0, 0.03), (0.0, 0.0, 0.05)], 0.016, segs=12, taper=1.15)
    heads = [(0.0, 0.0, 0.088, 0.03)] + [(0.034 * math.cos(TAU * i / 6 + 0.3), 0.034 * math.sin(TAU * i / 6 + 0.3), 0.072, 0.024) for i in range(6)]
    for i, (x, y, z, r) in enumerate(heads):
        stem(P, f'branch{i}', [(x * 0.2, y * 0.2, 0.045), (x * 0.7, y * 0.7, z - r * 0.8), (x, y, z - r * 0.4)], 0.007, segs=6, taper=0.7)

        def f(az, el, i=i):
            p = (math.cos(el) * math.cos(az), math.cos(el) * math.sin(az), math.sin(el))
            return 0.16 * abs(nz(*p, seed=10 + i, f=5.0)) + 0.07 * nz(*p, seed=20 + i, f=11.0) - 0.08 * max(0.0, -math.sin(el)) ** 2
        blob(P, f'floret{i}', (r, r, r * 0.78), (x, y, z), 'paint', u=26, v=16, f=f)


def garlic(P):
    prof = [(0.0, 0.0), (0.012, 0.0), (0.024, 0.007), (0.029, 0.02), (0.027, 0.034), (0.018, 0.046), (0.008, 0.055), (0.0045, 0.064), (0.0, 0.068)]

    def f(th, z):
        return -0.17 * (1.0 - abs(math.cos(4.0 * th)) ** 0.45) * math.sin(math.pi * min(1.0, z / 0.052))
    turned(P, 'bulb', prof, (0, 0, 0), 'paint', segs=48, f=f)
    # the papery stripes in the furrows between the cloves
    for i in range(8):
        th = (i + 0.5) * TAU / 8
        pts = []
        for (r, z) in prof[2:7]:
            k = 1.0 + f(th, z)
            pts.append((r * k * 1.01 * math.cos(th), r * k * 1.01 * math.sin(th), z))
        P.tube(f'stripe{i}', pts, 0.0016, 'paint', segs=4, bend=0.6, sharp=80.0)
    stem(P, 'neck', [(0.0, 0.0, 0.062), (0.001, 0.0, 0.072), (0.003, 0.001, 0.08)], 0.004, mat='paint', segs=6, taper=0.5)
    blob(P, 'plate', (0.012, 0.012, 0.0025), (0.0, 0.0, 0.001), 'paint_b', u=12, v=6)
    for i in range(9):
        a = TAU * i / 9 + jit(i)
        stem(P, f'rootlet{i}', [(0.004 * math.cos(a), 0.004 * math.sin(a), 0.001), (0.012 * math.cos(a), 0.012 * math.sin(a), 0.0006), (0.016 * math.cos(a + 0.2), 0.016 * math.sin(a + 0.2), 0.0)], 0.0007, segs=4, taper=0.5)


def scallion(P):
    for i in range(4):
        y = 0.009 * (i - 1.5)
        blob(P, f'bulb{i}', (0.012, 0.0062, 0.0062), (-0.1, y, 0.0068), 'paint_b', u=16, v=10)
        stem(P, f'white{i}', [(-0.098, y, 0.0068), (-0.07, y, 0.0068), (-0.045, y, 0.0072)], 0.0056, mat='paint_b', segs=10, taper=0.95, bend=0.0)
        for k in range(2):
            s = 1 if k else -1
            stem(P, f'green{i}{k}', [(-0.047, y, 0.0072), (0.01, y * 1.6 + 0.004 * s, 0.009 + 0.002 * k), (0.07, y * 2.6 + 0.012 * s, 0.01 + 0.006 * i + 0.004 * k), (0.11, y * 3.4 + 0.018 * s, 0.006 + 0.005 * i)],
                 0.0042 - 0.0008 * k, mat='paint', segs=8, taper=0.35)
        for k in range(5):
            a = TAU * k / 5
            stem(P, f'root{i}{k}', [(-0.111, y, 0.0068), (-0.118, y + 0.004 * math.cos(a), 0.0068 + 0.004 * math.sin(a)), (-0.124, y + 0.006 * math.cos(a + 0.5), 0.002)], 0.0006, mat='paint_b', segs=4, taper=0.5)


def ginger(P):
    knobs = [(0.0, 0.0, 0.022, 0.026), (0.032, 0.012, 0.018, 0.02), (-0.032, 0.006, 0.019, 0.021), (0.012, -0.026, 0.016, 0.017), (0.054, 0.03, 0.012, 0.014), (-0.05, -0.016, 0.013, 0.014)]
    for i, (x, y, r, rx) in enumerate(knobs):
        def f(az, el, i=i):
            p = (math.cos(el) * math.cos(az), math.cos(el) * math.sin(az), math.sin(el))
            return 0.1 * nz(*p, seed=30 + i, f=1.6) - 0.035 * max(0.0, math.sin(az * 2.0 + el * 9.0)) ** 20
        blob(P, f'knob{i}', (rx * 1.3, r, r * 0.85), (x, y, r * 0.85), 'paint', u=24, v=16, f=f, rot=(0.0, 0.0, math.atan2(y, x + 1e-6)))
    blob(P, 'cut', (0.003, 0.012, 0.011), (-0.073, -0.016, 0.0115), 'paint_b', u=14, v=10)


def chili(P):
    pts = [(-0.06 + 0.134 * t, 0.012 * math.sin(math.pi * t * 1.25) - 0.03 * max(0.0, t - 0.75) ** 1.5 * 2.0, 0.013 - 0.002 * t) for t in [k / 16 for k in range(17)]]
    P.tube('pod', pts, 0.0125, 'paint', segs=20, bend=0.5, radius_fn=lambda t: (1.0 - 0.92 * t ** 1.3) * (0.85 + 0.15 * math.sin(min(1.0, t * 6.0) * math.pi / 2)), sharp=80.0, twist=1.2)
    turned(P, 'calyx', [(0.0, 0.0), (0.0125, 0.0), (0.0145, 0.004), (0.009, 0.008), (0.004, 0.01), (0.0, 0.011)], (-0.062, 0.0, 0.013), 'paint_b', segs=16, axis='X', rot=(0.0, -math.pi / 2, 0.0))
    stem(P, 'stem', [(-0.072, 0.0, 0.013), (-0.082, -0.004, 0.017), (-0.088, -0.01, 0.026)], 0.0028, segs=6, taper=0.8)


# ------------------------------------------------------------------------------------------------ mushrooms, greens

def shroom(P, name, cap_r, cap_h, stem_r, stem_h, loc=(0.0, 0.0), mat='paint', stem_mat='paint_b', gills=24, lean=(0.0, 0.0), fat=1.0, cf=None):
    x, y = loc
    prof = [(0.0, 0.0), (stem_r * 1.15 * fat, 0.0), (stem_r * 1.2 * fat, stem_h * 0.15), (stem_r * fat, stem_h * 0.5), (stem_r * 0.9, stem_h), (0.0, stem_h)]
    turned(P, name + '_stem', prof, (x, y, 0.0), stem_mat, segs=32, f=lambda th, z: 0.03 * nz(math.cos(th), math.sin(th), z * 60, 40), rot=(lean[0], lean[1], 0.0))
    top = Vector((x, y, 0.0)) + Matrix.Rotation(lean[1], 3, 'Y') @ Matrix.Rotation(lean[0], 3, 'X') @ Vector((0.0, 0.0, stem_h * 0.97))
    # the cap's dome and its underside
    dome = [(0.0, 0.0), (cap_r * 0.25, -cap_h * 0.18), (cap_r * 0.7, -cap_h * 0.2), (cap_r * 0.98, -cap_h * 0.08), (cap_r, cap_h * 0.12), (cap_r * 0.92, cap_h * 0.45), (cap_r * 0.7, cap_h * 0.75), (cap_r * 0.38, cap_h * 0.95), (0.0, cap_h)]
    turned(P, name + '_cap', dome, tuple(top), mat, segs=48, f=cf, rot=(lean[0], lean[1], 0.0))
    if gills:
        gp = [(stem_r * 0.95, -cap_h * 0.15), (cap_r * 0.55, -cap_h * 0.2), (cap_r * 0.95, -cap_h * 0.1)]
        turned(P, name + '_gills', [(0.0, -cap_h * 0.14)] + gp + [(0.0, -cap_h * 0.12)], tuple(top), stem_mat, segs=gills * 3,
               f=lambda th, z: -0.06 * (1.0 - abs(math.cos(th * gills / 2.0)) ** 0.25), rot=(lean[0], lean[1], 0.0))


def oyster(P):
    # a cluster of fans growing from one foot, their gills running down into it
    for i, (r, h, lean, yaw) in enumerate([(0.042, 0.05, 0.55, 0.2), (0.036, 0.044, 0.68, 2.1), (0.031, 0.04, 0.62, 4.0), (0.026, 0.056, 0.2, 5.2)]):
        m = mark(P)
        prof = [(0.0, 0.0), (0.008, 0.002), (0.012, h * 0.45), (r * 0.8, h * 0.88), (r, h * 0.95), (r * 0.98, h * 1.04), (r * 0.6, h * 1.08), (0.0, h * 1.02)]
        turned(P, f'fan{i}', prof, (0.0, 0.0, 0.0), 'paint', segs=36,
               f=lambda th, z, i=i: (0.07 * math.sin(th * 3 + i) * smooth01(z / 0.05) + (-0.05 * (1.0 - abs(math.cos(th * 18.0)) ** 0.3) if z < h * 0.95 else 0.0)))
        xform(P, m, mat4((0.0, 0.0, 0.0), R(0.0, lean, yaw)))


def shiitake(P):
    cracks = lambda th, z: 0.03 * max(0.0, nz(math.cos(th) * 3, math.sin(th) * 3, z * 80, 41)) ** 2
    shroom(P, 'a', 0.036, 0.02, 0.0085, 0.034, cf=cracks, gills=28)
    shroom(P, 'b', 0.024, 0.014, 0.0065, 0.022, loc=(0.05, 0.022), cf=cracks, gills=24, lean=(0.25, 0.1))
    # the pale cracks on the dark caps
    for i in range(10):
        a, rr = TAU * jit(i, 7) + 3, 0.012 + 0.016 * abs(jit(i, 8) * 2)
        z = 0.034 * 0.97 + 0.02 * (1.0 - (rr / 0.036) ** 2) ** 0.6
        dot(P, f'crack{i}', (rr * math.cos(a), rr * math.sin(a), z), 0.0032, 'paint_b', flat=0.12, normal=(rr * math.cos(a) / 0.036 * 0.6, rr * math.sin(a) / 0.036 * 0.6, 1.0), u=6, v=4)


def porcini(P):
    shroom(P, 'a', 0.043, 0.034, 0.02, 0.05, fat=1.25, gills=0, cf=lambda th, z: 0.015 * nz(math.cos(th), math.sin(th), z * 40, 42))
    # the spongy pores under its cap
    turned(P, 'pores', [(0.0, 0.0), (0.02, 0.0005), (0.039, 0.004), (0.0, 0.006)], (0.0, 0.0, 0.0425), 'paint_b', segs=36, rot=(math.pi, 0.0, 0.0))


def chanterelle(P):
    for i, (r, h, x, y, lean) in enumerate([(0.04, 0.064, 0.0, 0.0, (0.0, 0.0)), (0.024, 0.04, 0.044, 0.018, (0.2, 0.25)), (0.018, 0.03, -0.03, 0.03, (-0.25, 0.1))]):
        prof = [(0.0, 0.0), (0.006 * r / 0.04, 0.0), (0.008 * r / 0.04, h * 0.4), (r * 0.72, h * 0.86), (r, h), (r * 0.94, h * 1.06), (r * 0.45, h * 0.98), (0.0, h * 0.9)]
        turned(P, f'trumpet{i}', prof, (x, y, 0.0), 'paint', segs=40, rot=(lean[0], lean[1], 0.0),
               f=lambda th, z, h=h: 0.09 * math.sin(th * 5 + z * 30) * smooth01((z - h * 0.6) / (h * 0.4)) + (-0.05 * (1.0 - abs(math.cos(th * 12.0)) ** 0.25) * smooth01(z / (h * 0.5)) if z < h * 0.92 else 0.0))


def matsutake(P):
    shroom(P, 'a', 0.03, 0.034, 0.016, 0.082, fat=1.15, gills=26, cf=lambda th, z: 0.02 * nz(math.cos(th), math.sin(th), z * 50, 43))
    # the ring the veil left on its stem, the brown scales on its cap
    P.torus('veil', 0.0168, 0.0028, (0, 0, 0.064), 'paint', segs=24, rsegs=6)
    for i in range(8):
        a = TAU * i / 8 + jit(i, 9)
        dot(P, f'scale{i}', (0.018 * math.cos(a), 0.018 * math.sin(a), 0.082 + 0.024), 0.006, 'paint', flat=0.2, normal=(0.018 * math.cos(a) / 0.02, 0.018 * math.sin(a) / 0.02, 0.9), u=7, v=4)


def truffle(P):
    def f(az, el):
        p = (math.cos(el) * math.cos(az), math.cos(el) * math.sin(az), math.sin(el))
        warts = 0.07 * (1.0 - abs(nz(*p, seed=50, f=9.0))) ** 3
        return 0.18 * nz(*p, seed=51, f=1.3) + warts
    blob(P, 'tuber', (0.03, 0.026, 0.023), (0, 0, 0.022), 'paint', u=40, v=26, f=f)
    blob(P, 'slice', (0.017, 0.017, 0.0028), (0.034, 0.0, 0.003), 'paint_b', u=20, v=8, f=lambda az, el: 0.06 * nz(math.cos(az), math.sin(az), 0.0, 52, 3))


def shepherds(P):
    for i in range(11):
        a = TAU * i / 11 + 0.2 * jit(i)
        leafy(P, f'leaf{i}', (0.0, 0.0, 0.004), 0.075 - 0.012 * (i % 3), 0.018, a, 0.15 + 0.12 * (i % 3), curl=-0.25, fold=0.3, mat='paint',
              thick=0.0011, u=10, v=18, lobes=5, outline=lambda t: (math.sin(math.pi * min(1.0, t * 1.05)) ** 0.7) * (0.4 + 0.6 * t))
    stem(P, 'root', [(0.0, 0.0, 0.004), (-0.008, 0.002, 0.003), (-0.02, 0.0, 0.0022), (-0.034, -0.003, 0.0015)], 0.0032, mat='paint_b', segs=6, taper=0.3)


def mint(P):
    stem(P, 'stem', [(-0.05, 0.0, 0.004), (-0.015, 0.003, 0.012), (0.02, 0.003, 0.024), (0.05, 0.0, 0.034)], 0.0026, mat='paint_b', segs=8, taper=0.6)
    for k in range(4):
        t = k / 3.0
        p = (-0.042 + 0.085 * t, 0.002, 0.006 + 0.027 * t)
        for s in (-1, 1):
            leafy(P, f'leaf{k}{s}', p, 0.04 - 0.008 * k, 0.026 - 0.004 * k, (math.pi / 2) * s + 0.3, 0.2 + 0.1 * k, curl=0.4, fold=0.35, mat='paint',
                  thick=0.0012, u=12, v=14, ruffle=0.0012, outline=lambda t: math.sin(math.pi * min(1.0, t)) ** 0.7 * (1.0 + 0.08 * math.sin(t * 40.0)))
    leafy(P, 'top', (0.05, 0.0, 0.034), 0.022, 0.014, 0.0, 0.4, curl=0.6, fold=0.6, mat='paint', thick=0.0012)


def bamboo(P):
    turned(P, 'shoot', [(0.0, 0.0), (0.03, 0.0), (0.034, 0.02), (0.027, 0.07), (0.013, 0.115), (0.0, 0.14)], (0, 0, 0), 'paint', segs=32)
    for i in range(5):
        z = 0.008 + 0.026 * i
        r0 = 0.0355 - 0.006 * i
        h = 0.05 - 0.004 * i
        # a sheath: a pointed husk wrapped half round, its hairy stripes as ridges
        turned(P, f'sheath{i}', [(r0, z), (r0 * 1.02, z + h * 0.3), (r0 * 0.72, z + h * 0.8), (r0 * 0.3, z + h)], (0, 0, 0), 'paint_b', segs=24, angle=TAU * 0.62, start=TAU * (0.37 * i), close=None,
               f=lambda th, zz: 0.03 * abs(math.sin(th * 18.0)), sharp=80.0)


def turned(P, name, profile, loc, mat='paint', segs=32, f=None, axis='Z', rot=None, sharp=75.0, sub=0, close=None, angle=TAU, start=0.0):
    """
    A surface of revolution (profile = [(r, z), …] from its bottom pole up, as kit.lathe) about Z, each point pushed out
    by f(theta, z) (a share of its r): ribs, lobes, grooves; an open sector (angle < TAU, from start) given a back as a
    leaf is. Then set on its axis ('X' lies it along x) or turned by rot (radians), at loc.
    """
    bm = K.bm_new()
    K.bm_lathe(bm, profile, segs=segs, close=close, angle=angle, start=start)
    if f is not None:
        for vt in bm.verts:
            x, y, z = vt.co
            r = math.hypot(x, y)
            if r < 1e-9:
                continue
            th = math.atan2(y, x)
            k = 1.0 + f(th, z)
            vt.co = Vector((x * k, y * k, z))
    if angle < TAU - 1e-6:
        # (an open sector is a shell: given its back, as a leaf is)
        geom = bmesh.ops.solidify(bm, geom=bm.faces[:], thickness=0.0012)
    m = Matrix.Translation(loc) @ (mat4(rot=R(*rot)) if rot is not None else K.axis_matrix(axis))
    K.bm_transform(bm, m)
    return _register(P, name, bm, mat, sharp, sub)


# ------------------------------------------------------------------------------------------------ fruit

def apple(P):
    prof = [(0.0, 0.009), (0.008, 0.004), (0.022, 0.001), (0.034, 0.012), (0.0395, 0.03), (0.039, 0.047), (0.033, 0.062), (0.022, 0.07), (0.01, 0.066), (0.003, 0.061), (0.0, 0.058)]
    turned(P, 'fruit', prof, (0, 0, 0), 'paint', segs=40, f=lambda th, z: 0.025 * math.cos(th * 5.0) * smooth01(z / 0.03) * smooth01((0.07 - z) / 0.03) + 0.01 * nz(math.cos(th), math.sin(th), z * 30, 60))
    # (the faint pale streaks of its skin, the blossom end, the stalk and its leaf)
    for i in range(7):
        a = TAU * i / 7 + 0.3
        P.tube(f'streak{i}', [(0.031 * math.cos(a), 0.031 * math.sin(a), 0.016), (0.0398 * math.cos(a + 0.05), 0.0398 * math.sin(a + 0.05), 0.04), (0.031 * math.cos(a + 0.1), 0.031 * math.sin(a + 0.1), 0.06)], 0.0015, 'paint_b', segs=4, bend=0.8, sharp=80.0)
    blob(P, 'blossom', (0.004, 0.004, 0.0015), (0.0, 0.0, 0.0085), 'wood', u=10, v=6)
    stem(P, 'stalk', [(0.0, 0.0, 0.058), (0.001, 0.0, 0.07), (0.004, 0.0, 0.082)], 0.0022, mat='wood', segs=6, taper=0.7)
    leafy(P, 'leaf', (0.003, 0.0, 0.076), 0.038, 0.02, 0.4, 0.25, curl=0.5, fold=0.3, mat='paint_b', thick=0.0012, u=12, v=14)


def berry(P):
    # a blackberry: a cluster of glossy drupelets round its core, its little calyx and stalk
    c, rad = (0.0, 0.0, 0.016), (0.014, 0.014, 0.017)
    k = 0
    for row in range(6):
        el = -1.1 + 0.42 * row
        n = max(4, int(10 * math.cos(el)))
        for i in range(n):
            az = TAU * i / n + 0.5 * row
            p, nrm = ell_point(c, rad, az, el)
            dot(P, f'drupe{k}', p, 0.0052, 'paint', flat=0.9, normal=nrm, u=9, v=6)
            k += 1
    p, nrm = ell_point(c, rad, 0.0, 1.5)
    dot(P, 'drupe_top', p, 0.0048, 'paint', flat=0.9, normal=nrm, u=9, v=6)
    for i in range(5):
        a = TAU * i / 5
        leafy(P, f'sepal{i}', (0.0, 0.0, 0.034), 0.012, 0.005, a, -0.6, curl=0.8, fold=0.2, mat='paint_b', thick=0.0008, u=8, v=8)
    stem(P, 'stalk', [(0.0, 0.0, 0.034), (0.002, 0.0, 0.042), (0.008, 0.0, 0.048)], 0.0016, mat='paint_b', segs=6)
    leafy(P, 'leaf', (0.004, 0.0, 0.04), 0.036, 0.024, 2.4, 0.15, curl=0.3, fold=0.3, mat='paint_b', thick=0.0011, u=12, v=14,
          outline=lambda t: math.sin(math.pi * min(1.0, t)) ** 0.7 * (1.0 + 0.1 * math.sin(t * 36.0)))


def strawberry(P):
    prof = [(0.0, 0.0), (0.006, 0.002), (0.016, 0.012), (0.024, 0.028), (0.0275, 0.042), (0.025, 0.052), (0.016, 0.0585), (0.0, 0.059)]
    turned(P, 'fruit', prof, (0, 0, 0), 'paint', segs=36, f=lambda th, z: 0.02 * math.cos(th * 3.0) * smooth01(z / 0.04))
    # the seeds in little dimples, in spirals over it
    k = 0
    for row in range(7):
        z = 0.006 + 0.0072 * row
        r = None
        for (rr, zz), (rr2, zz2) in zip(prof, prof[1:]):
            if zz <= z <= zz2:
                r = rr + (rr2 - rr) * (z - zz) / max(1e-9, zz2 - zz)
                break
        if not r:
            continue
        n = max(4, int(r / 0.0058))
        for i in range(n):
            a = TAU * (i + 0.5 * (row % 2)) / n
            nrm = (math.cos(a), math.sin(a), 0.35 - 0.05 * row)
            dot(P, f'seed{k}', (r * 0.99 * math.cos(a), r * 0.99 * math.sin(a), z), 0.0024, 'ceramic', flat=0.5, normal=nrm, u=6, v=4)
            k += 1
    for i in range(8):
        a = TAU * i / 8 + 0.2 * jit(i)
        leafy(P, f'sepal{i}', (0.0, 0.0, 0.059), 0.024 + 0.003 * jit(i, 1), 0.013, a, -0.35, curl=0.4, fold=0.15, mat='paint_b',
              thick=0.0018, u=8, v=10, outline=lambda t: math.sin(math.pi * min(1.0, t * 0.95 + 0.05)) ** 0.6)
    stem(P, 'stalk', [(0.0, 0.0, 0.058), (0.0, 0.001, 0.066), (0.004, 0.003, 0.074)], 0.0018, mat='paint_b', segs=6)


def orange(P):
    def f(az, el):
        p = (math.cos(el) * math.cos(az), math.cos(el) * math.sin(az), math.sin(el))
        pores = 0.012 * (1.0 - abs(nz(*p, seed=61, f=26.0))) ** 4
        return -pores - 0.05 * max(0.0, math.sin(el)) ** 30 - 0.03 * max(0.0, -math.sin(el)) ** 30
    blob(P, 'fruit', (0.04, 0.04, 0.0385), (0, 0, 0.0385), 'paint', u=48, v=32, f=f)
    blob(P, 'navel', (0.0055, 0.0055, 0.002), (0.0, 0.0, 0.0001), 'paint', u=10, v=6)
    blob(P, 'button', (0.006, 0.006, 0.002), (0.0, 0.0, 0.0768), 'paint_b', u=12, v=6, f=lambda az, el: 0.15 * abs(math.cos(az * 2.5)))
    stem(P, 'stalk', [(0.0, 0.0, 0.077), (0.0, 0.0, 0.082)], 0.0016, mat='paint_b', segs=6)


def lemon(P):
    prof = [(0.0, 0.0)] + [(0.0295 * math.sin(math.pi * t) ** 0.75 * (1.0 - 0.55 * max(0.0, abs(2 * t - 1) - 0.8) / 0.2) + 0.0006, 0.092 * t) for t in [k / 22 for k in range(1, 22)]] + [(0.0, 0.092)]
    turned(P, 'fruit', prof, (-0.046, 0.0, 0.0295), 'paint', segs=44, axis='X',
           f=lambda th, z: -0.012 * (1.0 - abs(nz(math.cos(th) * 4, math.sin(th) * 4, z * 120, 62))) ** 4)
    blob(P, 'tip', (0.0035, 0.0035, 0.0035), (0.046, 0.0, 0.0295), 'paint_b', u=10, v=6)


def banana(P):
    # three fingers on a crown: each curved, five-sided (soft ridges), its tip dark
    sec = [(0.82 * math.cos(TAU * k / 10 + 0.1) * (1.0 if k % 2 == 0 else 0.93), 0.82 * math.sin(TAU * k / 10 + 0.1) * (1.0 if k % 2 == 0 else 0.93)) for k in range(10)]
    for i in range(3):
        y = 0.027 * (i - 1)
        pts = [(-0.075, y * 0.35, 0.05), (-0.045, y * 0.85, 0.026), (0.0, y * 1.1, 0.0175), (0.045, y * 1.15, 0.022), (0.078, y * 1.05, 0.04)]
        P.tube(f'finger{i}', pts, 1.0, 'paint', segs=10, bend=0.5, profile=[(p[0] * 0.0185, p[1] * 0.0185) for p in sec],
               radius_fn=lambda t: 0.45 + 0.75 * math.sin(math.pi * min(1.0, 0.04 + t * 0.94)) ** 0.5, sharp=50.0)
        blob(P, f'tip{i}', (0.0045, 0.004, 0.004), (0.081, y * 1.05, 0.042), 'paint_b', u=10, v=6)
    P.tube('crown', [(-0.072, 0.0, 0.05), (-0.082, 0.0, 0.058), (-0.088, 0.0, 0.068)], 0.0095, 'paint_b', segs=8, bend=0.4, radius_fn=lambda t: 1.0 - 0.3 * t)


def watermelon(P):
    # its rind in eight bands round its long axis, the dark ones narrow and wavering from end to end
    prof = [(0.0, 0.0)] + [(0.097 * math.sin(math.pi * t) ** 0.62 * (1.0 + 0.04 * math.sin(math.pi * t * 2.0)), 0.22 * t) for t in [k / 26 for k in range(1, 26)]] + [(0.0, 0.22)]
    n = 8
    wide, thin = TAU / n * 0.62, TAU / n * 0.38
    wave = lambda k: 0.16 * math.sin(k * 0.9) + 0.07 * math.sin(k * 2.3 + 1.0)
    for i in range(n):
        a = TAU * i / n
        for (name, mat, ang, start, segs) in ((f'rind{i}', 'paint', wide, a, 6), (f'stripe{i}', 'paint_b', thin, a + wide, 4)):
            bm = K.bm_new()
            K.bm_lathe(bm, prof, segs=segs, angle=ang, start=start, shear=wave)
            K.bm_transform(bm, Matrix.Translation((-0.11, 0.0, 0.094)) @ K.axis_matrix('X'))
            _register(P, name, bm, mat, 80.0, 0)
    stem(P, 'stalk', [(0.108, 0.0, 0.096), (0.12, 0.0, 0.1), (0.126, 0.008, 0.11)], 0.0035, mat='wood', segs=6, taper=0.6)


# ------------------------------------------------------------------------------------------------ grain

def rice(P):
    prof = [(0.0, 0.0), (0.05, 0.0), (0.062, 0.016), (0.066, 0.06), (0.06, 0.095), (0.04, 0.115), (0.022, 0.126), (0.021, 0.133), (0.03, 0.142), (0.036, 0.152), (0.026, 0.156), (0.0, 0.148)]
    turned(P, 'sack', prof, (0, 0, 0), 'paint', segs=36,
           f=lambda th, z: 0.03 * nz(math.cos(th) * 2, math.sin(th) * 2, z * 25, 64) + 0.06 * max(0.0, math.sin(th * 9.0)) ** 6 * smooth01((z - 0.1) / 0.03))
    P.torus('tie', 0.0228, 0.0042, (0, 0, 0.13), 'paint_b', segs=24, rsegs=6)
    turned(P, 'band', [(0.0667, 0.035), (0.0672, 0.05), (0.065, 0.075)], (0, 0, 0), 'paint_b', segs=10, angle=TAU * 0.24, start=-TAU * 0.12, sharp=80.0)
    # a few grains spilt at its foot
    for i in range(6):
        a = 0.6 + 0.3 * i
        dot(P, f'grain{i}', (0.068 * math.cos(a), 0.068 * math.sin(a), 0.0015), 0.0028, 'paint', flat=0.45, u=6, v=4)


def flour(P):
    bm = K.bm_new()
    K.bm_cube(bm, (0.09, 0.07, 0.13))
    bmesh.ops.subdivide_edges(bm, edges=bm.edges[:], cuts=4, use_grid_fill=True)
    for vt in bm.verts:
        x, y, z = vt.co
        # (a paper bag filled out at its middle, creased at the top)
        k = 1.0 + 0.06 * (1.0 - (2 * z / 0.13) ** 2)
        vt.co = Vector((x * k, y * k, z + 0.065))
    o = P.mesh('bag', bm, 'paint_b', sharp=50.0)
    P.cfg[o.name]['sub'] = 1
    P.pillow('fold', (0.094, 0.074, 0.018), (0.0, 0.0, 0.137), 'paint_b', rot=R(0.25, 0, 0), r=0.004, sub=1)
    P.pillow('label', (0.004, 0.056, 0.05), (0.0482, 0.0, 0.07), 'paint', r=0.0015, sub=1)
    P.pillow('label2', (0.004, 0.056, 0.012), (0.0485, 0.0, 0.1), 'paint', r=0.0012, sub=1)


def noodle(P):
    k = 0
    for r, n in [(0.0, 1), (0.007, 6), (0.014, 12)]:
        for i in range(n):
            a = TAU * i / max(1, n) + 0.3 * r * 100
            y, z = r * math.cos(a), r * math.sin(a)
            P.cyl(f'n{k}', 0.0034, 0.2 - 0.006 * (k % 3), (0.003 * jit(k), y, 0.019 + z), 'paint', segs=12, axis='X', bev=None)
            k += 1
    P.lathe('band', [(0.0185, -0.014), (0.0195, -0.01), (0.0195, 0.01), (0.0185, 0.014)], (0.0, 0.0, 0.019), 'paint_b', axis='X', segs=24, sharp=80.0)


def bread(P):
    def f(az, el):
        p = (math.cos(el) * math.cos(az), math.cos(el) * math.sin(az), math.sin(el))
        return 0.03 * nz(*p, seed=65, f=3.0) - 0.12 * max(0.0, -math.sin(el)) ** 3
    blob(P, 'loaf', (0.088, 0.048, 0.045), (0, 0, 0.042), 'paint', u=44, v=26, f=f)
    # the three slashes across its top, opened up to the pale crumb
    for i in range(3):
        x = -0.042 + 0.042 * i
        blob(P, f'slash{i}', (0.008, 0.034, 0.006), (x, 0.0, 0.083 - 0.004 * abs(i - 1)), 'paint_b', u=16, v=10, rot=(0.0, 0.0, 0.5),
             f=lambda az, el: 0.15 * nz(math.cos(az), math.sin(az), el, 66, 4))


def bean(P):
    P.lathe('dish', [(0.0, 0.0), (0.036, 0.0), (0.05, 0.012), (0.056, 0.024), (0.053, 0.026), (0.046, 0.014), (0.034, 0.006), (0.0, 0.006)], (0, 0, 0), 'ceramic', segs=40, sharp=60.0)
    for i in range(18):
        a = TAU * i / 18 * 2.618
        rr = 0.036 * math.sqrt((i + 0.5) / 18)
        z = 0.011 + 0.005 * (1.0 - rr / 0.036) + 0.002 * (i % 2)
        # (a kidney bean: an ellipsoid with its inner side pressed in)
        blob(P, f'bean{i}', (0.0085, 0.0052, 0.0046), (rr * math.cos(a), rr * math.sin(a), z), 'paint', u=14, v=8, rot=(0.2 * jit(i), 0.0, a * 1.7),
             f=lambda az, el: -0.18 * max(0.0, math.sin(az)) ** 2 * math.cos(el))


# ------------------------------------------------------------------------------------------------ eggs, dairy

EGG = [(0.0, -0.029)] + [((math.sin(math.acos(1 - 2 * t)) * (1.0 - 0.2 * (1 - 2 * t))) * 0.021, 0.058 * t - 0.029) for t in [k / 18 for k in range(1, 18)]] + [(0.0, 0.029)]


def egg_lying(P, name, scale, loc, yaw, mat='paint', f=None):
    """An egg lying on its side, its middle over loc, turned to yaw."""
    m = mark(P)
    turned(P, name, EGG, (0.0, 0.0, 0.0), mat, segs=36, f=f)
    xform(P, m, mat4((0.0, 0.0, 0.0), R(0.0, math.pi / 2, 0.0), (scale, scale, scale)))
    xform(P, m, mat4((loc[0], loc[1], 0.021 * scale), R(0.0, 0.0, yaw)))


def egg(P):
    egg_lying(P, 'egg', 1.0, (0.0, 0.0), 0.0)


def wildegg(P):
    for k, (x, y, s, yaw) in enumerate([(0.0, 0.016, 0.86, 0.3), (0.014, -0.03, 0.82, 1.9)]):
        egg_lying(P, f'egg{k}', s, (x, y), yaw)
        for i in range(12):
            t = 0.15 + 0.7 * abs(jit(i, k + 3)) * 2 % 1.0
            a = TAU * jit(i, k + 5)
            r = 0.0215 * s * math.sin(math.acos(1 - 2 * t)) * (1.0 - 0.18 * (1 - 2 * t))
            ax = 0.056 * s * t - 0.028 * s
            p = Vector((ax, r * math.cos(a), r * math.sin(a)))
            p = Matrix.Rotation(yaw, 3, 'Z') @ p + Vector((x + 0.028 * s * 0.0, y, 0.0215 * s))
            n = Matrix.Rotation(yaw, 3, 'Z') @ Vector((0.0, math.cos(a), math.sin(a)))
            if p.z < 0.004:
                continue
            dot(P, f'speck{k}{i}', tuple(p), 0.0018 + 0.0008 * abs(jit(i, 9)), 'paint_b', flat=0.2, normal=tuple(n), u=6, v=4)


def milk(P):
    # a carton with its gable top: white sides, a coloured band and top, the spout pinched shut
    w, d, h = 0.07, 0.07, 0.15
    P.pillow('carton', (w, d, h), (0.0, 0.0, h / 2), 'ceramic', r=0.003, sub=2)
    P.pillow('band', (w + 0.0012, d + 0.0012, 0.05), (0.0, 0.0, 0.06), 'paint', r=0.0028, sub=2)
    P.prism('gable', [(-w / 2, 0.0), (w / 2, 0.0), (w / 2 - 0.002, 0.004), (0.002, 0.03), (-0.002, 0.03), (-w / 2 + 0.002, 0.004)], d - 0.002, (0.0, 0.0, h), 'paint', rot=R(math.pi / 2, 0, 0), bev=0.0015)
    P.pillow('seam', (w * 0.92, 0.006, 0.014), (0.0, 0.0, h + 0.035), 'paint', r=0.0015, sub=1)
    blob(P, 'drop', (0.012, 0.0008, 0.016), (0.0, -d / 2 - 0.0006, 0.1), 'paint_b', u=12, v=8, f=lambda az, el: 0.2 * max(0.0, -math.sin(el)))


def butter(P):
    P.pillow('paper', (0.12, 0.08, 0.002), (0, 0, 0.001), 'paint_b', r=0.0008, sub=1)
    P.pillow('block', (0.085, 0.045, 0.034), (-0.006, 0, 0.019), 'paint', r=0.004, sub=2)
    # a slice cut off it, lying beside
    P.pillow('pat', (0.016, 0.045, 0.033), (0.05, 0.006, 0.019), 'paint', rot=R(0, 0, 0.35), r=0.003, sub=2)
    P.pillow('foil', (0.03, 0.082, 0.0025), (-0.044, 0.0, 0.0372), 'paint_b', r=0.001, sub=1, rot=R(0.0, -0.5, 0.0))


def cheese(P):
    # a wedge with its holes pressed into its faces, its rind along the back
    bm = K.bm_new()
    K.bm_prism(bm, [(0.0, 0.0), (0.11, -0.038), (0.11, 0.038)], 0.052, matrix=mat4((-0.055, 0.0, 0.026)))
    bmesh.ops.triangulate(bm, faces=bm.faces[:])
    bmesh.ops.subdivide_edges(bm, edges=bm.edges[:], cuts=7, use_grid_fill=True)
    bmesh.ops.triangulate(bm, faces=bm.faces[:])
    bm.normal_update()
    # (holes on the top, and on the two cut sides: a point of the side from (−0.055, 0) to (0.055, ±0.038))
    side = lambda x, s: (x, s * 0.038 * (x + 0.055) / 0.11)
    holes = [(-0.012, 0.0, 0.052, 0.008), (0.018, 0.012, 0.052, 0.0065), (0.034, -0.016, 0.052, 0.007), (0.042, 0.021, 0.052, 0.0055),
             (*side(0.01, -1), 0.026, 0.0075), (*side(0.03, 1), 0.02, 0.0065), (*side(-0.02, 1), 0.016, 0.0055), (*side(0.04, -1), 0.036, 0.006)]
    for vt in bm.verts:
        p = vt.co.copy()
        for (hx, hy, hz, hr) in holes:
            d = (p - Vector((hx, hy, hz))).length
            if d < hr:
                vt.co = vt.co - vt.normal * (hr - d) * 0.75
    P.mesh('wedge', bm, 'paint', sharp=40.0)
    for i, (hx, hy, hz, hr) in enumerate(holes):
        n = (0.0, 0.0, 1.0) if hz > 0.05 else (-0.33 if hx < 0.06 else 0.0, 1.0 if hy > 0 else -1.0, 0.0)
        dot(P, f'hole{i}', (hx, hy, hz), hr * 0.8, 'paint_b', flat=0.25, normal=n, u=14, v=8)
    P.box('rind', (0.006, 0.078, 0.052), (0.0575, 0, 0.026), 'paint_b', bev=0.002)


# ------------------------------------------------------------------------------------------------ meat

def chicken(P):
    # a drumstick: the meat round the bone, its skin goosefleshed, the knuckle at its end
    prof = [(0.0, 0.0), (0.016, 0.004), (0.03, 0.022), (0.036, 0.045), (0.032, 0.068), (0.02, 0.088), (0.011, 0.1), (0.0, 0.104)]
    turned(P, 'leg', prof, (-0.074, 0.0, 0.036), 'paint', segs=32, axis='X',
           f=lambda th, z: 0.02 * nz(math.cos(th) * 3, math.sin(th) * 3, z * 60, 67) + 0.012 * (1.0 - abs(nz(math.cos(th) * 9, math.sin(th) * 9, z * 200, 68))) ** 6)
    P.tube('bone', [(0.025, 0.0, 0.036), (0.05, 0.0, 0.036), (0.068, 0.0, 0.037)], 0.0072, 'ceramic', segs=12, bend=0.0, radius_fn=lambda t: 1.0 - 0.15 * math.sin(math.pi * t))
    blob(P, 'knuckle', (0.012, 0.014, 0.012), (0.076, 0.0, 0.037), 'ceramic', u=18, v=12, f=lambda az, el: 0.12 * abs(math.cos(az)) ** 3)
    blob(P, 'skin', (0.045, 0.034, 0.03), (-0.034, 0.0, 0.043), 'paint_b', u=28, v=18,
         f=lambda az, el: 0.04 * nz(math.cos(az) * 4, math.sin(az) * 4, el * 4, 69) - 0.25 * max(0.0, -math.sin(el)) ** 1.5)


def pork(P):
    # a chop: the lean eye, the fat round its edge, the rib bone along its side
    eye = [((0.055 + 0.006 * math.sin(3 * a)) * math.cos(a), (0.037 + 0.004 * math.cos(2 * a)) * math.sin(a)) for a in [TAU * k / 64 for k in range(64)]]
    fat = [((0.064 + 0.006 * math.sin(3 * a)) * math.cos(a), (0.046 + 0.004 * math.cos(2 * a)) * math.sin(a)) for a in [TAU * k / 64 for k in range(64)]]
    P.prism('fat', fat, 0.024, (0, 0, 0.012), 'paint_b', bev=0.005, segs=3)
    P.prism('lean', eye, 0.0255, (-0.004, -0.004, 0.0125), 'paint', bev=0.004, segs=3)
    P.tube('rib', [(-0.055, 0.042, 0.012), (0.0, 0.05, 0.0125), (0.06, 0.044, 0.012)], 0.0062, 'ceramic', segs=10, bend=0.6)


def bacon(P):
    lean = [(-0.0022, -0.015), (0.0022, -0.015), (0.0022, 0.004), (-0.0022, 0.004)]
    fat = [(-0.0022, 0.004), (0.0022, 0.004), (0.0022, 0.009), (-0.0022, 0.009)]
    lean2 = [(-0.0022, 0.009), (0.0022, 0.009), (0.0022, 0.016), (-0.0022, 0.016)]
    for i in range(3):
        y = 0.036 * (i - 1)
        pts = [(-0.08 + 0.008 * k, y + 0.003 * math.sin(k * 0.5 + i), 0.006 + 0.004 * math.sin(k * 0.475 + i * 1.3)) for k in range(21)]
        P.tube(f'lean{i}', pts, 1.0, 'paint', profile=lean, bend=0.0, sharp=70.0)
        P.tube(f'fat{i}', pts, 1.0, 'paint_b', profile=fat, bend=0.0, sharp=70.0)
        P.tube(f'lean2_{i}', pts, 1.0, 'paint', profile=lean2, bend=0.0, sharp=70.0)


def oval(a, b, n=10, k=0.0):
    """An egg-shaped outline, anticlockwise: blunter towards +x by k."""
    return [((a + k * a * math.cos(TAU * i / n)) * math.cos(TAU * i / n), b * math.sin(TAU * i / n)) for i in range(n)]


def duck(P):
    P.prism('breast', oval(0.072, 0.045, 32, 0.14), 0.026, (0, 0, 0.013), 'paint', bev=0.006, segs=3)
    # the fat skin over it, scored in a diamond net
    bm = K.bm_new()
    K.bm_prism(bm, oval(0.07, 0.043, 32, 0.14), 0.008, matrix=mat4((0.0, 0.0, 0.03)))
    bmesh.ops.subdivide_edges(bm, edges=bm.edges[:], cuts=3, use_grid_fill=True)
    for vt in bm.verts:
        x, y, z = vt.co
        if z > 0.033:
            vt.co.z = z - 0.0018 * (max(0.0, math.cos((x + y) * 160.0)) ** 16 + max(0.0, math.cos((x - y) * 160.0)) ** 16) + 0.002 * (1 - (x / 0.07) ** 2 - (y / 0.043) ** 2)
    P.mesh('skin', bm, 'paint_b', sharp=50.0)
    for k in range(4):
        for sgn in (-1, 1):
            off = -0.03 + 0.02 * k
            a = 0.6 * sgn
            P.box(f'score{k}{sgn}', (0.08, 0.0028, 0.002), (off * math.sin(a), off * math.cos(a) * sgn, 0.0385), 'paint', rot=R(0, 0, a), bev=None)


def beef(P):
    # a steak: the lean (marbled), the fat along one edge
    out = [((0.074 + 0.006 * math.sin(3 * a + 0.4)) * math.cos(a), (0.05 + 0.005 * math.cos(2 * a)) * math.sin(a)) for a in [TAU * k / 36 for k in range(36)]]
    P.prism('steak', out, 0.026, (0, 0, 0.013), 'paint', bev=0.006, segs=3)
    P.tube('fat', [(-0.07, 0.022, 0.013), (-0.04, 0.046, 0.013), (0.0, 0.054, 0.013), (0.04, 0.05, 0.013), (0.072, 0.026, 0.013)], 0.0115, 'paint_b', segs=10, bend=0.6,
           radius_fn=lambda t: 0.75 + 0.25 * math.sin(math.pi * t))
    for i in range(7):
        a = TAU * jit(i, 11)
        x, y = 0.045 * jit(i, 12) * 2, 0.03 * jit(i, 13) * 2
        P.tube(f'marble{i}', [(x, y, 0.0262), (x + 0.012 * math.cos(a), y + 0.012 * math.sin(a), 0.0264), (x + 0.02 * math.cos(a + 0.5), y + 0.02 * math.sin(a + 0.5), 0.0262)], 0.0018, 'paint_b', segs=5, bend=0.6, sharp=80.0)


def lamb(P):
    blob(P, 'eye', (0.044, 0.036, 0.018), (-0.03, 0, 0.018), 'paint', u=28, v=14, f=lambda az, el: 0.03 * nz(math.cos(az), math.sin(az), el, 70, 3))
    P.tube('fat', [(-0.076, 0.012, 0.018), (-0.05, 0.04, 0.018), (-0.012, 0.042, 0.018), (0.008, 0.024, 0.018)], 0.0098, 'paint_b', segs=10, bend=0.6)
    P.tube('bone', [(0.005, 0.0, 0.016), (0.06, -0.012, 0.016), (0.118, -0.03, 0.018)], 0.0085, 'ceramic', segs=12, bend=0.4)
    blob(P, 'bone_end', (0.009, 0.01, 0.0095), (0.12, -0.031, 0.018), 'ceramic', u=14, v=10)


def venison(P):
    blob(P, 'haunch', (0.072, 0.047, 0.028), (0, 0, 0.027), 'paint', u=36, v=20, f=lambda az, el: 0.05 * nz(math.cos(az), math.sin(az), el, 71, 2) - 0.2 * max(0.0, -math.sin(el)) ** 2)
    P.tube('bone', [(0.06, 0.0, 0.027), (0.085, 0.0, 0.027), (0.1, 0.0, 0.028)], 0.0085, 'ceramic', segs=12, bend=0.0)
    blob(P, 'knob', (0.013, 0.014, 0.013), (0.108, 0, 0.028), 'ceramic', u=14, v=10, f=lambda az, el: 0.12 * abs(math.cos(az)) ** 3)
    blob(P, 'silver', (0.045, 0.02, 0.006), (-0.012, 0.024, 0.048), 'paint_b', u=20, v=10)


# ------------------------------------------------------------------------------------------------ fish, shellfish

def fish_depth(h, t):
    """The half-height of a fish's body at t (0 the tail's root, 1 its snout)."""
    return h * 0.5 * (0.22 + 0.78 * math.sin(math.pi * min(1.0, 0.06 + t * 0.86)) ** 0.55) * (1.0 - 0.55 * smooth01((t - 0.86) / 0.14))


def fish_thick(w, t):
    """The half-thickness of a fish's body at t."""
    return w * 0.5 * (0.3 + 0.7 * math.sin(math.pi * min(1.0, 0.08 + t * 0.8)) ** 0.6) * (1.0 - 0.45 * smooth01((t - 0.88) / 0.12))


def fish(P, L, h, w, tail=0.5, moon=False, spots=0, belly=0.45):
    """
    A fish lying on its side along x, its head at +x: its body a smooth loft (deep at its shoulders, narrow at the tail's
    root), back in `paint` above the line, belly in `paint_b` below; fins, a forked tail, its eye and gill.
    """
    rings = []
    n = 20
    for k in range(n + 1):
        t = k / n
        x = -L * 0.42 + L * 0.84 * t
        depth = fish_depth(h, t)
        thick = fish_thick(w, t)
        rings.append([(x, math.cos(TAU * j / 22) * depth, w * 0.5 + math.sin(TAU * j / 22) * thick) for j in range(22)])
    bm = K.bm_new()
    K.bm_loft(bm, rings, cap_start=True, cap_end=True, closed=True)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    for face in bm.faces:
        c = face.calc_center_median()
        face.material_index = 0 if c.y > -h * belly * 0.1 else 1
    o = P.mesh('body', bm, ['paint', 'paint_b'], sharp=75.0)
    P.cfg[o.name]['sub'] = 1
    a, b = L * 0.22, h * tail
    poly = [(0.0, 0.0), (-a * 0.5, b * 0.8), (-a, b), (-a * 0.56, 0.0), (-a, -b), (-a * 0.5, -b * 0.8)] if moon else [(0.0, 0.0), (-a * 0.7, b * 0.85), (-a, b), (-a * 0.7, 0.0), (-a, -b), (-a * 0.7, -b * 0.85)]
    P.prism('tail', poly, w * 0.12, (-L * 0.4, 0.0, w * 0.5), 'paint', bev=0.001, segs=1)
    P.prism('dorsal', [(0.0, 0.0), (L * 0.24, 0.0), (L * 0.06, h * 0.3), (0.0, h * 0.26)], w * 0.08, (-L * 0.1, fish_depth(h, 0.4) * 0.9, w * 0.5), 'paint', bev=0.001, segs=1)
    P.prism('anal', [(0.0, 0.0), (L * 0.03, -h * 0.18), (L * 0.14, 0.0)], w * 0.07, (-L * 0.24, -fish_depth(h, 0.25) * 0.9, w * 0.5), 'paint_b', bev=0.001, segs=1)
    te = 0.86
    xe = -L * 0.42 + L * 0.84 * te
    ye = fish_depth(h, te) * 0.25
    ze = w * 0.5 + fish_thick(w, te) * math.sqrt(max(0.0, 1.0 - (ye / fish_depth(h, te)) ** 2))
    leafy(P, 'pec', (xe - L * 0.12, -fish_depth(h, 0.72) * 0.3, w * 0.5 + fish_thick(w, 0.72) * 0.9), L * 0.14, h * 0.18, math.pi + 0.5, 0.1, curl=0.2, fold=0.1, mat='paint_b', thick=0.0012)
    # its eye (white ring, dark pupil) and the line of its gill
    dot(P, 'eye_white', (xe, ye, ze), h * 0.075, 'ceramic', flat=0.4, u=12, v=8, normal=(0.15, 0.2, 1.0))
    dot(P, 'eye', (xe + h * 0.004, ye, ze + h * 0.014), h * 0.048, 'trim', flat=0.45, u=10, v=6, normal=(0.15, 0.2, 1.0))
    tg = 0.76
    xg = -L * 0.42 + L * 0.84 * tg
    dg, wg = fish_depth(h, tg), fish_thick(w, tg)
    P.tube('gill', [(xg + L * 0.02, dg * 0.7, w * 0.5 + wg * 0.7), (xg, 0.0, w * 0.5 + wg * 1.01), (xg + L * 0.02, -dg * 0.7, w * 0.5 + wg * 0.7)], 0.0012 + w * 0.012, 'paint_b', segs=5, bend=0.8, sharp=80.0)
    for i in range(spots):
        t = 0.2 + 0.55 * ((i * 0.618) % 1.0)
        x = -L * 0.42 + L * 0.84 * t
        d = fish_depth(h, t)
        y = d * (0.1 + 0.6 * ((i * 0.381) % 1.0))
        zz = w * 0.5 + fish_thick(w, t) * math.sqrt(max(0.0, 1.0 - (y / d) ** 2))
        dot(P, f'spot{i}', (x, y, zz), 0.0032, 'trim', flat=0.2, normal=(0.0, y / d, 1.0), u=6, v=4)


def brookfish(P):
    fish(P, 0.15, 0.044, 0.03, spots=6)


def trout(P):
    fish(P, 0.24, 0.066, 0.042, spots=14)


def salmon(P):
    fish(P, 0.34, 0.096, 0.06, tail=0.55, spots=4)


def tuna(P):
    fish(P, 0.42, 0.15, 0.11, tail=0.8, moon=True)
    for i in range(6):
        P.prism(f'finlet{i}', [(0.0, 0.0), (0.014, 0.0), (0.004, 0.012)], 0.008, (-0.05 - 0.022 * i, 0.03 - 0.002 * i, 0.055), 'paint_b', rot=R(0, 0, 0), bev=None)


def shrimp(P):
    # curled, its shell in rings tapering to the tail fan; its head, feelers and legs
    pts = [(0.045 * math.cos(a), 0.045 * math.sin(a), 0.014) for a in [0.2 + 0.4 * k for k in range(9)]]
    for k in range(8):
        a0, a1 = 0.2 + 0.4 * k, 0.2 + 0.4 * (k + 1)
        seg = [(0.045 * math.cos(a0 + (a1 - a0) * s), 0.045 * math.sin(a0 + (a1 - a0) * s), 0.014) for s in (0.0, 0.5, 1.0)]
        rr = 0.015 * (1.0 - 0.55 * k / 8)
        P.tube(f'ring{k}', seg, rr, 'paint', segs=14, bend=0.5, radius_fn=lambda t: 0.9 + 0.1 * math.sin(math.pi * t), sharp=70.0)
    P.prism('fan', [(0.0, 0.0), (0.028, -0.016), (0.034, -0.004), (0.034, 0.004), (0.028, 0.016)], 0.005, (pts[-1][0], pts[-1][1], 0.014), 'paint_b', rot=R(0, 0, 3.6), bev=0.001)
    blob(P, 'head', (0.022, 0.015, 0.015), (pts[0][0] + 0.008, pts[0][1] - 0.014, 0.015), 'paint', u=24, v=14, rot=(0.0, 0.0, -0.6), f=lambda az, el: 0.1 * max(0.0, math.cos(az)) ** 6)
    for s in (-1, 1):
        stem(P, f'feeler{s}', [(pts[0][0] + 0.024, pts[0][1] - 0.024, 0.016), (pts[0][0] + 0.06, pts[0][1] - 0.03 + 0.012 * s, 0.012), (pts[0][0] + 0.1, pts[0][1] - 0.02 + 0.03 * s, 0.006)], 0.0013, mat='paint_b', segs=4, taper=0.4)
    for k in range(5):
        a = 0.3 + 0.35 * k
        p = (0.032 * math.cos(a), 0.032 * math.sin(a), 0.006)
        stem(P, f'leg{k}', [p, (0.024 * math.cos(a), 0.024 * math.sin(a), 0.002), (0.02 * math.cos(a + 0.2), 0.02 * math.sin(a + 0.2), 0.0005)], 0.0012, mat='paint_b', segs=4, taper=0.6)
    dot(P, 'eye', (pts[0][0] + 0.022, pts[0][1] - 0.02, 0.027), 0.0035, 'trim', flat=0.9, u=8, v=6)


def clam_half(P, name, mat, up=True):
    """Half of a clam, its hinge (umbo) at the origin and its lip towards +x: cupped, ringed with its growth lines."""
    def f(az, el):
        p = Vector((math.cos(el) * math.cos(az), math.cos(el) * math.sin(az), math.sin(el)))
        d = (p - Vector((-1.0, 0.0, 0.0))).length
        return 0.06 * max(0.0, math.sin(d * 13.0)) ** 4 + 0.25 * max(0.0, -math.cos(az)) ** 8 * math.cos(el)
    bm = K.bm_new()
    K.bm_sphere(bm, 1.0, u=36, v=20)
    for vt in bm.verts:
        x, y, z = vt.co
        el = math.asin(max(-1.0, min(1.0, z)))
        az = math.atan2(y, x)
        k = 1.0 + f(az, el)
        z2 = z if z > 0 else z * 0.12
        vt.co = Vector((0.032 * (x * k + 1.0) * (0.5 + 0.08 * x), 0.029 * y * k * (0.72 + 0.28 * (x + 1.0) / 2.0), 0.014 * z2 * k * (1.0 if up else -1.0)))
    if not up:
        bmesh.ops.reverse_faces(bm, faces=bm.faces[:])
    return P.mesh(name, bm, mat, sharp=70.0)


def clam(P):
    # one shut: its two halves lip to lip
    clam_half(P, 'a_top', 'paint', True)
    m = mark(P)
    clam_half(P, 'a_bot', 'paint_b', False)
    xform(P, m, mat4((0.0, 0.0, -0.0002)))
    xform(P, 0, mat4((0.0, 0.0, 0.011)))
    # one open: its upper half swung up about the hinge, its meat showing
    m = mark(P)
    k = mark(P)
    clam_half(P, 'b_bot', 'paint_b', False)
    blob(P, 'meat', (0.014, 0.012, 0.0045), (0.034, 0.0, 0.0), 'ceramic', u=18, v=10)
    xform(P, k, mat4((0.0, 0.0, 0.011)))
    t = mark(P)
    clam_half(P, 'b_top', 'paint', True)
    xform(P, t, mat4((0.0, 0.0, 0.011), R(0.0, -0.8, 0.0)))
    xform(P, m, mat4((0.03, 0.06, 0.0), R(0.0, 0.0, 2.2)))


def crab(P):
    def f(az, el):
        p = (math.cos(el) * math.cos(az), math.cos(el) * math.sin(az), math.sin(el))
        return 0.05 * (1.0 - abs(nz(*p, seed=72, f=6.0))) ** 4 + 0.08 * max(0.0, math.cos(az * 2.0)) ** 8 - 0.3 * max(0.0, -math.sin(el)) ** 2
    blob(P, 'shell', (0.042, 0.06, 0.022), (0, 0, 0.026), 'paint', u=40, v=22, f=f)
    for s in (-1, 1):
        stem(P, f'arm{s}', [(0.02, 0.048 * s, 0.022), (0.05, 0.07 * s, 0.026), (0.074, 0.058 * s, 0.026)], 0.0085, mat='paint', segs=10, taper=0.9)
        blob(P, f'claw{s}', (0.024, 0.014, 0.012), (0.094, 0.046 * s, 0.026), 'paint_b', u=20, v=12, rot=(0.0, 0.0, -0.5 * s), f=lambda az, el: 0.2 * max(0.0, math.cos(az)) ** 4)
        blob(P, f'pincer{s}', (0.016, 0.005, 0.005), (0.112, 0.036 * s, 0.024), 'paint_b', u=12, v=6, rot=(0.0, 0.0, -0.9 * s))
        for i in range(4):
            y0 = 0.05 * s
            stem(P, f'leg{s}{i}', [(-0.01 - 0.012 * i, y0, 0.02), (-0.012 - 0.018 * i, y0 + 0.032 * s, 0.03), (-0.02 - 0.026 * i, y0 + 0.058 * s, 0.004)], 0.0042, mat='paint', segs=8, taper=0.5)
        stem(P, f'stalk{s}', [(0.036, 0.012 * s, 0.038), (0.04, 0.014 * s, 0.045)], 0.0018, mat='paint', segs=6)
        dot(P, f'eye{s}', (0.04, 0.014 * s, 0.047), 0.0032, 'trim', flat=0.9, u=8, v=6)


def lobster(P):
    turned(P, 'head', [(0.0, 0.0), (0.016, 0.004), (0.028, 0.03), (0.03, 0.06), (0.024, 0.09), (0.012, 0.104), (0.0, 0.108)], (0.0, 0, 0.03), 'paint', segs=24, axis='X',
           f=lambda th, z: 0.04 * (1.0 - abs(nz(math.cos(th) * 3, math.sin(th) * 3, z * 90, 73))) ** 4)
    for i in range(6):
        blob(P, f'seg{i}', (0.0145, 0.027 - 0.002 * i, 0.021 - 0.0016 * i), (-0.012 - 0.024 * i, 0, 0.027 - 0.002 * i), 'paint', u=20, v=12,
             f=lambda az, el: 0.06 * max(0.0, math.sin(el)) ** 2)
    P.prism('fan', [(0.0, 0.0), (-0.04, 0.036), (-0.052, 0.012), (-0.054, 0.0), (-0.052, -0.012), (-0.04, -0.036)], 0.006, (-0.15, 0, 0.014), 'paint_b', bev=0.001)
    for s in (-1, 1):
        stem(P, f'arm{s}', [(0.078, 0.02 * s, 0.026), (0.12, 0.058 * s, 0.03), (0.16, 0.052 * s, 0.03)], 0.0095, mat='paint', segs=10, taper=0.85)
        blob(P, f'claw{s}', (0.036, 0.018, 0.013), (0.196, 0.048 * s, 0.03), 'paint_b', u=24, v=12, rot=(0.0, 0.0, 0.1 * s),
             f=lambda az, el: 0.06 * (1.0 - abs(nz(math.cos(az) * 3, math.sin(az) * 3, el * 3, 74))) ** 4)
        blob(P, f'finger{s}', (0.026, 0.007, 0.007), (0.236, 0.04 * s, 0.03), 'paint_b', u=14, v=8, rot=(0.0, 0.0, 0.25 * s))
        stem(P, f'feeler{s}', [(0.1, 0.008 * s, 0.04), (0.17, 0.03 * s, 0.07), (0.25, 0.08 * s, 0.05)], 0.0016, mat='paint_b', segs=4, taper=0.4)
        for i in range(4):
            stem(P, f'leg{s}{i}', [(0.05 - 0.02 * i, 0.02 * s, 0.02), (0.05 - 0.02 * i, 0.052 * s, 0.028), (0.045 - 0.02 * i, 0.074 * s, 0.003)], 0.0028, mat='paint', segs=6, taper=0.5)
        dot(P, f'eye{s}', (0.1, 0.012 * s, 0.052), 0.004, 'trim', flat=0.9, u=8, v=6)


# ------------------------------------------------------------------------------------------------ the rest

def walnut(P):
    for i, (x, y) in enumerate([(0.0, 0.0), (0.04, 0.012), (0.014, 0.04)]):
        def f(az, el, i=i):
            p = (math.cos(el) * math.cos(az), math.cos(el) * math.sin(az), math.sin(el))
            wrinkle = 0.09 * abs(nz(*p, seed=80 + i, f=5.0)) ** 0.7
            seam = 0.08 * max(0.0, 1.0 - abs(math.cos(az)) * 18.0)
            return wrinkle + seam - 0.06
        blob(P, f'nut{i}', (0.0195, 0.0175, 0.018), (x, y, 0.017), 'paint', u=36, v=24, f=f, rot=(0.0, 0.0, i * 1.1))


def honey(P):
    turned(P, 'jar', [(0.0, 0.0), (0.03, 0.0), (0.037, 0.008), (0.039, 0.02), (0.039, 0.066), (0.034, 0.078), (0.03, 0.082), (0.03, 0.09), (0.0, 0.09)], (0, 0, 0), 'paint', segs=40, sharp=60.0)
    P.cyl('lid', 0.0335, 0.014, (0, 0, 0.097), 'paint_b', segs=40, bev=0.002)
    turned(P, 'label', [(0.0395, 0.03), (0.0396, 0.044), (0.0395, 0.058)], (0, 0, 0), 'ceramic', segs=12, angle=TAU * 0.24, start=-TAU * 0.12, sharp=80.0)
    # its wooden dipper, leaning against it
    P.tube('dipper', [(0.04, 0.03, 0.0035), (0.02, 0.032, 0.06), (0.004, 0.034, 0.118)], 0.0035, 'wood', segs=8, bend=0.0)
    for k in range(4):
        P.torus(f'groove{k}', 0.0072, 0.0026, (0.04 + 0.0, 0.03, 0.006 + 0.0055 * k), 'wood', segs=14, rsegs=6, rot=R(0.32, 0.0, 0.0))


def tofu(P):
    P.pillow('block', (0.1, 0.075, 0.042), (0, 0, 0.025), 'paint', r=0.005, sub=2, puff=0.002)
    P.pillow('tray', (0.116, 0.09, 0.006), (0, 0, 0.003), 'paint_b', r=0.002, sub=1)
    P.pillow('rim', (0.116, 0.09, 0.012), (0, 0, 0.006), 'paint_b', r=0.0015, sub=1)


FOODS = [tomato, potato, carrot, onion, cabbage, cucumber, corn, lettuce, pepper, eggplant, pumpkin, broccoli, garlic, scallion, ginger, chili,
         oyster, shiitake, porcini, chanterelle, matsutake, truffle, shepherds, mint, bamboo,
         apple, berry, strawberry, orange, lemon, banana, watermelon, rice, flour, noodle, bread, bean,
         egg, wildegg, milk, butter, cheese, chicken, pork, bacon, duck, beef, lamb, venison,
         brookfish, trout, salmon, tuna, shrimp, clam, crab, lobster, walnut, honey, tofu]


# ------------------------------------------------------------------------------------------------ prepared
# What an ingredient becomes on the board and what lies in the pot: `paint` its flesh, `paint_b` its skin.

def prep_slices(P):
    """Five round slices fallen over one another, their seeds and skin showing."""
    for i in range(5):
        x = -0.04 + 0.02 * i
        rot = R(0.0, 1.05 if i else math.pi / 2, 0.0)
        y = 0.004 * jit(i) * 2
        z = 0.012 if i else 0.003
        P.cyl(f'flesh{i}', 0.0205, 0.006, (x, y, z), 'paint', segs=32, rot=rot, bev=0.0012, bsegs=2)
        P.torus(f'skin{i}', 0.0205, 0.0032, (x, y, z), 'paint_b', segs=32, rsegs=6, rot=rot)


def prep_dice(P):
    """A small heap of cubes, their edges softened."""
    for i, (x, y, z, yaw) in enumerate([(-0.022, -0.014, 0, 0.2), (0.012, -0.02, 0, 0.9), (0.03, 0.01, 0, 0.4), (-0.004, 0.02, 0, 1.2), (-0.03, 0.016, 0, 0.7), (0.002, -0.002, 1, 0.5), (0.018, 0.008, 1, 1.0)]):
        s = 0.021 - 0.002 * (i % 3)
        P.pillow(f'cube{i}', (s, s, s), (x, y, s / 2 + z * 0.019), 'paint' if i % 4 else 'paint_b', rot=R(0.08 * jit(i), 0.06 * jit(i, 1), yaw), r=0.0022, sub=1)


def prep_shreds(P):
    """A loose heap of strips and torn leaves."""
    for i in range(14):
        a = TAU * i / 14 + jit(i)
        r = 0.022 * (0.4 + abs(jit(i, 1)) * 1.6)
        leafy(P, f's{i}', (r * math.cos(a), r * math.sin(a), 0.004 + 0.003 * (i % 4)), 0.048, 0.011, a + 1.3 + jit(i, 2), 0.2 * (i % 3), curl=0.6 * jit(i, 3), fold=0.2,
              mat='paint' if i % 3 else 'paint_b', thick=0.0012, u=8, v=12, ruffle=0.001)


def prep_wedges(P):
    """Four wedges lying about, their skin outward."""
    pts = [(0.0, -0.03)] + [(0.03 * math.sin(math.pi * k / 10), -0.03 * math.cos(math.pi * k / 10)) for k in range(1, 10)] + [(0.0, 0.03)]
    for i in range(4):
        a = TAU * i / 4 + 0.4
        m = mark(P)
        P.lathe(f'skin{i}', pts, (0, 0, 0), 'paint_b', segs=10, angle=TAU / 6, sharp=80.0)
        P.prism(f'face{i}a', pts, 0.0004, (0, 0, 0), 'paint', matrix=Matrix.Rotation(math.pi / 2, 4, 'X'), center=True, bev=None)
        P.prism(f'face{i}b', pts, 0.0004, (0, 0, 0), 'paint', matrix=Matrix.Rotation(TAU / 6, 4, 'Z') @ Matrix.Rotation(math.pi / 2, 4, 'X'), center=True, bev=None)
        xform(P, m, mat4((0.034 * math.cos(a), 0.034 * math.sin(a), 0.0), R(math.pi / 2, 0.0, a + 2.2)))


def prep_florets(P):
    """Little trees: a floret's stalk and its knobbly head."""
    for i, (x, y, yaw) in enumerate([(-0.022, -0.012, 0.3), (0.016, -0.018, 1.4), (0.024, 0.016, 2.6), (-0.012, 0.022, 4.0)]):
        stem(P, f'stalk{i}', [(x, y, 0.0), (x, y, 0.012), (x + 0.002, y, 0.02)], 0.0058, segs=8, taper=1.15)

        def f(az, el, i=i):
            p = (math.cos(el) * math.cos(az), math.cos(el) * math.sin(az), math.sin(el))
            return 0.16 * abs(nz(*p, seed=90 + i, f=5.0)) - 0.15 * max(0.0, -math.sin(el)) ** 2
        blob(P, f'head{i}', (0.015, 0.015, 0.0115), (x + 0.002, y, 0.025), 'paint', u=22, v=14, f=f)


def prep_caps(P):
    """Slices of a mushroom, each the outline of its cap and stem."""
    out = [(-0.006, 0.0), (0.006, 0.0), (0.006, 0.018), (0.016, 0.019), (0.022, 0.02), (0.021, 0.026), (0.019, 0.03), (0.015, 0.034), (0.01, 0.036), (0.0, 0.037), (-0.01, 0.036), (-0.015, 0.034), (-0.019, 0.03), (-0.021, 0.026), (-0.022, 0.02), (-0.016, 0.019), (-0.006, 0.018)]
    cap = [(0.022, 0.02), (0.021, 0.026), (0.019, 0.03), (0.015, 0.034), (0.01, 0.036), (0.0, 0.037), (-0.01, 0.036), (-0.015, 0.034), (-0.019, 0.03), (-0.021, 0.026), (-0.022, 0.02)]
    for i in range(4):
        x = -0.03 + 0.02 * i
        rot = R(0.0, 0.0, 1.57 + 0.5 * jit(i, 1))
        P.prism(f'slice{i}', out, 0.005, (x, 0.006 * jit(i) * 2, 0.0035 + 0.004 * i), 'paint_b', rot=rot, bev=0.0008, segs=1)
        P.prism(f'cap{i}', cap, 0.0062, (x, 0.006 * jit(i) * 2, 0.0035 + 0.004 * i), 'paint', rot=rot, bev=0.0008, segs=1)


def prep_fillet(P):
    """Two fillets, flesh up, the skin showing under their edges, the lines of their flakes."""
    for i in range(2):
        m = mark(P)
        P.prism(f'flesh{i}', oval(0.05, 0.02, 28, 0.2), 0.012, (0, 0, 0.006), 'paint', bev=0.003, segs=2)
        P.prism(f'skin{i}', oval(0.052, 0.022, 28, 0.2), 0.004, (0, 0, 0.002), 'paint_b', bev=0.001, segs=1)
        for k in range(5):
            P.tube(f'line{i}{k}', [(-0.034 + 0.016 * k, -0.016, 0.0122), (-0.03 + 0.016 * k, 0.0, 0.0124), (-0.034 + 0.016 * k, 0.016, 0.0122)], 0.0009, 'paint_b', segs=4, bend=0.8, sharp=80.0)
        xform(P, m, mat4((0.0, -0.024 + 0.05 * i, 0.0), R(0.0, 0.0, 0.2 - 0.5 * i)))


def prep_mince(P):
    """A little mound of fine bits."""
    turned(P, 'heap', [(0.0, 0.0), (0.03, 0.0), (0.027, 0.005), (0.016, 0.013), (0.0, 0.016)], (0, 0, 0), 'paint', segs=24,
           f=lambda th, z: 0.08 * nz(math.cos(th) * 3, math.sin(th) * 3, z * 100, 95))
    for i in range(22):
        a = TAU * i / 22 * 2.618
        r = 0.031 * math.sqrt((i + 0.5) / 22)
        s = 0.0075 - 0.002 * (i % 3)
        z = 0.016 * max(0.0, 1.0 - r / 0.03)
        P.pillow(f'bit{i}', (s, s * 0.8, s * 0.7), (r * math.cos(a), r * math.sin(a), z + s * 0.3), 'paint' if i % 3 else 'paint_b', rot=R(0.4 * jit(i), 0.3 * jit(i, 1), a * 3), r=0.001, sub=0)


def prep_strips(P):
    """Strips of meat, a rind of fat along each."""
    for i in range(5):
        y = -0.03 + 0.015 * i
        yaw = 0.25 * jit(i) * 2
        P.pillow(f'lean{i}', (0.056, 0.011, 0.009), (0.006 * jit(i, 1) * 2, y, 0.0045 + 0.003 * (i % 2)), 'paint', rot=R(0.0, 0.0, yaw), r=0.0018, sub=1)
        P.pillow(f'fat{i}', (0.056, 0.0035, 0.0094), (0.006 * jit(i, 1) * 2 - 0.0072 * math.sin(yaw), y + 0.0072 * math.cos(yaw), 0.0045 + 0.003 * (i % 2)), 'paint_b', rot=R(0.0, 0.0, yaw), r=0.0012, sub=1)


def prep_egg(P):
    """An egg cracked open: its white spread out in a soft frill, its yolk domed on it."""
    out = [((0.036 + 0.007 * math.sin(3 * TAU * i / 40 + 0.7) + 0.002 * math.sin(11 * TAU * i / 40)) * math.cos(TAU * i / 40), (0.031 + 0.006 * math.cos(2 * TAU * i / 40)) * math.sin(TAU * i / 40)) for i in range(40)]
    P.prism('white', out, 0.005, (0, 0, 0.0025), 'paint_b', bev=0.002, segs=2)
    blob(P, 'yolk', (0.0145, 0.0145, 0.0085), (0.004, 0.002, 0.005), 'paint', u=28, v=16)


def prep_mound(P):
    """A mound of grains: rice, flour, beans, nuts."""
    turned(P, 'mound', [(0.0, 0.0), (0.04, 0.0), (0.037, 0.007), (0.026, 0.019), (0.012, 0.026), (0.0, 0.028)], (0, 0, 0), 'paint', segs=32,
           f=lambda th, z: 0.05 * nz(math.cos(th) * 4, math.sin(th) * 4, z * 120, 96))
    for i in range(24):
        a = TAU * i / 24 * 2.618
        r = 0.04 * math.sqrt((i + 0.5) / 24)
        z = 0.0025 if r > 0.036 else 0.003 + 0.024 * (1 - r / 0.04)
        blob(P, f'grain{i}', (0.0055, 0.0032, 0.003), (r * math.cos(a), r * math.sin(a), z), 'paint_b' if i % 3 == 0 else 'paint', u=10, v=6, rot=(0.0, 0.0, a * 2))


def prep_nest(P):
    """A nest of noodles, coiled round and round."""
    for k in range(4):
        n = 28
        r0 = 0.031 - 0.006 * k
        pts = [((r0 + 0.004 * math.sin(i * 1.3 + k)) * math.cos(TAU * i / n + k), (r0 + 0.004 * math.cos(i * 0.9 + k)) * math.sin(TAU * i / n + k), 0.005 + 0.005 * k + 0.003 * math.sin(i * 0.8 + k)) for i in range(n)]
        P.tube(f'coil{k}', pts, 0.0034, 'paint' if k != 1 else 'paint_b', segs=8, closed=True)


def prep_pool(P):
    """What was poured: a pool of milk, of honey."""
    out = [((0.04 + 0.006 * math.sin(3 * TAU * i / 40)) * math.cos(TAU * i / 40), (0.034 + 0.005 * math.cos(2 * TAU * i / 40 + 1)) * math.sin(TAU * i / 40)) for i in range(40)]
    P.prism('pool', out, 0.003, (0, 0, 0.0015), 'paint', bev=0.0013, segs=3)
    blob(P, 'shine', (0.014, 0.008, 0.0012), (0.008, 0.008, 0.0029), 'paint_b', u=16, v=6, rot=(0.0, 0.0, 0.6))


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
