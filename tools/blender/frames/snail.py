"""
ModCar frame 'snail' (蜗牛): a fictional small 1980s box truck - a cab-over with its diesel four between the
seats under a lidded engine cover, a tall aluminium box behind the cab with ribbed sides, corner posts and twin
rear doors, rear-wheel drive on single wheels. Sky blue cab with a cream band, a cream box; round lamps either side
of a chrome grille, a step under each door, a little snail on the nose. docs/MODCAR.md section 27.

    blender -b --factory-startup --python tools/blender/build.py -- frames/snail [--no-preview] [--quick] [--dry]

Writes public/models/modcar/frames/snail.glb and src/core/modcar/data/mounts/snail.json (--dry: both into the
scratch directory instead); previews go to D:/modcar-scratch/frames/snail/snail_*.png. Blender axes: X forward,
Y left, Z up; origin on the ground under the middle of the wheelbase.

Construction (see _kit.py): the cab is one exact SDF shell C (a box with a nose that leans back above the
windscreen's foot, round vertical corners, a roll from the walls into the roof and a tighter brow over the
windscreen), meshed on one loft chart CC that runs round the half plan from the front centre (u = 0) to the rear
centre (u = U) and up its section (t: underside strip, bottom roll, the walls, the roof roll, a strip of the roof);
the middle of the roof is a height-field chart. The wall's t is the height itself between Z_W0 and Z_W1, so the
cream band, the door and the windows are exact lines in (u, t). The box is flat: panels, ribs, posts and rails
(_snail_ext.Box). Only the left half is meshed where the two sides are alike; the right is its mirror.
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
    # single wheels: the 16-inch off-road rim (radius 0.203) with the truck tyre (sidewall 0.14)
    wb=2.90, ax_f=1.45, ax_r=-1.45, hub_z=0.343, track_f=1.50, track_r=1.50, wheel_r=0.343,
    # the cab: plan rounded rectangle (nose face, back face, half width, vertical corner radii)
    xf=2.53, xr=0.78, hw=0.90, rho_f=0.15, rho_r=0.05,
    z_bot=0.55, roof_z=2.28, roof_crown=0.012,
    # the roll from the walls into the roof along the sides; the brow over the windscreen; the roll at the back
    r_side=0.10, r_brow=0.085, r_back=0.06,
    # the nose stands upright to the cowl and leans back above it (by ws_lean degrees from vertical)
    knee0=1.12, knee1=1.28, ws_lean=9.0,
    ws_foot=1.30, ws_head=2.12, ws_hw=0.78, ws_r=0.06,
    # the sides lean in above the belt (a hair: the door glass stands a little in from the skin below)
    belt_z=1.45, side_lean=0.030,
    # front wheel arch (radius, centre height): the tyre's radius 0.343 with room to rise
    arch_r=0.45, arch_zc=0.37,
    # the cream band round the cab
    band_z0=1.17, band_z1=1.23,
    gap=0.005, edge_r=0.0022,
    # the doors (over the front wheels: the arch takes the bottom), their windows and the vent wing's bar; the
    # fixed quarter window in the corner ahead of each door (its front edge round the nose's corner roll)
    cd_x0=0.89, cd_x1=2.15, cd_z0=0.88, cd_z1=2.14, cd_r=0.05,
    cd_win=(0.97, 2.08, 1.47, 2.07, 0.05), vent_x=1.91,
    q_x0=2.215, q_z0=1.47, q_z1=2.07,
    # the little window in the cab's back (a notch at the centre line)
    rw_hw=0.40, rw_z0=1.56, rw_z1=1.96, rw_r=0.05,
    # round head lamps and the grille between them on the nose
    lamp_y=0.615, lamp_z=0.80, lamp_d=0.21,
    grille_w=0.42, grille_z0=0.63, grille_z1=0.95, grille_r=0.035,
    # the box: front wall, rear frame, half width, bottom, top, the floor's top
    bx_f=0.70, bx_r=-2.45, bw=0.95, bz0=0.82, bz1=2.75, box_floor=0.95,
)
GAP = D['gap']
ER = D['edge_r']
DELTA = GAP / 2 + ER

# the wall's straight piece, where the loft's t is the height itself (t = T3 + z - Z_W0)
Z_W0 = 0.60
Z_W1 = 2.16

_WL = math.radians(D['ws_lean'])
_TL = math.tan(_WL)
PHI_F = _WL                     # the nose's lean from vertical at the brow


# ============================================================================================ exact surface (C)
def front_lean(z):
    """The nose: tucked under a little at the bottom, upright to the cowl, then a knee into the lean (a quadratic
    blend from upright at knee0 to the leaning line at knee1, the line through their middle)."""
    z = np.asarray(z, float)
    k0, k1 = D['knee0'], D['knee1']
    km = 0.5 * (k0 + k1)
    up = -0.012 * (1.0 - K.sstep(0.55, 0.64, z))
    knee = np.where(z <= k0, 0.0, np.where(z < k1, -_TL * (z - k0) ** 2 / (2.0 * (k1 - k0)), -_TL * (z - km)))
    return up + knee


def rear_lean(z):
    z = np.asarray(z, float)
    return -0.008 * (1.0 - K.sstep(0.55, 0.62, z))


def side_w(x, z):
    """Half width of the side wall: a little tucked under at the bottom, upright to the belt, then (after a soft
    knee) leaning in by side_lean at the roof; a faint barrel in plan."""
    z = np.asarray(z, float)
    x = np.asarray(x, float)
    zb = D['belt_z']
    k = 0.12
    s = np.where(z <= zb, 0.0, np.where(z < zb + k, (z - zb) ** 2 / (2 * k), (z - zb) - k / 2))
    tuck = 0.004 * ((0.95 - np.minimum(z, 0.95)) / 0.40) ** 2
    return D['hw'] - tuck - D['side_lean'] * s / (D['roof_z'] - zb - k / 2) - 0.002 * ((x - 1.66) / 0.86) ** 2


def front_x(ay, z):
    """The nose: bowed 1 cm in plan, leaning back above the cowl."""
    return D['xf'] - 0.010 * (np.minimum(ay, D['hw']) / D['hw']) ** 2 + front_lean(z)


def rear_x(ay, z):
    return D['xr'] - rear_lean(z)


def roof_z(x, ay):
    return D['roof_z'] + D['roof_crown'] * (1.0 - (np.minimum(ay, D['hw']) / D['hw']) ** 2)


def r_top(x):
    """Radius of the roll from the walls into the roof: 0.10 along the sides, a tighter brow over the windscreen,
    0.06 at the back."""
    x = np.asarray(x, float)
    return D['r_side'] - (D['r_side'] - D['r_brow']) * K.sstep(2.05, 2.36, x) - (D['r_side'] - D['r_back']) * K.sstep(1.03, 0.84, x)


def r_bot(x):
    x = np.asarray(x, float)
    return 0.03 + 0.012 * K.sstep(2.25, 2.42, x)


def C_sdf(P):
    x, y, z = P[:, 0], P[:, 1], P[:, 2]
    ay = np.abs(y)
    a_side = ay - side_w(x, z)
    a_front = x - front_x(ay, z)
    a_rear = rear_x(ay, z) - x
    a_top = z - roof_z(x, ay)
    a_bot = D['z_bot'] - z
    d = K.r_int(a_side, a_front, D['rho_f'])
    d = K.r_int(d, a_rear, D['rho_r'])
    d = K.r_int(d, a_top, r_top(x))
    d = K.r_int(d, a_bot, r_bot(x))
    return d


# ============================================================================================ the loft proxy
C_GUIDE = RRect(D['xf'], D['xr'], D['hw'], D['rho_f'], D['rho_r'])
SC = C_GUIDE.seg
U_END = float(C_GUIDE.length)
UNDER = 0.05
W_TOP = 0.10
# t pieces: underside strip, bottom roll, lower wall (to Z_W0), the straight wall (t = z), upper wall (to the
# roll's start), the roof roll, a strip of the roof
C_T = np.cumsum([0.0, 0.05, 0.05, 0.03, Z_W1 - Z_W0, 0.04, 0.17, W_TOP])


def _guide(u):
    x0, y0, nx, ny = C_GUIDE.point(np.clip(np.asarray(u, float), 0.0, U_END - 1e-9))
    return x0, y0, nx, ny


def _lean(x0, nx, ny, z):
    """Plan offset of the wall at height z from the guide (negative: in), by the guide's plan normal."""
    z = np.asarray(z, float)
    fr = np.where(nx > 0, front_lean(z) * nx ** 2, rear_lean(z) * nx ** 2)
    return fr + (side_w(x0, z) - D['hw']) * ny ** 2


def _phi(nx):
    return PHI_F * np.where(nx > 0, nx ** 2, 0.0)


def section_params(u):
    """The section's heights at loft u: bottom, bottom roll radius, roll start height, top roll radius, lean
    angle at the top, roof height."""
    x0, y0, nx, ny = _guide(u)
    zb = np.full(np.shape(x0), D['z_bot'])
    rb = r_bot(x0)
    rs = r_top(x0)
    ph = _phi(nx)
    zt = roof_z(x0, np.abs(y0))
    zs = zt - rs * (1.0 - np.sin(ph))
    return x0, y0, nx, ny, zb, rb, zs, rs, ph, zt


def _c_section(u, t):
    x0, y0, nx, ny, zb, rb, zs, rs, ph, zt = section_params(u)
    T = C_T
    n = np.empty_like(u)
    z = np.empty_like(u)
    m = t < T[1]
    f = (t[m] - T[0]) / (T[1] - T[0])
    n[m] = -rb[m] - UNDER * (1 - f)
    z[m] = zb[m]
    m = (t >= T[1]) & (t < T[2])
    f = (t[m] - T[1]) / (T[2] - T[1])
    a = -PI / 2 + f * PI / 2
    n[m] = -rb[m] + rb[m] * np.cos(a) + _lean(x0[m], nx[m], ny[m], zb[m] + rb[m]) * f
    z[m] = zb[m] + rb[m] + rb[m] * np.sin(a)
    m = (t >= T[2]) & (t < T[3])
    f = (t[m] - T[2]) / (T[3] - T[2])
    zz = zb[m] + rb[m] + (Z_W0 - zb[m] - rb[m]) * f
    n[m] = _lean(x0[m], nx[m], ny[m], zz)
    z[m] = zz
    m = (t >= T[3]) & (t < T[4])
    zz = Z_W0 + (t[m] - T[3])
    n[m] = _lean(x0[m], nx[m], ny[m], zz)
    z[m] = zz
    m = (t >= T[4]) & (t < T[5])
    f = (t[m] - T[4]) / (T[5] - T[4])
    zz = Z_W1 + (zs[m] - Z_W1) * f
    n[m] = _lean(x0[m], nx[m], ny[m], zz)
    z[m] = zz
    nfs = _lean(x0, nx, ny, zs)
    m = (t >= T[5]) & (t < T[6])
    f = (t[m] - T[5]) / (T[6] - T[5])
    a = ph[m] + (PI / 2 - ph[m]) * f
    n[m] = nfs[m] - rs[m] * np.cos(ph[m]) + rs[m] * np.cos(a)
    z[m] = zs[m] - rs[m] * np.sin(ph[m]) + rs[m] * np.sin(a)
    m = t >= T[6]
    f = (t[m] - T[6]) / (T[7] - T[6])
    n[m] = nfs[m] - rs[m] * np.cos(ph[m]) - W_TOP * f
    z[m] = zt[m]
    return n, z


def C_proxy(u, t):
    u, t = np.broadcast_arrays(np.asarray(u, float), np.asarray(t, float))
    u = u.ravel()
    t = np.clip(t.ravel(), C_T[0] - 0.2, C_T[-1] + 0.2)
    uc = np.clip(u, 0.0, U_END - 1e-9)
    n, z = _c_section(uc, t)
    x, y, nx, ny = C_GUIDE.point(uc, n)
    lo = u < 0
    y[lo] = u[lo]
    hi = u > U_END
    y[hi] = -(u[hi] - U_END)
    return np.stack([x, y, z], 1)


CC = K.Chart(C_proxy, C_sdf, (0.0, U_END), (C_T[0], C_T[-1]), inv_res=(900, 220))
CT = K.TopChart(C_sdf)
SIDE = K.PlaneChart(C_sdf, axis=1, sign=1.0)
FRONT = K.PlaneChart(C_sdf, axis=0, sign=1.0, start=4.0)
REAR = K.PlaneChart(C_sdf, axis=0, sign=-1.0, start=0.2)


# ============================================================================================ loft coordinates
def u_of_x(x):
    """Loft u on the straight side for a given x."""
    return SC[2] + (D['xf'] - D['rho_f']) - np.asarray(x, float)


def x_of_u(u):
    return (D['xf'] - D['rho_f']) - (np.asarray(u, float) - SC[2])


def u_of_yf(y):
    """Loft u on the flat of the nose for a half width y."""
    return np.asarray(y, float)


def u_of_yr(y):
    """Loft u on the flat of the back for a half width y."""
    return SC[4] + (D['hw'] - D['rho_r']) - np.asarray(y, float)


def t_of_z(u, z):
    """Loft t of height z at loft u (exact inverse of the section)."""
    u, z = np.broadcast_arrays(np.asarray(u, float), np.asarray(z, float))
    u = u.ravel().copy()
    z = z.ravel().copy()
    x0, y0, nx, ny, zb, rb, zs, rs, ph, zt = section_params(u)
    T = C_T
    t = np.empty_like(z)
    m = z < zb + 1e-9
    t[m] = T[1] - (zb[m] - z[m])
    m = (z >= zb + 1e-9) & (z < zb + rb)
    a = np.arcsin(np.clip((z[m] - zb[m] - rb[m]) / rb[m], -1.0, 0.0))
    t[m] = T[1] + (a + PI / 2) / (PI / 2) * (T[2] - T[1])
    m = (z >= zb + rb) & (z < Z_W0)
    t[m] = T[2] + (z[m] - zb[m] - rb[m]) / (Z_W0 - zb[m] - rb[m]) * (T[3] - T[2])
    m = (z >= Z_W0) & (z <= Z_W1)
    t[m] = T[3] + (z[m] - Z_W0)
    m = (z > Z_W1) & (z <= zs)
    t[m] = T[4] + (z[m] - Z_W1) / (zs[m] - Z_W1) * (T[5] - T[4])
    m = z > zs
    sa = np.clip((z[m] - zs[m]) / rs[m] + np.sin(ph[m]), -1.0, 1.0)
    a = np.arcsin(sa)
    t[m] = T[5] + (a - ph[m]) / (PI / 2 - ph[m]) * (T[6] - T[5])
    return t


def t_band(z):
    return float(C_T[3] + (z - Z_W0))


T_BAND0 = t_band(D['band_z0'])
T_BAND1 = t_band(D['band_z1'])


def side_uv(xz):
    """Side coordinates (x, z) of the straight side -> loft (u, t)."""
    xz = np.asarray(xz, float).reshape(-1, 2)
    u = u_of_x(xz[:, 0])
    return np.stack([u, t_of_z(u, xz[:, 1])], 1)


def rear_uv(yz):
    """Back coordinates (y, z) of the flat of the back -> loft (u, t)."""
    yz = np.asarray(yz, float).reshape(-1, 2)
    u = u_of_yr(yz[:, 0])
    return np.stack([u, t_of_z(u, yz[:, 1])], 1)


def front_uv(yz):
    yz = np.asarray(yz, float).reshape(-1, 2)
    u = u_of_yf(yz[:, 0])
    return np.stack([u, t_of_z(u, yz[:, 1])], 1)


def flat_end_x(z):
    """x where the straight side meets the nose's corner roll at height z (the nose leans back above the cowl)."""
    return D['xf'] + front_lean(z) - D['rho_f']


# ============================================================================================ sampling
def c_u_samples(step_side=0.10, step_end=0.06, step_arc=0.02):
    s = SC
    parts = [np.linspace(s[0], s[1], int((s[1] - s[0]) / step_end) + 1),
             np.linspace(s[1], s[2], int((s[2] - s[1]) / step_arc) + 1),
             np.linspace(s[2], s[3], int((s[3] - s[2]) / step_side) + 1),
             np.linspace(s[3], s[4], max(3, int((s[4] - s[3]) / step_arc) + 1)),
             np.linspace(s[4], s[5], int((s[5] - s[4]) / step_end) + 1)]
    return np.unique(np.concatenate(parts))


def c_t_samples(wall=0.09, roll=7):
    T = C_T
    parts = [np.linspace(T[0], T[1], 2), np.linspace(T[1], T[2], 4), np.linspace(T[2], T[3], 2),
             np.linspace(T[3], T[4], int((T[4] - T[3]) / wall) + 1), np.linspace(T[4], T[5], 2),
             np.linspace(T[5], T[6], roll), np.linspace(T[6], T[7], 3)]
    return np.unique(np.concatenate(parts))


def grid_from(us, ts):
    uu, tt = np.meshgrid(us, ts, indexing='ij')
    du = np.gradient(us)
    dt = np.gradient(ts)
    sp = np.minimum(du[:, None], dt[None, :]) * np.ones_like(uu)
    return np.stack([uu.ravel(), tt.ravel()], 1), sp.ravel()


def main(args):
    from frames import _snail_build as SB
    SB.build(args)
