"""Goat: everything behind the outer skin. The engine bay (a long bay with the diesel six's rear end in a doghouse
behind the firewall), door insides, the bonnet's inner frame, the ladder frame with its kick-ups over both live
axles, the transfer case and two propshafts, the winch under the nose (UNDER), the cab and the rear room
(INTERIOR), the fuel filler on the right."""
import math
import sys

sys.dont_write_bytecode = True

import numpy as np  # noqa: E402

from frames import _kit as K  # noqa: E402
from frames import goat as S  # noqa: E402
from frames._sedan_inner import (dial, extrude_y, face_up, flip_down, harness, heat_shield, lid_back, quad_sheet,  # noqa: E402
                                 recompute_normals, ring_inner, side_out, smooth_path, tub)

D = S.D
PI = math.pi
FLOOR_Z = 0.49           # cab floor (rubber mat top)
PAN_Z = 0.455            # underside of the cab floor (on the rails)
CARGO_X = -1.00          # the rear room's raised floor behind this
CARGO_Z = 0.62
FIREWALL_X = 1.00        # the firewall outboard of the doghouse (and the toe boards)
DOG_X = 0.905            # the doghouse: the engine's rear end behind the firewall, between the footwells
DOG_Y = 0.345
DOG_TOP = 1.14
RAD_X = 2.012            # radiator support (its bars from here forward)
APRON_Y = 0.40           # the bay's side walls (inboard of the front suspension's room)
LEDGE_Z = 0.92           # the inner fender's top (the battery stands on it)
BAY_Y = 0.80             # the inner face of the wings above the ledge
SEAT_X = 0.485           # seat floor attachment x: the stock bucket's eye at (0.325, 1.42)
DRIVER_Y = 0.41          # (the buckets stand outboard of the tunnel over the raised gearbox)
PEDAL_Y = 0.36           # the pedals' line: inboard of the driver, clear of the front wheelhouse in the footwell
# the front seats' runners are let into the floor, standing 5 mm proud of the mat (they stood on it, 3 cm tall)
SEAT_RISE = 0.005
EYE = (SEAT_X - 0.16, DRIVER_Y, FLOOR_Z + SEAT_RISE + 0.90)
# where the view is from: her eyes as the game seats her (0.18 ahead of and 0.08 under the seat's eye point), the
# frame's cabView (core/modcar/frames.ts) 0.35 back and 0.145 up: a woman's sitting height, 0.73 m over the cushion,
# her eyes about where they are leaning against the seat's back (Nomad Drive's driver's view, 2026-11-26)
VIEW = (EYE[0] + 0.183 - 0.35, DRIVER_Y, EYE[2] - 0.079 + 0.145)
# the binnacle and the instrument hood over it stand this much higher than they did, so that from the raised view the
# dials are 30 deg under the level line (they would have been 37; Nomad Drive's 23-32)
POD_RISE = 0.05
REAR_SEAT_X = -0.50
GEAR_X = 0.62
HB_X = 0.22
DASH_FACE_X = 0.78
FRAME_Y = 0.375          # ladder frame rails (centre)
# the engine room stands over the front axle: the mount high enough that every engine the room takes clears the
# axle's tube and the offset differential under it by a centimetre, the room's top 2 cm under the bonnet's lowest
# underside (its rear edge), from the firewall forward (the tallest, eng_i6d and eng_i4d, prop the bonnet open)
ENGINE = (1.425, 0.0, 0.44)
ENGINE_ROOM = ((-0.425, -0.34, 0.0), (0.48, 0.34, 0.673))
# the gearbox raised with it (its front in the doghouse), in a room every gearbox fits
GEARBOX = (0.718, 0.0, 0.552)
GEARBOX_ROOM = ((-0.31, -0.13, 0.0), (0.205, 0.13, 0.235))
# the tunnel: low and narrow over the transfer case's drop housing (behind xs), high and wide over the gearbox's room
# (to the doghouse); the floor's opening under it steps at xh, where the tunnel has its full width
TUNNEL = dict(x0=0.07, xs=0.40, xh=0.43, x1=DOG_X, hw_r=0.10, top_r=0.74, hw_f=0.148, top_f=0.805)


# the wheelhouse liners (UNDER): radius round the arch's centre, their inner walls (the rear tub's and the front
# liner's), the floors stop at them
WELL_R = D['arch_f'] + 0.012
WELL_Y0 = 0.40


def well_half(z):
    """Half the fore-and-aft length of a wheelhouse liner's circle at height z (both wells alike)."""
    return math.sqrt(WELL_R * WELL_R - (z - D['arch_z']) ** 2)


def frame_zc(x):
    """Rail centre height: low under the cab, kicked up over both live axles (their tubes and travel under it)."""
    x = np.asarray(x, float)
    return (0.395 + 0.195 * K.sstep(0.62, 0.95, x) - 0.04 * K.sstep(1.60, 1.80, x) + 0.195 * K.sstep(-0.80, -1.05, x)
            - 0.06 * K.sstep(-1.45, -1.62, x))


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
    """The tunnel's half width at x."""
    v = TUNNEL['hw_r'] + (TUNNEL['hw_f'] - TUNNEL['hw_r']) * _tunnel_f(x)
    return float(v) if np.ndim(v) == 0 else v


def tunnel_wall(x, y_out, z_lo, z_hi, normal, mat, r=0.04):
    """A wall across the tunnel's front end at x (left half, y 0..y_out, z_lo..z_hi) with the tunnel's section cut
    out of it (its rounded top corner included): the gearbox's front stands through it."""
    hw, top = TUNNEL['hw_f'], TUNNEL['top_f']
    b = K.Buf()
    b.extend(quad_sheet((x, 0.0, top), (0, hw - r, 0), (0, 0, z_hi - top), 1, 2, normal, mat))
    b.extend(quad_sheet((x, hw - r, top), (0, r, 0), (0, 0, z_hi - top), 1, 2, normal, mat))
    b.extend(quad_sheet((x, hw, z_lo), (0, y_out - hw, 0), (0, 0, z_hi - z_lo), 2, 4, normal, mat))
    # the corner between the tunnel's rounded edge and the square corner (hw, top)
    a = np.linspace(0.0, PI / 2, 6)
    arc = [(x, hw - r + r * math.sin(t), top - r + r * math.cos(t)) for t in a]
    corner = np.array([(x, hw, top)] + arc)
    b.extend(K.fill_loop(corner, normal, mat))
    return b


# ============================================================================================ doors
def _card_outline(inset):
    """The door's inner outline in side coordinates (x, z), inset from the cut: rear edge, sill, round the notch,
    the front edge up to the waist."""
    xa, za, R = D['ax_f'], D['arch_z'], D['door_notch_r'] + inset
    x0, x1 = D['fd_rear'] + inset, D['fd_front'] - inset
    z0, z1 = D['door_bot'] + inset, D['waist_z'] - 0.05
    zn = za + math.sqrt(max(R * R - (x1 - xa) ** 2, 0.0))
    xe = xa - math.sqrt(max(R * R - (z0 - za) ** 2, 0.0))
    a0 = math.atan2(zn - za, x1 - xa)
    a1 = math.atan2(z0 - za, xe - xa)
    aa = np.linspace(a1, a0, 10)
    arc = np.stack([xa + R * np.cos(aa), za + R * np.sin(aa)], 1)
    pts = np.vstack([[(x0, z0)], arc, [(x1, z1), (x0, z1)]])
    radii = np.zeros(len(pts))
    radii[0] = 0.03
    radii[len(arc)] = 0.02
    radii[len(arc) + 1] = 0.02
    radii[len(arc) + 2] = 0.02
    return K.ccw(K.rounded_poly(pts, radii, 0.05, arc_step=0.012))


def door_card(ex):
    b = K.Buf()
    loop = _card_outline(0.03)
    lo, hi = loop.min(0), loop.max(0)
    g = K.grid_points(lo[0], hi[0], lo[1], hi[1], 0.08, dt=0.08)
    card = K.OffsetChart(S.SIDE_L, -0.10)
    V, N, T = K.mesh_region(card, [K.Loop(K.resample_keep(loop, 0.05))], [], g, spacing=0.08)
    b.add(V, -N, T, 'plastic_int')
    P, Nn = card.to3d(loop)
    V, N, Tr = K.roll_edge(P, -Nn, side_out(P, Nn), 0.004, 0.012, 0.0, 2, closed=True)
    b.add(V, N, Tr, 'plastic_int')
    # ribbed vinyl insert: three welts, a map pocket low down, the armrest pull, the window crank, the opener
    x0, x1 = D['fd_rear'] + 0.10, D['fd_front'] - 0.16
    for zc in (0.86, 0.92, 0.98):
        xs = np.linspace(x0, x1, 5)
        P, Nn = K.OffsetChart(S.SIDE_L, -0.102).to3d(np.stack([xs, np.full(len(xs), zc)], 1))
        prof = np.array([(0.0, -0.006), (0.004, -0.003), (0.005, 0.0), (0.004, 0.003), (0.0, 0.006)])
        V, N, Tr = K.sweep(P, (0, 0, 1), prof, closed=False)
        b.add(V, N, Tr, 'plastic_int')
    pp, npk = side_pt(0.30, 0.70, -0.10)
    b.extend(K.box_buf(pp + (-0.22, -0.035, -0.07), pp + (0.22, 0.0, 0.05), 'plastic_int', 0.012, 2))
    xs = np.linspace(D['fd_rear'] + 0.18, 0.40, 6)
    P, Nn = K.OffsetChart(S.SIDE_L, -0.10).to3d(np.stack([xs, np.full(len(xs), 1.04)], 1))
    prof = K.round_profile(np.array([(0.0, -0.022), (0.05, -0.026), (0.06, 0.0), (0.045, 0.026), (0.0, 0.026)]), 0.01, 2)
    V, N, Tr = K.sweep(P, (0, 0, 1), prof, closed=False)
    b.add(V, N, Tr, 'plastic_int')
    pc, nc = side_pt(0.46, 0.99, -0.10)
    inward = -nc
    b.extend(K.cyl_buf(pc, pc + inward * 0.02, 0.022, 'chrome', 14))
    end = pc + inward * 0.02 + np.array([0.0, 0.0, -0.07])
    b.extend(K.tube_buf(np.array([pc + inward * 0.02, end]), 0.006, 'chrome', 6))
    b.extend(K.cyl_buf(end, end + inward * 0.04, 0.012, 'plastic_int', 10))
    ph, nh = side_pt(0.12, 1.09, -0.10)
    b.extend(K.box_buf(ph + (-0.05, -0.012, -0.012), ph + (0.05, 0.0, 0.012), 'chrome', 0.004, 2))
    return b


def door_extras(ex):
    """The inner window sill along the waist, the outside pull handle and key, the hinge leaves."""
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
    # the door's rear face closed up to the belt seal: its rolled edge turns into the waist there and left a slot
    # between the card's top and the seal (from the rear bench a small green corner at the door's rear frame)
    xr = D['fd_rear'] + 0.0045
    b.extend(K.box_buf((xr, 0.742, 1.10), (xr + 0.001, 0.82, 1.181), 'paint', 0.0, 1))
    # the pull handle and the key barrel near the rear edge, just under the waist
    xh, zh = D['fd_rear'] + 0.16, 1.10
    ph, nh = side_pt(xh, zh)
    b.extend(K.box_buf((-0.07, -0.007, -0.02), (0.07, 0.0015, 0.02), 'trim', 0.004, 2, xf=K.mat4_trs(ph)))
    b.extend(K.box_buf((-0.06, -0.002, -0.009), (0.06, 0.013, 0.009), 'chrome', 0.006, 2, xf=K.mat4_trs(ph)))
    pk, nk = side_pt(xh + 0.115, zh)
    b.extend(K.cyl_buf(pk - nk * 0.002, pk + nk * 0.006, 0.0095, 'chrome', 14))
    # the hinge leaves on the door's front edge (the knuckles and the body leaves are the body's)
    for zz in HINGE_Z:
        p0, n0 = side_pt(D['fd_front'] - 0.03, zz)
        b.extend(K.box_buf(p0 + (-0.05, -0.002, -0.032), p0 + (0.026, 0.010, 0.032), 'trim', 0.004, 2))
    return b


HINGE_Z = (0.92, 1.10)


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
    us = np.linspace(0, S.G_GUIDE.length, 220)
    pts, sp = S.grid_from(us, S.g_t_samples())
    V, N, T = K.mesh_region(S.CG, [K.Loop(loop)], holes, pts, spacing=sp, level=-0.035)
    return K.Buf().add(V, -N, T, 'paint')


def hood_inner(ex):
    """The bonnet's inner frame: a ring 28 mm under the skin round its edge (narrow along the hinge), open over the
    engine (the diesel six's air cleaner stands 2 cm under the skin)."""
    s = ex.cut['hood'].side('in')
    uv = s['uv']
    inner = K.offset_loop2(uv, -0.035, closed=False)
    inner[0, 1] = 0.0
    inner[-1, 1] = 0.0
    return ring_inner(S.CT, uv, inner, -0.09, 0.05, back=False).extend(lid_back(S.CT, uv))


# ============================================================================================ engine bay
def wheelhouse(xa, y0, y1, r, zc=None, z_cut=None, th=(None, None)):
    """Half cylinder liner over a wheel (axis along y, centre height zc) from y0 to y1, facing the wheel, down to
    z_cut; th limits the angle range (degrees, 0 = front, 180 = rear). Its inner wall closes it at y0."""
    zc = D['arch_z'] if zc is None else zc
    z_cut = D['bot_z'] if z_cut is None else z_cut
    a0 = math.asin(max(-1.0, min(1.0, (z_cut - zc) / r)))
    lo = a0 if th[0] is None else math.radians(th[0])
    hi = PI - a0 if th[1] is None else math.radians(th[1])
    ths = np.linspace(lo, hi, 22)
    ys = np.linspace(y0, y1, 3)
    V = np.array([(xa + r * math.cos(t), y, zc + r * math.sin(t)) for t in ths for y in ys])
    N = np.array([(-math.cos(t), 0.0, -math.sin(t)) for t in ths for y in ys])
    b = K.Buf().add(V, N, K.grid_tris(len(ths), len(ys)), 'trim')
    ring = np.array([(xa + r * math.cos(t), y0, zc + r * math.sin(t)) for t in ths])
    b.extend(K.fill_loop(ring, (0, 1, 0), 'trim'))
    return b


def engine_bay():
    """Left half of the bay: the apron on the rail, the inner fender's ledge and its wall up to the bonnet, the
    firewall with the doghouse recess for the engine's rear end, the radiator support round the grille, the wiring."""
    b = K.Buf()
    xa = D['ax_f']
    top = 1.141
    # apron (the bay's side wall) from the rail up to the ledge, finely divided: the baked AO lives on its vertices
    za = float(frame_zc(1.25)) + 0.06
    b.extend(quad_sheet((FIREWALL_X, APRON_Y, za), (RAD_X - FIREWALL_X, 0, 0), (0, 0, LEDGE_Z - za), 10, 3, (0, -1, 0), 'paint'))
    b.extend(quad_sheet((FIREWALL_X, APRON_Y, LEDGE_Z), (RAD_X - FIREWALL_X, 0, 0), (0, BAY_Y - APRON_Y, 0), 10, 3, (0, 0, 1), 'paint'))
    b.extend(quad_sheet((FIREWALL_X, BAY_Y, LEDGE_Z), (RAD_X - FIREWALL_X, 0, 0), (0, 0, top - LEDGE_Z), 10, 2, (0, -1, 0), 'paint'))
    # the apron's rolled top edge and a pressed bead along it
    b.extend(K.tube_buf(np.array([(FIREWALL_X, APRON_Y - 0.004, LEDGE_Z), (RAD_X, APRON_Y - 0.004, LEDGE_Z)]), 0.006, 'paint', 6))
    for (x0, x1) in ((FIREWALL_X + 0.06, xa - 0.14), (xa + 0.14, RAD_X - 0.06)):
        b.extend(K.tube_buf(np.array([(x0, APRON_Y, 0.80), (x1, APRON_Y, 0.80)]), 0.007, 'paint', 6))
    # firewall outboard of the doghouse (bay side), from the rail to the cowl
    b.extend(quad_sheet((FIREWALL_X, DOG_Y, 0.62), (0, BAY_Y - DOG_Y, 0), (0, 0, top - 0.62), 4, 5, (1, 0, 0), 'paint'))
    # the doghouse recess: its back wall, side wall and roof (seen from the bay)
    b.extend(tunnel_wall(DOG_X, DOG_Y, PAN_Z, DOG_TOP, (1, 0, 0), 'paint'))
    b.extend(quad_sheet((DOG_X, DOG_Y, PAN_Z), (FIREWALL_X - DOG_X, 0, 0), (0, 0, DOG_TOP - PAN_Z), 1, 6, (0, -1, 0), 'paint'))
    b.extend(quad_sheet((DOG_X, 0.0, DOG_TOP), (FIREWALL_X - DOG_X, 0, 0), (0, DOG_Y, 0), 1, 3, (0, 0, -1), 'paint'))
    b.extend(heat_shield(DOG_X, 0.27, TUNNEL['top_f'] + 0.025, 1.08))
    # the cowl's underside: a box section from the firewall to the bonnet's hinge line
    b.extend(K.box_buf((FIREWALL_X - 0.01, 0.0, top), (D['hood_rear'] + 0.004, BAY_Y, top + 0.012), 'paint', 0.004, 2))
    # radiator support round the grille: top bar, bottom bar, side post outboard of the radiator's room
    b.extend(K.box_buf((RAD_X, 0.0, 1.075), (RAD_X + 0.04, 0.47, 1.115), 'paint', 0.008, 2))
    b.extend(K.box_buf((RAD_X, 0.0, 0.56), (RAD_X + 0.04, 0.47, 0.60), 'paint', 0.008, 2))
    b.extend(K.box_buf((RAD_X, 0.43, 0.56), (RAD_X + 0.04, 0.47, 1.115), 'paint', 0.008, 2))
    b.extend(K.box_buf((RAD_X + 0.04, 0.47, 0.60), (RAD_X + 0.05, BAY_Y, 0.64), 'paint', 0.004, 1))
    b.extend(K.box_buf((RAD_X - 0.02, 0.0, 1.10), (RAD_X + 0.008, 0.035, 1.132), 'steel', 0.004, 2))
    # wiring loom along the ledge's wall to the lamp, over the support's top bar, down the firewall strip
    wy = BAY_Y - 0.012
    main = [(FIREWALL_X + 0.10, wy, 1.04), (xa, wy, 1.05), (RAD_X - 0.12, wy, 1.05), (RAD_X - 0.04, wy - 0.02, 1.02),
            (RAD_X - 0.01, 0.70, 0.98)]
    top_bar = [(RAD_X - 0.12, wy, 1.05), (RAD_X + 0.004, 0.62, 1.118), (RAD_X + 0.02, 0.30, 1.119), (RAD_X + 0.02, 0.0, 1.119)]
    fw = [(FIREWALL_X + 0.10, wy, 1.04), (FIREWALL_X + 0.012, 0.66, 0.98), (FIREWALL_X + 0.012, 0.42, 0.96),
          (FIREWALL_X + 0.012, DOG_Y + 0.01, 0.95)]
    b.extend(harness([main, top_bar, fw], [0.008, 0.006, 0.006]))
    for x in (1.30, 1.62, RAD_X - 0.18):
        b.extend(K.box_buf((x - 0.008, wy - 0.006, 1.035), (x + 0.008, BAY_Y, 1.062), 'trim', 0.002, 1))
    # brake lines from the master cylinder (on the firewall's strip) down past the ledge to the axle
    for dz in (0.0, 0.013):
        path = [(1.21, 0.55, 1.02 + dz), (1.30, 0.62, 1.00 + dz), (1.36, 0.62, LEDGE_Z + 0.005 + dz), (1.36, BAY_Y - 0.006, LEDGE_Z + 0.01 + dz)]
        b.extend(K.tube_buf(smooth_path(path, 1), 0.0026, 'steel', 4))
    return b


def engine_bay_asym():
    """Brake booster and master cylinder high on the left firewall strip (clear of the steering column), the
    battery's tray on the left ledge ahead of the wheel, the heater box on the right, the washer bottle on the right
    ledge, the snorkel's duct through the right wing, fuse and relay boxes."""
    b = K.Buf()
    fx = FIREWALL_X
    by_, bz_ = 0.55, 1.02
    V, N, T = K.lathe(np.array([(0.0, 0.0), (0.066, 0.0), (0.075, 0.011), (0.075, 0.054), (0.066, 0.064), (0.0, 0.064)]), (fx, by_, bz_), (1, 0, 0), 16)
    b.add(V, N, T, 'steel')
    b.extend(K.cyl_buf((fx + 0.064, by_, bz_), (fx + 0.21, by_, bz_), 0.02, 'alu', 12))
    b.extend(K.cyl_buf((fx + 0.14, by_, bz_ + 0.02), (fx + 0.14, by_, bz_ + 0.07), 0.026, 'ceramic', 14))
    b.extend(K.cyl_buf((fx + 0.14, by_, bz_ + 0.07), (fx + 0.14, by_, bz_ + 0.084), 0.021, 'trim', 12))
    b.extend(K.box_buf((fx, 0.66, 0.96), (fx + 0.07, BAY_Y - 0.004, 1.06), 'trim', 0.008, 2))
    # the battery's tray on the ledge, a hold-down bar
    bx, by, bz = BATTERY
    b.extend(K.box_buf((bx - 0.15, by - 0.10, bz - 0.012), (bx + 0.15, by + 0.10, bz), 'steel', 0.004, 1))
    b.extend(K.box_buf((bx - 0.155, by - 0.105, bz - 0.012), (bx - 0.145, by + 0.105, bz + 0.03), 'steel', 0.002, 1))
    # heater box and its hoses on the right firewall strip, relay box beside it
    b.extend(K.box_buf((fx, -0.62, 0.95), (fx + 0.10, -0.42, 1.10), 'plastic_int', 0.02, 2))
    for hz in (0.99, 1.05):
        b.extend(K.tube_buf(smooth_path([(fx + 0.10, -0.47, hz), (fx + 0.16, -0.47, hz - 0.005), (fx + 0.19, -0.46, hz - 0.06)]), 0.012, 'rubber', 8))
    b.extend(K.box_buf((fx, -BAY_Y + 0.004, 0.97), (fx + 0.07, -0.68, 1.05), 'trim', 0.006, 2))
    # washer bottle on the right ledge ahead of the wheel
    b.extend(K.box_buf((1.62, -0.66, LEDGE_Z), (1.80, -0.50, LEDGE_Z + 0.16), 'ceramic', 0.03, 2))
    b.extend(K.cyl_buf((1.71, -0.58, LEDGE_Z + 0.16), (1.71, -0.58, LEDGE_Z + 0.19), 0.018, 'trim', 10))
    # the snorkel's duct into the bay through the right wing (the snorkel climbs the A pillar outside)
    b.extend(K.cyl_buf((1.255, -BAY_Y - 0.03, 1.02), (1.255, -BAY_Y + 0.025, 1.02), 0.05, 'trim', 16))
    b.extend(K.cyl_buf((1.255, -BAY_Y + 0.02, 1.02), (1.255, -BAY_Y + 0.035, 1.02), 0.058, 'rubber', 16))
    b.extend(K.box_buf((1.62, BAY_Y - 0.003, 1.00), (1.70, BAY_Y - 0.001, 1.04), 'alu', 0.0, 1))
    return b


def doghouse():
    """The cab side of the engine's doghouse (left half): a box between the footwells, carpeted outside, from the
    floor up into the dash; the toe board outboard of it; the front wheel tub in the footwell."""
    b = K.Buf()
    x0, x1 = DOG_X - 0.006, FIREWALL_X
    b.extend(tunnel_wall(x0, DOG_Y, FLOOR_Z, 1.10, (-1, 0, 0), 'fabric'))
    b.extend(quad_sheet((x0, DOG_Y + 0.006, FLOOR_Z), (x1 - x0, 0, 0), (0, 0, 1.10 - FLOOR_Z), 1, 4, (0, 1, 0), 'fabric'))
    # the firewall's cabin face outboard of the doghouse, the toe board sloping up to it
    b.extend(quad_sheet((x1 - 0.006, DOG_Y, FLOOR_Z + 0.10), (0, BAY_Y - DOG_Y, 0), (0, 0, 1.06 - FLOOR_Z - 0.10), 2, 2, (-1, 0, 0), 'trim'))
    b.extend(K.box_buf((x1 - 0.17, DOG_Y + 0.006, FLOOR_Z - 0.01), (x1 - 0.005, 0.50, FLOOR_Z + 0.012), 'rubber', 0.006, 2,
                       xf=K.mat4_rot((0, 1, 0), -34, (x1 - 0.005, 0, FLOOR_Z))))
    # the front wheel tub in the footwell (outboard of the clutch) and its inner wall
    xa, zc, r = D['ax_f'], D['arch_z'], D['arch_f'] + 0.012
    a_fw = math.degrees(math.acos((x1 - xa) / r))
    a1 = 180.0 - math.degrees(math.asin((FLOOR_Z - zc) / r))
    b.extend(tub(xa, zc, r, 0.50, BAY_Y, a_fw, a1, 'fabric', True, n=12))
    ths = np.radians(np.linspace(a_fw, a1, 10))
    ring = np.array([(xa + r * math.cos(t), 0.50, zc + r * math.sin(t)) for t in ths])
    ring = np.vstack([ring, [(x1 - 0.004, 0.50, FLOOR_Z)]])
    b.extend(K.fill_loop(ring, (0, -1, 0), 'fabric'))
    return b


# ============================================================================================ underbody
# the axles' tubes start this far out from the middle: 2 cm inside the differential part's tube ends
AXLE_IN = 0.29
# the front of the differential part's pinion (its companion flange), ahead of the axle centre, and its height
DIFF_FLANGE = (0.2645, -0.024)
# the front differential part stands off the centre line on the left, where the front propshaft runs, turned with its
# pinion back towards the transfer case (the game places it from the mounts file: axles.front.diff_z = -FRONT_DIFF_Y);
# its tube stubs end in bolted flanges DIFF_STUB out from its centre (tools/blender/parts/chassis.py, Differentials:
# only the half-shafts' ends go on to 0.3125), the frame's tubes go on from those flanges' faces to the hubs
FRONT_DIFF_Y = 0.30
DIFF_STUB = 0.294
# the pinion's companion flange: its face and its bolts' heads behind the axle centre once the part is turned
PINION_FACE = 0.2455
PINION_BOLTS = 0.251
BATTERY = (1.70, 0.56, 0.932)


def axle_end(hy):
    """Where a live axle's tube ends: in the middle of its hub's carrier (knuckle())."""
    return hy - K.BRAKE_IN[1] - 0.003 - 0.015


def knuckle(hx, hy, hz, front=True):
    """A hub's carrier (left side: outer face +Y): the hub flange at the hub face with six studs and the centre cap,
    the spindle, and the carrier just inboard of the brake (front: the steering knuckle on the axle's end, taller,
    with its arm; rear: the axle's end). An object of its own, KNUCKLE_<hub>, the game hangs on the wheel's pivot."""
    # (the front knuckle is thinner: the offset front differential's left stub flange is only 1.5 cm inboard of it,
    # and its corners swing in at full lock)
    b = K.knuckle_buf(hx, hy, hz, hy + 0.012, 0.082, 6, 0.0695, 30.0, stud_r=0.006, stud_len=0.009, cap_r=0.027,
                      cap_out=0.007, carrier=(0.058, 0.016 if front else 0.032, 0.13, 0.16 if front else 0.13))
    if front:
        # the steering arm off the knuckle's foot, back to the tie rod's end: under the axle tube and the differential's
        # stub flange, so that it swings clear of them at full lock (it turns with the wheel, the tube does not)
        y1 = hy + 0.012 - K.BRAKE_IN[1] - 0.003 - 0.016
        b.extend(K.box_buf((hx - 0.17, y1 - 0.02, hz - 0.108), (hx - 0.04, y1 + 0.01, hz - 0.08), 'steel', 0.006, 2))
        b.extend(K.cyl_buf((hx - 0.16, y1 - 0.005, hz - 0.13), (hx - 0.16, y1 - 0.005, hz - 0.085), 0.014, 'steel', 10))
    return b


def underbody():
    """UNDER (left half): the ladder frame's rail and crossmember halves, both live axles' tubes (from the
    differential part's tube ends out into the hubs' carriers), the front tie rod's half, the floors' undersides,
    the wheelhouse liners. Springs, dampers, brakes and the differentials are the axles' parts."""
    b = K.Buf()
    # rail: a C section (open towards the centre) swept along the kicked-up centre line
    xs = np.unique(np.concatenate([np.linspace(2.05, 1.62, 4), np.linspace(1.55, 0.98, 4), np.linspace(0.92, 0.58, 6),
                                   np.linspace(0.40, -0.70, 3), np.linspace(-0.76, -1.10, 6), np.linspace(-1.20, -1.40, 2),
                                   np.linspace(-1.44, -1.66, 5), [-1.78]]))[::-1]
    path = np.stack([xs, np.full(len(xs), FRAME_Y), [float(frame_zc(x)) for x in xs]], 1)
    prof = np.array([(0.035, -0.06), (-0.035, -0.06), (-0.035, 0.06), (0.035, 0.06), (0.035, 0.052), (-0.027, 0.052), (-0.027, -0.052), (0.035, -0.052)])[::-1]
    V, N, T = K.sweep(path, (0, 0, 1), prof, closed=False, closed_prof=True, smooth_prof=False)
    b.add(V, N, T, 'steel')
    for e, sg in ((0, 1.0), (-1, -1.0)):
        ring = V.reshape(len(path), -1, 3)[e]
        cap = np.array([path[e] + (0, -0.035, -0.06), path[e] + (0, 0.035, -0.06), path[e] + (0, 0.035, 0.06), path[e] + (0, -0.035, 0.06)])
        b.extend(K.fill_loop(cap, (sg, 0, 0), 'steel'))
        del ring
    # crossmembers (halves): front (under the radiator), behind the engine (under the gearbox), under the rear seat
    # (behind the exhaust's silencer), ahead of and behind the rear axle, the rear one (the rails end and it stands clear of the body's underside strip and bottom
    # fillet along the rear wall, which come down to the frame's height there)
    for x, z0, z1 in ((2.00, None, None), (0.15, 0.40, PAN_Z - 0.004), (-0.72, 0.40, PAN_Z - 0.004), (-1.52, None, None), (-1.75, None, None)):
        zc = float(frame_zc(x))
        lo = zc - 0.05 if z0 is None else z0
        hi = zc + 0.05 if z1 is None else z1
        b.extend(K.box_buf((x - 0.035, 0.0, lo), (x + 0.035, FRAME_Y - 0.03, hi), 'steel', 0.004, 1))
    # the cab floor's underside (on the rails) and the rear room's raised floor, the step between them; outboard of
    # the wheelhouses' inner walls they stop at the wells (the tyres run there), small panels close the cab floor's
    # ends towards them up to the liners' lower edges
    yw = WELL_Y0 - 0.002
    xc = well_half(PAN_Z)
    # (open under the tunnel: the gearbox and the transfer case's drop housing stand up into it)
    t = TUNNEL
    b.extend(K.box_buf((CARGO_X, 0.0, PAN_Z - 0.006), (t['x0'], yw, PAN_Z), 'trim', 0.003, 1))
    b.extend(K.box_buf((t['x0'], t['hw_r'], PAN_Z - 0.006), (t['xh'], yw, PAN_Z), 'trim', 0.003, 1))
    b.extend(K.box_buf((t['xh'], t['hw_f'], PAN_Z - 0.006), (DOG_X, yw, PAN_Z), 'trim', 0.003, 1))
    b.extend(K.box_buf((D['ax_r'] + xc, yw, PAN_Z - 0.006), (D['ax_f'] - xc, 0.80, PAN_Z), 'trim', 0.003, 1))
    xe = well_half(D['bot_z'])
    for x0, x1 in ((D['ax_f'] - xe - 0.004, D['ax_f'] - xe), (D['ax_r'] + xe, D['ax_r'] + xe + 0.004)):
        b.extend(K.box_buf((x0, WELL_Y0, PAN_Z - 0.006), (x1, 0.82, D['bot_z'] + 0.002), 'trim', 0.001, 1))
    b.extend(K.box_buf((D['xr'] + 0.02, 0.0, CARGO_Z - 0.036), (CARGO_X, yw, CARGO_Z - 0.03), 'trim', 0.003, 1))
    b.extend(K.box_buf((D['xr'] + 0.02, yw, CARGO_Z - 0.036), (D['ax_r'] - well_half(CARGO_Z - 0.036) - 0.003, 0.80, CARGO_Z - 0.03), 'trim', 0.003, 1))
    b.extend(K.box_buf((CARGO_X - 0.006, 0.0, PAN_Z - 0.006), (CARGO_X, yw, CARGO_Z - 0.03), 'trim', 0.002, 1))
    # wheelhouse liners: front (from the apron out) and rear (inside the rear room's tub)
    b.extend(wheelhouse(D['ax_f'], APRON_Y + 0.003, 0.82, D['arch_f'] + 0.012, th=(None, None)))
    b.extend(wheelhouse(D['ax_r'], 0.40, 0.82, D['arch_r'] + 0.012))
    # the rear axle's tubes: from the differential part's tube ends out into the hubs' carriers (the front axle's,
    # one short and one long from the offset differential's stubs, are centre_under()'s)
    hz = D['hub_z']
    b.extend(K.cyl_buf((D['ax_r'], AXLE_IN, hz), (D['ax_r'], axle_end(D['track_r'] / 2), hz), 0.042, 'steel', 14))
    # front: the tie rod behind the axle under the engine's sump, the drag link from the steering box on the left
    # rail's front to the left knuckle's arm
    hx, hy = D['ax_f'], D['track_f'] / 2
    y_arm = hy + 0.012 - K.BRAKE_IN[1] - 0.003 - 0.016 - 0.005
    b.extend(K.tube_buf(np.array([(hx - 0.16, 0.0, hz - 0.145), (hx - 0.16, y_arm, hz - 0.145)]), 0.015, 'steel', 8))
    b.extend(K.cyl_buf((hx - 0.16, y_arm - 0.03, hz - 0.145), (hx - 0.16, y_arm + 0.002, hz - 0.145), 0.022, 'steel', 10))
    return b


def centre_under():
    """Parts on the centre line or not mirrored: the transfer case behind the gearbox with its shift rod, the rear
    propshaft back to the rear differential part's companion flange, the front propshaft forward on the left to the
    front differential's (it stands off the centre on the left, turned), the front axle's two tubes from that
    differential's stubs (a short one to the left hub, a long one to the right), the steering box and drag link
    (left), the winch under the nose, the fuel tank's straps, the fuel filler hose from the right flap."""
    b = K.Buf()
    hz = D['hub_z']
    # transfer case: a drop box behind the gearbox. Its input high at the gearbox's tail (raised with the engine), the
    # gears down a narrow housing up in the tunnel, its outputs low under the floor as the propshafts need them: the
    # rear on the centre line, the front on the left at the end of its chain housing; bolt flanges
    zi = GEARBOX[2] + 0.108
    b.extend(K.box_buf((0.22, -0.13, 0.30), (0.405, 0.16, 0.44), 'alu', 0.025, 1))
    b.extend(K.box_buf((0.24, -0.075, 0.42), (0.405, 0.075, zi + 0.06), 'alu', 0.02, 1))
    b.extend(K.box_buf((0.30, 0.15, 0.285), (0.40, 0.33, 0.40), 'alu', 0.02, 1))
    b.extend(K.box_buf((0.395, -0.075, zi - 0.065), (0.415, 0.075, zi + 0.065), 'alu', 0.006, 1))
    for (y, z) in ((-0.055, zi - 0.045), (0.055, zi - 0.045), (-0.055, zi + 0.045), (0.055, zi + 0.045)):
        b.extend(K.cyl_buf((0.405, y, z), (0.418, y, z), 0.008, 'steel', 6))
    b.extend(K.cyl_buf((0.41, 0.0, zi), (GEARBOX[0] - 0.275, 0.0, zi), 0.03, 'steel', 12))
    b.extend(K.cyl_buf((0.21, 0.0, 0.36), (0.225, 0.0, 0.36), 0.05, 'steel', 14))
    b.extend(K.cyl_buf((0.40, 0.30, 0.335), (0.425, 0.30, 0.335), 0.045, 'steel', 14))
    # the rear propshaft: from the transfer case back to the rear differential part's companion flange
    rx = D['ax_r']
    xe, ze = rx + DIFF_FLANGE[0] + 0.022, hz + DIFF_FLANGE[1]
    b.extend(K.cyl_buf((0.21, 0.0, 0.36), (xe, 0.0, ze), 0.034, 'steel', 14))
    for x, z in ((0.19, 0.36), (xe, ze)):
        b.extend(K.cyl_buf((x - 0.02, 0.0, z), (x + 0.02, 0.0, z), 0.045, 'steel', 14))
    # the front propshaft: forward on the left, beside the gearbox and the engine's starter, to the front differential's
    # pinion (the part turned: its companion flange faces back); its own flange covers the pinion's nut and sits on the
    # flange's bolt heads, a universal joint behind it
    yf, zf = FRONT_DIFF_Y, hz + DIFF_FLANGE[1]
    xp = D['ax_f'] - PINION_BOLTS
    b.extend(K.cyl_buf((xp - 0.040, yf, zf), (xp, yf, zf), 0.048, 'steel', 16))
    b.extend(K.cyl_buf((xp - 0.076, yf, zf), (xp - 0.040, yf, zf), 0.040, 'steel', 14))
    b.extend(K.cyl_buf((0.425, 0.30, 0.335), (xp - 0.076, yf, zf), 0.030, 'steel', 14))
    b.extend(K.cyl_buf((0.445 - 0.018, 0.30, 0.336), (0.445 + 0.018, 0.30, 0.336), 0.04, 'steel', 14))
    # the front axle's tubes from the offset differential's stub flanges into the hubs' carriers: the short one to the
    # left hub, the long one under the engine to the right (1 mm into the flanges; their ends in the middle of the
    # front knuckles' thinner carriers)
    xa, ye = D['ax_f'], axle_end(D['track_f'] / 2) + 0.007
    b.extend(K.cyl_buf((xa, FRONT_DIFF_Y + DIFF_STUB - 0.001, hz), (xa, ye, hz), 0.042, 'steel', 14))
    b.extend(K.cyl_buf((xa, FRONT_DIFF_Y - DIFF_STUB + 0.001, hz), (xa, -ye, hz), 0.042, 'steel', 14))
    # steering box on the left rail ahead of the front axle, its pitman arm, the drag link to the left knuckle
    b.extend(K.box_buf((1.54, FRAME_Y + 0.035, 0.50), (1.66, FRAME_Y + 0.105, 0.62), 'steel', 0.012, 2))
    b.extend(K.cyl_buf((1.60, FRAME_Y + 0.07, 0.50), (1.60, FRAME_Y + 0.07, 0.42), 0.028, 'steel', 12))
    hy = D['track_f'] / 2
    y_k = hy + 0.012 - K.BRAKE_IN[1] - 0.003 - 0.016
    b.extend(K.tube_buf(np.array([(1.60, FRAME_Y + 0.07, 0.43), (1.45, 0.50, 0.47), (D['ax_f'] + 0.06, y_k - 0.012, D['hub_z'] + 0.15)]), 0.014, 'steel', 8))
    # the steering column's lower shaft from the firewall down under the apron to the box
    p, d = steering_mount()
    a = p + d * 0.30
    b.extend(K.tube_buf(np.array([a, (1.25, 0.38, 0.70), (1.42, 0.398, 0.655), (1.55, 0.43, 0.60)]), 0.013, 'steel', 8))
    # the winch under the nose between the rail horns: its drum on a plate, the motor at the left end, the fairlead
    xw, zw = 2.03, 0.44
    b.extend(K.box_buf((1.94, -FRAME_Y + 0.03, 0.47), (2.10, FRAME_Y - 0.03, 0.485), 'steel', 0.004, 1))
    b.extend(K.cyl_buf((xw, -0.22, zw), (xw, 0.18, zw), 0.055, 'trim', 14))
    b.extend(K.cyl_buf((xw, -0.20, zw), (xw, 0.16, zw), 0.061, 'steel', 14))
    b.extend(K.cyl_buf((xw, 0.18, zw), (xw, 0.33, zw), 0.06, 'trim', 14))
    for y in (-0.235, 0.185):
        b.extend(K.box_buf((xw - 0.07, y - 0.012, zw - 0.075), (xw + 0.07, y + 0.012, 0.47), 'steel', 0.004, 1))
    xl = 2.135
    b.extend(K.box_buf((xl - 0.02, -0.16, zw - 0.07), (xl + 0.012, 0.16, zw + 0.03), 'steel', 0.008, 2))
    for y in (-0.05, 0.05):
        b.extend(K.cyl_buf((xl + 0.004, y, zw - 0.055), (xl + 0.004, y, zw + 0.015), 0.014, 'chrome', 10))
    for z in (zw - 0.062, zw + 0.022):
        b.extend(K.cyl_buf((xl + 0.004, -0.06, z), (xl + 0.004, 0.06, z), 0.014, 'chrome', 10))
    b.extend(K.tube_buf(np.array([(xw + 0.04, 0.0, zw - 0.05), (xl - 0.03, 0.0, zw - 0.02), (xl + 0.02, 0.0, zw - 0.02), (xl + 0.05, 0.0, zw - 0.06)]), 0.005, 'steel', 6))
    b.extend(K.box_buf((xl + 0.04, -0.012, zw - 0.105), (xl + 0.075, 0.012, zw - 0.06), 'paint_b', 0.006, 1))
    # the fuel tank's straps (the tank part sits between the rails behind the rear axle)
    for x in (-1.74, -1.52):
        b.extend(K.box_buf((x - 0.022, -0.40, 0.288), (x + 0.022, 0.40, 0.300), 'steel', 0.003, 1))
        for sy in (1, -1):
            b.extend(K.box_buf((x - 0.022, sy * 0.405 - 0.006, 0.288), (x + 0.022, sy * 0.405 + 0.006, float(frame_zc(x)) - 0.06), 'steel', 0.002, 1))
    # the fuel filler hose from the right flap down inside the rear quarter to the tank
    # (behind the rear room's lining, round the back of the wheel well, in under the right rail to the tank's neck)
    # (it turns in under the raised floor before it leaves the body, clear of the underside strip along the sill and
    # the rear wall)
    path = np.array([(-1.52, -0.80, 1.045), (-1.56, -0.82, 1.00), (-1.70, -0.822, 0.90), (-1.79, -0.822, 0.76), (-1.81, -0.818, 0.60),
                     (-1.80, -0.812, 0.552), (-1.775, -0.70, 0.535), (-1.765, -0.60, 0.47), (-1.75, -0.48, 0.43), (-1.72, -0.39, 0.43)])
    b.extend(K.tube_buf(smooth_path(path, 1), 0.016, 'rubber', 10))
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
    b = ex.fuel_flap()
    s = ex.cut['fuel'].side('in')
    V, N, T = K.roll_edge(s['P'], s['N'], s['E'], 0.0015, 0.006, 0.004, 2, closed=True, hem_segs=0)
    b.add(V, N, T, 'paint')
    b.extend(K.panel_back(s['P'], s['N'], s['E']))
    return b


# ============================================================================================ interior
def steering_mount():
    """(the column's end, the column direction forward-down): an upright wheel close to the upright seat."""
    ang = math.radians(28.0)
    d = np.array([math.cos(ang), 0.0, -math.sin(ang)])
    # (4.5 cm lower than it was: from her eyes the rim's centre 40 deg under the level line, as Nomad Drive's wheels
    # are, the instruments seen over the hub through the rim's upper half)
    p = np.array([0.72, DRIVER_Y, 1.005])
    return p, d


def interior(ex):
    out = {}
    L = K.Buf()
    C = K.Buf()
    # rubber floor mat (left half): from the rear seat's area to the toe board between the wheelhouses' inner walls,
    # outboard of them from well to well (the front wheelhouse stands in the footwell, the rear tub behind the seats)
    # (open under the tunnel, as the floor is)
    xm = well_half(FLOOR_Z) + 0.0015
    t = TUNNEL
    for (xa_, xb_), prof in (((CARGO_X, t['x0']), [(0.0, FLOOR_Z), (WELL_Y0, FLOOR_Z)]),
                             ((t['x0'], t['xh']), [(t['hw_r'], FLOOR_Z), (WELL_Y0, FLOOR_Z)]),
                             ((t['xh'], FIREWALL_X - 0.02), [(t['hw_f'], FLOOR_Z), (WELL_Y0, FLOOR_Z)]),
                             ((D['ax_r'] + xm, D['ax_f'] - xm), [(WELL_Y0, FLOOR_Z), (0.79, FLOOR_Z), (0.80, FLOOR_Z + 0.03)])):
        xs = np.linspace(xa_, xb_, max(2, int(round((xb_ - xa_) / 0.45)) + 1))
        rad = [0] * len(prof)
        if len(prof) == 3:
            rad[1] = 0.01
        sec = K.round_profile(np.array(prof), rad, 2)
        V = np.array([(x, y, z) for x in xs for (y, z) in sec])
        T = K.grid_tris(len(xs), len(sec))
        L.extend(face_up(recompute_normals(K.Buf().add(V, np.zeros_like(V), T, 'rubber'))))
    L.extend(doghouse())
    # the sill trim along the door's opening
    L.extend(K.box_buf((D['fd_rear'] - 0.03, 0.70, FLOOR_Z), (0.75, 0.80, FLOOR_Z + 0.06), 'plastic_int', 0.012, 2))
    # rear room: the side linings below the waist round the rear wheel tub, the tub's cover, the raised floor of
    # wooden slats behind the rear seat with its riser, the rear wall's inner strips
    L.extend(rear_room())
    # headliner under the roof (fabric) with three ribs, the grab rails along its sides
    gus = S.g_u_samples()
    row = np.stack([gus, np.full(len(gus), S.G_T[-1] - 0.02)], 1)
    Pr, _ = S.CG.to3d(row, -0.022)
    a, bb = Pr[-1], Pr[0]
    xc = np.linspace(a[0], bb[0], 26)[1:-1]
    loop = np.vstack([Pr[:, :2], np.stack([xc, np.zeros(len(xc))], 1)])
    g = K.grid_points(-1.9, 0.95, 0.0, 0.8, 0.09, dt=0.09)
    V, N, T = K.mesh_region(S.CR, [K.Loop(loop)], [], g, spacing=0.09, level=-0.022)
    L.add(V, -N, T, 'fabric')
    for x in (-1.25, -0.45, 0.35):
        L.extend(K.box_buf((x - 0.025, 0.0, D['roof_z'] - 0.042), (x + 0.025, 0.66, D['roof_z'] - 0.028), 'plastic_int', 0.006, 1))
    L.extend(K.tube_buf(np.array([(-1.60, 0.70, 1.70), (-1.58, 0.70, 1.73), (0.30, 0.70, 1.73), (0.32, 0.70, 1.70)]), 0.012, 'trim', 8))
    dash, gauges = dashboard()
    C.extend(dash)
    # pedals hanging from under the dash (the throttle beside the doghouse)
    for (py, w_, name) in ((PEDAL_Y + 0.11, 0.025, 'clutch'), (PEDAL_Y, 0.03, 'brake'), (PEDAL_Y - 0.115, 0.022, 'throttle')):
        base = np.array([0.90, py, 0.98])
        pad = np.array([{'clutch': 0.82, 'brake': 0.87, 'throttle': 0.86}[name], py, 0.66 if name != 'throttle' else 0.60])
        C.extend(K.tube_buf(np.array([base, (base + pad) / 2 + (0.025, 0, 0), pad + (0, 0, 0.04)]), 0.008, 'steel', 6))
        C.extend(K.box_buf(pad + (-0.012, -w_, -0.04 if name != 'throttle' else -0.06), pad + (0.012, w_, 0.04), 'rubber', 0.006, 2,
                           xf=K.mat4_rot((0, 1, 0), -20, pad)))
    # the steering column's shroud out of the dash
    st = steering_mount()
    C.extend(K.cyl_buf(st[0] + st[1] * 0.03, st[0] + st[1] * 0.16, 0.042, 'plastic_int', 18, r1=0.05))
    # gear lever boot ring on the tunnel, the transfer lever beside it (frame-owned: a short lever, a red knob)
    gx = GEAR_X
    V, N, T = K.lathe(np.array([(0.0, 0.012), (0.03, 0.012), (0.055, 0.004), (0.068, 0.0)])[::-1], (gx, 0.0, tunnel_h(gx) + 0.002), (0, 0, 1), 20)
    C.add(V, N, T, 'rubber')
    tx, ty = 0.50, -0.08
    V, N, T = K.lathe(np.array([(0.0, 0.008), (0.02, 0.008), (0.036, 0.0)])[::-1], (tx, ty, tunnel_h(tx) + 0.002), (0, 0, 1), 14)
    C.add(V, N, T, 'rubber')
    tip = np.array([tx - 0.04, ty, tunnel_h(tx) + 0.18])
    C.extend(K.tube_buf(np.array([(tx, ty, tunnel_h(tx) + 0.004), (tx - 0.015, ty, tunnel_h(tx) + 0.09), tip]), 0.007, 'chrome', 8))
    C.extend(K.cyl_buf(tip - (0, 0, 0.005), tip + (0.0, 0.0, 0.045), 0.017, 'plastic_int', 12, r1=0.02))
    # the tunnel's carpet cover over the gearbox and transfer case, the handbrake's slot behind the levers
    C.extend(tunnel_cover())
    # seat rails: the two buckets' runners let into the floor, the rear bench's on it
    for (sx, sy) in ((SEAT_X, DRIVER_Y), (SEAT_X, -DRIVER_Y)):
        for dy in (-0.17, 0.17):
            C.extend(K.box_buf((sx - 0.22, sy + dy - 0.015, FLOOR_Z - 0.025), (sx + 0.22, sy + dy + 0.015, FLOOR_Z + SEAT_RISE), 'steel', 0.003, 2))
    for dy in (-0.48, 0.48):
        C.extend(K.box_buf((REAR_SEAT_X - 0.15, dy - 0.02, FLOOR_Z), (REAR_SEAT_X + 0.15, dy + 0.02, FLOOR_Z + 0.03), 'steel', 0.004, 2))
    # the interior mirror on the header, sun visors, the dome lamp over the rear seat
    mp = np.array([float(S.ws_x(0, 1.70)) - 0.06, 0.0, 1.70])
    C.extend(K.box_buf(mp + (-0.01, -0.012, 0.01), mp + (0.012, 0.012, 0.075), 'plastic_int', 0.004, 2))
    C.extend(K.box_buf(mp + (-0.025, -0.11, -0.03), mp + (0.0, 0.11, 0.02), 'plastic_int', 0.012, 3))
    C.extend(K.box_buf(mp + (-0.0262, -0.10, -0.022), mp + (-0.0255, 0.10, 0.012), 'glass_dark', 0.0, 1))
    for sy in (1, -1):
        vp = np.array([float(S.ws_x(0.35, 1.76)) - 0.10, sy * 0.38, 1.765])
        C.extend(K.box_buf(vp + (-0.17, -0.20, -0.012), vp + (0.0, 0.20, 0.008), 'fabric', 0.01, 3, xf=K.mat4_rot((0, 1, 0), 10, vp)))
    lp = np.array([-0.45, 0.0, D['roof_z'] - 0.045])
    V, N, T = K.lathe(np.array([(0.0, -0.035), (0.07, -0.03), (0.09, -0.012), (0.095, 0.0)]), lp, (0, 0, 1), 16)
    C.add(V, N, T, 'ceramic')
    out['L'] = L
    out['C'] = C
    out['gauges'] = gauges
    return out


def tunnel_cover():
    """The tunnel's carpet cover (both halves): low and narrow over the transfer case's drop housing, stepping up to
    the gearbox's room ahead; the handbrake's slot on its low part behind the levers."""
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
    rear = np.array(rows[0])
    b.extend(K.fill_loop(rear, (-1, 0, 0), 'fabric'))
    # handbrake slot (the lever is the handbrake part)
    hz = tunnel_h(HB_X)
    b.extend(K.box_buf((HB_X - 0.14, -0.03, hz - 0.004), (HB_X + 0.16, 0.03, hz + 0.008), 'plastic_int', 0.006, 2))
    b.extend(K.box_buf((HB_X - 0.11, -0.012, hz + 0.004), (HB_X + 0.13, 0.012, hz + 0.0095), 'trim', 0.002, 1))
    return b


def rear_room():
    """The rear room (left half): the side lining below the waist round the wheel tub, the tub's carpeted cover (it
    leaves the suspension's room above the wheel), the raised floor's slats, the riser, the rear wall's strips."""
    b = K.Buf()
    xa, zc = D['ax_r'], D['arch_z']
    r = D['arch_r'] + 0.02
    yl = BAY_Y
    # the lining (a flat sheet just inside the side wall), its bottom edge over the tub
    a_lo = math.asin((FLOOR_Z - zc) / r)
    a_hi = math.asin((CARGO_Z - zc) / r)
    ths = np.linspace(a_lo, PI - a_hi, 18)
    arc = np.array([(xa + r * math.cos(t), zc + r * math.sin(t)) for t in ths])
    x_b = D['fd_rear'] - 0.03
    poly = np.vstack([[(x_b, FLOOR_Z)], arc, [(D['xr'] + 0.07, CARGO_Z), (D['xr'] + 0.07, D['waist_z'] - 0.01), (x_b, D['waist_z'] - 0.01)]])
    P = np.stack([poly[:, 0], np.full(len(poly), yl), poly[:, 1]], 1)
    b.extend(K.fill_loop(P, (0, -1, 0), 'plastic_int'))
    # the inner sill along its top, out under the side skin's top strip, and its front edge closed against the door's
    # opening: the room between the lining and the side skin stood open there, the grass outside showing through it
    # in a green line along the waist and down the B pillar
    xs1 = D['xr'] + 0.07
    b.extend(K.box_buf((xs1, yl - 0.012, D['waist_z'] - 0.03), (x_b, 0.83, D['waist_z'] - 0.004), 'plastic_int', 0.004, 1))
    b.extend(K.box_buf((x_b - 0.006, yl - 0.004, FLOOR_Z), (x_b + 0.002, 0.83, D['waist_z'] - 0.006), 'plastic_int', 0.002, 1))
    b.extend(K.box_buf((x_b - 0.006, yl - 0.004, D['waist_z'] - 0.01), (x_b + 0.002, 0.815, D['waist_z'] + 0.014), 'plastic_int', 0.002, 1))
    # (and on forward to 2.5 mm behind the door opening's flange, out to the side skin: between the lining's front
    # edge and the flange the slot still let a green line through along the door's rear edge, the flange being a single
    # face that looks at the door)
    xj = D['fd_rear'] - 0.0045
    b.extend(K.box_buf((x_b + 0.001, yl - 0.004, 0.54), (xj, 0.834, D['waist_z'] - 0.004), 'plastic_int', 0.0, 1))
    # (and the opening's lower rear corner: the opening's flanges are single faces looking at the door, and where the
    # rear one rounds into the sill (r 35 mm) the door's edge falls away from it, so from the rear bench the eye went
    # through the flange's back, over the sill trim and out through the hollow sill: a small green corner under the
    # door's rear edge. The flange's back is closed there, and a plate flush with its inner rim fills the corner
    # outside the door's rounded edge, down into the sill trim, behind the door's inner face wherever the door is)
    rc, rp, e, zs = 0.035, 0.029, 0.006, FLOOR_Z + 0.058
    cx, cz = D['fd_rear'] + rc, D['door_bot'] + rc
    xk = D['fd_rear'] - 0.0035
    b.extend(K.fill_loop(np.array([(xk, 0.742, zs), (xk, 0.836, zs), (xk, 0.836, cz + 0.01), (xk, 0.742, cz + 0.01)]), (-1, 0, 0), 'paint'))
    th = np.linspace(-0.5 * PI, -PI, 9)
    corner = np.vstack([[(D['fd_rear'] - e, zs), (cx, zs)],
                        np.stack([cx + rp * np.cos(th), cz + rp * np.sin(th)], 1), [(D['fd_rear'] - e, cz)]])
    b.extend(K.fill_loop(np.stack([corner[:, 0], np.full(len(corner), 0.744), corner[:, 1]], 1), (0, -1, 0), 'paint'))
    # the tub's cover: the half cylinder over the wheel from the lining in to its inner wall, the inner wall
    y0 = 0.40
    b.extend(tub(xa, zc, r, y0, yl, math.degrees(a_lo), 180.0 - math.degrees(a_hi), 'fabric', True, n=16))
    ths2 = np.linspace(a_lo, PI - a_hi, 16)
    ring = np.array([(xa + r * math.cos(t), y0, zc + r * math.sin(t)) for t in ths2])
    b.extend(K.fill_loop(ring, (0, -1, 0), 'fabric'))
    # the raised floor: slats on bearers from the riser to the rear door, the riser's face
    x0, x1 = D['xr'] + 0.03, CARGO_X
    b.extend(K.box_buf((x0, 0.0, CARGO_Z - 0.03), (x1, y0 - 0.005, CARGO_Z - 0.006), 'trim', 0.003, 1))
    for k in range(4):
        y = 0.04 + 0.09 * k
        b.extend(K.box_buf((x0, y, CARGO_Z - 0.006), (x1 - 0.004, y + 0.075, CARGO_Z), 'wood', 0.003, 1))
    b.extend(quad_sheet((CARGO_X + 0.004, 0.0, FLOOR_Z), (0, y0, 0), (0, 0, CARGO_Z - FLOOR_Z), 3, 1, (1, 0, 0), 'plastic_int'))
    # (the raised floor behind the tub, out to the lining)
    xt = xa - r * math.cos(a_hi)
    b.extend(K.box_buf((x0, y0 - 0.005, CARGO_Z - 0.03), (xt - 0.004, yl, CARGO_Z), 'wood', 0.003, 1))
    # the rear wall's inner strips beside the door's opening, below the waist
    xw = D['xr'] + 0.03
    b.extend(quad_sheet((xw, D['rd_y'] + 0.012, CARGO_Z), (0, yl - D['rd_y'] - 0.012, 0), (0, 0, D['waist_z'] - 0.01 - CARGO_Z), 2, 2, (1, 0, 0), 'plastic_int'))
    # tie-down rings in the floor
    for (x, y) in ((-1.30, 0.30), (-1.80, 0.30)):
        b.extend(K.tube_buf(np.array([(x - 0.03, y, CARGO_Z), (x - 0.03, y, CARGO_Z + 0.02), (x + 0.03, y, CARGO_Z + 0.02), (x + 0.03, y, CARGO_Z)]), 0.005, 'steel', 6))
    return b


def dashboard():
    """A plain 1980s 4x4 dash: a long padded top rail, a painted steel fascia, a small binnacle in front of the
    driver with the speedometer, the rev counter and two small dials, the radio slot in the middle with the heater
    levers over it, a mechanical inclinometer on the top rail, a grab handle in front of the passenger, a
    glovebox, vents at the ends."""
    b = K.Buf()
    fx = DASH_FACE_X

    def pad_sec(y):
        # over the binnacle the rail rises POD_RISE as its hood, its lip over the dials
        rise = POD_RISE * float(K.sstep(0.27, 0.22, abs(y - DRIVER_Y))) if y > 0 else 0.0
        return K.round_profile(np.array([(1.00, 1.122), (0.96, 1.146 + rise * 0.5), (fx + 0.03, 1.152 + rise), (fx - 0.012, 1.148 + rise), (fx - 0.024, 1.128 + rise),
                                         (fx - 0.016, 1.108 + rise), (fx + 0.01, 1.10 + rise), (1.00, 1.10)]), [0, 0.03, 0.02, 0.012, 0.01, 0.008, 0.01, 0], 1)
    ys = np.concatenate([np.linspace(-0.725, 0.05, 6), np.linspace(0.09, 0.71, 22), [0.725]])
    b.extend(extrude_y(None, ys, 'plastic_int', inside=(0.90, 0.0, 1.125), sec_fn=pad_sec))
    fas = K.round_profile(np.array([(fx, 1.10), (fx, 0.88), (fx + 0.04, 0.85), (0.98, 0.85), (0.98, 1.10)]), [0, 0.025, 0.02, 0, 0], 2)
    b.extend(extrude_y(fas, np.linspace(-0.66, 0.66, 5), 'paint', inside=(0.88, 0.0, 0.97)))
    for sy in (1.0, -1.0):
        b.extend(K.box_buf((fx - 0.004, min(sy * 0.66, sy * 0.72), 0.855), (0.98, max(sy * 0.66, sy * 0.72), 1.10), 'plastic_int', 0.02, 2))
    # glovebox and its push button (passenger)
    b.extend(K.box_buf((fx - 0.006, -0.66, 0.90), (fx + 0.004, -0.24, 1.04), 'paint', 0.01, 2))
    b.extend(K.box_buf((fx - 0.012, -0.47, 1.015), (fx - 0.004, -0.43, 1.03), 'chrome', 0.003, 1))
    # the back of the raised hood: closed behind the binnacle down to the fascia
    b.extend(K.box_buf((fx + 0.012, DRIVER_Y - 0.26, 1.05), (0.98, DRIVER_Y + 0.26, 1.098 + POD_RISE), 'plastic_int', 0.004, 1))
    # the binnacle: a box standing out of the fascia, tilted towards the eye, a hood over it
    eye = np.array(VIEW)
    pc = np.array([fx - 0.03, DRIVER_Y, 1.055 + POD_RISE])
    dn = K.unit(eye - pc)
    dn = K.unit(np.array([dn[0], 0.0, dn[2]]))
    R = K.frame_from((0, 1, 0), dn)
    b.extend(K.box_buf((-0.19, -0.066, -0.06), (0.19, 0.066, 0.0), 'trim', 0.014, 1, xf=K.mat4_trs(pc, R)))
    hood = K.mat4_trs(pc + R[:, 1] * 0.066, R)
    b.extend(K.box_buf((-0.20, -0.006, -0.06), (0.20, 0.012, 0.05), 'plastic_int', 0.008, 1, xf=hood))
    gauges = []
    for (gy, gz, r, name, big) in ((0.066, -0.004, 0.052, 'N_speed', True), (-0.066, -0.004, 0.052, 'N_rpm', True),
                                   (0.150, 0.008, 0.022, 'N_fuel', False), (-0.150, 0.008, 0.022, 'N_temp', False)):
        c = pc + R[:, 0] * gy + R[:, 1] * gz
        db, gg = dial(c, dn, r, big, 'chrome', segs=20 if big else 14)
        b.extend(db)
        gg['name'] = name
        gauges.append(gg)
    # vents at the ends and the middle
    for vy, vz in ((0.69, 1.05), (-0.69, 1.05), (0.12, 1.06), (-0.12, 1.06)):
        c = np.array([fx - 0.002, vy, vz])
        b.extend(K.box_buf(c + (-0.006, -0.05, -0.022), c + (0.004, 0.05, 0.022), 'trim', 0.006, 1))
        for k in range(-1, 2):
            b.extend(K.box_buf(c + (-0.010, -0.045, 0.012 * k - 0.002), c + (-0.004, 0.045, 0.012 * k + 0.002), 'plastic_int', 0.0, 1))
    # radio slot (the radio part sits in it) with the heater levers over it
    b.extend(K.box_buf((fx - 0.004, -0.097, 0.947), (fx + 0.002, 0.097, 1.003), 'chrome', 0.003, 2))
    b.extend(K.box_buf((fx - 0.006, -0.09, 0.952), (fx + 0.06, 0.09, 0.998), 'trim', 0.002, 1))
    b.extend(K.box_buf((fx - 0.006, -0.085, 1.02), (fx + 0.002, 0.085, 1.045), 'trim', 0.004, 1))
    for k in range(3):
        yy = -0.05 + 0.05 * k
        b.extend(K.box_buf((fx - 0.02, yy - 0.006, 1.026), (fx - 0.008, yy + 0.006, 1.039), 'plastic_int', 0.003, 1))
    # the inclinometer on the top rail before the passenger, low on its stand: a round case facing back, a weighted
    # pointer (it stood on the rail's middle, in the road's view from the driver's seat)
    ic = np.array([0.90, -0.27, 1.200])
    b.extend(K.box_buf((0.88, -0.30, 1.144), (0.93, -0.24, 1.158), 'trim', 0.004, 1))
    b.extend(K.box_buf((0.895, -0.28, 1.152), (0.91, -0.26, 1.166), 'trim', 0.003, 1))
    V, N, T = K.lathe(np.array([(0.0, -0.018), (0.052, -0.018), (0.058, -0.01), (0.058, 0.012), (0.052, 0.016), (0.046, 0.012)]), ic, (-1, 0, 0), 16)
    b.add(V, N, T, 'trim')
    V, N, T = K.lathe(np.array([(0.0, 0.004), (0.046, 0.004)]), ic, (-1, 0, 0), 16, prof_n=np.array([[0, 1.0], [0, 1.0]]))
    b.add(V, N, T, 'ceramic')
    b.extend(K.box_buf(ic + (-0.0115, -0.002, -0.042), ic + (-0.0095, 0.002, 0.004), 'trim', 0.0, 1))
    b.extend(K.box_buf(ic + (-0.0105, -0.035, -0.044), ic + (-0.0098, 0.035, -0.036), 'lens_tail', 0.0, 1))
    # the passenger's grab handle across the dash
    hz = 1.18
    b.extend(K.tube_buf(np.array([(fx + 0.02, -0.20, 1.14), (fx - 0.06, -0.22, hz), (fx - 0.06, -0.60, hz), (fx + 0.02, -0.62, 1.14)]), 0.014, 'trim', 10))
    return b, gauges
