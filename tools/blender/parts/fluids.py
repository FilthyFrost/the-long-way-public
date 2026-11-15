"""
Fluids and electrics: batteries, fuel tanks, radiators (docs/MODCAR.md section 2.3).

    blender -b --factory-startup --python tools/blender/build.py -- parts/fluids [<id>|all] [--norender]

Origins: bottom centre; batteries and tanks long axis along X; radiators' core faces +X.
"""
import math

import bmesh
from mathutils import Matrix, Vector

from parts import _kit as K
from parts._kit import V, mat4

# ------------------------------------------------------------------------------------------- batteries


def battery(P, L, W, H, posts_side=+1, caps=6, handle=True, lid_mat='paint', case_mat='trim', moto=False,
            studs=False):
    """A lead-acid battery: case with ribs and a base lip, a coloured lid, cell caps, two posts
    (studs=True: heavy-duty threaded stud terminals with nuts, as on a truck battery)."""
    P.ao_distance = 0.06
    lip = 0.006 if not moto else 0.0
    hcase = H * 0.84
    # base lip (hold-down ledge) and the case with slightly tapered walls
    if lip:
        P.box('lip', (L + 2 * lip, W + 2 * lip, 0.012), (0, 0, 0.006), case_mat, bev=0.003)
    bm = bmesh.new()
    K.bm_cube(bm, (L, W, hcase), mat4((0, 0, hcase / 2)))
    for v in bm.verts:
        if v.co.z > hcase / 2:
            v.co.x *= 1.012
            v.co.y *= 1.015
    P.mesh('case', bm, case_mat, bev=0.006, segs=2)
    # vertical moulded ribs on the long sides and the ends
    nrib = max(3, int(L / 0.05))
    for s in (-1, 1):
        for i in range(nrib):
            x = -L / 2 + L * (i + 0.5) / nrib
            P.box('rib', (0.012, 0.004, hcase * 0.62), (x, s * (W / 2 + 0.001), hcase * 0.45), case_mat, bev=None,
                  open='-y' if s > 0 else '+y')
    for s in (-1, 1):
        for i in range(2):
            y = (i - 0.5) * W * 0.45
            P.box('rib', (0.004, 0.012, hcase * 0.62), (s * (L / 2 + 0.001), y, hcase * 0.45), case_mat, bev=None,
                  open='-x' if s > 0 else '+x')
    # label panel on the front long side (towards -Y)
    P.box('label', (L * 0.62, 0.003, hcase * 0.42), (0, -W / 2 - 0.0035, hcase * 0.52), 'paint_b', bev=0.0012,
          segs=1, open='+y')
    P.box('stripe', (L * 0.62, 0.0035, hcase * 0.08), (0, -W / 2 - 0.004, hcase * 0.62), lid_mat, bev=None, open='+y')
    # the lid: overhanging cover with a raised centre panel
    lid_h = H - hcase - 0.012
    z_lid = hcase
    P.box('lid', (L + 0.008, W + 0.008, lid_h * 0.55), (0, 0, z_lid + lid_h * 0.275), lid_mat, bev=0.004, segs=2)
    P.box('lid_top', (L * 0.78, W * 0.55, lid_h * 0.45), (0, -W * 0.08 * posts_side, z_lid + lid_h * 0.55 + lid_h * 0.2),
          lid_mat, bev=0.004, segs=2)
    z_top = z_lid + lid_h * 0.55 + lid_h * 0.42
    # cell caps along the centre panel
    for i in range(caps):
        x = -L * 0.33 + L * 0.66 * i / max(1, caps - 1)
        P.cyl('cap', 0.0105 if not moto else 0.006, 0.008, (x, -W * 0.08 * posts_side, z_top + 0.004), case_mat,
              segs=10, r2=0.0092 if not moto else 0.005, bev=None)
        P.box('slot', (0.013 if not moto else 0.008, 0.0025, 0.002), (x, -W * 0.08 * posts_side, z_top + 0.0085),
              case_mat, bev=None, open='-z')
    # terminal pads and posts on the +Y side
    y_post = posts_side * (W / 2 - 0.022)
    z_pad = z_lid + lid_h * 0.55
    for sx, sign in ((1, '+'), (-1, '-')):
        x = sx * (L / 2 - 0.03)
        P.cyl('pad', 0.016 if not moto else 0.009, 0.006, (x, y_post, z_pad + 0.003), case_mat, segs=12,
              r2=0.0145 if not moto else 0.008, bev=None)
        r = 0.0095 if not moto else 0.004
        if moto:
            # motorcycle battery: L-tab terminals with a bolt
            P.box('tab', (0.012, 0.004, 0.016), (x, y_post, z_pad + 0.014), 'steel', bev=0.001, segs=1)
            P.bolt((x, y_post + 0.002, z_pad + 0.016), normal=(0, 1, 0), r=0.0035, h=0.003)
        elif studs:
            P.cyl('post', r * 1.05, 0.008, (x, y_post, z_pad + 0.01), 'steel', segs=12, bev=0.0015, bsegs=1)
            P.bolt((x, y_post, z_pad + 0.014), normal=(0, 0, 1), r=0.0095, h=0.0065, washer=False, material='steel',
                   name='stud_nut')
            P.cyl('stud', 0.0042, 0.008, (x, y_post, z_pad + 0.024), 'steel', segs=8, bev=None)
        else:
            P.cyl('post', r, 0.022, (x, y_post, z_pad + 0.006 + 0.011), 'steel', segs=12, r2=r * 0.86, bev=0.0015,
                  bsegs=1)
            P.cyl('collar', r * 1.35, 0.004, (x, y_post, z_pad + 0.008), 'paint_b' if sign == '+' else case_mat,
                  segs=12, bev=None)
        # embossed sign next to the post
        sx2 = x - sx * (0.03 if not moto else 0.014)
        sz = z_pad + 0.0015
        a = 0.016 if not moto else 0.008
        P.box('sign', (a, a * 0.24, 0.003), (sx2, y_post, sz), 'paint_b', bev=None, open='-z')
        if sign == '+':
            P.box('sign', (a * 0.24, a, 0.003), (sx2, y_post, sz), 'paint_b', bev=None, open='-z')
    if handle:
        # flip-up carrying handle, lying down across the lid
        hz = z_top + 0.004
        pts = [(-L / 2 + 0.01, -W * 0.36, z_lid + lid_h * 0.3), (-L / 2 + 0.02, -W * 0.36, hz + 0.004),
               (L / 2 - 0.02, -W * 0.36, hz + 0.004), (L / 2 - 0.01, -W * 0.36, z_lid + lid_h * 0.3)]
        P.tube('handle', pts, 0.0045, 'trim', segs=8, bend=0.012)
        for s in (-1, 1):
            P.cyl('hinge', 0.007, 0.012, (s * (L / 2 + 0.004), -W * 0.36, z_lid + lid_h * 0.3), case_mat, axis='X',
                  segs=10, bev=None)


def build_bat_std(P):
    battery(P, 0.24, 0.172, 0.20)


def build_bat_truck(P):
    """A heavy-duty battery: taller than the car's, stud terminals; short enough for a car's battery tray."""
    battery(P, 0.258, 0.175, 0.235, caps=6, studs=True)


def build_bat_moto(P):
    battery(P, 0.15, 0.087, 0.13, caps=0, handle=False, moto=True)


# ------------------------------------------------------------------------------------------- radiators


def radiator(P, W=0.54, Htot=0.40, D=0.045, fins=12, fan=False, tank_mat='steel', side_inlet=True, tank_h=0.05):
    """
    A down-flow radiator standing on its bottom centre, the core facing +X: a dark backing behind
    horizontal fin bars, top and bottom tanks, a low filler neck and cap, hose necks towards the engine (-X),
    side brackets with mounting tabs, an overflow tube; fan=True adds an electric fan and shroud behind.
    Htot is the overall height including the neck and cap (the frames' radiator spaces are 0.40-0.42 tall);
    the depth stays within x [-0.07, D/2 + 0.012].
    """
    P.ao_distance = 0.05
    cap_stack = 0.036                 # filler neck + cap + cap ear above the top tank
    zb = tank_h                       # top of the bottom tank = bottom of the core
    H = Htot - 2 * tank_h - cap_stack
    # core: backing slab and the fin bars in front of it
    P.box('core_back', (D * 0.6, W, H), (-D * 0.15, 0, zb + H / 2), 'trim', bev=None)
    pitch = H / fins
    bm = bmesh.new()
    for i in range(fins):
        z = zb + pitch * (i + 0.5)
        K.bm_cube(bm, (D * 0.5, W - 0.01, pitch * 0.5), mat4((D * 0.2, 0, z)))
    P.mesh('fins', bm, 'alu', bev=None, sharp=60)
    for sg in (-1, 1):
        P.box('core_side', (D, 0.012, H + 0.01), (0, sg * (W / 2 + 0.006), zb + H / 2), tank_mat, bev=0.003,
              segs=1)
    # tanks
    for (z, top) in ((zb - tank_h / 2, False), (zb + H + tank_h / 2, True)):
        P.box('tank', (D + 0.026, W + 0.03, tank_h), (-0.003, 0, z), tank_mat, bev=min(0.016, tank_h * 0.3), segs=2)
        P.box('tank_seam', (D + 0.03, W + 0.04, 0.008), (-0.003, 0, z + (-1 if top else 1) * (tank_h / 2 - 0.004)),
              tank_mat, bev=0.002, segs=1)
    ztop = zb + H + tank_h
    # a low filler neck and cap on the top tank
    yf = -W * 0.3
    P.cyl('neck', 0.02, 0.02, (0.0, yf, ztop + 0.006), 'steel', segs=14, bev=0.002, bsegs=1)
    P.lathe('cap', [(0.0, 0.016), (0.022, 0.0155), (0.028, 0.008), (0.028, 0.0), (0.021, 0.0)][::-1],
            loc=(0.0, yf, ztop + 0.016), material='chrome', segs=16, close='start', sharp=40.0)
    P.box('cap_ear', (0.05, 0.008, 0.006), (0.0, yf, ztop + 0.033), 'chrome', bev=0.002, segs=1)
    P.tube('overflow', [(-0.012, yf - 0.018, ztop + 0.01), (-0.02, yf - 0.05, ztop + 0.006),
                        (-0.02, -W / 2 - 0.02, zb + H * 0.6), (-0.02, -W / 2 - 0.025, zb)], 0.004, 'rubber', segs=6,
           bend=0.04)
    # hose necks towards the engine: inlet high on one side, outlet low on the other
    yi = W * 0.32 if side_inlet else 0.0
    hr = min(0.02, tank_h * 0.36)
    P.tube('inlet', [(-0.01, yi, ztop - tank_h / 2), (-0.06, yi, ztop - tank_h / 2)], hr, 'steel', segs=12)
    P.torus('bead', hr + 0.001, 0.003, loc=(-0.05, yi, ztop - tank_h / 2), axis='X', segs=14, rsegs=4,
            material='steel')
    P.tube('outlet', [(-0.01, -W * 0.32, zb - tank_h / 2), (-0.06, -W * 0.32, zb - tank_h / 2)], hr, 'steel',
           segs=12)
    # drain petcock out of the end of the bottom tank
    P.cyl('petcock', 0.007, 0.018, (-0.003, W / 2 + 0.024, zb * 0.4), 'chrome', axis='Y', segs=8, bev=None)
    # side brackets with mounting tabs
    for sg in (-1, 1):
        y = sg * (W / 2 + 0.022)
        P.box('bracket', (0.035, 0.012, H + tank_h * 2), (-0.005, y, (zb - tank_h + ztop) / 2), 'steel', bev=0.003,
              segs=1)
        P.box('tab', (0.04, 0.04, 0.008), (-0.005, y + sg * 0.02, ztop - 0.02), 'steel', bev=0.002, segs=1)
        P.bolt((-0.005, y + sg * 0.025, ztop - 0.016), r=0.006, h=0.005)
    if fan:
        R = min(W, H) * 0.45
        P.lathe('shroud', [(R + 0.01, -0.0), (R + 0.03, -0.02), (R + 0.03, -0.06), (R + 0.005, -0.065)],
                loc=(-D / 2, 0, zb + H / 2), material='trim', axis='X', segs=28, sharp=50.0)
        for i in range(4):
            a = math.tau * i / 4 + 0.6
            P.box('fan_strut', (0.01, R * 2, 0.012), (-D / 2 - 0.06, 0, zb + H / 2), 'trim',
                  rot=(math.degrees(a), 0, 0), bev=None)
        P.cyl('fan_motor', 0.045, 0.06, (-D / 2 - 0.09, 0, zb + H / 2), 'steel', axis='X', segs=16, bev=0.005, bsegs=1)
        from parts.engines import fan as engine_fan
        engine_fan(P, -D / 2 - 0.035, 0, zb + H / 2, R * 0.95, blades=5, hub_r=0.035, material='trim', pitch=30,
                   chord=0.06)
    P.views = [('a', 35, 15), ('b', 215, 15)]


def build_rad_std(P):
    radiator(P)


# ------------------------------------------------------------------------------------------- fuel tanks


def build_tank_std(P):
    """
    A flat stamped-steel fuel tank that hangs under the floor (45 L in 0.45 x 0.70 x 0.13): clamshell halves
    welded at a seam flange, pressed beads, two straps under it bolted up to the floor, the sender plate
    with its lines, and the filler neck out of the right side (-Y, where the sedan's filler flap is).
    Within the frames' tank spaces: x +-0.24, y +-0.40, z [0, 0.16].
    """
    P.ao_distance = 0.06
    L, W, H = 0.45, 0.70, 0.13
    z0 = 0.012                     # the straps run under it
    bm = bmesh.new()
    K.bm_cube(bm, (L, W, H), mat4((0, 0, z0 + H / 2)))
    for v in bm.verts:
        if v.co.z > z0 + H * 0.6:
            v.co.x *= 0.975
            v.co.y *= 0.98
    P.mesh('body', bm, 'steel', bev=0.026, segs=3)
    zs = z0 + H * 0.5
    P.box('seam', (L + 0.022, W + 0.022, 0.008), (0, 0, zs), 'steel', bev=0.003, segs=1)
    for y in (-W * 0.26, W * 0.26):
        P.pillow('bead', (L * 0.66, 0.05, 0.012), (0.02, y, z0 + H + 0.001), 'steel', r=0.006, sub=1)
    P.pillow('bead_x', (0.05, W * 0.3, 0.012), (-L * 0.3, 0.0, z0 + H + 0.001), 'steel', r=0.006, sub=1)
    # the filler neck out of the right side, tipped up a little, with its cap
    xf, zf = -0.06, z0 + H * 0.74
    d = V((0.0, -math.cos(math.radians(22)), math.sin(math.radians(22))))
    p0 = V((xf, -W / 2 + 0.01, zf))
    p1 = V((xf, -W / 2 - 0.008, zf))
    p2 = p1 + d * 0.012
    P.tube('filler', [p0, p1, p2], 0.022, 'steel', segs=14, bend=0.01)
    P.torus('filler_bead', 0.0225, 0.003, loc=tuple(p1 + V((0, 0.006, 0))), axis='Y', segs=14, rsegs=4,
            material='steel')
    fr = K.frame_from_z(d, (1, 0, 0))
    P.lathe('filler_cap', [(0.0, 0.016), (0.022, 0.015), (0.026, 0.007), (0.026, 0.0), (0.02, 0.0)][::-1],
            rot=None, loc=(0, 0, 0), material='chrome', segs=16, close='start', sharp=40.0)
    cap = P.statics[-1]
    cap.data.transform(Matrix.Translation(p2) @ fr)
    grip = P.box('cap_grip', (0.04, 0.008, 0.008), (0, 0, 0.018), 'chrome', bev=0.002, segs=1)
    grip.data.transform(Matrix.Translation(p2) @ fr)
    P.tube('vent', [(xf + 0.03, -W / 2 + 0.005, zf + 0.012), (xf + 0.05, -W / 2 - 0.006, zf + 0.022),
                    (xf + 0.1, -W / 2 - 0.012, zf + 0.026)], 0.0045, 'rubber', segs=6, bend=0.02)
    # sender unit on top: plate, screws, terminal and wire, the fuel line out to the front
    zt = z0 + H
    sx, sy = L * 0.18, -W * 0.12
    P.cyl('sender', 0.05, 0.008, (sx, sy, zt + 0.003), 'alu', segs=18, bev=0.002, bsegs=1)
    P.bolts([(sx + 0.038 * math.cos(a), sy + 0.038 * math.sin(a), zt + 0.007) for a in (0.3, 2.4, 4.5)],
            normal=(0, 0, 1), r=0.0045, h=0.0035, washer=False)
    P.cyl('terminal', 0.008, 0.008, (sx - 0.014, sy, zt + 0.011), 'trim', segs=8, bev=None)
    P.tube('wire', [(sx - 0.014, sy, zt + 0.014), (sx - 0.05, sy - 0.03, zt + 0.012), (sx - 0.12, sy - 0.07, zt + 0.006)],
           0.0035, 'trim', segs=5, bend=0.03)
    P.tube('fuel_out', [(sx + 0.018, sy, zt + 0.008), (sx + 0.018, sy, zt + 0.012), (L / 2 - 0.03, sy - 0.01, zt + 0.012),
                        (L / 2 + 0.006, sy - 0.012, zt - 0.02), (L / 2 + 0.006, sy - 0.012, zt - 0.05)], 0.0045, 'steel',
           segs=6, bend=0.02)
    # two straps across under the tank, up its sides (over the seam) to tabs bolted to the floor above
    zb = 0.0035
    for x in (-L * 0.32, L * 0.3):
        side = []
        for sg in (1, -1):
            yw, yf = sg * (W / 2 + 0.004), sg * (W / 2 + 0.017)
            side.append([(x, yw, 0.148), (x, yw, zs + 0.016), (x, yf, zs + 0.006), (x, yf, zs - 0.006),
                         (x, yw, zs - 0.016), (x, yw, z0 + 0.01), (x, sg * (W / 2 - 0.03), zb)])
        path = side[0] + side[1][::-1]
        P.tube('strap', path, 1.0, 'trim', profile=[(-0.02, -0.0025), (0.02, -0.0025), (0.02, 0.0025), (-0.02, 0.0025)],
               bend=0.012, caps=True, sharp=60.0)
        for sg in (-1, 1):
            P.box('strap_tab', (0.044, 0.03, 0.005), (x, sg * (W / 2 + 0.018), 0.1505), 'trim', bev=0.0015, segs=1)
            P.bolt((x, sg * (W / 2 + 0.024), 0.153), r=0.0062, h=0.005, washer=False)
    P.views = [('a', 35, 26), ('b', 215, 26)]


def build_tank_drum(P):
    """A 200 L oil drum standing up as a fuel tank: rolled chimes, two rolling hoops, two bungs, a fuel hose
    out of the big bung down the side, a steel strap, rust patches."""
    P.ao_distance = 0.10
    R, H = 0.286, 0.88
    prof = [(0.0, 0.004), (R - 0.03, 0.004), (R - 0.022, 0.0), (R + 0.004, 0.0), (R + 0.007, 0.008),
            (R + 0.004, 0.018), (R, 0.024)]
    for zh in (H / 3, 2 * H / 3):
        prof += [(R, zh - 0.03), (R + 0.012, zh - 0.012), (R + 0.012, zh + 0.012), (R, zh + 0.03)]
    prof += [(R, H - 0.024), (R + 0.004, H - 0.018), (R + 0.007, H - 0.008), (R + 0.004, H), (R - 0.022, H),
             (R - 0.03, H - 0.006), (0.0, H - 0.006)]
    P.lathe('drum', prof, material='paint', segs=40, sharp=40.0)
    # bungs on the lid: the 2" filler and the 3/4" vent
    bx, by = R * 0.55, 0.0
    P.cyl('bung', 0.04, 0.012, (bx, by, H - 0.002), 'steel', segs=16, bev=0.002, bsegs=1)
    P.cyl('bung_cap', 0.032, 0.016, (bx, by, H + 0.012), 'steel', segs=6, bev=0.002, bsegs=1)
    P.cyl('vent', 0.018, 0.01, (-R * 0.55, 0.05, H), 'steel', segs=12, bev=0.0015, bsegs=1)
    P.cyl('vent_cap', 0.014, 0.012, (-R * 0.55, 0.05, H + 0.01), 'steel', segs=6, bev=None)
    # the fuel hose: out of a fitting on the filler cap, over the chime and down the side
    hp = [V((bx, by, H + 0.02)), V((bx, by, H + 0.07)), V((R + 0.03, by + 0.05, H + 0.05)),
          V((R + 0.05, by + 0.08, H * 0.75)), V((R + 0.04, by + 0.12, H * 0.45)), V((R + 0.02, by + 0.2, 0.1))]
    P.cyl('fitting', 0.012, 0.03, (bx, by, H + 0.035), 'chrome', segs=10, bev=None)
    P.tube('hose', hp, 0.011, 'rubber', segs=10, bend=0.07)
    P.torus('clamp', 0.013, 0.003, loc=(bx, by, H + 0.05), segs=12, rsegs=4, material='steel')
    # a steel strap round the drum with a buckle
    zs = H * 0.52
    P.lathe('strap', [(R + 0.004, zs - 0.02), (R + 0.008, zs - 0.02), (R + 0.008, zs + 0.02), (R + 0.004, zs + 0.02)],
            material='steel', segs=40, loop=True, sharp=50.0)
    P.box('buckle', (0.06, 0.02, 0.06), (0.0, -(R + 0.016), zs), 'steel', bev=0.006, segs=2)
    P.bolt((0.0, -(R + 0.026), zs), normal=(0, -1, 0), r=0.008, h=0.007)
    # rust patches (thin raised blotches) and a stencil band
    for (a, z, sx, sz) in ((0.4, 0.15, 0.12, 0.08), (2.3, 0.55, 0.09, 0.12), (4.1, 0.78, 0.14, 0.05),
                           (5.3, 0.2, 0.07, 0.06)):
        n = 9
        poly = [(sx / 2 * (0.75 + 0.25 * math.sin(i * 2.7 + a)) * math.cos(math.tau * i / n),
                 sz / 2 * (0.75 + 0.25 * math.cos(i * 1.9 + a)) * math.sin(math.tau * i / n)) for i in range(n)]
        m = mat4((math.cos(a) * (R + 0.0015), math.sin(a) * (R + 0.0015), z), (90, 0, math.degrees(a) + 90))
        P.prism('rust', poly, 0.002, material='rust', matrix=m, bev=None)
    P.views = [('a', 35, 18), ('b', 215, 18)]


def build_rad_small(P):
    radiator(P, W=0.42, Htot=0.34, D=0.04, fins=10, tank_h=0.045)


def build_rad_big(P):
    radiator(P, W=0.72, Htot=0.50, D=0.06, fins=16, fan=True, tank_h=0.06)


def moto_tank_section(w, h, zb=0.02, tw=0.075, th=0.085, n=14, scallop=0.0):
    """A motorcycle tank cross-section (y, z): an arch over the top and a tunnel underneath for the frame."""
    pts = []
    for i in range(n + 1):
        t = i / n
        a = math.pi * (t - 0.5)
        y = (w / 2) * math.sin(a)
        c = math.cos(a)
        z = zb + (h - zb) * (c ** 0.5 if c > 0 else 0.0)
        # knee scallop: pull the middle of the flanks in
        k = math.exp(-((abs(a) - 1.05) / 0.32) ** 2)
        y *= 1 - scallop * k
        pts.append((y, z))
    pts += [(tw / 2, zb), (tw / 2 * 0.9, th), (-tw / 2 * 0.9, th), (-tw / 2, zb)]
    # counter-clockwise seen from +X: the arch runs from -Y over the top to +Y: that is clockwise; reverse
    return list(reversed(pts))


def build_tank_moto(P):
    """A 13 L motorcycle tank: teardrop with knee scallops, a frame tunnel underneath, chrome filler cap,
    a two-tone stripe, the fuel tap and hose under the rear."""
    P.ao_distance = 0.06
    stations = [(-0.25, 0.10, 0.12, 0.0), (-0.21, 0.17, 0.17, 0.0), (-0.13, 0.24, 0.215, 0.12),
                (-0.04, 0.29, 0.24, 0.14), (0.06, 0.30, 0.25, 0.04), (0.15, 0.28, 0.24, 0.0),
                (0.21, 0.23, 0.21, 0.0), (0.25, 0.16, 0.16, 0.0)]
    rings = [K.section_x(moto_tank_section(w, h, scallop=sc), x) for (x, w, h, sc) in stations]
    bm = bmesh.new()
    vr, faces = K.bm_loft(bm, rings, cap_start=True, cap_end=True)
    bmesh.ops.recalc_face_normals(bm, faces=faces)
    # two-tone stripe: a band of the arch on both flanks (section points 2-3 and 11-12 of the reversed arch),
    # over the middle stations
    n_arch = 15
    m = len(rings[0])
    for f in faces:
        if len(f.verts) != 4:
            continue
        idx = sorted({vr_index for vr_index in range(m) for ring in vr if any(v is ring[vr_index] for v in f.verts)})
        xs = [v.co.x for v in f.verts]
        if -0.135 < min(xs) and max(xs) < -0.035 and idx in ([5, 6], [16, 17]):
            f.material_index = 2
            continue
        if not (-0.17 < min(xs) and max(xs) < 0.22):
            continue
        if idx in ([6, 7], [15, 16]):
            f.material_index = 1
    o = P.mesh('tank', bm, ['paint', 'paint_b', 'rubber'], sharp=60.0)
    P.cfg[o.name]['sub'] = 1
    # filler cap
    P.lathe('cap', [(0.0, 0.016), (0.03, 0.015), (0.038, 0.008), (0.04, 0.0), (0.034, -0.004)][::-1],
            loc=(0.07, 0.0, 0.248), material='chrome', segs=20, close='start', sharp=50.0)
    P.box('cap_hinge', (0.02, 0.016, 0.01), (0.03, 0.0, 0.252), 'chrome', bev=0.002, segs=1)
    # mounting rubbers at the front, fuel tap and hose at the rear
    for sg in (-1, 1):
        P.cyl('rubber', 0.012, 0.02, (0.18, sg * 0.045, 0.03), 'rubber', axis='Y', segs=10, bev=0.002, bsegs=1)
    P.box('tap', (0.03, 0.025, 0.035), (-0.17, 0.05, 0.005), 'chrome', bev=0.004, segs=1)
    P.box('tap_lever', (0.008, 0.04, 0.01), (-0.17, 0.075, 0.0), 'trim', bev=0.002, segs=1)
    P.tube('hose', [(-0.17, 0.05, -0.012), (-0.15, 0.04, -0.06), (-0.08, 0.02, -0.08)], 0.006, 'rubber', segs=6,
           bend=0.03)
    P.views = [('a', 35, 20), ('b', 215, 20)]


def build_tank_big(P):
    """A 90 L motorhome tank: a deep steel box with pressed beads, the filler neck on the side, two straps
    hanging from brackets, the sender and lines, a drain plug."""
    P.ao_distance = 0.10
    L, W, H = 0.98, 0.52, 0.30
    bm = bmesh.new()
    K.bm_cube(bm, (L, W, H), mat4((0, 0, H / 2 + 0.01)))
    P.mesh('body', bm, 'steel', bev=0.04, segs=3)
    P.box('seam', (L + 0.024, W + 0.024, 0.012), (0, 0, H * 0.5), 'steel', bev=0.003, segs=1)
    for x in (-0.3, 0.0, 0.3):
        P.pillow('bead', (0.05, W * 0.8, 0.014), (x, 0.0, H + 0.008), 'steel', r=0.006, sub=1)
        for sg in (-1, 1):
            P.pillow('bead_s', (0.05, 0.014, H * 0.6), (x, sg * (W / 2 + 0.006), H * 0.55), 'steel', r=0.006, sub=1)
    base = V((-L * 0.3, W / 2 + 0.005, H * 0.75))
    P.tube('filler', [base, base + V((0, 0.05, 0.02)), base + V((0.02, 0.10, 0.10))], 0.035, 'steel', segs=14,
           bend=0.05)
    top = base + V((0.02, 0.10, 0.10))
    P.cyl('filler_cap', 0.045, 0.03, tuple(top + V((0, 0.005, 0.012))), 'trim', rot=(-45, 0, 0), segs=16,
          bev=0.005, bsegs=1)
    sx, sy = L * 0.25, -W * 0.15
    P.cyl('sender', 0.06, 0.01, (sx, sy, H + 0.015), 'alu', segs=18, bev=0.002, bsegs=1)
    P.tube('fuel_out', [(sx + 0.02, sy, H + 0.02), (sx + 0.02, sy, H + 0.05), (L / 2 + 0.06, sy - 0.03, H + 0.03)],
           0.006, 'steel', segs=6, bend=0.03)
    P.cyl('drain', 0.014, 0.012, (-L * 0.4, 0.0, 0.006), 'steel', segs=6, bev=None)
    for x in (-L * 0.28, L * 0.28):
        P.tube('strap', [(x, -W / 2 - 0.035, H + 0.06), (x, -W / 2 - 0.035, 0.03), (x, -W / 2 + 0.03, -0.008),
                         (x, W / 2 - 0.03, -0.008), (x, W / 2 + 0.035, 0.03), (x, W / 2 + 0.035, H + 0.06)],
               1.0, 'trim', profile=[(-0.025, -0.003), (0.025, -0.003), (0.025, 0.003), (-0.025, 0.003)],
               bend=0.03, caps=True, sharp=60.0)
        for sg in (-1, 1):
            P.box('hanger', (0.06, 0.05, 0.05), (x, sg * (W / 2 + 0.04), H + 0.085), 'steel', bev=0.005, segs=1)
            P.bolt((x, sg * (W / 2 + 0.066), H + 0.085), normal=(0, sg, 0), r=0.008, h=0.006)
    P.views = [('a', 35, 18), ('b', 215, 18)]


PARTS = {
    'bat_std': build_bat_std,
    'bat_moto': build_bat_moto,
    'bat_truck': build_bat_truck,
    'rad_std': build_rad_std,
    'rad_small': build_rad_small,
    'rad_big': build_rad_big,
    'tank_std': build_tank_std,
    'tank_moto': build_tank_moto,
    'tank_big': build_tank_big,
    'tank_drum': build_tank_drum,
}


def main(args):
    K.run(PARTS, args)
