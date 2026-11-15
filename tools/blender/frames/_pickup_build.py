"""Pickup assembly: objects, origins, mounts, JSON, AO, export and previews. Called from frames/pickup.py main()."""
import math
import sys
import time

sys.dont_write_bytecode = True

import bpy  # noqa: E402
import numpy as np  # noqa: E402
from mathutils import Vector  # noqa: E402

from frames import _kit as K  # noqa: E402
from frames import _pickup_ext as EX  # noqa: E402
from frames import _pickup_inner as IN  # noqa: E402
from frames import _preview as PV  # noqa: E402
from frames import pickup as S  # noqa: E402
from frames._sedan_build import badge_buf, game_vec, mount, obj_with_origin, plate_buf  # noqa: E402
from lib import modcar as mc  # noqa: E402

D = S.D
OUT_GLB = 'public/models/modcar/frames/pickup.glb'
OUT_JSON = 'src/core/modcar/data/mounts/pickup.json'
SCRATCH = 'D:/modcar-scratch/frames/pickup'


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
    print('[pickup] exterior surfaces', round(time.time() - t0, 1), 's')
    # ---------------------------------------------------------------- BODY
    bed_l = ex.bed_outer(fuel=True)
    bed_r = ex.bed_outer(fuel=False)
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
    left.extend(IN.engine_bay())
    left.extend(IN.apertures())
    left.extend(trims(ex))
    left.extend(ex.bed_inner())
    left.extend(bed_details(ex))
    right = K.Buf().extend(left)
    left.extend(bed_l)
    left.extend(IN.fuel_details(ex))
    right.extend(bed_r)
    body = K.Buf().extend(left).extend(right.mirrored())
    body.extend(IN.engine_bay_asym())
    objs = [body.to_object('BODY')]
    print('[pickup] body', round(time.time() - t0, 1), 's')
    panels = {}
    # ---------------------------------------------------------------- doors
    gl = ex.glass()
    door.extend(pedges['door'])
    door.extend(IN.door_card(ex))
    door.extend(IN.door_extras(ex))
    door.extend(IN.door_frame_inner(ex))
    door.extend(door_moulding())
    for side, sname in ((1, 'L'), (-1, 'R')):
        mid = 'door_F' + sname
        hinge = np.array([D['fd_front'], side * 0.831, 0.78])
        buf = door if side > 0 else door.mirrored()
        o = obj_with_origin(buf, 'P_' + mid, hinge)
        gb = gl['door'] if side > 0 else gl['door'].mirrored()
        og = obj_with_origin(gb, 'PG_' + mid, hinge, parent=o)
        objs += [o, og]
        panels['P_' + mid] = dict(mount=mid, glass='PG_' + mid, hinge='z', hinge_pos=hinge, axis=(0, 0, 1), open_deg=-68.0 * side)
    # ---------------------------------------------------------------- hood, tailgate, fuel flap
    hb = ex.hood()
    hb.extend(pedges['hood'])
    hb.extend(IN.hood_inner(ex))
    hinge = np.array([D['hood_rear'] - 0.008, 0.0, 1.0])
    objs.append(obj_with_origin(both(hb), 'P_hood', hinge))
    panels['P_hood'] = dict(mount='hood', hinge='y', hinge_pos=hinge, axis=(0, 1, 0), open_deg=-55.0)
    tg = ex.tailgate()
    tg.extend(plate_buf((D['bed_xr'] - 0.006, 0.0, 0.80), (-1.0, 0.0, 0.0), (0.0, 0.0, 1.0), 0.33, 0.15, '4H 730'))
    thinge = np.array([D['bed_xr'] + 0.02, 0.0, D['bed_floor'] - 0.004])
    objs.append(obj_with_origin(tg, 'P_trunk', thinge))
    panels['P_trunk'] = dict(mount='trunk', hinge='y', hinge_pos=thinge, axis=(0, 1, 0), open_deg=-90.0)
    ff = IN.fuel_flap(ex)
    fc = ex.cut['fuel'].P.mean(0)
    fhinge = np.array([fc[0] + 0.050, fc[1] + 0.002, fc[2]])
    objs.append(obj_with_origin(ff, 'FUEL_CAP', fhinge))
    panels['FUEL_CAP'] = dict(mount=None, hinge='z', hinge_pos=fhinge, axis=(0, 0, 1), open_deg=-85.0)
    # ---------------------------------------------------------------- GLASS, UNDER, INTERIOR
    g = K.Buf()
    for kind in ('ws', 'rw'):
        g.extend(gl[kind])
        g.extend(gl[kind].mirrored())
    objs.append(g.to_object('GLASS'))
    objs.append(both(IN.underbody(), IN.centre_under()).to_object('UNDER'))
    it = IN.interior(ex)
    objs.append(both(it['L'], it['C']).to_object('INTERIOR'))
    needles = {}
    from frames._sedan_build import needle
    for gdesc in it['gauges']:
        nb, info = needle(gdesc)
        rot = K.frame_from(info['rest'], gdesc['normal'])
        objs.append(obj_with_origin(nb, gdesc['name'], gdesc['center'], rot=rot))
        needles[gdesc['name']] = info
    wipers = {}
    for wname, wy, wl in (('WIPER_L', 0.50, 0.46), ('WIPER_R', -0.06, 0.46)):
        wb, info = wiper(wy, wl)
        objs.append(obj_with_origin(wb, wname, info['pivot'], rot=info['rot']))
        wipers[wname] = info
    print('[pickup] objects', round(time.time() - t0, 1), 's')
    empties = mounts(ex, panels)
    meshes = [o for o in objs if o.type == 'MESH']
    tris = {o.name: mc.triangles([o]) for o in meshes}
    total = sum(tris.values())
    print('[pickup] triangles', total, {k: v for k, v in sorted(tris.items(), key=lambda kv: -kv[1])[:8]})
    if not quick:
        mc.bake_ao(meshes, samples=32, distance=0.35)
    mc.export_glb(OUT_GLB, meshes + empties)
    mc.mounts_json(OUT_JSON, 'pickup', json_extra(objs, panels, needles, wipers, tris, total))
    print('[pickup] exported', round(time.time() - t0, 1), 's')
    if not no_preview:
        previews(quick)
    print('[pickup] done', round(time.time() - t0, 1), 's')


# ============================================================================================ edges
def edges(ex):
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
    for kind, cen in (('ws', (float(S.ws_x(0.0, 1.30)) - 0.1, 0.0, 1.30)), ('rw', (D['rw_x'] + 0.1, 0.0, 1.30))):
        wv = ex.win[kind]
        E = EX.side_dir(wv['P'], wv['N'], np.tile(cen, (len(wv['P']), 1)), False)
        V, N, T = K.roll_edge(wv['P'], wv['N'], E, 0.004, 0.032, 0.0, 2, closed=False)
        body.add(V, N, T, 'paint')
    for (P, N), uv in zip(ex.arch_P, ex.arch_uv):
        keep = uv[:, 1] >= S.L_T[1] - 1e-6
        P, N = P[keep], N[keep]
        cc = np.array([P[:, 0].mean(), P[:, 1].mean(), D['hub_z']])
        E = EX.side_dir(P, N, np.tile(cc, (len(P), 1)), False)
        V, Nn, T = K.roll_edge(P, N, E, 0.007, 0.035, 0.0, 2, closed=False)
        body.add(V, Nn, T, 'paint')
    # bed rear arch lip and the tailgate opening edges of the rear posts
    P, N = ex.bed['arch_P']
    uv = ex.bed['arch']
    keep = uv[:, 1] >= S.BED_T[1] - 1e-6
    P, N = P[keep], N[keep]
    cc = np.array([P[:, 0].mean(), P[:, 1].mean(), D['hub_z']])
    E = EX.side_dir(P, N, np.tile(cc, (len(P), 1)), False)
    V, Nn, T = K.roll_edge(P, N, E, 0.007, 0.04, 0.0, 2, closed=False)
    body.add(V, Nn, T, 'paint')
    return body, panels


ER = S.ER


def nearest(P, ref):
    out = np.empty_like(P)
    for i, p in enumerate(P):
        out[i] = ref[np.argmin(((ref - p) ** 2).sum(1))]
    return out


def opening_details(ex):
    b = K.Buf()
    gr = ex.open['grille']
    ref = np.tile([gr['P'][:, 0].mean(), 0.0, 0.80], (len(gr['P']), 1))
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
    # tail lamp recesses on the bed's rear posts
    tl = ex.bed['tail']
    ct = tl['P'].mean(0)
    E = EX.side_dir(tl['P'], tl['N'], np.tile(ct, (len(tl['P']), 1)), True)
    V, N, T = K.roll_edge(tl['P'], tl['N'], E, 0.003, 0.04, 0.0, 2, closed=True, flange_dir=(1, 0, 0))
    b.add(V, N, T, 'paint')
    ring = V.reshape(-1, len(tl['P']), 3)[-1]
    b.extend(K.fill_loop(ring, (-1, 0, 0), 'trim'))
    ex.tail_mount = (np.array([tl['P'][:, 0].mean(), ct[1], ct[2]]), -tl['N'].mean(0))
    return b


def grille(ex):
    """Black grille: a dark back panel, horizontal slats with one bright bar, a silver surround."""
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
    slat = K.round_profile(np.array([(-0.007, -0.013), (0.007, -0.013), (0.007, 0.013), (-0.007, 0.013)]), 0.005, 1)
    slat = np.vstack([slat, slat[:1]])
    for z in np.linspace(z0 + 0.035, z1 - 0.035, 3):
        mat = 'alu' if abs(z - 0.5 * (z0 + z1)) < 0.03 else 'trim'
        P, _ = S.FRONT_L.to3d(np.stack([ys, np.full(len(ys), z)], 1))
        path = P - np.array([0.03, 0, 0])
        V, N, T = K.sweep(path, (0, 0, 1), slat, closed=False, closed_prof=True)
        b.add(V, N, T, mat)
    P, Ns = S.FRONT_L.to3d(g)
    path = P - np.array([0.016, 0, 0])
    prof = K.round_profile(np.array([(-0.006, -0.005), (0.006, -0.005), (0.006, 0.005), (-0.006, 0.005)]), 0.003, 1)
    prof = np.vstack([prof, prof[:1]])
    V, N, T = K.sweep(path, (1, 0, 0), prof, closed=False, closed_prof=True)
    b.add(V, N, T, 'alu')
    p_, n_ = S.FRONT_L.to3d(np.array([[0.0, z1 + 0.052]]))
    b.extend(badge_buf(p_[0], n_[0], (0.0, 0.0, 1.0), 0.022))
    xb = float(S.FRONT_L.to3d(np.array([[0.0, 0.5 * (z0 + z1)]]))[0][0, 0])
    b.extend(K.box_buf((xb - 0.03, 0.0, 0.5 * (z0 + z1) - 0.022), (xb - 0.008, 0.06, 0.5 * (z0 + z1) + 0.022), 'alu', 0.008, 2))
    return b


def trims(ex):
    b = K.Buf()
    gs = ex.gs
    xs = np.linspace(float(gs.a_edge_x(D['rail_z'])) + 0.05, D['cp_top'] - 0.02, 16)
    P, N = S.SIDE_G.to3d(np.stack([xs, np.full(len(xs), D['rail_z'] + 0.016)], 1))
    prof = np.array([(0.0, -0.004), (0.006, -0.004), (0.008, 0.0), (0.008, 0.007), (0.005, 0.009), (0.0, 0.006)])
    V, Nn, T = K.sweep(P, (0, 0, 1), prof, closed=False)
    b.add(V, Nn, T, 'paint')
    for kind in ('ws', 'rw'):
        wv = ex.win[kind]
        P, Nn = wv['P'], wv['N']
        cen = np.array([float(S.ws_x(0.0, 1.30)) - 0.1, 0.0, 1.30]) if kind == 'ws' else np.array([D['rw_x'] + 0.1, 0.0, 1.30])
        E = EX.side_dir(P, Nn, np.tile(cen, (len(P), 1)), False)
        Q = P + E * 0.006 - Nn * 0.004
        prof = np.array([(-0.007, -0.006), (-0.006, 0.003), (0.0, 0.0055), (0.006, 0.003), (0.007, -0.006)])
        V, NN, T = K.sweep(Q, Nn, prof, closed=False)
        b.add(V, NN, T, 'rubber')
        if kind == 'ws':
            prof = np.array([(-0.0045, -0.001), (-0.0035, 0.003), (0.0035, 0.003), (0.0045, -0.001)])
            V, NN, T = K.sweep(P + E * 0.0015 + Nn * 0.0005, Nn, prof, closed=False)
            b.add(V, NN, T, 'chrome')
    for k in range(6):
        y = 0.12 + 0.09 * k
        p, n = S.CT.to3d(np.array([[1.00, y]]))
        b.extend(K.box_buf((-0.010, -0.03, -0.004), (0.010, 0.03, 0.0015), 'trim', 0.003, 1, xf=K.mat4_trs(p[0])))
    mp = mirror_point()
    b.extend(K.box_buf((-0.045, -0.012, -0.004), (0.045, 0.004, 0.024), 'trim', 0.006, 2, xf=K.mat4_trs(mp)))
    # frame rail ends as front bumper mounts and the rear bumper brackets under the bed
    for x, dx in ((float(S.front_x(0.45, 0.56)) - 0.10, 0.09), (D['bed_xr'] + 0.10, -0.09)):     # end behind the body face
        b.extend(K.box_buf((min(x, x + dx), IN.FRAME_Y - 0.03, 0.50), (max(x, x + dx), IN.FRAME_Y + 0.03, 0.58), 'steel', 0.004, 1))
    # body side moulding on the door and the bed (black rubber strip with a thin chrome line)
    for (x0, x1, chart) in ((D['bed_xf'] - 0.06, D['ax_r'] + D['arch_r'] + 0.05, S.SIDE_B),
                            (D['ax_r'] - D['arch_r'] - 0.05, D['bed_xr'] + 0.06, S.SIDE_B), (1.40 - 0.46, D['fd_front'] + 0.02, S.SIDE_L)):
        xs = np.linspace(x0, x1, 4)
        P, N = chart.to3d(np.stack([xs, np.full(len(xs), 0.80)], 1))
        prof = np.array([(0.0, -0.012), (0.004, -0.011), (0.006, 0.0), (0.004, 0.011), (0.0, 0.012)])
        V, NN, T = K.sweep(P, (0, 0, 1), prof if x1 < x0 else np.stack([-prof[:, 0], prof[:, 1]], 1), closed=False)
        b.add(V, NN, T, 'trim')
    return b


def door_moulding():
    """The body side moulding's piece on the door (rides with it)."""
    xs = np.linspace(D['fd_front'] - 0.03, D['fd_rear'] + 0.03, 4)
    P, N = S.SIDE_L.to3d(np.stack([xs, np.full(len(xs), 0.80)], 1))
    prof = np.array([(0.0, -0.012), (0.004, -0.011), (0.006, 0.0), (0.004, 0.011), (0.0, 0.012)])
    V, NN, T = K.sweep(P, (0, 0, 1), prof, closed=False)
    return K.Buf().add(V, NN, T, 'trim')


def mirror_point():
    p, n = S.CT.to3d(np.array([[0.94, 0.79]]))
    return p[0]


def bed_details(ex):
    """Small bed parts: a headboard top cap, the post tops."""
    b = K.Buf()
    return b


def wiper(y_pivot, length):
    zj = 1.04
    p = np.array([float(S.ws_x(abs(y_pivot), D['belt_z'])) + 0.06, y_pivot, zj])
    q, n = S.CT.to3d(np.array([[p[0], p[1]]]))
    p = q[0] + n[0] * 0.004
    nrm = K.unit(np.array([math.sin(S._WR), 0.0, math.cos(S._WR)]))
    rest = np.array([0.0, -1.0, 0.0])
    rest = K.unit(rest - nrm * np.dot(rest, nrm))
    R = K.frame_from(rest, nrm)
    b = K.Buf()
    V, N, T = K.lathe(np.array([(0.0, 0.026), (0.012, 0.024), (0.016, 0.012), (0.017, 0.0)])[::-1], (0, 0, 0), (0, 0, 1), 14)
    b.add(V, N, T, 'trim')
    b.extend(K.tube_buf(np.array([(0.0, 0.0, 0.022), (0.06, 0.0, 0.03), (length, 0.0, 0.03)]), 0.0045, 'trim', 6))
    b.extend(K.box_buf((0.04, -0.008, 0.012), (length + 0.02, 0.008, 0.02), 'trim', 0.003, 1))
    b.extend(K.box_buf((0.03, -0.004, 0.0), (length + 0.03, 0.004, 0.012), 'rubber', 0.002, 1))
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
    E.append(mount('engine', (1.50, 0.0, 0.275), dict(cat='engine', space_min=[-0.48, -0.32, 0.0], space_max=[0.40, 0.32, 0.74])))
    E.append(mount('gearbox', (0.78, 0.0, 0.285), dict(cat='gearbox', space_min=[-0.36, -0.14, 0.0], space_max=[0.20, 0.14, 0.24])))
    E.append(mount('radiator', (1.955, 0.0, 0.545), dict(cat='radiator', space_min=[-0.07, -0.36, 0.0], space_max=[0.035, 0.36, 0.42])))
    E.append(mount('battery', (1.78, 0.34, 0.70), dict(cat='battery', space_min=[-0.15, -0.10, 0.0], space_max=[0.15, 0.10, 0.25])))
    E.append(mount('fuelTank', (-0.70, 0.0, 0.30), dict(cat='fuelTank', space_min=[-0.24, -0.40, 0.0], space_max=[0.24, 0.40, 0.30],
                                                          note='yawed 180 deg: the filler neck of the tank part (+z) points to the flap on the left'),
                   rot=((-1.0, 0.0, 0.0), (0.0, -1.0, 0.0), (0.0, 0.0, 1.0))))
    E.append(mount('exhaust', (1.20, -0.15, 0.36), dict(cat='exhaust', tail=[-3.45, -0.27, -0.02], route='under the cab and bed, right of the propshaft')))
    p, d = IN.steering_mount()
    ang = math.radians(32)
    E.append(mount('steering', tuple(p), dict(cat='steering', column_deg=32.0), rot=K.frame_from(d, (math.sin(ang), 0, math.cos(ang)))))
    fz = IN.FLOOR_Z + 0.03
    for name, x, y, z, drv, side in (('seat_driver', IN.SEAT_X, IN.DRIVER_Y, fz, True, -1), ('seat_pass', IN.SEAT_X, -IN.DRIVER_Y, fz, False, 1),
                                     ('seat_rear', -0.85, 0.0, D['bed_floor'], False, 0)):
        E.append(mount(name, (x, y, z), dict(cat='seat', driver=drv, floor_z=round(z, 4), side=side,
                                              note='in the bed, facing forward' if name == 'seat_rear' else '')))
    for pname, info in panels.items():
        if info['mount'] is None:
            continue
        m = info['mount']
        cat = 'door' if m.startswith('door') else m
        side = (-1 if m.endswith('L') else 1) if m.startswith('door') else 0
        E.append(mount(m, tuple(info['hinge_pos']), dict(cat=cat, panel=pname, hinge=info['hinge'], open_deg=info['open_deg'], side=side)))
    xb = float(S.front_x(0.0, 0.56))
    E.append(mount('bumperFront', (xb + 0.005, 0.0, 0.56), dict(cat='bumperFront', fit=[0.15, 1.70, 0.16])))
    E.append(mount('bumperRear', (D['bed_xr'] - 0.005, 0.0, 0.545), dict(cat='bumperRear', fit=[0.14, 1.70, 0.15])))
    c3, n3 = ex.lamp_mount
    tp, tn = ex.tail_mount
    mp = mirror_point()
    for side, sname in ((1, 'L'), (-1, 'R')):
        E.append(mount('headlight_' + sname, (c3[0], side * c3[1], c3[2]), dict(cat='headlight', side=-side, recess='rect', recess_w=D['lamp_w'],
                                                                                 recess_h=D['lamp_h'], recess_depth=0.07)))
        E.append(mount('taillight_' + sname, (tp[0], side * tp[1], tp[2]), dict(cat='taillight', side=-side, recess='rect', recess_w=0.055,
                                                                                recess_h=0.23, recess_depth=0.04, on='bed rear post')))
        E.append(mount('mirror_' + sname, (mp[0], side * mp[1], mp[2] + 0.02), dict(cat='mirror', side=-side)))
        E.append(mount('armor_' + sname, (-0.70, side * 0.86, 0.80), dict(cat='armor', side=-side, fit=[3.10, 0.05, 0.36], fit_anchor='center')))
    E.append(mount('roof', (0.18, 0.0, 1.695), dict(cat='roof', fit=[0.80, 1.22, 0.15], fit_anchor='center')))
    E.append(mount('horn', (1.93, 0.30, 0.62), dict(cat='horn')))
    E.append(mount('radio', (IN.DASH_FACE_X, 0.0, 0.915), dict(cat='radio', slot=[0.18, 0.046], slot_depth=0.06)))
    E.append(mount('handbrake', (IN.DASH_FACE_X - 0.01, 0.17, 0.835), dict(cat='handbrake', note='under the dash, pull handle')))
    E.append(mount('gearLever', (IN.GEAR_X, 0.0, IN.tunnel_h(IN.GEAR_X) + 0.014), dict(cat='gearLever')))
    p_, d_ = IN.steering_mount()
    pi_ = p_ + d_ * 0.12 + np.array([0.0, -0.043, 0.0])
    E.append(mount('ignition', tuple(pi_), dict(cat='ignition', on='steering column shroud, right side')))
    return E


def json_extra(objs, panels, needles, wipers, tris, total):
    from frames._sedan_build import json_extra as je
    out = je(objs, panels, needles, wipers, tris, total)
    eye = np.array(IN.EYE)
    out['eye_default'] = game_vec(eye)
    return out


# ============================================================================================ previews
def previews(quick):
    PV.materials()
    PV.scene_setup('anime')
    res = (1280, 720)
    smp = 24 if quick else 48
    for name, yaw, pitch, dist in (('f34', 35, 9, 8.6), ('r34', 145, 12, 8.6), ('side_l', 270, 2, 9.6), ('side_r', 90, 2, 9.6),
                                   ('front', 0, 4, 8.0), ('rear', 180, 8, 8.0)):
        PV.orbit((0, 0, 0.80), yaw, pitch, dist, lens=50)
        PV.render(f'{SCRATCH}_{name}.png', res=res, samples=smp)
    PV.orbit((-0.1, 0, 0.7), 270, 89.5, 10, ortho=5.2)
    PV.render(f'{SCRATCH}_top.png', res=(1400, 720), samples=16)
    eye = Vector(IN.EYE)
    PV.camera(tuple(eye), tuple(eye + Vector((1.0, -0.02, -0.14))), lens=24)
    PV.render(f'{SCRATCH}_driver.png', res=res, samples=smp)

    def hide(names, h=True):
        for n in names:
            o = bpy.data.objects.get(n)
            if o:
                o.hide_render = h
                for c in o.children:
                    c.hide_render = h
    hide(['P_hood'])
    PV.camera((3.3, 1.2, 2.0), (1.5, 0.0, 0.75), lens=40)
    PV.render(f'{SCRATCH}_bay.png', res=res, samples=smp)
    hide(['P_hood'], False)
    hide(['P_door_FL'])
    PV.camera((0.5, 2.8, 1.35), (0.35, 0.4, 0.9), lens=40)
    PV.render(f'{SCRATCH}_open_door_FL.png', res=res, samples=smp)
    hide(['P_door_FL'], False)
    hide(['P_trunk'])
    PV.camera((-4.0, 1.6, 2.0), (-1.4, 0.0, 0.75), lens=40)
    PV.render(f'{SCRATCH}_open_trunk.png', res=res, samples=smp)
    hide(['P_trunk'], False)
    hide(['P_door_FL', 'P_door_FR', 'P_hood', 'P_trunk'])
    PV.orbit((0, 0, 0.8), 35, 14, 8.6, lens=50)
    PV.render(f'{SCRATCH}_stripped.png', res=res, samples=smp)
    hide(['P_door_FL', 'P_door_FR', 'P_hood', 'P_trunk'], False)
    g = bpy.data.objects.get('preview_ground')
    if g:
        g.hide_render = True
    PV.camera((2.4, -2.9, -1.6), (0.0, 0.0, 0.35), lens=35)
    PV.render(f'{SCRATCH}_under.png', res=res, samples=smp)
    if g:
        g.hide_render = False
