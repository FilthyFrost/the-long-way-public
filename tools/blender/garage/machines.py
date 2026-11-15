"""
The workshop's machines (docs/MODCAR.md section 9), second batch: the two-post lift, the tyre changer,
the compressor and the paint corner, the sink with its hose reel and bucket, the radio, the rolling tool
chest, the floor jack, axle stands and a creeper, the wall clock, the chalkboard, the calendar.

Same conventions as props.py: game frame, every function adds its solids, surfaces, spots and devices
to the layout L.
"""

import math

import bmesh
from mathutils import Matrix, Vector

from . import _kit as kit
from . import props as P
from . import shell as S

V = Vector


def tint_of(hex_rgb):
    """an sRGB hex colour as a linear tint for the 'tinted' materials"""
    r = ((hex_rgb >> 16) & 255) / 255.0
    g = ((hex_rgb >> 8) & 255) / 255.0
    b = (hex_rgb & 255) / 255.0
    lin = lambda c: c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4
    # (the material's own white is about 0.9 linear: divide it out)
    return (min(1.2, lin(r) / 0.9), min(1.2, lin(g) / 0.9), min(1.2, lin(b) / 0.9))


# ---------------------------------------------------------------------------------------------- the lift

def lift(K, L, xc, zc, span=2.9, name='lift'):
    """
    A two-post lift for a car standing with its nose to +x at (xc, zc): blue posts either side, a
    crossbar over the top, the carriages down with their arms swung in under the sills, the power unit
    on the left post, a floor plate between the posts.
    """
    top = 3.45
    pw, pd = 0.28, 0.34
    for s in (-1, 1):
        z = zc + s * (span / 2 + pw / 2)
        # the post: a box with a recessed track on the inner face
        K.box('p_blue', (xc, top / 2, z), (pd, top, pw), bev=0.012, seg=0.8)
        K.box('steel', (xc, top / 2, z - s * (pw / 2 + 0.004)), (0.12, top - 0.3, 0.012), bev=0.003, seg=0.8)
        # a ladder of safety locks up the track
        for k in range(14):
            K.box('steel', (xc, 0.5 + k * 0.2, z - s * (pw / 2 + 0.012)), (0.1, 0.03, 0.012), bev=0.002)
        # base plate and its anchor bolts
        K.box('steel', (xc, 0.012, z), (0.5, 0.024, 0.5), bev=0.006)
        for (dx, dz) in ((0.19, 0.19), (-0.19, 0.19), (0.19, -0.19), (-0.19, -0.19)):
            K.cyl('steel', (xc + dx, 0.035, z + dz), 0.018, 0.025, segs=6)
        # the carriage, down, with two arms each, swung in under where a car's sills would be (they move: LIFT)
        cy = 0.22
        K.mover('LIFT', (xc, 0.0, zc))
        K.box('p_blue', (xc, cy + 0.2, z - s * 0.24), (0.36, 0.5, 0.16), bev=0.012, mover='LIFT')
        for ax in (-1, 1):
            ang = math.radians(28 * ax)
            dx = math.sin(ang)
            dz = math.cos(ang)
            ln = 1.05
            x0, z0 = xc + ax * 0.12, z - s * 0.3
            x1, z1 = x0 + ax * abs(dx) * ln, z0 - s * dz * ln
            K.box('p_yellow', ((x0 + x1) / 2, cy + 0.04, (z0 + z1) / 2), (0.1, 0.07, ln), rot=(0, -math.degrees(ax * s * 0.49), 0), bev=0.008, mover='LIFT')
            K.cyl('rubber', (x1, cy + 0.11, z1), 0.07, 0.05, segs=14, bev=0.006, mover='LIFT')
            K.cyl('steel', (x1, cy + 0.07, z1), 0.035, 0.05, segs=10, mover='LIFT')
        # the chain/cable over the top
        K.box('steel', (xc, top - 0.18, z), (0.2, 0.12, 0.1), bev=0.01)
        solid_box = (xc, z, pd / 2 + 0.06, pw / 2 + 0.06)
        P.solid(L, *solid_box, 0, top)
    # the crossbar at the top and the line between the posts in it
    zl, zr = zc - span / 2 - pw / 2, zc + span / 2 + pw / 2
    K.box('p_blue', (xc, top + 0.06, zc), (0.2, 0.18, zr - zl + 0.1), bev=0.012, seg=0.8)
    K.box('rubber', (xc, top - 0.04, zc), (0.06, 0.03, span), bev=0.004)
    # the floor plate over the cables between the posts
    K.box('steel', (xc, 0.02, zc), (0.42, 0.04, span), bev=0.008, seg=0.8, taper=(0.86, 1.0))
    for k in range(int(span / 0.25)):
        K.box('steel', (xc, 0.041, zl + 0.3 + k * 0.25), (0.3, 0.004, 0.02), bev=0.0)
    # the power unit on the post by the wall: motor, oil tank, the lever
    pz = zr + 0.0
    xc_pu = xc + 0.3
    K.cyl('p_green', (xc_pu, 1.35, pz), 0.11, 0.32, segs=18, bev=0.01)
    K.box('p_cream', (xc_pu, 1.04, pz), (0.2, 0.3, 0.24), bev=0.012)
    K.box('p_black', (xc_pu + 0.103, 1.04, pz), (0.008, 0.08, 0.16), bev=0.0)
    K.tube('steel', [(xc_pu + 0.1, 1.08, pz - 0.06), (xc_pu + 0.22, 1.12, pz - 0.08)], 0.012, segs=8)
    K.cyl('p_red', (xc_pu + 0.23, 1.12, pz - 0.08), 0.028, 0.06, axis='x', segs=12)
    K.tube('p_black', [(xc_pu, 0.89, pz), (xc_pu - 0.1, 0.3, pz), (xc, 0.05, pz - 0.2), (xc, 0.05, zc)], 0.012, segs=6, bend=0.1)
    P.device(L, 'lift', xc_pu + 0.23, 1.12, pz - 0.08, 0.16)
    return (zl, zr)


# ---------------------------------------------------------------------------------------------- tyre changer

def tyre_changer(K, L, x, z, yaw_deg=0.0):
    """
    A tyre changer: a red cabinet with the turntable on top (four jaws), the column at the back with the
    swing arm and its mounting head, the bead breaker on the side, three pedals at the foot.
    """
    M = kit.mat4((x, 0, z), (0, yaw_deg, 0))

    def at(p):
        return tuple(M @ V(p))

    def box(mat, c, size, rot=(0, 0, 0), **kw):
        K.box(mat, (0, 0, 0), size, matrix=M @ Matrix.Translation(c) @ kit.rot3(rot).to_4x4(), **kw)

    def cyl(mat, c, r, h, axis='y', **kw):
        m = M @ Matrix.Translation(c) @ kit.axis_to(axis)
        K.cyl(mat, (0, 0, 0), r, h, matrix=m, **kw)

    h = 0.78
    box('p_red', (0, h / 2, 0), (0.62, h, 0.82), bev=0.02, seg=0.5)
    box('p_black', (0.312, 0.32, 0), (0.008, 0.36, 0.6), bev=0.0)
    # pedals
    for k, dz in enumerate((-0.18, 0.0, 0.18)):
        box('steel', (0.38, 0.05, dz), (0.16, 0.03, 0.09), bev=0.006)
    # the turntable: a disc and four sliding jaws
    tt = h + 0.03
    K.mover('TC_TABLE', at((0, tt, -0.05)))
    cyl('steel', (0, tt, -0.05), 0.3, 0.04, segs=32, bev=0.006, mover='TC_TABLE')
    for k in range(4):
        a = k * math.pi / 2 + math.pi / 4
        c = (math.cos(a) * 0.22, tt + 0.04, -0.05 + math.sin(a) * 0.22)
        box('alu', c, (0.09, 0.05, 0.06), bev=0.006, mover='TC_TABLE')
    cyl('steel', (0, tt + 0.06, -0.05), 0.04, 0.12, segs=14, mover='TC_TABLE')
    # the column at the back, the swing arm over the table, the head
    box('p_red', (-0.26, h + 0.5, -0.05), (0.14, 1.0, 0.14), bev=0.012)
    box('p_red', (-0.12, h + 0.98, -0.05), (0.42, 0.11, 0.11), bev=0.01)
    box('steel', (0.02, h + 0.65, -0.05), (0.05, 0.62, 0.05), bev=0.006)
    box('p_black', (0.02, h + 0.33, -0.05), (0.08, 0.08, 0.08), bev=0.01)
    # the bead breaker: a long arm on the side with its blade, and the air cylinder behind
    box('steel', (-0.05, 0.6, 0.47), (0.08, 0.08, 0.12), bev=0.008)
    K.tube('steel', [at((-0.25, 0.55, 0.47)), at((0.15, 0.85, 0.47)), at((0.3, 0.95, 0.47))], 0.022, segs=8)
    box('steel', (0.18, 0.55, 0.47), (0.04, 0.22, 0.12), bev=0.006)
    cyl('steel', (-0.28, 0.45, 0.43), 0.06, 0.3, axis='x', segs=14, bev=0.006)
    # an air gauge and its hose
    cyl('p_cream', (-0.2, h + 1.0, 0.04), 0.04, 0.02, axis='z', segs=16)
    cyl('glass', (-0.2, h + 1.0, 0.052), 0.034, 0.004, axis='z', segs=16)
    K.tube('p_black', [at((-0.2, h + 0.96, 0.05)), at((-0.15, h + 0.6, 0.3)), at((-0.1, 0.3, 0.42)), at((0.1, 0.02, 0.6))], 0.009, segs=6, bend=0.12)
    c = at((0, 0, 0))
    P.solid(L, c[0], c[2], 0.36, 0.45, 0, h + 0.05, yaw=-math.radians(yaw_deg))
    t = at((0, tt + 0.04, -0.05))
    P.surface(L, t[0] - 0.3, t[0] + 0.3, t[2] - 0.3, t[2] + 0.3, tt + 0.04, 'tyrechanger')
    P.spot(L, t[0], tt + 0.04, t[2], 0.0, 'tyrechanger')
    g = at((-0.2, h + 1.0, 0.06))
    P.device(L, 'tyrechanger', g[0], g[1], g[2], 0.2)
    return t


# ---------------------------------------------------------------------------------------------- paint corner

def paint_corner(K, L):
    """
    The back left corner where things are painted: a tarp hung from a pipe rail (one side drawn back),
    a rack of spray cans on the wall, the compressor, the spray gun on its hook, overspray in all colours
    on the boards and the floor, tins and a stool.
    """
    x0, x1 = S.X0, -4.75
    z0, z1 = S.Z0, -2.35
    rail_y = 2.62
    # the pipe rail on brackets, two sides of the corner
    K.tube('galv', [(x1, rail_y, z0 + 0.1), (x1, rail_y, z1), (x0 + 0.1, rail_y, z1)], 0.022, segs=10, bend=0.12)
    for p in ((x1, z0 + 0.1), (x0 + 0.1, z1)):
        K.tube('galv', [(p[0], rail_y, p[1]), (p[0], S.EAVE - 0.1, p[1])], 0.012, segs=6)
    # the tarps: canvas hanging in folds; the front one drawn back to the wall
    tarp(K, (x1, z0 + 0.15), (x1, z0 + 1.1), rail_y, 0.08, folds=5)
    tarp(K, (x0 + 0.15, z1), (x1 - 0.05, z1), rail_y, 0.08, folds=9, gap=(-6.0, -5.2))
    # the rack of spray cans on the back wall: three shelves
    rx = x0 + 0.13
    for k, y in enumerate((1.05, 1.42, 1.79)):
        K.box('wood', (rx, y - 0.015, -4.0), (0.16, 0.03, 1.15), bev=0.004, tint=P.wood(K))
        K.box('wood', (rx + 0.075, y + 0.02, -4.0), (0.012, 0.04, 1.15), bev=0.002, tint=P.wood(K))
        for i in range(10):
            col = K.pick([0xc8323a, 0x3e8e87, 0xf0c23c, 0x2e4a6b, 0xe07b39, 0x557a46, 0xf4efe2, 0x6b4a73, 0x7fb3d5, 0x2f3236, 0xe8a3a8, 0xd4a53b])
            zz = -4.52 + i * 0.115 + K.jitter(0.01)
            hh = 0.19 + K.jitter(0.01)
            K.cyl('tinted', (rx, y + hh / 2, zz), 0.032, hh, segs=12, bev=0.003, tint=tint_of(col))
            K.cyl('chrome', (rx, y + hh + 0.012, zz), 0.022, 0.024, segs=10)
            K.cyl('tinted', (rx, y + hh + 0.028, zz), 0.03, 0.015, segs=10, tint=tint_of(col))
    for (yb,) in ((1.0,), (1.85,)):
        K.box('wood_dark', (rx - 0.07, yb, -4.0), (0.02, 0.05, 1.2), bev=0.004)
    # overspray: soft blots of every colour on the boards behind and on the floor
    rng = K.rng
    for i in range(26):
        col = K.pick([0xc8323a, 0x3e8e87, 0xf0c23c, 0x2e4a6b, 0xe07b39, 0x557a46, 0x6b4a73, 0x7fb3d5])
        if i < 14:
            # on the back wall, round where things were sprayed
            c = V((x0 + 0.03 + 0.002 * i, 0.5 + rng.random() * 1.6, -4.85 + rng.random() * 2.3))
            blot(K, c, V((1, 0, 0)), 0.06 + rng.random() * 0.22, tint_of(col))
        elif i < 20:
            c = V((x0 + 0.3 + rng.random() * 2.0, 0.003 + 0.0005 * i, z0 + 0.25 + rng.random() * 0.4))
            c.z = z0 + 0.06 + 0.002 * i
            c.y = 0.4 + rng.random() * 1.2
            blot(K, c, V((0, 0, 1)), 0.05 + rng.random() * 0.18, tint_of(col))
        else:
            c = V((x0 + 0.4 + rng.random() * 1.9, 0.004 + 0.0004 * i, z0 + 0.5 + rng.random() * 2.0))
            blot(K, c, V((0, 1, 0)), 0.1 + rng.random() * 0.35, tint_of(col))
    # the compressor: a red tank on wheels, the motor and the belt guard on top, a coil of yellow hose
    cx, cz = -6.25, -4.4
    K.cyl('p_red', (cx, 0.3, cz), 0.2, 0.75, axis='x', segs=24, bev=0.01, rings=2)
    for sx in (-1, 1):
        K.lathe('p_red', (cx + sx * 0.375, 0.3, cz), [(0.2, 0.0), (0.17, 0.05), (0.08, 0.075), (0.0, 0.08)], segs=24, axis='x' if sx > 0 else '-x')
        K.cyl('rubber', (cx + sx * 0.28, 0.09, cz + 0.18), 0.09, 0.05, axis='z', segs=16, bev=0.008)
    K.box('steel', (cx - 0.05, 0.55, cz), (0.3, 0.06, 0.22), bev=0.006)
    K.cyl('p_black', (cx - 0.08, 0.68, cz), 0.1, 0.22, axis='z', segs=18, bev=0.01)
    K.box('p_cream', (cx + 0.18, 0.66, cz), (0.06, 0.2, 0.28), bev=0.01)
    K.cyl('p_cream', (cx + 0.2, 0.55, cz + 0.17), 0.035, 0.02, axis='z', segs=14)
    K.tube('steel', [(cx - 0.37, 0.5, cz), (cx - 0.37, 0.75, cz), (cx - 0.25, 0.85, cz)], 0.012, segs=6, bend=0.05)
    hose_coil(K, (cx + 0.05, 0.86, cz + 0.02), 0.16, 4, 'p_yellow')
    P.solid(L, cx, cz, 0.42, 0.22, 0, 0.8)
    # the spray gun on a hook, its hose down to the compressor
    gx, gy, gz = x0 + 0.1, 1.55, -2.75
    K.box('steel', (gx + 0.02, gy + 0.1, gz), (0.04, 0.02, 0.02), bev=0.003)
    K.cyl('alu', (gx + 0.08, gy - 0.02, gz), 0.035, 0.08, axis='x', segs=14)
    K.cyl('alu', (gx + 0.05, gy - 0.12, gz), 0.055, 0.12, segs=16, bev=0.006)
    K.box('p_black', (gx + 0.04, gy - 0.05, gz), (0.03, 0.12, 0.025), bev=0.005)
    K.tube('p_yellow', [(gx + 0.04, gy - 0.12, gz), (gx + 0.2, 0.6, gz - 0.3), (gx + 0.5, 0.05, gz - 0.9), (cx, 0.05, cz + 0.3), (cx - 0.3, 0.5, cz)], 0.01, segs=6, bend=0.25)
    # tins of paint, a stool, a roll of masking tape
    for (tx, tz, col, h) in ((-5.2, -4.6, 0x3e8e87, 0.2), (-5.45, -4.55, 0xc8323a, 0.2), (-5.32, -4.3, 0xf0c23c, 0.15), (-5.3, -4.45, 0xf4efe2, 0.2)):
        paint_tin(K, tx, (0.2 if (tx, tz) == (-5.3, -4.45) else 0.0), tz, 0.09, h, tint_of(col))
    stool(K, -5.6, -3.4)
    K.lathe('tinted_matte', (-5.31, 0.4, -4.45), [(0.03, -0.025), (0.055, -0.025), (0.055, 0.025), (0.03, 0.025)], segs=18, tint=tint_of(0xe8dcb0))
    P.device(L, 'paintbooth', cx + 0.18, 0.66, cz + 0.14, 0.18)
    return (x0, x1, z0, z1)


def tarp(K, a, b, top, depth, folds=6, gap=None, bottom=0.12):
    """a canvas curtain from a rail between plan points a and b, hanging in folds to `bottom`"""
    a = V((a[0], 0, a[1]))
    b = V((b[0], 0, b[1]))
    d = b - a
    ln = d.length
    t = d.normalized()
    n = V((-t.z, 0, t.x))
    cols = max(8, folds * 6)
    rows = 9
    bm = bmesh.new()
    grid = []
    for j in range(rows + 1):
        y = top - (top - bottom) * j / rows
        row = []
        for i in range(cols + 1):
            u = i / cols
            # folds deepen towards the bottom, the hem swings a little
            f = math.sin(u * math.tau * folds) * depth * (0.55 + 0.45 * j / rows)
            p = a + t * (ln * u) + n * f
            row.append(bm.verts.new((p.x, y - 0.03 * math.sin(u * 7.0) * (j / rows), p.z)))
        grid.append(row)
    for j in range(rows):
        for i in range(cols):
            u0 = i / cols
            if gap:
                xm = (a + t * (ln * (u0 + 0.5 / cols))).x
                if gap[0] < xm < gap[1]:
                    continue
            bm.faces.new((grid[j][i], grid[j + 1][i], grid[j + 1][i + 1], grid[j][i + 1]))
    loose = [v for v in bm.verts if not v.link_faces]
    bmesh.ops.delete(bm, geom=loose, context='VERTS')
    for f in bm.faces:
        f.smooth = True
    K.mesh('canvas', bm, tint=(1.0 + K.jitter(0.05), 0.97, 0.9), smooth=True, sharp=80)
    # rings on the rail
    for i in range(folds * 2 + 1):
        p = a + t * (ln * i / (folds * 2))
        K.cyl('galv', (p.x, top + 0.02, p.z), 0.03, 0.012, axis=(t.x, 0, t.z), segs=8, caps=False)


def blot(K, c, nrm, r, tint):
    """a soft blot of overspray: an irregular disc flat on a surface"""
    bm = bmesh.new()
    nrm = V(nrm).normalized()
    u = nrm.orthogonal().normalized()
    w = nrm.cross(u)
    k = 11
    centre = bm.verts.new(c)
    ring = []
    ph = K.rng.random() * 6.0
    for i in range(k):
        a = i / k * math.tau
        rr = r * (0.7 + 0.3 * math.sin(a * 3 + ph) + 0.15 * math.sin(a * 5 + ph * 2))
        ring.append(bm.verts.new(c + (u * math.cos(a) + w * math.sin(a)) * rr))
    for i in range(k):
        f = bm.faces.new((centre, ring[i], ring[(i + 1) % k]))
        f.normal_update()
        if f.normal.dot(nrm) < 0:
            f.normal_flip()
    K.mesh('tinted_matte', bm, tint=tint)


def paint_tin(K, x, y, z, r, h, tint):
    K.cyl('galv', (x, y + h / 2, z), r, h, segs=20, bev=0.003)
    K.cyl('tinted', (x, y + h * 0.45, z), r + 0.002, h * 0.6, segs=20, caps=False, tint=tint)
    K.cyl('galv', (x, y + h + 0.004, z), r * 0.95, 0.01, segs=20)
    K.tube('steel', [(x - r, y + h * 0.8, z), (x, y + h + 0.06, z), (x + r, y + h * 0.8, z)], 0.003, segs=4, bend=0.03)


def stool(K, x, z, h=0.62, mat='wood'):
    K.cyl(mat, (x, h - 0.02, z), 0.17, 0.04, segs=20, bev=0.008, tint=P.wood(K))
    for k in range(3):
        a = k * math.tau / 3 + 0.4
        K.tube('wood_dark', [(x + math.cos(a) * 0.08, h - 0.04, z + math.sin(a) * 0.08), (x + math.cos(a) * 0.19, 0.0, z + math.sin(a) * 0.19)], 0.018, segs=6)
    K.tube('wood_dark', [(x + math.cos(a) * 0.15, 0.22, z + math.sin(a) * 0.15) for a in (0.4, 0.4 + math.tau / 3, 0.4 + 2 * math.tau / 3, 0.4)], 0.01, segs=5)


def hose_coil(K, c, r, turns, mat, rr=0.012, axis='y'):
    pts = []
    for i in range(turns * 16 + 1):
        a = i / 16 * math.tau
        pts.append((c[0] + math.cos(a) * r, c[1] + i / 16 * rr * 2.2, c[2] + math.sin(a) * r))
    K.tube(mat, pts, rr, segs=6)


# ---------------------------------------------------------------------------------------------- the sink

def sink(K, L, x, z):
    """a white utility sink on steel legs by the front wall, a brass tap, the hose reel on the wall, a bucket and sponge"""
    top = 0.9
    w, d, h = 0.62, 0.48, 0.3
    # the basin: a floor and four thick walls
    t = 0.035
    K.box('ceramic', (x, top - h + t / 2, z), (w, t, d), bev=0.01)
    for (dx, dz, sx, sz) in ((0, d / 2 - t / 2, w, t), (0, -d / 2 + t / 2, w, t), (w / 2 - t / 2, 0, t, d - 2 * t), (-w / 2 + t / 2, 0, t, d - 2 * t)):
        K.box('ceramic', (x + dx, top - h / 2, z + dz), (sx, h, sz), bev=0.008)
    K.cyl('steel', (x, top - h + 0.045, z), 0.03, 0.006, segs=12)
    for (dx, dz) in ((0.27, 0.2), (-0.27, 0.2), (0.27, -0.2), (-0.27, -0.2)):
        K.box('galv', (x + dx, (top - h) / 2, z + dz), (0.04, top - h, 0.04), bev=0.004)
    K.box('galv', (x, 0.2, z), (w - 0.06, 0.02, d - 0.06), bev=0.004)
    # the tap on the wall
    wx = S.X1 - 0.02
    K.tube('brass', [(wx, top + 0.45, z), (wx - 0.12, top + 0.45, z), (wx - 0.16, top + 0.38, z)], 0.014, segs=10, bend=0.04)
    K.cyl('brass', (wx - 0.06, top + 0.52, z), 0.02, 0.06, segs=10)
    K.box('p_red', (wx - 0.06, top + 0.56, z), (0.08, 0.012, 0.015), bev=0.003)
    K.tube('galv', [(wx, top + 0.45, z), (wx, S.EAVE - 0.3, z)], 0.012, segs=8)
    # the hose reel beside it, green hose wound on
    hz = z - 0.75
    K.cyl('p_red', (wx - 0.05, 1.25, hz), 0.06, 0.08, axis='x', segs=14)
    K.lathe('p_green', (wx - 0.15, 1.25, hz), [(0.06, -0.08), (0.2, -0.08), (0.2, -0.065), (0.11, -0.06), (0.11, 0.06), (0.2, 0.065), (0.2, 0.08), (0.06, 0.08)], segs=24, axis='x', smooth=False)
    for i in range(5):
        K.lathe('p_green', (wx - 0.15, 1.25, hz), [(0.115 + i * 0.016, -0.055), (0.125 + i * 0.016, -0.055), (0.125 + i * 0.016, 0.055), (0.115 + i * 0.016, 0.055)], segs=24, axis='x', tint=0.85 + 0.03 * i)
    K.tube('p_green', [(wx - 0.15, 1.05, hz), (wx - 0.3, 0.4, hz + 0.1), (wx - 0.6, 0.02, hz + 0.25), (wx - 1.0, 0.02, hz + 0.1), (wx - 1.2, 0.02, hz - 0.3)], 0.014, segs=6, bend=0.2)
    # a galvanised bucket with a sponge in it, under the sink
    bucket(K, x - 0.05, z + 0.02, 0.0, water=True)
    P.solid(L, x, z, w / 2, d / 2, 0, top)
    P.device(L, 'sink', wx - 0.12, top + 0.47, z, 0.16)


def bucket(K, x, z, y=0.0, water=False):
    prof = [(0.12, 0.0), (0.135, 0.004), (0.155, 0.27), (0.163, 0.28), (0.155, 0.285), (0.147, 0.27), (0.128, 0.012)]
    K.lathe('galv', (x, y, z), prof, segs=22, sharp=60)
    K.cyl('galv', (x, y + 0.004, z), 0.125, 0.008, segs=22)
    K.tube('steel', [(x - 0.158, y + 0.26, z), (x - 0.1, y + 0.4, z), (x + 0.1, y + 0.4, z), (x + 0.158, y + 0.26, z)], 0.004, segs=4, bend=0.08)
    if water:
        K.cyl('water', (x, y + 0.2, z), 0.147, 0.01, segs=22)
        K.box('p_yellow', (x + 0.04, y + 0.215, z - 0.02), (0.12, 0.045, 0.08), rot=(0, 20, 8), bev=0.012)


# ---------------------------------------------------------------------------------------------- the radio

def radio(K, L, x, y, z, yaw_deg=0.0):
    """a wooden table radio, cream dial with its pointer, two knobs, a cloth grille"""
    M = kit.mat4((x, y, z), (0, yaw_deg, 0))

    def box(mat, c, size, rot=(0, 0, 0), **kw):
        K.box(mat, (0, 0, 0), size, matrix=M @ Matrix.Translation(c) @ kit.rot3(rot).to_4x4(), **kw)

    def cyl(mat, c, r, h, axis='y', **kw):
        K.cyl(mat, (0, 0, 0), r, h, matrix=M @ Matrix.Translation(c) @ kit.axis_to(axis), **kw)

    w, h, d = 0.36, 0.22, 0.18
    box('wood', (0, h / 2, 0), (d, h, w), bev=0.02, tint=(1.05, 0.85, 0.65))
    box('cloth', (d / 2 + 0.002, h * 0.6, -0.07), (0.004, 0.12, 0.17), bev=0.0, tint=(0.9, 0.82, 0.65))
    for k in range(5):
        box('wood_dark', (d / 2 + 0.005, h * 0.6, -0.14 + k * 0.035), (0.006, 0.13, 0.008), bev=0.0)
    box('dial', (d / 2 + 0.002, h * 0.6, 0.095), (0.004, 0.06, 0.13), bev=0.0)
    K.mover('RADIO_NEEDLE', tuple(M @ V((d / 2 + 0.006, h * 0.6, 0.095))))
    box('p_red', (d / 2 + 0.006, h * 0.6, 0.095), (0.003, 0.055, 0.004), mover='RADIO_NEEDLE')
    for dz in (0.06, 0.13):
        cyl('wood_dark', (d / 2 + 0.012, h * 0.24, dz), 0.022, 0.024, axis='x', segs=14, bev=0.004)
    for sz in (-1, 1):
        box('wood_dark', (0.0, 0.008, sz * (w / 2 - 0.03)), (d - 0.02, 0.016, 0.03), bev=0.004)
    c = M @ V((d / 2 + 0.02, h * 0.45, 0))
    P.device(L, 'radio', c.x, c.y, c.z, 0.2)
    P.solid(L, x, z, 0.1, 0.19, y, y + h)


# ---------------------------------------------------------------------------------------------- tool chest, jack, stands, creeper

def tool_chest(K, L, x, z, yaw_deg=0.0):
    """a red rolling tool chest: eight drawers, chrome pulls, castors, a top box with its lid up a crack"""
    M = kit.mat4((x, 0, z), (0, yaw_deg, 0))

    def box(mat, c, size, rot=(0, 0, 0), **kw):
        K.box(mat, (0, 0, 0), size, matrix=M @ Matrix.Translation(c) @ kit.rot3(rot).to_4x4(), **kw)

    w, d = 0.72, 0.46
    box('p_red', (0, 0.55, 0), (d, 0.82, w), bev=0.015)
    for k in range(7):
        y = 0.2 + k * 0.105
        box('trim', (d / 2 + 0.001, y + 0.05, 0), (0.004, 0.006, w - 0.04), bev=0.0)
        box('chrome', (d / 2 + 0.012, y, 0), (0.014, 0.014, w * 0.7), bev=0.004)
    for (dx, dz) in ((0.18, 0.31), (-0.18, 0.31), (0.18, -0.31), (-0.18, -0.31)):
        K.cyl('rubber', (0, 0, 0), 0.05, 0.035, matrix=M @ Matrix.Translation((dx, 0.06, dz)) @ kit.axis_to('z'), segs=14)
        box('steel', (dx, 0.12, dz), (0.05, 0.03, 0.05), bev=0.004)
    box('p_red', (0, 1.06, 0), (d - 0.04, 0.2, w - 0.04), bev=0.012)
    box('p_red', (-0.03, 1.19, 0), (d - 0.08, 0.04, w - 0.02), rot=(0, 0, 6), bev=0.008)
    box('chrome', (d / 2 - 0.02, 1.1, 0), (0.015, 0.015, 0.2), bev=0.004)
    c = M @ V((0, 0, 0))
    P.solid(L, c.x, c.z, d / 2 + 0.02, w / 2 + 0.02, 0, 1.2, yaw=-math.radians(yaw_deg))
    P.surface(L, c.x - 0.18, c.x + 0.18, c.z - 0.3, c.z + 0.3, 1.21, 'chest')


def floor_jack(K, x, z, yaw_deg=0.0):
    M = kit.mat4((x, 0, z), (0, yaw_deg, 0))

    def box(mat, c, size, rot=(0, 0, 0), **kw):
        K.box(mat, (0, 0, 0), size, matrix=M @ Matrix.Translation(c) @ kit.rot3(rot).to_4x4(), **kw)

    box('p_red', (0, 0.1, 0), (0.75, 0.1, 0.26), bev=0.012, taper=(0.9, 0.85))
    box('p_red', (0.3, 0.17, 0), (0.18, 0.06, 0.14), bev=0.01)
    K.cyl('steel', (0, 0, 0), 0.06, 0.03, matrix=M @ Matrix.Translation((0.38, 0.22, 0)), segs=14)
    for dx in (-0.3, 0.32):
        for dz in (-0.14, 0.14):
            K.cyl('steel', (0, 0, 0), 0.045, 0.03, matrix=M @ Matrix.Translation((dx, 0.045, dz)) @ kit.axis_to('z'), segs=12)
    a = M @ V((-0.36, 0.13, 0))
    b = M @ V((-1.15, 0.85, 0))
    K.tube('steel', [a, b], 0.016, segs=8)
    K.cyl('rubber', (0, 0, 0), 0.022, 0.12, matrix=Matrix.Translation(b) @ kit.axis_to(b - a), segs=10)


def axle_stand(K, x, z, h=0.42):
    K.lathe('p_yellow', (x, 0, z), [(0.0, 0.0), (0.13, 0.0), (0.13, 0.015), (0.05, h * 0.75), (0.035, h * 0.78), (0.0, h * 0.78)], segs=4, smooth=False, start=math.pi / 4)
    K.cyl('steel', (x, h * 0.85, z), 0.022, h * 0.3, segs=10)
    K.box('steel', (x, h, z), (0.07, 0.03, 0.05), bev=0.006)


def creeper(K, x, z, yaw_deg=0.0):
    M = kit.mat4((x, 0, z), (0, yaw_deg, 0))
    K.box('p_black', (0, 0, 0), (0.95, 0.03, 0.42), matrix=M @ Matrix.Translation((0, 0.11, 0)), bev=0.012)
    K.box('leather', (0, 0, 0), (0.75, 0.03, 0.34), matrix=M @ Matrix.Translation((0.05, 0.135, 0)), bev=0.012, tint=(0.6, 0.35, 0.3))
    K.box('leather', (0, 0, 0), (0.16, 0.05, 0.28), matrix=M @ Matrix.Translation((-0.38, 0.15, 0)), bev=0.02, tint=(0.6, 0.35, 0.3))
    for dx in (-0.4, 0.4):
        for dz in (-0.17, 0.17):
            K.cyl('steel', (0, 0, 0), 0.035, 0.02, matrix=M @ Matrix.Translation((dx, 0.04, dz)) @ kit.axis_to('z'), segs=10)
            K.box('steel', (0, 0, 0), (0.04, 0.05, 0.03), matrix=M @ Matrix.Translation((dx, 0.08, dz)), bev=0.004)


# ---------------------------------------------------------------------------------------------- the back wall: clock, chalkboard, calendar

def wall_clock(K, L, x, y, z, nx=1.0):
    """a round wall clock (facing +x from the back wall); its hands move (CLOCK_H, CLOCK_M) about the wall normal"""
    s = 1 if nx > 0 else -1
    K.lathe('p_cream', (x, y, z), [(0.0, 0.035), (0.19, 0.035), (0.205, 0.02), (0.205, -0.0), (0.0, 0.0)], segs=32, axis='x' if s > 0 else '-x')
    K.lathe('wood_dark', (x, y, z), [(0.205, 0.04), (0.23, 0.035), (0.235, 0.0), (0.205, 0.0)], segs=32, axis='x' if s > 0 else '-x')
    for k in range(12):
        a = k / 12 * math.tau
        ln = 0.035 if k % 3 == 0 else 0.018
        K.box('p_black', (x + s * 0.037, y + math.cos(a) * 0.16, z + math.sin(a) * 0.16), (0.002, ln, 0.01), rot=(math.degrees(-a), 0, 0), bev=0.0)
    K.mover('CLOCK_H', (x + s * 0.04, y, z))
    K.box('p_black', (x + s * 0.04, y + 0.05, z), (0.004, 0.11, 0.014), bev=0.0, mover='CLOCK_H')
    K.mover('CLOCK_M', (x + s * 0.044, y, z))
    K.box('p_black', (x + s * 0.044, y + 0.07, z), (0.004, 0.15, 0.009), bev=0.0, mover='CLOCK_M')
    K.cyl('brass', (x + s * 0.047, y, z), 0.012, 0.006, axis='x', segs=10)
    L['clock'] = {'x': x, 'y': y, 'z': z}


def chalkboard(K, L, x, y, z, w=1.7, h=1.05):
    """a chalkboard framed in wood on the back wall; the game draws the writing on its face (L['chalkboard'])"""
    K.box('chalk', (x + 0.03, y, z), (0.02, h, w), bev=0.003)
    for (dy, dz, sy, sz) in ((h / 2 + 0.03, 0, 0.06, w + 0.12), (-h / 2 - 0.03, 0, 0.06, w + 0.12), (0, w / 2 + 0.03, h, 0.06), (0, -w / 2 - 0.03, h, 0.06)):
        K.box('wood', (x + 0.04, y + dy, z + dz), (0.04, sy, sz), bev=0.006, tint=P.wood(K))
    # the ledge with chalk and a rag
    K.box('wood', (x + 0.08, y - h / 2 - 0.07, z), (0.1, 0.025, w), bev=0.004, tint=P.wood(K))
    for k, dz in enumerate((-0.5, -0.42, 0.3)):
        K.cyl('tinted_matte', (x + 0.08, y - h / 2 - 0.05, z + dz), 0.008, 0.07, axis='z', segs=8, tint=tint_of(0xf4efe2) if k else tint_of(0xf0c23c))
    K.box('cloth', (x + 0.09, y - h / 2 - 0.045, z + 0.55), (0.07, 0.02, 0.12), rot=(0, 15, 0), bev=0.008, tint=(0.8, 0.8, 0.85))
    L['chalkboard'] = {'x': round(x + 0.041, 3), 'y': y, 'z': z, 'w': w, 'h': h}


def calendar(K, x, y, z):
    """a wall calendar: a painted picture above, the month's grid below, hung from a nail"""
    K.box('paper', (x + 0.012, y, z), (0.004, 0.62, 0.42), bev=0.0)
    # the picture: hills and a sky, in bands
    for (dy, sh, col) in ((0.21, 0.12, 0x7fb3d5), (0.14, 0.03, 0xa9d3b5), (0.11, 0.035, 0x557a46), (0.075, 0.035, 0x3e6a3a)):
        K.box('tinted_matte', (x + 0.016, y + dy, z), (0.002, sh, 0.36), bev=0.0, tint=tint_of(col))
    K.box('tinted_matte', (x + 0.017, y + 0.235, z + 0.08), (0.002, 0.05, 0.08), bev=0.0, tint=tint_of(0xf4efe2))
    for r in range(5):
        for c in range(7):
            col = 0xc8323a if (c == 6) else 0x2f3236
            K.box('tinted_matte', (x + 0.016, y - 0.05 - r * 0.045, z - 0.15 + c * 0.05), (0.002, 0.012, 0.016), bev=0.0, tint=tint_of(col))
    K.box('tinted_matte', (x + 0.016, y + 0.0, z), (0.002, 0.02, 0.2), bev=0.0, tint=tint_of(0xc8323a))
    K.cyl('steel', (x + 0.02, y + 0.33, z), 0.004, 0.03, axis='x', segs=6)
