"""
Lamps (docs/MODCAR.md section 2.3): headlamps face +X, tail lamps face -X; LEFT-side parts (outboard = +Y),
the game mirrors them for the right. Origin at the body mount (the back of the lamp).
Materials: lens_head / lens_tail / lens_amber over a chrome reflector bowl with a visible bulb (glass + emit).

    blender -b --factory-startup --python tools/blender/build.py -- parts/lamps [<id>|all] [--norender]
"""
import math

import bmesh
from mathutils import Matrix, Vector

from parts import _kit as K
from parts._kit import V, mat4


def bulb(P, x, y=0.0, z=0.0, r=0.011, axis='X'):
    P.sphere('bulb', r, (x, y, z), 'glass', u=12, v=6, scale=(1.25, 1, 1) if axis == 'X' else (1, 1, 1))
    P.cyl('filament', r * 0.22, r * 1.1, (x, y, z), 'emit', axis='Y', segs=6, bev=None)
    P.cyl('bulb_base', r * 0.75, r * 1.2, (x - r * 1.6, y, z), 'steel', axis='X', segs=10, bev=None)


def rrect_ring(W, H, r, seg=4):
    """Rounded-rectangle outline in (y, z), counter-clockwise seen from +X."""
    return [(y, z) for (y, z) in K.rounded_rect(W, H, r, seg=seg)]


def build_hl_round(P):
    """A 7-inch round sealed-beam headlamp: black bucket, chrome reflector, bulb, fluted lens, chrome bezel."""
    P.ao_distance = 0.03
    P.lathe('bucket', [(0.0, 0.0), (0.03, 0.0), (0.06, 0.012), (0.082, 0.035), (0.09, 0.058), (0.092, 0.07)],
            material='trim', axis='X', segs=32, sharp=40.0)
    P.cyl('stud', 0.012, 0.016, (-0.006, 0, 0), 'steel', axis='X', segs=10, bev=None)
    P.lathe('reflector', [(0.012, 0.034), (0.04, 0.041), (0.065, 0.054), (0.087, 0.072)][::-1], material='chrome',
            axis='X', segs=32, sharp=40.0)
    bulb(P, 0.052)
    P.lathe('lens', [(0.089, 0.073), (0.086, 0.078), (0.062, 0.083), (0.059, 0.0838), (0.033, 0.0868),
                     (0.03, 0.0874), (0.0, 0.089)], material='lens_head', axis='X', segs=32, sharp=60.0)
    P.lathe('bezel', [(0.086, 0.069), (0.099, 0.069), (0.101, 0.079), (0.096, 0.088), (0.088, 0.085)],
            material='chrome', axis='X', segs=32, loop=True, sharp=50.0)
    for i in range(3):
        a = math.tau * i / 3 + math.radians(90)
        P.cyl('screw', 0.0045, 0.004, (0.088, 0.094 * math.cos(a), 0.094 * math.sin(a)), 'chrome', axis='X',
              segs=8, bev=None)
    P.views = [('a', 30, 12), ('b', 150, 15)]


def build_hl_square(P):
    """A rectangular sealed-beam headlamp (1980s): bucket, twin reflectors and bulbs, ribbed lens, chrome
    bezel with two screws."""
    P.ao_distance = 0.03
    W, H, R = 0.19, 0.13, 0.022
    sec = rrect_ring(W, H, R, seg=3)
    P.loft('bucket', [K.section_x(sec, 0.0, 0.62), K.section_x(sec, 0.03, 0.88), K.section_x(sec, 0.068, 1.0)],
           'trim', cap_start=True, recalc=True)
    P.cyl('stud', 0.012, 0.016, (-0.006, 0, 0), 'steel', axis='X', segs=10, bev=None)
    for sy in (-1, 1):
        cy = sy * W * 0.24
        hole = [(y * 0.12, z * 0.16) for (y, z) in sec]
        mid = [(y * 0.32, z * 0.6) for (y, z) in sec]
        rim = [(y * 0.49, z * 0.95) for (y, z) in sec]
        bm = bmesh.new()
        K.bm_loft(bm, [K.section_x(rim, 0.071, 1, cy), K.section_x(mid, 0.05, 1, cy), K.section_x(hole, 0.036, 1, cy)])
        P.mesh('reflector', bm, 'chrome', sharp=40.0)
        bulb(P, 0.05, cy, 0.0, r=0.009)
    lens = [K.section_x(sec, 0.072, 1.0), K.section_x(sec, 0.079, 0.93), K.section_x(sec, 0.083, 0.6)]
    P.loft('lens', lens, 'lens_head', cap_end=True, sharp=50.0)
    for i in range(7):
        y = -W * 0.36 + W * 0.72 * i / 6
        P.box('flute', (0.0015, 0.004, H * 0.55), (0.0832, y, 0.0), 'lens_head', bev=None, open='-x')
    outer = rrect_ring(W + 0.022, H + 0.022, R + 0.008, seg=3)
    inner = rrect_ring(W - 0.004, H - 0.004, R - 0.002, seg=3)
    rings = [K.section_x(outer, 0.066), K.section_x(outer, 0.078), K.section_x(inner, 0.085),
             K.section_x(inner, 0.072), K.section_x(outer, 0.066)]
    P.loft('bezel', rings[:-1] + [rings[0]], 'chrome', sharp=50.0, recalc=False)
    for sy in (-1, 1):
        P.cyl('screw', 0.0045, 0.004, (0.081, sy * (W / 2 + 0.002), -H * 0.25), 'chrome', axis='X', segs=8,
              bev=None)
    P.views = [('a', 30, 12), ('b', 150, 15)]


def build_tl_stock(P):
    """A 1970s tail-lamp cluster for the LEFT side, facing -X: black housing, chrome surround, amber indicator
    outboard (+Y), red tail/brake in the middle, white reverse inboard; ribbed lenses over chrome reflectors."""
    P.ao_distance = 0.03
    W, H, R = 0.26, 0.11, 0.016
    sec = rrect_ring(W, H, R, seg=3)
    P.loft('housing', [K.section_x(sec, 0.0, 0.8), K.section_x(sec, -0.02, 0.96), K.section_x(sec, -0.05, 1.0)],
           'trim', cap_start=True, recalc=True)
    P.cyl('stud', 0.01, 0.014, (0.006, 0, 0), 'steel', axis='X', segs=8, bev=None)
    # lens segments (y from -W/2 inboard to +W/2 outboard)
    segs = [(-W / 2, -W / 2 + 0.055, 'lens_head'), (-W / 2 + 0.059, W / 2 - 0.074, 'lens_tail'),
            (W / 2 - 0.07, W / 2, 'lens_amber')]
    for (y0, y1, mat) in segs:
        cy = (y0 + y1) / 2
        w = (y1 - y0) - 0.006
        s2 = rrect_ring(w, H - 0.012, R * 0.7, seg=2)
        bm = bmesh.new()
        K.bm_loft(bm, [K.section_x(s2, -0.051, 1.0, cy), K.section_x(s2, -0.057, 0.94, cy),
                       K.section_x(s2, -0.06, 0.6, cy)], cap_end=True)
        bmesh.ops.reverse_faces(bm, faces=bm.faces[:])
        P.mesh('lens', bm, mat, sharp=50.0)
        nrib = max(2, int(w / 0.02))
        for i in range(3):
            z = -H * 0.27 + H * 0.27 * i
            P.box('rib', (0.003, w * 0.86, 0.006), (-0.0605, cy, z), mat, bev=None)
        # reflector backplate and bulb
        P.box('refl', (0.004, w * 0.92, H * 0.86), (-0.03, cy, 0.0), 'chrome', bev=None)
        bulb(P, -0.042, cy, 0.0, r=0.008)
    # chrome surround and dividers
    outer = rrect_ring(W + 0.016, H + 0.016, R + 0.006, seg=3)
    inner = rrect_ring(W - 0.004, H - 0.004, R - 0.002, seg=3)
    rings = [K.section_x(outer, -0.046), K.section_x(outer, -0.056), K.section_x(inner, -0.062),
             K.section_x(inner, -0.05)]
    bm = bmesh.new()
    vr, faces = K.bm_loft(bm, rings + [rings[0]])
    bmesh.ops.reverse_faces(bm, faces=faces)
    P.mesh('surround', bm, 'chrome', sharp=50.0)
    for y in (-W / 2 + 0.057, W / 2 - 0.072):
        P.box('divider', (0.012, 0.004, H - 0.004), (-0.057, y, 0.0), 'chrome', bev=0.001, segs=1)
    P.views = [('a', 210, 12), ('b', 330, 15)]


PARTS = {
    'hl_round': build_hl_round,
    'hl_square': build_hl_square,
    'tl_stock': build_tl_stock,
}


def main(args):
    K.run(PARTS, args)
