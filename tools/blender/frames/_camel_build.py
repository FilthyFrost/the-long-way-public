"""Camel assembly (the Elephant's, frames/_elephant_build.py, with its hood a shell of its own): objects, origins, mounts, JSON,
AO, export and previews. Called from frames/camel.py main()."""
import math
import sys
import time

sys.dont_write_bytecode = True

import bpy  # noqa: E402
import numpy as np  # noqa: E402
from mathutils import Matrix, Vector  # noqa: E402

from frames import _kit as K  # noqa: E402
from frames import _preview as PV  # noqa: E402
from frames import _camel_ext as EX  # noqa: E402
from frames import _camel_hood as HX  # noqa: E402
from frames import _camel_inner as IN  # noqa: E402
from frames import camel as S  # noqa: E402
from frames import camel_hood as H  # noqa: E402
from frames._sedan_build import game_vec, knuckles, mount, needle, obj_with_origin  # noqa: E402
from frames._sedan_ext import side_dir  # noqa: E402
from frames._elephant_build import canon, rot_z  # noqa: E402
from lib import modcar as mc  # noqa: E402

D = S.D
HD = H.D
OUT_GLB = 'public/models/modcar/frames/camel.glb'
OUT_JSON = 'src/core/modcar/data/mounts/camel.json'
SCRATCH = 'D:/modcar-scratch/frames/camel/camel'


def both(left, centre=None):
    b = K.Buf()
    b.extend(left)
    b.extend(left.mirrored())
    if centre is not None:
        b.extend(centre)
    return b


def owo(buf, name, origin, parent=None, rot=None):
    return obj_with_origin(canon(buf), name, origin, parent=parent, rot=rot)


def tail_seal(ex):
    """The rubber seal inside the emergency door's window (left half: the outline runs from the centre line round)."""
    w = ex.win['tail']
    cen = np.array([w['P'][:, 0].mean() + 0.1, 0.0, w['P'][:, 2].mean()])
    E = side_dir(w['P'], w['N'], np.tile(cen, (len(w['P']), 1)), False)
    k = K.coarse_idx(w['P'], 0.001)
    P, N, E = w['P'][k], w['N'][k], E[k]
    prof = np.array([(-0.006, 0.0), (-0.005, 0.0035), (0.0, 0.005), (0.005, 0.0035), (0.006, 0.0)])
    V, Nn, Tr = K.sweep(P + E * 0.007 - N * 0.009, N, prof, closed=False)
    return K.Buf().add(V, Nn, Tr, 'rubber')


def build(args):
    t0 = time.time()
    quick = '--quick' in args
    no_preview = '--no-preview' in args
    mc.reset_scene()
    ex = EX.Exterior()
    hood = HX.Hood()
    print('[camel] exterior surfaces', round(time.time() - t0, 1), 's')
    # ---------------------------------------------------------------- BODY: the box and the hood
    eb, per, pedges = ex.edges()
    strips, pstrips = ex.waist_strips()
    common = K.Buf()
    common.extend(ex.roof())
    common.extend(eb)
    common.extend(ex.opening_details())
    common.extend(ex.nose_details())
    common.extend(ex.ws_trims())
    common.extend(ex.drip_rail())
    common.extend(ex.window_seals(['rw'] + ex.row))
    common.extend(ex.tail_details())
    common.extend(IN.engine_bay())
    left = K.Buf().extend(common).extend(ex.body('L')).extend(per['L']).extend(strips['L'])
    left.extend(ex.window_seals(['drv', 'quarter'])).extend(ex.fuel_details())
    right = K.Buf().extend(common).extend(ex.body('R')).extend(per['R']).extend(strips['R'])
    body = K.Buf().extend(left).extend(right.mirrored())
    hb = K.Buf().extend(hood.body()).extend(hood.edges()).extend(hood.details()).extend(hood.lining())
    body.extend(both(hb, hood.emblem()))
    objs = [canon(EX.two_tone(body)).to_object('BODY')]
    print('[camel] body', round(time.time() - t0, 1), 's')
    panels = {}
    gl = ex.glass()
    # ---------------------------------------------------------------- the entry door on the right, hinged at its front edge
    sd = ex.door_skin('side')
    sd.extend(pedges['side']).extend(pstrips['side']).extend(ex.door_card('side', mat='plastic_int')).extend(IN.door_extras(ex, 'side'))
    sd.extend(ex.window_seals(['side']))
    EX.two_tone(sd)
    dh = np.array([D['sd_x1'] - 0.004, -(float(S.side_w(D['sd_x1'], 1.50)) - 0.004), 1.50])
    o = owo(sd.mirrored(), 'P_door_side', dh)
    og = owo(gl['side'].mirrored(), 'PG_door_side', dh, parent=o)
    objs += [o, og]
    panels['P_door_side'] = dict(mount='door_side', glass='PG_door_side', hinge='z', hinge_pos=dh, axis=(0, 0, 1), open_deg=95.0)
    # ---------------------------------------------------------------- the emergency door in the tail, hinged at its left edge
    lid = ex.rear_panel('lid')
    lid.extend(pedges['lid']).extend(IN.lid_details('lid')).extend(ex.rear_panel_back('lid', -0.03, 'paint_b')).extend(tail_seal(ex))
    yl = D['lid_hw'] - 0.01
    th = S.REAR.to3d(np.array([[yl, (D['lid_z0'] + D['lid_z1']) / 2]]))[0][0] + np.array([0.004, 0.0, 0.0])
    o = owo(both(lid, IN.lid_centre('lid')), 'P_trunk', th)
    og = owo(both(gl['tail']), 'PG_trunk', th, parent=o)
    objs += [o, og]
    panels['P_trunk'] = dict(mount='trunk', glass='PG_trunk', hinge='z', hinge_pos=th, axis=(0, 0, 1), open_deg=-100.0)
    # ---------------------------------------------------------------- the bonnet (the hood's top), hinged at the cowl
    bon = both(K.Buf().extend(hood.bonnet()).extend(hood.bonnet(level=HX.WALL)))
    bh = np.array([D['xf'] + 0.012, 0.0, float(H.roof_z(D['xf'] + 0.012, 0.0)) - 0.005])
    objs.append(owo(bon, 'P_hood', bh))
    panels['P_hood'] = dict(mount='hood', hinge='y', hinge_pos=bh, axis=(0, 1, 0), open_deg=-55.0)
    # ---------------------------------------------------------------- fuel flap (left, hinged on its front edge)
    ff = ex.fuel_flap()
    fc = ex.cut['fuel'].P.mean(0)
    fhinge = np.array([fc[0] + D['fuel'][2] - 0.002, fc[1] + 0.002, fc[2]])
    objs.append(owo(ff, 'FUEL_CAP', fhinge))
    panels['FUEL_CAP'] = dict(mount=None, hinge='z', hinge_pos=fhinge, axis=(0, 0, 1), open_deg=-85.0)
    # ---------------------------------------------------------------- GLASS, UNDER, INTERIOR
    g = K.Buf()
    for k in ('ws', 'rw', 'row'):
        g.extend(gl[k]).extend(gl[k].mirrored())
    g.extend(gl['drv']).extend(gl['quarter'])
    objs.append(canon(g).to_object('GLASS'))
    objs.append(canon(both(IN.underbody(), IN.centre_under())).to_object('UNDER'))
    it = IN.interior(ex)
    inner = K.Buf().extend(it['L']).extend(it['L'].mirrored()).extend(it['C']).extend(it['R'].mirrored())
    inner.extend(ex.lining('L')).extend(ex.lining('R').mirrored())
    inner.extend(both(ex.roof(level=EX.WALL)))
    ib, dial_glass = K.split_mat(inner, ('glass',))
    o_int = canon(ib).to_object('INTERIOR')
    dial_glass = canon(dial_glass)
    objs.append(o_int)
    needles = {}
    for gdesc in it['gauges']:
        nb, info = needle(gdesc)
        rot = K.frame_from(info['rest'], gdesc['normal'])
        objs.append(owo(nb, gdesc['name'], gdesc['center'], rot=rot))
        needles[gdesc['name']] = info
    wipers = {}
    for wname, wy, wl in (('WIPER_L', 0.92, 0.72), ('WIPER_R', 0.06, 0.72)):
        wb, info = wiper(wy, wl)
        objs.append(owo(wb, wname, info['pivot'], rot=info['rot']))
        wipers[wname] = info
    print('[camel] objects', round(time.time() - t0, 1), 's')
    empties = mounts(ex, hood, panels)
    objs += knuckles(empties, lambda x, y, z, front: canon(IN.knuckle(x, y, z, front)))
    meshes = [o for o in objs if o.type == 'MESH']
    tris = {o.name: mc.triangles([o]) for o in meshes}
    total = sum(tris.values())
    print('[camel] triangles', total, {k: v for k, v in sorted(tris.items(), key=lambda kv: -kv[1])[:10]})
    if not quick:
        # the engine bay under the hood is baked with the bonnet up (one looks into it with it up)
        hd = next(o for o in meshes if o.name == 'P_hood')
        K.bake_ao_open(meshes, [(hd, panels['P_hood']['axis'], panels['P_hood']['open_deg'])],
                       ((HD['xr'] - 0.05, -(HD['hw'] + 0.02), 0.30), (HD['xf'] + 0.05, HD['hw'] + 0.02, HD['roof_z'] + 0.05)), samples=32, distance=0.35)
        print('[camel] AO', round(time.time() - t0, 1), 's')
        K.rebake_mats(o_int, [o for o in meshes if o.name.startswith('N_')], ('gauge',), samples=32, distance=0.35)
    K.join_white(o_int, dial_glass)
    tris = {o.name: mc.triangles([o]) for o in meshes}
    total = sum(tris.values())
    print('[camel] grime masks', K.mask_frame(meshes))
    mc.export_glb(OUT_GLB, meshes + empties)
    mc.mounts_json(OUT_JSON, 'camel', json_extra(objs, panels, needles, wipers, tris, total))
    print('[camel] exported', round(time.time() - t0, 1), 's')
    if not no_preview:
        previews(quick)
    print('[camel] done', round(time.time() - t0, 1), 's')


def wiper(y_pivot, length):
    """Wiper arm and blade resting along the windscreen's foot, pointing to -Y; local Z = the glass's normal."""
    z = D['ws_foot'] - 0.035
    p, n = S.FRONT.to3d(np.array([[y_pivot, z]]))
    p = p[0] + n[0] * 0.004
    nrm = K.unit(np.array([math.cos(math.radians(D['ws_lean'])), 0.0, math.sin(math.radians(D['ws_lean']))]))
    rest = np.array([0.0, -1.0, 0.0])
    rest = K.unit(rest - nrm * np.dot(rest, nrm))
    R = K.frame_from(rest, nrm)
    b = K.Buf()
    V, N, T = K.lathe(np.array([(0.0, 0.026), (0.012, 0.024), (0.016, 0.012), (0.017, 0.0)])[::-1], (0, 0, 0), (0, 0, 1), 14)
    b.add(V, N, T, 'trim')
    # the arm rises from the pivot onto the glass a few centimetres up (the glass foot is over the pivot; local -y is
    # up the glass)
    b.extend(K.tube_buf(np.array([(0.0, 0.0, 0.022), (0.05, -0.035, 0.03), (length, -0.05, 0.03)]), 0.0045, 'trim', 6))
    b.extend(K.box_buf((0.06, -0.058, 0.012), (length + 0.02, -0.042, 0.02), 'trim', 0.003, 1))
    b.extend(K.box_buf((0.05, -0.054, 0.0), (length + 0.03, -0.046, 0.012), 'rubber', 0.002, 1))
    Vw, Nw, Tw, Mw = b.arrays()
    out = K.Buf()
    out.add(Vw @ R.T + p, Nw @ R.T, Tw, 'trim')
    out.M = list(Mw)
    return out, dict(pivot=p, rot=R, normal=nrm, rest=rest, sweep_deg=-95.0, axis_local='y')


# ============================================================================================ mounts
def mounts(ex, hood, panels):
    E = []
    hz = D['hub_z']
    for name, x, y, front, side in (('hub_FL', HD['ax_f'], D['track_f'] / 2, True, -1), ('hub_FR', HD['ax_f'], -D['track_f'] / 2, True, 1),
                                    ('hub_RL', D['ax_r'], D['track_r'] / 2, False, -1), ('hub_RR', D['ax_r'], -D['track_r'] / 2, False, 1)):
        E.append(mount(name, (x, y, hz), dict(cat='rim', axle='front' if front else 'rear', steer=front, driven=not front,
                                               handbrake=not front, side=side, hub_face=round(abs(y) + 0.010, 4), wheel_r=D['wheel_r'])))
    E.append(mount('engine', IN.ENGINE, dict(cat='engine', space_min=[-0.53, -0.38, 0.0], space_max=[0.61, 0.38, 0.95],
                                             note='under the hood over the front axle, its fan and pulley (+x) towards the radiator')))
    E.append(mount('radiator', IN.RADIATOR, dict(cat='radiator', space_min=[-0.15, -0.43, 0.0], space_max=[0.05, 0.43, 0.68],
                                                 note='behind the grille')))
    E.append(mount('gearbox', IN.GEARBOX, dict(cat='gearbox', space_min=[-0.36, -0.2, 0.0], space_max=[0.34, 0.2, 0.42],
                                               note='behind the engine under the cab\'s floor, its bell towards the engine')))
    E.append(mount('battery', IN.BATTERY, dict(cat='battery', space_min=[-0.19, -0.11, 0.0], space_max=[0.19, 0.11, 0.26],
                                               note='on a tray beside the engine under the hood')))
    E.append(mount('houseBattery', IN.HOUSE_BATTERY, dict(cat='houseBattery', space_min=[-0.26, -0.13, 0.0], space_max=[0.26, 0.13, 0.26],
                                                         note='the house battery: on the floor behind the modesty panel, by the wall')))
    E.append(mount('fuelTank', IN.TANK, dict(cat='fuelTank', space_min=[-0.53, -0.42, 0.0], space_max=[0.56, 0.42, 0.43],
                                             note='under the floor between the rails, yawed 180 deg: the filler neck to the flap on the left'),
                   rot=rot_z(180.0)))
    E.append(mount('exhaust', (IN.ENGINE[0] - 0.40, -0.55, 0.40), dict(cat='exhaust', tail=[-1.61, 0.05, -0.07],
                                                                        route='from the engine back under the right of the floor')))
    p, d = IN.steering_mount()
    ang = math.radians(IN.COLUMN_DEG)
    E.append(mount('steering', tuple(p), dict(cat='steering', column_deg=IN.COLUMN_DEG), rot=K.frame_from(d, (math.sin(ang), 0, math.cos(ang)))))
    E.append(mount('seat_driver', (IN.SEAT_X, IN.DRIVER_Y, IN.SEAT_Z), dict(cat='seat', driver=True, floor_z=round(IN.SEAT_Z, 4), side=-1, note='on its pedestal')))
    E.append(mount('seat_pass', (IN.PASS_X, -IN.PASS_Y, IN.FLOOR_Z), dict(cat='seat', driver=False, floor_z=round(IN.FLOOR_Z, 4), side=1,
                                                                          note='the first seat behind the entry door (bare: the bus was emptied)')))
    for pname, info in panels.items():
        if info['mount'] is None:
            continue
        m = info['mount']
        cat = 'door' if m.startswith('door') else m
        side = 1 if m == 'door_side' else 0
        E.append(mount(m, tuple(info['hinge_pos']), dict(cat=cat, panel=pname, hinge=info['hinge'], open_deg=info['open_deg'], side=side)))
    zf = 0.60
    xb = float(H.FRONT.to3d(np.array([[0.0, zf]]))[0][0][0])
    E.append(mount('bumperFront', (xb + 0.005, 0.0, zf), dict(cat='bumperFront', fit=[0.16, 2.30, 0.20])))
    zr = 0.62
    xr = float(S.REAR.to3d(np.array([[0.0, zr]]))[0][0][0])
    E.append(mount('bumperRear', (xr - 0.005, 0.0, zr), dict(cat='bumperRear', fit=[0.16, 2.36, 0.20])))
    c3, n3 = hood.lamp_mount
    tp, tn = ex.tail_mount
    for side, sname in ((1, 'L'), (-1, 'R')):
        E.append(mount('headlight_' + sname, (c3[0], side * c3[1], c3[2]), dict(cat='headlight', side=-side, recess='round', recess_d=HD['lamp_d'],
                                                                                 recess_depth=0.07)))
        E.append(mount('taillight_' + sname, (tp[0], side * tp[1], tp[2]),
                       dict(cat='taillight', side=-side, recess='rect', recess_w=D['tail_w'], recess_h=D['tail_h'], recess_depth=0.045,
                            on='tail, beside the emergency door, upright (the mount turned 90 deg about x)'),
                       rot=((1.0, 0.0, 0.0), (0.0, 0.0, -side * 1.0), (0.0, side * 1.0, 0.0))))
        E.append(mount('mirror_' + sname, (D['xf'] - 0.06, side * (D['hw'] + 0.02), 2.05), dict(cat='mirror', side=-side, on='the box\'s front corner, on an arm')))
        E.append(mount('armor_' + sname, (0.25, side * (D['hw'] + 0.003), 1.00), dict(cat='armor', side=-side, fit=[4.9, 0.05, 0.62], fit_anchor='center')))
    # the roof: a deck for a long rack (the ladder up the side to it)
    E.append(mount('roof', (-1.0, 0.0, D['roof_z'] + D['roof_crown']), dict(cat='roof', fit=[5.6, 2.1, 0.2], fit_anchor='center')))
    E.append(mount('horn', (HD['xf'] - 0.18, -0.55, 0.90), dict(cat='horn', on='under the hood behind the grille')))
    E.append(mount('radio', (IN.DASH_FACE_X - 0.012, 0.0, IN.DASH_TOP - 0.088), dict(cat='radio', slot=[0.18, 0.046], slot_depth=0.06)))
    E.append(mount('handbrake', (IN.SEAT_X - 0.06, IN.CONSOLE_Y, IN.CONSOLE_TOP), dict(cat='handbrake', note='on the console right of the seat')))
    E.append(mount('gearLever', (IN.GEAR_X, IN.CONSOLE_Y, IN.CONSOLE_TOP + 0.014), dict(cat='gearLever', note='on the console right of the seat')))
    p_, d_ = IN.steering_mount()
    pi_ = p_ + d_ * 0.12 + np.array([0.0, -0.045, 0.0])
    E.append(mount('ignition', tuple(pi_), dict(cat='ignition', on='steering column shroud, right side')))
    return E


def json_extra(objs, panels, needles, wipers, tris, total):
    from frames._sedan_build import json_extra as je
    out = je(objs, panels, needles, wipers, tris, total)
    out['eye_default'] = game_vec(np.array(IN.EYE))
    # the empty room's plan (game frame: x along, z across = -y): its floor from the tail to the modesty panel, the rear
    # wheels' humps in it, the stairwell, the ceiling (core/modcar/aboard.ts, cargo.ts)
    out['room'] = dict(floor_y=IN.FLOOR_Z, x=[D['xr'] + 0.06, IN.ROOM_FRONT_X], z=[-IN.IN_Y, IN.IN_Y],
                       wells=dict(x=[D['ax_r'] - IN.WELL_R - 0.03, D['ax_r'] + IN.WELL_R + 0.03], z_in=IN.WELL_IN_R, top=D['hub_z'] + IN.WELL_R + 0.03),
                       stair=dict(x=[D['sd_x0'], D['sd_x1']], z=[IN.IN_Y - 0.36, IN.IN_Y]), ceiling=D['roof_z'] + D['roof_crown'] - 0.035)
    return out


# ============================================================================================ previews
def _srgb(h):
    c = [((h >> k) & 255) / 255.0 for k in (16, 8, 0)]
    return tuple(v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4 for v in c) + (1.0,)


def previews(quick):
    PV.materials()
    # the factory colours (palette.ts): Sunflower below the waist, White on the roof
    for name, hx in (('paint', 0xf0c23c), ('paint_b', 0xf7f7f2)):
        m = bpy.data.materials.get(name)
        bs = m.node_tree.nodes.get('Principled BSDF') if m and m.node_tree else None
        if bs is not None:
            bs.inputs['Base Color'].default_value = _srgb(hx)
    PV.scene_setup('anime')
    for m in bpy.data.materials:
        if not m.name.startswith('glass'):
            m.use_backface_culling = True
    res = (1280, 720)
    smp = 24 if quick else 48
    tgt = (-0.3, 0, 1.4)
    for name, yaw, pitch, dist in (('f34', 35, 9, 17.5), ('r34', 145, 12, 17.5), ('side_l', 270, 2, 19.5), ('side_r', 90, 2, 19.5),
                                   ('front', 0, 4, 13.0), ('rear', 180, 6, 13.0)):
        PV.orbit(tgt, yaw, pitch, dist, lens=50)
        PV.render(f'{SCRATCH}_{name}.png', res=res, samples=smp)
    PV.orbit((-0.3, 0, 1.4), 270, 89.5, 16, ortho=10.5)
    PV.render(f'{SCRATCH}_top.png', res=(1400, 720), samples=16)
    eye = Vector(IN.EYE)
    PV.camera(tuple(eye), tuple(eye + Vector((1.0, -0.02, -0.18))), lens=24)
    PV.render(f'{SCRATCH}_driver.png', res=res, samples=smp)

    def swing(name, axis, deg):
        o = bpy.data.objects.get(name)
        if o is None:
            return None
        m = o.matrix_world.copy()
        o.matrix_world = m @ Matrix.Rotation(math.radians(deg), 4, Vector(axis))
        return (o, m)

    def back(saved):
        if saved:
            saved[0].matrix_world = saved[1]
    s = swing('P_hood', (0, 1, 0), -55.0)
    PV.camera((HD['xf'] + 2.4, 1.8, 2.3), (3.6, 0.0, 0.9), lens=35)
    PV.render(f'{SCRATCH}_bay.png', res=res, samples=smp)
    back(s)
    s = swing('P_door_side', (0, 0, 1), 95.0)
    PV.camera((1.5, -4.4, 1.9), (2.1, 0.0, 1.3), lens=32)
    PV.render(f'{SCRATCH}_open_door_side.png', res=res, samples=smp)
    back(s)
    s = swing('P_trunk', (0, 0, 1), -100.0)
    PV.camera((D['xr'] - 4.0, 1.2, 1.9), (D['xr'] + 1.0, 0.0, 1.4), lens=35)
    PV.render(f'{SCRATCH}_open_trunk.png', res=res, samples=smp)
    back(s)
    PV.camera((1.6, -0.10, 2.10), (-4.0, 0.0, 1.35), lens=20)
    PV.render(f'{SCRATCH}_inside_back.png', res=res, samples=smp)
    PV.camera((-4.4, 0.10, 2.05), (2.0, 0.0, 1.45), lens=20)
    PV.render(f'{SCRATCH}_inside_fwd.png', res=res, samples=smp)
    PV.camera((1.2, -0.6, 2.0), (2.6, 0.7, 1.3), lens=24)
    PV.render(f'{SCRATCH}_inside_cab.png', res=res, samples=smp)
    g = bpy.data.objects.get('preview_ground')
    if g:
        g.hide_render = True
    PV.camera((3.6, -5.0, -2.6), (0.0, 0.0, 0.45), lens=32)
    PV.render(f'{SCRATCH}_under.png', res=res, samples=smp)
    if g:
        g.hide_render = False
