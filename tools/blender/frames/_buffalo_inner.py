"""Buffalo: everything behind the outer skin. The engine bay (a tall bay over the live front axle, the battery on
the left ledge), the four doors' insides, the bonnet's inner frame, the ladder frame with its kick-ups over both
live axles, the axles' tubes, the transfer case and the two propshafts, the steering (UNDER), the crew cab with
two buckets in front and a bench behind (INTERIOR), the fuel filler on the right bed side."""
import math
import sys

sys.dont_write_bytecode = True

import numpy as np  # noqa: E402

from frames import _kit as K  # noqa: E402
from frames import buffalo as S  # noqa: E402
from frames._sedan_inner import (dial, extrude_y, face_up, harness, heat_shield, lid_back, quad_sheet,  # noqa: E402
                                 recompute_normals, ring_inner, side_out, smooth_path, tub)

D = S.D
PI = math.pi
FLOOR_Z = 0.60           # cab floor (rubber mat top)
PAN_Z = 0.565            # underside of the cab floor (on the rails)
FIREWALL_X = 1.11
RAD_X = 2.315            # the radiator support's bars from here forward (behind the lamps' recesses)
APRON_Y = 0.425          # the bay's side walls on the rails (inboard of the room the front axle's struts stand in)
LEDGE_Z = 0.90           # the inner fender's top (the battery stands on it)
BAY_Y = 0.84             # the inner face of the wings above the ledge
SEAT_X = 0.43            # seat floor attachment x: the stock bucket's eye at (0.27, 1.53)
DRIVER_Y = 0.40
EYE = (SEAT_X - 0.16, DRIVER_Y, FLOOR_Z + 0.03 + 0.90)
REAR_SEAT_X = -0.46      # the bench's back clears the cab's back wall
GEAR_X = 0.74
HB_X = 0.29
DASH_FACE_X = 0.84
FRAME_Y = 0.40           # ladder frame rails (centre)
# the engine room stands over the front axle: the mount high enough that every engine the room takes clears the
# axle's tubes and the offset differential under it (the diff part's own right tube flange under the sump binds:
# 0.402 for 1 cm), the room's top under the bonnet's inner frame; from the firewall forward to the radiator
ENGINE = (1.64, 0.0, 0.405)
ENGINE_ROOM = ((-0.52, -0.34, 0.0), (0.51, 0.34, 0.875))
GEARBOX = (0.935, 0.0, 0.517)
GEARBOX_ROOM = ((-0.31, -0.13, 0.0), (0.205, 0.13, 0.235))
# the radiator (room for the big one: rad_big and rad_std both fit), the battery (room for the truck battery)
RADIATOR = (2.31, 0.0, 0.72)
RAD_ROOM = ((-0.16, -0.43, 0.0), (0.045, 0.43, 0.51))
BATTERY = (1.95, 0.60, LEDGE_Z)
BAT_ROOM = ((-0.15, -0.10, 0.0), (0.15, 0.10, 0.25))
FUEL_TANK = (-2.03, 0.0, 0.36)
TANK_ROOM = ((-0.25, -0.40, 0.0), (0.25, 0.40, 0.17))
# the tunnel: low and narrow over the transfer case (behind xs), high and wide over the gearbox
TUNNEL = dict(x0=0.12, xs=0.63, x1=FIREWALL_X, hw_r=0.11, top_r=0.70, hw_f=0.155, top_f=0.765)
# the front differential stands off the centre line on the left, where the front propshaft runs, turned with its
# pinion back towards the transfer case (axles.front.diff_z = -FRONT_DIFF_Y); its tube stubs end in bolted flanges
# DIFF_STUB out from its centre (tools/blender/parts/chassis.py, Differentials), the frame's tubes go on from them
FRONT_DIFF_Y = 0.30
DIFF_STUB = 0.294
PINION_BOLTS = 0.251
# the rear axle's tubes start this far out from the centre: 2 cm inside the differential part's tube ends
AXLE_IN = 0.29
# the front of the differential part's pinion (its companion flange) ahead of the axle centre, and its height
DIFF_FLANGE = (0.2645, -0.024)
# the transfer case's outputs: the rear one on the centre line, the front one on the left (the front diff's side)
TC_REAR = (0.40, 0.0, 0.40)
TC_FRONT = (0.60, FRONT_DIFF_Y, 0.375)
# the wheelhouse liners (front in the bay's wings, rear under the bed's tubs)
WELL_R = D['arch_f'] + 0.012


def frame_zc(x):
    """Rail centre height: low under the cab, kicked up over both live axles (their tubes and travel under it)."""
    x = np.asarray(x, float)
    return (0.50 + 0.16 * K.sstep(0.95, 1.22, x) - 0.03 * K.sstep(1.95, 2.20, x) + 0.16 * K.sstep(-0.85, -1.10, x)
            - 0.04 * K.sstep(-1.90, -2.10, x))


def side_pt(x, z, level=0.0):
    P, N = S.SIDE_L.to3d(np.array([[x, z]]))
    return P[0] + N[0] * level, N[0]


def _tunnel_f(x):
    return K.sstep(TUNNEL['xs'] - 0.03, TUNNEL['xs'] + 0.03, np.asarray(x, float))


def tunnel_h(x):
    """The tunnel's top at x."""
    v = TUNNEL['top_r'] + (TUNNEL['top_f'] - TUNNEL['top_r']) * _tunnel_f(x)
    return float(v) if np.ndim(v) == 0 else v


def tunnel_hw(x):
    v = TUNNEL['hw_r'] + (TUNNEL['hw_f'] - TUNNEL['hw_r']) * _tunnel_f(x)
    return float(v) if np.ndim(v) == 0 else v


# ============================================================================================ doors
DOORS = {'F': (D['fd_rear'], D['fd_front']), 'R': (D['rd_rear'], D['rd_front'])}
CARD_Z1 = 1.20
HINGE_Z = (0.80, 1.12)


def door_card(ex, w):
    b = K.Buf()
    xa, xb = DOORS[w]
    x0, x1 = xa + 0.03, xb - 0.03
    z0, z1 = D['door_bot'] + 0.03, CARD_Z1
    loop = K.ccw(K.rounded_poly(np.array([(x0, z0), (x1, z0), (x1, z1), (x0, z1)]), [0.03, 0.03, 0.02, 0.02], 0.06, arc_step=0.014))
    g = K.grid_points(x0, x1, z0, z1, 0.10, dt=0.10)
    card = K.OffsetChart(S.SIDE_L, -0.104)
    V, N, T = K.mesh_region(card, [K.Loop(K.resample_keep(loop, 0.06))], [], g, spacing=0.10)
    b.add(V, -N, T, 'plastic_int')
    P, Nn = card.to3d(loop)
    V, N, Tr = K.roll_edge(P, -Nn, side_out(P, Nn), 0.004, 0.012, 0.0, 1, closed=True)
    b.add(V, N, Tr, 'plastic_int')
    # ribbed vinyl insert: three horizontal welts; a map pocket low down on the front doors
    for zc in (0.98, 1.04, 1.10):
        xs = np.linspace(x0 + 0.08, x1 - 0.10, 4)
        P, Nn = K.OffsetChart(S.SIDE_L, -0.106).to3d(np.stack([xs, np.full(len(xs), zc)], 1))
        prof = np.array([(0.0, -0.006), (0.004, -0.003), (0.005, 0.0), (0.004, 0.003), (0.0, 0.006)])
        V, N, Tr = K.sweep(P, (0, 0, 1), prof, closed=False)
        b.add(V, N, Tr, 'plastic_int')
    if w == 'F':
        pp, _ = side_pt(0.5 * (x0 + x1) + 0.05, 0.74, -0.104)
        b.extend(K.box_buf(pp + (-0.25, -0.035, -0.07), pp + (0.25, 0.0, 0.05), 'plastic_int', 0.012, 2))
    # armrest / pull, window crank, the opener
    xs = np.linspace(x0 + 0.16, x1 - 0.30 if w == 'F' else x1 - 0.18, 5)
    P, Nn = K.OffsetChart(S.SIDE_L, -0.104).to3d(np.stack([xs, np.full(len(xs), 0.92)], 1))
    prof = K.round_profile(np.array([(0.0, -0.022), (0.05, -0.026), (0.06, 0.0), (0.045, 0.026), (0.0, 0.026)]), 0.01, 2)
    V, N, Tr = K.sweep(P, (0, 0, 1), prof, closed=False)
    b.add(V, N, Tr, 'plastic_int')
    pc, nc = side_pt(x0 + (0.42 if w == 'F' else 0.32), 1.02, -0.104)
    inward = -nc
    b.extend(K.cyl_buf(pc, pc + inward * 0.02, 0.022, 'chrome', 12))
    end = pc + inward * 0.02 + np.array([0.0, 0.0, -0.07])
    b.extend(K.tube_buf(np.array([pc + inward * 0.02, end]), 0.006, 'chrome', 6))
    b.extend(K.cyl_buf(end, end + inward * 0.04, 0.012, 'plastic_int', 10))
    ph, nh = side_pt(x1 - 0.14, 1.12, -0.104)
    b.extend(K.box_buf(ph + (-0.05, -0.012, -0.012), ph + (0.05, 0.0, 0.012), 'chrome', 0.004, 2))
    return b


def door_extras(ex, w):
    """The belt moulding along the waist, the inner window sill, the outside pull handle (and the key on the front
    doors), the hinge leaves on the front edge."""
    b = K.Buf()
    jl = ex.jl
    xa, xb = DOORS[w]
    uv, P, NL, NG, _ = jl.between(float(S.u_of_x(xb - 0.004)), float(S.u_of_x(xa + 0.004)))
    P = K.resample(P, 0.07, closed=False)
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
    xh, zh = xa + 0.16, 1.20
    ph, nh = side_pt(xh, zh)
    b.extend(K.box_buf((-0.07, -0.007, -0.02), (0.07, 0.0015, 0.02), 'trim', 0.004, 2, xf=K.mat4_trs(ph)))
    b.extend(K.box_buf((-0.06, -0.002, -0.009), (0.06, 0.013, 0.009), 'chrome', 0.006, 2, xf=K.mat4_trs(ph)))
    if w == 'F':
        pk, nk = side_pt(xh + 0.115, zh)
        b.extend(K.cyl_buf(pk - nk * 0.002, pk + nk * 0.006, 0.0095, 'chrome', 12))
    for zz in HINGE_Z:
        p0, n0 = side_pt(xb - 0.004, zz, -0.03)
        b.extend(K.box_buf(p0 + (-0.012, -0.03, -0.03), p0 + (0.004, 0.0, 0.03), 'steel', 0.004, 2))
    return b


def door_frame_inner(ex, w):
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
    us = np.linspace(0, S.G_GUIDE.length, 220)
    pts, sp = S.grid_from(us, S.g_t_samples())
    V, N, T = K.mesh_region(S.CG, [K.Loop(loop)], holes, pts, spacing=sp, level=-0.035)
    return K.Buf().add(V, -N, T, 'paint')


def hood_inner(ex):
    """The bonnet's inner frame: a ring 2 cm under the skin round its edge (narrow along the hinge), open over the
    engine (its room's top 1.7 cm under the ring's rolled edge, the diesel six's own top 3 cm under the skin there),
    and the skin's inside."""
    s = ex.cut['hood'].side('in')
    uv = s['uv']
    inner = K.offset_loop2(uv, -0.035, closed=False)
    inner[0, 1] = 0.0
    inner[-1, 1] = 0.0
    return ring_inner(S.CT, uv, inner, -0.10, 0.06, level=-0.020, back=False).extend(lid_back(S.CT, uv))


# ============================================================================================ engine bay
def wheelhouse(xa, y0, y1, r, zc=None, z_cut=None, th=(None, None), n=20):
    """Half cylinder liner over a wheel (axis along y, centre height zc) from y0 to y1, facing the wheel, down to
    z_cut; th limits the angle range (degrees, 0 = front, 180 = rear). Its inner wall closes it at y0."""
    zc = D['arch_z'] if zc is None else zc
    z_cut = 0.50 if z_cut is None else z_cut
    a0 = math.asin(max(-1.0, min(1.0, (z_cut - zc) / r)))
    lo = a0 if th[0] is None else math.radians(th[0])
    hi = PI - a0 if th[1] is None else math.radians(th[1])
    ths = np.linspace(lo, hi, n)
    ys = np.linspace(y0, y1, 3)
    V = np.array([(xa + r * math.cos(t), y, zc + r * math.sin(t)) for t in ths for y in ys])
    N = np.array([(-math.cos(t), 0.0, -math.sin(t)) for t in ths for y in ys])
    b = K.Buf().add(V, N, K.grid_tris(len(ths), len(ys)), 'trim')
    ring = np.array([(xa + r * math.cos(t), y0, zc + r * math.sin(t)) for t in ths])
    b.extend(K.fill_loop(ring, (0, 1, 0), 'trim'))
    return b


def engine_bay():
    """Left half of the bay: the apron on the rail, the inner fender's ledge and its wall up to the bonnet, the
    firewall, the radiator support round the grille, the wiring and the brake lines."""
    b = K.Buf()
    xa = D['ax_f']
    top = 1.300
    za = float(frame_zc(1.5)) + 0.06
    b.extend(quad_sheet((FIREWALL_X, APRON_Y, za), (RAD_X - FIREWALL_X, 0, 0), (0, 0, LEDGE_Z - za), 10, 3, (0, -1, 0), 'paint'))
    b.extend(quad_sheet((FIREWALL_X, APRON_Y, LEDGE_Z), (RAD_X - FIREWALL_X, 0, 0), (0, BAY_Y - APRON_Y, 0), 10, 3, (0, 0, 1), 'paint'))
    b.extend(quad_sheet((FIREWALL_X, BAY_Y, LEDGE_Z), (RAD_X - FIREWALL_X, 0, 0), (0, 0, top - LEDGE_Z), 10, 2, (0, -1, 0), 'paint'))
    # the apron's rolled top edge and a pressed bead along it
    b.extend(K.tube_buf(np.array([(FIREWALL_X, APRON_Y - 0.004, LEDGE_Z), (RAD_X, APRON_Y - 0.004, LEDGE_Z)]), 0.006, 'paint', 6))
    for (x0, x1) in ((FIREWALL_X + 0.06, xa - 0.14), (xa + 0.14, RAD_X - 0.06)):
        b.extend(K.tube_buf(np.array([(x0, APRON_Y, 0.80), (x1, APRON_Y, 0.80)]), 0.007, 'paint', 6))
    # firewall from the rail to the cowl, a ribbed heat shield on it behind the engine
    b.extend(quad_sheet((FIREWALL_X, 0.0, PAN_Z), (0, BAY_Y, 0), (0, 0, top - PAN_Z), 6, 6, (1, 0, 0), 'paint'))
    b.extend(heat_shield(FIREWALL_X, 0.30, 0.68, 1.22))
    # the cowl's underside: a box section from the firewall to the bonnet's hinge line
    b.extend(K.box_buf((FIREWALL_X - 0.01, 0.0, top), (D['hood_rear'] + 0.004, BAY_Y, top + 0.012), 'paint', 0.004, 2))
    # radiator support round the grille: top bar, bottom bar, side post outboard of the radiator's room, the latch
    b.extend(K.box_buf((RAD_X, 0.0, 1.235), (RAD_X + 0.03, 0.47, 1.275), 'paint', 0.008, 2))
    b.extend(K.box_buf((RAD_X, 0.0, 0.67), (RAD_X + 0.03, 0.47, 0.71), 'paint', 0.008, 2))
    b.extend(K.box_buf((RAD_X, 0.44, 0.67), (RAD_X + 0.03, 0.48, 1.275), 'paint', 0.008, 2))
    b.extend(K.box_buf((RAD_X + 0.0, 0.48, 0.86), (RAD_X + 0.012, BAY_Y, 0.90), 'paint', 0.004, 1))
    b.extend(K.box_buf((RAD_X - 0.02, 0.0, 1.26), (RAD_X + 0.008, 0.035, 1.292), 'steel', 0.004, 2))
    # wiring loom along the ledge's wall to the lamps, over the support's top bar, down the firewall
    wy = BAY_Y - 0.012
    main = [(FIREWALL_X + 0.10, wy, 1.20), (xa, wy, 1.21), (RAD_X - 0.12, wy, 1.21), (RAD_X - 0.04, wy - 0.03, 1.15),
            (RAD_X - 0.01, 0.72, 1.06)]
    top_bar = [(RAD_X - 0.12, wy, 1.21), (RAD_X + 0.004, 0.62, 1.278), (RAD_X + 0.02, 0.30, 1.279), (RAD_X + 0.02, 0.0, 1.279)]
    fw = [(FIREWALL_X + 0.10, wy, 1.20), (FIREWALL_X + 0.012, 0.66, 1.15), (FIREWALL_X + 0.012, 0.42, 1.12),
          (FIREWALL_X + 0.012, 0.31, 1.10)]
    b.extend(harness([main, top_bar, fw], [0.008, 0.006, 0.006]))
    for x in (1.40, 1.75, RAD_X - 0.18):
        b.extend(K.box_buf((x - 0.008, wy - 0.006, 1.195), (x + 0.008, BAY_Y, 1.222), 'trim', 0.002, 1))
    # brake lines from the master cylinder down past the ledge to the axle
    for dz in (0.0, 0.013):
        path = [(1.32, 0.55, 1.13 + dz), (1.40, 0.64, 1.10 + dz), (1.46, 0.64, LEDGE_Z + 0.005 + dz), (1.46, BAY_Y - 0.006, LEDGE_Z + 0.01 + dz)]
        b.extend(K.tube_buf(smooth_path(path, 1), 0.0026, 'steel', 4))
    return b


def engine_bay_asym():
    """Brake booster and master cylinder on the left firewall strip (clear of the steering column), the battery's
    tray on the left ledge ahead of the wheel, the heater box on the right, the washer bottle on the right ledge,
    fuse and relay boxes, the ID plate."""
    b = K.Buf()
    fx = FIREWALL_X
    by_, bz_ = 0.56, 1.13
    V, N, T = K.lathe(np.array([(0.0, 0.0), (0.072, 0.0), (0.082, 0.012), (0.082, 0.058), (0.072, 0.068), (0.0, 0.068)]), (fx, by_, bz_), (1, 0, 0), 16)
    b.add(V, N, T, 'steel')
    b.extend(K.cyl_buf((fx + 0.068, by_, bz_), (fx + 0.22, by_, bz_), 0.02, 'alu', 12))
    b.extend(K.cyl_buf((fx + 0.15, by_, bz_ + 0.02), (fx + 0.15, by_, bz_ + 0.07), 0.026, 'ceramic', 14))
    b.extend(K.cyl_buf((fx + 0.15, by_, bz_ + 0.07), (fx + 0.15, by_, bz_ + 0.084), 0.021, 'trim', 12))
    b.extend(K.box_buf((fx, 0.68, 1.08), (fx + 0.07, BAY_Y - 0.004, 1.18), 'trim', 0.008, 2))
    bx, by, bz = BATTERY
    b.extend(K.box_buf((bx - 0.155, by - 0.105, bz - 0.012), (bx + 0.155, by + 0.105, bz), 'steel', 0.004, 1))
    b.extend(K.box_buf((bx - 0.165, by - 0.11, bz - 0.012), (bx - 0.155, by + 0.11, bz + 0.03), 'steel', 0.002, 1))
    b.extend(K.box_buf((fx, -0.64, 1.06), (fx + 0.10, -0.44, 1.22), 'plastic_int', 0.02, 2))
    for hz in (1.10, 1.16):
        b.extend(K.tube_buf(smooth_path([(fx + 0.10, -0.49, hz), (fx + 0.16, -0.49, hz - 0.005), (fx + 0.19, -0.48, hz - 0.06)]), 0.012, 'rubber', 8))
    b.extend(K.box_buf((fx, -BAY_Y + 0.004, 1.08), (fx + 0.07, -0.70, 1.16), 'trim', 0.006, 2))
    b.extend(K.box_buf((1.80, -0.72, LEDGE_Z), (1.98, -0.54, LEDGE_Z + 0.17), 'ceramic', 0.03, 2))
    b.extend(K.cyl_buf((1.89, -0.63, LEDGE_Z + 0.17), (1.89, -0.63, LEDGE_Z + 0.20), 0.018, 'trim', 10))
    b.extend(K.box_buf((1.70, BAY_Y - 0.003, 1.10), (1.78, BAY_Y - 0.001, 1.14), 'alu', 0.0, 1))
    return b


# ============================================================================================ underbody
def axle_end(hy):
    """Where a live axle's tube ends: in the middle of its hub's carrier (knuckle())."""
    return hy - K.BRAKE_IN[1] - 0.003 - 0.015


def knuckle(hx, hy, hz, front=True):
    """A hub's carrier (left side: outer face +Y): the hub flange at the hub face with six studs and the centre cap,
    the spindle, and the carrier just inboard of the brake (front: the steering knuckle on the axle's end with its
    arm under the tube, back to the tie rod; rear: the axle's end). An object of its own, KNUCKLE_<hub>, the game
    hangs on the wheel's pivot."""
    b = K.knuckle_buf(hx, hy, hz, hy + 0.012, 0.082, 6, 0.0695, 30.0, stud_r=0.006, stud_len=0.009, cap_r=0.027,
                      cap_out=0.007, carrier=(0.058, 0.02 if front else 0.032, 0.13, 0.16 if front else 0.13))
    if front:
        y1 = hy + 0.012 - K.BRAKE_IN[1] - 0.003 - 0.02
        b.extend(K.box_buf((hx - 0.17, y1 - 0.02, hz - 0.108), (hx - 0.04, y1 + 0.01, hz - 0.08), 'steel', 0.006, 2))
        b.extend(K.cyl_buf((hx - 0.16, y1 - 0.005, hz - 0.13), (hx - 0.16, y1 - 0.005, hz - 0.085), 0.014, 'steel', 10))
    return b


def underbody():
    """UNDER (left half): the ladder frame's rail and crossmember halves, the rear axle's tube, the front tie rod's
    half, the floors' undersides, the wheelhouse liners. Springs, dampers, brakes and the differentials are the
    axles' parts; the front axle's tubes (one short, one long from the offset differential) are centre_under()'s."""
    b = K.Buf()
    # rail: a C section (open towards the centre) swept along the kicked-up centre line
    xs = np.unique(np.concatenate([np.linspace(2.40, 2.18, 3), np.linspace(2.10, 1.30, 3), np.linspace(1.24, 0.92, 6),
                                   np.linspace(0.80, -0.80, 3), np.linspace(-0.86, -1.12, 6), np.linspace(-1.20, -1.85, 3),
                                   np.linspace(-1.92, -2.12, 4), [-2.38]]))[::-1]
    path = np.stack([xs, np.full(len(xs), FRAME_Y), [float(frame_zc(x)) for x in xs]], 1)
    prof = np.array([(0.035, -0.06), (-0.035, -0.06), (-0.035, 0.06), (0.035, 0.06), (0.035, 0.052), (-0.027, 0.052), (-0.027, -0.052), (0.035, -0.052)])[::-1]
    V, N, T = K.sweep(path, (0, 0, 1), prof, closed=False, closed_prof=True, smooth_prof=False)
    b.add(V, N, T, 'steel')
    for e, sg in ((0, 1.0), (-1, -1.0)):
        cap = np.array([path[e] + (0, -0.035, -0.06), path[e] + (0, 0.035, -0.06), path[e] + (0, 0.035, 0.06), path[e] + (0, -0.035, 0.06)])
        b.extend(K.fill_loop(cap, (sg, 0, 0), 'steel'))
    # crossmembers (halves): under the radiator, under the gearbox, under the cab, behind the cab, behind the rear
    # axle, the rear one
    for x, z0, z1 in ((2.30, None, None), (0.86, 0.42, None), (-0.30, None, None), (-0.95, None, None), (-1.75, None, None), (-2.34, None, None)):
        zc = float(frame_zc(x))
        lo = zc - 0.05 if z0 is None else z0
        hi = zc + 0.05 if z1 is None else z1
        b.extend(K.box_buf((x - 0.035, 0.0, lo), (x + 0.035, FRAME_Y - 0.03, hi), 'steel', 0.004, 1))
    # the cab floor's underside (open under the tunnel: the gearbox and the transfer case stand up into it), the
    # bed's floor underside with its cross sills (beside the rear wheel tubs: the liners there)
    t = TUNNEL
    b.extend(K.box_buf((D['xr'] + 0.03, 0.0, PAN_Z - 0.006), (t['x0'], 0.86, PAN_Z), 'trim', 0.003, 1))
    b.extend(K.box_buf((t['x0'], t['hw_r'], PAN_Z - 0.006), (t['xs'], 0.86, PAN_Z), 'trim', 0.003, 1))
    b.extend(K.box_buf((t['xs'], t['hw_f'], PAN_Z - 0.006), (FIREWALL_X, 0.86, PAN_Z), 'trim', 0.003, 1))
    fz = D['bed_floor'] - 0.025
    xt0, xt1 = D['ax_r'] - WELL_R, D['ax_r'] + WELL_R
    b.extend(K.box_buf((D['bed_xr'] + 0.02, 0.0, fz - 0.006), (D['bed_xf'] - 0.03, TUB_Y_IN, fz), 'trim', 0.003, 1))
    b.extend(K.box_buf((D['bed_xr'] + 0.02, TUB_Y_IN, fz - 0.006), (xt0 - 0.005, D['bed_hw'] - 0.03, fz), 'trim', 0.003, 1))
    for x in (-1.25, -1.82, -2.30):
        b.extend(K.box_buf((x - 0.03, 0.0, fz - 0.06), (x + 0.03, TUB_Y_IN if xt0 < x < xt1 else 0.84, fz - 0.006), 'steel', 0.004, 1))
    # wheelhouse liners: front (from the apron out to the wing), rear (under the bed's tub)
    b.extend(wheelhouse(D['ax_f'], FRAME_Y + 0.04, 0.86, WELL_R, z_cut=0.50))
    b.extend(wheelhouse(D['ax_r'], TUB_Y_IN, 0.86, WELL_R, z_cut=D['bed_z0']))
    # the rear axle's tube: from the differential part's tube end out into the hub's carrier
    hz = D['hub_z']
    b.extend(K.cyl_buf((D['ax_r'], AXLE_IN, hz), (D['ax_r'], axle_end(D['track_r'] / 2), hz), 0.042, 'steel', 14))
    # front: the tie rod behind the axle under the engine's sump, its ends on the steering arms' pins (under the
    # front differential's pinion nose, 2 cm clear of it; any lower and it hung under the differential)
    hx, hy = D['ax_f'], D['track_f'] / 2
    y_arm = hy + 0.012 - K.BRAKE_IN[1] - 0.003 - 0.02 - 0.005
    b.extend(K.tube_buf(np.array([(hx - 0.16, 0.0, hz - TIE_DZ), (hx - 0.16, y_arm, hz - TIE_DZ)]), 0.015, 'steel', 8))
    b.extend(K.cyl_buf((hx - 0.16, y_arm - 0.03, hz - TIE_DZ), (hx - 0.16, y_arm + 0.002, hz - TIE_DZ), 0.022, 'steel', 10))
    # side steps between the arches (a tube rail on brackets off the frame)
    for (x0, x1) in ((-0.82, 1.02),):
        P = np.array([(x0, 0.80, 0.43), (x1, 0.80, 0.43)])
        b.extend(K.box_buf((x0, 0.73, 0.425), (x1, 0.86, 0.445), 'trim', 0.008, 2))
        for xb in (x0 + 0.10, 0.10, x1 - 0.10):
            b.extend(K.box_buf((xb - 0.025, FRAME_Y + 0.035, 0.44), (xb + 0.025, 0.80, 0.465), 'steel', 0.004, 1))
        del P
    return b


TUB_Y_IN = 0.43
# the front tie rod's axis below the hubs' centre (the steering arms' pins reach down to it)
TIE_DZ = 0.13


def centre_under():
    """Parts on the centre line or not mirrored: the transfer case behind the gearbox, the rear propshaft (two
    pieces on a centre bearing) back to the rear differential's companion flange, the front propshaft forward on
    the left to the front differential's, the front axle's two tubes from that differential's stubs (a short one to
    the left hub, a long one to the right), the steering box and drag link (left), the fuel tank's straps, the
    fuel filler hose from the right flap."""
    b = K.Buf()
    hz = D['hub_z']
    # transfer case: a drop box behind the gearbox, its input at the gearbox's tail (high), its outputs low
    zi = GEARBOX[2] + 0.108
    xg = GEARBOX[0] - 0.31
    b.extend(K.box_buf((0.39, -0.12, 0.345), (0.60, 0.16, 0.48), 'alu', 0.025, 1))
    b.extend(K.box_buf((0.42, -0.075, 0.46), (0.60, 0.075, zi + 0.06), 'alu', 0.02, 1))
    b.extend(K.box_buf((0.47, 0.15, 0.33), (0.60, FRONT_DIFF_Y + 0.03, 0.43), 'alu', 0.02, 1))
    b.extend(K.box_buf((0.59, -0.075, zi - 0.065), (0.61, 0.075, zi + 0.065), 'alu', 0.006, 1))
    for (y, z) in ((-0.055, zi - 0.045), (0.055, zi - 0.045), (-0.055, zi + 0.045), (0.055, zi + 0.045)):
        b.extend(K.cyl_buf((0.60, y, z), (0.613, y, z), 0.008, 'steel', 6))
    b.extend(K.cyl_buf((0.61, 0.0, zi), (xg, 0.0, zi), 0.03, 'steel', 12))
    b.extend(K.cyl_buf((TC_REAR[0] - 0.015, 0.0, TC_REAR[2]), TC_REAR, 0.05, 'steel', 14))
    b.extend(K.cyl_buf(TC_FRONT, (TC_FRONT[0] + 0.025, TC_FRONT[1], TC_FRONT[2]), 0.045, 'steel', 14))
    # the rear propshaft: to a centre bearing under the cab's back, on to the rear differential's companion flange
    rx = D['ax_r']
    xe, ze = rx + DIFF_FLANGE[0] + 0.022, hz + DIFF_FLANGE[1]
    xm = -0.55
    zm = TC_REAR[2] + (ze - TC_REAR[2]) * (TC_REAR[0] - xm) / (TC_REAR[0] - xe)
    b.extend(K.cyl_buf((TC_REAR[0] - 0.015, 0.0, TC_REAR[2]), (xm, 0.0, zm), 0.034, 'steel', 14))
    b.extend(K.box_buf((xm - 0.05, -0.06, zm - 0.04), (xm + 0.05, 0.06, zm + 0.05), 'rubber', 0.01, 1))
    b.extend(K.box_buf((xm - 0.02, -0.20, zm + 0.04), (xm + 0.02, 0.20, float(frame_zc(xm)) - 0.05), 'steel', 0.004, 1))
    b.extend(K.cyl_buf((xm, 0.0, zm), (xe, 0.0, ze), 0.034, 'steel', 14))
    for x, z in ((TC_REAR[0] - 0.035, TC_REAR[2]), (xe, ze)):
        b.extend(K.cyl_buf((x - 0.02, 0.0, z), (x + 0.02, 0.0, z), 0.045, 'steel', 14))
    # the front propshaft: forward on the left, under the engine's left side, to the front differential's pinion
    # (the part turned: its companion flange faces back); its own flange on the pinion flange's bolt heads, a
    # universal joint behind it
    yf, zf = FRONT_DIFF_Y, hz + DIFF_FLANGE[1]
    xp = D['ax_f'] - PINION_BOLTS
    b.extend(K.cyl_buf((xp - 0.040, yf, zf), (xp, yf, zf), 0.048, 'steel', 16))
    b.extend(K.cyl_buf((xp - 0.076, yf, zf), (xp - 0.040, yf, zf), 0.040, 'steel', 14))
    b.extend(K.cyl_buf((TC_FRONT[0] + 0.025, yf, TC_FRONT[2]), (xp - 0.076, yf, zf), 0.030, 'steel', 14))
    b.extend(K.cyl_buf((TC_FRONT[0] + 0.03, yf, TC_FRONT[2]), (TC_FRONT[0] + 0.065, yf, TC_FRONT[2]), 0.04, 'steel', 14))
    # the front axle's tubes from the offset differential's stub flanges into the hubs' carriers (1 mm into the
    # flanges; their ends in the middle of the front knuckles' carriers)
    xa, ye = D['ax_f'], axle_end(D['track_f'] / 2) + 0.007
    b.extend(K.cyl_buf((xa, FRONT_DIFF_Y + DIFF_STUB - 0.001, hz), (xa, ye, hz), 0.042, 'steel', 14))
    b.extend(K.cyl_buf((xa, FRONT_DIFF_Y - DIFF_STUB + 0.001, hz), (xa, -ye, hz), 0.042, 'steel', 14))
    # steering box on the left rail ahead of the front axle, its pitman arm, the drag link to the left knuckle; the
    # steering column's lower shaft from the firewall to the box
    zr = float(frame_zc(1.85))
    b.extend(K.box_buf((1.80, FRAME_Y + 0.035, zr - 0.06), (1.92, FRAME_Y + 0.105, zr + 0.06), 'steel', 0.012, 2))
    b.extend(K.cyl_buf((1.86, FRAME_Y + 0.07, zr - 0.06), (1.86, FRAME_Y + 0.07, zr - 0.15), 0.028, 'steel', 12))
    hy = D['track_f'] / 2
    y_k = hy + 0.012 - K.BRAKE_IN[1] - 0.003 - 0.02
    b.extend(K.tube_buf(np.array([(1.86, FRAME_Y + 0.07, zr - 0.14), (1.70, 0.52, zr - 0.20), (D['ax_f'] + 0.06, y_k - 0.012, hz + 0.15)]), 0.014, 'steel', 8))
    # (inside the apron, between it and the engine's room, through it to the box)
    p, d = steering_mount()
    a = p + d * 0.30
    path = np.array([a, (FIREWALL_X, 0.40, 0.935), (1.50, 0.395, 0.80), (1.78, 0.42, 0.745), (1.86, FRAME_Y + 0.07, zr + 0.06)])
    b.extend(K.tube_buf(smooth_path(path, 1), 0.013, 'steel', 8))
    # the fuel tank's straps (the tank part sits between the rails behind the rear axle, under them)
    tx = FUEL_TANK[0]
    for x in (tx - 0.12, tx + 0.12):
        b.extend(K.box_buf((x - 0.022, -0.40, FUEL_TANK[2] - 0.012), (x + 0.022, 0.40, FUEL_TANK[2]), 'steel', 0.003, 1))
        for sy in (1, -1):
            b.extend(K.box_buf((x - 0.022, sy * 0.405 - 0.006, FUEL_TANK[2] - 0.012), (x + 0.022, sy * 0.405 + 0.006, float(frame_zc(x)) - 0.06), 'steel', 0.002, 1))
    # the fuel filler hose from the right flap down inside the bed's side wall to the tank's neck (right)
    fx, fzz = D['fuel_x'], D['fuel_z']
    path = np.array([(fx, -0.835, fzz), (fx, -0.80, fzz - 0.06), (fx - 0.01, -0.80, 0.82), (fx, -0.79, 0.62), (fx + 0.04, -0.62, 0.52),
                     (tx + 0.12, -0.45, FUEL_TANK[2] + 0.15), (tx + 0.10, -0.40, FUEL_TANK[2] + 0.13)])
    b.extend(K.tube_buf(smooth_path(path, 1), 0.018, 'rubber', 10))
    return b


# ============================================================================================ fuel filler
def fuel_details(ex):
    """The pocket behind the flap with its cap (built on the left, mirrored to the right)."""
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
    g = K.grid_points(c[0] - 0.06, c[0] + 0.06, c[1] - 0.06, c[1] + 0.06, 0.014, dt=0.014)
    P3, N3 = S.SIDE_B.to3d(g)
    V, N, T = K.mesh_region(S.CB, [loop], [], S.CB.to2d(P3), spacing=0.014)
    b = K.Buf().add(V, N, T, 'paint')
    V, N, Tr = K.roll_edge(si['P'], si['N'], si['E'], 0.0015, 0.006, 0.004, 2, closed=True, hem_segs=0)
    b.add(V, N, Tr, 'paint')
    b.extend(K.panel_back(si['P'], si['N'], si['E']))
    return b


# ============================================================================================ interior
def steering_mount():
    """(the column's end, the column direction forward-down)."""
    ang = math.radians(30.0)
    d = np.array([math.cos(ang), 0.0, -math.sin(ang)])
    p = np.array([0.715, DRIVER_Y, 1.095])
    return p, d


def interior(ex):
    out = {}
    L = K.Buf()
    C = K.Buf()
    # rubber floor mat (left half): flat from the cab's back wall to the toe board, open under the tunnel
    t = TUNNEL
    xb = D['xr'] + 0.035
    for (xa_, xb_), y0 in (((xb, t['x0']), 0.0), ((t['x0'], t['xs']), t['hw_r']), ((t['xs'], FIREWALL_X - 0.02), t['hw_f'])):
        sec = K.round_profile(np.array([(y0, FLOOR_Z), (0.82, FLOOR_Z), (0.83, FLOOR_Z + 0.03)]), [0, 0.01, 0], 2)
        xs = np.linspace(xa_, xb_, max(2, int(round((xb_ - xa_) / 0.45)) + 1))
        V = np.array([(x, y, z) for x in xs for (y, z) in sec])
        T = K.grid_tris(len(xs), len(sec))
        L.extend(face_up(recompute_normals(K.Buf().add(V, np.zeros_like(V), T, 'rubber'))))
    # the toe board up to the firewall (turned up about its foot), the firewall's cabin face
    L.extend(K.box_buf((FIREWALL_X - 0.20, t['hw_f'] + 0.006, FLOOR_Z - 0.01), (FIREWALL_X - 0.005, 0.70, FLOOR_Z + 0.012), 'rubber', 0.006, 2,
                       xf=K.mat4_rot((0, 1, 0), -34, (FIREWALL_X - 0.005, 0, FLOOR_Z))))
    L.extend(quad_sheet((FIREWALL_X - 0.006, 0.0, FLOOR_Z), (0, 0.80, 0), (0, 0, 1.24 - FLOOR_Z), 2, 2, (-1, 0, 0), 'trim'))
    # the cab's back wall inside (behind the bench), the sill trims along the door openings, the kick panels, the B
    # pillar's inner cover
    L.extend(K.box_buf((D['xr'] + 0.025, 0.0, FLOOR_Z), (D['xr'] + 0.04, 0.80, 1.31), 'plastic_int', 0.006, 2))
    L.extend(K.box_buf((D['rd_rear'] - 0.02, 0.74, FLOOR_Z), (D['fd_front'] - 0.02, 0.84, FLOOR_Z + 0.06), 'plastic_int', 0.012, 2))
    L.extend(K.box_buf((0.96, 0.66, FLOOR_Z), (FIREWALL_X - 0.02, 0.80, 1.00), 'plastic_int', 0.02, 2))
    L.extend(K.box_buf((D['bp_rear'] + 0.004, 0.74, FLOOR_Z + 0.06), (D['bp_front'] - 0.004, 0.80, 1.74), 'plastic_int', 0.015, 2))
    L.extend(K.box_buf((D['xr'] + 0.04, 0.70, FLOOR_Z + 0.06), (D['rd_rear'] - 0.02, 0.80, 1.30), 'plastic_int', 0.015, 2))
    # headliner under the roof (fabric) with three ribs, the grab rails along its sides
    gus = S.g_u_samples()
    row = np.stack([gus, np.full(len(gus), S.G_T[-1] - 0.02)], 1)
    Pr, _ = S.CG.to3d(row, -0.022)
    a, bb = Pr[-1], Pr[0]
    xc = np.linspace(a[0], bb[0], 26)[1:-1]
    loop = np.vstack([Pr[:, :2], np.stack([xc, np.zeros(len(xc))], 1)])
    g = K.grid_points(-1.0, 0.95, 0.0, 0.8, 0.10, dt=0.10)
    V, N, T = K.mesh_region(S.CR, [K.Loop(loop)], [], g, spacing=0.10, level=-0.022)
    L.add(V, -N, T, 'fabric')
    for x in (-0.55, 0.25):
        L.extend(K.box_buf((x - 0.025, 0.0, D['roof_z'] - 0.044), (x + 0.025, 0.70, D['roof_z'] - 0.030), 'plastic_int', 0.006, 1))
    L.extend(K.tube_buf(np.array([(-0.70, 0.74, 1.66), (-0.68, 0.74, 1.69), (-0.32, 0.74, 1.69), (-0.30, 0.74, 1.66)]), 0.012, 'trim', 8))
    dash, gauges = dashboard()
    C.extend(dash)
    # pedals hanging from under the dash
    for (py, w_, name) in ((DRIVER_Y + 0.11, 0.025, 'clutch'), (DRIVER_Y, 0.03, 'brake'), (DRIVER_Y - 0.12, 0.022, 'throttle')):
        base = np.array([FIREWALL_X - 0.12, py, FLOOR_Z + 0.42])
        pad = np.array([FIREWALL_X - (0.26 if name != 'throttle' else 0.22), py, FLOOR_Z + (0.16 if name != 'throttle' else 0.10)])
        C.extend(K.tube_buf(np.array([base, (base + pad) / 2 + (0.025, 0, 0), pad + (0, 0, 0.04)]), 0.008, 'steel', 6))
        C.extend(K.box_buf(pad + (-0.012, -w_, -0.04 if name != 'throttle' else -0.06), pad + (0.012, w_, 0.04), 'rubber', 0.006, 2,
                           xf=K.mat4_rot((0, 1, 0), -22, pad)))
    st = steering_mount()
    C.extend(K.cyl_buf(st[0] + st[1] * 0.03, st[0] + st[1] * 0.22, 0.042, 'plastic_int', 16, r1=0.05))
    # gear lever boot ring on the tunnel, the transfer lever beside it (frame-owned: a short lever, a red knob)
    gx = GEAR_X
    V, N, T = K.lathe(np.array([(0.0, 0.012), (0.03, 0.012), (0.055, 0.004), (0.068, 0.0)])[::-1], (gx, 0.0, tunnel_h(gx) + 0.002), (0, 0, 1), 18)
    C.add(V, N, T, 'rubber')
    tx, ty = 0.58, -0.075
    V, N, T = K.lathe(np.array([(0.0, 0.008), (0.02, 0.008), (0.036, 0.0)])[::-1], (tx, ty, tunnel_h(tx) + 0.002), (0, 0, 1), 12)
    C.add(V, N, T, 'rubber')
    tip = np.array([tx - 0.04, ty, tunnel_h(tx) + 0.20])
    C.extend(K.tube_buf(np.array([(tx, ty, tunnel_h(tx) + 0.004), (tx - 0.015, ty, tunnel_h(tx) + 0.10), tip]), 0.007, 'chrome', 6))
    C.extend(K.cyl_buf(tip - (0, 0, 0.005), tip + (0.0, 0.0, 0.045), 0.017, 'lens_tail', 12, r1=0.02))
    C.extend(tunnel_cover())
    # seat rails: the two buckets, the rear bench
    for (sx, sy) in ((SEAT_X, DRIVER_Y), (SEAT_X, -DRIVER_Y)):
        for dy in (-0.17, 0.17):
            C.extend(K.box_buf((sx - 0.22, sy + dy - 0.015, FLOOR_Z), (sx + 0.22, sy + dy + 0.015, FLOOR_Z + 0.03), 'steel', 0.004, 2))
    for dy in (-0.48, 0.48):
        C.extend(K.box_buf((REAR_SEAT_X - 0.15, dy - 0.02, FLOOR_Z), (REAR_SEAT_X + 0.15, dy + 0.02, FLOOR_Z + 0.03), 'steel', 0.004, 2))
    # the interior mirror on the header, sun visors, the dome lamp over the rear seat
    mp = np.array([float(S.ws_x(0, 1.72)) - 0.06, 0.0, 1.71])
    C.extend(K.box_buf(mp + (-0.01, -0.012, 0.01), mp + (0.012, 0.012, 0.075), 'plastic_int', 0.004, 2))
    C.extend(K.box_buf(mp + (-0.025, -0.11, -0.03), mp + (0.0, 0.11, 0.02), 'plastic_int', 0.012, 3))
    C.extend(K.box_buf(mp + (-0.0262, -0.10, -0.022), mp + (-0.0255, 0.10, 0.012), 'glass_dark', 0.0, 1))
    for sy in (1, -1):
        vp = np.array([float(S.ws_x(0.38, 1.76)) - 0.10, sy * 0.40, 1.765])
        C.extend(K.box_buf(vp + (-0.17, -0.20, -0.012), vp + (0.0, 0.20, 0.008), 'fabric', 0.01, 3, xf=K.mat4_rot((0, 1, 0), 10, vp)))
    lp = np.array([-0.15, 0.0, D['roof_z'] - 0.045])
    V, N, T = K.lathe(np.array([(0.0, -0.035), (0.07, -0.03), (0.09, -0.012), (0.095, 0.0)]), lp, (0, 0, 1), 14)
    C.add(V, N, T, 'ceramic')
    out['L'] = L
    out['C'] = C
    out['gauges'] = gauges
    return out


def tunnel_cover():
    """The tunnel's carpet cover (both halves): low and narrow over the transfer case, stepping up over the gearbox;
    the handbrake's slot on its low part between the seats."""
    b = K.Buf()
    t = TUNNEL
    xs = np.unique(np.concatenate([np.linspace(t['x0'], t['xs'] - 0.04, 2), np.linspace(t['xs'] - 0.03, t['xs'] + 0.03, 4),
                                   np.linspace(t['xs'] + 0.04, t['x1'] - 0.004, 2)]))
    rows = []
    for x in xs:
        hw, top = tunnel_hw(x), tunnel_h(x)
        sec = K.round_profile(np.array([(-hw, FLOOR_Z + 0.002), (-hw, top), (hw, top), (hw, FLOOR_Z + 0.002)]), [0, 0.04, 0.04, 0], 3)
        rows.append([(x, y, z) for (y, z) in sec])
    V = np.array(rows).reshape(-1, 3)
    T = K.grid_tris(len(xs), len(rows[0]))
    cover = recompute_normals(K.Buf().add(V, np.zeros_like(V), T, 'fabric'))
    Vc, Nc, Tc, Mc = cover.arrays()
    if float((Nc[:, 2]).sum()) < 0:
        Nc = -Nc
    b.add(Vc, Nc, Tc, 'fabric')
    b.extend(K.fill_loop(np.array(rows[0]), (-1, 0, 0), 'fabric'))
    hz = tunnel_h(HB_X)
    b.extend(K.box_buf((HB_X - 0.14, -0.03, hz - 0.004), (HB_X + 0.16, 0.03, hz + 0.008), 'plastic_int', 0.006, 2))
    b.extend(K.box_buf((HB_X - 0.11, -0.012, hz + 0.004), (HB_X + 0.13, 0.012, hz + 0.0095), 'trim', 0.002, 1))
    return b


def dashboard():
    """A square 1980s truck dash: a long padded top, a painted fascia, an instrument hood in front of the driver with
    the speedometer, the rev counter and two small dials, the radio slot in the middle with the heater levers over
    it, a glovebox, vents at the ends and the middle, a grab handle in front of the passenger."""
    b = K.Buf()
    fx = DASH_FACE_X

    def pad_sec(y):
        ay = abs(y - DRIVER_Y)
        hood = 0.035 * float(K.sstep(0.27, 0.22, ay)) if y > 0 else 0.0
        pts = np.array([(1.15, 1.315), (1.04, 1.355), (fx + 0.03, 1.365 + hood * 0.6), (fx - 0.005 - hood, 1.36 + hood * 0.6),
                        (fx - 0.02 - hood, 1.34 + hood * 0.85), (fx - 0.012 - hood, 1.318 + hood * 0.85), (fx + 0.01, 1.31), (1.15, 1.295)])
        return K.round_profile(pts, [0, 0.03, 0.02, 0.012, 0.01, 0.008, 0.01, 0], 1)
    ys = np.concatenate([np.linspace(-0.76, 0.10, 3), np.linspace(0.12, 0.68, 7), [0.77]])
    b.extend(extrude_y(None, ys, 'plastic_int', inside=(1.05, 0.0, 1.33), sec_fn=pad_sec))
    fas = K.round_profile(np.array([(fx, 1.31), (fx, 1.06), (fx + 0.04, 1.03), (1.10, 1.03), (1.10, 1.31)]), [0, 0.025, 0.02, 0, 0], 2)
    fas_low = K.round_profile(np.array([(fx, 1.255), (fx, 1.06), (fx + 0.04, 1.03), (1.10, 1.03), (1.10, 1.255)]), [0, 0.025, 0.02, 0, 0], 2)
    yb0, yb1 = DRIVER_Y - 0.222, DRIVER_Y + 0.222
    for (y0, y1, sec) in ((-0.72, yb0, fas), (yb0, yb1, fas_low), (yb1, 0.72, fas)):
        b.extend(extrude_y(sec, np.linspace(y0, y1, 3), 'paint', inside=(1.0, 0.5 * (y0 + y1), 1.17)))
    for sy in (1.0, -1.0):
        b.extend(K.box_buf((fx - 0.004, min(sy * 0.72, sy * 0.79), 1.035), (1.10, max(sy * 0.72, sy * 0.79), 1.31), 'plastic_int', 0.02, 2))
    # glovebox and its push button (passenger)
    b.extend(K.box_buf((fx - 0.006, -0.66, 1.10), (fx + 0.004, -0.26, 1.24), 'paint', 0.01, 2))
    b.extend(K.box_buf((fx - 0.012, -0.48, 1.215), (fx - 0.004, -0.44, 1.23), 'chrome', 0.003, 1))
    # the instrument box tilted towards the eye, the dials in it
    eye = np.array(EYE)
    pc = np.array([fx - 0.012, DRIVER_Y, 1.265])
    dn = K.unit(eye - pc)
    dn = K.unit(np.array([dn[0], 0.0, dn[2]]))
    R = K.frame_from((0, 1, 0), dn)
    b.extend(K.box_buf((-0.235, -0.076, -0.03), (0.235, 0.075, 0.0), 'trim', 0.012, 2, xf=K.mat4_trs(pc, R)))
    gauges = []
    for (gy, gz, r, name, big) in ((0.106, 0.004, 0.060, 'N_speed', True), (-0.11, 0.004, 0.058, 'N_rpm', True),
                                   (0.0, 0.020, 0.023, 'N_fuel', False), (0.0, -0.040, 0.023, 'N_temp', False)):
        c = pc + R[:, 0] * gy + R[:, 1] * gz
        db, g = dial(c, dn, r, big, 'chrome', segs=20 if big else 14)
        b.extend(db)
        g['name'] = name
        gauges.append(g)
    # vents at the ends and the middle
    for vy, vz in ((0.69, 1.25), (-0.69, 1.25), (0.11, 1.27), (-0.11, 1.27)):
        c = np.array([fx - 0.002, vy, vz])
        b.extend(K.box_buf(c + (-0.006, -0.05, -0.022), c + (0.004, 0.05, 0.022), 'trim', 0.006, 1))
        for k in range(-1, 2):
            b.extend(K.box_buf(c + (-0.010, -0.045, 0.012 * k - 0.002), c + (-0.004, 0.045, 0.012 * k + 0.002), 'plastic_int', 0.0, 1))
    # radio slot (the radio part sits in it) with the heater levers over it
    b.extend(K.box_buf((fx - 0.004, -0.097, 1.147), (fx + 0.002, 0.097, 1.203), 'chrome', 0.003, 2))
    b.extend(K.box_buf((fx - 0.006, -0.09, 1.152), (fx + 0.06, 0.09, 1.198), 'trim', 0.002, 1))
    b.extend(K.box_buf((fx - 0.006, -0.085, 1.215), (fx + 0.002, 0.085, 1.245), 'trim', 0.004, 1))
    for k in range(3):
        yy = -0.05 + 0.05 * k
        b.extend(K.box_buf((fx - 0.02, yy - 0.006, 1.222), (fx - 0.008, yy + 0.006, 1.236), 'plastic_int', 0.003, 1))
    # the passenger's grab handle across the dash
    hz = 1.39
    b.extend(K.tube_buf(np.array([(fx + 0.02, -0.22, 1.35), (fx - 0.06, -0.24, hz), (fx - 0.06, -0.60, hz), (fx + 0.02, -0.62, 1.35)]), 0.014, 'trim', 8))
    return b, gauges
