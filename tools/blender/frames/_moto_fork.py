"""
FORK of the moto (frames/moto.py): everything that steers. Upper part (object FORK, origin on the steering axis
at the top of the steering head, axes = the frame's): top and lower triple clamps, steering stem and bearings,
painted fork shrouds with the headlight ears, chrome stanchions, front indicators, the instrument binnacle
(speedometer + tachometer with needles N_speed / N_rpm, the warning lamps, the ignition's console), the horn tab,
the cables' upper runs. Lower part (FORK_LOWER, a child of FORK, origin on the front axle; it slides along the
fork tubes with the front suspension): sliders with the axle clamps, the front fender and its stays, the brake
disc and caliper, the brake hose, the speedometer drive and the lower run of its cable.
"""
import math
import sys

sys.dont_write_bytecode = True

import numpy as np  # noqa: E402

from frames import _kit as K  # noqa: E402
from frames import _moto_kit as MK  # noqa: E402
from frames import moto as M  # noqa: E402

D = M.D
unit = K.unit
SY = np.array([1.0, -1.0, 1.0])
RF = M.fork_frame()            # columns: X (perpendicular forward), Y, Z (steering axis)


def L2W(p):
    """Fork-frame point (relative to the steering axis' ground point, X perpendicular forward, Z along the
    axis) -> Blender world."""
    return M.G + RF @ np.asarray(p, float)


def clamp_outline(r_boss, r_stem, front=0.0, n=360, step=0.0110):
    """Triple-clamp plan (fork frame x forward, y left): a boss round each stanchion and one round the stem,
    joined by a web whose front edge runs straight between the bosses (front > 0 pushes the middle forwards);
    concave fillets where they meet. Traced from a 2D distance field, resampled at `step`."""
    off = D['clamp_off']
    hw = D['fork_hw']

    def smin(a, b, k):
        h = np.clip(0.5 + 0.5 * (b - a) / k, 0.0, 1.0)
        return b + (a - b) * h - k * h * (1.0 - h)

    def f(P):
        d1 = np.linalg.norm(P - [off, hw], axis=1) - r_boss
        d2 = np.linalg.norm(P - [off, -hw], axis=1) - r_boss
        d3 = np.linalg.norm(P, axis=1) - r_stem
        x0, x1 = 0.0, off + r_boss * 0.80 + front
        q = np.abs(P - [(x0 + x1) / 2, 0.0]) - [(x1 - x0) / 2, hw]
        d4 = np.linalg.norm(np.maximum(q, 0.0), axis=1) + np.minimum(np.max(q, axis=1), 0.0)
        return smin(smin(smin(d1, d2, 0.004), d4, 0.012), d3, 0.018)

    c = np.array([off * 0.5, 0.0])
    ang = np.linspace(0, 2 * math.pi, n, endpoint=False)
    dirs = np.stack([np.cos(ang), np.sin(ang)], 1)
    lo = np.zeros(n)
    hi = np.full(n, 0.25)
    for _ in range(44):
        mid = 0.5 * (lo + hi)
        inside = f(c + dirs * mid[:, None]) < 0
        lo = np.where(inside, mid, lo)
        hi = np.where(inside, hi, mid)
    P = c + dirs * lo[:, None]
    return K.ccw(K.resample(P, step, True))


class Fork:
    def __init__(self):
        self.t_ax, self.lead = M.axle_offset()
        self.hub = M.HUB_F
        self.off = D['clamp_off']
        self.hw = D['fork_hw']

    def tube_axis(self, side):
        return lambda t: M.tube_pt(t, side)

    # ---------------------------------------------------------------- clamps and stem
    def clamp(self, t0, h, r_boss, r_stem, mat='alu', front=0.0, top=True):
        """A triple clamp as a plate perpendicular to the steering axis (t0 = bottom face), holes for the
        stanchions and the stem, pinch slots with bolts at the front of each boss."""
        b = K.Buf()
        out = clamp_outline(r_boss, r_stem, front)
        holes = []
        for sg in (1, -1):
            holes.append(MK.circle2((self.off, sg * self.hw), D['r_stanchion'] + 0.0004, 14))
        holes.append(MK.circle2((0.0, 0.0), 0.0122, 10))
        O = M.axis_pt(t0 + h / 2)
        b.extend(MK.plate(out, O, M.NF, (0, 1.0, 0), h, mat, holes=holes, r_edge=0.0035, segs=1))
        # pinch bolts across the slot at the front of each boss (head outboard, nut inboard)
        for sg in (1, -1):
            c = L2W((self.off + D['r_stanchion'] + 0.010, sg * self.hw, t0 + h / 2))
            b.extend(MK.box(c, (0.006, 0.0018, h * 0.98), 'trim', MK.frame_axes(M.NF, M.AX), 0.0, 1))
            ax = np.array([0, sg, 0])
            b.extend(MK.bolt(c + ax * 0.024, ax, 0.0055, 0.0045, 'steel', washer=False))
            b.extend(MK.bolt(c - ax * 0.024, -ax, 0.0055, 0.0045, 'steel', washer=False))
        return b

    def upper(self):
        """FORK's own geometry (world coordinates; the caller sets the origin)."""
        b = K.Buf()
        t_top = D['t_top']
        tc = D['t_tc']
        # top clamp (the stock bar's yoke sits on its top face)
        b.extend(self.clamp(t_top - tc, tc, 0.0305, 0.026, 'alu', front=0.012))
        # fork tube top plugs, flush (the bar's chrome caps sit above them)
        for sg in (1, -1):
            c = M.tube_pt(t_top - 0.0015, sg)
            b.extend(MK.disc(c, M.AX, D['r_stanchion'] - 0.0015, 0.0, 'chrome', 20, thick=0.0025, edge=0.0006))
            b.extend(MK.disc(c + M.AX * 0.00135, M.AX, 0.006, 0.0, 'trim', 6))
        # stem nut, recessed
        b.extend(MK.bolt(M.axis_pt(t_top - 0.006), M.AX, 0.0145, 0.0055, 'chrome', washer=False))
        # lower clamp with its stem boss underneath
        t_lc = D['t_lc']
        b.extend(self.clamp(t_lc, D['t_lc_h'], 0.0315, 0.027, 'alu', front=0.004))
        b.extend(MK.lathe(MK.round_prof([(0.0, 0.0), (0.020, 0.0), (0.026, 0.012), (0.026, 0.02)], 0.003, 2),
                          M.axis_pt(t_lc - 0.02), M.AX, 'alu', 20))
        b.extend(MK.bolt(M.axis_pt(t_lc - 0.02), -M.AX, 0.0125, 0.007, 'steel', washer=True, nut=True))
        # steering stops on the lower clamp's back
        for sg in (1, -1):
            c = L2W((-0.028, sg * 0.022, t_lc + D['t_lc_h'] * 0.5))
            b.extend(MK.box(c, (0.016, 0.012, D['t_lc_h'] * 0.9), 'alu', RF, 0.003, 2))
        # stem and bearings (dust covers) between the clamps and the head tube
        b.extend(MK.tube(np.array([M.axis_pt(t_lc), M.axis_pt(t_top - 0.004)]), 0.0122, 'steel', 14))
        for (ta, tb) in ((t_lc + D['t_lc_h'], D['t_ht0']), (D['t_ht1'], t_top - tc)):
            if tb - ta > 0.002:
                b.extend(MK.lathe([(0.0122, 0.0), (0.0262, 0.0), (0.0262, tb - ta), (0.0122, tb - ta)], M.axis_pt(ta), M.AX,
                                  'steel', 24, smooth=False))
        # stanchions: from the slider tops up to the top clamp (chrome)
        for sg in (1, -1):
            b.extend(MK.tube(np.array([M.tube_pt(D['t_slider'] - 0.03, sg), M.tube_pt(t_top - 0.004, sg)]), D['r_stanchion'],
                             'chrome', 18, cap0='open', cap1='flat'))
        # shrouds between the clamps (paint_b) with rubber rings at both ends
        ts0 = t_lc + D['t_lc_h'] + 0.002
        ts1 = t_top - tc - 0.002
        for sg in (1, -1):
            b.extend(MK.tube(np.array([M.tube_pt(ts0 + 0.006, sg), M.tube_pt(ts1 - 0.006, sg)]), D['r_shroud'], 'paint_b', 22))
            for tt in (ts0, ts1 - 0.006):
                b.extend(MK.lathe([(D['r_stanchion'], 0.0), (D['r_shroud'] + 0.0008, 0.0012), (D['r_shroud'] + 0.0008, 0.0048),
                                   (D['r_stanchion'], 0.006)], M.tube_pt(tt, sg), M.AX, 'rubber', 22))
        b.extend(self.ears())
        b.extend(self.binnacle_bracket())
        b.extend(self.horn_tab())
        b.extend(self.cables_upper())
        return b

    def lamp_center(self):
        """Headlight centre (the lamp part's origin is 0.04 behind... see moto.HEADLIGHT)."""
        return M.HEADLIGHT

    def ears(self):
        """Headlight ears: pressed plates forward from the shrouds to the lamp's sides, with the lamp bolts;
        front indicators on stalks from the ears."""
        b = K.Buf()
        hl = M.HEADLIGHT
        bolt_x = hl[0] + 0.036
        for sg in (1, -1):
            # ear centre plane at the shroud's side
            y = sg * 0.090
            tz = (hl[2] - D['clamp_off'] * math.sin(M.RAKE)) / math.cos(M.RAKE)
            base = M.tube_pt(tz, sg)
            outline = [(base[0] - 0.012, base[2] + 0.030), (bolt_x - 0.004, hl[2] + 0.017), (bolt_x + 0.016, hl[2]),
                       (bolt_x - 0.004, hl[2] - 0.017), (base[0] - 0.004, base[2] - 0.034)]
            out = MK.rounded_poly2(outline, [0.01, 0.012, 0.014, 0.012, 0.01], 0.016)
            hole = MK.circle2((bolt_x, hl[2]), 0.0045, 12)
            b.extend(MK.plate(out, (0.0, y, 0.0), (1, 0, 0), (0, 0, 1), 0.004, 'paint_b', holes=[hole]))
            # lamp bolt (through the ear into the lamp bucket) and its washer outboard
            b.extend(MK.bolt((bolt_x, y + sg * 0.002, hl[2]), (0, sg, 0), 0.0065, 0.005, 'chrome', washer=True))
            # indicator on a stalk outboard of the bolt
            st0 = np.array([bolt_x - 0.035, y + sg * 0.012, hl[2] + 0.012])
            st1 = st0 + np.array([-0.004, sg * 0.072, 0.0])
            b.extend(MK.tube(np.array([st0, st1]), 0.0062, 'chrome', 10))
            b.extend(MK.disc(st0 - np.array([0, sg * 0.003, 0]), (0, sg, 0), 0.010, 0.0062, 'chrome', 14, thick=0.003))
            c = st1 + np.array([0, sg * 0.012, 0])
            b.extend(MK.lathe([(0.0, -0.026), (0.016, -0.0255), (0.0215, -0.017), (0.0235, -0.006), (0.0235, 0.004)], c,
                              (1, 0, 0), 'chrome', 15))
            b.extend(MK.lathe([(0.0235, 0.004), (0.0226, 0.010), (0.016, 0.018), (0.0, 0.021)], c, (1, 0, 0), 'lens_amber', 14))
            M.LAMPS.append((c + np.array([0.012, 0, 0]), np.array([1.0, 0, 0]), 0.0235))
        return b

    def binnacle_bracket(self):
        """The instruments: two chrome cans (speedometer left, tachometer right) with their dials turned to the
        rider, rubber-mounted on a pressed bracket bolted to the top clamp's front; the warning lamps sit in the
        dials' lower part (where the scale leaves room), the ignition switch between the cans."""
        b = K.Buf()
        self.dials = []
        r = M.DIAL_R
        segs = 38
        for name, sg in (('N_speed', 1.0), ('N_rpm', -1.0)):
            c, nrm, right, up = M.gauge_frame(sg)
            # chrome bezel (lip over the glass) and the can behind it
            bez = [(r + 0.0072, 0.0), (r + 0.0068, 0.0046), (r + 0.0042, 0.0064), (r + 0.0006, 0.0050)]
            b.extend(MK.lathe(bez, c, nrm, 'chrome', segs))
            can = [(0.0, -0.0452), (0.018, -0.0445), (r - 0.002, -0.040), (r + 0.0052, -0.031), (r + 0.0072, -0.012),
                   (r + 0.0072, 0.0)]
            b.extend(MK.lathe(can, c, nrm, 'chrome', segs))
            # inner wall (dark) between the bezel and the dial, the dial face (gauge, UVs at export), the glass
            b.extend(MK.lathe([(r + 0.0006, 0.0050), (r + 0.0006, -0.0040)], c, nrm, 'trim', segs))
            b.extend(MK.disc(c - nrm * 0.0040, nrm, r + 0.0006, 0.0, 'gauge', segs))
            b.extend(MK.lathe([(r + 0.0006, 0.0030), (0.0, 0.0034)], c, nrm, 'glass', segs))
            self.dials.append(dict(name=name, center=c - nrm * 0.0040, normal=nrm, right=right, up=up, r=r))
            # warning lamps in the dial's lower part: speedometer = left indicator + neutral, tachometer = high
            # beam + right indicator (the amber ones flash with their side)
            lamps = (('lens_amber', -0.40), ('emit', 0.40)) if sg > 0 else (('lens_head', -0.40), ('lens_amber', 0.40))
            for mat, f in lamps:
                p = c - nrm * 0.0034 + up * (-r * 0.58) + right * (f * r * 0.62)
                b.extend(MK.lathe([(0.0046, 0.0), (0.0040, 0.0008), (0.0, 0.0011)], p, nrm, mat, 16))
                M.LAMPS.append((p, nrm, 0.0046))
            # rubber mounting cup behind the can, the cable union at the bottom of the can
            back = c - nrm * 0.0452
            b.extend(MK.lathe([(0.0, -0.010), (0.016, -0.010), (0.022, -0.005), (0.020, 0.0), (0.0, 0.0)], back, nrm, 'rubber', 18))
            un = c - nrm * 0.036 - up * (r * 0.62)
            b.extend(MK.lathe([(0.0, 0.0), (0.0068, 0.0), (0.0068, 0.010), (0.0055, 0.013), (0.0, 0.013)], un,
                              -unit(nrm + up * 0.9), 'steel', 12))
            if sg > 0:
                kp = c - nrm * 0.018 - up * (r + 0.006) + right * 0.016
                b.extend(MK.tube(np.array([kp, kp - up * 0.010]), 0.0032, 'chrome', 8, cap1='dome'))
        # pressed bracket: a plate behind both cans (two round pads and a waist), bent down into a tab bolted
        # to the top clamp's front
        cL, nL, rL, uL = M.gauge_frame(1.0)
        cR = M.gauge_frame(-1.0)[0]
        pl = 0.5 * (cL + cR) - nL * 0.0505
        e1 = np.array([0, 1.0, 0])
        e2 = uL
        hy = float((cL - cR) @ e1) / 2
        ptsL = [(hy + 0.026 * math.cos(math.radians(a_)), 0.026 * math.sin(math.radians(a_))) for a_ in np.linspace(-110, 125, 14)]
        ptsR = [(-hy + 0.026 * math.cos(math.radians(a_)), 0.026 * math.sin(math.radians(a_))) for a_ in np.linspace(55, 290, 14)]
        outline = ptsL + [(0.0, 0.010)] + ptsR + [(-0.014, -0.034), (0.014, -0.034)]
        out = K.ccw(np.array(outline))
        out = K.resample_keep(out, 0.008, True)
        b.extend(MK.plate(out, pl, e1, e2, 0.003, 'paint_b'))
        for sg in (1, -1):
            b.extend(MK.bolt(pl + e1 * sg * hy - nL * 0.0015, -nL, 0.0042, 0.003, 'steel', washer=False))
        # tab down to the clamp: from the plate's lower edge to the top clamp's front face
        tab_top = pl - e2 * 0.034
        clamp_front = M.STEER_MOUNT + RF @ np.array([0.032, 0.0, -0.012])
        d = clamp_front - tab_top
        e2b = unit(d)
        L = float(np.linalg.norm(d))
        out2 = MK.rounded_poly2([(-0.016, -0.004), (0.016, -0.004), (0.016, L), (-0.016, L)], [0.002, 0.002, 0.006, 0.006])
        b.extend(MK.plate(out2, tab_top, e1, e2b, 0.003, 'paint_b'))
        for sg in (1, -1):
            b.extend(MK.bolt(clamp_front + e1 * sg * 0.009 + np.cross(e1, e2b) * 0.0016, np.cross(e1, e2b), 0.0045, 0.0035, 'steel'))
        # the ignition switch's housing: a short trim cup between the cans (the key part sits in it)
        c, nrm, right, up = M.ignition_frame()
        b.extend(MK.lathe([(0.0, -0.040), (0.017, -0.040), (0.019, -0.006), (0.0215, -0.002), (0.0215, 0.0)], c, nrm, 'trim', 28))
        return b

    def horn_tab(self):
        """Tab under the lower clamp's front for the horn's bracket."""
        b = K.Buf()
        hp = M.HORN
        top = M.axis_pt(D['t_lc']) + M.NF * 0.045
        h = top[2] - (hp[2] + 0.065)
        c = np.array([hp[0] - 0.025, 0.0, hp[2] + 0.065 + 0.0025])
        b.extend(MK.box(c, (0.046, 0.034, 0.005), 'steel', None, 0.0015, 1))
        p0 = c + np.array([0.012, 0, 0.0025])
        b.extend(MK.box(0.5 * (p0 + top) + np.array([0, 0, 0]), (0.02, 0.03, abs(top[2] - p0[2]) + 0.004), 'steel', None, 0.0015, 1))
        return b

    def cables_upper(self):
        """Speedometer and tachometer cables from the unions under the cans, back and down between the fork
        tubes behind the headlight, past the lower clamp (the speedometer's to the left leg's clip, the
        tachometer's behind the head tube)."""
        b = K.Buf()
        hl = M.HEADLIGHT
        for sg in (1.0, -1.0):
            c, nrm, right, up = M.gauge_frame(sg)
            un = c - nrm * 0.036 - up * (M.DIAL_R * 0.62)
            d0 = -unit(nrm + up * 0.9)
            p0 = un + d0 * 0.012
            p1 = p0 + d0 * 0.03
            p2 = np.array([hl[0] - 0.026, sg * 0.040, hl[2] + 0.06])
            p3 = np.array([hl[0] - 0.034, sg * 0.036, hl[2] - 0.04])
            if sg > 0:
                p4 = M.tube_pt(D['t_lc'] - 0.03, 1.0) + np.array([-0.012, -0.030, 0.0])
                pts = [p0, p1, p2, p3, p4]
            else:
                p4 = M.axis_pt(D['t_lc'] + 0.005) + M.NF * 0.034 + np.array([0, -0.026, 0])
                p5 = M.axis_pt(D['t_lc'] - 0.035) + M.NF * 0.012 + np.array([0, -0.030, 0])
                pts = [p0, p1, p2, p3, p4, p5]
            cab, _ = MK.cable(pts, 0.0040, 'trim', 8, [0] + [0.035] * (len(pts) - 2) + [0])
            b.extend(cab)
        return b

    # ---------------------------------------------------------------- lower fork
    def lower(self):
        """FORK_LOWER's geometry (world coordinates at rest)."""
        b = K.Buf()
        t_ax = self.t_ax
        for sg in (1, -1):
            b.extend(self.slider(sg))
        b.extend(self.fender())
        b.extend(self.disc_caliper())
        b.extend(self.speedo_drive())
        return b

    def slider(self, sg):
        b = K.Buf()
        t0 = self.t_ax - 0.045
        t1 = D['t_slider']
        ax = M.AX
        base = M.tube_pt(0.0, sg)
        L = t1 - t0
        prof = [(0.0, 0.0), (0.012, 0.0), (0.019, 0.004), (0.0225, 0.014), (0.0230, 0.06), (0.0240, L - 0.03), (0.0252, L - 0.024),
                (0.0252, L - 0.004), (0.0236, L), (0.0176, L)]
        b.extend(MK.lathe(MK.round_prof(prof, [0, 0.0, 0.008, 0.01, 0.02, 0.0, 0.003, 0.002, 0.002, 0], 1), M.tube_pt(t0, sg), ax, 'alu', 22))
        # dust seal
        b.extend(MK.lathe([(D['r_stanchion'] + 0.0002, 0.0), (0.0232, 0.0), (0.0232, 0.006), (0.0215, 0.012), (D['r_stanchion'] + 0.0002, 0.013)],
                          M.tube_pt(t1 - 0.002, sg), ax, 'rubber', 22))
        # axle boss across the foot (ahead of the tube line by the axle lead), clamp cap with two studs
        hub = self.hub
        y0, y1 = sg * 0.067, sg * 0.113
        boss = np.array([[hub[0], y0, hub[2]], [hub[0], y1, hub[2]]])
        b.extend(MK.tube(boss, 0.0195, 'alu', 18))
        capc = hub + np.array([0.022, sg * 0.090, -0.004])
        b.extend(MK.box(capc, (0.016, 0.042, 0.04), 'alu', MK.frame_axes(np.array([1.0, 0, 0.18]), (0, 0, 1)), 0.005, 1))
        for dz in (0.015, -0.017):
            p = capc + np.array([0.008, 0.0, dz])
            b.extend(MK.bolt(p, (1.0, 0, 0.0), 0.0058, 0.0048, 'steel', washer=False, nut=True))
        # axle nut / spindle end outboard (the rim's own axle passes through)
        b.extend(MK.bolt(np.array([hub[0], y1, hub[2]]), (0, sg, 0), 0.011, 0.007, 'chrome' if sg > 0 else 'steel', washer=True,
                         nut=sg < 0))
        # drain screw at the slider's foot (rear)
        b.extend(MK.bolt(M.tube_pt(t0 + 0.012, sg) - M.NF * 0.022 + np.array([0, 0, 0]), -M.NF, 0.0042, 0.003, 'steel', washer=False))
        # fender stay bosses inside the slider (front and middle)
        for tt in (0.44,):
            p = M.tube_pt(tt, sg) - np.array([0, sg * 0.0232, 0])
            b.extend(MK.lathe([(0.0, 0.0), (0.0085, 0.0), (0.0085, 0.004), (0.0, 0.004)], p, (0, -sg, 0), 'alu', 12))
        return b

    def fender(self):
        """Front fender (paint) between the sliders, its chrome stays (a loop from the axle bosses round the
        front, a brace across under the crown bolted to the sliders)."""
        b = K.Buf()
        hub = self.hub
        R0 = 0.344
        th0, th1 = -58.0, 64.0
        n = 16
        th = np.radians(np.linspace(th0, th1, n))
        radial = np.stack([np.sin(th) * -1.0, np.zeros(n), np.cos(th)], 1)
        # theta > 0 = towards the rear: x = hub - sin(th) * R  (front is negative theta)
        radial = np.stack([-np.sin(th), np.zeros(n), np.cos(th)], 1)
        path = hub + radial * R0
        w = 0.058
        ys = np.linspace(-w, w, 9)
        prof_out = [(yv, 0.0085 * (1 - (yv / w) ** 2) + 0.0015 * math.exp(-(yv / 0.005) ** 2)) for yv in ys]
        skirt = 0.026
        side = [(w + 0.0012, -0.003), (w + 0.0016, -skirt * 0.5), (w + 0.0012, -skirt)]
        prof = np.array([(-p[0], p[1]) for p in side[::-1]] + prof_out + side)
        V, N, T = K.sweep(path[::-1], radial[::-1], prof[::-1], closed=False, closed_prof=False)
        b.add(V, N, T, 'paint')
        inner = prof[::2].copy()
        inner[:, 1] -= 0.0018
        inner[:, 0] *= (w - 0.0014) / w
        V2, N2, T2 = K.sweep(path[::-1], radial[::-1], inner, closed=False, closed_prof=False)
        b.add(V2, N2, T2, 'paint')
        for sg in (1, -1):
            edge = path + radial * (-skirt - 0.0005) + np.array([0, sg * (w + 0.0006), 0])
            b.extend(MK.tube(edge, 0.0016, 'paint', 4, cap0='flat', cap1='flat'))
        for k in (0, n - 1):
            ring = np.array([path[k] + radial[k] * p[1] + np.array([0, p[0], 0]) for p in prof])
            ring2 = np.array([path[k] + radial[k] * p[1] + np.array([0, p[0], 0]) for p in inner[::-1]])
            tdir = unit(path[min(k + 1, n - 1)] - path[max(k - 1, 0)]) * (1 if k == n - 1 else -1)
            b.extend(K.fill_loop(np.vstack([ring, ring2]), tdir, 'paint'))
        # front stay: chrome rod from each axle boss up round the fender's front
        for sg in (1, -1):
            a = math.radians(-34.0)
            p_f = hub + np.array([-math.sin(a), 0, math.cos(a)]) * (R0 - skirt * 0.6) + np.array([0, sg * (w + 0.004), 0])
            p0 = hub + np.array([0.012, sg * 0.068, 0.0])
            stay = MK.bend_path([p0, p0 + [0.07, 0.0, 0.03], p_f], [0, 0.05, 0], 0.25, 18.0)
            b.extend(MK.tube(stay, 0.0042, 'chrome', 6))
            b.extend(MK.bolt(p_f + [0, sg * 0.002, 0], (0, sg, 0), 0.0045, 0.0035, 'chrome', washer=True))
        # brace across under the crown, bolted to the sliders' bosses
        tt = 0.44
        pl = M.tube_pt(tt, 1.0) - np.array([0, 0.0272, 0])
        pr = M.tube_pt(tt, -1.0) + np.array([0, 0.0272, 0])
        crown_th = math.degrees(math.atan2(-(pl[0] - hub[0]), pl[2] - hub[2]))
        rad = np.array([-math.sin(math.radians(crown_th)), 0, math.cos(math.radians(crown_th))])
        mid = hub + rad * (R0 - 0.0025)
        brace = [pl, (pl[0], 0.035, mid[2] - 0.004), (mid[0], -0.035, mid[2] - 0.004), pr]
        prof = np.array([(-0.0105, -0.002), (0.0105, -0.002), (0.0105, 0.002), (-0.0105, 0.002)])
        path_b = MK.bend_path([pl, pl + (mid - pl) * 0.65 + np.array([0, 0, 0.0]), mid + np.array([0, -0.0, 0]),
                               pr + (mid - pr) * 0.65, pr], [0, 0.02, 0.03, 0.02, 0])
        path_b[:, 1] = np.clip(path_b[:, 1], -0.0675, 0.0675)
        V, N, T = K.sweep(path_b, rad, prof, closed=False, closed_prof=True)
        b.add(V, N, T, 'steel')
        for sg in (1, -1):
            b.extend(MK.bolt(np.array([pl[0], sg * 0.0640, pl[2]]), (0, -sg, 0), 0.005, 0.004, 'steel', washer=True))
        self.fender_path = path
        return b

    def disc_caliper(self):
        """Brake disc on the right of the hub (with its carrier and bolts) and the caliper behind the right
        slider on a cast bracket, the bleed nipple and the hose up the slider's back."""
        b = K.Buf()
        hub = self.hub
        yd = -0.0590
        c = np.array([hub[0], yd, hub[2]])
        ax = np.array([0, 1.0, 0])
        b.extend(MK.disc(c, ax, 0.135, 0.079, 'steel', 40, thick=0.005, edge=0.0007))
        # machined face rings (a slightly darker band where the pads run)
        for yy in (yd - 0.0026, yd + 0.0026):
            sgn = -1 if yy < yd else 1
            b.extend(MK.disc(np.array([hub[0], yy + sgn * 0.0001, hub[2]]), ax * sgn, 0.1335, 0.098, 'alu', 40))
        # carrier
        b.extend(MK.lathe(MK.round_prof([(0.046, yd - 0.004), (0.081, yd - 0.004), (0.081, yd + 0.003), (0.058, yd + 0.012),
                                         (0.046, yd + 0.012)], 0.002, 1), np.array([hub[0], 0.0, hub[2]]), ax, 'alu', 28))
        for k in range(6):
            a = 2 * math.pi * k / 6 + 0.3
            p = np.array([hub[0] + 0.064 * math.cos(a), yd - 0.0045, hub[2] + 0.064 * math.sin(a)])
            b.extend(MK.bolt(p, (0, -1, 0), 0.0045, 0.0035, 'steel', washer=False))
        # caliper behind the slider: two halves bridged over the disc's rim
        phi = math.radians(186.0)
        rc = 0.112
        cc = np.array([hub[0] + rc * math.cos(phi), yd, hub[2] + rc * math.sin(phi)])
        tang = np.array([-math.sin(phi), 0, math.cos(phi)])
        radv = np.array([math.cos(phi), 0, math.sin(phi)])
        R = np.stack([tang, ax, radv], 1)
        for (dy, w) in ((-0.0155, 0.017), (0.0145, 0.015)):
            body = MK.box(cc + ax * dy, (0.072, w, 0.050), 'alu', R, 0.006, 1)
            b.extend(body)
        b.extend(MK.box(cc + radv * 0.027, (0.060, 0.044, 0.012), 'alu', R, 0.004, 1))
        for s in (-1, 1):
            b.extend(MK.bolt(cc + ax * -0.024 + tang * s * 0.024 + radv * 0.012, -ax, 0.0045, 0.0035, 'steel', washer=False))
        # bleed nipple and banjo + hose
        top = cc + tang * 0.036 * -1 + radv * 0.02
        b.extend(MK.tube(np.array([cc + ax * -0.02 + tang * -0.03 + radv * 0.018, cc + ax * -0.02 + tang * -0.04 + radv * 0.024]), 0.0025,
                         'steel', 8))
        banjo = cc + ax * -0.026 + tang * 0.02 + radv * 0.004
        b.extend(MK.bolt(banjo, -ax, 0.006, 0.006, 'steel', washer=True))
        # mounting bracket to the slider's back
        sl = M.tube_pt(self.t_ax + 0.035, -1.0) - M.NF * 0.022
        br = MK.bend_path([cc + tang * 0.03 + ax * -0.006, sl + np.array([0.0, 0.004, 0.0])], [0, 0])
        prof = np.array([(-0.008, -0.004), (0.008, -0.004), (0.008, 0.004), (-0.008, 0.004)])
        V, N, T = K.sweep(br, ax, prof, closed=False, closed_prof=True)
        b.add(V, N, T, 'alu')
        hose_pts = [banjo + np.array([0.0, -0.007, 0.0]), banjo + np.array([0.018, -0.012, 0.02]),
                    M.tube_pt(self.t_ax + 0.13, -1.0) - M.NF * 0.034 + np.array([0, -0.004, 0]),
                    M.tube_pt(D['t_slider'] - 0.03, -1.0) - M.NF * 0.034 + np.array([0, -0.012, 0]),
                    M.tube_pt(D['t_slider'] + 0.06, -1.0) - M.NF * 0.05 + np.array([0, 0.006, 0])]
        cab, path = MK.cable(hose_pts, 0.0043, 'rubber', 8, [0, 0.03, 0.08, 0.08, 0])
        b.extend(cab)
        # hose clip on the slider
        p = M.tube_pt(D['t_slider'] - 0.07, -1.0) - M.NF * 0.024
        b.extend(MK.box(p + np.array([0, -0.004, 0]), (0.012, 0.01, 0.012), 'steel', RF, 0.002, 1))
        return b

    def speedo_drive(self):
        """Speedometer drive box on the left of the hub, the cable's lower run up the left slider."""
        b = K.Buf()
        hub = self.hub
        c = np.array([hub[0] - 0.034, 0.072, hub[2] - 0.016])
        b.extend(MK.box(c, (0.03, 0.016, 0.024), 'alu', None, 0.005, 2))
        p0 = c + np.array([-0.012, 0.004, 0.0])
        b.extend(MK.lathe([(0.0, 0.0), (0.0065, 0.0), (0.0065, 0.014), (0.005, 0.017), (0.0, 0.017)], p0, (-1.0, 0, 0.4), 'steel', 10))
        pts = [p0 + np.array([-0.016, 0.0, 0.006]), M.tube_pt(self.t_ax + 0.09, 1.0) - M.NF * 0.034 + np.array([0, 0.004, 0]),
               M.tube_pt(D['t_slider'] - 0.02, 1.0) - M.NF * 0.034, M.tube_pt(D['t_slider'] + 0.07, 1.0) - M.NF * 0.05]
        cab, _ = MK.cable(pts, 0.0042, 'trim', 8, [0, 0.05, 0.06, 0])
        b.extend(cab)
        return b
