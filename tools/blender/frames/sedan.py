"""
ModCar frame 'sedan' (方糖): a fictional 1970s three-box small saloon. docs/MODCAR.md section 2.2.

    blender -b --factory-startup --python tools/blender/build.py -- frames/sedan [--no-preview] [--quick]

Writes public/models/modcar/frames/sedan.glb and src/core/modcar/data/mounts/sedan.json; previews go to
D:/modcar-scratch/frames/sedan_*.png. Blender axes: X forward, Y left, Z up; origin on the ground under the
middle of the wheelbase. All dimensions are in the table D below; the modelling code only reads it.

Shell construction (see _kit.py): L = lower body, G = greenhouse, both exact SDFs. Charts: CL (lower body
loft, u = arc length round the plan from the front centre to the rear centre, t = arc length up the section
from the underside over the shoulder onto a top strip), CG (greenhouse: stacked plan rounded rectangles from
below the belt over the roof rail onto a roof strip), CT / CR (height-field charts for the tops). Only the
left half (Y >= 0) is meshed; the right half is the mirror image (the fuel flap is on the right).
"""
import math
import os
import sys

sys.dont_write_bytecode = True

import numpy as np  # noqa: E402

from frames import _kit as K  # noqa: E402
from lib import modcar as mc  # noqa: E402

PI = math.pi

# ============================================================================================ dimensions
D = dict(
    wb=2.42, ax_f=1.21, ax_r=-1.21, hub_z=0.285, track_f=1.35, track_r=1.32, wheel_r=0.285,
    # lower body: plan rounded rectangle at the bulge line
    xf=1.875, xr=-2.065, hw=0.81, rho_f=0.15, rho_r=0.12,
    arch_r=0.338,
    # greenhouse
    belt_z=0.93, gw=0.760, tumble_deg=15.0,
    ws_x=0.835, ws_bow=0.05, ws_rake=51.0,     # windscreen base centre x, plan bow at |y| = 0.70, rake from horizontal
    rw_x=-1.49, rw_bow=0.045, rw_rake=52.0,    # rear window
    roof_z=1.42, roof_crown_y=0.030, roof_crown_x=0.010, roof_xc=-0.34,
    rho_a=0.045, rho_c=0.065,                  # A / C pillar plan radii
    r_rail=0.028, r_header=0.036, r_rheader=0.055,
    # cuts
    gap=0.005, edge_r=0.0022,
    door_bot=0.268, fd_front=0.725, fd_rear=-0.288, rd_front=-0.298, rd_rear=-1.095,
    bp_front=-0.285, bp_rear=-0.345, rail_z=1.336, a_edge=0.026, cp_bot=-1.090, cp_top=-1.000,
    hood_rear=0.93, hood_w=0.752, hood_front_in=0.058, trunk_front=-1.535, trunk_w=0.750, trunk_rear_in=0.050,
    lamp_y=0.585, lamp_z=0.655, lamp_d=0.205,
    grille_w=0.452, grille_z0=0.535, grille_z1=0.785,
)
GAP = D['gap']
ER = D['edge_r']
DELTA = GAP / 2 + ER   # cut line -> panel surface boundary (the rolled edge reaches back to gap/2)


# ============================================================================================ exact surfaces
# lower body ---------------------------------------------------------------------------------------------
_tumble = K.Spline([0.15, 0.22, 0.32, 0.45, 0.60, 0.75, 0.86, 0.95], [0.030, 0.018, 0.006, 0.001, 0.0, 0.004, 0.011, 0.018])
_front_lean = K.Spline([0.15, 0.26, 0.36, 0.48, 0.62, 0.76, 0.88], [-0.060, -0.028, -0.006, 0.0, -0.002, -0.008, -0.017])
_rear_lean = K.Spline([0.20, 0.32, 0.42, 0.56, 0.74, 0.92], [0.040, 0.016, 0.004, 0.0, 0.002, 0.008])
_top_base = K.Spline([-2.15, -1.85, -1.5, -1.0, -0.5, 0.0, 0.5, 0.85, 1.0, 1.5, 1.95],
                     [0.917, 0.921, 0.921, 0.918, 0.914, 0.910, 0.905, 0.897, 0.889, 0.869, 0.852])
_crown = K.Spline([-2.15, -1.62, -1.45, 0.78, 0.92, 1.30, 1.95], [0.009, 0.010, 0.0, 0.0, 0.012, 0.014, 0.010])
_bot = K.Spline([-2.2, -2.0, -1.8, -1.6, 1.55, 1.75, 2.0], [0.275, 0.262, 0.238, 0.215, 0.215, 0.232, 0.250])


def side_w(x, z):
    """Half width of the lower body side at (x, z)."""
    return D['hw'] - 0.008 * ((x + 0.10) / 1.95) ** 2 - _tumble(z)


def front_x(ay, z):
    return D['xf'] + 0.022 * (1 - (ay / D['hw']) ** 2) + _front_lean(z)


def rear_x(ay, z):
    return D['xr'] - 0.018 * (1 - (ay / D['hw']) ** 2) + _rear_lean(z)


def top_z(x, ay):
    return _top_base(x) + _crown(x) * (1 - (np.minimum(ay, 0.8) / 0.80) ** 2)


def r_top(x):
    return 0.018 + 0.017 * K.sstep(1.70, 1.86, x) + 0.012 * K.sstep(-1.88, -2.03, x)


def r_bot(x):
    return 0.036 + 0.03 * K.sstep(1.55, 1.75, x) + 0.03 * K.sstep(-1.65, -1.85, x)


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
    return D['roof_z'] - D['roof_crown_y'] * (ay / 0.66) ** 2 - D['roof_crown_x'] * ((x - D['roof_xc']) / 0.8) ** 2


def r_roof(x):
    return D['r_rail'] + (D['r_header'] - D['r_rail']) * K.sstep(0.22, 0.44, x) + (D['r_rheader'] - D['r_rail']) * K.sstep(-0.85, -1.12, x)


def G_sdf(P):
    x, y, z = P[:, 0], P[:, 1], P[:, 2]
    ay = np.abs(y)
    a_side = (ay - g_side_w(z)) * math.cos(_TH)
    a_front = (x - ws_x(ay, z)) * math.sin(_WR)
    a_rear = (rw_x(ay, z) - x) * math.sin(_RR)
    a_roof = z - roof_z(x, ay)
    a_bot = 0.84 - z
    d = K.r_int(a_side, a_front, D['rho_a'])
    d = K.r_int(d, a_rear, D['rho_c'])
    d = K.r_int(d, a_roof, r_roof(x))
    d = np.maximum(d, a_bot)
    return d


# ============================================================================================ proxies (charts)
class RRect:
    """Half rounded rectangle in plan (front centre -> front corner -> side -> rear corner -> rear centre)
    parameterised by arc length u."""

    def __init__(self, xf, xr, w, rf, rr):
        self.xf, self.xr, self.w, self.rf, self.rr = xf, xr, w, rf, rr
        self.seg = np.cumsum([0.0, w - rf, rf * PI / 2, (xf - rf) - (xr + rr), rr * PI / 2, w - rr])
        self.length = self.seg[-1]

    def point(self, u, off=0.0):
        u = np.asarray(u, float)
        off = np.broadcast_to(np.asarray(off, float), u.shape)
        s = self.seg
        x = np.empty_like(u)
        y = np.empty_like(u)
        nx = np.empty_like(u)
        ny = np.empty_like(u)
        m = u < s[1]
        x[m] = self.xf + off[m]
        y[m] = u[m]
        nx[m], ny[m] = 1.0, 0.0
        m = (u >= s[1]) & (u < s[2])
        a = (u[m] - s[1]) / self.rf
        cx, cy = self.xf - self.rf, self.w - self.rf
        x[m] = cx + (self.rf + off[m]) * np.cos(a)
        y[m] = cy + (self.rf + off[m]) * np.sin(a)
        nx[m], ny[m] = np.cos(a), np.sin(a)
        m = (u >= s[2]) & (u < s[3])
        x[m] = (self.xf - self.rf) - (u[m] - s[2])
        y[m] = self.w + off[m]
        nx[m], ny[m] = 0.0, 1.0
        m = (u >= s[3]) & (u < s[4])
        a = PI / 2 + (u[m] - s[3]) / self.rr
        cx, cy = self.xr + self.rr, self.w - self.rr
        x[m] = cx + (self.rr + off[m]) * np.cos(a)
        y[m] = cy + (self.rr + off[m]) * np.sin(a)
        nx[m], ny[m] = np.cos(a), np.sin(a)
        m = u >= s[4]
        x[m] = self.xr - off[m]
        y[m] = (self.w - self.rr) - (u[m] - s[4])
        nx[m], ny[m] = -1.0, 0.0
        return x, y, nx, ny


# lower body proxy: t pieces (reference metres): underside, rocker fillet, wall, shoulder fillet, top strip
L_T = np.cumsum([0.0, 0.06, 0.055, 0.62, 0.03, 0.03])
L_GUIDE = RRect(D['xf'], D['xr'], D['hw'], D['rho_f'], D['rho_r'])
LEAN = 0.016
UNDER = 0.06


def w_top(x):
    """Width of the loft's top strip past the shoulder fillet: wide along the cabin (reaches the belt)."""
    return 0.012 + 0.018 * K.sstep(0.86, 0.76, x) * K.sstep(-1.50, -1.40, x)


def l_z0z1(x):
    """Bottom and top heights of the straight wall part of the lower body proxy at x."""
    return _bot(x) + r_bot(x), top_z(x, 0.79) - r_top(x)


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


# greenhouse proxy: stacked rounded rectangles. t pieces: wall (z 0.84 -> 1.28), upper wall (1.28 -> fillet
# start), roof fillet, roof strip
G_T = np.cumsum([0.0, 0.44, 0.10, 0.06, 0.05])
G_Z0 = 0.84
G_ZW = 1.28
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
    """Wall angle from vertical round the contour (windscreen / side / rear window), blended in the corners."""
    return np.where(nx > 0, PHI_F * nx ** 2 + PHI_S * ny ** 2, PHI_R * nx ** 2 + PHI_S * ny ** 2)


def G_proxy(u, t):
    u, t = np.broadcast_arrays(np.asarray(u, float), np.asarray(t, float))
    u = u.ravel()
    t = np.clip(t.ravel(), G_T[0] - 0.2, G_T[-1] + 0.2)
    uf = np.clip(u / G_GUIDE.length, 0.0, 1.0)
    t1, t2, t3, t4 = G_T[1], G_T[2], G_T[3], G_T[4]
    # fillet start height per point (from the roof height and wall angle there)
    xa, ya, nxa, nya = g_contour(uf, 1.36)
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
    t = L_T[2] + (z - z0) / (z1 - z0) * (L_T[3] - L_T[2])
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
    parts = [np.linspace(s[0], s[1], int((s[1] - s[0]) / 0.05) + 1),
             np.linspace(s[1], s[2], int((s[2] - s[1]) / 0.016) + 1),
             np.linspace(s[2], s[3], int((s[3] - s[2]) / 0.075) + 1),
             np.linspace(s[3], s[4], int((s[4] - s[3]) / 0.016) + 1),
             np.linspace(s[4], s[5], int((s[5] - s[4]) / 0.05) + 1)]
    return np.unique(np.concatenate(parts))


def l_t_samples():
    T = L_T
    parts = [np.linspace(T[0], T[1], 3), np.linspace(T[1], T[2], 5), np.linspace(T[2], T[3], 8),
             np.linspace(T[3], T[4], 7), np.linspace(T[4], T[5], 3)]
    return np.unique(np.concatenate(parts))


def g_u_samples():
    s = SG
    parts = [np.linspace(s[0], s[1], int((s[1] - s[0]) / 0.08) + 1), np.linspace(s[1], s[2], 7),
             np.linspace(s[2], s[3], int((s[3] - s[2]) / 0.08) + 1), np.linspace(s[3], s[4], 9),
             np.linspace(s[4], s[5], int((s[5] - s[4]) / 0.08) + 1)]
    return np.unique(np.concatenate(parts))


def g_t_samples():
    T = G_T
    parts = [np.linspace(T[0], T[1], 6), np.linspace(T[1], T[2], 3), np.linspace(T[2], T[3], 6), np.linspace(T[3], T[4], 3)]
    return np.unique(np.concatenate(parts))


def grid_from(us, ts):
    uu, tt = np.meshgrid(us, ts, indexing='ij')
    du = np.gradient(us)
    dt = np.gradient(ts)
    sp = np.minimum(du[:, None], dt[None, :]) * np.ones_like(uu)
    return np.stack([uu.ravel(), tt.ravel()], 1), sp.ravel()


def main(args):
    from frames import _sedan_build as SB
    SB.build(args)
