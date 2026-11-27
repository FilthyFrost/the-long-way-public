"""Pickup: everything behind the outer skin. Engine bay, door insides, hood inner frame, door apertures, ladder
frame underbody with leaf springs (UNDER), cab interior (INTERIOR), bed underside and the fuel pocket."""
import math
import sys

sys.dont_write_bytecode = True

import numpy as np  # noqa: E402

from frames import _kit as K  # noqa: E402
from frames import pickup as S  # noqa: E402
from frames._sedan_inner import (dial, dropped_crossmember, extrude_y, face_up, flip_down, orient_out,  # noqa: E402
                                 quad_sheet, recompute_normals, ring_inner, side_out, tub, strut_tower, heat_shield,
                                 harness, smooth_path)

D = S.D
PI = math.pi
FLOOR_Z = 0.465          # cab floor (rubber mat top)
PAN_Z = 0.43             # underside of the cab floor
FIREWALL_X = 1.00
RAD_X = 1.995
APRON_Y = 0.50
SEAT_X = 0.30            # seat floor attachment x: a 1.01 m bucket seat's back clears the cab's rear wall
DRIVER_Y = 0.36
# the seats' runners are let into the floor, standing 5 mm proud of the mat (they stood on it, 3 cm tall: the
# cushion 2.5 cm lower gives her head its room with her eyes where a woman of her height sits, Nomad Drive's driver's
# view, 2026-11-26)
SEAT_RISE = 0.005
EYE = (SEAT_X - 0.16, DRIVER_Y, FLOOR_Z + SEAT_RISE + 0.90)   # the stock bucket seat's eye (parts_geo: eye -0.16, 0.90)
# where the view is from: her eyes as the game seats her (0.18 ahead of and 0.08 under the seat's eye point), the
# frame's cabView (core/modcar/frames.ts) 0.30 back and 0.145 up — a woman's sitting height, 0.73 m over the cushion
VIEW = (EYE[0] + 0.183 - 0.30, DRIVER_Y, EYE[2] - 0.079 + 0.145)
# the instrument hood and the pod in it stand this much higher than they did, so that from the raised view the dials
# are 30 deg under the level line (they would have been 34; Nomad Drive's 23-32)
POD_RISE = 0.045
GEAR_X = 0.62
# the handbrake on the hump between the seats, behind the gear lever (seen when the driver looks down to the right)
HB_X = 0.36
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
    # (side wall and ledge finely divided: the baked occlusion lives on their vertices)
    b.extend(quad_sheet((FIREWALL_X, APRON_Y, 0.55), (RAD_X - FIREWALL_X, 0, 0), (0, 0, top - 0.55), 10, 5, (0, -1, 0), 'paint'))
    R = 0.425
    b.extend(tub(xa, za, R, APRON_Y, y_out, 4, 176, 'paint', True))
    # shock tower bulging into the bay from the side wall (the shock's top mount on its cap), the upper
    # control arm's mounting plate in front of it, a stamped bead along the wall
    b.extend(strut_tower(xa + 0.02, 0.54, 0.07, 0.55, top + 0.003, APRON_Y))
    b.extend(K.box_buf((xa - 0.20, APRON_Y - 0.012, 0.74), (xa - 0.07, APRON_Y, 0.84), 'paint', 0.006, 2))
    for (bx0, bz0) in ((xa - 0.18, 0.76), (xa - 0.09, 0.76), (xa - 0.18, 0.82), (xa - 0.09, 0.82)):
        b.extend(K.cyl_buf((bx0, APRON_Y - 0.012, bz0), (bx0, APRON_Y - 0.020, bz0), 0.008, 'steel', 6))
    for (x0, x1) in ((FIREWALL_X + 0.06, xa - 0.23), (xa + 0.11, RAD_X - 0.06)):
        b.extend(K.tube_buf(np.array([(x0, APRON_Y, 0.70), (x1, APRON_Y, 0.70)]), 0.007, 'paint', 6))
    b.extend(quad_sheet((FIREWALL_X, APRON_Y, top), (RAD_X - FIREWALL_X, 0, 0), (0, y_out - APRON_Y, 0), 10, 4, (0, 0, 1), 'paint'))
    for x0 in (xa - R - 0.01, xa + R + 0.01):
        b.extend(quad_sheet((x0, APRON_Y, 0.55), (0, y_out - APRON_Y, 0), (0, 0, top - 0.55), 1, 2, (1 if x0 > xa else -1, 0, 0), 'paint'))
    b.extend(quad_sheet((FIREWALL_X, 0.0, 0.47), (0, APRON_Y, 0), (0, 0, 0.53), 5, 6, (1, 0, 0), 'paint'))
    b.extend(K.box_buf((FIREWALL_X - 0.02, 0.0, 0.985), (D['hood_rear'] + 0.005, 0.79, 0.998), 'paint', 0.004, 2))
    b.extend(K.box_buf((RAD_X, 0.0, 0.925), (RAD_X + 0.045, APRON_Y + 0.01, 0.972), 'paint', 0.008, 2))
    b.extend(K.box_buf((RAD_X, 0.0, 0.50), (RAD_X + 0.045, APRON_Y + 0.01, 0.545), 'paint', 0.008, 2))
    b.extend(K.box_buf((RAD_X, APRON_Y - 0.065, 0.50), (RAD_X + 0.045, APRON_Y + 0.01, 0.972), 'paint', 0.008, 2))
    b.extend(K.box_buf((RAD_X - 0.025, 0.0, 0.968), (RAD_X + 0.006, 0.035, 1.0), 'steel', 0.004, 2))
    b.extend(K.box_buf((1.00, 0.63, 0.975), (1.05, 0.645, 1.02), 'steel', 0.003, 1))
    # ribbed heat shield on the firewall behind the engine (within 2 cm of it)
    b.extend(heat_shield(FIREWALL_X, 0.29, 0.62, 0.92))
    # wiring loom from the fuse box along the side wall, round the shock tower to the headlamp, over the
    # radiator support's top bar, and down across the firewall under the heat shield
    wy = APRON_Y - 0.015
    xt = xa + 0.02
    main = [(FIREWALL_X + 0.24, wy, 0.895), (xt - 0.14, wy, 0.90), (xt - 0.06, 0.462, 0.91), (xt, 0.455, 0.915), (xt + 0.06, 0.462, 0.91),
            (xt + 0.14, wy, 0.90), (RAD_X - 0.06, wy - 0.003, 0.88), (RAD_X - 0.02, 0.47, 0.83), (RAD_X - 0.012, 0.46, 0.80)]
    top_bar = [(RAD_X - 0.06, wy - 0.003, 0.88), (RAD_X + 0.008, 0.45, 0.978), (RAD_X + 0.02, 0.24, 0.979), (RAD_X + 0.02, 0.0, 0.979)]
    fw = [(FIREWALL_X + 0.13, wy, 0.865), (1.08, wy, 0.72), (FIREWALL_X + 0.012, 0.47, 0.63), (FIREWALL_X + 0.012, 0.32, 0.602),
          (FIREWALL_X + 0.012, 0.0, 0.602)]
    b.extend(harness([main, top_bar, fw], [0.008, 0.006, 0.006]))
    for x in (1.20, xt + 0.20, RAD_X - 0.16):
        b.extend(K.box_buf((x - 0.008, APRON_Y - 0.009, 0.885), (x + 0.008, APRON_Y, 0.912), 'trim', 0.002, 1))
    b.extend(K.box_buf((RAD_X - 0.025, 0.445, 0.77), (RAD_X - 0.002, 0.475, 0.805), 'plastic_int', 0.004, 1))
    # brake lines from the master cylinder down the side wall
    for dz in (0.0, 0.013):
        path = [(FIREWALL_X + 0.21, 0.42, 0.84 + dz), (1.25, 0.46, 0.835 + dz), (1.28, APRON_Y - 0.006, 0.80 + dz),
                (1.295, APRON_Y - 0.006, 0.68 + dz), (1.30, APRON_Y - 0.006, 0.58 + dz)]
        b.extend(K.tube_buf(smooth_path(path, 1), 0.0026, 'steel', 4))
    return b


def engine_bay_asym():
    b = K.Buf()
    fx = FIREWALL_X
    # (all of these stay outboard of the engine's space, |y| > 0.32)
    by_ = 0.42
    V, N, T = K.lathe(np.array([(0.0, 0.0), (0.066, 0.0), (0.075, 0.011), (0.075, 0.054), (0.066, 0.064), (0.0, 0.064)]), (fx, by_, 0.84), (1, 0, 0), 16)
    b.add(V, N, T, 'steel')
    b.extend(K.cyl_buf((fx + 0.064, by_, 0.84), (fx + 0.21, by_, 0.84), 0.02, 'alu', 12))
    b.extend(K.cyl_buf((fx + 0.14, by_, 0.86), (fx + 0.14, by_, 0.912), 0.026, 'ceramic', 14))
    b.extend(K.cyl_buf((fx + 0.14, by_, 0.912), (fx + 0.14, by_, 0.926), 0.021, 'trim', 12))
    # heater box on the right with its hose stubs, relay box on the right wall, fuse box on the left wall
    b.extend(K.box_buf((fx, -0.492, 0.74), (fx + 0.10, -0.33, 0.94), 'plastic_int', 0.02, 2))
    for hz in (0.80, 0.87):
        b.extend(K.tube_buf(smooth_path([(fx + 0.10, -0.41, hz), (fx + 0.15, -0.41, hz - 0.005), (fx + 0.17, -0.405, hz - 0.05)]), 0.012, 'rubber', 8))
    b.extend(K.box_buf((fx + 0.15, -APRON_Y, 0.86), (fx + 0.22, -APRON_Y + 0.04, 0.93), 'trim', 0.006, 2))
    b.extend(K.box_buf((fx + 0.13, APRON_Y - 0.05, 0.84), (fx + 0.25, APRON_Y - 0.002, 0.94), 'trim', 0.008, 2))
    b.extend(K.box_buf((1.58, APRON_Y - 0.003, 0.76), (1.66, APRON_Y - 0.001, 0.80), 'alu', 0.0, 1))
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


# the rear axle's tubes start this far out from the centre: 2 cm inside the differential part's tube ends
AXLE_IN = 0.29
# the front of the differential part's pinion (its companion flange and nut), ahead of the axle centre, and the
# pinion's height below it
DIFF_FLANGE = (0.2645, -0.024)


def axle_end(hy):
    """Where a live axle's tube ends: in the middle of its hub's carrier (knuckle())."""
    return hy - K.BRAKE_IN[1] - 0.003 - 0.015


def knuckle(hx, hy, hz, front=True):
    """A hub's carrier (left side: outer face +Y): the hub flange at the hub face with six studs and the centre
    cap, the spindle, and the knuckle just inboard of the brake (front: up to the upper arm's ball joint; rear:
    the axle's end). An object of its own, KNUCKLE_<hub>, the game hangs on the wheel's pivot."""
    return K.knuckle_buf(hx, hy, hz, hy + 0.012, 0.08, 6, 0.0695, 30.0, stud_r=0.006, stud_len=0.008, cap_r=0.025,
                         cap_out=0.006, carrier=(0.055, 0.03, 0.12, 0.21 if front else 0.14))


def underbody():
    """UNDER (left half): ladder frame rail and crossmember halves, the front arms and torsion bar, the rear
    axle's tubes, cab floor and bed underside, wheelhouse liners. The hubs' carriers are objects of their own
    (knuckle()); shocks, springs, the leaf packs and their hangers, brakes and the differential are the axles'
    parts."""
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
    # front suspension: lower / upper arms out to the knuckle, the torsion bar
    hx, hy, hz = D['ax_f'], D['track_f'] / 2, D['hub_z']
    b.extend(K.tube_buf(np.array([(hx + 0.14, FRAME_Y - 0.04, 0.33), (hx, hy - 0.14, 0.27), (hx - 0.16, FRAME_Y - 0.04, 0.33)]), 0.016, 'steel', 8))
    b.extend(K.tube_buf(np.array([(hx + 0.10, APRON_Y, 0.66), (hx, hy - 0.15, 0.56), (hx - 0.10, APRON_Y, 0.66)]), 0.013, 'steel', 8))
    b.extend(K.tube_buf(np.array([(hx - 0.16, FRAME_Y - 0.04, 0.33), (0.45, FRAME_Y - 0.05, 0.34)]), 0.013, 'steel', 8))
    # rear: the axle's tube from the differential part's tube end out into the hub's carrier
    rx, ry = D['ax_r'], D['track_r'] / 2
    b.extend(K.cyl_buf((rx, AXLE_IN, hz), (rx, axle_end(ry), hz), 0.042, 'steel', 14))
    return b


def centre_under():
    b = K.Buf()
    hz = D['hub_z']
    rx = D['ax_r']
    # the two-piece propshaft on its centre bearing, back to the differential part's companion flange
    xe, ze = rx + DIFF_FLANGE[0] + 0.022, hz + DIFF_FLANGE[1]
    b.extend(K.cyl_buf((0.30, 0.0, 0.43), (-0.35, 0.0, 0.40), 0.035, 'steel', 14))
    b.extend(K.box_buf((-0.40, -0.06, 0.38), (-0.30, 0.06, 0.44), 'rubber', 0.01, 1))
    b.extend(K.cyl_buf((-0.35, 0.0, 0.40), (xe, 0.0, ze), 0.035, 'steel', 14))
    b.extend(K.cyl_buf((xe - 0.02, 0.0, ze), (xe + 0.02, 0.0, ze), 0.045, 'steel', 14))
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
    b.extend(K.panel_back(si['P'], si['N'], si['E']))
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
    # firewall face inside the cab (the engine bay's firewall sheet faces the bay)
    L.extend(quad_sheet((FIREWALL_X - 0.004, 0.0, FLOOR_Z), (0, 0.72, 0), (0, 0, 0.81 - FLOOR_Z), 2, 2, (-1, 0, 0), 'trim'))
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
    V, N, T = K.lathe(np.array([(0.0, 0.012), (0.03, 0.012), (0.055, 0.004), (0.068, 0.0)])[::-1], (gx, 0.0, tunnel_h(gx) + 0.002), (0, 0, 1), 20)
    C.add(V, N, T, 'rubber')
    # the handbrake's slot on the hump (the lever is the handbrake part)
    hz = tunnel_h(HB_X)
    C.extend(K.box_buf((HB_X - 0.14, -0.03, hz - 0.004), (HB_X + 0.16, 0.03, hz + 0.008), 'plastic_int', 0.006, 2))
    C.extend(K.box_buf((HB_X - 0.11, -0.012, hz + 0.004), (HB_X + 0.13, 0.012, hz + 0.0095), 'trim', 0.002, 1))
    # seat runners, let into the floor
    for (sx, sy) in ((SEAT_X, DRIVER_Y), (SEAT_X, -DRIVER_Y)):
        for dy in (-0.16, 0.16):
            C.extend(K.box_buf((sx - 0.22, sy + dy - 0.015, FLOOR_Z - 0.025), (sx + 0.22, sy + dy + 0.015, FLOOR_Z + SEAT_RISE), 'steel', 0.003, 2))
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
        # (the hood's lower lip is lifted over the cluster: from the eye it hid the top small dial; the hood stands
        # POD_RISE higher than the rest of the top, the instrument hood of an 80s truck)
        rise = POD_RISE * float(K.sstep(0.27, 0.22, ay)) if y > 0 else 0.0
        pts = np.array([(0.92, 1.065), (0.86, 1.095 + rise * 0.5), (fx + 0.03, 1.105 + hood * 0.6 + rise), (fx - 0.005 - hood, 1.10 + hood * 0.6 + rise),
                        (fx - 0.02 - hood, 1.08 + hood * 0.85 + rise), (fx - 0.012 - hood, 1.058 + hood * 0.85 + rise), (fx + 0.01, 1.05 + rise), (0.92, 1.045)])
        return K.round_profile(pts, [0, 0.03, 0.02, 0.012, 0.01, 0.008, 0.01, 0], 1)
    ys = np.concatenate([np.linspace(-0.70, 0.06, 3), np.linspace(0.08, 0.64, 8), [0.71]])
    b.extend(extrude_y(None, ys, 'plastic_int', inside=(0.85, 0.0, 1.07), sec_fn=pad_sec))
    fas = K.round_profile(np.array([(fx, 1.05), (fx, 0.84), (fx + 0.04, 0.81), (0.93, 0.81), (0.93, 1.05)]), [0, 0.025, 0.02, 0, 0], 2)
    # behind the instrument box the fascia stops lower: the box leans back towards the driver and its top
    # half sat behind the fascia's face (a painted band across the top small dial)
    fas_low = K.round_profile(np.array([(fx, 0.995 + POD_RISE), (fx, 0.84), (fx + 0.04, 0.81), (0.93, 0.81), (0.93, 0.995 + POD_RISE)]), [0, 0.025, 0.02, 0, 0], 2)
    yb0, yb1 = DRIVER_Y - 0.222, DRIVER_Y + 0.222
    for (y0, y1, sec) in ((-0.66, yb0, fas), (yb0, yb1, fas_low), (yb1, 0.66, fas)):
        b.extend(extrude_y(sec, np.linspace(y0, y1, 3), 'paint', inside=(0.82, 0.5 * (y0 + y1), 0.94)))
    for sy in (1.0, -1.0):
        b.extend(K.box_buf((fx - 0.004, min(sy * 0.66, sy * 0.72), 0.815), (0.93, max(sy * 0.66, sy * 0.72), 1.05), 'plastic_int', 0.02, 2))
    # glovebox
    b.extend(K.box_buf((fx - 0.006, -0.60, 0.86), (fx + 0.004, -0.22, 0.98), 'plastic_int', 0.01, 2))
    b.extend(K.box_buf((fx - 0.012, -0.43, 0.955), (fx - 0.004, -0.39, 0.97), 'chrome', 0.003, 1))
    # the back of the raised hood: closed behind the pod down to the fascia
    b.extend(K.box_buf((fx + 0.012, DRIVER_Y - 0.26, 0.98), (0.90, DRIVER_Y + 0.26, 1.048 + POD_RISE), 'plastic_int', 0.004, 1))
    eye = np.array(VIEW)
    pc = np.array([fx - 0.012, DRIVER_Y, 1.005 + POD_RISE])
    dn = K.unit(eye - pc)
    dn = K.unit(np.array([dn[0], 0.0, dn[2]]))
    R = K.frame_from((0, 1, 0), dn)
    b.extend(K.box_buf((-0.235, -0.076, -0.03), (0.235, 0.075, 0.0), 'trim', 0.012, 2, xf=K.mat4_trs(pc, R)))
    gauges = []
    for (gy, gz, r, name, big) in ((0.106, 0.004, 0.060, 'N_speed', True), (-0.11, 0.004, 0.058, 'N_rpm', True),
                                   (0.0, 0.020, 0.023, 'N_fuel', False), (0.0, -0.040, 0.023, 'N_temp', False)):
        c = pc + R[:, 0] * gy + R[:, 1] * gz
        db, g = dial(c, dn, r, big, 'plastic_int')
        b.extend(db)
        g['name'] = name
        gauges.append(g)
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
