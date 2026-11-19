"""RV assembly: objects, origins, mounts, JSON, AO, export and previews. Called from frames/rv.py main()."""
import math
import sys
import time

sys.dont_write_bytecode = True

import bpy  # noqa: E402
import numpy as np  # noqa: E402
from mathutils import Vector  # noqa: E402

from frames import _kit as K  # noqa: E402
from frames import _preview as PV  # noqa: E402
from frames import _rv_ext as EX  # noqa: E402
from frames import _rv_inner as IN  # noqa: E402
from frames import rv as S  # noqa: E402
from frames._sedan_build import badge_buf, game_vec, knuckles, mount, obj_with_origin, plate_buf  # noqa: E402
from lib import modcar as mc  # noqa: E402

D = S.D
ER = S.ER
OUT_GLB = 'public/models/modcar/frames/rv.glb'
OUT_JSON = 'src/core/modcar/data/mounts/rv.json'
SCRATCH = 'D:/modcar-scratch/frames/rv'
DOOR = EX.DOOR


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
    print('[rv] exterior surfaces', round(time.time() - t0, 1), 's')
    # ---------------------------------------------------------------- BODY
    common = K.Buf()
    common.extend(ex.lower_body())
    common.extend(ex.top_front())
    common.extend(ex.greenhouse())
    common.extend(ex.greenhouse(-0.03))
    door = ex.door_skin().extend(ex.door_frame())
    eb, pedges = cab_edges(ex)
    common.extend(eb)
    common.extend(opening_details(ex))
    common.extend(IN.engine_bay())
    common.extend(cab_trims(ex))
    common.extend(box_common(ex))
    left = K.Buf().extend(common)
    left.extend(ex.box_loft(hatch=True))
    left.extend(ex.side_face('L'))
    left.extend(box_side_trims(ex, 'L'))
    left.extend(IN.fuel_details(ex))
    right = K.Buf().extend(common)
    right.extend(ex.box_loft(hatch=False))
    right.extend(ex.side_face('R'))
    right.extend(box_side_trims(ex, 'R'))
    body = K.Buf().extend(left).extend(right.mirrored())
    body.extend(IN.engine_bay_asym())
    body.extend(box_centre_trims(ex))
    objs = [body.to_object('BODY')]
    print('[rv] body', round(time.time() - t0, 1), 's')
    panels = {}
    # ---------------------------------------------------------------- cab doors
    gl = ex.glass()
    door.extend(pedges['door'])
    door.extend(IN.door_card(ex))
    door.extend(IN.door_extras(ex))
    door.extend(IN.door_frame_inner(ex))
    yh = float(S.side_w(D['fd_front'], 1.0)) - 0.004
    for side, sname in ((1, 'L'), (-1, 'R')):
        mid = 'door_F' + sname
        hinge = np.array([D['fd_front'], side * yh, 1.13])
        buf = door if side > 0 else door.mirrored()
        o = obj_with_origin(buf, 'P_' + mid, hinge)
        gb = gl['door'] if side > 0 else gl['door'].mirrored()
        og = obj_with_origin(gb, 'PG_' + mid, hinge, parent=o)
        objs += [o, og]
        panels['P_' + mid] = dict(mount=mid, glass='PG_' + mid, hinge='z', hinge_pos=hinge, axis=(0, 0, 1), open_deg=-68.0 * side)
    # ---------------------------------------------------------------- entry door (right), built in mirror and flipped
    ds, dsg = door_side(ex)
    dh = np.array([DOOR['x1'] - 0.006, -(D['bw'] + 0.004), 0.5 * (DOOR['z0'] + DOOR['z1'])])
    o = obj_with_origin(ds.mirrored(), 'P_door_side', dh)
    og = obj_with_origin(dsg.mirrored(), 'PG_door_side', dh, parent=o)
    objs += [o, og]
    panels['P_door_side'] = dict(mount='door_side', glass='PG_door_side', hinge='z', hinge_pos=dh, axis=(0, 0, 1), open_deg=100.0)
    # ---------------------------------------------------------------- hood, rear locker, fuel flap
    hb = ex.hood()
    hb.extend(pedges['hood'])
    hb.extend(IN.hood_inner(ex))
    hz = float(S.top_z(D['hood_rear'], 0.0)) - 0.02
    hinge = np.array([D['hood_rear'] - 0.008, 0.0, hz])
    objs.append(obj_with_origin(both(hb), 'P_hood', hinge))
    panels['P_hood'] = dict(mount='hood', hinge='y', hinge_pos=hinge, axis=(0, 1, 0), open_deg=-55.0)
    hp, hh = hatch_panel(ex)
    objs.append(obj_with_origin(hp, 'P_trunk', hh))
    panels['P_trunk'] = dict(mount='trunk', hinge='y', hinge_pos=hh, axis=(0, 1, 0), open_deg=75.0)
    ff = IN.fuel_flap(ex)
    fc = ex.cut['fuel'].P.mean(0)
    fhinge = np.array([fc[0] + EX.FUEL[2], fc[1] + 0.002, fc[2]])
    objs.append(obj_with_origin(ff, 'FUEL_CAP', fhinge))
    panels['FUEL_CAP'] = dict(mount=None, hinge='z', hinge_pos=fhinge, axis=(0, 0, 1), open_deg=-85.0)
    # ---------------------------------------------------------------- GLASS, UNDER, INTERIOR
    g = K.Buf()
    g.extend(gl['ws']).extend(gl['ws'].mirrored())
    bgl = box_glass(ex)
    g.extend(bgl['L']).extend(bgl['R'].mirrored()).extend(bgl['rear']).extend(bgl['rear'].mirrored())
    objs.append(g.to_object('GLASS'))
    objs.append(both(IN.underbody(), IN.centre_under()).to_object('UNDER'))
    it = IN.interior(ex)
    inner = K.Buf().extend(it['L']).extend(it['L'].mirrored()).extend(it['C'])
    inner.extend(ex.side_face('L', level=EX_WALL)).extend(ex.side_face('R', level=EX_WALL).mirrored())
    inner.extend(ex.box_loft(True, level=EX_WALL)).extend(ex.box_loft(False, level=EX_WALL).mirrored())
    # the dial glass stays out of the AO bake (it would bake the gauge faces and the needles behind it black);
    # it is joined into INTERIOR after the bake
    ib, dial_glass = K.split_mat(inner, ('glass',))
    o_int = ib.to_object('INTERIOR')
    objs.append(o_int)
    needles = {}
    from frames._sedan_build import needle
    for gdesc in it['gauges']:
        nb, info = needle(gdesc)
        rot = K.frame_from(info['rest'], gdesc['normal'])
        objs.append(obj_with_origin(nb, gdesc['name'], gdesc['center'], rot=rot))
        needles[gdesc['name']] = info
    wipers = {}
    for wname, wy, wl in (('WIPER_L', 0.62, 0.62), ('WIPER_R', -0.06, 0.62)):
        wb, info = wiper(wy, wl)
        objs.append(obj_with_origin(wb, wname, info['pivot'], rot=info['rot']))
        wipers[wname] = info
    print('[rv] objects', round(time.time() - t0, 1), 's')
    empties = mounts(ex, panels)
    objs += knuckles(empties, IN.knuckle)
    meshes = [o for o in objs if o.type == 'MESH']
    tris = {o.name: mc.triangles([o]) for o in meshes}
    total = sum(tris.values())
    print('[rv] triangles', total, {k: v for k, v in sorted(tris.items(), key=lambda kv: -kv[1])[:9]})
    if not quick:
        # the bay is baked with the bonnet up (the tutorial looks into it with the bonnet open)
        hood = next(o for o in meshes if o.name == 'P_hood')
        K.bake_ao_open(meshes, [(hood, panels['P_hood']['axis'], panels['P_hood']['open_deg'])],
                       ((IN.FIREWALL_X - 0.01, -0.92, 0.0), (IN.RAD_X + 0.10, 0.92, 1.27)), samples=32, distance=0.45)
    if not quick:
        # the dial faces once more without the needles over them
        K.rebake_mats(o_int, [o for o in meshes if o.name.startswith('N_')], ('gauge',), samples=32, distance=0.45)
    K.join_white(o_int, dial_glass)
    tris = {o.name: mc.triangles([o]) for o in meshes}
    total = sum(tris.values())
    print('[rv] grime masks', K.mask_frame(meshes))
    mc.export_glb(OUT_GLB, meshes + empties)
    mc.mounts_json(OUT_JSON, 'rv', json_extra(objs, panels, needles, wipers, tris, total))
    print('[rv] exported', round(time.time() - t0, 1), 's')
    if not no_preview:
        previews(quick)
    print('[rv] done', round(time.time() - t0, 1), 's')


EX_WALL = IN.WALL


def nearest(P, ref):
    out = np.empty_like(P)
    for i, p in enumerate(P):
        out[i] = ref[np.argmin(((ref - p) ** 2).sum(1))]
    return out


# ============================================================================================ cab edges / details
def cab_edges(ex):
    body = K.Buf()
    panels = {}
    op = ex.opening_out
    E = EX.side_dir(op['P'], op['N'], nearest(op['P'], ex.cut['doorL'].P), False)
    V, N, T = K.roll_edge(op['P'], op['N'], E, ER, 0.10, 0.0, 2, closed=False)
    body.add(V, N, T, 'paint')
    s_ = ex.cut['doorL'].side('in')
    V, N, T = K.roll_edge(s_['P'], s_['N'], s_['E'], ER, 0.10, 0.03, 2, closed=False, hem_segs=0)
    panels['door'] = K.Buf().add(V, N, T, 'paint')
    so = ex.cut['doorG'].side('out')
    V, N, T = K.roll_edge(so['P'], so['N'], so['E'], ER, 0.032, 0.0, 2, closed=False)
    body.add(V, N, T, 'paint')
    si = ex.cut['doorG'].side('in')
    V, N, T = K.roll_edge(si['P'], si['N'], si['E'], ER, 0.035, 0.008, 2, closed=False, hem_segs=0)
    panels['door'].add(V, N, T, 'paint')
    for name, (poly, P, Nn) in ex.win_P.items():
        E = EX.side_dir(P, Nn, np.tile(P.mean(0), (len(P), 1)), True)
        V, N, T = K.roll_edge(P, Nn, E, 0.003, 0.035, 0.0, 2, closed=True)
        panels['door'].add(V, N, T, 'paint')
    c = ex.cut['hood']
    so = c.side('out')
    V, N, T = K.roll_edge(so['P'], so['N'], so['E'], ER, 0.03, 0.0, 2, closed=False)
    body.add(V, N, T, 'paint')
    si = c.side('in')
    V, N, T = K.roll_edge(si['P'], si['N'], si['E'], ER, 0.025, 0.008, 2, closed=False, hem_segs=0)
    panels['hood'] = K.Buf().add(V, N, T, 'paint')
    wv = ex.win['ws']
    cen = (float(S.ws_x(0.0, 1.7)) - 0.1, 0.0, 1.7)
    E = EX.side_dir(wv['P'], wv['N'], np.tile(cen, (len(wv['P']), 1)), False)
    V, N, T = K.roll_edge(wv['P'], wv['N'], E, 0.004, 0.032, 0.0, 2, closed=False)
    body.add(V, N, T, 'paint')
    for (P, N), uv in zip(ex.arch_P, [ex.arch_notch(D['ax_f'])]):
        keep = uv[:, 1] >= S.L_T[1] - 1e-6
        P, N = P[keep], N[keep]
        cc = np.array([P[:, 0].mean(), P[:, 1].mean(), D['hub_z']])
        E = EX.side_dir(P, N, np.tile(cc, (len(P), 1)), False)
        V, Nn, T = K.roll_edge(P, N, E, 0.007, 0.04, 0.0, 2, closed=False)
        body.add(V, Nn, T, 'paint')
    return body, panels


def opening_details(ex):
    b = K.Buf()
    gr = ex.open['grille']
    ref = np.tile([gr['P'][:, 0].mean(), 0.0, 1.02], (len(gr['P']), 1))
    E = EX.side_dir(gr['P'], gr['N'], ref, False)
    V, N, T = K.roll_edge(gr['P'], gr['N'], E, 0.005, 0.03, 0.0, 2, closed=False, flange_dir=(-1, 0, 0))
    b.add(V, N, T, 'paint')
    b.extend(grille(ex))
    lp = ex.open['lamp']
    c3 = S.FRONT_L.to3d(np.array([[D['lamp_y'], D['lamp_z']]]))[0][0]
    E = EX.side_dir(lp['P'], lp['N'], np.tile(c3, (len(lp['P']), 1)), True)
    V, N, T = K.roll_edge(lp['P'], lp['N'], E, 0.005, 0.012, 0.0, 2, closed=True, flange_dir=(-1, 0, 0))
    b.add(V, N, T, 'paint')
    ring = V.reshape(-1, len(lp['P']), 3)[-1]
    b.extend(K.ring_tube(ring, (-1, 0, 0), 0.07, 1, 'trim'))
    back = ring - np.array([0.07, 0, 0])
    b.extend(K.fill_loop(back, (1, 0, 0), 'trim'))
    ex.lamp_mount = (c3, lp['N'].mean(0))
    # amber indicator under each headlamp, side marker on the fender
    p, n = S.FRONT_L.to3d(np.array([[D['lamp_y'] + 0.02, 0.84]]))
    b.extend(K.box_buf((-0.012, -0.07, -0.025), (0.004, 0.07, 0.025), 'lens_amber', 0.008, 2, xf=K.mat4_trs(p[0])))
    p, n = S.SIDE_L.to3d(np.array([[2.55, 0.98]]))
    b.extend(K.box_buf((-0.04, -0.004, -0.018), (0.04, 0.008, 0.018), 'lens_amber', 0.008, 2, xf=K.mat4_trs(p[0])))
    return b


def grille(ex):
    """Grille: dark back panel, horizontal slats (one bright), a silver surround and a fictional badge bar."""
    b = K.Buf()
    gw, z0, z1 = D['grille_w'], D['grille_z0'], D['grille_z1']
    g = ex.open['grille']['yz']
    loop = np.vstack([g, np.stack([np.zeros(8), np.linspace(z0, z1, 10)[1:-1]], 1)])
    loop2 = K.offset_loop2(K.ccw(loop), 0.004)
    loop2[:, 0] = np.maximum(loop2[:, 0], 0.0)
    pts = K.grid_points(0, gw, z0, z1, 0.08, dt=0.08)
    V, N, T = K.mesh_region(S.FRONT_L, [K.Loop(K.resample(loop2, 0.04))], [], pts, spacing=0.08, level=-0.05)
    b.add(V, -N, T, 'trim')
    ys = np.linspace(0.0, gw - 0.01, 6)
    slat = K.round_profile(np.array([(-0.007, -0.015), (0.007, -0.015), (0.007, 0.015), (-0.007, 0.015)]), 0.005, 1)
    slat = np.vstack([slat, slat[:1]])
    for z in np.linspace(z0 + 0.05, z1 - 0.05, 3):
        mat = 'alu' if abs(z - 0.5 * (z0 + z1)) < 0.03 else 'trim'
        P, _ = S.FRONT_L.to3d(np.stack([ys, np.full(len(ys), z)], 1))
        V, N, T = K.sweep(P - np.array([0.03, 0, 0]), (0, 0, 1), slat, closed=False, closed_prof=True)
        b.add(V, N, T, mat)
    P, Ns = S.FRONT_L.to3d(g)
    prof = K.round_profile(np.array([(-0.007, -0.006), (0.007, -0.006), (0.007, 0.006), (-0.007, 0.006)]), 0.003, 1)
    prof = np.vstack([prof, prof[:1]])
    V, N, T = K.sweep(P - np.array([0.016, 0, 0]), (1, 0, 0), prof, closed=False, closed_prof=True)
    b.add(V, N, T, 'alu')
    return b


def cab_trims(ex):
    b = K.Buf()
    wv = ex.win['ws']
    P, Nn = wv['P'], wv['N']
    cen = np.array([float(S.ws_x(0.0, 1.7)) - 0.1, 0.0, 1.7])
    E = EX.side_dir(P, Nn, np.tile(cen, (len(P), 1)), False)
    prof = np.array([(-0.007, -0.006), (-0.006, 0.003), (0.0, 0.0055), (0.006, 0.003), (0.007, -0.006)])
    V, NN, T = K.sweep(P + E * 0.006 - Nn * 0.004, Nn, prof, closed=False)
    b.add(V, NN, T, 'rubber')
    prof = np.array([(-0.0045, -0.001), (-0.0035, 0.003), (0.0035, 0.003), (0.0045, -0.001)])
    V, NN, T = K.sweep(P + E * 0.0015 + Nn * 0.0005, Nn, prof, closed=False)
    b.add(V, NN, T, 'chrome')
    for k in range(7):
        y = 0.10 + 0.10 * k
        p, n = S.CT.to3d(np.array([[1.985, y]]))
        b.extend(K.box_buf((-0.010, -0.035, -0.004), (0.010, 0.035, 0.0015), 'trim', 0.003, 1, xf=K.mat4_trs(p[0])))
    mp = mirror_point()
    b.extend(K.box_buf((-0.05, -0.012, -0.004), (0.05, 0.004, 0.026), 'trim', 0.006, 2, xf=K.mat4_trs(mp)))
    # door aperture sill plate and seal (behind the arch notch)
    b.extend(K.box_buf((D['fd_rear'] + 0.01, 0.86, D['door_bot'] - 0.012), (1.44, 0.95, D['door_bot'] - 0.002), 'paint', 0.004, 1))
    # the cab's rear sill end under the box's front corner
    b.extend(K.box_buf((D['bx_f'] - 0.004, 0.93, D['bz0'] + 0.10), (D['bx_f'] + 0.012, 0.99, 0.70), 'paint', 0.004, 1))
    # seal where the cab meets the living module (rubber boot along the cab outline on the box)
    cab = ex.box['cab']
    P = cab['P'][1:] + cab['N'][1:] * 0.004
    P = K.resample(P, 0.03, closed=False)
    b.extend(K.tube_buf(P, 0.012, 'rubber', 8))
    return b


def mirror_point():
    p, n = S.SIDE_L.to3d(np.array([[D['fd_front'] - 0.02, D['belt_z'] - 0.035]]))
    return p[0]


# ============================================================================================ living module details
def box_common(ex):
    """Symmetric living-module details (left half): rear arch lip and liner edge, tail lamp buckets, the window
    reveals at the rear, clearance lamps, marker lamps, mud flaps."""
    b = K.Buf()
    BX = ex.box
    # rear arch lip: the arch edge from the flange over the side face and back down
    rc, Pr, Nr = BX['arch_rear']
    fc, Pf, Nf = BX['arch_front']
    af = BX['arch_face']
    P = np.vstack([Pr[::-1], af['P'][1:-1], Pf])
    N = np.vstack([Nr[::-1], af['N'][1:-1], Nf])
    cc = np.array([D['ax_r'], P[:, 1].mean(), D['hub_z']])
    E = EX.side_dir(P, N, np.tile(cc, (len(P), 1)), False)
    V, Nn, T = K.roll_edge(P, N, E, 0.008, 0.045, 0.0, 2, closed=False)
    b.add(V, Nn, T, 'trim')
    # tail lamp recess (rear wall)
    tl = BX['tail']
    ct = tl['P'].mean(0)
    E = EX.side_dir(tl['P'], tl['N'], np.tile(ct, (len(tl['P']), 1)), True)
    V, N, T = K.roll_edge(tl['P'], tl['N'], E, 0.003, 0.045, 0.0, 2, closed=True, flange_dir=(1, 0, 0))
    b.add(V, N, T, 'paint')
    ring = V.reshape(-1, len(tl['P']), 3)[-1]
    b.extend(K.fill_loop(ring, (-1, 0, 0), 'trim'))
    ex.tail_mount = (np.array([tl['P'][:, 0].mean(), ct[1], ct[2]]), -tl['N'].mean(0))
    # rear window reveal (half; mirrored) and an alu frame on it
    rw = BX['rear_win']
    E = EX.side_dir(rw['P'], rw['N'], np.tile(rw['P'].mean(0) * (1, 0, 1), (len(rw['P']), 1)), False)
    V, N, T = K.roll_edge(rw['P'], rw['N'], E, 0.004, 0.04, 0.0, 2, closed=False, flange_dir=(1, 0, 0))
    b.add(V, N, T, 'paint')
    b.extend(frame_sweep(rw['P'] - E * 0.010, rw['N'], closed=False))
    # clearance lamps: three on the nose, three at the rear top (left halves of the centre lamp built twice is
    # avoided by the centre helper)
    for y in (0.30,):
        p, n = S.CB.to3d(np.array([[float(EX.flat_u(D['bz1'], D['al_f'] - 0.28)), float(S.bt_of_y(y, D['al_f'] - 0.28, D['bz1']))]]))
        b.extend(K.box_buf((-0.03, -0.035, -0.003), (0.03, 0.035, 0.018), 'lens_amber', 0.008, 2, xf=K.mat4_trs(p[0])))
    # side marker lamps: amber at the front of the box, red at the rear
    for x, mat in ((0.62, 'lens_amber'), (-3.55, 'lens_tail')):
        p, n = S.SIDE_B.to3d(np.array([[x, 0.98]]))
        b.extend(K.box_buf((-0.045, -0.004, -0.02), (0.045, 0.01, 0.02), mat, 0.008, 2, xf=K.mat4_trs(p[0])))
    # mud flaps behind the rear wheels
    xf_ = D['ax_r'] - 0.52
    b.extend(K.box_buf((xf_ - 0.010, 0.72, 0.22), (xf_ + 0.004, 1.02, D['bz0'] + 0.04), 'rubber', 0.005, 2))
    return b


def box_centre_trims(ex):
    """Centre-line details: clearance lamps on the nose and the rear, roof air conditioner, roof vent."""
    b = K.Buf()
    for y in (0.0,):
        p, n = S.CBT.to3d(np.array([[D['al_f'] - 0.28, y]]))
        b.extend(K.box_buf((-0.03, -0.035, -0.003), (0.03, 0.035, 0.018), 'lens_amber', 0.008, 2, xf=K.mat4_trs(p[0])))
    for y in (-0.30, 0.0, 0.30):
        p, n = S.REAR_B.to3d(np.array([[y, 2.55]]))
        b.extend(K.box_buf((-0.018, -0.035, -0.022), (0.004, 0.035, 0.022), 'lens_tail', 0.008, 2, xf=K.mat4_trs(p[0])))
    # roof air conditioner: a rounded shroud on a base, over the dinette
    ac = np.array([0.35, 0.0, D['bz1']])
    b.extend(K.box_buf(ac + (-0.38, -0.33, -0.004), ac + (0.38, 0.33, 0.05), 'trim', 0.012, 2))
    b.extend(K.box_buf(ac + (-0.36, -0.31, 0.05), ac + (0.34, 0.31, 0.25), 'ceramic', 0.08, 3))
    for k in range(5):
        yy = -0.20 + 0.10 * k
        b.extend(K.box_buf(ac + (0.335, yy - 0.03, 0.09), ac + (0.35, yy + 0.03, 0.20), 'trim', 0.004, 1))
    # roof vent over the rear lounge: frame and smoked dome
    rv_ = np.array([-3.10, 0.0, D['bz1']])
    b.extend(K.box_buf(rv_ + (-0.22, -0.22, -0.004), rv_ + (0.22, 0.22, 0.03), 'ceramic', 0.01, 2))
    V, N, T = K.lathe(np.array([(0.19, 0.0), (0.17, 0.05), (0.10, 0.085), (0.0, 0.095)]), rv_ + (0, 0, 0.03), (0, 0, 1), 20)
    b.add(V, N, T, 'glass_dark')
    # number plate on the rear wall (right of the locker hatch) with its lamp; emblem on the cab's nose
    p, n = S.REAR_B.to3d(np.array([[-0.40, 0.98]]))
    b.extend(plate_buf(p[0], n[0], (0.0, 0.0, 1.0), 0.33, 0.15, 'C3 768'))
    b.extend(K.box_buf((p[0][0] - 0.03, -0.46, 1.07), (p[0][0] + 0.002, -0.34, 1.095), 'trim', 0.006, 2))
    b.extend(K.box_buf((p[0][0] - 0.0105, -0.45, 1.064), (p[0][0] - 0.0085, -0.35, 1.072), 'lens_head', 0.001, 1))
    p, n = S.FRONT_L.to3d(np.array([[0.0, D['grille_z1'] + 0.055]]))
    b.extend(badge_buf(p[0], n[0], (0.0, 0.0, 1.0), 0.03))
    return b


def coarse(loop, tol=0.002):
    """Drop loop points that lie (within tol) on the line through their neighbours: straight runs keep only their
    ends, arcs keep their points."""
    P = np.asarray(loop, float)
    keep = [0]
    for i in range(1, len(P) - 1):
        a, b, c = P[keep[-1]], P[i], P[i + 1]
        ab = c - a
        L = np.linalg.norm(ab)
        if L < 1e-9:
            continue
        d = abs(np.cross(ab, b - a)) / L
        if d > tol:
            keep.append(i)
    keep.append(len(P) - 1)
    return P[keep]


def frame_sweep(P, N, closed=True, mat='alu'):
    """Window frame: a low rounded alu section swept along a loop on the wall (normal N)."""
    prof = np.array([(-0.014, 0.0), (-0.014, 0.004), (-0.010, 0.009), (0.008, 0.009), (0.012, 0.005), (0.012, 0.0)])
    V, NN, T = K.sweep(P, N, prof, closed=closed)
    return K.Buf().add(V, NN, T, mat)


def box_side_trims(ex, side):
    """One side of the living module (built on the left; the right side's in mirror): window reveals and alu
    frames, the entry door's opening (right) or the fuel flap pocket is elsewhere; awning and ladder on the
    right; entry step and grab handle (right)."""
    b = K.Buf()
    for (sd, name), poly in ex.box['win'].items():
        if sd != side:
            continue
        P, N = S.SIDE_B.to3d(poly)
        E = EX.side_dir(P, N, np.tile(P.mean(0), (len(P), 1)), True)
        V, Nn, T = K.roll_edge(P, N, E, 0.004, 0.04, 0.0, 2, closed=True)
        b.add(V, Nn, T, 'paint')
        Q, Nq = S.SIDE_B.to3d(K.resample(coarse(K.offset_loop2(poly, -0.010)), 0.08))
        b.extend(frame_sweep(Q, Nq))
    if side == 'R':
        so = ex.cut['door_side'].side('out')
        V, N, T = K.roll_edge(so['P'], so['N'], so['E'], ER, 0.06, 0.0, 2, closed=True)
        b.add(V, N, T, 'paint')
        # entry step under the door, grab handle beside it
        b.extend(K.box_buf((DOOR['x0'] + 0.06, D['bw'] - 0.01, 0.42), (DOOR['x1'] - 0.06, D['bw'] + 0.16, 0.46), 'alu', 0.008, 2))
        b.extend(K.box_buf((DOOR['x0'] + 0.08, D['bw'] + 0.02, 0.46), (DOOR['x1'] - 0.08, D['bw'] + 0.14, 0.465), 'rubber', 0.002, 1))
        for x in (DOOR['x0'] + 0.10, DOOR['x1'] - 0.10):
            b.extend(K.box_buf((x - 0.015, D['bw'] - 0.03, 0.44), (x + 0.015, D['bw'] + 0.01, D['bz0'] + 0.02), 'steel', 0.004, 1))
        gx = DOOR['x0'] - 0.07
        b.extend(K.tube_buf(np.array([(gx, D['bw'] - 0.002, 1.02), (gx, D['bw'] + 0.05, 1.06), (gx, D['bw'] + 0.05, 1.56), (gx, D['bw'] - 0.002, 1.60)]),
                            0.013, 'chrome', 10))
        b.extend(awning())
        b.extend(ladder())
    return b


def awning():
    """Roll-out awning on the right side (built at +y): the case under the roof edge on brackets, two folded arms."""
    b = K.Buf()
    x0, x1 = -2.92, 0.58
    yc, zc = D['bw'] + 0.07, 2.84
    b.extend(K.cyl_buf((x0, yc, zc), (x1, yc, zc), 0.065, 'alu', 18))
    b.extend(K.box_buf((x0, yc - 0.065, zc - 0.012), (x1, yc - 0.01, zc + 0.012), 'alu', 0.004, 1))
    for x in (x0 - 0.02, x1 + 0.02):
        b.extend(K.box_buf((min(x, x + 0.03 * np.sign(x - x0 + 1e-3)) - 0.015, D['bw'] - 0.01, zc - 0.08), (max(x, x + 0.03) + 0.015, yc + 0.07, zc + 0.08), 'trim', 0.012, 2))
    for xa in (-2.45, 0.40):
        b.extend(K.box_buf((xa - 0.02, D['bw'] + 0.004, 0.86), (xa + 0.02, D['bw'] + 0.026, zc - 0.05), 'alu', 0.006, 1))
        b.extend(K.box_buf((xa - 0.03, D['bw'] - 0.004, 0.84), (xa + 0.03, D['bw'] + 0.03, 0.90), 'trim', 0.006, 1))
    return b


def ladder():
    """Ladder up the back (built at +y; the build mirrors it to the right): two rails over the rounded rear top
    onto the roof, rungs, stand-offs. It starts above the tail lamps."""
    b = K.Buf()
    r0 = D['r_box_rt']
    xw, zt = D['bx_r'], D['bz1']
    cx, cz = xw + r0, zt - r0
    off = 0.06
    for y in (0.60, 0.88):
        zs = np.linspace(1.58, cz, 6)
        a = np.linspace(math.pi, math.pi / 2, 10)[1:]
        path = np.vstack([np.stack([np.full(len(zs), xw - off), np.full(len(zs), y), zs], 1),
                          np.stack([cx + (r0 + off) * np.cos(a), np.full(len(a), y), cz + (r0 + off) * np.sin(a)], 1),
                          [(cx + 0.25, y, zt + off)]])
        b.extend(K.tube_buf(path, 0.015, 'alu', 10))
        for zz in (1.70, 2.40):
            b.extend(K.tube_buf(np.array([(xw - off, y, zz), (xw + 0.004, y, zz)]), 0.010, 'alu', 8))
        b.extend(K.tube_buf(np.array([(cx + 0.25, y, zt + off), (cx + 0.25, y, zt - 0.004)]), 0.010, 'alu', 8))
    for zz in np.arange(1.62, 2.62, 0.30):
        b.extend(K.tube_buf(np.array([(xw - off, 0.60, zz), (xw - off, 0.88, zz)]), 0.011, 'alu', 8))
    return b


def door_side(ex):
    """Entry door (built on the left in mirror): skin with the band, a rolled edge, inner panel, window frame,
    handle and lock, hinges on the front edge. Returns (door buf, its window glass buf)."""
    b = ex.door_side_skin()
    si = ex.cut['door_side'].side('in')
    V, N, T = K.roll_edge(si['P'], si['N'], si['E'], ER, 0.05, 0.01, 2, closed=True, hem_segs=0)
    b.add(V, N, T, 'paint')
    # inner panel 45 mm in
    inner = K.offset_loop2(si['uv'], -0.012)
    g = K.grid_points(DOOR['x0'], DOOR['x1'], DOOR['z0'], DOOR['z1'], 0.10, dt=0.10)
    holes = [K.Loop(EX.rrect(DOOR_WIN_[0] - 0.01, DOOR_WIN_[1] + 0.01, DOOR_WIN_[2] - 0.01, DOOR_WIN_[3] + 0.01, DOOR_WIN_[4] + 0.01))]
    V, N, T = K.mesh_region(S.SIDE_B, [K.Loop(K.resample(inner, 0.04))], holes, g, spacing=0.10, level=-0.045)
    b.add(V, -N, T, 'plastic_int')
    # window: reveal, frame, glass
    poly = ex.box['door_win']
    P, N = S.SIDE_B.to3d(poly)
    E = EX.side_dir(P, N, np.tile(P.mean(0), (len(P), 1)), True)
    V, Nn, T = K.roll_edge(P, N, E, 0.004, 0.045, 0.0, 2, closed=True)
    b.add(V, Nn, T, 'paint')
    Q, Nq = S.SIDE_B.to3d(K.offset_loop2(poly, -0.010))
    b.extend(frame_sweep(Q, Nq))
    big = K.offset_loop2(poly, -0.012)
    g = K.grid_points(DOOR_WIN_[0], DOOR_WIN_[1], DOOR_WIN_[2], DOOR_WIN_[3], 0.12, dt=0.12)
    V, N, T = K.mesh_region(S.SIDE_B, [K.Loop(big)], [], g, spacing=0.12, level=-0.02)
    glass = K.Buf().add(V, N, T, 'glass')
    # handle and lock (near the rear edge), hinges (front edge)
    hp, hn = S.SIDE_B.to3d(np.array([[DOOR['x0'] + 0.08, 1.42]]))
    b.extend(K.box_buf(hp[0] + (-0.02, -0.004, -0.06), hp[0] + (0.02, 0.018, 0.06), 'chrome', 0.008, 2))
    b.extend(K.cyl_buf(hp[0] + (0.0, 0.0, -0.09), hp[0] + (0.0, 0.012, -0.09), 0.011, 'chrome', 12))
    for zz in (1.05, 1.73, 2.40):
        p, n = S.SIDE_B.to3d(np.array([[DOOR['x1'] - 0.004, zz]]))
        b.extend(K.box_buf(p[0] + (-0.012, -0.002, -0.04), p[0] + (0.016, 0.012, 0.04), 'steel', 0.004, 1))
    return b, glass


DOOR_WIN_ = EX.DOOR_WIN


def hatch_panel(ex):
    """Rear locker hatch (left half of the rear wall): skin, rolled edge, inner panel, lock; hinge on top."""
    b = ex.hatch_skin()
    si = ex.cut['hatch'].side('in')
    V, N, T = K.roll_edge(si['P'], si['N'], si['E'], ER, 0.03, 0.008, 2, closed=True, hem_segs=0)
    b.add(V, N, T, 'paint')
    y0, y1, z0, z1, r = EX.HATCH
    inner = K.offset_loop2(si['uv'], -0.015)
    g = K.grid_points(y0, y1, z0, z1, 0.08, dt=0.08)
    V, N, T = K.mesh_region(S.REAR_B, [K.Loop(K.resample(inner, 0.04))], [], g, spacing=0.08, level=-0.03)
    b.add(V, -N, T, 'paint')
    p, n = S.REAR_B.to3d(np.array([[0.5 * (y0 + y1), z0 + 0.08]]))
    b.extend(K.cyl_buf(p[0] + (0.004, 0, 0), p[0] + (-0.008, 0, 0), 0.014, 'chrome', 14))
    hh = S.REAR_B.to3d(np.array([[0.5 * (y0 + y1), z1 - 0.004]]))[0][0] + np.array([-0.004, 0.0, 0.0])
    return b, hh


def box_glass(ex):
    out = {'L': K.Buf(), 'R': K.Buf(), 'rear': K.Buf()}
    for (sd, name), poly in ex.box['win'].items():
        big = K.offset_loop2(poly, -0.012)
        g = K.grid_points(poly[:, 0].min(), poly[:, 0].max(), poly[:, 1].min(), poly[:, 1].max(), 0.14, dt=0.14)
        V, N, T = K.mesh_region(S.SIDE_B, [K.Loop(big)], [], g, spacing=0.14, level=-0.02)
        out[sd].add(V, N, T, 'glass')
    rw = ex.box['rear_win']
    yz = rw['yz']
    big = K.offset_loop2(yz, -0.012, closed=False)
    big[0, 0] = 0.0
    big[-1, 0] = 0.0
    ss = np.linspace(big[-1, 1], big[0, 1], 12)[1:-1]
    loop = np.vstack([big, np.stack([np.zeros(len(ss)), ss[::-1]], 1)])
    g = K.grid_points(0.0, 0.6, 1.9, 2.5, 0.14, dt=0.14)
    V, N, T = K.mesh_region(S.REAR_B, [K.Loop(K.ccw(loop))], [], g, spacing=0.14, level=-0.02)
    out['rear'].add(V, N, T, 'glass')
    return out


def wiper(y_pivot, length):
    zj = D['belt_z'] + 0.01
    p = np.array([float(S.ws_x(abs(y_pivot), D['belt_z'])) + 0.07, y_pivot, zj])
    q, n = S.CT.to3d(np.array([[p[0], p[1]]]))
    p = q[0] + n[0] * 0.004
    nrm = K.unit(np.array([math.sin(S._WR), 0.0, math.cos(S._WR)]))
    rest = np.array([0.0, -1.0, 0.0])
    rest = K.unit(rest - nrm * np.dot(rest, nrm))
    R = K.frame_from(rest, nrm)
    b = K.Buf()
    V, N, T = K.lathe(np.array([(0.0, 0.028), (0.013, 0.026), (0.018, 0.013), (0.019, 0.0)])[::-1], (0, 0, 0), (0, 0, 1), 14)
    b.add(V, N, T, 'trim')
    b.extend(K.tube_buf(np.array([(0.0, 0.0, 0.024), (0.07, 0.0, 0.032), (length, 0.0, 0.032)]), 0.005, 'trim', 6))
    b.extend(K.box_buf((0.05, -0.009, 0.013), (length + 0.03, 0.009, 0.022), 'trim', 0.003, 1))
    b.extend(K.box_buf((0.04, -0.004, 0.0), (length + 0.04, 0.004, 0.013), 'rubber', 0.002, 1))
    Vw, Nw, Tw, Mw = b.arrays()
    out = K.Buf()
    out.add(Vw @ R.T + p, Nw @ R.T, Tw, 'trim')
    out.M = list(Mw)
    return out, dict(pivot=p, rot=R, normal=nrm, rest=rest, sweep_deg=-88.0, axis_local='y')


# ============================================================================================ mounts
def mounts(ex, panels):
    E = []
    hz = D['hub_z']
    for name, x, y, front, side in (('hub_FL', D['ax_f'], D['track_f'] / 2, True, -1), ('hub_FR', D['ax_f'], -D['track_f'] / 2, True, 1),
                                    ('hub_RL', D['ax_r'], D['track_r'] / 2, False, -1), ('hub_RR', D['ax_r'], -D['track_r'] / 2, False, 1)):
        hf = abs(y) + (0.010 if front else -0.024)
        E.append(mount(name, (x, y, hz), dict(cat='rim', axle='front' if front else 'rear', steer=front, driven=not front,
                                               handbrake=not front, side=side, hub_face=round(hf, 4), wheel_r=D['wheel_r'],
                                               dual=not front)))
    ex_, ey_, ez_ = IN.ENGINE
    E.append(mount('engine', (ex_, ey_, ez_), dict(cat='engine', space_min=[-0.53, -0.38, 0.0], space_max=[0.61, 0.38, 0.95],
                                                     note='the rear of the engine sits under the cab doghouse')))
    E.append(mount('gearbox', (1.086, 0.0, 0.36), dict(cat='gearbox', space_min=[-0.36, -0.20, 0.0], space_max=[0.34, 0.20, 0.42])))
    E.append(mount('radiator', (IN.RAD_X, 0.0, 0.50), dict(cat='radiator', space_min=[-0.15, -0.43, 0.0], space_max=[0.05, 0.43, 0.68])))
    E.append(mount('battery', (2.42, -0.64, 0.96), dict(cat='battery', space_min=[-0.19, -0.11, 0.0], space_max=[0.19, 0.11, 0.26])))
    E.append(mount('fuelTank', (-2.95, 0.0, 0.27), dict(cat='fuelTank', space_min=[-0.53, -0.42, 0.0], space_max=[0.56, 0.42, 0.43],
                                                          note='between the rails behind the rear axle')))
    E.append(mount('exhaust', (1.95, -0.30, 0.42), dict(cat='exhaust', tail=[-1.67, -0.10, -0.12],
                                                         route='under the cab floor right of the propshaft, out ahead of the right rear wheels')))
    p, d = IN.steering_mount()
    ang = math.radians(35)
    E.append(mount('steering', tuple(p), dict(cat='steering', column_deg=35.0), rot=K.frame_from(d, (math.sin(ang), 0, math.cos(ang)))))
    fz = IN.FLOOR_Z + 0.03
    for name, x, y, z, drv, side, note in (('seat_driver', IN.SEAT_X, IN.DRIVER_Y, fz, True, -1, ''),
                                           ('seat_pass', IN.SEAT_X, -IN.DRIVER_Y, fz, False, 1, ''),
                                           ('seat_dinette', -0.15, 0.47, D['box_floor'], False, -1, 'dinette, left wall, facing forward'),
                                           ('seat_rear', -3.25, 0.0, D['box_floor'], False, 0, 'rear lounge, facing forward')):
        E.append(mount(name, (x, y, z), dict(cat='seat', driver=drv, floor_z=round(z, 4), side=side, note=note)))
    for pname, info in panels.items():
        if info['mount'] is None:
            continue
        m = info['mount']
        cat = 'door' if m.startswith('door') else m
        side = (-1 if m.endswith('L') else 1) if m.startswith('door_F') else (1 if m == 'door_side' else 0)
        E.append(mount(m, tuple(info['hinge_pos']), dict(cat=cat, panel=pname, hinge=info['hinge'], open_deg=info['open_deg'], side=side)))
    zf = 0.70
    xb = float(S.front_x(0.0, zf))
    E.append(mount('bumperFront', (xb + 0.005, 0.0, zf), dict(cat='bumperFront', fit=[0.16, 1.96, 0.20])))
    zr = 0.62
    xr_ = float(S.REAR_B.to3d(np.array([[0.0, zr]]))[0][0][0])
    E.append(mount('bumperRear', (xr_ - 0.005, 0.0, zr), dict(cat='bumperRear', fit=[0.15, 2.20, 0.18])))
    c3, n3 = ex.lamp_mount
    tp, tn = ex.tail_mount
    mp = mirror_point()
    for side, sname in ((1, 'L'), (-1, 'R')):
        E.append(mount('headlight_' + sname, (c3[0], side * c3[1], c3[2]), dict(cat='headlight', side=-side, recess='round', recess_d=D['lamp_d'],
                                                                                 recess_depth=0.07)))
        E.append(mount('taillight_' + sname, (tp[0], side * tp[1], tp[2]), dict(cat='taillight', side=-side, recess='rect',
                                                                                recess_w=round(EX.TAIL[1] - EX.TAIL[0], 3),
                                                                                recess_h=round(EX.TAIL[3] - EX.TAIL[2], 3), recess_depth=0.045,
                                                                                on='rear wall, outer corners')))
        E.append(mount('mirror_' + sname, (mp[0], side * mp[1], mp[2] + 0.02), dict(cat='mirror', side=-side)))
        E.append(mount('armor_' + sname, (-1.55, side * (D['bw'] + 0.005), 1.05), dict(cat='armor', side=-side, fit=[4.2, 0.05, 0.50])))
    E.append(mount('roof', (-1.30, 0.0, D['bz1']), dict(cat='roof', fit=[2.2, 1.8, 0.2])))
    E.append(mount('horn', (2.62, 0.40, 0.78), dict(cat='horn')))
    E.append(mount('radio', (IN.DASH_FACE_X, 0.0, 1.278), dict(cat='radio', slot=[0.186, 0.046], slot_depth=0.06)))
    E.append(mount('handbrake', (IN.HB_X, IN.HB_Y, IN.TUNNEL['top'] + 0.006), dict(cat='handbrake', note='on the tunnel beside the gear lever, towards the driver: seen when the driver looks down to the right')))
    E.append(mount('gearLever', (IN.GEAR_X, 0.0, IN.TUNNEL['top'] + 0.014), dict(cat='gearLever')))
    p_, d_ = IN.steering_mount()
    pi_ = p_ + d_ * 0.13 + np.array([0.0, -0.05, 0.0])
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
    # the factory colours (palette.ts): Cream body, Orange band
    for name, hx in (('paint', 0xede3c8), ('paint_b', 0xe07b39)):
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
    tgt = (-0.4, 0, 1.4)
    for name, yaw, pitch, dist in (('f34', 35, 8, 13.5), ('r34', 145, 11, 13.5), ('side_l', 270, 2, 14.5), ('side_r', 90, 2, 14.5),
                                   ('front', 0, 4, 12.0), ('rear', 180, 7, 12.0)):
        PV.orbit(tgt, yaw, pitch, dist, lens=50)
        PV.render(f'{SCRATCH}_{name}.png', res=res, samples=smp)
    PV.orbit((-0.5, 0, 1.0), 270, 89.5, 12, ortho=7.6)
    PV.render(f'{SCRATCH}_top.png', res=(1400, 720), samples=16)
    eye = Vector(IN.EYE)
    PV.camera(tuple(eye), tuple(eye + Vector((1.0, -0.02, -0.16))), lens=24)
    PV.render(f'{SCRATCH}_driver.png', res=res, samples=smp)

    def hide(names, h=True):
        for n in names:
            o = bpy.data.objects.get(n)
            if o:
                o.hide_render = h
                for c in o.children:
                    c.hide_render = h
    hide(['P_hood'])
    PV.camera((4.4, 1.5, 2.6), (2.25, 0.0, 0.95), lens=40)
    PV.render(f'{SCRATCH}_bay.png', res=res, samples=smp)
    hide(['P_hood'], False)
    hide(['P_door_FL'])
    PV.camera((1.5, 3.3, 1.65), (1.3, 0.5, 1.15), lens=40)
    PV.render(f'{SCRATCH}_open_door_FL.png', res=res, samples=smp)
    hide(['P_door_FL'], False)
    hide(['P_door_side'])
    PV.camera((0.4, -3.6, 1.75), (-0.3, -0.5, 1.45), lens=35)
    PV.render(f'{SCRATCH}_open_door_side.png', res=res, samples=smp)
    hide(['P_door_side'], False)
    hide(['P_trunk'])
    PV.camera((-5.6, 1.6, 1.5), (-3.9, 0.38, 1.1), lens=40)
    PV.render(f'{SCRATCH}_open_trunk.png', res=res, samples=smp)
    hide(['P_trunk'], False)
    # inside the living module, looking forward and back
    PV.camera((-3.2, -0.2, 1.75), (1.2, 0.3, 1.35), lens=22)
    PV.render(f'{SCRATCH}_inside_fwd.png', res=res, samples=smp)
    PV.camera((0.7, -0.4, 1.70), (-3.5, 0.2, 1.30), lens=22)
    PV.render(f'{SCRATCH}_inside_back.png', res=res, samples=smp)
    hide(['P_door_FL', 'P_door_FR', 'P_hood', 'P_trunk', 'P_door_side'])
    PV.orbit(tgt, 35, 14, 13.5, lens=50)
    PV.render(f'{SCRATCH}_stripped.png', res=res, samples=smp)
    hide(['P_door_FL', 'P_door_FR', 'P_hood', 'P_trunk', 'P_door_side'], False)
    g = bpy.data.objects.get('preview_ground')
    if g:
        g.hide_render = True
    PV.camera((3.0, -4.0, -2.2), (-0.5, 0.0, 0.45), lens=30)
    PV.render(f'{SCRATCH}_under.png', res=res, samples=smp)
    if g:
        g.hide_render = False
