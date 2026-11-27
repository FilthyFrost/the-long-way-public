"""Fox exterior: junction of greenhouse and lower body, cut lines (one long door a side, the bonnet stepped round
the pop-up lamp pods, the pods' lids, the short boot lid, the arches, the quarter window, the windscreen and the
fastback's rear window), the front openings (the slot over the bumper, the intake under it, the indicators), the
tail (the black panel, the round twin lamp recesses, the plate recess), the fuel flap (right), the colour zones
(the side band in paint_b, the tail panel in trim), trimmed regions of the shells, the panel skins and the rolled
edges. All in the left half; frames/_fox_build.py mirrors."""
import math
import sys

sys.dont_write_bytecode = True

import numpy as np  # noqa: E402

from frames import _kit as K  # noqa: E402
from frames import fox as S  # noqa: E402
from frames._sedan_ext import Path, edge_rows, interp_curve, side_dir  # noqa: E402

D = S.D
PI = math.pi
DELTA = S.DELTA
ER = S.ER

# colour zones of the lower body: 0 = paint, 1 = the side band (paint_b), 2 = the tail panel (trim)
ZMAT = {0: 'paint', 1: 'paint_b', 2: 'trim'}


def rail_rows(pts, sp, uv_b, gts, t_min=0.37, gap=0.005):
    """The roof rail's fillet rows over the door frame at the door frame cut's own stations, in place of the grid's
    columns there: up the wall under the rail the greenhouse's u lines lean back hard (the windscreen's rake), so
    fans from the cut's points to a grid column a little further on stood edge-on across the fillet (dark ticks
    along the rail). Rows from the fillet's start to the one under the roof's edge (the roof shares the top row).
    Returns (points, spacings)."""
    b = uv_b[uv_b[:, 1] > t_min]
    if len(b) < 2:
        return pts, sp
    us = np.sort(b[:, 0])
    keep = [us[0]]
    for u in us[1:]:
        if u - keep[-1] > gap:
            keep.append(u)
    us = np.array(keep)
    rows = gts[(gts > S.G_T[2] - 1e-9) & (gts < S.G_T[-1] - 1e-9)]
    sp = np.broadcast_to(np.asarray(sp, float), (len(pts),))
    drop = (pts[:, 0] > us[0] - gap) & (pts[:, 0] < us[-1] + gap) & (pts[:, 1] > t_min) & (pts[:, 1] < S.G_T[-1] - 1e-9)
    uu, tt = np.meshgrid(us, rows, indexing='ij')
    new = np.stack([uu.ravel(), tt.ravel()], 1)
    return np.vstack([pts[~drop], new]), np.concatenate([sp[~drop], np.full(len(new), 0.01)])


def step_l(uv):
    """Boundary sampling step in the lower body loft: fine over the shoulder / rocker fillets."""
    t = uv[1]
    if S.L_T[3] - 0.004 < t < S.L_T[4] + 0.004 or S.L_T[1] - 0.004 < t < S.L_T[2] + 0.004:
        return 0.005
    return 0.03


class Cut:
    """A cut line in one chart and its two offset boundaries. side 'in' = panel side, 'out' = body side."""

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
        np.arange(s[0], s[1], 0.012), np.linspace(s[1], s[2], 18), np.arange(s[2], s[3], 0.012),
        np.linspace(s[3], s[4], 30), np.arange(s[4], s[5], 0.012), [s[5]]]))
    ts = np.linspace(0.0, 0.26, 131)
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
    near the A pillar foot and the C pillar's foot on the deck), as a function of the loft u."""

    def __init__(self, J):
        self.J = J
        tend = S.L_T[-1]
        uvL = J['uvL']
        side = (J['P'][:, 0] < 0.62) & (J['P'][:, 0] > -1.60) & (J['P'][:, 1] > 0.5)
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
    """End points of an open lower body cut offset onto the junction."""
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


# ============================================================================================ greenhouse side
def x_aside(z):
    """x of the A pillar side tangent line (corner fillet -> side face) at height z."""
    w = S.g_side_w(z)
    return S.ws_x(w - D['rho_a'], z) - D['rho_a']


def x_cside(z):
    """x of the C pillar's side tangent line (side face -> rear corner fillet) at height z."""
    w = S.g_side_w(z)
    return S.rw_x(w - D['rho_c'], z) + D['rho_c']


class GSide:
    """Side-view helpers on the greenhouse: the junction height z_J(x) and the door frame's edges."""

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
        """The door frame's rear edge: from the door's rear at the belt leaning forward to the rail."""
        z0 = self.zJ(D['cp_bot'])
        f = (np.asarray(z) - z0) / (self.zr - z0)
        return D['cp_bot'] + (D['cp_top'] - D['cp_bot']) * f

    def j_point(self, x):
        """3D point, greenhouse normal and greenhouse chart uv on the junction at side x."""
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


def side_end_x(z):
    """x where the greenhouse's flat side face ends at the rear at height z (where the C pillar's corner blend
    begins: the rear window leans, so the blend reaches further forward than the plan's radius)."""
    xs = np.linspace(-0.60, -1.75, 231)
    P, N = S.SIDE_G.to3d(np.stack([xs, np.full(len(xs), float(z))], 1))
    ns = np.array([0.0, math.cos(S._TH), math.sin(S._TH)])
    off = np.nonzero((N @ ns) < 0.9995)[0]
    return float(xs[max(0, off[0] - 1)]) if len(off) else float(xs[-1])


def quarter_window(gs, band=0.024, b_w=0.062, c_w=0.032):
    """The fixed quarter window behind the door in side coordinates (x, z), a closed CCW loop: its front edge the
    B pillar's (b_w behind the door frame's rear edge), its rear edge the sail's (c_w ahead of where the side face
    turns into the C pillar's blend: it falls with the fastback), the top under the rail, the bottom over the
    belt (which rises over the rear quarter)."""
    zt = D['rail_z'] - band
    zb_f = float(gs.zJ(float(gs.c_edge_x(0.87)) - b_w)) + 0.016
    xf_b = float(gs.c_edge_x(zb_f)) - b_w
    zb_r = zb_f
    for _ in range(5):
        xr_b = side_end_x(zb_r + 0.02) + c_w
        zb_r = float(gs.zJ(xr_b)) + 0.016
    # the sail's line through two heights; the window's top where it is still 4 cm long under the rail
    zs_ = np.linspace(zb_r + 0.02, zt, 6)
    xs_ = np.array([side_end_x(z) for z in zs_]) + c_w
    k_s, c_s = np.polyfit(zs_, xs_, 1)

    def xr(z):
        return k_s * z + c_s

    def xf(z):
        return float(gs.c_edge_x(z)) - b_w
    z_top = zt
    while xr(z_top) - xf(z_top) < 0.04 and z_top > zb_r + 0.10:
        z_top -= 0.004
    poly = np.array([(xr(zb_r), zb_r), (xf_b, zb_f), (xf(z_top), z_top), (xr(z_top), z_top)])
    loop = K.rounded_poly(poly, [0.035, 0.012, 0.025, 0.012], 0.03, arc_step=0.008)
    return K.ccw(loop)


def ws_frame():
    O = np.array([float(S.ws_x(0.0, D['belt_z'])), 0.0, D['belt_z']])
    e2 = np.array([-math.cos(S._WR), 0.0, math.sin(S._WR)])
    return K.FrameChart(S.G_sdf, O, (0, 1.0, 0), e2)


def rw_frame():
    O = np.array([float(S.rw_x(0.0, D['belt_z'])), 0.0, D['belt_z']])
    e2 = np.array([math.cos(S._RR), 0.0, math.sin(S._RR)])
    return K.FrameChart(S.G_sdf, O, (0, -1.0, 0), e2)


def window_opening(kind, J):
    """Windscreen / rear window opening (left half, open polyline from the top centre round to the bottom
    centre) in its frame chart. Returns (chart, uv, sgn) where sgn = +1 if chart u = +y."""
    if kind == 'ws':
        ch = ws_frame()
        s_ang = S._WR
        zj = float(J['P'][0, 2])
        xh = float(S.ws_x(0.0, D['roof_z']))
        zs_top = float(S.roof_z(xh, 0.0) - D['r_header'] * (1 - math.sin(S.PHI_F))) - 0.024
        rr = D['rho_a']
        # (the glass reaches to 14 mm from the A pillar's corner: the pillar between it and the door glass is one slim
        # band from the driver's seat, as a sports car's raked pillar is)
        margin, edge = 0.026, 0.014
        sgn = 1.0
    else:
        ch = rw_frame()
        s_ang = S._RR
        zj = float(J['P'][-1, 2])
        xh = float(S.rw_x(0.0, D['roof_z']))
        zs_top = float(S.roof_z(xh, 0.0) - D['r_rheader'] * (1 - math.sin(S.PHI_R))) - 0.034
        rr = D['rho_c']
        margin, edge = 0.034, 0.030
        sgn = -1.0
    sb = (zj - D['belt_z']) / math.sin(s_ang) + margin
    st = (zs_top - D['belt_z']) / math.sin(s_ang)
    ss = np.linspace(sb, st, 12)
    zz = D['belt_z'] + ss * math.sin(s_ang)
    ye = S.g_side_w(zz) - rr - edge
    side = np.stack([sgn * ye, ss], 1)
    pts = np.vstack([[(0.0, st)], side[::-1], [(0.0, sb)]])
    radii = np.zeros(len(pts))
    radii[1] = 0.08 if kind == 'ws' else 0.10
    radii[-2] = 0.05 if kind == 'ws' else 0.07
    uv = K.rounded_poly(pts, radii, 0.035, closed=False, arc_step=0.01)
    return ch, uv, sgn


# ============================================================================================ the exterior
class Exterior:
    def __init__(self):
        self.J = junction()
        self.jl = JLine(self.J)
        self.us = S.l_u_samples()
        self.ts = S.l_t_samples()
        self.cut = {}
        self._zones()
        self._rows()
        self._door_cut()
        self._lids()
        self._gcuts()
        self._openings()

    # ------------------------------------------------------------------ colour zones
    def _zones(self):
        sl = S.SL
        U = S.L_GUIDE.length
        # the band round the front corner from under the bumper's end, along the side, round the rear corner
        self.u_band = (float(sl[1] + 0.20), float(sl[3] + 0.13))
        self.t_band = (float(S.T_B0), float(S.T_B1))
        # the tail panel across the rear face and a little round its corners
        xr = D['xr']
        self.u_tail = float(sl[4] - 0.03)
        self.t_tail = (float(S.t_of_z(xr, D['tail_z0'])), float(S.t_of_z(xr, D['tail_z1'])))
        self.U = float(U)

    def _l_lines(self):
        (u0, u1), (t0, t1) = self.u_band, self.t_band
        ut = self.u_tail
        ta, tb = self.t_tail
        U = self.U
        return [(1, t0, u0, u1), (1, t1, u0, u1), (0, u0, t0, t1), (0, u1, t0, t1),
                (1, ta, ut, U), (1, tb, ut, U), (0, ut, ta, tb)]

    def _l_zone(self, cen):
        (u0, u1), (t0, t1) = self.u_band, self.t_band
        ta, tb = self.t_tail
        z = np.zeros(len(cen), np.int64)
        z[(cen[:, 1] > t0) & (cen[:, 1] < t1) & (cen[:, 0] > u0) & (cen[:, 0] < u1)] = 1
        z[(cen[:, 1] > ta) & (cen[:, 1] < tb) & (cen[:, 0] > self.u_tail)] = 2
        return z

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
    def _door_cut(self):
        """The door on the lower body: front edge down from the junction, along the sill, up the rear edge (the
        polyline runs front edge top -> bottom -> rear edge top: the door lies to its left in (u, t))."""
        jl = self.jl
        tb = float(S.t_of_z(0.0, D['door_bot']))
        uF = float(S.u_of_x(D['fd_front']))
        uR = float(S.u_of_x(D['fd_rear']))
        pts = [(uF, jl.at(uF)[0][0]), (uF, tb), (uR, tb), (uR, jl.at(uR)[0][0])]
        uv = K.rounded_poly(np.array(pts), [0, 0.035, 0.03, 0], 0.03, closed=False, arc_step=0.007)
        uv = K.densify(uv, step_l, closed=False)
        self.cut['doorL'] = Cut(S.CL, uv, False, +1.0, snap_to_j(jl))

    def _row_x_at(self, rp, ys, xmin):
        m = rp[:, 0] > xmin if xmin > 0 else rp[:, 0] < xmin
        o = np.argsort(rp[m, 1])
        return np.interp(ys, rp[m, 1][o], rp[m, 0][o])

    def _lids(self):
        """Bonnet, pod lids and boot lid outlines on the top chart, inside the loft's strip end."""
        # bonnet: open polyline round the left half from the rear edge at y = 0 to the front edge at y = 0; full
        # width behind the pods, stepped in between them
        hr, hw = D['hood_rear'], D['hood_w']
        hs, hf = D['hood_step'], D['hood_front_w']
        ys = np.linspace(hf, 0.0, 10)
        xf = self._row_x_at(self.row_front_P, ys, 1.6) - 0.012
        pts = np.vstack([[(hr, 0.0), (hr, hw), (hs, hw), (hs, hf)], np.stack([xf, ys], 1)])
        radii = np.zeros(len(pts))
        radii[1] = 0.025
        radii[2] = 0.05
        radii[3] = 0.04
        radii[4] = 0.06
        uv = K.rounded_poly(pts, radii, 0.04, closed=False, arc_step=0.01)
        self.cut['hood'] = Cut(S.CT, uv, False, -1.0)
        # the pod lids (closed loops: the lid is inside)
        x0, x1, y0, y1 = D['pod_x0'], D['pod_x1'], D['pod_y0'], D['pod_y1']
        pod = K.rounded_poly(np.array([(x0, y0), (x1, y0), (x1, y1), (x0, y1)]), [0.03, 0.04, 0.075, 0.03], 0.03, arc_step=0.008)
        self.cut['pod'] = Cut(S.CT, K.ccw(pod), True, +1.0)
        # boot lid
        tf, tw = D['trunk_front'], D['trunk_w']
        ys = np.linspace(tw - 0.05, 0.0, 10)
        xr = self._row_x_at(self.row_rear_P, ys, -1.75) + 0.012
        pts = np.vstack([[(tf, 0.0), (tf, tw), (xr[0] + 0.03, tw)], np.stack([xr, ys], 1)[1:]])
        radii = np.zeros(len(pts))
        radii[1] = 0.03
        radii[2] = 0.06
        uv = K.rounded_poly(pts, radii, 0.04, closed=False, arc_step=0.01)
        self.cut['trunk'] = Cut(S.CT, uv, False, +1.0)

    def _gcuts(self):
        gs = self.gs = GSide(self.jl)
        zr = gs.zr
        bp = D['cp_bot']
        zs = np.linspace(float(gs.zJ(D['fd_front'])), zr, 14)
        edge = np.stack([gs.a_edge_x(zs), zs], 1)[::-1]
        zc = np.linspace(float(gs.zJ(bp)), zr, 4)
        cedge = np.stack([gs.c_edge_x(zc), zc], 1)
        pts = np.vstack([cedge[:-1], [(float(gs.c_edge_x(zr)), zr)], edge])
        radii = np.zeros(len(pts))
        radii[len(cedge) - 1] = 0.035
        radii[len(cedge)] = 0.07
        uv = K.rounded_poly(pts, radii, 0.03, closed=False, arc_step=0.008)
        self.cut['doorG'] = Cut(S.SIDE_G, uv, False, -1.0, snap_side_to_j(gs))
        # the door glass opening (frame band 24 mm; 14 along the A pillar, which the band widened from the driver's
        # seat: a raked pillar is seen close to her eyes)
        band = 0.024
        zb = float(gs.zJ(-0.2)) + 0.016
        zr_in = zr - band
        z0 = float(gs.zJ(D['fd_front']))
        ang = math.atan2(float(gs.a_edge_x(zr) - gs.a_edge_x(z0)), zr - z0)
        off = 0.014 / abs(math.cos(ang))
        za = np.linspace(zr_in, zb, 8)
        xr_ = float(gs.c_edge_x(zb)) + band
        win = np.vstack([[(xr_, zb), (float(gs.c_edge_x(zr_in)) + band, zr_in)], np.stack([gs.a_edge_x(za) - off, za], 1)])
        radii = [0.012, 0.03, 0.05, 0, 0, 0, 0, 0, 0, 0.014]
        loop = K.ccw(K.rounded_poly(win, radii, 0.03, arc_step=0.008))
        self.cut['winG'] = [('main', loop)]
        self.quarter = quarter_window(gs)
        self.win = {}
        for kind in ('ws', 'rw'):
            ch, uvw, sgn = window_opening(kind, self.J)
            P, N = ch.to3d(uvw)
            self.win[kind] = dict(chart=ch, uv=uvw, P=P, N=N, sgn=sgn)

    def _openings(self):
        """Openings in the lower body loft: the slot over the bumper and the intake under it (notches at the front
        centre), the indicators, the twin tail lamp recesses, the plate recess (a notch at the rear centre), the
        fuel flap (right side)."""
        self.open = {}
        for name, w, z0, z1, r in (('slot', D['slot_w'], D['slot_z0'], D['slot_z1'], 0.018),
                                   ('intake', D['intake_w'], D['intake_z0'], D['intake_z1'], 0.035)):
            pts = np.array([(0.0, z1), (w, z1), (w, z0), (0.0, z0)])
            g = K.rounded_poly(pts, [0, r, r, 0], 0.03, closed=False, arc_step=0.007)
            P, N = S.FRONT_L.to3d(g)
            self.open[name] = dict(uv=S.CL.to2d(P), P=P, N=N, yz=g)
        z0, z1 = D['slot_z0'], D['slot_z1']
        c = K.rounded_poly(np.array([(D['ind_y0'], z0), (D['ind_y1'], z0), (D['ind_y1'], z1), (D['ind_y0'], z1)]), [0.012] * 4, 0.02, arc_step=0.006)
        P, N = S.FRONT_L.to3d(c)
        self.open['ind'] = dict(uv=S.CL.to2d(P), P=P, N=N, yz=c)
        for name, y in (('tail_out', D['lamp_y_out']), ('tail_in', D['lamp_y_in'])):
            c = K.circle_loop(y, D['lamp_z'], D['lamp_r'], 0.0155)
            P, N = S.REAR_L.to3d(c)
            self.open[name] = dict(uv=S.CL.to2d(P), P=P, N=N, yz=c)
        za, zb = D['tail_z0'] + 0.012, D['tail_z1'] - 0.012
        pl = K.rounded_poly(np.array([(0.0, zb), (0.185, zb), (0.185, za), (0.0, za)]), [0, 0.018, 0.018, 0], 0.03, closed=False, arc_step=0.008)
        P, N = S.REAR_L.to3d(pl)
        self.open['plate'] = dict(uv=S.CL.to2d(P), P=P, N=N, yz=pl)
        f = K.circle_loop(D['fuel_x'], D['fuel_z'], D['fuel_r'], 0.009)
        P, N = S.SIDE_L.to3d(f)
        self.open['fuel'] = dict(uv=S.CL.to2d(P), P=P, N=N, xz=f)
        self.cut['fuel'] = Cut(S.SIDE_L, f, True, +1.0)

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
        down = np.linspace(S.L_T[0], S.L_T[1], 4)
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
        # 2. rear centre line up, round the plate recess (its outline runs top centre -> bottom centre)
        pl = self.open['plate']
        tt = ts[(ts > S.L_T[0]) & (ts < pl['uv'][-1, 1] - 0.004)]
        p.add(np.stack([np.full(len(tt), U), tt], 1))
        p.add(pl['uv'][::-1], pl['P'][::-1], pl['N'][::-1])
        tt = ts[(ts > pl['uv'][0, 1] + 0.004) & (ts < tend)]
        p.add(np.stack([np.full(len(tt), U), tt], 1))
        # 3. top: rear row (reversed), junction, door opening, junction, front row (reversed)
        p.add(self.row_rear_uv[::-1], self.row_rear_P[::-1], self.row_rear_N[::-1])
        out = self.cut['doorL'].side('out')
        uv, P, NL, NG, _ = self.jl.between(self.jl.C[0][0], out['uv'][-1, 0])
        p.add(uv, P, NL, drop_first=True, drop_last=True)
        self.opening_out = dict(uv=out['uv'][::-1], P=out['P'][::-1], N=out['N'][::-1])
        op = self.opening_out
        p.add(op['uv'], op['P'], op['N'])
        uv, P, NL, NG, _ = self.jl.between(out['uv'][0, 0], self.jl.A[0][0])
        p.add(uv, P, NL, drop_first=True, drop_last=True)
        p.add(self.row_front_uv[::-1], self.row_front_P[::-1], self.row_front_N[::-1])
        # 4. front centre line down, round the slot and the intake (outlines run top centre -> bottom centre)
        sl, ik = self.open['slot'], self.open['intake']
        tt = ts[(ts > sl['uv'][0, 1] + 0.004) & (ts < tend)][::-1]
        p.add(np.stack([np.zeros(len(tt)), tt], 1))
        p.add(sl['uv'], sl['P'], sl['N'])
        tt = ts[(ts < sl['uv'][-1, 1] - 0.004) & (ts > ik['uv'][0, 1] + 0.004)][::-1]
        p.add(np.stack([np.zeros(len(tt)), tt], 1))
        p.add(ik['uv'], ik['P'], ik['N'])
        tt = ts[(ts > S.L_T[0]) & (ts < ik['uv'][-1, 1] - 0.004)][::-1]
        p.add(np.stack([np.zeros(len(tt)), tt], 1))
        return p.loop()

    def lower_body(self, fuel=False):
        loop = self.lower_body_loop()
        holes = []
        for k in ('ind', 'tail_out', 'tail_in'):
            o = self.open[k]
            holes.append(K.Loop(o['uv'], o['P'], o['N']))
        if fuel:
            so = self.cut['fuel'].side('out')
            holes.append(K.Loop(S.CL.to2d(so['P']), so['P'], so['N']))
        pts, sp = S.grid_from(self.us, self.ts)
        # rows under the belt where the body meets the greenhouse (fender tops, rear quarters)
        pts, sp = edge_rows(S.CL, [self.jl.P], pts, sp, loop.uv, offs=(0.012, 0.030, 0.055), step=0.03, clear=0.07)
        V, N, T, Z = K.mesh_region_split(S.CL, [loop], holes, pts, lines=self._l_lines(), zone_fn=self._l_zone, spacing=sp)
        return K.add_zones(K.Buf(), V, N, T, Z, ZMAT)

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
        b.extend(K.panel_back(si['P'], si['N'], si['E']))
        return b

    def door_skin(self):
        s = self.cut['doorL'].side('in')
        p = Path()
        p.add(s['uv'], s['P'], s['N'])
        uv, P, NL, NG, _ = self.jl.between(s['uv'][-1, 0], s['uv'][0, 0])
        p.add(uv, P, NL, drop_first=True, drop_last=True)
        loop = p.loop()
        pts, sp = S.grid_from(self.us, self.ts)
        # rows of points just under the belt (no fans of thin triangles from its dense edge)
        pts, sp = edge_rows(S.CL, [P], pts, sp, loop.uv, offs=(0.012, 0.030, 0.055), step=0.03, clear=0.07)
        V, N, T, Z = K.mesh_region_split(S.CL, [loop], [], pts, lines=self._l_lines(), zone_fn=self._l_zone, spacing=sp)
        return K.add_zones(K.Buf(), V, N, T, Z, ZMAT)

    # ------------------------------------------------------------------ top regions
    def top_front(self):
        """The fixed top in front of the windscreen: the cowl, the fender tops beside the bonnet, the pods'
        surrounds (the pod lids are holes) and the nose strip."""
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
        loop = p.loop()
        po = self.cut['pod'].side('out')
        holes = [K.Loop(po['uv'], po['P'], po['N'])]
        xg, yg = np.meshgrid(np.arange(0.30, 2.05, 0.035), np.arange(0.0, 0.85, 0.03), indexing='ij')
        g = np.stack([xg.ravel(), yg.ravel()], 1)
        V, N, T = K.mesh_region(S.CT, [loop], holes, g, spacing=0.03)
        return K.Buf().add(V, N, T, 'paint')

    def top_rear(self):
        J = self.J
        i1 = self.jl.i1
        out = self.cut['trunk'].side('out')
        p = Path()
        p.add(self.row_rear_P[:, :2], self.row_rear_P, self.row_rear_N)
        x0 = self.row_rear_P[-1, 0]
        x1 = out['uv'][-1, 0]
        xs = np.linspace(x0, x1, max(2, int(abs(x1 - x0) / 0.01) + 1))[1:-1]
        p.add(np.stack([xs, np.zeros(len(xs))], 1))
        p.add(out['uv'][::-1], out['P'][::-1], out['N'][::-1])
        x2 = out['uv'][0, 0]
        x3 = J['P'][-1, 0]
        xs = np.linspace(x2, x3, max(2, int(abs(x3 - x2) / 0.01) + 1))[1:-1]
        p.add(np.stack([xs, np.zeros(len(xs))], 1))
        p.add(J['P'][i1 + 1:][::-1, :2], J['P'][i1 + 1:][::-1], J['NL'][i1 + 1:][::-1])
        loop = p.loop()
        xg, yg = np.meshgrid(np.arange(-2.05, -1.30, 0.035), np.arange(0.0, 0.85, 0.03), indexing='ij')
        g = np.stack([xg.ravel(), yg.ravel()], 1)
        V, N, T = K.mesh_region(S.CT, [loop], [], g, spacing=0.03)
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
        xg, yg = np.meshgrid(np.arange(bb[:, 0].min() - 0.05, bb[:, 0].max() + 0.05, 0.055), np.arange(0.0, 0.8, 0.055), indexing='ij')
        g = np.stack([xg.ravel(), yg.ravel()], 1)
        V, N, T = K.mesh_region(S.CT, [loop], [], g, spacing=0.055)
        return K.Buf().add(V, N, T, 'paint')

    def pod_lid(self):
        """The skin of a pod's lid (left), flush with the bonnet when shut."""
        s = self.cut['pod'].side('in')
        bb = s['uv']
        g = K.grid_points(bb[:, 0].min(), bb[:, 0].max(), bb[:, 1].min(), bb[:, 1].max(), 0.04, dt=0.04)
        V, N, T = K.mesh_region(S.CT, [K.Loop(s['uv'], s['P'], s['N'])], [], g, spacing=0.04)
        return K.Buf().add(V, N, T, 'paint')

    # ------------------------------------------------------------------ greenhouse
    def greenhouse(self, level=0.0):
        """Greenhouse body (pillars, sails, roof rails, headers) outside; level < 0: the same region that far
        inside, facing the cabin (pillar and rail trims)."""
        J = self.J
        gus = S.g_u_samples()
        gts = S.g_t_samples()
        UG = S.G_GUIDE.length
        fo = self.cut['doorG'].side('out')
        ws = self.win['ws']
        rw = self.win['rw']
        p = Path()
        uv_f = S.CG.to2d(fo['P'])
        # 1. junction from the front centre to the door frame (its front end = A edge bottom)
        ua = uv_f[-1, 0]
        m = J['uvG'][:, 0] < ua - 1e-4
        p.add(J['uvG'][m], J['P'][m], J['NG'][m])
        # 2. door frame outer boundary reversed (A edge up, rail rearwards, rear edge down)
        p.add(uv_f[::-1], fo['P'][::-1], fo['N'][::-1])
        # 3. junction to the rear centre
        m = J['uvG'][:, 0] > uv_f[0, 0] + 1e-4
        p.add(J['uvG'][m], J['P'][m], J['NG'][m])
        # 4. rear centre line with the rear window notch (its outline runs top -> bottom)
        rw_uv = S.CG.to2d(rw['P'])
        tt = gts[(gts > J['uvG'][-1, 1] + 0.004) & (gts < rw_uv[-1, 1] - 0.004)]
        p.add(np.stack([np.full(len(tt), UG), tt], 1))
        p.add(rw_uv[::-1], rw['P'][::-1], rw['N'][::-1])
        tt = gts[gts > rw_uv[0, 1] + 0.004]
        p.add(np.stack([np.full(len(tt), UG), tt], 1))
        # 5. top row forwards
        uu = gus[::-1]
        p.add(np.stack([uu, np.full(len(uu), S.G_T[-1])], 1), drop_first=True, drop_last=True)
        # 6. front centre line with the windscreen notch (outline runs top -> bottom)
        ws_uv = S.CG.to2d(ws['P'])
        tt = gts[gts > ws_uv[0, 1] + 0.004][::-1]
        p.add(np.stack([np.zeros(len(tt)), tt], 1))
        p.add(ws_uv, ws['P'], ws['N'])
        tt = gts[(gts < ws_uv[-1, 1] - 0.004) & (gts > J['uvG'][0, 1] + 0.004)][::-1]
        p.add(np.stack([np.zeros(len(tt)), tt], 1))
        loop = p.loop()
        qP, qN = S.SIDE_G.to3d(self.quarter)
        self.quarter_P = (qP, qN)
        if level < 0:
            loop = K.Loop(K.resample(loop.uv, 0.035, closed=True))
            holes = [K.Loop(S.CG.to2d(qP))]
            cu = np.linspace(0, UG, int(UG / 0.08))
            ct = np.unique(np.concatenate([np.linspace(S.G_T[0], S.G_T[2], 6), np.linspace(S.G_T[2], S.G_T[4], 5)]))
            pts, sp = S.grid_from(cu, ct)
            V, N, T = K.mesh_region(S.CG, [loop], holes, pts, spacing=sp, level=level)
            return K.Buf().add(V, -N, T, 'plastic_int')
        holes = [K.Loop(S.CG.to2d(qP), qP, qN)]
        pts, sp = S.grid_from(gus, gts)
        pts, sp = edge_rows(S.CG, [self.win[k]['P'] for k in ('ws', 'rw')] + [qP], pts, sp, loop.uv)
        pts, sp = rail_rows(pts, sp, uv_f, gts)
        V, N, T = K.mesh_region(S.CG, [loop], holes, pts, spacing=sp)
        return K.Buf().add(V, N, T, 'paint')

    def door_frame(self):
        """Door frame skin on the greenhouse (inside the frame cut, minus the glass opening)."""
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
        """Fixed glass (windscreen, rear window, the quarter windows; left halves) and the door glass, inside the
        greenhouse surface."""
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
            g = K.grid_points(-0.8, 0.8, -0.2, 1.0, 0.09, dt=0.09)
            V, N, T = K.mesh_region(ch, [K.Loop(K.resample_keep(loop, 0.05))], [], g, spacing=0.09, level=-0.007)
            out[kind] = K.Buf().add(V, N, T, 'glass')
        b = K.Buf()
        for name, poly in self.cut['winG']:
            big = K.offset_loop2(poly, -0.012)
            g = K.grid_points(-1.0, 0.6, 0.8, 1.25, 0.10, dt=0.10)
            V, N, T = K.mesh_region(S.SIDE_G, [K.Loop(big)], [], g, spacing=0.10, level=-0.012)
            b.add(V, N, T, 'glass')
        out['door'] = b
        big = K.offset_loop2(self.quarter, -0.012)
        g = K.grid_points(-1.5, -0.5, 0.8, 1.25, 0.10, dt=0.10)
        V, N, T = K.mesh_region(S.SIDE_G, [K.Loop(big)], [], g, spacing=0.10, level=-0.010)
        out['quarter'] = K.Buf().add(V, N, T, 'glass')
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
        xg, yg = np.meshgrid(np.arange(-1.2, 0.2, 0.05), np.arange(0.0, 0.7, 0.05), indexing='ij')
        g = np.stack([xg.ravel(), yg.ravel()], 1)
        V, N, T = K.mesh_region(S.CR, [K.Loop(P[:, :2], P, Nn)], [], g, spacing=0.05)
        return K.Buf().add(V, N, T, 'paint')

    # ------------------------------------------------------------------ edges
    def edges(self):
        """Rolled edges of all cuts: (body buffer, {panel name: buffer})."""
        body = K.Buf()
        panels = {}
        if not hasattr(self, 'win_P'):
            self.door_frame()
        if not hasattr(self, 'quarter_P'):
            self.quarter_P = S.SIDE_G.to3d(self.quarter)
        if not hasattr(self, 'opening_out'):
            self.lower_body_loop()
        op = self.opening_out
        E = side_dir(op['P'], op['N'], self._nearest(op['P'], self.cut['doorL'].P), False)
        V, N, Tr = K.roll_edge(op['P'], op['N'], E, ER, 0.10, 0.0, 2, closed=False)
        body.add(V, N, Tr, 'paint')
        s_ = self.cut['doorL'].side('in')
        V, N, Tr = K.roll_edge(s_['P'], s_['N'], s_['E'], ER, 0.10, 0.03, 1, closed=False, hem_segs=0)
        panels['door'] = K.Buf().add(V, N, Tr, 'paint')
        c = self.cut['doorG']
        so = c.side('out')
        V, N, Tr = K.roll_edge(so['P'], so['N'], so['E'], ER, 0.032, 0.0, 2, closed=False)
        body.add(V, N, Tr, 'paint')
        si = c.side('in')
        V, N, Tr = K.roll_edge(si['P'], si['N'], si['E'], ER, 0.035, 0.008, 1, closed=False, hem_segs=0)
        panels['door'].add(V, N, Tr, 'paint')
        for name, (poly, P, Nn) in self.win_P.items():
            cen = np.tile(P.mean(0), (len(P), 1))
            E = side_dir(P, Nn, cen, True)
            V, N, Tr = K.roll_edge(P, Nn, E, 0.003, 0.035, 0.0, 1, closed=True)
            panels['door'].add(V, N, Tr, 'paint')
        # the quarter window's opening in the greenhouse
        qP, qN = self.quarter_P
        E = side_dir(qP, qN, np.tile(qP.mean(0), (len(qP), 1)), True)
        V, N, Tr = K.roll_edge(qP, qN, E, 0.003, 0.032, 0.0, 2, closed=True)
        body.add(V, N, Tr, 'paint')
        for name in ('hood', 'trunk'):
            c = self.cut[name]
            so = c.side('out')
            V, N, Tr = K.roll_edge(so['P'], so['N'], so['E'], ER, 0.03, 0.0, 2, closed=False)
            body.add(V, N, Tr, 'paint')
            si = c.side('in')
            V, N, Tr = K.roll_edge(si['P'], si['N'], si['E'], ER, 0.025, 0.008, 2, closed=False, hem_segs=0)
            panels[name] = K.Buf().add(V, N, Tr, 'paint')
        # the pod: its lid's rolled edge (on the pod) and the body's lip round its well (the well is built inside)
        c = self.cut['pod']
        si = c.side('in')
        V, N, Tr = K.roll_edge(si['P'], si['N'], si['E'], ER, 0.022, 0.008, 2, closed=True, hem_segs=0)
        panels['pod'] = K.Buf().add(V, N, Tr, 'paint')
        so = c.side('out')
        V, N, Tr = K.roll_edge(so['P'], so['N'], so['E'], ER, 0.02, 0.0, 2, closed=True, flange_dir=(0, 0, -1))
        body.add(V, N, Tr, 'paint')
        self.pod_lip = V.reshape(-1, len(so['P']), 3)[-1]
        # windscreen and rear window openings
        for kind, cen in (('ws', (float(S.ws_x(0.0, 1.05)) - 0.1, 0.0, 1.05)), ('rw', (float(S.rw_x(0.0, 1.05)) + 0.1, 0.0, 1.05))):
            wv = self.win[kind]
            E = side_dir(wv['P'], wv['N'], np.tile(cen, (len(wv['P']), 1)), False)
            V, N, Tr = K.roll_edge(wv['P'], wv['N'], E, 0.004, 0.032, 0.0, 2, closed=False)
            body.add(V, N, Tr, 'paint')
        # wheel arches: rolled lip into the wheel well (arch circle part only)
        for (P, N), uv in zip(self.arch_P, self.arch_uv):
            keep = uv[:, 1] >= S.L_T[1] - 1e-6
            P = P[keep]
            N = N[keep]
            cc = np.array([P[:, 0].mean(), P[:, 1].mean(), D['hub_z']])
            E = side_dir(P, N, np.tile(cc, (len(P), 1)), False)
            V, Nn, Tr = K.roll_edge(P, N, E, 0.007, 0.035, 0.0, 2, closed=False)
            body.add(V, Nn, Tr, 'paint')
        return body, panels

    # ------------------------------------------------------------------ openings: details
    def opening_details(self):
        """Edges and the parts of the body behind the front and rear openings (left half)."""
        b = K.Buf()
        # --- the slot and the intake: rolled lips, dark backs, slats
        for name, cz in (('slot', 0.53), ('intake', 0.28)):
            o = self.open[name]
            ref = np.tile([o['P'][:, 0].mean(), 0.0, cz], (len(o['P']), 1))
            E = side_dir(o['P'], o['N'], ref, False)
            V, N, T = K.roll_edge(o['P'], o['N'], E, 0.004, 0.028, 0.0, 2, closed=False, flange_dir=(-1, 0, 0))
            b.add(V, N, T, 'paint')
            b.extend(self.vent_grille(name))
        # --- indicators: a lip and an amber lens set a little in
        ind = self.open['ind']
        ci = ind['P'].mean(0)
        E = side_dir(ind['P'], ind['N'], np.tile(ci, (len(ind['P']), 1)), True)
        V, N, T = K.roll_edge(ind['P'], ind['N'], E, 0.003, 0.012, 0.0, 2, closed=True, flange_dir=(-1, 0, 0))
        b.add(V, N, T, 'paint')
        ring = V.reshape(-1, len(ind['P']), 3)[-1]
        b.extend(K.fill_loop(ring, (1, 0, 0), 'lens_amber', interior_step=0.03))
        # --- tail lamps: the outer recess takes the tail lamp part; the inner one is the body's own lamp
        for name in ('tail_out', 'tail_in'):
            tl = self.open[name]
            ct = tl['P'].mean(0)
            E = side_dir(tl['P'], tl['N'], np.tile(ct, (len(tl['P']), 1)), True)
            V, N, T = K.roll_edge(tl['P'], tl['N'], E, 0.003, 0.010, 0.0, 2, closed=True, flange_dir=(1, 0, 0))
            b.add(V, N, T, 'trim')
            ring = V.reshape(-1, len(tl['P']), 3)[-1]
            depth = 0.045 if name == 'tail_out' else 0.012
            b.extend(K.ring_tube(ring, (1, 0, 0), depth, 1, 'trim'))
            back = ring + np.array([depth, 0, 0])
            if name == 'tail_out':
                b.extend(K.fill_loop(back, (-1, 0, 0), 'trim'))
                self.tail_mount = (np.array([tl['P'][:, 0].mean(), ct[1], ct[2]]), -tl['N'].mean(0))
            else:
                b.extend(self.body_lamp(back, ct))
        # --- plate recess (left half) in the tail panel
        pl = self.open['plate']
        ref = np.tile([pl['P'][:, 0].mean(), 0.0, 0.5 * (D['tail_z0'] + D['tail_z1'])], (len(pl['P']), 1))
        E = side_dir(pl['P'], pl['N'], ref, False)
        V, N, T = K.roll_edge(pl['P'], pl['N'], E, 0.003, 0.012, 0.0, 2, closed=False, flange_dir=(1, 0, 0))
        b.add(V, N, T, 'trim')
        bot = V.reshape(-1, len(pl['P']), 3)[-1]
        zz = np.linspace(bot[-1, 2], bot[0, 2], 8)[1:-1]
        closing = np.stack([np.full(len(zz), bot[:, 0].mean()), np.zeros(len(zz)), zz], 1)
        b.extend(K.fill_loop(np.vstack([bot, closing]), (-1, 0, 0), 'trim'))
        self.plate_x = float(bot[:, 0].mean())
        return b

    def body_lamp(self, ring, c):
        """The inner lamp of a twin pair (the body's own): a red lens with a stepped ring and a reflector dot."""
        b = K.Buf()
        n = np.array([-1.0, 0.0, 0.0])
        x = float(ring[:, 0].mean())
        r = float(np.mean(np.hypot(ring[:, 1] - c[1], ring[:, 2] - c[2])))
        prof = np.array([(r, 0.0), (r * 0.97, 0.004), (r * 0.80, 0.008), (r * 0.40, 0.010), (0.0, 0.011)])
        V, N, T = K.lathe(prof, (x, c[1], c[2]), n, 22)
        b.add(V, N, T, 'lens_tail')
        V, N, T = K.lathe(np.array([(r * 0.62, 0.0084), (r * 0.58, 0.0098), (r * 0.54, 0.0084)]), (x, c[1], c[2]), n, 22)
        b.add(V, N, T, 'chrome')
        return b

    def vent_grille(self, name):
        """The dark back of the slot / intake 40 mm in and its slats."""
        b = K.Buf()
        o = self.open[name]
        g = o['yz']
        z0, z1 = float(g[:, 1].min()), float(g[:, 1].max())
        w = float(g[:, 0].max())
        loop = np.vstack([g, np.stack([np.zeros(8), np.linspace(z0, z1, 10)[1:-1]], 1)])
        loop2 = K.offset_loop2(K.ccw(loop), 0.004)
        loop2[:, 0] = np.maximum(loop2[:, 0], 0.0)
        pts = K.grid_points(0, w, z0, z1, 0.07, dt=0.05)
        V, N, T = K.mesh_region(S.FRONT_L, [K.Loop(K.resample(loop2, 0.03))], [], pts, spacing=0.05, level=-0.04)
        b.add(V, -N, T, 'trim')
        ys = np.linspace(0.0, w - 0.010, 5)
        slat = K.round_profile(np.array([(-0.006, -0.009), (0.006, -0.009), (0.006, 0.009), (-0.006, 0.009)]), 0.004, 1)
        slat = np.vstack([slat, slat[:1]])
        nz = 1 if name == 'slot' else 3
        zs = [0.5 * (z0 + z1)] if nz == 1 else list(np.linspace(z0 + 0.035, z1 - 0.035, nz))
        for z in zs:
            P, _ = S.FRONT_L.to3d(np.stack([ys, np.full(len(ys), z)], 1))
            path = P - np.array([0.022, 0, 0])
            V, N, T = K.sweep(path, (0, 0, 1), slat, closed=False, closed_prof=True)
            b.add(V, N, T, 'trim')
            b.add(*K.lathe(np.array([[0.0, 0.0], [0.012, 0.0]]), path[-1], (0, 1, 0), 8, prof_n=np.array([[0, 1.0], [0, 1.0]])), 'trim')
        if name == 'intake':
            # vertical bars in the intake (the radiator shows through between them)
            for y in np.linspace(0.10, w - 0.08, 3):
                zz = np.linspace(z0 + 0.006, z1 - 0.006, 6)
                P, _ = S.FRONT_L.to3d(np.stack([np.full(len(zz), y), zz], 1))
                path = P - np.array([0.030, 0, 0])
                b.extend(K.tube_buf(path, 0.005, 'trim', 6))
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
