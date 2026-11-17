"""
The place models that stand inside (src/core/world/sites.ts): the filling station's kiosk and the shop (the drinks
fridge, the counter with its till, the shelving), the farmhouse (the kitchen dresser, the wardrobe, the bed, the
kitchen table and its chairs), the roadside garage (the two-post lift, the old bench, the tool rack, the steel
shelving, the roller tool chest), the keeper's desk and a filing cabinet:

    blender -b --factory-startup --python tools/blender/build.py -- places/furniture [<id>|all] [--toon]
        [--norender] [--stats] [--look[=yaw,pitch/...]] [--open] [--cull]

Writes public/models/modcar/places/<id>.glb (conventions, movers and markers: places/_common.py).
"""
import math

import bmesh
from mathutils import Matrix

from parts import _kit as K
from parts._kit import V, mat4

from items import junk
from places import _common as C
from places._common import spec, door_l, door_r, drawer, lid, lift, free

TAU = math.tau


# ------------------------------------------------------------------------------------------------ helpers

def drawer_unit(P, name, xf, yc, zc, w, h, depth, t=0.022, front='paint', box='paint_b', pull='knob',
                knob_mat='wood', floor_mat=None, panel=False, label=False):
    """
    A drawer whose front face is at x = xf: the front (w x h, t thick, its face centred on (yc, zc)) and the box
    behind it `depth` deep (sides, back, bottom), a knob / a pull on the front. Registers it as the mover `name`
    (origin on the front face's centre) and puts M_inside_<n> on its floor. Returns the floor's height.
    """
    objs = []
    if panel:
        objs += C.panel_door(P, name + '_front', w, h, t, (xf - t, yc, zc), material=front, frame=0.035,
                             inset=0.006)
    else:
        objs.append(P.box(name + '_front', (t, w, h), (xf - t / 2, yc, zc), front, bev=0.005, segs=1))
    bw = w - 0.05
    bh = h * 0.78
    zb = zc - h / 2 + 0.012
    x0, x1 = xf - t - depth, xf - t
    tb = 0.012
    for sy in (-1, 1):
        objs.append(P.box(name + '_side', (depth, tb, bh), ((x0 + x1) / 2, yc + sy * (bw / 2 - tb / 2), zb + bh / 2),
                          box, bev=0.002, segs=1))
    objs.append(P.box(name + '_back', (tb, bw - 2 * tb, bh), (x0 + tb / 2, yc, zb + bh / 2), box, bev=0.002, segs=1))
    objs.append(P.box(name + '_bottom', (depth - tb, bw - 2 * tb, 0.008), ((x0 + x1) / 2 + tb / 2, yc, zb + 0.004),
                      floor_mat or box, bev=None))
    if pull == 'knob':
        objs.append(C.cup_knob(P, name + '_knob', (xf, yc, zc), r=0.017, h=0.026, material=knob_mat))
    elif pull == 'two':
        for sy in (-1, 1):
            objs.append(C.cup_knob(P, name + '_knob', (xf, yc + sy * w * 0.27, zc), r=0.015, h=0.024,
                                   material=knob_mat))
    elif pull == 'bar':
        objs.append(C.handle_bar(P, name + '_pull', (xf, yc, zc + h * 0.18), w * 0.6, stand=0.025, r=0.0055))
    elif pull == 'cup':
        objs.append(cup_pull(P, name + '_pull', (xf, yc, zc + h * 0.12 if not label else zc), 0.1))
    if label:
        objs.append(C.patch(P, name + '_label', 0.1, 0.04, (xf, yc, zc + h * 0.24), (1, 0, 0), 'alu', t=0.003))
        objs.append(C.patch(P, name + '_card', 0.084, 0.026, (xf + 0.003, yc, zc + h * 0.24), (1, 0, 0), 'ceramic',
                            t=0.0008))
    P.mover(name, objs, (xf, yc, zc))
    n = name.split('_')[-1]
    C.marker(P, f'M_inside_{n}', ((x0 + x1) / 2, yc, zb + 0.008), mover=name)
    return zb + 0.008


def cup_pull(P, name, c, w, material='alu'):
    """A drawer's cup pull (a half-round shell with its two lugs) on a face facing +X: c = its middle on the face."""
    x, y, z = c
    prof = [(0.0, -w / 2), (0.016, -w * 0.46), (0.02, -w * 0.3), (0.02, w * 0.3), (0.016, w * 0.46), (0.0, w / 2)]
    bm = bmesh.new()
    K.bm_sweep(bm, [V((x + px, y + py, z)) for (px, py) in prof], 1.0,
               profile=[(-0.004, -0.012), (0.004, -0.012), (0.004, 0.012), (-0.004, 0.012)], max_seg=0)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    return P.mesh(name, bm, material, sharp=50.0)


def hinge_knuckles(P, x, y, zs, r=0.007, h=0.05, material='steel'):
    """The knuckles of a door's hinges showing in the gap at its hinge edge."""
    bm = bmesh.new()
    for z in zs:
        K.bm_cyl(bm, r, h, segs=8, matrix=Matrix.Translation((x, y, z)))
    return P.mesh('hinges', bm, material, bev=None, sharp=50.0)


def plate_stand(bm, x, y, z, r, lean, t=0.008, segs=12):
    """A plate standing on its edge on a shelf at (x, y, z), leaning back (towards -X) by `lean` degrees."""
    prof = [(0.0, 0.0), (r * 0.58, 0.0), (r, t * 1.7), (r * 0.94, t * 2.3), (r * 0.6, t * 1.1), (0.0, t * 1.1)]
    m = (Matrix.Translation((x, y, z + r)) @ Matrix.Rotation(math.radians(-lean), 4, 'Y') @
         Matrix.Rotation(math.radians(90), 4, 'Y'))
    K.bm_lathe(bm, prof, segs=segs, matrix=m)


def cup_bm(bm, x, y, z, r=0.04, h=0.075, segs=10, hang=False):
    """A cup (open, a wall with its thickness) at (x, y, z), its foot down (or hanging upside down from z)."""
    prof = K.shell_profile([(r * 0.62, 0.0), (r * 0.78, h * 0.12), (r, h * 0.7), (r * 1.02, h)], 0.004)
    m = Matrix.Translation((x, y, z))
    if hang:
        m = Matrix.Translation((x, y, z)) @ Matrix.Rotation(math.pi, 4, 'X')
    K.bm_lathe(bm, [(0.0, 0.0), (r * 0.6, 0.0)], segs=segs, matrix=m)
    K.bm_lathe(bm, [(r * 0.58, 0.004), (0.0, 0.004)], segs=segs, matrix=m)
    K.bm_lathe(bm, prof, segs=segs, matrix=m, loop=True)


# ------------------------------------------------------------------------------------------------ cupboard

def cupboard(P, W=1.8):
    """
    A farmhouse kitchen dresser (1.8 x 0.5 x 1.9; cupboard_s 1.6 wide): the base cabinet on its plinth, two drawers
    across the top (DRAWER_1 on +Y, DRAWER_2) over two panelled doors (DOOR_L on +Y, DOOR_R), a shelf inside; the
    worn wooden worktop (M_top on it: shelfOf's half height); the hutch on it set back against the wall with
    shaped sides, a boarded back, two plate shelves with plates leaning on their rails, jars and a tin, cups on
    hooks, the cornice on top. Painted outside (paint), cream inside and on the back boards (paint_b).
    """
    D, H = 0.5, 1.9
    xb, xf = -0.25, 0.25
    hw = W / 2
    xc = 0.205                                     # the carcass's front edge
    t = 0.024
    zw = 0.915                                     # under the worktop
    # ---- the base cabinet
    C.block(P, 'plinth', (D - 0.06, W - 0.05, 0.09), (xb + (D - 0.06) / 2, 0.0, 0.045), 'paint', bev=0.004, segs=1)
    for sy in (-1, 1):
        C.block(P, 'side', (xc - xb, t, zw - 0.09), ((xb + xc) / 2, sy * (hw - t / 2), 0.09 + (zw - 0.09) / 2),
                'paint', bev=0.006, segs=1, step=0.3, axes=(2,))
    C.block(P, 'bottom', (xc - xb - 0.012, W - 2 * t, 0.02), ((xb + xc) / 2 + 0.006, 0.0, 0.1), 'paint_b', bev=0.002, segs=1)
    C.block(P, 'back', (0.012, W - 2 * t, zw - 0.09), (xb + 0.006, 0.0, 0.09 + (zw - 0.09) / 2), 'paint_b', bev=None)
    C.block(P, 'shelf_in', (xc - xb - 0.04, W - 2 * t - 0.004, 0.018), ((xb + xc) / 2 - 0.01, 0.0, 0.42), 'paint_b',
          bev=0.002, segs=1)
    C.block(P, 'mid_post', (0.04, 0.03, zw - 0.11), (xc - 0.02, 0.0, 0.11 + (zw - 0.11) / 2), 'paint', bev=0.003, segs=1)
    zr = 0.735                                     # the rail between the drawers and the doors
    C.block(P, 'rail', (0.04, W - 2 * t, 0.026), (xc - 0.02, 0.0, zr), 'paint', bev=0.003, segs=1)
    C.block(P, 'rail_top', (0.04, W - 2 * t, 0.024), (xc - 0.02, 0.0, zw - 0.012), 'paint', bev=0.003, segs=1)
    C.block(P, 'runner', (xc - xb - 0.02, W - 2 * t, 0.012), ((xb + xc) / 2, 0.0, zr + 0.006), 'paint_b', bev=None)
    # ---- the worktop: two thick boards, the front edge rounded and worn
    zt = zw + 0.035
    xm = (xb + xf - 0.012) / 2
    for (x0, x1, dz) in ((xb, xm - 0.0015, 0.0), (xm + 0.0015, xf - 0.012, -0.0015)):
        bm = K.bm_new()
        K.bm_cube(bm, (x1 - x0, W + 0.01, 0.035 + dz), mat4(((x0 + x1) / 2, 0.0, zw + (0.035 + dz) / 2)))
        C.cuts(bm, (x1 - x0, W + 0.01, 0.035), 0.45, axes=(1,))
        for v in bm.verts:
            # (worn down a little along the front where hands go)
            if v.co.x > 0.1 and v.co.z > zw + 0.03:
                v.co.z -= 0.003 * (1 - (2 * v.co.y / W) ** 2)
        P.mesh('worktop', bm, 'wood', bev=0.008 if x0 > xb else 0.005, segs=2 if x0 > xb else 1)
    # ---- the drawers and the doors (overlay, 22 mm)
    tf = 0.022
    dxf = xc + tf
    dw = (W - 2 * t) / 2 - 0.004
    zd0, zd1 = zr + 0.016, zw - 0.006
    for k, sy in enumerate((1, -1)):
        yc = sy * (dw / 2 + 0.003)
        drawer_unit(P, f'DRAWER_{k + 1}', dxf, yc, (zd0 + zd1) / 2, dw, zd1 - zd0, xc - xb - 0.03, t=tf, pull='two')
    zo0, zo1 = 0.105, zr - 0.016
    for name, sy in (('DOOR_L', 1), ('DOOR_R', -1)):
        yc = sy * (dw / 2 + 0.003)
        objs = C.panel_door(P, name, dw, zo1 - zo0, tf, (xc, yc, (zo0 + zo1) / 2), material='paint', frame=0.07,
                            inset=0.007)
        objs.append(C.cup_knob(P, name + '_knob', (dxf, yc - sy * (dw / 2 - 0.06), zo1 - 0.12), r=0.016, h=0.026,
                               material='wood'))
        hy = sy * (dw + 0.003)
        P.mover(name, objs, (dxf, hy, (zo0 + zo1) / 2))
        hinge_knuckles(P, dxf - 0.004, sy * (dw + 0.006), (zo0 + 0.09, zo1 - 0.09))
    # ---- the hutch, set back against the wall
    xh = xb + 0.27                                 # its front edge
    zh0, zh1 = zt, H - 0.07
    side = [(xb, zh0), (xb + 0.2, zh0), (xb + 0.2, zh0 + 0.03), (xb + 0.24, zh0 + 0.1), (xb + 0.255, zh0 + 0.3),
            (xh, zh0 + 0.42), (xh, zh1), (xb, zh1)]
    hy0 = hw - 0.045
    for sy in (-1, 1):
        P.prism('hutch_side', side, t, matrix=mat4((0, sy * (hy0 - t / 2), 0), (90, 0, 0)), material='paint',
                bev=0.006, segs=1)
    # the back: boards (cream) with a hair of a gap between each, on a backing sheet
    nb = int(round((2 * hy0 - 2 * t) / 0.2))
    bw = (2 * hy0 - 2 * t) / nb
    C.block(P, 'backing', (0.006, 2 * hy0 - 2 * t, zh1 - zh0), (xb + 0.003, 0.0, (zh0 + zh1) / 2), 'paint_b', bev=None)
    for i in range(nb):
        y = -hy0 + t + bw * (i + 0.5)
        C.block(P, 'board', (0.01, bw - 0.004, zh1 - zh0), (xb + 0.011, y, (zh0 + zh1) / 2), 'paint_b', bev=None,
                step=0.3, axes=(2,))
    # the two plate shelves, each with its rail and a groove, and the top
    shelves = (1.27, 1.6)
    sd = xh - xb - 0.014
    for z in shelves:
        C.block(P, 'shelf', (sd, 2 * hy0 - 2 * t, 0.022), (xb + 0.012 + sd / 2, 0.0, z - 0.011), 'paint', bev=0.004, segs=1)
        C.block(P, 'plate_rail', (0.016, 2 * hy0 - 2 * t, 0.022), (xb + 0.14, 0.0, z + 0.011), 'paint', bev=0.003,
              segs=1)
    C.block(P, 'hutch_top', (xh - xb + 0.01, 2 * hy0 + 0.01, 0.024), ((xb + xh) / 2 + 0.005, 0.0, zh1 - 0.012), 'paint',
          bev=0.004, segs=1)
    # the cornice: a stepped moulding out over the front and the ends
    for (dz, dx, ht) in ((0.0, 0.02, 0.026), (0.026, 0.04, 0.03), (0.056, 0.03, 0.014)):
        C.block(P, 'cornice', (xh - xb + dx, 2 * hy0 + 2 * dx, ht), ((xb + xh + dx) / 2, 0.0, zh1 + dz + ht / 2), 'paint',
              bev=0.005, segs=1)
    # the valance under the top
    C.block(P, 'valance', (0.018, 2 * hy0 - 2 * t, 0.06), (xh - 0.012, 0.0, zh1 - 0.054), 'paint', bev=0.004, segs=1)
    # ---- what is on it: plates on the shelves, jars and a tin, cups hanging under the lower shelf
    bm = bmesh.new()
    for z, n, r in ((shelves[1], 5, 0.115), (shelves[0], 3, 0.1)):
        for i in range(n):
            y = (i - (n - 1) / 2) * (2 * r + 0.035) + 0.01 * C.jit(i, z)
            if z == shelves[0] and i == 1:
                continue
            plate_stand(bm, xb + 0.072 + 0.006 * C.jit(i, 2 * z), y, z, r, 13 + 3 * C.jit(i, z + 1))
    P.mesh('plates', bm, 'ceramic', sharp=45.0)
    z0 = shelves[0]
    jars = [(xb + 0.13, -hy0 + 0.17, z0, 0.045, 0.14), (xb + 0.13, -hy0 + 0.28, z0, 0.04, 0.11),
            (xb + 0.12, hy0 - 0.16, z0, 0.05, 0.16)]
    C.rounds(P, 'jars', jars, 'glass', C.JAR, segs=8)
    C.rounds(P, 'jar_lids', [(x, y, z + h * 0.86, r * 0.92, h * 0.16) for (x, y, z, r, h) in jars], 'paint_b',
             [(0.0, 0.0), (1.0, 0.0), (1.0, 1.0), (0.0, 1.0)], segs=8)
    C.rounds(P, 'jar_fill', [(x, y, z + 0.006, r * 0.86, h * 0.55) for (x, y, z, r, h) in jars], 'wood',
             [(0.0, 0.0), (1.0, 0.0), (1.0, 1.0), (0.0, 1.0)], segs=8)
    C.rounds(P, 'tin', [(xb + 0.12, 0.05, z0, 0.06, 0.15)], 'paint_b', C.CAN, segs=12)
    # two bowls stacked on the lower shelf
    bowl = K.shell_profile([(0.04, 0.0), (0.07, 0.02), (0.085, 0.055)], 0.005)
    bm = bmesh.new()
    for k in range(2):
        C.lathe_bm(bm, [(r, z + k * 0.018) for (r, z) in bowl], (xb + 0.12, 0.3 if W > 1.7 else 0.26, z0), segs=10)
    P.mesh('bowls', bm, 'paint_b', sharp=50.0)
    # ---- markers: inside the base on its shelf, on the worktop in front of the hutch
    C.marker(P, 'M_inside', ((xb + xc) / 2 - 0.01, 0.0, 0.429))
    C.marker(P, 'M_top', ((xh + xf) / 2 - 0.01, 0.0, zt))
    P.views = [('a', 30, 14), ('b', 215, 20)]


# ------------------------------------------------------------------------------------------------ wardrobe

def garment(P, name, outline, y, x0, ztop, t, material):
    """A garment hanging flat in the plane Y = y from its hanger: outline = [(x, z), ...] counter-clockwise round
    the hook point (x across the wardrobe's depth, z up, the hem below), t thick, its edges softly rounded."""
    poly = [(x0 + x, ztop + z) for (x, z) in outline]
    return P.prism(name, poly, t, matrix=mat4((0, y, 0), (90, 0, 0)), material=material, bev=0.012, segs=2)


COAT = [(-0.23, -0.95), (0.23, -0.95), (0.215, -0.26), (0.2, -0.075), (0.11, -0.035), (0.035, -0.015),
        (-0.035, -0.015), (-0.11, -0.035), (-0.2, -0.075), (-0.215, -0.26)]
DRESS = [(-0.25, -1.08), (0.25, -1.08), (0.14, -0.42), (0.15, -0.12), (0.12, -0.04), (0.04, -0.03), (-0.04, -0.03),
         (-0.12, -0.04), (-0.15, -0.12), (-0.14, -0.42)]
SHIRT = [(-0.2, -0.72), (0.2, -0.72), (0.205, -0.2), (0.19, -0.07), (0.1, -0.035), (0.03, -0.02), (-0.03, -0.02),
         (-0.1, -0.035), (-0.19, -0.07), (-0.205, -0.2)]


def hanger(P, x0, y, zh, zr):
    """A wooden coat hanger at (x0, y), its shoulders at zh, the steel hook over the rail at height zr."""
    P.tube('hanger', [(x0 - 0.2, y, zh - 0.05), (x0, y, zh - 0.012), (x0 + 0.2, y, zh - 0.05)], 0.008, 'wood', segs=6,
           bend=0.06)
    P.tube('hook', [(x0, y, zh - 0.012), (x0, y, zr + 0.004), (x0 - 0.012, y, zr + 0.019), (x0 - 0.024, y, zr + 0.006)],
           0.0026, 'steel', segs=4, bend=0.008)


def folded(P, name, x, y, z, w, d, n, mats, seed=0.0):
    """A stack of n folded clothes on a shelf: each a soft slab a little askew."""
    zz = z
    for k in range(n):
        h = 0.045 + 0.012 * C.jit(k, seed)
        C.block(P, name, (w + 0.02 * C.jit(k, seed + 1), d + 0.02 * C.jit(k, seed + 2), h),
                (x + 0.01 * C.jit(k, seed + 3), y + 0.012 * C.jit(k, seed + 4), zz + h / 2), mats[k % len(mats)],
                rot=(0, 0, 4 * C.jit(k, seed + 5)), bev=0.016, segs=2)
        zz += h
    return zz


def wardrobe(P):
    """
    A painted wardrobe (1.4 x 0.6 x 2.0): the carcass on its moulded base and bracket feet, the cornice, two tall
    doors with two panels each (DOOR_L on +Y, DOOR_R), knobs and a keyhole. Inside, a partition: behind DOOR_L the
    hanging rail under a hat shelf with a coat, a dress and a shirt on hangers; behind DOOR_R three shelves with
    folded clothes and a hat box, the middle one left clear (M_inside: shelfOf's half height).
    """
    W, D, H = 1.4, 0.6, 2.0
    xb = -0.3
    hw = W / 2
    hc = hw - 0.022                              # the carcass, inside the cornice's overhang
    t = 0.024
    xc = 0.25
    tf = 0.022
    z0, zc1 = 0.1, 1.88
    # the base and its feet
    for sx in (-1, 1):
        for sy in (-1, 1):
            C.block(P, 'foot', (0.075, 0.075, 0.045), ((xb + 0.04) if sx < 0 else (xc - 0.015), sy * (hc - 0.04),
                                                        0.0225), 'paint', bev=0.008, segs=1)
    C.block(P, 'base', (xc + tf + 0.004 - xb, 2 * hc + 0.012, 0.058), ((xb + xc + tf + 0.004) / 2, 0.0, 0.045 + 0.029),
            'paint', bev=0.007, segs=2)
    # the carcass
    for sy in (-1, 1):
        C.block(P, 'side', (xc - xb, t, zc1 - z0), ((xb + xc) / 2, sy * (hc - t / 2), (z0 + zc1) / 2), 'paint',
                bev=0.006, segs=1, step=0.35, axes=(2,))
    C.block(P, 'back', (0.012, 2 * hc - 2 * t, zc1 - z0), (xb + 0.006, 0.0, (z0 + zc1) / 2), 'paint_b', bev=None,
            step=0.4, axes=(1, 2))
    C.block(P, 'bottom', (xc - xb - 0.012, 2 * hc - 2 * t, 0.02), ((xb + xc) / 2 + 0.006, 0.0, z0 + 0.01), 'paint_b',
            bev=0.002)
    C.block(P, 'top', (xc - xb, 2 * hc, 0.022), ((xb + xc) / 2, 0.0, zc1 - 0.011), 'paint', bev=0.003)
    C.block(P, 'partition', (xc - xb - 0.03, 0.02, zc1 - z0 - 0.042), ((xb + xc) / 2 - 0.009, 0.0, (z0 + zc1) / 2),
            'paint_b', bev=0.002, step=0.4, axes=(2,))
    C.block(P, 'stile', (0.03, 0.03, zc1 - z0 - 0.042), (xc - 0.015, 0.0, (z0 + zc1) / 2), 'paint', bev=0.003)
    # the cornice: stepped out over the front and the ends
    for (dz, dx, ht) in ((0.0, 0.01, 0.035), (0.035, 0.024, 0.05), (0.085, 0.016, 0.035)):
        C.block(P, 'cornice', (xc + tf - xb + dx, 2 * hc + 2 * dx, ht), ((xb + xc + tf + dx) / 2, 0.0, zc1 + dz + ht / 2),
                'paint', bev=0.006, segs=1)
    # the doors (overlay), two panels each, knobs at the meeting edges, a keyhole on DOOR_R
    dxf = xc + tf
    dw = hc - 0.004
    zd0, zd1 = z0 + 0.006, zc1 - 0.008
    for name, sy in (('DOOR_L', 1), ('DOOR_R', -1)):
        yc = sy * (dw / 2 + 0.003)
        objs = C.panel_door(P, name, dw, zd1 - zd0, tf, (xc, yc, (zd0 + zd1) / 2), material='paint', frame=0.08,
                            inset=0.008, rows=2)
        ky = yc - sy * (dw / 2 - 0.05)
        objs.append(C.cup_knob(P, name + '_knob', (dxf, ky, 1.02), r=0.017, h=0.028, material='wood'))
        if sy < 0:
            objs.append(C.patch(P, 'keyhole', 0.022, 0.04, (dxf, ky, 0.93), (1, 0, 0), 'chrome', t=0.002))
            bm = bmesh.new()
            C.rect_face(bm, 0.005, 0.014, (dxf + 0.0025, ky, 0.93), (1, 0, 0))
            objs.append(P.mesh('keyhole_slot', bm, 'trim', sharp=50.0))
        P.mover(name, objs, (dxf, sy * (dw + 0.003), (zd0 + zd1) / 2))
        hinge_knuckles(P, dxf - 0.004, sy * (dw + 0.006), (zd0 + 0.15, (zd0 + zd1) / 2, zd1 - 0.15))
    # ---- inside behind DOOR_L: the hat shelf, the rail, three things on hangers
    xm = (xb + xc) / 2 - 0.01
    yi0, yi1 = 0.01, hc - t
    C.block(P, 'hat_shelf', (xc - xb - 0.04, yi1 - yi0, 0.018), (xm, (yi0 + yi1) / 2, 1.73), 'paint_b', bev=0.002)
    zr = 1.66
    P.cyl('rail', 0.011, yi1 - yi0, (xm, (yi0 + yi1) / 2, zr), 'chrome', axis='Y', segs=10, bev=None)
    for y in (yi0 + 0.008, yi1 - 0.008):
        C.block(P, 'rail_cup', (0.04, 0.016, 0.04), (xm, y, zr), 'steel', bev=0.003)
    for (y, out, mat, th, dz) in ((0.13, COAT, 'paint_b', 0.07, 0.0), (0.33, DRESS, 'fabric', 0.045, 0.0),
                                  (0.5, SHIRT, 'paint', 0.05, 0.0)):
        hanger(P, xm, y, zr - 0.035, zr)
        garment(P, 'garment', out, y, xm, zr - 0.04 + dz, th, mat)
    # ---- behind DOOR_R: three shelves, the middle one clear
    ys0, ys1 = -hc + t, -0.01
    yc = (ys0 + ys1) / 2
    for z in (0.55, 1.0, 1.45):
        C.block(P, 'shelf', (xc - xb - 0.03, ys1 - ys0, 0.02), (xm, yc, z - 0.01), 'paint_b', bev=0.003)
    folded(P, 'clothes', xm + 0.01, yc - 0.08, 0.55, 0.3, 0.26, 3, ['fabric', 'paint', 'paint_b'], seed=1.0)
    folded(P, 'clothes', xm + 0.03, yc + 0.17, 0.55, 0.26, 0.24, 2, ['paint_b', 'fabric'], seed=2.0)
    folded(P, 'clothes', xm, yc - 0.1, 1.45, 0.3, 0.26, 2, ['paint', 'fabric'], seed=3.0)
    P.lathe('hatbox', [(0.0, 0.0), (0.13, 0.0), (0.135, 0.004), (0.135, 0.14), (0.142, 0.142), (0.142, 0.17),
                       (0.0, 0.172)], loc=(xm - 0.04, yc + 0.15, 1.45), material='paint_b', segs=16, sharp=45.0)
    C.marker(P, 'M_inside', (xm, yc, 1.0))
    P.views = [('a', 30, 12), ('b', 215, 18)]


# ------------------------------------------------------------------------------------------------ bed

def bed(P):
    """
    A wooden farmhouse bed (2.0 x 1.0, the mattress top at 0.5 where things are laid; the headboard on +Y rises to
    0.9): square posts with turned caps, a slatted headboard and footboard, the side rails, the mattress, a blanket
    (paint) tucked over it with the sheet (paint_b) turned down over its top, a pillow with a dent in it, an old
    suitcase pushed under the bed.
    """
    hl, hx = 1.0, 0.5
    ps = 0.07
    for (y, ht) in ((hl - ps / 2, 0.9), (-hl + ps / 2, 0.64)):
        for sx in (-1, 1):
            C.block(P, 'post', (ps, ps, ht - 0.03), (sx * (hx - ps / 2), y, (ht - 0.03) / 2), 'wood', bev=0.008, segs=2,
                    step=0.3, axes=(2,))
            P.lathe('cap', [(0.0, 0.0), (0.032, 0.0), (0.036, 0.008), (0.03, 0.02), (0.016, 0.028), (0.0, 0.03)],
                    loc=(sx * (hx - ps / 2), y, ht - 0.03), material='wood', segs=10, sharp=45.0)
    # the headboard (+Y) and the footboard: two rails and slats between
    for (y, zl, zt, n) in ((hl - ps / 2, 0.44, 0.8, 6), (-hl + ps / 2, 0.38, 0.56, 5)):
        C.block(P, 'top_rail', (2 * hx - 2 * ps + 0.01, 0.04, 0.075), (0.0, y, zt), 'wood', bev=0.008, segs=2)
        C.block(P, 'low_rail', (2 * hx - 2 * ps + 0.01, 0.035, 0.05), (0.0, y, zl), 'wood', bev=0.005, segs=1)
        span = 2 * hx - 2 * ps
        for i in range(n):
            x = -span / 2 + span * (i + 0.5) / n
            C.block(P, 'slat', (0.055, 0.02, zt - zl - 0.06), (x, y, (zl + zt) / 2), 'wood', bev=0.004, segs=1)
    # the side rails
    for sx in (-1, 1):
        C.block(P, 'side_rail', (0.032, 2 * hl - 2 * ps, 0.15), (sx * (hx - 0.03), 0.0, 0.27), 'wood', bev=0.006,
                segs=1, step=0.4, axes=(1,))
    # the mattress (mostly hidden) and the blanket over it
    zm0, zm1 = 0.3, 0.448
    C.block(P, 'mattress', (2 * hx - 0.1, 2 * hl - 2 * ps - 0.02, zm1 - zm0), (0.0, -0.01, (zm0 + zm1) / 2), 'paint_b',
            bev=0.035, segs=2)
    yb0, yb1 = -hl + ps + 0.01, 0.42

    def blanket(u, v):
        # u along the bed from the foot, v across: over the top, rolled over the edges and down the sides
        y = yb0 + (yb1 - yb0) * u
        s = 2 * v - 1
        a = abs(s)
        half = hx - 0.045
        if a < 0.62:
            x = s * half * 0.62 / 0.62 * (a / 0.62) * 0.94
            z = zm1 + 0.016 + 0.006 * math.sin(7 * u + 3 * s) - 0.004 * a
        elif a < 0.8:
            k = (a - 0.62) / 0.18
            ang = k * math.pi / 2
            x = math.copysign(half * 0.94 + 0.03 * math.sin(ang), s)
            z = zm1 + 0.016 - 0.03 * (1 - math.cos(ang))
        else:
            k = (a - 0.8) / 0.2
            x = math.copysign(half * 0.94 + 0.03 + 0.012 * k, s)
            z = zm1 - 0.014 - 0.12 * k + 0.012 * math.sin(9 * u)
        if u < 0.06:
            # (tucked in at the foot)
            z -= 0.03 * (1 - u / 0.06) * min(1.0, 1.4 - a)
        return (x, y, z)

    P.mesh('blanket', junk.grid_sheet(12, 16, blanket, 0.008), 'paint', sharp=60.0)
    # the sheet turned down over the blanket's top edge
    junk.cushion(P, 'turndown', (2 * hx - 0.12, 0.17, 0.024), (0.0, yb1 - 0.06, zm1 + 0.028), 'paint_b', r=0.01,
                 step=0.2)
    # the pillow, a dent where the head was
    junk.cushion(P, 'pillow', (0.62, 0.36, 0.13), (0.0, hl - ps - 0.22, zm1 + 0.055), 'paint_b', r=0.035, sag=0.035,
                 at=(0.1, 0.0), spread=0.35, step=0.12)
    # the suitcase under it
    C.block(P, 'suitcase', (0.42, 0.62, 0.14), (-0.06, -0.3, 0.075), 'leather', rot=(0, 0, 4), bev=0.012, segs=2)
    for sx in (-1, 1):
        for sy in (-1, 1):
            p = C.turned((-0.06, -0.3, 0.0), 4) @ V((sx * 0.2, sy * 0.3, 0.075))
            C.block(P, 'corner', (0.03, 0.03, 0.146), tuple(p), 'steel', rot=(0, 0, 4), bev=0.004)
    C.marker(P, 'M_top', (0.0, -0.2, zm1 + 0.024))
    P.views = [('a', 35, 22), ('b', 215, 24)]


# ------------------------------------------------------------------------------------------------ kitchen table

def kitchen_chair(P, loc, yaw):
    """A painted kitchen chair facing +X (built round the origin, then turned by yaw and set at loc): splayed
    legs, the back legs running up as the posts, a top rail and three spindles, stretchers, a wooden seat."""
    since = C.mark(P)
    zs = 0.45
    for sy in (-1, 1):
        C.plank(P, 'leg', (0.17, sy * 0.175, zs - 0.03), (0.185, sy * 0.19, 0.0), 0.036, 0.036, 'paint', up=(1, 0, 0),
                bev=0.004, step=None)
        C.plank(P, 'post', (-0.185, sy * 0.19, 0.0), (-0.235, sy * 0.175, 0.9), 0.036, 0.034, 'paint', up=(1, 0, 0),
                bev=0.005, step=None)
    C.block(P, 'seat', (0.42, 0.43, 0.03), (0.0, 0.0, zs - 0.015), 'wood', bev=0.008, segs=2)
    lean = math.degrees(math.atan2(0.05, 0.9))

    def post_x(z):
        return -0.185 - 0.05 * z / 0.9

    C.block(P, 'top_rail', (0.026, 0.39, 0.075), (post_x(0.83), 0.0, 0.83), 'paint', rot=(0, -lean, 0), bev=0.008,
            segs=2)
    C.block(P, 'back_rail', (0.024, 0.36, 0.035), (post_x(0.56), 0.0, 0.56), 'paint', rot=(0, -lean, 0), bev=0.005)
    for y in (-0.08, 0.0, 0.08):
        C.post(P, 'spindle', (post_x(0.575), y, 0.575), (post_x(0.795), y, 0.795), 0.011, 'paint', segs=6, bev=None)
    for (a, b) in (((0.178, -0.18, 0.14), (0.178, 0.18, 0.14)), ((-0.19, -0.19, 0.14), (-0.19, 0.19, 0.14)),
                   ((0.175, 0.185, 0.22), (-0.19, 0.19, 0.22)), ((0.175, -0.185, 0.22), (-0.19, -0.19, 0.22))):
        C.post(P, 'stretcher', a, b, 0.011, 'paint', segs=6, bev=None)
    C.xform(P, since, C.turned(loc, yaw))


def ktable(P):
    """
    The farmhouse kitchen table (1.4 x 0.9, the scrubbed top at 0.76 where things are laid): three boards on a
    painted apron with a cutlery drawer's front and its knob, four tapered legs; one chair tucked in on the front
    (+X) side, the other pushed back from it and left askew.
    """
    hy, hx, zt = 0.7, 0.45, 0.76
    for i, (x0, x1) in enumerate(((-hx, -0.15), (-0.148, 0.148), (0.15, hx))):
        dz = (0.0, -0.002, 0.0015)[i]
        C.block(P, 'top', (x1 - x0, 2 * hy, 0.035 + dz), ((x0 + x1) / 2, 0.0, zt - (0.035 + dz) / 2), 'wood',
                bev=0.006 if i != 1 else 0.003, segs=2 if i != 1 else 1, step=0.45, axes=(1,))
    za = zt - 0.035
    for sx in (-1, 1):
        C.block(P, 'apron', (0.022, 2 * hy - 0.16, 0.11), (sx * (hx - 0.07), 0.0, za - 0.055), 'paint', bev=0.004)
        C.block(P, 'apron', (2 * hx - 0.16, 0.022, 0.11), (0.0, sx * (hy - 0.07), za - 0.055), 'paint', bev=0.004)
        for sy in (-1, 1):
            C.plank(P, 'leg', (sx * (hx - 0.07), sy * (hy - 0.07), za), (sx * (hx - 0.075), sy * (hy - 0.075), 0.0),
                    0.058, 0.058, 'paint', up=(1, 0, 0), bev=0.006, step=None)
    C.block(P, 'drawer_front', (0.012, 0.42, 0.075), (hx - 0.053, 0.25, za - 0.055), 'paint', bev=0.004)
    C.cup_knob(P, 'knob', (hx - 0.047, 0.25, za - 0.055), r=0.014, h=0.022, material='wood')
    kitchen_chair(P, (0.6, 0.22, 0.0), 186.0)
    kitchen_chair(P, (-0.86, -0.16, 0.0), 24.0)
    C.marker(P, 'M_top', (0.0, 0.0, zt))
    P.views = [('a', 35, 26), ('b', 215, 26)]


# ------------------------------------------------------------------------------------------------ the station's kiosk, the shop

def goods(P, name, x0, x1, y0, y1, z, seed, kinds=('tin', 'packet', 'bottle', 'jar'), gap=0.35, depth=1):
    """
    What is left on a shop's shelf board from y0 to y1 at height z, its front edge at x1 (the back at x0): runs of
    tins, packets, bottles and jars with gaps between them, now and then one lying over; one object per material.
    """
    tins, tin_lids, packets, packets_b, bottles, bottles_d, jars, caps = [], [], [], [], [], [], [], []
    y = y0 + 0.04
    k = 0
    while y < y1 - 0.06:
        kind = kinds[int((C.jit(k, seed) + 0.5) * len(kinds)) % len(kinds)]
        run = 2 + int((C.jit(k, seed + 1) + 0.5) * 3)
        for j in range(run):
            if y > y1 - 0.06:
                break
            xr = x1 - 0.06 - 0.015 * C.jit(j, seed + k)
            if kind == 'tin':
                r, h = 0.036, 0.1
                tins.append((xr, y + r, z, r, h))
                tin_lids.append((xr, y + r, z + h, r * 0.9, 0.006))
                y += 2 * r + 0.008
            elif kind == 'packet':
                sx, sy, sz = 0.07, 0.14, 0.2 + 0.03 * C.jit(j, seed)
                (packets if j % 2 == 0 else packets_b).append((xr - 0.01, y + sy / 2, z, sx, sy, sz,
                                                               6 * C.jit(j, seed + 2)))
                y += sy + 0.01
            elif kind == 'bottle':
                r, h = 0.034, 0.27
                (bottles if (k + seed) % 2 else bottles_d).append((xr, y + r, z, r, h))
                caps.append((xr, y + r, z + h, r * 0.42, 0.012))
                y += 2 * r + 0.012
            else:
                r, h = 0.042, 0.13
                jars.append((xr, y + r, z, r, h))
                caps.append((xr, y + r, z + h * 0.84, r * 0.95, h * 0.18))
                y += 2 * r + 0.01
        y += gap * (0.5 + C.jit(k, seed + 3) + 0.5)
        k += 1
    if tins:
        C.rounds(P, name + '_tins', tins, 'alu', C.CAN, segs=8)
        C.rounds(P, name + '_tin_bands', [(x, y_, z_ + h * 0.18, r * 1.03, h * 0.62) for (x, y_, z_, r, h) in tins],
                 'paint_b', [(0.0, 0.0), (1.0, 0.0), (1.0, 1.0), (0.0, 1.0)], segs=8)
    if packets:
        C.boxes(P, name + '_packets', packets, 'paint')
    if packets_b:
        C.boxes(P, name + '_packets', packets_b, 'ceramic')
    if bottles:
        C.rounds(P, name + '_bottles', bottles, 'glass', BOTTLE7, segs=8)
    if bottles_d:
        C.rounds(P, name + '_bottles', bottles_d, 'glass_dark', BOTTLE7, segs=8)
    if jars:
        C.rounds(P, name + '_jars', jars, 'glass', C.JAR, segs=8)
    if caps:
        C.rounds(P, name + '_caps', caps, 'paint_b', [(0.0, 0.0), (1.0, 0.0), (1.0, 1.0), (0.0, 1.0)], segs=8)


BOTTLE7 = [(0.0, 0.0), (0.92, 0.0), (1.0, 0.05), (1.0, 0.6), (0.45, 0.8), (0.38, 1.0), (0.0, 1.0)]


def shelf_boards(h):
    """The heights of the boards of a set of shelves h tall (sites.ts shelfBoards: the game draws its things there)."""
    n = max(3, round(h / 0.45))
    return [0.12 + i * (h - 0.16) / (n - 1) for i in range(n)]


def found_board(h):
    """The board things found are laid on (sites.ts shelfOf: the one nearest 1.05 m)."""
    return min(shelf_boards(h), key=lambda z: abs(z - 1.05))


def shelf(P, W=2.2, D=0.5, H=1.9, double=False):
    """
    A shop's shelving (2.2 x 0.5 x 1.9; shelf_shop 2.4 x 0.5 x 1.8; shelf_mid, the island in the middle of a
    shop, 2.6 x 0.55 x 1.5, shelved on both sides): painted steel uprights with their slots, a back panel, the
    plinth, the boards at the heights the game lays things on (sites.ts shelfBoards), each with a price strip;
    what is left on it, a few runs of tins, packets, bottles and jars, the board for what is found (M_inside)
    and the top one left clear.
    """
    hw, hd = W / 2, D / 2
    boards = shelf_boards(H)
    zf = found_board(H)
    nb = max(1, round(W / 1.25))
    bay = (W - 0.05) / nb
    ys = [-hw + 0.025 + bay * i for i in range(nb + 1)]
    xback = 0.0 if double else -hd + 0.012
    # the uprights (front and back), their slots, the plinth, the back panel
    for y in ys:
        for x in ((hd - 0.02, -hd + 0.02) if double else (hd - 0.02, -hd + 0.02)):
            C.block(P, 'upright', (0.035, 0.05 if abs(y) > hw - 0.03 else 0.04, H), (x, y, H / 2), 'paint',
                    bev=0.004, step=0.5, axes=(2,))
        bm = bmesh.new()
        for z in [0.2 + 0.08 * i for i in range(int((H - 0.3) / 0.08))]:
            if any(abs(z - b) < 0.05 for b in boards):
                continue
            C.rect_face(bm, 0.008, 0.03, (hd - 0.002, y, z), (1, 0, 0))
            if double:
                C.rect_face(bm, 0.008, 0.03, (-hd + 0.002, y, z), (-1, 0, 0))
        P.mesh('slots', bm, 'trim', sharp=50.0)
    C.block(P, 'plinth', (D - 0.03 if double else D - 0.02, W - 0.06, boards[0] - 0.025),
            (0.0 if double else -0.005, 0.0, (boards[0] - 0.025) / 2), 'paint', bev=0.005, step=0.5, axes=(1,))
    C.block(P, 'back', (0.018, W - 0.06, H - boards[0] - 0.01), (xback, 0.0, (H + boards[0]) / 2), 'paint', bev=0.003,
            step=0.4, axes=(1, 2))
    # the boards and their price strips
    sides = (1, -1) if double else (1,)
    for z in boards:
        for sg in sides:
            x0, x1 = (0.012, hd - 0.004) if double else (-hd + 0.022, hd - 0.004)
            if sg < 0:
                x0, x1 = -x1, -x0
            C.block(P, 'board', (x1 - x0, W - 0.06, 0.022), ((x0 + x1) / 2, 0.0, z - 0.011), 'paint_b', bev=0.003,
                    step=0.6, axes=(1,))
            xs = x1 if sg > 0 else x0
            C.block(P, 'strip', (0.012, W - 0.07, 0.04), (xs + sg * 0.004, 0.0, z - 0.012), 'paint', bev=0.003)
            # a few price tickets on the strips
            bm = bmesh.new()
            for i in range(nb * 3):
                yt = -hw + 0.2 + i * (W - 0.4) / max(1, nb * 3 - 1)
                if C.jit(i, z + sg) > 0.25:
                    continue
                C.rect_face(bm, 0.05, 0.026, (xs + sg * 0.0105, yt, z - 0.012), (sg, 0, 0))
            if bm.faces:
                P.mesh('tickets', bm, 'ceramic', sharp=50.0)
            else:
                bm.free()
            if abs(z - zf) < 1e-6 or z == boards[-1]:
                continue
            kinds = ('tin', 'packet', 'bottle', 'jar') if z > 0.3 else ('packet', 'bottle', 'tin')
            if sg > 0:
                goods(P, 'goods', x0, x1, -hw + 0.05, hw - 0.05, z, seed=round(z * 37 + W), kinds=kinds)
            else:
                goods_back(P, x0, x1, -hw + 0.05, hw - 0.05, z, seed=round(z * 37 + 11 + W))
    C.marker(P, 'M_inside', (hd * 0.4 if double else 0.0, 0.0, zf))
    P.views = [('a', 32, 16), ('b', 215, 20)]


def goods_back(P, x0, x1, y0, y1, z, seed):
    """(goods on the back side of an island shelf: built on the front, then turned round)"""
    since = C.mark(P)
    goods(P, 'goods_b', -x1, -x0, -y1, -y0, z, seed)
    C.xform(P, since, Matrix.Rotation(math.pi, 4, 'Z'))


def icebox(P):
    """
    A shop's drinks fridge (0.9 x 0.7 x 1.7): the cabinet on its feet, the lit header with a raised roundel, the
    kick grille, a white liner inside with four wire shelves, each with its price strip: cartons, big water
    bottles, brown beer bottles, cans; the glass DOOR in its aluminium frame on a rubber seal, its long handle on
    the free (+Y) edge (hinged on -Y). M_inside on the middle shelf.
    """
    W, D, H = 0.9, 0.7, 1.7
    hw, xb, xf = W / 2, -D / 2, D / 2
    t = 0.035
    xd = xf - 0.07                                   # the cabinet's front (the door shuts on it)
    for sx in (-1, 1):
        for sy in (-1, 1):
            P.cyl('foot', 0.022, 0.03, (sx * (D / 2 - 0.06), sy * (hw - 0.06), 0.015), 'rubber', segs=8, bev=None)
    z0 = 0.03
    for sy in (-1, 1):
        C.block(P, 'side', (xd - xb, t, H - z0), ((xb + xd) / 2, sy * (hw - t / 2), (z0 + H) / 2), 'paint',
                bev=0.01, segs=1, step=0.35, axes=(2,))
    C.block(P, 'back', (0.03, W - 2 * t, H - z0), (xb + 0.015, 0.0, (z0 + H) / 2), 'paint', bev=0.004, step=0.4,
            axes=(2,))
    C.block(P, 'base', (xd - xb - 0.03, W - 2 * t, 0.1), ((xb + xd) / 2 + 0.015, 0.0, z0 + 0.05), 'paint', bev=0.004)
    C.block(P, 'top', (xd - xb, W, 0.04), ((xb + xd) / 2, 0.0, H - 0.02), 'paint', bev=0.01, segs=2)
    # the kick grille
    zk0, zk1 = z0 + 0.012, 0.13
    C.block(P, 'kick', (0.012, W - 2 * t, zk1 - zk0), (xd - 0.006, 0.0, (zk0 + zk1) / 2), 'trim', bev=0.002)
    for k in range(4):
        C.block(P, 'louvre', (0.012, W - 2 * t - 0.04, 0.012), (xd + 0.002, 0.0, zk0 + 0.016 + k * 0.022), 'paint',
                rot=(0, -30, 0), bev=0.002)
    # the header: a lightbox with a raised roundel
    zh0, zh1 = 1.43, H - 0.04
    C.block(P, 'header', (0.06, W - 2 * t, zh1 - zh0), (xd + 0.03 - 0.06, 0.0, (zh0 + zh1) / 2), 'paint', bev=0.004)
    C.block(P, 'header_face', (0.012, W - 2 * t - 0.04, zh1 - zh0 - 0.05), (xd + 0.006, 0.0, (zh0 + zh1) / 2),
            'paint_b', bev=0.004)
    P.cyl('roundel', 0.075, 0.012, (xd + 0.018, -0.16, (zh0 + zh1) / 2), 'paint', axis='X', segs=20, bev=None)
    P.cyl('roundel_in', 0.05, 0.008, (xd + 0.026, -0.16, (zh0 + zh1) / 2), 'paint_b', axis='X', segs=16, bev=None)
    for k, ln in enumerate((0.36, 0.26)):
        C.block(P, 'band', (0.006, ln, 0.035 - k * 0.01), (xd + 0.015, 0.12 - (0.36 - ln) / 2, (zh0 + zh1) / 2 +
                                                           0.03 - k * 0.06), 'paint', bev=0.002)
    # the liner and the shelves
    zi0, zi1 = 0.13, zh0
    xl0, xl1 = xb + 0.03, xd - 0.01
    C.block(P, 'liner_back', (0.01, W - 2 * t, zi1 - zi0), (xl0 + 0.005, 0.0, (zi0 + zi1) / 2), 'ceramic', bev=None,
            step=0.3, axes=(1, 2))
    for sy in (-1, 1):
        C.block(P, 'liner_side', (xl1 - xl0, 0.01, zi1 - zi0), ((xl0 + xl1) / 2, sy * (hw - t - 0.005),
                                                                (zi0 + zi1) / 2), 'ceramic', bev=None, step=0.3,
                axes=(0, 2))
    C.block(P, 'liner_floor', (xl1 - xl0, W - 2 * t, 0.01), ((xl0 + xl1) / 2, 0.0, zi0 + 0.005), 'ceramic', bev=None,
            step=0.3, axes=(0, 1))
    C.block(P, 'liner_top', (xl1 - xl0, W - 2 * t, 0.01), ((xl0 + xl1) / 2, 0.0, zi1 - 0.005), 'ceramic', bev=None)
    zs = [zi0 + 0.01, 0.45, 0.77, 1.09]
    yi = hw - t - 0.012
    for z in zs[1:]:
        C.block(P, 'wire_shelf', (xl1 - xl0 - 0.02, 2 * yi, 0.008), ((xl0 + xl1) / 2 - 0.01, 0.0, z - 0.004), 'alu',
                bev=None)
        C.block(P, 'shelf_lip', (0.012, 2 * yi, 0.03), (xl1 - 0.02, 0.0, z - 0.01), 'alu', bev=0.002)
        C.block(P, 'price_strip', (0.006, 2 * yi - 0.04, 0.022), (xl1 - 0.011, 0.0, z - 0.012), 'paint_b', bev=None)
    xr = xl1 - 0.075
    # cartons on the floor, big bottles over them, beer bottles, cans on the top shelf (a row in front, a few behind)
    C.boxes(P, 'cartons', [(xr - 0.01, y, zs[0], 0.08, 0.08, 0.2, 5 * C.jit(i, 1.0)) for i, y in
                           enumerate((-0.3, -0.2, 0.08, 0.18, 0.28))], 'paint_b', bev=0.004)
    C.boxes(P, 'carton_tops', [(xr - 0.01, y, zs[0] + 0.2, 0.08, 0.02, 0.03, 5 * C.jit(i, 1.0)) for i, y in
                               enumerate((-0.3, -0.2, 0.08, 0.18, 0.28))], 'paint_b', bev=None)
    water = [(xr - 0.005, y, zs[1], 0.044, 0.29) for y in (-0.31, -0.21, -0.11, 0.06, 0.16)]
    C.rounds(P, 'water', water, 'glass', BOTTLE7, segs=8)
    beer = [(xr, y, zs[2], 0.031, 0.23) for y in (-0.32, -0.25, -0.18, -0.11, 0.1, 0.17, 0.24, 0.31)]
    C.rounds(P, 'beer', beer, 'glass_dark', BOTTLE7, segs=8)
    C.rounds(P, 'caps', [(x, y, z + h, r * 0.42, 0.012) for (x, y, z, r, h) in water], 'paint_b',
             [(0.0, 0.0), (1.0, 0.0), (1.0, 1.0), (0.0, 1.0)], segs=6)
    cans = [(xr + 0.01, -0.33 + 0.072 * i, zs[3], 0.033, 0.12) for i in range(10) if i not in (4,)]
    CAN4 = [(0.0, 0.0), (1.0, 0.0), (1.0, 0.96), (0.9, 1.0), (0.0, 1.0)]
    C.rounds(P, 'cans', cans[::2], 'paint', CAN4, segs=8)
    C.rounds(P, 'cans', cans[1::2], 'alu', CAN4, segs=8)
    # the door: an aluminium frame round the glass on its seal, the long handle
    zd0, zd1 = zk1 + 0.005, zh0 - 0.008
    yd = hw - 0.004
    objs = []
    fr, rr = 0.05, 0.07
    for sy in (-1, 1):
        objs.append(C.block(P, 'door_stile', (0.04, fr, zd1 - zd0), (xd + 0.02, sy * (yd - fr / 2), (zd0 + zd1) / 2),
                            'alu', bev=0.005, segs=1))
    for z, hh in ((zd0 + rr / 2, rr), (zd1 - fr / 2, fr)):
        objs.append(C.block(P, 'door_rail', (0.04, 2 * yd - 2 * fr, hh), (xd + 0.02, 0.0, z), 'alu', bev=0.005, segs=1))
    objs.append(C.block(P, 'glass', (0.008, 2 * yd - 2 * fr + 0.01, zd1 - zd0 - rr - fr + 0.01),
                        (xd + 0.022, 0.0, (zd0 + rr + zd1 - fr) / 2), 'glass', bev=None))
    # the seal: a rubber ring round the back of the frame
    for sy in (-1, 1):
        objs.append(C.block(P, 'seal', (0.008, 0.02, zd1 - zd0 - 0.01), (xd + 0.004, sy * (yd - 0.02), (zd0 + zd1) / 2),
                            'rubber', bev=None))
    for z in (zd0 + 0.015, zd1 - 0.015):
        objs.append(C.block(P, 'seal', (0.008, 2 * yd - 0.06, 0.02), (xd + 0.004, 0.0, z), 'rubber', bev=None))
    hx_ = xd + 0.04
    objs.append(C.handle_bar(P, 'door_handle', (hx_, yd - fr / 2, (zd0 + zd1) / 2 + 0.05), 0.5, axis='Z', stand=0.022,
                             r=0.0065, material='chrome'))
    P.mover('DOOR', objs, (xd + 0.04, -yd, (zd0 + zd1) / 2))
    C.marker(P, 'M_inside', (xr - 0.08, 0.0, zs[2]))
    P.views = [('a', 30, 12), ('b', 215, 18)]


def till(P, x, y, z):
    """An old cash register on a counter at (x, y, z): the shopkeeper on -X. The base with its cash drawer towards
    the shopkeeper, the key bank sloping up away from him, the display tower at the back showing both ways."""
    since = C.mark(P)
    C.block(P, 'till_base', (0.36, 0.34, 0.11), (0.0, 0.0, 0.055), 'paint_b', bev=0.012, segs=2)
    C.block(P, 'till_drawer', (0.014, 0.3, 0.07), (-0.18, 0.0, 0.045), 'paint_b', bev=0.004)
    P.box('drawer_pull', (0.012, 0.08, 0.016), (-0.19, 0.0, 0.06), 'chrome', bev=0.004, segs=1)
    slope = 22.0
    bank = mat4((0.0, 0.0, 0.145), (0, -slope, 0))
    bm = bmesh.new()
    K.bm_cube(bm, (0.3, 0.32, 0.07), bank)
    P.mesh('till_bank', bm, 'paint_b', bev=0.01, segs=2)
    keys = [[], [], []]
    for i in range(4):
        for j in range(4):
            p = bank @ V((-0.11 + 0.065 * i, -0.105 + 0.07 * j, 0.035))
            keys[(i * 4 + j) % 7 % 3].append((p.x, p.y, p.z - 0.006, 0.042, 0.048, 0.02, 0.0))
    for k, m in enumerate(('ceramic', 'trim', 'paint')):
        bm = bmesh.new()
        for (kx, ky, kz, sx, sy, sz, _) in keys[k]:
            K.bm_cube(bm, (sx, sy, sz), mat4((kx, ky, kz + sz / 2), (0, -slope, 0)))
        P.mesh('keys', bm, m, bev=None)
    C.block(P, 'tower', (0.08, 0.2, 0.14), (0.16, 0.0, 0.25), 'paint_b', bev=0.01, segs=2)
    for sx in (-1, 1):
        C.block(P, 'readout', (0.006, 0.16, 0.05), (0.16 + sx * 0.04, 0.0, 0.28), 'glass_dark', bev=0.002)
        bm = bmesh.new()
        for k in range(5):
            C.rect_face(bm, 0.018, 0.028, (0.16 + sx * 0.0435, -0.064 + 0.032 * k, 0.28), (sx, 0, 0))
        P.mesh('digits', bm, 'emit' if False else 'ceramic', sharp=50.0)
    P.cyl('crank', 0.018, 0.02, (0.0, 0.18, 0.06), 'chrome', axis='Y', segs=10, bev=0.003, bsegs=1)
    C.xform(P, since, Matrix.Translation((x, y, z)))


def counter(P):
    """
    The kiosk's and the shop's counter (2.6 x 0.7 x 1.05): its front (+X, where one stands) in four panels on a
    plinth, the worn wooden top (M_top: where things are laid); behind it (the shopkeeper's side, -X) two open
    shelves with paper bags, a cash box and a roll (M_inside); on top at the +Y end the till (the keys towards the
    shopkeeper, the display both ways), at the -Y end a stepped rack of sweets facing the customer.
    """
    W, D, H = 2.6, 0.7, 1.05
    hw, xb, xf = W / 2, -D / 2, D / 2
    xc = xf - 0.04                              # the front panels' face
    zt = H - 0.04
    C.block(P, 'plinth', (0.03, W - 0.08, 0.1), (xc - 0.045, 0.0, 0.05), 'paint', bev=0.004)
    for sy in (-1, 1):
        C.block(P, 'end', (xc - xb - 0.02, 0.03, zt), ((xb + 0.02 + xc) / 2, sy * (hw - 0.025), zt / 2), 'paint',
                bev=0.006, segs=1, step=0.35, axes=(2,))
    # the front: four panels
    nb = 4
    pw = (W - 0.05) / nb
    for i in range(nb):
        y = -hw + 0.025 + pw * (i + 0.5)
        C.panel_door(P, 'front', pw, zt - 0.1, 0.022, (xc - 0.022, y, 0.1 + (zt - 0.1) / 2), material='paint',
                     frame=0.075, inset=0.008, grid=0.3)
    # the shopkeeper's side: the shelves and their uprights
    for z in (0.1, 0.52):
        C.block(P, 'shelf', (xc - xb - 0.06, W - 0.08, 0.022), ((xb + 0.02 + xc - 0.04) / 2, 0.0, z + 0.011),
                'paint_b', bev=0.003, step=0.6, axes=(1,))
    for y in (-0.43, 0.43):
        C.block(P, 'divider', (xc - xb - 0.06, 0.022, zt - 0.1), ((xb + 0.02 + xc - 0.04) / 2, y, 0.1 + (zt - 0.1) / 2),
                'paint_b', bev=0.003)
    # the top: two thick boards along it, its front edge rounded
    for (x0, x1, dz) in ((xb, -0.02, 0.0), (-0.017, xf, -0.0015)):
        bm = K.bm_new()
        K.bm_cube(bm, (x1 - x0, W + 0.01, 0.04 + dz), mat4(((x0 + x1) / 2, 0.0, zt + (0.04 + dz) / 2)))
        C.cuts(bm, (x1 - x0, W, 0.04), 0.5, axes=(1,))
        P.mesh('top', bm, 'wood', bev=0.009 if x1 > 0 else 0.005, segs=2 if x1 > 0 else 1)
    # under the counter: paper bags, a cash box, a roll of paper
    C.boxes(P, 'bags', [(-0.12, -0.8, 0.122, 0.3, 0.3, 0.06, 4.0), (-0.12, -0.78, 0.182, 0.29, 0.3, 0.05, -3.0)],
            'paint_b', bev=0.004)
    C.block(P, 'cashbox', (0.22, 0.3, 0.1), (-0.1, 0.0, 0.542 + 0.05), 'steel', rot=(0, 0, 8), bev=0.008, segs=2)
    P.box('cashbox_handle', (0.02, 0.1, 0.012), (-0.1, 0.0, 0.648), 'chrome', rot=(0, 0, 8), bev=0.004, segs=1)
    P.cyl('roll', 0.06, 0.3, (-0.15, 0.85, 0.542 + 0.06), 'paint_b', axis='Y', segs=12, bev=0.004, bsegs=1)
    P.cyl('roll_core', 0.02, 0.302, (-0.15, 0.85, 0.542 + 0.06), 'wood', axis='Y', segs=8, bev=None)
    # the till at the +Y end
    till(P, -0.06, hw - 0.33, H)
    # the sweets rack at the -Y end, facing the customer: three steps of little boxes
    ry = -hw + 0.3
    since = C.mark(P)
    tiers = [(0.15, 0.02), (0.06, 0.08), (-0.03, 0.14)]
    for (x, z) in tiers:
        C.block(P, 'rack_step', (0.1, 0.42, 0.012), (x, 0.0, z + 0.006), 'wood', bev=0.003)
    for sy in (-1, 1):
        P.prism('rack_end', [(0.2, 0.0), (0.2, 0.03), (0.01, 0.16), (-0.08, 0.16), (-0.08, 0.0)], 0.012,
                matrix=mat4((0, sy * 0.216, 0), (90, 0, 0)), material='wood', bev=0.003)
    sweets = [[], [], []]
    for t_, (x, z) in enumerate(tiers):
        for j in range(6):
            yj = -0.17 + 0.068 * j
            hh = 0.05 + 0.03 * (C.jit(j, t_) + 0.5)
            sweets[(j + t_) % 3].append((x + 0.01, yj, z + 0.012, 0.07, 0.055, hh, 10 * C.jit(j, t_ + 4)))
    for m, items in zip(('paint', 'paint_b', 'ceramic'), sweets):
        C.boxes(P, 'sweets', items, m, bev=None)
    C.xform(P, since, Matrix.Translation((0.08, ry, H)))
    C.marker(P, 'M_top', (0.05, 0.0, H))
    C.marker(P, 'M_inside', (-0.1, -0.3, 0.542))
    P.views = [('a', 30, 20), ('b', 215, 24)]


# ------------------------------------------------------------------------------------------------ the garage's

def shelf_garage(P, W=2.4, D=0.5, H=2.0):
    """
    A roadside garage's boltless steel shelving (2.4 x 0.5 x 2.0; shelf_garage_s 2.2 wide): angle uprights on foot
    plates, beams front and back under each chipboard deck, cross bracing at the back; on it cardboard boxes, two
    tyres lying flat, a brake disc, an old alternator, a battery, oil cans and a coil of hose, the board for what
    is found (sites.ts shelfOf, M_inside) kept clear.
    """
    hw, hd = W / 2, D / 2
    boards = shelf_boards(H)
    zf = found_board(H)
    w, t = 0.04, 0.003
    for sx in (-1, 1):
        for sy in (-1, 1):
            p = (sx * (hd - 0.002), sy * (hw - 0.002), 0.0)
            garage_angle(P, (p[0], p[1], 0.006), (p[0], p[1], H), (-sx, 0, 0), (0, -sy, 0), w)
            C.block(P, 'foot', (0.06, 0.06, 0.006), (sx * (hd - 0.03), sy * (hw - 0.03), 0.003), 'steel', bev=0.002)
    for z in boards:
        for sx in (-1, 1):
            garage_angle(P, (sx * (hd - 0.002), -hw + w, z - 0.019), (sx * (hd - 0.002), hw - w, z - 0.019), (-sx, 0, 0),
                         (0, 0, -1), 0.035, step=0.8)
        C.block(P, 'deck', (D - 0.012, W - 0.012, 0.018), (0.0, 0.0, z - 0.009), 'wood', bev=0.002, step=0.6, axes=(1,))
    # the cross bracing at the back between the first and the third board
    for (y0, y1) in ((-hw + 0.04, hw - 0.04), (hw - 0.04, -hw + 0.04)):
        C.plank(P, 'brace', (-hd + 0.004, y0, boards[0] + 0.02), (-hd + 0.004, y1, boards[2] - 0.05), 0.03, 0.004,
                'steel', up=(1, 0, 0), bev=0.001)
    # what is on it
    for z in boards:
        if abs(z - zf) < 1e-6:
            continue
        top = z == boards[-1]
        if z == boards[0]:
            # two tyres lying flat, a battery, a coil of hose
            for k, (x, y) in enumerate(((0.0, -hw + 0.3),)):
                for j in range(2):
                    P.lathe('tyre', C.tyre_prof(0.235, 0.15, 0.16), loc=(x + 0.008 * j, y + 0.015 * j,
                                                                        z + 0.075 + 0.15 * j),
                            material='rubber', segs=24, loop=True, sharp=40.0)
            C.block(P, 'battery', (0.18, 0.26, 0.19), (0.05, 0.1, z + 0.095), 'trim', rot=(0, 0, 6), bev=0.008, segs=1)
            for dy in (-0.08, 0.08):
                P.cyl('terminal', 0.012, 0.022, (0.05 - 0.05, 0.1 + dy, z + 0.2), 'steel', segs=8, bev=None)
            C.block(P, 'battery_caps', (0.03, 0.18, 0.008), (0.06, 0.1, z + 0.193), 'paint_b', rot=(0, 0, 6), bev=0.002)
            P.torus('hose', 0.13, 0.016, loc=(-0.02, hw - 0.3, z + 0.016), segs=20, rsegs=6, material='rubber')
            P.torus('hose', 0.115, 0.016, loc=(0.0, hw - 0.31, z + 0.046), segs=20, rsegs=6, material='rubber')
        elif top:
            # flat things only up there: a flattened box and an old wiper blade
            C.boxes(P, 'boxes', [(0.0, -0.3, z, 0.42, 0.6, 0.03, 3.0)], 'wood', bev=0.004)
            C.block(P, 'wiper', (0.03, 0.5, 0.012), (0.12, 0.45, z + 0.006), 'trim', rot=(0, 0, -6), bev=0.003)
        else:
            # a brake disc, an alternator, oil cans, a box
            P.lathe('disc', [(0.0, 0.0), (0.135, 0.0), (0.135, 0.024), (0.08, 0.024), (0.08, 0.05), (0.0, 0.05)],
                    loc=(0.02, -hw + 0.3, z), material='steel', segs=20, sharp=40.0)
            P.cyl('alternator', 0.075, 0.16, (0.0, -0.35, z + 0.08), 'alu', axis='X', segs=12, bev=0.008, bsegs=1)
            P.cyl('pulley', 0.04, 0.03, (0.1, -0.35, z + 0.08), 'steel', axis='X', segs=10, bev=0.003, bsegs=1)
            C.block(P, 'alt_lug', (0.04, 0.03, 0.05), (-0.03, -0.35, z + 0.15), 'alu', bev=0.004)
            cans = [(0.08, 0.05 + 0.13 * i, z, 0.05, 0.16) for i in range(3)]
            C.rounds(P, 'oil_cans', cans, 'paint_b', C.CAN, segs=10)
            C.rounds(P, 'oil_caps', [(x - 0.02, y, z_ + h, 0.014, 0.025) for (x, y, z_, r, h) in cans], 'steel',
                     [(0.0, 0.0), (1.0, 0.0), (1.0, 1.0), (0.0, 1.0)], segs=6)
            C.boxes(P, 'boxes', [(0.0, hw - 0.3, z, 0.4, 0.45, 0.3, 5.0), (0.02, hw - 0.58, z, 0.36, 0.3, 0.22, -4.0),
                                 (0.0, hw - 0.3, z + 0.3, 0.3, 0.32, 0.16, 9.0)], 'wood', bev=0.006)
            C.boxes(P, 'tape', [(0.0, hw - 0.3, z + 0.3, 0.41, 0.06, 0.004, 5.0)], 'paint_b', bev=None)
    C.marker(P, 'M_inside', (0.0, 0.0, zf))
    P.views = [('a', 32, 16), ('b', 215, 20)]


def garage_angle(P, p0, p1, u, v, w=0.04, t=0.003, step=0.6):
    """A slotted steel angle (the boltless shelving's): its corner along p0-p1, the flanges along u and v."""
    p0, p1 = V(p0), V(p1)
    u, v = V(u).normalized(), V(v).normalized()
    sec = [(0, 0), (w, 0), (w, t), (t, t), (t, w), (0, w)]
    n = max(1, int((p1 - p0).length / step))
    rings = [[p0 + (p1 - p0) * (k / n) + u * a + v * b for (a, b) in sec] for k in range(n + 1)]
    bm = bmesh.new()
    K.bm_loft(bm, rings, cap_start=True, cap_end=True)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    return P.mesh('angle', bm, 'paint', bev=0.0012, segs=1, sharp=40.0)


def toolbox(P, H=0.5, casters=True):
    """
    A red roller tool chest (0.8 x 0.45 x 0.5; toolbox_top, the 0.42 one that sits on a bench, without the
    casters): the body on four swivel casters, three drawers (DRAWER_1 at the top) with full-width pulls, the top
    tray under the LID (hinged along its back, a pull on its front, M_inside in the tray, M_top on it), side
    handles, a raised badge.
    """
    W, D = 0.8, 0.45
    hw, xb, xf = W / 2, -D / 2 + 0.01, D / 2
    zc = 0.085 if casters else 0.012            # under the body
    xd = xf - 0.046                              # the body's front (the drawer fronts close on it)
    # casters or feet
    if casters:
        for sx in (-1, 1):
            for sy in (-1, 1):
                cx, cy = sx * (D / 2 - 0.07), sy * (hw - 0.07)
                C.block(P, 'caster_plate', (0.06, 0.06, 0.006), (cx, cy, zc - 0.003), 'steel', bev=0.002)
                P.cyl('caster_swivel', 0.02, 0.012, (cx, cy, zc - 0.012), 'steel', segs=10, bev=None)
                C.block(P, 'caster_fork', (0.05, 0.034, 0.03), (cx - 0.012, cy, zc - 0.03), 'steel', bev=0.004)
                P.cyl('caster_wheel', 0.035, 0.024, (cx - 0.02, cy, 0.035), 'rubber', axis='Y', segs=12, bev=0.004,
                      bsegs=1)
                P.cyl('caster_hub', 0.014, 0.028, (cx - 0.02, cy, 0.035), 'steel', axis='Y', segs=8, bev=None)
    else:
        for sx in (-1, 1):
            for sy in (-1, 1):
                C.block(P, 'foot', (0.04, 0.06, 0.012), (sx * (D / 2 - 0.05), sy * (hw - 0.06), 0.006), 'rubber',
                        bev=0.003)
    zl = H - 0.03                                # under the lid
    zt0 = zl - 0.13                             # the tray's bottom
    bw = W - 0.05
    C.block(P, 'body', (xd - xb, bw, zt0 - zc), ((xb + xd) / 2, 0.0, (zc + zt0) / 2), 'paint', bev=0.008, segs=1,
            step=0.3, axes=(1,))
    # the tray: its walls round the top, its floor
    tw = 0.012
    for sx in (-1, 1):
        x = xd - tw / 2 if sx > 0 else xb + tw / 2
        C.block(P, 'tray_wall', (tw, bw, zl - zt0), (x, 0.0, (zt0 + zl) / 2), 'paint', bev=0.004)
    for sy in (-1, 1):
        C.block(P, 'tray_wall', (xd - xb - 2 * tw, tw, zl - zt0), ((xb + xd) / 2, sy * (bw / 2 - tw / 2),
                                                                     (zt0 + zl) / 2), 'paint', bev=0.004)
    C.block(P, 'tray_floor', (xd - xb - 2 * tw, bw - 2 * tw, 0.006), ((xb + xd) / 2, 0.0, zt0 + 0.003), 'rubber',
            bev=None)
    # a few tools in the tray: two spanners, a screwdriver
    C.block(P, 'spanner', (0.02, 0.24, 0.006), (0.05, -0.12, zt0 + 0.009), 'steel', rot=(0, 0, 12), bev=0.002)
    C.block(P, 'spanner', (0.022, 0.28, 0.006), (-0.02, -0.05, zt0 + 0.009), 'steel', rot=(0, 0, -7), bev=0.002)
    P.cyl('screwdriver', 0.014, 0.1, (0.0, 0.18, zt0 + 0.02), 'paint_b', axis='Y', segs=8, bev=0.003, bsegs=1)
    P.cyl('screwdriver_shaft', 0.004, 0.14, (0.0, 0.06, zt0 + 0.02), 'steel', axis='Y', segs=6, bev=None)
    # the drawer openings (dark) and the drawers
    gap = 0.006
    n = 3
    dh = (zt0 - zc - 0.02 - gap * (n + 1)) / n
    bm = bmesh.new()
    C.rect_face(bm, bw - 0.03, zt0 - zc - 0.02, (xd + 0.0005, 0.0, (zc + 0.01 + zt0 - 0.01) / 2), (1, 0, 0))
    P.mesh('openings', bm, 'trim', sharp=50.0)
    for k in range(n):
        ztop = zt0 - 0.01 - gap - k * (dh + gap)
        name = f'DRAWER_{k + 1}'
        drawer_unit(P, name, xd + 0.014, 0.0, ztop - dh / 2, bw - 0.03, dh, D - 0.06, t=0.014, front='paint',
                    box='steel', pull='bar', floor_mat='rubber')
    # the badge on the top drawer's band, the side handles
    C.patch(P, 'badge', 0.1, 0.022, (xd, 0.0, zt0 - 0.002), (1, 0, 0), 'paint_b', t=0.002)
    for sy in (-1, 1):
        y = sy * bw / 2
        P.tube('side_handle', [(-0.1, y, zl - 0.06), (-0.1, y + sy * 0.017, zl - 0.06), (0.1, y + sy * 0.017, zl - 0.06),
                               (0.1, y, zl - 0.06)], 0.0075, 'chrome', segs=8, bend=0.01)
    # the lid over the tray (LID: hinged along its back edge)
    lid_objs = [C.block(P, 'lid', (xd - xb + 0.004, bw + 0.006, 0.03), ((xb + xd) / 2 + 0.002, 0.0, zl + 0.015),
                        'paint', bev=0.01, segs=2)]
    lid_objs.append(C.handle_bar(P, 'lid_pull', (xd + 0.006, 0.0, zl + 0.012), 0.2, stand=0.016, r=0.0055))
    P.mover('LID', lid_objs, (xb, 0.0, zl))
    P.cyl('lid_hinge', 0.006, bw - 0.1, (xb - 0.002, 0.0, zl), 'steel', axis='Y', segs=8, bev=None)
    C.marker(P, 'M_inside', (0.0, 0.0, zt0))
    C.marker(P, 'M_top', (0.0, 0.0, H))
    P.views = [('a', 30, 22), ('b', 215, 26)]


def lift(P):
    """
    A two-post car lift, the floor-plate kind (3.3 x 0.4 x 2.6): two C-section columns on bolted base plates, their
    open sides facing each other with the carriages down at the bottom, each with its two swing arms folded in
    along the line of the posts (telescopic, a rubber lifting pad on a screw at the end); the diamond-plate cover
    over the lines on the floor between them; the power unit on the +Y column's front (motor, pump block, the oil
    reservoir, the push-button box), a lock release lever on each carriage.
    """
    hw, hd, H = 3.3 / 2, 0.4 / 2, 2.6
    pw, pd = 0.26, 0.26                        # a column's section (Y, X)
    for sy in (-1, 1):
        yo = sy * (hw - 0.015)                 # the outer wall's outside
        yi = sy * (hw - 0.015 - pw)            # the open side
        t = 0.009
        # the C section (the open side towards the middle), lofted in lifts so that its vertex AO has samples
        sec = [(yo, -pd / 2), (yo, pd / 2), (yi, pd / 2), (yi, pd / 2 - 0.035), (yi + sy * t, pd / 2 - 0.035),
               (yi + sy * t, pd / 2 - t), (yo - sy * t, pd / 2 - t), (yo - sy * t, -pd / 2 + t),
               (yi + sy * t, -pd / 2 + t), (yi + sy * t, -pd / 2 + 0.035), (yi, -pd / 2 + 0.035), (yi, -pd / 2)]
        if sy < 0:
            sec = sec[::-1]
        rings = [[(x, y, z) for (y, x) in sec] for z in (0.02, 0.6, 1.2, 1.8, H - 0.012)]
        bm = bmesh.new()
        K.bm_loft(bm, rings, cap_start=True, cap_end=True)
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
        P.mesh('column', bm, 'paint', bev=0.003, segs=1, sharp=40.0)
        yc = sy * (hw - 0.015 - pw / 2)
        C.block(P, 'cap', (pd + 0.02, pw + 0.02, 0.012), (0.0, yc, H - 0.006), 'paint', bev=0.003)
        C.block(P, 'base_plate', (0.4, pw + 0.1, 0.02), (0.0, yc - sy * 0.03, 0.01), 'steel', bev=0.004)
        P.bolts([(sx * 0.16, yc - sy * 0.03 + by * 0.15, 0.02) for sx in (-1, 1) for by in (-1, 1)], r=0.011, h=0.012,
                washer=True)
        # the ladder of safety locks inside, seen through the open side
        bm = bmesh.new()
        for k in range(14):
            C.rect_face(bm, 0.05, 0.02, (0.0, yo - sy * (t + 0.0015), 0.7 + 0.1 * k), (-sy * 0 or 0, -sy, 0))
        P.mesh('lock_rack', bm, 'trim', sharp=50.0)
        # the carriage, down at the bottom, its slide blocks, the lock lever
        yk = sy * (hw - 0.015 - pw + 0.07)
        C.block(P, 'carriage', (0.17, 0.2, 0.52), (0.0, yk, 0.08 + 0.26), 'paint', bev=0.008, segs=1)
        for z in (0.16, 0.52):
            C.block(P, 'slide', (0.2, 0.03, 0.06), (0.0, yk + sy * 0.1, z), 'rubber', bev=0.004)
        P.tube('lock_lever', [(0.0, yk - sy * 0.1, 0.55), (0.06, yk - sy * 0.14, 0.62), (0.06, yk - sy * 0.15, 0.7)],
               0.008, 'paint_b', segs=6, bend=0.02)
        # the two arms, folded in along the posts' line
        for sx in (-1, 1):
            x = sx * 0.085
            piv = V((x, yk - sy * 0.06, 0.14))
            P.cyl('arm_pin', 0.022, 0.06, (piv.x, piv.y, piv.z + 0.01), 'steel', segs=10, bev=0.003, bsegs=1)
            L0, L1 = 0.62, 0.42 + (0.06 if sx > 0 else 0.0)
            a = piv - V((0, sy * 0.03, 0))
            C.block(P, 'arm', (0.07, L0, 0.07), (x, a.y - sy * L0 / 2, 0.14), 'paint_b', bev=0.006, segs=1)
            C.block(P, 'arm_inner', (0.052, L1, 0.052), (x, a.y - sy * (L0 + L1 / 2 - 0.12), 0.14), 'paint_b',
                    bev=0.004)
            tip = a.y - sy * (L0 + L1 - 0.16)
            P.cyl('pad_screw', 0.018, 0.06, (x, tip, 0.2), 'steel', segs=8, bev=None)
            P.lathe('pad', [(0.0, 0.0), (0.055, 0.0), (0.06, 0.006), (0.06, 0.024), (0.052, 0.03), (0.0, 0.03)],
                    loc=(x, tip, 0.225), material='rubber', segs=14, sharp=45.0)
    # the floor plate between the columns
    span = 2 * (hw - 0.015 - pw) - 0.02
    poly = [(-0.16, 0.0), (0.16, 0.0), (0.12, 0.03), (-0.12, 0.03)]
    P.prism('floor_plate', poly, span, matrix=mat4((0, 0, 0), (90, 0, 0)), material='steel', bev=0.003)
    bm = bmesh.new()
    for i in range(int(span / 0.11)):
        y = -span / 2 + 0.055 + 0.11 * i
        for x in (-0.05, 0.05):
            K.bm_cube(bm, (0.034, 0.012, 0.003), mat4((x + (0.025 if i % 2 else 0.0), y, 0.0315), (0, 0, 45)))
    P.mesh('diamonds', bm, 'steel', sharp=50.0)
    # the power unit on the +Y column's front
    yu = hw - 0.015 - pw / 2
    xu = pd / 2 - 0.06
    C.block(P, 'unit_bracket', (0.012, 0.16, 0.5), (pd / 2 + 0.006, yu, 1.25), 'steel', bev=0.002)
    yu -= pw / 2 + 0.065                      # (on the column's inner face, over the carriage's travel)
    xu = 0.0
    C.block(P, 'unit_plate', (0.16, 0.012, 0.5), (0.0, yu + 0.064, 1.25), 'steel', bev=0.002)
    P.cyl('motor', 0.055, 0.22, (xu, yu, 1.44), 'trim', segs=14, bev=0.006, bsegs=1)
    P.cyl('motor_cap', 0.045, 0.03, (xu, yu, 1.565), 'trim', segs=12, bev=0.004, bsegs=1)
    C.block(P, 'pump_block', (0.12, 0.09, 0.07), (xu, yu, 1.295), 'alu', bev=0.006)
    C.block(P, 'reservoir', (0.13, 0.1, 0.22), (xu, yu, 1.15), 'paint_b', bev=0.008, segs=1)
    P.cyl('filler', 0.014, 0.02, (xu + 0.03, yu, 1.27), 'trim', segs=8, bev=None)
    P.tube('hose', [(xu - 0.07, yu, 1.27), (xu - 0.1, yu - 0.02, 1.05), (xu - 0.12, yu - 0.03, 0.75),
                    (-0.12, yu - 0.05, 0.05)], 0.008, 'rubber', segs=6, bend=0.08)
    yb_ = hw - 0.015 - pw / 2
    C.block(P, 'button_box', (0.05, 0.1, 0.14), (pd / 2 + 0.025, yb_, 1.3), 'paint_b', bev=0.006)
    P.cyl('button', 0.016, 0.012, (pd / 2 + 0.055, yb_, 1.33), 'paint', axis='X', segs=10, bev=0.003, bsegs=1)
    P.cyl('button_dn', 0.014, 0.01, (pd / 2 + 0.054, yb_, 1.28), 'trim', axis='X', segs=10, bev=0.003, bsegs=1)
    P.views = [('a', 30, 14), ('b', 215, 16)]


def vice(P, x, y, z, yaw=0.0):
    """An engineer's bench vice on a bench top at (x, y, z), its jaws along Y and the screw out towards +X: the
    swivel base bolted down, the cast body and its slide, steel jaw plates, the screw and the tommy bar."""
    since = C.mark(P)
    P.cyl('vice_base', 0.07, 0.02, (0.0, 0.0, 0.01), 'paint_b', segs=14, bev=0.004, bsegs=1)
    P.bolts([(0.05 * math.cos(a), 0.05 * math.sin(a), 0.02) for a in (0.7, 2.4, 3.9, 5.5)], r=0.006, h=0.005,
            washer=False)
    C.block(P, 'vice_body', (0.16, 0.1, 0.075), (-0.01, 0.0, 0.02 + 0.0375), 'paint_b', bev=0.012, segs=2)
    C.block(P, 'vice_jaw_body', (0.05, 0.15, 0.06), (-0.075, 0.0, 0.125), 'paint_b', bev=0.01, segs=2)
    C.block(P, 'vice_anvil', (0.06, 0.08, 0.025), (-0.115, 0.0, 0.11), 'paint_b', bev=0.006)
    C.block(P, 'vice_slide', (0.2, 0.06, 0.045), (0.06, 0.0, 0.07), 'paint_b', bev=0.006)
    C.block(P, 'vice_jaw_move', (0.05, 0.15, 0.06), (0.0, 0.0, 0.125), 'paint_b', bev=0.01, segs=2)
    for jx in (-0.049, -0.026):
        C.block(P, 'jaw_plate', (0.006, 0.15, 0.04), (jx, 0.0, 0.135), 'steel', bev=0.0015)
    P.cyl('vice_screw', 0.01, 0.12, (0.11, 0.0, 0.075), 'steel', axis='X', segs=8, bev=None)
    P.cyl('vice_hub', 0.019, 0.03, (0.18, 0.0, 0.075), 'steel', axis='X', segs=10, bev=0.003, bsegs=1)
    P.cyl('tommy_bar', 0.006, 0.24, (0.188, 0.07, 0.075), 'steel', axis='Y', segs=8, bev=None)
    for yy in (-0.05, 0.19):
        P.sphere('bar_ball', 0.012, (0.188, yy, 0.075), 'steel', u=8, v=5)
    C.xform(P, since, C.turned((x, y, z), yaw))


def workbench_old(P, W=2.6):
    """
    An old heavy wooden workbench (2.6 x 0.7, its top at 0.9; workbench_old_s 2.2 long): three thick planks worn
    round at the front on four square legs with rails and a slatted lower shelf, the engineer's vice bolted on at
    the +Y front corner (it stands up over the top), a hammer, a spanner, nuts and an oil can left along the back,
    a rag over the front; tins on the shelf. Decorative: the working bench is the machines' workbench. M_top on it.
    """
    hw, hd, H = W / 2, 0.35, 0.9
    th = 0.06
    zu = H - th
    for i, (x0, x1) in enumerate(((-hd, -0.118), (-0.115, 0.115), (0.118, hd))):
        dz = (0.0, -0.002, 0.0)[i]
        bm = K.bm_new()
        K.bm_cube(bm, (x1 - x0, W, th + dz), mat4(((x0 + x1) / 2, 0.0, zu + (th + dz) / 2)))
        C.cuts(bm, (x1 - x0, W, th), 0.45, axes=(1,))
        if i == 2:
            for v in bm.verts:
                if v.co.x > hd - 0.01 and v.co.z > H - 0.01:
                    v.co.z -= 0.004 * (1 - (v.co.y / hw) ** 2)
        P.mesh('plank', bm, 'wood', bev=0.012 if i == 2 else 0.005, segs=2 if i == 2 else 1)
    lx, ly = hd - 0.07, hw - 0.12
    for sx in (-1, 1):
        for sy in (-1, 1):
            C.block(P, 'leg', (0.09, 0.09, zu), (sx * lx, sy * ly, zu / 2), 'wood', bev=0.008, segs=1, step=0.4,
                    axes=(2,))
        C.block(P, 'rail', (0.04, 2 * ly - 0.09, 0.1), (sx * (lx + 0.025), 0.0, zu - 0.05), 'wood', bev=0.005,
                step=0.6, axes=(1,))
        C.block(P, 'stretcher', (0.035, 2 * ly - 0.09, 0.06), (sx * lx, 0.0, 0.17), 'wood', bev=0.004, step=0.6,
                axes=(1,))
    for sy in (-1, 1):
        for z in (0.17, zu - 0.05):
            C.block(P, 'end_rail', (2 * lx - 0.09, 0.035, 0.07), (0.0, sy * ly, z), 'wood', bev=0.004)
    for i in range(5):
        x = -lx + 0.04 + i * (2 * lx - 0.08) / 4
        C.block(P, 'shelf_slat', (0.09, 2 * ly - 0.1, 0.02), (x, 0.0, 0.21), 'wood', bev=0.003, step=0.7, axes=(1,))
    # the vice on the +Y front corner, its screw out over the front
    vice(P, hd - 0.19, hw - 0.3, H, 0.0)
    # left along the back: a hammer, a spanner, nuts, an oil can; a rag over the front edge
    P.cyl('hammer_handle', 0.013, 0.3, (-0.22, -0.4, H + 0.013), 'wood', axis=(0.2, 1, 0), segs=8, bev=0.003, bsegs=1)
    C.block(P, 'hammer_head', (0.035, 0.03, 0.11), (-0.19, -0.255, H + 0.018), 'steel', rot=(90, 0, 11), bev=0.004)
    C.block(P, 'spanner', (0.025, 0.24, 0.007), (-0.24, 0.2, H + 0.0035), 'steel', rot=(0, 0, 20), bev=0.002)
    bm = bmesh.new()
    for k, (x, y) in enumerate(((-0.2, 0.42), (-0.17, 0.46), (-0.23, 0.5), (-0.15, 0.53))):
        K.bm_hex(bm, 0.011, 0.009, matrix=mat4((x, y, H), (0, 0, 17 * k)))
    P.mesh('nuts', bm, 'steel', sharp=50.0)
    P.lathe('oil_can', [(0.0, 0.0), (0.06, 0.0), (0.065, 0.01), (0.065, 0.05), (0.03, 0.08), (0.012, 0.09),
                        (0.0, 0.09)], loc=(-0.22, -hw + 0.3, H), material='paint_b', segs=12, sharp=45.0)
    P.tube('oil_spout', [(-0.22, -hw + 0.3, H + 0.085), (-0.2, -hw + 0.33, H + 0.15), (-0.17, -hw + 0.37, H + 0.2)],
           0.004, 'steel', segs=6, bend=0.03)
    def rag(u, v):
        x = hd - 0.22 + 0.24 * u
        y = -0.55 + 0.26 * v
        z = H + 0.006 + 0.01 * math.sin(9 * u + 4 * v)
        if x > hd - 0.01:
            z -= (x - (hd - 0.01)) * 2.5
            x = hd - 0.005 + 0.004
        return (x, y, z)
    P.mesh('rag', junk.grid_sheet(6, 4, rag, 0.006), 'fabric', sharp=60.0)
    C.rounds(P, 'tins', [(0.0, -0.3, 0.22, 0.06, 0.14), (0.05, 0.4, 0.22, 0.055, 0.18)], 'paint_b', C.CAN, segs=10)
    C.marker(P, 'M_top', (0.0, 0.0, H))
    P.views = [('a', 30, 22), ('b', 215, 26)]


def rack(P):
    """
    The roadside garage's tool rack (2.4 x 0.2 x 1.9): a pegboard on two steel posts with flat feet, framed in
    battens, a shelf under it with tins and a coil of cable; on hooks over their painted outlines a hand saw, four
    spanners in a row, a hammer, two screwdrivers, pliers and an extension lead.
    """
    hw, H = 1.2, 1.9
    yp = hw - 0.06
    for sy in (-1, 1):
        C.block(P, 'post', (0.05, 0.05, H - 0.04), (0.0, sy * yp, (H - 0.04) / 2 + 0.04), 'paint', bev=0.005,
                step=0.5, axes=(2,))
        C.block(P, 'foot', (0.2, 0.06, 0.04), (0.0, sy * yp, 0.02), 'paint', bev=0.005)
        C.block(P, 'cap', (0.06, 0.06, 0.01), (0.0, sy * yp, H - 0.005), 'trim', bev=0.003)
    zb0, zb1 = 0.75, 1.85
    xb = 0.01                                      # the board's face
    bw = 2 * yp - 0.05
    C.block(P, 'pegboard', (0.01, bw, zb1 - zb0), (xb - 0.005, 0.0, (zb0 + zb1) / 2), 'paint_b', bev=0.002,
            step=0.15, axes=(1, 2))
    for z in (zb0 + 0.015, zb1 - 0.015):
        C.block(P, 'batten', (0.035, bw + 0.02, 0.03), (xb - 0.0125, 0.0, z), 'wood', bev=0.004)
    for sy in (-1, 1):
        C.block(P, 'batten', (0.035, 0.03, zb1 - zb0), (xb - 0.0125, sy * (bw / 2 - 0.0), (zb0 + zb1) / 2), 'wood',
                bev=0.004)
    # the shelf under the board
    zs = 0.5
    C.block(P, 'shelf', (0.16, 2 * yp - 0.05, 0.022), (0.0, 0.0, zs - 0.011), 'wood', bev=0.004, step=0.7, axes=(1,))
    for sy in (-1, 1):
        C.block(P, 'bracket', (0.14, 0.012, 0.08), (0.0, sy * (yp - 0.04), zs - 0.06), 'steel', bev=0.002)
    C.rounds(P, 'tins', [(0.0, -0.7, zs, 0.055, 0.13), (0.0, -0.56, zs, 0.05, 0.1), (0.01, 0.55, zs, 0.06, 0.15)],
             'paint_b', C.CAN, segs=10)
    P.torus('cable_coil', 0.07, 0.012, loc=(0.0, 0.05, zs + 0.012), segs=18, rsegs=6, material='trim')
    P.torus('cable_coil', 0.064, 0.012, loc=(0.0, 0.058, zs + 0.034), segs=18, rsegs=6, material='trim')
    # the tools over their outlines (y, z on the board's face; the tools stand 1 cm off it)
    xt = xb + 0.01
    keep = []
    hooks = []

    def outline(pts2d, d=0.012):
        hull = C.offset_poly2(C.hull2d(pts2d), d)
        C.front_prism(P, 'outline', hull, xb, 0.001, 'paint')
        keep.append(hull)

    # the hand saw
    sc = -0.8
    blade = [(sc + 0.04, 1.7), (sc + 0.04, 1.3), (sc - 0.04, 1.29)]
    for k in range(1, 20):
        f = k / 20
        blade.append((sc - 0.04 - 0.045 * f - (0.006 if k % 2 else 0.0), 1.29 + 0.41 * f))
    blade.append((sc - 0.085, 1.7))
    C.front_prism(P, 'saw_blade', blade, xt, 0.003, 'steel')
    hp = [(sc - 0.1, 1.66), (sc + 0.06, 1.66), (sc + 0.075, 1.72), (sc + 0.07, 1.8), (sc + 0.03, 1.83),
          (sc - 0.07, 1.83), (sc - 0.1, 1.79)]
    C.front_prism(P, 'saw_handle', hp, xt - 0.008, 0.02, 'wood')
    outline(blade + hp)
    hooks.append((sc - 0.02, 1.8))
    # four spanners, ring ends up, smallest to biggest
    for k in range(4):
        y = -0.5 + 0.075 * k
        ln = 0.16 + 0.03 * k
        r = 0.016 + 0.003 * k
        z1 = 1.62
        z0 = z1 - ln
        C.front_prism(P, 'spanner', [(y - 0.008, z0), (y + 0.008, z0), (y + 0.008, z1), (y - 0.008, z1)], xt, 0.006,
                      'steel')
        C.front_prism(P, 'spanner_ring', [(y + r * math.cos(a), z1 + r * math.sin(a)) for a in
                                          (i * TAU / 10 for i in range(10))], xt, 0.007, 'steel')
        C.front_prism(P, 'spanner_jaw', [(y + (r + 0.003) * math.cos(a), z0 + (r + 0.003) * math.sin(a)) for a in
                                         (i * TAU / 10 for i in range(10)) if not (4.2 < a < 5.3)], xt, 0.007, 'steel')
        outline([(y + r * math.cos(a), z1 + r * math.sin(a)) for a in (i * TAU / 8 for i in range(8))] +
                [(y + r * math.cos(a), z0 + r * math.sin(a)) for a in (i * TAU / 8 for i in range(8))], d=0.008)
        hooks.append((y, z1 + r + 0.006))
    # the hammer, head up
    hy = -0.08
    C.front_prism(P, 'hammer_handle', [(hy - 0.012, 1.3), (hy + 0.012, 1.3), (hy + 0.01, 1.62), (hy - 0.01, 1.62)],
                  xt, 0.022, 'wood')
    C.front_prism(P, 'hammer_head', [(hy - 0.06, 1.62), (hy + 0.05, 1.62), (hy + 0.055, 1.665), (hy - 0.06, 1.665)],
                  xt - 0.004, 0.03, 'steel')
    outline([(hy - 0.06, 1.62), (hy + 0.055, 1.665), (hy - 0.06, 1.665), (hy + 0.05, 1.62), (hy - 0.012, 1.3),
             (hy + 0.012, 1.3)])
    hooks += [(hy - 0.03, 1.605), (hy + 0.03, 1.605)]
    # two screwdrivers, handles up
    for k, y in enumerate((0.12, 0.2)):
        P.lathe('driver_handle', [(0.0, 0.0), (0.012, 0.0), (0.015, 0.03), (0.015, 0.09), (0.011, 0.1), (0.0, 0.1)],
                loc=(xt + 0.016, y, 1.5 - k * 0.04), material='paint' if k else 'paint_b', segs=8, sharp=45.0)
        P.cyl('driver_shaft', 0.0035, 0.16, (xt + 0.016, y, 1.42 - k * 0.04), 'steel', segs=6, bev=None)
        outline([(y - 0.016, 1.6 - k * 0.04), (y + 0.016, 1.6 - k * 0.04), (y, 1.34 - k * 0.04)], d=0.006)
        hooks.append((y, 1.5 - k * 0.04 - 0.005))
    # the pliers
    qy, qz = 0.36, 1.58
    C.front_prism(P, 'pliers_jaws', [(qy - 0.012, qz), (qy + 0.012, qz), (qy + 0.006, qz - 0.06), (qy, qz - 0.072),
                                     (qy - 0.006, qz - 0.06)], xt, 0.008, 'steel')
    for sgn in (-1, 1):
        C.front_prism(P, 'pliers_grip', [(qy + sgn * 0.004, qz), (qy + sgn * 0.016, qz), (qy + sgn * 0.034, qz + 0.15),
                                         (qy + sgn * 0.022, qz + 0.15)], xt - 0.002, 0.012, 'paint')
    outline([(qy - 0.016, qz), (qy + 0.016, qz), (qy, qz - 0.075), (qy - 0.04, qz + 0.155), (qy + 0.04, qz + 0.155)])
    hooks.append((qy, qz + 0.03))
    # the extension lead, coiled over two hooks
    ey, ez = 0.72, 1.45
    P.torus('lead', 0.17, 0.013, loc=(xt + 0.02, ey, ez), axis='X', segs=22, rsegs=6, material='paint_b')
    P.torus('lead', 0.155, 0.013, loc=(xt + 0.032, ey + 0.01, ez - 0.01), axis='X', segs=22, rsegs=6,
            material='paint_b')
    C.block(P, 'lead_plug', (0.03, 0.05, 0.07), (xt + 0.02, ey + 0.06, ez - 0.22), 'trim', bev=0.006)
    hooks += [(ey - 0.06, ez + 0.16), (ey + 0.06, ez + 0.16)]
    keep.append(C.hull2d([(ey + 0.2 * math.cos(a), ez + 0.2 * math.sin(a)) for a in (i * TAU / 12 for i in range(12))]))
    bm = bmesh.new()
    for (y, z) in hooks:
        K.bm_sweep(bm, [V((xb - 0.004, y, z)), V((xt + 0.022, y, z)), V((xt + 0.028, y, z + 0.004)),
                        V((xt + 0.03, y, z + 0.014))], 0.0028, segs=4, max_seg=0)
    P.mesh('hooks', bm, 'steel', sharp=60.0)
    bm = bmesh.new()
    step = 0.07
    for i in range(int(bw / step)):
        y = -bw / 2 + step * (i + 0.5)
        for j in range(int((zb1 - zb0 - 0.06) / step)):
            z = zb0 + 0.04 + step * (j + 0.5)
            if any(C.inside2d(poly, (y, z), 0.008) for poly in keep):
                continue
            C.rect_face(bm, 0.008, 0.008, (xb + 0.0006, y, z), (1, 0, 0))
    P.mesh('holes', bm, 'trim', sharp=50.0)
    P.views = [('a', 25, 10), ('b', 205, 14)]


# ------------------------------------------------------------------------------------------------ the keeper's desk, a cabinet

def desk(P):
    """
    The lighthouse keeper's writing desk (1.3 x 0.6, the top at 0.76): the top on a pedestal of three drawers on its
    -Y side (DRAWER_2 at the top .. DRAWER_4, the deep one at the bottom; DRAWER_3's floor at shelfOf's half
    height: M_inside) and two legs with a back panel on +Y, the wide shallow drawer over the knee hole (DRAWER_1);
    a log book and an ink pot on it (M_top on its clear middle).
    """
    W, D, H = 1.3, 0.6, 0.76
    hw, xb, xf = W / 2, -D / 2, D / 2
    th = 0.03
    zu = H - th
    xc = xf - 0.052                                  # the carcass front (the drawers overlay it)
    tf = 0.02
    for (x0, x1) in ((xb, 0.0), (0.003, xf)):
        C.block(P, 'top', (x1 - x0, W, th), ((x0 + x1) / 2, 0.0, zu + th / 2), 'wood', bev=0.008 if x1 > 0.1 else 0.004,
                segs=2 if x1 > 0.1 else 1, step=0.45, axes=(1,))
    # the pedestal on -Y
    pw = 0.42
    yp0, yp1 = -hw + 0.01, -hw + 0.01 + pw
    for y in (yp0 + 0.011, yp1 - 0.011):
        C.block(P, 'ped_side', (xc - xb - 0.02, 0.022, zu - 0.03), ((xb + 0.02 + xc) / 2, y, 0.03 + (zu - 0.03) / 2),
                'paint', bev=0.004, step=0.35, axes=(2,))
    C.block(P, 'ped_back', (0.012, pw - 0.044, zu - 0.03), (xb + 0.026, (yp0 + yp1) / 2, 0.03 + (zu - 0.03) / 2),
            'paint', bev=None)
    C.block(P, 'ped_base', (xc - xb - 0.03, pw, 0.03), ((xb + 0.02 + xc) / 2 - 0.005, (yp0 + yp1) / 2, 0.015), 'paint',
            bev=0.004)
    # the legs on +Y and the back panel between
    for sx in (-1, 1):
        C.block(P, 'leg', (0.05, 0.05, zu), (sx * (D / 2 - 0.05), hw - 0.04, zu / 2), 'paint', bev=0.005,
                step=0.35, axes=(2,))
    C.block(P, 'modesty', (0.016, hw * 2 - pw - 0.08, 0.36), (xb + 0.04, (yp1 + hw - 0.065) / 2, zu - 0.2), 'paint',
            bev=0.003)
    C.block(P, 'side_rail', (D - 0.15, 0.03, 0.08), (0.0, hw - 0.04, zu - 0.04), 'paint', bev=0.003)
    C.block(P, 'front_rail', (0.022, hw * 2 - pw - 0.06, 0.03), (xc - 0.011, (yp1 + hw - 0.065) / 2, zu - 0.12),
            'paint', bev=0.003)
    # the drawers: the wide one over the knee hole, then the pedestal's
    dxf = xc + tf
    yk0, yk1 = yp1 + 0.003, hw - 0.068
    drawer_unit(P, 'DRAWER_1', dxf, (yk0 + yk1) / 2, zu - 0.055, yk1 - yk0, 0.09, xc - xb - 0.08, t=tf, pull='two',
                knob_mat='chrome')
    gap = 0.005
    hs = [0.2, 0.16, 0.3]                         # top to bottom
    z = zu - 0.003
    yc = (yp0 + yp1) / 2
    for k, hh in enumerate(hs):
        drawer_unit(P, f'DRAWER_{k + 2}', dxf, yc, z - hh / 2, pw - 0.006, hh, xc - xb - 0.06, t=tf, pull='cup')
        z -= hh + gap
    # on the top: the blotter in its leather corners, a pen
    C.block(P, 'blotter', (0.36, 0.56, 0.006), (0.02, 0.05, H + 0.003), 'paint_b', rot=(0, 0, -3), bev=0.002)
    bm = bmesh.new()
    for sx in (-1, 1):
        for sy in (-1, 1):
            p = C.turned((0.02, 0.05, 0.0), -3) @ V((sx * 0.165, sy * 0.265, H + 0.0045))
            K.bm_cube(bm, (0.04, 0.04, 0.009), mat4(tuple(p), (0, 0, -3 + 45)))
    P.mesh('blotter_corners', bm, 'leather', bev=0.002, segs=1)
    P.cyl('pen', 0.005, 0.15, (-0.18, -0.42, H + 0.005), 'trim', axis=(0.3, 1, 0), segs=6, bev=None)
    C.marker(P, 'M_top', (0.05, -0.05, H))
    P.views = [('a', 30, 20), ('b', 215, 24)]


def cabinet(P):
    """
    A steel four-drawer filing cabinet (0.5 x 0.6 x 1.3): the carcass on its kick base, four drawers (DRAWER_1 at
    the top), each with its recessed pull under a label holder; DRAWER_2's floor at shelfOf's half height
    (M_inside_2). A slight dent in its side.
    """
    W, D, H = 0.5, 0.6, 1.3
    hw, xb, xf = W / 2, -D / 2, D / 2 - 0.022
    xc = xf - 0.02
    bm = K.bm_new()
    K.bm_cube(bm, (xc - xb, W, H - 0.05), mat4(((xb + xc) / 2, 0.0, 0.05 + (H - 0.05) / 2)))
    C.cuts(bm, (xc - xb, W, H), 0.2, axes=(0, 2))
    for v in bm.verts:
        if v.co.y > hw - 0.001:
            d2 = ((v.co.x + 0.05) / 0.16) ** 2 + ((v.co.z - 0.42) / 0.2) ** 2
            if d2 < 1.0:
                v.co.y -= 0.012 * (1 - d2)
    P.mesh('carcass', bm, 'paint', bev=0.008, segs=2)
    C.block(P, 'kick', (xc - xb - 0.04, W - 0.04, 0.05), ((xb + xc) / 2 - 0.01, 0.0, 0.025), 'trim', bev=0.004)
    # the rolled rim round the top, the lock at the top of the front
    for sy in (-1, 1):
        C.block(P, 'rim', (xc - xb, 0.012, 0.016), ((xb + xc) / 2, sy * (hw - 0.004), H - 0.006), 'paint', bev=0.004)
    C.block(P, 'rim', (0.012, W - 0.01, 0.016), (xb + 0.004, 0.0, H - 0.006), 'paint', bev=0.004)
    P.cyl('lock', 0.012, 0.016, (xc + 0.008, hw - 0.05, H - 0.012), 'chrome', axis='X', segs=12, bev=0.002, bsegs=1)
    bm = bmesh.new()
    C.rect_face(bm, 0.003, 0.012, (xc + 0.0165, hw - 0.05, H - 0.012), (1, 0, 0))
    P.mesh('lock_slot', bm, 'trim', sharp=50.0)
    for sx in (-1, 1):
        for sy in (-1, 1):
            P.cyl('glide', 0.016, 0.01, ((xb + 0.04) if sx < 0 else (xc - 0.04), sy * (hw - 0.04), 0.005), 'rubber',
                  segs=8, bev=None)
    bm = bmesh.new()
    C.rect_face(bm, W - 0.03, H - 0.09, (xc + 0.0005, 0.0, 0.065 + (H - 0.09) / 2), (1, 0, 0))
    P.mesh('openings', bm, 'trim', sharp=50.0)
    n = 4
    gap = 0.006
    dh = (H - 0.08 - 0.02 - gap * (n - 1)) / n
    z = H - 0.02
    for k in range(n):
        drawer_unit(P, f'DRAWER_{k + 1}', xf, 0.0, z - dh / 2, W - 0.03, dh, D - 0.06, t=0.02, front='paint',
                    box='steel', pull='cup', label=True)
        z -= dh + gap
    P.views = [('a', 30, 18), ('b', 215, 22)]


# ------------------------------------------------------------------------------------------------ the table

DOORS2 = dict(DOOR_L=door_l(), DOOR_R=door_r())
SPECS = {
    'cupboard': spec(cupboard, (1.8, 0.5, 1.9), movers=dict(DOORS2, DRAWER_1=drawer(0.3), DRAWER_2=drawer(0.3)),
                     markers=('M_inside', 'M_top', 'M_inside_1', 'M_inside_2'), colours=(0x9dbdb3, 0xe9e2cf), ao=0.12),
    'cupboard_s': spec(cupboard, (1.6, 0.5, 1.9), args=(1.6,), movers=dict(DOORS2, DRAWER_1=drawer(0.3),
                                                                            DRAWER_2=drawer(0.3)),
                       markers=('M_inside', 'M_top', 'M_inside_1', 'M_inside_2'), colours=(0xb8604c, 0xe9e2cf),
                       ao=0.12),
    'wardrobe': spec(wardrobe, (1.4, 0.6, 2.0), movers=DOORS2, markers=('M_inside',), colours=(0x8a6a48, 0xd9cdae),
                     ao=0.12),
    'bed': spec(bed, (2.0, 1.0, 0.5), bounds=(2.0, 1.0, 0.9), front=False, markers=('M_top',),
                colours=(0x8fb7c4, 0xf2efe6), ao=0.1, note='the headboard rises to 0.9'),
    'icebox': spec(icebox, (0.9, 0.7, 1.7), movers=dict(DOOR=door_r()), markers=('M_inside',),
                   colours=(0xe9e2cf, 0xc9503c), ao=0.1),
    'counter': spec(counter, (2.6, 0.7, 1.05), bounds=(2.6, 0.7, 1.37), markers=('M_top', 'M_inside'),
                    colours=(0x4f8a86, 0xece8dc), ao=0.1, note='the till stands on its top'),
    'shelf': spec(shelf, (2.2, 0.5, 1.9), args=(2.2, 0.5, 1.9), markers=('M_inside',), colours=(0xe3d8bd, 0xc9623f)),
    'shelf_shop': spec(shelf, (2.4, 0.5, 1.8), args=(2.4, 0.5, 1.8), markers=('M_inside',),
                       colours=(0x9dbdb3, 0xe9e2cf)),
    'shelf_mid': spec(shelf, (2.6, 0.55, 1.5), args=(2.6, 0.55, 1.5, True), markers=('M_inside',),
                      colours=(0xe3d8bd, 0x4f7f8a)),
    'shelf_garage': spec(shelf_garage, (2.4, 0.5, 2.0), args=(2.4, 0.5, 2.0), markers=('M_inside',),
                         colours=(0x5d7fa3, 0xe6dccb)),
    'shelf_garage_s': spec(shelf_garage, (2.2, 0.5, 2.0), args=(2.2, 0.5, 2.0), markers=('M_inside',),
                           colours=(0x6d8463, 0xe6dccb)),
    'toolbox': spec(toolbox, (0.8, 0.45, 0.5), args=(0.5, True),
                    movers=dict(DRAWER_1=drawer(0.3), DRAWER_2=drawer(0.3), DRAWER_3=drawer(0.3), LID=lid(95)),
                    markers=('M_inside', 'M_top', 'M_inside_1', 'M_inside_2', 'M_inside_3'),
                    colours=(0xb5402c, 0x2f3236), ao=0.06),
    'toolbox_top': spec(toolbox, (0.8, 0.45, 0.42), args=(0.42, False),
                        movers=dict(DRAWER_1=drawer(0.3), DRAWER_2=drawer(0.3), DRAWER_3=drawer(0.3), LID=lid(95)),
                        markers=('M_inside', 'M_top', 'M_inside_1', 'M_inside_2', 'M_inside_3'),
                        colours=(0x3f6f8a, 0xe6dccb), ao=0.06),
    'lift': spec(lift, (3.3, 0.4, 2.6), 'big', colours=(0x5d7fa3, 0xd9a23c), ao=0.12),
    'workbench_old': spec(workbench_old, (2.6, 0.7, 0.9), args=(2.6,), bounds=(2.6, 0.7, 1.08), markers=('M_top',),
                          colours=(0x6f8f5a, 0x4f7558), ao=0.1, note='the vice stands up over its top'),
    'workbench_old_s': spec(workbench_old, (2.2, 0.7, 0.9), args=(2.2,), bounds=(2.2, 0.7, 1.08), markers=('M_top',),
                            colours=(0x6f8f5a, 0x8a6a48), ao=0.1, note='the vice stands up over its top'),
    'rack': spec(rack, (2.4, 0.2, 1.9), colours=(0x6f7a82, 0xd8cdb4), ao=0.06),
    'desk': spec(desk, (1.3, 0.6, 0.76), movers={f'DRAWER_{k}': drawer(0.28) for k in range(1, 5)},
                 markers=('M_top', 'M_inside_1', 'M_inside_2', 'M_inside_3', 'M_inside_4'),
                 colours=(0x6f5a44, 0xe9e2cf), ao=0.1),
    'cabinet': spec(cabinet, (0.5, 0.6, 1.3), movers={f'DRAWER_{k}': drawer(0.45) for k in range(1, 5)},
                    markers=('M_inside_1', 'M_inside_2', 'M_inside_3', 'M_inside_4'), colours=(0x7a8a7a, 0xe6dccb),
                    ao=0.06),
    'ktable': spec(ktable, (1.4, 0.9, 0.76), bounds=(1.4, 2.04, 0.9), centre=(-0.148, 0.0), front=False,
                   markers=('M_top',), colours=(0x6f9a8a, 0xe6d9a8), ao=0.1, note='the chairs reach outside its top'),
}

MODELS = C.table('furniture', SPECS)


def main(args):
    C.run(MODELS, args)
