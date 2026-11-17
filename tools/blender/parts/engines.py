"""
Engines and the turbo (docs/MODCAR.md section 2.3).

    blender -b --factory-startup --python tools/blender/build.py -- parts/engines [<id>|all] [--norender]

Origin at the bottom centre where the engine sits on its mount (the lowest point of the sump is z = 0),
crankshaft along X, the front (pulleys, fan) towards +X (the motorcycle engines - eng_single, eng_2t, eng_moto4,
eng_vtwin - and the walking tractor's eng_d1 have theirs across, along Y, as on the real things). Sub-mounts:
M_turbo (where turbo_small bolts on: its local +Z is the flange normal) on engines that take one; M_exhaust_out
(centre of the downpipe flange, local +X = the direction the gas leaves); twin-bank engines (and the V-twin's two
pipes) also have M_exhaust_out2.
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
    # (recalc's outside test can pick the inside of a thin loop away from the origin: the signed volume decides)
    vol = 0.0
    for f in bm.faces:
        vs = [v.co for v in f.verts]
        for i in range(1, len(vs) - 1):
            vol += vs[0].dot(vs[i].cross(vs[i + 1]))
    if vol < 0:
        bmesh.ops.reverse_faces(bm, faces=bm.faces[:])
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
    xc, yc, zc2 = -0.03, 0.145, 0.582
    P.lathe('cleaner', [(0.0, 0.0), (0.105, 0.0), (0.122, 0.006), (0.128, 0.03), (0.124, 0.052), (0.118, 0.056)],
            loc=(xc, yc, zc2), material='trim', segs=36, close='end', sharp=40.0)
    P.lathe('cleaner_lid', [(0.0, 0.062), (0.06, 0.06), (0.112, 0.054), (0.126, 0.05), (0.126, 0.044)][::-1],
            loc=(xc, yc, zc2), material='chrome', segs=36, close='start', sharp=40.0)
    P.cyl('wing_base', 0.012, 0.006, (xc, yc, zc2 + 0.065), 'chrome', segs=10, bev=None)
    P.box('wing', (0.006, 0.046, 0.01), (xc, yc, zc2 + 0.071), 'chrome', bev=0.0025, segs=1)
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
    P.cyl('chra', 0.03, 0.05, (0, 0.012, zc), 'steel', axis='Y', segs=16, bev=0.005, bsegs=1)
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
    P.cyl('wg_can', 0.028, 0.035, (0.07, yc - 0.005, zc + 0.02), 'alu', axis='Y', segs=16, bev=0.005, bsegs=1)
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


# ------------------------------------------------------------------------------------------------ more shared pieces


def hull2d(pts):
    """The convex hull of 2D points, counter-clockwise."""
    pts = sorted({(round(x, 7), round(y, 7)) for (x, y) in pts})

    def cross(o, a, b):
        return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])

    lower, upper = [], []
    for p in pts:
        while len(lower) >= 2 and cross(lower[-2], lower[-1], p) <= 0:
            lower.pop()
        lower.append(p)
    for p in reversed(pts):
        while len(upper) >= 2 and cross(upper[-2], upper[-1], p) <= 0:
            upper.pop()
        upper.append(p)
    return lower[:-1] + upper[:-1]


def clip2d(poly, axis, value, keep_above=True):
    """Cut a convex outline [(u, v), ...] with the line coord[axis] = value, keeping the part above (or below) it."""
    def inside(p):
        return p[axis] >= value if keep_above else p[axis] <= value

    out = []
    n = len(poly)
    for i in range(n):
        a, b = poly[i], poly[(i + 1) % n]
        if inside(a):
            out.append(a)
        if inside(a) != inside(b):
            t = (value - a[axis]) / (b[axis] - a[axis])
            out.append((a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t))
    return out


def capsule2d(c0, r0, c1, r1, n=24):
    """The outline round two circles (their hull), counter-clockwise."""
    pts = [(c0[0] + r0 * math.cos(math.tau * i / n), c0[1] + r0 * math.sin(math.tau * i / n)) for i in range(n)]
    pts += [(c1[0] + r1 * math.cos(math.tau * i / n), c1[1] + r1 * math.sin(math.tau * i / n)) for i in range(n)]
    return hull2d(pts)


# local (u, v, w) -> world (w, u, v): an outline drawn in the (y, z) plane, extruded along +X
YZ = Matrix(((0, 0, 1, 0), (1, 0, 0, 0), (0, 1, 0, 0), (0, 0, 0, 1)))
# local (u, v, w) -> world (u, -w, v): an outline drawn in the (x, z) plane, extruded along -Y
XZ = mat4(rot=(90, 0, 0))


def plate_yz(P, name, poly, x0, x1, material, bev=0.004, segs=2, **kw):
    """A plate whose outline [(y, z), ...] (counter-clockwise seen from the front) fills x0..x1."""
    return P.prism(name, poly, abs(x1 - x0), matrix=Matrix.Translation(((x0 + x1) / 2, 0, 0)) @ YZ,
                   material=material, bev=bev, segs=segs, **kw)


def plate_xz(P, name, poly, y0, y1, material, bev=0.004, segs=2, **kw):
    """A plate whose outline [(x, z), ...] (counter-clockwise seen from the right) fills y0..y1."""
    return P.prism(name, poly, abs(y1 - y0), matrix=Matrix.Translation((0, (y0 + y1) / 2, 0)) @ XZ,
                   material=material, bev=bev, segs=segs, **kw)


def oil_seat(P, x, y, z, r):
    """Where the game puts the engine's oil cap (src/game/modcar/fillers.ts adds it, it is not modelled): the centre
    of a flat, clear circle of radius r on top of a cover, z its height. Kept on the Part only (not exported)."""
    P.filler = ((x, y, z), r)


def lead_path(P, pts, r=0.0045, material='trim', bend=0.025, segs=4):
    """A plug lead along a polyline (rounded at the corners)."""
    return P.tube('lead', [V(p) for p in pts], r, material, segs=segs, bend=bend)


# ------------------------------------------------------------------------------------------------ eng_i3


def build_eng_i3(P):
    """0.66 L kei-car triple: a short iron block, an alloy head under a painted cam cover, its three plug leads from
    the distributor on the back of the head, a black timing-belt cover in front with the alternator and the water
    pump on one V-belt, the thermostat's little hose neck, a cast three-into-one manifold with a pad for a turbo,
    the carburettor under an oval air cleaner."""
    P.ao_distance = 0.10
    zc = 0.13
    x0, x1 = -0.155, 0.115          # the block's rear and front faces
    xm = (x0 + x1) / 2
    L = x1 - x0
    xs = [xm - 0.08, xm, xm + 0.08]
    sump(P, x0 + 0.005, x1 - 0.005, 0.088, 0.085, -0.035, zshallow=0.035, bolts=4)
    P.box('skirt', (L + 0.005, 0.205, 0.075), (xm, 0, 0.13), 'steel', bev=0.007, segs=2)
    bm = bmesh.new()
    K.bm_cube(bm, (L, 0.175, 0.17), mat4((xm, 0, 0.2525)))
    for v in bm.verts:
        if v.co.z < 0.25:
            v.co.y *= 1.08
    P.mesh('block', bm, 'steel', bev=0.007, segs=2)
    for sg in (-1, 1):
        for x in (xm - 0.12, xm, xm + 0.12):
            P.box('rib', (0.014, 0.01, 0.15), (x, sg * 0.0925, 0.255), 'steel', bev=0.003, segs=1,
                  open='-y' if sg > 0 else '+y')
        for x in (xm - 0.06, xm + 0.06):
            P.cyl('plug', 0.015, 0.007, (x, sg * 0.0905, 0.262), 'alu', axis='Y', segs=10, bev=None)
    # --- head, gasket, the painted cam cover with three plug wells and the oil cap's flat seat
    P.box('gasket', (L - 0.005, 0.18, 0.005), (xm, 0, 0.34), 'trim', bev=None)
    P.box('head', (L - 0.005, 0.172, 0.062), (xm, 0, 0.3735), 'alu', bev=0.006, segs=2)
    zt = 0.4595
    P.box('cover_flange', (L - 0.02, 0.15, 0.01), (xm, 0, 0.4095), 'paint', bev=0.003, segs=1)
    P.box('cover', (L - 0.035, 0.13, 0.046), (xm, 0, zt - 0.023), 'paint', bev=0.016, segs=3)
    flange_bolts(P, [(x, sg * 0.068, 0.4145) for x in (xm - 0.105, xm + 0.105) for sg in (-1, 1)] +
                 [(xm, 0.068, 0.4145), (xm, -0.068, 0.4145)], (0, 0, 1), r=0.005, material='chrome')
    yp = 0.015
    for x in xs:
        P.cyl('well', 0.016, 0.008, (x, yp, zt + 0.002), 'paint', segs=14, bev=0.002, bsegs=1)
        P.cyl('boot', 0.0095, 0.03, (x, yp, zt + 0.018), 'rubber', segs=10, bev=0.002, bsegs=1)
    oil_seat(P, xm + 0.07, -0.025, zt, 0.021)
    P.tube('breather', [(-0.095, 0.063, 0.442), (-0.095, 0.085, 0.452), (-0.09, 0.1, 0.469)], 0.006, 'rubber',
           segs=8, bend=0.01)
    # --- the distributor on the back of the head (off the camshaft), its cap facing back, four leads
    yd, zd = 0.02, 0.378
    P.cyl('dist_body', 0.024, 0.034, (x0 - 0.015, yd, zd), 'alu', axis='X', segs=14, bev=0.003, bsegs=1)
    xcap = x0 - 0.032
    P.lathe('dist_cap', [(0.0, 0.0), (0.036, 0.0), (0.038, 0.014), (0.033, 0.028), (0.0, 0.032)],
            loc=(xcap, yd, zd), material='trim', axis='-X', segs=18, sharp=40)
    face = xcap - 0.032
    towers = []
    for i, a in enumerate((100, 220, 340)):
        t = V((face - 0.004, yd + 0.021 * math.cos(math.radians(a)), zd + 0.021 * math.sin(math.radians(a))))
        P.cyl('tower', 0.0065, 0.012, tuple(t), 'trim', axis='X', segs=8, bev=None)
        towers.append(t + V((-0.006, 0, 0)))
    # (the leads run back out of the cap, up behind the head and forward along the cover's left shoulder, then in)
    for i, x in enumerate(xs):
        t = towers[i]
        top = V((x, yp, zt + 0.033))
        yl, zl = 0.05 + 0.008 * i, zt + 0.011 + 0.003 * i
        lead_path(P, [t, t + V((-0.018, 0, 0.01)), V((x0 - 0.04, yl - 0.01, zl - 0.02)), V((x0 - 0.01, yl, zl)),
                      V((x - 0.03, yl, zl)), V((x - 0.006, yp + 0.016, zt + 0.036)), top], bend=0.018)
    P.cyl('tower_c', 0.0065, 0.012, (face - 0.004, yd, zd), 'trim', axis='X', segs=8, bev=None)
    # the vacuum advance can on the distributor's side and its line to the carburettor
    P.cyl('vac_can', 0.017, 0.022, (x0 - 0.016, yd + 0.036, zd - 0.006), 'steel', axis='Y', segs=12, bev=0.003,
          bsegs=1)
    P.tube('vac_line', [(x0 - 0.016, yd + 0.048, zd - 0.006), (x0 - 0.01, 0.1, 0.4), (xm - 0.035, 0.17, 0.425)],
           0.003, 'rubber', segs=5, bend=0.03)
    xco, yco = -0.143, 0.128
    P.cyl('coil', 0.021, 0.095, (xco, yco, 0.262), 'trim', segs=14, bev=0.004, bsegs=1)
    P.cyl('coil_top', 0.016, 0.014, (xco, yco, 0.315), 'trim', segs=12, bev=0.002, bsegs=1)
    P.box('coil_brk', (0.026, 0.04, 0.045), (xco + 0.004, yco - 0.03, 0.262), 'steel', bev=0.003, segs=1)
    lead_path(P, [(face - 0.01, yd, zd), (face - 0.03, yd + 0.02, zd - 0.01), (xco - 0.02, yco - 0.02, 0.35),
                  (xco, yco, 0.322)], bend=0.02)
    rear_plate(P, x0, zc, 0.13, 0.13, nb=8)
    # --- front: the black timing-belt cover, crank and water-pump pulleys, alternator, the V-belt
    xt1 = x1 + 0.032
    out = capsule2d((0.0, zc), 0.072, (0.0, 0.383), 0.078, n=28)
    plate_yz(P, 'belt_cover', clip2d(out, 1, 0.258), x1, xt1, 'trim', bev=0.008, segs=2)
    plate_yz(P, 'belt_cover_lo', clip2d(out, 1, 0.252, keep_above=False), x1, xt1 - 0.005, 'trim', bev=0.008, segs=2)
    plate_yz(P, 'belt_cover_back', out, x1 - 0.002, x1 + 0.012, 'trim', bev=0.003, segs=1)
    lo, up = [math.radians(a) for a in (205, 335)], [math.radians(a) for a in (30, 150)]
    flange_bolts(P, [(xt1, 0.066 * math.cos(a), zc + 0.066 * math.sin(a)) for a in lo] +
                 [(xt1, 0.07 * math.cos(a), 0.383 + 0.07 * math.sin(a)) for a in up] +
                 [(xt1, 0.064, 0.255), (xt1, -0.064, 0.255)], (1, 0, 0), r=0.005)
    xp = xt1 + 0.02
    pulley(P, xp, 0, zc, 0.056, 0.018, 'steel', grooves=1)
    ywp, zwp = -0.058, 0.262
    P.cyl('pump_boss', 0.03, 0.012, (xt1 + 0.005, ywp, zwp), 'alu', axis='X', segs=14, bev=0.002, bsegs=1)
    pulley(P, xp, ywp, zwp, 0.042, 0.016, 'steel', grooves=1, hub=False)
    ya, za = 0.145, 0.222
    P.cyl('alt', 0.05, 0.08, (0.105, ya, za), 'alu', axis='X', segs=20, bev=0.005, bsegs=2)
    for i in range(6):
        a = math.tau * i / 6 + 0.3
        P.box('alt_fin', (0.05, 0.005, 0.012), (0.105, ya + math.cos(a) * 0.05, za + math.sin(a) * 0.05), 'alu',
              rot=(math.degrees(a), 0, 0), bev=None)
    P.cyl('alt_rear', 0.043, 0.016, (0.058, ya, za), 'steel', axis='X', segs=16, bev=0.003, bsegs=1)
    P.cyl('alt_shaft', 0.01, 0.04, (0.15, ya, za), 'steel', axis='X', segs=10, bev=None)
    pulley(P, xp, ya, za, 0.03, 0.016, 'steel', grooves=1, hub=False, segs=18)
    P.box('alt_brk', (0.03, 0.04, 0.026), (0.075, 0.105, 0.178), 'steel', bev=0.004, segs=1)
    P.tube('alt_arm', [(0.12, ya - 0.02, za + 0.045), (0.11, 0.095, 0.31)], 0.006, 'steel', segs=6)
    belt(P, xp, [(0.0, zc, 0.058), (ya, za, 0.032), (ywp, zwp, 0.044)], width=0.011, thick=0.006)
    # --- the thermostat on the head and its hose neck for the radiator's top hose
    P.box('thermo', (0.032, 0.032, 0.036), (0.1, 0.098, 0.378), 'alu', bev=0.008, segs=2)
    P.tube('hose_neck', [(0.1, 0.11, 0.38), (0.125, 0.125, 0.386), (0.162, 0.13, 0.386)], 0.0135, 'alu', segs=12,
           bend=0.03)
    P.tube('hose_up', [(0.158, 0.13, 0.386), (0.205, 0.134, 0.381)], 0.0165, 'rubber', segs=12)
    P.torus('clamp', 0.0175, 0.0026, loc=(0.174, 0.131, 0.385), axis='X', segs=14, rsegs=4, material='steel')
    # --- exhaust (right, -Y): three runners into a short cast log, the turbo pad on top, the outlet down
    yh = -0.086
    for x in xs:
        P.box('ex_flange', (0.05, 0.012, 0.036), (x, yh - 0.006, 0.374), 'rust', bev=0.004, segs=1)
        P.tube('ex_runner', [(x, yh - 0.01, 0.374), (x, -0.13, 0.37), (xm + (x - xm) * 0.5, -0.158, 0.326)], 0.018,
               'rust', segs=10, bend=0.035)
        flange_bolts(P, [(x + 0.018, yh - 0.012, 0.374), (x - 0.018, yh - 0.012, 0.374)], (0, -1, 0), r=0.0048)
    P.tube('ex_log', [(xm - 0.05, -0.158, 0.326), (xm + 0.05, -0.158, 0.326)], 0.024, 'rust', segs=14)
    for x in (xm - 0.05, xm + 0.05):
        P.sphere('ex_cap', 0.024, (x, -0.158, 0.326), 'rust', u=12, v=5)
    P.cyl('turbo_pad', 0.038, 0.012, (xm, -0.158, 0.352), 'rust', segs=16, bev=0.003, bsegs=1)
    P.empty('M_turbo', (xm, -0.158, 0.358), rot=(0, 0, -90))
    P.tube('ex_out', [(xm - 0.012, -0.16, 0.31), (xm - 0.016, -0.168, 0.255), (xm - 0.05, -0.17, 0.215)], 0.024,
           'rust', segs=14, bend=0.04)
    P.cyl('ex_flange_out', 0.036, 0.011, (xm - 0.054, -0.171, 0.208), 'rust', rot=(0, 30, 0), segs=16, bev=0.003,
          bsegs=1)
    P.empty('M_exhaust_out', (xm - 0.058, -0.172, 0.2), rot=(0, 120, 0))
    # --- intake (left, +Y): three runners into a plenum, the carburettor, the oval air cleaner and its snorkel
    yi = 0.086
    for x in xs:
        P.box('in_flange', (0.045, 0.012, 0.034), (x, yi + 0.006, 0.376), 'alu', bev=0.003, segs=1)
        P.tube('in_runner', [(x, yi + 0.01, 0.376), (x, 0.112, 0.38), (xm + (x - xm) * 0.6, 0.132, 0.39)], 0.015,
               'alu', segs=8, bend=0.025)
    P.box('plenum', (0.17, 0.05, 0.045), (xm, 0.138, 0.39), 'alu', bev=0.012, segs=2)
    P.box('carb', (0.06, 0.058, 0.05), (xm, 0.148, 0.437), 'alu', bev=0.006, segs=2)
    P.cyl('float_bowl', 0.019, 0.034, (xm + 0.036, 0.168, 0.43), 'alu', segs=12, bev=0.003, bsegs=1)
    P.tube('linkage', [(xm - 0.03, 0.175, 0.445), (xm - 0.06, 0.195, 0.43)], 0.0028, 'steel', segs=5)
    xa, yac, zac = xm - 0.01, 0.15, 0.4675
    P.prism('cleaner', K.rounded_rect(0.19, 0.15, 0.055, seg=5), 0.055, (xa, yac, zac + 0.0275), 'trim', bev=0.008,
            segs=2)
    P.prism('cleaner_lid', K.rounded_rect(0.176, 0.136, 0.048, seg=5), 0.007, (xa, yac, zac + 0.058), 'steel',
            bev=0.003, segs=1)
    P.cyl('wing_base', 0.011, 0.006, (xa, yac, zac + 0.064), 'chrome', segs=10, bev=None)
    P.box('wing', (0.006, 0.04, 0.01), (xa, yac, zac + 0.07), 'chrome', bev=0.0025, segs=1)
    bm = bmesh.new()
    K.bm_cube(bm, (0.075, 0.05, 0.03), mat4((xa + 0.125, yac + 0.02, zac + 0.024)))
    for v in bm.verts:
        if v.co.x > xa + 0.14:
            v.co.y = yac + 0.02 + (v.co.y - yac - 0.02) * 1.2
            v.co.z = zac + 0.024 + (v.co.z - zac - 0.024) * 1.2
    P.mesh('snorkel', bm, 'trim', bev=0.006, segs=2)
    # --- oil filter, dipstick, starter, mounts
    P.cyl('filter_base', 0.03, 0.016, (0.075, -0.096, 0.2), 'alu', axis='Y', segs=14, bev=0.003, bsegs=1)
    P.cyl('filter', 0.036, 0.075, (0.075, -0.14, 0.2), 'paint_b', axis='Y', segs=18, bev=0.006, bsegs=2)
    P.tube('dipstick', [(-0.14, -0.09, 0.2), (-0.145, -0.1, 0.4), (-0.14, -0.096, 0.47)], 0.004, 'steel', segs=6,
           bend=0.08)
    P.torus('dip_ring', 0.013, 0.004, loc=(-0.14, -0.096, 0.484), rot=(0, 90, 0), segs=14, rsegs=6,
            material='paint_b')
    starter(P, -0.112, 0.115, 0.075, length=0.11, r=0.036)
    mounts(P, 0.0, 0.135, 0.17)
    P.views = [('a', 35, 22), ('b', 215, 22)]


# ------------------------------------------------------------------------------------------------ eng_boxer4


def build_eng_boxer4(P):
    """1.6 L air-cooled flat-four (the classic van and beetle type): the split alloy crankcase, two finned cylinder
    pairs out to the sides under alloy heads and steel valve covers held by wire bails, the pushrod tubes under the
    barrels; on top the tall round-shouldered fan shroud with the dynamo on its pedestal and its pulley in front of
    the fan's mouth, belted to the crank; the tall single carburettor in the middle on its two-armed manifold, the
    oil filler neck beside the pedestal, the exhaust from under the heads through the heater boxes to a flange at
    the back of each side."""
    P.ao_distance = 0.12
    zc = 0.17
    xcc = -0.06                     # the crankcase's middle
    xf = 0.15                       # its front face (the pulley end)
    # --- crankcase: two halves split down the middle, the oil strainer plate underneath
    P.box('case', (0.42, 0.24, 0.27), (xcc, 0, 0.155), 'alu', bev=0.03, segs=3)
    P.box('case_seam', (0.40, 0.014, 0.012), (xcc, 0, 0.294), 'alu', bev=0.004, segs=1)
    P.box('case_seam_f', (0.012, 0.014, 0.23), (xf + 0.004, 0, 0.155), 'alu', bev=0.004, segs=1)
    seam = ((-0.17, 1), (-0.1, -1), (-0.03, 1), (0.04, -1), (0.11, 1), (0.17, -1))
    P.bolts([(xcc + dx, sy * 0.017, 0.29) for dx, sy in seam], normal=(0, 0, 1), r=0.0055, h=0.005, washer=False)
    P.cyl('strainer', 0.062, 0.01, (xcc, 0, 0.013), 'alu', segs=20, bev=None)
    P.bolts([(xcc + 0.05 * math.cos(math.tau * i / 6), 0.05 * math.sin(math.tau * i / 6), 0.008) for i in range(6)],
            normal=(0, 0, -1), r=0.0055, h=0.005, washer=False)
    P.bolt((xcc, 0, 0.008), normal=(0, 0, -1), r=0.009, h=0.008, washer=False)
    # --- cylinders: the left bank sits a con-rod's width ahead of the right one
    banks = ((-1, [xcc - 0.085, xcc + 0.06]), (1, [xcc - 0.06, xcc + 0.085]))
    yb0, yb1 = 0.12, 0.275
    yh1 = yb1 + 0.065
    plugs = {}
    for sg, xsb in banks:
        xh = sum(xsb) / 2
        for x in xsb:
            P.box('base', (0.122, 0.008, 0.122), (x, sg * 0.124, zc), 'alu', bev=0.004, segs=1)
            finned_barrel(P, V((x, sg * yb0, zc)), (0, sg, 0), 0.046, yb1 - yb0, 0.118, 0.118, 10, fin_t=0.0045,
                          material='steel')
            # pushrod tubes under the barrel, with their corrugated seals
            for dx in (-0.024, 0.024):
                P.tube('pushrod_tube', [(x + dx, sg * 0.112, zc - 0.074), (x + dx, sg * (yb1 + 0.01), zc - 0.07)],
                       0.0085, 'steel', segs=10)
                for yy in (0.13,):
                    P.cyl('pr_seal', 0.0108, 0.006, (x + dx, sg * yy, zc - 0.073), 'rubber', axis='Y', segs=10,
                          bev=None)
            plugs[(sg, x)] = V((x, sg * (yb1 + 0.03), zc + 0.095))
        # the head and its fins (proud above and below), the steel valve cover and its wire bail
        P.box('head', (0.27, yh1 - yb1, 0.17), (xh, sg * (yb1 + yh1) / 2, zc - 0.005), 'alu', bev=0.012, segs=2)
        for i in range(5):
            P.box('head_fin', (0.25, 0.005, 0.196), (xh, sg * (yb1 + 0.01 + i * 0.012), zc - 0.005), 'alu', bev=None)
        bm = bmesh.new()
        K.bm_cube(bm, (0.25, 0.042, 0.13), mat4((xh, sg * (yh1 + 0.021), zc - 0.005)))
        for v in bm.verts:
            if abs(v.co.y) > yh1 + 0.03:
                v.co.x = xh + (v.co.x - xh) * 0.88
                v.co.z = zc - 0.005 + (v.co.z - zc + 0.005) * 0.82
        P.mesh('vcover', bm, 'steel', bev=0.016, segs=3)
        P.tube('bail', [(xh, sg * (yh1 + 0.004), zc + 0.075), (xh, sg * (yh1 + 0.047), zc + 0.035),
                        (xh, sg * (yh1 + 0.049), zc - 0.045), (xh, sg * (yh1 + 0.004), zc - 0.085)], 0.0034, 'steel',
               segs=5, bend=0.02)
        # the cylinder tin over the inner half of the barrels
        P.box('tin', (0.31, 0.09, 0.006), (xh, sg * 0.163, zc + 0.066), 'paint', bev=0.002, segs=1)
        P.box('tin_lip', (0.31, 0.006, 0.03), (xh, sg * 0.205, zc + 0.05), 'paint', bev=0.002, segs=1)
        # exhaust: two ports under the head into the heater box, out to a flange at the back
        yx = sg * 0.292
        for x in xsb:
            P.box('ex_flange', (0.045, 0.04, 0.01), (x, yx, 0.076), 'rust', bev=0.003, segs=1)
            P.tube('ex_port', [(x, yx, 0.076), (x, yx, 0.058), (x - 0.04, yx, 0.045)], 0.017, 'rust', segs=8,
                   bend=0.025)
        P.tube('ex_pipe', [(xsb[1] + 0.01, yx, 0.045), (-0.262, yx, 0.045), (-0.285, yx * 0.97, 0.05)], 0.02,
               'rust', segs=12, bend=0.03)
        P.box('heater_box', (0.2, 0.062, 0.048), (xh - 0.03, yx, 0.045), 'steel', bev=0.012, segs=2)
        P.cyl('heater_out', 0.016, 0.03, (xh - 0.09, yx, 0.075), 'steel', segs=12, bev=None)
        P.cyl('ex_flange_out', 0.034, 0.01, (-0.287, yx * 0.97, 0.05), 'rust', axis='X', segs=14, bev=0.003, bsegs=1)
        P.empty('M_exhaust_out' if sg < 0 else 'M_exhaust_out2', (-0.292, yx * 0.97, 0.05), rot=(0, 0, 180))
    # --- the fan shroud: round-shouldered sheet metal over the middle, the fan's mouth in its front face
    zd = 0.43
    half = [(0.206, 0.236), (0.209, 0.31), (0.201, 0.385), (0.18, 0.45), (0.142, 0.505), (0.088, 0.538),
            (0.03, 0.55)]
    out = half + [(-y, z) for (y, z) in reversed(half)]
    sh = plate_yz(P, 'shroud', out, -0.05, xf, 'paint', bev=0.024, segs=3)
    cutter = bmesh.new()
    K.bm_cyl(cutter, 0.104, 0.08, segs=36, matrix=Matrix.Translation((xf, 0, zd)) @ K.axis_matrix('X'))
    P.cut(sh, cutter)
    P.torus('mouth_lip', 0.106, 0.005, loc=(xf, 0, zd), axis='X', segs=32, rsegs=4, material='paint')
    bm = bmesh.new()
    for i in range(14):
        a = math.tau * i / 14
        d = V((0, math.cos(a), math.sin(a)))
        m = Matrix.Translation(V((xf - 0.03, 0, zd)) + d * 0.067) @ K.frame_from_z(d, (1, 0, 0))
        K.bm_cube(bm, (0.03, 0.004, 0.056), m @ Matrix.Rotation(math.radians(30), 4, 'Z'))
    P.mesh('fan_vanes', bm, 'steel', bev=None)
    P.cyl('fan_hub', 0.036, 0.03, (xf - 0.028, 0, zd), 'alu', axis='X', segs=18, bev=None)
    # the dynamo on its pedestal, its strap, the pulley in front of the fan and the belt down to the crank
    P.cyl('dynamo', 0.056, 0.17, (-0.035, 0, zd), 'trim', axis='X', segs=24, bev=0.004, bsegs=2)
    P.cyl('dyn_end', 0.05, 0.012, (-0.126, 0, zd), 'steel', axis='X', segs=20, bev=None)
    P.cyl('dyn_boss', 0.02, 0.012, (-0.138, 0, zd), 'steel', axis='X', segs=12, bev=None)
    for sy in (-1, 1):
        P.cyl('dyn_term', 0.006, 0.016, (-0.105, sy * 0.022, zd + 0.058), 'steel', segs=8, bev=None)
    bm = bmesh.new()
    K.bm_cube(bm, (0.06, 0.1, 0.1), mat4((-0.085, 0, 0.335)))
    for v in bm.verts:
        if v.co.z > 0.34:
            v.co.y *= 0.78
    P.mesh('pedestal', bm, 'alu', bev=0.01, segs=2)
    P.torus('dyn_strap', 0.059, 0.0045, loc=(-0.075, 0, zd), axis='X', segs=24, rsegs=4, material='steel')
    P.box('strap_lug', (0.016, 0.03, 0.02), (-0.075, 0.0, zd + 0.064), 'steel', bev=0.003, segs=1)
    P.cyl('seal_boss', 0.042, 0.014, (xf + 0.007, 0, zc), 'alu', axis='X', segs=18, bev=None)
    pulley(P, xf + 0.026, 0, zc, 0.076, 0.024, 'steel', grooves=1, segs=20)
    pulley(P, xf + 0.024, 0, zd, 0.056, 0.02, 'steel', grooves=1, hub=False, segs=18)
    P.bolt((xf + 0.036, 0, zd), normal=(1, 0, 0), r=0.011, h=0.009, washer=False)
    belt(P, xf + 0.025, [(0.0, zc, 0.078), (0.0, zd, 0.058)], width=0.012, thick=0.007)
    # --- the tall carburettor in the middle on its two-armed manifold
    xk = -0.185
    P.box('man_centre', (0.06, 0.07, 0.04), (xk, 0, 0.335), 'alu', bev=0.01, segs=2)
    for sg, xsb in banks:
        xh = sum(xsb) / 2
        P.tube('man_arm', [(xk, sg * 0.03, 0.338), (xk, sg * 0.19, 0.338), (xh - 0.03, sg * 0.285, 0.31),
                           (xh - 0.01, sg * 0.30, 0.272)], 0.017, 'alu', segs=12, bend=0.05)
        P.box('man_flange', (0.07, 0.042, 0.01), (xh - 0.01, sg * 0.30, 0.268), 'alu', bev=0.003, segs=1)
    P.box('carb', (0.07, 0.075, 0.10), (xk, 0, 0.405), 'alu', bev=0.01, segs=2)
    P.cyl('float_bowl', 0.026, 0.06, (xk, -0.05, 0.395), 'alu', segs=14, bev=0.004, bsegs=1)
    P.cyl('choke', 0.027, 0.016, (xk, 0.045, 0.43), 'trim', axis='Y', segs=16, bev=None)
    P.lathe('air_horn', K.shell_profile([(0.03, 0.0), (0.032, 0.02), (0.037, 0.032), (0.045, 0.04)], 0.0025),
            loc=(xk, 0, 0.455), material='chrome', segs=20, sharp=60.0, loop=True)
    P.box('throttle', (0.012, 0.03, 0.008), (xk - 0.04, -0.03, 0.375), 'steel', bev=0.002, segs=1)
    P.tube('throttle_rod', [(xk - 0.045, -0.04, 0.375), (xk - 0.07, -0.05, 0.35), (-0.27, -0.05, 0.33)], 0.0025,
           'steel', segs=5, bend=0.02)
    # --- oil filler neck beside the pedestal (the game puts the cap on its flat top), fuel pump, distributor
    xo, yo, zo = -0.09, 0.105, 0.39
    P.cyl('filler_neck', 0.026, zo - 0.29, (xo, yo, (zo + 0.29) / 2), 'alu', segs=18, bev=0.002, bsegs=1)
    P.cyl('filler_lip', 0.031, 0.006, (xo, yo, zo - 0.003), 'alu', segs=18, bev=None)
    oil_seat(P, xo, yo, zo, 0.024)
    P.cyl('fuel_pump', 0.022, 0.045, (-0.09, -0.09, 0.312), 'alu', segs=14, bev=0.003, bsegs=1)
    P.cyl('fuel_pump_top', 0.026, 0.012, (-0.09, -0.09, 0.34), 'steel', segs=14, bev=0.003, bsegs=1)
    P.tube('fuel_line', [(-0.09, -0.09, 0.346), (-0.12, -0.075, 0.41), (xk + 0.01, -0.06, 0.41),
                         (xk, -0.052, 0.425)], 0.0035, 'rubber', segs=5, bend=0.02)
    xd, yd = -0.243, -0.1
    P.cyl('dist_body', 0.022, 0.05, (xd, yd, 0.315), 'alu', segs=14, bev=0.003, bsegs=1)
    P.lathe('dist_cap', [(0.0, 0.0), (0.035, 0.0), (0.037, 0.018), (0.031, 0.036), (0.0, 0.04)],
            loc=(xd, yd, 0.34), material='trim', segs=18, sharp=40)
    cap_top = V((xd, yd, 0.382))
    for (sg, x), pl in sorted(plugs.items()):
        P.cyl('boot', 0.0095, 0.03, tuple(pl), 'rubber', rot=(sg * -25, 0, 0), segs=8, bev=None)
        tip = pl + V((0, sg * 0.006, 0.014))
        a = math.atan2(x - xd, sg) + (0.4 if sg > 0 else 0.0)
        top = cap_top + V((0.018 * math.cos(a), 0.018 * math.sin(a), 0.0))
        if sg < 0:
            pts = [top, top + V((0, 0, 0.015)), V((x - 0.03, -0.2, 0.36)), tip + V((0, 0.0, 0.03)), tip]
        else:
            pts = [top, top + V((0, 0, 0.015)), V((-0.255, 0.02, 0.33)), V((x - 0.04, 0.24, 0.34)),
                   tip + V((0, 0.0, 0.03)), tip]
        lead_path(P, pts, bend=0.02)
    # the coil on the shroud's left side and its lead round behind the carburettor
    P.cyl('coil', 0.022, 0.1, (0.05, 0.226, 0.37), 'trim', segs=14, bev=0.004, bsegs=1)
    P.box('coil_clamp', (0.03, 0.02, 0.03), (0.05, 0.208, 0.37), 'steel', bev=0.003, segs=1)
    lead_path(P, [(0.05, 0.226, 0.424), (0.02, 0.21, 0.43), (-0.16, 0.16, 0.312), (-0.248, 0.03, 0.318),
                  (xd, yd + 0.01, 0.39)], bend=0.025)
    rear_plate(P, xcc - 0.21, zc, 0.16, 0.15, nb=8, material='alu')
    mounts(P, xcc - 0.15, 0.15, 0.05)
    P.views = [('a', 35, 26), ('b', 215, 26)]


# ------------------------------------------------------------------------------------------------ eng_i4tc


def trumpet(P, base, axis, r0=0.021, r1=0.036, length=0.045, segs=14, material='chrome'):
    """A velocity stack: a thin-walled bell from base along axis, flaring from r0 to its rolled lip r1."""
    prof = [(r0, 0.0), (r0 * 1.04, length * 0.45), (r0 + (r1 - r0) * 0.45, length * 0.8), (r1 * 0.97, length),
            (r1 * 1.02, length * 1.04)]
    return P.lathe('trumpet', K.shell_profile(prof, 0.0022), loc=tuple(base), material=material, axis=V(axis),
                   segs=segs, sharp=60.0, loop=True)


def build_eng_i4tc(P):
    """1.6 L twin-cam sixteen-valve four: the i4's iron block under a wide alloy head with two red cam covers and
    the plug leads down the valley between them from the distributor on the end of the exhaust cam, a black timing
    belt cover over both cam pulleys, four individual throttle bodies on polished runners with chrome trumpets, a
    steel 4-2-1 header swept out to a collector that takes a turbo, the fan on the water pump."""
    P.ao_distance = 0.12
    zc = 0.17
    x0, x1 = -0.255, 0.205
    xm = (x0 + x1) / 2
    L = x1 - x0
    xs = [xm - 0.15, xm - 0.05, xm + 0.05, xm + 0.15]
    sump(P, x0 + 0.01, x1 - 0.01, 0.125, 0.12, -0.03, zshallow=0.055, bolts=5)
    P.box('skirt', (L, 0.29, 0.09), (xm, 0, 0.172), 'steel', bev=0.008, segs=2)
    bm = bmesh.new()
    K.bm_cube(bm, (L, 0.25, 0.22), mat4((xm, 0, 0.327)))
    for v in bm.verts:
        if v.co.z < 0.3:
            v.co.y *= 1.08
    P.mesh('block', bm, 'steel', bev=0.008, segs=2)
    for sg in (-1, 1):
        for x in xs[:3]:
            P.cyl('plug', 0.017, 0.008, (x + 0.05, sg * 0.127, 0.32), 'alu', axis='Y', segs=10, bev=None)
        for x in [xm - 0.2, xm - 0.1, xm, xm + 0.1, xm + 0.2]:
            P.box('rib', (0.016, 0.012, 0.18), (x, sg * 0.128, 0.32), 'steel', bev=0.003, segs=1,
                  open='-y' if sg > 0 else '+y')
    # --- the wide twin-cam head, its two red cam covers, the plug wells in the valley
    P.box('gasket', (L - 0.01, 0.255, 0.006), (xm, 0, 0.44), 'trim', bev=None)
    P.box('head', (L - 0.01, 0.25, 0.088), (xm, 0, 0.487), 'alu', bev=0.008, segs=2)
    for x in (xm - 0.2, xm - 0.1, xm, xm + 0.1, xm + 0.2):
        P.box('head_rib', (0.012, 0.006, 0.07), (x, -0.128, 0.485), 'alu', bev=None, open='+y')
    zt = 0.588
    yc = 0.06
    for sg in (-1, 1):
        y = sg * yc
        P.box('cover_flange', (L - 0.04, 0.105, 0.01), (xm, y, 0.536), 'paint', bev=0.003, segs=1)
        P.box('cam_cover', (L - 0.05, 0.095, 0.05), (xm, y, zt - 0.025), 'paint', bev=0.016, segs=3)
        # two ribs along the outer half (the exhaust cover's stop short of the oil cap's seat)
        for k in (0, 1):
            yr = y + sg * (0.016 + 0.014 * k)
            xa, xb = xm - 0.19, (xm + 0.19 if sg > 0 else xm + 0.06)
            P.box('cover_rib', (xb - xa, 0.007, 0.007), ((xa + xb) / 2, yr, zt + 0.0025), 'paint', bev=0.0025,
                  segs=1, open='-z')
        flange_bolts(P, [(xm + dx, y - sg * 0.04, zt) for dx in (-0.17, 0.0, 0.17)], (0, 0, 1), r=0.0055,
                     material='chrome')
    oil_seat(P, xm + 0.155, -yc, zt, 0.022)
    # the black plug cover down the valley; the leads leave its back end for the distributor on the exhaust cam
    xd, yd, zd = x0 - 0.012, -yc, 0.487
    P.cyl('dist_body', 0.026, 0.03, (xd - 0.015, yd, zd), 'alu', axis='X', segs=14, bev=0.003, bsegs=1)
    xcap = xd - 0.03
    P.lathe('dist_cap', [(0.0, 0.0), (0.038, 0.0), (0.04, 0.016), (0.035, 0.03), (0.0, 0.035)],
            loc=(xcap, yd, zd), material='trim', segs=18, sharp=40)
    face = xcap - 0.035
    xpc0, xpc1 = xs[0] - 0.045, xs[-1] + 0.03
    P.box('plug_cover', (xpc1 - xpc0, 0.03, 0.014), ((xpc0 + xpc1) / 2, 0, zt + 0.003), 'trim', bev=0.004, segs=2)
    flange_bolts(P, [(xpc0 + 0.03, 0, zt + 0.01), (xpc1 - 0.03, 0, zt + 0.01)], (0, 0, 1), r=0.005,
                 material='chrome')
    for i in range(4):
        a = math.radians(45 + 90 * i)
        t = V((face - 0.006, yd + 0.022 * math.cos(a), zd + 0.022 * math.sin(a)))
        P.cyl('tower', 0.0065, 0.012, tuple(t + V((0.004, 0, 0))), 'trim', axis='X', segs=8, bev=None)
        yl = -0.009 + 0.006 * i
        lead_path(P, [t, t + V((-0.02, 0, 0.012)), V((x0 - 0.045, -0.032 + 0.009 * i, zt - 0.03)),
                      V((xpc0 - 0.012, yl, zt + 0.004)), V((xpc0 + 0.02, yl, zt + 0.004))], r=0.0048, bend=0.02)
    P.cyl('tower_c', 0.0065, 0.012, (face - 0.002, yd, zd), 'trim', axis='X', segs=8, bev=None)
    xco, yco = x0 + 0.02, -0.17
    P.cyl('coil', 0.024, 0.1, (xco, yco, 0.39), 'trim', segs=14, bev=0.004, bsegs=1)
    P.box('coil_brk', (0.03, 0.03, 0.05), (xco, yco + 0.035, 0.39), 'steel', bev=0.003, segs=1)
    lead_path(P, [(face - 0.008, yd, zd), (face - 0.025, yd - 0.03, zd - 0.01), (xco - 0.02, yco, 0.47),
                  (xco, yco, 0.445)], bend=0.02)
    rear_plate(P, x0, zc, 0.17, 0.17, nb=8)
    # --- front: black timing-belt cover over both cam pulleys, crank pulley, the water pump and its fan, the
    # alternator low on the left, the V-belt
    xt1 = x1 + 0.034
    out = hull2d([(0.08 * math.cos(a), zc + 0.08 * math.sin(a)) for a in [math.tau * i / 28 for i in range(28)]] +
                 [(sg * yc + 0.066 * math.cos(a), 0.488 + 0.066 * math.sin(a))
                  for sg in (-1, 1) for a in [math.tau * i / 28 for i in range(28)]])
    plate_yz(P, 'belt_cover', clip2d(out, 1, 0.33), x1, xt1, 'trim', bev=0.008, segs=2)
    plate_yz(P, 'belt_cover_lo', clip2d(out, 1, 0.324, keep_above=False), x1, xt1 - 0.006, 'trim', bev=0.008,
             segs=2)
    plate_yz(P, 'belt_cover_back', out, x1 - 0.002, x1 + 0.014, 'trim', bev=0.003, segs=1)
    flange_bolts(P, [(xt1, sg * 0.1, 0.5) for sg in (-1, 1)] + [(xt1, sg * 0.075, 0.33) for sg in (-1, 1)] +
                 [(xt1, sg * 0.06, 0.13) for sg in (-1, 1)], (1, 0, 0), r=0.0052)
    xp = xt1 + 0.022
    pulley(P, xp, 0, zc, 0.07, 0.024, 'steel', grooves=1, segs=18)
    zw = 0.36
    P.cyl('pump_boss', 0.035, 0.016, (xt1 + 0.006, 0, zw), 'alu', axis='X', segs=16, bev=None)
    pulley(P, xp, 0, zw, 0.056, 0.02, 'steel', grooves=1, hub=False, segs=18)
    ya, za = 0.168, 0.255
    P.cyl('alt', 0.058, 0.095, (x1 - 0.03, ya, za), 'alu', axis='X', segs=20, bev=0.005, bsegs=2)
    for i in range(6):
        a = math.tau * i / 6 + 0.25
        P.box('alt_fin', (0.06, 0.006, 0.014), (x1 - 0.03, ya + math.cos(a) * 0.058, za + math.sin(a) * 0.058), 'alu',
              rot=(math.degrees(a), 0, 0), bev=None)
    P.cyl('alt_rear', 0.05, 0.02, (x1 - 0.088, ya, za), 'steel', axis='X', segs=16, bev=None)
    P.cyl('alt_shaft', 0.012, 0.06, (x1 + 0.03, ya, za), 'steel', axis='X', segs=10, bev=None)
    pulley(P, xp, ya, za, 0.034, 0.018, 'steel', grooves=1, hub=False, segs=16)
    P.box('alt_brk', (0.03, 0.05, 0.03), (x1 - 0.06, 0.12, 0.2), 'steel', bev=0.004, segs=1)
    P.tube('alt_arm', [(x1 - 0.0, ya - 0.03, za + 0.05), (x1 - 0.01, 0.11, 0.36)], 0.007, 'steel', segs=6)
    belt(P, xp, [(0.0, zc, 0.072), (ya, za, 0.036), (0.0, zw, 0.058)], width=0.013, thick=0.007)
    fan(P, xp + 0.04, 0, zw, 0.15, blades=5, hub_r=0.034, material='steel', pitch=26, chord=0.075)
    P.cyl('fan_clutch', 0.045, 0.026, (xp + 0.02, 0, zw), 'alu', axis='X', segs=18, bev=0.004, bsegs=1)
    # thermostat housing and the radiator hoses
    P.box('thermo', (0.05, 0.05, 0.05), (x1 - 0.02, 0.11, 0.5), 'alu', bev=0.01, segs=2)
    P.tube('hose_up', [(x1 + 0.0, 0.11, 0.505), (x1 + 0.06, 0.11, 0.51), (x1 + 0.12, 0.12, 0.5)], 0.019, 'rubber',
           segs=12, bend=0.04)
    P.torus('clamp', 0.021, 0.0028, loc=(x1 + 0.03, 0.11, 0.507), axis='X', segs=16, rsegs=4, material='steel')
    P.tube('hose_lo', [(xt1, -0.06, 0.29), (xt1 + 0.04, -0.09, 0.27), (xt1 + 0.08, -0.1, 0.25)], 0.018, 'rubber',
           segs=12, bend=0.04)
    # --- intake (left, +Y): polished runners, four throttle bodies on one shaft, chrome trumpets, injector rail
    yi = 0.125
    ax = V((0, math.cos(math.radians(18)), math.sin(math.radians(18))))
    for x in xs:
        P.box('in_flange', (0.058, 0.012, 0.05), (x, yi + 0.006, 0.487), 'alu', bev=0.003, segs=1)
        P.tube('runner', [(x, yi + 0.01, 0.487), (x, 0.165, 0.49), (x, 0.2, 0.5)], 0.022, 'chrome', segs=14,
               bend=0.03)
        c = V((x, 0.218, 0.506))
        P.box('itb', (0.052, 0.04, 0.054), tuple(c), 'alu', rot=(18, 0, 0), bev=0.006, segs=2)
        trumpet(P, c + ax * 0.018, ax, r0=0.021, r1=0.035, length=0.042, segs=12)
        P.cyl('injector', 0.009, 0.034, (x - 0.012, 0.172, 0.522), 'trim', rot=(-25, 0, 0), segs=8, bev=None)
    P.tube('throttle_shaft', [(xs[0] - 0.035, 0.218, 0.535), (xs[-1] + 0.035, 0.218, 0.535)], 0.004, 'steel', segs=6)
    P.box('throttle_arm', (0.012, 0.02, 0.04), (xs[-1] + 0.04, 0.218, 0.525), 'steel', bev=0.003, segs=1)
    P.tube('fuel_rail', [(xs[0] - 0.04, 0.168, 0.545), (xs[-1] + 0.03, 0.168, 0.545), (xs[-1] + 0.07, 0.17, 0.52)],
           0.0075, 'alu', segs=8, bend=0.02)
    P.cyl('fp_reg', 0.014, 0.03, (xs[0] - 0.05, 0.168, 0.545), 'alu', axis='X', segs=12, bev=0.002, bsegs=1)
    # --- exhaust (right, -Y): a steel 4-2-1 header hugging the block, its two pairs swept out low to a collector
    # that takes a turbo on top (a fitted turbo's housing then meets the primaries, as if fed by them)
    yh = -0.125
    yd = -0.152
    ym, zm = -0.215, 0.258
    for a, b in ((0, 1), (2, 3)):
        xj = (xs[a] + xs[b]) / 2
        for i in (a, b):
            x = xs[i]
            P.box('ex_flange', (0.055, 0.012, 0.045), (x, yh - 0.006, 0.487), 'steel', bev=0.004, segs=1)
            P.tube('primary', [(x, yh - 0.01, 0.487), (x, yd, 0.484), (x, yd - 0.004, 0.405),
                               (xj, yd - 0.012, 0.338)], 0.018, 'steel', segs=8, bend=0.035)
            flange_bolts(P, [(x + 0.02, yh - 0.012, 0.487), (x - 0.02, yh - 0.012, 0.487)], (0, -1, 0), r=0.005)
        sx = 1 if xj > xm else -1
        P.tube('secondary', [(xj, yd - 0.012, 0.338), (xj, yd - 0.016, 0.3), (xm + sx * 0.06, ym + 0.012, zm + 0.004),
                             (xm + sx * 0.03, ym, zm)], 0.021, 'steel', segs=12, bend=0.03)
    P.cyl('collector', 0.03, 0.07, (xm, ym, zm), 'steel', axis='X', segs=16, bev=0.006, bsegs=2)
    P.cyl('turbo_pad', 0.036, 0.012, (xm, ym, zm + 0.033), 'rust', segs=16, bev=0.003, bsegs=1)
    P.empty('M_turbo', (xm, ym, zm + 0.039), rot=(0, 0, -90))
    P.tube('ex_out', [(xm - 0.01, ym, zm - 0.02), (xm - 0.015, ym - 0.004, 0.2), (xm - 0.05, ym - 0.006, 0.165)],
           0.025, 'steel', segs=14, bend=0.035)
    P.cyl('ex_flange_out', 0.038, 0.012, (xm - 0.056, ym - 0.006, 0.158), 'steel', rot=(0, 30, 0), segs=16,
          bev=0.003, bsegs=1)
    P.empty('M_exhaust_out', (xm - 0.06, ym - 0.007, 0.151), rot=(0, 120, 0))
    # --- oil filter, dipstick, breather, starter, mounts
    P.cyl('filter', 0.042, 0.1, (-0.07, 0.2, 0.235), 'paint_b', axis='Y', segs=18, bev=0.006, bsegs=2)
    P.cyl('filter_base', 0.035, 0.02, (-0.07, 0.145, 0.235), 'alu', axis='Y', segs=14, bev=0.003, bsegs=1)
    P.tube('dipstick', [(xm - 0.1, 0.135, 0.25), (xm - 0.1, 0.142, 0.45), (xm - 0.1, 0.14, 0.565)], 0.004, 'steel',
           segs=6, bend=0.08)
    P.torus('dip_ring', 0.014, 0.004, loc=(xm - 0.1, 0.14, 0.58), rot=(0, 90, 0), segs=12, rsegs=4,
            material='paint_b')
    P.tube('breather', [(x0 + 0.04, 0.09, 0.58), (x0 + 0.01, 0.12, 0.6), (x0 + 0.02, 0.16, 0.54)], 0.008, 'rubber',
           segs=8, bend=0.03)
    starter(P, -0.19, -0.152, 0.13, length=0.14, r=0.042)
    mounts(P, 0.04, 0.205, 0.2)
    P.views = [('a', 35, 22), ('b', 215, 22)]


# ------------------------------------------------------------------------------------------------ eng_i6


def build_eng_i6(P):
    """3.0 L straight-six: a long painted block, an alloy head under a long black cam cover with polished ribs, its
    six plug leads looping back in a loom from the distributor on the front of the head, a cast intake with six
    swan-neck runners up into a long finned plenum and its throttle body, two cast three-into-one exhaust manifolds
    on the other side meeting at a turbo pad, the fan and its clutch, the alternator low on the left."""
    P.ao_distance = 0.13
    zc = 0.18
    pitch = 0.095
    L = 6 * pitch + 0.05
    xm = -0.06
    x0, x1 = xm - L / 2, xm + L / 2
    xs = [xm + pitch * (i - 2.5) for i in range(6)]
    sump(P, x0 + 0.005, x1 - 0.005, 0.125, 0.135, xm - 0.05, zshallow=0.06, bolts=7)
    P.box('skirt', (L, 0.29, 0.10), (xm, 0, 0.187), 'paint', bev=0.01, segs=2)
    bm = bmesh.new()
    K.bm_cube(bm, (L, 0.25, 0.22), mat4((xm, 0, 0.347)))
    for v in bm.verts:
        if v.co.z < 0.33:
            v.co.y *= 1.08
    P.mesh('block', bm, 'paint', bev=0.01, segs=2)
    for sg in (-1, 1):
        for i in range(7):
            P.box('rib', (0.016, 0.012, 0.19), (x0 + 0.025 + pitch * i, sg * 0.129, 0.34), 'paint', bev=0.003,
                  segs=1, open='-y' if sg > 0 else '+y')
        for x in xs[1::2]:
            P.cyl('plug', 0.019, 0.008, (x, sg * 0.129, 0.36), 'alu', axis='Y', segs=10, bev=None)
    P.box('gasket', (L - 0.01, 0.25, 0.006), (xm, 0, 0.46), 'trim', bev=None)
    P.box('head', (L - 0.01, 0.24, 0.085), (xm, 0, 0.5055), 'alu', bev=0.009, segs=2)
    # --- the long black cam cover, polished ribs on its left half, six plug wells down its right half
    zt = 0.6055
    P.box('cover_flange', (L - 0.03, 0.21, 0.01), (xm, 0, 0.553), 'trim', bev=0.003, segs=1)
    P.box('cam_cover', (L - 0.05, 0.19, 0.052), (xm, 0, zt - 0.026), 'trim', bev=0.02, segs=3)
    for yr in (0.025, 0.045, 0.065):
        P.box('cover_rib', (L - 0.17, 0.007, 0.007), (xm - 0.055, yr, zt + 0.0025), 'alu', bev=0.0025, segs=1,
              open='-z')
    flange_bolts(P, [(x, sg * 0.1, 0.558) for x in (xm - 0.25, xm, xm + 0.25) for sg in (-1, 1)],
                 (0, 0, 1), r=0.0055, material='chrome')
    oil_seat(P, x1 - 0.07, 0.045, zt, 0.022)
    yp = -0.04
    for x in xs:
        P.cyl('boot', 0.0105, 0.03, (x, yp, zt + 0.014), 'rubber', segs=8, bev=None)
    # the distributor on the front of the head, its cap facing forward; the leads loop back over it into a loom
    xd, yd, zd = x1 - 0.005, -0.06, 0.515
    P.cyl('dist_body', 0.026, 0.032, (xd + 0.016, yd, zd), 'alu', axis='X', segs=14, bev=0.003, bsegs=1)
    xcap = xd + 0.032
    P.lathe('dist_cap', [(0.0, 0.0), (0.04, 0.0), (0.042, 0.016), (0.036, 0.03), (0.0, 0.035)],
            loc=(xcap, yd, zd), material='trim', axis='X', segs=18, sharp=40)
    face = xcap + 0.035
    for i, x in enumerate(xs[::-1]):
        a = math.radians(60 * i + 30)
        t = V((face + 0.004, yd + 0.024 * math.cos(a), zd + 0.024 * math.sin(a)))
        P.cyl('tower', 0.006, 0.012, tuple(t - V((0.004, 0, 0))), 'trim', axis='X', segs=8, bev=None)
        top = V((x, yp, zt + 0.031))
        yl, zl = -0.07 - 0.004 * (i % 2), zt + 0.022 + 0.006 * (i // 2)
        lead_path(P, [t, t + V((0.016, 0, 0.03)), V((face - 0.025, yl, zt + 0.036)), V((x + 0.035, yl, zl)),
                      V((x + 0.006, yp - 0.006, top.z + 0.006)), top], r=0.0042, material='paint_b', bend=0.03)
    for x in (xm + 0.15, xm - 0.08):
        P.box('loom_clip', (0.018, 0.016, 0.03), (x, -0.072, zt + 0.03), 'trim', bev=0.004, segs=1)
    P.tube('lead_c', [(face + 0.004, yd, zd), (face + 0.02, yd - 0.02, zd - 0.01), (x1 + 0.06, -0.14, 0.49),
                      (x1 + 0.04, -0.14, 0.472)], 0.0042, 'trim', segs=4, bend=0.02)
    P.cyl('coil', 0.024, 0.1, (x1 + 0.04, -0.14, 0.42), 'trim', segs=14, bev=0.004, bsegs=1)
    P.box('coil_brk', (0.03, 0.03, 0.05), (x1 + 0.03, -0.112, 0.42), 'steel', bev=0.003, segs=1)
    lift_eye(P, x1 - 0.05, 0.12, 0.575)
    lift_eye(P, x0 + 0.05, -0.12, 0.575)
    # --- intake (left, +Y): six swan-neck runners up into the long plenum, its fins, the throttle body
    yi = 0.12
    for x in xs:
        P.box('in_flange', (0.052, 0.012, 0.042), (x, yi + 0.006, 0.505), 'alu', bev=0.003, segs=1)
        P.tube('runner', [(x, yi + 0.01, 0.505), (x, 0.19, 0.49), (x, 0.214, 0.562)], 0.0185, 'alu', segs=8,
               bend=0.03)
    xpl = xm - 0.01
    P.box('plenum', (0.56, 0.085, 0.075), (xpl, 0.215, 0.595), 'alu', bev=0.022, segs=3)
    for yr in (0.198, 0.232):
        P.box('plenum_fin', (0.44, 0.007, 0.008), (xpl - 0.02, yr, 0.6365), 'alu', bev=0.0025, segs=1, open='-z')
    xtb = xpl + 0.28
    P.cyl('throttle_body', 0.034, 0.05, (xtb + 0.02, 0.215, 0.595), 'alu', axis='X', segs=18, bev=0.004, bsegs=1)
    P.tube('in_hose', [(xtb + 0.04, 0.215, 0.595), (xtb + 0.08, 0.22, 0.6)], 0.038, 'rubber', segs=16)
    P.torus('clamp', 0.04, 0.0032, loc=(xtb + 0.052, 0.215, 0.596), axis='X', segs=18, rsegs=3, material='steel')
    P.box('tb_lever', (0.012, 0.03, 0.04), (xtb + 0.02, 0.258, 0.585), 'steel', bev=0.003, segs=1)
    # --- exhaust (right, -Y): two cast three-into-one manifolds meeting at a flanged joint with the turbo pad
    yh = -0.12
    ye, ze = -0.2, 0.44
    for k, grp in enumerate((xs[:3], xs[3:])):
        for x in grp:
            P.box('ex_flange', (0.058, 0.014, 0.046), (x, yh - 0.007, 0.502), 'rust', bev=0.004, segs=1)
            P.tube('ex_stub', [(x, yh - 0.012, 0.502), (x, -0.17, 0.495), (x * 0.92 + xm * 0.08, ye, ze)], 0.024,
                   'rust', segs=8, bend=0.03)
            flange_bolts(P, [(x + 0.022, yh - 0.015, 0.502), (x - 0.022, yh - 0.015, 0.502)], (0, -1, 0), r=0.0055)
        xa, xb = (grp[0] - 0.035, xm - 0.012) if k == 0 else (xm + 0.012, grp[-1] + 0.035)
        P.tube('ex_log', [(xa, ye, ze), (xb, ye, ze)], 0.03, 'rust', segs=14)
        P.sphere('ex_cap', 0.03, (xa if k == 0 else xb, ye, ze), 'rust', u=12, v=5)
        P.cyl('ex_joint', 0.044, 0.012, ((xm - 0.012) if k == 0 else (xm + 0.012), ye, ze), 'rust', axis='X', segs=14,
              bev=0.002, bsegs=1)
    flange_bolts(P, [(xm, ye + 0.042 * math.cos(a), ze + 0.042 * math.sin(a)) for a in (0.6, 2.5, 3.7, 5.6)],
                 (1, 0, 0), r=0.005)
    P.cyl('turbo_pad', 0.042, 0.014, (xm, ye, ze + 0.034), 'rust', segs=16, bev=0.003, bsegs=1)
    P.empty('M_turbo', (xm, ye, ze + 0.041), rot=(0, 0, -90))
    P.tube('ex_out', [(xm, ye - 0.004, ze - 0.028), (xm - 0.01, ye - 0.01, 0.33), (xm - 0.06, ye - 0.012, 0.285)],
           0.03, 'rust', segs=14, bend=0.045)
    P.cyl('ex_flange_out', 0.046, 0.012, (xm - 0.066, ye - 0.012, 0.278), 'rust', rot=(0, 30, 0), segs=16,
          bev=0.003, bsegs=1)
    P.empty('M_exhaust_out', (xm - 0.07, ye - 0.013, 0.27), rot=(0, 120, 0))
    # --- front: the cast timing cover, damper, water pump with the fan clutch and fan, alternator, belt, hoses
    out = K.rounded_rect(0.24, 0.40, 0.08, seg=4)
    out = [(y, z + 0.3) for (y, z) in out]
    plate_yz(P, 'timing', out, x1, x1 + 0.04, 'alu', bev=0.012, segs=2)
    flange_bolts(P, [(x1 + 0.04, sg * 0.1, z) for z in (0.16, 0.44) for sg in (-1, 1)], (1, 0, 0), r=0.0055)
    xp = x1 + 0.06
    zw = 0.4
    P.cyl('pump_body', 0.05, 0.03, (x1 + 0.05, 0, zw), 'alu', axis='X', segs=18, bev=0.004, bsegs=1)
    pulley(P, xp, 0, zc, 0.09, 0.034, 'steel', grooves=2, segs=18)
    pulley(P, xp + 0.004, 0, zw, 0.064, 0.026, 'steel', grooves=2, hub=False, segs=16)
    ya, za = 0.19, 0.272
    P.cyl('alt', 0.062, 0.1, (x1 + 0.0, ya, za), 'alu', axis='X', segs=20, bev=0.006, bsegs=2)
    for i in range(6):
        a = math.tau * i / 6 + 0.2
        P.box('alt_fin', (0.06, 0.006, 0.014), (x1 + 0.0, ya + math.cos(a) * 0.062, za + math.sin(a) * 0.062), 'alu',
              rot=(math.degrees(a), 0, 0), bev=None)
    P.cyl('alt_shaft', 0.012, 0.03, (x1 + 0.055, ya, za), 'steel', axis='X', segs=10, bev=None)
    pulley(P, xp + 0.002, ya, za, 0.036, 0.02, 'steel', grooves=1, hub=False, segs=16)
    P.box('alt_brk', (0.04, 0.06, 0.03), (x1 - 0.02, 0.14, 0.215), 'steel', bev=0.005, segs=1)
    P.tube('alt_arm', [(x1 + 0.02, ya - 0.03, za + 0.055), (x1 + 0.01, 0.1, 0.42)], 0.007, 'steel', segs=6)
    belt(P, xp + 0.002, [(0.0, zc, 0.092), (ya, za, 0.038), (0.0, zw, 0.066)], width=0.016, thick=0.008)
    P.cyl('fan_clutch', 0.055, 0.03, (xp + 0.035, 0, zw), 'alu', axis='X', segs=20, bev=0.005, bsegs=1)
    fan(P, xp + 0.062, 0, zw, 0.185, blades=6, hub_r=0.045, material='steel', pitch=26, chord=0.08)
    P.box('thermo', (0.06, 0.06, 0.05), (x1 - 0.03, 0.075, 0.535), 'alu', bev=0.012, segs=2)
    P.tube('hose_up', [(x1 - 0.005, 0.075, 0.54), (x1 + 0.05, 0.08, 0.56), (x1 + 0.1, 0.09, 0.555)], 0.022, 'rubber',
           segs=12, bend=0.04)
    P.torus('clamp', 0.024, 0.003, loc=(x1 + 0.02, 0.077, 0.548), axis='X', segs=16, rsegs=4, material='steel')
    P.tube('hose_lo', [(x1 + 0.04, 0.07, 0.33), (x1 + 0.08, 0.1, 0.31), (x1 + 0.1, 0.11, 0.29)], 0.022, 'rubber',
           segs=12, bend=0.03)
    # --- oil filter, dipstick, starter, rear plate, mounts
    P.cyl('filter', 0.05, 0.12, (xm - 0.11, 0.21, 0.25), 'paint_b', axis='Y', segs=18, bev=0.008, bsegs=2)
    P.cyl('filter_base', 0.042, 0.025, (xm - 0.11, 0.142, 0.25), 'alu', axis='Y', segs=14, bev=None)
    P.tube('dipstick', [(xm + 0.095, -0.138, 0.27), (xm + 0.095, -0.15, 0.5), (xm + 0.095, -0.142, 0.6)], 0.005,
           'steel', segs=6, bend=0.08)
    P.torus('dip_ring', 0.016, 0.0045, loc=(xm + 0.095, -0.142, 0.618), rot=(0, 90, 0), segs=12, rsegs=4,
            material='paint_b')
    P.tube('breather', [(x0 + 0.05, 0.08, 0.6), (x0 + 0.02, 0.12, 0.62), (x0 + 0.04, 0.17, 0.6)], 0.009, 'rubber',
           segs=8, bend=0.03)
    starter(P, x0 + 0.085, -0.165, 0.14, length=0.16, r=0.046)
    rear_plate(P, x0, zc, 0.18, 0.18, nb=10)
    mounts(P, xm + 0.08, 0.205, 0.215)
    P.views = [('a', 35, 22), ('b', 215, 22)]


# ------------------------------------------------------------------------------------------------ eng_v6


def vframe(sg, half, zc):
    """The axes of one bank of a V (half = half the V's angle, deg; sg = -1 right bank, +1 left): along the bores
    (up and out), across them (out and down), and the matrix rotation of a box lying on the bank."""
    a = math.radians(half)
    ax = V((0, sg * math.sin(a), math.cos(a)))
    acr = V((0, sg * math.cos(a), -math.sin(a)))
    return ax, acr, (-sg * half, 0, 0)


def vbox(P, name, sg, half, zc, xc, d, size, material, across=0.0, bev=0.01, segs=2, **kw):
    """A box on a bank of a V: its centre d along the bores from the crank (and `across` out), size = (along x,
    across the bank, along the bores)."""
    ax, acr, rot = vframe(sg, half, zc)
    c = V((xc, 0, zc)) + ax * d + acr * across
    return P.box(name, size, tuple(c), material, rot=rot, bev=bev, segs=segs, **kw)


def vpoint(sg, half, zc, x, d, across=0.0):
    ax, acr, _ = vframe(sg, half, zc)
    return V((x, 0, zc)) + ax * d + acr * across


def build_eng_v6(P):
    """3.0 L 60-degree V6: an iron block with two short alloy heads under black cam covers, the red plenum on top
    with its throttle body and the runners down into the vee, a black timing-belt cover over the crank and both cam
    pulleys, the water pump and fan in the middle, a cast three-into-one manifold outside each head with a turbo
    pad on the right one, the distributor at the back of the vee and its six leads along the covers."""
    P.ao_distance = 0.13
    zc = 0.17
    half = 30.0
    xm = -0.02
    pitch = 0.105
    banks = {-1: [xm - 0.015 + pitch * (i - 1) for i in range(3)], 1: [xm + 0.015 + pitch * (i - 1) for i in range(3)]}
    sump(P, xm - 0.19, xm + 0.19, 0.13, 0.11, xm - 0.04, zshallow=0.05, bolts=5)
    P.box('crankcase', (0.40, 0.30, 0.16), (xm, 0, 0.18), 'steel', bev=0.012, segs=2)
    ports, plugs, ex_ports = {}, {}, {}
    for sg, xsb in banks.items():
        xb = sum(xsb) / len(xsb)
        vbox(P, 'bank', sg, half, zc, xb, 0.17, (0.36, 0.15, 0.20), 'steel')
        vbox(P, 'gasket', sg, half, zc, xb, 0.272, (0.35, 0.162, 0.006), 'trim', bev=None)
        vbox(P, 'head', sg, half, zc, xb, 0.312, (0.35, 0.16, 0.075), 'alu', bev=0.008)
        vbox(P, 'cover_flange', sg, half, zc, xb, 0.354, (0.33, 0.14, 0.01), 'trim', bev=0.003, segs=1)
        vbox(P, 'cam_cover', sg, half, zc, xb, 0.378, (0.32, 0.125, 0.042), 'trim', bev=0.016, segs=3)
        for dx in (-0.1, 0.0, 0.1):
            vbox(P, 'cover_rib', sg, half, zc, xb + dx, 0.401, (0.012, 0.09, 0.008), 'trim', bev=0.003, segs=1,
                 open='-z')
        ax, acr, _ = vframe(sg, half, zc)
        for dx in (-0.14, 0.0, 0.14):
            for s2 in (-1, 1):
                P.bolt(tuple(vpoint(sg, half, zc, xb + dx, 0.359, s2 * 0.064)), normal=tuple(ax), r=0.0055, h=0.005,
                       washer=False, material='chrome')
        for i, x in enumerate(xsb):
            # ribs between the bores, the plug on the outer top edge of the head
            vbox(P, 'rib', sg, half, zc, x - pitch / 2 + 0.002, 0.16, (0.014, 0.012, 0.17), 'steel', across=0.078,
                 bev=0.003, segs=1)
            plugs[(sg, i)] = vpoint(sg, half, zc, x, 0.35, 0.074)
            ports[(sg, i)] = vpoint(sg, half, zc, x, 0.31, -0.083)
            ex_ports[(sg, i)] = vpoint(sg, half, zc, x, 0.305, 0.083)
        vbox(P, 'rib', sg, half, zc, xsb[-1] + pitch / 2 - 0.002, 0.16, (0.014, 0.012, 0.17), 'steel', across=0.078,
             bev=0.003, segs=1)
    # --- the plenum on top: red, rounded, ribbed, the throttle body and its elbow at the front, runners into the vee
    zp = 0.585
    P.box('plenum', (0.36, 0.2, 0.09), (xm - 0.01, 0, zp), 'paint', bev=0.03, segs=3)
    for yr in (-0.05, 0.0, 0.05):
        P.box('plenum_rib', (0.28, 0.008, 0.008), (xm - 0.03, yr, zp + 0.046), 'paint', bev=0.003, segs=1, open='-z')
    for (sg, i), p in sorted(ports.items()):
        ax, acr, rot = vframe(sg, half, zc)
        P.box('in_flange', (0.05, 0.04, 0.012), tuple(p - acr * 0.004), 'alu', rot=(rot[0] + sg * 90, 0, 0), bev=0.003,
              segs=1)
        top = V((p.x, sg * 0.06, zp - 0.04))
        P.tube('runner', [p - acr * 0.008, p - acr * 0.03 + ax * 0.01, top], 0.02, 'alu', segs=8, bend=0.03)
    xtb = xm + 0.17
    P.cyl('throttle_body', 0.036, 0.05, (xtb + 0.02, 0, zp - 0.005), 'alu', axis='X', segs=18, bev=0.004, bsegs=1)
    P.cyl('tb_ring', 0.04, 0.008, (xtb + 0.046, 0, zp - 0.005), 'alu', axis='X', segs=18, bev=None)
    P.tube('in_elbow', [(xtb + 0.048, 0, zp - 0.005), (xtb + 0.085, -0.01, zp - 0.005),
                        (xtb + 0.11, -0.06, zp + 0.005)], 0.034, 'rubber', segs=16, bend=0.04)
    P.torus('clamp', 0.036, 0.003, loc=(xtb + 0.058, 0, zp - 0.005), axis='X', segs=18, rsegs=3, material='steel')
    P.box('tb_lever', (0.012, 0.035, 0.03), (xtb + 0.02, -0.048, zp - 0.02), 'steel', bev=0.003, segs=1)
    P.tube('pcv', [(xm - 0.12, 0.12, 0.55), (xm - 0.13, 0.1, zp + 0.01), (xm - 0.12, 0.08, zp + 0.03)], 0.007,
           'rubber', segs=6, bend=0.02)
    # --- the distributor at the back of the vee and its six leads out to the plugs along the covers' outer edges
    xd = xm - 0.24
    P.cyl('dist_body', 0.028, 0.1, (xd, 0, 0.44), 'alu', segs=14, bev=0.003, bsegs=1)
    P.lathe('dist_cap', [(0.0, 0.0), (0.045, 0.0), (0.048, 0.022), (0.04, 0.044), (0.0, 0.05)],
            loc=(xd, 0, 0.49), material='trim', segs=20, sharp=40)
    for (sg, i), pl in sorted(plugs.items()):
        ax, acr, rot = vframe(sg, half, zc)
        P.cyl('boot', 0.011, 0.034, tuple(pl + ax * 0.012), 'rubber', rot=rot, segs=8, bev=None)
        a = math.radians(40 + 50 * i) * sg
        top = V((xd + 0.03 * math.cos(a), 0.03 * math.sin(a) * 1.0, 0.536))
        tip = pl + ax * 0.03
        yl, zl = sg * (0.278 + 0.005 * i), 0.452 + 0.004 * i
        lead_path(P, [top, top + V((0, 0, 0.018)), V((xd + 0.035, sg * 0.21, 0.52)), V((banks[sg][0] - 0.075, yl, zl)),
                      V((tip.x - 0.035, yl, zl)), tip + acr * 0.018 + ax * 0.008, tip], bend=0.025)
    # --- front: the V-shaped black timing-belt cover, crank and pump pulleys, the fan, alternator low on the left
    xf = xm + 0.205
    camc = {sg: vpoint(sg, half, zc, 0.0, 0.33) for sg in (-1, 1)}
    for sg in (-1, 1):
        c = camc[sg]
        out = capsule2d((0.0, zc), 0.088, (c.y, c.z), 0.07, n=28)
        plate_yz(P, 'belt_cover', out, xf, xf + 0.034, 'trim', bev=0.008, segs=2)
        P.bolt((xf + 0.034, c.y * 0.72, c.z * 0.72 + zc * 0.28), normal=(1, 0, 0), r=0.005, h=0.005, washer=False)
        P.bolt((xf + 0.034, c.y * 1.05, c.z + 0.04), normal=(1, 0, 0), r=0.005, h=0.005, washer=False)
    xp = xf + 0.054
    zw = 0.345
    P.cyl('pump_boss', 0.036, 0.02, (xf + 0.04, 0, zw), 'alu', axis='X', segs=16, bev=None)
    pulley(P, xp, 0, zc, 0.082, 0.03, 'steel', grooves=2, segs=18)
    pulley(P, xp, 0, zw, 0.06, 0.022, 'steel', grooves=1, hub=False, segs=18)
    ya, za = 0.212, 0.205
    P.cyl('alt', 0.06, 0.1, (xf - 0.03, ya, za), 'alu', axis='X', segs=20, bev=0.006, bsegs=2)
    for i in range(6):
        a = math.tau * i / 6 + 0.2
        P.box('alt_fin', (0.06, 0.006, 0.014), (xf - 0.03, ya + math.cos(a) * 0.06, za + math.sin(a) * 0.06), 'alu',
              rot=(math.degrees(a), 0, 0), bev=None)
    P.cyl('alt_shaft', 0.012, 0.04, (xf + 0.035, ya, za), 'steel', axis='X', segs=10, bev=None)
    pulley(P, xp, ya, za, 0.035, 0.02, 'steel', grooves=1, hub=False, segs=16)
    P.box('alt_brk', (0.04, 0.05, 0.03), (xf - 0.04, 0.16, 0.15), 'steel', bev=0.005, segs=1)
    belt(P, xp, [(0.0, zc, 0.084), (ya, za, 0.037), (0.0, zw, 0.062)], width=0.015, thick=0.008)
    P.cyl('fan_clutch', 0.05, 0.026, (xp + 0.03, 0, zw), 'alu', axis='X', segs=18, bev=0.004, bsegs=1)
    fan(P, xp + 0.055, 0, zw, 0.16, blades=5, hub_r=0.04, material='steel', pitch=26, chord=0.075)
    P.box('thermo', (0.05, 0.06, 0.05), (xf - 0.025, 0.0, 0.5), 'alu', bev=0.01, segs=2)
    P.tube('hose_up', [(xf - 0.005, 0, 0.5), (xf + 0.04, 0.0, 0.51), (xf + 0.075, 0.02, 0.505)], 0.022, 'rubber',
           segs=12, bend=0.03)
    P.torus('clamp', 0.024, 0.003, loc=(xf + 0.012, 0, 0.503), axis='X', segs=16, rsegs=3, material='steel')
    # --- exhaust: a cast three-into-one manifold outside each head, the outlet down at the back; turbo pad on the
    # right one (tilted out like the V8's)
    for sg in (-1, 1):
        ye, ze = sg * 0.288, 0.335
        xsb = banks[sg]
        for i, x in enumerate(xsb):
            p = ex_ports[(sg, i)]
            ax, acr, rot = vframe(sg, half, zc)
            P.box('ex_flange', (0.055, 0.045, 0.012), tuple(p + acr * 0.004), 'rust', rot=(rot[0] - sg * 90, 0, 0),
                  bev=0.004, segs=1)
            P.tube('ex_stub', [p + acr * 0.008, p + acr * 0.035, V((x * 0.9 + xm * 0.1, ye, ze))], 0.023, 'rust',
                   segs=8, bend=0.03)
        P.tube('ex_log', [(xsb[0] - 0.04, ye, ze), (xsb[-1] + 0.03, ye, ze)], 0.03, 'rust', segs=14)
        P.sphere('ex_cap', 0.03, (xsb[-1] + 0.03, ye, ze), 'rust', u=12, v=5)
        xo = xsb[0] - 0.04
        P.tube('ex_out', [(xo, ye, ze), (xo - 0.04, ye, ze - 0.01), (xo - 0.06, ye * 0.98, ze - 0.08)], 0.03, 'rust',
               segs=14, bend=0.035)
        P.cyl('ex_flange_out', 0.045, 0.012, (xo - 0.062, ye * 0.98, ze - 0.09), 'rust', segs=16, bev=0.003, bsegs=1)
        P.empty('M_exhaust_out' if sg < 0 else 'M_exhaust_out2', (xo - 0.062, ye * 0.98, ze - 0.097), rot=(0, 90, 0))
    tp = V((xm + 0.01, -0.288, 0.335)) + V((0, -0.707, 0.707)) * 0.03
    P.cyl('turbo_pad', 0.04, 0.012, tuple(tp), 'rust', axis=(0, -0.707, 0.707), segs=16, bev=0.003, bsegs=1)
    P.empty('M_turbo', tuple(tp + V((0, -0.707, 0.707)) * 0.006), rot=(45, 0, 0))
    # --- oil filler neck on the left cam cover, oil filter, dipstick, starter, rear plate, mounts
    xo, yo = xm + 0.07, 0.2
    zo = 0.541
    P.cyl('filler_neck', 0.026, 0.05, (xo, yo, zo - 0.025), 'trim', segs=18, bev=None)
    P.cyl('filler_lip', 0.03, 0.006, (xo, yo, zo - 0.003), 'trim', segs=18, bev=None)
    oil_seat(P, xo, yo, zo, 0.024)
    P.cyl('filter', 0.046, 0.11, (xm - 0.08, -0.2, 0.17), 'paint_b', axis='Y', segs=18, bev=0.007, bsegs=2)
    P.cyl('filter_base', 0.04, 0.03, (xm - 0.08, -0.15, 0.17), 'alu', axis='Y', segs=14, bev=None)
    P.tube('dipstick', [(xf - 0.03, 0.05, 0.25), (xf - 0.032, 0.045, 0.42), (xf - 0.03, 0.045, 0.5)], 0.0045, 'steel',
           segs=6, bend=0.06)
    P.torus('dip_ring', 0.015, 0.0045, loc=(xf - 0.03, 0.045, 0.517), rot=(0, 90, 0), segs=12, rsegs=4,
            material='paint_b')
    starter(P, xm - 0.15, 0.19, 0.11, length=0.15, r=0.045)
    rear_plate(P, xm - 0.2, zc, 0.17, 0.17, nb=8)
    mounts(P, xm + 0.06, 0.2, 0.17)
    P.views = [('a', 35, 24), ('b', 215, 24)]


# ------------------------------------------------------------------------------------------------ eng_v12


def build_eng_v12(P):
    """5.5 L 60-degree V12, the long grand-tourer kind: an alloy block, four red cam covers (two per bank) with the
    plug leads down black channels between them from a distributor on the back of each bank, six twin-choke
    carburettors down the vee with twelve chrome trumpets, a fuel line and the throttle linkage along them, steel
    headers sweeping into a collector on each side, a finned alloy sump, the cast timing case."""
    P.ao_distance = 0.13
    zc = 0.17
    half = 30.0
    xm = -0.07
    pitch = 0.125
    banks = {sg: [xm + sg * 0.0125 + pitch * (i - 2.5) for i in range(6)] for sg in (-1, 1)}
    Lb = 6 * pitch + 0.05
    # --- crankcase, the finned alloy sump
    sump(P, xm - 0.39, xm + 0.39, 0.13, 0.11, xm - 0.05, zshallow=0.05, material='alu', bolts=7)
    for sg in (-1, 1):
        for k in range(3):
            P.box('sump_fin', (0.3, 0.008, 0.012), (xm - 0.24, sg * 0.134, 0.022 + 0.026 * k), 'alu', bev=None,
                  open='-y' if sg > 0 else '+y')
    P.box('crankcase', (Lb + 0.02, 0.30, 0.16), (xm, 0, 0.18), 'alu', bev=0.012, segs=2)
    plugs, in_ports, ex_ports = {}, {}, {}
    for sg, xsb in banks.items():
        xb = sum(xsb) / len(xsb)
        ax, acr, rot = vframe(sg, half, zc)
        vbox(P, 'bank', sg, half, zc, xb, 0.17, (Lb, 0.15, 0.20), 'alu')
        vbox(P, 'gasket', sg, half, zc, xb, 0.272, (Lb - 0.01, 0.17, 0.006), 'trim', bev=None)
        vbox(P, 'head', sg, half, zc, xb, 0.312, (Lb - 0.01, 0.17, 0.075), 'alu', bev=0.008)
        for k in (-1, 1):
            vbox(P, 'cam_cover', sg, half, zc, xb, 0.37, (Lb - 0.04, 0.072, 0.042), 'paint', across=k * 0.046,
                 bev=0.015, segs=2)
            ra, rb = xb - Lb / 2 + 0.08, (xm + 0.15 if (sg, k) == (1, 1) else xb + Lb / 2 - 0.1)
            vbox(P, 'cover_rib', sg, half, zc, (ra + rb) / 2, 0.392, (rb - ra, 0.007, 0.006), 'paint',
                 across=k * 0.046 + 0.012, bev=0.002, segs=1, open='-z')
            P.bolts([tuple(vpoint(sg, half, zc, xb + dx, 0.392, k * 0.046 - 0.02 * k)) for dx in (-0.3, 0.3)],
                    normal=tuple(ax), r=0.005, h=0.0045, washer=False, material='chrome')
        # the plug channel down the middle of the bank
        vbox(P, 'plug_channel', sg, half, zc, xb + 0.01, 0.385, (Lb - 0.07, 0.022, 0.016), 'trim', bev=0.004,
             segs=1)
        for i, x in enumerate(xsb):
            vbox(P, 'rib', sg, half, zc, x - pitch / 2 + 0.002, 0.16, (0.014, 0.012, 0.17), 'alu', across=0.078,
                 bev=None)
            in_ports[(sg, i)] = vpoint(sg, half, zc, x, 0.31, -0.087)
            ex_ports[(sg, i)] = vpoint(sg, half, zc, x, 0.305, 0.087)
        vbox(P, 'rib', sg, half, zc, xsb[-1] + pitch / 2 - 0.002, 0.16, (0.014, 0.012, 0.17), 'alu', across=0.078,
             bev=None)
        # the distributor on the back of the bank (off the exhaust cam) and its six leads into the channel
        xr = xb - Lb / 2
        dc = vpoint(sg, half, zc, xr - 0.016, 0.35, 0.046)
        P.cyl('dist_body', 0.024, 0.03, tuple(dc), 'alu', axis='X', segs=12, bev=None)
        P.lathe('dist_cap', [(0.0, 0.0), (0.038, 0.0), (0.04, 0.016), (0.034, 0.03), (0.0, 0.034)],
                loc=tuple(dc - V((0.015, 0, 0))), material='trim', axis='-X', segs=16, sharp=40)
        face = dc.x - 0.049
        ch = vpoint(sg, half, zc, xr + 0.03, 0.39, 0.0)
        for i in range(6):
            a = math.radians(60 * i)
            t = V((face, dc.y + 0.022 * math.cos(a), dc.z + 0.022 * math.sin(a)))
            lead_path(P, [t, V((face - 0.03, (t.y + ch.y) / 2, ch.z + 0.012 + 0.003 * i)),
                          ch + V((0.03, sg * 0.003 * (i - 2.5), 0.002 * i - 0.005))], r=0.004, bend=0.025)
        P.cyl('tower_c', 0.006, 0.01, (face - 0.002, dc.y, dc.z), 'trim', axis='X', segs=8, bev=None)
        lead_path(P, [(face - 0.006, dc.y, dc.z), (face - 0.03, dc.y * 0.6, dc.z - 0.01), (xm - 0.45, 0.0, 0.47),
                      (xm - 0.45, 0.0, 0.452)], r=0.004, bend=0.02)
    # the coil on the back of the vee, feeding both distributors
    P.cyl('coil', 0.026, 0.1, (xm - 0.45, 0.0, 0.40), 'trim', segs=14, bev=0.004, bsegs=1)
    P.box('coil_brk', (0.03, 0.05, 0.03), (xm - 0.45, 0.0, 0.34), 'alu', bev=0.005, segs=1)
    # --- the vee: six twin-choke carburettors on their manifolds, twelve trumpets, fuel line and linkage
    zk = 0.585
    xk = [(banks[-1][i] + banks[1][i]) / 2 for i in range(6)]
    for i, x in enumerate(xk):
        P.box('carb', (0.07, 0.11, 0.06), (x, 0, zk), 'alu', bev=0.007, segs=1)
        P.box('carb_base', (0.08, 0.13, 0.014), (x, 0, zk - 0.035), 'alu', bev=None)
        for sg in (-1, 1):
            p = in_ports[(sg, i)]
            ax, acr, rot = vframe(sg, half, zc)
            P.tube('runner', [p - acr * 0.004, p - acr * 0.03 + ax * 0.012, V((p.x, sg * 0.032, zk - 0.04))], 0.019,
                   'alu', segs=8, bend=0.03)
            P.lathe('trumpet', K.shell_profile([(0.019, 0.0), (0.021, 0.026), (0.029, 0.04)], 0.002),
                    loc=(x, sg * 0.032, zk + 0.03), material='chrome', segs=10, sharp=60.0, loop=True)
        P.cyl('bowl', 0.016, 0.03, (x + 0.042, 0.0, zk + 0.004), 'alu', segs=10, bev=None)
    P.tube('fuel_line', [(xk[0] + 0.042, 0.0, zk + 0.024), (xk[-1] + 0.042, 0.0, zk + 0.024),
                         (xk[-1] + 0.09, 0.0, zk - 0.02), (xk[-1] + 0.1, 0.06, 0.5)], 0.0035, 'steel', segs=5,
           bend=0.03)
    for sg in (-1, 1):
        P.tube('linkage', [(xk[0] - 0.02, sg * 0.062, zk + 0.01), (xk[-1] + 0.02, sg * 0.062, zk + 0.01)], 0.0035,
               'steel', segs=5)
    # --- exhaust: six steel primaries per bank sweeping down into a collector that runs back to a flange
    for sg in (-1, 1):
        ye, ze = sg * 0.345, 0.32
        xsb = banks[sg]
        for i, x in enumerate(xsb):
            p = ex_ports[(sg, i)]
            ax, acr, rot = vframe(sg, half, zc)
            P.box('ex_flange', (0.05, 0.044, 0.01), tuple(p + acr * 0.004), 'steel', rot=(rot[0] - sg * 90, 0, 0),
                  bev=None)
            P.tube('primary', [p + acr * 0.008, p + acr * 0.045, V((x - 0.06, ye, ze))], 0.018, 'steel', segs=7,
                   bend=0.04)
        xa, xb2 = xsb[0] - 0.1, xsb[-1] - 0.05
        P.tube('collector', [(xb2, ye, ze), (xsb[0] - 0.02, ye, ze), (xa, ye * 0.99, ze - 0.03),
                             (xa - 0.04, ye * 0.98, ze - 0.05)], 0.032, 'steel', segs=12, bend=0.05,
               radius_fn=lambda t: 0.85 + 0.15 * t)
        P.sphere('coll_cap', 0.027, (xb2, ye, ze), 'steel', u=12, v=5)
        P.cyl('ex_flange_out', 0.047, 0.012, (xa - 0.046, ye * 0.98, ze - 0.052), 'steel', axis='X', segs=16,
              bev=0.003, bsegs=1)
        P.empty('M_exhaust_out' if sg < 0 else 'M_exhaust_out2', (xa - 0.053, ye * 0.98, ze - 0.052),
                rot=(0, 0, 180))
    # --- front: the cast timing case over the crank and the four cams, damper, water pump, alternator, belt
    xf = xm + Lb / 2 + 0.0125 + 0.005
    for sg in (-1, 1):
        c = vpoint(sg, half, zc, 0.0, 0.34)
        out = capsule2d((0.0, zc), 0.09, (c.y, c.z), 0.088, n=20)
        plate_yz(P, 'timing', out, xf, xf + 0.04, 'alu', bev=0.01, segs=2)
        P.bolt((xf + 0.04, c.y * 1.0, c.z + 0.05), normal=(1, 0, 0), r=0.005, h=0.005, washer=False)
        P.bolt((xf + 0.04, c.y * 0.5, (c.z + zc) / 2 - 0.02), normal=(1, 0, 0), r=0.005, h=0.005, washer=False)
    xp = xf + 0.062
    zw = 0.355
    P.cyl('pump_body', 0.045, 0.024, (xf + 0.05, 0, zw), 'alu', axis='X', segs=16, bev=None)
    pulley(P, xp, 0, zc, 0.088, 0.032, 'steel', grooves=2, segs=16)
    pulley(P, xp, 0, zw, 0.055, 0.02, 'steel', grooves=1, hub=False, segs=16)
    ya, za = 0.215, 0.235
    P.cyl('alt', 0.06, 0.1, (xf - 0.03, ya, za), 'alu', axis='X', segs=18, bev=0.006, bsegs=2)
    P.cyl('alt_shaft', 0.012, 0.05, (xf + 0.04, ya, za), 'steel', axis='X', segs=10, bev=None)
    pulley(P, xp, ya, za, 0.035, 0.02, 'steel', grooves=1, hub=False, segs=16)
    P.box('alt_brk', (0.04, 0.05, 0.03), (xf - 0.04, 0.16, 0.15), 'steel', bev=0.005, segs=1)
    belt(P, xp, [(0.0, zc, 0.09), (ya, za, 0.037), (0.0, zw, 0.057)], width=0.016, thick=0.008)
    for sg in (-1, 1):
        P.cyl('water_out', 0.022, 0.03, (xf + 0.03, sg * 0.118, 0.545), 'alu', axis='X', segs=12, bev=None)
        P.tube('hose_up', [(xf + 0.04, sg * 0.118, 0.545), (xf + 0.08, sg * 0.11, 0.55), (xf + 0.11, sg * 0.09, 0.53)],
               0.019, 'rubber', segs=10, bend=0.03)
    # --- the oil filler neck on the left bank's outer cover, oil filter, starter, rear plate, mounts
    po = vpoint(1, half, zc, xm + 0.2, 0.392, 0.046)
    zo = po.z + 0.033
    P.cyl('filler_neck', 0.026, 0.06, (po.x, po.y, zo - 0.03), 'paint', segs=18, bev=None)
    P.cyl('filler_lip', 0.03, 0.006, (po.x, po.y, zo - 0.003), 'paint', segs=18, bev=None)
    oil_seat(P, po.x, po.y, zo, 0.024)
    P.cyl('filter', 0.05, 0.12, (xm - 0.05, -0.2, 0.17), 'paint_b', axis='Y', segs=18, bev=0.007, bsegs=2)
    P.cyl('filter_base', 0.042, 0.03, (xm - 0.05, -0.15, 0.17), 'alu', axis='Y', segs=14, bev=None)
    starter(P, xm - 0.36, 0.19, 0.11, length=0.16, r=0.046)
    rear_plate(P, xm - Lb / 2 - 0.01, zc, 0.17, 0.17, nb=8, material='alu')
    mounts(P, xm + 0.18, 0.2, 0.17)
    P.views = [('a', 35, 24), ('b', 215, 24)]


# ------------------------------------------------------------------------------------------------ eng_d1


def build_eng_d1(P):
    """The walking tractor's single-cylinder diesel: a big horizontal cylinder pointing forward (+X) under an
    open-topped water hopper with its filler mouth and float, the crankcase behind it with the fuel tank perched on
    top, a huge spoked flywheel on the right with the belt pulley outboard of it, the gear-chamber cover on the left
    with the crank-handle boss and the governor lever, the injection pump and its steel line to the injector, an
    oil-bath air cleaner and a rusty muffler on the head. Painted (paint) and rusty. Unlike the other engines its
    crankshaft runs across (Y), as on the real thing: the flywheel is on one side."""
    P.ao_distance = 0.12
    zc = 0.25                       # the crank and the bore
    xk = -0.16                      # the crank
    # --- base plate and its four feet
    for sy in (-1, 1):
        P.box('rail', (0.6, 0.05, 0.025), (0.0, sy * 0.115, 0.0125), 'paint', bev=0.006, segs=1)
        for sx in (-1, 1):
            P.box('foot', (0.07, 0.07, 0.03), (sx * 0.27, sy * 0.125, 0.015), 'paint', bev=0.008, segs=1)
            P.bolt((sx * 0.27, sy * 0.125, 0.03), r=0.009, h=0.008, material='rust')
    for x in (-0.12, 0.12):
        P.box('cross', (0.04, 0.18, 0.02), (x, 0, 0.012), 'paint', bev=0.004, segs=1)
    # --- crankcase, cylinder jacket, the hopper on top, the head in front
    P.box('crankcase', (0.3, 0.3, 0.375), (-0.16, 0, 0.2125), 'paint', bev=0.035, segs=3)
    P.box('jacket', (0.27, 0.24, 0.25), (0.125, 0, 0.25), 'paint', bev=0.02, segs=2)
    for x in (0.04, 0.12, 0.2):
        P.box('jacket_rib', (0.014, 0.25, 0.012), (x, 0, 0.126), 'paint', bev=0.003, segs=1)
    xh0, xh1 = -0.015, 0.255
    P.box('hopper', (xh1 - xh0, 0.27, 0.2), ((xh0 + xh1) / 2, 0, 0.47), 'paint', bev=0.02, segs=2)
    # the condenser fins down both sides of the hopper
    for sy in (-1, 1):
        for i in range(6):
            P.box('fin', (0.2, 0.012, 0.006), ((xh0 + xh1) / 2 + 0.01, sy * 0.141, 0.4 + 0.028 * i), 'paint',
                  bev=None, open='-y' if sy > 0 else '+y')
    P.cyl('drain_cock', 0.009, 0.03, (0.2, -0.15, 0.39), 'steel', axis='Y', segs=8, bev=None)
    # the open filler mouth on top (the dark water just inside it) and the float indicator
    xmo, ymo = 0.17, -0.02
    P.lathe('mouth', K.shell_profile([(0.062, 0.0), (0.062, 0.022), (0.07, 0.032)], 0.006), loc=(xmo, ymo, 0.565),
            material='paint', segs=28, sharp=50.0, loop=True)
    P.cyl('water', 0.057, 0.004, (xmo, ymo, 0.573), 'trim', segs=28, bev=None)
    P.cyl('float_rod', 0.004, 0.09, (0.04, 0.07, 0.6), 'steel', segs=6, bev=None)
    P.sphere('float_knob', 0.014, (0.04, 0.07, 0.65), 'paint_b', u=12, v=6)
    P.cyl('float_guide', 0.012, 0.02, (0.04, 0.07, 0.575), 'paint', segs=10, bev=None)
    # the head with its bolts, the rocker cover, the injector, the decompression lever
    P.box('head', (0.08, 0.22, 0.22), (0.3, 0, zc), 'paint', bev=0.016, segs=2)
    P.bolts([(0.34, sy * 0.07, zc + sz * 0.07) for sy in (-1, 1) for sz in (-1, 1)], normal=(1, 0, 0), r=0.01,
            h=0.009, material='rust')
    P.box('rocker_cover', (0.07, 0.1, 0.05), (0.3, -0.035, 0.385), 'paint', bev=0.02, segs=3)
    P.cyl('injector', 0.012, 0.05, (0.3, 0.05, 0.385), 'steel', segs=10, bev=0.002, bsegs=1)
    P.cyl('inj_nut', 0.014, 0.012, (0.3, 0.05, 0.41), 'steel', segs=6, bev=None)
    P.tube('decomp', [(0.32, -0.035, 0.41), (0.35, -0.03, 0.44), (0.39, -0.02, 0.45)], 0.004, 'steel', segs=5,
           bend=0.02)
    P.sphere('decomp_knob', 0.01, (0.39, -0.02, 0.45), 'trim', u=10, v=5)
    # --- the flywheel on the right (-Y): heavy rim, six spokes, hub and nut; the belt pulley outboard
    yf = -0.215
    R0, R1, W = 0.235, 0.19, 0.06
    P.lathe('fly_rim', [(R1, -W / 2), (R0 - 0.004, -W / 2), (R0, -W / 2 + 0.006), (R0, W / 2 - 0.006),
                        (R0 - 0.004, W / 2), (R1, W / 2), (R1 - 0.006, W / 2 - 0.01), (R1 - 0.006, -W / 2 + 0.01)],
            loc=(xk, yf, zc), material='paint', axis='Y', segs=40, sharp=40.0, loop=True)
    P.lathe('fly_band', [(R0 + 0.002, -W / 2 + 0.008), (R0 + 0.002, W / 2 - 0.008)], loc=(xk, yf, zc),
            material='rust', axis='Y', segs=40, sharp=40.0)
    P.lathe('fly_hub', [(0.0, -0.045), (0.05, -0.045), (0.055, -0.03), (0.055, 0.03), (0.05, 0.045), (0.0, 0.045)],
            loc=(xk, yf, zc), material='paint', axis='Y', segs=20, sharp=40.0)
    bm = bmesh.new()
    for i in range(6):
        a = math.tau * i / 6 + 0.26
        d = V((math.cos(a), 0, math.sin(a)))
        c = V((xk, yf, zc)) + d * ((0.05 + R1) / 2)
        m = Matrix.Translation(c) @ K.frame_from_z(d, (0, 1, 0))
        K.bm_cube(bm, (0.026, 0.034, R1 - 0.045), m)
    P.mesh('spokes', bm, 'paint', bev=0.008, segs=2)
    P.cyl('crank_shaft', 0.026, 0.05, (xk, yf - 0.06, zc), 'steel', axis='Y', segs=14, bev=None)
    P.lathe('pto', [(0.035, 0.0), (0.075, 0.0), (0.075, 0.006), (0.06, 0.016), (0.075, 0.026), (0.075, 0.032),
                    (0.06, 0.042), (0.075, 0.052), (0.075, 0.058), (0.035, 0.058)], loc=(xk, yf - 0.035, zc),
            material='steel', axis='-Y', segs=24, sharp=40.0, loop=True)
    P.bolt((xk, yf - 0.095, zc), normal=(0, -1, 0), r=0.016, h=0.014, washer=False, material='rust')
    P.lathe('main_boss', [(0.0, 0.0), (0.075, 0.0), (0.075, 0.03), (0.06, 0.04), (0.0, 0.04)], loc=(xk, -0.15, zc),
            material='paint', axis='-Y', segs=24, sharp=40.0)
    # --- the gear-chamber cover on the left (+Y), the crank-handle boss and the governor lever
    gc = K.rounded_rect(0.26, 0.3, 0.06, seg=4)
    plate_xz(P, 'gear_cover', [(x + xk + 0.01, z + 0.23) for (x, z) in gc], 0.15, 0.178, 'paint', bev=0.012,
             segs=2)
    P.bolts([(xk + 0.01 + 0.115 * sx, 0.178, 0.23 + 0.13 * sz) for sx in (-1, 0, 1) for sz in (-1, 1)] +
            [(xk + 0.125, 0.178, 0.23), (xk - 0.105, 0.178, 0.23)], normal=(0, 1, 0), r=0.0075, h=0.006,
            material='rust')
    xs0, zs0 = xk + 0.06, 0.335
    P.lathe('crank_boss', [(0.0, 0.0), (0.034, 0.0), (0.034, 0.03), (0.026, 0.038), (0.0, 0.038)],
            loc=(xs0, 0.178, zs0), material='paint', axis='Y', segs=18, sharp=40.0)
    P.cyl('crank_dog', 0.014, 0.024, (xs0, 0.226, zs0), 'steel', axis='Y', segs=10, bev=None)
    P.box('dog_claw', (0.036, 0.012, 0.008), (xs0, 0.238, zs0), 'steel', bev=0.002, segs=1)
    P.tube('gov_lever', [(xk + 0.12, 0.19, 0.35), (xk + 0.15, 0.2, 0.42), (xk + 0.14, 0.21, 0.47)], 0.005, 'steel',
           segs=6, bend=0.03)
    P.sphere('gov_knob', 0.014, (xk + 0.14, 0.21, 0.475), 'trim', u=12, v=6)
    # --- the injection pump on the left under the hopper, its steel line up to the injector
    P.box('inj_pump', (0.06, 0.05, 0.085), (0.04, 0.145, 0.29), 'alu', bev=0.01, segs=2)
    P.cyl('pump_top', 0.012, 0.02, (0.04, 0.145, 0.34), 'steel', segs=6, bev=None)
    P.tube('inj_line', [(0.04, 0.145, 0.35), (0.06, 0.155, 0.36), (0.2, 0.15, 0.362), (0.27, 0.1, 0.38),
                        (0.3, 0.05, 0.415)], 0.0038, 'steel', segs=5, bend=0.03)
    # --- the fuel tank perched on the back on two brackets, its straps, cap, tap and line to the pump
    xt = -0.215
    for x in (xt - 0.07, xt + 0.07):
        P.box('tank_brk', (0.03, 0.22, 0.07), (x, 0, 0.435), 'rust', bev=0.006, segs=1)
    P.pillow('tank', (0.22, 0.24, 0.13), (xt, 0, 0.535), 'paint', r=0.032, sub=1)
    for x in (xt - 0.07, xt + 0.07):
        P.box('strap_band', (0.022, 0.246, 0.006), (x, 0, 0.6005), 'rust', bev=0.002, segs=1)
    P.cyl('tank_neck', 0.026, 0.02, (xt - 0.03, 0.04, 0.6), 'paint', segs=16, bev=None)
    P.cyl('tank_cap', 0.032, 0.018, (xt - 0.03, 0.04, 0.617), 'steel', segs=16, bev=0.004, bsegs=1)
    P.cyl('tap', 0.01, 0.03, (xt + 0.1, 0.07, 0.462), 'steel', segs=8, bev=None)
    P.tube('fuel_line', [(xt + 0.1, 0.07, 0.448), (xt + 0.12, 0.1, 0.42), (-0.02, 0.16, 0.38), (0.04, 0.16, 0.34)],
           0.004, 'rubber', segs=6, bend=0.03)
    # --- the oil-bath air cleaner on the left of the head, the rusty muffler on the right
    P.tube('intake', [(0.3, 0.11, zc), (0.3, 0.17, zc + 0.005), (0.24, 0.205, 0.3)], 0.022, 'paint', segs=12,
           bend=0.04)
    P.lathe('cleaner', [(0.0, 0.0), (0.05, 0.0), (0.058, 0.01), (0.058, 0.14), (0.05, 0.15), (0.0, 0.15)],
            loc=(0.24, 0.205, 0.3), material='paint', segs=24, sharp=40.0)
    P.lathe('cleaner_lid', [(0.0, 0.0), (0.062, 0.0), (0.062, 0.014), (0.03, 0.022), (0.0, 0.022)],
            loc=(0.24, 0.205, 0.45), material='steel', segs=24, sharp=40.0)
    P.bolt((0.24, 0.205, 0.472), r=0.009, h=0.01, washer=False, material='rust')
    P.tube('ex_pipe', [(0.3, -0.11, zc), (0.3, -0.16, zc + 0.01), (0.28, -0.19, 0.33)], 0.024, 'rust', segs=12,
           bend=0.04)
    mb, mt = V((0.28, -0.19, 0.33)), V((0.21, -0.19, 0.52))
    mx = (mt - mb).normalized()
    P.cyl('muffler', 0.048, (mt - mb).length, tuple((mb + mt) / 2), 'rust', axis=mx, segs=20, bev=0.008, bsegs=2)
    P.cyl('muffler_guard', 0.054, 0.12, tuple((mb + mt) / 2 + mx * 0.01), 'steel', axis=mx, segs=20, bev=None,
          caps=False)
    P.cyl('ex_tail', 0.017, 0.05, tuple(mt + mx * 0.02), 'rust', axis=mx, segs=12, bev=None)
    P.cyl('tail_lip', 0.021, 0.008, tuple(mt + mx * 0.042), 'rust', axis=mx, segs=12, bev=None)
    P.empty('M_exhaust_out', tuple(mt + mx * 0.046), rot=(0, math.degrees(math.atan2(-mx.z, mx.x)), 0))
    # --- rust patches where the water and the weather get at the paint (thin irregular overlays)
    def patch(name, c, n, u, w, h, seed):
        n = V(n).normalized()
        pts = []
        for i in range(9):
            a = math.tau * i / 9
            k = 0.72 + 0.28 * math.sin(seed * 3.1 + i * 2.3) * math.cos(seed + i * 1.7)
            pts.append((w / 2 * k * math.cos(a), h / 2 * k * math.sin(a)))
        m = Matrix.Translation(V(c) + n * 0.0006) @ K.frame_from_z(n, u)
        P.prism(name, pts, 0.0012, matrix=m, material='rust', bev=None)

    patch('rust_patch', (0.19, -0.1355, 0.395), (0, -1, 0), (1, 0, 0), 0.11, 0.05, 1.0)
    patch('rust_patch', (0.2555, 0.05, 0.395), (1, 0, 0), (0, 1, 0), 0.1, 0.045, 2.0)
    patch('rust_patch', (0.2555, -0.075, 0.47), (1, 0, 0), (0, 1, 0), 0.045, 0.08, 3.0)
    patch('rust_patch', (0.08, 0.1355, 0.5), (0, 1, 0), (1, 0, 0), 0.06, 0.05, 8.0)
    patch('rust_patch', (-0.24, -0.15, 0.07), (0, -1, 0), (1, 0, 0), 0.12, 0.07, 4.0)
    patch('rust_patch', (-0.31, 0.05, 0.13), (-1, 0, 0), (0, 1, 0), 0.09, 0.11, 5.0)
    patch('rust_patch', (-0.31, -0.08, 0.3), (-1, 0, 0), (0, 1, 0), 0.05, 0.07, 9.0)
    patch('rust_patch', (xt + 0.04, -0.12, 0.5), (0, -1, 0), (1, 0, 0), 0.1, 0.035, 6.0)
    patch('rust_patch', (0.07, 0.12, 0.14), (0, 1, 0), (1, 0, 0), 0.09, 0.04, 7.0)
    P.torus('mouth_rust', 0.067, 0.0035, loc=(xmo, ymo, 0.596), segs=28, rsegs=4, material='rust')
    # --- the oil filler on the crankcase top behind the hopper (the game adds its cap), a drain plug
    oil_seat(P, -0.073, 0.045, 0.4, 0.024)
    P.bolt((-0.31, 0.06, 0.06), normal=(-1, 0, 0), r=0.011, h=0.01, washer=False, material='rust')
    P.views = [('a', 35, 24), ('b', 215, 24)]


# ------------------------------------------------------------------------------------------------ eng_i6d


def build_eng_i6d(P):
    """4.2 L diesel straight-six, older than eng_d6 and smaller: a tall heavy painted block with two tappet covers on
    its side, one long painted rocker cover with acorn nuts, the inline injection pump on the left with its six
    steel lines up to the injectors, twin fuel filters with a hand primer, a big bypass oil filter canister on the
    right, the intake log and a tall pipe up to an oil-bath air cleaner, the cast exhaust log with a turbo pad, a
    dynamo, a breather on the cover."""
    P.ao_distance = 0.15
    zc = 0.22
    pitch = 0.115
    L = 6 * pitch + 0.08
    xm = -0.06
    x0, x1 = xm - L / 2, xm + L / 2
    xs = [xm + pitch * (i - 2.5) for i in range(6)]
    sump(P, x0 + 0.01, x1 - 0.03, 0.15, 0.165, xm + 0.08, zshallow=0.07, material='paint', bolts=7)
    P.box('skirt', (L, 0.34, 0.12), (xm, 0, 0.225), 'paint', bev=0.014, segs=2)
    bm = bmesh.new()
    K.bm_cube(bm, (L, 0.3, 0.32), mat4((xm, 0, 0.445)))
    for v in bm.verts:
        if v.co.z < 0.42:
            v.co.y *= 1.08
    P.mesh('block', bm, 'paint', bev=0.016, segs=2)
    for sg in (-1, 1):
        for i in range(7):
            P.box('rib', (0.022, 0.015, 0.27), (x0 + 0.04 + pitch * i, sg * 0.154, 0.44), 'paint', bev=0.005, segs=1,
                  open='-y' if sg > 0 else '+y')
        for x in xs[::2]:
            P.cyl('plug', 0.022, 0.01, (x + pitch / 2, sg * 0.157, 0.53), 'alu', axis='Y', segs=12, bev=None)
    # the two tappet covers on the right side of the block
    for xc in (xm - 0.17, xm + 0.17):
        P.box('tappet_cover', (0.26, 0.012, 0.1), (xc, -0.158, 0.4), 'paint', bev=0.008, segs=2)
        P.bolts([(xc + dx, -0.165, 0.4 + dz) for dx in (-0.11, 0.11) for dz in (-0.035, 0.035)], normal=(0, -1, 0),
                r=0.006, h=0.005)
    # --- head, the long rocker cover with its acorn nuts, the oil cap's seat, lift eyes
    P.box('gasket', (L - 0.02, 0.3, 0.007), (xm, 0, 0.6035), 'trim', bev=None)
    P.box('head', (L - 0.02, 0.29, 0.1), (xm, 0, 0.657), 'paint', bev=0.014, segs=2)
    zt = 0.786
    P.box('cover_flange', (L - 0.05, 0.24, 0.012), (xm, 0, 0.713), 'paint', bev=0.004, segs=1)
    P.box('rocker_cover', (L - 0.07, 0.22, 0.068), (xm, 0, zt - 0.034), 'paint', bev=0.026, segs=3)
    for x in (xm - 0.26, xm - 0.09, xm + 0.09):
        P.cyl('acorn_base', 0.014, 0.008, (x, 0, zt + 0.003), 'steel', segs=6, bev=None)
        P.sphere('acorn', 0.011, (x, 0, zt + 0.012), 'steel', u=10, v=5)
    oil_seat(P, xm + 0.25, 0.0, zt, 0.026)
    lift_eye(P, x1 - 0.07, -0.135, 0.74)
    lift_eye(P, x0 + 0.07, 0.135, 0.74)
    # the breather on the back of the cover and its hose
    P.cyl('breather', 0.026, 0.03, (x0 + 0.1, -0.05, zt + 0.012), 'steel', segs=14, bev=None)
    P.tube('breather_hose', [(x0 + 0.1, -0.05, zt + 0.03), (x0 + 0.08, -0.09, zt + 0.04), (x0 + 0.04, -0.13, 0.72)],
           0.011, 'rubber', segs=8, bend=0.03)
    # --- injectors on the left edge of the head, the leak-off line, the inline pump and its six steel lines
    inj = []
    for x in xs:
        p = V((x, 0.122, 0.707))
        P.cyl('injector', 0.016, 0.07, tuple(p + V((0, 0, 0.012))), 'alu', segs=10, bev=None)
        P.cyl('inj_nut', 0.018, 0.014, tuple(p + V((0, 0, 0.052))), 'steel', segs=6, bev=None)
        inj.append(p + V((0, 0, 0.06)))
    P.tube('leak_off', [q + V((0, 0, 0.014)) for q in inj], 0.005, 'rubber', segs=6, bend=0.02)
    xp, yp, zp = xm + 0.02, 0.215, 0.44
    P.box('pump', (0.42, 0.1, 0.12), (xp, yp, zp), 'alu', bev=0.014, segs=2)
    P.box('pump_cam', (0.36, 0.06, 0.03), (xp, yp - 0.01, zp - 0.075), 'alu', bev=0.008, segs=1)
    P.box('governor', (0.1, 0.11, 0.16), (xp - 0.26, yp, zp + 0.015), 'alu', bev=0.018, segs=2)
    P.cyl('drive', 0.04, 0.06, (xp + 0.24, yp - 0.01, zp), 'alu', axis='X', segs=14, bev=None)
    P.tube('stop_lever', [(xp - 0.27, yp + 0.06, zp + 0.07), (xp - 0.3, yp + 0.08, zp + 0.13)], 0.005, 'steel', segs=5)
    P.sphere('stop_knob', 0.012, (xp - 0.3, yp + 0.08, zp + 0.135), 'paint_b', u=10, v=5)
    for i, b in enumerate(inj):
        a = V((xp - 0.17 + 0.068 * i, yp - 0.01, zp + 0.075))
        P.cyl('delivery', 0.011, 0.024, tuple(a), 'steel', segs=6, bev=None)
        P.tube('inj_line', [a + V((0, 0, 0.012)), a + V((0, 0, 0.07)), V((b.x, 0.157, 0.64)), V((b.x, 0.157, 0.712)),
                            b + V((0, 0, 0.006))], 0.0045, 'steel', segs=5, bend=0.03)
    # twin fuel filters on a bracket at the front with the hand primer, the feed line to the pump
    xff = x1 - 0.06
    P.box('ff_brk', (0.12, 0.02, 0.05), (xff, 0.17, 0.62), 'steel', bev=0.004, segs=1)
    for dx in (-0.032, 0.032):
        P.cyl('fuel_filter', 0.028, 0.1, (xff + dx, 0.205, 0.56), 'paint_b', segs=14, bev=0.005, bsegs=1)
        P.cyl('ff_head', 0.031, 0.02, (xff + dx, 0.205, 0.62), 'alu', segs=14, bev=None)
    P.cyl('primer', 0.012, 0.04, (xff, 0.205, 0.66), 'alu', segs=10, bev=None)
    P.sphere('primer_knob', 0.014, (xff, 0.205, 0.685), 'trim', u=10, v=5)
    P.tube('feed', [(xff - 0.032, 0.205, 0.51), (xff - 0.05, 0.22, 0.47), (xp + 0.2, yp + 0.03, zp + 0.03)], 0.004,
           'rubber', segs=5, bend=0.03)
    # --- the intake log high on the left and the tall pipe up to the oil-bath air cleaner
    P.box('intake', (L - 0.12, 0.06, 0.07), (xm - 0.01, 0.2, 0.7), 'paint', bev=0.015, segs=2)
    xa = x1 - 0.13
    P.tube('in_pipe', [(xa, 0.2, 0.7), (xa, 0.215, 0.73), (xa + 0.02, 0.22, 0.762)], 0.04, 'paint', segs=14,
           bend=0.03)
    P.cyl('in_hose', 0.043, 0.035, (xa + 0.02, 0.22, 0.762), 'rubber', segs=16, bev=None)
    P.lathe('cleaner', [(0.0, 0.0), (0.075, 0.0), (0.085, 0.012), (0.085, 0.065), (0.078, 0.073), (0.0, 0.073)],
            loc=(xa + 0.02, 0.22, 0.778), material='paint', segs=24, sharp=40.0)
    P.lathe('cleaner_cap', [(0.0, 0.0), (0.06, 0.0), (0.066, 0.008), (0.03, 0.028), (0.0, 0.03)],
            loc=(xa + 0.02, 0.22, 0.85), material='steel', segs=20, sharp=40.0)
    # --- exhaust (right, -Y): the cast log, a pad for the turbo, the outlet down at the back
    for x in xs:
        P.box('ex_flange', (0.07, 0.016, 0.055), (x, -0.153, 0.655), 'rust', bev=0.005, segs=1)
        P.tube('ex_stub', [(x, -0.16, 0.655), (x, -0.21, 0.65), (x, -0.232, 0.625)], 0.028, 'rust', segs=8,
               bend=0.03)
    P.tube('ex_log', [(xs[0] - 0.03, -0.232, 0.625), (xs[-1] + 0.03, -0.232, 0.625)], 0.037, 'rust', segs=14)
    for x in (xs[0] - 0.03, xs[-1] + 0.03):
        P.sphere('ex_cap', 0.037, (x, -0.232, 0.625), 'rust', u=12, v=5)
    xt = (xs[2] + xs[3]) / 2
    P.cyl('turbo_pad', 0.055, 0.018, (xt, -0.232, 0.668), 'rust', segs=16, bev=0.004, bsegs=1)
    P.empty('M_turbo', (xt, -0.232, 0.677))
    xo = xs[1]
    P.tube('ex_out', [(xo, -0.235, 0.6), (xo - 0.01, -0.245, 0.48), (xo - 0.06, -0.25, 0.42)], 0.037, 'rust',
           segs=14, bend=0.05)
    P.cyl('ex_flange_out', 0.054, 0.014, (xo - 0.066, -0.251, 0.41), 'rust', rot=(0, 35, 0), segs=16, bev=0.003,
          bsegs=1)
    P.empty('M_exhaust_out', (xo - 0.07, -0.252, 0.4), rot=(0, 125, 0))
    # --- front: timing case, the double crank pulley, water pump, the six-blade fan, a dynamo, the belt, hoses
    P.box('timing', (0.05, 0.3, 0.5), (x1 + 0.02, 0, 0.42), 'paint', bev=0.02, segs=2)
    P.bolts([(x1 + 0.046, sg * 0.125, z) for z in (0.24, 0.42, 0.6) for sg in (-1, 1)], normal=(1, 0, 0), r=0.007,
            h=0.006)
    zw = 0.54
    P.cyl('pump_body', 0.065, 0.055, (x1 + 0.07, 0, zw), 'paint', axis='X', segs=18, bev=0.005, bsegs=1)
    xpp = x1 + 0.085
    pulley(P, xpp, 0, zc, 0.1, 0.038, 'steel', grooves=2, segs=18)
    pulley(P, xpp + 0.02, 0, zw, 0.07, 0.028, 'steel', grooves=2, hub=False, segs=18)
    yd, zd = -0.232, 0.4
    P.cyl('dynamo', 0.06, 0.22, (x1 - 0.06, yd, zd), 'trim', axis='X', segs=20, bev=0.005, bsegs=2)
    P.cyl('dyn_end', 0.05, 0.016, (x1 - 0.178, yd, zd), 'steel', axis='X', segs=16, bev=None)
    P.torus('dyn_band', 0.061, 0.004, loc=(x1 - 0.13, yd, zd), axis='X', segs=20, rsegs=3, material='steel')
    P.box('dyn_brk', (0.05, 0.07, 0.04), (x1 - 0.08, -0.18, 0.33), 'steel', bev=0.005, segs=1)
    pulley(P, xpp + 0.01, yd, zd, 0.045, 0.028, 'steel', grooves=1, hub=False, segs=16)
    belt(P, xpp + 0.01, [(0.0, zc, 0.102), (0.0, zw, 0.072), (yd, zd, 0.047)], width=0.018, thick=0.009)
    fan(P, xpp + 0.065, 0, zw, 0.24, blades=6, hub_r=0.055, material='trim', pitch=28, chord=0.09)
    P.box('thermo', (0.06, 0.07, 0.06), (x1 + 0.01, -0.04, 0.705), 'paint', bev=0.012, segs=2)
    P.tube('hose_up', [(x1 + 0.03, -0.04, 0.71), (x1 + 0.08, -0.05, 0.73), (x1 + 0.125, -0.07, 0.725)], 0.026,
           'rubber', segs=12, bend=0.04)
    P.torus('clamp', 0.028, 0.0034, loc=(x1 + 0.05, -0.043, 0.717), axis='X', segs=16, rsegs=3, material='steel')
    # --- the big bypass oil filter on the right, dipstick, starter, rear plate, mounts
    xof = xm + 0.04
    P.cyl('oil_filter', 0.07, 0.22, (xof, -0.25, 0.36), 'paint_b', segs=20, bev=0.01, bsegs=2)
    P.cyl('of_lid', 0.074, 0.02, (xof, -0.25, 0.475), 'paint_b', segs=20, bev=0.004, bsegs=1)
    P.bolt((xof, -0.25, 0.485), r=0.012, h=0.012, washer=False)
    P.box('of_brk', (0.06, 0.07, 0.05), (xof, -0.195, 0.4), 'steel', bev=0.005, segs=1)
    P.tube('of_line', [(xof - 0.05, -0.25, 0.27), (xof - 0.06, -0.2, 0.26), (xof - 0.08, -0.165, 0.3)], 0.006,
           'steel', segs=6, bend=0.03)
    P.tube('dipstick', [(xs[4] + 0.06, -0.165, 0.32), (xs[4] + 0.06, -0.19, 0.6), (xs[4] + 0.06, -0.18, 0.76)], 0.006,
           'steel', segs=6, bend=0.1)
    P.torus('dip_ring', 0.02, 0.006, loc=(xs[4] + 0.06, -0.18, 0.78), rot=(0, 90, 0), segs=12, rsegs=4,
            material='paint_b')
    starter(P, x0 + 0.08, 0.2, 0.16, length=0.22, r=0.06)
    rear_plate(P, x0 - 0.005, zc, 0.22, 0.22, nb=10)
    mounts(P, x1 - 0.13, 0.24, 0.26)
    mounts(P, x0 + 0.24, 0.24, 0.26)
    P.views = [('a', 35, 20), ('b', 215, 20)]


# ------------------------------------------------------------------------------------------------ eng_moto4


def build_eng_moto4(P):
    """A 600 cc sportbike four, crank across the bike (Y) like the other motorcycle engines: the alloy crankcase and
    gearbox in one casting, the black water-cooled block leaning 30 degrees forward under an alloy head and a red
    cam cover with four plug caps, four chrome headers out of the front of the head, down round the crankcase and
    gathering under it into one collector, four carburettors behind the block on rubber boots, the hose stubs for
    the radiator, chrome alternator and clutch covers, the sprocket and the starter. Within y +-0.12 (the moto bay)."""
    P.ao_distance = 0.06
    W = 0.2                         # the case across the bike
    zc = 0.14                       # the crank
    out = [(-0.17, 0.07), (0.06, 0.068), (0.098, 0.092), (0.112, 0.15), (0.09, 0.205), (0.0, 0.245), (-0.1, 0.258),
           (-0.18, 0.235), (-0.212, 0.17), (-0.205, 0.1)]
    plate_xz(P, 'case', out, -W / 2, W / 2, 'alu', bev=0.012, segs=2)
    P.box('case_seam', (0.3, W + 0.004, 0.006), (-0.05, 0, 0.16), 'alu', bev=0.002, segs=1)
    P.box('sump', (0.2, 0.16, 0.035), (-0.03, 0, 0.06), 'alu', bev=0.01, segs=2)
    P.bolt((-0.03, 0.04, 0.0425), normal=(0, 0, -1), r=0.008, h=0.007, washer=False)
    for sy in (-1, 1):
        P.bolts([(x, sy * (W / 2 + 0.001), z) for (x, z) in ((0.08, 0.1), (-0.19, 0.12), (-0.14, 0.235))],
                normal=(0, sy, 0), r=0.0045, h=0.004, washer=False)
    # --- the block leaning forward, head, cam cover with its plug caps and the oil cap's boss
    lean = 30.0
    ax = V((math.sin(math.radians(lean)), 0, math.cos(math.radians(lean))))
    pp = V((-math.cos(math.radians(lean)), 0, math.sin(math.radians(lean))))        # across the bores, back-up
    b0 = V((0.012, 0, 0.212))
    rot = (0, lean, 0)

    def along(d, back=0.0, y=0.0):
        return b0 + ax * d + pp * back + V((0, y, 0))

    P.box('block', (0.088, 0.208, 0.12), tuple(along(0.06)), 'trim', rot=rot, bev=0.008, segs=2)
    for d in (0.03, 0.06, 0.09):
        P.box('block_rib', (0.094, 0.212, 0.005), tuple(along(d)), 'trim', rot=rot, bev=0.0015, segs=1)
    P.box('gasket', (0.092, 0.212, 0.004), tuple(along(0.121)), 'trim', rot=rot, bev=None)
    P.box('head', (0.095, 0.214, 0.062), tuple(along(0.154)), 'alu', rot=rot, bev=0.007, segs=2)
    P.box('cam_cover', (0.096, 0.2, 0.04), tuple(along(0.205)), 'paint', rot=rot, bev=0.014, segs=3)
    for y in (-0.05, 0.0, 0.05):
        P.box('cover_rib', (0.004, 0.03, 0.006), tuple(along(0.225, 0.03, y)), 'paint', rot=rot, bev=None)
    ys = [-0.078, -0.026, 0.026, 0.078]
    for y in ys:
        P.cyl('plug_cap', 0.0115, 0.03, tuple(along(0.235, -0.016, y)), 'trim', axis=ax, segs=10, bev=0.002, bsegs=1)
    top = along(0.225, 0.026, 0.0)
    zo = top.z + 0.016
    P.cyl('filler_boss', 0.022, 0.03, (top.x, top.y, zo - 0.015), 'paint', segs=16, bev=None)
    oil_seat(P, top.x, top.y, zo, 0.02)
    # the plug leads back to the coils under the tank
    # the leads back over the cover and down over the carburettors to the two coils on the gearbox
    for i, y in enumerate(ys):
        a = along(0.25, -0.016, y)
        yo = y * 1.3 if abs(y) < 0.05 else y * 1.05
        yc = (0.035 if y > 0 else -0.035) + (0.012 if abs(y) > 0.05 else -0.004) * (1 if y > 0 else -1)
        lead_path(P, [a, a + ax * 0.01, V((a.x - 0.035, yo, a.z + 0.014)), V((-0.02, yo, 0.392)),
                      V((-0.13, yc, 0.33)), V((-0.165, yc, 0.302))], r=0.0035, bend=0.025)
    for sy in (-1, 1):
        P.box('coil', (0.045, 0.045, 0.034), (-0.172, sy * 0.04, 0.282), 'trim', bev=0.006, segs=1)
    P.box('coil_brk', (0.06, 0.12, 0.006), (-0.172, 0, 0.262), 'steel', bev=0.002, segs=1)
    # --- exhaust: four chrome headers from the front of the head, down round the case, into one collector beneath
    zcol = 0.033
    for i, y in enumerate(ys):
        port = along(0.152, -0.05, y)
        n = (-pp).normalized()
        P.cyl('ex_flange', 0.02, 0.008, tuple(port + n * 0.003), 'alu', axis=n, segs=12, bev=None)
        yy = y * 0.9
        pts = [port, port + n * 0.035 + V((0, 0, -0.01)), V((0.175, yy, 0.22)), V((0.165, yy, 0.1)),
               V((0.12, yy * 0.7, 0.045)), V((0.055, ys[i] * 0.32, zcol + 0.004)), V((0.0, ys[i] * 0.28, zcol + 0.002))]
        P.tube('header', pts, 0.0145, 'chrome', segs=10, bend=0.035)
    P.lathe('collector', [(0.0, 0.0), (0.033, 0.0), (0.033, 0.035), (0.022, 0.09), (0.0, 0.09)], loc=(0.03, 0, zcol),
            material='chrome', axis='-X', segs=16, sharp=40.0)
    P.tube('link_pipe', [(-0.055, 0, zcol), (-0.17, 0, zcol + 0.004), (-0.2, 0, zcol + 0.012)], 0.02, 'chrome',
           segs=12, bend=0.03)
    P.cyl('link_flange', 0.028, 0.008, (-0.204, 0, zcol + 0.013), 'steel', axis='X', segs=14, bev=None)
    P.empty('M_exhaust_out', (-0.208, 0, zcol + 0.013), rot=(0, 0, 180))
    # --- intake: rubber boots from the back of the head, four carburettors, their air funnels, the linkage
    for y in ys:
        ip = along(0.152, 0.05, y)
        cb = V((-0.045, y, 0.335))
        P.tube('boot', [ip, ip + pp * 0.02, cb + V((0.028, 0, 0.004))], 0.016, 'rubber', segs=10, bend=0.02)
        P.box('carb', (0.04, 0.04, 0.048), tuple(cb), 'alu', bev=0.005, segs=1)
        P.cyl('bowl', 0.015, 0.02, tuple(cb + V((0, 0, -0.03))), 'alu', segs=10, bev=None)
        P.lathe('funnel', K.shell_profile([(0.014, 0.0), (0.016, 0.018), (0.022, 0.026)], 0.0018),
                loc=tuple(cb + V((-0.02, 0, 0.002))), material='trim', axis='-X', segs=10, sharp=60.0, loop=True)
    P.tube('linkage', [(-0.045, ys[0] - 0.02, 0.36), (-0.045, ys[-1] + 0.02, 0.36)], 0.003, 'steel', segs=5)
    # --- cooling: the thermostat on the head with its hose stub, the water pump and its stub on the left
    th = along(0.2, -0.035, 0.0)
    P.box('thermo', (0.03, 0.05, 0.03), tuple(th - pp * 0.03), 'alu', rot=rot, bev=0.006, segs=1)
    P.tube('hose_top', [th - pp * 0.045, th - pp * 0.07 + V((0, 0, 0.01)), th - pp * 0.09 + V((0.01, 0, 0.0))],
           0.011, 'rubber', segs=10, bend=0.02)
    P.cyl('pump', 0.032, 0.014, (0.08, -W / 2 - 0.007, 0.08), 'alu', axis='Y', segs=16, bev=0.002, bsegs=1)
    P.tube('hose_pump', [(0.08, -W / 2 - 0.012, 0.08), (0.115, -W / 2 - 0.012, 0.09), (0.14, -W / 2 - 0.006, 0.11)],
           0.01, 'rubber', segs=10, bend=0.02)
    # --- side covers: the alternator (left) and ignition (right) on the crank, the clutch, the sprocket, starter
    P.lathe('alt_cover', [(0.0, 0.019), (0.04, 0.017), (0.058, 0.009), (0.064, 0.0)][::-1],
            loc=(0.0, W / 2, zc), material='chrome', axis='Y', segs=24, close='start', sharp=40.0)
    P.lathe('ign_cover', [(0.0, -0.016), (0.03, -0.014), (0.04, -0.006), (0.044, 0.0)], loc=(0.01, -W / 2, zc),
            material='chrome', axis='Y', segs=20, close='end', sharp=40.0)
    P.lathe('clutch_cover', [(0.0, -0.019), (0.045, -0.017), (0.064, -0.009), (0.07, 0.0)], loc=(-0.11, -W / 2, 0.155),
            material='chrome', axis='Y', segs=24, close='end', sharp=40.0)
    for i in range(6):
        a = math.tau * i / 6
        P.bolt((-0.11 + 0.064 * math.cos(a), -W / 2 - 0.004, 0.155 + 0.064 * math.sin(a)), normal=(0, -1, 0),
               r=0.004, h=0.0035, washer=False)
        P.bolt((0.059 * math.cos(a), W / 2 + 0.004, zc + 0.059 * math.sin(a)), normal=(0, 1, 0), r=0.004, h=0.0035,
               washer=False)
    P.box('sprocket_cover', (0.07, 0.012, 0.06), (-0.155, W / 2 + 0.006, 0.12), 'alu', bev=0.006, segs=1)
    sp = []
    for i in range(14):
        a = math.tau * i / 14
        sp += [(0.03 * math.cos(a - 0.08), 0.03 * math.sin(a - 0.08)), (0.034 * math.cos(a + 0.05),
                                                                       0.034 * math.sin(a + 0.05))]
    P.prism('sprocket', sp, 0.007, matrix=Matrix.Translation((-0.155, W / 2 + 0.0155, 0.12)) @ mat4(rot=(90, 0, 0)),
            material='steel', bev=None)
    P.cyl('shift_shaft', 0.006, 0.02, (-0.11, W / 2 + 0.01, 0.075), 'steel', axis='Y', segs=8, bev=None)
    P.cyl('starter', 0.028, 0.12, (-0.125, 0.0, 0.282), 'trim', axis='Y', segs=16, bev=0.004, bsegs=1)
    # mounting lugs (front and back) with their through-bolts
    for (x, z) in ((0.105, 0.17), (-0.2, 0.2), (-0.17, 0.085)):
        P.box('lug', (0.03, W + 0.01, 0.026), (x, 0, z), 'alu', bev=0.006, segs=1)
        P.cyl('lug_bolt', 0.007, W + 0.03, (x, 0, z), 'steel', axis='Y', segs=8, bev=None)
    P.views = [('a', 35, 18), ('b', 215, 18)]


# ------------------------------------------------------------------------------------------------ eng_vtwin


def round_fins(P, base, axis, r_core, r_fin, length, n, fin_t=0.0045, material='alu', segs=18, core=True):
    """An air-cooled barrel (or head) with round fins along `axis` from `base`."""
    ax = V(axis).normalized()
    if core:
        P.cyl('barrel', r_core, length, tuple(V(base) + ax * length / 2), material, axis=ax, segs=14, bev=None)
    bm = bmesh.new()
    m0 = K.frame_from_z(ax, (1, 0, 0))
    for i in range(n):
        c = V(base) + ax * (length * (i + 0.5) / n)
        K.bm_prism(bm, K.circle2d(r_fin, segs), fin_t, matrix=Matrix.Translation(c) @ m0)
    return P.mesh('fins', bm, material, bev=None, sharp=50.0)


def shield(P, p0, p1, r, outward, arc=150.0, t=0.002, material='chrome'):
    """A curved heat shield over a pipe from p0 to p1: a thin shell of radius r over `arc` degrees, centred on the
    side facing `outward`."""
    p0, p1 = V(p0), V(p1)
    d = p1 - p0
    m = Matrix.Translation(p0) @ K.frame_from_z(d, outward)
    bm = bmesh.new()
    K.bm_lathe(bm, [(r - t, 0.0), (r, 0.0), (r, d.length), (r - t, d.length)], segs=10, matrix=m,
               angle=math.radians(arc), start=-math.radians(arc / 2), loop=True)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    return P.mesh('shield', bm, material, bev=None, sharp=50.0)


def build_eng_vtwin(P):
    """A 1200 cc cruiser V-twin, crank across the bike (Y): two air-cooled cylinders in a 45-degree V along the bike,
    black finned barrels under finned alloy heads and chrome rocker boxes, the four chrome pushrod tubes up from the
    teardrop cam cover on the right, the carburettor in the V behind the big round chrome air cleaner on the right,
    the long chrome primary cover with its derby cover on the left, two chrome pipes with heat shields down the
    right side, staggered (front one low, rear one high)."""
    P.ao_distance = 0.07
    zc = 0.115
    W = 0.16
    out = [(-0.1, 0.007), (0.07, 0.007), (0.125, 0.065), (0.14, 0.125), (0.105, 0.19), (0.045, 0.212),
           (-0.045, 0.212), (-0.105, 0.19), (-0.145, 0.125), (-0.14, 0.068)]
    plate_xz(P, 'case', out, -W / 2, W / 2, 'alu', bev=0.012, segs=2)
    P.box('case_seam', (0.27, W + 0.004, 0.005), (0.0, 0, 0.12), 'alu', bev=0.0015, segs=1)
    P.bolt((0.0, 0.0, 0.007), normal=(0, 0, -1), r=0.008, h=0.007, washer=False)
    half = math.radians(22.5)
    cyls = {}
    for k, sx in (('F', 1), ('R', -1)):
        ax = V((sx * math.sin(half), 0, math.cos(half)))
        fw = V((math.cos(half), 0, -sx * math.sin(half))) * sx     # across the bore, away from the V
        o = V((0, 0, zc))
        cyls[k] = (ax, fw)
        P.cyl('base_ring', 0.058, 0.012, tuple(o + ax * 0.1), 'alu', axis=ax, segs=18, bev=None)
        round_fins(P, o + ax * 0.105, ax, 0.048, 0.077, 0.125, 9, material='trim')
        P.cyl('head_core', 0.06, 0.075, tuple(o + ax * 0.2675), 'alu', axis=ax, segs=18, bev=0.006, bsegs=1)
        round_fins(P, o + ax * 0.233, ax, 0.06, 0.086, 0.068, 5, fin_t=0.005, material='alu', core=False)
        # the chrome rocker box: a base plate and a rounded cover, its bolts
        P.box('rocker_base', (0.13, 0.13, 0.014), tuple(o + ax * 0.312), 'chrome', rot=(0, sx * 22.5, 0),
              bev=0.005, segs=1)
        P.box('rocker_box', (0.12, 0.115, 0.04), tuple(o + ax * 0.337), 'chrome', rot=(0, sx * 22.5, 0),
              bev=0.016, segs=3)
        P.bolts([tuple(o + ax * 0.32 + fw * dx + V((0, dy, 0))) for dx in (-0.056, 0.056) for dy in (-0.055, 0.055)],
                normal=tuple(ax), r=0.0045, h=0.004, washer=False, material='chrome')
        # the plug on the left side of the head and its lead to the coil in the V
        pl = o + ax * 0.27 + V((0, 0.088, 0))
        P.cyl('plug_cap', 0.011, 0.03, tuple(pl + V((0, 0.012, 0))), 'trim', axis='Y', segs=10, bev=0.002, bsegs=1)
        lead_path(P, [pl + V((0, 0.027, 0)), pl + V((-sx * 0.02, 0.04, 0.02)), V((0.0, 0.06, 0.36)),
                      V((0.0, 0.05, 0.345))], r=0.004, bend=0.02)
    axF, fwF = cyls['F']
    axR, fwR = cyls['R']
    o = V((0, 0, zc))
    P.box('coil', (0.032, 0.04, 0.05), (0.0, 0.05, 0.37), 'trim', bev=0.006, segs=1)
    # the oil filler boss on top of the front rocker box (flat; the game puts the cap on it)
    t = o + axF * 0.357 + V((0, 0.02, 0)) + fwF * (-0.012)
    zo = t.z + 0.014
    P.cyl('filler_boss', 0.022, 0.03, (t.x, t.y, zo - 0.015), 'chrome', segs=16, bev=None)
    oil_seat(P, t.x, t.y, zo, 0.02)
    # --- the right side: teardrop cam cover with its points cover, the four pushrod tubes up to the heads
    cam = capsule2d((0.05, 0.075), 0.052, (-0.005, 0.165), 0.034, n=20)
    plate_xz(P, 'cam_cover', cam, -W / 2 - 0.022, -W / 2 + 0.002, 'chrome', bev=0.008, segs=2)
    P.cyl('points_cover', 0.026, 0.008, (0.065, -W / 2 - 0.025, 0.07), 'chrome', axis='Y', segs=16, bev=0.002,
          bsegs=1)
    for k, sx in (('F', 1), ('R', -1)):
        ax, fw = cyls[k]
        for j, dx in enumerate((-0.012, 0.012)):
            a = V((sx * 0.012 + dx * 0.6, -0.093, 0.19))
            b = o + ax * 0.31 + fw * (-0.02 + 0.03 * j) + V((0, -0.09, 0))
            P.tube('pushrod_tube', [a, b], 0.0085, 'chrome', segs=10)
            P.cyl('pr_cover', 0.011, 0.05, tuple(a + (b - a).normalized() * 0.03), 'chrome', axis=(b - a), segs=10,
                  bev=None)
    # --- the carburettor in the V and the big round air cleaner on the right, the manifold to both heads
    P.box('carb', (0.05, 0.075, 0.055), (0.0, -0.07, 0.335), 'alu', bev=0.006, segs=2)
    P.cyl('carb_bowl', 0.02, 0.025, (0.0, -0.075, 0.3), 'alu', segs=12, bev=None)
    for k in ('F', 'R'):
        ax, fw = cyls[k]
        port = o + ax * 0.262 + fw * (-0.058) + V((0, -0.03, 0))
        P.tube('manifold', [V((0.0, -0.045, 0.34)), port], 0.016, 'alu', segs=10)
    xa, za = 0.0, 0.33
    P.cyl('cleaner_back', 0.092, 0.012, (xa, -0.111, za), 'trim', axis='Y', segs=28, bev=0.003, bsegs=1)
    P.lathe('cleaner', [(0.0, 0.0), (0.098, 0.0), (0.104, 0.008), (0.104, 0.026), (0.094, 0.038), (0.06, 0.044),
                        (0.0, 0.046)], loc=(xa, -0.117, za), material='chrome', axis='-Y', segs=32, sharp=40.0)
    P.cyl('cleaner_inlay', 0.045, 0.004, (xa, -0.164, za), 'paint', axis='Y', segs=24, bev=None)
    P.bolt((xa, -0.166, za), normal=(0, -1, 0), r=0.007, h=0.005, washer=False, material='chrome')
    # --- exhaust: two chrome pipes down the right side with heat shields, the front one low, the rear one high
    exF = o + axF * 0.268 + fwF * 0.062 + V((0, -0.035, 0))
    exR = o + axR * 0.268 + fwR * 0.062 + V((0, -0.035, 0))
    pf = [exF, exF + fwF * 0.03 + V((0, -0.03, -0.01)), V((0.2, -0.112, 0.22)), V((0.17, -0.125, 0.075)),
          V((0.1, -0.128, 0.06)), V((-0.235, -0.128, 0.055))]
    pr = [exR, exR + fwR * 0.03 + V((0, -0.03, -0.01)), V((-0.22, -0.112, 0.25)), V((-0.238, -0.118, 0.17)),
          V((-0.26, -0.12, 0.15)), V((-0.278, -0.12, 0.15))]
    P.tube('pipe_f', pf, 0.019, 'chrome', segs=12, bend=0.04)
    P.tube('pipe_r', pr, 0.019, 'chrome', segs=12, bend=0.04)
    shield(P, (0.09, -0.128, 0.059), (-0.14, -0.128, 0.056), 0.025, (0, -0.7, 0.7))
    shield(P, (-0.205, -0.111, 0.268), (-0.236, -0.118, 0.18), 0.025, (-0.3, -0.9, 0.0))
    for e in (pf[-1], pr[-1]):
        P.cyl('ex_flange', 0.026, 0.008, (e.x - 0.004, e.y, e.z), 'steel', axis='X', segs=14, bev=None)
    P.empty('M_exhaust_out', (pf[-1].x - 0.009, pf[-1].y, pf[-1].z), rot=(0, 0, 180))
    P.empty('M_exhaust_out2', (pr[-1].x - 0.009, pr[-1].y, pr[-1].z), rot=(0, 0, 180))
    # --- the left side: the long chrome primary cover, its derby and inspection covers, the bolts
    prim = capsule2d((0.0, zc), 0.072, (-0.17, 0.1), 0.088, n=24)
    plate_xz(P, 'primary', prim, W / 2 - 0.002, W / 2 + 0.042, 'chrome', bev=0.014, segs=3)
    P.cyl('derby', 0.056, 0.008, (-0.17, W / 2 + 0.045, 0.1), 'chrome', axis='Y', segs=24, bev=0.003, bsegs=1)
    P.bolts([(-0.17 + 0.046 * math.cos(a), W / 2 + 0.05, 0.1 + 0.046 * math.sin(a)) for a in
             [math.tau * i / 5 for i in range(5)]], normal=(0, 1, 0), r=0.0042, h=0.0035, washer=False,
            material='chrome')
    P.box('inspection', (0.06, 0.006, 0.03), (-0.08, W / 2 + 0.044, 0.17), 'chrome', bev=0.004, segs=1)
    P.bolts([(x, W / 2 + 0.043, z) for (x, z) in ((0.05, 0.06), (0.05, 0.17), (-0.25, 0.06), (-0.25, 0.14),
                                                  (-0.12, 0.02), (-0.11, 0.185))], normal=(0, 1, 0), r=0.0042,
            h=0.0035, washer=False, material='chrome')
    # --- the oil filter at the front of the case, the starter behind, mounting lugs
    P.cyl('oil_filter', 0.03, 0.06, (0.122, -0.045, 0.066), 'chrome', rot=(0, 120, 0), segs=16, bev=0.004, bsegs=1)
    P.cyl('starter', 0.028, 0.1, (-0.163, -0.03, 0.2), 'trim', axis='Y', segs=16, bev=0.004, bsegs=1)
    for (x, z) in ((0.13, 0.155), (-0.14, 0.035)):
        P.box('lug', (0.03, W + 0.01, 0.026), (x, 0, z), 'alu', bev=0.006, segs=1)
        P.cyl('lug_bolt', 0.007, W + 0.03, (x, 0, z), 'steel', axis='Y', segs=8, bev=None)
    P.views = [('a', 35, 18), ('b', 215, 18)]


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
    'eng_i3': build_eng_i3,
    'eng_boxer4': build_eng_boxer4,
    'eng_i4tc': build_eng_i4tc,
    'eng_i6': build_eng_i6,
    'eng_v6': build_eng_v6,
    'eng_v12': build_eng_v12,
    'eng_d1': build_eng_d1,
    'eng_i6d': build_eng_i6d,
    'eng_moto4': build_eng_moto4,
    'eng_vtwin': build_eng_vtwin,
}


def main(args):
    K.run(PARTS, args)
