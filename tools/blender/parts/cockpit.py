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
    P.lathe('hub', [(0.0, 0.024), (0.062, 0.024), (0.066, 0.016), (0.066, -0.016), (0.062, -0.024), (0.0, -0.024)],
            loc=(xr * 0.6, 0, 0), material='wood', axis='X', segs=24, sharp=40.0)
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


PARTS = {
    'steer_std': build_steer_std,
    'steer_ship': build_steer_ship,
    'radio_old': build_radio_old,
    'hb_stock': build_hb_stock,
    'gl_stock': build_gl_stock,
    'ign_key': build_ign_key,
    'horn_beep': build_horn_beep,
}


def main(args):
    K.run(PARTS, args)
