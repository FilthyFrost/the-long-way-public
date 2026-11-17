"""
The garage tools as models (they replace the box stand-ins of src/game/modcar/loose.ts toolModel()):

    blender -b --factory-startup --python tools/blender/build.py -- parts/tools [<kind>|all] [--norender]

Writes public/models/modcar/tools/<kind>.glb (not parts_geo.json): root mesh PART, origin at the bottom
centre, x forward, the game's toolModel orientation (jerrycan and oil jug: broad faces towards +-X, spout on
the right = game +z), conventional material names only, AO in 'Col', <= 2000 triangles each. The look
colours `paint` (a petrol can red, a diesel can green), so one jerrycan serves every fuel.
"""
import math

import bmesh
from mathutils import Matrix, Vector

from parts import _kit as K
from parts._kit import V, mat4

OUT = 'public/models/modcar/tools'


# ------------------------------------------------------------------------------------------------ jerrycan

def jerrycan(P):
    """
    A 20 L jerrycan: two pressed halves welded round the edge (the seam bead), the X stiffeners on both broad
    faces, three carrying handles across the top, the spout at the right-hand end with its cam-lever cap.
    """
    P.ao_distance = 0.05
    body = 'paint'
    T, Wd, Hb = 0.165, 0.34, 0.43     # thickness (x), width (y), body height (z)
    zb = 0.004                        # the seam bead runs under the bottom
    zc = zb + Hb / 2
    P.box('body', (T, Wd, Hb), (0, 0, zc), body, bev=0.02, segs=3)
    # the weld seam all round the edge, in the plane x = 0
    path = [(0.0, y, z + zc) for (y, z) in K.rounded_rect(Wd + 0.001, Hb + 0.001, 0.02, seg=3)]
    P.tube('seam', path, 0.004, body, segs=6, closed=True)
    # the X stiffeners pressed into both broad faces
    dy, dz = Wd * 0.72, Hb * 0.76
    ang = math.degrees(math.atan2(dz, dy))
    ln = math.hypot(dy, dz)
    for sx in (-1, 1):
        for sg in (-1, 1):
            P.box('x_rib', (0.006, ln, 0.026), (sx * (T / 2 + 0.001), 0, zc), body, rot=(sg * ang, 0, 0), bev=0.0025,
                  segs=1)
        P.box('x_hub', (0.0075, 0.05, 0.05), (sx * (T / 2 + 0.0015), 0, zc), body, rot=(45, 0, 0), bev=0.004, segs=1)
    # three handles across the top (one carries it, two people can share two cans)
    zt = zb + Hb
    for y in (-0.05, 0.02, 0.09):
        P.tube('handle', [(-0.05, y, zt - 0.004), (-0.044, y, zt + 0.036), (0.044, y, zt + 0.036), (0.05, y, zt - 0.004)],
               0.0085, body, segs=7, bend=0.014)
    # the spout: base flange, neck, the cap with its cam lever and hinge
    ys = -0.118
    P.cyl('spout_base', 0.03, 0.008, (0, ys, zt + 0.002), 'steel', segs=16, bev=0.002, bsegs=1)
    P.cyl('spout_neck', 0.021, 0.022, (0, ys, zt + 0.016), 'steel', segs=16, bev=None)
    P.lathe('spout_cap', [(0.0, 0.016), (0.02, 0.015), (0.027, 0.009), (0.028, 0.0), (0.022, 0.0)][::-1],
            loc=(0, ys, zt + 0.026), material='steel', segs=16, close='start', sharp=40.0)
    P.box('cap_hinge', (0.016, 0.012, 0.012), (0, ys - 0.03, zt + 0.032), 'steel', bev=0.002, segs=1)
    P.box('cap_lever', (0.014, 0.062, 0.006), (0, ys - 0.004, zt + 0.045), 'steel', rot=(-4, 0, 0), bev=0.002,
          segs=1)
    P.views = [('a', 35, 16), ('b', 215, 16)]


# ------------------------------------------------------------------------------------------------ bottle

def bottle(P):
    """A 5 L glass water bottle: moulded grip rings, rounded shoulder, a ribbed screw cap and a clip-on
    carrying handle on the neck (trim)."""
    P.ao_distance = 0.04
    R = 0.1
    prof = [(0.0, 0.012), (0.055, 0.007), (0.085, 0.0), (0.096, 0.004), (R, 0.018),
            (R, 0.08), (R - 0.004, 0.086), (R - 0.004, 0.094), (R, 0.1),
            (R, 0.15), (R - 0.004, 0.156), (R - 0.004, 0.164), (R, 0.17),
            (R, 0.205), (0.096, 0.232), (0.082, 0.258), (0.062, 0.28), (0.044, 0.296), (0.035, 0.306),
            (0.033, 0.316), (0.033, 0.334)]
    P.lathe('glass', prof, material='glass', segs=28, close='end', sharp=50.0)
    # screw cap with grip ribs
    P.lathe('cap', [(0.0, 0.37), (0.031, 0.37), (0.0375, 0.366), (0.0375, 0.336), (0.035, 0.332)][::-1],
            material='trim', segs=24, close='start', sharp=50.0)
    bm = bmesh.new()
    for i in range(16):
        a = math.tau * i / 16
        K.bm_cube(bm, (0.004, 0.0035, 0.026), mat4((0.0385 * math.cos(a), 0.0385 * math.sin(a), 0.351),
                                                   (0, 0, math.degrees(a))))
    P.mesh('cap_ribs', bm, 'trim', sharp=50)
    # the handle: a ring clipped round the neck, a loop down to the shoulder
    P.torus('handle_ring', 0.036, 0.0045, loc=(0, 0, 0.312), segs=18, rsegs=6, material='trim')
    P.tube('handle', [(-0.036, 0.0, 0.312), (-0.062, 0.0, 0.318), (-0.098, 0.0, 0.29), (-0.104, 0.0, 0.244),
                      (-0.098, 0.0, 0.222)], 0.0065, 'trim', segs=8, bend=0.02)
    P.views = [('a', 35, 16), ('b', 215, 16)]


# ------------------------------------------------------------------------------------------------ oil jug

def oilcan(P):
    """A 4 L motor-oil jug: a rounded block with raised label panels, the integrated carrying handle at the
    back of the top, the neck at the front with a ribbed cap and its pull-out spout (trim)."""
    P.ao_distance = 0.035
    T, Wd, Hb = 0.1, 0.2, 0.235
    bm = bmesh.new()
    K.bm_cube(bm, (T, Wd, Hb), mat4((0, 0, Hb / 2)))
    for v in bm.verts:
        if v.co.z > Hb * 0.7:
            v.co.x *= 0.94
            v.co.y *= 0.97
    P.mesh('body', bm, 'paint', bev=0.014, segs=3)
    for sx in (-1, 1):
        P.box('label', (0.004, Wd * 0.72, Hb * 0.52), (sx * (T / 2 + 0.001), 0, Hb * 0.44), 'paint', bev=0.002,
              segs=1)
    # the handle: a thick hollow loop moulded over the left of the top
    P.tube('handle', [(0, 0.022, Hb - 0.012), (0, 0.032, Hb + 0.042), (0, 0.084, Hb + 0.042), (0, 0.094, Hb - 0.012)],
           0.0125, 'paint', segs=10, bend=0.018)
    # neck, cap and spout on the right (game +z)
    yn = -0.05
    P.cyl('neck', 0.0195, 0.024, (0, yn, Hb + 0.009), 'paint', segs=16, bev=0.002, bsegs=1)
    P.lathe('cap', [(0.0, 0.026), (0.016, 0.026), (0.0235, 0.022), (0.0235, 0.0), (0.021, -0.002)][::-1],
            loc=(0, yn, Hb + 0.02), material='trim', segs=18, close='start', sharp=50.0)
    bm = bmesh.new()
    for i in range(12):
        a = math.tau * i / 12
        K.bm_cube(bm, (0.0035, 0.003, 0.018), mat4((0.024 * math.cos(a), yn + 0.024 * math.sin(a), Hb + 0.031),
                                                   (0, 0, math.degrees(a))))
    P.mesh('cap_ribs', bm, 'trim', sharp=50)
    P.cyl('spout', 0.008, 0.02, (0, yn, Hb + 0.054), 'trim', segs=10, r2=0.006, bev=None)
    P.views = [('a', 35, 18), ('b', 215, 18)]


# ------------------------------------------------------------------------------------------------ spray can

def _spray(P, r, shoulder, stripes):
    """An aerosol paint can (src/core/modcar/paint.ts SPRAY_TIERS): the body in the paint's colour (`paint`), rolled
    tin seams top and bottom, the domed top with the valve cup and the actuator with its nozzle pointing forward
    (+X), the label's stripes round the body in the second colour (`paint_b`), one for every size up. The medium
    can is r 33 mm with its shoulder at 174 mm; the others are its top on a body of another girth and height."""
    P.ao_distance = 0.02
    k = r / 0.033
    dz = shoulder - 0.174
    P.lathe('can', [(0.0, 0.012), (0.022 * k, 0.008), (0.031 * k, 0.005), (r, 0.011), (r, shoulder), (r - 0.0015, shoulder + 0.006)],
            material='paint', segs=24, close='end', sharp=50.0)
    P.torus('seam_bottom', r - 0.0018, 0.0026, loc=(0, 0, 0.0021), segs=24, rsegs=5, material='chrome')
    P.torus('seam_top', r - 0.0018, 0.0026, loc=(0, 0, shoulder + 0.0055), segs=24, rsegs=5, material='chrome')
    # (the dome from the shoulder in to the valve cup, as wide as the can)
    kk = (r - 0.0025 - 0.0125) / (0.0305 - 0.0125)
    dome = [(0.0305, 0.18), (0.027, 0.188), (0.018, 0.195), (0.0125, 0.197), (0.0125, 0.2015), (0.0, 0.2015)]
    P.lathe('dome', [((0.0125 + (x - 0.0125) * kk) if x > 0.0125 else x, z + dz) for x, z in dome],
            material='chrome', segs=24, close='start', sharp=50.0)
    P.lathe('actuator', [(0.0, 0.2005 + dz), (0.0105, 0.2005 + dz), (0.0105, 0.212 + dz), (0.0085, 0.2175 + dz), (0.0, 0.219 + dz)],
            material='chrome', segs=16, sharp=45.0)
    P.cyl('nozzle', 0.0024, 0.004, (0.0102, 0, 0.212 + dz), 'trim', axis='X', segs=8, bev=None)
    for i, (z0, z1) in enumerate(stripes):
        P.lathe('stripe%d' % i, [(r, z0), (r + 0.0008, z0 + 0.0006), (r + 0.0008, z1 - 0.0006), (r, z1)],
                material='paint_b', segs=24, sharp=30.0)
    P.views = [('a', 35, 14), ('b', 215, 14)]


def spray_s(P):
    """The small can (Arctic Drive's Lv1): squat, one wide label band."""
    _spray(P, 0.029, 0.13, [(0.052, 0.086)])


def spray(P):
    """The medium can (Lv2): two stripes."""
    _spray(P, 0.033, 0.174, [(0.07, 0.082), (0.094, 0.106)])


def spray_l(P):
    """The large can (Lv3): tall and broad, three stripes."""
    _spray(P, 0.036, 0.215, [(0.08, 0.092), (0.104, 0.116), (0.128, 0.14)])


# ------------------------------------------------------------------------------------------------ sponge

def _section(w, h, r, flats=(2, 2, 1, 2)):
    """A rounded rectangle (2 segments per corner) with extra points along its flats (top, side, bottom, side),
    so that the pores cut into it sit among small faces (no long slivers to smear their AO)."""
    seg = 2
    corners = [(w / 2 - r, h / 2 - r, 0), (-w / 2 + r, h / 2 - r, 90), (-w / 2 + r, -h / 2 + r, 180),
               (w / 2 - r, -h / 2 + r, 270)]
    groups = []
    for (cx, cy, a0) in corners:
        groups.append([(cx + r * math.cos(math.radians(a0 + 90 * i / seg)),
                        cy + r * math.sin(math.radians(a0 + 90 * i / seg))) for i in range(seg + 1)])
    out = []
    for ci in range(4):
        out += groups[ci]
        a, b = groups[ci][-1], groups[(ci + 1) % 4][0]
        k = flats[ci]
        for t in range(1, k + 1):
            f = t / (k + 1)
            out.append((a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f))
    return out


def sponge(P):
    """A car-wash sponge: a dog-bone block (wide ends, pinched waist), rounded all over, the pores of its foam
    cut into the top."""
    P.ao_distance = 0.01
    L, Wd, Hs = 0.14, 0.09, 0.06
    # ring positions: even through the middle, closer together towards the rounded ends
    us = [-0.7 + 1.4 * i / 10 for i in range(11)]
    for e in (0.3, 0.55, 0.74, 0.87, 0.95, 0.99):
        us += [-(0.7 + 0.3 * e), 0.7 + 0.3 * e]
    us.sort()
    rings = []
    for u in us:
        x = u * L / 2
        e = max(0.0, (abs(u) - 0.7) / 0.3)
        s = max(0.28, (1.0 - e ** 2.4) ** (1 / 2.4)) if e > 0 else 1.0
        waist = 1.0 - 0.16 * math.exp(-(u / 0.4) ** 2)
        w = Wd * waist * (0.35 + 0.65 * s)
        h = Hs * (1.0 - 0.06 * math.exp(-(u / 0.4) ** 2)) * (0.3 + 0.7 * s)
        rr = min(w, h) * 0.36
        sec = _section(w, h, rr, flats=(3, 0, 0, 0))
        rings.append([(x, y, z + Hs / 2) for (y, z) in sec])
    bm = bmesh.new()
    vr, faces = K.bm_loft(bm, rings, cap_start=True, cap_end=True)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    bm.normal_update()
    # pores: small spheres scattered over the top (placed by casting onto the surface), cut out of the
    # foam; their AO darkens them
    from mathutils.bvhtree import BVHTree
    tree = BVHTree.FromBMesh(bm)
    cutter = bmesh.new()

    def jit(k, a):
        return math.sin(k * 12.9898 + a * 78.233) * 0.5

    def pore(o, d, k):
        hit, nrm, _, _ = tree.ray_cast(V(o), V(d).normalized(), 0.2)
        if hit is None:
            return
        r = 0.0024 + 0.0012 * (0.5 + jit(k, 3.1))
        K.bm_sphere(cutter, r, 6, 4, matrix=Matrix.Translation(hit + nrm * (r * 0.3)))

    k = 0
    for ix in range(8):
        for iy in range(4):
            k += 1
            x = -0.056 + 0.016 * ix + 0.005 * jit(k, 1.0)
            y = -0.024 + 0.016 * iy + 0.005 * jit(k, 2.0) + (0.008 if ix % 2 else 0.0)
            if abs(y) < 0.031 and abs(x) < 0.058:
                pore((x, y, 0.2), (0, 0, -1), k)
    P.ao_distance = 0.008
    obj = P.mesh('sponge', bm, 'paint', sharp=50)
    P.cut(obj, cutter)
    P.views = [('a', 35, 26), ('b', 215, 26)]


TOOLS = {
    'jerrycan': jerrycan,
    'bottle': bottle,
    'oilcan': oilcan,
    'spray': spray,
    'spray_s': spray_s,
    'spray_l': spray_l,
    'sponge': sponge,
}


def main(args):
    K.run(TOOLS, args, out_dir=OUT, geo=False)
