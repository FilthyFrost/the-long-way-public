"""Camel (frames/camel.py): everything behind the outer skins — the Elephant's way (frames/_elephant_inner.py) in a school bus
emptied out. The cab at the front of the box (the floor, the driver's seat on its pedestal on the left, a console at its
right with the gear lever and the handbrake, the long dash under the windscreen with the binnacle and its four dials,
pedals, the column), a modesty panel behind the seat and a grab pole by the entry door, the stairwell inside the door;
the room behind: only the floor, the rear wheels' humps in it, the walls and the windows (the lining is the exterior's),
the lamps in the ceiling — what goes in is found by the road. The engine bay under the hood (the radiator behind the
grille, the engine and the gearbox behind it, the battery beside it); the underbody (UNDER): the floor pan, the ladder
frame's rails and crossmembers, the front lower arms and the steering's box and rods, the long drive shaft back to the
rear axle, the rear trailing arms and drive shafts, the wheelhouse liners. The hubs' carriers are objects of their own
(knuckle()); struts, springs, brakes and the differential are the axles' parts."""
import math
import sys

sys.dont_write_bytecode = True

import numpy as np  # noqa: E402

from frames import _kit as K  # noqa: E402
from frames import camel as S  # noqa: E402
from frames import camel_hood as H  # noqa: E402
from frames._sedan_inner import dial, extrude_y, quad_sheet, rear_tub_cabin, smooth_path  # noqa: E402

D = S.D
HD = H.D
PI = math.pi
IN_Y = D['hw'] - 0.05    # the walls' inside (the lining's face)
FLOOR_Z = 0.72           # the bus's floor (its plywood top)
PAN_Z = 0.68             # under the floor
SEAT_Z = 1.10            # the driver's seat's pedestal (the seat part stands on it)
SEAT_X = 2.18            # the stock bucket's eye is 0.16 behind and 0.90 over its floor attachment
DRIVER_Y = 0.66
EYE = (SEAT_X - 0.16, DRIVER_Y, SEAT_Z + 0.90)
ROOM_FRONT_X = 1.86      # where the cab ends: the modesty panel behind the seat
FIREWALL_X = D['xr'] - 2.0   # (no engine bay in the box: the lining has no bay)
DECK_Z = 1.0
DASH_FACE_X = 2.62       # the shelf's face towards the cab
DASH_TOP = 1.46
WALL_IN = -0.035
GEAR_X = SEAT_X + 0.30
CONSOLE_Y = 0.30         # the console right of the driver's seat (the gear lever and the handbrake on it)
CONSOLE_TOP = FLOOR_Z + 0.34
COLUMN_DEG = 62.0
# the seat behind the entry door (left bare at the works: the bus was emptied)
PASS_X = 1.40
PASS_Y = 0.72
# the drivetrain at the front: the engine under the hood, its fan to the radiator behind the grille, the gearbox behind it
# under the cab's floor, the long shaft back to the rear axle
ENGINE = (3.52, 0.0, 0.42)
GEARBOX = (2.62, 0.0, 0.30)
RADIATOR = (4.30, 0.0, 0.62)
BATTERY = (4.00, 0.74, 0.56)
TANK = (-1.25, 0.0, 0.18)
# the house battery (docs/V3/plan/rv.md): on the floor behind the modesty panel, by the wall
HOUSE_BATTERY = (1.62, IN_Y - 0.16, FLOOR_Z)
FRAME_Y = 0.50           # the ladder frame's rails, straight the whole length
RAIL_Z = 0.52
WELL_IN_F = 0.64         # the wheel wells' inner walls (the front's in the hood, the rear's in the box)
WELL_IN_R = 0.62
WELL_R = 0.53
LAMPS_X = (1.20, -0.80, -2.80, -4.40)


def steering_mount():
    """(the wheel's hub, the column's direction forward-down): a big wheel lying flat, its column 62 deg down."""
    a = math.radians(COLUMN_DEG)
    return np.array([SEAT_X + 0.24, DRIVER_Y, SEAT_Z + 0.52]), np.array([math.cos(a), 0.0, -math.sin(a)])


def knuckle(hx, hy, hz, front=True):
    """A hub's carrier (left side, outer face +Y), an object of its own (KNUCKLE_<hub>): the hub flange with eight studs and
    the centre cap, the spindle, the carrier inboard of the brake."""
    return K.knuckle_buf(hx, hy, hz, hy + 0.010, 0.090, 8, 0.072, 90.0, stud_r=0.0065, stud_len=0.010, cap_r=0.030,
                         cap_out=0.008, carrier=(0.06, 0.04, 0.13, 0.20 if front else 0.14))


# ============================================================================================ the engine bay (BODY)
def engine_bay():
    """Left half, under the hood: the firewall at the cowl, the inner wheelhouse over the front wheel and its splash
    shield, the radiator's support, the battery's tray."""
    b = K.Buf()
    xa = HD['ax_f']
    # the firewall at the cowl (faces forward, into the bay), its stamped beads
    xw = D['xf'] - 0.02
    b.extend(quad_sheet((xw, 0.0, 0.50), (0, 1.06, 0), (0, 0, 0.88), 8, 6, (1, 0, 0), 'paint'))
    for z in (0.80, 1.05):
        b.extend(K.tube_buf(np.array([(xw + 0.002, 0.06, z), (xw + 0.002, 0.98, z)]), 0.008, 'paint', 6))
    # the inner wheelhouse: a half drum over the front wheel inside the hood, from its inner wall out to the hood's side
    za = D['hub_z']
    r = WELL_R + 0.02
    ths = np.linspace(0.18, PI - 0.18, 22)
    V = np.array([(xa + r * math.cos(t), y, za + r * math.sin(t)) for t in ths for y in (WELL_IN_F, HD['hw'] - 0.04)])
    N = np.array([(math.cos(t), 0.0, math.sin(t)) for t in ths for y in (0, 1)])
    b.add(V, N, K.grid_tris(len(ths), 2), 'trim')
    ring = np.array([(xa + r * math.cos(t), WELL_IN_F, za + r * math.sin(t)) for t in ths])
    b.extend(K.fill_loop(ring, (0, -1, 0), 'trim'))
    # the radiator's support: a frame across the bay behind the grille
    rx = RADIATOR[0] + 0.07
    b.extend(K.box_buf((rx - 0.02, 0.0, RADIATOR[2] - 0.06), (rx + 0.02, 0.50, RADIATOR[2] - 0.02), 'steel', 0.004, 1))
    b.extend(K.box_buf((rx - 0.02, 0.47, RADIATOR[2] - 0.06), (rx + 0.02, 0.50, RADIATOR[2] + 0.72), 'steel', 0.004, 1))
    # the battery's tray beside the engine
    bx, by, bz = BATTERY
    b.extend(K.box_buf((bx - 0.20, by - 0.12, bz - 0.012), (bx + 0.20, by + 0.12, bz), 'steel', 0.004, 1))
    b.extend(K.box_buf((bx - 0.02, by - 0.12, bz - 0.20), (bx + 0.02, by + 0.12, bz - 0.012), 'steel', 0.004, 1))
    return b


# ============================================================================================ underbody (UNDER)
def wheelhouse(xa, y0, y1, r, z_cut, mat='trim'):
    za = D['hub_z']
    a0 = math.asin(max(-1.0, min(1.0, (z_cut - za) / r)))
    ths = np.linspace(a0, PI - a0, 24)
    V = np.array([(xa + r * math.cos(t), y, za + r * math.sin(t)) for t in ths for y in (y0, y1)])
    N = np.array([(-math.cos(t), 0.0, -math.sin(t)) for t in ths for y in (y0, y1)])
    b = K.Buf().add(V, N, K.grid_tris(len(ths), 2), mat)
    ring = np.array([(xa + r * math.cos(t), y0, za + r * math.sin(t)) for t in ths])
    b.extend(K.fill_loop(ring, (0, 1, 0), mat))
    return b


XC_R = D['ax_r'] + 0.70  # the rear arms' crossmember


def underbody():
    """UNDER (left half): the floor pan, the rails, crossmembers, the front lower arms, the rear trailing arms and drive
    shafts, the rear wheelhouse liner (the front's is the engine bay's)."""
    b = K.Buf()
    xa, xr_a = HD['ax_f'], D['ax_r']
    wr0, wr1 = xr_a - WELL_R - 0.01, xr_a + WELL_R + 0.01
    pan = 'trim'
    # the floor pan's underside, round the rear wheel well
    for (x0, x1, y0, y1) in ((D['xr'] + 0.08, D['xf'] - 0.03, 0.0, WELL_IN_R), (wr1, D['xf'] - 0.03, WELL_IN_R, IN_Y + 0.02), (D['xr'] + 0.08, wr0, WELL_IN_R, IN_Y + 0.02)):
        b.extend(K.box_buf((x0, y0, PAN_Z - 0.006), (x1, y1, PAN_Z), pan, 0.003, 1))
    # rails: a C section straight from under the hood to the tail
    path = np.array([(HD['xf'] - 0.22, FRAME_Y, RAIL_Z), (D['xr'] + 0.30, FRAME_Y, RAIL_Z)])
    prof = np.array([(0.045, -0.08), (-0.045, -0.08), (-0.045, 0.08), (0.045, 0.08), (0.045, 0.07), (-0.035, 0.07),
                     (-0.035, -0.07), (0.045, -0.07)])[::-1]
    V, N, Tr = K.sweep(path, (0, 0, 1), prof, closed=False, closed_prof=True, smooth_prof=False)
    b.add(V, N, Tr, 'steel')
    for e in (0, -1):
        ring = V.reshape(len(path), -1, 3)[e]
        b.extend(K.fill_loop(ring, (np.sign(path[e, 0] - path[-1 - e, 0]), 0, 0), 'steel'))
    for x in (HD['xf'] - 0.25, xa - 0.70, 1.60, 0.0, -1.60, XC_R, D['xr'] + 0.35):
        b.extend(K.box_buf((x - 0.04, 0.0, RAIL_Z - 0.07), (x + 0.04, FRAME_Y, RAIL_Z + 0.07), 'steel', 0.004, 1))
    # the outriggers out to the skirt between the wheels
    for x in (2.0, 0.8, -0.4, -1.6):
        b.extend(K.box_buf((x - 0.03, FRAME_Y, PAN_Z - 0.10), (x + 0.03, IN_Y, PAN_Z - 0.01), 'steel', 0.004, 1))
    # the rear arms' crossmember out to the skirt
    b.extend(K.box_buf((XC_R - 0.06, 0.0, RAIL_Z - 0.05), (XC_R + 0.06, IN_Y - 0.06, RAIL_Z + 0.05), 'steel', 0.008, 2))
    # the rear wheelhouse liner
    b.extend(wheelhouse(xr_a, WELL_IN_R, IN_Y + 0.05, WELL_R, D['z_bot'] + 0.04))
    # front: the lower arm from the knuckle's foot back to two pivots under the rail
    hx, hy, hz = xa, D['track_f'] / 2, D['hub_z']
    zp = RAIL_Z - 0.12
    b.extend(K.tube_buf(np.array([(hx + 0.20, FRAME_Y - 0.06, zp), (hx, hy - 0.16, hz - 0.13), (hx - 0.20, FRAME_Y - 0.06, zp)]), 0.02, 'steel', 8))
    for x in (hx + 0.20, hx - 0.20):
        b.extend(K.cyl_buf((x - 0.035, FRAME_Y - 0.06, zp), (x + 0.035, FRAME_Y - 0.06, zp), 0.027, 'rubber', 10))
    b.extend(K.tube_buf(np.array([(hx + 0.16, 0.26, zp + 0.02), (hx + 0.15, hy - 0.16, zp + 0.02)]), 0.012, 'steel', 8))
    # rear: the trailing arm inside the inner tyre forward to its pivot; the drive shaft out to the hub
    rx, ry = xr_a, D['track_r'] / 2
    xc = XC_R
    arm = np.array([(rx, 0.60, hz - 0.02), (rx + 0.26, 0.58, hz), (xc - 0.03, 0.58, RAIL_Z - 0.09)])
    b.extend(K.tube_buf(smooth_path(arm, 1), 0.032, 'steel', 10))
    b.extend(K.cyl_buf((xc + 0.06, 0.58, RAIL_Z - 0.09), (xc - 0.07, 0.58, RAIL_Z - 0.09), 0.036, 'rubber', 12))
    y0, y1 = 0.312, ry - K.BRAKE_IN[1] - 0.012
    b.extend(K.cyl_buf((rx, y0, hz), (rx, y1, hz), 0.024, 'steel', 12))
    return b


def centre_under():
    """Centre and one-sided parts: the steering box under the hood with its drop arm and the track rod; the long drive
    shaft from the gearbox back to the differential part, its centre bearing; the filler hose from the flap on the left;
    the gear linkage from the lever to the gearbox."""
    b = K.Buf()
    hx = HD['ax_f']
    zp = RAIL_Z - 0.12
    bx, by = hx + 0.30, DRIVER_Y
    b.extend(K.box_buf((bx - 0.08, by - 0.08, zp + 0.06), (bx + 0.08, by + 0.06, zp + 0.22), 'steel', 0.012, 2))
    b.extend(K.tube_buf(np.array([(bx, by - 0.04, zp + 0.06), (hx + 0.16, by - 0.10, zp + 0.02)]), 0.014, 'steel', 8))
    b.extend(K.tube_buf(np.array([(hx + 0.16, 0.30, zp + 0.02), (hx + 0.16, -0.30, zp + 0.02)]), 0.015, 'steel', 8))
    # the shaft from the gearbox's tail back to the differential part's companion flange, a bearing half way
    gx = GEARBOX[0] - 0.36
    fx = D['ax_r'] + 0.2645 + 0.012
    zc = D['hub_z'] - 0.024
    b.extend(K.cyl_buf((gx, 0.0, GEARBOX[2] + 0.12), (fx, 0.0, zc), 0.038, 'steel', 14))
    for x in (gx, fx):
        b.extend(K.cyl_buf((x - 0.015, 0.0, zc if x == fx else GEARBOX[2] + 0.12), (x + 0.015, 0.0, zc if x == fx else GEARBOX[2] + 0.12), 0.05, 'steel', 14))
    mx = (gx + fx) / 2
    mz = (GEARBOX[2] + 0.12 + zc) / 2
    b.extend(K.box_buf((mx - 0.05, -0.12, mz + 0.03), (mx + 0.05, 0.12, RAIL_Z + 0.07), 'steel', 0.006, 1))
    b.extend(K.cyl_buf((mx - 0.04, 0.0, mz), (mx + 0.04, 0.0, mz), 0.065, 'rubber', 16))
    # the gear linkage: from the lever's foot down under the floor to the gearbox
    b.extend(K.tube_buf(np.array([(GEAR_X, CONSOLE_Y, PAN_Z - 0.03), (GEARBOX[0] - 0.10, 0.10, PAN_Z - 0.06)]), 0.009, 'steel', 6))
    # the filler hose in under the floor to the tank's neck
    fx_ = D['fuel'][0]
    path = np.array([(fx_ + 0.02, IN_Y - 0.06, 0.62), (fx_ + 0.04, 0.76, 0.62), (fx_ + 0.055, 0.56, 0.61), (fx_ + 0.06, 0.44, 0.58)])
    b.extend(K.tube_buf(smooth_path(path, 1), 0.02, 'rubber', 10))
    return b


# ============================================================================================ interior
def interior(ex):
    """INTERIOR: L (left half, mirrored), C (as it is), R (right side only, in left coordinates: the stairwell, the grab
    pole), gauges (the dial layout for the needles)."""
    out = {}
    L = K.Buf()
    C = K.Buf()
    R = K.Buf()
    xr_a = D['ax_r']
    # ---------------------------------------------------------------- the cab
    # the floor mat from the modesty panel to the cowl
    L.extend(K.box_buf((ROOM_FRONT_X - 0.02, 0.0, FLOOR_Z - 0.03), (D['xf'] - 0.05, IN_Y, FLOOR_Z), 'rubber', 0.004, 1))
    # the driver's seat on its pedestal (left: as it is)
    C.extend(K.box_buf((SEAT_X - 0.30, DRIVER_Y - 0.22, FLOOR_Z - 0.005), (SEAT_X + 0.26, DRIVER_Y + 0.22, SEAT_Z), 'steel', 0.02, 2))
    C.extend(K.box_buf((SEAT_X - 0.33, DRIVER_Y - 0.25, FLOOR_Z - 0.005), (SEAT_X + 0.29, DRIVER_Y + 0.25, FLOOR_Z + 0.04), 'trim', 0.01, 2))
    # the console right of it: the gear lever and the handbrake
    C.extend(K.box_buf((SEAT_X - 0.30, CONSOLE_Y - 0.12, FLOOR_Z - 0.005), (SEAT_X + 0.46, CONSOLE_Y + 0.12, CONSOLE_TOP), 'plastic_int', 0.02, 2))
    V, N, Tr = K.lathe(np.array([(0.0, 0.012), (0.035, 0.012), (0.06, 0.004), (0.072, 0.0)])[::-1], (GEAR_X, CONSOLE_Y, CONSOLE_TOP + 0.001), (0, 0, 1), 20)
    C.add(V, N, Tr, 'rubber')
    C.extend(K.box_buf((SEAT_X - 0.21, CONSOLE_Y - 0.03, CONSOLE_TOP - 0.004), (SEAT_X + 0.09, CONSOLE_Y + 0.03, CONSOLE_TOP + 0.004), 'trim', 0.003, 1))
    # the dash: a padded shelf under the glass, its painted face sloping down to the footwell, both following the box's
    # front round its corners
    xs0 = DASH_FACE_X
    f1, f2 = FLOOR_Z + 0.56, FLOOR_Z + 0.36

    def nose_in(y, z):
        return float(S.FRONT.to3d(np.array([[min(abs(y), D['hw'] - 0.04), z]]))[0][0, 0]) + WALL_IN

    def shelf_sec(y):
        x1 = nose_in(y, DASH_TOP)
        return K.round_profile(np.array([(x1, DASH_TOP - 0.03), (x1, DASH_TOP), (xs0 + 0.02, DASH_TOP + 0.004), (xs0 - 0.035, DASH_TOP + 0.016),
                                         (xs0 - 0.04, DASH_TOP - 0.01), (xs0 - 0.01, DASH_TOP - 0.035)]), [0, 0.01, 0.02, 0.012, 0.012, 0], 1)

    def face_sec(y):
        x1 = min(nose_in(y, f1), nose_in(y, DASH_TOP - 0.035))
        return K.round_profile(np.array([(xs0 - 0.01, DASH_TOP - 0.035), (xs0, f1), (xs0 + 0.08, f2), (x1, f2), (x1, DASH_TOP - 0.035)]), [0, 0.03, 0.03, 0, 0], 2)
    ys = np.concatenate([np.linspace(-(IN_Y - 0.01), -(IN_Y - 0.30), 8), np.linspace(-0.62, 0.62, 3), np.linspace(IN_Y - 0.30, IN_Y - 0.01, 8)])
    C.extend(extrude_y(None, ys, 'plastic_int', inside=(xs0 + 0.1, 0.0, DASH_TOP - 0.01), sec_fn=shelf_sec))
    C.extend(extrude_y(None, ys, 'paint_b', inside=(xs0 + 0.12, 0.0, f1 + 0.04), sec_fn=face_sec))
    zr = DASH_TOP - 0.088
    C.extend(K.box_buf((xs0 - 0.012, -0.097, zr - 0.028), (xs0 - 0.004, 0.097, zr + 0.028), 'chrome', 0.003, 2))
    C.extend(K.box_buf((xs0 - 0.013, -0.09, zr - 0.023), (xs0 + 0.06, 0.09, zr + 0.023), 'trim', 0.002, 1))
    for vy in (1.0, -1.02):
        c = np.array([xs0 - 0.004, vy, DASH_TOP - 0.08])
        C.extend(K.box_buf(c + (-0.008, -0.06, -0.024), c + (0.004, 0.06, 0.024), 'trim', 0.006, 1))
    dash, gauges = binnacle()
    C.extend(dash)
    for (py, w_, name) in ((DRIVER_Y + 0.12, 0.045, 'clutch'), (DRIVER_Y + 0.0, 0.055, 'brake'), (DRIVER_Y - 0.13, 0.035, 'throttle')):
        base = np.array([xs0 + 0.08, py, f1])
        pad = np.array([xs0 + 0.10, py, FLOOR_Z + (0.16 if name != 'throttle' else 0.12)])
        C.extend(K.tube_buf(np.array([base, (base + pad) / 2 + (-0.03, 0, 0), pad + (0, 0, 0.04)]), 0.009, 'steel', 6))
        C.extend(K.box_buf(pad + (-0.012, -w_, -0.045 if name != 'throttle' else -0.08), pad + (0.012, w_, 0.045), 'rubber', 0.006, 2,
                           xf=K.mat4_rot((0, 1, 0), -18, pad)))
    p, d = steering_mount()
    length = (p[2] - FLOOR_Z) / -d[2]
    C.extend(K.cyl_buf(p + d * 0.06, p + d * 0.34, 0.046, 'plastic_int', 18, r1=0.04))
    C.extend(K.cyl_buf(p + d * 0.34, p + d * (length + 0.01), 0.028, 'trim', 12))
    mx = float(S.FRONT.to3d(np.array([[0.0, D['ws_head'] - 0.06]]))[0][0, 0]) - 0.05
    mp = np.array([mx, 0.0, D['ws_head'] - 0.08])
    C.extend(K.box_buf(mp + (-0.01, -0.012, 0.02), mp + (0.012, 0.012, 0.095), 'plastic_int', 0.004, 2))
    C.extend(K.box_buf(mp + (-0.025, -0.16, -0.035), mp + (0.0, 0.16, 0.03), 'plastic_int', 0.012, 3))
    C.extend(K.box_buf(mp + (-0.0262, -0.15, -0.027), mp + (-0.0255, 0.15, 0.022), 'glass_dark', 0.0, 1))
    vp = np.array([mx - 0.03, DRIVER_Y, D['ws_head'] + 0.01])
    C.extend(K.box_buf(vp + (-0.20, -0.28, -0.012), vp + (0.0, 0.28, 0.008), 'fabric', 0.01, 3, xf=K.mat4_rot((0, 1, 0), 6, vp)))
    # the modesty panel behind the driver's seat, its chrome rail; a grab pole by the entry door (right)
    C.extend(K.box_buf((ROOM_FRONT_X - 0.02, 0.24, FLOOR_Z - 0.005), (ROOM_FRONT_X, IN_Y - 0.01, FLOOR_Z + 0.95), 'paint_b', 0.006, 2))
    C.extend(K.tube_buf(np.array([(ROOM_FRONT_X + 0.01, 0.24, FLOOR_Z + 0.97), (ROOM_FRONT_X + 0.01, IN_Y - 0.03, FLOOR_Z + 0.97)]), 0.016, 'chrome', 10))
    R.extend(K.tube_buf(np.array([(D['sd_x0'] - 0.06, IN_Y - 0.34, FLOOR_Z), (D['sd_x0'] - 0.06, IN_Y - 0.34, D['roof_z'] - 0.06)]), 0.018, 'chrome', 12))
    # the stairwell inside the entry door (right side, in left coordinates): a step down to the door's sill
    R.extend(K.box_buf((D['sd_x0'] + 0.02, IN_Y - 0.36, D['sd_z0'] - 0.04), (D['sd_x1'] - 0.02, IN_Y + 0.04, D['sd_z0'] - 0.005), 'rubber', 0.004, 1))
    R.extend(K.box_buf((D['sd_x0'] + 0.02, IN_Y - 0.36, D['sd_z0'] - 0.005), (D['sd_x1'] - 0.02, IN_Y - 0.33, FLOOR_Z), 'steel', 0.003, 1))
    # ---------------------------------------------------------------- the room: emptied
    # the plywood floor from the tail to the modesty panel (round the stairwell, on the right)
    L.extend(K.box_buf((D['xr'] + 0.06, 0.0, FLOOR_Z - 0.03), (ROOM_FRONT_X - 0.02, IN_Y, FLOOR_Z), 'wood', 0.004, 1))
    # the rear wheels' humps in it
    L.extend(rear_tub_cabin(xr_a, D['hub_z'], WELL_R + 0.03, WELL_IN_R, IN_Y + 0.01, FLOOR_Z, 'rubber'))
    # the lamps in the ceiling
    for lx in LAMPS_X:
        c = np.array([lx, 0.0, D['roof_z'] + D['roof_crown'] - 0.035])
        C.extend(K.cyl_buf(c + (0, 0, 0.002), c - (0, 0, 0.018), 0.13, 'trim', 24))
        C.extend(K.cyl_buf(c - (0, 0, 0.018), c - (0, 0, 0.026), 0.11, 'emit', 24))
    out['L'] = L
    out['C'] = C
    out['R'] = R
    out['gauges'] = gauges
    return out


def binnacle():
    """The instrument binnacle on a stalk from the shelf, over the far side of the wheel's rim, turned to the eye."""
    b = K.Buf()
    eye = np.array(EYE)
    pc = np.array([SEAT_X + 0.46, DRIVER_Y, SEAT_Z + 0.58])
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
    """The entry door's (left coordinates: it is built mirrored onto the right): its rubber edge where its two leaves meet,
    a chrome handle inside, its hinges on the front edge."""
    b = K.Buf()
    x0, x1 = D['sd_x0'], D['sd_x1']
    xm = (x0 + x1) / 2
    ps, ns = S.SIDE.to3d(np.array([[xm, D['sd_z0'] + 0.05], [xm, D['sd_z1'] - 0.05]]))
    b.extend(K.tube_buf(ps + ns * 0.004, 0.012, 'rubber', 8))
    for zz in (0.95, 2.05):
        p0, n0 = S.SIDE.to3d(np.array([[x1 - 0.004, zz]]))
        p0 = p0[0] - n0[0] * 0.03
        b.extend(K.box_buf(p0 + (-0.012, -0.03, -0.035), p0 + (0.004, 0.0, 0.035), 'steel', 0.004, 2))
    pin, nin = S.SIDE.to3d(np.array([[x0 + 0.06, 1.30], [x0 + 0.06, 1.70]]))
    b.extend(K.tube_buf(pin - nin * 0.05, 0.012, 'chrome', 8))
    return b


def lid_details(key):
    """The emergency door: its long chrome handle across (left half)."""
    b = K.Buf()
    p, n = S.REAR.to3d(np.array([[0.10, 1.36], [D['lid_hw'] - 0.08, 1.36]]))
    b.extend(K.tube_buf(p - n * 0.035, 0.012, 'chrome', 8))
    for q, m in zip(p, n):
        b.extend(K.cyl_buf(q - m * 0.035, q + m * 0.004, 0.01, 'chrome', 8))
    return b


def lid_centre(key):
    """The emergency door's plate (on the centre line, low on it)."""
    b = K.Buf()
    from frames._sedan_build import plate_buf
    pp, pn = S.REAR.to3d(np.array([[0.0, 0.92]]))
    b.extend(plate_buf(pp[0], pn[0], (0.0, 0.0, 1.0), 0.33, 0.15, 'K4 207'))
    return b
