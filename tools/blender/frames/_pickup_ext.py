"""Pickup exterior: cab (lower body + greenhouse, one door per side), cargo bed (outer skin, top rails, inner
walls, ribbed floor, wheel tubs), tailgate, openings, rolled edges. Left half; frames/_pickup_build.py mirrors."""
import math
import sys

sys.dont_write_bytecode = True

import numpy as np  # noqa: E402

from frames import _kit as K  # noqa: E402
from frames import pickup as S  # noqa: E402
from frames._sedan_ext import Path, side_dir, interp_curve, edge_rows  # noqa: E402

D = S.D
PI = math.pi
DELTA = S.DELTA
ER = S.ER


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
    """Junction on the lower body loft's top strip: from the crossing A at the A pillar foot round the side and
    the cab back to the rear centre (the pickup's greenhouse rear wall stands on the loft strip)."""

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
        self._openings()
        self._bed_cuts()

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
        jl = self.jl
        tb = float(S.t_of_z(0.4, D['door_bot']))
        uF = float(S.u_of_x(D['fd_front']))
        uR = float(S.u_of_x(D['fd_rear']))
        pts = [(uF, jl.at(uF)[0][0]), (uF, tb), (uR, tb), (uR, jl.at(uR)[0][0])]
        uv = K.rounded_poly(np.array(pts), [0, 0.04, 0.03, 0], 0.03, closed=False, arc_step=0.007)
        uv = K.densify(uv, step_l, closed=False)
        self.cut['doorL'] = Cut(S.CL, uv, False, +1.0, snap_to_j(jl))

    def _hood(self):
        hr = D['hood_rear']
        hw = D['hood_w']
        rp = self.row_front_P
        m = rp[:, 0] > 1.8
        o = np.argsort(rp[m, 1])
        ry, rx = rp[m, 1][o], rp[m, 0][o]
        ys = np.linspace(0.66, 0.0, 10)
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
        radii[len(cedge)] = 0.06
        uv = K.rounded_poly(pts, radii, 0.03, closed=False, arc_step=0.008)
        self.cut['doorG'] = Cut(S.SIDE_G, uv, False, -1.0, snap_side_to_j(gs))
        # the single door glass opening (frame band 24 mm)
        band = 0.026
        zb = float(gs.zJ(0.3)) + 0.016
        zr_in = zr - band
        z0 = float(gs.zJ(D['fd_front']))
        ang = math.atan2(float(gs.a_edge_x(zr) - gs.a_edge_x(z0)), zr - z0)
        off = band / math.cos(ang)
        za = np.linspace(zr_in, zb, 6)
        xr_ = float(gs.c_edge_x(zb)) + band
        win = np.vstack([[(xr_, zb), (float(gs.c_edge_x(zr_in)) + band, zr_in)], np.stack([gs.a_edge_x(za) - off, za], 1)])
        radii = [0.012, 0.03, 0.05, 0, 0, 0, 0, 0.012]
        loop = K.ccw(K.rounded_poly(win, radii, 0.03, arc_step=0.008))
        self.cut['winG'] = [('main', loop)]
        # windscreen and rear window (flat-ish glass)
        self.win = {}
        for kind in ('ws', 'rw'):
            ch, uvw, sgn = self.window_opening(kind)
            P, N = ch.to3d(uvw)
            self.win[kind] = dict(chart=ch, uv=uvw, P=P, N=N, sgn=sgn)

    def window_opening(self, kind):
        J = self.J
        if kind == 'ws':
            O = np.array([float(S.ws_x(0.0, D['belt_z'])), 0.0, D['belt_z']])
            e2 = np.array([-math.cos(S._WR), 0.0, math.sin(S._WR)])
            ch = K.FrameChart(S.G_sdf, O, (0, 1.0, 0), e2)
            s_ang = S._WR
            zj = float(J['P'][0, 2])
            zs_top = float(S.roof_z(0.55, 0.0) - D['r_header'] * (1 - math.sin(S.PHI_F))) - 0.02
            rr = D['rho_a']
            sgn = 1.0
            margin_b = 0.03
        else:
            O = np.array([D['rw_x'], 0.0, D['belt_z']])
            ch = K.FrameChart(S.G_sdf, O, (0, -1.0, 0), (0, 0, 1.0))
            s_ang = PI / 2
            zj = float(J['P'][-1, 2])
            zs_top = float(S.roof_z(-0.2, 0.0) - D['r_rheader']) - 0.03
            rr = D['rho_c']
            sgn = -1.0
            margin_b = 0.10
        sb = (zj - D['belt_z']) / math.sin(s_ang) + margin_b
        st = (zs_top - D['belt_z']) / math.sin(s_ang)
        ss = np.linspace(sb, st, 10)
        zz = D['belt_z'] + ss * math.sin(s_ang)
        ye = S.g_side_w(zz) - rr - (0.026 if kind == 'ws' else 0.12)
        side = np.stack([sgn * ye, ss], 1)
        pts = np.vstack([[(0.0, st)], side[::-1], [(0.0, sb)]])
        radii = np.zeros(len(pts))
        radii[1] = 0.06 if kind == 'ws' else 0.07
        radii[-2] = 0.04 if kind == 'ws' else 0.07
        uv = K.rounded_poly(pts, radii, 0.035, closed=False, arc_step=0.01)
        return ch, uv, sgn

    def _openings(self):
        self.open = {}
        gw, z0, z1 = D['grille_w'], D['grille_z0'], D['grille_z1']
        g = K.rounded_poly(np.array([(0.0, z1), (gw, z1), (gw, z0), (0.0, z0)]), [0, 0.02, 0.02, 0], 0.03, closed=False, arc_step=0.007)
        P, N = S.FRONT_L.to3d(g)
        self.open['grille'] = dict(uv=S.CL.to2d(P), P=P, N=N, yz=g)
        ly, lz, lw, lh = D['lamp_y'], D['lamp_z'], D['lamp_w'], D['lamp_h']
        c = K.rounded_poly(np.array([(ly - lw / 2, lz - lh / 2), (ly + lw / 2, lz - lh / 2), (ly + lw / 2, lz + lh / 2), (ly - lw / 2, lz + lh / 2)]),
                           [0.02, 0.02, 0.02, 0.02], 0.03, arc_step=0.007)
        P, N = S.FRONT_L.to3d(c)
        self.open['lamp'] = dict(uv=S.CL.to2d(P), P=P, N=N, yz=c)

    # ------------------------------------------------------------------ bed cuts
    def _bed_cuts(self):
        """Rear arch notch on the bed side, tail lamp recesses on the rear posts, fuel flap (left)."""
        self.bed = {}
        xa = D['ax_r']
        R = D['arch_r']
        za = D['hub_z']
        zb = D['bed_z0']
        th = math.asin((zb - za) / R)
        ths = np.linspace(th, PI - th, 44)
        ax = xa + R * np.cos(ths)
        az = za + R * np.sin(ths)
        uv = np.stack([S.ub_of_x(ax), S.tb_of_z(az)], 1)
        down = np.linspace(S.BED_T[0], S.BED_T[1], 3)
        front = np.stack([np.full(len(down), uv[0, 0]), down], 1)
        rear = np.stack([np.full(len(down), uv[-1, 0]), down[::-1]], 1)
        self.bed['arch'] = np.vstack([front[:-1], uv, rear[1:]])
        # tail lamp recess on the rear post (rear view coordinates y, z)
        y0_, y1_ = D['bed_in'] + 0.012, D['bed_hw'] - 0.020
        t = K.rounded_poly(np.array([(y0_, 0.70), (y1_, 0.70), (y1_, 0.93), (y0_, 0.93)]), [0.010] * 4, 0.03, arc_step=0.006)
        P, N = S.REAR_B.to3d(t)
        self.bed['tail'] = dict(uv=S.CB.to2d(P), P=P, N=N, yz=t)
        # fuel flap on the left bed side ahead of the rear arch
        f = K.circle_loop(-0.66, 0.875, 0.052, 0.009)
        self.cut['fuel'] = Cut(S.SIDE_B, f, True, +1.0)

    # ------------------------------------------------------------------ regions: cab lower body
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
        U = S.L_GUIDE.length
        p = Path()
        nt = self.arch_notch(D['ax_f'])
        self.arch_uv = [nt]
        seg = us[us < nt[0, 0] - 1e-4]
        p.add(np.stack([seg, np.full(len(seg), S.L_T[0])], 1))
        P, N = S.CL.to3d(nt)
        self.arch_P = [(P, N)]
        p.add(nt, P, N)
        seg = us[us > nt[-1, 0] + 1e-4]
        p.add(np.stack([seg, np.full(len(seg), S.L_T[0])], 1))
        # rear centre line up to the junction (the cab back)
        tj_end = self.jl.t[-1]
        tt = ts[(ts > S.L_T[0]) & (ts < tj_end - 0.004)]
        p.add(np.stack([np.full(len(tt), U), tt], 1))
        # junction from the rear centre round the cab back to the door's rear edge
        out = self.cut['doorL'].side('out')
        uv, P, NL, NG, _ = self.jl.between(U, out['uv'][-1, 0])
        p.add(uv, P, NL, drop_last=True)
        # door opening (outer boundary reversed: rear edge down, bottom, front edge up)
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
        # rows of points under the belt (no fans of thin triangles from its dense edge)
        pts, sp = edge_rows(S.CL, [P], pts, sp, loop.uv, offs=(0.011, 0.024, 0.040, 0.060), step=0.024, clear=0.075)
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
        V, N, T = K.mesh_region(S.CT, [p.loop()], [], g, spacing=0.06)
        return K.Buf().add(V, N, T, 'paint')

    # ------------------------------------------------------------------ greenhouse
    def greenhouse(self, level=0.0):
        J = self.J
        gus = S.g_u_samples()
        gts = S.g_t_samples()
        UG = S.G_GUIDE.length
        fo = self.cut['doorG'].side('out')
        ws = self.win['ws']
        rw = self.win['rw']
        p = Path()
        uv_f = S.CG.to2d(fo['P'])
        ua = uv_f[-1, 0]
        m = J['uvG'][:, 0] < ua - 1e-4
        p.add(J['uvG'][m], J['P'][m], J['NG'][m])
        p.add(uv_f[::-1], fo['P'][::-1], fo['N'][::-1])
        m = J['uvG'][:, 0] > uv_f[0, 0] + 1e-4
        p.add(J['uvG'][m], J['P'][m], J['NG'][m])
        rw_uv = S.CG.to2d(rw['P'])
        tt = gts[(gts > J['uvG'][-1, 1] + 0.004) & (gts < rw_uv[-1, 1] - 0.004)]
        p.add(np.stack([np.full(len(tt), UG), tt], 1))
        p.add(rw_uv[::-1], rw['P'][::-1], rw['N'][::-1])
        tt = gts[gts > rw_uv[0, 1] + 0.004]
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
        if level < 0:
            loop = K.Loop(K.resample(loop.uv, 0.035, closed=True))
            cu = np.linspace(0, UG, int(UG / 0.09))
            ct = np.unique(np.concatenate([np.linspace(S.G_T[0], S.G_T[2], 6), np.linspace(S.G_T[2], S.G_T[4], 5)]))
            pts, sp = S.grid_from(cu, ct)
            V, N, T = K.mesh_region(S.CG, [loop], [], pts, spacing=sp, level=level)
            return K.Buf().add(V, -N, T, 'plastic_int')
        pts, sp = S.grid_from(gus, gts)
        pts, sp = edge_rows(S.CG, [self.win[k]['P'] for k in ('ws', 'rw')], pts, sp, loop.uv)
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

    def roof(self):
        gus = S.g_u_samples()
        row = np.stack([gus, np.full(len(gus), S.G_T[-1])], 1)
        Pr, Nr = S.CG.to3d(row)
        a, b = Pr[-1], Pr[0]
        xs = np.linspace(a[0], b[0], max(3, int(abs(b[0] - a[0]) / 0.04)))[1:-1]
        Pc, Nc = S.CR.to3d(np.stack([xs, np.zeros(len(xs))], 1))
        P = np.vstack([Pr, Pc])
        Nn = np.vstack([Nr, Nc])
        xg, yg = np.meshgrid(np.arange(-0.3, 0.7, 0.085), np.arange(0.0, 0.75, 0.085), indexing='ij')
        g = np.stack([xg.ravel(), yg.ravel()], 1)
        V, N, T = K.mesh_region(S.CR, [K.Loop(P[:, :2], P, Nn)], [], g, spacing=0.085)
        return K.Buf().add(V, N, T, 'paint')

    def glass(self):
        out = {}
        for kind in ('ws', 'rw'):
            wv = self.win[kind]
            ch, uv, sgn = wv['chart'], wv['uv'], wv['sgn']
            big = K.offset_loop2(uv, sgn * 0.014, closed=False)
            big[0, 0] = 0.0
            big[-1, 0] = 0.0
            ss = np.linspace(big[-1, 1], big[0, 1], 20)[1:-1]
            loop = np.vstack([big, np.stack([np.zeros(len(ss)), ss], 1)])
            g = K.grid_points(-0.9, 0.9, -0.2, 0.8, 0.10, dt=0.10)
            V, N, T = K.mesh_region(ch, [K.Loop(K.resample_keep(loop, 0.05))], [], g, spacing=0.10, level=-0.007)
            out[kind] = K.Buf().add(V, N, T, 'glass')
        b = K.Buf()
        for name, poly in self.cut['winG']:
            big = K.offset_loop2(poly, -0.012)
            g = K.grid_points(-0.5, 1.0, 1.0, 1.6, 0.10, dt=0.10)
            V, N, T = K.mesh_region(S.SIDE_G, [K.Loop(big)], [], g, spacing=0.10, level=-0.012)
            b.add(V, N, T, 'glass')
        out['door'] = b
        return out

    # ------------------------------------------------------------------ bed regions
    def bed_outer(self, fuel=False):
        """Outer skin of the bed (sides, front wall, rear posts) with the arch notch and lamp recesses, left half."""
        us = S.b_u_samples()
        ts = S.b_t_samples()
        UB = S.BED_GUIDE.length
        tend = S.BED_T[-1]
        p = Path()
        nt = self.bed['arch']
        seg = us[us < nt[0, 0] - 1e-4]
        p.add(np.stack([seg, np.full(len(seg), S.BED_T[0])], 1))
        P, N = S.CB.to3d(nt)
        self.bed['arch_P'] = (P, N)
        p.add(nt, P, N)
        # the rear end: the loft continues round the rear post only out to the tailgate opening (|y| > bed_in)
        u_post = S.SB[4] + (D['bed_hw'] - 0.015 - (D['bed_in'] + 0.002))
        seg = us[(us > nt[-1, 0] + 1e-4) & (us < u_post - 1e-4)]
        p.add(np.stack([np.concatenate([seg, [u_post]]), np.full(len(seg) + 1, S.BED_T[0])], 1))
        tt = ts[(ts > S.BED_T[0]) & (ts < tend)]
        p.add(np.stack([np.full(len(tt), u_post), tt], 1))
        uu = us[(us < u_post - 1e-4)][::-1]
        p.add(np.stack([np.concatenate([[u_post], uu]), np.full(len(uu) + 1, tend)], 1), drop_first=True)
        tt = ts[(ts > S.BED_T[0]) & (ts < tend)][::-1]
        p.add(np.stack([np.zeros(len(tt)), tt], 1))
        loop = p.loop()
        tl = self.bed['tail']
        holes = [K.Loop(tl['uv'], tl['P'], tl['N'])]
        if fuel:
            so = self.cut['fuel'].side('out')
            holes.append(K.Loop(S.CB.to2d(so['P']), so['P'], so['N']))
        pts, sp = S.grid_from(us, ts)
        V, N, T = K.mesh_region(S.CB, [loop], holes, pts, spacing=sp)
        self.bed['u_post'] = u_post
        return K.Buf().add(V, N, T, 'paint')

    def bed_inner(self):
        """Inner wall, ribbed floor, wheel tub and the headboard's inside face (left half)."""
        b = K.Buf()
        xr, xf = D['bed_xr'], D['bed_xf'] - 0.05
        fl, top = D['bed_floor'], D['bed_z1']
        tx = D['ax_r']
        tw = 0.42
        ty = D['bed_in'] - 0.205
        # inner side wall: rays from the centre line outwards (+y)
        ch = K.PlaneChart(S.B_sdf, axis=1, sign=-1.0, start=0.0)
        loop = np.array([(xr + 0.001, fl + 0.002), (xf + 0.004, fl + 0.002), (xf + 0.004, top - 0.002), (xr + 0.001, top - 0.002)])
        g = K.grid_points(xr, xf, fl, top, 0.10, dt=0.07)
        V, N, T = K.mesh_region(ch, [K.Loop(K.resample_keep(loop, 0.08))], [], g, spacing=0.07)
        b.add(V, N, T, 'paint')
        # wheel tub: a bevelled box set into the floor and the side wall
        b.extend(K.box_buf((tx - tw, ty, fl - 0.02), (tx + tw, D['bed_in'] + 0.02, 0.985), 'paint', 0.035, 2))
        # floor: rays from above, round the tub footprint; ribs are separate swept strips
        loop = np.array([(xr + 0.001, 0.0), (xf + 0.003, 0.0), (xf + 0.003, D['bed_in'] - 0.002), (xr + 0.001, D['bed_in'] - 0.002)])
        g = K.grid_points(xr + 0.05, xf - 0.02, 0.02, D['bed_in'] - 0.02, 0.15, dt=0.12)
        V, N, T = K.mesh_region(S.CBT, [K.Loop(K.resample_keep(loop, 0.08))], [], g, spacing=0.12)
        b.add(V, N, T, 'paint')
        rib = K.round_profile(np.array([(-0.024, 0.0), (-0.016, 0.005), (0.016, 0.005), (0.024, 0.0)]), 0.004, 1)
        for yc in np.arange(0.055, D['bed_in'] - 0.03, 0.11):
            spans = [(xr + 0.006, xf - 0.004)]
            if yc + 0.024 > ty - 0.003:
                spans = [(xr + 0.006, tx - tw - 0.01), (tx + tw + 0.01, xf - 0.004)]
            for (a0, a1) in spans:
                path = np.array([(a0, yc, fl), (a1, yc, fl)])
                V, N, T = K.sweep(path, (0, 0, 1), np.stack([-rib[:, 0], rib[:, 1]], 1), closed=False)
                b.add(V, N, T, 'paint')
                for e, xe in ((0, a0), (1, a1)):
                    ring = V.reshape(2, -1, 3)[e]
                    cap = np.vstack([ring, ring[:1] * 0 + (xe, yc, fl)])[:-1]
                    b.extend(K.fill_loop(np.vstack([ring, [(xe, yc - 0.024, fl)]])[:len(ring)], (1 if e else -1, 0, 0), 'paint'))
        # rear face of the floor slab (seen with the tailgate down)
        loop = np.array([(0.0, D['bed_z0'] + 0.02), (D['bed_in'] - 0.002, D['bed_z0'] + 0.02), (D['bed_in'] - 0.002, fl - 0.002), (0.0, fl - 0.002)])
        g = K.grid_points(0.0, D['bed_in'], D['bed_z0'], fl, 0.15, dt=0.05)
        V, N, T = K.mesh_region(S.REAR_B, [K.Loop(K.resample_keep(loop, 0.08))], [], g, spacing=0.05)
        b.add(V, N, T, 'paint')
        # headboard inside face: rays from inside the bed towards +x
        chh = K.PlaneChart(S.B_sdf, axis=0, sign=-1.0, start=0.80)
        loop = np.array([(0.0, fl + 0.002), (D['bed_in'] - 0.002, fl + 0.002), (D['bed_in'] - 0.002, top - 0.002), (0.0, top - 0.002)])
        g = K.grid_points(0.0, D['bed_in'], fl, top, 0.08, dt=0.08)
        V, N, T = K.mesh_region(chh, [K.Loop(K.resample_keep(loop, 0.06))], [], g, spacing=0.08)
        b.add(V, N, T, 'paint')
        # stake pockets on the rail top and tie-down hooks under the rail
        for x in (xf - 0.18, xr + 0.14):
            p, n = S.CBT.to3d(np.array([[x, 0.5 * (D['bed_in'] + D['bed_hw']) - 0.004]]))
            b.extend(K.box_buf(p[0] + (-0.026, -0.016, -0.004), p[0] + (0.026, 0.016, 0.0006), 'trim', 0.003, 1))
            hp = np.array([x + 0.06, D['bed_in'] - 0.004, top - 0.07])
            b.extend(K.tube_buf(np.array([hp + (0, 0.004, 0.02), hp + (0, -0.02, 0.0), hp + (0, -0.02, -0.03), hp + (0, 0.004, -0.04)]), 0.005, 'steel', 6))
        return b

    def tailgate(self):
        """Full-width tailgate between the rear posts (centred object): outer skin with a pressed border,
        inner face, top cap, a chrome handle in a recess and the hinge knuckles at the bottom."""
        b = K.Buf()
        xr = D['bed_xr']
        th = D['tg_th']
        y1 = D['bed_in'] - GAP_TG
        z0 = D['bed_floor'] - 0.012
        z1 = D['bed_z1'] - 0.004
        b.extend(K.box_buf((xr, -y1, z0), (xr + th, y1, z1), 'paint', 0.012, 2))
        for (c0, c1) in ((z1 - 0.055, z1 - 0.040), (z0 + 0.040, z0 + 0.055)):
            b.extend(K.box_buf((xr - 0.004, -y1 + 0.05, c0), (xr + 0.002, y1 - 0.05, c1), 'paint', 0.005, 1))
        for sy in (1, -1):
            b.extend(K.box_buf((xr - 0.004, sy * (y1 - 0.065) - 0.0075, z0 + 0.04), (xr + 0.002, sy * (y1 - 0.065) + 0.0075, z1 - 0.04), 'paint', 0.005, 1))
        # handle: dark recess + chrome pull
        b.extend(K.box_buf((xr - 0.002, -0.10, z1 - 0.11), (xr + 0.004, 0.10, z1 - 0.07), 'trim', 0.006, 1))
        b.extend(K.box_buf((xr - 0.010, -0.085, z1 - 0.10), (xr - 0.001, 0.085, z1 - 0.082), 'chrome', 0.006, 2))
        for sy in (1, -1):
            yk = sy * (y1 - 0.04)
            b.extend(K.cyl_buf((xr + 0.02, yk - 0.03, z0 + 0.008), (xr + 0.02, yk + 0.03, z0 + 0.008), 0.012, 'steel', 10))
        return b

GAP_TG = 0.005
