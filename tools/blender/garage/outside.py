"""
Round the outside of the workshop (docs/MODCAR.md section 9): gutters and downpipes along the eaves, a
rain barrel at one corner, flower boxes under the windows, a woodpile under a lean-to against the left
wall, a ladder against the back, an old fuel pump on the apron, a mailbox and a sign post at the gate.
"""

import math

from mathutils import Matrix, Vector

from . import deco as D
from . import props as P
from . import shell as S
from .deco import ladder, leaf_disc, potted_plant
from .machines import tint_of

V = Vector


def gutters(K, L):
    """half-round gutters under both eaves, a downpipe at each front corner and one at the back"""
    for s in (-1, 1):
        z = s * (S.Z1 + S.OVERHANG_EAVE + 0.06)
        y = S.roof_under(S.Z1 + S.OVERHANG_EAVE) - 0.12
        K.box('galv', (0, y, z), (S.X1 - S.X0 + 2 * S.OVERHANG_GABLE - 0.1, 0.09, 0.11), bev=0.02, open='+y', seg=1.0)
        for x in (S.X0 - 0.1, S.X1 + 0.1):
            K.cyl('galv', (x, y, z), 0.05, 0.02, axis='x', segs=10)
        for x in (-4.0, 0.0, 4.0):
            K.box('galv', (x, y + 0.02, z - s * 0.06), (0.02, 0.1, 0.12), bev=0.003)
        # downpipes: at the front corners, and the back left one feeds the rain barrel
        for xd in (S.X1 - 0.25, S.X0 + 0.25):
            zd = z - s * 0.0
            K.tube('galv', [(xd, y - 0.04, zd), (xd, y - 0.25, zd - s * 0.12), (xd, 0.25, zd - s * 0.12), (xd + (0.15 if xd > 0 else -0.15), 0.12, zd - s * 0.12)], 0.04, segs=10, bend=0.1)
            for yy in (1.0, 2.2, 3.2):
                K.box('galv', (xd, yy, zd - s * 0.17), (0.03, 0.03, 0.07), bev=0.004)


def rain_barrel(K, L, x, z):
    K.cyl('wood', (x, 0.42, z), 0.33, 0.84, segs=20, bev=0.01, rings=3, tint=(0.95, 0.85, 0.7))
    for hy in (0.12, 0.42, 0.72):
        K.cyl('steel', (x, hy, z), 0.345, 0.04, segs=20, bev=0.004)
    K.cyl('water', (x, 0.8, z), 0.3, 0.01, segs=20)
    K.cyl('brass', (x + 0.33, 0.18, z), 0.02, 0.06, axis='x', segs=8)
    P.solid(L, x, z, 0.36, 0.0, 0, 0.85)


def flower_box(K, wall, c, sill):
    """a long wooden box under a window outside, red geraniums and trailing green"""
    base = S.Z1 if wall == 'R' else S.Z0
    s = 1 if wall == 'R' else -1
    zc = base + s * 0.2
    y = sill - 0.24
    K.box('siding', (c, y, zc), (1.2, 0.18, 0.2), bev=0.008)
    K.box('soil', (c, y + 0.085, zc), (1.15, 0.01, 0.17), bev=0.0)
    for k in range(5):
        x = c - 0.48 + k * 0.24
        for i in range(5):
            a = i * 1.3 + k
            leaf_disc(K, V((x + math.cos(a) * 0.05, y + 0.12 + 0.03 * (i % 2), zc + math.sin(a) * 0.05)), V((math.cos(a), 0.6, math.sin(a))), 0.045)
        for f in range(2):
            fc = V((x + 0.03 * f, y + 0.22 + 0.03 * f, zc + 0.02 * (f - 0.5)))
            for j in range(6):
                b = j / 6 * math.tau
                K.cyl('tinted_matte', fc + V((math.cos(b) * 0.014, 0, math.sin(b) * 0.014)), 0.012, 0.01, segs=6, tint=tint_of(0xc8323a if (k + f) % 3 else 0xe8a3a8))
    for sx in (-0.45, 0.45):
        K.box('steel', (c + sx, y - 0.04, base + s * 0.08), (0.03, 0.1, 0.16), bev=0.004)


def woodpile(K, L, x0, x1, z):
    """split logs stacked against the left wall outside, under a little lean-to roof"""
    zf = z - 0.55
    for row in range(5):
        y = 0.12 + row * 0.15
        n = int((x1 - x0) / 0.15)
        for i in range(n):
            x = x0 + 0.08 + i * (x1 - x0 - 0.16) / max(1, n - 1) + K.jitter(0.015)
            r = 0.065 + K.jitter(0.01)
            yy = y + K.jitter(0.01)
            ln = 0.5 + K.jitter(0.04)
            # grey-brown bark, the pale sawn end to the yard
            K.cyl('wood_dark', (x, yy, z - 0.3), r, ln, axis='z', segs=7, smooth=False, tint=(0.82 + K.jitter(0.08), 0.78, 0.74))
            K.cyl('wood', (x, yy, z - 0.3 - ln / 2 - 0.002), r * 0.86, 0.004, axis='z', segs=7, tint=(1.15 + K.jitter(0.06), 1.05, 0.9), cast=False)
    for xx in (x0, x1):
        K.box('wood_dark', (xx, 0.55, zf + 0.05), (0.08, 1.1, 0.08), bev=0.008)
    K.box('tin_out', ((x0 + x1) / 2, 1.18, z - 0.32), (x1 - x0 + 0.4, 0.03, 0.75), rot=(10, 0, 0), bev=0.0)
    K.box('wood_dark', ((x0 + x1) / 2, 0.06, z - 0.3), (x1 - x0, 0.06, 0.55), bev=0.006)
    P.solid(L, (x0 + x1) / 2, z - 0.3, (x1 - x0) / 2 + 0.05, 0.33, 0, 1.2)


def fuel_pump(K, L, x, z, yaw=0.0):
    """an old fuel pump on a concrete island: a tall red body, the round glass head, the hose on its hook"""
    K.box('plinth', (x, 0.08, z), (0.7, 0.16, 0.55), bev=0.02)
    K.box('p_red', (x, 0.85, z), (0.4, 1.35, 0.32), bev=0.03, seg=0.5)
    K.box('p_cream', (x, 0.95, z + 0.162), (0.28, 0.4, 0.01), bev=0.004)
    for k in range(3):
        K.box('p_black', (x - 0.07 + k * 0.07, 1.02, z + 0.168), (0.05, 0.08, 0.004), bev=0.0)
    K.cyl('p_cream', (x, 1.68, z), 0.2, 0.2, axis='z', segs=24, bev=0.02)
    K.cyl('glass', (x, 1.68, z + 0.103), 0.16, 0.01, axis='z', segs=24)
    K.cyl('tinted', (x, 1.68, z + 0.098), 0.15, 0.004, axis='z', segs=24, tint=tint_of(0xf0c23c))
    K.cyl('p_red', (x, 1.82, z), 0.06, 0.08, segs=12, bev=0.01)
    K.box('steel', (x + 0.21, 1.0, z), (0.04, 0.12, 0.08), bev=0.006)
    K.tube('p_black', [(x + 0.2, 1.25, z), (x + 0.4, 0.9, z + 0.1), (x + 0.38, 0.35, z + 0.15), (x + 0.24, 0.95, z + 0.02)], 0.016, segs=6, bend=0.12)
    K.box('steel', (x + 0.24, 1.0, z + 0.02), (0.05, 0.16, 0.04), rot=(0, 0, -20), bev=0.006)
    P.solid(L, x, z, 0.36, 0.3, 0, 1.9)


def mailbox(K, x, z):
    K.box('wood_dark', (x, 0.55, z), (0.08, 1.1, 0.08), bev=0.008)
    K.box('p_blue', (x, 1.18, z), (0.42, 0.22, 0.24), bev=0.03)
    K.box('p_red', (x + 0.02, 1.3, z + 0.13), (0.04, 0.12, 0.012), bev=0.004)


def sign_post(K, x, z):
    """a hand-painted sign on two posts at the gate: a cream board with a red wheel and a spanner on it"""
    for dz in (-0.55, 0.55):
        K.box('wood_dark', (x, 0.9, z + dz), (0.08, 1.8, 0.08), bev=0.008)
    K.box('p_cream', (x, 1.45, z), (0.05, 0.6, 1.3), bev=0.012)
    for dy in (0.32, -0.32):
        K.box('wood', (x, 1.45 + dy, z), (0.06, 0.04, 1.36), bev=0.006)
    # the painting: a red wheel, a spanner across it
    K.lathe('p_red', (x + 0.028, 1.45, z - 0.25), [(0.12, -0.003), (0.17, -0.003), (0.17, 0.003), (0.12, 0.003)], segs=28, axis='x')
    K.cyl('p_red', (x + 0.028, 1.45, z - 0.25), 0.05, 0.006, axis='x', segs=16)
    for k in range(5):
        a = k / 5 * math.tau
        K.box('p_red', (x + 0.028, 1.45 + math.cos(a) * 0.085, z - 0.25 + math.sin(a) * 0.085), (0.006, 0.07, 0.016), rot=(-math.degrees(a), 0, 0), bev=0.0)
    K.box('p_blue', (x + 0.03, 1.45, z + 0.22), (0.006, 0.05, 0.5), rot=(25, 0, 0), bev=0.0)
    for s in (-1, 1):
        K.cyl('p_blue', (x + 0.03, 1.45 + s * 0.1, z + 0.22 + s * 0.22), 0.045, 0.006, axis='x', segs=12)



def bench(K, L, x, z, length=1.6):
    """a weathered garden bench against the front wall, a pot of geraniums and a mug on it"""
    grey = (0.78, 0.76, 0.74)
    y = 0.45
    for k in range(3):
        K.box('wood', (x + 0.06 - k * 0.13, y, z), (0.11, 0.035, length), bev=0.008, tint=grey, seg=0.8)
    for k in range(2):
        K.box('wood', (x - 0.2, y + 0.3 + k * 0.17, z), (0.03, 0.11, length), rot=(0, 0, -8), bev=0.008, tint=grey, seg=0.8)
    for dz in (-length / 2 + 0.12, length / 2 - 0.12):
        K.box('wood_dark', (x + 0.08, y / 2, z + dz), (0.06, y, 0.06), bev=0.006)
        K.box('wood_dark', (x - 0.2, (y + 0.62) / 2, z + dz), (0.06, y + 0.62, 0.06), rot=(0, 0, -8), bev=0.006)
        K.box('wood_dark', (x - 0.06, y - 0.05, z + dz), (0.36, 0.05, 0.05), bev=0.006)
    D.potted_plant(K, x - 0.02, y + 0.018, z + length / 2 - 0.3, 1.3, 'geranium')
    D.mug(K, x + 0.02, y + 0.018, z - length / 2 + 0.35, tint=(0.95, 0.92, 0.85))
    P.solid(L, x - 0.06, z, 0.22, length / 2, 0, y + 0.6)


def weathervane(K, x, z):
    """a rooster on the ridge over the doors, his arrow, the four arms of the compass under him"""
    base = S.roof_under(0) + 0.06
    K.box('p_black', (x, base + 0.03, z), (0.12, 0.06, 0.1), bev=0.006)
    K.cyl('p_black', (x, base + 0.45, z), 0.014, 0.85, segs=8)
    # the compass arms with a ball at each end
    for (dx, dz) in ((1, 0), (-1, 0), (0, 1), (0, -1)):
        K.cyl('p_black', (x + dx * 0.16, base + 0.5, z + dz * 0.16), 0.007, 0.32, axis='x' if dx else 'z', segs=6)
        K.cyl('p_black', (x + dx * 0.33, base + 0.5, z + dz * 0.33), 0.022, 0.03, segs=8)
    K.cyl('p_black', (x, base + 0.5, z), 0.025, 0.04, segs=8)
    # the arrow (pointing along z, so the road sees the rooster side on)
    m = Matrix(((0, 0, -1, x), (0, 1, 0, base + 0.78), (1, 0, 0, z), (0, 0, 0, 1)))
    K.box('p_black', (x, base + 0.78, z), (0.012, 0.012, 0.62))
    K.prism('p_black', [(0.31, 0.0), (0.22, 0.06), (0.24, 0.0), (0.22, -0.06)], 0.01, m)
    K.prism('p_black', [(-0.31, 0.09), (-0.2, 0.0), (-0.31, -0.09), (-0.26, 0.0)], 0.01, m)
    # the rooster
    rooster = [(-0.24, 0.1), (-0.2, 0.3), (-0.14, 0.38), (-0.12, 0.26), (-0.06, 0.34), (-0.04, 0.22), (0.02, 0.18), (0.1, 0.22),
               (0.12, 0.3), (0.1, 0.34), (0.14, 0.4), (0.17, 0.36), (0.2, 0.38), (0.21, 0.33), (0.25, 0.3), (0.2, 0.27),
               (0.17, 0.22), (0.16, 0.12), (0.1, 0.04), (0.04, 0.02), (0.05, -0.04), (0.08, -0.06), (0.0, -0.06), (-0.02, 0.0),
               (-0.1, 0.02), (-0.18, 0.04)]
    m2 = Matrix(((0, 0, -1, x), (0, 1, 0, base + 0.8), (1, 0, 0, z), (0, 0, 0, 1)))
    K.prism('p_black', rooster, 0.012, m2)
