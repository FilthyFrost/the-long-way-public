"""
ModCar frame 'trailer' (蝌蚪): a fictional small single-axle box trailer to tow behind a car - a cream aluminium box
with ribbed sides and corner posts on a steel ladder chassis, an A-frame drawbar to a ball coupling, a jockey wheel
under the drawbar, mudguards over its two wheels (the Sugar Cube's 13-inch steel wheels), a door in its back that
swings round onto its right side; the floor inside planked. docs/V3/plan/growth.md section 6.2 (J9d).

    blender -b --factory-startup --python tools/blender/build.py -- frames/trailer [--no-preview] [--quick] [--dry]

Writes public/models/modcar/frames/trailer.glb and src/core/modcar/data/mounts/trailer.json (--dry: both into the
scratch directory instead); previews go to D:/modcar-scratch/frames/trailer/trailer_*.png. Blender axes: X forward,
Y left, Z up; origin on the ground under the axle. The coupling's ball socket is the json's `coupler` (game frame):
where the tow vehicle's hitch ball goes.
"""
import math
import os
import sys
import time

sys.dont_write_bytecode = True

import numpy as np  # noqa: E402

from frames import _kit as K  # noqa: E402
from frames import _preview as PV  # noqa: E402
from frames._sedan_build import game_vec, knuckles, mount, obj_with_origin, plate_buf  # noqa: E402
from frames._snail_build import canon  # noqa: E402
from lib import modcar as mc  # noqa: E402

PI = math.pi
OUT_GLB = 'public/models/modcar/frames/trailer.glb'
OUT_JSON = 'src/core/modcar/data/mounts/trailer.json'
SCRATCH = 'D:/modcar-scratch/frames/trailer/trailer'

# ============================================================================================ dimensions
D = dict(
    # the Sugar Cube's wheels: the 13-inch steel rim (radius 0.165) with the road tyre (sidewall 0.12)
    hub_z=0.285, wheel_r=0.285, track=1.39,
    # the box: rear and front faces, half width, its floor's underside and top, the roof
    x_r=-1.25, x_f=0.95, bw=0.70, z0=0.62, z_floor=0.665, z1=1.86,
    # the chassis rails (half spacing, width, depth), the drawbar's coupling (its socket's centre), the jockey wheel
    rail_y=0.42, rail_w=0.06, rail_d=0.10,
    coupler=(2.13, 0.0, 0.445), jockey=(1.62, -0.10),
    # the rear door: its frame inside the posts, its hinge on the right post
    door_y=0.66, door_z0=0.69, door_z1=1.83,
)
POST = 0.045
COUPLER = np.array(D['coupler'])


def both(left, centre=None):
    b = K.Buf().extend(left).extend(left.mirrored())
    if centre is not None:
        b.extend(centre)
    return b


def owo(buf, name, origin, parent=None, rot=None):
    o = obj_with_origin(canon(buf), name, origin, rot=rot)
    if parent is not None:
        o.parent = parent
        o.matrix_parent_inverse = parent.matrix_world.inverted()
    return o


# ============================================================================================ the box
def box_shell():
    """The box's outside: its walls and roof in the second paint (cream), the alu corner posts, rails and ribs (left
    half and the centred pieces separately: the caller mirrors)."""
    xr, xf, bw, z0, z1 = D['x_r'], D['x_f'], D['bw'], D['z0'], D['z1']
    left = K.Buf()
    # the side wall: a skin between the posts (5 mm), its ribs every 36 cm pressed out of it
    left.extend(K.box_buf((xr + POST * 0.5, bw - 0.005, D['z_floor'] - 0.02), (xf - POST * 0.5, bw, z1 - 0.02), 'paint_b', 0.0015, 1))
    nrib = 6
    for i in range(1, nrib):
        x = xr + (xf - xr) * i / nrib
        left.extend(K.box_buf((x - 0.022, bw - 0.001, D['z_floor'] + 0.05), (x + 0.022, bw + 0.011, z1 - 0.07), 'paint_b', 0.004, 2))
    # the corner posts (front and rear), the bottom rail (a deep alu extrusion the walls stand in) and the top rail
    for x in (xr, xf):
        left.extend(K.box_buf((x - POST / 2, bw - POST + 0.006, z0 - 0.02), (x + POST / 2, bw + 0.006, z1 + 0.018), 'alu', 0.006, 2))
    left.extend(K.box_buf((xr, bw - 0.004, z0 - 0.02), (xf, bw + 0.014, D['z_floor'] + 0.06), 'alu', 0.004, 2))
    left.extend(K.box_buf((xr, bw - 0.004, z1 - 0.055), (xf, bw + 0.012, z1 + 0.012), 'alu', 0.004, 2))
    centre = K.Buf()
    # the front wall and its ribs (a pair either side of the middle), the rails across it
    centre.extend(K.box_buf((xf - 0.005, -bw + 0.004, D['z_floor'] - 0.02), (xf, bw - 0.004, z1 - 0.02), 'paint_b', 0.0015, 1))
    for y in (-0.42, -0.14, 0.14, 0.42):
        centre.extend(K.box_buf((xf - 0.001, y - 0.022, D['z_floor'] + 0.05), (xf + 0.011, y + 0.022, z1 - 0.07), 'paint_b', 0.004, 2))
    centre.extend(K.box_buf((xf - 0.004, -bw, z0 - 0.02), (xf + 0.014, bw, D['z_floor'] + 0.06), 'alu', 0.004, 2))
    centre.extend(K.box_buf((xf - 0.004, -bw, z1 - 0.055), (xf + 0.012, bw, z1 + 0.012), 'alu', 0.004, 2))
    # the roof: a skin a little crowned (two flats meeting a centimetre higher on the middle) under the top rails
    for s in (1, -1):
        y0, y1 = (0.0, bw) if s > 0 else (-bw, 0.0)
        centre.extend(K.box_buf((xr + 0.01, y0, z1 - 0.012), (xf - 0.01, y1, z1 + 0.004), 'paint_b', 0.002, 1))
    centre.extend(K.box_buf((xr + 0.01, -0.03, z1 + 0.002), (xf - 0.01, 0.03, z1 + 0.012), 'paint_b', 0.004, 2))
    # the rear frame round the door: the header over it, the sill under it (the lamps and the plate on it)
    centre.extend(K.box_buf((xr - 0.016, -bw, z1 - 0.07), (xr + 0.012, bw, z1 + 0.012), 'alu', 0.005, 2))
    centre.extend(K.box_buf((xr - 0.03, -bw, z0 - 0.05), (xr + 0.012, bw, D['z_floor'] + 0.025), 'alu', 0.006, 2))
    return left, centre


def lamps_and_plate():
    """On the rear sill: two red tail lamp boxes outboard (the lamp parts' recesses: the mounts), the plate in the
    middle; amber side reflectors on the walls' rear ends."""
    b = K.Buf()
    xr = D['x_r']
    plate = plate_buf(np.array([xr - 0.031, 0.0, D['z0'] + 0.005]), (-1, 0, 0), (0, 0, 1), w=0.30, h=0.11, text='TP 08')
    b.extend(plate)
    for s in (1, -1):
        b.extend(K.box_buf((xr - 0.004, s * D['bw'] + (0.0 if s > 0 else -0.012), 0.80), (xr + 0.06, s * D['bw'] + (0.012 if s > 0 else 0.0), 0.84), 'lens_amber', 0.002, 1))
    return b


def tail_mount():
    return np.array([D['x_r'] - 0.03, D['bw'] - 0.13, D['z0'] + 0.005])


# ============================================================================================ the chassis
def chassis():
    """The ladder chassis under the floor (its two rails, the cross members), the A-frame drawbar to the coupling's
    head, the coupling with its handle, the safety chain's loop, the jockey wheel's clamp, its tube, its wheel and its
    crank; the mudguards over the wheels. One Buf, whole (not mirrored: the jockey wheel stands to one side)."""
    b = K.Buf()
    xr, xf = D['x_r'], D['x_f']
    ry, rw, rd = D['rail_y'], D['rail_w'], D['rail_d']
    zt = D['z0']
    for s in (1, -1):
        b.extend(K.box_buf((xr + 0.02, s * ry - rw / 2, zt - rd), (xf - 0.02, s * ry + rw / 2, zt), 'steel', 0.006, 2))
    for x in (xr + 0.06, -0.55, 0.45, xf - 0.06):
        b.extend(K.box_buf((x - 0.03, -D['bw'] + 0.04, zt - 0.07), (x + 0.03, D['bw'] - 0.04, zt - 0.005), 'steel', 0.005, 2))
    # the drawbar: two tubes from the rails' front ends to the coupling head, a brace across them
    cx, cy, cz = D['coupler']
    head0 = np.array([cx - 0.18, 0.0, cz + 0.07])
    for s in (1, -1):
        b.extend(K.tube_buf(np.array([[xf - 0.06, s * ry, zt - 0.05], [xf + 0.30, s * 0.30, zt - 0.06], [head0[0], s * 0.05, head0[2]]]), 0.034, 'steel', 14))
    b.extend(K.tube_buf(np.array([[xf + 0.42, -0.255, zt - 0.065], [xf + 0.42, 0.255, zt - 0.065]]), 0.026, 'steel', 12))
    # the coupling head: its body over the ball's socket, the cup under it, the locking handle on top
    b.extend(K.box_buf((head0[0] - 0.02, -0.055, cz + 0.02), (cx + 0.035, 0.055, cz + 0.105), 'steel', 0.012, 3))
    b.extend(K.cyl_buf((cx, 0.0, cz - 0.01), (cx, 0.0, cz + 0.05), 0.046, 'steel', 20))
    b.extend(K.tube_buf(np.array([[cx - 0.10, 0.0, cz + 0.105], [cx - 0.02, 0.0, cz + 0.16], [cx + 0.07, 0.0, cz + 0.15]]), 0.012, 'trim', 10))
    b.extend(K.cyl_buf((cx + 0.07, 0.0, cz + 0.15), (cx + 0.11, 0.0, cz + 0.147), 0.018, 'rubber', 12))
    # the safety chain hanging in a loop under the head
    pts = [[cx - 0.10, s * 0.05, cz + 0.02] for s in (1,)] + [[cx - 0.06, 0.06, cz - 0.10], [cx - 0.02, 0.0, cz - 0.14], [cx - 0.06, -0.06, cz - 0.10], [cx - 0.10, -0.05, cz + 0.02]]
    b.extend(K.tube_buf(np.array(pts), 0.006, 'steel', 6))
    # the jockey wheel: its clamp on the left tube, the tube down, the fork, the wheel, the crank on top
    jx, jy = D['jockey']
    zg = 0.09
    b.extend(K.box_buf((jx - 0.05, jy - 0.05, zt - 0.11), (jx + 0.05, jy + 0.05, zt - 0.02), 'steel', 0.006, 2))
    b.extend(K.cyl_buf((jx, jy, zg + 0.10), (jx, jy, zt + 0.07), 0.026, 'steel', 16))
    b.extend(K.cyl_buf((jx, jy, zt + 0.07), (jx, jy, zt + 0.10), 0.02, 'steel', 12))
    b.extend(K.tube_buf(np.array([[jx, jy, zt + 0.10], [jx, jy + 0.10, zt + 0.10], [jx, jy + 0.10, zt + 0.16]]), 0.008, 'steel', 8))
    b.extend(K.cyl_buf((jx, jy + 0.10, zt + 0.16), (jx, jy + 0.10, zt + 0.21), 0.013, 'rubber', 10))
    for s in (1, -1):
        b.extend(K.box_buf((jx - 0.012, jy + s * 0.045 - 0.006, zg - 0.01), (jx + 0.012, jy + s * 0.045 + 0.006, zg + 0.11), 'steel', 0.003, 1))
    b.extend(K.disc_buf((jx, jy + 0.03, zg), (0, 1, 0), zg, 'rubber', r_in=0.045, segs=24))
    b.extend(K.disc_buf((jx, jy - 0.03, zg), (0, -1, 0), zg, 'rubber', r_in=0.045, segs=24))
    b.extend(K.cyl_buf((jx, jy - 0.03, zg), (jx, jy + 0.03, zg), zg, 'rubber', 24, cap=False))
    b.extend(K.cyl_buf((jx, jy - 0.032, zg), (jx, jy + 0.032, zg), 0.045, 'steel', 18))
    # the mudguards: an arc of sheet over each wheel, from the box's side out past the tyre, a bracket to the rail
    hz = D['hub_z']
    for s in (1, -1):
        y0, y1 = (D['bw'] - 0.06, D['track'] / 2 + 0.12) if s > 0 else (-D['track'] / 2 - 0.12, -D['bw'] + 0.06)
        arc = []
        for a in np.linspace(math.radians(12), math.radians(168), 16):
            arc.append((math.cos(a) * 0.37, hz + math.sin(a) * 0.37))
        for a in np.linspace(math.radians(168), math.radians(12), 16):
            arc.append((math.cos(a) * 0.355, hz + math.sin(a) * 0.355))
        poly = np.array(arc)
        # (prism in the x-z plane, extruded along y: plane 'xz' maps (a, b, c) to (a, -c, b))
        b.extend(K.prism_buf(poly, -y1, -y0, 'trim', 0.002, 1, plane='xz'))
        b.extend(K.box_buf((-0.04, min(s * (D['bw'] - 0.06), s * ry), zt - 0.06), (0.04, max(s * (D['bw'] - 0.06), s * ry), zt - 0.02), 'steel', 0.004, 1))
    return b


def under():
    """The axle beam between the hubs and its leaf springs under the rails (their hangers and shackles)."""
    b = K.Buf()
    hz = D['hub_z']
    hy = D['track'] / 2 - 0.08
    b.extend(K.cyl_buf((0.0, -hy, hz), (0.0, hy, hz), 0.035, 'steel', 18))
    for s in (1, -1):
        y = s * D['rail_y']
        for i, (dz, half) in enumerate(((0.0, 0.42), (-0.012, 0.34), (-0.024, 0.24))):
            b.extend(K.box_buf((-half, y - 0.028, hz + 0.045 + dz), (half, y + 0.028, hz + 0.055 + dz), 'steel', 0.002, 1))
        b.extend(K.box_buf((-0.05, y - 0.04, hz + 0.02), (0.05, y + 0.04, hz + 0.07), 'steel', 0.004, 1))
        for x in (-0.43, 0.43):
            b.extend(K.box_buf((x - 0.02, y - 0.022, hz + 0.05), (x + 0.02, y + 0.022, D['z0'] - D['rail_d']), 'steel', 0.003, 1))
    return b


def interior():
    """Inside the box: the planked floor (seams between the boards), the walls lined (cream), a tie-down rail along
    each wall at hand height."""
    b = K.Buf()
    xr, xf, bw = D['x_r'], D['x_f'], D['bw']
    zf = D['z_floor']
    n = 8
    w = (2 * (bw - 0.012)) / n
    for i in range(n):
        y0 = -bw + 0.012 + i * w
        b.extend(K.box_buf((xr + 0.02, y0 + 0.003, zf - 0.012), (xf - 0.012, y0 + w - 0.003, zf), 'wood', 0.002, 1))
    # (the boards on a sheet of ply: nothing seen through their seams)
    b.extend(K.box_buf((xr + 0.02, -bw + 0.012, zf - 0.02), (xf - 0.012, bw - 0.012, zf - 0.011), 'wood', 0.0, 1))
    for s in (1, -1):
        y = s * (bw - 0.012)
        b.extend(K.box_buf((xr + 0.02, min(y, s * (bw - 0.006)), zf), (xf - 0.012, max(y, s * (bw - 0.006)), D['z1'] - 0.02), 'paint_b', 0.0, 1))
        b.extend(K.box_buf((xr + 0.06, s * (bw - 0.03) - 0.01, 1.22), (xf - 0.06, s * (bw - 0.03) + 0.01, 1.25), 'alu', 0.003, 1))
    b.extend(K.box_buf((xf - 0.018, -bw + 0.01, zf), (xf - 0.012, bw - 0.01, D['z1'] - 0.02), 'paint_b', 0.0, 1))
    b.extend(K.box_buf((xr + 0.02, -bw + 0.01, D['z1'] - 0.024), (xf - 0.012, bw - 0.01, D['z1'] - 0.018), 'paint_b', 0.0, 1))
    return b


def door():
    """The rear door: a cream skin in an alu frame, two vertical locking bars with their cams, a handle, its two
    hinges on the right post. In place; the caller makes it an object about its hinge."""
    b = K.Buf()
    x = D['x_r'] - 0.012
    y0, y1 = -D['door_y'], D['door_y']
    z0, z1 = D['door_z0'], D['door_z1']
    b.extend(K.box_buf((x - 0.014, y0, z0), (x, y1, z1), 'paint_b', 0.002, 1))
    for (a0, a1, c0, c1) in ((y0, y1, z0, z0 + 0.045), (y0, y1, z1 - 0.045, z1), (y0, y0 + 0.045, z0, z1), (y1 - 0.045, y1, z0, z1)):
        b.extend(K.box_buf((x - 0.024, a0, c0), (x - 0.010, a1, c1), 'alu', 0.004, 2))
    for y in (0.36, 0.0):
        b.extend(K.cyl_buf((x - 0.034, y, z0 + 0.03), (x - 0.034, y, z1 - 0.03), 0.011, 'chrome', 10))
        for z in (z0 + 0.06, z1 - 0.06):
            b.extend(K.box_buf((x - 0.05, y - 0.03, z - 0.015), (x - 0.02, y + 0.03, z + 0.015), 'steel', 0.003, 1))
    b.extend(K.box_buf((x - 0.06, 0.30, 1.16), (x - 0.03, 0.42, 1.20), 'trim', 0.006, 2))
    for z in (z0 + 0.18, z1 - 0.18):
        b.extend(K.box_buf((x - 0.04, y0 - 0.03, z - 0.05), (x + 0.005, y0 + 0.05, z + 0.05), 'steel', 0.004, 1))
    return b


def knuckle(hx, hy, hz, front=False):
    return K.knuckle_buf(hx, hy, hz, hy + 0.010, 0.062, 4, 0.049, 45.0, stud_r=0.0055, stud_len=0.007, cap_r=0.022, cap_out=0.005, carrier=(0.05, 0.03, 0.11, 0.13))


# ============================================================================================ mounts
def mounts(panels):
    E = []
    hz = D['hub_z']
    for name, y, side in (('hub_RL', D['track'] / 2, -1), ('hub_RR', -D['track'] / 2, 1)):
        E.append(mount(name, (0.0, y, hz), dict(cat='rim', axle='rear', steer=False, driven=False, handbrake=False, side=side,
                                                  hub_face=round(abs(y) + 0.005, 4), wheel_r=D['wheel_r'])))
    for pname, info in panels.items():
        E.append(mount(info['mount'], tuple(info['hinge_pos']), dict(cat='trunk', panel=pname, hinge=info['hinge'], open_deg=info['open_deg'], side=0,
                                                                     note="the box's rear door, hinged on its right post; it swings round onto the side")))
    tp = tail_mount()
    for side, sname in ((1, 'L'), (-1, 'R')):
        E.append(mount('taillight_' + sname, (tp[0], side * tp[1], tp[2]), dict(cat='taillight', side=-side, recess='rect', recess_w=0.14, recess_h=0.05,
                                                                                 recess_depth=0.03, on="the box's rear sill, outboard")))
    return E


# ============================================================================================ build
def build(args):
    t0 = time.time()
    quick = '--quick' in args
    no_preview = '--no-preview' in args
    dry = '--dry' in args
    out_glb, out_json = (SCRATCH + '_dry.glb', SCRATCH + '_dry.json') if dry else (OUT_GLB, OUT_JSON)
    os.makedirs(os.path.dirname(SCRATCH), exist_ok=True)
    mc.reset_scene()
    left, centre = box_shell()
    body = both(left, centre)
    body.extend(lamps_and_plate()).extend(chassis())
    objs = [canon(body).to_object('BODY')]
    objs.append(canon(under()).to_object('UNDER'))
    objs.append(canon(interior()).to_object('INTERIOR'))
    panels = {}
    hinge = np.array([D['x_r'] - 0.03, -D['door_y'] - 0.02, (D['door_z0'] + D['door_z1']) / 2])
    objs.append(owo(door(), 'P_trunk', hinge))
    panels['P_trunk'] = dict(mount='trunk', hinge='z', hinge_pos=hinge, axis=(0, 0, 1), open_deg=270.0)
    empties = mounts(panels)
    objs += knuckles(empties, lambda x, y, z, front: canon(knuckle(x, y, z, front)))
    meshes = [o for o in objs if o.type == 'MESH']
    tris = {o.name: mc.triangles([o]) for o in meshes}
    total = sum(tris.values())
    print('[trailer] triangles', total, tris)
    if not quick:
        mc.bake_ao(meshes, samples=32, distance=0.35)
        print('[trailer] AO', round(time.time() - t0, 1), 's')
    print('[trailer] grime masks', K.mask_frame(meshes))
    mc.export_glb(out_glb, meshes + empties)
    lo = np.full(3, 1e9)
    hi = np.full(3, -1e9)
    from mathutils import Vector
    for o in meshes:
        for c in o.bound_box:
            w = o.matrix_world @ Vector(c)
            lo = np.minimum(lo, w)
            hi = np.maximum(hi, w)
    glo, ghi = game_vec(lo), game_vec(hi)
    ps = {name: dict(mount=info['mount'], hinge=info['hinge'], hinge_pos=game_vec(info['hinge_pos']), hinge_axis=game_vec(info['axis']), open_deg=info['open_deg'], glass=None)
          for name, info in panels.items()}
    extra = dict(panels=ps, coupler=game_vec(COUPLER), eye_default=game_vec(np.array([0.0, 0.0, 1.6])),
                 bbox=dict(min=[min(glo[i], ghi[i]) for i in range(3)], max=[max(glo[i], ghi[i]) for i in range(3)]),
                 triangles=dict(total=total, **tris), units='metres, game frame (+x forward, +y up, +z right)',
                 notes='coupler: the ball socket of the coupling, where a tow hitch ball goes (game frame)')
    mc.mounts_json(out_json, 'trailer', extra)
    print('[trailer] exported', out_glb, round(time.time() - t0, 1), 's')
    if not no_preview:
        PV.materials()
        PV.scene_setup('anime')
        smp = 16 if quick else 40
        for name, yaw, pitch, dist in (('f34', 35, 10, 6.6), ('r34', 145, 12, 6.6), ('side', 270, 3, 7.0), ('rear', 180, 6, 5.6)):
            PV.orbit((0.4, 0, 0.8), yaw, pitch, dist, lens=50)
            PV.render(f'{SCRATCH}_{name}.png', res=(1280, 720), samples=smp)
    print('[trailer] done', round(time.time() - t0, 1), 's')


def main(args):
    build(args)
