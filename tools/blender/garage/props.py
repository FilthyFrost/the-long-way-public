"""
The workshop's furniture and machines, first batch (docs/MODCAR.md section 9): the workbench with its
vice and the pegboard, the shelves and the steel rack where parts wait, the battery charger cart, the
sliding doors on their track with the button box, the pendant lamps, the oil drums and a stack of
tyres. Every function takes the kit K and the layout L, models in the game frame (_kit.py) and adds
what the game needs to know (surfaces, spots, solids, devices, lamps) to L.
"""

import math

import bmesh
from mathutils import Matrix, Vector

from . import _kit as kit
from . import shell as S

V = Vector


def surface(L, x0, x1, z0, z1, y, name=''):
    """a top things can lie on (the bench, a shelf): plan box and height"""
    L.setdefault('surfaces', []).append({'x0': round(x0, 4), 'x1': round(x1, 4), 'z0': round(z0, 4), 'z1': round(z1, 4), 'y': round(y, 4), 'name': name})


def spot(L, x, y, z, yaw, where):
    L.setdefault('spots', []).append({'x': round(x, 3), 'y': round(y, 3), 'z': round(z, 3), 'yaw': round(yaw, 4), 'where': where})


def solid(L, x, z, hx, hz, y0, y1, floor=False, yaw=0.0):
    L.setdefault('solids', []).append([round(x, 3), round(z, 3), round(hx, 3), round(hz, 3), round(y0, 3), round(y1, 3), 1 if floor else 0, round(yaw, 4)])


def device(L, id, x, y, z, radius, **extra):
    d = {'id': id, 'x': round(x, 3), 'y': round(y, 3), 'z': round(z, 3), 'radius': radius}
    d.update(extra)
    L.setdefault('devices', []).append(d)


def lamp(L, x, y, z, colour, reach, down, kind='pendant'):
    L.setdefault('lamps', []).append({'pos': [round(x, 3), round(y, 3), round(z, 3)], 'colour': colour, 'reach': reach, 'down': down, 'kind': kind})


def wood(K, a=0.07):
    return S.warm(K, a)


# ---------------------------------------------------------------------------------------------- workbench

BENCH_TOP = 0.92


def workbench(K, L):
    """a long timber bench against the left wall, a shelf under it, drawers at one end, a vice at the other"""
    x0, x1 = -4.55, 1.25
    z0, z1 = S.Z0 + 0.03, S.Z0 + 0.8
    t = 0.07
    # top: planks along its length, a little uneven
    n = 5
    for i in range(n):
        za = z0 + (z1 - z0) * i / n + 0.004
        zb = z0 + (z1 - z0) * (i + 1) / n - 0.004
        K.box('wood', ((x0 + x1) / 2, BENCH_TOP - t / 2 + K.jitter(0.002), (za + zb) / 2), (x1 - x0, t, zb - za), bev=0.006, seg=0.5, tint=wood(K, 0.1))
    # legs and rails
    for lx in (x0 + 0.08, -2.7, -0.85, x1 - 0.08):
        for lz in (z0 + 0.07, z1 - 0.07):
            K.box('wood_dark', (lx, (BENCH_TOP - t) / 2, lz), (0.09, BENCH_TOP - t, 0.09), bev=0.008, seg=0.5)
    for ry in (0.2, BENCH_TOP - t - 0.06):
        K.box('wood_dark', ((x0 + x1) / 2, ry, z1 - 0.07), (x1 - x0 - 0.1, 0.08, 0.05), bev=0.006, seg=0.5)
        K.box('wood_dark', ((x0 + x1) / 2, ry, z0 + 0.07), (x1 - x0 - 0.1, 0.08, 0.05), bev=0.006, seg=0.5)
    # the shelf underneath
    K.box('wood', ((x0 + x1) / 2, 0.26, (z0 + z1) / 2), (x1 - x0 - 0.12, 0.03, z1 - z0 - 0.06), bev=0.004, seg=0.5, tint=wood(K))
    # a back board along the wall
    K.box('wood', ((x0 + x1) / 2, BENCH_TOP + 0.08, z0 + 0.01), (x1 - x0, 0.16, 0.02), bev=0.004, seg=0.5, tint=wood(K))
    # drawers under the left end
    dx0, dx1 = x0 + 0.15, x0 + 1.0
    K.box('wood_dark', ((dx0 + dx1) / 2, 0.58, (z0 + z1) / 2 + 0.02), (dx1 - dx0, 0.52, z1 - z0 - 0.12), bev=0.008)
    for k in range(3):
        y = 0.4 + k * 0.17
        K.box('wood', ((dx0 + dx1) / 2, y, z1 - 0.045), (dx1 - dx0 - 0.04, 0.15, 0.02), bev=0.004, tint=wood(K))
        K.box('steel', ((dx0 + dx1) / 2, y, z1 - 0.03), (0.12, 0.022, 0.02), bev=0.004)
    surface(L, x0, x1, z0, z1, BENCH_TOP, 'bench')
    surface(L, x0 + 1.05, x1 - 0.06, z0 + 0.04, z1 - 0.04, 0.275, 'bench_low')
    solid(L, (x0 + x1) / 2, (z0 + z1) / 2, (x1 - x0) / 2, (z1 - z0) / 2, 0, BENCH_TOP)
    vice(K, x1 - 0.32, z1 - 0.02)
    # where things lie on the bench (the tools and the small parts of the tutorial)
    for i in range(7):
        spot(L, x0 + 1.25 + i * 0.52, BENCH_TOP, (z0 + z1) / 2 + 0.05, math.pi / 2, 'bench')
    return (x0, x1, z0, z1)


def vice(K, x, z):
    """a cast bench vice at the front edge: body, jaws, the screw and its tommy bar"""
    y = BENCH_TOP
    K.box('p_blue', (x, y + 0.035, z - 0.1), (0.2, 0.07, 0.22), bev=0.012)
    K.box('p_blue', (x, y + 0.12, z - 0.12), (0.17, 0.12, 0.12), bev=0.015)
    K.box('p_blue', (x, y + 0.12, z + 0.05), (0.15, 0.1, 0.07), bev=0.012)
    K.box('steel', (x, y + 0.19, z - 0.05), (0.18, 0.04, 0.025), bev=0.003)
    K.box('steel', (x, y + 0.19, z + 0.02), (0.18, 0.04, 0.025), bev=0.003)
    K.cyl('steel', (x, y + 0.1, z + 0.17), 0.012, 0.22, axis='z', segs=10)
    K.cyl('chrome', (x, y + 0.1, z + 0.28), 0.007, 0.26, axis='x', segs=8)
    for s in (-1, 1):
        K.cyl('chrome', (x + s * 0.13, y + 0.1, z + 0.28), 0.012, 0.02, axis='x', segs=10)


# ---------------------------------------------------------------------------------------------- pegboard

def pegboard(K, L, x0, x1, y0, y1):
    """a pegboard on the wall above the bench (hardboard on battens), holes as a dark dot grid"""
    z = S.Z0 + 0.13
    K.box('pegboard', ((x0 + x1) / 2, (y0 + y1) / 2, z), (x1 - x0, y1 - y0, 0.012), bev=0.003, seg=0.5)
    for yy in (y0 + 0.05, y1 - 0.05):
        K.box('wood_dark', ((x0 + x1) / 2, yy, z - 0.02), (x1 - x0, 0.05, 0.025), bev=0.004, seg=0.5)
    # the holes: little dark squares in rows (cheap: a few hundred quads on one sheet)
    bm = bmesh.new()
    step = 0.05
    nx = int((x1 - x0 - 0.1) / step)
    ny = int((y1 - y0 - 0.16) / step)
    for i in range(nx):
        for j in range(ny):
            cx = x0 + 0.05 + (i + 0.5) * (x1 - x0 - 0.1) / nx
            cy = y0 + 0.08 + (j + 0.5) * (y1 - y0 - 0.16) / ny
            r = 0.0065
            vs = [bm.verts.new((cx - r, cy - r, z + 0.0065)), bm.verts.new((cx + r, cy - r, z + 0.0065)),
                  bm.verts.new((cx + r, cy + r, z + 0.0065)), bm.verts.new((cx - r, cy + r, z + 0.0065))]
            bm.faces.new(vs)
    for f in bm.faces:
        f.normal_update()
        if f.normal.z < 0:
            f.normal_flip()
    K.mesh('p_black', bm)


# ---------------------------------------------------------------------------------------------- shelves

def shelves(K, L, x0, x1, levels, depth=0.5, name='shelf'):
    """wooden shelving against the right wall (boards on timber uprights)"""
    z1 = S.Z1 - 0.17
    z0 = z1 - depth
    ups = max(2, int(round((x1 - x0) / 1.1)) + 1)
    for i in range(ups):
        x = x0 + (x1 - x0) * i / (ups - 1)
        for z in (z0 + 0.04, z1 - 0.04):
            K.box('wood_dark', (x, levels[-1] / 2 + 0.03, z), (0.06, levels[-1] + 0.06, 0.06), bev=0.006)
    for y in levels:
        K.box('wood', ((x0 + x1) / 2, y - 0.015, (z0 + z1) / 2), (x1 - x0 + 0.08, 0.03, depth), bev=0.005, seg=0.6, tint=wood(K))
        K.box('wood_dark', ((x0 + x1) / 2, y - 0.05, z0 + 0.02), (x1 - x0 + 0.08, 0.05, 0.03), bev=0.004, seg=0.6)
        surface(L, x0 - 0.04, x1 + 0.04, z0, z1, y, name)
    solid(L, (x0 + x1) / 2, (z0 + z1) / 2, (x1 - x0) / 2 + 0.05, depth / 2, 0, levels[-1] + 0.05)
    return (z0, z1)


def steel_rack(K, L, x0, x1, levels, depth=0.7):
    """a heavy steel pallet rack: blue uprights, orange beams, plank decks (engines go here)"""
    z1 = S.Z1 - 0.17
    z0 = z1 - depth
    top = levels[-1] + 0.45
    for x in (x0, x1):
        for z in (z0 + 0.04, z1 - 0.04):
            K.box('p_blue', (x, top / 2, z), (0.07, top, 0.06), bev=0.006, seg=0.6)
        # bracing between the front and back uprights
        for k in range(4):
            ya = 0.15 + k * (top - 0.3) / 4
            yb = ya + (top - 0.3) / 4
            K.tube('p_blue', [(x, ya, z0 + 0.06), (x, yb, z1 - 0.06)], 0.012, segs=6)
    for y in levels:
        for z in (z0 + 0.04, z1 - 0.04):
            K.box('p_orange', ((x0 + x1) / 2, y - 0.05, z), (x1 - x0, 0.09, 0.05), bev=0.005, seg=0.6)
        for k in range(6):
            zz = z0 + 0.08 + (depth - 0.16) * (k + 0.5) / 6
            K.box('wood', ((x0 + x1) / 2, y - 0.003, zz), (x1 - x0 - 0.02, 0.025, (depth - 0.16) / 6 - 0.01), bev=0.003, seg=0.6, tint=wood(K, 0.12))
        surface(L, x0, x1, z0, z1, y + 0.01, 'rack')
    solid(L, (x0 + x1) / 2, (z0 + z1) / 2, (x1 - x0) / 2 + 0.04, depth / 2, 0, top)
    return (z0, z1)


# ---------------------------------------------------------------------------------------------- the charger

def charger_cart(K, L, x, z):
    """a battery charger on a little two-shelf trolley: a tray on top for the battery, clamps on their cables"""
    w, d = 0.62, 0.46
    top = 0.74
    for sx in (-1, 1):
        for sz in (-1, 1):
            K.box('p_green', (x + sx * (w / 2 - 0.02), top / 2 + 0.04, z + sz * (d / 2 - 0.02)), (0.035, top - 0.06, 0.035), bev=0.004)
            K.cyl('rubber', (x + sx * (w / 2 - 0.02), 0.045, z + sz * (d / 2 - 0.02)), 0.045, 0.03, axis='z', segs=12)
    for y in (0.2, top):
        K.box('p_green', (x, y - 0.015, z), (w, 0.03, d), bev=0.006)
        K.box('p_green', (x, y + 0.02, z + d / 2 - 0.01), (w, 0.07, 0.015), bev=0.004)
        K.box('p_green', (x, y + 0.02, z - d / 2 + 0.01), (w, 0.07, 0.015), bev=0.004)
    # the charger itself on the lower shelf, its face to the room
    cx, cy, cz = x, 0.2 + 0.17, z + 0.02
    K.box('p_cream', (cx, cy, cz), (0.42, 0.3, 0.3), bev=0.02)
    K.box('p_black', (cx, cy + 0.02, cz + 0.152), (0.3, 0.18, 0.01), bev=0.004)
    K.cyl('glass', (cx - 0.05, cy + 0.03, cz + 0.158), 0.055, 0.008, axis='z', segs=20)
    K.cyl('steel', (cx + 0.09, cy + 0.02, cz + 0.16), 0.022, 0.02, axis='z', segs=12)
    K.box('steel', (cx, cy + 0.17, cz), (0.2, 0.03, 0.04), bev=0.006)
    # the needle (it moves) and the lamp that blinks while charging
    K.mover('CHG_NEEDLE', (cx - 0.05, cy + 0.0, cz + 0.164))
    K.box('p_red', (cx - 0.05, cy + 0.025, cz + 0.164), (0.004, 0.05, 0.003), mover='CHG_NEEDLE')
    K.cyl('led', (cx + 0.12, cy + 0.07, cz + 0.158), 0.012, 0.01, axis='z', segs=10, mover='CHG_LED')
    K.mover('CHG_LED', (cx + 0.12, cy + 0.07, cz + 0.158))
    # cables up to the clamps resting on the tray
    for (s, mat) in ((-1, 'p_red'), (1, 'p_black')):
        K.tube(mat, [(cx + s * 0.12, cy + 0.1, cz + 0.15), (cx + s * 0.2, cy + 0.2, cz + 0.28), (x + s * 0.24, top + 0.2, z + 0.25), (x + s * 0.18, top + 0.06, z + 0.16)], 0.009, segs=6, bend=0.08)
        K.box(mat, (x + s * 0.18, top + 0.04, z + 0.12), (0.03, 0.03, 0.09), bev=0.006)
    surface(L, x - w / 2, x + w / 2, z - d / 2, z + d / 2, top + 0.005, 'charger')
    solid(L, x, z, w / 2, d / 2, 0, top)
    spot(L, x - 0.02, top + 0.005, z - 0.02, 0.0, 'charger')
    device(L, 'charger', cx, cy + 0.05, cz + 0.16, 0.22)


# ---------------------------------------------------------------------------------------------- doors

def sliding_doors(K, L):
    """two big board doors hung from a steel track along the front; they slide out to the sides"""
    x = S.X1 + S.BOARD_T + S.BATTEN_T + 0.045
    track_y = S.DOOR_H + 0.38
    # the track and its brackets
    K.box('steel', (x + 0.03, track_y, 0), (0.07, 0.08, 10.2), bev=0.006, seg=0.8)
    for z in (-4.8, -3.2, -1.6, 0.0, 1.6, 3.2, 4.8):
        K.box('steel', (x - 0.005, track_y + 0.02, z), (0.06, 0.16, 0.05), bev=0.004)
    # stops at the ends
    for z in (-5.05, 5.05):
        K.box('rubber', (x + 0.03, track_y, z), (0.08, 0.1, 0.05), bev=0.008)
    w = S.DOOR_Z + 0.13
    h = S.DOOR_H + 0.18
    leaves = []
    for (name, zc) in (('DOOR_L', -w / 2), ('DOOR_R', w / 2)):
        K.mover(name, (x, 0, zc))
        # boards (vertical), two rails and a brace
        n = 10
        for i in range(n):
            za = zc - w / 2 + w * i / n + 0.003
            zb = zc - w / 2 + w * (i + 1) / n - 0.003
            K.box('siding', (x, 0.03 + h / 2, (za + zb) / 2), (0.035, h, zb - za), bev=0.004, seg=0.6, tint=S.warm(K, 0.06), mover=name,
                  faces_mat=lambda nrm: 'boards' if nrm.x < -0.7 else None)
        for ry in (0.45, h - 0.4, h / 2):
            K.box('g_trim', (x + 0.03, 0.03 + ry, zc), (0.025, 0.14, w - 0.04), bev=0.005, mover=name, seg=0.6)
            K.box('wood', (x - 0.03, 0.03 + ry, zc), (0.025, 0.14, w - 0.04), bev=0.005, mover=name, seg=0.6, tint=wood(K))
        # a Z brace outside, in cream
        ya, yb = 0.03 + 0.45, 0.03 + h / 2
        for (y0, y1, za, zb) in ((ya, yb, zc - w / 2 + 0.1, zc + w / 2 - 0.1), (yb, 0.03 + h - 0.4, zc - w / 2 + 0.1, zc + w / 2 - 0.1)):
            ang = math.degrees(math.atan2(y1 - y0, zb - za))
            ln = math.hypot(y1 - y0, zb - za)
            K.box('g_trim', (x + 0.03, (y0 + y1) / 2, (za + zb) / 2), (0.022, 0.12, ln), rot=(-ang, 0, 0), bev=0.004, mover=name)
        # trolleys on the track
        for dz in (-w / 2 + 0.3, w / 2 - 0.3):
            K.box('steel', (x + 0.03, track_y - 0.1, zc + dz), (0.02, 0.22, 0.06), bev=0.004, mover=name)
            K.cyl('steel', (x + 0.03, track_y + 0.01, zc + dz), 0.035, 0.04, axis='x', segs=14, mover=name)
        # a handle on each side
        hz = zc + (w / 2 - 0.25) * (1 if zc < 0 else -1)
        K.tube('steel', [(x + 0.04, 1.0, hz), (x + 0.09, 1.0, hz), (x + 0.09, 1.35, hz), (x + 0.04, 1.35, hz)], 0.013, segs=8, mover=name)
        K.tube('steel', [(x - 0.035, 1.0, hz), (x - 0.08, 1.0, hz), (x - 0.08, 1.35, hz), (x - 0.035, 1.35, hz)], 0.013, segs=8, mover=name)
        leaves.append(name)
    # closed: the leaves meet in the middle; open: each slides out by its own width + a little
    travel = w + 0.12
    L['doors'] = {'leaves': {'DOOR_L': -1, 'DOOR_R': 1}, 'travel': round(travel, 3), 'width': round(w, 3), 'x': round(x, 3),
                  'height': round(h, 3), 'open': {'DOOR_L': 0.0, 'DOOR_R': 0.62}}
    # the motor at the end of the track and its chain (it is a motorised track: the button box drives it)
    K.box('p_green', (x + 0.06, track_y + 0.02, -5.05 + 0.25), (0.14, 0.18, 0.3), bev=0.012)
    K.cyl('steel', (x + 0.06, track_y + 0.02, -5.05 + 0.44), 0.05, 0.06, axis='z', segs=14)
    # the button box inside, on the left jamb
    bx, by, bz = S.X1 - 0.2, 1.38, -S.DOOR_Z - 0.62
    K.box('p_yellow', (bx - 0.05, by, bz), (0.09, 0.26, 0.16), bev=0.012)
    K.cyl('p_green', (bx - 0.1, by + 0.06, bz), 0.025, 0.025, axis='x', segs=14)
    K.cyl('p_red', (bx - 0.1, by - 0.04, bz), 0.025, 0.025, axis='x', segs=14)
    K.box('p_black', (bx - 0.096, by + 0.11, bz), (0.004, 0.025, 0.12), bev=0.0)
    # its cable up to the motor
    K.tube('p_black', [(bx - 0.02, by + 0.13, bz), (bx - 0.02, S.EAVE - 0.2, bz), (S.X1 + 0.01, S.EAVE - 0.2, bz), (S.X1 + 0.01, S.EAVE - 0.2, -5.05 + 0.25)], 0.008, segs=6, bend=0.05)
    device(L, 'door', bx - 0.1, by + 0.01, bz, 0.2)
    # the light switch beside it
    sx, sy, sz = S.X1 - 0.2, 1.42, -S.DOOR_Z - 1.05
    K.box('p_cream', (sx - 0.02, sy, sz), (0.04, 0.13, 0.09), bev=0.008)
    K.mover('LIGHT_SWITCH', (sx - 0.045, sy, sz))
    K.box('p_black', (sx - 0.045, sy, sz), (0.02, 0.05, 0.02), bev=0.004, mover='LIGHT_SWITCH')
    K.tube('p_black', [(sx - 0.02, sy + 0.07, sz), (sx - 0.02, S.EAVE - 0.25, sz)], 0.006, segs=6)
    device(L, 'lights', sx - 0.05, sy, sz, 0.14)


# ---------------------------------------------------------------------------------------------- lamps

def pendant(K, L, x, z, y, cord_top, colour=(1.0, 0.8, 0.56), reach=6.5, power=1.0):
    """an enamel shade on a cord from a tie beam, a warm bulb under it"""
    K.tube('p_black', [(x, cord_top, z), (x, y + 0.2, z)], 0.005, segs=5, caps=False)
    K.cyl('p_black', (x, y + 0.2, z), 0.022, 0.06, segs=10)
    # the shade: green outside, white enamel inside (two shells); the inside glows with the bulb (shade_in)
    prof_out = [(0.03, 0.17), (0.07, 0.15), (0.16, 0.06), (0.26, -0.02), (0.27, -0.035)]
    prof_in = [(0.262, -0.03), (0.25, -0.018), (0.152, 0.058), (0.064, 0.14), (0.0, 0.142)]
    K.lathe('p_green', (x, y, z), prof_out, segs=28, sharp=60, face='out')
    K.lathe('shade_in', (x, y, z), prof_in, segs=28, sharp=60, face='in')
    K.cyl('brass', (x, y + 0.11, z), 0.03, 0.06, segs=12)
    K.lathe('bulb', (x, y + 0.04, z), [(0.0, -0.07), (0.03, -0.065), (0.045, -0.035), (0.04, 0.0), (0.02, 0.03), (0.016, 0.06)], segs=14)
    lamp(L, x, y - 0.02, z, [colour[0] * power, colour[1] * power, colour[2] * power], reach, 0.85)


# ---------------------------------------------------------------------------------------------- drums and tyres

def drum(K, L, x, z, mat, y=0.0, lying=False, yaw=0.0):
    """a 200 l steel drum: two rolling hoops, a lid with two bungs"""
    r, h = 0.29, 0.88
    if lying:
        K.cyl(mat, (x, r, z), r, h, axis=(math.cos(yaw), 0, math.sin(yaw)), segs=28, bev=0.006, rings=3)
        solid(L, x, z, h / 2, r, 0, 2 * r, yaw=yaw)
        return
    K.cyl(mat, (x, y + h / 2, z), r, h, segs=28, bev=0.008, rings=4, tint=S.warm(K, 0.05))
    for hy in (h * 0.33, h * 0.66):
        K.cyl(mat, (x, y + hy, z), r + 0.012, 0.025, segs=28, bev=0.004, tint=0.9)
    K.cyl('steel', (x + 0.15, y + h + 0.005, z + 0.05), 0.03, 0.02, segs=10)
    K.cyl('steel', (x - 0.16, y + h + 0.005, z - 0.04), 0.022, 0.02, segs=10)
    K.cyl(mat, (x, y + h - 0.012, z), r - 0.01, 0.03, segs=28, bev=0.004, tint=0.8)
    solid(L, x, z, r, 0.0, y, y + h)
    surface(L, x - r * 0.7, x + r * 0.7, z - r * 0.7, z + r * 0.7, y + h + 0.015, 'drum')


def tyre(K, x, y, z, r=0.31, w=0.19, axis='y', tint=1.0, blocks=True):
    """a bare tyre: dusty sidewalls, the darker tread band round it with its blocks"""
    prof = [(r - 0.11, -w * 0.32), (r - 0.06, -w * 0.5), (r - 0.012, -w * 0.48), (r, -w * 0.3), (r, w * 0.3), (r - 0.012, w * 0.48), (r - 0.06, w * 0.5), (r - 0.11, w * 0.32)]
    t = tint if isinstance(tint, tuple) else (tint, tint, tint)
    K.lathe('rubber', (x, y, z), prof + [prof[0]], segs=30, axis=axis, sharp=50, tint=(t[0] * 1.35, t[1] * 1.32, t[2] * 1.25))
    # (the tread: a band just proud of the casing, darker, the blocks on it)
    K.lathe('rubber', (x, y, z), [(r + 0.002, -w * 0.31), (r + 0.002, w * 0.31)], segs=30, axis=axis, face='out', tint=(t[0] * 0.85, t[1] * 0.85, t[2] * 0.88), cast=False)
    if not blocks:
        return
    # tread blocks in two staggered rows
    orient = kit.axis_to(axis)
    n = 20
    for i in range(n):
        for row in (-1, 1):
            a = (i + (0.5 if row > 0 else 0.0)) / n * math.tau
            m = Matrix.Translation((x, y, z)) @ orient @ Matrix.Rotation(-a, 4, 'Y') @ Matrix.Translation((r + 0.004, row * w * 0.15, 0))
            K.box('rubber', (0, 0, 0), (0.012, w * 0.24, 0.05), matrix=m, tint=(t[0] * 0.75, t[1] * 0.75, t[2] * 0.78), cast=False)


def tyre_stack(K, L, x, z, n=5):
    w = 0.19
    for i in range(n):
        dx = K.jitter(0.03)
        dz = K.jitter(0.03)
        # (alternating tones: a line between each, as drawn)
        tyre(K, x + dx, w / 2 + i * (w + 0.002), z + dz, tint=(0.82 if i % 2 else 1.12) + K.jitter(0.05))
    solid(L, x, z, 0.32, 0.0, 0, n * w)
    surface(L, x - 0.15, x + 0.15, z - 0.15, z + 0.15, n * w, 'tyres')
