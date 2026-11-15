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


PARTS = {
    'steer_std': build_steer_std,
}


def main(args):
    K.run(PARTS, args)
