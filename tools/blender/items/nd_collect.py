"""
The ND keepsakes (docs/ND/PLAN.md, ND4): Nomad Drive's cassette, its four bobbleheads, its licence plate, its picture
frame and its wooden hand — in our own design, at its sizes (Cassette-01 0.159 x 0.097 x 0.019 m, Toy-Bobblehead
0.08 x 0.08 x 0.14, Plate 0.571 x 0.194 x 0.01, picture frame 0.514 x 0.514 x 0.03, wooden hand 0.15 x 0.10 x 0.39):

    blender -b --factory-startup --python tools/blender/build.py -- items/nd_collect [<model>|all] [--look] [--norender]

The junk script's conventions (items/junk.py): origin at the bottom centre, x forward, resting on z = 0; `paint` and
`paint_b` take the item's two colours. A bobblehead's head is its own child, N_head, its origin at the top of the
spring it nods on (the game wobbles it: src/game/modcar/v3/nd-collect). The plate and the frame stand up facing +x
(as a thing hung on a wall faces away from it, cargo.ts): their face's placeholder (P_text, P_pic) is where the game
paints the plate's number and the frame's picture.
"""
import math

import bmesh
from mathutils import Matrix, Vector

from parts import _kit as K
from parts._kit import V
from items import junk as J
from items import nd_home as H

OUT = 'public/models/modcar/items'
TAU = math.tau

COLORS = {
    'nd_cassette': (0x2f3236, 0xe8a23a),
    'nd_vinyl': (0xc8372f, 0xf1e6c8),
    'nd_bobble_1': (0xe07a2e, 0x3a3d42), 'nd_bobble_2': (0x6fae4a, 0xd8b04a), 'nd_bobble_3': (0x8a5a3c, 0xc8372f),
    'nd_bobble_4': (0x7d8a96, 0xe86ab0),
    'nd_plate': (0xe9e2cf, 0x3e5f8f), 'nd_frame': (0x8a5a3c, 0xf1e8d4), 'nd_wooden_hand': (0xc89a6a, 0x6b4a2f),
}


# ------------------------------------------------------------------------------------------------ the cassette

def nd_cassette(P):
    """A cassette (Nomad Drive's Cassette, 0.159 x 0.097 x 0.019 m) lying label up: its shell (paint), the label
    (paint_b) with a ruled title strip, the window between the two reels with the brown tape wound on them, five
    screws, the thicker bottom edge where the tape runs past its openings."""
    P.ao_distance = 0.01
    L, W, T = 0.159, 0.097, 0.019
    J.cushion(P, 'shell', (L, W, T), loc=(0.0, 0.0, T / 2), material='paint', r=0.004)
    # the bottom edge: thicker, the tape's openings in it
    P.box('lip', (0.11, 0.02, 0.004), (0.0, -W / 2 + 0.012, T + 0.0005), 'paint', bev=0.0015, segs=1)
    for x in (-0.035, 0.0, 0.035):
        P.box('opening', (0.012, 0.006, 0.003), (x, -W / 2 + 0.0035, T * 0.5), 'trim', bev=None)
    # the label and its window
    P.box('label', (0.135, 0.062, 0.0008), (0.0, 0.008, T + 0.0004), 'paint_b', bev=None)
    for k in range(3):
        P.box('rule', (0.1, 0.0012, 0.0005), (0.0, 0.03 - k * 0.007, T + 0.0011), 'trim', bev=None)
    P.box('window', (0.07, 0.022, 0.0009), (0.0, -0.004, T + 0.0012), 'glass_dark', bev=0.001, segs=1)
    for sx in (-1, 1):
        x = sx * 0.024
        P.cyl('tape', 0.0105 if sx < 0 else 0.0075, 0.0006, loc=(x, -0.004, T + 0.0016), material='leather', segs=20)
        P.cyl('hub', 0.0055, 0.0009, loc=(x, -0.004, T + 0.002), material='ceramic', segs=16)
        for k in range(6):
            a = k * TAU / 6
            P.box('tooth', (0.0016, 0.0016, 0.001), (x + math.cos(a) * 0.0034, -0.004 + math.sin(a) * 0.0034, T + 0.0025), 'trim', bev=None)
    for (x, y) in ((-0.072, 0.04), (0.072, 0.04), (-0.072, -0.04), (0.072, -0.04), (0.0, -0.04)):
        P.cyl('screw', 0.0022, 0.0006, loc=(x, y, T + 0.0003), material='steel', segs=8)
    P.views = [('a', 30, 55), ('b', 200, 40)]


def nd_vinyl(P):
    """A 12-inch vinyl LP record inside a vivid dual-tone cardboard album sleeve (paint + paint_b cover art)
    with the glossy black micro-groove LP record half-slid out the right edge (+X) showing its matching
    coloured center label. Instantly distinct per song in world, hands, and thumbnails."""
    P.ao_distance = 0.012
    # Cardboard outer album sleeve (26 × 26 × 0.55 cm), slightly offset left so the peeking vinyl balances at center
    S = 0.256
    T = 0.0056
    sx = -0.022
    P.box('sleeve', (S, S, T), (sx, 0.0, T / 2), 'paint', bev=0.0012, segs=1)
    # Contrasting geometric album-art design on front (top) & back faces (paint_b frame + diagonal stripe + title bar)
    P.box('cover_band', (S * 0.94, S * 0.24, 0.0008), (sx, -S * 0.24, T + 0.0004), 'paint_b', bev=None)
    P.box('cover_accent', (S * 0.34, S * 0.88, 0.0007), (sx - S * 0.28, 0.0, T + 0.00035), 'paint_b', bev=None)
    P.cyl('cover_emblem', 0.044, 0.0008, loc=(sx + 0.028, 0.022, T + 0.0004), material='paint_b', segs=28, bev=None)
    P.cyl('cover_dot', 0.022, 0.0009, loc=(sx + 0.028, 0.022, T + 0.0006), material='paint', segs=24, bev=None)
    P.box('spine', (0.004, S, T + 0.0006), (sx - S / 2, 0.0, T / 2), 'paint_b', bev=None)
    P.box('back_band', (S * 0.86, S * 0.16, 0.0007), (sx, S * 0.22, -0.00035), 'paint_b', bev=None)
    # Glossy black 12-inch vinyl LP record peeking ~38% out the right opening (+X)
    R = 0.120
    dx = sx + S / 2 - 0.015
    dz = T / 2
    P.cyl('disc', R, 0.0026, loc=(dx, 0.0, dz), material='trim', segs=40, bev=0.0006)
    P.torus('rim_bead', R - 0.002, 0.0011, loc=(dx, 0.0, dz + 0.0011), material='trim', segs=40, rsegs=6)
    for rg in (0.108, 0.094, 0.080, 0.066, 0.054):
        P.torus('groove', rg, 0.00048, loc=(dx, 0.0, dz + 0.0014), material='rubber', segs=40, rsegs=4)
    # Matching coloured center label (paint) + accent ring & stripe (paint_b) + spindle hole
    P.cyl('label_top', 0.042, 0.0008, loc=(dx, 0.0, dz + 0.0016), material='paint', segs=32, bev=None)
    P.cyl('label_bot', 0.042, 0.0006, loc=(dx, 0.0, dz - 0.0015), material='paint', segs=32, bev=None)
    P.box('label_band', (0.066, 0.013, 0.0006), (dx, 0.0, dz + 0.0020), 'paint_b', bev=None)
    P.torus('label_ring', 0.036, 0.0006, loc=(dx, 0.0, dz + 0.0020), material='paint_b', segs=32, rsegs=4)
    P.cyl('spindle_hole', 0.004, 0.0042, loc=(dx, 0.0, dz), material='trim', segs=14, bev=None)
    P.views = [('a', 30, 55), ('b', 200, 45)]


# ------------------------------------------------------------------------------------------------ the bobbleheads

def bobble_base(P, r=0.038):
    """The round plinth a bobblehead stands on (paint_b), its felt underneath, and the spring it nods on."""
    P.lathe('base', [(0.0, 0.0), (r, 0.0), (r + 0.002, 0.003), (r, 0.011), (r - 0.004, 0.014), (0.0, 0.014)],
            material='paint_b', segs=28, close='end', sharp=40.0)
    P.cyl('felt', r - 0.002, 0.0015, loc=(0.0, 0.0, 0.0006), material='fabric', segs=24)


def spring(P, z0, z1, r=0.0055, turns=5):
    """The coil a head nods on, from z0 up to z1 (steel)."""
    pts = []
    n = turns * 12
    for i in range(n + 1):
        a = i / 12 * TAU
        pts.append((math.cos(a) * r, math.sin(a) * r, z0 + (z1 - z0) * i / n))
    P.tube('spring', pts, 0.0011, 'steel', segs=6, bend=0.0, caps=True)


def eyes(P, z, y, r, x, gap=0.011, pupil=True):
    """Two round eyes on a face at height z facing +x (ceramic whites, trim pupils, a glint)."""
    for s in (-1, 1):
        P.sphere('eye', r, loc=(x, s * gap, z), material='ceramic', u=12, v=8, scale=(0.6, 1, 1))
        if pupil:
            P.sphere('pupil', r * 0.6, loc=(x + r * 0.35, s * gap, z), material='trim', u=10, v=6, scale=(0.5, 1, 1))
            P.sphere('glint', r * 0.18, loc=(x + r * 0.62, s * gap + r * 0.18, z + r * 0.22), material='ceramic', u=6, v=4)


def nd_bobble_1(P):
    """A fox bobblehead (Nomad Drive's Toy-Bobblehead-01 in size): sitting on its plinth with its brush of a tail
    curled round its feet, a white bib; its big head (N_head) on the spring, pointed ears, a white muzzle."""
    P.ao_distance = 0.02
    bobble_base(P)
    P.sphere('body', 0.02, loc=(0.0, 0.0, 0.034), material='paint', u=18, v=12, scale=(1.0, 0.95, 1.15))
    P.sphere('bib', 0.012, loc=(0.012, 0.0, 0.038), material='ceramic', u=12, v=8, scale=(0.6, 0.9, 1.2))
    for s in (-1, 1):
        P.sphere('paw', 0.006, loc=(0.017, s * 0.008, 0.017), material='paint', u=10, v=6)
    tail = [(-0.016, 0.012, 0.02), (-0.006, 0.026, 0.018), (0.012, 0.024, 0.017), (0.022, 0.012, 0.016)]
    P.tube('tail', tail, 0.0075, 'paint', segs=10, radius_fn=lambda t: 1.0 - 0.45 * t)
    P.sphere('tail_tip', 0.005, loc=(0.023, 0.011, 0.016), material='ceramic', u=10, v=6)
    spring(P, 0.054, 0.066)
    since = H.mark_since(P)
    zc = 0.066 + 0.028
    P.sphere('head', 0.03, loc=(0.0, 0.0, zc), material='paint', u=22, v=14, scale=(0.95, 1.05, 0.92))
    P.sphere('muzzle', 0.016, loc=(0.024, 0.0, zc - 0.008), material='ceramic', u=14, v=10, scale=(1.1, 0.95, 0.7))
    P.sphere('nose', 0.004, loc=(0.041, 0.0, zc - 0.006), material='trim', u=8, v=6)
    for s in (-1, 1):
        P.sphere('cheek', 0.012, loc=(0.012, s * 0.02, zc - 0.012), material='ceramic', u=12, v=8, scale=(0.8, 0.8, 0.7))
        ear = [(0.0, s * 0.015, zc + 0.02), (-0.002, s * 0.022, zc + 0.04), (-0.004, s * 0.024, zc + 0.05)]
        P.tube('ear', ear, 0.009, 'paint', segs=10, radius_fn=lambda t: 1.0 - 0.9 * t)
        P.tube('ear_in', [(0.004, s * 0.016, zc + 0.024), (0.003, s * 0.021, zc + 0.04)], 0.0045, 'trim', segs=8, radius_fn=lambda t: 1.0 - 0.85 * t)
    eyes(P, zc + 0.006, 0.0, 0.0052, 0.025)
    P.mover('N_head', P.statics[since:], (0.0, 0.0, 0.066))
    P.views = [('a', 35, 15), ('b', 160, 15)]


def nd_bobble_2(P):
    """A frog bobblehead in a straw hat (Toy-Bobblehead-02 in size): squatting on its plinth, its big head (N_head)
    with eyes standing up on it and a wide smile, a little straw boater on top."""
    P.ao_distance = 0.02
    bobble_base(P)
    P.sphere('body', 0.022, loc=(0.0, 0.0, 0.032), material='paint', u=18, v=12, scale=(1.05, 1.1, 0.95))
    P.sphere('belly', 0.016, loc=(0.009, 0.0, 0.03), material='ceramic', u=12, v=8, scale=(0.7, 1.0, 0.95))
    for s in (-1, 1):
        P.sphere('leg', 0.009, loc=(0.004, s * 0.02, 0.019), material='paint', u=12, v=8, scale=(1.6, 0.8, 0.7))
        P.sphere('foot', 0.006, loc=(0.022, s * 0.022, 0.0155), material='paint', u=10, v=6, scale=(1.4, 1.2, 0.5))
    spring(P, 0.05, 0.062)
    since = H.mark_since(P)
    zc = 0.062 + 0.024
    P.sphere('head', 0.032, loc=(0.0, 0.0, zc), material='paint', u=22, v=14, scale=(0.9, 1.1, 0.78))
    for s in (-1, 1):
        P.sphere('eye_bump', 0.011, loc=(0.008, s * 0.017, zc + 0.02), material='paint', u=12, v=8)
    eyes(P, zc + 0.021, 0.0, 0.0072, 0.015, gap=0.017)
    P.tube('smile', [(0.026, -0.018, zc - 0.006), (0.031, -0.008, zc - 0.011), (0.032, 0.0, zc - 0.012), (0.031, 0.008, zc - 0.011), (0.026, 0.018, zc - 0.006)], 0.0012, 'trim', segs=6)
    # the boater
    P.cyl('brim', 0.026, 0.0016, loc=(-0.004, 0.0, zc + 0.033), material='paint_b', segs=28)
    P.cyl('crown', 0.016, 0.011, loc=(-0.004, 0.0, zc + 0.039), material='paint_b', segs=24)
    P.cyl('band', 0.0163, 0.0035, loc=(-0.004, 0.0, zc + 0.036), material='leather', segs=24)
    P.mover('N_head', P.statics[since:], (0.0, 0.0, 0.062))
    P.views = [('a', 35, 15), ('b', 160, 15)]


def nd_bobble_3(P):
    """A bear bobblehead in a trucker's cap (Toy-Bobblehead-03 in size): sitting with its paws on its round belly,
    its head (N_head) with round ears, a pale snout and a cap (paint_b) with its peak ahead."""
    P.ao_distance = 0.02
    bobble_base(P)
    P.sphere('body', 0.022, loc=(0.0, 0.0, 0.035), material='paint', u=18, v=12, scale=(1.0, 1.0, 1.12))
    P.sphere('belly', 0.014, loc=(0.011, 0.0, 0.032), material='ceramic', u=12, v=8, scale=(0.7, 0.95, 1.05))
    for s in (-1, 1):
        P.sphere('arm', 0.007, loc=(0.016, s * 0.014, 0.04), material='paint', u=10, v=8, scale=(1.3, 0.8, 0.8))
        P.sphere('leg', 0.0085, loc=(0.016, s * 0.011, 0.017), material='paint', u=10, v=8, scale=(1.3, 1.0, 0.8))
    spring(P, 0.057, 0.068)
    since = H.mark_since(P)
    zc = 0.068 + 0.027
    P.sphere('head', 0.029, loc=(0.0, 0.0, zc), material='paint', u=22, v=14)
    P.sphere('snout', 0.013, loc=(0.025, 0.0, zc - 0.009), material='ceramic', u=14, v=10, scale=(1.0, 1.0, 0.75))
    P.sphere('nose', 0.0045, loc=(0.037, 0.0, zc - 0.004), material='trim', u=8, v=6, scale=(0.8, 1.2, 0.8))
    for s in (-1, 1):
        P.sphere('ear', 0.009, loc=(-0.004, s * 0.023, zc + 0.02), material='paint', u=12, v=8, scale=(0.6, 1, 1))
        P.sphere('ear_in', 0.005, loc=(-0.0005, s * 0.023, zc + 0.02), material='ceramic', u=10, v=6, scale=(0.4, 1, 1))
    eyes(P, zc + 0.004, 0.0, 0.0042, 0.025, gap=0.011)
    # the cap and its peak
    P.sphere('cap', 0.0285, loc=(-0.002, 0.0, zc + 0.008), material='paint_b', u=22, v=12, scale=(1.02, 1.02, 0.82))
    P.box('peak', (0.026, 0.036, 0.0025), (0.03, 0.0, zc + 0.012), 'paint_b', rot=(0, -8, 0), bev=0.002, segs=1)
    P.cyl('button', 0.0035, 0.002, loc=(-0.002, 0.0, zc + 0.031), material='paint_b', segs=10)
    P.mover('N_head', P.statics[since:], (0.0, 0.0, 0.068))
    P.views = [('a', 35, 15), ('b', 160, 15)]


def nd_bobble_4(P):
    """A cat bobblehead (Toy-Bobblehead-04 in size): sitting tall with its tail up its side, a collar with a bell
    (paint_b), its head (N_head) with pointed ears, whisker pads and a small pink nose."""
    P.ao_distance = 0.02
    bobble_base(P)
    P.sphere('body', 0.019, loc=(0.0, 0.0, 0.036), material='paint', u=18, v=12, scale=(1.0, 0.95, 1.3))
    P.sphere('chest', 0.011, loc=(0.011, 0.0, 0.04), material='ceramic', u=12, v=8, scale=(0.6, 0.9, 1.3))
    for s in (-1, 1):
        P.sphere('paw', 0.0055, loc=(0.016, s * 0.007, 0.016), material='ceramic', u=10, v=6, scale=(1.4, 1.0, 0.8))
    P.tube('tail', [(-0.017, -0.01, 0.018), (-0.02, -0.016, 0.035), (-0.016, -0.018, 0.052), (-0.01, -0.016, 0.06)], 0.0042, 'paint', segs=8)
    P.torus('collar', 0.0105, 0.0022, loc=(0.0, 0.0, 0.058), material='paint_b', segs=20, rsegs=6)
    P.sphere('bell', 0.0032, loc=(0.011, 0.0, 0.055), material='chrome', u=10, v=6)
    spring(P, 0.058, 0.069)
    since = H.mark_since(P)
    zc = 0.069 + 0.026
    P.sphere('head', 0.028, loc=(0.0, 0.0, zc), material='paint', u=22, v=14, scale=(0.95, 1.08, 0.9))
    for s in (-1, 1):
        P.sphere('pad', 0.0085, loc=(0.022, s * 0.0075, zc - 0.009), material='ceramic', u=12, v=8, scale=(0.8, 1.0, 0.8))
        ear = [(-0.002, s * 0.014, zc + 0.018), (-0.004, s * 0.02, zc + 0.036)]
        P.tube('ear', ear, 0.0095, 'paint', segs=8, radius_fn=lambda t: 1.0 - 0.92 * t)
        P.tube('ear_in', [(0.002, s * 0.015, zc + 0.021), (0.0, s * 0.019, zc + 0.032)], 0.0048, 'paint_b', segs=8, radius_fn=lambda t: 1.0 - 0.85 * t)
        for k in range(2):
            P.tube('whisker', [(0.026, s * 0.012, zc - 0.008 + k * 0.004), (0.03, s * 0.03, zc - 0.006 + k * 0.006)], 0.0005, 'trim', segs=4, caps=False)
    P.sphere('nose', 0.0032, loc=(0.031, 0.0, zc - 0.005), material='paint_b', u=8, v=6, scale=(0.8, 1.3, 0.8))
    eyes(P, zc + 0.005, 0.0, 0.0055, 0.022, gap=0.011)
    P.mover('N_head', P.statics[since:], (0.0, 0.0, 0.069))
    P.views = [('a', 35, 15), ('b', 160, 15)]


# ------------------------------------------------------------------------------------------------ the plate

def nd_plate(P):
    """A licence plate (Nomad Drive's Plate, 0.571 x 0.194 m) standing on its long edge facing +x: pressed steel
    (paint) with a raised rim, four bolt holes, a little rust on its edges; its face's placeholder P_text, where the
    game paints its number, its town and its colours."""
    P.ao_distance = 0.02
    W, Hh, T = 0.571, 0.194, 0.008
    J.cushion(P, 'plate', (T, W, Hh), loc=(0.0, 0.0, Hh / 2), material='paint', r=0.006)
    # the raised rim, just in from the edge
    rim = 0.012
    for (y, z, sy, sz) in ((0.0, Hh - rim / 2 - 0.004, W - 0.03, 0.006), (0.0, rim / 2 + 0.004, W - 0.03, 0.006),
                           (W / 2 - rim / 2 - 0.004, Hh / 2, 0.006, Hh - 0.03), (-W / 2 + rim / 2 + 0.004, Hh / 2, 0.006, Hh - 0.03)):
        P.box('rim', (0.003, sy, sz), (T / 2 + 0.001, y, z), 'paint', bev=0.0012, segs=1)
    for (y, z) in ((-0.2, Hh - 0.025), (0.2, Hh - 0.025), (-0.2, 0.025), (0.2, 0.025)):
        P.cyl('hole', 0.0055, 0.0015, loc=(T / 2 + 0.0004, y, z), material='trim', axis='X', segs=10)
        P.cyl('bolt', 0.0068, 0.003, loc=(T / 2 + 0.0015, y, z), material='steel', axis='X', segs=10)
    for (y, z) in ((W / 2 - 0.01, 0.012), (-W / 2 + 0.012, Hh - 0.01)):
        P.sphere('rust', 0.007, loc=(T / 2, y, z), material='rust', u=8, v=6, scale=(0.3, 1.2, 1))
    since = H.mark_since(P)
    P.box('text', (0.0006, W - 0.05, Hh - 0.05), (T / 2 + 0.0012, 0.0, Hh / 2), 'glass_dark', bev=None)
    P.mover('P_text', P.statics[since:], (T / 2 + 0.0012, 0.0, Hh / 2))
    P.views = [('a', 25, 10), ('b', 150, 10)]


# ------------------------------------------------------------------------------------------------ the frame

def nd_frame(P):
    """A picture frame (Nomad Drive's picture frame, 0.514 m square) standing up facing +x: a moulded wooden frame
    (paint) round a cream mount (paint_b), the picture's placeholder P_pic in it, a strut at its back to stand it up
    folded flat at its back, a cord to hang it by."""
    P.ao_distance = 0.03
    S, T = 0.514, 0.028
    fw = 0.045
    # the frame: four mitred mouldings (a rounded bead along the face)
    for (y, z, sy, sz) in ((0.0, S - fw / 2, S, fw), (0.0, fw / 2, S, fw), (S / 2 - fw / 2, S / 2, fw, S - 2 * fw), (-S / 2 + fw / 2, S / 2, fw, S - 2 * fw)):
        J.cushion(P, 'moulding', (T, sy, sz), loc=(0.0, y, z), material='paint', r=0.008)
    for (y, z, sy, sz) in ((0.0, S - fw + 0.004, S - 2 * fw + 0.01, 0.006), (0.0, fw - 0.004, S - 2 * fw + 0.01, 0.006),
                           (S / 2 - fw + 0.004, S / 2, 0.006, S - 2 * fw), (-S / 2 + fw - 0.004, S / 2, 0.006, S - 2 * fw)):
        P.box('bead', (0.006, sy, sz), (T / 2 - 0.002, y, z), 'paint_b', bev=0.002, segs=1)
    P.box('mount', (0.006, S - 2 * fw, S - 2 * fw), (T / 2 - 0.006, 0.0, S / 2), 'paint_b', bev=None)
    P.box('back', (0.004, S - 0.02, S - 0.02), (-T / 2 + 0.002, 0.0, S / 2), 'wood', bev=None)
    # the strut folded flat against its back, and the cord across it
    P.box('strut', (0.006, 0.06, 0.3), (-T / 2 - 0.003, 0.0, 0.19), 'wood', bev=0.002, segs=1)
    P.box('hinge', (0.004, 0.03, 0.012), (-T / 2 - 0.004, 0.0, 0.335), 'alu', bev=None)
    P.tube('cord', [(-T / 2 - 0.002, -0.15, S - 0.12), (-T / 2 - 0.006, 0.0, S - 0.09), (-T / 2 - 0.002, 0.15, S - 0.12)], 0.0018, 'fabric', segs=6)
    since = H.mark_since(P)
    pw = S - 2 * fw - 0.07
    P.box('pic', (0.0006, pw, pw), (T / 2 - 0.0025, 0.0, S / 2), 'glass_dark', bev=None)
    P.mover('P_pic', P.statics[since:], (T / 2 - 0.0025, 0.0, S / 2))
    P.views = [('a', 25, 12), ('b', 160, 12)]


# ------------------------------------------------------------------------------------------------ the wooden hand

def nd_wooden_hand(P):
    """A carved wooden hand (Nomad Drive's wooden hand, 0.39 m tall): an artist's jointed hand standing up from a round
    plinth (paint_b) on its wrist post, its palm to +x, its fingers a little apart and curled, the thumb out, each
    finger three turned joints (paint) with pins at the knuckles."""
    P.ao_distance = 0.03
    P.lathe('plinth', [(0.0, 0.0), (0.05, 0.0), (0.052, 0.006), (0.048, 0.018), (0.04, 0.024), (0.0, 0.024)], material='paint_b',
            segs=28, close='end', sharp=40.0)
    P.lathe('post', [(0.0, 0.024), (0.011, 0.024), (0.013, 0.03), (0.01, 0.05), (0.012, 0.075), (0.0, 0.08)], material='steel', segs=14,
            close='end', sharp=50.0)
    # the wrist and the palm
    J.cushion(P, 'wrist', (0.034, 0.05, 0.05), loc=(0.0, 0.0, 0.1), material='paint', r=0.014)
    J.cushion(P, 'palm', (0.028, 0.082, 0.095), loc=(0.002, 0.0, 0.17), material='paint', r=0.012)
    P.sphere('heel', 0.016, loc=(0.008, -0.022, 0.135), material='paint', u=12, v=8, scale=(0.7, 1, 1))
    # four fingers, three joints each, a little apart and curled forward (+x)
    for i, (y, L, lean) in enumerate(((-0.03, 0.06, 7), (-0.01, 0.07, 2), (0.01, 0.066, -2), (0.03, 0.052, -7))):
        z = 0.218
        x = 0.0
        a = 0.0
        yy = y
        for k, f in enumerate((0.42, 0.33, 0.25)):
            seg = L * f * 1.25
            a += (8 + 10 * k + i * 2) * math.pi / 180
            dx = math.sin(a) * seg
            dz = math.cos(a) * seg
            dy = math.sin(math.radians(lean)) * seg * 0.3
            P.tube('finger', [(x, yy, z), (x + dx, yy + dy, z + dz)], 0.0085 - k * 0.0012, 'paint', segs=10, bend=0.0)
            P.sphere('knuckle', 0.0092 - k * 0.0012, loc=(x, yy, z), material='paint', u=10, v=8)
            x += dx
            yy += dy
            z += dz
        P.sphere('tip', 0.0072, loc=(x, yy, z), material='paint', u=10, v=8)
    # the thumb, out to the side and forward
    pts = [(0.008, -0.04, 0.15), (0.022, -0.058, 0.175), (0.032, -0.064, 0.2), (0.038, -0.064, 0.22)]
    for k in range(3):
        P.tube('thumb', [pts[k], pts[k + 1]], 0.0095 - k * 0.0012, 'paint', segs=10, bend=0.0)
        P.sphere('knuckle', 0.0098 - k * 0.0012, loc=pts[k], material='paint', u=10, v=8)
    P.sphere('tip', 0.0078, loc=pts[3], material='paint', u=10, v=8)
    # (to Nomad Drive's 0.39 m)
    J.xform(P, 0, Matrix.Scale(0.39 / 0.2973, 4))
    P.views = [('a', 35, 10), ('b', 160, 10)]


MODELS = {
    'nd_cassette': nd_cassette,
    'nd_vinyl': nd_vinyl,
    'nd_bobble_1': nd_bobble_1,
    'nd_bobble_2': nd_bobble_2,
    'nd_bobble_3': nd_bobble_3,
    'nd_bobble_4': nd_bobble_4,
    'nd_plate': nd_plate,
    'nd_frame': nd_frame,
    'nd_wooden_hand': nd_wooden_hand,
}
MODELS = {k: H.settled(f) for k, f in MODELS.items()}


def _after(P, opts):
    J.COLORS.update(COLORS)
    J._after(P, opts)


def main(args):
    K.run(MODELS, args, after=_after, out_dir=OUT, geo=False)
