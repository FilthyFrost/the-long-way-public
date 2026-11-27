"""Snail exterior (left half; frames/_snail_build.py mirrors). The cab: the one shell C on its loft chart CC, the
body region with the front arch notch, the windscreen and grille notches at the front centre, the rear window's
notch at the back centre, holes for the door and the head lamps, split by the cream band (paint below and above,
paint_b in the band); the roof's middle; the door skin; the glass; the rolled edges, flanges and hems; the lamps,
grille, emblem, indicators, wipers' trims and the seals; the inside of the shell (the lining, at WALL). The box
(class Box): flat aluminium-van panels with ribs, corner posts, top and bottom rails, the roof, the front wall, the
rear frame with its sill and header, the twin rear doors (the right one is the trunk panel), its lamps."""
import math
import sys

sys.dont_write_bytecode = True

import numpy as np  # noqa: E402

from frames import _kit as K  # noqa: E402
from frames import snail as S  # noqa: E402
from frames._sedan_ext import Path, side_dir  # noqa: E402

D = S.D
PI = math.pi
DELTA = S.DELTA
ER = S.ER
U = S.U_END
T = S.C_T
ZMAT = {0: 'paint', 1: 'paint_b'}
WALL = -0.03          # the lining inside the cab's shell
CAB_FLOOR = 0.90      # the cab floor's top (the lining is painted metal below it)


def zone_band(cen):
    return np.where((cen[:, 1] > S.T_BAND0) & (cen[:, 1] < S.T_BAND1), 1, 0)


GRAB_X, GRAB_Z = D['xr'] + 0.075, (1.02, 1.66)     # the grab handle's feet on the cab's back corner
HANDLE = (D['cd_x0'] + 0.13, 1.36)                  # the door's outside handle (its lock 11 cm ahead)


def keep_clear(pts, sp, rects, gap=0.006, margin=0.03, step=0.02):
    """Grid points kept out from under what stands on a skin (rects (u0, u1, t0, t1) on its chart) and a ring of
    points `gap` clear round each (with a spacing of their own, so that the mesher keeps them): a vertex under a lamp
    bakes black, and the skin round it would take that shadow over a hand's breadth."""
    if not rects:
        return pts, sp
    keep = np.ones(len(pts), bool)
    ring, rsp = [], []
    for (u0, u1, t0, t1) in rects:
        keep &= ~((pts[:, 0] > u0 - margin) & (pts[:, 0] < u1 + margin) & (pts[:, 1] > t0 - margin) & (pts[:, 1] < t1 + margin))
        Q = K.resample(rect2(u0 - gap, u1 + gap, t0 - gap, t1 + gap), step, closed=True)
        ring.append(Q)
        rsp.append(np.full(len(Q), 2.0 * gap))
    return np.vstack([pts[keep]] + ring), np.concatenate([np.broadcast_to(sp, (len(pts),))[keep]] + rsp)


def lines_band(u0=-0.1, u1=U + 0.1, near=0.007):
    """The band's edges as constraint lines, and a row of vertices `near` either side of each, and one under the
    windscreen's foot: the edges lie under the chrome beads, the foot under the windscreen's seal, so their own
    vertices bake black; the rows beside them keep that to a hairline the bead covers."""
    out = [(1, S.T_BAND0, u0, u1), (1, S.T_BAND1, u0, u1)]
    if near:
        for z in (D['band_z0'] - near, D['band_z0'] + near, D['band_z1'] - near, D['band_z1'] + near, D['ws_foot'] - 0.008):
            out.append((1, S.t_band(z), u0, u1))
    return out


def band_tone(buf):
    """The paint of a buffer's 'paint' triangles in the band (by their centroids) turned to paint_b: the flanges
    and reveals of the openings take the colour of the skin they turn in from."""
    V, N, Tr, M = buf.arrays()
    if not len(Tr):
        return buf
    cz = V[Tr].mean(axis=1)[:, 2]
    buf.M = ['paint_b' if (m == 'paint' and D['band_z0'] < c < D['band_z1']) else m for m, c in zip(M, cz)]
    return buf


def rr(x0, x1, z0, z1, r, rb=None, step=0.07, arc=0.009):
    """Counter-clockwise rounded rectangle in a chart's plane coordinates (optional other bottom radius)."""
    rb = r if rb is None else rb
    return K.rounded_poly(np.array([(x0, z0), (x1, z0), (x1, z1), (x0, z1)]), [rb, rb, r, r], step, arc_step=arc)


def to_ccw(uv):
    return K.ccw(np.asarray(uv, float))


def trim_sweep(P, up, prof, mat, closed):
    """A rubber or chrome trim swept round a window, its foot closed by a strip facing in (open, from inside through
    the glass the eye went in under the trim and out through its far faces: a light line between a window's reveal and
    its seal)."""
    V, N, Tr = K.sweep(P, up, prof, closed=closed)
    b = K.Buf().add(V, N, Tr, mat)
    V, N, Tr = K.sweep(P, up, prof[[0, -1]], prof_n=np.array([(0.0, -1.0), (0.0, -1.0)]), closed=closed)
    return b.add(V, N, Tr, mat)


def densify(uv, step=0.03, closed=True):
    return K.resample_keep(np.asarray(uv, float), step, closed)


def coarse_loop(uv, step, tol=0.003):
    """A closed loop thinned to within tol of itself (its corners kept), long runs then cut to at most step."""
    uv = np.asarray(uv, float)
    P = np.vstack([uv, uv[:1]])
    Q = P[K.coarse_idx(P, tol)]
    if np.linalg.norm(Q[-1] - Q[0]) < 1e-9:
        Q = Q[:-1]
    return K.resample_keep(Q, step, closed=True)


def roll(P, N, E, *a, closed=True, tol=0.0006, **kw):
    """K.roll_edge on a boundary thinned out where it runs straight."""
    P, N, E = np.asarray(P, float), np.asarray(N, float), np.asarray(E, float)
    if closed:
        k = K.coarse_idx(np.vstack([P, P[:1]]), tol)
        k = k[k < len(P)]
    else:
        k = K.coarse_idx(P, tol)
    return K.roll_edge(P[k], N[k], E[k], *a, closed=closed, **kw)


class Cut:
    """A cut line in the loft chart and its two offset boundaries ('in' = the panel side, 'out' = the body side)."""

    def __init__(self, uv, closed, inner_sign, centre_u=None):
        self.chart = S.CC
        self.uv = np.asarray(uv, float)
        self.closed = closed
        self.P, self.N = S.CC.to3d(self.uv)
        self.sides = {}
        for name, sgn in (('in', inner_sign), ('out', -inner_sign)):
            uvo = K.offset_loop2(self.uv, sgn * DELTA, closed)
            if centre_u is not None:
                uvo[0, 0] = centre_u
                uvo[-1, 0] = centre_u
            P, N = S.CC.to3d(uvo)
            E = side_dir(P, N, self.P, closed)
            self.sides[name] = dict(uv=uvo, P=P, N=N, E=E)

    def side(self, name):
        return self.sides[name]


# ============================================================================================ the cab
class Exterior:
    def __init__(self):
        self.us = S.c_u_samples()
        self.ts = S.c_t_samples()
        self.cut = {}
        self.win = {}
        self._arch()
        self._side_cuts()
        self._rear_cuts()
        self._front_cuts()
        self.box = Box()

    # ------------------------------------------------------------------ cuts
    def _arch(self):
        xa = D['ax_f']
        R, za, zb = D['arch_r'], D['arch_zc'], D['z_bot']
        th = math.asin((zb - za) / R)
        ths = np.linspace(th, PI - th, 48)
        ax = xa + R * np.cos(ths)
        az = za + R * np.sin(ths)
        uu = S.u_of_x(ax)
        uv = np.stack([uu, S.t_of_z(uu, az)], 1)
        uv[0, 1] = uv[-1, 1] = T[1]
        down = np.linspace(T[0], T[1], 3)
        front = np.stack([np.full(len(down), uv[0, 0]), down], 1)
        rear = np.stack([np.full(len(down), uv[-1, 0]), down[::-1]], 1)
        nt = np.vstack([front[:-1], uv, rear[1:]])
        P, N = S.CC.to3d(nt)
        self.arch = dict(uv=nt, P=P, N=N)

    def _side_cuts(self):
        d = D
        loop = rr(d['cd_x0'], d['cd_x1'], d['cd_z0'], d['cd_z1'], d['cd_r'], rb=0.03)
        self.cut['door'] = Cut(to_ccw(S.side_uv(densify(loop, 0.05))), True, +1.0)
        x0, x1, z0, z1, r = d['cd_win']
        self.win['door'] = self._side_win(rr(x0, x1, z0, z1, r))
        # the quarter window ahead of the door: its front edge 8 cm into the nose's corner roll (the pillar between it
        # and the windscreen is a narrow strip of the corner)
        zq = np.linspace(d['q_z1'], d['q_z0'], 7)
        front = np.stack([S.flat_end_x(zq) + 0.08, zq], 1)
        poly = np.vstack([[(d['q_x0'], d['q_z0']), (d['q_x0'], d['q_z1'])], front])
        radii = np.zeros(len(poly))
        radii[0], radii[1], radii[2], radii[-1] = 0.03, 0.03, 0.035, 0.035
        q = K.rounded_poly(K.ccw(poly), radii if K.loop_area(poly) > 0 else radii[::-1], 0.03, arc_step=0.008)
        P, N = S.SIDE.to3d(q)
        uv = S.CC.to2d(P)
        P, N = S.CC.to3d(uv)
        self.win['quarter'] = dict(uv=uv, P=P, N=N)

    @staticmethod
    def _side_win(loop_xz):
        uv = to_ccw(S.side_uv(densify(loop_xz, 0.07)))
        P, N = S.CC.to3d(uv)
        return dict(uv=uv, P=P, N=N, xz=loop_xz)

    def _rear_cuts(self):
        d = D
        # the little rear window: a notch at the back centre (left half: top centre -> round -> bottom centre)
        pts = np.array([(0.0, d['rw_z1']), (d['rw_hw'], d['rw_z1']), (d['rw_hw'], d['rw_z0']), (0.0, d['rw_z0'])])
        yz = K.rounded_poly(pts, [0, d['rw_r'], d['rw_r'], 0], 0.03, closed=False, arc_step=0.008)
        uv = S.rear_uv(yz)
        uv[0, 0] = uv[-1, 0] = U
        P, N = S.CC.to3d(uv)
        self.win['rear'] = dict(uv=uv, P=P, N=N, yz=yz)

    def _front_cuts(self):
        d = D
        # the windscreen: a notch at the front centre (left half), its corners into the nose's corner roll
        hw, z0, z1, r = d['ws_hw'], d['ws_foot'], d['ws_head'], d['ws_r']
        pts = np.array([(0.0, z1), (hw, z1), (hw, z0), (0.0, z0)])
        yz = K.rounded_poly(pts, [0, r, 0.045, 0], 0.03, closed=False, arc_step=0.008)
        P, N = S.FRONT.to3d(yz)
        uv = S.CC.to2d(P)
        uv[0, 0] = uv[-1, 0] = 0.0
        P, N = S.CC.to3d(uv)
        self.win['ws'] = dict(uv=uv, P=P, N=N, yz=yz)
        # the grille: a notch at the front centre under the windscreen (the nose is upright there)
        gw, g0, g1, gr = d['grille_w'], d['grille_z0'], d['grille_z1'], d['grille_r']
        pts = np.array([(0.0, g1), (gw, g1), (gw, g0), (0.0, g0)])
        yz = K.rounded_poly(pts, [0, gr, gr, 0], 0.03, closed=False, arc_step=0.007)
        uv = S.front_uv(yz)
        uv[0, 0] = uv[-1, 0] = 0.0
        P, N = S.CC.to3d(uv)
        self.open_grille = dict(uv=uv, P=P, N=N, yz=yz)
        # the round head lamps
        c = K.circle_loop(d['lamp_y'], d['lamp_z'], d['lamp_d'] / 2, 0.012)
        uv = to_ccw(S.front_uv(c))
        P, N = S.CC.to3d(uv)
        self.open_lamp = dict(uv=uv, P=P, N=N, yz=c)

    # ------------------------------------------------------------------ the body region
    def body_loop(self, coarse=False, lining=False):
        """Outer loop of the cab's body region on the loft (left half). coarse: no fixed points (the lining)."""
        us, ts = self.us, self.ts
        p = Path()
        nt = self.arch
        seg = us[us < nt['uv'][0, 0] - 1e-4]
        p.add(np.stack([seg, np.full(len(seg), T[0])], 1))
        p.add(nt['uv'], nt['P'], nt['N'])
        seg = us[(us > nt['uv'][-1, 0] + 1e-4) & (us < U - 1e-6)]
        p.add(np.stack([np.concatenate([seg, [U]]), np.full(len(seg) + 1, T[0])], 1))
        # back centre line up, round the rear window's notch (its outline runs top -> bottom)
        rw = self.win['rear']
        tt = ts[(ts > T[0] + 1e-4) & (ts < rw['uv'][-1, 1] - 0.004)]
        p.add(np.stack([np.full(len(tt), U), tt], 1))
        p.add(rw['uv'][::-1], rw['P'][::-1], rw['N'][::-1])
        tt = ts[(ts > rw['uv'][0, 1] + 0.004) & (ts < T[-1] - 1e-6)]
        p.add(np.stack([np.full(len(tt) + 1, U), np.concatenate([tt, [T[-1]]])], 1))
        # top row forwards
        uu = us[(us > 1e-6) & (us < U - 1e-6)][::-1]
        p.add(np.stack([np.concatenate([uu, [0.0]]), np.full(len(uu) + 1, T[-1])], 1))
        # front centre line down, round the windscreen and the grille (their outlines run top -> bottom; the lining's
        # edge round the windscreen's flange)
        ws = self.win['ws']
        gr = self.open_grille
        wuv = ws['uv']
        if lining:
            wuv = self.lining_edge(ws, 0.004, np.array([ws['P'][:, 0].mean() - 0.1, 0.0, ws['P'][:, 2].mean()]), False)
            wuv[0, 0] = wuv[-1, 0] = 0.0
        tt = ts[(ts > wuv[0, 1] + 0.004) & (ts < T[-1] - 1e-6)][::-1]
        p.add(np.stack([np.zeros(len(tt)), tt], 1))
        if lining:
            p.add(wuv)
        else:
            p.add(ws['uv'], ws['P'], ws['N'])
        tt = ts[(ts > gr['uv'][0, 1] + 0.004) & (ts < wuv[-1, 1] - 0.004)][::-1]
        p.add(np.stack([np.zeros(len(tt)), tt], 1))
        p.add(gr['uv'], gr['P'], gr['N'])
        tt = ts[(ts > T[0] + 1e-6) & (ts < gr['uv'][-1, 1] - 0.004)][::-1]
        p.add(np.stack([np.zeros(len(tt)), tt], 1))
        loop = p.loop()
        if coarse:
            return K.Loop(coarse_loop(loop.uv, 0.08))
        return loop

    @staticmethod
    def lining_edge(w, flange, cen=None, closed=True):
        """The lining's edge round an opening, on the chart: 3 mm out past the opening's flange (`flange` in from its
        outline, as edges() rolls it) where the flange passes the lining's depth - found in 3D and mapped back. (On
        the corner rolls the chart's level runs along the proxy's normal, not the skin's, and an edge set on the chart
        landed out past the flange there, on the pillar's side: into the hollow shell between them the eye went and out
        through the skin - from the driver's seat a band of the outside 1.2 deg wide showed between the quarter
        window's front reveal and the A pillar's lining, and a thinner line between that and the windscreen's flange.)"""
        P, N = w['P'], w['N']
        E = side_dir(P, N, np.tile(P.mean(0) if cen is None else cen, (len(P), 1)), closed)
        return S.CC.to2d(P + E * (flange + 0.003) + N * WALL)

    def body_holes(self, coarse=False, lining=False):
        def L(d_):
            return K.Loop(d_['uv']) if coarse else K.Loop(d_['uv'], d_['P'], d_['N'])
        # (the lining's opening for the quarter window round its reveal's flange, 3 mm in from the outline)
        q = K.Loop(K.ccw(self.lining_edge(self.win['quarter'], 0.003))) if coarse and lining else L(self.win['quarter'])
        return [L(self.open_lamp), L(self.cut['door'].side('out')), q]

    def keepouts(self, which):
        """What stands on the cab's skin (left half), as rects on the loft: 'body' the indicator over the head lamp,
        the corner marker, the emblem, the grab handle's feet; 'door' the handle and its lock."""
        out = []

        def at(P, hu, ht):
            uv = S.CC.to2d(np.atleast_2d(P))[0]
            out.append((uv[0] - hu, uv[0] + hu, uv[1] - ht, uv[1] + ht))
        if which == 'body':
            p, _ = S.FRONT.to3d(np.array([[D['lamp_y'], D['lamp_z'] + D['lamp_d'] / 2 + 0.065]]))
            at(p[0], 0.072, 0.029)
            u, t = S.SC[1] + 0.5 * (S.SC[2] - S.SC[1]), float(S.t_of_z(0.8, 0.98)[0])
            out.append((u - 0.036, u + 0.036, t - 0.017, t + 0.017))
            p, _ = S.FRONT.to3d(np.array([[0.0, 1.035]]))
            at(p[0], 0.104, 0.049)
            for z in GRAB_Z:
                p, _ = S.SIDE.to3d(np.array([[GRAB_X, z]]))
                at(p[0], 0.021, 0.021)
        else:
            p, _ = S.SIDE.to3d(np.array([[HANDLE[0], HANDLE[1]]]))
            at(p[0], 0.066, 0.019)
            p, _ = S.SIDE.to3d(np.array([[HANDLE[0] + 0.11, HANDLE[1]]]))
            at(p[0], 0.011, 0.011)
        return out

    def body(self):
        """The cab's outer skin (left half)."""
        loop = self.body_loop()
        holes = self.body_holes()
        pts, sp = S.grid_from(self.us, self.ts)
        pts, sp = keep_clear(pts, sp, self.keepouts('body'))
        V, N, Tr, Z = K.mesh_region_split(S.CC, [loop], holes, pts, lines=lines_band(), zone_fn=zone_band, spacing=sp, line_step=0.05)
        return K.add_zones(K.Buf(), V, N, Tr, Z, ZMAT)

    def roof(self, level=0.0):
        """The middle of the cab roof (left half), on the height-field chart, bounded by the loft's top row."""
        if level == 0:
            row = np.stack([self.us, np.full(len(self.us), T[-1])], 1)
        else:
            lp = self.body_loop(coarse=True).uv
            row = lp[np.abs(lp[:, 1] - T[-1]) < 1e-9]
            row = row[np.argsort(row[:, 0])]
        Pr, Nr = S.CC.to3d(row, level if level else None)
        a, b = Pr[-1], Pr[0]
        xs = np.linspace(a[0], b[0], max(3, int(abs(b[0] - a[0]) / 0.06)))[1:-1]
        Pc, Nc = S.CT.to3d(np.stack([xs, np.zeros(len(xs))], 1), level if level else None)
        P = np.vstack([Pr, Pc])
        Nn = np.vstack([Nr, Nc])
        sp = 0.12 if level == 0 else 0.2
        xg, yg = np.meshgrid(np.arange(0.70, 2.50, sp), np.arange(0.0, 0.92, sp), indexing='ij')
        g = np.stack([xg.ravel(), yg.ravel()], 1)
        if level == 0:
            V, N, Tr = K.mesh_region(S.CT, [K.Loop(P[:, :2], P, Nn)], [], g, spacing=sp)
            return K.Buf().add(V, N, Tr, 'paint')
        V, N, Tr = K.mesh_region(S.CT, [K.Loop(P[:, :2])], [], g, spacing=sp, level=level)
        return K.Buf().add(V, -N, Tr, 'fabric')

    def lining(self):
        """The inside of the cab's shell, WALL in, facing in: painted metal under the cab floor (round the
        radiator and the wheel), plastic in the cab, the headliner over the roof roll (left half)."""
        loop = self.body_loop(coarse=True, lining=True)
        holes = [K.Loop(K.resample(h.uv, 0.06, closed=True)) for h in self.body_holes(coarse=True, lining=True)]
        us = S.c_u_samples(0.20, 0.12, 0.06)
        ts = S.c_t_samples(0.20, 4)
        pts, sp = S.grid_from(us, ts)
        t_floor = float(S.t_of_z(2.0, CAB_FLOOR)[0])
        t_roll = float(T[5])
        lines = [(1, t_floor, -0.1, U + 0.1), (1, t_roll, -0.1, U + 0.1)]

        def zf(c):
            t = c[:, 1]
            z = np.zeros(len(t), np.int64)          # 0 the cab: plastic
            z[t < t_floor] = 1                       # 1 under the floor: painted
            z[t > t_roll] = 2                        # 2 the headliner
            return z
        V, N, Tr, Z = K.mesh_region_split(S.CC, [loop], holes, pts, lines=lines, zone_fn=zf, spacing=sp, level=WALL, line_step=0.12)
        return K.add_zones(K.Buf(), V, N, Tr, Z, {0: 'plastic_int', 1: 'paint', 2: 'fabric'}, flip=True)

    # ------------------------------------------------------------------ the door skin
    def door_skin(self):
        """The door's skin round its window, split by the band (left coordinates)."""
        s = self.cut['door'].side('in')
        w = self.win['door']
        us = S.c_u_samples(0.05, 0.05, 0.05)
        pts, sp = S.grid_from(us, self.ts)
        pts, sp = keep_clear(pts, sp, self.keepouts('door'))
        V, N, Tr, Z = K.mesh_region_split(S.CC, [K.Loop(s['uv'], s['P'], s['N'])], [K.Loop(w['uv'], w['P'], w['N'])], pts,
                                          lines=lines_band(), zone_fn=zone_band, spacing=sp, line_step=0.05)
        return K.add_zones(K.Buf(), V, N, Tr, Z, ZMAT)

    def door_card(self, level=-0.05, mat='plastic_int'):
        """The inside of the door (left coordinates), `level` in, facing in, round the window."""
        s = self.cut['door'].side('in')
        w = self.win['door']
        outer = K.offset_loop2(s['uv'], 0.004, True)
        # (the hole 8 mm inside the window's outline, under the end of its reveal's flange: 4 mm outside it the card
        # left a slot between the two, and from the driver's seat the outside showed along the window's top edge)
        hole = K.offset_loop2(w['uv'], 0.008, True)
        us = S.c_u_samples(0.08, 0.08, 0.08)
        pts, sp = S.grid_from(us, S.c_t_samples(0.08, 3))
        V, N, Tr = K.mesh_region(S.CC, [K.Loop(K.resample_keep(outer, 0.05))], [K.Loop(K.resample_keep(hole, 0.05))], pts, spacing=sp, level=level)
        return K.Buf().add(V, -N, Tr, mat)

    # ------------------------------------------------------------------ glass
    def glass(self):
        out = {}
        # windscreen (left half): the opening grown 14 mm (its edge hides behind the rolled flange), 9 mm in
        yz = self.win['ws']['yz']
        big = K.offset_loop2(yz, 0.014, closed=False)
        big[0, 0] = 0.0
        big[-1, 0] = 0.0
        ss = np.linspace(big[-1, 1], big[0, 1], 16)[1:-1]
        loop = np.vstack([big, np.stack([np.zeros(len(ss)), ss], 1)])
        g = K.grid_points(0.0, 0.9, 1.2, 2.1, 0.09, dt=0.09)
        V, N, Tr = K.mesh_region(S.FRONT, [K.Loop(K.resample_keep(K.ccw(loop), 0.045))], [], g, spacing=0.09, level=-0.009)
        out['ws'] = K.Buf().add(V, N, Tr, 'glass')

        def pane(w, level, grow=0.012):
            uv = K.offset_loop2(to_ccw(w['uv']), -grow, True)
            lo, hi = uv.min(0), uv.max(0)
            g = K.grid_points(lo[0], hi[0], lo[1], hi[1], 0.12, dt=0.12)
            V, N, Tr = K.mesh_region(S.CC, [K.Loop(K.resample_keep(uv, 0.06))], [], g, spacing=0.12, level=level)
            return K.Buf().add(V, N, Tr, 'glass')
        out['door'] = pane(self.win['door'], -0.022)
        out['quarter'] = pane(self.win['quarter'], -0.012)
        # the rear window (left half, a notch at the back centre)
        w = self.win['rear']
        uv = K.offset_loop2(w['uv'], -0.012, closed=False)
        uv[0, 0] = uv[-1, 0] = U
        tt = np.linspace(uv[-1, 1], uv[0, 1], 10)[1:-1]
        loop = np.vstack([uv, np.stack([np.full(len(tt), U), tt], 1)])
        g = K.grid_points(U - 0.5, U, T[3], T[5], 0.12, dt=0.12)
        V, N, Tr = K.mesh_region(S.CC, [K.Loop(K.resample_keep(K.ccw(loop), 0.06))], [], g, spacing=0.12, level=-0.016)
        out['rear'] = K.Buf().add(V, N, Tr, 'glass')
        return out

    # ------------------------------------------------------------------ edges
    def edges(self):
        """Rolled edges: (body buffer for the left half, panel buffers)."""
        body = K.Buf()
        panels = {}
        # the door's opening (body) and the door's hem, its window's reveal
        c = self.cut['door']
        so = c.side('out')
        V, N, Tr = roll(so['P'], so['N'], so['E'], ER, 0.06, 0.0, 2, closed=True)
        body.add(V, N, Tr, 'paint')
        si = c.side('in')
        V, N, Tr = roll(si['P'], si['N'], si['E'], ER, 0.055, 0.02, 2, closed=True, hem_segs=0)
        pb = panels.setdefault('door', K.Buf())
        pb.add(V, N, Tr, 'paint')
        w = self.win['door']
        E = side_dir(w['P'], w['N'], np.tile(w['P'].mean(0), (len(w['P']), 1)), True)
        V, N, Tr = roll(w['P'], w['N'], E, 0.003, 0.048, 0.0, 2, closed=True)
        pb.add(V, N, Tr, 'paint')
        # the quarter window's reveal
        w = self.win['quarter']
        E = side_dir(w['P'], w['N'], np.tile(w['P'].mean(0), (len(w['P']), 1)), True)
        V, N, Tr = roll(w['P'], w['N'], E, 0.003, 0.036, 0.0, 2, closed=True)
        body.add(V, N, Tr, 'paint')
        # the rear window's reveal
        w = self.win['rear']
        cen = np.array([w['P'][:, 0].mean() + 0.1, 0.0, w['P'][:, 2].mean()])
        E = side_dir(w['P'], w['N'], np.tile(cen, (len(w['P']), 1)), False)
        V, N, Tr = roll(w['P'], w['N'], E, 0.003, 0.036, 0.0, 2, closed=False)
        body.add(V, N, Tr, 'paint')
        # windscreen opening
        w = self.win['ws']
        cen = np.array([w['P'][:, 0].mean() - 0.1, 0.0, w['P'][:, 2].mean()])
        E = side_dir(w['P'], w['N'], np.tile(cen, (len(w['P']), 1)), False)
        V, N, Tr = roll(w['P'], w['N'], E, 0.004, 0.034, 0.0, 2, closed=False)
        body.add(V, N, Tr, 'paint')
        # the wheel arch: the lip into the wheel well (the arc only)
        a = self.arch
        keep = a['uv'][:, 1] >= T[1] - 1e-6
        P, N = a['P'][keep], a['N'][keep]
        cc = np.array([P[:, 0].mean(), P[:, 1].mean(), D['hub_z']])
        E = side_dir(P, N, np.tile(cc, (len(P), 1)), False)
        V, Nn, Tr = roll(P, N, E, 0.007, 0.045, 0.0, 2, closed=False)
        body.add(V, Nn, Tr, 'paint')
        return body, panels

    # ------------------------------------------------------------------ lamps, grille, nose
    def opening_details(self):
        b = K.Buf()
        # head lamp buckets
        lp = self.open_lamp
        c3 = S.FRONT.to3d(np.array([[D['lamp_y'], D['lamp_z']]]))[0][0]
        E = side_dir(lp['P'], lp['N'], np.tile(c3, (len(lp['P']), 1)), True)
        V, N, Tr = K.roll_edge(lp['P'], lp['N'], E, 0.005, 0.012, 0.0, 2, closed=True, flange_dir=(-1, 0, 0))
        b.add(V, N, Tr, 'paint')
        ring = V.reshape(-1, len(lp['P']), 3)[-1]
        depth = 0.075
        b.extend(K.ring_tube(ring, (-1, 0, 0), depth, 1, 'trim'))
        b.extend(K.fill_loop(ring - np.array([depth, 0, 0]), (1, 0, 0), 'trim'))
        self.lamp_mount = (c3, lp['N'].mean(0))
        b.extend(self.grille())
        return b

    def grille(self):
        """The grille in its notch (left half): a rolled flange into it, a dark back panel 6 cm in, four chrome
        slats and a chrome surround on the nose."""
        b = K.Buf()
        gr = self.open_grille
        gw, z0, z1 = D['grille_w'], D['grille_z0'], D['grille_z1']
        ref = np.tile([gr['P'][:, 0].mean(), 0.0, 0.5 * (z0 + z1)], (len(gr['P']), 1))
        E = side_dir(gr['P'], gr['N'], ref, False)
        V, N, Tr = roll(gr['P'], gr['N'], E, 0.005, 0.06, 0.0, 2, closed=False, flange_dir=(-1, 0, 0))
        b.add(V, N, Tr, 'paint')
        # the back panel: the notch's outline closed along the centre line, 6 cm in
        g = gr['yz']
        loop = np.vstack([g, np.stack([np.zeros(8), np.linspace(z0, z1, 10)[1:-1]], 1)])
        loop2 = K.offset_loop2(K.ccw(loop), 0.006)
        loop2[:, 0] = np.maximum(loop2[:, 0], 0.0)
        pts = K.grid_points(0, gw, z0, z1, 0.08, dt=0.08)
        V, N, Tr = K.mesh_region(S.FRONT, [K.Loop(K.resample(loop2, 0.04))], [], pts, spacing=0.08, level=-0.06)
        b.add(V, -N, Tr, 'trim')
        # four chrome slats across, set 2 cm back
        slat = K.round_profile(np.array([(-0.008, -0.016), (0.008, -0.016), (0.008, 0.016), (-0.008, 0.016)]), 0.006, 1)
        slat = np.vstack([slat, slat[:1]])
        ys = np.linspace(0.0, gw - 0.012, 6)
        for z in np.linspace(z0 + 0.05, z1 - 0.05, 4):
            P, _ = S.FRONT.to3d(np.stack([ys, np.full(len(ys), z)], 1))
            V, N, Tr = K.sweep(P - np.array([0.022, 0, 0]), (0, 0, 1), slat, closed=False, closed_prof=True)
            b.add(V, N, Tr, 'chrome')
            end = V.reshape(len(P), -1, 3)[-1]
            b.extend(K.fill_loop(end, (0, 1, 0), 'chrome'))
        # the chrome surround on the nose round the notch
        P, Ns = S.FRONT.to3d(K.offset_loop2(g, -0.014, closed=False))
        prof = K.round_profile(np.array([(-0.012, 0.0), (-0.011, 0.005), (0.011, 0.005), (0.012, 0.0)]), 0.003, 1)
        V, N, Tr = K.sweep(P, (1, 0, 0), prof, closed=False)
        b.add(V, N, Tr, 'chrome')
        return b

    def nose_details(self):
        """Left half: the indicator over each head lamp, a side marker on the front corner, the two roof marker
        lamps over the windscreen, the cowl's vent slots."""
        b = K.Buf()
        p, n = S.FRONT.to3d(np.array([[D['lamp_y'], D['lamp_z'] + D['lamp_d'] / 2 + 0.065]]))
        b.extend(K.box_buf((-0.012, -0.065, -0.022), (0.006, 0.065, 0.022), 'lens_amber', 0.008, 2, xf=K.mat4_trs(p[0])))
        b.extend(K.box_buf((-0.008, -0.071, -0.028), (0.002, 0.071, 0.028), 'chrome', 0.006, 2, xf=K.mat4_trs(p[0])))
        # a marker on the corner roll, low
        P, N = S.CC.to3d(np.array([[S.SC[1] + 0.5 * (S.SC[2] - S.SC[1]), float(S.t_of_z(0.8, 0.98)[0])]]))
        R = K.frame_from(K.unit(np.cross((0, 0, 1.0), N[0])), N[0])
        b.extend(K.box_buf((-0.035, -0.016, -0.004), (0.035, 0.016, 0.007), 'lens_amber', 0.006, 2, xf=K.mat4_trs(P[0], R)))
        # marker lamps on the roof over the windscreen's corners
        p, n = S.CT.to3d(np.array([[2.22, 0.62]]))
        b.extend(K.box_buf(p[0] + (-0.03, -0.04, -0.004), p[0] + (0.03, 0.04, 0.012), 'trim', 0.006, 2))
        b.extend(K.box_buf(p[0] + (-0.026, -0.034, 0.010), p[0] + (0.026, 0.034, 0.036), 'lens_amber', 0.012, 2))
        return b

    def emblem(self):
        """Our own mark in the middle of the nose: a snail - a chrome spiral shell on a chrome body with two
        feelers, on a cream disc (centred, not mirrored)."""
        b = K.Buf()
        zc = 1.035
        p0, n0 = S.FRONT.to3d(np.array([[0.0, zc]]))
        n0 = K.unit(n0[0])
        up = K.unit(np.array([0.0, 0.0, 1.0]) - n0 * n0[2])
        right = np.cross(up, n0)
        M = K.mat4_trs(p0[0], np.stack([right, up, n0], 1), s=1.35)
        # the cream badge plate: a rounded lozenge
        plate = K.rounded_poly(np.array([(-0.075, -0.035), (0.075, -0.035), (0.075, 0.035), (-0.075, 0.035)]), [0.03] * 4, 0.02, arc_step=0.006)
        b.extend(K.prism_buf(K.ccw(plate), -0.002, 0.003, 'chrome', bevel=0.0012, segs=1, xf=M))
        inner = K.offset_loop2(K.ccw(plate), 0.005)
        b.extend(K.prism_buf(inner, 0.002, 0.0042, 'paint_b', bevel=0.0, segs=1, xf=M))
        # the body: a low slug from the tail (right) to the head (left, the snail goes left on the badge)
        body = np.array([(0.052, -0.022), (-0.052, -0.022), (-0.058, -0.016), (-0.056, -0.006), (-0.046, -0.004),
                         (0.030, -0.010), (0.052, -0.016)])
        b.extend(K.prism_buf(K.ccw(body), 0.004, 0.0068, 'chrome', bevel=0.0008, segs=1, xf=M))
        # the shell: a disc with a raised spiral on it
        sc = (0.008, 0.006)
        V, N, Tr = K.lathe(np.array([(0.0, 0.0072), (0.016, 0.0070), (0.026, 0.0062), (0.0285, 0.0045), (0.0285, 0.004)])[::-1],
                           (0, 0, 0), (0, 0, 1), 24)
        V = V + np.array([sc[0], sc[1], 0.0])
        R3 = M[:3, :3]
        b.add(V @ R3.T + M[:3, 3], N @ R3.T, Tr, 'chrome')
        th = np.linspace(0.0, 2.6 * PI, 60)
        rs = 0.004 + 0.020 * th / (2.6 * PI)
        sp = np.stack([sc[0] + rs * np.cos(th), sc[1] + rs * np.sin(th), np.full(len(th), 0.0078)], 1)
        b.extend(K.tube_buf(sp @ R3.T + M[:3, 3], 0.0014, 'paint_b', 6))
        # two feelers from the head
        for (dx, dy) in ((-0.004, 0.020), (0.006, 0.017)):
            a0 = np.array([-0.050, -0.006, 0.0062])
            a1 = np.array([-0.054 + dx, -0.006 + dy, 0.0062])
            pts = np.array([a0, 0.5 * (a0 + a1) + (-0.003, 0.0, 0.0), a1])
            b.extend(K.tube_buf(pts @ R3.T + M[:3, 3], 0.0012, 'chrome', 6))
            b.extend(K.cyl_buf(a1 @ R3.T + M[:3, 3], (a1 + (0, 0, 0.001)) @ R3.T + M[:3, 3], 0.0026, 'chrome', 8))
        return b

    # ------------------------------------------------------------------ trims
    def ws_trims(self):
        b = K.Buf()
        w = self.win['ws']
        cen = np.array([w['P'][:, 0].mean() - 0.1, 0.0, w['P'][:, 2].mean()])
        E = side_dir(w['P'], w['N'], np.tile(cen, (len(w['P']), 1)), False)
        k = K.coarse_idx(w['P'], 0.0012)
        P, Nn, E = w['P'][k], w['N'][k], E[k]
        prof = np.array([(-0.007, -0.006), (-0.006, 0.003), (0.0, 0.0055), (0.006, 0.003), (0.007, -0.006)])
        b.extend(trim_sweep(P + E * 0.006 - Nn * 0.004, Nn, prof, 'rubber', False))
        prof = np.array([(-0.0045, -0.001), (-0.0035, 0.003), (0.0035, 0.003), (0.0045, -0.001)])
        b.extend(trim_sweep(P + E * 0.0015 + Nn * 0.0005, Nn, prof, 'chrome', False))
        return b

    def window_seals(self, names):
        """Rubber seals just inside the windows' reveals."""
        b = K.Buf()
        prof = np.array([(-0.006, 0.0), (-0.005, 0.0035), (0.0, 0.005), (0.005, 0.0035), (0.006, 0.0)])
        for name in names:
            w = self.win[name]
            closed = name != 'rear'
            if closed:
                E = side_dir(w['P'], w['N'], np.tile(w['P'].mean(0), (len(w['P']), 1)), True)
                k = K.coarse_idx(np.vstack([w['P'], w['P'][:1]]), 0.001)
                k = k[k < len(w['P'])]
            else:
                cen = np.array([w['P'][:, 0].mean() + 0.1, 0.0, w['P'][:, 2].mean()])
                E = side_dir(w['P'], w['N'], np.tile(cen, (len(w['P']), 1)), False)
                k = K.coarse_idx(w['P'], 0.001)
            P, N, E = w['P'][k], w['N'][k], E[k]
            b.extend(trim_sweep(P + E * 0.007 - N * 0.009, N, prof, 'rubber', closed))
        return b

    def drip_rail(self):
        """The gutter along the roof's edge over the door (left half)."""
        z = D['cd_z1'] + 0.022
        xs = np.linspace(D['cd_x0'] - 0.03, float(S.flat_end_x(z)) - 0.01, 16)
        P, N = S.SIDE.to3d(np.stack([xs, np.full(len(xs), z)], 1))
        prof = np.array([(-0.004, 0.0), (-0.004, 0.007), (-0.001, 0.010), (0.004, 0.010), (0.006, 0.006), (0.006, 0.0)])
        V, Nn, Tr = K.sweep(P - N * 0.001, N, prof, closed=False)
        b = K.Buf().add(V, Nn, Tr, 'paint')
        for e in (0, -1):
            b.extend(K.fill_loop(V.reshape(len(P), -1, 3)[e], (np.sign(P[e, 0] - P[-1 - e, 0]), 0, 0), 'paint'))
        return b

    def band_beads(self, u0=-0.01, u1=U + 0.01):
        """A thin chrome bead along each edge of the band, between u0 and u1 (the door gets its own piece)."""
        b = K.Buf()
        for tt in (S.T_BAND0, S.T_BAND1):
            uu = np.linspace(u0, u1, max(3, int(abs(u1 - u0) / 0.06) + 1))
            P, N = S.CC.to3d(np.stack([uu, np.full(len(uu), tt)], 1))
            prof = np.array([(-0.0035, 0.0), (-0.0026, 0.0022), (0.0, 0.0030), (0.0026, 0.0022), (0.0035, 0.0)])
            V, Nn, Tr = K.sweep(P - N * 0.0004, N, prof, closed=False)
            b.add(V, Nn, Tr, 'chrome')
        return b

    def body_beads(self):
        """The band's beads on the body: from the front centre to the door, from the door to the back centre."""
        door = self.cut['door'].side('out')['uv']
        g = 0.003
        return self.band_beads(0.0, door[:, 0].min() - g).extend(self.band_beads(door[:, 0].max() + g, U))

    def door_beads(self):
        si = self.cut['door'].side('in')['uv']
        return self.band_beads(si[:, 0].min() + 0.003, si[:, 0].max() - 0.003)

    def mirror_point(self):
        """On the cab side under the quarter window, over the band (the mirror part's stalk stands off it)."""
        p, n = S.SIDE.to3d(np.array([[D['q_x0'] + 0.05, 1.40]]))
        return p[0]


# ============================================================================================ profiles
def prof_runs(pts, radii, seg=3, closed=True):
    """A 2D profile (counter-clockwise round the solid; corners `pts`, each with a round radius, 0 = sharp) as the
    smooth runs between its sharp corners: [(points, outward normals)]. Swept, the flats stay flat and the rounds
    round."""
    pts = np.asarray(pts, float)
    n = len(pts)
    radii = np.broadcast_to(np.asarray(radii, float), (n,))
    out = []
    for i in range(n):
        p1 = pts[i]
        if (not closed and i in (0, n - 1)) or radii[i] <= 0:
            out.append((p1, True))
            continue
        p0, p2 = pts[(i - 1) % n], pts[(i + 1) % n]
        d0 = K.unit(p0 - p1)
        d1 = K.unit(p2 - p1)
        ang = math.acos(float(np.clip(np.dot(d0, d1), -1, 1)))
        tl = min(radii[i] / math.tan(ang / 2), 0.49 * np.linalg.norm(p0 - p1), 0.49 * np.linalg.norm(p2 - p1))
        r = tl * math.tan(ang / 2)
        a, b = p1 + d0 * tl, p1 + d1 * tl
        c = p1 + K.unit(d0 + d1) * (r / math.sin(ang / 2))
        a0 = math.atan2(a[1] - c[1], a[0] - c[0])
        a1 = math.atan2(b[1] - c[1], b[0] - c[0])
        da = (a1 - a0 + PI) % (2 * PI) - PI
        for k in range(seg + 1):
            t = a0 + da * k / seg
            out.append((c + r * np.array([math.cos(t), math.sin(t)]), False))
    P = np.array([p for p, _ in out])
    sharp = np.array([s for _, s in out])
    idx = np.nonzero(sharp)[0]
    runs = []
    if closed:
        if not len(idx):
            idx = np.array([0])
        order = np.concatenate([np.arange(idx[0], len(P)), np.arange(0, idx[0] + 1)])
        Q = P[order]
        sh = sharp[order].copy()
        sh[0] = sh[-1] = True
        cut = np.nonzero(sh)[0]
    else:
        Q, cut = P, idx
    for a, b in zip(cut[:-1], cut[1:]):
        R = Q[a:b + 1]
        if len(R) < 2 or np.linalg.norm(R[-1] - R[0]) < 1e-9:
            continue
        Tn = np.empty_like(R)
        Tn[1:-1] = R[2:] - R[:-2]
        Tn[0] = R[1] - R[0]
        Tn[-1] = R[-1] - R[-2]
        Tn = K.unit(Tn)
        runs.append((R, np.stack([Tn[:, 1], -Tn[:, 0]], 1)))
    return runs


def sweep_runs(path, up, runs, mat, swap=False, closed=False):
    """Sweep every run of a profile (prof_runs) along a path; swap: the runs are (x, y) of a plan swept up z (the
    sweep's frame takes (y, x) there with up = +x)."""
    b = K.Buf()
    for R, Nr in runs:
        if swap:
            R, Nr = R[:, ::-1], Nr[:, ::-1]
        V, N, Tr = K.sweep(path, up, R, prof_n=Nr, closed=closed, closed_prof=False)
        b.add(V, N, Tr, mat)
    return b


def runs_outline(runs):
    """The closed outline of a closed profile's runs (each run's last point is the next one's first)."""
    return np.vstack([R[:-1] for R, _ in runs])


# ============================================================================================ the box
X_F = D['bx_f']          # the front wall's outer face (its corner posts' front)
X_R = D['bx_r'] + 0.02   # the rear frame's rear face
BW = D['bw']             # outer half width (posts, rails)
SKIN = 0.012             # how far the panels' skins stand in from the posts' and rails' faces
YS = BW - SKIN           # the side panels' skin
XS = X_F - SKIN          # the front wall's skin
Z0 = D['bz0']            # bottom of the bottom rail
Z1 = D['bz1']            # top of the top rail
ZR0 = 0.97               # top of the bottom rail (the panels start)
ZR1 = Z1 - 0.14          # bottom of the top rail (the panels end)
R_POST = 0.055           # the front corner posts' round
POST_F = 0.04            # the flats either side of the round
RP_X = 0.075             # the rear corner posts' depth
SILL_Z = (0.775, 0.955)  # the rear sill (its top level with the floor)
SILL_X = 0.12
HEAD_Z = ZR1 - 0.03      # the rear header's bottom
DOOR_IN = X_R - 0.004    # the rear doors' inner face (shut)
DOOR_T = 0.04            # their thickness
DOOR_Y = 0.835           # their outer edge (the corner posts show outboard of it, with the hinges)
DOOR_Z0, DOOR_Z1 = 0.925, ZR1
# the hinge pins (left; x, |y|): outboard of the side, so the doors swing 270 deg round and lie along the sides with
# their lock rods and handles clear of it
HINGE_P = (X_R - 0.040, BW + 0.065)
RIB_X = (0.30, -0.10, -0.50, -0.90, -1.30, -1.70, -2.10)
TAIL = (0.60, 0.89, 0.81, 0.94, 0.012)        # tail lamp recess in the rear sill: y0, y1, z0, z1, r


def hinge_z():
    return (DOOR_Z0 + 0.13, 1.50, 2.13, DOOR_Z1 - 0.13)


def flat(o, a, b_, n, outer, holes=(), step=0.12, mat='paint_b', lines=(), edge=0.0):
    """A flat region on the plane through o spanned by a, b (normal n, outward): outer / holes are 2D loops in
    (a, b) coordinates, interior points on a grid at `step` (the baked occlusion lives on the vertices).
    lines: rows of vertices (axis, value, lo, hi) as in mesh_region_split, put just clear of what stands on the skin
    (a rib, a strap): a vertex under one bakes black and would darken the skin all round it; edge: rows that far in
    from the outer loop's box, whose edges tuck under the rails and posts."""
    ch = K.FlatChart(o, a, b_, n)
    outer = np.asarray(outer, float)
    lo, hi = outer.min(0), outer.max(0)
    g = K.grid_points(lo[0], hi[0], lo[1], hi[1], step, dt=step)
    loops = [K.Loop(K.resample_keep(outer, step * 0.5))]
    hl = [K.Loop(np.asarray(h, float)) for h in holes]
    lines = list(lines)
    if edge > 0:
        lines += [(0, lo[0] + edge, lo[1], hi[1]), (0, hi[0] - edge, lo[1], hi[1]),
                  (1, lo[1] + edge, lo[0], hi[0]), (1, hi[1] - edge, lo[0], hi[0])]
    if not lines:
        V, N, Tr = K.mesh_region(ch, loops, hl, g, spacing=step)
        return K.Buf().add(V, N, Tr, mat)
    V, N, Tr, _ = K.mesh_region_split(ch, loops, hl, g, lines=lines, spacing=step, line_step=step * 0.5)
    return K.Buf().add(V, N, Tr, mat)


def rib_lines(axis, centres, lo, hi, half=0.0305):
    """Vertex rows either side of each rib's foot (a hat rib 6 cm across at the skin)."""
    return [(axis, c + s * half, lo, hi) for c in centres for s in (-1, 1)]


def rect2(x0, x1, y0, y1):
    return np.array([(x0, y0), (x1, y0), (x1, y1), (x0, y1)])


class Box:
    """The aluminium van body (left half unless said otherwise)."""

    def __init__(self):
        self.tail = rr(TAIL[0], TAIL[1], TAIL[2], TAIL[3], TAIL[4], step=0.03, arc=0.006)

    # ------------------------------------------------------------------ the shell
    def plan_path(self, rear):
        """The box's outline in plan (left half): from the front centre round the front corner and back along the
        side to x = rear, on the outer faces."""
        cx, cy = X_F - R_POST, BW - R_POST
        pts = [(X_F, 0.0), (X_F, 0.45), (X_F, cy)]
        for a in np.linspace(0.0, PI / 2, 9)[1:-1]:
            pts.append((cx + R_POST * math.cos(a), cy + R_POST * math.sin(a)))
        pts.append((cx, BW))
        xs = np.linspace(cx, rear, max(2, int((cx - rear) / 0.35) + 1))[1:]
        pts += [(x, BW) for x in xs]
        return np.array(pts)

    def rail(self, runs, z, rear, mat='alu'):
        """A rail swept along the plan outline at height z (the profile is (outward, up) about the outline),
        closed at its rear end."""
        P2 = self.plan_path(rear)
        path = np.stack([P2[:, 0], P2[:, 1], np.full(len(P2), z)], 1)
        b = sweep_runs(path, (0, 0, 1), runs, mat)
        Q = runs_outline(runs)
        b.extend(K.fill_loop(np.stack([np.full(len(Q), rear), BW + Q[:, 0], z + Q[:, 1]], 1), (-1, 0, 0), mat))
        return b

    def rails(self):
        b = K.Buf()
        # bottom rail: a deep extrusion, its face 15 cm, a lip at the top where the panel sits in
        h = ZR0 - Z0
        b.extend(self.rail(prof_runs([(-0.06, 0.0), (0.0, 0.0), (0.0, h - 0.012), (-0.012, h), (-0.06, h)], [0, 0.004, 0.003, 0.002, 0]),
                           Z0, X_R + SILL_X))
        # top rail: from the panels' top up the face and over a round onto the roof's edge
        h = Z1 - ZR1
        b.extend(self.rail(prof_runs([(-0.06, 0.0), (-0.012, 0.0), (0.0, 0.012), (0.0, h), (-0.10, h), (-0.10, h - 0.02)],
                                     [0, 0.002, 0.003, 0.04, 0, 0]), ZR1, X_R + 0.10))
        return b

    def posts(self):
        """The front corner posts (a round extrusion between the rails: its flats step in to the panels' skins) and
        the rear corner posts."""
        b = K.Buf()
        cx, cy = X_F - R_POST, BW - R_POST
        ya, xb = cy - POST_F, cx - POST_F
        runs = prof_runs([(XS, ya), (X_F, ya), (X_F, BW), (xb, BW), (xb, YS)], [0, 0.003, R_POST, 0.003, 0], seg=8, closed=False)
        path = np.array([(0.0, 0.0, ZR0 - 0.006), (0.0, 0.0, ZR1 + 0.006)])
        b.extend(sweep_runs(path, (1, 0, 0), runs, 'alu', swap=True))
        # the rear corner posts: an aluminium section behind the side panels' ends, the hinges on it
        b.extend(K.box_buf((X_R, DOOR_Y - 0.03, SILL_Z[1]), (X_R + RP_X, BW, HEAD_Z), 'alu', 0.006, 2))
        return b

    def side(self):
        """The side panel between the posts and the rails (its skin), with its ribs."""
        b = K.Buf()
        x0, x1 = X_R + RP_X - 0.005, X_F - R_POST - POST_F + 0.005
        z0, z1 = ZR0 - 0.008, ZR1 + 0.008
        b.extend(flat(np.array([0.0, YS, 0.0]), (1, 0, 0), (0, 0, 1), (0, 1, 0), rect2(x0, x1, z0, z1), step=0.14,
                      lines=rib_lines(0, RIB_X, z0, z1), edge=0.026))
        # hat-section ribs standing 11 mm out (swept up z with up = +y: the profile's first coordinate runs along
        # -x, its second out from the skin)
        runs = prof_runs([(0.030, 0.0), (0.020, 0.011), (-0.020, 0.011), (-0.030, 0.0)], [0, 0.003, 0.003, 0], closed=False)
        for x in RIB_X:
            path = np.array([(x, YS, ZR0 - 0.004), (x, YS, ZR1 + 0.004)])
            b.extend(sweep_runs(path, (0, 1, 0), runs, 'paint_b'))
        return b

    def front_wall(self):
        """The front wall (left half) between the corner posts and the rails, with two horizontal ribs over the cab,
        and amber clearance lamps at its top corners."""
        b = K.Buf()
        y1 = BW - R_POST - POST_F + 0.005
        z0, z1 = ZR0 - 0.008, ZR1 + 0.008
        b.extend(flat(np.array([XS, 0.0, 0.0]), (0, 1, 0), (0, 0, 1), (1, 0, 0), rect2(0.0, y1, z0, z1), step=0.14,
                      lines=rib_lines(1, (ZR1 - 0.31, ZR1 - 0.15), 0.0, y1) + [(0, y1 - 0.026, z0, z1), (1, z0 + 0.026, 0.0, y1), (1, z1 - 0.026, 0.0, y1)]))
        runs = prof_runs([(0.030, 0.0), (0.020, 0.011), (-0.020, 0.011), (-0.030, 0.0)], [0, 0.003, 0.003, 0], closed=False)
        for z in (ZR1 - 0.31, ZR1 - 0.15):
            path = np.array([(XS, 0.0, z), (XS, y1 - 0.002, z)])
            b.extend(sweep_runs(path, (1, 0, 0), runs, 'paint_b'))
        b.extend(K.box_buf((X_F - 0.004, 0.70, Z1 - 0.085), (X_F + 0.012, 0.84, Z1 - 0.045), 'trim', 0.006, 2))
        b.extend(K.box_buf((X_F + 0.008, 0.71, Z1 - 0.080), (X_F + 0.030, 0.83, Z1 - 0.050), 'lens_amber', 0.008, 2))
        return b

    def roof(self):
        """The roof panel (left half) inside the top rail, a hair under its top."""
        return flat(np.array([0.0, 0.0, Z1 - 0.006]), (1, 0, 0), (0, 1, 0), (0, 0, 1), rect2(X_R + 0.06, X_F - 0.06, 0.0, BW - 0.08), step=0.22)

    def rear_frame(self):
        """The rear portal (left half): the header with the clearance lamps, the sill with the tail lamp's recess
        and a kick plate on its top (the posts are the corner posts)."""
        b = K.Buf()
        b.extend(K.box_buf((X_R, 0.0, HEAD_Z), (X_R + 0.10, BW, Z1 - 0.004), 'alu', 0.008, 2))
        for (y0, y1) in ((0.0, 0.05), (0.66, 0.78)):
            b.extend(K.box_buf((X_R - 0.012, y0, Z1 - 0.085), (X_R + 0.002, y1, Z1 - 0.045), 'trim', 0.004, 2))
            b.extend(K.box_buf((X_R - 0.026, y0 + (0.006 if y0 > 0 else 0.0), Z1 - 0.080), (X_R - 0.010, y1 - 0.006, Z1 - 0.050), 'lens_tail', 0.006, 2))
        z0, z1 = SILL_Z
        b.extend(flat(np.array([X_R, 0.0, 0.0]), (0, 1, 0), (0, 0, 1), (-1, 0, 0), rect2(0.0, BW, z0, z1), holes=[self.tail], step=0.06, mat='steel'))
        b.extend(K.box_buf((X_R, 0.0, z0), (X_R + SILL_X, BW, z0 + 0.004), 'steel', 0.0, 1))
        b.extend(K.box_buf((X_R, 0.0, z1 - 0.004), (X_R + SILL_X, BW, z1), 'alu', 0.0, 1))
        b.extend(K.box_buf((X_R + SILL_X - 0.004, 0.0, z0), (X_R + SILL_X, BW, z1), 'steel', 0.0, 1))
        b.extend(K.box_buf((X_R, BW - 0.004, z0), (X_R + SILL_X, BW, z1), 'steel', 0.0, 1))
        for k in range(8):
            y = 0.055 + 0.10 * k
            b.extend(K.box_buf((X_R + 0.012, y - 0.035, z1), (X_R + SILL_X - 0.012, y + 0.035, z1 + 0.003), 'alu', 0.0, 1))
        # the tail lamp's recess: a flange 4.5 cm in, a dark back
        P3 = np.stack([np.full(len(self.tail), X_R), self.tail[:, 0], self.tail[:, 1]], 1)
        Nn = np.tile((-1.0, 0.0, 0.0), (len(P3), 1))
        E = side_dir(P3, Nn, np.tile(P3.mean(0), (len(P3), 1)), True)
        V, N, Tr = K.roll_edge(P3, Nn, E, 0.003, 0.045, 0.0, 2, closed=True, flange_dir=(1, 0, 0))
        b.add(V, N, Tr, 'steel')
        ring = V.reshape(-1, len(P3), 3)[-1]
        b.extend(K.fill_loop(ring, (-1, 0, 0), 'trim'))
        c = P3.mean(0)
        self.tail_mount = (np.array([X_R, c[1], c[2]]), np.array([-1.0, 0.0, 0.0]))
        return b

    def markers(self):
        """Amber side markers on the bottom rail."""
        b = K.Buf()
        for x in (0.30, -0.80, -2.05):
            b.extend(K.box_buf((x - 0.045, BW - 0.002, 0.875), (x + 0.045, BW + 0.008, 0.915), 'trim', 0.004, 1))
            b.extend(K.box_buf((x - 0.040, BW + 0.006, 0.879), (x + 0.040, BW + 0.016, 0.911), 'lens_amber', 0.004, 1))
        return b

    def hinges(self):
        """The rear doors' hinges on the corner posts (left half, body): a cast leaf on the post's rear face, its arm
        out to the knuckle on the pin, outboard of the side."""
        b = K.Buf()
        hx, hy = HINGE_P
        for zz in hinge_z():
            b.extend(K.cyl_buf((hx, hy, zz - 0.045), (hx, hy, zz + 0.045), 0.013, 'steel', 10))
            b.extend(K.box_buf((X_R - 0.006, DOOR_Y + 0.004, zz - 0.04), (X_R + 0.03, BW + 0.004, zz + 0.04), 'steel', 0.004, 1))
            b.extend(K.box_buf((hx - 0.008, BW - 0.03, zz - 0.022), (hx + 0.010, hy, zz + 0.022), 'steel', 0.004, 1))
        return b

    def door_seal(self):
        """The rubber seal on the rear frame round the opening, where the doors close on it (left half)."""
        L2 = np.array([(0.0, DOOR_Z0 + 0.03), (DOOR_Y - 0.03, DOOR_Z0 + 0.03), (DOOR_Y - 0.03, DOOR_Z1 - 0.03), (0.0, DOOR_Z1 - 0.03)])
        P = np.stack([np.full(len(L2), X_R - 0.005), L2[:, 0], L2[:, 1]], 1)
        return K.tube_buf(P, 0.007, 'rubber', 6)

    def shell(self):
        """Everything of the box's outside that is alike on both sides (left half)."""
        b = K.Buf()
        b.extend(self.rails()).extend(self.posts()).extend(self.side()).extend(self.front_wall()).extend(self.roof())
        b.extend(self.rear_frame()).extend(self.markers()).extend(self.hinges()).extend(self.door_seal())
        return b

    # ------------------------------------------------------------------ the rear doors
    def leaf(self, main=False):
        """One rear door leaf, the left one (y >= 0; the right one is its mirror): a flat skin in an aluminium frame,
        two lock rods with their keepers, cams and a handle each, the hinge straps, the inner face. main: the right
        leaf's cover strip over the meeting edges (built here in left coordinates, at the centre line)."""
        b = K.Buf()
        y0, y1 = 0.004, DOOR_Y
        z0, z1 = DOOR_Z0, DOOR_Z1
        xo = DOOR_IN - DOOR_T            # the outer face
        fw = 0.045                       # the frame's width
        sy0, sy1, sz0, sz1 = y0 + fw - 0.01, y1 - fw + 0.01, z0 + fw - 0.01, z1 - fw + 0.01
        lines = rib_lines(0, (0.20, 0.62), sz0, sz1, 0.027) + rib_lines(1, hinge_z(), sy0, sy1, 0.037)
        b.extend(flat(np.array([xo + 0.006, 0.0, 0.0]), (0, 1, 0), (0, 0, 1), (-1, 0, 0), rect2(sy0, sy1, sz0, sz1),
                      step=0.14, mat='paint_b', lines=lines, edge=0.02))
        # the frame: four aluminium extrusions round the edge, the skin set 6 mm into them
        for (a0, a1, c0, c1) in ((y0, y1, z0, z0 + fw), (y0, y1, z1 - fw, z1), (y0, y0 + fw, z0 + fw - 0.002, z1 - fw + 0.002),
                                 (y1 - fw, y1, z0 + fw - 0.002, z1 - fw + 0.002)):
            b.extend(K.box_buf((xo, a0, c0), (DOOR_IN, a1, c1), 'alu', 0.006, 2))
        # the inner face: a lining 4 cm in, facing the box
        b.extend(flat(np.array([DOOR_IN, 0.0, 0.0]), (0, 1, 0), (0, 0, 1), (1, 0, 0), rect2(y0 + 0.01, y1 - 0.01, z0 + 0.01, z1 - 0.01),
                      step=0.18, mat='alu'))
        # lock rods: two a leaf, keepers on the door, cams into the keepers on the sill and the header, a handle
        xr_ = xo - 0.020
        for yr in (0.20, 0.62):
            b.extend(K.cyl_buf((xr_, yr, z0 - 0.025), (xr_, yr, z1 + 0.025), 0.0105, 'chrome', 10))
            for zz in (z0 + 0.10, 1.32, 1.95, z1 - 0.10):
                b.extend(K.box_buf((xr_ - 0.008, yr - 0.024, zz - 0.012), (xo + 0.001, yr + 0.024, zz + 0.012), 'steel', 0.003, 1))
            b.extend(K.box_buf((xr_ - 0.014, yr - 0.020, z0 - 0.047), (xr_ + 0.014, yr + 0.020, z0 - 0.025), 'steel', 0.003, 1))
            b.extend(K.box_buf((xr_ - 0.014, yr - 0.020, z1 + 0.025), (xr_ + 0.014, yr + 0.020, z1 + 0.047), 'steel', 0.003, 1))
            # the handle: a flat bar from the rod, folded down along the door into its catch
            hz = 1.56
            b.extend(K.box_buf((xr_ - 0.013, yr - 0.016, hz - 0.03), (xr_ + 0.013, yr + 0.016, hz + 0.03), 'chrome', 0.004, 2))
            b.extend(K.box_buf((xr_ - 0.026, yr - 0.012, hz - 0.30), (xr_ - 0.012, yr + 0.012, hz), 'chrome', 0.004, 2))
            b.extend(K.box_buf((xr_ - 0.024, yr - 0.02, hz - 0.34), (xo + 0.001, yr + 0.02, hz - 0.29), 'steel', 0.003, 1))
        # the hinge straps across the door's outer edge, and their arms out to the pins (the knuckles: hinges())
        hx, hy = HINGE_P
        for zz in hinge_z():
            b.extend(K.box_buf((xo - 0.010, y1 - 0.24, zz - 0.035), (xo + 0.001, y1 + 0.004, zz + 0.035), 'steel', 0.004, 2))
            b.extend(K.box_buf((xo - 0.012, y1 - 0.004, zz - 0.060), (hx + 0.010, hy - 0.010, zz - 0.046), 'steel', 0.003, 1))
        if main:
            b.extend(K.box_buf((xo - 0.012, -0.040, z0 + 0.03), (xo + 0.001, 0.010, z1 - 0.03), 'alu', 0.004, 2))
        return b
