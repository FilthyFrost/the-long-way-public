"""
The place models that stand out in the open (src/core/world/sites.ts): the filling station's canopy, pumps, the
tall sign and the tank lid, drums, tyres, crates and barrels, the farmhouse's woodpile, washing line, vegetable
patch, mailbox, trough and fence, picnic tables and benches; then the camps', the jetties' and the works' things:

    blender -b --factory-startup --python tools/blender/build.py -- places/outside [<id>|all] [--toon]
        [--norender] [--stats] [--look[=yaw,pitch/...]] [--open] [--cull]

Writes public/models/modcar/places/<id>.glb (conventions: places/_common.py).
"""
import math

import bmesh
from mathutils import Matrix

from parts import _kit as K
from parts._kit import V, mat4

from items import junk
from places import _common as C
from places._common import spec, door_l, door_r, drawer, lid, lift, free

TAU = math.tau


# ------------------------------------------------------------------------------------------------ drum

def drum(P):
    """
    A 200 l steel oil drum (0.6 x 0.88): the rolled chimes top and bottom, two rolling hoops, the middle band
    between them in the second colour; the head sunk inside the top chime with its 2-inch bung (a hex cap) and
    the 3/4-inch vent, a dent in the side and the top chime knocked down a little on one side, rust coming
    through along the bottom chime.
    """
    R, H = 0.289, 0.88
    hoops = (0.295, 0.585)
    prof = [(0.0, 0.007), (R - 0.034, 0.007), (R - 0.024, 0.0), (R + 0.003, 0.0), (R + 0.008, 0.008),
            (R + 0.006, 0.019), (R, 0.026), (R, 0.09), (R, 0.17), (R, 0.24)]
    for k, zh in enumerate(hoops):
        prof += [(R, zh - 0.03), (R + 0.011, zh - 0.013), (R + 0.011, zh + 0.013), (R, zh + 0.03)]
        if k == 0:
            prof += [(R, zh + 0.03 + (hoops[1] - hoops[0] - 0.06) * f) for f in (0.25, 0.5, 0.75)]
    prof += [(R, 0.68), (R, 0.77), (R, H - 0.026), (R + 0.006, H - 0.019), (R + 0.008, H - 0.008), (R + 0.003, H),
             (R - 0.024, H), (R - 0.03, H - 0.012), (R - 0.04, H - 0.025), (R * 0.55, H - 0.025),
             (0.0, H - 0.025)]
    segs = 32
    bm = bmesh.new()
    K.bm_lathe(bm, prof, segs=segs)
    # the dent between the hoops, and the top chime knocked down over a short arc
    a0, zd, rd, dep = 2.3, 0.44, 0.11, 0.05
    for v in bm.verts:
        r = math.hypot(v.co.x, v.co.y)
        a = math.atan2(v.co.y, v.co.x)
        if r > R - 0.001 and hoops[0] + 0.03 < v.co.z < hoops[1] - 0.03:
            da = (a - a0 + math.pi) % TAU - math.pi
            d2 = ((R * da) ** 2 + ((v.co.z - zd) * 1.3) ** 2) / rd ** 2
            if d2 < 1.0:
                k = 1 - dep * (1 - d2) ** 1.5 / r
                v.co.x *= k
                v.co.y *= k
        if v.co.z > H - 0.03 and r > R - 0.04:
            da = (a + 0.7 + math.pi) % TAU - math.pi
            w = max(0.0, 1 - (da / 0.5) ** 2)
            v.co.z -= 0.012 * w * (v.co.z - (H - 0.03)) / 0.03
    # materials: the band between the hoops in the second colour, rust patches along the bottom chime
    for f in bm.faces:
        c = f.calc_center_median()
        a = math.atan2(c.y, c.x)
        rc = c.xy.length
        if hoops[0] + 0.03 < c.z < hoops[1] - 0.03 and rc > R - 0.06:
            f.material_index = 1
        if c.z < 0.03 and rc > R - 0.03 and (math.sin(3 * a + 1.0) + 0.6 * math.sin(7 * a)) > 0.9:
            f.material_index = 2
    P.mesh('drum', bm, ['paint', 'paint_b', 'rust'], sharp=30.0)
    # the bungs: a raised flange each, the big one with its hex cap and tab, the vent with its little cap
    # (the head is sunk 2.5 cm inside the chime: the bungs stand no higher than its top)
    zt = H - 0.025
    bx = R * 0.6
    P.cyl('bung_flange', 0.038, 0.008, (bx, 0.0, zt + 0.004), 'paint', segs=16, bev=0.002, bsegs=1)
    P.cyl('bung_cap', 0.03, 0.01, (bx, 0.0, zt + 0.013), 'steel', segs=6, bev=0.002, bsegs=1)
    P.box('bung_tab', (0.012, 0.046, 0.006), (bx, 0.0, zt + 0.021), 'steel', bev=0.002, segs=1)
    P.cyl('vent_flange', 0.022, 0.008, (-R * 0.6, 0.06, zt + 0.004), 'paint', segs=12, bev=0.0015, bsegs=1)
    P.cyl('vent_cap', 0.016, 0.01, (-R * 0.6, 0.06, zt + 0.013), 'steel', segs=6, bev=0.0015, bsegs=1)
    P.views = [('a', 35, 20), ('b', 215, 26)]


# ------------------------------------------------------------------------------------------------ the filling station

def canopy(P, W=11.0, D=7.0, H=4.6):
    """
    The filling station's canopy (11 x 7 x 4.6; canopy_s 9.5 x 6): four square columns where the places stand
    them (0.6 m in from the corners) on bolted base plates, kick cladding round their feet; the deep fascia
    (paint) with its stripe (paint_b) and aluminium lips, the white soffit in panels with six light boxes
    (emit; M_lamp_1..6 under them, +Z down), the steel deck on top behind the fascia, a downpipe down one column;
    the pump island under it (a painted kerb, bollards at its ends; M_pump_1 / M_pump_2 where the pumps stand).
    """
    hw, hd = W / 2, D / 2
    zf0 = H - 0.92                                 # the fascia's lower edge
    zs = H - 0.8                                   # the soffit
    t = 0.06
    # ---- the fascia: four deep panels, the stripe, the lips
    for sx in (-1, 1):
        C.block(P, 'fascia', (t, W, H - zf0), (sx * (hd - t / 2), 0.0, (zf0 + H) / 2), 'paint', bev=0.012, segs=1,
                step=0.3, axes=(2,))
        C.block(P, 'stripe', (0.012, W + 0.012, 0.2), (sx * (hd + 0.006), 0.0, H - 0.4), 'paint_b', bev=0.004)
        C.block(P, 'lip', (0.05, W + 0.02, 0.04), (sx * (hd - 0.015), 0.0, zf0 + 0.02), 'alu', bev=0.006)
        C.block(P, 'cap', (0.09, W + 0.02, 0.03), (sx * (hd - 0.035), 0.0, H - 0.015), 'alu', bev=0.006)
    for sy in (-1, 1):
        C.block(P, 'fascia', (D - 2 * t, t, H - zf0), (0.0, sy * (hw - t / 2), (zf0 + H) / 2), 'paint', bev=0.012,
                segs=1, step=0.3, axes=(2,))
        C.block(P, 'stripe', (D + 0.012, 0.012, 0.2), (0.0, sy * (hw + 0.006), H - 0.4), 'paint_b', bev=0.004)
        C.block(P, 'lip', (D - 0.04, 0.05, 0.04), (0.0, sy * (hw - 0.015), zf0 + 0.02), 'alu', bev=0.006)
        C.block(P, 'cap', (D - 0.14, 0.09, 0.03), (0.0, sy * (hw - 0.035), H - 0.015), 'alu', bev=0.006)
    # ---- the soffit: white panels (a grid for the AO), their seams, the light boxes
    C.block(P, 'soffit', (D - 2 * t, W - 2 * t, 0.02), (0.0, 0.0, zs + 0.01), 'paint_b', bev=None, step=1.1,
            axes=(0, 1))
    bm = bmesh.new()
    n_seams = int(W / 1.2)
    for i in range(1, n_seams):
        y = -hw + t + i * (W - 2 * t) / n_seams
        K.bm_cube(bm, (D - 2 * t, 0.03, 0.012), mat4((0.0, y, zs - 0.006)))
    P.mesh('seams', bm, 'paint_b', bev=None)
    lamps = [(sx * hd * 0.38, sy * hw * 0.6) for sy in (-1, 0, 1) for sx in (-1, 1)]
    for k, (x, y) in enumerate(lamps):
        C.block(P, 'lamp_frame', (0.6, 1.3, 0.05), (x, y, zs - 0.025), 'alu', bev=0.008, segs=1)
        C.block(P, 'lamp', (0.5, 1.2, 0.02), (x, y, zs - 0.055), 'emit', bev=0.004)
        C.marker(P, f'M_lamp_{k + 1}', (x, y, zs - 0.066), up=(0, 0, -1))
    # ---- the deck on top, a little below the fascia's top, its standing seams
    C.block(P, 'deck', (D - 2 * t, W - 2 * t, 0.02), (0.0, 0.0, H - 0.07), 'steel', bev=None, step=1.5, axes=(0, 1))
    bm = bmesh.new()
    for i in range(1, int(D / 0.9)):
        x = -hd + t + i * (D - 2 * t) / int(D / 0.9)
        K.bm_cube(bm, (0.02, W - 2 * t, 0.03), mat4((x, 0.0, H - 0.045)))
    P.mesh('deck_seams', bm, 'steel', bev=None)
    # ---- the columns
    cx, cy = hd - 0.6, hw - 0.6
    cs = 0.3
    for sx in (-1, 1):
        for sy in (-1, 1):
            x, y = sx * cx, sy * cy
            C.block(P, 'column', (cs, cs, zs - 0.02), (x, y, (zs - 0.02) / 2), 'paint_b', bev=0.03, segs=1, step=1.3,
                    axes=(2,))
            C.block(P, 'cladding', (cs + 0.03, cs + 0.03, 1.1), (x, y, 0.03 + 0.55), 'paint', bev=0.02, segs=1)
            C.block(P, 'collar', (cs + 0.08, cs + 0.08, 0.08), (x, y, zs - 0.04), 'paint_b', bev=0.01, segs=1)
            C.block(P, 'base_plate', (0.46, 0.46, 0.025), (x, y, 0.0125), 'steel', bev=0.005)
            P.bolts([(x + bx * 0.18, y + by * 0.18, 0.025) for bx in (-1, 1) for by in (-1, 1)], r=0.016, h=0.016,
                    washer=False)
    # the downpipe down the (+X, +Y) column, its outlet at the foot
    dx, dy = cx + cs / 2 + 0.07, cy
    P.tube('downpipe', [(hd - 0.01, dy, zs + 0.25), (dx + 0.12, dy, zs + 0.1), (dx, dy, zs - 0.15), (dx, dy, 0.25),
                        (dx + 0.18, dy, 0.08)], 0.05, 'alu', segs=7, bend=0.1)
    for z in (0.9, 2.1, 3.2):
        C.block(P, 'pipe_clip', (0.14, 0.12, 0.03), (dx - 0.05, dy, z), 'steel', bev=0.004)
    # ---- the pump island: a long kerb with round ends, bollards at its ends
    iy = hw - 1.2
    ix = 0.55
    poly = [(ix * math.cos(a), iy - ix + ix * math.sin(a)) for a in [math.radians(-90 + 180 * k / 6) for k in
                                                                      range(1, 6)]]
    poly = [(ix, -iy + ix), (ix, iy - ix)] + [(ix * math.cos(math.radians(30 * k)), iy - ix + ix *
                                               math.sin(math.radians(30 * k))) for k in range(1, 6)] + \
        [(-ix, iy - ix), (-ix, -iy + ix)] + [(ix * math.cos(math.radians(180 + 30 * k)), -iy + ix + ix *
                                              math.sin(math.radians(180 + 30 * k))) for k in range(1, 6)]
    bm = bmesh.new()
    K.bm_prism(bm, poly, 0.16, matrix=Matrix.Translation((0, 0, 0.08)))
    for f in bm.faces:
        f.material_index = 1 if f.normal.z > 0.9 else 0
    P.mesh('island', bm, ['paint_b', 'ceramic'], bev=0.012, segs=2)
    for sy in (-1, 1):
        P.cyl('bollard', 0.07, 0.9, (0.0, sy * (iy - 0.15), 0.16 + 0.45), 'paint', segs=12, bev=0.01, bsegs=1)
        P.cyl('bollard_cap', 0.074, 0.06, (0.0, sy * (iy - 0.15), 1.06 + 0.03), 'paint_b', segs=12, r2=0.05,
              bev=0.006, bsegs=1)
        C.marker(P, f'M_pump_{(sy + 3) // 2}', (0.0, sy * 2.5, 0.16))
    P.ao_distance = 0.4
    P.views = [('a', 30, 18), ('b', 210, 28)]


def digits(P, name, c, n, w, h, normal, material='ceramic', gap=0.006):
    """A row of n raised digit wheels (blank patches: no text) centred on c on a face facing `normal`."""
    nrm = V(normal).normalized()
    side = V((0, 0, 1)).cross(nrm).normalized()
    bm = bmesh.new()
    for k in range(n):
        q = V(c) + side * ((k - (n - 1) / 2) * (w + gap))
        C.rect_face(bm, w, h, q, nrm)
    return P.mesh(name, bm, material, sharp=50.0)


def nozzle(P, pivot):
    """The pump's nozzle hanging in its boot, built round its hook (pivot): the spout down into the boot, the cast
    body over it with the lever guard and the lever, the swivel at the back where the hose goes in. Returns the
    objects and the swivel's end (M_nozzle)."""
    px, py, pz = pivot
    objs = []
    # the body: a cast block sloping up to the swivel at the back-top
    objs.append(C.block(P, 'nozzle_body', (0.06, 0.05, 0.13), (px, py, pz + 0.055), 'alu', rot=(0, -28, 0), bev=0.014,
                        segs=2))
    sw = V((px - 0.06, py, pz + 0.14))
    objs.append(P.cyl('nozzle_swivel', 0.019, 0.05, tuple(sw + V((-0.012, 0, 0.012))), 'alu',
                      axis=(-0.7, 0, 0.7), segs=10, bev=0.003, bsegs=1))
    objs.append(P.tube('nozzle_spout', [(px + 0.01, py, pz + 0.01), (px + 0.03, py, pz - 0.03),
                                        (px + 0.03, py, pz - 0.2)], 0.011, 'steel', segs=8, bend=0.03))
    objs.append(P.tube('nozzle_guard', [(px + 0.02, py, pz + 0.0), (px - 0.07, py, pz - 0.035),
                                        (px - 0.11, py, pz + 0.05)], 0.0055, 'steel', segs=6, bend=0.03))
    objs.append(C.block(P, 'nozzle_lever', (0.08, 0.016, 0.014), (px - 0.05, py, pz + 0.012), 'steel',
                        rot=(0, 18, 0), bev=0.004))
    end = sw + V((-0.03, 0, 0.03))
    return objs, end


def pump(P):
    """
    An old fuel dispenser (0.9 x 0.55 x 1.5): a steel plinth (0.16, the island's height: on an island it is hidden,
    on the ground it is the pump's foot), the lower cabinet in the station's colour with its access panel and
    louvres and the stripe (paint_b), the white computing head with a display on both faces (rows of digit
    wheels under glass, raised patches for the labels: M_display on the front's), the flat top an oil can is left
    on; on the +Y side the nozzle boot with the NOZZLE hanging in it (origin on its hook, M_nozzle where the hose
    goes in) and the HOSE looping down from its outlet (M_hose) to it.
    """
    D, H = 0.55, 1.5
    hd = D / 2
    y0, y1 = -0.44, 0.27                         # the body across Y
    yc, bw = (y0 + y1) / 2, y1 - y0
    zp, zh = 0.16, 0.92                          # the plinth's top, the head's bottom
    C.block(P, 'plinth', (D - 0.06, bw - 0.04, zp), (0.0, yc, zp / 2), 'steel', bev=0.01, segs=1)
    C.block(P, 'cabinet', (D - 0.04, bw, zh - zp), (0.0, yc, (zp + zh) / 2), 'paint', bev=0.016, segs=2, step=0.3,
            axes=(1, 2))
    for sx in (-1, 1):
        xf = sx * (hd - 0.02)
        # the access panel and its two latches, the louvres under it
        bm = bmesh.new()
        K.bm_cube(bm, (0.012, bw - 0.12, 0.42), mat4((xf, yc, 0.55)))
        P.mesh('panel', bm, 'paint', bev=0.004, segs=1)
        for yy in (yc - 0.22, yc + 0.22):
            C.block(P, 'latch', (0.016, 0.03, 0.05), (xf + sx * 0.01, yy, 0.7), 'steel', bev=0.004)
        for k in range(4):
            C.block(P, 'louvre', (0.012, bw - 0.18, 0.014), (xf + sx * 0.004, yc, 0.22 + 0.035 * k), 'trim',
                    rot=(0, sx * 30, 0), bev=0.002)
    C.block(P, 'stripe', (D - 0.025, bw + 0.015, 0.07), (0.0, yc, zh - 0.07), 'paint_b', bev=0.006)
    # the head
    zt = H - 0.02
    C.block(P, 'head', (D - 0.02, bw, zt - zh), (0.0, yc, (zh + zt) / 2), 'paint_b', bev=0.04, segs=2, step=0.25,
            axes=(1, 2))
    C.block(P, 'top', (D - 0.06, bw - 0.04, 0.02), (0.0, yc, H - 0.01), 'alu', bev=0.006, segs=1)
    for sx in (-1, 1):
        xf = sx * (hd - 0.01)
        zc = (zh + zt) / 2 + 0.01
        C.block(P, 'bezel', (0.02, bw - 0.12, 0.4), (xf - sx * 0.006, yc, zc), 'trim', bev=0.008)
        for k, (n, w) in enumerate(((5, 0.05), (5, 0.04), (4, 0.034))):
            z = zc + 0.11 - 0.105 * k
            C.block(P, 'readout', (0.006, n * (w + 0.008) + 0.03, 0.07 - 0.008 * k), (xf + sx * 0.004, yc + 0.04, z),
                    'glass_dark', bev=0.002)
            digits(P, 'digits', (xf + sx * 0.0076, yc + 0.04, z), n, w, 0.05 - 0.008 * k, (sx, 0, 0))
            C.patch(P, 'label', 0.08, 0.026, (xf + sx * 0.004, yc - 0.2, z), (sx, 0, 0), 'paint', t=0.003)
        C.block(P, 'glass', (0.006, bw - 0.14, 0.38), (xf + sx * 0.013, yc, zc), 'glass', bev=None)
    C.marker(P, 'M_display', (hd - 0.01 + 0.016, yc, (zh + zt) / 2 + 0.01), up=(1, 0, 0))
    # the nozzle boot on the +Y side, near the front
    by = y1 + 0.085
    bx, bz = 0.12, 1.02
    C.block(P, 'boot_plate', (0.16, 0.012, 0.26), (bx - 0.01, y1 + 0.006, bz - 0.06), 'steel', bev=0.003)
    P.lathe('boot', K.shell_profile([(0.035, -0.17), (0.04, -0.02), (0.045, 0.0)], 0.004), loc=(bx + 0.02, by, bz),
            material='steel', segs=12, loop=True, sharp=50.0)
    C.block(P, 'boot_arm', (0.03, by - y1, 0.02), (bx + 0.02, (y1 + by) / 2, bz - 0.03), 'steel', bev=0.003)
    C.block(P, 'hook', (0.02, 0.04, 0.06), (bx - 0.07, y1 + 0.02, bz + 0.0), 'steel', bev=0.004)
    objs, end = nozzle(P, (bx - 0.01, by, bz + 0.02))
    P.mover('NOZZLE', objs, (bx - 0.01, by, bz + 0.02))
    C.marker(P, 'M_nozzle', tuple(end), up=tuple((end - V((bx - 0.07, by, bz + 0.1))).normalized()), mover='NOZZLE')
    # the hose: out of the head's side near the back, down in a loop and up to the swivel
    out = V((-0.14, y1 + 0.01, 1.3))
    C.block(P, 'outlet', (0.06, 0.03, 0.06), (out.x, y1 + 0.015, out.z), 'alu', bev=0.006)
    hy = by + 0.058
    hose = P.tube('hose', [out + V((0.0, 0.02, 0.0)), V((-0.16, hy - 0.02, 1.16)), V((-0.2, hy, 0.7)),
                           V((-0.1, hy, 0.32)), V((0.06, hy, 0.3)), V((0.2, hy - 0.01, 0.6)), V((0.2, hy - 0.02, 0.95)),
                           end + V((-0.01, 0.0, 0.01))], 0.017, 'rubber', segs=8, bend=0.14)
    P.mover('HOSE', [hose], tuple(out))
    C.marker(P, 'M_hose', tuple(out + V((0.0, 0.02, 0.0))), up=(0, 1, 0))
    C.marker(P, 'M_top', (0.0, yc, H))
    P.views = [('a', 35, 16), ('b', 200, 20)]


def signpole(P, W=2.6, H=8.4, bh=1.9):
    """
    The tall sign at the road (2.6 x 0.3 x 8.4; signpole_m 2.2 x 6.2, signpole_s 2.2 x 5.4): a steel pole on its
    bolted collar, the box sign at the top (its frame paint_b, both faces plain paint for the game's pictogram:
    M_board / M_board_b at their middles, +Z out), the cap; under it on a cross arm the price board hanging askew
    from one hook, its digit wheels raised on both faces; rust coming through low on the pole.
    """
    hw = W / 2
    rp = 0.12
    zb0 = H - bh                                    # the board's bottom
    P.cyl('collar', 0.15, 0.22, (0.0, 0.0, 0.11), 'steel', segs=16, bev=0.01, bsegs=1)
    P.bolts([(0.12 * math.cos(a), 0.12 * math.sin(a), 0.22) for a in (0.4, 2.0, 3.5, 5.1)], r=0.014, h=0.014,
            washer=True)
    bm = bmesh.new()
    K.bm_cyl(bm, rp, zb0 + 0.1 - 0.2, segs=16, matrix=Matrix.Translation((0, 0, 0.2 + (zb0 + 0.1 - 0.2) / 2)))
    C.cuts(bm, (0.24, 0.24, zb0), 0.8, axes=(2,))
    for f in bm.faces:
        c = f.calc_center_median()
        a = math.atan2(c.y, c.x)
        if c.z < 1.4 and math.sin(2.3 * a + 1.0) + 0.7 * math.sin(5 * a) > 0.8 - 0.4 * (1.4 - c.z):
            f.material_index = 1
    P.mesh('pole', bm, ['paint_b', 'rust'], bev=None, sharp=40.0)
    # the box sign: its frame, its two faces, the cap
    fd = 0.26
    fr = 0.09
    C.block(P, 'frame_top', (fd, W, fr), (0.0, 0.0, H - fr / 2), 'paint_b', bev=0.014, segs=2, step=0.6, axes=(1,))
    C.block(P, 'frame_bottom', (fd, W, fr), (0.0, 0.0, zb0 + fr / 2), 'paint_b', bev=0.014, segs=2, step=0.6, axes=(1,))
    for sy in (-1, 1):
        C.block(P, 'frame_side', (fd, fr, bh - 2 * fr), (0.0, sy * (hw - fr / 2), zb0 + bh / 2), 'paint_b', bev=0.014,
                segs=2, step=0.5, axes=(2,))
    for sx in (-1, 1):
        C.block(P, 'face', (0.02, W - 2 * fr + 0.02, bh - 2 * fr + 0.02), (sx * (fd / 2 - 0.03), 0.0, zb0 + bh / 2),
                'paint', bev=0.004, step=0.4, axes=(1, 2))
        C.marker(P, 'M_board' if sx > 0 else 'M_board_b', (sx * (fd / 2 - 0.02), 0.0, zb0 + bh / 2), up=(sx, 0, 0))
    # the price board on its cross arm, hanging askew from one hook
    za = zb0 - 0.32
    C.block(P, 'arm', (0.08, W * 0.78, 0.08), (0.0, 0.0, za), 'steel', bev=0.008, segs=1)
    C.block(P, 'arm_brace', (0.06, 0.06, 0.3), (0.0, 0.0, za + 0.15), 'steel', bev=0.006)
    pw, ph = W * 0.72, 0.62
    tilt = 7.0
    hook = V((0.0, -pw / 2 + 0.08, za - 0.05))
    m = Matrix.Translation(hook) @ Matrix.Rotation(math.radians(tilt), 4, 'X') @ \
        Matrix.Translation((0.0, pw / 2 - 0.08, -0.08 - ph / 2))
    since = C.mark(P)
    C.block(P, 'price_board', (0.04, pw, ph), (0.0, 0.0, 0.0), 'paint_b', bev=0.01, segs=1)
    for sx in (-1, 1):
        for k in range(2):
            z = 0.14 - 0.28 * k
            C.block(P, 'price_band', (0.006, pw - 0.18, 0.19), (sx * 0.022, 0.05, z), 'trim', bev=0.003)
            digits(P, 'price_digits', (sx * 0.0255, 0.08, z), 4, 0.14, 0.15, (sx, 0, 0))
            C.patch(P, 'price_label', 0.12, 0.06, (sx * 0.02, -pw / 2 + 0.11, z), (sx, 0, 0), 'paint', t=0.004)
    C.xform(P, since, m)
    for (y, ok) in ((-pw / 2 + 0.08, True), (pw / 2 - 0.08, False)):
        top = V((0.0, y, za - 0.04))
        if ok:
            bot = m @ V((0.0, -pw / 2 + 0.08, ph / 2 - 0.02))
            P.tube('hanger', [top, bot], 0.006, 'steel', segs=6)
        else:
            P.tube('hanger', [top, top + V((0.0, 0.01, -0.1))], 0.006, 'steel', segs=6)
    P.ao_distance = 0.2
    P.views = [('a', 30, 10), ('b', 120, 6)]


def tank_lid(P):
    """
    The underground tank's lid (0.9 x 0.9 x 0.04): a steel frame plate with its raised rim, set flush in the
    forecourt, the round lid in it (LID, hinged at its back edge, a raised chequer on it, the lifting slot); under it
    the dark well and the fill pipe's cap (M_inside: where the petrol is drawn).
    """
    hw = 0.45
    zt = 0.037
    plate = C.block(P, 'frame', (0.9, 0.9, 0.02), (0.0, 0.0, zt - 0.01), 'steel', bev=0.004, step=0.3, axes=(0, 1))
    hole = bmesh.new()
    K.bm_cyl(hole, 0.322, 0.1, segs=32, matrix=Matrix.Translation((0, 0, zt)))
    P.cut(plate, hole)
    for sx in (-1, 1):
        C.block(P, 'rim', (0.03, 0.9, 0.04), (sx * (hw - 0.015), 0.0, 0.02), 'steel', bev=0.005)
        C.block(P, 'rim', (0.84, 0.03, 0.04), (0.0, sx * (hw - 0.015), 0.02), 'steel', bev=0.005)
    C.block(P, 'frame_under', (0.84, 0.84, 0.017), (0.0, 0.0, 0.0085), 'steel', bev=None)
    P.lathe('well', [(0.0, 0.004), (0.33, 0.004), (0.33, 0.03), (0.322, 0.03), (0.322, 0.012), (0.0, 0.012)][::-1],
            material='trim', segs=32, loop=False, close='both', sharp=40.0)
    P.cyl('fill_pipe', 0.065, 0.012, (0.05, 0.03, 0.018), 'steel', segs=14, bev=0.002, bsegs=1)
    P.cyl('fill_cap', 0.055, 0.01, (0.05, 0.03, 0.029), 'paint', segs=14, bev=0.002, bsegs=1)
    C.block(P, 'cap_bar', (0.016, 0.07, 0.008), (0.05, 0.03, 0.037), 'paint', bev=0.002)
    C.marker(P, 'M_inside', (0.05, 0.03, 0.034))
    # the lid
    r = 0.312
    objs = [P.cyl('lid', r, 0.016, (0.0, 0.0, zt - 0.008), 'paint', segs=32, bev=0.003, bsegs=1)]
    bm = bmesh.new()
    for i in range(-5, 6):
        for j in range(-5, 6):
            x, y = i * 0.052, j * 0.052 + (0.026 if i % 2 else 0.0)
            if x * x + y * y > (r - 0.04) ** 2 or (abs(y) < 0.05 and x > 0.17):
                continue
            K.bm_cube(bm, (0.032, 0.008, 0.003), mat4((x, y, zt + 0.0015), (0, 0, 45 if (i + j) % 2 else -45)))
    objs.append(P.mesh('chequer', bm, 'paint', bev=None))
    bm = bmesh.new()
    C.rect_face(bm, 0.07, 0.02, (0.23, 0.0, zt + 0.0004), (0, 0, 1), up=(1, 0, 0))
    objs.append(P.mesh('lift_slot', bm, 'trim', sharp=50.0))
    P.mover('LID', objs, (-r, 0.0, zt - 0.016))
    P.cyl('lid_hinge', 0.009, 0.12, (-r - 0.004, 0.0, zt - 0.012), 'steel', axis='Y', segs=8, bev=None)
    P.views = [('a', 30, 40), ('b', 210, 50)]


def tyre_bm(bm, c, R, w, ri, segs=28, tilt=(0.0, 0.0), spin=0.0, seed=0.0):
    """An old car tyre lying flat at c (its axis up), its tread a checker of worn blocks, into bm."""
    hw = w / 2
    sw = R - ri
    prof = [(ri, -hw * 0.78), (ri + sw * 0.35, -hw), (R - sw * 0.2, -hw * 0.96), (R - 0.008, -hw * 0.8),
            (R, -hw * 0.62), (R, -hw * 0.22), (R, hw * 0.22), (R, hw * 0.62), (R - 0.008, hw * 0.8),
            (R - sw * 0.2, hw * 0.96), (ri + sw * 0.35, hw), (ri, hw * 0.78)][::-1]
    m = Matrix.Translation(V(c)) @ Matrix.Rotation(math.radians(tilt[0]), 4, 'X') @ \
        Matrix.Rotation(math.radians(tilt[1]), 4, 'Y') @ Matrix.Rotation(math.radians(spin), 4, 'Z')
    rings = K.bm_lathe(bm, prof, segs=segs, loop=True)
    for k, ring in enumerate(rings):
        if prof[k][0] < R - 0.001:
            continue
        for i, v in enumerate(ring):
            if (i + k) % 2:
                v.co.x *= (R - 0.016) / R
                v.co.y *= (R - 0.016) / R
    verts = [v for ring in rings for v in ring]
    K.bm_transform(bm, m, verts)
    bmesh.ops.recalc_face_normals(bm, faces=list({f for v in verts for f in v.link_faces}))


def tyres(P, n=4, H=0.85):
    """
    A stack of old car tyres lying flat (0.8 x 0.8 x 0.85, four; tyres_low 0.62, three): each a little off the one
    under it and turned, worn tread blocks; the top one is still on its rusty steel wheel.
    """
    R, ri = 0.388, 0.22
    w = (H - 0.014) / n - 0.002
    bm = bmesh.new()
    z = 0.0
    for k in range(n):
        tz = w / 2 + z
        dx, dy = 0.03 * C.jit(k, 1.0), 0.03 * C.jit(k, 2.0)
        tilt = (1.6 * C.jit(k, 3.0), 1.6 * C.jit(k, 4.0)) if k < n - 1 else (2.2, -1.4)
        tyre_bm(bm, (dx, dy, tz), R, w, ri, spin=40 * k, tilt=tilt)
        z += w + 0.002
    P.mesh('tyres', bm, 'rubber', sharp=40.0)
    # the steel wheel in the top tyre
    k = n - 1
    c = V((0.03 * C.jit(k, 1.0), 0.03 * C.jit(k, 2.0), w / 2 + (w + 0.002) * k))
    m = Matrix.Translation(c) @ Matrix.Rotation(math.radians(2.2), 4, 'X') @ Matrix.Rotation(math.radians(-1.4), 4, 'Y')
    prof = [(0.06, 0.04), (0.12, 0.035), (0.16, 0.01), (0.205, 0.0), (0.215, -0.07), (0.22, -0.08)]
    prof = K.shell_profile([(r, z) for (r, z) in prof][::-1], 0.006)
    bm = bmesh.new()
    rings = K.bm_lathe(bm, prof, segs=24, matrix=m, loop=True)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    for f in bm.faces:
        cc = m.inverted() @ f.calc_center_median()
        if math.sin(3 * math.atan2(cc.y, cc.x) + 1.0) > 0.4 and cc.xy.length > 0.17:
            f.material_index = 1
    P.mesh('wheel', bm, ['steel', 'rust'], sharp=45.0)
    bm = bmesh.new()
    for i in range(4):
        a = TAU * i / 4 + 0.4
        K.bm_cyl(bm, 0.022, 0.012, segs=8, matrix=m @ Matrix.Translation((0.1 * math.cos(a), 0.1 * math.sin(a), 0.034)))
    P.mesh('wheel_holes', bm, 'trim', sharp=50.0)
    P.views = [('a', 35, 26), ('b', 215, 30)]


def crate(P):
    """
    A wooden crate (0.9 x 0.7 x 0.7): slatted sides and ends on corner posts with gaps between the slats, two
    skids under the floor (its boards' top at 0.09: sites.ts shelfOf, M_inside), rope handles through the ends, a
    stencilled patch (paint) on one side; the lid of boards on two battens (LID, hinged on two straps along the
    back, a hasp at the front). One slat is split and shorter.
    """
    hw, hd, H = 0.435, 0.34, 0.7
    zl = 0.665                                      # under the lid
    t = 0.02
    for sy in (-1, 1):
        C.block(P, 'skid', (0.7, 0.07, 0.06), (0.0, sy * (hw - 0.09), 0.03), 'wood', bev=0.006)
    for i in range(5):
        x = -hd + 0.07 + i * (2 * hd - 0.14) / 4
        C.block(P, 'floor', (0.13, 2 * hw - 0.04, 0.03), (x, 0.0, 0.075), 'wood', bev=0.003)
    for sx in (-1, 1):
        for sy in (-1, 1):
            C.block(P, 'post', (0.045, 0.045, zl - 0.06), (sx * (hd - t - 0.0225), sy * (hw - t - 0.0225),
                                                           0.06 + (zl - 0.06) / 2), 'wood', bev=0.004)
    zs = [(0.06, 0.255), (0.27, 0.46), (0.475, zl)]
    for k, (z0, z1) in enumerate(zs):
        for sx in (-1, 1):
            ln = 2 * hw
            dy = 0.0
            if sx > 0 and k == 1:
                ln, dy = 2 * hw - 0.14, -0.07       # (split, a piece gone)
            C.block(P, 'slat', (t, ln, z1 - z0), (sx * (hd - t / 2), dy, (z0 + z1) / 2), 'wood', bev=0.004,
                    rot=(0.6 * C.jit(k, sx), 0, 0))
        for sy in (-1, 1):
            C.block(P, 'slat', (2 * hd - 2 * t, t, z1 - z0), (0.0, sy * (hw - t / 2), (z0 + z1) / 2), 'wood',
                    bev=0.004)
    # the stencil patch, the rope handles through the ends
    C.patch(P, 'stencil', 0.32, 0.13, (hd, 0.08, 0.365), (1, 0, 0), 'paint', t=0.0015)
    C.patch(P, 'stencil_band', 0.22, 0.03, (hd + 0.0015, 0.08, 0.365), (1, 0, 0), 'paint_b', t=0.001)
    for sy in (-1, 1):
        y = sy * hw
        P.tube('rope', [(-0.1, y - sy * 0.02, 0.56), (-0.1, y + sy * 0.01, 0.56), (-0.07, y + sy * 0.015, 0.45),
                        (0.07, y + sy * 0.015, 0.45), (0.1, y + sy * 0.01, 0.56), (0.1, y - sy * 0.02, 0.56)], 0.011,
               'fabric', segs=5, bend=0.03)
    # the lid
    objs = []
    for i in range(4):
        x = -hd + 0.0875 + i * 0.175
        objs.append(C.block(P, 'lid_board', (0.17, 2 * hw, 0.022), (x, 0.0, zl + 0.011 + 0.002 * C.jit(i, 5.0)),
                            'wood', bev=0.004))
    for sy in (-1, 1):
        objs.append(C.block(P, 'lid_batten', (2 * hd - 0.1, 0.06, 0.018), (0.0, sy * (hw - t - 0.06), zl - 0.009),
                            'wood', bev=0.003))
    for sy in (-1, 1):
        objs.append(C.block(P, 'strap', (0.16, 0.035, 0.004), (-hd + 0.07, sy * 0.25, zl + 0.024), 'steel', bev=0.001))
    objs.append(C.block(P, 'hasp', (0.004, 0.04, 0.09), (hd + 0.002, 0.0, zl - 0.02), 'steel', bev=0.001))
    P.mover('LID', objs, (-hd, 0.0, zl - 0.018))
    for sy in (-1, 1):
        P.cyl('knuckle', 0.007, 0.05, (-hd - 0.003, sy * 0.25, zl - 0.004), 'steel', axis='Y', segs=8, bev=None)
    C.block(P, 'staple', (0.012, 0.02, 0.025), (hd + 0.006, 0.0, zl - 0.075), 'steel', bev=0.002)
    C.marker(P, 'M_inside', (0.0, 0.0, 0.09))
    P.views = [('a', 35, 26), ('b', 215, 26)]


def barrel(P):
    """
    A blue plastic barrel, the open-top kind (0.62 x 0.62 x 0.9): the moulded body with its two rolling ribs and
    its thick rim, a label patch (paint_b), the wall thick enough to look into; the lid with its clamp ring and
    lever (LID, lifts off; M_top on it), M_inside on the floor inside.
    """
    R, H = 0.295, 0.9
    zr = H - 0.03                                   # the rim's top (the lid sits on it)
    prof = [(R - 0.03, 0.0), (R - 0.01, 0.006), (R - 0.004, 0.12), (R, 0.27), (R + 0.009, 0.285), (R + 0.009, 0.315),
            (R, 0.33), (R + 0.003, 0.45), (R, 0.57), (R + 0.009, 0.585), (R + 0.009, 0.615), (R, 0.63),
            (R - 0.008, zr - 0.05), (R + 0.006, zr - 0.03), (R + 0.006, zr)]
    wall = K.shell_profile(prof, 0.008)
    P.lathe('body', wall, material='paint', segs=24, loop=True, sharp=40.0)
    P.lathe('floor', [(0.0, 0.004), (R - 0.03, 0.004), (R - 0.03, 0.02), (0.0, 0.02)], material='paint',
            segs=24, sharp=40.0)
    # the label (a band of the body's own shape, a little proud)
    lab = [(r + 0.0015, z) for (r, z) in prof if 0.36 < z < 0.54]
    P.lathe('label', [(lab[0][0] - 0.002, 0.36)] + lab + [(lab[-1][0] - 0.002, 0.54)], material='paint_b',
            segs=12, angle=math.radians(70), start=math.radians(-35), sharp=50.0)
    C.marker(P, 'M_inside', (0.0, 0.0, 0.02))
    # the lid with its clamp ring and lever
    objs = [P.lathe('lid', [(0.0, 0.03), (R - 0.05, 0.028), (R - 0.03, 0.02), (R - 0.02, 0.026), (R + 0.004, 0.022),
                            (R + 0.004, 0.0), (R - 0.01, 0.0), (R - 0.01, 0.01), (0.0, 0.012)][::-1],
                    loc=(0, 0, zr), material='paint', segs=28, sharp=40.0)]
    objs.append(P.lathe('clamp', [(R + 0.004, -0.012), (R + 0.014, -0.012), (R + 0.016, 0.002), (R + 0.014, 0.03),
                                  (R + 0.004, 0.03)], loc=(0, 0, zr), material='steel', segs=28, loop=True,
                        sharp=50.0))
    objs.append(C.block(P, 'lever', (0.016, 0.11, 0.032), (R + 0.018, 0.0, zr + 0.008), 'steel', bev=0.005))
    objs.append(C.block(P, 'lever_lug', (0.016, 0.03, 0.024), (R + 0.014, 0.06, zr + 0.008), 'steel', bev=0.004))
    P.mover('LID', objs, (0.0, 0.0, zr))
    C.marker(P, 'M_top', (0.0, 0.0, H))
    P.views = [('a', 35, 22), ('b', 215, 30)]


# ------------------------------------------------------------------------------------------------ the house's yard

def picnic_table(P):
    """
    A picnic table with its benches (1.8 x 1.6, the top at 0.75): five top boards, a bench board each side, the
    A-frame legs at both ends bolted to the seat supports and the top cleats, two diagonal braces; one top board
    has shrunk and sits a little askew. All bare wood. M_top on it.
    """
    hy = 0.9
    zt = 0.75
    for i in range(5):
        x = -0.3 + 0.15 * i
        ln = 2 * hy - (0.05 if i == 3 else 0.0)
        C.block(P, 'top', (0.138, ln, 0.04), (x, 0.012 if i == 3 else 0.0, zt - 0.02), 'wood', bev=0.006,
                rot=(0, 0, 0.8 if i == 3 else 0.0), step=0.45, axes=(1,))
    for sx in (-1, 1):
        for k in range(2):
            x = sx * (0.6 + 0.135 * k) - sx * 0.0
            C.block(P, 'seat', (0.125, 2 * hy, 0.035), (x if k == 0 else sx * 0.735, 0.0, 0.435), 'wood', bev=0.006,
                    step=0.45, axes=(1,))
    ya = hy - 0.28
    for sy in (-1, 1):
        y = sy * ya
        C.block(P, 'cleat', (0.74, 0.045, 0.07), (0.0, y, zt - 0.075), 'wood', bev=0.005)
        C.block(P, 'support', (1.56, 0.045, 0.08), (0.0, y + sy * 0.045, 0.378), 'wood', bev=0.005)
        for sx in (-1, 1):
            C.plank(P, 'leg', (sx * 0.17, y - sy * 0.045, zt - 0.04), (sx * 0.6, y - sy * 0.045, 0.0), 0.09, 0.04,
                    'wood', up=(0, 1, 0), bev=0.005)
        P.bolts([(sx * xx, y + sy * 0.07, z) for sx in (-1, 1) for (xx, z) in ((0.43, 0.378), (0.22, zt - 0.075))],
                normal=[(0, sy, 0)] * 4, r=0.011, h=0.006, washer=False, x_hint=(0, 0, 1))
    for sy in (-1, 1):
        C.plank(P, 'brace', (0.0, sy * (ya + 0.0), 0.36), (0.0, sy * 0.12, zt - 0.045), 0.07, 0.035, 'wood',
                up=(1, 0, 0), bev=0.004)
    C.block(P, 'brace_cleat', (0.6, 0.06, 0.04), (0.0, 0.0, zt - 0.06), 'wood', bev=0.004)
    C.marker(P, 'M_top', (0.0, 0.0, zt))
    P.views = [('a', 35, 26), ('b', 120, 20)]


def bench(P, back=True):
    """
    A bench (1.6, the seat at 0.45): cast-iron ends (paint) with their arms, three seat slats and, on the bench
    with a back, two back slats leaning back on the ends' back posts (it faces +X); bench_plain is a backless
    one of two thick boards on wooden trestle legs.
    """
    hy = 0.8
    zs = 0.45
    if not back:
        for k in range(2):
            C.block(P, 'board', (0.2, 2 * hy, 0.05), (-0.105 + 0.21 * k, 0.0, zs - 0.025), 'wood', bev=0.008, segs=2,
                    step=0.45, axes=(1,))
        for sy in (-1, 1):
            y = sy * (hy - 0.22)
            for sx in (-1, 1):
                C.plank(P, 'leg', (sx * 0.12, y, zs - 0.05), (sx * 0.19, y, 0.0), 0.07, 0.045, 'wood', up=(0, 1, 0),
                        bev=0.006)
            C.block(P, 'rail', (0.36, 0.05, 0.05), (0.0, y, 0.15), 'wood', bev=0.005)
            C.block(P, 'cleat', (0.38, 0.06, 0.04), (0.0, y, zs - 0.07), 'wood', bev=0.005)
        P.views = [('a', 35, 24), ('b', 215, 24)]
        return
    for sy in (-1, 1):
        y = sy * (hy - 0.14)
        # the cast end: front leg, rear leg, the seat rail, the back post, the arm
        C.plank(P, 'front_leg', (0.2, y, zs - 0.02), (0.22, y, 0.0), 0.05, 0.035, 'paint', up=(0, 1, 0), bev=0.008)
        C.plank(P, 'rear_leg', (-0.15, y, zs - 0.02), (-0.2, y, 0.0), 0.05, 0.035, 'paint', up=(0, 1, 0), bev=0.008)
        C.plank(P, 'seat_rail', (0.23, y, zs - 0.045), (-0.19, y, zs - 0.06), 0.05, 0.035, 'paint', up=(0, 1, 0),
                bev=0.008)
        C.plank(P, 'back_post', (-0.17, y, zs - 0.06), (-0.27, y, 0.84), 0.05, 0.035, 'paint', up=(0, 1, 0), bev=0.008)
        C.plank(P, 'arm', (-0.2, y, 0.64), (0.22, y, 0.66), 0.045, 0.04, 'paint', up=(0, 1, 0), bev=0.008)
        C.plank(P, 'arm_post', (0.21, y, zs - 0.02), (0.215, y, 0.66), 0.035, 0.03, 'paint', up=(0, 1, 0), bev=0.006)
        P.sphere('foot', 0.03, (0.22, y, 0.02), 'paint', u=8, v=5, scale=(1.3, 1.0, 0.7))
        P.sphere('foot', 0.03, (-0.2, y, 0.02), 'paint', u=8, v=5, scale=(1.3, 1.0, 0.7))
    for k in range(3):
        x = -0.13 + 0.125 * k
        C.block(P, 'slat', (0.11, 2 * hy, 0.032), (x, 0.0, zs - 0.016 - 0.004 * k), 'wood', bev=0.006, segs=2,
                step=0.45, axes=(1,))
    for z in (0.6, 0.75):
        x = -0.17 - 0.1 * (z - (zs - 0.06)) / (0.84 - zs + 0.06) - 0.025
        C.block(P, 'back_slat', (0.03, 2 * hy, 0.1), (x, 0.0, z), 'wood', rot=(0, -14, 0), bev=0.006, segs=2,
                step=0.45, axes=(1,))
    P.views = [('a', 35, 18), ('b', 215, 20)]


def log_piece(bm, x0, x1, y, z, r, kind, spin):
    """
    A split log lying along X from x0 to x1 into bm: kind 0 a whole round, 1 a half, 2 a quarter; spin turns its
    section. Faces: material 0 (wood) on the ends and the split faces, 1 (bark) round the outside.
    """
    if kind == 0:
        sec = [(r * math.cos(TAU * i / 6 + spin), r * math.sin(TAU * i / 6 + spin)) for i in range(6)]
        bark = set(range(6))
    elif kind == 1:
        sec = [(r * math.cos(math.pi * i / 4 + spin), r * math.sin(math.pi * i / 4 + spin)) for i in range(5)]
        bark = {0, 1, 2, 3}
    else:
        sec = [(0.0, 0.0)] + [(r * 1.1 * math.cos(math.pi / 2 * i / 2 + spin), r * 1.1 * math.sin(math.pi / 2 * i / 2 +
                                                                                                spin)) for i in range(3)]
        bark = {1, 2}
    cy = sum(p[0] for p in sec) / len(sec)
    cz = sum(p[1] for p in sec) / len(sec)
    sec = [(py - cy, pz - cz) for (py, pz) in sec]
    a = [bm.verts.new((x0, y + py, z + pz)) for (py, pz) in sec]
    b = [bm.verts.new((x1, y + py, z + pz)) for (py, pz) in sec]
    n = len(sec)
    fa = bm.faces.new(a[::-1])
    fb = bm.faces.new(b)
    for f in (fa, fb):
        f.material_index = 0
    for i in range(n):
        j = (i + 1) % n
        f = bm.faces.new((a[i], a[j], b[j], b[i]))
        f.material_index = 1 if i in bark else 0


def woodpile(P, W=2.4, H=1.1):
    """
    A woodpile against a wall (2.4 x 0.7 x 1.1; woodpile_s 2.2 x 1.0): split logs (rounds, halves and quarters, the
    bark dark) stacked in rows on two bearers between four corner posts, the top row unfinished, a few thrown on
    top; a lean-to roof of corrugated sheet on two rafters, a little rust on it.
    """
    hw, hd = W / 2, 0.35
    zr_f, zr_b = H - 0.035, H - 0.135               # the rafters' tops at the front and the back
    for sx in (-1, 1):
        for sy in (-1, 1):
            zt = (zr_f if sx > 0 else zr_b) - 0.06
            C.block(P, 'post', (0.08, 0.08, zt), (sx * (hd - 0.06), sy * (hw - 0.04), zt / 2), 'wood', bev=0.006,
                    step=0.4, axes=(2,))
    for sy in (-1, 1):
        C.plank(P, 'rafter', (hd - 0.008, sy * (hw - 0.04), zr_f - 0.03), (-hd + 0.008, sy * (hw - 0.04), zr_b - 0.03),
                0.06, 0.06, 'wood', up=(0, 0, 1), bev=0.005)
    for sx in (-1, 1):
        C.block(P, 'bearer', (0.07, W - 0.2, 0.06), (sx * 0.2, 0.0, 0.03), 'wood', bev=0.005, step=0.6, axes=(1,))
    # the corrugated sheet: a wave across Y, sloping down to the back
    ny = int(W / 0.04)
    rings = []
    for xx in (hd - 0.002, -hd + 0.002):
        z0 = zr_f if xx > 0 else zr_b
        rings.append([(xx, -hw + W * j / ny, z0 + 0.012 * math.sin(TAU * j / 4)) for j in range(ny + 1)])
    bm = bmesh.new()
    vr, faces = K.bm_loft(bm, rings, closed=False)
    bmesh.ops.solidify(bm, geom=faces, thickness=0.004)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    C.outward(bm)
    for f in bm.faces:
        c = f.calc_center_median()
        if math.sin(3.1 * c.y + 1.3) + 0.8 * math.sin(7.0 * c.y) + 2.5 * (c.x + 0.1) > 1.6:
            f.material_index = 1
    P.mesh('roof', bm, ['steel', 'rust'], sharp=60.0)
    # the logs
    bm = bmesh.new()
    zc = 0.06
    rows = int((zr_b - 0.1 - zc) / 0.11)
    k = 0
    for row in range(rows):
        y = -hw + 0.1 + (0.06 if row % 2 else 0.0)
        top = row == rows - 1
        zz = zc + 0.055 + row * 0.105
        while y < hw - 0.1:
            r = 0.055 + 0.012 * (C.jit(k, 1.0) + 0.5)
            kind = int((C.jit(k, 2.0) + 0.5) * 3) % 3
            if not (top and C.jit(k, 3.0) > 0.0):
                ln = 0.62 + 0.06 * C.jit(k, 4.0)
                dx = 0.03 * C.jit(k, 5.0)
                log_piece(bm, -ln / 2 + dx, ln / 2 + dx, y, zz, r, kind, TAU * (C.jit(k, 6.0) + 0.5))
            y += 2 * r * 0.95
            k += 1
    # a few thrown on top, askew
    for j in range(3):
        y = -0.5 + 0.45 * j
        zz = zc + 0.055 + rows * 0.105 - 0.02
        log_piece(bm, -0.3, 0.3, y, zz, 0.06, j % 3, 0.7 * j)
    for f in bm.faces:
        pass
    P.mesh('logs', bm, ['wood', 'leather'], sharp=40.0)
    P.views = [('a', 30, 16), ('b', 210, 22)]


def cloth(P, name, outline, y0, z0, material, lean=0.0, wave=0.02, seed=0.0, step=0.12):
    """A piece of washing hanging flat in the plane X = 0 from a line at (y0, z0): outline = [(y, z), ...] round
    its top middle (z down negative), counter-clockwise seen from +X; a slight wave through it."""
    poly = [(y0 + y, z0 + z) for (y, z) in outline]
    poly = C.ccw(poly)
    bm = bmesh.new()
    K.bm_prism(bm, [(-z, y) for (y, z) in poly], 0.006, matrix=mat4((0, 0, 0), (0, 90, 0)))
    # (subdivide its faces so the wave can bend it)
    bmesh.ops.subdivide_edges(bm, edges=[e for e in bm.edges if e.calc_length() > step], cuts=1)
    for v in bm.verts:
        v.co.x += wave * math.sin(9.0 * v.co.y + 5.0 * v.co.z + seed) + lean * (z0 - v.co.z)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    return P.mesh(name, bm, material, sharp=60.0)


SHIRT_L = [(-0.17, -0.62), (0.17, -0.62), (0.18, -0.24), (0.3, -0.3), (0.34, -0.2), (0.22, -0.02), (0.06, 0.0),
           (-0.06, 0.0), (-0.22, -0.02), (-0.34, -0.2), (-0.3, -0.3), (-0.18, -0.24)]
TOWEL = [(-0.26, -0.72), (0.26, -0.72), (0.26, 0.0), (-0.26, 0.0)]
TROUSERS = [(-0.2, -0.95), (-0.04, -0.95), (0.0, -0.3), (0.04, -0.95), (0.2, -0.95), (0.19, 0.0), (-0.19, 0.0)]
SOCK = [(-0.04, -0.3), (0.06, -0.33), (0.08, -0.26), (0.04, -0.24), (0.04, 0.0), (-0.04, 0.0)]


def washing_line(P):
    """
    A washing line (5.2 x 0.1 x 1.9) between two leaning posts with a cleat each, the line sagging between them,
    a shirt, a towel, trousers and a pair of socks pegged on (fabric, paint, paint_b), gaps where others were taken
    in, the pegs.
    """
    hy = 2.6
    yp = hy - 0.04
    zl = 1.86
    for sy in (-1, 1):
        C.plank(P, 'post', (0.0, sy * yp, 0.0), (0.0, sy * (yp - 0.02), 1.9), 0.075, 0.075, 'wood', up=(1, 0, 0),
                bev=0.006, step=0.6)
        C.block(P, 'cleat', (0.03, 0.035, 0.12), (0.045, sy * (yp - 0.02), 1.7), 'wood', bev=0.004)
    sag = 0.13

    def line_z(y):
        return zl - sag * (1 - (y / (yp - 0.02)) ** 2)

    pts = [V((0.0, y, line_z(y))) for y in [-(yp - 0.02) + 2 * (yp - 0.02) * i / 24 for i in range(25)]]
    P.tube('line', pts, 0.0055, 'fabric', segs=5, bend=0.0)
    items = [(-1.7, SHIRT_L, 'paint', 0.03), (-0.85, TOWEL, 'fabric', -0.02), (0.25, TROUSERS, 'paint_b', 0.02),
             (1.15, SOCK, 'fabric', 0.0), (1.32, SOCK, 'fabric', 0.03)]
    bm = bmesh.new()
    for k, (y, out, mat, lean) in enumerate(items):
        z = line_z(y) - 0.006
        cloth(P, 'washing', out, y, z, mat, lean=lean, seed=k * 1.7)
        xs = [p[0] for p in out]
        for py in (min(xs) + 0.03, max(xs) - 0.03) if max(xs) - min(xs) > 0.15 else ((min(xs) + max(xs)) / 2,):
            K.bm_cube(bm, (0.014, 0.012, 0.07), mat4((0.0, y + py, line_z(y + py) - 0.012)))
    P.mesh('pegs', bm, 'wood', bev=0.002, segs=1)
    P.views = [('a', 30, 10), ('b', 210, 14)]


def veg_patch(P):
    """
    A vegetable patch (4.2 x 2.4; its board edge 0.25 high, what grows in it higher): the edge of boards on edge
    with stakes at the corners, the soil inside in three ridged rows, cabbages (paint: the leaves' green) in one,
    a row of leeks, pumpkins (paint_b) lying among their leaves in the third, a few gaps.
    """
    hy, hx, he = 2.1, 1.2, 0.25
    t = 0.03
    for sx in (-1, 1):
        C.block(P, 'edge', (t, 2 * hy, 0.2), (sx * (hx - t / 2), 0.0, 0.1), 'wood', bev=0.005, step=0.6, axes=(1,))
        C.block(P, 'edge', (2 * hx - 2 * t, t, 0.2), (0.0, sx * (hy - t / 2), 0.1), 'wood', bev=0.005, step=0.6,
                axes=(0,))
        for sy in (-1, 1):
            C.block(P, 'stake', (0.05, 0.05, he), (sx * (hx - t - 0.025), sy * (hy - t - 0.025), he / 2), 'wood',
                    bev=0.005)
    # the soil: three ridges along Y
    def soil(u, v):
        x = -hx + t + (2 * hx - 2 * t) * u
        y = -hy + t + (2 * hy - 2 * t) * v
        ridge = math.cos(3 * math.pi * (u - 1 / 6)) ** 2
        return (x, y, 0.13 + 0.05 * ridge + 0.006 * math.sin(11 * v + 3 * u))
    P.mesh('soil', junk.grid_sheet(15, 7, soil, 0.04), 'leather', sharp=60.0)
    rx = [-hx + t + (2 * hx - 2 * t) * (k + 0.5) / 3 for k in range(3)]
    # cabbages: a squashed ball and a ring of leaves
    bm = bmesh.new()
    leaves = bmesh.new()
    for i in range(6):
        y = -1.6 + 0.62 * i
        if i == 3:
            continue
        c = V((rx[0] + 0.03 * C.jit(i, 1.0), y, 0.18))
        K.bm_sphere(bm, 0.11, 10, 6, matrix=Matrix.Translation(c + V((0, 0, 0.07))) @ Matrix.Diagonal((1, 1, 0.8, 1)))
        for j in range(5):
            a = TAU * j / 5 + i
            K.bm_cube(leaves, (0.17, 0.11, 0.012), Matrix.Translation(c + V((0.1 * math.cos(a), 0.1 * math.sin(a),
                                                                             0.05))) @
                      Matrix.Rotation(a, 4, 'Z') @ Matrix.Rotation(math.radians(-24), 4, 'Y'))
    P.mesh('cabbages', bm, 'paint', sharp=70.0)
    # leeks: a row of thin fans of blades
    for i in range(9):
        y = -1.75 + 0.44 * i
        c = V((rx[1], y, 0.17))
        for j in range(3):
            a = math.radians(60 * j + 25 * C.jit(i, 2.0))
            d = V((0.06 * math.cos(a), 0.06 * math.sin(a), 0.28)).normalized()
            K.bm_cube(leaves, (0.022, 0.006, 0.26), Matrix.Translation(c + d * 0.13) @ K.frame_from_z(d, (1, 0, 0)))
    P.mesh('leaves', leaves, 'paint', sharp=60.0)
    # pumpkins among big leaves
    bm = bmesh.new()
    lv = bmesh.new()
    for i, y in enumerate((-1.3, -0.2, 1.1)):
        c = V((rx[2] + 0.05 * C.jit(i, 3.0), y, 0.17))
        prof = [(0.0, 0.0), (0.1, 0.01), (0.15, 0.06), (0.155, 0.1), (0.12, 0.15), (0.03, 0.17), (0.0, 0.16)]
        rings = K.bm_lathe(bm, prof, segs=12, matrix=Matrix.Translation(c))
        for ring in rings:
            for jv, v in enumerate(ring):
                if jv % 2:
                    q = v.co - c
                    v.co = c + V((q.x * 0.92, q.y * 0.92, q.z))
        for j in range(4):
            a = TAU * j / 4 + 0.5 * i
            K.bm_cube(lv, (0.26, 0.2, 0.012), Matrix.Translation(c + V((0.22 * math.cos(a), 0.22 * math.sin(a), 0.04)))
                      @ Matrix.Rotation(a, 4, 'Z') @ Matrix.Rotation(math.radians(-10), 4, 'Y'))
        K.bm_cyl(lv, 0.012, 0.05, segs=6, matrix=Matrix.Translation(c + V((0, 0, 0.18))))
    P.mesh('pumpkins', bm, 'paint_b', sharp=60.0)
    P.mesh('pumpkin_leaves', lv, 'paint', sharp=60.0)
    P.views = [('a', 30, 30), ('b', 210, 36)]


def mailbox(P):
    """
    A roadside mailbox (0.3 x 0.45 x 1.15): a wooden post leaning a little, the board on it, the round-topped steel
    box on the board (paint) with its door at the front (+X) and the latch, the flag (paint_b) down along its side.
    """
    lean = 3.0
    since = C.mark(P)
    C.block(P, 'post', (0.09, 0.09, 0.93), (-0.06, 0.0, 0.465), 'wood', bev=0.008, step=0.4, axes=(2,))
    C.block(P, 'brace', (0.2, 0.05, 0.05), (-0.02, 0.0, 0.86), 'wood', rot=(0, -40, 0), bev=0.005)
    C.block(P, 'board', (0.43, 0.3, 0.03), (0.0, 0.0, 0.945), 'wood', bev=0.006, segs=2)
    w, hb = 0.2, 0.19
    z0 = 0.96
    arch = [(w / 2 * math.cos(a), hb - w / 2 + w / 2 * math.sin(a)) for a in
            [math.pi * k / 8 for k in range(9)]]
    outline = [(-w / 2, 0.0), (w / 2, 0.0)] + arch
    poly = C.ccw([(y, z0 + z) for (y, z) in outline])
    bm = bmesh.new()
    K.bm_prism(bm, [(-z, y) for (y, z) in poly], 0.4, matrix=mat4((0.0, 0, 0), (0, 90, 0)))
    C.cuts(bm, (0.4, 0.2, 0.2), 0.12, axes=(0,))
    P.mesh('box', bm, 'paint', bev=0.006, segs=1)
    bm = bmesh.new()
    K.bm_prism(bm, [(-z, y * 1.06) for (y, z) in [(y, z0 - 0.004 + (z - z0) * 1.04) for (y, z) in poly]], 0.012,
               matrix=mat4((0.2, 0, 0), (0, 90, 0)))
    P.mesh('door', bm, 'paint', bev=0.004, segs=1)
    C.block(P, 'latch', (0.02, 0.03, 0.04), (0.214, 0.0, z0 + hb - 0.03), 'steel', bev=0.004)
    C.block(P, 'flag_pivot', (0.03, 0.02, 0.03), (-0.14, w / 2 + 0.01, z0 + 0.1), 'steel', bev=0.003)
    C.block(P, 'flag_arm', (0.24, 0.008, 0.025), (-0.03, w / 2 + 0.02, z0 + 0.1), 'paint_b', bev=0.002)
    C.block(P, 'flag', (0.06, 0.008, 0.08), (0.06, w / 2 + 0.02, z0 + 0.12), 'paint_b', bev=0.003)
    C.xform(P, since, Matrix.Translation((-0.058, 0, 0)) @ Matrix.Rotation(math.radians(lean), 4, 'Y'))
    P.views = [('a', 35, 14), ('b', 215, 16)]


def trough(P):
    """
    A wooden feeding trough on crossed legs (1.6 x 0.5 x 0.55; at a hide, the salt lick): a V of two boards
    between shaped end boards, two X frames under it, a pale salt block (ceramic) lying in it.
    """
    hy, zt = 0.8, 0.55
    for sx in (-1, 1):
        C.plank(P, 'side', (sx * 0.1, -hy + 0.03, zt - 0.115), (sx * 0.1, hy - 0.03, zt - 0.115), 0.24, 0.03, 'wood',
                up=(-sx * math.sin(math.radians(40)), 0, math.cos(math.radians(40))), bev=0.005, step=0.45)
    for sy in (-1, 1):
        q = bmesh.new()
        K.bm_prism(q, [(-0.21, zt), (-0.21, zt - 0.05), (-0.045, zt - 0.22), (0.045, zt - 0.22), (0.21, zt - 0.05),
                       (0.21, zt)], 0.03, matrix=mat4((0, sy * (hy - 0.015), 0), (90, 0, 0)))
        P.mesh('end', q, 'wood', bev=0.005, segs=1)
    for sy in (-1, 1):
        y = sy * (hy - 0.22)
        for sx in (-1, 1):
            C.plank(P, 'leg', (sx * 0.235, y, 0.0), (-sx * 0.16, y, zt - 0.17), 0.06, 0.04, 'wood', up=(0, 1, 0),
                    bev=0.005)
        C.block(P, 'leg_rail', (0.36, 0.04, 0.05), (0.0, y + sy * 0.04, zt - 0.2), 'wood', bev=0.004)
    C.block(P, 'salt', (0.1, 0.16, 0.075), (0.0, 0.35, zt - 0.155), 'ceramic', rot=(0, 0, 4), bev=0.02, segs=2)
    P.views = [('a', 35, 22), ('b', 215, 26)]


def fence(P, broken=False, post_only=False):
    """
    A post-and-rail fence module (2.0 x 0.1 x 1.0): the post at y = -1 (its centre) with a pointed top, three split
    rails mortised through it running to y = +1, where the next module's post (or a fence_post) stands: repeat
    it every 2 m. fence_b has its middle rail broken and fallen; fence_post is the post alone (ends a run).
    """
    yp = -1.0 if not post_only else 0.0
    bm = bmesh.new()
    K.bm_cube(bm, (0.1, 0.1, 0.92), mat4((0.0, yp, 0.46)))
    C.cuts(bm, (0.1, 0.1, 0.92), 0.3, axes=(2,))
    P.mesh('post', bm, 'wood', bev=0.008, segs=1)
    P.prism('post_top', [(-0.05, 0.0), (0.05, 0.0), (0.05, 0.03), (0.0, 0.08), (-0.05, 0.03)], 0.1,
            matrix=mat4((0, yp, 0.92), (90, 0, 0)), material='wood', bev=0.006, segs=1)
    if post_only:
        P.views = [('a', 35, 14), ('b', 215, 14)]
        return
    for k, z in enumerate((0.26, 0.56, 0.84)):
        if broken and k == 1:
            # snapped half way: one end still in the post, the other down in the grass
            C.plank(P, 'rail', (0.0, yp + 0.02, z), (0.0, 0.0, z - 0.05), 0.07, 0.055, 'wood', up=(0, 0, 1), bev=0.006,
                    step=0.5, twist=4)
            C.plank(P, 'rail', (0.0, 0.05, z - 0.08), (0.0, 0.98, 0.035), 0.07, 0.055, 'wood', up=(0, 0, 1),
                    bev=0.006, step=0.5)
            continue
        C.plank(P, 'rail', (0.0, yp + 0.0, z + 0.01 * k), (0.0, 1.0, z), 0.075, 0.055, 'wood', up=(0, 0, 1), bev=0.006,
                step=0.5, twist=8 * (k - 1))
    P.views = [('a', 30, 12), ('b', 210, 14)]


# ------------------------------------------------------------------------------------------------ the camp, the lay-by

def corrugated(P, name, x0, x1, z0, z1, y0, y1, pitch=0.12, amp=0.014, rust=0.0, seed=0.0):
    """A corrugated sheet from (x0, z0) to (x1, z1) (its slope along X), across Y from y0 to y1 (the waves run
    along X), 4 mm thick; rust > 0 lets patches of it go to rust."""
    ny = max(4, int((y1 - y0) / (pitch / 4)))
    rings = [[(xx, y0 + (y1 - y0) * j / ny, zz + amp * math.sin(TAU * j * (y1 - y0) / ny / pitch))
              for j in range(ny + 1)] for (xx, zz) in ((x0, z0), (x1, z1))]
    bm = bmesh.new()
    vr, faces = K.bm_loft(bm, rings, closed=False)
    bmesh.ops.solidify(bm, geom=faces, thickness=0.004)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    C.outward(bm)
    if rust:
        for f in bm.faces:
            c = f.calc_center_median()
            if math.sin(2.7 * c.y + seed) + 0.8 * math.sin(6.1 * c.y + 2 * seed) + rust * 3.0 * (c.x - x1) / (x0 - x1) \
                    > 1.5:
                f.material_index = 1
        return P.mesh(name, bm, ['steel', 'rust'], sharp=60.0)
    return P.mesh(name, bm, 'steel', sharp=60.0)


def shelter(P):
    """
    A lay-by shelter (5.2 x 3.2 x 2.6), open at the front (+X): a back wall and two side walls of boards on their
    frames (paint: the stain), two front posts, a roof of corrugated sheets on purlins falling to the back, a
    bench along the back wall, a notice board with a few papers pinned on, a litter bin by a post.
    """
    hw, hd = 2.6, 1.6
    zf, zb = 2.6, 2.32                               # the roof's front and back
    def roof_z(x):
        return zb + (zf - zb) * (x + hd) / (2 * hd)
    # the frame: front posts, back corner posts, the plate along the top of the walls
    for sy in (-1, 1):
        C.block(P, 'front_post', (0.14, 0.14, zf - 0.1), (hd - 0.1, sy * (hw - 0.1), (zf - 0.1) / 2), 'wood', bev=0.01,
                step=0.6, axes=(2,))
        C.block(P, 'back_post', (0.12, 0.12, zb - 0.1), (-hd + 0.08, sy * (hw - 0.08), (zb - 0.1) / 2), 'wood',
                bev=0.008, step=0.6, axes=(2,))
        C.plank(P, 'side_plate', (hd - 0.04, sy * (hw - 0.1), zf - 0.16), (-hd + 0.02, sy * (hw - 0.1), zb - 0.16),
                0.1, 0.12, 'wood', up=(0, 0, 1), bev=0.006, step=0.8)
    C.block(P, 'back_plate', (0.1, 2 * hw - 0.1, 0.12), (-hd + 0.08, 0.0, zb - 0.16), 'wood', bev=0.006, step=1.0,
            axes=(1,))
    C.block(P, 'front_beam', (0.12, 2 * hw - 0.06, 0.16), (hd - 0.1, 0.0, zf - 0.18), 'wood', bev=0.008, step=1.0,
            axes=(1,))
    # the walls: boards (paint) on rails
    tb = 0.025
    C.block(P, 'back_wall', (tb, 2 * hw - 0.2, zb - 0.22), (-hd + 0.03, 0.0, (zb - 0.22) / 2 + 0.02), 'paint',
            bev=None, step=0.6, axes=(1, 2))
    bm = bmesh.new()
    nb = int((2 * hw - 0.2) / 0.26)
    for i in range(nb + 1):
        y = -hw + 0.1 + i * (2 * hw - 0.2) / nb
        K.bm_cube(bm, (0.012, 0.03, zb - 0.24), mat4((-hd + 0.02 - tb / 2 - 0.006, y, (zb - 0.24) / 2 + 0.02)))
    P.mesh('back_battens', bm, 'paint', bev=None)
    xs1 = 0.75                                      # the side walls stop here
    for sy in (-1, 1):
        y = sy * (hw - 0.08)
        top0, top1 = roof_z(-hd + 0.06) - 0.2, roof_z(xs1) - 0.2
        poly = [(-hd + 0.06, 0.02), (xs1, 0.02), (xs1, top1), (-hd + 0.06, top0)]
        P.prism('side_wall', poly, tb, matrix=mat4((0, y, 0), (90, 0, 0)), material='paint', bev=None)
        bm = bmesh.new()
        n = int((xs1 + hd) / 0.26)
        for i in range(n + 1):
            x = -hd + 0.08 + i * (xs1 + hd - 0.04) / n
            ht = roof_z(x) - 0.22
            K.bm_cube(bm, (0.03, 0.012, ht - 0.02), mat4((x, y + sy * (tb / 2 + 0.006), 0.02 + (ht - 0.02) / 2)))
        P.mesh('side_battens', bm, 'paint', bev=None)
        C.block(P, 'side_post', (0.1, 0.1, roof_z(xs1) - 0.16), (xs1 + 0.02, y, (roof_z(xs1) - 0.16) / 2), 'wood',
                bev=0.006, step=0.6, axes=(2,))
    for z in (0.3, 1.2):
        C.block(P, 'rail', (0.05, 2 * hw - 0.2, 0.08), (-hd + 0.065, 0.0, z), 'wood', bev=0.004)
    # the roof: rafters, purlins, the sheets
    for y in (-hw + 0.1, 0.0, hw - 0.1):
        C.plank(P, 'rafter', (hd + 0.0, y, zf - 0.06), (-hd, y, zb - 0.06), 0.06, 0.1, 'wood', up=(0, 0, 1),
                bev=0.005, step=0.8)
    for x in (-1.2, -0.2, 0.8, 1.45):
        C.block(P, 'purlin', (0.07, 2 * hw, 0.05), (x, 0.0, roof_z(x) - 0.025), 'wood', bev=0.004, step=1.0,
                axes=(1,))
    for k in range(3):
        y0 = -hw + k * (2 * hw / 3) - (0.03 if k else 0.0)
        y1 = -hw + (k + 1) * (2 * hw / 3) + (0.03 if k < 2 else 0.0)
        corrugated(P, 'roof', hd, -hd, zf - 0.012 + 0.004 * k, zb - 0.012 + 0.004 * k, y0, y1, rust=0.5 + 0.2 * k,
                   seed=1.3 * k)
    # the bench along the back wall
    zs = 0.45
    for k in range(2):
        C.block(P, 'bench', (0.16, 4.0, 0.035), (-hd + 0.13 + 0.17 * k, 0.0, zs - 0.0175), 'wood', bev=0.005,
                step=0.8, axes=(1,))
    for y in (-1.8, 0.0, 1.8):
        C.block(P, 'bench_leg', (0.06, 0.06, zs - 0.035), (-hd + 0.33, y, (zs - 0.035) / 2), 'wood', bev=0.005)
        C.block(P, 'bench_bracket', (0.3, 0.05, 0.06), (-hd + 0.18, y, zs - 0.065), 'wood', bev=0.004)
    # the notice board, papers pinned on it
    nb_y = 1.4
    C.block(P, 'notice', (0.02, 0.9, 0.6), (-hd + 0.045, nb_y, 1.45), 'wood', bev=0.004)
    C.block(P, 'notice_face', (0.006, 0.8, 0.5), (-hd + 0.057, nb_y, 1.45), 'paint_b', bev=None)
    bm = bmesh.new()
    for (dy, dz, w, h, a) in ((-0.22, 0.08, 0.18, 0.25, 4), (0.05, 0.1, 0.21, 0.28, -3), (0.25, -0.05, 0.16, 0.2, 7),
                              (-0.05, -0.15, 0.16, 0.12, -6)):
        K.bm_cube(bm, (0.002, w, h), mat4((-hd + 0.061, nb_y + dy, 1.45 + dz), (a, 0, 0)))
    P.mesh('papers', bm, 'ceramic', bev=None)
    # the litter bin on its post by the -Y front post
    bx, by = hd - 0.32, -hw + 0.32
    C.block(P, 'bin_post', (0.06, 0.06, 0.95), (bx - 0.2, by, 0.475), 'steel', bev=0.004)
    P.lathe('bin', K.shell_profile([(0.15, 0.55), (0.16, 0.95)], 0.006), material='paint_b', segs=14, loop=True,
            loc=(bx, by, 0), sharp=40.0)
    P.cyl('bin_bottom', 0.15, 0.01, (bx, by, 0.555), 'paint_b', segs=14, bev=None)
    C.block(P, 'bin_band', (0.04, 0.12, 0.05), (bx - 0.17, by, 0.88), 'steel', bev=0.003)
    P.ao_distance = 0.3
    P.views = [('a', 30, 16), ('b', 210, 22)]


def stone_bm(bm, c, size, seed):
    """A field stone into bm: a squashed, lumpy ball sitting on the ground at c (its bottom flattened)."""
    c = V(c)
    m = Matrix.Translation(c + V((0, 0, size[2] * 0.6))) @ Matrix.Rotation(seed, 4, 'Z') @ \
        Matrix.Diagonal((size[0], size[1], size[2], 1.0))
    res = bmesh.ops.create_uvsphere(bm, u_segments=8, v_segments=5, radius=1.0)
    for v in res['verts']:
        k = 1.0 + 0.18 * math.sin(3.1 * v.co.x + seed) * math.cos(2.3 * v.co.y + 2 * seed) + 0.1 * math.sin(5 * v.co.z)
        v.co = m @ (v.co * k)
        if v.co.z < c.z:
            v.co.z = c.z


def firering(P):
    """
    A cold fire ring (1.4 across): ten field stones (paint: the stones' grey) round a bed of ash (plastic_int)
    with charred ends of wood (trim) in it, a grate of steel bars left across two of the stones.
    """
    bm = bmesh.new()
    n = 10
    for k in range(n):
        a = TAU * k / n + 0.25 * C.jit(k, 1.0)
        r = 0.56 + 0.03 * C.jit(k, 2.0)
        sz = (0.13 + 0.03 * C.jit(k, 3.0), 0.1 + 0.02 * C.jit(k, 4.0), 0.11 + 0.04 * (C.jit(k, 5.0) + 0.5))
        stone_bm(bm, (r * math.cos(a), r * math.sin(a), 0.0), sz, a + 1.0 + k)
    C.outward(bm)
    P.mesh('stones', bm, 'paint', sharp=50.0)
    P.lathe('ash', [(0.0, 0.0), (0.48, 0.0), (0.46, 0.015), (0.3, 0.035), (0.0, 0.045)], material='plastic_int',
            segs=16, sharp=40.0)
    for k, (a, ln, r) in enumerate(((0.4, 0.5, 0.04), (2.2, 0.42, 0.035), (4.1, 0.36, 0.03))):
        d = V((math.cos(a), math.sin(a), 0.0))
        c = d * 0.06 + V((0, 0, 0.04 + r * 0.6))
        P.cyl('charred', r, ln, tuple(c), 'trim', axis=tuple(d + V((0, 0, 0.12))), segs=7, bev=0.004, bsegs=1)
        P.cyl('charred_end', r * 0.9, 0.02, tuple(c - d * (ln / 2 - 0.005)), 'wood', axis=tuple(d), segs=7, bev=None)
    # the grate across the stones at -Y / +Y... laid over two of them
    zg = 0.19
    bm = bmesh.new()
    for i in range(6):
        x = -0.2 + 0.08 * i
        K.bm_cube(bm, (0.012, 1.0, 0.012), mat4((x, 0.02, zg), (0, 0, 8)))
    for y in (-0.42, 0.46):
        K.bm_cube(bm, (0.5, 0.016, 0.012), mat4((0.07 * (y > 0) - 0.02, y, zg + 0.012), (0, 0, 8)))
    P.mesh('grate', bm, 'steel', bev=0.002, segs=1)
    P.views = [('a', 30, 40), ('b', 210, 50)]


def sitting_log(P):
    """A felled log to sit on by the fire (1.5 x 0.35): a little irregular, its bark (leather), the sawn ends
    (wood) with the rings showing, a branch stub, a flat worn into its top where people sat."""
    L, r = 1.5, 0.172
    prof = []
    for k in range(9):
        t = k / 8
        prof.append((r * (1.0 - 0.05 * t + 0.03 * math.sin(7 * t)), -L / 2 + L * t))
    prof = [(0.0, -L / 2)] + prof + [(0.0, L / 2)]
    bm = bmesh.new()
    rings = K.bm_lathe(bm, prof, segs=12, matrix=Matrix.Translation((0, 0, r)) @ K.axis_matrix('Y'))
    for f in bm.faces:
        if len(f.verts) > 4 or any(v.co.y < -L / 2 + 0.001 or v.co.y > L / 2 - 0.001 for v in f.verts) and \
                abs(f.normal.y) > 0.9:
            f.material_index = 1
    for v in bm.verts:
        if v.co.z > r * 1.95:
            v.co.z = r * 1.95
    P.mesh('log', bm, ['leather', 'wood'], sharp=40.0)
    for sy in (-1, 1):
        for rr in (0.06, 0.11):
            P.torus('ring', rr, 0.003, loc=(0, sy * (L / 2 + 0.0005), r), axis='Y', segs=12, rsegs=3, material='trim')
    kn = V((0.12, 0.3, r + 0.11)).normalized()
    P.cyl('knot', 0.035, 0.012, (0.12 * 0.98, 0.3, r + 0.11 * 0.98), 'leather', axis=(1.0, 0.0, 0.9), segs=8,
          r2=0.026, bev=None)
    P.views = [('a', 35, 22), ('b', 215, 26)]


def tent(P):
    """
    An abandoned ridge tent (2.6 x 2.0 x 1.4): the canvas (paint) over its two poles and the ridge, sagging where
    the back pole leans, the door end tied open (one flap rolled up, one hanging), the closed back end, guy ropes
    to their pegs, the ground sheet's edge, a sleeping bag (paint_b) left inside.
    """
    hy, hx = 1.25, 0.98
    zf, zbk = 1.37, 1.16                             # the ridge at the door end and at the back

    def ridge(u):
        return zbk + (zf - zbk) * u - 0.14 * math.sin(math.pi * u)

    def fly(u, v):
        y = -hy + 2 * hy * u
        s = 2 * v - 1
        a = abs(s)
        zr = ridge(u)
        z = zr * (1 - a) - 0.07 * math.sin(math.pi * a) * (0.6 + 0.4 * math.sin(math.pi * u)) + 0.012 * math.sin(9 * u)
        x = s * hx * (0.98 + 0.02 * math.sin(5 * u))
        return (x, y, max(0.004, z))

    P.mesh('fly', junk.grid_sheet(10, 12, fly, 0.006), 'paint', sharp=60.0)
    # the back end, closed
    zr0 = ridge(0.0)
    bm = bmesh.new()
    K.bm_prism(bm, [(-hx, 0.0), (hx, 0.0), (0.0, zr0)], 0.008, matrix=mat4((0, -hy, 0), (90, 0, 0)))
    P.mesh('back_end', bm, 'paint', bev=None)
    # the door end: the right flap hanging, the left one rolled up and tied
    zr1 = ridge(1.0)
    bm = bmesh.new()
    K.bm_prism(bm, [(0.0, 0.03), (hx * 0.92, 0.0), (0.0, zr1 - 0.02)], 0.008,
               matrix=mat4((0, hy - 0.01, 0), (90, 0, 6)))
    P.mesh('door_flap', bm, 'paint', bev=None)
    P.cyl('rolled_flap', 0.045, 0.85, (-0.47, hy + 0.035, 0.68), 'paint', axis=(0.58, 0, 0.81), segs=8, bev=0.01,
          bsegs=1)
    # the poles and their guys
    for (y, zt, lean) in ((hy, zr1, 0.0), (-hy, zr0, 0.2)):
        top = V((lean, y, zt + 0.015))
        C.post(P, 'pole', (0.0, y, 0.0), tuple(top), 0.016, 'alu', segs=8)
        sgn = 1 if y > 0 else -1
        for sx in (-1, 1):
            peg = V((sx * 0.7, y - sgn * 0.04, 0.0))
            P.tube('guy', [top, peg + V((0, 0, 0.05))], 0.004, 'fabric', segs=4)
            P.cyl('peg', 0.008, 0.08, tuple(peg + V((0, 0, 0.04))), 'steel', axis=(0, 0, 1), segs=6, bev=None)
    # the ground sheet's edge showing at the door, the sleeping bag inside
    C.block(P, 'groundsheet', (2 * hx - 0.1, 2 * hy - 0.05, 0.006), (0.0, 0.0, 0.003), 'trim', bev=None)
    junk.cushion(P, 'sleeping_bag', (0.7, 1.7, 0.1), (0.25, -0.1, 0.06), 'paint_b', r=0.04, sag=0.02, step=0.3)
    P.views = [('a', -55, 16), ('b', 160, 20)]


def game_bag(P):
    """
    A hunter's canvas game bag left on the stand (0.5 x 0.4 x 0.45), slumped: the soft body (paint), the flap
    over its top with two leather straps and their buckles, two side pockets, the shoulder strap lying over it.
    """
    junk.cushion(P, 'body', (0.36, 0.48, 0.4), (0.0, 0.0, 0.2), 'paint', r=0.06, sag=0.05, at=(0.0, 0.2),
                 spread=0.5, step=0.14)
    junk.cushion(P, 'flap', (0.3, 0.46, 0.05), (0.05, 0.0, 0.405), 'paint', r=0.02, sag=0.0, step=0.2,
                 taper=(0.94, 0.96))
    for sy in (-1, 1):
        junk.cushion(P, 'pocket', (0.2, 0.06, 0.2), (0.02, sy * 0.24, 0.15), 'paint', r=0.02, step=0.2)
        y = sy * 0.12
        P.tube('strap', [(-0.1, y, 0.43), (0.12, y, 0.43), (0.18, y, 0.38), (0.19, y, 0.25)], 1.0, 'leather',
               profile=[(-0.003, -0.012), (0.003, -0.012), (0.003, 0.012), (-0.003, 0.012)], bend=0.03, sharp=60.0)
        C.block(P, 'buckle', (0.006, 0.032, 0.028), (0.192, y, 0.27), 'steel', bev=0.002)
    P.tube('sling', [(-0.12, -0.255, 0.22), (-0.12, -0.25, 0.36), (-0.11, -0.16, 0.432), (-0.1, 0.16, 0.432),
                     (-0.1, 0.25, 0.36), (-0.09, 0.27, 0.16), (-0.02, 0.27, 0.05)], 1.0, 'leather',
           profile=[(-0.003, -0.016), (0.003, -0.016), (0.003, 0.016), (-0.003, 0.016)], bend=0.05, sharp=60.0)
    P.views = [('a', 35, 26), ('b', 215, 30)]


# ------------------------------------------------------------------------------------------------ the jetty

def tacklebox(P):
    """
    A fishing tackle box (0.5 x 0.3 x 0.3): the moulded body (paint), the lid hinged along its back (LID) with the
    carry handle (paint_b) and two latches at the front; inside a tray of compartments with a few lures (M_inside).
    """
    W, D = 0.5, 0.28
    hw, hd = W / 2, D / 2
    zl = 0.19
    t = 0.012
    C.block(P, 'floor', (D - 0.01, W - 0.01, 0.02), (0.0, 0.0, 0.01), 'paint', bev=0.008, segs=1)
    for sx in (-1, 1):
        C.block(P, 'wall', (t, W - 0.01, zl - 0.01), (sx * (D / 2 - 0.005 - t / 2), 0.0, 0.01 + (zl - 0.01) / 2),
                'paint', bev=0.006, segs=1, step=0.15, axes=(1,))
    for sy in (-1, 1):
        C.block(P, 'wall', (D - 0.01 - 2 * t, t, zl - 0.01), (0.0, sy * (W / 2 - 0.005 - t / 2), 0.01 + (zl - 0.01) / 2),
                'paint', bev=0.006, segs=1)
    C.block(P, 'inside', (D - 0.012 - 2 * t, W - 0.012 - 2 * t, 0.004), (0.0, 0.0, 0.022), 'trim', bev=None)
    zt = zl - 0.04
    C.block(P, 'tray', (D - 0.012 - 2 * t, W - 0.012 - 2 * t, 0.008), (0.0, 0.0, zt), 'paint_b', bev=None)
    for y in (-0.12, -0.04, 0.04, 0.12):
        C.block(P, 'divider', (D - 0.05, 0.006, 0.035), (0.0, y, zt + 0.02), 'paint_b', bev=None)
    C.block(P, 'divider', (0.006, W - 0.05, 0.035), (0.0, 0.0, zt + 0.02), 'paint_b', bev=None)
    for k, (x, y, m) in enumerate(((0.06, -0.16, 'paint'), (-0.05, -0.08, 'chrome'), (0.07, 0.0, 'paint_b'),
                                   (-0.06, 0.08, 'paint'), (0.05, 0.17, 'chrome'))):
        C.block(P, 'lure', (0.05, 0.014, 0.012), (x, y, zt + 0.012), m, rot=(0, 0, 30 * k), bev=0.004)
    C.marker(P, 'M_inside', (0.0, 0.0, zt + 0.004))
    objs = [C.block(P, 'lid', (D, W, 0.07), (0.0, 0.0, zl + 0.035), 'paint', bev=0.014, segs=2)]
    objs.append(P.tube('handle', [(0.0, -0.1, zl + 0.07), (0.0, -0.08, zl + 0.1), (0.0, 0.08, zl + 0.1),
                                  (0.0, 0.1, zl + 0.07)], 0.012, 'paint_b', segs=8, bend=0.02))
    for y in (-0.15, 0.15):
        objs.append(C.block(P, 'latch', (0.01, 0.04, 0.05), (hd + 0.002, y, zl + 0.0), 'paint_b', bev=0.004))
    P.mover('LID', objs, (-hd, 0.0, zl))
    for y in (-0.16, 0.16):
        P.cyl('hinge', 0.007, 0.05, (-hd - 0.003, y, zl), 'paint', axis='Y', segs=8, bev=None)
    P.views = [('a', 35, 28), ('b', 215, 30)]


def boat(P):
    """
    An old clinker-built rowing boat drawn up on the shore (3.4 x 1.3 x 0.55), heeled a little: the hull of
    overlapping strakes (paint outside, wood inside) from the transom to the stem, the gunwale, two thwarts, the
    oarlocks, a pair of oars lying in it, the keel and the stem post.
    """
    L = 3.32
    ys, yb = -L / 2, L / 2                          # the stern (the transom), the bow

    def half(t):                                    # half-beam at the gunwale
        return 0.36 + 0.29 * math.sin(math.pi * min(1.0, t / 0.8) * 0.5) ** 0.8 if t < 0.55 else \
            0.6 * math.cos(math.pi / 2 * (t - 0.55) / 0.45) ** 0.85

    def sheer(t):
        return 0.43 + 0.05 * t ** 2

    keel = 0.07
    secs = []
    n = 12
    for k in range(n + 1):
        t = k / n * 0.985
        y = ys + (yb - ys) * t
        b = max(0.012, half(t))
        g = sheer(t)
        kz = keel + 0.02 * t
        pts = []
        strakes = 4
        for j in range(strakes + 1):
            f = j / strakes                          # 0 at the gunwale, 1 at the keel
            x = b * math.cos(f * math.pi / 2 * 0.92) ** 0.8
            z = g + (kz - g) * math.sin(f * math.pi / 2)
            step = 0.01 if j % 2 else 0.0           # (the lap of each strake)
            pts.append((x + step, y, z))
        side = [(x, y, z) for (x, y, z) in pts]
        sec = side + [(-x, y, z) for (x, y, z) in reversed(side[:-1])]
        secs.append(sec)
    bm = bmesh.new()
    vr, faces = K.bm_loft(bm, secs, closed=False)
    bmesh.ops.solidify(bm, geom=faces, thickness=0.016)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    C.outward(bm)
    for f in bm.faces:
        c = f.calc_center_median()
        out = V((c.x, 0.0, c.z - 0.35))
        f.material_index = 0 if f.normal.dot(out) > 0 else 1
    P.mesh('hull', bm, ['paint', 'wood'], sharp=40.0)
    # the transom, the stem, the keel
    t0 = secs[0]
    poly = [(p[0], p[2]) for p in t0]
    bm = bmesh.new()
    K.bm_prism(bm, C.ccw(poly), 0.03, matrix=mat4((0, ys - 0.01, 0), (90, 0, 0)))
    P.mesh('transom', bm, 'paint', bev=0.005, segs=1)
    C.post(P, 'stem', (0.0, yb - 0.05, keel + 0.03), (0.0, yb + 0.02, sheer(1.0) + 0.02), 0.03, 'wood', segs=6,
           bev=None)
    C.plank(P, 'keel', (0.0, ys + 0.02, keel - 0.03), (0.0, yb - 0.1, keel - 0.02), 0.05, 0.05, 'wood', up=(0, 0, 1),
            bev=0.006, step=0.6)
    # the gunwales, the thwarts, the oarlocks
    for sx in (-1, 1):
        pts = [V((sx * (max(0.012, half(k / 12 * 0.985)) + 0.005), ys + (yb - ys) * k / 12 * 0.985,
                  sheer(k / 12 * 0.985) + 0.012)) for k in range(13)]
        P.tube('gunwale', pts, 0.02, 'wood', segs=6, bend=0.0)
    for (t, w) in ((0.32, 0.18), (0.62, 0.16)):
        y = ys + (yb - ys) * t
        b = half(t) - 0.04
        C.block(P, 'thwart', (2 * b, w, 0.03), (0.0, y, sheer(t) - 0.12), 'wood', bev=0.006)
    ty = ys + (yb - ys) * 0.42
    for sx in (-1, 1):
        x = sx * (half(0.42) + 0.01)
        P.cyl('oarlock', 0.008, 0.06, (x, ty, sheer(0.42) + 0.05), 'steel', segs=6, bev=None)
        P.torus('oarlock_ring', 0.022, 0.005, loc=(x, ty, sheer(0.42) + 0.085), axis='X', segs=10, rsegs=4,
                material='steel', arc=math.pi, a0=0.0)
    # the oars lying along the boat on the thwarts
    for sx in (-1, 1):
        a = V((sx * 0.16, ys + 0.5, 0.39))
        b = V((sx * 0.2, yb - 0.55, 0.36))
        C.post(P, 'oar', tuple(a), tuple(b), 0.02, 'wood', segs=7, bev=None)
        d = (b - a).normalized()
        C.block(P, 'blade', (0.012, 0.5, 0.13), tuple(b + d * 0.22), 'wood', rot=(0, 90 * sx * 0.0 + 10 * sx, 0),
                bev=0.006)
    # heeled over a little onto its side
    C.xform(P, 0, Matrix.Translation((-0.034, 0.0, 0.0)) @ Matrix.Rotation(math.radians(4.0), 4, 'Y'))
    P.views = [('a', 35, 26), ('b', 120, 30)]


def jetty_deck(P, kind='plain'):
    """
    A jetty deck module (2.0 x 1.8; its deck 0.25 deep, the top at z = 0.25, its posts going down 1.5 m below z = 0
    into the water): seven boards across on two stringers, the cap beam over the pair of posts at the -Y end with
    their cross brace; repeat it every 2 m out from the bank. jetty_deck_b has a board gone and another split;
    jetty_end, the last one, carries two mooring posts and a ladder down into the water.
    """
    hy, hx = 1.0, 0.9
    zt = 0.25
    nb = 7
    bw = 2 * hy / nb
    for i in range(nb):
        y = -hy + bw * (i + 0.5)
        if kind == 'broken' and i == 4:
            continue
        ln = 2 * hx - 0.02 + 0.02 * C.jit(i, 1.0)
        C.block(P, 'board', (ln, bw - 0.02, 0.04), (0.01 * C.jit(i, 2.0), y, zt - 0.02), 'wood', bev=0.005,
                rot=(0, 0, 0.8 * C.jit(i, 3.0)), step=0.6, axes=(0,))
    if kind == 'broken':
        y = -hy + bw * 4.5
        C.block(P, 'split_board', (0.8, bw - 0.03, 0.04), (0.45, y, zt - 0.03), 'wood', rot=(4, 0, 3), bev=0.005)
    for sx in (-1, 1):
        C.block(P, 'stringer', (0.08, 2 * hy, 0.12), (sx * 0.72, 0.0, 0.15), 'wood', bev=0.006, step=0.6, axes=(1,))
    yp = -hy + 0.1
    C.block(P, 'cap', (2 * hx - 0.02, 0.12, 0.09), (0.0, yp, 0.045), 'wood', bev=0.006)
    for sx in (-1, 1):
        C.post(P, 'post', (sx * 0.8, yp, 0.0), (sx * 0.8, yp, -1.5), 0.095, 'wood', segs=8, bev=0.006)
    C.plank(P, 'brace', (-0.8, yp + 0.1, -0.08), (0.8, yp + 0.1, -1.25), 0.1, 0.04, 'wood', up=(0, 1, 0), bev=0.005,
            floor=False)
    C.plank(P, 'brace', (0.8, yp - 0.1, -0.08), (-0.8, yp - 0.1, -1.25), 0.1, 0.04, 'wood', up=(0, 1, 0), bev=0.005,
            floor=False)
    if kind == 'end':
        for sx in (-1, 1):
            C.post(P, 'mooring_post', (sx * 0.8, hy - 0.1, -1.5), (sx * 0.8, hy - 0.1, zt + 0.85), 0.1, 'wood', segs=8,
                   bev=0.006)
            P.cyl('mooring_cap', 0.105, 0.04, (sx * 0.8, hy - 0.1, zt + 0.87), 'wood', segs=8, r2=0.07, bev=None)
        P.torus('rope_turns', 0.11, 0.014, loc=(0.8, hy - 0.1, zt + 0.55), segs=12, rsegs=5, material='fabric')
        for k in range(6):
            z = zt - 0.15 - 0.25 * k
            C.block(P, 'rung', (0.4, 0.04, 0.035), (-0.25, hy + 0.04, z), 'wood', bev=0.004)
        for x in (-0.45, -0.05):
            C.block(P, 'ladder_side', (0.05, 0.05, 1.6), (x, hy + 0.04, zt - 0.8), 'wood', bev=0.004, step=0.5,
                    axes=(2,))
    P.views = [('a', 35, 18), ('b', 215, 22)]


# ------------------------------------------------------------------------------------------------ the hide, the lookout, the works

def stand(P):
    """
    A hunter's high seat as the places lay it out (its deck 2.6 x 2.6 at 2.4): four legs splayed a little, braced,
    running on up as the posts of the roof; the deck of boards on its joists (M_top on it), boarded to the waist
    on three sides and half the front, a cap rail along the top; the stairs up the front (+X) on its -Y side with a
    hand rail (they run out 2.5 m in front of it, as the places' steps do); a roof of sheets falling to the back.
    """
    hw = 1.3
    zd = 2.4
    zr_f, zr_b = zd + 2.05, zd + 1.85
    lp = hw - 0.12
    for sx in (-1, 1):
        for sy in (-1, 1):
            top = (sx * lp, sy * lp, (zr_f if sx > 0 else zr_b) - 0.08)
            C.plank(P, 'leg', (sx * (lp + 0.06), sy * (lp + 0.06), 0.0), top, 0.1, 0.1, 'wood', up=(1, 0, 0),
                    bev=0.008, step=0.8)
    for sy in (-1, 1):
        C.plank(P, 'brace', (-lp - 0.03, sy * (lp + 0.06), 0.25), (lp + 0.03, sy * (lp + 0.02), zd - 0.25), 0.09, 0.035,
                'wood', up=(0, 1, 0), bev=0.005, step=0.8)
        C.plank(P, 'brace', (sy * (lp + 0.06), -lp - 0.03, 0.25), (sy * (lp + 0.02), lp + 0.03, zd - 0.25), 0.09,
                0.035, 'wood', up=(1, 0, 0), bev=0.005, step=0.8)
    # the deck: joists and boards
    for sy in (-1, 1):
        C.block(P, 'joist', (2 * hw, 0.08, 0.14), (0.0, sy * (lp - 0.08), zd - 0.11), 'wood', bev=0.006, step=0.7,
                axes=(0,))
    nb = 9
    for i in range(nb):
        x = -hw + 2 * hw * (i + 0.5) / nb
        C.block(P, 'deck', (2 * hw / nb - 0.012, 2 * hw, 0.04), (x, 0.0, zd - 0.02), 'wood', bev=0.004, step=0.8,
                axes=(1,))
    C.marker(P, 'M_top', (0.0, 0.3, zd))
    # boarded to the waist: the back, the two sides, the +Y half of the front
    zw = zd + 1.0
    t = 0.025
    walls = [((-hw + t / 2, 0.0), (t, 2 * hw, 1.0)), ((0.0, -hw + t / 2), (2 * hw - 2 * t, t, 1.0)),
             ((0.0, hw - t / 2), (2 * hw - 2 * t, t, 1.0)), ((hw - t / 2, 0.55), (t, 1.5, 1.0))]
    for (xy, size) in walls:
        C.block(P, 'wall', size, (xy[0], xy[1], zd + 0.5), 'paint', bev=None, step=0.5, axes=(0, 1, 2))
    e = hw - 0.045
    for (x0, y0, x1, y1) in ((-e, -e, -e, e), (-e, -e, e, -e), (-e, e, e, e), (e, -0.2, e, e)):
        C.plank(P, 'cap_rail', (x0, y0, zw + 0.02), (x1, y1, zw + 0.02), 0.09, 0.04, 'wood', up=(0, 0, 1), bev=0.005,
                step=0.8)
    # the roof
    for y0, y1 in ((-hw, 0.02), (-0.02, hw)):
        corrugated(P, 'roof', hw + 0.15, -hw, zr_f, zr_b, y0, y1, rust=0.6, seed=y0)
    for sx in (-1, 1):
        C.plank(P, 'roof_beam', (sx * lp, -hw + 0.02, (zr_f if sx > 0 else zr_b) - 0.05),
                (sx * lp, hw - 0.02, (zr_f if sx > 0 else zr_b) - 0.05), 0.08, 0.08, 'wood', up=(0, 0, 1), bev=0.006,
                step=0.9)
    # the stairs: two stringers, nine treads, the hand rail on the outside
    steps = math.ceil(zd / 0.24)
    run = (steps - 1) * 0.28
    xs0, xs1 = hw + run, hw
    for y in (-hw + 0.03, -hw + 1.0):
        C.plank(P, 'stringer', (xs0 + 0.05, y, 0.0), (xs1, y, zd - 0.02), 0.22, 0.04, 'wood', up=(0, 1, 0),
                bev=0.006, step=0.8)
    for i in range(1, steps):
        ztop = zd * i / steps
        x = hw + (steps - i) * 0.28 - 0.14
        C.block(P, 'tread', (0.27, 0.93, 0.035), (x, -hw + 0.515, ztop - 0.0175), 'wood', bev=0.004)
    for (x, z) in ((xs0 - 0.05, 0.0), (xs1 + 0.02, zd)):
        C.block(P, 'rail_post', (0.06, 0.06, 1.0), (x, -hw + 0.0, z + 0.5), 'wood', bev=0.005)
    C.plank(P, 'hand_rail', (xs0 - 0.05, -hw + 0.0, 0.95), (xs1 + 0.02, -hw + 0.0, zd + 0.95), 0.06, 0.04, 'wood',
            up=(0, 1, 0), bev=0.005, step=0.8)
    P.ao_distance = 0.25
    P.views = [('a', 40, 16), ('b', 220, 20)]


def scope(P):
    """
    A coin-operated binocular viewer at a lookout (0.3 x 0.3 x 1.5): the bolted base flange, the tapered pedestal
    (paint) with the coin box (paint_b) on its front, the yoke and the head (looking out to -X, the eyepieces in their
    rubber cups and the visor on +X where one stands: M_eye, +Z the way it looks), two aiming handles.
    """
    P.cyl('flange', 0.15, 0.03, (0.0, 0.0, 0.015), 'steel', segs=14, bev=0.005, bsegs=1)
    P.bolts([(0.11 * math.cos(a), 0.11 * math.sin(a), 0.03) for a in (0.4, 2.0, 3.6, 5.2)], r=0.012, h=0.01,
            washer=False)
    zp = 1.16
    P.lathe('pedestal', [(0.0, 0.03), (0.075, 0.03), (0.07, 0.1), (0.055, zp - 0.12), (0.06, zp - 0.06), (0.06, zp),
                         (0.0, zp)], material='paint', segs=14, sharp=40.0)
    C.block(P, 'coin_box', (0.1, 0.13, 0.18), (0.065, 0.0, zp - 0.16), 'paint_b', bev=0.012, segs=2)
    bm = bmesh.new()
    C.rect_face(bm, 0.008, 0.035, (0.1155, 0.0, zp - 0.12), (1, 0, 0))
    P.mesh('coin_slot', bm, 'trim', sharp=50.0)
    C.patch(P, 'plate', 0.08, 0.05, (0.115, 0.0, zp - 0.19), (1, 0, 0), 'chrome', t=0.002)
    P.cyl('swivel', 0.065, 0.04, (0.0, 0.0, zp + 0.02), 'steel', segs=14, bev=0.004, bsegs=1)
    for sy in (-1, 1):
        C.block(P, 'yoke', (0.06, 0.02, 0.14), (0.0, sy * 0.115, zp + 0.1), 'steel', bev=0.005)
    # the head, tipped down a little
    since = C.mark(P)
    C.block(P, 'head', (0.2, 0.21, 0.17), (0.0, 0.0, 0.0), 'paint', bev=0.03, segs=2)
    for sy in (-1, 1):
        P.cyl('objective', 0.045, 0.04, (-0.11, sy * 0.05, 0.0), 'chrome', axis='X', segs=14, bev=0.004, bsegs=1)
        P.cyl('lens', 0.036, 0.006, (-0.131, sy * 0.05, 0.0), 'glass_dark', axis='X', segs=14, bev=None)
        P.cyl('eyepiece', 0.022, 0.03, (0.112, sy * 0.034, 0.03), 'steel', axis='X', segs=10, bev=None)
        P.lathe('eyecup', K.shell_profile([(0.022, 0.0), (0.026, 0.02)], 0.004), loc=(0.125, sy * 0.034, 0.03),
                material='rubber', axis='X', segs=10, loop=True, sharp=50.0)
        P.cyl('handle', 0.012, 0.06, (0.04, sy * 0.125, -0.03), 'trim', axis='Y', segs=8, bev=0.003, bsegs=1)
        P.cyl('pivot', 0.02, 0.012, (0.0, sy * 0.11, 0.0), 'steel', axis='Y', segs=10, bev=None)
    C.block(P, 'visor', (0.04, 0.17, 0.012), (0.115, 0.0, 0.07), 'paint', rot=(0, -12, 0), bev=0.004)
    tilt = 6.0
    m = Matrix.Translation((0.0, 0.0, 1.405)) @ Matrix.Rotation(math.radians(tilt), 4, 'Y')
    C.xform(P, since, m)
    eye = m @ V((0.14, 0.0, 0.03))
    C.marker(P, 'M_eye', tuple(eye), up=tuple(m.to_3x3() @ V((-1, 0, 0))))
    P.views = [('a', 35, 14), ('b', 215, 16)]


def guard_rail(P, post_only=False):
    """
    A lookout's guard rail module (2.0 x 0.1 x 1.05): a steel post on its base plate at y = -1 (its centre), the top
    rail, the knee rail and a kick board, running to y = +1 where the next module's post (or a rail_post) stands;
    repeat it every 2 m.
    """
    yp = -1.0 if not post_only else 0.0
    C.block(P, 'base', (0.1, 0.1, 0.012), (0.0, yp, 0.006), 'steel', bev=0.003)
    P.cyl('post', 0.03, 1.0, (0.0, yp, 0.012 + 0.5), 'paint', segs=10, bev=None)
    P.sphere('post_cap', 0.034, (0.0, yp, 1.012), 'paint', u=10, v=5, scale=(1, 1, 0.6))
    if post_only:
        P.views = [('a', 35, 14), ('b', 215, 14)]
        return
    P.cyl('top_rail', 0.026, 2.0, (0.0, 0.0, 1.015), 'paint', axis='Y', segs=10, bev=None)
    P.cyl('knee_rail', 0.02, 2.0, (0.0, 0.0, 0.55), 'paint', axis='Y', segs=8, bev=None)
    C.block(P, 'kick', (0.025, 2.0, 0.12), (0.0, 0.0, 0.08), 'paint_b', bev=0.004, step=0.5, axes=(1,))
    for z in (1.015, 0.55):
        P.cyl('collar', 0.034, 0.06, (0.0, yp, z), 'steel', axis='Y', segs=10, bev=0.003, bsegs=1)
    P.views = [('a', 30, 12), ('b', 210, 14)]


def pipes(P, W=8.5):
    """
    The old works' pipes across its yard (8.5 x 1.5 x 1.05; pipes_s 6.5): three pipes (paint) on concrete saddles
    (paint_b), flanged at their joints, both ends turning down into the ground; on the middle one a valve with its
    hand wheel.
    """
    hw = W / 2
    zs = 0.42
    runs = [(-0.42, 0.16), (0.0, 0.2), (0.42, 0.16)]
    nsad = max(2, round(W / 2.6))
    for k in range(nsad):
        y = -hw + 0.9 + k * (W - 1.8) / (nsad - 1)
        P.prism('saddle', [(-0.75, 0.0), (0.75, 0.0), (0.68, zs), (-0.68, zs)], 0.42,
                matrix=mat4((0, y, 0), (90, 0, 0)), material='paint_b', bev=0.02, segs=1)
    for (x, r) in runs:
        zc = zs + r
        re = r * 1.6                                # the elbows' bend radius
        y0, y1 = -hw + re + r, hw - re - r
        P.cyl('pipe', r, y1 - y0, (x, (y0 + y1) / 2, zc), 'paint', axis='Y', segs=16, bev=None, caps=False)
        for sy in (-1, 1):
            # the elbow round and down, the leg into the ground
            P.torus('elbow', re, r, loc=(x, sy * (hw - re - r), zc - re), axis='X', segs=8, rsegs=16, material='paint',
                    arc=math.pi / 2, a0=(math.pi / 2 if sy > 0 else math.pi))
            P.cyl('leg', r, zc - re, (x, sy * (hw - r), (zc - re) / 2), 'paint', segs=16, bev=None, caps=False)
            P.cyl('collar', r + 0.025, 0.08, (x, sy * (hw - r), 0.04), 'paint_b', segs=16, bev=0.01, bsegs=1)
        nfl = max(2, int((y1 - y0) / 2.4))
        for j in range(1, nfl):
            y = y0 + (y1 - y0) * j / nfl
            P.cyl('flange', r + 0.03, 0.04, (x, y, zc), 'steel', axis='Y', segs=16, bev=0.006, bsegs=1)
    # the valve on the middle pipe
    vy = -hw * 0.3
    zc = zs + 0.2
    P.cyl('valve_body', 0.25, 0.3, (0.0, vy, zc), 'paint', axis='Y', segs=16, bev=0.03, bsegs=2)
    P.cyl('bonnet', 0.08, 0.16, (0.0, vy, zc + 0.27), 'paint', segs=12, bev=0.01, bsegs=1)
    P.cyl('stem', 0.025, 0.1, (0.0, vy, zc + 0.36), 'steel', segs=8, bev=None)
    P.torus('wheel', 0.2, 0.02, loc=(0.0, vy, 1.0), segs=20, rsegs=6, material='paint_b')
    bm = bmesh.new()
    for a in (0.0, math.pi / 3, 2 * math.pi / 3):
        K.bm_cube(bm, (0.4, 0.024, 0.02), mat4((0.0, vy, 1.0), (0, 0, math.degrees(a))))
    P.mesh('spokes', bm, 'paint_b', bev=0.003, segs=1)
    P.cyl('hub', 0.04, 0.05, (0.0, vy, 1.0), 'steel', segs=10, bev=0.004, bsegs=1)
    P.ao_distance = 0.3
    P.views = [('a', 30, 20), ('b', 210, 24)]


def silo(P, H=6.0):
    """
    The works' round concrete tank (5.6 across, 6.0 to the top of its rail): the plinth, the wall (paint_b) in three
    lifts with three hoops (paint), the shallow domed roof with its hatch, a railing round the top; the ladder up
    its +X side to a gap in the rail, caged from head height up.
    """
    R = 2.55
    zb, zt = 0.3, H - 1.05
    P.lathe('plinth', [(0.0, 0.0), (R + 0.12, 0.0), (R + 0.12, zb), (0.0, zb)], material='paint_b', segs=32,
            sharp=40.0)
    lifts = [(zb, zb + (zt - zb) / 3), (zb + (zt - zb) / 3, zb + 2 * (zt - zb) / 3), (zb + 2 * (zt - zb) / 3, zt)]
    prof = [(0.0, zb)]
    for k, (z0, z1) in enumerate(lifts):
        dr = (0.0, 0.012, -0.008)[k]
        prof += [(R + dr, z0), (R + dr, (z0 + z1) / 2), (R + dr, z1 - 0.005)]
    prof += [(R, zt), (R * 0.7, zt + 0.12), (R * 0.35, zt + 0.2), (0.0, zt + 0.22)]
    bm = bmesh.new()
    K.bm_lathe(bm, prof, segs=32)
    P.mesh('wall', bm, 'paint_b', sharp=40.0)
    for z in (zb + (zt - zb) * 0.3, zb + (zt - zb) * 0.63, zt - 0.12):
        P.lathe('hoop', [(R + 0.005, z - 0.07), (R + 0.035, z - 0.07), (R + 0.035, z + 0.07), (R + 0.005, z + 0.07)],
                material='paint', segs=32, loop=True, sharp=50.0)
    P.lathe('rim', [(R - 0.02, zt - 0.02), (R + 0.06, zt - 0.02), (R + 0.06, zt + 0.06), (R - 0.02, zt + 0.06)],
            material='paint', segs=32, loop=True, sharp=50.0)
    C.block(P, 'hatch', (0.7, 0.7, 0.08), (-0.6, 0.4, zt + 0.19), 'steel', rot=(0, -3, 0), bev=0.01)
    # the railing round the top, a gap over the ladder
    n = 16
    bm = bmesh.new()
    zr0, zr1 = zt + 0.06, H - 0.03
    for k in range(n):
        a = TAU * (k + 0.5) / n
        if abs(((a + math.pi) % TAU) - math.pi) < TAU / n * 0.6:
            continue
        K.bm_cyl(bm, 0.025, zr1 - zr0, segs=6, matrix=Matrix.Translation(((R - 0.05) * math.cos(a),
                                                                             (R - 0.05) * math.sin(a),
                                                                             (zr0 + zr1) / 2)))
    P.mesh('rail_posts', bm, 'paint', bev=None)
    gap = TAU / n * 1.0
    for z in (zr1, (zr0 + zr1) / 2):
        P.torus('rail', R - 0.05, 0.022, loc=(0, 0, z), segs=30, rsegs=5, material='paint', arc=TAU - 2 * gap, a0=gap)
    # the ladder on +X and its cage
    xl = R + 0.2
    for sy in (-1, 1):
        C.block(P, 'stile', (0.05, 0.05, zr1 - 0.05), (xl, sy * 0.22, (zr1 - 0.05) / 2 + 0.05), 'steel', bev=0.004,
                step=1.2, axes=(2,))
        C.block(P, 'stay', (0.24, 0.04, 0.04), (R + 0.1, sy * 0.22, 1.2), 'steel', bev=0.003)
        C.block(P, 'stay', (0.24, 0.04, 0.04), (R + 0.1, sy * 0.22, zt - 0.4), 'steel', bev=0.003)
    bm = bmesh.new()
    for k in range(int((zr1 - 0.3) / 0.3)):
        K.bm_cube(bm, (0.03, 0.44, 0.03), mat4((xl, 0.0, 0.3 + 0.3 * k)))
    P.mesh('rungs', bm, 'steel', bev=None)
    zc0 = 2.3
    for k in range(int((zt - zc0) / 0.8) + 1):
        z = zc0 + 0.8 * k
        pts = [V((xl - 0.02, -0.25, z))] + [V((xl + 0.3 + 0.3 * math.sin(a), -0.32 * math.cos(a), z)) for a in
                                            [math.pi * j / 6 for j in range(7)]] + [V((xl - 0.02, 0.25, z))]
        P.tube('hoop', pts, 0.016, 'steel', segs=5, bend=0.0)
    for a in [math.pi * j / 4 for j in range(1, 4)]:
        P.tube('cage_bar', [(xl + 0.3 + 0.3 * math.sin(a), -0.32 * math.cos(a), zc0),
                            (xl + 0.3 + 0.3 * math.sin(a), -0.32 * math.cos(a), zt)], 0.014, 'steel', segs=5)
    P.ao_distance = 0.4
    P.views = [('a', 30, 18), ('b', 210, 26)]


def tank(P):
    """
    A farm tank on its stand (1.7 x 1.7 x 3.3): four splayed steel legs (paint) braced in X's, the platform of boards
    at 2.0, the tank (paint) with three hoops, its shallow cone, the manhole and a vent; the outlet pipe down a leg
    to a tap, a ladder up one side.
    """
    zp = 2.0
    for sx in (-1, 1):
        for sy in (-1, 1):
            C.plank(P, 'leg', (sx * 0.8, sy * 0.8, 0.0), (sx * 0.62, sy * 0.62, zp), 0.07, 0.07, 'paint', up=(1, 0, 0),
                    bev=0.005, step=0.7)
    for sy in (-1, 1):
        for (a, b) in (((-0.78, sy * 0.78, 0.15), (0.64, sy * 0.64, zp - 0.15)),
                       ((0.78, sy * 0.78, 0.15), (-0.64, sy * 0.64, zp - 0.15))):
            C.plank(P, 'brace', a, b, 0.04, 0.008, 'steel', up=(0, 1, 0), bev=0.001)
            C.plank(P, 'brace', (a[1], a[0], a[2]), (b[1], b[0], b[2]), 0.04, 0.008, 'steel', up=(1, 0, 0), bev=0.001)
    for sy in (-1, 1):
        C.block(P, 'bearer', (1.36, 0.08, 0.08), (0.0, sy * 0.6, zp - 0.04), 'steel', bev=0.004)
    for i in range(7):
        x = -0.66 + 0.22 * i
        C.block(P, 'plank', (0.2, 1.4, 0.035), (x, 0.0, zp + 0.0175), 'wood', bev=0.004)
    R = 0.66
    z0, z1 = zp + 0.04, 3.1
    P.lathe('tank', [(0.0, z0), (R, z0), (R + 0.01, z0 + 0.02), (R + 0.01, z1 - 0.02), (R, z1), (R * 0.5, z1 + 0.13),
                     (0.15, 3.18), (0.0, 3.18)], material='paint', segs=20, sharp=40.0)
    for z in (z0 + 0.25, (z0 + z1) / 2, z1 - 0.25):
        P.lathe('hoop', [(R + 0.01, z - 0.03), (R + 0.03, z - 0.03), (R + 0.03, z + 0.03), (R + 0.01, z + 0.03)],
                material='steel', segs=20, loop=True, sharp=50.0)
    P.cyl('manhole', 0.18, 0.08, (0.12, 0.0, 3.2), 'steel', segs=14, bev=0.01, bsegs=1)
    P.cyl('vent', 0.03, 0.12, (-0.25, 0.1, 3.2), 'steel', segs=8, bev=None)
    P.cyl('vent_cap', 0.06, 0.03, (-0.25, 0.1, 3.27), 'steel', segs=8, r2=0.03, bev=None)
    # the outlet pipe down to a tap, the ladder
    P.tube('outlet', [(0.3, 0.45, z0 + 0.1), (0.58, 0.58, z0 + 0.05), (0.66, 0.66, zp - 0.2), (0.74, 0.74, 0.9)],
           0.025, 'steel', segs=8, bend=0.06)
    P.cyl('tap', 0.04, 0.08, (0.75, 0.75, 0.86), 'steel', segs=8, bev=0.005, bsegs=1)
    C.block(P, 'tap_handle', (0.12, 0.02, 0.02), (0.75, 0.75, 0.92), 'paint_b', rot=(0, 0, 45), bev=0.004)
    for sy in (-1, 1):
        C.plank(P, 'ladder', (0.84, sy * 0.2, 0.0), (0.7, sy * 0.2, zp + 0.9), 0.04, 0.04, 'steel', up=(1, 0, 0),
                bev=0.003, step=0.8)
    for k in range(9):
        z = 0.25 + 0.3 * k
        x = 0.84 - 0.14 * z / (zp + 0.9)
        C.block(P, 'rung', (0.03, 0.4, 0.03), (x, 0.0, z), 'steel', bev=None)
    P.ao_distance = 0.2
    P.views = [('a', 30, 18), ('b', 210, 24)]


# ------------------------------------------------------------------------------------------------ the rest

def caravan(P):
    """
    An old touring caravan left at a camp (4.2 x 2.1 x 2.4): the rounded body (paint_b) with its waist stripe and
    skirt (paint), the sloped front window, side and back windows (glass_dark) in aluminium frames, the door on +X
    with its window and step (M_door outside it), a roof vent and a skylight; under it the chassis rails, the axle
    with two wheels in their arches (one tyre flat), the A-frame drawbar on +Y with the coupling, the jockey wheel
    and a gas bottle, corner steadies wound down.
    """
    y0, y1 = -2.1, 1.12                              # the body's back and front
    zb, zt = 0.5, 2.38
    hx = 1.02

    def sec(y):
        # the section at y: half-width, bottom, top, the top corners' radius
        f = max(0.0, (y - 0.45) / (y1 - 0.45))
        b = max(0.0, (y0 + 0.12 - y) / 0.12)
        top = zt - 0.38 * f ** 1.6 - 0.05 * b
        return hx - 0.06 * f ** 2 - 0.03 * b, zb + 0.03 * f, top, 0.26 + 0.25 * f

    def section(w, z0, z1, r, rb=0.08):
        # counter-clockwise (x, z): the bottom, up the +X side through the stripe's edges, round the top, down -X
        zs = [z for z in (0.62, 1.02, 1.2, 1.45) if z0 + rb < z < z1 - r]
        pts = [(w - rb + rb * math.cos(a), z0 + rb + rb * math.sin(a)) for a in (-math.pi / 2, -math.pi / 4)]
        pts += [(w, z0 + rb)] + [(w, z) for z in zs] + [(w, z1 - r)]
        pts += [(w - r + r * math.cos(a), z1 - r + r * math.sin(a)) for a in [math.pi / 2 * k / 4 for k in range(1, 5)]]
        right = pts
        left = [(-x, z) for (x, z) in reversed(right)]
        return right + left[1:-1] if abs(right[0][0]) < 1e-9 else right + left

    ys = [y0, y0 + 0.05, y0 + 0.12, -1.4, -0.7, 0.0, 0.45, 0.7, 0.88, 1.0, 1.08, y1]
    rings = []
    for y in ys:
        w, z0, z1, r = sec(y)
        rings.append([(px, y, pz) for (px, pz) in section(w, z0, z1, r)])
    bm = bmesh.new()
    vr, faces = K.bm_loft(bm, rings, cap_start=True, cap_end=True)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    for f in bm.faces:
        c = f.calc_center_median()
        f.material_index = 1 if (1.02 < c.z < 1.2 or c.z < 0.62) and abs(f.normal.z) < 0.7 and len(f.verts) == 4 \
            else 0
    body = P.mesh('body', bm, ['paint_b', 'paint'], sharp=40.0)
    ya = -0.35
    arch = bmesh.new()
    K.bm_cyl(arch, 0.37, 0.4, segs=16, matrix=Matrix.Translation((hx, ya, 0.3)) @ K.axis_matrix('X'))
    K.bm_cyl(arch, 0.37, 0.4, segs=16, matrix=Matrix.Translation((-hx, ya, 0.3)) @ K.axis_matrix('X'))
    P.cut(body, arch)
    # the windows
    def window(c, w, h, normal, up=(0, 0, 1)):
        C.patch(P, 'win_frame', w + 0.05, h + 0.05, c, normal, 'alu', up=up, t=0.012)
        C.patch(P, 'window', w, h, V(c) + V(normal).normalized() * 0.01, normal, 'glass_dark', up=up, t=0.006)
    for sx in (-1, 1):
        for (yc, w) in ((-1.35, 0.8), (-0.05 if sx < 0 else -0.62, 0.6 if sx < 0 else 0.4)):
            window((sx * hx, yc, 1.62), w, 0.48, (sx, 0, 0))
    window((0.0, y0, 1.6), 1.1, 0.45, (0, -1, 0))
    fy, fz = 0.96, 1.85
    nrm = V((0.0, 0.6, 0.8)).normalized()
    window((0.0, fy + 0.07, fz - 0.02), 1.3, 0.34, tuple(nrm), up=(0, -0.8, 0.6))
    # the door (+X) and its step
    dy0, dy1 = -0.12, 0.42
    C.patch(P, 'door', dy1 - dy0, 1.62, (hx, (dy0 + dy1) / 2, zb + 0.06 + 0.81), (1, 0, 0), 'paint_b', t=0.016)
    C.patch(P, 'door_window', 0.32, 0.36, (hx + 0.016, (dy0 + dy1) / 2, 1.72), (1, 0, 0), 'glass_dark', t=0.006)
    C.block(P, 'door_handle', (0.03, 0.12, 0.025), (hx + 0.035, dy0 + 0.08, 1.15), 'chrome', bev=0.006)
    C.block(P, 'step', (0.12, 0.5, 0.03), (hx - 0.02, (dy0 + dy1) / 2, 0.32), 'steel', bev=0.005)
    C.block(P, 'step_bracket', (0.12, 0.04, 0.12), (hx - 0.06, (dy0 + dy1) / 2, 0.38), 'steel', bev=0.003)
    C.marker(P, 'M_door', (hx + 0.06, (dy0 + dy1) / 2, 0.0))
    # the roof vent and skylight
    C.block(P, 'roof_vent', (0.4, 0.4, 0.08), (0.0, -1.2, zt + 0.02), 'paint_b', bev=0.02, segs=2)
    C.block(P, 'skylight', (0.5, 0.5, 0.05), (0.0, -0.2, zt - 0.005), 'glass_dark', bev=0.015, segs=1)
    # the chassis: rails, the A-frame and coupling, the jockey wheel, the gas bottle, steadies
    for sx in (-1, 1):
        C.block(P, 'rail', (0.06, y1 - y0 - 0.2, 0.12), (sx * 0.62, (y0 + y1) / 2, zb - 0.06), 'steel', bev=0.004,
                step=0.8, axes=(1,))
        C.plank(P, 'drawbar', (sx * 0.62, y1 - 0.05, zb - 0.06), (sx * 0.05, 2.0, 0.42), 0.1, 0.07, 'steel',
                up=(0, 0, 1), bev=0.005)
    P.cyl('coupling', 0.05, 0.16, (0.0, 2.02, 0.42), 'steel', axis='Y', segs=10, bev=0.01, bsegs=1)
    C.block(P, 'coupling_head', (0.12, 0.08, 0.1), (0.0, 2.04, 0.45), 'steel', bev=0.02, segs=1)
    P.cyl('jockey_post', 0.03, 0.4, (0.0, 1.75, 0.3), 'steel', segs=8, bev=None)
    P.cyl('jockey_wheel', 0.08, 0.05, (0.0, 1.75, 0.08), 'rubber', axis='X', segs=12, bev=0.01, bsegs=1)
    P.cyl('jockey_crank', 0.04, 0.03, (0.0, 1.75, 0.52), 'steel', segs=8, bev=None)
    P.lathe('gas_bottle', [(0.0, 0.0), (0.14, 0.0), (0.15, 0.04), (0.15, 0.4), (0.1, 0.48), (0.04, 0.5), (0.0, 0.5)],
            loc=(0.0, 1.45, 0.45), material='paint', segs=12, sharp=45.0)
    for sx in (-1, 1):
        for y in (y0 + 0.2, y1 - 0.15):
            C.plank(P, 'steady', (sx * 0.62, y, zb - 0.12), (sx * 0.72, y, 0.0), 0.04, 0.04, 'steel', up=(0, 1, 0),
                    bev=0.003)
            C.block(P, 'steady_foot', (0.1, 0.08, 0.02), (sx * 0.73, y, 0.01), 'steel', bev=0.003)
    # the axle and the wheels in their arches, one tyre flat
    P.cyl('axle', 0.04, 1.6, (0.0, ya, 0.3), 'steel', axis='X', segs=8, bev=None)
    for sx in (-1, 1):
        bm = bmesh.new()
        K.bm_lathe(bm, C.tyre_prof(0.3, 0.16, 0.2), segs=20, matrix=Matrix.Translation((sx * 0.9, ya, 0.3)) @
                   K.axis_matrix('X'), loop=True)
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
        if sx < 0:
            for v in bm.verts:
                if v.co.z < 0.08:
                    v.co.z = 0.08 + (v.co.z - 0.08) * 0.25
                    v.co.x = sx * 0.9 + (v.co.x - sx * 0.9) * 1.25
        P.mesh('tyre', bm, 'rubber', sharp=40.0)
        P.cyl('hub', 0.16, 0.12, (sx * 0.9, ya, 0.3), 'steel', axis='X', segs=14, bev=0.01, bsegs=1)
        P.cyl('hubcap', 0.06, 0.13, (sx * 0.9, ya, 0.3), 'chrome', axis='X', segs=10, bev=0.008, bsegs=1)
    P.ao_distance = 0.3
    P.views = [('a', 40, 14), ('b', 220, 18)]


def wire(bm, a, b, r=0.0035):
    """A thin square wire from a to b into bm."""
    a, b = V(a), V(b)
    L = (b - a).length
    K.bm_cube(bm, (r * 2, r * 2, L), Matrix.Translation((a + b) / 2) @ K.frame_from_z(b - a))


def trolley(P):
    """
    A shopping trolley left outside the shop (1.0 x 0.6 x 1.0): the wire basket narrowing to its floor, its rims,
    the handle with its plastic grip (paint) at -Y, the chassis frame down to four castors, the wire tray under it.
    """
    bm = bmesh.new()
    yt0, yt1, xt, zt = -0.42, 0.45, 0.27, 0.95       # the top rim
    yb0, yb1, xb_, zb = -0.32, 0.38, 0.2, 0.5        # the floor
    top = [(xt, yt0), (xt, yt1), (-xt, yt1), (-xt, yt0)]
    bot = [(xb_, yb0), (xb_, yb1), (-xb_, yb1), (-xb_, yb0)]
    P.tube('rim', [V((x, y, zt)) for (x, y) in top] + [V((top[0][0], top[0][1], zt))], 0.008, 'chrome', segs=6,
           bend=0.02)
    P.tube('floor_rim', [V((x, y, zb)) for (x, y) in bot] + [V((bot[0][0], bot[0][1], zb))], 0.006, 'chrome',
           segs=6, bend=0.02)
    for k in range(4):
        (ax, ay), (bx, by) = top[k], top[(k + 1) % 4]
        (cx, cy), (dx, dy) = bot[k], bot[(k + 1) % 4]
        n = max(4, int(math.hypot(bx - ax, by - ay) / 0.055))
        for i in range(1, n):
            t = i / n
            wire(bm, (cx + (dx - cx) * t, cy + (dy - cy) * t, zb), (ax + (bx - ax) * t, ay + (by - ay) * t, zt))
        for z in (0.65, 0.8):
            u = (z - zb) / (zt - zb)
            p0 = (cx + (ax - cx) * u, cy + (ay - cy) * u, z)
            p1 = (dx + (bx - dx) * u, dy + (by - dy) * u, z)
            wire(bm, p0, p1)
    for i in range(1, 8):
        y = yb0 + (yb1 - yb0) * i / 8
        wire(bm, (-xb_, y, zb), (xb_, y, zb))
    for i in range(1, 5):
        x = -xb_ + 2 * xb_ * i / 5
        wire(bm, (x, yb0, zb), (x, yb1, zb))
    P.mesh('wires', bm, 'chrome', sharp=50.0)
    # the chassis: the side tubes from the handle down to the rear castors, the base U to the front ones, the tray
    for sx in (-1, 1):
        P.tube('frame', [(sx * 0.27, -0.52, 0.98), (sx * 0.25, -0.43, 0.6), (sx * 0.22, -0.38, 0.14),
                         (sx * 0.2, 0.38, 0.14)], 0.012, 'steel', segs=8, bend=0.05)
    P.tube('frame_front', [(-0.2, 0.38, 0.14), (0.2, 0.38, 0.14)], 0.012, 'steel', segs=8)
    bm = bmesh.new()
    for i in range(7):
        y = -0.3 + 0.1 * i
        wire(bm, (-0.2, y, 0.2), (0.2, y, 0.2))
    for x in (-0.2, 0.0, 0.2):
        wire(bm, (x, -0.33, 0.2), (x, 0.33, 0.2))
    P.mesh('tray', bm, 'chrome', sharp=50.0)
    for sx in (-1, 1):
        C.plank(P, 'tray_post', (sx * 0.2, -0.36, 0.14), (sx * 0.2, -0.36, 0.5), 0.016, 0.016, 'steel', up=(1, 0, 0),
                bev=None)
    P.tube('handle', [(-0.29, -0.53, 0.98), (0.29, -0.53, 0.98)], 0.012, 'steel', segs=8)
    P.cyl('grip', 0.018, 0.5, (0.0, -0.53, 0.98), 'paint', axis='X', segs=10, bev=0.004, bsegs=1)
    # the castors
    for (x, y) in ((-0.22, -0.38), (0.22, -0.38), (-0.2, 0.38), (0.2, 0.38)):
        P.cyl('swivel', 0.02, 0.02, (x, y, 0.125), 'steel', segs=8, bev=None)
        C.block(P, 'fork', (0.06, 0.03, 0.07), (x, y - 0.012, 0.08), 'steel', bev=0.004)
        P.cyl('wheel', 0.055, 0.03, (x, y - 0.02, 0.055), 'rubber', axis='X', segs=12, bev=0.005, bsegs=1)
    P.views = [('a', 35, 20), ('b', 215, 22)]


def place_board(P):
    """
    The board every place has by the road (1.3 x 0.12 x 2.5): two posts leaning a little, the board up on them in
    its frame (paint_b), both faces plain paint for the game's pictogram (M_board / M_board_b at their middles).
    """
    hw = 0.65
    zb0, zb1 = 1.36, 2.46
    for sy in (-1, 1):
        C.plank(P, 'post', (0.0, sy * 0.585, 0.0), (0.0, sy * 0.585 - 0.01 * sy, zb1 - 0.02), 0.09, 0.12, 'wood',
                up=(1, 0, 0), bev=0.008, step=0.6)
    fr = 0.06
    for z in (zb0 + fr / 2, zb1 - fr / 2):
        C.block(P, 'frame', (0.06, 2 * hw, fr), (0.0, 0.0, z), 'paint_b', bev=0.01, segs=2)
    for sy in (-1, 1):
        C.block(P, 'frame', (0.06, fr, zb1 - zb0 - 2 * fr), (0.0, sy * (hw - fr / 2), (zb0 + zb1) / 2), 'paint_b',
                bev=0.01, segs=2)
    C.block(P, 'face', (0.04, 2 * hw - 2 * fr + 0.01, zb1 - zb0 - 2 * fr + 0.01), (0.0, 0.0, (zb0 + zb1) / 2), 'paint',
            bev=0.004, step=0.35, axes=(1, 2))
    for sx in (-1, 1):
        C.marker(P, 'M_board' if sx > 0 else 'M_board_b', (sx * 0.02, 0.0, (zb0 + zb1) / 2), up=(sx, 0, 0))
    P.views = [('a', 30, 10), ('b', 150, 10)]


def fish_bm(bm, c, ln, lean=0.0):
    """A fish hung up by its tail at c (its body down), flat in the plane X = c.x, into bm."""
    out = [(0.0, 0.0), (0.03, -0.02), (0.012, -0.06), (0.045, -ln * 0.45), (0.03, -ln * 0.85), (0.0, -ln),
           (-0.03, -ln * 0.85), (-0.045, -ln * 0.45), (-0.012, -0.06), (-0.03, -0.02)]
    poly = C.ccw([(y, z) for (y, z) in out])
    m = Matrix.Translation(V(c)) @ Matrix.Rotation(math.radians(lean), 4, 'X') @ mat4((0, 0, 0), (0, 90, 0))
    K.bm_prism(bm, [(-z, y) for (y, z) in poly], 0.022, matrix=m)


def rack_dry(P, H=1.9, hang=True):
    """
    A drying rack of poles (2.4 long; at a jetty 1.9 high with fish hung on it by their tails and a net over it; at a
    hide, rack_dry_t, 2.3 high and bare, a rope and a gambrel hook left on it): two A-frames lashed at the top, the
    pole across them.
    """
    hy = 1.2
    sp = 0.2
    for sy in (-1, 1):
        y = sy * (hy - 0.1)
        top = V((0.0, y, H - 0.08))
        for sx in (-1, 1):
            C.post(P, 'leg', (sx * sp, y, 0.0), tuple(top + V((-sx * 0.04, 0, 0.06))), 0.035, 'wood', segs=7, bev=None)
        P.torus('lashing', 0.045, 0.012, loc=tuple(top), axis='Y', segs=10, rsegs=4, material='fabric')
        C.post(P, 'brace', (-sp * 0.6, y, 0.55), (sp * 0.6, y, 0.55), 0.022, 'wood', segs=6, bev=None)
    C.post(P, 'pole', (0.0, -hy, H - 0.04), (0.0, hy, H - 0.04), 0.04, 'wood', segs=8, bev=None)
    if hang:
        bm = bmesh.new()
        for k in range(7):
            y = -0.85 + 0.25 * k
            if k == 4:
                continue
            ln = 0.3 + 0.08 * (C.jit(k, 1.0) + 0.5)
            fish_bm(bm, (0.0, y, H - 0.1), ln, lean=6 * C.jit(k, 2.0))
            K.bm_cube(bm, (0.006, 0.006, 0.07), mat4((0.0, y, H - 0.075)))
        P.mesh('fish', bm, 'paint_b', bev=0.004, segs=1)

        def net(u, v):
            y = 0.45 + 0.65 * u
            s = 2 * v - 1
            z = H - 0.04 - 0.85 * abs(s) ** 1.3 - 0.06 * math.sin(math.pi * u)
            return (s * 0.07 + 0.02 * math.sin(11 * u), y, z)
        P.mesh('net', junk.grid_sheet(8, 6, net, 0.006), 'fabric', sharp=60.0)
    else:
        P.tube('rope', [(0.0, 0.3, H - 0.04), (0.0, 0.31, H - 0.6), (0.01, 0.33, H - 0.95)], 0.009, 'fabric', segs=5,
               bend=0.05)
        C.post(P, 'gambrel', (0.0, 0.03, H - 0.98), (0.0, 0.63, H - 0.98), 0.012, 'steel', segs=6, bev=None)
        for y in (0.03, 0.63):
            P.tube('hook', [(0.0, y, H - 0.98), (0.0, y, H - 1.08), (0.02, y, H - 1.12), (0.04, y, H - 1.08)], 0.008,
                   'steel', segs=5, bend=0.02)
        P.torus('rope_coil', 0.1, 0.012, loc=(0.0, -0.6, H - 0.15), axis='Y', segs=14, rsegs=4, material='fabric')
    P.views = [('a', 30, 10), ('b', 210, 14)]


def icehole(P):
    """The hole an angler cut in the ice in his hut (0.6 across, 2 cm): the black water (glass_dark) in its ragged
    rim of slush and chips (ceramic), a few chunks pushed aside."""
    P.cyl('water', 0.21, 0.004, (0.0, 0.0, 0.002), 'glass_dark', segs=16, bev=None)
    n = 18
    inner = [(0.2 + 0.025 * math.sin(3.1 * k + 0.7) * math.cos(1.7 * k), TAU * k / n) for k in range(n)]
    bm = bmesh.new()
    vi = [bm.verts.new((r * math.cos(a), r * math.sin(a), 0.014 + 0.004 * math.sin(2.3 * k))) for k, (r, a) in
          enumerate(inner)]
    vo = [bm.verts.new(((0.27 + 0.02 * math.sin(1.9 * k)) * math.cos(a), (0.27 + 0.02 * math.sin(1.9 * k)) *
                        math.sin(a), 0.0)) for k, (r, a) in enumerate(inner)]
    vb = [bm.verts.new((r * math.cos(a), r * math.sin(a), 0.0)) for (r, a) in inner]
    for k in range(n):
        j = (k + 1) % n
        bm.faces.new((vi[k], vi[j], vo[j], vo[k]))
        bm.faces.new((vb[k], vb[j], vi[j], vi[k]))
    bm.faces.new(vo[::-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    for f in bm.faces:
        if len(f.verts) > 4:
            bm.faces.remove(f)
            break
    P.mesh('slush', bm, 'ceramic', sharp=40.0)
    bm = bmesh.new()
    for k, (x, y, sx, sy, a) in enumerate(((0.26, 0.05, 0.06, 0.05, 20), (-0.2, 0.2, 0.05, 0.04, 70),
                                           (0.05, -0.27, 0.07, 0.04, -15), (-0.25, -0.12, 0.04, 0.035, 40))):
        K.bm_cube(bm, (sx, sy, 0.016), mat4((x, y, 0.008), (6 * C.jit(k, 1.0), 6 * C.jit(k, 2.0), a)))
    P.mesh('chips', bm, 'ceramic', bev=0.004, segs=1)
    P.views = [('a', 30, 50), ('b', 210, 60)]


# ------------------------------------------------------------------------------------------------ the table

SPECS = {
    'canopy': spec(canopy, (11.0, 7.0, 4.6), 'big', args=(11.0, 7.0, 4.6), front=False,
                   markers=tuple(f'M_lamp_{k}' for k in range(1, 7)) + ('M_pump_1', 'M_pump_2'),
                   colours=(0xc9623f, 0xece8dc), ao=0.4),
    'canopy_s': spec(canopy, (9.5, 6.0, 4.6), 'big', args=(9.5, 6.0, 4.6), front=False,
                     markers=tuple(f'M_lamp_{k}' for k in range(1, 7)) + ('M_pump_1', 'M_pump_2'),
                     colours=(0x4f7f8a, 0xece8dc), ao=0.4),
    'pump': spec(pump, (0.9, 0.55, 1.5), movers=dict(NOZZLE=free(), HOSE=free()),
                 markers=('M_display', 'M_nozzle', 'M_hose', 'M_top'), colours=(0xc9623f, 0xece8dc), ao=0.08),
    'signpole': spec(signpole, (2.6, 0.3, 8.4), 'big', args=(2.6, 8.4, 1.9), front=False,
                     markers=('M_board', 'M_board_b'), colours=(0xc9503c, 0xece8dc), ao=0.2),
    'signpole_m': spec(signpole, (2.2, 0.3, 6.2), 'big', args=(2.2, 6.2, 1.6), front=False,
                       markers=('M_board', 'M_board_b'), colours=(0x4a7fa8, 0xece8dc), ao=0.2),
    'signpole_s': spec(signpole, (2.2, 0.3, 5.4), 'big', args=(2.2, 5.4, 1.6), front=False,
                       markers=('M_board', 'M_board_b'), colours=(0x4f7f8a, 0xece8dc), ao=0.2),
    'lid': spec(tank_lid, (0.9, 0.9, 0.04), 'small', movers=dict(LID=lid(100)), markers=('M_inside',), front=False,
                colours=(0x6d8463, 0xe6dccb), ao=0.03),
    'drum': spec(drum, (0.6, 0.6, 0.88), 'small', colours=(0x3f6f8a, 0xe6dccb), ao=0.08, front=False),
    'tyres': spec(tyres, (0.8, 0.8, 0.85), args=(4, 0.85), front=False, ao=0.1),
    'tyres_low': spec(tyres, (0.8, 0.8, 0.62), args=(3, 0.62), front=False, ao=0.1),
    'crate': spec(crate, (0.9, 0.7, 0.7), 'small', movers=dict(LID=lid(105)), markers=('M_inside',),
                  colours=(0xc9503c, 0xe6dccb), ao=0.08),
    'table': spec(picnic_table, (1.8, 1.6, 0.75), front=False, markers=('M_top',), ao=0.1),
    'bench': spec(bench, (1.6, 0.45, 0.45), args=(True,), bounds=(1.6, 0.56, 0.85), centre=(-0.022, 0.0),
                  colours=(0x3e5a48, 0xe6dccb), ao=0.08, note='its back and arms rise over the seat'),
    'bench_plain': spec(bench, (1.6, 0.45, 0.45), 'small', args=(False,), ao=0.08),
    'woodpile': spec(woodpile, (2.4, 0.7, 1.1), args=(2.4, 1.1), ao=0.12),
    'woodpile_s': spec(woodpile, (2.2, 0.7, 1.0), args=(2.2, 1.0), ao=0.12),
    'line': spec(washing_line, (5.2, 0.1, 1.9), 'small', front=False, colours=(0xd98a7a, 0x8fb7c4), ao=0.08),
    'patch': spec(veg_patch, (4.2, 2.4, 0.25), bounds=(4.2, 2.4, 0.43), front=False, colours=(0x6f9a3c, 0xd9823c),
                  ao=0.1, note='what grows in it rises over its edge'),
    'mailbox': spec(mailbox, (0.3, 0.45, 1.15), 'small', colours=(0x4f7f8a, 0xc9503c), ao=0.06),
    'trough': spec(trough, (1.6, 0.5, 0.55), 'small', front=False, ao=0.08),
    'fence': spec(fence, (2.0, 0.1, 1.0), 'small', args=(False,), bounds=(2.05, 0.1, 1.0), centre=(0.0, -0.025), front=False,
                  ao=0.08, note='the post at y = -1, the rails run to +1: repeat every 2 m'),
    'fence_b': spec(fence, (2.0, 0.1, 1.0), 'small', args=(True,), bounds=(2.05, 0.1, 1.0), centre=(0.0, -0.025), front=False,
                    ao=0.08, note='the middle rail broken'),
    'fence_post': spec(fence, (0.1, 0.1, 1.0), 'small', args=(False, True), front=False, ao=0.08),
    'shelter': spec(shelter, (5.2, 3.2, 2.6), 'big', colours=(0x8a6a48, 0xece8dc), ao=0.3),
    'firering': spec(firering, (1.4, 1.4, 0.25), 'small', front=False, colours=(0x8d8a82, 0x6f6a62), ao=0.08,
                     fit=True),
    'log': spec(sitting_log, (1.5, 0.35, 0.35), 'small', front=False, ao=0.08, fit=True),
    'tent': spec(tent, (2.6, 2.0, 1.4), front=False, colours=(0xd98a3c, 0x6f9a8a), ao=0.15, fit=True),
    'bag': spec(game_bag, (0.5, 0.4, 0.45), 'small', front=False, colours=(0x7a7a4a, 0x5a3a2b), ao=0.06, fit=True),
    'tacklebox': spec(tacklebox, (0.5, 0.3, 0.3), 'small', movers=dict(LID=lid(110)), markers=('M_inside',),
                      colours=(0x5f8a6a, 0xe0a23c), ao=0.04),
    'boat': spec(boat, (3.4, 1.3, 0.55), front=False, colours=(0x5f9a94, 0xe6dccb), ao=0.12, fit=True),
    'jetty_deck': spec(jetty_deck, (2.0, 1.8, 0.25), 'small', args=('plain',), bounds=(2.0, 1.8, 1.75), z0=-1.5, front=False,
                       ao=0.1, note='the deck top at 0.25, its posts down to -1.5; repeat every 2 m'),
    'jetty_deck_b': spec(jetty_deck, (2.0, 1.8, 0.25), 'small', args=('broken',), bounds=(2.0, 1.8, 1.75), z0=-1.5,
                         front=False, ao=0.1, note='a board gone, another split'),
    'jetty_end': spec(jetty_deck, (2.0, 1.8, 0.25), args=('end',), bounds=(2.085, 1.8, 2.6), z0=-1.5, front=False,
                      centre=(0.0, 0.025),
                      ao=0.1, note='the last module: mooring posts and a ladder (+Y end)'),
    'stand': spec(stand, (2.6, 2.6, 2.4), 'big', bounds=(2.6, 5.24, 4.46), centre=(1.32, 0.0), markers=('M_top',),
                  colours=(0x8a6a48, 0xe6dccb), ao=0.25,
                  note='the deck at 2.4; its stairs run 2.5 m out in front (+X), as the places lay the steps'),
    'scope': spec(scope, (0.3, 0.3, 1.5), 'small', markers=('M_eye',), colours=(0x4f7f8a, 0xe0a23c), ao=0.05),
    'rail': spec(guard_rail, (2.0, 0.1, 1.05), 'small', args=(False,), bounds=(2.05, 0.1, 1.05), centre=(0.0, -0.025),
                 front=False, colours=(0xd9d3c6, 0x5a6f8a), ao=0.06,
                 note='the post at y = -1, the rails run to +1: repeat every 2 m'),
    'rail_post': spec(guard_rail, (0.1, 0.1, 1.05), 'small', args=(True,), front=False, colours=(0xd9d3c6, 0x5a6f8a),
                      ao=0.06),
    'pipes': spec(pipes, (8.5, 1.5, 1.05), 'big', args=(8.5,), front=False, colours=(0x6aa79c, 0xe9e2cf), ao=0.3),
    'pipes_s': spec(pipes, (6.5, 1.5, 1.05), 'big', args=(6.5,), front=False, colours=(0x6aa79c, 0xe9e2cf), ao=0.3),
    'silo': spec(silo, (5.6, 5.6, 6.0), 'big', bounds=(5.34, 6.04, 6.0), centre=(0.35, 0.0), front=False,
                 colours=(0x6aa79c, 0xe9e2cf), ao=0.4, note='its ladder cage stands out on +X'),
    'tank': spec(tank, (1.7, 1.7, 3.3), front=False, colours=(0x8fa7a4, 0xc9503c), ao=0.2),
    'caravan': spec(caravan, (4.2, 2.1, 2.4), 'big', markers=('M_door',), colours=(0x4f8a86, 0xe9e2cf), ao=0.3),
    'trolley': spec(trolley, (1.0, 0.6, 1.0), front=False, colours=(0xc9503c, 0xe6dccb), ao=0.06, fit=True),
    'board': spec(place_board, (1.3, 0.12, 2.5), 'small', front=False, markers=('M_board', 'M_board_b'),
                  colours=(0x4f7f8a, 0xece8dc), ao=0.1),
    'rack_dry': spec(rack_dry, (2.4, 0.2, 1.9), 'small', args=(1.9, True), bounds=(2.4, 0.48, 1.9), front=False,
                     colours=(0x9a9a8a, 0xb9c3c6), ao=0.08, note='its A-frames splay 0.24 either side'),
    'rack_dry_t': spec(rack_dry, (2.4, 0.2, 2.3), 'small', args=(2.3, False), bounds=(2.4, 0.48, 2.3), front=False,
                       ao=0.08, note='its A-frames splay 0.24 either side'),
    'icehole': spec(icehole, (0.6, 0.6, 0.02), 'small', front=False, ao=0.02, fit=True),
    'barrel': spec(barrel, (0.62, 0.62, 0.9), 'small', movers=dict(LID=lift(0.3)), markers=('M_inside', 'M_top'),
                   front=False, colours=(0x2e5a8a, 0xe9e2cf), ao=0.08),
}

MODELS = C.table('outside', SPECS)


def main(args):
    C.run(MODELS, args)
