"""Rhino: everything of the cab behind its outer skin, and the chassis. The engine bay (a deep bay over the front axle,
the big diesel's rear end in a doghouse behind the firewall, between the footwells), the door insides, the bonnet's
inner frame (BODY and the panels); the cab (INTERIOR): the flat floor high over the frame, the dash with four
dials, the pedals, the levers, the headliner with the roof hatch, the overhead console with the radio's slot and a
CB set; the ladder frame, the box's subframe, both live axles' tubes, the transfer case with coaxial outputs and the
two propshafts (the rear one over a centre bearing), the steering box and its rods, the winch under the nose
(UNDER). The hubs' carriers are objects of their own (knuckle())."""
import math
import sys

sys.dont_write_bytecode = True

import numpy as np  # noqa: E402

from frames import _kit as K  # noqa: E402
from frames import rhino as S  # noqa: E402
from frames._sedan_inner import (dial, extrude_y, face_up, harness, heat_shield, lid_back, quad_sheet,  # noqa: E402
                                 recompute_normals, ring_inner, side_out, smooth_path)

D = S.D
PI = math.pi
FLOOR_Z = 1.00           # cab floor (rubber mat top), high over the frame
PAN_Z = 0.96             # underside of the cab floor
FIREWALL_X = 1.42        # the firewall outboard of the doghouse (and the toe boards)
DOG_X = 1.20             # the doghouse: the diesel's rear end behind the firewall, between the footwells
DOG_Y = 0.40
DOG_TOP = 1.55
RAD_X = 2.555            # the radiator support (its bars from here forward, just ahead of the radiator's core)
APRON_Y = 0.48           # the bay's side walls (the wheelhouses' inner walls, inboard of the struts)
LEDGE_Z = 1.10           # the inner fender's top over the wheelhouse (the battery stands on it)
BAY_Y = 0.968            # the inner face of the wings above the ledge (just outboard of the bonnet's edge)
SEAT_X = 0.70            # seat floor attachment x: the stock bucket's eye at (0.54, 1.93)
DRIVER_Y = 0.60
PEDAL_Y = 0.58           # the brake pedal's line: the clutch outboard of it, the throttle beside the doghouse
EYE = (SEAT_X - 0.16, DRIVER_Y, FLOOR_Z + 0.03 + 0.90)
DASH_FACE_X = 1.24
GEAR_X = 1.02            # the gear lever on the floor between the seats (a remote linkage to the gearbox under it)
GEAR_Y = 0.16
HB_X = 0.72              # the handbrake lever on the floor between the seats, behind the levers
TL = (0.98, -0.07)       # the transfer case's low-range lever on the other side of the gear lever
FRAME_Y = 0.45           # ladder frame rails (centre)
RAIL_Z = (0.62, 0.82)    # their bottom and top
RUNNER_Z = 1.08          # the box's subframe runners on the rails: their top
# the engine stands over the front axle, high enough that every engine the room takes clears the axle (its tubes,
# the differential in the middle, the propshaft under the sump) at rest; the room's top 2 cm under the bonnet's skin
# and the doghouse's roof, from the doghouse's back wall to 1 cm short of the radiator's core
ENGINE = (1.75, 0.0, 0.58)
ENGINE_ROOM = ((-0.53, -0.40, 0.0), (0.60, 0.40, 0.95))
# the gearbox behind it under the cab floor (it needs no tunnel), in a room every gearbox fits
GEARBOX = (1.036, 0.0, 0.66)
GEARBOX_ROOM = ((-0.31, -0.13, 0.0), (0.205, 0.13, 0.235))
RADIATOR = (2.51, 0.0, 0.86)
RADIATOR_ROOM = ((-0.15, -0.43, 0.0), (0.05, 0.43, 0.52))
BATTERY = (2.20, 0.78, LEDGE_Z + 0.012)
# the fuel tank between the rails behind the rear axle, under the box (its filler on the right, behind the wheel)
FUEL_TANK = (-2.58, 0.0, 0.56)
FUEL_ROOM = ((-0.51, -0.40, 0.0), (0.56, 0.42, 0.43))
EXHAUST = (1.12, -0.35, 0.50)
# the transfer case behind the gearbox: input high at the gearbox's tail, both outputs low on the centre line
TC_X = (0.46, 0.70)
TC_W = 0.12
TC_OUT_Z = 0.50
CB_X = -0.42             # the rear propshaft's centre bearing
# the roof hatch: its centre x, y and radius (a round hatch over the middle of the cab, behind the console)
HATCH = (0.60, 0.0, 0.29)
# the overhead console under the roof's front: its x range, half width, bottom; the radio's slot in its rear face
CONSOLE = (0.92, 1.20, 0.24, 2.43)
RADIO = (CONSOLE[0], 0.10, 2.476)


def side_pt(x, z, level=0.0):
    P, N = S.SIDE_L.to3d(np.array([[x, z]]))
    return P[0] + N[0] * level, N[0]


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
    aa = np.linspace(a1, a0, 6)
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
    g = K.grid_points(lo[0], hi[0], lo[1], hi[1], 0.09, dt=0.09)
    card = K.OffsetChart(S.SIDE_L, -0.10)
    V, N, T = K.mesh_region(card, [K.Loop(K.resample_keep(loop, 0.05))], [], g, spacing=0.09)
    b.add(V, -N, T, 'plastic_int')
    P, Nn = card.to3d(loop)
    V, N, Tr = K.roll_edge(P, -Nn, side_out(P, Nn), 0.004, 0.012, 0.0, 2, closed=True)
    b.add(V, N, Tr, 'plastic_int')
    # ribbed vinyl insert: three welts, a map pocket low down, the armrest pull, the window crank, the opener
    x0, x1 = D['fd_rear'] + 0.12, D['fd_front'] - 0.20
    for zc in (1.20, 1.26, 1.32):
        xs = np.linspace(x0, x1, 5)
        P, Nn = K.OffsetChart(S.SIDE_L, -0.102).to3d(np.stack([xs, np.full(len(xs), zc)], 1))
        prof = np.array([(0.0, -0.006), (0.004, -0.003), (0.005, 0.0), (0.004, 0.003), (0.0, 0.006)])
        V, N, Tr = K.sweep(P, (0, 0, 1), prof, closed=False)
        b.add(V, N, Tr, 'plastic_int')
    pp, npk = side_pt(0.62, 1.00, -0.10)
    b.extend(K.box_buf(pp + (-0.30, -0.035, -0.07), pp + (0.30, 0.0, 0.05), 'plastic_int', 0.012, 2))
    xs = np.linspace(D['fd_rear'] + 0.20, 0.70, 6)
    P, Nn = K.OffsetChart(S.SIDE_L, -0.10).to3d(np.stack([xs, np.full(len(xs), 1.40)], 1))
    prof = K.round_profile(np.array([(0.0, -0.022), (0.05, -0.026), (0.06, 0.0), (0.045, 0.026), (0.0, 0.026)]), 0.01, 2)
    V, N, Tr = K.sweep(P, (0, 0, 1), prof, closed=False)
    b.add(V, N, Tr, 'plastic_int')
    pc, nc = side_pt(0.86, 1.34, -0.10)
    inward = -nc
    b.extend(K.cyl_buf(pc, pc + inward * 0.02, 0.024, 'chrome', 14))
    end = pc + inward * 0.02 + np.array([0.0, 0.0, -0.08])
    b.extend(K.tube_buf(np.array([pc + inward * 0.02, end]), 0.006, 'chrome', 6))
    b.extend(K.cyl_buf(end, end + inward * 0.04, 0.012, 'plastic_int', 10))
    ph, nh = side_pt(0.34, 1.46, -0.10)
    b.extend(K.box_buf(ph + (-0.06, -0.012, -0.013), ph + (0.06, 0.0, 0.013), 'chrome', 0.004, 2))
    return b


def door_extras(ex):
    """The inner window sill along the waist, the outside pull handle and key, the hinge leaves."""
    b = K.Buf()
    jl = ex.jl
    xa, xb = D['fd_front'] - 0.004, D['fd_rear'] + 0.004
    uv, P, NL, NG, _ = jl.between(float(S.u_of_x(xa)), float(S.u_of_x(xb)))
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
    # the pull handle and the key barrel near the rear edge, just under the waist
    xh, zh = D['fd_rear'] + 0.17, 1.47
    ph, nh = side_pt(xh, zh)
    b.extend(K.box_buf((-0.08, -0.007, -0.022), (0.08, 0.0015, 0.022), 'trim', 0.004, 2, xf=K.mat4_trs(ph)))
    b.extend(K.box_buf((-0.07, -0.002, -0.010), (0.07, 0.014, 0.010), 'chrome', 0.006, 2, xf=K.mat4_trs(ph)))
    pk, nk = side_pt(xh + 0.13, zh)
    b.extend(K.cyl_buf(pk - nk * 0.002, pk + nk * 0.006, 0.0095, 'chrome', 14))
    # the hinge leaves on the door's front edge (the knuckles and the body leaves are the body's)
    for zz in HINGE_Z:
        p0, n0 = side_pt(D['fd_front'] - 0.035, zz)
        b.extend(K.box_buf(p0 + (-0.06, -0.002, -0.036), p0 + (0.03, 0.011, 0.036), 'trim', 0.004, 2))
    return b


HINGE_Z = (1.06, 1.44)


def door_frame_inner(ex):
    c = ex.cut['doorG']
    s = c.side('in')
    uvp = S.CG.to2d(s['P'])
    gs = ex.gs
    xs = np.linspace(s['uv'][-1, 0], s['uv'][0, 0], 14)[1:-1]
    Pj = np.array([gs.j_point(x)[0] for x in xs])
    loop = np.vstack([uvp, S.CG.to2d(Pj)])
    holes = []
    for name, poly in ex.cut['winG']:
        P, N = S.SIDE_G.to3d(poly)
        holes.append(K.Loop(S.CG.to2d(P)))
    us = np.linspace(0, S.G_GUIDE.length, 240)
    pts, sp = S.grid_from(us, S.g_t_samples())
    V, N, T = K.mesh_region(S.CG, [K.Loop(loop)], holes, pts, spacing=sp, level=-0.035)
    return K.Buf().add(V, -N, T, 'paint')


def hood_inner(ex):
    """The bonnet's inner frame: a ring 28 mm under the skin round its edge (narrow along the hinge), open over the
    engine; the skin's inside, so the opened bonnet is not see-through."""
    s = ex.cut['hood'].side('in')
    uv = s['uv']
    inner = K.offset_loop2(uv, -0.035, closed=False)
    inner[0, 1] = 0.0
    inner[-1, 1] = 0.0
    return ring_inner(S.CT, uv, inner, -0.09, 0.05, back=False).extend(lid_back(S.CT, uv))


# ============================================================================================ engine bay
def wheelhouse(xa, y0, y1, r, zc=None, z_cut=None, th=(None, None), n=24, mat='trim'):
    """Half cylinder liner over a wheel (axis along y, centre height zc) from y0 to y1, facing the wheel, down to
    z_cut; th limits the angle range (degrees, 0 = front, 180 = rear). Its inner wall closes it at y0."""
    zc = D['arch_z'] if zc is None else zc
    z_cut = D['bot_z'] if z_cut is None else z_cut
    a0 = math.asin(max(-1.0, min(1.0, (z_cut - zc) / r)))
    lo = a0 if th[0] is None else math.radians(th[0])
    hi = PI - a0 if th[1] is None else math.radians(th[1])
    ths = np.linspace(lo, hi, n)
    ys = np.linspace(y0, y1, 3)
    V = np.array([(xa + r * math.cos(t), y, zc + r * math.sin(t)) for t in ths for y in ys])
    N = np.array([(-math.cos(t), 0.0, -math.sin(t)) for t in ths for y in ys])
    b = K.Buf().add(V, N, K.grid_tris(len(ths), len(ys)), mat)
    ring = np.array([(xa + r * math.cos(t), y0, zc + r * math.sin(t)) for t in ths])
    b.extend(K.fill_loop(ring, (0, 1, 0), mat))
    return b


def engine_bay():
    """Left half of the bay: the apron (the wheelhouse's inner wall) from the rail up to the ledge over the wheel,
    the ledge, the wing's inner face up to the bonnet, the firewall outboard of the doghouse, the doghouse from the
    bay, the cowl's underside, the radiator support round the grille, the wiring."""
    b = K.Buf()
    xa = D['ax_f']
    top = 1.535
    z_r = RAIL_Z[1]
    # apron, ledge and the wing's inner face, finely divided: the baked AO lives on their vertices
    b.extend(quad_sheet((FIREWALL_X, APRON_Y, z_r), (RAD_X - FIREWALL_X, 0, 0), (0, 0, LEDGE_Z - z_r), 12, 4, (0, -1, 0), 'paint'))
    b.extend(quad_sheet((FIREWALL_X, APRON_Y, LEDGE_Z), (RAD_X - FIREWALL_X, 0, 0), (0, BAY_Y - APRON_Y, 0), 12, 4, (0, 0, 1), 'paint'))
    b.extend(quad_sheet((FIREWALL_X, BAY_Y, LEDGE_Z), (RAD_X - FIREWALL_X, 0, 0), (0, 0, top - LEDGE_Z), 12, 3, (0, -1, 0), 'paint'))
    # the apron's rolled top edge and a pressed bead along it
    b.extend(K.tube_buf(np.array([(FIREWALL_X, APRON_Y - 0.004, LEDGE_Z), (RAD_X, APRON_Y - 0.004, LEDGE_Z)]), 0.007, 'paint', 6))
    for (x0, x1) in ((FIREWALL_X + 0.07, xa - 0.16), (xa + 0.16, RAD_X - 0.07)):
        b.extend(K.tube_buf(np.array([(x0, APRON_Y, 0.96), (x1, APRON_Y, 0.96)]), 0.008, 'paint', 6))
    # firewall outboard of the doghouse (bay side), from the rail to the cowl
    b.extend(quad_sheet((FIREWALL_X, DOG_Y, z_r), (0, BAY_Y - DOG_Y, 0), (0, 0, top - z_r), 5, 6, (1, 0, 0), 'paint'))
    # the doghouse seen from the bay: its back wall, side wall and roof, from the cab floor up (the engine and the
    # gearbox stand open under the floor)
    b.extend(quad_sheet((DOG_X, 0.0, PAN_Z), (0, DOG_Y, 0), (0, 0, DOG_TOP - PAN_Z), 3, 4, (1, 0, 0), 'paint'))
    b.extend(quad_sheet((DOG_X, DOG_Y, PAN_Z), (FIREWALL_X - DOG_X, 0, 0), (0, 0, DOG_TOP - PAN_Z), 2, 4, (0, -1, 0), 'paint'))
    b.extend(quad_sheet((DOG_X, 0.0, DOG_TOP), (FIREWALL_X - DOG_X, 0, 0), (0, DOG_Y, 0), 2, 3, (0, 0, -1), 'paint'))
    b.extend(heat_shield(DOG_X, 0.33, PAN_Z + 0.05, DOG_TOP - 0.05))
    # the cowl's underside: a box section from the firewall to the bonnet's hinge line
    b.extend(K.box_buf((FIREWALL_X - 0.01, 0.0, top), (D['hood_rear'] + 0.004, BAY_Y, top + 0.012), 'paint', 0.004, 2))
    # radiator support round the grille: the bottom bar on the rails, the top bar, the side post outboard of the
    # radiator's room, ties out to the wings
    zr0, zr1 = RADIATOR[2] - 0.04, RADIATOR[2] + RADIATOR_ROOM[1][2] + 0.03
    b.extend(K.box_buf((RAD_X, 0.0, zr1), (RAD_X + 0.03, 0.47, zr1 + 0.05), 'paint', 0.008, 2))
    b.extend(K.box_buf((RAD_X, 0.0, zr0), (RAD_X + 0.03, 0.47, zr0 + 0.04), 'paint', 0.008, 2))
    b.extend(K.box_buf((RAD_X, 0.44, zr0), (RAD_X + 0.03, 0.48, zr1 + 0.05), 'paint', 0.008, 2))
    b.extend(K.box_buf((RAD_X + 0.03, 0.47, zr0 + 0.10), (RAD_X + 0.04, BAY_Y, zr0 + 0.14), 'paint', 0.004, 1))
    b.extend(K.box_buf((RAD_X + 0.03, 0.47, zr1), (RAD_X + 0.04, BAY_Y, zr1 + 0.04), 'paint', 0.004, 1))
    b.extend(K.box_buf((RAD_X - 0.02, 0.0, zr1 + 0.05), (RAD_X + 0.008, 0.035, zr1 + 0.085), 'steel', 0.004, 2))
    # wiring loom along the wing's inner face to the lamp, over the support's top bar, down the firewall strip
    wy = BAY_Y - 0.012
    main = [(FIREWALL_X + 0.10, wy, 1.30), (xa, wy, 1.31), (RAD_X - 0.12, wy, 1.31), (RAD_X - 0.04, wy - 0.02, 1.27),
            (RAD_X - 0.01, 0.84, 1.22)]
    top_bar = [(RAD_X - 0.12, wy, 1.31), (RAD_X + 0.004, 0.80, zr1 + 0.055), (RAD_X + 0.015, 0.30, zr1 + 0.056), (RAD_X + 0.015, 0.0, zr1 + 0.056)]
    fw = [(FIREWALL_X + 0.10, wy, 1.30), (FIREWALL_X + 0.012, 0.86, 1.24), (FIREWALL_X + 0.012, 0.60, 1.22),
          (FIREWALL_X + 0.012, DOG_Y + 0.01, 1.21)]
    b.extend(harness([main, top_bar, fw], [0.009, 0.006, 0.006]))
    for x in (1.62, 2.05, RAD_X - 0.20):
        b.extend(K.box_buf((x - 0.008, wy - 0.006, 1.295), (x + 0.008, BAY_Y, 1.325), 'trim', 0.002, 1))
    # brake pipes from the master cylinder (on the firewall's strip) along the ledge, down the apron to the axle
    for dz in (0.0, 0.013):
        path = [(1.66, 0.66, 1.30 + dz), (1.74, 0.62, 1.20 + dz), (1.76, 0.58, LEDGE_Z + 0.006 + dz), (1.78, 0.52, LEDGE_Z + 0.006 + dz),
                (1.80, APRON_Y - 0.008, LEDGE_Z - 0.03 + dz), (1.80, APRON_Y - 0.008, 0.90 + dz)]
        b.extend(K.tube_buf(smooth_path(path, 1), 0.0028, 'steel', 4))
    return b


def engine_bay_asym():
    """The brake booster and master cylinder high on the left firewall strip, the battery's tray on the left ledge
    ahead of the wheel, the heater box and the washer bottle on the right, fuse and relay boxes, the bay's plate."""
    b = K.Buf()
    fx = FIREWALL_X
    by_, bz_ = 0.66, 1.30
    V, N, T = K.lathe(np.array([(0.0, 0.0), (0.085, 0.0), (0.095, 0.012), (0.095, 0.07), (0.085, 0.082), (0.0, 0.082)]), (fx, by_, bz_), (1, 0, 0), 18)
    b.add(V, N, T, 'steel')
    b.extend(K.cyl_buf((fx + 0.082, by_, bz_), (fx + 0.25, by_, bz_), 0.022, 'alu', 12))
    b.extend(K.cyl_buf((fx + 0.16, by_, bz_ + 0.02), (fx + 0.16, by_, bz_ + 0.08), 0.03, 'ceramic', 14))
    b.extend(K.cyl_buf((fx + 0.16, by_, bz_ + 0.08), (fx + 0.16, by_, bz_ + 0.095), 0.024, 'trim', 12))
    b.extend(K.box_buf((fx, 0.84, 1.22), (fx + 0.08, BAY_Y - 0.004, 1.34), 'trim', 0.008, 2))
    # the battery's tray on the ledge, its end stops
    bx, by, bz = BATTERY
    b.extend(K.box_buf((bx - 0.16, by - 0.11, bz - 0.012), (bx + 0.16, by + 0.11, bz), 'steel', 0.004, 1))
    b.extend(K.box_buf((bx - 0.165, by - 0.115, bz - 0.012), (bx - 0.155, by + 0.115, bz + 0.035), 'steel', 0.002, 1))
    b.extend(K.box_buf((bx + 0.155, by - 0.115, bz - 0.012), (bx + 0.165, by + 0.115, bz + 0.035), 'steel', 0.002, 1))
    # heater box and its hoses on the right firewall strip, relay box beside it
    b.extend(K.box_buf((fx, -0.74, 1.18), (fx + 0.11, -0.50, 1.36), 'plastic_int', 0.02, 2))
    for hz in (1.22, 1.29):
        b.extend(K.tube_buf(smooth_path([(fx + 0.11, -0.56, hz), (fx + 0.18, -0.56, hz - 0.005), (fx + 0.22, -0.54, hz - 0.07)]), 0.013, 'rubber', 8))
    b.extend(K.box_buf((fx, -BAY_Y + 0.004, 1.24), (fx + 0.08, -0.84, 1.34), 'trim', 0.006, 2))
    # washer bottle on the right ledge ahead of the wheel
    b.extend(K.box_buf((2.12, -0.92, LEDGE_Z), (2.32, -0.74, LEDGE_Z + 0.19), 'ceramic', 0.03, 2))
    b.extend(K.cyl_buf((2.22, -0.83, LEDGE_Z + 0.19), (2.22, -0.83, LEDGE_Z + 0.22), 0.02, 'trim', 10))
    # the identification plate on the left wing's inner face
    b.extend(K.box_buf((1.94, BAY_Y - 0.003, 1.30), (2.04, BAY_Y - 0.001, 1.35), 'alu', 0.0, 1))
    return b


def doghouse():
    """The cab side of the engine's doghouse (left half): an open shell over the engine's rear end between the
    footwells, carpet outside, dark insulation inside, open towards the bay; the toe board outboard of it and the
    firewall's cabin face up under the dash."""
    b = K.Buf()
    for lvl, mat, sg in ((0.0, 'fabric', 1.0), (0.012, 'trim', -1.0)):
        b.extend(_cover_shell(DOG_X, FIREWALL_X - 0.004, DOG_Y, DOG_TOP, lvl, mat, sg, 0.06))
    b.extend(quad_sheet((FIREWALL_X - 0.006, DOG_Y, FLOOR_Z + 0.09), (0, 1.03 - DOG_Y, 0), (0, 0, 1.31 - FLOOR_Z - 0.09), 3, 2, (-1, 0, 0), 'trim'))
    # the toe board: from the floor at its rear edge up to the firewall
    xt = FIREWALL_X - 0.18
    b.extend(K.box_buf((xt, DOG_Y + 0.006, FLOOR_Z - 0.012), (FIREWALL_X - 0.01, 1.00, FLOOR_Z + 0.01), 'rubber', 0.006, 2,
                       xf=K.mat4_rot((0, 1, 0), -34, (xt, 0, FLOOR_Z))))
    return b


def _cover_shell(x0, x_end, hw, top, lvl, mat, sg, r):
    """One skin of a cover over the engine (left half; open at the front and at the floor): the flat top, then the
    rounded rim and the wall swept along the core outline in plan (the rear edge, a corner fan, the side). lvl
    insets the skin (the insulation inside); sg = +1 outward normals, -1 inward."""
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


# ============================================================================================ underbody
# the axles' tubes start in the differential part's stub flanges (tools/blender/parts/chassis.py, Differentials:
# its flanges' faces 0.294 out from its centre, only the half-shafts' ends go on to 0.3125) and go on into the hubs'
# carriers; the front differential sits in the middle of its axle (the propshaft runs under the engine's sump to
# it), turned by the game with its pinion back towards the gearbox
DIFF_STUB = 0.294
TUBE_R = 0.048
# the rear pinion's companion flange (its front, ahead of the axle centre) and its height below it
DIFF_FLANGE = (0.2645, -0.024)
# the front pinion's flange once the part is turned: its bolts' heads behind the axle centre
PINION_BOLTS = 0.251


def axle_end(hy):
    """Where a live axle's tube ends: in the middle of its hub's carrier (knuckle())."""
    return hy - K.BRAKE_IN[1] - 0.003 - 0.015


def knuckle(hx, hy, hz, front=True):
    """A hub's carrier (left side: outer face +Y): the hub flange at the hub face with eight studs on the truck
    wheel's circle and the centre cap, the spindle, and the carrier just inboard of the brake (front: the steering
    knuckle on the axle's end with its king pin bosses and the steering arm under the tube; rear: the axle's end).
    An object of its own, KNUCKLE_<hub>, the game hangs on the wheel's pivot."""
    b = K.knuckle_buf(hx, hy, hz, hy + 0.012, 0.098, 8, 0.0825, 22.5, stud_r=0.007, stud_len=0.008, cap_r=0.042,
                      cap_out=0.007, carrier=(0.07, 0.02 if front else 0.035, 0.15 if front else 0.14, 0.17 if front else 0.14),
                      segs=18)
    if front:
        y1 = hy - K.BRAKE_IN[1] - 0.003
        for z0, z1 in ((hz + 0.17, hz + 0.20), (hz - 0.18, hz - 0.15)):
            b.extend(K.cyl_buf((hx, y1 - 0.012, z0), (hx, y1 - 0.012, z1), 0.042, 'steel', 14))
        # the steering arm off the knuckle's foot, back to the tie rod's end, under the axle's tube and clear of the
        # strut above it (it turns with the wheel, the tube does not)
        ya = y1 - 0.016
        b.extend(K.box_buf((hx - 0.18, ya - 0.02, hz - 0.125), (hx - 0.04, ya + 0.01, hz - 0.095), 'steel', 0.006, 2))
        b.extend(K.cyl_buf((hx - 0.16, ya - 0.005, hz - 0.15), (hx - 0.16, ya - 0.005, hz - 0.10), 0.015, 'steel', 10))
    return b


def rail_xs():
    return np.unique(np.concatenate([np.linspace(2.64, 2.40, 3), np.linspace(2.30, 1.30, 3), np.linspace(1.20, -1.20, 3),
                                     np.linspace(-1.30, -3.16, 3)]))[::-1]


CROSSMEMBERS = (2.58, 2.42, 0.40, CB_X, -1.30, -1.96, -3.13)


def underbody():
    """UNDER (left half): the ladder frame's rail and crossmember halves, the box's subframe runner on it, the cab's
    mounts and floor underside, both live axles' tubes (from the differential part's stub flanges into the hubs'
    carriers), the front tie rod's half, the front wheelhouse liner, the tow shackle's bracket."""
    b = K.Buf()
    z0, z1 = RAIL_Z
    zc, hh = 0.5 * (z0 + z1), 0.5 * (z1 - z0)
    # rail: a C section (open towards the centre) swept along x
    xs = rail_xs()
    path = np.stack([xs, np.full(len(xs), FRAME_Y), np.full(len(xs), zc)], 1)
    prof = np.array([(0.035, -hh), (-0.035, -hh), (-0.035, hh), (0.035, hh), (0.035, hh - 0.008), (-0.027, hh - 0.008), (-0.027, -hh + 0.008), (0.035, -hh + 0.008)])[::-1]
    V, N, T = K.sweep(path, (0, 0, 1), prof, closed=False, closed_prof=True, smooth_prof=False)
    b.add(V, N, T, 'steel')
    for e, sg in ((0, 1.0), (-1, -1.0)):
        cap = np.array([path[e] + (0, -0.035, -hh), path[e] + (0, 0.035, -hh), path[e] + (0, 0.035, hh), path[e] + (0, -0.035, hh)])
        b.extend(K.fill_loop(cap, (sg, 0, 0), 'steel'))
    # crossmembers (halves): under the radiator, ahead of the engine, at the transfer case, the centre bearing's,
    # ahead of the rear axle, ahead of the tank, the rear one
    for x in CROSSMEMBERS:
        b.extend(K.box_buf((x - 0.035, 0.0, zc - 0.07), (x + 0.035, FRAME_Y - 0.03, zc + 0.07), 'steel', 0.004, 1))
    # the box's subframe runner on the rail (an I beam)
    rz0, rz1 = z1, RUNNER_Z
    rx0, rx1 = D['bx_r'] + 0.01, D['bx_f'] + 0.03
    for (y0, y1, za, zb) in ((FRAME_Y - 0.035, FRAME_Y + 0.035, rz0, rz0 + 0.012), (FRAME_Y - 0.035, FRAME_Y + 0.035, rz1 - 0.012, rz1),
                             (FRAME_Y - 0.005, FRAME_Y + 0.005, rz0 + 0.012, rz1 - 0.012)):
        b.extend(K.box_buf((rx0, y0, za), (rx1, y1, zb), 'steel', 0.002, 1))
    for x in np.linspace(rx0 + 0.25, rx1 - 0.25, 5):
        b.extend(K.box_buf((x - 0.004, FRAME_Y - 0.035, rz0 + 0.012), (x + 0.004, FRAME_Y + 0.035, rz1 - 0.012), 'steel', 0.0, 1))
    # the cab's rubber mounts on the rails and its floor's underside (open where the doghouse is)
    for x in (0.18, 1.12):
        b.extend(K.box_buf((x - 0.06, FRAME_Y - 0.04, z1), (x + 0.06, FRAME_Y + 0.04, z1 + 0.04), 'steel', 0.004, 1))
        b.extend(K.box_buf((x - 0.04, FRAME_Y - 0.03, z1 + 0.04), (x + 0.04, FRAME_Y + 0.03, PAN_Z - 0.004), 'rubber', 0.006, 1))
    b.extend(K.box_buf((D['xr'] + 0.03, 0.0, PAN_Z - 0.006), (DOG_X, 1.06, PAN_Z), 'trim', 0.003, 1))
    b.extend(K.box_buf((DOG_X, DOG_Y - 0.02, PAN_Z - 0.006), (FIREWALL_X, 1.06, PAN_Z), 'trim', 0.003, 1))
    # the front wheelhouse liner in the wing (its inner wall 3 mm outboard of the apron), down to the body's bottom
    b.extend(wheelhouse(D['ax_f'], APRON_Y + 0.003, D['hw'] - 0.012, D['arch_f'] + 0.02))
    # the axles' tubes: from the differential part's stub flanges into the hubs' carriers; a pad on each for the
    # spring, a bump stop under the rail over it
    hz = D['hub_z']
    for xa, ye in ((D['ax_f'], axle_end(D['track_f'] / 2) + 0.007), (D['ax_r'], axle_end(D['track_r'] / 2))):
        b.extend(K.cyl_buf((xa, DIFF_STUB - 0.001, hz), (xa, ye, hz), TUBE_R, 'steel', 16))
        b.extend(K.box_buf((xa - 0.04, FRAME_Y - 0.03, z0 - 0.06), (xa + 0.04, FRAME_Y + 0.03, z0), 'rubber', 0.008, 2))
    # front: the tie rod behind the axle under the differential's snout (to the knuckles' arms)
    hx, hy = D['ax_f'], D['track_f'] / 2
    y_arm = hy - K.BRAKE_IN[1] - 0.003 - 0.016 - 0.005
    b.extend(K.tube_buf(np.array([(hx - 0.16, 0.0, hz - 0.15), (hx - 0.16, y_arm, hz - 0.15)]), 0.016, 'steel', 8))
    b.extend(K.cyl_buf((hx - 0.16, y_arm - 0.035, hz - 0.15), (hx - 0.16, y_arm + 0.002, hz - 0.15), 0.024, 'steel', 10))
    # the front tow shackle's bracket under the rail's horn
    b.extend(K.box_buf((2.50, FRAME_Y - 0.03, z0 - 0.08), (2.62, FRAME_Y + 0.03, z0), 'steel', 0.006, 2))
    return b


def centre_under():
    """Parts on the centre line or not mirrored: the transfer case behind the gearbox, the propshafts (front: under
    the gearbox and the sump to the turned front differential's pinion; rear: over a centre bearing to the rear
    differential's), the steering box on the left rail ahead of the wheel, its column and drag link, the winch under
    the nose, the front tow shackles, the fuel tank's straps, the filler hose from the right side's pocket, the rear
    crossmember's tow hook."""
    b = K.Buf()
    hz = D['hub_z']
    z0, z1 = RAIL_Z
    # transfer case: a drop box, its input high at the gearbox's tail, the gears down a narrow housing, both outputs
    # low on the centre line (front and rear), bolt flanges
    xa_, xb_ = TC_X
    zi = GEARBOX[2] + 0.108
    zo = TC_OUT_Z
    w = TC_W
    b.extend(K.box_buf((xa_, -w, zo - 0.09), (xb_, w, zo + 0.10), 'alu', 0.025, 2))
    b.extend(K.box_buf((xa_ + 0.03, -0.08, zo + 0.08), (xb_, 0.08, zi + 0.07), 'alu', 0.02, 2))
    b.extend(K.box_buf((xb_ - 0.01, -0.075, zi - 0.065), (xb_ + 0.008, 0.075, zi + 0.065), 'alu', 0.006, 1))
    for (y, z) in ((-0.055, zi - 0.045), (0.055, zi - 0.045), (-0.055, zi + 0.045), (0.055, zi + 0.045)):
        b.extend(K.cyl_buf((xb_ - 0.002, y, z), (xb_ + 0.012, y, z), 0.008, 'steel', 6))
    b.extend(K.cyl_buf((xb_, 0.0, zi), (GEARBOX[0] - 0.275, 0.0, zi), 0.032, 'steel', 12))
    for sy in (-1, 1):
        b.extend(K.box_buf((xa_ + 0.05, sy * w - 0.01, zo - 0.04), (xb_ - 0.05, sy * w + 0.004 * sy, zo + 0.06), 'alu', 0.003, 1))
    # its shift rod up to the low-range lever in the cab
    b.extend(K.tube_buf(np.array([(0.62, -0.03, zi + 0.07), (0.78, -0.06, 0.88), (TL[0] - 0.02, TL[1], PAN_Z - 0.01)]), 0.008, 'steel', 6))
    # the front propshaft: forward under the gearbox and the engine's sump to the front differential's pinion (the part
    # turned: its companion flange faces back); its own flange covers the pinion's nut, a universal joint behind it
    xp = D['ax_f'] - PINION_BOLTS
    zf = hz + DIFF_FLANGE[1]
    b.extend(K.cyl_buf((xp - 0.040, 0.0, zf), (xp, 0.0, zf), 0.048, 'steel', 16))
    b.extend(K.cyl_buf((xp - 0.076, 0.0, zf), (xp - 0.040, 0.0, zf), 0.040, 'steel', 14))
    b.extend(K.cyl_buf((xb_ + 0.036, 0.0, zo), (xp - 0.076, 0.0, zf), 0.036, 'steel', 14))
    b.extend(K.cyl_buf((xb_, 0.0, zo), (xb_ + 0.036, 0.0, zo), 0.046, 'steel', 14))
    # the rear propshaft: from the transfer case back over a centre bearing to the rear differential part's flange
    rx = D['ax_r']
    xe, ze = rx + DIFF_FLANGE[0] + 0.022, hz + DIFF_FLANGE[1]
    zcb = 0.465
    b.extend(K.cyl_buf((xa_ - 0.036, 0.0, zo), (xa_, 0.0, zo), 0.046, 'steel', 14))
    b.extend(K.cyl_buf((CB_X + 0.03, 0.0, zcb), (xa_ - 0.036, 0.0, zo), 0.038, 'steel', 14))
    b.extend(K.cyl_buf((xe, 0.0, ze), (CB_X - 0.03, 0.0, zcb), 0.036, 'steel', 14))
    for x, z in ((xe - 0.02, ze), (CB_X - 0.045, zcb), (CB_X + 0.045, zcb)):
        b.extend(K.cyl_buf((x - 0.02, 0.0, z), (x + 0.02, 0.0, z), 0.046, 'steel', 14))
    # the centre bearing: a rubber ring in a bracket hung from its crossmember
    b.extend(K.cyl_buf((CB_X - 0.025, 0.0, zcb), (CB_X + 0.025, 0.0, zcb), 0.062, 'rubber', 18))
    b.extend(K.box_buf((CB_X - 0.03, -0.09, zcb + 0.05), (CB_X + 0.03, 0.09, zcb + 0.075), 'steel', 0.004, 1))
    for sy in (-1, 1):
        b.extend(K.box_buf((CB_X - 0.02, sy * 0.08 - 0.008, zcb), (CB_X + 0.02, sy * 0.08 + 0.008, z0 + 0.06), 'steel', 0.002, 1))
    # steering box on the left rail ahead of the front wheel, its pitman arm, the drag link back under the axle tube to
    # the left knuckle's arm
    sx = 2.47
    b.extend(K.box_buf((sx - 0.07, FRAME_Y + 0.035, 0.64), (sx + 0.07, FRAME_Y + 0.115, 0.79), 'steel', 0.012, 2))
    b.extend(K.cyl_buf((sx, FRAME_Y + 0.075, 0.64), (sx, FRAME_Y + 0.075, 0.56), 0.03, 'steel', 12))
    b.extend(K.box_buf((sx - 0.025, FRAME_Y + 0.06, 0.40), (sx + 0.025, FRAME_Y + 0.095, 0.58), 'steel', 0.006, 2))
    hy = D['track_f'] / 2
    ya = hy - K.BRAKE_IN[1] - 0.003 - 0.016
    b.extend(K.tube_buf(np.array([(sx, FRAME_Y + 0.078, 0.41), (2.10, 0.66, 0.33), (D['ax_f'] - 0.10, ya - 0.012, hz - 0.13)]), 0.016, 'steel', 8))
    # the steering column's lower shaft from the firewall down inside the bay along the rail, out to the box
    b.extend(K.tube_buf(np.array([(FIREWALL_X + 0.01, 0.452, 1.06), (1.70, 0.452, 0.92), (2.30, 0.452, 0.86), (sx - 0.04, 0.47, 0.80),
                                  (sx, FRAME_Y + 0.075, 0.79)]), 0.013, 'steel', 8))
    # the winch under the nose between the rail horns: its drum on a plate, the motor at the left end, the fairlead
    xw, zw = 2.64, 0.52
    b.extend(K.box_buf((2.54, -FRAME_Y + 0.03, z0 - 0.015), (2.72, FRAME_Y - 0.03, z0), 'steel', 0.004, 1))
    b.extend(K.cyl_buf((xw, -0.26, zw), (xw, 0.20, zw), 0.06, 'trim', 16))
    b.extend(K.cyl_buf((xw, -0.24, zw), (xw, 0.18, zw), 0.067, 'steel', 16))
    b.extend(K.cyl_buf((xw, 0.20, zw), (xw, 0.37, zw), 0.068, 'trim', 16))
    b.extend(K.cyl_buf((xw, 0.37, zw), (xw, 0.39, zw), 0.05, 'steel', 12))
    for y in (-0.275, 0.205):
        b.extend(K.box_buf((xw - 0.08, y - 0.012, zw - 0.085), (xw + 0.08, y + 0.012, z0 - 0.015), 'steel', 0.004, 1))
    xl = 2.76
    b.extend(K.box_buf((xl - 0.022, -0.18, zw - 0.08), (xl + 0.012, 0.18, zw + 0.03), 'steel', 0.008, 2))
    for y in (-0.055, 0.055):
        b.extend(K.cyl_buf((xl + 0.004, y, zw - 0.065), (xl + 0.004, y, zw + 0.015), 0.015, 'chrome', 10))
    for z in (zw - 0.072, zw + 0.022):
        b.extend(K.cyl_buf((xl + 0.004, -0.065, z), (xl + 0.004, 0.065, z), 0.015, 'chrome', 10))
    b.extend(K.tube_buf(np.array([(xw + 0.04, 0.0, zw - 0.055), (xl - 0.03, 0.0, zw - 0.025), (xl + 0.02, 0.0, zw - 0.025), (xl + 0.05, 0.0, zw - 0.07)]), 0.006, 'steel', 6))
    b.extend(K.box_buf((xl + 0.04, -0.014, zw - 0.12), (xl + 0.08, 0.014, zw - 0.07), 'steel', 0.006, 1))
    # the front tow shackles on the rail horns' brackets
    for sy in (-1, 1):
        c = np.array([2.66, sy * FRAME_Y, z0 - 0.06])
        arc = np.array([(c[0] + 0.05 * math.sin(a), c[1] + 0.035 * math.cos(a), c[2] - 0.05 * (1 - math.cos(a))) for a in np.linspace(-PI / 2, PI / 2, 9)])
        b.extend(K.tube_buf(arc, 0.011, 'steel', 8))
        b.extend(K.cyl_buf(c + (0.0, -0.05, 0.0), c + (0.0, 0.05, 0.0), 0.012, 'steel', 8))
    # the fuel tank's straps (the tank part sits between the rails behind the rear axle)
    tx = FUEL_TANK[0]
    zs = FUEL_TANK[2] - 0.011
    # (their legs outboard of the tank's room, under the rails' inner flanges)
    for x in (tx - 0.30, tx + 0.30):
        b.extend(K.box_buf((x - 0.025, -0.438, zs - 0.012), (x + 0.025, 0.438, zs - 0.002), 'steel', 0.003, 1))
        for sy in (1, -1):
            b.extend(K.box_buf((x - 0.025, sy * 0.432 - 0.006, zs - 0.012), (x + 0.025, sy * 0.432 + 0.006, z0), 'steel', 0.002, 1))
    # the filler hose from the pocket on the right (behind the rear wheel) under the rail, to a union on a clip under
    # the rail's inner flange at the tank room's side (the tank's own neck takes it there, whichever tank it is)
    path = np.array([(-2.575, -0.99, 0.95), (-2.57, -0.86, 0.82), (-2.55, -0.70, 0.66), (-2.52, -0.56, 0.59), (-2.50, -0.47, 0.585),
                     (-2.49, -0.445, 0.59)])
    b.extend(K.tube_buf(smooth_path(path, 1), 0.02, 'rubber', 10))
    b.extend(K.cyl_buf((-2.49, -0.448, 0.59), (-2.49, -0.428, 0.59), 0.024, 'steel', 12))
    b.extend(K.box_buf((-2.515, -0.47, 0.605), (-2.465, -0.43, z0), 'steel', 0.002, 1))
    # the rear crossmember's tow hook (a pintle) and its plate, under the rear bumper's line
    xr = -3.16
    b.extend(K.box_buf((xr - 0.015, -0.12, z0 - 0.01), (xr + 0.02, 0.12, 0.69), 'steel', 0.006, 2))
    b.extend(K.box_buf((xr - 0.10, -0.03, z0 + 0.0), (xr - 0.015, 0.03, z0 + 0.05), 'steel', 0.008, 2))
    arc = np.array([(xr - 0.10 - 0.04 * math.sin(a), 0.0, z0 + 0.025 - 0.04 + 0.04 * math.cos(a)) for a in np.linspace(0, PI, 9)])
    b.extend(K.tube_buf(arc, 0.014, 'steel', 8))
    return b


# ============================================================================================ interior
def steering_mount():
    """(the column's end, the column direction forward-down): a big wheel inclined 40 degrees, truck fashion, low
    enough that the dials show through its upper half."""
    ang = math.radians(40.0)
    d = np.array([math.cos(ang), 0.0, -math.sin(ang)])
    p = np.array([1.04, DRIVER_Y, 1.48])
    return p, d


def headliner():
    """The headliner under the roof (left half, fabric), a notch round the roof hatch's opening on the centre line."""
    gus = S.g_u_samples()
    row = np.stack([gus, np.full(len(gus), S.G_T[-1] - 0.02)], 1)
    Pr, _ = S.CG.to3d(row, -0.024)
    xa, xb = Pr[-1, 0], Pr[0, 0]
    hx, _, hr = HATCH
    r = hr + 0.03
    # along the centre line from the rear to the front, round the hatch's opening
    a = np.linspace(PI, 0.0, 17)
    notch = np.stack([hx + r * np.cos(a), r * np.sin(a)], 1)
    back = np.stack([np.linspace(xa, hx - r, 8)[1:-1], np.zeros(6)], 1)
    fwd = np.stack([np.linspace(hx + r, xb, 10)[1:-1], np.zeros(8)], 1)
    loop = np.vstack([Pr[:, :2], back, notch, fwd])
    g = K.grid_points(0.0, 1.45, 0.0, 1.05, 0.10, dt=0.10)
    V, N, T = K.mesh_region(S.CR, [K.Loop(K.ccw(loop))], [], g, spacing=0.10, level=-0.024)
    return K.Buf().add(V, -N, T, 'fabric')


def interior(ex):
    out = {}
    L = K.Buf()
    C = K.Buf()
    # rubber floor mat (left half): from the back wall to the toe board, open where the doghouse stands
    x0, x1 = D['xr'] + 0.04, FIREWALL_X - 0.18
    for (xa_, xb_, y0, y1) in ((x0, DOG_X, 0.0, 1.03), (DOG_X, x1, DOG_Y, 1.03)):
        xs = np.linspace(xa_, xb_, max(2, int(round((xb_ - xa_) / 0.40)) + 1))
        sec = K.round_profile(np.array([(y0, FLOOR_Z), (y1 - 0.01, FLOOR_Z), (y1, FLOOR_Z + 0.03)]), [0, 0.01, 0], 2)
        V = np.array([(x, y, z) for x in xs for (y, z) in sec])
        T = K.grid_tris(len(xs), len(sec))
        L.extend(face_up(recompute_normals(K.Buf().add(V, np.zeros_like(V), T, 'rubber'))))
    L.extend(doghouse())
    # the sill trim along the door's opening, the rear wall's lining below the window line, the back corner's trim
    L.extend(K.box_buf((D['fd_rear'] - 0.02, 0.96, FLOOR_Z), (D['fd_front'] - 0.06, 1.04, FLOOR_Z + 0.07), 'plastic_int', 0.012, 2))
    xw = D['xr'] + 0.035
    L.extend(quad_sheet((xw, 0.0, FLOOR_Z), (0, 1.03, 0), (0, 0, D['waist_z'] - 0.02 - FLOOR_Z), 4, 3, (1, 0, 0), 'plastic_int'))
    L.extend(K.box_buf((xw, 0.96, FLOOR_Z), (D['fd_rear'] - 0.01, 1.045, D['waist_z'] + 0.02), 'plastic_int', 0.012, 2))
    # headliner with two ribs, the grab rail along its side
    L.extend(headliner())
    for x in (0.20, 0.98):
        L.extend(K.box_buf((x - 0.025, 0.0, D['roof_z'] - 0.048), (x + 0.025, 0.98, D['roof_z'] - 0.032), 'plastic_int', 0.006, 1))
    L.extend(K.tube_buf(np.array([(0.16, 0.97, 2.30), (0.18, 0.97, 2.34), (1.06, 0.97, 2.34), (1.08, 0.97, 2.30)]), 0.012, 'trim', 8))
    dash, gauges = dashboard()
    C.extend(dash)
    # the roof hatch from inside: a trim ring round its opening, the lid's underside, the crank handle
    hx, _, hr = HATCH
    zr = D['roof_z'] - 0.026
    V, N, T = K.lathe(np.array([(hr + 0.045, 0.0), (hr + 0.045, -0.012), (hr - 0.005, -0.016), (hr - 0.01, -0.004)]), (hx, 0.0, zr), (0, 0, 1), 32)
    C.add(V, N, T, 'trim')
    V, N, T = K.lathe(np.array([(0.0, 0.006), (hr - 0.008, 0.006)]), (hx, 0.0, zr), (0, 0, 1), 28, prof_n=np.array([[0, -1.0], [0, -1.0]]))
    C.add(V, N, T, 'plastic_int')
    C.extend(K.box_buf((hx - 0.012, -0.012, zr - 0.06), (hx + 0.012, 0.012, zr + 0.004), 'steel', 0.004, 1))
    C.extend(K.box_buf((hx - 0.012, -0.012, zr - 0.072), (hx + 0.012, 0.11, zr - 0.06), 'steel', 0.004, 1))
    C.extend(K.cyl_buf((hx, 0.11, zr - 0.066), (hx, 0.11, zr - 0.12), 0.012, 'plastic_int', 10))
    # pedals hanging from under the dash (clutch, brake, throttle beside the doghouse)
    for (py, w_, name) in ((PEDAL_Y + 0.12, 0.028, 'clutch'), (PEDAL_Y, 0.034, 'brake'), (PEDAL_Y - 0.11, 0.022, 'throttle')):
        base = np.array([1.33, py, 1.30])
        pad = np.array([{'clutch': 1.19, 'brake': 1.20, 'throttle': 1.21}[name], py, 1.12 if name != 'throttle' else 1.08])
        C.extend(K.tube_buf(np.array([base, (base + pad) / 2 + (0.025, 0, 0), pad + (0, 0, 0.04)]), 0.009, 'steel', 6))
        C.extend(K.box_buf(pad + (-0.012, -w_, -0.045 if name != 'throttle' else -0.065), pad + (0.012, w_, 0.045), 'rubber', 0.006, 2,
                           xf=K.mat4_rot((0, 1, 0), -22, pad)))
    # the steering column's shroud out of the dash, the column on down to the firewall
    st = steering_mount()
    C.extend(K.cyl_buf(st[0] + st[1] * 0.03, st[0] + st[1] * 0.20, 0.046, 'plastic_int', 18, r1=0.055))
    C.extend(K.tube_buf(np.array([st[0] + st[1] * 0.20, (1.34, DRIVER_Y - 0.04, 1.22), (FIREWALL_X - 0.01, 0.47, 1.07)]), 0.02, 'trim', 8))
    # gear lever boot ring on the floor, the low-range lever beside it (frame-owned: a short lever, an amber knob)
    gx, gy = GEAR_X, GEAR_Y
    V, N, T = K.lathe(np.array([(0.0, 0.014), (0.04, 0.014), (0.07, 0.004), (0.085, 0.0)])[::-1], (gx, gy, FLOOR_Z + 0.002), (0, 0, 1), 20)
    C.add(V, N, T, 'rubber')
    tx, ty = TL
    V, N, T = K.lathe(np.array([(0.0, 0.01), (0.025, 0.01), (0.042, 0.0)])[::-1], (tx, ty, FLOOR_Z + 0.002), (0, 0, 1), 14)
    C.add(V, N, T, 'rubber')
    tip = np.array([tx - 0.05, ty, FLOOR_Z + 0.26])
    C.extend(K.tube_buf(np.array([(tx, ty, FLOOR_Z + 0.004), (tx - 0.02, ty, FLOOR_Z + 0.13), tip]), 0.008, 'chrome', 8))
    C.extend(K.cyl_buf(tip - (0, 0, 0.005), tip + (0.0, 0.0, 0.05), 0.019, 'lens_amber', 12, r1=0.022))
    # the handbrake's slot plate on the floor between the seats (the lever is the handbrake part)
    C.extend(K.box_buf((HB_X - 0.16, -0.05, FLOOR_Z - 0.002), (HB_X + 0.18, 0.05, FLOOR_Z + 0.012), 'plastic_int', 0.006, 2))
    C.extend(K.box_buf((HB_X - 0.12, -0.014, FLOOR_Z + 0.008), (HB_X + 0.14, 0.014, FLOOR_Z + 0.0135), 'trim', 0.002, 1))
    # seat rails: the two buckets
    for (sx, sy) in ((SEAT_X, DRIVER_Y), (SEAT_X, -DRIVER_Y)):
        for dy in (-0.17, 0.17):
            C.extend(K.box_buf((sx - 0.24, sy + dy - 0.015, FLOOR_Z), (sx + 0.22, sy + dy + 0.015, FLOOR_Z + 0.03), 'steel', 0.004, 2))
    # the interior mirror on the header, sun visors
    mp = np.array([float(S.ws_x(0, 2.36)) - 0.07, 0.0, 2.36])
    C.extend(K.box_buf(mp + (-0.01, -0.012, 0.01), mp + (0.012, 0.012, 0.11), 'plastic_int', 0.004, 2))
    C.extend(K.box_buf(mp + (-0.025, -0.13, -0.035), mp + (0.0, 0.13, 0.025), 'plastic_int', 0.012, 3))
    C.extend(K.box_buf(mp + (-0.0262, -0.12, -0.027), mp + (-0.0255, 0.12, 0.017), 'glass_dark', 0.0, 1))
    for sy in (1, -1):
        vp = np.array([float(S.ws_x(0.55, 2.44)) - 0.10, sy * 0.56, 2.445])
        C.extend(K.box_buf(vp + (-0.19, -0.22, -0.012), vp + (0.0, 0.22, 0.008), 'fabric', 0.01, 3, xf=K.mat4_rot((0, 1, 0), 8, vp)))
    C.extend(console())
    out['L'] = L
    out['C'] = C
    out['gauges'] = gauges
    return out


def console():
    """The overhead console under the roof's front: a padded box with the radio's slot in its rear face on the
    driver's side (the radio part sits in it), a CB set beside it with its handset on a hook, a map lamp."""
    b = K.Buf()
    x0, x1, hw, z0 = CONSOLE
    z1 = D['roof_z'] - 0.026
    b.extend(K.box_buf((x0, -hw, z0), (x1, hw, z1), 'plastic_int', 0.015, 2))
    # the radio's slot: a chrome bezel round a dark recess
    ry, rz = RADIO[1], RADIO[2]
    b.extend(K.box_buf((x0 - 0.006, ry - 0.097, rz - 0.028), (x0 + 0.002, ry + 0.097, rz + 0.028), 'chrome', 0.003, 2))
    b.extend(K.box_buf((x0 - 0.008, ry - 0.09, rz - 0.023), (x0 + 0.06, ry + 0.09, rz + 0.023), 'trim', 0.002, 1))
    # the CB set: its face with a dial and two knobs, the handset hanging on its hook
    cy = -0.13
    b.extend(K.box_buf((x0 - 0.012, cy - 0.09, z0 + 0.008), (x0 + 0.002, cy + 0.09, z0 + 0.062), 'trim', 0.004, 1))
    b.extend(K.box_buf((x0 - 0.0135, cy - 0.06, z0 + 0.03), (x0 - 0.011, cy + 0.0, z0 + 0.05), 'lens_amber', 0.0, 1))
    for yy in (cy + 0.03, cy + 0.065):
        b.extend(K.cyl_buf((x0 - 0.012, yy, z0 + 0.035), (x0 - 0.026, yy, z0 + 0.035), 0.009, 'chrome', 10))
    hs = np.array([x0 - 0.05, cy - 0.02, z0 - 0.07])
    b.extend(K.box_buf(hs + (-0.018, -0.028, -0.045), hs + (0.018, 0.028, 0.045), 'trim', 0.012, 2))
    b.extend(K.box_buf((x0 - 0.02, cy - 0.03, z0 - 0.02), (x0, cy - 0.01, z0 + 0.004), 'steel', 0.002, 1))
    b.extend(K.tube_buf(smooth_path([hs + (0.0, 0.0, 0.045), hs + (0.03, 0.01, 0.06), (x0 - 0.004, cy + 0.04, z0 + 0.012)], 1), 0.004, 'rubber', 5))
    # the map lamp's lens under its front
    b.extend(K.box_buf((x1 - 0.12, -0.08, z0 - 0.004), (x1 - 0.03, 0.08, z0 + 0.002), 'emit', 0.002, 1))
    return b


def dashboard():
    """A plain 1980s truck dash: a long padded top under the windscreen, a painted steel fascia either side of the
    doghouse, a binnacle in front of the driver with the speedometer, the rev counter and two small dials, the heater
    panel on the passenger's side, a compass on the top, a grab handle in front of the passenger, a glovebox, vents."""
    b = K.Buf()
    fx = DASH_FACE_X
    zt = 1.585

    def pad_sec(y):
        return K.round_profile(np.array([(1.44, zt - 0.03), (1.40, zt + 0.003), (fx + 0.03, zt + 0.012), (fx - 0.012, zt + 0.008), (fx - 0.026, zt - 0.014),
                                         (fx - 0.018, zt - 0.036), (fx + 0.01, zt - 0.045), (1.44, zt - 0.045)]), [0, 0.03, 0.02, 0.012, 0.01, 0.008, 0.01, 0], 1)
    ys = np.linspace(-0.98, 0.98, 11)
    b.extend(extrude_y(None, ys, 'plastic_int', inside=(1.34, 0.0, zt - 0.02), sec_fn=pad_sec))
    zl = 1.30
    fas = K.round_profile(np.array([(fx, zt - 0.045), (fx, zl + 0.03), (fx + 0.04, zl), (1.44, zl), (1.44, zt - 0.045)]), [0, 0.025, 0.02, 0, 0], 2)
    for (y0, y1) in ((-0.98, -DOG_Y), (DOG_Y, 0.98)):
        b.extend(extrude_y(fas, np.linspace(y0, y1, 4), 'paint', inside=(1.34, 0.5 * (y0 + y1), 1.44)))
    # glovebox and its push button (passenger)
    b.extend(K.box_buf((fx - 0.006, -0.92, 1.36), (fx + 0.004, -0.66, 1.50), 'paint', 0.01, 2))
    b.extend(K.box_buf((fx - 0.012, -0.80, 1.475), (fx - 0.004, -0.76, 1.49), 'chrome', 0.003, 1))
    # the binnacle: a box standing out of the fascia, tilted towards the eye, a hood over it
    eye = np.array(EYE)
    pc = np.array([fx - 0.03, DRIVER_Y, 1.50])
    dn = K.unit(eye - pc)
    dn = K.unit(np.array([dn[0], 0.0, dn[2]]))
    R = K.frame_from((0, 1, 0), dn)
    b.extend(K.box_buf((-0.21, -0.07, -0.06), (0.21, 0.07, 0.0), 'trim', 0.014, 1, xf=K.mat4_trs(pc, R)))
    hood = K.mat4_trs(pc + R[:, 1] * 0.07, R)
    b.extend(K.box_buf((-0.22, -0.006, -0.06), (0.22, 0.012, 0.055), 'plastic_int', 0.008, 1, xf=hood))
    gauges = []
    for (gy, gz, r, name, big) in ((0.072, -0.004, 0.056, 'N_speed', True), (-0.072, -0.004, 0.056, 'N_rpm', True),
                                   (0.164, 0.008, 0.024, 'N_fuel', False), (-0.164, 0.008, 0.024, 'N_temp', False)):
        c = pc + R[:, 0] * gy + R[:, 1] * gz
        db, gg = dial(c, dn, r, big, 'chrome', segs=22 if big else 14)
        b.extend(db)
        gg['name'] = name
        gauges.append(gg)
    # vents at the ends and either side of the doghouse
    for vy, vz in ((0.92, 1.50), (-0.92, 1.535), (0.45, 1.53), (-0.45, 1.53)):
        c = np.array([fx - 0.002, vy, vz])
        b.extend(K.box_buf(c + (-0.006, -0.045, -0.022), c + (0.004, 0.045, 0.022), 'trim', 0.006, 1))
        for k in range(-1, 2):
            b.extend(K.box_buf(c + (-0.010, -0.04, 0.012 * k - 0.002), c + (-0.004, 0.04, 0.012 * k + 0.002), 'plastic_int', 0.0, 1))
    # the heater panel on the passenger's side: three levers in a slotted plate
    hzp = 1.43
    b.extend(K.box_buf((fx - 0.008, -0.62, hzp - 0.035), (fx + 0.002, -0.44, hzp + 0.035), 'trim', 0.004, 1))
    for k in range(3):
        yy = -0.58 + 0.05 * k
        b.extend(K.box_buf((fx - 0.026, yy - 0.006, hzp - 0.008), (fx - 0.008, yy + 0.006, hzp + 0.008), 'plastic_int', 0.003, 1))
    # the compass on the top's middle: a ball in a cup on a stand
    cc = np.array([1.36, -0.05, zt + 0.045])
    b.extend(K.box_buf((1.33, -0.08, zt + 0.006), (1.39, -0.02, zt + 0.018), 'trim', 0.004, 1))
    V, N, T = K.lathe(np.array([(0.0, -0.026), (0.03, -0.02), (0.034, 0.0), (0.03, 0.018), (0.0, 0.024)]), cc, (0, 0, 1), 16)
    b.add(V, N, T, 'glass_dark')
    # the passenger's grab handle across the dash
    hz = 1.62
    b.extend(K.tube_buf(np.array([(fx + 0.02, -0.28, 1.58), (fx - 0.06, -0.30, hz), (fx - 0.06, -0.70, hz), (fx + 0.02, -0.72, 1.58)]), 0.015, 'trim', 10))
    return b, gauges
