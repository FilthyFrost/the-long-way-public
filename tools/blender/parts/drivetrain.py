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


def gearbox(P, L=0.39, bell_r=0.094, case_hw=0.095, case_h=0.13, tail_len=0.10, shifter='top', material='alu',
            bell_len=0.12, xb1=0.185, zc=0.108, ribs=3):
    """
    A longitudinal manual gearbox: bellhousing (+X), ribbed main case with a side cover (left, +Y), a low shift
    turret on top, tapering tail with the output yoke (-X), rubber mount pad under the tail on z = 0.
    L = bell face to tail end, zc = shaft centre above the mount. Sized for the frames' gearbox spaces
    (the cabin tunnel): everything stays within x [-0.30, 0.20], y +-0.13, z [0, 0.22].
    """
    P.ao_distance = 0.06
    xb0 = xb1 - bell_len           # where the bell meets the case
    xt1 = xb1 - L                  # tail end
    xc0 = xt1 + tail_len           # back of the main case
    # bellhousing: a cone with a bolting flange and a dark opening
    bell = [(bell_r * 0.7, xb0 - 0.01), (bell_r * 0.78, xb0 + 0.025), (bell_r * 0.94, xb1 - 0.04),
            (bell_r, xb1 - 0.014), (bell_r + 0.012, xb1 - 0.011), (bell_r + 0.012, xb1), (bell_r * 0.82, xb1),
            (bell_r * 0.8, xb1 - 0.025), (0.0, xb1 - 0.025)]
    P.lathe('bell', bell, loc=(0, 0, zc), material=material, axis='X', segs=28, close='start', sharp=40.0)
    for i in range(8):
        a = math.tau * (i + 0.5) / 8
        P.box('bell_boss', (0.026, 0.018, 0.018),
              (xb1 - 0.024, (bell_r + 0.003) * math.cos(a), zc + (bell_r + 0.003) * math.sin(a)), material,
              rot=(math.degrees(a), 0, 0), bev=0.004, segs=1)
    bolt_ring(P, xb1 + 0.0005, 0, zc, bell_r + 0.004, 8, (1, 0, 0), br=0.0058, a0=math.tau * 0.5 / 8)
    P.cyl('input', 0.014, 0.04, (xb1 - 0.008, 0, zc), 'steel', axis='X', segs=10, bev=None)
    # clutch release arm out of the right side of the bell, its cable up to an abutment bracket on the bell
    P.box('fork_boot', (0.034, 0.026, 0.034), (xb0 + 0.055, -bell_r * 0.8, zc - 0.015), 'rubber', bev=0.008, segs=2)
    fork_end = (xb0 + 0.075, -bell_r - 0.02, zc - 0.07)
    P.tube('fork', [(xb0 + 0.055, -bell_r * 0.82, zc - 0.015), fork_end], 0.0075, 'steel', segs=6)
    P.tube('clutch_cable', [fork_end, (xb0 + 0.1, -bell_r - 0.022, zc - 0.045),
                            (xb1 - 0.03, -bell_r - 0.016, zc + 0.012)], 0.0045, 'trim', segs=6, bend=0.03)
    P.box('cable_bracket', (0.016, 0.022, 0.02), (xb1 - 0.024, -bell_r - 0.006, zc + 0.016), 'steel', bev=0.002,
          segs=1)
    # main case
    cx = (xb0 + xc0) / 2
    clen = xb0 - xc0 + 0.02
    P.box('case', (clen, case_hw * 2, case_h), (cx, 0, zc - 0.005), material, bev=0.02, segs=3)
    for sg in (-1, 1):
        for i in range(ribs):
            x = xc0 + clen * (i + 0.5) / ribs
            P.box('case_rib', (0.01, 0.012, case_h * 0.8), (x, sg * (case_hw + 0.004), zc - 0.005), material,
                  bev=0.003, segs=1, open='-y' if sg > 0 else '+y')
    # side cover plate with bolts (left, +Y)
    P.box('side_cover', (clen * 0.6, 0.012, case_h * 0.5), (cx, case_hw + 0.01, zc), material, bev=0.005, segs=2)
    pts = []
    for (u, w) in ((-1, -1), (0, -1), (1, -1), (1, 1), (0, 1), (-1, 1)):
        pts.append((cx + u * clen * 0.24, case_hw + 0.016, zc + w * case_h * 0.19))
    P.bolts(pts, normal=(0, 1, 0), r=0.005, h=0.004, washer=False)
    # fill and drain plugs, reverse switch with its lead
    P.cyl('fill', 0.011, 0.01, (cx - 0.02, -case_hw - 0.004, zc + 0.02), 'steel', axis='-Y', segs=6, bev=None)
    P.cyl('drain', 0.011, 0.01, (cx, 0, zc - 0.005 - case_h / 2 - 0.004), 'steel', segs=6, bev=None)
    P.cyl('rev_switch', 0.01, 0.016, (cx + 0.04, -case_hw - 0.006, zc + 0.03), 'steel', axis='-Y', segs=6, bev=None)
    P.tube('rev_lead', [(cx + 0.04, -case_hw - 0.014, zc + 0.03), (cx + 0.06, -case_hw - 0.018, zc + 0.045),
                        (cx + 0.09, -case_hw - 0.014, zc + 0.05)], 0.0035, 'trim', segs=5, bend=0.02)
    # a low shift turret on top (a floor-shift box: the lever itself is the cab part gl_*)
    if shifter == 'top':
        xs = xc0 + 0.055
        zt0 = zc - 0.005 + case_h / 2 - 0.005
        P.box('turret', (0.085, 0.075, 0.026), (xs, 0, zt0 + 0.013), material, bev=0.009, segs=2)
        P.cyl('turret_neck', 0.024, 0.013, (xs - 0.008, 0, zt0 + 0.0315), material, segs=16, bev=0.003, bsegs=1)
        P.lathe('turret_boot', [(0.026, 0.0), (0.027, 0.004), (0.021, 0.008), (0.014, 0.0115), (0.0, 0.0125)],
                loc=(xs - 0.008, 0, zt0 + 0.037), material='rubber', segs=16, sharp=60.0)
        P.bolts([(xs + sx * 0.032, sy * 0.028, zt0 + 0.0265) for sx in (-1, 1) for sy in (-1, 1)],
                normal=(0, 0, 1), r=0.0045, h=0.0035, washer=False)
    # tail housing and output yoke
    tail = [(0.0, xt1 - 0.015), (0.026, xt1 - 0.015), (0.038, xt1), (0.042, xt1 + 0.015), (0.05, xc0 - 0.04),
            (0.062, xc0 - 0.008), (0.062, xc0 + 0.01)]
    P.lathe('tail', tail, loc=(0, 0, zc), material=material, axis='X', segs=22, sharp=40.0)
    P.lathe('yoke', [(0.0, -0.035), (0.027, -0.035), (0.03, -0.026), (0.026, 0.0), (0.028, 0.008)],
            loc=(xt1 - 0.012, 0, zc), material='steel', axis='X', segs=16, close='end', sharp=40.0)
    for sg in (-1, 1):
        P.box('yoke_ear', (0.028, 0.01, 0.034), (xt1 - 0.055, sg * 0.025, zc), 'steel', bev=0.0035, segs=1)
    # speedometer drive with its cable, clipped to the case side
    P.cyl('speedo', 0.011, 0.026, (xc0 - 0.045, -0.05, zc - 0.022), 'alu', axis='-Y', segs=10, bev=0.002, bsegs=1)
    P.tube('speedo_cable', [(xc0 - 0.045, -0.066, zc - 0.022), (xc0 - 0.02, -0.098, zc - 0.05),
                            (xc0 + 0.05, -case_hw - 0.012, zc - 0.058)], 0.0045, 'trim', segs=6, bend=0.03)
    P.box('cable_clip', (0.014, 0.01, 0.016), (xc0 + 0.05, -case_hw - 0.004, zc - 0.058), 'steel', bev=0.002, segs=1)
    # rubber mount pad on the crossmember under the tail (z = 0)
    xm = xc0 - tail_len * 0.45
    P.box('mount_base', (0.09, 0.14, 0.012), (xm, 0, 0.006), 'steel', bev=0.003, segs=1)
    P.box('mount_rubber', (0.05, 0.08, 0.038), (xm, 0, 0.031), 'rubber', bev=0.01, segs=2)
    P.box('mount_plate', (0.07, 0.09, 0.01), (xm, 0, 0.054), 'steel', bev=0.003, segs=1)
    P.bolts([(xm + sx * 0.032, sy * 0.055, 0.012) for sx in (-1, 1) for sy in (-1, 1)], normal=(0, 0, 1), r=0.0055,
            h=0.0045, washer=False)
    P.views = [('a', 35, 22), ('b', 215, 22)]
    return dict(xb0=xb0, xc0=xc0, xt1=xt1, cx=cx, clen=clen, zc=zc)


def build_gb_4(P):
    gearbox(P)


def build_gb_3(P):
    """An old three-speed: short, round-shouldered cast-iron case with a column-shift linkage on its side."""
    case_hw = 0.088
    g = gearbox(P, L=0.335, bell_r=0.09, case_hw=case_hw, case_h=0.125, tail_len=0.085, shifter='side',
                material='steel', bell_len=0.11)
    cx, zc = g['cx'], g['zc']
    # side shift levers on the side cover and their rods forward to the column linkage (column shift)
    yl = case_hw + 0.03
    for i, x in enumerate((cx - 0.028, cx + 0.028)):
        P.cyl('shift_boss', 0.013, 0.016, (x, case_hw + 0.024, zc), 'alu', axis='Y', segs=12, bev=0.002, bsegs=1)
        a = math.radians(14 - 28 * i)
        tip = V((x - 0.055 * math.sin(a), yl, zc - 0.055 * math.cos(a)))
        P.tube('shift_lever', [(x, yl, zc), tuple(tip)], 0.005, 'steel', segs=6)
        end = (g['xb0'] + 0.05, yl, zc + 0.05 + 0.012 * i)
        P.tube('shift_rod', [tuple(tip), (tip.x + 0.06, yl, tip.z + 0.01), end], 0.004, 'steel', segs=6, bend=0.03)
        P.torus('rod_end', 0.007, 0.0025, loc=end, axis='Y', segs=10, rsegs=4, material='steel')


def build_gb_5(P):
    """A close-ratio five-speed: longer, heavily ribbed case with the fifth-gear housing bulging before the tail."""
    g = gearbox(P, L=0.41, bell_r=0.094, case_hw=0.1, case_h=0.135, tail_len=0.12, ribs=4)
    zc, x5 = g['zc'], g['xc0'] - 0.035
    P.lathe('fifth', [(0.058, x5 - 0.05), (0.068, x5 - 0.04), (0.072, x5 + 0.015), (0.062, x5 + 0.03)],
            loc=(0, 0, zc), material='alu', axis='X', segs=22, sharp=40.0)
    for sg in (-1, 1):
        for i in range(4):
            P.box('rib5', (0.007, 0.012, 0.08), (x5 - 0.04 + i * 0.019, sg * 0.068, zc), 'alu', bev=0.002, segs=1)


def build_gb_moto(P):
    """A motorcycle five-speed (no reverse): compact alloy case, the front sprocket on the left with a short
    run of chain, the splined selector shaft sticking out on the left (the foot lever is its own part, gl_foot),
    the clutch housing bulge on the right."""
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
    # the selector shaft on the left with its seal and splined end (gl_foot clamps on a shaft like it)
    P.lathe('shift_seal', [(0.0082, 0.077), (0.0125, 0.077), (0.0135, 0.081), (0.0118, 0.085), (0.0082, 0.085)],
            loc=(0.03, 0.0, 0.035), material='rubber', axis='Y', segs=14, loop=True, sharp=50.0)
    P.cyl('shift_shaft', 0.0075, 0.03, (0.03, 0.092, 0.035), 'steel', axis='Y', segs=12, bev=None)
    star = []
    for i in range(24):
        a = math.tau * i / 24
        r = 0.0076 if i % 2 == 0 else 0.0064
        star.append((r * math.cos(a), r * math.sin(a)))
    P.prism('shift_splines', star, 0.012, matrix=Matrix.Translation((0.03, 0.1, 0.035)) @ K.axis_matrix('Y'),
            material='steel', bev=None, center=True)
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
