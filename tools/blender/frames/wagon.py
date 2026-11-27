"""
ModCar frame 'wagon' (旅人, Wanderer): a fictional 1980s long family estate car, front engine (a longitudinal
straight six), rear-wheel drive, four doors, a long flat bonnet, a long roof with a rack running back to a
near-vertical tailgate hinged at the roof. docs/MODCAR.md section 2.2.

    blender -b --factory-startup --python tools/blender/build.py -- frames/wagon [--no-preview] [--quick]

Writes public/models/modcar/frames/wagon.glb and src/core/modcar/data/mounts/wagon.json; previews go to
D:/modcar-scratch/frames/wagon/*.png. Blender axes: X forward, Y left, Z up; origin on the ground under the
middle of the wheelbase. All dimensions are in the table D below; the modelling code only reads it.

Built as frames/sedan.py is (see _kit.py): L = lower body, G = greenhouse, both exact SDFs, with the charts CL
(lower body loft), CG (greenhouse: stacked plan rounded rectangles), CT / CR (height fields of the tops). The
greenhouse runs back to the tail: its rear wall (the tailgate's window frame) stands on the lower body's top
strip the way its sides do, so the junction runs along that strip from the A pillar's foot round the side and
the tail to the rear centre (as the pickup's cab back does). The tailgate is cut in both shells and meets itself
at that junction, as a door does. Only the left half (Y >= 0) is meshed; the right half is its mirror (the fuel
flap is on the right).
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
    # sits lower over its wheels). The factory wheels are the sedan's: a 13" steel rim with the road tyre.
    wb=2.72, ax_f=1.36, ax_r=-1.36, hub_z=0.305, track_f=1.45, track_r=1.43, wheel_r=0.285, body_drop=0.02,
    # lower body: plan rounded rectangle at the bulge line
    xf=2.205, xr=-2.565, hw=0.86, rho_f=0.12, rho_r=0.10,
    arch_r=0.323,                              # the sedan's arches over the same wheels
    # a crease runs along the sides at this height (the top of the side trim band): above it the side leans
    # in by shoulder_deg
    shoulder_z=0.875, shoulder_deg=11.0, shoulder_r=0.003,
    # greenhouse
    belt_z=0.955, gw=0.810, tumble_deg=12.0,
    ws_x=1.035, ws_bow=0.05, ws_rake=47.0,     # windscreen base centre x, plan bow at |y| = 0.72, rake from horizontal
    rw_x=-2.547, rw_bow=0.008, rw_rake=82.0,   # the tailgate's window frame (rear wall of the greenhouse)
    roof_z=1.44, roof_crown_y=0.030, roof_crown_x=0.004, roof_xc=-0.70,
    rho_a=0.045, rho_c=0.07,                   # A / D pillar plan radii
    r_rail=0.028, r_header=0.036, r_rheader=0.040,
    # cuts
    gap=0.005, edge_r=0.0022,
    door_bot=0.27, fd_front=0.905, fd_rear=-0.175, rd_front=-0.175, rd_rear=-1.13,
    bp_front=-0.172, bp_rear=-0.232, rail_z=1.36, cp_top=-1.095,
    cp_w=0.045,                                # the C pillar's body part behind the rear door frame
    dp_w=0.09,                                 # the D pillar on the side face, ahead of its corner
    hood_rear=1.15, hood_w=0.800,
    # tailgate: bottom edge, half width below the jog (between the tail lamps), the jog's height, its width
    # in from the D pillar's rear face corner at the top
    tg_bot=0.445, tg_w=0.515, tg_jog=0.80, tg_d=0.050,
    # lamps: a wide rectangular housing each side (headlamp inboard, the amber turn lamp outboard)
    lamp_y0=0.370, lamp_y1=0.735, lamp_z=0.700, lamp_h=0.172, hl_w=0.240,
    grille_w=0.330, grille_z0=0.612, grille_z1=0.782,
    tail_y0=0.545, tail_y1=0.800, tail_z0=0.620, tail_z1=0.745,
    # the side trim band (paint_b): from band_z0 up to the crease, from the front corner to the rear corner
    band_z0=0.665,
    # fuel flap (right rear quarter, under the band)
    fuel_x=-1.955, fuel_z=0.585, fuel_r=0.054,
)
GAP = D['gap']
ER = D['edge_r']
DELTA = GAP / 2 + ER   # cut line -> panel surface boundary (the rolled edge reaches back to gap/2)


# ============================================================================================ exact surfaces
# lower body ---------------------------------------------------------------------------------------------
_tumble = K.Spline([0.18, 0.25, 0.35, 0.48, 0.62, 0.78, 0.88, 0.97], [0.030, 0.017, 0.006, 0.001, 0.0, 0.002, 0.006, 0.012])
_front_lean = K.Spline([0.17, 0.28, 0.38, 0.50, 0.66, 0.80, 0.90], [-0.055, -0.026, -0.007, 0.0, -0.002, -0.009, -0.018])
_rear_lean = K.Spline([0.22, 0.34, 0.44, 0.58, 0.76, 0.98], [0.045, 0.018, 0.005, 0.0, 0.002, 0.008])
_top_base = K.Spline([-2.70, -2.40, -1.50, -0.50, 0.50, 1.00, 1.20, 1.60, 2.00, 2.35],
                     [0.950, 0.952, 0.952, 0.950, 0.946, 0.940, 0.931, 0.916, 0.899, 0.886])
_crown = K.Spline([-2.70, 1.00, 1.14, 1.50, 2.35], [0.0, 0.0, 0.010, 0.013, 0.010])
_bot = K.Spline([-2.70, -2.45, -2.20, -1.95, 1.75, 1.95, 2.30], [0.305, 0.288, 0.255, 0.218, 0.218, 0.238, 0.258])


def side_w(x, z):
    """Half width of the lower body side at (x, z)."""
    return D['hw'] - 0.008 * ((x + 0.18) / 2.40) ** 2 - _tumble(z)


_SH_TAN = math.tan(math.radians(D['shoulder_deg']))


def side_w_up(x, z):
    """Half width of the side above the crease: leaning in from the crease line."""
    return side_w(x, D['shoulder_z']) - (z - D['shoulder_z']) * _SH_TAN


def front_x(ay, z):
    return D['xf'] + 0.014 * (1 - (ay / D['hw']) ** 2) + _front_lean(z)


def rear_x(ay, z):
    return D['xr'] - 0.012 * (1 - (ay / D['hw']) ** 2) + _rear_lean(z)


def top_z(x, ay):
    return _top_base(x) + _crown(x) * (1 - (np.minimum(ay, 0.85) / 0.85) ** 2)


def r_top(x):
    return 0.018 + 0.017 * K.sstep(2.00, 2.16, x)


def r_bot(x):
    return 0.036 + 0.03 * K.sstep(1.75, 1.95, x) + 0.03 * K.sstep(-2.00, -2.20, x)


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
G_Z0 = 0.86                              # the greenhouse's foot, inside the lower body
G_ZW = 1.30


def g_side_w(z):
    return D['gw'] - (z - D['belt_z']) * math.tan(_TH)


def ws_x(ay, z):
    """Windscreen plane (outer surface of the greenhouse front) at (|y|, z)."""
    return D['ws_x'] - D['ws_bow'] * (ay / 0.72) ** 2 - (z - D['belt_z']) / math.tan(_WR)


def rw_x(ay, z):
    """The greenhouse's rear wall (the tailgate's window frame) at (|y|, z): leaning forward going up."""
    return D['rw_x'] + D['rw_bow'] * (ay / 0.70) ** 2 + (z - D['belt_z']) / math.tan(_RR)


def roof_z(x, ay):
    return D['roof_z'] - D['roof_crown_y'] * (ay / 0.70) ** 2 - D['roof_crown_x'] * ((x - D['roof_xc']) / 0.8) ** 2


def r_roof(x):
    return D['r_rail'] + (D['r_header'] - D['r_rail']) * K.sstep(0.35, 0.55, x) + (D['r_rheader'] - D['r_rail']) * K.sstep(-2.25, -2.42, x)


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
    d = K.r_int(d, a_roof, r_roof(x))
    d = np.maximum(d, a_bot)
    return d


# ============================================================================================ proxies (charts)
# lower body proxy: t pieces (reference metres): underside, rocker fillet, wall, shoulder fillet, top strip
L_T = np.cumsum([0.0, 0.06, 0.055, 0.66, 0.03, 0.03])
L_GUIDE = RRect(D['xf'], D['xr'], D['hw'], D['rho_f'], D['rho_r'])
LEAN = 0.016                                      # the proxy's wall leans in by this at its top...
LEAN_R = -0.003                                   # ...but the tail stands upright (bulging back a touch)
UNDER = 0.06
T_S = L_T[2] + 6.0 / 7.0 * (L_T[3] - L_T[2])     # the crease's t: on a row of l_t_samples
# the wall's upper part (from Z_M to the crease, T_M to T_S) is parameterised by height alone, so that a line
# of constant t there (the trim band's edges) runs at one height even where the sills rise at the ends
Z_M = 0.55
T_M = L_T[2] + 3.0 / 7.0 * (L_T[3] - L_T[2])     # (also on a row of l_t_samples)


def _zs(z0, z1):
    return np.clip(D['shoulder_z'], z0 + 0.01, z1 - 0.01)


def w_top(x):
    """Width of the loft's top strip past the shoulder fillet: wide behind the A pillar's foot, round the tail
    too (the greenhouse stands on it there)."""
    return 0.012 + 0.020 * K.sstep(1.05, 0.95, x)


def l_z0z1(x):
    """Bottom and top heights of the straight wall part of the lower body proxy at x."""
    return _bot(x) + r_bot(x), top_z(x, 0.84) - r_top(x)


def _l_section(u, t):
    x0, y0, nx, ny = L_GUIDE.point(u)
    zb = _bot(x0)
    zt = top_z(x0, 0.84)
    rb = r_bot(x0)
    rs = r_top(x0)
    wt = w_top(x0)
    lean = np.where(nx < 0, LEAN * ny ** 2 + LEAN_R * nx ** 2, LEAN)
    n = np.empty_like(u)
    z = np.empty_like(u)
    m = t < L_T[1]
    f = (t[m] - L_T[0]) / (L_T[1] - L_T[0])
    n[m] = -rb[m] - UNDER * (1 - f)
    z[m] = zb[m]
    m = (t >= L_T[1]) & (t < L_T[2])
    f = (t[m] - L_T[1]) / (L_T[2] - L_T[1])
    a = -PI / 2 + f * PI / 2
    n[m] = -rb[m] + rb[m] * np.cos(a)
    z[m] = zb[m] + rb[m] + rb[m] * np.sin(a)
    # the wall in three pieces (the lower wall, from Z_M up to the crease, above the crease); above the crease
    # the section leans in on the sides (sw: 1 along the sides, 0 across the front and the rear)
    sw = ny ** 2
    m = (t >= L_T[2]) & (t < L_T[3])
    tt = t[m]
    z0 = zb[m] + rb[m]
    z1 = zt[m] - rs[m]
    zs = _zs(z0, z1)
    zz = np.where(tt < T_M, z0 + (Z_M - z0) * (tt - L_T[2]) / (T_M - L_T[2]),
                  np.where(tt < T_S, Z_M + (zs - Z_M) * (tt - T_M) / (T_S - T_M), zs + (z1 - zs) * (tt - T_S) / (L_T[3] - T_S)))
    f = (zz - z0) / (z1 - z0)
    n[m] = -lean[m] * f - np.maximum(0.0, zz - zs) * _SH_TAN * sw[m]
    z[m] = zz
    up = (zt - rs - _zs(zb + rb, zt - rs)) * _SH_TAN * sw
    m = (t >= L_T[3]) & (t < L_T[4])
    f = (t[m] - L_T[3]) / (L_T[4] - L_T[3])
    a = f * PI / 2
    n[m] = -lean[m] - up[m] - rs[m] + rs[m] * np.cos(a)
    z[m] = zt[m] - rs[m] + rs[m] * np.sin(a)
    m = t >= L_T[4]
    f = (t[m] - L_T[4]) / (L_T[5] - L_T[4])
    n[m] = -lean[m] - up[m] - rs[m] - wt[m] * f
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


# greenhouse proxy: stacked rounded rectangles. t pieces: wall (z G_Z0 -> G_ZW), upper wall (G_ZW -> fillet
# start), roof fillet, roof strip
G_T = np.cumsum([0.0, 0.44, 0.10, 0.06, 0.05])
G_GUIDE = RRect(ws_x(0.0, D['belt_z']), rw_x(0.0, D['belt_z']), g_side_w(D['belt_z']), D['rho_a'], D['rho_c'])
_GS0 = G_GUIDE.seg / G_GUIDE.length


def g_contour(uf, z):
    """Point and plan normal at fraction uf of the half contour of the greenhouse at height z."""
    uf = np.asarray(uf, float)
    z = np.broadcast_to(np.asarray(z, float), uf.shape)
    w = g_side_w(z)
    rf = D['rho_a']
    rr = D['rho_c']
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
        if k == 0:
            yy = f * (w[m] - rf)
            x[m] = ws_x(yy, zz)
            y[m] = yy
            nx[m], ny[m] = 1.0, 0.0
        elif k == 1:
            a = f * PI / 2
            yc = w[m] - rf
            cx = ws_x(yc, zz) - rf
            x[m] = cx + rf * np.cos(a)
            y[m] = yc + rf * np.sin(a)
            nx[m], ny[m] = np.cos(a), np.sin(a)
        elif k == 2:
            x0 = ws_x(w[m] - rf, zz) - rf
            x1 = rw_x(w[m] - rr, zz) + rr
            x[m] = x0 + (x1 - x0) * f
            y[m] = w[m]
            nx[m], ny[m] = 0.0, 1.0
        elif k == 3:
            a = PI / 2 + f * PI / 2
            yc = w[m] - rr
            cx = rw_x(yc, zz) + rr
            x[m] = cx + rr * np.cos(a)
            y[m] = yc + rr * np.sin(a)
            nx[m], ny[m] = np.cos(a), np.sin(a)
        else:
            yy = (1 - f) * (w[m] - rr)
            x[m] = rw_x(yy, zz)
            y[m] = yy
            nx[m], ny[m] = -1.0, 0.0
    return x, y, nx, ny


def g_phi(nx, ny):
    """Wall angle from vertical round the contour (windscreen / side / rear wall), blended in the corners."""
    return np.where(nx > 0, PHI_F * nx ** 2 + PHI_S * ny ** 2, PHI_R * nx ** 2 + PHI_S * ny ** 2)


def G_proxy(u, t):
    u, t = np.broadcast_arrays(np.asarray(u, float), np.asarray(t, float))
    u = u.ravel()
    t = np.clip(t.ravel(), G_T[0] - 0.2, G_T[-1] + 0.2)
    uf = np.clip(u / G_GUIDE.length, 0.0, 1.0)
    t1, t2, t3, t4 = G_T[1], G_T[2], G_T[3], G_T[4]
    # fillet start height per point (from the roof height and wall angle there)
    xa, ya, nxa, nya = g_contour(uf, 1.38)
    phi = g_phi(nxa, nya)
    r = r_roof(xa)
    zs = roof_z(xa, np.abs(ya)) - r * (1 - np.sin(phi))
    zw = G_Z0 + (G_ZW - G_Z0) * (t / t1)
    zu = G_ZW + (zs - G_ZW) * np.clip((t - t1) / (t2 - t1), 0, 1)
    z = np.where(t <= t1, zw, zu)
    x, y, nx, ny = g_contour(uf, np.minimum(z, zs))
    up = t > t2
    if up.any():
        xs_, ys_, nxs, nys = g_contour(uf[up], zs[up])
        ph = phi[up]
        rr_ = r[up]
        fa = np.clip((t[up] - t2) / (t3 - t2), 0, 1)
        a = ph + (PI / 2 - ph) * fa
        noff = -rr_ * np.cos(ph) + rr_ * np.cos(a) - 0.05 * np.clip((t[up] - t3) / (t4 - t3), 0, 1)
        x[up] = xs_ + nxs * noff
        y[up] = ys_ + nys * noff
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
REAR_G = K.PlaneChart(G_sdf, axis=0, sign=-1.0)

SL = L_GUIDE.seg
SG = G_GUIDE.seg


def u_of_x(x):
    """Lower body loft u on the straight side for a given x."""
    return SL[2] + (D['xf'] - D['rho_f']) - np.asarray(x, float)


def u_of_y_rear(y):
    """Lower body loft u on the straight rear face for a given |y| (the rear centre is the loft's end)."""
    return SL[4] + (D['hw'] - D['rho_r']) - np.asarray(y, float)


def ug_of_y_rear(y):
    """Greenhouse loft u on its rear wall for a given |y| at the belt (the guide's rear straight)."""
    return SG[4] + (G_GUIDE.w - D['rho_c']) - np.asarray(y, float)


def t_of_z(x, z):
    """Lower body loft t for height z at x (wall, rocker fillet; below the rocker it continues downwards)."""
    x = np.asarray(x, float)
    z = np.asarray(z, float)
    z0, z1 = l_z0z1(x)
    zs = _zs(z0, z1)
    t = np.where(z < Z_M, L_T[2] + (z - z0) / (Z_M - z0) * (T_M - L_T[2]),
                 np.where(z < zs, T_M + (z - Z_M) / (zs - Z_M) * (T_S - T_M), T_S + (z - zs) / (z1 - zs) * (L_T[3] - T_S)))
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
             np.linspace(s[1], s[2], int((s[2] - s[1]) / 0.02) + 1),
             np.linspace(s[2], s[3], int((s[3] - s[2]) / 0.085) + 1),
             np.linspace(s[3], s[4], int((s[4] - s[3]) / 0.02) + 1),
             np.linspace(s[4], s[5], int((s[5] - s[4]) / 0.06) + 1)]
    return np.unique(np.concatenate(parts))


def l_t_samples():
    T = L_T
    # (the wall's rows fall on T_M and T_S)
    wall = T[2] + (T[3] - T[2]) * np.array([0.0, 1.5, 3.0, 4.5, 6.0, 7.0]) / 7.0
    parts = [np.linspace(T[0], T[1], 3), np.linspace(T[1], T[2], 4), wall,
             np.linspace(T[3], T[4], 5), np.linspace(T[4], T[5], 3), [T_S - 0.006, T_S + 0.006]]
    return np.unique(np.concatenate(parts))


def g_u_samples():
    s = SG
    parts = [np.linspace(s[0], s[1], int((s[1] - s[0]) / 0.08) + 1), np.linspace(s[1], s[2], 7),
             np.linspace(s[2], s[3], int((s[3] - s[2]) / 0.10) + 1), np.linspace(s[3], s[4], 8),
             np.linspace(s[4], s[5], int((s[5] - s[4]) / 0.09) + 1)]
    return np.unique(np.concatenate(parts))


def g_t_samples():
    T = G_T
    parts = [np.linspace(T[0], T[1], 5), np.linspace(T[1], T[2], 3), np.linspace(T[2], T[3], 5), np.linspace(T[3], T[4], 3)]
    return np.unique(np.concatenate(parts))


def grid_from(us, ts):
    uu, tt = np.meshgrid(us, ts, indexing='ij')
    du = np.gradient(us)
    dt = np.gradient(ts)
    sp = np.minimum(du[:, None], dt[None, :]) * np.ones_like(uu)
    return np.stack([uu.ravel(), tt.ravel()], 1), sp.ravel()


def main(args):
    from frames import _wagon_build as WB
    WB.build(args)
