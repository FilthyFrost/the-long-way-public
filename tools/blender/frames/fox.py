"""
ModCar frame 'fox' (狐狸): a fictional small, light 1980s two-seat sports coupe of our own design: a long low
bonnet with pop-up headlamps in its front corners, a wedge nose, a short cabin set back, a small fastback with a
short boot lid and a lip spoiler, round twin tail lamps in a black tail panel, a thin band (paint_b) along the
sides at bumper height. Front-mid engine (longitudinal, well behind the front axle), rear-wheel drive.

    blender -b --factory-startup --python tools/blender/build.py -- frames/fox [--no-preview] [--quick]

Writes public/models/modcar/frames/fox.glb and src/core/modcar/data/mounts/fox.json; previews go to
D:/modcar-scratch/frames/fox/fox_*.png. Blender axes: X forward, Y left, Z up; origin on the ground under the
middle of the wheelbase. All dimensions are in the table D below; the modelling code only reads it.

Shell construction as frames/sedan.py (see _kit.py): L = lower body, G = greenhouse, both exact SDFs. Charts:
CL (lower body loft, u = arc length round the plan from the front centre to the rear centre, t = arc length up
the section from the underside over the shoulder onto a top strip), CG (greenhouse: stacked plan rounded
rectangles from below the belt over the roof rail onto a roof strip), CT / CR (height-field charts for the tops).
The loft's wall is mapped in pieces so that the side band (paint_b) lies at one height along the whole car: a
row of constant t is a line of constant z below the shoulder crease. Only the left half (Y >= 0) is meshed; the
right half is the mirror image (the fuel flap is on the right).
"""
import math
import sys

sys.dont_write_bytecode = True

import numpy as np  # noqa: E402

from frames import _kit as K  # noqa: E402
from frames.sedan import RRect  # noqa: E402

PI = math.pi

# ============================================================================================ dimensions
D = dict(
    # the hubs sit body_drop above the wheel radius here; the build moves the whole frame down by it (the body
    # sits lower over its wheels): the hubs end up at the wheel radius (0.265: the 15" alloy and the sport tyre)
    wb=2.30, ax_f=1.15, ax_r=-1.15, hub_z=0.285, track_f=1.40, track_r=1.40, wheel_r=0.265, body_drop=0.02,
    # lower body: plan rounded rectangle at the bulge line (the front and rear faces bow out a little more)
    xf=1.955, xr=-1.960, hw=0.808, rho_f=0.24, rho_r=0.14, bow_f=0.030, bow_r=0.020,
    # the arches sit close over the low-profile tyres, the body flared out round them
    arch_r=0.292, flare=0.014,
    # a shoulder crease runs along the sides at this height: above it the side leans in by shoulder_deg
    shoulder_z=0.66, shoulder_deg=13.0, shoulder_r=0.003,
    # the side band (paint_b) between these heights, round the front and rear corners into the bumpers
    band_z0=0.408, band_z1=0.452,
    # greenhouse
    belt_z=0.848, gw=0.7231, tumble_deg=22.0,
    ws_x=0.5646, ws_bow=0.07, ws_rake=30.0,      # windscreen base centre x, plan bow at |y| = 0.70, rake from horizontal
    rw_x=-1.6879, rw_bow=0.05, rw_rake=25.0,   # rear window: a fastback's, long and flat
    roof_z=1.222, roof_crown_y=0.024, roof_crown_x=0.008, roof_xc=-0.46,
    rho_a=0.075, rho_c=0.12,                   # A / C pillar plan radii
    r_rail=0.030, r_header=0.040, r_rheader=0.20,
    # cuts
    gap=0.005, edge_r=0.0022,
    door_bot=0.175, fd_front=0.38, fd_rear=-0.74,
    rail_z=1.152, cp_bot=-0.74, cp_top=-0.635,
    # bonnet: full width behind the pods, between them in front of hood_step
    hood_rear=0.60, hood_w=0.728, hood_step=1.478, hood_front_w=0.398,
    # pop-up lamp pods (closed lid outline on the top, left side)
    pod_x0=1.522, pod_x1=1.776, pod_y0=0.432, pod_y1=0.690,
    trunk_front=-1.635, trunk_w=0.600,
    # front openings (front view y, z): the slot over the bumper, the intake under it, the indicators
    slot_w=0.355, slot_z0=0.506, slot_z1=0.556,
    intake_w=0.455, intake_z0=0.212, intake_z1=0.352,
    ind_y0=0.438, ind_y1=0.612,
    # tail: the black panel and the round twin lamps (the outer one is the taillight mount)
    tail_z0=0.585, tail_z1=0.760, lamp_r=0.0675, lamp_z=0.6725, lamp_y_out=0.585, lamp_y_in=0.430,
    fuel_x=-1.655, fuel_z=0.565, fuel_r=0.052,
)
GAP = D['gap']
ER = D['edge_r']
DELTA = GAP / 2 + ER   # cut line -> panel surface boundary (the rolled edge reaches back to gap/2)


# ============================================================================================ exact surfaces
# lower body ---------------------------------------------------------------------------------------------
_tumble = K.Spline([0.10, 0.16, 0.24, 0.34, 0.45, 0.60, 0.70, 0.80], [0.032, 0.018, 0.007, 0.001, 0.0, 0.002, 0.006, 0.012])
# the wedge: the nose's face is furthest forward at the bumper and leans back over the slot into the bonnet
_front_lean = K.Spline([0.12, 0.20, 0.30, 0.40, 0.46, 0.54, 0.62, 0.70, 0.76], [-0.065, -0.030, -0.008, 0.0, 0.0, -0.012, -0.035, -0.068, -0.095])
_rear_lean = K.Spline([0.24, 0.32, 0.42, 0.52, 0.76, 0.88], [0.085, 0.050, 0.018, 0.0, 0.0, -0.006])
# the top: a long bonnet falling to the nose, the waist low along the door and kicking up over the rear quarter
_top_base = K.Spline([-2.10, -1.90, -1.60, -1.20, -0.70, 0.0, 0.50, 0.70, 1.00, 1.30, 1.60, 1.80, 1.95, 2.10],
                     [0.872, 0.878, 0.887, 0.879, 0.858, 0.848, 0.849, 0.842, 0.817, 0.786, 0.744, 0.701, 0.662, 0.632])
_crown = K.Spline([-2.10, -1.55, -1.40, 0.45, 0.62, 1.30, 2.00], [0.010, 0.010, 0.0, 0.0, 0.014, 0.016, 0.012])
_bot = K.Spline([-2.10, -1.95, -1.75, -1.50, 1.45, 1.70, 1.90, 2.10], [0.282, 0.272, 0.215, 0.140, 0.130, 0.145, 0.165, 0.180])


def _flare(x, z):
    """The body's flare round the wheel arches: full at the arch's lip, gone a hand's width out (less behind,
    where the door's rear edge comes close to the rear arch), and gone by the shoulder crease (the upper side is
    left as it is)."""
    x = np.asarray(x, float)
    z = np.asarray(z, float)
    R = D['arch_r']
    out = np.zeros(np.broadcast(x, z).shape)
    for xa, fall in ((D['ax_f'], 0.15), (D['ax_r'], 0.105)):
        d = np.hypot(x - xa, z - D['hub_z'])
        out = out + D['flare'] * K.sstep(R + fall, R + 0.035, d)
    return out * K.sstep(D['shoulder_z'] - 0.005, D['shoulder_z'] - 0.07, z)


def side_w(x, z):
    """Half width of the lower body side at (x, z)."""
    return D['hw'] - 0.012 * (np.asarray(x) / 1.95) ** 2 - _tumble(z) + _flare(x, z)


_SH_TAN = math.tan(math.radians(D['shoulder_deg']))


def sh_tan(x):
    """The lean above the shoulder crease: along the doors and the rear quarters, fading out ahead of the front
    wheels (the nose's top is at the crease's height there)."""
    return _SH_TAN * K.sstep(1.62, 1.30, x)


def side_w_up(x, z):
    """Half width of the side above the shoulder crease: leaning in from the crease line."""
    return side_w(x, D['shoulder_z']) - (z - D['shoulder_z']) * sh_tan(x)


def front_x(ay, z):
    return D['xf'] + D['bow_f'] * (1 - (ay / D['hw']) ** 2) + _front_lean(z)


def rear_x(ay, z):
    return D['xr'] - D['bow_r'] * (1 - (ay / D['hw']) ** 2) + _rear_lean(z)


def top_z(x, ay):
    return _top_base(x) + _crown(x) * (1 - (np.minimum(ay, 0.8) / 0.80) ** 2)


def r_top(x):
    return 0.020 + 0.040 * K.sstep(1.72, 1.90, x) + 0.015 * K.sstep(-1.82, -1.95, x)


def r_bot(x):
    return 0.030 + 0.020 * K.sstep(1.55, 1.80, x) + 0.050 * K.sstep(-1.50, -1.80, x)


def L_sdf(P):
    x, y, z = P[:, 0], P[:, 1], P[:, 2]
    ay = np.abs(y)
    a_side = K.r_int(ay - side_w(x, z), ay - side_w_up(x, z), D['shoulder_r'])
    a_front = x - front_x(ay, z)
    a_rear = rear_x(ay, z) - x
    a_top = z - top_z(x, ay)
    a_bot = _bot(x) - z
    d = K.r_int(a_side, a_front, D['rho_f'])
    d = K.r_int(d, a_rear, D['rho_r'])
    d = K.r_int(d, a_top, r_top(x))
    d = K.r_int(d, a_bot, r_bot(x))
    return d


# greenhouse -----------------------------------------------------------------------------------------------
_TH = math.radians(D['tumble_deg'])
_WR = math.radians(D['ws_rake'])
_RR = math.radians(D['rw_rake'])
PHI_F = math.atan(1.0 / math.tan(_WR))   # wall angle from vertical: windscreen
PHI_S = _TH
PHI_R = math.atan(1.0 / math.tan(_RR))


def g_side_w(z):
    return D['gw'] - (z - D['belt_z']) * math.tan(_TH)


def ws_x(ay, z):
    """Windscreen plane (outer surface of the greenhouse front) at (|y|, z)."""
    return D['ws_x'] - D['ws_bow'] * (ay / 0.70) ** 2 - (z - D['belt_z']) / math.tan(_WR)


def rw_x(ay, z):
    return D['rw_x'] + D['rw_bow'] * (ay / 0.70) ** 2 + (z - D['belt_z']) / math.tan(_RR)


def roof_z(x, ay):
    return D['roof_z'] - D['roof_crown_y'] * (ay / 0.60) ** 2 - D['roof_crown_x'] * ((x - D['roof_xc']) / 0.5) ** 2


def r_roof(x, ay):
    """Roof fillet radius: the rails' along the sides, the windscreen header's at the front, the fastback's long
    blend from the roof into the rear window across the middle (not over the quarter windows)."""
    return (D['r_rail'] + (D['r_header'] - D['r_rail']) * K.sstep(-0.24, -0.04, x)
            + (D['r_rheader'] - D['r_rail']) * K.sstep(-0.74, -0.92, x) * K.sstep(0.56, 0.36, ay))


G_Z0 = 0.78


def G_sdf(P):
    x, y, z = P[:, 0], P[:, 1], P[:, 2]
    ay = np.abs(y)
    a_side = (ay - g_side_w(z)) * math.cos(_TH)
    a_front = (x - ws_x(ay, z)) * math.sin(_WR)
    a_rear = (rw_x(ay, z) - x) * math.sin(_RR)
    a_roof = z - roof_z(x, ay)
    a_bot = G_Z0 - z
    d = K.r_int(a_side, a_front, D['rho_a'])
    d = K.r_int(d, a_rear, D['rho_c'])
    d = K.r_int(d, a_roof, r_roof(x, ay))
    d = np.maximum(d, a_bot)
    return d


# ============================================================================================ proxies (charts)
# lower body proxy: t pieces (reference metres): underside, rocker fillet, wall, shoulder fillet, top strip. The
# wall in four pieces: rocker -> band bottom, the band, band top -> shoulder crease, crease -> top fillet; the band
# and the crease are at fixed heights, so rows of constant t are lines of constant z there
L_T = np.cumsum([0.0, 0.05, 0.045, 0.62, 0.03, 0.065])
L_GUIDE = RRect(D['xf'], D['xr'], D['hw'], D['rho_f'], D['rho_r'])
LEAN = 0.014
UNDER = 0.06
T_B0 = L_T[2] + 0.18          # band bottom
T_B1 = T_B0 + 0.05            # band top
T_S = L_T[2] + 0.42           # the shoulder crease
ZB0, ZB1 = D['band_z0'], D['band_z1']


def w_top(x):
    """Width of the loft's top strip past the shoulder fillet: wide along the cabin (reaches past the belt)."""
    return 0.012 + 0.050 * K.sstep(0.62, 0.45, x) * K.sstep(-1.62, -1.50, x)


def l_z0z1(x):
    """Bottom and top heights of the straight wall part of the lower body proxy at x."""
    return _bot(x) + r_bot(x), top_z(x, 0.79) - r_top(x)


def _wall_z(tt, z0, z1):
    """Height on the wall for wall parameter tt (L_T[2] .. L_T[3]) between z0 (rocker) and z1 (top fillet): the
    band and the shoulder crease at their fixed heights (clamped where the wall is too short for them)."""
    zs = np.clip(D['shoulder_z'], z0 + 0.03, z1 - 0.01)
    zb0 = np.clip(ZB0, z0 + 0.01, zs - 0.06)
    zb1 = np.clip(ZB1, zb0 + 0.01, zs - 0.02)
    t2, t3 = L_T[2], L_T[3]
    return np.where(tt < T_B0, z0 + (zb0 - z0) * (tt - t2) / (T_B0 - t2),
           np.where(tt < T_B1, zb0 + (zb1 - zb0) * (tt - T_B0) / (T_B1 - T_B0),
           np.where(tt < T_S, zb1 + (zs - zb1) * (tt - T_B1) / (T_S - T_B1),
                    zs + (z1 - zs) * (tt - T_S) / (t3 - T_S))))


def _face_off(nx, y0, z):
    """How far the real front / rear face stands out of the loft's guide (along the plan's outward normal) at
    height z: its bow at the middle and its lean (the nose leans back over the slot, the tail tucks under)."""
    w = 1 - (np.minimum(np.abs(y0), D['hw']) / D['hw']) ** 2
    ff = np.maximum(nx, 0.0) ** 2
    rf = np.maximum(-nx, 0.0) ** 2
    return ff * (D['bow_f'] * w + _front_lean(z)) + rf * (D['bow_r'] * w - _rear_lean(z))


def _l_section(u, t):
    x0, y0, nx, ny = L_GUIDE.point(u)
    zb = _bot(x0)
    zt = top_z(x0, 0.79)
    rb = r_bot(x0)
    rs = r_top(x0)
    wt = w_top(x0)
    n = np.empty_like(u)
    z = np.empty_like(u)
    m = t < L_T[1]
    f = (t[m] - L_T[0]) / (L_T[1] - L_T[0])
    n[m] = -rb[m] - UNDER * (1 - f) + _face_off(nx[m], y0[m], zb[m])
    z[m] = zb[m]
    m = (t >= L_T[1]) & (t < L_T[2])
    f = (t[m] - L_T[1]) / (L_T[2] - L_T[1])
    a = -PI / 2 + f * PI / 2
    z[m] = zb[m] + rb[m] + rb[m] * np.sin(a)
    n[m] = -rb[m] + rb[m] * np.cos(a) + _face_off(nx[m], y0[m], z[m])
    # above the crease the section leans in on the sides (sw: 1 along the sides, 0 across the front and the rear)
    sw = ny ** 2
    m = (t >= L_T[2]) & (t < L_T[3])
    z0 = zb[m] + rb[m]
    z1 = zt[m] - rs[m]
    zs = np.clip(D['shoulder_z'], z0 + 0.03, z1 - 0.01)
    zz = _wall_z(t[m], z0, z1)
    f = (zz - z0) / (z1 - z0)
    n[m] = -LEAN * f - np.maximum(0.0, zz - zs) * sh_tan(x0[m]) * sw[m] + _face_off(nx[m], y0[m], zz)
    z[m] = zz
    zs_all = np.clip(D['shoulder_z'], zb + rb + 0.03, zt - rs - 0.01)
    up = (zt - rs - zs_all) * sh_tan(x0) * sw - _face_off(nx, y0, zt - rs)
    m = (t >= L_T[3]) & (t < L_T[4])
    f = (t[m] - L_T[3]) / (L_T[4] - L_T[3])
    a = f * PI / 2
    n[m] = -LEAN - up[m] - rs[m] + rs[m] * np.cos(a)
    z[m] = zt[m] - rs[m] + rs[m] * np.sin(a)
    m = t >= L_T[4]
    f = (t[m] - L_T[4]) / (L_T[5] - L_T[4])
    n[m] = -LEAN - up[m] - rs[m] - wt[m] * f
    z[m] = zt[m]
    return n, z


def L_proxy(u, t):
    u, t = np.broadcast_arrays(np.asarray(u, float), np.asarray(t, float))
    u = u.ravel()
    t = np.clip(t.ravel(), L_T[0] - 0.2, L_T[-1] + 0.2)
    uc = np.clip(u, 0.0, L_GUIDE.length - 1e-9)
    n, z = _l_section(uc, t)
    x, y, nx, ny = L_GUIDE.point(uc, n)
    lo = u < 0
    y[lo] = u[lo]
    hi = u > L_GUIDE.length
    y[hi] = -(u[hi] - L_GUIDE.length)
    return np.stack([x, y, z], 1)


# greenhouse proxy: stacked rounded rectangles. t pieces: wall (G_Z0 -> G_ZW), upper wall (G_ZW -> fillet start),
# roof fillet, roof strip
G_T = np.cumsum([0.0, 0.30, 0.10, 0.07, 0.05])
# how far the greenhouse loft reaches onto the roof past the rail's fillet (the pillars' plan sections, less the
# fillets' reach, must keep some width at the roof or the roof's outline folds at its corners)
ROOF_STRIP = 0.015
G_ZW = 1.05
G_GUIDE = RRect(ws_x(0.0, D['belt_z']), rw_x(0.0, D['belt_z']), g_side_w(D['belt_z']), D['rho_a'], D['rho_c'])
_GS0 = G_GUIDE.seg / G_GUIDE.length


def _corner_kx(rake):
    """How much longer in x than across a pillar's plan section is: the round between the side (its tumblehome) and
    a raked glass plane is a cylinder along their inclined edge, so its level section is an ellipse long in x (a
    circle of the round's radius left the proxy's A corner far ahead of the shell up at the roof, its top rows
    folded there)."""
    st, ct = math.sin(_TH), math.cos(_TH)
    sr = math.sin(rake)
    return math.sqrt(ct * ct + st * st * sr * sr) / (ct * sr)


KX_A = _corner_kx(_WR)
KX_C = _corner_kx(_RR)


def g_contour(uf, z, off=None):
    """Point and plan normal at fraction uf of the half contour of the greenhouse at height z; off (< 0, per point)
    moves it inwards: along the normal on the straights, round the corners by shrinking both of the ellipse's
    semi-axes (a true offset of an ellipse long in x folds at its tips, tighter than the roof's fillet reaches)."""
    uf = np.asarray(uf, float)
    z = np.broadcast_to(np.asarray(z, float), uf.shape)
    off = np.zeros_like(uf) if off is None else np.broadcast_to(np.asarray(off, float), uf.shape)
    w = g_side_w(z)
    rf = D['rho_a']
    rr = D['rho_c']
    rfx = rf * KX_A
    rrx = rr * KX_C
    x = np.empty_like(uf)
    y = np.empty_like(uf)
    nx = np.empty_like(uf)
    ny = np.empty_like(uf)
    s0 = _GS0
    for k in range(5):
        m = (uf >= s0[k]) & ((uf < s0[k + 1]) if k < 4 else np.ones_like(uf, bool))
        if k == 0:
            m = uf < s0[1]
        if not m.any():
            continue
        f = (uf[m] - s0[k]) / (s0[k + 1] - s0[k])
        zz = z[m]
        o = off[m]
        if k == 0:
            yy = f * (w[m] - rf)
            x[m] = ws_x(yy, zz) + o
            y[m] = yy
            nx[m], ny[m] = 1.0, 0.0
        elif k == 1:
            a = f * PI / 2
            yc = w[m] - rf
            cx = ws_x(yc, zz) - rfx
            x[m] = cx + (rfx + o) * np.cos(a)
            y[m] = yc + (rf + o) * np.sin(a)
            ex, ey = np.cos(a) / rfx, np.sin(a) / rf
            el = np.hypot(ex, ey)
            nx[m], ny[m] = ex / el, ey / el
        elif k == 2:
            x0 = ws_x(w[m] - rf, zz) - rfx
            x1 = rw_x(w[m] - rr, zz) + rrx
            x[m] = x0 + (x1 - x0) * f
            y[m] = w[m] + o
            nx[m], ny[m] = 0.0, 1.0
        elif k == 3:
            a = PI / 2 + f * PI / 2
            yc = w[m] - rr
            cx = rw_x(yc, zz) + rrx
            x[m] = cx + (rrx + o) * np.cos(a)
            y[m] = yc + (rr + o) * np.sin(a)
            ex, ey = np.cos(a) / rrx, np.sin(a) / rr
            el = np.hypot(ex, ey)
            nx[m], ny[m] = ex / el, ey / el
        else:
            yy = (1 - f) * (w[m] - rr)
            x[m] = rw_x(yy, zz) - o
            y[m] = yy
            nx[m], ny[m] = -1.0, 0.0
    return x, y, nx, ny


def g_phi(nx, ny):
    """Wall angle from vertical round the contour (windscreen / side / rear window). Round a pillar the wall's
    normal is a mix of the two planes' normals, so for a plan normal (nx, ny) tan(phi) mixes the planes' tangents
    by the plan normal's own components (the windscreen's steep lean holds well round the corner)."""
    return np.where(nx > 0, np.arctan(nx * math.tan(PHI_F) + np.abs(ny) * math.tan(PHI_S)),
                    np.arctan(-nx * math.tan(PHI_R) + np.abs(ny) * math.tan(PHI_S)))


def G_proxy(u, t):
    u, t = np.broadcast_arrays(np.asarray(u, float), np.asarray(t, float))
    u = u.ravel()
    t = np.clip(t.ravel(), G_T[0] - 0.2, G_T[-1] + 0.2)
    uf = np.clip(u / G_GUIDE.length, 0.0, 1.0)
    t1, t2, t3, t4 = G_T[1], G_T[2], G_T[3], G_T[4]
    # fillet start height per point (from the roof height and wall angle there)
    xa, ya, nxa, nya = g_contour(uf, 1.16)
    phi = g_phi(nxa, nya)
    r = r_roof(xa, np.abs(ya))
    zs = roof_z(xa, np.abs(ya)) - r * (1 - np.sin(phi))
    zw = G_Z0 + (G_ZW - G_Z0) * (t / t1)
    zu = G_ZW + (zs - G_ZW) * np.clip((t - t1) / (t2 - t1), 0, 1)
    z = np.where(t <= t1, zw, zu)
    x, y, nx, ny = g_contour(uf, np.minimum(z, zs))
    up = t > t2
    if up.any():
        ph = phi[up]
        rr_ = r[up]
        fa = np.clip((t[up] - t2) / (t3 - t2), 0, 1)
        a = ph + (PI / 2 - ph) * fa
        noff = -rr_ * np.cos(ph) + rr_ * np.cos(a) - ROOF_STRIP * np.clip((t[up] - t3) / (t4 - t3), 0, 1)
        x[up], y[up], _, _ = g_contour(uf[up], zs[up], noff)
        z[up] = zs[up] - rr_ * np.sin(ph) + rr_ * np.sin(a)
    lo = u < 0
    y[lo] = u[lo]
    hi = u > G_GUIDE.length
    y[hi] = -(u[hi] - G_GUIDE.length)
    return np.stack([x, y, z], 1)


CL = K.Chart(L_proxy, L_sdf, (0.0, L_GUIDE.length), (L_T[0], L_T[-1]))
CG = K.Chart(G_proxy, G_sdf, (0.0, G_GUIDE.length), (G_T[0], G_T[-1]))
CT = K.TopChart(L_sdf)
CR = K.TopChart(G_sdf)
SIDE_L = K.PlaneChart(L_sdf, axis=1, sign=1.0)
SIDE_G = K.PlaneChart(G_sdf, axis=1, sign=1.0)
FRONT_L = K.PlaneChart(L_sdf, axis=0, sign=1.0)
REAR_L = K.PlaneChart(L_sdf, axis=0, sign=-1.0)

SL = L_GUIDE.seg
SG = G_GUIDE.seg


def u_of_x(x):
    """Lower body loft u on the straight side for a given x."""
    return SL[2] + (D['xf'] - D['rho_f']) - np.asarray(x, float)


def t_of_z(x, z):
    """Lower body loft t for height z at x (wall, rocker fillet; below the rocker it continues downwards)."""
    x = np.asarray(x, float)
    z = np.asarray(z, float)
    z0, z1 = l_z0z1(x)
    zs = np.clip(D['shoulder_z'], z0 + 0.03, z1 - 0.01)
    zb0 = np.clip(ZB0, z0 + 0.01, zs - 0.06)
    zb1 = np.clip(ZB1, zb0 + 0.01, zs - 0.02)
    t2, t3 = L_T[2], L_T[3]
    t = np.where(z < zb0, t2 + (z - z0) / (zb0 - z0) * (T_B0 - t2),
        np.where(z < zb1, T_B0 + (z - zb0) / (zb1 - zb0) * (T_B1 - T_B0),
        np.where(z < zs, T_B1 + (z - zb1) / (zs - zb1) * (T_S - T_B1),
                 T_S + (z - zs) / (z1 - zs) * (t3 - T_S))))
    zb = _bot(x)
    rb = r_bot(x)
    a = np.arcsin(np.clip((z - zb - rb) / rb, -1, 0))
    tf = L_T[1] + (a + PI / 2) / (PI / 2) * (L_T[2] - L_T[1])
    t = np.where(z < z0, tf, t)
    t = np.where(z < zb, L_T[1] - (zb - z), t)
    return t


# ============================================================================================ sampling
def l_u_samples():
    s = SL
    parts = [np.linspace(s[0], s[1], int((s[1] - s[0]) / 0.06) + 1),
             np.linspace(s[1], s[2], int((s[2] - s[1]) / 0.026) + 1),
             np.linspace(s[2], s[3], int((s[3] - s[2]) / 0.075) + 1),
             np.linspace(s[3], s[4], int((s[4] - s[3]) / 0.022) + 1),
             np.linspace(s[4], s[5], int((s[5] - s[4]) / 0.06) + 1)]
    return np.unique(np.concatenate(parts))


def l_t_samples():
    T = L_T
    parts = [np.linspace(T[0], T[1], 3), np.linspace(T[1], T[2], 5), np.linspace(T[2], T_B0, 4), [T_B1],
             np.linspace(T_B1, T_S, 4), np.linspace(T_S, T[3], 4), np.linspace(T[3], T[4], 7), np.linspace(T[4], T[5], 3),
             [T_S - 0.006, T_S + 0.006]]
    return np.unique(np.concatenate(parts))


def g_u_samples():
    """Greenhouse columns: every 0.08 along the windscreen, the side and the rear window, closer round the
    pillars' corners (their sections long in x, see KX_A / KX_C)."""
    s = SG
    parts = [np.linspace(s[0], s[1], int((s[1] - s[0]) / 0.08) + 1), np.linspace(s[1], s[2], 9),
             np.linspace(s[2], s[3], int((s[3] - s[2]) / 0.08) + 1), np.linspace(s[3], s[4], 12),
             np.linspace(s[4], s[5], int((s[5] - s[4]) / 0.08) + 1)]
    return np.unique(np.concatenate(parts))


def g_t_samples():
    T = G_T
    parts = [np.linspace(T[0], T[1], 5), np.linspace(T[1], T[2], 4), np.linspace(T[2], T[3], 7), np.linspace(T[3], T[4], 3)]
    return np.unique(np.concatenate(parts))


def grid_from(us, ts):
    uu, tt = np.meshgrid(us, ts, indexing='ij')
    du = np.gradient(us)
    dt = np.gradient(ts)
    sp = np.minimum(du[:, None], dt[None, :]) * np.ones_like(uu)
    return np.stack([uu.ravel(), tt.ravel()], 1), sp.ravel()


def main(args):
    from frames import _fox_build as FB
    FB.build(args)
