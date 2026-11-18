"""Buffalo exterior: the cab (lower body + greenhouse, two doors a side), the cargo bed (outer skin, top rails,
inner walls, ribbed floor, wheel tubs), the tailgate, the openings (grille, two square lamps a side, the tail
lamps on the bed's rear posts, the fuel flap on the right), cut lines and their offsets. The lower body and the
bed's outer skin are split at the crease: the band under it is paint_b. Left half; frames/_buffalo_build.py
mirrors. Constructed as frames/_pickup_ext.py (cab and bed) and frames/_wagon_ext.py (the doors) are."""
import math
import sys

sys.dont_write_bytecode = True

import numpy as np  # noqa: E402

from frames import _kit as K  # noqa: E402
from frames import buffalo as S  # noqa: E402
from frames._sedan_ext import Path, edge_rows, interp_curve, side_dir  # noqa: E402

D = S.D
PI = math.pi
DELTA = S.DELTA
ER = S.ER
U_L = S.L_GUIDE.length
U_G = S.G_GUIDE.length
U_B = S.BED_GUIDE.length
# colour zones: 0 = the body (paint), 1 = the band under the crease (paint_b)
ZMAT = {0: 'paint', 1: 'paint_b'}


def step_l(uv):
    t = uv[1]
    if S.L_T[3] - 0.004 < t < S.L_T[4] + 0.004 or S.L_T[1] - 0.004 < t < S.L_T[2] + 0.004:
        return 0.005
    return 0.045


def band_mat(z):
    """The colour of a piece of edge or trim at height z (under the crease: the band's)."""
    return 'paint_b' if z < D['shoulder_z'] else 'paint'


def add_banded(buf, V, N, T, flip=False):
    """Add triangles to a buffer, each with the colour its centroid's height gives it (the band under the crease)."""
    V = np.asarray(V, float)
    T = np.asarray(T, np.int64).reshape(-1, 3)
    zc = V[T].mean(1)[:, 2]
    low = zc < D['shoulder_z']
    for sel, mat in ((~low, 'paint'), (low, 'paint_b')):
        if sel.any():
            buf.add(V, -np.asarray(N) if flip else N, T[sel], mat)
    return buf


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
    """The junction on the lower body loft's top strip: from the crossing A at the A pillar's foot along the side and
    round the cab's back to the rear centre (the greenhouse's rear wall stands on the strip, as its sides do)."""

    def __init__(self, J):
        self.J = J
        tend = S.L_T[-1]
        uvL = J['uvL']
        on = (uvL[:, 1] < tend) & (J['P'][:, 0] < D['ws_x'] + 0.02)
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
        self.u[-1] = U_L

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
    """Side-view helpers on the greenhouse: the junction height z_J(x), the A pillar's door edge, the C pillar's."""

    def __init__(self, jl):
        self.jl = jl
        m = jl.P[:, 1] > 0.5
        xs = jl.P[m, 0]
        o = np.argsort(xs)
        self.jx = xs[o]
        self.jz = jl.P[m][o, 2]
        self.zr = D['rail_z']
        zJf = self.zJ(D['fd_front'])
        self.a_edge = float(x_aside(zJf) - D['fd_front'])

    def zJ(self, x):
        return np.interp(x, self.jx, self.jz)

    def a_edge_x(self, z):
        return x_aside(z) - self.a_edge

    def c_edge_x(self, z):
        """The rear door frame's rear edge (the C pillar's front edge)."""
        z0 = self.zJ(D['rd_rear'])
        f = (np.asarray(z) - z0) / (self.zr - z0)
        return D['rd_rear'] + (D['cp_top'] - D['rd_rear']) * f

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
        radii[2] = 0.06
    else:
        bp = D['bp_rear']
        zs = np.linspace(float(gs.zJ(D['rd_rear'])), zr, 6)
        edge = np.stack([gs.c_edge_x(zs), zs], 1)[::-1]
        pts = np.vstack([[(bp, float(gs.zJ(bp))), (bp, zr)], edge])
        radii = np.zeros(len(pts))
        radii[1] = 0.03
        radii[2] = 0.035
    return K.rounded_poly(pts, radii, 0.03, closed=False, arc_step=0.008)


def door_windows(w, gs, band=0.028, bot=0.016):
    """Glass openings of a door frame in side coordinates: list of (name, closed CCW polygon (x, z)). One drop glass
    each, the front one following the A pillar."""
    zr_in = gs.zr - band
    if w == 'F':
        x_bp = D['bp_front'] + band
        z0 = float(gs.zJ(D['fd_front']))
        ang = math.atan2(float(gs.a_edge_x(gs.zr) - gs.a_edge_x(z0)), gs.zr - z0)
        off = band / math.cos(ang)
        zb = float(gs.zJ(0.6)) + bot
        za = np.linspace(zr_in, zb, 6)
        main = np.vstack([[(x_bp, zb), (x_bp, zr_in)], np.stack([gs.a_edge_x(za) - off, za], 1)])
        radii = [0.012, 0.03, 0.05, 0, 0, 0, 0, 0.012]
    else:
        x_bp = D['bp_rear'] - band
        zb = float(gs.zJ(-0.3)) + bot
        xc = float(gs.c_edge_x(zb)) + band
        main = np.array([(x_bp, zb), (xc, zb), (float(gs.c_edge_x(zr_in)) + band, zr_in), (x_bp, zr_in)])
        radii = [0.012, 0.012, 0.035, 0.03]
    loop = K.rounded_poly(main, radii, 0.10, arc_step=0.012)
    return [('main', K.ccw(loop))]


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

    # ------------------------------------------------------------------ cuts
    def _door_cuts(self):
        """The doors on the lower body: from the junction down the front edge, along the sill, up the rear edge; the
        front door's front corner and the rear door's rear corner rounder (they meet each other at the B pillar)."""
        jl = self.jl
        tb = float(S.t_of_z(0.0, D['door_bot']))
        for w, (xa, xb), radii in (('F', (D['fd_front'], D['fd_rear']), [0, 0.035, 0.008, 0]),
                                   ('R', (D['rd_front'], D['rd_rear']), [0, 0.008, 0.035, 0])):
            uF = float(S.u_of_x(xa))
            uR = float(S.u_of_x(xb))
            pts = [(uF, jl.at(uF)[0][0]), (uF, tb), (uR, tb), (uR, jl.at(uR)[0][0])]
            uv = K.rounded_poly(np.array(pts), radii, 0.03, closed=False, arc_step=0.007)
            uv = K.densify(uv, step_l, closed=False)
            self.cut['doorL_' + w] = Cut(S.CL, uv, False, +1.0, snap_to_j(jl))

    def _hood(self):
        hr = D['hood_rear']
        hw = D['hood_w']
        rp = self.row_front_P
        m = rp[:, 0] > 2.1
        o = np.argsort(rp[m, 1])
        ry, rx = rp[m, 1][o], rp[m, 0][o]
        ys = np.linspace(hw - 0.07, 0.0, 10)
        xf = np.interp(ys, ry, rx) - 0.012
        pts = np.vstack([[(hr, 0.0), (hr, hw), (xf[0] - 0.01, hw)], np.stack([xf, ys], 1)[1:]])
        radii = np.zeros(len(pts))
        radii[1] = 0.02
        radii[2] = 0.05
        uv = K.rounded_poly(pts, radii, 0.04, closed=False, arc_step=0.01)
        self.cut['hood'] = Cut(S.CT, uv, False, -1.0)

    def _gcuts(self):
        gs = self.gs = GSide(self.jl)
        for w, sgn in (('F', -1.0), ('R', +1.0)):
            uv = g_cut_door(w, gs)
            self.cut['doorG_' + w] = Cut(S.SIDE_G, uv, False, sgn, snap_side_to_j(gs))
            self.cut['winG_' + w] = door_windows(w, gs)
        self.win = {}
        for kind in ('ws', 'rw'):
            ch, uvw, sgn = self.window_opening(kind)
            P, N = ch.to3d(uvw)
            self.win[kind] = dict(chart=ch, uv=uvw, P=P, N=N, sgn=sgn)

    def window_opening(self, kind):
        """The windscreen (between the A pillars, from the cowl up to the header) and the small rear window in the
        cab's back: open polylines from the top centre round to the bottom centre."""
        J = self.J
        if kind == 'ws':
            O = np.array([float(S.ws_x(0.0, D['belt_z'])), 0.0, D['belt_z']])
            e2 = np.array([-math.cos(S._WR), 0.0, math.sin(S._WR)])
            ch = K.FrameChart(S.G_sdf, O, (0, 1.0, 0), e2)
            s_ang = S._WR
            zj = float(J['P'][0, 2])
            zs_top = float(S.roof_z(0.85, 0.0) - D['r_header'] * (1 - math.sin(S.PHI_F))) - 0.022
            rr = D['rho_a']
            sgn = 1.0
            margin_b = 0.03
            inset = 0.028
            rad = (0.06, 0.04)
        else:
            O = np.array([D['rw_x'], 0.0, D['belt_z']])
            ch = K.FrameChart(S.G_sdf, O, (0, -1.0, 0), (0, 0, 1.0))
            s_ang = PI / 2
            zj = float(J['P'][-1, 2])
            zs_top = float(S.roof_z(-0.9, 0.0) - D['r_rheader']) - 0.05
            rr = D['rho_c']
            sgn = -1.0
            margin_b = 0.07
            inset = 0.20
            rad = (0.05, 0.05)
        sb = (zj - D['belt_z']) / math.sin(s_ang) + margin_b
        st = (zs_top - D['belt_z']) / math.sin(s_ang)
        ss = np.linspace(sb, st, 10)
        zz = D['belt_z'] + ss * math.sin(s_ang)
        ye = S.g_side_w(zz) - rr - inset
        side = np.stack([sgn * ye, ss], 1)
        pts = np.vstack([[(0.0, st)], side[::-1], [(0.0, sb)]])
        radii = np.zeros(len(pts))
        radii[1] = rad[0]
        radii[-2] = rad[1]
        uv = K.rounded_poly(pts, radii, 0.035, closed=False, arc_step=0.01)
        return ch, uv, sgn

    def _openings(self):
        """The grille (a notch at the front centre) and the two lamps a side (holes in the front face)."""
        self.open = {}
        gw, z0, z1 = D['grille_w'], D['grille_z0'], D['grille_z1']
        g = K.rounded_poly(np.array([(0.0, z1), (gw, z1), (gw, z0), (0.0, z0)]), [0, 0.02, 0.02, 0], 0.035, closed=False, arc_step=0.007)
        P, N = S.FRONT_L.to3d(g)
        self.open['grille'] = dict(uv=S.CL.to2d(P), P=P, N=N, yz=g)
        lz, lw, lh = D['lamp_z'], D['lamp_w'], D['lamp_h']
        for name, ly in (('lamp', D['lamp_y']), ('lamp2', D['lamp_y2'])):
            c = K.rounded_poly(np.array([(ly - lw / 2, lz - lh / 2), (ly + lw / 2, lz - lh / 2), (ly + lw / 2, lz + lh / 2), (ly - lw / 2, lz + lh / 2)]),
                               [0.018] * 4, 0.04, arc_step=0.007)
            P, N = S.FRONT_L.to3d(c)
            self.open[name] = dict(uv=S.CL.to2d(P), P=P, N=N, yz=c, c=(ly, lz))

    # ------------------------------------------------------------------ bed cuts
    def _bed_cuts(self):
        """The rear arch notch on the bed side, the tail lamp recesses on the rear posts, the fuel flap (right)."""
        self.bed = {}
        xa = D['ax_r']
        R = D['arch_r']
        za = D['arch_z']
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
        t = rrect(D['tail_y0'], D['tail_y1'], D['tail_z0'], D['tail_z1'], 0.012, 0.035, 0.006)
        P, N = S.REAR_B.to3d(t)
        # (its loft coordinates directly: on the rear face the loft is the face itself; the inverse map jumped round the
        # 15 mm corner from its outer edge and cut a wedge out of the side)
        uv = np.stack([S.SB[4] + (D['bed_hw'] - 0.015) - t[:, 0], S.tb_of_z(t[:, 1])], 1)
        self.bed['tail'] = dict(uv=uv, P=P, N=N, yz=t)
        f = K.circle_loop(D['fuel_x'], D['fuel_z'], D['fuel_r'], 0.009)
        self.cut['fuel'] = Cut(S.SIDE_B, f, True, +1.0)

    # ------------------------------------------------------------------ regions: cab lower body
    def arch_notch(self, xa):
        R = D['arch_f']
        za = D['arch_z']
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

    def mesh_banded(self, chart, loop, holes, pts, sp, t_line, u_len):
        """A region on a loft chart split at the crease (t = t_line): the band under it paint_b."""
        def zone(c):
            return (c[:, 1] < t_line).astype(np.int64)
        V, N, T, Z = K.mesh_region_split(chart, [loop], holes, pts, lines=[(1, t_line, -0.01, u_len + 0.01)], zone_fn=zone,
                                         spacing=sp, line_step=0.05)
        return K.add_zones(K.Buf(), V, N, T, Z, ZMAT)

    def lower_body(self, fuel=False):
        tend = S.L_T[-1]
        us, ts = self.us, self.ts
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
        # rear centre line up to the junction (the cab's back)
        tj_end = self.jl.t[-1]
        tt = ts[(ts > S.L_T[0]) & (ts < tj_end - 0.004)]
        p.add(np.stack([np.full(len(tt), U_L), tt], 1))
        # junction from the rear centre round the cab's back to the rear door's rear edge
        out_r = self.cut['doorL_R'].side('out')
        out_f = self.cut['doorL_F'].side('out')
        uv, P, NL, NG, _ = self.jl.between(U_L, out_r['uv'][-1, 0])
        p.add(uv, P, NL, drop_last=True)
        # the door opening: the rear door's outer boundary reversed (rear edge down, sill forwards), then the front
        # door's (its sill from its rear corner forwards, its front edge up); the sill between them is straight
        r_uv, r_P, r_N = out_r['uv'][::-1], out_r['P'][::-1], out_r['N'][::-1]
        f_uv, f_P, f_N = out_f['uv'][::-1], out_f['P'][::-1], out_f['N'][::-1]
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
        gr = self.open['grille']
        tt = ts[(ts > gr['uv'][0, 1] + 0.004) & (ts < tend)][::-1]
        p.add(np.stack([np.zeros(len(tt)), tt], 1))
        p.add(gr['uv'], gr['P'], gr['N'])
        tt = ts[(ts > S.L_T[0]) & (ts < gr['uv'][-1, 1] - 0.004)][::-1]
        p.add(np.stack([np.zeros(len(tt)), tt], 1))
        loop = p.loop()
        holes = [K.Loop(self.open[k]['uv'], self.open[k]['P'], self.open[k]['N']) for k in ('lamp', 'lamp2')]
        pts, sp = S.grid_from(us, ts)
        pts, sp = edge_rows(S.CL, [self.J['P'], self.arch_P[0][0]], pts, sp, loop.uv, offs=(0.012, 0.028, 0.050), step=0.03, clear=0.07)
        return self.mesh_banded(S.CL, loop, holes, pts, sp, S.T_S, U_L)

    def door_skin(self, w):
        s = self.cut['doorL_' + w].side('in')
        p = Path()
        p.add(s['uv'], s['P'], s['N'])
        uv, P, NL, NG, _ = self.jl.between(s['uv'][-1, 0], s['uv'][0, 0])
        p.add(uv, P, NL, drop_first=True, drop_last=True)
        loop = p.loop()
        pts, sp = S.grid_from(self.us, self.ts)
        pts, sp = edge_rows(S.CL, [P], pts, sp, loop.uv, offs=(0.012, 0.028, 0.050), step=0.03, clear=0.07)
        return self.mesh_banded(S.CL, loop, [], pts, sp, S.T_S, U_L)

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
        xg, yg = np.meshgrid(np.arange(1.10, 2.45, 0.05), np.arange(0.0, 0.90, 0.04), indexing='ij')
        g = np.stack([xg.ravel(), yg.ravel()], 1)
        V, N, T = K.mesh_region(S.CT, [p.loop()], [], g, spacing=0.04)
        return K.Buf().add(V, N, T, 'paint')

    def hood(self):
        s = self.cut['hood'].side('in')
        p = Path()
        p.add(s['uv'], s['P'], s['N'])
        x0 = s['uv'][-1, 0]
        x1 = s['uv'][0, 0]
        xs = np.linspace(x0, x1, max(2, int(abs(x1 - x0) / 0.045) + 1))[1:-1]
        p.add(np.stack([xs, np.zeros(len(xs))], 1))
        bb = s['uv']
        xg, yg = np.meshgrid(np.arange(bb[:, 0].min() - 0.05, bb[:, 0].max() + 0.05, 0.075), np.arange(0.0, 0.85, 0.075), indexing='ij')
        g = np.stack([xg.ravel(), yg.ravel()], 1)
        V, N, T = K.mesh_region(S.CT, [p.loop()], [], g, spacing=0.075)
        return K.Buf().add(V, N, T, 'paint')

    # ------------------------------------------------------------------ greenhouse
    def greenhouse(self, level=0.0):
        J = self.J
        gus = S.g_u_samples()
        gts = S.g_t_samples()
        fo = self.cut['doorG_F'].side('out')
        ro = self.cut['doorG_R'].side('out')
        ws = self.win['ws']
        rw = self.win['rw']
        p = Path()
        uv_f = S.CG.to2d(fo['P'])
        r_uv = S.CG.to2d(ro['P'])
        # junction from the front centre to the front door frame, its outer boundary reversed (A edge up, rail
        # rearwards, B pillar down), the junction along the B pillar's foot, the rear door frame's outer boundary
        # (B pillar up, rail, C edge down), the junction round the cab's back to the rear centre
        ua = uv_f[-1, 0]
        m = J['uvG'][:, 0] < ua - 1e-4
        p.add(J['uvG'][m], J['P'][m], J['NG'][m])
        p.add(uv_f[::-1], fo['P'][::-1], fo['N'][::-1])
        m = (J['uvG'][:, 0] > uv_f[0, 0] + 1e-4) & (J['uvG'][:, 0] < r_uv[0, 0] - 1e-4)
        p.add(J['uvG'][m], J['P'][m], J['NG'][m])
        p.add(r_uv, ro['P'], ro['N'])
        m = J['uvG'][:, 0] > r_uv[-1, 0] + 1e-4
        p.add(J['uvG'][m], J['P'][m], J['NG'][m])
        # the rear centre line with the rear window's notch, the top row forwards, the front centre line with the
        # windscreen's notch
        rw_uv = S.CG.to2d(rw['P'])
        tt = gts[(gts > J['uvG'][-1, 1] + 0.004) & (gts < rw_uv[-1, 1] - 0.004)]
        p.add(np.stack([np.full(len(tt), U_G), tt], 1))
        p.add(rw_uv[::-1], rw['P'][::-1], rw['N'][::-1])
        tt = gts[gts > rw_uv[0, 1] + 0.004]
        p.add(np.stack([np.full(len(tt), U_G), tt], 1))
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
            cu = np.linspace(0, U_G, int(U_G / 0.09))
            ct = np.unique(np.concatenate([np.linspace(S.G_T[0], S.G_T[2], 6), np.linspace(S.G_T[2], S.G_T[4], 5)]))
            pts, sp = S.grid_from(cu, ct)
            V, N, T = K.mesh_region(S.CG, [loop], [], pts, spacing=sp, level=level)
            return K.Buf().add(V, -N, T, 'plastic_int')
        pts, sp = S.grid_from(gus, gts)
        pts, sp = edge_rows(S.CG, [self.win[k]['P'] for k in ('ws', 'rw')], pts, sp, loop.uv)
        pts, sp = self.a_pillar_rows(pts, sp)
        V, N, T = K.mesh_region(S.CG, [loop], [], pts, spacing=sp)
        return K.Buf().add(V, N, T, 'paint')

    def a_pillar_rows(self, pts, sp, step=0.024):
        """Columns of points up the A pillar's fillet, one every step, in place of the grid there (frames/_goat_ext.py):
        without them the triangles from the windscreen's edge rows to the door's cut were chopped across the fillet, a
        sawtooth highlight up the pillar."""
        s1, s2 = S.SG[1], S.SG[2]
        cols = s1 + (s2 - s1) * np.array([0.25, 0.5, 0.75, 1.0])
        uvJ = self.J['uvG']
        o = np.argsort(uvJ[:, 0])
        tJ = np.interp(cols, uvJ[o, 0], uvJ[o, 1])
        t_hi = S.G_T[1] - 0.012
        band = ((pts[:, 0] > s1 + 0.4 * (s2 - s1)) & (pts[:, 0] < s2 + 0.008) & (pts[:, 1] > float(tJ.min()))
                & (pts[:, 1] < t_hi + 0.006))
        R = np.vstack([np.stack([np.full(len(ts), u), ts], 1)
                       for u, ts in ((u, np.arange(t0 + 0.012, t_hi, step)) for u, t0 in zip(cols, tJ))])
        kept = pts[~band]
        clear = ((R[:, None, :] - kept[None, :, :]) ** 2).sum(2).min(1) > 0.009 ** 2
        R = R[clear]
        sp = np.broadcast_to(np.asarray(sp, float), (len(pts),))
        return np.vstack([kept, R]), np.concatenate([sp[~band], np.full(len(R), 0.6 * step)])

    def door_frame(self, w):
        s = self.cut['doorG_' + w].side('in')
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
        self.win_P = getattr(self, 'win_P', {})
        for name, poly in self.cut['winG_' + w]:
            P, N = S.SIDE_G.to3d(poly)
            holes.append(K.Loop(S.CG.to2d(P), P, N))
            self.win_P[(w, name)] = (poly, P, N)
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
        xg, yg = np.meshgrid(np.arange(-1.0, 0.95, 0.095), np.arange(0.0, 0.80, 0.095), indexing='ij')
        g = np.stack([xg.ravel(), yg.ravel()], 1)
        V, N, T = K.mesh_region(S.CR, [K.Loop(P[:, :2], P, Nn)], [], g, spacing=0.095)
        return K.Buf().add(V, N, T, 'paint')

    def glass(self):
        out = {}
        for kind in ('ws', 'rw'):
            wv = self.win[kind]
            ch, uv, sgn = wv['chart'], wv['uv'], wv['sgn']
            big = K.offset_loop2(uv, sgn * 0.014, closed=False)
            big[0, 0] = 0.0
            big[-1, 0] = 0.0
            ss = np.linspace(big[-1, 1], big[0, 1], 16)[1:-1]
            loop = np.vstack([big, np.stack([np.zeros(len(ss)), ss], 1)])
            g = K.grid_points(-0.9, 0.9, -0.2, 0.8, 0.12, dt=0.12)
            V, N, T = K.mesh_region(ch, [K.Loop(K.resample_keep(loop, 0.06))], [], g, spacing=0.12, level=-0.007)
            out[kind] = K.Buf().add(V, N, T, 'glass')
        for w in ('F', 'R'):
            b = K.Buf()
            for name, poly in self.cut['winG_' + w]:
                big = K.offset_loop2(poly, -0.012)
                g = K.grid_points(-1.0, 1.2, 1.2, 1.8, 0.12, dt=0.12)
                V, N, T = K.mesh_region(S.SIDE_G, [K.Loop(big)], [], g, spacing=0.12, level=-0.012)
                b.add(V, N, T, 'glass')
            out['door_' + w] = b
        return out

    # ------------------------------------------------------------------ bed regions
    def bed_outer(self, fuel=False):
        """Outer skin of the bed (sides, front wall, rear posts) with the arch notch, the tail lamp recess and (on the
        right) the fuel flap, left half; split at the crease (the band under it)."""
        us = S.b_u_samples()
        ts = S.b_t_samples()
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
        # rows of points round the tail lamp's recess, the fuel flap and along the arch (no fans of long thin
        # triangles from their dense edges across the side and round the rear corner)
        rims = [tl['P'], self.bed['arch_P'][0]]
        if fuel:
            rims.append(self.cut['fuel'].side('out')['P'])
        pts, sp = edge_rows(S.CB, rims, pts, sp, loop.uv, offs=(0.012, 0.03, 0.055), step=0.03, clear=0.06)
        self.bed['u_post'] = u_post
        return self.mesh_banded(S.CB, loop, holes, pts, sp, S.T_SB, U_B)

    def bed_inner(self):
        """Inner wall, ribbed floor, the wheel tub (it covers the room the axle's springs and dampers stand in),
        the headboard's inside face and the rear sill's face under the tailgate (left half)."""
        b = K.Buf()
        xr, xf = D['bed_xr'], D['bed_xf'] - 0.05
        fl, top = D['bed_floor'], D['bed_z1']
        tx = D['ax_r']
        tw = TUB_HALF
        ty = TUB_Y
        bi = D['bed_in']
        # inner side wall: rays outwards (+y) from a little way in front of it
        # (every outline just inside the load space: an edge in the headboard's solid sent its rays onto the headboard's
        # top, and the floor ramped up to it; the rays start near their face: a long march past a face a few mm away
        # ran out of steps and its triangles were dropped)
        ch = NearFace(S.B_sdf, 1, 1.0, bi - 0.06)
        loop = np.array([(xr + 0.001, fl + 0.002), (xf - 0.003, fl + 0.002), (xf - 0.003, top - 0.002), (xr + 0.001, top - 0.002)])
        g = K.grid_points(xr, xf, fl, top, 0.12, dt=0.09)
        V, N, T = K.mesh_region(ch, [K.Loop(K.resample_keep(loop, 0.10))], [], g, spacing=0.09)
        b.add(V, N, T, 'paint')
        # wheel tub: a bevelled box set into the floor, the side wall and the headboard
        b.extend(K.box_buf((tx - tw, ty, fl - 0.02), (min(tx + tw, xf + 0.02), bi + 0.02, TUB_TOP), 'paint', 0.035, 2))
        # floor: rays from above, round the tub's footprint; ribs are separate swept strips
        loop = np.array([(xr + 0.001, 0.0), (xf - 0.003, 0.0), (xf - 0.003, bi - 0.002), (xr + 0.001, bi - 0.002)])
        g = K.grid_points(xr + 0.05, xf - 0.02, 0.02, bi - 0.02, 0.18, dt=0.14)
        V, N, T = K.mesh_region(NearFace(S.B_sdf, 2, -1.0, fl + 0.06), [K.Loop(K.resample_keep(loop, 0.10))], [], g, spacing=0.14)
        b.add(V, N, T, 'paint')
        rib = K.round_profile(np.array([(-0.024, 0.0), (-0.016, 0.005), (0.016, 0.005), (0.024, 0.0)]), 0.004, 1)
        for yc in np.arange(0.055, bi - 0.03, 0.11):
            spans = [(xr + 0.006, xf - 0.004)]
            if yc + 0.024 > ty - 0.003:
                spans = [(xr + 0.006, tx - tw - 0.01)]
            for (a0, a1) in spans:
                path = np.array([(a0, yc, fl), (a1, yc, fl)])
                V, N, T = K.sweep(path, (0, 0, 1), np.stack([-rib[:, 0], rib[:, 1]], 1), closed=False)
                b.add(V, N, T, 'paint')
                for e, xe in ((0, a0), (1, a1)):
                    ring = V.reshape(2, -1, 3)[e]
                    b.extend(K.fill_loop(np.vstack([ring, [(xe, yc - 0.024, fl)]])[:len(ring)], (1 if e else -1, 0, 0), 'paint'))
        # the rear sill's face under the tailgate (seen with it down): in the band
        loop = np.array([(0.0, D['bed_z0'] + 0.02), (bi - 0.002, D['bed_z0'] + 0.02), (bi - 0.002, fl - 0.002), (0.0, fl - 0.002)])
        g = K.grid_points(0.0, bi, D['bed_z0'], fl, 0.15, dt=0.06)
        V, N, T = K.mesh_region(S.REAR_B, [K.Loop(K.resample_keep(loop, 0.10))], [], g, spacing=0.06)
        b.add(V, N, T, 'paint_b')
        # headboard inside face: rays from inside the bed towards +x
        chh = NearFace(S.B_sdf, 0, 1.0, xf - 0.06)
        loop = np.array([(0.0, fl + 0.002), (bi - 0.002, fl + 0.002), (bi - 0.002, top - 0.002), (0.0, top - 0.002)])
        g = K.grid_points(0.0, bi, fl, top, 0.10, dt=0.09)
        V, N, T = K.mesh_region(chh, [K.Loop(K.resample_keep(loop, 0.08))], [], g, spacing=0.09)
        b.add(V, N, T, 'paint')
        # stake pockets on the rail top and tie-down hooks under the rail
        for x in (xf - 0.16, xr + 0.16):
            p, n = S.CBT.to3d(np.array([[x, 0.5 * (bi + D['bed_hw']) - 0.004]]))
            b.extend(K.box_buf(p[0] + (-0.028, -0.018, -0.004), p[0] + (0.028, 0.018, 0.0006), 'trim', 0.003, 1))
        for x in (tx + tw + 0.10 if tx + tw + 0.10 < xf - 0.06 else xf - 0.10, xr + 0.20):
            hp = np.array([x, bi - 0.004, top - 0.08])
            b.extend(K.tube_buf(np.array([hp + (0, 0.004, 0.02), hp + (0, -0.02, 0.0), hp + (0, -0.02, -0.03), hp + (0, 0.004, -0.04)]), 0.005, 'steel', 6))
        return b

    def tailgate(self):
        """Full-width tailgate between the rear posts (centred object): a box with a pressed border on its outer
        face, the handle in a recess, the hinge knuckles at the bottom."""
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
        b.extend(K.box_buf((xr - 0.002, -0.11, z1 - 0.115), (xr + 0.004, 0.11, z1 - 0.072), 'trim', 0.006, 1))
        b.extend(K.box_buf((xr - 0.010, -0.095, z1 - 0.104), (xr - 0.001, 0.095, z1 - 0.084), 'chrome', 0.006, 2))
        for sy in (1, -1):
            yk = sy * (y1 - 0.04)
            b.extend(K.cyl_buf((xr + 0.02, yk - 0.03, z0 + 0.008), (xr + 0.02, yk + 0.03, z0 + 0.008), 0.012, 'steel', 10))
        return b


class NearFace:
    """A chart for a flat face of the bed's load space, (u, t) the other two coordinates in order: rays along an axis
    (direction d = +-1) from the plane at coordinate c a few cm in front of the face."""

    def __init__(self, sdf, axis, d, c, reach=0.15):
        self.sdf, self.axis, self.d, self.c, self.reach = sdf, axis, d, c, reach
        self.others = [k for k in range(3) if k != axis]

    def to3d(self, uv, level=None):
        uv = np.asarray(uv, float)
        O = np.zeros((len(uv), 3))
        O[:, self.others[0]] = uv[:, 0]
        O[:, self.others[1]] = uv[:, 1]
        O[:, self.axis] = self.c
        Dv = np.zeros((len(uv), 3))
        Dv[:, self.axis] = self.d
        t, hit = K.raycast(self.sdf, O, Dv, 0.0 if level is None else level, tmax=self.reach, iters=200, max_step=0.02)
        self.last_hit = hit
        Q = O + Dv * t[:, None]
        return Q, K.sdf_normals(self.sdf, Q)

    def to2d(self, pts):
        return np.asarray(pts, float)[:, self.others].copy()


GAP_TG = 0.005
# the wheel tubs in the bed: half length about the rear axle, their inner wall, their top (they cover the room
# the axle's springs and dampers stand in: from 0.44 m out, up to 0.86 m)
TUB_HALF = 0.47
TUB_Y = 0.43
TUB_TOP = 0.905
