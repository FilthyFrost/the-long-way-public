"""
The cab: steering wheels and handlebars, radios, handbrakes, gear levers, ignition (docs/MODCAR.md 2.3).

    blender -b --factory-startup --python tools/blender/build.py -- parts/cockpit [<id>|all] [--norender]

Steering: origin at the column end, the wheel faces -X (the driver), it turns about X (handlebar: about Z,
the steering-head axis; its origin is the top of the steering head). Dash items (radio, ignition) face -X;
origin at the dash surface. Floor items (handbrake, gear lever): origin at the floor mount; the moving
lever is the child LEVER with its origin on the pivot.
"""
import math

import bmesh
from mathutils import Matrix, Vector

from parts import _kit as K
from parts._kit import V, mat4


def ellipse(a, b, n):
    return [(a * math.cos(math.tau * i / n), b * math.sin(math.tau * i / n)) for i in range(n)]


def wheel_rim(P, R, a, b, x, material='trim', segs=48, rsegs=10, grips=0):
    """The rim of a steering wheel in the YZ plane at X = x: an elliptic section a (radial) x b (axial)."""
    bm = bmesh.new()
    path = [(x, R * math.cos(math.tau * i / segs), R * math.sin(math.tau * i / segs)) for i in range(segs)]
    # section in the frame of the sweep: (normal, binormal); the normal starts along +Z-ish, so use a circle
    # stretched afterwards
    prof = ellipse(1.0, 1.0, rsegs)
    rings = K.bm_sweep(bm, path, 1.0, profile=prof, closed=True, caps=False)
    # shape the section: radial half-axis a, axial half-axis b
    for ring_i, ring in enumerate(rings):
        c = V(path[ring_i])
        rad = V((0, c.y, c.z)).normalized()
        for v in ring:
            off = v.co - c
            ax = off.x
            rr = off.dot(rad)
            v.co = c + rad * rr * a + V((ax * b, 0, 0))
    return P.mesh('rim', bm, material, sharp=80.0)


def build_steer_std(P):
    """A 1970s three-spoke wheel: black rim, brushed spokes, a padded horn boss with a chrome emblem."""
    R = 0.182
    xr = -0.072  # rim plane (dished towards the driver)
    wheel_rim(P, R, 0.0135, 0.012, xr, 'trim', segs=40, rsegs=10)
    # spokes at 3, 9 and 6 o'clock as seen by the driver (looking along +X: right = -Y, up = +Z)
    hub_r, hub_x = 0.040, -0.040
    for ang in (0.0, 180.0, 270.0):
        a = math.radians(ang)
        d = V((0, -math.cos(a), math.sin(a)))  # 0 deg = driver's right (-Y)
        p0 = V((hub_x - 0.004, 0, 0)) + d * (hub_r - 0.006)
        p1 = V((xr + 0.002, 0, 0)) + d * (R - 0.004)
        L = (p1 - p0).length
        # a tapered flat bar: wide at the boss, narrow at the rim
        w0, w1, th = 0.050, 0.030, 0.0055
        poly = [(0, -w0 / 2), (L, -w1 / 2), (L, w1 / 2), (0, w0 / 2)]
        bm = bmesh.new()
        K.bm_prism(bm, poly, th)
        xdir = (p1 - p0).normalized()
        side = V((1, 0, 0)).cross(d).normalized()
        zdir = xdir.cross(side).normalized()
        m = Matrix((xdir, side, zdir)).transposed().to_4x4()
        m.translation = p0
        K.bm_transform(bm, m)
        P.mesh('spoke', bm, 'alu', bev=0.0016, segs=2)
        # a slot in each spoke (reads as a lightening hole): a dark inset strip
        bm = bmesh.new()
        K.bm_prism(bm, K.rounded_rect(L * 0.42, 0.010, 0.0049, seg=3), th * 0.5)
        m2 = m @ Matrix.Translation((L * 0.5, 0, -th * 0.42))
        K.bm_transform(bm, m2)
        P.mesh('slot', bm, 'trim', sharp=60)
    # the boss: column adapter, a padded horn button and its chrome emblem
    P.lathe('boss', [(0.0, 0.006), (0.020, 0.006), (0.046, 0.0), (0.050, -0.012), (0.049, -0.030), (0.044, -0.040),
                     (0.0, -0.040)][::-1], material='trim', axis='X', segs=24, sharp=50.0)
    pad = [(0.0, -0.064), (0.022, -0.0625), (0.038, -0.058), (0.047, -0.050), (0.050, -0.042), (0.047, -0.036)]
    P.lathe('pad', pad, material='leather', axis='X', segs=24, close='end', sharp=60.0)
    P.lathe('emblem', [(0.0, -0.0655), (0.012, -0.0648), (0.016, -0.0630), (0.016, -0.0600)], material='chrome',
            axis='X', segs=16, close='end', sharp=50.0)
    P.lathe('ring', [(0.0175, -0.0635), (0.0215, -0.0632), (0.0215, -0.0605), (0.0175, -0.0605)], material='chrome',
            axis='X', segs=16, loop=True, sharp=50.0)
    P.cyl('shaft', 0.011, 0.024, (0.012, 0, 0), 'steel', axis='X', segs=12, bev=None)
    # chrome horn ring in front of the spokes, held by two little tabs
    P.torus('horn_ring', 0.112, 0.0042, loc=(-0.066, 0, 0), axis='X', segs=40, rsegs=6, material='chrome')
    for ang in (90.0, 270.0):
        a = math.radians(ang)
        d = V((0, -math.cos(a + math.radians(35)), math.sin(a + math.radians(35))))
        P.tube('ring_tab', [V((-0.052, 0, 0)) + d * 0.045, V((-0.064, 0, 0)) + d * 0.108], 0.0035, 'chrome', segs=6)
    P.prop('steer_axis', 'X')
    P.ao_distance = 0.05
    P.views = [('a', 200, 16), ('b', 120, 20)]


def build_steer_ship(P):
    """A wooden ship's wheel (diameter about 0.6 m over the handles): turned spokes that run on through the
    rim as handles, a brass-banded hub and rim."""
    P.ao_distance = 0.06
    xr = -0.05
    Rr = 0.205
    # the wooden rim with a brass band on its driver face
    wheel_rim(P, Rr, 0.022, 0.017, xr, 'wood', segs=32, rsegs=8)
    P.torus('band', Rr, 0.0045, loc=(xr - 0.016, 0, 0), axis='X', segs=32, rsegs=4, material='chrome')
    # eight turned spokes: hub -> rim -> handle
    prof = [(0.0, 0.035), (0.016, 0.035), (0.018, 0.07), (0.014, 0.11), (0.016, Rr + 0.03),
            (0.019, Rr + 0.04), (0.013, Rr + 0.052), (0.023, Rr + 0.072), (0.019, Rr + 0.092), (0.0, Rr + 0.099)]
    for i in range(8):
        a = math.tau * i / 8 + math.tau / 16
        # spoke along the radial direction in the YZ plane, slightly dished towards the driver
        d = V((0, math.cos(a), math.sin(a)))
        m = Matrix.Translation((xr * 0.6, 0, 0)) @ K.frame_from_z(d, (1, 0, 0))
        bm = bmesh.new()
        K.bm_lathe(bm, prof, segs=7, matrix=m)
        P.mesh('spoke', bm, 'wood', sharp=70.0)
    # hub: wooden drum with brass faces and a brass boss
    P.lathe('hub', [(0.0, 0.024), (0.062, 0.024), (0.066, 0.016), (0.066, -0.016), (0.062, -0.024),
                    (0.0, -0.024)][::-1], loc=(xr * 0.6, 0, 0), material='wood', axis='X', segs=24, sharp=40.0)
    for sx in (-1, 1):
        P.lathe('hub_band', [(0.068, -0.004), (0.072, 0.0), (0.068, 0.004), (0.06, 0.004), (0.06, -0.004)],
                loc=(xr * 0.6 + sx * 0.02, 0, 0), material='chrome', axis='X', segs=24, loop=True, sharp=50.0)
    P.lathe('boss', [(0.0, -0.05), (0.022, -0.048), (0.032, -0.038), (0.036, -0.028), (0.034, -0.02)],
            loc=(xr * 0.6, 0, 0), material='chrome', axis='X', segs=18, close='end', sharp=50.0)
    P.cyl('shaft', 0.013, 0.05, (0.0, 0, 0), 'steel', axis='X', segs=12, bev=None)
    P.prop('steer_axis', 'X')
    P.views = [('a', 200, 16), ('b', 120, 20)]


def build_radio_old(P):
    """A 1970s car radio: chrome-framed black faceplate, a lit tuning scale behind glass with a red needle,
    five chrome preset buttons, two knobs (KNOB_L volume, KNOB_R tuning; they turn about X). Origin at the
    dash surface: the face sits in front (-X), the box goes into the dash (+X)."""
    P.ao_distance = 0.03
    W, H = 0.19, 0.058
    P.box('box', (0.13, 0.17, 0.048), (0.068, 0, 0), 'steel', bev=0.004, segs=1)
    for i in range(6):
        P.box('slot', (0.07, 0.006, 0.003), (0.075, -0.06 + i * 0.024, 0.0245), 'trim', bev=None, open='-z')
    P.box('bracket', (0.012, 0.05, 0.03), (0.138, 0, 0), 'steel', bev=0.002, segs=1)
    P.box('face', (0.014, W, H), (-0.007, 0, 0), 'trim', bev=0.006, segs=2)
    P.box('frame', (0.004, W - 0.006, 0.006), (-0.0145, 0, H / 2 - 0.006), 'chrome', bev=0.0015, segs=1)
    P.box('frame', (0.004, W - 0.006, 0.006), (-0.0145, 0, -H / 2 + 0.006), 'chrome', bev=0.0015, segs=1)
    # tuning scale under glass, the needle, the station marks
    P.box('scale', (0.002, 0.10, 0.022), (-0.0142, 0, 0.008), 'gauge', bev=None)
    for i in range(9):
        P.box('mark', (0.001, 0.0015, 0.008 if i % 2 else 0.012), (-0.0155, -0.042 + i * 0.0105, 0.012), 'trim',
              bev=None)
    P.box('needle', (0.001, 0.0018, 0.02), (-0.0158, 0.012, 0.008), 'paint', bev=None)
    P.box('glass', (0.002, 0.104, 0.026), (-0.0162, 0, 0.008), 'glass', bev=0.001, segs=1)
    # preset buttons
    for i in range(5):
        P.box('button', (0.012, 0.016, 0.011), (-0.019, -0.04 + i * 0.02, -0.017), 'chrome', bev=0.0025, segs=2)
    # knobs on their shafts
    for (nm, y) in (('KNOB_L', 0.077), ('KNOB_R', -0.077)):
        sh = P.cyl('shaft', 0.003, 0.012, (-0.02, y, 0.0), 'steel', axis='X', segs=8, bev=None)
        k1 = P.lathe('knob', [(0.0, -0.022), (0.011, -0.022), (0.0135, -0.019), (0.0135, -0.004), (0.011, 0.0)],
                     loc=(-0.015, y, 0.0), material='chrome', axis='X', segs=16, close='end', sharp=40.0)
        k2 = P.cyl('knob_cap', 0.008, 0.002, (-0.0375, y, 0.0), 'trim', axis='X', segs=12, bev=None)
        P.mover(nm, [k1, k2], (-0.015, y, 0.0))
    P.views = [('a', 210, 14), ('b', 140, 18)]


def build_hb_stock(P):
    """A floor handbrake: bolted bracket with the ratchet quadrant, a plastic cover, the lever (LEVER, pivot at
    its front; pulled = +25 deg about its local Y) with a grip and a release button. Origin at the floor."""
    P.ao_distance = 0.04
    P.box('base', (0.22, 0.07, 0.012), (0.0, 0, 0.006), 'steel', bev=0.003, segs=1)
    P.bolts([(sx * 0.09, sy * 0.022, 0.012) for sx in (-1, 1) for sy in (-1, 1)], normal=(0, 0, 1), r=0.006, h=0.005,
            washer=False)
    for sg in (-1, 1):
        poly = [(-0.05, 0.0), (0.1, 0.0), (0.1, 0.055), (0.07, 0.075), (-0.02, 0.06), (-0.05, 0.03)]
        P.prism('cheek', poly, 0.004, matrix=mat4((0, sg * 0.022, 0.012), (90, 0, 0)), material='steel', bev=0.0015,
                segs=1)
    # ratchet quadrant: a toothed sector
    poly = []
    for i in range(13):
        a = math.radians(95 + i * 6)
        rr = 0.07 if i % 2 == 0 else 0.064
        poly.append((0.08 + rr * math.cos(a), 0.065 + rr * math.sin(a) - 0.065))
    poly += [(0.08 - 0.03, 0.0), (0.08, 0.0)]
    P.prism('ratchet', poly, 0.004, matrix=mat4((0.0, 0.0, 0.012), (90, 0, 0)), material='steel', bev=None)
    P.pillow('cover', (0.24, 0.09, 0.05), (-0.005, 0, 0.03), 'plastic_int', r=0.018, sub=1, taper=(0.92, 0.8))
    # the lever: pressed channel, grip, release button
    piv = V((0.08, 0, 0.065))
    a = math.radians(12)
    d = V((-math.cos(a), 0, math.sin(a)))
    L = 0.30
    parts = []
    bm = bmesh.new()
    K.bm_cube(bm, (L, 0.022, 0.018), mat4(tuple(piv + d * (L / 2)), (0, math.degrees(a), 0)))
    parts.append(P.mesh('lever', bm, 'steel', bev=0.004, segs=2))
    grip_c = piv + d * (L - 0.06)
    parts.append(P.pillow('grip', (0.12, 0.032, 0.032), tuple(grip_c), 'trim', r=0.014, sub=1,
                          rot=(0, math.degrees(a), 0)))
    tip = piv + d * (L + 0.003)
    parts.append(P.cyl('button', 0.008, 0.012, tuple(tip), 'chrome', rot=(0, -(90 - math.degrees(a)), 0), segs=10,
                       bev=0.002, bsegs=1))
    parts.append(P.cyl('pivot', 0.01, 0.05, tuple(piv), 'steel', axis='Y', segs=10, bev=None))
    P.mover('LEVER', parts, tuple(piv))
    P.tube('cable', [(0.05, 0, 0.03), (0.12, 0, 0.02), (0.16, 0, -0.02)], 0.004, 'steel', segs=6, bend=0.03)
    P.views = [('a', 140, 26), ('b', 40, 26)]


def build_gl_stock(P):
    """A floor gear lever: bellows boot on a bezel ring, a chrome lever with a slight bend towards the driver
    and a black knob (LEVER: origin on the ball pivot under the floor)."""
    P.ao_distance = 0.04
    P.cyl('bezel', 0.07, 0.008, (0, 0, 0.004), 'trim', segs=24, bev=0.003, bsegs=1)
    P.bolts([(0.058 * math.cos(a), 0.058 * math.sin(a), 0.008) for a in (0.8, 2.4, 3.9, 5.5)], normal=(0, 0, 1),
            r=0.0045, h=0.003, washer=False, material='chrome')
    prof = [(0.06, 0.008)]
    for i in range(6):
        z = 0.012 + i * 0.016
        r = 0.058 - i * 0.0075
        prof += [(r, z), (r - 0.006, z + 0.008)]
    prof += [(0.012, 0.11), (0.0105, 0.115)]
    P.lathe('boot', prof, material='rubber', segs=20, sharp=60.0)
    piv = V((0, 0, -0.04))
    path = [piv, V((0, 0, 0.12)), V((-0.02, 0, 0.22)), V((-0.03, 0, 0.29))]
    rod = P.tube('rod', path, 0.0075, 'chrome', segs=10, bend=0.08)
    knob = P.sphere('knob', 0.026, (-0.033, 0, 0.312), 'trim', u=16, v=10, scale=(1, 1, 0.92))
    disc = P.cyl('pattern', 0.016, 0.002, (-0.033, 0, 0.336), 'gauge', segs=14, bev=None)
    bm = bmesh.new()
    for (y0, y1, x) in ((-0.008, 0.008, -0.033),):
        K.bm_cube(bm, (0.0016, 0.016, 0.0012), mat4((x, 0, 0.3375)))
    for dy in (-0.006, 0.0, 0.006):
        K.bm_cube(bm, (0.014, 0.0016, 0.0012), mat4((-0.033, dy, 0.3375)))
    lines = P.mesh('pattern_lines', bm, 'trim', sharp=60)
    P.mover('LEVER', [rod, knob, disc, lines], tuple(piv))
    P.views = [('a', 200, 22), ('b', 120, 22)]


def build_gl_foot(P):
    """
    A motorcycle foot shifter for the LEFT side: a forged steel lever clamped on the gearbox's splined selector
    shaft (pinch bolt through a split lug), cranked outboard, reaching forward and up to a ribbed rubber toe
    peg that sticks out to the left (+Y). Origin = the shaft axis where the lever sits; LEVER turns about
    the transverse axis (Blender Y, game z) - a positive game-z angle lifts the peg (an upshift).
    The static part is just the shaft stub and its seal coming out of the case (-Y).
    """
    P.ao_distance = 0.02
    ya = 0.01                                    # mid-plane of the boss and the arm
    # static: selector shaft stub and the oil seal it comes out of
    P.cyl('shaft', 0.0075, 0.024, (0, -0.012, 0), 'steel', axis='Y', segs=14, bev=None)
    P.lathe('seal', [(0.0076, -0.0245), (0.0125, -0.0245), (0.0135, -0.021), (0.0118, -0.0175),
                     (0.0076, -0.0175)], material='rubber', axis='Y', segs=16, loop=True, sharp=50.0)
    lever = []
    # the boss with its split clamp lug and pinch bolt
    lever.append(P.cyl('boss', 0.0155, 0.02, (0, ya, 0), 'steel', axis='Y', segs=20, bev=0.002, bsegs=2))
    lever.append(P.box('lug', (0.016, 0.016, 0.017), (-0.017, ya, 0), 'steel', bev=0.002, segs=2))
    lever.append(P.box('slit', (0.0165, 0.0166, 0.0016), (-0.0172, ya, 0), 'trim', bev=None))
    lever.append(P.bolt((-0.019, ya, 0.0085), normal=(0, 0, 1), r=0.0058, h=0.0045, washer=False,
                        material='steel', name='pinch'))
    lever.append(P.bolt((-0.019, ya, -0.0085), normal=(0, 0, -1), r=0.0058, h=0.0042, washer=False,
                        material='steel', name='pinch_nut'))
    # the splined shaft end showing through the boss
    star = []
    for i in range(32):
        a = math.tau * i / 32
        r = 0.0074 if i % 2 == 0 else 0.0062
        star.append((r * math.cos(a), r * math.sin(a)))
    lever.append(P.prism('splines', star, 0.0035, matrix=Matrix.Translation((0, ya + 0.0105, 0)) @
                         K.axis_matrix('Y'), material='steel', bev=None, center=True))
    lever.append(P.cyl('shaft_end', 0.0045, 0.0042, (0, ya + 0.011, 0), 'trim', axis='Y', segs=12, bev=None))
    # the arm: a forged flat bar (16 x 8 mm, tapering), cranked outboard towards the peg
    peg = V((0.163, 0.0, 0.07))
    path = [V((0.0, ya, 0.0)), V((0.055, ya, 0.004)), V((0.115, ya + 0.004, 0.028)), V((peg.x, ya + 0.006, peg.z))]
    lever.append(P.tube('arm', path, 0.0088, 'steel', bend=0.035, profile=K.rounded_rect(2.0, 1.0, 0.42, seg=2),
                        radius_fn=lambda s: 1.0 - 0.22 * s, sharp=50.0))
    # the eye at the end and the toe peg out to the left
    lever.append(P.cyl('eye', 0.0092, 0.012, (peg.x, ya + 0.006, peg.z), 'steel', axis='Y', segs=16,
                       bev=0.0015, bsegs=1))
    prof = [(0.0, 0.0225), (0.0088, 0.0225), (0.0116, 0.0255)]
    y = 0.0255
    for k in range(2):
        prof += [(0.0116, y + 0.0085), (0.0097, y + 0.0098), (0.0097, y + 0.0115), (0.0116, y + 0.0128)]
        y += 0.0128
    prof += [(0.0116, y + 0.0085), (0.0102, y + 0.0128), (0.0058, y + 0.0152), (0.0, y + 0.0158)]
    lever.append(P.lathe('toe_peg', prof, loc=(peg.x, 0.0, peg.z), material='rubber', axis='Y', segs=14,
                         sharp=50.0))
    P.mover('LEVER', lever, (0.0, 0.0, 0.0))
    P.views = [('a', -60, 22), ('b', -150, 30)]


def build_ign_key(P):
    """Key ignition: a chrome bezel with position marks, the lock barrel into the dash with its wires, and the
    KEY (turns about X; its origin is on the barrel axis) with a ring and a little tag."""
    P.ao_distance = 0.02
    P.lathe('bezel', [(0.0, -0.009), (0.008, -0.009), (0.019, -0.0085), (0.024, -0.005), (0.025, 0.0)],
            material='chrome', axis='X', segs=20, close='end', sharp=40.0)
    P.box('slot_face', (0.002, 0.004, 0.014), (-0.0098, 0, 0), 'trim', bev=None)
    for i, a in enumerate((90, 60, 30, 0)):
        rr = math.radians(a)
        P.box('mark', (0.0015, 0.003, 0.003), (-0.009, -0.0215 * math.cos(rr), 0.0215 * math.sin(rr)),
              'gauge' if i < 3 else 'paint', bev=None)
    P.cyl('barrel', 0.016, 0.05, (0.025, 0, 0), 'steel', axis='X', segs=14, bev=0.002, bsegs=1)
    for i in range(3):
        P.tube('wire', [(0.05, -0.006 + i * 0.006, -0.004), (0.07, -0.01 + i * 0.01, -0.01),
                        (0.09, -0.02 + i * 0.02, -0.03)], 0.0022, 'trim' if i else 'paint', segs=5, bend=0.01)
    # the key: blade in the slot, head, ring and tag
    parts = [P.box('blade', (0.03, 0.0025, 0.009), (-0.004, 0, 0), 'chrome', bev=0.0008, segs=1)]
    bm = bmesh.new()
    K.bm_prism(bm, K.rounded_rect(0.026, 0.022, 0.009, seg=3), 0.004, matrix=mat4((-0.032, 0, 0.002), (0, 90, 90)))
    parts.append(P.mesh('head', bm, 'trim', bev=0.0012, segs=1))
    parts.append(P.torus('ring', 0.011, 0.0013, loc=(-0.047, 0, -0.004), axis='Y', segs=14, rsegs=4,
                         material='chrome'))
    bm = bmesh.new()
    K.bm_prism(bm, K.rounded_rect(0.02, 0.032, 0.006, seg=2), 0.004, matrix=mat4((-0.05, 0, -0.03), (0, 90, 90)))
    parts.append(P.mesh('tag', bm, 'paint', bev=0.001, segs=1))
    P.mover('KEY', parts, (0, 0, 0))
    P.views = [('a', 210, 14), ('b', 150, 24)]


def build_horn_beep(P):
    """A disc horn facing +X on an L-bracket (origin at the bracket's bolt), two spade terminals."""
    P.ao_distance = 0.02
    P.lathe('body', [(0.0, -0.032), (0.03, -0.031), (0.044, -0.024), (0.048, -0.012), (0.048, 0.0),
                     (0.046, 0.004)], loc=(0.03, 0, 0.0), material='trim', axis='X', segs=24, sharp=40.0)
    P.lathe('grille', [(0.046, 0.004), (0.04, 0.008), (0.012, 0.01), (0.0, 0.01)], loc=(0.03, 0, 0.0),
            material='chrome', axis='X', segs=24, sharp=40.0)
    for i in range(6):
        a = math.tau * i / 6
        P.box('rib', (0.003, 0.003, 0.026), (0.041, 0.026 * math.cos(a), 0.026 * math.sin(a)), 'chrome',
              rot=(math.degrees(a) - 90, 0, 0), bev=None)
    P.cyl('stud', 0.008, 0.02, (0.0, 0, 0.0), 'steel', axis='X', segs=8, bev=None)
    P.box('bracket', (0.006, 0.03, 0.075), (-0.008, 0, -0.03), 'steel', bev=0.002, segs=1)
    P.box('bracket_foot', (0.04, 0.03, 0.006), (-0.025, 0, -0.065), 'steel', bev=0.002, segs=1)
    P.bolt((-0.03, 0, -0.062), r=0.006, h=0.005)
    for sg in (-1, 1):
        P.box('spade', (0.012, 0.003, 0.008), (0.0, sg * 0.018, 0.03), 'chrome', bev=None)
    P.tube('lead', [(0.0, 0.018, 0.035), (-0.01, 0.03, 0.05), (-0.04, 0.03, 0.06)], 0.0025, 'trim', segs=5, bend=0.01)
    P.views = [('a', 35, 16), ('b', 215, 16)]


def build_steer_bar(P):
    """A motorcycle handlebar on its top yoke (origin = the top of the steering head; it turns about local Z,
    the steering-head axis): chrome bar with rise and pull-back, rubber grips, perches with the clutch (left)
    and brake (right) levers, switch housings, cables."""
    P.ao_distance = 0.03
    # top yoke with the fork-tube caps and the stem nut
    poly = []
    for (cy, a0, a1) in ((0.09, -90, 90), (-0.09, 90, 270)):
        for i in range(7):
            a = math.radians(a0 + (a1 - a0) * i / 6)
            poly.append((0.03 * math.cos(a) - 0.005, cy + 0.03 * math.sin(a)))
    P.prism('yoke', poly, 0.022, (0, 0, 0.011), 'alu', bev=0.005, segs=2)
    for sy in (-1, 1):
        P.cyl('fork_cap', 0.019, 0.02, (-0.005, sy * 0.09, 0.03), 'chrome', segs=14, bev=0.003, bsegs=1)
        P.cyl('riser', 0.016, 0.04, (0.0, sy * 0.035, 0.042), 'alu', segs=12, bev=0.003, bsegs=1)
        P.box('clamp', (0.03, 0.032, 0.018), (0.0, sy * 0.035, 0.07), 'alu', bev=0.005, segs=1)
    P.cyl('stem_nut', 0.017, 0.012, (-0.005, 0.0, 0.028), 'chrome', segs=6, bev=None)
    # the bar
    half = [(0.0, 0.0, 0.07), (0.0, 0.12, 0.07), (-0.05, 0.22, 0.11), (-0.11, 0.29, 0.13), (-0.135, 0.36, 0.13)]
    pts = [(x, -y, z) for (x, y, z) in reversed(half)] + half[1:]
    P.tube('bar', pts, 0.011, 'chrome', segs=10, bend=0.07)
    end_dir = V((-0.025, 0.07, 0.0)).normalized()
    for sy in (-1, 1):
        e = V((-0.135, sy * 0.36, 0.13))
        d = V((end_dir.x, sy * end_dir.y, 0.0))
        g0 = e - d * 0.115
        P.tube('grip', [g0, e + d * 0.004], 0.0165, 'rubber', segs=12)
        P.cyl('grip_flange', 0.021, 0.008, tuple(g0), 'rubber', axis=d, segs=12, bev=0.002, bsegs=1)
        # perch and lever in front of the grip
        pc = g0 - d * 0.02
        P.box('perch', (0.035, 0.03, 0.03), tuple(pc + V((0.012, 0, 0))), 'alu', bev=0.006, segs=1)
        lv = [pc + V((0.03, 0, 0.0)), pc + V((0.05, sy * 0.04, -0.005)), pc + V((0.035, sy * 0.15, -0.01)),
              pc + V((0.02, sy * 0.17, -0.012))]
        P.tube('lever', lv, 0.006, 'alu', segs=6, bend=0.02)
        P.box('switch', (0.035, 0.03, 0.04), tuple(pc - d * 0.03 + V((0.0, 0, 0.0))), 'trim', bev=0.006, segs=1)
        P.box('switch_btn', (0.01, 0.012, 0.008), tuple(pc - d * 0.03 + V((-0.018, 0, 0.01))),
              'paint' if sy < 0 else 'chrome', bev=None)
        P.tube('cable', [pc + V((0.03, 0, -0.01)), pc + V((0.08, -sy * 0.05, -0.06)), V((0.06, sy * 0.06, -0.12))],
               0.0035, 'trim', segs=5, bend=0.04)
    P.prop('steer_axis', 'Z')
    P.views = [('a', 200, 26), ('b', 30, 22)]


def build_steer_sport(P):
    """A small leather-rimmed sport wheel: deep dish, three drilled alloy spokes, a top marker on the rim."""
    P.ao_distance = 0.04
    R = 0.162
    xr = -0.085
    o = wheel_rim(P, R, 0.016, 0.0145, xr, 'leather', segs=40, rsegs=10)
    # top marker: recolour the rim faces near 12 o'clock
    o.data.materials.append(K.mc.mat('paint_b'))
    for poly in o.data.polygons:
        c = poly.center
        if c.z > R * 0.96 and abs(c.y) < 0.014:
            poly.material_index = 1
    hub_x = -0.035
    for ang in (0.0, 180.0, 270.0):
        a = math.radians(ang)
        d = V((0, -math.cos(a), math.sin(a)))
        p0 = V((hub_x - 0.004, 0, 0)) + d * 0.034
        p1 = V((xr + 0.002, 0, 0)) + d * (R - 0.006)
        L = (p1 - p0).length
        w0, w1, th = 0.042, 0.026, 0.006
        bm = bmesh.new()
        K.bm_prism(bm, [(0, -w0 / 2), (L, -w1 / 2), (L, w1 / 2), (0, w0 / 2)], th)
        xdir = (p1 - p0).normalized()
        side = V((1, 0, 0)).cross(d).normalized()
        zdir = xdir.cross(side).normalized()
        m = Matrix((xdir, side, zdir)).transposed().to_4x4()
        m.translation = p0
        K.bm_transform(bm, m)
        P.mesh('spoke', bm, 'alu', bev=0.0018, segs=2)
        for k in range(3):
            t = 0.28 + 0.22 * k
            c = p0 + xdir * (L * t)
            for sz in (-1, 1):
                P.cyl('hole', 0.0075 - 0.0012 * k, 0.0012, tuple(c + zdir * sz * (th / 2 + 0.0004)), 'trim', axis=zdir,
                      segs=10, bev=None)
    P.lathe('boss', [(0.0, 0.006), (0.02, 0.006), (0.04, 0.0), (0.042, -0.02), (0.038, -0.034), (0.0, -0.034)][::-1],
            material='trim', axis='X', segs=24, sharp=50.0)
    P.lathe('button', [(0.0, -0.05), (0.02, -0.049), (0.03, -0.044), (0.032, -0.036)], material='trim', axis='X',
            segs=20, close='end', sharp=60.0)
    P.lathe('ring', [(0.032, -0.046), (0.036, -0.045), (0.036, -0.036), (0.032, -0.036)], material='chrome',
            axis='X', segs=20, loop=True, sharp=50.0)
    P.cyl('shaft', 0.011, 0.024, (0.012, 0, 0), 'steel', axis='X', segs=12, bev=None)
    P.prop('steer_axis', 'X')
    P.views = [('a', 200, 16), ('b', 120, 20)]


def build_steer_bad(P):
    """A worn-out wheel: the stock wheel with its horn pad gone (bare hub and loose wires), one spoke rusted
    and bent, the rim patched with tape."""
    P.ao_distance = 0.05
    R = 0.182
    xr = -0.072
    wheel_rim(P, R, 0.0135, 0.012, xr, 'trim', segs=40, rsegs=10)
    hub_r, hub_x = 0.040, -0.040
    for k, ang in enumerate((0.0, 180.0, 270.0)):
        a = math.radians(ang + (9.0 if k == 1 else 0.0))
        d = V((0, -math.cos(a), math.sin(a)))
        p0 = V((hub_x - 0.004, 0, 0)) + d * (hub_r - 0.006)
        p1 = V((xr + 0.002 + (0.012 if k == 1 else 0.0), 0, 0)) + d * (R - 0.004)
        L = (p1 - p0).length
        bm = bmesh.new()
        K.bm_prism(bm, [(0, -0.025), (L, -0.015), (L, 0.015), (0, 0.025)], 0.0055)
        xdir = (p1 - p0).normalized()
        side = V((1, 0, 0)).cross(d).normalized()
        zdir = xdir.cross(side).normalized()
        m = Matrix((xdir, side, zdir)).transposed().to_4x4()
        m.translation = p0
        K.bm_transform(bm, m)
        P.mesh('spoke', bm, 'rust' if k == 1 else 'alu', bev=0.0016, segs=2)
    # tape wraps on the rim (left and lower right)
    for (a0, span) in ((150.0, 26.0), (305.0, 18.0)):
        bm = bmesh.new()
        path = []
        for i in range(7):
            aa = math.radians(a0 + span * i / 6)
            path.append((xr, R * math.cos(aa), R * math.sin(aa)))
        K.bm_sweep(bm, path, 0.0158, segs=10, caps=True)
        P.mesh('tape', bm, 'paint_b', sharp=80.0)
    # bare hub where the pad used to be, with its wires and a bolt
    P.lathe('boss', [(0.0, 0.006), (0.02, 0.006), (0.046, 0.0), (0.05, -0.012), (0.049, -0.030), (0.044, -0.040),
                     (0.0, -0.040)][::-1], material='trim', axis='X', segs=24, sharp=50.0)
    P.cyl('hub_nut', 0.016, 0.012, (-0.046, 0, 0), 'steel', axis='X', segs=6, bev=None)
    for k in range(2):
        P.tube('wire', [(-0.04, 0.02 - 0.04 * k, 0.012), (-0.06, 0.03 - 0.06 * k, -0.01),
                        (-0.075, 0.02 - 0.05 * k, -0.04)], 0.0022, 'paint' if k else 'paint_b', segs=5, bend=0.01)
    P.cyl('shaft', 0.011, 0.024, (0.012, 0, 0), 'steel', axis='X', segs=12, bev=None)
    P.prop('steer_axis', 'X')
    P.views = [('a', 200, 16), ('b', 120, 20)]


def build_radio_tape(P):
    """An 1980s cassette deck: black face with a chrome strip, the tape door (TAPE_DOOR, hinged at its bottom)
    with a cassette (N_cassette) showing through its window, transport keys, a small lit scale, two knobs."""
    P.ao_distance = 0.03
    W, H = 0.18, 0.05
    P.box('box', (0.15, 0.17, 0.048), (0.075, 0, 0), 'steel', bev=0.004, segs=1)
    for i in range(6):
        P.box('slot', (0.08, 0.006, 0.003), (0.08, -0.06 + i * 0.024, 0.0245), 'trim', bev=None, open='-z')
    P.box('face', (0.014, W, H), (-0.007, 0, 0), 'trim', bev=0.006, segs=2)
    P.box('strip', (0.003, W - 0.01, 0.004), (-0.0145, 0, H / 2 - 0.008), 'chrome', bev=None)
    # tape door with a smoked window, the cassette behind it
    dw, dh = 0.075, 0.03
    door = P.box('door', (0.004, dw, dh), (-0.016, 0.012, -0.002), 'trim', bev=0.0015, segs=1)
    win = P.box('door_glass', (0.0015, dw - 0.014, dh - 0.012), (-0.0185, 0.012, -0.0005), 'glass_dark', bev=None)
    P.mover('TAPE_DOOR', [door, win], (-0.016, 0.012, -0.002 - dh / 2))
    # the tape in it (N_cassette: shown while a tape is in, sliding in and out: src/game/modcar/v3/nd-tape)
    cas = P.box('cassette', (0.004, dw - 0.008, dh - 0.006), (-0.012, 0.012, -0.002), 'trim', bev=0.001, segs=1)
    lab = P.box('label', (0.0012, dw - 0.03, dh - 0.016), (-0.0142, 0.012, -0.0005), 'paint_b', bev=None)
    reels = [P.cyl('reel', 0.006, 0.0014, (-0.0148, 0.012 + sy * 0.016, -0.001), 'steel', axis='X', segs=10, bev=None)
             for sy in (-1, 1)]
    P.mover('N_cassette', [cas, lab] + reels, (-0.012, 0.012, -0.002))
    # keys and the scale
    for i in range(4):
        P.box('key', (0.01, 0.012, 0.009), (-0.018, -0.045 + i * 0.0135, -0.014), 'chrome', bev=0.002, segs=1)
    P.box('scale', (0.002, 0.05, 0.01), (-0.0142, -0.025, 0.012), 'gauge', bev=None)
    P.box('needle', (0.001, 0.0016, 0.012), (-0.0155, -0.03, 0.012), 'paint', bev=None)
    for (nm, y) in (('KNOB_L', 0.074), ('KNOB_R', -0.074)):
        P.cyl('shaft', 0.003, 0.012, (-0.02, y, 0.0), 'steel', axis='X', segs=8, bev=None)
        k1 = P.lathe('knob', [(0.0, -0.02), (0.01, -0.02), (0.012, -0.017), (0.012, -0.004), (0.01, 0.0)],
                     loc=(-0.015, y, 0.0), material='trim', axis='X', segs=16, close='end', sharp=40.0)
        k2 = P.cyl('knob_ring', 0.0125, 0.003, (-0.022, y, 0.0), 'chrome', axis='X', segs=16, bev=None)
        P.mover(nm, [k1, k2], (-0.015, y, 0.0))
    P.views = [('a', 210, 14), ('b', 140, 18)]


def build_hb_drift(P):
    """A hydraulic drift handbrake: a tall lever (LEVER, pivot at its foot; pulled towards the driver =
    -25 deg about local Y) with a ball grip, on a bolted bracket with its master cylinder and braided lines."""
    P.ao_distance = 0.04
    P.box('base', (0.16, 0.08, 0.012), (0.0, 0, 0.006), 'steel', bev=0.003, segs=1)
    P.bolts([(sx * 0.065, sy * 0.028, 0.012) for sx in (-1, 1) for sy in (-1, 1)], normal=(0, 0, 1), r=0.0065, h=0.005,
            washer=False)
    for sg in (-1, 1):
        P.box('cheek', (0.07, 0.008, 0.075), (0.0, sg * 0.022, 0.05), 'alu', bev=0.004, segs=1)
    P.cyl('master', 0.016, 0.09, (0.06, 0.0, 0.035), 'alu', axis='X', segs=14, bev=0.003, bsegs=1)
    P.cyl('reservoir', 0.012, 0.03, (0.04, 0.0, 0.07), 'glass', segs=12, bev=0.002, bsegs=1)
    P.tube('line', [(0.105, 0.0, 0.035), (0.14, 0.0, 0.03), (0.18, 0.02, 0.0), (0.22, 0.02, -0.02)], 0.004, 'steel',
           segs=6, bend=0.03)
    piv = V((0.0, 0, 0.06))
    rod = P.tube('lever', [piv, piv + V((-0.02, 0, 0.2)), piv + V((-0.06, 0, 0.42))], 0.012, 'alu', segs=10,
                 bend=0.1)
    grip = P.sphere('grip', 0.03, tuple(piv + V((-0.064, 0, 0.445))), 'trim', u=16, v=10)
    btn = P.cyl('lock', 0.008, 0.012, tuple(piv + V((-0.066, 0, 0.476))), 'paint', segs=10, bev=0.002, bsegs=1)
    pin = P.cyl('pivot', 0.01, 0.06, tuple(piv), 'steel', axis='Y', segs=10, bev=None)
    P.mover('LEVER', [rod, grip, btn, pin], tuple(piv))
    P.views = [('a', 140, 20), ('b', 40, 20)]


def build_gl_short(P):
    """A short-throw shifter: stubby lever, a big billet knob, a leather gaiter with a chrome ring
    (LEVER: origin on the ball pivot under the floor)."""
    P.ao_distance = 0.04
    P.cyl('bezel', 0.065, 0.008, (0, 0, 0.004), 'chrome', segs=24, bev=0.003, bsegs=1)
    prof = [(0.058, 0.008), (0.055, 0.02), (0.045, 0.04), (0.035, 0.05), (0.03, 0.058), (0.02, 0.07),
            (0.012, 0.075), (0.011, 0.08)]
    P.lathe('gaiter', prof, material='leather', segs=20, sharp=60.0)
    P.torus('gaiter_ring', 0.013, 0.0035, loc=(0, 0, 0.077), segs=14, rsegs=5, material='chrome')
    piv = V((0, 0, -0.04))
    rod = P.tube('rod', [piv, V((0, 0, 0.14))], 0.008, 'steel', segs=10)
    knob = P.lathe('knob', [(0.0, 0.135), (0.012, 0.136), (0.024, 0.145), (0.03, 0.16), (0.031, 0.175),
                            (0.026, 0.19), (0.015, 0.197), (0.0, 0.198)], material='alu', segs=20, sharp=50.0)
    grooves = P.torus('knob_groove', 0.0312, 0.002, loc=(0, 0, 0.168), segs=20, rsegs=4, material='trim')
    P.mover('LEVER', [rod, knob, grooves], tuple(piv))
    P.views = [('a', 200, 22), ('b', 120, 22)]


def build_ign_button(P):
    """A push-to-start panel: a plate with an arming toggle and a red start button under a flip-up guard
    (COVER, hinged at its top edge; BUTTON presses along +X)."""
    P.ao_distance = 0.02
    P.box('plate', (0.006, 0.09, 0.05), (-0.003, 0, 0), 'trim', bev=0.003, segs=2)
    for (y, z) in ((-0.038, 0.018), (0.038, -0.018)):
        P.cyl('screw', 0.003, 0.002, (-0.007, y, z), 'chrome', axis='X', segs=8, bev=None)
    # arming toggle on the left
    P.cyl('toggle_nut', 0.008, 0.005, (-0.008, 0.025, 0.0), 'chrome', axis='X', segs=6, bev=None)
    P.tube('toggle', [(-0.01, 0.025, 0.0), (-0.028, 0.025, 0.008)], 0.0028, 'chrome', segs=6)
    P.sphere('toggle_tip', 0.004, (-0.029, 0.025, 0.0085), 'chrome', u=8, v=4)
    # the start button and its guard on the right
    P.lathe('btn_bezel', [(0.011, 0.0), (0.016, 0.0), (0.016, -0.006), (0.012, -0.008), (0.011, -0.008)],
            loc=(0.0, -0.015, 0.0), material='chrome', axis='X', segs=18, loop=True, sharp=50.0)
    btn = P.cyl('button', 0.01, 0.01, (-0.008, -0.015, 0.0), 'paint', axis='X', segs=16, bev=0.002, bsegs=1)
    P.mover('BUTTON', [btn], (-0.008, -0.015, 0.0))
    hinge = V((-0.007, -0.015, 0.021))
    bm = bmesh.new()
    K.bm_cube(bm, (0.003, 0.036, 0.036), mat4((-0.022, -0.015, 0.003)))
    K.bm_cube(bm, (0.016, 0.036, 0.003), mat4((-0.0145, -0.015, 0.0195)))
    for sy in (-1, 1):
        K.bm_cube(bm, (0.016, 0.003, 0.036), mat4((-0.0145, -0.015 + sy * 0.0165, 0.003)))
    cover = P.mesh('cover', bm, 'lens_tail', bev=0.0008, segs=1)
    P.mover('COVER', [cover], tuple(hinge))
    P.box('hinge', (0.006, 0.038, 0.004), tuple(hinge + V((0.0, 0, 0.0))), 'chrome', bev=None)
    P.views = [('a', 210, 14), ('b', 150, 24)]


def trumpet(P, base, axis, length, r0, r1, name='trumpet', material='chrome'):
    """A horn trumpet: a thin tube flaring into a bell over its last third."""
    prof = []
    n = 6
    for i in range(n + 1):
        t = i / n
        if t < 0.5:
            r = r0
        else:
            u = (t - 0.5) / 0.5
            r = r0 + (r1 - r0) * u ** 2.2
        prof.append((r, length * t))
    m = Matrix.Translation(V(base)) @ K.axis_matrix(axis)
    bm = bmesh.new()
    K.bm_lathe(bm, K.shell_profile(prof, 0.0018), segs=10, matrix=m, loop=True)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    return P.mesh(name, bm, material, sharp=60.0)


def build_horn_trumpet(P):
    """A musical horn: five chrome trumpets of rising length on a bar, fed by a little compressor."""
    P.ao_distance = 0.03
    P.box('bar', (0.03, 0.2, 0.012), (0.0, 0.0, 0.0), 'steel', bev=0.003, segs=1)
    P.bolt((0.0, 0.0, 0.006), r=0.006, h=0.005)
    for i in range(5):
        y = -0.08 + i * 0.04
        L = 0.12 + 0.045 * i
        P.cyl('valve', 0.011, 0.025, (-0.01, y, 0.02), 'alu', segs=10, bev=0.002, bsegs=1)
        trumpet(P, (-0.01, y, 0.03), (0.92, 0, 0.38), L, 0.0055, 0.022 + 0.004 * i)
        P.tube('feed', [(-0.01, y, 0.008), (-0.03, y * 0.5, -0.02), (-0.06, 0.0, -0.03)], 0.003, 'rubber', segs=5,
               bend=0.02)
    P.box('compressor', (0.06, 0.05, 0.05), (-0.075, 0.0, -0.035), 'trim', bev=0.008, segs=2)
    P.tube('lead', [(-0.105, 0.0, -0.03), (-0.13, 0.02, -0.02), (-0.16, 0.03, 0.0)], 0.0025, 'trim', segs=5,
           bend=0.02)
    P.views = [('a', 35, 18), ('b', 215, 18)]


def build_horn_air(P):
    """Truck air horns: two long chrome trumpets on a bracket, the air valve and its hose."""
    P.ao_distance = 0.04
    P.box('bracket', (0.05, 0.12, 0.01), (0.0, 0.0, 0.0), 'steel', bev=0.003, segs=1)
    P.bolts([(0.0, -0.04, 0.005), (0.0, 0.04, 0.005)], normal=(0, 0, 1), r=0.0065, h=0.005, washer=False)
    for sy, L, rb in ((-1, 0.42, 0.055), (1, 0.30, 0.047)):
        y = sy * 0.04
        P.cyl('clamp', 0.016, 0.02, (0.0, y, 0.025), 'steel', axis='X', segs=12, bev=0.002, bsegs=1)
        trumpet(P, (-0.06, y, 0.025), (1, 0, 0), L, 0.011, rb)
    P.box('valve', (0.05, 0.06, 0.04), (-0.085, 0.0, 0.025), 'alu', bev=0.008, segs=2)
    P.tube('hose', [(-0.11, 0.0, 0.025), (-0.15, 0.0, 0.0), (-0.2, 0.02, -0.03)], 0.006, 'rubber', segs=8, bend=0.03)
    P.views = [('a', 35, 18), ('b', 215, 18)]


PARTS = {
    'steer_std': build_steer_std,
    'steer_ship': build_steer_ship,
    'steer_bar': build_steer_bar,
    'steer_sport': build_steer_sport,
    'steer_bad': build_steer_bad,
    'radio_old': build_radio_old,
    'radio_tape': build_radio_tape,
    'hb_stock': build_hb_stock,
    'hb_drift': build_hb_drift,
    'gl_stock': build_gl_stock,
    'gl_short': build_gl_short,
    'gl_foot': build_gl_foot,
    'ign_key': build_ign_key,
    'ign_button': build_ign_button,
    'horn_beep': build_horn_beep,
    'horn_trumpet': build_horn_trumpet,
    'horn_air': build_horn_air,
}


def main(args):
    K.run(PARTS, args)
