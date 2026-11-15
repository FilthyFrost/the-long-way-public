"""
Body add-ons (docs/MODCAR.md section 2.3): bumpers, mirrors, roof items, side armour.

    blender -b --factory-startup --python tools/blender/build.py -- parts/body [<id>|all] [--norender]

Stretch parts are modelled for a nominal box (root property fit_nominal = [length, width, height] m) and
the game scales them to the frame's mount box; the origin is the centre of the face that touches the body:
  bumpers 0.25 x 1.60 x 0.22 (front bumpers extend +X from x = 0, rear bumpers -X), centred on z = 0;
  roof items 1.20 x 1.00 x 0.15 standing on z = 0; armour 2.00 x 0.02 x 0.60, the inner face on y = 0,
  the plates extend outwards to +Y (LEFT side; mirrored for the right), centred on z = 0.
Mirror: the LEFT mirror, origin at its foot on the door, the glass faces -X.
"""
import math

import bmesh
from mathutils import Matrix, Vector

from parts import _kit as K
from parts._kit import V, mat4


def c_section(depth, height, thick, bulge=0.012, n=6):
    """A sheet-metal C section (z, out): the front face bulges outwards, flanges return towards the body."""
    outer = []
    for i in range(n + 1):
        t = i / n
        a = math.pi * (0.5 - t)
        z = height / 2 * math.sin(a)
        out = depth * 0.5 + bulge * math.cos(a) + depth * 0.5 * math.cos(a) ** 0.6
        outer.append((z, out - depth))
    outer = [(height / 2 * 0.98, -depth)] + outer + [(-height / 2 * 0.98, -depth)]
    inner = []
    for (z, o) in reversed(outer):
        inner.append((z * (1 - thick / height * 2.2), o - thick))
    return outer + inner


def blade_path(half_w, front, wrap, back, sign=1.0):
    """Plan path of a bumper (x, y) from -half_w to +half_w with the ends wrapping back towards the body."""
    pts = [(back, -half_w), (front - wrap * 0.55, -half_w + wrap * 0.35), (front - wrap * 0.12, -half_w + wrap),
           (front, -half_w * 0.45), (front + 0.006, 0.0), (front, half_w * 0.45), (front - wrap * 0.12, half_w - wrap),
           (front - wrap * 0.55, half_w - wrap * 0.35), (back, half_w)]
    return [(sign * x, y, 0.0) for (x, y) in pts]


def _plan_offset(path, d):
    """Offset a plan path (x, y, 0) sideways by d along its outward normal (away from the car's centre)."""
    out = []
    n = len(path)
    for i in range(n):
        a = V(path[max(0, i - 1)])
        b = V(path[min(n - 1, i + 1)])
        t = (b - a).normalized()
        nrm = V((t.y, -t.x, 0.0))
        out.append(V(path[i]) + nrm * d)
    return out


def _plan_x_at(path, y):
    """x of a plan path where it crosses y (the straight front run)."""
    for a, b in zip(path[:-1], path[1:]):
        if (a[1] - y) * (b[1] - y) <= 0 and abs(b[1] - a[1]) > 1e-9:
            f = (y - a[1]) / (b[1] - a[1])
            return a[0] + (b[0] - a[0]) * f
    return path[len(path) // 2][0]


def bumper_path(front, half_w=0.80, rc=0.085, sign=1.0):
    """
    Plan path (x, y, 0) of a shallow bumper from -half_w to +half_w: a straight front run at x = front (a
    touch fuller in the middle), then a quarter circle of radius rc at each end, so the ends face straight
    back towards the body (their flanges then turn inwards, not into the body).
    """
    yc = half_w - rc
    pts = []
    for k in range(5):
        th = math.radians(-90 + 22.5 * k)
        pts.append((front - rc + rc * math.cos(th), -yc + rc * math.sin(th)))
    pts += [(front, -yc * 0.5), (front + 0.006, 0.0), (front, yc * 0.5)]
    for k in range(5):
        th = math.radians(22.5 * k)
        pts.append((front - rc + rc * math.cos(th), yc + rc * math.sin(th)))
    return [(sign * x, y, 0.0) for (x, y) in pts]


def chrome_bumper(P, sign=1.0, overriders=True, step=False, front=0.115):
    """
    A 1970s chrome bumper blade with a rubber strip, overriders and short brackets (sign -1: rear bumper).
    The blade's back flanges stand 4.5 cm off the body face (x = 0); the stubby brackets hide behind it.
    """
    P.ao_distance = 0.06
    depth = 0.07
    path = [V(p) for p in bumper_path(front, sign=sign)]
    if sign < 0:
        path = list(reversed(path))
    sec = c_section(depth, 0.19, 0.006, bulge=0.01, n=7)
    bm = bmesh.new()
    K.bm_sweep(bm, path, 1.0, profile=sec, caps=True)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    P.mesh('blade', bm, 'chrome', sharp=50.0)
    # rubber strip along the front face: the blade's own path pushed out onto its face
    strip = [(0.014, 0.0), (0.016, 0.006), (-0.014, 0.006), (-0.016, 0.0), (-0.014, -0.006), (0.014, -0.006)]
    spath = [p for p in _plan_offset(path, 0.017) if abs(p.y) <= 0.70]
    bm = bmesh.new()
    K.bm_sweep(bm, spath, 1.0, profile=[(z, o) for (z, o) in strip], caps=True)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    P.mesh('strip', bm, 'rubber', sharp=50.0)
    # short brackets from plates on the body into the back of the blade, behind its straight run
    for y in (-0.5, -0.22, 0.22, 0.5):
        xb = abs(_plan_x_at(path, y)) - depth + 0.012       # into the blade's back
        ln = xb - 0.006
        P.box('bracket', (ln, 0.035, 0.05), (sign * (0.006 + ln / 2), y, -0.01), 'steel', bev=0.005, segs=1)
        P.box('bracket_plate', (0.012, 0.07, 0.09), (sign * 0.006, y, -0.01), 'steel', bev=0.003, segs=1)
        P.bolts([(sign * 0.0125, y + sy * 0.022, -0.01 + sz * 0.03) for sy in (-1, 1) for sz in (-1, 1)],
                normal=(sign, 0, 0), r=0.006, h=0.005, washer=False)
    if overriders:
        for sg in (-1, 1):
            y = sg * 0.42
            xo = abs(_plan_x_at(path, y))
            P.pillow('overrider', (0.07, 0.055, 0.2), (sign * (xo + 0.02), y, 0.02), 'chrome', r=0.024, sub=1,
                     taper=(0.75, 0.85))
            P.pillow('over_tip', (0.03, 0.045, 0.07), (sign * (xo + 0.053), y, 0.075), 'rubber', r=0.012, sub=1)
    if step:
        P.box('step_pad', (0.05, 0.36, 0.008), (sign * (front - 0.033), 0.0, 0.098), 'rubber', bev=0.003, segs=1)
        for i in range(6):
            P.box('step_rib', (0.04, 0.006, 0.004), (sign * (front - 0.033), -0.15 + i * 0.06, 0.103), 'rubber',
                  bev=None)
    return path


def build_bf_stock(P):
    chrome_bumper(P, 1.0)
    P.fit_nominal(0.25, 1.60, 0.22)
    P.views = [('a', 35, 18), ('b', 160, 18)]


def build_br_stock(P):
    path = chrome_bumper(P, -1.0, step=True)
    # the tow eye under the blade, its ring just proud of the face
    xf = abs(_plan_x_at(path, -0.55))
    P.cyl('tow_eye', 0.02, 0.05, (-(xf - 0.015), -0.55, -0.075), 'steel', axis='X', segs=12, bev=0.003, bsegs=1)
    P.torus('tow_ring', 0.024, 0.007, loc=(-(xf + 0.02), -0.55, -0.075), axis='Y', segs=14, rsegs=6, material='steel')
    P.fit_nominal(0.25, 1.60, 0.22)
    P.views = [('a', 215, 18), ('b', 340, 18)]


def weld(P, p, axis, r):
    P.torus('weld', r, 0.005, loc=p, axis=axis, segs=14, rsegs=4, material='rust')


def build_bf_bullbar(P):
    """A tubular bull bar: lower bar wrapping round the corners, a tall hoop over the grille with two inner
    uprights and a crossbar, a skid plate, heavy brackets, light tabs on top."""
    P.ao_distance = 0.08
    r1, r2 = 0.032, 0.024
    P.tube('lower', [(0.02, -0.80, -0.03), (0.12, -0.74, -0.03), (0.17, -0.55, -0.03), (0.17, 0.55, -0.03),
                     (0.12, 0.74, -0.03), (0.02, 0.80, -0.03)], r1, 'steel', segs=14, bend=0.12)
    hoop = [(0.165, -0.40, -0.03), (0.185, -0.36, 0.30), (0.17, -0.25, 0.42), (0.17, 0.25, 0.42), (0.185, 0.36, 0.30),
            (0.165, 0.40, -0.03)]
    P.tube('hoop', hoop, r1, 'steel', segs=14, bend=0.12)
    for sg in (-1, 1):
        P.tube('upright', [(0.18, sg * 0.13, -0.03), (0.18, sg * 0.13, 0.42)], r2, 'steel', segs=12)
        weld(P, (0.18, sg * 0.13, 0.0), 'Z', r2 + 0.003)
        weld(P, (0.18, sg * 0.13, 0.4), 'Z', r2 + 0.003)
    P.tube('cross', [(0.185, -0.37, 0.17), (0.19, 0.37, 0.17)], r2, 'steel', segs=12)
    # skid plate under the lower bar, with slots
    P.box('skid', (0.16, 0.7, 0.008), (0.1, 0.0, -0.075), 'steel', rot=(0, -12, 0), bev=0.003, segs=1)
    for i in range(5):
        P.box('skid_slot', (0.09, 0.03, 0.004), (0.11, -0.24 + i * 0.12, -0.071), 'trim', rot=(0, -12, 0), bev=None)
    # brackets to the body (attach face x = 0)
    for y in (-0.5, 0.5):
        P.box('mount', (0.18, 0.06, 0.12), (0.08, y, -0.02), 'steel', bev=0.008, segs=1)
        P.box('mount_plate', (0.014, 0.14, 0.18), (0.007, y, -0.02), 'steel', bev=0.003, segs=1)
        P.bolts([(0.014, y + sy * 0.045, -0.02 + sz * 0.06) for sy in (-1, 1) for sz in (-1, 1)], normal=(1, 0, 0),
                r=0.008, h=0.007, washer=True)
    for sg in (-1, 1):
        P.box('light_tab', (0.05, 0.05, 0.008), (0.17, sg * 0.18, 0.455), 'steel', bev=0.002, segs=1)
        P.cyl('tab_hole', 0.008, 0.01, (0.17, sg * 0.18, 0.456), 'trim', segs=10, bev=None)
    P.fit_nominal(0.25, 1.60, 0.22)
    P.views = [('a', 35, 16), ('b', 150, 20)]


def spike(P, base, direction, length, r, material='steel', tip='chrome'):
    """A welded cone spike from base along direction, with a weld ring."""
    d = V(direction).normalized()
    m = Matrix.Translation(V(base) + d * length * 0.45) @ K.axis_matrix(d)
    bm = bmesh.new()
    K.bm_cyl(bm, r, length * 0.9, segs=10, r2=r * 0.12, matrix=m)
    P.mesh('spike', bm, material, sharp=40.0)
    m2 = Matrix.Translation(V(base) + d * (length * 0.9 + 0.006)) @ K.axis_matrix(d)
    bm = bmesh.new()
    K.bm_cyl(bm, r * 0.15, length * 0.1, segs=8, r2=0.0006, matrix=m2)
    P.mesh('spike_tip', bm, tip, sharp=40.0)
    P.torus('weld', r + 0.002, 0.005, loc=tuple(V(base) + d * 0.004), axis=d, segs=12, rsegs=4, material='rust')


def build_bf_ram(P):
    """A spiked ram: a raked V-prow of rusty plate (the lower edge leads), steel facing plates, two rows of
    long spikes and a big nose spike, a saw-tooth cutting edge along the bottom, a rolled top rail, heavy
    brackets back to the bumper mount."""
    P.ao_distance = 0.10
    zb, zt = -0.12, 0.13
    rake = 0.09
    # plan of the leading (bottom) edge, from the left end round the nose to the right end
    plan = [(0.0, 0.80), (0.10, 0.80), (0.33, 0.12), (0.36, 0.0), (0.33, -0.12), (0.10, -0.80), (0.0, -0.80)]
    bm = bmesh.new()
    bot = [bm.verts.new((x, y, zb)) for (x, y) in plan]
    top = [bm.verts.new((max(0.0, x - rake * (1 if x > 0.05 else 0)), y, zt)) for (x, y) in plan]
    n = len(plan)
    caps = [bm.faces.new(bot), bm.faces.new(list(reversed(top)))]
    faces = list(caps)
    for i in range(n):
        j = (i + 1) % n
        faces.append(bm.faces.new((bot[i], bot[j], top[j], top[i])))
    bmesh.ops.recalc_face_normals(bm, faces=faces)
    # interior vertices on the big caps so the vertex AO is not just the (occluded) outline
    bmesh.ops.poke(bm, faces=caps)
    P.mesh('wedge', bm, 'rust', bev=0.012, segs=2, bev_angle=40)

    def face_frame(k):
        """Centre, outward normal and along-direction of front face k (between plan points k and k+1)."""
        (x0, y0), (x1, y1) = plan[k], plan[k + 1]
        b0, b1 = V((x0, y0, zb)), V((x1, y1, zb))
        t0, t1 = V((x0 - rake, y0, zt)), V((x1 - rake, y1, zt))
        along = (b1 - b0).normalized()
        up = ((t0 + t1) / 2 - (b0 + b1) / 2).normalized()
        nrm = along.cross(up).normalized()
        if nrm.x < 0:
            nrm = -nrm
        return (b0 + b1 + t0 + t1) / 4, nrm, along, up, (b1 - b0).length

    spikes_done = []
    for k in (1, 4):
        c, nrm, along, up, L = face_frame(k)
        # facing plate with bolts: placed by the face's own frame (along, normal, up), right-handed
        upn = along.cross(nrm).normalized()
        m = Matrix((along, nrm, upn)).transposed().to_4x4()
        m.translation = c + nrm * 0.009
        bm = bmesh.new()
        K.bm_cube(bm, (L * 0.86, 0.014, 0.2), m)
        P.mesh('facing', bm, 'steel', bev=0.004, segs=1)
        bolts = []
        for i in range(6):
            q = c + along * (L * (-0.38 + 0.76 * i / 5)) + nrm * 0.018
            bolts += [tuple(q + up * 0.085), tuple(q - up * 0.085)]
        P.bolts(bolts, normal=tuple(nrm), r=0.008, h=0.006, washer=False)
        # two rows of spikes, leaning forward
        for row, (h, ln, r) in enumerate(((0.05, 0.27, 0.036), (-0.06, 0.22, 0.032))):
            for i in range(3):
                t = -0.3 + 0.3 * i + (0.15 if row else 0.0)
                base = c + along * (L * t) + up * h + nrm * 0.016
                d = (nrm + V((0.9, 0, 0.15 if row == 0 else 0.05))).normalized()
                spike(P, tuple(base), tuple(d), ln, r)
        # saw teeth along the leading edge
        (x0, y0), (x1, y1) = plan[k], plan[k + 1]
        b0, b1 = V((x0, y0, zb)), V((x1, y1, zb))
        nt = 9
        bm = bmesh.new()
        for i in range(nt):
            u0, u1 = i / nt, (i + 1) / nt
            p0 = b0 + (b1 - b0) * u0
            p1 = b0 + (b1 - b0) * u1
            tip = (p0 + p1) / 2 + nrm * 0.07 + V((0, 0, -0.025))
            back = (p0 + p1) / 2 - nrm * 0.03
            for (a_, b_) in ((p0, p1),):
                v = [bm.verts.new(a_ + V((0, 0, 0.004))), bm.verts.new(b_ + V((0, 0, 0.004))),
                     bm.verts.new(tip + V((0, 0, 0.004))), bm.verts.new(a_ - V((0, 0, 0.008))),
                     bm.verts.new(b_ - V((0, 0, 0.008))), bm.verts.new(tip - V((0, 0, 0.008)))]
                fs = [bm.faces.new((v[0], v[1], v[2])), bm.faces.new((v[5], v[4], v[3])),
                      bm.faces.new((v[0], v[3], v[4], v[1])), bm.faces.new((v[1], v[4], v[5], v[2])),
                      bm.faces.new((v[2], v[5], v[3], v[0]))]
                bmesh.ops.recalc_face_normals(bm, faces=fs)
        P.mesh('teeth', bm, 'steel', sharp=40.0)
    # nose block with the big spike
    P.box('nose', (0.06, 0.25, 0.22), (0.33, 0.0, 0.0), 'steel', rot=(0, -20, 0), bev=0.014, segs=2)
    spike(P, (0.36, 0.0, 0.02), (1.0, 0.0, 0.12), 0.34, 0.05)
    # rolled top rail and the brackets to the mount
    rail = [(0.0, 0.79, zt + 0.012), (0.1 - rake, 0.79, zt + 0.012), (0.33 - rake, 0.12, zt + 0.012),
            (0.36 - rake, 0.0, zt + 0.012), (0.33 - rake, -0.12, zt + 0.012), (0.1 - rake, -0.79, zt + 0.012),
            (0.0, -0.79, zt + 0.012)]
    P.tube('top_rail', rail, 0.018, 'rust', segs=10, bend=0.06)
    for y in (-0.5, 0.5):
        P.box('bracket', (0.16, 0.05, 0.2), (0.07, y, 0.0), 'rust', bev=0.008, segs=1)
        P.box('bracket_plate', (0.016, 0.16, 0.24), (0.008, y, 0.0), 'steel', bev=0.004, segs=1)
        P.bolts([(0.016, y + sy * 0.055, sz * 0.08) for sy in (-1, 1) for sz in (-1, 1)], normal=(1, 0, 0), r=0.01,
                h=0.008, washer=True)
    P.fit_nominal(0.25, 1.60, 0.22)
    P.views = [('a', 30, 18), ('b', 160, 20)]


def build_mir_stock(P):
    """A round chrome door mirror (LEFT): foot on the door, a swan-neck stalk, a chrome head facing back."""
    P.ao_distance = 0.03
    P.pillow('foot', (0.07, 0.03, 0.035), (0.0, 0.012, 0.0), 'chrome', r=0.01, sub=1)
    P.box('gasket', (0.074, 0.004, 0.039), (0.0, 0.002, 0.0), 'trim', bev=0.001, segs=1)
    head = V((-0.03, 0.12, 0.095))
    P.tube('stalk', [(0.0, 0.02, 0.0), (0.0, 0.05, 0.03), (-0.01, 0.09, 0.07), (head.x + 0.02, head.y, head.z)],
           0.009, 'chrome', segs=10, bend=0.04)
    R = 0.06
    P.lathe('shell', [(0.0, 0.032), (0.03, 0.03), (0.05, 0.022), (0.06, 0.01), (0.062, 0.0)][::-1], loc=tuple(head),
            material='chrome', axis='X', segs=24, sharp=50.0)
    P.lathe('bezel', [(0.056, -0.004), (0.063, -0.004), (0.063, 0.002), (0.056, 0.002)], loc=tuple(head),
            material='trim', axis='X', segs=24, loop=True, sharp=50.0)
    P.cyl('glass', 0.056, 0.003, tuple(head + V((-0.003, 0, 0))), 'chrome', axis='X', segs=24, bev=None)
    P.views = [('a', 200, 12), ('b', 40, 15)]


def build_roof_rack(P):
    """A tubular roof rack: perimeter rail, bottom rails and cross bars, posts, a wind fairing at the front,
    four gutter clamps with rubber pads."""
    P.ao_distance = 0.06
    L, W = 1.16, 0.96
    zt, zb = 0.125, 0.07
    rr = 0.08
    per = [(L / 2, 0.0, zt), (L / 2, W / 2, zt), (-L / 2, W / 2, zt), (-L / 2, -W / 2, zt), (L / 2, -W / 2, zt),
           (L / 2, 0.0, zt)]
    P.tube('rail', per, 0.014, 'steel', segs=10, bend=rr)
    for sg in (-1, 1):
        P.tube('side', [(L / 2 - 0.06, sg * (W / 2 - 0.05), zb), (-L / 2 + 0.06, sg * (W / 2 - 0.05), zb)], 0.012,
               'steel', segs=10)
        for x in (-L / 2 + 0.08, -0.15, 0.15, L / 2 - 0.08):
            P.tube('post', [(x, sg * (W / 2 - 0.05), zb), (x, sg * W / 2, zt)], 0.009, 'steel', segs=8)
    for i in range(6):
        x = -L / 2 + 0.1 + (L - 0.2) * i / 5
        P.tube('cross', [(x, -(W / 2 - 0.05), zb), (x, W / 2 - 0.05, zb)], 0.011, 'steel', segs=10)
    # wind fairing at the front
    bm = bmesh.new()
    K.bm_cube(bm, (0.006, W - 0.16, 0.07), mat4((L / 2 - 0.03, 0.0, zt - 0.03), (0, -35, 0)))
    P.mesh('fairing', bm, 'steel', bev=0.003, segs=1)
    # gutter clamps
    for sx in (-1, 1):
        for sg in (-1, 1):
            x, y = sx * (L / 2 - 0.12), sg * (W / 2 - 0.05)
            P.box('clamp', (0.05, 0.04, zb), (x, y, zb / 2), 'steel', bev=0.006, segs=1)
            P.box('pad', (0.06, 0.05, 0.012), (x, y, 0.006), 'rubber', bev=0.003, segs=1)
            P.bolt((x, y + sg * 0.02, zb * 0.6), normal=(0, sg, 0), r=0.006, h=0.005)
    P.fit_nominal(1.20, 1.00, 0.15)
    P.views = [('a', 35, 30), ('b', 215, 30)]


def build_roof_spikes(P):
    """Roof spikes: a welded frame of box sections bolted to the roof, rows of spikes along its edges."""
    P.ao_distance = 0.06
    L, W = 1.10, 0.90
    h = 0.04
    for sg in (-1, 1):
        P.box('bar_side', (L, 0.04, h), (0.0, sg * W / 2, h / 2 + 0.01), 'rust', bev=0.005, segs=1)
    for sx in (-1, 1):
        P.box('bar_end', (0.04, W, h), (sx * L / 2, 0.0, h / 2 + 0.01), 'rust', bev=0.005, segs=1)
    P.box('bar_mid', (0.04, W, h), (0.0, 0.0, h / 2 + 0.01), 'rust', bev=0.005, segs=1)
    for sx in (-1, 1):
        for sg in (-1, 1):
            P.box('foot', (0.08, 0.08, 0.01), (sx * (L / 2 - 0.02), sg * (W / 2 - 0.02), 0.005), 'steel', bev=0.002,
                  segs=1)
            P.bolt((sx * (L / 2 - 0.02), sg * (W / 2 - 0.02), 0.01), r=0.008, h=0.006)
    # centre spine along X and diagonal braces
    P.box('spine', (L, 0.045, h + 0.01), (0.0, 0.0, (h + 0.01) / 2 + 0.01), 'rust', bev=0.005, segs=1)
    for sg in (-1, 1):
        d = V((L / 2, sg * W / 2, 0)).normalized()
        P.box('brace', (math.hypot(L / 2, W / 2) - 0.05, 0.03, 0.03), (L / 4, sg * W / 4, 0.03), 'rust',
              rot=(0, 0, math.degrees(math.atan2(sg * W / 2, L / 2))), bev=0.004, segs=1)
    for sx in (-1, 1):
        for sg in (-1, 1):
            tri = [(0.0, 0.0), (-sx * 0.12, 0.0), (0.0, -sg * 0.12)]
            if (-sx * 0.12) * (-sg * 0.12) < 0:
                tri = [tri[0], tri[2], tri[1]]
            P.prism('gusset', tri, 0.008, (sx * L / 2, sg * W / 2, h + 0.014), 'steel', bev=None)
    top = h + 0.01
    for sg in (-1, 1):
        for i in range(5):
            x = -L / 2 + 0.1 + (L - 0.2) * i / 4
            spike(P, (x, sg * W / 2, top), (-0.15, sg * 0.5, 1.0), 0.21, 0.03)
    for i in range(4):
        y = -W / 2 + 0.15 + (W - 0.3) * i / 3
        spike(P, (L / 2, y, top), (0.9, 0.0, 0.6), 0.23, 0.032)
    for i in range(3):
        y = -W / 3 + W / 3 * i
        spike(P, (-L / 2, y, top), (-0.7, 0.0, 1.0), 0.17, 0.026)
    # the mohawk: tall spikes along the spine, swept back
    for i in range(5):
        x = 0.36 - 0.18 * i
        spike(P, (x, 0.0, top + 0.004), (-0.45, 0.0, 1.0), 0.28 - 0.025 * i, 0.036)
    P.fit_nominal(1.20, 1.00, 0.15)
    P.views = [('a', 35, 30), ('b', 215, 30)]


def plate(P, poly_xz, y0, thick, material, name='plate', tilt=0.0):
    """An armour plate: a polygon in the XZ plane, from y0 outwards by thick, tilted a little about X."""
    # tilt about the plate's centre line but keep it clear of the body (y >= 0)
    lift = abs(math.sin(math.radians(tilt))) * 0.31
    m = mat4((0, y0 + thick / 2 + lift, 0), (90 + tilt, 0, 0))
    return P.prism(name, [(x, z) for (x, z) in poly_xz], thick, matrix=m, material=material, bev=0.004, segs=2)


def build_arm_plates(P):
    """Steel side armour (LEFT): overlapping cut plates (one rusty, slightly out of line), two welded straps
    across them with big hex bolts, weld beads at the seams."""
    P.ao_distance = 0.05
    t = 0.012
    A = [(-1.0, -0.30), (-0.22, -0.30), (-0.18, 0.24), (-0.93, 0.28), (-1.0, 0.16)]
    B = [(-0.30, -0.28), (0.48, -0.30), (0.50, 0.29), (-0.26, 0.30)]
    C = [(0.38, -0.30), (1.0, -0.25), (1.0, 0.14), (0.86, 0.27), (0.40, 0.25)]
    D = [(-0.66, -0.08), (-0.36, -0.10), (-0.34, 0.12), (-0.64, 0.15)]
    plate(P, A, 0.0, t, 'steel', tilt=1.5)
    plate(P, C, 0.0, t, 'steel', tilt=-1.5)
    plate(P, B, t, t, 'rust')
    plate(P, D, t, t * 0.8, 'steel', name='patch', tilt=2.0)
    # two flat straps across everything, bolted through
    yb = 2 * t
    for z in (-0.19, 0.17):
        P.box('strap', (1.94, 0.01, 0.06), (0.0, yb + 0.005, z), 'steel', bev=0.003, segs=2)
        xs = [-0.9 + 0.3 * i for i in range(7)]
        P.bolts([(x, yb + 0.01, z) for x in xs], normal=(0, 1, 0), r=0.013, h=0.009, washer=True)
    # small rivets round the patch and the corners
    pts = [(-0.63, t * 1.8, -0.05), (-0.37, t * 1.8, -0.07), (-0.36, t * 1.8, 0.09), (-0.62, t * 1.8, 0.12)]
    pts += [(-0.95, t, 0.1), (0.95, t, -0.2), (0.95, t, 0.08), (-0.95, t, -0.24)]
    bm = bmesh.new()
    for p in pts:
        K.bm_sphere(bm, 0.011, u=8, v=4, matrix=Matrix.Translation(p) @ Matrix.Diagonal((1, 0.55, 1, 1)))
    P.mesh('rivets', bm, 'steel', sharp=70.0)
    # weld beads where B overlaps A and C
    P.tube('weld', [(-0.29, 2 * t, -0.27), (-0.255, 2 * t, 0.29)], 0.006, 'rust', segs=6)
    P.tube('weld', [(0.47, 2 * t, -0.29), (0.49, 2 * t, 0.28)], 0.006, 'rust', segs=6)
    P.fit_nominal(2.00, 0.02, 0.60)
    P.views = [('a', -60, 10), ('b', -120, 14)]


def build_mir_truck(P):
    """A big truck mirror (LEFT): two tubular arms from the door out to a tall rectangular head facing -X,
    a small convex spot mirror under it. Origin at the lower arm's foot."""
    P.ao_distance = 0.04
    for (z0, z1) in ((0.0, 0.05), (0.32, 0.28)):
        P.box('foot', (0.05, 0.016, 0.04), (0.0, 0.008, z0), 'steel', bev=0.004, segs=1)
        P.tube('arm', [(0.0, 0.016, z0), (-0.01, 0.12, z0 + (z1 - z0) * 0.3), (-0.02, 0.27, z1)], 0.011, 'chrome',
               segs=10, bend=0.05)
    hx, hy, hz = -0.03, 0.30, 0.165
    W, H = 0.17, 0.30
    sec = [(y, z) for (y, z) in K.rounded_rect(W, H, 0.02, seg=3)]
    rings = [K.section_x(sec, hx + 0.025, 0.9, hy, hz), K.section_x(sec, hx + 0.012, 1.0, hy, hz),
             K.section_x(sec, hx - 0.012, 1.0, hy, hz)]
    P.loft('head', rings, 'trim', cap_start=True, recalc=True, sharp=50.0)
    P.box('glass', (0.002, W - 0.012, H - 0.012), (hx - 0.013, hy, hz), 'chrome', bev=None)
    for z in (hz - H / 2 - 0.003, hz + H / 2 + 0.003):
        P.box('clamp', (0.03, 0.03, 0.016), (hx + 0.004, hy, z), 'steel', bev=0.004, segs=1)
    # spot mirror
    P.cyl('spot_arm', 0.006, 0.08, (hx, hy - 0.02, hz - H / 2 - 0.05), 'chrome', segs=8, bev=None)
    P.lathe('spot', [(0.0, 0.018), (0.03, 0.012), (0.042, 0.0)][::-1], loc=(hx + 0.01, hy - 0.02, hz - H / 2 - 0.1),
            material='trim', axis='X', segs=18, close='start', sharp=50.0)
    P.cyl('spot_glass', 0.038, 0.002, (hx - 0.0005, hy - 0.02, hz - H / 2 - 0.1), 'chrome', axis='X', segs=18,
          bev=None)
    P.views = [('a', 200, 12), ('b', 40, 15)]


def build_roof_lightbar(P):
    """A roof light bar: a bar across the front of the roof on two legs with gutter feet, four round lamps
    with chrome rims and black backs facing +X, the loom along the bar."""
    P.ao_distance = 0.05
    xb, zb = 0.48, 0.17
    P.tube('bar', [(xb, -0.50, zb), (xb, 0.50, zb)], 0.022, 'steel', segs=12)
    for sg in (-1, 1):
        P.tube('leg', [(xb, sg * 0.42, zb), (xb - 0.04, sg * 0.45, 0.06), (xb - 0.06, sg * 0.46, 0.02)], 0.018, 'steel',
               segs=10, bend=0.05)
        P.box('foot', (0.08, 0.05, 0.02), (xb - 0.06, sg * 0.46, 0.01), 'steel', bev=0.004, segs=1)
        P.box('pad', (0.085, 0.055, 0.008), (xb - 0.06, sg * 0.46, 0.0005), 'rubber', bev=0.002, segs=1)
        P.cyl('end_cap', 0.024, 0.01, (xb, sg * 0.505, zb), 'trim', axis='Y', segs=12, bev=0.002, bsegs=1)
    for i in range(4):
        y = -0.33 + 0.22 * i
        c = V((xb + 0.04, y, zb + 0.085))
        P.box('lamp_tab', (0.03, 0.03, 0.06), (xb, y, zb + 0.035), 'steel', bev=0.003, segs=1)
        P.lathe('lamp_can', [(0.0, -0.06), (0.04, -0.058), (0.064, -0.035), (0.072, 0.0)], loc=tuple(c),
                material='trim', axis='X', segs=24, sharp=40.0)
        P.lathe('lamp_refl', [(0.01, -0.04), (0.04, -0.03), (0.068, 0.0)][::-1], loc=tuple(c), material='chrome',
                axis='X', segs=24, sharp=40.0)
        P.lathe('lamp_lens', [(0.068, 0.0), (0.05, 0.008), (0.0, 0.012)], loc=tuple(c), material='lens_head',
                axis='X', segs=24, sharp=60.0)
        P.lathe('lamp_rim', [(0.064, -0.004), (0.076, -0.004), (0.077, 0.006), (0.07, 0.012), (0.066, 0.008)],
                loc=tuple(c), material='chrome', axis='X', segs=24, loop=True, sharp=50.0)
        P.cyl('lamp_bulb', 0.01, 0.02, tuple(c + V((-0.02, 0, 0))), 'emit', axis='X', segs=8, bev=None)
    P.tube('loom', [(xb - 0.02, -0.4, zb - 0.02), (xb - 0.02, 0.4, zb - 0.02), (xb - 0.1, 0.46, zb - 0.05)], 0.006,
           'trim', segs=6, bend=0.04)
    P.fit_nominal(1.20, 1.00, 0.15)
    P.views = [('a', 35, 18), ('b', 215, 24)]


def build_roof_solar(P):
    """A solar panel on the roof: an alloy frame round dark cells with their grid, four tilt feet, the
    junction box and its cable."""
    P.ao_distance = 0.05
    L, W = 1.12, 0.92
    z = 0.075
    P.box('cells', (L - 0.04, W - 0.04, 0.012), (0.0, 0, z), 'glass_dark', bev=None)
    for sx in (-1, 1):
        P.box('frame_x', (0.03, W, 0.03), (sx * (L / 2 - 0.015), 0, z), 'alu', bev=0.004, segs=1)
    for sy in (-1, 1):
        P.box('frame_y', (L - 0.06, 0.03, 0.03), (0, sy * (W / 2 - 0.015), z), 'alu', bev=0.004, segs=1)
    bm = bmesh.new()
    for i in range(1, 10):
        x = -L / 2 + 0.02 + (L - 0.04) * i / 10
        K.bm_cube(bm, (0.004, W - 0.05, 0.002), mat4((x, 0, z + 0.0065)))
    for j in range(1, 6):
        y = -W / 2 + 0.02 + (W - 0.04) * j / 6
        K.bm_cube(bm, (L - 0.05, 0.004, 0.002), mat4((0, y, z + 0.0066)))
    P.mesh('grid', bm, 'alu', sharp=60.0)
    for sx in (-1, 1):
        for sy in (-1, 1):
            x, y = sx * (L / 2 - 0.1), sy * (W / 2 - 0.05)
            P.box('foot', (0.07, 0.04, 0.008), (x, y, 0.004), 'alu', bev=0.002, segs=1)
            P.box('strut', (0.02, 0.025, z - 0.01), (x, y, z / 2), 'alu', bev=0.003, segs=1)
            P.bolt((x + 0.025, y, 0.008), r=0.006, h=0.005)
    P.box('junction', (0.1, 0.07, 0.03), (-L / 4, 0, z - 0.022), 'trim', bev=0.005, segs=1)
    P.tube('cable', [(-L / 4 - 0.05, 0.0, z - 0.025), (-L / 2 - 0.02, 0.05, z - 0.03), (-L / 2 - 0.05, 0.12, 0.01)],
           0.006, 'trim', segs=6, bend=0.05)
    P.fit_nominal(1.20, 1.00, 0.15)
    P.views = [('a', 35, 30), ('b', 215, 30)]


def build_arm_planks(P):
    """Plank armour (LEFT): rough boards of uneven length, one broken, held by three rusty steel straps with
    big bolts, nails along the board ends."""
    P.ao_distance = 0.05
    t = 0.022
    boards = [(-0.30, -0.98, 0.97, 0.0), (-0.165, -1.0, 0.86, 1.2), (-0.03, -0.92, 1.0, -0.8), (0.105, -1.0, 0.55, 0.6),
              (0.105, 0.6, 0.98, -0.5), (0.24, -0.9, 0.95, 0.9)]
    for (z, x0, x1, tilt) in boards:
        poly = [(x0, -0.06), (x1, -0.06), (x1 + 0.012, 0.06), (x0 - 0.008, 0.06)]
        m = mat4(((0.0), t / 2, z), (90, tilt, 0))
        P.prism('board', poly, t, matrix=m, material='wood', bev=0.004, segs=1)
    for x in (-0.68, 0.0, 0.68):
        P.box('strap', (0.06, 0.008, 0.66), (x, t + 0.004, -0.03), 'rust', bev=0.003, segs=1)
        P.bolts([(x, t + 0.008, z) for (z, _, _, _) in boards[:4]] + [(x, t + 0.008, 0.24)], normal=(0, 1, 0),
                r=0.012, h=0.008, washer=True)
    bm = bmesh.new()
    for (z, x0, x1, tilt) in boards:
        for xx in (x0 + 0.05, x1 - 0.05):
            for dz in (-0.03, 0.03):
                K.bm_cyl(bm, 0.004, 0.002, segs=6, matrix=Matrix.Translation((xx, t + 0.001, z + dz)) @
                         K.axis_matrix('Y'))
    P.mesh('nails', bm, 'steel', sharp=60.0)
    P.fit_nominal(2.00, 0.02, 0.60)
    P.views = [('a', -60, 10), ('b', -120, 14)]


def build_bf_plow(P):
    """A snow plough on the front mount: a curved painted moldboard with a steel cutting edge and rubber top
    flap, ribs behind, an A-frame back to the bumper mount with a lift ram, skid shoes, marker rods."""
    P.ao_distance = 0.12
    Wb = 0.95
    # moldboard: a curved section (x, z) swept across Y
    prof = []
    for i in range(9):
        t = i / 8
        a = math.radians(-60 + 120 * t)
        x = 0.62 - 0.16 * math.cos(a)
        z = 0.18 + 0.30 * math.sin(a)
        prof.append((x, z))
    thick = 0.012
    outer = [(x, z) for (x, z) in prof]
    inner = [(x - thick, z) for (x, z) in reversed(prof)]
    sec = outer + inner
    rings = []
    for y in (-Wb, -Wb * 0.8, 0.0, Wb * 0.8, Wb):
        bend = 0.06 * (abs(y) / Wb) ** 2
        rings.append([(x + bend, y, z) for (x, z) in sec])
    bm = bmesh.new()
    vr, faces = K.bm_loft(bm, [[(p[0], p[1], p[2]) for p in r] for r in rings], cap_start=True, cap_end=True)
    # the loft runs along Y: rebuild each ring as 3D points in the (x, z) plane at that y
    bmesh.ops.recalc_face_normals(bm, faces=faces)
    P.mesh('blade', bm, 'paint', bev=0.004, segs=1, sharp=40.0)
    P.box('edge', (0.03, 2 * Wb, 0.05), (0.535, 0.0, -0.085), 'steel', rot=(0, 20, 0), bev=0.004, segs=1)
    P.bolts([(0.555, y, -0.085) for y in (-0.8, -0.48, -0.16, 0.16, 0.48, 0.8)], normal=(0.94, 0, -0.34), r=0.009,
            h=0.006, washer=False)
    P.tube('lip', [(0.548, -Wb, 0.445), (0.548, Wb, 0.445)], 0.012, 'paint', segs=10)
    P.box('flap', (0.01, 2 * Wb, 0.07), (0.53, 0.0, 0.49), 'rubber', rot=(0, -25, 0), bev=0.003, segs=1)
    back = []
    for i in range(9):
        t = i / 8
        a = math.radians(-60 + 120 * t)
        back.append((0.62 - 0.16 * math.cos(a) - thick - 0.002, 0.18 + 0.30 * math.sin(a)))
    rib = back + [(0.37, 0.36), (0.36, 0.0)]
    for y in (-0.7, -0.35, 0.0, 0.35, 0.7):
        bend = 0.06 * (abs(y) / Wb) ** 2
        P.prism('rib', [(x + bend, z) for (x, z) in rib], 0.016, matrix=mat4((0, y, 0), (90, 0, 0)),
                material='paint', bev=0.003, segs=1)
    P.box('crossbar', (0.04, 1.5, 0.05), (0.40, 0.0, 0.18), 'paint', bev=0.006, segs=1)
    # A-frame to the mount plate on the attach face, lift ram
    P.box('mount', (0.02, 0.5, 0.18), (0.01, 0.0, 0.0), 'steel', bev=0.004, segs=1)
    for sg in (-1, 1):
        P.tube('frame', [(0.02, sg * 0.2, -0.04), (0.2, sg * 0.3, 0.0), (0.4, sg * 0.45, 0.12)], 0.025, 'steel',
               segs=10, bend=0.08)
    P.cyl('ram_barrel', 0.03, 0.22, (0.15, 0.0, 0.12), 'paint', rot=(0, 70, 0), segs=14, bev=0.004, bsegs=1)
    P.cyl('ram_rod', 0.014, 0.16, (0.28, 0.0, 0.17), 'chrome', rot=(0, 70, 0), segs=10, bev=None)
    P.tube('hose', [(0.06, 0.02, 0.09), (0.04, 0.1, 0.03), (0.01, 0.15, -0.02)], 0.008, 'rubber', segs=6, bend=0.03)
    for sg in (-1, 1):
        P.box('skid', (0.16, 0.06, 0.02), (0.48, sg * 0.85, -0.12), 'steel', bev=0.006, segs=1)
        P.tube('marker', [(0.44, sg * 0.93, 0.45), (0.44, sg * 0.93, 0.95)], 0.005, 'steel', segs=6)
        P.cyl('marker_tip', 0.012, 0.06, (0.44, sg * 0.93, 0.96), 'lens_amber', segs=8, bev=0.002, bsegs=1)
    P.fit_nominal(0.25, 1.60, 0.22)
    P.views = [('a', 35, 18), ('b', 160, 20)]


def build_br_spikes(P):
    """A spiked rear bar: a rusty box section across the back with spikes pointing rearwards and out at the
    corners, heavy brackets to the body, a tow hook."""
    P.ao_distance = 0.08
    P.box('bar', (0.12, 1.6, 0.14), (-0.13, 0.0, 0.0), 'rust', bev=0.012, segs=2)
    P.box('top_plate', (0.14, 1.5, 0.012), (-0.13, 0.0, 0.074), 'steel', bev=0.004, segs=1)
    for y in (-0.55, 0.55):
        P.box('bracket', (0.12, 0.06, 0.1), (-0.04, y, 0.0), 'steel', bev=0.006, segs=1)
        P.box('bracket_plate', (0.014, 0.14, 0.16), (-0.007, y, 0.0), 'steel', bev=0.003, segs=1)
        P.bolts([(-0.014, y + sy * 0.045, sz * 0.05) for sy in (-1, 1) for sz in (-1, 1)], normal=(-1, 0, 0), r=0.008,
                h=0.007, washer=True)
    for i in range(6):
        y = -0.62 + 0.248 * i
        spike(P, (-0.19, y, 0.0), (-1.0, 0.0, 0.0), 0.16, 0.03)
    for sg in (-1, 1):
        spike(P, (-0.13, sg * 0.8, 0.0), (-0.6, sg * 1.0, 0.0), 0.18, 0.032)
    P.cyl('hitch', 0.025, 0.1, (-0.22, 0.0, -0.06), 'steel', axis='X', segs=12, bev=0.004, bsegs=1)
    P.torus('hook', 0.035, 0.012, loc=(-0.28, 0.0, -0.07), axis='Y', segs=14, rsegs=6, material='steel',
            arc=math.radians(250), a0=math.radians(-35))
    P.fit_nominal(0.25, 1.60, 0.22)
    P.views = [('a', 215, 18), ('b', 340, 18)]


# ------------------------------------------------------------------------------------------------ door style add-ons
#
# The doors themselves take their shape from each frame; these overlays dress any door in a style. LEFT side,
# origin at the centre of the overlay's inner face (it lies on the door skin at y = 0 and stands out to +Y),
# stretch parts with fit_nominal = [length, thickness, height].


def build_door_armor_overlay(P):
    """Bolted steel armour for the lower half of a door: two overlapping plates, an angle-iron lip on top,
    big bolts, a weld bead."""
    P.ao_distance = 0.04
    t = 0.01
    plate(P, [(-0.5, -0.25), (0.12, -0.25), (0.14, 0.2), (-0.48, 0.22), (-0.5, 0.12)], 0.0, t, 'steel')
    plate(P, [(0.04, -0.24), (0.5, -0.25), (0.5, 0.16), (0.44, 0.21), (0.06, 0.2)], t, t, 'rust', tilt=-1.0)
    # angle iron along the top edge
    P.box('lip_h', (0.98, 0.04, 0.008), (0.0, 0.02, 0.24), 'steel', bev=0.002, segs=1)
    P.box('lip_v', (0.98, 0.008, 0.04), (0.0, 0.036, 0.222), 'steel', bev=0.002, segs=1)
    pts = []
    for x in (-0.42, -0.24, -0.06):
        pts += [(x, t, -0.2), (x, t, 0.15)]
    for x in (0.12, 0.28, 0.44):
        pts += [(x, 2 * t + 0.002, -0.19), (x, 2 * t + 0.002, 0.13)]
    P.bolts(pts, normal=(0, 1, 0), r=0.012, h=0.008, washer=True)
    P.tube('weld', [(0.05, 2 * t, -0.23), (0.07, 2 * t, 0.19)], 0.005, 'rust', segs=6)
    P.fit_nominal(1.00, 0.03, 0.50)
    P.views = [('a', -60, 10), ('b', -120, 14)]


def build_door_cage_overlay(P):
    """A welded wire cage over the window opening: a square-tube frame, a grid of rods, corner gussets and
    four bolts."""
    P.ao_distance = 0.04
    L, H = 0.80, 0.42
    for (sx, sz, w, h) in ((0, 1, L, 0.025), (0, -1, L, 0.025), (1, 0, 0.025, H), (-1, 0, 0.025, H)):
        P.box('frame', (w, 0.025, h), (sx * (L / 2 - 0.0125), 0.0125, sz * (H / 2 - 0.0125)), 'steel', bev=0.003,
              segs=1)
    bm = bmesh.new()
    nx, nz = 13, 7
    for i in range(1, nx):
        x = -L / 2 + L * i / nx
        K.bm_sweep(bm, [(x, 0.018, -H / 2 + 0.02), (x, 0.018, H / 2 - 0.02)], 0.004, segs=6, caps=False)
    for j in range(1, nz):
        z = -H / 2 + H * j / nz
        K.bm_sweep(bm, [(-L / 2 + 0.02, 0.012, z), (L / 2 - 0.02, 0.012, z)], 0.004, segs=6, caps=False)
    P.mesh('mesh', bm, 'steel', sharp=80.0, wn=False)
    for sx in (-1, 1):
        for sz in (-1, 1):
            a, b = -sx * 0.06, -sz * 0.06
            tri = [(0, 0), (a, 0), (0, b)] if a * b > 0 else [(0, 0), (0, b), (a, 0)]
            P.prism('gusset', tri, 0.006, matrix=mat4((sx * (L / 2 - 0.025), 0.027, sz * (H / 2 - 0.025)), (90, 0, 0)),
                    material='steel', bev=None)
            P.bolt((sx * (L / 2 - 0.0125), 0.025, sz * (H / 2 - 0.0125)), normal=(0, 1, 0), r=0.009, h=0.007)
    P.fit_nominal(0.80, 0.03, 0.42)
    P.views = [('a', -60, 10), ('b', -120, 14)]


def build_door_fridge_handle(P):
    """The fridge-door style: a 1960s chrome lever handle on its base and a blank chrome badge (origin at the
    handle's base on the door skin, facing +Y)."""
    P.ao_distance = 0.02
    P.pillow('base', (0.05, 0.016, 0.34), (0.0, 0.008, 0.0), 'chrome', r=0.006, sub=1)
    P.tube('handle', [(0.0, 0.012, -0.15), (0.0, 0.05, -0.12), (0.0, 0.055, 0.12), (0.0, 0.012, 0.15)], 0.011,
           'chrome', segs=12, bend=0.04)
    P.pillow('grip', (0.03, 0.012, 0.18), (0.0, 0.066, 0.0), 'ceramic', r=0.005, sub=1)
    P.lathe('badge', [(0.0, 0.006), (0.04, 0.005), (0.046, 0.002), (0.046, 0.0)][::-1], loc=(0.0, 0.0, 0.235),
            material='chrome', axis='Y', segs=24, close='start', sharp=50.0)
    P.statics[-1].data.transform(Matrix.Translation((0.0, 0, 0.235)) @ Matrix.Diagonal((1.8, 1, 1, 1)) @
                                 Matrix.Translation((0.0, 0, -0.235)))
    P.views = [('a', -60, 10), ('b', -120, 14)]


PARTS = {
    'bf_stock': build_bf_stock,
    'br_stock': build_br_stock,
    'bf_bullbar': build_bf_bullbar,
    'bf_ram': build_bf_ram,
    'bf_plow': build_bf_plow,
    'br_spikes': build_br_spikes,
    'mir_stock': build_mir_stock,
    'mir_truck': build_mir_truck,
    'roof_rack': build_roof_rack,
    'roof_spikes': build_roof_spikes,
    'roof_lightbar': build_roof_lightbar,
    'roof_solar': build_roof_solar,
    'arm_plates': build_arm_plates,
    'arm_planks': build_arm_planks,
    'door_armor_overlay': build_door_armor_overlay,
    'door_cage_overlay': build_door_cage_overlay,
    'door_fridge_handle': build_door_fridge_handle,
}


def main(args):
    K.run(PARTS, args)
