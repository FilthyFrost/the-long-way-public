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
    P.cyl('drain', 0.011, 0.012, (-0.2, 0, 0.0065), 'steel', segs=6, bev=None)
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
    rear_plate(P, -0.25, zc, 0.17, 0.17, nb=8)
    P.cyl('starter', 0.042, 0.14, (-0.19, -0.155, 0.13), 'steel', axis='X', segs=16, bev=0.004, bsegs=2)
    P.cyl('solenoid', 0.022, 0.09, (-0.19, -0.155, 0.185), 'alu', axis='X', segs=12, bev=0.003, bsegs=1)
    P.cyl('starter_nose', 0.03, 0.04, (-0.245, -0.155, 0.13), 'alu', axis='X', segs=14, bev=0.003, bsegs=1)
    # --- engine mounts (both sides)
    for s in (-1, 1):
        P.box('mount_brk', (0.07, 0.05, 0.06), (0.04, s * 0.168, 0.23), 'steel', bev=0.005, segs=1)
        P.cyl('mount_rubber', 0.03, 0.04, (0.04, s * 0.205, 0.2), 'rubber', segs=12, bev=0.005, bsegs=1)
        P.box('mount_foot', (0.08, 0.06, 0.012), (0.04, s * 0.205, 0.172), 'steel', bev=0.003, segs=1)
    P.views = [('a', 35, 22), ('b', 215, 22)]


# ------------------------------------------------------------------------------------------------ shared

def sump(P, x0, x1, hw, ztop, xdeep, zshallow=0.05, material='steel', bolts=5):
    """A stamped sump: deep well behind xdeep, shallow in front, a flange lip with bolts."""
    bm = bmesh.new()
    poly = [(x0, 0.0), (xdeep, 0.0), (xdeep + 0.05, zshallow), (x1, zshallow + 0.01), (x1, ztop), (x0, ztop)]
    K.bm_prism(bm, poly, hw * 2, matrix=mat4((0, 0, 0), (90, 0, 0)))
    P.mesh('sump', bm, material, bev=0.014, segs=2)
    P.box('sump_lip', (x1 - x0 + 0.02, hw * 2 + 0.04, 0.012), ((x0 + x1) / 2, 0, ztop + 0.002), material, bev=0.004,
          segs=1)
    xs = [x0 + 0.03 + (x1 - x0 - 0.06) * i / (bolts - 1) for i in range(bolts)]
    flange_bolts(P, [(x, sg * (hw + 0.012), ztop + 0.008) for x in xs for sg in (-1, 1)], (0, 0, 1), r=0.006)
    P.cyl('drain', 0.012, 0.012, (x0 - 0.002, 0, 0.03), 'steel', axis='X', segs=6, bev=None)


def mounts(P, x, y, z):
    """A pair of engine mounts: bracket, rubber block and foot on both sides at +-y."""
    for sg in (-1, 1):
        P.box('mount_brk', (0.07, 0.05, 0.06), (x, sg * (y - 0.035), z + 0.03), 'steel', bev=0.006, segs=1)
        P.cyl('mount_rubber', 0.03, 0.04, (x, sg * y, z), 'rubber', segs=12, bev=0.006, bsegs=1)
        P.box('mount_foot', (0.08, 0.06, 0.012), (x, sg * y, z - 0.028), 'steel', bev=0.003, segs=1)


def starter(P, x, y, z, length=0.14, r=0.042):
    P.cyl('starter', r, length, (x, y, z), 'steel', axis='X', segs=16, bev=0.006, bsegs=2)
    P.cyl('solenoid', r * 0.52, length * 0.64, (x, y, z + r * 1.3), 'alu', axis='X', segs=12, bev=0.004, bsegs=1)
    P.cyl('starter_nose', r * 0.72, 0.04, (x - length / 2 - 0.015, y, z), 'alu', axis='X', segs=14, bev=0.004,
          bsegs=1)
    P.tube('starter_cable', [(x + 0.02, y, z + r * 1.3 + 0.02), (x + 0.03, y - 0.03, z + 0.08)], 0.007, 'trim', segs=6)


def rear_plate(P, x, zc, ry, rz, nb=8, material='steel'):
    """
    The cast flywheel housing at the back of the block (x = the block's rear face), centred on the crank
    (zc): a short bell with a bolting flange for the gearbox, bolt bosses round it, a dark input opening.
    ry, rz: the housing radius across and up (the larger is used, the smaller flattens it a little).
    """
    r = max(ry, rz) * 0.86
    prof = [(r * 0.55, 0.004), (r * 0.94, 0.0), (r, 0.012), (r, 0.03), (r + 0.016, 0.032), (r + 0.016, 0.046),
            (r * 0.83, 0.046), (r * 0.80, 0.04), (0.0, 0.04)]
    o = P.lathe('fw_housing', prof, loc=(x, 0, zc), material=material, axis='-X', segs=24, sharp=40.0,
                close='start')
    if abs(ry - rz) > 1e-3:
        k = min(ry, rz) / max(ry, rz)
        sy, sz = (k, 1.0) if ry < rz else (1.0, k)
        sy, sz = max(sy, 0.88), max(sz, 0.88)
        o.data.transform(Matrix.Translation((x, 0, zc)) @ Matrix.Diagonal((1, sy, sz, 1)) @
                         Matrix.Translation((-x, 0, -zc)))
    else:
        sy = sz = 1.0
    P.cyl('fw_input', r * 0.36, 0.006, (x - 0.044, 0, zc), 'trim', axis='X', segs=20, bev=None)
    for i in range(nb):
        a = math.tau * (i + 0.5) / nb
        cy, cz = (r + 0.008) * math.cos(a) * sy, zc + (r + 0.008) * math.sin(a) * sz
        P.cyl('fw_boss', 0.013, 0.03, (x - 0.025, cy, cz), material, axis='X', segs=8, bev=None)
        P.bolt((x - 0.046, cy, cz), normal=(-1, 0, 0), r=0.0075, h=0.006, washer=False)
    # radial ribs on the bell
    for i in range(6):
        a = math.tau * i / 6 + 0.3
        P.box('fw_rib', (0.028, 0.012, r * 0.32), (x - 0.016, r * 0.8 * math.cos(a) * sy, zc + r * 0.8 * math.sin(a) * sz),
              material, rot=(math.degrees(a) - 90, 0, 0), bev=None, open='+x')


def lift_eye(P, x, y, z):
    bm = bmesh.new()
    K.bm_prism(bm, K.rounded_rect(0.05, 0.06, 0.02, seg=3), 0.007, matrix=mat4((x, y, z), (90, 0, 0)))
    P.mesh('lift_eye', bm, 'steel', bev=0.002, segs=1)
    P.cyl('lift_hole', 0.011, 0.009, (x, y, z + 0.01), 'trim', axis='Y', segs=12, bev=None)


def plug_lead(P, a, b, lift=0.05, r=0.005, material='trim'):
    a, b = V(a), V(b)
    mid = (a + b) / 2 + V((0, 0, lift))
    P.tube('lead', [a, a + V((0, 0, 0.02)), mid, b + V((0, 0, 0.03)), b], r, material, segs=5, bend=0.025)


# ------------------------------------------------------------------------------------------------ eng_i4d


def build_eng_i4d(P):
    """2.4 L diesel four for the pickup: tall painted iron block, inline injection pump with its four steel
    injector lines, finned alloy rocker cover, big six-blade fan, lift eyes."""
    P.ao_distance = 0.13
    zc = 0.19
    sump(P, -0.29, 0.22, 0.135, 0.14, -0.04, zshallow=0.06)
    P.box('skirt', (0.53, 0.30, 0.10), (-0.035, 0, 0.195), 'paint', bev=0.01, segs=2)
    bm = bmesh.new()
    K.bm_cube(bm, (0.53, 0.27, 0.27), mat4((-0.035, 0, 0.38)))
    for v in bm.verts:
        if v.co.z < 0.35:
            v.co.y *= 1.07
    P.mesh('block', bm, 'paint', bev=0.012, segs=2)
    for sg in (-1, 1):
        for x in (-0.25, -0.14, -0.035, 0.07, 0.18):
            P.box('rib', (0.02, 0.014, 0.23), (x, sg * 0.138, 0.37), 'paint', bev=0.004, segs=1,
                  open='-y' if sg > 0 else '+y')
        for x in (-0.19, -0.035, 0.12):
            P.cyl('plug', 0.02, 0.009, (x, sg * 0.141, 0.42), 'alu', axis='Y', segs=10, bev=None)
    # head (painted), gasket, finned alloy rocker cover with two fillers
    P.box('gasket', (0.52, 0.27, 0.006), (-0.035, 0, 0.518), 'trim', bev=None)
    P.box('head', (0.52, 0.26, 0.09), (-0.035, 0, 0.566), 'paint', bev=0.01, segs=2)
    P.box('cover', (0.48, 0.21, 0.07), (-0.04, 0, 0.646), 'alu', bev=0.024, segs=3)
    for y in (-0.06, -0.03, 0.0, 0.03, 0.06):
        P.box('cover_fin', (0.40, 0.01, 0.018), (-0.05, y, 0.686), 'alu', bev=0.004, segs=1, open='-z')
    for x in (0.13, -0.21):
        P.cyl('filler', 0.028, 0.022, (x, 0.0, 0.692), 'trim', segs=14, bev=0.004, bsegs=2)
        P.box('filler_tab', (0.036, 0.01, 0.014), (x, 0.0, 0.707), 'trim', bev=0.003, segs=1)
    flange_bolts(P, [(x, sg * 0.112, 0.614) for x in (-0.25, -0.04, 0.17) for sg in (-1, 1)], (0, 0, 1), r=0.007)
    lift_eye(P, 0.18, -0.12, 0.64)
    lift_eye(P, -0.27, 0.12, 0.64)
    # injectors along the left (+Y) edge of the head, return line, injection pump and its lines
    xs = [-0.22, -0.10, 0.02, 0.14]
    inj = []
    for x in xs:
        p = V((x, 0.095, 0.62))
        P.cyl('injector', 0.013, 0.06, tuple(p + V((0, 0, 0.012))), 'alu', segs=10, bev=0.002, bsegs=1)
        P.cyl('inj_nut', 0.015, 0.012, tuple(p + V((0, 0, 0.045))), 'steel', segs=6, bev=None)
        inj.append(p + V((0, 0, 0.052)))
    P.tube('return', [q + V((0, 0, 0.012)) for q in inj], 0.0045, 'rubber', segs=6, bend=0.02)
    xp, yp, zp = -0.06, 0.205, 0.33
    P.box('pump', (0.26, 0.08, 0.10), (xp, yp, zp), 'alu', bev=0.012, segs=2)
    P.box('pump_top', (0.20, 0.05, 0.03), (xp, yp - 0.005, zp + 0.062), 'alu', bev=0.007, segs=1)
    P.box('governor', (0.08, 0.09, 0.12), (xp - 0.16, yp, zp + 0.01), 'alu', bev=0.014, segs=2)
    P.box('pump_drive', (0.06, 0.07, 0.07), (xp + 0.15, yp - 0.01, zp), 'alu', bev=0.012, segs=1)
    for i, x in enumerate(xs):
        a = V((xp - 0.075 + 0.05 * i, yp - 0.005, zp + 0.08))
        P.cyl('delivery', 0.009, 0.02, tuple(a), 'steel', segs=6, bev=None)
        b = inj[i]
        P.tube('inj_line', [a + V((0, 0, 0.01)), a + V((0, 0, 0.06)), V((b.x, yp - 0.01, 0.52)), V((b.x, 0.13, 0.6)),
                            b + V((0, 0.0, 0.004))], 0.004, 'steel', segs=5, bend=0.03)
    P.tube('throttle', [(xp - 0.17, yp + 0.04, zp + 0.06), (xp - 0.2, yp + 0.08, zp + 0.12)], 0.006, 'steel', segs=5)
    # intake log (+Y, high) with an elbow for the air hose
    P.box('intake', (0.44, 0.06, 0.07), (-0.04, 0.165, 0.565), 'alu', bev=0.014, segs=2)
    P.tube('in_elbow', [(0.12, 0.17, 0.60), (0.13, 0.18, 0.67), (0.2, 0.19, 0.69)], 0.034, 'alu', segs=14, bend=0.05)
    P.tube('in_hose', [(0.2, 0.19, 0.69), (0.27, 0.19, 0.69)], 0.037, 'rubber', segs=14)
    for x in (0.215, 0.255):
        P.torus('clamp', 0.039, 0.0035, loc=(x, 0.19, 0.69), axis='X', segs=16, rsegs=4, material='steel')
    # exhaust (-Y): cast log, a pad on the collector for the turbo, outlet down
    yh = -0.13
    for x in xs:
        P.box('ex_flange', (0.07, 0.014, 0.05), (x, yh - 0.007, 0.56), 'rust', bev=0.005, segs=1)
        P.tube('ex_stub', [(x, yh - 0.012, 0.56), (x, -0.19, 0.555), (x * 0.85, -0.215, 0.53)], 0.026, 'rust', segs=10,
               bend=0.035)
        flange_bolts(P, [(x + 0.026, yh - 0.015, 0.56), (x - 0.026, yh - 0.015, 0.56)], (0, -1, 0), r=0.0065)
    P.tube('ex_log', [(-0.205, -0.215, 0.53), (0.13, -0.215, 0.53)], 0.032, 'rust', segs=14)
    P.sphere('ex_cap', 0.032, (0.13, -0.215, 0.53), 'rust', u=12, v=5)
    P.sphere('ex_cap', 0.032, (-0.205, -0.215, 0.53), 'rust', u=12, v=5)
    P.cyl('turbo_pad', 0.05, 0.016, (-0.04, -0.215, 0.568), 'rust', segs=16, bev=0.004, bsegs=1)
    P.tube('ex_out', [(-0.04, -0.22, 0.51), (-0.05, -0.23, 0.42), (-0.09, -0.23, 0.36)], 0.032, 'rust', segs=14,
           bend=0.05)
    P.cyl('ex_flange_out', 0.048, 0.012, (-0.095, -0.231, 0.352), 'rust', rot=(0, 35, 0), segs=16, bev=0.003, bsegs=1)
    P.empty('M_turbo', (-0.04, -0.215, 0.576))
    P.empty('M_exhaust_out', (-0.10, -0.232, 0.345), rot=(0, 125, 0))
    # front: timing case, crank pulley (two grooves), pump, alternator low on the left, fan
    P.box('timing', (0.04, 0.26, 0.42), (0.245, 0, 0.36), 'paint', bev=0.018, segs=2)
    flange_bolts(P, [(0.266, sg * 0.115, z) for z in (0.2, 0.36, 0.52) for sg in (-1, 1)], (1, 0, 0), r=0.0065)
    P.cyl('pump_body', 0.058, 0.05, (0.285, 0, 0.45), 'alu', axis='X', segs=18, bev=0.005, bsegs=2)
    pulley(P, 0.29, 0, zc, 0.085, 0.032, 'steel', grooves=2)
    pulley(P, 0.316, 0, 0.45, 0.06, 0.026, 'steel', grooves=1, hub=False)
    ya, za = 0.175, 0.27
    P.cyl('alt', 0.062, 0.1, (0.21, ya, za), 'alu', axis='X', segs=20, bev=0.006, bsegs=2)
    P.cyl('vac_pump', 0.045, 0.06, (0.13, ya, za), 'alu', axis='X', segs=16, bev=0.005, bsegs=1)
    P.tube('vac_hose', [(0.1, ya, za + 0.03), (0.06, ya + 0.02, za + 0.1), (0.0, ya - 0.02, 0.5)], 0.008, 'rubber',
           segs=6, bend=0.04)
    pulley(P, 0.307, ya, za, 0.036, 0.022, 'steel', grooves=1, hub=False, segs=18)
    belt(P, 0.307, [(0.0, zc, 0.087), (0.0, 0.45, 0.062), (ya, za, 0.038)], width=0.015, thick=0.008)
    fan(P, 0.345, 0, 0.45, 0.19, blades=6, hub_r=0.045, material='trim', pitch=28, chord=0.075)
    P.box('thermo', (0.06, 0.07, 0.06), (0.24, -0.03, 0.58), 'alu', bev=0.012, segs=2)
    P.tube('hose_up', [(0.26, -0.03, 0.585), (0.31, -0.035, 0.6), (0.36, -0.05, 0.59)], 0.023, 'rubber', segs=12,
           bend=0.04)
    P.torus('clamp', 0.025, 0.0035, loc=(0.285, -0.032, 0.594), axis='X', segs=16, rsegs=4, material='steel')
    P.tube('hose_lo', [(0.29, -0.05, 0.38), (0.32, -0.08, 0.34), (0.36, -0.1, 0.32)], 0.022, 'rubber', segs=12,
           bend=0.04)
    # oil filter, dipstick, breather, starter, rear plate, mounts
    P.cyl('filter', 0.05, 0.13, (0.06, -0.21, 0.27), 'paint_b', axis='Y', segs=18, bev=0.008, bsegs=2)
    P.cyl('filter_base', 0.042, 0.03, (0.06, -0.15, 0.27), 'alu', axis='Y', segs=14, bev=0.004, bsegs=1)
    P.tube('dipstick', [(-0.12, -0.15, 0.28), (-0.13, -0.17, 0.5), (-0.12, -0.16, 0.62)], 0.005, 'steel', segs=6,
           bend=0.08)
    P.torus('dip_ring', 0.017, 0.005, loc=(-0.12, -0.16, 0.64), rot=(0, 90, 0), segs=14, rsegs=6, material='paint_b')
    P.tube('breather', [(-0.26, 0.05, 0.672), (-0.30, 0.08, 0.62), (-0.31, 0.1, 0.45)], 0.012, 'rubber', segs=8,
           bend=0.04)
    starter(P, -0.22, -0.17, 0.15, length=0.17, r=0.05)
    rear_plate(P, -0.30, zc, 0.19, 0.19, nb=8)
    mounts(P, 0.05, 0.215, 0.24)
    P.views = [('a', 35, 22), ('b', 215, 22)]


# ------------------------------------------------------------------------------------------------ eng_v8


def build_eng_v8(P):
    """5.0 V8: painted block and heads, chrome valve covers and a big chrome air cleaner on a four-barrel,
    eight plug leads from the distributor at the back of the vee, twin exhaust logs."""
    P.ao_distance = 0.14
    zc = 0.18
    s45 = math.sin(math.radians(45))
    sump(P, -0.32, 0.27, 0.15, 0.11, -0.05, zshallow=0.05, bolts=6)
    P.box('crankcase', (0.62, 0.34, 0.17), (-0.03, 0, 0.20), 'paint', bev=0.012, segs=2)

    def bank(sg, d, size, material, bev=0.01, segs=2, name='bank', dx=0.0, across=0.0):
        """A box on a bank: d = distance along the bank axis from the crank, size = (x, across, along)."""
        ax = V((0, sg * s45, s45))
        acr = V((0, s45, -sg * s45)) * sg
        c = V((-0.03 + dx, 0, zc)) + ax * d + acr * across
        return P.box(name, size, tuple(c), material, rot=(-sg * 45, 0, 0), bev=bev, segs=segs)

    for sg in (-1, 1):
        bank(sg, 0.19, (0.58, 0.17, 0.22), 'paint', name='bank')
        bank(sg, 0.335, (0.56, 0.18, 0.07), 'paint', name='head')
        bank(sg, 0.375, (0.54, 0.185, 0.01), 'trim', bev=None, name='gasket')
        bank(sg, 0.405, (0.52, 0.145, 0.055), 'chrome', bev=0.022, segs=3, name='vcover')
        for dx in (-0.2, -0.07, 0.06, 0.19):
            bank(sg, 0.437, (0.014, 0.11, 0.014), 'chrome', bev=0.005, segs=1, name='vrib', dx=dx)
        ax = V((0, sg * s45, s45))
        acr = V((0, s45, -sg * s45)) * sg
        for dx in (-0.22, 0.0, 0.2):
            p = V((-0.03 + dx, 0, zc)) + ax * 0.385 + acr * 0.08
            P.bolt(tuple(p), normal=tuple(ax), r=0.0065, h=0.006, washer=False, material='chrome')
        p = V((0.17, 0, zc)) + ax * 0.44
        P.cyl('breather', 0.024, 0.026, tuple(p), 'chrome', rot=(-sg * 45, 0, 0), segs=14, bev=0.004, bsegs=1)
    # intake in the vee, four-barrel carb, the big chrome air cleaner
    P.box('intake', (0.44, 0.22, 0.10), (-0.03, 0, 0.45), 'alu', bev=0.022, segs=2)
    for sg in (-1, 1):
        for x in (-0.19, -0.08, 0.03, 0.14):
            P.box('runner', (0.05, 0.08, 0.04), (x, sg * 0.12, 0.44), 'alu', rot=(sg * 20, 0, 0), bev=0.012, segs=1)
    P.box('carb', (0.14, 0.14, 0.07), (-0.03, 0, 0.535), 'alu', bev=0.012, segs=2)
    xc, zc2 = -0.03, 0.572
    P.lathe('cleaner', [(0.0, 0.0), (0.15, 0.0), (0.168, 0.008), (0.172, 0.04), (0.168, 0.066), (0.16, 0.07)],
            loc=(xc, 0, zc2), material='chrome', segs=40, close='end', sharp=40.0)
    P.lathe('cleaner_lid', [(0.0, 0.088), (0.08, 0.085), (0.15, 0.078), (0.17, 0.072), (0.17, 0.066)][::-1],
            loc=(xc, 0, zc2), material='chrome', segs=40, close='start', sharp=40.0)
    P.lathe('filter_ring', [(0.158, 0.012), (0.163, 0.012), (0.163, 0.058), (0.158, 0.058)], loc=(xc, 0, zc2),
            material='trim', segs=40, loop=True, sharp=50.0)
    P.cyl('wing_base', 0.017, 0.012, (xc, 0, zc2 + 0.094), 'chrome', segs=12, bev=None)
    P.box('wing', (0.01, 0.075, 0.022), (xc, 0, zc2 + 0.106), 'chrome', bev=0.004, segs=1)
    # exhaust logs on the outer faces of the heads (rust), outlets down at the back
    for sg in (-1, 1):
        y = sg * 0.335
        for x in (-0.24, -0.11, 0.02, 0.15):
            P.tube('ex_stub', [(x, sg * 0.29, 0.39), (x, y, 0.36), (x * 0.9, y, 0.32)], 0.025, 'rust', segs=10,
                   bend=0.03)
        P.tube('ex_log', [(-0.25, y, 0.32), (0.16, y, 0.32)], 0.031, 'rust', segs=14)
        P.sphere('ex_cap', 0.031, (0.16, y, 0.32), 'rust', u=12, v=5)
        P.tube('ex_out', [(-0.25, y, 0.32), (-0.29, y, 0.31), (-0.31, y, 0.24)], 0.031, 'rust', segs=14, bend=0.04)
        P.cyl('ex_flange_out', 0.046, 0.012, (-0.312, y, 0.228), 'rust', segs=16, bev=0.003, bsegs=1)
    P.empty('M_exhaust_out', (-0.312, -0.335, 0.22), rot=(0, 90, 0))
    P.empty('M_exhaust_out2', (-0.312, 0.335, 0.22), rot=(0, 90, 0))
    P.cyl('turbo_pad', 0.045, 0.014, (0.06, -0.372, 0.312), 'rust', axis=(0, -0.7, 0.7), segs=16, bev=0.003, bsegs=1)
    P.empty('M_turbo', (0.06, -0.378, 0.318), rot=(45, 0, 0))
    # distributor at the back of the vee and eight leads
    xd, zd = -0.33, 0.47
    P.cyl('dist_body', 0.03, 0.14, (xd, 0, zd - 0.03), 'alu', segs=14, bev=0.004, bsegs=1)
    P.lathe('dist_cap', [(0.0, 0.0), (0.055, 0.0), (0.058, 0.025), (0.05, 0.05), (0.0, 0.056)],
            loc=(xd, 0, zd + 0.04), material='trim', segs=20, sharp=40)
    for sg in (-1, 1):
        for i, x in enumerate((-0.24, -0.11, 0.02, 0.15)):
            a = math.radians(30 + i * 35)
            top = (xd + math.cos(a) * 0.03, sg * math.sin(a) * 0.04, zd + 0.10)
            plug = (x + 0.03, sg * 0.30, 0.42)
            plug_lead(P, top, plug, lift=0.055, r=0.0055, material='paint_b')
            P.cyl('boot', 0.011, 0.035, plug, 'rubber', rot=(sg * 50, 0, 0), segs=8, bev=None)
    # front: timing cover, damper, big water pump, fan, alternator high on the right, belt
    P.box('timing', (0.03, 0.22, 0.25), (0.285, 0, 0.26), 'paint', bev=0.014, segs=2)
    P.box('pump_body', (0.07, 0.24, 0.12), (0.31, 0, 0.36), 'paint', bev=0.024, segs=2)
    for sg in (-1, 1):
        P.cyl('pump_neck', 0.022, 0.05, (0.33, sg * 0.1, 0.32), 'alu', axis='X', segs=12, bev=0.003, bsegs=1)
        P.tube('hose_lo', [(0.35, sg * 0.1, 0.32), (0.38, sg * 0.12, 0.30)], 0.025, 'rubber', segs=12)
    pulley(P, 0.315, 0, zc, 0.095, 0.04, 'steel', grooves=2)
    pulley(P, 0.36, 0, 0.36, 0.07, 0.03, 'steel', grooves=2, hub=False)
    ya, za = -0.21, 0.47
    P.cyl('alt', 0.064, 0.1, (0.27, ya, za), 'alu', axis='X', segs=20, bev=0.006, bsegs=2)
    pulley(P, 0.35, ya, za, 0.038, 0.03, 'steel', grooves=1, hub=False, segs=18)
    P.box('alt_brk', (0.04, 0.08, 0.04), (0.28, -0.15, 0.42), 'steel', bev=0.006, segs=1)
    belt(P, 0.352, [(0.0, zc, 0.097), (ya, za, 0.04), (0.0, 0.36, 0.072)][::-1], width=0.017, thick=0.009)
    fan(P, 0.395, 0, 0.36, 0.19, blades=5, hub_r=0.05, material='steel', pitch=26, chord=0.09)
    P.cyl('fan_clutch', 0.055, 0.03, (0.375, 0, 0.36), 'alu', axis='X', segs=18, bev=0.005, bsegs=1)
    P.box('thermo', (0.06, 0.06, 0.06), (0.27, 0, 0.46), 'alu', bev=0.012, segs=2)
    P.tube('hose_up', [(0.29, 0, 0.47), (0.34, 0, 0.5), (0.40, 0, 0.5)], 0.025, 'rubber', segs=12, bend=0.04)
    # oil filter, fuel pump, dipstick, starter, rear plate, mounts
    P.cyl('filter', 0.048, 0.12, (0.02, -0.235, 0.17), 'paint_b', axis='Y', segs=18, bev=0.008, bsegs=2)
    P.box('fuel_pump', (0.07, 0.06, 0.07), (0.2, 0.2, 0.2), 'alu', bev=0.014, segs=2)
    P.tube('fuel_line', [(0.2, 0.2, 0.24), (0.15, 0.15, 0.5), (0.0, 0.06, 0.53)], 0.005, 'steel', segs=6, bend=0.06)
    P.tube('dipstick', [(-0.15, 0.17, 0.2), (-0.17, 0.2, 0.45), (-0.16, 0.22, 0.56)], 0.005, 'steel', segs=6,
           bend=0.08)
    P.torus('dip_ring', 0.017, 0.005, loc=(-0.16, 0.22, 0.58), rot=(0, 90, 0), segs=14, rsegs=6, material='paint_b')
    starter(P, -0.24, 0.17, 0.12, length=0.16, r=0.05)
    rear_plate(P, -0.34, zc, 0.19, 0.19, nb=10)
    mounts(P, 0.1, 0.205, 0.22)
    P.views = [('a', 35, 24), ('b', 215, 24)]


# ------------------------------------------------------------------------------------------------ eng_mower


def build_eng_mower(P):
    """A lawnmower single: vertical crankshaft, alloy crankcase with a mounting flange, finned cylinder lying
    towards +X, red shroud with a recoil starter and T-handle, plastic fuel tank, air filter box, muffler."""
    P.ao_distance = 0.06
    # mounting flange (three ears) and the vertical output shaft under it
    poly = []
    for i in range(3):
        a = math.tau * i / 3 + math.radians(90)
        poly.append((0.15 * math.cos(a - 0.35), 0.15 * math.sin(a - 0.35)))
        poly.append((0.15 * math.cos(a + 0.35), 0.15 * math.sin(a + 0.35)))
        poly.append((0.11 * math.cos(a + math.pi / 3), 0.11 * math.sin(a + math.pi / 3)))
    P.prism('flange', poly, 0.018, (0, 0, 0.009), 'alu', bev=0.005, segs=2)
    for i in range(3):
        a = math.tau * i / 3 + math.radians(90)
        P.bolt((0.13 * math.cos(a), 0.13 * math.sin(a), 0.018), r=0.009, h=0.008)
    P.cyl('shaft', 0.013, 0.07, (0, 0, -0.03), 'steel', segs=12, bev=0.002, bsegs=1)
    P.box('key', (0.005, 0.007, 0.04), (0.013, 0, -0.04), 'steel', bev=None)
    # crankcase with ribs
    P.lathe('case', [(0.0, 0.018), (0.12, 0.018), (0.128, 0.03), (0.125, 0.10), (0.11, 0.125), (0.0, 0.125)],
            material='alu', segs=24, sharp=40.0)
    for i in range(8):
        a = math.tau * i / 8
        P.box('case_rib', (0.014, 0.012, 0.08), (0.127 * math.cos(a), 0.127 * math.sin(a), 0.07), 'alu',
              rot=(0, 0, math.degrees(a)), bev=0.003, segs=1)
    # the cylinder towards +X with fins, the head and spark plug
    zc = 0.085
    P.cyl('barrel', 0.045, 0.12, (0.15, 0, zc), 'alu', axis='X', segs=16, bev=None)
    for i in range(7):
        x = 0.105 + i * 0.015
        P.box('fin', (0.005, 0.12, 0.11), (x, 0, zc), 'alu', bev=0.004, segs=1)
    P.box('head', (0.035, 0.1, 0.1), (0.225, 0, zc), 'alu', bev=0.014, segs=2)
    for i in range(3):
        P.box('head_fin', (0.03, 0.005, 0.09), (0.225, -0.03 + i * 0.03, zc + 0.02), 'alu', bev=0.002, segs=1)
    P.cyl('plug', 0.009, 0.03, (0.255, 0, zc + 0.02), 'chrome', axis='X', segs=8, bev=None)
    P.cyl('plug_boot', 0.012, 0.035, (0.28, 0, zc + 0.02), 'trim', axis='X', segs=10, bev=0.003, bsegs=1)
    P.tube('plug_wire', [(0.295, 0, zc + 0.02), (0.30, 0.02, zc + 0.08), (0.24, 0.05, 0.2)], 0.005, 'trim', segs=6,
           bend=0.03)
    # the red shroud over the flywheel and the cylinder, with the recoil starter on top
    bm = bmesh.new()
    K.bm_cube(bm, (0.30, 0.27, 0.16), mat4((0.01, 0, 0.225)))
    for v in bm.verts:
        if v.co.x > 0.1:
            v.co.z = 0.225 + (v.co.z - 0.225) * (0.55 if v.co.z < 0.225 else 0.85)
            v.co.y *= 0.82
    P.mesh('shroud', bm, 'paint', bev=0.04, segs=3)
    P.lathe('recoil', [(0.0, 0.335), (0.06, 0.333), (0.085, 0.325), (0.095, 0.31), (0.095, 0.29)][::-1],
            loc=(-0.02, 0, 0), material='paint', segs=28, close='start', sharp=40.0)
    for i in range(8):
        a = math.tau * i / 8
        P.box('vent', (0.045, 0.009, 0.006), (-0.02 + 0.055 * math.cos(a), 0.055 * math.sin(a), 0.334), 'trim',
              rot=(0, 0, math.degrees(a)), bev=None, open='-z')
    # the pull rope and the T-handle resting on the front of the shroud
    P.tube('rope', [(-0.02, 0.09, 0.30), (0.06, 0.10, 0.315), (0.12, 0.08, 0.31)], 0.004, 'paint_b', segs=5,
           bend=0.03)
    P.cyl('handle', 0.013, 0.09, (0.135, 0.08, 0.31), 'trim', axis='Y', segs=10, bev=0.004, bsegs=1)
    # fuel tank at the back with its cap, air filter box on the left, muffler on the right
    P.pillow('tank', (0.11, 0.2, 0.09), (-0.175, 0, 0.21), 'paint_b', r=0.025, sub=1)
    P.cyl('tank_cap', 0.025, 0.02, (-0.19, 0.05, 0.265), 'trim', segs=12, bev=0.005, bsegs=1)
    P.box('filter_box', (0.11, 0.05, 0.10), (0.02, 0.16, 0.15), 'trim', bev=0.016, segs=2)
    P.cyl('filter_knob', 0.017, 0.018, (0.02, 0.192, 0.15), 'trim', axis='Y', segs=10, bev=0.004, bsegs=1)
    P.box('muffler', (0.09, 0.05, 0.06), (0.17, -0.11, 0.08), 'rust', bev=0.014, segs=2)
    P.box('heat_shield', (0.11, 0.007, 0.08), (0.17, -0.142, 0.08), 'steel', bev=0.003, segs=1)
    for i in range(4):
        P.box('shield_slot', (0.07, 0.004, 0.007), (0.17, -0.146, 0.055 + i * 0.016), 'trim', bev=None)
    P.tube('muffler_out', [(0.17, -0.12, 0.05), (0.17, -0.13, 0.025)], 0.01, 'rust', segs=8)
    P.empty('M_exhaust_out', (0.17, -0.13, 0.018), rot=(0, 90, 0))
    # throttle lever and cable
    P.box('throttle', (0.05, 0.012, 0.014), (-0.08, 0.14, 0.13), 'steel', rot=(0, 0, 20), bev=0.003, segs=1)
    P.tube('cable', [(-0.1, 0.15, 0.13), (-0.16, 0.16, 0.10), (-0.2, 0.14, 0.05)], 0.0035, 'trim', segs=5, bend=0.03)
    P.views = [('a', 35, 24), ('b', 215, 24)]


# ------------------------------------------------------------------------------------------------ turbo


def volute(P, R0, R1, r0, r1, material, outlet_len, name, turns=0.9, start=0.0, segs=18):
    """A snail housing round an axis along Y (local origin on the axis): a swept tube whose path spirals from
    R0 to R1 while its section grows from r0 to r1, then runs off tangentially for outlet_len."""
    path = []
    for i in range(segs + 1):
        t = i / segs
        a = start + turns * math.tau * t
        R = R0 + (R1 - R0) * t
        path.append(V((R * math.cos(a), 0.0, R * math.sin(a))))
    a = start + turns * math.tau
    tg = V((-math.sin(a), 0, math.cos(a)))
    end = path[-1]
    for k in (1, 2):
        path.append(end + tg * outlet_len * k / 2)

    def rf(t):
        return (r0 + (r1 - r0) * min(1.0, t * 1.15)) / r1

    return P.tube(name, path, r1, material, segs=10, caps=True, radius_fn=rf, bend=0.0)


def build_turbo_small(P):
    """A small turbocharger: cast turbine snail (inlet flange at the origin, facing down), centre housing
    with oil lines, alloy compressor snail, wastegate can. Shaft along Y."""
    P.ao_distance = 0.05
    zc = 0.085  # shaft height above the inlet flange
    P.box('flange', (0.075, 0.06, 0.012), (0.0, 0.0, 0.006), 'rust', bev=0.004, segs=1)
    P.bolts([(sx * 0.028, sy * 0.021, 0.012) for sx in (-1, 1) for sy in (-1, 1)], normal=(0, 0, 1), r=0.006, h=0.005,
            washer=False, material='steel')
    P.box('throat', (0.05, 0.045, 0.04), (0.0, 0.0, 0.03), 'rust', bev=0.01, segs=2)
    yt = -0.035
    P.lathe('turbine_core', [(0.0, -0.03), (0.045, -0.03), (0.052, -0.012), (0.052, 0.012), (0.045, 0.03),
                             (0.0, 0.03)], loc=(0, yt, zc), material='rust', axis='Y', segs=20, sharp=40.0)
    tv = volute(P, 0.05, 0.062, 0.016, 0.03, 'rust', 0.03, 'turbine_snail', turns=0.85, start=math.radians(-90))
    tv.data.transform(Matrix.Translation((0, yt, zc)))
    P.cyl('t_out', 0.032, 0.03, (0, yt - 0.045, zc), 'rust', axis='Y', segs=16, bev=0.004, bsegs=1)
    P.cyl('t_out_flange', 0.042, 0.01, (0, yt - 0.064, zc), 'rust', axis='Y', segs=16, bev=0.003, bsegs=1)
    P.cyl('chra', 0.03, 0.05, (0, 0.012, zc), 'steel', axis='Y', segs=16, bev=0.005, bsegs=2)
    P.tube('oil_feed', [(0, 0.012, zc + 0.03), (0.0, 0.015, zc + 0.07), (0.05, 0.02, zc + 0.1)], 0.004, 'steel',
           segs=6, bend=0.02)
    P.tube('oil_drain', [(0, 0.012, zc - 0.03), (0.0, 0.015, zc - 0.06), (0.04, 0.02, zc - 0.08)], 0.009, 'rubber',
           segs=8, bend=0.02)
    yc = 0.06
    P.lathe('comp_core', [(0.0, -0.025), (0.05, -0.025), (0.058, -0.008), (0.058, 0.01), (0.05, 0.022),
                          (0.0, 0.022)], loc=(0, yc, zc), material='alu', axis='Y', segs=22, sharp=40.0)
    cv = volute(P, 0.055, 0.068, 0.014, 0.027, 'alu', 0.05, 'comp_snail', turns=0.85, start=math.radians(90))
    cv.data.transform(Matrix.Translation((0, yc, zc)))
    P.lathe('comp_in', [(0.034, 0.0), (0.04, 0.0), (0.04, 0.05), (0.043, 0.055), (0.043, 0.065), (0.036, 0.065)],
            loc=(0, yc + 0.02, zc), material='alu', axis='Y', segs=20, sharp=40.0)
    P.lathe('wheel', [(0.0, 0.03), (0.012, 0.028), (0.03, 0.005), (0.032, 0.0)][::-1], loc=(0, yc + 0.02, zc),
            material='steel', axis='Y', segs=14, close='start', sharp=40.0)
    P.cyl('wg_can', 0.028, 0.035, (0.07, yc - 0.005, zc + 0.02), 'alu', axis='Y', segs=16, bev=0.005, bsegs=2)
    P.box('wg_brk', (0.03, 0.05, 0.008), (0.06, 0.03, zc + 0.02), 'steel', bev=0.002, segs=1)
    P.tube('wg_rod', [(0.07, yc - 0.03, zc + 0.02), (0.065, yt + 0.0, zc + 0.03)], 0.0035, 'steel', segs=5)
    P.tube('wg_hose', [(0.07, yc + 0.015, zc + 0.04), (0.04, yc + 0.03, zc + 0.08), (0.0, yc + 0.02, zc + 0.1)],
           0.0045, 'rubber', segs=5, bend=0.02)
    P.views = [('a', 35, 20), ('b', 215, 20)]


# ------------------------------------------------------------------------------------------------ eng_single


def finned_barrel(P, base, axis, r, length, fin_w, fin_d, n, fin_t=0.004, material='alu', head=False):
    """An air-cooled cylinder (or head) along `axis` from `base`: a core with n square fins with round
    corners (fin_w across X-ish, fin_d across Y)."""
    ax = V(axis).normalized()
    m0 = K.frame_from_z(ax, (1, 0, 0))
    P.cyl('barrel', r, length, tuple(V(base) + ax * length / 2), material, rot=None, axis=ax, segs=14, bev=None)
    bm = bmesh.new()
    for i in range(n):
        t = (i + 0.5) / n
        c = V(base) + ax * (length * t)
        poly = K.rounded_rect(fin_w * (1.06 if head and i == n - 1 else 1.0), fin_d, min(fin_w, fin_d) * 0.22, seg=2)
        m = Matrix.Translation(c) @ m0
        K.bm_prism(bm, poly, fin_t, matrix=m)
    P.mesh('fins', bm, material, bev=0.0012 if n <= 7 else None, segs=1, sharp=50.0)


def build_eng_single(P):
    """A 250 cc air-cooled single (the motorcycle's): egg-shaped alloy cases with round side covers, a finned
    barrel leaning forward, finned head with rocker caps, the plug lead, exhaust port, carb and filter pod,
    kick-starter, external oil line, mounting lugs."""
    P.ao_distance = 0.06
    # crankcase: a rounded outline in XZ extruded across Y
    outline = [(-0.17, 0.05), (-0.14, 0.01), (-0.06, 0.0), (0.06, 0.0), (0.12, 0.03), (0.14, 0.09), (0.12, 0.17),
               (0.07, 0.215), (0.0, 0.225), (-0.09, 0.21), (-0.15, 0.16), (-0.175, 0.10)]
    P.prism('case', outline, 0.17, matrix=mat4((0, 0, 0), (90, 0, 0)), material='alu', bev=0.012, segs=2)
    P.box('case_seam', (0.30, 0.006, 0.20), (-0.02, 0.0, 0.11), 'alu', bev=0.002, segs=1)
    seam = [(-0.15, 0.03), (-0.155, 0.13), (-0.08, 0.2), (0.06, 0.205), (0.12, 0.13), (0.11, 0.03), (0.0, 0.004)]
    P.bolts([(x, -0.088, z) for (x, z) in seam[:2]] + [(x, 0.088, z) for (x, z) in seam[4:6]],
            normal=[(0, -1, 0)] * 2 + [(0, 1, 0)] * 2, r=0.0045, h=0.004, washer=False)
    # generator cover (left, +Y) and clutch cover (right, -Y)
    P.lathe('gen_cover', [(0.0, 0.03), (0.04, 0.028), (0.066, 0.016), (0.076, 0.0)][::-1], loc=(-0.03, 0.085, 0.10),
            material='chrome', axis='Y', segs=24, close='start', sharp=40.0)
    P.lathe('clutch_cover', [(0.0, -0.034), (0.05, -0.032), (0.078, -0.018), (0.088, 0.0)],
            loc=(-0.06, -0.085, 0.10), material='chrome', axis='Y', segs=24, close='end', sharp=40.0)
    P.cyl('points_cover', 0.03, 0.012, (0.07, -0.088, 0.12), 'chrome', axis='Y', segs=16, bev=0.002, bsegs=1)
    for i in range(6):
        a = math.tau * i / 6
        P.bolt((-0.06 + 0.076 * math.cos(a), -0.105, 0.10 + 0.076 * math.sin(a)), normal=(0, -1, 0), r=0.0045,
               h=0.004, washer=False)
        P.bolt((-0.03 + 0.066 * math.cos(a), 0.1, 0.10 + 0.066 * math.sin(a)), normal=(0, 1, 0), r=0.0045, h=0.004,
               washer=False)
    # barrel and head, leaning forward 12 deg
    lean = math.radians(12)
    ax = V((math.sin(lean), 0, math.cos(lean)))
    base = V((0.03, 0, 0.215))
    finned_barrel(P, base, ax, 0.036, 0.13, 0.15, 0.13, 7, material='steel')
    hb = base + ax * 0.13
    finned_barrel(P, hb, ax, 0.042, 0.08, 0.17, 0.15, 4, fin_t=0.005, head=True)
    top = hb + ax * 0.08
    for sy in (-1, 1):
        P.cyl('rocker_cap', 0.022, 0.016, tuple(top + V((0, sy * 0.035, 0.004))), 'chrome', axis=ax, segs=14,
              bev=0.003, bsegs=1)
    # plug on the right, its lead
    pl = hb + ax * 0.045 + V((0.0, -0.075, 0.0))
    P.cyl('plug_cap', 0.012, 0.04, tuple(pl + V((0, -0.015, 0))), 'trim', axis='-Y', segs=10, bev=0.003, bsegs=1)
    P.tube('plug_lead', [pl + V((0, -0.035, 0)), pl + V((-0.04, -0.06, 0.0)), V((-0.13, -0.065, 0.33))], 0.005,
           'trim', segs=6, bend=0.03)
    # exhaust port at the front with a short stub and flange
    port = hb + ax * 0.04 + V((0.085, 0, 0))
    P.cyl('ex_flange', 0.03, 0.012, tuple(port), 'chrome', axis='X', segs=14, bev=0.002, bsegs=1)
    P.tube('ex_stub', [port, port + V((0.04, 0, -0.01)), port + V((0.07, 0, -0.05))], 0.022, 'chrome', segs=12,
           bend=0.03)
    P.empty('M_exhaust_out', tuple(port + V((0.075, 0, -0.06))), rot=(0, 55, 0))
    # carburettor and filter pod at the back
    cb = hb + ax * 0.03 + V((-0.11, 0, 0))
    P.cyl('carb', 0.025, 0.06, tuple(cb), 'alu', axis='X', segs=12, bev=0.003, bsegs=1)
    P.cyl('float_bowl', 0.022, 0.03, tuple(cb + V((0, 0, -0.035))), 'alu', segs=12, bev=0.003, bsegs=1)
    P.lathe('pod', [(0.0, -0.07), (0.03, -0.068), (0.045, -0.05), (0.048, -0.02), (0.035, 0.0)],
            loc=tuple(cb + V((-0.05, 0, 0.0))), material='trim', axis='X', segs=16, close='end', sharp=40.0)
    P.tube('throttle_cable', [cb + V((0, 0, 0.025)), cb + V((-0.01, 0.0, 0.06)), cb + V((-0.06, 0.03, 0.07))],
           0.003, 'trim', segs=5, bend=0.02)
    # kick-starter (right side, at the back of the clutch cover)
    P.tube('kick_arm', [(-0.12, -0.13, 0.12), (-0.17, -0.135, 0.06), (-0.19, -0.14, 0.04)], 0.008, 'chrome', segs=8,
           bend=0.03)
    P.cyl('kick_peg', 0.012, 0.05, (-0.195, -0.165, 0.04), 'rubber', axis='Y', segs=10, bev=0.003, bsegs=1)
    # external oil line from the case to the head
    P.tube('oil_line', [(-0.06, 0.05, 0.215), (-0.07, 0.06, 0.30), (-0.03, 0.06, 0.39)], 0.004, 'steel', segs=6,
           bend=0.04)
    # mounting lugs
    for (x, z) in ((0.125, 0.06), (-0.16, 0.18)):
        P.box('lug', (0.04, 0.12, 0.03), (x, 0.0, z), 'alu', bev=0.006, segs=1)
        P.cyl('lug_bolt', 0.008, 0.14, (x, 0.0, z), 'steel', axis='Y', segs=8, bev=None)
    P.cyl('sump_plug', 0.012, 0.012, (-0.04, 0.0, -0.004), 'steel', segs=6, bev=None)
    P.views = [('a', 35, 18), ('b', 215, 18)]


# ------------------------------------------------------------------------------------------------ eng_d6


def build_eng_d6(P):
    """6.0 L straight-six diesel (the motorhome's): tall painted block with ribs, two alloy rocker covers,
    inline pump with six injector lines, a long exhaust log with a turbo pad, air compressor, oil cooler,
    a big fan, alternator, flywheel housing."""
    P.ao_distance = 0.16
    n = 6
    pitch = 0.13
    L = n * pitch + 0.10
    x0 = -L / 2 - 0.02
    xs = [x0 + 0.05 + pitch * (i + 0.5) for i in range(n)]
    zc = 0.24
    sump(P, x0 - 0.01, x0 + L - 0.04, 0.16, 0.18, x0 + L * 0.45, zshallow=0.07, bolts=7)
    P.box('skirt', (L, 0.36, 0.12), (x0 + L / 2, 0, 0.245), 'paint', bev=0.014, segs=2)
    bm = bmesh.new()
    K.bm_cube(bm, (L, 0.32, 0.34), mat4((x0 + L / 2, 0, 0.475)))
    for v in bm.verts:
        if v.co.z < 0.45:
            v.co.y *= 1.08
    P.mesh('block', bm, 'paint', bev=0.016, segs=2)
    for sg in (-1, 1):
        for x in xs[::1]:
            P.box('rib', (0.024, 0.016, 0.28), (x - pitch / 2 + 0.01, sg * 0.163, 0.46), 'paint', bev=0.005, segs=1,
                  open='-y' if sg > 0 else '+y')
        for x in xs[1::2]:
            P.cyl('plug', 0.024, 0.01, (x, sg * 0.166, 0.52), 'alu', axis='Y', segs=12, bev=None)
    P.box('gasket', (L - 0.02, 0.32, 0.008), (x0 + L / 2, 0, 0.648), 'trim', bev=None)
    P.box('head', (L - 0.02, 0.31, 0.11), (x0 + L / 2, 0, 0.707), 'paint', bev=0.014, segs=2)
    for k in range(2):
        cx = x0 + L / 4 + k * L / 2
        P.box('cover', (L / 2 - 0.04, 0.25, 0.08), (cx, 0, 0.80), 'alu', bev=0.026, segs=3)
        for y in (-0.08, -0.04, 0.0, 0.04, 0.08):
            P.box('cover_fin', (L / 2 - 0.12, 0.011, 0.02), (cx, y, 0.845), 'alu', bev=0.004, segs=1, open='-z')
        P.cyl('filler', 0.03, 0.024, (cx + L / 8, 0.0, 0.852), 'trim', segs=14, bev=0.004, bsegs=2)
        flange_bolts(P, [(cx + dx, sg * 0.132, 0.765) for dx in (-L / 6, 0.0, L / 6) for sg in (-1, 1)], (0, 0, 1),
                     r=0.0075)
    lift_eye(P, x0 + L - 0.08, -0.14, 0.79)
    lift_eye(P, x0 + 0.08, 0.14, 0.79)
    # injectors along +Y and the inline pump with its six lines
    inj = []
    for x in xs:
        p = V((x, 0.112, 0.77))
        P.cyl('injector', 0.015, 0.07, tuple(p + V((0, 0, 0.015))), 'alu', segs=10, bev=0.002, bsegs=1)
        P.cyl('inj_nut', 0.017, 0.014, tuple(p + V((0, 0, 0.055))), 'steel', segs=6, bev=None)
        inj.append(p + V((0, 0, 0.063)))
    P.tube('return', [q + V((0, 0, 0.014)) for q in inj], 0.005, 'rubber', segs=6, bend=0.02)
    xp, yp, zp = x0 + L * 0.55, 0.24, 0.43
    P.box('pump', (0.42, 0.10, 0.12), (xp, yp, zp), 'alu', bev=0.014, segs=2)
    P.box('governor', (0.10, 0.11, 0.15), (xp - 0.26, yp, zp + 0.01), 'alu', bev=0.016, segs=2)
    for i, b in enumerate(inj):
        a = V((xp - 0.17 + 0.068 * i, yp - 0.01, zp + 0.075))
        P.cyl('delivery', 0.01, 0.024, tuple(a), 'steel', segs=6, bev=None)
        P.tube('inj_line', [a + V((0, 0, 0.012)), a + V((0, 0, 0.08)), V((b.x, yp - 0.02, 0.66)),
                            V((b.x, 0.15, 0.75)), b + V((0, 0, 0.005))], 0.0045, 'steel', segs=5, bend=0.035)
    # intake: a long log with a big elbow
    P.box('intake', (L - 0.1, 0.07, 0.08), (x0 + L / 2, 0.19, 0.70), 'alu', bev=0.016, segs=2)
    P.tube('in_elbow', [(x0 + L - 0.15, 0.2, 0.74), (x0 + L - 0.13, 0.21, 0.86), (x0 + L - 0.02, 0.22, 0.88)],
           0.045, 'alu', segs=14, bend=0.06)
    # exhaust log (-Y) with a pad for the turbo and the outlet
    for x in xs:
        P.box('ex_flange', (0.08, 0.016, 0.06), (x, -0.163, 0.70), 'rust', bev=0.006, segs=1)
        P.tube('ex_stub', [(x, -0.17, 0.70), (x, -0.23, 0.695), (x, -0.255, 0.67)], 0.03, 'rust', segs=10, bend=0.035)
    P.tube('ex_log', [(xs[0] - 0.03, -0.255, 0.67), (xs[-1] + 0.03, -0.255, 0.67)], 0.04, 'rust', segs=16)
    for x in (xs[0] - 0.03, xs[-1] + 0.03):
        P.sphere('ex_cap', 0.04, (x, -0.255, 0.67), 'rust', u=14, v=6)
    xm = (xs[2] + xs[3]) / 2
    P.cyl('turbo_pad', 0.06, 0.02, (xm, -0.255, 0.718), 'rust', segs=16, bev=0.004, bsegs=1)
    P.empty('M_turbo', (xm, -0.255, 0.728))
    P.tube('ex_out', [(xm - 0.05, -0.26, 0.64), (xm - 0.07, -0.27, 0.52), (xm - 0.12, -0.27, 0.45)], 0.04, 'rust',
           segs=14, bend=0.06)
    P.cyl('ex_flange_out', 0.058, 0.014, (xm - 0.126, -0.271, 0.44), 'rust', rot=(0, 35, 0), segs=16, bev=0.003,
          bsegs=1)
    P.empty('M_exhaust_out', (xm - 0.13, -0.272, 0.43), rot=(0, 125, 0))
    # front: timing case, damper, pump, fan, alternator, belt
    xf = x0 + L
    P.box('timing', (0.05, 0.32, 0.56), (xf + 0.02, 0, 0.47), 'paint', bev=0.02, segs=2)
    P.cyl('pump_body', 0.07, 0.06, (xf + 0.07, 0, 0.6), 'alu', axis='X', segs=18, bev=0.005, bsegs=2)
    pulley(P, xf + 0.08, 0, zc, 0.11, 0.04, 'steel', grooves=2)
    pulley(P, xf + 0.11, 0, 0.6, 0.075, 0.03, 'steel', grooves=2, hub=False)
    ya, za = -0.21, 0.43
    P.cyl('alt', 0.07, 0.11, (xf - 0.02, ya, za), 'alu', axis='X', segs=20, bev=0.006, bsegs=2)
    pulley(P, xf + 0.10, ya, za, 0.042, 0.03, 'steel', grooves=1, hub=False, segs=18)
    belt(P, xf + 0.10, [(0.0, zc, 0.112), (0.0, 0.6, 0.077), (ya, za, 0.044)], width=0.018, thick=0.009)
    fan(P, xf + 0.15, 0, 0.6, 0.27, blades=7, hub_r=0.06, material='trim', pitch=28, chord=0.1)
    P.box('thermo', (0.08, 0.08, 0.07), (xf - 0.03, -0.04, 0.72), 'alu', bev=0.014, segs=2)
    P.tube('hose_up', [(xf - 0.0, -0.04, 0.725), (xf + 0.08, -0.05, 0.75), (xf + 0.16, -0.07, 0.74)], 0.028,
           'rubber', segs=12, bend=0.05)
    # air compressor (brakes) and oil cooler on the left, filter on the right
    P.cyl('compressor', 0.07, 0.16, (xs[1], 0.25, 0.30), 'paint', axis='X', segs=18, bev=0.006, bsegs=2)
    finned_barrel(P, V((xs[1], 0.25, 0.35)), (0, 0, 1), 0.045, 0.08, 0.1, 0.1, 5, fin_t=0.005)
    P.box('oil_cooler', (0.26, 0.05, 0.12), (xs[3], -0.2, 0.36), 'alu', bev=0.01, segs=2)
    for i in range(8):
        P.box('cooler_fin', (0.24, 0.056, 0.004), (xs[3], -0.2, 0.31 + i * 0.014), 'alu', bev=None)
    P.cyl('filter', 0.06, 0.18, (xs[4], -0.27, 0.36), 'paint_b', axis='Y', segs=18, bev=0.008, bsegs=2)
    P.tube('dipstick', [(xs[2], -0.17, 0.36), (xs[2] - 0.01, -0.2, 0.62), (xs[2], -0.19, 0.78)], 0.006, 'steel',
           segs=6, bend=0.1)
    P.torus('dip_ring', 0.02, 0.006, loc=(xs[2], -0.19, 0.8), rot=(0, 90, 0), segs=14, rsegs=6, material='paint_b')
    starter(P, x0 + 0.1, -0.2, 0.2, length=0.22, r=0.065)
    rear_plate(P, x0 - 0.005, zc, 0.26, 0.26, nb=12)
    mounts(P, xf - 0.12, 0.25, 0.28)
    mounts(P, x0 + 0.12, 0.25, 0.28)
    P.views = [('a', 35, 20), ('b', 215, 20)]


# ------------------------------------------------------------------------------------------------ eng_2t


def expansion_stub(P, port, ax, length=0.2, r0=0.02, r1=0.046, material='steel', name='chamber'):
    """The start of a two-stroke expansion chamber: a header that bends down and swells into a cone."""
    port = V(port)
    ax = V(ax).normalized()
    pts = [port, port + ax * 0.04, port + ax * 0.08 + V((0, 0, -0.05)), port + ax * 0.11 + V((0.05, 0, -0.12)),
           port + ax * 0.12 + V((0.12, 0, -0.15))]
    path = K.fillet_path(pts, 0.04)
    return P.tube(name, path, r1, material, segs=14, bend=0.0, caps=True,
                  radius_fn=lambda t: (r0 + (r1 - r0) * max(0.0, (t - 0.35) / 0.65) ** 1.4) / r1)


def build_eng_2t(P):
    """Two-stroke twin: wide alloy cases, two finned barrels leaning forward with round-finned heads,
    expansion-chamber stubs swelling out of the front ports, twin carbs with chrome velocity stacks."""
    P.ao_distance = 0.07
    outline = [(-0.18, 0.05), (-0.15, 0.01), (-0.05, 0.0), (0.08, 0.0), (0.14, 0.04), (0.15, 0.12), (0.10, 0.19),
               (0.0, 0.205), (-0.12, 0.19), (-0.18, 0.12)]
    P.prism('case', outline, 0.30, matrix=mat4((0, 0, 0), (90, 0, 0)), material='alu', bev=0.014, segs=2)
    P.box('case_seam', (0.32, 0.31, 0.006), (-0.015, 0.0, 0.105), 'alu', bev=0.002, segs=1)
    P.lathe('mag_cover', [(0.0, 0.035), (0.05, 0.032), (0.075, 0.018), (0.082, 0.0)][::-1], loc=(-0.05, 0.15, 0.1),
            material='chrome', axis='Y', segs=24, close='start', sharp=40.0)
    P.lathe('clutch_cover', [(0.0, -0.035), (0.05, -0.032), (0.08, -0.018), (0.088, 0.0)], loc=(-0.07, -0.15, 0.1),
            material='chrome', axis='Y', segs=24, close='end', sharp=40.0)
    lean = math.radians(20)
    ax = V((math.sin(lean), 0, math.cos(lean)))
    ports = []
    for sy in (-1, 1):
        base = V((0.03, sy * 0.068, 0.2))
        finned_barrel(P, base, ax, 0.034, 0.12, 0.12, 0.115, 7, material='steel')
        hb = base + ax * 0.12
        finned_barrel(P, hb, ax, 0.04, 0.06, 0.13, 0.13, 4, fin_t=0.0045, head=True)
        top = hb + ax * 0.06
        P.cyl('plug', 0.009, 0.02, tuple(top + ax * 0.008), 'chrome', axis=ax, segs=8, bev=None)
        P.cyl('plug_cap', 0.013, 0.035, tuple(top + ax * 0.03), 'trim', axis=ax, segs=10, bev=0.003, bsegs=1)
        P.tube('lead', [top + ax * 0.048, top + ax * 0.06 + V((-0.05, 0, -0.01)), V((-0.17, sy * 0.12, 0.28))],
               0.0045, 'trim', segs=5, bend=0.03)
        port = base + ax * 0.055 + V((0.06, 0, 0))
        ports.append((sy, port))
        expansion_stub(P, port, (1, 0, -0.3))
        # carb and velocity stack at the back
        cb = base + ax * 0.06 + V((-0.085, 0, 0))
        P.cyl('carb', 0.022, 0.06, tuple(cb), 'alu', axis='X', segs=12, bev=0.003, bsegs=1)
        P.cyl('bowl', 0.02, 0.028, tuple(cb + V((0, 0, -0.032))), 'alu', segs=12, bev=0.003, bsegs=1)
        P.lathe('stack', K.shell_profile([(0.022, 0.0), (0.024, 0.02), (0.03, 0.035), (0.042, 0.045),
                                           (0.044, 0.05)], 0.0025),
                loc=tuple(cb + V((-0.03, 0, 0))), material='chrome', axis='-X', segs=16, sharp=60.0, loop=True)
    for (sy, port) in ports:
        end = port + V((0.12, 0, -0.27)) + V((0.12 * 0.3, 0, 0))
    # outlets: the stubs end about 0.2 m ahead and below the ports
    for (sy, port) in ports:
        tip = port + V((0.0, 0, 0)) + V((1, 0, -0.3)).normalized() * 0.12 + V((0.12, 0, -0.15))
        P.empty('M_exhaust_out' if sy < 0 else 'M_exhaust_out2', tuple(tip), rot=(0, 15, 0))
    P.tube('kick_arm', [(-0.13, -0.19, 0.12), (-0.18, -0.195, 0.06), (-0.2, -0.2, 0.04)], 0.008, 'chrome', segs=8,
           bend=0.03)
    P.cyl('kick_peg', 0.012, 0.05, (-0.205, -0.225, 0.04), 'rubber', axis='Y', segs=10, bev=0.003, bsegs=1)
    for (x, z) in ((0.14, 0.06), (-0.17, 0.17)):
        P.box('lug', (0.04, 0.2, 0.03), (x, 0.0, z), 'alu', bev=0.006, segs=1)
        P.cyl('lug_bolt', 0.008, 0.22, (x, 0.0, z), 'steel', axis='Y', segs=8, bev=None)
    P.views = [('a', 35, 18), ('b', 215, 18)]


# ------------------------------------------------------------------------------------------------ eng_flat6


def build_eng_flat6(P):
    """Air-cooled flat-six: alloy crankcase, three finned barrels per side, black cooling tin, the upright fan
    housing on top driven by a belt from the crank, intake runners to two plenums, exhaust collectors at the
    back on both sides, oil cooler."""
    P.ao_distance = 0.12
    xs = [-0.17, -0.02, 0.13]
    P.box('crankcase', (0.56, 0.24, 0.24), (-0.03, 0, 0.18), 'alu', bev=0.016, segs=2)
    P.box('sump_plate', (0.44, 0.20, 0.05), (-0.04, 0, 0.035), 'alu', bev=0.01, segs=2)
    for i in range(6):
        P.box('sump_fin', (0.4, 0.006, 0.03), (-0.04, -0.075 + i * 0.03, 0.006), 'alu', bev=None, open='+z')
    for sg in (-1, 1):
        for x in xs:
            finned_barrel(P, V((x, sg * 0.12, 0.17)), (0, sg, 0), 0.042, 0.17, 0.13, 0.13, 8, fin_t=0.0045)
        P.box('head', (0.46, 0.06, 0.14), (-0.02, sg * 0.32, 0.17), 'alu', bev=0.014, segs=2)
        for i in range(7):
            P.box('head_fin', (0.44, 0.005, 0.15), (-0.02, sg * (0.295 + i * 0.008), 0.17), 'alu', bev=None)
        P.box('rocker', (0.44, 0.03, 0.1), (-0.02, sg * 0.365, 0.17), 'alu', bev=0.014, segs=2)
        # cooling tin over the barrels
        P.box('tin_top', (0.50, 0.24, 0.012), (-0.03, sg * 0.24, 0.265), 'trim', bev=0.004, segs=1)
        P.box('tin_side', (0.50, 0.012, 0.09), (-0.03, sg * 0.355, 0.235), 'trim', bev=0.003, segs=1)
        # intake runners up to a plenum on each side
        for x in xs:
            P.tube('runner', [(x, sg * 0.32, 0.24), (x, sg * 0.3, 0.33), (x * 0.9, sg * 0.2, 0.37)], 0.018, 'alu',
                   segs=10, bend=0.04)
        P.box('plenum', (0.42, 0.06, 0.06), (-0.03, sg * 0.18, 0.375), 'alu', bev=0.014, segs=2)
        # exhaust from under the heads into a collector at the back
        y = sg * 0.30
        for x in xs:
            P.tube('ex_pipe', [(x, y, 0.1), (x, y, 0.05), (x - 0.06, y * 0.95, 0.035)], 0.018, 'rust', segs=10,
                   bend=0.03)
        P.tube('collector', [(xs[-1] - 0.06, y * 0.95, 0.035), (-0.30, y * 0.9, 0.035), (-0.34, y * 0.85, 0.05)],
               0.026, 'rust', segs=12, bend=0.04)
        P.cyl('ex_flange', 0.04, 0.012, (-0.345, y * 0.85, 0.05), 'rust', axis='X', segs=14, bev=0.003, bsegs=1)
        P.empty('M_exhaust_out' if sg < 0 else 'M_exhaust_out2', (-0.352, y * 0.85, 0.05), rot=(0, 0, 180))
    P.cyl('turbo_pad', 0.045, 0.014, (-0.2, -0.27, 0.065), 'rust', segs=16, bev=0.003, bsegs=1)
    P.empty('M_turbo', (-0.2, -0.27, 0.072))
    # the fan housing on top: a drum with its axis along X, the fan visible at the front, the alternator hub
    fx, fz, fr = 0.10, 0.37, 0.15
    P.lathe('fan_housing', K.shell_profile([(fr - 0.01, -0.07), (fr + 0.01, -0.065), (fr + 0.012, 0.05),
                                            (fr + 0.004, 0.065), (fr - 0.012, 0.065)], 0.004),
            loc=(fx, 0, fz), material='trim', axis='X', segs=32, sharp=50.0, loop=True)
    P.cyl('fan_back', fr - 0.005, 0.006, (fx - 0.067, 0, fz), 'trim', axis='X', segs=32, bev=None)
    bm = bmesh.new()
    for i in range(11):
        a = math.tau * i / 11
        d = V((0, math.cos(a), math.sin(a)))
        m = Matrix.Translation(V((fx + 0.035, 0, fz)) + d * (fr * 0.58)) @ K.frame_from_z(d, (1, 0, 0)) @             Matrix.Rotation(math.radians(28), 4, 'Z')
        K.bm_cube(bm, (0.05, 0.006, fr - 0.07), m)
    P.mesh('fan_blades', bm, 'steel', bev=0.0015, segs=1)
    P.cyl('alt_hub', 0.065, 0.11, (fx + 0.01, 0, fz), 'alu', axis='X', segs=20, bev=0.006, bsegs=2)
    pulley(P, fx + 0.085, 0, fz, 0.06, 0.02, 'steel', grooves=1)
    pulley(P, 0.265, 0, 0.16, 0.07, 0.022, 'steel', grooves=1)
    belt(P, 0.272, [(0.0, 0.16, 0.072), (0.0, fz, 0.062)], width=0.013, thick=0.008)
    P.box('belt_guard', (0.012, 0.18, 0.14), (0.3, 0.0, 0.26), 'trim', bev=0.006, segs=1)
    # oil cooler beside the fan, air box at the back, filler and dipstick
    P.box('oil_cooler', (0.10, 0.05, 0.14), (0.05, -0.2, 0.36), 'alu', bev=0.008, segs=1)
    for i in range(9):
        P.box('cooler_fin', (0.105, 0.056, 0.004), (0.05, -0.2, 0.30 + i * 0.015), 'alu', bev=None)
    P.box('airbox', (0.18, 0.30, 0.09), (-0.2, 0.0, 0.40), 'trim', bev=0.025, segs=3)
    for sg in (-1, 1):
        P.tube('airbox_hose', [(-0.2, sg * 0.15, 0.4), (-0.12, sg * 0.18, 0.39)], 0.022, 'rubber', segs=10)
    P.cyl('filler', 0.03, 0.03, (-0.25, 0.1, 0.32), 'chrome', segs=14, bev=0.004, bsegs=1)
    starter(P, -0.18, -0.15, 0.08, length=0.16, r=0.045)
    rear_plate(P, -0.31, 0.18, 0.17, 0.15, nb=8, material='alu')
    mounts(P, 0.18, 0.15, 0.08)
    P.views = [('a', 35, 26), ('b', 215, 26)]


PARTS = {
    'eng_i4': build_eng_i4,
    'eng_i4d': build_eng_i4d,
    'eng_v8': build_eng_v8,
    'eng_mower': build_eng_mower,
    'turbo_small': build_turbo_small,
    'eng_single': build_eng_single,
    'eng_d6': build_eng_d6,
    'eng_2t': build_eng_2t,
    'eng_flat6': build_eng_flat6,
}


def main(args):
    K.run(PARTS, args)
