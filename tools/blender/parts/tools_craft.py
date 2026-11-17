"""
The crafting bench's hand tools as models: the three cleaning scrapers the bench makes (the cheap plastic one,
the stainless one, the brass one) and the bench's claw hammer:

    blender -b --factory-startup --python tools/blender/build.py -- parts/tools_craft [<kind>|all] [--toon]
        [--norender] [--stats] [--hi] [--views=yaw:pitch,...]

Writes public/models/modcar/tools/<kind>.glb (not parts_geo.json): root mesh PART lying in its natural resting
pose on the floor (each is modelled lying down, then laid on the face of its convex hull nearest to that pose
which holds its centre of mass), origin at the bottom centre, X along the tool's length with the working end at
+X; conventional material names only, AO in 'Col', <= 1500 triangles each. Markers (child empties, local +Z the
direction given): M_grip where the hand holds (+Z along the handle towards the working end), M_edge on the
scrapers at the middle of the blade's cutting edge (+Z the way the edge pushes), M_head on the hammer at the
centre of its striking face (+Z out of the face). `paint` / `paint_b` take the tool's colours (the brass
scraper's `paint` is gold). --toon renders every view (the kit does the first), --hi bigger ones.
"""
import math

import bmesh
from mathutils import Matrix

from parts import _kit as K
from parts._kit import V, mat4

OUT = 'public/models/modcar/tools'
TAU = math.tau

# for the centre of mass when a tool is laid down (g/cm3; paint is the plastic scraper's blade unless overridden)
DENSITY = {'steel': 7.8, 'chrome': 7.8, 'alu': 2.7, 'paint': 1.1, 'paint_b': 1.1, 'wood': 0.7, 'rubber': 1.2,
           'trim': 1.2, 'plastic_int': 1.2}


# ------------------------------------------------------------------------------------------------ helpers

def ring(c, ax, side, up, a, b, n=12, e=2.0, flat=None):
    """A section ring round c in the plane of the unit vectors side and up (a superellipse, half-widths a along
    side and b along up, exponent e); flat = (e_bottom, squash) makes the lower half flatter."""
    pts = []
    for i in range(n):
        t = TAU * i / n
        cs, sn = math.cos(t), math.sin(t)
        ee = e
        bb = b
        if flat and sn < 0:
            ee, bb = flat[0], b * flat[1]
        y = a * math.copysign(abs(cs) ** (2 / ee), cs)
        z = bb * math.copysign(abs(sn) ** (2 / ee), sn)
        pts.append(V(c) + V(side) * y + V(up) * z)
    return pts


def loft_x(P, name, secs, material, n=12, e=2.0, flat=None, **kw):
    """A body lofted along X through sections [(x, a, b, z), ...] (half-width a across Y, half-height b, centre
    height z), capped at both ends."""
    rings = [ring((x, 0.0, z), (1, 0, 0), (0, 1, 0), (0, 0, 1), a, b, n=n, e=e, flat=flat) for (x, a, b, z) in secs]
    bm = bmesh.new()
    K.bm_loft(bm, rings, cap_start=True, cap_end=True)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    kw.setdefault('sharp', 50.0)
    return P.mesh(name, bm, material, **kw)


def side_prism(P, name, prof_xz, width, material, y=0.0, **kw):
    """A plate seen from the side: the outline prof_xz [(x, z), ...] extruded across Y (width, centred on y)."""
    pts = list(prof_xz)
    area = sum(p[0] * q[1] - q[0] * p[1] for p, q in zip(pts, pts[1:] + pts[:1]))
    if area < 0:
        pts = pts[::-1]
    return P.prism(name, pts, width, material=material, matrix=mat4((0, y, 0), (90, 0, 0)), **kw)


def plan_prism(P, name, poly_xy, z0, depth, material, **kw):
    """A plate seen from above: the outline poly_xy extruded up from z0 by depth."""
    pts = list(poly_xy)
    area = sum(p[0] * q[1] - q[0] * p[1] for p, q in zip(pts, pts[1:] + pts[:1]))
    if area < 0:
        pts = pts[::-1]
    return P.prism(name, pts, depth, (0, 0, z0), material, center=False, **kw)


def disc_patch(P, name, r, n, c, normal, material):
    """A flat n-gon (one face) at c facing normal: a screw head, a hole, a mark."""
    nrm = V(normal).normalized()
    m = Matrix.Translation(V(c)) @ K.frame_from_z(nrm)
    bm = bmesh.new()
    f = bm.faces.new([bm.verts.new(m @ V((r * math.cos(TAU * i / n), r * math.sin(TAU * i / n), 0))) for i in range(n)])
    f.normal_update()
    if f.normal.dot(nrm) < 0:
        f.normal_flip()
    return P.mesh(name, bm, material, sharp=50.0)


def _hull2d(pts):
    pts = sorted(set((round(x, 7), round(y, 7)) for (x, y) in pts))

    def cross(o, a, b):
        return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])

    lo, hi = [], []
    for p in pts:
        while len(lo) >= 2 and cross(lo[-2], lo[-1], p) <= 0:
            lo.pop()
        lo.append(p)
    for p in reversed(pts):
        while len(hi) >= 2 and cross(hi[-2], hi[-1], p) <= 0:
            hi.pop()
        hi.append(p)
    return lo[:-1] + hi[:-1]


def settle(P, density=None, length=(1, 0, 0)):
    """
    Lay the tool down the way it comes to rest on a floor. The statics are baked first (booleans, bevels); the
    centre of mass comes from their volumes and per-material densities; the model is turned onto the face of
    its convex hull whose normal is nearest to -Z (the pose it was modelled in) among those the centre of mass
    stands over, its length (the direction `length` had) turned back along +X, its bottom put on z = 0 and its
    footprint centred on the origin. The markers move with it. Returns the tilt in degrees.
    """
    dens = dict(DENSITY, **(density or {}))
    for o in P.statics:
        P._apply(o)
    mass, com, pts = 0.0, V((0, 0, 0)), []
    for o in P.statics:
        me = o.data
        me.calc_loop_triangles()
        names = [m.name.split('.')[0] if m else '' for m in me.materials]
        vs = [v.co.copy() for v in me.vertices]
        pts += vs
        for tri in me.loop_triangles:
            a, b, c = (vs[i] for i in tri.vertices)
            vol = a.dot(b.cross(c)) / 6.0
            rho = dens.get(names[tri.material_index] if names else '', 1.0)
            mass += vol * rho
            com += (a + b + c) * (vol * rho / 4.0)
    com /= mass
    bm = bmesh.new()
    for p in pts:
        bm.verts.new(p)
    bmesh.ops.convex_hull(bm, input=bm.verts[:])
    cen = sum(pts, V((0, 0, 0))) / len(pts)
    planes = []
    for f in bm.faces:
        if f.calc_area() < 1e-9:
            continue
        n = f.normal.normalized()
        if n.dot(f.calc_center_median() - cen) < 0:
            n = -n
        d = n.dot(f.verts[0].co)
        for pl in planes:
            if pl[0].dot(n) > 0.9998 and abs(pl[1] - d) < 4e-4:
                pl[2].update(v.co.copy().freeze() for v in f.verts)
                break
        else:
            planes.append([n, d, {v.co.copy().freeze() for v in f.verts}])
    bm.free()
    best = None
    for n, d, vs in planes:
        fr = K.frame_from_z(n).to_3x3().transposed()
        poly = _hull2d([((fr @ v).x, (fr @ v).y) for v in vs])
        q = fr @ com
        if len(poly) < 3:
            continue
        inside = all((b[0] - a[0]) * (q.y - a[1]) - (b[1] - a[1]) * (q.x - a[0]) > 1e-9
                     for a, b in zip(poly, poly[1:] + poly[:1]))
        score = n.dot(V((0, 0, -1)))
        if inside and (best is None or score > best[0]):
            best = (score, n)
    n = best[1]
    R = n.rotation_difference(V((0, 0, -1))).to_matrix().to_4x4()
    lx = R.to_3x3() @ V(length)
    yaw = math.atan2(lx.y, lx.x)
    M = Matrix.Rotation(-yaw, 4, 'Z') @ R
    moved = [M @ p for p in pts]
    lo = V((min(p.x for p in moved), min(p.y for p in moved), min(p.z for p in moved)))
    hi = V((max(p.x for p in moved), max(p.y for p in moved), max(p.z for p in moved)))
    M = Matrix.Translation((-(lo.x + hi.x) / 2, -(lo.y + hi.y) / 2, -lo.z)) @ M
    for o in P.statics:
        o.data.transform(M)
    for e in P.empties:
        e.matrix_world = M @ e.matrix_world
    P.settled = math.degrees(math.acos(max(-1.0, min(1.0, best[0]))))
    return P.settled


# ------------------------------------------------------------------------------------------------ scrapers

def scraper_plastic(P):
    """A cheap plastic scraper (about 0.27 long): a flat-bottomed moulded grip with a hang hole (paint_b) running
    out into a wide flat blade (paint, 0.10 at the edge), thick at the root, chamfered to its cutting edge, a
    raised oval patch on it. It lies flat on its bottom."""
    P.ao_distance = 0.02
    flat = (5.0, 1.0)
    secs = [(-0.135, 0.006, 0.004, 0.0045), (-0.1335, 0.012, 0.0075, 0.0078), (-0.13, 0.0155, 0.0098, 0.0101),
            (-0.122, 0.0165, 0.0108, 0.0112), (-0.1, 0.0168, 0.011, 0.0114), (-0.07, 0.0158, 0.0106, 0.011),
            (-0.04, 0.0168, 0.011, 0.0114), (-0.015, 0.0162, 0.0098, 0.0101), (0.002, 0.0176, 0.0066, 0.0068),
            (0.014, 0.0198, 0.0039, 0.004), (0.019, 0.0196, 0.0031, 0.0032)]
    grip = loft_x(P, 'grip', secs, 'paint_b', n=14, e=2.4, flat=flat)
    hole = bmesh.new()
    K.bm_cyl(hole, 0.0062, 0.05, segs=12, matrix=Matrix.Translation((-0.112, 0, 0.01)))
    P.cut(grip, hole)
    # the blade: a loft of flat sections widening to the edge, its top chamfered over the last few mm
    bsecs = []
    for (x, w, t) in ((0.012, 0.042, 0.0056), (0.03, 0.054, 0.0055), (0.06, 0.071, 0.0051), (0.09, 0.087, 0.0047),
                      (0.118, 0.098, 0.0043), (0.127, 0.1, 0.0032), (0.135, 0.1, 0.0013)):
        bsecs.append([V((x, -w / 2, 0.0)), V((x, w / 2, 0.0)), V((x, w / 2, t * 0.78)), V((x, w / 2 - 0.0015, t)),
                      V((x, -w / 2 + 0.0015, t)), V((x, -w / 2, t * 0.78))])
    bm = bmesh.new()
    K.bm_loft(bm, bsecs, cap_start=True, cap_end=True)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    P.mesh('blade', bm, 'paint', sharp=30.0)
    pts = [(0.06 + 0.018 * math.cos(TAU * i / 12), 0.0105 * math.sin(TAU * i / 12)) for i in range(12)]
    plan_prism(P, 'blade_patch', pts, 0.0046, 0.0014, 'paint_b', bev=0.0005, segs=1)
    P.empty('M_grip', (-0.07, 0, 0.011), rot=(0, 90, 0))
    P.empty('M_edge', (0.135, 0, 0.0006), rot=(0, 90, 0))
    settle(P)
    P.views = [('a', 35, 30), ('b', 215, 30)]


def _wide_scraper(P, half, x_edge, zb, holder_mat, blade_mat, blade_len=0.045, holder=(0.068, 0.06, 0.02),
                  curved=False):
    """The head of a wide scraper: the blade (its top chamfered to the edge at x_edge, `half` = half its width)
    clamped in a holder whose front is a little wider than the blade, narrowing back to the neck."""
    hx, back_w, ht = holder
    xf = x_edge - blade_len + 0.017          # the holder's front (the blade runs 17 mm into it)
    xb = xf - hx
    # the blade, seen from the side, across Y
    t = 0.0042
    prof = [(xf - 0.016, zb - t / 2), (x_edge, zb - t / 2), (x_edge, zb - t / 2 + 0.0012), (x_edge - 0.008, zb + t / 2),
            (xf - 0.016, zb + t / 2)]
    side_prism(P, 'blade', prof, 2 * half, blade_mat, bev=0.0006, segs=1)
    # the holder: a plate in plan, rounded at the front corners, its sides straight or swept in
    fw = half + 0.004
    pts = []
    n = 6
    for i in range(n + 1):                   # the right side (-Y), from the back to the front
        s = i / n
        y = -(back_w / 2 + (fw - back_w / 2) * (s ** 2.2 if curved else s))
        pts.append((xb + hx * s, y))
    pts += [(x, -y) for (x, y) in reversed(pts)]
    plan_prism(P, 'holder', pts, zb - ht / 2, ht, holder_mat, bev=0.004, segs=2)
    return xf, xb


def scraper_metal(P):
    """A stainless wide scraper (about 0.40 long): a stiff steel blade 0.22 wide in a painted holder with two
    clamping screws and a ridge running back to the neck, the steel ferrule, the long rubber grip with its rings
    and a hang hole in its end."""
    P.ao_distance = 0.03
    zb = 0.0175
    xe = 0.2
    xf, xb = _wide_scraper(P, 0.11, xe, zb, 'paint', 'steel', holder=(0.064, 0.056, 0.02))
    for y in (-0.06, 0.06):
        P.cyl('screw', 0.0072, 0.0035, (xf - 0.022, y, zb + 0.0115), 'steel', segs=10, bev=0.0012, bsegs=1)
        disc_patch(P, 'screw_slot', 0.004, 4, (xf - 0.022, y, zb + 0.0134), (0, 0, 1), 'trim')
    P.box('ridge', (xf - xb - 0.012, 0.012, 0.006), ((xf + xb) / 2 - 0.006, 0, zb + 0.0115), 'paint', bev=0.0025, segs=1)
    # the neck, the ferrule, the grip
    P.cyl('neck', 0.0125, 0.03, (xb - 0.012, 0, zb), 'paint', axis='X', segs=12, r2=0.0108, bev=None)
    P.lathe('ferrule', [(0.0, 0.0), (0.0145, 0.0), (0.0152, 0.004), (0.0152, 0.018), (0.0145, 0.022), (0.0, 0.022)],
            loc=(xb - 0.05, 0, zb), material='steel', axis='X', segs=14, sharp=50.0)
    prof = [(0.0, 0.0), (0.009, 0.0005), (0.0145, 0.004), (0.0165, 0.012)]
    for k in range(5):                       # rings along the grip
        z0 = 0.03 + 0.042 * k
        prof += [(0.0168, z0), (0.0178, z0 + 0.004), (0.0178, z0 + 0.012), (0.0168, z0 + 0.016)]
    prof += [(0.0163, 0.244), (0.0148, 0.255), (0.0, 0.258)]
    grip = P.lathe('grip', prof, loc=(-xe, 0, zb), material='rubber', axis='X', segs=14, sharp=50.0)
    hole = bmesh.new()
    K.bm_cyl(hole, 0.0055, 0.06, segs=10, matrix=Matrix.Translation((-xe + 0.014, 0, zb)))
    P.cut(grip, hole)
    P.empty('M_grip', (-0.09, 0, zb), rot=(0, 90, 0))
    P.empty('M_edge', (xe, 0, zb - 0.0015), rot=(0, 90, 0))
    settle(P, density={'paint': 7.8})
    P.views = [('a', 35, 30), ('b', 215, 30)]


def scraper_gold(P):
    """The best scraper (about 0.42 long): a brass blade 0.25 wide (paint: gold) in a polished holder with swept
    sides, three brass screws and a ridge flowing into the neck, the brass ferrule with its beads, the turned and
    lacquered wooden handle, a polished end cap."""
    P.ao_distance = 0.03
    zb = 0.019
    xe = 0.21
    xf, xb = _wide_scraper(P, 0.125, xe, zb, 'chrome', 'paint', blade_len=0.05, holder=(0.075, 0.05, 0.022),
                           curved=True)
    for y in (-0.08, 0.0, 0.08):
        P.cyl('screw', 0.0068, 0.003, (xf - 0.02, y, zb + 0.0125), 'paint', segs=10, bev=0.0012, bsegs=1)
    P.box('ridge', (xf - xb - 0.008, 0.014, 0.007), ((xf + xb) / 2 - 0.008, 0, zb + 0.0125), 'chrome', bev=0.003, segs=2)
    P.cyl('neck', 0.0125, 0.026, (xb - 0.01, 0, zb), 'chrome', axis='X', segs=12, r2=0.0105, bev=None)
    P.lathe('ferrule', [(0.0, 0.0), (0.0148, 0.0), (0.0162, 0.003), (0.0156, 0.007), (0.0156, 0.026), (0.0164, 0.03),
                        (0.0152, 0.034), (0.0, 0.034)], loc=(xb - 0.056, 0, zb), material='paint', axis='X', segs=14,
            sharp=50.0)
    xh = xb - 0.056
    x0 = -xe + 0.004                        # the handle's end; it runs to the ferrule at xh
    sc = (xh - x0) / 0.21
    prof = [(0.0, 0.0), (0.006, 0.0), (0.0095, 0.002), (0.0155, 0.01), (0.0162, 0.016), (0.015, 0.022), (0.0158, 0.04),
            (0.0185, 0.09), (0.019, 0.13), (0.0172, 0.17), (0.0158, 0.19), (0.0168, 0.196), (0.0158, 0.203),
            (0.0148, 0.208), (0.0, 0.21)]
    P.lathe('handle', [(r, z * sc) for (r, z) in prof], loc=(x0, 0, zb), material='wood', axis='X', segs=14,
            sharp=50.0)
    P.lathe('end_cap', [(0.0, -0.002), (0.009, -0.0015), (0.0122, 0.0015), (0.0124, 0.005), (0.0095, 0.0075),
                        (0.0, 0.008)], loc=(x0, 0, zb), material='chrome', axis='-X', segs=12, sharp=50.0)
    P.empty('M_grip', (-0.1, 0, zb), rot=(0, 90, 0))
    P.empty('M_edge', (xe, 0, zb - 0.0015), rot=(0, 90, 0))
    settle(P, density={'paint': 8.4})
    P.views = [('a', 35, 30), ('b', 215, 30)]


# ------------------------------------------------------------------------------------------------ claw hammer

def claw_hammer(P):
    """A claw hammer for the bench (about 0.33 long), lying on its side: the steel head (the eye block, the neck
    and bell out to the chamfered striking face, the curved claw split into two prongs), the oval wooden handle
    tapering from the eye and swelling into the rubber grip with its rings."""
    P.ao_distance = 0.02
    # the head along Y (the face towards +Y, the claw towards -Y), its eye at the origin
    P.box('eye', (0.027, 0.034, 0.025), (0, 0, 0), 'steel', bev=0.0045, segs=2)
    P.lathe('bell', [(0.0, 0.012), (0.0118, 0.012), (0.0116, 0.022), (0.0124, 0.036), (0.0152, 0.048), (0.0158, 0.055),
                     (0.0138, 0.0598), (0.0, 0.0612)], material='steel', axis='Y', segs=14, sharp=40.0)
    # the claw: two prongs curving back towards the handle, the V between them opening to the tips
    path = [V((0.0, -0.012, 0.0)), V((-0.002, -0.03, 0.0)), V((-0.008, -0.048, 0.0)), V((-0.019, -0.064, 0.0)),
            V((-0.034, -0.077, 0.0)), V((-0.049, -0.084, 0.0)), V((-0.058, -0.0855, 0.0))]
    m = len(path)
    for sz in (-1, 1):
        rings = []
        for i, p in enumerate(path):
            s = i / (m - 1)
            tg = (path[min(i + 1, m - 1)] - path[max(i - 1, 0)]).normalized()
            nrm = V((-tg.y, tg.x, 0.0))
            tr = 0.0064 * (1 - s) + 0.0021 * s                     # across the claw, in the swing plane
            tz = 0.006 * (1 - s) + 0.0042 * s                      # each prong's half-height
            gap = 0.0005 + 0.0021 * s ** 1.5                       # half the V between the prongs
            cz = sz * (gap + tz)
            rings.append([p + nrm * (tr * math.cos(TAU * k / 8)) + V((0, 0, cz + tz * math.sin(TAU * k / 8)))
                          for k in range(8)])
        bm = bmesh.new()
        K.bm_loft(bm, rings, cap_start=True, cap_end=True)
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
        P.mesh('claw', bm, 'steel', sharp=50.0)
    # the handle's end and the wedge showing in the top of the eye
    disc_patch(P, 'eye_wood', 0.0105, 8, (0.0137, 0, 0), (1, 0, 0), 'wood')
    bm = bmesh.new()
    vs = [bm.verts.new(p) for p in ((0.0142, -0.0095, -0.0016), (0.0142, 0.0095, -0.0016), (0.0142, 0.0095, 0.0016),
                                    (0.0142, -0.0095, 0.0016))]
    f = bm.faces.new(vs)
    f.normal_update()
    if f.normal.x < 0:
        f.normal_flip()
    P.mesh('wedge', bm, 'steel', sharp=50.0)
    # the handle (oval: wide in the swing plane, Y) and the rubber grip over its end
    secs = [(-0.006, 0.0138, 0.0108, 0.0), (-0.02, 0.0132, 0.0102, 0.0), (-0.06, 0.0122, 0.0094, 0.0),
            (-0.12, 0.0116, 0.009, 0.0), (-0.17, 0.0128, 0.0098, 0.0), (-0.2, 0.0138, 0.0104, 0.0),
            (-0.3, 0.0148, 0.011, 0.0), (-0.306, 0.0138, 0.0103, 0.0), (-0.309, 0.009, 0.007, 0.0)]
    loft_x(P, 'handle', secs, 'wood', n=12, e=2.0)
    gs = [(-0.195, 0.0142, 0.0108, 0.0), (-0.2, 0.0155, 0.0118, 0.0)]
    for k in range(4):
        x = -0.212 - 0.022 * k
        gs += [(x, 0.0156, 0.0119, 0.0), (x - 0.006, 0.0164, 0.0126, 0.0), (x - 0.012, 0.0156, 0.0119, 0.0)]
    gs += [(-0.3, 0.0162, 0.0124, 0.0), (-0.308, 0.0168, 0.0128, 0.0), (-0.313, 0.0152, 0.0116, 0.0),
           (-0.3155, 0.01, 0.0076, 0.0)]
    loft_x(P, 'grip', gs, 'rubber', n=12, e=2.0)
    P.empty('M_head', (0, 0.0612, 0), rot=(-90, 0, 0))
    P.empty('M_grip', (-0.255, 0, 0), rot=(0, 90, 0))
    settle(P)
    P.views = [('a', 35, 32), ('b', 215, 32)]


MODELS = {
    'scraper_plastic': scraper_plastic,
    'scraper_metal': scraper_metal,
    'scraper_gold': scraper_gold,
    'claw_hammer': claw_hammer,
}


def _after(P, opts):
    """--toon: the views after the first (the kit renders that one); --hi: bigger previews of every view."""
    if opts.get('norender'):
        return
    views = list(getattr(P, 'views', None) or [('a', 35, 20), ('b', 215, 24)])
    if isinstance(opts.get('views'), str):
        views = [(f'v{i + 1}', float(a), float(b)) for i, (a, b) in
                 enumerate(v.split(':') for v in opts['views'].split(','))]
        K.render_toon(P, views=views, size=(800, 640), suffix='_hi')
        return
    if opts.get('toon') and len(views) > 1:
        K.render_toon(P, views=views[1:])
    if opts.get('hi'):
        K.render_toon(P, views=views, size=(960, 768), suffix='_hi')
    print(f'  SETTLED {P.id}: tilted {getattr(P, "settled", 0.0):.2f} deg')


def main(args):
    K.run(MODELS, args, after=_after, out_dir=OUT, geo=False)
