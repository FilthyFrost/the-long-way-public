"""
Seats (docs/MODCAR.md section 2.3).

    blender -b --factory-startup --python tools/blender/build.py -- parts/seats [<id>|all] [--norender]

Origin at the centre of the floor attachment, the occupant faces +X. The empty EYE marks the occupant's eye
(the game takes the eye height from it). Moving pieces: LID (toilet lid, hinge at its back).
"""
import math

import bmesh
from mathutils import Matrix, Vector

from parts import _kit as K
from parts._kit import V, mat4


def rails(P, length=0.47, gauge=0.34, h=0.035, x0=-0.015, material='steel'):
    """Two seat slider rails with their floor feet and adjuster bar."""
    for s in (-1, 1):
        y = s * gauge / 2
        P.box('rail', (length, 0.032, h * 0.55), (x0, y, h * 0.275), material, bev=0.003, segs=1)
        P.box('rail_top', (length * 0.86, 0.022, h * 0.5), (x0 - 0.01, y, h * 0.55 + h * 0.25), material, bev=0.003,
              segs=1)
        for ex in (-1, 1):
            P.box('foot', (0.05, 0.05, 0.006), (x0 + ex * (length / 2 - 0.02), y, 0.003), material, bev=None)
    # the adjuster bar under the front edge
    P.tube('adjust', [(x0 + length / 2 - 0.03, gauge / 2, h * 0.8), (x0 + length / 2 + 0.03, gauge / 2 - 0.03, h * 0.9),
                      (x0 + length / 2 + 0.03, -gauge / 2 + 0.03, h * 0.9), (x0 + length / 2 - 0.03, -gauge / 2, h * 0.8)],
           0.0055, 'steel', segs=6, bend=0.02)


def rolls(P, n, span, length, thick, center, axis, material='fabric', normal='Z', gap=0.004, r=None, rot=(0, 0, 0)):
    """n soft rolls side by side (pleats). axis: the direction the rolls run ('X' or 'Z'); they line up across Y."""
    w = (span - gap * (n - 1)) / n
    out = []
    for i in range(n):
        y = -span / 2 + w / 2 + i * (w + gap)
        if axis == 'X':
            size = (length, w, thick)
            loc = V(center) + V((0, y, 0))
        else:
            size = (thick, w, length)
            loc = V(center) + V((0, y, 0))
        out.append(P.pillow('roll', size, tuple(loc), material, r=r or min(w, thick) * 0.42, sub=1, rot=rot))
    return out


def build_seat_bucket(P):
    """A 1970s bucket seat: vinyl shell with cloth pleats, side bolsters, a headrest on chrome posts."""
    rails(P)
    # seat pan and the risers
    P.box('pan', (0.44, 0.44, 0.03), (0.0, 0, 0.098), 'trim', bev=0.008, segs=2)
    for sx in (-1, 1):
        for sy in (-1, 1):
            P.box('riser', (0.04, 0.02, 0.06), (sx * 0.17 - 0.01, sy * 0.17, 0.06), 'trim', bev=None, open='-z+z')
    # the cushion: base, cloth pleats running fore-aft, bolsters, a front roll
    tilt = 4.0  # front edge up
    P.pillow('cushion', (0.50, 0.50, 0.10), (0.0, 0, 0.165), 'leather', r=0.03, sub=1, rot=(0, -tilt, 0))
    P.pleats('pleats', 0.31, 0.40, 5, 0.022, (-0.03, 0, 0.214), rot=(0, -tilt, 0), crown=0.006)
    for s in (-1, 1):
        P.pillow('bolster', (0.44, 0.09, 0.075), (-0.01, s * 0.205, 0.232), 'leather', r=0.024, sub=1,
                 rot=(0, -tilt, s * -2.0))
    P.pillow('front_roll', (0.07, 0.33, 0.05), (0.207, 0, 0.226), 'leather', r=0.022, sub=1, rot=(0, -tilt, 0))
    # the backrest, reclined about a pivot at the back of the cushion
    rec = 16.0
    piv = V((-0.215, 0, 0.215))
    Rb = Matrix.Rotation(math.radians(-rec), 4, 'Y')

    def at(p):
        return tuple(piv + (Rb @ V(p)))

    rot_b = (0, -rec, 0)
    P.pillow('back', (0.10, 0.50, 0.62), at((-0.04, 0, 0.32)), 'leather', r=0.03, sub=1, rot=rot_b,
             taper=(0.9, 0.86))
    P.pleats('pleats_b', 0.29, 0.50, 5, 0.02, at((0.010, 0, 0.30)), rot=(0, 90 - rec, 0), crown=0.006)
    for s in (-1, 1):
        P.pillow('wing', (0.10, 0.075, 0.48), at((0.025, s * 0.2, 0.27)), 'leather', r=0.026, sub=1,
                 rot=(0, -rec, s * 6.0), taper=(0.75, 0.85))
    # headrest on two chrome posts
    for s in (-1, 1):
        P.tube('post', [at((-0.03, s * 0.065, 0.60)), at((-0.03, s * 0.065, 0.70))], 0.0055, 'chrome', segs=8)
    P.pillow('headrest', (0.075, 0.26, 0.16), at((-0.025, 0, 0.76)), 'leather', r=0.03, sub=1, rot=rot_b)
    P.pleats('head_pad', 0.19, 0.11, 3, 0.012, at((0.014, 0, 0.765)), rot=(0, 90 - rec, 0))
    # hinge covers and the recline lever (outer side +Y)
    for s in (-1, 1):
        P.cyl('hinge', 0.032, 0.014, (piv.x, s * 0.262, piv.z), 'trim', axis='Y', segs=14, bev=0.0025, bsegs=1)
    lv = [(piv.x + 0.02, 0.272, piv.z - 0.005), (piv.x + 0.12, 0.276, piv.z - 0.025), (piv.x + 0.17, 0.276, piv.z - 0.03)]
    P.tube('lever', lv, 0.0055, 'chrome', segs=8, bend=0.03)
    P.sphere('knob', 0.013, lv[-1], 'trim', u=10, v=6, scale=(1.4, 1, 1))
    P.eye((-0.16, 0, 0.90))
    P.ao_distance = 0.10
    P.views = [('a', 35, 16), ('b', 215, 18)]


def build_seat_bench(P):
    """A 1970s bench (the sedan's rear seat, a motorhome dinette): full-width pleated cushion and back, a
    fold-down centre armrest, belt buckles in the crease, a steel frame on two floor brackets."""
    W = 1.20
    P.box('frame', (0.44, W - 0.12, 0.09), (0.0, 0, 0.075), 'trim', bev=0.01, segs=2)
    for sg in (-1, 1):
        P.box('bracket', (0.30, 0.04, 0.03), (0.0, sg * (W / 2 - 0.12), 0.015), 'steel', bev=0.004, segs=1)
        P.bolts([(sx * 0.11, sg * (W / 2 - 0.12), 0.03) for sx in (-1, 1)], normal=(0, 0, 1), r=0.007, h=0.006,
                washer=False)
    tilt = 3.0
    P.pillow('cushion', (0.50, W, 0.11), (0.01, 0, 0.17), 'leather', r=0.035, sub=1, rot=(0, -tilt, 0))
    P.pleats('pleats', W - 0.22, 0.40, 13, 0.022, (-0.015, 0, 0.226), rot=(0, -tilt, 0), crown=0.004)
    P.pillow('front_roll', (0.07, W - 0.16, 0.05), (0.225, 0, 0.222), 'leather', r=0.022, sub=1, rot=(0, -tilt, 0))
    rec = 18.0
    piv = V((-0.22, 0, 0.215))
    Rb = Matrix.Rotation(math.radians(-rec), 4, 'Y')

    def at(p):
        return tuple(piv + (Rb @ V(p)))

    P.pillow('back', (0.10, W, 0.56), at((-0.04, 0, 0.29)), 'leather', r=0.035, sub=1, rot=(0, -rec, 0),
             taper=(0.92, 1.0))
    for sg in (-1, 1):
        P.pleats('pleats_b', 0.40, 0.44, 8, 0.02, at((0.012, sg * 0.30, 0.29)), rot=(0, 90 - rec, 0), crown=0.004)
    # fold-down centre armrest, standing up in its pocket
    P.pillow('armrest', (0.07, 0.17, 0.40), at((0.035, 0, 0.27)), 'leather', r=0.03, sub=1, rot=(0, -rec, 0))
    P.box('arm_tab', (0.01, 0.06, 0.03), at((0.072, 0, 0.44)), 'trim', rot=(0, -rec, 0), bev=0.003, segs=1)
    # two belt buckles and a tongue in the crease
    for y in (-0.33, 0.12):
        P.tube('belt_stalk', [(-0.19, y, 0.21), (-0.17, y, 0.27)], 0.008, 'trim', segs=6)
        P.box('buckle', (0.025, 0.03, 0.05), (-0.163, y, 0.29), 'chrome', rot=(0, -10, 0), bev=0.005, segs=2)
        P.box('buckle_btn', (0.004, 0.018, 0.012), (-0.149, y, 0.295), 'paint', rot=(0, -10, 0), bev=None)
    P.eye((-0.15, 0, 0.88))
    P.ao_distance = 0.12
    P.views = [('a', 35, 16), ('b', 215, 18)]


def build_seat_toilet(P):
    """A real toilet as a seat: oval ceramic bowl on its pedestal, wooden seat ring, the lid (LID, hinged at
    the back, modelled open against the tank), close-coupled cistern with its lid and a chrome flush lever,
    the supply pipe, bolt caps. Origin at the floor under the bowl."""
    P.ao_distance = 0.08
    # pedestal and bowl: a lathe stretched into an egg towards the front
    prof = [(0.0, 0.0), (0.11, 0.0), (0.118, 0.012), (0.105, 0.05), (0.098, 0.14), (0.11, 0.22), (0.15, 0.30),
            (0.175, 0.355), (0.18, 0.375), (0.172, 0.39), (0.15, 0.392), (0.14, 0.38), (0.12, 0.30), (0.08, 0.24),
            (0.05, 0.22), (0.0, 0.22)]
    bm = bmesh.new()
    K.bm_lathe(bm, prof, segs=28)
    for v in bm.verts:
        if v.co.x > 0:
            v.co.x *= 1.32
        else:
            v.co.x *= 1.05
        v.co.x += 0.02
    P.mesh('bowl', bm, 'ceramic', sharp=60.0)
    P.cyl('water', 0.07, 0.002, (0.04, 0, 0.255), 'glass', segs=20, bev=None)
    for sg in (-1, 1):
        P.sphere('bolt_cap', 0.014, (0.0, sg * 0.105, 0.03), 'ceramic', u=10, v=5, scale=(1, 1, 0.7))
    # wooden seat ring
    bm = bmesh.new()
    ring_o = []
    for i in range(28):
        a = math.tau * i / 28
        ring_o.append((0.175 * math.cos(a) * (1.32 if math.cos(a) > 0 else 1.05) + 0.02, 0.172 * math.sin(a)))
    ring_i = []
    for i in range(28):
        a = math.tau * i / 28
        ring_i.append((0.11 * math.cos(a) * (1.36 if math.cos(a) > 0 else 1.0) + 0.04, 0.10 * math.sin(a)))
    zt, zb = 0.418, 0.396
    O = [bm.verts.new((x, y, zt)) for (x, y) in ring_o]
    I = [bm.verts.new((x, y, zt)) for (x, y) in ring_i]
    Ob = [bm.verts.new((x, y, zb)) for (x, y) in ring_o]
    Ib = [bm.verts.new((x, y, zb)) for (x, y) in ring_i]
    n = 28
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((O[i], O[j], I[j], I[i]))
        bm.faces.new((Ob[i], Ib[i], Ib[j], Ob[j]))
        bm.faces.new((O[i], Ob[i], Ob[j], O[j]))
        bm.faces.new((I[i], I[j], Ib[j], Ib[i]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    P.mesh('seat', bm, 'wood', bev=0.006, segs=2)
    # cistern: body, lid, flush lever, supply pipe
    P.box('cistern', (0.17, 0.40, 0.33), (-0.235, 0, 0.575), 'ceramic', bev=0.03, segs=3)
    P.box('cistern_foot', (0.16, 0.22, 0.05), (-0.17, 0, 0.405), 'ceramic', bev=0.015, segs=2)
    P.box('cistern_lid', (0.19, 0.42, 0.03), (-0.235, 0, 0.755), 'ceramic', bev=0.012, segs=2)
    P.cyl('lever_rose', 0.016, 0.01, (-0.148, 0.14, 0.70), 'chrome', axis='X', segs=12, bev=0.002, bsegs=1)
    P.box('lever', (0.012, 0.07, 0.012), (-0.14, 0.11, 0.70), 'chrome', bev=0.004, segs=1)
    P.tube('supply', [(-0.24, 0.16, 0.41), (-0.25, 0.17, 0.25), (-0.27, 0.17, 0.12)], 0.007, 'chrome', segs=8,
           bend=0.04)
    P.cyl('stop_valve', 0.016, 0.03, (-0.27, 0.17, 0.11), 'chrome', segs=10, bev=0.002, bsegs=1)
    # hinge block and the open lid leaning back against the cistern
    P.box('hinge', (0.04, 0.16, 0.02), (-0.09, 0, 0.41), 'chrome', bev=0.004, segs=1)
    hinge = V((-0.095, 0, 0.42))
    lid_poly = []
    for i in range(28):
        a = math.tau * i / 28
        lid_poly.append((0.178 * math.cos(a) * (1.3 if math.cos(a) > 0 else 1.0) + 0.17, 0.175 * math.sin(a)))
    bm = bmesh.new()
    K.bm_prism(bm, lid_poly, 0.022, center=False)
    # lid: built lying flat on the seat (local X forward from the hinge), then swung up about the hinge
    m = Matrix.Translation(hinge) @ Matrix.Rotation(math.radians(-94), 4, 'Y') @ Matrix.Translation((-0.0, 0, 0.0))
    K.bm_transform(bm, m)
    lid = P.mesh('lid', bm, 'wood', bev=0.007, segs=2)
    P.mover('LID', [lid], tuple(hinge))
    P.eye((-0.04, 0, 1.12))
    P.prop('lid_close_deg_y', 94.0)
    P.views = [('a', 35, 18), ('b', 215, 18)]


def build_seat_armchair(P):
    """A cosy fabric armchair: loose seat and back cushions, rolled arms, a skirt, turned wooden feet and a
    lace doily on the back."""
    P.ao_distance = 0.15
    W, D = 0.80, 0.78
    for sx in (-1, 1):
        for sy in (-1, 1):
            P.lathe('foot', [(0.0, 0.0), (0.02, 0.0), (0.026, 0.03), (0.022, 0.06), (0.028, 0.08), (0.0, 0.08)],
                    loc=(sx * (D / 2 - 0.07), sy * (W / 2 - 0.07), 0), material='wood', segs=10, sharp=60.0)
    P.pillow('base', (D, W, 0.26), (0.0, 0, 0.21), 'fabric', r=0.04, sub=1)
    P.pillow('skirt', (D + 0.02, W + 0.02, 0.07), (0.0, 0, 0.115), 'fabric', r=0.02, sub=1)
    # arms: a block with a big roll on top
    for sg in (-1, 1):
        P.pillow('arm', (D - 0.04, 0.15, 0.30), (0.0, sg * (W / 2 - 0.075), 0.47), 'fabric', r=0.05, sub=1)
        P.pillow('arm_roll', (D - 0.02, 0.19, 0.12), (0.01, sg * (W / 2 - 0.07), 0.60), 'fabric', r=0.055, sub=2)
        P.pillow('arm_front', (0.03, 0.17, 0.30), (D / 2 - 0.0, sg * (W / 2 - 0.075), 0.48), 'fabric', r=0.012,
                 sub=1)
    # back: a tall block, tilted, with its own cushion
    rec = 12.0
    P.pillow('back', (0.18, W - 0.02, 0.62), (-D / 2 + 0.09, 0, 0.62), 'fabric', r=0.05, sub=1, rot=(0, -rec, 0),
             taper=(0.95, 0.92))
    P.pillow('back_cushion', (0.13, W - 0.33, 0.48), (-D / 2 + 0.22, 0, 0.62), 'fabric', r=0.05, sub=2,
             rot=(0, -rec, 0))
    P.pillow('seat_cushion', (D - 0.18, W - 0.31, 0.13), (0.06, 0, 0.405), 'fabric', r=0.05, sub=2, rot=(0, -3, 0))
    # lace doily over the top of the back
    P.pillow('doily', (0.10, 0.34, 0.012), (-D / 2 + 0.06, 0, 0.94), 'paint_b', r=0.005, sub=1, rot=(0, -rec - 25, 0))
    P.eye((-0.17, 0, 1.06))
    P.views = [('a', 35, 14), ('b', 215, 18)]


def saddle_section(w, h, n=12, rib=0.0):
    """Cross-section (y, z) of a motorcycle seat: a flat-topped arch on a pan, counter-clockwise from +X;
    rib raises the crown (a pleat) without touching the flanks."""
    pts = []
    for i in range(n + 1):
        t = i / n
        a = math.pi * (t - 0.5)
        y = (w / 2) * math.sin(a)
        c = math.cos(a)
        z = h * (c ** 0.35 if c > 0 else 0.0)
        z += rib * max(0.0, 1 - (2 * y / (w * 0.78)) ** 4)
        pts.append((y, z))
    return list(reversed(pts))


def build_seat_saddle(P):
    """A 1970s dual seat: a long vinyl saddle with a stepped tail and cross pleats moulded into its crown, a
    chrome trim band, a grab strap, the pan with its hinge tabs. Origin at the centre of the pan."""
    P.ao_distance = 0.05
    key = [(0.30, 0.16, 0.05), (0.26, 0.24, 0.085), (0.15, 0.28, 0.10), (0.0, 0.29, 0.10), (-0.12, 0.29, 0.105),
           (-0.20, 0.29, 0.125), (-0.30, 0.28, 0.13), (-0.35, 0.24, 0.115)]

    def at(x):
        for (xa, wa, ha), (xb, wb, hb) in zip(key[1:], key[:-1]):
            if xa <= x <= xb:
                u = (x - xa) / (xb - xa)
                return wa + (wb - wa) * u, ha + (hb - ha) * u
        return key[-1][1], key[-1][2]

    xs = [k[0] for k in key]
    # pleated zone: ribs every 2.6 cm between x = -0.17 and 0.20 (the rider's and the passenger's places)
    rib_x = [0.20 - 0.026 * i for i in range(15)]
    grooves = [round(x + d, 4) for x in rib_x for d in (-0.002, 0.002)]
    crests = [round(x - 0.013, 4) for x in rib_x[:-1]]
    xs = sorted(set([round(x, 4) for x in xs] + grooves + crests))
    stations = []
    for x in xs:
        w, h = at(x)
        rib = 0.009 if any(abs(x - c) < 1e-4 for c in crests) else 0.0
        stations.append((x, w, h, rib))
    rings = [K.section_x(saddle_section(w, h, n=16, rib=rib), x) for (x, w, h, rib) in stations]
    P.loft('saddle', rings, 'leather', cap_start=True, cap_end=True, sharp=55.0, recalc=True)
    P.box('pan', (0.62, 0.25, 0.014), (-0.03, 0.0, 0.004), 'trim', bev=0.004, segs=1)
    for sg in (-1, 1):
        pts = [(x, sg * (w / 2 + 0.002), 0.022) for (x, w, h) in key[1:-1]]
        P.tube('band', pts, 1.0, 'chrome', profile=[(-0.009, -0.0015), (0.009, -0.0015), (0.009, 0.0015),
                                                    (-0.009, 0.0015)], bend=0.04, caps=True, sharp=60.0)
    # grab strap across the middle
    strap = [(-0.20, -0.147, 0.03), (-0.20, -0.145, 0.09), (-0.20, -0.11, 0.132), (-0.20, 0.11, 0.132),
             (-0.20, 0.145, 0.09), (-0.20, 0.147, 0.03)]
    P.tube('strap', strap, 1.0, 'leather', profile=[(-0.016, -0.003), (0.016, -0.003), (0.016, 0.003),
                                                    (-0.016, 0.003)], bend=0.02, caps=True, sharp=60.0)
    for sg in (-1, 1):
        P.cyl('strap_screw', 0.006, 0.004, (-0.20, sg * 0.15, 0.03), 'chrome', axis='Y', segs=8, bev=None)
        P.box('hinge_tab', (0.03, 0.012, 0.03), (0.2, sg * 0.1, -0.012), 'steel', bev=0.003, segs=1)
    P.eye((0.06, 0, 0.84))
    P.views = [('a', 35, 22), ('b', 215, 22)]


def build_seat_race(P):
    """A racing bucket: a one-piece painted shell with tall side bolsters, head wings and harness slots,
    cloth pads, side brackets on slider rails."""
    P.ao_distance = 0.10
    rails(P, length=0.42)
    # shell side profile (x, z), the occupant faces +X
    side = [(0.24, 0.10), (0.25, 0.17), (0.18, 0.22), (0.02, 0.2), (-0.16, 0.24), (-0.22, 0.45), (-0.25, 0.72),
            (-0.29, 0.90), (-0.36, 0.92), (-0.37, 0.80), (-0.33, 0.45), (-0.27, 0.12)]
    for sg in (-1, 1):
        P.prism('shell_side', side, 0.025, matrix=mat4((0, sg * 0.255, 0), (90, 0, 0)), material='paint', bev=0.008,
                segs=2)
    P.box('shell_base', (0.50, 0.50, 0.02), (-0.01, 0.0, 0.11), 'paint', bev=0.008, segs=2, rot=(0, -5, 0))
    rec = 12.0
    P.box('shell_back', (0.025, 0.50, 0.82), (-0.315, 0.0, 0.53), 'paint', bev=0.008, segs=2, rot=(0, -rec, 0))
    P.pillow('pad_base', (0.42, 0.40, 0.06), (0.0, 0.0, 0.15), 'fabric', r=0.025, sub=1, rot=(0, -5, 0))
    for sg in (-1, 1):
        P.pillow('bolster', (0.36, 0.07, 0.09), (0.0, sg * 0.2, 0.19), 'fabric', r=0.03, sub=1, rot=(0, -5, sg * -4))
        P.pillow('back_bolster', (0.08, 0.07, 0.5), (-0.26, sg * 0.2, 0.46), 'fabric', r=0.03, sub=1, rot=(0, -rec, 0))
    P.pillow('pad_back', (0.05, 0.32, 0.58), (-0.285, 0.0, 0.5), 'fabric', r=0.02, sub=1, rot=(0, -rec, 0))
    P.pillow('pad_head', (0.04, 0.30, 0.13), (-0.335, 0.0, 0.86), 'fabric', r=0.015, sub=1, rot=(0, -rec, 0))
    for sg in (-1, 1):
        P.box('harness_slot', (0.03, 0.06, 0.03), (-0.305, sg * 0.09, 0.76), 'trim', bev=0.006, segs=1,
              rot=(0, -rec, 0))
        P.box('bracket', (0.34, 0.012, 0.09), (-0.02, sg * 0.274, 0.08), 'steel', bev=0.003, segs=1)
        P.bolts([(x, sg * 0.282, 0.09) for x in (-0.14, 0.1)], normal=(0, sg, 0), r=0.007, h=0.005, washer=True)
    P.box('crotch_slot', (0.05, 0.06, 0.02), (0.15, 0.0, 0.185), 'trim', bev=0.006, segs=1)
    P.eye((-0.18, 0, 0.80))
    P.views = [('a', 35, 16), ('b', 215, 18)]


def build_seat_office(P):
    """An office chair: five-star base on casters, gas lift, a cloth seat on its shell, a curved back on a
    support bar, T armrests. It swivels."""
    P.ao_distance = 0.08
    for i in range(5):
        a = math.tau * i / 5
        d = V((math.cos(a), math.sin(a), 0))
        bm = bmesh.new()
        K.bm_prism(bm, [(0.0, -0.025), (0.30, -0.016), (0.31, 0.016), (0.0, 0.025)], 0.04,
                   matrix=Matrix.Translation((0, 0, 0.09)) @ Matrix.Rotation(a, 4, 'Z'))
        for v in bm.verts:
            r = math.hypot(v.co.x, v.co.y)
            v.co.z -= r * 0.07
        P.mesh('star_arm', bm, 'trim', bev=0.008, segs=2)
        c = d * 0.3
        P.cyl('caster_stem', 0.008, 0.03, (c.x, c.y, 0.06), 'steel', segs=8, bev=None)
        P.box('caster_fork', (0.05, 0.034, 0.03), (c.x - 0.015 * d.x, c.y - 0.015 * d.y, 0.045), 'trim',
              rot=(0, 0, math.degrees(a)), bev=0.006, segs=1)
        P.cyl('caster', 0.024, 0.026, (c.x - 0.025 * d.x, c.y - 0.025 * d.y, 0.026), 'rubber',
              rot=(90, 0, math.degrees(a)), segs=14, bev=0.004, bsegs=1)
    P.cyl('hub', 0.045, 0.06, (0, 0, 0.08), 'trim', segs=16, bev=0.008, bsegs=2)
    P.cyl('gas_shroud', 0.03, 0.14, (0, 0, 0.18), 'trim', segs=14, bev=0.003, bsegs=1)
    P.cyl('gas_rod', 0.014, 0.1, (0, 0, 0.30), 'chrome', segs=12, bev=None)
    P.box('mechanism', (0.2, 0.18, 0.04), (0.0, 0, 0.37), 'trim', bev=0.008, segs=1)
    P.tube('lift_lever', [(0.0, 0.09, 0.37), (0.05, 0.16, 0.37), (0.1, 0.19, 0.38)], 0.006, 'trim', segs=6, bend=0.02)
    P.pillow('seat_shell', (0.48, 0.48, 0.03), (0.0, 0, 0.405), 'plastic_int', r=0.012, sub=1)
    P.pillow('seat', (0.47, 0.47, 0.075), (0.01, 0, 0.455), 'fabric', r=0.035, sub=2)
    # back support bar and the back
    P.tube('back_bar', [(-0.08, 0, 0.38), (-0.25, 0, 0.39), (-0.27, 0, 0.55)], 0.018, 'trim', segs=10, bend=0.06,
           profile=[(-1.0, -0.4), (1.0, -0.4), (1.0, 0.4), (-1.0, 0.4)])
    P.pillow('back_shell', (0.03, 0.44, 0.48), (-0.29, 0, 0.78), 'plastic_int', r=0.012, sub=1, rot=(0, -8, 0))
    P.pillow('back', (0.06, 0.42, 0.46), (-0.26, 0, 0.78), 'fabric', r=0.025, sub=2, rot=(0, -8, 0))
    for sg in (-1, 1):
        P.tube('arm_post', [(-0.02, sg * 0.21, 0.38), (-0.02, sg * 0.26, 0.42), (-0.02, sg * 0.26, 0.6)], 0.012,
               'trim', segs=8, bend=0.04)
        P.pillow('arm_pad', (0.24, 0.07, 0.03), (0.0, sg * 0.26, 0.615), 'trim', r=0.012, sub=1)
    P.eye((-0.12, 0, 1.12))
    P.prop('swivel', True)
    P.views = [('a', 35, 16), ('b', 215, 18)]


def build_seat_crate(P):
    """A wooden crate as a seat: planked sides with gaps, corner posts, a lid of boards, nails, a stencilled
    band and rope handles."""
    P.ao_distance = 0.06
    L, W, H = 0.46, 0.40, 0.40
    for sx in (-1, 1):
        for sy in (-1, 1):
            P.box('post', (0.04, 0.04, H - 0.02), (sx * (L / 2 - 0.02), sy * (W / 2 - 0.02), H / 2), 'wood', bev=0.004,
                  segs=1)
    for k in range(3):
        z = 0.04 + k * 0.125 + 0.05
        for sg in (-1, 1):
            P.box('plank', (L - 0.012, 0.018, 0.105), (0.0, sg * (W / 2 - 0.004), z), 'wood', bev=0.004, segs=1,
                  rot=(0, 0.6 * (k - 1), 0))
            P.box('plank', (0.018, W - 0.05, 0.105), (sg * (L / 2 - 0.004), 0.0, z), 'wood', bev=0.004, segs=1,
                  rot=(0.6 * (1 - k), 0, 0))
    for i in range(4):
        y = -W / 2 + 0.055 + i * (W - 0.11) / 3
        P.box('lid', (L + 0.01, 0.092, 0.02), (0.0, y, H + 0.005), 'wood', bev=0.004, segs=1, rot=(0, 0, 0.8 * (i - 1.5)))
    P.box('base', (L - 0.02, W - 0.02, 0.02), (0.0, 0.0, 0.012), 'wood', bev=0.003, segs=1)
    bm = bmesh.new()
    for i in range(4):
        y = -W / 2 + 0.055 + i * (W - 0.11) / 3
        for sx in (-1, 1):
            K.bm_cyl(bm, 0.0045, 0.002, segs=6, matrix=Matrix.Translation((sx * (L / 2 - 0.02), y, H + 0.016)))
    P.mesh('nails', bm, 'steel', sharp=60.0)
    P.box('stencil', (0.2, 0.0015, 0.05), (0.04, -(W / 2 + 0.0055), 0.27), 'paint', bev=None)
    P.box('stencil2', (0.12, 0.0015, 0.02), (0.04, -(W / 2 + 0.0055), 0.215), 'paint', bev=None)
    for sx in (-1, 1):
        P.torus('rope', 0.04, 0.008, loc=(sx * (L / 2 + 0.012), 0.0, 0.31), axis='X', segs=16, rsegs=6,
                material='fabric', arc=math.pi, a0=math.pi)
    P.eye((0.0, 0, 1.10))
    P.views = [('a', 35, 18), ('b', 215, 18)]


PARTS = {
    'seat_bucket': build_seat_bucket,
    'seat_bench': build_seat_bench,
    'seat_toilet': build_seat_toilet,
    'seat_armchair': build_seat_armchair,
    'seat_saddle': build_seat_saddle,
    'seat_race': build_seat_race,
    'seat_office': build_seat_office,
    'seat_crate': build_seat_crate,
}


def main(args):
    K.run(PARTS, args)
