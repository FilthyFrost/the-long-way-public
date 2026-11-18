"""Buffalo assembly: objects, origins, mounts, JSON, AO, export and previews. Called from frames/buffalo.py main()."""
import math
import os
import sys
import time

sys.dont_write_bytecode = True

import bpy  # noqa: E402
import numpy as np  # noqa: E402
from mathutils import Matrix, Vector  # noqa: E402

from frames import _buffalo_ext as EX  # noqa: E402
from frames import _buffalo_inner as IN  # noqa: E402
from frames import _kit as K  # noqa: E402
from frames import _preview as PV  # noqa: E402
from frames import buffalo as S  # noqa: E402
from frames._sedan_build import game_vec, knuckles, mount, needle, obj_with_origin, plate_buf  # noqa: E402
from frames._sedan_inner import smooth_path  # noqa: E402
from lib import modcar as mc  # noqa: E402

D = S.D
ER = S.ER
OUT_GLB = 'public/models/modcar/frames/buffalo.glb'
OUT_JSON = 'src/core/modcar/data/mounts/buffalo.json'
SCRATCH = 'D:/modcar-scratch/frames/buffalo/buffalo'
BZ = float(S.top_z(1.8, 0.0))      # the bonnet's top (flat)


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
    print('[buffalo] exterior surfaces', round(time.time() - t0, 1), 's')
    # ---------------------------------------------------------------- BODY
    bed_l = ex.bed_outer(fuel=False)
    bed_r = ex.bed_outer(fuel=True)
    common = K.Buf()
    common.extend(ex.lower_body())
    common.extend(ex.top_front())
    common.extend(ex.greenhouse())
    common.extend(ex.roof())
    common.extend(ex.greenhouse(-0.03))
    doors = {w: ex.door_skin(w).extend(ex.door_frame(w)) for w in ('F', 'R')}
    eb, pedges = edges(ex)
    common.extend(eb)
    common.extend(opening_details(ex))
    common.extend(IN.engine_bay())
    common.extend(trims(ex))
    common.extend(ex.bed_inner())
    common.extend(sports_bar())
    left = K.Buf().extend(common).extend(bed_l)
    right = K.Buf().extend(common).extend(bed_r).extend(IN.fuel_details(ex))
    body = K.Buf().extend(left).extend(right.mirrored())
    body.extend(IN.engine_bay_asym())
    body.extend(centre_trims(ex))
    objs = [body.to_object('BODY')]
    print('[buffalo] body', round(time.time() - t0, 1), 's')
    panels = {}
    # ---------------------------------------------------------------- doors (front ones hinged at the A pillar's foot,
    # rear ones at the B pillar)
    gl = ex.glass()
    for w, xh, odeg in (('F', D['fd_front'], -70.0), ('R', D['rd_front'], -68.0)):
        db = doors[w]
        db.extend(pedges['door_' + w])
        db.extend(IN.door_card(ex, w))
        db.extend(IN.door_extras(ex, w))
        db.extend(IN.door_frame_inner(ex, w))
        db.extend(door_moulding(w))
        yh = float(S.side_w(xh, D['shoulder_z'])) - 0.004
        for side, sname in ((1, 'L'), (-1, 'R')):
            mid = 'door_%s%s' % (w, sname)
            hinge = np.array([xh + 0.004, side * yh, 0.95])
            buf = db if side > 0 else db.mirrored()
            o = obj_with_origin(buf, 'P_' + mid, hinge)
            gb = gl['door_' + w] if side > 0 else gl['door_' + w].mirrored()
            og = obj_with_origin(gb, 'PG_' + mid, hinge, parent=o)
            objs += [o, og]
            panels['P_' + mid] = dict(mount=mid, glass='PG_' + mid, hinge='z', hinge_pos=hinge, axis=(0, 0, 1), open_deg=odeg * side)
    # ---------------------------------------------------------------- bonnet, tailgate, fuel flap
    hb = ex.hood()
    hb.extend(pedges['hood'])
    hb.extend(IN.hood_inner(ex))
    hb.extend(hood_details())
    hinge = np.array([D['hood_rear'] - 0.008, 0.0, BZ - 0.005])
    objs.append(obj_with_origin(both(hb), 'P_hood', hinge))
    panels['P_hood'] = dict(mount='hood', hinge='y', hinge_pos=hinge, axis=(0, 1, 0), open_deg=-55.0)
    tg = ex.tailgate()
    tg.extend(plate_buf((D['bed_xr'] - 0.006, 0.0, 0.93), (-1.0, 0.0, 0.0), (0.0, 0.0, 1.0), 0.33, 0.15, '4H 618'))
    thinge = np.array([D['bed_xr'] + 0.02, 0.0, D['bed_floor'] - 0.004])
    objs.append(obj_with_origin(tg, 'P_trunk', thinge))
    panels['P_trunk'] = dict(mount='trunk', hinge='y', hinge_pos=thinge, axis=(0, 1, 0), open_deg=-90.0)
    ff = IN.fuel_flap(ex).mirrored()
    fc = ex.cut['fuel'].P.mean(0)
    fhinge = np.array([fc[0] + 0.056, -(fc[1] + 0.002), fc[2]])
    objs.append(obj_with_origin(ff, 'FUEL_CAP', fhinge))
    panels['FUEL_CAP'] = dict(mount=None, hinge='z', hinge_pos=fhinge, axis=(0, 0, 1), open_deg=85.0)
    # ---------------------------------------------------------------- GLASS, UNDER, INTERIOR
    g = K.Buf()
    for kind in ('ws', 'rw'):
        g.extend(gl[kind])
        g.extend(gl[kind].mirrored())
    objs.append(g.to_object('GLASS'))
    objs.append(both(IN.underbody(), IN.centre_under()).to_object('UNDER'))
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
        objs.append(obj_with_origin(nb, gdesc['name'], gdesc['center'], rot=rot))
        needles[gdesc['name']] = info
    wipers = {}
    for wname, wy, wl in (('WIPER_L', 0.58, 0.50), ('WIPER_R', -0.06, 0.50)):
        wb, info = wiper(wy, wl)
        objs.append(obj_with_origin(wb, wname, info['pivot'], rot=info['rot']))
        wipers[wname] = info
    print('[buffalo] objects', round(time.time() - t0, 1), 's')
    empties = mounts(ex, panels)
    objs += knuckles(empties, IN.knuckle)
    K.drop_all(objs, empties, panels, (needles, wipers), -D.get('body_drop', 0.0))
    meshes = [o for o in objs if o.type == 'MESH']
    tris = {o.name: mc.triangles([o]) for o in meshes}
    total = sum(tris.values())
    print('[buffalo] triangles', total, {k: v for k, v in sorted(tris.items(), key=lambda kv: -kv[1])[:12]})
    if not quick:
        # the bay is baked with the bonnet up (the tutorial looks into it with the bonnet open), the bonnet too
        from frames._sedan_build import bake_ao_bay
        hood = next(o for o in meshes if o.name == 'P_hood')
        bake_ao_bay(meshes, hood, panels['P_hood']['axis'], panels['P_hood']['open_deg'],
                    ((IN.FIREWALL_X - 0.01, -0.86, 0.30), (IN.RAD_X + 0.10, 0.86, BZ - 0.01)), samples=32, distance=0.35)
        # the dial faces once more without the needles over them
        K.rebake_mats(o_int, [o for o in meshes if o.name.startswith('N_')], ('gauge',), samples=32, distance=0.35)
    K.join_white(o_int, dial_glass)
    tris = {o.name: mc.triangles([o]) for o in meshes}
    total = sum(tris.values())
    print('[buffalo] grime masks', K.mask_frame(meshes))
    mc.export_glb(OUT_GLB, meshes + empties)
    mc.mounts_json(OUT_JSON, 'buffalo', json_extra(objs, panels, needles, wipers, tris, total))
    print('[buffalo] exported', round(time.time() - t0, 1), 's')
    if not no_preview:
        previews(quick)
    print('[buffalo] done', round(time.time() - t0, 1), 's')


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
    """Rolled edges of every cut: the body's side (into the gap, a flange) and the panels' (a flange with a hem); under
    the crease the band's colour."""
    body = K.Buf()
    panels = {}
    op = ex.opening_out
    ref = np.vstack([ex.cut['doorL_R'].P, ex.cut['doorL_F'].P])
    E = EX.side_dir(op['P'], op['N'], nearest(op['P'], ref), False)
    V, N, T = roll(op['P'], op['N'], E, ER, 0.10, 0.0, 2, closed=False)
    EX.add_banded(body, V, N, T)
    for w in ('F', 'R'):
        s_ = ex.cut['doorL_' + w].side('in')
        V, N, T = roll(s_['P'], s_['N'], s_['E'], ER, 0.10, 0.03, 1, closed=False, hem_segs=0)
        panels['door_' + w] = EX.add_banded(K.Buf(), V, N, T)
        so = ex.cut['doorG_' + w].side('out')
        V, N, T = roll(so['P'], so['N'], so['E'], ER, 0.032, 0.0, 2, closed=False)
        body.add(V, N, T, 'paint')
        si = ex.cut['doorG_' + w].side('in')
        V, N, T = roll(si['P'], si['N'], si['E'], ER, 0.035, 0.008, 1, closed=False, hem_segs=0)
        panels['door_' + w].add(V, N, T, 'paint')
        for name, poly in ex.cut['winG_' + w]:
            _, P, Nn = ex.win_P[(w, name)]
            E = EX.side_dir(P, Nn, np.tile(P.mean(0), (len(P), 1)), True)
            V, N, T = roll(P, Nn, E, 0.003, 0.035, 0.0, 1, closed=True)
            panels['door_' + w].add(V, N, T, 'paint')
    c = ex.cut['hood']
    so = c.side('out')
    V, N, T = roll(so['P'], so['N'], so['E'], ER, 0.03, 0.0, 2, closed=False)
    body.add(V, N, T, 'paint')
    si = c.side('in')
    V, N, T = roll(si['P'], si['N'], si['E'], ER, 0.025, 0.008, 2, closed=False, hem_segs=0)
    panels['hood'] = K.Buf().add(V, N, T, 'paint')
    for kind, cen in (('ws', (float(S.ws_x(0.0, 1.55)) - 0.1, 0.0, 1.55)), ('rw', (D['rw_x'] + 0.1, 0.0, 1.55))):
        wv = ex.win[kind]
        E = EX.side_dir(wv['P'], wv['N'], np.tile(cen, (len(wv['P']), 1)), False)
        V, N, T = roll(wv['P'], wv['N'], E, 0.004, 0.032, 0.0, 2, closed=False)
        body.add(V, N, T, 'paint')
    # the front arch's lip into the wheel well (in the band), the bed's
    for (P, N), uv in zip(ex.arch_P, ex.arch_uv):
        keep = uv[:, 1] >= S.L_T[1] - 1e-6
        P, N = P[keep], N[keep]
        cc = np.array([P[:, 0].mean(), P[:, 1].mean(), D['arch_z']])
        E = EX.side_dir(P, N, np.tile(cc, (len(P), 1)), False)
        V, Nn, T = roll(P, N, E, 0.007, 0.035, 0.0, 2, closed=False)
        body.add(V, Nn, T, 'paint_b')
    P, N = ex.bed['arch_P']
    uv = ex.bed['arch']
    keep = uv[:, 1] >= S.BED_T[1] - 1e-6
    P, N = P[keep], N[keep]
    cc = np.array([P[:, 0].mean(), P[:, 1].mean(), D['arch_z']])
    E = EX.side_dir(P, N, np.tile(cc, (len(P), 1)), False)
    V, Nn, T = roll(P, N, E, 0.007, 0.04, 0.0, 2, closed=False)
    body.add(V, Nn, T, 'paint_b')
    return body, panels


# ============================================================================================ front and rear details
def opening_details(ex):
    """The grille in its opening; the two lamps a side: the inner one the headlight mount's recess, the outer a fixed
    lamp (reflector, lens, bezel) in the same recess; the amber indicators under the outer lamps; the tail lamps'
    recesses on the bed's rear posts."""
    b = K.Buf()
    gr = ex.open['grille']
    ref = np.tile([gr['P'][:, 0].mean(), 0.0, 0.5 * (D['grille_z0'] + D['grille_z1'])], (len(gr['P']), 1))
    E = EX.side_dir(gr['P'], gr['N'], ref, False)
    V, N, T = roll(gr['P'], gr['N'], E, 0.005, 0.03, 0.0, 2, closed=False, flange_dir=(-1, 0, 0))
    b.add(V, N, T, 'paint')
    b.extend(grille(ex))
    depth = 0.06
    for name in ('lamp', 'lamp2'):
        lp = ex.open[name]
        ly, lz = lp['c']
        c3 = S.FRONT_L.to3d(np.array([[ly, lz]]))[0][0]
        E = EX.side_dir(lp['P'], lp['N'], np.tile(c3, (len(lp['P']), 1)), True)
        V, N, T = K.roll_edge(lp['P'], lp['N'], E, 0.005, 0.012, 0.0, 2, closed=True, flange_dir=(-1, 0, 0))
        b.add(V, N, T, 'paint')
        ring = V.reshape(-1, len(lp['P']), 3)[-1]
        b.extend(K.ring_tube(ring, (-1, 0, 0), depth, 1, 'trim'))
        b.extend(K.fill_loop(ring - np.array([depth, 0, 0]), (1, 0, 0), 'trim'))
        if name == 'lamp':
            ex.lamp_mount = (c3, lp['N'].mean(0))
        else:
            b.extend(fixed_lamp(c3))
    # the amber indicators under the outer lamps
    p, n = S.FRONT_L.to3d(np.array([[D['ind_y'], D['ind_z']]]))
    w2, h2 = D['ind_w'] / 2, D['ind_h'] / 2
    b.extend(K.box_buf((-0.012, -w2, -h2), (0.006, w2, h2), 'trim', 0.006, 2, xf=K.mat4_trs(p[0])))
    b.extend(K.box_buf((0.004, -w2 + 0.007, -h2 + 0.007), (0.009, w2 - 0.007, h2 - 0.007), 'lens_amber', 0.003, 1, xf=K.mat4_trs(p[0])))
    # the tail lamp recess on the rear post
    tl = ex.bed['tail']
    ct = tl['P'].mean(0)
    E = EX.side_dir(tl['P'], tl['N'], np.tile(ct, (len(tl['P']), 1)), True)
    V, N, T = K.roll_edge(tl['P'], tl['N'], E, 0.003, 0.04, 0.0, 2, closed=True, flange_dir=(1, 0, 0))
    b.add(V, N, T, 'paint')
    ring = V.reshape(-1, len(tl['P']), 3)[-1]
    b.extend(K.fill_loop(ring, (-1, 0, 0), 'trim'))
    ex.tail_mount = (np.array([tl['P'][:, 0].mean(), ct[1], ct[2]]), -tl['N'].mean(0))
    return b


def fixed_lamp(c):
    """The outer square lamp of a pair (fixed in the body, lit with the headlamps): a chrome reflector at the back of
    its recess, the clear lens a little inside the face, a chrome bezel round it."""
    b = K.Buf()
    x = float(c[0])
    w2, h2 = D['lamp_w'] / 2 - 0.008, D['lamp_h'] / 2 - 0.008
    y, z = float(c[1]), float(c[2])
    b.extend(K.box_buf((x - 0.058, y - w2 + 0.01, z - h2 + 0.01), (x - 0.048, y + w2 - 0.01, z + h2 - 0.01), 'chrome', 0.01, 2))
    b.extend(K.cyl_buf((x - 0.050, y, z), (x - 0.030, y, z), 0.022, 'emit', 12))
    b.extend(K.box_buf((x - 0.022, y - w2, z - h2), (x - 0.014, y + w2, z + h2), 'lens_head', 0.004, 1))
    for (a0, a1, b0, b1) in ((-w2 - 0.004, w2 + 0.004, h2 - 0.002, h2 + 0.006), (-w2 - 0.004, w2 + 0.004, -h2 - 0.006, -h2 + 0.002),
                             (-w2 - 0.004, -w2 + 0.004, -h2, h2), (w2 - 0.004, w2 + 0.004, -h2, h2)):
        b.extend(K.box_buf((x - 0.016, y + a0, z + b0), (x - 0.006, y + a1, z + b1), 'chrome', 0.002, 1))
    return b


def grille(ex):
    """The black grille: a dark back panel, four thick horizontal bars crossed by three vertical ones, a chrome
    surround (the buffalo's head is centre_trims')."""
    b = K.Buf()
    gw, z0, z1 = D['grille_w'], D['grille_z0'], D['grille_z1']
    g = ex.open['grille']['yz']
    loop = np.vstack([g, np.stack([np.zeros(8), np.linspace(z0, z1, 10)[1:-1]], 1)])
    loop2 = K.offset_loop2(K.ccw(loop), 0.004)
    loop2[:, 0] = np.maximum(loop2[:, 0], 0.0)
    pts = K.grid_points(0, gw, z0, z1, 0.09, dt=0.09)
    V, N, T = K.mesh_region(S.FRONT_L, [K.Loop(K.resample(loop2, 0.05))], [], pts, spacing=0.09, level=-0.034)
    b.add(V, -N, T, 'trim')
    ys = np.linspace(0.0, gw - 0.01, 4)
    bar = K.round_profile(np.array([(-0.008, -0.017), (0.008, -0.017), (0.008, 0.017), (-0.008, 0.017)]), 0.006, 1)
    bar = np.vstack([bar, bar[:1]])
    for k in range(4):
        z = z0 + (z1 - z0) * (k + 0.5) / 4
        P, _ = S.FRONT_L.to3d(np.stack([ys, np.full(len(ys), z)], 1))
        V, N, T = K.sweep(P - np.array([0.022, 0, 0]), (0, 0, 1), bar, closed=False, closed_prof=True)
        b.add(V, N, T, 'trim')
    vbar = K.round_profile(np.array([(-0.007, -0.012), (0.007, -0.012), (0.007, 0.012), (-0.007, 0.012)]), 0.005, 1)
    vbar = np.vstack([vbar, vbar[:1]])
    zs = np.linspace(z0 + 0.008, z1 - 0.008, 3)
    for yb in (0.12, 0.24):
        P, _ = S.FRONT_L.to3d(np.stack([np.full(len(zs), yb), zs], 1))
        V, N, T = K.sweep(P - np.array([0.016, 0, 0]), (1, 0, 0), vbar, closed=False, closed_prof=True)
        b.add(V, N, T, 'trim')
    P, _ = S.FRONT_L.to3d(np.stack([np.zeros(len(zs)), zs], 1))
    V, N, T = K.sweep(P - np.array([0.016, 0, 0]), (1, 0, 0), np.array([(0.0, -0.016), (0.012, -0.014), (0.012, 0.0)]), closed=False)
    b.add(V, N, T, 'trim')
    P, Ns = S.FRONT_L.to3d(g)
    path = P - np.array([0.014, 0, 0])
    prof = K.round_profile(np.array([(-0.006, -0.006), (0.006, -0.006), (0.006, 0.006), (-0.006, 0.006)]), 0.003, 1)
    prof = np.vstack([prof, prof[:1]])
    k = K.coarse_idx(path, 0.0008)
    V, N, T = K.sweep(path[k], (1, 0, 0), prof, closed=False, closed_prof=True)
    b.add(V, N, T, 'chrome')
    return b


def trims(ex):
    """Left half: the drip rail along the roof's side, the windscreen's and the rear window's seals, the cowl's vent
    slots, the mirror's base, the body side moulding along the crease (front wing, the cab's rear quarter, the bed)."""
    b = K.Buf()
    gs = ex.gs
    xs = np.linspace(float(gs.a_edge_x(D['rail_z'])) + 0.06, D['rw_x'] + D['rho_c'] + 0.01, 18)
    P, N = S.SIDE_G.to3d(np.stack([xs, np.full(len(xs), D['rail_z'] + 0.016)], 1))
    prof = np.array([(0.0, -0.004), (0.006, -0.004), (0.008, 0.0), (0.008, 0.007), (0.005, 0.009), (0.0, 0.006)])
    V, Nn, T = K.sweep(P, (0, 0, 1), np.stack([-prof[:, 0], prof[:, 1]], 1) * np.array([-1, 1]), closed=False)
    b.add(V, Nn, T, 'trim')
    for kind in ('ws', 'rw'):
        wv = ex.win[kind]
        P, Nn = wv['P'], wv['N']
        cen = np.array([float(S.ws_x(0.0, 1.55)) - 0.1, 0.0, 1.55]) if kind == 'ws' else np.array([D['rw_x'] + 0.1, 0.0, 1.55])
        E = EX.side_dir(P, Nn, np.tile(cen, (len(P), 1)), False)
        k = K.coarse_idx(P, 0.0012)
        P, Nn, E = P[k], Nn[k], E[k]
        Q = P + E * 0.006 - Nn * 0.004
        prof = np.array([(-0.007, -0.006), (-0.006, 0.003), (0.0, 0.0055), (0.006, 0.003), (0.007, -0.006)])
        V, NN, T = K.sweep(Q, Nn, prof, closed=False)
        b.add(V, NN, T, 'rubber')
        if kind == 'ws':
            prof = np.array([(-0.0045, -0.001), (-0.0035, 0.003), (0.0035, 0.003), (0.0045, -0.001)])
            V, NN, T = K.sweep(P + E * 0.0015 + Nn * 0.0005, Nn, prof, closed=False)
            b.add(V, NN, T, 'chrome')
    for k in range(7):
        y = 0.08 + 0.10 * k
        p, n = S.CT.to3d(np.array([[D['hood_rear'] - 0.035, y]]))
        b.extend(K.box_buf((-0.010, -0.035, -0.004), (0.010, 0.035, 0.0015), 'trim', 0.003, 1, xf=K.mat4_trs(p[0])))
    mp = mirror_point()
    b.extend(K.box_buf((-0.045, -0.012, -0.004), (0.045, 0.004, 0.026), 'trim', 0.006, 2, xf=K.mat4_trs(mp)))
    for (x0, x1, chart) in ((float(S.front_x(0.86, 0.8)) - D['rho_f'] - 0.02, D['fd_front'] + 0.02, S.SIDE_L),
                            (D['rd_rear'] - 0.02, D['xr'] + D['rho_r'] + 0.01, S.SIDE_L),
                            (D['bed_xf'] - 0.05, D['bed_xr'] + 0.025, S.SIDE_B)):
        b.extend(moulding(x0, x1, chart))
    return b


def moulding(x0, x1, chart):
    """A piece of the black rubber side moulding along the crease, from x0 back to x1 (x0 > x1), its ends closed."""
    xs = np.linspace(x0, x1, 4)
    P, N = chart.to3d(np.stack([xs, np.full(len(xs), D['shoulder_z'])], 1))
    prof = np.array([(0.0, -0.013), (0.004, -0.012), (0.0065, 0.0), (0.004, 0.012), (0.0, 0.013)])
    V, NN, T = K.sweep(P, (0, 0, 1), prof, closed=False)
    b = K.Buf().add(V, NN, T, 'trim')
    for e in (0, -1):
        ring = V.reshape(len(P), -1, 3)[e]
        b.extend(K.fill_loop(ring, (1 if e == 0 else -1, 0, 0), 'trim'))
    return b


def door_moulding(w):
    """The side moulding's piece on a door (rides with it)."""
    xa, xb = IN.DOORS[w]
    return moulding(xb - 0.02, xa + 0.02, S.SIDE_L)


def mirror_point():
    p, n = S.CT.to3d(np.array([[D['fd_front'] + 0.042, 0.845]]))
    return p[0]


def hood_details():
    """Left half: the latch striker at the front edge, two washer jets at the rear (the bonnet is flat and plain)."""
    b = K.Buf()
    p, n = S.CT.to3d(np.array([[D['hood_rear'] + 0.06, 0.30]]))
    b.extend(K.box_buf((-0.012, -0.008, -0.002), (0.012, 0.008, 0.010), 'trim', 0.004, 1, xf=K.mat4_trs(p[0])))
    return b


def sports_bar():
    """The sports bar behind the cab (left half): a black tube hoop standing on the bed's top rails at its front, its
    top bar across over the bed, a stay back down to the rail on each side; base plates on the rails."""
    b = K.Buf()
    xb = D['bed_xf'] - 0.13
    yb = 0.5 * (D['bed_in'] + D['bed_hw'])
    zt = D['bed_z1']
    r = 0.032
    hoop = np.array([(xb, yb, zt + 0.004), (xb, yb - 0.004, 1.50), (xb, yb - 0.015, 1.76), (xb, yb - 0.06, 1.87), (xb, yb - 0.16, 1.92),
                     (xb, 0.0, 1.925)])
    b.extend(K.tube_buf(smooth_path(hoop, 2), r, 'trim', 12))
    stay = np.array([(xb, yb - 0.01, 1.66), (xb - 0.20, yb, 1.50), (xb - 0.42, yb, zt + 0.004)])
    b.extend(K.tube_buf(smooth_path(stay, 1), 0.026, 'trim', 10))
    for x in (xb, xb - 0.42):
        b.extend(K.box_buf((x - 0.05, yb - 0.04, zt - 0.002), (x + 0.05, yb + 0.04, zt + 0.012), 'trim', 0.004, 1))
        for dx in (-0.032, 0.032):
            b.extend(K.cyl_buf((x + dx, yb, zt + 0.012), (x + dx, yb, zt + 0.02), 0.007, 'steel', 6))
    return b


def centre_trims(ex):
    """Asymmetric parts: the buffalo's head on the grille's middle (our own mark): a chrome face, two broad horns
    sweeping out and up, the ears under them, on a small dark plate."""
    b = K.Buf()
    zc = 0.5 * (D['grille_z0'] + D['grille_z1']) + 0.005
    p, n = S.FRONT_L.to3d(np.array([[0.0, zc]]))
    c = p[0] + np.array([0.004, 0, 0])
    b.extend(K.box_buf((c[0] - 0.012, -0.058, zc - 0.045), (c[0] - 0.002, 0.058, zc + 0.04), 'trim', 0.01, 2))
    face = np.array([(c[0], 0.0, zc - 0.036), (c[0], 0.013, zc - 0.030), (c[0], 0.020, zc - 0.006), (c[0], 0.021, zc + 0.010),
                     (c[0], 0.012, zc + 0.020), (c[0], -0.012, zc + 0.020), (c[0], -0.021, zc + 0.010), (c[0], -0.020, zc - 0.006),
                     (c[0], -0.013, zc - 0.030)])
    b.extend(K.fill_loop(face, (1, 0, 0), 'chrome'))
    # the face's raised rim (so it reads at a distance), the nose
    V, N, T = K.sweep(np.vstack([face, face[:1]]) + np.array([0.0015, 0, 0]), (1, 0, 0), np.array([(-0.002, 0.0), (0.0, 0.003), (0.002, 0.0)]), closed=False)
    b.add(V, N, T, 'chrome')
    b.extend(K.box_buf((c[0], -0.010, zc - 0.034), (c[0] + 0.004, 0.010, zc - 0.022), 'chrome', 0.002, 1))
    for sy in (1, -1):
        horn = smooth_path(np.array([(c[0] + 0.001, sy * 0.016, zc + 0.016), (c[0] + 0.001, sy * 0.032, zc + 0.022), (c[0] + 0.001, sy * 0.046, zc + 0.020),
                                     (c[0] + 0.001, sy * 0.054, zc + 0.030), (c[0] + 0.001, sy * 0.052, zc + 0.040)]), 1)
        b.extend(K.tube_buf(horn, np.linspace(0.0060, 0.0025, len(horn)), 'chrome', 6))
        ear = np.array([(c[0] + 0.001, sy * 0.019, zc + 0.004), (c[0] + 0.001, sy * 0.036, zc + 0.002), (c[0] + 0.001, sy * 0.026, zc - 0.008)])
        b.extend(K.fill_loop(ear, (1, 0, 0), 'chrome'))
    return b


# ============================================================================================ wipers
def wiper(y_pivot, length):
    zj = D['belt_z'] - 0.005
    p = np.array([float(S.ws_x(abs(y_pivot), zj)) + 0.045, y_pivot, zj])
    q, n = S.CT.to3d(np.array([[p[0], p[1]]]))
    p = q[0] + n[0] * 0.004
    nrm = K.unit(np.array([math.sin(S._WR), 0.0, math.cos(S._WR)]))
    rest = np.array([0.0, -1.0, 0.0])
    rest = K.unit(rest - nrm * np.dot(rest, nrm))
    R = K.frame_from(rest, nrm)
    b = K.Buf()
    V, N, T = K.lathe(np.array([(0.0, 0.026), (0.012, 0.024), (0.016, 0.012), (0.017, 0.0)])[::-1], (0, 0, 0), (0, 0, 1), 14)
    b.add(V, N, T, 'trim')
    b.extend(K.tube_buf(np.array([(0.0, 0.0, 0.022), (0.06, 0.0, 0.032), (length, 0.0, 0.032)]), 0.0045, 'trim', 6))
    b.extend(K.box_buf((0.04, -0.008, 0.014), (length + 0.02, 0.008, 0.022), 'trim', 0.003, 1))
    b.extend(K.box_buf((0.03, -0.004, 0.002), (length + 0.03, 0.004, 0.014), 'rubber', 0.002, 1))
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
                                             note='longitudinal, over the front axle (its tubes and the offset differential under '
                                                  'it), from the firewall forward to the radiator; its top under the bonnet')))
    E.append(mount('gearbox', IN.GEARBOX, dict(cat='gearbox', space_min=list(IN.GEARBOX_ROOM[0]), space_max=list(IN.GEARBOX_ROOM[1]),
                                               note="in the tunnel behind the engine; the frame's transfer case (a drop box) behind it")))
    E.append(mount('radiator', IN.RADIATOR, dict(cat='radiator', space_min=list(IN.RAD_ROOM[0]), space_max=list(IN.RAD_ROOM[1]),
                                                 note='behind the grille; room for the big radiator')))
    E.append(mount('battery', IN.BATTERY, dict(cat='battery', space_min=list(IN.BAT_ROOM[0]), space_max=list(IN.BAT_ROOM[1]),
                                               note='on its tray on the left inner fender, ahead of the wheel')))
    E.append(mount('fuelTank', IN.FUEL_TANK, dict(cat='fuelTank', space_min=list(IN.TANK_ROOM[0]), space_max=list(IN.TANK_ROOM[1]),
                                                  note='under the bed behind the rear axle, under the rails; the filler on the right')))
    E.append(mount('exhaust', (1.06, -0.25, 0.42), dict(cat='exhaust', tail=[-3.10, 0.0, -0.10], route='under the floor on the right')))
    p, d = IN.steering_mount()
    ang = math.radians(30)
    E.append(mount('steering', tuple(p), dict(cat='steering', column_deg=30.0), rot=K.frame_from(d, (math.sin(ang), 0, math.cos(ang)))))
    fz = IN.FLOOR_Z + 0.03
    for name, x, y, drv, side, note in (('seat_driver', IN.SEAT_X, IN.DRIVER_Y, True, -1, ''), ('seat_pass', IN.SEAT_X, -IN.DRIVER_Y, False, 1, ''),
                                        ('seat_rear', IN.REAR_SEAT_X, 0.0, False, 0, 'a full bench across the back of the crew cab')):
        E.append(mount(name, (x, y, fz), dict(cat='seat', driver=drv, floor_z=round(fz, 4), side=side, note=note)))
    for pname, info in panels.items():
        if info['mount'] is None:
            continue
        m = info['mount']
        cat = 'door' if m.startswith('door') else m
        side = (-1 if m.endswith('L') else 1) if m.startswith('door') else 0
        extra = dict(cat=cat, panel=pname, hinge=info['hinge'], open_deg=info['open_deg'], side=side)
        if m == 'trunk':
            extra['note'] = 'the drop tailgate, hinged at the bed floor'
        E.append(mount(m, tuple(info['hinge_pos']), extra))
    zf = 0.66
    xb = float(S.front_x(0.0, 0.80))
    E.append(mount('bumperFront', (xb + 0.005, 0.0, zf), dict(cat='bumperFront', fit=[0.16, 1.80, 0.22])))
    E.append(mount('bumperRear', (D['bed_xr'] - 0.005, 0.0, 0.67), dict(cat='bumperRear', fit=[0.14, 1.78, 0.18])))
    c3, n3 = ex.lamp_mount
    tp, tn = ex.tail_mount
    mp = mirror_point()
    for side, sname in ((1, 'L'), (-1, 'R')):
        E.append(mount('headlight_' + sname, (c3[0], side * c3[1], c3[2]), dict(cat='headlight', side=-side, recess='rect', recess_w=D['lamp_w'],
                                                                                 recess_h=D['lamp_h'], recess_depth=0.06,
                                                                                 note='the inner lamp of the pair; the outer one is the body\'s')))
        # (rolled a quarter turn about x: the stock cluster's width stands up in the post's recess, its amber on top;
        # the game mirrors the right-hand part in its local z, hence the opposite roll there)
        roll_ = np.array([[1.0, 0.0, 0.0], [0.0, 0.0, -side], [0.0, side, 0.0]])
        E.append(mount('taillight_' + sname, (tp[0], side * tp[1], tp[2]), dict(cat='taillight', side=-side, recess='rect',
                                                                                recess_w=round(D['tail_y1'] - D['tail_y0'], 3),
                                                                                recess_h=round(D['tail_z1'] - D['tail_z0'], 3), recess_depth=0.04,
                                                                                on='bed rear post; rolled 90 deg: a cluster stands on end, amber on top'),
                       rot=roll_))
        E.append(mount('mirror_' + sname, (mp[0], side * mp[1], mp[2] + 0.02), dict(cat='mirror', side=-side)))
        E.append(mount('armor_' + sname, (0.03, side * (D['hw'] + 0.005), 0.86), dict(cat='armor', side=-side, fit=[2.10, 0.05, 0.50], fit_anchor='center',
                                                                                       note='over both doors, between the arches')))
    E.append(mount('roof', (-0.03, 0.0, D['roof_z']), dict(cat='roof', fit=[1.70, 1.30, 0.15], fit_anchor='center')))
    E.append(mount('horn', (2.34, 0.52, 0.80), dict(cat='horn')))
    E.append(mount('radio', (IN.DASH_FACE_X, 0.0, 1.175), dict(cat='radio', slot=[0.18, 0.046], slot_depth=0.06)))
    E.append(mount('handbrake', (IN.HB_X, 0.0, IN.tunnel_h(IN.HB_X) + 0.006), dict(cat='handbrake', note='on the tunnel between the front seats')))
    E.append(mount('gearLever', (IN.GEAR_X, 0.0, IN.tunnel_h(IN.GEAR_X) + 0.014), dict(cat='gearLever')))
    p_, d_ = IN.steering_mount()
    pi_ = p_ + d_ * 0.12 + np.array([0.0, -0.047, 0.0])
    E.append(mount('ignition', tuple(pi_), dict(cat='ignition', on='steering column shroud, right side')))
    return E


def json_extra(objs, panels, needles, wipers, tris, total):
    from frames._sedan_build import json_extra as je
    out = je(objs, panels, needles, wipers, tris, total)
    out['eye_default'] = game_vec(np.array(IN.EYE))
    # the front differential stands off the centre line (game z, left negative), turned with its pinion towards the
    # transfer case; the rear one stays on the centre line
    out['axles'] = {'front': {'diff_z': round(-IN.FRONT_DIFF_Y, 4)}}
    return out


# ============================================================================================ previews
def _srgb(h):
    c = [((h >> k) & 255) / 255.0 for k in (16, 8, 0)]
    return tuple(v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4 for v in c) + (1.0,)


# the preview colours: sand body, a chocolate band under the crease (palette.ts Sand and Chocolate)
COLOURS = (('paint', 0xd8c29a), ('paint_b', 0x5a3a2b))


def paint_previews():
    for name, hx in COLOURS:
        m = bpy.data.materials.get(name)
        bs = m.node_tree.nodes.get('Principled BSDF') if m and m.node_tree else None
        if bs is not None:
            bs.inputs['Base Color'].default_value = _srgb(hx)


def hide(names, h=True):
    for n in names:
        o = bpy.data.objects.get(n)
        if o:
            o.hide_render = h
            for c in o.children:
                c.hide_render = h


def place_part(part, Mx, tag):
    """A part's model from public/models/modcar/parts placed by a world matrix (previews only, after the export)."""
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=f'public/models/modcar/parts/{part}.glb')
    new = [o for o in bpy.data.objects if o not in before]
    for r in [o for o in new if o.parent is None]:
        r.matrix_world = Mx @ r.matrix_world
    for o in new:
        o['tag'] = tag
    return new


def previews(quick):
    os.makedirs(os.path.dirname(SCRATCH), exist_ok=True)
    PV.materials()
    paint_previews()
    PV.scene_setup('anime')
    res = (1280, 720)
    smp = 24 if quick else 48
    for name, yaw, pitch, dist in (('f34', 35, 9, 9.6), ('r34', 145, 12, 9.6), ('side_l', 270, 2, 10.6), ('side_r', 90, 2, 10.6),
                                   ('front', 0, 4, 8.8), ('rear', 180, 8, 8.8)):
        PV.orbit((0, 0, 0.95), yaw, pitch, dist, lens=50)
        PV.render(f'{SCRATCH}_{name}.png', res=res, samples=smp)
    PV.orbit((-0.05, 0, 0.9), 270, 89.5, 10, ortho=5.6)
    PV.render(f'{SCRATCH}_top.png', res=(1400, 720), samples=16)
    eye = Vector(IN.EYE)
    PV.camera(tuple(eye), tuple(eye + Vector((1.0, -0.02, -0.16))), lens=24)
    PV.render(f'{SCRATCH}_driver.png', res=res, samples=smp)
    PV.camera(tuple(eye), tuple(eye + Vector((1.0, 0.0, -0.45))), lens=30)
    PV.render(f'{SCRATCH}_driver_dials.png', res=res, samples=smp)
    hide(['P_hood'])
    PV.camera((3.9, 1.5, 2.55), (1.65, 0.0, 0.95), lens=40)
    PV.render(f'{SCRATCH}_bay.png', res=res, samples=smp)
    PV.camera((1.65, 0.0, 3.4), (1.65, 0.0, 0.7), lens=34)
    PV.render(f'{SCRATCH}_bay_top.png', res=res, samples=smp)
    hide(['P_hood'], False)
    for pn, cam in (('P_door_FL', ((0.7, 3.1, 1.6), (0.5, 0.4, 1.1))), ('P_door_RL', ((-0.4, 3.1, 1.6), (-0.4, 0.4, 1.1)))):
        hide([pn])
        PV.camera(cam[0], cam[1], lens=40)
        PV.render(f'{SCRATCH}_open_{pn[2:]}.png', res=res, samples=smp)
        hide([pn], False)
    hide(['P_trunk'])
    PV.camera((-4.6, 1.7, 2.3), (-1.8, 0.0, 0.95), lens=40)
    PV.render(f'{SCRATCH}_open_trunk.png', res=res, samples=smp)
    hide(['P_trunk'], False)
    hide(['P_door_FL', 'P_door_FR', 'P_door_RL', 'P_door_RR', 'P_hood', 'P_trunk'])
    PV.orbit((0, 0, 0.95), 35, 14, 9.6, lens=50)
    PV.render(f'{SCRATCH}_stripped.png', res=res, samples=smp)
    hide(['P_door_FL', 'P_door_FR', 'P_door_RL', 'P_door_RR', 'P_hood', 'P_trunk'], False)
    g = bpy.data.objects.get('preview_ground')
    if g:
        g.hide_render = True
    PV.camera((2.6, -3.2, -1.6), (0.0, 0.0, 0.40), lens=35)
    PV.render(f'{SCRATCH}_under.png', res=res, samples=smp)
    PV.camera((0.2, 0.0, -2.9), (0.2, 0.0, 0.4), lens=22)
    PV.render(f'{SCRATCH}_under_flat.png', res=res, samples=smp)
    if g:
        g.hide_render = False
    axle_previews(quick)


def axle_previews(quick):
    """The front axle with diff_open where the game puts it (at the axle's middle moved to axles.front.diff_z, turned
    with its pinion back to the gearbox), the factory engine on its mount, the stock gearbox: from below, from the
    side with the body hidden, the pinion and the propshaft close."""
    AX, HZ = D['ax_f'], D['hub_z']
    place_part('diff_open', Matrix.Translation((AX, IN.FRONT_DIFF_Y, HZ)) @ Matrix.Rotation(math.pi, 4, 'Z'), 'diff')
    place_part('diff_open', Matrix.Translation((D['ax_r'], 0.0, HZ)), 'diff_rear')
    place_part('eng_i6d', Matrix.Translation(IN.ENGINE), 'engine')
    place_part('gb_4', Matrix.Translation(IN.GEARBOX), 'gearbox')
    PV.materials()
    paint_previews()
    hi = bpy.data.materials.new('diff_hi')
    hi.use_nodes = True
    hi.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (0.95, 0.62, 0.05, 1.0)
    for o in bpy.data.objects:
        if o.type == 'MESH' and o.get('tag') == 'diff':
            o.data.materials.clear()
            o.data.materials.append(hi)
    shell = ('BODY', 'P_', 'PG_', 'GLASS', 'INTERIOR', 'FUEL_CAP', 'WIPER', 'N_')
    res = (1280, 720)
    smp = 16 if quick else 32
    g = bpy.data.objects.get('preview_ground')
    if g:
        g.hide_render = True
    PV.camera((2.6, -1.9, -1.2), (1.40, 0.12, 0.34), lens=30)
    PV.render(f'{SCRATCH}_axle_under.png', res=res, samples=smp)
    PV.camera((1.75, -0.5, -0.45), (1.42, 0.22, 0.34), lens=28)
    PV.render(f'{SCRATCH}_axle_under_close.png', res=res, samples=smp)
    if g:
        g.hide_render = False
    for o in bpy.data.objects:
        if not o.get('tag') and o.name.startswith(shell):
            o.hide_render = True
    near = [o for o in bpy.data.objects if o.name == 'KNUCKLE_hub_FL']
    for o in near:
        o.hide_render = True
    PV.camera((1.45, 3.4, 0.62), (1.45, 0.0, 0.62), lens=35)
    PV.render(f'{SCRATCH}_axle_side.png', res=res, samples=smp)
    PV.camera((1.42, 1.55, 0.42), (1.45, 0.0, 0.42), lens=32)
    PV.render(f'{SCRATCH}_axle_side_close.png', res=res, samples=smp)
    PV.camera((0.92, 0.95, 0.30), (1.27, 0.30, 0.33), lens=40)
    PV.render(f'{SCRATCH}_axle_pinion.png', res=res, samples=smp)
    PV.camera((3.3, 0.0, 0.26), (1.5, 0.0, 0.36), lens=35)
    PV.render(f'{SCRATCH}_axle_front.png', res=res, samples=smp)
