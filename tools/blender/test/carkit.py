"""
Geometry helpers for the shader agent's test car (tools/blender/test/testcar.py). Kept out of
tools/blender/lib/modcar.py (the lead's) on purpose: these are only what the test car needs.

Everything here builds bmesh geometry directly from functions, so every feature line (a panel groove,
the edge of a window, a seal) falls exactly on a grid line:

  grid(...)   a parametric surface P(u, v) sampled on given u and v values (quads), with a material per
              face and holes chosen by the face's centre parameters
  lathe(...)  a profile (r, y) turned round the Y axis (Blender's left/right: wheels, lamps, gauges)
  sweep(...)  a closed 2D profile carried along a 3D path (bumpers, bars, tubes)
  rbox(...)   a box with rounded edges (cube + bevel), for seats and the dash

Axes as in modcar.py: Blender X forward, Y left, Z up, metres.
"""
import math

import bmesh
import bpy
from mathutils import Matrix, Vector

from lib import modcar as mc


def spow(x, e):
    """signed power: keeps the sign, raises the magnitude"""
    return math.copysign(abs(x) ** e, x)


def smooth01(t):
    t = min(1.0, max(0.0, t))
    return t * t * (3.0 - 2.0 * t)


def curve(keys):
    """A smooth function through (x, value) keys (sorted by x): Catmull-Rom between keys, flat outside."""
    keys = sorted(keys)
    xs = [k[0] for k in keys]
    ys = [k[1] for k in keys]
    n = len(keys)

    def tangent(i):
        if i == 0 or i == n - 1:
            return 0.0
        return (ys[i + 1] - ys[i - 1]) / (xs[i + 1] - xs[i - 1])

    def f(x):
        if x <= xs[0]:
            return ys[0]
        if x >= xs[-1]:
            return ys[-1]
        i = 0
        while xs[i + 1] < x:
            i += 1
        h = xs[i + 1] - xs[i]
        t = (x - xs[i]) / h
        m0 = tangent(i) * h
        m1 = tangent(i + 1) * h
        t2 = t * t
        t3 = t2 * t
        return (2 * t3 - 3 * t2 + 1) * ys[i] + (t3 - 2 * t2 + t) * m0 + (-2 * t3 + 3 * t2) * ys[i + 1] + (t3 - t2) * m1

    return f


def samples(lo, hi, n, breaks=(), gap=0.0, ease=None):
    """
    About n even steps from lo to hi, plus every break b (and b ± gap/2 when gap > 0): the lines a
    feature must fall on. Even samples crowding a break are dropped (thin slivers shade badly).
    ease maps 0..1 → 0..1 to bunch the even samples (towards the rounded ends of a body).
    """
    must = set()
    for b in breaks:
        must.add(b)
        if gap > 0:
            must.add(b - gap / 2)
            must.add(b + gap / 2)
    must = sorted(m for m in must if lo - 1e-9 <= m <= hi + 1e-9)
    step = (hi - lo) / n
    even = []
    for i in range(n + 1):
        t = i / n
        even.append(lo + (hi - lo) * (ease(t) if ease else t))
    out = list(must)
    for v in even:
        if all(abs(v - m) > step * 0.35 for m in must):
            out.append(v)
    return sorted(out)


class Mats:
    """material slots of one object: name → index, in order of first use"""

    def __init__(self):
        self.names = []

    def __call__(self, name):
        if name not in self.names:
            self.names.append(name)
        return self.names.index(name)

    def assign(self, obj):
        set_slots(obj, [mc.mat(n) for n in self.names])


def set_slots(obj, mats, remap=None):
    """replace an object's material slots, keeping (or remapping) each face's material
    (mesh.materials.clear() resets every face to slot 0, so the indices are put back afterwards)"""
    idx = [p.material_index for p in obj.data.polygons]
    if remap is not None:
        idx = [remap.get(i, 0) for i in idx]
    obj.data.materials.clear()
    for m in mats:
        obj.data.materials.append(m)
    for p, i in zip(obj.data.polygons, idx):
        p.material_index = i


def dedupe_slots(obj):
    """one slot per material name ('paint.001' counts as 'paint')"""
    names = []
    remap = {}
    for i, m in enumerate(obj.data.materials):
        n = (m.name if m else 'paint').split('.')[0]
        if n not in names:
            names.append(n)
        remap[i] = names.index(n)
    set_slots(obj, [mc.mat(n) for n in names], remap)
    return obj


def surface_normal(P, u, v, du=1e-4, dv=1e-4, flip=False):
    """normal of P at (u, v) from central differences (cross of dP/du and dP/dv)"""
    pu = (Vector(P(u + du, v)) - Vector(P(u - du, v))) / (2 * du)
    pv = (Vector(P(u, v + dv)) - Vector(P(u, v - dv))) / (2 * dv)
    n = pu.cross(pv)
    if n.length < 1e-12:
        return Vector((0, 0, 1))
    n.normalize()
    return -n if flip else n


def grid(name, P, us, vs, period=None, mat_of=None, keep=None, uv_of=None, flip=False, offset=None, coll=None, weld=1e-5):
    """
    A surface from P(u, v) → (x, y, z) on the grid us × vs (quads).
      period    v is periodic (a section going all the way round): vs covers [v0, v0 + period)
      mat_of(uc, vc) → material name of the face whose centre parameters are (uc, vc)
      keep(uc, vc) → False to leave the face out (a window opening)
      uv_of(u, v) → (s, t) texture coordinates
      offset(u, v) → metres to move the point along the surface normal (grooves, inset glass)
      flip      turn the faces over (when P's u × v points inwards)
    Points that fall together (the poles of a closed body) are welded.
    """
    bm = bmesh.new()
    mats = Mats()
    nv = len(vs)
    rows = []
    for u in us:
        row = []
        for v in vs:
            p = Vector(P(u, v))
            if offset is not None:
                d = offset(u, v)
                if d:
                    p = p + surface_normal(P, u, v, flip=flip) * d
            row.append(bm.verts.new(p))
        rows.append(row)
    uvl = bm.loops.layers.uv.new('UVMap') if uv_of else None
    jn = nv if period else nv - 1
    for i in range(len(us) - 1):
        for j in range(jn):
            j1 = (j + 1) % nv
            uc = (us[i] + us[i + 1]) / 2
            v1 = vs[j1] if j1 > j else vs[j1] + period
            vc = (vs[j] + v1) / 2
            if period and vc >= vs[0] + period:
                vc -= period
            if keep is not None and not keep(uc, vc):
                continue
            quad = [rows[i][j], rows[i + 1][j], rows[i + 1][j1], rows[i][j1]]
            if flip:
                quad.reverse()
            if len(set(quad)) < 3:
                continue
            try:
                f = bm.faces.new(quad)
            except ValueError:
                continue
            f.material_index = mats(mat_of(uc, vc) if mat_of else 'paint')
            if uvl is not None:
                pr = [(us[i], vs[j]), (us[i + 1], vs[j]), (us[i + 1], v1), (us[i], v1)]
                if flip:
                    pr.reverse()
                for loop, (a, b) in zip(f.loops, pr):
                    loop[uvl].uv = uv_of(a, b)
    if weld:
        bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=weld)
    # faces squashed to nothing at a pole go
    bad = [f for f in bm.faces if f.calc_area() < 1e-10]
    if bad:
        bmesh.ops.delete(bm, geom=bad, context='FACES')
    loose = [v for v in bm.verts if not v.link_faces]
    if loose:
        bmesh.ops.delete(bm, geom=loose, context='VERTS')
    obj = mc.mesh_object(name, bm, None, coll)
    mats.assign(obj)
    return obj


def lathe(name, profile, segments=48, mat='steel', mats_of=None, closed=False, uv_radial=False, coll=None, axis='Y', arc=(0.0, 2 * math.pi)):
    """
    Turn a profile of (r, a) points round an axis (default Blender Y: a is along Y, r away from it).
    Faces look to the right of the profile's direction in the (r, a) plane: a profile climbing in a
    at constant r faces outwards, one running in towards the axis while climbing faces up.
    mats_of(k) → material of the band between profile points k and k+1 (else `mat` for all).
    uv_radial: texture coordinates (0.5 + r cos, 0.5 + r sin) / (2 r_max) — a lens or a dial face
    with its centre at (0.5, 0.5).
    """
    bm = bmesh.new()
    m = Mats()
    full = abs((arc[1] - arc[0]) - 2 * math.pi) < 1e-6
    nseg = segments
    rmax = max(p[0] for p in profile) or 1.0
    ring = []
    for s in range(nseg if full else nseg + 1):
        th = arc[0] + (arc[1] - arc[0]) * s / nseg
        c, sn = math.cos(th), math.sin(th)
        col = []
        for r, a in profile:
            if axis == 'Y':
                p = (r * c, a, r * sn)
            elif axis == 'X':
                p = (a, r * c, r * sn)
            else:
                p = (r * c, r * sn, a)
            col.append(bm.verts.new(p))
        ring.append(col)
    uvl = bm.loops.layers.uv.new('UVMap') if uv_radial else None
    npf = len(profile)
    segs = nseg if full else nseg
    for s in range(segs):
        s1 = (s + 1) % len(ring)
        for k in range(npf - 1 + (1 if closed else 0)):
            k1 = (k + 1) % npf
            quad = [ring[s][k], ring[s][k1], ring[s1][k1], ring[s1][k]]
            # (r, a) → (x, y, z) is right-handed for Y and left-handed for X and Z: same faces either way
            if axis != 'Y':
                quad.reverse()
            if len(set(quad)) < 3:
                continue
            try:
                f = bm.faces.new(quad)
            except ValueError:
                continue
            f.material_index = m(mats_of(k) if mats_of else mat)
            if uvl is not None:
                # straight from the position: (0.5, 0.5) on the axis, the rim of the widest ring on the unit circle
                for loop in f.loops:
                    co = loop.vert.co
                    p1, p2 = (co.x, co.z) if axis == 'Y' else (co.y, co.z) if axis == 'X' else (co.x, co.y)
                    loop[uvl].uv = (0.5 + 0.5 * p1 / rmax, 0.5 + 0.5 * p2 / rmax)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-6)
    bad = [f for f in bm.faces if f.calc_area() < 1e-12]
    if bad:
        bmesh.ops.delete(bm, geom=bad, context='FACES')
    obj = mc.mesh_object(name, bm, None, coll)
    m.assign(obj)
    return obj


def frames_along(path):
    """parallel-transport frames (tangent, normal, binormal) along a polyline"""
    pts = [Vector(p) for p in path]
    n = len(pts)
    tans = []
    for i in range(n):
        a = pts[max(0, i - 1)]
        b = pts[min(n - 1, i + 1)]
        t = (b - a)
        tans.append(t.normalized() if t.length > 1e-9 else Vector((1, 0, 0)))
    up = Vector((0, 0, 1)) if abs(tans[0].z) < 0.9 else Vector((1, 0, 0))
    nrm = (up - tans[0] * up.dot(tans[0])).normalized()
    out = []
    for i in range(n):
        if i > 0:
            # rotate the previous normal by the turn between tangents
            axis = tans[i - 1].cross(tans[i])
            if axis.length > 1e-9:
                ang = math.asin(min(1.0, axis.length))
                if tans[i - 1].dot(tans[i]) < 0:
                    ang = math.pi - ang
                nrm = Matrix.Rotation(ang, 3, axis.normalized()) @ nrm
            nrm = (nrm - tans[i] * nrm.dot(tans[i])).normalized()
        out.append((pts[i], tans[i], nrm, tans[i].cross(nrm)))
    return out


def sweep(name, profile, path, mat='chrome', closed_path=False, caps=True, coll=None, up=None, scale=None):
    """
    Carry a closed 2D profile [(a, b), …] along a 3D path. The profile's a axis follows `up`
    (default: the frame's normal, which starts near world Z), b the binormal.
    scale(i) → size factor of the profile at path point i (tapered ends).
    """
    bm = bmesh.new()
    fr = frames_along(path)
    rings = []
    for i, (p, t, nrm, bn) in enumerate(fr):
        if up is not None:
            u = Vector(up)
            nrm = (u - t * u.dot(t)).normalized()
            bn = t.cross(nrm)
        k = scale(i) if scale else 1.0
        rings.append([bm.verts.new(p + nrm * a * k + bn * b * k) for a, b in profile])
    npf = len(profile)
    nr = len(rings)
    for i in range(nr if closed_path else nr - 1):
        i1 = (i + 1) % nr
        for k in range(npf):
            k1 = (k + 1) % npf
            try:
                bm.faces.new([rings[i][k], rings[i1][k], rings[i1][k1], rings[i][k1]])
            except ValueError:
                pass
    if caps and not closed_path:
        for ring, rev in ((rings[0], True), (rings[-1], False)):
            try:
                f = bm.faces.new(list(reversed(ring)) if rev else ring)
            except ValueError:
                pass
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    obj = mc.mesh_object(name, bm, mat, coll)
    return obj


def circle_profile(r, n=12):
    return [(r * math.cos(2 * math.pi * i / n), r * math.sin(2 * math.pi * i / n)) for i in range(n)]


def rrect_profile(w, h, r, n=4):
    """a rounded rectangle w × h (a along h, b along w) with corner radius r, n points per corner"""
    pts = []
    r = min(r, w / 2, h / 2)
    for cx, cy, a0 in ((w / 2 - r, h / 2 - r, 0.0), (-w / 2 + r, h / 2 - r, 90.0), (-w / 2 + r, -h / 2 + r, 180.0), (w / 2 - r, -h / 2 + r, 270.0)):
        for i in range(n + 1):
            a = math.radians(a0 + 90.0 * i / n)
            pts.append((cy + r * math.sin(a), cx + r * math.cos(a)))
    return pts


def rbox(name, center, size, radius=0.02, segments=3, mat='plastic_int', coll=None, rot=(0, 0, 0)):
    """a box with rounded edges (bevel applied), centre and full size in metres"""
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts:
        v.co.x *= size[0]
        v.co.y *= size[1]
        v.co.z *= size[2]
    obj = mc.mesh_object(name, bm, mat, coll)
    if radius > 0:
        mc.bevel(obj, width=radius, segments=segments, angle_deg=30.0, harden=False)
        mc.apply_modifiers(obj)
    # centre and turn baked into the mesh: the object stays at the origin, ready to be placed
    obj.rotation_euler = rot
    obj.location = center
    return apply_transform(obj)


def apply_transform(obj):
    """bake location/rotation/scale into the mesh (origin to the world origin). matrix_basis, not
    matrix_world: the latter is only refreshed by a depsgraph update, which a script does not wait for"""
    obj.data.transform(obj.matrix_basis)
    obj.location = (0, 0, 0)
    obj.rotation_mode = 'XYZ'
    obj.rotation_euler = (0, 0, 0)
    obj.rotation_quaternion = (1, 0, 0, 0)
    obj.scale = (1, 1, 1)
    return obj


def join(name, objs):
    """join objects into one (materials are merged by name)"""
    objs = [o for o in objs if o is not None]
    if not objs:
        return None
    for o in objs:
        apply_transform(o)
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.join()
    out = bpy.context.view_layer.objects.active
    out.name = name
    out.data.name = name
    return dedupe_slots(out)


def mirror_copy(obj, name):
    """a copy mirrored to the other side (Y → −Y), faces turned the right way out"""
    me = obj.data.copy()
    o = bpy.data.objects.new(name, me)
    for c in obj.users_collection:
        c.objects.link(o)
    o.matrix_basis = obj.matrix_basis.copy()
    apply_transform(o)
    me.transform(Matrix.Scale(-1, 4, Vector((0, 1, 0))))
    me.flip_normals()
    return o
