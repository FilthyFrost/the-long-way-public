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


PARTS = {
    'seat_bucket': build_seat_bucket,
    'seat_bench': build_seat_bench,
    'seat_toilet': build_seat_toilet,
    'seat_armchair': build_seat_armchair,
}


def main(args):
    K.run(PARTS, args)
