"""
The parts artist's kit: geometry builders, the finishing pipeline and the previews for the ModCar part GLBs.

Every part script (tools/blender/parts/<group>.py) builds its parts through a Part:

    def build_bat_std(P):
        P.box('case', (0.24, 0.17, 0.19), (0, 0, 0.095), 'trim', bev=0.008)
        ...
    PARTS = {'bat_std': build_bat_std}
    def main(args): K.run(PARTS, args)

Conventions (docs/MODCAR.md section 6 and the parts brief):
  * Blender axes X forward, Y left, Z up, metres; the game frame is game(x, y, z) = blender(x, z, -y).
  * The root object of every file is the mesh `PART` (all static geometry joined, one material slot per
    conventional material). Moving pieces are child meshes with their origin on their pivot (LID, KNOB_*,
    LEVER, KEY, FLAP_*); sub-mounts and markers are child empties (M_tire, M_turbo, M_exhaust_out, EYE).
  * Every hard edge is bevelled (modifier, 2-3 segments, limited by angle), edges sharper than the
    object's smoothing angle are marked sharp, normals are weighted (face area) and ambient occlusion is
    baked into the vertex colour 'Col'.
  * fit_nominal (stretch parts) is [length, width, height] in metres, i.e. Blender [X, Y, Z] extents.

Shared lib: tools/blender/lib/modcar.py (owned by the lead). Things the lib does not do live here.
"""

import json
import math
import os
import sys
import time

import bmesh
import bpy
from mathutils import Euler, Matrix, Vector

from lib import modcar as mc

OUT_DIR = 'public/models/modcar/parts'
GEO_JSON = 'src/core/modcar/data/parts_geo.json'
SCRATCH = 'D:/modcar-scratch/parts'

V = Vector
TAU = math.tau


# --------------------------------------------------------------------------------------------- matrices

def mat4(loc=(0, 0, 0), rot=(0, 0, 0), scale=(1, 1, 1)):
    """Matrix from a location, an XYZ Euler rotation in DEGREES and a scale (scalar or 3-tuple)."""
    if isinstance(scale, (int, float)):
        scale = (scale, scale, scale)
    r = Euler([math.radians(a) for a in rot], 'XYZ').to_matrix().to_4x4()
    s = Matrix.Diagonal((*scale, 1.0))
    return Matrix.Translation(loc) @ r @ s


def axis_matrix(axis):
    """Rotation taking +Z to the given axis ('X', 'Y', 'Z', '-X', ... or a vector)."""
    if isinstance(axis, str):
        sgn = -1.0 if axis.startswith('-') else 1.0
        a = axis[-1].upper()
        vec = V((sgn if a == 'X' else 0, sgn if a == 'Y' else 0, sgn if a == 'Z' else 0))
    else:
        vec = V(axis).normalized()
    return V((0, 0, 1)).rotation_difference(vec).to_matrix().to_4x4()


def frame_from_z(z, x_hint=(1, 0, 0)):
    """Orthonormal frame (as a 4x4 rotation) whose Z is z and whose X is as close as possible to x_hint."""
    z = V(z).normalized()
    xh = V(x_hint)
    if abs(xh.normalized().dot(z)) > 0.98:
        xh = V((0, 1, 0)) if abs(z.y) < 0.9 else V((1, 0, 0))
    x = (xh - z * xh.dot(z)).normalized()
    y = z.cross(x)
    m = Matrix((x, y, z)).transposed()
    return m.to_4x4()


# --------------------------------------------------------------------------------------------- bmesh builders

def bm_new():
    return bmesh.new()


def bm_cube(bm, size, matrix=None):
    sx, sy, sz = size
    res = bmesh.ops.create_cube(bm, size=1.0)
    for v in res['verts']:
        v.co.x *= sx
        v.co.y *= sy
        v.co.z *= sz
    if matrix is not None:
        bmesh.ops.transform(bm, matrix=matrix, verts=res['verts'])
    return res['verts']


def bm_cyl(bm, r, h, segs=24, r2=None, matrix=None, caps=True):
    """Cylinder (or cone) along Z centred on the origin."""
    res = bmesh.ops.create_cone(bm, cap_ends=caps, cap_tris=False, segments=segs, radius1=r,
                                radius2=r if r2 is None else r2, depth=h)
    if matrix is not None:
        bmesh.ops.transform(bm, matrix=matrix, verts=res['verts'])
    return res['verts']


def bm_sphere(bm, r, u=16, v=8, matrix=None):
    res = bmesh.ops.create_uvsphere(bm, u_segments=u, v_segments=v, radius=r)
    if matrix is not None:
        bmesh.ops.transform(bm, matrix=matrix, verts=res['verts'])
    return res['verts']


def bm_lathe(bm, profile, segs=32, matrix=None, angle=TAU, start=0.0, close=None, loop=False, shear=None):
    """
    Surface of revolution about Z. profile = [(r, z), ...] in order; r == 0 points become poles.
    Walking along the profile with r to the right and z up, the outside is on the right.
    angle < TAU makes an open sector (no caps). loop=True joins the last profile point back to the first
    (a closed section, e.g. a sheet-metal rim). shear(k) = extra angle (rad) for profile point k.
    Returns the rings (lists of verts).
    """
    full = abs(angle - TAU) < 1e-6
    n = segs if full else segs + 1
    rings = []
    for k, (r, z) in enumerate(profile):
        if r <= 1e-7:
            rings.append([bm.verts.new((0.0, 0.0, z))])
            continue
        ring = []
        sh = shear(k) if shear else 0.0
        for i in range(n):
            a = start + angle * i / segs + sh
            ring.append(bm.verts.new((r * math.cos(a), r * math.sin(a), z)))
        rings.append(ring)
    pairs = [(k, k + 1) for k in range(len(rings) - 1)]
    if loop:
        pairs.append((len(rings) - 1, 0))
    for (ka, kb) in pairs:
        A, B = rings[ka], rings[kb]
        if len(A) == 1 and len(B) == 1:
            continue
        for i in range(segs):
            i2 = (i + 1) % n if full else i + 1
            if len(A) == 1:
                f = (A[0], B[i2], B[i])
            elif len(B) == 1:
                f = (A[i], A[i2], B[0])
            else:
                f = (A[i], A[i2], B[i2], B[i])
            try:
                bm.faces.new(f)
            except ValueError:
                pass
    if close and full:
        # close open ends with ngon caps: close = 'start', 'end' or 'both'
        if close in ('start', 'both') and len(rings[0]) > 2:
            bm.faces.new(list(reversed(rings[0])))
        if close in ('end', 'both') and len(rings[-1]) > 2:
            bm.faces.new(rings[-1])
    bm.normal_update()
    verts = [v for ring in rings for v in ring]
    if matrix is not None:
        bmesh.ops.transform(bm, matrix=matrix, verts=verts)
    return rings


def bm_prism(bm, poly, depth, matrix=None, center=True):
    """Extrude a 2D polygon [(x, y), ...] (counter-clockwise) along Z by depth."""
    z0 = -depth / 2 if center else 0.0
    bot = [bm.verts.new((x, y, z0)) for (x, y) in poly]
    top = [bm.verts.new((x, y, z0 + depth)) for (x, y) in poly]
    bm.faces.new(list(reversed(bot)))
    bm.faces.new(top)
    n = len(poly)
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((bot[i], bot[j], top[j], top[i]))
    verts = bot + top
    if matrix is not None:
        bmesh.ops.transform(bm, matrix=matrix, verts=verts)
    return verts


def rounded_rect(w, h, r, seg=4):
    """2D rounded rectangle centred on the origin, counter-clockwise."""
    r = min(r, w / 2 - 1e-5, h / 2 - 1e-5)
    pts = []
    corners = [(w / 2 - r, h / 2 - r, 0), (-w / 2 + r, h / 2 - r, 90), (-w / 2 + r, -h / 2 + r, 180),
               (w / 2 - r, -h / 2 + r, 270)]
    for (cx, cy, a0) in corners:
        if r <= 1e-6:
            pts.append((cx, cy))
            continue
        for i in range(seg + 1):
            a = math.radians(a0 + 90 * i / seg)
            pts.append((cx + r * math.cos(a), cy + r * math.sin(a)))
    return pts


def circle2d(r, n, start=0.0):
    return [(r * math.cos(start + TAU * i / n), r * math.sin(start + TAU * i / n)) for i in range(n)]


def fillet_path(pts, bend):
    """Round the corners of a polyline with circular-ish arcs of radius `bend` (quadratic Bezier)."""
    pts = [V(p) for p in pts]
    if len(pts) < 3 or bend <= 0:
        return pts
    out = [pts[0]]
    for i in range(1, len(pts) - 1):
        p0, p1, p2 = pts[i - 1], pts[i], pts[i + 1]
        d1 = (p1 - p0)
        d2 = (p2 - p1)
        l1, l2 = d1.length, d2.length
        if l1 < 1e-6 or l2 < 1e-6:
            continue
        d1 /= l1
        d2 /= l2
        cosang = max(-1.0, min(1.0, d1.dot(d2)))
        theta = math.acos(cosang)
        if theta < 1e-3:
            out.append(p1)
            continue
        t = bend * math.tan(theta / 2)
        t = min(t, l1 * 0.5, l2 * 0.5)
        a = p1 - d1 * t
        b = p1 + d2 * t
        k = max(2, int(math.degrees(theta) / 12) + 1)
        for j in range(k + 1):
            u = j / k
            q = a * (1 - u) ** 2 + p1 * 2 * u * (1 - u) + b * u * u
            out.append(q)
    out.append(pts[-1])
    return out


def densify(path, max_seg):
    """Split path segments longer than max_seg (so vertex AO has samples along long straight runs)."""
    out = [V(path[0])]
    for a, b in zip(path[:-1], path[1:]):
        a, b = V(a), V(b)
        n = int((b - a).length / max_seg) if max_seg else 0
        for k in range(1, n + 1):
            out.append(a + (b - a) * (k / (n + 1)))
        out.append(b)
    return out


def bm_sweep(bm, path, radius, segs=12, caps=True, twist=0.0, radius_fn=None, profile=None, closed=False,
             max_seg=0.22):
    """
    Sweep a circle (or a 2D profile [(x, y), ...]) along a polyline with rotation-minimising frames.
    radius_fn(t) (t = 0..1 along the path) scales the section. Long straight runs are split every max_seg m.
    Returns the rings.
    """
    path = [V(p) for p in path]
    if max_seg and not closed:
        path = densify(path, max_seg)
    n = len(path)
    if closed:
        tang = [(path[(i + 1) % n] - path[i - 1]).normalized() for i in range(n)]
    else:
        tang = []
        for i in range(n):
            if i == 0:
                t = path[1] - path[0]
            elif i == n - 1:
                t = path[-1] - path[-2]
            else:
                t = (path[i + 1] - path[i]).normalized() + (path[i] - path[i - 1]).normalized()
            tang.append(t.normalized())
    # initial normal
    t0 = tang[0]
    ref = V((0, 0, 1)) if abs(t0.z) < 0.9 else V((1, 0, 0))
    nrm = (ref - t0 * ref.dot(t0)).normalized()
    frames = []
    for i in range(n):
        if i > 0:
            # rotation-minimising: rotate the previous normal by the rotation between tangents
            q = tang[i - 1].rotation_difference(tang[i])
            nrm = (q @ nrm)
            nrm = (nrm - tang[i] * nrm.dot(tang[i])).normalized()
        frames.append((tang[i], nrm, tang[i].cross(nrm)))
    lengths = [0.0]
    for i in range(1, n):
        lengths.append(lengths[-1] + (path[i] - path[i - 1]).length)
    total = lengths[-1] or 1.0
    if profile is None:
        profile = circle2d(1.0, segs)
    m = len(profile)
    rings = []
    for i in range(n):
        tg, nr, bn = frames[i]
        s = lengths[i] / total
        rr = radius * (radius_fn(s) if radius_fn else 1.0)
        tw = twist * s
        ring = []
        for (px, py) in profile:
            ca, sa = math.cos(tw), math.sin(tw)
            x, y = px * ca - py * sa, px * sa + py * ca
            ring.append(bm.verts.new(path[i] + (nr * x + bn * y) * rr))
        rings.append(ring)
    for i in range(n - 1 + (1 if closed else 0)):
        A, B = rings[i], rings[(i + 1) % n]
        for j in range(m):
            j2 = (j + 1) % m
            bm.faces.new((A[j], A[j2], B[j2], B[j]))
    if caps and not closed:
        bm.faces.new(list(reversed(rings[0])))
        bm.faces.new(rings[-1])
    bm.normal_update()
    return rings


def bm_torus(bm, R, r, segs=32, rsegs=10, matrix=None, arc=TAU, a0=0.0, caps=False):
    """Torus about Z (or an arc of one: a bent tube)."""
    full = abs(arc - TAU) < 1e-6
    path = []
    k = segs if full else segs + 1
    for i in range(k):
        a = a0 + arc * i / segs
        path.append((R * math.cos(a), R * math.sin(a), 0.0))
    rings = bm_sweep(bm, path, r, segs=rsegs, caps=caps and not full, closed=full)
    if matrix is not None:
        bmesh.ops.transform(bm, matrix=matrix, verts=[v for ring in rings for v in ring])
    return rings


def bm_hex(bm, r, h, matrix=None, taper=0.8):
    """Hexagonal prism (bolt head / nut) along Z, across-corners radius r, sitting on z = 0; the top is
    narrowed by `taper`, which reads as a chamfer without extra triangles."""
    verts = bm_cyl(bm, r, h, segs=6, r2=r * taper, matrix=Matrix.Translation((0, 0, h / 2)))
    if matrix is not None:
        bmesh.ops.transform(bm, matrix=matrix, verts=verts)
    return verts


def bm_polar(bm, rings, stations, hole=None, matrix=None, zfun=None):
    """
    A thick disc on a polar grid (rim centres, alloy faces, brake discs...).
    rings = [(r, z_front, z_back), ...] from the inside out (the front faces +Z);
    stations(k) -> the angles of ring k (the same count on every ring, increasing within one turn), so spoke
    edges can be shaped per ring; hole(k, j) -> True if the cell between rings k, k+1 and stations j, j+1
    is a window. The result is closed: a bore wall inside, an edge wall outside and walls round every window.
    """
    nk = len(rings)
    F, B = [], []
    for k, (r, zf, zb) in enumerate(rings):
        angs = stations(k)
        fr, br = [], []
        for j, a in enumerate(angs):
            df, db = zfun(k, j) if zfun else (0.0, 0.0)
            fr.append(bm.verts.new((r * math.cos(a), r * math.sin(a), zf + df)))
            br.append(bm.verts.new((r * math.cos(a), r * math.sin(a), zb + db)))
        F.append(fr)
        B.append(br)
    ns = len(F[0])

    def solid(k, j):
        if k < 0 or k >= nk - 1:
            return False
        return not (hole and hole(k, j % ns))

    faces = []
    for k in range(nk - 1):
        for j in range(ns):
            j2 = (j + 1) % ns
            if solid(k, j):
                faces.append(bm.faces.new((F[k][j], F[k][j2], F[k + 1][j2], F[k + 1][j])))
                faces.append(bm.faces.new((B[k][j], B[k + 1][j], B[k + 1][j2], B[k][j2])))
    for k in range(nk):
        for j in range(ns):
            j2 = (j + 1) % ns
            if solid(k - 1, j) != solid(k, j):
                faces.append(bm.faces.new((F[k][j], B[k][j], B[k][j2], F[k][j2])))
    for k in range(nk - 1):
        for j in range(ns):
            if solid(k, j - 1) != solid(k, j):
                faces.append(bm.faces.new((F[k][j], F[k + 1][j], B[k + 1][j], B[k][j])))
    # drop verts that ended up unused (inside windows that span whole rings)
    loose = [v for v in bm.verts if not v.link_faces and v in set(sum(F, []) + sum(B, []))]
    bmesh.ops.delete(bm, geom=loose, context='VERTS')
    bmesh.ops.recalc_face_normals(bm, faces=faces)
    if matrix is not None:
        verts = set()
        for f in faces:
            verts.update(f.verts)
        bmesh.ops.transform(bm, matrix=matrix, verts=list(verts))
    return F, B


def bm_pleats(bm, width, length, n, height, matrix=None, seg=4, fall=0.18, base=0.006, crown=0.0):
    """
    An upholstery panel of n pleats lying side by side across Y (total `width`), running along X (`length`),
    standing `height` above z = 0 with soft arched tops and sharp seams; the ends fall off over `fall` of the
    length. crown bows the whole panel up in the middle (m). A thin base slab (z = -base .. 0) closes it.
    """
    us = []
    for i in range(n):
        for k in range(seg):
            us.append((i + k / seg) / n)
    us.append(1.0)
    vs = [0.0, fall * 0.45, fall, 1 - fall, 1 - fall * 0.45, 1.0]
    top = []
    for v in vs:
        row = []
        ev = min(1.0, min(v, 1 - v) / max(fall, 1e-6))
        ev = math.sin(ev * math.pi / 2) ** 0.7
        for u in us:
            t = (u * n) % 1.0
            if u >= 1.0:
                t = 0.0
            hp = math.sin(math.pi * t) ** 0.55
            cz = crown * (1 - (2 * u - 1) ** 2)
            z = height * hp * ev + cz * ev
            row.append(bm.verts.new(((v - 0.5) * length, (u - 0.5) * width, z)))
        top.append(row)
    nv, nu = len(vs), len(us)
    faces = []
    for a in range(nv - 1):
        for b in range(nu - 1):
            faces.append(bm.faces.new((top[a][b], top[a][b + 1], top[a + 1][b + 1], top[a + 1][b])))
    # boundary ring (counter-clockwise seen from above) and the base slab
    ring = [top[0][b] for b in range(nu)] + [top[a][nu - 1] for a in range(1, nv)] +         [top[nv - 1][b] for b in range(nu - 2, -1, -1)] + [top[a][0] for a in range(nv - 2, 0, -1)]
    low = [bm.verts.new((v.co.x, v.co.y, -base)) for v in ring]
    m = len(ring)
    for i in range(m):
        j = (i + 1) % m
        faces.append(bm.faces.new((ring[i], low[i], low[j], ring[j])))
    faces.append(bm.faces.new(list(reversed(low))))
    bmesh.ops.recalc_face_normals(bm, faces=faces)
    if matrix is not None:
        bmesh.ops.transform(bm, matrix=matrix, verts=list({v for f in faces for v in f.verts}))
    return faces


def bm_loft(bm, rings, cap_start=False, cap_end=False, closed=True):
    """Connect consecutive rings of 3D points (all the same length) with quads; optional ngon caps."""
    vr = [[bm.verts.new(p) for p in ring] for ring in rings]
    m = len(vr[0])
    faces = []
    for a, b in zip(vr[:-1], vr[1:]):
        for j in range(m if closed else m - 1):
            j2 = (j + 1) % m
            faces.append(bm.faces.new((a[j], a[j2], b[j2], b[j])))
    if cap_start:
        faces.append(bm.faces.new(list(reversed(vr[0]))))
    if cap_end:
        faces.append(bm.faces.new(vr[-1]))
    return vr, faces


def section_x(pts2d, x, scale=1.0, dy=0.0, dz=0.0):
    """A 2D section (y, z) placed in the plane X = x."""
    return [(x, y * scale + dy, z * scale + dz) for (y, z) in pts2d]


def shell_profile(prof, thick):
    """
    Give an open lathe profile [(r, z), ...] (outside on the right of travel) a wall: returns a closed loop of
    the profile followed by its inward offset, for P.lathe(..., loop=True). Bells, stacks, drums seen from
    inside then show a real inner wall instead of culled back faces.
    """
    n = len(prof)
    inner = []
    for i in range(n):
        a = prof[max(0, i - 1)]
        b = prof[min(n - 1, i + 1)]
        tr, tz = b[0] - a[0], b[1] - a[1]
        ln = math.hypot(tr, tz) or 1.0
        nr, nz = -tz / ln, tr / ln  # the inside (left of travel)
        inner.append((max(0.0005, prof[i][0] + nr * thick), prof[i][1] + nz * thick))
    return list(prof) + inner[::-1]


def bm_transform(bm, matrix, verts=None):
    bmesh.ops.transform(bm, matrix=matrix, verts=list(verts) if verts is not None else bm.verts[:])


# --------------------------------------------------------------------------------------------- the part

class Part:
    """One part file: collects objects, then finish() bevels, smooths, joins, bakes AO and exports."""

    def __init__(self, pid, opts=None):
        mc.reset_scene()
        self.id = pid
        self.opts = opts or {}
        self.statics = []      # objects joined into PART
        self.movers = []       # child meshes (pivoted)
        self.empties = []      # child empties
        self.props = {}
        self.info = {}         # extra fields for parts_geo.json (radius, width, ...)
        self.cfg = {}          # per object: dict(bev=(w, segs, angle), sharp=deg, wn=bool, cutters=[...])
        self.ao_distance = 0.15
        self.ao_samples = 32
        self.root = None
        self._n = 0

    # ------------------------------------------------------------------ registering objects

    def _obj(self, name, bm, material, bev=None, segs=2, bev_angle=30.0, sharp=35.0, wn=True, smooth=True):
        """material: a conventional name, or a list of names (faces carry material_index into it)."""
        self._n += 1
        mats = material if isinstance(material, (list, tuple)) else [material]
        if len(mats) == 1:
            obj = mc.mesh_object(f'{name}.{self._n:03d}', bm, mats[0])
        else:
            # the slots must exist before the bmesh is written, or the face material indices are clamped
            me = bpy.data.meshes.new(f'{name}.{self._n:03d}')
            for m in mats:
                me.materials.append(mc.mat(m))
            bm.to_mesh(me)
            bm.free()
            obj = bpy.data.objects.new(me.name, me)
            bpy.context.scene.collection.objects.link(obj)
        if not smooth:
            for p in obj.data.polygons:
                p.use_smooth = False
        self.cfg[obj.name] = dict(bev=(bev, segs, bev_angle) if bev else None, sharp=sharp, wn=wn,
                                  cutters=[], smooth=smooth, sub=0)
        self.statics.append(obj)
        return obj

    def mesh(self, name, bm, material, **kw):
        """Register a finished bmesh (in part space) as a static object."""
        return self._obj(name, bm, material, **kw)

    # ------------------------------------------------------------------ primitives

    def box(self, name, size, loc=(0, 0, 0), material='steel', rot=(0, 0, 0), bev=0.004, segs=2, open=None, **kw):
        """open: faces to leave out, e.g. '-z' or '-z+y' (local axes before rot): they sit against something."""
        bm = bm_new()
        verts = bm_cube(bm, size)
        # a long thin bar gets loop cuts every ~0.2 m so its vertex AO is not decided by its two ends
        dims = list(size)
        il = max(range(3), key=lambda i: dims[i])
        others = sorted(dims[i] for i in range(3) if i != il)
        if dims[il] > 0.35 and others[1] < 0.12:
            cuts = int(dims[il] / 0.2)
            long_edges = [e for e in bm.edges
                          if abs((e.verts[0].co - e.verts[1].co)[il]) > dims[il] * 0.99]
            bmesh.ops.subdivide_edges(bm, edges=long_edges, cuts=cuts, use_grid_fill=True)
        if open:
            dead = []
            for f in bm.faces:
                c = f.calc_center_median()
                n = f.normal
                for i, ax in enumerate('xyz'):
                    for sg in ('-', '+'):
                        if sg + ax in open and abs(n[i]) > 0.9 and (n[i] > 0) == (sg == '+'):
                            dead.append(f)
            bmesh.ops.delete(bm, geom=dead, context='FACES_ONLY')
        bm_transform(bm, mat4(loc, rot))
        return self._obj(name, bm, material, bev=bev, segs=segs, **kw)

    def cyl(self, name, r, h, loc=(0, 0, 0), material='steel', axis='Z', rot=None, segs=24, r2=None,
            bev=0.003, bsegs=2, caps=True, **kw):
        bm = bm_new()
        m = Matrix.Translation(loc) @ (mat4(rot=rot) if rot is not None else axis_matrix(axis))
        bm_cyl(bm, r, h, segs=segs, r2=r2, matrix=m, caps=caps)
        return self._obj(name, bm, material, bev=bev, segs=bsegs, **kw)

    def lathe(self, name, profile, loc=(0, 0, 0), material='steel', axis='Z', rot=None, segs=32, close=None,
              bev=None, bsegs=2, sharp=35.0, angle=TAU, start=0.0, loop=False, **kw):
        bm = bm_new()
        m = Matrix.Translation(loc) @ (mat4(rot=rot) if rot is not None else axis_matrix(axis))
        bm_lathe(bm, profile, segs=segs, matrix=m, close=close, angle=angle, start=start, loop=loop)
        if loop or close == 'both':
            bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
        return self._obj(name, bm, material, bev=bev, segs=bsegs, sharp=sharp, **kw)

    def tube(self, name, pts, r, material='steel', segs=12, bend=0.05, caps=True, radius_fn=None, sharp=80.0,
             bev=None, closed=False, profile=None, twist=0.0, **kw):
        bm = bm_new()
        path = fillet_path(pts, bend) if not closed else [V(p) for p in pts]
        bm_sweep(bm, path, r, segs=segs, caps=caps, radius_fn=radius_fn, closed=closed, profile=profile,
                 twist=twist)
        return self._obj(name, bm, material, bev=bev, sharp=sharp, **kw)

    def prism(self, name, poly, depth, loc=(0, 0, 0), material='steel', rot=(0, 0, 0), bev=0.003, segs=2,
              center=True, matrix=None, **kw):
        bm = bm_new()
        bm_prism(bm, poly, depth, matrix=matrix if matrix is not None else mat4(loc, rot), center=center)
        return self._obj(name, bm, material, bev=bev, segs=segs, **kw)

    def loft(self, name, rings, material='steel', cap_start=False, cap_end=False, closed=True, sharp=40.0,
             recalc=False, **kw):
        """A surface through rings of 3D points (see bm_loft)."""
        bm = bm_new()
        vr, faces = bm_loft(bm, rings, cap_start=cap_start, cap_end=cap_end, closed=closed)
        if recalc:
            bmesh.ops.recalc_face_normals(bm, faces=faces)
        return self._obj(name, bm, material, sharp=sharp, **kw)

    def pleats(self, name, width, length, n, height, loc=(0, 0, 0), rot=(0, 0, 0), material='fabric', sharp=38.0,
               **kw):
        """A pleated upholstery panel (see bm_pleats), placed by loc/rot (local X = the run of the pleats)."""
        bm = bm_new()
        bm_pleats(bm, width, length, n, height, matrix=mat4(loc, rot), **kw)
        return self._obj(name, bm, material, sharp=sharp, wn=False)

    def pillow(self, name, size, loc=(0, 0, 0), material='fabric', rot=(0, 0, 0), r=0.02, sub=1, puff=0.0,
               taper=None, sharp=80.0, **kw):
        """
        A soft block (upholstery): a box with its edges cut back by r, smoothed by subdivision. puff pushes the
        middle of the faces out (m); taper=(sx, sy) scales the top (+Z) face.
        """
        bm = bm_new()
        sx, sy, sz = size
        verts = bm_cube(bm, size)
        if taper:
            for v in verts:
                if v.co.z > 0:
                    v.co.x *= taper[0]
                    v.co.y *= taper[1]
        bmesh.ops.bevel(bm, geom=bm.edges[:], offset=r, offset_type='OFFSET', segments=1, profile=0.5,
                        affect='EDGES', clamp_overlap=True)
        bm_transform(bm, mat4(loc, rot))
        o = self._obj(name, bm, material, sharp=sharp, wn=False, **kw)
        self.cfg[o.name]['sub'] = sub
        return o

    def sphere(self, name, r, loc=(0, 0, 0), material='steel', u=16, v=8, scale=(1, 1, 1), rot=(0, 0, 0), **kw):
        bm = bm_new()
        bm_sphere(bm, r, u, v, matrix=mat4(loc, rot, scale))
        kw.setdefault('sharp', 80.0)
        return self._obj(name, bm, material, **kw)

    def polar(self, name, rings, stations, hole=None, loc=(0, 0, 0), material='steel', axis='Z', rot=None,
              bev=None, bsegs=1, bev_angle=50.0, sharp=40.0, zfun=None, **kw):
        """A thick disc on a polar grid with windows (see bm_polar)."""
        bm = bm_new()
        m = Matrix.Translation(loc) @ (mat4(rot=rot) if rot is not None else axis_matrix(axis))
        bm_polar(bm, rings, stations, hole=hole, matrix=m, zfun=zfun)
        return self._obj(name, bm, material, bev=bev, segs=bsegs, bev_angle=bev_angle, sharp=sharp, **kw)

    def torus(self, name, R, r, loc=(0, 0, 0), material='steel', axis='Z', rot=None, segs=32, rsegs=10,
              arc=TAU, a0=0.0, caps=False, **kw):
        bm = bm_new()
        m = Matrix.Translation(loc) @ (mat4(rot=rot) if rot is not None else axis_matrix(axis))
        bm_torus(bm, R, r, segs=segs, rsegs=rsegs, matrix=m, arc=arc, a0=a0, caps=caps)
        kw.setdefault('sharp', 80.0)
        return self._obj(name, bm, material, **kw)

    def bolt(self, loc, normal=(0, 0, 1), r=0.007, h=0.006, material='steel', washer=True, x_hint=(1, 0, 0),
             name='bolt', spin=0.0):
        """A hex bolt head (with a washer) sitting on a surface at loc facing normal."""
        bm = bm_new()
        fr = frame_from_z(normal, x_hint) @ mat4(rot=(0, 0, spin))
        base = Matrix.Translation(loc) @ fr
        z0 = 0.0
        if washer:
            bm_cyl(bm, r * 1.35, r * 0.25, segs=10, matrix=base @ Matrix.Translation((0, 0, r * 0.125)))
            z0 = r * 0.25
        bm_hex(bm, r, h, matrix=base @ Matrix.Translation((0, 0, z0)))
        return self._obj(name, bm, material, sharp=50)

    def bolts(self, locs, normal=(0, 0, 1), **kw):
        """Several bolt heads joined into one object."""
        r = kw.get('r', 0.007)
        h = kw.get('h', 0.006)
        washer = kw.get('washer', True)
        bm = bm_new()
        for i, loc in enumerate(locs):
            nrm = normal[i] if isinstance(normal, list) else normal
            fr = frame_from_z(nrm, kw.get('x_hint', (1, 0, 0))) @ mat4(rot=(0, 0, kw.get('spin', 0.0) + 17 * i))
            base = Matrix.Translation(loc) @ fr
            z0 = 0.0
            if washer:
                bm_cyl(bm, r * 1.35, r * 0.25, segs=10, matrix=base @ Matrix.Translation((0, 0, r * 0.125)))
                z0 = r * 0.25
            bm_hex(bm, r, h, matrix=base @ Matrix.Translation((0, 0, z0)))
        return self._obj(kw.get('name', 'bolts'), bm, kw.get('material', 'steel'), sharp=50)

    def cut(self, obj, cutter_bm_or_obj):
        """Boolean difference (exact) applied before the bevel. Accepts a bmesh or an object."""
        if isinstance(cutter_bm_or_obj, bmesh.types.BMesh):
            c = mc.mesh_object('cutter', cutter_bm_or_obj)
        else:
            c = cutter_bm_or_obj
            if c in self.statics:
                self.statics.remove(c)
        c.hide_render = True
        c.display_type = 'WIRE'
        self.cfg[obj.name]['cutters'].append(c)
        return c

    def union(self, objs, name=None):
        """Join several registered statics into one object (shares one bevel/smooth setting)."""
        objs = [o for o in objs]
        base = objs[0]
        cfg = self.cfg[base.name]
        for o in objs:
            self._apply(o)
        _join(base, objs[1:])
        for o in objs[1:]:
            if o in self.statics:
                self.statics.remove(o)
        cfg['bev'] = None
        cfg['cutters'] = []
        if name:
            base.name = name
        return base

    # ------------------------------------------------------------------ markers, movers, properties

    def empty(self, name, loc=(0, 0, 0), rot=(0, 0, 0), size=0.06, props=None):
        e = mc.empty(name, loc=loc, rot=[math.radians(a) for a in rot], size=size, props=props)
        self.empties.append(e)
        return e

    def mover(self, name, objs, pivot):
        """Make a moving child mesh out of registered statics; its origin is the pivot (part space)."""
        objs = list(objs)
        for o in objs:
            self.statics.remove(o)
        self.movers.append((name, objs, V(pivot)))

    def prop(self, key, value):
        self.props[key] = value

    def fit_nominal(self, length, width, height):
        self.props['fit_nominal'] = [float(length), float(width), float(height)]
        self.info['fit_nominal'] = [float(length), float(width), float(height)]

    def eye(self, loc):
        self.empty('EYE', loc=loc, size=0.05)

    # ------------------------------------------------------------------ finishing

    def _apply(self, obj):
        """Booleans, then the bevel, then sharp edges by angle; modifiers are applied."""
        cfg = self.cfg.get(obj.name)
        if cfg is None or cfg.get('_done'):
            return
        for c in cfg['cutters']:
            m = obj.modifiers.new('cut', 'BOOLEAN')
            m.operation = 'DIFFERENCE'
            m.solver = 'EXACT'
            m.object = c
        if cfg['bev']:
            w, segs, ang = cfg['bev']
            m = obj.modifiers.new('bevel', 'BEVEL')
            m.width = w
            m.segments = segs
            m.limit_method = 'ANGLE'
            m.angle_limit = math.radians(ang)
            m.use_clamp_overlap = True
            m.miter_outer = 'MITER_ARC'
            m.profile = 0.5
            m.harden_normals = False
        if cfg.get('sub'):
            m = obj.modifiers.new('subsurf', 'SUBSURF')
            m.levels = cfg['sub']
            m.render_levels = cfg['sub']
            m.boundary_smooth = 'PRESERVE_CORNERS'
        if obj.modifiers:
            mc.apply_modifiers(obj)
        bad = _inside_out(obj)
        if bad:
            print(f'  WARN inside-out: {obj.name} ({bad} closed island(s) with negative volume)')
        for c in cfg['cutters']:
            if c.name in bpy.data.objects:
                bpy.data.objects.remove(c)
        cfg['cutters'] = []
        _mark_sharp(obj, cfg['sharp'], cfg.get('smooth', True))
        if cfg['wn']:
            vg = obj.vertex_groups.get('WN') or obj.vertex_groups.new(name='WN')
            vg.add([v.index for v in obj.data.vertices], 1.0, 'REPLACE')
        cfg['_done'] = True

    def _finish_group(self, objs, name):
        for o in objs:
            self._apply(o)
        if self.opts.get('stats'):
            rows = sorted(((mc.triangles([o]), o.name) for o in objs), reverse=True)
            for t, nm in rows:
                print(f'  STAT {name:8s} {t:6d}  {nm}')
        base = objs[0]
        _join(base, objs[1:])
        base.name = name
        base.data.name = name
        _canonical(base)
        if 'WN' in base.vertex_groups:
            m = base.modifiers.new('weighted', 'WEIGHTED_NORMAL')
            m.mode = 'FACE_AREA'
            m.weight = 50
            m.keep_sharp = True
            m.vertex_group = 'WN'
            mc.apply_modifiers(base)
        for vg in list(base.vertex_groups):
            base.vertex_groups.remove(vg)
        return base

    def finish(self):
        if not self.statics:
            raise RuntimeError(f'{self.id}: no geometry')
        root = self._finish_group(self.statics, 'PART')
        for k, v in self.props.items():
            root[k] = v
        root['part_id'] = self.id
        self.root = root
        mov_objs = []
        for (name, objs, pivot) in self.movers:
            o = self._finish_group(objs, name)
            o.data.transform(Matrix.Translation(-pivot))
            o.location = pivot
            o.parent = root
            mov_objs.append(o)
        self.mover_objs = mov_objs
        for e in self.empties:
            e.parent = root
        meshes = [root] + mov_objs
        self.tris = mc.triangles(meshes)
        if not self.opts.get('no_ao'):
            bake_ao_bvh(meshes, distance=self.ao_distance, samples=self.ao_samples)
        # the grime mask's UVs (root and movers in one square), for the parts the car wears
        if self.opts.get('mask'):
            self.mask_px = mc.mask_uv(meshes)
        # clean names of the mesh data
        for o in meshes:
            o.data.name = o.name
        return root

    # ------------------------------------------------------------------ output

    def export(self, path=None):
        path = path or os.path.join(OUT_DIR, f'{self.id}.glb')
        objs = [self.root] + self.mover_objs + self.empties
        mc.export_glb(path, objs)
        self.path = path
        return path

    def geo_entry(self):
        meshes = [self.root] + self.mover_objs
        lo = [1e9] * 3
        hi = [-1e9] * 3
        dg = bpy.context.evaluated_depsgraph_get()
        for o in meshes:
            ev = o.evaluated_get(dg)
            me = ev.to_mesh()
            mw = o.matrix_world
            for v in me.vertices:
                g = mc.to_game(mw @ v.co)
                for i in range(3):
                    lo[i] = min(lo[i], g[i])
                    hi[i] = max(hi[i], g[i])
            ev.to_mesh_clear()
        e = {
            'bbox': [[round(x, 4) for x in lo], [round(x, 4) for x in hi]],
            'triangles': self.tris,
            'materials': sorted({m.name for o in meshes for m in o.data.materials if m}),
        }
        mounts = [x for x in self.empties if x.name.startswith('M_')]
        if mounts:
            e['mounts'] = [x.name for x in mounts]
            e['mount_tf'] = {}
            for x in mounts:
                pos, quat = mc.matrix_to_game(x.matrix_world)
                e['mount_tf'][x.name] = {'pos': pos, 'quat': quat}
        eye = [x for x in self.empties if x.name == 'EYE']
        if eye:
            e['eye'] = [round(c, 4) for c in mc.to_game(eye[0].matrix_world.translation)]
        if self.mover_objs:
            e['movers'] = {}
            for o in self.mover_objs:
                pos, quat = mc.matrix_to_game(o.matrix_world)
                e['movers'][o.name] = {'pivot': pos}
        e.update(self.info)
        return e


def _hemisphere(n):
    """n fixed, cosine-weighted directions round +Z (a Fibonacci spiral): the same for every vertex and run."""
    out = []
    ga = math.pi * (3 - math.sqrt(5))
    for i in range(n):
        u = (i + 0.5) / n
        r = math.sqrt(u)
        a = ga * i
        out.append(V((r * math.cos(a), r * math.sin(a), math.sqrt(max(0.0, 1 - u)))))
    return out


def bake_ao_bvh(objs, distance=0.15, samples=40, levels=64):
    """
    Deterministic ambient occlusion into the vertex colour 'Col' (a grey value per vertex, written to every
    corner like the lib's bake): rays from each vertex over a fixed cosine-weighted hemisphere, cast
    against all the given meshes, occluded if they hit within `distance`. Replaces lib.modcar.bake_ao
    (Cycles), whose results depend on what was baked before in the same process.
    """
    import numpy as np
    from mathutils.bvhtree import BVHTree
    meshes = [o for o in objs if o.type == 'MESH']
    bm = bmesh.new()
    for o in meshes:
        tmp = bmesh.new()
        tmp.from_mesh(o.data)
        tmp.transform(o.matrix_world)
        tmp_me = bpy.data.meshes.new('_ao_tmp')
        tmp.to_mesh(tmp_me)
        tmp.free()
        bm.from_mesh(tmp_me)
        bpy.data.meshes.remove(tmp_me)
    tree = BVHTree.FromBMesh(bm)
    bm.free()
    dirs = _hemisphere(samples)
    eps = 0.0006
    for o in meshes:
        me = o.data
        mw = o.matrix_world
        nm = mw.to_3x3().inverted().transposed()
        ao = np.ones(len(me.vertices), dtype=np.float64)
        for v in me.vertices:
            p = mw @ v.co
            n = (nm @ v.normal).normalized()
            if n.length < 0.5:
                continue
            fr = frame_from_z(n).to_3x3()
            org = p + n * eps
            hit = 0.0
            for d in dirs:
                w = fr @ d
                loc, _, _, dist = tree.ray_cast(org, w, distance)
                if loc is not None:
                    hit += 1.0 - 0.35 * (dist / distance)
            ao[v.index] = 1.0 - hit / len(dirs)
        ao = np.round(np.clip(ao, 0.0, 1.0) * (levels - 1)) / (levels - 1)
        attr = me.color_attributes.get('Col') or me.color_attributes.new('Col', 'BYTE_COLOR', 'CORNER')
        me.color_attributes.active_color = attr
        me.attributes.render_color_index = me.color_attributes.find('Col')
        vidx = np.empty(len(me.loops), dtype=np.int64)
        me.loops.foreach_get('vertex_index', vidx)
        g = ao[vidx].astype(np.float32)
        col = np.stack([g, g, g, np.ones_like(g)], axis=1).reshape(-1)
        attr.data.foreach_set('color', col)


def _ao_per_vertex(obj, levels=64):
    """
    Average the baked per-corner AO over each vertex and quantise it: corners of one vertex then carry the
    same colour, so the glTF export only splits vertices where the normals do (smaller files, stable vertex
    counts), and the bake's noise is smoothed.
    """
    import numpy as np
    me = obj.data
    attr = me.color_attributes.get('Col')
    if attr is None or attr.domain != 'CORNER':
        return
    n = len(me.loops)
    col = np.empty(n * 4, dtype=np.float32)
    attr.data.foreach_get('color', col)
    col = col.reshape(n, 4)
    vidx = np.empty(n, dtype=np.int64)
    me.loops.foreach_get('vertex_index', vidx)
    nv = len(me.vertices)
    acc = np.zeros(nv, dtype=np.float64)
    cnt = np.zeros(nv, dtype=np.float64)
    np.add.at(acc, vidx, col[:, 0].astype(np.float64))
    np.add.at(cnt, vidx, 1.0)
    ao = acc / np.maximum(cnt, 1.0)
    ao = np.round(ao * (levels - 1)) / (levels - 1)
    g = ao[vidx].astype(np.float32)
    col[:, 0] = g
    col[:, 1] = g
    col[:, 2] = g
    col[:, 3] = 1.0
    attr.data.foreach_set('color', col.reshape(-1))


def _inside_out(obj):
    """Number of closed islands of obj whose signed volume is negative (faces pointing inwards)."""
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    seen = set()
    bad = 0
    for f0 in bm.faces:
        if f0.index in seen:
            continue
        stack = [f0]
        island = []
        seen.add(f0.index)
        while stack:
            f = stack.pop()
            island.append(f)
            for e in f.edges:
                for g in e.link_faces:
                    if g.index not in seen:
                        seen.add(g.index)
                        stack.append(g)
        if any(len(e.link_faces) != 2 for f in island for e in f.edges):
            continue
        vol = 0.0
        for f in island:
            vs = [v.co for v in f.verts]
            for i in range(1, len(vs) - 1):
                vol += vs[0].dot(vs[i].cross(vs[i + 1])) / 6.0
        if vol < -1e-10:
            bad += 1
    bm.free()
    return bad


def _canonical(obj):
    """
    Rebuild obj's mesh in a canonical element order: vertices sorted by position, every face starting at
    its lowest vertex, faces sorted; materials, smooth/sharp flags and the WN vertex group are kept. Some
    bmesh operators (the UV sphere's pole weld, ...) order faces and corners by memory address, which made
    rebuilt GLBs differ byte-wise from run to run (and the weighted normals with them).
    """
    import numpy as np
    me = obj.data
    nv, nf = len(me.vertices), len(me.polygons)
    if nv == 0 or nf == 0:
        return
    co = np.empty(nv * 3, np.float32)
    me.vertices.foreach_get('co', co)
    co = co.reshape(nv, 3)
    ev = np.empty(len(me.edges) * 2, np.int64)
    me.edges.foreach_get('vertices', ev)
    ev = ev.reshape(-1, 2)
    # tie-break for coincident vertices: the summed positions of their edge neighbours
    nb = np.zeros((nv, 3), np.float64)
    np.add.at(nb, ev[:, 0], co[ev[:, 1]].astype(np.float64))
    np.add.at(nb, ev[:, 1], co[ev[:, 0]].astype(np.float64))
    order = np.lexsort((nb[:, 2], nb[:, 1], nb[:, 0], co[:, 2], co[:, 1], co[:, 0]))
    inv = np.empty(nv, np.int64)
    inv[order] = np.arange(nv)
    ls = np.empty(nf, np.int64)
    lt = np.empty(nf, np.int64)
    mi = np.empty(nf, np.int64)
    sm = np.empty(nf, bool)
    me.polygons.foreach_get('loop_start', ls)
    me.polygons.foreach_get('loop_total', lt)
    me.polygons.foreach_get('material_index', mi)
    me.polygons.foreach_get('use_smooth', sm)
    cv = np.empty(len(me.loops), np.int64)
    me.loops.foreach_get('vertex_index', cv)
    cvn = inv[cv]
    faces = []
    for f in range(nf):
        vs = cvn[ls[f]: ls[f] + lt[f]].tolist()
        k = vs.index(min(vs))
        faces.append((int(mi[f]), vs[k:] + vs[:k], bool(sm[f])))
    faces.sort(key=lambda t: (t[0], t[1]))
    sharp = np.empty(len(me.edges), bool)
    me.edges.foreach_get('use_edge_sharp', sharp)
    en = np.sort(inv[ev], axis=1)
    sharp_set = {(int(a), int(b)) for (a, b), s in zip(en.tolist(), sharp.tolist()) if s}
    wn = obj.vertex_groups.get('WN')
    members = []
    if wn is not None:
        gi = wn.index
        members = [int(inv[v.index]) for v in me.vertices if any(g.group == gi for g in v.groups)]
    me2 = bpy.data.meshes.new(me.name + '_c')
    me2.from_pydata(co[order].tolist(), [], [f[1] for f in faces])
    for m in me.materials:
        me2.materials.append(m)
    me2.polygons.foreach_set('material_index', [f[0] for f in faces])
    me2.polygons.foreach_set('use_smooth', [f[2] for f in faces])
    ev2 = np.empty(len(me2.edges) * 2, np.int64)
    me2.edges.foreach_get('vertices', ev2)
    ev2 = np.sort(ev2.reshape(-1, 2), axis=1)
    me2.edges.foreach_set('use_edge_sharp', [(int(a), int(b)) in sharp_set for a, b in ev2.tolist()])
    me2.update()
    name = me.name
    obj.data = me2
    bpy.data.meshes.remove(me)
    me2.name = name
    if wn is not None and members:
        wn.add(members, 1.0, 'REPLACE')


def _mark_sharp(obj, angle_deg, smooth=True):
    me = obj.data
    bm = bmesh.new()
    bm.from_mesh(me)
    lim = math.radians(angle_deg)
    for f in bm.faces:
        f.smooth = smooth
    for e in bm.edges:
        if len(e.link_faces) == 2:
            e.smooth = not (e.calc_face_angle(0.0) > lim)
        else:
            e.smooth = True
    bm.to_mesh(me)
    bm.free()


def _join(base, others):
    others = [o for o in others if o is not base]
    if not others:
        return base
    allobjs = [base] + others
    with bpy.context.temp_override(active_object=base, object=base, selected_objects=allobjs,
                                   selected_editable_objects=allobjs):
        bpy.ops.object.join()
    return base


# --------------------------------------------------------------------------------------------- geo json

def write_geo(entries):
    """Merge {id: entry} into src/core/modcar/data/parts_geo.json (with a lock for parallel builds)."""
    path = GEO_JSON
    os.makedirs(os.path.dirname(path), exist_ok=True)
    lock = path + '.lock'
    t0 = time.time()
    while True:
        try:
            fd = os.open(lock, os.O_CREAT | os.O_EXCL | os.O_WRONLY)
            os.close(fd)
            break
        except FileExistsError:
            if time.time() - t0 > 60:
                os.remove(lock)
            time.sleep(0.2)
    try:
        data = {}
        if os.path.exists(path):
            with open(path, encoding='utf-8') as f:
                data = json.load(f)
        parts = data.get('parts', {})
        parts.update(entries)
        out = {'_conventions': CONVENTIONS, 'parts': dict(sorted(parts.items()))}
        with open(path, 'w', encoding='utf-8') as f:
            json.dump(out, f, indent=1, ensure_ascii=False)
            f.write('\n')
    finally:
        os.remove(lock)


CONVENTIONS = [
    'Written by tools/blender/parts/*.py (python: tools/blender/build.py -- parts/<group> all). Do not edit.',
    'Frame: GAME part frame, x forward, y up, z right, metres; game(x, y, z) = blender(x, z, -y).',
    'bbox: [[minx, miny, minz], [maxx, maxy, maxz]] of all meshes (PART and moving children).',
    'triangles: after modifiers, PART + movers. materials: conventional names used.',
    'eye (seats): the occupant eye position (EYE empty) in the part frame.',
    'fit_nominal (stretch parts): [length, width, height] of the nominal box the part was modelled for.',
    'radius/width (rims): bead-seat radius and width; tyres: radius = outer radius, inner_radius = bead,',
    '  width = section width, sidewall = radius - inner_radius. Tyre variant files: <tyre>@<rim>.glb.',
    'mounts: child empties M_* (sub-mounts); mount_tf: their pos and quat (x, y, z, w) in the part frame.',
    'movers: child meshes that move (pivot = their origin in the part frame).',
    'Origins: engines bottom centre on the mount, crank along x, pulleys +x; gearbox bottom of the case, input +x;',
    '  radiator/battery/tanks bottom centre; rims/tyres wheel centre, axle along z (game), outer face -z (left);',
    '  seats floor attach centre facing +x; steering column end, wheel faces -x, turns about x (bar: about y);',
    '  lamps/mirror body mount; stretch parts: centre of the face that touches the body (bumpers: x = 0 plane,',
    '  front bumper extends +x, rear -x; roof: bottom face; armour: inner face, extends to -z = outwards left).',
    '  exhausts: inlet flange (front end), the system runs rearwards (-x). turbo: turbine inlet flange, sits +y.',
    'Gear levers: LEVER is the moving lever, its origin the pivot; the game turns it about z. Floor levers pivot',
    '  under the floor; gl_foot (moto, LEFT side) on the selector shaft axis, the toe peg forward-up (+x +y) and',
    '  out to the left (-z), shaft and seal 2.5 cm inboard (+z); a positive z angle lifts the peg.',
    'Add-ons (not in the catalogue): door_armor_overlay / door_cage_overlay / door_fridge_handle sit on a left door',
    '  skin (inner face at the origin, standing out to -z); hood_scoop_overlay sits on a bonnet (flat underside at',
    '  y = 0, origin at the centre of its base, mouth towards +x); all are paint-coloured and carry fit_nominal.',
    'Variants: <tyre>@<rim> (tyres per rim), exh_side@moto (the side pipe shaped for a motorcycle: along its left side',
    '  under the footpeg; exh_side itself runs out to a car sill 0.93 m to the left of the mount).',
]


# --------------------------------------------------------------------------------------------- previews

def _sock(sockets, name, kind):
    for s in sockets:
        if s.name == name and s.type == kind:
            return s
    raise KeyError(name)


def _studio(target_z0, sun_yaw=145.0, sun_elev=38.0):
    scene = bpy.context.scene
    w = scene.world or bpy.data.worlds.new('World')
    scene.world = w
    w.use_nodes = True
    nt = w.node_tree
    for n in list(nt.nodes):
        nt.nodes.remove(n)
    out = nt.nodes.new('ShaderNodeOutputWorld')
    bg = nt.nodes.new('ShaderNodeBackground')
    sky = nt.nodes.new('ShaderNodeTexSky')
    sky.sky_type = 'MULTIPLE_SCATTERING'
    sky.sun_elevation = math.radians(sun_elev)
    sky.sun_rotation = math.radians(sun_yaw + 90)
    sky.sun_disc = False
    tc = nt.nodes.new('ShaderNodeTexCoord')
    sep = nt.nodes.new('ShaderNodeSeparateXYZ')
    mr = nt.nodes.new('ShaderNodeMapRange')
    mr.inputs['From Min'].default_value = -0.03
    mr.inputs['From Max'].default_value = 0.02
    mix = nt.nodes.new('ShaderNodeMix')
    mix.data_type = 'RGBA'
    _sock(mix.inputs, 'A', 'RGBA').default_value = (0.34, 0.32, 0.30, 1.0)  # below the horizon
    nt.links.new(tc.outputs['Generated'], sep.inputs[0])
    nt.links.new(sep.outputs['Z'], mr.inputs['Value'])
    nt.links.new(mr.outputs['Result'], _sock(mix.inputs, 'Factor', 'VALUE'))
    nt.links.new(sky.outputs['Color'], _sock(mix.inputs, 'B', 'RGBA'))
    nt.links.new(_sock(mix.outputs, 'Result', 'RGBA'), bg.inputs['Color'])
    bg.inputs['Strength'].default_value = 0.32
    nt.links.new(bg.outputs['Background'], out.inputs['Surface'])
    sun = bpy.data.lights.new('sun', 'SUN')
    sun.energy = 3.6
    sun.angle = math.radians(1.5)
    sun.color = (1.0, 0.95, 0.88)
    so = bpy.data.objects.new('sun', sun)
    scene.collection.objects.link(so)
    so.rotation_euler = (math.radians(90 - sun_elev), 0, math.radians(sun_yaw + 90))
    # a fill from the back
    fill = bpy.data.lights.new('fill', 'SUN')
    fill.energy = 0.8
    fill.color = (0.75, 0.85, 1.0)
    fo = bpy.data.objects.new('fill', fill)
    scene.collection.objects.link(fo)
    fo.rotation_euler = (math.radians(60), 0, math.radians(sun_yaw - 90))
    bm = bmesh.new()
    bmesh.ops.create_circle(bm, cap_ends=True, segments=48, radius=40.0)
    g = mc.mesh_object('_ground', bm)
    g.location.z = target_z0
    gm = bpy.data.materials.get('_ground') or bpy.data.materials.new('_ground')
    b = gm.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = (0.30, 0.29, 0.28, 1)
    b.inputs['Roughness'].default_value = 0.75
    g.data.materials.append(gm)
    return [so, fo, g]


def _render_materials():
    """Preview-only tweaks: AO from 'Col' multiplies the base colour, lenses see-through, emit glows."""
    for m in bpy.data.materials:
        if m.name.startswith('_') or not m.node_tree:
            continue
        nt = m.node_tree
        b = next((n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED'), None)
        if b is None:
            continue
        base = m.name.split('.')[0]
        for lk in list(b.inputs['Base Color'].links):
            nt.links.remove(lk)
        if base in mc.MAT_NAMES:
            c3, rough, metal = mc.MAT_NAMES[base]
            col = (*c3, 1.0)
            b.inputs['Roughness'].default_value = rough
            b.inputs['Metallic'].default_value = metal
        else:
            col = tuple(b.inputs['Base Color'].default_value)
        at = nt.nodes.new('ShaderNodeVertexColor')
        at.layer_name = 'Col'
        mul = nt.nodes.new('ShaderNodeMix')
        mul.data_type = 'RGBA'
        mul.blend_type = 'MULTIPLY'
        _sock(mul.inputs, 'Factor', 'VALUE').default_value = 1.0
        _sock(mul.inputs, 'A', 'RGBA').default_value = col
        nt.links.new(at.outputs['Color'], _sock(mul.inputs, 'B', 'RGBA'))
        nt.links.new(_sock(mul.outputs, 'Result', 'RGBA'), b.inputs['Base Color'])
        if base.startswith('lens') or base.startswith('glass'):
            b.inputs['Alpha'].default_value = 0.35 if base != 'glass_dark' else 0.8
            try:
                m.surface_render_method = 'BLENDED'
            except Exception:
                pass
        if base == 'emit':
            b.inputs['Emission Color'].default_value = (1.0, 0.85, 0.6, 1)
            b.inputs['Emission Strength'].default_value = 3.0
        if base == 'chrome':
            b.inputs['Roughness'].default_value = 0.06
        if base in ('steel', 'alu', 'rust'):
            # previews only: brushed metal reads lighter in the game's shading than a mirror would
            b.inputs['Metallic'].default_value = 0.55 if base != 'rust' else 0.2
            b.inputs['Roughness'].default_value = 0.38 if base != 'rust' else 0.8
        if base == 'paint' or base == 'paint_b':
            b.inputs['Coat Weight'].default_value = 0.6


def render(P, views=None, size=(900, 720), engine='BLENDER_EEVEE', samples=48, suffix='', extra_objs=None,
           lens=50.0, margin=1.12, z0=None):
    """EEVEE previews of the finished part into SCRATCH/<id><suffix>_<view>.png. views = [(tag, yaw, pitch)]."""
    scene = bpy.context.scene
    meshes = [P.root] + P.mover_objs + (extra_objs or [])
    pts = []
    dg = bpy.context.evaluated_depsgraph_get()
    for o in meshes:
        ev = o.evaluated_get(dg)
        me = ev.to_mesh()
        pts += [o.matrix_world @ v.co for v in me.vertices]
        ev.to_mesh_clear()
    lo = V((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
    hi = V((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
    c = (lo + hi) / 2
    rad = max((p - c).length for p in pts)
    helpers = _studio(lo.z if z0 is None else z0)
    _render_materials()
    scene.render.engine = engine
    scene.render.resolution_x, scene.render.resolution_y = size
    scene.render.film_transparent = False
    try:
        scene.eevee.taa_render_samples = samples
        scene.eevee.use_raytracing = True
        scene.eevee.use_shadows = True
        scene.eevee.use_fast_gi = True
    except Exception:
        pass
    try:
        scene.view_settings.view_transform = 'AgX'
        scene.view_settings.look = 'AgX - Medium High Contrast'
    except Exception:
        pass
    cam_data = bpy.data.cameras.new('cam')
    cam_data.lens = lens
    cam_data.clip_start = 0.01
    cam = bpy.data.objects.new('cam', cam_data)
    scene.collection.objects.link(cam)
    scene.camera = cam
    fov = 2 * math.atan(18.0 / lens) * min(1.0, size[1] / size[0]) if size[0] > size[1] else 2 * math.atan(18.0 / lens)
    dist = rad / math.sin(fov / 2) * margin
    views = views or [('a', 35, 20), ('b', 215, 24)]
    outs = []
    sun, fill = helpers[0], helpers[1]
    for tag, yaw, pitch in views:
        yw, pt = math.radians(yaw), math.radians(pitch)
        d = V((math.cos(yw) * math.cos(pt), -math.sin(yw) * math.cos(pt), math.sin(pt)))
        # key light from above the camera's left shoulder, fill from the opposite side
        az = -yaw + 50.0
        sun.rotation_euler = (math.radians(90 - 42), 0, math.radians(az + 90))
        fill.rotation_euler = (math.radians(90 - 25), 0, math.radians(az + 90 + 160))
        cam.location = c + d * dist
        cam.rotation_euler = (c - cam.location).to_track_quat('-Z', 'Y').to_euler()
        path = os.path.join(SCRATCH, f'{P.id}{suffix}_{tag}.png')
        scene.render.filepath = path
        bpy.ops.render.render(write_still=True)
        outs.append(path)
    for h in helpers + [cam]:
        bpy.data.objects.remove(h)
    return outs


# --------------------------------------------------------------------------------------------- toon previews

def _toon_materials():
    """Preview-only cel look close to the game's: lit / shadow tones split by a hard terminator, the shadow
    tinted by the sky, chrome as hard horizon bands, AO from 'Col' darkening both tones."""
    for m in bpy.data.materials:
        if m.name.startswith('_'):
            continue
        base = m.name.split('.')[0]
        if base not in mc.MAT_NAMES:
            continue
        c3, rough, metal = mc.MAT_NAMES[base]
        m.use_nodes = True
        nt = m.node_tree
        for n in list(nt.nodes):
            nt.nodes.remove(n)
        out = nt.nodes.new('ShaderNodeOutputMaterial')
        em = nt.nodes.new('ShaderNodeEmission')
        nt.links.new(em.outputs[0], out.inputs['Surface'])
        ao = nt.nodes.new('ShaderNodeVertexColor')
        ao.layer_name = 'Col'
        if base == 'chrome':
            geo = nt.nodes.new('ShaderNodeNewGeometry')
            sep = nt.nodes.new('ShaderNodeSeparateXYZ')
            ramp = nt.nodes.new('ShaderNodeValToRGB')
            ramp.color_ramp.interpolation = 'CONSTANT'
            els = ramp.color_ramp.elements
            els[0].position = 0.0
            els[0].color = (0.16, 0.15, 0.17, 1)
            els[1].position = 0.47
            els[1].color = (0.95, 0.97, 1.0, 1)
            e = els.new(0.62)
            e.color = (0.55, 0.62, 0.75, 1)
            e = els.new(0.86)
            e.color = (1.0, 1.0, 1.0, 1)
            mr = nt.nodes.new('ShaderNodeMapRange')
            mr.inputs['From Min'].default_value = -1.0
            mr.inputs['From Max'].default_value = 1.0
            nt.links.new(geo.outputs['Normal'], sep.inputs[0])
            nt.links.new(sep.outputs['Z'], mr.inputs['Value'])
            nt.links.new(mr.outputs['Result'], ramp.inputs['Fac'])
            col_out = ramp.outputs['Color']
        else:
            dif = nt.nodes.new('ShaderNodeBsdfDiffuse')
            dif.inputs['Color'].default_value = (1, 1, 1, 1)
            s2r = nt.nodes.new('ShaderNodeShaderToRGB')
            nt.links.new(dif.outputs[0], s2r.inputs[0])
            bw = nt.nodes.new('ShaderNodeRGBToBW')
            nt.links.new(s2r.outputs['Color'], bw.inputs[0])
            ramp = nt.nodes.new('ShaderNodeValToRGB')
            ramp.color_ramp.interpolation = 'CONSTANT'
            els = ramp.color_ramp.elements
            lit = [min(1.0, c * 1.05) for c in c3]
            shade = [c * k for c, k in zip(c3, (0.42, 0.48, 0.66))]
            els[0].position = 0.0
            els[0].color = (*shade, 1)
            els[1].position = 0.3
            els[1].color = (*lit, 1)
            if metal > 0.5 or base in ('ceramic', 'paint', 'paint_b'):
                e = els.new(0.92)
                e.color = (min(1, lit[0] * 1.35 + 0.1), min(1, lit[1] * 1.35 + 0.1), min(1, lit[2] * 1.35 + 0.1), 1)
            nt.links.new(bw.outputs[0], ramp.inputs['Fac'])
            col_out = ramp.outputs['Color']
        mul = nt.nodes.new('ShaderNodeMix')
        mul.data_type = 'RGBA'
        mul.blend_type = 'MULTIPLY'
        _sock(mul.inputs, 'Factor', 'VALUE').default_value = 0.85
        nt.links.new(col_out, _sock(mul.inputs, 'A', 'RGBA'))
        nt.links.new(ao.outputs['Color'], _sock(mul.inputs, 'B', 'RGBA'))
        nt.links.new(_sock(mul.outputs, 'Result', 'RGBA'), em.inputs['Color'])
        if base == 'emit':
            em.inputs['Strength'].default_value = 2.0


def render_toon(P, views=None, size=(480, 384), suffix='_toon', lens=50.0, margin=1.1):
    """Cel-look previews with Freestyle outlines into SCRATCH/<id><suffix>_<view>.png."""
    scene = bpy.context.scene
    meshes = [P.root] + P.mover_objs
    pts = []
    dg = bpy.context.evaluated_depsgraph_get()
    for o in meshes:
        ev = o.evaluated_get(dg)
        me = ev.to_mesh()
        pts += [o.matrix_world @ v.co for v in me.vertices]
        ev.to_mesh_clear()
    lo = V((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
    hi = V((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
    c = (lo + hi) / 2
    rad = max((p - c).length for p in pts)
    _toon_materials()
    w = scene.world or bpy.data.worlds.new('World')
    scene.world = w
    w.use_nodes = True
    bg = w.node_tree.nodes.get('Background')
    if bg is None:
        for n in list(w.node_tree.nodes):
            w.node_tree.nodes.remove(n)
        bg = w.node_tree.nodes.new('ShaderNodeBackground')
        o = w.node_tree.nodes.new('ShaderNodeOutputWorld')
        w.node_tree.links.new(bg.outputs[0], o.inputs[0])
    for lk in list(bg.inputs['Color'].links):
        w.node_tree.links.remove(lk)
    bg.inputs['Color'].default_value = (0.62, 0.70, 0.80, 1)
    bg.inputs['Strength'].default_value = 1.0
    sun = bpy.data.lights.new('toon_sun', 'SUN')
    sun.energy = 4.0
    so = bpy.data.objects.new('toon_sun', sun)
    scene.collection.objects.link(so)
    scene.render.engine = 'BLENDER_EEVEE'
    scene.render.resolution_x, scene.render.resolution_y = size
    scene.view_settings.view_transform = 'Standard'
    scene.view_settings.look = 'None'
    scene.render.use_freestyle = True
    scene.render.line_thickness_mode = 'ABSOLUTE'
    scene.render.line_thickness = 1.1
    vl = scene.view_layers[0]
    fs = vl.freestyle_settings
    fs.crease_angle = math.radians(128)
    ls = fs.linesets[0] if fs.linesets else fs.linesets.new('lines')
    ls.select_by_visibility = True
    ls.select_silhouette = True
    ls.select_border = True
    ls.select_crease = True
    ls.select_material_boundary = True
    if ls.linestyle is None:
        ls.linestyle = bpy.data.linestyles.new('toon_lines')
    ls.linestyle.color = (0.16, 0.10, 0.09)
    ls.linestyle.thickness = 1.1
    try:
        scene.eevee.taa_render_samples = 16
    except Exception:
        pass
    cam_data = bpy.data.cameras.new('toon_cam')
    cam_data.lens = lens
    cam = bpy.data.objects.new('toon_cam', cam_data)
    scene.collection.objects.link(cam)
    scene.camera = cam
    fov = 2 * math.atan(18.0 / lens) * min(1.0, size[1] / size[0])
    dist = rad / math.sin(fov / 2) * margin
    cam_data.clip_start = min(cam_data.clip_start, dist * 0.1)   # (a thing a few centimetres across is nearer than the default near plane)
    views = views or [('a', 35, 20)]
    outs = []
    for tag, yaw, pitch in views:
        yw, pt = math.radians(yaw), math.radians(pitch)
        d = V((math.cos(yw) * math.cos(pt), -math.sin(yw) * math.cos(pt), math.sin(pt)))
        az = -yaw + 50.0
        so.rotation_euler = (math.radians(90 - 45), 0, math.radians(az + 90))
        cam.location = c + d * dist
        cam.rotation_euler = (c - cam.location).to_track_quat('-Z', 'Y').to_euler()
        path = os.path.join(SCRATCH, f'{P.id}{suffix}_{tag}.png')
        scene.render.filepath = path
        bpy.ops.render.render(write_still=True)
        outs.append(path)
    scene.render.use_freestyle = False
    for h in (so, cam):
        bpy.data.objects.remove(h)
    return outs


# --------------------------------------------------------------------------------------------- running

def parse(args):
    ids = []
    opts = {}
    for a in args:
        if a.startswith('--'):
            k, _, v = a[2:].partition('=')
            opts[k] = v or True
        else:
            ids.append(a)
    return ids or ['all'], opts


def run(table, args, after=None, out_dir=None, geo=True):
    """
    Build the ids in args ('all' = every id in the table). Flags: --norender, --noao, --nogeo.
    out_dir: where the GLBs go (default the parts folder); geo=False keeps them out of parts_geo.json.
    """
    ids, opts = parse(args)
    if 'all' in ids:
        ids = list(table.keys())
    entries = {}
    t_all = time.time()
    for pid in ids:
        if pid not in table:
            raise SystemExit(f'unknown part id {pid!r}; known: {sorted(table)}')
        t0 = time.time()
        P = Part(pid, {'no_ao': bool(opts.get('noao')), 'stats': bool(opts.get('stats')), 'mask': out_dir is None})
        res = table[pid](P)
        if res is not None and isinstance(res, dict):
            # a builder may return {extra_id: entry} for generated variants (already exported)
            entries.update(res)
            continue
        P.finish()
        P.export(os.path.join(out_dir, f'{pid}.glb') if out_dir else None)
        e = P.geo_entry()
        entries[pid] = e
        print(f'PART {pid}: {P.tris} tris, bbox {e["bbox"]} ({time.time() - t0:.1f}s)')
        if not opts.get('norender'):
            views = getattr(P, 'views', None)
            if opts.get('toon'):
                render_toon(P, views=views[:1] if views else None)
            else:
                render(P, views=views)
        if after:
            after(P, opts)
    if geo and not opts.get('nogeo'):
        write_geo(entries)
    print(f'DONE {len(entries)} entries in {time.time() - t_all:.1f}s')
    return entries
