"""Turtle assembly (the Loaf's, frames/_van_build.py, with the elevating roof): objects, origins, mounts, JSON, AO, export and
previews. Called from frames/turtle.py main()."""
import math
import sys
import time

sys.dont_write_bytecode = True

import bpy  # noqa: E402
import numpy as np  # noqa: E402
from mathutils import Matrix, Vector  # noqa: E402

from frames import _kit as K  # noqa: E402
from frames import _preview as PV  # noqa: E402
from frames import _turtle_ext as EX  # noqa: E402
from frames import _turtle_inner as IN  # noqa: E402
from frames import _stretch as ST  # noqa: E402
from frames import turtle as S  # noqa: E402
from frames._sedan_build import game_vec, knuckles, mount, needle, obj_with_origin  # noqa: E402
from frames._sedan_ext import side_dir  # noqa: E402
from lib import modcar as mc  # noqa: E402

D = S.D
OUT_GLB = 'public/models/modcar/frames/turtle.glb'
OUT_JSON = 'src/core/modcar/data/mounts/turtle.json'
SCRATCH = 'D:/modcar-scratch/frames/turtle/turtle'


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
    # the vertices in a fixed order too (so the weld keeps the same one of two points a hair apart)
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
    mc.reset_scene()
    ex = EX.Exterior()
    print('[turtle] exterior surfaces', round(time.time() - t0, 1), 's')
    # ---------------------------------------------------------------- BODY
    eb, per, pedges = ex.edges()
    strips, pstrips = ex.waist_strips()
    common = K.Buf()
    common.extend(ex.roof())
    # (the lip round the elevating roof's opening is whole: in the right half only, the left mirrors nothing of it)
    common.extend(eb)
    common.extend(ex.opening_details())
    common.extend(ex.nose_details())
    common.extend(ex.ws_trims())
    common.extend(ex.drip_rail())
    common.extend(ex.rear_louvres())
    common.extend(ex.window_seals(['quarter', 'rear']))
    common.extend(ex.tail_details())
    common.extend(IN.engine_bay())
    left = K.Buf().extend(common).extend(ex.body('L')).extend(per['L']).extend(strips['L'])
    left.extend(ex.window_seals(['mid'])).extend(ex.fuel_details())
    right = K.Buf().extend(common).extend(ex.body('R')).extend(per['R']).extend(strips['R']).extend(ex.slide_rail())
    body = K.Buf().extend(left).extend(right.mirrored())
    body.extend(ex.opening_lip())
    body.extend(ex.emblem())
    objs = [canon(EX.two_tone(body)).to_object('BODY')]
    print('[turtle] body', round(time.time() - t0, 1), 's')
    panels = {}
    gl = ex.glass()
    # ---------------------------------------------------------------- cab doors (hinged at the front edge)
    door = ex.door_skin('door')
    door.extend(pedges['door']).extend(pstrips['door']).extend(ex.door_card('door')).extend(IN.door_extras(ex, 'door'))
    door.extend(ex.window_seals(['door']))
    EX.two_tone(door)
    yh = float(S.side_w(D['cd_x1'], 1.26)) - 0.004
    for side, sname in ((1, 'L'), (-1, 'R')):
        mid = 'door_F' + sname
        hinge = np.array([D['cd_x1'] - 0.004, side * yh, 1.26])
        buf = door if side > 0 else door.mirrored()
        o = owo(buf, 'P_' + mid, hinge)
        gb = gl['door'] if side > 0 else gl['door'].mirrored()
        og = owo(gb, 'PG_' + mid, hinge, parent=o)
        objs += [o, og]
        panels['P_' + mid] = dict(mount=mid, glass='PG_' + mid, hinge='z', hinge_pos=hinge, axis=(0, 0, 1), open_deg=-68.0 * side)
    # ---------------------------------------------------------------- the side door on the right: a hinged panel
    # (the game swings panels on hinges; this one stands for the old van's sliding door), built in mirror
    sd = ex.door_skin('side')
    sd.extend(pedges['side']).extend(pstrips['side']).extend(ex.door_card('side', mat='wood')).extend(IN.door_extras(ex, 'side'))
    sd.extend(ex.window_seals(['side']))
    EX.two_tone(sd)
    dh = np.array([D['sd_x1'] - 0.004, -(float(S.side_w(D['sd_x1'], 1.08)) - 0.004), 1.08])
    o = owo(sd.mirrored(), 'P_door_side', dh)
    og = owo(gl['side'].mirrored(), 'PG_door_side', dh, parent=o)
    objs += [o, og]
    panels['P_door_side'] = dict(mount='door_side', glass='PG_door_side', hinge='z', hinge_pos=dh, axis=(0, 0, 1), open_deg=95.0)
    # ---------------------------------------------------------------- the engine lid (hood) and the tailgate (trunk)
    lid = ex.rear_panel('lid')
    lid.extend(pedges['lid']).extend(IN.lid_details('lid')).extend(ex.rear_panel_back('lid', -0.022, 'paint'))
    lh = S.REAR.to3d(np.array([[0.0, D['lid_z1'] + 0.004]]))[0][0] + np.array([0.006, 0.0, 0.0])
    objs.append(owo(both(lid, IN.lid_centre('lid')), 'P_hood', lh))
    panels['P_hood'] = dict(mount='hood', hinge='y', hinge_pos=lh, axis=(0, 1, 0), open_deg=75.0)
    tg = ex.rear_panel('tg')
    tg.extend(pedges['tg']).extend(pstrips['tg']).extend(ex.rear_panel_back('tg', -0.046, 'plastic_int')).extend(tail_seal(ex))
    EX.two_tone(tg)
    th = S.REAR.to3d(np.array([[0.0, D['tg_hinge']]]))[0][0] + np.array([0.004, 0.0, 0.0])
    o = owo(both(tg, IN.lid_centre('tg')), 'P_trunk', th)
    og = owo(both(gl['tail']), 'PG_trunk', th, parent=o)
    objs += [o, og]
    panels['P_trunk'] = dict(mount='trunk', glass='PG_trunk', hinge='y', hinge_pos=th, axis=(0, 1, 0), open_deg=95.0)
    # ---------------------------------------------------------------- fuel flap (left, hinged on its front edge)
    ff = ex.fuel_flap()
    fc = ex.cut['fuel'].P.mean(0)
    fhinge = np.array([fc[0] + D['fuel'][2] - 0.002, fc[1] + 0.002, fc[2]])
    objs.append(owo(ff, 'FUEL_CAP', fhinge))
    panels['FUEL_CAP'] = dict(mount=None, hinge='z', hinge_pos=fhinge, axis=(0, 0, 1), open_deg=-85.0)
    # ---------------------------------------------------------------- GLASS, UNDER, INTERIOR
    g = K.Buf()
    for k in ('ws', 'quarter', 'rear'):
        g.extend(gl[k]).extend(gl[k].mirrored())
    g.extend(gl['mid'])
    objs.append(canon(g).to_object('GLASS'))
    objs.append(canon(both(IN.underbody(), IN.centre_under())).to_object('UNDER'))
    # ---------------------------------------------------------------- the elevating roof: the shell, its bellows
    sb, s_org = EX.shell()
    o_shell = owo(sb, 'POPUP_roof', s_org)
    bb, b_org = EX.bellows()
    o_bel = owo(bb, 'POPUP_roof_bellows', b_org)
    # (exported folded flat under the shell, as it is with the roof down: the game stretches it up)
    o_bel.matrix_world = o_bel.matrix_world @ Matrix.Scale(0.02, 4, Vector((0, 0, 1)))
    objs += [o_shell, o_bel]
    popups = {'POPUP_roof': dict(pivot=s_org, lift=D['pt_lift'], bellows='POPUP_roof_bellows', bellows_at=b_org)}
    it = IN.interior(ex)
    inner = K.Buf().extend(it['L']).extend(it['L'].mirrored()).extend(it['C']).extend(it['R'].mirrored())
    inner.extend(ex.lining('L')).extend(ex.lining('R').mirrored())
    inner.extend(both(ex.roof(level=EX.WALL)))
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
    for wname, wy, wl in (('WIPER_L', 0.54, 0.50), ('WIPER_R', -0.08, 0.50)):
        wb, info = wiper(wy, wl)
        objs.append(owo(wb, wname, info['pivot'], rot=info['rot']))
        wipers[wname] = info
    print('[turtle] objects', round(time.time() - t0, 1), 's')
    empties = mounts(ex, panels)
    objs += knuckles(empties, lambda x, y, z, front: canon(IN.knuckle(x, y, z, front)))
    # the frame lengthened (the Turtle widened too) as it is built: frames/_stretch.py
    ST.apply('turtle', objs, empties, panels, (needles, wipers), popups)
    dial_glass = ST.buf('turtle', dial_glass)
    meshes = [o for o in objs if o.type == 'MESH']
    tris = {o.name: mc.triangles([o]) for o in meshes}
    total = sum(tris.values())
    print('[turtle] triangles', total, {k: v for k, v in sorted(tris.items(), key=lambda kv: -kv[1])[:10]})
    if not quick:
        # the engine bay is baked with the lid up (one looks into it with the lid open)
        hood = next(o for o in meshes if o.name == 'P_hood')
        K.bake_ao_open(meshes, [(hood, panels['P_hood']['axis'], panels['P_hood']['open_deg'])],
                       ST.box('turtle', (D['xr'] - 0.05, -0.91, 0.25), (IN.FIREWALL_X + 0.06, 0.91, IN.DECK_Z + 0.02)), samples=32, distance=0.35)
        print('[turtle] AO', round(time.time() - t0, 1), 's')
        # (the shell and its bellows baked shut — the bellows folded flat under the shell, the shell's underside down on
        # the lining: seen lifted they would be near black; the bellows and the underside unshaded)
        for o in meshes:
            a = o.data.color_attributes.get('Col') if o.name in ('POPUP_roof', 'POPUP_roof_bellows') else None
            if a is None:
                continue
            c = np.zeros(len(a.data) * 4, np.float32)
            a.data.foreach_get('color', c)
            c = c.reshape(-1, 4)
            under = {i for i, m in enumerate(o.data.materials) if m and m.name in ('paint_b', 'lining')}
            for p in o.data.polygons:
                if o.name == 'POPUP_roof_bellows' or p.material_index in under:
                    for li in p.loop_indices:
                        c[li] = 1.0
            a.data.foreach_set('color', c.ravel())
        # the dial faces once more without the needles over them
        K.rebake_mats(o_int, [o for o in meshes if o.name.startswith('N_')], ('gauge',), samples=32, distance=0.35)
    K.join_white(o_int, dial_glass)
    tris = {o.name: mc.triangles([o]) for o in meshes}
    total = sum(tris.values())
    print('[turtle] grime masks', K.mask_frame(meshes))
    mc.export_glb(OUT_GLB, meshes + empties)
    mc.mounts_json(OUT_JSON, 'turtle', ST.map_json('turtle', json_extra(objs, panels, needles, wipers, tris, total, popups)))
    print('[turtle] exported', round(time.time() - t0, 1), 's')
    if not no_preview:
        previews(quick)
    print('[turtle] done', round(time.time() - t0, 1), 's')


def tail_seal(ex):
    """The rubber seal inside the tail window's reveal (left half: the outline runs from the centre line round)."""
    w = ex.win['tail']
    cen = np.array([w['P'][:, 0].mean() + 0.1, 0.0, w['P'][:, 2].mean()])
    E = side_dir(w['P'], w['N'], np.tile(cen, (len(w['P']), 1)), False)
    k = K.coarse_idx(w['P'], 0.001)
    P, N, E = w['P'][k], w['N'][k], E[k]
    prof = np.array([(-0.006, 0.0), (-0.005, 0.0035), (0.0, 0.005), (0.005, 0.0035), (0.006, 0.0)])
    V, Nn, Tr = K.sweep(P + E * 0.007 - N * 0.009, N, prof, closed=False)
    return K.Buf().add(V, Nn, Tr, 'rubber')


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
def mirror_point():
    # on the body at the front corner under the quarter window, ahead of the cab door: the driver sees it through
    # the quarter window
    p, n = S.SIDE.to3d(np.array([[1.86, 1.06]]))
    return p[0]


def mounts(ex, panels):
    E = []
    hz = D['hub_z']
    for name, x, y, front, side in (('hub_FL', D['ax_f'], D['track_f'] / 2, True, -1), ('hub_FR', D['ax_f'], -D['track_f'] / 2, True, 1),
                                    ('hub_RL', D['ax_r'], D['track_r'] / 2, False, -1), ('hub_RR', D['ax_r'], -D['track_r'] / 2, False, 1)):
        E.append(mount(name, (x, y, hz), dict(cat='rim', axle='front' if front else 'rear', steer=front, driven=not front,
                                               handbrake=not front, side=side, hub_face=round(abs(y) + 0.010, 4), wheel_r=D['wheel_r'])))
    E.append(mount('engine', IN.ENGINE, dict(cat='engine', space_min=[-0.345, -0.40, 0.0], space_max=[0.225, 0.40, 0.575],
                                             note='at the back under the engine lid, yawed 180 deg: its fan and pulley (+x) towards the lid, '
                                                  'its flywheel and exhaust ports towards the transaxle'),
                   rot=rot_z(180.0)))
    E.append(mount('gearbox', IN.GEARBOX, dict(cat='gearbox', space_min=[-0.31, -0.14, 0.0], space_max=[0.215, 0.14, 0.235],
                                               note='rear transaxle: ahead of the rear axle, yawed 180 deg (its bell towards the differential '
                                                    'and the engine behind it)'),
                   rot=rot_z(180.0)))
    E.append(mount('battery', IN.BATTERY, dict(cat='battery', space_min=[-0.15, -0.10, 0.0], space_max=[0.15, 0.10, 0.25],
                                               note='on a tray at the front of the cab, between the footwells')))
    E.append(mount('fuelTank', IN.TANK, dict(cat='fuelTank', space_min=[-0.25, -0.41, 0.0], space_max=[0.25, 0.41, 0.165],
                                             note='under the floor between the rails, yawed 180 deg: the filler neck of the tank part (+z) '
                                                  'points to the flap on the left'),
                   rot=rot_z(180.0)))
    E.append(mount('exhaust', (D['xr'] + 0.096, -0.82, 0.29), dict(cat='exhaust', tail=[-1.61, 0.05, -0.07],
                                                                    route='across the back under the engine, right to left, the tail pipe out '
                                                                          'at the left rear corner (yawed -90 deg: the parts run along their -x; '
                                                                          'the tail in the mount\'s own axes)'),
                   rot=rot_z(-90.0)))
    p, d = IN.steering_mount()
    ang = math.radians(IN.COLUMN_DEG)
    E.append(mount('steering', tuple(p), dict(cat='steering', column_deg=IN.COLUMN_DEG), rot=K.frame_from(d, (math.sin(ang), 0, math.cos(ang)))))
    for name, x, y, z, drv, side, note in (('seat_driver', IN.SEAT_X, IN.DRIVER_Y, IN.SEAT_Z, True, -1, 'on the box over the front wheel'),
                                           ('seat_pass', IN.SEAT_X, -IN.DRIVER_Y, IN.SEAT_Z, False, 1, 'on the box over the front wheel')):
        E.append(mount(name, (x, y, z), dict(cat='seat', driver=drv, floor_z=round(z, 4), side=side, note=note)))
    for pname, info in panels.items():
        if info['mount'] is None:
            continue
        m = info['mount']
        cat = 'door' if m.startswith('door') else m
        side = (-1 if m.endswith('L') else 1) if m.startswith('door_F') else (1 if m == 'door_side' else 0)
        E.append(mount(m, tuple(info['hinge_pos']), dict(cat=cat, panel=pname, hinge=info['hinge'], open_deg=info['open_deg'], side=side)))
    zf = 0.46
    xb = float(S.FRONT.to3d(np.array([[0.0, zf]]))[0][0][0])
    E.append(mount('bumperFront', (xb + 0.005, 0.0, zf), dict(cat='bumperFront', fit=[0.10, 1.76, 0.12])))
    zr = 0.42
    xr = float(S.REAR.to3d(np.array([[0.0, zr]]))[0][0][0])
    E.append(mount('bumperRear', (xr - 0.005, 0.0, zr), dict(cat='bumperRear', fit=[0.10, 1.76, 0.12])))
    c3, n3 = ex.lamp_mount
    tp, tn = ex.tail_mount
    mp = mirror_point()
    for side, sname in ((1, 'L'), (-1, 'R')):
        E.append(mount('headlight_' + sname, (c3[0], side * c3[1], c3[2]), dict(cat='headlight', side=-side, recess='round', recess_d=D['lamp_d'],
                                                                                 recess_depth=0.07)))
        E.append(mount('taillight_' + sname, (tp[0], side * tp[1], tp[2]),
                       dict(cat='taillight', side=-side, recess='rect', recess_w=D['tail_w'], recess_h=D['tail_h'], recess_depth=0.045,
                            on='tail, beside the engine lid, upright (the mount turned 90 deg about x: a lamp made lying stands up)'),
                       rot=rot_x(90.0 * side)))
        E.append(mount('mirror_' + sname, (mp[0], side * mp[1], mp[2]), dict(cat='mirror', side=-side, on='body, at the front corner under the quarter window')))
        # side armour between the wheel arches, from the sill up to the waist (as the sedan's, over the doors there)
        E.append(mount('armor_' + sname, (-0.04, side * 0.923, 0.72), dict(cat='armor', side=-side, fit=[1.56, 0.05, 0.60], fit_anchor='center')))
    # (no roof mount: the roof is the elevating shell)
    E.append(mount('horn', (D['xf'] - 0.10, -0.20, 0.56), dict(cat='horn', on='inside the nose behind the louvres')))
    E.append(mount('radio', (IN.DASH_FACE_X - 0.012, 0.0, 0.992), dict(cat='radio', slot=[0.18, 0.046], slot_depth=0.06)))
    E.append(mount('handbrake', (1.30, 0.0, IN.CONSOLE_TOP), dict(cat='handbrake', note='on the console between the seats')))
    E.append(mount('gearLever', (IN.GEAR_X, 0.0, IN.CONSOLE_TOP + 0.014), dict(cat='gearLever', note='on the console ahead of the seats')))
    p_, d_ = IN.steering_mount()
    pi_ = p_ + d_ * 0.12 + np.array([0.0, -0.045, 0.0])
    E.append(mount('ignition', tuple(pi_), dict(cat='ignition', on='steering column shroud, right side')))
    return E


def json_extra(objs, panels, needles, wipers, tris, total, popups):
    from frames._sedan_build import json_extra as je
    out = je(objs, panels, needles, wipers, tris, total)
    out['eye_default'] = game_vec(np.array(IN.EYE))
    # the elevating roof: lifted straight up (game +y) by lift; its bellows stretched up from the lip as it goes
    out['popups'] = {name: dict(hinge_pos=game_vec(info['pivot']), hinge_axis=[0.0, 1.0, 0.0], open_deg=0.0, lift=[0.0, round(info['lift'], 4), 0.0],
                                bellows=info['bellows'], bellows_pos=game_vec(info['bellows_at']), driver='roof',
                                rest='down: the shell on its lip, the bellows folded flat under it') for name, info in popups.items()}
    # where one can stand in the room (game frame), an empty shell since docs/V3/plan/finish.md section 19 step 7: the
    # floor from the deck over the rear axle to the seats, wall to wall; the deck's top and the engine deck's behind it
    # (core/modcar/aboard.ts, cargo.ts)
    out['room'] = dict(floor_y=IN.FLOOR_Z, x=[IN.AXLE_DECK_X1, IN.ROOM_FRONT_X], z=[-0.86, 0.86],
                       deck=dict(x=[IN.FIREWALL_X, IN.AXLE_DECK_X1], top=IN.AXLE_DECK_Z),
                       engine_deck=dict(x=[D['xr'] + 0.03, IN.FIREWALL_X], top=IN.DECK_Z))
    return out


# ============================================================================================ previews
def _srgb(h):
    c = [((h >> k) & 255) / 255.0 for k in (16, 8, 0)]
    return tuple(v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4 for v in c) + (1.0,)


def previews(quick):
    PV.materials()
    # the factory colours (palette.ts): Mustard below the waist, Cream above
    for name, hx in (('paint', 0x4f9a8b), ('paint_b', 0xede3c8)):
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
    tgt = (-0.1, 0, 1.0)
    for name, yaw, pitch, dist in (('f34', 35, 9, 9.8), ('r34', 145, 12, 9.8), ('side_l', 270, 2, 10.6), ('side_r', 90, 2, 10.6),
                                   ('front', 0, 4, 9.0), ('rear', 180, 6, 9.0)):
        PV.orbit(tgt, yaw, pitch, dist, lens=50)
        PV.render(f'{SCRATCH}_{name}.png', res=res, samples=smp)
    PV.orbit((-0.1, 0, 1.0), 270, 89.5, 10, ortho=5.4)
    PV.render(f'{SCRATCH}_top.png', res=(1400, 720), samples=16)
    eye = Vector(IN.EYE)
    PV.camera(tuple(eye), tuple(eye + Vector((1.0, -0.02, -0.20))), lens=24)
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
        m = o.matrix_world.copy()
        o.matrix_world = m @ Matrix.Rotation(math.radians(deg), 4, Vector(axis))
        return (o, m)

    def back(saved):
        if saved:
            saved[0].matrix_world = saved[1]
    s = swing('P_hood', (0, 1, 0), 75.0)
    PV.camera((-4.0, -1.5, 1.35), (-1.9, 0.0, 0.65), lens=35)
    PV.render(f'{SCRATCH}_bay.png', res=res, samples=smp)
    back(s)
    s = swing('P_door_FL', (0, 0, 1), -68.0)
    PV.camera((1.0, 3.2, 1.55), (1.1, 0.3, 1.0), lens=35)
    PV.render(f'{SCRATCH}_open_door_FL.png', res=res, samples=smp)
    back(s)
    s = swing('P_door_side', (0, 0, 1), 95.0)
    PV.camera((-0.2, -3.6, 1.6), (-0.2, 0.0, 1.0), lens=32)
    PV.render(f'{SCRATCH}_open_door_side.png', res=res, samples=smp)
    back(s)
    s = swing('P_trunk', (0, 1, 0), 95.0)
    s2 = swing('P_hood', (0, 1, 0), 75.0)
    PV.camera((-5.0, 1.8, 1.9), (-1.8, 0.0, 1.0), lens=35)
    PV.render(f'{SCRATCH}_open_trunk.png', res=res, samples=smp)
    back(s2)
    back(s)
    # the room from between the front seats, looking back; and from the bench forward
    PV.camera((1.25, 0.0, 1.50), (-1.8, 0.0, 1.0), lens=22)
    PV.render(f'{SCRATCH}_inside_back.png', res=res, samples=smp)
    PV.camera((-0.30, -0.35, 1.60), (1.8, 0.3, 1.1), lens=22)
    PV.render(f'{SCRATCH}_inside_fwd.png', res=res, samples=smp)
    shell = bpy.data.objects.get('POPUP_roof')
    bel = bpy.data.objects.get('POPUP_roof_bellows')
    if shell and bel:
        m0, b0 = shell.matrix_world.copy(), bel.matrix_world.copy()
        shell.matrix_world = Matrix.Translation((0, 0, D['pt_lift'])) @ m0
        bel.matrix_world = b0 @ Matrix.Scale(50.0, 4, Vector((0, 0, 1)))
        PV.orbit(tgt, 35, 9, 9.8, lens=50)
        PV.render(f'{SCRATCH}_roof_up.png', res=res, samples=smp)
        PV.orbit(tgt, 145, 12, 9.8, lens=50)
        PV.render(f'{SCRATCH}_roof_up_r34.png', res=res, samples=smp)
        PV.camera((1.25, 0.0, 1.62), (-1.8, 0.0, 1.35), lens=22)
        PV.render(f'{SCRATCH}_roof_up_inside.png', res=res, samples=smp)
        shell.matrix_world = m0
        bel.matrix_world = b0
    hide(['P_door_FL', 'P_door_FR', 'P_hood', 'P_trunk', 'P_door_side'])
    PV.orbit(tgt, 35, 14, 9.8, lens=50)
    PV.render(f'{SCRATCH}_stripped.png', res=res, samples=smp)
    hide(['P_door_FL', 'P_door_FR', 'P_hood', 'P_trunk', 'P_door_side'], False)
    g = bpy.data.objects.get('preview_ground')
    if g:
        g.hide_render = True
    PV.camera((2.6, -3.2, -1.8), (0.0, 0.0, 0.35), lens=32)
    PV.render(f'{SCRATCH}_under.png', res=res, samples=smp)
    if g:
        g.hide_render = False
