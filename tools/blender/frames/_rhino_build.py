"""Rhino assembly: objects, origins, mounts, JSON, AO, export and previews. Called from frames/rhino.py main()."""
import math
import os
import sys
import time

sys.dont_write_bytecode = True

import bpy  # noqa: E402
import numpy as np  # noqa: E402
from mathutils import Vector  # noqa: E402

from frames import _kit as K  # noqa: E402
from frames import _preview as PV  # noqa: E402
from frames import _rhino_box as BX  # noqa: E402
from frames import _rhino_ext as EX  # noqa: E402
from frames import _rhino_inner as IN  # noqa: E402
from frames import rhino as S  # noqa: E402
from frames._sedan_build import game_vec, knuckles, mount, needle, obj_with_origin  # noqa: E402
from frames._sedan_inner import smooth_path  # noqa: E402
from lib import modcar as mc  # noqa: E402

D = S.D
ER = S.ER
OUT_GLB = 'public/models/modcar/frames/rhino.glb'
OUT_JSON = 'src/core/modcar/data/mounts/rhino.json'
SCRATCH = 'D:/modcar-scratch/frames/rhino/rhino'
# the preview's colours (the factory's are palette.ts's): a deep slate-teal cab and box, a sand canvas and roof
PREVIEW_PAINT = (0x3d6467, 0xd2c096)


# the longest edge left on the box, the bay's and the cab's boxes (and under the truck) for the AO bake
AO_STEP = 0.30
AO_STEP_BOX = 0.40
AO_STEP_UNDER = 0.40


def both(left, centre=None):
    b = K.Buf()
    b.extend(left)
    b.extend(left.mirrored())
    if centre is not None:
        b.extend(centre)
    return b


def build(args):
    t0 = time.time()
    quick = '--quick' in args
    no_preview = '--no-preview' in args
    mc.reset_scene()
    ex = EX.Exterior()
    print('[rhino] exterior surfaces', round(time.time() - t0, 1), 's')
    # ---------------------------------------------------------------- BODY
    left = K.Buf()
    left.extend(ex.lower_body())
    left.extend(ex.top_front())
    left.extend(ex.greenhouse())
    left.extend(ex.roof())
    left.extend(ex.greenhouse(-0.03))
    door = ex.door_skin().extend(ex.door_frame())
    eb, pedges = edges(ex)
    left.extend(eb)
    left.extend(opening_details(ex))
    # (the long boxes split up: the AO is baked per corner, see BX.dense)
    left.extend(BX.dense(IN.engine_bay(), AO_STEP))
    left.extend(BX.dense(trims(ex), AO_STEP))
    left.extend(BX.dense(BX.box_left(), AO_STEP_BOX))
    left.extend(BX.tilt_left())
    right = K.Buf().extend(left).extend(BX.fuel_pocket())
    body = K.Buf().extend(left).extend(right.mirrored())
    body.extend(BX.dense(IN.engine_bay_asym(), AO_STEP))
    body.extend(BX.dense(centre_trims(ex), AO_STEP))
    body.extend(BX.dense(BX.box_centre(), AO_STEP))
    body.extend(BX.dense(BX.tilt_centre(), AO_STEP))
    objs = [body.to_object('BODY')]
    print('[rhino] body', round(time.time() - t0, 1), 's')
    panels = {}
    # ---------------------------------------------------------------- doors (hinged at the A pillar's foot)
    gl = ex.glass()
    door.extend(pedges['door'])
    door.extend(IN.door_card(ex))
    door.extend(IN.door_extras(ex))
    door.extend(IN.door_frame_inner(ex))
    yh = float(S.side_w(D['fd_front'], 1.2)) - 0.004
    for side, sname in ((1, 'L'), (-1, 'R')):
        mid = 'door_F' + sname
        hinge = np.array([D['fd_front'] + 0.004, side * yh, 1.25])
        buf = door if side > 0 else door.mirrored()
        o = obj_with_origin(buf, 'P_' + mid, hinge)
        gb = gl['door'] if side > 0 else gl['door'].mirrored()
        og = obj_with_origin(gb, 'PG_' + mid, hinge, parent=o)
        objs += [o, og]
        panels['P_' + mid] = dict(mount=mid, glass='PG_' + mid, hinge='z', hinge_pos=hinge, axis=(0, 0, 1), open_deg=-70.0 * side)
    # ---------------------------------------------------------------- bonnet, tailgate, fuel flap
    hb = ex.hood()
    hb.extend(pedges['hood'])
    hb.extend(IN.hood_inner(ex))
    hb.extend(hood_details())
    hinge = np.array([D['hood_rear'] - 0.008, 0.0, 1.535])
    objs.append(obj_with_origin(both(hb), 'P_hood', hinge))
    panels['P_hood'] = dict(mount='hood', hinge='y', hinge_pos=hinge, axis=(0, 1, 0), open_deg=-55.0)
    thinge = BX.tailgate_hinge()
    objs.append(obj_with_origin(BX.dense(BX.tailgate(), AO_STEP), 'P_trunk', thinge))
    panels['P_trunk'] = dict(mount='trunk', hinge='y', hinge_pos=thinge, axis=(0, 1, 0), open_deg=-90.0)
    ff = BX.fuel_flap().mirrored()
    fx, fz, fr = BX.FUEL
    fhinge = np.array([fx + fr + 0.001, -(BX.BW + 0.002), fz])
    objs.append(obj_with_origin(ff, 'FUEL_CAP', fhinge))
    panels['FUEL_CAP'] = dict(mount=None, hinge='z', hinge_pos=fhinge, axis=(0, 0, 1), open_deg=85.0)
    # ---------------------------------------------------------------- GLASS, UNDER, INTERIOR
    g = K.Buf()
    for kind in ('ws', 'rear'):
        g.extend(gl[kind])
        g.extend(gl[kind].mirrored())
    objs.append(g.to_object('GLASS'))
    objs.append(both(BX.dense(IN.underbody(), AO_STEP_UNDER), BX.dense(IN.centre_under(), AO_STEP_UNDER)).to_object('UNDER'))
    it = IN.interior(ex)
    it['L'], it['C'] = BX.dense(it['L'], AO_STEP), BX.dense(it['C'], AO_STEP)
    # the dial glass stays out of the AO bake (it would bake the gauge faces and the needles behind it black);
    # it is joined into INTERIOR after the bake
    ib, dial_glass = K.split_mat(both(it['L'], it['C']), ('glass',))
    o_int = ib.to_object('INTERIOR')
    objs.append(o_int)
    needles = {}
    for gdesc in it['gauges']:
        nb, info = needle(gdesc)
        rot = K.frame_from(info['rest'], gdesc['normal'])
        objs.append(obj_with_origin(nb, gdesc['name'], gdesc['center'], rot=rot))
        needles[gdesc['name']] = info
    wipers = {}
    for wname, wy, wl in (('WIPER_L', 0.84, 0.66), ('WIPER_R', 0.08, 0.66)):
        wb, info = wiper(wy, wl)
        objs.append(obj_with_origin(wb, wname, info['pivot'], rot=info['rot']))
        wipers[wname] = info
    print('[rhino] objects', round(time.time() - t0, 1), 's')
    empties = mounts(ex, panels)
    objs += knuckles(empties, IN.knuckle)
    meshes = [o for o in objs if o.type == 'MESH']
    tris = {o.name: mc.triangles([o]) for o in meshes}
    total = sum(tris.values())
    print('[rhino] triangles', total, {k: v for k, v in sorted(tris.items(), key=lambda kv: -kv[1])[:10]})
    if not quick:
        # the bay is baked with the bonnet up (the tutorial looks into it with the bonnet open)
        hood = next(o for o in meshes if o.name == 'P_hood')
        K.bake_ao_open(meshes, [(hood, panels['P_hood']['axis'], panels['P_hood']['open_deg'])],
                       ((IN.DOG_X - 0.01, -1.0, 0.60), (IN.RAD_X + 0.10, 1.0, 1.56)), samples=32, distance=0.45)
    if not quick:
        # the dial faces once more without the needles over them
        K.rebake_mats(o_int, [o for o in meshes if o.name.startswith('N_')], ('gauge',), samples=32, distance=0.45)
    K.join_white(o_int, dial_glass)
    tris = {o.name: mc.triangles([o]) for o in meshes}
    total = sum(tris.values())
    print('[rhino] grime masks', K.mask_frame(meshes))
    mc.export_glb(OUT_GLB, meshes + empties)
    mc.mounts_json(OUT_JSON, 'rhino', json_extra(objs, panels, needles, wipers, tris, total))
    print('[rhino] exported', round(time.time() - t0, 1), 's')
    if not no_preview:
        previews(quick)
    print('[rhino] done', round(time.time() - t0, 1), 's')


# ============================================================================================ edges
def roll(P, N, E, *a, closed=True, tol=0.0006, **kw):
    """K.roll_edge on a cut's boundary thinned out where it runs straight (points within tol of the chord dropped:
    the region's own boundary keeps them, the gap is far under a millimetre)."""
    P, N, E = np.asarray(P, float), np.asarray(N, float), np.asarray(E, float)
    if closed:
        k = K.coarse_idx(np.vstack([P, P[:1]]), tol)
        k = k[k < len(P)]
    else:
        k = K.coarse_idx(P, tol)
    return K.roll_edge(P[k], N[k], E[k], *a, closed=closed, **kw)


def nearest(P, ref):
    out = np.empty_like(P)
    for i, p in enumerate(P):
        out[i] = ref[np.argmin(((ref - p) ** 2).sum(1))]
    return out


def edges(ex):
    """Rolled edges of every cut: the body's side (into the gap, a flange) and the panels' (a flange with a hem)."""
    body = K.Buf()
    panels = {}
    op = ex.opening_out
    E = EX.side_dir(op['P'], op['N'], nearest(op['P'], ex.cut['doorL'].P), False)
    V, N, T = roll(op['P'], op['N'], E, ER, 0.10, 0.0, 2, closed=False)
    body.add(V, N, T, 'paint')
    s_ = ex.cut['doorL'].side('in')
    V, N, T = roll(s_['P'], s_['N'], s_['E'], ER, 0.10, 0.03, 2, closed=False, hem_segs=0)
    panels['door'] = K.Buf().add(V, N, T, 'paint')
    so = ex.cut['doorG'].side('out')
    V, N, T = roll(so['P'], so['N'], so['E'], ER, 0.032, 0.0, 2, closed=False)
    body.add(V, N, T, 'paint')
    si = ex.cut['doorG'].side('in')
    V, N, T = roll(si['P'], si['N'], si['E'], ER, 0.035, 0.008, 2, closed=False, hem_segs=0)
    panels['door'].add(V, N, T, 'paint')
    for name, (poly, P, Nn) in ex.win_P.items():
        E = EX.side_dir(P, Nn, np.tile(P.mean(0), (len(P), 1)), True)
        V, N, T = roll(P, Nn, E, 0.003, 0.035, 0.0, 2, closed=True)
        panels['door'].add(V, N, T, 'paint')
    c = ex.cut['hood']
    so = c.side('out')
    V, N, T = roll(so['P'], so['N'], so['E'], ER, 0.03, 0.0, 2, closed=False)
    body.add(V, N, T, 'paint')
    si = c.side('in')
    V, N, T = roll(si['P'], si['N'], si['E'], ER, 0.025, 0.008, 2, closed=False, hem_segs=0)
    panels['hood'] = K.Buf().add(V, N, T, 'paint')
    wv = ex.win['ws']
    cen = (float(S.ws_x(0.0, 2.0)) - 0.1, 0.0, 2.0)
    E = EX.side_dir(wv['P'], wv['N'], np.tile(cen, (len(wv['P']), 1)), False)
    V, N, T = roll(wv['P'], wv['N'], E, 0.004, 0.032, 0.0, 2, closed=False)
    body.add(V, N, T, 'paint')
    for (P, N), uv in zip(ex.arch_P, ex.arch_uv):
        keep = uv[:, 1] >= S.L_T[1] - 1e-6
        P, N = P[keep], N[keep]
        cc = np.array([P[:, 0].mean(), P[:, 1].mean(), D['arch_z']])
        E = EX.side_dir(P, N, np.tile(cc, (len(P), 1)), False)
        V, Nn, T = roll(P, N, E, 0.007, 0.045, 0.0, 2, closed=False)
        body.add(V, Nn, T, 'paint')
    # the cab's rear window in its back wall
    rw = ex.rear_win
    E = EX.side_dir(rw['P'], rw['N'], np.tile(rw['P'].mean(0) * (1, 0, 1), (len(rw['P']), 1)), False)
    V, N, T = roll(rw['P'], rw['N'], E, 0.004, 0.035, 0.0, 2, closed=False)
    body.add(V, N, T, 'paint')
    return body, panels


def opening_details(ex):
    """The grille (a dark panel with body-coloured upright bars), the round lamps' buckets with their steel guards,
    the amber indicators under them, the side markers on the wings."""
    b = K.Buf()
    gr = ex.open['grille']
    ref = np.tile([gr['P'][:, 0].mean(), 0.0, 0.5 * (D['grille_z0'] + D['grille_z1'])], (len(gr['P']), 1))
    E = EX.side_dir(gr['P'], gr['N'], ref, False)
    V, N, T = roll(gr['P'], gr['N'], E, 0.005, 0.035, 0.0, 2, closed=False, flange_dir=(-1, 0, 0))
    b.add(V, N, T, 'paint')
    b.extend(grille(ex))
    lp = ex.open['lamp']
    c3 = S.FRONT_L.to3d(np.array([[D['lamp_y'], D['lamp_z']]]))[0][0]
    E = EX.side_dir(lp['P'], lp['N'], np.tile(c3, (len(lp['P']), 1)), True)
    V, N, T = K.roll_edge(lp['P'], lp['N'], E, 0.005, 0.012, 0.0, 2, closed=True, flange_dir=(-1, 0, 0))
    b.add(V, N, T, 'paint')
    ring = V.reshape(-1, len(lp['P']), 3)[-1]
    b.extend(K.ring_tube(ring, (-1, 0, 0), 0.075, 1, 'trim'))
    back = ring - np.array([0.075, 0, 0])
    b.extend(K.fill_loop(back, (1, 0, 0), 'trim'))
    ex.lamp_mount = (c3, lp['N'].mean(0))
    b.extend(lamp_guard(c3))
    # indicators under the lamps, side markers on the wings' sides
    p, n = S.FRONT_L.to3d(np.array([[D['lamp_y'], D['lamp_z'] - 0.20]]))
    b.extend(K.box_buf((-0.012, -0.07, -0.026), (0.006, 0.07, 0.026), 'trim', 0.006, 2, xf=K.mat4_trs(p[0])))
    b.extend(K.box_buf((0.004, -0.062, -0.019), (0.009, 0.062, 0.019), 'lens_amber', 0.004, 1, xf=K.mat4_trs(p[0])))
    p, n = S.SIDE_L.to3d(np.array([[2.42, 1.30]]))
    b.extend(K.box_buf((-0.045, -0.004, -0.02), (0.045, 0.009, 0.02), 'lens_amber', 0.008, 2, xf=K.mat4_trs(p[0])))
    return b


def lamp_guard(c3):
    """A steel guard over a headlamp, clear of the lamp part (it stands 9 cm proud of the face): a ring on four stays
    out of the bucket's rim, three bars across it bowed forward."""
    b = K.Buf()
    xg = c3[0] + 0.135
    rg = 0.124
    a = np.linspace(0, 2 * PI, 33)
    ring = np.stack([np.full(len(a), xg), c3[1] + rg * np.cos(a), c3[2] + rg * np.sin(a)], 1)
    b.extend(K.tube_buf(ring, 0.008, 'trim', 6, closed=False))
    for k in range(4):
        t = PI / 4 + k * PI / 2
        p0 = np.array([c3[0] + 0.004, c3[1] + (rg + 0.006) * math.cos(t), c3[2] + (rg + 0.006) * math.sin(t)])
        p1 = np.array([xg, c3[1] + rg * math.cos(t), c3[2] + rg * math.sin(t)])
        b.extend(K.tube_buf(np.array([p0, p1]), 0.007, 'trim', 6))
    for dy in (-0.06, 0.0, 0.06):
        h = math.sqrt(rg * rg - dy * dy)
        zs = np.linspace(-h, h, 7)
        path = np.stack([xg + 0.018 * (1 - (zs / h) ** 2), np.full(len(zs), c3[1] + dy), c3[2] + zs], 1)
        b.extend(K.tube_buf(path, 0.0055, 'trim', 6))
    return b


def grille(ex):
    b = K.Buf()
    gw, z0, z1 = D['grille_w'], D['grille_z0'], D['grille_z1']
    g = ex.open['grille']['yz']
    loop = np.vstack([g, np.stack([np.zeros(8), np.linspace(z0, z1, 10)[1:-1]], 1)])
    loop2 = K.offset_loop2(K.ccw(loop), 0.004)
    loop2[:, 0] = np.maximum(loop2[:, 0], 0.0)
    pts = K.grid_points(0, gw, z0, z1, 0.08, dt=0.08)
    V, N, T = K.mesh_region(S.FRONT_L, [K.Loop(K.resample(loop2, 0.04))], [], pts, spacing=0.08, level=-0.05)
    b.add(V, -N, T, 'trim')
    # upright bars across the opening (the outer one each side half hidden by the opening's flange)
    bar = np.array([(-0.011, -0.010), (0.007, -0.010), (0.011, -0.006), (0.011, 0.006), (0.007, 0.010), (-0.011, 0.010)])
    bar = np.vstack([bar, bar[:1]])
    for y in np.linspace(0.035, gw - 0.04, 6):
        zs = np.linspace(z0 + 0.005, z1 - 0.005, 3)
        P, _ = S.FRONT_L.to3d(np.stack([np.full(len(zs), y), zs], 1))
        V, N, T = K.sweep(P - np.array([0.028, 0, 0]), (1, 0, 0), bar, closed=False, closed_prof=True)
        b.add(V, N, T, 'paint')
    # a bar across the middle
    ys = np.linspace(0.0, gw - 0.01, 3)
    zm = 0.5 * (z0 + z1)
    P, _ = S.FRONT_L.to3d(np.stack([ys, np.full(len(ys), zm)], 1))
    slat = np.array([(-0.010, -0.014), (0.006, -0.014), (0.010, -0.010), (0.010, 0.010), (0.006, 0.014), (-0.010, 0.014)])
    V, N, T = K.sweep(P - np.array([0.022, 0, 0]), (0, 0, 1), np.vstack([slat, slat[:1]]), closed=False, closed_prof=True)
    b.add(V, N, T, 'paint')
    return b


def trims(ex):
    """Left half: the drip rail round the roof's side and back, the windscreen's and the rear window's rubber seals,
    the mirror's base, the cowl's vent slots, the doors' hinge knuckles, the steps under the door, the grab handles,
    the front mud flap."""
    b = K.Buf()
    # drip rail at drip_z from the A pillar round the rear corner to the middle of the back
    zd = D['drip_z']
    uf = np.linspace(S._GS0[1] + 0.2 * (S._GS0[2] - S._GS0[1]), 1.0, 90)
    x, y, nx, ny = S.g_contour(uf, np.full(len(uf), zd))
    P = np.stack([x, y, np.full(len(uf), zd)], 1)
    Nn = np.stack([nx, ny, np.zeros(len(uf))], 1)
    P[-1, 1] = 0.0
    prof = np.array([(0.0, -0.006), (0.006, -0.006), (0.010, -0.002), (0.010, 0.008), (0.007, 0.011), (0.0, 0.008)])
    k = K.coarse_idx(P, 0.0008)
    V, NN, T = K.sweep(P[k] + Nn[k] * 0.001, (0, 0, 1), np.stack([-prof[:, 0], prof[:, 1]], 1) * np.array([-1, 1]), closed=False)
    b.add(V, NN, T, 'trim')
    # windscreen: rubber seal along the body's edge
    wv = ex.win['ws']
    P, Nn = wv['P'], wv['N']
    cen = np.array([float(S.ws_x(0.0, 2.0)) - 0.1, 0.0, 2.0])
    E = EX.side_dir(P, Nn, np.tile(cen, (len(P), 1)), False)
    k = K.coarse_idx(P, 0.0012)
    P, Nn, E = P[k], Nn[k], E[k]
    prof = np.array([(-0.008, -0.006), (-0.007, 0.004), (0.0, 0.0065), (0.007, 0.004), (0.008, -0.006)])
    V, NN, T = K.sweep(P + E * 0.007 - Nn * 0.004, Nn, prof, closed=False)
    b.add(V, NN, T, 'rubber')
    # the rear window's seal
    rw = ex.rear_win
    P, Nn = rw['P'], rw['N']
    E = EX.side_dir(P, Nn, np.tile(P.mean(0) * (1, 0, 1), (len(P), 1)), False)
    V, NN, T = K.sweep(P + E * 0.007 - Nn * 0.004, Nn, prof, closed=False)
    b.add(V, NN, T, 'rubber')
    # the mirror's base on the waist ledge at the A pillar's foot
    mp = mirror_point()
    b.extend(K.box_buf((-0.04, -0.016, -0.004), (0.04, 0.006, 0.03), 'trim', 0.006, 2, xf=K.mat4_trs(mp)))
    # cowl vent slots ahead of the windscreen
    for k in range(7):
        yy = 0.08 + 0.12 * k
        p, n = S.CT.to3d(np.array([[D['hood_rear'] - 0.022, yy]]))
        b.extend(K.box_buf((-0.010, -0.045, -0.004), (0.010, 0.045, 0.0015), 'trim', 0.003, 1, xf=K.mat4_trs(p[0])))
    # the doors' exposed hinges: knuckles on the body just ahead of the door's front edge
    for zz in IN.HINGE_Z:
        p0, n0 = IN.side_pt(D['fd_front'] + 0.016, zz)
        b.extend(K.cyl_buf(p0 + (0, 0.004, -0.04), p0 + (0, 0.004, 0.04), 0.012, 'trim', 10))
        b.extend(K.box_buf(p0 + (-0.005, -0.004, -0.032), p0 + (0.034, 0.005, 0.032), 'trim', 0.004, 1))
    # the steps under the door, behind the front wheel: two treads between side plates hung from the sill
    x0, x1, yi, yo = STEP
    for x in (x0, x1 - 0.02):
        b.extend(K.box_buf((x, yi, 0.44), (x + 0.02, yo, D['bot_z'] + 0.01), 'trim', 0.004, 1))
    for zt in (0.46, 0.66):
        b.extend(K.box_buf((x0 + 0.02, yi, zt), (x1 - 0.02, yo, zt + 0.022), 'alu', 0.004, 1))
        for kk in range(5):
            xx = x0 + 0.06 + kk * (x1 - x0 - 0.12) / 4
            b.extend(K.box_buf((xx - 0.025, yi + 0.02, zt + 0.022), (xx + 0.025, yo - 0.02, zt + 0.026), 'alu', 0.0, 1))
    # grab handles: up the A pillar beside the door, and on the cab's rear corner
    xa = float(EX.x_aside(1.80)) - 0.03
    for (path, r) in (([(xa, 1.075, 1.66), (xa - 0.01, 1.11, 1.70), (xa - 0.04, 1.105, 2.20), (xa - 0.04, 1.07, 2.25)], 0.013),
                      ([(0.13, 1.096, 1.00), (0.13, 1.13, 1.04), (0.13, 1.13, 1.44), (0.13, 1.096, 1.48)], 0.013)):
        b.extend(K.tube_buf(smooth_path(np.array(path), 1), r, 'chrome', 10))
    # the mud flap behind the front wheel, hung from the sill
    xfl = D['ax_f'] - math.sqrt(D['arch_f'] ** 2 - (D['bot_z'] - D['arch_z']) ** 2) - 0.035
    b.extend(K.box_buf((xfl - 0.012, 0.82, 0.30), (xfl, 1.08, D['bot_z'] + 0.02), 'rubber', 0.004, 2))
    return b


# the cab's steps: x from, x to, inner and outer y (behind the front wheel, under the door)
STEP = (0.40, 0.84, 0.86, 1.08)


def mirror_point():
    p, n = S.CT.to3d(np.array([[D['ws_x'] - 0.03, D['hw'] - 0.03]]))
    return p[0]


def centre_trims(ex):
    """Not mirrored: the rhino's head on the nose (our own mark), the roof hatch, the amber clearance lamps on the
    roof's front, the sun visor over the windscreen on its brackets, the horn's bracket."""
    b = K.Buf()
    # the rhino's head over the grille: a sand face, the big horn up its nose, a small one behind, the ears
    p, n = S.FRONT_L.to3d(np.array([[0.0, D['grille_z1'] + 0.05]]))
    c = p[0] + np.array([0.003, 0, 0])
    head = np.array([(c[0], 0.0, c[2] - 0.034), (c[0], 0.016, c[2] - 0.030), (c[0], 0.024, c[2] - 0.010), (c[0], 0.022, c[2] + 0.012),
                     (c[0], 0.012, c[2] + 0.020), (c[0], -0.012, c[2] + 0.020), (c[0], -0.022, c[2] + 0.012), (c[0], -0.024, c[2] - 0.010),
                     (c[0], -0.016, c[2] - 0.030)])
    b.extend(K.fill_loop(head, (1, 0, 0), 'paint_b'))
    b.extend(K.tube_buf(np.array([(c[0] + 0.002, 0.0, c[2] - 0.022), (c[0] + 0.004, 0.0, c[2] - 0.002), (c[0] + 0.005, 0.0, c[2] + 0.018),
                                  (c[0] + 0.004, 0.0, c[2] + 0.034)]), np.array([0.0075, 0.0065, 0.004, 0.0015]), 'paint_b', 8))
    b.extend(K.tube_buf(np.array([(c[0] + 0.002, 0.0, c[2] + 0.010), (c[0] + 0.003, 0.0, c[2] + 0.026)]), np.array([0.004, 0.0015]), 'paint_b', 6))
    for sy in (1, -1):
        ear = np.array([(c[0] + 0.001, sy * 0.016, c[2] + 0.014), (c[0] + 0.001, sy * 0.034, c[2] + 0.030), (c[0] + 0.001, sy * 0.026, c[2] + 0.010)])
        b.extend(K.fill_loop(ear, (1, 0, 0), 'paint_b'))
    # the roof hatch: its frame ring on the roof, the domed lid, the hinge at its back, the latch at its front
    hx, _, hr = IN.HATCH
    zr = float(S.roof_z(hx, 0.0))
    V, N, T = K.lathe(np.array([(hr + 0.045, -0.004), (hr + 0.045, 0.012), (hr + 0.035, 0.022), (hr, 0.024), (hr, 0.012)]), (hx, 0.0, zr), (0, 0, 1), 36)
    b.add(V, N, T, 'trim')
    V, N, T = K.lathe(np.array([(hr - 0.004, 0.018), (hr - 0.004, 0.030), (hr * 0.7, 0.042), (0.0, 0.050)]), (hx, 0.0, zr), (0, 0, 1), 32)
    b.add(V, N, T, 'paint')
    b.extend(K.box_buf((hx - hr - 0.06, -0.10, zr + 0.004), (hx - hr + 0.02, 0.10, zr + 0.034), 'steel', 0.006, 2))
    b.extend(K.cyl_buf((hx - hr - 0.02, -0.11, zr + 0.026), (hx - hr - 0.02, 0.11, zr + 0.026), 0.012, 'steel', 10))
    b.extend(K.box_buf((hx + hr - 0.02, -0.03, zr + 0.022), (hx + hr + 0.03, 0.03, zr + 0.04), 'chrome', 0.006, 2))
    # clearance lamps on the roof's front edge
    for sy in (1, -1):
        p, nn = S.CR.to3d(np.array([[1.20, sy * 0.80]]))
        b.extend(K.box_buf(p[0] + (-0.03, -0.04, -0.004), p[0] + (0.03, 0.04, 0.03), 'lens_amber', 0.008, 2))
    # the sun visor over the windscreen: a steel peak off the header on three brackets, leaning down at the front
    xh = float(S.ws_x(0.0, D['roof_z'] - 0.06))
    zv = D['roof_z'] - 0.035
    vis = K.box_buf((-0.0, -0.98, -0.006), (0.21, 0.98, 0.006), 'paint', 0.006, 2,
                    xf=K.mat4_trs((xh - 0.01, 0.0, zv)) @ K.mat4_rot((0, 1, 0), 14))
    b.extend(vis)
    for y in (-0.80, 0.0, 0.80):
        b.extend(K.box_buf((xh - 0.03, y - 0.012, zv - 0.004), (xh + 0.04, y + 0.012, zv + 0.03), 'trim', 0.004, 1))
    # the horn's bracket hung from the cab floor's underside on the right, outboard of the rail (the horn is a part)
    hp = HORN
    b.extend(K.box_buf((hp[0] - 0.05, hp[1] - 0.025, hp[2] + 0.05), (hp[0] + 0.05, hp[1] + 0.025, hp[2] + 0.062), 'steel', 0.003, 1))
    b.extend(K.box_buf((hp[0] - 0.015, hp[1] - 0.015, hp[2] + 0.06), (hp[0] + 0.015, hp[1] + 0.015, IN.PAN_Z - 0.004), 'steel', 0.004, 1))
    return b


# the horn's mount: under the cab floor on the right, outboard of the rail, behind the front wheelhouse (an air horn's
# trumpets point forward along the sill, clear of the liner, the exhaust and the steps)
HORN = (0.86, -0.62, 0.74)


def hood_details():
    """Left half: a rubber catch at the bonnet's front corner, a bank of louvres beside the middle."""
    b = K.Buf()
    p, n = S.CT.to3d(np.array([[D['xf'] - 0.10, D['hood_w'] - 0.12]]))
    b.extend(K.box_buf((-0.035, -0.014, -0.003), (0.035, 0.014, 0.014), 'rubber', 0.005, 2, xf=K.mat4_trs(p[0])))
    b.extend(K.box_buf((-0.008, -0.03, 0.010), (0.008, 0.03, 0.020), 'rubber', 0.004, 1, xf=K.mat4_trs(p[0])))
    p, n = S.CT.to3d(np.array([[2.05, 0.62]]))
    b.extend(K.box_buf((-0.17, -0.12, -0.004), (0.17, 0.12, 0.006), 'trim', 0.006, 2, xf=K.mat4_trs(p[0])))
    for k in range(6):
        x = 1.92 + 0.052 * k
        q, _ = S.CT.to3d(np.array([[x, 0.62]]))
        b.extend(K.box_buf((-0.007, -0.10, 0.004), (0.007, 0.10, 0.010), 'trim', 0.002, 1, xf=K.mat4_trs(q[0])))
    return b


# ============================================================================================ wipers
def wiper(y_pivot, length):
    zj = D['belt_z'] + 0.02
    p = np.array([float(S.ws_x(abs(y_pivot), zj)) + 0.035, y_pivot, zj])
    q, n = S.CT.to3d(np.array([[p[0], p[1]]]))
    p = q[0] + n[0] * 0.004
    nrm = K.unit(np.array([math.sin(S._WR), 0.0, math.cos(S._WR)]))
    rest = np.array([0.0, -1.0, 0.0])
    rest = K.unit(rest - nrm * np.dot(rest, nrm))
    R = K.frame_from(rest, nrm)
    b = K.Buf()
    V, N, T = K.lathe(np.array([(0.0, 0.028), (0.013, 0.026), (0.018, 0.013), (0.019, 0.0)])[::-1], (0, 0, 0), (0, 0, 1), 14)
    b.add(V, N, T, 'trim')
    b.extend(K.tube_buf(np.array([(0.0, 0.0, 0.024), (0.07, 0.0, 0.036), (length, 0.0, 0.036)]), 0.005, 'trim', 6))
    b.extend(K.box_buf((0.05, -0.009, 0.018), (length + 0.03, 0.009, 0.026), 'trim', 0.003, 1))
    b.extend(K.box_buf((0.04, -0.004, 0.005), (length + 0.04, 0.004, 0.018), 'rubber', 0.002, 1))
    Vw, Nw, Tw, Mw = b.arrays()
    out = K.Buf()
    out.add(Vw @ R.T + p, Nw @ R.T, Tw, 'trim')
    out.M = list(Mw)
    return out, dict(pivot=p, rot=R, normal=nrm, rest=rest, sweep_deg=-92.0, axis_local='y')


# ============================================================================================ mounts
def mounts(ex, panels):
    E = []
    hz = D['hub_z']
    # both axles live and driven; the front one steers, the handbrake on the rear
    for name, x, y, front, side in (('hub_FL', D['ax_f'], D['track_f'] / 2, True, -1), ('hub_FR', D['ax_f'], -D['track_f'] / 2, True, 1),
                                    ('hub_RL', D['ax_r'], D['track_r'] / 2, False, -1), ('hub_RR', D['ax_r'], -D['track_r'] / 2, False, 1)):
        E.append(mount(name, (x, y, hz), dict(cat='rim', axle='front' if front else 'rear', steer=front, driven=True,
                                               handbrake=not front, side=side, hub_face=round(abs(y) + 0.012, 4), wheel_r=D['wheel_r'])))
    E.append(mount('engine', IN.ENGINE, dict(cat='engine', space_min=list(IN.ENGINE_ROOM[0]), space_max=list(IN.ENGINE_ROOM[1]),
                                             note='longitudinal, high over the front axle (its tubes, the differential in the middle, '
                                                  'the front propshaft under the sump); its rear end in the doghouse behind the firewall, '
                                                  'its top 2 cm under the bonnet')))
    E.append(mount('gearbox', IN.GEARBOX, dict(cat='gearbox', space_min=list(IN.GEARBOX_ROOM[0]), space_max=list(IN.GEARBOX_ROOM[1]),
                                               note="under the cab floor behind the engine; the frame's transfer case (a drop box with "
                                                    "both outputs on the centre line) behind it")))
    E.append(mount('radiator', IN.RADIATOR, dict(cat='radiator', space_min=list(IN.RADIATOR_ROOM[0]), space_max=list(IN.RADIATOR_ROOM[1]))))
    E.append(mount('battery', IN.BATTERY, dict(cat='battery', space_min=[-0.15, -0.10, 0.0], space_max=[0.15, 0.10, 0.25],
                                               note='on its tray on the left inner wing over the wheel, under the bonnet')))
    E.append(mount('fuelTank', IN.FUEL_TANK, dict(cat='fuelTank', space_min=list(IN.FUEL_ROOM[0]), space_max=list(IN.FUEL_ROOM[1]),
                                                  note='between the rails behind the rear axle, under the box; the filler on the right, '
                                                       'behind the rear wheel')))
    E.append(mount('exhaust', IN.EXHAUST, dict(cat='exhaust', tail=[-1.66, -0.09, -0.05],
                                               route='under the cab floor right of the propshafts, out under the box ahead of the right '
                                                     'rear wheel')))
    p, d = IN.steering_mount()
    ang = math.radians(40)
    E.append(mount('steering', tuple(p), dict(cat='steering', column_deg=40.0), rot=K.frame_from(d, (math.sin(ang), 0, math.cos(ang)))))
    fz = IN.FLOOR_Z + 0.03
    for name, x, y, z, drv, side, note in (('seat_driver', IN.SEAT_X, IN.DRIVER_Y, fz, True, -1, ''),
                                           ('seat_pass', IN.SEAT_X, -IN.DRIVER_Y, fz, False, 1, ''),
                                           ('seat_rear', SEAT_REAR_X, 0.0, D['deck_z'], False, 0, 'in the box behind the headboard, '
                                                                                                    'facing forward')):
        E.append(mount(name, (x, y, z), dict(cat='seat', driver=drv, floor_z=round(z, 4), side=side, note=note)))
    for pname, info in panels.items():
        if info['mount'] is None:
            continue
        m = info['mount']
        cat = 'door' if m.startswith('door') else m
        side = (-1 if m.endswith('L') else 1) if m.startswith('door') else 0
        extra = dict(cat=cat, panel=pname, hinge=info['hinge'], open_deg=info['open_deg'], side=side)
        if m == 'trunk':
            extra['note'] = "the box's drop tailgate, hinged along its bottom edge"
        E.append(mount(m, tuple(info['hinge_pos']), extra))
    E.append(mount('bumperFront', (D['xf'] + 0.005, 0.0, 0.75), dict(cat='bumperFront', fit=[0.20, 2.10, 0.22],
                                                                   note='on the rails\' horns under the nose, the winch below it')))
    E.append(mount('bumperRear', (D['bx_r'] - 0.015, 0.0, 0.78), dict(cat='bumperRear', fit=[0.16, 2.10, 0.18])))
    c3, n3 = ex.lamp_mount
    mp = mirror_point()
    for side, sname in ((1, 'L'), (-1, 'R')):
        E.append(mount('headlight_' + sname, (c3[0], side * c3[1], c3[2]), dict(cat='headlight', side=-side, recess='round', recess_d=D['lamp_d'],
                                                                                 recess_depth=0.075, note='in a steel guard')))
        E.append(mount('taillight_' + sname, (D['bx_r'] - 0.005, side * BX.TAIL_Y, BX.TAIL_Z),
                       dict(cat='taillight', side=-side, on="a bracket under the box's rear corner")))
        E.append(mount('mirror_' + sname, (mp[0], side * mp[1], mp[2] + 0.02), dict(cat='mirror', side=-side)))
        E.append(mount('armor_' + sname, (-1.725, side * (D['bhw'] + 0.024), 1.47), dict(cat='armor', side=-side, fit=[2.70, 0.05, 0.40],
                                                                                         fit_anchor='center', note="on the box's drop side, "
                                                                                                                   "clear of its latches and the tilt's lacing")))
    E.append(mount('roof', (0.70, 0.0, float(S.roof_z(0.70, 0.0))), dict(cat='roof', fit=[1.10, 1.85, 0.20], fit_anchor='center',
                                                                      note="on the cab's roof (over the hatch)")))
    E.append(mount('horn', HORN, dict(cat='horn')))
    E.append(mount('radio', IN.RADIO, dict(cat='radio', slot=[0.18, 0.046], slot_depth=0.06, note='in the overhead console, beside the CB set')))
    E.append(mount('handbrake', (IN.HB_X, 0.0, IN.FLOOR_Z + 0.012), dict(cat='handbrake', note='on the floor between the seats')))
    E.append(mount('gearLever', (IN.GEAR_X, IN.GEAR_Y, IN.FLOOR_Z + 0.014), dict(cat='gearLever')))
    p_, d_ = IN.steering_mount()
    pi_ = p_ + d_ * 0.12 + np.array([0.0, -0.055, 0.0])
    E.append(mount('ignition', tuple(pi_), dict(cat='ignition', on='steering column shroud, right side')))
    return E


# the box's seat (a bench part) behind the headboard, facing forward, its knees clear of it
SEAT_REAR_X = -1.00


def json_extra(objs, panels, needles, wipers, tris, total):
    from frames._sedan_build import json_extra as je
    out = je(objs, panels, needles, wipers, tris, total)
    out['eye_default'] = game_vec(np.array(IN.EYE))
    return out


# ============================================================================================ previews
def _srgb(h):
    c = [((h >> k) & 255) / 255.0 for k in (16, 8, 0)]
    return tuple(v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4 for v in c) + (1.0,)


def paint_preview():
    for name, hx in zip(('paint', 'paint_b'), PREVIEW_PAINT):
        m = bpy.data.materials.get(name)
        bs = m.node_tree.nodes.get('Principled BSDF') if m and m.node_tree else None
        if bs is not None:
            bs.inputs['Base Color'].default_value = _srgb(hx)


def previews(quick):
    os.makedirs(os.path.dirname(SCRATCH), exist_ok=True)
    PV.materials()
    paint_preview()
    PV.scene_setup('anime')
    res = (1280, 720)
    smp = 24 if quick else 48
    tgt = (-0.25, 0, 1.35)
    for name, yaw, pitch, dist in (('f34', 35, 9, 13.0), ('r34', 145, 12, 13.0), ('side_l', 270, 2, 14.0), ('side_r', 90, 2, 14.0),
                                   ('front', 0, 4, 11.5), ('rear', 180, 7, 11.5)):
        PV.orbit(tgt, yaw, pitch, dist, lens=50)
        PV.render(f'{SCRATCH}_{name}.png', res=res, samples=smp)
    PV.orbit((-0.25, 0, 1.0), 270, 89.5, 12, ortho=7.0)
    PV.render(f'{SCRATCH}_top.png', res=(1400, 720), samples=16)
    eye = Vector(IN.EYE)
    ring = steering_ring()
    PV.camera(tuple(eye), tuple(eye + Vector((1.0, -0.02, -0.16))), lens=24)
    PV.render(f'{SCRATCH}_driver.png', res=res, samples=smp)
    PV.camera(tuple(eye), tuple(eye + Vector((1.0, 0.0, -0.55))), lens=30)
    PV.render(f'{SCRATCH}_driver_dials.png', res=res, samples=smp)
    ring.hide_render = True
    PV.camera(tuple(eye), tuple(eye + Vector((1.0, -0.02, -0.16))), lens=24)
    PV.render(f'{SCRATCH}_driver_nowheel.png', res=res, samples=smp)
    PV.camera(tuple(eye), tuple(eye + Vector((0.55, -0.3, 0.75))), lens=24)
    PV.render(f'{SCRATCH}_driver_up.png', res=res, samples=smp)

    def hide(names, h=True):
        for n in names:
            o = bpy.data.objects.get(n)
            if o:
                o.hide_render = h
                for c in o.children:
                    c.hide_render = h
    hide(['P_hood'])
    PV.camera((4.3, 1.6, 2.9), (2.0, 0.0, 1.05), lens=40)
    PV.render(f'{SCRATCH}_bay.png', res=res, samples=smp)
    PV.camera((2.0, 0.0, 4.0), (2.0, 0.0, 0.9), lens=34)
    PV.render(f'{SCRATCH}_bay_top.png', res=res, samples=smp)
    hide(['P_hood'], False)
    hide(['P_door_FL'])
    PV.camera((0.9, 3.6, 1.95), (0.75, 0.4, 1.35), lens=40)
    PV.render(f'{SCRATCH}_open_door_FL.png', res=res, samples=smp)
    hide(['P_door_FL'], False)
    hide(['P_trunk'])
    PV.camera((-5.6, 1.6, 2.4), (-2.6, 0.0, 1.45), lens=40)
    PV.render(f'{SCRATCH}_open_trunk.png', res=res, samples=smp)
    PV.camera((-3.6, -0.3, 2.25), (-0.6, 0.2, 1.4), lens=26)
    PV.render(f'{SCRATCH}_box_inside.png', res=res, samples=smp)
    hide(['P_trunk'], False)
    hide(['P_door_FL', 'P_door_FR', 'P_hood', 'P_trunk'])
    PV.orbit(tgt, 35, 14, 13.0, lens=50)
    PV.render(f'{SCRATCH}_stripped.png', res=res, samples=smp)
    hide(['P_door_FL', 'P_door_FR', 'P_hood', 'P_trunk'], False)
    g = bpy.data.objects.get('preview_ground')
    if g:
        g.hide_render = True
    PV.camera((3.4, -4.4, -2.0), (-0.2, 0.0, 0.55), lens=30)
    PV.render(f'{SCRATCH}_under.png', res=res, samples=smp)
    PV.camera((0.0, 0.0, -3.6), (0.0, 0.0, 0.5), lens=22)
    PV.render(f'{SCRATCH}_under_flat.png', res=res, samples=smp)
    if g:
        g.hide_render = False


def steering_ring():
    """A dark ring of the stock wheel's size on the steering mount (previews only)."""
    p, d = IN.steering_mount()
    c = p - d * 0.084
    a = np.linspace(0, 2 * PI, 40, endpoint=False)
    ang = math.radians(40)
    up = np.array([math.sin(ang), 0.0, math.cos(ang)])
    side = np.cross(up, d)
    pts = np.array([c + 0.176 * (math.cos(t) * side + math.sin(t) * up) for t in a])
    b = K.tube_buf(np.vstack([pts, pts[:1]]), 0.02, 'trim', 8)
    b.extend(K.tube_buf(np.array([c, c - up * 0.17]), 0.012, 'trim', 6))
    b.extend(K.cyl_buf(c - d * 0.01, c + d * 0.05, 0.045, 'trim', 12))
    return b.to_object('_preview_wheel')


PI = math.pi
