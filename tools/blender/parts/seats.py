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


PARTS = {
    'seat_bucket': build_seat_bucket,
}


def main(args):
    K.run(PARTS, args)
