"""
Fluids and electrics: batteries, fuel tanks, radiators (docs/MODCAR.md section 2.3).

    blender -b --factory-startup --python tools/blender/build.py -- parts/fluids [<id>|all] [--norender]

Origins: bottom centre; batteries and tanks long axis along X; radiators' core faces +X.
"""
import math

import bmesh
from mathutils import Matrix, Vector

from parts import _kit as K
from parts._kit import V, mat4

# ------------------------------------------------------------------------------------------- batteries


def battery(P, L, W, H, posts_side=+1, caps=6, handle=True, lid_mat='paint', case_mat='trim', moto=False):
    """A lead-acid battery: case with ribs and a base lip, a coloured lid, cell caps, two posts."""
    P.ao_distance = 0.06
    lip = 0.006 if not moto else 0.0
    hcase = H * 0.84
    # base lip (hold-down ledge) and the case with slightly tapered walls
    if lip:
        P.box('lip', (L + 2 * lip, W + 2 * lip, 0.012), (0, 0, 0.006), case_mat, bev=0.003)
    bm = bmesh.new()
    K.bm_cube(bm, (L, W, hcase), mat4((0, 0, hcase / 2)))
    for v in bm.verts:
        if v.co.z > hcase / 2:
            v.co.x *= 1.012
            v.co.y *= 1.015
    P.mesh('case', bm, case_mat, bev=0.006, segs=2)
    # vertical moulded ribs on the long sides and the ends
    nrib = max(3, int(L / 0.05))
    for s in (-1, 1):
        for i in range(nrib):
            x = -L / 2 + L * (i + 0.5) / nrib
            P.box('rib', (0.012, 0.004, hcase * 0.62), (x, s * (W / 2 + 0.001), hcase * 0.45), case_mat, bev=None,
                  open='-y' if s > 0 else '+y')
    for s in (-1, 1):
        for i in range(2):
            y = (i - 0.5) * W * 0.45
            P.box('rib', (0.004, 0.012, hcase * 0.62), (s * (L / 2 + 0.001), y, hcase * 0.45), case_mat, bev=None,
                  open='-x' if s > 0 else '+x')
    # label panel on the front long side (towards -Y)
    P.box('label', (L * 0.62, 0.003, hcase * 0.42), (0, -W / 2 - 0.0035, hcase * 0.52), 'paint_b', bev=0.0012,
          segs=1, open='+y')
    P.box('stripe', (L * 0.62, 0.0035, hcase * 0.08), (0, -W / 2 - 0.004, hcase * 0.62), lid_mat, bev=None, open='+y')
    # the lid: overhanging cover with a raised centre panel
    lid_h = H - hcase - 0.012
    z_lid = hcase
    P.box('lid', (L + 0.008, W + 0.008, lid_h * 0.55), (0, 0, z_lid + lid_h * 0.275), lid_mat, bev=0.004, segs=2)
    P.box('lid_top', (L * 0.78, W * 0.55, lid_h * 0.45), (0, -W * 0.08 * posts_side, z_lid + lid_h * 0.55 + lid_h * 0.2),
          lid_mat, bev=0.004, segs=2)
    z_top = z_lid + lid_h * 0.55 + lid_h * 0.42
    # cell caps along the centre panel
    for i in range(caps):
        x = -L * 0.33 + L * 0.66 * i / max(1, caps - 1)
        P.cyl('cap', 0.0105 if not moto else 0.006, 0.008, (x, -W * 0.08 * posts_side, z_top + 0.004), case_mat,
              segs=10, r2=0.0092 if not moto else 0.005, bev=None)
        P.box('slot', (0.013 if not moto else 0.008, 0.0025, 0.002), (x, -W * 0.08 * posts_side, z_top + 0.0085),
              case_mat, bev=None, open='-z')
    # terminal pads and posts on the +Y side
    y_post = posts_side * (W / 2 - 0.022)
    z_pad = z_lid + lid_h * 0.55
    for sx, sign in ((1, '+'), (-1, '-')):
        x = sx * (L / 2 - 0.03)
        P.cyl('pad', 0.016 if not moto else 0.009, 0.006, (x, y_post, z_pad + 0.003), case_mat, segs=12,
              r2=0.0145 if not moto else 0.008, bev=None)
        r = 0.0095 if not moto else 0.004
        if moto:
            # motorcycle battery: L-tab terminals with a bolt
            P.box('tab', (0.012, 0.004, 0.016), (x, y_post, z_pad + 0.014), 'steel', bev=0.001, segs=1)
            P.bolt((x, y_post + 0.002, z_pad + 0.016), normal=(0, 1, 0), r=0.0035, h=0.003)
        else:
            P.cyl('post', r, 0.022, (x, y_post, z_pad + 0.006 + 0.011), 'steel', segs=12, r2=r * 0.86, bev=0.0015,
                  bsegs=1)
            P.cyl('collar', r * 1.35, 0.004, (x, y_post, z_pad + 0.008), 'paint_b' if sign == '+' else case_mat,
                  segs=12, bev=None)
        # embossed sign next to the post
        sx2 = x - sx * (0.03 if not moto else 0.014)
        sz = z_pad + 0.0015
        a = 0.016 if not moto else 0.008
        P.box('sign', (a, a * 0.24, 0.003), (sx2, y_post, sz), 'paint_b', bev=None, open='-z')
        if sign == '+':
            P.box('sign', (a * 0.24, a, 0.003), (sx2, y_post, sz), 'paint_b', bev=None, open='-z')
    if handle:
        # flip-up carrying handle, lying down across the lid
        hz = z_top + 0.004
        pts = [(-L / 2 + 0.01, -W * 0.36, z_lid + lid_h * 0.3), (-L / 2 + 0.02, -W * 0.36, hz + 0.004),
               (L / 2 - 0.02, -W * 0.36, hz + 0.004), (L / 2 - 0.01, -W * 0.36, z_lid + lid_h * 0.3)]
        P.tube('handle', pts, 0.0045, 'trim', segs=8, bend=0.012)
        for s in (-1, 1):
            P.cyl('hinge', 0.007, 0.012, (s * (L / 2 + 0.004), -W * 0.36, z_lid + lid_h * 0.3), case_mat, axis='X',
                  segs=10, bev=None)


def build_bat_std(P):
    battery(P, 0.24, 0.172, 0.20)


def build_bat_truck(P):
    battery(P, 0.33, 0.175, 0.235, caps=6)


def build_bat_moto(P):
    battery(P, 0.15, 0.087, 0.13, caps=0, handle=False, moto=True)


PARTS = {
    'bat_std': build_bat_std,
}


def main(args):
    K.run(PARTS, args)
