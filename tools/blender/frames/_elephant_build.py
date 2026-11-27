"""Old Elephant assembly (the Turtle's and the Loaf's, frames/_van_build.py): objects, origins, mounts, JSON, AO, export and
previews. Called from frames/elephant.py main()."""
import math
import sys
import time

sys.dont_write_bytecode = True

import bpy  # noqa: E402
import numpy as np  # noqa: E402
from mathutils import Matrix, Vector  # noqa: E402

from frames import _kit as K  # noqa: E402
from frames import _preview as PV  # noqa: E402
from frames import _elephant_ext as EX  # noqa: E402
from frames import _elephant_inner as IN  # noqa: E402
from frames import _steps as STP  # noqa: E402
from frames import _stretch as ST  # noqa: E402
from frames import elephant as S  # noqa: E402
from frames._sedan_build import game_vec, knuckles, mount, needle, obj_with_origin  # noqa: E402
from frames._sedan_ext import side_dir  # noqa: E402
from lib import modcar as mc  # noqa: E402

D = S.D
OUT_GLB = 'public/models/modcar/frames/elephant.glb'
OUT_JSON = 'src/core/modcar/data/mounts/elephant.json'
SCRATCH = 'D:/modcar-scratch/frames/elephant/elephant'


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


def flat_z():
    """Where the side's flat wall starts over its bottom roll, at the entry door."""
    xa, xb, _, _ = IN.well_span()
    return D['z_bot'] + float(np.atleast_1d(S.r_bot(np.array([0.5 * (xa + xb)])))[0])


def entry_well():
    """The entry door's stairwell (left coordinates; the build mirrors it to the right), frames/_steps.py: in the
    opening between its edges from the body's face in, its tread EX.WELL at the door from the room's floor, under the
    body's bottom its housing (its cheeks up to where the bottom roll ends)."""
    xa, xb, _, yf = IN.well_span()
    return STP.stairwell(xa, xb, yf, IN.FLOOR_Z, EX.WELL['tops'], EX.WELL['depth'], flat_z() - 0.01, wall='wood')


def entry_edges(per_r):
    """The right side's opening edges without the entry door's return along its foot (the opening goes on down to the
    stairwell); the jambs on down to the well's housing, and a moulding round it all in the second paint, as Nomad
    Drive's class A has its entry door in a white one (left coordinates)."""
    xa, xb, _, yf = IN.well_span()
    b = STP.drop_box(per_r, (xa - 0.05, yf - 0.3, -1.0), (xb + 0.05, yf + 0.05, D['sd_z0'] + 0.012))
    zh = STP.housing_bottom(EX.WELL['tops']) - 0.012
    b.extend(STP.jambs(xa, xb, yf, zh, D['sd_z0'] + 0.016, mat='paint'))
    zf = flat_z()
    b.extend(STP.moulding(xa, xb, zh, D['sd_z1'] + S.DELTA, D['sd_r'], lambda x, z: float(S.side_w(x, max(z, zf))), mat='paint_b'))
    return b


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
    print('[elephant] exterior surfaces', round(time.time() - t0, 1), 's')
    # ---------------------------------------------------------------- BODY
    eb, per, pedges = ex.edges()
    strips, pstrips = ex.waist_strips()
    common = K.Buf()
    common.extend(ex.roof())
    common.extend(eb)
    common.extend(ex.opening_details())
    common.extend(ex.nose_details())
    common.extend(ex.ws_trims())
    common.extend(ex.drip_rail())
    common.extend(ex.rear_louvres())
    common.extend(ex.window_seals(['quarter', 'rear']))
    common.extend(ex.tail_details())
    common.extend(tail_seal(ex))
    common.extend(IN.engine_bay())
    left = K.Buf().extend(common).extend(ex.body('L')).extend(per['L']).extend(strips['L'])
    left.extend(ex.window_seals(['mid', 'gal'])).extend(ex.fuel_details())
    right = K.Buf().extend(common).extend(ex.body('R')).extend(entry_edges(per['R'])).extend(strips['R']).extend(ex.window_seals(['mid_r']))
    body = K.Buf().extend(left).extend(right.mirrored())
    body.extend(ex.emblem())
    objs = [canon(EX.two_tone(body)).to_object('BODY')]
    print('[elephant] body', round(time.time() - t0, 1), 's')
    panels = {}
    gl = ex.glass()
    # ---------------------------------------------------------------- cab doors (hinged at the front edge)
    door = ex.door_skin('door')
    door.extend(pedges['door']).extend(pstrips['door']).extend(ex.door_card('door')).extend(IN.door_extras(ex, 'door'))
    door.extend(ex.window_seals(['door']))
    EX.two_tone(door)
    yh = float(S.side_w(D['cd_x1'], 1.70)) - 0.004
    for side, sname in ((1, 'L'), (-1, 'R')):
        mid = 'door_F' + sname
        hinge = np.array([D['cd_x1'] - 0.004, side * yh, 1.70])
        buf = door if side > 0 else door.mirrored()
        o = owo(buf, 'P_' + mid, hinge)
        gb = gl['door'] if side > 0 else gl['door'].mirrored()
        og = owo(gb, 'PG_' + mid, hinge, parent=o)
        objs += [o, og]
        panels['P_' + mid] = dict(mount=mid, glass='PG_' + mid, hinge='z', hinge_pos=hinge, axis=(0, 0, 1), open_deg=-68.0 * side)
    # ---------------------------------------------------------------- the entry door on the right, hinged at its front
    # edge (built in mirror)
    sd = ex.door_skin('side')
    sd.extend(pedges['side']).extend(pstrips['side']).extend(ex.door_card('side', mat='wood')).extend(IN.door_extras(ex, 'side'))
    sd.extend(ex.window_seals(['side']))
    # (its foot on down to the stairwell's threshold, shutting over the well)
    xa, xb, _, yf = IN.well_span()
    sd.extend(STP.kick_panel(D['sd_x0'] + S.DELTA, D['sd_x1'] - S.DELTA, yf, EX.WELL['tops'][0], D['sd_z0'] + S.DELTA, 'paint'))
    EX.two_tone(sd)
    dh = np.array([D['sd_x1'] - 0.004, -(float(S.side_w(D['sd_x1'], 1.60)) - 0.004), 1.60])
    o = owo(sd.mirrored(), 'P_door_side', dh)
    og = owo(gl['side'].mirrored(), 'PG_door_side', dh, parent=o)
    objs += [o, og]
    panels['P_door_side'] = dict(mount='door_side', glass='PG_door_side', hinge='z', hinge_pos=dh, axis=(0, 0, 1), open_deg=95.0)
    # ---------------------------------------------------------------- the engine lid (hood) in the tail
    lid = ex.rear_panel('lid')
    lid.extend(pedges['lid']).extend(IN.lid_details('lid')).extend(ex.rear_panel_back('lid', -0.022, 'paint'))
    lh = S.REAR.to3d(np.array([[0.0, D['lid_z1'] + 0.004]]))[0][0] + np.array([0.006, 0.0, 0.0])
    objs.append(owo(both(lid, IN.lid_centre('lid')), 'P_hood', lh))
    panels['P_hood'] = dict(mount='hood', hinge='y', hinge_pos=lh, axis=(0, 1, 0), open_deg=75.0)
    # ---------------------------------------------------------------- fuel flap (left, hinged on its front edge)
    ff = ex.fuel_flap()
    fc = ex.cut['fuel'].P.mean(0)
    fhinge = np.array([fc[0] + D['fuel'][2] - 0.002, fc[1] + 0.002, fc[2]])
    objs.append(owo(ff, 'FUEL_CAP', fhinge))
    panels['FUEL_CAP'] = dict(mount=None, hinge='z', hinge_pos=fhinge, axis=(0, 0, 1), open_deg=-85.0)
    # ---------------------------------------------------------------- GLASS, UNDER, INTERIOR
    g = K.Buf()
    for k in ('ws', 'quarter', 'rear', 'tail'):
        g.extend(gl[k]).extend(gl[k].mirrored())
    g.extend(gl['mid']).extend(gl['gal']).extend(gl['mid_r'].mirrored())
    objs.append(canon(g).to_object('GLASS'))
    objs.append(canon(K.Buf().extend(IN.underbody()).extend(IN.underbody(right=True).mirrored()).extend(IN.centre_under())).to_object('UNDER'))
    it = IN.interior(ex)
    inner = K.Buf().extend(it['L']).extend(it['L'].mirrored()).extend(it['C']).extend(it['R'].mirrored())
    inner.extend(ex.lining('L')).extend(ex.lining('R').mirrored())
    # the entry door's stairwell (frames/_steps.py), on the right
    inner.extend(entry_well().mirrored())
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
    for wname, wy, wl in (('WIPER_L', 0.92, 0.74), ('WIPER_R', 0.06, 0.74)):
        wb, info = wiper(wy, wl)
        objs.append(owo(wb, wname, info['pivot'], rot=info['rot']))
        wipers[wname] = info
    print('[elephant] objects', round(time.time() - t0, 1), 's')
    empties = mounts(ex, panels)
    objs += knuckles(empties, lambda x, y, z, front: canon(IN.knuckle(x, y, z, front)))
    # the frame lengthened (the Turtle widened too) as it is built: frames/_stretch.py
    ST.apply('elephant', objs, empties, panels, (needles, wipers))
    dial_glass = ST.buf('elephant', dial_glass)
    meshes = [o for o in objs if o.type == 'MESH']
    tris = {o.name: mc.triangles([o]) for o in meshes}
    total = sum(tris.values())
    print('[elephant] triangles', total, {k: v for k, v in sorted(tris.items(), key=lambda kv: -kv[1])[:10]})
    if not quick:
        # the engine bay is baked with the lid up (one looks into it with the lid open)
        hood = next(o for o in meshes if o.name == 'P_hood')
        K.bake_ao_open(meshes, [(hood, panels['P_hood']['axis'], panels['P_hood']['open_deg'])],
                       ST.box('elephant', (D['xr'] - 0.05, -(D['hw'] - 0.01), 0.25), (IN.FIREWALL_X + 0.06, D['hw'] - 0.01, IN.DECK_Z + 0.02)), samples=32, distance=0.35)
        print('[elephant] AO', round(time.time() - t0, 1), 's')
        # the dial faces once more without the needles over them
        K.rebake_mats(o_int, [o for o in meshes if o.name.startswith('N_')], ('gauge',), samples=32, distance=0.35)
    K.join_white(o_int, dial_glass)
    tris = {o.name: mc.triangles([o]) for o in meshes}
    total = sum(tris.values())
    print('[elephant] grime masks', K.mask_frame(meshes))
    mc.export_glb(OUT_GLB, meshes + empties)
    mc.mounts_json(OUT_JSON, 'elephant', ST.map_json('elephant', json_extra(objs, panels, needles, wipers, tris, total)))
    print('[elephant] exported', round(time.time() - t0, 1), 's')
    if not no_preview:
        previews(quick)
    print('[elephant] done', round(time.time() - t0, 1), 's')


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
    p, n = S.SIDE.to3d(np.array([[D['xf'] - 0.42, 1.56]]))
    return p[0]


def mounts(ex, panels):
    E = []
    hz = D['hub_z']
    for name, x, y, front, side in (('hub_FL', D['ax_f'], D['track_f'] / 2, True, -1), ('hub_FR', D['ax_f'], -D['track_f'] / 2, True, 1),
                                    ('hub_RL', D['ax_r'], D['track_r'] / 2, False, -1), ('hub_RR', D['ax_r'], -D['track_r'] / 2, False, 1)):
        E.append(mount(name, (x, y, hz), dict(cat='rim', axle='front' if front else 'rear', steer=front, driven=not front,
                                               handbrake=not front, side=side, hub_face=round(abs(y) + 0.010, 4), wheel_r=D['wheel_r'])))
    E.append(mount('engine', IN.ENGINE, dict(cat='engine', space_min=[-0.53, -0.38, 0.0], space_max=[0.61, 0.38, 0.95],
                                             note='at the back under the bed, behind the rear axle, yawed 180 deg: its fan and pulley (+x) '
                                                  'towards the lid, its flywheel towards the gearbox'),
                   rot=rot_z(180.0)))
    # the radiator at the back of the bay behind the engine, its core to the engine lid's louvres (yawed 180 deg)
    E.append(mount('radiator', (D['xr'] + 0.13, 0.0, 0.58), dict(cat='radiator', space_min=[-0.15, -0.43, 0.0], space_max=[0.05, 0.43, 0.68],
                                                                   note='at the back of the bay behind the engine, facing the lid'),
                   rot=rot_z(180.0)))
    E.append(mount('gearbox', IN.GEARBOX, dict(cat='gearbox', space_min=[-0.31, -0.14, 0.0], space_max=[0.215, 0.14, 0.235],
                                               note='rear transaxle: ahead of the rear axle, yawed 180 deg (its bell towards the differential '
                                                    'and the engine behind it)'),
                   rot=rot_z(180.0)))
    E.append(mount('battery', IN.BATTERY, dict(cat='battery', space_min=[-0.19, -0.11, 0.0], space_max=[0.19, 0.11, 0.26],
                                               note='on a tray at the front of the cab, between the footwells')))
    E.append(mount('houseBattery', IN.HOUSE_BATTERY, dict(cat='houseBattery', space_min=[-0.26, -0.13, 0.0], space_max=[0.26, 0.13, 0.26],
                                                         note='the house battery: on the floor in the dinette\'s footwell, by the wall')))
    E.append(mount('fuelTank', IN.TANK, dict(cat='fuelTank', space_min=[-0.53, -0.42, 0.0], space_max=[0.56, 0.42, 0.43],
                                             note='under the floor between the rails, yawed 180 deg: the filler neck of the tank part (+z) '
                                                  'points to the flap on the left'),
                   rot=rot_z(180.0)))
    E.append(mount('exhaust', (D['xr'] + 0.10, -0.80, 0.33), dict(cat='exhaust', tail=[-1.61, 0.05, -0.07],
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
    zf = 0.62
    xb = float(S.FRONT.to3d(np.array([[0.0, zf]]))[0][0][0])
    E.append(mount('bumperFront', (xb + 0.005, 0.0, zf), dict(cat='bumperFront', fit=[0.14, 2.30, 0.18])))
    zr = 0.58
    xr = float(S.REAR.to3d(np.array([[0.0, zr]]))[0][0][0])
    E.append(mount('bumperRear', (xr - 0.005, 0.0, zr), dict(cat='bumperRear', fit=[0.14, 2.30, 0.18])))
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
        E.append(mount('armor_' + sname, (0.10, side * (D['hw'] + 0.003), 0.95), dict(cat='armor', side=-side, fit=[3.9, 0.05, 0.62], fit_anchor='center')))
    # the roof: a rack or a solar panel over the room (its middle; the ladder up the side to it)
    E.append(mount('roof', (-0.60, 0.0, D['roof_z'] + D['roof_crown']), dict(cat='roof', fit=[3.2, 2.0, 0.2], fit_anchor='center')))
    E.append(mount('horn', (D['xf'] - 0.10, -0.30, 0.80), dict(cat='horn', on='inside the nose behind the louvres')))
    E.append(mount('radio', (IN.DASH_FACE_X - 0.012, 0.0, IN.DASH_TOP - 0.088), dict(cat='radio', slot=[0.18, 0.046], slot_depth=0.06)))
    E.append(mount('handbrake', (IN.SEAT_X - 0.06, 0.0, IN.CONSOLE_TOP), dict(cat='handbrake', note='on the console between the seats')))
    E.append(mount('gearLever', (IN.GEAR_X, 0.0, IN.CONSOLE_TOP + 0.014), dict(cat='gearLever', note='on the console ahead of the seats')))
    p_, d_ = IN.steering_mount()
    pi_ = p_ + d_ * 0.12 + np.array([0.0, -0.045, 0.0])
    E.append(mount('ignition', tuple(pi_), dict(cat='ignition', on='steering column shroud, right side')))
    return E


def json_extra(objs, panels, needles, wipers, tris, total):
    from frames._sedan_build import json_extra as je
    out = je(objs, panels, needles, wipers, tris, total)
    out['eye_default'] = game_vec(np.array(IN.EYE))
    # the room's plan (game frame: x along, z across = -y): the floor between the furniture, the bed's top, the
    # galley's worktop and the cubby under its sink, the dinette's table and benches, the fridge's niche — for the walk
    # areas, the bed and the places for things (core/modcar/aboard.ts, cargo.ts)
    z = lambda y0, y1: sorted([round(-y0, 3), round(-y1, 3)])  # noqa: E731
    out['room'] = dict(floor_y=IN.FLOOR_Z, x=[IN.BED_X1, IN.ROOM_FRONT_X], aisle_z=z(IN.DIN_Y, -IN.IN_Y),
                       bed=dict(x=[D['xr'] + 0.05, IN.BED_X1], z=z(IN.IN_Y, -IN.IN_Y), top=IN.BED_TOP),
                       galley=dict(x=[IN.GALLEY_X0, IN.GALLEY_X1], z=z(IN.IN_Y, IN.GALLEY_Y), top=IN.WORKTOP_Z, sink_x=IN.SINK_X),
                       table=dict(x=list(IN.DIN_T), z=z(IN.IN_Y, IN.DIN_Y + 0.04), top=IN.TABLE_Z),
                       benches=dict(x=[list(IN.DIN_A), list(IN.DIN_B)], z=z(IN.IN_Y, IN.DIN_Y), top=IN.BENCH_Z),
                       cubby=dict(x=list(IN.CUBBY_X), z=z(IN.IN_Y - 0.03, IN.GALLEY_Y), floor=IN.CUBBY_Z[0], top=IN.CUBBY_Z[1]),
                       niche=dict(x=[IN.FRIDGE_X[0] + 0.022, IN.FRIDGE_X[1] - 0.022], z=z(-IN.FRIDGE_Y, -IN.IN_Y), floor=IN.PLINTH_Z, top=IN.NICHE_Z),
                       ceiling=IN.CEIL_Z)
    return out


# ============================================================================================ previews
def _srgb(h):
    c = [((h >> k) & 255) / 255.0 for k in (16, 8, 0)]
    return tuple(v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4 for v in c) + (1.0,)


def previews(quick):
    PV.materials()
    # the factory colours (palette.ts): Tan below the waist, Ivory above
    for name, hx in (('paint', 0xb9915f), ('paint_b', 0xf4efe2)):
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
    tgt = (0.0, 0, 1.45)
    for name, yaw, pitch, dist in (('f34', 35, 9, 15.5), ('r34', 145, 12, 15.5), ('side_l', 270, 2, 17.5), ('side_r', 90, 2, 17.5),
                                   ('front', 0, 4, 12.0), ('rear', 180, 6, 12.0)):
        PV.orbit(tgt, yaw, pitch, dist, lens=50)
        PV.render(f'{SCRATCH}_{name}.png', res=res, samples=smp)
    PV.orbit((0.0, 0, 1.4), 270, 89.5, 14, ortho=9.0)
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
    PV.camera((D['xr'] - 2.4, -1.6, 1.30), (IN.ENGINE[0], 0.0, 0.75), lens=35)
    PV.render(f'{SCRATCH}_bay.png', res=res, samples=smp)
    back(s)
    s = swing('P_door_FL', (0, 0, 1), -68.0)
    PV.camera((D['cd_x0'] - 0.6, 4.2, 2.0), (D['cd_x0'] + 0.4, 0.4, 1.4), lens=35)
    PV.render(f'{SCRATCH}_open_door_FL.png', res=res, samples=smp)
    back(s)
    s = swing('P_door_side', (0, 0, 1), 95.0)
    PV.camera((0.4, -4.4, 2.0), (1.0, 0.0, 1.4), lens=32)
    PV.render(f'{SCRATCH}_open_door_side.png', res=res, samples=smp)
    back(s)
    # the room from behind the seats looking back; from the bedroom forward; the cab from the dinette
    PV.camera((2.35, -0.10, 2.20), (-2.5, 0.0, 1.45), lens=20)
    PV.render(f'{SCRATCH}_inside_back.png', res=res, samples=smp)
    PV.camera((-1.70, 0.10, 2.10), (2.4, 0.0, 1.35), lens=20)
    PV.render(f'{SCRATCH}_inside_fwd.png', res=res, samples=smp)
    PV.camera((0.90, -0.55, 2.05), (2.4, 0.9, 1.20), lens=24)
    PV.render(f'{SCRATCH}_inside_dinette.png', res=res, samples=smp)
    PV.camera((0.60, 0.45, 2.10), (-1.0, -0.95, 1.05), lens=24)
    PV.render(f'{SCRATCH}_inside_sofa.png', res=res, samples=smp)
    PV.camera((0.70, -0.40, 2.15), (-1.4, 0.95, 1.40), lens=24)
    PV.render(f'{SCRATCH}_inside_galley.png', res=res, samples=smp)
    PV.camera((-1.30, -0.30, 2.30), (-3.6, 0.2, 1.30), lens=22)
    PV.render(f'{SCRATCH}_inside_bed.png', res=res, samples=smp)
    hide(['P_door_FL', 'P_door_FR', 'P_hood', 'P_trunk', 'P_door_side'])
    PV.orbit(tgt, 35, 14, 15.5, lens=50)
    PV.render(f'{SCRATCH}_stripped.png', res=res, samples=smp)
    hide(['P_door_FL', 'P_door_FR', 'P_hood', 'P_trunk', 'P_door_side'], False)
    g = bpy.data.objects.get('preview_ground')
    if g:
        g.hide_render = True
    PV.camera((3.6, -4.6, -2.4), (0.0, 0.0, 0.45), lens=32)
    PV.render(f'{SCRATCH}_under.png', res=res, samples=smp)
    if g:
        g.hide_render = False
