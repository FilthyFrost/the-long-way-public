"""Wagon: everything behind the outer skin. Door insides, belt mouldings, handles, the bonnet's and the tailgate's
inner frames, the engine bay (room for a longitudinal straight six), door apertures, the load space, the
underbody (UNDER) and the cabin (INTERIOR). Left-half builders return K.Buf in Blender coordinates; the assembly
(frames/_wagon_build.py) mirrors and names the objects. Built as frames/_sedan_inner.py is; its plain helpers are
shared."""
import math
import sys

sys.dont_write_bytecode = True

import numpy as np  # noqa: E402

from frames import _kit as K  # noqa: E402
from frames import _wagon_ext as EX  # noqa: E402
from frames import wagon as S  # noqa: E402
from frames._sedan_inner import (dial, dropped_crossmember, extrude_y, face_up, flip_down, harness, heat_shield,  # noqa: E402
                                 quad_sheet, recompute_normals, ring_inner, side_out, smooth_path, strut_tower, tub)

D = S.D
PI = math.pi
FLOOR_Z = 0.250          # carpet top in the cabin
PAN_Z = 0.195            # underside of the floor pan
CARGO_Z = 0.500          # the load floor's top (over the rear axle with its differential, and the tank)
FIREWALL_X = 1.00
RAD_X = 1.97             # radiator support plane
APRON_Y = 0.50           # engine bay side wall (inboard of the front wheelhouse)
ENGINE_X = 1.45          # the engine's mount: its room from the firewall to the radiator's
SEAT_X = -0.04           # front seat reference (H point) x
REAR_SEAT_X = -0.86      # the stock bench: its back clear of the rear struts' tops, its cushion of the front seats
DRIVER_Y = 0.37
EYE = (SEAT_X - 0.16, DRIVER_Y, FLOOR_Z + 0.035 + 0.90)   # the stock bucket seat's eye (parts_geo: -0.16 back, 0.90 up)
DASH_FACE_X = SEAT_X + 0.775
TUB_R = 0.372            # the rear wheel tubs (over the arch's 0.323)
TUB_Y0 = 0.48            # their inner walls
BOX_X = (-1.74, -1.28)   # the load space's boxes over the rear tubs and the strut tops (a strut's coil stands
BOX_Y = 0.39             # 12 cm inboard of its mount)
BOX_Z = 0.83
CARGO_X1 = -2.49         # the load floor's rear edge (at the sill)
CARGO_W = 0.76           # its half width behind the boxes


def rear_arch_front(z):
    """x of the rear wheel arch's front edge at height z."""
    dz = z - D['hub_z']
    return D['ax_r'] + math.sqrt(max(D['arch_r'] ** 2 - dz * dz, 0.0))


def tunnel_h(x):
    """Height of the top of the transmission tunnel (pan side) along x: gearbox at the front, propshaft behind
    (the shaft runs inside it)."""
    return 0.345 + 0.115 * float(K.sstep(-0.20, 0.60, x))


KICK_X = (-1.36, -0.98)  # the floor's kick-up over the rear axle: from the load floor's front edge to the cabin floor


def kick(x, z0, z1):
    """Height of a floor at x: z0 ahead of the kick-up, rising over the rear axle (and the differential part on
    it) to z1 behind it."""
    x0, x1 = KICK_X
    f = float(np.clip((x1 - x) / (x1 - x0), 0.0, 1.0))
    return z0 + (z1 - z0) * (3 * f * f - 2 * f ** 3)


def floor_section(x, z_floor, z_rear, up, ye_wide, xw, lip):
    """The floor's section at x (left half, (y, z) from the centre line out): the tunnel over the gearbox and the
    propshaft, the floor, the outer lip, all lifted onto the kick-up over the rear axle (the tunnel runs into it).
    up: above the pan (the carpet); xw: where the floor narrows between the rear tubs."""
    th = tunnel_h(x) + up
    tw = 0.12 + 0.03 * float(K.sstep(-0.4, 0.8, x))
    ye = ye_wide if x >= xw - 1e-6 else TUB_Y0
    sec = K.round_profile(np.array([(0.0, th), (tw, th), (tw + 0.035, th - 0.06), (tw + 0.06, z_floor), (ye, z_floor),
                                    (ye + lip[0], z_floor + lip[1])]), [0, 0.03, 0.03, 0.03, 0.02, 0], 2)
    sec[:, 1] = np.maximum(sec[:, 1], kick(x, z_floor, z_rear))
    return sec


def floor_xs(x_front, xw):
    return np.unique(np.concatenate([np.linspace(KICK_X[1], x_front, 9), np.linspace(KICK_X[0], KICK_X[1], 7), [xw - 0.02, xw]]))


def side_pt(x, z, level=0.0):
    """Point and normal on the lower body side (left) at side coordinates (x, z), moved by `level` along the
    normal (negative = inwards)."""
    P, N = S.SIDE_L.to3d(np.array([[x, z]]))
    return P[0] + N[0] * level, N[0]


# ============================================================================================ doors
def door_card(ex, w):
    """Door card (trim panel) on the inside of a door skin, with armrest, pull, crank, lock knob, chrome lines."""
    b = K.Buf()
    if w == 'F':
        x0, x1 = D['fd_rear'] + 0.03, D['fd_front'] - 0.03
    else:
        x0, x1 = D['rd_rear'] + 0.03, D['rd_front'] - 0.03
    z0, z1 = D['door_bot'] + 0.03, 0.82
    pts = [(x0, z0), (x1, z0), (x1, z1), (x0, z1)]
    radii = [0.03, 0.03, 0.02, 0.02]
    if w == 'R':
        # cut round the rear wheel arch notch
        xa, za = D['ax_r'], D['hub_z']
        Rn = D['arch_r'] + 0.03 + 0.035
        th0 = math.asin((z0 - za) / Rn)
        th1 = math.acos((x0 - xa) / Rn)
        ths = np.linspace(th0, th1, 14)
        arc = np.stack([xa + Rn * np.cos(ths), za + Rn * np.sin(ths)], 1)
        pts = [tuple(arc[0])] + [(x1, z0), (x1, z1), (x0, z1)] + [tuple(p) for p in arc[::-1][:-1]]
        pts = pts[1:] + pts[:1]
        radii = [0.03, 0.02, 0.02] + [0.0] * (len(pts) - 3)
        pts = np.array(pts)
    loop = K.ccw(K.rounded_poly(np.array(pts), radii, 0.05, arc_step=0.012))
    g = K.grid_points(x0, x1, z0, z1, 0.08, dt=0.08)
    card = K.OffsetChart(S.SIDE_L, -0.104)
    V, N, T = K.mesh_region(card, [K.Loop(K.resample_keep(loop, 0.05))], [], g, spacing=0.08)
    b.add(V, -N, T, 'plastic_int')
    # card edge (thin rim towards the shut face)
    P, Nn = card.to3d(loop)
    V, N, Tr = K.roll_edge(P, -Nn, side_out(P, Nn), 0.004, 0.012, 0.0, 1, closed=True)
    b.add(V, N, Tr, 'plastic_int')
    # cloth insert (the 80s' velour) and a chrome line over it
    xm = 0.5 * (x0 + x1)
    ix0, ix1 = x0 + 0.05, x1 - 0.05
    ins = K.ccw(K.rounded_poly(np.array([(ix0, 0.64), (ix1, 0.64), (ix1, 0.79), (ix0, 0.79)]), 0.02, 0.05, arc_step=0.012))
    g = K.grid_points(ix0, ix1, 0.64, 0.79, 0.08, dt=0.05)
    V, N, T = K.mesh_region(K.OffsetChart(S.SIDE_L, -0.1065), [K.Loop(K.resample_keep(ins, 0.05))], [], g, spacing=0.05)
    b.add(V, -N, T, 'fabric')
    xs = np.linspace(x0 + 0.04, x1 - 0.04, 6)
    P, Nn = K.OffsetChart(S.SIDE_L, -0.106).to3d(np.stack([xs, np.full(len(xs), 0.62)], 1))
    prof = np.array([(0.0, -0.005), (0.003, -0.003), (0.004, 0.0), (0.003, 0.003), (0.0, 0.005)])
    V, N, Tr = K.sweep(P, (0, 0, 1), np.stack([-prof[:, 0], prof[:, 1]], 1), closed=False)
    b.add(V, N, Tr, 'chrome')
    # armrest: a rounded bar on the card
    ax0, ax1 = (x0 + 0.12, x1 - 0.30) if w == 'F' else (x0 + 0.10, x1 - 0.12)
    xs = np.linspace(ax0, ax1, 7)
    P, Nn = K.OffsetChart(S.SIDE_L, -0.104).to3d(np.stack([xs, np.full(len(xs), 0.58)], 1))
    prof = K.round_profile(np.array([(0.0, -0.025), (-0.055, -0.03), (-0.065, 0.0), (-0.05, 0.03), (0.0, 0.03)]), 0.012, 2)
    V, N, Tr = K.sweep(P, (0, 0, 1), np.stack([-prof[:, 0] * -1, prof[:, 1]], 1) * np.array([-1, 1]), closed=False)
    b.add(V, N, Tr, 'plastic_int')
    # window crank (chrome) and interior handle
    pc, nc = side_pt(xm + (0.10 if w == 'F' else 0.05), 0.70, -0.104)
    inward = -nc
    b.extend(K.cyl_buf(pc, pc + inward * 0.02, 0.022, 'chrome', 16))
    arm_end = pc + inward * 0.02 + np.array([0.0, 0.0, -0.07])
    b.extend(K.tube_buf(np.array([pc + inward * 0.02, arm_end]), 0.006, 'chrome', 8))
    b.extend(K.cyl_buf(arm_end, arm_end + inward * 0.04, 0.012, 'plastic_int', 12))
    ph, nh = side_pt(x1 - 0.13, 0.76, -0.104)
    b.extend(K.box_buf(ph + (-0.05, -0.012, -0.012), ph + (0.05, 0.0, 0.012), 'chrome', 0.004, 2))
    return b


def door_extras(ex, w):
    """Belt moulding, inner window sill, outside handle and key, hinges, the band's chrome edges on the door."""
    b = K.Buf()
    jl = ex.jl
    if w == 'F':
        xa, xb = D['fd_front'] - 0.004, D['fd_rear'] + 0.004
    else:
        xa, xb = D['rd_front'] - 0.004, D['rd_rear'] + 0.004
    uv, P, NL, NG, _ = jl.between(float(S.u_of_x(xa)), float(S.u_of_x(xb)))
    P = K.resample(P, 0.05, closed=False)
    # belt moulding (chrome): sits on the junction, hugging the top strip and the glass line
    prof = K.round_profile(np.array([(0.012, -0.002), (0.012, 0.007), (0.002, 0.016), (-0.010, 0.016), (-0.012, 0.004), (-0.012, -0.002)]), 0.004, 1)
    V, N, Tr = K.sweep(P, (0, 0, 1), prof, closed=False)
    b.add(V, N, Tr, 'chrome')
    for e in (0, -1):
        b.extend(K.fill_loop(V.reshape(len(P), -1, 3)[e], (np.sign(P[e, 0] - P[-1 - e, 0]) * 1.0, 0, 0), 'chrome'))
    # inner window sill (plastic) from the card top to the glass line (a row down its cabin face: the face's shade
    # runs from the light top into the dark under it)
    Pin = K.resample(P, 0.065, closed=False)
    Pin[:, 1] -= 0.045
    prof = K.round_profile(np.array([(0.035, -0.10), (0.032, 0.0), (0.012, 0.005), (-0.02, 0.0), (-0.0225, -0.045), (-0.025, -0.10)]),
                           [0, 0.008, 0.008, 0.008, 0, 0], 1)
    V, N, Tr = K.sweep(Pin + np.array([0, 0, -0.01]), (0, 0, 1), prof, closed=False)
    b.add(V, N, Tr, 'plastic_int')
    # outside handle (a flush pull on a dark escutcheon) near the rear edge, over the band
    xh = (D['fd_rear'] + 0.12) if w == 'F' else (D['rd_rear'] + 0.20)
    zh = 0.905
    ph, nh = side_pt(xh, zh)
    b.extend(K.box_buf((-0.068, -0.006, -0.015), (0.068, 0.0015, 0.015), 'trim', 0.004, 2, xf=K.mat4_trs(ph)))
    b.extend(K.box_buf((-0.058, 0.0, -0.008), (0.058, 0.014, 0.007), 'chrome', 0.006, 3, xf=K.mat4_trs(ph)))
    if w == 'F':
        pk, nk = side_pt(xh + 0.105, zh)
        b.extend(K.cyl_buf(pk - nk * 0.002, pk + nk * 0.006, 0.0095, 'chrome', 16))
        b.extend(K.box_buf(pk + nk * 0.0062 + (-0.0012, -0.0005, -0.005), pk + nk * 0.0064 + (0.0012, 0.0005, 0.005), 'trim', 0.0, 1))
    # hinges on the front shut face (visible when open)
    xf = D['fd_front'] if w == 'F' else D['rd_front']
    for zz in (0.47, 0.78):
        p0, n0 = side_pt(xf - 0.004, zz, -0.03)
        b.extend(K.box_buf(p0 + (-0.012, -0.03, -0.03), p0 + (0.004, 0.0, 0.03), 'steel', 0.004, 2))
    # the band's chrome edges, inset from the door's cut lines
    b.extend(band_strips(ex, float(S.u_of_x(xa)) + 0.006, float(S.u_of_x(xb)) - 0.006, ends=False))
    return b


def band_strips(ex, u0, u1, ends=True):
    """Chrome strips along the paint_b band's top and bottom edges between loft u0 and u1 (and, ends=True, down
    its ends): a low rounded bead on the skin."""
    b = K.Buf()
    t0, t1 = ex.band_t
    us = np.linspace(u0, u1, max(3, int(abs(u1 - u0) / 0.06) + 1))
    prof = np.array([(-0.0045, -0.0012), (-0.0032, 0.0016), (0.0, 0.0028), (0.0032, 0.0016), (0.0045, -0.0012)])
    for t in (t0, t1 - 0.0045):
        P, Nn = S.CL.to3d(np.stack([us, np.full(len(us), t)], 1))
        V, N, T = K.sweep(P, Nn, prof, closed=False)
        b.add(V, N, T, 'chrome')
        for e, sg in ((0, -1.0), (-1, 1.0)):
            ring = V.reshape(len(P), -1, 3)[e]
            tdir = K.unit(P[-1] - P[0]) * sg
            b.extend(K.fill_loop(ring, tdir, 'chrome'))
    if ends:
        for u in (u0, u1):
            ts = np.linspace(t0, t1 - 0.0045, 6)
            P, Nn = S.CL.to3d(np.stack([np.full(len(ts), u), ts], 1))
            V, N, T = K.sweep(P, Nn, prof, closed=False)
            b.add(V, N, T, 'chrome')
    return b


def door_frame_inner(ex, w):
    """Inner face of the window frame band (35 mm in), facing the cabin."""
    c = ex.cut['doorG_' + w]
    s = c.side('in')
    uvp = S.CG.to2d(s['P'])
    gs = ex.gs
    xs = np.linspace(s['uv'][-1, 0], s['uv'][0, 0], 12)[1:-1]
    Pj = np.array([gs.j_point(x)[0] for x in xs])
    loop = np.vstack([uvp, S.CG.to2d(Pj)])
    holes = []
    for name, poly in ex.cut['winG_' + w]:
        P, N = S.SIDE_G.to3d(poly)
        holes.append(K.Loop(S.CG.to2d(P)))
    us = np.linspace(0, S.G_GUIDE.length, 300)
    pts, sp = S.grid_from(us, S.g_t_samples())
    V, N, T = K.mesh_region(S.CG, [K.Loop(loop)], holes, pts, spacing=sp, level=-0.035)
    return K.Buf().add(V, -N, T, 'paint')


# ============================================================================================ bonnet / tailgate
def hood_inner(ex):
    """The bonnet's inner frame, 28 mm under the skin: a perimeter ring (narrow at the hinge edge) so an engine
    can come up close under the skin, with the skin's inside and a pressed X."""
    c = ex.cut['hood']
    s = c.side('in')
    uv = s['uv']
    inner = K.offset_loop2(uv, -0.035, closed=False)
    inner[0, 1] = 0.0
    inner[-1, 1] = 0.0
    return ring_inner(S.CT, uv, inner, -0.10, 0.065)


def tailgate_inner(ex):
    """The tailgate's inside (left half): a trim panel over its lower part 45 mm in, the window frame's inner face,
    a rail across where the two meet, the hinges and the latch."""
    b = K.Buf()
    s = ex.cut['tgL'].side('in')
    # the lower part's trim: the gate's outline pulled in 22 mm (in the loft), up to just under the junction
    U = S.L_GUIDE.length
    tj = float(ex.jl.t[-1])
    uv = K.offset_loop2(s['uv'], 0.022, closed=False)
    uv[-1, 0] = U
    top_t = float(S.t_of_z(D['xr'], 0.905))
    keep = uv[:, 1] < top_t
    uv = uv[keep]
    ua = float(uv[0, 0])
    uv = np.vstack([[(ua, top_t)], uv])
    tt = np.linspace(uv[-1, 1], top_t, 12)[1:-1]
    us_ = np.linspace(U, ua, 16)[1:-1]
    loop = np.vstack([uv, np.stack([np.full(len(tt), U), tt], 1), [(U, top_t)], np.stack([us_, np.full(len(us_), top_t)], 1)])
    us = np.linspace(S.SL[3], U, 18)
    ts = np.linspace(S.L_T[2], top_t, 10)
    pts, sp = S.grid_from(us, ts)
    V, N, T = K.mesh_region(S.CL, [K.Loop(K.ccw(loop))], [], pts, spacing=sp, level=-0.045)
    b.add(V, -N, T, 'plastic_int')
    # the window frame's inner face
    b.extend(ex.tailgate_upper(level=-0.035))
    # a rail across at the belt closing the two
    zt = 0.905
    xr_in = float(S.rear_x(0.0, zt)) + 0.045
    xg_in = float(S.rw_x(0.0, 0.96)) + 0.035
    ya = ex.tg_ya - 0.035
    b.extend(K.box_buf((min(xr_in, xg_in) - 0.004, 0.0, zt - 0.02), (max(xr_in, xg_in) + 0.012, ya, 0.975), 'plastic_int', 0.008, 1))
    # hinges at the top (on the gate's inner top edge) and the latch at the bottom centre
    zh = float(EX.z_tg_top(0.38))
    xh = float(S.rw_x(0.38, zh))
    b.extend(K.box_buf((xh + 0.004, 0.33, zh - 0.05), (xh + 0.04, 0.43, zh - 0.01), 'steel', 0.004, 1))
    zb = D['tg_bot'] + 0.03
    xb = float(S.rear_x(0.0, zb)) + 0.045
    b.extend(K.box_buf((xb, 0.0, zb - 0.02), (xb + 0.03, 0.05, zb + 0.03), 'steel', 0.004, 1))
    return b


# ============================================================================================ engine bay
def engine_bay():
    """Left half of the engine bay: side wall, wheelhouse tub with the strut tower, fender ledge, firewall,
    radiator support, bonnet hinge brackets, wiring. Everything stays clear of the engine's room (|y| < 0.30
    from the firewall to the radiator's room, up to 0.87)."""
    b = K.Buf()
    top = 0.875
    xa, za = D['ax_f'], D['hub_z']
    y_out = 0.815
    b.extend(quad_sheet((FIREWALL_X, APRON_Y, 0.40), (RAD_X - FIREWALL_X, 0, 0), (0, 0, top - 0.40), 10, 5, (0, -1, 0), 'paint'))
    R = TUB_R
    b.extend(tub(xa, za, R, APRON_Y, y_out, 4, 176, 'paint', True))
    # the strut's top mount on its tower, round the strut the suspension part brings (its mount at hub face -
    # 0.20, its coil reaching 12 cm inboard of that)
    yc = D['track_f'] / 2 + 0.010 - 0.20 - 0.03
    b.extend(strut_tower(xa, yc, 0.10, 0.42, top + 0.003, APRON_Y))
    for (x0, x1) in ((FIREWALL_X + 0.06, xa - 0.12), (xa + 0.12, RAD_X - 0.06)):
        b.extend(K.tube_buf(np.array([(x0, APRON_Y, 0.62), (x1, APRON_Y, 0.62)]), 0.007, 'paint', 6))
    b.extend(quad_sheet((FIREWALL_X, APRON_Y, top), (RAD_X - FIREWALL_X, 0, 0), (0, y_out - APRON_Y, 0), 10, 4, (0, 0, 1), 'paint'))
    b.extend(quad_sheet((FIREWALL_X, APRON_Y, top - 0.004), (RAD_X - FIREWALL_X, 0, 0), (0, 0, 0.004), 2, 1, (0, -1, 0), 'paint'))
    for x0 in (xa - R - 0.01, xa + R + 0.01):
        b.extend(quad_sheet((x0, APRON_Y, 0.40), (0, y_out - APRON_Y, 0), (0, 0, top - 0.40), 1, 2, (1 if x0 > xa else -1, 0, 0), 'paint'))
    # firewall and cowl ledge (the ledge over the engine room's rear)
    b.extend(quad_sheet((FIREWALL_X, 0.0, 0.30), (0, APRON_Y, 0), (0, 0, 0.62), 5, 6, (1, 0, 0), 'paint'))
    b.extend(K.box_buf((FIREWALL_X - 0.02, 0.0, 0.884), (1.11, 0.81, 0.898), 'paint', 0.004, 2))
    # radiator support: top bar, side post, bottom bar
    b.extend(K.box_buf((RAD_X, 0.0, 0.836), (RAD_X + 0.045, APRON_Y + 0.01, 0.878), 'paint', 0.008, 2))
    b.extend(K.box_buf((RAD_X, 0.0, 0.375), (RAD_X + 0.045, APRON_Y + 0.01, 0.42), 'paint', 0.008, 2))
    b.extend(K.box_buf((RAD_X, APRON_Y - 0.065, 0.375), (RAD_X + 0.045, APRON_Y + 0.01, 0.878), 'paint', 0.008, 2))
    b.extend(K.box_buf((RAD_X - 0.025, 0.0, 0.85), (RAD_X + 0.006, 0.035, 0.896), 'steel', 0.004, 2))
    # bonnet hinge bracket at the cowl
    b.extend(K.box_buf((1.11, 0.64, 0.872), (1.16, 0.655, 0.912), 'steel', 0.003, 1))
    b.extend(heat_shield(FIREWALL_X, 0.27, 0.50, 0.83))
    wy = APRON_Y - 0.015
    main = [(FIREWALL_X + 0.20, wy, 0.775), (xa - 0.13, wy, 0.78), (xa - 0.09, 0.405, 0.79), (xa, 0.392, 0.795), (xa + 0.09, 0.405, 0.79),
            (xa + 0.14, wy, 0.78), (1.80, wy, 0.775), (RAD_X - 0.055, wy - 0.003, 0.76), (RAD_X - 0.02, 0.47, 0.71), (RAD_X - 0.012, 0.46, 0.685)]
    top_bar = [(RAD_X - 0.055, wy - 0.003, 0.76), (RAD_X + 0.008, 0.45, 0.882), (RAD_X + 0.02, 0.22, 0.883), (RAD_X + 0.02, 0.0, 0.883)]
    fw = [(FIREWALL_X + 0.13, wy, 0.745), (FIREWALL_X + 0.08, wy, 0.62), (FIREWALL_X + 0.012, 0.47, 0.54), (FIREWALL_X + 0.012, 0.30, 0.50),
          (FIREWALL_X + 0.012, 0.0, 0.50)]
    b.extend(harness([main, top_bar, fw], [0.008, 0.006, 0.006]))
    for x in (1.16, 1.58, 1.70):
        b.extend(K.box_buf((x - 0.008, APRON_Y - 0.009, 0.765), (x + 0.008, APRON_Y, 0.792), 'trim', 0.002, 1))
    b.extend(K.box_buf((RAD_X - 0.025, 0.445, 0.655), (RAD_X - 0.002, 0.475, 0.69), 'plastic_int', 0.004, 1))
    for dz in (0.0, 0.013):
        path = [(FIREWALL_X + 0.21, 0.405, 0.72 + dz), (1.17, 0.45, 0.715 + dz), (1.195, APRON_Y - 0.006, 0.685 + dz),
                (1.205, APRON_Y - 0.006, 0.58 + dz), (1.21, APRON_Y - 0.006, 0.46 + dz)]
        b.extend(K.tube_buf(smooth_path(path, 1), 0.0026, 'steel', 4))
    return b


def engine_bay_asym():
    """Non-symmetric engine bay details: brake booster and master cylinder (driver side, left), heater box (right),
    battery tray (left front), washer bottle (right front), fuse box, the identification plate."""
    b = K.Buf()
    fx = FIREWALL_X
    by_ = 0.405
    V, N, T = K.lathe(np.array([(0.0, 0.0), (0.064, 0.0), (0.072, 0.011), (0.072, 0.052), (0.064, 0.062), (0.0, 0.062)]), (fx, by_, 0.72), (1, 0, 0), 16)
    b.add(V, N, T, 'steel')
    b.extend(K.cyl_buf((fx + 0.062, by_, 0.72), (fx + 0.21, by_, 0.72), 0.02, 'alu', 12))
    b.extend(K.cyl_buf((fx + 0.14, by_, 0.74), (fx + 0.14, by_, 0.792), 0.026, 'ceramic', 14))
    b.extend(K.cyl_buf((fx + 0.14, by_, 0.792), (fx + 0.14, by_, 0.806), 0.021, 'trim', 12))
    b.extend(K.box_buf((fx, -0.49, 0.62), (fx + 0.10, -0.32, 0.82), 'plastic_int', 0.02, 2))
    for hz in (0.68, 0.75):
        b.extend(K.tube_buf(smooth_path([(fx + 0.10, -0.40, hz), (fx + 0.15, -0.40, hz - 0.005), (fx + 0.17, -0.395, hz - 0.05)]), 0.012, 'rubber', 8))
    b.extend(K.box_buf((fx + 0.15, -APRON_Y, 0.74), (fx + 0.22, -APRON_Y + 0.04, 0.81), 'trim', 0.006, 2))
    # battery tray (the battery part sits on it), left front
    bx, by, bz = BATTERY
    b.extend(K.box_buf((bx - 0.14, by - 0.10, bz - 0.012), (bx + 0.14, by + 0.10, bz), 'steel', 0.004, 1))
    b.extend(K.box_buf((bx - 0.02, by + 0.08, 0.43), (bx + 0.02, APRON_Y, bz - 0.012), 'steel', 0.004, 1))
    b.extend(K.box_buf((bx - 0.14, by - 0.10, bz), (bx - 0.13, by + 0.10, bz + 0.03), 'steel', 0.002, 1))
    # washer bottle (right front)
    b.extend(K.box_buf((1.62, -0.47, 0.57), (1.78, -0.35, 0.75), 'ceramic', 0.03, 2))
    b.extend(K.cyl_buf((1.70, -0.41, 0.75), (1.70, -0.41, 0.78), 0.018, 'trim', 10))
    b.extend(K.box_buf((fx + 0.13, APRON_Y - 0.05, 0.72), (fx + 0.25, APRON_Y - 0.002, 0.82), 'trim', 0.008, 2))
    b.extend(K.box_buf((1.50, APRON_Y - 0.003, 0.66), (1.58, APRON_Y - 0.001, 0.70), 'alu', 0.0, 1))
    return b


# the mounts in the bay (the battery stands on its tray, outboard of the engine's room)
BATTERY = (1.70, 0.40, 0.58)
RADIATOR = (RAD_X - 0.04, 0.0, 0.43)
HORN = (2.05, 0.40, 0.52)


# ============================================================================================ apertures, load space
def apertures():
    """Door aperture structure: B pillar post below the belt, sill tops with seals (left)."""
    b = K.Buf()
    b.extend(K.box_buf((-0.225, 0.67, D['door_bot'] - 0.02), (-0.135, 0.75, 0.94), 'paint', 0.006, 2))
    xr_ = rear_arch_front(0.24) + 0.03
    b.extend(K.box_buf((xr_, 0.67, 0.20), (D['fd_front'], 0.75, D['door_bot'] - 0.012), 'paint', 0.006, 2))
    xs = np.linspace(xr_ + 0.02, D['fd_front'] - 0.02, 4)
    path = np.stack([xs, np.full(len(xs), 0.755), np.full(len(xs), D['door_bot'] - 0.006)], 1)
    b.extend(K.tube_buf(path, 0.008, 'rubber', 8))
    return b


def load_space():
    """The tailgate's aperture inside the body (left half): the rear sill from the gate's bottom edge up to the load
    floor with its scuff plate, the inner panels of the rear corners behind the tail lamps, the D pillars'
    inner faces down to the floor."""
    b = K.Buf()
    xs = float(S.rear_x(0.0, D['tg_bot'])) + 0.042     # behind the gate's and the opening's flanges
    tw = D['tg_w']
    # the sill: a step from the gate's bottom edge up to the floor, its top a ribbed steel scuff plate
    b.extend(K.box_buf((xs, 0.0, D['tg_bot'] - 0.03), (xs + 0.05, tw + 0.01, CARGO_Z - 0.004), 'paint', 0.006, 2))
    b.extend(K.box_buf((xs - 0.004, 0.0, CARGO_Z - 0.006), (xs + 0.07, tw - 0.01, CARGO_Z + 0.004), 'steel', 0.003, 1))
    for k in range(4):
        x = xs + 0.008 + 0.016 * k
        b.extend(K.box_buf((x, 0.0, CARGO_Z + 0.003), (x + 0.006, tw - 0.03, CARGO_Z + 0.007), 'steel', 0.0015, 1))
    # behind the rear corners (the inside of the tail lamps' corner pieces), from the floor up to the belt
    xc = float(S.rear_x(0.6, 0.7)) + 0.05
    b.extend(K.box_buf((xc, tw + 0.004, CARGO_Z), (xc + 0.02, CARGO_W, 0.80), 'paint', 0.004, 2))
    b.extend(K.box_buf((xc, EX.y_tg(0.9) + 0.004, 0.80), (xc + 0.02, CARGO_W, 0.95), 'paint', 0.004, 2))
    return b


# ============================================================================================ underbody
def underbody():
    """UNDER (left half + centre parts with y >= 0 halves): floor pan, the load floor's underside, rails,
    crossmember, wishbones and tie rod, the rear axle's tubes and trailing arm, wheelhouse liners. The hubs'
    carriers are objects of their own (knuckle()); springs, dampers, brakes and the differential are the axles'
    parts."""
    b = K.Buf()
    # floor pan underside with the tunnel (extruded section), rising behind the rear seat over the axle to the
    # load floor's underside
    zf = CARGO_Z - 0.035
    xw = rear_arch_front(PAN_Z) + 0.02
    xs = floor_xs(FIREWALL_X, xw)
    V = []
    for x in xs:
        V += [(x, y, z) for (y, z) in floor_section(x, PAN_Z, zf, 0.0, 0.75, xw, (0.02, 0.025))]
    V = np.array(V)
    T = K.grid_tris(len(xs), len(V) // len(xs))
    b.extend(flip_down(recompute_normals(K.Buf().add(V, np.zeros_like(V), T, 'trim'))))
    x0 = KICK_X[0]
    xt = D['ax_r'] - TUB_R
    b.extend(K.box_buf((CARGO_X1 - 0.03, 0.0, zf - 0.013), (xt, 0.76, zf), 'trim', 0.004, 1))
    b.extend(K.box_buf((xt, 0.0, zf - 0.013), (x0, TUB_Y0, zf), 'trim', 0.004, 1))
    # rails
    b.extend(K.box_buf((-1.15, 0.44, PAN_Z - 0.06), (1.90, 0.52, PAN_Z), 'steel', 0.006, 1))
    b.extend(K.box_buf((-2.46, 0.44, zf - 0.08), (-1.44, 0.52, zf - 0.013), 'steel', 0.006, 1))
    b.extend(K.box_buf((-2.40, 0.0, zf - 0.07), (-2.32, 0.44, zf - 0.013), 'steel', 0.006, 2))
    # front crossmember, dropped under the sump between the rails
    b.extend(dropped_crossmember(D['ax_f'] + 0.06, 0.12, 0.06, 0.155, 0.235, 0.30, 0.43, 0.50))
    # wheelhouse liners (front and rear)
    for xa, y0, y1 in ((D['ax_f'], APRON_Y, 0.82), (D['ax_r'], TUB_Y0 + 0.02, 0.82)):
        b.extend(wheelhouse(xa, y0, y1))
    # front suspension (left): wishbones and the tie rod out to the knuckle (the spring and damper are the
    # suspension part's, the knuckle with its hub is an object of its own)
    hx, hy, hz = D['ax_f'], D['track_f'] / 2, D['hub_z']
    b.extend(K.tube_buf(np.array([(hx + 0.12, 0.31, 0.235), (hx, hy - 0.12, 0.22), (hx - 0.14, 0.31, 0.235)]), 0.014, 'steel', 8))
    b.extend(K.tube_buf(np.array([(hx + 0.10, 0.45, 0.52), (hx, hy - 0.13, 0.50), (hx - 0.10, 0.45, 0.52)]), 0.012, 'steel', 8))
    b.extend(K.tube_buf(np.array([(hx - 0.10, 0.12, 0.27), (hx - 0.11, hy - 0.10, 0.27)]), 0.010, 'steel', 8))
    # rear axle (left): its tube from the differential part's tube end out into the hub's carrier, the trailing
    # arm (the differential, springs and dampers are the axle's parts)
    rx, ry = D['ax_r'], D['track_r'] / 2
    b.extend(K.cyl_buf((rx, AXLE_IN, hz), (rx, axle_end(ry), hz), 0.038, 'steel', 16))
    b.extend(K.tube_buf(np.array([(rx, 0.45, hz - 0.03), (rx + 0.48, 0.45, PAN_Z - 0.03)]), 0.016, 'steel', 8))
    # a Panhard rod across behind the axle (left half; its body bracket is on the right)
    b.extend(K.tube_buf(np.array([(rx - 0.09, 0.0, hz + 0.05), (rx - 0.09, 0.40, hz + 0.02)]), 0.011, 'steel', 8))
    return b


# the rear axle's tubes start this far out from the centre: 2 cm inside the differential part's tube ends
AXLE_IN = 0.29
# where the differential part's companion flange is (ahead of the axle and below it: x, z from the axle centre)
DIFF_FLANGE = (0.2645, -0.024)


def axle_end(hy):
    """Where a live axle's tube ends: in the middle of its hub's carrier (knuckle())."""
    return hy - K.BRAKE_IN[1] - 0.003 - 0.015


def knuckle(hx, hy, hz, front=True):
    """A hub's carrier (left side: outer face +Y): the hub flange at the hub face with four studs and the centre
    cap, the spindle, and the knuckle just inboard of the brake (front: up to the upper wishbone's ball joint;
    rear: the axle's end). An object of its own, KNUCKLE_<hub>, the game hangs on the wheel's pivot."""
    return K.knuckle_buf(hx, hy, hz, hy + 0.010, 0.062, 4, 0.049, 45.0, stud_r=0.0055, stud_len=0.007, cap_r=0.022,
                         cap_out=0.005, carrier=(0.05, 0.03, 0.11, 0.20 if front else 0.13))


def centre_under():
    """Parts on the centre line that must not be mirrored: propshaft (back to the differential part's companion
    flange) with its centre bearing, the fuel filler neck (right)."""
    b = K.Buf()
    hz = D['hub_z']
    xe, ze = D['ax_r'] + DIFF_FLANGE[0] + 0.022, hz + DIFF_FLANGE[1]
    xg, zg = 0.46, 0.30
    xm = 0.5 * (xg + xe)
    zm = 0.5 * (zg + ze)
    # a two-piece shaft (a long car): front half to the centre bearing, rear half to the axle
    b.extend(K.cyl_buf((xg, 0.0, zg), (xm + 0.02, 0.0, zm), 0.032, 'steel', 16))
    b.extend(K.cyl_buf((xm - 0.02, 0.0, zm), (xe, 0.0, ze), 0.032, 'steel', 16))
    b.extend(K.box_buf((xm - 0.03, -0.07, zm - 0.045), (xm + 0.03, 0.07, zm + 0.04), 'rubber', 0.01, 1))
    for x, z in ((xg, zg), (xe, ze)):
        b.extend(K.cyl_buf((x - 0.02, 0.0, z), (x + 0.02, 0.0, z), 0.045, 'steel', 16))
    # the Panhard rod's body bracket (right)
    b.extend(K.box_buf((D['ax_r'] - 0.12, -0.50, D['hub_z'] + 0.0), (D['ax_r'] - 0.06, -0.44, CARGO_Z - 0.05), 'steel', 0.005, 1))
    b.extend(K.tube_buf(np.array([(D['ax_r'] - 0.09, 0.0, hz + 0.05), (D['ax_r'] - 0.09, -0.44, hz + 0.08)]), 0.011, 'steel', 8))
    # fuel filler neck from the right rear flap down to the tank: down behind the load space's side trim, under
    # the load floor and the rail in to the tank (inboard of the trim it stood in the load space)
    fx, fz = D['fuel_x'], D['fuel_z']
    path = np.array([(fx, -0.83, fz), (fx, -0.808, 0.43), (fx + 0.02, -0.60, 0.36), (fx + 0.04, -0.38, 0.36)])
    b.extend(K.tube_buf(path, 0.022, 'rubber', 12))
    return b


def wheelhouse(xa, y0, y1, r=0.355):
    """Half-cylinder liner over a wheel from y0 (inner) to y1 (outer), facing the wheel."""
    za = D['hub_z']
    ths = np.radians(np.linspace(-8, 188, 20))
    ys = np.linspace(y0, y1, 3)
    V = []
    N = []
    for th in ths:
        for y in ys:
            V.append((xa + r * math.cos(th), y, za + r * math.sin(th)))
            N.append((-math.cos(th), 0.0, -math.sin(th)))
    V = np.array(V)
    N = np.array(N)
    T = K.grid_tris(len(ths), len(ys))
    b = K.Buf().add(V, N, T, 'trim')
    ring = np.array([(xa + r * math.cos(t), y0, za + r * math.sin(t)) for t in ths])
    b.extend(K.fill_loop(ring, (0, 1, 0), 'trim'))
    return b


# ============================================================================================ interior
def interior(ex):
    """INTERIOR (left-half and centre builders are combined by the assembly). Returns dict of bufs and the needle /
    gauge layout."""
    out = {}
    L = K.Buf()   # mirrored
    C = K.Buf()   # centre / asymmetric (not mirrored)
    # floor carpet with the tunnel (left half section, extruded), up the kick-up behind the rear seat to the load
    # floor
    xw = rear_arch_front(FLOOR_Z) + 0.02
    xs = floor_xs(FIREWALL_X - 0.02, xw)
    V = []
    for x in xs:
        V += [(x, y, z) for (y, z) in floor_section(x, FLOOR_Z, CARGO_Z, 0.055, 0.74, xw, (0.01, 0.02))]
    V = np.array(V)
    T = K.grid_tris(len(xs), len(V) // len(xs))
    L.extend(face_up(recompute_normals(K.Buf().add(V, np.zeros_like(V), T, 'fabric'))))
    # front footwell slope up to the firewall (the toe board, turned up about its foot; its inner end clear of the
    # tunnel, its top end at the firewall)
    L.extend(K.box_buf((FIREWALL_X - 0.24, 0.22, FLOOR_Z), (FIREWALL_X + 0.04, 0.72, FLOOR_Z + 0.02), 'fabric', 0.006, 2,
                       xf=K.mat4_rot((0, 1, 0), -38, (FIREWALL_X - 0.24, 0, FLOOR_Z))))
    # the load floor: carpet from the step back to the sill, round the boxes over the rear tubs
    L.extend(load_floor())
    # the rear wheel tubs inside the cabin (beside the rear seat), the boxes over them in the load space
    L.extend(rear_tub_front())
    L.extend(tub_boxes())
    # the load space's side trims, from the boxes back to the tail, the floor up to the windows
    L.extend(load_trims(ex))
    # firewall face inside the cabin (the engine bay's firewall sheet faces the bay)
    L.extend(quad_sheet((FIREWALL_X - 0.004, 0.0, FLOOR_Z), (0, 0.74, 0), (0, 0, 0.66 - FLOOR_Z), 2, 2, (-1, 0, 0), 'trim'))
    # sill trims and kick panels
    L.extend(K.box_buf((rear_arch_front(0.30) + 0.03, 0.65, FLOOR_Z), (D['fd_front'] - 0.02, 0.71, 0.33), 'plastic_int', 0.012, 2))
    L.extend(K.box_buf((0.80, 0.63, FLOOR_Z), (FIREWALL_X - 0.02, 0.75, 0.64), 'plastic_int', 0.02, 1))
    # headliner: greenhouse roof 22 mm inside, facing down
    gus = S.g_u_samples()
    row = np.stack([gus, np.full(len(gus), S.G_T[-1] - 0.02)], 1)
    Pr, _ = S.CG.to3d(row, -0.022)
    a, bb = Pr[-1], Pr[0]
    xc = np.linspace(a[0], bb[0], 40)[1:-1]
    loop = np.vstack([Pr[:, :2], np.stack([xc, np.zeros(len(xc))], 1)])
    g = K.grid_points(-2.6, 0.7, 0.0, 0.72, 0.10, dt=0.10)
    V, N, T = K.mesh_region(S.CR, [K.Loop(loop)], [], g, spacing=0.10, level=-0.022)
    L.add(V, -N, T, 'fabric')
    # pillar trims: the B pillar's and the C pillar's inner covers, leaning in with the greenhouse's sides
    for (x0, x1) in ((-0.235, -0.14), (D['rd_rear'] - 0.07, D['rd_rear'] + 0.02)):
        L.extend(K.box_buf((x0, 0.70, 0.93), (x1, 0.755, 1.35), 'plastic_int', 0.015, 2,
                           xf=K.mat4_rot((1, 0, 0), D['tumble_deg'], (0.5 * (x0 + x1), 0.73, 0.93))))
    # dashboard
    dash, gauges = dashboard()
    C.extend(dash)
    # pedals (driver, left)
    for (py, w_, name) in ((DRIVER_Y + 0.10, 0.05, 'clutch'), (DRIVER_Y, 0.06, 'brake'), (DRIVER_Y - 0.13, 0.04, 'throttle')):
        base = np.array([FIREWALL_X - 0.10, py, 0.64])
        pad = np.array([FIREWALL_X - 0.20, py, 0.37 if name != 'throttle' else 0.34])
        C.extend(K.tube_buf(np.array([base, (base + pad) / 2 + (0.02, 0, 0), pad + (0, 0, 0.04)]), 0.008, 'steel', 8))
        C.extend(K.box_buf(pad + (-0.012, -w_, -0.04 if name != 'throttle' else -0.06), pad + (0.012, w_, 0.04), 'rubber', 0.006, 2,
                           xf=K.mat4_rot((0, 1, 0), -20, pad)))
    # steering column shroud (the steering part mounts at its top)
    st = steering_mount()
    col_dir = st[1]
    p_top = st[0] + col_dir * 0.05
    p_bot = st[0] + col_dir * 0.36
    C.extend(K.cyl_buf(p_bot, p_top, 0.045, 'plastic_int', 20, r1=0.038))
    # centre console with the radio's place
    C.extend(console())
    # seat rails at the seat mounts
    for (sx, sy) in ((SEAT_X, DRIVER_Y), (SEAT_X, -DRIVER_Y)):
        for dy in (-0.18, 0.18):
            C.extend(K.box_buf((sx - 0.25, sy + dy - 0.015, FLOOR_Z), (sx + 0.25, sy + dy + 0.015, FLOOR_Z + 0.035), 'steel', 0.004, 2))
    for dy in (-0.48, 0.48):
        C.extend(K.box_buf((REAR_SEAT_X - 0.15, dy - 0.02, FLOOR_Z), (REAR_SEAT_X + 0.15, dy + 0.02, FLOOR_Z + 0.02), 'steel', 0.004, 2))
    # interior mirror and sun visors
    mp = np.array([float(S.ws_x(0, 1.36)) - 0.08, 0.0, 1.34])
    C.extend(K.box_buf(mp + (-0.01, -0.012, 0.01), mp + (0.012, 0.012, 0.06), 'plastic_int', 0.004, 2))
    C.extend(K.box_buf(mp + (-0.025, -0.12, -0.03), mp + (0.0, 0.12, 0.02), 'plastic_int', 0.012, 3))
    C.extend(K.box_buf(mp + (-0.0262, -0.11, -0.022), mp + (-0.0255, 0.11, 0.012), 'glass_dark', 0.0, 1))
    for sy in (1, -1):
        vp = np.array([float(S.ws_x(0.37, 1.37)) - 0.12, sy * 0.37, 1.372])
        C.extend(K.box_buf(vp + (-0.17, -0.20, -0.012), vp + (0.0, 0.20, 0.008), 'fabric', 0.01, 3, xf=K.mat4_rot((0, 1, 0), 12, vp)))
    out['L'] = L
    out['C'] = C
    out['gauges'] = gauges
    return out


def load_floor():
    """The load floor (left half): one carpeted sheet from the step behind the rear seat to the sill, narrow
    between the tub boxes, the full width behind them."""
    b = K.Buf()
    x0, x1 = BOX_X
    xk = KICK_X[0]
    poly = np.array([(CARGO_X1, 0.0), (CARGO_X1, CARGO_W - 0.01), (x0, CARGO_W - 0.01), (x0, BOX_Y), (xk, BOX_Y), (xk, 0.0)])
    loop = K.ccw(K.rounded_poly(poly, [0, 0, 0, 0, 0, 0], 0.05, arc_step=0.02))
    ch = K.FlatChart((0, 0, CARGO_Z), (1, 0, 0), (0, 1, 0), (0, 0, 1))
    g = K.grid_points(CARGO_X1, xk, 0.0, CARGO_W, 0.16, dt=0.12)
    V, N, T = K.mesh_region(ch, [K.Loop(K.resample_keep(loop, 0.08))], [], g, spacing=0.12)
    b.add(V, N, T, 'fabric')
    return b


def rear_tub_front():
    """The rear wheel tub's cabin side ahead of the load space's box (beside the rear seat), over the floor."""
    b = K.Buf()
    xa, za, r = D['ax_r'], D['hub_z'], TUB_R
    a0 = math.asin(max(-1.0, min(1.0, (FLOOR_Z - za) / r)))
    ths = np.linspace(a0, math.acos((BOX_X[1] - xa) / r), 12)
    V = np.array([(xa + r * math.cos(t), y, za + r * math.sin(t)) for t in ths for y in (TUB_Y0, 0.74)])
    N = np.array([(math.cos(t), 0.0, math.sin(t)) for t in ths for y in (0, 1)])
    b.add(V, N, K.grid_tris(len(ths), 2), 'fabric')
    ring = np.array([(xa + r * math.cos(t), TUB_Y0, za + r * math.sin(t)) for t in ths])
    ring = np.vstack([ring, [(BOX_X[1], TUB_Y0, FLOOR_Z)]])
    b.extend(K.fill_loop(ring, (0, -1, 0), 'fabric'))
    return b


def tub_boxes():
    """Carpeted boxes over the rear tubs in the load space, a lid on each: inboard of the tyre a box from the floor
    (the strut's top stands inside it), over the tyre a cover from the tub's top up, closed behind the wheel."""
    b = K.Buf()
    x0, x1 = BOX_X
    yi = D['track_r'] / 2 - 0.077 - 0.02          # (the tyre's inner face, less a margin)
    zt = D['hub_z'] + TUB_R
    b.extend(K.box_buf((x0, BOX_Y, CARGO_Z - 0.01), (x1, yi, BOX_Z), 'fabric', 0.03, 1))
    b.extend(K.box_buf((x0, yi - 0.03, zt), (x1, 0.77, BOX_Z), 'fabric', 0.03, 1))
    b.extend(K.box_buf((x0, yi - 0.03, CARGO_Z - 0.01), (x0 + 0.04, 0.77, zt + 0.03), 'fabric', 0.01, 1))
    b.extend(K.box_buf((x0 + 0.04, BOX_Y + 0.03, BOX_Z - 0.004), (x1 - 0.04, 0.73, BOX_Z + 0.006), 'plastic_int', 0.008, 2))
    b.extend(K.box_buf((x1 - 0.09, BOX_Y - 0.004, BOX_Z - 0.06), (x1 - 0.03, BOX_Y + 0.004, BOX_Z - 0.03), 'trim', 0.002, 1))
    return b


def load_trims(ex):
    """The load space's side trims (left half): a moulded panel from the box back to the tail at the side's inside,
    up to the window, a rail along its top, two tie-down hooks on the floor."""
    b = K.Buf()
    x0 = BOX_X[0]
    xr = float(S.rear_x(0.7, 0.7)) + 0.07
    # the panel's face a grid (its baked shade can vary over it: a box's face takes its shade from its corners,
    # all of them in corners here), the panel's body just behind it
    yt = CARGO_W - 0.006
    b.extend(quad_sheet((xr, yt, CARGO_Z + 0.002), (0, 0, 0.905 - CARGO_Z - 0.002), (x0 + 0.02 - xr, 0, 0), 4, 6,
                        (0, -1, 0), 'plastic_int'))
    b.extend(K.box_buf((xr, yt + 0.003, CARGO_Z), (x0 + 0.02, CARGO_W + 0.03, 0.93), 'plastic_int', 0.0, 1))
    b.extend(K.box_buf((xr, CARGO_W - 0.02, 0.905), (x0 + 0.02, CARGO_W + 0.03, 0.935), 'plastic_int', 0.012, 2))
    b.extend(K.box_buf((x0, 0.75, BOX_Z - 0.01), (D['rd_rear'] - 0.05, 0.79, 0.935), 'plastic_int', 0.02, 1))
    for x in (-1.85, -2.38):
        # (against the side trim's foot, clear of the stowage zone)
        hp = np.array([x, CARGO_W - 0.03, CARGO_Z])
        b.extend(K.box_buf(hp + (-0.025, -0.012, 0.0), hp + (0.025, 0.012, 0.006), 'steel', 0.002, 1))
        b.extend(K.tube_buf(np.array([hp + (-0.016, 0, 0.004), hp + (-0.012, 0, 0.026), hp + (0.012, 0, 0.026), hp + (0.016, 0, 0.004)]),
                            0.004, 'steel', 6))
    return b


def steering_mount():
    """(position of the steering wheel hub, column direction pointing forward-down)."""
    ang = math.radians(24.0)
    d = np.array([math.cos(ang), 0.0, -math.sin(ang)])
    p = np.array([SEAT_X + 0.50, DRIVER_Y, 0.875])
    return p, d


def dashboard():
    """Dash: a padded top roll with a squared brow over the instrument pod, a painted fascia with a woodgrain
    strip, the pod with two big and two small dials, glovebox, square vents, the radio's opening and the heater's
    sliders in the centre. Returns (buf, gauge layout list)."""
    b = K.Buf()
    fx = DASH_FACE_X

    def pad_sec(y):
        ay = abs(y - DRIVER_Y)
        brow = 0.03 * float(K.sstep(0.26, 0.20, ay)) if y > 0 else 0.0
        lift = 0.032 * float(K.sstep(0.30, 0.22, ay)) if y > 0 else 0.0     # hood over the raised cluster
        pts = np.array([(fx + 0.235, 0.92), (fx + 0.175, 0.952 + lift * 0.6), (fx + 0.065, 0.966 + lift), (fx - 0.005 - brow, 0.964 + lift),
                        (fx - 0.022 - brow, 0.948 + lift), (fx - 0.016 - brow, 0.926 + lift), (fx + 0.01, 0.915), (fx + 0.235, 0.905)])
        return K.round_profile(pts, [0, 0.03, 0.02, 0.008, 0.006, 0.006, 0.01, 0], 1)
    ys = np.concatenate([np.linspace(-0.74, 0.07, 3), np.linspace(0.10, 0.64, 8), [0.74]])
    b.extend(extrude_y(None, ys, 'plastic_int', inside=(fx + 0.145, 0.0, 0.935), sec_fn=pad_sec))
    # fascia (painted) under the roll
    fas = K.round_profile(np.array([(fx, 0.92), (fx, 0.69), (fx + 0.04, 0.66), (fx + 0.225, 0.66), (fx + 0.225, 0.92)]), [0, 0.03, 0.02, 0, 0], 2)
    b.extend(extrude_y(fas, np.linspace(-0.68, 0.68, 3), 'paint', inside=(fx + 0.125, 0.0, 0.80)))
    for sy in (1.0, -1.0):
        b.extend(K.box_buf((fx - 0.004, min(sy * 0.68, sy * 0.755), 0.665), (fx + 0.225, max(sy * 0.68, sy * 0.755), 0.925), 'plastic_int', 0.02, 2))
    # woodgrain strip across the passenger's side
    b.extend(K.box_buf((fx - 0.008, -0.66, 0.848), (fx + 0.004, -0.13, 0.904), 'wood', 0.005, 2))
    b.extend(K.box_buf((fx - 0.0095, -0.662, 0.846), (fx - 0.006, -0.128, 0.849), 'chrome', 0.001, 1))
    # glovebox lid and push button
    b.extend(K.box_buf((fx - 0.006, -0.60, 0.71), (fx + 0.004, -0.20, 0.828), 'paint', 0.01, 2))
    b.extend(K.cyl_buf((fx - 0.006, -0.40, 0.81), (fx - 0.014, -0.40, 0.81), 0.009, 'chrome', 12))
    # instrument pod: a squared box tilted towards the driver
    eye = np.array(EYE)
    pc = np.array([fx - 0.012, DRIVER_Y, 0.908])
    dn = K.unit(eye - pc)
    dn = K.unit(np.array([dn[0], 0.0, dn[2]]))
    R = K.frame_from((0, 1, 0), dn)          # X = across (+y), Z = dial normal
    M = K.mat4_trs(pc, R)
    b.extend(K.box_buf((-0.24, -0.074, -0.03), (0.24, 0.082, 0.0), 'plastic_int', 0.012, 3, xf=M))
    gauges = []
    for (gy, gz, r, name) in ((0.084, 0.004, 0.062, 'N_speed'), (-0.084, 0.004, 0.062, 'N_rpm'),
                              (0.194, -0.008, 0.029, 'N_fuel'), (-0.194, -0.008, 0.029, 'N_temp')):
        c = pc + R[:, 0] * gy + R[:, 1] * gz
        db, g = dial(c, dn, r, r > 0.05, 'chrome')
        b.extend(db)
        g['name'] = name
        gauges.append(g)
    for k, zz in enumerate((0.03, -0.01, -0.05)):
        cc = pc + R[:, 1] * zz + dn * 0.0005
        V, N, T = K.lathe(np.array([(0.0, 0.0), (0.005, 0.0)]), cc, dn, 10, prof_n=np.array([[0, 1.0], [0, 1.0]]))
        b.add(V, N, T, 'lens_amber' if k == 1 else 'emit')
    # square vents: ends and centre (80s: slatted rectangles)
    for vy, vz in ((0.66, 0.862), (-0.70, 0.862), (0.11, 0.885), (-0.11, 0.885)):
        c = np.array([fx - 0.002, vy, vz])
        b.extend(K.box_buf(c + (-0.004, -0.045, -0.026), c + (0.004, 0.045, 0.026), 'chrome', 0.004, 2))
        b.extend(K.box_buf(c + (-0.006, -0.040, -0.021), c + (0.03, 0.040, 0.021), 'trim', 0.002, 1))
        for k in range(-1, 2):
            b.extend(K.box_buf(c + (-0.011, -0.038, 0.012 * k - 0.0015), c + (-0.004, 0.038, 0.012 * k + 0.0015), 'trim', 0.0, 1))
    # centre stack: heater sliders above the radio opening
    b.extend(K.box_buf((fx - 0.006, -0.085, 0.825), (fx + 0.002, 0.085, 0.865), 'chrome', 0.004, 2))
    b.extend(K.box_buf((fx - 0.008, -0.08, 0.83), (fx - 0.005, 0.08, 0.86), 'trim', 0.002, 1))
    for k in range(3):
        yy = -0.05 + 0.05 * k
        b.extend(K.box_buf((fx - 0.02, yy - 0.006, 0.84), (fx - 0.008, yy + 0.006, 0.852), 'plastic_int', 0.003, 2))
    # radio opening (the radio part sits in it): a dark recess with a chrome lip
    b.extend(K.box_buf((fx - 0.004, -0.097, RADIO_Z - 0.028), (fx + 0.002, 0.097, RADIO_Z + 0.028), 'chrome', 0.003, 2))
    b.extend(K.box_buf((fx - 0.006, -0.09, RADIO_Z - 0.023), (fx + 0.06, 0.09, RADIO_Z + 0.023), 'trim', 0.002, 1))
    return b, gauges


RADIO_Z = 0.785


def console():
    """Short centre console under the radio with an ashtray, the gear lever's boot ring and the handbrake slot."""
    b = K.Buf()
    b.extend(K.box_buf((0.62, -0.11, 0.50), (DASH_FACE_X + 0.03, 0.11, 0.68), 'plastic_int', 0.02, 3))
    b.extend(K.box_buf((0.615, -0.07, 0.595), (0.625, 0.07, 0.64), 'chrome', 0.004, 2))
    b.extend(K.box_buf((0.612, -0.065, 0.60), (0.617, 0.065, 0.635), 'trim', 0.002, 1))
    gx = GEAR_X
    gz = tunnel_h(gx) + 0.055
    V, N, T = K.lathe(np.array([(0.0, 0.012), (0.03, 0.012), (0.055, 0.004), (0.068, 0.0)])[::-1], (gx, 0.0, gz), (0, 0, 1), 24)
    b.add(V, N, T, 'trim')
    hz = tunnel_h(HB_X) + 0.055
    b.extend(K.box_buf((HB_X - 0.14, -0.032, hz - 0.005), (HB_X + 0.13, 0.032, hz + 0.012), 'plastic_int', 0.008, 2))
    b.extend(K.box_buf((HB_X - 0.11, -0.012, hz + 0.008), (HB_X + 0.10, 0.012, hz + 0.0135), 'trim', 0.002, 1))
    return b


GEAR_X = 0.50
HB_X = 0.10
