"""Sedan exterior: junction of greenhouse and lower body, cut lines (doors, hood, boot lid, arches, lamp
openings, grille, plate recess, fuel flap), trimmed regions of the body shell and the panel skins, rolled edges,
flanges and hems. All in the left half; frames/sedan.py mirrors."""
import math
import sys

sys.dont_write_bytecode = True

import numpy as np  # noqa: E402

from frames import _kit as K  # noqa: E402
from frames import sedan as S  # noqa: E402

D = S.D
PI = math.pi
DELTA = S.DELTA
NAN3 = None


# ============================================================================================ small helpers
class Path:
    """Builds one closed boundary loop from pieces (uv + optional fixed 3D points / normals)."""

    def __init__(self):
        self.uv = []
        self.P = []
        self.N = []

    def add(self, uv, P=None, N=None, drop_first=False, drop_last=False):
        uv = np.asarray(uv, float).reshape(-1, 2)
        n = len(uv)
        P = np.full((n, 3), np.nan) if P is None else np.asarray(P, float).reshape(-1, 3)
        N = np.full((n, 3), np.nan) if N is None else np.asarray(N, float).reshape(-1, 3)
        a = 1 if drop_first else 0
        b = n - 1 if drop_last else n
        self.uv.append(uv[a:b])
        self.P.append(P[a:b])
        self.N.append(N[a:b])
        return self

    def loop(self):
        uv = np.vstack(self.uv)
        P = np.vstack(self.P)
        N = np.vstack(self.N)
        # drop consecutive duplicates
        keep = np.ones(len(uv), bool)
        d = np.linalg.norm(np.diff(np.vstack([uv, uv[:1]]), axis=0), axis=1)
        keep[1:] = d[:-1] > 1e-6
        if d[-1] < 1e-6:
            keep[-1] = False
        return K.Loop(uv[keep], P[keep], N[keep])


def side_dir(P, N, ref, closed):
    """Unit in-surface directions across a boundary, oriented towards the reference points `ref`."""
    T, B = K.loop_frames(P, N, closed)
    s = np.sign(((ref - P) * B).sum(1))
    s = np.sign(np.sum(s)) or 1.0
    return B * s


def interp_curve(xs, x, Y):
    """Linear interpolation of rows Y (n, k) given monotonic xs at x (array)."""
    order = np.argsort(xs)
    xs = xs[order]
    Y = Y[order]
    return np.stack([np.interp(x, xs, Y[:, k]) for k in range(Y.shape[1])], 1)


def step_l(uv):
    """Boundary sampling step in the lower body loft: fine over the shoulder / rocker fillets."""
    t = uv[1]
    if S.L_T[3] - 0.004 < t < S.L_T[4] + 0.004 or S.L_T[1] - 0.004 < t < S.L_T[2] + 0.004:
        return 0.005
    return 0.03


def step_g(uv):
    t = uv[1]
    if S.G_T[2] - 0.004 < t < S.G_T[3] + 0.004:
        return 0.005
    return 0.012


# ============================================================================================ junction
def junction():
    s = S.SG
    us = np.unique(np.concatenate([
        np.arange(s[0], s[1], 0.012), np.linspace(s[1], s[2], 18), np.arange(s[2], s[3], 0.012),
        np.linspace(s[3], s[4], 24), np.arange(s[4], s[5], 0.012), [s[5]]]))
    ts = np.linspace(0.0, 0.22, 111)
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
    """The junction where it runs along the lower body loft's top strip (the belt, between the crossings A and C
    near the A and C pillar feet), as a function of the loft u."""

    def __init__(self, J):
        self.J = J
        tend = S.L_T[-1]
        uvL = J['uvL']
        side = (J['P'][:, 0] < 0.9) & (J['P'][:, 0] > -1.6) & (J['P'][:, 1] > 0.5)
        on = (uvL[:, 1] < tend) & side
        idx = np.nonzero(on)[0]
        i0, i1 = int(idx[0]), int(idx[-1])
        assert np.all(on[i0:i1 + 1]), 'junction leaves the loft strip in the middle'
        self.i0, self.i1 = i0, i1
        self.A = self._cross(i0 - 1, i0)
        self.C = self._cross(i1 + 1, i1)
        self.u = np.concatenate([[self.A[0][0]], uvL[i0:i1 + 1, 0], [self.C[0][0]]])
        self.t = np.concatenate([[tend], uvL[i0:i1 + 1, 1], [tend]])
        self.P = np.vstack([self.A[1], J['P'][i0:i1 + 1], self.C[1]])
        self.NL = np.vstack([self.A[2], J['NL'][i0:i1 + 1], self.C[2]])
        self.NG = np.vstack([self.A[3], J['NG'][i0:i1 + 1], self.C[3]])
        self.uvG = np.vstack([self.A[4], J['uvG'][i0:i1 + 1], self.C[4]])

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
        return uv, P, NL, NG, uvG, f, ia, ib

    def at(self, u):
        """(t, P, NL, NG, uvG) on the junction at loft u values (inside [A, C])."""
        u = np.atleast_1d(np.asarray(u, float))
        t = np.interp(u, self.u, self.t)
        P = interp_curve(self.u, u, self.P)
        NL = K.unit(interp_curve(self.u, u, self.NL))
        NG = K.unit(interp_curve(self.u, u, self.NG))
        uvG = interp_curve(self.u, u, self.uvG)
        return t, P, NL, NG, uvG

    def between(self, ua, ub):
        """Junction polyline from u = ua to u = ub (either direction), endpoints interpolated."""
        lo, hi = min(ua, ub), max(ua, ub)
        inner = (self.u > lo + 1e-6) & (self.u < hi - 1e-6)
        us = np.concatenate([[lo], self.u[inner], [hi]])
        t, P, NL, NG, uvG = self.at(us)
        if ua > ub:
            t, P, NL, NG, uvG, us = t[::-1], P[::-1], NL[::-1], NG[::-1], uvG[::-1], us[::-1]
        return np.stack([us, t], 1), P, NL, NG, uvG


# ============================================================================================ cuts
class Cut:
    """A cut line in one chart and its two offset boundaries. side 'in' = panel side, 'out' = body side.
    uv: polyline in the chart domain; for doors on the lower body the ends lie on the junction."""

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


def l_cut_door(which, jl):
    """Door cut in the lower body loft (u, t), open from the junction at the front edge to the junction at the
    rear edge."""
    tb = float(S.t_of_z(0.0, D['door_bot']))
    if which == 'F':
        uF = float(S.u_of_x(D['fd_front']))
        uR = float(S.u_of_x(D['fd_rear']))
        pts = [(uF, jl.at(uF)[0][0]), (uF, tb), (uR, tb), (uR, jl.at(uR)[0][0])]
        uv = K.rounded_poly(np.array(pts), [0, 0.035, 0.008, 0], 0.03, closed=False, arc_step=0.007)
    else:
        uF = float(S.u_of_x(D['rd_front']))
        uR = float(S.u_of_x(D['rd_rear']))
        xa = D['ax_r']
        za = D['hub_z']
        Rn = D['arch_r'] + 0.030
        zb = D['door_bot']
        th0 = math.atan2(zb - za, math.sqrt(Rn ** 2 - (zb - za) ** 2))
        th1 = math.acos((D['rd_rear'] - xa) / Rn)
        ths = np.linspace(th0, th1, 30)
        ax = xa + Rn * np.cos(ths)
        az = za + Rn * np.sin(ths)
        arc = np.stack([S.u_of_x(ax), S.t_of_z(ax, az)], 1)
        pts = np.vstack([[(uF, jl.at(uF)[0][0]), (uF, tb)], arc, [(uR, jl.at(uR)[0][0])]])
        radii = np.zeros(len(pts))
        radii[1] = 0.008
        radii[2] = 0.012
        radii[-2] = 0.02
        uv = K.rounded_poly(pts, radii, 0.03, closed=False, arc_step=0.007)
    uv = K.densify(uv, step_l, closed=False)
    return uv


def snap_to_j(jl):
    """End points of an open lower body cut offset onto the junction (the vertical edges just move in u)."""
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


def trim_to_j(uv, jl):
    """Drop points of an open polyline that lie above the junction (keeps the part below, ends on it)."""
    tj = jl.at(uv[:, 0])[0]
    keep = uv[:, 1] < tj - 1e-5
    return uv[keep]


# ============================================================================================ greenhouse cuts
def x_aside(z):
    """x of the A pillar side tangent line (corner fillet -> side face) at height z."""
    w = S.g_side_w(z)
    return S.ws_x(w - D['rho_a'], z) - D['rho_a']


def x_cside(z):
    w = S.g_side_w(z)
    return S.rw_x(w - D['rho_c'], z) + D['rho_c']


class GSide:
    """Side-view helpers on the greenhouse: the junction height z_J(x) and the pillar door edges."""

    def __init__(self, jl):
        self.jl = jl
        xs = jl.P[:, 0]
        o = np.argsort(xs)
        self.jx = xs[o]
        self.jz = jl.P[o, 2]
        self.zr = D['rail_z']
        zJf = self.zJ(D['fd_front'])
        self.a_edge = float(x_aside(zJf) - D['fd_front'])

    def zJ(self, x):
        return np.interp(x, self.jx, self.jz)

    def a_edge_x(self, z):
        return x_aside(z) - self.a_edge

    def c_edge_x(self, z):
        z0 = self.zJ(D['rd_rear'])
        f = (np.asarray(z) - z0) / (self.zr - z0)
        return D['rd_rear'] + (D['cp_top'] - D['rd_rear']) * f

    def j_point(self, x):
        """3D point, greenhouse normal and greenhouse chart uv on the junction at side x."""
        t, P, NL, NG, uvG = self.jl.at(S.u_of_x(x))
        return P[0], NG[0], uvG[0]


def g_cut_door(w, gs):
    """Door frame cut in side coordinates (x, z) on the greenhouse side face, open, both ends on the junction."""
    zr = gs.zr
    if w == 'F':
        bp = D['bp_front']
        zs = np.linspace(float(gs.zJ(D['fd_front'])), zr, 12)
        edge = np.stack([gs.a_edge_x(zs), zs], 1)[::-1]
        pts = np.vstack([[(bp, float(gs.zJ(bp))), (bp, zr)], edge])
        radii = np.zeros(len(pts))
        radii[1] = 0.03
        radii[2] = 0.07
    else:
        bp = D['bp_rear']
        zs = np.linspace(float(gs.zJ(D['rd_rear'])), zr, 12)
        edge = np.stack([gs.c_edge_x(zs), zs], 1)[::-1]
        pts = np.vstack([[(bp, float(gs.zJ(bp))), (bp, zr)], edge])
        radii = np.zeros(len(pts))
        radii[1] = 0.03
        radii[2] = 0.06
    return K.rounded_poly(pts, radii, 0.03, closed=False, arc_step=0.008)


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


def door_windows(w, gs, band=0.026, div_w=0.014):
    """Glass openings of a door frame in side coordinates: list of (name, closed CCW polygon (x, z))."""
    zr_in = gs.zr - band
    bot = 0.016
    if w == 'F':
        x_bp = D['bp_front'] + band
        z0 = float(gs.zJ(D['fd_front']))
        ang = math.atan2(float(gs.a_edge_x(gs.zr) - gs.a_edge_x(z0)), gs.zr - z0)
        off = band / math.cos(ang)

        def a_in(z):
            return gs.a_edge_x(z) - off
        xd = 0.47
        zb = float(gs.zJ(0.2)) + bot
        zz = np.linspace(zb - 0.05, zr_in + 0.05, 400)
        ax = a_in(zz)

        def z_at(x):
            return float(np.interp(-x, -ax, zz))
        vent = np.array([(xd + div_w / 2, zb), (float(a_in(zb)), zb), (xd + div_w / 2, z_at(xd + div_w / 2))])
        za = np.linspace(zr_in, z_at(xd - div_w / 2), 6)
        aline = np.stack([a_in(za), za], 1)
        main = np.vstack([[(x_bp, zb), (x_bp, zr_in)], aline, [(xd - div_w / 2, zb)]])
        polys = [('vent', vent, [0.006, 0.014, 0.01]),
                 ('main', main, [0.01, 0.03, 0.05, 0, 0, 0, 0, 0.01, 0.006])]
    else:
        x_bp = D['bp_rear'] - band
        z0 = float(gs.zJ(D['rd_rear']))
        ang = math.atan2(D['cp_top'] - D['rd_rear'], gs.zr - z0)
        off = band / math.cos(ang)

        def c_in(z):
            return gs.c_edge_x(z) + off
        xd = -0.905
        zb = float(gs.zJ(-0.7)) + bot
        main = np.array([(x_bp, zb), (xd + div_w / 2, zb), (xd + div_w / 2, zr_in), (x_bp, zr_in)])
        quarter = np.array([(xd - div_w / 2, zb), (float(c_in(zb)), zb), (float(c_in(zr_in)), zr_in), (xd - div_w / 2, zr_in)])
        polys = [('main', main, [0.012, 0.006, 0.006, 0.03]), ('quarter', quarter, [0.006, 0.015, 0.04, 0.006])]
    out = []
    for name, poly, radii in polys:
        loop = K.rounded_poly(poly, radii, 0.03, arc_step=0.008)
        out.append((name, K.ccw(loop)))
    return out


def ws_frame():
    O = np.array([float(S.ws_x(0.0, D['belt_z'])), 0.0, D['belt_z']])
    e2 = np.array([-math.cos(S._WR), 0.0, math.sin(S._WR)])
    return K.FrameChart(S.G_sdf, O, (0, 1.0, 0), e2)


def rw_frame():
    O = np.array([float(S.rw_x(0.0, D['belt_z'])), 0.0, D['belt_z']])
    e2 = np.array([math.cos(S._RR), 0.0, math.sin(S._RR)])
    return K.FrameChart(S.G_sdf, O, (0, -1.0, 0), e2)


def window_opening(kind, gs, J):
    """Windscreen / rear window opening (left half, open polyline from the top centre round to the bottom
    centre) in its frame chart. Returns (chart, uv, sgn) where sgn = +1 if chart u = +y."""
    if kind == 'ws':
        ch = ws_frame()
        s_ang = S._WR
        zj = float(J['P'][0, 2])
        zs_top = float(S.roof_z(0.49, 0.0) - D['r_header'] * (1 - math.sin(S.PHI_F))) - 0.022
        rr = D['rho_a']
        sgn = 1.0
    else:
        ch = rw_frame()
        s_ang = S._RR
        zj = float(J['P'][-1, 2])
        zs_top = float(S.roof_z(-1.17, 0.0) - D['r_rheader'] * (1 - math.sin(S.PHI_R))) - 0.026
        rr = D['rho_c']
        sgn = -1.0
    sb = (zj - D['belt_z']) / math.sin(s_ang) + 0.028
    st = (zs_top - D['belt_z']) / math.sin(s_ang)
    ss = np.linspace(sb, st, 10)
    zz = D['belt_z'] + ss * math.sin(s_ang)
    ye = S.g_side_w(zz) - rr - 0.024
    side = np.stack([sgn * ye, ss], 1)
    pts = np.vstack([[(0.0, st)], side[::-1], [(0.0, sb)]])
    radii = np.zeros(len(pts))
    radii[1] = 0.075 if kind == 'ws' else 0.09
    radii[-2] = 0.045 if kind == 'ws' else 0.06
    uv = K.rounded_poly(pts, radii, 0.035, closed=False, arc_step=0.01)
    return ch, uv, sgn


# ============================================================================================ the exterior
class Exterior:
    def __init__(self, quick=False):
        self.quick = quick
        self.J = junction()
        self.jl = JLine(self.J)
        self.us = S.l_u_samples()
        self.ts = S.l_t_samples()
        self._rows()
        self._cuts()
        self._gcuts()
        self._openings()

    # ------------------------------------------------------------------ shared rows
    def _rows(self):
        tend = S.L_T[-1]
        us = self.us
        uA = self.jl.A[0][0]
        uC = self.jl.C[0][0]
        a = us[us < uA - 1e-4]
        self.row_front_uv = np.stack([np.concatenate([a, [uA]]), np.full(len(a) + 1, tend)], 1)
        P, N = S.CL.to3d(self.row_front_uv)
        P[-1] = self.jl.A[1]
        N[-1] = self.jl.A[2]
        self.row_front_P, self.row_front_N = P, N
        b = us[us > uC + 1e-4]
        self.row_rear_uv = np.stack([np.concatenate([[uC], b]), np.full(len(b) + 1, tend)], 1)
        P, N = S.CL.to3d(self.row_rear_uv)
        P[0] = self.jl.C[1]
        N[0] = self.jl.C[2]
        self.row_rear_P, self.row_rear_N = P, N

    # ------------------------------------------------------------------ cuts
    def _cuts(self):
        jl = self.jl
        self.cut = {}
        # doors, lower body part (inner side = into the door: the polylines run front edge (top) -> bottom ->
        # rear edge (top), i.e. clockwise in (u, t); the door lies to the left in (u, t) with u increasing rearwards)
        for w in ('F', 'R'):
            uv = l_cut_door(w, jl)
            self.cut['doorL_' + w] = Cut(S.CL, uv, False, +1.0, snap_to_j(jl))
        self._hood_trunk()

    def _hood_trunk(self):
        """Hood and boot lid outlines on the top chart, kept inside the lower body loft's strip end."""
        # hood: open polyline round the left half from the rear edge at y = 0 to the front edge at y = 0
        hr = D['hood_rear']
        hw = D['hood_w']
        rp = self.row_front_P
        m = rp[:, 0] > 1.5
        o = np.argsort(rp[m, 1])
        ry, rx = rp[m, 1][o], rp[m, 0][o]
        ys = np.linspace(0.62, 0.0, 10)
        xf = np.interp(ys, ry, rx) - 0.012
        pts = np.vstack([[(hr, 0.0), (hr, hw), (xf[0], hw)], np.stack([xf, ys], 1)[1:]])
        radii = np.zeros(len(pts))
        radii[1] = 0.025
        radii[2] = 0.10
        uv = K.rounded_poly(pts, radii, 0.04, closed=False, arc_step=0.01)
        self.cut['hood'] = Cut(S.CT, uv, False, -1.0)
        # boot lid
        tf = D['trunk_front']
        tw = D['trunk_w']
        rp = self.row_rear_P
        m = rp[:, 0] < -1.8
        o = np.argsort(rp[m, 1])
        ry, rx = rp[m, 1][o], rp[m, 0][o]
        ys = np.linspace(0.64, 0.0, 10)
        xr = np.interp(ys, ry, rx) + 0.012
        pts = np.vstack([[(tf, 0.0), (tf, tw), (xr[0], tw)], np.stack([xr, ys], 1)[1:]])
        radii = np.zeros(len(pts))
        radii[1] = 0.03
        radii[2] = 0.08
        uv = K.rounded_poly(pts, radii, 0.04, closed=False, arc_step=0.01)
        self.cut['trunk'] = Cut(S.CT, uv, False, +1.0)

    def _openings(self):
        """Front and rear openings in the lower body loft: grille (notch at the front centre), headlamp holes,
        tail lamp recesses, plate recess (notch at the rear centre), fuel flap (right side)."""
        self.open = {}
        gw, z0, z1 = D['grille_w'], D['grille_z0'], D['grille_z1']
        pts = np.array([(0.0, z1), (gw, z1), (gw, z0), (0.0, z0)])
        g = K.rounded_poly(pts, [0, 0.03, 0.03, 0], 0.03, closed=False, arc_step=0.008)
        P, N = S.FRONT_L.to3d(g)
        self.open['grille'] = dict(uv=S.CL.to2d(P), P=P, N=N, yz=g)
        c = K.circle_loop(D['lamp_y'], D['lamp_z'], D['lamp_d'] / 2, 0.015)
        P, N = S.FRONT_L.to3d(c)
        self.open['lamp'] = dict(uv=S.CL.to2d(P), P=P, N=N, yz=c)
        # tail lamp recess (rear view coordinates: y, z) and the plate recess (left half, open at y = 0)
        t = K.rounded_poly(np.array([(0.44, 0.62), (0.68, 0.62), (0.68, 0.745), (0.44, 0.745)]), [0.015, 0.025, 0.025, 0.015], 0.025, arc_step=0.007)
        P, N = S.REAR_L.to3d(t)
        self.open['tail'] = dict(uv=S.CL.to2d(P), P=P, N=N, yz=t)
        pl = K.rounded_poly(np.array([(0.0, 0.625), (0.185, 0.625), (0.185, 0.455), (0.0, 0.455)]), [0, 0.02, 0.02, 0], 0.03, closed=False, arc_step=0.008)
        P, N = S.REAR_L.to3d(pl)
        self.open['plate'] = dict(uv=S.CL.to2d(P), P=P, N=N, yz=pl)
        # fuel flap (built into the right half: same loft coordinates as the left)
        f = K.circle_loop(-1.63, 0.765, 0.054, 0.009)
        P, N = S.SIDE_L.to3d(f)
        self.open['fuel'] = dict(uv=S.CL.to2d(P), P=P, N=N, xz=f)
        cut = Cut(S.SIDE_L, f, True, +1.0)
        self.cut['fuel'] = cut

    def _gcuts(self):
        gs = self.gs = GSide(self.jl)
        for w, sgn in (('F', -1.0), ('R', +1.0)):
            uv = g_cut_door(w, gs)
            self.cut['doorG_' + w] = Cut(S.SIDE_G, uv, False, sgn, snap_side_to_j(gs))
            self.cut['winG_' + w] = door_windows(w, gs)
        self.win = {}
        for kind in ('ws', 'rw'):
            ch, uv, sgn = window_opening(kind, gs, self.J)
            P, N = ch.to3d(uv)
            self.win[kind] = dict(chart=ch, uv=uv, P=P, N=N, sgn=sgn)

    # ------------------------------------------------------------------ lower body region
    def arch_notch(self, xa):
        """Wheel arch notch in the loft domain: from the bottom row up over the arch and back down."""
        R = D['arch_r']
        za = D['hub_z']
        zb = float(S._bot(xa))
        th = math.asin((zb - za) / R)
        ths = np.linspace(th, PI - th, 46)
        ax = xa + R * np.cos(ths)
        az = za + R * np.sin(ths)
        uv = np.stack([S.u_of_x(ax), S.t_of_z(ax, az)], 1)
        u0 = uv[0, 0]
        u1 = uv[-1, 0]
        tl = S.L_T[1]
        down = np.linspace(S.L_T[0], tl, 4)
        front = np.stack([np.full(len(down), u0), down], 1)
        rear = np.stack([np.full(len(down), u1), down[::-1]], 1)
        return np.vstack([front[:-1], uv, rear[1:]])

    def lower_body_loop(self):
        """Outer loop of the body region on the lower body loft (left half)."""
        tend = S.L_T[-1]
        us = self.us
        ts = self.ts
        U = S.L_GUIDE.length
        p = Path()
        # 1. bottom row with the two arch notches (u increasing)
        notches = [self.arch_notch(D['ax_f']), self.arch_notch(D['ax_r'])]
        self.arch_uv = notches
        self.arch_P = []
        cur = 0.0
        for nt in notches:
            seg = us[(us >= cur) & (us < nt[0, 0] - 1e-4)]
            p.add(np.stack([seg, np.full(len(seg), S.L_T[0])], 1))
            P, N = S.CL.to3d(nt)
            self.arch_P.append((P, N))
            p.add(nt, P, N)
            cur = nt[-1, 0] + 1e-4
        seg = us[(us >= cur)]
        p.add(np.stack([seg, np.full(len(seg), S.L_T[0])], 1))
        # 2. rear centre line up, round the plate recess (outline runs top centre -> bottom centre)
        pl = self.open['plate']
        tt = ts[(ts > S.L_T[0]) & (ts < pl['uv'][-1, 1] - 0.004)]
        p.add(np.stack([np.full(len(tt), U), tt], 1))
        p.add(pl['uv'][::-1], pl['P'][::-1], pl['N'][::-1])
        tt = ts[(ts > pl['uv'][0, 1] + 0.004) & (ts < tend)]
        p.add(np.stack([np.full(len(tt), U), tt], 1))
        # 3. top: rear row (reversed), junction, door opening, junction, front row (reversed)
        p.add(self.row_rear_uv[::-1], self.row_rear_P[::-1], self.row_rear_N[::-1])
        out_r = self.cut['doorL_R'].side('out')
        out_f = self.cut['doorL_F'].side('out')
        uv, P, NL, NG, _ = self.jl.between(self.jl.C[0][0], out_r['uv'][-1, 0])
        p.add(uv, P, NL, drop_first=True, drop_last=True)
        # door opening: rear door outer boundary reversed (rear edge top -> bottom -> front), then the front door
        # outer boundary reversed, but the sill line between the doors is straight: use the bottom rows only
        r_uv, r_P, r_N = out_r['uv'][::-1], out_r['P'][::-1], out_r['N'][::-1]
        f_uv, f_P, f_N = out_f['uv'][::-1], out_f['P'][::-1], out_f['N'][::-1]
        tb = float(S.t_of_z(0.0, D['door_bot'])) - DELTA
        # cut the rear door outline where its bottom reaches the front edge corner (u of the rear door front edge)
        ur = self.cut['doorL_R'].uv[0, 0]
        kr = np.nonzero(r_uv[:, 0] > ur + 0.02)[0][-1]
        uf_ = self.cut['doorL_F'].uv[-1, 0]
        kf = np.nonzero(f_uv[:, 0] < uf_ - 0.02)[0][0]
        self.opening_out = dict(uv=np.vstack([r_uv[:kr + 1], f_uv[kf:]]), P=np.vstack([r_P[:kr + 1], f_P[kf:]]),
                                N=np.vstack([r_N[:kr + 1], f_N[kf:]]))
        op = self.opening_out
        p.add(op['uv'], op['P'], op['N'])
        uv, P, NL, NG, _ = self.jl.between(out_f['uv'][0, 0], self.jl.A[0][0])
        p.add(uv, P, NL, drop_first=True, drop_last=True)
        p.add(self.row_front_uv[::-1], self.row_front_P[::-1], self.row_front_N[::-1])
        # 4. front centre line down, round the grille opening (outline runs top centre -> bottom centre)
        gr = self.open['grille']
        tt = ts[(ts > gr['uv'][0, 1] + 0.004) & (ts < tend)][::-1]
        p.add(np.stack([np.zeros(len(tt)), tt], 1))
        p.add(gr['uv'], gr['P'], gr['N'])
        tt = ts[(ts > S.L_T[0]) & (ts < gr['uv'][-1, 1] - 0.004)][::-1]
        p.add(np.stack([np.zeros(len(tt)), tt], 1))
        return p.loop()

    def lower_body(self, fuel=False):
        loop = self.lower_body_loop()
        holes = []
        for k in ('lamp', 'tail'):
            o = self.open[k]
            holes.append(K.Loop(o['uv'], o['P'], o['N']))
        if fuel:
            so = self.cut['fuel'].side('out')
            holes.append(K.Loop(S.CL.to2d(so['P']), so['P'], so['N']))
        pts, sp = S.grid_from(self.us, self.ts)
        V, N, T = K.mesh_region(S.CL, [loop], holes, pts, spacing=sp)
        return K.Buf().add(V, N, T, 'paint')

    def fuel_flap(self):
        si = self.cut['fuel'].side('in')
        loop = K.Loop(S.CL.to2d(si['P']), si['P'], si['N'])
        c = si['uv'].mean(0)
        g = K.grid_points(c[0] - 0.06, c[0] + 0.06, c[1] - 0.06, c[1] + 0.06, 0.012, dt=0.012)
        P3, N3 = S.SIDE_L.to3d(g)
        V, N, T = K.mesh_region(S.CL, [loop], [], S.CL.to2d(P3), spacing=0.012)
        b = K.Buf().add(V, N, T, 'paint')
        V, N, Tr = K.roll_edge(si['P'], si['N'], si['E'], 0.0015, 0.006, 0.004, 2, closed=True)
        b.add(V, N, Tr, 'paint')
        return b

    def door_skin(self, w):
        c = self.cut['doorL_' + w]
        s = c.side('in')
        p = Path()
        p.add(s['uv'], s['P'], s['N'])
        uv, P, NL, NG, _ = self.jl.between(s['uv'][-1, 0], s['uv'][0, 0])
        p.add(uv, P, NL, drop_first=True, drop_last=True)
        loop = p.loop()
        pts, sp = S.grid_from(self.us, self.ts)
        V, N, T = K.mesh_region(S.CL, [loop], [], pts, spacing=sp)
        return K.Buf().add(V, N, T, 'paint')

    # ------------------------------------------------------------------ top regions
    def top_front(self):
        J = self.J
        i0 = self.jl.i0
        c = self.cut['hood']
        out = c.side('out')
        p = Path()
        p.add(self.row_front_P[:, :2], self.row_front_P, self.row_front_N)
        # junction from just before the crossing back to the windscreen centre
        p.add(J['P'][:i0][::-1, :2], J['P'][:i0][::-1], J['NL'][:i0][::-1])
        # centre line forward to the hood
        x0 = J['P'][0, 0]
        x1 = out['uv'][0, 0]
        xs = np.linspace(x0, x1, max(2, int((x1 - x0) / 0.02) + 1))[1:-1]
        p.add(np.stack([xs, np.zeros(len(xs))], 1))
        p.add(out['uv'], out['P'], out['N'])
        x2 = out['uv'][-1, 0]
        x3 = self.row_front_P[0, 0]
        xs = np.linspace(x2, x3, max(2, int(abs(x3 - x2) / 0.01) + 1))[1:-1]
        p.add(np.stack([xs, np.zeros(len(xs))], 1))
        loop = p.loop()
        xg, yg = np.meshgrid(np.arange(0.70, 1.95, 0.04), np.arange(0.0, 0.85, 0.035), indexing='ij')
        g = np.stack([xg.ravel(), yg.ravel()], 1)
        V, N, T = K.mesh_region(S.CT, [loop], [], g, spacing=0.035)
        return K.Buf().add(V, N, T, 'paint')

    def top_rear(self):
        J = self.J
        i1 = self.jl.i1
        c = self.cut['trunk']
        out = c.side('out')
        p = Path()
        p.add(self.row_rear_P[:, :2], self.row_rear_P, self.row_rear_N)
        # rear centre: from the deck row end along the centre line forward to the boot lid's rear edge
        x0 = self.row_rear_P[-1, 0]
        x1 = out['uv'][-1, 0]
        xs = np.linspace(x0, x1, max(2, int(abs(x1 - x0) / 0.01) + 1))[1:-1]
        p.add(np.stack([xs, np.zeros(len(xs))], 1))
        p.add(out['uv'][::-1], out['P'][::-1], out['N'][::-1])
        x2 = out['uv'][0, 0]
        x3 = J['P'][-1, 0]
        xs = np.linspace(x2, x3, max(2, int(abs(x3 - x2) / 0.02) + 1))[1:-1]
        p.add(np.stack([xs, np.zeros(len(xs))], 1))
        p.add(J['P'][i1 + 1:][::-1, :2], J['P'][i1 + 1:][::-1], J['NL'][i1 + 1:][::-1])
        loop = p.loop()
        xg, yg = np.meshgrid(np.arange(-2.1, -1.3, 0.04), np.arange(0.0, 0.85, 0.035), indexing='ij')
        g = np.stack([xg.ravel(), yg.ravel()], 1)
        V, N, T = K.mesh_region(S.CT, [loop], [], g, spacing=0.035)
        return K.Buf().add(V, N, T, 'paint')

    def lid(self, name):
        c = self.cut[name]
        s = c.side('in')
        p = Path()
        p.add(s['uv'], s['P'], s['N'])
        x0 = s['uv'][-1, 0]
        x1 = s['uv'][0, 0]
        xs = np.linspace(x0, x1, max(2, int(abs(x1 - x0) / 0.03) + 1))[1:-1]
        p.add(np.stack([xs, np.zeros(len(xs))], 1))
        loop = p.loop()
        bb = s['uv']
        xg, yg = np.meshgrid(np.arange(bb[:, 0].min() - 0.05, bb[:, 0].max() + 0.05, 0.04), np.arange(0.0, 0.8, 0.04), indexing='ij')
        g = np.stack([xg.ravel(), yg.ravel()], 1)
        V, N, T = K.mesh_region(S.CT, [loop], [], g, spacing=0.04)
        return K.Buf().add(V, N, T, 'paint')

    # ------------------------------------------------------------------ greenhouse
    def greenhouse(self, level=0.0):
        """Greenhouse body (pillars, roof rails, header) outside; level < 0: the same region that far inside,
        facing the cabin (pillar and rail trims)."""
        J = self.J
        gus = S.g_u_samples()
        gts = S.g_t_samples()
        UG = S.G_GUIDE.length
        fo = self.cut['doorG_F'].side('out')
        ro = self.cut['doorG_R'].side('out')
        ws = self.win['ws']
        rw = self.win['rw']
        p = Path()
        uv_f = S.CG.to2d(fo['P'])
        r_uv = S.CG.to2d(ro['P'])
        # 1. junction from the front centre to the front door frame (its front end = A edge bottom)
        ua = uv_f[-1, 0]
        m = J['uvG'][:, 0] < ua - 1e-4
        p.add(J['uvG'][m], J['P'][m], J['NG'][m])
        # 2. front door frame outer boundary reversed (A edge up, rail rearwards, B pillar front edge down)
        p.add(uv_f[::-1], fo['P'][::-1], fo['N'][::-1])
        # 3. junction along the B pillar foot
        m = (J['uvG'][:, 0] > uv_f[0, 0] + 1e-4) & (J['uvG'][:, 0] < r_uv[0, 0] - 1e-4)
        p.add(J['uvG'][m], J['P'][m], J['NG'][m])
        # 4. rear door frame outer boundary (B pillar rear edge up, rail rearwards, C edge down)
        p.add(r_uv, ro['P'], ro['N'])
        # 5. junction to the rear centre
        m = J['uvG'][:, 0] > r_uv[-1, 0] + 1e-4
        p.add(J['uvG'][m], J['P'][m], J['NG'][m])
        # 6-8. rear centre line with the rear window notch (the rear window outline runs top -> bottom)
        rw_uv = S.CG.to2d(rw['P'])
        tt = gts[(gts > J['uvG'][-1, 1] + 0.004) & (gts < rw_uv[-1, 1] - 0.004)]
        p.add(np.stack([np.full(len(tt), UG), tt], 1))
        p.add(rw_uv[::-1], rw['P'][::-1], rw['N'][::-1])
        tt = gts[gts > rw_uv[0, 1] + 0.004]
        p.add(np.stack([np.full(len(tt), UG), tt], 1))
        # 9. top row forwards
        uu = gus[::-1]
        p.add(np.stack([uu, np.full(len(uu), S.G_T[-1])], 1), drop_first=True, drop_last=True)
        # 10-12. front centre line with the windscreen notch (outline runs top -> bottom)
        ws_uv = S.CG.to2d(ws['P'])
        tt = gts[gts > ws_uv[0, 1] + 0.004][::-1]
        p.add(np.stack([np.zeros(len(tt)), tt], 1))
        p.add(ws_uv, ws['P'], ws['N'])
        tt = gts[(gts < ws_uv[-1, 1] - 0.004) & (gts > J['uvG'][0, 1] + 0.004)][::-1]
        p.add(np.stack([np.zeros(len(tt)), tt], 1))
        loop = p.loop()
        pts, sp = S.grid_from(gus, gts)
        if level < 0:
            loop = K.Loop(K.resample(loop.uv, 0.035, closed=True))
            cu = np.linspace(0, UG, int(UG / 0.09))
            ct = np.unique(np.concatenate([np.linspace(S.G_T[0], S.G_T[2], 6), np.linspace(S.G_T[2], S.G_T[4], 5)]))
            pts, sp = S.grid_from(cu, ct)
            V, N, T = K.mesh_region(S.CG, [loop], [], pts, spacing=sp, level=level)
            return K.Buf().add(V, -N, T, 'plastic_int')
        V, N, T = K.mesh_region(S.CG, [loop], [], pts, spacing=sp)
        return K.Buf().add(V, N, T, 'paint')

    def door_frame(self, w):
        """Door frame skin on the greenhouse (inside the frame cut, minus the glass openings)."""
        c = self.cut['doorG_' + w]
        s = c.side('in')
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
        loop = p.loop()
        holes = []
        self.win_P = getattr(self, 'win_P', {})
        for name, poly in self.cut['winG_' + w]:
            P, N = S.SIDE_G.to3d(poly)
            holes.append(K.Loop(S.CG.to2d(P), P, N))
            self.win_P[(w, name)] = (poly, P, N)
        gus = S.g_u_samples()
        gts = S.g_t_samples()
        us = np.linspace(gus.min(), gus.max(), int((gus.max() - gus.min()) / 0.02))
        pts, sp = S.grid_from(us, gts)
        V, N, T = K.mesh_region(S.CG, [loop], holes, pts, spacing=sp)
        return K.Buf().add(V, N, T, 'paint')

    def glass(self):
        """Fixed glass (windscreen, rear window; left halves) and door glass, inside the greenhouse surface."""
        out = {}
        for kind in ('ws', 'rw'):
            wv = self.win[kind]
            ch = wv['chart']
            uv = wv['uv']
            sgn = wv['sgn']
            big = K.offset_loop2(uv, sgn * 0.014, closed=False)
            big[0, 0] = 0.0
            big[-1, 0] = 0.0
            ss = np.linspace(big[-1, 1], big[0, 1], 30)[1:-1]
            loop = np.vstack([big, np.stack([np.zeros(len(ss)), ss], 1)])
            g = K.grid_points(-0.8, 0.8, -0.2, 0.8, 0.09, dt=0.09)
            V, N, T = K.mesh_region(ch, [K.Loop(K.resample_keep(loop, 0.05))], [], g, spacing=0.09, level=-0.007)
            out[kind] = K.Buf().add(V, N, T, 'glass')
        for w in ('F', 'R'):
            b = K.Buf()
            for name, poly in self.cut['winG_' + w]:
                big = K.offset_loop2(poly, -0.012)
                g = K.grid_points(-1.5, 1.0, 0.85, 1.4, 0.10, dt=0.10)
                V, N, T = K.mesh_region(S.SIDE_G, [K.Loop(big)], [], g, spacing=0.10, level=-0.012)
                b.add(V, N, T, 'glass')
            out['door_' + w] = b
        return out

    def roof(self):
        gus = S.g_u_samples()
        row = np.stack([gus, np.full(len(gus), S.G_T[-1])], 1)
        Pr, Nr = S.CG.to3d(row)
        a = Pr[-1]
        b = Pr[0]
        xs = np.linspace(a[0], b[0], max(3, int(abs(b[0] - a[0]) / 0.04)))[1:-1]
        Pc, Nc = S.CR.to3d(np.stack([xs, np.zeros(len(xs))], 1))
        P = np.vstack([Pr, Pc])
        Nn = np.vstack([Nr, Nc])
        xg, yg = np.meshgrid(np.arange(-1.3, 0.6, 0.085), np.arange(0.0, 0.7, 0.085), indexing='ij')
        g = np.stack([xg.ravel(), yg.ravel()], 1)
        V, N, T = K.mesh_region(S.CR, [K.Loop(P[:, :2], P, Nn)], [], g, spacing=0.085)
        return K.Buf().add(V, N, T, 'paint')

    # ------------------------------------------------------------------ edges
    def edges(self):
        """Rolled edges of all cuts: (body buffer, {panel name: buffer})."""
        body = K.Buf()
        panels = {}
        # door openings on the lower body: the combined outer boundary
        op = self.opening_out
        ref = np.vstack([self.cut['doorL_R'].P, self.cut['doorL_F'].P])
        E = side_dir(op['P'], op['N'], self._nearest(op['P'], ref), False)
        V, N, Tr = K.roll_edge(op['P'], op['N'], E, ER, 0.10, 0.0, 2, closed=False)
        body.add(V, N, Tr, 'paint')
        for w in ('F', 'R'):
            s_ = self.cut['doorL_' + w].side('in')
            V, N, Tr = K.roll_edge(s_['P'], s_['N'], s_['E'], ER, 0.10, 0.03, 2, closed=False, hem_segs=0)
            panels.setdefault('door_' + w, K.Buf()).add(V, N, Tr, 'paint')
            c = self.cut['doorG_' + w]
            so = c.side('out')
            V, N, Tr = K.roll_edge(so['P'], so['N'], so['E'], ER, 0.032, 0.0, 2, closed=False)
            body.add(V, N, Tr, 'paint')
            si = c.side('in')
            V, N, Tr = K.roll_edge(si['P'], si['N'], si['E'], ER, 0.035, 0.008, 2, closed=False, hem_segs=0)
            panels['door_' + w].add(V, N, Tr, 'paint')
            # glass openings of the frame
            for name, poly in self.cut['winG_' + w]:
                _, P, Nn = self.win_P[(w, name)]
                cen = np.tile(P.mean(0), (len(P), 1))
                E = side_dir(P, Nn, cen, True)
                V, N, Tr = K.roll_edge(P, Nn, E, 0.003, 0.035, 0.0, 2, closed=True)
                panels['door_' + w].add(V, N, Tr, 'paint')
        for name in ('hood', 'trunk'):
            c = self.cut[name]
            so = c.side('out')
            V, N, Tr = K.roll_edge(so['P'], so['N'], so['E'], ER, 0.03, 0.0, 2, closed=False)
            body.add(V, N, Tr, 'paint')
            si = c.side('in')
            V, N, Tr = K.roll_edge(si['P'], si['N'], si['E'], ER, 0.025, 0.008, 2, closed=False, hem_segs=0)
            panels.setdefault(name, K.Buf()).add(V, N, Tr, 'paint')
        # windscreen and rear window openings
        for kind, cen in (('ws', (float(S.ws_x(0.0, 1.15)) - 0.1, 0.0, 1.15)), ('rw', (float(S.rw_x(0.0, 1.15)) + 0.1, 0.0, 1.15))):
            wv = self.win[kind]
            E = side_dir(wv['P'], wv['N'], np.tile(cen, (len(wv['P']), 1)), False)
            V, N, Tr = K.roll_edge(wv['P'], wv['N'], E, 0.004, 0.032, 0.0, 2, closed=False)
            body.add(V, N, Tr, 'paint')
        # wheel arches: rolled lip into the wheel well (arch circle part only)
        for (P, N), uv in zip(self.arch_P, self.arch_uv):
            keep = uv[:, 1] >= S.L_T[1] - 1e-6
            P = P[keep]
            N = N[keep]
            c = np.array([P[:, 0].mean(), P[:, 1].mean(), D['hub_z']])
            E = side_dir(P, N, np.tile(c, (len(P), 1)), False)
            V, Nn, Tr = K.roll_edge(P, N, E, 0.007, 0.035, 0.0, 2, closed=False)
            body.add(V, Nn, Tr, 'paint')
        return body, panels

    # ------------------------------------------------------------------ openings: details
    def opening_details(self):
        """Edges and the parts of the body behind the front / rear openings (left half)."""
        b = K.Buf()
        # --- grille opening and the grille
        gr = self.open['grille']
        ref = np.tile([gr['P'][:, 0].mean(), 0.0, 0.66], (len(gr['P']), 1))
        E = side_dir(gr['P'], gr['N'], ref, False)
        V, N, T = K.roll_edge(gr['P'], gr['N'], E, 0.005, 0.03, 0.0, 2, closed=False, flange_dir=(-1, 0, 0))
        b.add(V, N, T, 'paint')
        b.extend(self.grille())
        # --- headlamp buckets
        lp = self.open['lamp']
        c3 = S.FRONT_L.to3d(np.array([[D['lamp_y'], D['lamp_z']]]))[0][0]
        E = side_dir(lp['P'], lp['N'], np.tile(c3, (len(lp['P']), 1)), True)
        V, N, T = K.roll_edge(lp['P'], lp['N'], E, 0.006, 0.012, 0.0, 2, closed=True, flange_dir=(-1, 0, 0))
        b.add(V, N, T, 'paint')
        ring = V.reshape(-1, len(lp['P']), 3)[-1]
        depth = 0.075
        b.extend(K.ring_tube(ring, (-1, 0, 0), depth, 1, 'trim'))
        back = ring - np.array([depth, 0, 0])
        hole = K.circle_loop(0, 0, 0.026, 0.006)
        cb = back.mean(0)
        hole3 = np.stack([np.full(len(hole), cb[0]), cb[1] + hole[:, 0], cb[2] + hole[:, 1]], 1)
        b.extend(K.fill_loop(back, (1, 0, 0), 'trim', holes=[hole3]))
        b.extend(K.ring_tube(hole3, (-1, 0, 0), 0.03, 1, 'trim'))
        for k in range(3):
            a = math.radians(90 + 120 * k)
            pc = cb + np.array([0.004, 0.072 * math.cos(a), 0.072 * math.sin(a)])
            b.extend(K.box_buf(pc - (0.004, 0.009, 0.009), pc + (0.008, 0.009, 0.009), 'steel', 0.002, 1))
        self.lamp_mount = (c3, lp['N'].mean(0))
        # --- tail lamp recess
        tl = self.open['tail']
        ct = tl['P'].mean(0)
        E = side_dir(tl['P'], tl['N'], np.tile(ct, (len(tl['P']), 1)), True)
        V, N, T = K.roll_edge(tl['P'], tl['N'], E, 0.004, 0.045, 0.0, 2, closed=True, flange_dir=(1, 0, 0))
        b.add(V, N, T, 'paint')
        ring = V.reshape(-1, len(tl['P']), 3)[-1]
        b.extend(K.fill_loop(ring, (-1, 0, 0), 'trim', interior_step=0.03))
        self.tail_mount = (np.array([tl['P'][:, 0].mean(), ct[1], ct[2]]), -tl['N'].mean(0))
        # --- plate recess (left half)
        pl = self.open['plate']
        ref = np.tile([pl['P'][:, 0].mean(), 0.0, 0.54], (len(pl['P']), 1))
        E = side_dir(pl['P'], pl['N'], ref, False)
        V, N, T = K.roll_edge(pl['P'], pl['N'], E, 0.003, 0.012, 0.0, 2, closed=False, flange_dir=(1, 0, 0))
        b.add(V, N, T, 'paint')
        bot = V.reshape(-1, len(pl['P']), 3)[-1]
        zz = np.linspace(bot[-1, 2], bot[0, 2], 8)[1:-1]
        closing = np.stack([np.full(len(zz), bot[:, 0].mean()), np.zeros(len(zz)), zz], 1)
        b.extend(K.fill_loop(np.vstack([bot, closing]), (-1, 0, 0), 'paint'))
        xr = bot[:, 0].mean()
        # plate lamp housing above the recess
        zl = pl['yz'][:, 1].max() + 0.012
        b.extend(K.box_buf((xr - 0.03, 0.0, zl - 0.004), (xr - 0.006, 0.07, zl + 0.018), 'trim', 0.004, 2))
        b.extend(K.box_buf((xr - 0.0105, 0.0, zl - 0.006), (xr - 0.0085, 0.055, zl + 0.002), 'lens_head', 0.001, 1))
        self.plate_x = xr
        return b

    def grille(self):
        """Chrome surround, black slats, a bright centre bar, a vertical divider and a small badge."""
        b = K.Buf()
        gw, z0, z1 = D['grille_w'], D['grille_z0'], D['grille_z1']

        def xs(y, z, d):
            P, _ = S.FRONT_L.to3d(np.stack([np.atleast_1d(y), np.atleast_1d(z)], 1).reshape(-1, 2))
            return P[:, 0] - d
        # back panel (dark) following the front face 50 mm in
        g = self.open['grille']['yz']
        loop = np.vstack([g, np.stack([np.zeros(8), np.linspace(z0, z1, 10)[1:-1]], 1)])
        loop2 = K.offset_loop2(K.ccw(loop), 0.004)
        loop2[:, 0] = np.maximum(loop2[:, 0], 0.0)
        pts = K.grid_points(0, gw, z0, z1, 0.08, dt=0.08)
        V, N, T = K.mesh_region(S.FRONT_L, [K.Loop(K.resample(loop2, 0.04))], [], pts, spacing=0.08, level=-0.05)
        b.add(V, -N, T, 'trim')
        # slats
        ys = np.linspace(0.0, gw - 0.012, 8)
        slat = K.round_profile(np.array([(-0.006, -0.008), (0.006, -0.008), (0.006, 0.008), (-0.006, 0.008)]), 0.003, 1)
        slat = np.vstack([slat, slat[:1]])
        for z in np.linspace(z0 + 0.045, z1 - 0.045, 5):
            mat = 'chrome' if abs(z - 0.66) < 0.025 else 'trim'
            prof = slat * (1.25 if mat == 'chrome' else 1.0)
            path = np.stack([xs(ys, np.full(len(ys), z), 0.032), ys, np.full(len(ys), z)], 1)
            V, N, T = K.sweep(path, (0, 0, 1), prof, closed=False, closed_prof=True)
            b.add(V, N, T, mat)
            # end cap at the outer end
            b.add(*K.lathe(np.array([[0.0, 0.0], [0.0085, 0.0]]), path[-1], (0, 1, 0), 8, prof_n=np.array([[0, 1.0], [0, 1.0]])), mat)
        # surround (chrome) just inside the opening, 18 mm deep
        sur = K.offset_loop2(g, 0.0, closed=False)
        P, Ns = S.FRONT_L.to3d(sur)
        inward = np.array([-0.018, 0, 0])
        path = P + inward
        cen = np.array([path[:, 0].mean(), 0.0, 0.66])
        prof = K.round_profile(np.array([(-0.006, -0.005), (0.006, -0.005), (0.006, 0.005), (-0.006, 0.005)]), 0.003, 1)
        prof = np.vstack([prof, prof[:1]])
        V, N, T = K.sweep(path, (1, 0, 0), prof, closed=False, closed_prof=True)
        b.add(V, N, T, 'chrome')
        # vertical divider (half) and badge
        zs = np.linspace(z0 + 0.008, z1 - 0.008, 12)
        xd = xs(np.zeros(len(zs)), zs, 0.03)
        b.extend(K.box_buf((float(xd.mean()) - 0.012, 0.0, z0 + 0.006), (float(xd.mean()) + 0.006, 0.008, z1 - 0.006), 'chrome', 0.003, 2))
        xb = float(xs(0.0, 0.66, 0.012)[0])
        b.extend(K.box_buf((xb - 0.012, 0.0, 0.636), (xb + 0.004, 0.026, 0.684), 'chrome', 0.008, 3))
        return b

    def fuel_details(self):
        """Body edge, pocket and filler cap behind the fuel flap (built in left-half coordinates)."""
        b = K.Buf()
        so = self.cut['fuel'].side('out')
        V, N, T = K.roll_edge(so['P'], so['N'], so['E'], 0.002, 0.03, 0.0, 2, closed=True)
        b.add(V, N, T, 'paint')
        ring = V.reshape(-1, len(so['P']), 3)[-1]
        c = ring.mean(0)
        hole = K.circle_loop(0, 0, 0.022, 0.005)
        h3 = np.stack([c[0] + hole[:, 0], np.full(len(hole), c[1]), c[2] + hole[:, 1]], 1)
        b.extend(K.fill_loop(ring, (0, 1, 0), 'paint', holes=[h3]))
        cap = np.array([[0.0, 0.0], [0.030, 0.0], [0.031, 0.004], [0.031, 0.014], [0.028, 0.018], [0.0, 0.018]])
        V, N, T = K.lathe(cap, c, (0, 1, 0), 24)
        b.add(V, N, T, 'trim')
        b.extend(K.box_buf((c[0] - 0.022, c[1] + 0.016, c[2] - 0.005), (c[0] + 0.022, c[1] + 0.024, c[2] + 0.005), 'trim', 0.003, 2))
        return b

    @staticmethod
    def _nearest(P, ref):
        out = np.empty_like(P)
        for i, p in enumerate(P):
            out[i] = ref[np.argmin(((ref - p) ** 2).sum(1))]
        return out


ER = S.ER


def build_test(out):
    import bpy  # noqa
    from lib import modcar as mc
    from frames import _preview as PV
    mc.reset_scene()
    ex = Exterior()
    print('J', len(ex.J['P']), 'crossings A', ex.jl.A[1], 'C', ex.jl.C[1], 'a_edge', ex.gs.a_edge)
    lb_left = ex.lower_body(False)
    lb_right = ex.lower_body(True)
    body = K.Buf()
    body.extend(ex.top_front())
    body.extend(ex.top_rear())
    body.extend(ex.greenhouse())
    body.extend(ex.roof())
    doors = {w: ex.door_skin(w).extend(ex.door_frame(w)) for w in ('F', 'R')}
    eb, panels = ex.edges()
    body.extend(eb)
    body.extend(ex.opening_details())
    left = K.Buf()
    left.extend(body)
    left.extend(lb_left)
    right = K.Buf()
    right.extend(body)
    right.extend(lb_right)
    right.extend(ex.fuel_details())
    full = K.Buf()
    full.extend(left)
    full.extend(right.mirrored())
    full.to_object('BODY')
    ex.fuel_flap().mirrored().to_object('FUEL_CAP')
    gl = ex.glass()
    g = K.Buf()
    for kind in ('ws', 'rw'):
        g.extend(gl[kind])
        g.extend(gl[kind].mirrored())
    g.to_object('GLASS')
    for w in ('F', 'R'):
        b = doors[w]
        b.extend(panels['door_' + w])
        b.to_object('P_door_%sL' % w)
        b.mirrored().to_object('P_door_%sR' % w)
        gl['door_' + w].to_object('PG_door_%sL' % w)
        gl['door_' + w].mirrored().to_object('PG_door_%sR' % w)
    for name in ('hood', 'trunk'):
        b = ex.lid(name)
        b.extend(panels[name])
        full = K.Buf()
        full.extend(b)
        full.extend(b.mirrored())
        full.to_object('P_' + name)
    PV.materials()
    PV.scene_setup('anime')
    for name, yaw, pitch, dist in (('f34', 35, 10, 7.5), ('r34', 145, 12, 7.5), ('side', 270, 2, 8.5)):
        PV.orbit((0, 0, 0.7), yaw, pitch, dist, lens=50)
        PV.render(f'{out}_s2_{name}.png', res=(1200, 680), samples=24)
    PV.orbit((0.9, 0.5, 0.75), 300, 18, 3.2, lens=50)
    PV.render(f'{out}_s2_detail.png', res=(1200, 680), samples=24)
    PV.orbit((-0.4, 0.6, 1.1), 285, 8, 2.6, lens=50)
    PV.render(f'{out}_s2_detail2.png', res=(1200, 680), samples=24)
    debug_views(out)


def debug_views(out):
    from frames import _preview as PV
    PV.orbit((0, 0, 0.6), 270, 89.5, 9, ortho=4.6)
    PV.render(f'{out}_s2_top.png', res=(1400, 700), samples=16)
    PV.camera((1.75, 1.15, 1.35), (1.2, 0.6, 0.86), lens=50)
    PV.render(f'{out}_s2_hood.png', res=(1200, 680), samples=24)
