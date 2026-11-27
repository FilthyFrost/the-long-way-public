"""Turtle (frames/turtle.py): everything behind the outer skin — the Loaf's (frames/_van_inner.py) on the longer body, its room
an empty shell as Nomad Drive's camper van's: the floor from the cab to a deck over the rear axle, the engine's deck
behind that, the elevating roof's opening over it all; what one lives with is what the player puts in. The Loaf's own
words follow: everything behind the outer skin. The engine bay at the back (its tin firewall, the deck over it, the
carrier bar), the cab (the floor, the seat boxes over the front wheels and their struts, the console with the long
gear lever, a shelf of a dash with the binnacle and its four dials, pedals, the flat-angled column), the room
behind (the floor with the gearbox's tunnel, the bench's base over the rear axle, the engine deck), the door
cards, and the underbody (UNDER): the floor pan, the rails waisted round the wheel wells, crossmembers, the front
lower arms and the steering's box and rods, the rear trailing arms and drive shafts, the wheelhouse liners. The
hubs' carriers are objects of their own (knuckle()); struts, springs, brakes and the differential are the axles'
parts."""
import math
import sys

sys.dont_write_bytecode = True

import numpy as np  # noqa: E402

from frames import _kit as K  # noqa: E402
from frames import turtle as S  # noqa: E402
from frames._sedan_inner import dial, extrude_y, quad_sheet, rear_tub_cabin, smooth_path  # noqa: E402

D = S.D
PI = math.pi
FLOOR_Z = 0.42           # cab and room floor (mat top)
PAN_Z = 0.38             # under the floor
SEAT_Z = 0.65            # the front seats' boxes over the wheels (the seat parts stand on them)
SEAT_X = 1.36            # the stock bucket's eye is 0.16 behind and 0.90 over its floor attachment
DRIVER_Y = 0.42
EYE = (SEAT_X - 0.16, DRIVER_Y, SEAT_Z + 0.90)
ROOM_FRONT_X = 0.90      # where the cab ends and the room begins (the seat boxes' backs)
FIREWALL_X = -1.58       # the engine bay's front wall
DECK_Z = 0.92            # the engine deck's top (its underside 2 cm lower; clears engine while allowing standing)
# the deck over the rear axle, lowered slightly so standing headroom over the rear area is generous even with roof closed
AXLE_DECK_X1 = -0.63
AXLE_DECK_Z = FLOOR_Z + 0.36
DASH_FACE_X = 1.98       # the shelf's face towards the cab
DASH_TOP = 1.08
WALL_IN = -0.035         # how far inside the nose's skin the dash ends
GEAR_X = 1.72
CONSOLE_TOP = 0.64
COLUMN_DEG = 62.0
# the drivetrain at the back: the engine yawed half round (its fan and pulley to the lid, its flywheel to the
# transaxle), the gearbox ahead of the differential, yawed so its bell faces the differential
ENGINE = (-1.94, 0.0, 0.33)
GEARBOX = (-0.88, 0.0, 0.20)
TANK = (0.20, 0.0, 0.21)
BATTERY = (2.06, -0.02, FLOOR_Z)
FRAME_Y = 0.48           # the rails between the wheel wells (they narrow to RAIL_IN past the wells)
RAIL_IN = 0.28
RAIL_Z = 0.285           # the rails' centre height (under the floor, below the tank's filler hose)
WELL_IN_F = 0.41         # the wheel wells' inner walls
WELL_IN_R = 0.455
WELL_R = 0.43


def steering_mount():
    """(the wheel's hub, the column's direction forward-down): a big wheel lying flat, its column 62 deg down."""
    a = math.radians(COLUMN_DEG)
    return np.array([1.56, DRIVER_Y, 1.20]), np.array([math.cos(a), 0.0, -math.sin(a)])


def knuckle(hx, hy, hz, front=True):
    """A hub's carrier (left side, outer face +Y), an object of its own (KNUCKLE_<hub>) the game hangs on the
    wheel's pivot: the hub flange at the hub face with five studs and the centre cap, the spindle, and the
    carrier just inboard of the brake (front: up to the strut's foot; rear: the trailing arm's hub end)."""
    return K.knuckle_buf(hx, hy, hz, hy + 0.010, 0.072, 5, 0.056, 90.0, stud_r=0.0055, stud_len=0.008, cap_r=0.024,
                         cap_out=0.006, carrier=(0.05, 0.03, 0.11, 0.17 if front else 0.12))


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
    the wheel well, the carrier bar across the top at the back, a tin skirt along the bottom of the lid's
    opening."""
    b = K.Buf()
    xr = D['xr']
    under = DECK_Z - 0.02
    # firewall (faces the engine, rearwards), its stamped beads
    b.extend(quad_sheet((FIREWALL_X, 0.0, PAN_Z - 0.02), (0, 0.87, 0), (0, 0, under - PAN_Z + 0.02), 8, 5, (-1, 0, 0), 'paint'))
    for z in (0.55, 0.70):
        b.extend(K.tube_buf(np.array([(FIREWALL_X - 0.002, 0.06, z), (FIREWALL_X - 0.002, 0.77, z)]), 0.007, 'paint', 6))
    # the deck's underside (round the shell's corner at the back)
    pl = corner_plan(xr + 0.03, FIREWALL_X, 0.0, 0.87, 'R', 0.14)
    b.extend(K.fill_loop(np.stack([pl[:, 0], pl[:, 1], np.full(len(pl), under - 0.004)], 1), (0, 0, -1), 'paint', interior_step=0.12))
    # the side wall behind the wheel well (from short of the shell's corner) and over it
    xw = D['ax_r'] - WELL_R - 0.005
    xs = D['xr'] + 0.12
    b.extend(quad_sheet((xs, 0.87, 0.34), (xw - xs, 0, 0), (0, 0, under - 0.34), 4, 5, (0, -1, 0), 'paint'))
    zt = D['hub_z'] + math.sqrt(max(WELL_R ** 2 - (FIREWALL_X - D['ax_r']) ** 2, 0.0)) + 0.01
    b.extend(quad_sheet((xw, 0.87, zt), (FIREWALL_X - xw, 0, 0), (0, 0, under - zt), 2, 2, (0, -1, 0), 'paint'))
    # the engine carrier: a bar across the bay at the back under the deck (the engine hangs from it and the
    # transaxle), on brackets at the sides
    xc = ENGINE[0] - 0.235
    b.extend(K.box_buf((xc - 0.03, 0.0, 0.84), (xc + 0.03, 0.77, 0.90), 'steel', 0.006, 2))
    b.extend(K.box_buf((xc - 0.04, 0.77, 0.80), (xc + 0.04, 0.87, under), 'steel', 0.004, 1))
    return b


# ============================================================================================ underbody (UNDER)
def wheelhouse(xa, y0, y1, r, z_cut, mat='trim'):
    """Half cylinder liner over a wheel from y0 (its inner wall) out to y1, facing the wheel, down to z_cut each
    side; the inner wall's segment closes it."""
    za = D['hub_z']
    a0 = math.asin(max(-1.0, min(1.0, (z_cut - za) / r)))
    ths = np.linspace(a0, PI - a0, 22)
    V = np.array([(xa + r * math.cos(t), y, za + r * math.sin(t)) for t in ths for y in (y0, y1)])
    N = np.array([(-math.cos(t), 0.0, -math.sin(t)) for t in ths for y in (y0, y1)])
    b = K.Buf().add(V, N, K.grid_tris(len(ths), 2), mat)
    ring = np.array([(xa + r * math.cos(t), y0, za + r * math.sin(t)) for t in ths])
    b.extend(K.fill_loop(ring, (0, 1, 0), mat))
    return b


def rail_path():
    """A rail's centre line in plan (x, y), front to back: narrow past the front well, out between the wells, in
    again ahead of the rear axle's crossmember."""
    pts = [(2.22, RAIL_IN), (0.90, RAIL_IN), (0.66, FRAME_Y), (-0.56, FRAME_Y), (-0.74, RAIL_IN + 0.04), (-0.88, RAIL_IN + 0.04)]
    return smooth_path(pts, 2)


def underbody():
    """UNDER (left half): floor pan, rails, crossmembers, front lower arms, rear trailing arms and drive shafts,
    wheelhouse liners."""
    b = K.Buf()
    # the floor pan's underside: round the wheel wells
    xf_in = D['xf'] - 0.06
    xa, xr_a = D['ax_f'], D['ax_r']
    wf0, wf1 = xa - WELL_R - 0.01, xa + WELL_R + 0.01
    wr0, wr1 = xr_a - WELL_R - 0.01, xr_a + WELL_R + 0.01
    pan = 'trim'
    for (x0, x1, y0, y1) in ((FIREWALL_X, xf_in, 0.0, WELL_IN_F), (wr1, wf0, WELL_IN_F, 0.89)):
        b.extend(K.box_buf((x0, y0, PAN_Z - 0.006), (x1, y1, PAN_Z), pan, 0.003, 1))
    # ahead of the front wheel, round the nose's corner
    b.extend(K.prism_buf(corner_plan(wf1, xf_in, WELL_IN_F, 0.89, 'F', 0.36), PAN_Z - 0.006, PAN_Z, pan, 0.003, 1))
    # rails: a C section along the waisted centre line, low under the floor
    path2 = rail_path()
    path = np.stack([path2[:, 0], path2[:, 1], np.full(len(path2), RAIL_Z)], 1)[::-1]
    prof = np.array([(0.035, -0.05), (-0.035, -0.05), (-0.035, 0.05), (0.035, 0.05), (0.035, 0.042), (-0.027, 0.042),
                     (-0.027, -0.042), (0.035, -0.042)])[::-1]
    V, N, Tr = K.sweep(path, (0, 0, 1), prof, closed=False, closed_prof=True, smooth_prof=False)
    b.add(V, N, Tr, 'steel')
    for e in (0, -1):
        ring = V.reshape(len(path), -1, 3)[e]
        b.extend(K.fill_loop(ring, (np.sign(path[e, 0] - path[-1 - e, 0]), 0, 0), 'steel'))
    # crossmembers (halves): at the nose, behind the front wheels, under the middle of the floor, the rear arms' one
    for x, y1, zc in ((2.18, RAIL_IN, RAIL_Z), (0.82, RAIL_IN + 0.04, RAIL_Z), (-0.10, FRAME_Y - 0.03, RAIL_Z)):
        b.extend(K.box_buf((x - 0.035, 0.0, zc - 0.045), (x + 0.035, y1, zc + 0.045), 'steel', 0.004, 1))
    # the front axle's crossmember (the arms' pivots on it) between the rails
    b.extend(K.box_buf((xa - 0.06, 0.0, 0.22), (xa + 0.06, RAIL_IN + 0.02, 0.30), 'steel', 0.008, 2))
    # the rear arms' crossmember ahead of the rear axle, out to the sills, with the pivot brackets
    xc = -0.88
    b.extend(K.box_buf((xc - 0.05, 0.0, 0.29), (xc + 0.05, 0.81, 0.37), 'steel', 0.008, 2))
    # sill rails along the bottom of the body between the wheel wells
    b.extend(K.box_buf((wr1 + 0.02, 0.83, 0.33), (wf0 - 0.02, 0.89, PAN_Z), 'steel', 0.006, 1))
    # wheelhouse liners
    b.extend(wheelhouse(xa, WELL_IN_F, 0.91, WELL_R, 0.36))
    b.extend(wheelhouse(xr_a, WELL_IN_R, 0.91, WELL_R, 0.36))
    # front: the lower arm from the knuckle's foot back to two pivots on the crossmember (the strut is the
    # suspension part's, the knuckle and its hub an object of its own)
    hx, hy, hz = D['ax_f'], D['track_f'] / 2, D['hub_z']
    b.extend(K.tube_buf(np.array([(hx + 0.16, RAIL_IN - 0.01, 0.26), (hx, hy - 0.13, 0.21), (hx - 0.16, RAIL_IN - 0.01, 0.26)]), 0.015, 'steel', 8))
    for x in (hx + 0.16, hx - 0.16):
        b.extend(K.cyl_buf((x - 0.03, RAIL_IN - 0.01, 0.26), (x + 0.03, RAIL_IN - 0.01, 0.26), 0.022, 'rubber', 10))
    # the tie rod from the steering's track rod out to the knuckle's arm (ahead of the axle)
    b.extend(K.tube_buf(np.array([(hx + 0.13, 0.20, 0.29), (hx + 0.12, hy - 0.13, 0.29)]), 0.010, 'steel', 8))
    b.extend(K.cyl_buf((hx + 0.13, 0.20, 0.29), (hx + 0.13, 0.25, 0.29), 0.018, 'rubber', 10))
    # rear: the trailing arm from the hub's carrier forward to its pivot on the crossmember, the drive shaft from
    # the differential part's tube end out to the hub (its two rubber boots)
    rx, ry = D['ax_r'], D['track_r'] / 2
    arm = np.array([(rx, ry - 0.14, hz - 0.02), (rx + 0.20, ry - 0.17, hz), (xc - 0.02, 0.56, 0.33)])
    b.extend(K.tube_buf(smooth_path(arm, 1), 0.026, 'steel', 10))
    b.extend(K.cyl_buf((xc + 0.05, 0.56, 0.33), (xc - 0.06, 0.56, 0.33), 0.03, 'rubber', 12))
    y0, y1 = 0.312, ry - K.BRAKE_IN[1] - 0.012
    b.extend(K.cyl_buf((rx, y0, hz), (rx, y1, hz), 0.019, 'steel', 12))
    for (ya, yb) in ((y0, y0 + 0.07), (y1 - 0.07, y1)):
        V, N, Tr = K.lathe(np.array([(0.022, 0.0), (0.036, 0.012), (0.03, 0.024), (0.04, 0.038), (0.03, 0.052), (0.024, yb - ya)]),
                           (rx, ya, hz), (0, 1, 0), 14)
        b.add(V, N, Tr, 'rubber')
    return b


def centre_under():
    """Centre and one-sided parts: the steering box under the driver's feet with its drop arm and the track rod
    across ahead of the front axle; the gearbox's coupling to the differential part; the fuel tank's filler hose
    from the flap on the left; the gear linkage rod back from the lever to the gearbox."""
    b = K.Buf()
    hx, hz = D['ax_f'], D['hub_z']
    p, d = steering_mount()
    foot = p + d * ((p[2] - FLOOR_Z) / -d[2])
    bx, by = foot[0], foot[1]
    b.extend(K.box_buf((bx - 0.07, by - 0.05, 0.27), (bx + 0.05, by + 0.05, PAN_Z - 0.01), 'steel', 0.012, 2))
    b.extend(K.cyl_buf((bx, by, PAN_Z - 0.01), (bx, by, FLOOR_Z + 0.002), 0.03, 'rubber', 12))
    b.extend(K.tube_buf(np.array([(bx - 0.02, by - 0.06, 0.28), (hx + 0.13, by - 0.10, 0.29)]), 0.012, 'steel', 8))
    b.extend(K.tube_buf(np.array([(hx + 0.13, 0.25, 0.29), (hx + 0.13, -0.25, 0.29)]), 0.013, 'steel', 8))
    # the coupling from the gearbox's bell to the differential part's companion flange
    gx = GEARBOX[0] - 0.197
    fx = D['ax_r'] + 0.2645 + 0.012
    zc = D['hub_z'] - 0.024
    b.extend(K.cyl_buf((fx, 0.0, zc), (gx + 0.01, 0.0, zc), 0.03, 'steel', 14))
    for x in (fx, gx + 0.01):
        b.extend(K.cyl_buf((x - 0.012, 0.0, zc), (x + 0.012, 0.0, zc), 0.045, 'steel', 14))
    # the gear linkage: from the lever's foot under the console back along the middle to the gearbox's tail
    b.extend(K.tube_buf(np.array([(GEAR_X, 0.0, PAN_Z - 0.03), (1.15, 0.0, PAN_Z - 0.03), (GEARBOX[0] + 0.30, 0.0, PAN_Z - 0.04)]), 0.009, 'steel', 6))
    # the filler hose (down inside the wall from the pocket behind the flap, unseen) in under the floor to the
    # tank's neck, over the rail
    fx_ = D['fuel'][0]
    path = np.array([(fx_ + 0.02, 0.81, 0.354), (fx_ + 0.04, 0.62, 0.354), (fx_ + 0.055, 0.52, 0.35), (fx_ + 0.06, 0.47, 0.33)])
    b.extend(K.tube_buf(smooth_path(path, 1), 0.018, 'rubber', 10))
    return b


# ============================================================================================ interior
def seat_box(x0, x1, y0, y1, z1, mat):
    return K.box_buf((x0, y0, FLOOR_Z - 0.005), (x1, y1, z1), mat, 0.02, 2)


def interior(ex):
    """INTERIOR: L (left half, mirrored), C (as it is), R (right side only, in left coordinates: the sliding door's
    step), gauges (the dial layout for the needles)."""
    out = {}
    L = K.Buf()
    C = K.Buf()
    R = K.Buf()
    xa, xr_a = D['ax_f'], D['ax_r']
    # ---------------------------------------------------------------- the cab
    # floor mat from the room to the nose, round the nose's corner
    L.extend(K.prism_buf(corner_plan(ROOM_FRONT_X - 0.02, D['xf'] - 0.035, 0.0, 0.87, 'F', 0.36), FLOOR_Z - 0.03, FLOOR_Z, 'rubber', 0.004, 1))
    # each front seat stands on a box beside its wheel's well and over it on the well's hump (the strut rises into
    # the hump and the seat's cushion)
    L.extend(seat_box(xa - 0.40, xa + 0.40, 0.13, WELL_IN_F - 0.006, SEAT_Z, 'fabric'))
    L.extend(rear_tub_cabin(xa, D['hub_z'], WELL_R + 0.015, WELL_IN_F, 0.88, FLOOR_Z, 'fabric'))
    # the console between the seats: the long gear lever stands on it, the handbrake behind
    C.extend(K.box_buf((1.04, -0.12, FLOOR_Z - 0.005), (1.84, 0.12, CONSOLE_TOP), 'plastic_int', 0.02, 2))
    V, N, Tr = K.lathe(np.array([(0.0, 0.012), (0.035, 0.012), (0.06, 0.004), (0.072, 0.0)])[::-1], (GEAR_X, 0.0, CONSOLE_TOP + 0.001), (0, 0, 1), 20)
    C.add(V, N, Tr, 'rubber')
    C.extend(K.box_buf((1.15, -0.03, CONSOLE_TOP - 0.004), (1.45, 0.03, CONSOLE_TOP + 0.004), 'trim', 0.003, 1))
    # the dash: a padded shelf under the glass, its painted face sloping down to the footwell, a glovebox; both
    # follow the nose round its corners
    xs0 = DASH_FACE_X

    def nose_in(y, z):
        return float(S.FRONT.to3d(np.array([[min(abs(y), 0.90), z]]))[0][0, 0]) + WALL_IN

    def shelf_sec(y):
        x1 = nose_in(y, DASH_TOP)
        return K.round_profile(np.array([(x1, DASH_TOP - 0.03), (x1, DASH_TOP), (xs0 + 0.02, DASH_TOP + 0.004), (xs0 - 0.035, DASH_TOP + 0.016),
                                         (xs0 - 0.04, DASH_TOP - 0.01), (xs0 - 0.01, DASH_TOP - 0.035)]), [0, 0.01, 0.02, 0.012, 0.012, 0], 1)

    def face_sec(y):
        x1 = min(nose_in(y, 0.86), nose_in(y, DASH_TOP - 0.035))
        return K.round_profile(np.array([(xs0 - 0.01, DASH_TOP - 0.035), (xs0, 0.86), (xs0 + 0.10, 0.70), (x1, 0.70), (x1, DASH_TOP - 0.035)]), [0, 0.03, 0.03, 0, 0], 2)
    ys = np.concatenate([np.linspace(-0.86, -0.54, 8), np.linspace(-0.42, 0.42, 3), np.linspace(0.54, 0.86, 8)])
    C.extend(extrude_y(None, ys, 'plastic_int', inside=(xs0 + 0.1, 0.0, DASH_TOP - 0.01), sec_fn=shelf_sec))
    C.extend(extrude_y(None, ys, 'paint_b', inside=(xs0 + 0.12, 0.0, 0.9), sec_fn=face_sec))
    C.extend(K.box_buf((xs0 - 0.012, -0.70, 0.90), (xs0 + 0.01, -0.30, 1.02), 'paint_b', 0.012, 2))
    C.extend(K.box_buf((xs0 - 0.018, -0.52, 0.995), (xs0 - 0.01, -0.48, 1.01), 'chrome', 0.003, 1))
    # the radio's slot in the face (the radio part sits in it), heater levers over it
    C.extend(K.box_buf((xs0 - 0.012, -0.097, 0.964), (xs0 - 0.004, 0.097, 1.02), 'chrome', 0.003, 2))
    C.extend(K.box_buf((xs0 - 0.013, -0.09, 0.969), (xs0 + 0.06, 0.09, 1.015), 'trim', 0.002, 1))
    for k in range(3):
        yy = -0.05 + 0.05 * k
        C.extend(K.box_buf((xs0 - 0.03, yy - 0.006, 0.93), (xs0 - 0.012, yy + 0.006, 0.944), 'plastic_int', 0.003, 1))
    # vents at the ends of the face
    for vy in (0.70, -0.74):
        c = np.array([xs0 - 0.004, vy, 1.0])
        C.extend(K.box_buf(c + (-0.008, -0.05, -0.022), c + (0.004, 0.05, 0.022), 'trim', 0.006, 1))
        for k in range(-1, 2):
            C.extend(K.box_buf(c + (-0.012, -0.045, 0.012 * k - 0.002), c + (-0.006, 0.045, 0.012 * k + 0.002), 'plastic_int', 0.0, 1))
    dash, gauges = binnacle()
    C.extend(dash)
    # pedals hanging from under the shelf
    for (py, w_, name) in ((DRIVER_Y + 0.11, 0.045, 'clutch'), (DRIVER_Y + 0.0, 0.055, 'brake'), (DRIVER_Y - 0.12, 0.035, 'throttle')):
        base = np.array([xs0 + 0.08, py, 0.86])
        pad = np.array([xs0 + 0.10, py, 0.58 if name != 'throttle' else 0.54])
        C.extend(K.tube_buf(np.array([base, (base + pad) / 2 + (-0.03, 0, 0), pad + (0, 0, 0.04)]), 0.008, 'steel', 6))
        C.extend(K.box_buf(pad + (-0.012, -w_, -0.04 if name != 'throttle' else -0.07), pad + (0.012, w_, 0.04), 'rubber', 0.006, 2,
                           xf=K.mat4_rot((0, 1, 0), -18, pad)))
    # the steering column: a long shroud from the wheel down to the floor
    p, d = steering_mount()
    length = (p[2] - FLOOR_Z) / -d[2]
    C.extend(K.cyl_buf(p + d * 0.06, p + d * 0.30, 0.042, 'plastic_int', 18, r1=0.036))
    C.extend(K.cyl_buf(p + d * 0.30, p + d * (length + 0.01), 0.026, 'trim', 12))
    # the battery's tray at the front of the footwell (the battery part sits on it)
    bx, by, bz = BATTERY
    C.extend(K.box_buf((bx - 0.16, by - 0.11, bz - 0.004), (bx + 0.16, by + 0.11, bz + 0.012), 'steel', 0.004, 1))
    C.extend(K.box_buf((bx - 0.16, by - 0.11, bz + 0.012), (bx - 0.15, by + 0.11, bz + 0.05), 'steel', 0.002, 1))
    # the horn's bracket on the nose's inside behind the louvres
    C.extend(K.box_buf((D['xf'] - 0.05, -0.24, 0.57), (D['xf'] - 0.035, -0.16, 0.66), 'steel', 0.003, 1))
    # interior mirror on the header, sun visors
    mx = float(S.FRONT.to3d(np.array([[0.0, D['ws_head'] - 0.06]]))[0][0, 0]) - 0.05
    mp = np.array([mx, 0.0, D['ws_head'] - 0.08])
    C.extend(K.box_buf(mp + (-0.01, -0.012, 0.02), mp + (0.012, 0.012, 0.075), 'plastic_int', 0.004, 2))
    C.extend(K.box_buf(mp + (-0.025, -0.12, -0.03), mp + (0.0, 0.12, 0.025), 'plastic_int', 0.012, 3))
    C.extend(K.box_buf(mp + (-0.0262, -0.11, -0.022), mp + (-0.0255, 0.11, 0.017), 'glass_dark', 0.0, 1))
    for sy in (1, -1):
        vp = np.array([mx - 0.03, sy * 0.44, D['ws_head']])
        C.extend(K.box_buf(vp + (-0.17, -0.20, -0.012), vp + (0.0, 0.20, 0.008), 'fabric', 0.01, 3, xf=K.mat4_rot((0, 1, 0), 6, vp)))
    # ---------------------------------------------------------------- the room: an empty shell
    # (nothing built in, as Nomad Drive's camper van: what one lives with is what the player puts in)
    # wood floor from the deck over the rear axle to the cab, out under the walls' lining (it stopped 1.6 cm short of it:
    # along the walls, bare now, a slot down to the sills)
    L.extend(K.box_buf((AXLE_DECK_X1 - 0.01, 0.0, FLOOR_Z - 0.03), (ROOM_FRONT_X - 0.02, 0.89, FLOOR_Z), 'wood', 0.004, 1))
    # the deck over the rear axle (the wells, the gearbox and the dampers' tops under it): between the wells from the
    # floor, out to the walls ahead of them, over them from the wells' tops; its front the step up to it
    wy = WELL_IN_R - 0.006
    wx1 = xr_a + WELL_R + 0.02
    wz = D['hub_z'] + WELL_R + 0.02
    L.extend(K.box_buf((FIREWALL_X, 0.0, FLOOR_Z - 0.005), (AXLE_DECK_X1, wy, AXLE_DECK_Z), 'wood', 0.008, 2))
    L.extend(K.box_buf((wx1, wy, FLOOR_Z - 0.005), (AXLE_DECK_X1, 0.89, AXLE_DECK_Z), 'wood', 0.008, 2))
    L.extend(K.box_buf((FIREWALL_X, wy, wz), (wx1, 0.89, AXLE_DECK_Z), 'wood', 0.008, 2))
    # the engine deck behind it (carpeted, as the Loaf's), and its front over the axle's deck up to it, wall to wall
    L.extend(K.box_buf((FIREWALL_X + 0.002, 0.0, AXLE_DECK_Z - 0.01), (FIREWALL_X + 0.022, 0.89, DECK_Z - 0.005), 'wood', 0.004, 1))
    L.extend(K.prism_buf(corner_plan(D['xr'] + 0.03, FIREWALL_X + 0.022, 0.0, 0.88, 'R', 0.14), DECK_Z - 0.02, DECK_Z, 'fabric', 0.008, 2))
    # the sliding door's step (right side, in left coordinates)
    R.extend(K.box_buf((D['sd_x0'] + 0.03, 0.69, FLOOR_Z - 0.03), (D['sd_x1'] - 0.03, 0.89, D['sd_z0'] - 0.012), 'wood', 0.006, 2))
    R.extend(K.box_buf((D['sd_x0'] + 0.03, 0.87, D['sd_z0'] - 0.016), (D['sd_x1'] - 0.03, 0.905, D['sd_z0'] - 0.004), 'alu', 0.003, 1))
    # (the room's lamp is on the elevating roof's underside: the roof over the room is its opening)
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
    pc = np.array([1.86, DRIVER_Y, 1.30])
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
    """A door's outside handle and lock, its hinges on the front edge, the inside pull and the window crank (left
    coordinates; key 'door' the cab door, 'side' the sliding door)."""
    b = K.Buf()
    if key == 'door':
        x0, x1, zh = D['cd_x0'], D['cd_x1'], 1.12
        xh = x0 + 0.13
        hz = (0.98, 1.82)
    else:
        x0, x1, zh = D['sd_x0'], D['sd_x1'], 1.10
        xh = x1 - 0.12
        hz = (0.72, 1.96)
    ph, nh = S.SIDE.to3d(np.array([[xh, zh]]))
    ph = ph[0]
    b.extend(K.box_buf((-0.065, -0.006, -0.018), (0.065, 0.0015, 0.018), 'trim', 0.004, 2, xf=K.mat4_trs(ph)))
    b.extend(K.box_buf((-0.055, -0.002, -0.009), (0.055, 0.013, 0.009), 'chrome', 0.006, 2, xf=K.mat4_trs(ph)))
    if key == 'door':
        pk, nk = S.SIDE.to3d(np.array([[xh + 0.11, zh]]))
        b.extend(K.cyl_buf(pk[0] - nk[0] * 0.002, pk[0] + nk[0] * 0.006, 0.0095, 'chrome', 14))
    for zz in hz:
        p0, n0 = S.SIDE.to3d(np.array([[x1 - 0.004, zz]]))
        p0 = p0[0] - n0[0] * 0.03
        b.extend(K.box_buf(p0 + (-0.012, -0.03, -0.035), p0 + (0.004, 0.0, 0.035), 'steel', 0.004, 2))
    # inside: the pull, the crank
    pin, nin = S.SIDE.to3d(np.array([[x0 + 0.20 if key == 'door' else x1 - 0.20, 1.05]]))
    pin = pin[0] - nin[0] * 0.05
    b.extend(K.box_buf(pin + (-0.07, -0.03, -0.012), pin + (0.07, 0.0, 0.012), 'plastic_int', 0.008, 2))
    pc, nc = S.SIDE.to3d(np.array([[x0 + 0.45 if key == 'door' else x0 + 0.45, 0.98]]))
    pc = pc[0] - nc[0] * 0.05
    b.extend(K.cyl_buf(pc, pc - nc[0] * 0.02, 0.022, 'chrome', 14))
    end = pc - nc[0] * 0.02 + np.array([0.07, 0.0, 0.0])
    b.extend(K.tube_buf(np.array([pc - nc[0] * 0.02, end]), 0.006, 'chrome', 6))
    b.extend(K.cyl_buf(end, end - nc[0] * 0.04, 0.012, 'plastic_int', 10))
    return b


def lid_details(key):
    """Engine lid: louvres in two groups, a chrome handle, the plate and its lamp; tailgate: a chrome handle and the
    hinge leaves (left halves except what lies on the centre line: those are in centre=True)."""
    b = K.Buf()
    if key == 'lid':
        prof = np.array([(-0.006, 0.0), (-0.005, 0.007), (0.006, 0.004), (0.007, 0.0)])
        for z in np.arange(0.735, 0.87, 0.026):
            ys = np.linspace(0.08, 0.38, 4)
            P, N = S.REAR.to3d(np.stack([ys, np.full(len(ys), z)], 1))
            V, Nn, Tr = K.sweep(P - N * 0.0005, N, prof, closed=False)
            b.add(V, Nn, Tr, 'trim')
            for e in (0, -1):
                b.extend(K.fill_loop(V.reshape(len(P), -1, 3)[e], (0, np.sign(P[e, 1] - P[-1 - e, 1]), 0), 'trim'))
    return b


def lid_centre(key):
    b = K.Buf()
    if key == 'lid':
        p, n = S.REAR.to3d(np.array([[0.0, 0.645]]))
        b.extend(K.box_buf(p[0] + (-0.016, -0.075, -0.016), p[0] + (0.002, 0.075, 0.016), 'trim', 0.006, 2))
        b.extend(K.box_buf(p[0] + (-0.024, -0.06, -0.008), p[0] + (-0.008, 0.06, 0.008), 'chrome', 0.006, 2))
        from frames._sedan_build import plate_buf
        pp, pn = S.REAR.to3d(np.array([[0.0, 0.535]]))
        b.extend(plate_buf(pp[0], pn[0], (0.0, 0.0, 1.0), 0.33, 0.15, 'C7 042'))
    else:
        p, n = S.REAR.to3d(np.array([[0.0, D['tg_z0'] + 0.10]]))
        b.extend(K.box_buf(p[0] + (-0.016, -0.09, -0.018), p[0] + (0.002, 0.09, 0.018), 'trim', 0.006, 2))
        b.extend(K.box_buf(p[0] + (-0.026, -0.075, -0.009), p[0] + (-0.008, 0.075, 0.009), 'chrome', 0.006, 2))
        pk = S.REAR.to3d(np.array([[0.13, D['tg_z0'] + 0.10]]))[0][0]
        b.extend(K.cyl_buf(pk + (0.002, 0, 0), pk + (-0.008, 0, 0), 0.0095, 'chrome', 14))
    return b
