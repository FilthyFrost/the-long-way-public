"""The Camel's hood (frames/camel_hood.py): its shell's left half, mirrored by frames/_camel_build.py — the body region
with the front wheel's arch notch and the grille's notch at the front centre, a hole for the round head lamp; the bonnet
(its top: P_hood, hinged at the cowl); the grille's bars behind its notch, the lamp's bucket, the indicator under it, the
camel on the front over the grille; the arch's lip; the inside of the shell (seen with the bonnet up). All of it the
paint (the yellow); its back is inside the bus's box behind the cowl."""
import math
import sys

sys.dont_write_bytecode = True

import numpy as np  # noqa: E402

from frames import _kit as K  # noqa: E402
from frames import camel_hood as H  # noqa: E402
from frames._camel_ext import coarse_loop, to_ccw  # noqa: E402
from frames._sedan_ext import Path, side_dir  # noqa: E402

D = H.D
PI = math.pi
U = H.U_END
T = H.V_T
WALL = -0.022


class Hood:
    def __init__(self):
        self.us = H.v_u_samples(0.08, 0.05, 0.02)
        self.ts = H.v_t_samples(0.08, 9)
        self._arch()
        self._front()

    # ------------------------------------------------------------------ cuts
    def _arch(self):
        """The front wheel's arch: a notch in the bottom row of the side."""
        xa = D['ax_f']
        R, za, zb = D['arch_r'], D['arch_zc'], D['z_bot']
        th = math.asin((zb - za) / R)
        ths = np.linspace(th, PI - th, 48)
        ax = xa + R * np.cos(ths)
        az = za + R * np.sin(ths)
        uu = H.u_of_x(ax)
        uv = np.stack([uu, H.t_of_z(uu, az)], 1)
        uv[0, 1] = uv[-1, 1] = T[1]
        down = np.linspace(T[0], T[1], 3)
        front = np.stack([np.full(len(down), uv[0, 0]), down], 1)
        rear = np.stack([np.full(len(down), uv[-1, 0]), down[::-1]], 1)
        nt = np.vstack([front[:-1], uv, rear[1:]])
        P, N = H.CV.to3d(nt)
        self.arch = dict(uv=nt, P=P, N=N)

    def _front(self):
        d = D
        # the grille: a notch at the front centre (left half: top centre -> round -> bottom centre)
        hw, z0, z1, r = d['grille']
        pts = np.array([(0.0, z1), (hw, z1), (hw, z0), (0.0, z0)])
        yz = K.rounded_poly(pts, [0, r, r, 0], 0.03, closed=False, arc_step=0.008)
        P, N = H.FRONT.to3d(yz)
        uv = H.CV.to2d(P)
        uv[0, 0] = uv[-1, 0] = 0.0
        P, N = H.CV.to3d(uv)
        self.grille = dict(uv=uv, P=P, N=N, yz=yz)
        # the round head lamp
        c = K.circle_loop(d['lamp_y'], d['lamp_z'], d['lamp_d'] / 2, 0.012)
        uv = to_ccw(H.front_uv(c))
        P, N = H.CV.to3d(uv)
        self.lamp = dict(uv=uv, P=P, N=N, yz=c)

    # ------------------------------------------------------------------ the body region
    def body_loop(self, coarse=False):
        us, ts = self.us, self.ts
        p = Path()
        # bottom row from the front centre back, round the arch
        nt = self.arch
        seg = us[(us > -1.0) & (us < nt['uv'][0, 0] - 1e-4)]
        p.add(np.stack([seg, np.full(len(seg), T[0])], 1))
        p.add(nt['uv'], nt['P'], nt['N'])
        cur = nt['uv'][-1, 0] + 1e-4
        seg = us[(us > cur) & (us < U - 1e-6)]
        p.add(np.stack([np.concatenate([seg, [U]]), np.full(len(seg) + 1, T[0])], 1))
        # the rear centre line up (inside the bus's box)
        tt = ts[(ts > T[0] + 1e-4) & (ts < T[-1] - 1e-6)]
        p.add(np.stack([np.full(len(tt) + 1, U), np.concatenate([tt, [T[-1]]])], 1))
        # top row forwards
        uu = us[(us > 1e-6) & (us < U - 1e-6)][::-1]
        p.add(np.stack([np.concatenate([uu, [0.0]]), np.full(len(uu) + 1, T[-1])], 1))
        # front centre line down, round the grille (its outline runs top -> bottom)
        g = self.grille
        tt = ts[(ts > g['uv'][0, 1] + 0.004) & (ts < T[-1] - 1e-6)][::-1]
        p.add(np.stack([np.zeros(len(tt)), tt], 1))
        p.add(g['uv'], g['P'], g['N'])
        tt = ts[(ts > T[0] + 1e-6) & (ts < g['uv'][-1, 1] - 0.004)][::-1]
        p.add(np.stack([np.zeros(len(tt)), tt], 1))
        loop = p.loop()
        if coarse:
            return K.Loop(coarse_loop(loop.uv, 0.08))
        return loop

    def body(self):
        loop = self.body_loop()
        holes = [K.Loop(self.lamp['uv'], self.lamp['P'], self.lamp['N'])]
        pts, sp = H.grid_from(self.us, self.ts)
        V, N, Tr = K.mesh_region(H.CV, [loop], holes, pts, spacing=sp)
        return K.Buf().add(V, N, Tr, 'paint')

    def bonnet(self, level=0.0):
        """The top (left half) on the height-field chart, bounded by the loft's top row: the bonnet (level: its inside)."""
        if level == 0:
            row = np.stack([self.us, np.full(len(self.us), T[-1])], 1)
        else:
            lp = self.body_loop(coarse=True).uv
            row = lp[np.abs(lp[:, 1] - T[-1]) < 1e-9]
            row = row[np.argsort(row[:, 0])]
        Pr, Nr = H.CV.to3d(row, level if level else None)
        a, b = Pr[-1], Pr[0]
        xs = np.linspace(a[0], b[0], max(3, int(abs(b[0] - a[0]) / 0.05)))[1:-1]
        Pc, Nc = H.CT.to3d(np.stack([xs, np.zeros(len(xs))], 1), level if level else None)
        P = np.vstack([Pr, Pc])
        Nn = np.vstack([Nr, Nc])
        sp = 0.08 if level == 0 else 0.16
        xg, yg = np.meshgrid(np.arange(D['xr'] - 0.05, D['xf'] + 0.05, sp), np.arange(0.0, D['hw'], sp), indexing='ij')
        g = np.stack([xg.ravel(), yg.ravel()], 1)
        if level == 0:
            V, N, Tr = K.mesh_region(H.CT, [K.Loop(P[:, :2], P, Nn)], [], g, spacing=sp)
            return K.Buf().add(V, N, Tr, 'paint')
        V, N, Tr = K.mesh_region(H.CT, [K.Loop(P[:, :2])], [], g, spacing=sp, level=level)
        return K.Buf().add(V, -N, Tr, 'paint')

    def lining(self):
        """The inside of the shell, WALL in, facing in (seen with the bonnet up): painted metal."""
        loop = self.body_loop(coarse=True)
        holes = [K.Loop(K.resample(self.lamp['uv'], 0.06, closed=True))]
        us = H.v_u_samples(0.16, 0.10, 0.05)
        ts = H.v_t_samples(0.16, 6)
        pts, sp = H.grid_from(us, ts)
        V, N, Tr = K.mesh_region(H.CV, [loop], holes, pts, spacing=sp, level=WALL)
        return K.Buf().add(V, -N, Tr, 'paint')

    # ------------------------------------------------------------------ edges and details
    def edges(self):
        """The arch's lip into the wheel well, the grille opening's rolled edge, the lamp's bucket."""
        b = K.Buf()
        a = self.arch
        keep = a['uv'][:, 1] >= T[1] - 1e-6
        P, N = a['P'][keep], a['N'][keep]
        cc = np.array([P[:, 0].mean(), P[:, 1].mean(), D['hub_z']])
        E = side_dir(P, N, np.tile(cc, (len(P), 1)), False)
        V, Nn, Tr = K.roll_edge(P, N, E, 0.007, 0.04, 0.0, 2, closed=False)
        b.add(V, Nn, Tr, 'paint')
        g = self.grille
        cen = np.array([g['P'][:, 0].mean() - 0.1, 0.0, g['P'][:, 2].mean()])
        E = side_dir(g['P'], g['N'], np.tile(cen, (len(g['P']), 1)), False)
        V, Nn, Tr = K.roll_edge(g['P'], g['N'], E, 0.004, 0.05, 0.0, 2, closed=False)
        b.add(V, Nn, Tr, 'paint')
        lp = self.lamp
        c3 = H.FRONT.to3d(np.array([[D['lamp_y'], D['lamp_z']]]))[0][0]
        E = side_dir(lp['P'], lp['N'], np.tile(c3, (len(lp['P']), 1)), True)
        V, Nn, Tr = K.roll_edge(lp['P'], lp['N'], E, 0.005, 0.012, 0.0, 2, closed=True, flange_dir=(-1, 0, 0))
        b.add(V, Nn, Tr, 'paint')
        ring = V.reshape(-1, len(lp['P']), 3)[-1]
        depth = 0.07
        b.extend(K.ring_tube(ring, (-1, 0, 0), depth, 1, 'trim'))
        b.extend(K.fill_loop(ring - np.array([depth, 0, 0]), (1, 0, 0), 'trim'))
        self.lamp_mount = (c3, lp['N'].mean(0))
        return b

    def details(self):
        """Left half: the grille's dark back and its chrome bars behind the notch, the indicator under the lamp."""
        b = K.Buf()
        hw, z0, z1, _ = D['grille']
        xb = float(H.FRONT.to3d(np.array([[0.0, (z0 + z1) / 2]]))[0][0, 0])
        b.extend(K.box_buf((xb - 0.09, 0.0, z0 - 0.01), (xb - 0.07, hw + 0.01, z1 + 0.01), 'trim', 0.0, 1))
        for z in np.arange(z0 + 0.04, z1 - 0.02, 0.055):
            b.extend(K.box_buf((xb - 0.07, 0.0, z - 0.009), (xb - 0.035, hw - 0.012, z + 0.009), 'chrome', 0.004, 1))
        b.extend(K.box_buf((xb - 0.07, hw * 0.5 - 0.008, z0 + 0.02), (xb - 0.04, hw * 0.5 + 0.008, z1 - 0.02), 'chrome', 0.004, 1))
        p, n = H.FRONT.to3d(np.array([[D['lamp_y'], D['lamp_z'] - D['lamp_d'] / 2 - 0.06]]))
        b.extend(K.box_buf((-0.012, -0.06, -0.02), (0.006, 0.06, 0.02), 'lens_amber', 0.008, 2, xf=K.mat4_trs(p[0])))
        b.extend(K.box_buf((-0.008, -0.066, -0.026), (0.002, 0.066, 0.026), 'chrome', 0.006, 2, xf=K.mat4_trs(p[0])))
        return b

    def emblem(self):
        """Our own mark on the front over the grille: a camel walking, its two humps, its neck forward and its head up,
        in chrome (centred, not mirrored)."""
        b = K.Buf()
        zc = D['grille'][2] + 0.085
        p0, n0 = H.FRONT.to3d(np.array([[0.0, zc]]))
        n0 = K.unit(n0[0])
        up = K.unit(np.array([0.0, 0.0, 1.0]) - n0 * n0[2])
        right = np.cross(up, n0)
        M = K.mat4_trs(p0[0], np.stack([right, up, n0], 1))
        # (its outline in its own plane: x to the right, y up, metres; the head to the right)
        body = np.array([(-0.075, -0.005), (-0.07, 0.012), (-0.05, 0.02), (-0.035, 0.045), (-0.015, 0.024), (0.0, 0.022), (0.015, 0.044),
                         (0.032, 0.022), (0.05, 0.02), (0.062, 0.04), (0.072, 0.06), (0.086, 0.062), (0.094, 0.052), (0.08, 0.048),
                         (0.072, 0.025), (0.06, -0.002), (0.05, -0.012), (-0.06, -0.012)])
        b.extend(K.prism_buf(K.ccw(body), 0.0, 0.006, 'chrome', bevel=0.0012, segs=1, xf=M))
        for x in (-0.055, -0.035, 0.03, 0.048):
            leg = np.array([(x - 0.004, -0.06), (x + 0.004, -0.06), (x + 0.005, -0.008), (x - 0.005, -0.008)])
            b.extend(K.prism_buf(K.ccw(leg), 0.0, 0.005, 'chrome', bevel=0.0008, segs=1, xf=M))
        tail = np.array([(-0.075, 0.0), (-0.09, -0.02), (-0.087, -0.024), (-0.071, -0.006)])
        b.extend(K.prism_buf(K.ccw(tail), 0.0, 0.004, 'chrome', bevel=0.0, segs=1, xf=M))
        return b
