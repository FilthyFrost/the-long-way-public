"""
ModCar frame 'camel' (骆驼): a fictional school bus made a motorhome (docs/V3/plan/rv.md, R3) — the Elephant's way of
building (frames/elephant.py) for its long box: from the cowl at the windscreen's foot back to the tail, the windscreen
leaning a little, a row of windows down both sides, the entry door on the right just behind the cowl, the emergency door
in the tail; yellow below the roof, the roof white. Its hood is a shell of its own in front of the box (frames/
camel_hood.py): the engine and the front wheels under it. Inside it is empty: the floor, the walls and the windows, the
driver's seat and the dash — what goes in is found by the road. docs/MODCAR.md section 2.2.

    blender -b --factory-startup --python tools/blender/build.py -- frames/camel [--no-preview] [--quick]

Writes public/models/modcar/frames/camel.glb and src/core/modcar/data/mounts/camel.json; previews go to
D:/modcar-scratch/frames/camel/camel_*.png. Blender axes: X forward, Y left, Z up.

Construction (see _kit.py): the whole outer skin is one exact SDF shell V (a box with a gently bowed nose leaning
back above the windscreen's foot, round vertical corners, a big roll from the walls into the roof, a tighter
brow over the windscreen); one loft chart CV runs round the half plan from the front centre (u = 0) to the rear
centre (u = U) and up its section (t: underside, bottom roll, the walls, the roof roll, a strip of the roof);
the middle of the roof is a height-field chart. The wall's t is the height itself between Z_W0 and Z_W1, so the
colour split at the waist and the side openings are exact lines in (u, t). Only the left half is meshed; the
right is its mirror, built in left coordinates where it differs (the sliding door is on the right, the fuel flap
on the left).
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
    wb=6.40, ax_f=3.55, ax_r=-2.85, hub_z=0.39, track_f=2.00, track_r=1.84, wheel_r=0.39,
    # the box: from the cowl (its front face at the windscreen; below it the hood's back is inside it) to the tail
    xf=2.92, xr=-5.05, hw=1.22, rho_f=0.14, rho_r=0.24,
    z_bot=0.55, roof_z=2.98, roof_crown=0.06,
    # the roll from the walls into the arched roof along the sides; the brow over the windscreen; the roll at the back
    r_side=0.36, r_brow=0.22, r_back=0.32,
    ws_foot=1.50, ws_head=2.42, ws_lean=6.0, ws_hw=1.06, ws_r=0.08,
    # (only the rear wheels are under the box: the front ones are under the hood)
    arch_r=0.50, arch_zc=0.42,
    # yellow below the waist (over the windows), the roof white
    waist_z=2.50,
    gap=0.005, edge_r=0.0022,
    # the fixed quarter window at the front corner beside the windscreen (left: on the right the entry door is there)
    q_x0=2.30, q_z0=1.50, q_z1=2.36,
    # wide driver side window aligned with windshield foot + clean bus side window row
    win_drv=(1.62, 2.26, 1.50, 2.36, 0.06),
    win_z=(1.55, 2.36), win_r=0.06,
    win_row=((0.94, 1.54), (0.12, 0.86), (-0.72, 0.04), (-1.60, -0.80), (-2.48, -1.68), (-3.36, -2.56), (-4.24, -3.44)),
    # the entry door on the right just behind the cowl (a folding bus door, one leaf here) and its tall window
    sd_x0=2.00, sd_x1=2.74, sd_z0=0.62, sd_z1=2.42, sd_r=0.05,
    sd_win=(2.06, 2.68, 1.10, 2.34, 0.04),
    # the emergency door in the tail (hinged at its left edge: P_trunk) and its window; raised sill for flat 0.84 m floor
    lid_hw=0.46, lid_z0=0.86, lid_z1=2.40, lid_r=0.06,
    tw_hw=0.38, tw_z0=1.55, tw_z1=2.30, tw_r=0.05,
    rw=(0.62, 1.04, 1.60, 2.32, 0.06),
    tail_y=0.82, tail_z=1.12, tail_w=0.20, tail_h=0.32,
    # the fuel flap on the left side (x, z, radius)
    fuel=(-1.25, 1.05, 0.06),
    # the black rub rails along the sides (their heights)
    rails=(0.86, 1.20, 1.48),
)
GAP = D['gap']
ER = D['edge_r']
DELTA = GAP / 2 + ER

# the wall's straight piece, where the loft's t is the height itself (t = T3 + z - Z_W0)
Z_W0 = 0.66
Z_W1 = 2.56

_WL = math.radians(D['ws_lean'])
PHI_F = _WL                     # the nose's lean from vertical at the brow


# ============================================================================================ exact surface (V)
# the nose: a little tucked under at the bottom, upright to the windscreen's foot, then leaning back
_front_lean = K.Spline([0.55, 0.59, 0.64, 0.72, 1.40, 1.50, 1.56, 1.64, 2.00, 2.45, 3.05],
                       [-0.018, -0.007, -0.002, 0.0, 0.0, -0.001, -0.004, -0.012, -0.050, -0.098, -0.160], monotone=True)
_rear_lean = K.Spline([0.55, 0.61, 0.69, 3.05], [-0.016, -0.004, 0.0, 0.0], monotone=True)


def front_lean(z):
    return _front_lean(z)


def rear_lean(z):
    return _rear_lean(z)


def side_w(x, z):
    """Half width of the side wall: a faint barrel, 5 mm in at the bottom and at the shoulder."""
    return D['hw'] - 0.005 * ((np.asarray(z, float) - 1.6) / 1.1) ** 2 - 0.004 * ((np.asarray(x, float) + 1.0) / 4.0) ** 2


def front_x(ay, z):
    """The front of the box: bowed 2 cm in plan, leaning back above the windscreen's foot."""
    return D['xf'] - 0.02 * (np.minimum(ay, D['hw']) / D['hw']) ** 2 + front_lean(z)


def rear_x(ay, z):
    return D['xr'] + 0.008 * (np.minimum(ay, D['hw']) / D['hw']) ** 2 - rear_lean(z)


def roof_z(x, ay):
    return D['roof_z'] + D['roof_crown'] * (1.0 - (np.minimum(ay, D['hw']) / D['hw']) ** 2)


def r_top(x):
    """Radius of the roll from the walls into the roof: 0.25 along the sides, a tighter brow over the windscreen,
    0.20 at the back."""
    x = np.asarray(x, float)
    xf, xr = D['xf'], D['xr']
    return D['r_side'] - (D['r_side'] - D['r_brow']) * K.sstep(xf - 0.58, xf - 0.20, x) - (D['r_side'] - D['r_back']) * K.sstep(xr + 0.36, xr + 0.12, x)


def r_bot(x):
    x = np.asarray(x, float)
    xf, xr = D['xf'], D['xr']
    return 0.04 + 0.03 * K.sstep(xf - 0.38, xf - 0.14, x) + 0.03 * K.sstep(xr + 0.42, xr + 0.18, x)


def V_sdf(P):
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
V_GUIDE = RRect(D['xf'], D['xr'], D['hw'], D['rho_f'], D['rho_r'])
SV = V_GUIDE.seg
U_END = float(V_GUIDE.length)
UNDER = 0.05
W_TOP = 0.10
# t pieces: underside strip, bottom roll, lower wall (to Z_W0), the straight wall (t = z), upper wall (to the
# roll's start), the roof roll, a strip of the roof
V_T = np.cumsum([0.0, 0.05, 0.05, 0.06, Z_W1 - Z_W0, 0.08, 0.30, W_TOP])


def _guide(u):
    x0, y0, nx, ny = V_GUIDE.point(np.clip(np.asarray(u, float), 0.0, U_END - 1e-9))
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


def _v_section(u, t):
    x0, y0, nx, ny, zb, rb, zs, rs, ph, zt = section_params(u)
    T = V_T
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


def V_proxy(u, t):
    u, t = np.broadcast_arrays(np.asarray(u, float), np.asarray(t, float))
    u = u.ravel()
    t = np.clip(t.ravel(), V_T[0] - 0.2, V_T[-1] + 0.2)
    uc = np.clip(u, 0.0, U_END - 1e-9)
    n, z = _v_section(uc, t)
    x, y, nx, ny = V_GUIDE.point(uc, n)
    lo = u < 0
    y[lo] = u[lo]
    hi = u > U_END
    y[hi] = -(u[hi] - U_END)
    return np.stack([x, y, z], 1)


CV = K.Chart(V_proxy, V_sdf, (0.0, U_END), (V_T[0], V_T[-1]), inv_res=(900, 220))
CT = K.TopChart(V_sdf, z_from=5.0)
SIDE = K.PlaneChart(V_sdf, axis=1, sign=1.0)
FRONT = K.PlaneChart(V_sdf, axis=0, sign=1.0, start=6.0)
REAR = K.PlaneChart(V_sdf, axis=0, sign=-1.0, start=6.0)


# ============================================================================================ loft coordinates
def u_of_x(x):
    """Loft u on the straight side for a given x."""
    return SV[2] + (D['xf'] - D['rho_f']) - np.asarray(x, float)


def x_of_u(u):
    return (D['xf'] - D['rho_f']) - (np.asarray(u, float) - SV[2])


def u_of_yf(y):
    """Loft u on the flat of the nose for a half width y."""
    return np.asarray(y, float)


def u_of_yr(y):
    """Loft u on the flat of the tail for a half width y."""
    return SV[4] + (D['hw'] - D['rho_r']) - np.asarray(y, float)


def t_of_z(u, z):
    """Loft t of height z at loft u (exact inverse of the section)."""
    u, z = np.broadcast_arrays(np.asarray(u, float), np.asarray(z, float))
    u = u.ravel().copy()
    z = z.ravel().copy()
    x0, y0, nx, ny, zb, rb, zs, rs, ph, zt = section_params(u)
    T = V_T
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


T_WAIST = float(V_T[3] + (D['waist_z'] - Z_W0))


def side_uv(xz):
    """Side coordinates (x, z) of the straight side -> loft (u, t)."""
    xz = np.asarray(xz, float).reshape(-1, 2)
    u = u_of_x(xz[:, 0])
    return np.stack([u, t_of_z(u, xz[:, 1])], 1)


def rear_uv(yz):
    """Tail coordinates (y, z) of the flat of the tail -> loft (u, t)."""
    yz = np.asarray(yz, float).reshape(-1, 2)
    u = u_of_yr(yz[:, 0])
    return np.stack([u, t_of_z(u, yz[:, 1])], 1)


def front_uv(yz):
    yz = np.asarray(yz, float).reshape(-1, 2)
    u = u_of_yf(yz[:, 0])
    return np.stack([u, t_of_z(u, yz[:, 1])], 1)


def flat_end_x(z):
    """x where the straight side meets the nose's corner roll at height z (the nose leans back above its foot)."""
    return D['xf'] + front_lean(z) - D['rho_f']


# ============================================================================================ sampling
def v_u_samples(step_side=0.10, step_end=0.06, step_arc=0.022):
    s = SV
    parts = [np.linspace(s[0], s[1], int((s[1] - s[0]) / step_end) + 1),
             np.linspace(s[1], s[2], int((s[2] - s[1]) / step_arc) + 1),
             np.linspace(s[2], s[3], int((s[3] - s[2]) / step_side) + 1),
             np.linspace(s[3], s[4], int((s[4] - s[3]) / step_arc) + 1),
             np.linspace(s[4], s[5], int((s[5] - s[4]) / step_end) + 1)]
    return np.unique(np.concatenate(parts))


def v_t_samples(wall=0.09, roll=9):
    T = V_T
    parts = [np.linspace(T[0], T[1], 2), np.linspace(T[1], T[2], 5), np.linspace(T[2], T[3], 2),
             np.linspace(T[3], T[4], int((T[4] - T[3]) / wall) + 1), np.linspace(T[4], T[5], 2),
             np.linspace(T[5], T[6], roll), np.linspace(T[6], T[7], 3), [T_WAIST - 0.006, T_WAIST + 0.006]]
    return np.unique(np.concatenate(parts))


def grid_from(us, ts):
    uu, tt = np.meshgrid(us, ts, indexing='ij')
    du = np.gradient(us)
    dt = np.gradient(ts)
    sp = np.minimum(du[:, None], dt[None, :]) * np.ones_like(uu)
    return np.stack([uu.ravel(), tt.ravel()], 1), sp.ravel()


def main(args):
    from frames import _camel_build as VB
    VB.build(args)
