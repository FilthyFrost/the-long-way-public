"""
Rims and tyres (docs/MODCAR.md section 2.3).

    blender -b --factory-startup --python tools/blender/build.py -- parts/wheels [<id>|all|tyres|rims] [--norender]

Rims: origin at the wheel centre (= hub centre), axle along Blender Y, the outer (street) face towards +Y
(the LEFT side; the game mirrors for right-hand hubs). Each rim has the sub-mount empty M_tire at the wheel
centre (rim_dually: M_tire outer, M_tire2 inner). rim_cart has its own rubber and takes no tyre.
Tyres: origin at the wheel centre, axle along Y; the bead (inner radius) sits on the rim's bead seat.
Every tyre is generated for every rim that takes tyres: <tyre>@<rim>.glb; <tyre>.glb is the 13" preview. On a rim
with a profile (RIMS) the variant's sidewall is the tyre's times that profile, its crown that much lower - the radius
the game rolls it at (derive.ts: rim radius + sidewall x profile) - its width, its bead and its tread as they are; the
sidewall above the bead's lip over the flange is the part that comes down (side_h).
"""
import math

import bmesh
import bpy
from mathutils import Matrix, Vector

from parts import _kit as K
from parts._kit import V, mat4

# bead-seat radius R, rim width w (between the flanges), flange height fh above R, flange thickness t; profile = the
# share of a tyre's sidewall the rim keeps (a bigger rim runs its tyre lower: rim.profile in src/core/modcar/parts.ts)
RIMS = {
    'rim_steel13': dict(R=0.165, w=0.13, fh=0.016, t=0.0035),
    'rim_alloy15': dict(R=0.19, w=0.17, fh=0.017, t=0.004, profile=0.72),
    'rim_off16': dict(R=0.203, w=0.20, fh=0.018, t=0.004),
    'rim_moto18': dict(R=0.229, w=0.07, fh=0.011, t=0.003),
    'rim_truck19': dict(R=0.25, w=0.20, fh=0.020, t=0.0045),
    'rim_dually': dict(R=0.25, w=0.21, fh=0.020, t=0.0045),
}

# ----------------------------------------------------------------------------------------------- tyres
#
# A tread pattern: n pitches round the tyre, each split into rows at the fractions `fr`; the band across
# the crown is split at the lateral breakpoints `cols` (u = y / half tread width, |u| > 1 = over the
# shoulder); `cells` gives each band cell its kind: 'G' groove (never raised), 'R' rib (raised in every
# row), or a string of row indices that are raised ('0' = row 0, '02' = rows 0 and 2). For a side-specific
# pattern use a pair (outer, inner) [u > 0 is the outer side]. shear(u) shifts the rows round the tyre
# (in pitches), zig(row, col) shifts a breakpoint sideways (m).
# Optional (the second batch): shoulder = how far round the shoulder the outermost breakpoint goes (deg, 58 if
# not given; with walls set lower the band reaches down onto the sidewall); depth(u) scales the blocks' height
# by |u| (lugs that taper down the sidewall); studs = [(u, f), ...] steel stud heads set into the blocks, one
# at each per pitch (f = the fraction of the pitch, before the shear), stud_r / stud_h their radius and how
# far they stand proud (m); side_gap = the largest angle (deg) between the sidewall's rows, which then keeps only
# the tread's rows it needs to stay round.

TYRES = {
    'tire_road': dict(h=0.12, W=0.155, Tw=0.80, d=0.0085, c=0.006, n=24, fr=[0, 0.76],
                      cols=[-1.16, -1.0, -0.64, -0.53, -0.08, 0.08, 0.53, 0.64, 1.0, 1.16],
                      cells=['0', '0', 'G', 'R', 'G', 'R', 'G', '0', '0'],
                      walls=[(0.40, -0.004), (0.72, -0.002)],
                      shear=lambda u: 0.10 * u * u),
    'tire_whitewall': dict(h=0.12, W=0.16, Tw=0.76, d=0.0075, c=0.006, n=22, fr=[0, 0.84],
                           cols=[-1.12, -1.0, -0.72, -0.61, -0.27, -0.16, 0.16, 0.27, 0.61, 0.72, 1.0, 1.12],
                           cells=['0', '0', 'G', 'R', 'G', 'R', 'G', 'R', 'G', '0', '0'],
                           white=(0.22, 0.62), text_at=0.80, text_size=0.6, text_arcs=((90.0, 44.0), (270.0, 30.0))),
    'tire_offroad': dict(h=0.14, W=0.235, Tw=0.86, d=0.016, c=0.010, n=17, fr=[0, 0.5],
                         cols=[-1.26, -1.12, -1.0, -0.68, -0.56, -0.22, -0.1, 0.1, 0.22, 0.56, 0.68, 1.0, 1.12, 1.26],
                         cells=['0', '0', '0', 'G', '1', 'G', '01', 'G', '0', 'G', '1', '1', '1'],
                         shear=lambda u: 0.12 * u, text_size=1.3, text_at=0.5),
    'tire_tractor': dict(h=0.30, W=0.32, Tw=0.90, d=0.042, c=0.028, n=15, fr=[0, 0.38, 0.62],
                         cols=[-1.30, -1.0, -0.62, -0.26, -0.05, 0.05, 0.26, 0.62, 1.0, 1.30],
                         cells=['0', '0', '0', '0', 'G', '2', '2', '2', '2'],
                         shear=lambda u: 0.95 * abs(u), chamfer=0.006, text_at=0.42, text_size=0.6),
    'tire_slick': dict(h=0.09, W=0.225, Tw=0.90, d=0.0, c=0.004, n=24, fr=[0, 0.5],
                       cols=[-1.08, -0.62, 0.0, 0.62, 1.08], cells=['G', 'G', 'G', 'G'], text_mat='paint_b',
                       text_size=1.35, text_at=0.5),
    'tire_moto': dict(h=0.08, W=0.10, Tw=0.94, d=0.0055, c=0.034, n=18, fr=[0, 0.5],
                      cols=[-1.04, -0.72, -0.38, -0.06, 0.06, 0.38, 0.72, 1.04],
                      cells=['01', '1', '0', 'R', '1', '0', '01'],
                      shear=lambda u: 0.55 * u, round=True, text_at=0.42, text_size=0.85),
    'tire_snow': dict(h=0.12, W=0.175, Tw=0.82, d=0.0115, c=0.007, n=22, fr=[0, 0.8],
                      cols=[-1.18, -1.0, -0.64, -0.55, -0.22, -0.12, 0.12, 0.22, 0.55, 0.64, 1.0, 1.18],
                      cells=['0', '0', 'G', '0', 'G', '0', 'G', '0', 'G', '0', '0'],
                      zig=lambda k, j: (0.0035 if (k + j) % 2 else -0.0035) if j in (2, 3, 8, 9) else 0.0,
                      shear=lambda u: 0.18 * abs(u) + 0.08 * (1 if int((u + 2) * 3.0) % 2 else -1)),
    'tire_truck': dict(h=0.14, W=0.215, Tw=0.84, d=0.012, c=0.005, n=22, fr=[0, 0.5],
                       walls=[(0.40, -0.005), (0.74, -0.002)],
                       cols=[-1.12, -1.0, -0.66, -0.57, -0.24, -0.15, 0.15, 0.24, 0.57, 0.66, 1.0, 1.12],
                       cells=['01', '01', 'G', 'R', 'G', 'R', 'G', 'R', 'G', '01', '01'],
                       zig=lambda k, j: (0.0045 if k % 2 else -0.0045) if j in (2, 3, 4, 5, 6, 7, 8, 9) else 0.0,
                       notch=True),
    # --- the second batch (2026-11-18)
    # economy: five plain ribs between four narrow straight grooves, only the shoulders' edge notched
    'tire_eco': dict(h=0.12, W=0.145, Tw=0.80, d=0.0065, c=0.0055, n=22, fr=[0, 0.88],
                     cols=[-1.12, -1.0, -0.60, -0.53, -0.21, -0.14, 0.14, 0.21, 0.53, 0.60, 1.0, 1.12],
                     cells=['0', 'R', 'G', 'R', 'G', 'R', 'G', 'R', 'G', 'R', '0'],
                     walls=[(0.40, -0.004), (0.72, -0.002)], text_at=0.56, text_size=0.8, side_gap=11),
    # sport: directional arrows across the middle (their tips lead), big solid shoulder blocks, shallow
    'tire_sport': dict(h=0.10, W=0.205, Tw=0.88, d=0.006, c=0.005, n=20, fr=[0, 0.76, 0.88],
                       cols=[-1.12, -1.0, -0.64, -0.55, -0.06, 0.06, 0.55, 0.64, 1.0, 1.12],
                       cells=['01', '01', 'G', '0', '0', '0', 'G', '01', '01'],
                       walls=[(0.42, -0.004), (0.74, -0.002)], side_gap=14,
                       shear=lambda u: -0.42 * min(abs(u), 0.64) - 0.12 * max(0.0, abs(u) - 0.64)),
    # all-terrain: chunky blocks, each column a half pitch round from the next (they interlock across zigzag
    # grooves); the middle ones cut across by a sipe, the shoulder ones siped part-way and stepping down the sidewall
    'tire_at': dict(h=0.13, W=0.215, Tw=0.84, d=0.012, c=0.008, n=16, fr=[0, 0.36, 0.42, 0.78],
                    cols=[-1.34, -1.17, -1.0, -0.64, -0.56, -0.06, 0.06, 0.56, 0.64, 1.0, 1.17, 1.34],
                    cells=['01', '012', '02', 'G', '02', 'G', '02', 'G', '02', '012', '01'],
                    walls=[(0.40, -0.005), (0.66, -0.002)], shoulder=70, side_gap=13.2,
                    depth=lambda au: 1.0 if au <= 1.0 else 1.0 - 0.55 * (au - 1.0) / 0.34,
                    shear=lambda u: 0.10 * abs(u) + (0.5 if (-0.6 < u < 0.0 or u > 0.6) else 0.0),
                    zig=lambda k, j: (0.003 if k % 2 else -0.003) if j in (3, 4, 7, 8) else 0.0),
    # mud-terrain: huge staggered lugs, a long one reaching past the middle and a short one in turn from each
    # side, deep open voids, the lugs carried far round the shoulder onto the sidewall
    'tire_mud': dict(h=0.16, W=0.255, Tw=0.86, d=0.022, c=0.012, n=10, fr=[0, 0.30, 0.50, 0.80],
                     cols=[-1.50, -1.30, -1.12, -1.0, -0.56, -0.08, 0.08, 0.56, 1.0, 1.12, 1.30, 1.50],
                     cells=['0', '02', '02', '02', '0', '02', '2', '02', '02', '02', '2'],
                     walls=[(0.30, -0.008), (0.52, -0.003)], shoulder=82, side_gap=12,
                     depth=lambda au: 1.0 if au <= 1.0 else 1.0 - 0.7 * (au - 1.0) / 0.5,
                     shear=lambda u: 0.12 * max(-0.56, min(0.56, u)) - 0.08 * (u - max(-0.56, min(0.56, u))),
                     text_at=0.34, text_size=0.9),
    # studded winter: a snow pattern in a slight arrow, zigzag-edged blocks with the middle ones a half pitch round,
    # three steel studs a pitch
    'tire_studded': dict(h=0.12, W=0.175, Tw=0.82, d=0.010, c=0.007, n=20, fr=[0, 0.80],
                         cols=[-1.16, -1.0, -0.64, -0.55, -0.22, -0.13, 0.13, 0.22, 0.55, 0.64, 1.0, 1.16],
                         cells=['0', '0', 'G', '0', 'G', '0', 'G', '0', 'G', '0', '0'],
                         walls=[(0.40, -0.004), (0.72, -0.002)],
                         shear=lambda u: -0.30 * abs(u) + (0.5 if 0.2 < abs(u) < 0.6 else 0.0),
                         zig=lambda k, j: (0.003 if k % 2 else -0.003) if 2 <= j <= 9 else 0.0,
                         studs=[(-0.82, 0.40), (0.0, 0.40), (0.82, 0.40)], stud_r=0.0034, stud_h=0.0015),
    # off-road motorcycle: tall separate knobs on the round profile, centre and shoulder knobs a half pitch
    # from the ones between them
    'tire_moto_off': dict(h=0.09, W=0.11, Tw=0.96, d=0.013, c=0.036, n=18, fr=[0, 0.30, 0.50, 0.80],
                          cols=[-1.0, -0.66, -0.22, 0.22, 0.66, 1.0],
                          cells=['0', '2', '0', '2', '0'], walls=[(0.25, -0.006), (0.42, -0.002)], side_gap=10,
                          shear=lambda u: -0.10 * abs(u), round=True, text_at=0.42, text_size=0.85),
}

TYRE_RIMS = ['rim_steel13', 'rim_alloy15', 'rim_off16', 'rim_moto18', 'rim_truck19', 'rim_dually']


def side_h(T, fh, h):
    """
    The sidewall's stations at a sidewall height h: station(f) = the height above the rim's seat of what lies at f of
    the tyre's own sidewall T['h'], and k, how much of its height the part above the bead's lip keeps. At the tyre's
    own height station(f) = f * T['h'], k = 1; lower (a rim with a profile) the bead and its lip over the flange
    (fh + 3.5 mm) stay as they are and the sidewall above them comes down to h.
    """
    h0 = T['h']
    if h == h0:
        return (lambda f: f * h0), 1.0
    lip = fh + 0.0035
    k = (h - lip) / (h0 - lip)
    return (lambda f: lip + (f * h0 - lip) * k), k


def tyre_profile(T, R, wb, fh, h=None):
    """
    The section of the tyre as a closed loop of (y, r) points with tags, counter-clockwise in (r, y):
    returns (points, band_indices) where band points carry their u. h: the sidewall height (T['h'] if not given;
    a rim with a profile takes it lower, see side_h).
    """
    h = T['h'] if h is None else h
    station, keep = side_h(T, fh, h)
    Ro = R + h
    Wt = max(T['W'], wb + 0.026)
    half = Wt / 2
    Tw = T['Tw'] * Wt
    tw2 = Tw / 2
    # (a round profile's crown is its shoulder too: it comes down with the sidewall)
    c = T['c'] * (keep if T.get('round') else 1.0)
    d = T['d']
    rnd = T.get('round', False)
    # outer side (y > 0) from the bead up to the shoulder (surface level)
    yb = wb / 2
    side = [
        (yb - 0.010, R, 'bead'),
        (yb - 0.0015, R + fh - 0.003, 'flange'),
        (yb + 0.0055, R + fh + 0.0035, 'flange'),
    ]
    walls = T.get('walls', [(0.34, -0.006), (0.56, 0.0), (0.80, -0.004)])
    for (f, dy) in walls:
        side.append((half + dy, R + station(f), 'wall'))
    # the band (lowered by d) across the crown; beyond the tread edge it follows an elliptic shoulder
    # from the edge E (phi = 0) towards the top of the sidewall W (phi = 90 deg)
    cols = T['cols']
    ex, er = tw2, Ro - c
    wx, wr = side[-1][0], side[-1][1]
    vmax = max(abs(x) for x in cols) - 1.0
    band = []
    for u in cols:
        au = abs(u)
        if au <= 1.0 or vmax <= 0:
            y = u * tw2
            r = Ro - c * au * au - d
        else:
            phi = (au - 1.0) / vmax * math.radians(T.get('shoulder', 58))
            sy = ex + (wx - ex) * math.sin(phi)
            sr = wr + (er - wr) * math.cos(phi)
            if 'shoulder' in T:
                # (the second batch: the floor lies in from the shoulder along (sin, cos) of the angle round it, which
                # turns steadily - no fold however tight the shoulder against the blocks' height - and only as deep
                # as depth() makes the blocks there; build_tyre raises them back along it onto the shoulder)
                dd = d * (T['depth'](au) if 'depth' in T else 1.0)
                y = math.copysign(sy - dd * math.sin(phi), u)
                r = sr - dd * math.cos(phi)
            else:
                ny, nr = (er - wr) * math.sin(phi), (wx - ex) * math.cos(phi)
                ln = math.hypot(ny, nr) or 1.0
                y = math.copysign(sy - d * ny / ln, u)
                r = sr - d * nr / ln
        band.append((y, r, 'band', u))
    # assemble the loop: inner bead (y<0) -> inner side up -> band from y<0 to y>0 -> outer side down
    pts = []
    for (y, r, tag) in side:
        pts.append((-y, r, tag, None))
    pts.append(None)  # placeholder for the band
    for (y, r, tag) in reversed(side):
        pts.append((y, r, tag, None))
    i = pts.index(None)
    pts[i:i + 1] = band
    return pts, Ro, Wt


def sidewall_text(bm, pts, R, h, mat_index=0, arcs=((90.0, 70.0), (270.0, 50.0)), frac=0.52, size=1.0, seed=3,
                  stations=None):
    """
    Raised generic 'lettering' on the outer sidewall (no brand): blocks of letter-like widths in arcs
    centred on the given angles (deg) at radius R + frac * h, following the sidewall's profile. In lathe
    space (axis = Z, the outer side is +Z). stations = side_h()'s (station, k) on a lower sidewall: the lettering at
    the station of frac, its height k of the tyre's own.
    """
    import random
    rnd = random.Random(seed)
    side = [(y, r) for (y, r, tag, u) in pts if y > 0 and tag != 'band']
    side.sort(key=lambda q: q[1])
    station, keep = stations or ((lambda f: f * h), 1.0)
    rt = R + station(frac)

    def surf(r):
        for (ya, ra), (yb, rb) in zip(side[:-1], side[1:]):
            if ra <= r <= rb:
                u = (r - ra) / (rb - ra or 1.0)
                y = ya + (yb - ya) * u
                ny, nr = (rb - ra), -(yb - ya)
                ln = math.hypot(ny, nr) or 1.0
                if ny < 0:
                    ny, nr = -ny, -nr
                return y, ny / ln, nr / ln
        return side[-1][0], 1.0, 0.0

    y0, ny, nr = surf(rt)
    lh = 0.2 * h * keep * size   # letter height (radial)
    faces = []
    for (ac, span) in arcs:
        a = math.radians(ac - span / 2)
        a_end = math.radians(ac + span / 2)
        while a < a_end:
            w = rnd.choice((0.55, 0.75, 0.9, 1.0, 1.0, 1.2)) * lh * 0.55
            if rnd.random() < 0.12:
                a += (w * 1.6) / rt
                continue
            da = w / rt
            mid = a + da / 2
            c, s_ = math.cos(mid), math.sin(mid)
            # local frame: x = tangential, y = radial, z = sidewall normal
            t = V((s_, -c, 0.0))   # (t, rad, n) must be right-handed or the boxes come out inside-out
            rad = V((c, s_, 0.0))
            n = V((rad.x * nr, rad.y * nr, ny)).normalized()
            p = V((rt * c, rt * s_, y0)) + n * 0.0008
            m = Matrix((t, rad, n)).transposed().to_4x4()
            m.translation = p
            verts = K.bm_cube(bm, (w, lh, 0.0035), m)
            faces += list({f for v in verts for f in v.link_faces})
            a += da + lh * 0.18 / rt
    for f in faces:
        f.material_index = mat_index
    return faces


def tyre_studs(bm, T, pts, band_idx, nrm_col, mat_index=0):
    """
    Steel stud heads set into the tread blocks (T['studs'] = [(u, f), ...]: one per pitch at each, f the fraction
    of the pitch before the shear): short hexagonal pins along the block's normal, sunk 2 mm into the rubber and
    standing stud_h proud of the block top, their heads a little narrower than their bodies. In lathe space.
    """
    n, d = T['n'], T['d']
    pitch = math.tau / n
    shear = T.get('shear')
    depth = T.get('depth')
    sr, proud, sunk = T.get('stud_r', 0.0034), T.get('stud_h', 0.0015), 0.002
    us = [pts[i][3] for i in band_idx]
    faces = []
    for (u, f) in T['studs']:
        k = max(i for i in range(len(us) - 1) if us[i] <= u)
        t = (u - us[k]) / (us[k + 1] - us[k])
        # the block top there: both band points raised along their normals, then between them
        tops = []
        for j in (k, k + 1):
            y0, r0 = pts[band_idx[j]][:2]
            ny, nr = nrm_col[j]
            dd = d * (depth(abs(us[j])) if depth else 1.0)
            tops.append((y0 + ny * dd, r0 + nr * dd, ny, nr))
        y = tops[0][0] + (tops[1][0] - tops[0][0]) * t
        r = tops[0][1] + (tops[1][1] - tops[0][1]) * t
        ny = tops[0][2] + (tops[1][2] - tops[0][2]) * t
        nr = tops[0][3] + (tops[1][3] - tops[0][3]) * t
        ln = math.hypot(ny, nr)
        ny, nr = ny / ln, nr / ln
        sh = 0.0
        if shear:
            sh = shear(us[k]) + (shear(us[k + 1]) - shear(us[k])) * t
        for p in range(n):
            a = (p + f + sh) * pitch
            c, s = math.cos(a), math.sin(a)
            z = V((nr * c, nr * s, ny))
            m = K.frame_from_z(z, (-s, c, 0.0)).to_3x3()
            at = V((r * c, r * s, y))
            low, high = [], []
            for j in range(6):
                q = V((math.cos(math.tau * j / 6), math.sin(math.tau * j / 6), 0.0))
                low.append(bm.verts.new(at + m @ (q * sr) - z * sunk))
                high.append(bm.verts.new(at + m @ (q * sr * 0.8) + z * proud))
            for j in range(6):
                j2 = (j + 1) % 6
                faces.append(bm.faces.new((low[j], low[j2], high[j2], high[j])))
            faces.append(bm.faces.new(high))
    for f in faces:
        f.material_index = mat_index
    return faces


def shoulder_phi(T, au):
    """How far round the shoulder (rad) a breakpoint |u| > 1 lies, as tyre_profile places it."""
    vmax = max(abs(x) for x in T['cols']) - 1.0
    return (au - 1.0) / vmax * math.radians(T.get('shoulder', 58))


def side_rows(fr, gap):
    """The rows of a pitch (indices into fr) the sidewall keeps: each start no more than `gap` (a fraction of the
    pitch) after the last kept one, when the rows allow."""
    keep = [0]
    for k in range(1, len(fr)):
        nxt = fr[k + 1] if k + 1 < len(fr) else 1.0
        if nxt - fr[keep[-1]] > gap + 1e-9:
            keep.append(k)
    return keep


def build_tyre(P, tid, rim_id):
    T = TYRES[tid]
    rim = RIMS[rim_id]
    R, wb, fh = rim['R'], rim['w'], rim['fh']
    # (a rim with a profile keeps only that share of the sidewall: the tyre rolls lower on it)
    h = T['h'] * rim['profile'] if 'profile' in rim else T['h']
    pts, Ro, Wt = tyre_profile(T, R, wb, fh, h)
    stations = side_h(T, fh, h)
    n, fr = T['n'], T['fr']
    rows = [(p, k) for p in range(n) for k in range(len(fr))]
    N = len(rows)
    if P.opts.get('stats'):
        print('  TYRE profile points', len(pts), 'rows', N, [p[2] for p in pts])
    pitch = math.tau / n
    shear = T.get('shear')
    zig = T.get('zig')
    # band column index for each profile point
    band_idx = [i for i, p in enumerate(pts) if p[2] == 'band']
    nb = len(band_idx)
    u_edges = [abs(pts[band_idx[0]][3]), abs(pts[band_idx[-1]][3])]
    bm = bmesh.new()
    # (the second batch's tyres carry each band vertex's column in a layer: breakpoints far round the shoulder or
    # moved by zig lie too close together sideways to be told apart by the axial coordinate, and depth() wants the
    # column; made before any vertex, as a new layer drops the references to the ones there are)
    exact = any(k in T for k in ('shoulder', 'depth', 'studs', 'side_gap'))
    lay = bm.verts.layers.int.new('band_col') if exact else None
    grid = []  # grid[i_profile][i_row] -> vert
    for ip, (y, r, tag, u) in enumerate(pts):
        if tag == 'band':
            uu = u
        else:
            uu = -u_edges[0] if y < 0 else u_edges[1]
        sh = shear(uu) if shear else 0.0
        ring = []
        for ir, (p, k) in enumerate(rows):
            a = (p + fr[k] + sh) * pitch
            yy = y
            if zig and tag == 'band':
                yy = y + zig(ir, band_idx.index(ip))
            ring.append(bm.verts.new((r * math.cos(a), r * math.sin(a), yy)))
        grid.append(ring)
    M = len(pts)
    faces = {}
    for ip in range(M):
        jp = (ip + 1) % M
        for ir in range(N):
            jr = (ir + 1) % N
            f = bm.faces.new((grid[ip][ir], grid[ip][jr], grid[jp][jr], grid[jp][ir]))
            faces[(ip, ir)] = f
    bm.normal_update()
    # make sure the normals point out of the tyre
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    # (recalc goes by the face farthest out, which a fold in the profile can turn: the volume decides)
    vol = 0.0
    for f in bm.faces:
        vs = [v.co for v in f.verts]
        for i in range(1, len(vs) - 1):
            vol += vs[0].dot(vs[i].cross(vs[i + 1]))
    if vol < 0:
        bmesh.ops.reverse_faces(bm, faces=bm.faces[:])
    # whitewall: the outer side band of the sidewall
    if T.get('white'):
        lo, hi = T['white']
        for (ip, ir), f in faces.items():
            y0, r0 = pts[ip][0], pts[ip][1]
            y1, r1 = pts[(ip + 1) % M][0], pts[(ip + 1) % M][1]
            if y0 > 0 and y1 > 0 and pts[ip][2] != 'band' and pts[(ip + 1) % M][2] != 'band':
                rm = (r0 + r1) / 2
                if R + stations[0](lo) <= rm <= R + stations[0](hi):
                    f.material_index = 1
    # the sidewall keeps only the rows it needs to stay round (side_gap degrees apart at most): its faces span several
    # of the tread's rows, those next to the band take the band's rows
    if T.get('side_gap'):
        keep = side_rows(fr, math.radians(T['side_gap']) / pitch)
        # (the edges across the profile at the rows it drops go, then the vertices left between two edges)
        drop = []
        for ip in range(M):
            jp = (ip + 1) % M
            if pts[ip][2] == 'band' and pts[jp][2] == 'band':
                continue
            for ir, (p, k) in enumerate(rows):
                if k not in keep:
                    drop.append(bm.edges.get((grid[ip][ir], grid[jp][ir])))
        bmesh.ops.dissolve_edges(bm, edges=drop, use_verts=True, use_face_split=False)
    # raise the tread blocks
    d = T['d']
    nrm_col = []
    if d > 0:
        cells = T['cells']
        sel = []
        for ci in range(nb - 1):
            ip = band_idx[ci]
            kind = cells[ci]
            for ir, (p, k) in enumerate(rows):
                if kind == 'G':
                    continue
                if kind == 'R' or str(k) in kind:
                    sel.append(faces[(ip, ir)])
        # profile normal of each band point (for the direction of extrusion)
        nrm = {}
        for ci, ip in enumerate(band_idx):
            a = pts[band_idx[max(0, ci - 1)]]
            b = pts[band_idx[min(nb - 1, ci + 1)]]
            ty, tr = b[0] - a[0], b[1] - a[1]
            ln = math.hypot(ty, tr) or 1.0
            # outward normal of the crown: rotate the tangent (y, r) by 90 degrees towards +r
            ny, nr = -tr / ln, ty / ln
            if nr < 0:
                ny, nr = -ny, -nr
            nrm[round(pts[ip][0], 5)] = (ny, nr)
            u = pts[ip][3]
            if 'shoulder' in T and abs(u) > 1.0:
                # (over the shoulder the blocks rise along the direction its floor was set in by: onto the shoulder)
                phi = shoulder_phi(T, abs(u))
                ny, nr = math.copysign(math.sin(phi), u), math.cos(phi)
            nrm_col.append((ny, nr))
        if exact:
            for ci, ip in enumerate(band_idx):
                for v in grid[ip]:
                    v[lay] = ci
        res = bmesh.ops.extrude_face_region(bm, geom=sel)
        # the operator keeps the original faces (now hidden under the blocks): drop them
        bmesh.ops.delete(bm, geom=sel, context='FACES')
        new_verts = [g for g in res['geom'] if isinstance(g, bmesh.types.BMVert)]
        band_y = sorted(nrm.keys())
        for v in new_verts:
            if exact:
                ci = v[lay]
                ny, nr = nrm_col[ci]
                dd = d * T['depth'](abs(pts[band_idx[ci]][3])) if 'depth' in T else d
            else:
                # find the band column by its axial coordinate (zig offsets are small)
                yk = min(band_y, key=lambda q: abs(q - v.co.z))
                ny, nr = nrm[yk]
                dd = d
            rr = math.hypot(v.co.x, v.co.y)
            cx, cy = v.co.x / rr, v.co.y / rr
            v.co.x += cx * nr * dd
            v.co.y += cy * nr * dd
            v.co.z += ny * dd
        if T.get('chamfer'):
            nv = set(new_verts)
            top = [f for f in res['geom'] if isinstance(f, bmesh.types.BMFace) and all(v in nv for v in f.verts)]
            top_set = set(top)
            edges = set()
            for f in top:
                for e in f.edges:
                    if any(lf not in top_set for lf in e.link_faces):
                        edges.add(e)
            bmesh.ops.bevel(bm, geom=list(edges), offset=T['chamfer'], offset_type='OFFSET', segments=1,
                            profile=0.5, affect='EDGES', clamp_overlap=True)
    if lay is not None:
        bm.verts.layers.int.remove(lay)
    # generic raised lettering on the outer sidewall
    mats = ['rubber', 'ceramic'] if T.get('white') else ['rubber']
    if T.get('text', True):
        tm = T.get('text_mat', 'rubber')
        if tm not in mats:
            mats.append(tm)
        sidewall_text(bm, pts, R, T['h'], mat_index=mats.index(tm), frac=T.get('text_at', 0.52),
                      size=T.get('text_size', 1.0), seed=sum(map(ord, tid)) % 97,
                      arcs=T.get('text_arcs', ((90.0, 70.0), (270.0, 50.0))), stations=stations)
    # steel stud heads in the blocks
    if T.get('studs'):
        mats.append('steel')
        tyre_studs(bm, T, pts, band_idx, nrm_col, mat_index=mats.index('steel'))
    # axle along Blender Y (lathe z -> +Y)
    K.bm_transform(bm, K.axis_matrix('Y'))
    P.mesh('tyre', bm, mats, sharp=42.0)
    P.ao_distance = 0.08
    P.info.update({'radius': round(Ro, 4), 'inner_radius': R, 'width': round(Wt, 4),
                   'sidewall': round(Ro - R, 4), 'rim': rim_id})
    P.views = [('a', -38, 12), ('b', 8, 6)]


def tyre_builder(tid, rim_id):
    return lambda P: build_tyre(P, tid, rim_id)


def variants(P, tid):
    """Builds <tid>@<rim>.glb for every rim (no previews) and returns their geo entries."""
    entries = {}
    for rim_id in TYRE_RIMS:
        vid = f'{tid}@{rim_id}'
        Q = K.Part(vid, P.opts)
        build_tyre(Q, tid, rim_id)
        Q.finish()
        Q.export()
        entries[vid] = Q.geo_entry()
        print(f'PART {vid}: {Q.tris} tris')
    return entries


# ----------------------------------------------------------------------------------------------- rims


def barrel(P, R, w, fh, t, dc=0.026, well_off=0.012, segs=32, material='steel', lip_mat=None):
    """
    The rim barrel as a closed sheet section: flanges with rolled lips, bead seats and the drop-centre well.
    Outer face towards +Y. dc = well depth, well_off = the well's offset towards the outside.
    """
    hw = w / 2
    lip = 0.0032
    # outer surface (tyre side) from the outer lip to the inner lip, then the back surface
    sec = [
        # outer flange (rolled lip)
        (R + fh - lip, hw + t),
        (R + fh, hw + t * 0.2),
        (R + fh - lip * 1.3, hw - 0.0005),
        (R + 0.003, hw),                   # flange root
        (R, hw - 0.012),                   # bead seat
        (R - dc, hw - 0.022 - dc * 0.5),   # well wall
        (R - dc, -hw + 0.022 + dc * 0.5 + well_off),  # well floor
        (R, -hw + 0.012),
        (R + 0.003, -hw),
        (R + fh - lip * 1.3, -hw + 0.0005),
        (R + fh, -hw - t * 0.2),
        (R + fh - lip, -hw - t),
        # back surface (inside the wheel)
        (R - dc - t, -hw + 0.016 + dc * 0.5 + well_off),
        (R - dc - t, hw - 0.016 - dc * 0.5),
    ]
    prof = [(r, z) for (r, z) in sec]
    # loop must be counter-clockwise in (r, z): the list above runs clockwise, reverse it
    prof = list(reversed(prof))
    o = P.lathe('barrel', prof, material=material, axis='Y', segs=segs, loop=True, sharp=50.0)
    return o


def lug_nuts(P, n, pcd_r, y, r_nut=0.0105, h=0.016, material='chrome', a0=0.0, seat=True):
    """Hex lug nuts with a conical seat and a domed end, on the pitch circle pcd_r, sitting on y."""
    bm = bmesh.new()
    for i in range(n):
        a = a0 + math.tau * i / n
        cx, cz = pcd_r * math.cos(a), pcd_r * math.sin(a)
        base = Matrix.Translation((cx, y, cz)) @ K.axis_matrix('Y')
        if seat:
            K.bm_cyl(bm, r_nut * 1.15, h * 0.28, segs=6, r2=r_nut * 0.95,
                     matrix=base @ mat4((0, 0, h * 0.14), (0, 0, 30)))
        K.bm_cyl(bm, r_nut, h * 0.6, segs=6, r2=r_nut * 0.9, matrix=base @ mat4((0, 0, h * 0.28 + h * 0.3), (0, 0, 30)))
        K.bm_cyl(bm, r_nut * 0.78, h * 0.14, segs=6, r2=r_nut * 0.45,
                 matrix=base @ mat4((0, 0, h * 0.95), (0, 0, 30)))
    return P.mesh('nuts', bm, material, sharp=50)


def valve(P, r, y, a=1.2):
    """Tyre valve stem poking out at radius r."""
    c, s = math.cos(a), math.sin(a)
    p0 = V((r * c, y - 0.01, r * s))
    p1 = V(((r - 0.006) * c, y + 0.022, (r - 0.006) * s))
    P.tube('valve', [p0, p1], 0.0042, 'rubber', segs=8, caps=True)
    P.cyl('vcap', 0.0034, 0.009, tuple(p1 + V((0, 0.004, 0))), 'chrome', axis='Y', segs=8, bev=None)


def build_rim_steel13(P):
    S = RIMS['rim_steel13']
    R, w, fh, t = S['R'], S['w'], S['fh'], S['t']
    barrel(P, R, w, fh, t, dc=0.024, well_off=0.010, segs=32, material='steel')
    # the pressed centre disc: mounting pad, a stiffening ring, ventilation slots, then it dishes into the well
    yf = 0.024  # mounting face (positive offset)
    th = 0.004
    prof = [(0.029, yf + th), (0.066, yf + th), (0.080, yf + 0.011), (0.094, yf + 0.011), (0.101, yf + 0.006),
            (0.123, yf - 0.008), (0.134, yf - 0.014), (0.143, yf - 0.016)]
    rings = [(r, z, z - th) for (r, z) in prof]
    ns = 32
    P.polar('disc', rings, lambda k: [math.tau * j / ns for j in range(ns)],
            hole=lambda k, j: k == 4 and j % 8 in (7, 0), material='steel', axis='Y')
    lug_nuts(P, 4, 0.05, yf + th, r_nut=0.0098, h=0.017, material='chrome', a0=math.radians(45))
    # small chrome hub cap
    cap = [(0.0, yf + 0.044), (0.019, yf + 0.041), (0.031, yf + 0.030), (0.0355, yf + 0.012), (0.033, yf + th)]
    P.lathe('cap', list(reversed(cap)), material='chrome', axis='Y', segs=20, close='start', sharp=50.0)
    valve(P, R - 0.012, yf - 0.020, a=math.radians(200))
    P.empty('M_tire', (0, 0, 0))
    P.info.update({'radius': R, 'width': w, 'tire': True})
    P.ao_distance = 0.06
    P.views = [('a', -52, 12), ('b', 160, 14)]


def spoke_face(P, rings, n, spoke_w, win, material, flare=0.0, ridge=0.0, a0=0.0, name='face', bev=None):
    """
    A cast or pressed wheel face on a polar grid: n spokes of constant width spoke_w (m) between windows in
    the ring bands win = (k0, k1). Four stations per spoke period: left edge, centre, right edge, window
    middle. flare widens the spoke where it meets the hub and the rim (round window corners); ridge raises
    the spoke's centre line (m).
    """
    per = 4

    def delta(k):
        r = rings[k][0]
        d = math.asin(min(0.95, spoke_w / 2 / r))
        if k in win:
            d += flare
        return min(d, math.pi / n * 0.8)

    def stations(k):
        d = delta(k)
        out = []
        for i in range(n):
            t = a0 + math.tau * i / n
            out += [t - d, t, t + d, t + math.pi / n]
        return out

    def hole(k, j):
        return win[0] <= k < win[1] and (j % per) in (2, 3)

    def zfun(k, j):
        if ridge and j % per == 1:
            return (ridge, 0.0)
        return (0.0, 0.0)

    return P.polar(name, rings, stations, hole=hole, zfun=zfun, material=material, axis='Y', bev=bev, bsegs=1)


def build_rim_alloy15(P):
    """An 1980s eight-spoke alloy: concave face, polished lip, small chrome cap, four nuts."""
    S = RIMS['rim_alloy15']
    R, w, fh, t = S['R'], S['w'], S['fh'], S['t']
    hw = w / 2
    barrel(P, R, w, fh, t, dc=0.026, well_off=0.008, segs=32, material='alu')
    th = 0.016
    prof = [(0.030, 0.050), (0.066, 0.050), (0.080, 0.047), (0.112, 0.051), (0.142, 0.059),
            (0.160, 0.066), (0.178, 0.071)]
    rings = [(r, z, z - th) for (r, z) in prof]
    spoke_face(P, rings, 8, 0.024, (2, 5), 'alu', flare=0.07, ridge=0.004, a0=math.radians(22.5))
    # polished lip: a chrome cone from the face edge up to the flange
    lip = [(0.176, hw - 0.016), (0.186, hw - 0.006), (R + fh - 0.002, hw + t + 0.0012), (R + fh + 0.0008, hw + t * 0.4)]
    P.lathe('lip', lip, material='chrome', axis='Y', segs=40, sharp=50.0)
    lug_nuts(P, 4, 0.057, 0.051, r_nut=0.0092, h=0.016, material='chrome', a0=0.0)
    cap = [(0.0, 0.074), (0.022, 0.0725), (0.033, 0.066), (0.0375, 0.055), (0.035, 0.049)]
    P.lathe('cap', list(reversed(cap)), material='chrome', axis='Y', segs=20, close='start', sharp=50.0)
    P.cyl('badge', 0.017, 0.003, (0, 0.0748, 0), 'alu', axis='Y', segs=16, bev=None)
    valve(P, R - 0.013, hw - 0.03, a=math.radians(200))
    P.empty('M_tire', (0, 0, 0))
    P.info.update({'radius': R, 'width': w, 'tire': True})
    P.ao_distance = 0.06
    P.views = [('a', -52, 12), ('b', 160, 14)]


def build_rim_off16(P):
    """A white six-spoke steel off-road wheel with deep dish, six nuts and a manual locking hub."""
    S = RIMS['rim_off16']
    R, w, fh, t = S['R'], S['w'], S['fh'], S['t']
    hw = w / 2
    barrel(P, R, w, fh, t, dc=0.026, well_off=-0.03, segs=32, material='paint_b')
    th = 0.005
    prof = [(0.045, -0.010), (0.062, -0.010), (0.088, -0.012), (0.096, -0.016), (0.128, -0.026), (0.155, -0.036),
            (0.168, -0.042), (0.181, -0.046)]
    rings = [(r, z, z - th) for (r, z) in prof]
    spoke_face(P, rings, 6, 0.056, (3, 5), 'paint_b', flare=0.12, ridge=0.005, a0=math.radians(30))
    lug_nuts(P, 6, 0.0698, -0.010, r_nut=0.0105, h=0.018, material='chrome', a0=0.0)
    # locking hub: flange, body, knurled ring and the dial with its grip bar
    P.cyl('hub_flange', 0.056, 0.006, (0, -0.007, 0), 'alu', axis='Y', segs=24, bev=0.0015, bsegs=1)
    P.lathe('hub', [(0.0, 0.040), (0.040, 0.040), (0.046, 0.036), (0.048, 0.010), (0.050, -0.004)][::-1],
            material='alu', axis='Y', segs=24, close='start', sharp=40.0)
    for i in range(8):
        a = math.tau * i / 8
        P.box('knurl', (0.006, 0.02, 0.006), (0.049 * math.cos(a), 0.022, 0.049 * math.sin(a)), 'alu',
              rot=(0, -math.degrees(a), 0), bev=None)
    P.cyl('dial', 0.032, 0.006, (0, 0.043, 0), 'chrome', axis='Y', segs=20, bev=0.0015, bsegs=1)
    P.box('dial_bar', (0.05, 0.014, 0.012), (0, 0.052, 0), 'chrome', bev=0.003, segs=2)
    flange_bolts = [(0.052 * math.cos(math.tau * (i + 0.5) / 6), -0.004, 0.052 * math.sin(math.tau * (i + 0.5) / 6))
                    for i in range(6)]
    P.bolts(flange_bolts, normal=(0, 1, 0), r=0.0045, h=0.004, washer=False, material='steel')
    valve(P, R - 0.014, -0.04, a=math.radians(200))
    P.empty('M_tire', (0, 0, 0))
    P.info.update({'radius': R, 'width': w, 'tire': True})
    P.ao_distance = 0.07
    P.views = [('a', -52, 12), ('b', 160, 14)]


def build_rim_cart(P):
    """A shopping-trolley wheel: grey rubber tread on a red plastic hub, axle bolt and nut. No tyre."""
    R, w = 0.065, 0.04
    tread = [(0.043, -0.020), (0.057, -0.020), (0.0635, -0.015), (0.065, -0.005), (0.065, 0.005), (0.0635, 0.015),
             (0.057, 0.020), (0.043, 0.020)]
    # loop: outer surface then back along the hub at r = 0.042
    P.lathe('tread', list(reversed(tread)), material='rubber', axis='Y', segs=32, loop=True, sharp=50.0)
    hub = [(0.046, 0.017), (0.040, 0.0175), (0.037, 0.010), (0.016, 0.010), (0.013, 0.016), (0.008, 0.016),
           (0.008, -0.016), (0.013, -0.016), (0.016, -0.010), (0.037, -0.010), (0.040, -0.0175), (0.046, -0.017)]
    P.lathe('hub', hub, material='paint', axis='Y', segs=24, loop=True, sharp=50.0)
    for sgn in (-1, 1):
        for i in range(6):
            a = math.tau * i / 6
            P.box('rib', (0.022, 0.012, 0.004), (0.027 * math.cos(a), sgn * 0.013, 0.027 * math.sin(a)), 'paint',
                  rot=(0, -math.degrees(a), 0), bev=0.0012, segs=1)
    P.cyl('axle', 0.006, 0.052, (0, 0, 0), 'steel', axis='Y', segs=10, bev=None)
    P.cyl('bush', 0.011, 0.036, (0, 0, 0), 'steel', axis='Y', segs=12, bev=None)
    bm = bmesh.new()
    K.bm_hex(bm, 0.009, 0.006, matrix=Matrix.Translation((0, 0.017, 0)) @ K.axis_matrix('Y'))
    K.bm_hex(bm, 0.009, 0.007, matrix=Matrix.Translation((0, -0.017, 0)) @ K.axis_matrix('-Y'))
    K.bm_cyl(bm, 0.013, 0.0015, segs=12, matrix=Matrix.Translation((0, 0.0168, 0)) @ K.axis_matrix('Y'))
    K.bm_cyl(bm, 0.013, 0.0015, segs=12, matrix=Matrix.Translation((0, -0.0168, 0)) @ K.axis_matrix('Y'))
    P.mesh('nuts', bm, 'steel', sharp=50)
    P.info.update({'radius': R, 'width': w, 'tire': False})
    P.ao_distance = 0.03
    P.views = [('a', -52, 12), ('b', 160, 14)]


def build_rim_moto18(P):
    """An 18-inch spoked motorcycle rim: chrome rim, alloy hub with a drum on the +Y side, 36 laced spokes
    with nipples, axle spacers."""
    S = RIMS['rim_moto18']
    R, w, fh, t = S['R'], S['w'], S['fh'], S['t']
    barrel(P, R, w, fh, t, dc=0.012, well_off=0.0, segs=40, material='chrome')
    # hub: drum side (+Y) bigger
    hub = [(0.012, -0.068), (0.03, -0.068), (0.036, -0.06), (0.062, -0.052), (0.066, -0.042), (0.05, -0.036),
           (0.045, 0.0), (0.05, 0.03), (0.075, 0.036), (0.078, 0.05), (0.07, 0.058), (0.03, 0.062), (0.012, 0.062)]
    P.lathe('hub', hub, material='alu', axis='Y', segs=24, sharp=40.0)
    for i in range(6):
        a = math.tau * i / 6
        P.box('drum_fin', (0.006, 0.02, 0.01), (0.072 * math.cos(a), 0.046, 0.072 * math.sin(a)), 'alu',
              rot=(0, -math.degrees(a), 0), bev=None)
    P.cyl('axle', 0.011, 0.16, (0, 0, 0), 'steel', axis='Y', segs=10, bev=None)
    for sg in (-1, 1):
        P.cyl('axle_nut', 0.017, 0.012, (0, sg * 0.075, 0), 'steel', axis='Y', segs=6, bev=None)
    # spokes: 18 per side, alternating leading / trailing
    bm = bmesh.new()
    nip = bmesh.new()
    rh, rr = 0.06, R - 0.012
    for side in (-1, 1):
        yh = side * 0.043
        for i in range(18):
            a = math.tau * (i + (0.5 if side > 0 else 0.0)) / 18
            off = math.radians(66) * (1 if i % 2 == 0 else -1)
            p0 = V((rh * math.cos(a), yh, rh * math.sin(a)))
            p1 = V((rr * math.cos(a + off), side * 0.006, rr * math.sin(a + off)))
            K.bm_sweep(bm, [p0, p1], 0.0024, segs=3, caps=False)
            d = (p1 - p0).normalized()
            m = Matrix.Translation(p1 - d * 0.006) @ K.axis_matrix(d)
            K.bm_cyl(nip, 0.0042, 0.014, segs=6, matrix=m)
    P.mesh('spokes', bm, 'steel', sharp=80.0, wn=False)
    P.mesh('nipples', nip, 'chrome', sharp=50.0)
    valve(P, R - 0.01, 0.0, a=math.radians(10))
    P.empty('M_tire', (0, 0, 0))
    P.info.update({'radius': R, 'width': w, 'tire': True})
    P.ao_distance = 0.05
    P.views = [('a', -52, 12), ('b', 160, 14)]


def truck_disc(P, R, yf, hand_holes=6, lugs=8, pcd=0.0825, cap=True, material='steel', facing=1, nut_mat='chrome'):
    """A truck wheel centre: flat hub pad with the lugs, a stepped disc with hand holes, welded into the well.
    facing = +1 the face looks to +Y, -1 to -Y (the inner wheel of a dually)."""
    th = 0.006
    f = facing
    prof = [(0.06, yf), (0.105, yf), (0.118, yf - f * 0.008), (0.135, yf - f * 0.012), (0.17, yf - f * 0.018),
            (0.195, yf - f * 0.026), (0.212, yf - f * 0.034)]
    rings = [(r, z, z - f * th) if f > 0 else (r, z + th, z) for (r, z) in prof]
    ns = 24
    P.polar('disc', rings, lambda k: [math.tau * (j + 0.5) / ns for j in range(ns)],
            hole=lambda k, j: k == 3 and (j % (ns // hand_holes)) in (1, 2), material=material, axis='Y',
            bev=0.002, bsegs=1)
    nut_y = yf + f * 0.0005
    if f > 0:
        lug_nuts(P, lugs, pcd, nut_y, r_nut=0.0125, h=0.022, material=nut_mat, a0=math.tau / lugs / 2)
    if cap:
        capp = [(0.0, yf + f * 0.06), (0.03, yf + f * 0.057), (0.048, yf + f * 0.044), (0.056, yf + f * 0.02),
                (0.058, yf)]
        P.lathe('cap', capp[::-1] if f > 0 else capp, material='chrome', axis='Y', segs=18, close='start' if f > 0
                else 'end', sharp=50.0)


def build_rim_truck19(P):
    """A 19.5-inch truck steel wheel (the motorhome's front): eight big nuts, six hand holes, chrome hub cap."""
    S = RIMS['rim_truck19']
    R, w, fh, t = S['R'], S['w'], S['fh'], S['t']
    barrel(P, R, w, fh, t, dc=0.03, well_off=0.02, segs=32, material='steel')
    truck_disc(P, R, 0.03)
    valve(P, R - 0.015, 0.01, a=math.radians(200))
    P.empty('M_tire', (0, 0, 0))
    P.info.update({'radius': R, 'width': w, 'tire': True})
    P.ao_distance = 0.07
    P.views = [('a', -52, 12), ('b', 160, 14)]


def build_rim_dually(P):
    """Dual rear wheels: an outer rim dished outwards and an inner rim dished inwards, bolted back to back
    on the hub face (the origin); M_tire on the outer rim, M_tire2 on the inner. A valve extension from the
    inner wheel pokes out through a hand hole."""
    S = RIMS['rim_dually']
    R, w, fh, t = S['R'], S['w'], S['fh'], S['t']
    yo = 0.135
    for (yc, f) in ((yo, 1), (-yo, -1)):
        o = barrel(P, R, w, fh, t, dc=0.03, well_off=0.02 * f, segs=32, material='steel')
        o.data.transform(Matrix.Translation((0, yc, 0)))
    # the outer wheel's disc sits near the hub face, its dish reaching out to the outer rim's well
    truck_disc(P, R, 0.02, cap=True)
    truck_disc(P, R, -0.02, cap=False, facing=-1)
    # spacer ring between the two discs (the hub face)
    P.cyl('spacer', 0.105, 0.04, (0, 0, 0), 'steel', axis='Y', segs=28, bev=0.003, bsegs=1)
    # valve extension from the inner rim through the outer disc
    a = math.radians(30)
    c, s = math.cos(a), math.sin(a)
    P.tube('valve_ext', [(0.21 * c, -0.10, 0.21 * s), (0.15 * c, -0.02, 0.15 * s), (0.15 * c, 0.05, 0.15 * s)],
           0.0035, 'steel', segs=6, bend=0.03)
    P.cyl('valve_cap', 0.005, 0.012, (0.15 * c, 0.058, 0.15 * s), 'chrome', axis='Y', segs=8, bev=None)
    valve(P, R - 0.015, yo + 0.0, a=math.radians(200))
    P.empty('M_tire', (0, yo, 0))
    P.empty('M_tire2', (0, -yo, 0))
    P.info.update({'radius': R, 'width': 0.42, 'tire': True, 'dual': True, 'rim_width_each': w,
                   'tire_offsets': [yo, -yo]})
    P.ao_distance = 0.08
    P.views = [('a', -52, 12), ('b', 160, 14)]


PARTS = {
    'rim_steel13': build_rim_steel13,
    'rim_alloy15': build_rim_alloy15,
    'rim_off16': build_rim_off16,
    'rim_cart': build_rim_cart,
    'rim_moto18': build_rim_moto18,
    'rim_truck19': build_rim_truck19,
    'rim_dually': build_rim_dually,
}
for _tid in TYRES:
    PARTS[_tid] = tyre_builder(_tid, 'rim_steel13')


DEFAULT_TYRE = {'rim_steel13': 'tire_road', 'rim_alloy15': 'tire_road', 'rim_off16': 'tire_offroad',
                'rim_moto18': 'tire_moto', 'rim_truck19': 'tire_truck', 'rim_dually': 'tire_truck'}


def import_glb(path):
    """Import a GLB (for previews): returns its mesh objects with their AO attribute renamed to 'Col'."""
    import bpy
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=path)
    objs = [o for o in bpy.data.objects if o not in before]
    for o in objs:
        if o.type == 'MESH':
            for a in o.data.color_attributes:
                if a.name != 'Col':
                    a.name = 'Col'
    return [o for o in objs if o.type == 'MESH']


def wheel_preview(P):
    """Render the rim with its default tyre mounted on M_tire (and M_tire2)."""
    import os
    tid = DEFAULT_TYRE.get(P.id)
    if not tid:
        return
    path = os.path.join(K.OUT_DIR, f'{tid}@{P.id}.glb')
    if not os.path.exists(path):
        print('no tyre for the preview:', path)
        return
    extra = []
    for e in P.empties:
        if e.name.startswith('M_tire'):
            objs = import_glb(path)
            for o in objs:
                if o.parent is None:
                    o.matrix_world = e.matrix_world @ o.matrix_world
            extra += objs
    K.render(P, views=[('a', -48, 10), ('b', 25, 6)], suffix='_wheel', extra_objs=extra)


def main(args):
    ids, opts = K.parse(args)
    if 'tyres' in ids:
        ids = [x for x in ids if x != 'tyres'] + list(TYRES)
    if 'rims' in ids:
        ids = [x for x in ids if x != 'rims'] + [k for k in PARTS if k.startswith('rim_')]
    if 'all' in ids:
        ids = list(TYRES) + [k for k in PARTS if k not in TYRES]
    rest = [a for a in args if a.startswith('--')]

    def after(P, o):
        if P.id in TYRES and not o.get('novariants'):
            K.write_geo(variants(P, P.id))
        if P.id in RIMS and not o.get('norender'):
            wheel_preview(P)

    K.run(PARTS, ids + rest, after=after)
