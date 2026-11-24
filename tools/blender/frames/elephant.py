"""
ModCar frame 'elephant' (老象): a fictional flat-fronted 1986 motorhome (docs/V3/plan/rv.md, R2) — the Turtle's and the
Loaf's way of building (frames/turtle.py, frames/van.py) on a long, wide, tall box: a big windscreen over a square nose,
its petrol V8 at the back under the bed (a pusher: the engine lid low in the tail, the rear door over it), duals at the
back. Inside: the cab with its two seats and doors over the front wheels, a living room — the dinette and the galley
along the left wall, the entry door, a sofa and the fridge's place on the right — and the bedroom across the back,
the bed over the engine's deck. docs/MODCAR.md section 2.2.

    blender -b --factory-startup --python tools/blender/build.py -- frames/elephant [--no-preview] [--quick]

Writes public/models/modcar/frames/elephant.glb and src/core/modcar/data/mounts/elephant.json; previews go to
D:/modcar-scratch/frames/elephant/elephant_*.png. Blender axes: X forward, Y left, Z up.

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
    wb=5.20, ax_f=2.70, ax_r=-2.50, hub_z=0.39, track_f=2.00, track_r=1.84, wheel_r=0.39,
    # the box: plan rounded rectangle (nose face, tail face, half width, vertical corner radii) — square-nosed
    xf=4.10, xr=-4.10, hw=1.20, rho_f=0.30, rho_r=0.22,
    z_bot=0.50, roof_z=3.10, roof_crown=0.015,
    # the roll from the walls into the roof along the sides; the brow over the windscreen; the roll at the back
    r_side=0.30, r_brow=0.16, r_back=0.25,
    # the nose leans back above the windscreen's foot (by ws_lean degrees from vertical)
    ws_foot=1.55, ws_head=2.65, ws_lean=8.0, ws_hw=1.08, ws_r=0.10,
    # wheel arches (radius, centre height): the wells' liners fill them to the top
    arch_r=0.50, arch_zc=0.42,
    # colours: the paint below the waist, the second paint above
    waist_z=1.55,
    gap=0.005, edge_r=0.0022,
    # cab doors (over the front wheels) and their windows; the fixed quarter window ahead of them
    cd_x0=2.50, cd_x1=3.40, cd_z0=1.00, cd_z1=2.45, cd_r=0.06,
    cd_win=(2.58, 3.32, 1.66, 2.40, 0.07),
    q_x0=3.46, q_z0=1.66, q_z1=2.38,
    # side windows: on the left the dinette's and the galley's, on the right the sofa's, the bedroom's both sides
    win_mid=(1.00, 2.40, 1.72, 2.40, 0.09),
    win_gal=(-1.70, 0.40, 1.80, 2.40, 0.09),
    win_mid_r=(-1.70, 0.40, 1.72, 2.40, 0.09),
    win_rear=(-3.85, -2.25, 1.80, 2.40, 0.09),
    # the entry door on the right (modelled as a hinged panel, P_door_side) and its window
    sd_x0=0.55, sd_x1=1.40, sd_z0=0.66, sd_z1=2.55, sd_r=0.06,
    sd_win=(0.65, 1.30, 1.78, 2.35, 0.06),
    # the back: the top-hinged rear door and its window, the engine lid under it, the upright tail lamps
    tg_hw=0.78, tg_z0=1.48, tg_z1=2.78, tg_hinge=2.81, tg_r=0.10,
    tw_hw=0.66, tw_z0=1.95, tw_z1=2.66, tw_r=0.08,
    lid_hw=0.78, lid_z0=0.66, lid_z1=1.36, lid_r=0.06,
    tail_y=0.98, tail_z=1.10, tail_w=0.16, tail_h=0.42,
    # round head lamps on the nose, a pair each side
    lamp_y=0.80, lamp_z=1.05, lamp_d=0.24,
    # the fuel flap on the left side (x, z, radius), over the tank under the floor
    fuel=(0.10, 1.05, 0.06),
)
GAP = D['gap']
ER = D['edge_r']
DELTA = GAP / 2 + ER

# the wall's straight piece, where the loft's t is the height itself (t = T3 + z - Z_W0)
Z_W0 = 0.62
Z_W1 = 2.70

_WL = math.radians(D['ws_lean'])
PHI_F = _WL                     # the nose's lean from vertical at the brow


# ============================================================================================ exact surface (V)
# the nose: a little tucked under at the bottom, upright to the windscreen's foot, then leaning back
_front_lean = K.Spline([0.50, 0.54, 0.60, 0.70, 1.45, 1.55, 1.62, 1.72, 2.10, 2.65, 3.25],
                       [-0.022, -0.009, -0.002, 0.0, 0.0, -0.001, -0.006, -0.018, -0.071, -0.148, -0.232], monotone=True)
_rear_lean = K.Spline([0.50, 0.56, 0.64, 3.25], [-0.016, -0.004, 0.0, 0.0], monotone=True)


def front_lean(z):
    return _front_lean(z)


def rear_lean(z):
    return _rear_lean(z)


def side_w(x, z):
    """Half width of the side wall: a faint barrel, 5 mm in at the bottom and at the shoulder."""
    return D['hw'] - 0.006 * ((np.asarray(z, float) - 1.6) / 1.1) ** 2 - 0.004 * (np.asarray(x, float) / 4.0) ** 2


def front_x(ay, z):
    """The nose: bowed 2.5 cm in plan (square), leaning back above the windscreen's foot."""
    return D['xf'] - 0.025 * (np.minimum(ay, D['hw']) / D['hw']) ** 2 + front_lean(z)


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
    from frames import _elephant_build as VB
    VB.build(args)
