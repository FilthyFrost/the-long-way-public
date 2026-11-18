"""Goat exterior: the lower body (vertical sides, the front clip with the flat bonnet, both arches, the grille, the
round lamps, the tail lamp recesses, the fuel flap on the right), the greenhouse (the windscreen, the fixed quarter
lights and the big rear side windows, the door frames, a cream roof above the drip line), the cut lines of the doors,
the bonnet and the side-hinged rear door (it spans both shells), rolled edges. Left half; frames/_goat_build.py
mirrors."""
import math
import sys

sys.dont_write_bytecode = True

import numpy as np  # noqa: E402

from frames import _kit as K  # noqa: E402
from frames import goat as S  # noqa: E402
from frames._sedan_ext import Path, edge_rows, interp_curve, side_dir  # noqa: E402

D = S.D
PI = math.pi
DELTA = S.DELTA
ER = S.ER
# colour zones: 0 = body (paint), 1 = the roof (paint_b, above the drip line)
ZMAT = {0: 'paint', 1: 'paint_b'}
T_DRIP = float(S.g_t_of_z(D['drip_z']))


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


# ============================================================================================ junction
def junction():
    s = S.SG
    us = np.unique(np.concatenate([
        np.arange(s[0], s[1], 0.014), np.linspace(s[1], s[2], 16), np.arange(s[2], s[3], 0.014),
        np.linspace(s[3], s[4], 16), np.arange(s[4], s[5], 0.014), [s[5]]]))
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
    """The junction on the lower body loft's top strip: from the crossing A at the A pillar foot along the side and
    across the back to the rear centre (the greenhouse stands on the loft's strip, 2 cm in from the waist's edge)."""

    def __init__(self, J):
        self.J = J
        tend = S.L_T[-1]
        uvL = J['uvL']
        on = (uvL[:, 1] < tend) & (J['P'][:, 0] < 1.0)
        idx = np.nonzero(on)[0]
        i0 = int(idx[0])
        self.i0 = i0
        self.i1 = len(uvL) - 1
        A = self._cross(i0 - 1, i0)
        self.A = A
        self.u = np.concatenate([[A[0][0]], uvL[i0:, 0]])
        self.t = np.concatenate([[tend], uvL[i0:, 1]])
        self.P = np.vstack([A[1], J['P'][i0:]])
        self.NL = np.vstack([A[2], J['NL'][i0:]])
        self.NG = np.vstack([A[3], J['NG'][i0:]])
        self.uvG = np.vstack([A[4], J['uvG'][i0:]])
        # the last point lies on the centre line: force u = loft length
        self.u[-1] = S.L_GUIDE.length

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


def snap_first_to_j(jl):
    """Only the first end on the junction (the rear door's cut ends on the centre line)."""
    def f(uv, P, N):
        uv = uv.copy()
        P = P.copy()
        N = N.copy()
        t, Pj, NL, NG, _ = jl.at(uv[0, 0])
        uv[0, 1] = t[0]
        P[0] = Pj[0]
        N[0] = NL[0]
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

    def zJ(self, x):
        return np.interp(x, self.jx, self.jz)

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


def rrect(x0, x1, z0, z1, r, step=0.03, arc=0.008):
    """Counter-clockwise rounded rectangle in a plane chart's (u, v)."""
    return K.rounded_poly(np.array([(x0, z0), (x1, z0), (x1, z1), (x0, z1)]), [r, r, r, r], step, arc_step=arc)


# ============================================================================================ the exterior
class Exterior:
    def __init__(self):
        self.J = junction()
        self.jl = JLine(self.J)
        self.us = S.l_u_samples()
        self.ts = S.l_t_samples()
        self.cut = {}
        self._rows()
        self._door_cuts()
        self._hood()
        self._gcuts()
        self._rear_door()
        self._openings()

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

    # ------------------------------------------------------------------ cuts
    def _door_cuts(self):
        """The door on the lower body: its front edge down from the waist, then round the front flare (an arc about
        the arch's centre, door_notch_r), along the sill and up the rear edge."""
        jl = self.jl
        xa, za, R = D['ax_f'], D['arch_z'], D['door_notch_r']
        xF, xR, zb = D['fd_front'], D['fd_rear'], D['door_bot']
        uF = float(S.u_of_x(xF))
        uR = float(S.u_of_x(xR))
        zn = za + math.sqrt(R * R - (xF - xa) ** 2)
        a0 = math.atan2(zn - za, xF - xa)
        xe = xa - math.sqrt(R * R - (zb - za) ** 2)
        a1 = math.atan2(zb - za, xe - xa)
        aa = np.linspace(a0, a1, 20)
        ax_, az_ = xa + R * np.cos(aa), za + R * np.sin(aa)
        arc = np.stack([S.u_of_x(ax_), S.t_of_z(ax_, az_)], 1)
        tb = float(S.t_of_z(xR, zb))
        arc[-1, 1] = tb
        pts = np.vstack([[(uF, jl.at(uF)[0][0])], arc, [(uR, tb), (uR, jl.at(uR)[0][0])]])
        radii = np.zeros(len(pts))
        radii[1] = 0.03
        radii[len(arc)] = 0.035
        radii[len(arc) + 1] = 0.035
        uv = K.rounded_poly(pts, radii, 0.03, closed=False, arc_step=0.007)
        uv = K.densify(uv, step_l, closed=False)
        self.cut['doorL'] = Cut(S.CL, uv, False, +1.0, snap_to_j(jl))
        self.notch = (zn, xe)

    def _hood(self):
        hr = D['hood_rear']
        hw = D['hood_w']
        rp = self.row_front_P
        m = rp[:, 0] > 1.8
        o = np.argsort(rp[m, 1])
        ry, rx = rp[m, 1][o], rp[m, 0][o]
        ys = np.linspace(hw - 0.06, 0.0, 10)
        xf = np.interp(ys, ry, rx) - 0.012
        pts = np.vstack([[(hr, 0.0), (hr, hw), (xf[0] - 0.01, hw)], np.stack([xf, ys], 1)[1:]])
        radii = np.zeros(len(pts))
        radii[1] = 0.02
        radii[2] = 0.05
        uv = K.rounded_poly(pts, radii, 0.04, closed=False, arc_step=0.01)
        self.cut['hood'] = Cut(S.CT, uv, False, -1.0)

    def _gcuts(self):
        gs = self.gs = GSide(self.jl)
        zr = gs.zr
        xF, xR = D['fd_front'], D['fd_rear']
        # the door frame: the rear edge straight up, the front edge parallel to the A pillar (as far behind its
        # fillet as the door's front edge is at the waist), across under the rail
        zJf = float(gs.zJ(xF))
        self.a_edge = float(x_aside(zJf) - xF)
        zf = np.linspace(zr, zJf, 10)
        zb = np.linspace(float(gs.zJ(xR)), zr, 10)
        pts = np.vstack([np.stack([np.full(len(zb), xR), zb], 1)[:-1], [(xR, zr)],
                         np.stack([x_aside(zf) - self.a_edge, zf], 1)])
        radii = np.zeros(len(pts))
        radii[len(zb) - 1] = 0.045
        radii[len(zb)] = 0.06
        uv = K.rounded_poly(pts, radii, 0.03, closed=False, arc_step=0.008)
        self.cut['doorG'] = Cut(S.SIDE_G, uv, False, -1.0, snap_side_to_j(gs))
        # the door's window (in its frame, the front edge parallel to the frame's)
        band = D['dw_band']
        z0, z1 = D['dw_z0'], D['dw_z1']
        za = np.linspace(z1, z0, 6)
        off = band / math.cos(math.atan(1.0 / math.tan(S._WR)))
        win = np.vstack([[(D['dw_x0'], z0), (D['dw_x0'], z1)], np.stack([x_aside(za) - self.a_edge - off, za], 1)])
        self.cut['winG'] = [('main', K.ccw(K.rounded_poly(win, [0.03, 0.035, 0.05, 0, 0, 0, 0, 0.02], 0.03, arc_step=0.008)))]
        # the big fixed rear side window in the body's greenhouse
        self.fixed = {'rear': K.ccw(rrect(D['rs_x0'], D['rs_x1'], D['rs_z0'], D['rs_z1'], 0.05))}
        self.win = {}
        ch, uvw, sgn = self.window_opening()
        P, N = ch.to3d(uvw)
        self.win['ws'] = dict(chart=ch, uv=uvw, P=P, N=N, sgn=sgn)

    def window_opening(self):
        """The windscreen: a flat pane between the A pillars, from the cowl up to the header."""
        J = self.J
        O = np.array([float(S.ws_x(0.0, D['belt_z'])), 0.0, D['belt_z']])
        e2 = np.array([-math.cos(S._WR), 0.0, math.sin(S._WR)])
        ch = K.FrameChart(S.G_sdf, O, (0, 1.0, 0), e2)
        s_ang = S._WR
        zj = float(J['P'][0, 2])
        zs_top = 1.738
        rr = D['rho_a']
        sb = (zj - D['belt_z']) / math.sin(s_ang) + 0.035
        st = (zs_top - D['belt_z']) / math.sin(s_ang)
        ss = np.linspace(sb, st, 10)
        zz = D['belt_z'] + ss * math.sin(s_ang)
        ye = S.g_side_w(zz) - rr - 0.03
        side = np.stack([ye, ss], 1)
        pts = np.vstack([[(0.0, st)], side[::-1], [(0.0, sb)]])
        radii = np.zeros(len(pts))
        radii[1] = 0.05
        radii[-2] = 0.04
        uv = K.rounded_poly(pts, radii, 0.035, closed=False, arc_step=0.01)
        return ch, uv, 1.0

    def _rear_door(self):
        """The side-hinged rear door's cut, in two parts: on the lower body's rear wall (from the junction down the
        side edge and across the bottom to the centre line) and on the greenhouse's rear wall (from the junction up
        and across the top to the centre line); the rear window in its upper part."""
        jl = self.jl
        y1, z0, z1 = D['rd_y'], D['rd_z0'], D['rd_z1']
        u1 = float(S.u_of_ry(y1))
        U = S.L_GUIDE.length
        tb = float(S.t_of_z(D['xr'], z0))
        pts = np.array([(u1, float(jl.at(u1)[0][0])), (u1, tb), (U, tb)])
        uv = K.rounded_poly(pts, [0, 0.05, 0], 0.03, closed=False, arc_step=0.007)
        uv = K.densify(uv, step_l, closed=False)
        self.cut['rdL'] = Cut(S.CL, uv, False, +1.0, snap_first_to_j(jl))
        # the upper part in the rear wall's plane (y, z), from the junction at y1 up and across
        Pj = jl.at(u1)[1][0]
        zj = float(Pj[2])
        zs = np.linspace(zj, z1, 10)
        pts = np.vstack([np.stack([np.full(len(zs), y1), zs], 1)[:-1], [(y1, z1), (0.0, z1)]])
        radii = np.zeros(len(pts))
        radii[len(zs) - 1] = 0.05
        yz = K.rounded_poly(pts, radii, 0.03, closed=False, arc_step=0.008)

        def snap(uv_, P, N):
            uv_ = uv_.copy()
            P = P.copy()
            N = N.copy()
            # first end onto the junction (its rear wall point at that half width), last onto the centre line
            uj = float(S.u_of_ry(uv_[0, 0]))
            _, Pq, NL, NG, _ = jl.at(uj)
            uv_[0, 1] = Pq[0][2]
            P[0] = Pq[0]
            N[0] = NG[0]
            uv_[-1, 0] = 0.0
            P[-1, 1] = 0.0
            return uv_, P, N
        self.cut['rdG'] = Cut(S.REAR_G, yz, False, +1.0, snap)
        w = K.rounded_poly(np.array([(0.0, D['rw_z0']), (D['rw_y'], D['rw_z0']), (D['rw_y'], D['rw_z1']), (0.0, D['rw_z1'])]),
                           [0, 0.04, 0.04, 0], 0.03, closed=False, arc_step=0.008)
        P, N = S.REAR_G.to3d(w)
        self.rear_win = dict(yz=w, P=P, N=N)

    def _openings(self):
        self.open = {}
        gw, z0, z1 = D['grille_w'], D['grille_z0'], D['grille_z1']
        g = K.rounded_poly(np.array([(0.0, z1), (gw, z1), (gw, z0), (0.0, z0)]), [0, 0.025, 0.025, 0], 0.03, closed=False, arc_step=0.007)
        P, N = S.FRONT_L.to3d(g)
        self.open['grille'] = dict(uv=S.CL.to2d(P), P=P, N=N, yz=g)
        c = K.circle_loop(D['lamp_y'], D['lamp_z'], D['lamp_d'] / 2, 0.011)
        P, N = S.FRONT_L.to3d(c)
        self.open['lamp'] = dict(uv=S.CL.to2d(P), P=P, N=N, yz=c)
        t = rrect(D['tail_y0'], D['tail_y1'], D['tail_z0'], D['tail_z1'], 0.012, 0.03, 0.006)
        P, N = S.REAR_L.to3d(t)
        self.open['tail'] = dict(uv=S.CL.to2d(P), P=P, N=N, yz=t)
        # fuel flap on the right rear quarter, over the arch (built on the left, mirrored)
        f = K.circle_loop(-1.52, 1.045, 0.054, 0.009)
        self.cut['fuel'] = Cut(S.SIDE_L, f, True, +1.0)

    # ------------------------------------------------------------------ regions: lower body
    def arch_notch(self, xa):
        R = D['arch_f'] if xa > 0 else D['arch_r']
        za = D['arch_z']
        zb = float(S._bot(xa))
        th = math.asin((zb - za) / R)
        ths = np.linspace(th, PI - th, 48)
        ax = xa + R * np.cos(ths)
        az = za + R * np.sin(ths)
        uv = np.stack([S.u_of_x(ax), S.t_of_z(ax, az)], 1)
        down = np.linspace(S.L_T[0], S.L_T[1], 3)
        front = np.stack([np.full(len(down), uv[0, 0]), down], 1)
        rear = np.stack([np.full(len(down), uv[-1, 0]), down[::-1]], 1)
        return np.vstack([front[:-1], uv, rear[1:]])

    def lower_body(self, fuel=False):
        tend = S.L_T[-1]
        us, ts = self.us, self.ts
        U = S.L_GUIDE.length
        p = Path()
        self.arch_uv, self.arch_P = [], []
        u_prev = 0.0
        for xa in (D['ax_f'], D['ax_r']):
            nt = self.arch_notch(xa)
            seg = us[(us >= u_prev - 1e-9) & (us < nt[0, 0] - 1e-4)]
            p.add(np.stack([seg, np.full(len(seg), S.L_T[0])], 1))
            P, N = S.CL.to3d(nt)
            p.add(nt, P, N)
            self.arch_uv.append(nt)
            self.arch_P.append((P, N))
            u_prev = nt[-1, 0] + 1e-4
        seg = us[us > u_prev]
        p.add(np.stack([seg, np.full(len(seg), S.L_T[0])], 1))
        # rear centre line up to the rear door's cut (the body side of it), the cut out to the junction
        ro = self.cut['rdL'].side('out')
        tt = ts[(ts > S.L_T[0]) & (ts < ro['uv'][-1, 1] - 0.004)]
        p.add(np.stack([np.full(len(tt), U), tt], 1))
        p.add(ro['uv'][::-1], ro['P'][::-1], ro['N'][::-1])
        self.rd_out = dict(uv=ro['uv'][::-1], P=ro['P'][::-1], N=ro['N'][::-1])
        # junction from the rear door round the rear corner to the door's rear edge
        out = self.cut['doorL'].side('out')
        uv, P, NL, NG, _ = self.jl.between(ro['uv'][0, 0], out['uv'][-1, 0])
        p.add(uv, P, NL, drop_first=True, drop_last=True)
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
        holes = [K.Loop(self.open[k]['uv'], self.open[k]['P'], self.open[k]['N']) for k in ('lamp', 'tail')]
        if fuel:
            so = self.cut['fuel'].side('out')
            holes.append(K.Loop(S.CL.to2d(so['P']), so['P'], so['N']))
        pts, sp = S.grid_from(us, ts)
        V, N, T = K.mesh_region(S.CL, [loop], holes, pts, spacing=sp)
        return K.Buf().add(V, N, T, 'paint')

    def door_skin(self):
        s = self.cut['doorL'].side('in')
        p = Path()
        p.add(s['uv'], s['P'], s['N'])
        uv, P, NL, NG, _ = self.jl.between(s['uv'][-1, 0], s['uv'][0, 0])
        p.add(uv, P, NL, drop_first=True, drop_last=True)
        loop = p.loop()
        pts, sp = S.grid_from(self.us, self.ts)
        pts, sp = edge_rows(S.CL, [P], pts, sp, loop.uv, offs=(0.011, 0.024, 0.040, 0.060), step=0.024, clear=0.075)
        V, N, T = K.mesh_region(S.CL, [loop], [], pts, spacing=sp)
        return K.Buf().add(V, N, T, 'paint')

    def rear_door_low(self):
        """The rear door's lower skin (left half): inside the cut, up to the junction, along the centre line."""
        s = self.cut['rdL'].side('in')
        U = S.L_GUIDE.length
        p = Path()
        p.add(s['uv'], s['P'], s['N'])
        t_c = float(self.jl.t[-1])
        tt = self.ts[(self.ts > s['uv'][-1, 1] + 0.004) & (self.ts < t_c - 0.004)]
        p.add(np.stack([np.full(len(tt), U), tt], 1))
        uv, P, NL, NG, _ = self.jl.between(U, s['uv'][0, 0])
        p.add(uv, P, NL, drop_last=True)
        loop = p.loop()
        pts, sp = S.grid_from(self.us, self.ts)
        V, N, T = K.mesh_region(S.CL, [loop], [], pts, spacing=sp)
        return K.Buf().add(V, N, T, 'paint')

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
        xg, yg = np.meshgrid(np.arange(0.85, 2.2, 0.05), np.arange(0.0, 0.85, 0.04), indexing='ij')
        g = np.stack([xg.ravel(), yg.ravel()], 1)
        V, N, T = K.mesh_region(S.CT, [p.loop()], [], g, spacing=0.04)
        return K.Buf().add(V, N, T, 'paint')

    def hood(self):
        """The flat bonnet (left half) with a cream stripe down its middle."""
        s = self.cut['hood'].side('in')
        p = Path()
        p.add(s['uv'], s['P'], s['N'])
        x0 = s['uv'][-1, 0]
        x1 = s['uv'][0, 0]
        xs = np.linspace(x0, x1, max(2, int(abs(x1 - x0) / 0.04) + 1))[1:-1]
        p.add(np.stack([xs, np.zeros(len(xs))], 1))
        bb = s['uv']
        xg, yg = np.meshgrid(np.arange(bb[:, 0].min() - 0.05, bb[:, 0].max() + 0.05, 0.06), np.arange(0.0, 0.8, 0.06), indexing='ij')
        g = np.stack([xg.ravel(), yg.ravel()], 1)
        xa, xb = HOOD_STRIPE[0], HOOD_STRIPE[1]
        lines = [(1, HOOD_STRIPE[2], xa, xb), (0, xa, 0.0, HOOD_STRIPE[2]), (0, xb, 0.0, HOOD_STRIPE[2])]

        def zone(c):
            return np.where((c[:, 1] < HOOD_STRIPE[2]) & (c[:, 0] > xa) & (c[:, 0] < xb), 1, 0)
        V, N, T, Z = K.mesh_region_split(S.CT, [p.loop()], [], g, lines=lines, zone_fn=zone, spacing=0.06)
        return K.add_zones(K.Buf(), V, N, T, Z, ZMAT)

    # ------------------------------------------------------------------ greenhouse
    def _g_lines(self):
        return [(1, T_DRIP, 0.0, S.G_GUIDE.length)]

    @staticmethod
    def _g_zone(c):
        return np.where(c[:, 1] > T_DRIP, 1, 0)

    def fixed_holes(self):
        holes = []
        self.fixed_P = {}
        for name, poly in self.fixed.items():
            P, N = S.SIDE_G.to3d(poly)
            holes.append(K.Loop(S.CG.to2d(P), P, N))
            self.fixed_P[name] = (poly, P, N)
        return holes

    def greenhouse(self, level=0.0):
        J = self.J
        gus = S.g_u_samples()
        gts = S.g_t_samples()
        UG = S.G_GUIDE.length
        fo = self.cut['doorG'].side('out')
        ro = self.cut['rdG'].side('out')
        ws = self.win['ws']
        p = Path()
        uv_f = S.CG.to2d(fo['P'])
        ua = uv_f[-1, 0]
        m = J['uvG'][:, 0] < ua - 1e-4
        p.add(J['uvG'][m], J['P'][m], J['NG'][m])
        p.add(uv_f[::-1], fo['P'][::-1], fo['N'][::-1])
        uv_r = S.CG.to2d(ro['P'])
        m = (J['uvG'][:, 0] > uv_f[0, 0] + 1e-4) & (J['uvG'][:, 0] < uv_r[0, 0] - 1e-4)
        p.add(J['uvG'][m], J['P'][m], J['NG'][m])
        uv_r[-1, 0] = UG
        p.add(uv_r, ro['P'], ro['N'])
        tt = gts[gts > uv_r[-1, 1] + 0.004]
        p.add(np.stack([np.full(len(tt), UG), tt], 1))
        uu = gus[::-1]
        p.add(np.stack([uu, np.full(len(uu), S.G_T[-1])], 1), drop_first=True, drop_last=True)
        ws_uv = S.CG.to2d(ws['P'])
        tt = gts[gts > ws_uv[0, 1] + 0.004][::-1]
        p.add(np.stack([np.zeros(len(tt)), tt], 1))
        p.add(ws_uv, ws['P'], ws['N'])
        tt = gts[(gts < ws_uv[-1, 1] - 0.004) & (gts > J['uvG'][0, 1] + 0.004)][::-1]
        p.add(np.stack([np.zeros(len(tt)), tt], 1))
        loop = p.loop()
        holes = self.fixed_holes()
        if level < 0:
            loop = K.Loop(K.resample(loop.uv, 0.035, closed=True))
            holes = [K.Loop(h.uv) for h in holes]
            cu = np.linspace(0, UG, int(UG / 0.09))
            ct = np.unique(np.concatenate([np.linspace(S.G_T[0], S.G_T[2], 8), np.linspace(S.G_T[2], S.G_T[4], 5)]))
            pts, sp = S.grid_from(cu, ct)
            V, N, T = K.mesh_region(S.CG, [loop], holes, pts, spacing=sp, level=level)
            return K.Buf().add(V, -N, T, 'plastic_int')
        pts, sp = S.grid_from(gus, gts)
        pts, sp = edge_rows(S.CG, [ws['P']], pts, sp, loop.uv)
        pts, sp = self.a_pillar_rows(pts, sp)
        V, N, T, Z = K.mesh_region_split(S.CG, [loop], holes, pts, lines=self._g_lines(), zone_fn=self._g_zone, spacing=sp)
        return K.add_zones(K.Buf(), V, N, T, Z, ZMAT)

    def a_pillar_rows(self, pts, sp, step=0.024):
        """Columns of points up the A pillar's fillet, one every step, in place of the grid there: the windscreen's
        edge rows reach a quarter of the way round the fillet, the grid kept two columns on the rest of it with its
        rows 12 cm apart, and the triangles from the edge rows to the door's cut chopped across it (a scalloped
        pillar seen from behind, the chords 12 mm inside the fillet). The fillet is a line of constant u in CG; a column
        a quarter of the way round keeps only its points clear of the edge rows (at the pillar's foot and head, where
        the windscreen's corners turn away from it)."""
        s1, s2 = S.SG[1], S.SG[2]
        cols = s1 + (s2 - s1) * np.array([0.25, 0.5, 0.75, 1.0])
        uvJ = self.J['uvG']
        o = np.argsort(uvJ[:, 0])
        tJ = np.interp(cols, uvJ[o, 0], uvJ[o, 1])
        t_hi = T_DRIP - 0.012
        band = ((pts[:, 0] > s1 + 0.4 * (s2 - s1)) & (pts[:, 0] < s2 + 0.008) & (pts[:, 1] > float(tJ.min()))
                & (pts[:, 1] < t_hi + 0.006))
        R = np.vstack([np.stack([np.full(len(ts), u), ts], 1)
                       for u, ts in ((u, np.arange(t0 + 0.012, t_hi, step)) for u, t0 in zip(cols, tJ))])
        kept = pts[~band]
        clear = ((R[:, None, :] - kept[None, :, :]) ** 2).sum(2).min(1) > 0.009 ** 2
        R = R[clear]
        sp = np.broadcast_to(np.asarray(sp, float), (len(pts),))
        return np.vstack([kept, R]), np.concatenate([sp[~band], np.full(len(R), 0.6 * step)])

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

    def rear_door_high(self):
        """The rear door's upper skin (left half): inside its cut on the greenhouse's rear wall, down to the junction,
        the window's notch on the centre line."""
        s = self.cut['rdG'].side('in')
        jl = self.jl
        U = S.L_GUIDE.length
        rw = self.rear_win
        p = Path()
        # (in the rear wall's plane, y and z: the cut's inner side from the junction up and across to the centre)
        p.add(s['uv'], s['P'], s['N'])
        zc = s['uv'][-1, 1]
        zz = np.linspace(zc, D['rw_z1'], max(2, int(abs(zc - D['rw_z1']) / 0.03) + 1))[1:-1]
        p.add(np.stack([np.zeros(len(zz)), zz], 1))
        p.add(rw['yz'][::-1], rw['P'][::-1], rw['N'][::-1])
        zj = float(jl.P[-1, 2])
        zz = np.linspace(D['rw_z0'], zj, max(2, int(abs(D['rw_z0'] - zj) / 0.03) + 1))[1:-1]
        p.add(np.stack([np.zeros(len(zz)), zz], 1))
        uv, P, NL, NG, _ = jl.between(U, float(S.u_of_ry(s['uv'][0, 0])))
        p.add(np.stack([P[:, 1], P[:, 2]], 1), P, NG, drop_last=True)
        g = K.grid_points(0.0, D['rd_y'], 1.15, D['rd_z1'], 0.07, dt=0.07)
        V, N, T = K.mesh_region(S.REAR_G, [p.loop()], [], g, spacing=0.07)
        return K.Buf().add(V, N, T, 'paint')

    def roof(self):
        gus = S.g_u_samples()
        row = np.stack([gus, np.full(len(gus), S.G_T[-1])], 1)
        Pr, Nr = S.CG.to3d(row)
        a, b = Pr[-1], Pr[0]
        xs = np.linspace(a[0], b[0], max(3, int(abs(b[0] - a[0]) / 0.04)))[1:-1]
        Pc, Nc = S.CR.to3d(np.stack([xs, np.zeros(len(xs))], 1))
        P = np.vstack([Pr, Pc])
        Nn = np.vstack([Nr, Nc])
        xg, yg = np.meshgrid(np.arange(-1.9, 0.95, 0.10), np.arange(0.0, 0.75, 0.10), indexing='ij')
        g = np.stack([xg.ravel(), yg.ravel()], 1)
        V, N, T = K.mesh_region(S.CR, [K.Loop(P[:, :2], P, Nn)], [], g, spacing=0.10)
        return K.Buf().add(V, N, T, 'paint_b')

    def glass(self):
        out = {}
        wv = self.win['ws']
        ch, uv, sgn = wv['chart'], wv['uv'], wv['sgn']
        big = K.offset_loop2(uv, sgn * 0.014, closed=False)
        big[0, 0] = 0.0
        big[-1, 0] = 0.0
        ss = np.linspace(big[-1, 1], big[0, 1], 20)[1:-1]
        loop = np.vstack([big, np.stack([np.zeros(len(ss)), ss], 1)])
        g = K.grid_points(-0.9, 0.9, -0.2, 0.8, 0.10, dt=0.10)
        V, N, T = K.mesh_region(ch, [K.Loop(K.resample_keep(loop, 0.05))], [], g, spacing=0.10, level=-0.007)
        out['ws'] = K.Buf().add(V, N, T, 'glass')
        b = K.Buf()
        for name, poly in self.cut['winG']:
            big = K.offset_loop2(poly, -0.012)
            g = K.grid_points(-0.3, 1.0, 1.1, 1.8, 0.10, dt=0.10)
            V, N, T = K.mesh_region(S.SIDE_G, [K.Loop(big)], [], g, spacing=0.10, level=-0.012)
            b.add(V, N, T, 'glass')
        out['door'] = b
        b = K.Buf()
        for name, poly in self.fixed.items():
            big = K.offset_loop2(poly, -0.012)
            lo, hi = poly.min(0), poly.max(0)
            g = K.grid_points(lo[0], hi[0], lo[1], hi[1], 0.12, dt=0.12)
            V, N, T = K.mesh_region(S.SIDE_G, [K.Loop(big)], [], g, spacing=0.12, level=-0.012)
            b.add(V, N, T, 'glass')
        out['fixed'] = b
        rw = self.rear_win['yz']
        big = K.offset_loop2(rw, 0.012, closed=False)
        big[0, 0] = 0.0
        big[-1, 0] = 0.0
        zz = np.linspace(big[-1, 1], big[0, 1], 8)[1:-1]
        loop = np.vstack([big, np.stack([np.zeros(len(zz)), zz], 1)])
        g = K.grid_points(0.0, 0.5, 1.3, 1.7, 0.12, dt=0.12)
        V, N, T = K.mesh_region(S.REAR_G, [K.Loop(K.ccw(loop))], [], g, spacing=0.12, level=-0.012)
        out['rear'] = K.Buf().add(V, N, T, 'glass')
        return out

    def fuel_flap(self):
        s = self.cut['fuel'].side('in')
        V, N, T = K.mesh_region(S.SIDE_L, [K.Loop(s['uv'], s['P'], s['N'])], [], None, spacing=0.03)
        return K.Buf().add(V, N, T, 'paint')


# the bonnet's cream stripe: x from, x to, half width
HOOD_STRIPE = (1.13, 2.00, 0.15)
