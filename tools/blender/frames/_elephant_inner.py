"""Old Elephant (frames/elephant.py): everything behind the outer skin — the Turtle's and the Loaf's way (frames/_turtle_inner.py,
frames/_van_inner.py) in a motorhome's long box. The engine bay at the back under the bed (its tin firewall, the deck over
it, the carrier bar), the cab at the front of the room (the floor, the seat boxes over the front wheels, a short console
with the gear lever, the long dash under the windscreen with the binnacle and its four dials, pedals, the column), the
room (its floor; along the left wall the dinette — two benches facing over a table — a tall pantry and the galley with
its sink, its cupboards and the worktop the hobs stand on; along the right the fridge's cabinet behind the passenger's
seat with the niche the fridge stands in, the entry door's step, the sofa; lockers over both walls; the lamps in the
ceiling), the bedroom across the back (the bed's platform over the engine and the rear wheels, its cupboards, the
mattress and the pillows), the door cards, and the underbody (UNDER): the floor pan, the ladder frame's rails and
crossmembers, the front lower arms and the steering's box and rods, the rear trailing arms and drive shafts, the
wheelhouse liners. The hubs' carriers are objects of their own (knuckle()); struts, springs, brakes and the
differential are the axles' parts."""
import math
import sys

sys.dont_write_bytecode = True

import numpy as np  # noqa: E402

from frames import _kit as K  # noqa: E402
from frames import elephant as S  # noqa: E402
from frames._sedan_inner import dial, extrude_y, quad_sheet, rear_tub_cabin, smooth_path  # noqa: E402

D = S.D
PI = math.pi
IN_Y = D['hw'] - 0.05    # the walls' inside (the lining's face)
FLOOR_Z = 0.62           # the cab's and the room's floor (mat top)
PAN_Z = 0.58             # under the floor
SEAT_Z = 1.00            # the front seats' boxes over the wheels (the seat parts stand on them)
SEAT_X = 3.00            # the stock bucket's eye is 0.16 behind and 0.90 over its floor attachment
DRIVER_Y = 0.62
EYE = (SEAT_X - 0.16, DRIVER_Y, SEAT_Z + 0.90)
ROOM_FRONT_X = 2.50      # where the cab ends and the room begins (the seat boxes' backs)
FIREWALL_X = -2.69       # the engine bay's front wall (under the bed's platform)
DECK_Z = 1.28            # the bed's platform's top over the engine (its underside 2 cm lower)
BED_X1 = -1.90           # the platform's front: the room's back
BED_TOP = DECK_Z + 0.16
# the dinette along the left wall behind the driver: bench A (its back to the cab), the table, bench B
DIN_A = (2.05, 2.47)
DIN_T = (1.30, 2.00)
DIN_B = (0.84, 1.25)
DIN_Y = 0.42
BENCH_Z = FLOOR_Z + 0.44
TABLE_Z = FLOOR_Z + 0.72
# the pantry between the dinette and the galley; the galley along the left wall (its worktop, the sink at its front end)
PANTRY_X = (0.46, 0.80)
GALLEY_X0 = -1.88
GALLEY_X1 = 0.42
GALLEY_Y = IN_Y - 0.60
WORKTOP_Z = FLOOR_Z + 0.92
SINK_X = 0.04
# on the right: the fridge's cabinet behind the passenger's seat (its niche from the floor), the sofa
FRIDGE_X = (1.66, 2.48)
FRIDGE_Y = IN_Y - 0.78
PLINTH_Z = FLOOR_Z + 0.30   # the niche's floor: a plinth over the front wheel's hump (a drawer in it)
NICHE_Z = PLINTH_Z + 1.44
SOFA_X = (-1.88, 0.44)
SOFA_Y = IN_Y - 0.60
SOFA_Z = FLOOR_Z + 0.44
# the lockers over the walls
LOCKER_Z = (2.48, 2.84)
LOCKER_D = 0.36
CEIL_Z = D['roof_z'] - 0.035
DASH_FACE_X = 3.55       # the shelf's face towards the cab
DASH_TOP = 1.48
WALL_IN = -0.035         # how far inside the nose's skin the dash ends
GEAR_X = SEAT_X + 0.36
CONSOLE_TOP = FLOOR_Z + 0.30
COLUMN_DEG = 62.0
# the drivetrain at the back: the V8 yawed half round (its fan and pulley to the lid, its flywheel to the gearbox), the
# gearbox ahead of the differential, yawed so its bell faces the differential
ENGINE = (-3.24, 0.0, 0.30)
GEARBOX = (D['ax_r'] + 0.42, 0.0, 0.26)
TANK = (0.40, 0.0, 0.14)
BATTERY = (3.84, 0.0, FLOOR_Z)
# the house battery (docs/V3/plan/rv.md: the leisure battery): on the floor in the dinette's footwell, by the wall
HOUSE_BATTERY = (1.65, IN_Y - 0.17, FLOOR_Z)
FRAME_Y = 0.55           # the rails between the wheel wells (they narrow to RAIL_IN past the wells)
RAIL_IN = 0.42
RAIL_Z = 0.48            # the rails' centre height (under the floor)
WELL_IN_F = 0.64         # the wheel wells' inner walls (the front wheels steer inside them; the duals' inner tyres)
WELL_IN_R = 0.62
WELL_R = 0.53


def steering_mount():
    """(the wheel's hub, the column's direction forward-down): a big wheel lying flat, its column 62 deg down."""
    a = math.radians(COLUMN_DEG)
    return np.array([SEAT_X + 0.22, DRIVER_Y, SEAT_Z + 0.55]), np.array([math.cos(a), 0.0, -math.sin(a)])


def knuckle(hx, hy, hz, front=True):
    """A hub's carrier (left side, outer face +Y), an object of its own (KNUCKLE_<hub>) the game hangs on the
    wheel's pivot: the hub flange at the hub face with eight studs and the centre cap, the spindle, and the carrier just
    inboard of the brake (front: up to the strut's foot; rear: the trailing arm's hub end)."""
    return K.knuckle_buf(hx, hy, hz, hy + 0.010, 0.090, 8, 0.072, 90.0, stud_r=0.0065, stud_len=0.010, cap_r=0.030,
                         cap_out=0.008, carrier=(0.06, 0.04, 0.13, 0.20 if front else 0.14))


# ============================================================================================ engine bay (BODY)
def corner_plan(x0, x1, y0, y1, end, r, step=0.03):
    """Plan outline (CCW; x forward, y left) of [x0, x1] x [y0, y1] with its outer corner at the nose (end 'F') or
    the tail ('R') rounded about the shell's own corner centre with radius r, so it stays inside the shell's
    rounded corner."""
    if end == 'F':
        sx, cx, cy = 1.0, D['xf'] - D['rho_f'], D['hw'] - D['rho_f']
    else:
        sx, cx, cy = -1.0, -(D['xr'] + D['rho_r']), D['hw'] - D['rho_r']
    a0, a1 = sorted((sx * x0, sx * x1))
    xe, ye = min(a1, cx + r), min(y1, cy + r)
    pts = [(a0, y0), (xe, y0)]
    if xe > cx and ye > cy and (xe - cx) ** 2 + (ye - cy) ** 2 > r * r:
        th0 = math.acos(max(-1.0, min(1.0, (xe - cx) / r)))
        th1 = math.asin(max(-1.0, min(1.0, (ye - cy) / r)))
        n = max(2, int(math.ceil(r * (th1 - th0) / step)))
        for k in range(n + 1):
            th = th0 + (th1 - th0) * k / n
            pts.append((cx + r * math.cos(th), cy + r * math.sin(th)))
    else:
        pts.append((xe, ye))
    pts.append((a0, ye))
    P = np.array(pts)
    P[:, 0] *= sx
    return K.ccw(P)


def engine_bay():
    """Left half: the tin firewall in front of the engine, the deck's underside over it, the bay's side wall behind
    the wheel well and over it, the carrier bar across the top at the back, a tin skirt along the bottom of the lid's
    opening."""
    b = K.Buf()
    xr = D['xr']
    under = DECK_Z - 0.02
    # firewall (faces the engine, rearwards), its stamped beads
    b.extend(quad_sheet((FIREWALL_X, 0.0, PAN_Z - 0.02), (0, IN_Y, 0), (0, 0, under - PAN_Z + 0.02), 10, 6, (-1, 0, 0), 'paint'))
    for z in (0.82, 1.04):
        b.extend(K.tube_buf(np.array([(FIREWALL_X - 0.002, 0.06, z), (FIREWALL_X - 0.002, IN_Y - 0.10, z)]), 0.008, 'paint', 6))
    # the deck's underside (round the shell's corner at the back)
    pl = corner_plan(xr + 0.03, FIREWALL_X, 0.0, IN_Y, 'R', D['rho_r'] - 0.06)
    b.extend(K.fill_loop(np.stack([pl[:, 0], pl[:, 1], np.full(len(pl), under - 0.004)], 1), (0, 0, -1), 'paint', interior_step=0.15))
    # the side wall behind the wheel well (from short of the shell's corner) and over it
    xw = D['ax_r'] - WELL_R - 0.005
    xs = D['xr'] + 0.12
    b.extend(quad_sheet((xs, IN_Y, PAN_Z - 0.06), (xw - xs, 0, 0), (0, 0, under - PAN_Z + 0.06), 4, 6, (0, -1, 0), 'paint'))
    zt = D['hub_z'] + math.sqrt(max(WELL_R ** 2 - (FIREWALL_X - D['ax_r']) ** 2, 0.0)) + 0.01
    b.extend(quad_sheet((xw, IN_Y, zt), (FIREWALL_X - xw, 0, 0), (0, 0, under - zt), 2, 3, (0, -1, 0), 'paint'))
    # the engine carrier: a bar across the bay at the back under the deck (the engine hangs from it and the gearbox),
    # on brackets at the sides
    xc = ENGINE[0] - 0.45
    b.extend(K.box_buf((xc - 0.035, 0.0, under - 0.09), (xc + 0.035, IN_Y - 0.10, under - 0.02), 'steel', 0.006, 2))
    b.extend(K.box_buf((xc - 0.045, IN_Y - 0.10, under - 0.13), (xc + 0.045, IN_Y, under), 'steel', 0.004, 1))
    return b


# ============================================================================================ underbody (UNDER)
def wheelhouse(xa, y0, y1, r, z_cut, mat='trim'):
    """Half cylinder liner over a wheel from y0 (its inner wall) out to y1, facing the wheel, down to z_cut each
    side; the inner wall's segment closes it."""
    za = D['hub_z']
    a0 = math.asin(max(-1.0, min(1.0, (z_cut - za) / r)))
    ths = np.linspace(a0, PI - a0, 24)
    V = np.array([(xa + r * math.cos(t), y, za + r * math.sin(t)) for t in ths for y in (y0, y1)])
    N = np.array([(-math.cos(t), 0.0, -math.sin(t)) for t in ths for y in (y0, y1)])
    b = K.Buf().add(V, N, K.grid_tris(len(ths), 2), mat)
    ring = np.array([(xa + r * math.cos(t), y0, za + r * math.sin(t)) for t in ths])
    b.extend(K.fill_loop(ring, (0, 1, 0), mat))
    return b


XC_R = D['ax_r'] + 0.70  # the rear arms' crossmember, ahead of the gearbox


def rail_path():
    """A rail's centre line in plan (x, y), front to back: narrow past the front well, out between the wells, in
    again past the rear wells, on to the tail under the engine."""
    xa, xr_a = D['ax_f'], D['ax_r']
    pts = [(D['xf'] - 0.30, RAIL_IN), (xa - 0.70, RAIL_IN), (xa - 0.98, FRAME_Y), (xr_a + 0.98, FRAME_Y), (xr_a + 0.70, RAIL_IN + 0.04),
           (D['xr'] + 0.35, RAIL_IN + 0.04)]
    return smooth_path(pts, 2)


def underbody():
    """UNDER (left half): floor pan, rails, crossmembers, front lower arms, rear trailing arms and drive shafts,
    wheelhouse liners."""
    b = K.Buf()
    xf_in = D['xf'] - 0.06
    xa, xr_a = D['ax_f'], D['ax_r']
    wf0, wf1 = xa - WELL_R - 0.01, xa + WELL_R + 0.01
    wr0, wr1 = xr_a - WELL_R - 0.01, xr_a + WELL_R + 0.01
    pan = 'trim'
    # the floor pan's underside: round the wheel wells
    for (x0, x1, y0, y1) in ((FIREWALL_X, xf_in, 0.0, WELL_IN_F), (wr1, wf0, WELL_IN_F, IN_Y + 0.02)):
        b.extend(K.box_buf((x0, y0, PAN_Z - 0.006), (x1, y1, PAN_Z), pan, 0.003, 1))
    b.extend(K.prism_buf(corner_plan(wf1, xf_in, WELL_IN_F, IN_Y + 0.02, 'F', D['rho_f'] - 0.04), PAN_Z - 0.006, PAN_Z, pan, 0.003, 1))
    # rails: a C section along the waisted centre line, under the floor
    path2 = rail_path()
    path = np.stack([path2[:, 0], path2[:, 1], np.full(len(path2), RAIL_Z)], 1)[::-1]
    prof = np.array([(0.04, -0.07), (-0.04, -0.07), (-0.04, 0.07), (0.04, 0.07), (0.04, 0.06), (-0.031, 0.06),
                     (-0.031, -0.06), (0.04, -0.06)])[::-1]
    V, N, Tr = K.sweep(path, (0, 0, 1), prof, closed=False, closed_prof=True, smooth_prof=False)
    b.add(V, N, Tr, 'steel')
    for e in (0, -1):
        ring = V.reshape(len(path), -1, 3)[e]
        b.extend(K.fill_loop(ring, (np.sign(path[e, 0] - path[-1 - e, 0]), 0, 0), 'steel'))
    # crossmembers (halves): at the nose, behind the front wheels, two under the floor, at the tail
    for x, y1 in ((D['xf'] - 0.32, RAIL_IN), (xa - 0.72, RAIL_IN + 0.04), (1.40, FRAME_Y - 0.03), (-0.80, FRAME_Y - 0.03), (D['xr'] + 0.40, RAIL_IN + 0.04)):
        b.extend(K.box_buf((x - 0.04, 0.0, RAIL_Z - 0.06), (x + 0.04, y1, RAIL_Z + 0.06), 'steel', 0.004, 1))
    # the front axle's crossmember (the arms' pivots on it) between the rails
    b.extend(K.box_buf((xa - 0.07, 0.0, RAIL_Z - 0.14), (xa + 0.07, RAIL_IN + 0.02, RAIL_Z - 0.04), 'steel', 0.008, 2))
    # the rear arms' crossmember ahead of the gearbox, out to the sills, with the pivot brackets
    xc = XC_R
    b.extend(K.box_buf((xc - 0.06, 0.0, RAIL_Z - 0.05), (xc + 0.06, IN_Y - 0.06, RAIL_Z + 0.05), 'steel', 0.008, 2))
    # sill rails along the bottom of the body between the wheel wells
    b.extend(K.box_buf((wr1 + 0.02, IN_Y - 0.04, D['z_bot'] + 0.01), (wf0 - 0.02, IN_Y + 0.02, PAN_Z), 'steel', 0.006, 1))
    # wheelhouse liners
    b.extend(wheelhouse(xa, WELL_IN_F, IN_Y + 0.05, WELL_R, D['z_bot'] + 0.04))
    b.extend(wheelhouse(xr_a, WELL_IN_R, IN_Y + 0.05, WELL_R, D['z_bot'] + 0.04))
    # front: the lower arm from the knuckle's foot back to two pivots on the crossmember (the strut is the
    # suspension part's, the knuckle and its hub an object of its own)
    hx, hy, hz = D['ax_f'], D['track_f'] / 2, D['hub_z']
    zp = RAIL_Z - 0.09
    b.extend(K.tube_buf(np.array([(hx + 0.20, RAIL_IN - 0.01, zp), (hx, hy - 0.16, hz - 0.13), (hx - 0.20, RAIL_IN - 0.01, zp)]), 0.02, 'steel', 8))
    for x in (hx + 0.20, hx - 0.20):
        b.extend(K.cyl_buf((x - 0.035, RAIL_IN - 0.01, zp), (x + 0.035, RAIL_IN - 0.01, zp), 0.027, 'rubber', 10))
    # the tie rod from the steering's track rod out to the knuckle's arm (ahead of the axle)
    b.extend(K.tube_buf(np.array([(hx + 0.16, 0.26, zp + 0.02), (hx + 0.15, hy - 0.16, zp + 0.02)]), 0.012, 'steel', 8))
    b.extend(K.cyl_buf((hx + 0.16, 0.26, zp + 0.02), (hx + 0.16, 0.32, zp + 0.02), 0.021, 'rubber', 10))
    # rear: the trailing arm from the hub's carrier forward to its pivot on the crossmember, inside the inner tyre;
    # the drive shaft from the differential part's tube end out to the hub (its two rubber boots)
    rx, ry = D['ax_r'], D['track_r'] / 2
    arm = np.array([(rx, 0.60, hz - 0.02), (rx + 0.26, 0.58, hz), (xc - 0.03, 0.58, RAIL_Z - 0.09)])
    b.extend(K.tube_buf(smooth_path(arm, 1), 0.032, 'steel', 10))
    b.extend(K.cyl_buf((xc + 0.06, 0.58, RAIL_Z - 0.09), (xc - 0.07, 0.58, RAIL_Z - 0.09), 0.036, 'rubber', 12))
    y0, y1 = 0.312, ry - K.BRAKE_IN[1] - 0.012
    b.extend(K.cyl_buf((rx, y0, hz), (rx, y1, hz), 0.024, 'steel', 12))
    for (ya, yb) in ((y0, y0 + 0.08), (y1 - 0.08, y1)):
        V, N, Tr = K.lathe(np.array([(0.027, 0.0), (0.043, 0.014), (0.036, 0.028), (0.047, 0.044), (0.036, 0.060), (0.029, yb - ya)]),
                           (rx, ya, hz), (0, 1, 0), 14)
        b.add(V, N, Tr, 'rubber')
    return b


def centre_under():
    """Centre and one-sided parts: the steering box under the driver's feet with its drop arm and the track rod
    across ahead of the front axle; the gearbox's coupling to the differential part; the fuel tank's filler hose
    from the flap on the left; the gear linkage rod back from the lever to the gearbox, beside the tank."""
    b = K.Buf()
    hx, hz = D['ax_f'], D['hub_z']
    zp = RAIL_Z - 0.09
    p, d = steering_mount()
    foot = p + d * ((p[2] - FLOOR_Z) / -d[2])
    bx, by = foot[0], foot[1]
    b.extend(K.box_buf((bx - 0.08, by - 0.06, PAN_Z - 0.13), (bx + 0.06, by + 0.06, PAN_Z - 0.01), 'steel', 0.012, 2))
    b.extend(K.cyl_buf((bx, by, PAN_Z - 0.01), (bx, by, FLOOR_Z + 0.002), 0.034, 'rubber', 12))
    b.extend(K.tube_buf(np.array([(bx - 0.02, by - 0.07, PAN_Z - 0.12), (hx + 0.16, by - 0.12, zp + 0.02)]), 0.014, 'steel', 8))
    b.extend(K.tube_buf(np.array([(hx + 0.16, 0.30, zp + 0.02), (hx + 0.16, -0.30, zp + 0.02)]), 0.015, 'steel', 8))
    # the coupling from the gearbox's bell to the differential part's companion flange
    gx = GEARBOX[0] - 0.197
    fx = D['ax_r'] + 0.2645 + 0.012
    zc = D['hub_z'] - 0.024
    b.extend(K.cyl_buf((fx, 0.0, zc), (gx + 0.01, 0.0, zc), 0.03, 'steel', 14))
    for x in (fx, gx + 0.01):
        b.extend(K.cyl_buf((x - 0.012, 0.0, zc), (x + 0.012, 0.0, zc), 0.045, 'steel', 14))
    # the gear linkage: from the lever's foot under the console back beside the tank to the gearbox's tail
    path = np.array([(GEAR_X, 0.0, PAN_Z - 0.03), (2.10, -0.47, PAN_Z - 0.03), (-1.20, -0.47, PAN_Z - 0.03), (GEARBOX[0] + 0.32, 0.0, PAN_Z - 0.05)])
    b.extend(K.tube_buf(path, 0.009, 'steel', 6))
    # the filler hose (down inside the wall from the pocket behind the flap, unseen) in under the floor to the
    # tank's neck, over the rail
    fx_ = D['fuel'][0]
    path = np.array([(fx_ + 0.02, IN_Y - 0.06, 0.55), (fx_ + 0.04, 0.76, 0.555), (fx_ + 0.055, 0.56, 0.55), (fx_ + 0.06, 0.44, 0.52)])
    b.extend(K.tube_buf(smooth_path(path, 1), 0.02, 'rubber', 10))
    return b


# ============================================================================================ interior
def seat_box(x0, x1, y0, y1, z1, mat):
    return K.box_buf((x0, y0, FLOOR_Z - 0.005), (x1, y1, z1), mat, 0.02, 2)


def cupboard_doors(buf, x0, x1, y, z0, z1, n, facing, knob_z=None, mat='wood'):
    """n doors side by side on a carcass's face at y (facing: +1 the face looks to +y, -1 to -y), from z0 to z1,
    each with a chrome knob near its free edge."""
    w = (x1 - x0) / n
    for k in range(n):
        a, c = x0 + k * w + 0.012, x0 + (k + 1) * w - 0.012
        if facing < 0:
            buf.extend(K.box_buf((a, y - 0.014, z0), (c, y + 0.001, z1), mat, 0.006, 2))
            ky = y - 0.014
            buf.extend(K.cyl_buf((c - 0.05 if k % 2 == 0 else a + 0.05, ky, knob_z or z1 - 0.08), (c - 0.05 if k % 2 == 0 else a + 0.05, ky - 0.02, knob_z or z1 - 0.08), 0.012, 'chrome', 10))
        else:
            buf.extend(K.box_buf((a, y - 0.001, z0), (c, y + 0.014, z1), mat, 0.006, 2))
            ky = y + 0.014
            buf.extend(K.cyl_buf((c - 0.05 if k % 2 == 0 else a + 0.05, ky, knob_z or z1 - 0.08), (c - 0.05 if k % 2 == 0 else a + 0.05, ky + 0.02, knob_z or z1 - 0.08), 0.012, 'chrome', 10))


def lockers(buf, x0, x1, n):
    """The lockers along a wall (left coordinates) over the windows: a carcass from the wall out LOCKER_D, n doors on its
    face towards the aisle with a chrome rail along their bottom edge to pull them by."""
    y = IN_Y - LOCKER_D
    z0, z1 = LOCKER_Z
    buf.extend(K.box_buf((x0, y, z0), (x1, IN_Y + 0.01, z1), 'wood', 0.01, 2))
    w = (x1 - x0) / n
    for k in range(n):
        a, c = x0 + k * w + 0.01, x0 + (k + 1) * w - 0.01
        buf.extend(K.box_buf((a, y - 0.014, z0 + 0.02), (c, y + 0.001, z1 - 0.02), 'wood', 0.006, 2))
    buf.extend(K.box_buf((x0 + 0.03, y - 0.03, z0 + 0.03), (x1 - 0.03, y - 0.014, z0 + 0.045), 'chrome', 0.004, 1))


def interior(ex):
    """INTERIOR: L (left half, mirrored), C (as it is), R (right side only, in left coordinates: the fridge's cabinet,
    the entry door's step, the sofa and its lockers), gauges (the dial layout for the needles)."""
    out = {}
    L = K.Buf()
    C = K.Buf()
    R = K.Buf()
    xa, xr_a = D['ax_f'], D['ax_r']
    # ---------------------------------------------------------------- the cab
    # floor mat from the room to the nose, round the nose's corner
    L.extend(K.prism_buf(corner_plan(ROOM_FRONT_X - 0.02, D['xf'] - 0.05, 0.0, IN_Y, 'F', D['rho_f'] - 0.04), FLOOR_Z - 0.03, FLOOR_Z, 'rubber', 0.004, 1))
    # each front seat stands on a box beside its wheel's well and over it on the well's hump (the strut rises into
    # the hump and the seat's cushion)
    L.extend(seat_box(SEAT_X - 0.48, SEAT_X + 0.28, 0.32, WELL_IN_F - 0.006, SEAT_Z, 'fabric'))
    L.extend(rear_tub_cabin(xa, D['hub_z'], WELL_R + 0.015, WELL_IN_F, IN_Y + 0.01, FLOOR_Z, 'fabric'))
    # the console between the seats: the gear lever stands on it, the handbrake behind
    C.extend(K.box_buf((SEAT_X - 0.32, -0.14, FLOOR_Z - 0.005), (SEAT_X + 0.50, 0.14, CONSOLE_TOP), 'plastic_int', 0.02, 2))
    V, N, Tr = K.lathe(np.array([(0.0, 0.012), (0.035, 0.012), (0.06, 0.004), (0.072, 0.0)])[::-1], (GEAR_X, 0.0, CONSOLE_TOP + 0.001), (0, 0, 1), 20)
    C.add(V, N, Tr, 'rubber')
    C.extend(K.box_buf((SEAT_X - 0.21, -0.03, CONSOLE_TOP - 0.004), (SEAT_X + 0.09, 0.03, CONSOLE_TOP + 0.004), 'trim', 0.003, 1))
    # the dash: a padded shelf under the glass, its painted face sloping down to the footwell, a glovebox; both
    # follow the nose round its corners
    xs0 = DASH_FACE_X
    f1, f2 = FLOOR_Z + 0.62, FLOOR_Z + 0.42

    def nose_in(y, z):
        return float(S.FRONT.to3d(np.array([[min(abs(y), D['hw'] - 0.04), z]]))[0][0, 0]) + WALL_IN

    def shelf_sec(y):
        x1 = nose_in(y, DASH_TOP)
        return K.round_profile(np.array([(x1, DASH_TOP - 0.03), (x1, DASH_TOP), (xs0 + 0.02, DASH_TOP + 0.004), (xs0 - 0.035, DASH_TOP + 0.016),
                                         (xs0 - 0.04, DASH_TOP - 0.01), (xs0 - 0.01, DASH_TOP - 0.035)]), [0, 0.01, 0.02, 0.012, 0.012, 0], 1)

    def face_sec(y):
        x1 = min(nose_in(y, f1), nose_in(y, DASH_TOP - 0.035))
        return K.round_profile(np.array([(xs0 - 0.01, DASH_TOP - 0.035), (xs0, f1), (xs0 + 0.10, f2), (x1, f2), (x1, DASH_TOP - 0.035)]), [0, 0.03, 0.03, 0, 0], 2)
    ys = np.concatenate([np.linspace(-(IN_Y - 0.01), -(IN_Y - 0.33), 8), np.linspace(-0.62, 0.62, 3), np.linspace(IN_Y - 0.33, IN_Y - 0.01, 8)])
    C.extend(extrude_y(None, ys, 'plastic_int', inside=(xs0 + 0.1, 0.0, DASH_TOP - 0.01), sec_fn=shelf_sec))
    C.extend(extrude_y(None, ys, 'paint_b', inside=(xs0 + 0.12, 0.0, f1 + 0.04), sec_fn=face_sec))
    C.extend(K.box_buf((xs0 - 0.012, -0.98, f1 + 0.03), (xs0 + 0.01, -0.50, DASH_TOP - 0.06), 'paint_b', 0.012, 2))
    C.extend(K.box_buf((xs0 - 0.018, -0.76, DASH_TOP - 0.085), (xs0 - 0.01, -0.72, DASH_TOP - 0.07), 'chrome', 0.003, 1))
    # the radio's slot in the face (the radio part sits in it), heater levers under it
    zr = DASH_TOP - 0.088
    C.extend(K.box_buf((xs0 - 0.012, -0.097, zr - 0.028), (xs0 - 0.004, 0.097, zr + 0.028), 'chrome', 0.003, 2))
    C.extend(K.box_buf((xs0 - 0.013, -0.09, zr - 0.023), (xs0 + 0.06, 0.09, zr + 0.023), 'trim', 0.002, 1))
    for k in range(3):
        yy = -0.05 + 0.05 * k
        C.extend(K.box_buf((xs0 - 0.03, yy - 0.006, zr - 0.062), (xs0 - 0.012, yy + 0.006, zr - 0.048), 'plastic_int', 0.003, 1))
    # vents at the ends of the face
    for vy in (0.98, -1.02):
        c = np.array([xs0 - 0.004, vy, DASH_TOP - 0.08])
        C.extend(K.box_buf(c + (-0.008, -0.06, -0.024), c + (0.004, 0.06, 0.024), 'trim', 0.006, 1))
        for k in range(-1, 2):
            C.extend(K.box_buf(c + (-0.012, -0.055, 0.013 * k - 0.002), c + (-0.006, 0.055, 0.013 * k + 0.002), 'plastic_int', 0.0, 1))
    dash, gauges = binnacle()
    C.extend(dash)
    # pedals hanging from under the shelf
    for (py, w_, name) in ((DRIVER_Y + 0.12, 0.045, 'clutch'), (DRIVER_Y + 0.0, 0.055, 'brake'), (DRIVER_Y - 0.13, 0.035, 'throttle')):
        base = np.array([xs0 + 0.08, py, f1])
        pad = np.array([xs0 + 0.10, py, FLOOR_Z + (0.16 if name != 'throttle' else 0.12)])
        C.extend(K.tube_buf(np.array([base, (base + pad) / 2 + (-0.03, 0, 0), pad + (0, 0, 0.04)]), 0.009, 'steel', 6))
        C.extend(K.box_buf(pad + (-0.012, -w_, -0.045 if name != 'throttle' else -0.08), pad + (0.012, w_, 0.045), 'rubber', 0.006, 2,
                           xf=K.mat4_rot((0, 1, 0), -18, pad)))
    # the steering column: a long shroud from the wheel down to the floor
    p, d = steering_mount()
    length = (p[2] - FLOOR_Z) / -d[2]
    C.extend(K.cyl_buf(p + d * 0.06, p + d * 0.34, 0.046, 'plastic_int', 18, r1=0.04))
    C.extend(K.cyl_buf(p + d * 0.34, p + d * (length + 0.01), 0.028, 'trim', 12))
    # the battery's tray at the front of the footwell (the battery part sits on it)
    bx, by, bz = BATTERY
    C.extend(K.box_buf((bx - 0.20, by - 0.12, bz - 0.004), (bx + 0.20, by + 0.12, bz + 0.012), 'steel', 0.004, 1))
    C.extend(K.box_buf((bx - 0.20, by - 0.12, bz + 0.012), (bx - 0.19, by + 0.12, bz + 0.05), 'steel', 0.002, 1))
    # the horn's bracket on the nose's inside behind the louvres
    C.extend(K.box_buf((D['xf'] - 0.06, -0.34, 0.76), (D['xf'] - 0.045, -0.26, 0.85), 'steel', 0.003, 1))
    # interior mirror on the header, sun visors
    mx = float(S.FRONT.to3d(np.array([[0.0, D['ws_head'] - 0.06]]))[0][0, 0]) - 0.05
    mp = np.array([mx, 0.0, D['ws_head'] - 0.08])
    C.extend(K.box_buf(mp + (-0.01, -0.012, 0.02), mp + (0.012, 0.012, 0.095), 'plastic_int', 0.004, 2))
    C.extend(K.box_buf(mp + (-0.025, -0.14, -0.035), mp + (0.0, 0.14, 0.03), 'plastic_int', 0.012, 3))
    C.extend(K.box_buf(mp + (-0.0262, -0.13, -0.027), mp + (-0.0255, 0.13, 0.022), 'glass_dark', 0.0, 1))
    for sy in (1, -1):
        vp = np.array([mx - 0.03, sy * 0.58, D['ws_head'] + 0.01])
        C.extend(K.box_buf(vp + (-0.20, -0.27, -0.012), vp + (0.0, 0.27, 0.008), 'fabric', 0.01, 3, xf=K.mat4_rot((0, 1, 0), 6, vp)))
    # ---------------------------------------------------------------- the room
    # wood floor from the bed's platform to the cab
    L.extend(K.box_buf((BED_X1 - 0.01, 0.0, FLOOR_Z - 0.03), (ROOM_FRONT_X - 0.02, IN_Y, FLOOR_Z), 'wood', 0.004, 1))
    # the dinette (left: as it is): bench A with its back to the cab, the table on its leg, bench B facing it
    for (x0, x1, back) in ((DIN_A[0], DIN_A[1], +1), (DIN_B[0], DIN_B[1], -1)):
        C.extend(K.box_buf((x0, DIN_Y, FLOOR_Z - 0.005), (x1, IN_Y, BENCH_Z - 0.10), 'wood', 0.01, 2))
        C.extend(K.box_buf((x0 + 0.005, DIN_Y - 0.012, BENCH_Z - 0.10), (x1 - 0.005, IN_Y - 0.01, BENCH_Z), 'fabric', 0.03, 3))
        bx0, bx1 = (x1 - 0.13, x1 - 0.005) if back > 0 else (x0 + 0.005, x0 + 0.13)
        C.extend(K.box_buf((bx0, DIN_Y + 0.01, BENCH_Z), (bx1, IN_Y - 0.02, BENCH_Z + 0.58), 'fabric', 0.035, 3))
    C.extend(K.box_buf((DIN_T[0], DIN_Y + 0.04, TABLE_Z - 0.032), (DIN_T[1], IN_Y - 0.005, TABLE_Z), 'wood', 0.008, 2))
    C.extend(K.box_buf((DIN_T[0] + 0.006, DIN_Y + 0.046, TABLE_Z - 0.0335), (DIN_T[1] - 0.006, IN_Y - 0.011, TABLE_Z - 0.031), 'chrome', 0.0, 1))
    tl = np.array([(DIN_T[0] + DIN_T[1]) / 2, (DIN_Y + IN_Y) / 2 - 0.05, 0.0])
    C.extend(K.cyl_buf((tl[0], tl[1], FLOOR_Z), (tl[0], tl[1], TABLE_Z - 0.032), 0.032, 'chrome', 14))
    C.extend(K.cyl_buf((tl[0], tl[1], FLOOR_Z), (tl[0], tl[1], FLOOR_Z + 0.012), 0.16, 'chrome', 20))
    # the pantry: a tall cupboard up to the lockers, its door to the aisle
    C.extend(K.box_buf((PANTRY_X[0], GALLEY_Y, FLOOR_Z - 0.005), (PANTRY_X[1], IN_Y, LOCKER_Z[0] - 0.02), 'wood', 0.01, 2))
    cupboard_doors(C, PANTRY_X[0], PANTRY_X[1], GALLEY_Y, FLOOR_Z + 0.06, LOCKER_Z[0] - 0.06, 1, -1, knob_z=FLOOR_Z + 0.98)
    # the galley along the left wall: its carcass, doors under drawers towards the aisle, the worktop, the sink at its
    # front end with the tap (the hobs stand on the rest of it), the splash board up to the window
    gx0, gx1, gy = GALLEY_X0, GALLEY_X1, GALLEY_Y
    C.extend(K.box_buf((gx0, gy, FLOOR_Z - 0.005), (gx1, IN_Y, WORKTOP_Z - 0.035), 'wood', 0.01, 2))
    nb = 4
    w = (gx1 - gx0) / nb
    for k in range(nb):
        a_, b_ = gx0 + k * w + 0.012, gx0 + (k + 1) * w - 0.012
        C.extend(K.box_buf((a_, gy - 0.014, FLOOR_Z + 0.08), (b_, gy + 0.001, WORKTOP_Z - 0.22), 'wood', 0.006, 2))
        C.extend(K.box_buf((a_, gy - 0.014, WORKTOP_Z - 0.20), (b_, gy + 0.001, WORKTOP_Z - 0.06), 'wood', 0.006, 2))
        km = (a_ + b_) / 2
        C.extend(K.box_buf((km - 0.06, gy - 0.028, WORKTOP_Z - 0.14), (km + 0.06, gy - 0.014, WORKTOP_Z - 0.12), 'chrome', 0.004, 1))
        C.extend(K.cyl_buf((b_ - 0.05, gy - 0.014, WORKTOP_Z - 0.34), (b_ - 0.05, gy - 0.034, WORKTOP_Z - 0.34), 0.012, 'chrome', 10))
    C.extend(K.box_buf((gx0 - 0.012, gy - 0.025, WORKTOP_Z - 0.035), (gx1 + 0.012, IN_Y, WORKTOP_Z), 'plastic_int', 0.008, 2))
    sx, sy_ = SINK_X, (gy + IN_Y) / 2
    C.extend(K.box_buf((sx - 0.21, sy_ - 0.17, WORKTOP_Z - 0.002), (sx + 0.21, sy_ + 0.17, WORKTOP_Z + 0.008), 'chrome', 0.006, 2))
    C.extend(K.box_buf((sx - 0.18, sy_ - 0.14, WORKTOP_Z + 0.008), (sx + 0.18, sy_ + 0.14, WORKTOP_Z + 0.0095), 'steel', 0.0, 1))
    C.extend(K.cyl_buf((sx, sy_, WORKTOP_Z + 0.0095), (sx, sy_, WORKTOP_Z + 0.011), 0.022, 'trim', 12))
    tap = np.array([(sx, IN_Y - 0.03, WORKTOP_Z), (sx, IN_Y - 0.03, WORKTOP_Z + 0.24), (sx, IN_Y - 0.10, WORKTOP_Z + 0.27), (sx, IN_Y - 0.16, WORKTOP_Z + 0.20)])
    C.extend(K.tube_buf(smooth_path(tap, 2), 0.012, 'chrome', 10))
    C.extend(K.cyl_buf((sx + 0.08, IN_Y - 0.04, WORKTOP_Z), (sx + 0.08, IN_Y - 0.04, WORKTOP_Z + 0.05), 0.017, 'chrome', 10))
    C.extend(K.box_buf((gx0, IN_Y - 0.015, WORKTOP_Z), (gx1, IN_Y - 0.002, D['win_gal'][2] - 0.02), 'ceramic', 0.004, 1))
    # the lockers over the left wall: over the galley and the pantry, over the dinette
    lockers(C, GALLEY_X0, PANTRY_X[1] + 0.02, 5)
    lockers(C, PANTRY_X[1] + 0.02, DIN_A[1], 3)
    # (right: in left coordinates) the fridge's cabinet behind the passenger's seat: its niche on a plinth over the front
    # wheel's hump (a drawer in the plinth) for a fridge to stand in, a cupboard over the niche up to the lockers' line
    fx0, fx1, fy = FRIDGE_X[0], FRIDGE_X[1], FRIDGE_Y
    for x0, x1 in ((fx0, fx0 + 0.022), (fx1 - 0.022, fx1)):
        R.extend(K.box_buf((x0, fy, FLOOR_Z - 0.005), (x1, IN_Y, NICHE_Z), 'wood', 0.005, 1))
    R.extend(K.box_buf((fx0, IN_Y - 0.02, FLOOR_Z), (fx1, IN_Y + 0.005, NICHE_Z), 'wood', 0.0, 1))
    R.extend(K.box_buf((fx0 + 0.022, fy, FLOOR_Z - 0.005), (fx1 - 0.022, IN_Y - 0.02, PLINTH_Z), 'wood', 0.008, 2))
    R.extend(K.box_buf((fx0 + 0.035, fy - 0.014, FLOOR_Z + 0.05), (fx1 - 0.035, fy + 0.001, PLINTH_Z - 0.03), 'wood', 0.006, 2))
    R.extend(K.box_buf(((fx0 + fx1) / 2 - 0.08, fy - 0.028, PLINTH_Z - 0.10), ((fx0 + fx1) / 2 + 0.08, fy - 0.014, PLINTH_Z - 0.08), 'chrome', 0.004, 1))
    R.extend(K.box_buf((fx0, fy, NICHE_Z), (fx1, IN_Y, LOCKER_Z[1]), 'wood', 0.01, 2))
    cupboard_doors(R, fx0, fx1, fy, NICHE_Z + 0.03, LOCKER_Z[1] - 0.03, 2, -1, knob_z=NICHE_Z + 0.10)
    # the entry door's step (right side, in left coordinates)
    R.extend(K.box_buf((D['sd_x0'] + 0.03, IN_Y - 0.20, FLOOR_Z - 0.03), (D['sd_x1'] - 0.03, IN_Y + 0.04, D['sd_z0'] - 0.012), 'wood', 0.006, 2))
    R.extend(K.box_buf((D['sd_x0'] + 0.03, IN_Y + 0.02, D['sd_z0'] - 0.016), (D['sd_x1'] - 0.03, IN_Y + 0.055, D['sd_z0'] - 0.004), 'alu', 0.003, 1))
    # the sofa along the right wall: its base, the seat cushion, the back cushions against the wall, an arm at each end
    s0, s1, sy = SOFA_X[0], SOFA_X[1], SOFA_Y
    R.extend(K.box_buf((s0, sy, FLOOR_Z - 0.005), (s1, IN_Y, SOFA_Z - 0.12), 'wood', 0.01, 2))
    for k in range(3):
        a_, b_ = s0 + 0.12 + k * (s1 - s0 - 0.24) / 3 + 0.004, s0 + 0.12 + (k + 1) * (s1 - s0 - 0.24) / 3 - 0.004
        R.extend(K.box_buf((a_, sy - 0.015, SOFA_Z - 0.12), (b_, IN_Y - 0.15, SOFA_Z), 'fabric', 0.035, 3))
        R.extend(K.box_buf((a_, IN_Y - 0.17, SOFA_Z), (b_, IN_Y - 0.02, SOFA_Z + 0.50), 'fabric', 0.045, 3, xf=K.mat4_rot((1, 0, 0), -8, ((a_ + b_) / 2, IN_Y - 0.02, SOFA_Z))))
    for x0, x1 in ((s0, s0 + 0.12), (s1 - 0.12, s1)):
        R.extend(K.box_buf((x0, sy - 0.02, FLOOR_Z - 0.005), (x1, IN_Y - 0.01, SOFA_Z + 0.20), 'fabric', 0.04, 3))
    # the lockers over the right wall, over the sofa (the fridge's cabinet goes up to their top)
    lockers(R, SOFA_X[0], SOFA_X[1] + 0.02, 5)
    # ---------------------------------------------------------------- the bedroom
    # the bed's platform from the firewall forward over the rear wheels (their wells, the gearbox and the dampers' tops
    # inside it), its front a row of cupboard doors with their knobs
    wy = WELL_IN_R - 0.006
    wz = D['hub_z'] + WELL_R + 0.02
    L.extend(K.box_buf((FIREWALL_X, 0.0, FLOOR_Z - 0.005), (BED_X1, wy, DECK_Z), 'wood', 0.012, 2))
    L.extend(K.box_buf((FIREWALL_X, wy, wz), (BED_X1, IN_Y, DECK_Z), 'wood', 0.012, 2))
    L.extend(K.box_buf((BED_X1 - 0.03, wy, FLOOR_Z - 0.005), (BED_X1, IN_Y, wz + 0.01), 'wood', 0.006, 1))
    for y0, y1, ky in ((0.03, 0.56, 0.50), (0.60, IN_Y - 0.03, 0.66)):
        L.extend(K.box_buf((BED_X1, y0, FLOOR_Z + 0.07), (BED_X1 + 0.014, y1, DECK_Z - 0.06), 'wood', 0.006, 2))
        L.extend(K.cyl_buf((BED_X1 + 0.014, ky, DECK_Z - 0.17), (BED_X1 + 0.034, ky, DECK_Z - 0.17), 0.012, 'chrome', 10))
    # the deck behind it over the engine (carpeted), the mattress across the whole back over both, a pillow each side,
    # a blanket folded over the foot of the bed
    L.extend(K.prism_buf(corner_plan(D['xr'] + 0.03, FIREWALL_X + 0.012, 0.0, IN_Y + 0.01, 'R', D['rho_r'] - 0.06), DECK_Z - 0.02, DECK_Z, 'fabric', 0.008, 2))
    L.extend(K.prism_buf(corner_plan(D['xr'] + 0.05, BED_X1 + 0.015, 0.0, IN_Y - 0.005, 'R', D['rho_r'] - 0.07), DECK_Z, BED_TOP, 'fabric', 0.04, 3))
    L.extend(K.box_buf((D['xr'] + 0.10, 0.14, BED_TOP - 0.012), (D['xr'] + 0.52, 0.96, BED_TOP + 0.085), 'fabric', 0.04, 3))
    L.extend(K.box_buf((BED_X1 - 0.70, 0.0, BED_TOP - 0.01), (BED_X1 + 0.02, IN_Y - 0.03, BED_TOP + 0.035), 'leather', 0.015, 2))
    # ---------------------------------------------------------------- the lamps in the ceiling
    for lx in (1.65, -0.70, -3.00):
        c = np.array([lx, 0.0, CEIL_Z])
        C.extend(K.cyl_buf(c + (0, 0, 0.002), c - (0, 0, 0.018), 0.13, 'trim', 24))
        C.extend(K.cyl_buf(c - (0, 0, 0.018), c - (0, 0, 0.026), 0.11, 'emit', 24))
    out['L'] = L
    out['C'] = C
    out['R'] = R
    out['gauges'] = gauges
    return out


def binnacle():
    """The instrument binnacle on a stalk from the shelf, over the far side of the wheel's rim, turned to the eye:
    the speedometer and the rev counter, the fuel and temperature dials between them."""
    b = K.Buf()
    eye = np.array(EYE)
    pc = np.array([SEAT_X + 0.50, DRIVER_Y, SEAT_Z + 0.65])
    dn = K.unit(eye - pc)
    dn = K.unit(np.array([dn[0], 0.0, dn[2]]))
    R = K.frame_from((0, 1, 0), dn)
    M = K.mat4_trs(pc, R)
    b.extend(K.box_buf((-0.205, -0.064, -0.045), (0.205, 0.064, 0.0), 'trim', 0.014, 2, xf=M))
    b.extend(K.box_buf((-0.215, 0.046, -0.055), (0.215, 0.082, 0.03), 'plastic_int', 0.012, 2, xf=M))
    base = pc - dn * 0.035 + np.array([0.0, 0.0, -0.05])
    b.extend(K.cyl_buf(base, np.array([base[0] + 0.05, DRIVER_Y, DASH_TOP + 0.01]), 0.026, 'plastic_int', 12))
    gauges = []
    for (gy, gz, r, name, big) in ((0.092, 0.0, 0.054, 'N_speed', True), (-0.092, 0.0, 0.054, 'N_rpm', True),
                                   (0.0, 0.028, 0.022, 'N_fuel', False), (0.0, -0.028, 0.022, 'N_temp', False)):
        c = pc + R[:, 0] * gy + R[:, 1] * gz
        db, g = dial(c, dn, r, big, 'chrome')
        b.extend(db)
        g['name'] = name
        gauges.append(g)
    return b, gauges


def door_extras(ex, key):
    """A door's outside handle and lock, its hinges on the front edge, the inside pull and (the cab door's) the window
    crank (left coordinates; key 'door' the cab door, 'side' the entry door)."""
    b = K.Buf()
    if key == 'door':
        x0, x1, zh = D['cd_x0'], D['cd_x1'], 1.62
        xh = x0 + 0.13
        hz = (1.20, 2.20)
    else:
        x0, x1, zh = D['sd_x0'], D['sd_x1'], 1.36
        xh = x0 + 0.11
        hz = (0.90, 2.30)
    ph, nh = S.SIDE.to3d(np.array([[xh, zh]]))
    ph = ph[0]
    b.extend(K.box_buf((-0.065, -0.006, -0.018), (0.065, 0.0015, 0.018), 'trim', 0.004, 2, xf=K.mat4_trs(ph)))
    b.extend(K.box_buf((-0.055, -0.002, -0.009), (0.055, 0.013, 0.009), 'chrome', 0.006, 2, xf=K.mat4_trs(ph)))
    pk, nk = S.SIDE.to3d(np.array([[xh + 0.11, zh]]))
    b.extend(K.cyl_buf(pk[0] - nk[0] * 0.002, pk[0] + nk[0] * 0.006, 0.0095, 'chrome', 14))
    for zz in hz:
        p0, n0 = S.SIDE.to3d(np.array([[x1 - 0.004, zz]]))
        p0 = p0[0] - n0[0] * 0.03
        b.extend(K.box_buf(p0 + (-0.012, -0.03, -0.035), p0 + (0.004, 0.0, 0.035), 'steel', 0.004, 2))
    # inside: the pull (and the cab door's crank)
    pin, nin = S.SIDE.to3d(np.array([[x0 + 0.20, zh - 0.10]]))
    pin = pin[0] - nin[0] * 0.05
    b.extend(K.box_buf(pin + (-0.07, -0.03, -0.012), pin + (0.07, 0.0, 0.012), 'plastic_int', 0.008, 2))
    if key == 'door':
        pc, nc = S.SIDE.to3d(np.array([[x0 + 0.45, zh - 0.16]]))
        pc = pc[0] - nc[0] * 0.05
        b.extend(K.cyl_buf(pc, pc - nc[0] * 0.02, 0.022, 'chrome', 14))
        end = pc - nc[0] * 0.02 + np.array([0.07, 0.0, 0.0])
        b.extend(K.tube_buf(np.array([pc - nc[0] * 0.02, end]), 0.006, 'chrome', 6))
        b.extend(K.cyl_buf(end, end - nc[0] * 0.04, 0.012, 'plastic_int', 10))
    return b


def lid_details(key):
    """The engine lid: louvres across its upper part (left half)."""
    b = K.Buf()
    if key == 'lid':
        prof = np.array([(-0.007, 0.0), (-0.006, 0.008), (0.007, 0.005), (0.008, 0.0)])
        for z in np.arange(1.06, 1.31, 0.032):
            ys = np.linspace(0.10, 0.62, 6)
            P, N = S.REAR.to3d(np.stack([ys, np.full(len(ys), z)], 1))
            V, Nn, Tr = K.sweep(P - N * 0.0005, N, prof, closed=False)
            b.add(V, Nn, Tr, 'trim')
            for e in (0, -1):
                b.extend(K.fill_loop(V.reshape(len(P), -1, 3)[e], (0, np.sign(P[e, 1] - P[-1 - e, 1]), 0), 'trim'))
    return b


def lid_centre(key):
    """The engine lid's handle and its plate (on the centre line)."""
    b = K.Buf()
    p, n = S.REAR.to3d(np.array([[0.0, 0.97]]))
    b.extend(K.box_buf(p[0] + (-0.016, -0.085, -0.018), p[0] + (0.002, 0.085, 0.018), 'trim', 0.006, 2))
    b.extend(K.box_buf(p[0] + (-0.026, -0.07, -0.009), p[0] + (-0.008, 0.07, 0.009), 'chrome', 0.006, 2))
    from frames._sedan_build import plate_buf
    pp, pn = S.REAR.to3d(np.array([[0.0, 0.80]]))
    b.extend(plate_buf(pp[0], pn[0], (0.0, 0.0, 1.0), 0.33, 0.15, 'E8 619'))
    return b
