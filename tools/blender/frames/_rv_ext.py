"""RV exterior (left half; frames/_rv_build.py mirrors). The van cab: lower body and front clip (L) with the hood,
round headlamps, the front arch and one door per side whose lower front corner follows the arch, and the
greenhouse (G) up into the alcove's underside. The living module (B): flat sides with the windows, the entry
door (right), the fuel flap (left), the rear arch and the colour zones (skirt, waist band, pinstripe), and the
profile walls with the walk-through opening behind the cab, the rear window, the tail lamp recesses and the
rear locker hatch (left). The underside of the module is open between the skirts (the chassis shows)."""
import math
import sys

sys.dont_write_bytecode = True

import numpy as np  # noqa: E402

from frames import _kit as K  # noqa: E402
from frames import rv as S  # noqa: E402
from frames._sedan_ext import Path, interp_curve, side_dir  # noqa: E402

D = S.D
PI = math.pi
DELTA = S.DELTA
ER = S.ER

# colour zones: 0 = body (paint), 1 = band / pinstripe (paint_b), 2 = skirt (trim)
ZMAT = {0: 'paint', 1: 'paint_b', 2: 'trim'}
Z_SKIRT = D['skirt_top']
Z_BAND0 = 1.10
Z_BAND1 = float(S.l_z0z1(np.array([0.95]))[1][0])        # the cab's shoulder line
Z_PIN = (1.43, 1.46)
REAR_X = D['bx_r']
FRONT_X = D['bx_f']

# living module openings (side coordinates x, z); the right side is listed as seen in mirror (y > 0)
WIN_L = [('dinette', -0.62, 0.42, 1.56, 2.30, 0.08), ('galley', -1.78, -1.16, 1.70, 2.30, 0.07),
         ('lounge', -3.42, -2.56, 1.62, 2.30, 0.08), ('bunk', 1.24, 1.80, 2.38, 2.78, 0.08)]
WIN_R = [('wardrobe', -1.32, -0.74, 1.70, 2.30, 0.07), ('bath', -2.06, -1.70, 2.06, 2.34, 0.05),
         ('lounge', -3.42, -2.56, 1.62, 2.30, 0.08), ('bunk', 1.24, 1.80, 2.38, 2.78, 0.08)]
DOOR = dict(x0=-0.42, x1=0.24, z0=0.84, z1=2.62, r_bot=0.04, r_top=0.12)
DOOR_WIN = (-0.32, 0.14, 1.86, 2.40, 0.07)
FUEL = (-2.75, 1.00, 0.058)
TAIL = (0.745, 0.865, 0.95, 1.50, 0.022)         # y0, y1, z0, z1, r (rear wall)
HATCH = (0.14, 0.62, 0.90, 1.30, 0.035)          # y0, y1, z0, z1, r (rear wall, left half)
REAR_WIN = (0.55, 1.95, 2.45, 0.07)              # half width, z0, z1, r


def step_l(uv):
    t = uv[1]
    if S.L_T[3] - 0.004 < t < S.L_T[4] + 0.004 or S.L_T[1] - 0.004 < t < S.L_T[2] + 0.004:
        return 0.005
    return 0.03


class Cut:
    def __init__(self, chart, uv, closed, inner_sign, snap_ends=None):
        self.chart = chart
        self.uv = np.asarray(uv, float)
        self.closed = closed
        self.P, self.N = chart.to3d(self.uv)
        self.sides = {}
        for name, sgn in (('in', inner_sign), ('out', -inner_sign)):
            uvo = K.offset_loop2(self.uv, sgn * DELTA, closed)
            P, N = chart.to3d(uvo)
            if snap_ends is not None:
                uvo, P, N = snap_ends(uvo, P, N)
            E = side_dir(P, N, self.P, closed)
            self.sides[name] = dict(uv=uvo, P=P, N=N, E=E)

    def side(self, name):
        return self.sides[name]


# ============================================================================================ junction L / G
def junction():
    s = S.SG
    us = np.unique(np.concatenate([
        np.arange(s[0], s[1], 0.014), np.linspace(s[1], s[2], 16), np.arange(s[2], s[3], 0.014),
        np.linspace(s[3], s[4] - 1e-4, 6)]))
    ts = np.linspace(0.0, 0.24, 121)
    Lv = np.empty((len(ts), len(us)))
    for i, t in enumerate(ts):
        P, _ = S.CG.to3d(np.stack([us, np.full(len(us), t)], 1))
        Lv[i] = S.L_sdf(P)
    k = np.argmax(Lv > 0, axis=0)
    lo = ts[np.maximum(k - 1, 0)].copy()
    hi = ts[k].copy()
    for _ in range(28):
        mid = 0.5 * (lo + hi)
        P, _ = S.CG.to3d(np.stack([us, mid], 1))
        inside = S.L_sdf(P) < 0
        lo = np.where(inside, mid, lo)
        hi = np.where(inside, hi, mid)
    tJ = 0.5 * (lo + hi)
    uvG = np.stack([us, tJ], 1)
    P, NG = S.CG.to3d(uvG)
    NL = K.sdf_normals(S.L_sdf, P)
    uvL = S.CL.to2d(P)
    return dict(P=P, NG=NG, NL=NL, uvG=uvG, uvL=uvL)


class JLine:
    """Junction on the lower body loft's top strip from the crossing A at the A pillar foot back along the side
    to the cab's end at the box front."""

    def __init__(self, J):
        self.J = J
        tend = S.L_T[-1]
        uvL = J['uvL']
        on = (uvL[:, 1] < tend) & (J['P'][:, 0] < D['ws_x'] - 0.015)
        idx = np.nonzero(on)[0]
        i0 = int(idx[0])
        self.i0 = i0
        A = self._cross(i0 - 1, i0)
        self.A = A
        self.u = np.concatenate([[A[0][0]], uvL[i0:, 0]])
        self.t = np.concatenate([[tend], uvL[i0:, 1]])
        self.P = np.vstack([A[1], J['P'][i0:]])
        self.NL = np.vstack([A[2], J['NL'][i0:]])
        self.NG = np.vstack([A[3], J['NG'][i0:]])
        self.uvG = np.vstack([A[4], J['uvG'][i0:]])

    def _cross(self, ia, ib):
        J = self.J
        tend = S.L_T[-1]
        ta, tb = J['uvL'][ia, 1], J['uvL'][ib, 1]
        f = float(np.clip((tend - ta) / (tb - ta), 0, 1))
        uv = J['uvL'][ia] + (J['uvL'][ib] - J['uvL'][ia]) * f
        uv[1] = tend
        P = J['P'][ia] + (J['P'][ib] - J['P'][ia]) * f
        NL = K.unit(J['NL'][ia] + (J['NL'][ib] - J['NL'][ia]) * f)
        NG = K.unit(J['NG'][ia] + (J['NG'][ib] - J['NG'][ia]) * f)
        uvG = J['uvG'][ia] + (J['uvG'][ib] - J['uvG'][ia]) * f
        return uv, P, NL, NG, uvG

    def at(self, u):
        u = np.atleast_1d(np.asarray(u, float))
        t = np.interp(u, self.u, self.t)
        P = interp_curve(self.u, u, self.P)
        NL = K.unit(interp_curve(self.u, u, self.NL))
        NG = K.unit(interp_curve(self.u, u, self.NG))
        uvG = interp_curve(self.u, u, self.uvG)
        return t, P, NL, NG, uvG

    def between(self, ua, ub):
        lo, hi = min(ua, ub), max(ua, ub)
        inner = (self.u > lo + 1e-6) & (self.u < hi - 1e-6)
        us = np.concatenate([[lo], self.u[inner], [hi]])
        t, P, NL, NG, uvG = self.at(us)
        if ua > ub:
            t, P, NL, NG, uvG, us = t[::-1], P[::-1], NL[::-1], NG[::-1], uvG[::-1], us[::-1]
        return np.stack([us, t], 1), P, NL, NG, uvG


def snap_to_j(jl):
    def f(uv, P, N):
        uv = uv.copy()
        P = P.copy()
        N = N.copy()
        for i in (0, -1):
            t, Pj, NL, NG, _ = jl.at(uv[i, 0])
            uv[i, 1] = t[0]
            P[i] = Pj[0]
            N[i] = NL[0]
        return uv, P, N
    return f


def x_aside(z):
    w = S.g_side_w(z)
    return S.ws_x(w - D['rho_a'], z) - D['rho_a']


class GSide:
    def __init__(self, jl):
        self.jl = jl
        xs = jl.P[:, 0]
        m = jl.P[:, 1] > 0.5
        o = np.argsort(xs[m])
        self.jx = xs[m][o]
        self.jz = jl.P[m][o, 2]
        self.zr = D['rail_z']
        zJf = self.zJ(D['fd_front'])
        self.a_edge = float(x_aside(zJf) - D['fd_front'])

    def zJ(self, x):
        return np.interp(x, self.jx, self.jz)

    def a_edge_x(self, z):
        return x_aside(z) - self.a_edge

    def c_edge_x(self, z):
        z0 = self.zJ(D['cp_bot'])
        f = (np.asarray(z) - z0) / (self.zr - z0)
        return D['cp_bot'] + (D['cp_top'] - D['cp_bot']) * f

    def j_point(self, x):
        t, P, NL, NG, uvG = self.jl.at(S.u_of_x(x))
        return P[0], NG[0], uvG[0]


def snap_side_to_j(gs):
    def f(uv, P, N):
        uv = uv.copy()
        P = P.copy()
        N = N.copy()
        for i in (0, -1):
            Pj, NG, _ = gs.j_point(uv[i, 0])
            uv[i, 1] = Pj[2]
            P[i] = Pj
            N[i] = NG
        return uv, P, N
    return f


# ============================================================================================ profile helpers
def wall_u(x_wall, z):
    """Profile parameter of height z on a vertical wall of the profile (the box front or the rear)."""
    PR = S.B_PROXY
    m = np.abs(PR.P[:, 0] - x_wall) < 1e-6
    zs, ss = PR.P[m, 1], PR.s[m]
    o = np.argsort(zs)
    return np.interp(z, zs[o], ss[o])


def flat_u(z_flat, x, upper=False):
    """Profile parameter of x on a horizontal stretch of the profile at height z_flat (the bottom: the part
    ahead of the seam has small u, the part behind it large u)."""
    PR = S.B_PROXY
    m = np.abs(PR.P[:, 1] - z_flat) < 1e-6
    xs, ss = PR.P[m, 0], PR.s[m]
    if abs(z_flat - D['bz0']) < 1e-6:
        sel = ss > 0.5 * PR.length if upper else ss < 0.5 * PR.length
        xs, ss = xs[sel], ss[sel]
        if upper:
            xs = np.append(xs, D['seam_x'])
            ss = np.append(ss, PR.length)
    o = np.argsort(xs)
    return np.interp(x, xs[o], ss[o])


def rear_uv(yz):
    """Rear wall (y, z) -> B loft (u, t)."""
    yz = np.asarray(yz, float).reshape(-1, 2)
    return np.stack([wall_u(REAR_X, yz[:, 1]), S.bt_of_y(yz[:, 0], REAR_X, yz[:, 1])], 1)


def b_t_z(t):
    """Height above the profile line of the B loft's strip / fillet at parameter t on the bottom (z = bz0)."""
    t = np.asarray(t, float)
    r = D['r_edge']
    off = np.where(t < S.B_T[1], r + 0.02 * (1 - t / S.B_T[1]),
                   r - r * np.sin(np.clip((t - S.B_T[1]) / (S.B_T[2] - S.B_T[1]), 0, 1) * PI / 2))
    return D['bz0'] + off


def rrect(x0, x1, z0, z1, r, step=0.03, arc=0.008, rb=None):
    """Counter-clockwise rounded rectangle (optional different bottom radius)."""
    rb = r if rb is None else rb
    return K.rounded_poly(np.array([(x0, z0), (x1, z0), (x1, z1), (x0, z1)]), [rb, rb, r, r], step, arc_step=arc)


# ============================================================================================ the exterior
class Exterior:
    def __init__(self):
        self.J = junction()
        self.jl = JLine(self.J)
        self.us = S.l_u_samples()
        self.ts = S.l_t_samples()
        self.u_end = float(S.SL[4])
        self.t_band = (float(S.t_of_z(0.95, Z_BAND0)), float(S.L_T[3]))
        self.u_band_front = 0.80
        self.cut = {}
        self._rows()
        self._door_cuts()
        self._hood()
        self._gcuts()
        self._openings()
        self._box()

    # ------------------------------------------------------------------ cab cuts
    def _rows(self):
        tend = S.L_T[-1]
        us = self.us
        uA = self.jl.A[0][0]
        a = us[us < uA - 1e-4]
        self.row_front_uv = np.stack([np.concatenate([a, [uA]]), np.full(len(a) + 1, tend)], 1)
        P, N = S.CL.to3d(self.row_front_uv)
        P[-1] = self.jl.A[1]
        N[-1] = self.jl.A[2]
        self.row_front_P, self.row_front_N = P, N

    def _door_cuts(self):
        """Cab door outline on the lower body: front edge down from the belt, then round the front wheel arch
        (r 0.50 about the axle), along the sill and up the rear edge."""
        jl = self.jl
        xa, za, R = D['ax_f'], D['hub_z'], D['door_notch_r']
        xF, xR, zb = D['fd_front'], D['fd_rear'], D['door_bot']
        uF = float(S.u_of_x(xF))
        uR = float(S.u_of_x(xR))
        zn = za + math.sqrt(R * R - (xF - xa) ** 2)
        a0 = math.atan2(zn - za, xF - xa)
        xe = xa - math.sqrt(R * R - (zb - za) ** 2)
        a1 = math.atan2(zb - za, xe - xa)
        aa = np.linspace(a0, a1, 18)
        ax_, az_ = xa + R * np.cos(aa), za + R * np.sin(aa)
        arc = np.stack([S.u_of_x(ax_), S.t_of_z(ax_, az_)], 1)
        tb = float(S.t_of_z(xR, zb))
        arc[-1, 1] = tb
        pts = np.vstack([[(uF, jl.at(uF)[0][0])], arc, [(uR, tb), (uR, jl.at(uR)[0][0])]])
        radii = np.zeros(len(pts))
        radii[1] = 0.035
        radii[len(arc)] = 0.04
        radii[len(arc) + 1] = 0.03
        uv = K.rounded_poly(pts, radii, 0.03, closed=False, arc_step=0.007)
        uv = K.densify(uv, step_l, closed=False)
        self.cut['doorL'] = Cut(S.CL, uv, False, +1.0, snap_to_j(jl))

    def _hood(self):
        hr = D['hood_rear']
        hw = D['hood_w']
        rp = self.row_front_P
        m = rp[:, 0] > 2.5
        o = np.argsort(rp[m, 1])
        ry, rx = rp[m, 1][o], rp[m, 0][o]
        ys = np.linspace(hw - 0.07, 0.0, 12)
        xf = np.interp(ys, ry, rx) - 0.012
        pts = np.vstack([[(hr, 0.0), (hr, hw), (xf[0], hw)], np.stack([xf, ys], 1)[1:]])
        radii = np.zeros(len(pts))
        radii[1] = 0.02
        radii[2] = 0.07
        uv = K.rounded_poly(pts, radii, 0.04, closed=False, arc_step=0.01)
        self.cut['hood'] = Cut(S.CT, uv, False, -1.0)

    def _gcuts(self):
        gs = self.gs = GSide(self.jl)
        zr = gs.zr
        bp = D['cp_bot']
        zs = np.linspace(float(gs.zJ(D['fd_front'])), zr, 12)
        edge = np.stack([gs.a_edge_x(zs), zs], 1)[::-1]
        zc = np.linspace(float(gs.zJ(bp)), zr, 4)
        cedge = np.stack([gs.c_edge_x(zc), zc], 1)
        pts = np.vstack([cedge[:-1], [(float(gs.c_edge_x(zr)), zr)], edge])
        radii = np.zeros(len(pts))
        radii[len(cedge) - 1] = 0.035
        radii[len(cedge)] = 0.07
        uv = K.rounded_poly(pts, radii, 0.03, closed=False, arc_step=0.008)
        self.cut['doorG'] = Cut(S.SIDE_G, uv, False, -1.0, snap_side_to_j(gs))
        band = 0.028
        zb = float(gs.zJ(1.3)) + 0.018
        zr_in = zr - band
        z0 = float(gs.zJ(D['fd_front']))
        ang = math.atan2(float(gs.a_edge_x(zr) - gs.a_edge_x(z0)), zr - z0)
        off = band / math.cos(ang)
        za = np.linspace(zr_in, zb, 6)
        xr_ = float(gs.c_edge_x(zb)) + band
        win = np.vstack([[(xr_, zb), (float(gs.c_edge_x(zr_in)) + band, zr_in)], np.stack([gs.a_edge_x(za) - off, za], 1)])
        radii = [0.012, 0.03, 0.06, 0, 0, 0, 0, 0.012]
        loop = K.ccw(K.rounded_poly(win, radii, 0.03, arc_step=0.008))
        self.cut['winG'] = [('main', loop)]
        self.win = {}
        ch, uvw, sgn = self.window_opening()
        P, N = ch.to3d(uvw)
        self.win['ws'] = dict(chart=ch, uv=uvw, P=P, N=N, sgn=sgn)

    def window_opening(self):
        J = self.J
        O = np.array([float(S.ws_x(0.0, D['belt_z'])), 0.0, D['belt_z']])
        e2 = np.array([-math.cos(S._WR), 0.0, math.sin(S._WR)])
        ch = K.FrameChart(S.G_sdf, O, (0, 1.0, 0), e2)
        s_ang = S._WR
        zj = float(J['P'][0, 2])
        rr = D['rho_a']
        sb = (zj - D['belt_z']) / math.sin(s_ang) + 0.03
        st = (D['ws_top'] - D['belt_z']) / math.sin(s_ang)
        ss = np.linspace(sb, st, 10)
        zz = D['belt_z'] + ss * math.sin(s_ang)
        ye = S.g_side_w(zz) - rr - 0.03
        side = np.stack([ye, ss], 1)
        pts = np.vstack([[(0.0, st)], side[::-1], [(0.0, sb)]])
        radii = np.zeros(len(pts))
        radii[1] = 0.07
        radii[-2] = 0.045
        uv = K.rounded_poly(pts, radii, 0.035, closed=False, arc_step=0.01)
        return ch, uv, 1.0

    def _openings(self):
        self.open = {}
        gw, z0, z1 = D['grille_w'], D['grille_z0'], D['grille_z1']
        g = K.rounded_poly(np.array([(0.0, z1), (gw, z1), (gw, z0), (0.0, z0)]), [0, 0.03, 0.03, 0], 0.03, closed=False, arc_step=0.007)
        P, N = S.FRONT_L.to3d(g)
        self.open['grille'] = dict(uv=S.CL.to2d(P), P=P, N=N, yz=g)
        c = K.circle_loop(D['lamp_y'], D['lamp_z'], D['lamp_d'] / 2, 0.012)
        P, N = S.FRONT_L.to3d(c)
        self.open['lamp'] = dict(uv=S.CL.to2d(P), P=P, N=N, yz=c)

    # ------------------------------------------------------------------ cab regions
    def _l_lines(self):
        t0, t1 = self.t_band
        u0, u1 = self.u_band_front, self.u_end
        return [(1, t0, u0, u1), (1, t1, u0, u1), (0, u0, t0, t1)]

    def _l_zone(self, cen):
        t0, t1 = self.t_band
        return np.where((cen[:, 1] > t0) & (cen[:, 1] < t1) & (cen[:, 0] > self.u_band_front), 1, 0)

    def arch_notch(self, xa):
        R = D['arch_f']
        za = D['hub_z']
        zb = float(S._bot(xa))
        th = math.asin((zb - za) / R)
        ths = np.linspace(th, PI - th, 46)
        ax = xa + R * np.cos(ths)
        az = za + R * np.sin(ths)
        uv = np.stack([S.u_of_x(ax), S.t_of_z(ax, az)], 1)
        down = np.linspace(S.L_T[0], S.L_T[1], 3)
        front = np.stack([np.full(len(down), uv[0, 0]), down], 1)
        rear = np.stack([np.full(len(down), uv[-1, 0]), down[::-1]], 1)
        return np.vstack([front[:-1], uv, rear[1:]])

    def lower_body(self):
        tend = S.L_T[-1]
        us, ts = self.us, self.ts
        ue = self.u_end
        p = Path()
        nt = self.arch_notch(D['ax_f'])
        seg = us[us < nt[0, 0] - 1e-4]
        p.add(np.stack([seg, np.full(len(seg), S.L_T[0])], 1))
        P, N = S.CL.to3d(nt)
        self.arch_P = [(P, N)]
        p.add(nt, P, N)
        seg = us[(us > nt[-1, 0] + 1e-4) & (us < ue - 1e-4)]
        p.add(np.stack([np.concatenate([seg, [ue]]), np.full(len(seg) + 1, S.L_T[0])], 1))
        tj = float(self.jl.at(ue)[0][0])
        tt = ts[(ts > S.L_T[0] + 1e-4) & (ts < tj - 0.004)]
        p.add(np.stack([np.full(len(tt), ue), tt], 1))
        # the cab's rear edge at the box front (for the seal)
        rp_uv = np.vstack([[(ue, S.L_T[0])], np.stack([np.full(len(tt), ue), tt], 1)])
        self.rear_edge = S.CL.to3d(rp_uv)
        out = self.cut['doorL'].side('out')
        uv, P, NL, NG, _ = self.jl.between(ue, out['uv'][-1, 0])
        p.add(uv, P, NL, drop_last=True)
        p.add(out['uv'][::-1], out['P'][::-1], out['N'][::-1])
        self.opening_out = dict(uv=out['uv'][::-1], P=out['P'][::-1], N=out['N'][::-1])
        uv, P, NL, NG, _ = self.jl.between(out['uv'][0, 0], self.jl.A[0][0])
        p.add(uv, P, NL, drop_first=True, drop_last=True)
        p.add(self.row_front_uv[::-1], self.row_front_P[::-1], self.row_front_N[::-1])
        gr = self.open['grille']
        tt = ts[(ts > gr['uv'][0, 1] + 0.004) & (ts < tend)][::-1]
        p.add(np.stack([np.zeros(len(tt)), tt], 1))
        p.add(gr['uv'], gr['P'], gr['N'])
        tt = ts[(ts > S.L_T[0]) & (ts < gr['uv'][-1, 1] - 0.004)][::-1]
        p.add(np.stack([np.zeros(len(tt)), tt], 1))
        loop = p.loop()
        lp = self.open['lamp']
        holes = [K.Loop(lp['uv'], lp['P'], lp['N'])]
        pts, sp = S.grid_from(us[us <= ue], ts)
        V, N, T, Z = K.mesh_region_split(S.CL, [loop], holes, pts, lines=self._l_lines(), zone_fn=self._l_zone, spacing=sp)
        return K.add_zones(K.Buf(), V, N, T, Z, ZMAT)

    def door_skin(self):
        s = self.cut['doorL'].side('in')
        p = Path()
        p.add(s['uv'], s['P'], s['N'])
        uv, P, NL, NG, _ = self.jl.between(s['uv'][-1, 0], s['uv'][0, 0])
        p.add(uv, P, NL, drop_first=True, drop_last=True)
        pts, sp = S.grid_from(self.us, self.ts)
        V, N, T, Z = K.mesh_region_split(S.CL, [p.loop()], [], pts, lines=self._l_lines(), zone_fn=self._l_zone, spacing=sp)
        return K.add_zones(K.Buf(), V, N, T, Z, ZMAT)

    def top_front(self):
        J = self.J
        i0 = self.jl.i0
        out = self.cut['hood'].side('out')
        p = Path()
        p.add(self.row_front_P[:, :2], self.row_front_P, self.row_front_N)
        p.add(J['P'][:i0][::-1, :2], J['P'][:i0][::-1], J['NL'][:i0][::-1])
        x0 = J['P'][0, 0]
        x1 = out['uv'][0, 0]
        xs = np.linspace(x0, x1, max(2, int((x1 - x0) / 0.02) + 1))[1:-1]
        p.add(np.stack([xs, np.zeros(len(xs))], 1))
        p.add(out['uv'], out['P'], out['N'])
        x2 = out['uv'][-1, 0]
        x3 = self.row_front_P[0, 0]
        xs = np.linspace(x2, x3, max(2, int(abs(x3 - x2) / 0.01) + 1))[1:-1]
        p.add(np.stack([xs, np.zeros(len(xs))], 1))
        xg, yg = np.meshgrid(np.arange(1.80, 2.95, 0.05), np.arange(0.0, 1.0, 0.04), indexing='ij')
        g = np.stack([xg.ravel(), yg.ravel()], 1)
        V, N, T = K.mesh_region(S.CT, [p.loop()], [], g, spacing=0.04)
        return K.Buf().add(V, N, T, 'paint')

    def hood(self):
        s = self.cut['hood'].side('in')
        p = Path()
        p.add(s['uv'], s['P'], s['N'])
        x0 = s['uv'][-1, 0]
        x1 = s['uv'][0, 0]
        xs = np.linspace(x0, x1, max(2, int(abs(x1 - x0) / 0.04) + 1))[1:-1]
        p.add(np.stack([xs, np.zeros(len(xs))], 1))
        bb = s['uv']
        xg, yg = np.meshgrid(np.arange(bb[:, 0].min() - 0.05, bb[:, 0].max() + 0.05, 0.06), np.arange(0.0, 0.85, 0.06), indexing='ij')
        g = np.stack([xg.ravel(), yg.ravel()], 1)
        V, N, T = K.mesh_region(S.CT, [p.loop()], [], g, spacing=0.06)
        return K.Buf().add(V, N, T, 'paint')

    def greenhouse(self, level=0.0):
        """Pillars, header and B pillar from the junction up into the alcove's underside (the part above 2.14 m
        is hidden in the alcove); level < 0: the same region that far inside, facing the cab."""
        J = self.J
        gus = S.g_u_samples()
        gts = S.g_t_samples()
        ug_end = float(S.SG[4]) - 1e-4
        t_top = float(S.g_t_of_z(2.165))
        fo = self.cut['doorG'].side('out')
        ws = self.win['ws']
        p = Path()
        uv_f = S.CG.to2d(fo['P'])
        ua = uv_f[-1, 0]
        m = J['uvG'][:, 0] < ua - 1e-4
        p.add(J['uvG'][m], J['P'][m], J['NG'][m])
        p.add(uv_f[::-1], fo['P'][::-1], fo['N'][::-1])
        m = (J['uvG'][:, 0] > uv_f[0, 0] + 1e-4) & (J['uvG'][:, 0] < ug_end - 1e-4)
        p.add(J['uvG'][m], J['P'][m], J['NG'][m])
        tj_end = float(np.interp(ug_end, J['uvG'][:, 0], J['uvG'][:, 1]))
        tt = gts[(gts > tj_end + 0.004) & (gts < t_top - 0.004)]
        p.add(np.stack([np.full(len(tt) + 2, ug_end), np.concatenate([[tj_end], tt, [t_top]])], 1))
        uu = gus[gus < ug_end - 1e-4][::-1]
        p.add(np.stack([uu, np.full(len(uu), t_top)], 1))
        ws_uv = S.CG.to2d(ws['P'])
        tt = gts[(gts > ws_uv[0, 1] + 0.004) & (gts < t_top - 0.004)][::-1]
        p.add(np.stack([np.zeros(len(tt)), tt], 1))
        p.add(ws_uv, ws['P'], ws['N'])
        tt = gts[(gts < ws_uv[-1, 1] - 0.004) & (gts > J['uvG'][0, 1] + 0.004)][::-1]
        p.add(np.stack([np.zeros(len(tt)), tt], 1))
        loop = p.loop()
        if level < 0:
            loop = K.Loop(K.resample(loop.uv, 0.035, closed=True))
            cu = np.linspace(0, ug_end, int(ug_end / 0.09))
            ct = np.linspace(S.G_T[0], t_top, 9)
            pts, sp = S.grid_from(cu, ct)
            V, N, T = K.mesh_region(S.CG, [loop], [], pts, spacing=sp, level=level)
            return K.Buf().add(V, -N, T, 'plastic_int')
        sel_u = gus[gus < ug_end]
        sel_t = gts[gts < t_top]
        pts, sp = S.grid_from(sel_u, sel_t)
        V, N, T = K.mesh_region(S.CG, [loop], [], pts, spacing=sp)
        return K.Buf().add(V, N, T, 'paint')

    def door_frame(self):
        s = self.cut['doorG'].side('in')
        gs = self.gs
        p = Path()
        p.add(S.CG.to2d(s['P']), s['P'], s['N'])
        x0 = s['uv'][-1, 0]
        x1 = s['uv'][0, 0]
        xs = np.linspace(x0, x1, max(2, int(abs(x1 - x0) / 0.012) + 1))[1:-1]
        if len(xs):
            Pj = np.array([gs.j_point(x)[0] for x in xs])
            Nj = np.array([gs.j_point(x)[1] for x in xs])
            p.add(S.CG.to2d(Pj), Pj, Nj)
        holes = []
        self.win_P = {}
        for name, poly in self.cut['winG']:
            P, N = S.SIDE_G.to3d(poly)
            holes.append(K.Loop(S.CG.to2d(P), P, N))
            self.win_P[name] = (poly, P, N)
        gus = S.g_u_samples()
        us = np.linspace(gus.min(), gus.max(), int((gus.max() - gus.min()) / 0.02))
        pts, sp = S.grid_from(us, S.g_t_samples())
        V, N, T = K.mesh_region(S.CG, [p.loop()], holes, pts, spacing=sp)
        return K.Buf().add(V, N, T, 'paint')

    def glass(self):
        out = {}
        wv = self.win['ws']
        ch, uv, sgn = wv['chart'], wv['uv'], wv['sgn']
        big = K.offset_loop2(uv, sgn * 0.014, closed=False)
        big[0, 0] = 0.0
        big[-1, 0] = 0.0
        ss = np.linspace(big[-1, 1], big[0, 1], 20)[1:-1]
        loop = np.vstack([big, np.stack([np.zeros(len(ss)), ss], 1)])
        g = K.grid_points(-1.0, 1.0, -0.2, 1.0, 0.10, dt=0.10)
        V, N, T = K.mesh_region(ch, [K.Loop(K.resample_keep(loop, 0.05))], [], g, spacing=0.10, level=-0.007)
        out['ws'] = K.Buf().add(V, N, T, 'glass')
        b = K.Buf()
        for name, poly in self.cut['winG']:
            big = K.offset_loop2(poly, -0.012)
            g = K.grid_points(0.9, 2.0, 1.3, 2.1, 0.10, dt=0.10)
            V, N, T = K.mesh_region(S.SIDE_G, [K.Loop(big)], [], g, spacing=0.10, level=-0.012)
            b.add(V, N, T, 'glass')
        out['door'] = b
        return out

    # ------------------------------------------------------------------ living module
    def _box(self):
        BX = self.box = {}
        PR = S.B_PROXY
        UB = PR.length
        BT3 = float(S.B_T[3])
        self.UB, self.BT3 = UB, BT3
        xa, za, R = D['ax_r'], D['hub_z'], D['arch_r']
        z_face = float(b_t_z(0.0))                    # height of the side face's bottom boundary
        z_wall = float(b_t_z(S.B_T[2]))               # the bottom wall (= bz0)
        self.x_ar = xa - math.sqrt(R * R - (z_face - za) ** 2)
        self.x_af = xa + math.sqrt(R * R - (z_face - za) ** 2)
        self.x_wr = xa - math.sqrt(R * R - (z_wall - za) ** 2)
        self.x_wf = xa + math.sqrt(R * R - (z_wall - za) ** 2)
        # landmarks along the profile
        L = {}
        L['ar'] = float(flat_u(D['bz0'], self.x_ar, upper=True))
        L['af'] = float(flat_u(D['bz0'], self.x_af, upper=True))
        L['wr'] = float(flat_u(D['bz0'], self.x_wr, upper=True))
        L['wf'] = float(flat_u(D['bz0'], self.x_wf, upper=True))
        L['fb'] = float(flat_u(D['bz0'], D['bx_f'] - D['r_box_fb']))
        L['rb'] = float(flat_u(D['bz0'], D['bx_r'] + D['r_box_rb'], upper=True))
        L['ch0'] = float(wall_u(FRONT_X, D['box_floor']))
        self.lm = L
        zl = [Z_SKIRT, Z_BAND0, Z_BAND1, Z_PIN[0], Z_PIN[1]]
        self.u_f = {z: float(wall_u(FRONT_X, z)) for z in zl}
        self.u_r = {z: float(wall_u(REAR_X, z)) for z in zl}
        # t of the open bottom's inner edge (a 6 cm return flange under the skirt) and of the band's end at the rear
        self.t_flange = float(S.bt_of_y(S.b_half_w(D['bz0']) - S.r_edge(-1.0) - 0.06, -1.0, D['bz0']))
        self.t_band_end = float(S.bt_of_y(TAIL[1] + 0.02, REAR_X, 1.2))
        # the shared row t = 0 (side face boundary)
        bus = S.b_u_samples()
        extra = [L['ar'], L['af'], L['fb'], L['rb']] + list(self.u_f.values()) + list(self.u_r.values())
        row_u = np.unique(np.concatenate([bus, extra]))
        row_u = row_u[(row_u <= L['ar'] + 1e-9) | (row_u >= L['af'] - 1e-9)]
        P0, N0 = S.CB.to3d(np.stack([row_u, np.zeros(len(row_u))], 1))
        self.row0 = dict(u=row_u, P=P0, N=N0)
        # rear arch on the side face (over the top) and in the strip / fillet / flange of the loft
        a_r = math.atan2(z_face - za, self.x_ar - xa)
        a_f = math.atan2(z_face - za, self.x_af - xa)
        aa = np.linspace(a_r, a_f, 40)
        arc = np.stack([xa + R * np.cos(aa), za + R * np.sin(aa)], 1)
        Pa, Na = S.SIDE_B.to3d(arc)
        Pa[0] = P0[np.argmin(np.abs(row_u - L['ar']))]
        Pa[-1] = P0[np.argmin(np.abs(row_u - L['af']))]
        BX['arch_face'] = dict(xz=arc, P=Pa, N=Na)
        tt = np.linspace(0.0, S.B_T[2], 12)
        zt = b_t_z(tt)
        xr_ = xa - np.sqrt(R * R - (zt - za) ** 2)
        xf_ = xa + np.sqrt(R * R - (zt - za) ** 2)
        tf = np.linspace(S.B_T[2], self.t_flange, 3)[1:]
        rear_c = np.vstack([np.stack([flat_u(D['bz0'], xr_, upper=True), tt], 1), np.stack([np.full(2, L['wr']), tf], 1)])
        front_c = np.vstack([np.stack([flat_u(D['bz0'], xf_, upper=True), tt], 1), np.stack([np.full(2, L['wf']), tf], 1)])
        rear_c[0, 0] = L['ar']
        front_c[0, 0] = L['af']
        BX['arch_rear'] = (rear_c,) + S.CB.to3d(rear_c)
        BX['arch_front'] = (front_c,) + S.CB.to3d(front_c)
        # walk-through opening behind the cab
        BX['cab'] = self._cab_outline()
        # rear wall: window notch at the centre line, tail lamp recess
        hw_, z0, z1, rr = REAR_WIN
        win = K.rounded_poly(np.array([(0.0, z0), (hw_, z0), (hw_, z1), (0.0, z1)]), [0, rr, rr, 0], 0.03, closed=False, arc_step=0.01)
        P, N = S.REAR_B.to3d(win)
        BX['rear_win'] = dict(yz=win, uv=rear_uv(win), P=P, N=N)
        y0, y1, z0, z1, r = TAIL
        tl = rrect(y0, y1, z0, z1, r, 0.03, 0.006)
        P, N = S.REAR_B.to3d(tl)
        BX['tail'] = dict(yz=tl, uv=rear_uv(tl), P=P, N=N)
        # rear locker hatch (left half), cut on the rear wall
        y0, y1, z0, z1, r = HATCH
        self.cut['hatch'] = Cut(S.REAR_B, rrect(y0, y1, z0, z1, r, 0.03, 0.007), True, +1.0)
        # side openings
        BX['win'] = {}
        for side, lst in (('L', WIN_L), ('R', WIN_R)):
            for (name, x0, x1, z0, z1, r) in lst:
                BX['win'][(side, name)] = rrect(x0, x1, z0, z1, r, 0.03, 0.008)
        d = DOOR
        self.cut['door_side'] = Cut(S.SIDE_B, rrect(d['x0'], d['x1'], d['z0'], d['z1'], d['r_top'], 0.03, 0.008, rb=d['r_bot']), True, +1.0)
        x0, x1, z0, z1, r = DOOR_WIN
        BX['door_win'] = rrect(x0, x1, z0, z1, r, 0.03, 0.008)
        fx, fz, fr = FUEL
        self.cut['fuel'] = Cut(S.SIDE_B, K.circle_loop(fx, fz, fr, 0.009), True, +1.0)

    def _cab_outline(self):
        """Outline of the cab's section where it enters the living module, on the B loft: up the box front from
        the box floor (the cab's lower body / greenhouse sides), through the concave fillet and along the alcove's
        underside to the windscreen's centre. Returns uv (from the windscreen centre back to the floor end), P, N."""
        PR = S.B_PROXY

        def cab_sdf(P):
            return np.minimum(S.L_sdf(P), S.G_sdf(P))

        # front wall and fillet: bisection on y at each profile point
        u0 = self.lm['ch0']
        x_fil = D['bx_f'] + D['r_under']
        u1 = float(flat_u(D['al_z0'], x_fil))
        us = np.unique(np.concatenate([np.arange(u0, u1, 0.02), [u1],
                                       wall_u(FRONT_X, np.linspace(D['belt_z'] - 0.05, D['belt_z'] + 0.03, 21))]))
        us = us[(us >= u0) & (us <= u1)]
        x, z, nx, nz = PR.at(us)
        x = np.maximum(x, D['bx_f'] + 0.001)
        lo = np.zeros(len(us))
        hi = np.full(len(us), 1.12)
        for _ in range(40):
            mid = 0.5 * (lo + hi)
            ins = cab_sdf(np.stack([x, mid, z], 1)) < 0
            lo = np.where(ins, mid, lo)
            hi = np.where(ins, hi, mid)
        y = 0.5 * (lo + hi)
        uv_w = np.stack([us, S.bt_of_y(y, x, z)], 1)
        # alcove underside: the greenhouse's section at the underside's height
        uf = np.linspace(0.0, (S.SG[3] / S.G_GUIDE.length), 400)
        gx, gy, _, _ = S.g_contour(uf, np.full(len(uf), D['al_z0']))
        m = gx > x_fil + 1e-4
        gx, gy = gx[m], gy[m]
        uv_u = np.stack([flat_u(D['al_z0'], gx), S.bt_of_y(gy, gx, D['al_z0'])], 1)
        uv_u = K.resample_keep(uv_u, 0.02, closed=False)
        uv = np.vstack([uv_u, uv_w[::-1]])
        uv[0, 1] = self.BT3
        P, N = S.CB.to3d(uv)
        return dict(uv=uv, P=P, N=N)

    def box_loft_loops(self, hatch):
        """Outer loops and holes of the B loft region (left half; hatch=True cuts the locker hatch)."""
        BX = self.box
        L = self.lm
        BT3, UB = self.BT3, self.UB
        r0 = self.row0
        bts = S.b_t_samples()
        bus = S.b_u_samples()
        tf = self.t_flange
        ft = bts[(bts > 1e-6) & (bts < tf - 1e-4)]
        main = Path()
        m = r0['u'] <= L['ar'] + 1e-9
        main.add(np.stack([r0['u'][m], np.zeros(int(m.sum()))], 1), r0['P'][m], r0['N'][m])
        rc, Pc, Nc = BX['arch_rear']
        main.add(rc, Pc, Nc, drop_first=True)
        uu = bus[(bus < L['wr'] - 1e-4) & (bus > L['rb'] + 1e-4)][::-1]
        main.add(np.stack([np.concatenate([uu, [L['rb']]]), np.full(len(uu) + 1, tf)], 1))
        tt = bts[(bts > tf + 1e-4) & (bts < BT3 - 1e-4)]
        main.add(np.stack([np.full(len(tt) + 1, L['rb']), np.concatenate([tt, [BT3]])], 1))
        # centre line up the rear wall (u decreasing) with the rear window notch, over the roof and the nose
        rw = BX['rear_win']
        u_w0, u_w1 = rw['uv'][0, 0], rw['uv'][-1, 0]
        uu = bus[(bus < L['rb'] - 1e-4) & (bus > u_w0 + 1e-4)][::-1]
        main.add(np.stack([uu, np.full(len(uu), BT3)], 1))
        main.add(rw['uv'], rw['P'], rw['N'])
        cab = BX['cab']
        uu = bus[(bus < u_w1 - 1e-4) & (bus > cab['uv'][0, 0] + 1e-4)][::-1]
        main.add(np.stack([uu, np.full(len(uu), BT3)], 1))
        main.add(cab['uv'], cab['P'], cab['N'])
        u_c0 = cab['uv'][-1, 0]
        tt = bts[(bts > cab['uv'][-1, 1] + 1e-4) & (bts < BT3 - 1e-4)]
        main.add(np.stack([np.full(len(tt) + 1, u_c0), np.concatenate([tt, [BT3]])], 1))
        uu = bus[(bus < u_c0 - 1e-4) & (bus > L['fb'] + 1e-4)][::-1]
        main.add(np.stack([np.concatenate([uu, [L['fb']]]), np.full(len(uu) + 1, BT3)], 1))
        tt = bts[(bts > tf + 1e-4) & (bts < BT3 - 1e-4)][::-1]
        main.add(np.stack([np.full(len(tt) + 1, L['fb']), np.concatenate([tt, [tf]])], 1))
        uu = bus[(bus < L['fb'] - 1e-4) & (bus > 1e-6)][::-1]
        main.add(np.stack([np.concatenate([uu, [0.0]]), np.full(len(uu) + 1, tf)], 1))
        main.add(np.stack([np.zeros(len(ft)), ft[::-1]], 1))
        # the flange piece ahead of the arch, behind the seam
        front = Path()
        m = r0['u'] >= L['af'] - 1e-9
        front.add(np.stack([r0['u'][m], np.zeros(int(m.sum()))], 1), r0['P'][m], r0['N'][m])
        if r0['u'][m][-1] < UB - 1e-6:
            front.add(np.array([(UB, 0.0)]), r0['P'][:1], r0['N'][:1])
        front.add(np.stack([np.full(len(ft), UB), ft], 1))
        uu = bus[(bus < UB - 1e-4) & (bus > L['wf'] + 1e-4)][::-1]
        front.add(np.stack([np.concatenate([[UB], uu]), np.full(len(uu) + 1, tf)], 1))
        fc, Pf, Nf = BX['arch_front']
        front.add(fc[::-1], Pf[::-1], Nf[::-1], drop_last=True)
        holes = [K.Loop(BX['tail']['uv'], BX['tail']['P'], BX['tail']['N'])]
        if hatch:
            so = self.cut['hatch'].side('out')
            holes.append(K.Loop(rear_uv(so['uv']), so['P'], so['N']))
        return [main.loop(), front.loop()], holes

    def _b_lines(self):
        uf, ur = self.u_f, self.u_r
        BT3, te = self.BT3, self.t_band_end
        lines = [(0, uf[Z_SKIRT], 0.0, BT3), (0, ur[Z_SKIRT], 0.0, BT3)]
        for zz in (Z_BAND0, Z_BAND1, Z_PIN[0], Z_PIN[1]):
            lines += [(0, uf[zz], 0.0, BT3), (0, ur[zz], 0.0, te)]
        lines += [(1, te, ur[Z_BAND1], ur[Z_BAND0]), (1, te, ur[Z_PIN[1]], ur[Z_PIN[0]])]
        return lines

    def _b_zone(self, cen):
        u, t = cen[:, 0], cen[:, 1]
        uf, ur = self.u_f, self.u_r
        z = np.zeros(len(u), np.int64)
        band = ((u > uf[Z_BAND0]) & (u < uf[Z_BAND1])) | ((u > uf[Z_PIN[0]]) & (u < uf[Z_PIN[1]]))
        rear = ((u > ur[Z_BAND1]) & (u < ur[Z_BAND0])) | ((u > ur[Z_PIN[1]]) & (u < ur[Z_PIN[0]]))
        band |= rear & (t < self.t_band_end)
        z[band] = 1
        z[(u > ur[Z_SKIRT]) | (u < uf[Z_SKIRT])] = 2
        return z

    def box_loft(self, hatch=True, level=0.0):
        outer, holes = self.box_loft_loops(hatch)
        bus = S.b_u_samples()
        bts = S.b_t_samples()
        if level < 0:
            outer = [K.Loop(K.resample(o.uv, 0.06, closed=True)) for o in outer]
            holes = [K.Loop(h.uv) for h in holes]
            pts, sp = S.grid_from(bus[::2], bts[::2])
            uf, ur = self.u_f, self.u_r
            u_low_f = float(wall_u(FRONT_X, D['box_floor'] - 0.06))
            u_low_r = float(wall_u(REAR_X, D['box_floor'] - 0.06))
            u_roof0 = float(flat_u(D['bz1'], D['al_f'] - D['nose_rt']))
            u_roof1 = float(flat_u(D['bz1'], D['bx_r'] + D['r_box_rt']))
            lines = [(0, u_low_f, 0.0, self.BT3), (0, u_low_r, 0.0, self.BT3), (0, u_roof0, 0.0, self.BT3), (0, u_roof1, 0.0, self.BT3)]

            def zf(c):
                u = c[:, 0]
                z = np.zeros(len(u), np.int64)
                z[(u > u_roof0) & (u < u_roof1)] = 2
                z[(u > u_low_r) | (u < u_low_f)] = 1
                return z
            V, N, T, Z = K.mesh_region_split(S.CB, outer, holes, pts, lines=lines, zone_fn=zf, spacing=sp, level=level)
            return K.add_zones(K.Buf(), V, N, T, Z, {0: 'wood', 1: 'trim', 2: 'fabric'}, flip=True)
        pts, sp = S.grid_from(bus, bts)
        V, N, T, Z = K.mesh_region_split(S.CB, outer, holes, pts, lines=self._b_lines(), zone_fn=self._b_zone, spacing=sp)
        return K.add_zones(K.Buf(), V, N, T, Z, ZMAT)

    def side_face_loop(self):
        r0 = self.row0
        L = self.lm
        af = self.box['arch_face']
        m1 = r0['u'] <= L['ar'] + 1e-9
        m2 = (r0['u'] >= L['af'] - 1e-9) & (r0['u'] < self.UB - 1e-9)
        p = Path()
        p.add(r0['P'][m1][:, [0, 2]], r0['P'][m1], r0['N'][m1])
        p.add(af['xz'][1:-1], af['P'][1:-1], af['N'][1:-1])
        p.add(r0['P'][m2][:, [0, 2]], r0['P'][m2], r0['N'][m2])
        return p.loop()

    @staticmethod
    def _s_lines():
        return [(1, z, -4.6, 2.6) for z in (Z_SKIRT, Z_BAND0, Z_BAND1, Z_PIN[0], Z_PIN[1])]

    @staticmethod
    def _s_zone(cen):
        z = cen[:, 1]
        out = np.zeros(len(z), np.int64)
        out[((z > Z_BAND0) & (z < Z_BAND1)) | ((z > Z_PIN[0]) & (z < Z_PIN[1]))] = 1
        out[z < Z_SKIRT] = 2
        return out

    def side_face(self, side, level=0.0):
        """Flat side of the living module (left; side='R' builds the right side in mirror, y > 0)."""
        outer = self.side_face_loop()
        holes = []
        for (sd, name), poly in self.box['win'].items():
            if sd == side:
                holes.append(K.Loop(poly))
        if side == 'L':
            so = self.cut['fuel'].side('out')
            holes.append(K.Loop(so['uv'], so['P'], so['N']))
        else:
            so = self.cut['door_side'].side('out')
            holes.append(K.Loop(so['uv'], so['P'], so['N']))
        g = K.grid_points(-4.0, 2.4, 0.55, 3.0, 0.16, dt=0.16)
        if level < 0:
            outer = K.Loop(K.resample(outer.uv, 0.08, closed=True))
            holes = [K.Loop(h.uv) for h in holes]
            V, N, T, Z = K.mesh_region_split(S.SIDE_B, [outer], holes, g, lines=[(1, D['box_floor'] - 0.06, -4.6, 2.6)],
                                             zone_fn=lambda c: np.where(c[:, 1] < D['box_floor'] - 0.06, 1, 0), spacing=0.2, level=level)
            return K.add_zones(K.Buf(), V, N, T, Z, {0: 'wood', 1: 'trim'}, flip=True)
        V, N, T, Z = K.mesh_region_split(S.SIDE_B, [outer], holes, g, lines=self._s_lines(), zone_fn=self._s_zone, spacing=0.16)
        return K.add_zones(K.Buf(), V, N, T, Z, ZMAT)

    def door_side_skin(self):
        """Entry door skin (built on the left side in mirror; the build mirrors it to the right)."""
        s = self.cut['door_side'].side('in')
        holes = [K.Loop(self.box['door_win'])]
        g = K.grid_points(DOOR['x0'], DOOR['x1'], DOOR['z0'], DOOR['z1'], 0.10, dt=0.10)
        V, N, T, Z = K.mesh_region_split(S.SIDE_B, [K.Loop(s['uv'], s['P'], s['N'])], holes, g, lines=self._s_lines(),
                                         zone_fn=self._s_zone, spacing=0.10)
        return K.add_zones(K.Buf(), V, N, T, Z, ZMAT)

    def hatch_skin(self):
        s = self.cut['hatch'].side('in')
        g = K.grid_points(HATCH[0], HATCH[1], HATCH[2], HATCH[3], 0.08, dt=0.08)
        V, N, T = K.mesh_region(S.REAR_B, [K.Loop(s['uv'], s['P'], s['N'])], [], g, spacing=0.08)
        return K.Buf().add(V, N, T, 'paint')

    def fuel_flap(self):
        s = self.cut['fuel'].side('in')
        V, N, T = K.mesh_region(S.SIDE_B, [K.Loop(s['uv'], s['P'], s['N'])], [], None, spacing=0.03)
        return K.Buf().add(V, N, T, 'paint')
