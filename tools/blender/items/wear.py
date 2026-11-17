"""
Clothes, heavy gear and small junk (src/core/modcar/items.ts; group `wear`):

    blender -b --factory-startup --python tools/blender/build.py -- items/wear [<model>|all] [--toon] [--norender]
            [--stats] [--views]

Writes public/models/modcar/items/<model>.glb (not parts_geo.json): root mesh PART, origin at the bottom centre,
x forward, resting on z = 0 as the thing lies about (clothes folded flat, gloves and the sledgehammer lying on the
ground, the boots, buckets, mug, cone and sign standing), conventional material names only, AO in 'Col'.
`paint` / `paint_b` take the item's paint / paint2, so one model serves every colour of a kind (a jacket and the
torn jacket, the three sledgehammers). --views (with --toon) also renders the second preview view.
"""
import math

import bmesh
from mathutils import Matrix

from parts import _kit as K
from parts._kit import V, mat4

OUT = 'public/models/modcar/items'
TAU = math.tau


# ------------------------------------------------------------------------------------------------ helpers

def noise(p, f=1.0, seed=0.0):
    """Smooth deterministic pseudo-noise in about [-1, 1] (a sum of sines), for lumps, fur and wrinkles."""
    x, y, z = p[0] * f, p[1] * f, p[2] * f
    n = (math.sin(1.7 * x + 0.3 * y + 2.1 * z + seed) +
         math.sin(-0.8 * x + 2.3 * y + 0.7 * z + 1.3 * seed + 1.1) +
         math.sin(1.1 * x - 1.9 * y - 1.4 * z + 0.7 * seed + 2.3) +
         0.5 * math.sin(3.1 * x + 2.7 * y - 2.9 * z + 2.1 * seed + 0.4))
    return n / 3.5


def settle(P, centre=True, cx=None, cy=None):
    """
    Finish every static now (booleans, bevels, subdivision) and move the whole thing so that it rests on z = 0;
    centre=True also centres its footprint (bounding box) on the origin, or on (cx, cy) if given (a round body's
    axis when a handle sticks out). The kit then joins, bakes the AO and exports as usual.
    """
    for o in P.statics:
        P._apply(o)
    pts = [v.co for o in P.statics for v in o.data.vertices]
    lo = V((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
    hi = V((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
    d = V((0.0, 0.0, -lo.z))
    if centre:
        d.x = -(lo.x + hi.x) / 2 if cx is None else -cx
        d.y = -(lo.y + hi.y) / 2 if cy is None else -cy
    m = Matrix.Translation(d)
    for o in P.statics:
        o.data.transform(m)
    for e in P.empties:
        e.location += d


def lathe_mm(P, name, prof, materials, segs=32, matrix=None, sharp=40.0, angle=TAU, start=0.0, loop=False,
             face_mat=None, **kw):
    """
    A lathe (see K.bm_lathe) with a material per profile segment: prof = [(r, z, mat_index), ...], the index of
    point k colours the band between points k and k + 1 (with loop=True the last one closes back to the first).
    face_mat(k, centre) may override it per face (return None to keep it), e.g. a band only part of the way round.
    """
    bm = bmesh.new()
    rings = K.bm_lathe(bm, [(r, z) for (r, z, _) in prof], segs=segs, angle=angle, start=start, loop=loop)
    ring_of = {}
    for k, ring in enumerate(rings):
        for v in ring:
            ring_of[v] = k
    n = len(rings)
    for f in bm.faces:
        ks = sorted({ring_of[v] for v in f.verts})
        k = ks[0]
        if loop and ks[0] == 0 and ks[-1] == n - 1:
            k = n - 1
        f.material_index = prof[k][2]
        if face_mat is not None:
            mi = face_mat(k, f.calc_center_median())
            if mi is not None:
                f.material_index = mi
    if loop and abs(angle - TAU) < 1e-6:
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    if matrix is not None:
        K.bm_transform(bm, matrix)
    return P.mesh(name, bm, materials, sharp=sharp, **kw)


def wire_ears(P, r_wall, z, material='steel', w=0.03, h=0.034):
    """The two riveted lugs a wire bail hangs from, on the +-Y sides of a round body of radius r_wall."""
    for sg in (-1, 1):
        y = sg * (r_wall + 0.002)
        bm = bmesh.new()
        poly = [(-w / 2, -h / 2), (w / 2, -h / 2), (w / 2, h * 0.1)] + \
               [(w / 2 * math.cos(a), h * 0.1 + w / 2 * math.sin(a)) for a in (0.6, 1.2, 1.94, 2.54)] + \
               [(-w / 2, h * 0.1)]
        K.bm_prism(bm, poly, 0.004, matrix=mat4((0, y, z), (90, 0, 0)))
        P.mesh('ear', bm, material, bev=0.0012, segs=1)
        for dx in (-0.008, 0.008):
            P.sphere('rivet', 0.0042, (dx, sg * (r_wall + 0.0045), z - 0.009), material, u=6, v=3,
                     scale=(1, 0.55, 1))


def bail(P, R, z, tilt, r_hook, r=0.0028, material='steel', n=12):
    """
    A wire bail handle of radius R hinged on the ears at height z, fallen over by `tilt` degrees (from upright)
    towards -X, its hooked ends reaching in to the radius r_hook (the ears); returns the middle of its arc (where
    a grip goes; the wire runs along Y there).
    """
    t = math.radians(tilt)
    up = V((-math.sin(t), 0.0, math.cos(t)))
    pts = [V((0.0, r_hook, z)), V((0.0, R - 0.003, z)) + up * 0.0012]
    for i in range(1, n):
        ph = math.pi * i / n
        pts.append(V((0.0, R * math.cos(ph), z)) + up * (R * math.sin(ph)))
    pts += [V((0.0, -R + 0.003, z)) + up * 0.0012, V((0.0, -r_hook, z))]
    P.tube('bail', pts, r, material, segs=6, bend=0.0)
    return V((0.0, 0.0, z)) + up * R


def ccw(poly):
    """The polygon [(x, y), ...] counter-clockwise (what K.bm_prism wants)."""
    a = sum(x0 * y1 - x1 * y0 for (x0, y0), (x1, y1) in zip(poly, poly[1:] + poly[:1]))
    return list(poly) if a > 0 else list(poly)[::-1]


def superellipse(a, b, n, p=4.0, rib=0.0):
    """A closed section (x, y) with half-axes a and b and squareness p (2 = ellipse, higher = boxier); rib pushes
    every other point out and the others in (knit ribs running along a sweep)."""
    pts = []
    for i in range(n):
        t = TAU * i / n
        c, s = math.cos(t), math.sin(t)
        k = 1.0 + (rib if i % 2 == 0 else -rib)
        pts.append((a * k * math.copysign(abs(c) ** (2 / p), c), b * k * math.copysign(abs(s) ** (2 / p), s)))
    return pts


def spline(pts, n=4, closed=False):
    """Catmull-Rom through pts, n samples per span (a smooth path for P.tube with bend=0)."""
    pts = [V(p) for p in pts]
    m = len(pts)
    out = []
    spans = m if closed else m - 1
    for i in range(spans):
        p1, p2 = pts[i], pts[(i + 1) % m]
        p0 = pts[(i - 1) % m] if (closed or i > 0) else p1 * 2 - p2
        p3 = pts[(i + 2) % m] if (closed or i + 2 < m) else p2 * 2 - p1
        for k in range(n):
            t = k / n
            out.append(0.5 * (p1 * 2 + (p2 - p0) * t + (p0 * 2 - p1 * 5 + p2 * 4 - p3) * (t * t) +
                              (p1 * 3 - p0 - p2 * 3 + p3) * (t * t * t)))
    if not closed:
        out.append(pts[-1])
    return out


def band(P, name, pts, w, t, material, p=3.0, n=16, rib=0.0, radius_fn=None, smooth=3, caps=True, sharp=60.0,
         closed=False):
    """A flat soft band (a sleeve, a strap, a collar) swept along a Catmull-Rom path through pts (smooth samples
    per span; 0 = the points as they are): w wide, t thick (t is along the sweep's normal, up for a level path)."""
    path = spline(pts, smooth, closed) if smooth else [V(q) for q in pts]
    return P.tube(name, path, 1.0, material, profile=superellipse(t / 2, w / 2, n, p, rib), bend=0.0, caps=caps,
                  radius_fn=radius_fn, sharp=sharp, closed=closed)


def displace(bm, amp, f, seed=0.0, axis=None):
    """Push every vertex along its normal (or along `axis`) by amp * noise: lumps, fur, wrinkles."""
    bm.normal_update()
    moves = []
    for v in bm.verts:
        d = V(axis) if axis is not None else V(v.normal)
        moves.append((v, d * (amp * noise(v.co, f, seed))))
    for v, d in moves:
        v.co += d


# ------------------------------------------------------------------------------------------------ clothes, folded

def densify2d(poly, step):
    """Split the edges of a closed 2D polygon so that no edge is longer than step (vertex AO along long flats)."""
    out = []
    n = len(poly)
    for i in range(n):
        a, b = V((*poly[i], 0.0)), V((*poly[(i + 1) % n], 0.0))
        k = max(1, int(math.ceil((b - a).length / step)))
        for j in range(k):
            q = a + (b - a) * (j / k)
            out.append((q.x, q.y))
    return out


def offset_poly(poly, d):
    """A counter-clockwise polygon offset inwards by d (mitred vertex normals; keep d below its corner radii)."""
    n = len(poly)
    out = []
    for i in range(n):
        p0, p1, p2 = V((*poly[i - 1], 0.0)), V((*poly[i], 0.0)), V((*poly[(i + 1) % n], 0.0))
        e1, e2 = (p1 - p0).normalized(), (p2 - p1).normalized()
        n1, n2 = V((-e1.y, e1.x, 0.0)), V((-e2.y, e2.x, 0.0))
        m = n1 + n2
        m = m.normalized() if m.length > 1e-6 else n1
        q = p1 + m * (d / max(0.4, m.dot(n1)))
        out.append((q.x, q.y))
    return out


def soft(P, name, poly, H, material='paint', z0=0.0, rr=None, dome=0.0, inner=(0.75, 0.5, 0.25), n_side=3,
         step=0.06, lift=None, sharp=50.0, cut=None):
    """
    A folded layer of cloth: the outline `poly` (x, y) inflated into a slab H thick lying from z0, its edge one
    round fold of radius rr (default H / 2), flat underneath. Its top carries rings shrunk towards the middle
    (`inner`: their scale) puffed up to `dome` at the last one, and a fan to the middle, so the vertex AO has
    samples across it. lift(x, y) -> dz bends it (a collar draped over a fold). It is not subdivided, so it takes
    booleans; cut = a material for the faces a boolean leaves (the dark inside of a hole).
    """
    poly = densify2d(ccw(poly), step)
    rr = min(rr or H / 2, H / 2)
    rings = []

    def ring(pts, z):
        return [V((x, y, z0 + z + (lift(x, y) if lift else 0.0))) for (x, y) in pts]

    for k in range(n_side + 1):
        t = -math.pi / 2 + (math.pi / 2) * k / n_side
        rings.append(ring(offset_poly(poly, rr * (1 - math.cos(t))), rr + rr * math.sin(t)))
    for k in range(0 if H - 2 * rr > 1e-5 else 1, n_side + 1):
        t = (math.pi / 2) * k / n_side
        rings.append(ring(offset_poly(poly, rr * (1 - math.cos(t))), H - rr + rr * math.sin(t)))
    top = offset_poly(poly, rr)
    cx = sum(q[0] for q in top) / len(top)
    cy = sum(q[1] for q in top) / len(top)
    for i, f in enumerate(inner):
        rings.append(ring([(cx + (x - cx) * f, cy + (y - cy) * f) for (x, y) in top],
                          H + dome * math.sin(math.pi / 2 * (i + 1) / len(inner))))
    bm = bmesh.new()
    vr, faces = K.bm_loft(bm, rings, cap_start=True, cap_end=True)
    bmesh.ops.poke(bm, faces=[faces[-1]])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    if cut:
        for f in bm.faces:
            f.material_index = 1
        return P.mesh(name, bm, [cut, material], sharp=sharp)
    return P.mesh(name, bm, material, sharp=sharp)


def folded_body(P, L, W, H, material='paint', r=0.03, dome=0.0, cut=None):
    """The usual folded garment: the back with the folded sides (a full layer) under a slightly smaller front
    layer, so that the edges show the folds; returns (front layer object, height of its flat top)."""
    h1 = H * 0.58
    soft(P, 'back', K.rounded_rect(L, W, r, seg=3), h1, material, n_side=2, inner=(0.5,))
    h2 = H - h1 + 0.006
    front = soft(P, 'front', K.rounded_rect(L - 0.014, W - 0.016, r * 0.9, seg=3), h2, material, z0=h1 - 0.006,
                 dome=dome, cut=cut)
    return front, H


def sleeve(P, sg, x0, x1, y, zt, w, t, cuff_len=0.034, taper=0.86, mat='paint', cuff_mat='paint_b', rib=0.07):
    """A sleeve folded down the side of a folded top, coming up out of the side fold at the shoulder (x0) and
    lying along it to the cuff (ribbed, x1 .. x1 - cuff_len) at the bottom end."""
    zc = zt + t * 0.4
    pts = [V((x0 + 0.018, sg * (y + w * 0.5), zt - t * 1.2)), V((x0, sg * (y + w * 0.24), zt + t * 0.05)),
           V((x0 - 0.05, sg * y, zc)), V(((x0 + x1) / 2, sg * (y - 0.003), zc - 0.001)), V((x1, sg * (y - 0.006), zc))]
    band(P, 'sleeve', pts, w, t, mat, p=2.2, n=12, radius_fn=lambda s: 1 - (1 - taper) * s, smooth=2)
    k = taper * 1.06
    band(P, 'cuff', [V((x1 + 0.004, sg * (y - 0.006), zc)), V((x1 - cuff_len, sg * (y - 0.007), zc))], w * k, t * k,
         cuff_mat, p=2.2, n=20, rib=rib, smooth=0)


def drape(x0, length, depth):
    """lift(x, y) for something lying over the fold at the +X end: flat up to x0, then down by depth over length."""
    return lambda x, y: -((max(0.0, x - x0) / length) ** 2) * depth


def snap(P, loc, r=0.0058, name='snap'):
    P.cyl(name, r, 0.003, loc, 'steel', segs=8, bev=0.001, bsegs=1)


def wear_jacket(P):
    """A work jacket folded into a neat rectangle, the front up: the collar (paint_b) lying across the top end and
    over its fold, the zip (paint_b, a steel slider and pull) down the middle, two chest pocket flaps with snaps,
    the sleeves laid down the sides ending in ribbed cuffs (paint_b), the hem band across the bottom end."""
    P.ao_distance = 0.028
    L, W = 0.40, 0.32
    front, zt = folded_body(P, L, W, 0.062, r=0.032)
    col = [(0.148, -0.118), (0.214, -0.122), (0.214, 0.122), (0.148, 0.118), (0.13, 0.03), (0.152, 0.0),
           (0.13, -0.03)]
    soft(P, 'collar', col, 0.011, 'paint_b', z0=zt - 0.004, lift=drape(0.172, 0.042, 0.026), n_side=2, step=0.04,
         inner=(0.5,))
    P.box('zip', (0.3, 0.012, 0.005), (-0.02, 0.0, zt + 0.0008), 'paint_b', bev=0.0018, segs=1)
    P.box('zip_slider', (0.016, 0.015, 0.006), (0.125, 0.0, zt + 0.0042), 'steel', bev=0.0016, segs=1)
    P.box('zip_pull', (0.026, 0.009, 0.0035), (0.107, 0.0, zt + 0.007), 'steel', rot=(0, 4, 0), bev=0.0012, segs=1)
    for sg in (-1, 1):
        P.box('flap', (0.036, 0.062, 0.006), (0.058, sg * 0.05, zt + 0.0016), 'paint', rot=(0, 0, sg * 3),
              bev=0.0024, segs=2)
        snap(P, (0.054, sg * 0.05, zt + 0.0055))
        sleeve(P, sg, 0.145, -0.152, 0.116, zt, 0.072, 0.019)
    P.pillow('hem', (0.03, 0.16, 0.012), (-0.168, 0.0, zt - 0.002), 'paint', r=0.005, sub=1)
    P.views = [('a', 35, 40), ('b', 215, 34)]
    settle(P)


def _torn_hole(cx, cy, rx, ry, n=14, seed=1.0):
    """A ragged outline round (cx, cy): every other point pulled out, the rest jittered."""
    out = []
    for i in range(n):
        k = 0.72 + 0.28 * (0.5 + 0.5 * math.sin(i * 2.7 + seed)) + (0.12 if i % 2 else 0.0)
        out.append((cx + rx * k * math.cos(TAU * i / n), cy + ry * k * math.sin(TAU * i / n)))
    return out


def wear_sweater_torn(P):
    """A worn-out sweater folded: the sleeves laid down the sides with ribbed cuffs, the ribbed hem across the
    bottom end, the ribbed crew neck (paint_b) round the neck opening at the top and over its fold, a hole torn in
    the front (dark inside) with loose yarn ends curling into it, a frayed stretch of the hem."""
    P.ao_distance = 0.028
    L, W = 0.38, 0.30
    front, zt = folded_body(P, L, W, 0.058, r=0.03, dome=0.002, cut='trim')
    zt += 0.002
    # the neck opening: a shallow dip inside the crew neck
    nc = V((0.16, 0.0, 0.0))
    dip = [(nc.x + 0.036 * math.cos(TAU * i / 16), 0.052 * math.sin(TAU * i / 16)) for i in range(16)]
    bm = bmesh.new()
    K.bm_prism(bm, ccw(dip), 0.02, matrix=mat4((0, 0, zt + 0.003)))
    P.cut(front, bm)
    hc = V((0.03, -0.035, 0.0))
    hole = _torn_hole(hc.x, hc.y, 0.034, 0.025)
    bm = bmesh.new()
    K.bm_prism(bm, ccw(hole), 0.03, matrix=mat4((0, 0, zt + 0.002)))
    P.cut(front, bm)
    for i, (hx, hy) in enumerate(hole[::3]):
        p0 = V((hx, hy, zt - 0.001))
        d = (hc - V((hx, hy, 0.0))).normalized()
        P.tube('yarn', [p0, p0 + d * 0.008 + V((0, 0, 0.002)), p0 + d * 0.016 + V((0.003 * (i - 2), 0.0, -0.008))],
               0.002, 'paint', segs=5, bend=0.0)
    for sg in (-1, 1):
        sleeve(P, sg, 0.14, -0.14, 0.106, zt, 0.066, 0.018, cuff_len=0.036)
    P.pleats('hem', 0.15, 0.034, 9, 0.0045, (-0.152, 0.0, zt - 0.003), material='paint_b', seg=2, fall=0.12)
    for k, y in enumerate((-0.04, -0.026, -0.012)):
        P.tube('fray', [V((-0.166, y, zt - 0.002)), V((-0.181, y + 0.003, zt - 0.005)),
                        V((-0.19, y - 0.002, zt - 0.017 - 0.005 * k))], 0.002, 'paint_b', segs=5, bend=0.0)
    # the crew neck: a ribbed band round the opening, its back lying over the top fold
    dr = drape(0.17, 0.034, 0.024)
    pts = []
    for i in range(28):
        a = TAU * i / 28
        x, y = nc.x + 0.044 * math.cos(a), 0.062 * math.sin(a)
        pts.append(V((x, y, zt + 0.002 + dr(x, y))))

    def ribs(s):
        return 1.0 + 0.11 * math.cos(TAU * 14 * s)
    P.tube('neck', pts, 1.0, 'paint_b', profile=superellipse(0.0065, 0.0105, 8, 2.6), radius_fn=ribs, closed=True,
           sharp=60.0)
    P.views = [('a', 35, 40), ('b', 215, 34)]
    settle(P)


def wear_padded(P):
    """A padded jacket folded: thick, its front quilted in horizontal channels either side of a snap placket, the
    stand collar (paint_b) zipped up into a ring round the neck opening at the top end, taller at the back."""
    P.ao_distance = 0.03
    L, W = 0.42, 0.34
    front, zt = folded_body(P, L, W, 0.088, r=0.04)
    for sg in (-1, 1):
        P.pleats('quilt', 0.34, 0.126, 7, 0.016, (-0.028, sg * 0.084, zt - 0.003), rot=(0, 0, 90), material='paint',
                 seg=3, fall=0.1)
    P.pillow('placket', (0.3, 0.034, 0.022), (-0.055, 0.0, zt + 0.004), 'paint', r=0.008, sub=1)
    for x in (-0.17, -0.095, -0.02, 0.055):
        snap(P, (x, 0.0, zt + 0.0155), r=0.0065)
    c = V((0.15, 0.0, zt + 0.004))
    pts = []
    for i in range(20):
        a = TAU * i / 20
        pts.append(c + V((0.048 * math.cos(a), 0.066 * math.sin(a), 0.006 * math.cos(a))))
    P.tube('collar', pts, 1.0, 'paint_b', profile=superellipse(0.014, 0.0065, 10, 3.0), closed=True, sharp=60.0)
    bm = bmesh.new()
    K.bm_cyl(bm, 1.0, 0.003, segs=20, matrix=Matrix.Translation(c + V((0, 0, 0.012))) @
             Matrix.Diagonal((0.043, 0.061, 1.0, 1.0)))
    P.mesh('neck', bm, 'plastic_int', sharp=60.0)
    P.views = [('a', 35, 38), ('b', 215, 32)]
    settle(P)


def wear_down(P):
    """A chunky down jacket folded: big puffy baffles across it either side of a zip placket, the hood lying up on
    the collar end, its face opening (dark) ringed with a lumpy fur trim (paint_b)."""
    P.ao_distance = 0.04
    L, W = 0.44, 0.36
    front, zt = folded_body(P, L, W, 0.075, r=0.04)
    for sg in (-1, 1):
        P.pleats('baffles', 0.4, 0.152, 5, 0.034, (-0.012, sg * 0.09, zt - 0.006), rot=(0, 0, 90), material='paint',
                 seg=4, fall=0.16)
    P.pillow('placket', (0.36, 0.03, 0.034), (-0.032, 0.0, zt + 0.008), 'paint', r=0.012, sub=1)
    hz = zt + 0.006
    P.sphere('hood', 0.1, (0.15, 0.0, hz), 'paint', u=18, v=9, scale=(0.72, 1.12, 0.42))
    m = Matrix.Translation((0.136, 0.0, hz + 0.034)) @ mat4(rot=(0, -20, 0))
    bm = bmesh.new()
    K.bm_cyl(bm, 1.0, 0.01, segs=20, matrix=m @ Matrix.Diagonal((0.046, 0.066, 1.0, 1.0)))
    P.mesh('opening', bm, 'trim', sharp=60.0)
    bm = bmesh.new()
    path = [m @ V((0.052 * math.cos(TAU * i / 24), 0.075 * math.sin(TAU * i / 24), 0.004)) for i in range(24)]
    K.bm_sweep(bm, path, 0.021, segs=8, closed=True)
    displace(bm, 0.007, 140.0, seed=0.7)
    displace(bm, 0.003, 360.0, seed=2.1)
    P.mesh('fur', bm, 'paint_b', sharp=80.0)
    P.views = [('a', 35, 36), ('b', 215, 30)]
    settle(P)


def wear_pants(P):
    """Work trousers laid back-up and folded in half: the waistband with belt loops and a button at the top end,
    the centre back seam down the seat, a patch back pocket (paint_b), the two legs (a dark gap between them) down
    to the fold, a bellows cargo pocket with its flap on one thigh and a knee patch (paint_b) on the other."""
    P.ao_distance = 0.024
    L, W = 0.40, 0.28
    front, zt = folded_body(P, L, W, 0.052, r=0.028, cut='trim')
    # the gap between the legs, opening through the fold at the bottom end
    bm = bmesh.new()
    K.bm_prism(bm, [(-0.26, -0.006), (0.0, -0.0012), (0.0, 0.0012), (-0.26, 0.006)], 0.05,
               matrix=mat4((0, 0, zt + 0.006)))
    for v in bm.verts:
        if v.co.z < zt:
            v.co.z = zt - 0.02
    P.cut(front, bm)
    P.tube('seam', [V((0.165, 0.0, zt + 0.0006)), V((0.08, 0.0, zt + 0.0009)), V((0.012, 0.0, zt + 0.0002))], 0.0022,
           'paint', segs=6, bend=0.0)
    P.pillow('waistband', (0.042, W + 0.006, 0.02), (0.18, 0.0, zt - 0.004), 'paint', r=0.007, sub=1)
    for y in (-0.112, -0.04, 0.04, 0.112):
        P.tube('loop', [V((0.206, y, zt - 0.002)), V((0.203, y, zt + 0.007)), V((0.198, y, zt + 0.0088)),
                        V((0.16, y, zt + 0.0088)), V((0.155, y, zt + 0.007)), V((0.152, y, zt - 0.002))], 1.0,
               'paint', profile=superellipse(0.002, 0.0066, 6, 3.0), bend=0.0, sharp=60.0)
    P.cyl('button', 0.009, 0.004, (0.181, 0.13, zt + 0.0075), 'steel', segs=10, bev=0.0012, bsegs=1)
    pocket = [(0.142, -0.116), (0.142, -0.03), (0.074, -0.03), (0.056, -0.073), (0.074, -0.116)]
    P.prism('pocket', ccw(pocket), 0.004, (0, 0, zt + 0.0002), 'paint_b', bev=0.0014, segs=1)
    P.pillow('cargo', (0.092, 0.084, 0.016), (-0.05, 0.068, zt + 0.003), 'paint', r=0.005, sub=1)
    P.box('cargo_flap', (0.034, 0.09, 0.007), (0.002, 0.068, zt + 0.0105), 'paint', bev=0.0024, segs=2)
    snap(P, (-0.002, 0.068, zt + 0.0145), name='cargo_snap')
    P.prism('patch', ccw(K.rounded_rect(0.07, 0.07, 0.016, seg=2)), 0.0036, (-0.128, -0.068, zt + 0.0002),
            'paint_b', rot=(0, 0, 5), bev=0.0012, segs=1)
    P.views = [('a', 35, 40), ('b', 215, 34)]
    settle(P)


def wear_pants_snow(P):
    """Puffy snow trousers folded: a fat padded body with reinforced knee panels and an elastic waistband, the
    braces (paint_b) lying on top in two loose loops with their ladder buckles and clips."""
    P.ao_distance = 0.032
    L, W = 0.42, 0.30
    front, zt = folded_body(P, L, W, 0.078, r=0.04, dome=0.006)
    zt += 0.004
    P.pillow('waistband', (0.045, W - 0.004, 0.03), (0.182, 0.0, zt - 0.012), 'paint', r=0.012, sub=1)
    for y in (-0.072, 0.072):
        o = soft(P, 'knee', K.rounded_rect(0.1, 0.1, 0.03, seg=2), 0.008, 'paint', z0=zt - 0.005, n_side=2,
                 inner=(0.5,))
        o.data.transform(Matrix.Translation((-0.115, y, 0.0)))
    for sg in (-1, 1):
        pts = [V((0.205, sg * 0.1, zt + 0.0)), V((0.15, sg * 0.112, zt + 0.004)), V((0.02, sg * 0.12, zt + 0.004)),
               V((-0.1, sg * 0.104, zt + 0.006)), V((-0.15, sg * 0.064, zt + 0.006)), V((-0.118, sg * 0.024, zt + 0.006)),
               V((0.0, sg * 0.03, zt + 0.004)), V((0.12, sg * 0.045, zt + 0.004)), V((0.205, sg * 0.05, zt + 0.0))]
        band(P, 'brace', pts, 0.03, 0.0045, 'paint_b', p=4.0, n=8, smooth=3)
        P.box('buckle', (0.022, 0.04, 0.006), (0.095, sg * 0.116, zt + 0.0075), 'steel', rot=(0, 0, -sg * 5),
              bev=0.0016, segs=1)
        P.box('buckle_bar', (0.006, 0.034, 0.004), (0.095, sg * 0.116, zt + 0.0115), 'steel', rot=(0, 0, -sg * 5),
              bev=0.001, segs=1)
        for y in (sg * 0.1, sg * 0.05):
            P.box('clip', (0.03, 0.034, 0.008), (0.196, y, zt + 0.007), 'steel', bev=0.0022, segs=1)
    P.views = [('a', 35, 38), ('b', 215, 32)]
    settle(P)


# ------------------------------------------------------------------------------------------------ small junk

def junk_bucket(P):
    """A galvanised-style steel bucket: tapered wall with two pressed stiffening beads, a rolled rim, the base set
    in over a rolled chime, riveted ears and a wire bail (fallen over to one side) with a turned grip (paint_b)."""
    P.ao_distance = 0.06
    rb, rt, H = 0.11, 0.14, 0.28

    def r_at(z):
        return rb + (rt - rb) * z / H

    prof = [(0.0, 0.011), (0.096, 0.011), (0.1012, 0.0065), (0.1048, 0.0012), (0.1092, 0.0),
            (0.1128, 0.0035), (0.1136, 0.011), (r_at(0.03), 0.03)]
    for zb in (0.085, 0.2):
        prof += [(r_at(zb - 0.01), zb - 0.01), (r_at(zb - 0.0035) + 0.0042, zb - 0.0035),
                 (r_at(zb + 0.0035) + 0.0042, zb + 0.0035), (r_at(zb + 0.01), zb + 0.01)]
    prof += [(r_at(0.262), 0.262), (r_at(0.275), 0.275), (r_at(0.275) - 0.0032, 0.275),
             (r_at(0.25) - 0.0032, 0.25), (r_at(0.03) - 0.0032, 0.03), (r_at(0.018) - 0.006, 0.0145), (0.0, 0.0145)]
    P.lathe('bucket', prof, material='paint', segs=32, sharp=40.0)
    P.torus('rim', r_at(0.276) + 0.0006, 0.0056, loc=(0, 0, 0.2765), segs=32, rsegs=7, material='paint')
    ze = 0.252
    wire_ears(P, r_at(ze), ze)
    # the bail has fallen over to the back: its grip rests on the far side of the rim
    c = bail(P, 0.1567, ze, 76.0, r_at(ze) + 0.0005)
    P.lathe('grip', [(0.0, -0.047), (0.0075, -0.047), (0.0105, -0.04), (0.0118, -0.02), (0.012, 0.0), (0.0118, 0.02),
                     (0.0105, 0.04), (0.0075, 0.047), (0.0, 0.047)],
            loc=tuple(c), material='paint_b', axis='Y', segs=12, sharp=50.0)
    P.views = [('a', 35, 24), ('b', 215, 30)]
    settle(P, cx=0.0, cy=0.0)


def _can_r(z):
    """Outer radius of the paint tin's wall at height z (straight, flaring into the top chime)."""
    if z < 0.204:
        return 0.13
    return 0.13 + 0.0045 * min(1.0, (z - 0.204) / 0.007)


def _drip(bm, a, z0, length, w, thick, r_fn):
    """A dried paint drip running down a round wall at angle a from z0: a flat ribbon (half-width w, thickness
    thick) that gathers into a drop at its foot."""
    rad = V((math.cos(a), math.sin(a), 0.0))
    tan = V((-math.sin(a), math.cos(a), 0.0))
    rings = []
    for s in (0.0, 0.3, 0.58, 0.76, 0.88, 0.96, 1.0):
        z = z0 - length * s
        drop = math.exp(-((s - 0.84) / 0.1) ** 2)
        end = math.sqrt(max(0.0, 1.0 - ((s - 0.84) / 0.165) ** 2)) if s > 0.84 else 1.0
        end = max(end, 0.3)
        ww = w * (0.92 + 0.08 * math.cos(s * 7 + a * 5) + 0.4 * drop) * end
        tk = thick * (0.9 + 0.55 * drop) * end
        c = rad * (r_fn(z) + tk * 0.3) + V((0.0, 0.0, z))
        rings.append([c + rad * (tk * math.sin(TAU * j / 5)) + tan * (ww * math.cos(TAU * j / 5)) for j in range(5)])
    K.bm_loft(bm, rings, cap_start=True, cap_end=True)


def junk_bucket_paint(P):
    """An old paint tin with its paint dried hard: a straight tin with rolled chimes and two beads, the lid ajar
    (sunk into the tin on one side, sticking out over the rim on the other), the dried paint (paint_b) showing in
    the gap, caked on the rim where it was poured from and run down the side in raised drips, more of it in the
    lid's groove; wire ears and a bail hanging down the side."""
    P.ao_distance = 0.05
    R = 0.13
    C, Pb = 0, 1                        # the tin (paint), dried paint (paint_b)
    prof = [(0.0, 0.008, C), (0.121, 0.008, C), (0.1275, 0.0, C), (0.1315, 0.006, C), (R, 0.016, C)]
    for zb in (0.07, 0.15):
        prof += [(R, zb - 0.008, C), (R + 0.0035, zb, C), (R, zb + 0.008, C)]
    # the top: the chime, the channel the lid's plug presses into, the inner lip, down inside to the paint
    prof += [(R, 0.204, C), (0.1345, 0.211, C), (0.1345, 0.218, C), (0.1312, 0.2218, C), (0.1282, 0.2195, C),
             (0.1262, 0.2128, C), (0.1242, 0.2195, C), (0.1222, 0.2205, C), (0.122, 0.182, Pb), (0.1172, 0.1762, Pb),
             (0.105, 0.1716, Pb), (0.0, 0.1702, Pb)]
    pour = (-1.85, 0.62)                # the side it was poured from: paint caked over the chime

    def caked(k, c):
        a = math.atan2(c.y, c.x)
        if 0.2 < c.z and c.x * c.x + c.y * c.y > 0.1215 ** 2 and pour[0] < a < pour[1] + 0.12 * math.sin(a * 9):
            return Pb
        return None

    lathe_mm(P, 'tin', prof, ['paint', 'paint_b'], segs=28, sharp=40.0, face_mat=caked)
    # the lid: built flat, then tipped about where its underside rests on the chime (+X): the far side sinks into
    # the tin and nearly sits on the paint, the near side sticks out over the rim; dried paint in its groove
    lid = [(0.0, -0.0004, C), (0.108, -0.0004, C), (0.1115, -0.0065, C), (0.1195, -0.0065, C), (0.1225, -0.0004, C),
           (0.1335, 0.0, C), (0.1335, 0.0035, C), (0.1285, 0.0064, C), (0.1195, 0.0062, Pb), (0.1145, 0.0026, Pb),
           (0.1095, 0.0026, Pb), (0.1045, 0.0058, C), (0.096, 0.0058, C), (0.06, 0.0058, C), (0.0, 0.0058, C)]
    tilt = math.radians(-11.0)
    contact = V((0.1315, 0.0, 0.2215))
    m = Matrix.Translation(contact) @ Matrix.Rotation(tilt, 4, 'Y') @ Matrix.Translation((-0.0965, 0.0, 0.0004))
    lathe_mm(P, 'lid', lid, ['paint', 'paint_b'], segs=28, matrix=m, sharp=40.0)
    # dried drips running down the outside from the caked chime
    bm = bmesh.new()
    for (a, ln, w, tk) in ((-1.62, 0.07, 0.0042, 0.0014), (-1.2, 0.135, 0.005, 0.0016), (-0.78, 0.045, 0.0038, 0.0013),
                           (-0.4, 0.105, 0.0048, 0.0016), (0.02, 0.165, 0.0052, 0.0017), (0.4, 0.06, 0.004, 0.0014),
                           (2.7, 0.05, 0.0036, 0.0013)):
        _drip(bm, a, 0.2135, ln, w, tk, _can_r)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    P.mesh('drips', bm, 'paint_b', sharp=60.0)
    ze = 0.188
    wire_ears(P, R, ze)
    bail(P, R + 0.015, ze, 116.0, R + 0.0005)
    P.views = [('a', 35, 26), ('b', 215, 30)]
    settle(P, cx=0.0, cy=0.0)


def junk_mug(P):
    """A ceramic mug: rounded rim, a foot ring, a raised band round it (paint_b), white inside (paint_b), a loop
    handle on the right (-Y) and a chip knocked out of the rim (the white body showing)."""
    P.ao_distance = 0.02
    O, B = 1, 0                         # outside (paint), band / inside / chip (paint_b)
    prof = [(0.0, 0.0035, O), (0.036, 0.0035, O), (0.0395, 0.0, O), (0.0425, 0.0012, O), (0.0448, 0.0065, O),
            (0.045, 0.06, O), (0.0458, 0.0615, B), (0.0458, 0.0735, B), (0.045, 0.075, O), (0.045, 0.0905, O),
            (0.0438, 0.0948, O), (0.0412, 0.0952, B), (0.0398, 0.092, B), (0.0398, 0.014, B), (0.036, 0.0092, B),
            (0.0, 0.0088, B)]
    mug = lathe_mm(P, 'mug', prof, ['paint_b', 'paint'], segs=28, sharp=40.0)
    # the chip: a wedge knocked out of the rim (its faces take slot 0 = the white body)
    bm = bmesh.new()
    K.bm_cube(bm, (0.014, 0.014, 0.014), mat4((0.0425 * math.cos(0.8), 0.0425 * math.sin(0.8), 0.0985),
                                               (0, 45, math.degrees(0.8))))
    P.cut(mug, bm)
    # the handle: a D loop on the right
    P.tube('handle', [(0.0, -0.043, 0.079), (0.0, -0.062, 0.078), (0.0, -0.0705, 0.062), (0.0, -0.068, 0.034),
                      (0.0, -0.055, 0.024), (0.0, -0.043, 0.024)],
           0.0062, 'paint', segs=8, bend=0.014)
    P.views = [('a', 35, 22), ('b', 215, 28)]
    settle(P, cx=0.0, cy=0.0)


def junk_plate(P):
    """An enamel plate: a flat well, a sloping wall up to the rim, the rolled edge in the dark band colour
    (paint_b), a chip knocked out of the rim with the black iron showing (trim)."""
    P.ao_distance = 0.02
    T, W, Bd = 0, 1, 2
    # from the middle of the underside out (the foot ring), round the rolled rim and back in over the top
    prof = [(0.0, 0.0032, W), (0.0595, 0.0032, W), (0.0632, 0.0, W), (0.0702, 0.0, W), (0.0752, 0.0044, W),
            (0.0935, 0.0122, W), (0.1062, 0.0162, Bd), (0.1155, 0.0154, Bd), (0.1202, 0.0164, Bd),
            (0.1214, 0.0198, Bd), (0.119, 0.0232, Bd), (0.1145, 0.0232, Bd), (0.1085, 0.0204, W), (0.099, 0.0188, W),
            (0.091, 0.0168, W), (0.073, 0.0086, W), (0.066, 0.0072, W), (0.0, 0.0072, W)]
    plate = lathe_mm(P, 'plate', prof, ['trim', 'paint', 'paint_b'], segs=36, sharp=40.0)
    a = 0.6
    bm = bmesh.new()
    K.bm_sphere(bm, 0.0095, 10, 6, matrix=mat4((0.1265 * math.cos(a), 0.1265 * math.sin(a), 0.0205),
                                               (0, 0, math.degrees(a)), (1.0, 0.8, 1.25)))
    P.cut(plate, bm)
    # flaked enamel round the chip: black patches on the rim
    for (aa, rr, s) in ((a + 0.1, 0.104, 1.0), (a - 0.12, 0.101, 0.7)):
        poly = [(0.0085 * s * math.cos(TAU * i / 8) * (1 + 0.3 * math.sin(i * 2.9)),
                 0.0055 * s * math.sin(TAU * i / 8) * (1 + 0.3 * math.cos(i * 2.1))) for i in range(8)]
        bm = bmesh.new()
        K.bm_prism(bm, poly, 0.0008, matrix=mat4((rr * math.cos(aa), rr * math.sin(aa), 0.0197),
                                                 (0, -11, math.degrees(aa))))
        P.mesh('flake', bm, 'trim', bev=None)
    P.views = [('a', 35, 38), ('b', 215, 30)]
    settle(P, cx=0.0, cy=0.0)


def junk_cone(P):
    """A traffic cone: a one-piece moulding, its square base with rounded corners and a raised collar round the
    foot of the cone, two reflective collars (paint_b), the open rounded top."""
    P.ao_distance = 0.08
    Hb = 0.03
    P.prism('base', K.rounded_rect(0.30, 0.30, 0.04, seg=4), Hb, (0, 0, Hb / 2), 'paint', bev=0.006, segs=2)
    z0, z1, ra, rb = 0.05, 0.52, 0.122, 0.024

    def rc(z):
        return ra + (rb - ra) * (z - z0) / (z1 - z0)

    P.lathe('cone', [(0.0, 0.028), (0.139, 0.028), (0.14, 0.033), (0.132, 0.041), (0.124, 0.047), (rc(z0), z0),
                     (rc(0.3), 0.3), (rb, z1), (0.0225, 0.5265), (0.0178, 0.528), (0.0158, 0.522), (0.0158, 0.5),
                     (0.0, 0.5)], material='paint', segs=32, sharp=40.0)
    for (za, zb) in ((0.235, 0.29), (0.355, 0.445)):
        P.lathe('band', [(rc(za) - 0.002, za), (rc(za) + 0.0016, za + 0.002), (rc(zb) + 0.0016, zb - 0.002),
                         (rc(zb) - 0.002, zb)], material='paint_b', segs=32, loop=True, sharp=50.0)
    P.views = [('a', 35, 16), ('b', 215, 20)]
    settle(P, cx=0.0, cy=0.0)


def junk_vinyl(P):
    """A long-player: the square card sleeve (paint, with a printed circle and band in paint_b), the black record
    (trim) half slid out of its open side, its centre label (paint_b) round the spindle hole."""
    P.ao_distance = 0.012
    S, h = 0.31, 0.006
    P.box('sleeve', (S, S, h), (0, 0, h / 2), 'paint', bev=0.0016, segs=2)
    P.box('slit', (0.0008, S - 0.012, 0.0018), (S / 2 + 0.0002, 0, 0.003), 'trim', bev=None)
    # the art: a big printed disc and a band across the cover
    P.cyl('art_disc', 0.085, 0.0008, (-0.03, 0.03, h + 0.0004), 'paint_b', segs=36, bev=None)
    P.cyl('art_dot', 0.03, 0.0008, (-0.03, 0.03, h + 0.0012), 'paint', segs=24, bev=None)
    P.box('art_band', (0.03, S - 0.06, 0.0008), (0.105, 0.0, h + 0.0004), 'paint_b', bev=None)
    # ring wear where the record usually sits
    P.torus('ring_wear', 0.142, 0.0016, loc=(0.0, 0.0, h - 0.001), segs=40, rsegs=4, material='paint')
    L, V_ = 1, 0
    zt, zb = 0.0041, 0.0019
    # a closed section: in over the top from the edge, down the spindle hole, out under the bottom, up the edge
    prof = [(0.15, zt - 0.0006, V_), (0.1478, zt + 0.0002, V_), (0.145, zt - 0.0004, V_), (0.093, zt - 0.0004, V_),
            (0.0915, zt - 0.0009, V_), (0.0895, zt - 0.0009, V_), (0.088, zt - 0.0004, V_), (0.0508, zt - 0.0004, V_),
            (0.05, zt, L), (0.0036, zt, L), (0.0036, zb, L), (0.05, zb, V_), (0.0508, zb + 0.0004, V_),
            (0.145, zb + 0.0004, V_), (0.1478, zb - 0.0002, V_), (0.15, zb + 0.0006, V_)]
    lathe_mm(P, 'record', prof, ['trim', 'paint_b'], segs=24, angle=math.radians(204), start=math.radians(-102),
             loop=True, matrix=Matrix.Translation((S / 2, 0.0, 0.0)), sharp=40.0)
    P.views = [('a', 35, 40), ('b', 215, 34)]
    settle(P)


# ------------------------------------------------------------------------------------------------ hats

def wear_cap(P):
    """A six-panel baseball cap lying on its rim: the crown (paint) with its seams, the button on top and the
    stitched eyelets, the opening at the back over its strap (paint_b), the curved brim (paint_b)."""
    P.ao_distance = 0.03
    prof = [(0.096, 0.0), (0.0963, 0.022), (0.09, 0.055), (0.073, 0.085), (0.041, 0.105), (0.0, 0.111)]

    def r_at(z):
        for (ra, za), (rb, zb) in zip(prof[:-1], prof[1:]):
            if za <= z <= zb:
                return ra + (rb - ra) * (z - za) / (zb - za)
        return 0.0

    crown = P.lathe('crown', K.shell_profile(prof, 0.0035), material='paint', segs=20, loop=True, sharp=50.0)
    arch = [(-0.03, -0.01), (0.03, -0.01), (0.03, 0.02)] + \
           [(0.03 * math.cos(a), 0.02 + 0.03 * math.sin(a)) for a in (0.5, 1.05, 1.57, 2.09, 2.64)] + [(-0.03, 0.02)]
    bm = bmesh.new()
    K.bm_prism(bm, arch, 0.05, matrix=mat4((-0.095, 0.0, 0.0), (90, 0, 90)))
    P.cut(crown, bm)
    P.box('strap', (0.006, 0.074, 0.011), (-0.0955, 0.0, 0.0075), 'paint_b', bev=0.0018, segs=1)
    P.box('strap_tab', (0.004, 0.016, 0.014), (-0.0985, 0.012, 0.0085), 'trim', bev=0.0012, segs=1)
    for k in range(6):
        a = math.radians(60 * k)
        top = 0.06 if k == 3 else 0.0
        pts = [V((r_at(z) * 1.012 * math.cos(a), r_at(z) * 1.012 * math.sin(a), z)) for z in
               (0.004 if k else 0.014, 0.022, 0.055, 0.085, 0.105) if z >= top]
        P.tube('seam', pts, 0.002, 'paint', segs=4, bend=0.0, sharp=70.0)
        b = a + math.radians(30)
        z = 0.072
        nrm = V((0.86 * math.cos(b), 0.86 * math.sin(b), 0.51))
        P.cyl('eyelet', 0.0034, 0.0016, tuple(V((r_at(z) * math.cos(b), r_at(z) * math.sin(b), z)) + nrm * 0.0004),
              'trim', axis=nrm, segs=6, bev=None)
    P.sphere('button', 0.0095, (0.0, 0.0, 0.1105), 'paint', u=10, v=5, scale=(1, 1, 0.55))
    # the brim: strongly arched across, dipping a little towards its edge, its lowest points on the table
    th0 = math.radians(78)
    rings = []
    for i in range(13):
        th = -th0 + 2 * th0 * i / 12
        d = V((math.cos(th), math.sin(th), 0.0))
        ell = 0.004 + 0.075 * max(0.0, math.cos(th / th0 * math.pi / 2)) ** 0.55
        ring = []
        for (u, top) in ((0.0, True), (0.5, True), (1.0, True), (1.0, False), (0.5, False), (0.0, False)):
            p = d * (0.089 + ell * u)
            z = 0.022 * (1 - (p.y / 0.118) ** 2) - 0.008 * (ell * u / 0.079)
            ring.append(V((p.x, p.y, z if top else z - 0.0055)))
        rings.append(ring)
    low = min(q.z for ring in rings for q in ring)
    rings = [[q + V((0.0, 0.0, 0.0004 - low)) for q in ring] for ring in rings]
    bm = bmesh.new()
    vr, faces = K.bm_loft(bm, rings, cap_start=True, cap_end=True)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    P.mesh('brim', bm, 'paint_b', bev=0.0015, segs=1, sharp=50.0)
    P.views = [('a', 35, 28), ('b', 215, 30)]
    settle(P, cx=0.0, cy=0.0)


def wear_beanie(P):
    """A knit beanie lying soft and a little slumped: ribbed all round (the ribs dying out at the crown), the
    fold-up cuff and a lumpy pom-pom (paint_b)."""
    P.ao_distance = 0.03
    nr = 18
    segs = nr * 2
    prof = [(0.086, 0.038), (0.087, 0.06), (0.084, 0.085), (0.075, 0.108), (0.059, 0.127), (0.038, 0.14),
            (0.016, 0.146), (0.0, 0.147)]
    zmax = 0.147
    bm = bmesh.new()
    rings = K.bm_lathe(bm, prof, segs=segs)
    for k, ring in enumerate(rings):
        amp = 0.042 * (1 - (prof[k][1] / zmax) ** 3)
        for i, v in enumerate(ring):
            s = 1 + (amp if i % 2 == 0 else -amp)
            v.co.x *= s
            v.co.y *= s

    def slump(v):
        t = max(0.0, (v.co.z - 0.038) / (zmax - 0.038))
        v.co.x -= 0.03 * t * t
        v.co.y *= 1 + 0.05 * t
        v.co.z = 0.038 + (v.co.z - 0.038) * 0.86

    for v in bm.verts:
        slump(v)
    P.mesh('knit', bm, 'paint', sharp=60.0)
    cuff = [(0.0848, 0.0), (0.091, 0.0), (0.0955, 0.004), (0.0972, 0.02), (0.0972, 0.036), (0.0942, 0.0465),
            (0.0882, 0.0495), (0.0838, 0.0445), (0.0832, 0.004)]
    bm = bmesh.new()
    rings = K.bm_lathe(bm, cuff, segs=segs, loop=True)
    for k, ring in enumerate(rings):
        if 1 <= k <= 6:
            for i, v in enumerate(ring):
                s = 1 + (0.028 if i % 2 == 0 else -0.028)
                v.co.x *= s
                v.co.y *= s
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    P.mesh('cuff', bm, 'paint_b', sharp=60.0)
    bm = bmesh.new()
    K.bm_sphere(bm, 0.036, 12, 8)
    displace(bm, 0.0065, 85.0, seed=1.3)
    displace(bm, 0.003, 220.0, seed=4.2)
    top = V((-0.03, 0.0, 0.038 + (zmax - 0.038) * 0.86))
    K.bm_transform(bm, Matrix.Translation(top + V((-0.006, 0.0, 0.026))) @ Matrix.Diagonal((1.0, 1.0, 0.9, 1.0)))
    P.mesh('pompom', bm, 'paint_b', sharp=80.0)
    P.views = [('a', 35, 22), ('b', 215, 26)]
    settle(P, cx=0.0, cy=0.0)


def _fur_flap(bm, a0, a1, h, r_in=0.093, thick=0.034, n=11, lean=0.15, seed=0.0):
    """A fur flap turned up against a crown: a puffy curved roll round the crown from angle a0 to a1, h tall in
    the middle, its outside bulging, its top edge rounded off at the ends and scalloped."""
    rings = []
    for i in range(n):
        u = i / (n - 1)
        a = a0 + (a1 - a0) * u
        e = abs(2 * u - 1)
        full = math.sqrt(max(0.0, 1 - e ** 2.2))
        hh = h * (0.3 + 0.7 * full) * (1 + 0.06 * math.sin(u * math.pi * 5 + seed))
        tk = thick * (0.7 + 0.3 * full)
        sec = []
        for j in range(9):
            ph = math.pi * j / 8
            rho = r_in + tk * math.sin(ph) ** 0.6
            z = hh * (1 - math.cos(ph)) / 2
            sec.append(((rho + z * lean), z))
        rings.append([V((rho * math.cos(a), rho * math.sin(a), z)) for (rho, z) in sec])
    K.bm_loft(bm, rings, cap_start=True, cap_end=True)


def wear_trapper(P):
    """A trapper hat sitting on the table: a rounded crown (paint) in four panels with a button, the fur front
    and back flaps turned up into a thick lumpy ring round its base and the fur ear flaps turned up against its
    sides (paint_b), the ear flaps' ties knotted over the top."""
    P.ao_distance = 0.04
    prof = [(0.0, 0.004), (0.0925, 0.004), (0.095, 0.04), (0.092, 0.075), (0.082, 0.105), (0.064, 0.13),
            (0.038, 0.146), (0.0, 0.152)]
    P.lathe('crown', prof, material='paint', segs=20, sharp=50.0)
    for k in range(4):
        a = math.radians(45 + 90 * k)
        pts = [V((r * 1.012 * math.cos(a), r * 1.012 * math.sin(a), z)) for (r, z) in prof[3:7]] + [V((0, 0, 0.151))]
        P.tube('seam', pts, 0.002, 'paint', segs=4, bend=0.0, sharp=70.0)
    P.sphere('button', 0.008, (0.0, 0.0, 0.151), 'paint', u=8, v=4, scale=(1, 1, 0.6))
    bm = bmesh.new()
    n = 26
    path = [(0.108 * math.cos(TAU * i / n), 0.108 * math.sin(TAU * i / n), 0.034) for i in range(n)]
    K.bm_sweep(bm, path, 0.034, segs=8, closed=True)
    for v in bm.verts:
        v.co.z = 0.034 + (v.co.z - 0.034) * 0.92
    for sg in (-1, 1):
        _fur_flap(bm, math.radians(sg * 55), math.radians(sg * 125), 0.092, r_in=0.096, thick=0.04, n=9, lean=0.12,
                  seed=1.7 * sg)
    for v in bm.verts:
        if v.co.z < 0.0:
            v.co.z = 0.0
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    displace(bm, 0.008, 46.0, seed=0.3)
    displace(bm, 0.0035, 120.0, seed=5.3)
    P.mesh('fur', bm, 'paint_b', sharp=80.0)
    for sg in (-1, 1):
        pts = [V((0.0, sg * 0.124, 0.088)), V((0.0, sg * 0.09, 0.105)), V((0.0, sg * 0.067, 0.131)),
               V((0.0, sg * 0.041, 0.148)), V((0.0, sg * 0.01, 0.1555))]
        band(P, 'tie', pts, 0.006, 0.004, 'paint', p=2.4, n=6, smooth=2)
    P.sphere('knot', 0.0075, (0.0, 0.0, 0.156), 'paint', u=8, v=5)
    for sg in (-1, 1):
        P.tube('tie_end', [V((0.0, 0.0, 0.157)), V((0.012, sg * 0.01, 0.158)), V((0.026, sg * 0.016, 0.152))],
               0.002, 'paint', segs=5, bend=0.0)
    P.views = [('a', 35, 22), ('b', 215, 26)]
    settle(P, cx=0.0, cy=0.0)


# ------------------------------------------------------------------------------------------------ gloves and boots

def _glove(P, side, M):
    """One work glove lying palm down, built with its fingers along +X and the thumb out to `side` (+1 = +Y),
    then placed by M: a soft palm, five soft fingers with rounded tips, the ribbed knit cuff (paint_b)."""
    n0 = len(P.statics)
    P.pillow('palm', (0.105, 0.094, 0.021), (0.0, 0.0, 0.0105), 'paint', r=0.009, sub=1, taper=(0.96, 0.94))

    def tip(s):
        return 1.0 if s < 0.78 else max(0.32, math.sqrt(max(0.0, 1 - ((s - 0.78) / 0.22) ** 2)))

    for (y, ln, w, ang) in ((0.033, 0.072, 0.0215, 5.0), (0.011, 0.08, 0.0225, 1.5), (-0.011, 0.075, 0.0215, -2.0),
                            (-0.033, 0.061, 0.0195, -6.5)):
        d = V((math.cos(math.radians(ang * side)), math.sin(math.radians(ang * side)), 0.0))
        b = V((0.04, y * side, 0.0082))
        pts = [b + d * (ln * f) + V((0, 0, -0.0006 * f)) for f in (0.0, 0.42, 0.72, 0.86, 0.95, 1.0)]
        P.tube('finger', pts, 1.0, 'paint', profile=superellipse(0.0078, w / 2, 8, 2.4), radius_fn=tip, bend=0.0,
               sharp=70.0)
    d = V((math.cos(math.radians(50)), math.sin(math.radians(50)) * side, 0.0))
    b = V((-0.006, 0.03 * side, 0.0085))
    pts = [b + d * (0.066 * f) + V((0, 0, -0.0008 * f)) for f in (0.0, 0.4, 0.7, 0.86, 0.95, 1.0)]
    P.tube('thumb', pts, 1.0, 'paint', profile=superellipse(0.0085, 0.0125, 8, 2.4), radius_fn=tip, bend=0.0,
           sharp=70.0)
    band(P, 'cuff', [V((-0.044, 0.0, 0.0108)), V((-0.104, 0.0, 0.0118))], 0.1, 0.023, 'paint_b', p=3.0, n=20,
         rib=0.05, smooth=0)
    for o in P.statics[n0:]:
        o.data.transform(M)


def wear_gloves(P):
    """A pair of work gloves lying flat, palms down, side by side with their thumbs crossed (the left glove's
    edge lying over the right one's thumb), the knit cuffs in paint_b."""
    P.ao_distance = 0.02
    _glove(P, 1, Matrix.Translation((0.0, -0.05, 0.0)) @ Matrix.Rotation(math.radians(-7), 4, 'Z'))
    tilt = Matrix.Translation((0.0, 0.047, 0.0)) @ Matrix.Rotation(math.radians(-10), 4, 'X') @         Matrix.Translation((0.0, -0.047, 0.0))
    _glove(P, -1, Matrix.Translation((0.016, 0.046, 0.0)) @ Matrix.Rotation(math.radians(8), 4, 'Z') @ tilt)
    P.views = [('a', 35, 46), ('b', 215, 40)]
    settle(P)


BOOT = [  # x, half-width at the welt, top of the upper, top of the sole, squareness of the upper's section
    (-0.146, 0.016, 0.152, 0.03, 4.0),
    (-0.14, 0.032, 0.158, 0.03, 5.0),
    (-0.125, 0.041, 0.16, 0.03, 6.0),
    (-0.1, 0.043, 0.16, 0.03, 6.0),
    (-0.065, 0.042, 0.16, 0.03, 6.0),
    (-0.03, 0.042, 0.156, 0.025, 5.0),
    (0.0, 0.045, 0.138, 0.022, 4.0),
    (0.03, 0.05, 0.116, 0.022, 3.4),
    (0.06, 0.053, 0.096, 0.022, 3.0),
    (0.09, 0.052, 0.082, 0.023, 2.8),
    (0.115, 0.046, 0.072, 0.025, 2.6),
    (0.132, 0.036, 0.06, 0.028, 2.4),
    (0.142, 0.022, 0.048, 0.031, 2.2),
    (0.147, 0.008, 0.038, 0.033, 2.2),
]


def _boot_at(x):
    for a, b in zip(BOOT[:-1], BOOT[1:]):
        if a[0] <= x <= b[0]:
            u = (x - a[0]) / (b[0] - a[0])
            return [pa + (pb - pa) * u for pa, pb in zip(a[1:], b[1:])]
    return list((BOOT[0] if x < BOOT[0][0] else BOOT[-1])[1:])


def _boot_z(x, y):
    """Height of the boot's upper at (x, y)."""
    w, h, zb, p = _boot_at(x)
    wu = w * 0.94
    t = min(1.0, abs(y) / wu)
    return zb + (h - zb) * (1 - t ** p) ** (1 / p)


def _boot(P, M):
    """One lace-up work boot standing on its sole, toe +X, placed by M: the upper (paint) with its padded collar
    round the dark opening and the tongue, steel eyelets and criss-cross laces tied in a bow (paint_b), the rubber
    sole with a heel, an arch and lugs round its edge."""
    n0 = len(P.statics)
    rings = []
    for (x, w, h, zb, p) in BOOT:
        wu = w * 0.94
        ring = []
        for j in range(11):
            th = -math.pi / 2 + math.pi * j / 10
            y = wu * math.sin(th)
            ring.append(V((x, y, _boot_z(x, y))))
        rings.append(ring)
    bm = bmesh.new()
    K.bm_loft(bm, rings, cap_start=True, cap_end=True)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    P.mesh('upper', bm, 'paint', sharp=80.0)
    # the sole: heel block, the arch lifted between heel and tread, the toe sprung up
    rings = []
    for (x, w, h, zb, p) in BOOT:
        ws = w + 0.003
        arch = 0.007 * math.exp(-((x + 0.035) / 0.026) ** 2)
        zbot = arch + max(0.0, x - 0.12) * 0.25
        rings.append([V((x, -ws, zbot + 0.004)), V((x, -ws + 0.004, zbot)), V((x, ws - 0.004, zbot)),
                      V((x, ws, zbot + 0.004)), V((x, ws, zb + 0.002)), V((x, -ws, zb + 0.002))])
    bm = bmesh.new()
    K.bm_loft(bm, rings, cap_start=True, cap_end=True)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    P.mesh('sole', bm, 'rubber', sharp=45.0)
    bm = bmesh.new()
    for x in (-0.13, -0.1, -0.072, 0.02, 0.05, 0.08, 0.108):
        w, h, zb, p = _boot_at(x)
        for sg in (-1, 1):
            K.bm_cube(bm, (0.013, 0.007, 0.012), mat4((x, sg * (w + 0.0035), 0.006)))
    for (x, y, rz) in ((-0.147, 0.0, 90), (0.14, 0.0, 90)):
        K.bm_cube(bm, (0.012, 0.03, 0.012), mat4((x, y, 0.006 + (0.004 if x > 0 else 0.0))))
    P.mesh('lugs', bm, 'rubber', sharp=45.0)
    # the collar round the opening, the dark inside, the tongue
    oc = V((-0.088, 0.0, 0.0))
    pts = []
    for i in range(14):
        a = TAU * i / 14
        x, y = oc.x + 0.05 * math.cos(a), 0.033 * math.sin(a)
        pts.append(V((x, y, _boot_z(x, y) + 0.002)))
    P.tube('collar', pts, 0.0075, 'paint', segs=5, closed=True, sharp=70.0)
    bm = bmesh.new()
    ring = []
    for i in range(14):
        a = TAU * i / 14
        x, y = oc.x + 0.046 * math.cos(a), 0.029 * math.sin(a)
        ring.append(bm.verts.new((x, y, _boot_z(x, y) + 0.0035)))
    f = bm.faces.new(ring)
    bmesh.ops.poke(bm, faces=[f])
    for v in bm.verts:
        v.co.z = _boot_z(v.co.x, v.co.y) + 0.0035
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    P.mesh('opening', bm, 'trim', sharp=70.0)
    band(P, 'tongue', [V((0.0, 0.0, _boot_z(0.0, 0.0) - 0.002)), V((-0.026, 0.0, 0.158)), V((-0.04, 0.0, 0.166))],
         0.042, 0.008, 'paint', p=3.0, n=8, smooth=2)
    # eyelets and the criss-cross laces up the instep, the bow at the top
    xs = (0.048, 0.024, 0.0, -0.024)
    ye = 0.022
    bm = bmesh.new()
    for x in xs:
        for sg in (-1, 1):
            y = sg * ye
            dz_dy = (_boot_z(x, y + 0.002) - _boot_z(x, y - 0.002)) / 0.004
            dz_dx = (_boot_z(x + 0.002, y) - _boot_z(x - 0.002, y)) / 0.004
            nrm = V((-dz_dx, -dz_dy, 1.0)).normalized()
            K.bm_cyl(bm, 0.0042, 0.003, segs=6, matrix=Matrix.Translation((x, y, _boot_z(x, y) + 0.0006)) @
                     K.axis_matrix(nrm))
    P.mesh('eyelets', bm, 'steel', sharp=50.0)

    def lace(p0, p1):
        m = (p0 + p1) / 2
        m.z = _boot_z(m.x, m.y) + 0.0045
        P.tube('lace', [p0, m, p1], 0.0027, 'paint_b', segs=5, bend=0.0, sharp=70.0)

    def at(x, y):
        return V((x, y, _boot_z(x, y) + 0.0025))

    lace(at(xs[0], -ye), at(xs[0], ye))
    for x0, x1 in zip(xs[:-1], xs[1:]):
        lace(at(x0, -ye), at(x1, ye))
        lace(at(x0, ye), at(x1, -ye))
    bx = xs[-1] - 0.006
    bz = _boot_z(bx, 0.0) + 0.004
    for sg in (-1, 1):
        P.tube('bow', [V((bx, sg * 0.004, bz)), V((bx - 0.006, sg * 0.014, bz + 0.006)), V((bx - 0.016, sg * 0.02, bz + 0.005)),
                       V((bx - 0.017, sg * 0.01, bz + 0.002)), V((bx - 0.004, sg * 0.003, bz))], 0.0027, 'paint_b', segs=5,
               bend=0.0, sharp=70.0)
        P.tube('lace_end', [V((bx, sg * 0.003, bz)), V((bx + 0.006, sg * 0.016, bz - 0.004)),
                            V((bx + 0.004, sg * 0.03, bz - 0.022))], 0.0027, 'paint_b', segs=5, bend=0.0, sharp=70.0)
    P.sphere('bow_knot', 0.0055, (bx, 0.0, bz + 0.001), 'paint_b', u=8, v=4)
    for o in P.statics[n0:]:
        o.data.transform(M)


def wear_shoes(P):
    """A pair of lace-up work boots standing side by side, one a little ahead of the other and both toed out."""
    P.ao_distance = 0.04
    _boot(P, Matrix.Translation((0.0, 0.059, 0.0)) @ Matrix.Rotation(math.radians(4), 4, 'Z'))
    _boot(P, Matrix.Translation((0.014, -0.059, 0.0)) @ Matrix.Rotation(math.radians(-5), 4, 'Z'))
    P.views = [('a', 35, 22), ('b', 215, 24)]
    settle(P)


# ------------------------------------------------------------------------------------------------ gear

def hammer(P):
    """A sledgehammer lying on the ground along X: the long oval handle (paint) swelling at the knob and at the
    shoulder, the ribbed rubber grip at the end (paint_b), the heavy double-faced steel head on its side with
    chamfered edges and faces, the steel collar below it and the wedge in the handle's end."""
    P.ao_distance = 0.05
    hx = 0.41
    a, b = V((-0.45, 0.0, 0.0172)), V((0.455, 0.0, 0.04))
    n = 14
    pts = [a + (b - a) * (i / (n - 1)) for i in range(n)]
    girth_tab = [(0.0, 1.16), (0.03, 1.12), (0.1, 1.0), (0.45, 0.88), (0.8, 0.94), (0.86, 1.0), (1.0, 1.0)]

    def girth(s):
        for (sa, ga), (sb, gb) in zip(girth_tab[:-1], girth_tab[1:]):
            if sa <= s <= sb:
                return ga + (gb - ga) * (s - sa) / (sb - sa)
        return 1.0

    oval = superellipse(0.0145, 0.0185, 12, 2.2)
    P.tube('handle', pts, 1.0, 'paint', profile=oval, radius_fn=girth, bend=0.0, sharp=60.0)
    # the grip: a rubber sleeve with rings over the end of the handle
    s0, s1 = 0.012, 0.24
    gp = [a + (b - a) * (s0 + (s1 - s0) * i / 16) for i in range(17)]

    def grip(s):
        sg = s0 + (s1 - s0) * s
        ring = 1.0 + 0.05 * math.cos(TAU * 8 * s) if 0.06 < s < 0.94 else 1.0
        return girth(sg) * 1.1 * ring

    P.tube('grip', gp, 1.0, 'paint_b', profile=oval, radius_fn=grip, bend=0.0, sharp=60.0)
    # the head: octagonal in section, chamfered towards both faces, a little waisted either side of the eye
    A, C = 0.04, 0.011
    octa = [(A, -A + C), (A, A - C), (A - C, A), (-A + C, A), (-A, A - C), (-A, -A + C), (-A + C, -A), (A - C, -A)]
    rings = []
    for (y, s) in ((-0.1, 0.84), (-0.095, 0.97), (-0.088, 1.0), (-0.035, 0.955), (0.0, 1.0), (0.035, 0.955),
                   (0.088, 1.0), (0.095, 0.97), (0.1, 0.84)):
        rings.append([V((hx + px * s, y, 0.04 + pz * s)) for (px, pz) in octa])
    bm = bmesh.new()
    K.bm_loft(bm, rings, cap_start=True, cap_end=True)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    P.mesh('head', bm, 'steel', bev=0.0022, segs=2, bev_angle=20.0, sharp=35.0)
    d = (b - a).normalized()
    c0 = a + d * ((0.334 - a.x) / d.x)
    P.lathe('collar', [(0.0172, 0.0), (0.0212, 0.0), (0.0228, 0.004), (0.0228, 0.03), (0.0212, 0.0335),
                       (0.0172, 0.0335)], loc=tuple(c0), material='steel', axis=d, segs=14, loop=True, sharp=50.0)
    P.box('wedge', (0.0035, 0.03, 0.0045), (0.4568, 0.0, 0.04), 'steel', bev=0.0008, segs=1)
    P.views = [('a', 35, 26), ('b', 215, 30)]
    settle(P)


def _wrench(P, x0, x1, y, z):
    """A combination spanner lying flat from x0 (ring end) to x1 (open end)."""
    L = x1 - x0
    P.box('wrench_shank', (L - 0.03, 0.015, 0.005), ((x0 + x1) / 2, y, z + 0.0025), 'steel', bev=0.0015, segs=1)
    pts = [(0.019 * math.cos(math.radians(a)), 0.019 * math.sin(math.radians(a))) for a in
           (35, 70, 110, 150, 180, 210, 250, 290, 325)]
    pts += [(0.008, -0.0075), (-0.002, -0.0075), (-0.002, 0.0075), (0.008, 0.0075)]
    bm = bmesh.new()
    K.bm_prism(bm, ccw(pts), 0.006, matrix=mat4((x1 - 0.016, y, z + 0.003), (0, 0, 15)))
    P.mesh('wrench_jaw', bm, 'steel', bev=0.0015, segs=1)
    P.lathe('wrench_ring', [(0.0095, -0.0035), (0.017, -0.0035), (0.017, 0.0035), (0.0095, 0.0035)],
            loc=(x0 + 0.017, y, z + 0.0035), material='steel', segs=12, loop=True, sharp=50.0)


def repair(P):
    """A hard tool case lying flat: the base and the lid with the band (paint_b) round the split line, paint_b caps
    on the lid's corners, two latches on the front, hinges at the back, the carrying handle folded down on the
    lid between a combination spanner and a screwdriver held on by rubber straps."""
    P.ao_distance = 0.04
    L, W = 0.42, 0.22

    def gbox(name, size, loc, material, cuts=1, bev=0.016, segs=2):
        """A box with its faces split into a grid (so the AO is sampled across them, not just at the corners)."""
        bm = bmesh.new()
        K.bm_cube(bm, size, mat4(loc))
        bmesh.ops.subdivide_edges(bm, edges=bm.edges[:], cuts=cuts, use_grid_fill=True)
        return P.mesh(name, bm, material, bev=bev, segs=segs)

    hb, hl = 0.096, 0.054
    gbox('base', (L, W, hb), (0, 0, hb / 2), 'paint')
    gbox('lid', (L, W, hl), (0, 0, hb + 0.002 + hl / 2), 'paint', cuts=2)
    P.box('band', (L + 0.006, W + 0.006, 0.014), (0, 0, hb + 0.001), 'paint_b', bev=0.004, segs=2)
    zt = hb + 0.002 + hl
    for sx in (-1, 1):
        for sy in (-1, 1):
            P.box('corner', (0.05, 0.05, 0.03), (sx * (L / 2 - 0.02), sy * (W / 2 - 0.02), zt - 0.012), 'paint_b',
                  bev=0.012, segs=1)
    for sx in (-1, 1):
        x = sx * 0.13
        P.box('latch_base', (0.034, 0.008, 0.034), (x, -W / 2 - 0.003, hb - 0.012), 'trim', bev=0.003, segs=1)
        P.box('latch', (0.026, 0.007, 0.036), (x, -W / 2 - 0.0075, hb + 0.002), 'steel', rot=(-6, 0, 0), bev=0.0025,
              segs=1)
        P.box('latch_hook', (0.022, 0.006, 0.01), (x, -W / 2 - 0.0025, hb + 0.022), 'steel', bev=0.0018, segs=1)
        P.cyl('hinge', 0.0065, 0.05, (sx * 0.12, W / 2 + 0.004, hb + 0.001), 'steel', axis='X', segs=8, bev=None)
    for sx in (-1, 1):
        P.box('handle_lug', (0.02, 0.026, 0.012), (sx * 0.078, -0.005, zt + 0.005), 'paint', bev=0.003, segs=1)
    P.tube('handle_bar', [V((-0.078, -0.005, zt + 0.006)), V((-0.075, -0.022, zt + 0.007)), V((-0.066, -0.03, zt + 0.007)),
                          V((0.066, -0.03, zt + 0.007)), V((0.075, -0.022, zt + 0.007)), V((0.078, -0.005, zt + 0.006))],
           0.0055, 'trim', segs=8, bend=0.0, sharp=60.0)
    P.lathe('handle_grip', [(0.0, -0.05), (0.008, -0.05), (0.0105, -0.044), (0.011, 0.0), (0.0105, 0.044),
                            (0.008, 0.05), (0.0, 0.05)], loc=(0.0, -0.03, zt + 0.011), material='trim', axis='X',
            segs=10, sharp=50.0)
    _wrench(P, -0.105, 0.105, 0.066, zt)
    P.lathe('driver_handle', [(0.0, 0.0), (0.0105, 0.002), (0.0125, 0.016), (0.0125, 0.066), (0.0105, 0.08),
                              (0.006, 0.088), (0.0, 0.089)], loc=(-0.112, -0.074, zt + 0.0125), material='paint_b',
            axis='X', segs=8, sharp=50.0)
    P.cyl('driver_shaft', 0.0036, 0.112, (0.031, -0.074, zt + 0.0125), 'steel', axis='X', segs=8, bev=None)
    P.box('driver_tip', (0.014, 0.0075, 0.0022), (0.091, -0.074, zt + 0.0125), 'steel', bev=0.0006, segs=1)
    for (x, y, hh, hw) in ((-0.05, 0.066, 0.006, 0.014), (0.05, 0.066, 0.006, 0.014), (-0.065, -0.074, 0.0255, 0.015),
                           (0.05, -0.074, 0.0165, 0.01)):
        pts = [V((x, y - hw - 0.006, zt + 0.0012)), V((x, y - hw, zt + hh * 0.75)), V((x, y - hw * 0.55, zt + hh + 0.002)),
               V((x, y + hw * 0.55, zt + hh + 0.002)), V((x, y + hw, zt + hh * 0.75)), V((x, y + hw + 0.006, zt + 0.0012))]
        band(P, 'strap', pts, 0.014, 0.003, 'rubber', p=4.0, n=8, smooth=0)
        for yy in (y - hw - 0.006, y + hw + 0.006):
            P.cyl('rivet', 0.0035, 0.002, (x, yy, zt + 0.0012), 'steel', segs=6, bev=None)
    P.views = [('a', 35, 32), ('b', 215, 32)]
    settle(P)


def flare_gun(P):
    """A chunky break-action flare pistol lying on its side: the fat barrel (paint) with its swelled muzzle and
    open bore, the frame and standing breech, the hinge pin, the hammer, the trigger in its guard, the rounded grip
    (paint_b) with a lanyard ring."""
    P.ao_distance = 0.03
    P.lathe('barrel', [(0.0, 0.0), (0.0172, 0.0), (0.0185, 0.004), (0.0185, 0.136), (0.0212, 0.14), (0.0216, 0.152),
                       (0.0196, 0.156), (0.0134, 0.156), (0.0128, 0.15), (0.0128, 0.124), (0.0, 0.124)],
            loc=(0.0, 0.0, 0.0), material='paint', axis='X', segs=16, sharp=45.0)
    P.box('rib', (0.11, 0.008, 0.006), (0.075, 0.0, 0.0195), 'paint', bev=0.002, segs=1)
    P.box('sight', (0.01, 0.007, 0.01), (0.143, 0.0, 0.0225), 'paint', bev=0.002, segs=1)
    P.box('frame', (0.092, 0.03, 0.032), (-0.012, 0.0, -0.026), 'paint', bev=0.005, segs=2)
    P.box('breech', (0.046, 0.032, 0.05), (-0.038, 0.0, -0.003), 'paint', bev=0.006, segs=2)
    P.cyl('hinge_pin', 0.0058, 0.037, (0.022, 0.0, -0.026), 'steel', axis='Y', segs=8, bev=None)
    P.box('latch', (0.016, 0.004, 0.012), (-0.008, 0.017, 0.004), 'trim', rot=(0, 20, 0), bev=0.0012, segs=1)
    P.box('hammer', (0.012, 0.011, 0.024), (-0.06, 0.0, 0.021), 'steel', rot=(0, -24, 0), bev=0.002, segs=1)
    P.box('hammer_spur', (0.012, 0.012, 0.005), (-0.068, 0.0, 0.032), 'steel', rot=(0, -8, 0), bev=0.0016, segs=1)
    # the grip, raked back, rounded, a little fuller at the butt, its lanyard ring
    P.pillow('grip', (0.042, 0.033, 0.094), (-0.048, 0.0, -0.08), 'paint_b', rot=(0, -16, 0), r=0.011, sub=1,
             taper=(0.86, 0.96))
    P.pillow('butt', (0.05, 0.036, 0.016), (-0.06, 0.0, -0.124), 'paint_b', rot=(0, -16, 0), r=0.006, sub=1)
    P.torus('lanyard', 0.0075, 0.002, loc=(-0.07, 0.0, -0.139), axis='Y', segs=10, rsegs=4, material='steel')
    pts = [V((0.014, 0.0, -0.04)), V((0.016, 0.0, -0.058)), V((0.004, 0.0, -0.07)), V((-0.018, 0.0, -0.069)),
           V((-0.032, 0.0, -0.058))]
    band(P, 'guard', pts, 0.012, 0.005, 'paint', p=3.0, n=6, smooth=2)
    P.tube('trigger', [V((-0.002, 0.0, -0.04)), V((-0.002, 0.0, -0.05)), V((-0.008, 0.0, -0.059))], 1.0, 'trim',
           profile=superellipse(0.003, 0.0035, 6, 3.0), bend=0.0, sharp=60.0)
    m = Matrix.Rotation(math.radians(-3.0), 4, 'X') @ Matrix.Rotation(math.radians(90), 4, 'X')
    for o in P.statics:
        o.data.transform(m)
    P.views = [('a', 35, 36), ('b', 215, 36)]
    settle(P)


# ------------------------------------------------------------------------------------------------ more small junk

def junk_ball(P):
    """An old half-deflated ball sagging on the ground: a panelled cover in two colours (three strips to a panel,
    the middle one paint_b), the seams pressed in, the top caved in and the bottom spread out."""
    P.ao_distance = 0.03
    R, n = 0.11, 9
    bm = bmesh.new()
    verts = {}

    def vert(p):
        key = tuple(round(c, 5) for c in p)
        if key not in verts:
            q = V(p)
            seam = sum(1 for c in p if abs(abs(c) - 1) < 1e-6) >= 2
            for k in range(3):
                if abs(abs(p[k]) - 1) < 1e-6 and abs(abs(p[(k + 2) % 3]) - 1 / 3) < 1e-6:
                    seam = True
            verts[key] = bm.verts.new(q.normalized() * (R * (0.982 if seam else 1.0)))
        return verts[key]

    for ax in range(3):
        a1, a2 = (ax + 1) % 3, (ax + 2) % 3
        for sgn in (-1, 1):
            for i in range(n):
                for j in range(n):
                    quad = []
                    for (di, dj) in ((0, 0), (1, 0), (1, 1), (0, 1)):
                        p = [0.0, 0.0, 0.0]
                        p[ax] = float(sgn)
                        p[a1] = -1 + 2 * (i + di) / n
                        p[a2] = -1 + 2 * (j + dj) / n
                        quad.append(vert(p))
                    if sgn < 0:
                        quad.reverse()
                    f = bm.faces.new(quad)
                    f.material_index = 1 if j // (n // 3) == 1 else 0
    c = V((-0.35, 0.25, 1.0)).normalized()
    cos0 = math.cos(math.radians(58))
    for v in bm.verts:
        d = v.co.normalized()
        rr = v.co.length
        t = (d.dot(c) - cos0) / (1 - cos0)
        if t > 0:
            t = min(1.0, t)
            rr -= R * 0.62 * (t * t * (3 - 2 * t))
        p = d * rr
        p.z *= 0.84
        bulge = 1 + 0.1 * max(0.0, -p.z / R)
        p.x *= bulge
        p.y *= bulge
        if p.z < -R * 0.62:
            p.z = -R * 0.62 + (p.z + R * 0.62) * 0.22
        v.co = p
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    P.mesh('ball', bm, ['paint', 'paint_b'], sharp=70.0)
    P.views = [('a', 35, 26), ('b', 215, 30)]
    settle(P)


def junk_pillow(P):
    """A bed pillow lying on the floor: the kit's pillow, its finished mesh squeezed thinner towards the edge (thick
    in the middle) with a soft dent where a head lay, the underside fuller so that it lies flat, the piped seam
    (paint_b) running round the edge."""
    P.ao_distance = 0.06
    L, W, H = 0.62, 0.42, 0.15
    zc = H / 2
    o = P.pillow('pillow', (L, W, H), (0, 0, zc), 'paint', r=0.045, sub=2)
    P._apply(o)
    me = o.data
    hx = max(abs(v.co.x) for v in me.vertices)
    hy = max(abs(v.co.y) for v in me.vertices)
    for v in me.vertices:
        d = min(1.0, max(abs(v.co.x) / hx, abs(v.co.y) / hy))
        k = max(0.0, 1 - d ** 3) ** 0.6
        f = 0.2 + 0.8 * k if v.co.z > zc else 0.55 + 0.45 * k
        v.co.z = zc + (v.co.z - zc) * f
        if v.co.z > zc:
            v.co.z -= 0.022 * math.exp(-((v.co.x - 0.05) ** 2 + (v.co.y - 0.02) ** 2) / 0.11 ** 2) * k
    me.update()
    rim = [v.co for v in me.vertices if max(abs(v.co.x) / hx, abs(v.co.y) / hy) > 0.985]
    zp = sum(p.z for p in rim) / len(rim)
    s = max(abs(v.co.x) + abs(v.co.y) for v in me.vertices)
    rc = max(0.02, min(0.12, (hx + hy - s) / (2 - math.sqrt(2))))
    path = [(x, y, zp) for (x, y) in densify2d(K.rounded_rect(2 * hx - 0.002, 2 * hy - 0.002, rc, seg=4), 0.06)]
    P.tube('piping', path, 0.0075, 'paint_b', segs=8, closed=True, sharp=70.0)
    P.views = [('a', 35, 16), ('b', 125, 22)]
    settle(P)


def junk_pillow_s(P):
    """A square sofa cushion: plump in the middle with pointed corners, buttoned through in five places (each a
    paint_b button in a pinched dimple), a tassel on every corner (paint_b)."""
    P.ao_distance = 0.05
    L, H = 0.40, 0.12
    ts = [-1.0, -0.96, -0.89, -0.8, -0.68, -0.55, -0.47, -0.4, -0.33, -0.2, -0.07, 0.0, 0.07, 0.2, 0.33, 0.4, 0.47,
          0.55, 0.68, 0.8, 0.89, 0.96, 1.0]
    tufts = [(0.0, 0.0), (0.4, 0.4), (-0.4, 0.4), (0.4, -0.4), (-0.4, -0.4)]

    def height(u, v):
        f = (max(0.0, 1 - abs(u) ** 4) ** 0.42) * (max(0.0, 1 - abs(v) ** 4) ** 0.42)
        z = (H / 2) * f
        for (tu, tv) in tufts:
            d = math.hypot(u - tu, v - tv) / 0.15
            z -= 0.03 * math.exp(-(d ** 2.4) * 1.6) * f
        return z

    n = len(ts)
    bm = bmesh.new()
    top, bot = {}, {}
    for i, u in enumerate(ts):
        for j, w in enumerate(ts):
            edge = i in (0, n - 1) or j in (0, n - 1)
            x, y = u * L / 2, w * L / 2
            top[i, j] = bm.verts.new((x, y, H / 2 + height(u, w)))
            bot[i, j] = top[i, j] if edge else bm.verts.new((x, y, H / 2 - height(u, w)))
    for i in range(n - 1):
        for j in range(n - 1):
            bm.faces.new((top[i, j], top[i + 1, j], top[i + 1, j + 1], top[i, j + 1]))
            bm.faces.new((bot[i, j + 1], bot[i + 1, j + 1], bot[i + 1, j], bot[i, j]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    P.mesh('cushion', bm, 'paint', sharp=80.0)
    for (tu, tv) in tufts:
        x, y = tu * L / 2, tv * L / 2
        P.sphere('button', 0.0125, (x, y, H / 2 + height(tu, tv) + 0.0035), 'paint_b', u=10, v=5, scale=(1, 1, 0.55))
    for sx in (-1, 1):
        for sy in (-1, 1):
            d = V((sx, sy, 0.0)).normalized()
            c = V((sx * L / 2, sy * L / 2, H / 2)) + d * 0.004
            P.sphere('tassel_knob', 0.0085, tuple(c + d * 0.006), 'paint_b', u=8, v=5)
            P.lathe('tassel', [(0.0, 0.0), (0.0045, 0.0), (0.0075, 0.014), (0.011, 0.046), (0.0098, 0.056),
                               (0.0, 0.058)], loc=tuple(c + d * 0.012 - V((0, 0, 0.002))), material='paint_b',
                    axis=d + V((0, 0, -1.1)), segs=8, sharp=60.0)
    P.views = [('a', 35, 32), ('b', 215, 30)]
    settle(P)


def _sign_panel(P, M, Lp):
    """One leaf of the wet-floor sign in its own frame (u across, v up the slope, w out of its outer face), placed
    by M: the moulded panel with the handle slot cut through its top, the warning triangle and the slipping man
    raised on its outer face (paint_b), a rubber foot at each bottom corner."""
    n0 = len(P.statics)
    out = [(-0.15, 0.012), (-0.142, 0.0), (0.142, 0.0), (0.15, 0.012), (0.15, 0.3)]
    out += [(0.07 + 0.04 * math.cos(math.radians(a)), Lp - 0.04 + 0.04 * math.sin(math.radians(a)))
            for a in (-5, 30, 60, 90)]
    out += [(-0.07 - 0.04 * math.cos(math.radians(a)), Lp - 0.04 + 0.04 * math.sin(math.radians(a)))
            for a in (90, 60, 30, -5)]
    out += [(-0.15, 0.3)]
    T = 0.012
    bm = bmesh.new()
    K.bm_prism(bm, ccw(out), T)
    panel = P.mesh('panel', bm, 'paint', bev=0.004, segs=2)
    bm = bmesh.new()
    K.bm_prism(bm, ccw(K.rounded_rect(0.1, 0.026, 0.0129, seg=4)), 0.05, matrix=mat4((0.0, Lp - 0.05, 0.0)))
    P.cut(panel, bm)
    # the warning triangle: a closed band with rounded corners
    cy, side = Lp * 0.5, 0.2
    hgt = side * math.sqrt(3) / 2
    corners = [V((0.0, cy + hgt * 2 / 3, 0.0)), V((-side / 2, cy - hgt / 3, 0.0)), V((side / 2, cy - hgt / 3, 0.0))]
    path = []
    for i in range(3):
        p0, p1, p2 = corners[i - 1], corners[i], corners[(i + 1) % 3]
        a = p1 + (p0 - p1).normalized() * 0.016
        b = p1 + (p2 - p1).normalized() * 0.016
        for k in range(4):
            t = k / 3
            path.append(a * (1 - t) ** 2 + p1 * 2 * t * (1 - t) + b * t * t)
    zf = T / 2 + 0.0012
    path = [p + V((0, 0, zf)) for p in path]
    band(P, 'triangle', path, 0.015, 0.003, 'paint_b', p=4.0, n=8, smooth=0, closed=True)
    # the slipping man inside it
    o = V((0.006, cy - 0.006, zf))
    fs = 0.72
    P.cyl('head', 0.0135 * fs, 0.003, tuple(o + V((-0.026 * fs, 0.036 * fs, 0.0))), 'paint_b', axis='Z', segs=12,
          bev=None)
    for stroke in (((-0.019, 0.019), (0.004, -0.019)),                       # body, leaning back
                   ((0.004, -0.019), (0.028, -0.011), (0.05, 0.002)),         # the leg that kicks up
                   ((0.004, -0.019), (-0.001, -0.042), (0.016, -0.053)),      # the leg still down
                   ((-0.015, 0.01), (-0.042, 0.018), (-0.056, 0.038)),        # arm thrown back
                   ((-0.015, 0.01), (0.01, 0.022), (0.028, 0.036))):          # arm thrown forward
        pts = [o + V((sx * fs, sy * fs, 0.0)) for (sx, sy) in stroke]
        band(P, 'figure', pts, 0.0105, 0.003, 'paint_b', p=3.0, n=8, smooth=2)
    for su in (-1, 1):
        P.box('foot', (0.03, 0.022, 0.014), (su * 0.13, 0.005, 0.0), 'rubber', bev=0.003, segs=1)
    for o2 in P.statics[n0:]:
        o2.data.transform(M)
    if panel.name in P.cfg:
        for c in P.cfg[panel.name]['cutters']:
            c.data.transform(M)


def junk_sign_wet(P):
    """A yellow A-frame wet-floor sign standing open: two moulded leaves hinged at the top, the handle slot cut
    through both, the warning triangle and slipping man on both outer faces (paint_b)."""
    P.ao_distance = 0.06
    Ht, half = 0.61, 0.125
    Lp = math.hypot(Ht, half - 0.006)
    for sg in (-1, 1):
        s = V((-sg * (half - 0.006), 0.0, Ht)).normalized()
        u = V((0.0, sg * 1.0, 0.0))
        w = u.cross(s)
        m = Matrix((u, s, w)).transposed().to_4x4()
        m.translation = V((sg * half, 0.0, 0.0)) + w * 0.0065
        _sign_panel(P, m, Lp)
    P.cyl('hinge', 0.0085, 0.2, (0.0, 0.0, Ht + 0.004), 'paint', axis='Y', segs=12, bev=0.002, bsegs=1)
    P.views = [('a', 35, 16), ('b', 125, 18)]
    settle(P)


def junk_bag(P):
    """A full bin bag: a squat sack spread on the floor, lumpy with what is in it pushing out, creased up into its
    gathered neck, tied off in a knot with its two ears sticking up, a tie (paint_b) round the neck."""
    P.ao_distance = 0.08
    prof = [(r * (0.84 if r > 0.05 else 1.0), z) for (r, z) in
            [(0.0, 0.0), (0.17, 0.0), (0.212, 0.01), (0.232, 0.045), (0.24, 0.1), (0.238, 0.165), (0.226, 0.225),
             (0.2, 0.28), (0.16, 0.326), (0.112, 0.366), (0.07, 0.398), (0.044, 0.42), (0.03, 0.436), (0.026, 0.448)]]
    segs = 32
    bm = bmesh.new()
    rings = K.bm_lathe(bm, prof, segs=segs)
    for k, ring in enumerate(rings):
        z = prof[k][1]
        g = min(1.0, max(0.0, (z - 0.19) / 0.22)) ** 1.2
        for i, v in enumerate(ring):
            a = TAU * i / segs
            s = 1 + 0.2 * g * math.cos(6 * a + 0.4) + 0.06 * g * math.cos(4 * a + 1.1)
            v.co.x *= s
            v.co.y *= s
    lumps = [((x * 0.84, y * 0.84, z), amp * 0.9, rad) for ((x, y, z), amp, rad) in
             [((0.18, 0.12, 0.14), 0.05, 0.085), ((-0.2, 0.06, 0.1), 0.055, 0.09), ((0.03, -0.23, 0.12), 0.05, 0.085),
              ((-0.08, 0.21, 0.21), 0.042, 0.075), ((0.17, -0.14, 0.22), 0.04, 0.075),
              ((-0.16, -0.15, 0.24), 0.042, 0.07), ((0.1, 0.17, 0.28), 0.03, 0.06), ((0.23, -0.02, 0.06), 0.034, 0.07),
              ((-0.13, 0.18, 0.05), 0.032, 0.07), ((-0.05, -0.2, 0.3), 0.028, 0.06)]]
    bm.normal_update()
    for v in bm.verts:
        if v.co.z < 0.004:
            continue
        dz = 0.0
        for (c, amp, rad) in lumps:
            d = (V(c) - v.co).length / rad
            dz += amp * math.exp(-d ** 2.6)
        dz += 0.008 * noise(v.co, 22.0, 1.7)
        v.co += V(v.normal) * dz * min(1.0, v.co.z / 0.03)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    P.mesh('sack', bm, 'paint', sharp=70.0)
    neck = [(0.026, 0.441), (0.023, 0.458), (0.025, 0.474), (0.031, 0.486)]
    bm = bmesh.new()
    rings = K.bm_lathe(bm, neck, segs=12)
    for ring in rings:
        for i, v in enumerate(ring):
            s = 1 + (0.14 if i % 2 else -0.08)
            v.co.x *= s
            v.co.y *= s
    P.mesh('neck', bm, 'paint', sharp=70.0)
    P.torus('tie', 0.0275, 0.0062, loc=(0.0, 0.0, 0.46), segs=14, rsegs=6, material='paint_b')
    for sg in (-1, 1):
        P.tube('tie_end', [V((0.027, sg * 0.006, 0.46)), V((0.042, sg * 0.016, 0.454)), V((0.054, sg * 0.03, 0.438))],
               1.0, 'paint_b', profile=superellipse(0.0026, 0.0065, 6, 3.0), bend=0.0, sharp=60.0)
    bm = bmesh.new()
    K.bm_sphere(bm, 0.034, 10, 6, matrix=Matrix.Translation((0.0, 0.0, 0.498)) @ Matrix.Diagonal((1.0, 1.15, 0.8, 1.0)))
    displace(bm, 0.0065, 70.0, seed=3.3)
    P.mesh('knot', bm, 'paint', sharp=80.0)

    def ear_w(s):
        return max(0.1, 1 - s ** 1.5)

    for sg in (-1, 1):
        pts = [V((0.0, sg * 0.014, 0.502)), V((0.006, sg * 0.034, 0.514)), V((0.016, sg * 0.056, 0.528)),
               V((0.024, sg * 0.076, 0.534))]
        band(P, 'ear', pts, 0.05, 0.007, 'paint', p=2.4, n=8, radius_fn=ear_w, smooth=2)
    P.views = [('a', 35, 20), ('b', 215, 24)]
    settle(P, cx=0.0, cy=0.0)
# ------------------------------------------------------------------------------------------------ table

MODELS = {
    'wear_cap': wear_cap,
    'wear_beanie': wear_beanie,
    'wear_trapper': wear_trapper,
    'wear_jacket': wear_jacket,
    'wear_sweater_torn': wear_sweater_torn,
    'wear_padded': wear_padded,
    'wear_down': wear_down,
    'wear_pants': wear_pants,
    'wear_pants_snow': wear_pants_snow,
    'wear_shoes': wear_shoes,
    'wear_gloves': wear_gloves,
    'hammer': hammer,
    'repair': repair,
    'flare_gun': flare_gun,
    'junk_bucket': junk_bucket,
    'junk_bucket_paint': junk_bucket_paint,
    'junk_mug': junk_mug,
    'junk_plate': junk_plate,
    'junk_vinyl': junk_vinyl,
    'junk_ball': junk_ball,
    'junk_pillow': junk_pillow,
    'junk_pillow_s': junk_pillow_s,
    'junk_cone': junk_cone,
    'junk_sign_wet': junk_sign_wet,
    'junk_bag': junk_bag,
}


def _more_views(P, opts):
    """--views: the second preview view too (the kit's --toon renders only the first)."""
    if opts.get('views') and opts.get('toon') and not opts.get('norender'):
        views = getattr(P, 'views', None)
        if views and len(views) > 1:
            K.render_toon(P, views=views[1:])


def main(args):
    K.run(MODELS, args, out_dir=OUT, geo=False, after=_more_views)
