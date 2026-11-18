"""Wagon assembly: builds every object of the frame GLB with its name, origin and material, the mount empties,
the mount JSON, the AO bake, the export and the preview renders. Called from frames/wagon.py main(). Built as
frames/_sedan_build.py is; its plain helpers are shared."""
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
from frames import _wagon_ext as EX  # noqa: E402
from frames import _wagon_inner as IN  # noqa: E402
from frames import wagon as S  # noqa: E402
from frames._sedan_build import game_vec, knuckles, mount, needle, obj_with_origin, plate_buf  # noqa: E402
from lib import modcar as mc  # noqa: E402

D = S.D
OUT_GLB = 'public/models/modcar/frames/wagon.glb'
OUT_JSON = 'src/core/modcar/data/mounts/wagon.json'
SCRATCH = 'D:/modcar-scratch/frames/wagon'


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
    print('[wagon] exterior surfaces', round(time.time() - t0, 1), 's')

    # ---------------------------------------------------------------- BODY
    lb_left = ex.lower_body(False)
    lb_right = ex.lower_body(True)
    common = K.Buf()
    common.extend(ex.top_front())
    common.extend(ex.greenhouse())
    common.extend(ex.roof())
    doors = {w: ex.door_skin(w).extend(ex.door_frame(w)) for w in ('F', 'R')}
    eb, pedges = ex.edges()
    common.extend(eb)
    common.extend(ex.opening_details())
    common.extend(IN.engine_bay())
    common.extend(IN.apertures())
    common.extend(IN.load_space())
    common.extend(trims(ex))
    common.extend(ex.greenhouse(-0.03))
    common.extend(aperture_seals(ex))
    left = K.Buf().extend(common).extend(lb_left)
    right = K.Buf().extend(common).extend(lb_right).extend(ex.fuel_details())
    body = K.Buf().extend(left).extend(right.mirrored())
    body.extend(IN.engine_bay_asym())
    o_body = body.to_object('BODY')
    print('[wagon] body', round(time.time() - t0, 1), 's')

    objs = [o_body]
    panels = {}
    # ---------------------------------------------------------------- doors
    gl = ex.glass()
    for w in ('F', 'R'):
        db = doors[w]
        db.extend(pedges['door_' + w])
        db.extend(IN.door_card(ex, w))
        db.extend(IN.door_extras(ex, w))
        db.extend(IN.door_frame_inner(ex, w))
        db.extend(door_seals(ex, w))
        xh = D['fd_front'] if w == 'F' else D['rd_front']
        yh = float(S.side_w(xh, 0.62)) - 0.004
        for side, sname in ((1, 'L'), (-1, 'R')):
            mid = 'door_%s%s' % (w, sname)
            hinge = np.array([xh, side * yh, 0.62])
            buf = db if side > 0 else db.mirrored()
            o = obj_with_origin(buf, 'P_' + mid, hinge)
            gb = gl['door_' + w] if side > 0 else gl['door_' + w].mirrored()
            og = obj_with_origin(gb, 'PG_' + mid, hinge, parent=o)
            objs += [o, og]
            panels['P_' + mid] = dict(mount=mid, glass='PG_' + mid, hinge='z', hinge_pos=hinge, axis=(0, 0, 1),
                                      open_deg=-70.0 * side if w == 'F' else -68.0 * side)
    # ---------------------------------------------------------------- bonnet
    hb = ex.lid('hood')
    hb.extend(pedges['hood'])
    hb.extend(IN.hood_inner(ex))
    hz = float(S.top_z(D['hood_rear'], 0.0)) - 0.02
    hinge = np.array([D['hood_rear'] - 0.008, 0.0, hz])
    objs.append(obj_with_origin(both(hb), 'P_hood', hinge))
    panels['P_hood'] = dict(mount='hood', hinge='y', hinge_pos=hinge, axis=(0, 1, 0), open_deg=-58.0)
    # ---------------------------------------------------------------- tailgate (hinged at the roof) and its glass
    tl, tc = ex.tailgate_details()
    tg = ex.tailgate_lower().extend(ex.tailgate_upper()).extend(pedges['trunk']).extend(tl)
    tg.extend(IN.tailgate_inner(ex))
    tg.extend(tailgate_trims(ex))
    tc.extend(plate_buf((ex.plate_x - 0.001, 0.0, 0.532), (-1.0, 0.0, 0.0), (0.0, 0.0, 1.0), 0.33, 0.15, '72 E58'))
    tc.extend(rear_wiper(ex))
    zt = float(EX.z_tg_top(0.0))
    thinge = np.array([float(S.rw_x(0.0, zt)) + 0.012, 0.0, zt + 0.006])
    o = obj_with_origin(both(tg, tc), 'P_trunk', thinge)
    og = obj_with_origin(both(gl['tg']), 'PG_trunk', thinge, parent=o)
    objs += [o, og]
    panels['P_trunk'] = dict(mount='trunk', glass='PG_trunk', hinge='y', hinge_pos=thinge, axis=(0, 1, 0), open_deg=86.0)
    # ---------------------------------------------------------------- fuel flap
    ff = ex.fuel_flap().mirrored()
    fhinge = np.array([D['fuel_x'] + 0.052, -float(S.side_w(D['fuel_x'], D['fuel_z'])), D['fuel_z']])
    o = obj_with_origin(ff, 'FUEL_CAP', fhinge)
    objs.append(o)
    panels['FUEL_CAP'] = dict(mount=None, hinge='z', hinge_pos=fhinge, axis=(0, 0, 1), open_deg=85.0)
    # ---------------------------------------------------------------- GLASS
    g = K.Buf()
    for kind in ('ws', 'side'):
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
    for wname, wy, wl in (('WIPER_L', 0.50, 0.47), ('WIPER_R', -0.06, 0.47)):
        wb, info = wiper(wy, wl)
        o = obj_with_origin(wb, wname, info['pivot'], rot=info['rot'])
        objs.append(o)
        wipers[wname] = info
    print('[wagon] objects', round(time.time() - t0, 1), 's')

    # ---------------------------------------------------------------- mounts
    empties = mounts(ex, panels, it)
    objs += knuckles(empties, IN.knuckle)
    # the frame is modelled with its hubs body_drop above the wheel radius and moved down by it: it sits
    # that much lower over its wheels, the hubs stay at the wheel radius above the ground
    drop = D.get('body_drop', 0.0)
    K.drop_all(objs, empties, panels, (needles, wipers), -drop)
    # ---------------------------------------------------------------- AO, export, JSON
    meshes = [o for o in objs if o.type == 'MESH']
    tris = {o.name: mc.triangles([o]) for o in meshes}
    total = sum(tris.values())
    print('[wagon] triangles', total, {k: v for k, v in sorted(tris.items(), key=lambda kv: -kv[1])[:8]})
    if not quick:
        # the bay is baked with the bonnet up, the load space with the tailgate up (the player looks into them so)
        by = {o.name: o for o in meshes}
        bay = ((IN.FIREWALL_X - 0.01, -0.82, -0.05), (IN.RAD_X + 0.10, 0.82, 0.90 - drop))
        load = ((IN.CARGO_X1 - 0.15, -0.86, 0.0), (IN.BOX_X[1] + 0.05, 0.86, 1.45 - drop))
        bake_ao_opens(meshes, [([(by['P_hood'], panels['P_hood'])], bay, ('BODY', 'UNDER')),
                               ([(by['P_trunk'], panels['P_trunk'])], load, ('BODY', 'UNDER', 'INTERIOR'))],
                      samples=32, distance=0.35)
        print('[wagon] AO', round(time.time() - t0, 1), 's')
        # the dial faces once more without the needles over them
        K.rebake_mats(o_int, [o for o in meshes if o.name.startswith('N_')], ('gauge',), samples=32, distance=0.35)
    K.join_white(o_int, dial_glass)
    tris = {o.name: mc.triangles([o]) for o in meshes}
    total = sum(tris.values())
    print('[wagon] grime masks', K.mask_frame(meshes))
    mc.export_glb(OUT_GLB, meshes + empties)
    extra = json_extra(objs, panels, needles, wipers, tris, total)
    mc.mounts_json(OUT_JSON, 'wagon', extra)
    print('[wagon] exported', round(time.time() - t0, 1), 's')
    if not no_preview:
        previews(quick, panels)
    print('[wagon] done', round(time.time() - t0, 1), 's')


def bake_ao_opens(meshes, cases, samples=32, distance=0.35, fade=0.04):
    """Ambient occlusion as mc.bake_ao, then for each case (panels to open, a world box, the objects to bake again)
    a pass with those panels open whose values are kept inside the box (blended over `fade`): K.bake_ao_open
    for more than one opening. The opened panels themselves keep their open pass whole (their insides are seen
    only while they stand open)."""
    mc.bake_ao(meshes, samples=samples, distance=distance)
    by = {o.name: o for o in meshes}
    for opens, region, targets in cases:
        objs = [by[n] for n in targets if n in by]
        saved = {}
        for o in objs:
            a = o.data.color_attributes.get('Col')
            c = np.zeros(len(a.data) * 4)
            a.data.foreach_get('color', c)
            saved[o.name] = c.reshape(-1, 4).copy()
        keep = []
        for (o, info) in opens:
            keep.append((o, o.matrix_world.copy()))
            o.matrix_world = o.matrix_world @ Matrix.Rotation(math.radians(info['open_deg']), 4, Vector(info['axis']))
        bpy.context.view_layer.update()
        mc.bake_ao(objs + [o for (o, _) in opens], samples=samples, distance=distance)
        for (o, m) in keep:
            o.matrix_world = m
        bpy.context.view_layer.update()
        lo, hi = np.asarray(region[0], float), np.asarray(region[1], float)
        for o in objs:
            me = o.data
            a = me.color_attributes.get('Col')
            c = np.zeros(len(a.data) * 4)
            a.data.foreach_get('color', c)
            c = c.reshape(-1, 4)
            vi = np.zeros(len(me.loops), np.int64)
            me.loops.foreach_get('vertex_index', vi)
            co = np.zeros(len(me.vertices) * 3)
            me.vertices.foreach_get('co', co)
            W = np.array(o.matrix_world)
            P = co.reshape(-1, 3) @ W[:3, :3].T + W[:3, 3]
            d = np.linalg.norm(np.maximum(np.maximum(lo - P, P - hi), 0.0), axis=1)
            w = np.clip(1.0 - d / fade, 0.0, 1.0)[vi][:, None]
            a.data.foreach_set('color', (saved[o.name] * (1.0 - w) + c * w).ravel())


# ============================================================================================ trims
def trims(ex):
    """Exterior trims of the left half: drip rail, the windscreen's and the rear side windows' seals and chrome
    reveal mouldings, cowl vent, mirror base, sill strip, the band's chrome edges on the body, the roof rails."""
    b = K.Buf()
    gs = ex.gs
    # drip rail along the roof side over the doors and the rear side window (chrome)
    xs = np.linspace(float(gs.a_edge_x(D['rail_z'])) + 0.06, float(EX.x_dside(D['rail_z'])) + 0.03, 36)
    P, N = S.SIDE_G.to3d(np.stack([xs, np.full(len(xs), D['rail_z'] + 0.016)], 1))
    prof = np.array([(0.0, -0.004), (0.006, -0.004), (0.008, 0.0), (0.008, 0.007), (0.005, 0.009), (0.0, 0.006)])
    V, Nn, T = K.sweep(P, N * 0 + (0, 0, 1), np.stack([-prof[:, 0], prof[:, 1]], 1) * np.array([-1, 1]), closed=False)
    b.add(V, Nn, T, 'chrome')
    # windscreen: rubber seal and chrome reveal moulding along the body edge
    wv = ex.win['ws']
    cen = np.array([float(S.ws_x(0.0, 1.15)) - 0.1, 0.0, 1.15])
    b.extend(window_trim(wv['P'], wv['N'], np.tile(cen, (len(wv['P']), 1)), False))
    # the rear side windows (a closed loop)
    P, Nn = ex.side_win_P
    b.extend(window_trim(P, Nn, np.tile(P.mean(0), (len(P), 1)), True))
    # cowl vent grille in front of the windscreen (slots)
    for k in range(7):
        y = 0.10 + 0.085 * k
        p, n = S.CT.to3d(np.array([[1.115, y]]))
        b.extend(K.box_buf((-0.010, -0.025, -0.004), (0.010, 0.025, 0.0015), 'trim', 0.0, 1, xf=K.mat4_trs(p[0])))
    # mirror base (the mirror part sits on it): a small pad at the A pillar foot
    mp, mn = mirror_mount_point()
    b.extend(K.box_buf((-0.04, -0.012, -0.004), (0.04, 0.004, 0.022), 'trim', 0.006, 2, xf=K.mat4_trs(mp)))
    # sill chrome strip along the rocker (on the body below the doors)
    xs = np.linspace(D['fd_front'], IN.rear_arch_front(0.235) + 0.03, 14)
    P, N = S.SIDE_L.to3d(np.stack([xs, np.full(len(xs), 0.235)], 1))
    prof = np.array([(0.0, -0.008), (0.003, -0.006), (0.004, 0.0), (0.003, 0.006), (0.0, 0.008)])
    V, NN, T = K.sweep(P, (0, 0, 1), np.stack([-prof[:, 0], prof[:, 1]], 1) * np.array([-1, 1]), closed=False)
    b.add(V, NN, T, 'chrome')
    # the band's chrome edges on the body: the front wing's, the rear quarter's
    u0, u1 = ex.band_u
    uf = float(S.u_of_x(D['fd_front'])) - EX.DELTA - 0.006
    ur = float(S.u_of_x(D['rd_rear'])) + EX.DELTA + 0.006
    b.extend(IN.band_strips(ex, u0, uf, ends=False))
    b.extend(IN.band_strips(ex, ur, u1, ends=False))
    for u in (u0, u1):
        b.extend(band_end(ex, u))
    b.extend(roof_rails())
    return b


def band_end(ex, u):
    t0, t1 = ex.band_t
    ts = np.linspace(t0, t1 - 0.0045, 6)
    P, Nn = S.CL.to3d(np.stack([np.full(len(ts), u), ts], 1))
    prof = np.array([(-0.0045, -0.0012), (-0.0032, 0.0016), (0.0, 0.0028), (0.0032, 0.0016), (0.0045, -0.0012)])
    V, N, T = K.sweep(P, Nn, prof, closed=False)
    return K.Buf().add(V, N, T, 'chrome')


def window_trim(P, Nn, ref, closed):
    """A window's rubber seal and the chrome reveal moulding along the body's edge of its opening."""
    b = K.Buf()
    E = EX.side_dir(P, Nn, ref, closed)
    # (the long gentle runs need few points; a closed loop is thinned as the open run back to its start)
    k = K.coarse_idx(np.vstack([P, P[:1]]), 0.0012)[:-1] if closed else K.coarse_idx(P, 0.0012)
    P, Nn, E = P[k], Nn[k], E[k]
    Q = P + E * 0.006 - Nn * 0.004
    prof = np.array([(-0.007, -0.006), (-0.006, 0.003), (0.0, 0.0055), (0.006, 0.003), (0.007, -0.006)])
    V, NN, T = K.sweep(Q, Nn, prof, closed=closed)
    b.add(V, NN, T, 'rubber')
    prof = np.array([(-0.0045, -0.001), (-0.0035, 0.003), (0.0035, 0.003), (0.0045, -0.001)])
    V, NN, T = K.sweep(P + E * 0.0015 + Nn * 0.0005, Nn, prof, closed=closed)
    b.add(V, NN, T, 'chrome')
    return b


ROOF_RAIL_Y = 0.585
ROOF_RAIL_X = (0.12, -2.26)


def roof_rails():
    """A rail along each side of the long roof (black, on four feet with chrome caps): the roof's mount stands
    between them."""
    b = K.Buf()
    x0, x1 = ROOF_RAIL_X
    y = ROOF_RAIL_Y
    xs = np.linspace(x0, x1, 14)
    zr = np.array([float(S.roof_z(x, y)) for x in xs])
    h = 0.048
    path = np.stack([xs, np.full(len(xs), y), zr + h], 1)
    prof = K.round_profile(np.array([(-0.011, -0.008), (0.011, -0.008), (0.011, 0.008), (-0.011, 0.008)]), 0.006, 1)
    prof = np.vstack([prof, prof[:1]])
    V, N, T = K.sweep(path, (0, 0, 1), prof, closed=False, closed_prof=True)
    b.add(V, N, T, 'trim')
    for e, sg in ((0, 1.0), (-1, -1.0)):
        ring = V.reshape(len(path), -1, 3)[e]
        b.extend(K.fill_loop(ring, (sg, 0, 0), 'trim'))
    for x in np.linspace(x0 + 0.06, x1 - 0.06, 4):
        z = float(S.roof_z(x, y))
        b.extend(K.box_buf((x - 0.035, y - 0.016, z - 0.004), (x + 0.035, y + 0.016, z + h - 0.004), 'trim', 0.008, 1))
        b.extend(K.box_buf((x - 0.022, y - 0.0165, z + 0.012), (x + 0.022, y + 0.0165, z + h - 0.016), 'chrome', 0.004, 1))
    return b


def aperture_seals(ex):
    """Rubber seals round the door apertures in the greenhouse and round the tailgate's aperture (on the flange,
    15 mm in)."""
    b = K.Buf()
    for key in ('doorG_F', 'doorG_R', 'tgG', 'tgL'):
        so = ex.cut[key].side('out')
        P = so['P'] - so['N'] * 0.016 + so['E'] * 0.004
        P = K.resample(P, 0.08, closed=False)
        b.extend(K.tube_buf(P, 0.0065, 'rubber', 4))
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


def door_seals(ex, w):
    """A rubber seal round each door's window frame, on its inner band."""
    b = K.Buf()
    si = ex.cut['doorG_' + w].side('in')
    P = si['P'] - si['N'] * 0.02 - si['E'] * 0.006
    b.extend(K.tube_buf(K.resample(P, 0.08, closed=False), 0.006, 'rubber', 4))
    return b


def tailgate_trims(ex):
    """On the tailgate (left half): the glass's seal and reveal moulding, a chrome moulding along the window
    frame's foot (the junction across the gate)."""
    b = K.Buf()
    wv = ex.win['tg']
    cen = np.array([float(S.rw_x(0.0, 1.15)) + 0.1, 0.0, 1.15])
    b.extend(window_trim(wv['P'], wv['N'], np.tile(cen, (len(wv['P']), 1)), False))
    s = ex.cut['tgL'].side('in')
    uv, P, NL, NG, _ = ex.jl.between(float(s['uv'][0, 0]) + 0.004, S.L_GUIDE.length)
    P = K.resample(P, 0.07, closed=False)
    prof = K.round_profile(np.array([(0.010, -0.002), (0.010, 0.006), (0.002, 0.013), (-0.008, 0.013), (-0.010, 0.004), (-0.010, -0.002)]), 0.004, 1)
    up = np.tile((0.0, 0.0, 1.0), (len(P), 1))
    V, N, T = K.sweep(P, up, prof, closed=False)
    b.add(V, N, T, 'chrome')
    b.extend(K.fill_loop(V.reshape(len(P), -1, 3)[0], (0, 1, 0), 'chrome'))
    return b


def rear_wiper(ex):
    """The tailgate's wiper, parked along the bottom of its glass (centre, not mirrored)."""
    b = K.Buf()
    ch = EX.tg_frame()
    wv = ex.win['tg']
    s0 = float(wv['uv'][-1, 1]) + 0.022
    pv, nv = ch.to3d(np.array([[0.0, s0]]))
    p = pv[0] + nv[0] * 0.004
    R = K.frame_from((0, 1, 0), nv[0])
    V, N, T = K.lathe(np.array([(0.0, 0.024), (0.011, 0.022), (0.015, 0.011), (0.016, 0.0)])[::-1], (0, 0, 0), (0, 0, 1), 14)
    w = K.Buf().add(V, N, T, 'trim')
    w.extend(K.tube_buf(np.array([(0.0, 0.0, 0.02), (0.05, 0.0, 0.026), (0.40, 0.0, 0.026)]), 0.004, 'trim', 6))
    w.extend(K.box_buf((0.04, -0.007, 0.010), (0.41, 0.007, 0.018), 'trim', 0.003, 1))
    w.extend(K.box_buf((0.03, -0.0035, 0.0), (0.42, 0.0035, 0.010), 'rubber', 0.002, 1))
    Vw, Nw, Tw, Mw = w.arrays()
    b.add(Vw @ R.T + p, Nw @ R.T, Tw, 'trim')
    b.M = list(Mw)
    return b


def mirror_mount_point():
    p, n = S.CT.to3d(np.array([[D['fd_front'] + 0.072, 0.82]]))
    return p[0], n[0]


# ============================================================================================ wipers
def wiper(y_pivot, length):
    """Wiper arm + blade resting along the windscreen base, pointing to -Y. Local Z = glass normal."""
    zj = 0.95
    p = np.array([float(S.ws_x(abs(y_pivot), zj)) + 0.045, y_pivot, zj - 0.015])
    q, n = S.CT.to3d(np.array([[p[0], p[1]]]))
    p = q[0] + n[0] * 0.004
    nrm = K.unit(np.array([math.sin(S._WR), 0.0, math.cos(S._WR)]))
    rest = np.array([0.0, -1.0, 0.0])
    rest = K.unit(rest - nrm * np.dot(rest, nrm))
    R = K.frame_from(rest, nrm)
    b = K.Buf()
    V, N, T = K.lathe(np.array([(0.0, 0.026), (0.012, 0.024), (0.016, 0.012), (0.017, 0.0)])[::-1], (0, 0, 0), (0, 0, 1), 16)
    b.add(V, N, T, 'trim')
    arm = np.array([(0.0, 0.0, 0.022), (0.06, 0.0, 0.03), (length, 0.0, 0.03)])
    b.extend(K.tube_buf(arm, 0.0045, 'trim', 6))
    b.extend(K.box_buf((0.04, -0.008, 0.012), (length + 0.02, 0.008, 0.02), 'trim', 0.003, 1))
    b.extend(K.box_buf((0.03, -0.004, 0.0), (length + 0.03, 0.004, 0.012), 'rubber', 0.002, 1))
    Vw, Nw, Tw, Mw = b.arrays()
    out = K.Buf()
    out.add(Vw @ R.T + p, Nw @ R.T, Tw, 'trim')
    out.M = list(Mw)
    return out, dict(pivot=p, rot=R, normal=nrm, rest=rest, sweep_deg=-95.0, axis_local='y')


# ============================================================================================ mounts
def mounts(ex, panels, it):
    E = []
    hz = D['hub_z']
    for name, x, y, front, side in (('hub_FL', D['ax_f'], D['track_f'] / 2, True, -1), ('hub_FR', D['ax_f'], -D['track_f'] / 2, True, 1),
                                    ('hub_RL', D['ax_r'], D['track_r'] / 2, False, -1), ('hub_RR', D['ax_r'], -D['track_r'] / 2, False, 1)):
        E.append(mount(name, (x, y, hz), dict(cat='rim', axle='front' if front else 'rear', steer=front, driven=not front,
                                               handbrake=not front, side=side, hub_face=round(abs(y) + 0.010, 4), wheel_r=D['wheel_r'])))
    # the bay: a longitudinal straight six between the firewall and the radiator (eng_i6: 0.81 x 0.65 x 0.53)
    E.append(mount('engine', (IN.ENGINE_X, 0.0, 0.20), dict(cat='engine', space_min=[-0.44, -0.30, 0.0], space_max=[0.40, 0.30, 0.67])))
    E.append(mount('gearbox', (IN.FIREWALL_X - 0.23, 0.0, 0.30), dict(cat='gearbox', space_min=[-0.30, -0.13, 0.0], space_max=[0.24, 0.13, 0.22])))
    E.append(mount('radiator', IN.RADIATOR, dict(cat='radiator', space_min=[-0.07, -0.34, 0.0], space_max=[0.035, 0.34, 0.40])))
    E.append(mount('battery', IN.BATTERY, dict(cat='battery', space_min=[-0.14, -0.10, 0.0], space_max=[0.14, 0.10, 0.24])))
    E.append(mount('fuelTank', (-1.95, 0.0, 0.215), dict(cat='fuelTank', space_min=[-0.26, -0.42, 0.0], space_max=[0.24, 0.42, 0.16])))
    E.append(mount('exhaust', (IN.ENGINE_X - 0.29, -0.16, 0.25), dict(cat='exhaust', tail=[-3.75, -0.26, -0.01], route='under floor, right of the tunnel')))
    p, d = IN.steering_mount()
    E.append(mount('steering', tuple(p), dict(cat='steering', column_deg=24.0), rot=K.frame_from(d, (math.sin(math.radians(24)), 0, math.cos(math.radians(24))))))
    # seat mounts at the floor attachment (the seat part's origin), floor_z repeated for the game
    for name, x, y, drv in (('seat_driver', IN.SEAT_X, IN.DRIVER_Y, True), ('seat_pass', IN.SEAT_X, -IN.DRIVER_Y, False), ('seat_rear', IN.REAR_SEAT_X, 0.0, False)):
        z = IN.FLOOR_Z + (0.035 if name != 'seat_rear' else 0.0)
        E.append(mount(name, (x, y, z), dict(cat='seat', driver=drv, floor_z=round(z, 4), cushion_z=0.48,
                                              side=0 if name == 'seat_rear' else (-1 if y > 0 else 1))))
    for pname, info in panels.items():
        if info['mount'] is None:
            continue
        m = info['mount']
        cat = 'door' if m.startswith('door') else m
        side = 0
        if m.startswith('door'):
            side = -1 if m.endswith('L') else 1
        E.append(mount(m, tuple(info['hinge_pos']), dict(cat=cat, panel=pname, hinge=info['hinge'], open_deg=info['open_deg'], side=side)))
    # bumpers (stretch: fit = [length, width, height], box centred on the mount)
    xb = float(S.front_x(0.0, 0.43))
    E.append(mount('bumperFront', (xb + 0.005, 0.0, 0.43), dict(cat='bumperFront', fit=[0.13, 1.76, 0.12])))
    xr = float(S.rear_x(0.0, 0.365))
    E.append(mount('bumperRear', (xr - 0.005, 0.0, 0.365), dict(cat='bumperRear', fit=[0.13, 1.76, 0.12])))
    c3, n3 = ex.lamp_mount
    tp, tn = ex.tail_mount
    mp, mn = mirror_mount_point()
    for side, sname in ((1, 'L'), (-1, 'R')):
        E.append(mount('headlight_' + sname, (c3[0], side * c3[1], c3[2]), dict(cat='headlight', side=-side, recess='rect', recess_w=D['hl_w'],
                                                                                 recess_h=round(D['lamp_h'] - 0.008, 4), recess_depth=0.07)))
        E.append(mount('taillight_' + sname, (tp[0], side * tp[1], tp[2]), dict(cat='taillight', side=-side, recess='rect',
                                                                                 recess_w=round(D['tail_y1'] - D['tail_y0'], 4),
                                                                                 recess_h=round(D['tail_z1'] - D['tail_z0'], 4), recess_depth=0.045)))
        E.append(mount('mirror_' + sname, (mp[0], side * mp[1], mp[2] + 0.02), dict(cat='mirror', side=-side)))
        # side armour: a fit box along the doors, on the body side at door height
        xm = 0.5 * (D['fd_front'] + D['rd_rear'])
        E.append(mount('armor_' + sname, (round(xm, 4), side * (D['hw'] + 0.025), 0.57),
                       dict(cat='armor', side=-side, fit=[round(D['fd_front'] - D['rd_rear'] + 0.04, 3), 0.05, 0.52], fit_anchor='center')))
    # the roof's mount between the roof rails, over the middle of the long roof (a roof rack's length)
    xm = 0.5 * (ROOF_RAIL_X[0] + ROOF_RAIL_X[1])
    E.append(mount('roof', (round(xm, 4), 0.0, round(float(S.roof_z(xm, 0.0)) + 0.012, 4)), dict(cat='roof', fit=[1.90, 1.10, 0.15], fit_anchor='center')))
    E.append(mount('horn', IN.HORN, dict(cat='horn')))
    E.append(mount('radio', (IN.DASH_FACE_X, 0.0, IN.RADIO_Z), dict(cat='radio', slot=[0.18, 0.046], slot_depth=0.06)))
    E.append(mount('handbrake', (IN.HB_X, 0.0, IN.tunnel_h(IN.HB_X) + 0.055), dict(cat='handbrake')))
    E.append(mount('gearLever', (IN.GEAR_X, 0.0, IN.tunnel_h(IN.GEAR_X) + 0.067), dict(cat='gearLever')))
    p_, d_ = IN.steering_mount()
    pi_ = p_ + d_ * 0.12 + np.array([0.0, -0.043, 0.0])
    E.append(mount('ignition', tuple(pi_), dict(cat='ignition', on='steering column shroud, right side')))
    return E


def json_extra(objs, panels, needles, wipers, tris, total):
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
    eye = np.array(IN.EYE) + (0.0, 0.0, -D.get('body_drop', 0.0))
    return dict(panels=ps, needles=ns, wipers=ws, eye_default=game_vec(eye), bbox=bb,
                triangles=dict(total=total, **tris), units='metres, game frame (+x forward, +y up, +z right)',
                notes='hinge: Blender-local axis name (z = vertical door hinge, y = transverse lid hinge); hinge_axis: '
                      'the same axis in the game frame; a rotation of open_deg about hinge_axis (right hand) opens the panel '
                      '(the tailgate is hinged at the roof). Needles and wipers turn about their local +y (game) = Blender local +Z.')


# ============================================================================================ previews
def open_panel(name, panels, amount=1.0):
    """Swing a panel (and its glass, parented) open about its hinge; returns its matrix to restore."""
    o = bpy.data.objects.get(name)
    info = panels.get(name)
    if o is None or info is None:
        return None
    m = o.matrix_world.copy()
    o.matrix_world = m @ Matrix.Rotation(math.radians(info['open_deg'] * amount), 4, Vector(info['axis']))
    return (o, m)


def previews(quick, panels):
    os.makedirs(SCRATCH, exist_ok=True)
    PV.materials()
    PV.scene_setup('anime')
    res = (1280, 720)
    smp = 24 if quick else 48
    drop = D.get('body_drop', 0.0)
    shots = [('f34', 35, 9, 8.8), ('r34', 145, 11, 8.8), ('side_l', 270, 2, 9.8), ('side_r', 90, 2, 9.8), ('front', 0, 4, 7.4), ('rear', 180, 6, 7.4)]
    for name, yaw, pitch, dist in shots:
        PV.orbit((-0.18, 0, 0.68), yaw, pitch, dist, lens=50)
        PV.render(f'{SCRATCH}/{name}.png', res=res, samples=smp)
    PV.orbit((-0.18, 0, 0.6), 270, 89.5, 9, ortho=5.4)
    PV.render(f'{SCRATCH}/top.png', res=(1400, 720), samples=16)
    # the driver's eye
    eye = Vector(IN.EYE) + Vector((0.0, 0.0, -drop))
    PV.camera(tuple(eye), tuple(eye + Vector((1.0, -0.02, -0.12))), lens=24)
    PV.render(f'{SCRATCH}/driver.png', res=res, samples=smp)
    PV.camera(tuple(eye + Vector((0.05, -0.37, 0.0))), tuple(eye + Vector((-1.0, -0.40, -0.25))), lens=22)
    PV.render(f'{SCRATCH}/cabin_rear.png', res=res, samples=smp)

    def hide(names, h=True):
        for n in names:
            o = bpy.data.objects.get(n)
            if o:
                o.hide_render = h
                for c in o.children:
                    c.hide_render = h
    # the bay with the bonnet open
    keep = open_panel('P_hood', panels)
    PV.camera((3.3, 1.2, 1.85), (1.45, 0.0, 0.62), lens=40)
    PV.render(f'{SCRATCH}/bay.png', res=res, samples=smp)
    # (straight down into the bay: the long bonnet, opened, would stand in the way)
    hide(['P_hood'])
    PV.camera((1.45, 0.0, 2.6), (1.45, 0.0, 0.5), lens=30)
    PV.render(f'{SCRATCH}/bay_top.png', res=res, samples=smp)
    hide(['P_hood'], False)
    keep[0].matrix_world = keep[1]
    # the doors open
    keeps = [open_panel(n, panels) for n in ('P_door_FL', 'P_door_RL')]
    PV.camera((0.9, 3.0, 1.3), (-0.3, 0.3, 0.7), lens=36)
    PV.render(f'{SCRATCH}/open_doors.png', res=res, samples=smp)
    for k in keeps:
        k[0].matrix_world = k[1]
    # the tailgate open, the load space through it
    keep = open_panel('P_trunk', panels)
    PV.camera((-5.2, 2.6, 2.0), (-2.2, 0.0, 0.85), lens=35)
    PV.render(f'{SCRATCH}/open_tailgate.png', res=res, samples=smp)
    PV.camera((-4.1, 0.0, 1.35), (-1.6, 0.0, 0.62), lens=32)
    PV.render(f'{SCRATCH}/load_space.png', res=res, samples=smp)
    keep[0].matrix_world = keep[1]
    hide(['P_door_FL', 'P_door_RL', 'P_door_FR', 'P_door_RR', 'P_hood', 'P_trunk'])
    PV.orbit((-0.18, 0, 0.68), 35, 12, 8.8, lens=50)
    PV.render(f'{SCRATCH}/stripped.png', res=res, samples=smp)
    hide(['P_door_FL', 'P_door_RL', 'P_door_FR', 'P_door_RR', 'P_hood', 'P_trunk'], False)
    g = bpy.data.objects.get('preview_ground')
    if g:
        g.hide_render = True
    PV.camera((3.4, -3.6, -2.2), (-0.35, 0.0, 0.25), lens=30)
    PV.render(f'{SCRATCH}/under.png', res=res, samples=smp)
    PV.camera((-0.18, 0.0, -4.0), (-0.18, 0.001, 0.3), ortho=5.4)
    PV.render(f'{SCRATCH}/under_flat.png', res=(1400, 720), samples=16)
    if g:
        g.hide_render = False
