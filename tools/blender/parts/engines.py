"""
Engines and the turbo (docs/MODCAR.md section 2.3).

    blender -b --factory-startup --python tools/blender/build.py -- parts/engines [<id>|all] [--norender]

Origin at the bottom centre where the engine sits on its mount (the lowest point of the sump is z = 0),
crankshaft along X, the front (pulleys, fan) towards +X. Sub-mounts: M_turbo (where turbo_small bolts on:
its local +Z is the flange normal) on engines that take one; M_exhaust_out (centre of the downpipe flange,
local +X = the direction the gas leaves); twin-bank engines also have M_exhaust_out2.
Turbo: origin at the centre of its turbine inlet flange, the turbo sits on +Z of it.
"""
import math

import bmesh
from mathutils import Matrix, Vector

from parts import _kit as K
from parts._kit import V, mat4

# ------------------------------------------------------------------------------------------------ pieces


def pulley(P, x, y, z, r, w, material='steel', grooves=1, hub=True, segs=22):
    """A V-groove pulley on an axis along X (front face at x + w/2)."""
    prof = []
    x0 = -w / 2
    gw = w / grooves
    prof.append((r * 0.35, x0))
    prof.append((r, x0))
    for g in range(grooves):
        a = x0 + g * gw
        prof += [(r, a + gw * 0.12), (r * 0.86, a + gw * 0.42), (r * 0.86, a + gw * 0.58), (r, a + gw * 0.88)]
    prof.append((r, w / 2))
    prof.append((r * 0.92, w / 2 + 0.002))
    prof.append((r * 0.45, w / 2 + 0.002))
    if hub:
        prof += [(r * 0.40, w / 2 + 0.012), (r * 0.2, w / 2 + 0.014), (0.0, w / 2 + 0.014)]
    else:
        prof.append((0.0, w / 2 + 0.002))
    # profile runs from the back outwards then along +X to the front pole: outside on the right
    return P.lathe('pulley', prof, loc=(x, y, z), material=material, axis='X', segs=segs, close='start',
                   sharp=40.0)


def belt_path(circles, x, steps_deg=12.0):
    """Closed path of a belt round pulleys [(y, z, r), ...] listed counter-clockwise in the (y, z) plane."""
    n = len(circles)
    tang = []
    for i in range(n):
        y1, z1, r1 = circles[i]
        y2, z2, r2 = circles[(i + 1) % n]
        d = V((y2 - y1, z2 - z1))
        L = d.length
        dh = d / L
        b = math.acos(max(-1.0, min(1.0, (r1 - r2) / L)))
        # outward normal: rotate the direction clockwise by b
        nrm = V((dh.x * math.cos(-b) - dh.y * math.sin(-b), dh.x * math.sin(-b) + dh.y * math.cos(-b)))
        tang.append((V((y1, z1)) + nrm * r1, V((y2, z2)) + nrm * r2, nrm))
    pts = []
    for i in range(n):
        y, z, r = circles[i]
        c = V((y, z))
        a_in = math.atan2(tang[i - 1][2].y, tang[i - 1][2].x)
        a_out = math.atan2(tang[i][2].y, tang[i][2].x)
        while a_out < a_in:
            a_out += math.tau
        k = max(1, int(math.degrees(a_out - a_in) / steps_deg))
        for j in range(k + 1):
            a = a_in + (a_out - a_in) * j / k
            q = c + V((math.cos(a), math.sin(a))) * r
            pts.append((x, q.x, q.y))
    return pts


def belt(P, x, circles, width=0.012, thick=0.006, material='rubber'):
    path = belt_path(circles, x)
    # a rectangular section: across the belt = X, thickness = radial
    prof = [(-thick / 2, -width / 2), (thick / 2, -width / 2), (thick / 2, width / 2), (-thick / 2, width / 2)]
    # sweep frames: the sweep's normal starts towards +Z; use a custom section oriented after the sweep
    bm = bmesh.new()
    rings = K.bm_sweep(bm, path, 1.0, profile=[(0.0, 1.0), (0.0, -1.0), (0.0, -1.0), (0.0, 1.0)], closed=True,
                       caps=False)
    # rebuild the section: for every ring, x offsets +-width/2 and radial offsets +-thick/2 (outwards from the
    # local curvature centre approximated by the path's normal in the y-z plane)
    npth = len(path)
    for i, ring in enumerate(rings):
        p = V(path[i])
        pn = V(path[(i + 1) % npth]) - V(path[i - 1])
        t2 = V((pn.y, pn.z)).normalized()
        out = V((0, t2.y, -t2.x))  # right of the travel direction in (y, z): outwards for a CCW loop
        corners = [(-1, -1), (-1, 1), (1, 1), (1, -1)]
        for v, (sx, sr) in zip(ring, corners):
            v.co = p + V((sx * width / 2, 0, 0)) + out * (sr * thick / 2)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    return P.mesh('belt', bm, material, sharp=50.0)


def fan(P, x, y, z, r, blades=4, hub_r=0.035, material='steel', pitch=24.0, chord=0.07):
    """An engine cooling fan facing +X: twisted flat blades on a hub."""
    bm = bmesh.new()
    for i in range(blades):
        a = math.tau * i / blades + math.radians(45)
        # blade outline in its own plane (radial along +Y local, chord along +Z local)
        poly = [(hub_r * 0.8, -chord * 0.35), (r * 0.98, -chord * 0.62), (r, -chord * 0.1), (r * 0.97, chord * 0.42),
                (hub_r * 0.8, chord * 0.3)]
        vs = K.bm_prism(bm, [(py, pz) for (py, pz) in poly], 0.003)
        # prism is in XY with thickness Z: map (x=radial, y=chord, z=thickness) -> world
        m = mat4((x, y, z), (math.degrees(a), 0, 0)) @ Matrix(((0, 0, 1, 0), (1, 0, 0, 0), (0, 1, 0, 0), (0, 0, 0, 1)))
        m = m @ Matrix.Rotation(math.radians(pitch), 4, 'X')
        K.bm_transform(bm, m, vs)
    P.mesh('fan', bm, material, bev=0.0012, segs=1, sharp=40.0)
    P.lathe('fan_hub', [(0.0, 0.012), (hub_r, 0.012), (hub_r, -0.012), (hub_r * 0.7, -0.016)][::-1], loc=(x, y, z),
            material=material, axis='X', segs=20, close='start', sharp=40.0)


def flange_bolts(P, pts, normal, r=0.0055, h=0.005, material='steel'):
    P.bolts(pts, normal=normal, r=r, h=h, washer=False, material=material)


# ------------------------------------------------------------------------------------------------ eng_i4


def build_eng_i4(P):
    """1.3 L inline four, 1970s: iron block, alloy head, red rocker cover, pancake air cleaner, log manifold."""
    P.ao_distance = 0.12
    zc = 0.17  # crank centre
    # --- sump: a deep rear well and a shallow front, a lip flange and its bolts
    bm = bmesh.new()
    poly = [(-0.245, 0.0), (-0.03, 0.0), (0.02, 0.055), (0.195, 0.065), (0.195, 0.12), (-0.245, 0.12)]
    K.bm_prism(bm, poly, 0.25, matrix=mat4((0, 0, 0), (90, 0, 0)))
    P.mesh('sump', bm, 'steel', bev=0.012, segs=2)
    P.box('sump_lip', (0.46, 0.29, 0.012), (-0.025, 0, 0.122), 'steel', bev=0.003, segs=1)
    P.cyl('drain', 0.011, 0.012, (-0.2, 0, 0.002), 'steel', segs=6, bev=None)
    flange_bolts(P, [(x, s * 0.138, 0.128) for x in (-0.22, -0.13, -0.04, 0.05, 0.14) for s in (-1, 1)], (0, 0, 1),
                 r=0.005)
    # --- block: skirt and the cylinder bank, with freeze plugs and ribs
    P.box('skirt', (0.46, 0.29, 0.09), (-0.025, 0, 0.172), 'steel', bev=0.008, segs=2)
    bm = bmesh.new()
    K.bm_cube(bm, (0.46, 0.25, 0.22), mat4((-0.025, 0, 0.32)))
    for v in bm.verts:
        if v.co.z < 0.3:
            v.co.y *= 1.08
    P.mesh('block', bm, 'steel', bev=0.008, segs=2)
    for s in (-1, 1):
        for x in (-0.15, -0.025, 0.10):
            P.cyl('plug', 0.017, 0.008, (x, s * 0.127, 0.31), 'alu', axis='Y', segs=10, bev=None)
        for x in (-0.205, -0.09, 0.03, 0.15):
            P.box('rib', (0.016, 0.012, 0.18), (x, s * 0.128, 0.31), 'steel', bev=0.003, segs=1, open='-y' if s > 0 else '+y')
    # --- head, gasket, rocker cover
    P.box('gasket', (0.45, 0.245, 0.006), (-0.025, 0, 0.433), 'trim', bev=None)
    P.box('head', (0.45, 0.24, 0.075), (-0.025, 0, 0.4735), 'alu', bev=0.007, segs=2)
    P.box('cover_flange', (0.44, 0.22, 0.012), (-0.03, 0, 0.517), 'paint', bev=0.004, segs=2)
    P.box('cover', (0.42, 0.20, 0.052), (-0.03, 0, 0.548), 'paint', bev=0.018, segs=3)
    for x in (-0.19, -0.11, -0.03, 0.05, 0.13):
        P.box('cover_rib', (0.012, 0.15, 0.012), (x, 0, 0.576), 'paint', bev=0.004, segs=1, open='-z')
    flange_bolts(P, [(x, s * 0.104, 0.524) for x in (-0.22, -0.03, 0.16) for s in (-1, 1)], (0, 0, 1), r=0.0055,
                 material='chrome')
    P.cyl('filler', 0.024, 0.02, (0.13, -0.05, 0.582), 'chrome', segs=16, bev=0.003, bsegs=2)
    P.box('filler_tab', (0.03, 0.008, 0.012), (0.13, -0.05, 0.594), 'chrome', bev=0.002, segs=1)
    # --- timing cover, water pump, crank and pump pulleys, alternator, belt, fan
    P.box('timing', (0.03, 0.2, 0.33), (0.215, 0, 0.29), 'alu', bev=0.012, segs=2)
    flange_bolts(P, [(0.231, s * 0.085, z) for z in (0.17, 0.29, 0.41) for s in (-1, 1)], (1, 0, 0), r=0.005)
    P.cyl('pump', 0.05, 0.05, (0.245, 0, 0.36), 'alu', axis='X', segs=18, bev=0.004, bsegs=2)
    pulley(P, 0.262, 0, zc, 0.068, 0.022, 'steel', grooves=1)
    pulley(P, 0.276, 0, 0.36, 0.055, 0.018, 'steel', grooves=1, hub=False)
    # alternator on the right (-Y), its bracket and adjuster
    ya, za = -0.165, 0.305
    P.cyl('alt', 0.058, 0.095, (0.165, ya, za), 'alu', axis='X', segs=20, bev=0.005, bsegs=2)
    for i in range(6):
        a = math.tau * i / 6
        P.box('alt_fin', (0.06, 0.006, 0.014), (0.165, ya + math.cos(a) * 0.058, za + math.sin(a) * 0.058), 'alu',
              rot=(math.degrees(a), 0, 0), bev=None)
    P.cyl('alt_rear', 0.05, 0.02, (0.108, ya, za), 'steel', axis='X', segs=16, bev=0.003, bsegs=1)
    pulley(P, 0.272, ya, za, 0.034, 0.016, 'steel', grooves=1, hub=False, segs=18)
    P.cyl('alt_shaft', 0.012, 0.06, (0.235, ya, za), 'steel', axis='X', segs=10, bev=None)
    P.tube('alt_arm', [(0.2, ya + 0.03, za + 0.055), (0.2, -0.09, 0.44)], 0.007, 'steel', segs=6)
    P.box('alt_brk', (0.03, 0.05, 0.03), (0.15, -0.12, 0.25), 'steel', bev=0.004, segs=1)
    belt(P, 0.272, [(0.0, zc, 0.07), (ya, za, 0.036), (0.0, 0.36, 0.057)][::-1], width=0.013, thick=0.007)
    fan(P, 0.300, 0, 0.36, 0.15, blades=4, hub_r=0.035, material='steel')
    # --- thermostat housing and hose stubs
    P.box('thermo', (0.05, 0.06, 0.05), (0.205, 0.02, 0.49), 'alu', bev=0.008, segs=2)
    P.tube('hose_up', [(0.22, 0.02, 0.495), (0.27, 0.025, 0.50), (0.31, 0.05, 0.49)], 0.019, 'rubber', segs=12,
           bend=0.04)
    P.torus('clamp', 0.021, 0.0028, loc=(0.245, 0.022, 0.497), axis='X', segs=16, rsegs=4, material='steel')
    P.tube('hose_lo', [(0.24, -0.04, 0.30), (0.27, -0.07, 0.26), (0.30, -0.09, 0.24)], 0.018, 'rubber', segs=12,
           bend=0.04)
    # --- exhaust (right, -Y): port flanges, four runners into a log, the outlet down
    yh = -0.12
    xs = [-0.185, -0.085, 0.015, 0.115]
    for x in xs:
        P.box('ex_flange', (0.06, 0.012, 0.042), (x, yh - 0.006, 0.47), 'rust', bev=0.004, segs=1)
        P.tube('ex_runner', [(x, yh - 0.01, 0.47), (x, yh - 0.06, 0.465), (x * 0.8 - 0.01, -0.205, 0.40)], 0.021,
               'rust', segs=10, bend=0.04)
        flange_bolts(P, [(x + 0.022, yh - 0.012, 0.47), (x - 0.022, yh - 0.012, 0.47)], (0, -1, 0), r=0.0052)
    P.tube('ex_log', [(-0.17, -0.205, 0.40), (0.1, -0.205, 0.40)], 0.026, 'rust', segs=14)
    P.sphere('ex_cap', 0.026, (0.1, -0.205, 0.40), 'rust', u=12, v=5)
    P.sphere('ex_cap', 0.026, (-0.17, -0.205, 0.40), 'rust', u=12, v=5)
    P.tube('ex_out', [(-0.035, -0.205, 0.40), (-0.035, -0.215, 0.33), (-0.07, -0.22, 0.27)], 0.027, 'rust', segs=14,
           bend=0.05)
    P.cyl('ex_flange_out', 0.042, 0.012, (-0.072, -0.221, 0.262), 'rust', rot=(0, 30, 0), segs=16, bev=0.003, bsegs=1)
    P.empty('M_exhaust_out', (-0.075, -0.222, 0.255), rot=(0, 120, 0))
    P.empty('M_turbo', (-0.035, -0.205, 0.43), rot=(0, 0, 0))
    # --- intake (left, +Y): runners into a plenum, carburettor, pancake air cleaner
    for x in xs:
        P.box('in_flange', (0.05, 0.012, 0.036), (x, 0.126, 0.475), 'alu', bev=0.003, segs=1)
        P.tube('in_runner', [(x, 0.13, 0.475), (x, 0.175, 0.48), (x * 0.35 - 0.02, 0.19, 0.52)], 0.017, 'alu', segs=8,
               bend=0.03)
    P.box('plenum', (0.16, 0.07, 0.05), (-0.035, 0.19, 0.52), 'alu', bev=0.012, segs=2)
    P.box('carb', (0.07, 0.07, 0.05), (-0.035, 0.18, 0.565), 'alu', bev=0.006, segs=2)
    P.cyl('float_bowl', 0.022, 0.04, (-0.035, 0.225, 0.56), 'alu', segs=12, bev=0.003, bsegs=1)
    P.tube('linkage', [(0.0, 0.215, 0.565), (0.04, 0.24, 0.55)], 0.003, 'steel', segs=5)
    # air cleaner: black housing, chrome lid, wing nut and a snorkel towards the front
    xc, yc, zc2 = -0.03, 0.145, 0.588
    P.lathe('cleaner', [(0.0, 0.0), (0.105, 0.0), (0.122, 0.006), (0.128, 0.03), (0.124, 0.052), (0.118, 0.056)],
            loc=(xc, yc, zc2), material='trim', segs=36, close='end', sharp=40.0)
    P.lathe('cleaner_lid', [(0.0, 0.062), (0.06, 0.06), (0.112, 0.054), (0.126, 0.05), (0.126, 0.044)][::-1],
            loc=(xc, yc, zc2), material='chrome', segs=36, close='start', sharp=40.0)
    P.cyl('wing_base', 0.012, 0.01, (xc, yc, zc2 + 0.067), 'chrome', segs=10, bev=None)
    P.box('wing', (0.006, 0.05, 0.016), (xc, yc, zc2 + 0.076), 'chrome', bev=0.0025, segs=1)
    bm = bmesh.new()
    K.bm_cube(bm, (0.13, 0.06, 0.034), mat4((xc + 0.16, yc + 0.02, zc2 + 0.026)))
    for v in bm.verts:
        if v.co.x > xc + 0.2:
            v.co.y = yc + 0.02 + (v.co.y - yc - 0.02) * 1.25
            v.co.z = zc2 + 0.026 + (v.co.z - zc2 - 0.026) * 1.2
    P.mesh('snorkel', bm, 'trim', bev=0.006, segs=2)
    # breather hose from the rocker cover to the cleaner
    P.tube('breather', [(-0.18, 0.06, 0.57), (-0.2, 0.09, 0.60), (-0.13, 0.08, 0.605)], 0.008, 'rubber', segs=8,
           bend=0.03)
    # --- ignition: distributor with cap and four plug leads, coil
    xd, yd = -0.205, 0.15
    P.cyl('dist_body', 0.026, 0.12, (xd, yd, 0.40), 'alu', segs=14, bev=0.003, bsegs=1)
    P.lathe('dist_cap', [(0.0, 0.0), (0.04, 0.0), (0.042, 0.02), (0.036, 0.04), (0.0, 0.046)],
            loc=(xd, yd, 0.46), material='trim', segs=18, sharp=40)
    for i, x in enumerate(xs):
        a = math.radians(40 + i * 35)
        top = V((xd + math.cos(a) * 0.026, yd + math.sin(a) * 0.016, 0.49))
        plug = V((x + 0.025, 0.105, 0.50))
        mid = (top + plug) / 2 + V((0, 0.03, 0.05))
        P.tube('lead', [top, top + V((0, 0, 0.02)), mid, plug + V((0, 0.01, 0.03)), plug], 0.0045, 'trim', segs=5,
               bend=0.025)
        P.cyl('boot', 0.009, 0.03, tuple(plug + V((0, 0.0, 0.0))), 'rubber', rot=(-25, 0, 0), segs=8, bev=None)
    P.cyl('coil', 0.026, 0.11, (0.12, 0.185, 0.41), 'trim', segs=14, bev=0.004, bsegs=1)
    P.cyl('coil_top', 0.02, 0.02, (0.12, 0.185, 0.47), 'trim', segs=12, bev=0.002, bsegs=1)
    P.box('coil_brk', (0.03, 0.04, 0.05), (0.12, 0.155, 0.41), 'steel', bev=0.003, segs=1)
    # --- oil filter, fuel pump and line, dipstick
    P.cyl('filter', 0.042, 0.1, (0.04, 0.2, 0.235), 'paint_b', axis='Y', segs=18, bev=0.006, bsegs=2)
    for i in range(8):
        a = math.tau * i / 8
        P.box('filter_flute', (0.008, 0.07, 0.006), (0.04 + math.cos(a) * 0.043, 0.2, 0.235 + math.sin(a) * 0.043),
              'paint_b', rot=(0, -math.degrees(a), 0), bev=None)
    P.cyl('filter_base', 0.035, 0.02, (0.04, 0.145, 0.235), 'alu', axis='Y', segs=14, bev=0.003, bsegs=1)
    P.box('fuel_pump', (0.06, 0.05, 0.06), (0.13, 0.155, 0.26), 'alu', bev=0.01, segs=2)
    P.tube('fuel_line', [(0.13, 0.175, 0.29), (0.1, 0.23, 0.40), (0.0, 0.225, 0.52), (-0.02, 0.2, 0.56)], 0.004,
           'steel', segs=6, bend=0.05)
    P.tube('dipstick', [(-0.06, 0.15, 0.24), (-0.07, 0.17, 0.45), (-0.06, 0.16, 0.56)], 0.004, 'steel', segs=6,
           bend=0.08)
    P.torus('dip_ring', 0.014, 0.004, loc=(-0.06, 0.16, 0.575), rot=(0, 90, 0), segs=14, rsegs=6, material='paint_b')
    # --- back: bellhousing plate, starter motor
    plate = []
    for i in range(20):
        a = math.tau * i / 20
        rr = 0.15 + 0.025 * math.cos(2 * a) ** 2
        plate.append((0.21 + rr * math.sin(a) * 0.95, rr * math.cos(a) * 1.1))
    bm = bmesh.new()
    K.bm_prism(bm, [(-z, y) for (z, y) in plate], 0.012, matrix=mat4((-0.258, 0, 0), (0, 90, 0)))
    P.mesh('rear_plate', bm, 'steel', bev=0.003, segs=1)
    flange_bolts(P, [(-0.266, 0.15 * math.cos(math.tau * (i + 0.5) / 8), 0.21 + 0.14 * math.sin(math.tau * (i + 0.5) / 8))
                     for i in range(8)], (-1, 0, 0), r=0.0065)
    P.cyl('starter', 0.042, 0.14, (-0.19, -0.155, 0.13), 'steel', axis='X', segs=16, bev=0.004, bsegs=2)
    P.cyl('solenoid', 0.022, 0.09, (-0.19, -0.155, 0.185), 'alu', axis='X', segs=12, bev=0.003, bsegs=1)
    P.cyl('starter_nose', 0.03, 0.04, (-0.245, -0.155, 0.13), 'alu', axis='X', segs=14, bev=0.003, bsegs=1)
    # --- engine mounts (both sides)
    for s in (-1, 1):
        P.box('mount_brk', (0.07, 0.05, 0.06), (0.04, s * 0.168, 0.23), 'steel', bev=0.005, segs=1)
        P.cyl('mount_rubber', 0.03, 0.04, (0.04, s * 0.205, 0.2), 'rubber', segs=12, bev=0.005, bsegs=1)
        P.box('mount_foot', (0.08, 0.06, 0.012), (0.04, s * 0.205, 0.172), 'steel', bev=0.003, segs=1)
    P.views = [('a', 35, 22), ('b', 215, 22)]


PARTS = {
    'eng_i4': build_eng_i4,
}


def main(args):
    K.run(PARTS, args)
