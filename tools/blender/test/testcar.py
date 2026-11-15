"""
Test car for the car shaders (docs/MODCAR.md §6, specs/art/CAR_LOOK.md): a small two-door coupé with
smooth panels, V-groove panel lines, wheel arches, chrome bumpers and trim, inset glass with seals,
lamps with reflector cups under their lenses, an interior with seats, dash and gauges — and EVERY
conventional material name at least once, so every shader can be judged on one model.

    blender -b --factory-startup --python tools/blender/build.py -- test/testcar [out.glb] [preview.png]

Writes public/models/modcar/test/testcar.glb (default). Not a game frame: no mounts table, no panels
that open; the real frames are modelled in tools/blender/frames/.

Body = two parametric surfaces: the tub (a superellipse section lofted along the car, its ends
closed like a superellipsoid's) and the greenhouse (superellipse plans stacked up to the roof, raked
front and back) rising out of it. Panel lines, window edges and seals are grid lines of these
surfaces, so they come out exact.
"""
import math
import os
import sys

import bmesh
import bpy
from mathutils import Matrix, Vector

from lib import modcar as mc
from test import carkit as ck

# ------------------------------------------------------------------------------------------- size
L = 1.95  # half length
WX = 1.18  # wheel x (± from the middle of the wheelbase)
WY = 0.70  # wheel y (half track)
WR = 0.285  # tyre radius
WW = 0.165  # tyre width
RIM_R = 0.165  # 13 inch rim

# ------------------------------------------------------------------------------------------- tub
M_END = 9.0  # roundness of the nose and tail (superellipse exponent along the car)
N_UP = 6.0  # section above the widest line: a shoulder, then the deck
N_LO = 6.0  # below: boxy
B = ck.curve([(-1.95, 0.775), (-1.5, 0.81), (-0.5, 0.83), (0.5, 0.83), (1.5, 0.81), (1.95, 0.77)])
ZB = ck.curve([(-1.95, 0.35), (-1.55, 0.28), (-1.15, 0.255), (1.15, 0.255), (1.55, 0.28), (1.95, 0.33)])
ZE = ck.curve([(-1.95, 0.60), (0.0, 0.58), (1.95, 0.555)])
ZT = ck.curve([(-1.95, 0.855), (-1.62, 0.905), (-1.3, 0.905), (0.55, 0.9), (1.25, 0.835), (1.95, 0.765)])


def tub_xs(a):
    """along-car parameter a ∈ [−π/2, π/2] → (x, section scale); the ends close to a point exactly"""
    c = math.cos(a)
    return L * ck.spow(math.sin(a), 2.0 / M_END), 0.0 if c < 1e-9 else c ** (2.0 / M_END)


def tub_section(x, b):
    """section at x, angle b (0 = left side at its widest, π/2 = top, π = right, 3π/2 = bottom) → (y, z)"""
    sb, cb = math.sin(b), math.cos(b)
    ze = ZE(x)
    if sb >= 0:
        return B(x) * ck.spow(cb, 2.0 / N_UP), ze + (ZT(x) - ze) * ck.spow(sb, 2.0 / N_UP)
    return B(x) * ck.spow(cb, 2.0 / N_LO), ze + (ze - ZB(x)) * ck.spow(sb, 2.0 / N_LO)


def tub(a, b):
    x, s = tub_xs(a)
    y, z = tub_section(x, b)
    ze = ZE(x)
    return (x, y * s, ze + (z - ze) * s)


def a_of_x(x):
    return math.asin(ck.spow(x / L, M_END / 2.0))


def b_of_y_up(y, x=0.0, left=True):
    """the upper-half angle where the section at x has half-width y"""
    c = (min(1.0, abs(y) / B(x))) ** (N_UP / 2.0)
    b = math.acos(c)
    return b if left else math.pi - b


def b_of_z_lo(z, x=0.0, left=True):
    """the lower-half angle where the section at x is at height z"""
    ze = ZE(x)
    s = min(1.0, max(0.0, (ze - z) / (ze - ZB(x)))) ** (N_LO / 2.0)
    b = math.asin(s)
    return 2 * math.pi - b if left else math.pi + b


def arc_samples(fn, lo, hi, n, fine=600):
    """n + 1 values of t in [lo, hi] evenly spaced along the curve fn(t) → point (by arc length)"""
    ts = [lo + (hi - lo) * i / fine for i in range(fine + 1)]
    pts = [Vector(fn(t)) for t in ts]
    acc = [0.0]
    for i in range(1, len(pts)):
        acc.append(acc[-1] + (pts[i] - pts[i - 1]).length)
    out = []
    j = 0
    for k in range(n + 1):
        target = acc[-1] * k / n
        while j < fine and acc[j + 1] < target:
            j += 1
        seg = acc[j + 1] - acc[j] if j < fine else 1.0
        f = (target - acc[j]) / seg if seg > 1e-12 else 0.0
        out.append(ts[j] + (ts[min(j + 1, fine)] - ts[j]) * min(1.0, max(0.0, f)))
    out[0], out[-1] = lo, hi
    return out


# ------------------------------------------------------------------------------------------- greenhouse
GZ0 = 0.80  # its foot, inside the tub
GH = 1.36 - GZ0  # up to the roof
M_PLAN = 4.5  # plan corners (the pillars)
M_ROOF = 5.0  # roof edge


def g_frame(t):
    """at height fraction t: (centre x, half length, half width) of the plan"""
    xf = 0.721 - 0.867 * t  # windscreen rake
    xr = -1.497 + 0.648 * t  # rear window rake
    return (xf + xr) / 2, (xf - xr) / 2, 0.76 - 0.13 * t


def g_tz(gm):
    """γ ∈ [0, π/2] → (height fraction t, plan scale); the roof closes to a point exactly"""
    c = math.cos(gm)
    return ck.spow(math.sin(gm), 2.0 / M_ROOF), 0.0 if c < 1e-9 else c ** (2.0 / M_ROOF)


def greenhouse(th, gm):
    t, s = g_tz(gm)
    xc, A, Bw = g_frame(t)
    return (xc + A * s * ck.spow(math.cos(th), 2.0 / M_PLAN), Bw * s * ck.spow(math.sin(th), 2.0 / M_PLAN), GZ0 + GH * t)


def gm_of_t(t):
    return math.asin(min(1.0, t) ** (M_ROOF / 2.0))


TH0 = math.radians(39.0)  # the periodic θ range starts in the left A-pillar


def wrap_th(th):
    return TH0 + (th - TH0) % (2 * math.pi)


def in_greenhouse_plan(x, y, z, margin):
    """inside the greenhouse's plan at height z (minus a margin)? (where the tub is cut open)"""
    t = max(0.0, (z - GZ0) / GH)
    xc, A, Bw = g_frame(t)
    A -= margin
    Bw -= margin
    if A <= 0 or Bw <= 0:
        return False
    return abs((x - xc) / A) ** M_PLAN + abs(y / Bw) ** M_PLAN < 1.0


# windows: (θ0, θ1, t0, t1) of the glass, θ in degrees round the plan (0 = front, 90 = left)
WINDOWS = {
    'windscreen': (-33.0, 33.0, 0.22, 0.86, 'glass'),
    'side_L': (46.0, 139.0, 0.19, 0.84, 'glass'),
    'side_R': (221.0, 314.0, 0.19, 0.84, 'glass'),
    'rear': (157.0, 203.0, 0.22, 0.85, 'glass_dark'),
}
SEAL = 0.013  # rubber seal round the glass (m)


def main(args):
    out = args[0] if args else 'public/models/modcar/test/testcar.glb'
    prev = args[1] if len(args) > 1 else 'D:/modcar-scratch/shader/testcar.png'
    mc.reset_scene()
    col_body = mc.collection('BODY')
    col_int = mc.collection('INTERIOR')
    col_glass = mc.collection('GLASS')
    col_wheels = mc.collection('WHEELS')

    body = build_tub(col_body)
    house, glass = build_greenhouse(col_body, col_glass)
    details = build_details(col_body, body)
    interior = build_interior(col_int)
    wheels = build_wheels(col_wheels)

    shell = ck.join('BODY', [body, house] + details)
    mc.smooth(shell, angle_deg=40.0)
    inner = ck.join('INTERIOR', interior)
    mc.smooth(inner, angle_deg=40.0)
    glass_obj = ck.join('GLASS', glass)
    mc.smooth(glass_obj, angle_deg=60.0, weighted=False)

    # lamp mounts (the viewer takes the head lamp beam from M_headlight_L)
    mc.empty('M_headlight_L', loc=(1.93, 0.565, 0.565))
    mc.empty('M_headlight_R', loc=(1.93, -0.565, 0.565))
    mc.empty('M_taillight_L', loc=(-1.93, 0.52, 0.68))
    mc.empty('M_taillight_R', loc=(-1.93, -0.52, 0.68))

    # AO: the wheels on their own (they turn: no arch may darken one side of a tyre), then the rest with them
    meshes = [shell, inner, glass_obj]
    for o in meshes:
        o.hide_render = True
    mc.bake_ao(wheels, samples=24, distance=0.2)
    for o in meshes:
        o.hide_render = False
    mc.bake_ao(meshes, samples=32, distance=0.35)

    allm = meshes + wheels
    print('TRIS', mc.triangles(allm), {o.name: mc.triangles([o]) for o in allm})
    used = sorted({m.name for o in allm for m in o.data.materials if m})
    print('MATERIALS', len(used), used)
    missing = sorted(set(mc.MAT_NAMES) - set(used))
    if missing:
        print('MISSING MATERIALS', missing)
    empties = [o for o in bpy.data.objects if o.type == 'EMPTY']
    mc.export_glb(out, allm + empties)
    print('WROTE', out, os.path.getsize(out))
    if prev:
        mc.preview(prev, target=(0, 0, 0.6), dist=7.0, yaw_deg=35.0, pitch_deg=10.0)
        mc.preview(prev.replace('.png', '_rear.png'), target=(0, 0, 0.6), dist=7.0, yaw_deg=215.0, pitch_deg=14.0)


# ------------------------------------------------------------------------------------------- the tub
def build_tub(coll):
    # along the car: even steps in x through the middle, by arc length round the nose and tail
    a_mid = a_of_x(1.72)
    xs = ck.samples(-1.72, 1.72, 54, breaks=[0.50, -0.70, 0.64, -1.43], gap=0.006)
    us = [a_of_x(x) for x in xs]

    def nose(a):
        x, s = tub_xs(a)
        return (x, s * 0.45)

    tail = arc_samples(nose, a_mid, math.pi / 2, 14)
    us = [-a for a in reversed(tail)] + [u for u in us if abs(u) < a_mid - 1e-6] + tail
    us = sorted(set(round(u, 9) for u in us))

    # round the section: by arc length on the middle section, plus the feature lines
    b_hood = b_of_y_up(0.645, 1.2)
    b_rock = b_of_z_lo(0.345)
    feats = [b_hood, math.pi - b_hood, b_rock, b_of_z_lo(0.345, left=False)]
    ref = arc_samples(lambda b: (0.0,) + tub_section(0.0, b), 0.0, 2 * math.pi, 76)[:-1]
    gap_b = 0.006 / 0.83  # roughly radians per metre on the shoulder
    vs = set(round(v, 9) for v in ref)
    for f in feats:
        for d in (-gap_b / 2, 0.0, gap_b / 2):
            vs.add(round(f + d, 9))
    vs = sorted(v for v in vs)
    # drop samples crowding a feature line
    must = set(round(f + d, 9) for f in feats for d in (-gap_b / 2, 0.0, gap_b / 2))
    vs = [v for v in vs if v in must or all(abs(v - m) > 0.012 for m in must)]

    a_door0, a_door1 = a_of_x(-0.70), a_of_x(0.50)
    a_hood, a_trunk = a_of_x(0.64), a_of_x(-1.43)

    def near(v, target, tol=1e-6):
        return abs(v - target) < tol

    def groove(u, v):
        """V-groove depth at a grid point on a panel line (negative = into the body)"""
        x, s = tub_xs(u)
        y, z = tub_section(x, v)
        z = ZE(x) + (z - ZE(x)) * s
        y *= s
        d = -0.0075
        # door shut lines: up the side, from the rocker to the shoulder
        if (near(u, a_door0) or near(u, a_door1)) and 0.36 < z < 0.84 and abs(y) > 0.6:
            return d
        # bottom of the door
        if (near(v, b_rock) or near(v, feats[3])) and -0.70 <= x <= 0.50:
            return d
        # hood: across at the cowl, and along both sides to the nose
        if near(u, a_hood) and z > 0.84 and abs(y) < 0.645:
            return d
        if (near(v, b_hood) or near(v, math.pi - b_hood)) and x >= 0.64 and s > 0.6:
            return d
        # boot lid: across behind the rear window, and along both sides to the tail
        if near(u, a_trunk) and z > 0.84 and abs(y) < 0.645:
            return d
        if (near(v, b_hood) or near(v, math.pi - b_hood)) and x <= -1.43 and s > 0.6:
            return d
        return 0.0

    def mat_of(u, v):
        x, s = tub_xs(u)
        y, z = tub_section(x, v)
        z = ZE(x) + (z - ZE(x)) * s
        # the rocker under the doors and the valances under the bumpers are black
        if z < 0.335:
            return 'trim'
        return 'paint'

    def keep(u, v):
        x, s = tub_xs(u)
        y, z = tub_section(x, v)
        y *= s
        z = ZE(x) + (z - ZE(x)) * s
        # open where the greenhouse covers it
        return not (z > GZ0 - 0.02 and in_greenhouse_plan(x, y, z, 0.022))

    obj = ck.grid('TUB', tub, us, vs, period=2 * math.pi, mat_of=mat_of, keep=keep, flip=True, offset=groove, coll=coll)
    # sheet metal: an inner skin for the cabin (seen through the windows)
    sol = obj.modifiers.new('skin', 'SOLIDIFY')
    sol.thickness = 0.012
    sol.offset = -1.0
    sol.use_rim = True
    n_out = len(obj.data.materials)
    for _ in range(n_out):
        obj.data.materials.append(mc.mat('plastic_int'))
    sol.material_offset = n_out
    sol.material_offset_rim = n_out
    mc.apply_modifiers(obj)
    # wheel arches: pockets cut into the sides, their walls black
    for x in (WX, -WX):
        for side in (1, -1):
            bm = bmesh.new()
            bmesh.ops.create_cone(bm, cap_ends=True, segments=48, radius1=0.352, radius2=0.352, depth=0.62)
            cut = mc.mesh_object('cut', bm, 'trim', coll)
            cut.rotation_euler = (math.pi / 2, 0, 0)
            cut.location = (x, side * 0.98, WR + 0.012)
            m = obj.modifiers.new('arch', 'BOOLEAN')
            m.operation = 'DIFFERENCE'
            m.solver = 'EXACT'
            m.object = cut
            m.material_mode = 'TRANSFER'
            m.use_self = True
            m.use_hole_tolerant = True
            mc.apply_modifiers(obj)
            bpy.data.objects.remove(cut)
    ck.dedupe_slots(obj)
    return obj


# ------------------------------------------------------------------------------------------- greenhouse
def gh_point(gm, th):
    return greenhouse(th, gm)


def gh_speed(gm, th):
    """metres per radian along θ and along γ at a point of the greenhouse"""
    e = 1e-4
    dth = (Vector(greenhouse(th + e, gm)) - Vector(greenhouse(th - e, gm))).length / (2 * e)
    dgm = (Vector(greenhouse(th, gm + e)) - Vector(greenhouse(th, gm - e))).length / (2 * e)
    return dth, dgm


def window_boxes():
    """each window as a box in (θ, γ) with the widths of its seal, θ wrapped into [TH0, TH0 + 2π)"""
    out = {}
    for k, (a0, a1, t0, t1, mat) in WINDOWS.items():
        th0 = wrap_th(math.radians(a0))
        th1 = th0 + math.radians(a1 - a0)
        g0, g1 = gm_of_t(t0), gm_of_t(t1)
        dth, dgm = gh_speed((g0 + g1) / 2, (th0 + th1) / 2)
        out[k] = dict(th0=th0, th1=th1, g0=g0, g1=g1, wth=SEAL / dth, wg=SEAL / dgm, mat=mat)
    return out


def build_greenhouse(coll, coll_glass):
    boxes = window_boxes()
    must_th = set()
    must_gm = set()
    for w in boxes.values():
        for b, d in ((w['th0'], -w['wth']), (w['th1'], w['wth'])):
            must_th.add(round(b, 9))
            must_th.add(round(wrap_th(b + d), 9))
        for b, d in ((w['g0'], -w['wg']), (w['g1'], w['wg'])):
            must_gm.add(round(b, 9))
            must_gm.add(round(b + d, 9))
    th_even = arc_samples(lambda th: greenhouse(th, gm_of_t(0.5)), TH0, TH0 + 2 * math.pi, 84)[:-1]
    ths = set(round(wrap_th(t), 9) for t in th_even) | must_th
    ths = sorted(t for t in ths if t in must_th or all(abs(t - m) > 0.012 for m in must_th))
    gm_even = arc_samples(lambda gm: (0.0, g_tz(gm)[1] * 0.7, g_tz(gm)[0] * GH), 0.0, math.pi / 2, 24)
    gms = set(round(g, 9) for g in gm_even) | must_gm
    gms = sorted(g for g in gms if g in must_gm or all(abs(g - m) > 0.01 for m in must_gm))

    def where(gm, th, eps=0.0):
        """(window, inside its glass, inside glass and seal)"""
        th = wrap_th(th)
        for k, w in boxes.items():
            inside = w['th0'] - eps <= th <= w['th1'] + eps and w['g0'] - eps <= gm <= w['g1'] + eps
            ring = w['th0'] - w['wth'] - eps <= th <= w['th1'] + w['wth'] + eps and w['g0'] - w['wg'] - eps <= gm <= w['g1'] + w['wg'] + eps
            if ring:
                return k, inside, ring
        return None, False, False

    def mat_of(gm, th):
        k, inside, ring = where(gm, th)
        if ring:
            return 'trim'
        t, _ = g_tz(gm)
        # a contrasting roof above the windows
        return 'paint_b' if t > 0.875 else 'paint'

    def keep(gm, th):
        return not where(gm, th)[1]

    def offset(gm, th):
        # the seal leans in to the glass: points on and inside the glass edge are set back
        return -0.009 if where(gm, th, eps=1e-7)[1] else 0.0

    house = ck.grid('HOUSE', gh_point, gms, ths, period=2 * math.pi, mat_of=mat_of, keep=keep, offset=offset, flip=True, coll=coll)
    sol = house.modifiers.new('skin', 'SOLIDIFY')
    sol.thickness = 0.012
    sol.offset = -1.0
    n_out = len(house.data.materials)
    for _ in range(n_out):
        house.data.materials.append(mc.mat('fabric'))
    sol.material_offset = n_out
    sol.material_offset_rim = n_out
    mc.apply_modifiers(house)
    ck.dedupe_slots(house)

    # the glass: each window's patch reaching half way under its seal, set in behind it
    glass = []
    for k, w in boxes.items():
        g0, g1 = w['g0'] - w['wg'] * 0.5, w['g1'] + w['wg'] * 0.5
        th0, th1 = w['th0'] - w['wth'] * 0.5, w['th1'] + w['wth'] * 0.5
        gs = [g0 + (g1 - g0) * i / 14 for i in range(15)]
        tt = [th0 + (th1 - th0) * i / 30 for i in range(31)]
        o = ck.grid('glass_' + k, gh_point, gs, tt, mat_of=lambda g, t, m=w['mat']: m, offset=lambda g, t: -0.0115, flip=True, coll=coll_glass)
        glass.append(o)
    return house, glass


# ------------------------------------------------------------------------------------------- details
def hit(obj, origin, direction):
    """where a ray from origin along direction meets obj (world space; obj has no transform)"""
    ok, loc, nrm, _ = obj.ray_cast(Vector(origin), Vector(direction).normalized())
    if not ok:
        raise RuntimeError(f'ray from {origin} along {direction} missed {obj.name}')
    return loc, nrm


def place(obj, loc, normal=None, along='Y'):
    """move obj (built round its origin, its `along` axis = the axis that should face `normal`) onto loc"""
    if normal is not None:
        n = Vector(normal).normalized()
        src = Vector((0, 1, 0)) if along == 'Y' else Vector((1, 0, 0)) if along == 'X' else Vector((0, 0, 1))
        obj.rotation_mode = 'QUATERNION'
        obj.rotation_quaternion = src.rotation_difference(n)
    obj.location = loc
    ck.apply_transform(obj)
    return obj


def flip_y(obj):
    """mirror an object's mesh to the other side of the car (in place, faces kept the right way out)"""
    obj.data.transform(Matrix.Scale(-1, 4, Vector((0, 1, 0))))
    obj.data.flip_normals()
    return obj


def bumper(name, x_front, sign, z, coll):
    """a chrome bar across the end of the car that wraps round its corners, with a rubber strip"""
    path = []
    n = 40
    for i in range(n + 1):
        y = -0.80 + 1.60 * i / n
        k = abs(y) / 0.80
        x = x_front - sign * 0.30 * k ** 5
        path.append((x, y, z + 0.012 * (1 - k * k)))
    bar = ck.sweep(name, ck.rrect_profile(0.075, 0.105, 0.03, 4), path, mat='chrome', coll=coll, up=(0, 0, 1))
    strip_path = [(p[0] + sign * 0.036 * (1 - (abs(p[1]) / 0.8) ** 4), p[1], p[2] + 0.004) for p in path[3:-3]]
    strip = ck.sweep(name + '_strip', ck.rrect_profile(0.012, 0.03, 0.005, 2), strip_path, mat='rubber', coll=coll, up=(0, 0, 1))
    return [bar, strip]


def round_lamp(name, centre, normal, r, coll, lens='lens_head'):
    """a chrome bezel and reflector cup with a bulb, under a domed lens (UV centre = lamp centre)"""
    prof = [(r * 0.92 * i / 9, -0.05 + 0.05 * (i / 9) ** 2) for i in reversed(range(10))]
    cup = ck.lathe(name + '_cup', prof, segments=40, mat='chrome', coll=coll)
    bulb = ck.lathe(name + '_bulb', [(0.0, -0.012), (0.012, -0.01), (0.015, 0.0), (0.012, 0.01), (0.0, 0.014)], segments=16, mat='chrome', coll=coll)
    bezel = ck.lathe(name + '_bezel', [(r * 0.94, -0.03), (r * 1.13, -0.03), (r * 1.13, -0.004), (r * 1.06, 0.004), (r * 0.94, 0.006)], segments=40, mat='chrome', closed=True, coll=coll)
    lprof = [(r * 0.98 * (1 - i / 8), 0.004 + 0.016 * math.sqrt(max(0.0, 1 - (1 - i / 8) ** 2))) for i in range(9)]
    lens_obj = ck.lathe(name + '_lens', lprof, segments=40, mat=lens, uv_radial=True, coll=coll)
    parts = [cup, bulb, bezel, lens_obj]
    for o in parts:
        place(o, centre, normal)
    return parts


def rect_lamp(name, centre, normal, w, h, coll, segs):
    """a lamp unit: black housing, a chrome reflector, lens segments [(material, share of the width)]"""
    housing = ck.rbox(name + '_housing', (0, -0.012, 0), (w + 0.02, 0.03, h + 0.02), radius=0.008, mat='trim', coll=coll)
    refl = ck.rbox(name + '_refl', (0, -0.004, 0), (w - 0.01, 0.006, h - 0.01), radius=0.002, mat='chrome', coll=coll)
    parts = [housing, refl]
    x0 = -w / 2
    for k, (mat, share) in enumerate(segs):
        ww = w * share
        bm = bmesh.new()
        bmesh.ops.create_cube(bm, size=1.0, calc_uvs=True)
        for v in bm.verts:
            v.co.x *= ww - 0.004
            v.co.y *= 0.016
            v.co.z *= h - 0.006
        o = mc.mesh_object(f'{name}_lens{k}', bm, mat, coll)
        mc.bevel(o, width=0.004, segments=2, angle_deg=30.0, harden=False)
        mc.apply_modifiers(o)
        o.location = (x0 + ww / 2, 0.006, 0)
        ck.apply_transform(o)
        parts.append(o)
        x0 += ww
    for o in parts:
        place(o, centre, normal)
    return parts


def build_details(coll, tub):
    parts = []
    # bumpers and overriders
    parts += bumper('bumper_F', 1.995, 1, 0.37, coll)
    parts += bumper('bumper_R', -1.985, -1, 0.38, coll)
    for y in (0.36, -0.36):
        parts.append(ck.rbox(f'overrider_{y:+.2f}', (2.03, y, 0.38), (0.05, 0.05, 0.16), radius=0.016, mat='rubber', coll=coll))
    # grille: a black panel with chrome slats and a chrome surround, set into the nose
    loc, _ = hit(tub, (3.0, 0.0, 0.56), (-1, 0, 0))
    gx = loc.x
    parts.append(ck.rbox('grille', (gx - 0.004, 0, 0.555), (0.03, 0.66, 0.17), radius=0.01, mat='trim', coll=coll))
    for i in range(5):
        parts.append(ck.rbox(f'slat{i}', (gx + 0.012, 0, 0.49 + i * 0.033), (0.012, 0.62, 0.008), radius=0.003, segments=2, mat='chrome', coll=coll))
    ring = []
    for i in range(48):
        a = 2 * math.pi * i / 48
        ring.append((gx + 0.016, 0.345 * ck.spow(math.cos(a), 0.25), 0.555 + 0.098 * ck.spow(math.sin(a), 0.25)))
    parts.append(ck.sweep('grille_surround', ck.circle_profile(0.008, 8), ring + [ring[0]], mat='chrome', coll=coll))
    for side in (1, -1):
        # head lamp, indicator below it, side repeater on the wing
        loc, nrm = hit(tub, (3.0, side * 0.565, 0.565), (-1, 0, 0))
        nrm = (nrm + Vector((1.2, 0, 0))).normalized()
        parts += round_lamp(f'head{side:+d}', loc + nrm * 0.006, nrm, 0.084, coll)
        loc, nrm = hit(tub, (3.0, side * 0.62, 0.43), (-1, 0, 0))
        nrm = (nrm + Vector((1.0, 0, 0))).normalized()
        parts += rect_lamp(f'ind{side:+d}', loc + nrm * 0.004, nrm, 0.12, 0.045, coll, [('lens_amber', 1.0)])
        loc, nrm = hit(tub, (1.45, side * 2.0, 0.66), (0, -side, 0))
        rep = ck.rbox(f'rep{side:+d}', (0, 0, 0), (0.05, 0.012, 0.022), radius=0.005, mat='lens_amber', coll=coll)
        parts.append(place(rep, loc + nrm * 0.003, nrm))
        # tail lamps: reversing white inside, tail / brake red, indicator amber outside
        loc, nrm = hit(tub, (-3.0, side * 0.53, 0.69), (1, 0, 0))
        nrm = (nrm + Vector((-1.0, 0, 0))).normalized()
        segs = [('lens_head', 0.2), ('lens_tail', 0.55), ('lens_amber', 0.25)]
        if side < 0:
            segs.reverse()
        parts += rect_lamp(f'tail{side:+d}', loc + nrm * 0.004, nrm, 0.30, 0.11, coll, segs)
        # door handle
        loc, nrm = hit(tub, (-0.52, side * 2.0, 0.795), (0, -side, 0))
        h = ck.rbox(f'handle{side:+d}', (0, 0.008, 0), (0.15, 0.02, 0.026), radius=0.009, mat='chrome', coll=coll)
        parts.append(place(h, loc, nrm))
        # mirror on a black stalk at the front of the door (built for the left, flipped for the right)
        loc, _ = hit(tub, (0.40, side * 2.0, 0.80), (0, -side, 0))
        loc.y = abs(loc.y)
        stalk = ck.rbox(f'mstalk{side:+d}', (0, 0.05, 0.04), (0.04, 0.1, 0.03), radius=0.01, mat='trim', coll=coll)
        housing = ck.rbox(f'mhouse{side:+d}', (-0.01, 0.13, 0.08), (0.08, 0.14, 0.085), radius=0.035, segments=4, mat='paint', coll=coll)
        face = ck.rbox(f'mface{side:+d}', (-0.052, 0.13, 0.08), (0.006, 0.12, 0.068), radius=0.004, segments=2, mat='chrome', coll=coll)
        for o in (stalk, housing, face):
            o.location = loc
            ck.apply_transform(o)
            if side < 0:
                flip_y(o)
            parts.append(o)
        # wheel well liners: black, so no one sees into the body through the arches
        for x in (WX, -WX):
            liner = ck.lathe(f'liner{side:+d}{x:+.1f}', [(0.0, 0.6), (0.343, 0.6), (0.343, 0.84)], segments=40, mat='trim', coll=coll, arc=(math.radians(-25), math.radians(205)))
            liner.location = (x, 0, WR + 0.012)
            ck.apply_transform(liner)
            # the lathe's faces look out from the axis: the well is seen from the inside
            liner.data.flip_normals()
            if side < 0:
                flip_y(liner)
            parts.append(liner)
    # wipers lying along the foot of the windscreen
    for y in (0.30, -0.18):
        w = ck.rbox(f'wiper{y:+.2f}', (0, 0, 0), (0.022, 0.46, 0.012), radius=0.004, segments=2, mat='trim', coll=coll)
        w.rotation_euler = (0, -0.85, 0.12)
        w.location = (0.545, y + 0.05, 0.935)
        ck.apply_transform(w)
        parts.append(w)
    # exhaust: a steel pipe, a rusty silencer, a chrome tip
    pipe = [(-0.6, 0.38, 0.17), (-1.2, 0.40, 0.16), (-1.75, 0.42, 0.17), (-2.02, 0.43, 0.2)]
    fine = []
    for i in range(len(pipe) - 1):
        for k in range(6):
            t = k / 6
            fine.append(tuple(pipe[i][j] + (pipe[i + 1][j] - pipe[i][j]) * t for j in range(3)))
    fine.append(pipe[-1])
    parts.append(ck.sweep('exhaust', ck.circle_profile(0.024, 12), fine, mat='steel', coll=coll))
    parts.append(ck.rbox('silencer', (-1.45, 0.41, 0.17), (0.42, 0.16, 0.11), radius=0.045, segments=4, mat='rust', coll=coll))
    tip = ck.lathe('exhaust_tip', [(0.026, -0.06), (0.03, 0.0), (0.033, 0.03), (0.028, 0.03), (0.024, -0.06)], segments=16, mat='chrome', closed=True, coll=coll)
    tip.rotation_euler = (0, 0, math.pi / 2)
    tip.location = (-2.0, 0.43, 0.2)
    ck.apply_transform(tip)
    parts.append(tip)
    # number plates (aluminium on a black backing), a chrome badge and a fuel cap
    for sign in (1, -1):
        if sign > 0:
            loc, nrm = Vector((2.035, 0, 0.30)), Vector((1, 0, 0))
        else:
            loc, nrm = hit(tub, (-3.0, 0.0, 0.54), (1, 0, 0))
        back = ck.rbox(f'plate_back{sign:+d}', (0, 0.004, 0), (0.36, 0.012, 0.12), radius=0.006, mat='trim', coll=coll)
        plate = ck.rbox(f'plate{sign:+d}', (0, 0.012, 0), (0.34, 0.006, 0.105), radius=0.004, segments=2, mat='alu', coll=coll)
        for o in (back, plate):
            place(o, loc, nrm)
            parts.append(o)
    loc, nrm = hit(tub, (2.6, 0.0, 0.95), (-1, 0, -0.32))
    parts.append(place(ck.lathe('badge', [(0.036, 0.0), (0.03, 0.006), (0.0, 0.008)], segments=24, mat='chrome', coll=coll), loc, nrm))
    loc, nrm = hit(tub, (-1.62, 2.0, 0.76), (0, -1, 0))
    parts.append(place(ck.lathe('fuel_cap', [(0.046, 0.0), (0.04, 0.005), (0.0, 0.006)], segments=24, mat='chrome', coll=coll), loc, nrm))
    # roof rack with a toilet strapped to it (ceramic, and a few rusty bolts)
    for x in (-0.56, -0.98):
        parts.append(ck.sweep(f'rack_bar{x:+.2f}', ck.rrect_profile(0.025, 0.045, 0.008, 2), [(x, -0.62, 1.41), (x, 0.62, 1.41)], mat='alu', coll=coll, up=(0, 0, 1)))
        for y in (0.56, -0.56):
            parts.append(ck.rbox(f'rack_foot{x:+.2f}{y:+.2f}', (x, y, 1.375), (0.06, 0.045, 0.06), radius=0.012, mat='trim', coll=coll))
            parts.append(ck.rbox(f'rack_bolt{x:+.2f}{y:+.2f}', (x, y * 0.9, 1.437), (0.018, 0.018, 0.012), radius=0.003, segments=1, mat='rust', coll=coll))
    parts += toilet(coll, (-0.78, 0.0, 1.425))
    return parts


def toilet(coll, at):
    """a ceramic toilet (bowl, cistern) with a plastic seat, strapped to the rack"""
    x0, y0, z0 = at
    prof = [(0.06, 0.0), (0.095, 0.02), (0.11, 0.12), (0.15, 0.25), (0.175, 0.31), (0.16, 0.335), (0.13, 0.32), (0.10, 0.2), (0.0, 0.16)]
    bowl = ck.lathe('toilet_bowl', prof, segments=36, mat='ceramic', coll=coll, axis='Z')
    bowl.scale = (1.25, 1.0, 1.0)
    bowl.location = (x0 + 0.04, y0, z0)
    ck.apply_transform(bowl)
    seat = ck.lathe('toilet_seat', [(0.16, 0.0), (0.185, 0.004), (0.19, 0.016), (0.165, 0.02), (0.12, 0.016), (0.115, 0.004)], segments=36, mat='plastic_int', closed=True, coll=coll, axis='Z')
    seat.scale = (1.25, 1.0, 1.0)
    seat.location = (x0 + 0.04, y0, z0 + 0.335)
    ck.apply_transform(seat)
    tank = ck.rbox('toilet_tank', (x0 - 0.2, y0, z0 + 0.45), (0.17, 0.4, 0.3), radius=0.04, segments=4, mat='ceramic', coll=coll)
    lid = ck.rbox('toilet_lid', (x0 - 0.2, y0, z0 + 0.61), (0.19, 0.42, 0.03), radius=0.012, mat='ceramic', coll=coll)
    flush = ck.rbox('toilet_flush', (x0 - 0.2, y0 + 0.12, z0 + 0.63), (0.04, 0.05, 0.012), radius=0.004, segments=2, mat='chrome', coll=coll)
    strap = ck.sweep('toilet_strap', ck.rrect_profile(0.004, 0.035, 0.0015, 1), [(x0 + 0.04, -0.62, 1.42), (x0 + 0.04, -0.2, 1.62), (x0 + 0.04, 0.2, 1.62), (x0 + 0.04, 0.62, 1.42)], mat='fabric', coll=coll)
    return [bowl, seat, tank, lid, flush, strap]


# ------------------------------------------------------------------------------------------- interior
def build_interior(coll):
    parts = []
    parts.append(ck.rbox('carpet', (-0.3, 0, 0.29), (1.9, 1.4, 0.03), radius=0.01, mat='fabric', coll=coll))
    parts.append(ck.rbox('shelf', (-1.22, 0, 0.9), (0.36, 1.36, 0.02), radius=0.006, mat='fabric', coll=coll))
    # dash: the moulding, a wood strip, the gauge hood with two dials, three lamps
    parts.append(ck.rbox('dash', (0.42, 0, 0.79), (0.34, 1.44, 0.22), radius=0.05, segments=4, mat='plastic_int', coll=coll))
    parts.append(ck.rbox('dash_wood', (0.252, -0.12, 0.81), (0.02, 0.9, 0.055), radius=0.008, mat='wood', coll=coll))
    parts.append(ck.rbox('gauge_hood', (0.32, 0.36, 0.91), (0.2, 0.42, 0.075), radius=0.03, segments=3, mat='plastic_int', coll=coll))
    for k, y in enumerate((0.27, 0.45)):
        face = ck.lathe(f'gauge{k}', [(0.062, 0.0), (0.0, 0.0)], segments=40, mat='gauge', uv_radial=True, coll=coll)
        bez = ck.lathe(f'gauge{k}_bezel', [(0.072, -0.004), (0.07, 0.006), (0.062, 0.0)], segments=40, mat='chrome', coll=coll)
        needle = ck.rbox(f'needle{k}', (0.0, 0.004, 0.02), (0.004, 0.003, 0.05), radius=0.0, mat='emit', coll=coll)
        for o in (face, bez, needle):
            # built facing +Y; turned to face −X (the driver)
            o.rotation_euler = (0, 0, math.pi / 2)
            o.location = (0.255, y, 0.875)
            ck.apply_transform(o)
            parts.append(o)
    for k in range(3):
        lamp = ck.lathe(f'dash_lamp{k}', [(0.007, 0.0), (0.006, 0.002), (0.0, 0.003)], segments=10, mat='emit', coll=coll)
        lamp.rotation_euler = (0, 0, math.pi / 2)
        lamp.location = (0.252, 0.33 + k * 0.03, 0.83)
        ck.apply_transform(lamp)
        parts.append(lamp)
    # steering wheel: leather rim, three aluminium spokes, a chrome boss, on a black column
    sw = []
    ring = [(0.0, 0.19 * math.cos(2 * math.pi * i / 48), 0.19 * math.sin(2 * math.pi * i / 48)) for i in range(48)]
    sw.append(ck.sweep('wheel_rim', ck.circle_profile(0.015, 10), ring + [ring[0]], mat='leather', coll=coll))
    for a in (0.0, math.pi, -math.pi / 2):
        sw.append(ck.sweep(f'spoke{a:.1f}', ck.rrect_profile(0.008, 0.03, 0.003, 1), [(0.0, 0.03 * math.cos(a), 0.03 * math.sin(a)), (0.0, 0.18 * math.cos(a), 0.18 * math.sin(a))], mat='alu', coll=coll, up=(1, 0, 0)))
    sw.append(ck.lathe('boss', [(0.0, -0.02), (0.04, -0.02), (0.045, 0.0), (0.035, 0.016), (0.0, 0.02)], segments=20, mat='chrome', coll=coll, axis='X'))
    for o in sw:
        o.rotation_euler = (0, math.radians(-24), 0)
        o.location = (0.12, 0.36, 0.87)
        ck.apply_transform(o)
    parts += sw
    parts.append(ck.sweep('column', ck.circle_profile(0.025, 10), [(0.14, 0.36, 0.86), (0.36, 0.36, 0.76)], mat='trim', coll=coll))
    # seats: leather bolsters round fabric centres; a bench behind
    for y in (0.36, -0.36):
        parts.append(ck.rbox(f'seat_base{y:+.2f}', (-0.28, y, 0.42), (0.5, 0.5, 0.13), radius=0.05, segments=4, mat='leather', coll=coll))
        parts.append(ck.rbox(f'seat_pad{y:+.2f}', (-0.27, y, 0.49), (0.42, 0.3, 0.04), radius=0.018, segments=3, mat='fabric', coll=coll))
        back = ck.rbox(f'seat_back{y:+.2f}', (0, 0, 0.29), (0.13, 0.5, 0.6), radius=0.055, segments=4, mat='leather', coll=coll)
        pad = ck.rbox(f'seat_bpad{y:+.2f}', (0.06, 0, 0.27), (0.04, 0.3, 0.46), radius=0.018, segments=3, mat='fabric', coll=coll)
        head = ck.rbox(f'seat_head{y:+.2f}', (0.0, 0, 0.66), (0.09, 0.28, 0.16), radius=0.04, segments=3, mat='leather', coll=coll)
        for o in (back, pad, head):
            o.rotation_euler = (0, math.radians(-14), 0)
            o.location = (-0.56, y, 0.46)
            ck.apply_transform(o)
            parts.append(o)
    parts.append(ck.rbox('bench_base', (-0.98, 0, 0.44), (0.46, 1.24, 0.14), radius=0.05, segments=4, mat='leather', coll=coll))
    bench = ck.rbox('bench_back', (0, 0, 0.24), (0.12, 1.24, 0.5), radius=0.05, segments=4, mat='leather', coll=coll)
    bench.rotation_euler = (0, math.radians(-18), 0)
    bench.location = (-1.2, 0, 0.5)
    ck.apply_transform(bench)
    parts.append(bench)
    for y in (0.3, -0.3):
        pad = ck.rbox(f'bench_pad{y:+.2f}', (0.065, 0, 0.24), (0.03, 0.46, 0.38), radius=0.015, segments=3, mat='fabric', coll=coll)
        pad.rotation_euler = (0, math.radians(-18), 0)
        pad.location = (-1.2, y, 0.5)
        ck.apply_transform(pad)
        parts.append(pad)
    # tunnel, gear lever with a wooden knob, the mirror, the dome lamp
    parts.append(ck.rbox('tunnel', (0.0, 0, 0.36), (0.7, 0.2, 0.12), radius=0.04, segments=3, mat='plastic_int', coll=coll))
    parts.append(ck.sweep('gear_rod', ck.circle_profile(0.007, 8), [(0.12, 0, 0.42), (0.08, 0, 0.6)], mat='chrome', coll=coll))
    knob = ck.lathe('gear_knob', [(0.0, -0.022), (0.02, -0.018), (0.024, 0.0), (0.02, 0.018), (0.0, 0.022)], segments=16, mat='wood', coll=coll, axis='Z')
    knob.location = (0.08, 0, 0.62)
    ck.apply_transform(knob)
    parts.append(knob)
    parts.append(ck.rbox('boot', (0.12, 0, 0.43), (0.07, 0.07, 0.04), radius=0.02, segments=3, mat='leather', coll=coll))
    parts.append(ck.rbox('mirror', (0.05, 0, 1.25), (0.03, 0.2, 0.06), radius=0.015, segments=3, mat='trim', coll=coll))
    parts.append(ck.rbox('mirror_face', (0.034, 0, 1.25), (0.004, 0.18, 0.048), radius=0.01, segments=2, mat='chrome', coll=coll))
    parts.append(ck.rbox('dome_lamp', (-0.45, 0, 1.335), (0.1, 0.16, 0.012), radius=0.004, segments=2, mat='emit', coll=coll))
    return parts


# ------------------------------------------------------------------------------------------- wheels
def rim_face(name, coll):
    """the rim's face: a dish with five spokes between pockets, as a height field over (r, θ), facing +Y"""
    bm = bmesh.new()
    nr, nt = 14, 60
    r0, r1 = 0.052, RIM_R + 0.006
    verts = []
    for i in range(nr + 1):
        r = r0 + (r1 - r0) * i / nr
        row = []
        for j in range(nt):
            th = 2 * math.pi * j / nt
            dish = 0.035 + 0.03 * ck.smooth01((r - 0.06) / 0.09)
            # pockets between the spokes: deep in the middle of a gap, none on a spoke
            ang = (th * 5 / (2 * math.pi)) % 1.0
            spoke = abs(ang - 0.5) * 2
            pocket = ck.smooth01((0.62 - spoke) / 0.25) * ck.smooth01((r - 0.072) / 0.012) * ck.smooth01((0.142 - r) / 0.012)
            y = dish - 0.028 * pocket
            if r > RIM_R - 0.006:
                y = 0.072 + 0.004 * ck.smooth01((r - RIM_R + 0.006) / 0.012)
            row.append(bm.verts.new((r * math.cos(th), y, r * math.sin(th))))
        verts.append(row)
    for i in range(nr):
        for j in range(nt):
            j1 = (j + 1) % nt
            bm.faces.new((verts[i][j], verts[i][j1], verts[i + 1][j1], verts[i + 1][j]))
    o = mc.mesh_object(name, bm, 'alu', coll)
    o.data.update()
    if sum(p.normal.y for p in o.data.polygons) < 0:
        o.data.flip_normals()
    return o


def build_wheels(coll):
    """four wheels, origin at each wheel centre, outer face towards ±Y; three materials (draw calls)"""
    half = WW / 2
    tyre = [
        (RIM_R - 0.004, -half + 0.012), (RIM_R + 0.01, -half - 0.002), (0.21, -half - 0.008), (0.25, -half - 0.006),
        (WR - 0.014, -half + 0.004), (WR - 0.002, -half + 0.018), (WR, -0.045), (WR - 0.007, -0.04), (WR - 0.007, -0.03),
        (WR, -0.025), (WR, 0.025), (WR - 0.007, 0.03), (WR - 0.007, 0.04), (WR, 0.045), (WR - 0.002, half - 0.018),
        (WR - 0.014, half - 0.004), (0.25, half + 0.006), (0.21, half + 0.008), (RIM_R + 0.01, half + 0.002), (RIM_R - 0.004, half - 0.012),
    ]
    wheels = []
    for side in (1, -1):
        for x in (WX, -WX):
            name = f'WHEEL_{"F" if x > 0 else "R"}{"L" if side > 0 else "R"}'
            t = ck.lathe(name + '_tyre', tyre, segments=56, mat='rubber', closed=True, coll=coll)
            barrel = ck.lathe(name + '_barrel', [(RIM_R - 0.004, -half + 0.01), (RIM_R - 0.012, -half + 0.012), (RIM_R - 0.012, half - 0.012), (RIM_R - 0.004, half - 0.01)], segments=48, mat='alu', coll=coll)
            face = rim_face(name + '_face', coll)
            cap = ck.lathe(name + '_cap', [(0.054, 0.045), (0.056, 0.058), (0.05, 0.07), (0.03, 0.079), (0.0, 0.082)], segments=28, mat='chrome', coll=coll)
            nuts = []
            for k in range(4):
                a = 2 * math.pi * k / 4 + math.pi / 4
                n = ck.lathe(f'{name}_nut{k}', [(0.01, 0.06), (0.009, 0.072), (0.0, 0.074)], segments=6, mat='alu', coll=coll)
                n.location = (0.068 * math.cos(a), 0, 0.068 * math.sin(a))
                ck.apply_transform(n)
                nuts.append(n)
            w = ck.join(name, [t, barrel, face, cap] + nuts)
            if side < 0:
                flip_y(w)
            mc.smooth(w, angle_deg=40.0)
            mc.apply_modifiers(w)
            w.location = (x, side * WY, WR)
            wheels.append(w)
    return wheels
