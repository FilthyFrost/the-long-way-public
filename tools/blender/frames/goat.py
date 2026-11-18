"""
ModCar frame 'goat' (山羊): a fictional 1980s Japanese short four-by-four - a square box on a ladder frame with
live axles front and rear, a flat bonnet, an upright windscreen, dark flared arches, a cream roof, a side-hinged
rear door with the spare wheel on it and a snorkel up the right A pillar. specs/vehicles/van_offroad_models.md
section 2 (the older game's src/game/vehicle/offroad.ts DIM: x + 0.075 here, the origin moved from the old centre
of gravity to the middle of the wheelbase).

    blender -b --factory-startup --python tools/blender/build.py -- frames/goat [--no-preview] [--quick]

Writes public/models/modcar/frames/goat.glb and src/core/modcar/data/mounts/goat.json. Same construction as
frames/pickup.py: exact SDF shells + proxy charts; two shells: L = the lower body (vertical sides from the sills up
to the waist, the front clip with the flat bonnet), G = the greenhouse (leaning in 4 degrees, the flat roof).
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
    # hubs at the wheel radius (no body drop: the body is modelled where it sits)
    wb=2.50, ax_f=1.25, ax_r=-1.25, hub_z=0.37, track_f=1.46, track_r=1.44, wheel_r=0.37, body_drop=0.0,
    # lower body: plan rounded rectangle at the side wall (small round corners)
    xf=2.08, xr=-1.905, hw=0.84, rho_f=0.075, rho_r=0.07,
    # wheel arches (big, for the travel of live axles): centre height and radius; the dark flares round them
    arch_z=0.40, arch_f=0.47, arch_r=0.47, flare_r=0.052, flare_out=0.92,
    bot_z=0.50, waist_z=1.18, bonnet_z=1.155,
    # greenhouse
    belt_z=1.18, gw=0.82, tumble_deg=4.0,
    ws_x=1.0083, ws_bow=0.0, ws_rake=80.5,            # windscreen at the belt; foot (1.015, 1.14), head (0.915, 1.74)
    rw_x=-1.885, roof_z=1.84, roof_crown_y=0.006,
    rho_a=0.035, rho_c=0.05,
    r_rail=0.07, r_header=0.045, r_rheader=0.06,
    drip_z=1.745,                                     # the drip rail along the roof side: cream above it
    # cuts
    gap=0.005, edge_r=0.0022,
    door_bot=0.585, fd_front=0.93, fd_rear=-0.045, rail_z=1.712, door_notch_r=0.54,
    hood_rear=1.08, hood_w=0.785,
    lamp_y=0.58, lamp_z=0.96, lamp_d=0.205, surround=0.13,
    grille_w=0.42, grille_z0=0.70, grille_z1=1.04,
    # the side-hinged rear door: opening half width, bottom and top; its window
    rd_y=0.63, rd_z0=0.585, rd_z1=1.70, rw_y=0.46, rw_z0=1.37, rw_z1=1.64,
    # the tail lamps' recesses beside it on the rear wall (the stock cluster stands in them on end, amber on top)
    tail_y0=0.646, tail_y1=0.764, tail_z0=0.72, tail_z1=1.00,
    # the big fixed rear side windows (side coordinates x, z); the door's window (its front edge follows the A pillar)
    rs_x0=-1.705, rs_x1=-0.225, rs_z0=1.26, rs_z1=1.68,
    dw_x0=-0.012, dw_z0=1.245, dw_z1=1.682, dw_band=0.03,
)
GAP = D['gap']
ER = D['edge_r']
DELTA = GAP / 2 + ER

# ============================================================================================ lower body (L)
_tumble = K.Spline([0.50, 0.53, 0.58, 0.66, 1.08, 1.18], [0.010, 0.005, 0.0015, 0.0, 0.0, 0.0015])
_front_lean = K.Spline([0.50, 0.56, 0.64, 0.80, 1.00, 1.16], [-0.020, -0.007, -0.0015, 0.0, -0.003, -0.008])
_rear_lean = K.Spline([0.50, 0.56, 0.64, 1.20], [0.012, 0.004, 0.0, 0.0])
_top_base = K.Spline([-2.0, 0.80, 0.95, 1.07, 1.30, 2.20], [1.18, 1.18, 1.176, 1.157, 1.155, 1.152], monotone=True)
_crown = K.Spline([-2.0, 0.95, 1.08, 1.40, 2.20], [0.0, 0.0, 0.006, 0.008, 0.007])
_bot = K.Spline([-2.0, -1.84, -1.72, 1.86, 1.98, 2.15], [0.525, 0.515, 0.50, 0.50, 0.512, 0.53])


def side_w(x, z):
    return D['hw'] - 0.002 * ((x - 0.1) / 1.9) ** 2 - _tumble(z)


def front_x(ay, z):
    return D['xf'] + 0.008 * (1 - (ay / D['hw']) ** 2) + _front_lean(z)


def rear_x(ay, z):
    return D['xr'] + _rear_lean(z)


def top_z(x, ay):
    return _top_base(x) + _crown(x) * (1 - (np.minimum(ay, 0.82) / 0.82) ** 2)


def r_top(x):
    """The top edge's fillet: a small one along the waist, rounder over the front clip and the nose."""
    return 0.012 + 0.024 * K.sstep(0.98, 1.12, x)


def r_bot(x):
    return 0.035 + 0.02 * K.sstep(1.86, 2.0, x) + 0.012 * K.sstep(-1.76, -1.86, x)


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
    return D['roof_z'] - D['roof_crown_y'] * (ay / 0.70) ** 2 + 0.0 * x


def r_roof(x):
    return D['r_rail'] + (D['r_header'] - D['r_rail']) * K.sstep(0.70, 0.85, x) + (D['r_rheader'] - D['r_rail']) * K.sstep(-1.70, -1.80, x)


def G_sdf(P):
    x, y, z = P[:, 0], P[:, 1], P[:, 2]
    ay = np.abs(y)
    a_side = (ay - g_side_w(z)) * math.cos(_TH)
    a_front = (x - ws_x(ay, z)) * math.sin(_WR)
    a_rear = rw_x(ay, z) - x
    a_roof = z - roof_z(x, ay)
    a_bot = 1.05 - z
    d = K.r_int(a_side, a_front, D['rho_a'])
    d = K.r_int(d, a_rear, D['rho_c'])
    d = K.r_int(d, a_roof, r_roof(x))
    d = np.maximum(d, a_bot)
    return d


# ============================================================================================ proxies
# lower body loft: t pieces (reference metres): underside, rocker fillet, wall, top fillet, top strip
L_T = np.cumsum([0.0, 0.05, 0.055, 0.62, 0.03, 0.04])
L_GUIDE = RRect(D['xf'], D['xr'], D['hw'], D['rho_f'], D['rho_r'])
LEAN = 0.0
UNDER = 0.05


def w_top(x):
    """Width of the loft's top strip past the top fillet: it reaches under the greenhouse's foot behind the A
    pillar (2 cm in from the side), across the wing tops a little ahead of it."""
    return 0.012 + 0.026 * K.sstep(1.04, 0.94, x)


def l_z0z1(x):
    return _bot(x) + r_bot(x), top_z(x, 0.83) - r_top(x)


def _l_section(u, t):
    x0, y0, nx, ny = L_GUIDE.point(u)
    zb = _bot(x0)
    zt = top_z(x0, 0.83)
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


# greenhouse proxy (stacked rounded rectangles; the rear wall is vertical): the wall up to G_ZW, the upper wall to
# the roof fillet, the fillet, a strip in under the roof
G_T = np.cumsum([0.0, 0.71, 0.04, 0.11, 0.05])
G_Z0 = 1.05
G_ZW = 1.76
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
    xa, ya, nxa, nya = g_contour(uf, 1.80)
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


def g_t_of_z(z):
    """G loft t of a height on its wall piece (linear there)."""
    return (np.asarray(z, float) - G_Z0) / (G_ZW - G_Z0) * G_T[1]


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
    """L loft u on the straight side for a given x."""
    return SL[2] + (D['xf'] - D['rho_f']) - np.asarray(x, float)


def u_of_ry(y):
    """L loft u on the rear wall for a half width y (inboard of the rear corner)."""
    return SL[4] + (D['hw'] - D['rho_r']) - np.asarray(y, float)


def t_of_z(x, z):
    """L loft t for height z at x (wall, rocker fillet; below the rocker it continues downwards)."""
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
    parts = [np.linspace(s[0], s[1], int((s[1] - s[0]) / 0.07) + 1),
             np.linspace(s[1], s[2], 8),
             np.linspace(s[2], s[3], int((s[3] - s[2]) / 0.09) + 1),
             np.linspace(s[3], s[4], 8),
             np.linspace(s[4], s[5], int((s[5] - s[4]) / 0.07) + 1)]
    return np.unique(np.concatenate(parts))


def l_t_samples():
    T = L_T
    parts = [np.linspace(T[0], T[1], 2), np.linspace(T[1], T[2], 5), np.linspace(T[2], T[3], 7),
             np.linspace(T[3], T[4], 5), np.linspace(T[4], T[5], 3)]
    return np.unique(np.concatenate(parts))


def g_u_samples():
    s = SG
    parts = [np.linspace(s[0], s[1], int((s[1] - s[0]) / 0.09) + 1), np.linspace(s[1], s[2], 5),
             np.linspace(s[2], s[3], int((s[3] - s[2]) / 0.10) + 1), np.linspace(s[3], s[4], 6),
             np.linspace(s[4], s[5], int((s[5] - s[4]) / 0.09) + 1)]
    return np.unique(np.concatenate(parts))


def g_t_samples():
    T = G_T
    parts = [np.linspace(T[0], T[1], 7), np.linspace(T[1], T[2], 2), np.linspace(T[2], T[3], 6), np.linspace(T[3], T[4], 3),
             [float(g_t_of_z(D['drip_z']))]]
    return np.unique(np.concatenate(parts))


def grid_from(us, ts):
    uu, tt = np.meshgrid(us, ts, indexing='ij')
    du = np.gradient(us)
    dt = np.gradient(ts)
    sp = np.minimum(du[:, None], dt[None, :]) * np.ones_like(uu)
    return np.stack([uu.ravel(), tt.ravel()], 1), sp.ravel()


def main(args):
    from frames import _goat_build as GB
    GB.build(args)
