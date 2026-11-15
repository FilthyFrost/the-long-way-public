"""
ModCar frame 'rv' (鲸鱼): a fictional Class C motorhome - a van cab with a short hood, an over-cab bunk
("alcove") and a living box - in the spirit of the game's old RV (rounded, cream with a teal waist band).
docs/MODCAR.md section 2.2; specs/vehicles/rv_model.md.

    blender -b --factory-startup --python tools/blender/build.py -- frames/rv [--no-preview] [--quick]

Writes public/models/modcar/frames/rv.glb and src/core/modcar/data/mounts/rv.json.
Shells: L = cab lower body and front clip, G = cab greenhouse (its roof disappears into the alcove), B = the
living module: a side profile (box + alcove with a round nose; the alcove's underside blends into the box front
with a concave fillet) extruded across the width with rounded side edges. The cab is open at the back above the
box floor (walk-through); the box's front wall carries the opening. Blender axes: X forward, Y left, Z up;
origin on the ground under the middle of the wheelbase.
"""
import math
import sys

sys.dont_write_bytecode = True

import numpy as np  # noqa: E402

from frames import _kit as K  # noqa: E402
from frames.sedan import RRect  # noqa: E402

PI = math.pi

D = dict(
    wb=3.80, ax_f=1.90, ax_r=-1.90, hub_z=0.39, track_f=1.75, track_r=1.70, wheel_r=0.39,
    # cab lower body (its rear is the box's front wall)
    xf=2.835, xr=0.95, hw=0.99, rho_f=0.14, rho_r=0.006,
    arch_f=0.465, arch_r=0.47,
    # cab greenhouse
    belt_z=1.38, gw=0.952, tumble_deg=6.0,
    ws_x=1.935, ws_bow=0.04, ws_rake=62.0, ws_top=2.075,
    rw_x=0.95, roof_z=2.40, roof_crown_y=0.0,
    rho_a=0.045, rho_c=0.006, r_rail=0.03, r_header=0.035, r_rheader=0.03,
    gap=0.005, edge_r=0.0022,
    door_bot=0.635, fd_front=1.800, fd_rear=1.015, door_notch_r=0.50,
    rail_z=2.06, cp_bot=1.015, cp_top=1.015,
    hood_rear=2.03, hood_w=0.80,
    lamp_y=0.665, lamp_z=1.03, lamp_d=0.215,
    grille_w=0.47, grille_z0=0.88, grille_z1=1.17,
    # living module (side profile, metres)
    bx_r=-3.92, bx_f=0.95, bz0=0.50, bz1=3.05, bw=1.125,
    al_f=2.30, al_z0=2.14, nose_rt=0.40, nose_rb=0.50, r_box_fb=0.16, r_box_rb=0.30, r_box_rt=0.42, r_under=0.14,
    r_edge=0.13,
    box_floor=0.86, skirt_top=0.82, seam_x=-0.60,
)
GAP = D['gap']
ER = D['edge_r']
DELTA = GAP / 2 + ER

# ============================================================================================ cab (L)
_tumble = K.Spline([0.55, 0.65, 0.80, 1.00, 1.20, 1.36, 1.45], [0.012, 0.007, 0.002, 0.0, 0.003, 0.008, 0.012])
_front_lean = K.Spline([0.55, 0.65, 0.78, 0.95, 1.12, 1.22, 1.30], [-0.040, -0.018, -0.004, 0.0, -0.006, -0.016, -0.030])
_rear_lean = K.Spline([0.5, 1.5], [0.0, 0.0])
_top_base = K.Spline([0.80, 1.20, 1.80, 1.98, 2.20, 2.60, 2.95], [1.381, 1.380, 1.372, 1.356, 1.336, 1.312, 1.288])
_crown = K.Spline([0.80, 1.88, 2.0, 2.2, 2.6, 2.95], [0.0, 0.0, 0.0, 0.010, 0.012, 0.010])
_bot = K.Spline([0.80, 2.40, 2.65, 2.95], [0.60, 0.60, 0.615, 0.635])


def side_w(x, z):
    return D['hw'] - 0.003 * ((x - 1.9) / 1.0) ** 2 - _tumble(z)


def front_x(ay, z):
    return D['xf'] + 0.012 * (1 - (ay / D['hw']) ** 2) + _front_lean(z)


def rear_x(ay, z):
    return D['xr'] + _rear_lean(z)


def top_z(x, ay):
    return _top_base(x) + _crown(x) * (1 - (np.minimum(ay, 0.97) / 0.97) ** 2)


def r_top(x):
    return 0.02 + 0.04 * K.sstep(2.66, 2.80, x)


def r_bot(x):
    return 0.03 + 0.02 * K.sstep(2.55, 2.72, x)


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


# ============================================================================================ cab greenhouse (G)
_TH = math.radians(D['tumble_deg'])
_WR = math.radians(D['ws_rake'])
PHI_F = math.atan(1.0 / math.tan(_WR))
PHI_S = _TH
PHI_R = 0.0


def g_side_w(z):
    return D['gw'] - (z - D['belt_z']) * math.tan(_TH)


def ws_x(ay, z):
    return D['ws_x'] - D['ws_bow'] * (ay / 0.85) ** 2 - (z - D['belt_z']) / math.tan(_WR)


def rw_x(ay, z):
    return D['rw_x'] + 0.0 * ay


def roof_z(x, ay):
    return D['roof_z'] - D['roof_crown_y'] * (ay / 0.85) ** 2


def r_roof(x):
    return D['r_rail'] + 0.0 * x


def G_sdf(P):
    x, y, z = P[:, 0], P[:, 1], P[:, 2]
    ay = np.abs(y)
    a_side = (ay - g_side_w(z)) * math.cos(_TH)
    a_front = (x - ws_x(ay, z)) * math.sin(_WR)
    a_rear = rw_x(ay, z) - x
    a_roof = z - roof_z(x, ay)
    a_bot = 1.30 - z
    d = K.r_int(a_side, a_front, D['rho_a'])
    d = K.r_int(d, a_rear, D['rho_c'])
    d = K.r_int(d, a_roof, r_roof(x))
    d = np.maximum(d, a_bot)
    return d


# ============================================================================================ living module (B)
def rrect4(px, pz, x0, x1, z0, z1, r_fb, r_ft, r_rb, r_rt):
    """Exact 2D SDF of a rectangle [x0, x1] x [z0, z1] with its own radius per corner (f = +x, r = -x,
    t = +z, b = -z)."""
    cx, cz = 0.5 * (x0 + x1), 0.5 * (z0 + z1)
    hx, hz = 0.5 * (x1 - x0), 0.5 * (z1 - z0)
    qx0, qz0 = px - cx, pz - cz
    r = np.where(qx0 > 0, np.where(qz0 > 0, r_ft, r_fb), np.where(qz0 > 0, r_rt, r_rb))
    qx = np.abs(qx0) - hx + r
    qz = np.abs(qz0) - hz + r
    return np.hypot(np.maximum(qx, 0), np.maximum(qz, 0)) + np.minimum(np.maximum(qx, qz), 0) - r


def profile_sdf(x, z):
    """2D SDF of the side profile: the box (a big rounded 'whale back' at the rear top, a tucked rear bottom),
    the alcove with an almost semicircular nose, and a concave fillet where the alcove's underside meets the
    box front."""
    box = rrect4(x, z, D['bx_r'], D['bx_f'], D['bz0'], D['bz1'], D['r_box_fb'], 0.0, D['r_box_rb'], D['r_box_rt'])
    al = rrect4(x, z, D['bx_f'] - 0.30, D['al_f'], D['al_z0'], D['bz1'], D['nose_rb'], D['nose_rt'], 0.0, 0.0)
    d = np.minimum(box, al)
    r = D['r_under']
    cx, cz = D['bx_f'] + r, D['al_z0'] - r
    zone = (x >= D['bx_f']) & (x <= cx) & (z >= cz) & (z <= D['al_z0'])
    return np.where(zone, r - np.hypot(x - cx, z - cz), d)


def b_half_w(z):
    """Half width of the living module's flat sides (a slight tuck-under at the skirt)."""
    return D['bw'] - 0.006 * K.sstep(0.80, 0.56, z)


def r_edge(x):
    """Radius of the edges between the flat sides and the profile walls: 0.13, softer at the rear and the nose."""
    return D['r_edge'] + 0.10 * K.sstep(-3.45, -3.92, x) + 0.07 * K.sstep(1.85, 2.30, x)


def B_sdf(P):
    x, y, z = P[:, 0], P[:, 1], P[:, 2]
    prof = profile_sdf(x, z)
    side = np.abs(y) - b_half_w(z)
    return K.r_int(prof, side, r_edge(x))


def profile_loop(step=0.01, arc_step=0.008):
    """The side profile outline (x, z), counter-clockwise, starting on the bottom at seam_x (the loft's seam lies
    in the open part of the underside, clear of the rear arch)."""
    pts = np.array([(D['bx_r'], D['bz0']), (D['bx_f'], D['bz0']), (D['bx_f'], D['al_z0']), (D['al_f'], D['al_z0']),
                    (D['al_f'], D['bz1']), (D['bx_r'], D['bz1'])])
    radii = [D['r_box_rb'], D['r_box_fb'], D['r_under'], D['nose_rb'], D['nose_rt'], D['r_box_rt']]
    L = K.rounded_poly(pts, radii, step, arc_step=arc_step)
    L = K.ccw(L)
    bot = np.abs(L[:, 1] - D['bz0']) < 1e-6
    xs = L[bot, 0]
    i_bot = np.nonzero(bot)[0]
    j = int(np.argmin(np.abs(xs - D['seam_x'])))
    L = np.roll(L, -int(i_bot[j]), axis=0)
    L[0] = (D['seam_x'], D['bz0'])
    return L


# ============================================================================================ proxies
L_T = np.cumsum([0.0, 0.05, 0.047, 0.62, 0.03, 0.03])
L_GUIDE = RRect(D['xf'], D['xr'], D['hw'], D['rho_f'], D['rho_r'])
LEAN = 0.012
UNDER = 0.05


def w_top(x):
    return 0.010 + 0.024 * K.sstep(2.0, 1.90, x)


def l_z0z1(x):
    return _bot(x) + r_bot(x), top_z(x, 0.97) - r_top(x)


def _l_section(u, t):
    x0, y0, nx, ny = L_GUIDE.point(u)
    zb = _bot(x0)
    zt = top_z(x0, 0.97)
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


G_T = np.cumsum([0.0, 0.90, 0.10, 0.05, 0.05])
G_Z0 = 1.30
G_ZW = 2.22
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
    xa, ya, nxa, nya = g_contour(uf, 2.30)
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


# living module: u runs round the side profile (counter-clockwise from the middle of the bottom), t from the
# flat side face over the side edge fillet onto the profile wall and across it to the centre line
BT_EDGE = PI / 2 * D['r_edge']
B_T = np.array([0.0, 0.02, 0.02 + BT_EDGE, 0.02 + BT_EDGE + D['bw'] - D['r_edge']])


class ProfileLoft:
    """Proxy for the living module's profile walls and side edges (left half)."""

    def __init__(self):
        L = profile_loop(0.01)
        P = np.vstack([L, L[:1]])
        seg = np.linalg.norm(np.diff(P, axis=0), axis=1)
        self.s = np.concatenate([[0], np.cumsum(seg)])
        self.length = float(self.s[-1])
        Tn = np.empty_like(P)
        Tn[1:-1] = P[2:] - P[:-2]
        Tn[0] = Tn[-1] = P[1] - P[-2]
        Tn = K.unit(Tn)
        self.N = np.stack([Tn[:, 1], -Tn[:, 0]], 1)    # outward for a counter-clockwise loop
        self.P = P

    def at(self, u):
        u = np.mod(np.asarray(u, float), self.length)
        x = np.interp(u, self.s, self.P[:, 0])
        z = np.interp(u, self.s, self.P[:, 1])
        n = K.unit(np.stack([np.interp(u, self.s, self.N[:, 0]), np.interp(u, self.s, self.N[:, 1])], 1))
        return x, z, n[:, 0], n[:, 1]

    def u_of(self, x, z):
        """Loop parameter of the profile point nearest to (x, z) (refined on the nearest segment)."""
        P = self.P
        a, b = P[:-1], P[1:]
        ab = b - a
        L2 = np.maximum((ab ** 2).sum(1), 1e-12)
        f = np.clip(((np.array([x, z]) - a) * ab).sum(1) / L2, 0, 1)
        q = a + ab * f[:, None]
        d = ((q - np.array([x, z])) ** 2).sum(1)
        i = int(np.argmin(d))
        return float(self.s[i] + f[i] * (self.s[i + 1] - self.s[i]))

    def __call__(self, u, t):
        u, t = np.broadcast_arrays(np.asarray(u, float), np.asarray(t, float))
        u = u.ravel()
        t = np.clip(t.ravel(), -0.1, B_T[-1] + 0.1)
        x, z, nx, nz = self.at(u)
        r = r_edge(x)
        W = b_half_w(z)
        y = np.empty_like(u)
        off = np.empty_like(u)
        m = t < B_T[1]
        f = (t[m] - B_T[0]) / (B_T[1] - B_T[0])
        y[m] = W[m]
        off[m] = r[m] + 0.02 * (1 - f)
        m = (t >= B_T[1]) & (t < B_T[2])
        a = (t[m] - B_T[1]) / (B_T[2] - B_T[1]) * PI / 2
        y[m] = W[m] - r[m] + r[m] * np.cos(a)
        off[m] = r[m] - r[m] * np.sin(a)
        m = t >= B_T[2]
        f = (t[m] - B_T[2]) / (B_T[3] - B_T[2])
        y[m] = (W[m] - r[m]) * (1 - f)
        off[m] = 0.0
        return np.stack([x - nx * off, y, z - nz * off], 1)

    def side_face_loop(self, step=0.03):
        """Boundary of the flat side face (the loft's t = 0 row) in side coordinates (x, z), counter-clockwise."""
        us = np.arange(0.0, self.length, step)
        x, z, nx, nz = self.at(us)
        off = r_edge(x) + 0.02
        return np.stack([x - nx * off, z - nz * off], 1)


B_PROXY = ProfileLoft()
CL = K.Chart(L_proxy, L_sdf, (0.0, L_GUIDE.length), (L_T[0], L_T[-1]))
CG = K.Chart(G_proxy, G_sdf, (0.0, G_GUIDE.length), (G_T[0], G_T[-1]))
CB = K.Chart(B_PROXY, B_sdf, (0.0, B_PROXY.length), (B_T[0], B_T[-1]), inv_res=(1700, 90))
CT = K.TopChart(L_sdf)
CBT = K.TopChart(B_sdf, z_from=3.6)
SIDE_L = K.PlaneChart(L_sdf, axis=1, sign=1.0)
SIDE_G = K.PlaneChart(G_sdf, axis=1, sign=1.0)
SIDE_B = K.PlaneChart(B_sdf, axis=1, sign=1.0)
FRONT_L = K.PlaneChart(L_sdf, axis=0, sign=1.0)
REAR_B = K.PlaneChart(B_sdf, axis=0, sign=-1.0, start=4.5)
SL = L_GUIDE.seg
SG = G_GUIDE.seg


def u_of_x(x):
    return SL[2] + (D['xf'] - D['rho_f']) - np.asarray(x, float)


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


def bt_of_y(y, x, z=2.0):
    """B loft t of a half width y on the profile wall at the profile point (x, z) (y inboard of the fillet)."""
    w = b_half_w(np.asarray(z, float)) - r_edge(np.asarray(x, float))
    return B_T[2] + (1 - np.asarray(y, float) / w) * (B_T[3] - B_T[2])


def l_u_samples():
    s = SL
    parts = [np.linspace(s[0], s[1], int((s[1] - s[0]) / 0.07) + 1),
             np.linspace(s[1], s[2], int((s[2] - s[1]) / 0.018) + 1),
             np.linspace(s[2], s[3], int((s[3] - s[2]) / 0.07) + 1),
             np.linspace(s[3], s[4], 3),
             np.linspace(s[4], s[5], int((s[5] - s[4]) / 0.10) + 1)]
    return np.unique(np.concatenate(parts))


def l_t_samples():
    T = L_T
    parts = [np.linspace(T[0], T[1], 3), np.linspace(T[1], T[2], 5), np.linspace(T[2], T[3], 10),
             np.linspace(T[3], T[4], 7), np.linspace(T[4], T[5], 3)]
    return np.unique(np.concatenate(parts))


def g_u_samples():
    s = SG
    parts = [np.linspace(s[0], s[1], int((s[1] - s[0]) / 0.09) + 1), np.linspace(s[1], s[2], 7),
             np.linspace(s[2], s[3], int((s[3] - s[2]) / 0.08) + 1), np.linspace(s[3], s[4], 3),
             np.linspace(s[4], s[5], int((s[5] - s[4]) / 0.15) + 1)]
    return np.unique(np.concatenate(parts))


def g_t_samples():
    T = G_T
    parts = [np.linspace(T[0], T[1], 12), np.linspace(T[1], T[2], 3), np.linspace(T[2], T[3], 4), np.linspace(T[3], T[4], 2)]
    return np.unique(np.concatenate(parts))


def b_u_samples(step=0.12, arc=0.03):
    """B loft u samples: coarse along the straight walls, fine round the profile's corners."""
    P = B_PROXY.P
    s = B_PROXY.s
    Tn = np.diff(P, axis=0)
    ang = np.arctan2(Tn[:, 1], Tn[:, 0])
    dang = np.abs((np.diff(ang) + PI) % (2 * PI) - PI)
    curved = np.concatenate([[False], dang > 1e-3, [False]])
    out = [0.0]
    for i in range(1, len(s)):
        lim = arc if (curved[min(i, len(curved) - 1)] or curved[i - 1]) else step
        if s[i] - out[-1] >= lim - 1e-9:
            out.append(float(s[i]))
    if B_PROXY.length - out[-1] > 1e-6:
        out.append(B_PROXY.length)
    return np.array(out)


def b_t_samples():
    T = B_T
    return np.unique(np.concatenate([np.linspace(T[0], T[1], 2), np.linspace(T[1], T[2], 8), np.linspace(T[2], T[2] + 0.06, 3),
                                     np.linspace(T[2] + 0.06, T[3], 9)]))


def grid_from(us, ts):
    uu, tt = np.meshgrid(us, ts, indexing='ij')
    du = np.gradient(us)
    dt = np.gradient(ts)
    sp = np.minimum(du[:, None], dt[None, :]) * np.ones_like(uu)
    return np.stack([uu.ravel(), tt.ravel()], 1), sp.ravel()


def main(args):
    from frames import _rv_build as RB
    RB.build(args)
