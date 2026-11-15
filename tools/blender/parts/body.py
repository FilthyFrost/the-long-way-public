"""
Body add-ons (docs/MODCAR.md section 2.3): bumpers, mirrors, roof items, side armour.

    blender -b --factory-startup --python tools/blender/build.py -- parts/body [<id>|all] [--norender]

Stretch parts are modelled for a nominal box (root property fit_nominal = [length, width, height] m) and
the game scales them to the frame's mount box; the origin is the centre of the face that touches the body:
  bumpers 0.25 x 1.60 x 0.22 (front bumpers extend +X from x = 0, rear bumpers -X), centred on z = 0;
  roof items 1.20 x 1.00 x 0.15 standing on z = 0; armour 2.00 x 0.02 x 0.60, the inner face on y = 0,
  the plates extend outwards to +Y (LEFT side; mirrored for the right), centred on z = 0.
Mirror: the LEFT mirror, origin at its foot on the door, the glass faces -X.
"""
import math

import bmesh
from mathutils import Matrix, Vector

from parts import _kit as K
from parts._kit import V, mat4


def c_section(depth, height, thick, bulge=0.012, n=6):
    """A sheet-metal C section (z, out): the front face bulges outwards, flanges return towards the body."""
    outer = []
    for i in range(n + 1):
        t = i / n
        a = math.pi * (0.5 - t)
        z = height / 2 * math.sin(a)
        out = depth * 0.5 + bulge * math.cos(a) + depth * 0.5 * math.cos(a) ** 0.6
        outer.append((z, out - depth))
    outer = [(height / 2 * 0.98, -depth)] + outer + [(-height / 2 * 0.98, -depth)]
    inner = []
    for (z, o) in reversed(outer):
        inner.append((z * (1 - thick / height * 2.2), o - thick))
    return outer + inner


def blade_path(half_w, front, wrap, back, sign=1.0):
    """Plan path of a bumper (x, y) from -half_w to +half_w with the ends wrapping back towards the body."""
    pts = [(back, -half_w), (front - wrap * 0.55, -half_w + wrap * 0.35), (front - wrap * 0.12, -half_w + wrap),
           (front, -half_w * 0.45), (front + 0.006, 0.0), (front, half_w * 0.45), (front - wrap * 0.12, half_w - wrap),
           (front - wrap * 0.55, half_w - wrap * 0.35), (back, half_w)]
    return [(sign * x, y, 0.0) for (x, y) in pts]


def chrome_bumper(P, sign=1.0, overriders=True, step=False):
    """A 1970s chrome bumper blade with a rubber strip, overriders and brackets (sign -1: rear bumper)."""
    P.ao_distance = 0.06
    path = blade_path(0.80, 0.215, 0.16, 0.035, sign)
    path = K.fillet_path(path, 0.10)
    if sign < 0:
        path = list(reversed(path))
    sec = c_section(0.07, 0.19, 0.006, bulge=0.01, n=7)
    bm = bmesh.new()
    K.bm_sweep(bm, path, 1.0, profile=sec, caps=True)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    P.mesh('blade', bm, 'chrome', sharp=50.0)
    # rubber strip along the front face
    strip = [(0.014, 0.0), (0.016, 0.006), (-0.014, 0.006), (-0.016, 0.0), (-0.014, -0.006), (0.014, -0.006)]
    spath = blade_path(0.76, 0.215 + 0.017, 0.14, 0.09, sign)
    spath = K.fillet_path(spath, 0.10)
    if sign < 0:
        spath = list(reversed(spath))
    bm = bmesh.new()
    K.bm_sweep(bm, spath, 1.0, profile=[(z, o) for (z, o) in strip], caps=True)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    P.mesh('strip', bm, 'rubber', sharp=50.0)
    # brackets back to the body
    for y in (-0.6, -0.3, 0.3, 0.6):
        P.box('bracket', (0.17, 0.035, 0.05), (sign * 0.09, y, -0.01), 'steel', bev=0.006, segs=1)
        P.box('bracket_plate', (0.012, 0.07, 0.09), (sign * 0.006, y, -0.01), 'steel', bev=0.003, segs=1)
        P.bolts([(sign * 0.0125, y + sy * 0.022, -0.01 + sz * 0.03) for sy in (-1, 1) for sz in (-1, 1)],
                normal=(sign, 0, 0), r=0.006, h=0.005, washer=False)
    if overriders:
        for sg in (-1, 1):
            y = sg * 0.42
            P.pillow('overrider', (0.07, 0.055, 0.2), (sign * 0.235, y, 0.02), 'chrome', r=0.024, sub=1,
                     taper=(0.75, 0.85))
            P.pillow('over_tip', (0.03, 0.045, 0.07), (sign * 0.268, y, 0.075), 'rubber', r=0.012, sub=1)
    if step:
        P.box('step_pad', (0.05, 0.36, 0.008), (sign * 0.17, 0.0, 0.098), 'rubber', bev=0.003, segs=1)
        for i in range(6):
            P.box('step_rib', (0.04, 0.006, 0.004), (sign * 0.17, -0.15 + i * 0.06, 0.103), 'rubber', bev=None)


def build_bf_stock(P):
    chrome_bumper(P, 1.0)
    P.fit_nominal(0.25, 1.60, 0.22)
    P.views = [('a', 35, 18), ('b', 160, 18)]


def build_br_stock(P):
    chrome_bumper(P, -1.0, step=True)
    P.cyl('tow_eye', 0.02, 0.05, (-0.2, -0.55, -0.075), 'steel', axis='X', segs=12, bev=0.003, bsegs=1)
    P.torus('tow_ring', 0.024, 0.007, loc=(-0.235, -0.55, -0.075), axis='Y', segs=14, rsegs=6, material='steel')
    P.fit_nominal(0.25, 1.60, 0.22)
    P.views = [('a', 215, 18), ('b', 340, 18)]


def weld(P, p, axis, r):
    P.torus('weld', r, 0.005, loc=p, axis=axis, segs=14, rsegs=4, material='rust')


def build_bf_bullbar(P):
    """A tubular bull bar: lower bar wrapping round the corners, a tall hoop over the grille with two inner
    uprights and a crossbar, a skid plate, heavy brackets, light tabs on top."""
    P.ao_distance = 0.08
    r1, r2 = 0.032, 0.024
    P.tube('lower', [(0.02, -0.80, -0.03), (0.12, -0.74, -0.03), (0.17, -0.55, -0.03), (0.17, 0.55, -0.03),
                     (0.12, 0.74, -0.03), (0.02, 0.80, -0.03)], r1, 'steel', segs=14, bend=0.12)
    hoop = [(0.165, -0.40, -0.03), (0.185, -0.36, 0.30), (0.17, -0.25, 0.42), (0.17, 0.25, 0.42), (0.185, 0.36, 0.30),
            (0.165, 0.40, -0.03)]
    P.tube('hoop', hoop, r1, 'steel', segs=14, bend=0.12)
    for sg in (-1, 1):
        P.tube('upright', [(0.18, sg * 0.13, -0.03), (0.18, sg * 0.13, 0.42)], r2, 'steel', segs=12)
        weld(P, (0.18, sg * 0.13, 0.0), 'Z', r2 + 0.003)
        weld(P, (0.18, sg * 0.13, 0.4), 'Z', r2 + 0.003)
    P.tube('cross', [(0.185, -0.37, 0.17), (0.19, 0.37, 0.17)], r2, 'steel', segs=12)
    # skid plate under the lower bar, with slots
    P.box('skid', (0.16, 0.7, 0.008), (0.1, 0.0, -0.075), 'steel', rot=(0, -12, 0), bev=0.003, segs=1)
    for i in range(5):
        P.box('skid_slot', (0.09, 0.03, 0.004), (0.11, -0.24 + i * 0.12, -0.071), 'trim', rot=(0, -12, 0), bev=None)
    # brackets to the body (attach face x = 0)
    for y in (-0.5, 0.5):
        P.box('mount', (0.18, 0.06, 0.12), (0.08, y, -0.02), 'steel', bev=0.008, segs=1)
        P.box('mount_plate', (0.014, 0.14, 0.18), (0.007, y, -0.02), 'steel', bev=0.003, segs=1)
        P.bolts([(0.014, y + sy * 0.045, -0.02 + sz * 0.06) for sy in (-1, 1) for sz in (-1, 1)], normal=(1, 0, 0),
                r=0.008, h=0.007, washer=True)
    for sg in (-1, 1):
        P.box('light_tab', (0.05, 0.05, 0.008), (0.17, sg * 0.18, 0.455), 'steel', bev=0.002, segs=1)
        P.cyl('tab_hole', 0.008, 0.01, (0.17, sg * 0.18, 0.456), 'trim', segs=10, bev=None)
    P.fit_nominal(0.25, 1.60, 0.22)
    P.views = [('a', 35, 16), ('b', 150, 20)]


def spike(P, base, direction, length, r, material='steel', tip='chrome'):
    """A welded cone spike from base along direction, with a weld ring."""
    d = V(direction).normalized()
    m = Matrix.Translation(V(base) + d * length * 0.45) @ K.axis_matrix(d)
    bm = bmesh.new()
    K.bm_cyl(bm, r, length * 0.9, segs=10, r2=r * 0.12, matrix=m)
    P.mesh('spike', bm, material, sharp=40.0)
    m2 = Matrix.Translation(V(base) + d * (length * 0.9 + 0.006)) @ K.axis_matrix(d)
    bm = bmesh.new()
    K.bm_cyl(bm, r * 0.15, length * 0.1, segs=8, r2=0.0006, matrix=m2)
    P.mesh('spike_tip', bm, tip, sharp=40.0)
    P.torus('weld', r + 0.002, 0.005, loc=tuple(V(base) + d * 0.004), axis=d, segs=12, rsegs=4, material='rust')


def build_bf_ram(P):
    """A spiked ram: a welded V-prow of rusty plate with steel cover plates, rivets and seven spikes."""
    P.ao_distance = 0.10
    plan = [(0.0, -0.80), (0.08, -0.80), (0.27, -0.13), (0.30, 0.0), (0.27, 0.13), (0.08, 0.80), (0.0, 0.80)]
    P.prism('wedge', plan, 0.22, (0, 0, 0), 'rust', bev=0.01, segs=2)
    # cover plates on the two front faces, a nose cap, rivets
    for sg in (-1, 1):
        a = V((0.08, sg * 0.80, 0.0))
        b = V((0.27, sg * 0.13, 0.0))
        mid = (a + b) / 2
        d = (b - a).normalized()
        n = V((d.y, -d.x, 0.0)) * (-sg)
        if n.x < 0:
            n = -n
        L = (b - a).length
        ang = math.degrees(math.atan2(d.y, d.x))
        P.box('cover', (L * 0.92, 0.012, 0.18), tuple(mid + n * 0.008), 'steel', rot=(0, 0, ang), bev=0.004, segs=1)
        rv = []
        for i in range(7):
            p = a + d * (L * (0.08 + 0.84 * i / 6)) + n * 0.015
            rv += [tuple(p + V((0, 0, 0.07))), tuple(p + V((0, 0, -0.07)))]
        P.bolts(rv, normal=tuple(n), r=0.006, h=0.004, washer=False, material='steel')
        for k in range(3):
            t = 0.22 + 0.3 * k
            base = a + d * (L * t) + n * 0.014
            spike(P, tuple(base), tuple(n + V((0.6, 0, 0.0))), 0.20, 0.032)
    P.box('nose', (0.05, 0.27, 0.2), (0.285, 0.0, 0.0), 'steel', bev=0.012, segs=2)
    spike(P, (0.31, 0.0, 0.0), (1, 0, 0), 0.24, 0.04)
    P.box('top_rib', (0.24, 0.02, 0.03), (0.15, 0.0, 0.12), 'rust', bev=0.004, segs=1)
    P.fit_nominal(0.25, 1.60, 0.22)
    P.views = [('a', 35, 20), ('b', 160, 20)]


def build_mir_stock(P):
    """A round chrome door mirror (LEFT): foot on the door, a swan-neck stalk, a chrome head facing back."""
    P.ao_distance = 0.03
    P.pillow('foot', (0.07, 0.03, 0.035), (0.0, 0.012, 0.0), 'chrome', r=0.01, sub=1)
    P.box('gasket', (0.074, 0.004, 0.039), (0.0, 0.002, 0.0), 'trim', bev=0.001, segs=1)
    head = V((-0.03, 0.12, 0.095))
    P.tube('stalk', [(0.0, 0.02, 0.0), (0.0, 0.05, 0.03), (-0.01, 0.09, 0.07), (head.x + 0.02, head.y, head.z)],
           0.009, 'chrome', segs=10, bend=0.04)
    R = 0.06
    P.lathe('shell', [(0.0, 0.032), (0.03, 0.03), (0.05, 0.022), (0.06, 0.01), (0.062, 0.0)][::-1], loc=tuple(head),
            material='chrome', axis='X', segs=24, sharp=50.0)
    P.lathe('bezel', [(0.056, -0.004), (0.063, -0.004), (0.063, 0.002), (0.056, 0.002)], loc=tuple(head),
            material='trim', axis='X', segs=24, loop=True, sharp=50.0)
    P.cyl('glass', 0.056, 0.003, tuple(head + V((-0.003, 0, 0))), 'chrome', axis='X', segs=24, bev=None)
    P.views = [('a', 200, 12), ('b', 40, 15)]


def build_roof_rack(P):
    """A tubular roof rack: perimeter rail, bottom rails and cross bars, posts, a wind fairing at the front,
    four gutter clamps with rubber pads."""
    P.ao_distance = 0.06
    L, W = 1.16, 0.96
    zt, zb = 0.125, 0.07
    rr = 0.08
    per = [(L / 2, 0.0, zt), (L / 2, W / 2, zt), (-L / 2, W / 2, zt), (-L / 2, -W / 2, zt), (L / 2, -W / 2, zt),
           (L / 2, 0.0, zt)]
    P.tube('rail', per, 0.014, 'steel', segs=10, bend=rr)
    for sg in (-1, 1):
        P.tube('side', [(L / 2 - 0.06, sg * (W / 2 - 0.05), zb), (-L / 2 + 0.06, sg * (W / 2 - 0.05), zb)], 0.012,
               'steel', segs=10)
        for x in (-L / 2 + 0.08, -0.15, 0.15, L / 2 - 0.08):
            P.tube('post', [(x, sg * (W / 2 - 0.05), zb), (x, sg * W / 2, zt)], 0.009, 'steel', segs=8)
    for i in range(6):
        x = -L / 2 + 0.1 + (L - 0.2) * i / 5
        P.tube('cross', [(x, -(W / 2 - 0.05), zb), (x, W / 2 - 0.05, zb)], 0.011, 'steel', segs=10)
    # wind fairing at the front
    bm = bmesh.new()
    K.bm_cube(bm, (0.006, W - 0.16, 0.07), mat4((L / 2 - 0.03, 0.0, zt - 0.03), (0, -35, 0)))
    P.mesh('fairing', bm, 'steel', bev=0.003, segs=1)
    # gutter clamps
    for sx in (-1, 1):
        for sg in (-1, 1):
            x, y = sx * (L / 2 - 0.12), sg * (W / 2 - 0.05)
            P.box('clamp', (0.05, 0.04, zb), (x, y, zb / 2), 'steel', bev=0.006, segs=1)
            P.box('pad', (0.06, 0.05, 0.012), (x, y, 0.006), 'rubber', bev=0.003, segs=1)
            P.bolt((x, y + sg * 0.02, zb * 0.6), normal=(0, sg, 0), r=0.006, h=0.005)
    P.fit_nominal(1.20, 1.00, 0.15)
    P.views = [('a', 35, 30), ('b', 215, 30)]


def build_roof_spikes(P):
    """Roof spikes: a welded frame of box sections bolted to the roof, rows of spikes along its edges."""
    P.ao_distance = 0.06
    L, W = 1.10, 0.90
    h = 0.04
    for sg in (-1, 1):
        P.box('bar_side', (L, 0.04, h), (0.0, sg * W / 2, h / 2 + 0.01), 'rust', bev=0.005, segs=1)
    for sx in (-1, 1):
        P.box('bar_end', (0.04, W, h), (sx * L / 2, 0.0, h / 2 + 0.01), 'rust', bev=0.005, segs=1)
    P.box('bar_mid', (0.04, W, h), (0.0, 0.0, h / 2 + 0.01), 'rust', bev=0.005, segs=1)
    for sx in (-1, 1):
        for sg in (-1, 1):
            P.box('foot', (0.08, 0.08, 0.01), (sx * (L / 2 - 0.02), sg * (W / 2 - 0.02), 0.005), 'steel', bev=0.002,
                  segs=1)
            P.bolt((sx * (L / 2 - 0.02), sg * (W / 2 - 0.02), 0.01), r=0.008, h=0.006)
    top = h + 0.01
    for sg in (-1, 1):
        for i in range(5):
            x = -L / 2 + 0.1 + (L - 0.2) * i / 4
            spike(P, (x, sg * W / 2, top), (0.0, sg * 0.45, 1.0), 0.17, 0.026)
    for i in range(4):
        y = -W / 2 + 0.15 + (W - 0.3) * i / 3
        spike(P, (L / 2, y, top), (0.9, 0.0, 0.7), 0.19, 0.028)
    for i in range(3):
        y = -W / 3 + W / 3 * i
        spike(P, (-L / 2, y, top), (-0.6, 0.0, 1.0), 0.15, 0.024)
    P.fit_nominal(1.20, 1.00, 0.15)
    P.views = [('a', 35, 30), ('b', 215, 30)]


def plate(P, poly_xz, y0, thick, material, name='plate', tilt=0.0):
    """An armour plate: a polygon in the XZ plane, from y0 outwards by thick, tilted a little about X."""
    # tilt about the plate's centre line but keep it clear of the body (y >= 0)
    lift = abs(math.sin(math.radians(tilt))) * 0.31
    m = mat4((0, y0 + thick / 2 + lift, 0), (90 + tilt, 0, 0))
    return P.prism(name, [(x, z) for (x, z) in poly_xz], thick, matrix=m, material=material, bev=0.004, segs=2)


def build_arm_plates(P):
    """Steel side armour (LEFT): overlapping cut plates (one rusty, slightly out of line), two welded straps
    across them with big hex bolts, weld beads at the seams."""
    P.ao_distance = 0.05
    t = 0.012
    A = [(-1.0, -0.30), (-0.22, -0.30), (-0.18, 0.24), (-0.93, 0.28), (-1.0, 0.16)]
    B = [(-0.30, -0.28), (0.48, -0.30), (0.50, 0.29), (-0.26, 0.30)]
    C = [(0.38, -0.30), (1.0, -0.25), (1.0, 0.14), (0.86, 0.27), (0.40, 0.25)]
    D = [(-0.66, -0.08), (-0.36, -0.10), (-0.34, 0.12), (-0.64, 0.15)]
    plate(P, A, 0.0, t, 'steel', tilt=1.5)
    plate(P, C, 0.0, t, 'steel', tilt=-1.5)
    plate(P, B, t, t, 'rust')
    plate(P, D, t, t * 0.8, 'steel', name='patch', tilt=2.0)
    # two flat straps across everything, bolted through
    yb = 2 * t
    for z in (-0.19, 0.17):
        P.box('strap', (1.94, 0.01, 0.06), (0.0, yb + 0.005, z), 'steel', bev=0.003, segs=2)
        xs = [-0.9 + 0.3 * i for i in range(7)]
        P.bolts([(x, yb + 0.01, z) for x in xs], normal=(0, 1, 0), r=0.013, h=0.009, washer=True)
    # small rivets round the patch and the corners
    pts = [(-0.63, t * 1.8, -0.05), (-0.37, t * 1.8, -0.07), (-0.36, t * 1.8, 0.09), (-0.62, t * 1.8, 0.12)]
    pts += [(-0.95, t, 0.1), (0.95, t, -0.2), (0.95, t, 0.08), (-0.95, t, -0.24)]
    bm = bmesh.new()
    for p in pts:
        K.bm_sphere(bm, 0.011, u=8, v=4, matrix=Matrix.Translation(p) @ Matrix.Diagonal((1, 0.55, 1, 1)))
    P.mesh('rivets', bm, 'steel', sharp=70.0)
    # weld beads where B overlaps A and C
    P.tube('weld', [(-0.29, 2 * t, -0.27), (-0.255, 2 * t, 0.29)], 0.006, 'rust', segs=6)
    P.tube('weld', [(0.47, 2 * t, -0.29), (0.49, 2 * t, 0.28)], 0.006, 'rust', segs=6)
    P.fit_nominal(2.00, 0.02, 0.60)
    P.views = [('a', -60, 10), ('b', -120, 14)]


PARTS = {
    'bf_stock': build_bf_stock,
    'br_stock': build_br_stock,
    'bf_bullbar': build_bf_bullbar,
    'bf_ram': build_bf_ram,
    'mir_stock': build_mir_stock,
    'roof_rack': build_roof_rack,
    'roof_spikes': build_roof_spikes,
    'arm_plates': build_arm_plates,
}


def main(args):
    K.run(PARTS, args)
