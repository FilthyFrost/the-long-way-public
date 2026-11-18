"""Snail assembly: objects, origins, mounts, JSON, AO, export and previews. Called from frames/snail.py main().
--dry writes the GLB and the mount table into the scratch directory instead of the game's (for trying things)."""
import math
import os
import sys
import time

sys.dont_write_bytecode = True

import bpy  # noqa: E402
import numpy as np  # noqa: E402
from mathutils import Matrix, Vector  # noqa: E402

from frames import _kit as K  # noqa: E402
from frames import _preview as PV  # noqa: E402
from frames import _snail_ext as EX  # noqa: E402
from frames import _snail_inner as IN  # noqa: E402
from frames import snail as S  # noqa: E402
from frames._sedan_build import game_vec, knuckles, mount, needle, obj_with_origin, plate_buf  # noqa: E402
from frames._sedan_ext import side_dir  # noqa: E402
from lib import modcar as mc  # noqa: E402

D = S.D
OUT_GLB = 'public/models/modcar/frames/snail.glb'
OUT_JSON = 'src/core/modcar/data/mounts/snail.json'
SCRATCH = 'D:/modcar-scratch/frames/snail/snail'
# the factory colours (palette.ts): Sky blue cab, Ivory box and band
PAINT = (0x7fb3d5, 0xf4efe2)


def both(left, centre=None):
    b = K.Buf()
    b.extend(left)
    b.extend(left.mirrored())
    if centre is not None:
        b.extend(centre)
    return b


def canon(buf):
    """The same triangles in an order fixed by where they lie: bmesh's bevels (the kit's boxes and prisms) give
    their faces in an order that changes from run to run, and with it the exported index buffers. Sorted by
    material and corner positions (with normals), each triangle started at its lowest corner (winding kept)."""
    V, N, T, M = buf.arrays()
    if not len(T):
        return buf
    UV = buf.uv_array() if buf.has_uv() else None
    full = np.concatenate([np.round(V / 1e-6).astype(np.int64), np.round(N * 200).astype(np.int64)], 1)
    vo = np.lexsort(np.concatenate([full, V, N], 1).T[::-1])
    inv = np.empty_like(vo)
    inv[vo] = np.arange(len(vo))
    V, N, full, T = V[vo], N[vo], full[vo], inv[T]
    if UV is not None:
        UV = UV[vo]
    _, rank = np.unique(full, axis=0, return_inverse=True)
    rank = rank.reshape(-1)
    R = rank[T]
    k = (np.argmin(R, axis=1)[:, None] + np.arange(3)[None, :]) % 3
    T = np.take_along_axis(T, k, 1)
    R = np.take_along_axis(R, k, 1)
    names = {m: i for i, m in enumerate(sorted(set(M)))}
    mi = np.array([names[m] for m in M])
    order = np.lexsort((R[:, 2], R[:, 1], R[:, 0], mi))
    out = K.Buf()
    out.V, out.N, out.T = [V], [N], [T[order]]
    out.M = [M[i] for i in order]
    out.UV = [UV]
    out.n = len(V)
    return out


def owo(buf, name, origin, parent=None, rot=None):
    return obj_with_origin(canon(buf), name, origin, parent=parent, rot=rot)


def rot_z(deg):
    a = math.radians(deg)
    return ((math.cos(a), -math.sin(a), 0.0), (math.sin(a), math.cos(a), 0.0), (0.0, 0.0, 1.0))


def rot_x(deg):
    a = math.radians(deg)
    return ((1.0, 0.0, 0.0), (0.0, math.cos(a), -math.sin(a)), (0.0, math.sin(a), math.cos(a)))


def build(args):
    t0 = time.time()
    quick = '--quick' in args
    no_preview = '--no-preview' in args
    dry = '--dry' in args
    out_glb, out_json = (SCRATCH + '_dry.glb', SCRATCH + '_dry.json') if dry else (OUT_GLB, OUT_JSON)
    os.makedirs(os.path.dirname(SCRATCH), exist_ok=True)
    mc.reset_scene()
    ex = EX.Exterior()
    box = ex.box
    print('[snail] exterior surfaces', round(time.time() - t0, 1), 's')
    # ---------------------------------------------------------------- BODY
    eb, pedges = ex.edges()
    left = K.Buf()
    left.extend(ex.body()).extend(ex.roof()).extend(eb)
    left.extend(ex.opening_details()).extend(ex.nose_details()).extend(ex.ws_trims()).extend(ex.drip_rail())
    left.extend(ex.window_seals(['rear', 'quarter'])).extend(ex.body_beads())
    left.extend(IN.engine_bay()).extend(IN.steps()).extend(IN.grab_handle())
    left.extend(box.shell())
    body = both(left)
    body.extend(ex.emblem())
    # the left rear door stays shut, bolted top and bottom (the right one, which closes over it, is the trunk)
    body.extend(box.leaf(main=False))
    body.extend(IN.filler_housing())
    body.extend(centre_trims())
    objs = [canon(EX.band_tone(body)).to_object('BODY')]
    print('[snail] body', round(time.time() - t0, 1), 's')
    panels = {}
    gl = ex.glass()
    # ---------------------------------------------------------------- cab doors (hinged at the front edge)
    door = ex.door_skin()
    door.extend(pedges['door']).extend(ex.door_beads()).extend(ex.door_card(level=-0.04)).extend(IN.door_extras(ex))
    door.extend(ex.window_seals(['door']))
    EX.band_tone(door)
    zh = 1.42
    yh = float(S.side_w(D['cd_x1'], zh)) - 0.004
    for side, sname in ((1, 'L'), (-1, 'R')):
        mid = 'door_F' + sname
        hinge = np.array([D['cd_x1'] - 0.004, side * yh, zh])
        buf = door if side > 0 else door.mirrored()
        o = owo(buf, 'P_' + mid, hinge)
        gb = gl['door'] if side > 0 else gl['door'].mirrored()
        og = owo(gb, 'PG_' + mid, hinge, parent=o)
        objs += [o, og]
        panels['P_' + mid] = dict(mount=mid, glass='PG_' + mid, hinge='z', hinge_pos=hinge, axis=(0, 0, 1), open_deg=-70.0 * side)
    # ---------------------------------------------------------------- the engine's lid (hood): on the doghouse, hinged at its back
    lh = IN.lid_hinge()
    objs.append(owo(IN.lid(), 'P_hood', lh))
    panels['P_hood'] = dict(mount='hood', hinge='y', hinge_pos=lh, axis=(0, 1, 0), open_deg=-80.0)
    # ---------------------------------------------------------------- the right rear door (trunk): it swings 270 deg round onto the side
    tg = box.leaf(main=True).mirrored()
    th = np.array([EX.HINGE_P[0], -EX.HINGE_P[1], 1.75])
    objs.append(owo(tg, 'P_trunk', th))
    panels['P_trunk'] = dict(mount='trunk', hinge='z', hinge_pos=th, axis=(0, 0, 1), open_deg=270.0)
    # ---------------------------------------------------------------- fuel flap (left, on the filler's housing, hinged on its front edge)
    fhinge = np.array([IN.FILLER['x'] + IN.FILLER['r'] - 0.002, IN.FILL_Y + 0.002, IN.FILLER['z']])
    objs.append(owo(IN.filler_flap(), 'FUEL_CAP', fhinge))
    panels['FUEL_CAP'] = dict(mount=None, hinge='z', hinge_pos=fhinge, axis=(0, 0, 1), open_deg=-85.0)
    # ---------------------------------------------------------------- GLASS, UNDER, INTERIOR
    g = K.Buf()
    for k in ('ws', 'quarter', 'rear'):
        g.extend(gl[k]).extend(gl[k].mirrored())
    objs.append(canon(g).to_object('GLASS'))
    objs.append(canon(both(IN.underbody(), IN.centre_under())).to_object('UNDER'))
    it = IN.interior(ex)
    inner = K.Buf().extend(it['L']).extend(it['L'].mirrored()).extend(it['C'])
    inner.extend(both(ex.lining())).extend(both(ex.roof(level=EX.WALL)))
    # the dial glass stays out of the AO bake (it would bake the gauge faces and the needles behind it black);
    # it is joined into INTERIOR after the bake
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
    for wname, wy, wl in (('WIPER_L', 0.70, 0.62), ('WIPER_R', -0.02, 0.62)):
        wb, info = wiper(wy, wl)
        objs.append(owo(wb, wname, info['pivot'], rot=info['rot']))
        wipers[wname] = info
    print('[snail] objects', round(time.time() - t0, 1), 's')
    empties = mounts(ex, panels)
    objs += knuckles(empties, lambda x, y, z, front: canon(IN.knuckle(x, y, z, front)))
    meshes = [o for o in objs if o.type == 'MESH']
    tris = {o.name: mc.triangles([o]) for o in meshes}
    total = sum(tris.values())
    print('[snail] triangles', total, {k: v for k, v in sorted(tris.items(), key=lambda kv: -kv[1])[:10]})
    if not quick:
        # the engine bay and the doghouse are baked with the lid up (one looks into it with the lid open), the
        # lid itself both ways
        hood = next(o for o in meshes if o.name == 'P_hood')
        bake_ao_lid(meshes, hood, panels['P_hood']['axis'], panels['P_hood']['open_deg'],
                    ((IN.DOG['x0'] - 0.02, -0.45, 0.25), (IN.DOG['x1'] + 0.06, 0.45, 1.12)))
        print('[snail] AO', round(time.time() - t0, 1), 's')
        # the dial faces once more without the needles over them
        K.rebake_mats(o_int, [o for o in meshes if o.name.startswith('N_')], ('gauge',), samples=32, distance=0.35)
    K.join_white(o_int, dial_glass)
    tris = {o.name: mc.triangles([o]) for o in meshes}
    total = sum(tris.values())
    print('[snail] grime masks', K.mask_frame(meshes))
    mc.export_glb(out_glb, meshes + empties)
    mc.mounts_json(out_json, 'snail', json_extra(objs, panels, needles, wipers, tris, total))
    print('[snail] exported', out_glb, round(time.time() - t0, 1), 's')
    if not no_preview:
        previews(quick)
    print('[snail] done', round(time.time() - t0, 1), 's')


def centre_trims():
    """Centred details: the number plate on the box's rear sill with its lamp."""
    b = K.Buf()
    zc = 0.848
    b.extend(plate_buf((EX.X_R - 0.001, 0.0, zc), (-1.0, 0.0, 0.0), (0.0, 0.0, 1.0), 0.30, 0.135, '2C 715'))
    b.extend(K.box_buf((EX.X_R - 0.030, 0.19, zc - 0.03), (EX.X_R + 0.002, 0.25, zc + 0.03), 'trim', 0.006, 2))
    b.extend(K.box_buf((EX.X_R - 0.034, 0.195, zc - 0.022), (EX.X_R - 0.028, 0.245, zc + 0.022), 'lens_head', 0.002, 1))
    return b


def bake_ao_lid(meshes, lid, axis, open_deg, region, samples=32, distance=0.35):
    """K.bake_ao_open over the doghouse and the bay round it (the body, the underbody and the cab's inside baked
    again with the lid up inside `region`), and the lid baked up as well: its corners that face down when shut (the
    insulation under it, the skirt's inside) keep the lighter of their two passes, the rest the shut one."""
    K.bake_ao_open(meshes, [(lid, axis, open_deg)], region, targets=('BODY', 'UNDER', 'INTERIOR'), samples=samples, distance=distance)
    a = lid.data.color_attributes.get('Col')
    shut = np.zeros(len(a.data) * 4)
    a.data.foreach_get('color', shut)
    keep = lid.matrix_world.copy()
    lid.matrix_world = keep @ Matrix.Rotation(math.radians(open_deg), 4, Vector(axis))
    bpy.context.view_layer.update()
    mc.bake_ao([lid], samples=samples, distance=distance)
    lid.matrix_world = keep
    bpy.context.view_layer.update()
    me = lid.data
    a = me.color_attributes.get('Col')
    up = np.zeros(len(a.data) * 4)
    a.data.foreach_get('color', up)
    W = np.array(lid.matrix_world)
    n = np.zeros(len(me.loops) * 3)
    me.corner_normals.foreach_get('vector', n)
    n = n.reshape(-1, 3) @ W[:3, :3].T
    seen_shut = K.sstep(-0.25, 0.25, n[:, 2])[:, None]
    shut = shut.reshape(-1, 4)
    up = up.reshape(-1, 4)
    a.data.foreach_set('color', (shut * seen_shut + np.maximum(shut, up) * (1.0 - seen_shut)).ravel())


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
    # the arm rises from the pivot onto the glass a few centimetres up (local -y is up the glass)
    b.extend(K.tube_buf(np.array([(0.0, 0.0, 0.022), (0.05, -0.035, 0.03), (length, -0.05, 0.03)]), 0.0045, 'trim', 6))
    b.extend(K.box_buf((0.06, -0.058, 0.012), (length + 0.02, -0.042, 0.02), 'trim', 0.003, 1))
    b.extend(K.box_buf((0.05, -0.054, 0.0), (length + 0.03, -0.046, 0.012), 'rubber', 0.002, 1))
    Vw, Nw, Tw, Mw = b.arrays()
    out = K.Buf()
    out.add(Vw @ R.T + p, Nw @ R.T, Tw, 'trim')
    out.M = list(Mw)
    return out, dict(pivot=p, rot=R, normal=nrm, rest=rest, sweep_deg=-92.0, axis_local='y')


# ============================================================================================ mounts
def mounts(ex, panels):
    E = []
    hz = D['hub_z']
    for name, x, y, front, side in (('hub_FL', D['ax_f'], D['track_f'] / 2, True, -1), ('hub_FR', D['ax_f'], -D['track_f'] / 2, True, 1),
                                    ('hub_RL', D['ax_r'], D['track_r'] / 2, False, -1), ('hub_RR', D['ax_r'], -D['track_r'] / 2, False, 1)):
        E.append(mount(name, (x, y, hz), dict(cat='rim', axle='front' if front else 'rear', steer=front, driven=not front,
                                               handbrake=not front, side=side, hub_face=round(abs(y) + 0.012, 4), wheel_r=D['wheel_r'])))
    E.append(mount('engine', IN.ENGINE, dict(cat='engine', space_min=list(IN.ENGINE_ROOM[0]), space_max=list(IN.ENGINE_ROOM[1]),
                                             note='between the seats under the doghouse (its lid is the hood, lying over it), its flywheel at '
                                                  "the cab's back wall; the front axle's beam passes under its front half")))
    E.append(mount('gearbox', IN.GEARBOX, dict(cat='gearbox', space_min=list(IN.GEARBOX_ROOM[0]), space_max=list(IN.GEARBOX_ROOM[1]),
                                               note="behind the cab under the box's front, its bell on the engine's flywheel")))
    E.append(mount('radiator', IN.RADIATOR, dict(cat='radiator', space_min=[-0.07, -0.36, 0.0], space_max=[0.045, 0.36, 0.42],
                                                 note='behind the grille, under the cab floor')))
    E.append(mount('battery', IN.BATTERY, dict(cat='battery', space_min=[-0.15, -0.10, 0.0], space_max=[0.15, 0.10, 0.25],
                                               note='on its tray off the right frame rail, behind the cab')))
    E.append(mount('fuelTank', IN.TANK, dict(cat='fuelTank', space_min=[-0.26, -0.41, 0.0], space_max=[0.26, 0.41, 0.17],
                                             note='hung between the rails behind the rear axle, yawed 180 deg: the filler neck of the tank '
                                                  'part (+z) points to the filler on the left'), rot=rot_z(180.0)))
    E.append(mount('exhaust', (0.80, -0.28, 0.46), dict(cat='exhaust', tail=[-1.67, -0.10, -0.12],
                                                         route="down behind the cab, along under the box right of the propshaft, out "
                                                               'ahead of the right rear wheel')))
    p, d = IN.steering_mount()
    ang = math.radians(IN.COLUMN_DEG)
    E.append(mount('steering', tuple(p), dict(cat='steering', column_deg=IN.COLUMN_DEG), rot=K.frame_from(d, (math.sin(ang), 0, math.cos(ang)))))
    for name, y, drv, side in (('seat_driver', IN.DRIVER_Y, True, -1), ('seat_pass', -IN.DRIVER_Y, False, 1)):
        E.append(mount(name, (IN.SEAT_X, y, IN.SEAT_Z), dict(cat='seat', driver=drv, floor_z=round(IN.SEAT_Z, 4), side=side,
                                                             note='on its pedestal over the front wheel, beside the doghouse')))
    for pname, info in panels.items():
        if info['mount'] is None:
            continue
        m = info['mount']
        cat = 'door' if m.startswith('door') else m
        side = (-1 if m.endswith('L') else 1) if m.startswith('door_F') else 0
        extra = dict(cat=cat, panel=pname, hinge=info['hinge'], open_deg=info['open_deg'], side=side)
        if m == 'hood':
            extra['note'] = "the engine's lid on the doghouse between the seats, hinged at its back"
        if m == 'trunk':
            extra['note'] = "the box's right rear door, hinged on the right corner post; it swings round onto the side (the left one stays shut)"
        E.append(mount(m, tuple(info['hinge_pos']), extra))
    zf = 0.48
    E.append(mount('bumperFront', (D['xf'] + 0.004, 0.0, zf), dict(cat='bumperFront', fit=[0.14, 1.84, 0.18],
                                                                    on="the frame rails' front ends, under the nose")))
    E.append(mount('bumperRear', (EX.X_R - 0.005, 0.0, 0.62), dict(cat='bumperRear', fit=[0.18, 1.80, 0.14],
                                                                    on="the rear crossmember under the box's sill: a step under the doors")))
    c3, n3 = ex.lamp_mount
    tp, tn = ex.box.tail_mount
    mp = ex.mirror_point()
    for side, sname in ((1, 'L'), (-1, 'R')):
        E.append(mount('headlight_' + sname, (c3[0], side * c3[1], c3[2]), dict(cat='headlight', side=-side, recess='round', recess_d=D['lamp_d'],
                                                                                 recess_depth=0.075)))
        E.append(mount('taillight_' + sname, (tp[0], side * tp[1], tp[2]),
                       dict(cat='taillight', side=-side, recess='rect', recess_w=round(EX.TAIL[1] - EX.TAIL[0], 3), recess_h=round(EX.TAIL[3] - EX.TAIL[2], 3),
                            recess_depth=0.045, on="the box's rear sill, outboard under the doors")))
        E.append(mount('mirror_' + sname, (mp[0], side * mp[1], mp[2]), dict(cat='mirror', side=-side, on='cab side under the quarter window, ahead of the door')))
        E.append(mount('armor_' + sname, (-0.87, side * (EX.BW + 0.004), 1.45), dict(cat='armor', side=-side, fit=[2.60, 0.05, 0.90], fit_anchor='center',
                                                                                     note="on the box's side between its ribs' tops, over the rear wheel")))
    E.append(mount('roof', (1.55, 0.0, D['roof_z'] + D['roof_crown']), dict(cat='roof', fit=[1.20, 1.55, 0.15], fit_anchor='center',
                                                                              on="the cab's roof, ahead of the box")))
    E.append(mount('horn', (2.42, -0.30, 0.56), dict(cat='horn', on='behind the grille')))
    E.append(mount('radio', (IN.DASH_FACE_X - 0.012, 0.0, 1.152), dict(cat='radio', slot=[0.18, 0.046], slot_depth=0.06)))
    E.append(mount('handbrake', (1.90, 0.32, IN.FLOOR_Z), dict(cat='handbrake', note='a floor lever ahead of the doghouse, right of the driver')))
    E.append(mount('gearLever', (IN.GEAR_X, IN.GEAR_Y, IN.FLOOR_Z + 0.014), dict(cat='gearLever', note='a long lever from the floor ahead of the doghouse')))
    p_, d_ = IN.steering_mount()
    pi_ = p_ + d_ * 0.12 + np.array([0.0, -0.045, 0.0])
    E.append(mount('ignition', tuple(pi_), dict(cat='ignition', on='steering column shroud, right side')))
    return E


def json_extra(objs, panels, needles, wipers, tris, total):
    from frames._sedan_build import json_extra as je
    out = je(objs, panels, needles, wipers, tris, total)
    out['eye_default'] = game_vec(np.array(IN.EYE))
    return out


# ============================================================================================ previews
def _srgb(h):
    c = [((h >> k) & 255) / 255.0 for k in (16, 8, 0)]
    return tuple(v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4 for v in c) + (1.0,)


def previews(quick):
    PV.materials()
    for name, hx in zip(('paint', 'paint_b'), PAINT):
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
    tgt = (0.0, 0, 1.35)
    for name, yaw, pitch, dist in (('f34', 35, 9, 12.0), ('r34', 145, 11, 12.0), ('side_l', 270, 2, 13.0), ('side_r', 90, 2, 13.0),
                                   ('front', 0, 4, 10.5), ('rear', 180, 6, 10.5)):
        PV.orbit(tgt, yaw, pitch, dist, lens=50)
        PV.render(f'{SCRATCH}_{name}.png', res=res, samples=smp)
    PV.orbit((0.0, 0, 1.0), 270, 89.5, 12, ortho=6.0)
    PV.render(f'{SCRATCH}_top.png', res=(1400, 720), samples=16)
    eye = Vector(IN.EYE)
    PV.camera(tuple(eye), tuple(eye + Vector((1.0, -0.03, -0.34))), lens=24)
    PV.render(f'{SCRATCH}_driver.png', res=res, samples=smp)

    def hide(names, h=True):
        for n in names:
            o = bpy.data.objects.get(n)
            if o:
                o.hide_render = h
                for c in o.children:
                    c.hide_render = h

    def swing(name, axis, deg):
        o = bpy.data.objects.get(name)
        if o is None:
            return None
        mw = o.matrix_world.copy()
        o.matrix_world = mw @ Matrix.Rotation(math.radians(deg), 4, Vector(axis))
        return (o, mw)

    def back(saved):
        if saved:
            saved[0].matrix_world = saved[1]
    # the doghouse with its lid up: from under the cab roof looking down between the seats, and through the open
    # left door
    s = swing('P_hood', (0, 1, 0), -80.0)
    PV.camera((1.95, 0.05, 2.20), (1.15, 0.0, 0.90), lens=26)
    PV.render(f'{SCRATCH}_bay.png', res=res, samples=smp)
    s2 = swing('P_door_FL', (0, 0, 1), -70.0)
    PV.camera((1.35, 1.75, 2.15), (1.25, 0.0, 0.95), lens=28)
    PV.render(f'{SCRATCH}_bay_door.png', res=res, samples=smp)
    back(s2)
    back(s)
    s = swing('P_door_FL', (0, 0, 1), -70.0)
    PV.camera((1.6, 3.4, 1.75), (1.5, 0.4, 1.35), lens=32)
    PV.render(f'{SCRATCH}_open_door_FL.png', res=res, samples=smp)
    back(s)
    # the box's right rear door swung round onto the side, looking in
    s = swing('P_trunk', (0, 0, 1), 270.0)
    PV.camera((-5.6, -2.4, 2.0), (-2.2, 0.0, 1.55), lens=32)
    PV.render(f'{SCRATCH}_open_trunk.png', res=res, samples=smp)
    PV.camera((-2.9, -0.35, 1.75), (0.6, 0.15, 1.45), lens=22)
    PV.render(f'{SCRATCH}_inside_box.png', res=res, samples=smp)
    back(s)
    hide(['P_door_FL', 'P_door_FR', 'P_hood', 'P_trunk'])
    PV.orbit(tgt, 35, 14, 12.0, lens=50)
    PV.render(f'{SCRATCH}_stripped.png', res=res, samples=smp)
    hide(['P_door_FL', 'P_door_FR', 'P_hood', 'P_trunk'], False)
    g = bpy.data.objects.get('preview_ground')
    if g:
        g.hide_render = True
    PV.camera((3.4, -4.4, -2.4), (0.0, 0.0, 0.40), lens=30)
    PV.render(f'{SCRATCH}_under.png', res=res, samples=smp)
    if g:
        g.hide_render = False
