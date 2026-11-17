"""
Junk (src/core/modcar/items.ts, the things that go into the recycler): signs, chairs, stools, old machines,
drums, crates, a bird cage, a trumpet ... as models:

    blender -b --factory-startup --python tools/blender/build.py -- items/junk [<model>|all] [--toon]
        [--norender] [--stats] [--look[=yaw,pitch/yaw,pitch...]] [--cull]

Writes public/models/modcar/items/<model>.glb (not parts_geo.json): root mesh PART, origin at the bottom centre,
x forward, the thing resting on z = 0 in its natural pose (chairs, stools, the drum and the TV stand, the mop,
the rod and the trumpet lie on the floor, the jack stands ready on its wheels), conventional material names
only, AO in 'Col'. `paint` and `paint_b` take the item's paint / paint2 (one model serves every kind that names
it). Labels, stripes and logos are raised patches, never images; there is no text.
--look also renders bigger cel previews in the item's own colours (D:/modcar-scratch/parts/<id>_look_<k>.png),
from both sides or from the given views; with --cull they cull back faces as the game does (a face pointing the
wrong way shows as a hole).
"""
import math

import bmesh
from mathutils import Matrix

from parts import _kit as K
from parts._kit import V, mat4

OUT = 'public/models/modcar/items'

# the colours of the item that uses each model (items.ts: paint, paint2), for the --look previews only
COLORS = {
    'junk_sign': (0xe07b39, 0xf4efe2), 'junk_camera': (0x2f3236, 0x6f7a82), 'junk_candle': (0xd4a53b, 0x5a3a2b),
    'junk_chair': (0x3e8e87, 0x6f7a82), 'junk_chair_wood': (0xb9915f, 0x5a3a2b),
    'junk_chair_soft': (0x6e2534, 0x5a3a2b), 'junk_chair_fold': (0x557a46, 0x6f7a82),
    'junk_chair_office': (0x2f3236, 0x6f7a82), 'junk_stool': (0x6f7a82, 0x2f3236),
    'junk_stool_tall': (0xc8323a, 0x6f7a82), 'junk_sunchair': (0xf0c23c, 0xb9915f),
    'junk_clockradio': (0xede3c8, 0x2f3236), 'junk_hanger': (0x5a3a2b, 0x6f7a82), 'junk_coffee': (0x2f3236, 0xc8323a),
    'junk_fax': (0xede3c8, 0x6f7a82), 'junk_box_food': (0xb9915f, 0x5a3a2b), 'junk_lamp': (0x3e8e87, 0x6f7a82),
    'junk_barrel': (0x2e4a6b, 0x6f7a82), 'junk_mop': (0x7fb3d5, 0xede3c8), 'junk_crate_plastic': (0xc8323a, 0x2f3236),
    'junk_transceiver': (0x7a7f45, 0x2f3236), 'junk_record': (0xb85c3e, 0x2f3236), 'junk_cage': (0xd8c29a, 0x6f7a82),
    'junk_bin': (0x557a46, 0x6f7a82), 'junk_solar_lamp': (0x2f3236, 0xf0c23c), 'junk_rod': (0x2e4a6b, 0x6f7a82),
    'junk_tv': (0x5a3a2b, 0x2f3236), 'junk_trolley': (0xc8323a, 0x2f3236), 'junk_jack': (0xc8323a, 0x6f7a82),
    'junk_trumpet': (0xd4a53b, 0x5a3a2b), 'junk_food_bucket': (0xede3c8, 0x557a46),
}


def jit(k, a=0.0):
    """A fixed pseudo-random number in [-0.5, 0.5) (the same on every run)."""
    v = math.sin(k * 12.9898 + a * 78.233) * 43758.5453
    return (v - math.floor(v)) - 0.5


# ------------------------------------------------------------------------------------------------ helpers

def mark(P):
    """The number of statics so far: pass it to xform() to move everything built after it."""
    return len(P.statics)


def xform(P, since, m):
    """Apply the matrix m to every static (and its boolean cutters) registered since mark() returned `since`."""
    for o in P.statics[since:]:
        o.data.transform(m)
        for c in P.cfg[o.name]['cutters']:
            c.data.transform(m)


def settle(P, center=True):
    """Move the whole model so it rests on z = 0, its footprint centred over the origin (bottom centre)."""
    lo, hi = [1e9] * 3, [-1e9] * 3
    for o in P.statics:
        for v in o.data.vertices:
            for i in range(3):
                lo[i] = min(lo[i], v.co[i])
                hi[i] = max(hi[i], v.co[i])
    d = V((-(lo[0] + hi[0]) / 2 if center else 0.0, -(lo[1] + hi[1]) / 2 if center else 0.0, -lo[2]))
    xform(P, 0, Matrix.Translation(d))
    return d


def slab(size, loc=(0, 0, 0), step=0.06, axes=(0, 1, 2)):
    """A box as a bmesh, its faces cut into a grid about `step` apart along the given axes (vertex AO, bends)."""
    bm = bmesh.new()
    K.bm_cube(bm, size)
    for i in axes:
        n = int(size[i] / step)
        if n > 0:
            edges = [e for e in bm.edges if abs((e.verts[0].co - e.verts[1].co)[i]) > size[i] * 0.99]
            bmesh.ops.subdivide_edges(bm, edges=edges, cuts=n, use_grid_fill=True)
    K.bm_transform(bm, mat4(loc))
    return bm


def round_path(pts, r, n=3):
    """A polyline with its corners rounded by quadratic arcs of n segments (fewer points than K.fillet_path)."""
    pts = [V(p) for p in pts]
    out = [pts[0]]
    for i in range(1, len(pts) - 1):
        p0, p1, p2 = pts[i - 1], pts[i], pts[i + 1]
        t = min(r, (p1 - p0).length * 0.5, (p2 - p1).length * 0.5)
        a = p1 + (p0 - p1).normalized() * t
        b = p1 + (p2 - p1).normalized() * t
        for j in range(n + 1):
            u = j / n
            out.append(a * (1 - u) ** 2 + p1 * 2 * u * (1 - u) + b * u * u)
    out.append(pts[-1])
    return out


def ring_path(pts, step):
    """A closed polyline with extra points on its long sides (for closed sweeps)."""
    pts = [V(p) for p in pts]
    out = K.densify(pts + [pts[0]], step)
    return out[:-1]


def grid_plate(t, ys, zs):
    """A flat plate t thick (along x) over the grid ys x zs (sorted lists): both faces and the edge walls. Rows
    close to the edges keep the dark vertex AO of a rolled border from smearing over the face."""
    bm = bmesh.new()
    F = [[bm.verts.new((t / 2, y, z)) for z in zs] for y in ys]
    B = [[bm.verts.new((-t / 2, y, z)) for z in zs] for y in ys]
    ny, nz = len(ys), len(zs)
    for i in range(ny - 1):
        for j in range(nz - 1):
            bm.faces.new((F[i][j], F[i + 1][j], F[i + 1][j + 1], F[i][j + 1]))
            bm.faces.new((B[i][j], B[i][j + 1], B[i + 1][j + 1], B[i + 1][j]))
    ring = [(i, 0) for i in range(ny)] + [(ny - 1, j) for j in range(1, nz)] + \
        [(i, nz - 1) for i in range(ny - 2, -1, -1)] + [(0, j) for j in range(nz - 2, 0, -1)]
    for k in range(len(ring)):
        a, b = ring[k], ring[(k + 1) % len(ring)]
        bm.faces.new((F[a[0]][a[1]], B[a[0]][a[1]], B[b[0]][b[1]], F[b[0]][b[1]]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    return bm


def bar(P, name, a, b, w, d, material, x_hint=(0, 0, 1), bev=0.003, segs=1, taper=1.0, off=(0.0, 0.0)):
    """A straight bar of section w (local x, towards x_hint) by d from point a to point b; taper scales the
    section at b; off shifts it across (local x, y)."""
    a, b = V(a), V(b)
    L = (b - a).length
    bm = bmesh.new()
    K.bm_cube(bm, (w, d, L))
    for v in bm.verts:
        if v.co.z > 0:
            v.co.x *= taper
            v.co.y *= taper
    if L > 0.3:
        edges = [e for e in bm.edges if abs((e.verts[0].co - e.verts[1].co).z) > L * 0.99]
        bmesh.ops.subdivide_edges(bm, edges=edges, cuts=int(L / 0.2), use_grid_fill=True)
    m = Matrix.Translation((a + b) / 2) @ K.frame_from_z(b - a, x_hint) @ Matrix.Translation((off[0], off[1], 0))
    K.bm_transform(bm, m)
    return P.mesh(name, bm, material, bev=bev, segs=segs)


def strip(P, name, path, w, th, material, bend=0.0, dy=0.0, closed=False, sharp=60.0, max_seg=0.12):
    """A flat band (w wide, th thick) swept along a path whose sweep binormal is the band's width (paths in a
    vertical plane through X: canvas slings, straps); dy shifts it across its width."""
    bm = bmesh.new()
    pts = K.fillet_path(path, bend) if bend and not closed else [V(p) for p in path]
    prof = [(-th / 2, dy - w / 2), (th / 2, dy - w / 2), (th / 2, dy + w / 2), (-th / 2, dy + w / 2)]
    K.bm_sweep(bm, pts, 1.0, profile=prof, caps=not closed, closed=closed, max_seg=max_seg)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    return P.mesh(name, bm, material, sharp=sharp)


def cushion(P, name, size, loc=(0, 0, 0), material='fabric', rot=(0, 0, 0), r=0.02, sag=0.0, at=(0.0, 0.0),
            spread=0.45, sub=1, step=0.1, taper=None):
    """
    A soft block like Part.pillow, cut into a grid first so its top can give: the top sinks by `sag` (m) round
    the point `at` (fractions of the half sizes in x, y) with a falloff of `spread` (fraction of the size).
    """
    sx, sy, sz = size
    bm = bmesh.new()
    K.bm_cube(bm, size)
    for i in range(2):
        n = max(1, int(size[i] / step))
        edges = [e for e in bm.edges if abs((e.verts[0].co - e.verts[1].co)[i]) > size[i] * 0.99]
        bmesh.ops.subdivide_edges(bm, edges=edges, cuts=n, use_grid_fill=True)
    if taper:
        for v in bm.verts:
            if v.co.z > 0:
                v.co.x *= taper[0]
                v.co.y *= taper[1]
    corner = [e for e in bm.edges if len(e.link_faces) == 2 and e.calc_face_angle(0.0) > 1.0]
    bmesh.ops.bevel(bm, geom=corner, offset=r, offset_type='OFFSET', segments=1, profile=0.5, affect='EDGES',
                    clamp_overlap=True)
    if sag:
        cx, cy = at[0] * sx / 2, at[1] * sy / 2
        for v in bm.verts:
            k = (v.co.z + sz / 2) / sz
            if k <= 0.3:
                continue
            d2 = ((v.co.x - cx) / (spread * sx)) ** 2 + ((v.co.y - cy) / (spread * sy)) ** 2
            v.co.z -= sag * math.exp(-2.0 * d2) * (k - 0.3) / 0.7
    K.bm_transform(bm, mat4(loc, rot))
    o = P.mesh(name, bm, material, sharp=80.0, wn=False)
    P.cfg[o.name]['sub'] = sub
    return o


def bend_y(bm, R):
    """Bend a bmesh lying across Y round a vertical axis at x = +R: concave towards +X (a chair back)."""
    for v in bm.verts:
        x, y = v.co.x, v.co.y
        a = y / R
        v.co.x = R - (R - x) * math.cos(a)
        v.co.y = (R - x) * math.sin(a)


def knob(P, loc, axis='Z', r=0.012, h=0.012, material='trim', ribs=0, name='knob', skirt=0.0, segs=16):
    """A round control knob standing on a face (axis = its outward normal): a slightly domed cap, grip ribs
    round it and an optional skirt (a wider flange at its foot)."""
    prof = [(0.0, h), (r * 0.82, h), (r, h * 0.82), (r, 0.0)]
    if skirt:
        prof = [(0.0, h), (r * 0.82, h), (r, h * 0.82), (r, h * 0.35), (r + skirt, h * 0.2), (r + skirt, 0.0)]
    prof = prof[::-1]
    m = Matrix.Translation(V(loc)) @ K.axis_matrix(axis)
    bm = bmesh.new()
    K.bm_lathe(bm, prof, segs=segs, matrix=m)
    o = P.mesh(name, bm, material, sharp=50.0)
    if ribs:
        bm = bmesh.new()
        for i in range(ribs):
            a = math.tau * i / ribs
            K.bm_cube(bm, (r * 0.22, r * 0.3, h * 0.6),
                      m @ mat4((r * math.cos(a), r * math.sin(a), h * (0.5 if not skirt else 0.62)),
                               (0, 0, math.degrees(a))))
        P.mesh(name + '_ribs', bm, material, sharp=50.0)
    return o


def foot_caps(P, pts, r=0.013, h=0.02, material='rubber'):
    """Plastic/rubber caps on tube ends standing on the floor."""
    bm = bmesh.new()
    for (x, y) in pts:
        K.bm_cyl(bm, r, h, segs=12, r2=r * 0.92, matrix=Matrix.Translation((x, y, h / 2)))
    return P.mesh('foot_caps', bm, material, bev=0.002, segs=1)


def fold_bm(bm, a, b, corner, toward, ang):
    """
    Bend the part of a flat bmesh beyond the line a-b (the side `corner` is on) about that line by `ang` degrees,
    swinging it towards the unit vector `toward` (the plate's normal): a bent corner of a sheet.
    """
    a, b = V(a), V(b)
    u = (b - a).normalized()
    c = V(corner) - a
    m = c - u * c.dot(u)
    m -= V(toward) * m.dot(V(toward))
    m.normalize()
    bmesh.ops.bisect_plane(bm, geom=bm.verts[:] + bm.edges[:] + bm.faces[:], dist=1e-6, plane_co=a, plane_no=m)
    rot = Matrix.Rotation(math.radians(ang), 4, u)
    if (rot.to_3x3() @ m).dot(V(toward)) < 0:
        rot = Matrix.Rotation(-math.radians(ang), 4, u)
    for v in bm.verts:
        if (v.co - a).dot(m) > 1e-6:
            v.co = a + rot @ (v.co - a)


# face frame for flat patches on a plate facing +X: polygon x -> Y, y -> Z, extrusion -> X
FACE_X = Matrix(((0, 0, 1, 0), (1, 0, 0, 0), (0, 1, 0, 0), (0, 0, 0, 1)))


def on_x(x, y, z):
    return Matrix.Translation((x, y, z)) @ FACE_X


# ------------------------------------------------------------------------------------------------ sign

def junk_sign(P):
    """
    A fizzy-drink sign in two-colour enamel, standing on its long edge (face +X): a pressed steel plate with a
    rolled border, an inset pinstripe frame, a big roundel with a bottle on it, raised bands, two screw holes,
    a few chips gone to rust, and its top corner bent forward.
    """
    P.ao_distance = 0.006
    W, H, rb = 0.588, 0.388, 0.006          # the border's centre line; with the tube it is 0.60 x 0.40
    zc = rb + H / 2
    top = zc + H / 2
    t = 0.008
    # the fold: the top left (+Y) corner, bent forward 38 degrees about the line a-b
    fa, fb, corner = (0.0, W / 2 - 0.105, top), (0.0, W / 2, top - 0.088), (0.0, W / 2, top)
    fx = (1.0, 0.0, 0.0)
    # the plate: one panel inside a row 8 mm in from the edge, so nothing raised on it darkens it unevenly
    e = 0.008
    bm = grid_plate(t, [-W / 2, -W / 2 + e, W / 2 - e, W / 2], [zc - H / 2, zc - H / 2 + e, zc + H / 2 - e, zc + H / 2])
    fold_bm(bm, fa, fb, corner, fx, 38.0)
    P.mesh('plate', bm, 'paint', sharp=20.0)
    # two screw holes (dark right through), the enamel chipped round them on the face
    holes = [(-0.273, zc + 0.002), (0.273, zc + 0.002)]
    for (y, z) in holes:
        P.cyl('hole', 0.0065, t + 0.0016, (0, y, z), 'trim', axis='X', segs=12, bev=None)
        P.lathe('hole_chip', [(0.0062, 0.0035), (0.0062, 0.0049), (0.0112, 0.0049), (0.0118, 0.0035)][::-1],
                loc=(0, y, z), material='trim', axis='X', segs=10, loop=True, sharp=50.0)
    # the rolled border all round
    path = ring_path([(0.0, y, z + zc) for (y, z) in K.rounded_rect(W, H, 0.014, seg=3)], 0.08)
    bm = bmesh.new()
    K.bm_sweep(bm, path, rb, segs=6, closed=True)
    fold_bm(bm, fa, fb, corner, fx, 38.0)
    P.mesh('border', bm, 'paint_b', sharp=50.0)
    # pinstripe frame inset from the border (a flat band on the face)
    path = ring_path([(0.0048, y, z + zc) for (y, z) in K.rounded_rect(W - 0.08, H - 0.08, 0.02, seg=3)], 0.08)
    bm = bmesh.new()
    K.bm_sweep(bm, path, 1.0, profile=[(-0.0012, -0.0042), (0.0012, -0.0042), (0.0012, 0.0042), (-0.0012, 0.0042)],
               closed=True)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    fold_bm(bm, fa, fb, corner, fx, 38.0)
    P.mesh('pinstripe', bm, 'paint_b', sharp=50.0)
    # the roundel (cream) with a bottle on it (the field's colour), left of centre
    cy, cz = -0.13, zc + 0.005
    P.cyl('roundel', 0.105, 0.003, (0.0052, cy, cz), 'paint_b', axis='X', segs=28, bev=0.0012, bsegs=1)
    P.torus('roundel_rim', 0.097, 0.0022, loc=(0.0068, cy, cz), axis='X', segs=28, rsegs=4, material='paint')
    half = [(0.021, -0.078), (0.025, -0.07), (0.026, 0.0), (0.023, 0.016), (0.013, 0.036), (0.0095, 0.048),
            (0.0095, 0.066), (0.012, 0.068), (0.012, 0.078)]
    bottle = half + [(-y, z) for (y, z) in reversed(half)]
    P.prism('bottle', bottle, 0.003, matrix=on_x(0.0074, cy, cz), material='paint', bev=0.001, segs=1)
    P.prism('bottle_label', K.rounded_rect(0.046, 0.026, 0.006, seg=2), 0.0016,
            matrix=on_x(0.0094, cy, cz - 0.03), material='paint_b', bev=None)
    # the bands (a slogan with no words) right of centre
    for (yc, zz, ln, h) in ((0.11, zc + 0.085, 0.21, 0.04), (0.10, zc + 0.02, 0.19, 0.022),
                           (0.075, zc - 0.03, 0.14, 0.022), (0.11, zc - 0.105, 0.21, 0.012)):
        P.box('band', (0.003, ln, h), (0.0052, yc, zz), 'paint_b', bev=0.0012, segs=1)
    # chips of the enamel gone to rust
    for k, (y, z, sy, sz) in enumerate(((-0.2, 0.072, 0.05, 0.02), (0.16, 0.335, 0.03, 0.02),
                                        (0.278, 0.12, 0.016, 0.035), (-0.05, 0.022, 0.03, 0.013))):
        n = 9
        poly = [(sy / 2 * (0.7 + 0.3 * math.sin(i * 2.7 + k)) * math.cos(math.tau * i / n),
                 sz / 2 * (0.7 + 0.3 * math.cos(i * 1.9 + k)) * math.sin(math.tau * i / n)) for i in range(n)]
        P.prism('rust', poly, 0.0014, matrix=on_x(0.0045, y, z), material='rust', bev=None)
    P.views = [('a', 25, 12), ('b', 205, 12)]


# ------------------------------------------------------------------------------------------------ camera

def junk_camera(P):
    """
    An old camera on a wooden field tripod: three splayed legs of twin slats with the lower leg sliding
    between them, brass-less steel clamps and spiked feet, the top casting with hinge lugs, a geared head with
    a crank, the camera box with leatherette panels, a lens barrel, a viewfinder, a winding knob and a handle.
    """
    P.ao_distance = 0.08
    zt = 0.9                                     # top of the top casting
    P.lathe('casting', [(0.0, zt - 0.02), (0.058, zt - 0.02), (0.066, zt - 0.012), (0.066, zt - 0.004),
                        (0.06, zt), (0.0, zt)], material='steel', segs=24, sharp=40.0)
    for k in range(3):
        a = math.tau * k / 3
        rad = V((math.cos(a), math.sin(a), 0.0))
        tan = V((-math.sin(a), math.cos(a), 0.0))
        hinge = rad * 0.07 + V((0, 0, zt - 0.03))
        foot = rad * 0.42 + V((0, 0, 0.0))
        d = (foot - hinge).normalized()
        L = (foot - hinge).length
        # hinge lug on the casting and the leg's head block
        P.box('lug', (0.03, 0.05, 0.024), tuple(rad * 0.062 + V((0, 0, zt - 0.022))), 'steel',
              rot=(0, 0, math.degrees(a)), bev=0.003, segs=1)
        P.cyl('hinge_pin', 0.0065, 0.062, tuple(hinge), 'steel', axis=tan, segs=10, bev=0.0015, bsegs=1)
        bar(P, 'leg_head', hinge - d * 0.012, hinge + d * 0.06, 0.034, 0.05, 'wood', x_hint=rad, bev=0.004)
        # the twin slats of the upper leg
        p0, p1 = hinge + d * 0.05, hinge + d * (L * 0.58)
        for s in (-1, 1):
            bar(P, 'slat', p0, p1, 0.03, 0.014, 'wood', x_hint=rad, bev=0.0025, off=(0.0, s * 0.017))
        # the clamp block at the slats' foot with its wing screw
        c = hinge + d * (L * 0.58)
        bar(P, 'clamp', c - d * 0.03, c + d * 0.012, 0.038, 0.054, 'steel', x_hint=rad, bev=0.003)
        P.cyl('clamp_screw', 0.005, 0.026, tuple(c - d * 0.01 + rad * 0.026), 'steel', axis=rad, segs=8, bev=None)
        P.box('wing', (0.006, 0.03, 0.012), tuple(c - d * 0.01 + rad * 0.04), 'steel',
              rot=(0, 0, math.degrees(a)), bev=0.002, segs=1)
        # the lower leg, sliding out between the slats
        q0, q1 = hinge + d * (L * 0.3), foot - d * 0.07
        bar(P, 'leg_low', q0, q1, 0.026, 0.02, 'wood', x_hint=rad, bev=0.0025, taper=0.85)
        # steel ferrule and spike
        P.cyl('ferrule', 0.0125, 0.04, tuple(foot - d * 0.07), 'steel', axis=d, segs=10, bev=0.002, bsegs=1)
        P.cyl('spike', 0.009, 0.05, tuple(foot - d * 0.025), 'steel', axis=d, segs=10, r2=0.002, bev=None)
    # the geared head: column, tilt block, the crank on the right, the platform
    P.cyl('column', 0.024, 0.045, (0, 0, zt + 0.0225), 'steel', segs=16, bev=0.003, bsegs=1)
    P.cyl('pan_ring', 0.034, 0.01, (0, 0, zt + 0.006), 'steel', segs=18, bev=0.002, bsegs=1)
    P.box('tilt_block', (0.07, 0.07, 0.032), (0, 0, zt + 0.06), 'steel', bev=0.005, segs=2)
    P.cyl('crank_boss', 0.016, 0.02, (0, -0.045, zt + 0.06), 'steel', axis='Y', segs=14, bev=0.002, bsegs=1)
    P.box('crank_arm', (0.012, 0.008, 0.07), (0, -0.059, zt + 0.032), 'steel', bev=0.002, segs=1)
    P.cyl('crank_grip', 0.008, 0.035, (0, -0.075, zt + 0.004), 'wood', axis='Y', segs=10, bev=0.002, bsegs=1)
    P.box('platform', (0.17, 0.11, 0.01), (0, 0, zt + 0.081), 'steel', bev=0.003, segs=1)
    # the camera box
    zb = zt + 0.086
    Lc, Wc, Hc = 0.22, 0.14, 0.17
    P.box('body', (Lc, Wc, Hc), (0, 0, zb + Hc / 2), 'paint', bev=0.008, segs=2)
    for s in (-1, 1):
        P.box('leatherette', (Lc - 0.03, 0.003, Hc - 0.03), (0, s * (Wc / 2 + 0.001), zb + Hc / 2), 'paint_b',
              bev=0.0015, segs=1)
    P.box('back_panel', (0.003, Wc - 0.03, Hc - 0.03), (-Lc / 2 - 0.001, 0, zb + Hc / 2), 'paint_b', bev=0.0015,
          segs=1)
    # the lens board and barrel on the front
    zl = zb + Hc * 0.45
    P.box('lens_board', (0.008, 0.098, 0.098), (Lc / 2 + 0.003, 0, zl), 'steel', bev=0.003, segs=1)
    P.lathe('lens', [(0.044, 0.0), (0.046, 0.004), (0.046, 0.012), (0.037, 0.016), (0.037, 0.036), (0.04, 0.038),
                     (0.04, 0.052), (0.037, 0.054), (0.037, 0.066), (0.042, 0.068), (0.042, 0.078), (0.035, 0.08),
                     (0.031, 0.074)], loc=(Lc / 2 + 0.006, 0, zl), material='alu', axis='X', segs=24, sharp=40.0)
    P.cyl('lens_glass', 0.032, 0.004, (Lc / 2 + 0.006 + 0.074, 0, zl), 'glass_dark', axis='X', segs=20, bev=None)
    bm = bmesh.new()
    for i in range(16):
        a = math.tau * i / 16
        at = Matrix.Translation((Lc / 2 + 0.051, 0.0405 * math.cos(a), zl + 0.0405 * math.sin(a)))
        K.bm_cube(bm, (0.012, 0.004, 0.004), at @ mat4(rot=(math.degrees(a), 0, 0)))
    P.mesh('focus_ribs', bm, 'alu', sharp=50.0)
    # viewfinder, release button, winding knob, the handle on top
    zt2 = zb + Hc
    P.box('finder', (0.06, 0.03, 0.03), (0.03, 0.03, zt2 + 0.015), 'paint', bev=0.004, segs=1)
    for sx in (-1, 1):
        P.box('finder_glass', (0.003, 0.022, 0.02), (0.03 + sx * 0.0305, 0.03, zt2 + 0.015), 'glass_dark', bev=None)
    P.cyl('release', 0.006, 0.01, (0.06, -0.04, zt2 + 0.005), 'chrome', segs=10, bev=0.0015, bsegs=1)
    knob(P, (-0.04, -Wc / 2, zt2 - 0.035), axis='-Y', r=0.019, h=0.014, material='alu', ribs=12, name='wind_knob')
    P.tube('handle', [(-0.06, 0.0, zt2 - 0.002), (-0.05, 0.0, zt2 + 0.028), (0.0, 0.0, zt2 + 0.03),
                      (0.012, 0.0, zt2 - 0.002)], 1.0, 'leather', bend=0.015,
           profile=[(-0.004, -0.011), (0.004, -0.011), (0.004, 0.011), (-0.004, 0.011)], sharp=60.0)
    settle(P, center=False)
    P.views = [('a', 35, 14), ('b', 215, 16)]


# ------------------------------------------------------------------------------------------------ candlestick

def junk_candle(P):
    """A heavy brass candlestick: a stepped foot on a felt pad, a baluster stem with three knops, a wide drip pan
    and the socket, with a stub of candle in it, burnt down and run over with drips."""
    P.ao_distance = 0.03
    prof = [(0.0, 0.0), (0.09, 0.0), (0.094, 0.006), (0.092, 0.014), (0.082, 0.02), (0.072, 0.03), (0.056, 0.044),
            (0.04, 0.052), (0.028, 0.06), (0.024, 0.068), (0.034, 0.075), (0.036, 0.083), (0.03, 0.09),
            (0.017, 0.1), (0.015, 0.125), (0.021, 0.14), (0.034, 0.155), (0.038, 0.17), (0.033, 0.185),
            (0.019, 0.2), (0.0145, 0.222), (0.0155, 0.245), (0.026, 0.252), (0.027, 0.26), (0.017, 0.268),
            (0.0145, 0.288), (0.02, 0.304), (0.024, 0.31), (0.07, 0.316), (0.079, 0.32), (0.08, 0.329),
            (0.074, 0.332), (0.032, 0.328), (0.029, 0.334), (0.03, 0.368), (0.034, 0.373), (0.033, 0.379),
            (0.024, 0.379), (0.024, 0.358), (0.0, 0.358)]
    P.lathe('stick', prof, material='paint', segs=24, sharp=38.0)
    P.cyl('felt', 0.087, 0.003, (0.0, 0.0, -0.0015), 'paint_b', segs=24, bev=None)
    # the candle stub: a melted crater on top and its drips
    zc0, zc1 = 0.358, 0.448
    r = 0.0235
    P.lathe('candle', [(0.0, zc0), (r, zc0), (r, zc1 - 0.006), (r - 0.001, zc1 - 0.001), (r - 0.004, zc1),
                       (r - 0.007, zc1 - 0.006), (0.0, zc1 - 0.009)], material='ceramic', segs=18, sharp=50.0)
    P.cyl('wick', 0.0022, 0.012, (0.0, 0.0, zc1 - 0.004), 'trim', segs=6, bev=None)
    for (a, l0, l1) in ((0.4, 0.004, 0.05), (2.1, 0.003, 0.03), (3.9, 0.004, 0.068)):
        c, s = math.cos(a), math.sin(a)
        rr = r + 0.0022
        pts = [(rr * c, rr * s, zc1 - l0), (rr * c, rr * s, zc1 - l1 * 0.5), (rr * c, rr * s, zc1 - l1)]
        P.tube('drip', pts, 0.0045, 'ceramic', segs=8, radius_fn=lambda u: 1.0 - 0.15 * u, caps=True)
        P.sphere('drip_end', 0.0055, (rr * c, rr * s, zc1 - l1), 'ceramic', u=8, v=5)
    # one run over the socket's lip down onto the pan
    a = 3.9
    c, s = math.cos(a), math.sin(a)
    P.tube('drip', [(0.025 * c, 0.025 * s, 0.38), (0.035 * c, 0.035 * s, 0.3795), (0.0365 * c, 0.0365 * s, 0.36),
                    (0.039 * c, 0.039 * s, 0.335)], 0.0042, 'ceramic', segs=8, bend=0.006)
    P.sphere('puddle', 0.012, (0.044 * c, 0.044 * s, 0.331), 'ceramic', u=12, v=6, scale=(1.3, 1.0, 0.3))
    P.views = [('a', 35, 16), ('b', 215, 20)]


# ------------------------------------------------------------------------------------------------ chairs

def junk_chair(P):
    """A canteen chair: each side a bent steel tube (front leg into the seat rail) and the rear leg running on
    up as the back post, stretchers, a moulded seat and a curved back panel bolted on, plastic feet."""
    P.ao_distance = 0.08
    r = 0.011
    yl = 0.2
    zs = 0.43                                    # top of the seat rails
    for s in (-1, 1):
        y = s * yl
        P.tube('frame', [(0.215, y, 0.02), (0.2, y, zs), (-0.19, y, zs)], r, 'steel', segs=10, bend=0.05)
        P.tube('post', [(-0.235, y, 0.02), (-0.195, y, zs - 0.01), (-0.24, y, 0.83)], r, 'steel', segs=10,
               bend=0.08)
    P.tube('stretcher', [(0.205, -yl, 0.15), (0.205, yl, 0.15)], 0.009, 'steel', segs=8)
    P.tube('stretcher', [(-0.218, -yl, 0.2), (-0.218, yl, 0.2)], 0.009, 'steel', segs=8)
    P.tube('seat_bar', [(0.02, -yl, zs - 0.008), (0.02, yl, zs - 0.008)], 0.009, 'steel', segs=8)
    foot_caps(P, [(0.215, -yl), (0.215, yl), (-0.235, -yl), (-0.235, yl)], r=0.0135, h=0.022)
    # the moulded seat: a slab dished a little, its front edge rolled down
    bm = slab((0.4, 0.43, 0.02), (0.0, 0.0, 0.0), step=0.06, axes=(0, 1))
    for v in bm.verts:
        v.co.z -= 0.012 * (1 - (2 * v.co.y / 0.43) ** 2) * (1 - (2 * v.co.x / 0.4) ** 2)
        if v.co.x > 0.12:
            v.co.z -= ((v.co.x - 0.12) / 0.08) ** 2 * 0.018
    K.bm_transform(bm, mat4((0.005, 0, zs + r + 0.012), (0, -2, 0)))
    P.mesh('seat', bm, 'paint', bev=0.006, segs=2)
    # the back panel, curved round the sitter, on the posts
    Rb = 0.7
    bm = slab((0.014, 0.44, 0.17), (0, 0, 0), step=0.05, axes=(1,))
    bend_y(bm, Rb)
    zb = 0.7
    xp = -0.195 - 0.045 * (zb - zs + 0.01) / 0.41          # the posts' centre line at the panel
    xb = xp + r + 0.007 - Rb * (1 - math.cos(yl / Rb))      # the panel touches the posts with its wings
    K.bm_transform(bm, mat4((xb, 0, zb), (0, -6, 0)))
    P.mesh('back', bm, 'paint', bev=0.006, segs=2)
    P.bolts([(xp + r + 0.0145 - dz * 0.105, s * yl, zb + dz) for s in (-1, 1) for dz in (-0.04, 0.04)],
            normal=(1, 0, 0), r=0.0065, h=0.004, washer=False, material='steel', x_hint=(0, 0, 1))
    P.views = [('a', 35, 16), ('b', 215, 18)]


def lerp3(a, b, t):
    return tuple(a[i] + (b[i] - a[i]) * t for i in range(3))


def at_z(a, b, z):
    """The point of the segment a-b at height z."""
    return lerp3(a, b, (z - a[2]) / (b[2] - a[2]))


def junk_chair_wood(P):
    """A plain kitchen chair: a thick seat board, four square legs tapering and splayed a little, the back legs
    running on up as the posts, a curved top rail and a lower rail with five turned spindles between, round
    stretchers (the darker wood) between the legs."""
    P.ao_distance = 0.08
    zs, th = 0.45, 0.03
    P.box('seat', (0.42, 0.43, th), (0.0, 0.0, zs - th / 2), 'paint', bev=0.008, segs=2)
    legs = {}
    for s in (-1, 1):
        top, foot = (0.165, s * 0.17, zs - th + 0.006), (0.188, s * 0.192, 0.0)
        bar(P, 'leg', top, foot, 0.038, 0.038, 'paint', x_hint=(1, 0, 0), bev=0.004, taper=0.78)
        legs[('f', s)] = (top, foot)
        top, foot = (-0.175, s * 0.172, zs - th + 0.006), (-0.198, s * 0.192, 0.0)
        bar(P, 'leg', top, foot, 0.038, 0.038, 'paint', x_hint=(1, 0, 0), bev=0.004, taper=0.78)
        legs[('b', s)] = (top, foot)
    # the posts above the seat, leaning back
    p0x, p1x, z0, z1 = -0.176, -0.226, zs - 0.005, 0.92
    for s in (-1, 1):
        bar(P, 'post', (p0x, s * 0.172, z0), (p1x, s * 0.168, z1), 0.036, 0.036, 'paint', x_hint=(1, 0, 0), bev=0.005,
            taper=0.85)

    def post_x(z):
        return p0x + (p1x - p0x) * (z - z0) / (z1 - z0)

    lean = math.degrees(math.atan2(p0x - p1x, z1 - z0))
    R = 0.5
    off = R * (1 - math.cos(0.172 / R))
    rails = {}
    for (nm, zr, hr, wr) in (('top_rail', 0.862, 0.06, 0.38), ('back_rail', 0.565, 0.032, 0.33)):
        bm = slab((0.024, wr, hr), step=0.05, axes=(1,))
        bend_y(bm, R)
        K.bm_transform(bm, mat4((post_x(zr) - off, 0.0, zr), (0, -lean, 0)))
        P.mesh(nm, bm, 'paint', bev=0.005, segs=2)
        rails[nm] = (zr, hr)
    # five turned spindles between the rails, on the rails' curve
    za, zb = rails['back_rail'][0] + 0.012, rails['top_rail'][0] - 0.022
    prof = [(0.0085, 0.0), (0.0085, 0.02), (0.012, 0.07), (0.0135, 0.12), (0.011, 0.18), (0.009, 0.23)]
    for i in range(5):
        y = -0.12 + 0.06 * i
        dy = R * (1 - math.cos(y / R))
        a = V((post_x(za) - off + dy, y, za))
        b = V((post_x(zb) - off + dy, y, zb))
        L = (b - a).length
        pr = [(r, z * L / prof[-1][1]) for (r, z) in prof]
        P.lathe('spindle', pr, loc=tuple(a), material='paint', axis=(b - a), segs=10, sharp=60.0)
    # stretchers: the front and back low, the sides a little higher
    for (k1, k2, z) in ((('f', -1), ('f', 1), 0.15), (('b', -1), ('b', 1), 0.15), (('f', -1), ('b', -1), 0.21),
                        (('f', 1), ('b', 1), 0.21)):
        a = at_z(legs[k1][0], legs[k1][1], z)
        b = at_z(legs[k2][0], legs[k2][1], z)
        P.tube('stretcher', [a, b], 0.0115, 'paint_b', segs=10)
    P.views = [('a', 35, 16), ('b', 215, 18)]


def turned_leg(h, r):
    """The profile of a turned chair leg h tall, about r thick, foot at z = 0, a square-ish block on top."""
    return [(0.0, 0.0), (r * 0.72, 0.0), (r * 0.78, h * 0.03), (r * 0.7, h * 0.07), (r * 1.08, h * 0.17),
            (r * 0.95, h * 0.26), (r * 0.66, h * 0.34), (r * 0.72, h * 0.5), (r * 0.9, h * 0.7), (r * 1.15, h * 0.75),
            (r * 0.95, h * 0.79), (r * 1.0, h * 0.82), (r * 1.0, h), (0.0, h)]


def junk_chair_soft(P):
    """A dining chair: an upholstered seat gone soft on one side, a buttoned padded back between the posts, on
    turned front legs and raked back legs that run on up as the frame of the back (all the darker wood)."""
    P.ao_distance = 0.08
    za = 0.4                          # top of the apron
    for s in (-1, 1):
        P.lathe('leg', turned_leg(za, 0.021), loc=(0.19, s * 0.19, 0.0), material='paint_b', segs=12, sharp=45.0)
        bar(P, 'back_leg', (-0.205, s * 0.19, 0.0), (-0.185, s * 0.19, za), 0.036, 0.036, 'paint_b', x_hint=(1, 0, 0),
            bev=0.004)
        bar(P, 'post', (-0.185, s * 0.19, za - 0.03), (-0.24, s * 0.18, 0.95), 0.034, 0.036, 'paint_b',
            x_hint=(1, 0, 0), bev=0.005, taper=0.85)
    # the apron under the seat
    for (x, y, sx, sy) in ((0.19, 0.0, 0.022, 0.36), (-0.185, 0.0, 0.022, 0.36), (0.0, 0.19, 0.36, 0.022),
                           (0.0, -0.19, 0.36, 0.022)):
        P.box('apron', (sx, sy, 0.07), (x, y, za - 0.035), 'paint_b', bev=0.004, segs=1)
    # the seat: a thick cushion over the apron, sunk in at the front on the right
    cushion(P, 'seat', (0.47, 0.46, 0.075), (0.012, 0.0, za + 0.034), 'paint', r=0.03, sag=0.06, at=(0.45, -0.5),
            spread=0.45, step=0.08)
    # the back: the top rail and the padded panel between the posts, buttoned
    lean = math.degrees(math.atan2(0.055, 0.95 - za + 0.03))

    def post_x(z):
        return -0.185 - 0.055 * (z - za + 0.03) / (0.95 - za + 0.03)

    P.box('top_rail', (0.03, 0.40, 0.06), (post_x(0.905), 0.0, 0.905), 'paint_b', rot=(0, -lean, 0), bev=0.008,
          segs=2)
    P.box('low_rail', (0.026, 0.36, 0.03), (post_x(0.53), 0.0, 0.53), 'paint_b', rot=(0, -lean, 0), bev=0.005, segs=1)
    zp = 0.715
    cushion(P, 'back', (0.05, 0.33, 0.30), (post_x(zp) + 0.008, 0.0, zp), 'paint', rot=(0, -lean, 0), r=0.018,
            step=0.08)
    for (y, z) in ((-0.08, 0.04), (0.08, 0.04), (0.0, -0.05)):
        zz = zp + z
        P.sphere('button', 0.009, (post_x(zz) + 0.008 + 0.03, y, zz), 'paint_b', u=10, v=5, scale=(0.5, 1, 1))
    P.views = [('a', 35, 18), ('b', 215, 18)]


def grid_sheet(nx, ny, fn, thick):
    """A sheet (canvas) through the points fn(u, v) (u, v in 0..1) on an nx x ny grid, given a thickness."""
    bm = bmesh.new()
    rows = [[bm.verts.new(fn(i / nx, j / ny)) for j in range(ny + 1)] for i in range(nx + 1)]
    faces = []
    for i in range(nx):
        for j in range(ny):
            faces.append(bm.faces.new((rows[i][j], rows[i + 1][j], rows[i + 1][j + 1], rows[i][j + 1])))
    bmesh.ops.recalc_face_normals(bm, faces=faces)
    bmesh.ops.solidify(bm, geom=faces, thickness=thick)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    return bm


def junk_chair_fold(P):
    """A camping chair standing open: a steel frame of four legs braced by scissor X's on every side (riveted
    where they cross), a canvas sling seat and back, armrests with pads and a cup holder on the right."""
    P.ao_distance = 0.07
    r = 0.0095
    xf, xb, yw = 0.23, -0.23, 0.27
    zf, zb = 0.44, 0.40                       # the seat rails at the front and the back
    for s in (-1, 1):
        y = s * yw
        P.tube('leg_f', [(xf, y, 0.012), (xf, y, 0.6)], r, 'steel', segs=8)
        P.tube('leg_b', [(xb, y, 0.012), (xb, y, zb), (-0.3, s * 0.26, 0.88)], r, 'steel', segs=8, bend=0.05)
        P.tube('rail', [(xf, y, zf), (xb, y, zb)], r, 'steel', segs=8)
        # the side scissors, one either side of the legs' plane
        P.tube('x', [(xf, y + s * 0.012, 0.04), (xb, y + s * 0.012, zb - 0.02)], 0.008, 'steel', segs=8)
        P.tube('x', [(xb, y - s * 0.012, 0.04), (xf, y - s * 0.012, zf - 0.02)], 0.008, 'steel', segs=8)
        P.cyl('rivet', 0.009, 0.04, (0.0, y, 0.23), 'steel', axis='Y', segs=10, bev=0.002, bsegs=1)
    for (x, s) in ((xf, 1), (xb, -1)):
        zt = zf if s > 0 else zb
        P.tube('x', [(x + s * 0.012, -yw, 0.04), (x + s * 0.012, yw, zt - 0.02)], 0.008, 'steel', segs=8)
        P.tube('x', [(x - s * 0.012, yw, 0.04), (x - s * 0.012, -yw, zt - 0.02)], 0.008, 'steel', segs=8)
        P.cyl('rivet', 0.009, 0.04, (x, 0.0, 0.23), 'steel', axis='X', segs=10, bev=0.002, bsegs=1)
    foot_caps(P, [(xf, -yw), (xf, yw), (xb, -yw), (xb, yw)], r=0.014, h=0.016)

    # the canvas seat: hung between the side rails, sagging in the middle
    def seat(u, v):
        x = 0.2 - 0.4 * u
        y = (v - 0.5) * 2 * (yw - 0.012)
        z = zf + (zb - zf) * (0.5 - x / 0.46) - 0.004
        z -= 0.055 * (1 - (2 * v - 1) ** 2) * (1 - 0.3 * (2 * u - 1) ** 2)
        return (x, y, z)

    P.mesh('seat', grid_sheet(6, 8, seat, 0.005), 'paint', sharp=60.0)

    # the canvas back between the posts, giving to the sitter's back
    def back(u, v):
        z = 0.47 + 0.37 * u
        x = -0.23 - 0.07 * (z - zb) / 0.48 - 0.045 * (1 - (2 * v - 1) ** 2)
        y = (v - 0.5) * 2 * (yw - 0.016 - 0.01 * u)
        return (x + 0.004, y, z)

    P.mesh('back', grid_sheet(5, 8, back, 0.005), 'paint', sharp=60.0)
    # the canvas is sewn round the rails and the posts in sleeves
    for s in (-1, 1):
        y = s * yw
        P.tube('sleeve', [(xf - 0.03, y, zf - 0.0035), (xb + 0.03, y, zb + 0.0035)], 0.0135, 'paint', segs=8)
        P.tube('sleeve', [(-0.23 - 0.07 * 0.07 / 0.48, s * 0.2698, 0.47),
                          (-0.23 - 0.07 * 0.44 / 0.48, s * 0.2636, 0.84)], 0.0135, 'paint', segs=8)
    # armrests: a tube from the front leg to the post, a plastic pad on it
    for s in (-1, 1):
        y = s * yw
        xp = -0.23 - 0.07 * (0.62 - zb) / 0.48
        P.tube('arm', [(xf, y, 0.6), (xp, s * 0.266, 0.62)], r, 'steel', segs=8)
        P.pillow('arm_pad', (0.32, 0.055, 0.022), ((xf + xp) / 2 + 0.02, y, 0.623), 'trim', r=0.009, sub=1,
                 rot=(0, 2.5, 0))
    # the cup holder on the right (-Y) armrest
    cx, cy, cz = 0.13, -yw - 0.06, 0.6
    P.torus('cup_ring', 0.04, 0.006, loc=(cx, cy, cz), segs=20, rsegs=6, material='paint_b')
    P.box('cup_clip', (0.03, 0.04, 0.012), (cx, -yw - 0.02, cz), 'paint_b', bev=0.003, segs=1)
    pocket = [(0.038, 0.0), (0.037, -0.04), (0.03, -0.075), (0.0, -0.08)]
    P.lathe('cup_pocket', K.shell_profile(pocket, 0.003), loc=(cx, cy, cz), material='paint_b', segs=16, loop=True,
            sharp=60.0)
    P.views = [('a', 35, 18), ('b', 215, 18)]


def junk_chair_office(P):
    """An office chair: a five-star base with twin-wheel casters (one turned askew: it sticks), the gas lift in
    its shroud, the tilt mechanism and lever, a padded seat and back on a bent support bar, loop armrests."""
    P.ao_distance = 0.08
    zh = 0.115
    P.cyl('hub', 0.05, 0.07, (0, 0, zh), 'paint_b', segs=18, bev=0.008, bsegs=2)
    for i in range(5):
        a = math.tau * i / 5 + math.pi / 5
        d = V((math.cos(a), math.sin(a), 0.0))
        bar(P, 'star_arm', d * 0.03 + V((0, 0, zh + 0.005)), d * 0.29 + V((0, 0, 0.088)), 0.042, 0.05, 'paint_b',
            x_hint=(0, 0, 1), bev=0.01, segs=2, taper=0.72)
        tip = d * 0.29
        P.cyl('caster_stem', 0.008, 0.02, (tip.x, tip.y, 0.072), 'steel', segs=8, bev=None)
        turn = math.degrees(a) + (75.0 if i == 2 else 0.0)
        tr = math.radians(turn)
        dd = V((math.cos(tr), math.sin(tr), 0.0))
        c = tip - dd * 0.02
        P.box('caster_hood', (0.05, 0.02, 0.036), (c.x, c.y, 0.045), 'trim', rot=(0, 0, turn), bev=0.008, segs=2)
        side = V((-dd.y, dd.x, 0.0))
        for sg in (-1, 1):
            w = c + side * (sg * 0.019)
            P.cyl('caster_wheel', 0.025, 0.016, (w.x, w.y, 0.025), 'rubber', axis=side, segs=12, bev=0.004, bsegs=1)
    P.cyl('shroud', 0.028, 0.13, (0, 0, zh + 0.1), 'trim', segs=14, bev=0.003, bsegs=1)
    P.cyl('gas_lift', 0.0145, 0.12, (0, 0, zh + 0.22), 'chrome', segs=12, bev=None)
    P.box('mechanism', (0.2, 0.17, 0.045), (0.01, 0, 0.385), 'trim', bev=0.008, segs=1)
    P.tube('lever', [(0.03, -0.085, 0.38), (0.06, -0.15, 0.375), (0.1, -0.18, 0.37)], 0.0065, 'trim', segs=6,
           bend=0.02)
    P.sphere('lever_knob', 0.012, (0.104, -0.183, 0.37), 'trim', u=10, v=6, scale=(1.4, 1, 1))
    P.pillow('seat_shell', (0.47, 0.47, 0.03), (0.0, 0, 0.42), 'plastic_int', r=0.012, sub=1)
    P.pillow('seat', (0.48, 0.48, 0.085), (0.01, 0, 0.47), 'paint', r=0.042, sub=1)
    # the back on its bent support bar
    P.tube('back_bar', [(-0.08, 0, 0.385), (-0.27, 0, 0.395), (-0.29, 0, 0.6)], 1.0, 'paint_b', bend=0.07,
           profile=[(-0.009, -0.03), (0.009, -0.03), (0.009, 0.03), (-0.009, 0.03)], sharp=60.0)
    P.pillow('back_shell', (0.03, 0.44, 0.5), (-0.31, 0, 0.8), 'plastic_int', r=0.012, sub=1, rot=(0, -9, 0))
    P.pillow('back', (0.07, 0.43, 0.5), (-0.275, 0, 0.8), 'paint', r=0.034, sub=1, rot=(0, -9, 0), taper=(1.0, 0.92))
    # T armrests: a flat bar out from under the seat and up, the pad on top
    for s in (-1, 1):
        y = s * 0.22
        P.tube('arm', [(0.0, s * 0.1, 0.405), (0.0, y, 0.415), (-0.02, y, 0.625)], 1.0, 'trim', bend=0.04,
               profile=[(-0.008, -0.022), (0.008, -0.022), (0.008, 0.022), (-0.008, 0.022)], sharp=60.0)
        P.pillow('arm_pad', (0.25, 0.065, 0.03), (0.0, y, 0.64), 'trim', r=0.012, sub=1)
    P.views = [('a', 35, 18), ('b', 215, 18)]


def junk_stool(P):
    """A workshop stool: a round pressed-steel seat with a rolled edge on a ring, four splayed tube legs braced
    by a foot ring, bolted at the top, rubber feet."""
    P.ao_distance = 0.06
    zs = 0.5
    P.lathe('seat', [(0.0, zs - 0.032), (0.14, zs - 0.032), (0.163, zs - 0.034), (0.172, zs - 0.026),
                     (0.174, zs - 0.012), (0.168, zs - 0.003), (0.15, zs), (0.0, zs + 0.002)], material='paint',
            segs=32, sharp=40.0)
    P.lathe('ring', [(0.112, zs - 0.06), (0.128, zs - 0.06), (0.128, zs - 0.034), (0.112, zs - 0.034)],
            material='steel', segs=28, loop=True, sharp=50.0)
    rt, rf, zr = 0.12, 0.225, 0.17
    feet = []
    for i in range(4):
        a = math.tau * i / 4 + math.pi / 4
        d = V((math.cos(a), math.sin(a), 0.0))
        top = d * rt + V((0, 0, zs - 0.045))
        foot = d * rf + V((0, 0, 0.015))
        P.tube('leg', [top, foot], 0.012, 'steel', segs=10)
        P.bolt(tuple(d * 0.129 + V((0, 0, zs - 0.047))), normal=tuple(d), r=0.0065, h=0.005, washer=False)
        feet.append((foot.x, foot.y))
    t = (zs - 0.045 - zr) / (zs - 0.045 - 0.015)
    P.torus('foot_ring', rt + (rf - rt) * t, 0.0085, loc=(0, 0, zr), segs=32, rsegs=8, material='steel')
    foot_caps(P, feet, r=0.0145, h=0.022)
    P.views = [('a', 35, 20), ('b', 215, 22)]


def junk_stool_tall(P):
    """A bar stool: a thick round padded seat with a piped edge on its pan, a chrome column with a foot ring on
    three spokes, the chrome base dish with a rubber ring under it."""
    P.ao_distance = 0.06
    zs = 0.75
    P.lathe('seat', [(0.0, zs - 0.07), (0.158, zs - 0.07), (0.17, zs - 0.06), (0.176, zs - 0.042), (0.174, zs - 0.022),
                     (0.164, zs - 0.007), (0.13, zs), (0.0, zs + 0.003)], material='paint', segs=32, sharp=60.0)
    P.torus('piping', 0.171, 0.0045, loc=(0, 0, zs - 0.03), segs=32, rsegs=6, material='paint')
    P.cyl('pan', 0.14, 0.016, (0, 0, zs - 0.078), 'chrome', segs=28, bev=0.004, bsegs=1)
    P.cyl('swivel', 0.06, 0.02, (0, 0, zs - 0.096), 'trim', segs=20, bev=0.004, bsegs=1)
    P.cyl('column', 0.025, zs - 0.15, (0, 0, (zs - 0.1 + 0.05) / 2), 'chrome', segs=16, bev=None)
    zr = 0.3
    P.torus('foot_ring', 0.17, 0.0105, loc=(0, 0, zr), segs=36, rsegs=8, material='chrome')
    P.cyl('ring_collar', 0.034, 0.03, (0, 0, zr), 'chrome', segs=16, bev=0.003, bsegs=1)
    for i in range(3):
        a = math.tau * i / 3 + math.pi / 6
        d = V((math.cos(a), math.sin(a), 0.0))
        P.tube('spoke', [d * 0.03 + V((0, 0, zr)), d * 0.165 + V((0, 0, zr))], 0.0075, 'chrome', segs=8)
    P.lathe('base', [(0.0, 0.006), (0.205, 0.006), (0.218, 0.012), (0.214, 0.02), (0.17, 0.03), (0.07, 0.045),
                     (0.04, 0.056), (0.03, 0.07), (0.0, 0.07)], material='chrome', segs=36, sharp=40.0)
    P.lathe('base_rubber', [(0.19, 0.0), (0.212, 0.0), (0.212, 0.008), (0.19, 0.008)], material='rubber', segs=36,
            loop=True, sharp=50.0)
    P.views = [('a', 35, 18), ('b', 215, 20)]


def junk_sunchair(P):
    """
    A wooden deck chair standing open: the long frame (front feet to the top of the back), the seat frame
    crossing it on a bolt, the rest that props it into a notch, round crossbars, and the striped canvas sling
    hanging from the top bar to the front bar.
    """
    P.ao_distance = 0.08
    ya, yb, yc = 0.282, 0.25, 0.31            # the long frame outside, the seat frame inside, the rest outermost
    F1, T = V((0.32, 0.0, 0.0)), V((-0.40, 0.0, 0.92))
    S, F2 = V((0.43, 0.0, 0.40)), V((-0.30, 0.0, 0.0))
    for s in (-1, 1):
        bar(P, 'long_rail', F1 + V((0, s * ya, 0.02)), T + V((0, s * ya, 0)), 0.022, 0.048, 'paint_b', x_hint=(0, 1, 0),
            bev=0.005, segs=2)
        bar(P, 'seat_rail', S + V((0, s * yb, 0)), F2 + V((0, s * yb, 0.02)), 0.022, 0.048, 'paint_b',
            x_hint=(0, 1, 0), bev=0.005, segs=2)
    # where they cross: a bolt through both
    t = 0.261
    piv = F1 + (T - F1) * t
    for s in (-1, 1):
        P.cyl('pivot', 0.009, 0.06, (piv.x, s * (ya + yb) / 2, piv.z + 0.01), 'steel', axis='Y', segs=10, bev=0.002,
              bsegs=1)
    # the crossbars (round dowels)
    for (p, w) in ((T + V((0, 0, -0.012)), ya + 0.012), (F1 + (T - F1) * 0.09, ya), (S + V((0, 0, -0.006)), yb + 0.012),
                   (F2 + (S - F2) * 0.08, yb)):
        P.cyl('crossbar', 0.0145, 2 * w, (p.x, 0.0, p.z), 'paint_b', axis='Y', segs=12, bev=0.003, bsegs=1)
    # the rest: pivoted on the long frame, its foot bar in a notch of the seat frame's tail
    ra = F1 + (T - F1) * 0.62
    rb = F2 + (S - F2) * 0.12 + V((0, 0, 0.03))
    for s in (-1, 1):
        bar(P, 'rest', ra + V((0, s * yc, 0)), rb + V((0, s * yc, 0)), 0.02, 0.04, 'paint_b', x_hint=(0, 1, 0),
            bev=0.004)
        P.cyl('rest_pin', 0.008, 0.05, (ra.x, s * (yc - 0.012), ra.z), 'steel', axis='Y', segs=10, bev=None)
        for k in range(3):
            n = F2 + (S - F2) * (0.09 + 0.07 * k)
            P.box('notch', (0.03, 0.022, 0.024), (n.x, s * yb, n.z + 0.03), 'paint_b', rot=(0, 29, 0), bev=0.004,
                  segs=1)
    P.cyl('rest_bar', 0.0135, 2 * yc, (rb.x, 0.0, rb.z), 'paint_b', axis='Y', segs=12, bev=0.003, bsegs=1)
    # the canvas sling, wrapped round the top bar and the front bar
    tb, fb = T + V((0, 0, -0.012)), S + V((0, 0, -0.006))
    path = [tb + V((-0.004, 0, 0.017)), tb + V((0.013, 0, 0.009)), tb + V((0.03, 0, -0.03)), V((-0.3, 0, 0.73)),
            V((-0.19, 0, 0.53)), V((-0.06, 0, 0.35)), V((0.08, 0, 0.255)), V((0.23, 0, 0.25)), V((0.34, 0, 0.3)),
            fb + V((-0.02, 0, -0.012)), fb + V((0.006, 0, -0.016)), fb + V((0.017, 0, 0.002)),
            fb + V((0.004, 0, 0.016))]
    strip(P, 'canvas', path, 0.44, 0.004, 'paint', bend=0.03)
    for dy in (-0.165, -0.055, 0.055, 0.165):
        strip(P, 'stripe', path, 0.05, 0.0068, 'paint_b', bend=0.03, dy=dy)
    P.views = [('a', 40, 16), ('b', 215, 16)]


def junk_clockradio(P):
    """A clock radio (face +X): a rounded case, a slotted grille over the speaker, the dark display window in its
    bezel, the long snooze bar and the alarm buttons on top, two knobs, rubber feet, the mains cord behind."""
    P.ao_distance = 0.02
    L, W, H = 0.1, 0.22, 0.092
    zb = 0.006
    P.box('case', (L, W, H), (0, 0, zb + H / 2), 'paint', bev=0.018, segs=3)
    xf = L / 2
    # the speaker: a dark recess behind a slotted grille plate
    gy, gz = -0.052, zb + H * 0.48
    P.box('grille_back', (0.004, 0.088, 0.06), (xf - 0.0005, gy, gz), 'trim', bev=None)
    grille = P.box('grille', (0.004, 0.094, 0.066), (xf + 0.0018, gy, gz), 'paint_b', bev=0.0015, segs=1)
    cut = bmesh.new()
    for k in range(5):
        K.bm_cube(cut, (0.02, 0.078, 0.0055), mat4((xf + 0.002, gy, gz - 0.024 + 0.012 * k)))
    P.cut(grille, cut)
    # the display in its bezel
    dy, dz = 0.052, zb + H * 0.5
    P.box('bezel', (0.004, 0.09, 0.054), (xf + 0.0018, dy, dz), 'paint_b', bev=0.002, segs=1)
    P.box('display', (0.003, 0.074, 0.038), (xf + 0.0042, dy, dz), 'glass_dark', bev=0.001, segs=1)
    # top: snooze bar, alarm buttons, two knobs
    zt = zb + H
    P.box('snooze', (0.026, 0.17, 0.014), (0.016, 0.0, zt + 0.003), 'paint_b', bev=0.005, segs=2)
    for k in range(3):
        P.box('button', (0.014, 0.018, 0.007), (-0.026, -0.03 + 0.03 * k, zt + 0.0005), 'paint_b', bev=0.002, segs=1)
    for y in (-0.078, 0.078):
        knob(P, (-0.022, y, zt - 0.003), axis='Z', r=0.013, h=0.012, material='paint_b', ribs=10, name='knob')
    # feet and the cord out of the back, lying on the floor
    bm = bmesh.new()
    for sx in (-1, 1):
        for sy in (-1, 1):
            K.bm_cyl(bm, 0.008, zb, segs=10, matrix=Matrix.Translation((sx * 0.032, sy * 0.085, zb / 2)))
    P.mesh('feet', bm, 'rubber', bev=0.0015, segs=1)
    P.cyl('grommet', 0.006, 0.01, (-L / 2 - 0.002, 0.07, zb + 0.02), 'trim', axis='X', segs=10, bev=None)
    P.tube('cord', [(-L / 2, 0.07, zb + 0.02), (-L / 2 - 0.03, 0.075, zb + 0.012), (-L / 2 - 0.05, 0.06, 0.004),
                    (-L / 2 - 0.07, 0.0, 0.004), (-L / 2 - 0.06, -0.06, 0.004)], 0.0035, 'trim', segs=6, bend=0.02)
    P.box('plug', (0.03, 0.024, 0.016), (-L / 2 - 0.06, -0.08, 0.008), 'trim', rot=(0, 0, 70), bev=0.003, segs=1)
    P.views = [('a', 30, 18), ('b', 210, 22)]


def planar_band(path, normal, w, th):
    """A flat band (w wide along `normal`, th thick) along a path lying in the plane through it with that normal
    (a scarf over a hook, a tape): returns the bmesh."""
    nrm = V(normal).normalized()
    pts = [V(p) for p in path]
    n = len(pts)
    bm = bmesh.new()
    rings = []
    for i in range(n):
        t = (pts[min(n - 1, i + 1)] - pts[max(0, i - 1)]).normalized()
        q = nrm.cross(t).normalized()
        rings.append([bm.verts.new(pts[i] + q * (sq * th / 2) + nrm * (sw * w / 2))
                      for (sq, sw) in ((-1, -1), (1, -1), (1, 1), (-1, 1))])
    for a, b in zip(rings[:-1], rings[1:]):
        for j in range(4):
            j2 = (j + 1) % 4
            bm.faces.new((a[j], a[j2], b[j2], b[j]))
    bm.faces.new(list(reversed(rings[0])))
    bm.faces.new(rings[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    return bm


def junk_hanger(P):
    """A standing coat rack: a turned wooden pole with a ball finial, three curved feet, four big and four small
    steel hooks at the top, and a knitted scarf thrown over one hook (fringed ends)."""
    P.ao_distance = 0.08
    prof = [(0.0, 0.09), (0.026, 0.09), (0.032, 0.11), (0.03, 0.15), (0.022, 0.19), (0.019, 0.24), (0.018, 0.7),
            (0.0175, 1.1), (0.018, 1.36), (0.024, 1.38), (0.026, 1.4), (0.02, 1.42), (0.019, 1.6), (0.026, 1.615),
            (0.02, 1.632), (0.012, 1.642), (0.024, 1.66), (0.028, 1.68), (0.024, 1.698), (0.0, 1.705)]
    P.lathe('pole', prof, material='paint', segs=16, sharp=45.0)
    for k in range(3):
        a = math.tau * k / 3 + math.pi / 2
        d = V((math.cos(a), math.sin(a), 0.0))
        path = [d * 0.012 + V((0, 0, 0.32)), d * 0.07 + V((0, 0, 0.22)), d * 0.2 + V((0, 0, 0.07)),
                d * 0.3 + V((0, 0, 0.02)), d * 0.33 + V((0, 0, 0.02))]
        P.tube('foot', path, 1.0, 'paint', bend=0.08, profile=[(-0.022, -0.012), (0.022, -0.012), (0.022, 0.012),
                                                               (-0.022, 0.012)], sharp=60.0)
        P.cyl('foot_pad', 0.016, 0.01, tuple(d * 0.325 + V((0, 0, 0.005))), 'rubber', segs=10, bev=0.002, bsegs=1)
    # the hooks: four big ones curling up, four small ones between them lower down
    P.cyl('hook_collar', 0.025, 0.03, (0, 0, 1.53), 'steel', segs=16, bev=0.003, bsegs=1)
    P.cyl('hook_collar', 0.024, 0.024, (0, 0, 1.43), 'steel', segs=16, bev=0.003, bsegs=1)
    ends = []
    for k in range(8):
        big = k % 2 == 0
        a = math.tau * k / 8
        d = V((math.cos(a), math.sin(a), 0.0))
        z0 = 1.53 if big else 1.43
        sc = 1.0 if big else 0.7
        path = [d * 0.02 + V((0, 0, z0)), d * (0.07 * sc) + V((0, 0, z0 - 0.02 * sc)),
                d * (0.12 * sc) + V((0, 0, z0 + 0.03 * sc)), d * (0.125 * sc) + V((0, 0, z0 + 0.1 * sc))]
        P.tube('hook', path, 0.0058, 'steel', segs=8, bend=0.03)
        P.sphere('hook_end', 0.0095, tuple(path[-1]), 'steel', u=10, v=6)
        ends.append((d, z0))
    # the scarf over the first hook, hanging down both sides of it
    d, z0 = ends[0]
    t = V((0, 0, 1)).cross(d).normalized()
    c = d * 0.086 + V((0, 0, z0 - 0.003))
    path = [c + t * -0.05 + V((0, 0, -0.5)), c + t * -0.046 + V((0, 0, -0.3)), c + t * -0.032 + V((0, 0, -0.1)),
            c + t * -0.016 + V((0, 0, -0.02)), c + V((0, 0, 0.0065)), c + t * 0.016 + V((0, 0, -0.02)),
            c + t * 0.03 + V((0, 0, -0.1)), c + t * 0.04 + V((0, 0, -0.26)), c + t * 0.05 + V((0, 0, -0.38))]
    path = K.fillet_path(path, 0.03)
    P.mesh('scarf', planar_band(path, d, 0.13, 0.009), 'paint_b', sharp=60.0)
    bm = bmesh.new()
    for end in (path[0], path[-1]):
        for i in range(6):
            q = end + d * (-0.054 + 0.0216 * i) + V((0, 0, -0.022))
            K.bm_cube(bm, (0.008, 0.008, 0.045), Matrix.Translation(q) @ K.frame_from_z(t * 0.0 + V((0, 0, 1)), d))
    P.mesh('fringe', bm, 'paint_b', bev=0.002, segs=1)
    P.views = [('a', 35, 12), ('b', 215, 14)]


def junk_coffee(P):
    """A drip coffee maker (front +X): the base with its hotplate and a red rocker switch, the water tower at the
    back with its window, the head with the swing-out filter basket and the hinged lid, the glass carafe with
    its collar, lid and handle (old coffee dried in the bottom), the mains cord."""
    P.ao_distance = 0.04
    D, W = 0.25, 0.2
    P.box('base', (D, W, 0.05), (0.0, 0.0, 0.025), 'paint', bev=0.012, segs=2)
    P.cyl('hotplate', 0.066, 0.006, (0.05, 0.0, 0.053), 'trim', segs=24, bev=0.002, bsegs=1)
    P.box('switch_bezel', (0.004, 0.034, 0.022), (D / 2 + 0.001, 0.055, 0.026), 'trim', bev=0.002, segs=1)
    P.box('switch', (0.008, 0.026, 0.015), (D / 2 + 0.004, 0.055, 0.026), 'paint_b', rot=(0, 10, 0), bev=0.002,
          segs=1)
    xt = -D / 2 + 0.05
    P.box('tower', (0.1, W, 0.25), (xt, 0.0, 0.05 + 0.125), 'paint', bev=0.012, segs=2)
    P.box('window', (0.03, 0.004, 0.15), (xt, -W / 2 - 0.001, 0.17), 'glass', bev=0.0015, segs=1)
    for k in range(4):
        P.box('level', (0.008, 0.0015, 0.003), (xt + 0.024, -W / 2 - 0.0012, 0.115 + 0.035 * k), 'paint_b', bev=None)
    P.box('head', (D, W, 0.07), (0.0, 0.0, 0.32 - 0.035), 'paint', bev=0.014, segs=2)
    P.box('lid', (0.15, 0.17, 0.012), (-0.02, 0.0, 0.326), 'paint', bev=0.004, segs=1)
    P.box('lid_lip', (0.02, 0.07, 0.016), (0.065, 0.0, 0.324), 'paint', bev=0.005, segs=1)
    # the filter basket under the head, its handle out to the right
    P.lathe('basket', [(0.0, 0.203), (0.03, 0.205), (0.05, 0.215), (0.066, 0.238), (0.068, 0.25)], loc=(0.055, 0, 0),
            material='paint', segs=20, close='end', sharp=45.0)
    P.box('basket_handle', (0.024, 0.07, 0.014), (0.07, -0.1, 0.24), 'paint', bev=0.005, segs=1)
    # the carafe on the hotplate
    cx = 0.055
    z0 = 0.056
    P.lathe('carafe', [(0.0, z0), (0.056, z0), (0.064, z0 + 0.012), (0.067, z0 + 0.035), (0.064, z0 + 0.065),
                       (0.052, z0 + 0.095), (0.045, z0 + 0.11)], loc=(cx, 0, 0), material='glass', segs=24,
            close='end', sharp=50.0)
    P.cyl('dregs', 0.054, 0.01, (cx, 0.0, z0 + 0.007), 'leather', segs=20, bev=None)
    P.lathe('collar', [(0.044, z0 + 0.103), (0.05, z0 + 0.104), (0.051, z0 + 0.13), (0.046, z0 + 0.134),
                       (0.04, z0 + 0.134)], loc=(cx, 0, 0), material='paint', segs=20, sharp=45.0)
    P.lathe('carafe_lid', [(0.046, z0 + 0.132), (0.04, z0 + 0.138), (0.02, z0 + 0.145), (0.0, z0 + 0.146)],
            loc=(cx, 0, 0), material='paint', segs=20, close='start', sharp=45.0)
    P.tube('carafe_handle', [(cx + 0.045, -0.02, z0 + 0.12), (cx + 0.085, -0.03, z0 + 0.11),
                             (cx + 0.09, -0.03, z0 + 0.04), (cx + 0.062, -0.02, z0 + 0.025)], 1.0, 'paint', bend=0.02,
           profile=[(-0.006, -0.009), (0.006, -0.009), (0.006, 0.009), (-0.006, 0.009)], sharp=60.0)
    P.box('spout', (0.02, 0.022, 0.008), (cx - 0.048, 0.0, z0 + 0.128), 'paint', bev=0.003, segs=1)
    P.tube('cord', [(-D / 2, 0.06, 0.02), (-D / 2 - 0.04, 0.07, 0.006), (-D / 2 - 0.08, 0.02, 0.0035)], 0.0035,
           'trim', segs=6, bend=0.03)
    P.views = [('a', 35, 16), ('b', 215, 18)]


def junk_fax(P):
    """An old fax machine (front +X): a wedge-shaped body, the keypad (12 keys and two big ones) and a small
    display on the slope, the handset on its cradle on the left with its coiled cord, the paper outlet slot,
    the document guide sloping up at the back."""
    P.ao_distance = 0.03
    D, W = 0.25, 0.32
    hf, hb = 0.045, 0.115
    poly = [(-D / 2, 0.0), (D / 2, 0.0), (D / 2, hf), (-0.06, hb), (-D / 2, hb)]
    P.prism('body', poly, W, matrix=mat4((0, 0, 0), (90, 0, 0)), material='paint', bev=0.008, segs=2)
    slope = math.degrees(math.atan2(hb - hf, D / 2 + 0.06))
    sn, cs = math.sin(math.radians(slope)), math.cos(math.radians(slope))

    def on_slope(u, y, h=0.0):
        """A point on the slope, u along it from the front edge, h above it."""
        return (D / 2 - u * cs + h * sn, y, hf + u * sn + h * cs)

    # keypad on the right (+Y), display above it
    for row in range(4):
        for col in range(3):
            P.box('key', (0.015, 0.017, 0.007), on_slope(0.035 + 0.022 * row, 0.05 + 0.023 * col, 0.002), 'paint_b',
                  rot=(0, slope, 0), bev=0.002, segs=1)
    for k in range(2):
        P.box('key_big', (0.018, 0.03, 0.008), on_slope(0.06 + 0.03 * k, 0.13, 0.002), 'paint_b', rot=(0, slope, 0),
              bev=0.0025, segs=1)
    P.box('display', (0.03, 0.085, 0.004), on_slope(0.145, 0.073, 0.0), 'glass_dark', rot=(0, slope, 0), bev=0.0015,
          segs=1)
    # the handset on its cradle on the left (-Y)
    yc = -0.105
    P.box('cradle', (0.19, 0.075, 0.055), (0.0, yc, 0.0925), 'paint', bev=0.008, segs=2)
    zh = 0.135
    for x in (-0.068, 0.068):
        P.pillow('handset_cup', (0.05, 0.058, 0.03), (x, yc, zh), 'paint', r=0.012, sub=1)
    P.pillow('handset_grip', (0.11, 0.036, 0.024), (0.0, yc, zh + 0.012), 'paint', r=0.01, sub=1)
    # the coiled cord from the handset's front down to the side
    a = V((0.09, yc - 0.012, zh - 0.008))
    b = V((0.07, -W / 2 - 0.004, 0.03))
    pts = []
    turns, per = 9, 8
    ax = (b - a)
    up = ax.normalized().cross(V((0, 0, 1))).normalized()
    side = ax.normalized().cross(up).normalized()
    for i in range(turns * per + 1):
        u = i / (turns * per)
        c = a + ax * u + V((0.0, -0.03 * math.sin(math.pi * u), -0.03 * math.sin(math.pi * u)))
        ang = math.tau * i / per
        pts.append(c + up * (0.0065 * math.cos(ang)) + side * (0.0065 * math.sin(ang)))
    P.tube('cord', pts, 0.0022, 'paint', segs=4, bend=0.0, caps=True)
    P.cyl('cord_socket', 0.008, 0.008, (0.07, -W / 2 - 0.002, 0.03), 'trim', axis='Y', segs=10, bev=None)
    # the paper outlet slot and the document guide behind
    P.box('slot', (0.004, 0.22, 0.008), (D / 2 + 0.0005, 0.04, 0.026), 'trim', bev=None)
    P.box('feed_slot', (0.03, 0.22, 0.006), (-0.075, 0.04, hb + 0.0005 - 0.012 * 0.0), 'trim', bev=None)
    guide = mat4((-0.14, 0.04, 0.168), (0, 59, 0))
    bm = bmesh.new()
    K.bm_cube(bm, (0.12, 0.23, 0.004), guide)
    for sy in (-1, 1):
        K.bm_cube(bm, (0.1, 0.004, 0.016), guide @ Matrix.Translation((0.0, sy * 0.09, 0.008)))
    P.mesh('guide', bm, 'trim', bev=0.0015, segs=1)
    P.views = [('a', 30, 24), ('b', 210, 24)]


def junk_box_food(P):
    """An empty cardboard box, open: walls and bottom of corrugated board, its four flaps standing up splayed
    out at different angles, the cut tape along the long flaps' edges and down the ends."""
    P.ao_distance = 0.05
    L, W, H, t = 0.35, 0.25, 0.2, 0.005
    P.box('bottom', (L, W, t), (0, 0, t / 2), 'paint', bev=0.0015, segs=1)
    for s in (-1, 1):
        P.box('wall', (L, t, H), (0, s * (W / 2 - t / 2), H / 2), 'paint', bev=0.0015, segs=1)
        P.box('wall', (t, W - 2 * t, H), (s * (L / 2 - t / 2), 0, H / 2), 'paint', bev=0.0015, segs=1)
    fd = W / 2 - 0.004                       # flap depth (half the width)
    # long flaps (on the +-Y walls), hinged on the wall tops, opened outwards by `ang` degrees from upright
    for (s, ang) in ((1, 28.0), (-1, 52.0)):
        hinge = V((0, s * (W / 2 - t / 2), H))
        m = Matrix.Translation(hinge) @ Matrix.Rotation(math.radians(s * -ang), 4, 'X')
        bm = bmesh.new()
        K.bm_cube(bm, (L - 0.004, t, fd), m @ Matrix.Translation((0, 0, fd / 2)))
        P.mesh('flap', bm, 'paint', bev=0.0015, segs=1)
        # the half of the old tape left along its edge, wrapped over it
        bm = bmesh.new()
        K.bm_cube(bm, (L * 0.92, t + 0.002, 0.024), m @ Matrix.Translation((0, 0, fd - 0.012 + 0.0006)))
        P.mesh('tape', bm, 'paint_b', bev=0.0008, segs=1)
    for (s, ang) in ((1, 14.0), (-1, 72.0)):
        hinge = V((s * (L / 2 - t / 2), 0, H))
        m = Matrix.Translation(hinge) @ Matrix.Rotation(math.radians(s * ang), 4, 'Y')
        bm = bmesh.new()
        K.bm_cube(bm, (t, W - 0.012, fd), m @ Matrix.Translation((0, 0, fd / 2)))
        P.mesh('flap', bm, 'paint', bev=0.0015, segs=1)
        # tape down the end wall from the top
        P.box('tape', (0.0016, 0.05, 0.075), (s * (L / 2 + 0.0008), 0.0, H - 0.037), 'paint_b', bev=None)
    P.views = [('a', 35, 26), ('b', 215, 26)]


def coil(P, name, a, b, r, turns, material='steel', ridge=0.0022, segs=10):
    """A close-wound coil spring from a to b (coil radius r), as a ribbed tube: reads as a coil, costs little."""
    a, b = V(a), V(b)
    L = (b - a).length
    prof = [(0.0, 0.0), (r * 0.7, 0.0)]
    n = turns
    for i in range(n):
        z = L * i / n
        prof += [(r, z + L * 0.1 / n), (r + ridge, z + L * 0.55 / n)]
    prof += [(r, L * (1 - 0.1 / n)), (r * 0.7, L), (0.0, L)]
    return P.lathe(name, prof, loc=tuple(a), material=material, axis=(b - a), segs=segs, sharp=50.0)


def junk_lamp(P):
    """A balanced-arm desk lamp: a heavy round base with its swivel, the lower and upper arms each of two parallel
    rods with knuckle joints, two coil springs, the cone shade with its switch and a bulb in it, the cord."""
    P.ao_distance = 0.04
    P.lathe('base', [(0.0, 0.0), (0.086, 0.0), (0.09, 0.006), (0.088, 0.02), (0.075, 0.03), (0.035, 0.036),
                     (0.03, 0.042), (0.0, 0.042)], material='paint', segs=24, sharp=40.0)
    P.cyl('swivel', 0.022, 0.02, (0, 0, 0.052), 'steel', segs=16, bev=0.003, bsegs=1)
    k0 = V((0.0, 0.0, 0.07))                 # the base knuckle
    k1 = V((-0.07, 0.0, 0.31))               # the elbow
    k2 = V((0.19, 0.0, 0.37))                # the head joint
    P.box('fork', (0.03, 0.04, 0.03), (0.0, 0.0, 0.062), 'steel', bev=0.004, segs=1)
    for (p, w) in ((k0, 0.03), (k1, 0.03), (k2, 0.026)):
        P.cyl('knuckle', 0.013, w + 0.01, tuple(p), 'steel', axis='Y', segs=12, bev=0.002, bsegs=1)
        for s in (-1, 1):
            P.cyl('knuckle_nut', 0.0085, 0.006, tuple(p + V((0, s * (w / 2 + 0.008), 0))), 'steel', axis='Y', segs=6,
                  bev=None)
    for s in (-1, 1):
        P.tube('arm_low', [k0 + V((0, s * 0.012, 0)), k1 + V((0, s * 0.012, 0))], 0.0048, 'steel', segs=8)
        P.tube('arm_up', [k1 + V((0, s * 0.01, 0)), k2 + V((0, s * 0.01, 0))], 0.0045, 'steel', segs=8)
    # the springs from the fork to a cross pin on the lower arm
    pin = k0 + (k1 - k0) * 0.62
    P.cyl('spring_pin', 0.004, 0.07, tuple(pin), 'steel', axis='Y', segs=8, bev=None)
    for s in (-1, 1):
        a = V((0.022, s * 0.03, 0.065))
        b = pin + V((0.0, s * 0.03, 0.0))
        coil(P, 'spring', a + (b - a).normalized() * 0.012, b - (b - a).normalized() * 0.012, 0.0065, 9, segs=8)
        P.tube('spring_hook', [a, a + (b - a).normalized() * 0.014], 0.002, 'steel', segs=5)
        P.tube('spring_hook', [b - (b - a).normalized() * 0.014, b], 0.002, 'steel', segs=5)
    # the shade, hanging forward and down from the head joint
    d = V((0.55, 0.0, -0.835)).normalized()
    top = k2 + V((0.03, 0.0, -0.01))
    m = Matrix.Translation(top) @ K.frame_from_z(d, (1, 0, 0))
    P.box('head_bracket', (0.04, 0.02, 0.014), tuple((k2 + top) / 2), 'steel', bev=0.003, segs=1)
    prof = [(0.0, 0.0), (0.024, 0.0), (0.03, 0.012), (0.036, 0.034), (0.056, 0.078), (0.078, 0.122), (0.081, 0.13)]
    bm = bmesh.new()
    K.bm_lathe(bm, K.shell_profile(prof, 0.0028), segs=20, matrix=m, loop=True)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    P.mesh('shade', bm, 'paint', sharp=45.0)
    P.lathe('socket', [(0.0, 0.0), (0.016, 0.0), (0.016, 0.045), (0.0, 0.045)], loc=tuple(top), material='steel',
            axis=d, segs=12, sharp=50.0)
    P.sphere('bulb', 0.024, tuple(top + d * 0.072), 'emit', u=12, v=6, scale=(1, 1, 1))
    P.cyl('switch', 0.0075, 0.016, tuple(top - d * 0.006 + V((-0.012, 0, 0.012))), 'trim', segs=10, bev=None)
    P.tube('cord', [top - d * 0.004 + V((-0.01, 0, 0.0)), k2 + V((-0.04, 0.0, 0.012)), k1 + V((0.03, 0.0, 0.02)),
                    k1 + V((-0.015, 0.0, -0.03)), k0 + V((-0.03, 0.0, 0.03)), V((-0.085, 0.0, 0.025)),
                    V((-0.13, 0.03, 0.004))], 0.0028, 'trim', segs=5, bend=0.02)
    P.views = [('a', 35, 16), ('b', 215, 18)]


def junk_barrel(P):
    """A 200 L steel drum: the body with its two rolling hoops and the rolled top and bottom chimes (the bands in
    the second colour), the head with its 2-inch bung and the vent, a dent in its side."""
    P.ao_distance = 0.1
    R, H = 0.29, 0.88
    hoops = (H / 3, 2 * H / 3)
    prof = [(0.0, 0.006), (R - 0.035, 0.006), (R - 0.025, 0.0), (R + 0.004, 0.0), (R + 0.008, 0.009),
            (R + 0.005, 0.02), (R, 0.026)]
    zs = [0.08, 0.15, 0.22]
    for z in zs:
        prof.append((R, z))
    for k, zh in enumerate(hoops):
        prof += [(R, zh - 0.03), (R + 0.012, zh - 0.012), (R + 0.012, zh + 0.012), (R, zh + 0.03)]
        mids = [zh + 0.03 + (hoops[1] - hoops[0] - 0.06) * f for f in (0.2, 0.4, 0.6, 0.8)] if k == 0 else \
            [0.66, 0.73, 0.8]
        if k == 0:
            mids = [zh + 0.03 + (hoops[1] - hoops[0] - 0.06) * f for f in (0.12, 0.25, 0.37, 0.5, 0.62, 0.75, 0.88)]
        for z in mids:
            prof.append((R, z))
    prof += [(R, H - 0.026), (R + 0.005, H - 0.02), (R + 0.008, H - 0.009), (R + 0.004, H), (R - 0.025, H),
             (R - 0.035, H - 0.006), (0.0, H - 0.006)]
    bm = bmesh.new()
    K.bm_lathe(bm, prof, segs=48)
    # the dent, between the hoops
    a0, zd, rd, dep = -0.3, 0.45, 0.12, 0.06
    for v in bm.verts:
        r = math.hypot(v.co.x, v.co.y)
        if r < R - 0.001 or r > R + 0.001 or v.co.z < hoops[0] + 0.03 or v.co.z > hoops[1] - 0.03:
            continue
        a = math.atan2(v.co.y, v.co.x)
        da = (a - a0 + math.pi) % math.tau - math.pi
        d2 = ((R * da) ** 2 + ((v.co.z - zd) * 1.3) ** 2) / rd ** 2
        if d2 >= 1.0:
            continue
        w = (1 - d2) ** 1.5
        k = 1 - dep * w / r
        v.co.x *= k
        v.co.y *= k
    for f in bm.faces:
        z = f.calc_center_median().z
        rc = f.calc_center_median().xy.length
        if ((z < 0.026 or z > H - 0.026) and rc > R - 0.033) or any(abs(z - zh) < 0.03 for zh in hoops):
            f.material_index = 1
    P.mesh('drum', bm, ['paint', 'paint_b'], sharp=30.0)
    bx = R * 0.55
    P.cyl('bung', 0.04, 0.012, (bx, 0.0, H - 0.002), 'steel', segs=16, bev=0.002, bsegs=1)
    P.cyl('bung_cap', 0.032, 0.014, (bx, 0.0, H + 0.011), 'steel', segs=8, bev=0.002, bsegs=1)
    P.box('bung_tab', (0.012, 0.05, 0.008), (bx, 0.0, H + 0.021), 'steel', bev=0.002, segs=1)
    P.cyl('vent', 0.02, 0.01, (-R * 0.55, 0.05, H - 0.002), 'steel', segs=12, bev=0.0015, bsegs=1)
    P.cyl('vent_cap', 0.015, 0.012, (-R * 0.55, 0.05, H + 0.008), 'steel', segs=6, bev=0.0015, bsegs=1)
    P.views = [('a', 35, 18), ('b', 215, 18)]


def junk_mop(P):
    """A mop lying on the floor along X: the painted handle with its hanging cap, the steel clamp with its wing
    screw, and the head of thick twisted strands splayed out over the floor."""
    P.ao_distance = 0.015
    a, b = V((-0.74, 0.0, 0.0145)), V((0.5, 0.0, 0.0335))
    P.tube('handle', [a, b], 0.0125, 'paint', segs=12)
    P.cyl('cap', 0.0145, 0.04, tuple(a + (b - a).normalized() * 0.012), 'paint_b', axis=(b - a), segs=12, bev=0.003,
          bsegs=1)
    P.torus('hang_loop', 0.012, 0.003, loc=tuple(a - (b - a).normalized() * 0.012 + V((0, 0, 0.0))), axis='Y', segs=12,
            rsegs=5, material='paint_b')
    ax = (b - a).normalized()
    c = b + ax * 0.03
    P.cyl('collar', 0.02, 0.07, tuple(c), 'steel', axis=ax, segs=14, bev=0.003, bsegs=1)
    P.cyl('clamp', 0.033, 0.03, tuple(c + ax * 0.045), 'steel', axis=ax, segs=16, bev=0.004, bsegs=2)
    P.cyl('wing_screw', 0.004, 0.03, tuple(c + V((0.0, 0.0, 0.03))), 'steel', segs=8, bev=None)
    P.box('wing', (0.008, 0.032, 0.012), tuple(c + V((0.0, 0.0, 0.048))), 'steel', bev=0.003, segs=1)
    # the strands: bunched in the clamp, then out over the floor in a fan
    mouth = c + ax * 0.06
    rs = 0.0088
    prof = [(math.cos(math.tau * i / 6) * (1.0 if i % 2 == 0 else 0.62),
             math.sin(math.tau * i / 6) * (1.0 if i % 2 == 0 else 0.62)) for i in range(6)]
    n = 13
    for i in range(n):
        u = i / (n - 1) - 0.5
        ph = math.tau * i / n
        p0 = mouth + V((0.0, 0.016 * math.cos(ph), 0.016 * math.sin(ph)))
        ang = u * 1.9 + 0.12 * jit(i, 1.0)
        ln = 0.27 + 0.06 * (0.5 + jit(i, 2.0))
        dirv = V((math.cos(ang), math.sin(ang), 0.0))
        lift = rs + 0.0015 + (0.008 if i % 3 == 1 else 0.0)
        p1 = p0 + dirv * 0.05 + V((0, 0, -0.012))
        p1.z = max(p1.z, lift + 0.004)
        p2 = p0 + dirv * (ln * 0.55)
        p2.z = lift
        p3 = p0 + dirv * ln + V((0.0, 0.03 * jit(i, 3.0), 0.0))
        p3.z = lift
        P.tube('strand', [p0, p1, p2, p3], rs, 'paint_b', profile=prof, twist=math.tau * (2.0 + 0.4 * jit(i, 4.0)),
               bend=0.04, caps=True, sharp=70.0)
    P.views = [('a', 30, 30), ('b', 210, 30)]


def junk_crate_plastic(P):
    """A stacking crate: walls pierced with rows of slots, a hand hole in each end, the thick rim round the top,
    reinforced corners, a stacking foot under it and a label plate on one side."""
    P.ao_distance = 0.05
    L, W, H, t = 0.5, 0.35, 0.28, 0.008
    zb = 0.012                                   # the stacking foot
    P.box('foot', (L - 0.03, W - 0.03, zb), (0, 0, zb / 2), 'paint', bev=0.003, segs=1)
    P.box('bottom', (L - 0.004, W - 0.004, 0.01), (0, 0, zb + 0.005), 'paint', bev=0.002, segs=1)
    zw = zb + (H - zb) / 2
    hw = H - zb
    for s in (-1, 1):
        # a long wall: two rows of six slots, the label plate in the middle of the upper row on one side
        wall = P.box('wall', (L, t, hw), (0, s * (W / 2 - t / 2), zw), 'paint', bev=0.0015, segs=1)
        cut = bmesh.new()
        for (zr, hr) in ((zb + 0.065, 0.075), (zb + 0.165, 0.075)):
            for k in range(5):
                x = -0.18 + 0.09 * k
                if s > 0 and zr > zb + 0.1 and k == 2:
                    continue
                K.bm_cube(cut, (0.06, 0.05, hr), mat4((x, s * (W / 2 - t / 2), zr)))
        P.cut(wall, cut)
        # an end wall: two rows of three slots, the hand hole
        wall = P.box('wall', (t, W - 2 * t, hw), (s * (L / 2 - t / 2), 0, zw), 'paint', bev=0.0015, segs=1)
        cut = bmesh.new()
        for (zr, hr) in ((zb + 0.06, 0.07), (zb + 0.15, 0.07)):
            for k in range(2):
                K.bm_cube(cut, (0.05, 0.07, hr), mat4((s * (L / 2 - t / 2), -0.06 + 0.12 * k, zr)))
        hole = K.rounded_rect(0.034, 0.12, 0.0165, seg=3)
        K.bm_prism(cut, hole, 0.05, matrix=Matrix.Translation((s * (L / 2 - t / 2), 0.0, H - 0.05)) @
                   K.axis_matrix('X'))
        P.cut(wall, cut)
    # the rim, the corners, the label
    for s in (-1, 1):
        P.box('rim', (L + 0.008, 0.016, 0.026), (0, s * (W / 2 - 0.004), H - 0.013), 'paint', bev=0.004, segs=1)
        P.box('rim', (0.016, W + 0.008, 0.026), (s * (L / 2 - 0.004), 0, H - 0.013), 'paint', bev=0.004, segs=1)
    for sx in (-1, 1):
        for sy in (-1, 1):
            P.box('corner', (0.036, 0.036, H - 0.03), (sx * (L / 2 - 0.014), sy * (W / 2 - 0.014), zb + (H - 0.03) / 2),
                  'paint', bev=0.005, segs=1)
    P.box('label', (0.1, 0.004, 0.062), (0.0, W / 2 + 0.001, zb + 0.165), 'paint_b', bev=0.0015, segs=1)
    P.views = [('a', 35, 24), ('b', 215, 24)]


def junk_transceiver(P):
    """
    A field radio set (face +X): the olive case with a lip round its recessed front panel, a big tuning dial
    window with its knob, a meter, a row of knobs and toggles, two connectors, panel screws, grab handles at
    the front, latches and feet, a broken-off whip on its antenna base, the handset lying on top on its cord.
    """
    P.ao_distance = 0.05
    D, W, H = 0.3, 0.45, 0.25
    zb = 0.012
    P.box('case', (D - 0.02, W, H - zb), (-0.01, 0.0, zb + (H - zb) / 2), 'paint', bev=0.012, segs=2)
    xf = D / 2
    zm = zb + (H - zb) / 2
    for (y, z, sy, sz) in ((0.0, H - 0.012, W, 0.024), (0.0, zb + 0.012, W, 0.024), (W / 2 - 0.012, zm, 0.024, H - zb),
                           (-W / 2 + 0.012, zm, 0.024, H - zb)):
        P.box('lip', (0.03, sy, sz), (xf - 0.015, y, z), 'paint', bev=0.006, segs=1)
    xp = xf - 0.012                                   # the panel face
    P.box('panel', (0.01, W - 0.046, H - zb - 0.046), (xp - 0.005, 0.0, zb + (H - zb) / 2), 'trim', bev=0.002, segs=1)
    # the tuning dial: a round window in a ring, the big knob under it
    dy, dz = -0.115, 0.17
    P.cyl('dial_face', 0.046, 0.003, (xp + 0.0015, dy, dz), 'gauge', axis='X', segs=20, bev=None)
    for k in range(8):
        a = math.tau * k / 8
        P.box('dial_mark', (0.002, 0.003, 0.009 if k % 2 else 0.014), (xp + 0.0035, dy + 0.037 * math.cos(a),
                                                                       dz + 0.037 * math.sin(a)), 'trim',
              rot=(math.degrees(a) - 90, 0, 0), bev=None)
    P.cyl('dial_glass', 0.046, 0.004, (xp + 0.005, dy, dz), 'glass_dark', axis='X', segs=20, bev=None)
    P.torus('dial_ring', 0.048, 0.0045, loc=(xp + 0.006, dy, dz), axis='X', segs=16, rsegs=4, material='alu')
    knob(P, (xp, dy, 0.075), axis='X', r=0.026, h=0.026, material='alu', ribs=8, name='tune_knob', skirt=0.008,
         segs=14)
    # the meter
    my, mz = 0.08, 0.175
    P.box('meter_face', (0.003, 0.08, 0.055), (xp + 0.0015, my, mz), 'gauge', bev=None)
    P.box('needle', (0.002, 0.003, 0.04), (xp + 0.0035, my + 0.006, mz - 0.006), 'trim', rot=(-28, 0, 0), bev=None)
    P.box('meter_glass', (0.004, 0.08, 0.055), (xp + 0.005, my, mz), 'glass_dark', bev=0.001, segs=1)
    P.box('meter_bezel', (0.006, 0.092, 0.067), (xp + 0.002, my, mz), 'alu', bev=0.003, segs=1)
    # knobs and toggles along the bottom, connectors on the left
    for k, y in enumerate((0.0, 0.06, 0.12)):
        knob(P, (xp, y, 0.075), axis='X', r=0.016, h=0.018, material='alu', name='knob', skirt=0.005, segs=10)
    for k, y in enumerate((0.03, 0.065, 0.1, 0.135)):
        P.cyl('toggle_nut', 0.007, 0.006, (xp + 0.003, y, 0.128), 'chrome', axis='X', segs=6, bev=None)
        P.tube('toggle', [(xp + 0.005, y, 0.128), (xp + 0.024, y, 0.128 + (0.008 if k % 2 else -0.008))], 0.0028,
               'chrome', segs=6)
    for z in (0.07, 0.108):
        P.cyl('connector', 0.014, 0.02, (xp + 0.01, 0.178, z), 'alu', axis='X', segs=12, bev=None)
        P.cyl('connector_pin', 0.006, 0.004, (xp + 0.021, 0.178, z), 'trim', axis='X', segs=8, bev=None)
    for sy in (-1, 1):
        for sz in (-1, 1):
            P.cyl('panel_screw', 0.0055, 0.004, (xp + 0.002, sy * (W / 2 - 0.037), zb + (H - zb) / 2 + sz * 0.085),
                  'alu', axis='X', segs=8, bev=None)
    # grab handles on the front, latches on the sides, feet
    for sy in (-1, 1):
        y = sy * (W / 2 - 0.01)
        P.tube('grab', [(xf, y, 0.06), (xf + 0.03, y, 0.062), (xf + 0.043, y, 0.075), (xf + 0.045, y, 0.09),
                        (xf + 0.045, y, 0.17), (xf + 0.043, y, 0.185), (xf + 0.03, y, 0.198), (xf, y, 0.2)], 0.007,
               'steel', segs=6, bend=0.0)
        for x in (-0.09, 0.07):
            P.box('latch', (0.03, 0.014, 0.045), (x, sy * (W / 2 + 0.005), 0.16), 'steel', bev=0.003, segs=1)
    bm = bmesh.new()
    for sx in (-1, 1):
        for sy in (-1, 1):
            K.bm_cube(bm, (0.04, 0.04, zb), Matrix.Translation((sx * 0.11, sy * 0.18, zb / 2)))
    P.mesh('feet', bm, 'rubber', bev=None)
    # the antenna base on top, its whip snapped off
    ax, ay = -0.09, -0.17
    P.cyl('ant_base', 0.024, 0.018, (ax, ay, H + 0.009), 'alu', segs=14, bev=0.003, bsegs=1)
    P.cyl('ant_collar', 0.012, 0.03, (ax, ay, H + 0.033), 'steel', segs=10, bev=None)
    P.tube('whip', [(ax, ay, H + 0.04), (ax + 0.005, ay, H + 0.2)], 0.0045, 'steel', segs=6)
    # the handset lying on the top, its cord down to the lower connector
    hx, hy, hz = 0.02, 0.06, H
    P.cyl('ear_cup', 0.03, 0.026, (hx - 0.075, hy, hz + 0.013), 'paint_b', segs=12, bev=0.006, bsegs=1)
    P.cyl('mouth_cup', 0.028, 0.026, (hx + 0.075, hy, hz + 0.013), 'paint_b', segs=12, bev=0.006, bsegs=1)
    P.tube('grip', [(hx - 0.07, hy, hz + 0.022), (hx - 0.035, hy, hz + 0.042), (hx + 0.035, hy, hz + 0.042),
                    (hx + 0.07, hy, hz + 0.022)], 0.016, 'paint_b', segs=7, bend=0.02)
    P.box('ptt', (0.022, 0.012, 0.012), (hx, hy - 0.016, hz + 0.042), 'trim', bev=0.003, segs=1)
    P.tube('cord', [(hx + 0.095, hy, hz + 0.012), (xf + 0.02, hy + 0.06, H - 0.002), (xf + 0.045, 0.17, 0.17),
                    (xf + 0.035, 0.178, 0.1), (xp + 0.02, 0.178, 0.07)], 0.0045, 'rubber', segs=5, bend=0.03)
    P.views = [('a', 30, 20), ('b', 210, 24)]


def junk_record(P):
    """A suitcase record player with its lid open behind it: the case with a recessed deck, the platter with a
    ten-inch record on it, the chrome tone arm on its pivot with the counterweight, resting on its post, the
    speed lever and two knobs, the speaker grille in the lid, latches, hinges, a handle and feet."""
    P.ao_distance = 0.04
    D, W, H = 0.32, 0.4, 0.11
    zf = 0.008
    P.box('case', (D, W, H - 0.012 - zf), (0, 0, zf + (H - 0.012 - zf) / 2), 'paint', bev=0.008, segs=2)
    for (x, y, sx, sy) in ((0.0, W / 2 - 0.008, D, 0.016), (0.0, -W / 2 + 0.008, D, 0.016),
                           (D / 2 - 0.008, 0.0, 0.016, W), (-D / 2 + 0.008, 0.0, 0.016, W)):
        P.box('case_rim', (sx, sy, 0.02), (x, y, H - 0.01), 'paint', bev=0.005, segs=1)
    zd = H - 0.012                               # the deck
    P.box('deck', (D - 0.03, W - 0.03, 0.004), (0, 0, zd), 'plastic_int', bev=None)
    bm = bmesh.new()
    for sx in (-1, 1):
        for sy in (-1, 1):
            at = Matrix.Translation((sx * (D / 2 - 0.03), sy * (W / 2 - 0.035), zf / 2))
            K.bm_cyl(bm, 0.012, zf, segs=8, matrix=at)
    P.mesh('feet', bm, 'rubber', bev=None)
    # platter, record, spindle
    px, py = 0.005, -0.05
    P.cyl('platter', 0.12, 0.012, (px, py, zd + 0.008), 'trim', segs=32, bev=None)
    P.cyl('record', 0.127, 0.003, (px, py, zd + 0.0155), 'rubber', segs=32, bev=None)
    P.cyl('label', 0.044, 0.0012, (px, py, zd + 0.0175), 'paint', segs=20, bev=None)
    P.cyl('spindle', 0.0035, 0.018, (px, py, zd + 0.02), 'chrome', segs=8, bev=None)
    # the tone arm: pivot at the back right, the arm forward to its rest
    pv = V((-0.105, 0.135, zd))
    P.cyl('arm_base', 0.022, 0.012, tuple(pv + V((0, 0, 0.008))), 'alu', segs=16, bev=0.002, bsegs=1)
    P.cyl('arm_pivot', 0.011, 0.026, tuple(pv + V((0, 0, 0.026))), 'chrome', segs=12, bev=None)
    za = zd + 0.034
    P.tube('arm', [pv + V((-0.045, 0.004, 0.034)), pv + V((0.0, 0.0, 0.034)), V((0.08, 0.15, za)),
                   V((0.11, 0.135, za - 0.004))], 0.0042, 'chrome', segs=8, bend=0.03)
    P.cyl('counterweight', 0.012, 0.024, tuple(pv + V((-0.05, 0.004, 0.034))), 'alu', axis='X', segs=12, bev=0.002,
          bsegs=1)
    P.box('headshell', (0.032, 0.018, 0.008), (0.122, 0.128, za - 0.007), 'trim', rot=(0, 0, -25), bev=0.002, segs=1)
    P.cyl('arm_rest', 0.006, 0.03, (0.085, 0.152, zd + 0.017), 'trim', segs=8, bev=None)
    # speed lever and knobs at the front right
    P.box('speed_plate', (0.03, 0.05, 0.003), (0.12, 0.05, zd + 0.003), 'chrome', bev=0.001, segs=1)
    P.tube('speed_lever', [(0.12, 0.04, zd + 0.004), (0.13, 0.06, zd + 0.016)], 0.003, 'chrome', segs=6)
    for y in (0.125, 0.165):
        knob(P, (0.122, y, zd + 0.002), axis='Z', r=0.012, h=0.012, material='chrome', name='knob', segs=12)
    # latches on the front, hinges at the back
    for sy in (-1, 1):
        P.box('latch', (0.008, 0.03, 0.025), (D / 2 + 0.003, sy * 0.12, H - 0.018), 'chrome', bev=0.002, segs=1)
        P.box('hinge', (0.012, 0.04, 0.02), (-D / 2 - 0.004, sy * 0.12, H - 0.005), 'chrome', bev=0.002, segs=1)
    # the lid, built closed on the case, then swung open about the hinge line by 102 degrees
    since = mark(P)
    hl = 0.05
    P.box('lid', (D, W, hl), (0, 0, H + hl / 2), 'paint', bev=0.008, segs=2)
    P.box('grille_back', (D - 0.07, W - 0.07, 0.004), (0.0, 0.0, H - 0.001), 'trim', bev=None)
    gp = P.box('grille', (D - 0.08, W - 0.08, 0.004), (0.0, 0.0, H - 0.0045), 'paint_b', bev=None)
    cut = bmesh.new()
    for k in range(9):
        K.bm_cube(cut, (0.012, W - 0.12, 0.012), mat4((-0.1 + 0.025 * k, 0.0, H - 0.0045)))
    P.cut(gp, cut)
    P.box('lid_latch', (0.008, 0.03, 0.02), (D / 2 + 0.003, -0.12, H + 0.012), 'chrome', bev=0.002, segs=1)
    P.box('lid_latch', (0.008, 0.03, 0.02), (D / 2 + 0.003, 0.12, H + 0.012), 'chrome', bev=0.002, segs=1)
    P.tube('handle', [(D / 2, -0.06, H + 0.025), (D / 2 + 0.03, -0.05, H + 0.025), (D / 2 + 0.03, 0.05, H + 0.025),
                      (D / 2, 0.06, H + 0.025)], 1.0, 'leather', bend=0.015,
           profile=[(-0.004, -0.008), (0.004, -0.008), (0.004, 0.008), (-0.004, 0.008)], sharp=60.0)
    hinge = V((-D / 2, 0.0, H))
    xform(P, since, Matrix.Translation(hinge) @ Matrix.Rotation(math.radians(-102), 4, 'Y') @
          Matrix.Translation(-hinge))
    P.views = [('a', 30, 22), ('b', 210, 22)]


def junk_cage(P):
    """A bird cage: the round tray with its rim, sixteen wire bars rising and curving over into a dome, rings
    round it, the top cap and its hanging ring, a perch, a feeding cup and the little door at the front."""
    P.ao_distance = 0.04
    P.lathe('tray', [(0.0, 0.0), (0.142, 0.0), (0.15, 0.006), (0.152, 0.05), (0.158, 0.056), (0.158, 0.064),
                     (0.146, 0.066), (0.141, 0.06), (0.139, 0.016), (0.0, 0.016)], material='paint', segs=32,
            sharp=40.0)
    rb, z0, z1, zt, rt = 0.138, 0.06, 0.3, 0.42, 0.028
    nb = 16
    for i in range(nb):
        a = math.tau * (i + 0.5) / nb
        c, s = math.cos(a), math.sin(a)
        path = [(rb * c, rb * s, z0), (rb * c, rb * s, z1)]
        for k in range(1, 6):
            ph = math.pi / 2 * k / 5
            r = rt + (rb - rt) * math.cos(ph)
            path.append((r * c, r * s, z1 + (zt - z1) * math.sin(ph)))
        P.tube('bar', path, 0.0026, 'steel', segs=5, bend=0.0, caps=True)
    for (r, z) in ((rb, 0.07), (rb, 0.19), (rb, z1)):
        P.torus('ring', r, 0.0032, loc=(0, 0, z), segs=32, rsegs=4, material='steel')
    ph = math.pi / 4
    P.torus('ring', rt + (rb - rt) * math.cos(ph), 0.003, loc=(0, 0, z1 + (zt - z1) * math.sin(ph)), segs=24, rsegs=4,
            material='steel')
    P.lathe('cap', [(0.0, zt - 0.006), (0.034, zt - 0.006), (0.036, zt), (0.03, zt + 0.012), (0.012, zt + 0.018),
                    (0.0, zt + 0.019)], material='paint', segs=16, sharp=45.0)
    P.torus('hook_ring', 0.024, 0.0042, loc=(0, 0, zt + 0.043), axis='Y', segs=18, rsegs=5, material='steel')
    P.cyl('hook_neck', 0.005, 0.012, (0, 0, zt + 0.021), 'steel', segs=8, bev=None)
    # inside: a perch across and a cup clipped to the bars
    P.cyl('perch', 0.0065, 2 * rb - 0.004, (0.0, 0.0, 0.17), 'wood', axis='Y', segs=10, bev=0.002, bsegs=1)
    P.lathe('cup', K.shell_profile([(0.0, -0.013), (0.024, -0.012), (0.029, 0.0), (0.03, 0.03)], 0.003),
            loc=(-0.1, 0.06, 0.08), material='paint_b', segs=16, loop=True, sharp=60.0)
    # the door at the front: a wire frame with two bars, its latch
    xd = rb + 0.006
    dw, d0, d1 = 0.05, 0.075, 0.2
    P.tube('door', [(xd, -dw, d0), (xd, -dw, d1), (xd, dw, d1), (xd, dw, d0)], 0.0028, 'steel', segs=5, bend=0.008,
           closed=False)
    P.tube('door', [(xd, -dw, d0), (xd, dw, d0)], 0.0028, 'steel', segs=5)
    for y in (-dw / 3, dw / 3):
        P.tube('door_bar', [(xd, y, d0), (xd, y, d1)], 0.0024, 'steel', segs=5)
    P.torus('latch', 0.008, 0.0022, loc=(xd + 0.002, dw + 0.006, (d0 + d1) / 2), axis='X', segs=10, rsegs=4,
            material='steel')
    P.views = [('a', 30, 18), ('b', 210, 22)]


def junk_bin(P):
    """A pedal bin: the round steel body on a plastic foot ring, a rolled rim, the domed lid hinged at the back,
    the foot pedal at the front on its bracket."""
    P.ao_distance = 0.05
    R = 0.15
    P.lathe('body', [(0.0, 0.016), (R - 0.004, 0.016), (R, 0.024), (R, 0.35), (R - 0.004, 0.356), (R - 0.01, 0.356),
                     (R - 0.01, 0.3), (0.0, 0.3)], material='paint', segs=36, sharp=40.0)
    for z in (0.12, 0.24):
        P.torus('bead', R, 0.0028, loc=(0, 0, z), segs=36, rsegs=4, material='paint')
    P.torus('rim', R + 0.001, 0.0045, loc=(0, 0, 0.356), segs=36, rsegs=6, material='paint')
    P.lathe('foot_ring', [(R - 0.02, 0.0), (R + 0.003, 0.0), (R + 0.004, 0.012), (R + 0.001, 0.026), (R - 0.006, 0.026),
                          (R - 0.02, 0.018)], material='rubber', segs=36, loop=True, sharp=50.0)
    P.lathe('lid', [(R + 0.004, 0.36), (R + 0.006, 0.368), (R + 0.002, 0.376), (R - 0.03, 0.39), (R - 0.08, 0.398),
                    (0.0, 0.401)], material='paint_b', segs=36, close='start', sharp=45.0)
    P.box('hinge', (0.03, 0.06, 0.02), (-R - 0.008, 0.0, 0.358), 'steel', bev=0.004, segs=1)
    P.cyl('hinge_pin', 0.005, 0.07, (-R - 0.012, 0.0, 0.358), 'steel', axis='Y', segs=8, bev=None)
    # the pedal and its bracket
    P.box('pedal_bracket', (0.04, 0.05, 0.03), (R - 0.005, 0.0, 0.03), 'steel', bev=0.004, segs=1)
    P.box('pedal', (0.07, 0.09, 0.008), (R + 0.04, 0.0, 0.04), 'steel', rot=(0, -8, 0), bev=0.003, segs=1)
    for y in (-0.025, 0.0, 0.025):
        P.box('pedal_rib', (0.055, 0.006, 0.004), (R + 0.042, y, 0.0455), 'steel', rot=(0, -8, 0), bev=None)
    P.views = [('a', 35, 20), ('b', 215, 22)]


def junk_solar_lamp(P):
    """A garden solar lamp as pulled out of the lawn, standing on its spike: the finned ground spike, the post in
    two pieces with a joint collar, the lantern head with its frosted lens, the yellow cap with the little solar
    panel (dark glass ruled into cells) on top."""
    P.ao_distance = 0.03
    # the spike: two crossed fins tapering to the point, the socket above
    for a in (0.0, 90.0):
        P.prism('fin', [(-0.002, 0.0), (0.002, 0.0), (0.016, 0.1), (0.016, 0.125), (-0.016, 0.125), (-0.016, 0.1)],
                0.004, matrix=mat4((0, 0, 0), (90, 0, a)), material='paint', bev=0.001, segs=1)
    P.cyl('socket', 0.014, 0.04, (0, 0, 0.13), 'paint', segs=12, bev=0.002, bsegs=1)
    P.tube('post', [(0, 0, 0.14), (0, 0, 0.27)], 0.0105, 'paint', segs=10)
    P.cyl('joint', 0.0135, 0.025, (0, 0, 0.28), 'paint', segs=12, bev=0.002, bsegs=1)
    P.tube('post', [(0, 0, 0.29), (0, 0, 0.39)], 0.0105, 'paint', segs=10)
    # the lantern head
    z0 = 0.39
    P.lathe('head_base', [(0.0, z0), (0.02, z0), (0.034, z0 + 0.008), (0.045, z0 + 0.016), (0.046, z0 + 0.024),
                          (0.0, z0 + 0.024)], material='paint', segs=20, sharp=40.0)
    P.cyl('lens', 0.04, 0.06, (0, 0, z0 + 0.054), 'lens_head', segs=20, bev=0.002, bsegs=1)
    for k in range(4):
        a = math.tau * k / 4 + math.pi / 4
        P.box('strut', (0.008, 0.008, 0.06), (0.041 * math.cos(a), 0.041 * math.sin(a), z0 + 0.054), 'paint',
              rot=(0, 0, math.degrees(a)), bev=0.002, segs=1)
    zc = z0 + 0.084
    P.lathe('cap', [(0.0, zc), (0.05, zc), (0.056, zc + 0.006), (0.054, zc + 0.014), (0.04, zc + 0.02),
                    (0.0, zc + 0.022)], material='paint_b', segs=20, sharp=40.0)
    # the solar panel: dark glass, a frame and the cell lines
    zp = zc + 0.022
    P.box('panel_frame', (0.068, 0.068, 0.005), (0, 0, zp + 0.0025), 'paint', bev=0.0015, segs=1)
    P.box('panel', (0.058, 0.058, 0.004), (0, 0, zp + 0.005), 'glass_dark', bev=0.001, segs=1)
    bm = bmesh.new()
    for k in (-1, 0, 1):
        K.bm_cube(bm, (0.058, 0.0016, 0.0012), mat4((0, k * 0.0145, zp + 0.0072)))
        K.bm_cube(bm, (0.0016, 0.058, 0.0012), mat4((k * 0.0145, 0, zp + 0.0072)))
    P.mesh('cells', bm, 'alu', sharp=60.0)
    P.views = [('a', 35, 20), ('b', 215, 24)]


def taper_rod(P, name, a, b, r0, r1, material, segs=10):
    """A tapered round blank from a (radius r0) to b (radius r1)."""
    a, b = V(a), V(b)
    return P.cyl(name, r0, (b - a).length, tuple((a + b) / 2), material, axis=(b - a), segs=segs, r2=r1, bev=None)


def guide(P, at, side, r=0.007, wire=0.0021, foot=0.012):
    """A line guide: a wire ring standing out from the blank on a little frame (side = the direction it points)."""
    at, side = V(at), V(side).normalized()
    c = at + side * (foot + r)
    P.torus('guide_ring', r, wire, loc=tuple(c), axis='X', segs=12, rsegs=4, material='steel')
    P.tube('guide_frame', [at + V((-0.012, 0, 0)), c - side * r + V((-0.003, 0, 0))], wire, 'steel', segs=4)
    P.tube('guide_frame', [at + V((0.012, 0, 0)), c - side * r + V((0.003, 0, 0))], wire, 'steel', segs=4)


def junk_rod(P):
    """
    A spinning rod broken in two, lying on the floor: the butt section with its grip, reel seat and fore grip, a
    spinning reel lying on its side (spool, bail, the crank on top), guides; the tip section beside it, splintered
    where it snapped, with its own guides and the tip ring.
    """
    P.ao_distance = 0.03
    zr = 0.0135
    P.cyl('butt_cap', 0.015, 0.025, (-0.555, 0.0, zr), 'rubber', axis='X', segs=12, bev=0.003, bsegs=1)
    P.lathe('grip', [(0.0, 0.0), (0.0135, 0.0), (0.0145, 0.12), (0.0135, 0.3), (0.0115, 0.33), (0.0, 0.33)],
            loc=(-0.545, 0.0, zr), material='paint_b', axis='X', segs=12, sharp=40.0)
    P.cyl('reel_seat', 0.0115, 0.08, (-0.175, 0.0, zr), 'alu', axis='X', segs=12, bev=0.002, bsegs=1)
    for x in (-0.208, -0.142):
        P.cyl('seat_nut', 0.0135, 0.012, (x, 0.0, zr), 'alu', axis='X', segs=12, bev=0.002, bsegs=1)
    P.lathe('fore_grip', [(0.0, 0.0), (0.0115, 0.0), (0.0105, 0.07), (0.008, 0.08), (0.0, 0.08)],
            loc=(-0.135, 0.0, zr), material='paint_b', axis='X', segs=12, sharp=40.0)
    xb = 0.52
    taper_rod(P, 'blank', (-0.06, 0.0, zr - 0.002), (xb, 0.0, 0.0062), 0.0075, 0.0052, 'paint')
    # the snapped end: a slanted stub and splinters
    bm = bmesh.new()
    for k, (dy, dz, ln) in enumerate(((0.002, 0.002, 0.03), (-0.002, 0.0015, 0.022), (0.0, -0.0025, 0.016))):
        K.bm_cube(bm, (ln, 0.0024, 0.0024), Matrix.Translation((xb + ln / 2 - 0.002, dy, 0.0062 + dz)) @
                  mat4(rot=(0, -8 + 8 * k, 6 * (k - 1))))
    P.mesh('splinters', bm, 'paint', sharp=60.0)
    for (x, zc) in ((0.1, 0.0098), (0.36, 0.0076)):
        P.cyl('wrap', 0.0072, 0.02, (x, 0.0, zc), 'paint_b', axis='X', segs=10, bev=None)
        guide(P, (x, 0.0058, zc), (0, 1, 0), r=0.0055)
    # the reel, lying on its side beside the rod (its foot along +Y)
    ry, rz = 0.068, 0.03
    P.box('reel_foot', (0.05, 0.012, 0.006), (-0.175, 0.012, zr), 'alu', bev=0.002, segs=1)
    P.box('reel_stem', (0.016, 0.04, 0.01), (-0.175, 0.035, 0.02), 'alu', bev=0.003, segs=1)
    P.pillow('reel_body', (0.06, 0.035, 0.05), (-0.18, ry, rz), 'steel', r=0.012, sub=1)
    P.lathe('spool', [(0.0, 0.0), (0.024, 0.0), (0.026, 0.004), (0.02, 0.008), (0.02, 0.028), (0.025, 0.032),
                      (0.025, 0.036), (0.0, 0.036)], loc=(-0.15, ry, rz), material='alu', axis='X', segs=16, sharp=40.0)
    P.cyl('line', 0.0215, 0.019, (-0.132, ry, rz), 'paint_b', axis='X', segs=16, bev=None)
    P.torus('bail', 0.03, 0.0022, loc=(-0.108, ry, rz), axis='X', segs=16, rsegs=4, material='steel',
            arc=math.pi * 1.1, a0=-math.pi * 0.55)
    P.cyl('rotor', 0.027, 0.012, (-0.153, ry, rz), 'steel', axis='X', segs=16, bev=0.002, bsegs=1)
    P.cyl('crank_boss', 0.01, 0.012, (-0.185, ry, rz + 0.03), 'steel', segs=10, bev=0.002, bsegs=1)
    P.box('crank', (0.06, 0.008, 0.006), (-0.205, ry, rz + 0.037), 'steel', bev=0.002, segs=1)
    P.cyl('crank_knob', 0.008, 0.02, (-0.233, ry, rz + 0.05), 'trim', segs=10, bev=0.002, bsegs=1)
    # the tip section, lying beside it, a little askew
    y0 = -0.045
    a, b = V((-0.42, y0, 0.0048)), V((0.62, y0 - 0.03, 0.0025))
    taper_rod(P, 'tip_blank', a, b, 0.0048, 0.0021, 'paint', segs=8)
    bm = bmesh.new()
    for k, (dy, dz, ln) in enumerate(((0.0015, 0.001, 0.02), (-0.0015, 0.0008, 0.014))):
        K.bm_cube(bm, (ln, 0.002, 0.002), Matrix.Translation((a.x - ln / 2 + 0.002, a.y + dy, a.z + dz)) @
                  mat4(rot=(0, 6 - 10 * k, 8 * k)))
    P.mesh('splinters', bm, 'paint', sharp=60.0)
    for t in (0.25, 0.55, 0.8):
        p = a + (b - a) * t
        guide(P, (p.x, p.y, p.z + 0.0035), (0, 0, 1), r=0.0055, wire=0.002, foot=0.008)
    P.torus('tip_ring', 0.005, 0.002, loc=tuple(b + V((0.004, 0.0, 0.0055))), axis='X', segs=10, rsegs=4,
            material='steel')
    P.views = [('a', 30, 35), ('b', 210, 35)]


def junk_tv(P):
    """
    An old CRT television (face +X): a wooden cabinet, the tapered dark back over the tube with vent ribs, the
    bulging screen in its bezel on the left, the control panel on the right with the channel and volume knobs,
    a power button and a slotted speaker grille, little feet, and a rabbit-ear antenna on top.
    """
    P.ao_distance = 0.06
    W, H, D = 0.5, 0.42, 0.26
    zf = 0.025
    xf = 0.2
    P.box('cabinet', (D, W, H), (xf - D / 2, 0.0, zf + H / 2), 'paint', bev=0.012, segs=2)
    # the back: a tapered hood over the tube
    bm = bmesh.new()
    xb0, xb1 = xf - D, xf - D - 0.17
    K.bm_cube(bm, (0.17, 0.44, 0.36), mat4(((xb0 + xb1) / 2, 0.0, zf + H / 2)))
    for v in bm.verts:
        if v.co.x < (xb0 + xb1) / 2:
            v.co.y *= 0.55
            v.co.z = zf + H / 2 + (v.co.z - zf - H / 2) * 0.6
    P.mesh('back', bm, 'paint_b', bev=0.012, segs=2)
    ztop0, ztop1 = zf + H / 2 + 0.18, zf + H / 2 + 0.18 * 0.6
    slope = math.degrees(math.atan2(ztop0 - ztop1, xb0 - xb1))
    xv = xb0 - 0.075
    zv = ztop0 - (ztop0 - ztop1) * (xb0 - xv) / (xb0 - xb1)
    for k in range(5):
        P.box('vent', (0.09, 0.012, 0.006), (xv, -0.1 + 0.05 * k, zv + 0.002), 'paint_b', rot=(0, -slope, 0),
              bev=0.002, segs=1)
    P.tube('cord', [(xb1 + 0.01, 0.06, zf + 0.1), (xb1 - 0.04, 0.07, zf + 0.04), (xb1 - 0.08, 0.02, 0.004)], 0.004,
           'trim', segs=6, bend=0.03)
    # the screen and its bezel
    sy, sz = -0.06, zf + H / 2 + 0.01
    sw, sh = 0.3, 0.25
    outer = K.rounded_rect(0.35, 0.31, 0.04, seg=3)
    inner = K.rounded_rect(sw, sh, 0.035, seg=3)
    rings = [K.section_x(outer, xf + 0.0, 1.0, sy, sz), K.section_x(outer, xf + 0.012, 1.0, sy, sz),
             K.section_x(inner, xf + 0.008, 1.0, sy, sz), K.section_x(inner, xf - 0.004, 1.0, sy, sz)]
    P.loft('bezel', rings + [rings[0]], 'paint_b', sharp=50.0, recalc=True)
    scr = [K.section_x(inner, xf - 0.003, 1.0, sy, sz), K.section_x(inner, xf + 0.009, 0.9, sy, sz),
           K.section_x(inner, xf + 0.017, 0.65, sy, sz), K.section_x(inner, xf + 0.021, 0.3, sy, sz)]
    P.loft('screen', scr, 'glass_dark', cap_end=True, sharp=50.0, recalc=True)
    # the control panel: two knobs, a button, the speaker grille
    cy = 0.18
    P.box('panel', (0.006, 0.11, 0.33), (xf + 0.002, cy, zf + H / 2), 'paint_b', bev=0.003, segs=1)
    for (z, r) in ((zf + H - 0.08, 0.026), (zf + H - 0.155, 0.02)):
        knob(P, (xf + 0.005, cy, z), axis='X', r=r, h=0.022, material='trim', ribs=8, name='knob', skirt=0.006,
             segs=14)
        P.box('pointer', (0.004, 0.004, r * 0.8), (xf + 0.0275, cy, z + r * 0.45), 'chrome', bev=None)
    P.cyl('button', 0.009, 0.012, (xf + 0.009, cy, zf + H - 0.205), 'chrome', axis='X', segs=12, bev=0.002, bsegs=1)
    P.box('grille_back', (0.004, 0.08, 0.1), (xf + 0.004, cy, zf + 0.085), 'trim', bev=None)
    for k in range(6):
        P.box('grille_bar', (0.006, 0.086, 0.008), (xf + 0.0065, cy, zf + 0.042 + 0.0172 * k), 'paint_b', bev=0.0015,
              segs=1)
    bm = bmesh.new()
    for sx in (-1, 1):
        for sy2 in (-1, 1):
            at = Matrix.Translation((xf - D / 2 + sx * 0.09, sy2 * 0.2, zf / 2))
            K.bm_cyl(bm, 0.018, zf, segs=10, r2=0.014, matrix=at)
    P.mesh('feet', bm, 'trim', bev=0.003, segs=1)
    # the rabbit ears: a domed base, two telescopic rods in a V
    zt = zf + H
    bx = xf - D / 2 - 0.03
    P.lathe('ant_base', [(0.0, zt), (0.05, zt), (0.048, zt + 0.012), (0.03, zt + 0.03), (0.0, zt + 0.036)],
            loc=(bx, 0, 0), material='trim', segs=16, sharp=45.0)
    for sg in (-1, 1):
        p0 = V((bx, 0.0, zt + 0.03))
        d = V((-0.12, sg * 0.42, 0.9)).normalized()
        segsr = [(0.0, 0.12, 0.0042), (0.12, 0.23, 0.0034), (0.23, 0.33, 0.0026)]
        for (t0, t1, r) in segsr:
            P.tube('ear', [p0 + d * t0, p0 + d * t1], r, 'chrome', segs=6)
        P.sphere('ear_tip', 0.007, tuple(p0 + d * 0.335), 'chrome', u=8, v=5)
    P.views = [('a', 30, 16), ('b', 210, 20)]


def junk_food_bucket(P):
    """A big feed bucket with its lid on: a tapered body with a stacking foot and a strong rolled rim with ribs
    under it, a raised label band, lugs and a wire bail with a plastic grip folded down against the front."""
    P.ao_distance = 0.06
    P.lathe('body', [(0.0, 0.008), (0.14, 0.008), (0.146, 0.0), (0.152, 0.004), (0.15, 0.03), (0.17, 0.33),
                     (0.172, 0.345), (0.178, 0.352), (0.18, 0.362), (0.172, 0.366), (0.0, 0.366)], material='paint',
            segs=32, sharp=40.0)
    for k in range(16):
        a = math.tau * k / 16
        P.box('rib', (0.012, 0.005, 0.03), (0.171 * math.cos(a), 0.171 * math.sin(a), 0.33),
              'paint', rot=(0, 0, math.degrees(a)), bev=0.0015, segs=1)
    # the label band
    def rz(z):
        return 0.15 + (0.17 - 0.15) * (z - 0.03) / 0.3
    P.lathe('label', [(rz(0.13) - 0.001, 0.13), (rz(0.13) + 0.0025, 0.132), (rz(0.25) + 0.0025, 0.248),
                      (rz(0.25) - 0.001, 0.25)], material='paint_b', segs=32, sharp=50.0)
    P.lathe('lid', [(0.184, 0.362), (0.186, 0.37), (0.184, 0.382), (0.17, 0.386), (0.16, 0.392), (0.06, 0.398),
                    (0.0, 0.399)], material='paint_b', segs=32, close='start', sharp=45.0)
    P.box('lid_tab', (0.03, 0.04, 0.008), (0.19, 0.0, 0.372), 'paint_b', bev=0.003, segs=1)
    # lugs and the bail folded down against the front
    for s in (-1, 1):
        P.cyl('lug', 0.016, 0.014, (0.0, s * 0.168, 0.3), 'paint', axis='Y', segs=12, bev=0.003, bsegs=1)
    rb, beta, zl = 0.178, math.radians(80), 0.3
    pts = []
    for i in range(17):
        t = math.pi * i / 16
        st = math.sin(t)
        pts.append((rb * st * math.sin(beta) + 0.012 * st, rb * math.cos(t), zl + rb * st * math.cos(beta)))
    P.tube('bail', pts, 0.0032, 'steel', segs=6, bend=0.0)
    mid = V(pts[8])
    P.cyl('bail_grip', 0.011, 0.1, tuple(mid), 'trim', axis='Y', segs=12, bev=0.004, bsegs=1)
    P.views = [('a', 35, 18), ('b', 215, 20)]


def wheel_y(P, c, R, w, hub_r, material_hub='steel', segs=28):
    """A pneumatic wheel on an axle along Y at c: a ribbed rubber tyre (outer radius R, section width w) on a
    pressed steel hub with its boss and nut."""
    c = V(c)
    hw = w / 2
    ri = hub_r
    tyre = [(ri, -hw * 0.8), (ri + (R - ri) * 0.3, -hw), (R - (R - ri) * 0.22, -hw * 0.97), (R - 0.006, -hw * 0.72),
            (R, -hw * 0.5), (R, -hw * 0.28), (R - 0.004, -hw * 0.2), (R - 0.004, -hw * 0.08), (R, 0.0),
            (R - 0.004, hw * 0.08), (R - 0.004, hw * 0.2), (R, hw * 0.28), (R, hw * 0.5), (R - 0.006, hw * 0.72),
            (R - (R - ri) * 0.22, hw * 0.97), (ri + (R - ri) * 0.3, hw), (ri, hw * 0.8)]
    P.lathe('tyre', tyre[::-1], loc=tuple(c), material='rubber', axis='Y', segs=segs, loop=True, sharp=50.0)
    hub = [(0.012, -hw * 0.95), (0.03, -hw * 0.95), (ri * 0.8, -hw * 0.75), (ri + 0.002, -hw * 0.8),
           (ri + 0.002, hw * 0.8), (ri * 0.8, hw * 0.75), (0.03, hw * 0.95), (0.012, hw * 0.95)]
    P.lathe('hub', hub[::-1], loc=tuple(c), material=material_hub, axis='Y', segs=20, loop=True, sharp=40.0)
    P.cyl('hub_boss', 0.02, w * 1.05, tuple(c), material_hub, axis='Y', segs=12, bev=0.002, bsegs=1)


def junk_trolley(P):
    """A two-wheel hand truck standing on its nose plate and wheels: one bent tube frame rising from the plate
    into the loop handle with a rubber grip, three cross bars, the axle brackets, the axle and two pneumatic
    wheels, gussets at the plate."""
    P.ao_distance = 0.08
    yr = 0.17
    P.box('nose_plate', (0.21, 0.38, 0.008), (0.1, 0.0, 0.004), 'steel', bev=0.003, segs=1)
    P.box('nose_lip', (0.012, 0.38, 0.014), (0.006, 0.0, 0.015), 'steel', bev=0.003, segs=1)
    for s in (-1, 1):
        P.prism('gusset', [(0.0, 0.0), (0.08, 0.0), (0.0, 0.08)], 0.006,
                matrix=mat4((0.006, s * yr, 0.008), (90, 0, 0)), material='steel', bev=0.002, segs=1)
    top = 1.17
    frame = [(0.005, -yr, 0.012), (-0.045, -yr, 1.05), (-0.085, -yr + 0.02, top), (-0.085, yr - 0.02, top),
             (-0.045, yr, 1.05), (0.005, yr, 0.012)]
    P.tube('frame', frame, 0.016, 'paint', segs=10, bend=0.07)
    P.cyl('grip', 0.021, 0.2, (-0.085, 0.0, top), 'paint_b', axis='Y', segs=12, bev=0.004, bsegs=1)

    def rail_x(z):
        return 0.005 - 0.05 * (z - 0.012) / (1.05 - 0.012)

    for z in (0.3, 0.6, 0.88):
        P.tube('cross', [(rail_x(z), -yr, z), (rail_x(z), yr, z)], 0.011, 'paint', segs=8)
    # axle brackets and the axle behind the bottom of the frame, the wheels outside
    R = 0.13
    ax, az = -0.115, R
    for s in (-1, 1):
        bar(P, 'bracket', (rail_x(0.16), s * (yr - 0.004), 0.16), (ax, s * (yr - 0.004), az), 0.008, 0.05, 'steel',
            x_hint=(0, 1, 0), bev=0.003)
        bar(P, 'bracket', (rail_x(0.06), s * (yr - 0.004), 0.06), (ax, s * (yr - 0.004), az), 0.008, 0.04, 'steel',
            x_hint=(0, 1, 0), bev=0.003)
    P.cyl('axle', 0.011, 0.56, (ax, 0.0, az), 'steel', axis='Y', segs=10, bev=None)
    for s in (-1, 1):
        wheel_y(P, (ax, s * 0.235, az), R, 0.075, 0.068)
        P.cyl('axle_nut', 0.012, 0.012, (ax, s * 0.278, az), 'steel', axis='Y', segs=6, bev=None)
    P.views = [('a', 35, 16), ('b', 215, 16)]


def junk_jack(P):
    """
    A trolley jack lying ready (lowered): two pressed side plates on steel front wheels and rear swivel casters,
    the lift arm between them with the saddle on its nose, the hydraulic pump and ram, the release knob and
    the long handle's socket sticking up at the back.
    """
    P.ao_distance = 0.06
    yp = 0.075
    side = [(-0.3, 0.07), (0.24, 0.022), (0.285, 0.03), (0.295, 0.075), (0.0, 0.135), (-0.3, 0.152)]
    for s in (-1, 1):
        P.prism('side_plate', side, 0.006, matrix=mat4((0, s * yp, 0), (90, 0, 0)), material='paint', bev=0.002, segs=1)
    P.box('top_cover', (0.2, 2 * yp + 0.006, 0.006), (-0.2, 0.0, 0.147), 'paint', rot=(0, 2.5, 0), bev=0.002, segs=1)
    P.box('cross_rear', (0.03, 2 * yp, 0.05), (-0.29, 0.0, 0.11), 'paint', bev=0.004, segs=1)
    # front wheels (steel) on their axle, rear casters
    fx, fz, fr = 0.255, 0.04, 0.04
    P.cyl('front_axle', 0.008, 2 * yp + 0.07, (fx, 0.0, fz), 'steel', axis='Y', segs=8, bev=None)
    for s in (-1, 1):
        rim = [(0.01, -0.012), (fr - 0.004, -0.012), (fr, -0.008), (fr, 0.008), (fr - 0.004, 0.012), (0.01, 0.012)]
        P.lathe('front_wheel', rim[::-1], loc=(fx, s * (yp + 0.02), fz), material='steel', axis='Y', segs=20,
                loop=True, sharp=40.0)
        P.cyl('front_hub', 0.012, 0.03, (fx, s * (yp + 0.02), fz), 'steel', axis='Y', segs=10, bev=0.002, bsegs=1)
        cx, cy = -0.27, s * 0.055
        P.cyl('caster_plate', 0.022, 0.006, (cx, cy, 0.075), 'steel', segs=12, bev=None)
        P.box('caster_fork', (0.035, 0.03, 0.04), (cx - 0.012, cy, 0.052), 'steel', bev=0.005, segs=1)
        P.cyl('caster_wheel', 0.03, 0.022, (cx - 0.02, cy, 0.03), 'steel', axis='Y', segs=16, bev=0.003, bsegs=1)
    # the lift arm, lowered, and the saddle on its nose
    piv = V((-0.11, 0.0, 0.09))
    nose = V((0.235, 0.0, 0.112))
    bar(P, 'arm', piv, nose, 0.045, 0.07, 'paint', x_hint=(0, 0, 1), bev=0.006, segs=2)
    P.cyl('arm_pivot', 0.012, 2 * yp + 0.02, tuple(piv), 'steel', axis='Y', segs=10, bev=0.002, bsegs=1)
    P.cyl('saddle_post', 0.019, 0.03, tuple(nose + V((0.01, 0.0, 0.024))), 'steel', segs=14, bev=0.002, bsegs=1)
    P.lathe('saddle', [(0.0, 0.0), (0.04, 0.0), (0.047, 0.006), (0.047, 0.02), (0.042, 0.023), (0.034, 0.015),
                       (0.0, 0.013)], loc=tuple(nose + V((0.01, 0.0, 0.038))), material='steel', segs=20, sharp=40.0)
    for k in range(6):
        a = math.tau * k / 6
        P.box('saddle_tooth', (0.008, 0.012, 0.006), tuple(nose + V((0.01 + 0.04 * math.cos(a), 0.04 * math.sin(a),
                                                                     0.062))), 'steel', rot=(0, 0, math.degrees(a)),
              bev=0.002, segs=1)
    for s in (-1, 1):
        P.bolt((piv.x, s * (yp + 0.004), piv.z), normal=(0, s, 0), r=0.01, h=0.006, washer=False)
        P.bolt((fx, s * (yp + 0.004), fz), normal=(0, s, 0), r=0.009, h=0.005, washer=False)
    # the pump, the ram up to the arm, the release knob, the handle socket
    P.cyl('pump', 0.03, 0.17, (-0.205, 0.0, 0.085), 'steel', axis='X', segs=16, bev=0.004, bsegs=1)
    P.cyl('pump_cap', 0.034, 0.02, (-0.12, 0.0, 0.085), 'steel', axis='X', segs=16, bev=0.003, bsegs=1)
    P.tube('ram', [(-0.11, 0.0, 0.09), (0.0, 0.0, 0.098)], 0.016, 'chrome', segs=10)
    P.cyl('fill_plug', 0.008, 0.012, (-0.2, 0.0, 0.117), 'trim', segs=8, bev=None)
    P.cyl('release_shaft', 0.005, 0.04, (-0.32, 0.03, 0.085), 'steel', axis='X', segs=8, bev=None)
    knob(P, (-0.34, 0.03, 0.085), axis='-X', r=0.012, h=0.012, material='trim', name='release_knob', segs=12)
    hp = V((-0.3, 0.0, 0.13))
    d = V((-math.cos(math.radians(40)), 0.0, math.sin(math.radians(40))))
    P.box('socket_yoke', (0.03, 0.06, 0.03), tuple(hp), 'steel', bev=0.004, segs=1)
    P.cyl('socket_pin', 0.007, 0.075, tuple(hp), 'steel', axis='Y', segs=8, bev=None)
    P.lathe('socket', [(0.0, 0.0), (0.022, 0.0), (0.022, 0.13), (0.025, 0.134), (0.025, 0.145), (0.016, 0.145),
                       (0.016, 0.1), (0.0, 0.1)], loc=tuple(hp + d * 0.01), material='paint_b', axis=d, segs=14,
            sharp=40.0)
    P.views = [('a', 35, 22), ('b', 215, 22)]


def junk_trumpet(P):
    """
    A trumpet lying on its side: the bell section from the flared bell back to the bell bow, the leadpipe from
    the mouthpiece (silver) to the main tuning slide, three valves with their caps, stems and finger buttons,
    the valve slides (the third with its ring), braces, and a dent in the bell. Built upright (bell +X, valves
    up), then laid down and rested on its bell and its back end.
    """
    P.ao_distance = 0.02
    since = mark(P)
    rt = 0.0058
    yb, zb = 0.024, 0.022                       # the bell section's line
    yl = -0.022                                 # the leadpipe's
    vx = (-0.045, -0.02, 0.005)                 # valve casings (1st at the back)
    # valves
    for x in vx:
        P.cyl('casing', 0.0115, 0.064, (x, 0.0, 0.0), 'paint', segs=12, bev=None)
        P.cyl('cap_top', 0.0132, 0.008, (x, 0.0, 0.036), 'paint', segs=12, bev=None)
        P.cyl('cap_bottom', 0.0128, 0.012, (x, 0.0, -0.038), 'paint', segs=12, bev=None)
        P.cyl('stem', 0.0035, 0.02, (x, 0.0, 0.05), 'paint', segs=8, bev=None)
        P.cyl('button', 0.0088, 0.007, (x, 0.0, 0.0635), 'paint_b', segs=10, bev=0.002, bsegs=1)
    # the bell section: bell bow at the back, the straight bell tube, the bell
    bow = [(-0.06, 0.012, -0.03), (-0.1, 0.02, -0.046), (-0.15, yb, -0.046), (-0.188, yb, -0.012), (-0.15, yb, zb),
           (0.05, yb, zb)]
    P.tube('bell_tube', [(vx[0] - 0.006, 0.0, -0.025)] + bow, rt, 'paint', segs=6, bend=0.022)
    prof = [(0.006, 0.0), (0.0075, 0.06), (0.0095, 0.1), (0.013, 0.13), (0.019, 0.156), (0.028, 0.174),
            (0.039, 0.186), (0.05, 0.194), (0.062, 0.2)]
    bm = bmesh.new()
    K.bm_lathe(bm, K.shell_profile(prof, 0.0016), segs=20,
               matrix=Matrix.Translation((0.05, yb, zb)) @ K.axis_matrix('X'), loop=True)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    c0 = V((0.05, yb, zb))

    def dent(co):
        # the rim pushed in on the side that faces up once the trumpet lies down
        p = co - c0
        if p.x < 0.15:
            return co
        a = math.atan2(p.z, p.y)
        da = (a - 0.6 + math.pi) % math.tau - math.pi
        w = max(0.0, 1 - (da / 0.6) ** 2) * min(1.0, (p.x - 0.15) / 0.05) ** 2
        k = 1 - 0.16 * w
        return c0 + V((p.x, p.y * k, p.z * k))

    for v in bm.verts:
        v.co = dent(v.co)
    P.mesh('bell', bm, 'paint', sharp=60.0)
    rim = P.torus('bell_rim', 0.0625, 0.0022, loc=(0.25, yb, zb), axis='X', segs=20, rsegs=3, material='paint')
    for v in rim.data.vertices:
        v.co = dent(V(v.co))
    # the leadpipe from the mouthpiece receiver to the main tuning slide and into the front valve
    lead = [(-0.205, yl, 0.002), (0.12, yl, -0.01), (0.158, yl, -0.03), (0.12, yl + 0.006, -0.05),
            (0.035, -0.006, -0.046), (vx[2] + 0.006, 0.0, -0.025)]
    P.tube('leadpipe', lead, rt, 'paint', segs=6, bend=0.02, radius_fn=lambda u: 0.8 + 0.2 * min(1.0, u * 4))
    P.cyl('receiver', 0.0075, 0.04, (-0.19, yl, 0.0015), 'paint', axis='X', segs=10, bev=None)
    P.lathe('mouthpiece', [(0.0, 0.0), (0.0048, 0.0), (0.006, 0.05), (0.0085, 0.065), (0.013, 0.078), (0.0145, 0.084),
                           (0.012, 0.087), (0.009, 0.083), (0.0, 0.08)], loc=(-0.205, yl, 0.0022), material='chrome',
            axis='-X', segs=12, sharp=45.0)
    # valve slides: the second short under the middle valve, the third back with its ring, the first forward
    x0, x1 = vx[1] - 0.006, vx[1] + 0.006
    P.tube('slide2', round_path([(x0, 0.013, -0.02), (x0, 0.013, -0.06), (x1, 0.013, -0.06), (x1, 0.013, -0.02)], 0.006,
                                n=2), 0.005, 'paint', segs=6, bend=0.0)
    P.tube('slide3', round_path([(vx[0], 0.012, -0.012), (-0.115, 0.012, -0.012), (-0.115, 0.012, -0.03),
                                 (vx[0], 0.012, -0.03)], 0.009, n=2), 0.005, 'paint', segs=6, bend=0.0)
    P.torus('slide3_ring', 0.009, 0.0024, loc=(-0.1, 0.012, -0.041), axis='Y', segs=10, rsegs=4, material='paint')
    P.tube('slide1', round_path([(vx[2], 0.012, -0.012), (0.075, 0.012, -0.012), (0.075, 0.012, -0.03),
                                 (vx[2], 0.012, -0.03)], 0.009, n=2), 0.005, 'paint', segs=6, bend=0.0)
    # braces between the bell tube and the leadpipe
    for x in (-0.11, 0.09):
        zl = 0.002 + (-0.012) * (x + 0.205) / 0.325
        P.tube('brace', [(x, yl, zl), (x, yb, zb)], 0.0028, 'paint', segs=6)
    # lay it on its side, then let it rest on its bell and its back end
    xform(P, since, Matrix.Scale(0.92, 4) @ Matrix.Rotation(math.radians(90.0), 4, 'X'))
    settle(P, center=True)
    P.views = [('a', 35, 30), ('b', 215, 30)]


MODELS = {
    'junk_sign': junk_sign,
    'junk_camera': junk_camera,
    'junk_candle': junk_candle,
    'junk_chair': junk_chair,
    'junk_chair_wood': junk_chair_wood,
    'junk_chair_soft': junk_chair_soft,
    'junk_chair_fold': junk_chair_fold,
    'junk_chair_office': junk_chair_office,
    'junk_stool': junk_stool,
    'junk_stool_tall': junk_stool_tall,
    'junk_sunchair': junk_sunchair,
    'junk_clockradio': junk_clockradio,
    'junk_hanger': junk_hanger,
    'junk_coffee': junk_coffee,
    'junk_fax': junk_fax,
    'junk_box_food': junk_box_food,
    'junk_lamp': junk_lamp,
    'junk_barrel': junk_barrel,
    'junk_mop': junk_mop,
    'junk_crate_plastic': junk_crate_plastic,
    'junk_transceiver': junk_transceiver,
    'junk_record': junk_record,
    'junk_cage': junk_cage,
    'junk_bin': junk_bin,
    'junk_solar_lamp': junk_solar_lamp,
    'junk_rod': junk_rod,
    'junk_tv': junk_tv,
    'junk_food_bucket': junk_food_bucket,
    'junk_trolley': junk_trolley,
    'junk_jack': junk_jack,
    'junk_trumpet': junk_trumpet,
}


def _settled(fn):
    """The builder, then the whole model set down on z = 0 (bevels and drips never poke through the floor)."""
    def build(P):
        res = fn(P)
        if res is None:
            settle(P, center=False)
        return res
    build.__doc__ = fn.__doc__
    return build


MODELS = {k: _settled(f) for k, f in MODELS.items()}


# ------------------------------------------------------------------------------------------------ previews

def _lin(h):
    c = (((h >> 16) & 255) / 255, ((h >> 8) & 255) / 255, (h & 255) / 255)
    return tuple(x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c)


def _after(P, opts):
    """--look: bigger cel previews in the item's own colours, from both sides or from --look=yaw,pitch/...;
    --cull: with back faces culled."""
    spec = opts.get('look')
    if not spec or opts.get('norender'):
        return
    if spec is True:
        views = [(f'{i + 1}', yaw, pitch) for i, (_, yaw, pitch) in
                 enumerate(getattr(P, 'views', None) or [('a', 35, 20), ('b', 215, 20)])]
    else:
        views = []
        for i, s in enumerate(str(spec).split('/')):
            yaw, pitch = (float(t) for t in s.split(','))
            views.append((f'{i + 1}', yaw, pitch))
    names = K.mc.MAT_NAMES
    saved = {k: names[k] for k in ('paint', 'paint_b')}
    for key, h in zip(('paint', 'paint_b'), COLORS.get(P.id, ())):
        names[key] = (_lin(h), saved[key][1], saved[key][2])
    try:
        if opts.get('cull'):
            for m in K.bpy.data.materials:
                m.use_backface_culling = True
        K.render_toon(P, views=views, size=(800, 640), suffix='_look')
    finally:
        names.update(saved)


def main(args):
    K.run(MODELS, args, after=_after, out_dir=OUT, geo=False)
