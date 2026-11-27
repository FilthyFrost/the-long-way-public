"""Snail: everything behind the outer skin. The cab: the floor over the front wheels, the seats' pedestals, the
doghouse between them over the engine (its lid is the hood panel), the dash with the binnacle and its four dials,
pedals, the steep column, the door cards; under the floor the engine bay (the radiator's support behind the grille,
the floor pan). The box inside: plank floor, plywood walls with tie-down rails, the roof bows, a lamp. The underbody
(UNDER): the ladder frame, crossmembers, the front I-beam with the tie rod, the steering box and its drag link, the
two-piece propshaft, the rear axle's tubes from 0.29 m out, the wheelhouse liners, the box's runners and cross
sills, the rear fenders and mud flaps, the side guards, the battery's tray on the right rail, the fuel tank's
straps behind the rear axle, the filler on the left. The hubs' carriers are objects of their own (knuckle());
springs, dampers, brakes and the differential are the axles' parts."""
import math
import sys

sys.dont_write_bytecode = True

import numpy as np  # noqa: E402

from frames import _kit as K  # noqa: E402
from frames import _snail_ext as EX  # noqa: E402
from frames import snail as S  # noqa: E402
from frames._sedan_inner import dial, extrude_y, face_up, quad_sheet, recompute_normals, smooth_path  # noqa: E402
from frames._sedan_ext import side_dir  # noqa: E402

D = S.D
PI = math.pi
FLOOR_Z = EX.CAB_FLOOR      # the cab floor (mat top)
PAN_Z = FLOOR_Z - 0.04      # under the cab floor
BACK_IN = D['xr'] + 0.03    # the cab's back wall, inside
SEAT_X = 1.44               # the seats' floor attachment (the bucket's back 0.49 behind it, its eye 0.16 behind)
DRIVER_Y = 0.565
SEAT_Z = 0.95               # the pedestals' tops: the seat parts stand on them, clear of the doghouse
EYE = (SEAT_X - 0.16, DRIVER_Y, SEAT_Z + 0.90)
# where the driver's view is from: her eye as she sits posed (18 cm ahead of the seat's EYE, 8 cm under it), sitting
# up 17 cm (her eye 0.75 m over the cushion, frames.ts cabView); the seats 7 cm lower than they were, so that the
# windscreen's head still stands over her eye
VIEW = (EYE[0] + 0.18, DRIVER_Y, EYE[2] - 0.08 + 0.17)
PED = dict(x0=SEAT_X - 0.27, x1=SEAT_X + 0.27, y0=0.348, y1=0.78)        # a seat's pedestal (left), clear of the door card
DASH_FACE_X = 2.15          # the dash's face towards the cab
DASH_TOP = 1.285
GEAR_X = 1.72
GEAR_Y = 0.20
COLUMN_DEG = 55.0           # a cab-over's wheel lies flat, a bus's (its rim 35 degrees from level)
COLUMN_FOOT_Z = 1.06        # where the column goes into the dash's face
# the diesel four between the seats: its bottom 0.30 over the ground, its flywheel at the cab's back wall, the front
# axle's beam passing under its front half; its top 1 cm under the doghouse's lid
ENGINE = (1.21, 0.0, 0.30)
ENGINE_ROOM = ((-0.37, -0.31, 0.0), (0.39, 0.31, 0.75))
DOG = dict(x0=BACK_IN, x1=1.625, hw=0.337, top=1.056, r=0.07)            # the doghouse's walls (outer) up to its rim
LID = dict(x0=0.826, x1=1.638, hw=0.350, z0=1.038, top=1.078, r=0.024)   # the lid over its top (the hood)
GEARBOX = (0.655, 0.0, 0.31)
GEARBOX_ROOM = ((-0.31, -0.14, 0.0), (0.21, 0.14, 0.24))
RADIATOR = (2.36, 0.0, 0.44)
BATTERY = (0.36, -0.64, 0.50)
TANK = (-2.02, 0.0, 0.30)
FRAME_Y = 0.43              # the frame rails' centre line
RAIL_Z = (0.51, 0.69)       # their bottom and top
RAIL_W = 0.07
FRONT_TUB_Y = 0.47          # the front wheel tubs' inner walls
FRONT_TUB_R = 0.465
REAR_TUB_R = 0.45
STEP = dict(x0=0.815, x1=1.005, y0=0.655, y1=0.905, z=0.455)
FILLER = dict(x=-2.16, z=0.665, r=0.05)                                   # the fuel filler (left side, behind the rear wheel)
BOX_RUN_Z = (RAIL_Z[1], 0.79)  # the box's runners on the rails
SILL_Z = (0.79, 0.91)          # its cross sills under the floor
BOX_FLOOR = D['box_floor']
# the box's walls inside (plywood): with the kick plate along their foot (6 mm) the room is 1.80 m across at the floor,
# and 3.10 m from the doors to the front wall's (docs/V3/plan/finish.md section 11.3: whole tenths of a metre)
BOX_WALL = 0.906
SILL_XS = (0.62, 0.22, -0.18, -0.58, -0.98, -1.38, -1.78, -2.18)
GB = D['ax_r']


def steering_mount():
    """(the wheel's hub, the column's direction forward-down): a big wheel lying back, its column 55 deg down; its hub
    0.45 m ahead of her eye and 43 degrees under it (Nomad Drive's 0.42-0.51 m, 40-43): her arms reach out to it, not
    up out of her lap."""
    a = math.radians(COLUMN_DEG)
    return np.array([VIEW[0] + 0.45, DRIVER_Y, VIEW[2] - 0.42]), np.array([math.cos(a), 0.0, -math.sin(a)])


def knuckle(hx, hy, hz, front=True):
    """A hub's carrier (left side: outer face +Y), an object of its own (KNUCKLE_<hub>) the game hangs on the
    wheel's pivot: the hub flange at the hub face (1.2 cm out of the wheel's centre, under the 16-inch rim's six
    nuts) with six studs and the centre cap, the spindle, and the carrier just inboard of the brake (front: the
    knuckle on the I-beam's kingpin with its steering arm back to the tie rod; rear: the axle's flange housing)."""
    b = K.knuckle_buf(hx, hy, hz, hy + 0.012, 0.08, 6, 0.0695, 30.0, stud_r=0.006, stud_len=0.008, cap_r=0.025,
                      cap_out=0.006, carrier=(0.06, 0.035, 0.13, 0.17 if front else 0.13))
    if front:
        y1 = hy + 0.012 - K.BRAKE_IN[1] - 0.003
        b.extend(K.box_buf((hx - 0.20, y1 - 0.045, hz - 0.035), (hx - 0.04, y1 - 0.012, hz + 0.0), 'steel', 0.008, 2))
        # the upper arm for the drag link (left only it matters; both have it, as forged)
        b.extend(K.box_buf((hx + 0.02, y1 - 0.045, hz + 0.10), (hx + 0.14, y1 - 0.015, hz + 0.135), 'steel', 0.006, 2))
    return b


# ============================================================================================ cab plan helpers
def corner_plan(x0, x1, y1, inset, step=0.03):
    """Plan outline (CCW; x forward, y left) of [x0, x1] x [0, y1] with its front outer corner rounded about the
    cab shell's front corner centre (so it stays `inset` inside the shell's rounded corner)."""
    cx, cy = D['xf'] - D['rho_f'], D['hw'] - D['rho_f']
    r = D['rho_f'] - inset
    xe = min(x1, cx + r)
    ye = min(y1, cy + r)
    pts = [(x0, 0.0), (xe, 0.0)]
    if xe > cx and ye > cy:
        th0 = math.acos(max(-1.0, min(1.0, (xe - cx) / r)))
        th1 = math.asin(max(-1.0, min(1.0, (ye - cy) / r)))
        n = max(2, int(math.ceil(r * (th1 - th0) / step)))
        for k in range(n + 1):
            th = th0 + (th1 - th0) * k / n
            pts.append((cx + r * math.cos(th), cy + r * math.sin(th)))
    else:
        pts.append((xe, ye))
    pts.append((x0, ye))
    return K.ccw(np.array(pts))


def nose_in(y, z, inset=0.035):
    """x of the nose's inside at half width y and height z."""
    return float(S.FRONT.to3d(np.array([[min(abs(y), 0.84), z]]))[0][0, 0]) - inset

def floor_outline(x0, inset, g, y1=0.865):
    """The cab floor's plan (left half, CCW): from the back wall at x0 to the nose (round its corner, `inset`
    inside the shell), round the doghouse (its outline grown by g): the doghouse takes the floor's back middle."""
    pl = corner_plan(x0, nose_in(0.3, FLOOR_Z, 0.03), y1, inset)
    # corner_plan starts at (x0, 0) and ends at (x0, ye): swap its first point for the way round the doghouse
    d = DOG
    r = d['r'] + g
    cx, cy = d['x1'] - d['r'], d['hw'] - d['r']
    arc = [(cx + r * math.cos(a), cy + r * math.sin(a)) for a in np.linspace(PI / 2, 0.0, 7)]
    around = np.array([(x0, d['hw'] + g)] + arc + [(d['x1'] + g, 0.0)])
    return np.vstack([around[-1:], pl[1:], around[:-1]])



# ============================================================================================ engine bay (BODY)
def engine_bay():
    """Left half: the radiator's support behind the grille, a tin closing panel over the radiator under the cab
    floor, the wiring loom to the head lamp."""
    b = K.Buf()
    rx = RADIATOR[0]
    # the radiator support: two posts at the sides of the core and a top bar under the floor, tied to the rails
    b.extend(K.box_buf((rx + 0.05, 0.37, 0.42), (rx + 0.09, 0.42, PAN_Z - 0.01), 'paint', 0.006, 2))
    b.extend(K.box_buf((rx + 0.05, 0.0, PAN_Z - 0.06), (rx + 0.09, 0.42, PAN_Z - 0.01), 'paint', 0.006, 2))
    b.extend(K.box_buf((rx + 0.05, 0.0, 0.40), (rx + 0.09, 0.42, 0.44), 'paint', 0.006, 2))
    # the loom from the cab's bulkhead along the support to the head lamp's bucket
    path = [(rx + 0.02, 0.10, PAN_Z - 0.03), (rx + 0.07, 0.38, PAN_Z - 0.03), (rx + 0.08, 0.44, 0.78), (2.40, 0.50, 0.80)]
    b.extend(K.tube_buf(smooth_path(path, 1), 0.007, 'rubber', 5))
    return b


def steps():
    """The step under each door's rear, behind the front wheel (left; body): an aluminium tread with its ribs on a
    black steel tray, hung from the frame rail."""
    b = K.Buf()
    s = STEP
    z = s['z']
    b.extend(K.box_buf((s['x0'], s['y0'], z - 0.03), (s['x1'], s['y1'], z), 'trim', 0.006, 2))
    b.extend(K.box_buf((s['x0'] + 0.008, s['y0'] + 0.008, z), (s['x1'] - 0.008, s['y1'] - 0.008, z + 0.006), 'alu', 0.002, 1))
    for k in range(5):
        y = s['y0'] + 0.03 + (s['y1'] - s['y0'] - 0.06) * k / 4
        b.extend(K.box_buf((s['x0'] + 0.02, y - 0.005, z + 0.006), (s['x1'] - 0.02, y + 0.005, z + 0.012), 'alu', 0.002, 1))
    # the hangers: two flat bars up to a bracket on the rail's outside, the tray's lip
    for x in (s['x0'] + 0.03, s['x1'] - 0.03):
        b.extend(K.box_buf((x - 0.012, FRAME_Y + RAIL_W / 2, z - 0.02), (x + 0.012, s['y0'] + 0.01, z + 0.0), 'steel', 0.003, 1))
        b.extend(K.box_buf((x - 0.012, FRAME_Y + RAIL_W / 2, z - 0.02), (x + 0.012, FRAME_Y + RAIL_W / 2 + 0.02, RAIL_Z[0] + 0.05), 'steel', 0.003, 1))
    b.extend(K.box_buf((s['x0'], s['y1'] - 0.012, z - 0.03), (s['x1'], s['y1'], z + 0.02), 'trim', 0.004, 1))
    return b


def grab_handle():
    """A chrome grab handle on the cab's back corner beside the door (left; body)."""
    x = EX.GRAB_X
    y = float(S.side_w(x, 1.3))
    za, zb = EX.GRAB_Z
    path = np.array([(x, y - 0.002, za), (x, y + 0.04, za + 0.04), (x, y + 0.04, zb - 0.04), (x, y - 0.002, zb)])
    b = K.tube_buf(smooth_path(path, 1), 0.012, 'chrome', 10)
    for z in EX.GRAB_Z:
        b.extend(K.cyl_buf((x, y - 0.004, z), (x, y + 0.006, z), 0.02, 'trim', 12))
    return b


# ============================================================================================ the doghouse lid (hood)
def lid():
    """The lid over the doghouse (centred, the hood panel): a shallow painted pan, its top domed a hair, a skirt
    round it onto the doghouse's rim, the inside lined with dark insulation, two latches at the front."""
    b = K.Buf()
    L = LID
    x0, x1, hw, z0, top, r = L['x0'], L['x1'], L['hw'], L['z0'], L['top'], L['r']
    # outline in plan, rounded corners
    pl = K.rounded_poly(np.array([(x0, -hw), (x1, -hw), (x1, hw), (x0, hw)]), [0.06] * 4, 0.05, arc_step=0.012)
    pl = K.ccw(pl)
    # the skin: the plan offset in by r at the top, rounded down to the skirt (a lathe-like sweep of a quarter
    # round + the skirt down to z0 along the outline)
    n = len(pl)
    T2 = np.roll(pl, -1, 0) - np.roll(pl, 1, 0)
    T2 = K.unit(T2)
    No = np.stack([T2[:, 1], -T2[:, 0]], 1)          # outward in plan
    rows = []
    norms = []
    for a in np.linspace(0.0, PI / 2, 5):
        # from the top (a = 0) round to the skirt's top (a = 90 deg)
        off = -r + r * math.sin(a)
        z = top - r + r * math.cos(a)
        rows.append(np.stack([pl[:, 0] + No[:, 0] * off, pl[:, 1] + No[:, 1] * off, np.full(n, z)], 1))
        norms.append(np.stack([No[:, 0] * math.sin(a), No[:, 1] * math.sin(a), np.full(n, math.cos(a))], 1))
    rows.append(np.stack([pl[:, 0], pl[:, 1], np.full(n, z0)], 1))
    norms.append(np.stack([No[:, 0], No[:, 1], np.zeros(n)], 1))
    V = np.vstack(rows)
    N = np.vstack(norms)
    b.add(V, N, K.grid_tris(len(rows), n, True), 'paint')
    # the flat top inside the round
    inner = rows[0]
    b.extend(K.fill_loop(inner, (0, 0, 1), 'paint', interior_step=0.1))
    # the inside: insulation under the top, the skirt's inner face
    under = K.offset_loop2(pl, 0.012)
    P = np.stack([under[:, 0], under[:, 1], np.full(len(under), top - 0.008)], 1)
    b.extend(K.fill_loop(P, (0, 0, -1), 'trim', interior_step=0.12))
    Vi = np.vstack([np.stack([under[:, 0], under[:, 1], np.full(len(under), z)], 1) for z in (z0 + 0.002, top - 0.008)])
    Ni = np.vstack([np.stack([-No[:, 0], -No[:, 1], np.zeros(len(under))], 1)] * 2)
    b.add(Vi, Ni, K.grid_tris(2, len(under), True), 'trim')
    # two chrome latches at the front edge, a rubber mat strip on the top
    for y in (-0.22, 0.22):
        b.extend(K.box_buf((x1 - 0.004, y - 0.03, z0 + 0.004), (x1 + 0.010, y + 0.03, top - 0.012), 'chrome', 0.004, 2))
    b.extend(K.box_buf((x0 + 0.10, -hw + 0.08, top - 0.002), (x1 - 0.12, hw - 0.08, top + 0.004), 'rubber', 0.003, 1))
    for k in range(9):
        x = x0 + 0.14 + (x1 - x0 - 0.30) * k / 8
        b.extend(K.box_buf((x - 0.006, -hw + 0.09, top + 0.004), (x + 0.006, hw - 0.09, top + 0.007), 'rubber', 0.0, 1))
    return b


def lid_hinge():
    """The lid's hinge: along its rear edge (it swings up and forward, standing against the cab's back wall)."""
    return np.array([LID['x0'] + 0.004, 0.0, LID['top'] - 0.006])


# ============================================================================================ the cab interior
def doghouse():
    """The engine's cover between the seats up to its rim (left half): carpeted walls outside, dark insulation inside,
    open at the top under the lid and at the floor to the engine bay; the rim the lid closes on."""
    b = K.Buf()
    d = DOG
    for lvl, mat, sg in ((0.0, 'fabric', 1.0), (0.012, 'trim', -1.0)):
        b.extend(_dog_shell(d['x0'], d['x1'], d['hw'], d['top'], lvl, mat, sg, d['r']))
    # the rim: a rubber seal round the top opening
    pl = K.rounded_poly(np.array([(d['x0'] + 0.02, 0.0), (d['x1'] - 0.03, 0.0), (d['x1'] - 0.03, d['hw'] - 0.03), (d['x0'] + 0.02, d['hw'] - 0.03)]),
                        [0, 0.04, 0.04, 0], 0.04, closed=False, arc_step=0.01)
    P = np.stack([pl[:, 0], pl[:, 1], np.full(len(pl), d['top'] - 0.004)], 1)
    b.extend(K.tube_buf(P, 0.006, 'rubber', 5, cap=False))
    return b


def _dog_shell(x0, x1, hw, top, lvl, mat, sg, r):
    """One skin of the doghouse (left half; its back against the cab's back wall): the front wall and the side
    swept along the outline in plan (the side, a corner fan, the front), rounded over the top edge, down to the
    floor; open at the top (lvl insets the skin: the insulation inside)."""
    rr = r - lvl
    cx, cy = x1 - r, hw - r
    zc = top - r
    path = [((x0, cy), (0.0, 1.0))]
    for a in np.linspace(PI / 2, 0.0, 7):
        path.append(((cx, cy), (math.cos(a), math.sin(a))))
    path.append(((cx, 0.0), (1.0, 0.0)))
    sec = [(rr * math.cos(t), zc + rr * math.sin(t), math.cos(t), math.sin(t)) for t in np.linspace(PI / 2, 0.0, 5)]
    # (rows down the wall: its foot in the floor's corner bakes dark, and alone it would darken the whole wall)
    for z in (0.5 * (zc + FLOOR_Z), FLOOR_Z + 0.025, FLOOR_Z - 0.005):
        sec.append((rr, z, 1.0, 0.0))
    # the top's inner flat, where the lid sits, from the round in to the opening
    sec = [(-0.03, top - lvl, 0.0, 1.0)] + sec
    V = np.array([(c[0] + n[0] * a, c[1] + n[1] * a, z) for (c, n) in path for (a, z, na, nz) in sec])
    N = np.array([(n[0] * na, n[1] * na, nz) for (c, n) in path for (a, z, na, nz) in sec]) * sg
    return K.Buf().add(V, N, K.grid_tris(len(path), len(sec)), mat)


def dashboard():
    """A truck's dash: a long padded shelf under the windscreen, its painted face down to the footwell, the binnacle
    in front of the driver with the speedometer, rev counter and two small dials, a radio slot and heater levers in
    the middle, a glovebox on the passenger's side, vents at the ends."""
    b = K.Buf()
    xs0 = DASH_FACE_X

    def shelf_sec(y):
        x1 = nose_in(y, DASH_TOP, 0.03)
        return K.round_profile(np.array([(x1, DASH_TOP - 0.035), (x1, DASH_TOP), (xs0 + 0.02, DASH_TOP + 0.004), (xs0 - 0.035, DASH_TOP + 0.018),
                                         (xs0 - 0.045, DASH_TOP - 0.012), (xs0 - 0.012, DASH_TOP - 0.04)]), [0, 0.01, 0.02, 0.014, 0.012, 0], 1)

    def face_sec(y):
        x1 = min(nose_in(y, 1.0, 0.03), nose_in(y, DASH_TOP - 0.04, 0.03))
        return K.round_profile(np.array([(xs0 - 0.012, DASH_TOP - 0.04), (xs0, 1.08), (xs0 + 0.12, 0.98), (x1, 0.98), (x1, DASH_TOP - 0.04)]),
                               [0, 0.03, 0.03, 0, 0], 2)
    ys = np.concatenate([np.linspace(-0.83, -0.66, 5), np.linspace(-0.50, 0.50, 3), np.linspace(0.66, 0.83, 5)])
    b.extend(extrude_y(None, ys, 'plastic_int', inside=(xs0 + 0.1, 0.0, DASH_TOP - 0.01), sec_fn=shelf_sec))
    b.extend(extrude_y(None, ys, 'paint', inside=(xs0 + 0.14, 0.0, 1.12), sec_fn=face_sec))
    # glovebox on the passenger's side
    b.extend(K.box_buf((xs0 - 0.012, -0.70, 1.10), (xs0 + 0.01, -0.30, 1.225), 'plastic_int', 0.012, 2))
    b.extend(K.box_buf((xs0 - 0.018, -0.52, 1.20), (xs0 - 0.01, -0.48, 1.215), 'chrome', 0.003, 1))
    # the radio's slot (the radio part sits in it), heater levers beside it
    b.extend(K.box_buf((xs0 - 0.012, -0.097, 1.124), (xs0 - 0.004, 0.097, 1.18), 'chrome', 0.003, 2))
    b.extend(K.box_buf((xs0 - 0.013, -0.09, 1.129), (xs0 + 0.06, 0.09, 1.175), 'trim', 0.002, 1))
    b.extend(K.box_buf((xs0 - 0.012, 0.13, 1.12), (xs0 - 0.004, 0.27, 1.19), 'trim', 0.004, 1))
    for k in range(3):
        yy = 0.16 + 0.04 * k
        b.extend(K.box_buf((xs0 - 0.03, yy - 0.006, 1.145), (xs0 - 0.012, yy + 0.006, 1.162), 'plastic_int', 0.003, 1))
    # vents at the ends of the face
    for vy in (0.76, -0.78):
        c = np.array([xs0 - 0.004, vy, 1.21])
        b.extend(K.box_buf(c + (-0.008, -0.05, -0.024), c + (0.004, 0.05, 0.024), 'trim', 0.006, 1))
        for k in range(-1, 2):
            b.extend(K.box_buf(c + (-0.012, -0.045, 0.012 * k - 0.002), c + (-0.006, 0.045, 0.012 * k + 0.002), 'plastic_int', 0.0, 1))
    dash, gauges = binnacle()
    b.extend(dash)
    return b, gauges


def binnacle():
    """The binnacle on the dash's shelf in front of the driver, towards the windscreen's foot, turned to her eye (seen
    through the wheel's upper half, 31 degrees under her eye's level and 0.9 m from it, as Nomad Drive's bus has its
    pod): a hooded box with the speedometer and the rev counter, the fuel and temperature dials between them, two
    tell-tales; its foot on the shelf."""
    b = K.Buf()
    eye = np.array(VIEW)
    pc = np.array([2.24, DRIVER_Y, 1.47])
    dn = K.unit(eye - pc)
    dn = K.unit(np.array([dn[0], 0.0, dn[2]]))
    R = K.frame_from((0, 1, 0), dn)
    M = K.mat4_trs(pc, R)
    b.extend(K.box_buf((-0.215, -0.07, -0.05), (0.215, 0.07, 0.0), 'trim', 0.014, 2, xf=M))
    b.extend(K.box_buf((-0.225, 0.052, -0.06), (0.225, 0.088, 0.035), 'plastic_int', 0.012, 2, xf=M))
    # its foot down to the shelf
    base = pc - dn * 0.04
    b.extend(K.box_buf((base[0] - 0.05, DRIVER_Y - 0.17, DASH_TOP - 0.01), (base[0] + 0.07, DRIVER_Y + 0.17, base[2] - 0.03), 'plastic_int', 0.02, 2))
    gauges = []
    for (gy, gz, r, name, big) in ((0.097, -0.002, 0.056, 'N_speed', True), (-0.097, -0.002, 0.056, 'N_rpm', True),
                                   (0.0, 0.026, 0.022, 'N_fuel', False), (0.0, -0.030, 0.022, 'N_temp', False)):
        c = pc + R[:, 0] * gy + R[:, 1] * gz
        db, g = dial(c, dn, r, big, 'chrome')
        b.extend(db)
        g['name'] = name
        gauges.append(g)
    for k, yy in enumerate((-0.17, 0.17, 0.0)):
        cc = pc + R[:, 0] * (yy if k < 2 else 0.0) + R[:, 1] * (-0.058 if k < 2 else 0.056) + dn * 0.0005
        if k == 2:
            continue
        V, N, T = K.lathe(np.array([(0.0, 0.0), (0.006, 0.0)]), cc, dn, 10, prof_n=np.array([[0, 1.0], [0, 1.0]]))
        b.add(V, N, T, 'lens_amber' if k == 0 else 'emit')
    return b, gauges


def interior(ex):
    """INTERIOR: L (left half, mirrored), C (as it is), gauges (the dial layout for the needles)."""
    out = {}
    L = K.Buf()
    C = K.Buf()
    # ---------------------------------------------------------------- the cab
    # the floor mat from the back wall to the nose (round the nose's corner), the doghouse's opening out of it
    pl = floor_outline(BACK_IN, 0.035, -0.004)
    ch = K.FlatChart((0, 0, FLOOR_Z), (1, 0, 0), (0, 1, 0), (0, 0, 1))
    lo, hi = pl.min(0), pl.max(0)
    g = K.grid_points(lo[0], hi[0], lo[1], hi[1], 0.12, dt=0.12)
    V, N, T = K.mesh_region(ch, [K.Loop(K.resample_keep(pl, 0.06))], [], g, spacing=0.12)
    L.add(V, N, T, 'rubber')
    # ribs pressed in the mat in front of the pedestals (the feet)
    for k in range(5):
        y = 0.40 + 0.09 * k
        L.extend(K.box_buf((SEAT_X + 0.30, y - 0.012, FLOOR_Z), (DASH_FACE_X - 0.05, y + 0.012, FLOOR_Z + 0.004), 'rubber', 0.002, 1))
    # the seats' pedestals: boxes beside the doghouse (the seat parts stand on their tops), their fronts open-faced
    p = PED
    L.extend(K.box_buf((p['x0'], p['y0'], FLOOR_Z - 0.005), (p['x1'], p['y1'], SEAT_Z), 'plastic_int', 0.012, 2))
    L.extend(K.box_buf((p['x1'] - 0.002, p['y0'] + 0.03, FLOOR_Z + 0.02), (p['x1'] + 0.003, p['y1'] - 0.03, SEAT_Z - 0.02), 'trim', 0.004, 1))
    L.extend(doghouse())
    # the door's aperture: a sill plate on the floor's edge, a kick panel ahead
    L.extend(K.box_buf((D['cd_x0'] + 0.01, 0.80, FLOOR_Z - 0.012), (D['cd_x1'] - 0.02, 0.875, FLOOR_Z + 0.006), 'alu', 0.004, 1))
    L.extend(K.box_buf((DASH_FACE_X - 0.10, 0.80, FLOOR_Z), (nose_in(0.84, 1.0, 0.04), 0.86, 1.06), 'plastic_int', 0.02, 2))
    dash, gauges = dashboard()
    C.extend(dash)
    # pedals hanging from under the dash's shelf
    xs0 = DASH_FACE_X
    for (py, w_, name) in ((DRIVER_Y + 0.12, 0.045, 'clutch'), (DRIVER_Y + 0.0, 0.055, 'brake'), (DRIVER_Y - 0.13, 0.035, 'throttle')):
        base = np.array([xs0 + 0.06, py, 1.10])
        pad = np.array([xs0 - 0.08, py, 1.02 if name != 'throttle' else 0.97])
        C.extend(K.tube_buf(np.array([base, (base + pad) / 2 + (0.02, 0, -0.03), pad + (0, 0, 0.04)]), 0.008, 'steel', 6))
        C.extend(K.box_buf(pad + (-0.012, -w_, -0.04 if name != 'throttle' else -0.07), pad + (0.012, w_, 0.04), 'rubber', 0.006, 2,
                           xf=K.mat4_rot((0, 1, 0), -30, pad)))
    # the steering column: a shroud from the wheel down into the dash's face
    p_, d_ = steering_mount()
    C.extend(K.cyl_buf(p_ + d_ * 0.06, p_ + d_ * 0.30, 0.045, 'plastic_int', 18, r1=0.038))
    length = (p_[2] - COLUMN_FOOT_Z) / -d_[2]
    C.extend(K.cyl_buf(p_ + d_ * 0.30, p_ + d_ * length, 0.028, 'trim', 12))
    # the gear lever's boot on the floor ahead of the doghouse
    V, N, T = K.lathe(np.array([(0.0, 0.016), (0.04, 0.016), (0.066, 0.005), (0.078, 0.0)])[::-1], (GEAR_X, GEAR_Y, FLOOR_Z + 0.001), (0, 0, 1), 20)
    C.add(V, N, T, 'rubber')
    # interior mirror on the header, sun visors folded up flat under the headliner (the windscreen's head is close
    # over her eye in a cab-over: nothing more hangs down into it), the dome lamp
    mx = float(S.FRONT.to3d(np.array([[0.0, 2.14]]))[0][0, 0]) - 0.05
    mp = np.array([mx, 0.0, 2.12])
    C.extend(K.box_buf(mp + (-0.01, -0.012, 0.02), mp + (0.012, 0.012, 0.10), 'plastic_int', 0.004, 2))
    C.extend(K.box_buf(mp + (-0.025, -0.13, -0.035), mp + (0.0, 0.13, 0.025), 'plastic_int', 0.012, 3))
    C.extend(K.box_buf(mp + (-0.0262, -0.12, -0.027), mp + (-0.0255, 0.12, 0.017), 'glass_dark', 0.0, 1))
    for sy in (1, -1):
        vp = np.array([float(S.FRONT.to3d(np.array([[0.45, 2.20]]))[0][0, 0]) - 0.08, sy * 0.46, 2.222])
        C.extend(K.box_buf(vp + (-0.18, -0.22, -0.012), vp + (0.0, 0.22, 0.006), 'fabric', 0.01, 3, xf=K.mat4_rot((0, 1, 0), 3, vp)))
    C.extend(K.cyl_buf((1.30, 0.0, D['roof_z'] - 0.028), (1.30, 0.0, D['roof_z'] - 0.055), 0.09, 'emit', 16, r1=0.075))
    # ---------------------------------------------------------------- the box
    L.extend(box_inside())
    C.extend(box_inside_centre())
    out['L'] = L
    out['C'] = C
    out['gauges'] = gauges
    return out


def box_inside():
    """The box's inside (left half), as a real box body's: the hardwood strip floor, plywood on the walls and the front
    wall in sheets 1.22 m wide (an aluminium batten over each joint), a scuff plate along the foot of the walls with
    its lip, an aluminium angle along the top of the walls and up the front corners, a tie-down rail a side, the
    ceiling and its bows."""
    b = K.Buf()
    xr, xf = EX.X_R + EX.SILL_X, EX.XS - 0.016
    # the floor: hardwood strips (wood) 11 cm wide with thin dark seams between them
    b.extend(K.box_buf((xr, 0.0, BOX_FLOOR - 0.04), (xf, BOX_WALL, BOX_FLOOR), 'wood', 0.0, 1))
    for k in range(1, 8):
        y = BOX_WALL * k / 8
        b.extend(K.box_buf((xr + 0.002, y - 0.0015, BOX_FLOOR - 0.002), (xf - 0.002, y + 0.0015, BOX_FLOOR + 0.0006), 'trim', 0.0, 1))
    # the walls' plywood, facing in
    z0, z1 = BOX_FLOOR, EX.ZR1 + 0.03
    b.extend(EX.flat(np.array([0.0, BOX_WALL, 0.0]), (1, 0, 0), (0, 0, 1), (0, -1, 0), EX.rect2(xr - 0.05, xf, z0, z1), step=0.3, mat='wood'))
    b.extend(EX.flat(np.array([xf, 0.0, 0.0]), (0, 1, 0), (0, 0, 1), (-1, 0, 0), EX.rect2(0.0, BOX_WALL, z0, z1), step=0.3, mat='wood'))
    # a scuff plate along the bottom of the walls, its top folded over as a lip
    hk = 0.30
    b.extend(K.box_buf((xr, BOX_WALL - 0.006, BOX_FLOOR), (xf, BOX_WALL, BOX_FLOOR + hk), 'alu', 0.0, 1))
    b.extend(K.box_buf((xr, BOX_WALL - 0.014, BOX_FLOOR + hk - 0.012), (xf - 0.006, BOX_WALL, BOX_FLOOR + hk + 0.004), 'alu', 0.003, 1))
    b.extend(K.box_buf((xf - 0.006, 0.0, BOX_FLOOR), (xf, BOX_WALL, BOX_FLOOR + hk), 'alu', 0.0, 1))
    b.extend(K.box_buf((xf - 0.014, 0.0, BOX_FLOOR + hk - 0.012), (xf, BOX_WALL - 0.006, BOX_FLOOR + hk + 0.004), 'alu', 0.003, 1))
    # the plywood's joints (sheets 1.22 m wide from the front wall back), a batten over each, from the scuff plate up
    zc = EX.Z1 - 0.05
    for x in (xf - 1.22, xf - 2.44):
        if x > xr + 0.2:
            b.extend(K.box_buf((x - 0.018, BOX_WALL - 0.004, BOX_FLOOR + hk + 0.004), (x + 0.018, BOX_WALL, zc), 'alu', 0.002, 1))
    # the angles along the walls' top and up the front corner
    b.extend(K.box_buf((xr, BOX_WALL - 0.025, zc - 0.025), (xf, BOX_WALL, zc), 'alu', 0.003, 1))
    b.extend(K.box_buf((xf - 0.025, 0.0, zc - 0.025), (xf, BOX_WALL - 0.025, zc), 'alu', 0.003, 1))
    b.extend(K.box_buf((xf - 0.025, BOX_WALL - 0.025, BOX_FLOOR + hk + 0.004), (xf, BOX_WALL, zc - 0.025), 'alu', 0.003, 1))
    # tie-down rails (aluminium tracks with slots)
    # (one a side, over head height: a tall cupboard stands against the plywood under it)
    for z in (2.56,):
        b.extend(K.box_buf((xr + 0.04, BOX_WALL - 0.02, z - 0.03), (xf - 0.04, BOX_WALL, z + 0.03), 'alu', 0.004, 1))
        for k in range(12):
            x = xr + 0.12 + (xf - xr - 0.24) * k / 11
            b.extend(K.box_buf((x - 0.03, BOX_WALL - 0.0205, z - 0.008), (x + 0.03, BOX_WALL - 0.019, z + 0.008), 'trim', 0.0, 1))
    # the ceiling and its bows
    b.extend(EX.flat(np.array([0.0, 0.0, zc]), (1, 0, 0), (0, 1, 0), (0, 0, -1), EX.rect2(xr - 0.05, xf, 0.0, BOX_WALL), step=0.35, mat='lining'))
    for x in np.linspace(xr + 0.25, xf - 0.25, 6):
        b.extend(K.box_buf((x - 0.025, 0.0, zc - 0.045), (x + 0.025, BOX_WALL, zc), 'alu', 0.004, 1))
    return b


def box_inside_centre():
    """The box's lamp in the ceiling (centred), the batten over the front wall's middle joint."""
    b = K.Buf()
    zc = EX.Z1 - 0.05
    xf = EX.XS - 0.016
    b.extend(K.box_buf((xf - 0.004, -0.018, BOX_FLOOR + 0.304), (xf, 0.018, zc - 0.025), 'alu', 0.002, 1))
    x = -0.85 + 0.20
    b.extend(K.box_buf((x - 0.14, -0.06, zc - 0.03), (x + 0.14, 0.06, zc - 0.0), 'trim', 0.006, 2))
    b.extend(K.box_buf((x - 0.12, -0.045, zc - 0.04), (x + 0.12, 0.045, zc - 0.028), 'emit', 0.006, 2))
    return b


def door_extras(ex):
    """The door's outside handle and lock, its hinges on the front edge, the inside pull and the window crank (left).
    (One pane in the door, no vent wing: its bar stood in the driver's view a hand from the A-pillar, a post of its
    own beside it.)"""
    b = K.Buf()
    x0, x1 = D['cd_x0'], D['cd_x1']
    xh, zh = EX.HANDLE
    ph, nh = S.SIDE.to3d(np.array([[xh, zh]]))
    ph = ph[0]
    b.extend(K.box_buf((-0.065, -0.006, -0.018), (0.065, 0.0015, 0.018), 'trim', 0.004, 2, xf=K.mat4_trs(ph)))
    b.extend(K.box_buf((-0.055, -0.002, -0.009), (0.055, 0.013, 0.009), 'chrome', 0.006, 2, xf=K.mat4_trs(ph)))
    pk, nk = S.SIDE.to3d(np.array([[xh + 0.11, zh]]))
    b.extend(K.cyl_buf(pk[0] - nk[0] * 0.002, pk[0] + nk[0] * 0.006, 0.0095, 'chrome', 14))
    for zz in (1.08, 1.86):
        p0, n0 = S.SIDE.to3d(np.array([[x1 - 0.004, zz]]))
        p0 = p0[0] - n0[0] * 0.03
        b.extend(K.box_buf(p0 + (-0.012, -0.03, -0.035), p0 + (0.004, 0.0, 0.035), 'steel', 0.004, 2))
    # inside: the pull, the crank
    pin, nin = S.SIDE.to3d(np.array([[x0 + 0.24, 1.30]]))
    pin = pin[0] - nin[0] * 0.04
    b.extend(K.box_buf(pin + (-0.08, -0.03, -0.012), pin + (0.08, 0.0, 0.012), 'plastic_int', 0.008, 2))
    pc, nc = S.SIDE.to3d(np.array([[x0 + 0.52, 1.24]]))
    pc = pc[0] - nc[0] * 0.04
    b.extend(K.cyl_buf(pc, pc - nc[0] * 0.02, 0.022, 'chrome', 14))
    end = pc - nc[0] * 0.02 + np.array([0.07, 0.0, 0.0])
    b.extend(K.tube_buf(np.array([pc - nc[0] * 0.02, end]), 0.006, 'chrome', 6))
    b.extend(K.cyl_buf(end, end - nc[0] * 0.04, 0.012, 'plastic_int', 10))
    # an armrest along the card
    xs = np.linspace(x0 + 0.20, x0 + 0.66, 5)
    P, Nn = K.OffsetChart(S.SIDE, -0.04).to3d(np.stack([xs, np.full(len(xs), 1.40)], 1))
    prof = K.round_profile(np.array([(0.0, -0.022), (0.05, -0.026), (0.06, 0.0), (0.045, 0.026), (0.0, 0.026)]), 0.01, 2)
    V, N, Tr = K.sweep(P, (0, 0, 1), prof, closed=False)
    b.add(V, N, Tr, 'plastic_int')
    return b


# ============================================================================================ underbody (UNDER)
def wheelhouse(xa, y0, y1, r, z_cut, mat='trim', inner=True):
    """Half cylinder liner over a wheel from y0 (its inner wall) out to y1, facing the wheel, down to z_cut each
    side; the inner wall's segment closes it."""
    za = D['hub_z']
    a0 = math.asin(max(-1.0, min(1.0, (z_cut - za) / r)))
    ths = np.linspace(a0, PI - a0, 22)
    V = np.array([(xa + r * math.cos(t), y, za + r * math.sin(t)) for t in ths for y in (y0, y1)])
    N = np.array([(-math.cos(t), 0.0, -math.sin(t)) for t in ths for y in (y0, y1)])
    b = K.Buf().add(V, N, K.grid_tris(len(ths), 2), mat)
    if inner:
        ring = np.array([(xa + r * math.cos(t), y0, za + r * math.sin(t)) for t in ths])
        b.extend(K.fill_loop(ring, (0, 1, 0), mat))
    return b


def rail_path():
    xs = np.array([2.43, 1.95, 1.0, 0.0, -1.0, -2.0, -2.42])
    return np.stack([xs, np.full(len(xs), FRAME_Y), np.full(len(xs), 0.5 * (RAIL_Z[0] + RAIL_Z[1]))], 1)


# the rear axle's tubes start this far out from the centre: 2 cm inside the differential part's tube ends
AXLE_IN = 0.29
# the front of the differential part's pinion (its companion flange and nut), ahead of the axle centre, and the
# pinion's height below it
DIFF_FLANGE = (0.2645, -0.024)


def axle_end(hy):
    """Where a live axle's tube ends: in the middle of its hub's carrier (knuckle())."""
    return hy + 0.012 - K.BRAKE_IN[1] - 0.003 - 0.015


def underbody():
    """UNDER (left half): the frame rail, the crossmembers, the front I-beam, the rear axle's tube, the liners, the
    box's runners and cross sills, the rear fender and mud flap, the side guard, the cab's mounts, the bumper
    brackets."""
    b = K.Buf()
    # the frame rail: a tall C section (open towards the centre)
    path = rail_path()[::-1]
    h = RAIL_Z[1] - RAIL_Z[0]
    w = RAIL_W
    prof = np.array([(w / 2, -h / 2), (-w / 2, -h / 2), (-w / 2, h / 2), (w / 2, h / 2), (w / 2, h / 2 - 0.008), (-w / 2 + 0.008, h / 2 - 0.008),
                     (-w / 2 + 0.008, -h / 2 + 0.008), (w / 2, -h / 2 + 0.008)])[::-1]
    V, N, T = K.sweep(path, (0, 0, 1), prof, closed=False, closed_prof=True, smooth_prof=False)
    b.add(V, N, T, 'steel')
    for e in (0, -1):
        ring = V.reshape(len(path), -1, 3)[e]
        b.extend(K.fill_loop(ring, (np.sign(path[e, 0] - path[-1 - e, 0]), 0, 0), 'steel'))
    zc = 0.5 * (RAIL_Z[0] + RAIL_Z[1])
    # crossmembers (halves): under the radiator, behind the cab, along the middle, ahead of and behind the rear
    # axle, at the tail
    for x, hh in ((2.38, 0.10), (0.80, 0.12), (-0.10, 0.12), (-0.95, 0.12), (-1.82, 0.12), (-2.40, 0.14)):
        b.extend(K.box_buf((x - 0.04, 0.0, zc - hh / 2), (x + 0.04, FRAME_Y - w / 2 + 0.002, zc + hh / 2), 'steel', 0.005, 1))
    # the front I-beam: dropped in the middle under the sump, up to the kingpin bosses inside the knuckles
    hx, hy, hz = D['ax_f'], D['track_f'] / 2, D['hub_z']
    yb = hy + 0.012 - K.BRAKE_IN[1] - 0.003 - 0.04
    pts = np.array([(hx, 0.0, 0.265), (hx, 0.20, 0.265), (hx, 0.34, 0.29), (hx, 0.46, 0.33), (hx, yb, 0.335)])
    ip = np.array([(0.035, -0.045), (0.035, -0.032), (0.008, -0.032), (0.008, 0.032), (0.035, 0.032), (0.035, 0.045), (-0.035, 0.045),
                   (-0.035, 0.032), (-0.008, 0.032), (-0.008, -0.032), (-0.035, -0.032), (-0.035, -0.045)])
    V, N, T = K.sweep(smooth_path(pts, 2), (0, 0, 1), ip, closed=False, closed_prof=True, smooth_prof=False)
    b.add(V, N, T, 'steel')
    b.extend(K.cyl_buf((hx, yb + 0.01, hz - 0.075), (hx, yb + 0.01, hz + 0.085), 0.034, 'steel', 12))
    # the front spring pads on the beam (the springs are the suspension part's)
    b.extend(K.box_buf((hx - 0.07, 0.38, 0.31), (hx + 0.07, 0.48, 0.35), 'steel', 0.004, 1))
    # the tie rod behind the beam between the steering arms
    tz = hz - 0.035
    b.extend(K.tube_buf(np.array([(hx - 0.19, 0.0, tz), (hx - 0.19, yb - 0.012, tz)]), 0.014, 'steel', 8))
    b.extend(K.cyl_buf((hx - 0.19, yb - 0.012, tz - 0.035), (hx - 0.19, yb - 0.012, tz + 0.02), 0.022, 'steel', 10))
    # the rear axle's tube from the differential part's tube end out to the hub's carrier
    rx, ry = D['ax_r'], D['track_r'] / 2
    b.extend(K.cyl_buf((rx, AXLE_IN, hz), (rx, axle_end(ry), hz), 0.048, 'steel', 14))
    b.extend(K.box_buf((rx - 0.07, 0.50, hz + 0.04), (rx + 0.07, 0.60, hz + 0.06), 'steel', 0.004, 1))
    # wheelhouse liners: the front in the cab's arch (its inner wall clear of the steered tyre), the rear fender
    # under the box over the rear wheel
    b.extend(wheelhouse(hx, FRONT_TUB_Y, 0.875, FRONT_TUB_R, 0.48))
    b.extend(wheelhouse(rx, 0.60, EX.BW - 0.03, REAR_TUB_R, 0.52, 'trim', inner=False))
    # the rear fender's outer lip and its stays to the cross sills
    th = np.linspace(math.asin((0.52 - hz) / REAR_TUB_R), PI - math.asin((0.52 - hz) / REAR_TUB_R), 18)
    lip = np.array([(rx + (REAR_TUB_R + 0.008) * math.cos(t), EX.BW - 0.03, hz + (REAR_TUB_R + 0.008) * math.sin(t)) for t in th])
    b.extend(K.tube_buf(lip, 0.012, 'rubber', 6))
    for x in (rx - 0.30, rx + 0.30):
        b.extend(K.box_buf((x - 0.015, 0.62, SILL_Z[0] - 0.08), (x + 0.015, 0.66, SILL_Z[0]), 'steel', 0.003, 1))
    # the mud flap behind the rear wheel
    xm = rx - REAR_TUB_R - 0.05
    b.extend(K.box_buf((xm - 0.008, 0.62, 0.20), (xm + 0.004, EX.BW - 0.035, 0.66), 'rubber', 0.004, 2))
    b.extend(K.box_buf((xm - 0.004, 0.62, 0.62), (xm + 0.02, EX.BW - 0.035, 0.70), 'steel', 0.003, 1))
    # the cab floor pan's underside and the cab's mounts on the rails
    pl = floor_outline(D['xr'] + 0.01, 0.02, 0.01, 0.87)
    ch = K.FlatChart((0, 0, PAN_Z), (1, 0, 0), (0, 1, 0), (0, 0, -1))
    lo, hi = pl.min(0), pl.max(0)
    g = K.grid_points(lo[0], hi[0], lo[1], hi[1], 0.15, dt=0.15)
    V, N, T = K.mesh_region(ch, [K.Loop(K.resample_keep(pl, 0.08))], [], g, spacing=0.15)
    b.add(V, N, T, 'trim')
    for x in (0.95, 2.10):
        b.extend(K.box_buf((x - 0.05, FRAME_Y - 0.05, RAIL_Z[1]), (x + 0.05, FRAME_Y + 0.05, PAN_Z), 'rubber', 0.008, 2))
    # the box: runners on the rails, cross sills under its floor (their ends show under the side's bottom rail)
    b.extend(K.box_buf((EX.X_R + 0.02, FRAME_Y - 0.05, BOX_RUN_Z[0]), (EX.X_F - 0.02, FRAME_Y + 0.05, BOX_RUN_Z[1]), 'steel', 0.004, 1))
    for x in SILL_XS:
        b.extend(K.box_buf((x - 0.03, 0.0, SILL_Z[0]), (x + 0.03, EX.BW - 0.02, SILL_Z[1]), 'steel', 0.004, 1))
    # the side guard between the wheels: an aluminium bar on three stays from the cross sills
    gx0, gx1 = D['ax_f'] - 1.25, rx + 0.52
    b.extend(K.box_buf((gx1, EX.BW - 0.05, 0.50), (gx0, EX.BW - 0.02, 0.58), 'alu', 0.008, 2))
    for x in (gx0 - 0.08, 0.5 * (gx0 + gx1), gx1 + 0.08):
        b.extend(K.box_buf((x - 0.02, EX.BW - 0.07, 0.56), (x + 0.02, EX.BW - 0.04, SILL_Z[0]), 'steel', 0.003, 1))
    # the bumpers' brackets off the rails' ends (the bumpers are parts)
    b.extend(K.box_buf((2.38, FRAME_Y - 0.03, 0.42), (2.52, FRAME_Y + 0.03, 0.56), 'steel', 0.004, 1))
    b.extend(K.box_buf((-2.46, FRAME_Y - 0.03, 0.56), (-2.36, FRAME_Y + 0.03, 0.68), 'steel', 0.004, 1))
    return b


def centre_under():
    """Centre and one-sided parts: the steering box on the left rail with its drop arm and the drag link back to
    the left knuckle; the propshaft in two pieces on its centre bearing back to the differential part's flange;
    the gear linkage; the battery's tray on the right rail; the fuel tank's straps; the filler's hose."""
    b = K.Buf()
    hx, hz = D['ax_f'], D['hub_z']
    hy = D['track_f'] / 2
    # the steering box outside the left rail ahead of the axle, the column's shaft up into the cab
    sx, sy, sz = 2.08, FRAME_Y + RAIL_W / 2 + 0.05, 0.62
    b.extend(K.box_buf((sx - 0.07, sy - 0.05, sz - 0.06), (sx + 0.07, sy + 0.05, sz + 0.06), 'steel', 0.012, 2))
    p_, d_ = steering_mount()
    b.extend(K.tube_buf(np.array([(sx + 0.04, sy, sz + 0.06), (sx + 0.10, sy, PAN_Z), (p_[0] + d_[0] * ((p_[2] - COLUMN_FOOT_Z) / -d_[2]), DRIVER_Y, COLUMN_FOOT_Z)]), 0.016, 'steel', 8))
    b.extend(K.box_buf((sx - 0.02, sy + 0.04, sz - 0.18), (sx + 0.02, sy + 0.07, sz - 0.02), 'steel', 0.006, 2))
    ky = hy + 0.012 - K.BRAKE_IN[1] - 0.03
    b.extend(K.tube_buf(np.array([(sx, sy + 0.055, sz - 0.16), (hx + 0.10, ky - 0.01, hz + 0.12)]), 0.014, 'steel', 8))
    # the propshaft: from the gearbox's tail to the centre bearing, then to the differential part's companion flange
    gx = GEARBOX[0] - 0.294
    gz = GEARBOX[2] + 0.10
    xe, ze = D['ax_r'] + DIFF_FLANGE[0] + 0.022, hz + DIFF_FLANGE[1]
    xb, zb = -0.30, 0.5 * (gz + ze) + 0.02
    b.extend(K.cyl_buf((gx, 0.0, gz), (xb, 0.0, zb), 0.035, 'steel', 14))
    b.extend(K.box_buf((xb - 0.05, -0.07, zb - 0.04), (xb + 0.05, 0.07, zb + 0.05), 'rubber', 0.01, 1))
    b.extend(K.box_buf((xb - 0.03, -FRAME_Y + RAIL_W / 2, zb + 0.03), (xb + 0.03, FRAME_Y - RAIL_W / 2, zb + 0.06), 'steel', 0.004, 1))
    b.extend(K.cyl_buf((xb, 0.0, zb), (xe, 0.0, ze), 0.038, 'steel', 14))
    for x, z in ((gx, gz), (xe, ze)):
        b.extend(K.cyl_buf((x - 0.02, 0.0, z), (x + 0.02, 0.0, z), 0.048, 'steel', 14))
    # the gear linkage from the lever's foot back under the doghouse to the gearbox
    b.extend(K.tube_buf(np.array([(GEAR_X, GEAR_Y, PAN_Z - 0.03), (1.30, 0.22, 0.30 + 0.06), (GEARBOX[0] + 0.10, 0.10, GEARBOX[2] + 0.20)]), 0.009, 'steel', 6))
    # the battery's tray on a bracket off the right rail (the battery part stands on it)
    bx, by, bz = BATTERY
    b.extend(K.box_buf((bx - 0.16, by - 0.11, bz - 0.012), (bx + 0.16, by + 0.11, bz), 'steel', 0.004, 1))
    b.extend(K.box_buf((bx - 0.16, by - 0.11, bz), (bx - 0.15, by + 0.11, bz + 0.05), 'steel', 0.002, 1))
    for x in (bx - 0.12, bx + 0.12):
        b.extend(K.box_buf((x - 0.02, -FRAME_Y - RAIL_W / 2 - 0.002, bz - 0.06), (x + 0.02, by + 0.11, bz - 0.012), 'steel', 0.004, 1))
    # the fuel tank's straps from the rails (the tank part hangs between them behind the rear axle)
    tx, tz = TANK[0], TANK[2]
    for x in (tx - 0.17, tx + 0.17):
        b.extend(K.box_buf((x - 0.022, -0.40, tz - 0.012), (x + 0.022, 0.40, tz)
                           , 'steel', 0.002, 1))
        for sy in (1, -1):
            b.extend(K.box_buf((x - 0.022, sy * 0.40 - 0.006, tz - 0.012), (x + 0.022, sy * 0.40 + 0.006, RAIL_Z[0]), 'steel', 0.002, 1))
    # the filler's hose from the housing on the left down to the tank's neck
    fx, fz = FILLER['x'], FILLER['z']
    path = np.array([(fx, 0.86, fz), (fx + 0.02, 0.70, fz - 0.04), (tx - 0.10, 0.50, tz + 0.18), (tx - 0.12, 0.38, tz + 0.14)])
    b.extend(K.tube_buf(smooth_path(path, 1), 0.022, 'rubber', 10))
    return b


# ============================================================================================ fuel filler
def filler_cut():
    """The filler's flap: a round cut in the housing's outer face (left side, behind the rear wheel)."""
    return K.circle_loop(FILLER['x'], FILLER['z'], FILLER['r'], 0.009)


FILL_Y = EX.BW - 0.025    # the housing's outer face


def filler_housing():
    """The filler's housing under the box's left side (body): a steel box with the round opening in its outer face,
    the pocket behind it with the neck."""
    b = K.Buf()
    fx, fz, r = FILLER['x'], FILLER['z'], FILLER['r']
    hole = filler_cut()
    so = K.offset_loop2(K.ccw(hole), -S.DELTA)       # the body's side of the gap
    face = EX.rect2(fx - 0.10, fx + 0.10, fz - 0.10, fz + 0.09)
    b.extend(EX.flat(np.array([0.0, FILL_Y, 0.0]), (1, 0, 0), (0, 0, 1), (0, 1, 0), face, holes=[so], step=0.04, mat='steel'))
    b.extend(K.box_buf((fx - 0.10, FILL_Y - 0.08, fz - 0.10), (fx + 0.10, FILL_Y - 0.001, fz - 0.096), 'steel', 0.0, 1))
    b.extend(K.box_buf((fx - 0.10, FILL_Y - 0.08, fz + 0.086), (fx + 0.10, FILL_Y - 0.001, fz + 0.09), 'steel', 0.0, 1))
    for x in (fx - 0.10, fx + 0.096):
        b.extend(K.box_buf((x, FILL_Y - 0.08, fz - 0.10), (x + 0.004, FILL_Y - 0.001, fz + 0.09), 'steel', 0.0, 1))
    b.extend(K.box_buf((fx - 0.02, FILL_Y - 0.10, SILL_Z[0] - 0.02), (fx + 0.02, FILL_Y - 0.07, SILL_Z[0]), 'steel', 0.003, 1))
    b.extend(K.box_buf((fx - 0.02, FILL_Y - 0.10, fz + 0.09), (fx + 0.02, FILL_Y - 0.07, SILL_Z[0]), 'steel', 0.003, 1))
    # the pocket: the opening's flange 3 cm in, its back with the neck and its cap
    P3 = np.stack([so[:, 0], np.full(len(so), FILL_Y), so[:, 1]], 1)
    Nn = np.tile((0.0, 1.0, 0.0), (len(P3), 1))
    E = side_dir(P3, Nn, np.tile(P3.mean(0), (len(P3), 1)), True)
    V, N, Tr = K.roll_edge(P3, Nn, E, 0.002, 0.03, 0.0, 2, closed=True)
    b.add(V, N, Tr, 'steel')
    ring = V.reshape(-1, len(P3), 3)[-1]
    c = ring.mean(0)
    hl = K.circle_loop(0, 0, 0.022, 0.005)
    h3 = np.stack([c[0] + hl[:, 0], np.full(len(hl), c[1]), c[2] + hl[:, 1]], 1)
    b.extend(K.fill_loop(ring, (0, 1, 0), 'steel', holes=[h3]))
    cap = np.array([[0.0, 0.0], [0.030, 0.0], [0.031, 0.004], [0.031, 0.014], [0.028, 0.018], [0.0, 0.018]])
    V, N, Tr = K.lathe(cap, c, (0, 1, 0), 20)
    b.add(V, N, Tr, 'trim')
    return b


def filler_flap():
    """The flap over the filler (FUEL_CAP): a round steel lid in the housing's face, its rolled hem and its back."""
    hole = K.ccw(filler_cut())
    si = K.offset_loop2(hole, S.DELTA)
    ch = K.FlatChart((0, FILL_Y, 0), (1, 0, 0), (0, 0, 1), (0, 1, 0))
    V, N, Tr = K.mesh_region(ch, [K.Loop(si)], [], None, spacing=0.03)
    b = K.Buf().add(V, N, Tr, 'steel')
    P = np.stack([si[:, 0], np.full(len(si), FILL_Y), si[:, 1]], 1)
    Nn = np.tile((0.0, 1.0, 0.0), (len(P), 1))
    E = side_dir(P, Nn, np.tile(np.array([FILLER['x'] + 1.0, FILL_Y, FILLER['z']]), (len(P), 1)), True)
    E = K.unit(P - np.array([FILLER['x'], FILL_Y, FILLER['z']]))
    V, N, Tr = K.roll_edge(P, Nn, E, 0.0015, 0.006, 0.004, 2, closed=True, hem_segs=0)
    b.add(V, N, Tr, 'steel')
    b.extend(K.panel_back(P, Nn, E))
    return b
