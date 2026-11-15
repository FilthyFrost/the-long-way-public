"""
BODY of the moto (frames/moto.py): the tubular steel double-cradle frame and everything fixed to it — head tube,
backbone, the two main loops (down tube, cradle rail, rear upright, seat rail, rear hoop), cross tubes, rear stays,
welds and gussets, engine plates and head steady, tank mounts, the coil, battery tray, swingarm pivot bosses,
footpeg hangers with pegs and the rear brake pedal, side-stand lug, rear fender, side covers, number plate,
grab rail, passenger pegs, wiring. Built as the left half + centre pieces + asymmetric pieces; each function
returns a frames._kit.Buf in Blender coordinates (X forward, Y left, Z up).
"""
import math
import sys

sys.dont_write_bytecode = True

import numpy as np  # noqa: E402

from frames import _kit as K  # noqa: E402
from frames import _moto_kit as MK  # noqa: E402
from frames import moto as M  # noqa: E402

D = M.D
FR = 'paint_b'          # frame paint (factory: charcoal)
SY = np.array([1.0, -1.0, 1.0])
unit = K.unit


def my(P):
    return np.asarray(P, float) * SY


def both(b):
    """A left-half Buf and its mirror image."""
    out = K.Buf()
    out.extend(b)
    out.extend(b.mirrored())
    return out


class Frame:
    """The frame's centre lines (computed once) and its pieces."""

    def __init__(self):
        ctrl, radii = M.loop_ctrl()
        self.loop = MK.bend_path(ctrl, radii)
        self.rl = D['r_loop']
        self.ht = np.array([M.axis_pt(D['t_ht0']), M.axis_pt(D['t_ht1'])])
        self.ht_long = np.array([M.axis_pt(D['t_ht0'] - 0.03), M.axis_pt(D['t_ht1'] + 0.03)])
        self.bb = np.array([M.axis_pt(D['t_bb']), np.array(D['bb1'], float)])
        s = np.concatenate([[0.0], np.cumsum(np.linalg.norm(np.diff(self.loop, axis=0), axis=1))])
        self.s = s
        # landmarks on the loop
        self.s_front_corner = self.nearest_s(ctrl[3])
        self.s_rear_corner = self.nearest_s(ctrl[4])
        self.s_junction = self.nearest_s(ctrl[6])
        self.s_hoop = self.nearest_s(ctrl[7])
        self.pivot = np.array([D['pivot_x'], 0.0, D['pivot_z']])
        self.shock_up = np.array([D['shock_up'][0], D['shock_hw'], D['shock_up'][1]])
        self.boss_shock = np.array([D['shock_up'][0], 0.100, D['shock_up'][1]])

    # ---------------------------------------------------------------- path queries
    def nearest_s(self, p):
        d = np.linalg.norm(self.loop - np.asarray(p, float), axis=1)
        return float(self.s[int(np.argmin(d))])

    def at(self, s):
        return MK.point_at(self.loop, s)

    def at_z(self, z, s0, s1):
        """Point on the loop between arc lengths s0..s1 at height z."""
        m = (self.s >= s0) & (self.s <= s1)
        idx = np.nonzero(m)[0]
        zz = self.loop[idx, 2]
        k = int(np.argmin(np.abs(zz - z)))
        i = idx[k]
        # refine on the neighbouring segment
        for j in (i - 1, i):
            if 0 <= j < len(self.loop) - 1:
                a, b = self.loop[j], self.loop[j + 1]
                if (a[2] - z) * (b[2] - z) <= 0 and abs(b[2] - a[2]) > 1e-9:
                    t = (z - a[2]) / (b[2] - a[2])
                    return a + (b - a) * t, unit(b - a)
        return self.loop[i], unit(self.loop[min(i + 1, len(self.loop) - 1)] - self.loop[max(i - 1, 0)])

    def at_x(self, x, s0, s1):
        m = (self.s >= s0) & (self.s <= s1)
        idx = np.nonzero(m)[0]
        for j in idx:
            if j + 1 >= len(self.loop):
                break
            a, b = self.loop[j], self.loop[j + 1]
            if (a[0] - x) * (b[0] - x) <= 0 and abs(b[0] - a[0]) > 1e-9:
                t = (x - a[0]) / (b[0] - a[0])
                return a + (b - a) * t, unit(b - a)
        i = idx[int(np.argmin(np.abs(self.loop[idx, 0] - x)))]
        return self.loop[i], unit(self.loop[min(i + 1, len(self.loop) - 1)] - self.loop[max(i - 1, 0)])

    # ---------------------------------------------------------------- tubes
    def head_tube(self):
        """Head tube with machined bearing cups at both ends, the steering stops and the steering lock."""
        b = K.Buf()
        L = D['t_ht1'] - D['t_ht0']
        r = D['r_ht']
        prof = [(0.020, 0.0), (0.0288, 0.0), (0.0292, 0.004), (0.0288, 0.009), (r, 0.013),
                (r, L - 0.013), (0.0288, L - 0.009), (0.0292, L - 0.004), (0.0288, L), (0.020, L)]
        b.extend(MK.lathe(prof, M.axis_pt(D['t_ht0']), M.AX, FR, 20, smooth=False))
        # steering stops: two lugs on the front of the head tube's foot
        for sg in (1, -1):
            c = M.axis_pt(D['t_ht0'] + 0.022) + M.NF * 0.024 + np.array([0, sg * 0.016, 0])
            R = MK.frame_axes(M.NF, M.AX)
            b.extend(MK.box(c, (0.016, 0.012, 0.022), FR, R, 0.003, 2))
        # steering lock on the left side
        c = M.axis_pt(D['t_ht0'] + 0.075) + np.array([0.0, 0.026, 0.0])
        b.extend(MK.lathe([(0.0, 0.0), (0.0105, 0.0), (0.0105, 0.016), (0.0095, 0.0185), (0.006, 0.0195), (0.0, 0.0195)],
                          c, (0, 1, 0), 'chrome', 18, smooth=False))
        b.extend(MK.box(c + np.array([0, 0.0196, 0]), (0.0025, 0.0008, 0.009), 'trim', None, 0.0, 1))
        return b

    def backbone(self):
        b = MK.tube(self.bb, D['r_bb'], FR, 16)
        b.extend(MK.weld(self.ht_long, D['r_ht'], self.bb, D['r_bb'], at='start', bead=0.0034, mat=FR, segs=28))
        return b

    def loop_tube(self):
        """Left main loop with its weld at the head tube."""
        b = MK.tube(self.loop, self.rl, FR, 12, cap0='flat', cap1=None)
        b.extend(MK.weld(self.ht_long, D['r_ht'], self.loop, self.rl, at='start', bead=0.003, mat=FR, segs=24))
        return b

    def cross(self, p_left, r, mat=FR, weld=True, segs=10):
        """A cross tube from a point on the left loop to its mirror image, welded at both ends."""
        p = np.asarray(p_left, float)
        path = np.array([p, my(p)])
        b = MK.tube(path, r, mat, segs)
        if weld:
            b.extend(MK.weld(self.loop, self.rl, path, r, at='start', bead=0.0026, mat=mat, segs=12))
            b.extend(MK.weld(my(self.loop), self.rl, path, r, at='end', bead=0.0026, mat=mat, segs=12))
        return b

    def cross_tubes(self):
        b = K.Buf()
        # under the head tube, between the down tubes (above the exhaust's passage)
        p, _ = self.at_z(0.648, 0.0, self.s_front_corner)
        self.p_dt_cross = p
        b.extend(self.cross(p, 0.0115))
        # cradle: in front of the crankcase and under the gearbox
        p, _ = self.at_x(0.215, self.s_front_corner, self.s_rear_corner)
        self.p_cradle_f = p
        b.extend(self.cross(p, 0.012, weld=False))
        p, _ = self.at_x(-0.245, self.s_front_corner, self.s_rear_corner)
        self.p_cradle_r = p
        b.extend(self.cross(p, 0.012, weld=False))
        # seat junction (the backbone ends on it) and the rails behind the battery
        p, _ = self.at(self.s_junction - 0.004)
        p = np.array([-0.268, D['rail_hw'], 0.6795])
        self.p_junction = p
        jt = np.array([p, my(p)])
        b.extend(self.cross(p, 0.0135))
        b.extend(MK.weld(jt, 0.0135, self.bb, D['r_bb'], at='end', bead=0.003, mat=FR, segs=24))
        p, _ = self.at_x(-0.455, self.s_junction, self.s_hoop)
        self.p_rail_cross = p
        b.extend(self.cross(p, 0.0105))
        return b

    def stays(self):
        """Rear stays from the uprights above the pivot up to the shock mounts under the rails; the shock top
        bosses (stubs along Y under the rail, the shock's stud and acorn nut outboard)."""
        b = K.Buf()
        bz = self.boss_shock[2]
        bx = self.boss_shock[0]
        rail_p, _ = self.at_x(bx, self.s_junction, self.s_hoop)
        boss = np.array([[bx, D['rail_hw'] - 0.010, bz], [bx, 0.128, bz]])
        b.extend(MK.tube(boss, 0.0125, FR, 14))
        # gusset between the boss and the rail
        e1 = np.array([1.0, 0, 0])
        e2 = np.array([0, 0, 1.0])
        out = MK.rounded_poly2([(-0.03, 0.0), (0.03, 0.0), (0.012, -0.022), (-0.012, -0.022)], [0.004, 0.004, 0.006, 0.006])
        b.extend(MK.plate(out, (bx, D['rail_hw'] + 0.0, D['shock_up'][1] + 0.024), e1, e2, 0.004, FR))
        p0, _ = self.at_z(0.452, self.s_rear_corner, self.s_junction)
        stay = MK.bend_path([p0 + np.array([0.004, 0, 0]), (-0.43, 0.108, 0.545), (bx + 0.006, 0.106, bz)], [0, 0.4, 0])
        self.stay = stay
        b.extend(MK.tube(stay, 0.0115, FR, 12))
        b.extend(MK.weld(self.loop, self.rl, stay, 0.0115, at='start', bead=0.0026, mat=FR, segs=12))
        b.extend(MK.weld(boss, 0.0125, stay, 0.0115, at='end', bead=0.0026, mat=FR, segs=12))
        b.extend(MK.weld(self.loop, self.rl, boss, 0.0125, at='start', bead=0.0026, mat=FR, segs=12))
        # shock stud: from the boss end out through the eye, acorn nut and washer
        stud = np.array([[bx, 0.125, bz], [bx, D['shock_hw'] + 0.016, bz]])
        b.extend(MK.tube(stud, 0.0055, 'steel', 10))
        b.extend(MK.disc((bx, D['shock_hw'] + 0.0125, bz), (0, 1, 0), 0.012, 0.0055, 'steel', 18, thick=0.0016))
        b.extend(MK.cap_nut((bx, D['shock_hw'] + 0.0133, bz), (0, 1, 0), 0.0075, 0.010, 'chrome'))
        return b

    # ---------------------------------------------------------------- plates
    def head_gussets(self):
        """Side gussets joining the backbone and the down tube behind the head tube (left; mirrored)."""
        b = K.Buf()
        y = 0.0
        # plate in the X-Z plane at y = 0.019 (between the down tube and the backbone's flank)
        pa = M.axis_pt(D['t_bb'] + 0.03) - M.NF * 0.020
        pb = self.bb[0] + unit(self.bb[1] - self.bb[0]) * 0.13 + np.array([0, 0, -0.016])
        pc, _ = self.at_z(0.67, 0.0, self.s_front_corner)
        pd = M.axis_pt(D['t_ht0'] + 0.03) - M.NF * 0.018
        mid = 0.5 * (pb + pc) + np.array([-0.035, 0, 0.01])
        pts = [(p[0], p[2]) for p in (pa, pb, mid, pc, pd)]
        out = MK.rounded_poly2(pts, [0.008, 0.012, 0.0, 0.012, 0.008])
        # make the edge between pb and pc concave: resample the arc pb->mid->pc as a smooth curve
        b.extend(MK.plate(out, (0.0, 0.021, 0.0), (1, 0, 0), (0, 0, 1), 0.0035, FR))
        return b

    def pivot_bosses(self):
        """Swingarm pivot: a boss through each upright, the spindle's head (left) and nut (right) outboard,
        grease nipple; plates welded across the upright round the boss."""
        b = K.Buf()
        pv = self.pivot
        boss = np.array([pv + [0, 0.096, 0], pv + [0, 0.132, 0]])
        b.extend(MK.tube(boss, 0.0195, FR, 18))
        p, _ = self.at_z(pv[2], self.s_rear_corner, self.s_junction)
        out = MK.rounded_poly2([(-0.04, -0.045), (0.035, -0.04), (0.04, 0.05), (-0.032, 0.07)], [0.01, 0.012, 0.012, 0.01])
        for y in (0.0985, 0.1275):
            b.extend(MK.plate(out, (pv[0], y, pv[2]), (1, 0, 0), (0, 0, 1), 0.004, FR))
        return b

    def pivot_hardware(self):
        """Spindle head on the left, nut and thread end on the right (centre piece, not mirrored)."""
        b = K.Buf()
        pv = self.pivot
        b.extend(MK.bolt(pv + [0, 0.132, 0], (0, 1, 0), 0.0105, 0.0075, 'steel', washer=True))
        b.extend(MK.bolt(pv + [0, -0.132, 0], (0, -1, 0), 0.0105, 0.0085, 'steel', washer=True, nut=True))
        b.extend(MK.lathe([(0.0, 0.0), (0.005, 0.0), (0.005, 0.006), (0.0, 0.009)], pv + [0.0, 0.0, 0.021], (0, 0, 1), 'steel', 8))
        return b

    def engine_plates(self):
        """Front plates (down tube to the engine's front lug), rear plates (upright over the gearbox to the
        crankcase's rear lug), through-bolts with nuts; the head steady from the backbone to the head."""
        b = K.Buf()
        E = M.ENGINE
        lug_f = E + np.array([0.125, 0.0, 0.06])
        lug_r = E + np.array([-0.16, 0.0, 0.18])
        e1 = np.array([1.0, 0, 0])
        e2 = np.array([0, 0, 1.0])
        # front: a plate on each side from the down tube to the lug
        pt_hi, _ = self.at_z(lug_f[2] + 0.055, 0.0, self.s_front_corner)
        pt_lo, _ = self.at_z(lug_f[2] - 0.035, 0.0, self.s_front_corner + 0.03)
        outline = [(pt_hi[0] + 0.006, pt_hi[2] + 0.012), (lug_f[0] - 0.012, lug_f[2] + 0.024), (lug_f[0] - 0.026, lug_f[2]),
                   (lug_f[0] - 0.012, lug_f[2] - 0.024), (pt_lo[0] + 0.004, pt_lo[2] - 0.012)]
        out = MK.rounded_poly2(outline, [0.006, 0.016, 0.016, 0.016, 0.006])
        hole = MK.circle2((lug_f[0], lug_f[2]), 0.0085, 16)
        y = 0.0675
        b.extend(MK.plate(out, (0.0, y, 0.0), e1, e2, 0.005, FR, holes=[hole]))
        b.extend(MK.bolt((lug_f[0], y + 0.0025, lug_f[2]), (0, 1, 0), 0.0075, 0.0055, 'steel'))
        # rear plates: from the upright above the gearbox forward to the crankcase's rear lug
        pu_hi, _ = self.at_z(0.478, self.s_rear_corner, self.s_junction)
        pu_lo, _ = self.at_z(0.418, self.s_rear_corner, self.s_junction)
        outline = [(pu_lo[0] + 0.004, pu_lo[2] - 0.006), (pu_hi[0] + 0.004, pu_hi[2] + 0.008), (lug_r[0] - 0.02, lug_r[2] + 0.024),
                   (lug_r[0] + 0.022, lug_r[2]), (lug_r[0] - 0.02, lug_r[2] - 0.02)]
        out = MK.rounded_poly2(outline, [0.006, 0.006, 0.016, 0.018, 0.012])
        hole = MK.circle2((lug_r[0], lug_r[2]), 0.0085, 16)
        y = 0.0845
        b.extend(MK.plate(out, (0.0, y, 0.0), e1, e2, 0.005, FR, holes=[hole]))
        b.extend(MK.bolt((lug_r[0], y + 0.0025, lug_r[2]), (0, 1, 0), 0.0075, 0.0055, 'steel'))
        return b

    def engine_bolts_centre(self):
        """Through-bolt threads and nuts on the right side ends (centre / right pieces)."""
        b = K.Buf()
        E = M.ENGINE
        for lug, y in ((E + np.array([0.125, 0.0, 0.06]), 0.0675), (E + np.array([-0.16, 0.0, 0.18]), 0.0845)):
            b.extend(MK.bolt((lug[0], -y - 0.0025, lug[2]), (0, -1, 0), 0.0075, 0.0065, 'steel', nut=True))
            b.extend(MK.tube(np.array([(lug[0], -y, lug[2]), (lug[0], y, lug[2])]), 0.0045, 'steel', 8))
        # head steady: a strap from a lug under the backbone down to the head, between the rocker caps
        top = E + np.array([0.074, 0.0, 0.42])
        bbd = unit(self.bb[1] - self.bb[0])
        t = (top[0] - self.bb[0][0]) / bbd[0]
        bp = self.bb[0] + bbd * t
        R = MK.frame_axes(np.array([0, 1.0, 0]), np.array([0, 0, 1.0]))
        h = bp[2] - D['r_bb'] + 0.004 - (top[2] + 0.026)
        c = np.array([top[0], 0.0, top[2] + 0.026 + h / 2])
        b.extend(MK.box(c, (0.022, 0.016, h), FR, None, 0.003, 2))
        b.extend(MK.bolt((top[0] + 0.011, 0.0, top[2] + 0.034), (1, 0, 0), 0.006, 0.004, 'steel'))
        return b

    def tank_mounts(self, tank_m):
        """Front spigot through the backbone for the tank's rubbers, the rear tab with a rubber pad and bolt."""
        b = K.Buf()
        loc, R = tank_m
        p = loc + R @ np.array([0.18, 0.0, 0.03])
        b.extend(MK.tube(np.array([p + [0, -0.058, 0], p + [0, 0.058, 0]]), 0.006, 'steel', 10))
        bbd = unit(self.bb[1] - self.bb[0])
        pr = loc + R @ np.array([-0.222, 0.0, 0.03])
        # tab on the backbone's top under the tank's rear
        up = unit(np.cross(bbd, [0, 1.0, 0]))
        if up[2] < 0:
            up = -up
        out = MK.rounded_poly2([(-0.018, -0.018), (0.018, -0.018), (0.014, 0.012), (-0.014, 0.012)], [0.003, 0.003, 0.006, 0.006])
        b.extend(MK.plate(out, pr - up * 0.012, bbd, up, 0.004, FR))
        return b

    def battery_tray(self):
        """A tray between the uprights under the battery, its rubber strap and the hooks."""
        b = K.Buf()
        bx, _, bz = D['battery']
        L, W = 0.168, 0.108
        out = MK.rounded_poly2([(-L / 2, -W / 2), (L / 2, -W / 2), (L / 2, W / 2), (-L / 2, W / 2)], 0.012)
        b.extend(MK.plate(out, (bx, 0.0, bz - 0.0025), (1, 0, 0), (0, 1, 0), 0.005, FR, flat=True))
        # lips
        for sg in (1, -1):
            b.extend(MK.box((bx, sg * (W / 2 - 0.002), bz + 0.008), (L - 0.02, 0.004, 0.02), FR, None, 0.0, 1))
        b.extend(MK.box((bx + L / 2 - 0.002, 0.0, bz + 0.008), (0.004, W - 0.02, 0.02), FR, None, 0.0, 1))
        # strap over the battery (the battery is 0.136 tall)
        top = bz + 0.137
        strap = [(bx - 0.03, W / 2 - 0.004, bz + 0.01), (bx - 0.03, W / 2 + 0.0015, top - 0.006), (bx - 0.03, W / 2 - 0.004, top + 0.0015),
                 (bx - 0.03, -W / 2 + 0.004, top + 0.0015), (bx - 0.03, -W / 2 - 0.0015, top - 0.006), (bx - 0.03, -W / 2 + 0.004, bz + 0.01)]
        path = MK.bend_path(strap, [0, 0.004, 0.006, 0.006, 0.004, 0])
        prof = np.array([(-0.011, -0.0015), (0.011, -0.0015), (0.011, 0.0015), (-0.011, 0.0015)])
        V, N, T = K.sweep(path, np.array([1.0, 0, 0]), prof, closed=False, closed_prof=True)
        b.add(V, N, T, 'rubber')
        # tray arms to the uprights
        for sg in (1, -1):
            p, _ = self.at_z(bz - 0.01, self.s_rear_corner, self.s_junction)
            arm = np.array([[bx + L / 2 - 0.02, sg * 0.03, bz - 0.006], [p[0], sg * 0.03, bz - 0.006], [p[0], sg * (p[1] - 0.004), bz - 0.006]])
            b.extend(MK.tube(MK.bend_path(arm, [0, 0.01, 0]), 0.0055, FR, 8))
        return b

    def coil(self):
        """Ignition coil on a strap bracket beside the air filter, its HT tower at the front (the engine's plug
        lead ends there) and the low-tension wires."""
        b = K.Buf()
        E = M.ENGINE
        lead_end = E + np.array([-0.13, -0.065, 0.33])
        c0 = np.array([lead_end[0] + 0.03, -0.070, lead_end[2] + 0.034])
        c1 = c0 + np.array([-0.105, 0.0, 0.004])
        prof = [(0.0, 0.0), (0.017, 0.0), (0.0205, 0.004), (0.0205, 0.10), (0.017, 0.105), (0.0, 0.105)]
        ax = unit(c1 - c0)
        b.extend(MK.lathe(MK.round_prof(prof, 0.002, 2), c0, ax, 'trim', 18))
        # HT tower and boot
        b.extend(MK.lathe([(0.0, 0.0), (0.009, 0.0), (0.0075, 0.018), (0.0045, 0.022), (0.0, 0.022)], c0 + ax * 0.012 + np.array([0, 0, -0.018]), (0, 0, -1), 'rubber', 12))
        # clamp strap and the bracket up to the backbone
        for k in (0.03, 0.075):
            p = c0 + ax * k
            b.extend(MK.lathe([(0.0212, -0.006), (0.0225, -0.0055), (0.0225, 0.0055), (0.0212, 0.006)], p, ax, 'steel', 18))
        bbd = unit(self.bb[1] - self.bb[0])
        pm = c0 + ax * 0.052
        t = (pm[0] - self.bb[0][0]) / bbd[0]
        bp = self.bb[0] + bbd * t
        br = MK.bend_path([pm + [0, 0.012, 0.012], pm + [0, 0.026, 0.040], bp + [0, -0.010, -0.018]], [0, 0.02, 0])
        prof = np.array([(-0.007, -0.0012), (0.007, -0.0012), (0.007, 0.0012), (-0.007, 0.0012)])
        V, N, T = K.sweep(br, np.array([1.0, 0, 0]), prof, closed=False, closed_prof=True)
        b.add(V, N, T, FR)
        # low-tension leads back to the loom
        cab, _ = MK.cable([c1 + [0.0, 0.006, 0.008], c1 + [-0.02, 0.02, 0.02], bp + [-0.10, -0.012, -0.03]], 0.0022, 'trim', 6)
        b.extend(cab)
        return b

    def loom(self):
        """Main wiring loom along the underside of the backbone, from the head tube to the battery, with clips."""
        b = K.Buf()
        bbd = unit(self.bb[1] - self.bb[0])
        dn = unit(np.cross([0, 1.0, 0], bbd))
        if dn[2] > 0:
            dn = -dn
        p0 = self.bb[0] + bbd * 0.07 + dn * (D['r_bb'] + 0.0065)
        p1 = self.bb[1] - bbd * 0.06 + dn * (D['r_bb'] + 0.0065)
        bx, _, bz = D['battery']
        pts = [M.axis_pt(D['t_ht0'] + 0.05) - M.NF * 0.034 + np.array([0, 0.01, 0]), p0 + [0, 0.006, 0], p1 + [0, 0.006, 0],
               (bx + 0.07, 0.035, bz + 0.15), (bx + 0.03, 0.03, bz + 0.12)]
        cab, path = MK.cable(pts, 0.0062, 'trim', 8, [0, 0.05, 0.06, 0.03, 0])
        b.extend(cab)
        for f in (0.25, 0.5, 0.75):
            p, t = MK.point_at(path, MK.path_length(path) * f)
            b.extend(MK.lathe([(0.0068, -0.003), (0.0078, -0.0025), (0.0078, 0.0025), (0.0068, 0.003)], p, t, 'steel', 12))
        return b

    def side_stand_lug(self):
        """Lug under the left cradle rail where the stand pivots; the spring post."""
        b = K.Buf()
        piv = M.STAND_PIVOT
        p, _ = self.at_x(piv[0], self.s_front_corner, self.s_rear_corner)
        e1 = np.array([1.0, 0, 0])
        e2 = np.array([0, 0, 1.0])
        out = MK.rounded_poly2([(-0.03, p[2] - piv[2] + 0.01), (0.03, p[2] - piv[2] + 0.01), (0.022, -0.012), (-0.022, -0.012)],
                               [0.004, 0.004, 0.012, 0.012])
        out = out + np.array([piv[0], piv[2]])
        for y in (piv[1] - 0.016, piv[1] + 0.016):
            b.extend(MK.plate(out, (0.0, y, 0.0), e1, e2, 0.004, FR))
        b.extend(MK.tube(np.array([piv + [0, -0.02, 0], piv + [0, 0.02, 0]]), 0.006, 'steel', 10))
        b.extend(MK.bolt(piv + [0, 0.018, 0], (0, 1, 0), 0.0075, 0.005, 'steel', washer=False))
        # spring post
        sp = p + np.array([-0.06, 0.0, -0.016])
        b.extend(MK.tube(np.array([sp + [0, 0.004, 0], sp + [0, 0.022, -0.004]]), 0.0035, 'steel', 8))
        return b

    def footpeg_hangers(self):
        """Hanger plates bolted to the pivot bosses and the cradle's rear corner, carrying the footpeg clevis at
        the front (left half; the right one is mirrored, the pedal and shift pivots are added separately)."""
        b = K.Buf()
        pv = self.pivot
        peg = M.PEG
        pc, _ = self.at_x(-0.245, self.s_front_corner, self.s_rear_corner)
        y = 0.1345
        out = [(pv[0] - 0.026, pv[2] + 0.022), (pv[0] + 0.012, pv[2] + 0.03), (peg[0] - 0.02, peg[2] + 0.026),
               (peg[0] + 0.028, peg[2] + 0.012), (peg[0] + 0.022, peg[2] - 0.024), (pc[0] + 0.015, pc[2] - 0.02),
               (pv[0] - 0.024, pv[2] - 0.026)]
        o2 = MK.rounded_poly2([(p[0], p[1]) for p in out], [0.024, 0.06, 0.02, 0.012, 0.012, 0.03, 0.022])
        holes = [MK.circle2((pv[0], pv[2]), 0.0068, 14)]
        # lightening hole in the middle
        holes.append(MK.slot2(((pv[0] + peg[0]) * 0.5 + 0.03, pv[2] - 0.0), ((pv[0] + peg[0]) * 0.5 - 0.035, pv[2] + 0.004), 0.011, 6))
        b.extend(MK.plate(o2, (0.0, y, 0.0), (1, 0, 0), (0, 0, 1), 0.006, FR, holes=holes))
        # the strut from the cradle's rear corner up to the hanger
        p0 = pc + np.array([0.0, 0.0, -0.002])
        strut = np.array([p0, p0 + [0.002, 0.03, 0.018], (pc[0] + 0.012, y - 0.003, pc[2] + 0.02)])
        b.extend(MK.tube(MK.bend_path(strut, [0, 0.02, 0]), 0.0065, FR, 10))
        # footpeg clevis and folding peg (steel core, ribbed rubber)
        b.extend(MK.box((peg[0], y + 0.010, peg[2]), (0.03, 0.014, 0.026), FR, None, 0.004, 2))
        b.extend(MK.tube(np.array([(peg[0], y + 0.004, peg[2] + 0.012), (peg[0], y + 0.016, peg[2] + 0.012)]), 0.004, 'steel', 8))
        y0 = y + 0.018
        y1 = 0.262
        prof = [(0.0, 0.0), (0.0115, 0.0), (0.0135, 0.004)]
        n = 6
        for k in range(n):
            h0 = 0.008 + k * (y1 - y0 - 0.016) / n
            prof += [(0.0165, h0 + 0.003), (0.0150, h0 + 0.0115)]
        prof += [(0.0165, y1 - y0 - 0.006), (0.0145, y1 - y0), (0.0, y1 - y0)]
        b.extend(MK.lathe(prof, (peg[0], y0, peg[2]), (0, 1, 0), 'rubber', 12))
        b.extend(MK.tube(np.array([(peg[0], y0 - 0.006, peg[2]), (peg[0], y0 + 0.004, peg[2])]), 0.0105, 'steel', 12))
        return b

    def brake_pedal(self):
        """Rear brake pedal on the right hanger: pivot boss, the arm forward to the pad, the short arm down for
        the rod, the return spring and the brake-light switch."""
        b = K.Buf()
        pv = M.PEDAL_PIVOT
        y = pv[1]
        b.extend(MK.tube(np.array([pv + [0, 0.004, 0], pv + [0, -0.016, 0]]), 0.0105, 'steel', 14))
        b.extend(MK.bolt(pv + [0, -0.016, 0], (0, -1, 0), 0.0065, 0.005, 'steel'))
        arm = MK.bend_path([pv + [0, -0.008, 0], pv + [0.06, -0.012, -0.016], pv + [0.12, -0.022, -0.026], pv + [0.148, -0.03, -0.03]],
                           [0, 0.05, 0.05, 0])
        prof = np.array([(-0.0035, -0.0075), (0.0035, -0.0075), (0.0035, 0.0075), (-0.0035, 0.0075)])
        prof = MK.round_prof(np.vstack([prof, prof[:1]]), 0.002, 2)[:-1]
        V, N, T = K.sweep(arm, np.array([0, 0, 1.0]), prof, closed=False, closed_prof=True)
        b.add(V, N, T, 'steel')
        pad = pv + np.array([0.15, -0.038, -0.031])
        b.extend(MK.lathe(MK.round_prof([(0.0, -0.018), (0.016, -0.018), (0.016, 0.018), (0.0, 0.018)], 0.004, 2), pad, (0, 1, 0), 'rubber', 14))
        # lever arm down for the rod
        la = np.array([pv + [0, -0.004, 0], pv + [-0.006, -0.004, -0.04]])
        b.extend(MK.tube(la, 0.0045, 'steel', 8))
        self.rod_front = pv + np.array([-0.006, -0.004, -0.04])
        # return spring to the hanger
        b.extend(MK.spring(pv + np.array([-0.006, 0.0, -0.022]), unit(np.array([-1.0, 0.0, -0.5])), 0.0032, 0.03, 6, 0.0009, 'steel', 4))
        return b

    def shift_boss(self):
        """Left: the boss of the gear pedal's pivot (gl_foot mounts here)."""
        b = K.Buf()
        p = M.SHIFT_PIVOT
        b.extend(MK.tube(np.array([p + [0, -0.012, 0], p + [0, 0.0, 0]]), 0.0105, FR, 14))
        b.extend(MK.disc(p + [0, 0.0006, 0], (0, 1, 0), 0.0105, 0.0045, 'steel', 18, thick=0.0012))
        return b

    # ---------------------------------------------------------------- sheet metal
    def rear_fender(self):
        """Rear fender (paint): a U section swept round the rear hub from under the seat to behind the wheel,
        rolled edges, a centre rib; mounting tabs to the rail cross tube and the hoop."""
        b = K.Buf()
        R0 = 0.356
        hub = M.HUB_R
        th0, th1 = -38.0, 92.0
        n = 22
        th = np.radians(np.linspace(th0, th1, n))
        radial = np.stack([-np.sin(th), np.zeros(n), np.cos(th)], 1)
        path = hub + radial * R0
        w = 0.074
        # section: (side, up) with up = radial outward; outer surface y -> h(y)
        ys = np.concatenate([np.linspace(-w, w, 9)])
        prof_out = []
        for yv in ys:
            u = yv / w
            hh = 0.010 * (1 - u * u) + 0.0018 * math.exp(-(yv / 0.006) ** 2)
            prof_out.append((yv, hh))
        skirt = 0.030
        left = [(w + 0.0012, -0.003), (w + 0.0016, -skirt * 0.5), (w + 0.0012, -skirt)]
        prof = ([(-p[0], p[1]) for p in left[::-1]] + prof_out + left)
        prof = np.array(prof)
        # outer surface and the inner one (offset by the sheet), joined at the rolled skirt edges
        V, N, T = K.sweep(path, radial, prof, closed=False, closed_prof=False)
        b.add(V, N, T, 'paint')
        inner = prof[::2].copy()
        inner[:, 1] -= 0.0018
        inner[:, 0] *= (w - 0.0014) / w
        V2, N2, T2 = K.sweep(path, radial, inner[::-1], closed=False, closed_prof=False)
        b.add(V2, N2, T2, 'paint')
        # rolled bead along each skirt edge
        for sg in (1, -1):
            edge = path + radial * (-skirt - 0.0005) + np.array([0, sg * (w + 0.0006), 0])
            b.extend(MK.tube(edge, 0.0016, 'paint', 4, cap0='flat', cap1='flat'))
        # end lips (front and rear)
        for k in (0, n - 1):
            ring = np.array([path[k] + radial[k] * p[1] + np.array([0, p[0], 0]) for p in prof])
            ring2 = np.array([path[k] + radial[k] * p[1] + np.array([0, p[0], 0]) for p in inner[::-1]])
            loop3 = np.vstack([ring, ring2])
            tdir = unit(path[min(k + 1, n - 1)] - path[max(k - 1, 0)]) * (1 if k == n - 1 else -1)
            b.extend(K.fill_loop(loop3, tdir, 'paint'))
        self.fender_path = path
        self.fender_radial = radial
        return b

    def fender_mounts(self):
        """Tabs from the fender to the rail cross tube and to the hoop (left half; mirrored)."""
        b = K.Buf()
        pr = self.p_rail_cross
        # strap from the cross tube down to the fender's crown on each side
        hub = M.HUB_R
        for x in (pr[0] + 0.01,):
            dz = math.sqrt(max(0.356 ** 2 - (x - hub[0]) ** 2, 0.0))
            fz = hub[2] + dz + 0.010
            out = MK.rounded_poly2([(-0.012, fz - pr[2]), (0.012, fz - pr[2]), (0.008, 0.01), (-0.008, 0.01)], [0.003, 0.003, 0.004, 0.004])
            out = out + np.array([x, pr[2]])
            b.extend(MK.plate(out, (0.0, 0.045, 0.0), (1, 0, 0), (0, 0, 1), 0.004, FR))
        return b

    def side_cover(self):
        """Left side cover (paint): a pressed panel over the battery between the upright and the seat rail, on
        rubber grommets; a fictional swallow emblem in chrome."""
        b = K.Buf()
        out = [(-0.238, 0.668), (-0.505, 0.668), (-0.492, 0.548), (-0.43, 0.505), (-0.318, 0.498), (-0.265, 0.535)]
        o2 = MK.rounded_poly2(out, [0.02, 0.03, 0.04, 0.05, 0.04, 0.03])
        y = 0.124
        b.extend(MK.panel(o2, (0.0, y, 0.0), (1, 0, 0), (0, 0, 1), 'paint', bulge=0.014, width=0.035, thick=0.006, r_edge=0.004, spacing=0.019,
                          segs=1))
        # emblem: a small chrome swallow (two swept wings and a forked tail), slightly proud of the panel
        cx, cz = -0.392, 0.598
        wing = np.array([(0.0, 0.0), (0.03, 0.012), (0.052, 0.02), (0.034, 0.006), (0.012, -0.004), (-0.012, -0.004), (-0.034, 0.006),
                         (-0.052, 0.02), (-0.03, 0.012)])
        body = np.array([(0.0, 0.012), (0.006, 0.004), (0.004, -0.012), (0.012, -0.03), (0.0, -0.02), (-0.012, -0.03), (-0.004, -0.012), (-0.006, 0.004)])
        for shp in (wing, body):
            s2 = K.ccw(shp * 0.85 + np.array([cx, cz]))
            b.extend(MK.plate(s2, (0.0, y + 0.0155, 0.0), (1, 0, 0), (0, 0, 1), 0.0016, 'chrome', r_edge=0.0006, segs=1))
        return b

    def number_plate(self):
        """Number plate bracket off the fender's tail, a blank plate with a rolled rim, two bolts."""
        b = K.Buf()
        k = len(self.fender_path) - 6
        p = self.fender_path[k]
        rad = self.fender_radial[k]
        c = p + rad * 0.012 + np.array([-0.012, 0.0, 0.055])
        tilt = math.radians(8.0)
        nrm = np.array([-math.cos(tilt), 0.0, math.sin(tilt)])
        e1 = np.array([0, 1.0, 0])
        e2 = unit(np.cross(nrm, e1))
        e2 = e2 if e2[2] > 0 else -e2
        W, H = 0.17, 0.105
        out = MK.rounded_poly2([(-W / 2, -H / 2), (W / 2, -H / 2), (W / 2, H / 2), (-W / 2, H / 2)], 0.008)
        b.extend(MK.plate(out, c, e1, e2, 0.0015, 'alu', flat=True))
        rim = MK.rounded_poly2([(-W / 2 - 0.003, -H / 2 - 0.003), (W / 2 + 0.003, -H / 2 - 0.003), (W / 2 + 0.003, H / 2 + 0.003),
                                (-W / 2 - 0.003, H / 2 + 0.003)], 0.01)
        inner = rim * ((W - 0.004) / (W + 0.006))
        b.extend(MK.plate(rim, c + nrm * 0.0008, e1, e2, 0.003, 'paint_b', holes=[inner], flat=True))
        for sx in (-1, 1):
            b.extend(MK.bolt(c + e1 * sx * (W / 2 - 0.016) + e2 * (H / 2 - 0.014) - nrm * 0.0, nrm * -1 * -1, 0.0045, 0.003, 'chrome', washer=False))
        # bracket from the fender to the plate
        bc = c + e2 * (H / 2 + 0.004) - nrm * 0.004
        b.extend(MK.box(bc + np.array([0.012, 0, 0.002]), (0.05, 0.06, 0.004), FR, None, 0.0015, 1))
        return b, c, nrm, e2

    def taillight_bracket(self, tl_loc):
        """Bracket on the fender holding the tail lamp's stalk."""
        b = K.Buf()
        face = np.asarray(tl_loc, float) + np.array([0.03, 0.0, 0.0])
        out = MK.rounded_poly2([(-0.022, -0.02), (0.022, -0.02), (0.022, 0.014), (-0.022, 0.014)], [0.006, 0.006, 0.01, 0.01])
        b.extend(MK.plate(out, face + [0.002, 0, 0], (0, 1.0, 0), (0, 0, 1.0), 0.004, FR))
        # gusset down to the fender
        hub = M.HUB_R
        d = face - hub
        dz = math.sqrt(max(0.358 ** 2 - d[0] ** 2, 0.0))
        fz = hub[2] + dz
        h = face[2] - 0.02 - fz
        if h > 0.004:
            b.extend(MK.box((face[0] + 0.012, 0.0, fz + h / 2), (0.024, 0.03, h + 0.006), FR, None, 0.002, 1))
        return b

    def grab_rail(self):
        """Chrome grab rail round the back of the saddle, on two posts each side."""
        b = K.Buf()
        z = 0.703
        y = 0.148
        pts = [(-0.585, y - 0.012, z - 0.004), (-0.70, y, z), (-0.86, y - 0.006, z + 0.004), (-0.905, 0.0, z + 0.006)]
        path = MK.bend_path(pts, [0, 0.2, 0.08, 0])
        rail = np.vstack([path, my(path[::-1])[1:]])
        b.extend(MK.tube(rail, 0.0105, 'chrome', 10, cap0='flat', cap1='flat'))
        for x in (-0.598, -0.80):
            p = path[int(np.argmin(np.abs(path[:, 0] - x)))]
            for sg in (1, -1):
                q = p * np.array([1, sg, 1])
                foot = np.array([q[0], sg * (D['rail_hw'] + 0.012), 0.6875 + 0.002])
                post = MK.bend_path([q, (q[0], sg * (abs(q[1]) - 0.02), q[2] - 0.006), foot], [0, 0.012, 0])
                b.extend(MK.tube(post, 0.0075, 'chrome', 8))
                b.extend(MK.bolt(foot + [0, 0, 0.0], (0, 0, 1), 0.0055, 0.004, 'chrome', washer=False))
        return b

    def passenger_pegs(self):
        """Folding passenger pegs on brackets hanging from the rear stays (left; mirrored)."""
        b = K.Buf()
        st = self.stay
        p = st[int(np.argmin(np.abs(st[:, 0] - M.PEG_P[0])))]
        peg = M.PEG_P
        br = MK.bend_path([p + [0.0, 0.0, 0.0], p + [0.0, 0.016, -0.02], (peg[0], 0.132, peg[2] + 0.004)], [0, 0.01, 0])
        b.extend(MK.tube(br, 0.0075, FR, 10))
        b.extend(MK.box((peg[0], 0.138, peg[2]), (0.026, 0.012, 0.022), FR, None, 0.004, 2))
        y0, y1 = 0.146, 0.232
        prof = [(0.0, 0.0), (0.0105, 0.0), (0.0125, 0.004)]
        for k in range(4):
            h0 = 0.008 + k * (y1 - y0 - 0.016) / 4
            prof += [(0.0145, h0 + 0.003), (0.0132, h0 + 0.012)]
        prof += [(0.0145, y1 - y0 - 0.006), (0.0125, y1 - y0), (0.0, y1 - y0)]
        b.extend(MK.lathe(prof, (peg[0], y0, peg[2]), (0, 1, 0), 'rubber', 12))
        return b

    def turn_signals_rear(self):
        """Rear indicators on chrome stalks from the rear stays' ends (amber lenses)."""
        b = K.Buf()
        base = np.array([-0.79, 0.105, 0.655])
        tip = np.array([-0.83, 0.205, 0.66])
        b.extend(MK.tube(np.array([base, tip]), 0.0065, 'chrome', 10))
        c = tip + np.array([-0.012, 0.0, 0.0])
        b.extend(MK.lathe(MK.round_prof([(0.0, -0.03), (0.022, -0.03), (0.026, -0.012), (0.026, 0.0)], 0.004, 2), c, (1, 0, 0), 'chrome', 18))
        b.extend(MK.lathe([(0.026, 0.0), (0.025, 0.006), (0.018, 0.016), (0.0, 0.02)], c + [-0.0, 0, 0], (-1, 0, 0), 'lens_amber', 18))
        for sg in (1, -1):
            M.LAMPS.append((c * np.array([1, sg, 1]) - np.array([0.01, 0, 0]), np.array([-1.0, 0, 0]), 0.026))
        return b
