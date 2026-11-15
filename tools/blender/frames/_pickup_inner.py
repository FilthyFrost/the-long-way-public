"""Pickup: everything behind the outer skin. Engine bay, door insides, hood inner frame, door apertures, ladder
frame underbody with leaf springs (UNDER), cab interior (INTERIOR), bed underside and the fuel pocket."""
import math
import sys

sys.dont_write_bytecode = True

import numpy as np  # noqa: E402

from frames import _kit as K  # noqa: E402
from frames import pickup as S  # noqa: E402
from frames._sedan_inner import (dropped_crossmember, extrude_y, face_up, flip_down, orient_out, quad_sheet,  # noqa: E402
                                 recompute_normals, ring_inner, side_out, tub)

D = S.D
PI = math.pi
FLOOR_Z = 0.465          # cab floor (rubber mat top)
PAN_Z = 0.43             # underside of the cab floor
FIREWALL_X = 1.00
RAD_X = 1.995
APRON_Y = 0.50
SEAT_X = 0.30            # seat floor attachment x: a 1.01 m bucket seat's back clears the cab's rear wall
DRIVER_Y = 0.36
EYE = (SEAT_X - 0.16, DRIVER_Y, FLOOR_Z + 0.03 + 0.90)   # the stock bucket seat's eye (parts_geo: eye -0.16, 0.90)
GEAR_X = 0.62
DASH_FACE_X = 0.70
FRAME_Y = 0.46           # ladder frame rails (centre)
FRAME_Z0, FRAME_Z1 = 0.30, 0.42   # rail bottom / top under the cab (kicks up 0.18 over the rear axle)


def frame_zc(x):
    """Rail centre height along x: low under the cab, kicked up over the rear axle."""
    return 0.36 + 0.18 * float(K.sstep(-0.62, -0.95, x)) - 0.0 * x


def side_pt(x, z, level=0.0):
    P, N = S.SIDE_L.to3d(np.array([[x, z]]))
    return P[0] + N[0] * level, N[0]


def tunnel_h(x):
    return 0.55 + 0.06 * float(K.sstep(0.20, 0.80, x))


# ============================================================================================ doors
def door_card(ex):
    b = K.Buf()
    x0, x1 = D['fd_rear'] + 0.03, D['fd_front'] - 0.03
    z0, z1 = D['door_bot'] + 0.03, 0.93
    loop = K.ccw(K.rounded_poly(np.array([(x0, z0), (x1, z0), (x1, z1), (x0, z1)]), [0.03, 0.03, 0.02, 0.02], 0.05, arc_step=0.012))
    g = K.grid_points(x0, x1, z0, z1, 0.08, dt=0.08)
    card = K.OffsetChart(S.SIDE_L, -0.104)
    V, N, T = K.mesh_region(card, [K.Loop(K.resample_keep(loop, 0.05))], [], g, spacing=0.08)
    b.add(V, -N, T, 'plastic_int')
    P, Nn = card.to3d(loop)
    V, N, Tr = K.roll_edge(P, -Nn, side_out(P, Nn), 0.004, 0.012, 0.0, 2, closed=True)
    b.add(V, N, Tr, 'plastic_int')
    # ribbed vinyl panel insert: three horizontal welts
    for zc in (0.62, 0.68, 0.74):
        xs = np.linspace(x0 + 0.08, x1 - 0.10, 5)
        P, Nn = K.OffsetChart(S.SIDE_L, -0.106).to3d(np.stack([xs, np.full(len(xs), zc)], 1))
        prof = np.array([(0.0, -0.006), (0.004, -0.003), (0.005, 0.0), (0.004, 0.003), (0.0, 0.006)])
        V, N, Tr = K.sweep(P, (0, 0, 1), prof, closed=False)
        b.add(V, N, Tr, 'plastic_int')
    # armrest / pull and window crank, door lock knob on the sill
    xs = np.linspace(x0 + 0.20, x1 - 0.32, 6)
    P, Nn = K.OffsetChart(S.SIDE_L, -0.104).to3d(np.stack([xs, np.full(len(xs), 0.80)], 1))
    prof = K.round_profile(np.array([(0.0, -0.022), (0.05, -0.026), (0.06, 0.0), (0.045, 0.026), (0.0, 0.026)]), 0.01, 2)
    V, N, Tr = K.sweep(P, (0, 0, 1), prof, closed=False)
    b.add(V, N, Tr, 'plastic_int')
    pc, nc = side_pt(x0 + 0.42, 0.78, -0.104)
    inward = -nc
    b.extend(K.cyl_buf(pc, pc + inward * 0.02, 0.022, 'chrome', 14))
    end = pc + inward * 0.02 + np.array([0.0, 0.0, -0.07])
    b.extend(K.tube_buf(np.array([pc + inward * 0.02, end]), 0.006, 'chrome', 6))
    b.extend(K.cyl_buf(end, end + inward * 0.04, 0.012, 'plastic_int', 10))
    ph, nh = side_pt(x1 - 0.16, 0.86, -0.104)
    b.extend(K.box_buf(ph + (-0.05, -0.012, -0.012), ph + (0.05, 0.0, 0.012), 'chrome', 0.004, 2))
    return b


def door_extras(ex):
    b = K.Buf()
    jl = ex.jl
    xa, xb = D['fd_front'] - 0.004, D['fd_rear'] + 0.004
    uv, P, NL, NG, _ = jl.between(float(S.u_of_x(xa)), float(S.u_of_x(xb)))
    P = K.resample(P, 0.06, closed=False)
    prof = K.round_profile(np.array([(0.012, -0.002), (0.012, 0.007), (0.002, 0.015), (-0.010, 0.015), (-0.012, 0.004), (-0.012, -0.002)]), 0.004, 1)
    V, N, Tr = K.sweep(P, (0, 0, 1), prof, closed=False)
    b.add(V, N, Tr, 'trim')
    for e in (0, -1):
        b.extend(K.fill_loop(V.reshape(len(P), -1, 3)[e], (np.sign(P[e, 0] - P[-1 - e, 0]), 0, 0), 'trim'))
    Pin = P.copy()
    Pin[:, 1] -= 0.045
    prof = K.round_profile(np.array([(0.035, -0.10), (0.032, 0.0), (0.012, 0.005), (-0.02, 0.0), (-0.025, -0.10)]), 0.008, 1)
    V, N, Tr = K.sweep(Pin + np.array([0, 0, -0.01]), (0, 0, 1), prof, closed=False)
    b.add(V, N, Tr, 'plastic_int')
    # flush pull handle in a recess near the rear edge, key barrel beside it
    xh, zh = D['fd_rear'] + 0.15, 0.965
    ph, nh = side_pt(xh, zh)
    b.extend(K.box_buf((-0.07, -0.007, -0.02), (0.07, 0.0015, 0.02), 'trim', 0.004, 2, xf=K.mat4_trs(ph)))
    b.extend(K.box_buf((-0.06, -0.002, -0.009), (0.06, 0.012, 0.009), 'chrome', 0.006, 2, xf=K.mat4_trs(ph)))
    pk, nk = side_pt(xh + 0.115, zh)
    b.extend(K.cyl_buf(pk - nk * 0.002, pk + nk * 0.006, 0.0095, 'chrome', 14))
    for zz in (0.62, 0.90):
        p0, n0 = side_pt(D['fd_front'] - 0.004, zz, -0.03)
        b.extend(K.box_buf(p0 + (-0.012, -0.03, -0.03), p0 + (0.004, 0.0, 0.03), 'steel', 0.004, 2))
    # mirror sail at the front of the window frame (the mirror part mounts on the body next to it)
    return b


def door_frame_inner(ex):
    c = ex.cut['doorG']
    s = c.side('in')
    uvp = S.CG.to2d(s['P'])
    gs = ex.gs
    xs = np.linspace(s['uv'][-1, 0], s['uv'][0, 0], 12)[1:-1]
    Pj = np.array([gs.j_point(x)[0] for x in xs])
    loop = np.vstack([uvp, S.CG.to2d(Pj)])
    holes = []
    for name, poly in ex.cut['winG']:
        P, N = S.SIDE_G.to3d(poly)
        holes.append(K.Loop(S.CG.to2d(P)))
    us = np.linspace(0, S.G_GUIDE.length, 200)
    pts, sp = S.grid_from(us, S.g_t_samples())
    V, N, T = K.mesh_region(S.CG, [K.Loop(loop)], holes, pts, spacing=sp, level=-0.035)
    return K.Buf().add(V, -N, T, 'paint')


def hood_inner(ex):
    """Hood inner frame: a perimeter ring 28 mm under the skin (narrow along the hinge edge), open over the
    engine so the stock eng_i4d clears the bonnet."""
    s = ex.cut['hood'].side('in')
    uv = s['uv']
    inner = K.offset_loop2(uv, -0.035, closed=False)
    inner[0, 1] = 0.0
    inner[-1, 1] = 0.0
    return ring_inner(S.CT, uv, inner, -0.10, 0.065)


# ============================================================================================ engine bay
def engine_bay():
    b = K.Buf()
    top = 0.995
    xa, za = D['ax_f'], D['hub_z']
    y_out = 0.792
    b.extend(quad_sheet((FIREWALL_X, APRON_Y, 0.55), (RAD_X - FIREWALL_X, 0, 0), (0, 0, top - 0.55), 4, 2, (0, -1, 0), 'paint'))
    R = 0.425
    b.extend(tub(xa, za, R, APRON_Y, y_out, 4, 176, 'paint', True))
    # upper control arm mount (box) and the shock top on the tub
    b.extend(K.box_buf((xa - 0.10, APRON_Y - 0.06, 0.72), (xa + 0.10, APRON_Y, 0.80), 'paint', 0.01, 2))
    b.extend(K.cyl_buf((xa + 0.02, 0.60, za + R - 0.01), (xa + 0.02, 0.60, za + R + 0.03), 0.05, 'paint', 14))
    b.extend(K.cyl_buf((xa + 0.02, 0.60, za + R + 0.03), (xa + 0.02, 0.60, za + R + 0.05), 0.012, 'steel', 8))
    b.extend(quad_sheet((FIREWALL_X, APRON_Y, top), (RAD_X - FIREWALL_X, 0, 0), (0, y_out - APRON_Y, 0), 4, 1, (0, 0, 1), 'paint'))
    for x0 in (xa - R - 0.01, xa + R + 0.01):
        b.extend(quad_sheet((x0, APRON_Y, 0.55), (0, y_out - APRON_Y, 0), (0, 0, top - 0.55), 1, 2, (1 if x0 > xa else -1, 0, 0), 'paint'))
    b.extend(quad_sheet((FIREWALL_X, 0.0, 0.47), (0, APRON_Y, 0), (0, 0, 0.53), 2, 3, (1, 0, 0), 'paint'))
    b.extend(K.box_buf((FIREWALL_X - 0.02, 0.0, 0.985), (D['hood_rear'] + 0.005, 0.79, 0.998), 'paint', 0.004, 2))
    b.extend(K.box_buf((RAD_X, 0.0, 0.925), (RAD_X + 0.045, APRON_Y + 0.01, 0.972), 'paint', 0.008, 2))
    b.extend(K.box_buf((RAD_X, 0.0, 0.50), (RAD_X + 0.045, APRON_Y + 0.01, 0.545), 'paint', 0.008, 2))
    b.extend(K.box_buf((RAD_X, APRON_Y - 0.065, 0.50), (RAD_X + 0.045, APRON_Y + 0.01, 0.972), 'paint', 0.008, 2))
    b.extend(K.box_buf((RAD_X - 0.025, 0.0, 0.94), (RAD_X + 0.006, 0.035, 1.0), 'steel', 0.004, 2))
    b.extend(K.box_buf((1.00, 0.63, 0.975), (1.05, 0.645, 1.02), 'steel', 0.003, 1))
    path = np.array([(FIREWALL_X + 0.02, APRON_Y - 0.012, 0.88), (1.30, APRON_Y - 0.012, 0.90), (1.70, APRON_Y - 0.012, 0.88), (RAD_X - 0.03, APRON_Y - 0.05, 0.84)])
    b.extend(K.tube_buf(path, 0.007, 'trim', 6))
    return b


def engine_bay_asym():
    b = K.Buf()
    fx = FIREWALL_X
    V, N, T = K.lathe(np.array([(0.0, 0.0), (0.09, 0.0), (0.10, 0.012), (0.10, 0.06), (0.09, 0.072), (0.0, 0.072)]), (fx, 0.30, 0.84), (1, 0, 0), 16)
    b.add(V, N, T, 'steel')
    b.extend(K.cyl_buf((fx + 0.072, 0.30, 0.84), (fx + 0.22, 0.30, 0.84), 0.022, 'alu', 12))
    b.extend(K.cyl_buf((fx + 0.15, 0.30, 0.862), (fx + 0.15, 0.30, 0.92), 0.03, 'ceramic', 14))
    b.extend(K.box_buf((fx, -0.02, 0.80), (fx + 0.11, 0.22, 0.96), 'plastic_int', 0.02, 2))
    bx, by, bz = 1.78, 0.34, 0.70
    b.extend(K.box_buf((bx - 0.15, by - 0.10, bz - 0.012), (bx + 0.15, by + 0.10, bz), 'steel', 0.004, 1))
    b.extend(K.box_buf((bx - 0.02, by + 0.08, 0.56), (bx + 0.02, APRON_Y, bz - 0.012), 'steel', 0.004, 1))
    b.extend(K.box_buf((1.70, -0.45, 0.68), (1.86, -0.35, 0.86), 'ceramic', 0.03, 2))
    b.extend(K.cyl_buf((1.78, -0.40, 0.86), (1.78, -0.40, 0.89), 0.018, 'trim', 10))
    return b


def apertures():
    b = K.Buf()
    b.extend(K.box_buf((D['fd_rear'] - 0.04, 0.66, D['door_bot'] - 0.012), (D['fd_front'] - 0.02, 0.72, D['door_bot'] - 0.002), 'paint', 0.004, 1))
    xs = np.linspace(D['fd_rear'] - 0.02, D['fd_front'] - 0.03, 4)
    path = np.stack([xs, np.full(len(xs), 0.725), np.full(len(xs), D['door_bot'] - 0.004)], 1)
    b.extend(K.tube_buf(path, 0.008, 'rubber', 6))
    return b


# ============================================================================================ underbody
def wheelhouse(xa, y0, y1, r):
    za = D['hub_z']
    a0 = math.degrees(math.asin(min(0.95, (float(S._bot(xa)) + 0.01 - za) / r)))
    ths = np.radians(np.linspace(a0, 180 - a0, 18))
    ys = np.linspace(y0, y1, 3)
    V = np.array([(xa + r * math.cos(t), y, za + r * math.sin(t)) for t in ths for y in ys])
    N = np.array([(-math.cos(t), 0.0, -math.sin(t)) for t in ths for y in ys])
    b = K.Buf().add(V, N, K.grid_tris(len(ths), len(ys)), 'trim')
    ring = np.array([(xa + r * math.cos(t), y0, za + r * math.sin(t)) for t in ths])
    b.extend(K.fill_loop(ring, (0, 1, 0), 'trim'))
    return b


def hub_and_brake(hx, hy, hz, front=True):
    """Frame-owned hub carrier, hub flange with six studs, brake disc (front) or drum (rear)."""
    b = K.Buf()
    yf = hy + 0.012
    if front:
        disc = np.array([(0.04, -0.007), (0.125, -0.007), (0.127, -0.004), (0.127, 0.004), (0.125, 0.007), (0.04, 0.007)])
        V, N, T = K.lathe(disc, (hx, yf - 0.034, hz), (0, 1, 0), 22)
        b.add(V, N, T, 'steel')
        a = math.radians(160)
        cp = np.array([hx + 0.105 * math.cos(a), yf - 0.034, hz + 0.105 * math.sin(a)])
        R = K.mat4_rot((0, 1, 0), -math.degrees(a) + 90, cp)
        b.extend(K.box_buf(cp + (-0.032, -0.03, -0.045), cp + (0.032, 0.014, 0.045), 'alu', 0.008, 2, xf=R))
    else:
        drum = np.array([(0.0, -0.075), (0.13, -0.075), (0.135, -0.07), (0.135, -0.012), (0.12, -0.004), (0.06, 0.0), (0.0, 0.0)])
        V, N, T = K.lathe(drum, (hx, yf, hz), (0, 1, 0), 22)
        b.add(V, N, T, 'steel')
    hat = np.array([(0.0, -0.026), (0.065, -0.026), (0.067, -0.02), (0.067, 0.0), (0.0, 0.0)])
    V, N, T = K.lathe(hat, (hx, yf, hz), (0, 1, 0), 16)
    b.add(V, N, T, 'steel')
    for k in range(6):
        a = math.radians(30 + 60 * k)
        p = np.array([hx + 0.0695 * math.cos(a), yf, hz + 0.0695 * math.sin(a)])
        b.extend(K.cyl_buf(p, p + (0, 0.024, 0), 0.006, 'steel', 6))
    b.extend(K.cyl_buf((hx, yf - 0.002, hz), (hx, yf + 0.014, hz), 0.025, 'steel', 14))
    b.extend(K.box_buf((hx - 0.055, yf - 0.085, hz - 0.12), (hx + 0.055, yf - 0.05, hz + 0.14), 'steel', 0.012, 2))
    return b


def leaf_spring(x0, x1, y, z_mid, sag=0.06, leaves=5):
    """Semi-elliptic leaf spring pack under the frame rail, eye to eye."""
    b = K.Buf()
    xs = np.linspace(x0, x1, 14)
    for k in range(leaves):
        L = 1.0 - 0.17 * k
        xm = 0.5 * (x0 + x1)
        xa, xb = xm - (xm - x0) * L, xm + (x1 - xm) * L
        xl = np.linspace(xa, xb, 10)
        f = (xl - xm) / (0.5 * (x1 - x0))
        z = z_mid + sag * f ** 2 - 0.009 * k
        path = np.stack([xl, np.full(len(xl), y), z], 1)
        prof = np.array([(-0.03, -0.004), (0.03, -0.004), (0.03, 0.004), (-0.03, 0.004)])
        V, N, T = K.sweep(path, (0, 0, 1), prof, closed=False, closed_prof=True)
        b.add(V, N, T, 'steel')
    for xe in (x0, x1):
        b.extend(K.cyl_buf((xe, y - 0.035, z_mid + sag + 0.005), (xe, y + 0.035, z_mid + sag + 0.005), 0.016, 'steel', 10))
    return b


def underbody():
    """UNDER (left half): ladder frame rail and crossmember halves, front suspension, rear leaf springs, hubs,
    brakes, cab floor and bed underside, wheelhouse liners."""
    b = K.Buf()
    # frame rail: a C section (open towards the centre) swept along the kicked-up centre line
    xs = np.concatenate([np.linspace(2.02, -0.55, 4), np.linspace(-0.62, -0.95, 6), np.linspace(-1.05, -2.30, 3)])[::-1]
    path = np.stack([xs, np.full(len(xs), FRAME_Y), [frame_zc(x) for x in xs]], 1)
    prof = np.array([(0.035, -0.06), (-0.035, -0.06), (-0.035, 0.06), (0.035, 0.06), (0.035, 0.052), (-0.027, 0.052), (-0.027, -0.052), (0.035, -0.052)])[::-1]   # CCW
    V, N, T = K.sweep(path, (0, 0, 1), prof, closed=False, closed_prof=True, smooth_prof=False)
    b.add(V, N, T, 'steel')
    # crossmembers (half)
    for x in (1.95, 0.30, -1.15, -1.80, -2.27):
        w = 0.07
        zc = frame_zc(x)
        b.extend(K.box_buf((x - w / 2, 0.0, zc - 0.05), (x + w / 2, FRAME_Y - 0.03, zc + 0.05), 'steel', 0.004, 1))
    # front axle crossmember dropped under the engine's sump, rising into the rails
    b.extend(dropped_crossmember(D['ax_f'], 0.12, 0.06, 0.235, frame_zc(D['ax_f']), 0.30, 0.40, FRAME_Y))
    # cab floor underside and bed underside (with bed sills)
    b.extend(K.box_buf((-0.24, 0.0, PAN_Z - 0.006), (FIREWALL_X, 0.70, PAN_Z), 'trim', 0.003, 1))
    b.extend(K.box_buf((D['bed_xr'] + 0.02, 0.0, D['bed_z0'] - 0.004), (D['bed_xf'] - 0.02, D['bed_hw'] - 0.03, D['bed_z0']), 'trim', 0.003, 1))
    for x in (-0.55, -1.15, -1.75, -2.20):
        b.extend(K.box_buf((x - 0.03, 0.0, D['bed_z0'] - 0.07), (x + 0.03, 0.80, D['bed_z0'] - 0.004), 'steel', 0.004, 1))
    # wheelhouse liners
    b.extend(wheelhouse(D['ax_f'], APRON_Y, 0.80, 0.41))
    # front suspension: lower / upper arms, torsion bar, shock
    hx, hy, hz = D['ax_f'], D['track_f'] / 2, D['hub_z']
    b.extend(hub_and_brake(hx, hy, hz, True))
    b.extend(K.tube_buf(np.array([(hx + 0.14, FRAME_Y - 0.04, 0.33), (hx, hy - 0.14, 0.27), (hx - 0.16, FRAME_Y - 0.04, 0.33)]), 0.016, 'steel', 8))
    b.extend(K.tube_buf(np.array([(hx + 0.10, APRON_Y, 0.66), (hx, hy - 0.15, 0.56), (hx - 0.10, APRON_Y, 0.66)]), 0.013, 'steel', 8))
    b.extend(K.tube_buf(np.array([(hx - 0.16, FRAME_Y - 0.04, 0.33), (0.45, FRAME_Y - 0.05, 0.34)]), 0.013, 'steel', 8))
    b.extend(K.cyl_buf((hx + 0.03, hy - 0.16, 0.29), (hx + 0.02, 0.60, 0.76), 0.022, 'trim', 10))
    # rear: leaf spring, axle half, shock, drum
    rx, ry = D['ax_r'], D['track_r'] / 2
    b.extend(hub_and_brake(rx, ry, hz, False))
    b.extend(leaf_spring(rx + 0.62, rx - 0.62, FRAME_Y, hz + 0.045, 0.06))
    for xe in (rx + 0.62, rx - 0.62):
        zt = frame_zc(xe) - 0.06
        b.extend(K.box_buf((xe - 0.025, FRAME_Y - 0.035, hz + 0.105), (xe + 0.025, FRAME_Y + 0.035, zt), 'steel', 0.003, 1))
    b.extend(K.cyl_buf((rx, 0.0, hz), (rx, ry - 0.075, hz), 0.042, 'steel', 14, cap=False))
    b.extend(K.cyl_buf((rx + 0.12, FRAME_Y + 0.07, hz - 0.03), (rx + 0.20, FRAME_Y + 0.02, frame_zc(rx + 0.2) - 0.05), 0.02, 'trim', 10))
    for dx in (-0.06, 0.06):
        b.extend(K.box_buf((rx + dx - 0.006, FRAME_Y - 0.035, hz - 0.06), (rx + dx + 0.006, FRAME_Y + 0.035, hz + 0.08), 'steel', 0.002, 1))
    return b


def centre_under():
    b = K.Buf()
    hz = D['hub_z']
    rx = D['ax_r']
    dif = np.array([(0.0, -0.15), (0.08, -0.14), (0.13, -0.07), (0.14, 0.0), (0.12, 0.06), (0.07, 0.10), (0.0, 0.11)])
    V, N, T = K.lathe(dif, (rx, 0.0, hz), (1, 0, 0), 20)
    b.add(V, N, T, 'steel')
    b.extend(K.cyl_buf((0.30, 0.0, 0.43), (-0.35, 0.0, 0.40), 0.035, 'steel', 14))
    b.extend(K.box_buf((-0.40, -0.06, 0.38), (-0.30, 0.06, 0.44), 'rubber', 0.01, 1))
    b.extend(K.cyl_buf((-0.35, 0.0, 0.40), (rx + 0.15, 0.0, hz + 0.02), 0.035, 'steel', 14))
    # spare wheel cradle under the rear of the bed
    b.extend(K.box_buf((-2.20, -0.32, 0.36), (-1.86, 0.32, 0.375), 'steel', 0.004, 1))
    b.extend(K.tube_buf(np.array([(-1.86, 0.0, 0.37), (-1.84, 0.0, 0.60)]), 0.008, 'steel', 6))
    # fuel filler hose from the left bed side flap to the tank
    path = np.array([(-0.66, 0.80, 0.875), (-0.66, 0.70, 0.78), (-0.70, 0.45, 0.56), (-0.72, 0.30, 0.52)])
    b.extend(K.tube_buf(path, 0.022, 'rubber', 10))
    return b


# ============================================================================================ bed extras
def bed_under_lights():
    """Tail lamp recess boxes on the rear posts are cut by the exterior; nothing else here (placeholder)."""
    return K.Buf()


def fuel_details(ex):
    b = K.Buf()
    so = ex.cut['fuel'].side('out')
    V, N, T = K.roll_edge(so['P'], so['N'], so['E'], 0.002, 0.03, 0.0, 2, closed=True)
    b.add(V, N, T, 'paint')
    ring = V.reshape(-1, len(so['P']), 3)[-1]
    c = ring.mean(0)
    hole = K.circle_loop(0, 0, 0.022, 0.005)
    h3 = np.stack([c[0] + hole[:, 0], np.full(len(hole), c[1]), c[2] + hole[:, 1]], 1)
    b.extend(K.fill_loop(ring, (0, 1, 0), 'paint', holes=[h3]))
    cap = np.array([[0.0, 0.0], [0.030, 0.0], [0.031, 0.004], [0.031, 0.014], [0.028, 0.018], [0.0, 0.018]])
    V, N, T = K.lathe(cap, c, (0, 1, 0), 20)
    b.add(V, N, T, 'trim')
    b.extend(K.box_buf((c[0] - 0.022, c[1] + 0.016, c[2] - 0.005), (c[0] + 0.022, c[1] + 0.024, c[2] + 0.005), 'trim', 0.003, 2))
    return b


def fuel_flap(ex):
    si = ex.cut['fuel'].side('in')
    loop = K.Loop(S.CB.to2d(si['P']), si['P'], si['N'])
    c = si['uv'].mean(0)
    g = K.grid_points(c[0] - 0.06, c[0] + 0.06, c[1] - 0.06, c[1] + 0.06, 0.012, dt=0.012)
    P3, N3 = S.SIDE_B.to3d(g)
    V, N, T = K.mesh_region(S.CB, [loop], [], S.CB.to2d(P3), spacing=0.012)
    b = K.Buf().add(V, N, T, 'paint')
    V, N, Tr = K.roll_edge(si['P'], si['N'], si['E'], 0.0015, 0.006, 0.004, 2, closed=True, hem_segs=0)
    b.add(V, N, Tr, 'paint')
    return b


# ============================================================================================ interior
def steering_mount():
    ang = math.radians(32.0)
    d = np.array([math.cos(ang), 0.0, -math.sin(ang)])
    p = np.array([0.58, DRIVER_Y, 0.975])
    return p, d


def interior(ex):
    out = {}
    L = K.Buf()
    C = K.Buf()
    # rubber floor mat with the gearbox hump
    xs = np.linspace(-0.20, FIREWALL_X - 0.02, 10)
    V = []
    for x in xs:
        th = tunnel_h(x)
        sec = K.round_profile(np.array([(0.0, th), (0.11, th), (0.15, th - 0.05), (0.19, FLOOR_Z), (0.70, FLOOR_Z), (0.71, 0.49)]), [0, 0.03, 0.03, 0.03, 0.02, 0], 2)
        V += [(x, y, z) for (y, z) in sec]
    V = np.array(V)
    T = K.grid_tris(len(xs), len(V) // len(xs))
    L.extend(face_up(recompute_normals(K.Buf().add(V, np.zeros_like(V), T, 'rubber'))))
    # toe board
    L.extend(K.box_buf((FIREWALL_X - 0.20, 0.17, FLOOR_Z), (FIREWALL_X - 0.02, 0.69, FLOOR_Z + 0.02), 'rubber', 0.006, 2,
                       xf=K.mat4_rot((0, 1, 0), -40, (FIREWALL_X - 0.02, 0, FLOOR_Z))))
    # cab back wall inside (behind the bench) and the sill trims, kick panels
    L.extend(K.box_buf((-0.215, 0.0, FLOOR_Z), (-0.20, 0.72, 1.06), 'plastic_int', 0.006, 2))
    L.extend(K.box_buf((D['fd_rear'] - 0.04, 0.64, FLOOR_Z), (D['fd_front'] - 0.02, 0.70, 0.52), 'plastic_int', 0.012, 2))
    L.extend(K.box_buf((0.82, 0.60, FLOOR_Z), (FIREWALL_X - 0.02, 0.72, 0.80), 'plastic_int', 0.02, 2))
    # headliner
    gus = S.g_u_samples()
    row = np.stack([gus, np.full(len(gus), S.G_T[-1] - 0.02)], 1)
    Pr, _ = S.CG.to3d(row, -0.022)
    a, bb = Pr[-1], Pr[0]
    xc = np.linspace(a[0], bb[0], 20)[1:-1]
    loop = np.vstack([Pr[:, :2], np.stack([xc, np.zeros(len(xc))], 1)])
    g = K.grid_points(-0.3, 0.7, 0.0, 0.8, 0.07, dt=0.07)
    V, N, T = K.mesh_region(S.CR, [K.Loop(loop)], [], g, spacing=0.07, level=-0.022)
    L.add(V, -N, T, 'fabric')
    dash, gauges = dashboard()
    C.extend(dash)
    # pedals
    for (py, w_, name) in ((DRIVER_Y + 0.11, 0.05, 'clutch'), (DRIVER_Y, 0.06, 'brake'), (DRIVER_Y - 0.13, 0.04, 'throttle')):
        base = np.array([FIREWALL_X - 0.12, py, 0.80])
        pad = np.array([FIREWALL_X - 0.24, py, 0.58 if name != 'throttle' else 0.55])
        C.extend(K.tube_buf(np.array([base, (base + pad) / 2 + (0.02, 0, 0), pad + (0, 0, 0.04)]), 0.008, 'steel', 6))
        C.extend(K.box_buf(pad + (-0.012, -w_, -0.04 if name != 'throttle' else -0.06), pad + (0.012, w_, 0.04), 'rubber', 0.006, 2,
                           xf=K.mat4_rot((0, 1, 0), -24, pad)))
    st = steering_mount()
    C.extend(K.cyl_buf(st[0] + st[1] * 0.05, st[0] + st[1] * 0.34, 0.045, 'plastic_int', 18, r1=0.038))
    # gear lever boot ring on the floor hump
    gx = GEAR_X
    V, N, T = K.lathe(np.array([(0.0, 0.012), (0.03, 0.012), (0.055, 0.004), (0.068, 0.0)]), (gx, 0.0, tunnel_h(gx) + 0.002), (0, 0, 1), 20)
    C.add(V, N, T, 'rubber')
    # bench seat rails
    for (sx, sy) in ((SEAT_X, DRIVER_Y), (SEAT_X, -DRIVER_Y)):
        for dy in (-0.16, 0.16):
            C.extend(K.box_buf((sx - 0.22, sy + dy - 0.015, FLOOR_Z), (sx + 0.22, sy + dy + 0.015, FLOOR_Z + 0.03), 'steel', 0.004, 2))
    mp = np.array([float(S.ws_x(0, 1.55)) - 0.08, 0.0, 1.53])
    C.extend(K.box_buf(mp + (-0.01, -0.012, 0.01), mp + (0.012, 0.012, 0.05), 'plastic_int', 0.004, 2))
    C.extend(K.box_buf(mp + (-0.025, -0.11, -0.03), mp + (0.0, 0.11, 0.02), 'plastic_int', 0.012, 3))
    C.extend(K.box_buf(mp + (-0.0262, -0.10, -0.022), mp + (-0.0255, 0.10, 0.012), 'glass_dark', 0.0, 1))
    for sy in (1, -1):
        vp = np.array([float(S.ws_x(0.35, 1.56)) - 0.12, sy * 0.36, 1.555])
        C.extend(K.box_buf(vp + (-0.17, -0.19, -0.012), vp + (0.0, 0.19, 0.008), 'fabric', 0.01, 3, xf=K.mat4_rot((0, 1, 0), 12, vp)))
    out['L'] = L
    out['C'] = C
    out['gauges'] = gauges
    return out


def dashboard():
    """80s truck dash: a long flat padded top, a squared instrument hood with a speedometer, a combination dial
    (fuel / temp) and a tachometer, a centre panel with the radio and heater levers, a glovebox and vents."""
    b = K.Buf()
    fx = DASH_FACE_X

    def pad_sec(y):
        ay = abs(y - DRIVER_Y)
        hood = 0.035 * float(K.sstep(0.27, 0.22, ay)) if y > 0 else 0.0
        pts = np.array([(0.92, 1.065), (0.86, 1.095), (fx + 0.03, 1.105 + hood * 0.6), (fx - 0.005 - hood, 1.10 + hood * 0.6),
                        (fx - 0.02 - hood, 1.08), (fx - 0.012 - hood, 1.058), (fx + 0.01, 1.05), (0.92, 1.045)])
        return K.round_profile(pts, [0, 0.03, 0.02, 0.012, 0.01, 0.008, 0.01, 0], 1)
    ys = np.concatenate([np.linspace(-0.70, 0.06, 3), np.linspace(0.08, 0.64, 8), [0.71]])
    b.extend(extrude_y(None, ys, 'plastic_int', inside=(0.85, 0.0, 1.07), sec_fn=pad_sec))
    fas = K.round_profile(np.array([(fx, 1.05), (fx, 0.84), (fx + 0.04, 0.81), (0.93, 0.81), (0.93, 1.05)]), [0, 0.025, 0.02, 0, 0], 2)
    b.extend(extrude_y(fas, np.linspace(-0.66, 0.66, 3), 'paint', inside=(0.82, 0.0, 0.94)))
    for sy in (1.0, -1.0):
        b.extend(K.box_buf((fx - 0.004, min(sy * 0.66, sy * 0.72), 0.815), (0.93, max(sy * 0.66, sy * 0.72), 1.05), 'plastic_int', 0.02, 2))
    # glovebox
    b.extend(K.box_buf((fx - 0.006, -0.60, 0.86), (fx + 0.004, -0.22, 0.98), 'plastic_int', 0.01, 2))
    b.extend(K.box_buf((fx - 0.012, -0.43, 0.955), (fx - 0.004, -0.39, 0.97), 'chrome', 0.003, 1))
    eye = np.array(EYE)
    pc = np.array([fx - 0.012, DRIVER_Y, 1.005])
    dn = K.unit(eye - pc)
    dn = K.unit(np.array([dn[0], 0.0, dn[2]]))
    R = K.frame_from((0, 1, 0), dn)
    b.extend(K.box_buf((-0.235, -0.068, -0.03), (0.235, 0.075, 0.0), 'trim', 0.012, 2, xf=K.mat4_trs(pc, R)))
    gauges = []
    a_, b_, _ = K.plane_basis(dn)
    for (gy, gz, r, name, big) in ((0.10, 0.004, 0.062, 'N_speed', True), (-0.11, 0.004, 0.058, 'N_rpm', True),
                                   (0.0, 0.016, 0.026, 'N_fuel', False), (0.0, -0.036, 0.026, 'N_temp', False)):
        c = pc + R[:, 0] * gy + R[:, 1] * gz
        bez = np.array([(r - 0.003, -0.004), (r + 0.002, 0.002), (r + 0.006, 0.003), (r + 0.008, 0.0), (r + 0.008, -0.006)])
        V, N, T = K.lathe(bez, c, dn, 24 if big else 16)
        b.add(V, N, T, 'plastic_int')
        V, N, T = K.lathe(np.array([(0.0, -0.007), (r, -0.007), (r, -0.0045)]), c, dn, 24 if big else 16, prof_n=np.array([[0, 1.0], [0, 1.0], [-1.0, 0]]))
        b.add(V, N, T, 'gauge')
        nt = 25 if big else 5
        for k in range(nt):
            ang = math.radians(135.0 - 270.0 * k / (nt - 1)) if big else math.radians(45.0 - 90.0 * k / (nt - 1))
            major = (k % 4 == 0) if big else True
            ln = 0.011 if major else 0.006
            dirv = math.sin(ang) * a_ + math.cos(ang) * b_
            p0 = c + dn * (-0.0065) + dirv * (r - 0.004 - ln)
            p1 = c + dn * (-0.0065) + dirv * (r - 0.004)
            sd = np.cross(dn, dirv) * (0.0013 if major else 0.0008)
            Vt = np.array([p0 - sd, p0 + sd, p1 + sd, p1 - sd])
            b.add(Vt, np.tile(dn, (4, 1)), np.array([(0, 1, 2), (0, 2, 3)]), 'trim')
        gauges.append(dict(name=name, center=c + dn * (-0.006), normal=dn, r=r, up=b_, right=a_, big=big))
    for vy, vz in ((0.63, 0.99), (-0.63, 0.99), (0.10, 1.01), (-0.10, 1.01)):
        c = np.array([fx - 0.002, vy, vz])
        b.extend(K.box_buf(c + (-0.006, -0.05, -0.022), c + (0.004, 0.05, 0.022), 'trim', 0.006, 1))
        for k in range(-1, 2):
            b.extend(K.box_buf(c + (-0.010, -0.045, 0.012 * k - 0.002), c + (-0.004, 0.045, 0.012 * k + 0.002), 'plastic_int', 0.0, 1))
    b.extend(K.box_buf((fx - 0.004, -0.097, 0.887), (fx + 0.002, 0.097, 0.943), 'chrome', 0.003, 2))
    b.extend(K.box_buf((fx - 0.006, -0.09, 0.892), (fx + 0.06, 0.09, 0.938), 'trim', 0.002, 1))
    b.extend(K.box_buf((fx - 0.006, -0.085, 0.955), (fx + 0.002, 0.085, 0.985), 'trim', 0.004, 1))
    for k in range(3):
        yy = -0.05 + 0.05 * k
        b.extend(K.box_buf((fx - 0.02, yy - 0.006, 0.962), (fx - 0.008, yy + 0.006, 0.976), 'plastic_int', 0.003, 1))
    return b, gauges
