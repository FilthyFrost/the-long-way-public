"""
Drivetrain and exhaust: gearboxes, exhaust systems (docs/MODCAR.md section 2.3).

    blender -b --factory-startup --python tools/blender/build.py -- parts/drivetrain [<id>|all] [--norender]

Gearbox: origin at the bottom centre (the rubber mount pad under the case sits on z = 0), input end (the
bellhousing that bolts to the engine) towards +X, output yoke towards -X.
Exhaust: origin at the centre of the inlet flange (where it meets the engine's downpipe); the system runs
rearwards (-X). Moving pieces: FLAP_L / FLAP_R (rain caps of the side stacks, hinge = origin, they open
by rotating about their local Y).
"""
import math

import bmesh
from mathutils import Matrix, Vector

from parts import _kit as K
from parts._kit import V, mat4


def bolt_ring(P, x, cy, cz, r, n, normal, br=0.006, a0=0.0, material='steel'):
    pts = [(x, cy + r * math.cos(a0 + math.tau * i / n), cz + r * math.sin(a0 + math.tau * i / n)) for i in range(n)]
    P.bolts(pts, normal=normal, r=br, h=br * 0.8, washer=False, material=material)


# ------------------------------------------------------------------------------------------------ gearboxes


def gearbox(P, L=0.52, bell_r=0.165, case_hw=0.095, case_h=0.19, tail_len=0.16, gears=4, shifter='top',
            material='alu'):
    """
    A longitudinal manual gearbox: bellhousing (+X), ribbed main case with a side cover, shift turret on top,
    tapering tail with the output yoke (-X), rubber mount pad under the tail on z = 0.
    """
    P.ao_distance = 0.08
    zc = 0.17                      # shaft centre height above the mount
    xb1 = L / 2                    # front face of the bellhousing
    xb0 = xb1 - 0.15               # where the bell meets the case
    xc0 = xb0 - (L - 0.15 - tail_len)   # back of the main case
    xt1 = xc0 - tail_len
    # bellhousing: a cone with a bolting flange and a dark opening
    bell = [(bell_r * 0.66, xb0 - 0.01), (bell_r * 0.74, xb0 + 0.03), (bell_r * 0.93, xb1 - 0.05),
            (bell_r, xb1 - 0.018), (bell_r + 0.012, xb1 - 0.014), (bell_r + 0.012, xb1), (bell_r * 0.82, xb1),
            (bell_r * 0.8, xb1 - 0.03), (0.0, xb1 - 0.03)]
    P.lathe('bell', bell, loc=(0, 0, zc), material=material, axis='X', segs=28, close='start', sharp=40.0)
    for i in range(8):
        a = math.tau * (i + 0.5) / 8
        P.box('bell_boss', (0.03, 0.022, 0.022),
              (xb1 - 0.03, (bell_r + 0.004) * math.cos(a), zc + (bell_r + 0.004) * math.sin(a)), material,
              rot=(math.degrees(a), 0, 0), bev=0.005, segs=1)
    bolt_ring(P, xb1 + 0.0005, 0, zc, bell_r + 0.004, 8, (1, 0, 0), br=0.0065, a0=math.tau * 0.5 / 8)
    P.cyl('input', 0.016, 0.05, (xb1 - 0.01, 0, zc), 'steel', axis='X', segs=10, bev=None)
    # clutch release arm out of the side of the bell, with a cable
    P.box('fork_boot', (0.04, 0.03, 0.04), (xb0 + 0.07, -bell_r * 0.78, zc - 0.02), 'rubber', bev=0.01, segs=2)
    P.tube('fork', [(xb0 + 0.07, -bell_r * 0.8, zc - 0.02), (xb0 + 0.09, -bell_r * 0.95 - 0.03, zc - 0.10)], 0.009,
           'steel', segs=6)
    P.tube('clutch_cable', [(xb0 + 0.09, -bell_r - 0.03, zc - 0.10), (xb0 + 0.16, -bell_r - 0.02, zc - 0.06),
                            (xb0 + 0.22, -bell_r + 0.02, zc + 0.02)], 0.005, 'trim', segs=6, bend=0.04)
    # main case
    cx = (xb0 + xc0) / 2
    clen = xb0 - xc0 + 0.02
    P.box('case', (clen, case_hw * 2, case_h), (cx, 0, zc - 0.005), material, bev=0.022, segs=3)
    for sg in (-1, 1):
        for i in range(3):
            x = xc0 + clen * (i + 0.5) / 3
            P.box('case_rib', (0.012, 0.014, case_h * 0.8), (x, sg * (case_hw + 0.004), zc - 0.005), material,
                  bev=0.004, segs=1, open='-y' if sg > 0 else '+y')
    # side cover plate with bolts (left, +Y)
    P.box('side_cover', (clen * 0.6, 0.012, case_h * 0.5), (cx, case_hw + 0.012, zc), material, bev=0.006, segs=2)
    pts = []
    for (u, w) in ((-1, -1), (0, -1), (1, -1), (1, 1), (0, 1), (-1, 1)):
        pts.append((cx + u * clen * 0.26, case_hw + 0.018, zc + w * case_h * 0.2))
    P.bolts(pts, normal=(0, 1, 0), r=0.0055, h=0.005, washer=False)
    # fill and drain plugs, reverse switch with its lead
    P.cyl('fill', 0.012, 0.01, (cx - 0.02, -case_hw - 0.004, zc + 0.02), 'steel', axis='-Y', segs=6, bev=None)
    P.cyl('drain', 0.012, 0.01, (cx, 0, zc - case_h / 2 - 0.009), 'steel', segs=6, bev=None)
    P.cyl('rev_switch', 0.011, 0.02, (cx + 0.05, -case_hw - 0.008, zc + 0.05), 'steel', axis='-Y', segs=6, bev=None)
    P.tube('rev_lead', [(cx + 0.05, -case_hw - 0.02, zc + 0.05), (cx + 0.08, -case_hw - 0.03, zc + 0.1),
                        (cx + 0.12, -case_hw - 0.02, zc + 0.12)], 0.004, 'trim', segs=5, bend=0.02)
    # shift turret on top (a floor-shift box: the lever itself is the cab part gl_*)
    if shifter == 'top':
        xs = xc0 + 0.06
        P.box('turret', (0.10, 0.09, 0.06), (xs, 0, zc + case_h / 2 + 0.02), material, bev=0.014, segs=2)
        P.cyl('turret_neck', 0.03, 0.05, (xs - 0.01, 0, zc + case_h / 2 + 0.07), material, segs=16, bev=0.004,
              bsegs=1)
        P.lathe('turret_boot', [(0.034, 0.0), (0.036, 0.012), (0.028, 0.02), (0.03, 0.03), (0.022, 0.04),
                                (0.016, 0.05), (0.0, 0.052)], loc=(xs - 0.01, 0, zc + case_h / 2 + 0.09),
                material='rubber', segs=16, sharp=60.0)
        P.bolts([(xs + sx * 0.04, sy * 0.035, zc + case_h / 2 + 0.051) for sx in (-1, 1) for sy in (-1, 1)],
                normal=(0, 0, 1), r=0.005, h=0.004, washer=False)
    # tail housing and output yoke
    tail = [(0.0, xt1 - 0.02), (0.03, xt1 - 0.02), (0.045, xt1), (0.05, xt1 + 0.02), (0.06, xc0 - 0.05),
            (0.075, xc0 - 0.01), (0.075, xc0 + 0.01)]
    P.lathe('tail', tail, loc=(0, 0, zc), material=material, axis='X', segs=22, sharp=40.0)
    P.lathe('yoke', [(0.0, -0.05), (0.032, -0.05), (0.035, -0.035), (0.03, 0.0), (0.032, 0.012)],
            loc=(xt1 - 0.015, 0, zc), material='steel', axis='X', segs=16, close='end', sharp=40.0)
    for sg in (-1, 1):
        P.box('yoke_ear', (0.035, 0.012, 0.04), (xt1 - 0.07, sg * 0.03, zc), 'steel', bev=0.004, segs=1)
    # speedometer drive with its cable
    P.cyl('speedo', 0.012, 0.03, (xc0 - 0.06, -0.06, zc - 0.03), 'alu', axis='-Y', segs=10, bev=0.002, bsegs=1)
    P.tube('speedo_cable', [(xc0 - 0.06, -0.08, zc - 0.03), (xc0 - 0.03, -0.12, zc - 0.07),
                            (xc0 + 0.04, -0.13, zc - 0.1)], 0.005, 'trim', segs=6, bend=0.03)
    # rubber mount pad on the crossmember under the tail (z = 0)
    xm = xc0 - tail_len * 0.4
    P.box('mount_plate', (0.08, 0.12, 0.012), (xm, 0, zc - 0.05 - 0.07), 'steel', bev=0.003, segs=1)
    P.box('mount_rubber', (0.06, 0.09, 0.05), (xm, 0, 0.065), 'rubber', bev=0.012, segs=2)
    P.box('mount_base', (0.10, 0.16, 0.014), (xm, 0, 0.007), 'steel', bev=0.003, segs=1)
    P.bolts([(xm + sx * 0.035, sy * 0.06, 0.014) for sx in (-1, 1) for sy in (-1, 1)], normal=(0, 0, 1), r=0.006,
            h=0.005, washer=False)
    P.views = [('a', 35, 22), ('b', 215, 22)]


def build_gb_4(P):
    gearbox(P)


def build_gb_3(P):
    """An old three-speed: short, round-shouldered case with a column-shift linkage on its side."""
    gearbox(P, L=0.46, bell_r=0.16, case_hw=0.09, case_h=0.18, tail_len=0.13, shifter='side')
    # side shift levers and linkage rods (column shift)
    for i, x in enumerate((-0.02, 0.04)):
        P.box('shift_lever', (0.012, 0.012, 0.09), (x, 0.108, 0.13), 'steel', rot=(0, 15 - 30 * i, 0), bev=0.003,
              segs=1)
        P.cyl('shift_boss', 0.016, 0.02, (x, 0.1, 0.17), 'alu', axis='Y', segs=12, bev=0.002, bsegs=1)
        P.tube('shift_rod', [(x + 0.01, 0.115, 0.09), (x + 0.12, 0.13, 0.11), (x + 0.3, 0.14, 0.25)], 0.0045, 'steel',
               segs=6, bend=0.05)


def build_gb_5(P):
    """A close-ratio five-speed: longer, heavily ribbed case with the fifth-gear housing bulging before the tail."""
    gearbox(P, L=0.58, bell_r=0.17, case_hw=0.10, case_h=0.20, tail_len=0.17)
    x5 = -0.08
    P.lathe('fifth', [(0.075, x5 - 0.07), (0.088, x5 - 0.055), (0.09, x5 + 0.02), (0.08, x5 + 0.04)], loc=(0, 0, 0.17),
            material='alu', axis='X', segs=22, sharp=40.0)
    for sg in (-1, 1):
        for i in range(4):
            P.box('rib5', (0.008, 0.016, 0.15), (x5 - 0.05 + i * 0.022, sg * 0.09, 0.17), 'alu', bev=0.002, segs=1)


def build_gb_moto(P):
    """A motorcycle five-speed (no reverse): compact alloy case, the front sprocket on the left with a short
    run of chain, the shift lever with its rubber peg, the clutch housing bulge on the right."""
    P.ao_distance = 0.05
    outline = [(-0.13, 0.03), (-0.1, 0.0), (0.08, 0.0), (0.12, 0.04), (0.12, 0.12), (0.08, 0.16), (-0.08, 0.17),
               (-0.13, 0.12)]
    P.prism('case', outline, 0.15, matrix=mat4((0, 0, 0), (90, 0, 0)), material='alu', bev=0.012, segs=2)
    P.box('seam', (0.24, 0.155, 0.006), (0.0, 0.0, 0.09), 'alu', bev=0.002, segs=1)
    P.lathe('clutch', [(0.0, -0.03), (0.045, -0.028), (0.065, -0.014), (0.07, 0.0)], loc=(0.05, -0.075, 0.1),
            material='alu', axis='Y', segs=22, close='end', sharp=40.0)
    for i in range(5):
        a = math.tau * i / 5
        P.bolt((0.05 + 0.058 * math.cos(a), -0.093, 0.1 + 0.058 * math.sin(a)), normal=(0, -1, 0), r=0.0045, h=0.004,
               washer=False)
    # oil-level window and ribs on the clutch cover, cast ribs along the case
    P.cyl('oil_ring', 0.016, 0.004, (0.03, -0.106, 0.075), 'chrome', axis='Y', segs=14, bev=None)
    P.cyl('oil_window', 0.012, 0.002, (0.03, -0.109, 0.075), 'glass_dark', axis='Y', segs=14, bev=None)
    for i in range(3):
        a = math.radians(40 + 25 * i)
        P.box('cover_rib', (0.03, 0.006, 0.006), (0.05 + 0.04 * math.cos(a), -0.104, 0.1 + 0.04 * math.sin(a)), 'alu',
              rot=(0, -math.degrees(a), 0), bev=None)
    for sg in (-1, 1):
        for i in range(4):
            x = -0.09 + i * 0.045
            P.box('case_rib', (0.01, 0.01, 0.06), (x, sg * 0.078, 0.04), 'alu', bev=0.002, segs=1,
                  open='-y' if sg > 0 else '+y')
    P.cyl('kick_boss', 0.018, 0.02, (-0.09, -0.085, 0.12), 'alu', axis='Y', segs=12, bev=0.003, bsegs=1)
    P.cyl('kick_shaft', 0.009, 0.02, (-0.09, -0.1, 0.12), 'steel', axis='Y', segs=8, bev=None)
    # front sprocket with teeth and a run of chain
    sx, sz = -0.06, 0.06
    P.cyl('sprocket', 0.04, 0.008, (sx, 0.088, sz), 'steel', axis='Y', segs=16, bev=None)
    bm = bmesh.new()
    for i in range(15):
        a = math.tau * i / 15
        K.bm_cube(bm, (0.012, 0.008, 0.01), mat4((sx + 0.044 * math.cos(a), 0.088, sz + 0.044 * math.sin(a)),
                                                  (0, -math.degrees(a), 0)))
    P.mesh('teeth', bm, 'steel', sharp=50)
    P.cyl('sprocket_nut', 0.016, 0.012, (sx, 0.097, sz), 'steel', axis='Y', segs=6, bev=None)
    for k in (-1, 1):
        P.box('chain', (0.22, 0.012, 0.012), (sx - 0.11, 0.088, sz + k * 0.046), 'trim', bev=0.003, segs=1)
    # shift lever on the left: spline shaft, the lever forward, the rubber peg
    P.cyl('shift_shaft', 0.008, 0.03, (0.03, 0.085, 0.035), 'steel', axis='Y', segs=8, bev=None)
    P.tube('shift_lever', [(0.03, 0.1, 0.035), (0.1, 0.11, 0.03), (0.17, 0.115, 0.04)], 0.007, 'steel', segs=8,
           bend=0.03)
    P.cyl('shift_peg', 0.011, 0.045, (0.17, 0.14, 0.04), 'rubber', axis='Y', segs=10, bev=0.003, bsegs=1)
    P.tube('neutral_wire', [(-0.1, 0.06, 0.02), (-0.12, 0.07, 0.0), (-0.16, 0.08, -0.01)], 0.003, 'trim', segs=5,
           bend=0.02)
    P.views = [('a', 35, 18), ('b', 215, 18)]


# ------------------------------------------------------------------------------------------------ exhausts


def inlet_flange(P, r=0.025):
    """A two-bolt inlet flange on the origin, facing +X, with the pipe leaving towards -X."""
    poly = [(0.0, 0.07), (-0.03, 0.06), (-0.045, 0.0), (-0.03, -0.06), (0.0, -0.07), (0.03, -0.06), (0.045, 0.0),
            (0.03, 0.06)]
    poly = [(py * 0.9, pz * 0.75) for (pz, py) in reversed(poly)]  # swapping axes mirrors: keep it CCW
    P.prism('flange', poly, 0.01, (-0.005, 0, 0), 'rust', rot=(0, 90, 0), bev=0.003, segs=1)
    P.bolts([(0.0, 0.048, 0.0), (0.0, -0.048, 0.0)], normal=(1, 0, 0), r=0.0065, h=0.006, washer=False)
    P.torus('gasket', r + 0.004, 0.003, loc=(0.001, 0, 0), axis='X', segs=16, rsegs=4, material='steel')


def hanger(P, p, drop=0.06):
    """A rubber exhaust hanger: a steel rod from the pipe up into a rubber donut."""
    p = V(p)
    P.tube('hanger_rod', [p, p + V((0, 0, drop * 0.6))], 0.004, 'steel', segs=5)
    P.torus('hanger', 0.018, 0.007, loc=tuple(p + V((0, 0, drop))), axis='Y', segs=12, rsegs=6, material='rubber')


def muffler(P, x0, x1, y, z, w, h, material='steel'):
    """An oval silencer can along X with rolled seams at its ends and a belly seam."""
    L = x1 - x0
    sec = [(w / 2 * math.cos(math.tau * i / 16), h / 2 * math.sin(math.tau * i / 16)) for i in range(16)]
    bm = bmesh.new()
    path = [V((x0, y, z)), V((x0 + 0.01, y, z)), V((x1 - 0.01, y, z)), V((x1, y, z))]
    rings = K.bm_sweep(bm, path, 1.0, profile=sec, caps=True)
    # the end caps are dished in a little
    for ring in (rings[0], rings[-1]):
        for v in ring:
            v.co = V((v.co.x, y + (v.co.y - y) * 0.94, z + (v.co.z - z) * 0.94))
    o = P.mesh('muffler', bm, material, bev=0.006, segs=2, bev_angle=40)
    for xx in (x0 + 0.012, x1 - 0.012):
        P.lathe('seam', [(1.0, -0.006), (1.04, 0.0), (1.0, 0.006)], loc=(xx, y, z), material=material, axis='X',
                segs=16, sharp=60.0, rot=None)
        seam = P.statics[-1]
        seam.data.transform(Matrix.Translation((xx, y, z)) @ Matrix.Diagonal((1.0, w / 2, h / 2, 1.0)) @
                            Matrix.Translation((-xx, -y, -z)))
    return o


def build_exh_stock(P):
    """Stock exhaust: inlet flange, a 1.6 m pipe with gentle bends, an oval silencer, a turned-down tailpipe."""
    P.ao_distance = 0.06
    r = 0.027
    inlet_flange(P, r)
    pipe = [(0.0, 0, 0), (-0.12, 0, -0.01), (-0.35, 0.02, -0.04), (-0.82, 0.05, -0.04), (-0.93, 0.06, -0.035)]
    P.tube('pipe', pipe, r, 'steel', segs=12, bend=0.12)
    muffler(P, -1.40, -0.92, 0.06, -0.035, 0.27, 0.145)
    tail = [(-1.38, 0.06, -0.035), (-1.46, 0.06, -0.03), (-1.55, 0.05, -0.04), (-1.61, 0.05, -0.07)]
    P.tube('tailpipe', tail, r * 0.95, 'steel', segs=12, bend=0.06)
    P.lathe('tip', [(r * 0.95, 0.0), (r * 1.05, 0.0), (r * 1.08, 0.05), (r * 0.98, 0.05)], loc=(-1.612, 0.05, -0.072),
            material='chrome', rot=(0, -112, 0), segs=14, loop=True, sharp=50.0)
    hanger(P, (-0.6, 0.04, -0.04 + r))
    hanger(P, (-1.5, 0.055, -0.035 + r))
    P.box('heat_plate', (0.3, 0.12, 0.004), (-1.15, 0.06, 0.05), 'steel', bev=0.002, segs=1)
    P.views = [('a', 30, 30), ('b', 210, 30)]


def stack(P, x, y, z0, h, r, side):
    """A vertical chrome stack rising from (x, y, z0) by h, with a slotted heat shield, a clamp and a flap."""
    P.cyl('stack', r, h, (x, y, z0 + h / 2), 'chrome', segs=16, bev=None)
    # heat shield: a split steel sleeve on the outer side with slots
    sh0, sh1 = z0 + 0.10, z0 + 0.62
    bm = bmesh.new()
    K.bm_lathe(bm, [(r + 0.012, sh0), (r + 0.012, sh1)], segs=12, angle=math.radians(200),
               start=math.radians((90 if side > 0 else -90) - 100))
    sleeve = P.mesh('shield', bm, 'steel', sharp=60.0)
    sleeve.data.transform(Matrix.Translation((x, y, 0)))
    for i in range(5):
        zz = sh0 + 0.05 + i * 0.07
        P.box('shield_slot', (0.026, 0.006, 0.055), (x, y + side * (r + 0.013), zz + 0.02), 'trim', bev=None)
    for zz in (sh0 - 0.01, sh1 + 0.01):
        P.torus('band', r + 0.014, 0.004, loc=(x, y, zz), segs=16, rsegs=4, material='steel')
    # mounting clamp and bracket towards the vehicle centre
    zc = z0 + h * 0.62
    P.torus('clamp', r + 0.006, 0.006, loc=(x, y, zc), segs=16, rsegs=5, material='steel')
    P.box('clamp_brk', (0.03, 0.08, 0.02), (x, y - side * (r + 0.04), zc), 'steel', bev=0.004, segs=1)
    # slash-cut top: the flap hinged at the back
    top = z0 + h
    P.cyl('lip', r + 0.004, 0.012, (x, y, top - 0.006), 'chrome', segs=16, bev=0.002, bsegs=1)
    flap = P.cyl('flap', r + 0.008, 0.006, (x, y, top + 0.004), 'steel', segs=16, bev=0.0015, bsegs=1)
    knob = P.box('flap_lug', (0.02, 0.012, 0.012), (x - r - 0.006, y, top + 0.004), 'steel', bev=0.002, segs=1)
    P.mover('FLAP_L' if side > 0 else 'FLAP_R', [flap, knob], (x - r - 0.006, y, top + 0.004))
    P.box('hinge', (0.016, 0.03, 0.012), (x - r - 0.012, y, top - 0.004), 'steel', bev=0.002, segs=1)


def build_exh_side(P):
    """Side stacks: from the inlet a pipe runs back into a Y-collector; two pipes swing out to the sides and
    turn up into tall chrome stacks with heat shields and rain flaps (loud)."""
    P.ao_distance = 0.08
    r = 0.026
    inlet_flange(P, r)
    P.tube('pipe', [(0.0, 0, 0), (-0.30, 0, -0.02), (-0.55, 0, -0.02)], r, 'steel', segs=12, bend=0.1)
    P.lathe('collector', [(r, 0.0), (0.035, -0.04), (0.045, -0.1), (0.045, -0.13)], loc=(-0.55, 0, -0.02),
            material='steel', axis='-X', segs=14, sharp=50.0)
    xs, yst, zs, hs, rs = -1.0, 0.30, 0.06, 1.40, 0.052
    for sg in (-1, 1):
        P.tube('branch', [(-0.66, sg * 0.03, -0.02), (-0.78, sg * 0.16, -0.02), (xs, sg * yst, -0.02),
                          (xs, sg * yst, zs)], 0.033, 'steel', segs=12, bend=0.12)
        P.lathe('reducer', [(0.033, 0.0), (rs, 0.035), (rs, 0.045)], loc=(xs, sg * yst, zs - 0.04),
                material='chrome', segs=16, sharp=50.0)
        stack(P, xs, sg * yst, zs, hs, rs, sg)
    P.views = [('a', 30, 18), ('b', 210, 18)]


def build_exh_sport(P):
    """Sport exhaust: the inlet splits into two pipes that run back into a twin-chamber box silencer with two
    big rolled chrome tips."""
    P.ao_distance = 0.07
    r = 0.025
    inlet_flange(P, r)
    P.tube('pipe', [(0.0, 0, 0), (-0.2, 0, -0.01), (-0.38, 0, -0.02)], r, 'steel', segs=12, bend=0.08)
    P.lathe('split', [(r, 0.0), (0.034, 0.04), (0.04, 0.09)], loc=(-0.38, 0, -0.02), material='steel', axis='-X',
            segs=14, sharp=50.0)
    for sg in (-1, 1):
        P.tube('twin', [(-0.47, sg * 0.022, -0.02), (-0.6, sg * 0.07, -0.025), (-1.12, sg * 0.07, -0.025)], 0.022,
               'steel', segs=12, bend=0.08)
    # resonators on both pipes and the transverse box silencer at the back
    for sg in (-1, 1):
        P.lathe('resonator', [(0.022, 0.0), (0.04, 0.03), (0.042, 0.06), (0.042, 0.24), (0.04, 0.27), (0.022, 0.3)],
                loc=(-0.65, sg * 0.07, -0.025), material='steel', axis='-X', segs=16, sharp=50.0)
    bm = bmesh.new()
    sec = K.rounded_rect(0.34, 0.13, 0.05, seg=4)
    rings = [K.section_x(sec, x, 1.0, 0.0, -0.025) for x in (-1.12, -1.13, -1.42, -1.43)]
    rings[0] = K.section_x(sec, -1.12, 0.94, 0.0, -0.025)
    rings[-1] = K.section_x(sec, -1.43, 0.94, 0.0, -0.025)
    vr, faces = K.bm_loft(bm, rings, cap_start=True, cap_end=True)
    bmesh.ops.recalc_face_normals(bm, faces=faces)
    P.mesh('silencer', bm, 'steel', sharp=40.0)
    P.box('silencer_band', (0.012, 0.35, 0.135), (-1.275, 0.0, -0.025), 'chrome', bev=0.003, segs=1)
    for sg in (-1, 1):
        y = sg * 0.1
        P.tube('tail', [(-1.42, y, -0.03), (-1.52, y, -0.035)], 0.024, 'steel', segs=12)
        P.lathe('tip', [(0.024, 0.0), (0.042, 0.0), (0.046, 0.012), (0.046, 0.12), (0.042, 0.13), (0.036, 0.125),
                        (0.036, 0.01)], loc=(-1.5, y, -0.035), material='chrome', axis='-X', segs=20, loop=True,
                sharp=50.0)
    hanger(P, (-0.8, 0.07, -0.003))
    hanger(P, (-1.3, 0.0, 0.04))
    P.views = [('a', 30, 30), ('b', 210, 30)]


def build_exh_moto(P):
    """Motorcycle exhaust: a chrome header from the exhaust port (the origin) down under the engine, then an
    upswept peashooter silencer along the right side with a slotted heat shield and a hanger."""
    P.ao_distance = 0.05
    r = 0.019
    P.cyl('port_flange', 0.03, 0.01, (0.005, 0, 0), 'chrome', axis='X', segs=14, bev=0.002, bsegs=1)
    P.bolts([(0.011, 0.0, 0.022), (0.011, 0.0, -0.022)], normal=(1, 0, 0), r=0.006, h=0.005, washer=False)
    header = [(0.0, 0, 0), (0.05, 0, -0.03), (0.08, -0.01, -0.12), (0.03, -0.05, -0.22), (-0.12, -0.12, -0.24),
              (-0.35, -0.14, -0.2)]
    P.tube('header', header, r, 'chrome', segs=12, bend=0.06)
    # silencer: a long cone swelling then tapering, swept up about 8 degrees
    up = math.radians(8)
    ax = V((-math.cos(up), 0, math.sin(up)))
    s0 = V((-0.35, -0.14, -0.2))
    prof = [(r, 0.0), (0.032, 0.05), (0.042, 0.12), (0.044, 0.36), (0.04, 0.44), (0.026, 0.48), (0.024, 0.53),
            (0.02, 0.53)]
    m = Matrix.Translation(s0) @ K.axis_matrix(ax)
    bm = bmesh.new()
    K.bm_lathe(bm, prof, segs=18, matrix=m)
    P.mesh('silencer', bm, 'chrome', sharp=40.0)
    # heat shield over the header bend: a curved slotted plate
    bm = bmesh.new()
    sh = Matrix.Translation(V((0.0, -0.075, -0.235))) @ mat4(rot=(0, 90, 0))
    K.bm_lathe(bm, [(0.028, -0.07), (0.028, 0.07)], segs=8, angle=math.radians(150), start=math.radians(-150),
               matrix=sh)
    P.mesh('shield', bm, 'chrome', sharp=60.0)
    for i in range(4):
        P.box('shield_slot', (0.03, 0.006, 0.008), (-0.045 + i * 0.03, -0.1, -0.212), 'trim', bev=None)
    # hanger bracket on the silencer
    hp = s0 + ax * 0.25 + V((0, 0, 0.045))
    P.box('hanger', (0.04, 0.012, 0.06), tuple(hp), 'steel', bev=0.004, segs=1)
    P.bolt(tuple(hp + V((0, 0.006, 0.02))), normal=(0, 1, 0), r=0.006, h=0.005)
    P.views = [('a', 30, 20), ('b', 210, 20)]


PARTS = {
    'gb_4': build_gb_4,
    'gb_3': build_gb_3,
    'gb_5': build_gb_5,
    'gb_moto': build_gb_moto,
    'exh_stock': build_exh_stock,
    'exh_side': build_exh_side,
    'exh_sport': build_exh_sport,
    'exh_moto': build_exh_moto,
}


def main(args):
    K.run(PARTS, args)
