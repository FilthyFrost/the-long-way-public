"""
ModCar frame 'pickup' (骡子): a fictional 1980s Japanese compact pickup with a long bed and a drop tailgate.
docs/MODCAR.md section 2.2.

    blender -b --factory-startup --python tools/blender/build.py -- frames/pickup [--no-preview] [--quick]

Writes public/models/modcar/frames/pickup.glb and src/core/modcar/data/mounts/pickup.json. Same construction as
frames/sedan.py: exact SDF shells + proxy charts; three shells here: L = cab and front clip, G = cab greenhouse,
B = the cargo bed (outer skin, top rails, cavity with a ribbed floor and wheel tubs carved out).
Blender axes: X forward, Y left, Z up; origin on the ground under the middle of the wheelbase.
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
    wb=2.80, ax_f=1.40, ax_r=-1.40, hub_z=0.34, track_f=1.40, track_r=1.38, wheel_r=0.34,
    # cab and front clip: plan rounded rectangle at the bulge line
    xf=2.125, xr=-0.255, hw=0.835, rho_f=0.11, rho_r=0.05,
    arch_f=0.405, arch_r=0.412,
    # greenhouse
    belt_z=1.055, gw=0.792, tumble_deg=8.0,
    ws_x=0.958, ws_bow=0.025, ws_rake=54.0,
    rw_x=-0.236, rw_bow=0.0, rw_rake=90.0,
    roof_z=1.62, roof_crown_y=0.022, roof_crown_x=0.006, roof_xc=0.18,
    rho_a=0.035, rho_c=0.045,
    r_rail=0.022, r_header=0.030, r_rheader=0.035,
    # cuts
    gap=0.005, edge_r=0.0022,
    door_bot=0.465, fd_front=0.905, fd_rear=-0.150,
    rail_z=1.548, cp_bot=-0.150, cp_top=-0.130,
    hood_rear=1.035, hood_w=0.762,
    lamp_y=0.615, lamp_z=0.805, lamp_w=0.205, lamp_h=0.150,
    grille_w=0.478, grille_z0=0.735, grille_z1=0.875,
    # bed
    bed_xf=-0.315, bed_xr=-2.335, bed_hw=0.832, bed_z0=0.625, bed_z1=1.035, bed_floor=0.715, bed_in=0.745,
    tg_th=0.055,
)
GAP = D['gap']
ER = D['edge_r']
DELTA = GAP / 2 + ER

# ============================================================================================ cab lower body (L)
_tumble = K.Spline([0.35, 0.45, 0.60, 0.75, 0.90, 1.00, 1.10], [0.018, 0.010, 0.002, 0.0, 0.003, 0.008, 0.014])
_front_lean = K.Spline([0.35, 0.45, 0.55, 0.70, 0.85, 1.00], [-0.050, -0.022, -0.004, 0.0, -0.004, -0.012])
_rear_lean = K.Spline([0.35, 0.45, 0.60, 1.10], [0.020, 0.006, 0.0, 0.0])
_top_base = K.Spline([-0.40, -0.10, 0.40, 0.95, 1.10, 1.60, 2.20], [1.052, 1.050, 1.046, 1.040, 1.042, 1.034, 1.014])
_crown = K.Spline([-0.40, 0.80, 0.98, 1.10, 1.60, 2.20], [0.0, 0.0, 0.0, 0.008, 0.010, 0.008])
_bot = K.Spline([-0.40, 1.80, 2.00, 2.25], [0.430, 0.430, 0.445, 0.46])


def side_w(x, z):
    return D['hw'] - 0.004 * ((x - 0.9) / 1.3) ** 2 - _tumble(z)


def front_x(ay, z):
    return D['xf'] + 0.012 * (1 - (ay / D['hw']) ** 2) + _front_lean(z)


def rear_x(ay, z):
    return D['xr'] + _rear_lean(z)


def top_z(x, ay):
    return _top_base(x) + _crown(x) * (1 - (np.minimum(ay, 0.82) / 0.82) ** 2)


def r_top(x):
    return 0.016 + 0.014 * K.sstep(1.98, 2.10, x)


def r_bot(x):
    return 0.03 + 0.02 * K.sstep(1.85, 2.02, x)


def L_sdf(P):
    x, y, z = P[:, 0], P[:, 1], P[:, 2]
    ay = np.abs(y)
    a_side = ay - side_w(x, z)
    a_front = x - front_x(ay, z)
    a_rear = rear_x(ay, z) - x
    a_top = z - top_z(x, ay)
    a_bot = _bot(x) - z
    d = K.r_int(a_side, a_front, D['rho_f'])
    d = K.r_int(d, a_rear, D['rho_r'])
    d = K.r_int(d, a_top, r_top(x))
    d = K.r_int(d, a_bot, r_bot(x))
    return d


# ============================================================================================ greenhouse (G)
_TH = math.radians(D['tumble_deg'])
_WR = math.radians(D['ws_rake'])
_RR = math.radians(D['rw_rake'])
PHI_F = math.atan(1.0 / math.tan(_WR))
PHI_S = _TH
PHI_R = 0.0


def g_side_w(z):
    return D['gw'] - (z - D['belt_z']) * math.tan(_TH)


def ws_x(ay, z):
    return D['ws_x'] - D['ws_bow'] * (ay / 0.72) ** 2 - (z - D['belt_z']) / math.tan(_WR)


def rw_x(ay, z):
    return D['rw_x'] + 0.0 * ay


def roof_z(x, ay):
    return D['roof_z'] - D['roof_crown_y'] * (ay / 0.70) ** 2 - D['roof_crown_x'] * ((x - D['roof_xc']) / 0.5) ** 2


def r_roof(x):
    return D['r_rail'] + (D['r_header'] - D['r_rail']) * K.sstep(0.40, 0.55, x) + (D['r_rheader'] - D['r_rail']) * K.sstep(-0.10, -0.20, x)


def G_sdf(P):
    x, y, z = P[:, 0], P[:, 1], P[:, 2]
    ay = np.abs(y)
    a_side = (ay - g_side_w(z)) * math.cos(_TH)
    a_front = (x - ws_x(ay, z)) * math.sin(_WR)
    a_rear = rw_x(ay, z) - x
    a_roof = z - roof_z(x, ay)
    a_bot = 0.96 - z
    d = K.r_int(a_side, a_front, D['rho_a'])
    d = K.r_int(d, a_rear, D['rho_c'])
    d = K.r_int(d, a_roof, r_roof(x))
    d = np.maximum(d, a_bot)
    return d


# ============================================================================================ bed (B)
def bed_outer(P):
    x, y, z = P[:, 0], P[:, 1], P[:, 2]
    ay = np.abs(y)
    a_side = ay - (D['bed_hw'] - 0.010 * K.sstep(0.80, 0.64, z))
    a_front = x - D['bed_xf']
    a_rear = D['bed_xr'] - x
    a_top = z - D['bed_z1']
    a_bot = D['bed_z0'] - z
    d = K.r_int(a_side, a_front, 0.04)
    d = K.r_int(d, a_rear, 0.015)
    d = K.r_int(d, a_top, 0.010)
    d = K.r_int(d, a_bot, 0.02)
    return d


def bed_rib(y):
    """Floor ribs: low rounded corrugations across the bed floor (period 0.11 m)."""
    ph = (np.abs(y) % 0.11) / 0.11
    return 0.006 * np.clip(1.0 - (np.abs(ph - 0.5) / 0.22) ** 2, 0, 1)


def bed_cavity(P):
    """The load space: open at the top and through the tailgate opening."""
    x, y, z = P[:, 0], P[:, 1], P[:, 2]
    ay = np.abs(y)
    a_side = ay - D['bed_in']
    a_front = x - (D['bed_xf'] - 0.05)
    a_rear = (D['bed_xr'] - 0.30) - x
    a_floor = D['bed_floor'] - z
    d = K.r_int(a_side, a_front, 0.012)
    d = np.maximum(d, a_rear)
    d = K.r_int(d, a_floor, 0.012)
    return d


def B_sdf(P):
    return K.r_sub(bed_outer(P), bed_cavity(P), 0.006)


# ============================================================================================ proxies
L_T = np.cumsum([0.0, 0.05, 0.047, 0.54, 0.026, 0.03])
L_GUIDE = RRect(D['xf'], D['xr'], D['hw'], D['rho_f'], D['rho_r'])
LEAN = 0.012
UNDER = 0.05


def w_top(x):
    return 0.010 + 0.022 * K.sstep(1.02, 0.92, x)


def l_z0z1(x):
    return _bot(x) + r_bot(x), top_z(x, 0.81) - r_top(x)


def _l_section(u, t):
    x0, y0, nx, ny = L_GUIDE.point(u)
    zb = _bot(x0)
    zt = top_z(x0, 0.81)
    rb = r_bot(x0)
    rs = r_top(x0)
    wt = w_top(x0)
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
    m = (t >= L_T[2]) & (t < L_T[3])
    f = (t[m] - L_T[2]) / (L_T[3] - L_T[2])
    z0 = zb[m] + rb[m]
    z1 = zt[m] - rs[m]
    n[m] = -LEAN * f
    z[m] = z0 + (z1 - z0) * f
    m = (t >= L_T[3]) & (t < L_T[4])
    f = (t[m] - L_T[3]) / (L_T[4] - L_T[3])
    a = f * PI / 2
    n[m] = -LEAN - rs[m] + rs[m] * np.cos(a)
    z[m] = zt[m] - rs[m] + rs[m] * np.sin(a)
    m = t >= L_T[4]
    f = (t[m] - L_T[4]) / (L_T[5] - L_T[4])
    n[m] = -LEAN - rs[m] - wt[m] * f
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


# greenhouse proxy (stacked rounded rectangles; the rear wall is vertical)
G_T = np.cumsum([0.0, 0.50, 0.10, 0.05, 0.05])
G_Z0 = 0.96
G_ZW = 1.46
G_GUIDE = RRect(ws_x(0.0, D['belt_z']), rw_x(0.0, D['belt_z']), g_side_w(D['belt_z']), D['rho_a'], D['rho_c'])
_GS0 = G_GUIDE.seg / G_GUIDE.length


def g_contour(uf, z):
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
    return np.where(nx > 0, PHI_F * nx ** 2 + PHI_S * ny ** 2, PHI_R * nx ** 2 + PHI_S * ny ** 2)


def G_proxy(u, t):
    u, t = np.broadcast_arrays(np.asarray(u, float), np.asarray(t, float))
    u = u.ravel()
    t = np.clip(t.ravel(), G_T[0] - 0.2, G_T[-1] + 0.2)
    uf = np.clip(u / G_GUIDE.length, 0.0, 1.0)
    t1, t2, t3, t4 = G_T[1], G_T[2], G_T[3], G_T[4]
    xa, ya, nxa, nya = g_contour(uf, 1.55)
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


# bed outer skin proxy: a loft round the bed's plan (front centre -> side -> rear centre) from the bottom edge
# over the top edge onto the top rail (t pieces: underside, bottom fillet, wall, top fillet, rail top)
BED_T = np.cumsum([0.0, 0.03, 0.03, 0.37, 0.016, 0.07])
BED_GUIDE = RRect(D['bed_xf'], D['bed_xr'], D['bed_hw'], 0.04, 0.015)


def _bed_section(u, t):
    zb, zt = D['bed_z0'], D['bed_z1']
    rb, rs = 0.02, 0.010
    n = np.empty_like(u)
    z = np.empty_like(u)
    m = t < BED_T[1]
    f = (t[m] - BED_T[0]) / (BED_T[1] - BED_T[0])
    n[m] = -rb - 0.03 * (1 - f)
    z[m] = zb
    m = (t >= BED_T[1]) & (t < BED_T[2])
    f = (t[m] - BED_T[1]) / (BED_T[2] - BED_T[1])
    a = -PI / 2 + f * PI / 2
    n[m] = -rb + rb * np.cos(a)
    z[m] = zb + rb + rb * np.sin(a)
    m = (t >= BED_T[2]) & (t < BED_T[3])
    f = (t[m] - BED_T[2]) / (BED_T[3] - BED_T[2])
    n[m] = 0.0
    z[m] = (zb + rb) + (zt - rs - zb - rb) * f
    m = (t >= BED_T[3]) & (t < BED_T[4])
    f = (t[m] - BED_T[3]) / (BED_T[4] - BED_T[3])
    a = f * PI / 2
    n[m] = -rs + rs * np.cos(a)
    z[m] = zt - rs + rs * np.sin(a)
    m = t >= BED_T[4]
    f = (t[m] - BED_T[4]) / (BED_T[5] - BED_T[4])
    n[m] = -rs - 0.07 * f
    z[m] = zt
    return n, z


def BED_proxy(u, t):
    u, t = np.broadcast_arrays(np.asarray(u, float), np.asarray(t, float))
    u = u.ravel()
    t = np.clip(t.ravel(), BED_T[0] - 0.1, BED_T[-1] + 0.1)
    uc = np.clip(u, 0.0, BED_GUIDE.length - 1e-9)
    n, z = _bed_section(uc, t)
    x, y, nx, ny = BED_GUIDE.point(uc, n)
    lo = u < 0
    y[lo] = u[lo]
    hi = u > BED_GUIDE.length
    y[hi] = -(u[hi] - BED_GUIDE.length)
    return np.stack([x, y, z], 1)


CL = K.Chart(L_proxy, L_sdf, (0.0, L_GUIDE.length), (L_T[0], L_T[-1]))
CG = K.Chart(G_proxy, G_sdf, (0.0, G_GUIDE.length), (G_T[0], G_T[-1]))
CB = K.Chart(BED_proxy, B_sdf, (0.0, BED_GUIDE.length), (BED_T[0], BED_T[-1]))
CT = K.TopChart(L_sdf)
CR = K.TopChart(G_sdf)
CBT = K.TopChart(B_sdf, z_from=1.3)
SIDE_L = K.PlaneChart(L_sdf, axis=1, sign=1.0)
SIDE_G = K.PlaneChart(G_sdf, axis=1, sign=1.0)
SIDE_B = K.PlaneChart(B_sdf, axis=1, sign=1.0)
FRONT_L = K.PlaneChart(L_sdf, axis=0, sign=1.0)
REAR_B = K.PlaneChart(B_sdf, axis=0, sign=-1.0)
SL = L_GUIDE.seg
SG = G_GUIDE.seg
SB = BED_GUIDE.seg


def u_of_x(x):
    return SL[2] + (D['xf'] - D['rho_f']) - np.asarray(x, float)


def ub_of_x(x):
    return SB[2] + (D['bed_xf'] - 0.04) - np.asarray(x, float)


def t_of_z(x, z):
    x = np.asarray(x, float)
    z = np.asarray(z, float)
    z0, z1 = l_z0z1(x)
    t = L_T[2] + (z - z0) / (z1 - z0) * (L_T[3] - L_T[2])
    zb = _bot(x)
    rb = r_bot(x)
    a = np.arcsin(np.clip((z - zb - rb) / rb, -1, 0))
    tf = L_T[1] + (a + PI / 2) / (PI / 2) * (L_T[2] - L_T[1])
    t = np.where(z < z0, tf, t)
    t = np.where(z < zb, L_T[1] - (zb - z), t)
    return t


def tb_of_z(z):
    """Bed loft t for height z on the wall (rocker and below continue downwards)."""
    z = np.asarray(z, float)
    zb, zt, rb, rs = D['bed_z0'], D['bed_z1'], 0.02, 0.010
    t = BED_T[2] + (z - zb - rb) / (zt - rs - zb - rb) * (BED_T[3] - BED_T[2])
    a = np.arcsin(np.clip((z - zb - rb) / rb, -1, 0))
    tf = BED_T[1] + (a + PI / 2) / (PI / 2) * (BED_T[2] - BED_T[1])
    t = np.where(z < zb + rb, tf, t)
    t = np.where(z < zb, BED_T[1] - (zb - z), t)
    return t


# ============================================================================================ sampling
def l_u_samples():
    s = SL
    parts = [np.linspace(s[0], s[1], int((s[1] - s[0]) / 0.06) + 1),
             np.linspace(s[1], s[2], int((s[2] - s[1]) / 0.016) + 1),
             np.linspace(s[2], s[3], int((s[3] - s[2]) / 0.075) + 1),
             np.linspace(s[3], s[4], int((s[4] - s[3]) / 0.014) + 1),
             np.linspace(s[4], s[5], int((s[5] - s[4]) / 0.06) + 1)]
    return np.unique(np.concatenate(parts))


def l_t_samples():
    T = L_T
    parts = [np.linspace(T[0], T[1], 3), np.linspace(T[1], T[2], 5), np.linspace(T[2], T[3], 8),
             np.linspace(T[3], T[4], 7), np.linspace(T[4], T[5], 3)]
    return np.unique(np.concatenate(parts))


def g_u_samples():
    s = SG
    parts = [np.linspace(s[0], s[1], int((s[1] - s[0]) / 0.08) + 1), np.linspace(s[1], s[2], 7),
             np.linspace(s[2], s[3], int((s[3] - s[2]) / 0.08) + 1), np.linspace(s[3], s[4], 8),
             np.linspace(s[4], s[5], int((s[5] - s[4]) / 0.08) + 1)]
    return np.unique(np.concatenate(parts))


def g_t_samples():
    T = G_T
    parts = [np.linspace(T[0], T[1], 6), np.linspace(T[1], T[2], 3), np.linspace(T[2], T[3], 6), np.linspace(T[3], T[4], 3)]
    return np.unique(np.concatenate(parts))


def b_u_samples():
    s = SB
    parts = [np.linspace(s[0], s[1], int((s[1] - s[0]) / 0.07) + 1), np.linspace(s[1], s[2], 6),
             np.linspace(s[2], s[3], int((s[3] - s[2]) / 0.08) + 1), np.linspace(s[3], s[4], 6),
             np.linspace(s[4], s[5], int((s[5] - s[4]) / 0.07) + 1)]
    return np.unique(np.concatenate(parts))


def b_t_samples():
    T = BED_T
    parts = [np.linspace(T[0], T[1], 2), np.linspace(T[1], T[2], 4), np.linspace(T[2], T[3], 6),
             np.linspace(T[3], T[4], 5), np.linspace(T[4], T[5], 3)]
    return np.unique(np.concatenate(parts))


def grid_from(us, ts):
    uu, tt = np.meshgrid(us, ts, indexing='ij')
    du = np.gradient(us)
    dt = np.gradient(ts)
    sp = np.minimum(du[:, None], dt[None, :]) * np.ones_like(uu)
    return np.stack([uu.ravel(), tt.ravel()], 1), sp.ravel()


def main(args):
    from frames import _pickup_build as PB
    PB.build(args)
