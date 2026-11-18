"""Fox assembly: builds every object of the frame GLB with its name, origin and material, the mount empties, the
mount JSON, the AO bake, the export and the preview renders. Called from frames/fox.py main().

The pop-up lamp pods are objects of their own, POPUP_L and POPUP_R, shut as built, their origins on their hinges
(across the car at each lid's rear edge, on the surface): a turn of open_deg about Blender +Y (game -z) stands
them up. The headlight mounts are in the shut pods (the lamp part's back on the pod's seat, looking down into the
well) and say on = 'POPUP_<side>': a lamp rides with its pod as the motorcycle's parts ride on its FORK. The JSON's
'popups' table and the objects' glTF extras (move = 'hinge', axis = 'z', open = degrees about game +z, the
places' convention) say how far they turn."""
import json
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
from frames import _fox_ext as EX  # noqa: E402
from frames import _fox_inner as IN  # noqa: E402
from frames import fox as S  # noqa: E402
from frames._sedan_build import game_vec, knuckles, mount, needle, obj_with_origin, plate_buf  # noqa: E402
from lib import modcar as mc  # noqa: E402

D = S.D
OUT_GLB = 'public/models/modcar/frames/fox.glb'
OUT_JSON = 'src/core/modcar/data/mounts/fox.json'
SCRATCH_DIR = 'D:/modcar-scratch/frames/fox'
SCRATCH = SCRATCH_DIR + '/fox'
DROP = D.get('body_drop', 0.0)


def both(left, centre=None):
    """Left half + mirror (+ centre parts)."""
    b = K.Buf()
    b.extend(left)
    b.extend(left.mirrored())
    if centre is not None:
        b.extend(centre)
    return b


# ============================================================================================ build
def build(args):
    t0 = time.time()
    quick = '--quick' in args
    no_preview = '--no-preview' in args
    mc.reset_scene()
    ex = EX.Exterior()
    print('[fox] exterior surfaces', round(time.time() - t0, 1), 's')

    # ---------------------------------------------------------------- BODY
    lb_left = ex.lower_body(False)
    lb_right = ex.lower_body(True)
    common = K.Buf()
    common.extend(ex.top_front())
    common.extend(ex.top_rear())
    common.extend(ex.greenhouse())
    common.extend(ex.roof())
    door = ex.door_skin().extend(ex.door_frame())
    eb, pedges = ex.edges()
    common.extend(eb)
    common.extend(ex.opening_details())
    pod = IN.Pod(ex)
    pbox = pod.box()
    common.extend(IN.pod_well(ex, pod))
    common.extend(IN.engine_bay())
    common.extend(IN.boot_interior())
    common.extend(IN.apertures())
    common.extend(trims(ex))
    common.extend(ex.greenhouse(-0.03))
    common.extend(aperture_seals(ex))
    left = K.Buf().extend(common).extend(lb_left)
    right = K.Buf().extend(common).extend(lb_right).extend(ex.fuel_details())
    body = K.Buf().extend(left).extend(right.mirrored())
    body.extend(centre_trims(ex))
    body.extend(IN.engine_bay_asym())
    body.extend(IN.boot_floor())
    o_body = body.to_object('BODY')
    print('[fox] body', round(time.time() - t0, 1), 's')

    objs = [o_body]
    panels = {}
    # ---------------------------------------------------------------- doors
    gl = ex.glass()
    door.extend(pedges['door'])
    door.extend(IN.door_card(ex))
    door.extend(IN.door_extras(ex))
    door.extend(IN.door_frame_inner(ex))
    for side, sname in ((1, 'L'), (-1, 'R')):
        mid = 'door_F' + sname
        hinge = np.array([D['fd_front'], side * 0.795, 0.50])
        buf = door if side > 0 else door.mirrored()
        o = obj_with_origin(buf, 'P_' + mid, hinge)
        gb = gl['door'] if side > 0 else gl['door'].mirrored()
        og = obj_with_origin(gb, 'PG_' + mid, hinge, parent=o)
        objs += [o, og]
        panels['P_' + mid] = dict(mount=mid, glass='PG_' + mid, hinge='z', hinge_pos=hinge, axis=(0, 0, 1), open_deg=-68.0 * side)
    # ---------------------------------------------------------------- bonnet and boot lid (front-hinged at its back
    # like the saloon's bonnet; the boot lid hinged at its front edge under the rear window's foot)
    hb = ex.lid('hood')
    hb.extend(pedges['hood'])
    hb.extend(IN.lid_inner(ex, 'hood'))
    hinge = np.array([D['hood_rear'] - 0.008, 0.0, IN.bonnet_z(D['hood_rear'], 0.0) - 0.022])
    objs.append(obj_with_origin(both(hb), 'P_hood', hinge))
    panels['P_hood'] = dict(mount='hood', hinge='y', hinge_pos=hinge, axis=(0, 1, 0), open_deg=-55.0)
    tb = ex.lid('trunk')
    tb.extend(pedges['trunk'])
    tb.extend(IN.lid_inner(ex, 'trunk'))
    tb.extend(IN.lip_spoiler(ex))
    thinge = np.array([D['trunk_front'] + 0.01, 0.0, IN.bonnet_z(D['trunk_front'], 0.0) - 0.02])
    objs.append(obj_with_origin(both(tb), 'P_trunk', thinge))
    panels['P_trunk'] = dict(mount='trunk', hinge='y', hinge_pos=thinge, axis=(0, 1, 0), open_deg=70.0)
    # ---------------------------------------------------------------- the pop-up lamp pods
    popups = {}
    pl = ex.pod_lid()
    pl.extend(pedges['pod'])
    pl.extend(pbox)
    for side, sname in ((1, 'L'), (-1, 'R')):
        name = 'POPUP_' + sname
        h = pod.H * np.array([1.0, 0.0, 1.0]) + np.array([0.0, side * pod.yc, 0.0])
        o = obj_with_origin(pl if side > 0 else pl.mirrored(), name, h)
        # (the places' convention: a hinge about game +z = Blender -Y, a positive angle lifts the front edge)
        o['move'] = 'hinge'
        o['axis'] = 'z'
        o['open'] = float(pod.open_deg)
        objs.append(o)
        popups[name] = dict(mount='headlight_' + sname, pivot=h, axis=(0, 1, 0), open_deg=-float(pod.open_deg))
    # ---------------------------------------------------------------- fuel flap (right rear quarter)
    ff = ex.fuel_flap().mirrored()
    fhinge = np.array([D['fuel_x'] + D['fuel_r'] - 0.002, -(float(ex.cut['fuel'].P[:, 1].mean()) + 0.002), D['fuel_z']])
    o = obj_with_origin(ff, 'FUEL_CAP', fhinge)
    objs.append(o)
    panels['FUEL_CAP'] = dict(mount=None, hinge='z', hinge_pos=fhinge, axis=(0, 0, 1), open_deg=85.0)
    # ---------------------------------------------------------------- GLASS
    g = K.Buf()
    for kind in ('ws', 'rw', 'quarter'):
        g.extend(gl[kind])
        g.extend(gl[kind].mirrored())
    objs.append(g.to_object('GLASS'))
    # ---------------------------------------------------------------- UNDER
    under = both(IN.underbody(), IN.centre_under())
    objs.append(under.to_object('UNDER'))
    # ---------------------------------------------------------------- INTERIOR, needles
    it = IN.interior(ex)
    # the dial glass stays out of the AO bake (it would bake the gauge faces and the needles behind it black);
    # it is joined into INTERIOR after the bake
    ib, dial_glass = K.split_mat(both(it['L'], it['C']), ('glass',))
    o_int = ib.to_object('INTERIOR')
    objs.append(o_int)
    needles = {}
    for gdesc in it['gauges']:
        nb, info = needle(gdesc)
        rot = K.frame_from(info['rest'], gdesc['normal'])
        o = obj_with_origin(nb, gdesc['name'], gdesc['center'], rot=rot)
        objs.append(o)
        needles[gdesc['name']] = info
    # ---------------------------------------------------------------- wipers
    wipers = {}
    for wname, wy, wl in (('WIPER_L', 0.44, 0.40), ('WIPER_R', -0.04, 0.40)):
        wb, info = wiper(wy, wl)
        o = obj_with_origin(wb, wname, info['pivot'], rot=info['rot'])
        objs.append(o)
        wipers[wname] = info
    print('[fox] objects', round(time.time() - t0, 1), 's')

    # ---------------------------------------------------------------- mounts
    empties = mounts(ex, panels, pod)
    objs += knuckles(empties, IN.knuckle)
    # the frame is modelled with its hubs body_drop above the wheel radius and moved down by it: it sits
    # that much lower over its wheels, the hubs stay at the wheel radius above the ground
    K.drop_all(objs, empties, panels, (needles, wipers, popups), -DROP)
    # ---------------------------------------------------------------- AO, export, JSON
    meshes = [o for o in objs if o.type == 'MESH']
    tris = {o.name: mc.triangles([o]) for o in meshes}
    total = sum(tris.values())
    print('[fox] triangles', total, {k: v for k, v in sorted(tris.items(), key=lambda kv: -kv[1])[:8]})
    if not quick:
        # the bay is baked with the bonnet up (the tutorial looks into it with the bonnet open), and the bonnet with it
        hood = next(o for o in meshes if o.name == 'P_hood')
        bake_ao_bay(meshes, hood, panels['P_hood']['axis'], panels['P_hood']['open_deg'],
                    ((IN.FIREWALL_X - 0.01, -0.76, -0.05), (IN.RAD_X + 0.10, 0.76, 0.86 - DROP)), samples=32, distance=0.35)
        print('[fox] AO', round(time.time() - t0, 1), 's')
        # the pods once more standing up: shut, their black boxes are down in the wells; up, they are seen
        bake_pods_open([o for o in meshes if o.name.startswith('POPUP_')], popups)
        # the dial faces once more without the needles over them
        K.rebake_mats(o_int, [o for o in meshes if o.name.startswith('N_')], ('gauge',), samples=32, distance=0.35)
    K.join_white(o_int, dial_glass)
    tris = {o.name: mc.triangles([o]) for o in meshes}
    total = sum(tris.values())
    print('[fox] grime masks', K.mask_frame(meshes))
    mc.export_glb(OUT_GLB, meshes + empties)
    extra = json_extra(objs, panels, needles, wipers, popups, tris, total)
    mc.mounts_json(OUT_JSON, 'fox', extra)
    print('[fox] exported', round(time.time() - t0, 1), 's')
    if not no_preview:
        previews(quick, panels, popups)
    print('[fox] done', round(time.time() - t0, 1), 's')


def bake_ao_bay(meshes, hood, axis, open_deg, region, samples=32, distance=0.35):
    """K.bake_ao_open (the bay baked with the bonnet up), and the bonnet baked up as well, as the saloon's: what of
    it is seen only with it up (whatever faces down or in towards its middle: the underside, the inner frame, the
    insides of the hems) keeps the lighter of its two passes, what is seen shut keeps the shut pass. Baked shut
    only, its underside took the shapes of the bay under it in dark blotches. The hidden vertices of the sheet
    under the frame ring and the pressed X take the shading of their seen neighbours."""
    K.bake_ao_open(meshes, [(hood, axis, open_deg)], region, samples=samples, distance=distance)
    a = hood.data.color_attributes.get('Col')
    shut = np.zeros(len(a.data) * 4)
    a.data.foreach_get('color', shut)
    keep = hood.matrix_world.copy()
    hood.matrix_world = keep @ Matrix.Rotation(math.radians(open_deg), 4, Vector(axis))
    bpy.context.view_layer.update()
    mc.bake_ao([hood], samples=samples, distance=distance)
    hood.matrix_world = keep
    bpy.context.view_layer.update()
    me = hood.data
    a = me.color_attributes.get('Col')
    up = np.zeros(len(a.data) * 4)
    a.data.foreach_get('color', up)
    W = np.array(hood.matrix_world)
    n = np.zeros(len(me.loops) * 3)
    me.corner_normals.foreach_get('vector', n)
    n = n.reshape(-1, 3) @ W[:3, :3].T
    vi = np.zeros(len(me.loops), np.int64)
    me.loops.foreach_get('vertex_index', vi)
    co = np.zeros(len(me.vertices) * 3)
    me.vertices.foreach_get('co', co)
    P = co.reshape(-1, 3) @ W[:3, :3].T + W[:3, 3]
    d = P[vi, :2] - P[:, :2].mean(0)
    d = d / np.maximum(np.linalg.norm(d, axis=1), 0.05)[:, None]
    seen_shut = K.sstep(-0.25, 0.25, n[:, 2] + (n[:, :2] * d).sum(1))[:, None]
    shut = shut.reshape(-1, 4)
    up = up.reshape(-1, 4)
    out = shut * seen_shut + np.maximum(shut, up) * (1.0 - seen_shut)
    down = n[:, 2] < -0.5
    nv = len(me.vertices)
    cnt = np.bincount(vi[down], minlength=nv)
    val = np.bincount(vi[down], weights=out[down, 0], minlength=nv) / np.maximum(cnt, 1)
    hidden = (cnt > 0) & (val < 0.15)
    ed = np.zeros(len(me.edges) * 2, np.int64)
    me.edges.foreach_get('vertices', ed)
    ed = ed.reshape(-1, 2)
    ea = np.concatenate([ed[:, 0], ed[:, 1]])
    eb = np.concatenate([ed[:, 1], ed[:, 0]])
    known = (cnt > 0) & ~hidden
    for _ in range(60):
        m = known[eb]
        s = np.bincount(ea[m], weights=val[eb[m]], minlength=nv)
        k = np.bincount(ea[m], minlength=nv)
        new = hidden & ~known & (k > 0)
        if not new.any():
            break
        val[new] = s[new] / k[new]
        known |= new
    fill = down & hidden[vi] & known[vi]
    out[fill, :3] = val[vi[fill], None]
    a.data.foreach_set('color', out.ravel())


def bake_pods_open(pods, popups, samples=32, distance=0.35):
    """AO of the pods as they stand up (the rest of the frame keeps its bake)."""
    if not pods:
        return
    keep = []
    for o in pods:
        info = popups[o.name]
        keep.append((o, o.matrix_world.copy()))
        o.matrix_world = o.matrix_world @ Matrix.Rotation(math.radians(info['open_deg']), 4, Vector(info['axis']))
    bpy.context.view_layer.update()
    mc.bake_ao(pods, samples=samples, distance=distance)
    for o, m in keep:
        o.matrix_world = m
    bpy.context.view_layer.update()


# ============================================================================================ trims
def trims(ex):
    """Exterior trims of the left half: window seals and the windscreen's black reveal, the cowl's vent slots,
    the mirror's base."""
    b = K.Buf()
    for kind in ('ws', 'rw'):
        wv = ex.win[kind]
        cen = np.array([float(S.ws_x(0.0, 1.05)) - 0.1, 0.0, 1.05]) if kind == 'ws' else np.array([float(S.rw_x(0.0, 1.05)) + 0.1, 0.0, 1.05])
        E = EX.side_dir(wv['P'], wv['N'], np.tile(cen, (len(wv['P']), 1)), False)
        k = K.coarse_idx(wv['P'], 0.0012)
        P, Nn, E = wv['P'][k], wv['N'][k], E[k]
        Q = P + E * 0.006 - Nn * 0.004
        prof = np.array([(-0.007, -0.006), (-0.006, 0.003), (0.0, 0.0055), (0.006, 0.003), (0.007, -0.006)])
        V, NN, T = K.sweep(Q, Nn, prof, closed=False)
        b.add(V, NN, T, 'rubber')
        if kind == 'ws':
            prof = np.array([(-0.0045, -0.001), (-0.0035, 0.003), (0.0035, 0.003), (0.0045, -0.001)])
            V, NN, T = K.sweep(P + E * 0.0015 + Nn * 0.0005, Nn, prof, closed=False)
            b.add(V, NN, T, 'trim')
    # cowl vent slots in front of the windscreen
    for k in range(6):
        y = 0.08 + 0.075 * k
        p, n = S.CT.to3d(np.array([[0.574, y]]))
        b.extend(K.box_buf((-0.008, -0.026, -0.004), (0.008, 0.026, 0.0015), 'trim', 0.003, 2, xf=K.mat4_trs(p[0])))
    # mirror base (the mirror part sits on it): a black pad on the fender just ahead of the door
    mp, mn = mirror_mount_point()
    b.extend(K.box_buf((-0.04, -0.012, -0.004), (0.04, 0.004, 0.020), 'trim', 0.006, 2, xf=K.mat4_trs(mp)))
    return b


def aperture_seals(ex):
    """Rubber seals round the door aperture in the greenhouse (on the flange, 15 mm in) and the quarter glass's
    seal; the sill's seal is in the apertures."""
    b = K.Buf()
    so = ex.cut['doorG'].side('out')
    P = so['P'] - so['N'] * 0.016 + so['E'] * 0.004
    P = K.resample(P, 0.075, closed=False)
    b.extend(K.tube_buf(P, 0.0065, 'rubber', 4))
    qP, qN = ex.quarter_P
    E = EX.side_dir(qP, qN, np.tile(qP.mean(0), (len(qP), 1)), True)
    Q = qP + E * 0.004 - qN * 0.003
    k = K.coarse_idx(Q, 0.0008)
    Q = np.vstack([Q[k], Q[k][:1]])
    b.extend(K.tube_buf(Q, 0.005, 'rubber', 5))
    op = ex.opening_out
    far = np.hypot(op['P'][:, 0] - D['ax_r'], op['P'][:, 2] - D['hub_z']) > D['arch_r'] + 0.09
    P_all = op['P'] - op['N'] * 0.05
    idx = np.nonzero(far)[0]
    runs = np.split(idx, np.nonzero(np.diff(idx) > 1)[0] + 1) if len(idx) else []
    for run in runs:
        if len(run) < 2:
            continue
        P = K.resample(P_all[run], 0.09, closed=False)
        b.extend(K.tube_buf(P, 0.007, 'rubber', 4))
    return b


def centre_trims(ex):
    """Trims that are not symmetric: the number plate in the tail panel (made-up characters), the boot lock."""
    b = K.Buf()
    zc = 0.5 * (D['tail_z0'] + D['tail_z1'])
    b.extend(plate_buf((ex.plate_x - 0.001, 0.0, zc), (-1.0, 0.0, 0.0), (0.0, 0.0, 1.0), 0.33, 0.15, '4P 718'))
    x = float(S.rear_x(0.0, D['tail_z1'] + 0.045)) + 0.002
    b.extend(K.cyl_buf((x + 0.004, 0.0, D['tail_z1'] + 0.045), (x - 0.006, 0.0, D['tail_z1'] + 0.045), 0.011, 'chrome', 16))
    b.extend(K.box_buf((x - 0.0068, -0.0012, D['tail_z1'] + 0.039), (x - 0.0062, 0.0012, D['tail_z1'] + 0.051), 'trim', 0.0, 1))
    return b


def mirror_mount_point():
    p, n = S.CT.to3d(np.array([[0.445, 0.748]]))
    return p[0], n[0]


# ============================================================================================ wipers
def wiper(y_pivot, length):
    """Wiper arm + blade resting along the windscreen's base, pointing to -Y. Local Z = glass normal."""
    zj = D['belt_z']
    p = np.array([float(S.ws_x(abs(y_pivot), zj)) + 0.048, y_pivot, zj - 0.015])
    q, n = S.CT.to3d(np.array([[p[0], p[1]]]))
    p = q[0] + n[0] * 0.004
    nrm = K.unit(np.array([math.sin(S._WR), 0.0, math.cos(S._WR)]))
    rest = np.array([0.0, -1.0, 0.0])
    rest = K.unit(rest - nrm * np.dot(rest, nrm))
    R = K.frame_from(rest, nrm)
    b = K.Buf()
    V, N, T = K.lathe(np.array([(0.0, 0.024), (0.011, 0.022), (0.015, 0.011), (0.016, 0.0)])[::-1], (0, 0, 0), (0, 0, 1), 16)
    b.add(V, N, T, 'trim')
    arm = np.array([(0.0, 0.0, 0.020), (0.06, 0.0, 0.028), (length, 0.0, 0.028)])
    b.extend(K.tube_buf(arm, 0.0045, 'trim', 6))
    b.extend(K.box_buf((0.04, -0.008, 0.011), (length + 0.02, 0.008, 0.019), 'trim', 0.003, 1))
    b.extend(K.box_buf((0.03, -0.004, 0.0), (length + 0.03, 0.004, 0.011), 'rubber', 0.002, 1))
    Vw, Nw, Tw, Mw = b.arrays()
    out = K.Buf()
    out.add(Vw @ R.T + p, Nw @ R.T, Tw, 'trim')
    out.M = list(Mw)
    return out, dict(pivot=p, rot=R, normal=nrm, rest=rest, sweep_deg=-92.0, axis_local='y')


# ============================================================================================ mounts
def mounts(ex, panels, pod):
    E = []
    hz = D['hub_z']
    for name, x, y, front, side in (('hub_FL', D['ax_f'], D['track_f'] / 2, True, -1), ('hub_FR', D['ax_f'], -D['track_f'] / 2, True, 1),
                                    ('hub_RL', D['ax_r'], D['track_r'] / 2, False, -1), ('hub_RR', D['ax_r'], -D['track_r'] / 2, False, 1)):
        E.append(mount(name, (x, y, hz), dict(cat='rim', axle='front' if front else 'rear', steer=front, driven=not front,
                                               handbrake=not front, side=side, hub_face=round(abs(y) + 0.010, 4), wheel_r=D['wheel_r'])))
    for name, pos, room in (('engine', IN.ENGINE, IN.ENGINE_ROOM), ('gearbox', IN.GEARBOX, IN.GEARBOX_ROOM),
                            ('radiator', IN.RADIATOR, IN.RADIATOR_ROOM), ('battery', IN.BATTERY, IN.BATTERY_ROOM),
                            ('fuelTank', IN.TANK, IN.TANK_ROOM)):
        E.append(mount(name, pos, dict(cat=name, space_min=list(room[0]), space_max=list(room[1]))))
    E.append(mount('exhaust', (0.40, -0.16, 0.235), dict(cat='exhaust', tail=[-2.38, -0.24, -0.02],
                                                         route='in the tunnel right of the propshaft, out under the rear valance on the right')))
    p, d = IN.steering_mount()
    ang = math.radians(IN.COLUMN_DEG)
    E.append(mount('steering', tuple(p), dict(cat='steering', column_deg=IN.COLUMN_DEG), rot=K.frame_from(d, (math.sin(ang), 0, math.cos(ang)))))
    # seat mounts at the floor attachment (the seat part's origin), floor_z repeated for the game
    z = IN.SEAT_Z
    for name, y, drv in (('seat_driver', IN.DRIVER_Y, True), ('seat_pass', -IN.DRIVER_Y, False)):
        E.append(mount(name, (IN.SEAT_X, y, z), dict(cat='seat', driver=drv, floor_z=round(z, 4), cushion_z=round(z + 0.20, 4),
                                                     side=-1 if y > 0 else 1)))
    for pname, info in panels.items():
        if info['mount'] is None:
            continue
        m = info['mount']
        cat = 'door' if m.startswith('door') else m
        side = (-1 if m.endswith('L') else 1) if m.startswith('door') else 0
        E.append(mount(m, tuple(info['hinge_pos']), dict(cat=cat, panel=pname, hinge=info['hinge'], open_deg=info['open_deg'], side=side)))
    # bumpers (stretch: fit = [length, width, height], box centred on the mount): thin, at the band's height
    zb = 0.43
    xb = float(S.front_x(0.0, zb))
    E.append(mount('bumperFront', (xb + 0.005, 0.0, zb), dict(cat='bumperFront', fit=[0.12, 1.56, 0.09])))
    zr = 0.42
    xr = float(S.rear_x(0.0, zr))
    E.append(mount('bumperRear', (xr - 0.005, 0.0, zr), dict(cat='bumperRear', fit=[0.12, 1.56, 0.09])))
    lp, lR = pod.lamp_frame()
    tp, tn = ex.tail_mount
    mp, mn = mirror_mount_point()
    for side, sname in ((1, 'L'), (-1, 'R')):
        E.append(mount('headlight_' + sname, (lp[0], side * lp[1], lp[2]), dict(cat='headlight', side=-side, on='POPUP_' + sname, recess='rect',
                                                                                 recess_w=IN.Pod.OPEN_W, recess_h=IN.Pod.OPEN_L,
                                                                                 recess_depth=round(IN.Pod.DEPTH - IN.Pod.SEAT, 3)), rot=lR))
        E.append(mount('taillight_' + sname, (tp[0], side * tp[1], tp[2]), dict(cat='taillight', side=-side, recess='round',
                                                                                recess_d=round(2 * D['lamp_r'], 3), recess_depth=0.045)))
        E.append(mount('mirror_' + sname, (mp[0], side * mp[1], mp[2] + 0.02), dict(cat='mirror', side=-side)))
        E.append(mount('armor_' + sname, (-0.18, side * 0.83, 0.45), dict(cat='armor', side=-side, fit=[1.10, 0.05, 0.46], fit_anchor='center')))
    xr_ = -0.47
    E.append(mount('roof', (xr_, 0.0, float(S.roof_z(xr_, 0.0)) + 0.06), dict(cat='roof', fit=[0.90, 0.95, 0.12], fit_anchor='center')))
    E.append(mount('horn', IN.HORN, dict(cat='horn')))
    E.append(mount('radio', (IN.STACK_X, 0.0, IN.RADIO_Z), dict(cat='radio', slot=[0.18, 0.046], slot_depth=0.06)))
    E.append(mount('handbrake', (IN.HB_X, 0.0, IN.tunnel_h(IN.HB_X) + 0.045), dict(cat='handbrake')))
    E.append(mount('gearLever', (IN.GEAR_X, 0.0, IN.tunnel_h(IN.GEAR_X) + 0.092), dict(cat='gearLever')))
    p_, d_ = IN.steering_mount()
    pi_ = p_ + d_ * 0.11 + np.array([0.0, -0.042, 0.0])
    E.append(mount('ignition', tuple(pi_), dict(cat='ignition', on='steering column shroud, right side')))
    return E


def json_extra(objs, panels, needles, wipers, popups, tris, total):
    ps = {}
    for name, info in panels.items():
        ps[name] = dict(mount=info['mount'], hinge=info['hinge'], hinge_pos=game_vec(info['hinge_pos']),
                        hinge_axis=game_vec(info['axis']), open_deg=info['open_deg'], glass=info.get('glass'))
    ns = {}
    for name, info in needles.items():
        ns[name] = dict(pivot=game_vec(info['pivot']), axis_local=info['axis_local'], axis=game_vec(info['normal']),
                        deg_full=info['deg_full'], rest='zero reading; positive angles turn counter-clockwise as seen by the driver')
    ws = {}
    for name, info in wipers.items():
        ws[name] = dict(pivot=game_vec(info['pivot']), axis_local=info['axis_local'], axis=game_vec(info['normal']),
                        sweep_deg=info['sweep_deg'])
    pu = {}
    for name, info in popups.items():
        pu[name] = dict(mount=info['mount'], hinge_pos=game_vec(info['pivot']), hinge_axis=game_vec(info['axis']),
                        open_deg=round(info['open_deg'], 2), rest='shut: the lid flush with the bonnet, the lamp looking down into the well')
    lo = np.full(3, 1e9)
    hi = np.full(3, -1e9)
    for o in objs:
        if o.type != 'MESH':
            continue
        for c in o.bound_box:
            w = o.matrix_world @ Vector(c)
            lo = np.minimum(lo, w)
            hi = np.maximum(hi, w)
    glo = game_vec(lo)
    ghi = game_vec(hi)
    bb = dict(min=[min(glo[0], ghi[0]), min(glo[1], ghi[1]), min(glo[2], ghi[2])], max=[max(glo[0], ghi[0]), max(glo[1], ghi[1]), max(glo[2], ghi[2])])
    eye = np.array(IN.EYE) + (0.0, 0.0, -DROP)
    return dict(panels=ps, needles=ns, wipers=ws, popups=pu, eye_default=game_vec(eye), bbox=bb,
                triangles=dict(total=total, **tris), units='metres, game frame (+x forward, +y up, +z right)',
                notes='hinge: Blender-local axis name (z = vertical door hinge, y = transverse lid hinge); hinge_axis: '
                      'the same axis in the game frame; a rotation of open_deg about hinge_axis (right hand) opens the panel. '
                      'Needles and wipers turn about their local +y (game) = Blender local +Z. Popups: the lamp pods POPUP_L / '
                      'POPUP_R, shut at rest; open_deg about hinge_axis stands them up (the lamps look ahead); the headlight '
                      'mounts are in the shut pods and ride with them (on).')


# ============================================================================================ previews
def preview_colours():
    """The frame's two paints for the previews: a red body and the black band (the game paints its own)."""
    for name, col in (('paint', (0.60, 0.075, 0.045)), ('paint_b', (0.018, 0.019, 0.022))):
        m = bpy.data.materials.get(name)
        if m and m.node_tree:
            m.node_tree.nodes.get('Principled BSDF').inputs['Base Color'].default_value = (*col, 1.0)


def import_part(pid, empty_name, parent=None):
    """A part model put on a mount for a preview (as the game places it: the part's origin on the mount)."""
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=os.path.abspath(f'public/models/modcar/parts/{pid}.glb'))
    new = [o for o in bpy.data.objects if o not in before]
    e = bpy.data.objects.get(empty_name)
    roots = [o for o in new if o.parent is None or o.parent not in new]
    for o in roots:
        o.matrix_world = e.matrix_world @ o.matrix_world
        if parent is not None:
            mw = o.matrix_world.copy()
            o.parent = parent
            o.matrix_parent_inverse = parent.matrix_world.inverted()
            o.matrix_world = mw
    return new


def previews(quick, panels, popups):
    PV.materials()
    preview_colours()
    PV.scene_setup('anime')
    res = (1280, 720)
    smp = 24 if quick else 48
    os.makedirs(SCRATCH_DIR, exist_ok=True)
    shots = [('f34', 35, 9, 7.4), ('r34', 145, 11, 7.4), ('side_l', 270, 2, 8.4), ('side_r', 90, 2, 8.4), ('front', 0, 4, 6.8), ('rear', 180, 6, 6.8)]
    for name, yaw, pitch, dist in shots:
        PV.orbit((0, 0, 0.58), yaw, pitch, dist, lens=50)
        PV.render(f'{SCRATCH}_{name}.png', res=res, samples=smp)
    PV.orbit((-0.0, 0, 0.6), 270, 89.5, 9, ortho=4.5)
    PV.render(f'{SCRATCH}_top.png', res=(1400, 720), samples=16)
    # driver's eye
    eye = Vector(IN.EYE) + Vector((0.0, 0.0, -DROP))
    PV.camera(tuple(eye), tuple(eye + Vector((1.0, -0.02, -0.14))), lens=24)
    PV.render(f'{SCRATCH}_driver.png', res=res, samples=smp)
    PV.camera(tuple(eye + Vector((0.12, 0.0, -0.04))), tuple(Vector((IN.DASH_FACE_X, IN.DRIVER_Y, 0.80 - DROP))), lens=35)
    PV.render(f'{SCRATCH}_cluster.png', res=res, samples=smp)

    def hide(names, h=True):
        for n in names:
            o = bpy.data.objects.get(n)
            if o:
                o.hide_render = h
                for c in o.children:
                    c.hide_render = h

    def turn(name, info, sign=1.0):
        o = bpy.data.objects.get(name)
        if o:
            o.matrix_world = o.matrix_world @ Matrix.Rotation(math.radians(info['open_deg'] * sign), 4, Vector(info['axis']))
    # the engine bay with the bonnet open
    turn('P_hood', panels['P_hood'])
    PV.camera((2.75, 1.25, 1.55), (1.10, 0.0, 0.48), lens=38)
    PV.render(f'{SCRATCH}_bay.png', res=res, samples=smp)
    turn('P_hood', panels['P_hood'], -1.0)
    for pn, cam in (('P_door_FL', ((0.2, 2.5, 1.10), (-0.1, 0.4, 0.62))), ('P_trunk', ((-3.3, 1.2, 1.55), (-1.70, 0.0, 0.55)))):
        info = panels[pn]
        turn(pn, info)
        PV.camera(cam[0], cam[1], lens=40)
        PV.render(f'{SCRATCH}_open_{pn[2:]}.png', res=res, samples=smp)
        turn(pn, info, -1.0)
    hide(['P_door_FL', 'P_door_FR', 'P_hood', 'P_trunk'])
    PV.orbit((0, 0, 0.6), 35, 12, 7.4, lens=50)
    PV.render(f'{SCRATCH}_stripped.png', res=res, samples=smp)
    hide(['P_door_FL', 'P_door_FR', 'P_hood', 'P_trunk'], False)
    # the lamps up: the round lamp part fitted in each pod, the pods stood up
    for sname in ('L', 'R'):
        pod = bpy.data.objects.get('POPUP_' + sname)
        if pod is not None:
            import_part('hl_round', 'M_headlight_' + sname, parent=pod)
    PV.orbit((0, 0, 0.58), 35, 9, 7.4, lens=50)
    PV.render(f'{SCRATCH}_lamps_down.png', res=res, samples=smp)
    for name, info in popups.items():
        turn(name, info)
    PV.orbit((0, 0, 0.58), 35, 9, 7.4, lens=50)
    PV.render(f'{SCRATCH}_lamps_up.png', res=res, samples=smp)
    PV.orbit((0, 0, 0.58), 0, 4, 6.8, lens=50)
    PV.render(f'{SCRATCH}_lamps_up_front.png', res=res, samples=smp)
    PV.camera((2.6, 1.3, 1.05), (1.55, 0.45, 0.78), lens=40)
    PV.render(f'{SCRATCH}_lamps_up_close.png', res=res, samples=smp)
    for name, info in popups.items():
        turn(name, info, -1.0)
    g = bpy.data.objects.get('preview_ground')
    if g:
        g.hide_render = True
    PV.camera((2.2, -2.6, -1.6), (0.0, 0.0, 0.22), lens=35)
    PV.render(f'{SCRATCH}_under.png', res=res, samples=smp)
    if g:
        g.hide_render = False
