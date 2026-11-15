"""
The things that make the workshop lived in (docs/MODCAR.md section 9): tools on the pegboard, the
bench's clutter (jars of bolts, a mug and a thermos, a desk fan, rags, a parts tray), what fills the
shelves between the parts, cardboard boxes and crates, plants on the sills, a broom, the extinguisher,
posters, planks and a ladder stored over the tie beams, a bicycle hung from the roof.

Most of it is in the 'tinted' and 'tinted_matte' materials (white paint whose colour is the per-object
tint) so a hundred little colourful things are a couple of draw calls.
"""

import math

import bmesh
from mathutils import Matrix, Vector

from . import _kit as kit
from . import props as P
from . import shell as S
from .machines import tint_of

V = Vector

PAINT = [0xc8323a, 0x3e8e87, 0xf0c23c, 0x2e4a6b, 0xe07b39, 0x557a46, 0xf4efe2, 0x6b4a73, 0x7fb3d5, 0xd4a53b, 0xb85c3e]


def T(K, choices=None):
    return tint_of(K.pick(choices or PAINT))


# ---------------------------------------------------------------------------------------------- small things

def jar(K, x, y, z, r=0.045, h=0.11, fill=None):
    """a glass jar of screws, its lid a colour"""
    K.cyl('glass', (x, y + h / 2, z), r, h, segs=14)
    K.cyl('tinted', (x, y + h + 0.01, z), r * 1.02, 0.02, segs=14, bev=0.003, tint=T(K))
    if fill:
        K.cyl('steel', (x, y + h * 0.3, z), r * 0.88, h * 0.55, segs=12, tint=fill)


def can(K, x, y, z, r=0.05, h=0.14, tint=None, lid='galv'):
    K.cyl('tinted', (x, y + h / 2, z), r, h, segs=16, bev=0.003, tint=tint or T(K))
    K.cyl(lid, (x, y + h + 0.004, z), r * 0.97, 0.008, segs=16)
    K.cyl(lid, (x, y + 0.004, z), r * 1.005, 0.008, segs=16)


def oil_bottle(K, x, y, z, yaw=0.0, tint=None):
    m = kit.mat4((x, y, z), (0, yaw, 0))
    K.box('tinted', (0, 0, 0), (0.07, 0.2, 0.12), matrix=m @ Matrix.Translation((0, 0.1, 0)), bev=0.012, tint=tint or T(K))
    K.cyl('tinted', (0, 0, 0), 0.016, 0.04, matrix=m @ Matrix.Translation((0, 0.22, 0.03)), segs=10, tint=tint_of(0x2f3236))


def mug(K, x, y, z, tint=None):
    K.lathe('tinted', (x, y, z), [(0.0, 0.0), (0.038, 0.0), (0.04, 0.09), (0.034, 0.09), (0.032, 0.008), (0.0, 0.008)], segs=16, tint=tint or T(K))
    K.tube('tinted', [(x + 0.038, y + 0.07, z), (x + 0.065, y + 0.065, z), (x + 0.065, y + 0.025, z), (x + 0.038, y + 0.02, z)], 0.007, segs=6, bend=0.015, tint=tint or T(K))


def thermos(K, x, y, z):
    K.cyl('p_green', (x, y + 0.14, z), 0.045, 0.28, segs=16, bev=0.006)
    K.cyl('steel', (x, y + 0.3, z), 0.04, 0.04, segs=16, bev=0.004)
    K.cyl('steel', (x, y + 0.02, z), 0.047, 0.04, segs=16, bev=0.004)


def rag(K, x, y, z, w=0.22, d=0.18, tint=(0.85, 0.45, 0.35)):
    """a crumpled rag: a lumpy flattened blob"""
    bm = bmesh.new()
    res = bmesh.ops.create_icosphere(bm, subdivisions=2, radius=1.0)
    for v in bm.verts:
        n = math.sin(v.co.x * 5.1 + v.co.z * 3.3) * 0.18 + math.sin(v.co.z * 7.7) * 0.12
        v.co = V((v.co.x * w * (0.5 + n * 0.3), max(-0.2, v.co.y) * 0.03 + 0.012 + n * 0.012, v.co.z * d * (0.5 + n * 0.2)))
    bmesh.ops.transform(bm, matrix=Matrix.Translation((x, y, z)) @ kit.rot3((0, K.rng.random() * 360, 0)).to_4x4(), verts=bm.verts[:])
    K.mesh('cloth', bm, tint=tint, smooth=True, sharp=70)


def cardboard(K, L, x, z, w, h, d, yaw=0.0, y=0.0, open_top=False, solid=True):
    """a cardboard box (tape along the top, flaps up if open)"""
    m = kit.mat4((x, y, z), (0, yaw, 0))
    k = 1.0 + K.jitter(0.08)
    K.box('cardboard', (0, 0, 0), (w, h, d), matrix=m @ Matrix.Translation((0, h / 2, 0)), bev=0.006, tint=(k, k * 0.98, k * 0.94))
    if open_top:
        for s in (-1, 1):
            K.box('cardboard', (0, 0, 0), (w, 0.005, d * 0.5), matrix=m @ Matrix.Translation((0, h, s * d * 0.5)) @ kit.rot3((s * 70, 0, 0)).to_4x4() @ Matrix.Translation((0, 0, s * d * 0.24)), bev=0.0, tint=(k * 0.95, k * 0.92, k * 0.88))
    else:
        K.box('tinted_matte', (0, 0, 0), (w + 0.002, 0.004, 0.05), matrix=m @ Matrix.Translation((0, h + 0.001, 0)), bev=0.0, tint=tint_of(0xd8c29a))
    if solid:
        P.solid(L, x, z, max(w, d) / 2, 0.0, y, y + h)
        P.surface(L, x - w * 0.4, x + w * 0.4, z - d * 0.4, z + d * 0.4, y + h, 'box')


def crate(K, L, x, z, w=0.6, h=0.42, d=0.4, yaw=0.0, y=0.0):
    """a slatted wooden crate"""
    m = kit.mat4((x, y, z), (0, yaw, 0))
    for k in range(3):
        yy = 0.06 + k * (h - 0.06) / 2.6
        for s in (-1, 1):
            K.box('wood', (0, 0, 0), (w, 0.09, 0.018), matrix=m @ Matrix.Translation((0, yy, s * (d / 2 - 0.009))), bev=0.003, tint=P.wood(K, 0.12))
            K.box('wood', (0, 0, 0), (0.018, 0.09, d), matrix=m @ Matrix.Translation((s * (w / 2 - 0.009), yy, 0)), bev=0.003, tint=P.wood(K, 0.12))
    for (sx, sz) in ((-1, -1), (-1, 1), (1, -1), (1, 1)):
        K.box('wood_dark', (0, 0, 0), (0.04, h, 0.04), matrix=m @ Matrix.Translation((sx * (w / 2 - 0.03), h / 2, sz * (d / 2 - 0.03))), bev=0.004)
    K.box('wood', (0, 0, 0), (w - 0.02, 0.015, d - 0.02), matrix=m @ Matrix.Translation((0, 0.01, 0)), bev=0.002, tint=P.wood(K, 0.12))
    P.solid(L, x, z, max(w, d) / 2, 0.0, y, y + h)
    P.surface(L, x - w * 0.42, x + w * 0.42, z - d * 0.42, z + d * 0.42, y + h, 'crate')


# ---------------------------------------------------------------------------------------------- the pegboard's tools

def pegboard_tools(K, x0, x1, y0, y1):
    """spanners in a row by size, hammers, screwdrivers, pliers, a saw, a coil of wire, outlines painted round them"""
    z = S.Z0 + 0.14
    zf = z + 0.012

    def outline(cx, cy, w, h):
        K.box('tinted_matte', (cx, cy, zf - 0.003), (w, h, 0.002), bev=0.0, tint=tint_of(0x2f3236))

    def hook(cx, cy):
        K.tube('steel', [(cx, cy, z), (cx, cy, zf + 0.04), (cx, cy + 0.02, zf + 0.05)], 0.003, segs=4)

    # spanners, smallest to biggest
    for i in range(8):
        cx = x0 + 0.15 + i * 0.07
        ln = 0.14 + i * 0.018
        cy = y1 - 0.18 - ln / 2
        hook(cx, cy + ln / 2 + 0.01)
        K.box('chrome', (cx, cy, zf + 0.012), (0.018 + i * 0.002, ln, 0.006), bev=0.002)
        K.cyl('chrome', (cx, cy + ln / 2, zf + 0.012), 0.016 + i * 0.002, 0.007, axis='z', segs=10)
        K.cyl('chrome', (cx, cy - ln / 2, zf + 0.012), 0.014 + i * 0.002, 0.007, axis='z', segs=8)
    # hammers
    for i, (hx, hl) in enumerate(((x0 + 0.85, 0.32), (x0 + 1.0, 0.28))):
        cy = y1 - 0.42
        hook(hx, cy + hl / 2 + 0.02)
        hook(hx + 0.05, cy + hl / 2 + 0.02)
        K.box('wood', (hx, cy, zf + 0.016), (0.025, hl, 0.02), bev=0.005, tint=(1.1, 0.9, 0.7))
        K.box('steel', (hx, cy + hl / 2, zf + 0.016), (0.11 if i == 0 else 0.08, 0.035, 0.03), bev=0.006)
    # screwdrivers: a rack of them, handles in colours
    rx = x0 + 1.25
    K.box('wood_dark', (rx + 0.15, y1 - 0.25, zf + 0.03), (0.36, 0.03, 0.06), bev=0.004)
    for i in range(6):
        cx = rx + 0.02 + i * 0.055
        K.cyl('tinted', (cx, y1 - 0.2, zf + 0.03), 0.013, 0.09, segs=8, bev=0.003, tint=T(K, [0xc8323a, 0xf0c23c, 0x3e8e87, 0x2e4a6b]))
        K.cyl('chrome', (cx, y1 - 0.34, zf + 0.03), 0.004, 0.16, segs=6)
    # pliers
    for i in range(3):
        cx = x0 + 1.75 + i * 0.09
        cy = y1 - 0.3
        hook(cx, cy + 0.12)
        for s in (-1, 1):
            K.box('tinted', (cx + s * 0.012, cy - 0.03, zf + 0.012), (0.012, 0.14, 0.01), rot=(0, 0, s * 6), bev=0.003, tint=tint_of(0xc8323a if i != 1 else 0xf0c23c))
        K.box('steel', (cx, cy + 0.07, zf + 0.012), (0.025, 0.06, 0.012), bev=0.003)
    # a saw
    sx, sy = x0 + 0.5, y0 + 0.42
    hook(sx + 0.24, sy + 0.08)
    K.prism('steel', [(-0.25, -0.05), (0.2, -0.08), (0.2, 0.06), (-0.25, 0.02)], 0.003, kit.mat4((sx, sy, zf + 0.008)), bev=0.0)
    K.box('wood', (sx + 0.27, sy, zf + 0.012), (0.12, 0.1, 0.022), bev=0.008, tint=(1.1, 0.85, 0.6))
    # a coil of wire and a tape measure
    K.lathe('brass', (x1 - 0.35, y0 + 0.45, zf + 0.02), [(0.06, -0.012), (0.085, -0.012), (0.085, 0.012), (0.06, 0.012)], segs=20, axis='z')
    K.box('p_yellow', (x1 - 0.18, y0 + 0.42, zf + 0.025), (0.07, 0.07, 0.04), bev=0.012)
    # a clipboard with a list
    K.box('wood', (x1 - 0.28, y1 - 0.3, zf + 0.008), (0.22, 0.3, 0.006), bev=0.002, tint=(1.0, 0.85, 0.6))
    K.box('paper', (x1 - 0.28, y1 - 0.32, zf + 0.012), (0.19, 0.24, 0.002), bev=0.0)
    for k in range(6):
        K.box('tinted_matte', (x1 - 0.29, y1 - 0.24 - k * 0.032, zf + 0.0135), (0.14 - 0.02 * (k % 3), 0.005, 0.001), bev=0.0, tint=tint_of(0x2e4a6b))
    K.box('steel', (x1 - 0.28, y1 - 0.16, zf + 0.016), (0.08, 0.025, 0.012), bev=0.004)


# ---------------------------------------------------------------------------------------------- the bench's clutter

def bench_clutter(K, L):
    zb = S.Z0 + 0.12
    y = P.BENCH_TOP
    # along the back edge of the top: jars, cans, a parts tray, an oil can
    x = -4.4
    for i in range(5):
        jar(K, x + i * 0.11, y, zb + 0.02 + K.jitter(0.01), r=0.04 + K.jitter(0.005), h=0.1 + K.jitter(0.02), fill=(0.8, 0.75, 0.6))
    for i in range(3):
        can(K, -3.65 + i * 0.12, y, zb + 0.03, r=0.045, h=0.12 + K.jitter(0.02))
    # a parts tray with bolts
    K.box('steel', (-2.9, y + 0.02, zb + 0.08), (0.36, 0.04, 0.2), bev=0.004, open='+y')
    for k in range(12):
        K.cyl('steel', (-3.05 + (k % 6) * 0.06, y + 0.04, zb + 0.04 + (k // 6) * 0.08), 0.01, 0.025, segs=6)
    # the radio's end of the bench: a mug, the thermos, a rag
    mug(K, -1.65, y, zb + 0.12)
    thermos(K, -1.5, y, zb + 0.05)
    rag(K, -2.25, y, -4.55, tint=(0.8, 0.42, 0.32))
    # a small bench grinder by the vice
    gx = 0.3
    K.box('p_green', (gx, y + 0.07, zb + 0.1), (0.14, 0.14, 0.22), bev=0.015)
    for s in (-1, 1):
        K.cyl('steel', (gx, y + 0.13, zb + 0.1 + s * 0.17), 0.075, 0.025, axis='z', segs=20, bev=0.004)
        K.lathe('p_green', (gx, y + 0.13, zb + 0.1 + s * 0.17), [(0.0, -0.03), (0.085, -0.03), (0.085, 0.03), (0.0, 0.03)], segs=20, axis='z', angle=math.pi, start=0.0)
    # a desk fan on the left end
    fx, fz = -4.25, -4.45
    K.cyl('p_cream', (fx, y + 0.015, fz), 0.08, 0.03, segs=18, bev=0.006)
    K.cyl('p_cream', (fx, y + 0.12, fz), 0.012, 0.2, segs=8)
    K.cyl('p_cream', (fx + 0.03, y + 0.25, fz), 0.045, 0.08, axis='x', segs=16, bev=0.008)
    K.mover('FAN', (fx + 0.09, y + 0.25, fz))
    for k in range(3):
        a = k * math.tau / 3
        K.box('alu', (fx + 0.095, y + 0.25 + math.cos(a) * 0.055, fz + math.sin(a) * 0.055), (0.008, 0.1, 0.045), rot=(math.degrees(-a), 0, 25), bev=0.004, mover='FAN')
    for k in range(10):
        a = k / 10 * math.tau
        K.tube('steel', [(fx + 0.07, y + 0.25 + math.cos(a) * 0.12, fz + math.sin(a) * 0.12), (fx + 0.12, y + 0.25 + math.cos(a) * 0.1, fz + math.sin(a) * 0.1), (fx + 0.135, y + 0.25, fz)], 0.0025, segs=4, caps=False)
    K.lathe('steel', (fx + 0.09, y + 0.25, fz), [(0.12, -0.003), (0.125, -0.003), (0.125, 0.003), (0.12, 0.003)], segs=24, axis='x')
    # newspaper and a notebook
    K.box('paper', (-2.5, y + 0.004, -4.62), (0.3, 0.008, 0.42), rot=(0, 12, 0), bev=0.0)
    K.box('tinted_matte', (-2.5, y + 0.0085, -4.62), (0.26, 0.001, 0.1), rot=(0, 12, 0), bev=0.0, tint=tint_of(0x9e3b2f))
    # under the bench, on its low shelf: crates of junk, a toolbox
    K.box('p_red', (-0.4, 0.38, -4.55), (0.5, 0.2, 0.24), bev=0.012)
    K.tube('steel', [(-0.6, 0.48, -4.55), (-0.6, 0.55, -4.55), (-0.2, 0.55, -4.55), (-0.2, 0.48, -4.55)], 0.01, segs=6, bend=0.03)
    for i in range(4):
        can(K, 0.25 + i * 0.13, 0.275, -4.75, r=0.055, h=0.16, tint=T(K))


# ---------------------------------------------------------------------------------------------- shelves

def shelf_fill(K, L, x0, x1, levels, z0, z1, spot_xs):
    """jars, cans, boxes and bottles between the spots where the parts lie"""
    for y in levels:
        x = x0 + 0.05
        while x < x1 - 0.1:
            if any(abs(x - sx) < 0.42 for sx in spot_xs):
                x += 0.1
                continue
            k = K.rng.random()
            zz = z1 - 0.12 - K.rng.random() * 0.12
            if k < 0.3:
                can(K, x, y, zz, r=0.05 + K.jitter(0.01), h=0.12 + K.jitter(0.03))
                x += 0.12
            elif k < 0.5:
                oil_bottle(K, x, y, zz, yaw=K.jitter(20))
                x += 0.1
            elif k < 0.7:
                jar(K, x, y, zz, fill=(0.75, 0.7, 0.6))
                x += 0.1
            elif k < 0.85:
                w = 0.18 + K.rng.random() * 0.12
                cardboard(K, L, x + w / 2, zz - 0.05, w, 0.12 + K.rng.random() * 0.1, 0.22, yaw=K.jitter(8), y=y, solid=False)
                x += w + 0.05
            else:
                x += 0.08


# ---------------------------------------------------------------------------------------------- plants

def potted_plant(K, x, y, z, size=1.0, kind='geranium'):
    """a terracotta pot with a plant: a geranium (round leaves, red flowers), a fern, or a snake plant"""
    r = 0.075 * size
    h = 0.12 * size
    K.lathe('pot', (x, y, z), [(0.0, 0.0), (r * 0.72, 0.0), (r, h * 0.85), (r * 1.12, h * 0.85), (r * 1.12, h), (r * 0.94, h), (r * 0.9, h * 0.92), (0.0, h * 0.92)], segs=16, sharp=50, tint=(1.0 + K.jitter(0.06), 1.0, 1.0))
    K.cyl('soil', (x, y + h * 0.9, z), r * 0.92, 0.01, segs=14)
    top = y + h * 0.9
    n = int(14 * size) + 6
    for i in range(n):
        a = i * 2.39996 + K.rng.random() * 0.4
        if kind == 'snake':
            hh = (0.18 + K.rng.random() * 0.2) * size
            lean = 0.1 + K.rng.random() * 0.2
            base = V((x + math.cos(a) * r * 0.3, top, z + math.sin(a) * r * 0.3))
            tip = base + V((math.cos(a) * lean * hh, hh, math.sin(a) * lean * hh))
            leaf_blade(K, base, tip, 0.022 * size, 'leaf_dark', twist=a)
            continue
        el = 0.35 + K.rng.random() * 0.75
        ln = (0.09 + K.rng.random() * 0.06) * size * (1.4 if kind == 'fern' else 1.0)
        d = V((math.cos(a) * math.cos(el), math.sin(el), math.sin(a) * math.cos(el)))
        base = V((x, top + 0.01, z))
        stem_end = base + d * ln * 0.7
        if kind == 'fern':
            leaf_blade(K, base, base + d * ln * 1.6 + V((0, -0.04 * size, 0)), 0.03 * size, 'leaf', twist=a, droop=0.06 * size)
        else:
            K.tube('leaf_dark', [base, stem_end], 0.003, segs=4, caps=False)
            leaf_disc(K, stem_end, d, 0.035 * size * (0.8 + K.rng.random() * 0.4))
    if kind == 'geranium':
        for i in range(3):
            a = i * 2.1 + 0.5
            c = V((x + math.cos(a) * r * 0.9, top + 0.14 * size + K.rng.random() * 0.04, z + math.sin(a) * r * 0.9))
            K.tube('leaf_dark', [V((x, top, z)), c], 0.0025, segs=4, caps=False)
            for k in range(7):
                b = k / 7 * math.tau
                K.cyl('tinted_matte', c + V((math.cos(b) * 0.012, 0.004 * math.sin(b * 3), math.sin(b) * 0.012)), 0.01, 0.008, segs=6, tint=tint_of(0xc8323a))


def leaf_disc(K, c, d, r):
    """a round leaf facing up and out"""
    bm = bmesh.new()
    n = V(d).normalized()
    up = V((0, 1, 0))
    nn = (n + up * 1.4).normalized()
    u = nn.orthogonal().normalized()
    w = nn.cross(u)
    k = 7
    cv = bm.verts.new(c + nn * r * 0.15)
    ring = [bm.verts.new(c + (u * math.cos(i / k * math.tau) + w * math.sin(i / k * math.tau)) * r - nn * r * 0.12) for i in range(k)]
    for i in range(k):
        bm.faces.new((cv, ring[i], ring[(i + 1) % k]))
    K.mesh('leaf', bm, tint=(1.0 + K.jitter(0.12), 1.0 + K.jitter(0.08), 1.0), smooth=True, sharp=80)


def leaf_blade(K, a, b, w, mat, twist=0.0, droop=0.0):
    """a long leaf from a to b, widest a third of the way, a little curved"""
    bm = bmesh.new()
    a = V(a)
    b = V(b)
    d = b - a
    t = d.normalized()
    side = t.cross(V((math.cos(twist), 0.0, math.sin(twist)))).normalized()
    if side.length < 0.1:
        side = V((1, 0, 0))
    segs = 5
    left = []
    right = []
    for i in range(segs + 1):
        u = i / segs
        ww = w * math.sin(math.pi * min(1.0, u * 1.3)) * (1.0 - 0.6 * u)
        p = a + d * u + V((0, -droop * u * u, 0))
        left.append(bm.verts.new(p + side * ww))
        right.append(bm.verts.new(p - side * ww))
    for i in range(segs):
        bm.faces.new((left[i], right[i], right[i + 1], left[i + 1]))
    K.mesh(mat, bm, tint=(1.0 + K.jitter(0.1), 1.0 + K.jitter(0.08), 1.0), smooth=True, sharp=80)


def hanging_plant(K, x, y, z, length=0.7):
    """a pot hung from a beam on three cords, long trailing stems of leaves"""
    K.lathe('pot', (x, y, z), [(0.0, 0.0), (0.06, 0.0), (0.1, 0.11), (0.11, 0.12), (0.0, 0.11)], segs=14)
    for k in range(3):
        a = k * math.tau / 3
        K.tube('rope', [(x + math.cos(a) * 0.1, y + 0.11, z + math.sin(a) * 0.1), (x, y + 0.55, z)], 0.003, segs=4, caps=False)
    for s in range(7):
        a = s * 0.9
        ln = length * (0.5 + 0.5 * K.rng.random())
        pts = [V((x + math.cos(a) * 0.08, y + 0.11, z + math.sin(a) * 0.08))]
        for i in range(1, 6):
            u = i / 5
            pts.append(V((x + math.cos(a) * (0.1 + 0.06 * u), y + 0.1 - ln * u, z + math.sin(a) * (0.1 + 0.06 * u))))
        K.tube('leaf_dark', pts, 0.003, segs=4, caps=False)
        for i in range(1, 8):
            p = pts[0].lerp(pts[-1], i / 8)
            leaf_disc(K, p + V((math.cos(a) * 0.02, 0, math.sin(a) * 0.02)), V((math.cos(a + i), -0.3, math.sin(a + i))), 0.022)


# ---------------------------------------------------------------------------------------------- walls and corners

def poster(K, x, y, z, w, h, nx, ny_, design):
    """a paper poster flat on a wall (facing nx, 0, nz) with a simple painted design"""
    nrm = V((nx, 0, ny_)).normalized()
    side = V((0, 1, 0)).cross(nrm).normalized()
    base = V((x, y, z)) + nrm * 0.008

    def quad(mat, c, sw, sh, tint, off):
        bm = bmesh.new()
        cc = base + nrm * off + side * c[0] + V((0, c[1], 0))
        vs = [bm.verts.new(cc + side * (-sw / 2) + V((0, -sh / 2, 0))), bm.verts.new(cc + side * (sw / 2) + V((0, -sh / 2, 0))),
              bm.verts.new(cc + side * (sw / 2) + V((0, sh / 2, 0))), bm.verts.new(cc + side * (-sw / 2) + V((0, sh / 2, 0)))]
        f = bm.faces.new(vs)
        f.normal_update()
        if f.normal.dot(nrm) < 0:
            f.normal_flip()
        K.mesh(mat, bm, tint=tint)

    quad('paper', (0, 0), w, h, (1.0, 0.97, 0.9), 0.0)
    if design == 'car':
        # a stylised little car on a road under a sun: our own drawing
        quad('tinted_matte', (0, h * 0.22), w * 0.86, h * 0.42, tint_of(0x7fb3d5), 0.001)
        quad('tinted_matte', (w * 0.2, h * 0.32), w * 0.18, w * 0.18, tint_of(0xf0c23c), 0.002)
        quad('tinted_matte', (0, -h * 0.02), w * 0.86, h * 0.1, tint_of(0x557a46), 0.0015)
        quad('tinted_matte', (-w * 0.08, h * 0.06), w * 0.42, h * 0.1, tint_of(0xc8323a), 0.003)
        quad('tinted_matte', (-w * 0.1, h * 0.14), w * 0.24, h * 0.08, tint_of(0xc8323a), 0.003)
        for s in (-1, 1):
            quad('tinted_matte', (-w * 0.08 + s * w * 0.14, h * 0.0), w * 0.08, w * 0.08, tint_of(0x2f3236), 0.004)
        quad('tinted_matte', (0, -h * 0.3), w * 0.7, h * 0.06, tint_of(0x2f3236), 0.001)
        quad('tinted_matte', (0, -h * 0.4), w * 0.5, h * 0.035, tint_of(0x9e3b2f), 0.001)
    elif design == 'oil':
        quad('tinted_matte', (0, 0), w * 0.9, h * 0.92, tint_of(0x2e4a6b), 0.001)
        quad('tinted_matte', (0, h * 0.12), w * 0.5, w * 0.5, tint_of(0xf0c23c), 0.002)
        quad('tinted_matte', (0, h * 0.12), w * 0.3, w * 0.3, tint_of(0xc8323a), 0.003)
        quad('tinted_matte', (0, -h * 0.28), w * 0.7, h * 0.08, tint_of(0xf4efe2), 0.002)
    elif design == 'map':
        quad('tinted_matte', (0, 0), w * 0.92, h * 0.9, tint_of(0xd8c29a), 0.001)
        # the long road across country, the way the journey goes
        pts = [(-0.42, -0.35), (-0.25, -0.15), (-0.3, 0.05), (-0.05, 0.12), (0.1, 0.3), (0.32, 0.25), (0.4, 0.4)]
        for (a, b) in zip(pts, pts[1:]):
            cx = (a[0] + b[0]) / 2 * w
            cy = (a[1] + b[1]) / 2 * h
            quad('tinted_matte', (cx, cy), abs(b[0] - a[0]) * w + 0.012, abs(b[1] - a[1]) * h + 0.012, tint_of(0xc8323a), 0.002)
        for (cx, cy, r, col) in ((-0.3, 0.3, 0.12, 0x557a46), (0.25, -0.2, 0.15, 0x7a7f45), (0.3, 0.05, 0.06, 0x7fb3d5)):
            quad('tinted_matte', (cx * w, cy * h), r * w, r * h * 1.2, tint_of(col), 0.0015)
    # four pins
    for (sx, sy) in ((-1, -1), (-1, 1), (1, -1), (1, 1)):
        p = base + nrm * 0.004 + side * (sx * (w / 2 - 0.02)) + V((0, sy * (h / 2 - 0.02), 0))
        K.cyl('tinted', p, 0.006, 0.006, axis=(nrm.x, 0, nrm.z), segs=6, tint=tint_of(0xc8323a))


def extinguisher(K, x, y, z, nx=-1.0):
    K.cyl('p_red', (x, y + 0.25, z), 0.075, 0.42, segs=18, bev=0.01)
    K.lathe('p_red', (x, y + 0.46, z), [(0.075, 0.0), (0.06, 0.03), (0.025, 0.05), (0.0, 0.05)], segs=18)
    K.box('p_black', (x, y + 0.53, z), (0.03, 0.04, 0.05), bev=0.006)
    K.box('steel', (x, y + 0.56, z + 0.03), (0.02, 0.012, 0.09), rot=(-12, 0, 0), bev=0.003)
    K.tube('p_black', [(x, y + 0.52, z - 0.03), (x + 0.0, y + 0.5, z - 0.1), (x, y + 0.2, z - 0.09)], 0.009, segs=6, bend=0.04)
    K.box('paper', (x + nx * 0.074, y + 0.27, z), (0.004, 0.12, 0.09), bev=0.0)
    K.box('steel', (x - nx * 0.08, y + 0.4, z), (0.02, 0.04, 0.08), bev=0.004)


def broom(K, x, z, lean_to=(1, 0)):
    top = V((x + lean_to[0] * 0.04, 1.35, z + lean_to[1] * 0.04))
    bot = V((x - lean_to[0] * 0.28, 0.12, z - lean_to[1] * 0.28))
    K.tube('wood', [bot, top], 0.013, segs=8, tint=(1.1, 0.95, 0.75))
    d = (top - bot).normalized()
    K.box('wood_dark', bot, (0.06, 0.06, 0.3), rot=(0, math.degrees(math.atan2(lean_to[0], lean_to[1])), 0), bev=0.01)
    for k in range(12):
        u = (k / 11 - 0.5) * 0.26
        p = bot + V((lean_to[1] * u, -0.03, -lean_to[0] * u))
        K.tube('rope', [p, p + V((0, -0.1, 0)) - d * 0.03], 0.006, segs=4, caps=False)


def ladder(K, a, b, w=0.42):
    a = V(a)
    b = V(b)
    d = b - a
    side = d.cross(V((0, 1, 0))).normalized()
    if side.length < 0.1:
        side = V((0, 0, 1))
    for s in (-1, 1):
        K.tube('wood', [a + side * s * w / 2, b + side * s * w / 2], 0.022, segs=6, tint=(1.05, 0.95, 0.8))
    n = int(d.length / 0.3)
    for i in range(1, n):
        p = a + d * (i / n)
        K.tube('wood', [p - side * w / 2, p + side * w / 2], 0.014, segs=6, tint=(1.05, 0.95, 0.8))


def roof_store(K):
    """planks, a ladder and a spare door stored across the tie beams over the bench"""
    y = S.EAVE + 0.12
    for k in range(6):
        z = -4.55 + k * 0.17
        K.box('wood', (-3.5, y + 0.02 + (k % 2) * 0.02, z), (3.4 + K.jitter(0.3), 0.025, 0.15), bev=0.004, tint=P.wood(K, 0.15), seg=0.8)
    ladder(K, (-4.9, y + 0.07, -3.4), (-1.6, y + 0.07, -3.4), w=0.42)
    # an old car door leaning on them, and a long box
    cardboard(K, {}, -3.2, -2.75, 1.4, 0.18, 0.4, yaw=4, y=y + 0.02, solid=False)


def bicycle(K, x, y, z, yaw=0.0):
    """an old bicycle hung upside down from two hooks on a tie beam"""
    M = kit.mat4((x, y, z), (180, yaw, 0))

    def p(q):
        return tuple(M @ V(q))

    r = 0.33
    for wx in (-0.5, 0.5):
        K.lathe('rubber', p((wx, 0, 0)), [(r - 0.02, -0.016), (r, -0.01), (r, 0.01), (r - 0.02, 0.016)], segs=28, axis=tuple((M.to_3x3() @ V((0, 0, 1)))), smooth=True)
        K.lathe('chrome', p((wx, 0, 0)), [(r - 0.04, -0.008), (r - 0.022, -0.008), (r - 0.022, 0.008), (r - 0.04, 0.008)], segs=28, axis=tuple((M.to_3x3() @ V((0, 0, 1)))))
        for k in range(10):
            a = k / 10 * math.tau
            K.tube('steel', [p((wx, 0, 0)), p((wx + math.cos(a) * (r - 0.04), math.sin(a) * (r - 0.04), 0))], 0.0015, segs=3, caps=False)
    frame = [(-0.5, 0, 0), (-0.05, 0.02, 0), (0.38, 0.42, 0), (-0.1, 0.45, 0), (-0.05, 0.02, 0)]
    K.tube('p_teal', [p(q) for q in frame], 0.016, segs=8)
    K.tube('p_teal', [p((-0.1, 0.45, 0)), p((-0.5, 0, 0))], 0.012, segs=8)
    K.tube('p_teal', [p((0.38, 0.42, 0)), p((0.5, 0, 0))], 0.014, segs=8)
    K.tube('chrome', [p((0.38, 0.42, 0)), p((0.36, 0.55, 0)), p((0.3, 0.6, -0.22)), p((0.3, 0.6, 0.22))], 0.011, segs=8, bend=0.05)
    K.box('leather', p((-0.12, 0.52, 0)), (0.22, 0.05, 0.1), bev=0.02)
    K.cyl('steel', p((-0.05, 0.02, 0)), 0.07, 0.02, axis=tuple((M.to_3x3() @ V((0, 0, 1)))), segs=16)
    # the hooks
    for hx in (-0.5, 0.5):
        top = M @ V((hx, -r, 0))
        K.tube('steel', [top, V((top.x, S.EAVE - 0.1, top.z))], 0.005, segs=4)
