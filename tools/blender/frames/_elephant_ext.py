"""Old Elephant exterior (frames/elephant.py; the Turtle's and the Loaf's way, frames/_van_ext.py): the left half,
mirrored by frames/_elephant_build.py. The one shell V on its loft chart CV: the body region with the two arch
notches, the windscreen notch at the front centre, the engine lid and the rear window notches at the rear centre
(no tailgate: the window over the bed is the body's own), holes for the cab door, the fixed windows (the dinette's and
the galley's on the left, the sofa's on the right, the bedroom's both sides), the head and tail lamps (and on the left
the fuel flap, on the right the entry door: the right side is built in left coordinates and mirrored), split at the
waist into the paint below and the second paint above; the roof's middle; the panel skins; the glass; the rolled
edges, flanges and hems; the trims and the small things on the nose and the tail; the inside of the shell (the
lining, at WALL)."""
import math
import sys

sys.dont_write_bytecode = True

import numpy as np  # noqa: E402

from frames import _kit as K  # noqa: E402
from frames import elephant as S  # noqa: E402
from frames._sedan_build import badge_buf, plate_buf  # noqa: E402,F401
from frames._sedan_ext import Path, side_dir  # noqa: E402

D = S.D
PI = math.pi
DELTA = S.DELTA
ER = S.ER
U = S.U_END
T = S.V_T
ZMAT = {0: 'paint', 1: 'paint_b'}
WALL = -0.03          # the lining inside the shell
# the entry door's leaf goes on down to the stairwell inside it, as Nomad Drive's class A has one (frames/_steps.py;
# core/modcar/aboard.ts BoardDoor.well: one tread at the door, 0.25 m deep, 0.207 under the floor), and the opening's
# edges from the door's foot down
WELL = dict(tops=(0.413,), depth=0.25)
WELL_X = (D['sd_x0'] - DELTA, D['sd_x1'] + DELTA)


def notch_uv():
    """The entry door's opening on down to its stairwell, on the loft: (u0, u1, t over the door's foot)."""
    xa, xb = WELL_X
    u0, u1 = float(S.u_of_x(xb)), float(S.u_of_x(xa))
    return u0, u1, float(S.t_of_z(0.5 * (u0 + u1), D['sd_z0'] + 0.01)[0])


def notch_lines(side):
    if side != 'R':
        return []
    u0, u1, t1 = notch_uv()
    return [(0, u0, T[0] - 0.05, t1 + 0.01), (0, u1, T[0] - 0.05, t1 + 0.01)]


def notch_zone(side, cen, z):
    """Zone 9 (left out) for the wall under the entry door's opening (side 'R')."""
    if side != 'R':
        return z
    u0, u1, t1 = notch_uv()
    return np.where((cen[:, 0] > u0) & (cen[:, 0] < u1) & (cen[:, 1] < t1), 9, z)


def zone_waist(cen):
    return np.where(cen[:, 1] > S.T_WAIST, 1, 0)


def two_tone(buf, z=None):
    """The paint of a buffer's 'paint' triangles above the waist (by their centroids) turned to paint_b: the
    flanges and reveals of the openings take the colour of the skin they turn in from."""
    z = D['waist_z'] if z is None else z
    V, N, Tr, M = buf.arrays()
    if not len(Tr):
        return buf
    cz = V[Tr].mean(axis=1)[:, 2]
    buf.M = ['paint_b' if (m == 'paint' and c > z) else m for m, c in zip(M, cz)]
    return buf


def lines_waist():
    return [(1, S.T_WAIST, -0.1, U + 0.1)]


def rr(x0, x1, z0, z1, r, rb=None, step=0.07, arc=0.009):
    """Counter-clockwise rounded rectangle in a chart's plane coordinates (optional other bottom radius)."""
    rb = r if rb is None else rb
    return K.rounded_poly(np.array([(x0, z0), (x1, z0), (x1, z1), (x0, z1)]), [rb, rb, r, r], step, arc_step=arc)


def to_ccw(uv):
    return K.ccw(np.asarray(uv, float))


class Cut:
    """A cut line in the loft chart and its two offset boundaries ('in' = the panel side, 'out' = the body side)."""

    def __init__(self, uv, closed, inner_sign, centre_u=None):
        self.chart = S.CV
        self.uv = np.asarray(uv, float)
        self.closed = closed
        self.P, self.N = S.CV.to3d(self.uv)
        self.sides = {}
        for name, sgn in (('in', inner_sign), ('out', -inner_sign)):
            uvo = K.offset_loop2(self.uv, sgn * DELTA, closed)
            if centre_u is not None:
                uvo[0, 0] = centre_u
                uvo[-1, 0] = centre_u
            P, N = S.CV.to3d(uvo)
            E = side_dir(P, N, self.P, closed)
            self.sides[name] = dict(uv=uvo, P=P, N=N, E=E)

    def side(self, name):
        return self.sides[name]


def densify(uv, step=0.03, closed=True):
    return K.resample_keep(np.asarray(uv, float), step, closed)


def coarse_loop(uv, step, tol=0.003):
    """A closed loop thinned to within tol of itself (its corners kept, so halves still meet on the centre line),
    long runs then cut to at most step."""
    uv = np.asarray(uv, float)
    P = np.vstack([uv, uv[:1]])
    Q = P[K.coarse_idx(P, tol)]
    if np.linalg.norm(Q[-1] - Q[0]) < 1e-9:
        Q = Q[:-1]
    return K.resample_keep(Q, step, closed=True)


# ============================================================================================ the exterior
class Exterior:
    def __init__(self):
        self.us = S.v_u_samples()
        self.ts = S.v_t_samples()
        self.cut = {}
        self.win = {}
        self._arches()
        self._side_cuts()
        self._rear_cuts()
        self._front_cuts()

    # ------------------------------------------------------------------ cuts
    def _arches(self):
        self.arch = {}
        for key, xa in (('F', D['ax_f']), ('R', D['ax_r'])):
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
            P, N = S.CV.to3d(nt)
            self.arch[key] = dict(uv=nt, P=P, N=N)

    def _side_cuts(self):
        d = D
        # cab door (both sides) and its window
        loop = rr(d['cd_x0'], d['cd_x1'], d['cd_z0'], d['cd_z1'], d['cd_r'])
        self.cut['door'] = Cut(to_ccw(S.side_uv(loop)), True, +1.0)
        x0, x1, z0, z1, r = d['cd_win']
        self.win['door'] = self._side_win(rr(x0, x1, z0, z1, r))
        # the quarter window ahead of the door: its front edge 65 deg round the nose's corner roll (the pillar
        # between it and the windscreen is a narrow strip of the corner)
        zq = np.linspace(d['q_z1'], d['q_z0'], 7)
        front = np.stack([S.flat_end_x(zq) + 0.08, zq], 1)
        poly = np.vstack([[(d['q_x0'], d['q_z0']), (d['q_x0'], d['q_z1'])], front])
        radii = np.zeros(len(poly))
        radii[0], radii[1], radii[2], radii[-1] = 0.035, 0.035, 0.03, 0.03
        q = K.rounded_poly(K.ccw(poly), radii if K.loop_area(poly) > 0 else radii[::-1], 0.03, arc_step=0.008)
        P, N = S.SIDE.to3d(q)
        uv = S.CV.to2d(P)
        self.win['quarter'] = dict(uv=uv, P=P, N=N)
        for name in ('mid', 'gal', 'rear', 'mid_r'):
            x0, x1, z0, z1, r = d['win_' + name]
            self.win[name] = self._side_win(rr(x0, x1, z0, z1, r))
        # the entry door (right side, built in left coordinates) and its window
        loop = rr(d['sd_x0'], d['sd_x1'], d['sd_z0'], d['sd_z1'], d['sd_r'], rb=0.006)
        self.cut['side'] = Cut(to_ccw(S.side_uv(loop)), True, +1.0)
        x0, x1, z0, z1, r = d['sd_win']
        self.win['side'] = self._side_win(rr(x0, x1, z0, z1, r))
        # fuel flap (left)
        fx, fz, fr = d['fuel']
        self.cut['fuel'] = Cut(to_ccw(S.side_uv(K.circle_loop(fx, fz, fr, 0.008))), True, +1.0)

    @staticmethod
    def _side_win(loop_xz):
        uv = to_ccw(S.side_uv(densify(loop_xz, 0.07)))
        P, N = S.CV.to3d(uv)
        return dict(uv=uv, P=P, N=N, xz=loop_xz)

    def _rear_cuts(self):
        d = D
        # the engine lid: a notch at the rear centre (left half, top centre -> round -> bottom centre)
        for key, hw, z0, z1, r in (('lid', d['lid_hw'], d['lid_z0'], d['lid_z1'], d['lid_r']),):
            pts = np.array([(0.0, z1), (hw, z1), (hw, z0), (0.0, z0)])
            yz = K.rounded_poly(pts, [0, r, r, 0], 0.03, closed=False, arc_step=0.008)
            uv = S.rear_uv(yz)
            uv[0, 0] = uv[-1, 0] = U
            self.cut[key] = Cut(uv, False, +1.0, centre_u=U)
            self.cut[key].yz = yz
        # the rear window over the bed (a notch at the centre line, in the body itself)
        pts = np.array([(0.0, d['tw_z1']), (d['tw_hw'], d['tw_z1']), (d['tw_hw'], d['tw_z0']), (0.0, d['tw_z0'])])
        yz = K.rounded_poly(pts, [0, d['tw_r'], d['tw_r'], 0], 0.03, closed=False, arc_step=0.008)
        uv = S.rear_uv(yz)
        uv[0, 0] = uv[-1, 0] = U
        P, N = S.CV.to3d(uv)
        self.win['tail'] = dict(uv=uv, P=P, N=N, yz=yz)
        # upright tail lamp recesses
        y0, y1 = d['tail_y'] - d['tail_w'] / 2, d['tail_y'] + d['tail_w'] / 2
        z0, z1 = d['tail_z'] - d['tail_h'] / 2, d['tail_z'] + d['tail_h'] / 2
        yz = rr(y0, y1, z0, z1, 0.022, step=0.025, arc=0.006)
        uv = to_ccw(S.rear_uv(yz))
        P, N = S.CV.to3d(uv)
        self.open_tail = dict(uv=uv, P=P, N=N, yz=yz)

    def _front_cuts(self):
        d = D
        # the windscreen: a notch at the front centre (left half), its corners wrapping into the nose's corners
        hw, z0, z1, r = d['ws_hw'], d['ws_foot'], d['ws_head'], d['ws_r']
        pts = np.array([(0.0, z1), (hw, z1), (hw, z0), (0.0, z0)])
        yz = K.rounded_poly(pts, [0, r, 0.05, 0], 0.03, closed=False, arc_step=0.008)
        P, N = S.FRONT.to3d(yz)
        uv = S.CV.to2d(P)
        uv[0, 0] = uv[-1, 0] = 0.0
        P, N = S.CV.to3d(uv)
        self.win['ws'] = dict(uv=uv, P=P, N=N, yz=yz)
        # the round head lamps
        c = K.circle_loop(d['lamp_y'], d['lamp_z'], d['lamp_d'] / 2, 0.012)
        uv = to_ccw(S.front_uv(c))
        P, N = S.CV.to3d(uv)
        self.open_lamp = dict(uv=uv, P=P, N=N, yz=c)

    # ------------------------------------------------------------------ the body region
    def body_loop(self, coarse=False):
        """Outer loop of the body region on the loft (left half). coarse: no fixed points (the lining)."""
        us, ts = self.us, self.ts
        p = Path()
        cur = -1.0
        for key in ('F', 'R'):
            nt = self.arch[key]
            seg = us[(us > cur) & (us < nt['uv'][0, 0] - 1e-4)]
            p.add(np.stack([seg, np.full(len(seg), T[0])], 1))
            p.add(nt['uv'], nt['P'], nt['N'])
            cur = nt['uv'][-1, 0] + 1e-4
        seg = us[(us > cur) & (us < U - 1e-6)]
        p.add(np.stack([np.concatenate([seg, [U]]), np.full(len(seg) + 1, T[0])], 1))
        # rear centre line up, round the engine lid (its outer boundary, bottom end first) and the rear window
        lo = self.cut['lid'].side('out')
        tg = self.win['tail']
        tt = ts[(ts > T[0] + 1e-4) & (ts < lo['uv'][-1, 1] - 0.004)]
        p.add(np.stack([np.full(len(tt), U), tt], 1))
        p.add(lo['uv'][::-1], lo['P'][::-1], lo['N'][::-1])
        tt = ts[(ts > lo['uv'][0, 1] + 0.004) & (ts < tg['uv'][-1, 1] - 0.004)]
        p.add(np.stack([np.full(len(tt), U), tt], 1))
        p.add(tg['uv'][::-1], tg['P'][::-1], tg['N'][::-1])
        tt = ts[(ts > tg['uv'][0, 1] + 0.004) & (ts < T[-1] - 1e-6)]
        p.add(np.stack([np.full(len(tt) + 1, U), np.concatenate([tt, [T[-1]]])], 1))
        # top row forwards
        uu = us[(us > 1e-6) & (us < U - 1e-6)][::-1]
        p.add(np.stack([np.concatenate([uu, [0.0]]), np.full(len(uu) + 1, T[-1])], 1))
        # front centre line down, round the windscreen (its outline runs top -> bottom)
        ws = self.win['ws']
        tt = ts[(ts > ws['uv'][0, 1] + 0.004) & (ts < T[-1] - 1e-6)][::-1]
        p.add(np.stack([np.zeros(len(tt)), tt], 1))
        p.add(ws['uv'], ws['P'], ws['N'])
        tt = ts[(ts > T[0] + 1e-6) & (ts < ws['uv'][-1, 1] - 0.004)][::-1]
        p.add(np.stack([np.zeros(len(tt)), tt], 1))
        loop = p.loop()
        if coarse:
            return K.Loop(coarse_loop(loop.uv, 0.08))
        return loop

    def body_holes(self, side, coarse=False):
        def L(d_):
            return K.Loop(d_['uv']) if coarse else K.Loop(d_['uv'], d_['P'], d_['N'])
        holes = [L(self.open_lamp), L(self.open_tail), L(self.cut['door'].side('out')), L(self.win['quarter']), L(self.win['rear'])]
        if side == 'L':
            holes += [L(self.win['mid']), L(self.win['gal'])]
            if not coarse:                  # the lining closes over the filler's pocket
                holes += [L(self.cut['fuel'].side('out'))]
        else:
            holes += [L(self.cut['side'].side('out')), L(self.win['mid_r'])]
        return holes

    def body(self, side):
        """The outer skin (left half; side 'R' is the right half built in left coordinates)."""
        loop = self.body_loop()
        holes = self.body_holes(side)
        pts, sp = S.grid_from(self.us, self.ts)
        V, N, Tr, Z = K.mesh_region_split(S.CV, [loop], holes, pts, lines=lines_waist() + notch_lines(side),
                                          zone_fn=lambda c: notch_zone(side, c, zone_waist(c)), spacing=sp, line_step=0.05)
        return K.split_mat(K.add_zones(K.Buf(), V, N, Tr, Z, {**ZMAT, 9: 'DROP'}), ('DROP',))[0]

    def roof(self, level=0.0):
        """The middle of the roof (left half), on the height-field chart, bounded by the loft's top row."""
        if level == 0:
            row = np.stack([self.us, np.full(len(self.us), T[-1])], 1)
        else:
            # the lining's middle takes the very points the lining's top row has, so the two meet edge to edge
            lp = self.body_loop(coarse=True).uv
            row = lp[np.abs(lp[:, 1] - T[-1]) < 1e-9]
            row = row[np.argsort(row[:, 0])]
        Pr, Nr = S.CV.to3d(row, level if level else None)
        a, b = Pr[-1], Pr[0]
        xs = np.linspace(a[0], b[0], max(3, int(abs(b[0] - a[0]) / 0.06)))[1:-1]
        Pc, Nc = S.CT.to3d(np.stack([xs, np.zeros(len(xs))], 1), level if level else None)
        P = np.vstack([Pr, Pc])
        Nn = np.vstack([Nr, Nc])
        sp = 0.14 if level == 0 else 0.24
        xg, yg = np.meshgrid(np.arange(D['xr'] - 0.1, D['xf'] + 0.1, sp), np.arange(0.0, D['hw'], sp), indexing='ij')
        g = np.stack([xg.ravel(), yg.ravel()], 1)
        if level == 0:
            V, N, Tr = K.mesh_region(S.CT, [K.Loop(P[:, :2], P, Nn)], [], g, spacing=sp)
            return K.Buf().add(V, N, Tr, 'paint_b')
        V, N, Tr = K.mesh_region(S.CT, [K.Loop(P[:, :2])], [], g, spacing=sp, level=level)
        # (the headliner: the room's lining, a warm dark grey over the walls' cream as Nomad Drive's - carMaterials.ts)
        return K.Buf().add(V, -N, Tr, 'lining')

    def lining(self, side):
        """The inside of the shell, WALL in, facing in: plastic in the cab, wood panels below the windows in the room,
        painted metal round the engine bay, the headliner over the roof roll (left half; 'R' in left coordinates)."""
        from frames import _elephant_inner as IN
        loop = self.body_loop(coarse=True)
        holes = [K.Loop(K.resample(h.uv, 0.06, closed=True)) for h in self.body_holes(side, coarse=True)]
        us = S.v_u_samples(0.20, 0.12, 0.06)
        ts = S.v_t_samples(0.20, 6)
        pts, sp = S.grid_from(us, ts)
        u_cab = float(S.u_of_x(IN.ROOM_FRONT_X))
        u_fw = float(S.u_of_x(IN.FIREWALL_X))
        t_pan = float(S.t_of_z(2.0, 1.64)[0])
        t_deck = float(S.t_of_z(2.0, IN.DECK_Z)[0])
        t_roll = float(T[5])
        lines = [(0, u_cab, T[0], t_pan), (0, u_fw, T[0], t_roll), (1, t_pan, u_cab, u_fw), (1, t_deck, u_fw, U + 0.1), (1, t_roll, -0.1, U + 0.1)]

        def zf(c):
            u, t = c[:, 0], c[:, 1]
            z = np.zeros(len(u), np.int64)                     # 0 the cab: plastic
            room = (u > u_cab) & (u < u_fw)
            z[room] = 3                                        # 3 the room's upper walls: their lining (camel)
            z[room & (t < t_pan)] = 1                          # 1 wood panels below the windows
            z[u > u_fw] = 3                                    # (round the tailgate inside)
            z[(u > u_fw) & (t < t_deck)] = 2                   # 2 the engine bay: painted
            z[t > t_roll] = 3                                  # the headliner
            return z
        V, N, Tr, Z = K.mesh_region_split(S.CV, [loop], holes, pts, lines=lines + notch_lines(side), zone_fn=lambda c: notch_zone(side, c, zf(c)),
                                          spacing=sp, level=WALL, line_step=0.12)
        return K.split_mat(K.add_zones(K.Buf(), V, N, Tr, Z, {0: 'plastic_int', 1: 'wood', 2: 'paint', 3: 'lining', 9: 'DROP'}, flip=True), ('DROP',))[0]

    # ------------------------------------------------------------------ panel skins
    def door_skin(self, key):
        """Cab door ('door') or sliding door ('side') skin round its window, split at the waist (left coordinates)."""
        s = self.cut[key].side('in')
        w = self.win['door' if key == 'door' else 'side']
        us = S.v_u_samples(0.05, 0.05, 0.05)
        pts, sp = S.grid_from(us, self.ts)
        V, N, Tr, Z = K.mesh_region_split(S.CV, [K.Loop(s['uv'], s['P'], s['N'])], [K.Loop(w['uv'], w['P'], w['N'])], pts,
                                          lines=lines_waist(), zone_fn=zone_waist, spacing=sp, line_step=0.05)
        return K.add_zones(K.Buf(), V, N, Tr, Z, ZMAT)

    def rear_panel_loop(self, key):
        """The tailgate's or the engine lid's skin outline (left half): its inner boundary, then the centre line (round
        the tail window's notch on the tailgate)."""
        s = self.cut[key].side('in')
        p = Path()
        p.add(s['uv'], s['P'], s['N'])
        t_top, t_bot = s['uv'][0, 1], s['uv'][-1, 1]
        tt = np.linspace(t_bot, t_top, max(3, int((t_top - t_bot) / 0.04)))[1:-1]
        if key == 'tg':
            w = self.win['tail']
            a, b = w['uv'][-1, 1], w['uv'][0, 1]
            lo = tt[tt < a - 0.004]
            hi = tt[tt > b + 0.004]
            p.add(np.stack([np.full(len(lo), U), lo], 1))
            p.add(w['uv'][::-1], w['P'][::-1], w['N'][::-1])
            p.add(np.stack([np.full(len(hi), U), hi], 1))
        else:
            p.add(np.stack([np.full(len(tt), U), tt], 1))
        return p.loop()

    def rear_panel(self, key):
        loop = self.rear_panel_loop(key)
        us = S.v_u_samples(0.06, 0.05, 0.03)
        pts, sp = S.grid_from(us, self.ts)
        if key == 'lid':
            V, N, Tr = K.mesh_region(S.CV, [loop], [], pts, spacing=sp)
            return K.Buf().add(V, N, Tr, 'paint')
        V, N, Tr, Z = K.mesh_region_split(S.CV, [loop], [], pts, lines=lines_waist(), zone_fn=zone_waist, spacing=sp, line_step=0.05)
        return K.add_zones(K.Buf(), V, N, Tr, Z, ZMAT)

    def fuel_flap(self):
        s = self.cut['fuel'].side('in')
        c = s['uv'].mean(0)
        g = K.grid_points(c[0] - 0.06, c[0] + 0.06, c[1] - 0.06, c[1] + 0.06, 0.012, dt=0.012)
        V, N, Tr = K.mesh_region(S.CV, [K.Loop(s['uv'], s['P'], s['N'])], [], g, spacing=0.012)
        b = K.Buf().add(V, N, Tr, 'paint')
        V, N, Tr = K.roll_edge(s['P'], s['N'], s['E'], 0.0015, 0.006, 0.004, 2, closed=True, hem_segs=0)
        b.add(V, N, Tr, 'paint')
        b.extend(K.panel_back(s['P'], s['N'], s['E']))
        return b

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
        g = K.grid_points(0.0, 1.0, 1.0, 2.0, 0.09, dt=0.09)
        V, N, Tr = K.mesh_region(S.FRONT, [K.Loop(K.resample_keep(K.ccw(loop), 0.045))], [], g, spacing=0.09, level=-0.009)
        out['ws'] = K.Buf().add(V, N, Tr, 'glass')

        def pane(w, level, grow=0.012):
            uv = K.offset_loop2(to_ccw(w['uv']), -grow, True)
            lo, hi = uv.min(0), uv.max(0)
            g = K.grid_points(lo[0], hi[0], lo[1], hi[1], 0.12, dt=0.12)
            V, N, Tr = K.mesh_region(S.CV, [K.Loop(K.resample_keep(uv, 0.06))], [], g, spacing=0.12, level=level)
            return K.Buf().add(V, N, Tr, 'glass')
        out['quarter'] = pane(self.win['quarter'], -0.012)
        out['mid'] = pane(self.win['mid'], -0.012)
        out['gal'] = pane(self.win['gal'], -0.012)
        out['mid_r'] = pane(self.win['mid_r'], -0.012)
        out['rear'] = pane(self.win['rear'], -0.012)
        out['door'] = pane(self.win['door'], -0.024)
        out['side'] = pane(self.win['side'], -0.024)
        # the rear window (left half, in the body)
        w = self.win['tail']
        uv = K.offset_loop2(w['uv'], -0.012, closed=False)
        uv[0, 0] = uv[-1, 0] = U
        tt = np.linspace(uv[-1, 1], uv[0, 1], 12)[1:-1]
        loop = np.vstack([uv, np.stack([np.full(len(tt), U), tt], 1)])
        g = K.grid_points(U - 1.0, U, T[3], T[6], 0.12, dt=0.12)
        V, N, Tr = K.mesh_region(S.CV, [K.Loop(K.resample_keep(K.ccw(loop), 0.06))], [], g, spacing=0.12, level=-0.014)
        out['tail'] = K.Buf().add(V, N, Tr, 'glass')
        return out

    # ------------------------------------------------------------------ edges
    def edges(self):
        """Rolled edges: (body buffer for the left half, body extras per side {'L', 'R'}, panel buffers)."""
        body = K.Buf()
        per = {'L': K.Buf(), 'R': K.Buf()}
        panels = {}
        # the cab door's opening (body) and the door's hem, its window's reveal
        for key, sides in (('door', ('L', 'R')), ('side', ('R',))):
            c = self.cut[key]
            so = c.side('out')
            V, N, Tr = K.roll_edge(so['P'], so['N'], so['E'], ER, 0.06, 0.0, 2, closed=True)
            for sd in sides:
                per[sd].add(V, N, Tr, 'paint')
            si = c.side('in')
            V, N, Tr = K.roll_edge(si['P'], si['N'], si['E'], ER, 0.055, 0.02, 2, closed=True, hem_segs=0)
            pb = panels.setdefault(key, K.Buf())
            pb.add(V, N, Tr, 'paint')
            w = self.win['door' if key == 'door' else 'side']
            E = side_dir(w['P'], w['N'], np.tile(w['P'].mean(0), (len(w['P']), 1)), True)
            V, N, Tr = K.roll_edge(w['P'], w['N'], E, 0.003, 0.048, 0.0, 2, closed=True)
            pb.add(V, N, Tr, 'paint')
        # fixed windows
        for name, sides in (('quarter', ('L', 'R')), ('rear', ('L', 'R')), ('mid', ('L',)), ('gal', ('L',)), ('mid_r', ('R',))):
            w = self.win[name]
            E = side_dir(w['P'], w['N'], np.tile(w['P'].mean(0), (len(w['P']), 1)), True)
            V, N, Tr = K.roll_edge(w['P'], w['N'], E, 0.003, 0.036, 0.0, 2, closed=True)
            for sd in sides:
                per[sd].add(V, N, Tr, 'paint')
        # the engine lid's opening (body) and its hem (the lid); the rear window's reveal (body)
        for key in ('lid',):
            c = self.cut[key]
            so = c.side('out')
            V, N, Tr = K.roll_edge(so['P'], so['N'], so['E'], ER, 0.05, 0.0, 2, closed=False)
            body.add(V, N, Tr, 'paint')
            si = c.side('in')
            V, N, Tr = K.roll_edge(si['P'], si['N'], si['E'], ER, 0.04, 0.016, 2, closed=False, hem_segs=0)
            panels.setdefault(key, K.Buf()).add(V, N, Tr, 'paint')
        w = self.win['tail']
        cen = np.array([w['P'][:, 0].mean() + 0.1, 0.0, w['P'][:, 2].mean()])
        E = side_dir(w['P'], w['N'], np.tile(cen, (len(w['P']), 1)), False)
        V, N, Tr = K.roll_edge(w['P'], w['N'], E, 0.003, 0.044, 0.0, 2, closed=False)
        body.add(V, N, Tr, 'paint')
        # windscreen opening
        w = self.win['ws']
        cen = np.array([w['P'][:, 0].mean() - 0.1, 0.0, w['P'][:, 2].mean()])
        E = side_dir(w['P'], w['N'], np.tile(cen, (len(w['P']), 1)), False)
        V, N, Tr = K.roll_edge(w['P'], w['N'], E, 0.004, 0.034, 0.0, 2, closed=False)
        body.add(V, N, Tr, 'paint')
        # wheel arches: the lip into the wheel well (the arc only)
        for key in ('F', 'R'):
            a = self.arch[key]
            keep = a['uv'][:, 1] >= T[1] - 1e-6
            P, N = a['P'][keep], a['N'][keep]
            cc = np.array([P[:, 0].mean(), P[:, 1].mean(), D['hub_z']])
            E = side_dir(P, N, np.tile(cc, (len(P), 1)), False)
            V, Nn, Tr = K.roll_edge(P, N, E, 0.007, 0.04, 0.0, 2, closed=False)
            body.add(V, Nn, Tr, 'paint')
        return body, per, panels

    # ------------------------------------------------------------------ lamps, louvres, the emblem
    def opening_details(self):
        b = K.Buf()
        # head lamp buckets
        lp = self.open_lamp
        c3 = S.FRONT.to3d(np.array([[D['lamp_y'], D['lamp_z']]]))[0][0]
        E = side_dir(lp['P'], lp['N'], np.tile(c3, (len(lp['P']), 1)), True)
        V, N, Tr = K.roll_edge(lp['P'], lp['N'], E, 0.005, 0.012, 0.0, 2, closed=True, flange_dir=(-1, 0, 0))
        b.add(V, N, Tr, 'paint')
        ring = V.reshape(-1, len(lp['P']), 3)[-1]
        depth = 0.07
        b.extend(K.ring_tube(ring, (-1, 0, 0), depth, 1, 'trim'))
        b.extend(K.fill_loop(ring - np.array([depth, 0, 0]), (1, 0, 0), 'trim'))
        self.lamp_mount = (c3, lp['N'].mean(0))
        # tail lamp recesses
        tl = self.open_tail
        ct = tl['P'].mean(0)
        E = side_dir(tl['P'], tl['N'], np.tile(ct, (len(tl['P']), 1)), True)
        V, N, Tr = K.roll_edge(tl['P'], tl['N'], E, 0.003, 0.045, 0.0, 2, closed=True, flange_dir=(1, 0, 0))
        b.add(V, N, Tr, 'paint')
        ring = V.reshape(-1, len(tl['P']), 3)[-1]
        b.extend(K.fill_loop(ring, (-1, 0, 0), 'trim'))
        self.tail_mount = (np.array([tl['P'][:, 0].mean(), ct[1], ct[2]]), -tl['N'].mean(0))
        return b

    def nose_details(self):
        """Left half: the three louvres under the emblem, the indicator over each head lamp, a marker lamp on the
        corner."""
        b = K.Buf()
        prof = K.round_profile(np.array([(-0.011, 0.0), (-0.009, 0.006), (0.009, 0.006), (0.011, 0.0)]), 0.003, 1)
        for z in (0.74, 0.80, 0.86):
            ys = np.linspace(0.0, 0.46, 8)
            P, N = S.FRONT.to3d(np.stack([ys, np.full(len(ys), z)], 1))
            V, Nn, Tr = K.sweep(P - N * 0.001, N, prof, closed=False)
            b.add(V, Nn, Tr, 'trim')
            end = V.reshape(len(P), -1, 3)[-1]
            b.extend(K.fill_loop(end, (0, 1, 0), 'trim'))
        p, n = S.FRONT.to3d(np.array([[D['lamp_y'], D['lamp_z'] + D['lamp_d'] / 2 + 0.05]]))
        b.extend(K.box_buf((-0.012, -0.055, -0.018), (0.006, 0.055, 0.018), 'lens_amber', 0.008, 2, xf=K.mat4_trs(p[0])))
        b.extend(K.box_buf((-0.008, -0.061, -0.024), (0.002, 0.061, 0.024), 'chrome', 0.006, 2, xf=K.mat4_trs(p[0])))
        # a marker on the corner roll, under the waist
        P, N = S.CV.to3d(np.array([[S.SV[1] + 0.5 * (S.SV[2] - S.SV[1]), float(S.t_of_z(0.8, 1.30)[0])]]))
        R = K.frame_from(K.unit(np.cross((0, 0, 1.0), N[0])), N[0])
        b.extend(K.box_buf((-0.035, -0.014, -0.004), (0.035, 0.014, 0.006), 'lens_amber', 0.006, 2, xf=K.mat4_trs(P[0], R)))
        return b

    def emblem(self):
        """Our own mark in the middle of the nose: an elephant's head seen from the front on a cream disc in a chrome
        ring — its big ears out to the sides, its trunk down and curled up at the end, two tusks (centred, not
        mirrored)."""
        b = K.Buf()
        zc = 1.30
        p0, n0 = S.FRONT.to3d(np.array([[0.0, zc]]))
        n0 = K.unit(n0[0])
        up = K.unit(np.array([0.0, 0.0, 1.0]) - n0 * n0[2])
        right = np.cross(up, n0)
        M = K.mat4_trs(p0[0], np.stack([right, up, n0], 1))
        th = np.linspace(0.0, 2.0 * PI, 56, endpoint=False)
        disc = K.ccw(np.stack([0.105 * np.cos(th), 0.105 * np.sin(th)], 1))
        b.extend(K.prism_buf(disc, -0.002, 0.004, 'chrome', bevel=0.0015, segs=1, xf=M))
        b.extend(K.prism_buf(K.offset_loop2(disc, -0.008), 0.003, 0.0062, 'paint_b', bevel=0.0, segs=1, xf=M))

        def ell(cx, cy, rx, ry, ang=0.0, n=30):
            a = math.radians(ang)
            return K.ccw(np.array([(cx + rx * math.cos(t) * math.cos(a) - ry * math.sin(t) * math.sin(a),
                                    cy + rx * math.cos(t) * math.sin(a) + ry * math.sin(t) * math.cos(a)) for t in np.linspace(0.0, 2.0 * PI, n, endpoint=False)]))

        def on(pts, h):
            return np.stack([pts[:, 0], pts[:, 1], np.full(len(pts), h)], 1) @ M[:3, :3].T + M[:3, 3]
        # the ears, the head between them over them
        for sx in (1, -1):
            b.extend(K.prism_buf(ell(sx * 0.048, 0.012, 0.034, 0.044, sx * 14.0), 0.004, 0.0080, 'chrome', bevel=0.0012, segs=1, xf=M))
        b.extend(K.prism_buf(ell(0.0, 0.022, 0.029, 0.033), 0.004, 0.0105, 'chrome', bevel=0.0015, segs=1, xf=M))
        # the trunk: down from the head and curled up at its end; the tusks either side of it
        tr = np.array([(0.0, 0.0), (0.001, -0.022), (0.003, -0.044), (0.008, -0.062), (0.018, -0.074), (0.030, -0.074), (0.036, -0.064), (0.033, -0.054)])
        b.extend(K.tube_buf(on(tr, 0.0095), 0.0070, 'chrome', 8))
        for sx in (1, -1):
            tk = np.array([(sx * 0.013, -0.004), (sx * 0.019, -0.022), (sx * 0.028, -0.034)])
            b.extend(K.tube_buf(on(tk, 0.0105), 0.0032, 'chrome', 6))
        # three amber clearance lamps on the brow over the windscreen
        for y in (-0.22, 0.0, 0.22):
            p, n = S.FRONT.to3d(np.array([[y, D['ws_head'] + 0.13]]))
            R_ = K.frame_from((0.0, 1.0, 0.0), n[0])
            b.extend(K.box_buf((-0.03, -0.012, -0.006), (0.03, 0.012, 0.008), 'chrome', 0.004, 1, xf=K.mat4_trs(p[0], R_)))
            b.extend(K.box_buf((-0.026, -0.009, -0.004), (0.026, 0.009, 0.014), 'lens_amber', 0.005, 2, xf=K.mat4_trs(p[0], R_)))
        return b

    def tail_details(self):
        """Left half: a red clearance lamp at the top of the tail near the corner, an amber one on the side at the
        front of the roof (a motorhome's markers)."""
        b = K.Buf()
        p, n = S.REAR.to3d(np.array([[D['hw'] - D['rho_r'] - 0.08, D['roof_z'] - 0.20]]))
        R_ = K.frame_from((0.0, 1.0, 0.0), -n[0])
        b.extend(K.box_buf((-0.045, -0.018, -0.004), (0.045, 0.018, 0.010), 'lens_tail', 0.006, 2, xf=K.mat4_trs(p[0], R_)))
        p, n = S.SIDE.to3d(np.array([[D['xf'] - 0.60, D['roof_z'] - 0.42]]))
        R_ = K.frame_from((1.0, 0.0, 0.0), n[0])
        b.extend(K.box_buf((-0.04, -0.016, -0.004), (0.04, 0.016, 0.010), 'lens_amber', 0.006, 2, xf=K.mat4_trs(p[0], R_)))
        return b

    # ------------------------------------------------------------------ trims
    def waist_path(self, u0, u1, n=None):
        uu = np.linspace(u0, u1, n or max(3, int(abs(u1 - u0) / 0.07) + 1))
        return S.CV.to3d(np.stack([uu, np.full(len(uu), S.T_WAIST)], 1))

    @staticmethod
    def bead(P, N, h=0.0032, w=0.0045, mat='chrome'):
        prof = np.array([(-w, 0.0), (-w * 0.75, h * 0.7), (0.0, h), (w * 0.75, h * 0.7), (w, 0.0)])
        V, Nn, Tr = K.sweep(P - N * 0.0005, N, prof, closed=False)
        return K.Buf().add(V, Nn, Tr, mat)

    def waist_strips(self):
        """The chrome strip along the colour split: on the body (pieces between the panels, per side) and on the
        panels."""
        door = self.cut['door'].side('out')['uv']
        side = self.cut['side'].side('out')['uv']
        g = 0.003
        ud0, ud1 = door[:, 0].min() - g, door[:, 0].max() + g
        us0, us1 = side[:, 0].min() - g, side[:, 0].max() + g
        ut = U
        per = {}
        for sd, spans in (('L', [(0.0, ud0), (ud1, ut)]), ('R', [(0.0, ud0), (ud1, us0), (us1, ut)])):
            b = K.Buf()
            for (a, c) in spans:
                P, N = self.waist_path(a, c)
                b.extend(self.bead(P, N))
            per[sd] = b
        pan = {}
        for key in ('door', 'side'):
            si = self.cut[key].side('in')['uv']
            P, N = self.waist_path(si[:, 0].min() + g, si[:, 0].max() - g)
            pan[key] = self.bead(P, N)
        return per, pan

    def window_seals(self, names):
        """Rubber seals just inside the fixed windows' reveals."""
        b = K.Buf()
        prof = np.array([(-0.006, 0.0), (-0.005, 0.0035), (0.0, 0.005), (0.005, 0.0035), (0.006, 0.0)])
        for name in names:
            w = self.win[name]
            E = side_dir(w['P'], w['N'], np.tile(w['P'].mean(0), (len(w['P']), 1)), True)
            k = K.coarse_idx(np.vstack([w['P'], w['P'][:1]]), 0.001)
            k = k[k < len(w['P'])]
            P, N, E = w['P'][k], w['N'][k], E[k]
            V, Nn, Tr = K.sweep(P + E * 0.007 - N * 0.009, N, prof, closed=True)
            b.add(V, Nn, Tr, 'rubber')
        return b

    def ws_trims(self):
        b = K.Buf()
        w = self.win['ws']
        cen = np.array([w['P'][:, 0].mean() - 0.1, 0.0, w['P'][:, 2].mean()])
        E = side_dir(w['P'], w['N'], np.tile(cen, (len(w['P']), 1)), False)
        k = K.coarse_idx(w['P'], 0.0012)
        P, Nn, E = w['P'][k], w['N'][k], E[k]
        prof = np.array([(-0.007, -0.006), (-0.006, 0.003), (0.0, 0.0055), (0.006, 0.003), (0.007, -0.006)])
        V, NN, Tr = K.sweep(P + E * 0.006 - Nn * 0.004, Nn, prof, closed=False)
        b.add(V, NN, Tr, 'rubber')
        prof = np.array([(-0.0045, -0.001), (-0.0035, 0.003), (0.0035, 0.003), (0.0045, -0.001)])
        V, NN, Tr = K.sweep(P + E * 0.0015 + Nn * 0.0005, Nn, prof, closed=False)
        b.add(V, NN, Tr, 'chrome')
        return b

    def drip_rail(self):
        """The gutter along the roof's edge over the doors and windows (left half)."""
        xs = np.linspace(D['xr'] + 0.30, D['xf'] - 0.62, 60)
        P, N = S.SIDE.to3d(np.stack([xs, np.full(len(xs), 2.74)], 1))
        prof = np.array([(-0.004, 0.0), (-0.004, 0.007), (-0.001, 0.010), (0.004, 0.010), (0.006, 0.006), (0.006, 0.0)])
        V, Nn, Tr = K.sweep(P - N * 0.001, N, prof, closed=False)
        b = K.Buf().add(V, Nn, Tr, 'paint_b')
        for e in (0, -1):
            b.extend(K.fill_loop(V.reshape(len(P), -1, 3)[e], (np.sign(P[e, 0] - P[-1 - e, 0]), 0, 0), 'paint_b'))
        return b

    def slide_rail(self):
        """The sliding door's rail under the right rear window (built in left coordinates)."""
        xs = np.linspace(D['sd_x0'] - 0.02, -1.80, 8)
        P, N = S.SIDE.to3d(np.stack([xs, np.full(len(xs), 1.135)], 1))
        prof = np.array([(-0.011, 0.0), (-0.011, 0.012), (0.011, 0.012), (0.011, 0.0)])
        V, Nn, Tr = K.sweep(P - N * 0.001, N, prof, closed=False, smooth_prof=False)
        b = K.Buf().add(V, Nn, Tr, 'trim')
        for e in (0, -1):
            b.extend(K.fill_loop(V.reshape(len(P), -1, 3)[e], (np.sign(P[e, 0] - P[-1 - e, 0]), 0, 0), 'trim'))
        return b

    def rear_louvres(self):
        """The radiator's grilles on the rear quarters behind the wheels, under the waist (left half): the pusher's
        engine breathes through them."""
        b = K.Buf()
        prof = np.array([(-0.008, 0.0), (-0.007, 0.007), (0.007, 0.005), (0.008, 0.0)])
        for z in np.arange(0.78, 1.36, 0.042):
            xs = np.linspace(D['xr'] + 0.30, D['xr'] + 0.95, 6)
            P, N = S.SIDE.to3d(np.stack([xs, np.full(len(xs), z)], 1))
            V, Nn, Tr = K.sweep(P - N * 0.0005, N, prof, closed=False)
            b.add(V, Nn, Tr, 'trim')
            for e in (0, -1):
                b.extend(K.fill_loop(V.reshape(len(P), -1, 3)[e], (np.sign(P[e, 0] - P[-1 - e, 0]), 0, 0), 'trim'))
        return b

    def fuel_details(self):
        """The pocket behind the flap and its cap (left side)."""
        b = K.Buf()
        so = self.cut['fuel'].side('out')
        V, N, Tr = K.roll_edge(so['P'], so['N'], so['E'], 0.002, 0.024, 0.0, 2, closed=True)
        b.add(V, N, Tr, 'paint')
        ring = V.reshape(-1, len(so['P']), 3)[-1]
        c = ring.mean(0)
        hole = K.circle_loop(0, 0, 0.022, 0.005)
        h3 = np.stack([c[0] + hole[:, 0], np.full(len(hole), c[1]), c[2] + hole[:, 1]], 1)
        b.extend(K.fill_loop(ring, (0, 1, 0), 'paint', holes=[h3]))
        cap = np.array([[0.0, 0.0], [0.030, 0.0], [0.031, 0.004], [0.031, 0.014], [0.028, 0.018], [0.0, 0.018]])
        V, N, Tr = K.lathe(cap, c, (0, 1, 0), 20)
        b.add(V, N, Tr, 'trim')
        b.extend(K.box_buf((c[0] - 0.022, c[1] + 0.016, c[2] - 0.005), (c[0] + 0.022, c[1] + 0.024, c[2] + 0.005), 'trim', 0.003, 2))
        return b

    # ------------------------------------------------------------------ the inner faces of the panels
    def door_card(self, key, level=-0.05, mat='plastic_int'):
        """The inside of a door (left coordinates), `level` in, facing in, round the window."""
        s = self.cut[key].side('in')
        w = self.win['door' if key == 'door' else 'side']
        outer = K.offset_loop2(s['uv'], 0.004, True)
        hole = K.offset_loop2(w['uv'], -0.004, True)
        us = S.v_u_samples(0.08, 0.08, 0.08)
        pts, sp = S.grid_from(us, S.v_t_samples(0.08, 3))
        V, N, Tr = K.mesh_region(S.CV, [K.Loop(K.resample_keep(outer, 0.05))], [K.Loop(K.resample_keep(hole, 0.05))], pts, spacing=sp, level=level)
        return K.Buf().add(V, -N, Tr, mat)

    def rear_panel_back(self, key, level, mat):
        """The inside of the tailgate / the engine lid (left half), `level` in, facing in."""
        loop = self.rear_panel_loop(key)
        uv = coarse_loop(loop.uv, 0.05, 0.002)
        us = S.v_u_samples(0.1, 0.08, 0.05)
        pts, sp = S.grid_from(us, S.v_t_samples(0.08, 4))
        V, N, Tr = K.mesh_region(S.CV, [K.Loop(uv)], [], pts, spacing=sp, level=level)
        return K.Buf().add(V, -N, Tr, mat)
