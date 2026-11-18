"""
Chassis: the axles' own parts (docs/MODCAR.md section 22) - one corner's suspension, one wheel's brake, the driven
axle's differential.

    blender -b --factory-startup --python tools/blender/build.py -- parts/chassis [<id>|all] [--norender] [--stats]

Axes as everywhere: +X forward, +Y left, +Z up, metres. Struts and brakes are the LEFT-hand unit: the game draws the
right-hand one mirrored across the car's centre, so inboard (towards the middle of the car) is -Y.

Suspension (susp_stock, susp_soft, susp_sport, susp_lift): origin at the centre of the strut's lower eye, its bolt
along X; the strut stands up +Z with its top leaning 8 degrees inboard (towards -Y). The game puts the origin 5 cm
above the hub centre and 20 cm in from the hub's face. Everything within x +-0.09, y -0.14..+0.06, z -0.05..0.5.
susp_leaf: origin at the middle of the leaf pack's underside, where it sits on its pad on the axle (the axle itself
is not modelled); the pack lies along X with an eye at each end and the shackle at the rear (-X), two U-bolts round
the axle with their nuts on the top plate. Pack within x +-0.48, y +-0.07, z -0.08..0.12; its plain damper stands
inboard beside it (lower eye on a tab of the top plate, its top leaning forward) within the strut box.

Brakes (brakes_drum, brakes_disc, brakes_vented, brakes_sport, brakes_moto): origin at the hub centre on the plane
of the disc's (the drum's) outer face; the axle is Y, the disc lies in the XZ plane and the brake extends inboard
(-Y) from y = 0 (a hat's face stands 3 mm proud). A caliper straddles the disc's edge behind and above the hub
(-X, +Z: 30 degrees above the horizontal, 2 o'clock seen from the left, 10 o'clock on the mirrored right-hand
unit); its outboard fingers are a thin plate on the disc's outer face. Within 0.13 m of the axle in XZ (calipers
<= 0.135), y -0.09..+0.005; brakes_moto (a 5 mm disc, radius 0.11): y -0.04..+0.005.

Differentials (diff_open, diff_lsd, diff_locked): origin at the centre of the axle (the housing's centre); the
pinion snout and its flange forward (+X), the cover at the back (-X), axle-tube stubs with their end flanges and
the half-shafts' splined ends out to y +-0.3125. One per axle, not mirrored. Within x -0.18..+0.27, y +-0.32,
z -0.15..+0.17.

`paint` is the part's own colour (the factory part colour until it is sprayed): the coloured springs, the sport
caliper, the damping knob and hose ends, the LSD's cover, the locker's tag. Previews go to SCRATCH.
"""
import math

import bmesh
from mathutils import Matrix, Vector

from parts import _kit as K
from parts._kit import V, mat4

TAU = math.tau
SCRATCH = 'D:/modcar-scratch/chassis'
LEAN = 8.0                       # a strut's top leans this far inboard (deg)
CAL = math.radians(150.0)        # a caliper's centre: behind (-X) and 30 deg above the hub (+Z)

# local (x, y, z) -> world (x, -z, y): an outline drawn in the disc plane (X, Z), extruded inboard (-Y)
DISC_PLANE = Matrix(((1, 0, 0, 0), (0, 0, -1, 0), (0, 1, 0, 0), (0, 0, 0, 1)))


# ------------------------------------------------------------------------------------------------ 2D helpers


def area2(pts):
    n = len(pts)
    return sum(pts[i][0] * pts[(i + 1) % n][1] - pts[(i + 1) % n][0] * pts[i][1] for i in range(n)) / 2.0


def ccw(pts):
    return list(pts) if area2(pts) > 0 else list(reversed(pts))


def round_poly(pts, rad, k=2, min_deg=24.0):
    """Round the corners of a closed polygon (corners sharper than min_deg) with quadratic arcs of radius ~rad."""
    P2 = [Vector((p[0], p[1])) for p in pts]
    n = len(P2)
    out = []
    for i in range(n):
        p0, p1, p2 = P2[i - 1], P2[i], P2[(i + 1) % n]
        d1, d2 = p1 - p0, p2 - p1
        l1, l2 = d1.length, d2.length
        if l1 < 1e-9 or l2 < 1e-9:
            continue
        d1 /= l1
        d2 /= l2
        th = math.acos(max(-1.0, min(1.0, d1.dot(d2))))
        if rad <= 0 or th < math.radians(min_deg):
            out.append(p1)
            continue
        t = min(rad * math.tan(th / 2), l1 * 0.48, l2 * 0.48)
        a, b = p1 - d1 * t, p1 + d2 * t
        for j in range(k + 1):
            u = j / k
            out.append(a * ((1 - u) ** 2) + p1 * (2 * u * (1 - u)) + b * (u * u))
    return [(q.x, q.y) for q in out]


def polar(r, a):
    """A point of the disc plane (X, Z) at radius r and angle a (from +X towards +Z)."""
    return (r * math.cos(a), r * math.sin(a))


def at(r, a, y):
    """The 3D point at radius r, angle a of the disc plane, at y."""
    x, z = polar(r, a)
    return (x, y, z)


def sector(r0, r1, a0, a1, n=6, rc=0.006, k=2):
    """An annular sector of the disc plane between radii r0 < r1 and angles a0 < a1, its corners rounded."""
    outer = [polar(r1, a0 + (a1 - a0) * i / n) for i in range(n + 1)]
    m = max(2, n // 3)
    inner = [polar(r0, a1 - (a1 - a0) * i / m) for i in range(m + 1)]
    return round_poly(outer + inner, rc, k=k)


def stadium(p0, p1, r, n=4):
    """A bar with round ends between the 2D points p0 and p1 (a shackle link's outline)."""
    p0, p1 = Vector(p0), Vector(p1)
    d = (p1 - p0).normalized()
    a = math.atan2(d.y, d.x)
    pts = []
    for (c, a0) in ((p1, a - math.pi / 2), (p0, a + math.pi / 2)):
        for i in range(n + 1):
            t = a0 + math.pi * i / n
            pts.append((c.x + r * math.cos(t), c.y + r * math.sin(t)))
    return pts


def ring_profile(r_in, r_out, w, c=0.002):
    """The section (r, z) of a ring between r_in and r_out, w wide along its axis, outer edges chamfered by c."""
    return [(r_in, -w / 2), (r_out - c, -w / 2), (r_out, -w / 2 + c), (r_out, w / 2 - c), (r_out - c, w / 2),
            (r_in, w / 2)]


def ring4(r_in, r_out, w):
    """The plain rectangular section (r, z) of a ring between r_in and r_out, w wide along its axis."""
    return [(r_in, -w / 2), (r_out, -w / 2), (r_out, w / 2), (r_in, w / 2)]


def interp(prof, x):
    """Piecewise-linear y(x) through [(x, y), ...] sorted by x (clamped)."""
    if x <= prof[0][0]:
        return prof[0][1]
    for (xa, ya), (xb, yb) in zip(prof[:-1], prof[1:]):
        if xa <= x <= xb:
            return ya + (yb - ya) * (x - xa) / ((xb - xa) or 1.0)
    return prof[-1][1]


# ------------------------------------------------------------------------------------------------ shared pieces


def plate_xz(P, name, poly, y0, y1, material, bev=0.003, segs=1, **kw):
    """A slab outlined by poly in the disc plane (X, Z), from y0 (its outer face) back to y1 < y0. Only its faces'
    edges are chamfered; the outline's own (rounded) corners shade smooth."""
    kw.setdefault('bev_angle', 50.0)
    kw.setdefault('sharp', 50.0)
    m = Matrix.Translation((0, y0, 0)) @ DISC_PLANE
    return P.prism(name, ccw(poly), y0 - y1, material=material, matrix=m, bev=bev, segs=segs, center=False, **kw)


def lean(P, i0, deg=LEAN, axis='X', pivot=(0, 0, 0)):
    """Tilt every static made since P.statics[i0] (and the cutters on them) about an axis through pivot (+deg
    about X: the top goes to -Y, inboard)."""
    R = Matrix.Translation(pivot) @ Matrix.Rotation(math.radians(deg), 4, axis) @ Matrix.Translation(-V(pivot))
    for o in P.statics[i0:]:
        o.data.transform(R)
        for c in P.cfg[o.name]['cutters']:
            c.data.transform(R)


def helix(z0, z1, R, rw, turns, steps=16, ends=0.85, a0=0.0):
    """
    The centre line of a coil spring sitting between seats at z0 and z1 (along Z): closed end coils (the wire
    touching itself) blending over `ends` turns into evenly pitched active coils.
    """
    n = max(4, int(round(turns * steps)))
    du = turns / n

    def act(u):
        d = min(u, turns - u)
        t = max(0.0, min(1.0, (d - ends * 0.2) / (ends * 0.8)))
        return t * t * (3 - 2 * t)

    p_end = 2.0 * rw * 1.06
    A = sum(act((i + 0.5) * du) for i in range(n)) * du
    H = (z1 - rw) - (z0 + rw)
    p_act = p_end + (H - p_end * turns) / max(A, 1e-6)
    pts = []
    z = z0 + rw
    for i in range(n + 1):
        u = i * du
        a = a0 + TAU * u
        pts.append((R * math.cos(a), R * math.sin(a), z))
        if i < n:
            z += (p_end + (p_act - p_end) * act(u + du / 2)) * du
    return pts


def coil(P, z0, z1, R, rw, turns, material, steps=16, segs=5, a0=0.0, ends=0.85, name='spring'):
    """A coil spring between seats at z0 and z1 (along Z), mean coil radius R, wire radius rw."""
    return P.tube(name, helix(z0, z1, R, rw, turns, steps, ends, a0), rw, material, segs=segs, bend=0.0)


def rod(P, name, r, z0, z1, material='chrome', loc=(0, 0), axis='Z', segs=10, show=None):
    """
    A plain rod (or tube) along an axis from z0 to z1, its ends buried in other pieces. show = (s0, s1): where its
    exposed length begins and ends; rings there keep its vertex AO from being decided by its buried ends.
    """
    s0, s1 = show if show else (z0 + 0.008, z1 - 0.008)
    prof = [(r, z0), (r, s0), (r, s1), (r, z1)]
    c = (loc[0], loc[1], 0.0) if axis.endswith('Z') else (loc[0], 0.0, loc[1])
    return P.lathe(name, prof, loc=c, material=material, axis=axis, segs=segs, sharp=40.0)


def eye(P, loc=(0, 0, 0), r_out=0.022, r_in=0.0135, w=0.04, material='steel', axis='X', segs=14, bolt=True,
        sleeve=0.0085, plain=False):
    """A damper's eye: a ring round a rubber bush on a steel sleeve, with its bolt and nut (axis X or Y);
    plain = an unchamfered ring."""
    prof = ring4(r_in, r_out, w) if plain else ring_profile(r_in, r_out, w, 0.0028)
    P.lathe('eye', prof, loc=loc, material=material, axis=axis, segs=segs, loop=True, sharp=40.0)
    P.lathe('bush', ring4(sleeve, r_in + 0.0006, w + 0.004), loc=loc, material='rubber', axis=axis,
            segs=max(8, segs - 4), loop=True, sharp=50.0)
    P.cyl('sleeve', sleeve, w + 0.011, loc, 'steel', axis=axis, segs=8, bev=None)
    if bolt:
        a = V((1, 0, 0)) if axis.endswith('X') else V((0, 1, 0))
        c = V(loc)
        P.bolts([tuple(c + a * (w / 2 + 0.0055)), tuple(c - a * (w / 2 + 0.0055))],
                normal=[tuple(a), tuple(-a)], r=sleeve + 0.0035, h=0.0065, washer=False,
                x_hint=(0, 0, 1) if axis.endswith('X') else (1, 0, 0))


def seat(P, z, r_in, r_out, material='steel', up=True, t=0.004, lip=0.009, segs=16, name='seat'):
    """A spring seat: a dish round the damper, flat where the spring sits, its lip turned up round it (up: the
    lower seat, the spring sitting at z + t; else the upper seat, the spring under it at z - t)."""
    s = 1.0 if up else -1.0
    prof = [(r_in, z), (r_out + 0.0015, z), (r_out + 0.0015, z + s * lip), (r_out - 0.006, z + s * t),
            (r_in, z + s * t)]
    return P.lathe(name, prof, material=material, segs=segs, loop=True, sharp=40.0)


def stud_plate(P, z, poly, studs, material='steel', t=0.006, stud_len=0.024):
    """A top-mount plate (its outline in XY) at z..z+t with studs and their nuts."""
    P.prism('top_plate', poly, t, loc=(0, 0, z + t / 2), material=material, bev=0.0025, segs=1, bev_angle=50.0,
            sharp=50.0)
    for (x, y) in studs:
        P.cyl('stud', 0.0048, stud_len, (x, y, z + stud_len / 2), 'steel', segs=6, bev=None)
    P.bolts([(x, y, z + t) for (x, y) in studs], normal=(0, 0, 1), r=0.0078, h=0.0062, washer=False)


def tri_plate(R, rc=0.022, a0=-90.0):
    """A rounded triangle (strut top mount) of circumradius R in the XY plane, a corner at angle a0 (deg)."""
    pts = [polar(R, math.radians(a0 + 120 * i)) for i in range(3)]
    return ccw(round_poly(pts, rc, k=3))


def bellows(z0, z1, rv, rp, folds, collar0=None, collar1=None):
    """The outer profile (r, z) of a rubber boot from z0 to z1: folds between valley radius rv and peak radius rp,
    straight collars (r, length) at the ends."""
    prof = []
    za, zb = z0, z1
    if collar0:
        prof += [(collar0[0], z0), (collar0[0], z0 + collar0[1])]
        za = z0 + collar0[1] + 0.003
    if collar1:
        zb = z1 - collar1[1] - 0.003
    n = 2 * folds
    for i in range(n + 1):
        prof.append((rp if i % 2 else rv, za + (zb - za) * i / n))
    if collar1:
        prof += [(collar1[0], z1 - collar1[1]), (collar1[0], z1)]
    return prof


def boot_slit(P, prof, thick, gap, centre, segs=12, zig=0.07, material='rubber'):
    """
    A rubber boot torn open: the shell of the profile prof (r, z) lathed round Z except for a crack facing
    `centre` (rad): the crack is gap (rad) wide in its middle, closing to nothing at both ends, and wanders by zig.
    """
    loop = K.shell_profile(prof, thick)
    n = len(prof)
    nk = len(loop)
    bm = bmesh.new()
    rings = []
    for k, (r, z) in enumerate(loop):
        kk = k if k < n else 2 * n - 1 - k        # the outer profile point this loop point belongs to
        t = kk / (n - 1)
        g = gap * math.sin(math.pi * t) ** 0.6
        s = centre + g / 2 + zig * math.sin(kk * 2.1)
        span = TAU - g
        ring = []
        for i in range(segs + 1):
            a = s + span * i / segs
            ring.append(bm.verts.new((r * math.cos(a), r * math.sin(a), z)))
        rings.append(ring)
    for k in range(nk):
        A, B = rings[k], rings[(k + 1) % nk]
        for i in range(segs):
            bm.faces.new((A[i], A[i + 1], B[i + 1], B[i]))
    # the crack's walls: the shell's section at both cut ends
    for k in range(n - 1):
        o0, o1 = rings[k], rings[k + 1]
        i0, i1 = rings[2 * n - 1 - k], rings[2 * n - 2 - k]
        bm.faces.new((o0[0], i0[0], i1[0], o1[0]))
        bm.faces.new((o0[-1], o1[-1], i1[-1], i0[-1]))
    bmesh.ops.remove_doubles(bm, verts=bm.verts[:], dist=1e-6)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    return P.mesh('boot', bm, material, sharp=50.0)


# ------------------------------------------------------------------------------------------------ suspension


def strut_views(P):
    P.views = [('a', -42, 14), ('b', 140, 18)]
    P.ao_distance = 0.05


def build_susp_stock(P):
    """The factory strut: a black coil spring over a grey damper, a pressed spring seat on the body, a triangular
    top mount plate with three studs on its rubber isolator, a rubber bump stop on the chrome rod, the lower eye."""
    i0 = len(P.statics)
    eye(P)
    body = [(0.0, 0.012), (0.016, 0.015), (0.026, 0.034), (0.026, 0.234), (0.0185, 0.242), (0.0185, 0.247),
            (0.0, 0.248)]
    P.lathe('body', body, material='steel', segs=14, sharp=40.0)
    seat(P, 0.112, 0.0255, 0.07, 'steel', up=True)
    rod(P, 'rod', 0.0095, 0.244, 0.391, show=(0.2515, 0.306))
    stop = [(0.0098, 0.31), (0.016, 0.313), (0.0195, 0.33), (0.019, 0.352), (0.0098, 0.364)]
    P.lathe('bump_stop', stop, material='rubber', segs=10, sharp=50.0)
    seat(P, 0.372, 0.011, 0.07, 'steel', up=False)
    iso = [(0.048, 0.3722), (0.051, 0.379), (0.045, 0.387), (0.012, 0.389)]
    P.lathe('isolator', iso, material='rubber', segs=12, sharp=50.0)
    studs = [polar(0.052, math.radians(-90 + 120 * i)) for i in range(3)]
    stud_plate(P, 0.389, tri_plate(0.076), studs, 'steel')
    P.cyl('rod_tip', 0.0065, 0.022, (0, 0, 0.401), 'chrome', segs=8, bev=None)
    P.bolts([(0, 0, 0.395)], normal=(0, 0, 1), r=0.0115, h=0.0085, washer=False)
    coil(P, 0.116, 0.368, 0.058, 0.0058, 6.0, 'trim', a0=math.radians(200))
    lean(P, i0)
    strut_views(P)


def build_susp_soft(P):
    """An old soft strut: a longer, thinner, rust-coloured spring with wide spacing over a long damper, a rubber
    dust boot cracked open over its middle folds (the rod shows through), rusty seat and round top plate."""
    i0 = len(P.statics)
    eye(P)
    body = [(0.0, 0.012), (0.016, 0.015), (0.025, 0.034), (0.025, 0.254), (0.017, 0.262), (0.0, 0.263)]
    P.lathe('body', body, material='steel', segs=14, sharp=40.0)
    seat(P, 0.1, 0.0245, 0.066, 'rust', up=True)
    rod(P, 'rod', 0.0092, 0.259, 0.438, show=(0.268, 0.33))
    # the boot: whole at its collars and its first and last folds, torn open over the middle ones
    full0 = bellows(0.255, 0.296, 0.0205, 0.026, 1, collar0=(0.0262, 0.012))
    mid = bellows(0.296, 0.377, 0.0205, 0.026, 2)
    full1 = bellows(0.377, 0.418, 0.0205, 0.026, 1, collar1=(0.0135, 0.01))
    for prof in (full0, full1):
        P.lathe('boot', prof, material='rubber', segs=12, sharp=50.0)
    boot_slit(P, mid, 0.0018, math.radians(36), math.radians(40))
    seat(P, 0.425, 0.012, 0.066, 'steel', up=False)
    iso = [(0.045, 0.4252), (0.049, 0.43), (0.043, 0.435), (0.012, 0.436)]
    P.lathe('isolator', iso, material='rubber', segs=12, sharp=50.0)
    studs = [polar(0.046, math.radians(-90 + 120 * i)) for i in range(3)]
    stud_plate(P, 0.436, ccw(K.circle2d(0.062, 16, start=math.radians(11))), studs, 'rust')
    P.cyl('rod_tip', 0.0062, 0.021, (0, 0, 0.4475), 'chrome', segs=8, bev=None)
    P.bolts([(0, 0, 0.442)], normal=(0, 0, 1), r=0.011, h=0.008, washer=False)
    coil(P, 0.104, 0.421, 0.056, 0.0047, 5.2, 'rust', a0=math.radians(160))
    lean(P, i0)
    strut_views(P)


def build_susp_sport(P):
    """A coilover: a short stiff spring in the part's own colour on a threaded alloy body, the spring perch and its
    lock ring (black, with spanner notches) screwed high up the threads, an alloy top mount with three studs and a
    damping-adjuster knob (the part's colour) on the rod."""
    i0 = len(P.statics)
    eye(P, material='alu')
    body = [(0.0, 0.012), (0.015, 0.015), (0.0255, 0.034), (0.0255, 0.264), (0.018, 0.27), (0.0, 0.271)]
    P.lathe('body', body, material='alu', segs=14, sharp=40.0)
    # the threaded length of the body: a run of ridges
    thr = [(0.0256, 0.074)]
    for i in range(6):
        z = 0.076 + i * 0.0175
        thr += [(0.0278, z + 0.003), (0.0256, z + 0.0175)]
    P.lathe('thread', thr, material='alu', segs=10, sharp=30.0)
    # the perch and the lock ring under it, each with four spanner notches
    for (z, h, r, name) in ((0.188, 0.012, 0.047, 'perch'), (0.172, 0.011, 0.036, 'lock_ring')):
        o = P.lathe(name, ring4(0.0272, r, h), loc=(0, 0, z + h / 2), material='trim', segs=16, loop=True,
                    sharp=40.0)
        cut = bmesh.new()
        for i in range(4):
            a = math.radians(45 + 90 * i)
            K.bm_cube(cut, (0.012, 0.007, h + 0.01), mat4((r * math.cos(a), r * math.sin(a), z + h / 2),
                                                          (0, 0, math.degrees(a))))
        P.cut(o, cut)
    rod(P, 'rod', 0.011, 0.266, 0.364, show=(0.275, 0.307))
    stop = [(0.0112, 0.312), (0.016, 0.313), (0.0185, 0.324), (0.0175, 0.338), (0.0112, 0.341)]
    P.lathe('bump_stop', stop, material='rubber', segs=8, sharp=50.0)
    seat(P, 0.352, 0.0115, 0.047, 'alu', up=False, lip=0.008)
    # the alloy top mount: a round machined plate on its bearing housing, three studs, the adjuster knob
    P.lathe('bearing', [(0.03, 0.3521), (0.034, 0.354), (0.034, 0.362), (0.0115, 0.3625)], material='alu', segs=12,
            sharp=40.0)
    studs = [polar(0.046, math.radians(-90 + 120 * i)) for i in range(3)]
    stud_plate(P, 0.362, ccw(K.circle2d(0.06, 16, start=math.radians(11))), studs, 'alu', t=0.008)
    P.bolts([(0, 0, 0.37)], normal=(0, 0, 1), r=0.0115, h=0.0075, washer=False)
    knob = [(0.0, 0.3775), (0.0115, 0.3775), (0.0125, 0.3795), (0.0125, 0.389), (0.0105, 0.391), (0.0, 0.391)]
    P.lathe('knob', knob, material='paint', segs=10, sharp=40.0)
    coil(P, 0.2, 0.348, 0.04, 0.0068, 5.0, 'paint', a0=math.radians(210))
    lean(P, i0)
    strut_views(P)


def build_susp_lift(P):
    """A long-travel off-road coilover: a tall spring in the part's own colour, a thick black damper body with an
    alloy cap and a threaded alloy perch, eyes at both ends, a remote alloy reservoir canister clamped beside the
    body and joined to its foot by a short braided hose (hose ends in the part's colour)."""
    i0 = len(P.statics)
    eye(P, r_out=0.025, r_in=0.015, w=0.046, sleeve=0.0095)
    body = [(0.0, 0.014), (0.018, 0.017), (0.0335, 0.04), (0.0335, 0.318), (0.026, 0.324), (0.0, 0.325)]
    P.lathe('body', body, material='trim', segs=14, sharp=40.0)
    P.lathe('cap', ring4(0.0333, 0.0356, 0.016), loc=(0, 0, 0.31), material='alu', segs=14, loop=True, sharp=40.0)
    P.lathe('perch', ring4(0.0335, 0.072, 0.012), loc=(0, 0, 0.176), material='alu', segs=16, loop=True,
            sharp=40.0)
    rod(P, 'rod', 0.0122, 0.321, 0.44, show=(0.33, 0.387))
    stop = [(0.0124, 0.392), (0.02, 0.394), (0.0235, 0.405), (0.023, 0.42), (0.0124, 0.424)]
    P.lathe('bump_stop', stop, material='rubber', segs=10, sharp=50.0)
    seat(P, 0.432, 0.012, 0.072, 'steel', up=False, lip=0.008)
    # the top eye (bolt along X), a boss joining it to the seat
    P.cyl('top_boss', 0.016, 0.014, (0, 0, 0.438), 'steel', segs=10, bev=None)
    eye(P, loc=(0, 0, 0.462), r_out=0.024, r_in=0.0145, w=0.044, sleeve=0.009, bolt=False, plain=True)
    coil(P, 0.182, 0.428, 0.061, 0.0068, 5.5, 'paint', steps=15, a0=math.radians(180))
    # the remote reservoir behind the body (-X), clamped to it, its hose from the foot of the body
    rx, rz0, rz1 = -0.064, 0.058, 0.152
    P.lathe('reservoir', [(0.0, rz0), (0.016, rz0), (0.0195, rz0 + 0.004), (0.0195, rz1 - 0.004), (0.016, rz1),
                          (0.0, rz1)], loc=(rx, 0, 0), material='alu', segs=10, sharp=40.0)
    P.cyl('res_valve', 0.0042, 0.012, (rx, 0, rz1 + 0.005), 'steel', segs=6, bev=None)
    P.cyl('res_band', 0.0212, 0.012, (rx, 0, 0.115), 'trim', segs=12, bev=None)
    P.cyl('clamp', 0.0357, 0.012, (0, 0, 0.115), 'alu', segs=14, bev=None)
    P.box('clamp_block', (0.016, 0.012, 0.012), (-0.042, 0, 0.115), 'alu', bev=0.0015, segs=1)
    hose = [(-0.027, 0.0205, 0.052), (-0.038, 0.036, 0.04), (-0.058, 0.032, 0.022), (rx, 0.006, rz0 - 0.003)]
    P.tube('hose', hose, 0.005, 'steel', segs=6, bend=0.012)
    for (p, ax) in (((-0.027, 0.0205, 0.052), (-0.8, 0.6, 0)), ((rx, 0.002, rz0 - 0.004), (0, 0, 1))):
        P.cyl('hose_end', 0.0072, 0.013, p, 'paint', axis=ax, segs=6, bev=None)
    lean(P, i0)
    strut_views(P)


def leaf_curve(x, z_mid, camber, L):
    """The main leaf's centre line height at x: flat under the clamp, rising by camber at |x| = L."""
    u = max(0.0, abs(x) - 0.05) / (L - 0.05)
    return z_mid + camber * u * u


def build_susp_leaf(P):
    """
    Heavy-duty leaf springs: a pack of five steel leaves (the main leaf rolled into an eye at each end, the rear
    one hung on a shackle), rebound clips, the pack clamped on its pad by two U-bolts round the axle with their
    nuts on the top plate; a plain black damper stands inboard beside it, its lower eye on a tab of the top plate.
    """
    P.ao_distance = 0.05
    t, gap, w = 0.0085, 0.0008, 0.05
    L = 0.43
    halves = [L, 0.37, 0.3, 0.23, 0.155]
    camber = 0.032
    nl = len(halves)
    z_top_mid = nl * t + (nl - 1) * gap            # the main leaf's top over the pad
    zc_main = z_top_mid - t / 2                    # its centre line
    prof = ccw(K.rounded_rect(t, w, 0.0026, seg=1))
    r_pin, r_eye = 0.0125, 0.0125 + t + 0.0006      # the eyes' bore and outside
    r_mid = (r_pin + r_eye) / 2
    for i, hl in enumerate(halves):
        dz = i * (t + gap)
        # (the main leaf runs on into the side of its eyes)
        end = hl - (r_mid * 0.85 if i == 0 else 0.0)
        n = max(2, int(round(end / 0.09)))
        xs = [-end + end * j / n for j in range(2 * n + 1)]
        path = [V((x, 0.0, leaf_curve(x, zc_main, camber, L) - dz)) for x in xs]
        bm = bmesh.new()
        K.bm_sweep(bm, path, 1.0, profile=prof, caps=True)
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
        P.mesh('leaf', bm, 'steel', sharp=40.0)
    # the eyes, rolled from the main leaf (their centres on its centre line)
    z_eye = leaf_curve(L, zc_main, camber, L)
    for sx in (1, -1):
        c = (sx * L, 0, z_eye)
        P.lathe('leaf_eye', ring4(r_pin, r_eye, w), loc=c, material='steel', axis='Y', segs=12, loop=True,
                sharp=40.0)
        P.lathe('eye_bush', ring4(0.0078, r_pin + 0.0006, w + 0.004), loc=c, material='rubber', axis='Y', segs=8,
                loop=True, sharp=50.0)
        P.cyl('eye_pin', 0.0078, w + 0.02, c, 'steel', axis='Y', segs=8, bev=None)
        P.bolts([(c[0], w / 2 + 0.01, c[2]), (c[0], -w / 2 - 0.01, c[2])], normal=[(0, 1, 0), (0, -1, 0)],
                r=0.011, h=0.0072, washer=False)
    # the shackle at the rear eye: two links up and back to the frame's pin
    e = (-L, z_eye)
    top = (e[0] - 0.026, e[1] + 0.022)
    for sy in (1, -1):
        m = Matrix.Translation((0, sy * (w / 2 + 0.0062), 0)) @ DISC_PLANE
        P.prism('shackle', ccw(stadium(e, top, 0.0122)), 0.006, material='steel', matrix=m, bev=0.0015, segs=1,
                center=True, bev_angle=50.0, sharp=50.0)
    P.lathe('shackle_bush', ring4(0.007, 0.0112, w + 0.004), loc=(top[0], 0, top[1]), material='rubber', axis='Y',
            segs=8, loop=True, sharp=50.0)
    P.cyl('shackle_pin', 0.0068, w + 0.032, (top[0], 0, top[1]), 'steel', axis='Y', segs=8, bev=None)
    P.bolts([(top[0], w / 2 + 0.0092, top[1]), (top[0], -w / 2 - 0.0092, top[1])], normal=[(0, 1, 0), (0, -1, 0)],
            r=0.0098, h=0.0065, washer=False)
    # rebound clips round the first three leaves, their bolts across the top
    for sx in (1, -1):
        x = sx * 0.255
        zt = leaf_curve(x, zc_main, camber, L) + t / 2 + 0.0095
        zb = zt - 0.0095 - 3 * t - 2 * gap - 0.0018
        loop = [(x, y, (zt + zb) / 2 + z) for (y, z) in K.rounded_rect(w + 0.0036, zt - zb, 0.004, seg=1)]
        P.tube('clip', loop, 0.0017, 'steel', segs=4, closed=True)
        P.cyl('clip_bolt', 0.0034, w + 0.016, (x, 0, zt - 0.0045), 'steel', axis='Y', segs=6, bev=None)
    # the pad under the pack (it sits on the axle tube)
    P.box('pad', (0.13, w + 0.004, 0.012), (0, 0, -0.006), 'trim', bev=0.003, segs=1)
    # the top plate and the U-bolts round the axle below, their nuts on top
    zp = z_top_mid + 0.0005
    P.box('top_plate', (0.13, 0.098, 0.008), (0, -0.008, zp + 0.004), 'steel', bev=0.002, segs=1)
    zn = zp + 0.008
    legs = []
    for sx in (1, -1):
        x = sx * 0.044
        rb = 0.033
        zc = -0.036
        bend = [(x, -rb, zn + 0.013), (x, -rb, zc)]
        for j in range(1, 8):
            a = math.pi + math.pi * j / 8
            bend.append((x, rb * math.cos(a), zc + rb * math.sin(a)))
        bend += [(x, rb, zc), (x, rb, zn + 0.013)]
        P.tube('u_bolt', bend, 0.0062, 'alu', segs=5, bend=0.0)
        legs += [(x, -rb, zn), (x, rb, zn)]
    P.bolts(legs, normal=(0, 0, 1), r=0.0105, h=0.0085, washer=False)
    # the damper: inboard of the pack, its lower eye (bolt along Y) on a tab standing on the top plate's edge
    tab_y = -0.0545
    P.box('damper_tab', (0.044, 0.006, 0.046), (0.0, tab_y, zn + 0.02), 'steel', bev=0.002, segs=1)
    i0 = len(P.statics)
    de = V((0.0, tab_y - 0.022, zn + 0.03))
    eye(P, loc=tuple(de), r_out=0.019, r_in=0.012, w=0.034, axis='Y', segs=12, sleeve=0.0075, plain=True)
    zl = de.z
    body = [(0.0, zl + 0.012), (0.014, zl + 0.014), (0.024, zl + 0.03), (0.024, zl + 0.23), (0.018, zl + 0.236),
            (0.0, zl + 0.237)]
    P.lathe('damper_body', body, loc=(de.x, de.y, 0), material='trim', segs=14, sharp=40.0)
    rod(P, 'damper_rod', 0.0085, zl + 0.233, zl + 0.31, loc=(de.x, de.y), show=(zl + 0.242, zl + 0.279))
    P.lathe('damper_stop', [(0.0087, zl + 0.282), (0.014, zl + 0.284), (0.016, zl + 0.296), (0.0087, zl + 0.3)],
            loc=(de.x, de.y, 0), material='rubber', segs=10, sharp=50.0)
    eye(P, loc=(de.x, de.y, zl + 0.322), r_out=0.019, r_in=0.012, w=0.034, axis='Y', segs=12, sleeve=0.0075,
        bolt=False, plain=True)
    # (its top leans forward)
    lean(P, i0, deg=9.0, axis='Y', pivot=tuple(de))
    P.views = [('a', -55, 20), ('b', 150, 26)]


# ------------------------------------------------------------------------------------------------ brakes


def disc_ring(P, r0, r1, y0, y1, material='steel', segs=32, ch=0.0016, name='disc', faces='both', mid=()):
    """A friction ring: the annulus r0..r1 between its outer face y0 and its inner face y1 < y0; the outer edge of
    the faces named ('both', 'out' = y0, 'in' = y1) chamfered by ch; mid = radii of extra rings on both faces
    (round a drilled band, so the holes' vertex AO stays in it)."""
    pts = [(r0, y1)] + [(m, y1) for m in mid]
    pts += [(r1 - ch, y1), (r1, y1 + ch)] if faces in ('both', 'in') else [(r1, y1)]
    pts += [(r1, y0 - ch), (r1 - ch, y0)] if faces in ('both', 'out') else [(r1, y0)]
    pts += [(m, y0) for m in reversed(mid)] + [(r0, y0)]
    return P.lathe(name, pts, material=material, axis='Y', segs=segs, loop=True, sharp=40.0)


def hat(P, r_bore, r_hat, y_face, y_join, material='trim', segs=24, wall=0.005):
    """A disc's hat: its face (y_face, the wheel's side) round the centre bore, its wall down to the friction ring
    at y_join."""
    prof = [(r_bore, y_face - 0.006), (r_hat - wall, y_face - 0.006), (r_hat - wall, y_join), (r_hat, y_join),
            (r_hat, y_face - 0.003), (r_hat - 0.003, y_face), (r_bore, y_face)]
    return P.lathe('hat', prof, material=material, axis='Y', segs=segs, loop=True, sharp=40.0)


def boss(P, r, a, y, depth, rad, material, ch=0.003, segs=14, name='piston_boss'):
    """A piston's round boss on a caliper's back face at y, standing depth further inboard."""
    x, z = polar(r, a)
    prof = [(rad, -0.004), (rad, depth - ch), (rad - ch, depth), (0.0, depth)]
    return P.lathe(name, prof, loc=(x, y, z), material=material, axis='-Y', segs=segs, sharp=40.0)


def hose(P, pts, r=0.0046, nut=(0.0068, 0.006), material='rubber'):
    """A brake hose: a banjo bolt (radius, height) where it leaves the caliper, a crimped ferrule at its far end."""
    P.tube('hose', pts, r, material, segs=6, bend=0.012)
    if nut:
        P.bolts([pts[0]], normal=(0, -1, 0), r=nut[0], h=nut[1], washer=True)
    p1, p0 = V(pts[-1]), V(pts[-2])
    d = (p1 - p0).normalized()
    P.cyl('ferrule', r * 1.45, 0.014, tuple(p1 - d * 0.004), 'steel', axis=tuple(d), segs=6, bev=None)


def floating_caliper(P, t_disc, r_disc, hs, rh0, rh1, depth, pistons, material='trim', a=CAL, pad=0.012,
                     piston_r=0.024):
    """
    A floating caliper straddling the disc's edge at angle a: its housing behind the disc (the pistons' round
    bosses on its back), the bridge over the edge, thin outboard fingers on the disc's outer face; the inner pad
    (its steel backing plate) between housing and disc, the steel carrier bracket's ears either side with its two
    bolts, the guide-pin bolts, the bleed nipple. Returns the housing's back face y.
    """
    y_h0 = -(t_disc + pad)                 # the housing's face towards the disc
    y_h1 = y_h0 - depth                    # its back
    plate_xz(P, 'cal_housing', sector(rh0, rh1, a - hs, a + hs, n=6, rc=0.009), y_h0, y_h1, material, bev=0.0045)
    plate_xz(P, 'cal_bridge', sector(r_disc + 0.003, rh1, a - hs * 0.84, a + hs * 0.84, n=5, rc=0.004), 0.0013,
             y_h0 - 0.0005, material, bev=0.003)
    plate_xz(P, 'cal_fingers', sector(rh0 + 0.008, rh1, a - hs * 0.78, a + hs * 0.78, n=5, rc=0.008), 0.0048,
             0.0012, material, bev=0.0012)
    rp = (rh0 + rh1) / 2 - 0.002
    for o in ([0.0] if pistons == 1 else [-hs * 0.46, hs * 0.46]):
        boss(P, rp, a + o, y_h1 + 0.001, 0.012, piston_r, material)
    # the inner pad: its friction block against the disc, its steel backing plate against the pistons
    ps = hs * 0.82
    plate_xz(P, 'pad', sector(r_disc - 0.036, r_disc - 0.002, a - ps, a + ps, n=4, rc=0.004, k=1),
             -t_disc - 0.0006, y_h0 + 0.0035, 'trim', bev=None)
    plate_xz(P, 'pad_back', sector(r_disc - 0.038, r_disc - 0.0015, a - ps * 1.04, a + ps * 1.04, n=4, rc=0.004,
                                   k=1), y_h0 + 0.0035, y_h0 + 0.0002, 'steel', bev=None)
    # the carrier: an arm along the disc's inner part with two ears reaching up past the pads' ends
    e0, e1 = hs * 0.86, hs * 1.22
    ri, rn, ro = rh0 - 0.015, r_disc - 0.035, r_disc + 0.001
    pts = [polar(ri, a - e1 + 2 * e1 * i / 4) for i in range(5)]
    pts += [polar(ro, a + e1), polar(ro, a + e0)]
    pts += [polar(rn, a + e0 - 2 * e0 * i / 3) for i in range(4)]
    pts += [polar(ro, a - e0), polar(ro, a - e1)]
    plate_xz(P, 'carrier', round_poly(pts, 0.004, k=1), -t_disc - 0.0015, -t_disc - 0.0095, 'steel', bev=0.0015)
    P.bolts([at(ri + 0.009, a - e1 + 0.07, -t_disc - 0.0095), at(ri + 0.009, a + e1 - 0.07, -t_disc - 0.0095)],
            normal=(0, -1, 0), r=0.0078, h=0.0065, washer=False)
    # guide-pin bolts at the housing's ends, the bleed nipple at its upper end
    P.bolts([at(rh0 + 0.011, a - hs + 0.06, y_h1), at(rh0 + 0.011, a + hs - 0.06, y_h1)], normal=(0, -1, 0),
            r=0.0068, h=0.0055, washer=False)
    bx, bz = polar(rh1 - 0.011, a - hs + 0.07)
    P.cyl('bleeder', 0.0032, 0.01, (bx, y_h1 - 0.004, bz), 'steel', axis='Y', segs=6, bev=None)
    P.cyl('bleeder_cap', 0.0045, 0.005, (bx, y_h1 - 0.0095, bz), 'rubber', axis='Y', segs=8, bev=None)
    return y_h1


def brake_views(P, moto=False):
    P.views = [('a', -62, 16), ('b', 128, 18)]
    P.ao_distance = 0.035 if moto else 0.045


# the backing plate's section (r, y): its inboard face out to the rim, then back along its drum side
BACKING = [(0.036, -0.0795), (0.084, -0.0795), (0.104, -0.0745), (0.1255, -0.0705), (0.1255, -0.067),
           (0.104, -0.0717), (0.084, -0.0767), (0.036, -0.0767)]


def backing_y(r):
    """Where the backing plate's inboard face is (y) at radius r."""
    return interp(BACKING[:4], r)


def build_brakes_drum(P):
    """A drum brake: a finned cast-iron drum with its bearing boss, on a pressed backing plate; behind the plate
    the wheel cylinder with its bleed nipple, the brake line to it along the plate from its bracket, the
    adjuster's rubber plug and the plate's four bolts; on the drum's stepped face its raised hub with the
    bearing's dust cap, two drum screws and the adjuster's access plug. No caliper."""
    # the drum (a closed solid: its open end is hidden by the backing plate)
    prof = [(0.0, -0.068), (0.12, -0.068), (0.1205, -0.061), (0.114, -0.058)]
    for i in range(3):
        z = -0.0525 + i * 0.0135
        prof += [(0.114, z), (0.1275, z + 0.0022), (0.1275, z + 0.0058), (0.114, z + 0.008)]
    prof += [(0.114, -0.0095), (0.106, 0.0), (0.09, 0.0), (0.086, -0.0045), (0.052, -0.0045), (0.048, 0.0035),
             (0.0, 0.0035)]
    P.lathe('drum', prof, material='steel', axis='Y', segs=24, sharp=38.0)
    P.lathe('dust_cap', [(0.0195, 0.002), (0.0195, 0.0042), (0.017, 0.0048), (0.0, 0.0048)], material='trim',
            axis='Y', segs=12, sharp=40.0)
    P.bolts([at(0.068, math.radians(a), -0.0045) for a in (20, 200)], normal=(0, 1, 0), r=0.0052, h=0.0032,
            washer=False)
    P.cyl('access_plug', 0.0062, 0.0022, at(0.072, math.radians(115), -0.0036), 'rubber', axis='Y', segs=8,
          bev=None)
    # the backing plate: a pressed dish, its rim turned out round the drum's lip; the axle boss, four bolts
    P.lathe('backing', BACKING, material='trim', axis='Y', segs=24, loop=True, sharp=40.0)
    P.cyl('axle_boss', 0.038, 0.005, (0, -0.082, 0), 'trim', axis='Y', segs=12, bev=None)
    P.bolts([at(0.052, math.radians(45 + 90 * i), -0.0795) for i in range(4)], normal=(0, -1, 0), r=0.0068,
            h=0.0055, washer=False)
    P.torus('plate_rib', 0.07, 0.0022, loc=(0, -0.0795, 0), axis='Y', segs=24, rsegs=3, material='trim')
    # the wheel cylinder's back at the top of the plate: the line's union behind, the bleeder in front
    wz = 0.098
    yb = backing_y(wz) - 0.0045
    P.box('wheel_cyl', (0.048, 0.0095, 0.022), (0.0, yb, wz), 'steel', bev=0.003, segs=1)
    P.cyl('wc_union', 0.0075, 0.003, (-0.012, yb - 0.0062, wz), 'steel', axis='Y', segs=8, bev=None)
    P.cyl('bleeder', 0.003, 0.0045, (0.013, yb - 0.0067, wz + 0.002), 'steel', axis='Y', segs=6, bev=None)
    P.cyl('bleeder_cap', 0.0042, 0.0025, (0.013, yb - 0.0081, wz + 0.002), 'rubber', axis='Y', segs=8, bev=None)

    # the brake line: from the union down onto the plate and back along it to its bracket
    def on_plate(r, deg, lift=0.0026):
        return at(r, math.radians(deg), backing_y(r) - lift)

    line = [(-0.012, yb - 0.0062, wz), (-0.026, yb - 0.0058, wz - 0.001), on_plate(0.1, 112, 0.004),
            on_plate(0.1, 126), on_plate(0.1, 140)]
    P.tube('brake_line', line, 0.0024, 'steel', segs=6, bend=0.012)
    bx, bz = polar(0.1, math.radians(146))
    P.box('line_bracket', (0.014, 0.0035, 0.018), (bx, backing_y(0.1) - 0.0017, bz), 'steel', bev=0.0012, segs=1,
          rot=(0, -56, 0))
    d = V(on_plate(0.1, 146)) - V(on_plate(0.1, 140))
    P.cyl('line_nut', 0.0048, 0.008, on_plate(0.1, 143), 'steel', axis=tuple(d.normalized()), segs=6, bev=None)
    # the adjuster's rubber plug low on the plate
    P.cyl('adjust_plug', 0.0085, 0.004, (0.0, backing_y(0.094) - 0.0015, -0.094), 'rubber', axis='Y', segs=8,
          bev=None)
    brake_views(P)


def build_brakes_disc(P):
    """A plain solid disc (steel, its dark hat) and a single-piston floating caliper on its carrier bracket, the
    brake hose on a banjo bolt."""
    t = 0.022
    disc_ring(P, 0.064, 0.115, 0.0, -t)
    hat(P, 0.031, 0.066, 0.003, -t + 0.004)
    y = floating_caliper(P, t, 0.115, math.radians(19), 0.082, 0.1285, 0.026, 1, piston_r=0.025)
    a = CAL
    hose(P, [at(0.111, a - 0.13, y - 0.002), at(0.113, a - 0.2, y - 0.012), at(0.118, a - 0.34, y - 0.017),
             at(0.12, a - 0.46, y - 0.018)])
    brake_views(P)


def build_brakes_vented(P):
    """A thicker vented disc - two friction plates on straight vanes, the gaps showing round its edge and inside -
    with its dark hat, and a bigger twin-piston floating caliper."""
    t, tp = 0.028, 0.0082
    disc_ring(P, 0.062, 0.115, 0.0, -tp, name='plate_out', faces='out')
    disc_ring(P, 0.062, 0.115, -t + tp, -t, name='plate_in', faces='in')
    bm = bmesh.new()
    nv = 24
    for i in range(nv):
        a = TAU * (i + 0.5) / nv
        c = (0.0895 * math.cos(a), -t / 2, 0.0895 * math.sin(a))
        K.bm_cube(bm, (0.05, t - 2 * tp + 0.001, 0.0045), mat4(c, (0, -math.degrees(a), 0)))
    P.mesh('vanes', bm, 'steel', sharp=40.0)
    hat(P, 0.031, 0.064, 0.003, -tp + 0.002)
    y = floating_caliper(P, t, 0.115, math.radians(25), 0.08, 0.1295, 0.029, 2, piston_r=0.021)
    a = CAL
    hose(P, [at(0.112, a - 0.04, y - 0.002), at(0.115, a - 0.12, y - 0.009), at(0.12, a - 0.3, y - 0.013),
             at(0.121, a - 0.45, y - 0.0135)])
    brake_views(P)


def drill(r_list, groups, a0=0.0, step=0.075, hole_r=0.0036, y0=0.004, y1=-0.032, sides=6):
    """A cutter of cross-drilled holes: groups of holes on a curved line through the radii r_list."""
    bm = bmesh.new()
    for g in range(groups):
        for j, r in enumerate(r_list):
            a = a0 + TAU * g / groups + j * step
            x, z = polar(r, a)
            K.bm_cyl(bm, hole_r, y0 - y1, segs=sides,
                     matrix=Matrix.Translation((x, (y0 + y1) / 2, z)) @ K.axis_matrix('Y') @ mat4(rot=(0, 0, 30)))
    return bm


def build_brakes_sport(P):
    """A cross-drilled two-piece disc (steel ring on an alloy bell, drive bobbins round the joint) and a
    four-piston fixed caliper in the part's own colour: rounded halves, two bridges over the disc's edge and the
    pad window between them with its pin, the piston bores' bulges on the back."""
    t = 0.026
    rin = 0.07
    ring = disc_ring(P, rin, 0.1155, 0.0, -t, segs=24, mid=(0.0765, 0.1115))
    P.cut(ring, drill([0.083, 0.094, 0.105], 6, a0=math.radians(10), step=0.1, y1=-t - 0.006))
    # the alloy bell, a gap round it bridged to the ring by the drive bobbins
    rb = 0.0615
    P.lathe('bell', [(0.03, -0.004), (0.03, 0.003), (rb - 0.003, 0.003), (rb, 0.0), (rb, -0.012),
                     (rb - 0.005, -0.012), (rb - 0.005, -0.004)], material='alu', axis='Y', segs=18, loop=True,
            sharp=40.0)
    bm = bmesh.new()
    for i in range(6):
        a = TAU * (i + 0.5) / 6
        x, z = polar((rb + rin) / 2, a)
        K.bm_cyl(bm, 0.0068, 0.0068, segs=6, matrix=Matrix.Translation((x, -0.0016, z)) @ K.axis_matrix('Y'))
    P.mesh('bobbins', bm, 'steel', sharp=50.0)
    # the fixed caliper (four pistons, two each side; the outer half a thin plate in front of the disc)
    a = CAL
    hs = math.radians(26)
    rh0, rh1 = 0.08, 0.1305
    y_h0 = -(t + 0.0115)
    y_h1 = y_h0 - 0.03
    plate_xz(P, 'cal_inner', sector(rh0, rh1, a - hs, a + hs, n=8, rc=0.014), y_h0, y_h1, 'paint', bev=0.006)
    plate_xz(P, 'cal_outer', sector(rh0 + 0.006, rh1, a - hs, a + hs, n=8, rc=0.014), 0.0049, 0.0012, 'paint',
             bev=0.0014)
    w = math.radians(6.5)
    for (b0, b1) in ((a - hs * 0.9, a - w), (a + w, a + hs * 0.9)):
        plate_xz(P, 'cal_bridge', sector(0.1195, rh1, b0, b1, n=3, rc=0.003, k=1), 0.0013, y_h0 - 0.0005, 'paint',
                 bev=0.003)
    for o in (-hs * 0.45, hs * 0.45):
        boss(P, 0.104, a + o, y_h1 + 0.001, 0.007, 0.0195, 'paint', ch=0.004)
    # the pads (seen through the window), the pad pin across it
    ps = hs * 0.8
    plate_xz(P, 'pad', sector(0.078, 0.1175, a - ps, a + ps, n=5, rc=0.004, k=1), -t - 0.0006, y_h0 + 0.0035,
             'trim', bev=None)
    plate_xz(P, 'pad_back', sector(0.077, 0.118, a - ps * 1.03, a + ps * 1.03, n=5, rc=0.004, k=1), y_h0 + 0.0035,
             y_h0 + 0.0002, 'steel', bev=None)
    px, pz = polar(0.1225, a)
    P.cyl('pad_pin', 0.0032, 0.0035 - (y_h0 - 0.004), (px, (0.0035 + y_h0 - 0.004) / 2, pz), 'steel', axis='Y',
          segs=8, bev=None)
    # mounting bolts at the inner half's lower corners, the bleeder, the hose
    P.bolts([at(rh0 + 0.012, a - hs + 0.07, y_h1), at(rh0 + 0.012, a + hs - 0.07, y_h1)], normal=(0, -1, 0),
            r=0.0072, h=0.006, washer=False)
    bx, bz = polar(rh1 - 0.012, a - hs + 0.08)
    P.cyl('bleeder', 0.0032, 0.01, (bx, y_h1 - 0.004, bz), 'steel', axis='Y', segs=6, bev=None)
    P.cyl('bleeder_cap', 0.0045, 0.005, (bx, y_h1 - 0.0095, bz), 'rubber', axis='Y', segs=8, bev=None)
    hose(P, [at(0.116, a - 0.1, y_h1 - 0.001), at(0.118, a - 0.18, y_h1 - 0.009), at(0.121, a - 0.34, y_h1 - 0.013),
             at(0.121, a - 0.47, y_h1 - 0.0135)])
    brake_views(P)


def build_brakes_moto(P):
    """A motorcycle's floating disc: a thin petal-edged drilled steel rotor on a black carrier with five windows,
    joined by alloy floating buttons, the carrier's bolts to the hub; a small two-piston alloy caliper with its
    mounting lugs, a banjo hose."""
    t = 0.005
    rin, rmid, amp, petals = 0.072, 0.106, 0.0042, 12
    rings = [(rin, 0.0, -t), (rmid - amp - 0.0035, 0.0, -t), (rmid + amp, 0.0, -t)]
    ns = petals * 4
    off = math.pi / petals / 2              # (a station on every notch between two petals)
    o = P.polar('rotor', rings, lambda k: [off + TAU * j / ns for j in range(ns)], material='steel', axis='Y',
                bev=None)
    # the petal edge: rounded petals with sharp notches between them
    for v in o.data.vertices:
        r = math.hypot(v.co.x, v.co.z)
        if r > rmid - amp:
            a = math.atan2(v.co.z, v.co.x)
            rr = rmid - amp + 2 * amp * abs(math.cos(petals / 2 * a)) ** 0.6
            v.co.x *= rr / r
            v.co.z *= rr / r
    P.cut(o, drill([0.081, 0.092], 8, a0=math.radians(7), step=0.2, hole_r=0.0031, y0=0.003, y1=-0.009))
    # the carrier with its windows, the buttons, the hub bolts
    crings = [(0.026, 0.0004, -0.0056), (0.036, 0.0004, -0.0056), (0.06, 0.0004, -0.0056), (rin, 0.0004, -0.0056)]
    n5 = 5

    def cst(k):
        out = []
        for i in range(n5):
            c = TAU * i / n5
            d = 0.16 if k in (1, 2) else 0.12
            out += [c - d, c + d, c + 0.5 * TAU / n5, c + 0.5 * TAU / n5 + 0.01]
        return out

    P.polar('carrier', crings, cst, hole=lambda k, j: k == 1 and j % 4 != 0, material='trim', axis='Y', bev=None)
    bm = bmesh.new()
    for i in range(6):
        a = TAU * (i + 0.5) / 6
        x, z = polar(rin, a)
        K.bm_cyl(bm, 0.0055, t + 0.0034, segs=6, matrix=Matrix.Translation((x, -t / 2, z)) @ K.axis_matrix('Y'))
    P.mesh('buttons', bm, 'alu', sharp=50.0)
    P.bolts([at(0.031, TAU * (i + 0.5) / n5 + math.pi / 2, 0.0004) for i in range(n5)], normal=(0, 1, 0), r=0.0062,
            h=0.0042, washer=False)
    # the caliper (two pistons inboard), its mounting lugs reaching towards the fork leg
    a = CAL
    hs = math.radians(18)
    rh0, rh1 = 0.083, 0.1245
    y_h0 = -(t + 0.0065)
    y_h1 = y_h0 - 0.02
    plate_xz(P, 'cal_housing', sector(rh0, rh1, a - hs, a + hs, n=5, rc=0.008), y_h0, y_h1, 'alu', bev=0.0035)
    plate_xz(P, 'cal_bridge', sector(0.1125, rh1, a - hs * 0.84, a + hs * 0.84, n=4, rc=0.003), 0.0013,
             y_h0 - 0.0005, 'alu', bev=0.0025)
    plate_xz(P, 'cal_fingers', sector(rh0 + 0.008, rh1, a - hs * 0.78, a + hs * 0.78, n=4, rc=0.007), 0.0048,
             0.0012, 'alu', bev=0.0012)
    for o in (-hs * 0.45, hs * 0.45):
        boss(P, 0.103, a + o, y_h1 + 0.001, 0.007, 0.0145, 'alu', ch=0.0025, segs=12)
    ps = hs * 0.82
    plate_xz(P, 'pad', sector(0.084, 0.1085, a - ps, a + ps, n=4, rc=0.004, k=1), -t - 0.0005, y_h0 + 0.002, 'trim',
             bev=None)
    plate_xz(P, 'pad_back', sector(0.083, 0.109, a - ps * 1.04, a + ps * 1.04, n=4, rc=0.004, k=1), y_h0 + 0.002,
             y_h0 + 0.0002, 'steel', bev=None)
    lugs = [polar(0.068, a + s * 0.30) for s in (-1, 1)]
    lug = round_poly([polar(0.088, a - hs * 0.9), polar(0.064, a - 0.36), polar(0.06, a - 0.25),
                      polar(0.06, a + 0.25), polar(0.064, a + 0.36), polar(0.088, a + hs * 0.9)], 0.008)
    plate_xz(P, 'cal_lugs', lug, y_h0 - 0.004, y_h1 + 0.004, 'alu', bev=None)
    P.bolts([(x, y_h1 + 0.004, z) for (x, z) in lugs], normal=(0, -1, 0), r=0.0068, h=0.0055, washer=False)
    bx, bz = polar(rh1 - 0.01, a - hs + 0.06)
    P.cyl('bleeder', 0.0028, 0.006, (bx, y_h1 - 0.002, bz), 'steel', axis='Y', segs=6, bev=None)
    hose(P, [at(0.114, a + 0.02, y_h1 - 0.001), at(0.116, a - 0.05, y_h1 - 0.002), at(0.12, a - 0.2, y_h1 - 0.002),
             at(0.121, a - 0.33, y_h1 - 0.002)], r=0.0038, nut=(0.0055, 0.0045))
    brake_views(P, moto=True)


# ------------------------------------------------------------------------------------------------ differentials

COVER_X = -0.104                  # the housing's rear flange face: the cover bolts on behind it
# the cover's section (r, distance behind the flange face): its flange, then the dome in to the pole
COVER = [(0.096, 0.0), (0.1302, 0.0), (0.1302, 0.0095), (0.112, 0.0095), (0.104, 0.023), (0.09, 0.035),
         (0.07, 0.045), (0.045, 0.052), (0.0, 0.056)]
DOME = sorted(COVER[3:])


def dome_s(r):
    """How far behind the flange face the cover's dome is at radius r from the axis (X)."""
    return interp(DOME, r)


def carrier(P):
    """
    The differential's carrier: the cast-iron pumpkin round the ring gear (a lathe about X), the pinion snout
    (low: a hypoid pinion) with cast ribs top and bottom, its seal and companion flange with four bolts and the
    pinion nut, the axle-tube bosses, the tubes (painted black) with their bolted end flanges, the half-shafts'
    splined ends, the breather on the left tube. The cover is the caller's (cover()).
    """
    P.ao_distance = 0.06
    C = COVER_X
    pk = [(0.098, C), (0.1305, C), (0.1305, C + 0.01), (0.1245, C + 0.014), (0.13, C + 0.04), (0.134, C + 0.075),
          (0.13, C + 0.11), (0.116, C + 0.145), (0.094, C + 0.172), (0.06, C + 0.196), (0.0, C + 0.204)]
    P.lathe('pumpkin', pk, material='steel', axis='X', segs=22, sharp=38.0)
    zs = -0.024
    sn = [(0.07, 0.06), (0.068, 0.1), (0.06, 0.15), (0.052, 0.19), (0.044, 0.198), (0.0, 0.198)]
    P.lathe('snout', sn, loc=(0, 0, zs), material='steel', axis='X', segs=14, sharp=38.0)
    # cast ribs along the snout, on top and underneath
    r_of = [(q, p) for (p, q) in sn[:4]]
    for phi in (90.0, 270.0):
        xs = [0.085 + 0.02 * i for i in range(6)]
        poly = [(x, interp(r_of, x) - 0.003) for x in xs]
        for x in reversed(xs):
            h = 0.0095 * min(1.0, (x - 0.085) / 0.03) * min(1.0, (0.185 - x) / 0.025)
            poly.append((x, interp(r_of, x) + max(0.0015, h)))
        m = (Matrix.Translation((0, 0, zs)) @ Matrix.Rotation(math.radians(phi - 90), 4, 'X') @
             Matrix.Translation((0, 0.003, 0)) @ DISC_PLANE)
        P.prism('snout_rib', ccw(poly), 0.006, material='steel', matrix=m, bev=None, center=False, sharp=50.0)
    # the pinion: seal, companion flange and its bolts, the nut
    P.lathe('seal', ring4(0.02, 0.033, 0.008), loc=(0.202, 0, zs), material='rubber', axis='X', segs=8, loop=True,
            sharp=45.0)
    fl = [(0.0, 0.204), (0.028, 0.204), (0.028, 0.233), (0.05, 0.234), (0.05, 0.2455), (0.0, 0.2455)]
    P.lathe('flange', fl, loc=(0, 0, zs), material='steel', axis='X', segs=16, sharp=38.0)
    P.bolts([(0.2455, 0.037 * math.cos(TAU * i / 4 + 0.785), zs + 0.037 * math.sin(TAU * i / 4 + 0.785))
             for i in range(4)], normal=(1, 0, 0), r=0.0062, h=0.0055, washer=False, x_hint=(0, 0, 1))
    P.bolts([(0.2455, 0.0, zs)], normal=(1, 0, 0), r=0.0125, h=0.0095, washer=False, x_hint=(0, 0, 1))
    P.cyl('pinion_end', 0.0072, 0.012, (0.258, 0.0, zs), 'steel', axis='X', segs=8, bev=None)
    # the axle tubes in their bosses, the end flanges and the half-shafts' ends
    for sg in (1, -1):
        ax = 'Y' if sg > 0 else '-Y'
        P.lathe('tube_boss', [(0.064, 0.06), (0.064, 0.115), (0.046, 0.133), (0.0405, 0.142)], material='steel',
                axis=ax, segs=16, sharp=38.0)
        P.lathe('tube', [(0.038, 0.136), (0.038, 0.146), (0.038, 0.276), (0.038, 0.286)], material='trim',
                axis=ax, segs=16, sharp=40.0)
        P.cyl('tube_flange', 0.058, 0.012, (0, sg * 0.288, 0), 'steel', axis='Y', segs=16, bev=0.002, bsegs=1)
        P.bolts([(0.047 * math.cos(TAU * (i + 0.5) / 4), sg * 0.294, 0.047 * math.sin(TAU * (i + 0.5) / 4))
                 for i in range(4)], normal=(0, sg, 0), r=0.006, h=0.005, washer=False)
        P.lathe('shaft_end', [(0.0175, 0.294), (0.0175, 0.3125), (0.0, 0.3125)], material='steel', axis=ax,
                segs=10, sharp=40.0)
    # the breather on the left tube
    P.cyl('breather', 0.0045, 0.016, (0.0, 0.17, 0.044), 'steel', segs=6, bev=None)
    P.cyl('breather_cap', 0.0085, 0.008, (0.0, 0.17, 0.055), 'steel', segs=6, bev=None)


def cover(P, material, segs=22):
    """The rear cover: its flange and dome (a lathe about -X, behind the housing's flange) and its eight bolts."""
    P.lathe('cover', COVER, loc=(COVER_X, 0, 0), material=material, axis='-X', segs=segs, sharp=38.0)
    bolts = [(COVER_X - 0.0095, 0.119 * math.cos(TAU * (i + 0.5) / 8), 0.119 * math.sin(TAU * (i + 0.5) / 8))
             for i in range(8)]
    P.bolts(bolts, normal=(-1, 0, 0), r=0.0064, h=0.0052, washer=False, x_hint=(0, 0, 1))


def dome_fin(P, name, fixed, lo, hi, h, thick, material, vertical=True, sink=0.004, n=6, bev=None):
    """
    A fin (or rib) standing h out of the cover's dome: in the plane y = fixed (vertical, running along Z from lo
    to hi) or z = fixed (horizontal, running along Y). Its height tapers to its ends.
    """
    inner, outer = [], []
    for i in range(n + 1):
        u = lo + (hi - lo) * i / n
        x = COVER_X - dome_s(min(math.hypot(fixed, u), 0.112))
        f = math.sin(math.pi * i / n) ** 0.35
        inner.append((x + sink, u))
        outer.append((x - h * f - 0.0008, u))
    poly = ccw(inner + outer[::-1])
    m = Matrix.Translation((0, fixed, 0)) @ DISC_PLANE if vertical else Matrix.Translation((0, 0, fixed))
    return P.prism(name, poly, thick, material=material, matrix=m, bev=bev, segs=1, center=True, bev_angle=50.0,
                   sharp=50.0)


def dome_point(r, phi):
    """A point of the cover's dome at radius r and angle phi (deg, from +Y towards +Z) and its outward normal."""
    y, z = r * math.cos(math.radians(phi)), r * math.sin(math.radians(phi))
    ds = (dome_s(r + 0.002) - dome_s(r - 0.002)) / 0.004
    n = V((-1.0, -ds * y / max(r, 1e-6), -ds * z / max(r, 1e-6))).normalized()
    return V((COVER_X - dome_s(r), y, z)), n


def plug(P, r, phi, material='steel', size=0.0095):
    """A fill or drain plug screwed into the cover's dome."""
    p, n = dome_point(r, phi)
    P.bolts([tuple(p - n * 0.0015)], normal=tuple(n), r=size, h=0.0062, washer=True, x_hint=(0, 0, 1),
            material=material)


def ribbed_cover(P, material='trim'):
    """The pressed-steel cover with three stiffening ribs across it, its fill plug high up and the drain plug."""
    cover(P, material)
    for z in (-0.045, 0.0, 0.045):
        half = math.sqrt(max(0.0, 0.098 ** 2 - z * z))
        dome_fin(P, 'cover_rib', z, -half, half, 0.0075, 0.0095, material, vertical=False, bev=0.002)
    plug(P, 0.083, 132.0)
    plug(P, 0.092, -90.0, size=0.0085)


def diff_views(P):
    P.views = [('a', 205, 24), ('b', 35, 20)]


def build_diff_open(P):
    """An open differential: the plain cast-iron pumpkin, its black pressed-steel cover with three stiffening ribs,
    the fill plug high on it and the drain plug at the bottom, a ring of eight cover bolts, the pinion snout forward
    with its flange, short axle-tube stubs out to each side."""
    carrier(P)
    ribbed_cover(P)
    diff_views(P)


def build_diff_lsd(P):
    """A limited-slip differential: the same carrier with a cast finned cover in the part's own colour, its seven
    cooling fins machined bare (alloy), alloy plugs."""
    carrier(P)
    cover(P, 'paint')
    for y in (-0.075, -0.05, -0.025, 0.0, 0.025, 0.05, 0.075):
        half = math.sqrt(max(0.0, 0.104 ** 2 - y * y))
        dome_fin(P, 'cover_fin', y, -half, half, 0.016, 0.0065, 'alu', vertical=True)
    plug(P, 0.09, 152.0, material='alu')
    plug(P, 0.098, -90.0, material='alu', size=0.0085)
    diff_views(P)


def hull_xz(circles, n=24):
    """The outline round circles [((x, z), r), ...] in the XZ plane (their convex hull), counter-clockwise."""
    pts = sorted({(round(cx + r * math.cos(TAU * k / n), 7), round(cz + r * math.sin(TAU * k / n), 7))
                  for (cx, cz), r in circles for k in range(n)})

    def cross(o, a, b):
        return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])

    lower, upper = [], []
    for q in pts:
        while len(lower) >= 2 and cross(lower[-2], lower[-1], q) <= 0:
            lower.pop()
        lower.append(q)
    for q in reversed(pts):
        while len(upper) >= 2 and cross(upper[-2], upper[-1], q) <= 0:
            upper.pop()
        upper.append(q)
    return lower[:-1] + upper[:-1]


def band(P, name, y, outline, w, t, material='steel'):
    """A thin flat band (t thick, w wide along Y) round a closed outline [(x, z), ...] in the plane y."""
    bm = bmesh.new()
    path = [V((x, y, z)) for (x, z) in outline]
    prof = [(-t / 2, -w / 2), (t / 2, -w / 2), (t / 2, w / 2), (-t / 2, w / 2)]
    K.bm_sweep(bm, path, 1.0, profile=prof, closed=True, caps=False)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    return P.mesh(name, bm, material, sharp=50.0)


def build_diff_locked(P):
    """A locking differential: the open one's carrier and cover, plus the locker's actuator - a slim air cylinder
    lying along the top-front of the left tube, its rod (in a rubber boot) into the tube's boss, the black air hose
    from its outer end doubling back along the tube's front to a fitting by the housing, two straps round the tube,
    the cylinder and the hose - and a tag (the part's own colour, no text) wired to the fill plug. Nothing stands more
    than about 1.5 cm above the tubes: turned about y on a front axle it keeps clear of the sump above."""
    carrier(P)
    ribbed_cover(P)
    # the cylinder: its axis along Y at the top-front (45 deg) of the tube, two end caps and a band
    rc, da = 0.011, 0.052
    ax, az = da * math.cos(math.radians(45)), da * math.sin(math.radians(45))
    y0, y1 = 0.163, 0.247
    L = y1 - y0
    P.lathe('actuator', [(0.0, 0.0), (0.0125, 0.0), (0.0125, 0.006), (rc, 0.0072), (rc, L - 0.0072), (0.0125, L - 0.006),
                         (0.0125, L), (0.0, L)], loc=(ax, y0, az), material='alu', axis='Y', segs=12, sharp=40.0)
    P.cyl('act_band', rc + 0.0008, 0.004, (ax, (y0 + y1) / 2, az), 'steel', axis='Y', segs=12, bev=None)
    # its rod into the tube's boss, a rubber boot over it at the cylinder
    P.cyl('act_rod', 0.0034, y0 - 0.122, (ax, (y0 + 0.122) / 2, az), 'chrome', axis='Y', segs=8, bev=None)
    P.lathe('act_boot', [(0.0085, 0.0), (0.0075, 0.005), (0.005, 0.011), (0.0042, 0.016), (0.0, 0.016)],
            loc=(ax, y0, az), material='rubber', axis='-Y', segs=10, close='start', sharp=50.0)
    # the air port on the outer cap, the hose back along the tube's front, its fitting by the housing
    P.bolts([(ax, y1, az)], normal=(0, 1, 0), r=0.0062, h=0.006, washer=False, x_hint=(1, 0, 0))
    rh = 0.0032
    hr, ha = 0.038 + rh + 0.0004, math.radians(14)
    hx, hz = hr * math.cos(ha), hr * math.sin(ha)
    hose = [(ax, y1 + 0.006, az), (ax, y1 + 0.016, az), (hx + 0.004, y1 + 0.016, hz + 0.008), (hx, y1 + 0.004, hz),
            (hx, 0.17, hz), (hx + 0.012, 0.152, hz - 0.004), (hx + 0.032, 0.148, hz - 0.006)]
    P.tube('air_hose', hose, rh, 'trim', segs=6, bend=0.008)
    P.cyl('hose_fitting', 0.0048, 0.012, (hx + 0.037, 0.148, hz - 0.006), 'alu', axis='X', segs=6, bev=None)
    # two straps round the tube, the cylinder and the hose
    outline = hull_xz([((0.0, 0.0), 0.0395), ((ax, az), rc + 0.0012), ((hx, hz), rh + 0.0008)])
    for ys in (0.188, 0.226):
        band(P, 'strap', ys, outline, 0.007, 0.0016)
    # the tag on a wire from the fill plug
    p, nrm = dome_point(0.083, 132.0)
    w0 = p + nrm * 0.008
    wire = [tuple(w0), tuple(w0 + V((-0.006, -0.004, -0.012))), tuple(w0 + V((-0.007, -0.003, -0.024)))]
    P.tube('tag_wire', wire, 0.0009, 'steel', segs=4, bend=0.004)
    tp = w0 + V((-0.007, -0.003, -0.024 - 0.021))
    P.box('tag', (0.0016, 0.03, 0.042), tuple(tp), 'paint', bev=0.0006, segs=1, rot=(8, 0, 0))
    P.cyl('tag_eyelet', 0.0035, 0.0022, tuple(tp + V((0, 0, 0.016))), 'steel', axis='X', segs=8, bev=None)
    diff_views(P)


PARTS = {
    'susp_stock': build_susp_stock,
    'susp_soft': build_susp_soft,
    'susp_sport': build_susp_sport,
    'susp_lift': build_susp_lift,
    'susp_leaf': build_susp_leaf,
    'brakes_drum': build_brakes_drum,
    'brakes_disc': build_brakes_disc,
    'brakes_vented': build_brakes_vented,
    'brakes_sport': build_brakes_sport,
    'brakes_moto': build_brakes_moto,
    'diff_open': build_diff_open,
    'diff_lsd': build_diff_lsd,
    'diff_locked': build_diff_locked,
}


def main(args):
    # (this group's previews go to its own scratch folder)
    was = K.SCRATCH
    K.SCRATCH = SCRATCH
    try:
        K.run(PARTS, args)
    finally:
        K.SCRATCH = was
