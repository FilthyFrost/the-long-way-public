"""
Consumables (src/core/modcar/items.ts): food, drinks, medicine, backpacks, the head lamp and the boxes of
components the recycler eats, as models:

    blender -b --factory-startup --python tools/blender/build.py -- items/consumables [<model>|all] [--toon]
        [--norender] [--stats] [--hi [--views=yaw:pitch,...]]

Writes public/models/modcar/items/<model>.glb (not parts_geo.json): root mesh PART, origin at the bottom centre,
x forward, resting on z = 0 the way it lies on a shelf or a car boot (packets and bags on their backs, cans and
bottles standing, backpacks lying flat with their shoulder straps up), conventional material names only, AO in
'Col'. `paint` and `paint_b` take the item's paint / paint2, so one model serves every kind that names it
(med_pain_1..3, drink_cola ...). Labels and logos are raised patches, never images, and there is no text.
--hi also renders bigger cel previews from both sides in the item's own colours
(D:/modcar-scratch/parts/<id>_hi_h1/h2.png; --views picks the angles instead, <id>_hi_v1...).
"""
import math

import bmesh
from mathutils import Matrix, Vector
from mathutils.bvhtree import BVHTree

from parts import _kit as K
from parts._kit import V, mat4

OUT = 'public/models/modcar/items'

# the colours of the first item that uses each model (items.ts), for the --hi previews only
COLORS = {
    'food_chips': (0xe07b39, 0xf0c23c), 'food_chips_ginger_xl': (0x9e3b2f, 0xf0c23c),
    'food_licorice': (0x2f3236, 0xc8323a), 'food_nuggets': (0xf0c23c, 0xc8323a),
    'food_dumplings': (0x7fb3d5, 0xf4efe2), 'food_fish_can': (0x3e8e87, 0xede3c8),
    'food_dog_old': (0xb9915f, 0x9e3b2f), 'food_nuts_old': (0x557a46, 0xd8c29a),
    'drink_soda': (0xe07b39, 0xf4efe2), 'drink_water': (0x7fb3d5, 0xf7f7f2), 'drink_beer': (0x557a46, 0xf0c23c),
    'drink_spirit': (0xf4efe2, 0xc8323a), 'drink_energy': (0x2e4a6b, 0xa9d3b5),
    'med_pain': (0xd8c29a, 0xc8323a), 'med_warm': (0xe07b39, 0xede3c8), 'med_kit': (0xc8323a, 0xf7f7f2),
    'pack_old': (0x7a7f45, 0x5a3a2b), 'pack_std': (0xb85c3e, 0x5a3a2b), 'pack_hike': (0x3e8e87, 0x2f3236),
    'lamp_old': (0x2f3236, 0xd4a53b),
    'crate_parts': (0xb9915f, 0x6f7a82), 'crate_parts_heavy': (0x9e7a4f, 0x6f7a82),
    'crate_junk': (0xb9915f, 0x2f3236), 'crate_chem': (0xede3c8, 0x58b8e8), 'crate_lye': (0xf4efe2, 0x7a7f45),
    'crate_supps': (0xa9d3b5, 0xf4efe2),
}


def jit(k, a=0.0):
    """A fixed pseudo-random number in [-0.5, 0.5) (the same on every run)."""
    v = math.sin(k * 12.9898 + a * 78.233) * 43758.5453
    return (v - math.floor(v)) - 0.5


# ------------------------------------------------------------------------------------------------ helpers

def lens_section(w, ht, hb, zc, m=10, mb=None, e=2.4, g=0.6, floor=0.0, blend=0.0):
    """
    Section (y, z) of a soft packet lying on its back: a domed top ht above zc (m + 1 points, fold to fold) and a
    flatter bottom hb below it (mb - 1 points) meeting in the side folds at y = +-w/2, counter-clockwise seen
    from +X. The bottom stops at the floor, where the packet sags flat. blend mixes even spacing into the
    cosine spacing (finer sampling over the middle).
    """
    mb = mb or m
    pts = []
    for k in range(m + 1):
        c = math.cos(math.pi * k / m)
        if blend:
            c = c * (1 - blend) + (1 - 2 * k / m) * blend
        s = max(0.0, 1 - abs(c) ** e) ** g
        pts.append((w / 2 * c, zc + ht * s))
    for k in range(1, mb):
        c = -math.cos(math.pi * k / mb)
        if blend:
            c = c * (1 - blend) + (-1 + 2 * k / mb) * blend
        s = max(0.0, 1 - abs(c) ** e) ** g
        pts.append((w / 2 * c, max(floor, zc - hb * s)))
    return pts


def lens_top(w, ht, zc, y, e=2.4, g=0.6):
    """Height of the top of a lens_section at y (None beyond the folds)."""
    c = 2 * y / w
    if abs(c) >= 1:
        return None
    return zc + ht * max(0.0, 1 - abs(c) ** e) ** g


def height_surf(zfun, h=0.0008):
    """A surface for decal() from a height field zfun(x, y) -> z or None: the point and its normal."""
    def f(x, y):
        z = zfun(x, y)
        if z is None:
            return None
        zx0, zx1 = zfun(x - h, y), zfun(x + h, y)
        zy0, zy1 = zfun(x, y - h), zfun(x, y + h)
        dx = ((zx1 if zx1 is not None else z) - (zx0 if zx0 is not None else z)) / (2 * h)
        dy = ((zy1 if zy1 is not None else z) - (zy0 if zy0 is not None else z)) / (2 * h)
        return V((x, y, z)), V((-dx, -dy, 1.0)).normalized()
    return f


def bvh_surf(tree, z0=1.0):
    """A surface for decal() from a BVH: straight down from z0."""
    def f(x, y):
        hit, nrm, _, _ = tree.ray_cast(V((x, y, z0)), V((0, 0, -1)), z0 + 1.0)
        return None if hit is None else (hit, nrm)
    return f


def crimp(P, x_in, x_out, w, zc, t=0.0035, pitch=0.014, amp=0.0012, notch=0.003, material='paint', name='seal'):
    """A crimped heat seal: a strip pleated across its whole width (the teeth run along X) with a pinked outer
    edge, from x_in (under the end of the packet) out to x_out, its mid-plane at zc."""
    sg = 1.0 if x_out > x_in else -1.0
    n = max(3, int(round(w / pitch)))
    bm = bmesh.new()
    rows = []
    for k in range(2 * n + 1):
        y = -w / 2 + w * k / (2 * n)
        dz = amp if k % 2 == 0 else -amp
        xe = x_out - (0.0 if k % 2 == 0 else sg * notch)
        rows.append([bm.verts.new((x_in, y, zc + dz + t / 2)), bm.verts.new((xe, y, zc + dz + t / 2)),
                     bm.verts.new((xe, y, zc + dz - t / 2)), bm.verts.new((x_in, y, zc + dz - t / 2))])
    for a, b in zip(rows[:-1], rows[1:]):
        for i in range(4):
            j = (i + 1) % 4
            bm.faces.new((a[i], a[j], b[j], b[i]))
    bm.faces.new(rows[0])
    bm.faces.new(rows[-1][::-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    return P.mesh(name, bm, material, sharp=25.0, wn=False)


def ellipse_map(a, b, cx=0.0, cy=0.0):
    """(u, v) in [0, 1]^2 -> a point of the ellipse a x b round (cx, cy) (the square's edges go to its rim)."""
    def f(u, v):
        s, t = 2 * u - 1, 2 * v - 1
        return (cx + a * s * math.sqrt(1 - t * t / 2), cy + b * t * math.sqrt(1 - s * s / 2))
    return f


def decal(P, surf, fn, nu=7, nv=7, material='paint_b', lift=0.0012, sink=0.0015, name='label', sharp=40.0):
    """
    A raised patch (label, band, logo) laid on a surface: the grid fn(u, v) -> (x, y) is put on surf(x, y) ->
    (point, normal) and lifted `lift` off it along the normal; a skirt round its edge sinks into the surface.
    """
    bm = bmesh.new()
    top, low = {}, {}
    for i in range(nu):
        for j in range(nv):
            hit = surf(*fn(i / (nu - 1), j / (nv - 1)))
            if hit is None:
                raise RuntimeError(f'{P.id}: decal {name} is off its surface')
            p, n = hit
            top[i, j] = bm.verts.new(p + n * lift)
            if i in (0, nu - 1) or j in (0, nv - 1):
                low[i, j] = bm.verts.new(p - n * sink)
    for i in range(nu - 1):
        for j in range(nv - 1):
            bm.faces.new((top[i, j], top[i + 1, j], top[i + 1, j + 1], top[i, j + 1]))
    border = [(i, 0) for i in range(nu - 1)] + [(nu - 1, j) for j in range(nv - 1)] + \
             [(i, nv - 1) for i in range(nu - 1, 0, -1)] + [(0, j) for j in range(nv - 1, 0, -1)]
    for a, b in zip(border, border[1:] + border[:1]):
        bm.faces.new((top[a], low[a], low[b], top[b]))
    bm.normal_update()
    if sum(f.normal.z * f.calc_area() for f in bm.faces) < 0:
        bmesh.ops.reverse_faces(bm, faces=bm.faces[:])
    return P.mesh(name, bm, material, sharp=sharp, wn=False)


def section_normals(pts, closed=True):
    """Outward 2D normals of a counter-clockwise polyline (right of travel)."""
    n = len(pts)
    out = []
    for i in range(n):
        if closed:
            a, b = pts[i - 1], pts[(i + 1) % n]
        else:
            a, b = pts[max(0, i - 1)], pts[min(n - 1, i + 1)]
        ty, tz = b[0] - a[0], b[1] - a[1]
        ln = math.hypot(ty, tz) or 1.0
        out.append((tz / ln, -ty / ln))
    return out


def wrap_band(P, sec_fn, x0, x1, nx=3, off=0.0012, depth=0.001, material='paint_b', name='band'):
    """
    A label band wrapped round a lofted body from x0 to x1: sec_fn(x) -> an open polyline (y, z) of the body's
    section, counter-clockwise seen from +X (e.g. from the floor on the right, over the top, down to the floor
    on the left), pushed out by `off`; its two edges turn in by `depth` into the body.
    """
    rings = []
    xs = [x0 + (x1 - x0) * i / (nx - 1) for i in range(nx)]
    for k, x in enumerate(xs):
        pts = sec_fn(x)
        nr = section_normals(pts, closed=False)
        outer = [(x, y + ny * off, z + nz * off) for (y, z), (ny, nz) in zip(pts, nr)]
        if k == 0 or k == nx - 1:
            inner = [(x, y - ny * depth, z - nz * depth) for (y, z), (ny, nz) in zip(pts, nr)]
            rings += [inner, outer] if k == 0 else [outer, inner]
        else:
            rings.append(outer)
    return P.loft(name, rings, material, closed=False, sharp=50.0, wn=False)


def squircle(w, h, n=20, p=4.0, z0=0.0, a0=0.0, a1=math.tau, closed=True):
    """A superellipse section (y, z), w wide and h tall standing on z = z0, counter-clockwise seen from +X;
    a0..a1 (rad, 0 = +Y) picks an open arc of it."""
    pts = []
    m = n if closed else n + 1
    for k in range(m):
        th = a0 + (a1 - a0) * k / n
        c, s = math.cos(th), math.sin(th)
        y = w / 2 * math.copysign(abs(c) ** (2 / p), c)
        z = z0 + h / 2 + h / 2 * math.copysign(abs(s) ** (2 / p), s)
        pts.append((y, z))
    return pts


def loops(bm, axis, positions):
    """Cut edge loops through the whole bmesh at the given positions along axis 0/1/2 (so that big flat faces
    carry vertices for the AO bake)."""
    for p in positions:
        co = [0.0, 0.0, 0.0]
        no = [0.0, 0.0, 0.0]
        co[axis] = p
        no[axis] = 1.0
        bmesh.ops.bisect_plane(bm, geom=bm.verts[:] + bm.edges[:] + bm.faces[:], plane_co=co, plane_no=no)


def ring_plate(P, outer, inner, x0, x1, material, name='plate', **kw):
    """A flat plate with a hole in a YZ plane (x0..x1): outer and inner outlines [(y, z)], the same count,
    matched point by point."""
    rings = [[(x0, y, z) for (y, z) in outer], [(x1, y, z) for (y, z) in outer],
             [(x1, y, z) for (y, z) in inner], [(x0, y, z) for (y, z) in inner]]
    bm = bmesh.new()
    K.bm_loft(bm, rings + [rings[0]])
    bmesh.ops.remove_doubles(bm, verts=bm.verts[:], dist=1e-7)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    return P.mesh(name, bm, material, **kw)


def outward(bm):
    """Make a closed bmesh's faces point outwards (recalc, then flip if its signed volume is negative)."""
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    vol = 0.0
    for f in bm.faces:
        vs = [v.co for v in f.verts]
        for i in range(1, len(vs) - 1):
            vol += vs[0].dot(vs[i].cross(vs[i + 1]))
    if vol < 0:
        bmesh.ops.reverse_faces(bm, faces=bm.faces[:])
    return bm


def solid(P, name, rings, material, cap_start=True, cap_end=True, **kw):
    """A closed loft through rings of 3D points, its faces made to point outwards."""
    bm = bmesh.new()
    K.bm_loft(bm, rings, cap_start=cap_start, cap_end=cap_end)
    outward(bm)
    kw.setdefault('wn', False)
    return P.mesh(name, bm, material, **kw)


def plate_xy(P, outer, inner, z0, z1, material, name='plate', **kw):
    """A flat plate with a hole lying in an XY plane (z0..z1): outer and inner outlines [(x, y)], the same
    count, matched point by point."""
    rings = [[(x, y, z0) for (x, y) in outer], [(x, y, z1) for (x, y) in outer],
             [(x, y, z1) for (x, y) in inner], [(x, y, z0) for (x, y) in inner]]
    bm = bmesh.new()
    K.bm_loft(bm, rings + [rings[0]])
    bmesh.ops.remove_doubles(bm, verts=bm.verts[:], dist=1e-7)
    outward(bm)
    return P.mesh(name, bm, material, **kw)


def lathe_mats(P, name, profile, mats, mat_of, segs=24, sharp=40.0, loc=(0, 0, 0), deform=None, **kw):
    """A lathe whose faces take materials by height: mat_of(z of the face centre) -> an index into mats.
    deform(co) may move the vertices (a dent) before the materials are given out."""
    bm = bmesh.new()
    K.bm_lathe(bm, profile, segs=segs, matrix=Matrix.Translation(loc))
    bmesh.ops.remove_doubles(bm, verts=bm.verts[:], dist=1e-7)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    zs = {f: f.calc_center_median().z for f in bm.faces}
    if deform:
        for v in bm.verts:
            v.co = deform(v.co)
    for f in bm.faces:
        f.material_index = mat_of(zs[f] - loc[2])
    return P.mesh(name, bm, mats, sharp=sharp, **kw)


# ------------------------------------------------------------------------------------------------ food

def pillow_bag(P, W, L, T, seal, zc=0.008, hb=0.022, ns=15, m=10, label=None, band=None):
    """
    A crisp packet lying on its back: a pillow of film (pinched in at the waist by its own puff, domed on top,
    sagging flat underneath), crimped seals across both ends. label = (a, b): an oval patch on the front;
    band = half its length: a wide band across the front, from fold to fold.
    """
    P.ao_distance = 0.03
    xb = L / 2 - seal + 0.005
    e, g = 2.2, 0.55

    def st(u):
        f = max(0.0, 1 - abs(u) ** 2.6) ** 0.5
        return (u * xb, W * (1 - 0.07 * f ** 1.5), max(0.0016, (T - zc) * f), max(0.0016, hb * f), zc)

    us = [math.sin((-1 + 2 * i / (ns - 1)) * math.pi / 2) for i in range(ns)]
    rings = [K.section_x(lens_section(w, ht, hb_, z, m=m, e=e, g=g), x)
             for (x, w, ht, hb_, z) in (st(u) for u in us)]
    P.loft('bag', rings, 'paint', cap_start=True, cap_end=True, recalc=True, sharp=60.0, wn=False)
    for sg in (-1, 1):
        crimp(P, sg * (xb - 0.006), sg * L / 2, W, zc, material='paint')

    def top(x, y):
        if abs(x) >= xb:
            return None
        _, w, ht, _, z = st(x / xb)
        return lens_top(w, ht, z, y, e, g)

    if label:
        decal(P, height_surf(top), ellipse_map(label[0], label[1]), nu=8, nv=8, name='label')
    if band:
        def sec(x):
            _, w, ht, hb_, z = st(x / xb)
            return lens_section(w, ht, hb_, z, m=m, e=e, g=g)[:m + 1]
        wrap_band(P, sec, -band, band, nx=5, off=0.0012, material='paint_b')
    P.views = [('a', 35, 34), ('b', 215, 34)]


def food_chips(P):
    """A packet of prawn crackers lying on its back: a puffed film pillow with crimped seals across both ends and
    a big oval label on the front."""
    pillow_bag(P, 0.20, 0.28, 0.06, 0.026, label=(0.072, 0.056))


def food_chips_ginger_xl(P):
    """The family bag: the same packet, bigger and fuller, a wide band across its front."""
    pillow_bag(P, 0.28, 0.36, 0.09, 0.03, zc=0.01, hb=0.03, ns=15, m=11, band=0.06)


def food_licorice(P):
    """
    A paper flow-wrap pack of liquorice twists lying flat: a soft box of paper with a crimped seal across its
    closed end, the other end torn open (a dark mouth into the pack) with three twisted sticks poking out; a band
    round its middle.
    """
    P.ao_distance = 0.03
    W, L, T = 0.18, 0.24, 0.05
    zc = 0.006
    x_seal, x_open = -L / 2, L / 2 - 0.04        # the sticks stand out of the open end

    def dims(x):
        """width, height and floor of the pack's section at x (the closed end pinches into the seal)"""
        e = min(1.0, max(0.0, (x - (x_seal + 0.02)) / 0.05))
        f = math.sin(e * math.pi / 2) ** 0.8
        h = max(0.004, T * f)
        w = W * (0.97 + 0.03 * (1 - f)) * (1 - 0.03 * f)
        return w, h, max(0.0, (zc - h / 2) * (1 - f))

    def sec(x, inset=0.0):
        w, h, z0 = dims(x)
        p = 2.6 + 2.0 * min(1.0, h / T)
        return squircle(w - 2 * inset, h - 2 * inset, n=18, p=p, z0=z0 + inset)

    xs = [x_seal + 0.019, x_seal + 0.026, x_seal + 0.036, x_seal + 0.05, x_seal + 0.07, -0.02, 0.03, x_open]
    rings = [K.section_x(sec(x), x) for x in xs]
    # the torn mouth: the end ring and its inner lip ragged along X, then the inside back into the pack
    rings[-1] = [(x + 0.004 * jit(k, 1.0) + 0.002, y, z) for k, (x, y, z) in enumerate(rings[-1])]
    inner = [(x + 0.004 * jit(k, 1.0) + 0.0005, y, z) for k, (x, y, z) in
             enumerate(K.section_x(sec(x_open, 0.0018), x_open))]
    rings += [inner, K.section_x(sec(x_open - 0.03, 0.0018), x_open - 0.03),
              K.section_x(sec(x_open - 0.07, 0.0018), x_open - 0.07)]
    P.loft('pack', rings, 'paint', cap_start=True, cap_end=True, recalc=True, sharp=55.0, wn=False)
    crimp(P, x_seal + 0.024, x_seal, W * 0.985, zc, t=0.004, pitch=0.016, material='paint')

    # the band round its middle (over the top and down both sides to the floor)
    def band_sec(x):
        w, h, z0 = dims(x)
        return squircle(w, h, n=22, p=4.6, z0=z0, a0=math.radians(-62), a1=math.radians(242), closed=False)
    wrap_band(P, band_sec, -0.045, -0.005, nx=3, off=0.0013, material='paint_b')
    # three twisted sticks out of the mouth, resting on the inside and on each other
    star = []
    for i in range(10):
        a = math.tau * i / 10
        rr = 1.0 if i % 2 == 0 else 0.68
        star.append((rr * math.cos(a), rr * math.sin(a)))
    r = 0.0085
    zf = 0.0018 + r * 0.86
    sticks = [((x_open - 0.06, -0.019, zf), (x_open + 0.058, -0.027, zf - 0.0005), 0.0),
              ((x_open - 0.06, 0.017, zf), (x_open + 0.075, 0.031, zf + 0.0005), 1.2),
              ((x_open - 0.05, -0.001, zf + r * 1.62), (x_open + 0.045, 0.002, zf + r * 1.45), 2.1)]
    for (a, b, ph) in sticks:
        a, b = V(a), V(b)
        n = 12
        path = [a + (b - a) * (i / (n - 1)) for i in range(n)]
        prof = [(px * math.cos(ph) - py * math.sin(ph), px * math.sin(ph) + py * math.cos(ph)) for (px, py) in star]
        P.tube('stick', path, r, 'trim', profile=prof, twist=(b - a).length / 0.05 * math.tau / 5, bend=0.0,
               sharp=50.0)
    P.views = [('a', 35, 32), ('b', 215, 30)]


def food_nuggets(P):
    """A frozen-food carton lying flat: a glued box with a big panel on its top, a window in the panel (a raised
    frame round a recess with three nuggets in it) and the glued end flaps."""
    P.ao_distance = 0.03
    L, W, H = 0.22, 0.16, 0.06
    bm = bmesh.new()
    K.bm_cube(bm, (L, W, H), mat4((0, 0, H / 2)))
    loops(bm, 0, (-0.066, -0.022, 0.022, 0.066))
    loops(bm, 1, (-0.04, 0.0, 0.04))
    box = P.mesh('carton', bm, 'paint', bev=0.004, segs=2)
    wx, wy, wl, ww = 0.045, 0.02, 0.07, 0.05      # the window: centre and size
    bm = bmesh.new()
    K.bm_prism(bm, K.rounded_rect(wl, ww, 0.009, seg=3), 0.03, matrix=mat4((wx, wy, H + 0.003)), center=True)
    P.cut(box, bm)
    # the top panel (round the window), the window's frame, and the nuggets in it
    bm = bmesh.new()
    K.bm_prism(bm, K.rounded_rect(L - 0.024, W - 0.024, 0.008, seg=3), 0.0016, matrix=mat4((0, 0, H + 0.0004)))
    loops(bm, 0, (-0.066, -0.022, 0.0, 0.022, 0.066))
    loops(bm, 1, (-0.04, 0.0, 0.04))
    pnl = P.mesh('panel', bm, 'paint_b', bev=0.0006, segs=1)
    bm = bmesh.new()
    K.bm_prism(bm, K.rounded_rect(wl + 0.004, ww + 0.004, 0.011, seg=3), 0.03, matrix=mat4((wx, wy, H + 0.003)),
               center=True)
    P.cut(pnl, bm)
    path = [(wx + x, wy + y, H + 0.0018) for (x, y) in K.rounded_rect(wl + 0.006, ww + 0.006, 0.012, seg=3)]
    P.tube('frame', path, 1.0, 'paint', closed=True, sharp=50.0,
           profile=[(-0.0016, -0.0035), (0.0016, -0.0035), (0.0016, 0.0035), (-0.0016, 0.0035)])
    for (x, y, rz) in ((wx - 0.018, wy - 0.008, 20), (wx + 0.004, wy + 0.009, -35), (wx + 0.022, wy - 0.01, 70)):
        P.sphere('nugget', 0.011, (x, y, H - 0.0075), 'wood', u=10, v=6, scale=(1.35, 1.0, 0.62), rot=(0, 0, rz))
    # the glued end flaps (a strip proud at each end) and the glue flap along one side
    for sx in (-1, 1):
        P.box('end_flap', (0.0016, W - 0.014, H - 0.014), (sx * (L / 2 + 0.0004), 0, H / 2), 'paint', bev=0.0006,
              segs=1)
    P.box('side_flap', (L - 0.03, 0.0014, 0.012), (0, -(W / 2 + 0.0003), 0.012), 'paint', bev=0.0005, segs=1)
    P.views = [('a', 35, 34), ('b', 215, 30)]


def food_dumplings(P):
    """
    A bag of frozen dumplings lying down: the film lumpy with the dumplings inside, a heat seal across the bottom
    end, the top end gathered into folds and twisted shut, a plastic clip on the twist and the ruffled end of
    the film beyond it.
    """
    P.ao_distance = 0.04
    W, T = 0.25, 0.08
    zc0, zn, rn = 0.010, 0.017, 0.0125          # seal height; the neck's centre height and radius
    xs0, xs1, xn = -0.15, -0.13, 0.105          # the bottom seal; the neck
    dumps = []
    for i, x in enumerate((-0.098, -0.052, -0.006, 0.04)):
        for j, y in enumerate((-0.072, 0.0, 0.072)):
            k = i * 3 + j
            if (i, j) == (3, 0) or (i, j) == (3, 2):
                continue
            dumps.append((x + 0.01 * jit(k, 1), y + 0.012 * jit(k, 2), 1.0 + 0.25 * jit(k, 3),
                          0.021 + 0.003 * jit(k, 4), 0.0155, math.radians(40 * jit(k, 5))))

    def st(x):
        e1 = min(1.0, max(0.0, (x - (xs1 - 0.004)) / 0.05))
        f1 = math.sin(e1 * math.pi / 2) ** 0.6
        e2 = min(1.0, max(0.0, x / xn))
        f2 = (1 + math.cos(e2 * math.pi)) / 2                    # 1 over the body -> 0 at the neck
        w = W * (1 - 0.05 * f1) * f2 + 2 * rn * (1 - f2)
        ht = max(0.0016, (T - zc0) * f1) * f2 + rn * (1 - f2)
        hb = max(0.0016, 0.03 * f1) * f2 + rn * (1 - f2)
        zc = zc0 * f2 + zn * (1 - f2)
        return w, ht, hb, zc, f1, f2, e2

    m, mb = 20, 6
    xs = [xs1 - 0.004, xs1 + 0.002, xs1 + 0.01, xs1 + 0.02, xs1 + 0.032]
    xs += [xs1 + 0.042 + i * 0.0105 for i in range(int((xn - xs1 - 0.042) / 0.0105) + 1)]
    xs = sorted(set(round(x, 4) for x in xs if x < xn - 0.004)) + [xn]
    rings = []
    for x in xs:
        w, ht, hb, zc, f1, f2, e2 = st(x)
        e, g = 2.0 + 0.2 * f2, 0.5 + 0.05 * f2
        pts = lens_section(w, ht, hb, zc, m=m, mb=mb, e=e, g=g, blend=0.45)
        nr = section_normals(pts)
        fold = 0.0045 * math.sin(math.pi * min(1.0, max(0.0, (e2 - 0.35) / 0.65))) ** 0.8
        out = []
        for k, ((y, z), (ny, nz)) in enumerate(zip(pts, nr)):
            if k <= m and 0 < k < m:
                # the dumplings under the film (faded towards the folds, the seal and the neck)
                s = max(0.0, 1 - abs(2 * y / w) ** 2.2) ** 0.55
                b = 0.0
                for (dx, dy, hh, sx, sy, a) in dumps:
                    u, v = x - dx, y - dy
                    u, v = u * math.cos(a) + v * math.sin(a), -u * math.sin(a) + v * math.cos(a)
                    b = max(b, hh * math.exp(-(u / sx) ** 2 - (v / sy) ** 2))
                z -= 0.016 * (1 - min(1.0, b)) * s * f1 * f2 ** 2
            # the film gathered into folds towards the neck
            ph = math.tau * k / len(pts)
            d = fold * math.sin(7 * ph)
            y, z = y + ny * d, max(0.0, z + nz * d)
            out.append((x, y, z))
        rings.append(out)
    solid(P, 'bag', rings, 'paint', sharp=60.0)
    # the heat seal across the bottom end
    P.box('seal', (xs1 - xs0 + 0.006, W, 0.0032), ((xs0 + xs1) / 2 - 0.003, 0, zc0), 'paint', bev=0.0012, segs=1)
    for dx in (0.006, 0.012):
        P.box('seal_line', (0.0022, W - 0.004, 0.0044), (xs0 + dx, 0, zc0), 'paint', bev=0.0008, segs=1)
    # the twisted neck, the clip on it and the ruffled end of the film
    star = [((1.0 if i % 2 == 0 else 0.78) * math.cos(math.tau * i / 16),
             (1.0 if i % 2 == 0 else 0.78) * math.sin(math.tau * i / 16)) for i in range(16)]
    P.tube('twist', [(xn - 0.006, 0, zn), (xn + 0.01, 0, zn), (xn + 0.024, 0, zn + 0.001)], rn * 0.95, 'paint',
           profile=star, twist=2.2, bend=0.0, sharp=50.0)
    xc = xn + 0.011
    outer = squircle(0.044, 0.034, n=16, p=5.0, z0=zn - 0.017)
    inner = [(0.0108 * math.cos(math.tau * k / 16), zn + 0.0108 * math.sin(math.tau * k / 16)) for k in range(16)]
    ring_plate(P, outer, inner, xc - 0.003, xc + 0.003, 'paint_b', name='clip', bev=0.0012, segs=1, sharp=40.0)
    P.box('clip_tab', (0.006, 0.012, 0.008), (xc, 0.024, zn + 0.004), 'paint_b', bev=0.0015, segs=1)
    tuft = []
    for i, (x, r, a) in enumerate(((xn + 0.022, 0.011, 0.001), (xn + 0.03, 0.017, 0.004), (xn + 0.04, 0.023, 0.0065),
                                   (xn + 0.048, 0.026, 0.0075))):
        ring = []
        for k in range(16):
            ph = math.tau * k / 16
            rr = r + a * (1 if k % 2 == 0 else -1)
            ring.append((x + 0.002 * (k % 2) * i, rr * math.cos(ph), rr * math.sin(ph) * 0.62))
        tuft.append(ring)
    zt = max(zn, max(-p[2] for p in tuft[-1]) + 0.0012)
    tuft = [[(x, y, z + zt) for (x, y, z) in ring] for ring in tuft]
    solid(P, 'tuft', tuft, 'paint', sharp=45.0)
    P.views = [('a', 35, 34), ('b', 215, 30)]


def food_fish_can(P):
    """A flat tin of mackerel: a drawn body with rounded corners, the lid seamed on (a rolled rim), a stiffening
    bead round the lid, the ring pull lying flat at one end and a label band round the side."""
    P.ao_distance = 0.02
    L, W, R = 0.16, 0.11, 0.022
    Hb = 0.0295
    out = K.rounded_rect(L - 0.004, W - 0.004, R, seg=3)
    bm = bmesh.new()
    K.bm_prism(bm, out, Hb, matrix=mat4((0, 0, Hb / 2)))
    loops(bm, 0, (-0.03, 0.03))
    P.mesh('body', bm, 'paint', bev=0.004, segs=2)
    # the double seam round the top, the lid inside it and the lid's bead
    path = [(x, y, Hb + 0.0012) for (x, y) in K.rounded_rect(L - 0.0035, W - 0.0035, R, seg=3)]
    P.tube('seam', path, 1.0, 'alu', closed=True, sharp=60.0,
           profile=[(-0.0026, -0.0018), (0.0012, -0.0018), (0.0026, -0.0004), (0.0026, 0.0004), (0.0012, 0.0018),
                    (-0.0026, 0.0018)])
    bm = bmesh.new()
    K.bm_prism(bm, K.rounded_rect(L - 0.009, W - 0.009, R - 0.004, seg=3), 0.003, matrix=mat4((0, 0, Hb + 0.0003)))
    loops(bm, 0, (-0.03, 0.03))
    P.mesh('lid', bm, 'alu', bev=0.0008, segs=1)
    path = [(x, y, Hb + 0.0018) for (x, y) in K.rounded_rect(L - 0.024, W - 0.024, R - 0.01, seg=3)]
    P.tube('bead', path, 0.0016, 'alu', closed=True, segs=5, sharp=60.0)
    # the ring pull: rivet, nose and the ring lying flat
    zl = Hb + 0.0018
    P.cyl('rivet', 0.0042, 0.002, (0.056, 0, zl + 0.001), 'alu', segs=10, bev=0.0006, bsegs=1)
    P.box('nose', (0.02, 0.011, 0.0016), (0.05, 0, zl + 0.0012), 'alu', bev=0.0006, segs=1)
    P.torus('ring', 0.0105, 0.0019, loc=(0.031, 0, zl + 0.0016), segs=16, rsegs=5, material='alu')
    # the label band round the side
    path = [(x, y, 0.0148) for (x, y) in out]
    P.tube('label', path, 1.0, 'paint_b', closed=True, sharp=50.0,
           profile=[(-0.0052, -0.0006), (0.0052, -0.0006), (0.0052, 0.0009), (-0.0052, 0.0009)])
    P.views = [('a', 35, 32), ('b', 215, 30)]


def food_dog_old(P):
    """
    An old tin of dog food: the body with its seams rolled top and bottom, the lid with its expansion rings, a
    label round the body with a stripe round the label, one dent knocked into it.
    """
    P.ao_distance = 0.03
    Rw, Rl, Rs = 0.0412, 0.0422, 0.043          # wall, label, stripe radius
    prof = [(0.0, 0.0035), (0.031, 0.0035), (0.0362, 0.0042), (0.0392, 0.0),
            (0.0428, 0.0), (0.0444, 0.0024), (0.0442, 0.005), (0.0425, 0.0068), (Rw, 0.0078),
            (Rw, 0.0098), (Rl, 0.0102), (Rl, 0.042), (Rl, 0.0572),
            (Rs, 0.0578), (Rs, 0.0665), (Rs, 0.0752), (Rl, 0.0758), (Rl, 0.0875), (Rl, 0.0998),
            (Rw, 0.1002), (Rw, 0.1022), (0.0425, 0.1032), (0.0442, 0.105), (0.0444, 0.1076), (0.0428, 0.11),
            (0.0392, 0.11), (0.0362, 0.1056), (0.027, 0.1068), (0.019, 0.105), (0.0, 0.1058)]
    th_d, z_d, rd, depth = math.radians(-58), 0.066, 0.02, 0.0042

    def dent(co):
        if not (0.008 < co.z < 0.102):
            return co
        r = math.hypot(co.x, co.y)
        th = math.atan2(co.y, co.x)
        dth = (th - th_d + math.pi) % math.tau - math.pi
        d = math.hypot(dth * r, co.z - z_d)
        if d >= rd:
            return co
        k = (1 - (d / rd) ** 2) ** 2
        s = (r - depth * k) / r
        return V((co.x * s, co.y * s, co.z))

    def mat_of(z):
        if 0.0099 < z < 0.0999:
            return 2 if 0.0576 < z < 0.0754 else 1
        return 0
    lathe_mats(P, 'tin', prof, ['steel', 'paint', 'paint_b'], mat_of, segs=24, sharp=40.0, deform=dent)
    P.views = [('a', 35, 22), ('b', 215, 22)]


def food_nuts_old(P):
    """
    A pouch of damp nuts lying on its face: the stand-up pouch's film crinkled, its gusseted bottom rounded off,
    flat seals down both sides and across the top, the zip strip under the top seal and a tear notch.
    """
    P.ao_distance = 0.03
    W, L, T = 0.14, 0.20, 0.04
    zc = 0.007
    xb0, xt0, xt1 = -L / 2, 0.076, L / 2         # bottom end; the flat top seal from xt0; the top edge
    m, mb = 12, 6
    e, g = 2.0, 0.55

    def st(x):
        # the gusseted bottom rounds off over 2.6 cm, the top flattens into the seal over 6.5 cm
        eb = min(1.0, max(0.0, (x - xb0) / 0.026))
        fb = math.sqrt(max(0.0, 1 - (1 - eb) ** 2))
        et = min(1.0, max(0.0, (xt0 + 0.004 - x) / 0.065))
        ft = math.sin(et * math.pi / 2) ** 0.75
        f = min(fb, ft)
        w = (W - 0.012) * (0.55 + 0.45 * fb) * (1 - 0.04 * f)
        return w, max(0.0016, (T - zc) * f), max(0.0016, 0.016 * f)

    xs = [xb0 + 0.0015, xb0 + 0.004, xb0 + 0.009, xb0 + 0.016, xb0 + 0.026]
    xs += [xb0 + 0.038 + 0.0125 * i for i in range(10)] + [0.0525, 0.0625, 0.0705, xt0 + 0.004]
    folds = ((-0.03, 0.5, 0.012), (0.035, -0.9, 0.01))      # (x at y = 0, slope dx/dy, half width)
    rings = []
    for i, x in enumerate(xs):
        w, ht, hb = st(x)
        pts = lens_section(w, ht, hb, zc, m=m, mb=mb, e=e, g=g, blend=0.4)
        out = []
        for k, (y, z) in enumerate(pts):
            if 0 < k < m and 0 < i < len(xs) - 1:
                # crinkles: the film pressed into facets, and two soft folds across it
                s = max(0.0, 1 - abs(2 * y / w) ** 2) * min(1.0, ht / 0.02)
                fz = 0.0
                for (x0, sl, hw) in folds:
                    d = abs((x - x0) - sl * y) / math.hypot(1.0, sl)
                    fz += 0.003 * max(0.0, 1 - d / hw)
                z += s * (0.003 * jit(i * 31 + k, 7.0) + fz)
            out.append((x, y, z))
        rings.append(out)
    bm = bmesh.new()
    K.bm_loft(bm, rings, cap_start=True, cap_end=True)
    outward(bm)
    tree = BVHTree.FromBMesh(bm)
    P.mesh('pouch', bm, 'paint', sharp=30.0, wn=False)
    # the crinkles in the film: short creased ridges laid on it
    ridge = [(-0.0007, -0.0024), (0.0017, 0.0), (-0.0007, 0.0024)]
    for line in (((-0.062, -0.034), (-0.04, -0.014), (-0.022, -0.004)), ((-0.002, 0.03), (0.018, 0.013), (0.04, 0.009)),
                 ((-0.034, 0.038), (-0.014, 0.046)), ((0.028, -0.036), (0.043, -0.02), (0.056, -0.023)),
                 ((-0.08, 0.016), (-0.064, 0.03))):
        P.tube('crinkle', lay(tree, line, 0.0), 1.0, 'paint', profile=ridge, bend=0.01, sharp=40.0,
               radius_fn=lambda u: 0.35 + 0.65 * math.sin(math.pi * u))
    # flat seals: across the top (with the zip strip under it) and down both sides
    bm = bmesh.new()
    K.bm_cube(bm, (xt1 - xt0, W, 0.003), mat4(((xt0 + xt1) / 2, 0, zc)))
    top = P.mesh('top_seal', bm, 'paint', bev=0.001, segs=1)
    cut = bmesh.new()
    K.bm_prism(cut, [(0.0, 0.0), (-0.005, 0.009), (0.005, 0.009)], 0.02,
               matrix=mat4((xt1 - 0.009, W / 2 - 0.008, zc), (0, 0, 0)))
    P.cut(top, cut)
    for dx in (0.007, 0.0115):
        P.tube('zip', [(xt0 + dx, -W / 2 + 0.002, zc + 0.0014), (xt0 + dx, W / 2 - 0.002, zc + 0.0014)], 0.0022,
               'paint_b', segs=6, sharp=50.0)
    for sg in (-1, 1):
        P.box('side_seal', (xt0 - xb0 - 0.03, 0.008, 0.0026), ((xb0 + 0.03 + xt0) / 2, sg * (W / 2 - 0.004), zc),
              'paint', bev=0.001, segs=1)
    P.views = [('a', 35, 34), ('b', 215, 30)]


# ------------------------------------------------------------------------------------------------ drinks

def can_profile(H):
    """The lathe profile (r, z) of a 66 mm drinks can H tall: the domed bottom on its stand ring, the necked
    bottom, the straight body, the necked top, the double seam and the recessed lid."""
    t = H - 0.115                         # the top part moves up with the height
    return [(0.0, 0.0085), (0.012, 0.0072), (0.019, 0.0045), (0.0222, 0.0018), (0.0238, 0.0), (0.0262, 0.0),
            (0.0285, 0.0028), (0.0318, 0.0085), (0.033, 0.0135), (0.033, 0.030 + t * 0.4),
            (0.033, 0.050 + t * 0.4), (0.0336, 0.0505 + t * 0.4), (0.0336, 0.0785 + t * 0.6),
            (0.033, 0.079 + t * 0.6), (0.033, 0.1005 + t), (0.0318, 0.1045 + t), (0.0282, 0.1095 + t),
            (0.0272, 0.1118 + t), (0.0281, 0.1128 + t), (0.0283, 0.1146 + t), (0.0274, 0.1152 + t),
            (0.0262, 0.1143 + t), (0.0254, 0.1112 + t), (0.0246, 0.1106 + t), (0.0, 0.1106 + t)]


def drink_can(P, H):
    """A drinks can: bare aluminium bottom and lid, the body in the paint with a band round it, the tab and its
    rivet on the lid."""
    P.ao_distance = 0.02
    t = H - 0.115
    b0, b1, top = 0.0505 + t * 0.4, 0.0785 + t * 0.6, 0.1118 + t

    def mat_of(z):
        if z < 0.0085 or z > top:
            return 0
        return 2 if b0 < z < b1 else 1
    lathe_mats(P, 'can', can_profile(H), ['alu', 'paint', 'paint_b'], mat_of, segs=24, sharp=40.0)
    # the tab: a plate with its finger hole, riveted at the middle of the lid, pointing away from the mouth
    zl = 0.1106 + t
    outer = [(x - 0.0035, y) for (x, y) in K.rounded_rect(0.024, 0.0135, 0.0055, seg=3)]
    inner = [(x * 0.42 - 0.0085, y * 0.42) for (x, y) in K.rounded_rect(0.024, 0.0135, 0.0055, seg=3)]
    plate_xy(P, outer, inner, zl + 0.0004, zl + 0.0018, 'alu', name='tab', sharp=50.0)
    P.cyl('rivet', 0.0026, 0.0022, (0.0, 0, zl + 0.0013), 'alu', segs=10, bev=0.0006, bsegs=1)
    # the score round the mouth (a raised lip of the lid in front of the tab)
    mouth = [(0.0125 + 0.0065 * math.cos(a), 0.0075 * math.sin(a)) for a in (math.tau * i / 12 for i in range(12))]
    P.prism('mouth', mouth, 0.0006, (0, 0, zl + 0.0002), 'alu', bev=None)
    P.views = [('a', 35, 18), ('b', 215, 20)]


def drink_soda(P):
    """A 0.33 L can of soda."""
    drink_can(P, 0.115)


def drink_energy(P):
    """A 0.5 L slim tall can of energy drink, built like the soda can."""
    drink_can(P, 0.168)


def drink_water(P):
    """
    A 2 L plastic bottle of water: a see-through body with moulded grip rings and a five-footed petal bottom, a
    label round its middle, a ribbed screw cap over the neck's support ring.
    """
    P.ao_distance = 0.04
    R = 0.055
    prof = [(0.0, 0.010), (0.012, 0.0085), (0.022, 0.004), (0.030, 0.0005), (0.036, 0.0), (0.042, 0.0012),
            (0.048, 0.0055), (0.052, 0.012), (0.0545, 0.022), (R, 0.034),
            (R, 0.056), (R - 0.0035, 0.06), (R, 0.064), (R, 0.076), (R - 0.0035, 0.08), (R, 0.084),
            (R, 0.205), (R - 0.0035, 0.209), (R, 0.213), (R, 0.222), (R - 0.0035, 0.226), (R, 0.23),
            (R, 0.24), (0.053, 0.252), (0.047, 0.268), (0.038, 0.283), (0.028, 0.295), (0.019, 0.303),
            (0.0145, 0.307), (0.0145, 0.309), (0.0185, 0.3095), (0.0185, 0.3125), (0.0142, 0.313), (0.0142, 0.318),
            (0.0, 0.318)]
    bm = bmesh.new()
    K.bm_lathe(bm, prof, segs=30)
    bmesh.ops.remove_doubles(bm, verts=bm.verts[:], dist=1e-7)
    # the petal bottom: five feet, the valleys between them pushed up and in
    for v in bm.verts:
        if v.co.z < 0.034:
            r = math.hypot(v.co.x, v.co.y)
            th = math.atan2(v.co.y, v.co.x)
            val = 0.5 - 0.5 * math.cos(5 * th)
            tz = min(1.0, max(0.0, (0.034 - v.co.z) / 0.034))
            wr = min(1.0, max(0.0, (r - 0.016) / 0.024))
            wr = wr * wr * (3 - 2 * wr)
            v.co.z += 0.013 * val * wr * tz ** 0.7
            s = 1 - 0.07 * val * tz
            v.co.x *= s
            v.co.y *= s
    outward(bm)
    P.mesh('bottle', bm, 'glass', sharp=50.0, wn=False)
    # the label round the middle
    P.lathe('label', [(R - 0.001, 0.104), (R + 0.0008, 0.1045), (R + 0.0012, 0.106), (R + 0.0012, 0.184),
                      (R + 0.0008, 0.1855), (R - 0.001, 0.186)], material='paint', segs=30, loop=True, sharp=50.0)
    # the screw cap with its grip ribs
    P.lathe('cap', [(0.0146, 0.3132), (0.0158, 0.3132), (0.0158, 0.3385), (0.0146, 0.34), (0.0, 0.34)],
            material='paint_b', segs=20, close=None, sharp=50.0)
    bm = bmesh.new()
    for i in range(16):
        a = math.tau * i / 16
        K.bm_cube(bm, (0.0022, 0.0018, 0.021), mat4((0.0161 * math.cos(a), 0.0161 * math.sin(a), 0.3265),
                                                   (0, 0, math.degrees(a))))
    P.mesh('cap_ribs', bm, 'paint_b', sharp=50)
    P.views = [('a', 35, 16), ('b', 215, 18)]


def bottle_radius(prof, z):
    """The radius of a lathe profile [(r, z)] (z rising) at height z."""
    for (r0, z0), (r1, z1) in zip(prof[:-1], prof[1:]):
        if z0 <= z <= z1 and z1 > z0:
            return r0 + (r1 - r0) * (z - z0) / (z1 - z0)
    return prof[-1][0]


def drink_beer(P):
    """A 0.5 L beer bottle: thick green glass (opaque in our style), a label wrapped round the belly, a band
    round the neck and a steel crown cap with its crimped skirt."""
    P.ao_distance = 0.03
    R = 0.034
    prof = [(0.0, 0.006), (0.022, 0.004), (0.029, 0.0012), (0.031, 0.0), (0.0332, 0.002), (R, 0.008),
            (R, 0.135), (0.0335, 0.142), (0.031, 0.156), (0.025, 0.171), (0.019, 0.184), (0.0148, 0.197),
            (0.0132, 0.208), (0.0128, 0.2215), (0.0142, 0.2225), (0.0145, 0.2255), (0.0, 0.2255)]
    P.lathe('bottle', prof, material='paint', segs=24, sharp=50.0)
    # the belly label: wrapped two-thirds of the way round, towards the front-right, its cut ends closed
    lab = [(R - 0.0008, 0.046), (R + 0.0006, 0.0465), (R + 0.0009, 0.048), (R + 0.0009, 0.113),
           (R + 0.0006, 0.1145), (R - 0.0008, 0.115)]
    a0, span = math.radians(-30 - 115), math.radians(230)
    bm = bmesh.new()
    rings = K.bm_lathe(bm, lab, segs=16, loop=True, angle=span, start=a0)
    for idx in (0, -1):
        bm.faces.new([ring[idx] for ring in rings])
    bmesh.ops.remove_doubles(bm, verts=bm.verts[:], dist=1e-7)
    outward(bm)
    P.mesh('label', bm, 'paint_b', sharp=50.0, wn=False)
    # the neck band, following the cone of the neck
    zs = [0.186, 0.1875, 0.201, 0.2025]
    ring = [(bottle_radius(prof, z) + d, z) for z, d in zip(zs, (-0.0008, 0.0008, 0.0008, -0.0008))]
    P.lathe('neck_label', ring, material='paint_b', segs=24, loop=True, sharp=50.0)
    # the crown cap: a crimped skirt (14 flutes) under a flat top
    bm = bmesh.new()
    cap = [(0.0136, 0.2225), (0.0158, 0.2225), (0.0161, 0.2245), (0.0157, 0.2325), (0.0151, 0.2372),
           (0.0136, 0.2392), (0.0, 0.24)]
    K.bm_lathe(bm, cap, segs=28)
    for v in bm.verts:
        if v.co.z < 0.2362:
            th = math.atan2(v.co.y, v.co.x)
            s = 1 + 0.06 * math.cos(14 * th) * min(1.0, (0.2362 - v.co.z) / 0.006)
            v.co.x *= s
            v.co.y *= s
    P.mesh('crown', bm, 'steel', sharp=50.0)
    P.views = [('a', 35, 16), ('b', 215, 18)]


def drink_spirit(P):
    """A 1 L bottle of sorghum spirit: a square glass bottle with square shoulders and a short neck, a cream
    label on the front, a capsule seal over the cap."""
    P.ao_distance = 0.04

    def ring(z, a, p, n=32):
        pts = []
        for k in range(n):
            th = math.tau * k / n + math.pi / n
            c, s = math.cos(th), math.sin(th)
            pts.append((a * math.copysign(abs(c) ** (2 / p), c), a * math.copysign(abs(s) ** (2 / p), s), z))
        return pts
    st = [(0.0, 0.0395, 6), (0.003, 0.0418, 7), (0.010, 0.0425, 8), (0.051, 0.0425, 8), (0.07, 0.0425, 8),
          (0.14, 0.0425, 8), (0.161, 0.0425, 8),
          (0.200, 0.0425, 8), (0.212, 0.042, 7), (0.220, 0.0395, 5.5), (0.226, 0.033, 3.5), (0.231, 0.024, 2.4),
          (0.236, 0.019, 2.0), (0.242, 0.0165, 2.0), (0.262, 0.0158, 2.0), (0.27, 0.0158, 2.0)]
    solid(P, 'bottle', [ring(z, a, p) for (z, a, p) in st], 'glass', sharp=45.0)
    # the front label (+X), a little proud of the glass, with a band across it
    P.box('label', (0.0018, 0.066, 0.104), (0.0425 + 0.0005, 0, 0.106), 'paint', bev=0.0008, segs=1)
    P.box('label_band', (0.0012, 0.066, 0.012), (0.0425 + 0.0019, 0, 0.142), 'paint_b', bev=0.0005, segs=1)
    # the capsule over the cap
    P.lathe('capsule', [(0.0168, 0.251), (0.0182, 0.2515), (0.0186, 0.2545), (0.0186, 0.2925), (0.0176, 0.2972),
                        (0.0130, 0.2995), (0.0, 0.30)], material='paint_b', segs=24, sharp=50.0)
    P.torus('capsule_bead', 0.0187, 0.0014, loc=(0, 0, 0.258), segs=24, rsegs=5, material='paint_b')
    P.views = [('a', 35, 16), ('b', 215, 18)]


# ------------------------------------------------------------------------------------------------ medicine

def med_pain(P):
    """
    A box of painkillers lying flat: a card carton with its end flap opened, a blister strip pulled half out of
    it (foil backing, the capsules in their bubbles), a stripe round the box and a raised capsule on its top.
    """
    P.ao_distance = 0.02
    L, W, H, t = 0.10, 0.06, 0.025, 0.0012
    bm = bmesh.new()
    K.bm_cube(bm, (L, W, H), mat4((0, 0, H / 2)))
    loops(bm, 0, (-0.044, -0.014, 0.033))
    loops(bm, 1, (-0.024, 0.018))
    box = P.mesh('carton', bm, 'paint', bev=0.0011, segs=2)
    cut = bmesh.new()
    K.bm_cube(cut, (L, W - 2 * t, H - 2 * t), mat4((t + 0.002, 0, H / 2)))
    P.cut(box, cut)
    # the end flap, swung open up and out about the top edge of the mouth, its tuck tongue curling down
    hinge = V((L / 2, 0, H))
    a = 58.0
    d = V((math.sin(math.radians(a)), 0, math.cos(math.radians(a))))
    P.box('flap', (0.0009, W - 0.002, H), tuple(hinge + d * (H / 2)), 'paint', rot=(0, a, 0), bev=0.0004, segs=1)
    a2 = a + 85.0
    d2 = V((math.sin(math.radians(a2)), 0, math.cos(math.radians(a2))))
    P.box('tongue', (0.0009, W - 0.008, 0.012), tuple(hinge + d * H + d2 * 0.006), 'paint', rot=(0, a2, 0), bev=0.0004,
          segs=1)
    for sg in (-1, 1):
        dd = V((math.cos(math.radians(25)), sg * math.sin(math.radians(25)), 0))
        P.box('dust_flap', (0.014, 0.0009, H - 0.005), tuple(V((L / 2, sg * (W / 2 - 0.0005), H / 2)) + dd * 0.007),
              'paint', rot=(0, 0, sg * 25), bev=0.0004, segs=1)
    # the blister strip, half out of the box: the foil, and the capsules in their bubbles
    xs0, xs1 = 0.004, 0.094
    P.box('foil', (xs1 - xs0, 0.046, 0.0011), ((xs0 + xs1) / 2, 0, t + 0.00055), 'alu', bev=0.0004, segs=1)
    bm = bmesh.new()
    for i in range(4):
        for sy in (-1, 1):
            K.bm_sphere(bm, 1.0, 8, 5, matrix=mat4((0.035 + 0.0165 * i, sy * 0.0115, t + 0.0017), (0, 0, 0),
                                                    (0.0078, 0.0042, 0.0028)))
    P.mesh('capsules', bm, 'paint_b', sharp=80.0, wn=False)
    # the stripe round the box near its closed end (top and both sides)
    xs = -0.03
    P.box('stripe', (0.012, W + 0.0012, 0.0006), (xs, 0, H + 0.0003), 'paint_b', bev=0.0002, segs=1)
    for sg in (-1, 1):
        P.box('stripe', (0.012, 0.0006, H + 0.0006), (xs, sg * (W / 2 + 0.0003), (H + 0.0006) / 2), 'paint_b',
              bev=0.0002, segs=1)
    # the capsule symbol on the top: two halves of a capsule, raised
    cl, cw = 0.028, 0.012
    half = [(0.0, -cw / 2), (cl / 2 - cw / 2, -cw / 2)]
    half += [(cl / 2 - cw / 2 + cw / 2 * math.cos(q), cw / 2 * math.sin(q))
             for q in (math.radians(-90 + 180 * i / 6) for i in range(1, 6))]
    half += [(cl / 2 - cw / 2, cw / 2), (0.0, cw / 2)]
    for sg, mat in ((1, 'paint_b'), (-1, 'ceramic')):
        poly = [(sg * x, y) for (x, y) in half]
        if sg < 0:
            poly = poly[::-1]
        P.prism('symbol', poly, 0.0012, matrix=mat4((0.012, -0.006, H + 0.0004), (0, 0, 32)), material=mat,
                bev=0.0004, segs=1)
    P.views = [('a', 35, 34), ('b', 215, 30)]


def med_warm(P):
    """A small round jar of warming pills: the amber body, a cream label round it, the child-proof cap with its
    grip ribs and a raised ring on top."""
    P.ao_distance = 0.02
    P.lathe('jar', [(0.0, 0.003), (0.022, 0.003), (0.027, 0.0005), (0.0285, 0.0), (0.0292, 0.002), (0.0292, 0.051),
                    (0.028, 0.0535), (0.0255, 0.055), (0.0255, 0.06), (0.0, 0.06)], material='paint', segs=24,
            sharp=50.0)
    P.lathe('label', [(0.0284, 0.0115), (0.0296, 0.012), (0.0299, 0.0135), (0.0299, 0.0435), (0.0296, 0.045),
                      (0.0284, 0.0455)], material='ceramic', segs=24, loop=True, sharp=50.0)
    P.lathe('cap', [(0.0262, 0.0545), (0.0302, 0.0545), (0.0306, 0.0565), (0.0306, 0.0725), (0.0291, 0.0748),
                    (0.0, 0.075)], material='paint_b', segs=24, sharp=50.0)
    bm = bmesh.new()
    for i in range(18):
        a = math.tau * i / 18
        K.bm_cube(bm, (0.0022, 0.0018, 0.0135), mat4((0.0309 * math.cos(a), 0.0309 * math.sin(a), 0.0642),
                                                    (0, 0, math.degrees(a))))
    P.mesh('cap_ribs', bm, 'paint_b', sharp=50)
    P.torus('cap_ring', 0.019, 0.0016, loc=(0, 0, 0.0752), segs=20, rsegs=4, material='paint_b')
    P.views = [('a', 35, 22), ('b', 215, 24)]


def med_kit(P):
    """
    A hard first-aid case lying flat: a deep base and a shallower lid meeting at a dark gasket line, a raised
    panel on the lid with a white plus on it, the carrying handle hanging against the front between two draw
    latches, the hinges at the back, rubber feet.
    """
    P.ao_distance = 0.06
    L, W = 0.32, 0.22
    zf, zp, H = 0.004, 0.078, 0.122            # the feet, the parting line, the top
    P.box('base', (L, W, zp - zf), (0, 0, (zf + zp) / 2), 'paint', bev=0.018, segs=3)
    P.box('lid', (L, W, H - zp - 0.002), (0, 0, (zp + 0.002 + H) / 2), 'paint', bev=0.018, segs=3)
    P.box('gasket', (L - 0.014, W - 0.014, 0.006), (0, 0, zp + 0.001), 'trim', bev=0.002, segs=1)
    for sx in (-1, 1):
        for sy in (-1, 1):
            P.cyl('foot', 0.012, zf + 0.002, (sx * 0.12, sy * 0.075, (zf + 0.002) / 2), 'rubber', segs=12,
                  bev=0.0015, bsegs=1)
    # the raised panel on the lid and the plus on it
    P.box('panel', (L - 0.07, W - 0.06, 0.006), (0, 0, H + 0.001), 'paint', bev=0.0035, segs=2)
    a, b = 0.044, 0.014                          # half the arm length, half the arm width
    plus = [(a, -b), (a, b), (b, b), (b, a), (-b, a), (-b, b), (-a, b), (-a, -b), (-b, -b), (-b, -a), (b, -a),
            (b, -b)]
    P.prism('plus', plus, 0.004, (0, 0, H + 0.004 + 0.002), 'ceramic', bev=0.0015, segs=2)
    # the handle hanging down the front (-Y) from its two pivots, between the latches
    yf = -W / 2
    for sx in (-1, 1):
        P.box('pivot', (0.026, 0.016, 0.022), (sx * 0.062, yf - 0.006, zp - 0.012), 'trim', bev=0.004, segs=1)
    P.tube('handle', [(-0.062, yf - 0.012, zp - 0.016), (-0.062, yf - 0.02, 0.036), (0.062, yf - 0.02, 0.036),
                      (0.062, yf - 0.012, zp - 0.016)], 0.0085, 'trim', segs=10, bend=0.016)
    for sx in (-1, 1):
        x = sx * 0.118
        P.box('latch_plate', (0.036, 0.005, 0.026), (x, yf - 0.002, zp - 0.016), 'steel', bev=0.002, segs=1)
        P.box('latch', (0.03, 0.007, 0.036), (x, yf - 0.0065, zp + 0.004), 'steel', rot=(-4, 0, 0), bev=0.0025,
              segs=2)
        P.box('latch_keeper', (0.022, 0.006, 0.009), (x, yf - 0.0025, zp + 0.026), 'steel', bev=0.002, segs=1)
    # hinges at the back (+Y)
    for sx in (-1, 1):
        P.cyl('hinge', 0.0055, 0.06, (sx * 0.09, W / 2 + 0.002, zp + 0.001), 'steel', axis='X', segs=12, bev=0.001,
              bsegs=1)
        P.box('hinge_leaf', (0.06, 0.004, 0.02), (sx * 0.09, W / 2 + 0.0005, zp - 0.009), 'steel', bev=0.001,
              segs=1)
    P.views = [('a', 35, 30), ('b', 215, 30)]


# ------------------------------------------------------------------------------------------------ head lamp

def lamp_old(P):
    """
    A head lamp lying on a table: the elastic band in a loop standing on its edge with a slider buckle, the lamp
    housing on the front (a round lens in a bezel, a rubber switch on top, the tilt knobs), the battery box on
    the back and the cable between them along the top of the band.
    """
    P.ao_distance = 0.03
    a, b, hb = 0.072, 0.066, 0.024              # the band's loop (half axes) and its width
    loop = [(a * math.cos(t), b * math.sin(t), hb / 2 + 0.0004) for t in (math.tau * i / 40 for i in range(40))]
    P.tube('band', loop, 1.0, 'paint_b', closed=True, sharp=30.0, profile=K.rounded_rect(hb, 0.0042, 0.0014, seg=1))
    # the slider buckle on the band's right side
    P.box('buckle', (0.016, 0.0055, hb + 0.003), (0.0, -(b + 0.0025), (hb + 0.003) / 2 + 0.0002), 'trim', bev=0.0015,
          segs=1)
    # the lamp housing on the front (+X) on its bracket
    P.box('bracket', (0.008, 0.05, 0.026), (a + 0.004, 0, 0.0135), 'trim', bev=0.002, segs=1)
    hx, hz = a + 0.026, 0.023
    P.box('housing', (0.034, 0.058, 0.044), (hx, 0, hz), 'paint', bev=0.011, segs=3)
    for sy in (-1, 1):
        P.cyl('tilt_knob', 0.008, 0.005, (a + 0.012, sy * 0.0315, 0.0135), 'trim', axis='Y', segs=12, bev=0.0012,
              bsegs=1)
    P.lathe('bezel', [(0.0152, 0.0), (0.0192, 0.0), (0.0198, 0.003), (0.0172, 0.005), (0.0152, 0.004)],
            loc=(hx + 0.017, 0, hz), material='chrome', axis='X', segs=24, loop=True, sharp=50.0)
    P.lathe('lens', [(0.0, 0.0045), (0.009, 0.0042), (0.0155, 0.0032), (0.0158, 0.0)], loc=(hx + 0.017, 0, hz),
            material='lens_head', axis='X', segs=24, sharp=60.0)
    P.cyl('switch', 0.0065, 0.004, (hx - 0.002, 0, hz + 0.022 + 0.0015), 'rubber', segs=12, bev=0.0012, bsegs=1)
    # the battery box on the back (-X), its lid line and clip
    bx = -(a + 0.016)
    P.box('battery', (0.026, 0.066, 0.046), (bx, 0, 0.023), 'paint', bev=0.008, segs=2)
    P.box('battery_lid', (0.004, 0.056, 0.036), (bx - 0.013, 0, 0.023), 'paint', bev=0.0015, segs=1)
    P.box('battery_clip', (0.005, 0.016, 0.01), (bx - 0.0155, 0, 0.034), 'trim', bev=0.0015, segs=1)
    # the cable out of the battery box, over the top of the band to the back of the housing
    pts = [(bx + 0.006, 0.026, 0.044), (bx + 0.012, 0.03, 0.0285)]
    pts += [(a * math.cos(t), b * math.sin(t), hb + 0.0034) for t in
            (math.radians(d) for d in (150, 125, 100, 75, 50, 28))]
    pts += [(a + 0.004, 0.024, 0.029)]
    P.tube('cable', pts, 0.0026, 'trim', segs=6, bend=0.012)
    P.views = [('a', 35, 30), ('b', 215, 30)]


# ------------------------------------------------------------------------------------------------ backpacks

def pack_sec(w, h, z0, n=24, p=3.2, puff=0.0, bulge=0.0):
    """A soft section (y, z) of a backpack lying flat: a rounded rectangle w x h standing on z0, its top (the
    back panel) puffed up by `puff`, its lower part pushed out sideways by `bulge` (a front pocket), pressed flat
    where it meets the floor; counter-clockwise seen from +X."""
    pts = []
    for k in range(n):
        th = math.tau * k / n
        c, s = math.cos(th), math.sin(th)
        y = w / 2 * math.copysign(abs(c) ** (2 / p), c)
        z = z0 + h / 2 + h / 2 * math.copysign(abs(s) ** (2 / p), s)
        if s > 0:
            z += puff * (max(0.0, 1 - (2 * y / w) ** 2) if w > 1e-9 else 1.0) * s
        elif bulge:
            y += math.copysign(bulge * (-s) ** 0.6 * abs(c) ** 0.3, c)
        pts.append((y, max(0.0, z)))
    return pts


def lay(tree, pts2d, lift, z0=1.0):
    """Points (x, y) dropped onto a surface (BVH) and lifted off it along its normal."""
    out = []
    for (x, y) in pts2d:
        hit, nrm, _, _ = tree.ray_cast(V((x, y, z0)), V((0, 0, -1)), z0 + 1.0)
        if hit is None:
            # beyond the outline: the nearest point of the surface at the floor-most edge
            hit, nrm, _, _ = tree.find_nearest(V((x, y, 0.0)))
        out.append(hit + nrm * lift)
    return out


def lay_side(tree, pts_xz, side, lift):
    """Points (x, z) pressed onto the side of a body (BVH) from y = side * 1 m, lifted off it along its normal."""
    out = []
    for (x, z) in pts_xz:
        hit, nrm, _, _ = tree.ray_cast(V((x, side * 1.0, z)), V((0, -side, 0)), 2.0)
        if hit is None:
            hit, nrm, _, _ = tree.find_nearest(V((x, side * 0.2, z)))
        out.append(hit + nrm * lift)
    return out


def piping(P, sec, xs, k_right, k_left, r=0.003, material='paint_b', name='piping'):
    """Piping along two corner lines of a lofted body (section points k_right and k_left at the stations xs)."""
    for k in (k_right, k_left):
        path = []
        for x in xs:
            pts = sec(x)
            nr = section_normals(pts)
            (y, z), (ny, nz) = pts[k], nr[k]
            path.append((x, y + ny * r * 0.4, z + nz * r * 0.4))
        P.tube(name, path, r, material, segs=5, bend=0.0, sharp=60.0)


def strap(P, pts, w, t, material, name='strap', bend=0.03, **kw):
    """A flat strap (webbing, a padded shoulder strap) w wide and t thick along a path; it lies flat on
    whatever it runs over (its width stays across the path, its thickness up)."""
    prof = K.rounded_rect(t, w, min(t, w) * 0.45, seg=1)
    return P.tube(name, pts, 1.0, material, profile=prof, bend=bend, sharp=50.0, **kw)


def buckle(P, loc, yaw=0.0, w=0.03, l=0.026, t=0.006, material='trim', name='buckle'):
    """A plastic ladder-lock / side-release buckle lying flat."""
    P.box(name, (l, w, t), loc, material, rot=(0, 0, yaw), bev=0.0018, segs=1)


def densify2d(pts, step):
    """A 2D polyline with extra points so that no segment is longer than step."""
    out = [pts[0]]
    for (x0, y0), (x1, y1) in zip(pts[:-1], pts[1:]):
        n = max(1, int(math.ceil(math.hypot(x1 - x0, y1 - y0) / step)))
        out += [(x0 + (x1 - x0) * i / n, y0 + (y1 - y0) * i / n) for i in range(1, n + 1)]
    return out


def lay_round(tree, y, xc, zc, angles, lift, R=1.0):
    """Points laid onto a surface (BVH) round a centre (xc, zc) in the plane y: rays from angle a (degrees in the XZ
    plane, 0 = +X, 90 = +Z) at distance R in towards the centre, lifted off the surface along its normal."""
    out = []
    for a in angles:
        d = V((math.cos(math.radians(a)), 0.0, math.sin(math.radians(a))))
        o = V((xc, y, zc)) + d * R
        hit, nrm, _, _ = tree.ray_cast(o, -d, R)
        if hit is None:
            raise RuntimeError(f'lay_round: missed at {a} deg')
        out.append(hit + nrm * lift)
    return out


def pack_dims(x, L, W, T, rb, rt, taper=0.15, lift=None):
    """
    Width, height and floor of a pack's section at x (its height axis, the top at +L/2): a flat base whose edges
    round off over rb, a U-shaped top (radius rt in plan) round which the side gusset keeps its depth, thinner
    towards the top by `taper`. lift = (z, x0, x1): the body rides that high over a front pocket from x0 to x1.
    """
    u, v = x + L / 2, L / 2 - x
    eb = min(1.0, max(0.0, u / rb))
    cb = 1 - math.sqrt(max(0.0, 1 - (1 - eb) ** 2))
    w = W - 2 * rb * cb
    h = T * (1 - taper * u / L) - 1.6 * rb * cb
    if v < rt:
        q = (rt - v) / rt
        w *= math.sqrt(max(0.0, 1 - q * q))
        h *= 1 - 0.18 * q ** 3
    z0 = 0.0
    if lift:
        lz, x0, x1 = lift
        pk = min(1.0, max(0.0, (x - x0) / 0.03), max(0.0, (x1 - x) / 0.03))
        z0 = lz * pk * pk * (3 - 2 * pk)
        h -= z0
    return w, h, z0


def dome_dims(x, L, W, T, rb, x_dome, x_apex, taper_w=0.0, taper_h=0.12, end_h=0.55):
    """Width and height of a pack (or of its lid) at x: a flat base whose edges round off over rb, a domed top
    from x_dome closing at x_apex (its height there end_h of the full height), narrower and thinner towards the
    top by taper_w / taper_h."""
    u = x + L / 2
    eb = min(1.0, max(0.0, u / rb))
    cb = 1 - math.sqrt(max(0.0, 1 - (1 - eb) ** 2))
    w = W * (1 - taper_w * u / L) - 2 * rb * cb
    h = T * (1 - taper_h * u / L) - 1.6 * rb * cb
    if x > x_dome:
        q = min(1.0, (x - x_dome) / (x_apex - x_dome))
        w *= math.sqrt(max(0.0, 1 - q * q))
        h *= 1 - (1 - end_h) * q ** 2
    return w, h


def pack_body(P, sec, xs, name='body', material='paint'):
    """The pack's body: a closed loft of sec(x) at the stations xs, the last of which (the apex of a U-shaped
    top) has no width: it is welded into an edge. Returns its BVH (for laying straps on it)."""
    rings = [K.section_x(sec(x), x) for x in xs]
    bm = bmesh.new()
    K.bm_loft(bm, rings, cap_start=True, cap_end=False)
    bmesh.ops.remove_doubles(bm, verts=bm.verts[:], dist=2e-5)
    outward(bm)
    tree = BVHTree.FromBMesh(bm)
    P.mesh(name, bm, material, sharp=60.0, wn=False)
    return tree


def overcap(P, sec, d_back, d_front, dome, off=0.007, material='paint', bind='paint_b', name='flap',
            ts=(0.0, 0.2, 0.4, 0.58, 0.74, 0.86, 0.94, 1.0), end_deg=86.0):
    """
    A flap (or a lid) pulled over the top end of a pack: a shell `off` outside the sections sec(x) from its edge
    over the domed end, whose dome = (x_dome, x_apex) runs round from x_dome to the apex in plan (a quarter
    ellipse); the edge lies further down the front (d_front from the apex) than on the back panel (d_back), with
    a binding along it. The rings are spaced by arc length round the dome, so its closing is not creased.
    Returns the outer edge ring and the flap's BVH.
    """
    x_dome, x_apex = dome
    R = x_apex - x_dome
    n = len(sec(x_dome))

    def g(x):                       # x -> arc parameter (straight before the dome, round it after)
        return x if x <= x_dome else x_dome + R * math.asin(min(1.0, (x - x_dome) / R))

    def gi(sg):
        return sg if sg <= x_dome else x_dome + R * math.sin((sg - x_dome) / R)
    s_end = x_dome + R * math.radians(end_deg)

    def edge_x(k):
        zf = (math.sin(math.tau * k / n) + 1) / 2        # 0 = the front (floor), 1 = the back panel
        return x_apex - (d_front + (d_back - d_front) * zf)

    def ring(t, o):
        out = []
        for k in range(n):
            s0 = g(edge_x(k))
            x = gi(s0 + (s_end - s0) * t)
            pts = sec(x)
            nr = section_normals(pts)
            (y, z), (ny, nz) = pts[k], nr[k]
            oo = o * min(1.0, z / 0.02) if o > 0 else o          # tucked under where it meets the floor
            out.append((x, y + ny * oo, max(0.0, z + nz * oo)))
        return out
    # the inside (in the body) from near the end back to the edge, the outside out to the end, a sliver of a cap
    # just beyond the apex
    rings = [ring(t, -0.003) for t in (0.8, 0.0)] + [ring(t, off) for t in ts]
    zs = [z for (x, y, z) in rings[-1]]
    zm = (min(zs) + max(zs)) / 2
    rings.append([(x_apex + off * 0.9, y * 0.1, zm + (z - zm) * 0.86) for (x, y, z) in rings[-1]])
    bm = bmesh.new()
    K.bm_loft(bm, rings, cap_start=True, cap_end=True)
    outward(bm)
    tree = BVHTree.FromBMesh(bm)
    P.mesh(name, bm, material, sharp=60.0, wn=False)
    edge = [(x, y, max(z, 0.0044)) for (x, y, z) in ring(0.0, off * 0.85)]
    if bind:
        P.tube(name + '_binding', edge, 0.0042, bind, closed=True, segs=4, sharp=60.0)
    return edge, tree


def pack_old(P):
    """
    A small old daypack lying flat with its shoulder straps up: a soft body with a U-shaped top round which its
    side gusset runs, piping round the back panel, a top flap with a binding along its edge, the front pocket
    under it (a bulge with its zip along both sides), padded shoulder straps over the back panel with webbing
    and buckles down to the bottom corners, a reinforcing patch and the haul loop at the top.
    """
    P.ao_distance = 0.06
    L, W, T, rt = 0.38, 0.28, 0.14, 0.115
    xp0, xp1, zp = -L / 2 + 0.03, 0.06, 0.03            # the front pocket: its extent and the height of its zip

    def pocket(x):
        pk = min(1.0, max(0.0, (x - xp0) / 0.03), max(0.0, (xp1 - x) / 0.03))
        return pk * pk * (3 - 2 * pk)

    def sec(x):
        w, h, z0 = pack_dims(x, L, W, T, 0.03, rt)
        return pack_sec(w, h, z0, n=20, p=3.0, puff=0.012, bulge=0.009 * pocket(x))

    xs = [-L / 2 + 0.002, -L / 2 + 0.008, -L / 2 + 0.018, -L / 2 + 0.032, -0.12, -0.075, -0.03, 0.03]
    xs += [L / 2 - rt * (1 - math.cos(math.radians(a))) for a in (90, 70, 55, 42, 30, 20, 12, 5, 0)]
    tree = pack_body(P, sec, xs)
    piping(P, sec, [x for x in xs[2:] if x < L / 2 - 0.05], 3, 7)
    # the front pocket's zip along both sides, with its pull
    path = [(xp0 - 0.004, 0.006), (xp0 + 0.006, 0.022), (xp0 + 0.022, zp), (xp1 - 0.022, zp), (xp1 - 0.006, 0.022),
            (xp1 + 0.004, 0.006)]
    for sg in (-1, 1):
        P.tube('pocket_zip', lay_side(tree, densify2d(path, 0.02), sg, 0.0012), 0.0028, 'paint_b', segs=5,
               bend=0.0, sharp=60.0)
    pull = lay_side(tree, [(xp1 - 0.03, zp)], -1, 0.003)[0]
    P.box('zip_pull', (0.016, 0.004, 0.008), tuple(pull), 'trim', rot=(0, -12, 0), bev=0.0012, segs=1)
    # the top flap and its binding
    overcap(P, sec, 0.058, 0.11, (L / 2 - rt, L / 2), off=0.007, material='paint', bind='paint_b')
    # padded shoulder straps over the back panel, webbing on to the bottom corners through their buckles
    for sg in (-1, 1):
        top = [(L / 2 - 0.098, sg * 0.03), (L / 2 - 0.13, sg * 0.05), (0.03, sg * 0.074), (-0.04, sg * 0.084),
               (-0.105, sg * 0.082)]
        strap(P, lay(tree, densify2d(top, 0.03), 0.0062), 0.048, 0.011, 'paint_b', name='shoulder', bend=0.0)
        web = [(-0.112, sg * 0.082), (-0.15, sg * 0.092), (-L / 2 + 0.03, sg * 0.1), (-L / 2 + 0.008, sg * 0.1)]
        strap(P, lay(tree, densify2d(web, 0.012), 0.0022), 0.022, 0.0028, 'paint_b', name='webbing', bend=0.0)
        b = lay(tree, [(-0.128, sg * 0.087)], 0.004)[0]
        buckle(P, tuple(b), yaw=sg * 14, w=0.03, l=0.024, t=0.006)
    # the reinforcing patch where the straps are sewn, and the haul loop above it
    decal(P, bvh_surf(tree), ellipse_map(0.028, 0.05, L / 2 - 0.096, 0.0), nu=5, nv=5, lift=0.0016, name='patch')
    h0 = lay(tree, [(L / 2 - 0.074, 0.0)], 0.0)[0]
    P.torus('haul_loop', 0.014, 0.0034, loc=tuple(h0), axis='X', segs=8, rsegs=6, arc=math.pi, a0=math.pi / 2,
            caps=True, material='paint_b')
    P.views = [('a', 35, 32), ('b', 215, 30)]


def pack_std(P):
    """
    A canvas rucksack lying flat with its leather shoulder straps up: a round-shouldered sack on a leather base,
    gathered shut at the top by its drawstring (the cord and its lock showing at one side) under a big flap that
    two leather straps buckle down, a side pocket on each side with its own flap and strap.
    """
    P.ao_distance = 0.07
    L, W, T = 0.47, 0.32, 0.19
    x_base, x_gather = -L / 2 + 0.05, L / 2 - 0.1

    def dims(x):
        w, h = dome_dims(x, L, W, T, 0.04, 9.0, 10.0, taper_h=0.12)
        g = min(1.0, max(0.0, (x - x_gather) / 0.08))
        g = g * g * (3 - 2 * g)
        return w * (1 - 0.42 * g), h * (1 - 0.38 * g)

    def sec(x):
        w, h = dims(x)
        return pack_sec(w, h, 0.0, n=20, p=2.6, puff=0.016)

    xs = [-L / 2 + 0.002, -L / 2 + 0.01, -L / 2 + 0.022, -L / 2 + 0.04, x_base, -0.1, -0.02, 0.06, 0.11,
          x_gather + 0.02, x_gather + 0.045, x_gather + 0.07, L / 2 - 0.012, L / 2]
    rings = [K.section_x(sec(x), x) for x in xs]
    bm = bmesh.new()
    K.bm_loft(bm, rings, cap_start=True, cap_end=True)
    outward(bm)
    for f in bm.faces:
        f.material_index = 1 if f.calc_center_median().x < x_base - 0.001 else 0
    tree = BVHTree.FromBMesh(bm)
    P.mesh('sack', bm, ['paint', 'paint_b'], sharp=60.0, wn=False)
    # the big flap over the gathered top: a lid shape that does not gather, domed over the top end
    x_apex = L / 2 + 0.032

    def lid(x):
        w, h = dome_dims(x, L, W, T, 0.04, L / 2 - 0.035, x_apex, taper_h=0.12, end_h=0.5)
        return pack_sec(w, h, 0.0, n=20, p=2.6, puff=0.016)
    edge, ftree = overcap(P, lid, 0.12, 0.2, (L / 2 - 0.035, x_apex), off=0.008, material='paint', bind='paint_b')
    # its two buckle straps, from the back of the flap over the top and down the front to their buckles
    for sg in (-1, 1):
        y = sg * 0.085
        pts = lay_round(ftree, y, L / 2 - 0.075, T * 0.5, (92, 70, 48, 26, 6, -14, -30, -44), 0.0042)
        strap(P, pts, 0.026, 0.004, 'paint_b', name='flap_strap', bend=0.0)
        e = pts[-1]
        P.box('flap_buckle', (0.01, 0.032, 0.024), (e.x + 0.003, y, max(e.z, 0.016)), 'steel', rot=(0, 25, 0),
              bev=0.002, segs=1)
    # the drawstring's cord and its lock hanging out from under the flap at the left
    P.tube('cord', [(L / 2 - 0.07, 0.11, 0.12), (L / 2 - 0.12, 0.158, 0.1), (L / 2 - 0.145, 0.176, 0.06),
                    (L / 2 - 0.15, 0.178, 0.035)], 0.0028, 'trim', segs=6, bend=0.0)
    P.cyl('cord_lock', 0.0075, 0.02, (L / 2 - 0.151, 0.178, 0.024), 'trim', segs=8, bev=None)
    # a side pocket on each side, its flap over its top end and a strap down it
    xp = -0.075
    for sg in (-1, 1):
        yc = sg * (W / 2 + 0.016)
        P.pillow('pocket', (0.17, 0.05, 0.13), (xp, yc, 0.07), 'paint', r=0.014, sub=0)
        P.pillow('pocket_flap', (0.06, 0.058, 0.142), (xp + 0.065, yc + sg * 0.003, 0.073), 'paint', r=0.008, sub=0)
        P.box('pocket_strap', (0.075, 0.004, 0.022), (xp + 0.03, yc + sg * 0.0275, 0.073), 'paint_b', bev=0.0012,
              segs=1)
        P.box('pocket_buckle', (0.012, 0.006, 0.026), (xp - 0.004, yc + sg * 0.0285, 0.073), 'steel', bev=0.0015,
              segs=1)
    # the leather shoulder straps, their buckles and the narrower straps on to the bottom corners
    for sg in (-1, 1):
        top = [(L / 2 - 0.135, sg * 0.04), (L / 2 - 0.17, sg * 0.062), (0.0, sg * 0.092), (-0.085, sg * 0.105),
               (-0.12, sg * 0.105)]
        strap(P, lay(tree, densify2d(top, 0.03), 0.0045), 0.05, 0.007, 'paint_b', name='shoulder', bend=0.0)
        web = [(-0.13, sg * 0.105), (-0.17, sg * 0.115), (-L / 2 + 0.035, sg * 0.125), (-L / 2 + 0.01, sg * 0.125)]
        strap(P, lay(tree, densify2d(web, 0.015), 0.0024), 0.026, 0.004, 'paint_b', name='strap_low', bend=0.0)
        b = lay(tree, [(-0.13, sg * 0.105)], 0.005)[0]
        P.box('shoulder_buckle', (0.016, 0.054, 0.008), tuple(b), 'steel', rot=(0, 0, sg * 6), bev=0.002, segs=1)
    decal(P, bvh_surf(tree), ellipse_map(0.034, 0.06, L / 2 - 0.13, 0.0), nu=5, nv=5, lift=0.0016, name='yoke')
    P.views = [('a', 35, 32), ('b', 215, 30)]


def pack_hike(P):
    """
    A framed hiking pack lying flat with its harness up: the tall bag under a floating lid, an aluminium frame
    over the back panel (two rails, two cross bars, a back band), padded shoulder straps with a sternum strap,
    the padded hip belt draped out to both sides, compression straps down both sides and a sleeping mat rolled
    up and strapped across its top.
    """
    P.ao_distance = 0.08
    L, W, T = 0.53, 0.34, 0.23
    x_apex = L / 2 + 0.03

    def sec(x):
        w, h = dome_dims(x, L, W, T, 0.05, L / 2 - 0.06, L / 2 + 0.004, taper_w=0.1, taper_h=0.2, end_h=0.7)
        return pack_sec(w, h, 0.0, n=20, p=3.0, puff=0.014)

    xs = [-L / 2 + 0.002, -L / 2 + 0.012, -L / 2 + 0.028, -L / 2 + 0.05, -0.12, -0.02, 0.08, 0.15, L / 2 - 0.06,
          L / 2 - 0.035, L / 2 - 0.016, L / 2 - 0.004]
    tree = pack_body(P, sec, xs + [L / 2 + 0.004])

    # the floating lid over the top, its zip round it
    def lid(x):
        w, h = dome_dims(x, L, W, T, 0.05, L / 2 - 0.04, x_apex, taper_w=0.1, taper_h=0.2, end_h=0.62)
        return pack_sec(w + 0.012, h + 0.01, 0.0, n=20, p=3.0, puff=0.02)
    overcap(P, lid, 0.1, 0.13, (L / 2 - 0.04, x_apex), off=0.008, material='paint', bind='paint_b')
    # the frame over the back panel: two rails standing off it, the cross bars, the back band
    zt = T * 0.86 + 0.016                     # about the height of the back panel
    rails = []
    for sg in (-1, 1):
        y = sg * (W / 2 - 0.045)
        pts = lay(tree, densify2d([(-L / 2 + 0.06, y), (L / 2 - 0.11, y)], 0.12), 0.02)
        p0 = lay(tree, [(-L / 2 + 0.035, y)], 0.004)[0]
        p1 = lay(tree, [(L / 2 - 0.085, y)], 0.004)[0]
        path = [p0] + pts + [p1]
        P.tube('rail', path, 0.0085, 'alu', segs=8, bend=0.0)
        rails.append(pts)
    for i in (0, -1):
        P.tube('cross_bar', [rails[0][i], rails[1][i]], 0.0075, 'alu', segs=8, bend=0.0)
    mid = len(rails[0]) // 2
    strap(P, [rails[0][mid] + V((0, 0.006, 0.0)), rails[1][mid] + V((0, -0.006, 0.0))], 0.075, 0.005, 'paint_b',
          name='back_band', bend=0.0)
    # padded shoulder straps over the frame, webbing to the bottom of the frame, a sternum strap across
    for sg in (-1, 1):
        top = [(L / 2 - 0.085, sg * 0.05), (L / 2 - 0.13, sg * 0.072), (0.04, sg * 0.1), (-0.06, sg * 0.112),
               (-0.11, sg * 0.112)]
        pts = lay(tree, densify2d(top, 0.05), 0.03)
        strap(P, pts, 0.058, 0.015, 'paint_b', name='shoulder', bend=0.0)
        web = lay(tree, densify2d([(-0.12, sg * 0.112), (-L / 2 + 0.07, sg * 0.125)], 0.03), 0.024)
        strap(P, web, 0.024, 0.003, 'paint_b', name='webbing', bend=0.0)
        buckle(P, tuple(lay(tree, [(-0.13, sg * 0.113)], 0.03)[0]), yaw=sg * 8, w=0.032, l=0.026, t=0.007)
    st = lay(tree, [(0.075, -0.098), (0.075, 0.098)], 0.04)
    strap(P, st, 0.018, 0.003, 'paint_b', name='sternum', bend=0.0)
    buckle(P, ((st[0].x + st[1].x) / 2, 0.0, st[0].z + 0.002), yaw=90, w=0.022, l=0.026, t=0.006)
    # the hip belt: two padded wings from the bottom of the frame out over the sides and down to the floor
    xh = -L / 2 + 0.075
    for sg in (-1, 1):
        a = lay(tree, [(xh, sg * 0.06), (xh, sg * 0.125)], 0.028)
        d = lay_side(tree, [(xh + 0.003, T * 0.74), (xh + 0.006, T * 0.44), (xh + 0.009, T * 0.16)], sg, 0.013)
        path = a + d + [V((xh + 0.011, sg * (W / 2 + 0.04), 0.012))]
        strap(P, path, 0.085, 0.018, 'paint_b', name='hip_wing', bend=0.0, radius_fn=lambda u: 1.0 - 0.3 * u)
    P.box('hip_buckle', (0.034, 0.008, 0.036), (xh + 0.011, -(W / 2 + 0.05), 0.02), 'trim', bev=0.002, segs=1)
    # compression straps down both sides, each through its buckle
    for sg in (-1, 1):
        for xc in (-0.1, 0.11):
            pts = lay_side(tree, [(xc, 0.016), (xc, T * 0.4), (xc, T * 0.78)], sg, 0.0022)
            # (a path going up: the sweep's normal lies along X, so the profile is given width first)
            P.tube('compression', pts, 1.0, 'paint_b', profile=K.rounded_rect(0.022, 0.003, 0.0013, seg=1), bend=0.0,
                   sharp=50.0)
            b = lay_side(tree, [(xc, T * 0.45)], sg, 0.004)[0]
            P.box('compression_buckle', (0.03, 0.007, 0.026), tuple(b), 'trim', bev=None)
    # the sleeping mat rolled up across the top, its two straps round it
    xm, rm, hl = x_apex + 0.052, 0.055, 0.18
    zm = rm + 0.0045
    prof = [(0.0, -hl + 0.003), (0.03, -hl + 0.003), (0.033, -hl + 0.007), (0.036, -hl), (rm, -hl + 0.004),
            (rm, hl - 0.004), (0.036, hl), (0.033, hl - 0.007), (0.03, hl - 0.003), (0.0, hl - 0.003)]
    P.lathe('mat', prof, loc=(xm, 0, zm), material='paint_b', axis='Y', segs=14, sharp=50.0)
    for yy in (-0.11, 0.11):
        P.lathe('mat_strap', [(rm - 0.001, yy - 0.012), (rm + 0.0035, yy - 0.012), (rm + 0.0035, yy + 0.012),
                              (rm - 0.001, yy + 0.012)], loc=(xm, 0, zm), material='trim', axis='Y', segs=12,
                loop=True, sharp=50.0)
        P.box('mat_buckle', (0.026, 0.03, 0.008), (xm, yy, zm + rm + 0.005), 'alu', bev=0.002, segs=1)
    P.views = [('a', 35, 32), ('b', 215, 30)]


# ------------------------------------------------------------------------------------------------ boxes of components

def carton(P, L, W, H, t=0.004, flaps=(130, 150, 115, 160), material='paint', tape=None, name='carton'):
    """
    An open cardboard box: walls t thick (the box less its inside), the four flaps (each half the box's width
    long) folded out about the top edges at the given angles, in the order +X, +Y, -X, -Y (degrees from standing
    straight up: 90 = level, 180 = hanging down against the wall). tape: the material of the packing tape left on
    both ends after the box was cut open.
    """
    bm = bmesh.new()
    K.bm_cube(bm, (L, W, H), mat4((0, 0, H / 2)))
    loops(bm, 0, [L * f for f in (-0.3, 0.0, 0.3)])
    loops(bm, 1, [W * f for f in (-0.25, 0.25)])
    loops(bm, 2, (H * 0.45,))
    box = P.mesh(name, bm, material, bev=0.0015, segs=1)
    cut = bmesh.new()
    K.bm_cube(cut, (L - 2 * t, W - 2 * t, H), mat4((0, 0, t + H / 2)))
    P.cut(box, cut)
    fl = W / 2
    for i, a in enumerate(flaps):
        if a is None:
            continue
        ar = math.radians(a)
        if i % 2 == 0:                                   # on the end walls (+X, -X), hinged along Y
            sx = 1 if i == 0 else -1
            hinge = V((sx * L / 2, 0, H))
            d = V((sx * math.sin(ar), 0, math.cos(ar)))
            m = V((sx * math.cos(ar), 0, -math.sin(ar)))
            P.box('flap', (t * 0.9, W - 0.006, fl), tuple(hinge + d * (fl / 2) - m * (t / 2)), material,
                  rot=(0, sx * a, 0), bev=0.0012, segs=1)
        else:                                            # on the side walls (+Y, -Y), hinged along X
            sy = 1 if i == 1 else -1
            hinge = V((0, sy * W / 2, H))
            d = V((0, sy * math.sin(ar), math.cos(ar)))
            m = V((0, sy * math.cos(ar), -math.sin(ar)))
            P.box('flap', (L - 0.006, t * 0.9, fl), tuple(hinge + d * (fl / 2) - m * (t / 2)), material,
                  rot=(-sy * a, 0, 0), bev=0.0012, segs=1)
    if tape:
        for sx in (-1, 1):
            P.box('tape', (0.0008, 0.05, 0.075), (sx * (L / 2 + 0.0004), 0, H - 0.0375), tape, bev=None)
    return box


def heap(P, L, W, z_edge, peak, material, k0=0, nx=14, ny=10, lumps=10, rough=0.004, sharp=28.0, mottle=None):
    """
    A heap of small things filling an open box (inside L x W): a lumpy surface z_edge high along the walls,
    rising to peak above that in the middle, broken into facets (a pile of bits). Returns its BVH, for putting
    the things that show on it.
    """
    blobs = [((jit(k0 + i, 1.0)) * L * 0.85, (jit(k0 + i, 2.0)) * W * 0.85, 0.01 + 0.012 * (jit(k0 + i, 3.0) + 0.5),
              0.022 + 0.022 * (jit(k0 + i, 4.0) + 0.5)) for i in range(lumps)]

    def zf(x, y):
        u, v = 2 * x / L, 2 * y / W
        z = z_edge + peak * max(0.0, 1 - u * u) ** 0.7 * max(0.0, 1 - v * v) ** 0.7
        for (bx, by, bh, br) in blobs:
            z += bh * math.exp(-((x - bx) ** 2 + (y - by) ** 2) / (br * br)) * min(1.0, 4 * (1 - abs(u))) * \
                min(1.0, 4 * (1 - abs(v)))
        return z
    bm = bmesh.new()
    vs = {}
    for i in range(nx):
        for j in range(ny):
            x = -L / 2 + L * i / (nx - 1)
            y = -W / 2 + W * j / (ny - 1)
            edge = i in (0, nx - 1) or j in (0, ny - 1)
            z = zf(x, y) + (0.0 if edge else rough * 2 * jit(k0 * 7 + i * 31 + j, 5.0))
            vs[i, j] = bm.verts.new((x, y, z))
    for i in range(nx - 1):
        for j in range(ny - 1):
            f = bm.faces.new((vs[i, j], vs[i + 1, j], vs[i + 1, j + 1], vs[i, j + 1]))
            if mottle and jit(k0 * 13 + i * 17 + j * 5, 9.0) + 0.5 < mottle[1]:
                f.material_index = 1
    bm.normal_update()
    tree = BVHTree.FromBMesh(bm)
    P.mesh('heap', bm, [material, mottle[0]] if mottle else material, sharp=sharp, wn=False)
    return tree


# small parts, built lying on the XY plane at the origin (z up = away from what they lie on)

def bm_bolt(bm, m, r=0.0042, length=0.036, head=0.0085):
    """A hex bolt lying on its side along X: the shank and the hex head."""
    K.bm_cyl(bm, r, length, segs=8, matrix=m @ Matrix.Translation((0.004, 0, head * 0.85)) @ K.axis_matrix('X'))
    K.bm_hex(bm, head, 0.0058, matrix=m @ Matrix.Translation((-length / 2 + 0.004, 0, head * 0.85)) @
             K.axis_matrix('-X'))


def bm_nut(bm, m, r=0.0088, hole=0.0042, h=0.0065):
    """A hex nut lying flat: a hexagonal ring."""
    outer = [(r * math.cos(math.tau * i / 6), r * math.sin(math.tau * i / 6)) for i in range(6)]
    inner = [(hole * math.cos(math.tau * i / 6), hole * math.sin(math.tau * i / 6)) for i in range(6)]
    rings = [[(x, y, 0.0) for (x, y) in outer], [(x * 0.92, y * 0.92, h) for (x, y) in outer],
             [(x, y, h) for (x, y) in inner], [(x, y, 0.0) for (x, y) in inner]]
    vr, faces = K.bm_loft(bm, [[m @ V(p) for p in ring] for ring in rings + [rings[0]]])
    return faces


def bm_washer(bm, m, r=0.0095, hole=0.0045, h=0.002, segs=8):
    """A flat washer."""
    rings = [[(rr * math.cos(math.tau * i / segs), rr * math.sin(math.tau * i / segs), z) for i in range(segs)]
             for (rr, z) in ((r, 0.0), (r, h), (hole, h), (hole, 0.0))]
    vr, faces = K.bm_loft(bm, [[m @ V(p) for p in ring] for ring in rings + [rings[0]]])
    return faces


def bm_spring(bm, m, R=0.01, wire=0.0024, turns=3.0, pitch=0.01, steps=7):
    """A coil spring lying on its side along X."""
    n = int(turns * steps)
    path = [m @ V((-turns * pitch / 2 + pitch * i / steps, R * math.cos(math.tau * i / steps),
                   R + wire + R * math.sin(math.tau * i / steps))) for i in range(n + 1)]
    K.bm_sweep(bm, path, wire, segs=5, caps=True, max_seg=0)


def bm_gear(bm, m, r=0.022, root=0.0178, bore=0.006, h=0.0065, teeth=12):
    """A small spur gear lying flat: the teeth as windows of a polar disc."""
    rings = [(bore, h, 0.0), (root - 0.004, h, 0.0), (root, h, 0.0), (r, h * 0.92, 0.0)]

    def stations(k):
        return [math.tau * j / (2 * teeth) for j in range(2 * teeth)]

    def hole(k, j):
        return k == 2 and j % 2 == 1
    K.bm_polar(bm, rings, stations, hole=hole, matrix=m)


def scatter(tree, spots, sink=0.0015):
    """Frames lying on a surface: spots = [(x, y, spin, tilt)] -> matrices (z = the surface's normal, a little
    sunk into it, turned by spin and tipped by tilt degrees)."""
    out = []
    for (x, y, spin, tilt) in spots:
        hit, nrm, _, _ = tree.ray_cast(V((x, y, 1.0)), V((0, 0, -1)), 2.0)
        if hit is None:
            continue
        n = (nrm + V((0, 0, 1))).normalized()
        out.append(Matrix.Translation(hit - n * sink) @ K.frame_from_z(n) @ mat4(rot=(tilt, 0, spin)))
    return out


def bm_bracket(bm, m, a=0.05, b=0.032, w=0.026, t=0.004):
    """A small angle bracket lying on one leg: an L of plate."""
    poly = [(0.0, 0.0), (a, 0.0), (a, t), (t, t), (t, b), (0.0, b)]
    K.bm_prism(bm, poly, w, matrix=m @ Matrix.Translation((-a / 2, 0, 0)) @ mat4(rot=(90, 0, 0)))


def bits(P, tree, spots, kinds, k0=0, scale=1.0):
    """Small parts dropped on a heap: kinds[k % len(kinds)] picks the part for spot k."""
    steel, alu = bmesh.new(), bmesh.new()
    for k, mm in enumerate(scatter(tree, spots, sink=0.003 * scale)):
        kind = kinds[k % len(kinds)]
        mm = mm @ Matrix.Scale(scale, 4)
        j = jit(k0 + k, 15.0) + 0.5
        if kind == 'bolt':
            bm_bolt(steel, mm, r=0.0048, length=0.042 + 0.02 * j, head=0.0105)
        elif kind == 'nut':
            bm_nut(steel, mm, r=0.0105 + 0.003 * j, hole=0.0052, h=0.0075)
        elif kind == 'washer':
            bm_washer(alu if k % 3 == 0 else steel, mm, r=0.012 + 0.003 * j, hole=0.0055, h=0.0022)
        elif kind == 'spring':
            bm_spring(steel, mm, R=0.012, wire=0.003, turns=3.0, pitch=0.012)
        elif kind == 'gear':
            bm_gear(alu, mm, r=0.03, root=0.025, bore=0.007, h=0.008, teeth=12)
        elif kind == 'bracket':
            bm_bracket(alu if k % 2 else steel, mm)
    for bm, mat in ((steel, 'steel'), (alu, 'alu')):
        if bm.faces:
            bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
            P.mesh('bits', bm, mat, sharp=45.0)
        else:
            bm.free()


def crate_parts(P):
    """
    A box of old components for the recycler: an open cardboard box, its flaps folded out, the packing tape cut
    through on both ends, heaped above its rim with bolts, nuts, washers, a spring, a small gear and brackets.
    """
    P.ao_distance = 0.05
    L, W, H, t = 0.40, 0.30, 0.25, 0.004
    carton(P, L, W, H, t, flaps=(108, 118, 138, 128), material='paint', tape='paint_b')
    tree = heap(P, L - 2 * t - 0.002, W - 2 * t - 0.002, H - 0.012, 0.055, 'rust', k0=3, nx=16, ny=12, lumps=22,
                rough=0.007, sharp=22.0, mottle=('steel', 0.22))
    spots = []
    for k in range(28):
        x = jit(k, 11.0) * (L - 0.08)
        y = jit(k, 12.0) * (W - 0.07)
        spots.append((x, y, 360 * jit(k, 13.0), 40 * jit(k, 14.0)))
    spots += [(0.05, -0.04, 30, 10), (-0.08, 0.03, 0, 12), (0.1, 0.06, 70, -20), (-0.12, -0.06, 200, 25)]
    kinds = ['bolt', 'nut', 'washer', 'bolt', 'washer', 'nut'] * 4 + ['bolt', 'nut', 'washer', 'nut']
    kinds += ['spring', 'gear', 'bracket', 'bracket']
    bits(P, tree, spots, kinds)
    P.views = [('a', 35, 38), ('b', 215, 38)]


def heavy_disc(bm, m, R=0.125, hat=0.064, bore=0.03, th=0.02, hh=0.042, segs=18):
    """A brake disc lying flat: the friction ring and its hat with the centre bore."""
    prof = [(bore, hh), (hat - 0.004, hh), (hat, hh - 0.004), (hat, th), (R - 0.003, th), (R, th - 0.003),
            (R, 0.003), (R - 0.003, 0.0), (hat + 0.006, 0.0), (hat - 0.006, th * 0.6), (bore, th * 0.6)]
    K.bm_lathe(bm, prof, segs=segs, matrix=m, loop=True)


def heavy_flywheel(bm, m, R=0.14, th=0.028, teeth=22):
    """A flywheel lying flat: the heavy disc, its ring gear (teeth all round) and the crank flange."""
    prof = [(0.03, th + 0.012), (0.05, th + 0.012), (0.054, th), (R - 0.016, th), (R - 0.012, th - 0.004),
            (R - 0.012, 0.004), (R - 0.016, 0.0), (0.03, 0.0)]
    K.bm_lathe(bm, prof, segs=24, matrix=m, loop=True)
    ring = [(R - 0.013, th * 0.75), (R, th * 0.75), (R, 0.004), (R - 0.013, 0.004)]
    rings = K.bm_lathe(bm, ring, segs=2 * teeth, matrix=m, loop=True)
    mi = m.inverted()
    k = (R - 0.007) / R
    for rg in (rings[1], rings[2]):
        for i, v in enumerate(rg):
            if i % 2:
                c = mi @ v.co
                v.co = m @ V((c.x * k, c.y * k, c.z))


def crate_parts_heavy(P):
    """
    A heavy box of components: a wooden crate of planks nailed to corner posts, rope handles at the ends, a
    stencilled panel on its side, heaped with heavy bits: a brake disc, a flywheel, angle brackets and bolts.
    """
    P.ao_distance = 0.08
    L, W, H = 0.60, 0.40, 0.35
    tp, ph, gap = 0.02, 0.1, 0.014
    for sx in (-1, 1):
        for sy in (-1, 1):
            P.box('post', (0.045, 0.045, H - 0.02), (sx * (L / 2 - 0.0425), sy * (W / 2 - 0.0425), H / 2 + 0.01),
                  'wood', bev=0.004, segs=1)
    for k in range(3):
        z = 0.03 + k * (ph + gap) + ph / 2
        for sg in (-1, 1):
            P.box('plank', (L, tp, ph), (0.0, sg * (W / 2 - tp / 2), z), 'wood', bev=0.004, segs=1,
                  rot=(0, 0.5 * (k - 1) * sg, 0))
            P.box('plank', (tp, W - 2 * tp, ph), (sg * (L / 2 - tp / 2), 0.0, z), 'wood', bev=0.004, segs=1,
                  rot=(0.5 * (1 - k) * sg, 0, 0))
    P.box('base', (L - 0.01, W - 0.01, 0.022), (0.0, 0.0, 0.011), 'wood', bev=0.003, segs=1)
    bm = bmesh.new()
    for sx in (-1, 1):
        for sy in (-1, 1):
            for k in range(3):
                z = 0.03 + k * (ph + gap) + ph / 2
                K.bm_cube(bm, (0.006, 0.002, 0.006),
                          Matrix.Translation((sx * (L / 2 - 0.022), sy * (W / 2 + 0.001), z)))
    P.mesh('nails', bm, 'steel', sharp=60.0)
    # the stencilled panel on the front (-Y) and the rope handles at the ends
    P.box('stencil', (0.26, 0.0016, 0.072), (0.02, -(W / 2 + 0.0008), 0.03 + (ph + gap) + ph / 2), 'paint', bev=None)
    P.box('stencil', (0.15, 0.0016, 0.03), (-0.035, -(W / 2 + 0.0008), 0.03 + ph / 2 + 0.012), 'paint', bev=None)
    P.box('stencil', (0.05, 0.0016, 0.03), (0.105, -(W / 2 + 0.0008), 0.03 + ph / 2 + 0.012), 'paint', bev=None)
    for sx in (-1, 1):
        P.torus('rope', 0.045, 0.0085, loc=(sx * (L / 2 + 0.012), 0.0, 0.255), axis='X', segs=10, rsegs=5,
                material='fabric', arc=math.pi, a0=math.pi)
    # the heap and the heavy bits on it
    tree = heap(P, L - 2 * tp - 0.004, W - 2 * tp - 0.004, H - 0.03, 0.06, 'rust', k0=11, nx=13, ny=9, lumps=14,
                rough=0.008, sharp=22.0, mottle=('steel', 0.18))
    steel = bmesh.new()
    mm = scatter(tree, [(-0.12, 0.03, 20, 18)], sink=0.004)[0]
    heavy_disc(steel, mm)
    mm = scatter(tree, [(0.13, -0.02, 0, -14)], sink=0.008)[0]
    heavy_flywheel(steel, mm)
    for k, (x, y, sp, tl) in enumerate(((0.02, 0.1, 30, 20), (0.21, 0.1, -60, 10), (-0.2, -0.1, 80, -25),
                                         (0.0, -0.11, 140, 15))):
        mm = scatter(tree, [(x, y, sp, tl)], sink=0.003)[0]
        bm_bracket(steel, mm, a=0.11, b=0.07, w=0.05, t=0.007)
    for k, (x, y, sp, tl) in enumerate(((-0.02, -0.02, 70, 20), (0.08, 0.13, 10, -10), (-0.23, 0.11, 120, 15))):
        mm = scatter(tree, [(x, y, sp, tl)], sink=0.004)[0]
        bm_bolt(steel, mm @ Matrix.Scale(2.0, 4), r=0.0045, length=0.04, head=0.0095)
    bmesh.ops.recalc_face_normals(steel, faces=steel.faces[:])
    P.mesh('heavy_bits', steel, 'steel', sharp=45.0)
    P.views = [('a', 35, 36), ('b', 215, 36)]


def crate_junk(P):
    """
    A box of junk: an open cardboard box, its flaps every which way, overflowing with odds and ends: a coil of
    cable, a mug lying on its side, a desk lamp's neck and shade sticking out, a tin, an old book, and a rag hung
    over the rim.
    """
    P.ao_distance = 0.06
    L, W, H, t = 0.45, 0.35, 0.30, 0.004
    carton(P, L, W, H, t, flaps=(104, 132, 78, 168), material='paint', tape='paint_b')
    tree = heap(P, L - 2 * t - 0.002, W - 2 * t - 0.002, H - 0.012, 0.075, 'plastic_int', k0=21, nx=12, ny=9,
                lumps=12, rough=0.007, sharp=24.0)
    # a coil of cable lying on the heap
    mm = scatter(tree, [(-0.075, 0.05, 0, 12)], sink=0.004)[0]
    path = []
    for i in range(29):
        a = math.tau * 2.4 * i / 28
        rr = 0.068 - 0.01 * i / 28
        path.append(mm @ V((rr * math.cos(a), rr * math.sin(a), 0.006 + 0.004 * math.sin(a * 0.5))))
    bm = bmesh.new()
    K.bm_sweep(bm, path, 0.0068, segs=5, caps=True, max_seg=0)
    P.mesh('cable', bm, 'ceramic', sharp=60.0)
    # a mug lying on its side
    mm = scatter(tree, [(0.11, 0.07, 35, 0)], sink=0.002)[0] @ Matrix.Translation((0, 0, 0.041)) @ mat4(rot=(0, 90, 0))
    bm = bmesh.new()
    prof = [(0.0, 0.0), (0.036, 0.0), (0.041, 0.006), (0.041, 0.092), (0.037, 0.096), (0.034, 0.093), (0.034, 0.012),
            (0.0, 0.012)]
    K.bm_lathe(bm, prof, segs=16, matrix=mm @ Matrix.Translation((0, 0, -0.048)))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    P.mesh('mug', bm, 'ceramic', sharp=50.0)
    hp = [mm @ V(p) for p in ((0.04, 0.0, 0.02), (0.068, 0.0, 0.016), (0.068, 0.0, -0.022), (0.04, 0.0, -0.028))]
    P.tube('mug_handle', hp, 0.0055, 'ceramic', segs=6, bend=0.012)
    # a desk lamp: its jointed neck rising out of the junk, the shade on the end
    j0, j1, j2 = V((0.02, -0.04, H + 0.02)), V((-0.02, -0.07, H + 0.15)), V((0.075, -0.085, H + 0.2))
    P.tube('lamp_arm', [j0, j1], 0.0068, 'alu', segs=8, bend=0.0)
    P.tube('lamp_arm', [j1, j2], 0.0068, 'alu', segs=8, bend=0.0)
    P.sphere('lamp_joint', 0.012, tuple(j1), 'paint_b', u=10, v=6)
    d = (j2 - j1).normalized()
    sh = Matrix.Translation(j2) @ K.frame_from_z(d.lerp(V((0, 0, -1)), 0.6).normalized())
    bm = bmesh.new()
    K.bm_lathe(bm, K.shell_profile([(0.012, 0.0), (0.022, 0.012), (0.045, 0.05), (0.058, 0.062)], 0.0025), segs=16,
               matrix=sh, loop=True)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    P.mesh('lamp_shade', bm, 'paint_b', sharp=50.0)
    # a tin and an old book on the heap
    mm = scatter(tree, [(-0.13, -0.08, 0, 70)], sink=0.004)[0]
    bm = bmesh.new()
    K.bm_cyl(bm, 0.037, 0.1, segs=12, matrix=mm @ Matrix.Translation((0, 0, 0.037)) @ K.axis_matrix('X'))
    P.mesh('tin', bm, 'steel', bev=0.0025, segs=1, sharp=40.0)
    mm = scatter(tree, [(0.07, -0.05, 25, -8)], sink=0.004)[0]
    bm = bmesh.new()
    K.bm_cube(bm, (0.142, 0.104, 0.022), mm @ Matrix.Translation((0.002, 0, 0.015)))
    P.mesh('book_pages', bm, 'ceramic', bev=0.0015, segs=1)
    bm = bmesh.new()
    for dz in (0.002, 0.028):
        K.bm_cube(bm, (0.15, 0.11, 0.004), mm @ Matrix.Translation((0, 0, dz)))
    K.bm_cube(bm, (0.006, 0.11, 0.03), mm @ Matrix.Translation((-0.072, 0, 0.015)))
    P.mesh('book', bm, 'paint_b', bev=0.0015, segs=1)
    # a rag hung over the side (+Y wall): from the heap over the rim and down the outside, in folds
    prof = []
    for i in range(9):
        u = -1 + 2 * i / 8
        prof.append((0.0026 + 0.006 * math.sin(u * 3.1 * math.pi), u * 0.065))
    for i in range(8, -1, -1):
        u = -1 + 2 * i / 8
        prof.append((-0.0026 + 0.006 * math.sin(u * 3.1 * math.pi), u * 0.065))
    rag = [V((-0.09, -W / 2 + 0.08, H + 0.04)), V((-0.095, -W / 2 + 0.025, H + 0.02)),
           V((-0.098, -W / 2 - 0.01, H + 0.004)), V((-0.1, -W / 2 - 0.014, H - 0.05)),
           V((-0.096, -W / 2 - 0.013, H - 0.12))]
    P.tube('rag', rag, 1.0, 'fabric', profile=prof, bend=0.02, sharp=55.0, radius_fn=lambda u: 1.0 + 0.25 * u)
    # a bottle lying across the heap and a small box tipped on it
    mm = scatter(tree, [(0.14, -0.06, 120, 0)], sink=0.003)[0] @ Matrix.Translation((0, 0, 0.032)) @ \
        mat4(rot=(0, 90, 0))
    bm = bmesh.new()
    K.bm_lathe(bm, [(0.0, -0.09), (0.03, -0.09), (0.032, -0.085), (0.032, 0.03), (0.016, 0.06), (0.012, 0.09),
                    (0.0, 0.09)], segs=12, matrix=mm)
    P.mesh('bottle', bm, 'glass', sharp=50.0, wn=False)
    mm = scatter(tree, [(-0.02, 0.1, 30, 25)], sink=0.004)[0]
    bm = bmesh.new()
    K.bm_cube(bm, (0.1, 0.07, 0.06), mm @ Matrix.Translation((0, 0, 0.03)))
    P.mesh('small_box', bm, 'paint', bev=0.003, segs=1)
    P.views = [('a', 35, 36), ('b', 215, 36)]


def chem_bottle(bm_glass, bm_cap, x, y, z0, r=0.038, h=0.27, segs=14):
    """A round chemical bottle standing at (x, y, z0): glass, a screw cap."""
    prof = [(0.0, 0.0), (r - 0.004, 0.0), (r, 0.005), (r, h * 0.7), (r * 0.82, h * 0.8), (0.016, h * 0.88),
            (0.0145, h * 0.9), (0.0, h * 0.9)]
    K.bm_lathe(bm_glass, prof, segs=segs, matrix=Matrix.Translation((x, y, z0)))
    cap = [(0.0, h * 0.9 - 0.004), (0.0175, h * 0.9 - 0.004), (0.0175, h - 0.002), (0.0155, h), (0.0, h)]
    K.bm_lathe(bm_cap, cap, segs=segs, matrix=Matrix.Translation((x, y, z0)))


def chem_jug(P, x, y, z0, w=0.095, d=0.11, h=0.25, yaw=0.0):
    """A chemical jug standing at (x, y, z0): a rounded glass block, its handle at the back of the top, the neck
    and cap at the front."""
    m = Matrix.Translation((x, y, z0)) @ mat4(rot=(0, 0, yaw))
    bm = bmesh.new()
    K.bm_cube(bm, (d, w, h * 0.86), Matrix.Translation((0, 0, h * 0.43)))
    for v in bm.verts:
        if v.co.z > h * 0.6:
            v.co.x *= 0.9
            v.co.y *= 0.92
    K.bm_transform(bm, m)
    P.mesh('jug', bm, 'glass', bev=0.014, segs=2)
    P.tube('jug_handle', [m @ V(p) for p in ((-0.028, 0.0, h * 0.84), (-0.024, 0.0, h * 0.96), (0.0, 0.0, h * 0.96),
                                             (0.004, 0.0, h * 0.84))], 0.009, 'glass', segs=8, bend=0.012)
    bm = bmesh.new()
    K.bm_cyl(bm, 0.017, 0.03, segs=12, matrix=m @ Matrix.Translation((0.026, 0.0, h * 0.87)))
    P.mesh('jug_neck', bm, 'glass', sharp=40.0)
    bm = bmesh.new()
    K.bm_cyl(bm, 0.02, 0.024, segs=12, matrix=m @ Matrix.Translation((0.026, 0.0, h - 0.012)))
    P.mesh('jug_cap', bm, 'paint_b', bev=0.002, segs=1, sharp=40.0)


def crate_chem(P):
    """
    A box of chemicals: an open cardboard box with a card divider making six cells, a bottle or a jug standing in
    each (glass, their caps coloured), a coloured label band round the outside.
    """
    P.ao_distance = 0.06
    L, W, H, t = 0.40, 0.30, 0.25, 0.004
    carton(P, L, W, H, t, flaps=(118, 135, 110, 150), material='paint', tape=None)
    hd = H - 0.035
    P.box('divider', (L - 2 * t, 0.003, hd), (0, 0, t + hd / 2), 'paint', bev=None)
    for x in (-0.064, 0.064):
        P.box('divider', (0.003, W - 2 * t, hd), (x, 0, t + hd / 2), 'paint', bev=None)
    glass, caps = bmesh.new(), bmesh.new()
    cells = [(-0.128, -0.073), (0.0, -0.073), (0.128, -0.073), (-0.128, 0.073), (0.0, 0.073), (0.128, 0.073)]
    for i, (x, y) in enumerate(cells):
        if i in (1, 5):
            chem_jug(P, x, y, t, yaw=90.0 if i == 1 else -90.0)
        else:
            chem_bottle(glass, caps, x, y, t, h=0.27 if i % 2 == 0 else 0.255)
    bmesh.ops.recalc_face_normals(glass, faces=glass.faces[:])
    bmesh.ops.recalc_face_normals(caps, faces=caps.faces[:])
    P.mesh('bottles', glass, 'glass', sharp=45.0, wn=False)
    P.mesh('caps', caps, 'paint_b', sharp=45.0)
    # the label band round the outside
    zb, hb = 0.068, 0.06
    for sg in (-1, 1):
        P.box('band', (L + 0.0012, 0.0008, hb), (0, sg * (W / 2 + 0.0004), zb), 'paint_b', bev=None)
        P.box('band', (0.0008, W + 0.0012, hb), (sg * (L / 2 + 0.0004), 0, zb), 'paint_b', bev=None)
    P.views = [('a', 35, 36), ('b', 215, 36)]


def closed_box(P, L, W, H, top=0.005, tape='paint_b', lx=(), ly=(), lz=()):
    """A closed, taped cardboard box, full: its top bulging a little, the two top flaps meeting along X under a
    strip of tape that runs on down both ends. lx, ly, lz: edge loops for the AO (clear of the patches stuck on
    the box). Returns the box's BVH."""
    bm = bmesh.new()
    K.bm_cube(bm, (L, W, H), mat4((0, 0, H / 2)))
    loops(bm, 0, lx)
    loops(bm, 1, ly)
    loops(bm, 2, lz)
    for v in bm.verts:
        u, w_ = 2 * v.co.x / L, 2 * v.co.y / W
        if v.co.z > H - 1e-4:
            v.co.z += top * max(0.0, 1 - u * u) * max(0.0, 1 - w_ ** 4)
    tree = BVHTree.FromBMesh(bm)
    P.mesh('box', bm, 'paint', bev=0.004, segs=2, bev_angle=40.0)
    # the tape over the seam between the top flaps and on down both ends
    if tape:
        def tp(u, v):
            return (-L / 2 + 0.002 + (L - 0.004) * u, -0.025 + 0.05 * v)
        decal(P, bvh_surf(tree), tp, nu=9, nv=2, material=tape, lift=0.0008, sink=0.001, name='tape')
        for sx in (-1, 1):
            P.box('tape', (0.0009, 0.05, 0.08), (sx * (L / 2 + 0.00045), 0, H - 0.04 + 0.0004), tape, bev=None)
    return tree


def crate_lye(P):
    """A box of lye: a closed, taped carton, full and heavy (its top bulging), a big label on its front with a
    raised hazard diamond, the handling arrows (this way up) on both ends."""
    P.ao_distance = 0.05
    L, W, H = 0.45, 0.35, 0.30
    closed_box(P, L, W, H, top=0.006, tape='paint_b', lx=(-0.19, -0.135, 0.175, 0.2),
               ly=(-0.12, -0.075, 0.075, 0.12), lz=(0.04, 0.245))
    # the label on the front (-Y) and its hazard diamond
    P.box('label', (0.27, 0.0016, 0.17), (0.02, -(W / 2 + 0.0008), 0.14), 'paint_b', bev=0.0008, segs=1)
    dia = [(0.05, 0.0), (0.0, 0.05), (-0.05, 0.0), (0.0, -0.05)]
    P.prism('diamond', dia, 0.0016, matrix=mat4((-0.06, -(W / 2 + 0.0016), 0.14), (90, 0, 0)), material='paint',
            bev=0.0006, segs=1)
    P.prism('diamond_in', [(x * 0.6, y * 0.6) for (x, y) in dia], 0.0014,
            matrix=mat4((-0.06, -(W / 2 + 0.003), 0.14), (90, 0, 0)), material='paint_b', bev=0.0005, segs=1)
    for i in range(3):
        P.box('label_line', (0.11, 0.0012, 0.012), (0.075, -(W / 2 + 0.0019), 0.18 - i * 0.03), 'paint', bev=None)
    # the handling arrows (two arrows pointing up) on both ends
    arrow = [(-0.009, 0.0), (0.009, 0.0), (0.009, 0.05), (0.022, 0.05), (0.0, 0.08), (-0.022, 0.05), (-0.009, 0.05)]
    for sx in (-1, 1):
        for dy in (-0.035, 0.035):
            P.prism('arrow', arrow, 0.0016, matrix=mat4((sx * (L / 2 + 0.0008), dy, 0.11), (90, 0, sx * 90)),
                    material='paint_b', bev=0.0005, segs=1)
        P.box('arrow_bar', (0.0016, 0.11, 0.01), (sx * (L / 2 + 0.0008), 0, 0.1), 'paint_b', bev=None)
    P.views = [('a', 35, 30), ('b', 215, 30)]


def crate_supps(P):
    """A box of food supplements: a closed, taped carton, full (its top bulging), a label band round it with a
    pair of raised leaves on its front."""
    P.ao_distance = 0.05
    L, W, H = 0.40, 0.30, 0.25
    closed_box(P, L, W, H, top=0.005, tape='paint_b', lx=(-0.16, -0.1, 0.11, 0.16), ly=(-0.09, 0.09), lz=(0.05, 0.195))
    zb, hb = 0.12, 0.08
    for sg in (-1, 1):
        P.box('band', (L + 0.0016, 0.0012, hb), (0, sg * (W / 2 + 0.0006), zb), 'paint_b', bev=0.0004, segs=1)
        P.box('band', (0.0012, W + 0.0016, hb), (sg * (L / 2 + 0.0006), 0, zb), 'paint_b', bev=0.0004, segs=1)

    def leaf(a, b, n=9):
        up = [(a * (-1 + 2 * i / n), b * math.sin(math.pi * i / n) ** 0.85) for i in range(n + 1)]
        lo = [(a * (-1 + 2 * i / n), -b * 0.8 * math.sin(math.pi * i / n) ** 0.85) for i in range(n - 1, 0, -1)]
        return (up + lo)[::-1]          # counter-clockwise
    for (dx, rot, s) in ((-0.02, 35, 1.0), (0.03, -30, 0.85)):
        P.prism('leaf', leaf(0.036 * s, 0.017 * s), 0.0022,
                matrix=mat4((dx, -(W / 2 + 0.0024), zb + 0.002), (90, -rot, 0)) @ Matrix.Translation((0.03 * s, 0, 0)),
                material='paint', bev=0.0008, segs=1)
    P.box('stem', (0.006, 0.002, 0.026), (0.004, -(W / 2 + 0.0022), zb - 0.024), 'paint', bev=0.0005, segs=1)
    P.views = [('a', 35, 30), ('b', 215, 30)]


MODELS = {
    'food_chips': food_chips,
    'food_chips_ginger_xl': food_chips_ginger_xl,
    'food_licorice': food_licorice,
    'food_nuggets': food_nuggets,
    'food_dumplings': food_dumplings,
    'food_fish_can': food_fish_can,
    'food_dog_old': food_dog_old,
    'food_nuts_old': food_nuts_old,
    'drink_soda': drink_soda,
    'drink_water': drink_water,
    'drink_beer': drink_beer,
    'drink_spirit': drink_spirit,
    'drink_energy': drink_energy,
    'med_pain': med_pain,
    'med_warm': med_warm,
    'med_kit': med_kit,
    'lamp_old': lamp_old,
    'pack_old': pack_old,
    'pack_std': pack_std,
    'pack_hike': pack_hike,
    'crate_parts': crate_parts,
    'crate_parts_heavy': crate_parts_heavy,
    'crate_junk': crate_junk,
    'crate_chem': crate_chem,
    'crate_lye': crate_lye,
    'crate_supps': crate_supps,
}


# ------------------------------------------------------------------------------------------------ finishing, previews

def _recentre(P):
    """Move every piece (and the cutters still to be applied) so that the origin is the bottom centre of the
    model's bounds in plan."""
    objs = P.statics + [x for (_, objs, _) in P.movers for x in objs]
    xs, ys = [], []
    for o in objs:
        for v in o.data.vertices:
            xs.append(v.co.x)
            ys.append(v.co.y)
    c = V(((min(xs) + max(xs)) / 2, (min(ys) + max(ys)) / 2, 0.0))
    if c.length < 0.002:
        return
    m = Matrix.Translation(-c)
    cutters = [ct for cfg in P.cfg.values() for ct in cfg.get('cutters', [])]
    for o in objs + cutters:
        o.data.transform(m)
    for e in P.empties:
        e.location -= c


def _checked(fn):
    """Run a builder, recentre the model, then name any piece that reaches below the floor (z < 0)."""
    def run(P):
        res = fn(P)
        _recentre(P)
        for o in P.statics + [x for (_, objs, _) in P.movers for x in objs]:
            zs = [(o.matrix_world @ v.co).z for v in o.data.vertices]
            if zs and min(zs) < -1e-4:
                print(f'  WARN below the floor: {o.name} z = {min(zs):.4f}')
        return res
    run.__doc__ = fn.__doc__
    return run


def _lin(h):
    c = (((h >> 16) & 255) / 255, ((h >> 8) & 255) / 255, (h & 255) / 255)
    return tuple(x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c)


def _after(P, opts):
    """--hi: bigger cel previews from both sides, painted in the item's own colours."""
    if not opts.get('hi') or opts.get('norender'):
        return
    names = K.mc.MAT_NAMES
    saved = {k: names[k] for k in ('paint', 'paint_b')}
    for key, h in zip(('paint', 'paint_b'), COLORS.get(P.id, ())):
        names[key] = (_lin(h), saved[key][1], saved[key][2])
    try:
        views = [(f'h{i + 1}', yaw, pitch) for i, (_, yaw, pitch) in enumerate(getattr(P, 'views', None) or
                                                                              [('a', 35, 24), ('b', 215, 24)])]
        if isinstance(opts.get('views'), str):
            views = [(f'v{i + 1}', float(a), float(b)) for i, (a, b) in
                     enumerate(v.split(':') for v in opts['views'].split(','))]
        K.render_toon(P, views=views, size=(800, 640), suffix='_hi')
    finally:
        names.update(saved)


def main(args):
    K.run({k: _checked(f) for k, f in MODELS.items()}, args, after=_after, out_dir=OUT, geo=False)
