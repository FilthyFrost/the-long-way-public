"""Goat assembly: objects, origins, mounts, JSON, AO, export and previews. Called from frames/goat.py main()."""
import math
import os
import sys
import time

sys.dont_write_bytecode = True

import bpy  # noqa: E402
import numpy as np  # noqa: E402
from mathutils import Vector  # noqa: E402

from frames import _goat_ext as EX  # noqa: E402
from frames import _goat_inner as IN  # noqa: E402
from frames import _kit as K  # noqa: E402
from frames import _preview as PV  # noqa: E402
from frames import goat as S  # noqa: E402
from frames._sedan_build import game_vec, knuckles, mount, needle, obj_with_origin, plate_buf  # noqa: E402
from lib import modcar as mc  # noqa: E402

D = S.D
ER = S.ER
OUT_GLB = 'public/models/modcar/frames/goat.glb'
OUT_JSON = 'src/core/modcar/data/mounts/goat.json'
SCRATCH = 'D:/modcar-scratch/frames/goat/goat'


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
    print('[goat] exterior surfaces', round(time.time() - t0, 1), 's')
    # ---------------------------------------------------------------- BODY
    lb_left = ex.lower_body(False)
    lb_right = ex.lower_body(True)
    common = K.Buf()
    common.extend(ex.top_front())
    common.extend(ex.greenhouse())
    common.extend(ex.roof())
    common.extend(ex.greenhouse(-0.03))
    door = ex.door_skin().extend(ex.door_frame())
    eb, pedges = edges(ex)
    common.extend(eb)
    common.extend(opening_details(ex))
    common.extend(IN.engine_bay())
    common.extend(trims(ex))
    common.extend(flares(ex))
    left = K.Buf().extend(common).extend(lb_left)
    right = K.Buf().extend(common).extend(lb_right).extend(IN.fuel_details(ex))
    body = K.Buf().extend(left).extend(right.mirrored())
    body.extend(IN.engine_bay_asym())
    body.extend(centre_trims(ex))
    objs = [body.to_object('BODY')]
    print('[goat] body', round(time.time() - t0, 1), 's')
    panels = {}
    # ---------------------------------------------------------------- doors (hinged at the A pillar's foot)
    gl = ex.glass()
    door.extend(pedges['door'])
    door.extend(IN.door_card(ex))
    door.extend(IN.door_extras(ex))
    door.extend(IN.door_frame_inner(ex))
    yh = float(S.side_w(D['fd_front'], 1.0)) - 0.004
    for side, sname in ((1, 'L'), (-1, 'R')):
        mid = 'door_F' + sname
        hinge = np.array([D['fd_front'] + 0.004, side * yh, 1.01])
        buf = door if side > 0 else door.mirrored()
        o = obj_with_origin(buf, 'P_' + mid, hinge)
        gb = gl['door'] if side > 0 else gl['door'].mirrored()
        og = obj_with_origin(gb, 'PG_' + mid, hinge, parent=o)
        objs += [o, og]
        panels['P_' + mid] = dict(mount=mid, glass='PG_' + mid, hinge='z', hinge_pos=hinge, axis=(0, 0, 1), open_deg=-70.0 * side)
    # ---------------------------------------------------------------- bonnet, rear door, fuel flap
    hb = ex.hood()
    hb.extend(pedges['hood'])
    hb.extend(IN.hood_inner(ex))
    hb.extend(hood_details())
    hinge = np.array([D['hood_rear'] - 0.008, 0.0, 1.13])
    objs.append(obj_with_origin(both(hb), 'P_hood', hinge))
    panels['P_hood'] = dict(mount='hood', hinge='y', hinge_pos=hinge, axis=(0, 1, 0), open_deg=-55.0)
    rd, rdg = rear_door(ex, pedges)
    rhinge = np.array([D['xr'] - 0.008, -(D['rd_y'] + 0.006), 1.14])
    o = obj_with_origin(rd, 'P_trunk', rhinge)
    og = obj_with_origin(rdg, 'PG_trunk', rhinge, parent=o)
    objs += [o, og]
    panels['P_trunk'] = dict(mount='trunk', glass='PG_trunk', hinge='z', hinge_pos=rhinge, axis=(0, 0, 1), open_deg=100.0)
    ff = IN.fuel_flap(ex).mirrored()
    fc = ex.cut['fuel'].P.mean(0)
    fhinge = np.array([fc[0] + 0.056, -(fc[1] + 0.002), fc[2]])
    objs.append(obj_with_origin(ff, 'FUEL_CAP', fhinge))
    panels['FUEL_CAP'] = dict(mount=None, hinge='z', hinge_pos=fhinge, axis=(0, 0, 1), open_deg=85.0)
    # ---------------------------------------------------------------- GLASS, UNDER, INTERIOR
    g = K.Buf()
    for kind in ('ws', 'fixed'):
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
    for wname, wy, wl in (('WIPER_L', 0.62, 0.50), ('WIPER_R', -0.05, 0.50)):
        wb, info = wiper(wy, wl)
        objs.append(obj_with_origin(wb, wname, info['pivot'], rot=info['rot']))
        wipers[wname] = info
    print('[goat] objects', round(time.time() - t0, 1), 's')
    empties = mounts(ex, panels)
    objs += knuckles(empties, IN.knuckle)
    K.drop_all(objs, empties, panels, (needles, wipers), -D.get('body_drop', 0.0))
    meshes = [o for o in objs if o.type == 'MESH']
    tris = {o.name: mc.triangles([o]) for o in meshes}
    total = sum(tris.values())
    print('[goat] triangles', total, {k: v for k, v in sorted(tris.items(), key=lambda kv: -kv[1])[:10]})
    if not quick:
        # the bay is baked with the bonnet up (the tutorial looks into it with the bonnet open)
        hood = next(o for o in meshes if o.name == 'P_hood')
        K.bake_ao_open(meshes, [(hood, panels['P_hood']['axis'], panels['P_hood']['open_deg'])],
                       ((IN.DOG_X - 0.01, -0.82, 0.30), (IN.RAD_X + 0.10, 0.82, 1.16)), samples=32, distance=0.35)
    if not quick:
        # the dial faces once more without the needles over them
        K.rebake_mats(o_int, [o for o in meshes if o.name.startswith('N_')], ('gauge',), samples=32, distance=0.35)
    K.join_white(o_int, dial_glass)
    tris = {o.name: mc.triangles([o]) for o in meshes}
    total = sum(tris.values())
    print('[goat] grime masks', K.mask_frame(meshes))
    mc.export_glb(OUT_GLB, meshes + empties)
    mc.mounts_json(OUT_JSON, 'goat', json_extra(objs, panels, needles, wipers, tris, total))
    print('[goat] exported', round(time.time() - t0, 1), 's')
    if not no_preview:
        previews(quick)
    print('[goat] done', round(time.time() - t0, 1), 's')


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
    cen = (float(S.ws_x(0.0, 1.45)) - 0.1, 0.0, 1.45)
    E = EX.side_dir(wv['P'], wv['N'], np.tile(cen, (len(wv['P']), 1)), False)
    V, N, T = roll(wv['P'], wv['N'], E, 0.004, 0.032, 0.0, 2, closed=False)
    body.add(V, N, T, 'paint')
    for (P, N), uv in zip(ex.arch_P, ex.arch_uv):
        keep = uv[:, 1] >= S.L_T[1] - 1e-6
        P, N = P[keep], N[keep]
        cc = np.array([P[:, 0].mean(), P[:, 1].mean(), D['arch_z']])
        E = EX.side_dir(P, N, np.tile(cc, (len(P), 1)), False)
        V, Nn, T = roll(P, N, E, 0.006, 0.04, 0.0, 2, closed=False)
        body.add(V, Nn, T, 'paint')
    # the rear door's cut: the body's side (lower and upper), the door's
    ro = ex.rd_out
    E = EX.side_dir(ro['P'], ro['N'], nearest(ro['P'], ex.cut['rdL'].P), False)
    V, N, T = roll(ro['P'], ro['N'], E, ER, 0.06, 0.0, 2, closed=False)
    body.add(V, N, T, 'paint')
    s_ = ex.cut['rdL'].side('in')
    V, N, T = roll(s_['P'], s_['N'], s_['E'], ER, 0.05, 0.012, 2, closed=False, hem_segs=0)
    panels['rear'] = K.Buf().add(V, N, T, 'paint')
    so = ex.cut['rdG'].side('out')
    V, N, T = roll(so['P'], so['N'], so['E'], ER, 0.04, 0.0, 2, closed=False)
    body.add(V, N, T, 'paint')
    si = ex.cut['rdG'].side('in')
    V, N, T = roll(si['P'], si['N'], si['E'], ER, 0.04, 0.012, 2, closed=False, hem_segs=0)
    panels['rear'].add(V, N, T, 'paint')
    rw = ex.rear_win
    E = EX.side_dir(rw['P'], rw['N'], np.tile(rw['P'].mean(0) * (1, 0, 1), (len(rw['P']), 1)), False)
    V, N, T = roll(rw['P'], rw['N'], E, 0.004, 0.035, 0.0, 2, closed=False)
    panels['rear'].add(V, N, T, 'paint')
    # the fixed rear side windows
    for name, (poly, P, Nn) in ex.fixed_P.items():
        E = EX.side_dir(P, Nn, np.tile(P.mean(0), (len(P), 1)), True)
        V, N, T = roll(P, Nn, E, 0.004, 0.035, 0.0, 2, closed=True)
        body.add(V, N, T, 'paint')
    return body, panels


def opening_details(ex):
    """The grille (a dark panel with four body-coloured slats), the round lamps' buckets in their cream square
    surrounds, the amber indicators, the tail lamps' recesses."""
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
    # the cream square surround standing 4 mm proud of the nose, round the lamp's bezel
    s_ = D['surround']
    sq = K.rounded_poly(np.array([(D['lamp_y'] - s_, D['lamp_z'] - s_), (D['lamp_y'] + s_, D['lamp_z'] - s_), (D['lamp_y'] + s_, D['lamp_z'] + s_),
                                  (D['lamp_y'] - s_, D['lamp_z'] + s_)]), [0.022] * 4, 0.02, arc_step=0.006)
    P, Nn = S.FRONT_L.to3d(sq)
    hole = K.circle_loop(D['lamp_y'], D['lamp_z'], D['lamp_d'] / 2 + 0.006, 0.011)
    Ph, Nh = S.FRONT_L.to3d(hole)
    b.extend(ring_plate(P, Nn, Ph, Nh, 0.005, 'paint_b'))
    # indicators under the lamps (on the left only here: the build mirrors)
    p, n = S.FRONT_L.to3d(np.array([[D['lamp_y'] + 0.01, 0.765]]))
    b.extend(K.box_buf((-0.012, -0.065, -0.026), (0.006, 0.065, 0.026), 'trim', 0.006, 2, xf=K.mat4_trs(p[0])))
    b.extend(K.box_buf((0.004, -0.058, -0.019), (0.009, 0.058, 0.019), 'lens_amber', 0.004, 1, xf=K.mat4_trs(p[0])))
    # the tail lamp recess on the rear wall's outer strip
    tl = ex.open['tail']
    ct = tl['P'].mean(0)
    E = EX.side_dir(tl['P'], tl['N'], np.tile(ct, (len(tl['P']), 1)), True)
    V, N, T = K.roll_edge(tl['P'], tl['N'], E, 0.003, 0.04, 0.0, 2, closed=True, flange_dir=(1, 0, 0))
    b.add(V, N, T, 'paint')
    ring = V.reshape(-1, len(tl['P']), 3)[-1]
    b.extend(K.fill_loop(ring, (-1, 0, 0), 'trim'))
    ex.tail_mount = (np.array([tl['P'][:, 0].mean(), ct[1], ct[2]]), -tl['N'].mean(0))
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
    ys = np.linspace(0.0, gw - 0.012, 3)
    slat = np.array([(-0.008, -0.016), (0.006, -0.016), (0.008, -0.012), (0.008, 0.012), (0.006, 0.016), (-0.008, 0.016)])
    slat = np.vstack([slat, slat[:1]])
    for k in range(4):
        z = z0 + (z1 - z0) * (k + 1) / 5
        P, _ = S.FRONT_L.to3d(np.stack([ys, np.full(len(ys), z)], 1))
        V, N, T = K.sweep(P - np.array([0.026, 0, 0]), (0, 0, 1), slat, closed=False, closed_prof=True)
        b.add(V, N, T, 'paint')
    # the vertical centre bar
    zs = np.linspace(z0 + 0.01, z1 - 0.01, 4)
    P, _ = S.FRONT_L.to3d(np.stack([np.full(len(zs), 0.0), zs], 1))
    V, N, T = K.sweep(P - np.array([0.03, 0, 0]), (1, 0, 0), np.array([(0.0, -0.014), (0.012, -0.012), (0.012, 0.0)]), closed=False)
    b.add(V, N, T, 'paint')
    return b


def flares(ex):
    """The dark flared arches standing out to flare_out: a lip over each arch's edge sloping back onto the side."""
    b = K.Buf()
    W = D['hw']
    for xa in (D['ax_f'], D['ax_r']):
        R = D['arch_f'] if xa > 0 else D['arch_r']
        za = D['arch_z']
        zb = float(S._bot(xa)) + 0.004
        th = math.asin((zb - za) / (R + D['flare_r']))
        ths = np.linspace(th, PI - th, 34)
        path = np.stack([xa + R * np.cos(ths), np.full(len(ths), W), za + R * np.sin(ths)], 1)
        rad = np.stack([np.cos(ths), np.zeros(len(ths)), np.sin(ths)], 1)
        out = D['flare_out'] - W
        fr = D['flare_r']
        # profile in (radial, lateral): from under the arch's edge round the lip and down onto the side
        prof = np.array([(-0.004, -0.02), (-0.006, out * 0.55), (-0.002, out * 0.92), (0.008, out), (0.022, out * 0.93),
                         (0.042, out * 0.55), (fr - 0.004, out * 0.12), (fr, -0.002)])
        V = (path[:, None, :] + rad[:, None, :] * prof[None, :, 0:1] + np.array([0, 1.0, 0])[None, None, :] * prof[None, :, 1:2]).reshape(-1, 3)
        Tr = K.grid_tris(len(path), len(prof))
        fb = recompute(V, Tr, 'trim', ref=np.array([xa, W - 0.2, za]))
        b.extend(fb)
        # the lip's ends cut square at the sill
        for e in (0, -1):
            ring = V.reshape(len(path), -1, 3)[e]
            b.extend(K.fill_loop(ring, (0, 0, -1), 'trim'))
    return b


def ring_plate(Po, No, Pi, Ni, h, mat):
    """A thin plate standing h off a surface between an outer loop and an inner (hole) loop, both on the surface
    with their normals: its face and its two edge bands."""
    b = K.Buf()
    n = K.unit(No.mean(0))
    of = Po + No * h
    inf = Pi + Ni * h
    b.extend(K.fill_loop(of, n, mat, holes=[inf]))
    for top, bot, inward in ((of, Po, False), (inf, Pi, True)):
        c = top.mean(0)
        d = top - c
        d = K.unit(d - n * (d @ n)[:, None])
        V = np.vstack([bot, top])
        T = K.grid_tris(2, len(top), closed=True)
        b.add(V, np.vstack([d, d]) * (-1.0 if inward else 1.0), T, mat)
    return b


def recompute(V, T, mat, ref):
    """Smooth normals for a swept sheet, turned away from a point inside."""
    acc = np.zeros_like(V)
    cr = np.cross(V[T[:, 1]] - V[T[:, 0]], V[T[:, 2]] - V[T[:, 0]])
    for k in range(3):
        np.add.at(acc, T[:, k], cr)
    N = K.unit(acc)
    if float(((V - ref) * N).sum()) < 0:
        N = -N
    return K.Buf().add(V, N, T, mat)


def trims(ex):
    """Left half: the drip rail round the roof's side and back, the windscreen's rubber seal, the rear side windows'
    seals, the sill guard between the flares, the mirror's base, the cowl's vent slots, the door's hinge knuckles."""
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
    cen = np.array([float(S.ws_x(0.0, 1.45)) - 0.1, 0.0, 1.45])
    E = EX.side_dir(P, Nn, np.tile(cen, (len(P), 1)), False)
    k = K.coarse_idx(P, 0.0012)
    P, Nn, E = P[k], Nn[k], E[k]
    prof = np.array([(-0.008, -0.006), (-0.007, 0.004), (0.0, 0.0065), (0.007, 0.004), (0.008, -0.006)])
    V, NN, T = K.sweep(P + E * 0.007 - Nn * 0.004, Nn, prof, closed=False)
    b.add(V, NN, T, 'rubber')
    # the fixed rear side window's seal
    for name, (poly, P, Nn) in ex.fixed_P.items():
        Q, Nq = S.SIDE_G.to3d(K.resample(K.offset_loop2(poly, -0.009), 0.06))
        prof = np.array([(-0.009, 0.0), (-0.008, 0.004), (0.0, 0.006), (0.008, 0.004), (0.009, 0.0)])
        V, NN, T = K.sweep(Q, Nq, prof, closed=True)
        b.add(V, NN, T, 'rubber')
    # sill guard between the flares (dark plastic over the rocker)
    xs = np.linspace(-0.74, 0.74, 12)
    zs = 0.545
    P, N = S.SIDE_L.to3d(np.stack([xs, np.full(len(xs), zs)], 1))
    prof = np.array([(0.0, -0.05), (0.008, -0.048), (0.012, -0.03), (0.012, 0.022), (0.009, 0.029), (0.0, 0.030)])
    V, NN, T = K.sweep(P, (0, 0, 1), np.stack([-prof[:, 0], prof[:, 1]], 1), closed=False)
    b.add(V, NN, T, 'trim')
    for e in (0, -1):
        b.extend(K.fill_loop(V.reshape(len(P), -1, 3)[e], (np.sign(xs[e]), 0, 0), 'trim'))
    # the mirror's base on the waist ledge at the A pillar's foot
    mp = mirror_point()
    b.extend(K.box_buf((-0.032, -0.014, -0.004), (0.032, 0.006, 0.026), 'trim', 0.006, 2, xf=K.mat4_trs(mp)))
    # cowl vent slots ahead of the windscreen
    for k in range(6):
        y = 0.08 + 0.10 * k
        p, n = S.CT.to3d(np.array([[1.052, y]]))
        b.extend(K.box_buf((-0.010, -0.035, -0.004), (0.010, 0.035, 0.0015), 'trim', 0.003, 1, xf=K.mat4_trs(p[0])))
    # the doors' exposed hinges: knuckles on the body just ahead of the door's front edge
    for zz in IN.HINGE_Z:
        p0, n0 = IN.side_pt(D['fd_front'] + 0.016, zz)
        b.extend(K.cyl_buf(p0 + (0, 0.004, -0.035), p0 + (0, 0.004, 0.035), 0.011, 'trim', 10))
        b.extend(K.box_buf(p0 + (-0.005, -0.004, -0.028), p0 + (0.030, 0.005, 0.028), 'trim', 0.004, 1))
    return b


def mirror_point():
    p, n = S.CT.to3d(np.array([[0.988, 0.830]]))
    return p[0]


def centre_trims(ex):
    """Asymmetric parts: the snorkel up the right A pillar, the rear door's hinge knuckles on the body (right), the
    goat's head mark on the nose (our own)."""
    b = K.Buf()
    W = D['hw']
    # snorkel: out of the right wing's side, a bend, up the A pillar, a head with its intake facing forward
    path = np.array([(1.255, -W + 0.004, 1.02), (1.255, -W - 0.04, 1.02), (1.21, -W - 0.068, 1.06), (1.13, -W - 0.074, 1.14),
                     (1.075, -W - 0.072, 1.30), (1.04, -W - 0.066, 1.62), (1.025, -W - 0.06, 1.88), (1.025, -W - 0.052, 1.95)])
    b.extend(K.tube_buf(smooth_path(path, 2), 0.042, 'trim', 16))
    hx, hy, hz = 1.03, -W - 0.052, 1.985
    b.extend(K.box_buf((hx - 0.10, hy - 0.06, hz - 0.045), (hx + 0.07, hy + 0.06, hz + 0.05), 'trim', 0.03, 3))
    b.extend(K.box_buf((hx + 0.064, hy - 0.045, hz - 0.032), (hx + 0.075, hy + 0.045, hz + 0.036), 'rubber', 0.006, 1))
    for zz in (1.18, 1.60):
        q = np.array([1.07 - (zz - 1.18) * 0.09, -W - 0.01, zz])
        b.extend(K.box_buf(q + (-0.02, -0.04, -0.012), q + (0.02, 0.012, 0.012), 'steel', 0.004, 1))
    # the rear door's hinge knuckles and leaves on the body (right, beside the door's edge)
    for zz in REAR_HINGES:
        x0 = float(S.rear_x(0.0, zz)) if zz < D['waist_z'] else D['rw_x']
        b.extend(K.cyl_buf((x0 - 0.010, -(D['rd_y'] + 0.008), zz - 0.04), (x0 - 0.010, -(D['rd_y'] + 0.008), zz + 0.04), 0.012, 'trim', 10))
        b.extend(K.box_buf((x0 - 0.008, -(D['rd_y'] + 0.024), zz - 0.032), (x0 + 0.003, -(D['rd_y'] + 0.004), zz + 0.032), 'trim', 0.003, 1))
    # the goat's head on the nose over the grille: a cream face, two swept-back horns, its ears
    p, n = S.FRONT_L.to3d(np.array([[0.0, D['grille_z1'] + 0.048]]))
    c = p[0] + np.array([0.003, 0, 0])
    face = np.array([(c[0], 0.0, c[2] - 0.034), (c[0], 0.020, c[2] - 0.004), (c[0], 0.016, c[2] + 0.014), (c[0], -0.016, c[2] + 0.014),
                     (c[0], -0.020, c[2] - 0.004)])
    b.extend(K.fill_loop(face, (1, 0, 0), 'paint_b'))
    for sy in (1, -1):
        horn = np.array([(c[0] + 0.001, sy * 0.010, c[2] + 0.012), (c[0] + 0.001, sy * 0.022, c[2] + 0.030), (c[0] + 0.001, sy * 0.036, c[2] + 0.034),
                         (c[0] + 0.001, sy * 0.046, c[2] + 0.026)])
        b.extend(K.tube_buf(horn, np.array([0.0045, 0.004, 0.0032, 0.0022]), 'paint_b', 6))
        ear = np.array([(c[0] + 0.001, sy * 0.018, c[2] + 0.006), (c[0] + 0.001, sy * 0.038, c[2] + 0.004), (c[0] + 0.001, sy * 0.030, c[2] - 0.004)])
        b.extend(K.fill_loop(ear, (1, 0, 0), 'paint_b'))
    return b


def smooth_path(pts, iters=2):
    from frames._sedan_inner import smooth_path as sp
    return sp(pts, iters)


def hood_details():
    """Left half: two latches near the front edge, a vent on the left (the cream stripe is in the skin)."""
    b = K.Buf()
    for (x, y) in ((1.93, 0.46),):
        p, n = S.CT.to3d(np.array([[x, y]]))
        b.extend(K.box_buf((-0.03, -0.012, -0.003), (0.03, 0.012, 0.012), 'trim', 0.004, 2, xf=K.mat4_trs(p[0])))
    p, n = S.CT.to3d(np.array([[1.52, 0.42]]))
    b.extend(K.box_buf((-0.13, -0.10, -0.004), (0.13, 0.10, 0.006), 'trim', 0.006, 2, xf=K.mat4_trs(p[0])))
    for k in range(5):
        x = 1.43 + 0.045 * k
        q, _ = S.CT.to3d(np.array([[x, 0.42]]))
        b.extend(K.box_buf((-0.006, -0.085, 0.004), (0.006, 0.085, 0.009), 'trim', 0.002, 1, xf=K.mat4_trs(q[0])))
    return b


# ============================================================================================ the rear door
def rear_door(ex, pedges):
    """The side-hinged rear door (both halves): its skin over both shells, the rolled edges, an inner panel with the
    window's reveal, the hinge leaves (right), the handle (left), the spare wheel on its carrier, the number plate.
    Returns (door buf, its window glass buf)."""
    half = K.Buf()
    half.extend(ex.rear_door_low())
    half.extend(ex.rear_door_high())
    half.extend(pedges['rear'])
    b = both(half)
    # the inner panel (one flat sheet inside the door) with the window's opening, its reveal
    xi = D['xr'] + 0.05
    y1, z0, z1 = D['rd_y'] - 0.012, D['rd_z0'] + 0.012, D['rd_z1'] - 0.012
    outer = K.rounded_poly(np.array([(xi, -y1, z0), (xi, y1, z0), (xi, y1, z1), (xi, -y1, z1)])[:, 1:], [0.03] * 4, 0.05, arc_step=0.01)
    hole = K.rounded_poly(np.array([(-D['rw_y'] - 0.01, D['rw_z0'] - 0.01), (D['rw_y'] + 0.01, D['rw_z0'] - 0.01),
                                    (D['rw_y'] + 0.01, D['rw_z1'] + 0.01), (-D['rw_y'] - 0.01, D['rw_z1'] + 0.01)]), [0.04] * 4, 0.05, arc_step=0.01)
    P = np.stack([np.full(len(outer), xi), outer[:, 0], outer[:, 1]], 1)
    H = np.stack([np.full(len(hole), xi), hole[:, 0], hole[:, 1]], 1)
    b.extend(K.fill_loop(P, (1, 0, 0), 'plastic_int', holes=[H]))
    # the door's grab handle inside and its lock rod
    b.extend(K.box_buf((xi + 0.002, 0.47, 1.15), (xi + 0.02, 0.55, 1.19), 'trim', 0.006, 1))
    # hinge leaves on the door's right edge
    for zz in REAR_HINGES:
        x0 = float(S.rear_x(0.0, zz)) if zz < D['waist_z'] else D['rw_x']
        b.extend(K.box_buf((x0 - 0.012, -(D['rd_y'] - 0.06), zz - 0.028), (x0 - 0.002, -(D['rd_y'] + 0.002), zz + 0.028), 'trim', 0.003, 1))
    # the handle on the left (a recess and a chrome pull), a key barrel
    xh = float(S.rear_x(0.0, 1.10))
    b.extend(K.box_buf((xh - 0.004, 0.47, 1.08), (xh + 0.002, 0.59, 1.12), 'trim', 0.006, 1))
    b.extend(K.box_buf((xh - 0.014, 0.485, 1.088), (xh - 0.002, 0.575, 1.106), 'chrome', 0.006, 2))
    b.extend(K.cyl_buf((xh - 0.006, 0.42, 1.10), (xh + 0.002, 0.42, 1.10), 0.0095, 'chrome', 12))
    # the spare wheel on its carrier
    b.extend(spare_wheel())
    # the number plate low on the left of the door, its lamp over it
    xp = float(S.rear_x(0.0, 0.70))
    b.extend(plate_buf((xp - 0.001, 0.445, 0.70), (-1.0, 0.0, 0.0), (0.0, 0.0, 1.0), 0.30, 0.14, '4H 207'))
    b.extend(K.box_buf((xp - 0.03, 0.395, 0.78), (xp + 0.002, 0.495, 0.80), 'trim', 0.006, 2))
    glass = K.Buf().extend(ex.glass()['rear']).extend(ex.glass()['rear'].mirrored())
    return b, glass


def quad_x(x0, x1, y0, y1, z0, z1):
    """A strip from x0 to x1 (the window's reveal top or bottom face)."""
    V = np.array([(x0, y0, z0), (x1, y0, z0), (x1, y1, z0), (x0, y1, z0)])
    n = (0, 0, 1) if z1 > z0 else (0, 0, -1)
    return K.Buf().add(V, np.tile(n, (4, 1)), np.array([(0, 1, 2), (0, 2, 3)]), 'paint')


SPARE = (-0.10, 0.99, 0.37, 0.25)      # y, z, radius, width
REAR_HINGES = (0.655, 1.50)             # the rear door's hinges (the lower one under the right tail lamp)


def spare_wheel():
    """The full-size spare on the rear door: a knobbly tyre, a cream steel wheel with its hub and nuts, a dark
    carrier bracket; its back 0.30 m behind the door."""
    b = K.Buf()
    y, z, r, w = SPARE
    x0 = D['xr'] - 0.04
    xc = x0 - w / 2 - 0.02
    c = np.array([xc, y, z])
    # tyre: a lathe about x (sidewalls, shoulders, tread)
    ri = 0.21
    prof = np.array([(ri, -w * 0.42), (ri + 0.03, -w * 0.47), (r - 0.05, -w * 0.5), (r - 0.012, -w * 0.47), (r, -w * 0.36),
                     (r, w * 0.36), (r - 0.012, w * 0.47), (r - 0.05, w * 0.5), (ri + 0.03, w * 0.47), (ri, w * 0.42)])
    V, N, T = K.lathe(prof, c, (-1, 0, 0), 28)
    b.add(V, N, T, 'rubber')
    # tread blocks: two staggered rows round the crown
    for k in range(16):
        a = 2 * PI * k / 16
        for sgn, off in ((1, 0.0), (-1, PI / 16)):
            aa = a + off
            q = c + np.array([sgn * w * 0.2, r * math.cos(aa), r * math.sin(aa)])
            R = K.frame_from((1, 0, 0), (0, math.cos(aa), math.sin(aa)))
            b.extend(K.box_buf((-w * 0.17, -0.034, -0.004), (w * 0.17, 0.034, 0.014), 'rubber', 0.0, 1, xf=K.mat4_trs(q, R)))
    # the wheel: a dished cream disc with the rim's flanges, the hub, six nuts
    rim = np.array([(0.0, -0.035), (0.07, -0.035), (0.09, -0.02), (0.15, -0.012), (0.19, -0.04), (ri, -w * 0.40), (ri + 0.006, -w * 0.43)])
    V, N, T = K.lathe(np.stack([rim[:, 0], rim[:, 1]], 1), c, (-1, 0, 0), 22)
    b.add(V, N, T, 'paint_b')
    V, N, T = K.lathe(np.array([(0.0, -0.06), (0.045, -0.06), (0.05, -0.045), (0.05, -0.03)]), c, (-1, 0, 0), 16)
    b.add(V, N, T, 'chrome')
    for k in range(6):
        a = 2 * PI * k / 6
        p = c + np.array([-0.04, 0.07 * math.cos(a), 0.07 * math.sin(a)])
        b.extend(K.cyl_buf(p, p + (-0.012, 0, 0), 0.009, 'steel', 6))
    # carrier: a bracket off the door to the wheel's centre
    b.extend(K.box_buf((xc + 0.02, y - 0.05, z - 0.20), (x0 + 0.002, y + 0.05, z + 0.08), 'trim', 0.01, 2))
    b.extend(K.box_buf((xc - 0.01, y - 0.04, z - 0.04), (xc + 0.06, y + 0.04, z + 0.04), 'trim', 0.008, 2))
    return b


# ============================================================================================ wipers
def wiper(y_pivot, length):
    zj = D['belt_z'] - 0.02
    p = np.array([float(S.ws_x(abs(y_pivot), zj)) + 0.04, y_pivot, zj])
    q, n = S.CT.to3d(np.array([[p[0], p[1]]]))
    p = q[0] + n[0] * 0.004
    nrm = K.unit(np.array([math.sin(S._WR), 0.0, math.cos(S._WR)]))
    rest = np.array([0.0, -1.0, 0.0])
    rest = K.unit(rest - nrm * np.dot(rest, nrm))
    R = K.frame_from(rest, nrm)
    b = K.Buf()
    V, N, T = K.lathe(np.array([(0.0, 0.026), (0.012, 0.024), (0.016, 0.012), (0.017, 0.0)])[::-1], (0, 0, 0), (0, 0, 1), 14)
    b.add(V, N, T, 'trim')
    b.extend(K.tube_buf(np.array([(0.0, 0.0, 0.022), (0.06, 0.0, 0.034), (length, 0.0, 0.034)]), 0.0045, 'trim', 6))
    b.extend(K.box_buf((0.04, -0.008, 0.016), (length + 0.02, 0.008, 0.024), 'trim', 0.003, 1))
    b.extend(K.box_buf((0.03, -0.004, 0.004), (length + 0.03, 0.004, 0.016), 'rubber', 0.002, 1))
    Vw, Nw, Tw, Mw = b.arrays()
    out = K.Buf()
    out.add(Vw @ R.T + p, Nw @ R.T, Tw, 'trim')
    out.M = list(Mw)
    return out, dict(pivot=p, rot=R, normal=nrm, rest=rest, sweep_deg=-90.0, axis_local='y')


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
                                             note='longitudinal, over the front axle (its tube and the offset differential under it), '
                                                  'from the firewall forward; its top 2 cm under the bonnet')))
    E.append(mount('gearbox', IN.GEARBOX, dict(cat='gearbox', space_min=list(IN.GEARBOX_ROOM[0]), space_max=list(IN.GEARBOX_ROOM[1]),
                                               note="in the tunnel, its front in the doghouse; the frame's transfer case (a drop box) behind it")))
    E.append(mount('radiator', (1.985, 0.0, 0.60), dict(cat='radiator', space_min=[-0.07, -0.36, 0.0], space_max=[0.035, 0.36, 0.42])))
    E.append(mount('battery', IN.BATTERY, dict(cat='battery', space_min=[-0.15, -0.10, 0.0], space_max=[0.15, 0.10, 0.21],
                                               note='on its tray on the left inner fender, ahead of the wheel')))
    E.append(mount('fuelTank', (-1.672, 0.0, 0.30), dict(cat='fuelTank', space_min=[-0.25, -0.40, 0.0], space_max=[0.25, 0.40, 0.17],
                                                           note='under the rear behind the rear axle, under the rails; the filler on the right'),
                   ))
    E.append(mount('exhaust', (0.90, -0.24, 0.34), dict(cat='exhaust', tail=[-2.95, 0.0, -0.06], route='under the floor on the right, out under the right rear corner')))
    p, d = IN.steering_mount()
    ang = math.radians(28)
    E.append(mount('steering', tuple(p), dict(cat='steering', column_deg=28.0), rot=K.frame_from(d, (math.sin(ang), 0, math.cos(ang)))))
    fz = IN.FLOOR_Z + 0.03
    for name, x, y, drv, side, note in (('seat_driver', IN.SEAT_X, IN.DRIVER_Y, True, -1, ''), ('seat_pass', IN.SEAT_X, -IN.DRIVER_Y, False, 1, ''),
                                        ('seat_rear', IN.REAR_SEAT_X, 0.0, False, 0, 'a bench across the rear, ahead of the rear wheel tubs')):
        E.append(mount(name, (x, y, fz), dict(cat='seat', driver=drv, floor_z=round(fz, 4), side=side, note=note)))
    for pname, info in panels.items():
        if info['mount'] is None:
            continue
        m = info['mount']
        cat = 'door' if m.startswith('door') else m
        side = (-1 if m.endswith('L') else 1) if m.startswith('door') else 0
        extra = dict(cat=cat, panel=pname, hinge=info['hinge'], open_deg=info['open_deg'], side=side)
        if m == 'trunk':
            extra['note'] = 'the side-hinged rear door, hinged on the right, the spare wheel on it'
        E.append(mount(m, tuple(info['hinge_pos']), extra))
    zf = 0.55
    xb = float(S.front_x(0.0, zf))
    E.append(mount('bumperFront', (xb + 0.005, 0.0, zf), dict(cat='bumperFront', fit=[0.13, 1.76, 0.17])))
    zr = 0.52
    E.append(mount('bumperRear', (float(S.rear_x(0.0, zr)) - 0.005, 0.0, zr), dict(cat='bumperRear', fit=[0.12, 1.74, 0.12])))
    c3, n3 = ex.lamp_mount
    tp, tn = ex.tail_mount
    mp = mirror_point()
    for side, sname in ((1, 'L'), (-1, 'R')):
        E.append(mount('headlight_' + sname, (c3[0], side * c3[1], c3[2]), dict(cat='headlight', side=-side, recess='round', recess_d=D['lamp_d'],
                                                                                 recess_depth=0.075)))
        # (rolled a quarter turn about x: the stock cluster's width stands up in the narrow recess, its amber on top;
        # the game mirrors the right-hand part in its local z, hence the opposite roll there)
        roll_ = np.array([[1.0, 0.0, 0.0], [0.0, 0.0, -side], [0.0, side, 0.0]])
        E.append(mount('taillight_' + sname, (tp[0], side * tp[1], tp[2]), dict(cat='taillight', side=-side, recess='rect',
                                                                                recess_w=round(D['tail_y1'] - D['tail_y0'], 3),
                                                                                recess_h=round(D['tail_z1'] - D['tail_z0'], 3), recess_depth=0.04,
                                                                                on='rear wall, outboard of the rear door; rolled 90 deg: a cluster stands on end, amber on top'),
                       rot=roll_))
        E.append(mount('mirror_' + sname, (mp[0], side * mp[1], mp[2] + 0.02), dict(cat='mirror', side=-side)))
        E.append(mount('armor_' + sname, (0.0, side * (D['hw'] + 0.01), 0.80), dict(cat='armor', side=-side, fit=[1.44, 0.05, 0.36], fit_anchor='center',
                                                                                     note='between the flares, over the door')))
    E.append(mount('roof', (-0.46, 0.0, D['roof_z']), dict(cat='roof', fit=[2.50, 1.30, 0.15], fit_anchor='center')))
    E.append(mount('horn', (1.965, 0.44, 0.70), dict(cat='horn')))
    E.append(mount('radio', (IN.DASH_FACE_X, 0.0, 0.975), dict(cat='radio', slot=[0.18, 0.046], slot_depth=0.06)))
    E.append(mount('handbrake', (IN.HB_X, 0.0, IN.tunnel_h(IN.HB_X) + 0.006), dict(cat='handbrake', note='on the tunnel behind the levers')))
    E.append(mount('gearLever', (IN.GEAR_X, 0.0, IN.tunnel_h(IN.GEAR_X) + 0.014), dict(cat='gearLever')))
    p_, d_ = IN.steering_mount()
    pi_ = p_ + d_ * 0.045 + np.array([0.0, -0.047, 0.0])
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


def previews(quick):
    os.makedirs(os.path.dirname(SCRATCH), exist_ok=True)
    PV.materials()
    # the factory colours (specs/vehicles/van_offroad_models.md section 2): faded brick body, cream roof
    for name, hx in (('paint', 0xa5553f), ('paint_b', 0xece2c8)):
        m = bpy.data.materials.get(name)
        bs = m.node_tree.nodes.get('Principled BSDF') if m and m.node_tree else None
        if bs is not None:
            bs.inputs['Base Color'].default_value = _srgb(hx)
    PV.scene_setup('anime')
    res = (1280, 720)
    smp = 24 if quick else 48
    for name, yaw, pitch, dist in (('f34', 35, 9, 8.6), ('r34', 145, 12, 8.6), ('side_l', 270, 2, 9.6), ('side_r', 90, 2, 9.6),
                                   ('front', 0, 4, 8.0), ('rear', 180, 8, 8.0)):
        PV.orbit((0, 0, 0.95), yaw, pitch, dist, lens=50)
        PV.render(f'{SCRATCH}_{name}.png', res=res, samples=smp)
    PV.orbit((0.05, 0, 0.9), 270, 89.5, 10, ortho=4.9)
    PV.render(f'{SCRATCH}_top.png', res=(1400, 720), samples=16)
    eye = Vector(IN.EYE)
    # a stand-in ring where the steering part goes (not exported), to judge the dials through it
    ring = steering_ring()
    PV.camera(tuple(eye), tuple(eye + Vector((1.0, -0.02, -0.16))), lens=24)
    PV.render(f'{SCRATCH}_driver.png', res=res, samples=smp)
    PV.camera(tuple(eye), tuple(eye + Vector((1.0, 0.0, -0.55))), lens=30)
    PV.render(f'{SCRATCH}_driver_dials.png', res=res, samples=smp)
    ring.hide_render = True
    PV.camera(tuple(eye), tuple(eye + Vector((1.0, -0.02, -0.16))), lens=24)
    PV.render(f'{SCRATCH}_driver_nowheel.png', res=res, samples=smp)

    def hide(names, h=True):
        for n in names:
            o = bpy.data.objects.get(n)
            if o:
                o.hide_render = h
                for c in o.children:
                    c.hide_render = h
    hide(['P_hood'])
    PV.camera((3.5, 1.3, 2.25), (1.45, 0.0, 0.82), lens=40)
    PV.render(f'{SCRATCH}_bay.png', res=res, samples=smp)
    PV.camera((1.45, 0.0, 3.1), (1.45, 0.0, 0.6), lens=34)
    PV.render(f'{SCRATCH}_bay_top.png', res=res, samples=smp)
    hide(['P_hood'], False)
    hide(['P_door_FL'])
    PV.camera((0.5, 2.9, 1.5), (0.35, 0.4, 1.0), lens=40)
    PV.render(f'{SCRATCH}_open_door_FL.png', res=res, samples=smp)
    hide(['P_door_FL'], False)
    hide(['P_trunk'])
    PV.camera((-4.2, -1.4, 1.9), (-1.4, 0.0, 0.95), lens=40)
    PV.render(f'{SCRATCH}_open_trunk.png', res=res, samples=smp)
    PV.camera((-0.9, -0.3, 1.70), (-1.9, 0.3, 0.8), lens=26)
    PV.render(f'{SCRATCH}_rear_room.png', res=res, samples=smp)
    hide(['P_trunk'], False)
    hide(['P_door_FL', 'P_door_FR', 'P_hood', 'P_trunk'])
    PV.orbit((0, 0, 0.9), 35, 14, 8.6, lens=50)
    PV.render(f'{SCRATCH}_stripped.png', res=res, samples=smp)
    hide(['P_door_FL', 'P_door_FR', 'P_hood', 'P_trunk'], False)
    g = bpy.data.objects.get('preview_ground')
    if g:
        g.hide_render = True
    PV.camera((2.4, -3.0, -1.5), (0.0, 0.0, 0.40), lens=35)
    PV.render(f'{SCRATCH}_under.png', res=res, samples=smp)
    PV.camera((0.3, 0.0, -2.6), (0.3, 0.0, 0.4), lens=24)
    PV.render(f'{SCRATCH}_under_flat.png', res=res, samples=smp)
    if g:
        g.hide_render = False


def steering_ring():
    """A dark ring of the stock wheel's size on the steering mount (previews only)."""
    p, d = IN.steering_mount()
    c = p - d * 0.084
    a = np.linspace(0, 2 * PI, 40, endpoint=False)
    ang = math.radians(28)
    up = np.array([math.sin(ang), 0.0, math.cos(ang)])
    side = np.cross(up, d)
    pts = np.array([c + 0.176 * (math.cos(t) * side + math.sin(t) * up) for t in a])
    b = K.tube_buf(np.vstack([pts, pts[:1]]), 0.02, 'trim', 8)
    b.extend(K.tube_buf(np.array([c, c - up * 0.17]), 0.012, 'trim', 6))
    b.extend(K.cyl_buf(c - d * 0.01, c + d * 0.05, 0.045, 'trim', 12))
    return b.to_object('_preview_wheel')


PI = math.pi
