"""RV: everything behind the outer skin. Engine bay (aprons, wheel tubs, radiator support, the doghouse that
takes the big diesel back into the cab), the cab interior (dash with four dials, column, pedals, floor, door
cards, the bunk floor overhead), the living module inside (an empty shell as Nomad Drive's campers are: its floor,
walls, ceiling lamps and the over-cab bunk), the ladder frame underbody with twin I-beam front suspension, leaf
sprung rear axle on dual wheels, tanks and the wheelhouse liners (UNDER)."""
import math
import sys

sys.dont_write_bytecode = True

import numpy as np  # noqa: E402

from frames import _kit as K  # noqa: E402
from frames import _steps as STP  # noqa: E402
from frames import rv as S  # noqa: E402
from frames._sedan_inner import (dial, extrude_y, face_up, flip_down, quad_sheet, recompute_normals,  # noqa: E402
                                 ring_inner, side_out, tub, heat_shield, harness, smooth_path)

D = S.D
PI = math.pi
FLOOR_Z = 0.665          # cab floor (mat top)
PAN_Z = 0.625            # under the cab floor
BOX_FLOOR = D['box_floor']
FIREWALL_X = 1.93
RAD_X = 2.70             # radiator support plane
APRON_Y = 0.48
APRON_Y2 = 0.775         # the bay's side wall ahead of the front wheels (the battery sits on the right there)
STEP_X = 2.235           # where the side wall steps out (the steered front tyre sweeps the narrow part)
SEAT_X = 1.13            # seat floor attachment x (the bucket's back reaches into the box, the cab is open)
DRIVER_Y = 0.54
EYE = (SEAT_X - 0.16, DRIVER_Y, FLOOR_Z + 0.03 + 0.90)
DASH_FACE_X = 1.62
DOG = dict(x0=1.40, x1=FIREWALL_X, hw=0.38, top=1.225)    # engine cover between the seats (D6: top 1.184, |y| 0.33)
TUNNEL = dict(x0=0.95, x1=1.40, hw=0.24, top=0.80)
CAB_TUB_Y = 0.72          # the front wheel tub's inner wall inside the cab (the tyre's inner face is at 0.77)
FW_DEG = math.degrees(math.acos((FIREWALL_X - D['ax_f']) / 0.47))   # where the tub meets the firewall
FRAME_Y = 0.46
ENGINE = (1.94, 0.0, 0.32)
GEAR_X = 1.30
# the handbrake on the tunnel beside the gear lever, on the driver's half (the tunnel is too short for one behind it)
HB_X = 1.17
HB_Y = 0.12
WALL = -0.025            # inner skin of the living module: 2.20 m from wall to wall (a tenth of a metre's squares fit it)
# the floor's edge along the walls: under the lining (it stopped 1.5 cm short of it, and through the slot the ground
# showed from inside)
FLOOR_Y = D['bw'] + WALL + 0.003


def frame_zc(x):
    """Rail centre height: low under the cab and box, kicked up over the rear axle."""
    x = float(x)
    return 0.50 + 0.16 * float(K.sstep(-1.30, -1.55, x)) * float(K.sstep(-2.55, -2.30, x))


def side_pt(x, z, level=0.0):
    P, N = S.SIDE_L.to3d(np.array([[x, z]]))
    return P[0] + N[0] * level, N[0]


# ============================================================================================ cab door
def door_card(ex):
    b = K.Buf()
    x0, x1 = D['fd_rear'] + 0.03, D['fd_front'] - 0.04
    z0, z1 = D['door_bot'] + 0.30, 1.30
    loop = K.ccw(K.rounded_poly(np.array([(x0, z0), (x1, z0), (x1, z1), (x0, z1)]), [0.03, 0.03, 0.02, 0.02], 0.05, arc_step=0.012))
    g = K.grid_points(x0, x1, z0, z1, 0.09, dt=0.09)
    card = K.OffsetChart(S.SIDE_L, -0.10)
    V, N, T = K.mesh_region(card, [K.Loop(K.resample_keep(loop, 0.05))], [], g, spacing=0.09)
    b.add(V, -N, T, 'plastic_int')
    P, Nn = card.to3d(loop)
    V, N, Tr = K.roll_edge(P, -Nn, side_out(P, Nn), 0.004, 0.012, 0.0, 2, closed=True)
    b.add(V, N, Tr, 'plastic_int')
    # lower part of the door (round the arch notch): a plain inner panel
    lo = K.ccw(K.rounded_poly(np.array([(x0, D['door_bot'] + 0.03), (1.44, D['door_bot'] + 0.03), (1.44, z0 - 0.01), (x0, z0 - 0.01)]),
                              [0.02] * 4, 0.05, arc_step=0.012))
    g = K.grid_points(x0, 1.44, D['door_bot'], z0, 0.09, dt=0.09)
    V, N, T = K.mesh_region(card, [K.Loop(K.resample_keep(lo, 0.05))], [], g, spacing=0.09)
    b.add(V, -N, T, 'plastic_int')
    # armrest pull, window crank, handle
    xs = np.linspace(x0 + 0.12, x1 - 0.22, 5)
    P, Nn = card.to3d(np.stack([xs, np.full(len(xs), 1.16)], 1))
    prof = K.round_profile(np.array([(0.0, -0.022), (0.05, -0.026), (0.06, 0.0), (0.045, 0.026), (0.0, 0.026)]), 0.01, 2)
    V, N, Tr = K.sweep(P, (0, 0, 1), prof, closed=False)
    b.add(V, N, Tr, 'plastic_int')
    pc, nc = side_pt(x0 + 0.30, 1.10, -0.10)
    inward = -nc
    b.extend(K.cyl_buf(pc, pc + inward * 0.02, 0.022, 'chrome', 14))
    end = pc + inward * 0.02 + np.array([0.0, 0.0, -0.07])
    b.extend(K.tube_buf(np.array([pc + inward * 0.02, end]), 0.006, 'chrome', 6))
    b.extend(K.cyl_buf(end, end + inward * 0.04, 0.012, 'plastic_int', 10))
    ph, nh = side_pt(x1 - 0.14, 1.22, -0.10)
    b.extend(K.box_buf(ph + (-0.05, -0.012, -0.012), ph + (0.05, 0.0, 0.012), 'chrome', 0.004, 2))
    return b


def door_extras(ex):
    """Belt moulding (window seal) on the door, outside pull handle and key, hinges."""
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
    xh, zh = D['fd_rear'] + 0.15, 1.27
    ph, nh = side_pt(xh, zh)
    b.extend(K.box_buf((-0.07, -0.007, -0.02), (0.07, 0.0015, 0.02), 'trim', 0.004, 2, xf=K.mat4_trs(ph)))
    b.extend(K.box_buf((-0.06, -0.002, -0.009), (0.06, 0.012, 0.009), 'chrome', 0.006, 2, xf=K.mat4_trs(ph)))
    pk, nk = side_pt(xh + 0.115, zh)
    b.extend(K.cyl_buf(pk - nk * 0.002, pk + nk * 0.006, 0.0095, 'chrome', 14))
    for zz in (0.98, 1.28):
        p0, n0 = side_pt(D['fd_front'] - 0.004, zz, -0.03)
        b.extend(K.box_buf(p0 + (-0.012, -0.03, -0.035), p0 + (0.004, 0.0, 0.035), 'steel', 0.004, 2))
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
    s = ex.cut['hood'].side('in')
    uv = s['uv']
    inner = K.offset_loop2(uv, -0.035, closed=False)
    inner[0, 1] = 0.0
    inner[-1, 1] = 0.0
    return ring_inner(S.CT, uv, inner, -0.10, 0.065)


# ============================================================================================ engine bay
def engine_bay():
    """Left half: apron over the wheel tub, radiator support, firewall (bay side), battery tray (right side is
    built in engine_bay_asym)."""
    b = K.Buf()
    xa, za = D['ax_f'], D['hub_z']
    top = 1.255
    y_out = 0.93
    R = 0.47
    # side wall in two steps: narrow beside the front wheel, wide ahead of it (a transverse wall between)
    for (x0, x1, wy) in ((FIREWALL_X, STEP_X, APRON_Y), (STEP_X, RAD_X, APRON_Y2)):
        nx = max(2, int(round((x1 - x0) / 0.08)))
        b.extend(quad_sheet((x0, wy, 0.78), (x1 - x0, 0, 0), (0, 0, top - 0.78), nx, 5, (0, -1, 0), 'paint'))
        b.extend(quad_sheet((x0, wy, top), (x1 - x0, 0, 0), (0, y_out - wy, 0), nx, 3, (0, 0, 1), 'paint'))
        b.extend(quad_sheet((x0, wy, top - 0.004), (x1 - x0, 0, 0), (0, 0, 0.004), 1, 1, (0, -1, 0), 'paint'))
        for (bx0, bx1) in ((x0 + 0.05, x1 - 0.05),):
            b.extend(K.tube_buf(np.array([(bx0, wy, 0.98), (bx1, wy, 0.98)]), 0.008, 'paint', 6))
    b.extend(quad_sheet((STEP_X, APRON_Y, 0.78), (0, APRON_Y2 - APRON_Y, 0), (0, 0, top - 0.78), 3, 5, (1, 0, 0), 'paint'))
    b.extend(tub(xa, za, R, APRON_Y, y_out, 4, FW_DEG, 'paint', True))
    for x0 in (xa - R - 0.01, xa + R + 0.01):
        if FIREWALL_X < x0 < RAD_X:
            wy = APRON_Y2 if x0 > STEP_X else APRON_Y
            b.extend(quad_sheet((x0, wy, 0.78), (0, y_out - wy, 0), (0, 0, top - 0.78), 1, 2, (1 if x0 > xa else -1, 0, 0), 'paint'))
    # firewall, bay side, outboard of the doghouse
    b.extend(quad_sheet((FIREWALL_X, DOG['hw'], FLOOR_Z), (0, APRON_Y - DOG['hw'], 0), (0, 0, 1.33 - FLOOR_Z), 1, 3, (1, 0, 0), 'paint'))
    b.extend(quad_sheet((FIREWALL_X, 0.0, DOG['top']), (0, DOG['hw'], 0), (0, 0, 1.33 - DOG['top']), 2, 1, (1, 0, 0), 'paint'))
    b.extend(K.box_buf((FIREWALL_X - 0.02, 0.0, 1.335), (D['hood_rear'] + 0.005, 0.90, 1.35), 'paint', 0.004, 2))
    # radiator support: top bar, bottom bar, side posts out at the wide side walls
    b.extend(K.box_buf((RAD_X, 0.0, 1.20), (RAD_X + 0.05, APRON_Y2, 1.25), 'paint', 0.008, 2))
    b.extend(K.box_buf((RAD_X, 0.0, 0.46), (RAD_X + 0.05, APRON_Y2, 0.50), 'paint', 0.008, 2))
    b.extend(K.box_buf((RAD_X, APRON_Y2 - 0.07, 0.46), (RAD_X + 0.05, APRON_Y2, 1.25), 'paint', 0.008, 2))
    b.extend(K.box_buf((RAD_X - 0.025, 0.0, 1.21), (RAD_X + 0.006, 0.04, 1.27), 'steel', 0.004, 2))
    # heat shields on the firewall where the engine's space leaves room: the band over the doghouse and the
    # strip outboard of it
    b.extend(heat_shield(FIREWALL_X, DOG['hw'] - 0.01, 1.268, 1.325, wl=0.019, amp=0.004))
    b.extend(K.box_buf((FIREWALL_X, DOG['hw'] + 0.008, 0.80), (FIREWALL_X + 0.004, APRON_Y - 0.008, 1.32), 'alu', 0.002, 1))
    # wiring loom: from the fuse box on the left firewall strip along the side walls (both steps) to the
    # headlamp, over the radiator support, and across the firewall over the doghouse
    w1, w2 = APRON_Y - 0.015, APRON_Y2 - 0.015
    # (over the step it climbs above the battery's space)
    main = [(FIREWALL_X + 0.10, w1, 1.17), (STEP_X - 0.12, w1, 1.20), (STEP_X - 0.02, w1 + 0.04, 1.235), (STEP_X + 0.03, w2 - 0.03, 1.235),
            (STEP_X + 0.12, w2, 1.232), (RAD_X - 0.08, w2, 1.225), (RAD_X - 0.03, w2 - 0.02, 1.13), (RAD_X - 0.015, w2 - 0.04, 1.05)]
    top_bar = [(RAD_X - 0.08, w2, 1.225), (RAD_X + 0.008, w2 - 0.04, 1.258), (RAD_X + 0.025, 0.40, 1.259), (RAD_X + 0.025, 0.0, 1.259)]
    fw = [(FIREWALL_X + 0.10, w1, 1.17), (FIREWALL_X + 0.03, w1 - 0.02, 1.25), (FIREWALL_X + 0.012, DOG['hw'] + 0.02, 1.285),
          (FIREWALL_X + 0.012, 0.25, 1.286), (FIREWALL_X + 0.012, 0.0, 1.286)]
    b.extend(harness([main, top_bar, fw], [0.009, 0.006, 0.006]))
    for (x, cz) in ((2.10, 1.19), (STEP_X + 0.20, 1.231), (RAD_X - 0.20, 1.227)):
        wy = APRON_Y2 if x > STEP_X else APRON_Y
        b.extend(K.box_buf((x - 0.009, wy - 0.010, cz - 0.014), (x + 0.009, wy, cz + 0.014), 'trim', 0.002, 1))
    b.extend(K.box_buf((RAD_X - 0.03, w2 - 0.065, 1.02), (RAD_X - 0.004, w2 - 0.03, 1.06), 'plastic_int', 0.004, 1))
    return b


def engine_bay_asym():
    """Brake booster + master cylinder on the left of the firewall, battery tray on the right inner fender,
    washer bottle, the dome of the air box intake."""
    b = K.Buf()
    fx = FIREWALL_X
    # brake booster and master cylinder on the left firewall strip, outboard of the engine's space
    by_ = 0.429
    V, N, T = K.lathe(np.array([(0.0, 0.0), (0.044, 0.0), (0.05, 0.010), (0.05, 0.075), (0.044, 0.085), (0.0, 0.085)]), (fx, by_, 1.06), (1, 0, 0), 14)
    b.add(V, N, T, 'steel')
    b.extend(K.cyl_buf((fx + 0.085, by_, 1.06), (fx + 0.25, by_, 1.06), 0.02, 'alu', 12))
    b.extend(K.cyl_buf((fx + 0.17, by_, 1.08), (fx + 0.17, by_, 1.135), 0.026, 'ceramic', 14))
    b.extend(K.cyl_buf((fx + 0.17, by_, 1.135), (fx + 0.17, by_, 1.15), 0.021, 'trim', 12))
    for dz in (0.0, 0.013):
        path = [(fx + 0.25, by_, 1.06 + dz), (2.21, by_ + 0.03, 1.05 + dz), (2.225, APRON_Y - 0.006, 1.01 + dz), (2.225, APRON_Y - 0.006, 0.82 + dz)]
        b.extend(K.tube_buf(smooth_path(path, 1), 0.0028, 'steel', 4))
    # fuse box on the left firewall strip, relay box on the right one
    b.extend(K.box_buf((fx + 0.004, 0.395, 1.17), (fx + 0.10, APRON_Y - 0.003, 1.25), 'trim', 0.008, 2))
    b.extend(K.box_buf((fx + 0.004, -APRON_Y + 0.003, 1.17), (fx + 0.08, -0.40, 1.24), 'trim', 0.006, 2))
    # battery tray on the right ahead of the wheel, on a bracket from the wide side wall
    bx, by, bz = 2.42, -0.64, 0.96
    b.extend(K.box_buf((bx - 0.19, by - 0.11, bz - 0.012), (bx + 0.19, by + 0.11, bz), 'steel', 0.004, 1))
    b.extend(K.box_buf((bx - 0.20, by - 0.11, bz - 0.012), (bx - 0.19, by + 0.11, bz + 0.03), 'steel', 0.002, 1))
    b.extend(K.box_buf((bx - 0.02, -APRON_Y2, 0.82), (bx + 0.02, by - 0.11, bz - 0.012), 'steel', 0.004, 1))
    # washer bottle on the left ahead of the wheel, the identification plate on the left wall
    b.extend(K.box_buf((2.32, 0.58, 0.95), (2.50, 0.72, 1.16), 'ceramic', 0.03, 2))
    b.extend(K.cyl_buf((2.41, 0.65, 1.16), (2.41, 0.65, 1.19), 0.02, 'trim', 10))
    b.extend(K.box_buf((2.55, APRON_Y2 - 0.003, 1.05), (2.63, APRON_Y2 - 0.001, 1.09), 'alu', 0.0, 1))
    return b


def doghouse():
    """The engine cover inside the cab between the seats (left half): an open shell over the engine's rear half,
    carpet outside, dark insulation inside, open towards the bay; the cabin-side firewall beside it."""
    b = K.Buf()
    d = DOG
    for lvl, mat, sg in ((0.0, 'fabric', 1.0), (0.012, 'trim', -1.0)):
        b.extend(_cover_shell(d['x0'], d['x1'] - 0.004, d['hw'], d['top'], lvl, mat, sg, 0.06))
    # cabin face of the firewall outboard of the doghouse, from the floor up to the dash
    b.extend(quad_sheet((FIREWALL_X - 0.006, d['hw'], FLOOR_Z), (0, CAB_TUB_Y - d['hw'], 0), (0, 0, 1.06 - FLOOR_Z), 2, 2, (-1, 0, 0), 'trim'))
    zt = D['hub_z'] + 0.47 + 0.012
    b.extend(quad_sheet((FIREWALL_X - 0.006, CAB_TUB_Y, zt), (0, 0.93 - CAB_TUB_Y, 0), (0, 0, 1.06 - zt), 1, 1, (-1, 0, 0), 'trim'))
    # the front wheel tub inside the cab (carpeted hump outboard of the driver's feet) and its inner wall
    b.extend(tub(D['ax_f'], D['hub_z'], 0.47, CAB_TUB_Y, 0.93, FW_DEG, 176.0, 'fabric', True))
    a1 = 180.0 - math.degrees(math.asin((FLOOR_Z - D['hub_z']) / 0.47))
    ths = np.radians(np.linspace(FW_DEG, a1, 10))
    ring = np.array([(D['ax_f'] + 0.47 * math.cos(t), CAB_TUB_Y, D['hub_z'] + 0.47 * math.sin(t)) for t in ths])
    ring = np.vstack([ring, [(FIREWALL_X - 0.004, CAB_TUB_Y, FLOOR_Z)]])
    b.extend(K.fill_loop(ring, (0, -1, 0), 'fabric'))
    return b


def _cover_shell(x0, x_end, hw, top, lvl, mat, sg, r):
    """One skin of a cover over the drivetrain (left half; open at the front and at the floor): the flat top,
    then the rounded rim and the wall swept along the core outline in plan (the rear edge, a corner fan, the
    side). Used for the doghouse and the transmission tunnel. lvl insets the skin (the insulation inside);
    sg = +1 outward normals, -1 inward."""
    rr = r - lvl
    cx, cy = x0 + r, hw - r
    zc = top - r
    path = [((cx, 0.0), (-1.0, 0.0))]
    for a in np.linspace(math.pi, math.pi / 2, 7):
        path.append(((cx, cy), (math.cos(a), math.sin(a))))
    path.append(((x_end, cy), (0.0, 1.0)))
    sec = [(rr * math.cos(t), zc + rr * math.sin(t), math.cos(t), math.sin(t)) for t in np.linspace(math.pi / 2, 0.0, 6)]
    sec.append((rr, FLOOR_Z - 0.005, 1.0, 0.0))
    V = np.array([(c[0] + n[0] * a, c[1] + n[1] * a, z) for (c, n) in path for (a, z, na, nz) in sec])
    N = np.array([(n[0] * na, n[1] * na, nz) for (c, n) in path for (a, z, na, nz) in sec]) * sg
    b = K.Buf().add(V, N, K.grid_tris(len(path), len(sec)), mat)
    lid = np.array([(cx, 0.0, zc + rr), (x_end, 0.0, zc + rr), (x_end, cy, zc + rr), (cx, cy, zc + rr)])
    b.extend(K.fill_loop(lid, (0, 0, sg), mat))
    return b


# ============================================================================================ cab interior
def steering_mount():
    """(hub position, column direction forward-down): a flatter column, van style."""
    ang = math.radians(35.0)
    d = np.array([math.cos(ang), 0.0, -math.sin(ang)])
    return np.array([1.42, DRIVER_Y, 1.24]), d


def dashboard():
    """Van dash: a deep padded top, a hooded binnacle with two big and two small dials in front of the driver, a
    centre panel with the radio, heater levers and vents, a glovebox on the passenger side."""
    b = K.Buf()
    fx = DASH_FACE_X

    def pad_sec(y):
        ay = abs(y - DRIVER_Y)
        hood = 0.05 * float(K.sstep(0.34, 0.21, ay)) if y > 0 else 0.0
        pts = np.array([(1.90, 1.395), (1.80, 1.425), (fx + 0.05, 1.432 + hood * 0.6), (fx - 0.006 - hood, 1.425 + hood * 0.6),
                        (fx - 0.026 - hood, 1.398 + hood * 0.4), (fx - 0.018 - hood, 1.37), (fx + 0.01, 1.355), (1.90, 1.35)])
        return K.round_profile(pts, [0, 0.04, 0.025, 0.014, 0.012, 0.01, 0.012, 0], 1)
    ys = np.concatenate([np.linspace(-0.92, 0.12, 3), np.linspace(0.165, 0.345, 5), np.linspace(0.42, 0.66, 3),
                         np.linspace(0.735, 0.885, 4), [0.92]])
    b.extend(extrude_y(None, ys, 'plastic_int', inside=(1.75, 0.0, 1.39), sec_fn=pad_sec))
    fas = K.round_profile(np.array([(fx, 1.355), (fx, 1.08), (fx + 0.05, 1.05), (1.90, 1.05), (1.90, 1.355)]), [0, 0.03, 0.02, 0, 0], 2)
    hw = DOG['hw']
    for (y0, y1) in ((-0.92, -hw), (hw, 0.92)):
        b.extend(extrude_y(fas, np.linspace(y0, y1, 3), 'paint', inside=(1.80, 0.5 * (y0 + y1), 1.20)))
    cen = K.round_profile(np.array([(fx, 1.355), (fx, DOG['top'] + 0.004), (1.90, DOG['top'] + 0.004), (1.90, 1.355)]), [0, 0.02, 0, 0], 2)
    b.extend(extrude_y(cen, np.linspace(-hw, hw, 3), 'paint', inside=(1.80, 0.0, 1.32)))
    # glovebox, vents, radio slot, heater levers
    b.extend(K.box_buf((fx - 0.006, -0.86, 1.13), (fx + 0.004, -0.58, 1.29), 'plastic_int', 0.012, 2))
    b.extend(K.box_buf((fx - 0.012, -0.74, 1.255), (fx - 0.004, -0.70, 1.272), 'chrome', 0.003, 1))
    for vy in (0.86, -0.86, 0.215, -0.215):
        c = np.array([fx - 0.002, vy, 1.31])
        b.extend(K.box_buf(c + (-0.006, -0.06, -0.025), c + (0.004, 0.06, 0.025), 'trim', 0.006, 1))
        for k in range(-1, 2):
            b.extend(K.box_buf(c + (-0.010, -0.055, 0.013 * k - 0.002), c + (-0.004, 0.055, 0.013 * k + 0.002), 'plastic_int', 0.0, 1))
    b.extend(K.box_buf((fx - 0.004, -0.10, 1.250), (fx + 0.002, 0.10, 1.306), 'chrome', 0.003, 2))
    b.extend(K.box_buf((fx - 0.006, -0.093, 1.255), (fx + 0.06, 0.093, 1.301), 'trim', 0.002, 1))
    b.extend(K.box_buf((fx - 0.006, -0.545, 1.15), (fx + 0.002, -0.405, 1.19), 'trim', 0.004, 1))
    for k in range(3):
        yy = -0.515 + 0.04 * k
        b.extend(K.box_buf((fx - 0.02, yy - 0.006, 1.158), (fx - 0.008, yy + 0.006, 1.172), 'plastic_int', 0.003, 1))
    # binnacle and the dials
    eye = np.array(EYE)
    pc = np.array([fx - 0.012, DRIVER_Y, 1.30])
    dn = K.unit(eye - pc)
    dn = K.unit(np.array([dn[0], 0.0, dn[2]]))
    R = K.frame_from((0, 1, 0), dn)
    b.extend(K.box_buf((-0.25, -0.08, -0.035), (0.25, 0.085, 0.0), 'trim', 0.014, 2, xf=K.mat4_trs(pc, R)))
    gauges = []
    for (gy, gz, r, name, big) in ((0.090, 0.004, 0.066, 'N_speed', True), (-0.090, 0.004, 0.066, 'N_rpm', True),
                                   (0.203, -0.010, 0.030, 'N_fuel', False), (-0.203, -0.010, 0.030, 'N_temp', False)):
        c = pc + R[:, 0] * gy + R[:, 1] * gz
        db, g = dial(c, dn, r, big, 'chrome')
        b.extend(db)
        g['name'] = name
        gauges.append(g)
    for k, zz in enumerate((0.034, -0.012, -0.056)):
        cc = pc + R[:, 1] * zz + dn * 0.0005
        V, N, T = K.lathe(np.array([(0.0, 0.0), (0.005, 0.0)]), cc, dn, 10, prof_n=np.array([[0, 1.0], [0, 1.0]]))
        b.add(V, N, T, 'lens_amber' if k == 1 else 'emit')
    return b, gauges


# the cab's headliner: Nomad Drive's class C has a closed cab under a flat fabric headliner over the windscreen and
# the seats. Here the bunk's floor over the cab was the cab's ceiling, a board in a frame of black rail trims, and it
# ended in front of the driver's head (straight up from her eye the room's roof, 1.36 m over it). The headliner runs
# under the bunk's floor from the windscreen's header back over the seats to the room's floor one stands on behind
# them (it ends at 0.85), between the box front's cheeks, rolled down at the sides onto the door frames' tops; as low
# as the cab's glass lets it (the windscreen's top and the doors' are 0.39-0.41 m over her eye, Nomad Drive's 0.1).
# All of it ahead of the stretch's cut behind the seats (frames/_stretch.py, 0.82), so it is not moved.
HL_Z = 2.138             # its underside
HL_X0 = 0.86             # its back edge, over the seats' backs
HL_XF = 1.475            # its front edge, on the windscreen header's trim (that slopes from the glass up to 2.151)
HL_Y = 0.884             # behind the cab, the box front's cheeks either side of the cab's opening


def cab_headliner():
    b = K.Buf()
    xb = D['bx_f']
    ys, yr, zr = 0.80, 0.838, 2.068
    # the field over the cab, and over the seats' backs behind it
    b.extend(quad_sheet((xb, 0.0, HL_Z), (HL_XF - xb, 0, 0), (0, ys, 0), 6, 4, (0, 0, -1), 'fabric'))
    b.extend(K.box_buf((HL_X0, 0.0, HL_Z), (xb, HL_Y, HL_Z + 0.008), 'fabric', 0.002, 1))
    # the rolls down onto the door frames' tops (the rail's trim stood 10 cm tall between the doors and the bunk)
    th = np.linspace(0.0, 0.5 * PI, 7)
    sec = np.stack([ys + (yr - ys) * np.sin(th), zr + (HL_Z - zr) * np.cos(th)], 1)
    xs = np.linspace(xb, HL_XF, 7)
    V = np.array([(x, y, z) for x in xs for (y, z) in sec])
    roll = recompute_normals(K.Buf().add(V, np.zeros_like(V), K.grid_tris(len(xs), len(sec)), 'fabric'))
    Vr, Nr, Tr, _ = roll.arrays()
    s = np.where((-Vr[:, 1] * Nr[:, 1] + (1.7 - Vr[:, 2]) * Nr[:, 2]) < 0, -1.0, 1.0)[:, None]
    b.add(Vr, Nr * s, Tr, 'fabric')
    # the rolls' back ends closed, out to the cheeks: a header over the B pillars
    end = np.vstack([sec, [(HL_Y, zr), (HL_Y, HL_Z)]])
    b.extend(K.fill_loop(np.stack([np.full(len(end), xb - 0.001), end[:, 0], end[:, 1]], 1), (-1, 0, 0), 'fabric'))
    return b


def b_pillar_trim():
    """The B pillar's inner face (left half): the pillar between the cab door's rear edge and the box stood open on
    its inner side - below the belt all of it, above it the greenhouse's trim began 3 cm ahead of the seal where the
    cab meets the box - so from the driver's seat two black posts showed on her left with the outside between them
    (and from the room a green line down the cab's back corner). A black trim from the sill to the rail, 3.5 cm in
    from the cab's side as the greenhouse's trim is, joins the seal to that trim (above the belt) and to the door's
    rear edge (below it); its back closed out to the box's side (the box front's wall was hollow behind its cheek)."""
    b = K.Buf()
    xr, xb = D['bx_f'] - 0.024, D['belt_z']     # (from the box front's cheek, 1 mm behind its face)
    for z0, z1, x1, side in ((0.70, xb, D['fd_rear'] - 0.003, lambda z: S.side_w(0.97, z)),
                             (xb, D['rail_z'] + 0.01, 0.983, lambda z: S.g_side_w(z))):
        zs = np.linspace(z0, z1, 8)
        w = np.array([float(side(z)) for z in zs]) - 0.0335
        V = np.array([(x, wi, z) for z, wi in zip(zs, w) for x in (xr, x1)])
        b.add(V, np.tile((0.0, -1.0, 0.0), (len(V), 1)), K.grid_tris(len(zs), 2), 'plastic_int')
        V = np.array([(xr, y, z) for z, wi in zip(zs, w) for y in (wi, D['bw'] - 0.004)])
        b.add(V, np.tile((-1.0, 0.0, 0.0), (len(V), 1)), K.grid_tris(len(zs), 2), 'plastic_int')
    # the step at the belt (the greenhouse stands in from the lower body)
    w0, w1 = float(S.g_side_w(xb)) - 0.0335, float(S.side_w(0.97, xb)) - 0.0335
    b.extend(quad_sheet((xr, w0, xb), (0.983 - xr, 0, 0), (0, w1 - w0, 0), 1, 1, (0, 0, 1), 'plastic_int'))
    return b


def interior(ex):
    out = {}
    L = K.Buf()      # mirrored
    C = K.Buf()      # not mirrored
    # cab floor mat (rubber) outboard of the doghouse / tunnel, up to the toe board
    x_tub = D['ax_f'] - 0.47 - 0.01
    for (x0, x1, y0, y1) in ((D['bx_f'], x_tub, TUNNEL['hw'], 0.93), (x_tub, FIREWALL_X - 0.14, DOG['hw'], CAB_TUB_Y)):
        xs = np.linspace(x0, x1, 4)
        sec = np.array([(y0, FLOOR_Z), (y1, FLOOR_Z)])
        V = np.array([(x, y, z) for x in xs for (y, z) in sec])
        T = K.grid_tris(len(xs), 2)
        L.extend(face_up(recompute_normals(K.Buf().add(V, np.zeros_like(V), T, 'rubber'))))
    L.extend(K.box_buf((FIREWALL_X - 0.16, DOG['hw'], FLOOR_Z), (FIREWALL_X - 0.01, CAB_TUB_Y - 0.02, FLOOR_Z + 0.02), 'rubber', 0.006, 2,
                       xf=K.mat4_rot((0, 1, 0), -40, (FIREWALL_X - 0.01, 0, FLOOR_Z))))
    L.extend(doghouse())
    t = TUNNEL
    for lvl, mat, sg in ((0.0, 'fabric', 1.0), (0.010, 'trim', -1.0)):
        L.extend(_cover_shell(t['x0'] - 0.03, t['x1'] + 0.006, t['hw'], t['top'], lvl, mat, sg, 0.035))
    # sill trims and kick panels
    L.extend(K.box_buf((D['bx_f'] + 0.01, 0.88, FLOOR_Z), (D['fd_front'] - 0.40, 0.94, 0.70), 'plastic_int', 0.012, 2))
    L.extend(K.box_buf((1.76, 0.80, D['hub_z'] + 0.49), (FIREWALL_X - 0.01, 0.93, 1.05), 'plastic_int', 0.02, 2))
    L.extend(b_pillar_trim())
    # bunk floor over the cab and the mattress on top; under it the cab's headliner, over the seats too
    L.extend(K.box_buf((D['bx_f'] - 0.02, 0.0, 2.145), (1.77, 1.075, 2.20), 'fabric', 0.01, 2))
    L.extend(K.box_buf((D['bx_f'] + 0.04, 0.0, 2.20), (1.93, 1.03, 2.32), 'fabric', 0.04, 2))
    L.extend(cab_headliner())
    # its dome light, over the seats' backs between them
    C.extend(K.box_buf((HL_X0 + 0.03, -0.085, HL_Z - 0.014), (HL_X0 + 0.15, 0.085, HL_Z + 0.002), 'plastic_int', 0.006, 2))
    C.extend(K.box_buf((HL_X0 + 0.04, -0.072, HL_Z - 0.018), (HL_X0 + 0.14, 0.072, HL_Z - 0.008), 'emit', 0.005, 2))
    dash, gauges = dashboard()
    C.extend(dash)
    # pedals (automatic: brake and throttle), steering column, gear selector, mirror, visors
    for (py, w_, name) in ((DRIVER_Y + 0.02, 0.06, 'brake'), (DRIVER_Y - 0.09, 0.035, 'throttle')):
        base = np.array([FIREWALL_X - 0.20, py, 1.06])
        pad = np.array([FIREWALL_X - 0.27, py, 0.84 if name == 'brake' else 0.80])
        C.extend(K.tube_buf(np.array([base, (base + pad) / 2 + (0.02, 0, 0), pad + (0, 0, 0.04)]), 0.009, 'steel', 6))
        C.extend(K.box_buf(pad + (-0.012, -w_, -0.045 if name == 'brake' else -0.07), pad + (0.012, w_, 0.04), 'rubber', 0.006, 2,
                           xf=K.mat4_rot((0, 1, 0), -24, pad)))
    st = steering_mount()
    C.extend(K.cyl_buf(st[0] + st[1] * 0.06, st[0] + st[1] * 0.36, 0.048, 'plastic_int', 18, r1=0.04))
    V, N, T = K.lathe(np.array([(0.068, 0.0), (0.055, 0.004), (0.03, 0.012), (0.0, 0.012)]), (GEAR_X, 0.0, TUNNEL['top'] + 0.002), (0, 0, 1), 20)
    C.add(V, N, T, 'rubber')
    # the handbrake's slot on the tunnel (the lever is the handbrake part)
    hz = TUNNEL['top']
    C.extend(K.box_buf((HB_X - 0.13, HB_Y - 0.03, hz - 0.004), (HB_X + 0.15, HB_Y + 0.03, hz + 0.008), 'plastic_int', 0.006, 2))
    C.extend(K.box_buf((HB_X - 0.10, HB_Y - 0.012, hz + 0.004), (HB_X + 0.12, HB_Y + 0.012, hz + 0.0095), 'trim', 0.002, 1))
    for (sx, sy) in ((SEAT_X, DRIVER_Y), (SEAT_X, -DRIVER_Y)):
        for dy in (-0.17, 0.17):
            C.extend(K.box_buf((sx - 0.24, sy + dy - 0.015, FLOOR_Z), (sx + 0.22, sy + dy + 0.015, FLOOR_Z + 0.03), 'steel', 0.004, 2))
    mp = np.array([float(S.ws_x(0, 2.06)) - 0.03, 0.0, 2.05])
    C.extend(K.box_buf(mp + (-0.01, -0.012, 0.02), mp + (0.012, 0.012, 0.09), 'plastic_int', 0.004, 2))
    C.extend(K.box_buf(mp + (-0.025, -0.13, -0.035), mp + (0.0, 0.13, 0.025), 'plastic_int', 0.012, 3))
    C.extend(K.box_buf(mp + (-0.0262, -0.12, -0.027), mp + (-0.0255, 0.12, 0.017), 'glass_dark', 0.0, 1))
    for sy in (1, -1):
        vp = np.array([float(S.ws_x(0.45, 2.10)) - 0.10, sy * 0.47, 2.125])
        C.extend(K.box_buf(vp + (-0.20, -0.21, -0.012), vp + (0.0, 0.21, 0.008), 'fabric', 0.01, 3, xf=K.mat4_rot((0, 1, 0), 8, vp)))
    # ---------------------------------------------------------------- living module
    # (the floor's right half without the side door's stairwell: _rv_build.entry_well)
    from frames import _rv_ext as EX
    C.extend(box_floor())
    C.extend(box_floor(hole=(EX.WELL_X[0], EX.WELL_X[1], D['bw'] - len(EX.WELL['tops']) * EX.WELL['depth'], 1.2)).mirrored())
    # (nothing built in: the room is an empty shell, as Nomad Drive's class C's is - its floor, walls and ceiling, the
    # bunk over the cab its one bed; what one lives with is what the player puts in, docs/V3/plan/finish.md section 19
    # step 7. The shelves, the galley, the dinette's table and the bed across the back are gone)
    C.extend(box_lamps())
    C.extend(tail_lamp_covers(ex))
    C.extend(fuel_duct(ex))
    out['L'] = L
    out['C'] = C
    out['gauges'] = gauges
    return out


def box_floor(hole=None):
    """Floor slab of the living module (left half): flat from wall to wall, over the rear wheels too (docs/V3/plan/
    finish.md section 11.1 - the tubs that stood 16 cm out of it over the wells are gone: a cupboard stands anywhere
    along the walls; the wheels' own liners are under it, UNDER). `hole`: (x0, x1, y0, y1) left out of it - the side
    door's stairwell, on the right half."""
    b = K.Buf()
    xr, xf = D['bx_r'] + 0.045, D['bx_f'] - 0.005
    if hole is None:
        b.extend(K.box_buf((xr, 0.0, BOX_FLOOR - 0.06), (xf, FLOOR_Y, BOX_FLOOR - 0.006), 'trim', 0.003, 1))
        b.extend(K.box_buf((xr, 0.0, BOX_FLOOR - 0.006), (xf, FLOOR_Y, BOX_FLOOR), 'wood', 0.002, 1))
        return b
    b.extend(STP.floor_round(xr, xf, 0.0, FLOOR_Y, BOX_FLOOR - 0.06, BOX_FLOOR - 0.006, 'trim', hole, 0.003))
    b.extend(STP.floor_round(xr, xf, 0.0, FLOOR_Y, BOX_FLOOR - 0.006, BOX_FLOOR, 'wood', hole))
    return b


def box_lamps():
    """The lamps in the living module's ceiling (the room's own light: all that is fitted to it)."""
    b = K.Buf()
    for x in (-3.2, -1.7, -0.2):
        b.extend(K.box_buf((x - 0.12, -0.10, 2.985), (x + 0.12, 0.10, 3.005), 'emit', 0.008, 2))
    return b


def tail_lamp_covers(ex):
    """A cover over each tail lamp's recess inside the back wall (the recess, 4.5 cm deep, reaches 2 cm through the
    lining, its back facing out: from the room it showed as a slot to the lamp and the road; the bed across the back
    hid it), 2 cm round the recess, standing 7 mm proud of its back."""
    from frames import _rv_ext as EX
    b = K.Buf()
    tp, _ = ex.tail_mount
    y0, y1, z0, z1, _r = EX.TAIL
    xb = float(tp[0]) + 0.045
    for side in (1, -1):
        ya, yb = sorted((side * (y0 - 0.02), side * (y1 + 0.02)))
        b.extend(K.box_buf((xb - 0.025, ya, z0 - 0.02), (xb + 0.007, yb, z1 + 0.02), 'lining', 0.005, 2))
    return b


# ============================================================================================ underbody
# the rear axle's beam starts this far out from the centre: 2 cm inside the differential part's tube ends
AXLE_IN = 0.29
# the front of the differential part's pinion (its companion flange and nut), ahead of the axle centre, and the
# pinion's height below it
DIFF_FLANGE = (0.2645, -0.024)
# the rear axle beam's wheel end (its flange housing) reaches out to this far in from the rear hub mount
AXLE_END_IN = 0.13


def knuckle(hx, hy, hz, front=True):
    """A hub's carrier (left side: outer face +Y), an object of its own (KNUCKLE_<hub>) the game hangs on the
    wheel's pivot. Front: the hub flange (the rim's disc sits 16 mm outboard of the wheel centre) with eight
    studs, the spindle and the knuckle just inboard of the brake, on the twin I-beam's end. Rear (dual wheels):
    the flange 24 mm inboard of the pair's centre with its studs and the big centre cap, the spindle back into
    the axle beam's end."""
    if front:
        return K.knuckle_buf(hx, hy, hz, hy + 0.010, 0.088, 8, 0.0725, 22.5, stud_r=0.007, stud_len=0.005,
                             carrier=(0.06, 0.06, 0.15, 0.15), segs=18)
    return K.knuckle_buf(hx, hy, hz, hy - 0.024, 0.088, 8, 0.0725, 22.5, stud_r=0.007, stud_len=0.005, cap_r=0.045,
                         cap_out=0.004, back=hy - AXLE_END_IN - 0.004, segs=18)


def wheelhouse(xa, y0, y1, r, z_cut=None, th=(None, None)):
    """Half cylinder liner over a wheel from y0 to y1 (facing the wheel), down to z_cut each side; th limits the
    angle range (degrees, 0 = front, 180 = rear)."""
    za = D['hub_z']
    z_cut = za if z_cut is None else z_cut
    a0 = math.asin(max(-1.0, min(1.0, (z_cut - za) / r)))
    lo = a0 if th[0] is None else math.radians(th[0])
    hi = PI - a0 if th[1] is None else math.radians(th[1])
    ths = np.linspace(lo, hi, 18)
    V = np.array([(xa + r * math.cos(t), y, za + r * math.sin(t)) for t in ths for y in (y0, y1)])
    N = np.array([(-math.cos(t), 0.0, -math.sin(t)) for t in ths for y in (y0, y1)])
    b = K.Buf().add(V, N, K.grid_tris(len(ths), 2), 'trim')
    ring = np.array([(xa + r * math.cos(t), y0, za + r * math.sin(t)) for t in ths])
    b.extend(K.fill_loop(ring, (0, 1, 0), 'trim'))
    return b


def underbody(right=False):
    """UNDER (left half + centre parts with y >= 0 halves; `right`: the half mirrored onto the right, which has the side
    door's stairwell between the axles - no outrigger and no water tank where it is, the propane bottle's behind it)."""
    b = K.Buf()
    xs = np.concatenate([np.linspace(2.74, -1.20, 6), np.linspace(-1.30, -1.55, 5), np.linspace(-2.30, -2.55, 5), np.linspace(-2.65, -3.86, 3)])[::-1]
    path = np.stack([xs, np.full(len(xs), FRAME_Y), [frame_zc(x) for x in xs]], 1)
    prof = np.array([(0.035, -0.10), (-0.035, -0.10), (-0.035, 0.10), (0.035, 0.10), (0.035, 0.092), (-0.027, 0.092), (-0.027, -0.092), (0.035, -0.092)])
    V, N, T = K.sweep(path, (0, 0, 1), prof, closed=False, closed_prof=True, smooth_prof=False)
    b.add(V, N, T, 'steel')
    for x in (2.70, 1.20, 0.30, -0.80, -2.75, -3.30, -3.84):
        zc = frame_zc(x)
        b.extend(K.box_buf((x - 0.04, 0.0, zc - 0.07), (x + 0.04, FRAME_Y - 0.03, zc + 0.07), 'steel', 0.005, 1))
    # front axle crossmember dropped under the engine's sump
    b.extend(K.box_buf((D['ax_f'] - 0.07, 0.0, 0.20), (D['ax_f'] + 0.07, 0.38, 0.29), 'steel', 0.008, 2))
    b.extend(K.box_buf((D['ax_f'] - 0.07, 0.36, 0.24), (D['ax_f'] + 0.07, FRAME_Y - 0.03, frame_zc(D['ax_f']) - 0.05), 'steel', 0.008, 2))
    # outriggers carrying the living module's floor out to the skirts
    for x in (0.70, -0.20, -0.95, -2.90, -3.60) if not right else (0.70, -0.95, -2.90, -3.60):
        b.extend(K.box_buf((x - 0.03, FRAME_Y + 0.035, BOX_FLOOR - 0.13), (x + 0.03, 1.08, BOX_FLOOR - 0.06), 'steel', 0.004, 1))
    # cab floor pan underside
    x_tub = D['ax_f'] - 0.47 - 0.01
    b.extend(K.box_buf((D['bx_f'], TUNNEL['hw'] - 0.02, PAN_Z - 0.006), (DOG['x0'] + 0.02, 0.93, PAN_Z), 'trim', 0.003, 1))
    b.extend(K.box_buf((DOG['x0'] + 0.02, DOG['hw'] - 0.02, PAN_Z - 0.006), (x_tub, 0.93, PAN_Z), 'trim', 0.003, 1))
    b.extend(K.box_buf((x_tub, DOG['hw'] - 0.02, PAN_Z - 0.006), (FIREWALL_X, CAB_TUB_Y, PAN_Z), 'trim', 0.003, 1))
    # wheelhouse liners: front (in the cab's fenders) and rear (in the skirt, over the duals)
    b.extend(wheelhouse(D['ax_f'], APRON_Y, 0.95, 0.475, z_cut=0.40, th=(None, FW_DEG)))
    b.extend(wheelhouse(D['ax_f'], CAB_TUB_Y + 0.01, 0.95, 0.475, z_cut=0.40, th=(FW_DEG, None)))
    b.extend(wheelhouse(D['ax_r'], 0.575, 1.10, 0.475, z_cut=0.52))
    # front suspension: twin I-beam (left beam pivots on the right of the frame), radius arm, tie rod (the coil
    # spring and the damper are the suspension part's, the knuckle with its hub is an object of its own)
    hx, hy, hz = D['ax_f'], D['track_f'] / 2, D['hub_z']
    b.extend(K.tube_buf(np.array([(hx - 0.02, -0.30, 0.26), (hx, 0.20, 0.25), (hx, hy - 0.16, 0.30)]), 0.03, 'steel', 8))
    b.extend(K.tube_buf(np.array([(hx, hy - 0.16, 0.30), (hx - 0.55, FRAME_Y + 0.03, 0.40)]), 0.022, 'steel', 8))
    b.extend(K.tube_buf(np.array([(hx + 0.12, 0.30, 0.34), (hx + 0.12, hy - 0.14, 0.36)]), 0.012, 'steel', 8))
    # rear axle: its beam from the differential part's tube end out to the wheel end's flange housing (the hub
    # on it is an object of its own; the leaf springs, their hangers, the dampers and the differential are the
    # axle's parts)
    rx, ry = D['ax_r'], D['track_r'] / 2
    b.extend(K.cyl_buf((rx, AXLE_IN, hz), (rx, ry - AXLE_END_IN, hz), 0.06, 'steel', 16))
    b.extend(K.cyl_buf((rx, ry - 0.20, hz), (rx, ry - AXLE_END_IN, hz), 0.085, 'steel', 16))
    # fresh water tank between the left rail and the skirt
    if not right:
        b.extend(K.box_buf((-1.25, FRAME_Y + 0.07, 0.50), (-0.25, 1.02, BOX_FLOOR - 0.14), 'trim', 0.03, 2))
    return b


def centre_under():
    """Centre and right-hand parts: propshaft (back to the differential part's companion flange), propane bottle
    in its cradle (right), grey water tank, fuel tank cradle straps behind the rear axle, the cab's rear sill end
    caps."""
    b = K.Buf()
    hz = D['hub_z']
    rx = D['ax_r']
    xe, ze = rx + DIFF_FLANGE[0] + 0.0275, hz + DIFF_FLANGE[1]
    b.extend(K.cyl_buf((0.74, 0.0, 0.50), (xe, 0.0, ze), 0.045, 'steel', 16))
    for x, z in ((0.74, 0.50), (xe, ze)):
        b.extend(K.cyl_buf((x - 0.025, 0.0, z), (x + 0.025, 0.0, z), 0.06, 'steel', 16))
    # propane bottle on the right between the axles
    b.extend(K.cyl_buf((-1.38, -0.80, 0.56), (-0.73, -0.80, 0.56), 0.16, 'ceramic', 20))
    for x in (-1.23, -0.88):
        b.extend(K.box_buf((x - 0.02, -0.98, 0.38), (x + 0.02, -0.62, 0.42), 'steel', 0.004, 1))
    # grey water tank on the right behind the rear axle
    b.extend(K.box_buf((-3.55, -1.00, 0.50), (-2.75, -0.53, BOX_FLOOR - 0.14), 'trim', 0.03, 2))
    # fuel tank cradle straps (the tank part sits between the rails behind the rear axle)
    for x in (-3.25, -2.65):
        b.extend(K.box_buf((x - 0.025, -0.42, 0.255), (x + 0.025, 0.42, 0.27), 'steel', 0.003, 1))
        for sy in (1, -1):
            b.extend(K.box_buf((x - 0.025, sy * 0.415 - 0.006, 0.255), (x + 0.025, sy * 0.415 + 0.006, frame_zc(x) - 0.08), 'steel', 0.002, 1))
    return b


# ============================================================================================ fuel filler
def fuel_pocket_back(ex):
    """The back of the pocket behind the fuel flap (its rolled edge 4 cm in from the skin): its middle."""
    so = ex.cut['fuel'].side('out')
    V, _, _ = K.roll_edge(so['P'], so['N'], so['E'], 0.002, 0.04, 0.0, 2, closed=True)
    return V.reshape(-1, len(so['P']), 3)[-1].mean(0)


def fuel_details(ex):
    """Pocket behind the flap with the cap; filler neck down to the tank (left side): straight down the wall from the
    pocket's back into the floor (the box over it in the room: fuel_duct), then under the floor in to the tank."""
    b = K.Buf()
    so = ex.cut['fuel'].side('out')
    V, N, T = K.roll_edge(so['P'], so['N'], so['E'], 0.002, 0.04, 0.0, 2, closed=True)
    b.add(V, N, T, 'paint')
    ring = V.reshape(-1, len(so['P']), 3)[-1]
    c = ring.mean(0)
    hole = K.circle_loop(0, 0, 0.022, 0.005)
    h3 = np.stack([c[0] + hole[:, 0], np.full(len(hole), c[1]), c[2] + hole[:, 1]], 1)
    b.extend(K.fill_loop(ring, (0, 1, 0), 'paint', holes=[h3]))
    cap = np.array([[0.0, 0.0], [0.030, 0.0], [0.031, 0.004], [0.031, 0.014], [0.028, 0.018], [0.0, 0.018]])
    V, N, T = K.lathe(cap, c, (0, 1, 0), 20)
    b.add(V, N, T, 'trim')
    yh = c[1] - 0.03
    path = np.array([c - (0, 0.01, 0), (c[0], yh, c[2] - 0.05), (c[0], yh, BOX_FLOOR - 0.08), (-2.85, 0.42, 0.72), (-2.95, 0.35, 0.69)])
    b.extend(K.tube_buf(smooth_path(path, 1), 0.022, 'rubber', 10))
    return b


def fuel_duct(ex):
    """The box over the filler neck in the room (left wall, at the floor): from the floor up over the pocket behind the
    fuel flap, 8 cm out from the wall. The pocket's back and the neck stood out of the wall there, in the room's corner
    beside the bed across the back, and in the open since it was emptied (docs/V3/plan/finish.md section 19 step 7)."""
    c = fuel_pocket_back(ex)
    y_in = float(c[1]) - 0.06
    return K.box_buf((c[0] - 0.075, y_in, BOX_FLOOR - 0.005), (c[0] + 0.075, D['bw'] + WALL + 0.005, c[2] + 0.085), 'lining', 0.006, 2)


def fuel_flap(ex):
    b = ex.fuel_flap()
    s = ex.cut['fuel'].side('in')
    V, N, T = K.roll_edge(s['P'], s['N'], s['E'], 0.0022, 0.008, 0.004, 2, closed=True, hem_segs=0)
    b.add(V, N, T, 'paint')
    b.extend(K.panel_back(s['P'], s['N'], s['E'], depth=0.0078, inset=0.0018))
    return b
