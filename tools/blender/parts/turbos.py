"""
Turbochargers bigger than the engines' own turbo_small (docs/MODCAR.md section 2.3).

    blender -b --factory-startup --python tools/blender/build.py -- parts/turbos [<id>|all] [--norender]

Each bolts to an engine's M_turbo exactly as turbo_small (engines.py) does, so any engine that takes turbo_small takes
these: origin at the centre of the turbine inlet flange, the flange facing down (the turbo sits on +Z of it), shaft
along Y with the turbine's exhaust out towards -Y and the compressor towards +Y, the same 75 x 60 mm flange and four
bolts. No sub-mounts.

    turbo_mid  about 1.3 times turbo_small's housings: a blow-off valve on the compressor outlet stub, a short alloy
               elbow to a hose and a ribbed cone filter
    turbo_big  a compressor about 1.7 times turbo_small's with a big open inlet and a wire guard over the wheel, a
               quilted heat blanket over the turbine, an external wastegate on a short steel pipe off the turbine
               housing, braided oil lines; its flange end kept as compact as turbo_small's
"""
import math

import bmesh
from mathutils import Matrix

from parts import _kit as K
from parts._kit import V, mat4


# ------------------------------------------------------------------------------------------------ pieces


def flange(P):
    """turbo_small's inlet flange and its four bolts, as they are there."""
    P.box('flange', (0.075, 0.06, 0.012), (0.0, 0.0, 0.006), 'rust', bev=0.004, segs=1)
    P.bolts([(sx * 0.028, sy * 0.021, 0.012) for sx in (-1, 1) for sy in (-1, 1)], normal=(0, 0, 1), r=0.006, h=0.005,
            washer=False, material='steel')


def spiral(c, R0, R1, a0, a1, n):
    """Points of a spiral round the axis Y through c, in the XZ plane: angle a0 to a1 (deg, from +X towards +Z),
    radius R0 to R1."""
    out = []
    for i in range(n + 1):
        t = i / n
        a = math.radians(a0 + (a1 - a0) * t)
        R = R0 + (R1 - R0) * t
        out.append(V((c[0] + R * math.cos(a), c[1], c[2] + R * math.sin(a))))
    return out


def bezier(a, b, c, n):
    """n + 1 points of the quadratic Bezier from a to c with the control point b (a bend with its own ring count)."""
    a, b, c = V(a), V(b), V(c)
    return [a * (1 - t) ** 2 + b * (2 * t * (1 - t)) + c * (t * t) for t in (i / n for i in range(n + 1))]


def tangent(a1):
    """The direction a spiral of increasing angle runs at angle a1 (deg)."""
    a = math.radians(a1)
    return V((-math.sin(a), 0.0, math.cos(a)))


def sweep(P, name, pts_r, material, sides=8, caps=True, sharp=80.0, profile=None, **kw):
    """A tube along the points with a radius at each: pts_r = [(point, radius), ...] (no corner rounding)."""
    pts = [V(p) for p, _ in pts_r]
    rad = [r for _, r in pts_r]
    L = [0.0]
    for a, b in zip(pts[:-1], pts[1:]):
        L.append(L[-1] + (b - a).length)
    s = [x / L[-1] for x in L]
    rmax = max(rad)

    def rf(t):
        for i in range(len(s) - 1):
            if t <= s[i + 1] + 1e-9:
                u = (t - s[i]) / ((s[i + 1] - s[i]) or 1.0)
                return (rad[i] + (rad[i + 1] - rad[i]) * u) / rmax
        return rad[-1] / rmax

    return P.tube(name, pts, rmax, material, segs=sides, bend=0.0, caps=caps, radius_fn=rf, sharp=sharp,
                  profile=profile, **kw)


def snail(P, name, c, R0, R1, r0, r1, a0, a1, material, tail=(), n=12, sides=8, **kw):
    """A volute round the axis Y through c: its path spirals from a0 to a1 (deg) and R0 to R1 while the section grows
    from r0 to r1, then runs on through tail = [(point, radius), ...] (a tangential outlet, a neck)."""
    path = spiral(c, R0, R1, a0, a1, n)
    pts_r = [(p, r0 + (r1 - r0) * min(1.0, i / n * 1.15)) for i, p in enumerate(path)] + list(tail)
    return sweep(P, name, pts_r, material, sides=sides, **kw)


def hose_clamp(P, at, axis, r, w=0.007, material='steel'):
    """A band clamp round a hose: a thin ring with its screw housing."""
    ax = V(axis).normalized()
    P.cyl('clamp', r, w, tuple(at), material, axis=ax, segs=12, bev=None)
    fr = K.frame_from_z(ax, (1, 0, 0)).to_3x3()
    side = fr @ V((0, 1, 0))
    P.box('clamp_screw', (w * 1.3, 0.008, 0.01), tuple(V(at) + side * (r + 0.003)), material,
          rot=_euler_of(K.frame_from_z(side, tuple(ax))), bev=None)


def _euler_of(m4):
    return [math.degrees(a) for a in m4.to_euler('XYZ')]


def pleated_cone(P, name, base, axis, r_base, r_top, length, pleats=12, depth=0.12, material='paint'):
    """A cone filter element: a straight sweep from base along axis with a star section (pleats running its length),
    r_base to r_top."""
    ax = V(axis).normalized()
    prof = []
    for i in range(pleats * 2):
        a = math.tau * i / (pleats * 2)
        k = 1.0 if i % 2 == 0 else 1.0 - depth
        prof.append((k * math.cos(a), k * math.sin(a)))
    p0 = V(base)
    pts = [p0, p0 + ax * length]
    # (open ends: the star caps would be concave polygons, and the base ring and the end cap cover them)
    return P.tube(name, pts, r_base, material, profile=prof, caps=False, bend=0.0, sharp=30.0,
                  radius_fn=lambda t: 1.0 + (r_top / r_base - 1.0) * t)


def an_fitting(P, at, axis, r=0.0085, h=0.012, material='paint'):
    """An anodised AN fitting where a braided line meets the housing: a hex nut on the line's axis."""
    ax = V(axis).normalized()
    bm = bmesh.new()
    K.bm_hex(bm, r, h, matrix=Matrix.Translation(V(at) - ax * h / 2) @ K.frame_from_z(ax), taper=0.9)
    P.mesh('an_nut', bm, material, sharp=50)


# ------------------------------------------------------------------------------------------------ turbo_mid


def build_turbo_mid(P):
    """A medium turbocharger, about 1.3 times turbo_small: cast-iron turbine snail on the same flange, steel centre
    housing with its oil lines, alloy compressor snail whose outlet stub carries a blow-off valve, and a short alloy
    elbow from the compressor inlet up to a rubber hose and a ribbed red cone filter. Shaft along Y."""
    P.ao_distance = 0.06
    zc = 0.104          # shaft height above the inlet flange
    yt, yc = -0.046, 0.074
    flange(P)
    P.box('throat', (0.056, 0.05, 0.044), (0.0, 0.0, 0.034), 'rust', bev=0.009, segs=1)
    # --- turbine: the core, the snail running down into the throat, the exhaust outlet and its flange
    P.lathe('turbine_core', [(0.0, -0.037), (0.057, -0.037), (0.067, -0.015), (0.067, 0.015), (0.058, 0.037),
                             (0.0, 0.037)], loc=(0, yt, zc), material='rust', axis='Y', segs=16, sharp=40.0)
    ct = V((0, yt, zc))
    e = spiral(ct, 0.064, 0.079, -90, 216, 1)[-1]
    snail(P, 'turbine_snail', ct, 0.064, 0.079, 0.020, 0.036, -90, 216, 'rust',
          tail=[(e + tangent(216) * 0.036, 0.034)], n=13)
    P.cyl('t_out', 0.041, 0.034, (0, yt - 0.052, zc), 'rust', axis='Y', segs=14, bev=None)
    P.cyl('t_out_flange', 0.053, 0.011, (0, yt - 0.074, zc), 'rust', axis='Y', segs=14, bev=0.003, bsegs=1)
    # --- centre housing, oil feed (steel) and drain (rubber)
    P.cyl('chra', 0.035, 0.05, (0, 0.012, zc), 'steel', axis='Y', segs=14, bev=0.004, bsegs=1)
    P.tube('oil_feed', bezier((0, 0.014, zc + 0.03), (0.0, 0.018, zc + 0.11), (0.062, 0.024, zc + 0.115), 3), 0.0045,
           'steel', segs=6, bend=0.0)
    P.tube('oil_drain', bezier((0, 0.014, zc - 0.03), (0.0, 0.018, zc - 0.095), (0.055, 0.024, zc - 0.098), 3),
           0.0105, 'rubber', segs=8, bend=0.0)
    # --- compressor: the core, the snail and its outlet stub (a hose bead at the end)
    P.lathe('comp_core', [(0.0, -0.032), (0.066, -0.032), (0.077, -0.011), (0.077, 0.011), (0.066, 0.029),
                          (0.0, 0.029)], loc=(0, yc, zc), material='alu', axis='Y', segs=16, sharp=40.0)
    cc = V((0, yc, zc))
    e = spiral(cc, 0.072, 0.088, 90, 396, 1)[-1]
    tg = tangent(396)
    snail(P, 'comp_snail', cc, 0.072, 0.088, 0.018, 0.033, 90, 396, 'alu',
          tail=[(e + tg * 0.03, 0.031), (e + tg * 0.075, 0.029)], n=13)
    tip = e + tg * 0.075
    P.cyl('outlet_bead', 0.032, 0.008, tuple(tip - tg * 0.006), 'alu', axis=tg, segs=12, bev=None)
    # the blow-off valve on the stub's forward side: a weld boss, the body, its red cap and the vacuum line
    nb = V((tg.z, 0.0, -tg.x))      # across the stub in the XZ plane, forwards-up
    vb = e + tg * 0.042 + nb * 0.027
    P.cyl('bov_boss', 0.015, 0.014, tuple(vb - nb * 0.004), 'alu', axis=nb, segs=10, bev=None)
    P.cyl('bov_body', 0.021, 0.03, tuple(vb + nb * 0.017), 'alu', axis=nb, segs=12, bev=0.003, bsegs=1)
    P.lathe('bov_cap', [(0.0, 0.016), (0.014, 0.0155), (0.022, 0.009), (0.023, 0.0)][::-1],
            loc=tuple(vb + nb * 0.032), material='paint', axis=nb, segs=12, close='start', sharp=40.0)
    nip = vb + nb * 0.047
    P.tube('bov_nipple', [nip - nb * 0.004, nip + nb * 0.007], 0.003, 'steel', segs=6)
    P.tube('bov_line', bezier(nip + nb * 0.006, nip + nb * 0.03 + V((0, 0.03, 0)), cc + V((0.05, 0.035, 0.055)), 2),
           0.0042, 'rubber', segs=6, bend=0.0)
    # --- intake: the inlet spigot, a short alloy elbow turning up (leaning back over the turbo), the hose with its two
    # clamps and the cone filter: a black base ring, the ribbed red element, a black end cap
    yi = yc + 0.029
    P.lathe('comp_in', [(0.04, 0.0), (0.048, 0.0), (0.048, 0.03), (0.042, 0.03)], loc=(0, yi, zc), material='alu',
            axis='Y', segs=14, sharp=40.0)
    P.lathe('wheel', [(0.0, 0.026), (0.011, 0.024), (0.03, 0.006), (0.034, 0.0)][::-1], loc=(0, yi, zc),
            material='steel', axis='Y', segs=12, close='start', sharp=40.0)
    f = V((0.0, -0.22, 1.0)).normalized()
    knee = V((0, yi + 0.062, zc))
    ell = [V((0, yi + 0.02, zc))] + bezier(knee - V((0, 0.034, 0)), knee, knee + f * 0.034, 4) + [knee + f * 0.07]
    P.tube('elbow', ell, 0.042, 'alu', segs=10, bend=0.0, caps=True)
    h0 = knee + f * 0.062
    P.cyl('hose', 0.047, 0.044, tuple(h0 + f * 0.022), 'rubber', axis=f, segs=12, bev=0.003, bsegs=1)
    hose_clamp(P, h0 + f * 0.009, f, 0.049)
    hose_clamp(P, h0 + f * 0.036, f, 0.049)
    b0 = h0 + f * 0.046
    P.cyl('filter_base', 0.059, 0.012, tuple(b0 + f * 0.006), 'trim', axis=f, segs=16, bev=0.003, bsegs=1)
    pleated_cone(P, 'filter', b0 + f * 0.010, f, 0.057, 0.041, 0.083, pleats=12, depth=0.10, material='paint')
    P.lathe('filter_cap', [(0.0, 0.012), (0.03, 0.011), (0.044, 0.004), (0.046, 0.0)][::-1],
            loc=tuple(b0 + f * 0.091), material='trim', axis=f, segs=12, close='start', sharp=40.0)
    # --- the wastegate actuator on the compressor side, its rod to the turbine
    P.cyl('wg_can', 0.03, 0.034, (0.082, yc - 0.004, zc + 0.026), 'alu', axis='Y', segs=12, bev=0.004, bsegs=1)
    P.box('wg_brk', (0.03, 0.06, 0.008), (0.07, 0.032, zc + 0.024), 'steel', bev=None)
    P.tube('wg_rod', [(0.082, yc - 0.03, zc + 0.026), (0.075, yt + 0.004, zc + 0.034)], 0.0035, 'steel', segs=5)
    P.views = [('a', 35, 20), ('b', 215, 20)]


# ------------------------------------------------------------------------------------------------ turbo_big


def quilt_sweep(P, name, pts_r, material, sides=10, seam=0.86, every=2, **kw):
    """A quilted wrap along a path (pts_r as in sweep): every other point of the section pulled in to the seam
    fraction, and every `every`-th ring of the path pulled in likewise - soft pillows between stitched seams."""
    prof = []
    for i in range(sides):
        a = math.tau * i / sides
        k = seam if i % 2 == 0 else 1.0
        prof.append((k * math.cos(a), k * math.sin(a)))
    pts = [V(p) for p, _ in pts_r]
    rad = [r * (seam if i % every == 0 else 1.0) for i, (_, r) in enumerate(pts_r)]
    return sweep(P, name, list(zip(pts, rad)), material, sides=sides, profile=prof, sharp=38.0, **kw)


def quilt_disc(P, name, c, axis, r0, r1, n_ang=8, n_rad=2, puff=0.004, material='trim'):
    """A quilted face (one-sided, facing along axis) on a ring r0..r1 round c: n_ang x n_rad pillows."""
    ax = V(axis).normalized()
    fr = K.frame_from_z(ax, (1, 0, 0)).to_3x3()
    bm = bmesh.new()
    na, nr = n_ang * 2, n_rad * 2
    grid = []
    for k in range(nr + 1):
        r = r0 + (r1 - r0) * k / nr
        ring = []
        for j in range(na):
            a = math.tau * j / na
            z = puff if (k % 2 == 1 and j % 2 == 1) else 0.0
            ring.append(bm.verts.new(V(c) + fr @ V((r * math.cos(a), r * math.sin(a), z))))
        grid.append(ring)
    # (wound to face along axis: the game draws it one-sided)
    for k in range(nr):
        for j in range(na):
            j2 = (j + 1) % na
            bm.faces.new((grid[k][j], grid[k + 1][j], grid[k + 1][j2], grid[k][j2]))
    return P.mesh(name, bm, material, sharp=30.0, wn=False)


def build_turbo_big(P):
    """A big turbocharger: a large alloy compressor (about 1.7 times turbo_small's) with a big open inlet and a wire
    guard over the wheel; the turbine under a quilted black heat blanket held by two steel straps, on the same compact
    flange and throat as turbo_small; an external wastegate on a short steel pipe off the turbine housing, its dump
    tube; braided steel oil lines with red fittings. Shaft along Y."""
    P.ao_distance = 0.07
    zc = 0.112
    yt, yc = -0.05, 0.112
    flange(P)
    P.box('throat', (0.052, 0.047, 0.05), (0.0, 0.0, 0.037), 'rust', bev=0.009, segs=1)
    # --- turbine under the blanket: the scroll's shape wrapped, the core and the outer face quilted, two straps round
    # it; the exhaust outlet bare, with its V-band clamp
    ct = V((0, yt, zc))
    n = 15
    sp = spiral(ct, 0.07, 0.085, -90, 214, n)
    sr = [0.026 + 0.019 * min(1.0, i / n * 1.15) for i in range(n + 1)]
    tail = [(sp[-1] + tangent(214) * 0.02, 0.043), (sp[-1] + tangent(214) * 0.04, 0.04)]
    quilt_sweep(P, 'blanket', list(zip(sp, sr)) + tail, 'trim', sides=12, seam=0.84, every=3)
    P.lathe('blanket_core', [(0.0, -0.041), (0.07, -0.041), (0.079, -0.02), (0.079, 0.02), (0.07, 0.04),
                             (0.0, 0.04)], loc=tuple(ct), material='trim', axis='Y', segs=16, sharp=40.0)
    quilt_disc(P, 'blanket_face', ct + V((0, -0.0425, 0)), (0, -1, 0), 0.05, 0.08, n_ang=9, n_rad=1, puff=0.007)
    for dy in (-0.02, 0.02):
        pts = []
        for i in list(range(0, n, 2)) + [n]:
            out = sp[i] - ct
            out.y = 0.0
            out.normalize()
            pts.append(sp[i] + out * (math.sqrt(max(0.0, sr[i] ** 2 - dy * dy)) + 0.0012) + V((0, dy, 0)))
        P.tube('strap', pts, 1.0, 'steel', bend=0.0, caps=True, sharp=50.0,
               profile=[(-0.0012, -0.0035), (0.0012, -0.0035), (0.0012, 0.0035), (-0.0012, 0.0035)])
    P.cyl('t_out', 0.047, 0.03, (0, yt - 0.056, zc), 'rust', axis='Y', segs=14, bev=0.003, bsegs=1)
    P.cyl('vband', 0.0505, 0.009, (0, yt - 0.069, zc), 'steel', axis='Y', segs=14, bev=None, caps=False)
    P.box('vband_bolt', (0.012, 0.009, 0.01), (0.0, yt - 0.069, zc + 0.054), 'steel', bev=None)
    P.cyl('t_out_flange', 0.056, 0.01, (0, yt - 0.078, zc), 'rust', axis='Y', segs=14, bev=None)
    # --- external wastegate: a short steel pipe off the turbine housing's inlet end, the alloy valve with its red
    # actuator top, the dump tube, the boost line to the compressor
    w0 = tail[0][0] + V((0.0, -0.012, 0.0))
    wd = V((-0.5, -0.5, 0.72)).normalized()
    P.tube('wg_pipe', [w0, w0 + wd * 0.07], 0.016, 'steel', segs=8)
    wv = w0 + wd * 0.07
    P.cyl('wg_flange', 0.026, 0.008, tuple(wv + wd * 0.003), 'steel', axis=wd, segs=10, bev=None)
    P.cyl('wg_body', 0.027, 0.04, tuple(wv + wd * 0.026), 'alu', axis=wd, segs=12, bev=None)
    P.lathe('wg_top', [(0.0, 0.024), (0.02, 0.023), (0.03, 0.013), (0.032, 0.0)][::-1], loc=tuple(wv + wd * 0.046),
            material='paint', axis=wd, segs=12, close='start', sharp=40.0)
    ws = wv + wd * 0.016
    sd = (V((0.0, 0.0, -1.0)) - wd * wd.z).normalized()
    P.tube('wg_dump', [ws] + bezier(ws + sd * 0.03, ws + sd * 0.05, ws + sd * 0.05 + V((-0.02, -0.022, -0.02)), 2),
           0.013, 'steel', segs=8, bend=0.0)
    side = wd.cross(V((0, 0, 1))).normalized()
    nip = wv + wd * 0.054 + side * 0.026
    P.tube('wg_nipple', [nip - side * 0.006, nip + side * 0.006], 0.003, 'steel', segs=5)
    P.tube('wg_line', bezier(nip + side * 0.005, nip + side * 0.03 + V((0.02, 0.04, 0.0)),
                             V((0.075, yc - 0.035, zc + 0.08)), 2), 0.0035, 'rubber', segs=5, bend=0.0)
    # --- centre housing and the braided oil lines (faceted steel) with red fittings
    P.cyl('chra', 0.04, 0.062, (0, 0.012, zc), 'steel', axis='Y', segs=14, bev=0.004, bsegs=1)
    feed = bezier((0, 0.016, zc + 0.04), (0.0, 0.02, zc + 0.125), (0.075, 0.03, zc + 0.125), 3)
    P.tube('oil_feed', feed, 0.0055, 'steel', segs=8, bend=0.0, sharp=40.0)
    an_fitting(P, feed[0] + V((0, 0, 0.007)), (0, 0, 1))
    drain = bezier((0, 0.016, zc - 0.04), (0.0, 0.02, zc - 0.1), (0.06, 0.03, zc - 0.1), 3)
    P.tube('oil_drain', drain, 0.011, 'steel', segs=8, bend=0.0, sharp=40.0)
    an_fitting(P, drain[0] - V((0, 0, 0.008)), (0, 0, -1), r=0.014, h=0.014)
    # --- the big compressor: core, snail, outlet stub with its bead
    P.lathe('comp_core', [(0.0, -0.04), (0.092, -0.04), (0.106, -0.014), (0.106, 0.014), (0.092, 0.036),
                          (0.0, 0.036)], loc=(0, yc, zc), material='alu', axis='Y', segs=18, sharp=40.0)
    cc = V((0, yc, zc))
    e = spiral(cc, 0.102, 0.12, 90, 396, 1)[-1]
    tg = tangent(396)
    snail(P, 'comp_snail', cc, 0.102, 0.12, 0.024, 0.044, 90, 396, 'alu',
          tail=[(e + tg * 0.04, 0.041), (e + tg * 0.085, 0.039)], n=12, sides=10)
    tip = e + tg * 0.085
    P.cyl('outlet_bead', 0.043, 0.01, tuple(tip - tg * 0.007), 'alu', axis=tg, segs=14, bev=None)
    # --- the big open inlet: a bellmouth, the wheel inside it, the wire guard over it
    yi = yc + 0.036
    P.lathe('bellmouth', [(0.064, 0.0), (0.072, 0.0), (0.072, 0.03), (0.084, 0.044), (0.068, 0.044)],
            loc=(0, yi, zc), material='alu', axis='Y', segs=18, sharp=40.0)
    P.lathe('wheel_nose', [(0.0, 0.03), (0.012, 0.028), (0.026, 0.012), (0.03, 0.0)][::-1], loc=(0, yi, zc),
            material='steel', axis='Y', segs=12, close='start', sharp=40.0)
    bm = bmesh.new()
    for i in range(6):
        a = math.tau * i / 6
        m = (Matrix.Translation((0, yi + 0.008, zc)) @ mat4(rot=(0, -math.degrees(a), 0)) @
             Matrix.Translation((0.034, 0.0, 0.0)) @ mat4(rot=(28, 0, 0)))
        K.bm_cube(bm, (0.055, 0.03, 0.003), m)
    P.mesh('wheel_blades', bm, 'steel', sharp=40.0)
    yg = yi + 0.042
    P.cyl('guard_ring', 0.074, 0.006, (0, yg, zc), 'chrome', axis='Y', segs=18, bev=None, caps=False)
    # (the wires' ends sit inside the guard ring: left open)
    bm = bmesh.new()
    for k in range(-2, 3):
        off = k * 0.024
        L = 2 * math.sqrt(max(0.0, 0.073 ** 2 - off ** 2))
        for vert in (True, False):
            loc = (off, yg, zc) if vert else (0.0, yg, zc + off)
            size = (0.003, 0.003, L) if vert else (L, 0.003, 0.003)
            ends = 2 if vert else 0
            vs = K.bm_cube(bm, size, mat4(loc, (0, 0, 0)))
            dead = [f for f in {f for v in vs for f in v.link_faces} if abs(f.normal[ends]) > 0.9]
            bmesh.ops.delete(bm, geom=dead, context='FACES_ONLY')
    P.mesh('guard_mesh', bm, 'chrome', sharp=50.0, wn=False)
    P.views = [('a', 35, 20), ('b', 215, 20)]


PARTS = {
    'turbo_mid': build_turbo_mid,
    'turbo_big': build_turbo_big,
}


def main(args):
    K.run(PARTS, args)
