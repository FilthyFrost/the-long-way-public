"""
SWINGARM, rear shocks and side stand of the moto (frames/moto.py).

SWINGARM: origin on the pivot axis (transverse, Blender Y), axes = the frame's; pivot tube, oval legs, axle
plates with the chain adjusters, the axle with its spacers and nut, the shock studs, the rear sprocket and the
chain's rear run (the gearbox part carries the front run), the chain guard, the drum brake's backing plate with
its cam lever, torque arm and brake rod.
SHOCK_UPPER_L/R (on the frame, origin at the top eye) and SHOCK_LOWER_L/R (children of SWINGARM, origin at the
bottom eye): local +Z runs along the shock from the bottom eye towards the top eye at rest; the lower half
(spring, damper body) slides up inside the upper's chrome shroud.
STAND: the side stand, origin on its pivot; deployed as modelled, folded by a turn of STAND_FOLD_DEG about
STAND_AXIS.
"""
import math
import sys

sys.dont_write_bytecode = True

import numpy as np  # noqa: E402

from frames import _kit as K  # noqa: E402
from frames import _moto_kit as MK  # noqa: E402
from frames import moto as M  # noqa: E402

D = M.D
FR = 'paint_b'
unit = K.unit
SY = np.array([1.0, -1.0, 1.0])

# the gearbox part's front chain run ends here (gb_moto: sprocket at (-0.06, 0.088, 0.06) in its frame, the run
# 0.22 long behind it, +-0.046 above / below)
GB_SPROCKET = M.GEARBOX + np.array([-0.06, 0.088, 0.06])
CHAIN_Y = 0.088
R_SPROCKET_R = 0.100        # rear sprocket pitch radius (40 T)
R_SPROCKET_F = 0.046        # where the gearbox's run sits (above / below its sprocket centre)


def shock_points(side):
    """Bottom and top eye centres of the left (side = +1) or right (-1) shock."""
    lo = np.array([D['shock_lo'][0], side * D['shock_hw'], D['shock_lo'][1]])
    up = np.array([D['shock_up'][0], side * D['shock_hw'], D['shock_up'][1]])
    return lo, up


class Rear:
    def __init__(self):
        self.pv = np.array([D['pivot_x'], 0.0, D['pivot_z']])
        self.hub = M.HUB_R

    def leg_path(self, sg):
        y0 = sg * D['sa_hw0']
        y1 = sg * D['sa_hw1']
        p0 = self.pv + np.array([-0.004, y0, 0.0])
        p1 = np.array([self.hub[0] + 0.030, y1, self.hub[2] + 0.0])
        mid = 0.5 * (p0 + p1) + np.array([0.0, sg * 0.006, 0.006])
        return MK.bend_path([p0, mid, p1], [0, 0.6, 0])

    def leg_y(self, x, sg):
        P = self.leg_path(sg)
        i = int(np.argmin(np.abs(P[:, 0] - x)))
        return P[i]

    # ---------------------------------------------------------------- swingarm
    def swingarm(self):
        b = K.Buf()
        pv = self.pv
        # pivot tube with bushes
        b.extend(MK.tube(np.array([pv + [0, -0.094, 0], pv + [0, 0.094, 0]]), 0.0205, FR, 17))
        for sg in (1, -1):
            b.extend(MK.lathe([(0.0098, 0.0), (0.0172, 0.0), (0.0172, 0.0035), (0.0098, 0.0035)], pv + [0, sg * 0.094, 0], (0, sg, 0),
                              'rubber', 18, smooth=False))
            leg = self.leg_path(sg)
            b.extend(MK.tube(leg, 0.0128, FR, 14, ellipse=(1.42, 1.0), ref=(0, 0, 1),
                             r_fn=lambda s: 1.0 - 0.14 * s, cap0='open', cap1='flat'))
            b.extend(MK.weld(np.array([pv + [0, -0.1, 0], pv + [0, 0.1, 0]]), 0.0205, leg, 0.0128 * 1.2, at='start', bead=0.0028,
                             mat=FR, segs=14))
            b.extend(self.axle_plate(sg))
            # shock stud boss and stud
            lo, up = shock_points(sg)
            lp = self.leg_y(lo[0], sg)
            yb0 = lp[1] + sg * 0.010
            b.extend(MK.tube(np.array([[lo[0], yb0 - sg * 0.004, lo[2]], [lo[0], sg * (abs(lo[1]) - 0.0125), lo[2]]]), 0.0115, FR, 14))
            b.extend(MK.tube(np.array([[lo[0], sg * (abs(lo[1]) - 0.013), lo[2]], [lo[0], sg * (abs(lo[1]) + 0.017), lo[2]]]), 0.0055, 'steel', 10))
            b.extend(MK.disc(np.array([lo[0], sg * (abs(lo[1]) + 0.0128), lo[2]]), (0, sg, 0), 0.012, 0.0055, 'steel', 12))
            b.extend(MK.cap_nut(np.array([lo[0], sg * (abs(lo[1]) + 0.013), lo[2]]), (0, sg, 0), 0.0075, 0.010, 'chrome'))
        # cross brace: a pressed bridge between the legs just behind the pivot, under the tyre's front
        b.extend(self.brace())
        b.extend(self.axle())
        b.extend(self.sprocket())
        b.extend(self.chain())
        b.extend(self.chain_guard())
        b.extend(self.drum_plate())
        return b

    def brace(self):
        b = K.Buf()
        pv = self.pv
        x = pv[0] - 0.034
        pl = self.leg_y(x, 1.0)
        pr = self.leg_y(x, -1.0)
        path = MK.bend_path([pl + [0, -0.004, -0.004], (x - 0.006, 0.03, pv[2] - 0.026), (x - 0.006, -0.03, pv[2] - 0.026), pr + [0, 0.004, -0.004]],
                            [0, 0.03, 0.03, 0])
        b.extend(MK.tube(path, 0.0105, FR, 12, cap0='open', cap1='open'))
        return b

    def axle_plate(self, sg):
        """Axle plate (dropout) at the end of a leg: the axle slot, the adjuster block with its bolt and
        lock nut, the index marks."""
        b = K.Buf()
        hub = self.hub
        y = sg * (D['sa_hw1'] + 0.0)
        out = MK.rounded_poly2([(hub[0] + 0.07, hub[2] - 0.016), (hub[0] + 0.07, hub[2] + 0.016), (hub[0] - 0.012, hub[2] + 0.024),
                                (hub[0] - 0.040, hub[2] + 0.012), (hub[0] - 0.040, hub[2] - 0.016), (hub[0] - 0.012, hub[2] - 0.024)],
                               [0.008, 0.008, 0.012, 0.01, 0.01, 0.012], 0.016)
        slot = MK.slot2((hub[0] - 0.012, hub[2]), (hub[0] + 0.028, hub[2]), 0.0112, 6)
        b.extend(MK.plate(out, (0.0, y, 0.0), (1, 0, 0), (0, 0, 1), 0.010, FR, holes=[slot]))
        # adjuster: block on the axle behind the slot, bolt through the plate's rear lug, lock nut
        bc = np.array([hub[0] - 0.026, y, hub[2]])
        b.extend(MK.box(bc + [0.0, sg * 0.0, 0.0], (0.012, 0.018, 0.022), 'steel', None, 0.002, 1))
        b.extend(MK.tube(np.array([bc + [-0.004, 0, 0], bc + [-0.03, 0, 0]]), 0.0034, 'steel', 8))
        b.extend(MK.bolt(bc + [-0.03, 0, 0], (-1, 0, 0), 0.0055, 0.0045, 'steel', washer=False))
        b.extend(MK.bolt(bc + [-0.016, 0, 0], (-1, 0, 0), 0.0055, 0.0035, 'steel', washer=False))
        return b

    def axle(self):
        """Axle with spacers between the hub and the plates, nut on the right, head on the left."""
        b = K.Buf()
        hub = self.hub
        y1 = D['sa_hw1']
        b.extend(MK.tube(np.array([hub + [0, -(y1 + 0.016), 0], hub + [0, y1 + 0.010, 0]]), 0.0105, 'steel', 12))
        b.extend(MK.tube(np.array([hub + [0, 0.0945, 0], hub + [0, y1 - 0.005, 0]]), 0.0155, 'steel', 14))
        b.extend(MK.tube(np.array([hub + [0, -0.0775, 0], hub + [0, -(y1 - 0.005), 0]]), 0.0155, 'steel', 14))
        b.extend(MK.bolt(hub + [0, -(y1 + 0.005), 0], (0, -1, 0), 0.0125, 0.0085, 'steel', washer=True, nut=True))
        b.extend(MK.bolt(hub + [0, y1 + 0.005, 0], (0, 1, 0), 0.0115, 0.0065, 'steel', washer=True))
        return b

    def sprocket(self):
        """Rear sprocket (40 teeth) on an alloy carrier bolted to the hub's left end."""
        b = K.Buf()
        hub = self.hub
        c = np.array([hub[0], CHAIN_Y, hub[2]])
        n = 40
        rr = R_SPROCKET_R
        tooth = []
        for k in range(n * 2):
            a = 2 * math.pi * k / (n * 2)
            ph = (k % 2)
            r = rr + (0.0050 if ph == 1 else -0.0032)
            tooth.append((r * math.cos(a), r * math.sin(a)))
        out = K.ccw(np.array(tooth))
        holes = [MK.circle2((0.0, 0.0), 0.040, 18)]
        for k in range(6):
            a = 2 * math.pi * k / 6 + 0.26
            holes.append(MK.circle2((0.066 * math.cos(a), 0.066 * math.sin(a)), 0.011, 7))
        b.extend(MK.plate(out, c, (1, 0, 0), (0, 0, 1), 0.006, 'steel', holes=holes, flat=True))
        b.extend(MK.lathe(MK.round_prof([(0.032, 0.062), (0.050, 0.062), (0.050, 0.075), (0.044, 0.085), (0.032, 0.085)], 0.002, 1),
                          np.array([hub[0], 0.0, hub[2]]), (0, 1, 0), 'alu', 20))
        for k in range(6):
            a = 2 * math.pi * k / 6
            p = np.array([hub[0] + 0.040 * math.cos(a), CHAIN_Y + 0.003, hub[2] + 0.040 * math.sin(a)])
            b.extend(MK.bolt(p, (0, 1, 0), 0.0045, 0.0035, 'steel', washer=False))
        return b

    def chain_path(self):
        """The chain's centre line from the gearbox run's upper end round the rear sprocket to its lower end."""
        hub = self.hub
        xs = GB_SPROCKET[0] - 0.22
        top0 = np.array([xs, CHAIN_Y, GB_SPROCKET[2] + R_SPROCKET_F])
        bot0 = np.array([xs, CHAIN_Y, GB_SPROCKET[2] - R_SPROCKET_F])
        c = np.array([hub[0], CHAIN_Y, hub[2]])
        R = R_SPROCKET_R

        def tangent(p, upper):
            # the two tangent points from p seen from the centre: theta0 +- acos(R / |p - c|); the upper run
            # touches the higher one, the lower run the lower one
            d = p - c
            L = math.hypot(d[0], d[2])
            th0 = math.atan2(d[2], d[0])
            w = math.acos(min(1.0, R / L))
            cands = [th0 + w, th0 - w]
            zs = [math.sin(a) for a in cands]
            return cands[int(np.argmax(zs))] if upper else cands[int(np.argmin(zs))]
        a_top = tangent(top0, True)
        a_bot = tangent(bot0, False)
        # arc from the top tangent point round the back to the bottom one
        a0 = a_top
        a1 = a_bot
        if a1 < a0:
            a1 += 2 * math.pi
        arc = []
        n = 34
        for k in range(n + 1):
            a = a0 + (a1 - a0) * k / n
            arc.append(c + R * np.array([math.cos(a), 0.0, math.sin(a)]))
        arc = np.array(arc)
        upper = MK.densify(np.array([top0, arc[0]]), 0.0159)
        lower = MK.densify(np.array([arc[-1], bot0]), 0.0159)
        return np.vstack([upper[:-1], arc, lower[1:]])

    def chain(self):
        """Roller chain: alternate inner / outer link plates and rollers along the path (trim / steel)."""
        b = K.Buf()
        P = self.chain_path()
        s = np.concatenate([[0.0], np.cumsum(np.linalg.norm(np.diff(P, axis=0), axis=1))])
        pitch = 0.0159
        n = int(s[-1] / pitch)
        for k in range(n):
            p0 = np.array([np.interp(k * pitch, s, P[:, j]) for j in range(3)])
            p1 = np.array([np.interp((k + 1) * pitch, s, P[:, j]) for j in range(3)])
            d = unit(p1 - p0)
            up = unit(np.cross(d, [0, 1.0, 0]))
            R = np.stack([d, np.array([0, 1.0, 0]), up], 1)
            mid = 0.5 * (p0 + p1)
            outer = (k % 2 == 0)
            w = 0.0105 if outer else 0.0060
            b.extend(MK.box(mid, (pitch + (0.0055 if outer else 0.002), 0.0105 if outer else 0.0075, 0.0105 if outer else 0.0092), 'trim', R, 0.0, 1))
        return b

    def chain_guard(self):
        """Chain guard over the upper run: a pressed channel on two tabs off the left leg."""
        b = K.Buf()
        P = self.chain_path()
        top = P[P[:, 2] > self.hub[2] + 0.02]
        x0, x1 = -0.40, self.hub[0] - 0.035
        idx = (top[:, 0] <= x0) & (top[:, 0] >= x1)
        path = top[idx]
        if len(path) < 3:
            return b
        path = MK.densify(path[::3] if len(path) > 9 else path, 0.06) + np.array([0, 0.0, 0.016])
        prof = np.array([(-0.006, -0.009), (-0.008, 0.003), (-0.004, 0.0095), (0.010, 0.010), (0.017, 0.007), (0.019, -0.002),
                         (0.019, -0.016), (0.0175, -0.019)])
        # side, up: side = toward +Y (outboard); the channel covers the chain from above and outside
        V, N, T = K.sweep(path, np.array([0, 0, 1.0]), prof[::-1], closed=False, closed_prof=False)
        b.add(V, N, T, FR)
        V, N, T = K.sweep(path, np.array([0, 0, 1.0]), prof + np.array([0, -0.0012]), closed=False, closed_prof=False)
        b.add(V, N, T, FR)
        # tabs down to the leg
        for f in (0.2, 0.75):
            p = path[int(f * (len(path) - 1))]
            lp = self.leg_y(p[0], 1.0)
            b.extend(MK.box(np.array([p[0], lp[1] + 0.013, 0.5 * (p[2] - 0.01 + lp[2])]), (0.016, 0.004, abs(p[2] - lp[2]) + 0.006), FR, None,
                            0.0015, 1))
        return b

    def drum_plate(self):
        """Rear brake: the alloy backing plate on the right of the hub, the cam lever, the torque arm to the
        right leg and the brake rod forward to the pedal."""
        b = K.Buf()
        hub = self.hub
        c = np.array([hub[0], -0.0690, hub[2]])
        # walked with the air on the right: up the rim's outside, over it, down inside, the face inwards, the boss
        prof = [(0.0805, -0.008), (0.0805, 0.004), (0.0775, 0.0068), (0.0725, 0.0045), (0.070, 0.0015), (0.034, 0.0015),
                (0.026, 0.006), (0.0115, 0.0072)]
        b.extend(MK.lathe(prof, c, (0, -1, 0), 'alu', 30))
        # ribs
        for k in range(8):
            a = 2 * math.pi * k / 8
            p = c + np.array([0.048 * math.cos(a), -0.002, 0.048 * math.sin(a)])
            R = np.stack([np.array([math.cos(a), 0, math.sin(a)]), np.array([0, 1.0, 0]), np.array([-math.sin(a), 0, math.cos(a)])], 1)
            b.extend(MK.box(p, (0.03, 0.004, 0.004), 'alu', R, 0.0, 1))
        # cam boss at the front-top and the lever
        cam = c + np.array([0.040, -0.004, 0.042])
        b.extend(MK.tube(np.array([cam, cam + [0, -0.016, 0]]), 0.0095, 'alu', 14))
        lv0 = cam + np.array([0, -0.017, 0])
        lv1 = lv0 + np.array([0.020, -0.002, 0.070])
        R = MK.frame_axes(unit(lv1 - lv0), np.array([1.0, 0, 0]))
        b.extend(MK.box(0.5 * (lv0 + lv1), (np.linalg.norm(lv1 - lv0) + 0.014, 0.006, 0.014), 'steel', R, 0.0025, 2))
        b.extend(MK.bolt(lv0 + [0, -0.003, 0], (0, -1, 0), 0.0055, 0.004, 'steel', washer=False))
        self.rod_rear = lv1 + np.array([0.0, -0.002, -0.004])
        # rod forward to the pedal's arm (its front end sits at the pedal at rest)
        front = M.PEDAL_PIVOT + np.array([-0.006, -0.004, -0.04])
        rod = MK.bend_path([self.rod_rear + [0, -0.003, 0], (self.rod_rear[0] + 0.05, -0.128, self.rod_rear[2] - 0.016),
                            (front[0] - 0.06, -0.130, front[2] - 0.006), front], [0, 0.05, 0.05, 0])
        b.extend(MK.tube(rod, 0.0032, 'steel', 8))
        # adjuster nut (wing nut) at the lever
        b.extend(MK.box(self.rod_rear + np.array([-0.006, -0.004, 0.0]), (0.01, 0.008, 0.018), 'steel', R, 0.002, 1))
        # torque arm: flat bar from the plate's front-bottom to the leg
        ta0 = c + np.array([0.050, -0.006, -0.036])
        lp = self.leg_y(hub[0] + 0.22, -1.0)
        ta1 = np.array([hub[0] + 0.22, lp[1] - 0.004, lp[2] - 0.022])
        R = MK.frame_axes(unit(ta1 - ta0), np.array([0, 0, 1.0]))
        b.extend(MK.box(0.5 * (ta0 + ta1), (np.linalg.norm(ta1 - ta0) + 0.02, 0.005, 0.014), FR, R, 0.0022, 2))
        for p in (ta0, ta1):
            b.extend(MK.bolt(p + np.array([0, -0.003, 0]), (0, -1, 0), 0.0055, 0.0045, 'steel', washer=False))
        return b

    # ---------------------------------------------------------------- shocks
    def shock_upper(self, sg):
        """Top half of a shock (world coords at rest): eye with bush, the cap and the chrome shroud."""
        b = K.Buf()
        lo, up = shock_points(sg)
        ax = unit(up - lo)              # bottom -> top
        side = np.array([0, 1.0, 0])
        # eye: a ring across Y round the stud
        b.extend(MK.lathe(MK.round_prof([(0.0062, -0.011), (0.0145, -0.011), (0.0145, 0.011), (0.0062, 0.011)], 0.002, 2), up, side, 'trim', 18))
        b.extend(MK.tube(np.array([up + [0, -0.0115, 0], up + [0, 0.0115, 0]]), 0.0062, 'rubber', 10, cap0='open', cap1='open'))
        # cap below the eye
        cap0 = up - ax * 0.010
        b.extend(MK.lathe([(0.0, -0.024), (0.0185, -0.024), (0.0175, -0.016), (0.0125, 0.0), (0.0, 0.0)], cap0, ax, 'chrome', 22))
        # shroud: chrome can over the spring's top
        sh0 = cap0 - ax * 0.022
        L = 0.098
        prof = [(0.0296, -0.004), (0.0296, -L), (0.0316, -L), (0.0322, -L + 0.004), (0.0322, -0.004), (0.0318, 0.0), (0.0172, 0.0)]
        b.extend(MK.lathe(prof, sh0, ax, 'chrome', 30))
        # damper rod visible inside the shroud's mouth
        b.extend(MK.tube(np.array([sh0 + ax * 0.002, sh0 - ax * 0.14]), 0.0068, 'chrome', 10, cap0='flat', cap1='open'))
        return b

    def shock_lower(self, sg):
        """Bottom half: eye, damper body, the preload cam and spring seat, the chrome spring (its top runs into
        the upper half's shroud)."""
        b = K.Buf()
        lo, up = shock_points(sg)
        ax = unit(up - lo)
        side = np.array([0, 1.0, 0])
        b.extend(MK.lathe(MK.round_prof([(0.0062, -0.011), (0.0145, -0.011), (0.0145, 0.011), (0.0062, 0.011)], 0.002, 2), lo, side, 'trim', 18))
        b.extend(MK.tube(np.array([lo + [0, -0.0115, 0], lo + [0, 0.0115, 0]]), 0.0062, 'rubber', 10, cap0='open', cap1='open'))
        # damper body
        b0 = lo + ax * 0.010
        Lb = 0.175
        prof = [(0.0, 0.0), (0.0125, 0.0), (0.0175, 0.016), (0.0182, 0.024), (0.0182, Lb - 0.008), (0.0168, Lb), (0.0075, Lb + 0.004)]
        b.extend(MK.lathe(MK.round_prof(prof, 0.002, 1), b0, ax, 'trim', 18))
        # preload cam (stepped ring) and the spring's lower seat
        seat = b0 + ax * 0.030
        steps = []
        for k in range(5):
            steps += [(0.0215, 0.0 + k * 0.0), ]
        b.extend(MK.lathe([(0.0182, -0.006), (0.0245, -0.006), (0.0260, 0.0), (0.0310, 0.0), (0.0310, 0.004), (0.0182, 0.004)],
                          seat, ax, 'chrome', 20))
        for k in range(5):
            a = 2 * math.pi * k / 5
            d = np.cross(ax, side)
            d = unit(d)
            e = np.cross(ax, d)
            p = seat - ax * 0.0035 + 0.0225 * (math.cos(a) * d + math.sin(a) * e)
            b.extend(MK.box(p, (0.004, 0.004, 0.004), 'chrome', np.stack([d, e, ax], 1), 0.0, 1))
        # the spring: from the seat up past the shroud's mouth
        top = up - ax * 0.032
        h = float((top - seat) @ ax) - 0.004
        b.extend(MK.spring(seat + ax * 0.004, ax, 0.0262, h, 7.0, 0.0056, 'chrome', 6, dead=0.8))
        return b

    # ---------------------------------------------------------------- side stand
    def stand(self):
        """Side stand, deployed (foot on the ground): pivot boss, the leg, the foot pad, the tang."""
        b = K.Buf()
        piv = M.STAND_PIVOT
        foot = M.STAND_FOOT
        d = unit(foot - piv)
        ax = M.STAND_AXIS
        b.extend(MK.tube(np.array([piv - ax * 0.012, piv + ax * 0.012]), 0.011, FR, 14))
        leg = np.array([piv + d * 0.006, foot - d * 0.012])
        b.extend(MK.tube(leg, 0.0105, FR, 12, r_fn=lambda s: 1.0 - 0.18 * s, cap0='flat', cap1='flat'))
        # foot pad: a rounded plate flat on the ground
        out = MK.rounded_poly2([(-0.03, -0.018), (0.036, -0.014), (0.036, 0.014), (-0.03, 0.018)], 0.008)
        b.extend(MK.plate(out, foot + np.array([0.004, 0.0, 0.003]), (1, 0, 0), (0, 1, 0), 0.006, FR))
        # tang: a short arm off the leg for the rider's foot
        t0 = piv + d * 0.05
        t1 = t0 + np.array([-0.05, 0.035, 0.012])
        b.extend(MK.tube(np.array([t0, t1]), 0.0055, FR, 8, cap1='dome'))
        # spring hook
        b.extend(MK.tube(np.array([piv + d * 0.03, piv + d * 0.03 + np.array([-0.012, -0.012, 0.004])]), 0.003, 'steel', 6))
        return b
