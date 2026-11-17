"""
The workshop machines as models (the lead programs them): the diesel generator that stands outside by the
wall, the recycler that shreds things for materials, the crafting bench:

    blender -b --factory-startup --python tools/blender/build.py -- machines/garage_machines [<id>|all]
        [--toon] [--norender] [--stats] [--hi] [--views=yaw:pitch,...]

Writes public/models/modcar/machines/<id>.glb (not parts_geo.json): root mesh PART, origin at the bottom
centre of the footprint (the skids, the feet, the legs), standing on z = 0, its front (where the player
works) towards +X; conventional material names only, AO in 'Col'. `paint` takes the machine's main colour
(the frame, the cabinet, the tank), `paint_b` its second (castings, panels, the hopper). The moving children
(movers: origin on their pivot) and the markers (empties: local +Z the direction given) the game finds by name:

    generator  CORD (the pull handle, origin at the rope's end in it; pulled out along +X), SWITCH (turns
               about its local Y), LAMP, CAP (the filler cap, origin at its centre), NEEDLE (the fuel gauge's,
               turns about its local Z: -60 empty .. +60 full); M_cord_exit, M_exhaust_out, M_socket, M_filler
    recycler   ROTOR_A, ROTOR_B (spin about their local Y), LAMP; M_intake, M_grind, M_socket
    workbench  LAMP; M_craft, M_eye (+Z at M_craft), M_socket

The dials (material `gauge`) get UVs round their centres (u right, v up as one reads them), from which the
game's gauge shading paints its scale. --toon renders the cel preview of every view (the kit does the first),
--hi bigger ones (D:/modcar-scratch/parts/<id>_hi_<view>.png); --views=yaw:pitch,... picks the angles.
"""
import math

import bmesh
from mathutils import Matrix

from parts import _kit as K
from parts._kit import V, mat4

OUT = 'public/models/modcar/machines'
TAU = math.tau


# ------------------------------------------------------------------------------------------------ helpers

def jit(k, a=0.0):
    """A fixed pseudo-random number in [-0.5, 0.5) (the same on every run)."""
    v = math.sin(k * 12.9898 + a * 78.233) * 43758.5453
    return (v - math.floor(v)) - 0.5


def rrect_xz(x0, x1, z0, z1, y, r, seg=3, step=0.2):
    """A closed rounded rectangle in the plane Y = y (x0..x1, z0..z1 on the centre line), its straight runs
    split every `step` m so that the vertex AO is sampled along them."""
    pts = [V(p) for p in K.rounded_rect(x1 - x0, z1 - z0, r, seg=seg)]
    cx, cz = (x0 + x1) / 2, (z0 + z1) / 2
    path = []
    for i, a in enumerate(pts):
        b = pts[(i + 1) % len(pts)]
        path.append(a)
        k = int((b - a).length / step)
        for j in range(1, k + 1):
            path.append(a + (b - a) * (j / (k + 1)))
    return [(cx + p.x, y, cz + p.y) for p in path]


def ccw(poly):
    """A 2D polygon counter-clockwise (reversed if its signed area is negative)."""
    a = sum(p[0] * q[1] - q[0] * p[1] for p, q in zip(poly, poly[1:] + poly[:1]))
    return list(poly) if a >= 0 else list(poly)[::-1]


def inside2d(poly, pt, margin=0.0):
    """Is pt inside the convex CCW polygon (grown by margin)?"""
    for p, q in zip(poly, poly[1:] + poly[:1]):
        ex, ey = q[0] - p[0], q[1] - p[1]
        ln = math.hypot(ex, ey) or 1.0
        if (ex * (pt[1] - p[1]) - ey * (pt[0] - p[0])) / ln < -margin:
            return False
    return True


def front_prism(P, name, poly_yz, x0, depth, material, bev=None, segs=1, **kw):
    """A flat plate standing on the plane X = x0 and facing +X (its front at x0 + depth): poly_yz is its outline
    as (y, z) as seen from the front (either winding)."""
    poly_yz = ccw(poly_yz)
    poly = [(-z, y) for (y, z) in poly_yz]
    return P.prism(name, poly, depth, material=material, matrix=mat4((x0, 0, 0), (0, 90, 0)), center=False,
                   bev=bev, segs=segs, **kw)


def fin_stack(P, base, ax, w, d, ts, t=0.0065, r=None, material='alu', name='fins', x_hint=(1, 0, 0)):
    """Square cooling fins with round corners (w across the axis frame's x, d across its y) stacked along the
    axis ax from base at the distances ts: one object, no bevel (they are thin plates)."""
    ax = V(ax).normalized()
    m0 = K.frame_from_z(ax, x_hint)
    poly = K.rounded_rect(w, d, r if r is not None else min(w, d) * 0.2, seg=2)
    bm = bmesh.new()
    for s in ts:
        K.bm_prism(bm, poly, t, matrix=Matrix.Translation(V(base) + ax * s) @ m0)
    return P.mesh(name, bm, material, sharp=50.0)


def bm_disc(bm, r, n, c, normal, x_hint=(1, 0, 0)):
    """A flat n-gon (one face) of radius r at c facing normal: a decal-like patch (a hole, a dial, a screw head)."""
    nrm = V(normal).normalized()
    xh = x_hint if abs(V(x_hint).normalized().dot(nrm)) < 0.9 else (0, 1, 0)
    m = Matrix.Translation(V(c)) @ K.frame_from_z(nrm, xh)
    vs = [bm.verts.new(m @ V((r * math.cos(TAU * i / n), r * math.sin(TAU * i / n), 0.0))) for i in range(n)]
    f = bm.faces.new(vs)
    f.normal_update()
    if f.normal.dot(nrm) < 0:
        f.normal_flip()
    return f


def bm_rect(bm, w, h, c, normal, x_hint=(0, 0, 1)):
    """A flat w x h rectangle (one face) at c facing normal, its h side along x_hint (projected)."""
    nrm = V(normal).normalized()
    xh = V(x_hint)
    if abs(xh.normalized().dot(nrm)) > 0.9:
        xh = V((1, 0, 0)) if abs(nrm.x) < 0.9 else V((0, 1, 0))
    a = (xh - nrm * xh.dot(nrm)).normalized()
    b = nrm.cross(a)
    c = V(c)
    vs = [bm.verts.new(c + a * (sa * h / 2) + b * (sb * w / 2)) for (sa, sb) in ((-1, -1), (-1, 1), (1, 1), (1, -1))]
    f = bm.faces.new(vs)
    f.normal_update()
    if f.normal.dot(nrm) < 0:
        f.normal_flip()
    return f


def disc(P, name, r, n, c, normal, material, **kw):
    """A flat n-gon patch as its own object (see bm_disc)."""
    bm = bmesh.new()
    bm_disc(bm, r, n, c, normal, **kw)
    return P.mesh(name, bm, material, sharp=50.0)


def hull2d(pts):
    """Convex hull of 2D points, counter-clockwise (Andrew's monotone chain)."""
    pts = sorted(set((round(x, 6), round(y, 6)) for (x, y) in pts))

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


def circles_hull(circles, n=16):
    """The outline round several circles [(x, y, r), ...] (a belt guard's, a gear cover's): CCW."""
    pts = []
    for (cx, cy, r) in circles:
        pts += [(cx + r * math.cos(TAU * i / n), cy + r * math.sin(TAU * i / n)) for i in range(n)]
    return hull2d(pts)


def shell(P, name, rings, material, **kw):
    """A closed solid through rings of 3D points (the same count each), the last ring joined back to the first:
    e.g. a hopper's inner bottom, outer bottom, outer top, inner top rings make a wall with thickness."""
    bm = bmesh.new()
    vr = [[bm.verts.new(p) for p in ring] for ring in rings]
    m = len(vr[0])
    for a, b in zip(vr, vr[1:] + vr[:1]):
        for j in range(m):
            bm.faces.new((a[j], a[(j + 1) % m], b[(j + 1) % m], b[j]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    return P.mesh(name, bm, material, **kw)


def rect_ring(cx, cy, w, d, z):
    """The 4 corners of a w x d rectangle at height z, counter-clockwise from above."""
    return [(cx + w / 2, cy - d / 2, z), (cx + w / 2, cy + d / 2, z), (cx - w / 2, cy + d / 2, z), (cx - w / 2, cy - d / 2, z)]


def rrect_xy(cx, cy, w, d, z, r, seg=3):
    """A closed rounded rectangle path in the plane Z = z."""
    return [(cx + x, cy + y, z) for (x, y) in K.rounded_rect(w, d, r, seg=seg)]


def chip_heap(P, centre, size, n, materials, seed=1):
    """A heap of shredded bits: a low mound (size = its half-lengths x, y and its height; centre = the middle of its
    base) of the last material, n small irregular chips (squashed, turned cubes) on and in its surface, split over
    the materials."""
    c = V(centre)
    a, b, h = size
    prof = [(1.0, 0.0), (0.92, 0.38), (0.72, 0.7), (0.42, 0.92), (0.0, 1.0)]
    bm = bmesh.new()
    K.bm_lathe(bm, [(r, z * h) for (r, z) in prof][::-1], segs=12, close='start')
    for v in bm.verts:
        v.co = V((c.x + v.co.x * a, c.y + v.co.y * b, c.z + v.co.z))
    for k, v in enumerate(bm.verts):
        if 0.005 < (v.co.z - c.z) < h * 0.95:
            v.co.z += 0.18 * h * jit(k, seed + 0.6)
    mound = P.mesh('heap', bm, materials[-1], sharp=50.0)
    bms = [bmesh.new() for _ in materials]
    for k in range(n):
        ang = TAU * (jit(k, seed) + 0.5)
        rr = math.sqrt(jit(k, seed + 1.7) + 0.5) * 0.95
        u, w = rr * math.cos(ang), rr * math.sin(ang)
        z = c.z + h * max(0.0, 1.0 - u * u - w * w) ** 0.55 + 0.002
        s = (0.018 + 0.012 * (jit(k, seed + 4.3) + 0.5), 0.012 + 0.009 * (jit(k, seed + 5.9) + 0.5),
             0.006 + 0.004 * (jit(k, seed + 7.7) + 0.5))
        rot = (360 * jit(k, seed + 2.2), 70 * jit(k, seed + 8.8), 360 * jit(k, seed + 9.4))
        K.bm_cube(bms[k % len(materials)], s, mat4((c.x + u * a, c.y + w * b, z), rot))
    return [mound] + [P.mesh('chips', bb, m, sharp=40.0) for bb, m in zip(bms, materials)]


def cutter_disc(r_base, teeth, flip=False):
    """The outline of a shredder's cutter disc in its own plane: `teeth` hooked teeth (each rising along its
    back to a sharp tip that leans forward over an undercut, then down into the gullet); CCW."""
    prof = [(0.0, 1.0), (45.0, 1.234), (80.0, 1.617), (75.0, 1.36), (95.0, 1.04)]
    span = 360.0 / teeth
    pts = []
    for k in range(teeth):
        for (a, s) in prof:
            ang = math.radians(k * span + a * span / 120.0)
            pts.append((r_base * s * math.cos(ang), r_base * s * math.sin(ang)))
    if flip:
        pts = [(x, -y) for (x, y) in pts][::-1]
    return pts


def bar_path(a, b, c, d, r, n=3):
    """A handle's path a-b-c-d (two right-angle bends) with the bends rounded by r in n steps each."""
    a, b, c, d = V(a), V(b), V(c), V(d)
    out = [a]
    for (p0, p1, p2) in ((a, b, c), (b, c, d)):
        u, w = (p0 - p1).normalized(), (p2 - p1).normalized()
        s0, s1 = p1 + u * r, p1 + w * r
        for k in range(n + 1):
            t = k / n
            out.append(s0 * (1 - t) ** 2 + p1 * 2 * t * (1 - t) + s1 * t * t)
    out.append(d)
    return out


def angle_iron(P, name, p0, p1, u, v, w=0.05, t=0.005, material='paint', step=0.3, bev=0.0018):
    """An angle-iron bar (an L section, flanges w wide and t thick) from p0 to p1: its outer corner runs along the
    line p0-p1, the flanges go off along the unit vectors u and v; rings every `step` m for the vertex AO."""
    p0, p1 = V(p0), V(p1)
    u, v = V(u).normalized(), V(v).normalized()
    sec = [(0, 0), (w, 0), (w, t), (t, t), (t, w), (0, w)]
    n = max(1, int((p1 - p0).length / step))
    rings = []
    for k in range(n + 1):
        c = p0 + (p1 - p0) * (k / n)
        rings.append([c + u * a + v * b for (a, b) in sec])
    bm = bmesh.new()
    K.bm_loft(bm, rings, cap_start=True, cap_end=True)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    return P.mesh(name, bm, material, bev=bev, segs=1, sharp=40.0)


def offset_poly(pts, d):
    """Push a convex CCW polygon out by d (each vertex along its averaged edge normals)."""
    n = len(pts)
    out = []
    for i in range(n):
        a, b, c = V(pts[i - 1]), V(pts[i]), V(pts[(i + 1) % n])
        e1, e2 = (b - a).normalized(), (c - b).normalized()
        n1, n2 = V((e1.y, -e1.x)), V((e2.y, -e2.x))
        m = (n1 + n2).normalized()
        k = d / max(0.3, m.dot(n1))
        out.append((b.x + m.x * k, b.y + m.y * k))
    return out


def after_finish(P, fn):
    """Run fn(P) right after the kit's finish (which rebuilds the meshes, so anything added before is lost)."""
    fin = P.finish

    def finish():
        root = fin()
        fn(P)
        return root

    P.finish = finish


def dial_uvs(dials):
    """
    A finish hook: a UV layer on every mesh with faces in `gauge`, those faces mapped round their dial (the
    nearest of dials = [dict(c=centre, right=, up=, r=radius)]: u = 0.5 + right / 2r, v = 0.5 + up / 2r, as one
    reads it), every other face at 0 (what the game gives a mesh without UVs).
    """
    import numpy as np

    def run(P):
        for o in [P.root] + P.mover_objs:
            me = o.data
            names = [m.name.split('.')[0] if m else '' for m in me.materials]
            if 'gauge' not in names:
                continue
            mw = o.matrix_world
            data = np.zeros((len(me.loops), 2), np.float32)
            for poly in me.polygons:
                if names[poly.material_index] != 'gauge':
                    continue
                cen = mw @ poly.center
                d = min(dials, key=lambda g: (cen - V(g['c'])).length)
                c, right, up = V(d['c']), V(d['right']), V(d['up'])
                for li in poly.loop_indices:
                    p = mw @ me.vertices[me.loops[li].vertex_index].co - c
                    data[li] = (0.5 + p.dot(right) / (2 * d['r']), 0.5 + p.dot(up) / (2 * d['r']))
            uv = me.uv_layers.new(name='UVMap')
            uv.data.foreach_set('uv', data.ravel())

    return run


# ------------------------------------------------------------------------------------------------ generator

def generator(P):
    """
    An old open-frame diesel generator (about 0.55 x 0.78 x 0.62): a painted tube cage on two skids with rubber
    feet. On the +Y half the engine, an air-cooled single: the cast crankcase, the finned cylinder tilted back
    15 deg with its finned head and rocker cover, the injection pump and its pipe, the fan housing on its end
    with the round air filter on top and the recoil starter's pressed cup, the T-handle resting at the rope
    guide on the front of the cup (the rope leaves towards +X); the muffler behind under a perforated heat
    shield, the tailpipe up and back. On the -Y half the alternator coupled to it (the cooling grille round the
    coupling, vent slots, the cast end cap) with the control panel on its front: a toggle switch, the lamp, two
    sockets, a voltmeter. Across the top the tank (filler neck and screw cap, the round fuel gauge, two straps,
    the fuel tap and its hose down to the pump), a lifting eye on the frame, a ground strap, a warning sticker.
    """
    P.ao_distance = 0.08
    rt = 0.014                                   # the cage's tube (28 mm)
    yl, xo, zb, zt = 0.37, 0.255, 0.075, 0.42    # end loops at +-yl; their outline on the tube's centre line
    for y in (-yl, yl):
        P.tube('frame_end', rrect_xz(-xo, xo, zb, zt, y, 0.06, seg=3, step=1.0), rt, 'paint', segs=8, closed=True,
               caps=False)
    for x in (-0.195, 0.195):
        P.tube('frame_top', [(x, -yl, zt), (x, yl, zt)], rt, 'paint', segs=8)
    # the skids with their rubber feet, the bars the engine and the alternator are bolted to
    for x in (-0.19, 0.19):
        P.prism('skid', [(x + px, z) for (px, z) in K.rounded_rect(0.05, 0.04, 0.007, seg=1)], 0.78, material='paint',
                matrix=mat4((0, 0, 0.04), (90, 0, 0)), bev=None, sharp=50.0)
        for y in (-0.33, 0.33):
            P.cyl('foot', 0.026, 0.02, (x, y, 0.01), 'rubber', segs=8, bev=None)
    ye, ya = 0.085, -0.19
    for y in (ye, ya):
        P.box('mount_bar', (0.43, 0.05, 0.008), (0, y, 0.064), 'paint', bev=None)

    # ---- the engine (+Y half): crank along Y at zc
    zc = 0.175
    outline = [(-0.09, 0.098), (0.09, 0.098), (0.115, 0.14), (0.118, 0.21), (0.09, 0.255), (0.045, 0.272),
               (-0.055, 0.272), (-0.10, 0.25), (-0.12, 0.20), (-0.115, 0.14)]
    P.prism('crankcase', outline, 0.17, material='alu', matrix=mat4((0, ye, 0), (90, 0, 0)), bev=0.012, segs=1)
    for x in (-0.1, 0.1):
        P.box('lug', (0.05, 0.06, 0.022), (x, ye, 0.079), 'alu', bev=0.003, segs=1)
    P.box('case_cover', (0.008, 0.075, 0.06), (0.121, 0.115, 0.165), 'alu', bev=0.003, segs=1)
    # the cylinder tilted back 15 deg: finned barrel, finned head, the rocker cover
    lean = math.radians(15)
    ax = V((-math.sin(lean), 0, math.cos(lean)))
    ux = V((math.cos(lean), 0, math.sin(lean)))
    base = V((-0.012, ye, 0.262))
    P.cyl('barrel', 0.038, 0.095, tuple(base + ax * 0.0475), 'alu', axis=ax, segs=12, bev=None, caps=False)
    fin_stack(P, base, ax, 0.135, 0.125, [0.013 + 0.0185 * i for i in range(4)])
    hc = base + ax * 0.115
    P.box('head', (0.10, 0.10, 0.052), tuple(hc), 'alu', rot=(0, -15, 0), bev=0.008, segs=1)
    fin_stack(P, base, ax, 0.15, 0.135, [0.099, 0.114, 0.129], name='head_fins')
    P.box('rocker', (0.106, 0.098, 0.026), tuple(base + ax * 0.152), 'paint_b', rot=(0, -15, 0), bev=0.008, segs=1)
    P.bolts([tuple(base + ax * 0.165 + ux * (s * 0.03)) for s in (-1, 1)], normal=tuple(ax), r=0.0065, h=0.005,
            washer=False, x_hint=tuple(ux))
    # the injection pump on the case's front, its steel pipe up to the injector in the head's front
    pp = V((0.128, 0.035, 0.232))
    P.box('inj_pump', (0.022, 0.034, 0.05), tuple(pp), 'alu', bev=0.005, segs=1)
    P.cyl('pump_valve', 0.008, 0.014, tuple(pp + V((0, 0, 0.031))), 'steel', segs=6, bev=None)
    inj = hc + ux * 0.05 + V((0, -0.035, 0.0))
    P.cyl('injector', 0.009, 0.036, tuple(inj + ux * 0.016), 'steel', axis=tuple(ux), segs=8, bev=None)
    P.cyl('inj_nut', 0.011, 0.01, tuple(inj + ux * 0.034), 'steel', axis=tuple(ux), segs=6, bev=None)
    P.tube('inj_pipe', [pp + V((0, 0, 0.037)), pp + V((-0.004, 0, 0.075)), inj + ux * 0.039], 0.0035, 'steel', segs=5,
           bend=0.02)
    # the fan housing on the +Y end, the recoil starter's pressed cup on it
    yh = 0.17
    P.lathe('fan_housing', [(0.0, 0.0), (0.112, 0.0), (0.118, 0.008), (0.118, 0.065), (0.0, 0.065)],
            loc=(0, yh, zc), material='paint_b', axis='Y', segs=16, sharp=40.0)
    P.bolts([(0.109 * math.cos(math.radians(a)), yh + 0.065, zc + 0.109 * math.sin(math.radians(a))) for a in (205, 335)],
            normal=(0, 1, 0), r=0.006, h=0.005, washer=False)
    yr = yh + 0.065
    P.lathe('recoil', [(0.0, 0.047), (0.07, 0.045), (0.074, 0.04), (0.093, 0.038), (0.099, 0.03), (0.099, 0.0),
                       (0.09, -0.002)][::-1], loc=(0, yr, zc), material='steel', axis='Y', segs=18, close='start',
            sharp=40.0)
    P.cyl('recoil_hub', 0.021, 0.012, (0, yr + 0.05, zc), 'paint_b', axis='Y', segs=10, bev=None)
    P.bolt((0, yr + 0.056, zc), normal=(0, 1, 0), r=0.008, h=0.006, washer=False)
    # the rope guide on the cup's side wall, at the top of the drum inside: the rope leaves along +X
    gz, gy = zc + 0.065, yr + 0.016
    P.cyl('rope_guide', 0.011, 0.026, (0.084, gy, gz), 'steel', axis='X', segs=8, bev=None)
    disc(P, 'rope_hole', 0.0055, 6, (0.0973, gy, gz), (1, 0, 0), 'trim')
    P.empty('M_cord_exit', (0.098, gy, gz), rot=(0, 90, 0))
    # the T-handle resting against the guide (CORD: origin at the rope's end inside it)
    hx = 0.121
    grip = P.lathe('cord_grip', [(0.0, -0.048), (0.012, -0.048), (0.0145, -0.042), (0.0115, -0.014), (0.0115, 0.014),
                                 (0.0145, 0.042), (0.012, 0.048), (0.0, 0.048)],
                   loc=(hx, gy, gz), material='trim', axis='Y', segs=10, sharp=50.0)
    boss = P.cyl('cord_boss', 0.008, 0.016, (hx - 0.016, gy, gz), 'trim', axis='X', segs=8, bev=None)
    P.mover('CORD', [grip, boss], (hx, gy, gz))
    # the round air filter on top of the fan housing
    fc = V((-0.035, 0.212, 0.302))
    P.box('filter_brk', (0.07, 0.04, 0.02), tuple(fc + V((0, 0, -0.008))), 'steel', bev=None)
    P.cyl('filter', 0.05, 0.058, tuple(fc + V((0, 0, 0.029))), 'paint_b', segs=14, bev=None)
    P.cyl('filter_lid', 0.053, 0.014, tuple(fc + V((0, 0, 0.064))), 'steel', segs=14, r2=0.036, bev=None)
    P.box('wing', (0.006, 0.034, 0.012), tuple(fc + V((0, 0, 0.076))), 'steel', bev=None)
    # the exhaust out of the head's back into the muffler behind the engine, its perforated heat shield,
    # the tailpipe up and back
    eb = hc - ux * 0.05
    P.box('ex_flange', (0.01, 0.04, 0.034), tuple(eb - ux * 0.004), 'rust', rot=(0, -15, 0), bev=None)
    mf = V((-0.168, ye, 0.305))
    P.tube('ex_pipe', [eb - ux * 0.008, eb - ux * 0.03 + V((0, 0, -0.012)), mf + V((0.032, 0, 0.0))], 0.014, 'rust',
           segs=8, bend=0.015)
    P.lathe('muffler', [(0.0, -0.072), (0.04, -0.072), (0.045, -0.066), (0.045, 0.066), (0.04, 0.072), (0.0, 0.072)],
            loc=tuple(mf), material='rust', axis='Y', segs=14, sharp=40.0)
    P.lathe('heat_shield', [(0.053, -0.06), (0.057, -0.06), (0.057, 0.06), (0.053, 0.06)], loc=tuple(mf),
            material='steel', axis='Y', segs=10, angle=math.radians(190), start=math.radians(110), loop=True,
            sharp=50.0)
    bm = bmesh.new()
    for phi in (90, 122, 154, 186, 218):
        for dy in (-0.036, 0.0, 0.036):
            a = math.radians(phi)
            n = V((math.cos(a), 0, math.sin(a)))
            bm_disc(bm, 0.0064, 6, mf + V((0, dy, 0)) + n * 0.0577, n)
    P.mesh('shield_holes', bm, 'trim', sharp=50.0)
    for dy in (-0.05, 0.05):
        P.box('shield_clip', (0.016, 0.012, 0.018), tuple(mf + V((0.0, dy, 0.052))), 'steel', bev=None)
    tp = [mf + V((-0.012, 0.06, 0.0)), mf + V((-0.012, 0.096, 0.0)), mf + V((-0.072, 0.1, 0.118))]
    P.tube('tailpipe', tp, 0.013, 'rust', segs=7, bend=0.03)
    d = (tp[-1] - tp[-2]).normalized()
    disc(P, 'tail_mouth', 0.0095, 8, tp[-1] + d * 0.0005, d, 'trim')
    P.empty('M_exhaust_out', tuple(tp[-1]), rot=(0, math.degrees(math.atan2(d.x, d.z)), 0))

    # ---- the alternator (-Y half), coupled to the engine
    P.lathe('adapter', [(0.0, 0.0), (0.098, 0.0), (0.1, 0.01), (0.09, 0.05), (0.082, 0.06), (0.0, 0.06)],
            loc=(0, -0.06, zc), material='paint_b', axis='Y', segs=16, sharp=40.0)
    P.cyl('grille', 0.1008, 0.024, (0, -0.04, zc), 'trim', axis='Y', segs=16, bev=None, caps=False)
    bm = bmesh.new()
    for i in range(6):
        a = TAU * (i + 0.5) / 6
        K.bm_cube(bm, (0.0045, 0.026, 0.008), Matrix.Translation((0.1015 * math.cos(a), -0.04, zc + 0.1015 * math.sin(a)))
                  @ Matrix.Rotation(-a, 4, 'Y'))
    P.mesh('grille_bars', bm, 'steel', sharp=50.0)
    P.cyl('alt_body', 0.095, 0.24, (0, -0.18, zc), 'paint_b', axis='Y', segs=18, bev=None, caps=False)
    bm = bmesh.new()
    for i in range(6):
        a = math.radians(-60 + 30 * i)
        K.bm_cube(bm, (0.003, 0.034, 0.0095), Matrix.Translation((0.0957 * math.cos(a), -0.272, zc + 0.0957 * math.sin(a)))
                  @ Matrix.Rotation(-a, 4, 'Y'))
    P.mesh('vent_slots', bm, 'trim', sharp=50.0)
    bm = bmesh.new()
    for a in (45, 135, 225, 315):
        r = math.radians(a)
        K.bm_cyl(bm, 0.0045, 0.25, segs=6, caps=False,
                 matrix=Matrix.Translation((0.097 * math.cos(r), -0.18, zc + 0.097 * math.sin(r))) @ K.axis_matrix('Y'))
    P.mesh('tie_rods', bm, 'steel', sharp=50.0)
    P.lathe('end_cap', [(0.0, 0.037), (0.04, 0.034), (0.08, 0.024), (0.097, 0.01), (0.097, -0.004), (0.09, -0.004)][::-1],
            loc=(0, -0.30, zc), material='steel', axis='-Y', segs=14, close='start', sharp=40.0)
    P.cyl('bearing_boss', 0.026, 0.012, (0, -0.343, zc), 'steel', axis='Y', segs=12, bev=None)
    bm = bmesh.new()
    for i in range(4):
        a = TAU * i / 4 + math.radians(45)
        K.bm_cube(bm, (0.045, 0.012, 0.008), Matrix.Translation((0.062 * math.cos(a), -0.327, zc + 0.062 * math.sin(a)))
                  @ Matrix.Rotation(-a, 4, 'Y'))
    P.mesh('cap_ribs', bm, 'steel', sharp=50.0)
    P.bolts([(0.097 * math.cos(math.radians(a)), -0.305, zc + 0.097 * math.sin(math.radians(a))) for a in
             (0, 90, 180, 270)], normal=(0, -1, 0), r=0.006, h=0.005, washer=False)
    P.box('alt_saddle', (0.25, 0.06, 0.03), (0, ya, 0.083), 'steel', bev=0.003, segs=1)

    # ---- the control panel on the alternator's front
    yp, zp, xf = -0.18, 0.268, 0.165              # its centre and the front face
    P.box('panel_box', (0.125, 0.19, 0.15), (xf - 0.0625, yp, zp), 'paint_b', bev=0.008, segs=2)
    P.box('panel_brk', (0.07, 0.12, 0.012), (0.095, yp, 0.188), 'steel', bev=None)
    P.box('panel_face', (0.004, 0.172, 0.132), (xf + 0.001, yp, zp), 'trim', bev=None)
    xs = xf + 0.003
    bm = bmesh.new()
    for sy in (-1, 1):
        for sz in (-1, 1):
            bm_disc(bm, 0.0042, 6, (xs + 0.0005, yp + sy * 0.078, zp + sz * 0.058), (1, 0, 0))
    P.mesh('screws', bm, 'chrome', sharp=50.0)
    # the voltmeter (its scale is painted by the game from the dial's UVs) and its needle
    vy, vz = yp - 0.056, zp + 0.035
    P.lathe('volt_bezel', [(0.022, 0.0), (0.028, 0.0), (0.028, 0.006), (0.022, 0.009)], loc=(xs, vy, vz),
            material='chrome', axis='X', segs=12, loop=True, sharp=50.0)
    disc(P, 'volt_dial', 0.0225, 12, (xs + 0.002, vy, vz), (1, 0, 0), 'gauge')
    P.box('volt_needle', (0.0015, 0.004, 0.016), (xs + 0.003, vy + 0.004, vz + 0.006), 'trim', rot=(-30, 0, 0), bev=None)
    disc(P, 'volt_glass', 0.0225, 12, (xs + 0.006, vy, vz), (1, 0, 0), 'glass')
    # the lamp: a round lens in a chrome bezel (LAMP, the lens)
    ly, lz = yp + 0.004, zp + 0.04
    P.lathe('lamp_bezel', [(0.0105, 0.0), (0.0155, 0.0), (0.0155, 0.005), (0.012, 0.008)], loc=(xs, ly, lz),
            material='chrome', axis='X', segs=10, loop=True, sharp=50.0)
    lens = P.lathe('lamp', [(0.0, 0.0125), (0.007, 0.0115), (0.0108, 0.006), (0.0108, -0.002)][::-1], loc=(xs, ly, lz),
                   material='emit', axis='X', segs=10, close='start', sharp=60.0)
    P.mover('LAMP', [lens], (xs + 0.005, ly, lz))
    # the toggle switch (SWITCH: the lever, straight out; the game turns it +-30 deg about its local Y)
    sy_, sz_ = yp + 0.056, zp + 0.034
    P.box('switch_plate', (0.003, 0.032, 0.048), (xs + 0.0015, sy_, sz_), 'steel', bev=None)
    P.cyl('switch_nut', 0.0105, 0.007, (xs + 0.0065, sy_, sz_), 'chrome', axis='X', segs=6, bev=None)
    lever = P.cyl('switch_lever', 0.0068, 0.036, (xs + 0.028, sy_, sz_), 'chrome', axis='X', segs=8, r2=0.0052,
                  bev=None, caps=False)
    tip = P.sphere('switch_tip', 0.0095, (xs + 0.047, sy_, sz_), 'trim', u=8, v=4)
    P.mover('SWITCH', [lever, tip], (xs + 0.01, sy_, sz_))
    # two sockets (M_socket on the first: where the cable plugs in)
    for k, sy in enumerate((yp - 0.045, yp + 0.035)):
        sz = zp - 0.036
        P.lathe('socket', [(0.0, 0.008), (0.0195, 0.008), (0.0195, 0.012), (0.0255, 0.0105), (0.0265, 0.005),
                           (0.0265, 0.0)][::-1], loc=(xs, sy, sz), material='trim', axis='X', segs=10, close='start',
                sharp=50.0)
        disc(P, 'socket_face', 0.0193, 12, (xs + 0.0092, sy, sz), (1, 0, 0), 'ceramic')
        bm = bmesh.new()
        for dy in (-0.0095, 0.0095):
            bm_disc(bm, 0.0036, 6, (xs + 0.0098, sy + dy, sz), (1, 0, 0))
        for dz in (-0.0163, 0.0163):
            bm_rect(bm, 0.009, 0.0045, (xs + 0.0098, sy, sz + dz), (1, 0, 0))
        P.mesh('socket_pins', bm, 'trim', sharp=50.0)
        if k == 0:
            P.empty('M_socket', (xs + 0.0095, sy, sz), rot=(0, 90, 0))

    # ---- the tank across the top, on two cradle bars over the top tubes, strapped down
    zt0, zt1 = 0.446, 0.576
    P.prism('tank', K.rounded_rect(0.28, 0.48, 0.055, seg=3), zt1 - zt0, (0, 0, (zt0 + zt1) / 2), 'paint', bev=0.026,
            segs=2)
    P.prism('tank_seam', K.rounded_rect(0.292, 0.492, 0.061, seg=3), 0.008, (0, 0, zt0 + 0.028), 'paint', bev=None)
    for y in (-0.19, 0.19):
        P.box('cradle', (0.43, 0.036, 0.006), (0, y, zt + rt + 0.003), 'paint', bev=None)
        for x in (-0.1, 0.1):
            P.box('tank_pad', (0.04, 0.03, 0.006), (x, y, zt0 - 0.003), 'rubber', bev=None)
        c = 0.026
        path = [(0.172, y, zt0 - 0.003), (0.1425, y, zt0 + 0.008)]
        for sx in (1, -1):
            arc = [(sx * (0.1425 - c + c * math.cos(math.radians(a))), y, zt1 + 0.0015 - c + c * math.sin(math.radians(a)))
                   for a in (0, 30, 60, 90)]
            path += arc if sx > 0 else arc[::-1]
        path += [(-0.1425, y, zt0 + 0.008), (-0.172, y, zt0 - 0.003)]
        P.tube('strap', path, 1.0, 'steel', profile=[(-0.0016, -0.012), (0.0016, -0.012), (0.0016, 0.012),
                                                    (-0.0016, 0.012)], bend=0.0, sharp=60.0)
    P.bolts([(sx * 0.172, y, zt + rt + 0.006) for sx in (-1, 1) for y in (-0.19, 0.19)], r=0.0065, h=0.005,
            washer=False)
    # the filler neck and its screw cap (CAP: origin at the cap's centre; M_filler at the mouth, +Z up)
    fx, fy = 0.07, 0.15
    P.lathe('neck', K.shell_profile([(0.026, -0.006), (0.026, 0.02)], 0.004), loc=(fx, fy, zt1), material='steel',
            segs=12, loop=True, sharp=50.0)
    disc(P, 'neck_dark', 0.0225, 10, (fx, fy, zt1 + 0.006), (0, 0, 1), 'trim')
    P.empty('M_filler', (fx, fy, zt1 + 0.02))
    zc0 = zt1 + 0.016
    cap = [P.lathe('cap', [(0.0, 0.026), (0.028, 0.025), (0.033, 0.019), (0.033, 0.003), (0.028, 0.0)][::-1],
                   loc=(fx, fy, zc0), material='trim', segs=12, close='start', sharp=50.0)]
    bm = bmesh.new()
    for i in range(6):
        a = TAU * i / 6
        K.bm_cube(bm, (0.006, 0.0055, 0.014), mat4((fx + 0.0335 * math.cos(a), fy + 0.0335 * math.sin(a), zc0 + 0.011),
                                                   (0, 0, math.degrees(a))))
    cap.append(P.mesh('cap_ribs', bm, 'trim', sharp=50.0))
    P.mover('CAP', cap, (fx, fy, zc0 + 0.013))
    # the fuel gauge: a chrome bezel, the dial, the needle (NEEDLE, pointing to the middle of its sweep, away
    # from the front: -60 deg about its local Z is empty, at the dial's red end) under the glass
    gx, gy = 0.065, -0.13
    P.lathe('gauge_bezel', [(0.0302, -0.002), (0.037, -0.002), (0.037, 0.005), (0.0302, 0.0095)], loc=(gx, gy, zt1),
            material='chrome', segs=12, loop=True, sharp=50.0)
    disc(P, 'gauge_dial', 0.0305, 14, (gx, gy, zt1 + 0.003), (0, 0, 1), 'gauge')
    zn = zt1 + 0.0042
    poly = [(0.007, -0.0026), (0.007, 0.0026), (-0.022, 0.0012), (-0.0245, 0.0), (-0.022, -0.0012)]
    needle = [P.prism('needle', poly, 0.0016, (gx, gy, zn), 'trim', bev=None)]
    needle.append(P.cyl('needle_hub', 0.0042, 0.0022, (gx, gy, zn + 0.0012), 'chrome', segs=6, bev=None))
    P.mover('NEEDLE', needle, (gx, gy, zn))
    disc(P, 'gauge_glass', 0.0305, 14, (gx, gy, zt1 + 0.0085), (0, 0, 1), 'glass')
    # the fuel tap under the tank and its hose down to the injection pump
    tx, ty = 0.06, 0.05
    P.box('tap', (0.022, 0.02, 0.026), (tx, ty, zt0 - 0.013), 'steel', bev=0.003, segs=1)
    P.box('tap_lever', (0.006, 0.034, 0.008), (tx + 0.014, ty + 0.008, zt0 - 0.012), 'trim', bev=None)
    P.tube('fuel_hose', [(tx, ty, zt0 - 0.026), (0.165, 0.04, 0.33), (0.136, pp.y, pp.z + 0.008)], 0.0055, 'rubber',
           segs=6, bend=0.03)
    # a lifting eye on the engine end's top tube
    eye = P.prism('lift_eye', K.rounded_rect(0.05, 0.056, 0.02, seg=2), 0.008, matrix=mat4((0, yl, zt + 0.026), (90, 0, 0)),
                  material='paint', bev=None)
    hole = bmesh.new()
    K.bm_cyl(hole, 0.0105, 0.03, segs=10, matrix=mat4((0, yl, zt + 0.034), (90, 0, 0)))
    P.cut(eye, hole)
    # the ground strap: a braided strap from the alternator's saddle to a wing-nut stud on the skid
    P.tube('ground_strap', [(0.19, -0.28, 0.066), (0.165, -0.25, 0.07), (0.13, -0.205, 0.092), (0.112, -0.19, 0.094)],
           1.0, 'chrome', profile=[(-0.0015, -0.007), (0.0015, -0.007), (0.0015, 0.007), (-0.0015, 0.007)], bend=0.015,
           sharp=60.0)
    P.cyl('ground_stud', 0.004, 0.02, (0.19, -0.28, 0.07), 'steel', segs=6, bev=None)
    P.box('ground_wing', (0.006, 0.026, 0.01), (0.19, -0.28, 0.076), 'steel', bev=None)
    # a warning sticker on the tank's front (a black triangle, a white one in it, the exclamation mark)
    wy, wz, wx = -0.035, 0.515, 0.14
    tri = [(0.0, 0.031), (-0.031, -0.022), (0.031, -0.022)]
    front_prism(P, 'sticker', [(wy + a, wz + b) for (a, b) in tri], wx - 0.001, 0.0022, 'trim')
    front_prism(P, 'sticker_in', [(wy + a * 0.76, wz + b * 0.76 - 0.002) for (a, b) in tri], wx, 0.0027, 'ceramic')
    bm = bmesh.new()
    bm_rect(bm, 0.0055, 0.02, (wx + 0.0029, wy, wz + 0.005), (1, 0, 0))
    bm_disc(bm, 0.0032, 6, (wx + 0.0029, wy, wz - 0.0125), (1, 0, 0))
    P.mesh('sticker_mark', bm, 'trim', sharp=50.0)
    after_finish(P, dial_uvs([dict(c=(gx, gy, zt1 + 0.003), right=(0, 1, 0), up=(-1, 0, 0), r=0.0305),
                              dict(c=(xs + 0.002, vy, vz), right=(0, 1, 0), up=(0, 0, 1), r=0.0225)]))
    P.views = [('a', 35, 22), ('b', 215, 24), ('c', -40, 26)]


# ------------------------------------------------------------------------------------------------ recycler

def recycler(P):
    """
    The recycler (about 0.85 x 0.95 x 1.15): a stout welded steel cabinet on four short feet (a base band, a
    stiffening band round its middle, two dents) with the hopper on top - four sloped sheet walls with a rolled
    lip and a rubber flap curtain hanging on the back wall, narrowing to the slot where the two counter-rotating
    shredder rotors sit (ROTOR_A behind, ROTOR_B in front: hex shafts along Y, eight hooked cutter discs each,
    interleaved), clearly seen from above over the dark well under them. The drive on the -Y side (the belt
    guard up to rotor B's shaft, the finned motor on it with its terminal box, M_socket on that), the gear cover
    on the +Y side over the shafts' ends and a bolted inspection door; on the front the control panel (the
    tally counter with four plain drums, the lamp LAMP, the start button, the red mushroom stop), cooling
    louvres and the output drawer at the bottom, pulled out a little, a heap of shredded bits in it.
    """
    P.ao_distance = 0.1
    W, D, Z0, Z1 = 0.75, 0.78, 0.07, 0.80         # the cabinet: x, y, its bottom and top
    hx, hy = W / 2, D / 2
    # four short feet, the base band
    for sx in (-1, 1):
        for sy in (-1, 1):
            P.box('foot_pad', (0.08, 0.08, 0.012), (sx * 0.33, sy * (hy - 0.045), 0.006), 'steel', bev=0.003, segs=1)
            P.box('foot', (0.05, 0.05, 0.062), (sx * 0.33, sy * (hy - 0.045), 0.043), 'paint', bev=0.004, segs=1)
    P.box('base_band', (W + 0.02, D + 0.02, 0.045), (0, 0, Z0 + 0.0225), 'paint', bev=0.006, segs=1)
    P.box('mid_band', (W + 0.012, D + 0.012, 0.02), (0, 0, 0.345), 'paint', bev=0.004, segs=1)
    # the cabinet: a closed box (paint) with the well under the rotors cut from its top (its walls trim:
    # the cutter's faces take material slot 0) and two dents pressed into it
    bm = bmesh.new()
    K.bm_cube(bm, (W, D, Z1 - Z0), mat4((0, 0, (Z0 + Z1) / 2)))
    for f in bm.faces:
        f.material_index = 1
    cab = P.mesh('cabinet', bm, ['trim', 'paint'], bev=0.016, segs=2)
    well = bmesh.new()
    K.bm_cube(well, (0.32, 0.52, 0.2), mat4((0, 0, 0.80)))
    P.cut(cab, well)
    for (c, n) in (((hx, -0.315, 0.21), (1, 0, 0)), ((-0.23, hy, 0.215), (0, 1, 0))):
        dent = bmesh.new()
        n = V(n)
        K.bm_sphere(dent, 0.085, 12, 6, matrix=Matrix.Translation(V(c) + n * 0.002) @ K.frame_from_z(n) @
                    Matrix.Diagonal((1.0, 0.8, 0.12, 1.0)))
        for f in dent.faces:
            f.material_index = 1
        P.cut(cab, dent)
    # the cutter housing on top: a heavy steel block across the cabinet holding the rotors' bearings, the slot
    # through it (its walls trim, as the well's)
    ZH = 0.85
    bm = bmesh.new()
    K.bm_cube(bm, (0.42, D, ZH - Z1), mat4((0, 0, (Z1 + ZH) / 2)))
    for f in bm.faces:
        f.material_index = 1
    house = P.mesh('housing', bm, ['trim', 'steel'], bev=0.008, segs=2)
    slot = bmesh.new()
    K.bm_cube(slot, (0.32, 0.52, 0.2), mat4((0, 0, ZH)))
    P.cut(house, slot)
    P.bolts([(sx * 0.188, sy * 0.19, ZH) for sx in (-1, 1) for sy in (-1, 1)] + [(sx * 0.188, 0.0, ZH) for sx in (-1, 1)] +
            [(0.0, sy * 0.32, ZH) for sy in (-1, 1)], r=0.0075, h=0.006, washer=False)

    # ---- the hopper on the housing: a short collar, four sloped walls, the rolled lip (an 8 mm sheet)
    zc0, zs, zl = ZH, 0.865, 1.135
    t = 0.008
    rings = [rect_ring(0, 0, 0.32, 0.52, zc0), rect_ring(0, 0, 0.32 + 2 * t, 0.52 + 2 * t, zc0),
             rect_ring(0, 0, 0.32 + 2 * t, 0.52 + 2 * t, zs), rect_ring(0, 0, 0.55 + 2 * t, 0.70 + 2 * t, zl),
             rect_ring(0, 0, 0.55, 0.70, zl), rect_ring(0, 0, 0.32, 0.52, zs)]
    shell(P, 'hopper', rings, 'paint_b', bev=0.005, segs=2, sharp=40.0)
    P.tube('lip', rrect_xy(0, 0, 0.55 + 2 * t + 0.006, 0.70 + 2 * t + 0.006, zl + 0.002, 0.028, seg=2), 0.011, 'paint_b',
           segs=8, closed=True, caps=False)
    # the rubber flap curtain hanging on the back wall from a bar along its top
    def back_x(z):                                 # the back wall's inside face
        return -0.16 - (z - zs) * (0.115 / (zl - zs))
    nb = V((0.115, 0.0, zl - zs)).normalized()
    slope = math.degrees(math.atan2(nb.x, nb.z))
    nb = V((nb.z, 0.0, nb.x))                     # the back wall's inside normal (into the hopper, up)
    P.box('flap_bar', (0.014, 0.56, 0.016), tuple(V((back_x(1.118), 0, 1.118)) + nb * 0.008), 'steel',
          rot=(0, -slope, 0), bev=0.003, segs=1)
    for i in range(6):
        y = -0.2 + 0.08 * i
        lift = 0.006 + 0.004 * (jit(i, 3.0) + 0.5)
        path = [V((back_x(1.112), y, 1.112)) + nb * 0.012, V((back_x(1.03), y, 1.03)) + nb * (0.008 + lift),
                V((back_x(0.975), y, 0.975)) + nb * (0.02 + 2 * lift) + V((0, 0, -0.004))]
        P.tube('flap', path, 1.0, 'rubber', profile=[(-0.003, -0.036), (0.003, -0.036), (0.003, 0.036), (-0.003, 0.036)],
               bend=0.03, sharp=60.0)

    # ---- the rotors in the slot (movers: origin on the shaft axis at its middle; they spin about local Y)
    zr = 0.83
    for (name, x, flip, ph0) in (('ROTOR_A', -0.055, False, 0.0), ('ROTOR_B', 0.055, True, 60.0)):
        parts = [P.cyl('shaft', 0.022, 0.54, (x, 0, zr), 'chrome', axis='Y', segs=6, bev=None)]
        bm = bmesh.new()
        poly = cutter_disc(0.047, 3, flip=flip)
        for i in range(8):
            y = -0.225 + 0.06 * i + (0.03 if flip else 0.0)
            m = (Matrix.Translation((x, y, zr)) @ Matrix.Rotation(math.radians(-90), 4, 'X') @
                 Matrix.Rotation(math.radians(ph0 + 40.0 * i * (-1 if flip else 1)), 4, 'Z'))
            K.bm_prism(bm, poly, 0.024, matrix=m)
        parts.append(P.mesh('cutters', bm, 'steel', sharp=50.0))
        P.mover(name, parts, (x, 0, zr))
    P.empty('M_intake', (0, 0, zl + 0.005))
    P.empty('M_grind', (0, 0, zl + 0.005 - 0.3))

    # ---- the front (+X): control panel, louvres, the output drawer
    xf = hx
    P.box('panel', (0.006, 0.42, 0.14), (xf + 0.003, 0, 0.705), 'trim', bev=0.002, segs=1)
    xp = xf + 0.006
    # the tally counter: a little steel box, a window over four plain number drums, a reset knob
    cy, cz = -0.13, 0.705
    P.box('counter', (0.024, 0.105, 0.052), (xp + 0.012, cy, cz), 'alu', bev=0.005, segs=1)
    bm = bmesh.new()
    for k in range(4):
        K.bm_cyl(bm, 0.0125, 0.0165, segs=10, caps=False,
                 matrix=Matrix.Translation((xp + 0.0175, cy - 0.0285 + 0.019 * k, cz)) @ K.axis_matrix('Y'))
    P.mesh('counter_drums', bm, 'ceramic', sharp=50.0)
    for (sy, sz, y, z) in ((0.086, 0.005, 0.0, 0.0155), (0.086, 0.005, 0.0, -0.0155), (0.005, 0.026, 0.0405, 0.0),
                           (0.005, 0.026, -0.0405, 0.0)):
        P.box('counter_bezel', (0.008, sy, sz), (xp + 0.028, cy + y, cz + z), 'chrome', bev=None)
    bm = bmesh.new()
    bm_rect(bm, 0.076, 0.026, (xp + 0.0315, cy, cz), (1, 0, 0))
    P.mesh('counter_glass', bm, 'glass', sharp=50.0)
    P.cyl('counter_knob', 0.007, 0.012, (xp + 0.012, cy + 0.058, cz), 'chrome', axis='Y', segs=8, bev=None)
    # the lamp (LAMP: the lens), the start button (shrouded), the red mushroom stop
    ly, lz = -0.035, 0.718
    P.lathe('lamp_bezel', [(0.011, 0.0), (0.017, 0.0), (0.017, 0.006), (0.013, 0.009)], loc=(xp, ly, lz),
            material='chrome', axis='X', segs=12, loop=True, sharp=50.0)
    lens = P.lathe('lamp', [(0.0, 0.0145), (0.008, 0.0133), (0.0118, 0.007), (0.0118, -0.002)][::-1], loc=(xp, ly, lz),
                   material='emit', axis='X', segs=12, close='start', sharp=60.0)
    P.mover('LAMP', [lens], (xp + 0.006, ly, lz))
    by, bz = 0.045, 0.705
    P.lathe('start_ring', [(0.017, 0.0), (0.026, 0.0), (0.026, 0.01), (0.021, 0.016), (0.017, 0.016)],
            loc=(xp, by, bz), material='trim', axis='X', segs=12, loop=True, sharp=50.0)
    P.cyl('start', 0.0172, 0.01, (xp + 0.006, by, bz), 'paint_b', axis='X', segs=12, bev=0.0025, bsegs=1)
    sy_ = 0.145
    P.lathe('stop_base', [(0.0, 0.016), (0.024, 0.016), (0.027, 0.011), (0.027, 0.0)][::-1], loc=(xp, sy_, bz),
            material='trim', axis='X', segs=14, close='start', sharp=50.0)
    P.lathe('stop', [(0.0, 0.05), (0.018, 0.048), (0.03, 0.04), (0.034, 0.031), (0.032, 0.026), (0.013, 0.024),
                     (0.012, 0.012)][::-1], loc=(xp, sy_, bz), material='lens_tail', axis='X', segs=12, close='start',
            sharp=50.0)
    # cooling louvres
    lz0, lz1 = 0.40, 0.585
    for (sx, sz, y, z) in ((0.012, 0.012, 0.0, lz1), (0.012, 0.012, 0.0, lz0)):
        P.box('louvre_frame', (sx, 0.52, sz), (xf + 0.006, y, z), 'paint', bev=0.003, segs=1)
    for y in (-0.254, 0.254):
        P.box('louvre_frame', (0.012, 0.012, lz1 - lz0 + 0.012), (xf + 0.006, y, (lz0 + lz1) / 2), 'paint', bev=0.003,
              segs=1)
    bm = bmesh.new()
    bm_rect(bm, 0.5, lz1 - lz0, (xf + 0.001, 0, (lz0 + lz1) / 2), (1, 0, 0))
    P.mesh('louvre_back', bm, 'trim', sharp=50.0)
    for k in range(6):
        z = lz0 + 0.022 + k * (lz1 - lz0 - 0.044) / 5
        P.box('louvre', (0.004, 0.496, 0.034), (xf + 0.009, 0, z), 'paint', rot=(0, -40, 0), bev=None)
    # the output drawer: its opening, the drawer pulled out a little, a heap of shredded bits in it
    oz0, oz1 = 0.125, 0.32
    bm = bmesh.new()
    bm_rect(bm, 0.51, oz1 - oz0, (xf + 0.0006, 0, (oz0 + oz1) / 2), (1, 0, 0))
    P.mesh('drawer_opening', bm, 'trim', sharp=50.0)
    xd = xf + 0.07                                   # the drawer's front wall
    dz0, dz1 = oz0 + 0.008, oz1 - 0.012
    P.box('drawer_floor', (0.17, 0.48, 0.006), (xd - 0.085, 0, dz0 + 0.003), 'steel', bev=None)
    for y in (-0.237, 0.237):
        P.box('drawer_side', (0.17, 0.006, dz1 - dz0), (xd - 0.085, y, (dz0 + dz1) / 2), 'steel', bev=0.002, segs=1)
    P.box('drawer_front', (0.016, 0.5, dz1 - dz0 + 0.012), (xd + 0.008, 0, (dz0 + dz1) / 2 + 0.002), 'paint_b', bev=0.005,
          segs=2)
    P.tube('drawer_pull', bar_path((xd + 0.016, -0.11, 0.25), (xd + 0.04, -0.11, 0.25), (xd + 0.04, 0.11, 0.25),
                                   (xd + 0.016, 0.11, 0.25), 0.01), 0.0065, 'chrome', segs=6, bend=0.0)
    chip_heap(P, (xd - 0.032, 0, dz0 + 0.006), (0.04, 0.2, 0.15), 30, ['steel', 'paint_b', 'plastic_int'], seed=2.0)

    # ---- the drive on the -Y side: the belt guard up to rotor B's shaft, the motor on it, its terminal box
    yg0, yg1 = -hy, -hy - 0.04
    xm, zm, rm = 0.12, 0.31, 0.08
    guard = circles_hull([(0.055, zr, 0.088), (xm, zm, 0.07)], n=18)
    P.prism('guard', [(x, z) for (x, z) in guard], yg0 - yg1, material='steel',
            matrix=mat4((0, (yg0 + yg1) / 2, 0), (90, 0, 0)), bev=0.008, segs=2)
    bm = bmesh.new()
    for (x, z) in ((0.055 - 0.07, zr + 0.05), (0.055 + 0.075, zr + 0.03), (0.055 - 0.06, zr - 0.07), (xm + 0.045, zm + 0.04),
                   (xm - 0.05, zm - 0.02), (xm + 0.02, zm - 0.055)):
        bm_disc(bm, 0.0055, 6, (x, yg1 - 0.0006, z), (0, -1, 0))
    for k in range(4):
        bm_rect(bm, 0.008, 0.07, (0.072 + 0.007 * k, yg1 - 0.0006, 0.6 - 0.025 * k), (0, -1, 0), x_hint=(0.15, 0, -1))
    P.mesh('guard_marks', bm, 'trim', sharp=50.0)
    ym0, ym1 = yg1, yg1 - 0.095                    # the motor's body, its fan cowl beyond
    P.cyl('motor', rm, ym0 - ym1, (xm, (ym0 + ym1) / 2, zm), 'paint_b', axis='Y', segs=16, bev=None, caps=False)
    bm = bmesh.new()
    for i in range(10):
        a = TAU * (i + 0.5) / 10
        K.bm_cube(bm, (0.014, ym0 - ym1 - 0.012, 0.005), Matrix.Translation((xm + (rm + 0.004) * math.cos(a),
                                                                            (ym0 + ym1) / 2, zm + (rm + 0.004) * math.sin(a)))
                  @ Matrix.Rotation(-a, 4, 'Y'))
    P.mesh('motor_fins', bm, 'paint_b', sharp=50.0)
    P.lathe('motor_cowl', [(0.0, 0.028), (0.058, 0.026), (0.078, 0.017), (0.085, 0.006), (0.085, -0.004),
                           (0.076, -0.004)][::-1], loc=(xm, ym1, zm), material='steel', axis='-Y', segs=14, close='start',
            sharp=40.0)
    bm = bmesh.new()
    for i in range(8):
        a = TAU * i / 8
        bm_rect(bm, 0.006, 0.034, (xm + 0.045 * math.cos(a), ym1 - 0.0275, zm + 0.045 * math.sin(a)), (0, -1, 0),
                x_hint=(math.cos(a), 0, math.sin(a)))
    P.mesh('cowl_vents', bm, 'trim', sharp=50.0)
    # its shelf bracket and gussets under it, bolted to the cabinet side
    zs_ = zm - rm - 0.022                           # the shelf the motor stands on
    P.box('motor_shelf', (0.16, ym0 - ym1 + 0.07, 0.012), (xm, -hy - (ym0 - ym1 + 0.07) / 2, zs_), 'steel',
          bev=0.003, segs=1)
    for x in (xm - 0.065, xm + 0.065):
        tri = [(0.0, 0.0), (-0.075, 0.0), (0.0, -0.065)]
        P.prism('gusset', [(-hy + px, zs_ - 0.006 + pz) for (px, pz) in tri], 0.008, material='steel',
                matrix=mat4((x, 0, 0), (90, 0, 90)), bev=None)
    for x in (xm - 0.05, xm + 0.05):
        P.box('motor_foot', (0.024, 0.07, 0.024), (x, (ym0 + ym1) / 2, zs_ + 0.018), 'paint_b', bev=0.002, segs=1)
    # the terminal box on top of the motor, the cable inlet on its front (M_socket: where the cable plugs in)
    tb = V((xm, (ym0 + ym1) / 2, zm + rm + 0.022))
    P.box('term_box', (0.07, 0.062, 0.044), tuple(tb), 'paint_b', bev=0.005, segs=1)
    P.box('term_lid', (0.074, 0.066, 0.008), tuple(tb + V((0, 0, 0.025))), 'paint_b', bev=0.003, segs=1)
    bm = bmesh.new()
    for sx in (-1, 1):
        for sy in (-1, 1):
            bm_disc(bm, 0.004, 6, tb + V((sx * 0.028, sy * 0.024, 0.0295)), (0, 0, 1))
    P.mesh('term_screws', bm, 'steel', sharp=50.0)
    P.cyl('term_inlet', 0.013, 0.016, tuple(tb + V((0.035 + 0.008, 0, -0.002))), 'trim', axis='X', segs=10, bev=None)
    disc(P, 'term_hole', 0.0075, 8, tb + V((0.035 + 0.0162, 0, -0.002)), (1, 0, 0), 'steel')
    P.empty('M_socket', tuple(tb + V((0.035 + 0.0165, 0, -0.002))), rot=(0, 90, 0))

    # ---- the +Y side: the gear cover over the shafts' ends, the bolted inspection door
    cover = circles_hull([(-0.055, zr - 0.008, 0.066), (0.055, zr - 0.008, 0.066)], n=16)
    P.prism('gear_cover', [(x, z) for (x, z) in cover], 0.026, material='paint_b',
            matrix=mat4((0, hy + 0.013, 0), (90, 0, 0)), bev=0.008, segs=2)
    P.bolts([(x, hy + 0.026, z) for (x, z) in ((-0.104, zr - 0.008), (0.104, zr - 0.008), (0.0, zr + 0.044),
                                                (0.0, zr - 0.06))],
            normal=(0, 1, 0), r=0.006, h=0.005, washer=False)
    dx, dz = -0.02, 0.545
    P.box('door', (0.36, 0.01, 0.3), (dx, hy + 0.005, dz), 'paint', bev=0.006, segs=1)
    P.bolts([(dx + sx * 0.16, hy + 0.01, dz + sz * 0.13) for sx in (-1, 1) for sz in (-1, 1)] +
            [(dx + sx * 0.16, hy + 0.01, dz) for sx in (-1, 1)], normal=(0, 1, 0), r=0.006, h=0.005, washer=False)
    P.tube('door_handle', bar_path((dx - 0.06, hy + 0.01, dz + 0.04), (dx - 0.06, hy + 0.036, dz + 0.04),
                                   (dx + 0.06, hy + 0.036, dz + 0.04), (dx + 0.06, hy + 0.01, dz + 0.04), 0.01),
           0.007, 'chrome', segs=6, bend=0.0)
    # ---- the back: a bolted cover plate
    P.box('back_plate', (0.008, 0.3, 0.2), (-hx - 0.004, 0.1, 0.55), 'paint_b', bev=0.004, segs=1)
    P.bolts([(-hx - 0.008, 0.1 + sy * 0.13, 0.55 + sz * 0.08) for sy in (-1, 1) for sz in (-1, 1)], normal=(-1, 0, 0),
            r=0.006, h=0.005, washer=False)
    P.views = [('a', 35, 26), ('b', 215, 28), ('c', -35, 50)]


# ------------------------------------------------------------------------------------------------ workbench

def workbench(P):
    """
    The crafting bench (about 0.75 x 1.6, the top at 0.92, the pegboard up to 1.85; its back, -X, against the
    wall): a thick top of four worn wooden planks on a painted angle-iron frame, the back legs running on up as
    the pegboard's posts; the steel anvil plate let into the middle of the top (M_craft on it; M_eye in front
    of it and above, looking at it); a bench vice on the front +Y corner (cast body, steel jaws, the T-bar slid
    to one side); the pegboard with its holes and a saw, a spanner, pliers and a file on hooks over their painted
    outlines; a bench lamp clamped to the pegboard's top edge reaching over the plate (LAMP: its bulb), its cable
    to the junction box with the socket (M_socket); the lower shelf with a closed toolbox and a few offcuts.
    """
    P.ao_distance = 0.1
    XB, XF, YH = -0.375, 0.375, 0.80             # the footprint's back, front and half-width
    ZT, TH = 0.92, 0.06                          # the top's surface and its thickness
    zu = ZT - TH                                 # under the top
    w, t = 0.05, 0.005                           # the angle iron
    xl, yl = 0.36, 0.79                          # the corner lines of the front legs, the side of the frame
    zs = 0.20                                    # the lower shelf's rails
    # ---- the frame: front legs, back legs running on up as the pegboard's posts, rails, foot plates
    for sy in (-1, 1):
        angle_iron(P, 'leg', (xl, sy * yl, 0.006), (xl, sy * yl, zu), (0, -sy, 0), (-1, 0, 0), step=0.45)
        angle_iron(P, 'post', (XB, sy * yl, 0.006), (XB, sy * yl, 1.85), (0, -sy, 0), (1, 0, 0), step=0.45)
        for x, ux in ((xl, -1), (XB, 1)):
            P.box('foot_plate', (0.065, 0.065, 0.006), (x + ux * 0.0325, sy * (yl - 0.0325), 0.003), 'steel', bev=0.002,
                  segs=1)
        for z in (zu, zs):
            angle_iron(P, 'rail', (XB + w, sy * yl, z), (xl - w, sy * yl, z), (0, -sy, 0), (0, 0, -1), step=0.7)
    for z in (zu, zs):
        angle_iron(P, 'rail', (xl, -yl + w, z), (xl, yl - w, z), (-1, 0, 0), (0, 0, -1), step=0.5)
        angle_iron(P, 'rail', (XB, -yl + w, z), (XB, yl - w, z), (1, 0, 0), (0, 0, -1), step=0.5)
    # ---- the top: four thick planks, the front one worn round, their heights a little uneven
    xt0 = XB + w + 0.003
    pw = (XF - xt0) / 4
    for i in range(4):
        x0, x1 = xt0 + pw * i + 0.001, xt0 + pw * (i + 1) - 0.001
        dz = (0.0, -0.0015, 0.001, -0.001)[i]
        bm = bmesh.new()
        K.bm_cube(bm, (x1 - x0, 2 * YH, TH + dz), mat4(((x0 + x1) / 2, 0, zu + (TH + dz) / 2)))
        long_edges = [e for e in bm.edges if abs((e.verts[0].co - e.verts[1].co).y) > YH]
        bmesh.ops.subdivide_edges(bm, edges=long_edges, cuts=3, use_grid_fill=True)
        P.mesh('plank', bm, 'wood', bev=0.013 if i == 3 else 0.005, segs=2 if i == 3 else 1)
    # the steel anvil plate let into the middle of the top (M_craft at its centre on its surface)
    cx, cy = 0.03, 0.0
    zp = ZT + 0.0015
    P.box('anvil_plate', (0.4, 0.6, 0.012), (cx, cy, zp - 0.006), 'steel', bev=0.003, segs=1)
    bm = bmesh.new()
    for sx in (-1, 1):
        for sy in (-1, 1):
            bm_disc(bm, 0.0065, 8, (cx + sx * 0.18, cy + sy * 0.28, zp + 0.0004), (0, 0, 1))
    P.mesh('plate_screws', bm, 'trim', sharp=50.0)
    P.empty('M_craft', (cx, cy, zp))
    eye = V((cx + 0.62, cy, ZT + 0.55))
    d = (V((cx, cy, zp)) - eye).normalized()
    P.empty('M_eye', tuple(eye), rot=(0, math.degrees(math.atan2(d.x, d.z)), 0))

    # ---- the bench vice on the front +Y corner: base, cast body and jaws, slide, screw, the T-bar
    vx, vy = 0.31, 0.6
    P.cyl('vice_base', 0.064, 0.016, (vx, vy, ZT + 0.008), 'paint_b', segs=14, bev=0.004, bsegs=1)
    P.bolts([(vx + 0.045 * math.cos(a), vy + 0.045 * math.sin(a), ZT + 0.016) for a in (0.6, 2.2, 3.8, 5.4)], r=0.006,
            h=0.005, washer=False)
    P.box('vice_lock', (0.012, 0.05, 0.012), (vx - 0.02, vy - 0.07, ZT + 0.008), 'steel', rot=(0, 0, 20), bev=0.002,
          segs=1)
    P.box('vice_body', (0.15, 0.09, 0.07), (0.305, vy, ZT + 0.016 + 0.035), 'paint_b', bev=0.012, segs=2)
    zj = ZT + 0.105                                # the jaws' middle
    P.box('vice_head', (0.045, 0.13, 0.05), (0.358, vy, zj - 0.004), 'paint_b', bev=0.01, segs=2)
    P.box('jaw_fixed', (0.008, 0.13, 0.034), (0.3845, vy, zj + 0.002), 'steel', bev=0.0015, segs=1)
    P.box('vice_slide', (0.15, 0.056, 0.04), (0.39, vy, ZT + 0.055), 'paint_b', bev=0.006, segs=1)
    P.box('vice_mhead', (0.045, 0.13, 0.05), (0.428, vy, zj - 0.004), 'paint_b', bev=0.01, segs=2)
    P.box('vice_mbody', (0.045, 0.08, 0.06), (0.428, vy, ZT + 0.06), 'paint_b', bev=0.01, segs=1)
    P.box('jaw_moving', (0.008, 0.13, 0.034), (0.4015, vy, zj + 0.002), 'steel', bev=0.0015, segs=1)
    zh = ZT + 0.062
    P.cyl('vice_screw', 0.009, 0.03, (0.465, vy, zh), 'steel', axis='X', segs=8, bev=None)
    P.cyl('vice_hub', 0.016, 0.026, (0.483, vy, zh), 'steel', axis='X', segs=10, bev=None)
    ty0 = vy - 0.1
    P.cyl('vice_bar', 0.0065, 0.25, (0.484, ty0 + 0.125, zh), 'steel', axis='Y', segs=8, bev=None)
    for y in (ty0, ty0 + 0.25):
        P.sphere('bar_end', 0.012, (0.484, y, zh), 'steel', u=8, v=5)

    # ---- the pegboard on the posts (its holes: dark squares), the tools on hooks over their painted outlines
    xb = XB + t + 0.012                          # the board's face (it stands against the posts' back flanges)
    zb0, zb1 = 0.93, 1.85
    P.box('pegboard', (0.012, 2 * (yl - 0.006), zb1 - zb0), (xb - 0.006, 0, (zb0 + zb1) / 2), 'paint_b', bev=0.003,
          segs=1)
    xt = xb + 0.01                               # the tools hang 1 cm off the board
    keep = []                                    # outlines (2D, on the board) the holes keep out of
    hooks = []

    def outline(pts2d, d=0.008):
        hull = offset_poly(hull2d(pts2d), d)
        front_prism(P, 'outline', hull, xb, 0.0008, 'trim')
        keep.append(hull)

    # the saw: the blade hanging down from its wooden handle, the teeth on its left edge
    sc = -0.56
    blade = [(sc + 0.035, 1.64), (sc + 0.035, 1.27), (sc - 0.03, 1.262)]
    nt = 16
    for k in range(1, 2 * nt):
        f = k / (2 * nt)
        y = (sc - 0.03) + ((sc - 0.075) - (sc - 0.03)) * f
        z = 1.262 + (1.64 - 1.262) * f
        blade.append((y - (0.006 if k % 2 else 0.0), z))
    blade.append((sc - 0.075, 1.64))
    front_prism(P, 'saw_blade', blade, xt, 0.004, 'steel')
    hp = [(sc - 0.095, 1.6), (sc + 0.06, 1.6), (sc + 0.075, 1.66), (sc + 0.07, 1.74), (sc + 0.03, 1.785),
          (sc - 0.07, 1.785), (sc - 0.1, 1.74)]
    handle = front_prism(P, 'saw_handle', hp, xt - 0.009, 0.022, 'wood', bev=None)
    hole = bmesh.new()
    K.bm_prism(hole, [(-z, y) for (y, z) in K.rounded_rect(0.085, 0.034, 0.016, seg=3)], 0.06,
               matrix=Matrix.Translation((xt - 0.02, sc - 0.015, 1.722)) @ mat4(rot=(0, 90, 0)), center=False)
    P.cut(handle, hole)
    bm = bmesh.new()
    for (y, z) in ((sc + 0.02, 1.625), (sc - 0.055, 1.625), (sc + 0.045, 1.66)):
        bm_disc(bm, 0.006, 8, (xt + 0.0135, y, z), (1, 0, 0))
    P.mesh('saw_nuts', bm, 'steel', sharp=50.0)
    outline(blade + hp)
    hooks.append((sc - 0.015, 1.742))
    # the spanner: ring end up, the open end down
    pc = -0.3
    z0, z1 = 1.3, 1.52
    front_prism(P, 'spanner', K.rounded_rect(0.018, z1 - z0, 0.006, seg=1), xt, 0.007, 'steel', bev=None)
    P.statics[-1].data.transform(Matrix.Translation((0, pc, (z0 + z1) / 2)))
    ring = front_prism(P, 'spanner_ring', K.circle2d(0.025, 12), xt, 0.008, 'steel', bev=None)
    ring.data.transform(Matrix.Translation((0, pc, z1)))
    jaw = front_prism(P, 'spanner_jaw', K.circle2d(0.028, 12), xt, 0.008, 'steel', bev=None)
    jaw.data.transform(Matrix.Translation((0, pc, z0)))
    slot = bmesh.new()
    K.bm_cube(slot, (0.05, 0.022, 0.05), Matrix.Translation((xt, pc, z0 - 0.022)) @ mat4(rot=(15, 0, 0)))
    P.cut(jaw, slot)
    disc(P, 'spanner_hole', 0.0125, 6, (xt + 0.0084, pc, z1), (1, 0, 0), 'trim')
    outline([(pc + 0.025 * math.cos(a), z1 + 0.025 * math.sin(a)) for a in (i * TAU / 12 for i in range(12))] +
            [(pc + 0.028 * math.cos(a), z0 + 0.028 * math.sin(a)) for a in (i * TAU / 12 for i in range(12))])
    hooks.append((pc, z1 + 0.012))
    # the pliers: hanging jaws down, the handles in red sleeves spread above the pivot
    qc, qz = -0.07, 1.6
    front_prism(P, 'pliers_jaws', [(qc - 0.013, qz), (qc + 0.013, qz), (qc + 0.007, qz - 0.06), (qc, qz - 0.075),
                                   (qc - 0.007, qz - 0.06)], xt, 0.008, 'steel', bev=0.0015, segs=1)
    P.cyl('pliers_pivot', 0.012, 0.012, (xt + 0.005, qc, qz), 'steel', axis='X', segs=10, bev=None)
    for s in (-1, 1):
        a, b = V((qc + s * 0.006, qz + 0.005)), V((qc + s * 0.032, qz + 0.15))
        dd = (b - a).normalized()
        nn = V((-dd.y, dd.x))
        poly = [a - nn * 0.006, a + nn * 0.006, b + nn * 0.004, b - nn * 0.004]
        front_prism(P, 'pliers_handle', [(q.x, q.y) for q in poly], xt + 0.001, 0.006, 'steel', bev=None)
        m0, m1 = a + dd * 0.04, b + dd * 0.004
        sl = [m0 - nn * 0.0095, m0 + nn * 0.0095, m1 + nn * 0.0085, m1 - nn * 0.0085]
        front_prism(P, 'pliers_sleeve', [(q.x, q.y) for q in sl], xt - 0.002, 0.012, 'paint', bev=0.003, segs=1)
    outline([(qc - 0.016, qz), (qc + 0.016, qz), (qc, qz - 0.078), (qc - 0.045, qz + 0.155), (qc + 0.045, qz + 0.155)])
    hooks.append((qc, qz + 0.03))
    # the file: its wooden handle up, the steel blade down
    fc = 0.17
    front_prism(P, 'file_blade', [(fc - 0.011, 1.6), (fc + 0.011, 1.6), (fc + 0.006, 1.36), (fc, 1.345),
                                  (fc - 0.006, 1.36)], xt, 0.006, 'steel', bev=0.001, segs=1)
    P.lathe('file_handle', [(0.0, 0.0), (0.011, 0.001), (0.0135, 0.02), (0.0145, 0.07), (0.0125, 0.105),
                            (0.0, 0.11)], loc=(xt + 0.003, fc, 1.615), material='wood', segs=10, sharp=50.0)
    P.cyl('file_ferrule', 0.0125, 0.014, (xt + 0.003, fc, 1.614), 'steel', segs=10, bev=None)
    outline([(fc - 0.017, 1.73), (fc + 0.017, 1.73), (fc + 0.014, 1.6), (fc, 1.34), (fc - 0.014, 1.6)])
    hooks += [(fc - 0.022, 1.6), (fc + 0.022, 1.6)]
    # a couple of spare hooks
    hooks += [(0.42, 1.7), (0.52, 1.7), (0.47, 1.45)]
    bm = bmesh.new()
    for (y, z) in hooks:
        K.bm_sweep(bm, [V((xb - 0.004, y, z)), V((xt + 0.02, y, z)), V((xt + 0.027, y, z + 0.004)),
                        V((xt + 0.029, y, z + 0.014))], 0.003, segs=4, max_seg=0)
    P.mesh('hooks', bm, 'steel', sharp=60.0)
    bm = bmesh.new()
    for i in range(30):
        y = -0.725 + 0.05 * i
        for j in range(17):
            z = 0.98 + 0.05 * j
            if any(inside2d(poly, (y, z), 0.006) for poly in keep):
                continue
            if 0.6 < y < 0.76 and z < 1.2:              # behind the junction box
                continue
            bm_rect(bm, 0.008, 0.008, (xb + 0.0008, y, z), (1, 0, 0))
    P.mesh('pegboard_holes', bm, 'trim', sharp=50.0)

    # ---- the bench lamp: clamped to the board's top edge, two arms, the shade over the plate (LAMP: the bulb)
    ly = -0.3
    P.box('clamp_top', (0.026, 0.04, 0.012), (xb - 0.004, ly, zb1 + 0.006), 'paint', bev=0.003, segs=1)
    P.box('clamp_jaw', (0.008, 0.04, 0.05), (xb + 0.004, ly, zb1 - 0.019), 'paint', bev=0.002, segs=1)
    P.cyl('clamp_screw', 0.0045, 0.03, (xb + 0.018, ly, zb1 - 0.03), 'steel', axis='X', segs=6, bev=None)
    P.box('clamp_knob', (0.008, 0.03, 0.01), (xb + 0.034, ly, zb1 - 0.03), 'trim', bev=0.002, segs=1)
    piv = V((xb - 0.006, ly, zb1 + 0.012))
    P.cyl('lamp_pivot', 0.009, 0.026, tuple(piv + V((0, 0, 0.013))), 'steel', segs=8, bev=None)
    el = V((-0.12, -0.17, 1.84))
    sh = V((cx, cy, 1.52))
    P.tube('lamp_arm', [piv + V((0, 0, 0.024)), piv + V((0.012, 0.0, 0.034)), el], 0.0075, 'paint', segs=6, bend=0.02)
    P.cyl('lamp_elbow', 0.013, 0.028, tuple(el), 'steel', axis=tuple((el - piv).cross(V((0, 0, 1))).normalized()),
          segs=10, bev=None)
    P.tube('lamp_forearm', [el, sh + V((0, 0, 0.03))], 0.0068, 'paint', segs=6)
    zsh = 1.505
    P.cyl('shade_neck', 0.02, 0.032, (cx, cy, zsh + 0.014), 'paint', segs=12, bev=None)
    P.sphere('shade_knuckle', 0.011, tuple(sh + V((0, 0, 0.032))), 'steel', u=8, v=5)
    prof = [(0.018, 0.0), (0.034, 0.018), (0.062, 0.07), (0.077, 0.1), (0.079, 0.104)]
    P.lathe('shade', K.shell_profile(prof, 0.003), loc=(cx, cy, zsh), material='paint', axis='-Z', segs=16, loop=True,
            sharp=50.0)
    P.lathe('shade_inside', [(0.0745, 0.1), (0.06, 0.072), (0.032, 0.02), (0.0, 0.016)],
            loc=(cx, cy, zsh), material='ceramic', axis='-Z', segs=16, sharp=50.0)
    bulb = P.lathe('bulb', [(0.0, 0.018), (0.011, 0.018), (0.011, 0.034), (0.024, 0.048), (0.028, 0.064),
                            (0.018, 0.084), (0.0, 0.088)], loc=(cx, cy, zsh), material='emit', axis='-Z', segs=10,
                   sharp=60.0)
    P.mover('LAMP', [bulb], (cx, cy, zsh - 0.058))
    # its cable along the board's top edge to the junction box with the socket (M_socket: the cable plugs in)
    jy, jz = 0.68, 1.11
    P.tube('lamp_cable', [(xb - 0.004, ly + 0.025, zb1 + 0.006), (xb - 0.004, 0.62, zb1 + 0.006),
                          (xb + 0.004, jy, zb1 - 0.03), (xb + 0.009, jy, zb1 - 0.12), (xb + 0.012, jy, jz + 0.07)],
           0.0045, 'trim', segs=5, bend=0.0)
    P.box('junction', (0.04, 0.09, 0.11), (xb + 0.02, jy, jz), 'steel', bev=0.005, segs=1)
    P.cyl('junction_gland', 0.009, 0.014, (xb + 0.012, jy, jz + 0.06), 'trim', segs=8, bev=None)
    xj = xb + 0.04
    P.lathe('junction_socket', [(0.0, 0.006), (0.016, 0.006), (0.016, 0.01), (0.021, 0.0085), (0.0215, 0.0)][::-1],
            loc=(xj, jy, jz - 0.012), material='trim', axis='X', segs=12, close='start', sharp=50.0)
    disc(P, 'junction_face', 0.0158, 12, (xj + 0.0068, jy, jz - 0.012), (1, 0, 0), 'ceramic')
    bm = bmesh.new()
    for dy in (-0.0075, 0.0075):
        bm_disc(bm, 0.003, 6, (xj + 0.0074, jy + dy, jz - 0.012), (1, 0, 0))
    P.mesh('junction_pins', bm, 'trim', sharp=50.0)
    P.empty('M_socket', (xj + 0.0072, jy, jz - 0.012), rot=(0, 90, 0))

    # ---- the lower shelf: planks on the rails, a closed toolbox, offcuts
    for k, x in enumerate((-0.2, 0.015, 0.23)):
        bm = bmesh.new()
        K.bm_cube(bm, (0.205, 2 * yl - 0.03, 0.02), mat4((x, 0, zs + 0.01)))
        long_edges = [e for e in bm.edges if abs((e.verts[0].co - e.verts[1].co).y) > 0.7]
        bmesh.ops.subdivide_edges(bm, edges=long_edges, cuts=2, use_grid_fill=True)
        P.mesh('shelf', bm, 'wood', bev=0.004, segs=1)
    zsh0 = zs + 0.02
    tbx, tby = -0.04, -0.4
    P.box('toolbox', (0.2, 0.44, 0.15), (tbx, tby, zsh0 + 0.075), 'paint_b', bev=0.008, segs=1)
    P.box('toolbox_lid', (0.206, 0.446, 0.045), (tbx, tby, zsh0 + 0.15 + 0.0225), 'paint_b', bev=0.012, segs=2)
    P.tube('toolbox_handle', bar_path((tbx, tby - 0.09, zsh0 + 0.19), (tbx + 0.035, tby - 0.09, zsh0 + 0.195),
                                      (tbx + 0.035, tby + 0.09, zsh0 + 0.195), (tbx, tby + 0.09, zsh0 + 0.19), 0.012),
           0.007, 'steel', segs=5, bend=0.0)
    for y in (tby - 0.09, tby + 0.09):
        P.box('toolbox_lug', (0.02, 0.012, 0.016), (tbx, y, zsh0 + 0.193), 'steel', bev=0.002, segs=1)
        P.box('toolbox_latch', (0.006, 0.03, 0.04), (tbx + 0.103, y, zsh0 + 0.145), 'steel', bev=0.002, segs=1)
    P.cyl('toolbox_hinge', 0.006, 0.42, (tbx - 0.102, tby, zsh0 + 0.15), 'steel', axis='Y', segs=6, bev=None)
    for (x, y, z, rz) in ((0.06, 0.36, zsh0 + 0.011, 7), (0.02, 0.42, zsh0 + 0.031, -4)):
        P.box('offcut', (0.09, 0.44, 0.02), (x, y, z), 'wood', rot=(0, 0, rz), bev=0.003, segs=1)
    angle_iron(P, 'offcut_angle', (0.22, 0.3, zsh0), (0.22, 0.62, zsh0), (-1, 0, 0), (0, 0, 1), w=0.04, t=0.005,
               material='steel', step=1.0)
    P.cyl('offcut_pipe', 0.018, 0.34, (-0.22, 0.45, zsh0 + 0.018), 'steel', axis='Y', segs=10, bev=None)
    P.views = [('a', 30, 20), ('b', 210, 22), ('c', -35, 18)]


# ------------------------------------------------------------------------------------------------ the table

MODELS = {
    'generator': generator,
    'recycler': recycler,
    'workbench': workbench,
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


def main(args):
    K.run(MODELS, args, after=_after, out_dir=OUT, geo=False)
