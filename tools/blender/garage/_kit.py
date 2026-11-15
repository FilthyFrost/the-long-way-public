"""
The garage artist's kit (docs/MODCAR.md section 9): builders that pour geometry straight into one
bmesh per material (a "bucket"), the finishing pipeline (bevels, sharp edges, ambient occlusion baked
into the vertex colours and multiplied by per-face tints), the layout file the game reads, and quick
previews.

Everything here is modelled in the GAME frame: x towards the door and the road, y up, z to the right
(when facing the door), metres; the origin is on the workshop floor in the middle of the room. Only at
the very end is the geometry turned into Blender's frame (X forward, Y left, Z up: blender = (x, -z, y)),
so that the glTF exporter (+Y up) hands the game back exactly the coordinates written here.

    K = Kit('garage')
    K.box('timber', (0, 1.8, -4.9), (0.18, 3.6, 0.18), bev=0.012)
    K.cyl('p_red', (5.2, 0.44, -4.4), 0.29, 0.88, segs=24, bev=0.006)
    ...
    K.finish(); K.export('public/models/modcar/garage/garage.glb')

Materials are recognised by name only (MATS below: the shell is painted without ink lines, props are
inked like the vehicles); src/game/modcar/garage.ts maps each name to one of the game's shaders. The
shared ModCar helpers (tools/blender/lib/modcar.py) are used, not changed.
"""

import json
import math
import os
import random
import time

import bmesh
import bpy
from mathutils import Euler, Matrix, Vector

from lib import modcar as mc

V = Vector
TAU = math.tau
SCRATCH = 'D:/modcar-scratch/garage'

# preview colours (sRGB-ish, Blender only; the game takes its colours from garage.ts)
MATS = {
    # ---- the building: painted, no ink
    'floor': (0.55, 0.53, 0.5),
    'plinth': (0.6, 0.58, 0.54),
    'timber': (0.36, 0.24, 0.15),
    'boards': (0.55, 0.38, 0.24),
    'siding': (0.55, 0.2, 0.14),
    'g_trim': (0.9, 0.86, 0.76),
    'tin_out': (0.3, 0.31, 0.33),
    'tin_in': (0.62, 0.64, 0.66),
    'skylight': (0.85, 0.88, 0.8),
    'win_glass': (0.75, 0.85, 0.9),
    'plaster': (0.86, 0.82, 0.72),
    'apron': (0.6, 0.58, 0.55),
    # ---- props: inked cel, the vehicles' names where they fit
    'steel': (0.45, 0.47, 0.5),
    'chrome': (0.9, 0.9, 0.92),
    'alu': (0.7, 0.71, 0.72),
    'rubber': (0.05, 0.05, 0.06),
    'trim': (0.08, 0.08, 0.09),
    'wood': (0.6, 0.42, 0.25),
    'wood_dark': (0.32, 0.2, 0.12),
    'rust': (0.45, 0.2, 0.08),
    'glass': (0.75, 0.85, 0.9),
    'fabric': (0.35, 0.22, 0.16),
    'leather': (0.25, 0.12, 0.07),
    'ceramic': (0.95, 0.95, 0.93),
    'emit': (1.0, 0.9, 0.7),
    'bulb': (1.0, 0.92, 0.75),
    'p_red': (0.7, 0.16, 0.12),
    'p_green': (0.25, 0.45, 0.32),
    'p_blue': (0.2, 0.32, 0.5),
    'p_yellow': (0.85, 0.65, 0.15),
    'p_cream': (0.92, 0.88, 0.76),
    'p_teal': (0.2, 0.5, 0.48),
    'p_orange': (0.85, 0.42, 0.15),
    'p_black': (0.1, 0.1, 0.11),
    'enamel': (0.95, 0.94, 0.9),
    'brass': (0.75, 0.58, 0.25),
    'cardboard': (0.66, 0.5, 0.32),
    'paper': (0.92, 0.9, 0.84),
    'canvas': (0.62, 0.58, 0.46),
    'rope': (0.7, 0.6, 0.42),
    'chalk': (0.16, 0.2, 0.18),
    'leaf': (0.25, 0.5, 0.2),
    'leaf_dark': (0.12, 0.3, 0.14),
    'pot': (0.7, 0.36, 0.22),
    'soil': (0.2, 0.14, 0.1),
    'water': (0.3, 0.45, 0.5),
    'dial': (1.0, 0.8, 0.45),
    'led': (1.0, 0.6, 0.1),
    'pegboard': (0.72, 0.58, 0.4),
    # white paint whose colour is all in the per-object tint: cans, labels, posters, toys in one draw
    'tinted': (0.92, 0.9, 0.86),
    'tinted_matte': (0.92, 0.9, 0.86),
    'galv': (0.7, 0.72, 0.72),
    'cloth': (0.75, 0.7, 0.6),
    'fire': (1.0, 0.5, 0.2),
    'lamp_out': (1.0, 0.92, 0.75),
    'shade_in': (0.95, 0.93, 0.88),
    'wainscot': (0.25, 0.36, 0.27),
}


# What the game draws each material with: its colour (sRGB hex, as a colour picker shows it) and its
# shading group. Materials of one group are merged into one mesh (one draw call) with the colour in a
# per-corner tint and the AO in the tint's alpha (src/game/modcar/garageLook.ts draws each group):
#   bld    the building, painted with brushwork, no ink      bld2  the same, both sides (thin tin sheets)
#   prop   things in it: cel tones, inked, a little sheen    shiny chrome, glazed ceramic, brass
#   prop2  thin things seen from both sides (leaves, cloth)  floor the slab (its own shader)
# Materials without a group keep their own mesh: glass, the skylight sheets, the lamps that switch.
LOOK = {
    'floor': (0x9c978d, 'floor'),
    'plinth': (0xa9a59b, 'bld'), 'timber': (0x74503a, 'bld'), 'boards': (0xa47a52, 'bld'), 'siding': (0x9b3d2e, 'bld'),
    'g_trim': (0xe8dec6, 'bld'), 'plaster': (0xe2d8c0, 'bld'), 'apron': (0xa6a298, 'bld'), 'wainscot': (0x86a08c, 'bld'),
    'tin_out': (0x6a6d70, 'bld2'), 'tin_in': (0xb9bcbc, 'bld2'),
    'steel': (0x7a7f86, 'prop'), 'alu': (0xb4b8bc, 'prop'), 'rubber': (0x2a2a2e, 'prop'), 'trim': (0x2a2b2e, 'prop'),
    'wood': (0xb08250, 'prop'), 'wood_dark': (0x6a4630, 'prop'), 'rust': (0x8a4a26, 'prop'), 'fabric': (0x7a5a44, 'prop'),
    'leather': (0x5a3424, 'prop'), 'p_red': (0xb93a2d, 'prop'), 'p_green': (0x4d7a5c, 'prop'), 'p_blue': (0x41678a, 'prop'),
    'p_yellow': (0xe0b03c, 'prop'), 'p_cream': (0xe9dfc6, 'prop'), 'p_teal': (0x3e8e87, 'prop'), 'p_orange': (0xd8742e, 'prop'),
    'p_black': (0x2a2a2e, 'prop'), 'cardboard': (0xb88c5c, 'prop'), 'paper': (0xefe9da, 'prop'), 'rope': (0xc4a474, 'prop'),
    'chalk': (0x2e3c36, 'prop'), 'pot': (0xbc6640, 'prop'), 'soil': (0x3c2c20, 'prop'), 'pegboard': (0xbc9a6c, 'prop'),
    'tinted_matte': (0xf4f1ea, 'prop'), 'galv': (0xb2b7b8, 'prop'), 'emit': (0xfff0d0, 'prop'),
    'chrome': (0xb2bac2, 'shiny'), 'ceramic': (0xf3f2ec, 'shiny'), 'brass': (0xc8a050, 'shiny'), 'tinted': (0xf4f1ea, 'prop'),
    'water': (0x4a6a70, 'shiny'),
    'enamel': (0xf3efe4, 'prop2'), 'canvas': (0xab9d7c, 'prop2'), 'leaf': (0x5c8e3a, 'prop2'), 'leaf_dark': (0x2f5c32, 'prop2'),
    'cloth': (0xc8bea8, 'prop2'),
    # (lit from within: their own meshes, the game switches them)
    'bulb': (0xfff1d6, 'bulb'), 'led': (0x6a4a20, 'led'), 'dial': (0x8a7a5a, 'dial'),
    'fire': (0x5a2a14, 'fire'), 'lamp_out': (0xfff1d6, 'lamp_out'), 'shade_in': (0xf3efe4, 'shade_in'),
}


# what light passes through (or that only glows): never in the shadow caster
NO_CAST = {'win_glass', 'glass', 'skylight', 'bulb', 'led', 'dial', 'water', 'leaf', 'leaf_dark', 'fire', 'lamp_out', 'shade_in'}


def srgb_to_linear(hex_rgb):
    out = []
    for sh in (16, 8, 0):
        c = ((hex_rgb >> sh) & 255) / 255.0
        out.append(c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4)
    return tuple(out)


# --------------------------------------------------------------------------------------------- matrices

def rot3(rot):
    """Rotation (3x3) from Euler angles in DEGREES about the game axes, applied x, then y, then z."""
    return Euler([math.radians(a) for a in rot], 'XYZ').to_matrix()


def mat4(loc=(0, 0, 0), rot=(0, 0, 0), scale=(1, 1, 1)):
    if isinstance(scale, (int, float)):
        scale = (scale, scale, scale)
    return Matrix.Translation(loc) @ rot3(rot).to_4x4() @ Matrix.Diagonal((*scale, 1.0))


def axis_to(axis):
    """Rotation taking +y (the axis of every cylinder here) to the given axis ('x', '-z', a vector...)."""
    if isinstance(axis, str):
        s = -1.0 if axis.startswith('-') else 1.0
        a = axis[-1]
        vec = V((s if a == 'x' else 0, s if a == 'y' else 0, s if a == 'z' else 0))
    else:
        vec = V(axis).normalized()
    return V((0, 1, 0)).rotation_difference(vec).to_matrix().to_4x4()


# game frame -> Blender frame (a proper rotation: windings stay as they are)
TO_BLENDER = Matrix(((1, 0, 0, 0), (0, 0, -1, 0), (0, 1, 0, 0), (0, 0, 0, 1)))


def to_blender(p):
    return V((p[0], -p[2], p[1]))


# --------------------------------------------------------------------------------------------- buckets

class Bucket:
    """All geometry of one material (of the static scene, or of one moving piece)."""

    def __init__(self, mat, key):
        self.mat = mat
        self.key = key
        self.bm = bmesh.new()
        self.tint = self.bm.loops.layers.float_color.new('Tint')
        self.count = 0


class Kit:
    def __init__(self, name):
        mc.reset_scene()
        self.name = name
        self.buckets = {}
        # moving pieces: name -> {'pivot': game point, 'buckets': {mat: Bucket}}
        self.movers = {}
        self.layout = {}
        self.rng = random.Random(1907)
        self.tmp = bpy.data.meshes.new('_tmp')
        self.objects = []
        # what casts the sun's shadow: the big things, without their bevels (one mesh, never drawn)
        self.shadow = bmesh.new()
        self.tris = 0
        self.t0 = time.time()
        self.stats = {}

    # ------------------------------------------------------------------ where geometry goes

    def _bucket(self, mat, mover=None):
        if mat not in MATS:
            raise ValueError(f'unknown material {mat!r}')
        if mover:
            m = self.movers.setdefault(mover, {'pivot': (0, 0, 0), 'buckets': {}})
            b = m['buckets'].get(mat)
            if b is None:
                b = m['buckets'][mat] = Bucket(mat, f'{mover}:{mat}')
            return b
        b = self.buckets.get(mat)
        if b is None:
            b = self.buckets[mat] = Bucket(mat, mat)
        return b

    def mover(self, name, pivot):
        """Declare a moving piece; its geometry is modelled in place (game frame), its origin will be the pivot."""
        self.movers.setdefault(name, {'pivot': (0, 0, 0), 'buckets': {}})['pivot'] = tuple(pivot)

    def _pour(self, bm, mat, tint=1.0, mover=None, faces_mat=None):
        """
        Move a finished primitive (its own bmesh, game frame) into its bucket(s). tint: a grey or an
        (r, g, b) multiplier painted on every corner. faces_mat(face) -> material name for that face
        (None = the primitive's own) lets one primitive wear two materials (a board: siding outside).
        """
        if isinstance(tint, (int, float)):
            tint = (tint, tint, tint)
        groups = {}
        if faces_mat is None:
            groups[mat] = None
        else:
            bm.faces.index_update()
            for f in bm.faces:
                m = faces_mat(f) or mat
                groups.setdefault(m, []).append(f.index)
        for m, idx in groups.items():
            b = self._bucket(m, mover)
            src = bm
            if idx is not None:
                src = bm.copy()
                src.faces.index_update()
                keep = set(idx)
                dead = [f for f in src.faces if f.index not in keep]
                bmesh.ops.delete(src, geom=dead, context='FACES')
            lay = src.loops.layers.float_color.get('Tint') or src.loops.layers.float_color.new('Tint')
            for f in src.faces:
                for l in f.loops:
                    l[lay] = (tint[0], tint[1], tint[2], 1.0)
            src.to_mesh(self.tmp)
            b.bm.from_mesh(self.tmp)
            b.count += 1
            if src is not bm:
                src.free()
        bm.free()

    # ------------------------------------------------------------------ the shadow caster

    def _cast(self, mat, bm, matrix=None, cast=None, mover=None):
        """
        Copy a primitive (before it is bevelled) into the shadow caster: cast=True always, False never,
        None when it is big enough to matter (over 0.45 m). Moving pieces cast through their own meshes.
        """
        if cast is False or mover or mat in NO_CAST:
            return
        c = bm.copy()
        if matrix is not None:
            bmesh.ops.transform(c, matrix=matrix, verts=c.verts[:])
        if cast is None:
            if not c.verts:
                c.free()
                return
            lo = [min(v.co[i] for v in c.verts) for i in range(3)]
            hi = [max(v.co[i] for v in c.verts) for i in range(3)]
            if max(hi[i] - lo[i] for i in range(3)) < 0.45:
                c.free()
                return
        c.to_mesh(self.tmp)
        self.shadow.from_mesh(self.tmp)
        c.free()

    # ------------------------------------------------------------------ finishing a primitive

    @staticmethod
    def _bevel(bm, width, segs=1, angle=30.0):
        if width <= 0:
            return
        lim = math.radians(angle)
        edges = [e for e in bm.edges if len(e.link_faces) == 2 and e.calc_face_angle(0.0) > lim]
        if not edges:
            return
        bmesh.ops.bevel(bm, geom=edges, offset=width, offset_type='OFFSET', segments=segs, profile=0.5,
                        affect='EDGES', clamp_overlap=True)

    @staticmethod
    def _shade(bm, smooth, sharp=40.0):
        lim = math.radians(sharp)
        for f in bm.faces:
            f.smooth = smooth
        if smooth:
            for e in bm.edges:
                e.smooth = not (len(e.link_faces) == 2 and e.calc_face_angle(0.0) > lim)

    # ------------------------------------------------------------------ primitives (game frame)

    def box(self, mat, center, size, rot=(0, 0, 0), bev=0.0, bsegs=1, seg=None, tint=1.0, mover=None,
            faces_mat=None, open=None, matrix=None, taper=None, cast=None):
        """
        An upright box. seg = longest edge length before it is cut (vertex AO needs vertices on big
        faces; default: none). open: faces to leave out ('-y', '+x-z', local axes). taper = (sx, sz)
        scales the top face. faces_mat(normal_local) -> material for a face.
        """
        bm = bmesh.new()
        sx, sy, sz = size
        res = bmesh.ops.create_cube(bm, size=1.0)
        for v in res['verts']:
            v.co = V((v.co.x * sx, v.co.y * sy, v.co.z * sz))
            if taper and v.co.y > 0:
                v.co.x *= taper[0]
                v.co.z *= taper[1]
        self._cast(mat, bm, matrix if matrix is not None else mat4(center, rot), cast, mover)
        if seg:
            cuts = [max(0, int(math.ceil(d / seg)) - 1) for d in (sx, sy, sz)]
            for axis, n in enumerate(cuts):
                if n <= 0:
                    continue
                d = (sx, sy, sz)[axis]
                for k in range(1, n + 1):
                    co = -d / 2 + d * k / (n + 1)
                    plane_no = V((1 if axis == 0 else 0, 1 if axis == 1 else 0, 1 if axis == 2 else 0))
                    geom = bm.verts[:] + bm.edges[:] + bm.faces[:]
                    bmesh.ops.bisect_plane(bm, geom=geom, dist=1e-6, plane_co=plane_no * co, plane_no=plane_no)
        if open:
            dead = []
            for f in bm.faces:
                n = f.normal
                for i, ax in enumerate('xyz'):
                    for sg in ('-', '+'):
                        if sg + ax in open and abs(n[i]) > 0.9 and (n[i] > 0) == (sg == '+'):
                            dead.append(f)
            bmesh.ops.delete(bm, geom=list(set(dead)), context='FACES_ONLY')
        self._bevel(bm, bev, bsegs)
        self._shade(bm, False)
        fm = None
        if faces_mat:
            bm.normal_update()
            bm.faces.index_update()
            normals = {f.index: f.normal.copy() for f in bm.faces}
            fm = lambda f: faces_mat(normals[f.index])
        m = matrix if matrix is not None else mat4(center, rot)
        bmesh.ops.transform(bm, matrix=m, verts=bm.verts[:])
        self._pour(bm, mat, tint, mover, fm)

    def cyl(self, mat, center, r, h, axis='y', rot=None, segs=16, r2=None, bev=0.0, bsegs=1, tint=1.0, mover=None,
            caps=True, smooth=True, matrix=None, rings=0, cast=None):
        """A cylinder (or a cone with r2) along `axis`, centred on `center`."""
        bm = bmesh.new()
        res = bmesh.ops.create_cone(bm, cap_ends=caps, cap_tris=False, segments=segs, radius1=r,
                                    radius2=r if r2 is None else r2, depth=h)
        # create_cone builds along z: stand it on y
        bmesh.ops.transform(bm, matrix=Matrix.Rotation(-math.pi / 2, 4, 'X'), verts=bm.verts[:])
        if rings:
            for k in range(1, rings + 1):
                co = -h / 2 + h * k / (rings + 1)
                geom = bm.verts[:] + bm.edges[:] + bm.faces[:]
                bmesh.ops.bisect_plane(bm, geom=geom, dist=1e-6, plane_co=V((0, co, 0)), plane_no=V((0, 1, 0)))
        if matrix is None:
            orient = mat4(rot=rot) if rot is not None else axis_to(axis)
            matrix = Matrix.Translation(center) @ orient
        self._cast(mat, bm, matrix, cast, mover)
        self._bevel(bm, bev, bsegs, angle=50.0)
        self._shade(bm, smooth, sharp=50.0)
        bmesh.ops.transform(bm, matrix=matrix, verts=bm.verts[:])
        self._pour(bm, mat, tint, mover)

    def lathe(self, mat, center, profile, segs=24, axis='y', rot=None, tint=1.0, mover=None, smooth=True,
              sharp=45.0, close=False, matrix=None, angle=TAU, start=0.0, face=None, cast=None):
        """
        Surface of revolution about the local y axis: profile = [(r, y), ...]; r = 0 makes a pole.
        face = 'out' / 'in' turns every face away from / towards the axis (open shells: a lamp shade).
        """
        bm = bmesh.new()
        full = abs(angle - TAU) < 1e-6
        n = segs if full else segs + 1
        rings = []
        for (r, y) in profile:
            if r <= 1e-7:
                rings.append([bm.verts.new((0.0, y, 0.0))])
                continue
            rings.append([bm.verts.new((r * math.cos(start + angle * i / segs), y, -r * math.sin(start + angle * i / segs)))
                          for i in range(n)])
        for ka in range(len(rings) - 1):
            A, B = rings[ka], rings[ka + 1]
            for i in range(segs):
                i2 = (i + 1) % n if full else i + 1
                if len(A) == 1 and len(B) == 1:
                    continue
                if len(A) == 1:
                    f = (A[0], B[i], B[i2])
                elif len(B) == 1:
                    f = (A[i], B[0], A[i2])
                else:
                    f = (A[i], B[i], B[i2], A[i2])
                try:
                    bm.faces.new(f)
                except ValueError:
                    pass
        if close and full:
            if len(rings[0]) > 2:
                bm.faces.new(rings[0])
            if len(rings[-1]) > 2:
                bm.faces.new(list(reversed(rings[-1])))
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
        if face:
            bm.normal_update()
            for f in bm.faces:
                c = f.calc_center_median()
                radial = V((c.x, 0.0, c.z))
                if radial.length < 1e-6:
                    continue
                away = f.normal.dot(radial) > 0
                if (face == 'out') != away:
                    f.normal_flip()
        self._shade(bm, smooth, sharp)
        if matrix is None:
            orient = mat4(rot=rot) if rot is not None else axis_to(axis)
            matrix = Matrix.Translation(center) @ orient
        bmesh.ops.transform(bm, matrix=matrix, verts=bm.verts[:])
        self._cast(mat, bm, None, cast, mover)
        self._pour(bm, mat, tint, mover)

    def tube(self, mat, pts, r, segs=8, tint=1.0, mover=None, caps=True, bend=0.0, radius_fn=None, cast=None):
        """A round tube along a polyline (rotation-minimising frames); bend rounds its corners (m)."""
        pts = [V(p) for p in pts]
        if bend > 0:
            pts = fillet(pts, bend)
        bm = bmesh.new()
        n = len(pts)
        tang = []
        for i in range(n):
            if i == 0:
                t = pts[1] - pts[0]
            elif i == n - 1:
                t = pts[-1] - pts[-2]
            else:
                t = (pts[i + 1] - pts[i]).normalized() + (pts[i] - pts[i - 1]).normalized()
            tang.append(t.normalized())
        ref = V((0, 1, 0)) if abs(tang[0].y) < 0.9 else V((1, 0, 0))
        nrm = (ref - tang[0] * ref.dot(tang[0])).normalized()
        rings = []
        total = sum((pts[i] - pts[i - 1]).length for i in range(1, n)) or 1.0
        acc = 0.0
        for i in range(n):
            if i > 0:
                q = tang[i - 1].rotation_difference(tang[i])
                nrm = q @ nrm
                nrm = (nrm - tang[i] * nrm.dot(tang[i])).normalized()
                acc += (pts[i] - pts[i - 1]).length
            bn = tang[i].cross(nrm)
            rr = r * (radius_fn(acc / total) if radius_fn else 1.0)
            rings.append([bm.verts.new(pts[i] + (nrm * math.cos(TAU * j / segs) + bn * math.sin(TAU * j / segs)) * rr)
                          for j in range(segs)])
        for i in range(n - 1):
            A, B = rings[i], rings[i + 1]
            for j in range(segs):
                j2 = (j + 1) % segs
                bm.faces.new((A[j], A[j2], B[j2], B[j]))
        if caps:
            bm.faces.new(list(reversed(rings[0])))
            bm.faces.new(rings[-1])
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
        self._shade(bm, True, sharp=60.0)
        # (thin tubes, a cable, a handle: no shadow worth its triangles unless asked)
        self._cast(mat, bm, None, cast if cast is not None else (r > 0.03 and None), mover)
        self._pour(bm, mat, tint, mover)

    def prism(self, mat, poly, depth, matrix, bev=0.0, tint=1.0, mover=None, smooth=False, cast=None):
        """A 2D polygon [(u, v), ...] (counter-clockwise) extruded along local z by depth (centred), placed by matrix."""
        bm = bmesh.new()
        bot = [bm.verts.new((u, v, -depth / 2)) for (u, v) in poly]
        top = [bm.verts.new((u, v, depth / 2)) for (u, v) in poly]
        bm.faces.new(list(reversed(bot)))
        bm.faces.new(top)
        k = len(poly)
        for i in range(k):
            j = (i + 1) % k
            bm.faces.new((bot[i], bot[j], top[j], top[i]))
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
        self._cast(mat, bm, matrix, cast, mover)
        self._bevel(bm, bev)
        self._shade(bm, smooth)
        bmesh.ops.transform(bm, matrix=matrix, verts=bm.verts[:])
        self._pour(bm, mat, tint, mover)

    def grid(self, mat, center, size, step, normal='y', tint=1.0, mover=None, height=None):
        """A flat grid (one-sided, facing +normal) of size (a, b) cut every `step` m; height(x, z) lifts verts."""
        a, b = size
        na = max(1, int(round(a / step)))
        nb = max(1, int(round(b / step)))
        bm = bmesh.new()
        rows = []
        for j in range(nb + 1):
            row = []
            for i in range(na + 1):
                u = -a / 2 + a * i / na
                w = -b / 2 + b * j / nb
                row.append(bm.verts.new((u, 0.0, w)))
            rows.append(row)
        for j in range(nb):
            for i in range(na):
                bm.faces.new((rows[j][i], rows[j + 1][i], rows[j + 1][i + 1], rows[j][i + 1]))
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
        for f in bm.faces:
            if f.normal.y < 0:
                f.normal_flip()
        if normal != 'y':
            bmesh.ops.transform(bm, matrix=axis_to(normal), verts=bm.verts[:])
        bmesh.ops.transform(bm, matrix=Matrix.Translation(center), verts=bm.verts[:])
        if height:
            for v in bm.verts:
                v.co.y += height(v.co.x, v.co.z)
        self._shade(bm, False)
        self._pour(bm, mat, tint, mover)

    def mesh(self, mat, bm, tint=1.0, mover=None, smooth=False, sharp=40.0, bev=0.0, cast=None):
        """Any bmesh already in the game frame."""
        self._cast(mat, bm, None, cast, mover)
        self._bevel(bm, bev)
        self._shade(bm, smooth, sharp)
        self._pour(bm, mat, tint, mover)

    # ------------------------------------------------------------------ helpers

    def jitter(self, a):
        return (self.rng.random() * 2 - 1) * a

    def pick(self, seq):
        return seq[self.rng.randrange(len(seq))]

    # ------------------------------------------------------------------ finishing

    def _objects(self):
        """
        One Blender object per shading group (static: S_<group>, moving: <mover>|<group>); each bucket's
        corners are tinted with its material's colour first, so the group's mesh carries every colour.
        """
        groups = {}
        for mover, buckets in [(None, self.buckets)] + [(n, m['buckets']) for n, m in self.movers.items()]:
            for b in buckets.values():
                hex_rgb, grp = LOOK.get(b.mat, (None, None))
                if grp is None:
                    grp = b.mat
                if hex_rgb is not None:
                    cr, cg, cb = srgb_to_linear(hex_rgb)
                    lay = b.tint
                    for f in b.bm.faces:
                        for l in f.loops:
                            t = l[lay]
                            l[lay] = (t[0] * cr, t[1] * cg, t[2] * cb, 1.0)
                groups.setdefault((mover, grp), []).append(b)
        objs = []
        for (mover, grp), buckets in groups.items():
            oname = f'{mover}|{grp}' if mover else f'S_{grp}'
            bm = bmesh.new()
            bm.loops.layers.float_color.new('Tint')
            for b in buckets:
                b.bm.to_mesh(self.tmp)
                bm.from_mesh(self.tmp)
                b.bm.free()
            pivot = self.movers[mover]['pivot'] if mover else (0, 0, 0)
            bmesh.ops.transform(bm, matrix=Matrix.Translation((-pivot[0], -pivot[1], -pivot[2])), verts=bm.verts[:])
            bmesh.ops.transform(bm, matrix=TO_BLENDER, verts=bm.verts[:])
            me = bpy.data.meshes.new(oname)
            bm.to_mesh(me)
            bm.free()
            obj = bpy.data.objects.new(oname, me)
            bpy.context.scene.collection.objects.link(obj)
            obj.data.materials.append(gmat(grp))
            obj.location = to_blender(pivot)
            obj['mat'] = grp
            if mover:
                obj['mover'] = mover
            objs.append(obj)
        if self.shadow.verts:
            bmesh.ops.remove_doubles(self.shadow, verts=self.shadow.verts[:], dist=1e-5)
            bmesh.ops.transform(self.shadow, matrix=TO_BLENDER, verts=self.shadow.verts[:])
            me = bpy.data.meshes.new('S_shadow')
            self.shadow.to_mesh(me)
            self.shadow.free()
            for p in me.polygons:
                p.use_smooth = False
            obj = bpy.data.objects.new('S_shadow', me)
            bpy.context.scene.collection.objects.link(obj)
            obj.data.materials.append(gmat('shadow'))
            obj['mat'] = 'shadow'
            objs.append(obj)
        return objs

    def finish(self, ao=True, ao_samples=24, ao_distance=0.9, no_ao=()):
        objs = self._objects()
        self.objects = objs
        self.tris = mc.triangles(objs)
        for o in objs:
            self.stats[o.name] = mc.triangles([o])
        bake = [o for o in objs if o['mat'] not in no_ao] if ao else []
        if bake:
            bake_ao(bake, ao_samples, ao_distance)
        for o in objs:
            tint_and_ao(o)
        print(f'GARAGE {self.name}: {len(objs)} objects, {self.tris} tris ({time.time() - self.t0:.1f}s)')

    def export(self, path):
        mc.export_glb(path, self.objects)
        print(f'GARAGE wrote {path}')

    def write_layout(self, path):
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, 'w', encoding='utf-8') as f:
            json.dump(self.layout, f, indent=1, ensure_ascii=False)
            f.write('\n')
        print(f'GARAGE wrote {path}')

    def report(self, top=25):
        rows = sorted(((t, n) for n, t in self.stats.items()), reverse=True)
        for t, n in rows[:top]:
            print(f'  STAT {t:7d}  {n}')


# --------------------------------------------------------------------------------------------- finishing

def gmat(name):
    m = bpy.data.materials.get(name)
    if m is None:
        m = bpy.data.materials.new(name)
        col = MATS.get(name, (0.6, 0.6, 0.6))
        bsdf = m.node_tree.nodes.get('Principled BSDF') if m.node_tree else None
        if bsdf is not None:
            bsdf.inputs['Base Color'].default_value = (*col, 1.0)
            bsdf.inputs['Roughness'].default_value = 0.6
        m.diffuse_color = (*col, 1.0)
    return m


def bake_ao(objs, samples, distance, big=2.6, rays=14, big_rays=8, inset=0.45):
    """
    Ambient occlusion into a float colour attribute 'Col' (one value per face corner), cast with a BVH
    from a point a fifth of the way from each corner towards its face's middle and a hair off the
    face: Cycles' vertex bake samples at the corner itself, which is under the next board, inside the
    batten, against the floor — black. Two scales: contact shadow within `distance`, and a broad
    darkening within `big` (corners of the room, under the bench), mixed 70 / 30.
    """
    from mathutils.bvhtree import BVHTree
    meshes = [o for o in objs if o.type == 'MESH' and len(o.data.polygons)]
    if not meshes:
        return
    t0 = time.time()
    verts = []
    polys = []
    for o in meshes:
        mw = o.matrix_world
        base = len(verts)
        verts.extend(mw @ v.co for v in o.data.vertices)
        polys.extend([base + i for i in p.vertices] for p in o.data.polygons)
    tree = BVHTree.FromPolygons(verts, polys, epsilon=0.0)
    # cosine-weighted directions about +Z (a Fibonacci spiral on the disc, lifted to the hemisphere)
    def hemi(n):
        out = []
        ga = math.pi * (3 - math.sqrt(5))
        for i in range(n):
            r = math.sqrt((i + 0.5) / n)
            a = i * ga
            x, y = r * math.cos(a), r * math.sin(a)
            out.append(V((x, y, math.sqrt(max(0.0, 1 - x * x - y * y)))))
        return out
    near = hemi(rays)
    far = hemi(big_rays)
    rng = random.Random(77)
    nrays = 0
    for o in meshes:
        me = o.data
        mw = o.matrix_world
        m3 = mw.to_3x3()
        attr = me.color_attributes.get('AOx') or me.color_attributes.new('AOx', 'FLOAT_COLOR', 'CORNER')
        vals = [1.0] * (len(me.loops) * 4)
        co = [mw @ v.co for v in me.vertices]
        for p in me.polygons:
            n = (m3 @ p.normal).normalized()
            if n.length < 0.5:
                continue
            c = mw @ p.center
            t = n.orthogonal().normalized()
            b = n.cross(t)
            for li in p.loop_indices:
                v = co[me.loops[li].vertex_index]
                pt = v + (c - v) * inset + n * 0.004
                rot = rng.random() * TAU
                cr, sr = math.cos(rot), math.sin(rot)
                occ = 0.0
                for d in near:
                    dx = d.x * cr - d.y * sr
                    dy = d.x * sr + d.y * cr
                    dd = t * dx + b * dy + n * d.z
                    hit = tree.ray_cast(pt, dd, distance)
                    if hit[0] is not None:
                        f = hit[3] / distance
                        occ += 1.0 - f * f
                occ_far = 0.0
                for d in far:
                    dx = d.x * cr - d.y * sr
                    dy = d.x * sr + d.y * cr
                    dd = t * dx + b * dy + n * d.z
                    hit = tree.ray_cast(pt + dd * 0.05, dd, big)
                    if hit[0] is not None:
                        f = hit[3] / big
                        occ_far += 1.0 - f
                nrays += len(near) + len(far)
                a_near = 1.0 - occ / len(near)
                a_far = 1.0 - occ_far / len(far)
                ao = max(0.0, min(1.0, a_near * (0.7 + 0.3 * a_far)))
                vals[li * 4] = vals[li * 4 + 1] = vals[li * 4 + 2] = ao
        attr.data.foreach_set('color', vals)
    print(f'GARAGE AO: {nrays} rays on {len(meshes)} objects in {time.time() - t0:.1f}s')


def bake_ao_cycles(objs, samples, distance):
    """(the Cycles vertex bake, kept for comparison: it samples at the corners themselves)"""
    meshes = [o for o in objs if o.type == 'MESH' and len(o.data.polygons)]
    if not meshes:
        return
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    scene.cycles.device = 'CPU'
    scene.cycles.samples = samples
    scene.world = scene.world or bpy.data.worlds.new('World')
    scene.world.light_settings.distance = distance
    for o in meshes:
        me = o.data
        attr = me.color_attributes.get('Col') or me.color_attributes.new('Col', 'FLOAT_COLOR', 'CORNER')
        me.color_attributes.active_color = attr
        me.attributes.render_color_index = me.color_attributes.find('Col')
    bpy.ops.object.select_all(action='DESELECT')
    for o in meshes:
        o.select_set(True)
    bpy.context.view_layer.objects.active = meshes[0]
    t0 = time.time()
    bpy.ops.object.bake(type='AO', target='VERTEX_COLORS')
    print(f'GARAGE baked AO on {len(meshes)} objects in {time.time() - t0:.1f}s')


def tint_and_ao(o):
    """The exported colour 'Col': the tint (the material's colour x the piece's variation) in rgb, AO in alpha."""
    me = o.data
    tint = me.color_attributes.get('Tint')
    aox = me.color_attributes.get('AOx')
    n = len(me.loops)
    t = [1.0] * (n * 4)
    if tint is not None:
        tint.data.foreach_get('color', t)
    a = None
    if aox is not None:
        a = [1.0] * (n * 4)
        aox.data.foreach_get('color', a)
    for i in range(n):
        t[i * 4 + 3] = a[i * 4] if a is not None else 1.0
    for name in ('Tint', 'AOx'):
        at = me.color_attributes.get(name)
        if at is not None:
            me.color_attributes.remove(at)
    col = me.color_attributes.get('Col') or me.color_attributes.new('Col', 'FLOAT_COLOR', 'CORNER')
    col.data.foreach_set('color', t)
    me.color_attributes.active_color = col


def apply_tint(o):
    """Col (AO) × Tint, per corner; the Tint attribute is dropped."""
    me = o.data
    col = me.color_attributes.get('Col')
    tint = me.color_attributes.get('Tint')
    if col is None:
        return
    if tint is not None:
        n = len(col.data)
        a = [0.0] * (n * 4)
        b = [0.0] * (n * 4)
        col.data.foreach_get('color', a)
        tint.data.foreach_get('color', b)
        for i in range(0, n * 4, 4):
            a[i] *= b[i]
            a[i + 1] *= b[i + 1]
            a[i + 2] *= b[i + 2]
        col.data.foreach_set('color', a)
        me.color_attributes.remove(tint)


def tint_only(o):
    """No AO: the tint becomes the colour."""
    me = o.data
    tint = me.color_attributes.get('Tint')
    if tint is None:
        return
    col = me.color_attributes.get('Col') or me.color_attributes.new('Col', 'FLOAT_COLOR', 'CORNER')
    n = len(col.data)
    b = [0.0] * (n * 4)
    tint.data.foreach_get('color', b)
    col.data.foreach_set('color', b)
    me.color_attributes.remove(tint)


def fillet(pts, bend):
    """Round the corners of a polyline (quadratic arcs of about radius `bend`)."""
    pts = [V(p) for p in pts]
    if len(pts) < 3:
        return pts
    out = [pts[0]]
    for i in range(1, len(pts) - 1):
        p0, p1, p2 = pts[i - 1], pts[i], pts[i + 1]
        d1 = p1 - p0
        d2 = p2 - p1
        l1, l2 = d1.length, d2.length
        if l1 < 1e-6 or l2 < 1e-6:
            continue
        d1 /= l1
        d2 /= l2
        th = math.acos(max(-1.0, min(1.0, d1.dot(d2))))
        if th < 1e-3:
            out.append(p1)
            continue
        t = min(bend * math.tan(th / 2), l1 * 0.5, l2 * 0.5)
        a = p1 - d1 * t
        b = p1 + d2 * t
        k = max(2, int(math.degrees(th) / 12) + 1)
        for j in range(k + 1):
            u = j / k
            out.append(a * (1 - u) ** 2 + p1 * 2 * u * (1 - u) + b * u * u)
    out.append(pts[-1])
    return out


# --------------------------------------------------------------------------------------------- previews

def preview(path, eye, target, lens=24.0, size=(1280, 720), sun=(0.7, 0.6, 0.37), samples=32):
    """An EEVEE look at the scene from a game-frame eye towards a game-frame target (for the modeller only)."""
    scene = bpy.context.scene
    scene.render.engine = 'BLENDER_EEVEE'
    scene.render.resolution_x, scene.render.resolution_y = size
    try:
        scene.eevee.taa_render_samples = samples
        scene.eevee.use_shadows = True
        scene.eevee.use_raytracing = True
    except Exception:
        pass
    w = scene.world or bpy.data.worlds.new('World')
    scene.world = w
    w.use_nodes = True
    bg = w.node_tree.nodes.get('Background')
    if bg:
        bg.inputs['Color'].default_value = (0.55, 0.7, 0.9, 1)
        bg.inputs['Strength'].default_value = 0.8
    for m in bpy.data.materials:
        if not m.node_tree:
            continue
        b = m.node_tree.nodes.get('Principled BSDF')
        if b is None:
            continue
        at = m.node_tree.nodes.new('ShaderNodeVertexColor')
        at.layer_name = 'Col'
        mul = m.node_tree.nodes.new('ShaderNodeMix')
        mul.data_type = 'RGBA'
        mul.blend_type = 'MULTIPLY'
        mul.inputs[0].default_value = 1.0
        mul.inputs[6].default_value = b.inputs['Base Color'].default_value
        m.node_tree.links.new(at.outputs['Color'], mul.inputs[7])
        m.node_tree.links.new(mul.outputs[2], b.inputs['Base Color'])
    sl = bpy.data.lights.new('sun', 'SUN')
    sl.energy = 4.0
    so = bpy.data.objects.new('sun', sl)
    scene.collection.objects.link(so)
    d = to_blender(V(sun).normalized())
    so.rotation_euler = d.to_track_quat('Z', 'Y').to_euler()
    cd = bpy.data.cameras.new('cam')
    cd.lens = lens
    cam = bpy.data.objects.new('cam', cd)
    scene.collection.objects.link(cam)
    cam.location = to_blender(eye)
    cam.rotation_euler = (to_blender(target) - to_blender(eye)).to_track_quat('-Z', 'Y').to_euler()
    scene.camera = cam
    os.makedirs(os.path.dirname(path), exist_ok=True)
    scene.render.filepath = path
    bpy.ops.render.render(write_still=True)
