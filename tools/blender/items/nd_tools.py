"""
The ND tools (docs/ND/PLAN.md, ND3): Nomad Drive's flashlight, polisher, shovel, metal detector, crowbar, compass,
engine and tyre repair kits, battery charger, its two treasure chests and their keys — in our own design, at its
sizes (Flashlight 0.32 m long, Tool-Polishing 0.43, Shovel 1.2, metal detector 1.0, Crowbar 0.79, Compass 0.21 x 0.16,
engine repair kit 0.39 x 0.26 x 0.16, tire repair kit 0.34 x 0.26 x 0.16, battery charger 0.34 x 0.26 x 0.15, Chest 0.82 x
0.6 x 0.45, Key 0.16):

    blender -b --factory-startup --python tools/blender/build.py -- items/nd_tools [<model>|all] [--look] [--norender]

The junk script's conventions (items/junk.py): origin at the bottom centre, x forward (a long tool lies along x, its
working end forward), resting on z = 0; `paint` and `paint_b` take the item's two colours. What moves is its own
child named as the game's loader keeps it apart (assets.ts RIGID): a chest's LID, a compass's needle KNOB_needle,
the polisher's pad KNOB_pad, the flashlight's switch BUTTON_switch. Markers: M_beam (the flashlight's lens, its +x
the way it shines), M_pad (the polisher's pad face), M_blade (the shovel's cutting edge), M_coil (the detector's
coil), M_tip (the crowbar's claw), M_lock (a chest's keyhole), M_clamps (the charger's leads).
"""
import math

import bmesh
from mathutils import Matrix, Vector

from parts import _kit as K
from parts._kit import V, mat4
from items import junk as J
from items import nd_home as H
from items import nd_things as N

OUT = 'public/models/modcar/items'
TAU = math.tau

COLORS = {
    'nd_flashlight': (0xc8372f, 0x2f3236), 'nd_polisher': (0x3e7fb0, 0x2f3236), 'nd_shovel': (0x5d8a34, 0x8a5a3c), 'nd_metal_detector': (0xe8a23a, 0x2f3236),
    'nd_crowbar': (0xc8372f, 0x2f3236), 'nd_compass': (0xc89a46, 0x2f3236), 'nd_engine_kit': (0xc8372f, 0xf0c23c), 'nd_tire_kit': (0x3e6f8f, 0xf0c23c),
    'nd_charger': (0xe8a23a, 0x2f3236), 'nd_chest_1': (0x8a5a3c, 0x5a5f66), 'nd_chest_2': (0x3e5f8f, 0xd8b04a), 'nd_key_1': (0x6f7a82, 0x5a5f66),
    'nd_key_2': (0xd8b04a, 0xc8372f),
}


# ------------------------------------------------------------------------------------------------ the flashlight

def nd_flashlight(P):
    """A big flashlight (Nomad Drive's Flashlight, 0.32 m): a ribbed barrel (paint) holding its batteries, a wide head
    flaring out to the lens (its glass: lens_head), a rubber tail cap, its switch on top (BUTTON_switch) in a rubber
    boot, a lanyard loop; M_beam at the lens, shining along +x."""
    P.ao_distance = 0.03
    r = 0.022
    prof = [(0.0, -0.15), (r * 0.95, -0.15), (r + 0.002, -0.145), (r + 0.002, -0.12), (r, -0.115), (r, 0.06), (r * 1.15, 0.08), (0.042, 0.13),
            (0.045, 0.14), (0.045, 0.158), (0.04, 0.16), (0.0, 0.16)]
    bm = bmesh.new()
    K.bm_lathe(bm, [(x, z) for (x, z) in prof], segs=24, matrix=Matrix.Translation((0.0, 0.0, 0.045)) @ Matrix.Rotation(math.pi / 2, 4, 'Y'))
    P.mesh('barrel', bm, 'paint', bev=None, sharp=40.0)
    for k in range(9):
        x = -0.1 + k * 0.016
        P.torus('grip_rib', r + 0.0006, 0.0016, loc=(x, 0.0, 0.045), material='paint', axis='X', segs=20, rsegs=4)
    P.cyl('tail', r + 0.003, 0.03, loc=(-0.138, 0.0, 0.045), material='rubber', axis='X', segs=20, bev=0.004)
    P.cyl('bezel', 0.046, 0.012, loc=(0.152, 0.0, 0.045), material='paint_b', axis='X', segs=28, bev=0.003)
    P.cyl('lens', 0.039, 0.004, loc=(0.159, 0.0, 0.045), material='lens_head', axis='X', segs=28, bev=0.001)
    P.cyl('reflector', 0.03, 0.002, loc=(0.1555, 0.0, 0.045), material='chrome', axis='X', segs=24, bev=None)
    P.box('boot', (0.03, 0.022, 0.01), (0.03, 0.0, 0.045 + r + 0.003), 'rubber', bev=0.004)
    since = H.mark_since(P)
    P.box('switch', (0.016, 0.012, 0.006), (0.03, 0.0, 0.045 + r + 0.009), 'paint_b', bev=0.002)
    P.mover('BUTTON_switch', P.statics[since:], (0.03, 0.0, 0.045 + r + 0.006))
    P.torus('lanyard', 0.009, 0.0022, loc=(-0.156, 0.0, 0.045), material='steel', axis='Y', segs=12, rsegs=4)
    P.empty('M_beam', loc=(0.162, 0.0, 0.045))
    P.views = [('a', 35, 25), ('b', 215, 30)]


# ------------------------------------------------------------------------------------------------ the polisher

def nd_polisher(P):
    """A cordless rotary polisher (Nomad Drive's Tool-Polishing, 0.43 m): a long motor body (paint) with its vents and
    the battery pack at the back (paint_b) under a D-handle, a side handle across the front, the gear head turning a
    foam pad underneath (KNOB_pad, the pad's face M_pad)."""
    P.ao_distance = 0.04
    N.soft(P, 'body', (0.24, 0.075, 0.075), (0.0, 0.0, 0.11), 'paint', r=0.025)
    for k in range(4):
        P.box('vent', (0.01, 0.078, 0.004), (-0.06 + k * 0.018, 0.0, 0.135), 'trim', bev=None)
    N.soft(P, 'head', (0.09, 0.08, 0.06), (0.15, 0.0, 0.1), 'paint_b', r=0.015)
    N.soft(P, 'pack', (0.07, 0.08, 0.06), (-0.17, 0.0, 0.07), 'paint_b', r=0.012)
    J.bar(P, 'd_grip', (-0.12, 0.0, 0.15), (-0.21, 0.0, 0.15), 0.03, 0.026, 'rubber', x_hint=(0, 0, 1), bev=0.01)
    P.tube('d_loop', [(-0.21, 0.0, 0.15), (-0.215, 0.0, 0.12), (-0.205, 0.0, 0.1)], 0.012, 'rubber', segs=10, bend=0.4)
    J.bar(P, 'side_handle', (0.15, -0.11, 0.105), (0.15, 0.11, 0.105), 0.026, 0.026, 'rubber', x_hint=(0, 0, 1), bev=0.01)
    P.box('trigger', (0.02, 0.012, 0.016), (-0.14, 0.0, 0.125), 'trim', bev=0.003)
    since = H.mark_since(P)
    P.cyl('backing', 0.065, 0.012, loc=(0.15, 0.0, 0.058), material='trim', segs=28, bev=0.003)
    P.cyl('pad', 0.075, 0.03, loc=(0.15, 0.0, 0.035), material='fabric', segs=32, bev=0.008)
    P.cyl('pad_face', 0.07, 0.004, loc=(0.15, 0.0, 0.019), material='fabric', segs=32, bev=0.002)
    P.mover('KNOB_pad', P.statics[since:], (0.15, 0.0, 0.035))
    P.empty('M_pad', loc=(0.15, 0.0, 0.019))
    P.views = [('a', 35, 25), ('b', 215, 30)]


# ------------------------------------------------------------------------------------------------ the shovel

def nd_shovel(P):
    """A round-point shovel (Nomad Drive's Shovel, 1.2 m): a steel blade (paint) with its tread turned over at the
    top, the socket up the shaft, an ash shaft (wood), a D-grip at its end (paint_b); M_blade at the blade's point."""
    P.ao_distance = 0.05
    L = 1.18
    x0 = -L / 2
    xb = L / 2 - 0.3
    # the blade: a dished outline, the point forward
    pts = []
    for k in range(13):
        t = k / 12
        a = math.pi * (t - 0.5)
        pts.append((xb + 0.06 + 0.24 * math.cos(a) * (1 - 0.25 * abs(math.sin(a))), 0.11 * math.sin(a)))
    pts = [(xb, -0.11)] + pts + [(xb, 0.11)]
    bm = bmesh.new()
    K.bm_prism(bm, [(x, y) for (x, y) in pts], 0.004, matrix=mat4((0.0, 0.0, 0.03)))
    for v in bm.verts:
        v.co.z += 6.0 * (v.co.y ** 2) * 0.9
    P.mesh('blade', bm, 'paint', bev=0.001, segs=1, sharp=30.0)
    P.box('tread', (0.03, 0.22, 0.006), (xb + 0.01, 0.0, 0.034), 'paint', bev=0.002)
    P.cyl('socket', 0.02, 0.16, loc=(xb - 0.05, 0.0, 0.04), material='paint', axis='X', segs=14, bev=0.003, r2=0.016)
    P.cyl('shaft', 0.016, xb - 0.13 - x0, loc=((xb - 0.13 + x0) / 2 + 0.06, 0.0, 0.04), material='wood', axis='X', segs=14, bev=0.003)
    # the D-grip at the end
    P.tube('d', [(x0 + 0.12, 0.0, 0.04), (x0 + 0.06, -0.06, 0.04), (x0, -0.05, 0.04), (x0, 0.05, 0.04), (x0 + 0.06, 0.06, 0.04), (x0 + 0.12, 0.0, 0.04)], 0.011,
           'paint_b', segs=10, bend=0.3)
    P.cyl('d_bar', 0.014, 0.1, loc=(x0, 0.0, 0.04), material='wood', axis='Y', segs=12, bev=0.003)
    P.empty('M_blade', loc=(xb + 0.3, 0.0, 0.03))
    P.views = [('a', 35, 35), ('b', 200, 40)]


# ------------------------------------------------------------------------------------------------ the metal detector

def nd_metal_detector(P):
    """A metal detector (Nomad Drive's metal detector, 1 m): a flat search coil (paint) forward on a jointed shaft (alu)
    to the control box (paint, its dial and its lamp: lens_amber, the needle KNOB_needle), the grip and the arm cuff
    at the back (paint_b); M_coil at the coil's middle."""
    P.ao_distance = 0.05
    # the coil: an elliptical ring with a spoke frame
    cx = 0.36
    for (rx, ry, mat, th) in ((0.13, 0.1, 'paint', 0.014),):
        ring = [(cx + rx * math.cos(a), ry * math.sin(a), 0.012) for a in [k * TAU / 24 for k in range(24)]]
        P.tube('coil', ring, th, mat, segs=10, closed=True)
    P.box('coil_spoke', (0.24, 0.02, 0.008), (cx, 0.0, 0.012), 'paint', bev=0.003)
    P.box('coil_spoke2', (0.02, 0.18, 0.008), (cx, 0.0, 0.012), 'paint', bev=0.003)
    P.box('yoke', (0.03, 0.03, 0.04), (cx - 0.02, 0.0, 0.035), 'trim', bev=0.004)
    # the shaft, bent up to the box
    P.tube('shaft', [(cx - 0.03, 0.0, 0.05), (0.05, 0.0, 0.14), (-0.25, 0.0, 0.25), (-0.42, 0.0, 0.3)], 0.011, 'alu', segs=10, bend=0.2)
    for x, z in ((0.05, 0.14), (-0.15, 0.21)):
        P.cyl('lock', 0.016, 0.03, loc=(x, 0.0, z), material='trim', axis='X', rot=(0, -20, 0), segs=12, bev=0.003)
    # the control box with its dial and lamp, the grip, the cuff
    N.soft(P, 'box', (0.12, 0.07, 0.07), (-0.27, 0.0, 0.29), 'paint', r=0.014)
    P.cyl('dial', 0.024, 0.004, loc=(-0.27, 0.0, 0.327), material='gauge', segs=20, bev=None)
    since = H.mark_since(P)
    P.box('needle', (0.002, 0.02, 0.0015), (-0.27, 0.008, 0.33), 'lens_tail', bev=None)
    P.mover('KNOB_needle', P.statics[since:], (-0.27, 0.0, 0.33))
    P.sphere('lamp', 0.006, loc=(-0.235, 0.022, 0.327), material='lens_amber', u=10, v=6)
    J.bar(P, 'grip', (-0.33, 0.0, 0.3), (-0.4, 0.0, 0.3), 0.03, 0.03, 'rubber', x_hint=(0, 0, 1), bev=0.01)
    P.tube('cuff', [(-0.47, -0.045, 0.33), (-0.48, -0.05, 0.3), (-0.48, 0.0, 0.28), (-0.48, 0.05, 0.3), (-0.47, 0.045, 0.33)], 0.007, 'paint_b', segs=8, bend=0.4)
    P.empty('M_coil', loc=(cx, 0.0, 0.005))
    P.views = [('a', 35, 30), ('b', 200, 35)]


# ------------------------------------------------------------------------------------------------ the crowbar

def nd_crowbar(P):
    """A crowbar (Nomad Drive's Crowbar, 0.79 m): a hexagonal steel bar (paint) with its gooseneck claw curled at one
    end (M_tip at the claw) and a flattened chisel at the other, a band of the second colour as its grip."""
    P.ao_distance = 0.04
    L = 0.72
    pts = [(-L / 2, 0.0, 0.012), (L / 2 - 0.12, 0.0, 0.012), (L / 2 - 0.04, 0.0, 0.025), (L / 2, 0.0, 0.07), (L / 2 - 0.02, 0.0, 0.11), (L / 2 - 0.07, 0.0, 0.115)]
    P.tube('bar', pts, 0.011, 'paint', segs=6, bend=0.35, radius_fn=lambda t: 1.0 - 0.35 * max(0.0, t - 0.8) / 0.2)
    P.box('chisel', (0.05, 0.022, 0.006), (-L / 2 - 0.02, 0.0, 0.008), 'paint', rot=(0, -8, 0), bev=0.002)
    P.box('claw_split', (0.025, 0.004, 0.012), (L / 2 - 0.07, 0.0, 0.118), 'trim', bev=None)
    P.cyl('grip', 0.0125, 0.16, loc=(-L / 2 + 0.12, 0.0, 0.012), material='paint_b', axis='X', segs=6, bev=0.002)
    P.empty('M_tip', loc=(L / 2 - 0.08, 0.0, 0.11))
    P.views = [('a', 35, 30), ('b', 200, 35)]


# ------------------------------------------------------------------------------------------------ the compass

def nd_compass(P):
    """A brass compass in its box (Nomad Drive's Compass, 0.21 x 0.16 m): a wooden case (paint_b) holding a brass bowl
    (paint) under its glass, the card with its points, the needle its own child (KNOB_needle), the lid shut over it
    with its mirror inside, its own child LID hinged along the case's back edge (the game opens it in the hands)."""
    P.ao_distance = 0.03
    N.soft(P, 'case', (0.16, 0.15, 0.04), (0.0, 0.0, 0.02), 'paint_b', r=0.01)
    P.cyl('bowl', 0.062, 0.016, loc=(0.0, 0.0, 0.046), material='paint', segs=32, bev=0.003)
    P.cyl('card', 0.055, 0.002, loc=(0.0, 0.0, 0.054), material='gauge', segs=32, bev=None)
    for k in range(8):
        a = k * TAU / 8
        L = 0.012 if k % 2 else 0.02
        P.box('point', (L, 0.003, 0.001), (math.cos(a) * (0.04 - L / 2), math.sin(a) * (0.04 - L / 2), 0.0555), 'trim', rot=(0, 0, math.degrees(a)), bev=None)
    since = H.mark_since(P)
    P.prism('needle_n', [(0.0, -0.005), (0.042, 0.0), (0.0, 0.005)], 0.002, loc=(0.0, 0.0, 0.058), material='lens_tail', bev=None)
    P.prism('needle_s', [(0.0, -0.005), (-0.042, 0.0), (0.0, 0.005)], 0.002, loc=(0.0, 0.0, 0.058), material='trim', bev=None)
    P.cyl('pivot', 0.004, 0.004, loc=(0.0, 0.0, 0.06), material='paint', segs=10, bev=None)
    P.mover('KNOB_needle', P.statics[since:], (0.0, 0.0, 0.058))
    P.cyl('glass', 0.06, 0.002, loc=(0.0, 0.0, 0.063), material='glass', segs=32, bev=None)
    P.torus('bezel', 0.061, 0.004, loc=(0.0, 0.0, 0.062), material='paint', segs=32, rsegs=6)
    since = H.mark_since(P)
    N.soft(P, 'lid', (0.16, 0.15, 0.012), (0.0, 0.0, 0.074), 'paint_b', r=0.006)
    P.box('mirror', (0.11, 0.11, 0.002), (0.0, 0.0, 0.067), 'chrome', bev=None)
    P.box('lid_catch', (0.006, 0.03, 0.012), (0.082, 0.0, 0.07), 'paint', bev=0.001)
    P.mover('LID', P.statics[since:], (-0.08, 0.0, 0.074))
    P.views = [('a', 35, 40), ('b', 160, 40)]


# ------------------------------------------------------------------------------------------------ the repair kits

def kit_box(P, D, W, Hh):
    """A steel tool case (paint) with its lid's rim, two catches, a fold-down handle (trim), a label panel (paint_b)."""
    N.soft(P, 'case', (D, W, Hh), (0.0, 0.0, Hh / 2), 'paint', r=0.012)
    P.box('rim', (D + 0.004, W + 0.004, 0.008), (0.0, 0.0, Hh * 0.7), 'paint', bev=0.003)
    for s in (-1, 1):
        P.box('catch', (0.01, 0.03, 0.03), (D / 2 + 0.004, s * W * 0.32, Hh * 0.7), 'alu', bev=0.003)
    J.bar(P, 'handle', (0.0, -0.07, Hh + 0.012), (0.0, 0.07, Hh + 0.012), 0.018, 0.014, 'trim', x_hint=(0, 0, 1), bev=0.006)
    for y in (-0.07, 0.07):
        P.box('handle_foot', (0.02, 0.012, 0.016), (0.0, y, Hh + 0.004), 'trim', bev=0.003)
    P.box('panel', (0.002, W * 0.5, Hh * 0.36), (D / 2 + 0.001, 0.0, Hh * 0.36), 'paint_b', bev=None)


def nd_engine_kit(P):
    """An engine repair kit (Nomad Drive's engine repair kit, 0.39 x 0.26 x 0.16): a red tool case, a spanner and a gear
    wheel on its label."""
    P.ao_distance = 0.04
    D, W, Hh = 0.16, 0.39, 0.25
    kit_box(P, D, W, Hh)
    gx = D / 2 + 0.0025
    for k in range(8):
        a = k * TAU / 8
        P.box('tooth', (0.002, 0.012, 0.012), (gx, math.cos(a) * 0.03, Hh * 0.36 + math.sin(a) * 0.03), 'trim', rot=(math.degrees(a), 0, 0), bev=None)
    P.cyl('gear', 0.026, 0.002, loc=(gx, 0.0, Hh * 0.36), material='trim', axis='X', segs=20, bev=None)
    P.cyl('gear_hole', 0.009, 0.0025, loc=(gx + 0.0005, 0.0, Hh * 0.36), material='paint_b', axis='X', segs=14, bev=None)
    P.views = [('a', 35, 25), ('b', 215, 30)]


def nd_tire_kit(P):
    """A tyre repair kit (Nomad Drive's tire repair kit, 0.34 x 0.26 x 0.16): a blue case, a tyre on its label, the
    plug tool clipped to its side."""
    P.ao_distance = 0.04
    D, W, Hh = 0.16, 0.34, 0.25
    kit_box(P, D, W, Hh)
    P.torus('tyre', 0.028, 0.009, loc=(D / 2 + 0.004, 0.0, Hh * 0.36), material='rubber', axis='X', segs=20, rsegs=6)
    J.bar(P, 'plug_tool', (0.02, -W / 2 - 0.006, 0.05), (0.02, -W / 2 - 0.006, 0.18), 0.012, 0.012, 'alu', x_hint=(1, 0, 0), bev=0.003)
    P.views = [('a', 35, 25), ('b', 215, 30)]


# ------------------------------------------------------------------------------------------------ the charger

def nd_charger(P):
    """A battery charger (Nomad Drive's battery charger, 0.34 x 0.26 x 0.15): a ventilated case (paint) with a carrying
    handle, a dial gauge and a selector on its front (paint_b), its two leads coiled on top ending in a red and a
    black clamp (M_clamps)."""
    P.ao_distance = 0.04
    D, W, Hh = 0.15, 0.34, 0.2
    N.soft(P, 'case', (D, W, Hh), (0.0, 0.0, Hh / 2), 'paint', r=0.014)
    for k in range(6):
        P.box('slot', (0.004, 0.06, 0.006), (D / 2 + 0.001, 0.09, 0.04 + k * 0.022), 'trim', bev=None)
    N.soft(P, 'face', (0.006, W * 0.5, Hh * 0.55), (D / 2 + 0.002, -0.05, Hh * 0.52), 'paint_b', r=0.004)
    P.cyl('gauge', 0.035, 0.008, loc=(D / 2 + 0.006, -0.05, Hh * 0.6), material='gauge', axis='X', segs=24, bev=0.002)
    P.box('gauge_needle', (0.002, 0.003, 0.03), (D / 2 + 0.011, -0.05, Hh * 0.6 + 0.01), 'lens_tail', rot=(30, 0, 0), bev=None)
    P.cyl('selector', 0.012, 0.012, loc=(D / 2 + 0.008, -0.05, Hh * 0.3), material='trim', axis='X', segs=14, bev=0.003)
    J.bar(P, 'handle', (0.0, -0.1, Hh + 0.035), (0.0, 0.1, Hh + 0.035), 0.022, 0.02, 'trim', x_hint=(0, 0, 1), bev=0.008)
    for y in (-0.11, 0.11):
        P.box('handle_post', (0.02, 0.016, 0.04), (0.0, y, Hh + 0.016), 'trim', bev=0.004)
    # the leads, coiled on its top, the clamps at their ends
    for (s, mat) in ((-1, 'lens_tail'), (1, 'trim')):
        coil = [(math.cos(a) * 0.045 - 0.02, s * 0.0 + math.sin(a) * 0.05 + s * 0.05, Hh + 0.006 + 0.003 * a) for a in [k * TAU / 10 for k in range(11)]]
        P.tube('lead', coil, 0.004, 'rubber', segs=6, bend=0.4)
        P.box('clamp', (0.05, 0.016, 0.014), (0.03, s * 0.13, Hh + 0.012), mat, rot=(0, 0, s * 20), bev=0.004)
    P.empty('M_clamps', loc=(0.03, 0.0, Hh + 0.02))
    P.views = [('a', 35, 25), ('b', 215, 30)]


# ------------------------------------------------------------------------------------------------ the chests and their keys

def chest(P, ornate):
    """A treasure chest (Nomad Drive's Chest-01 and -02, 0.82 x 0.6 x 0.45): a box of planks (paint) bound with iron
    (paint_b) — the rare one's bands broader and studded — its domed lid its own child LID hinged at the back, its
    lock plate in front with the keyhole (M_lock), handles at its ends."""
    P.ao_distance = 0.08
    D, W, Hb = 0.58, 0.8, 0.27
    P.box('box', (D, W, Hb), (0.0, 0.0, Hb / 2), 'paint', bev=0.008)
    for k in range(4):
        P.box('plank_line', (D + 0.002, W + 0.002, 0.004), (0.0, 0.0, 0.06 + k * 0.06), 'trim', bev=None)
    bw = 0.05 if ornate else 0.035
    for y in (-W / 2 + 0.07, W / 2 - 0.07):
        P.box('band', (D + 0.012, bw, Hb + 0.004), (0.0, y, Hb / 2), 'paint_b', bev=0.003)
    for s in (-1, 1):
        P.tube('handle', [(-0.06, s * (W / 2 + 0.004), Hb * 0.7), (-0.06, s * (W / 2 + 0.03), Hb * 0.66), (0.06, s * (W / 2 + 0.03), Hb * 0.66),
                          (0.06, s * (W / 2 + 0.004), Hb * 0.7)], 0.007, 'paint_b', segs=8, bend=0.3)
    # the lock plate and keyhole
    P.box('lock_plate', (0.012, 0.09, 0.11), (D / 2 + 0.006, 0.0, Hb - 0.05), 'paint_b', bev=0.004)
    P.cyl('keyhole', 0.008, 0.004, loc=(D / 2 + 0.013, 0.0, Hb - 0.05), material='trim', axis='X', segs=10, bev=None)
    P.box('keyslot', (0.004, 0.005, 0.016), (D / 2 + 0.013, 0.0, Hb - 0.062), 'trim', bev=None)
    if ornate:
        for y in (-W / 2 + 0.07, W / 2 - 0.07):
            for z in (0.05, 0.13, 0.21):
                P.sphere('stud', 0.007, loc=(D / 2 + 0.008, y, z), material='paint_b', u=8, v=5)
    # the lid: a half barrel over the box, hinged at the back edge
    since = H.mark_since(P)
    R = D / 2
    arc = [(R * math.cos(a), R * 0.55 * math.sin(a)) for a in [k * math.pi / 12 for k in range(13)]]
    bm = bmesh.new()
    K.bm_prism(bm, [(x, z) for (x, z) in arc], W, matrix=mat4((0.0, 0.0, Hb + 0.002), (90, 0, 0)))
    P.mesh('lid', bm, 'paint', bev=0.006, segs=2, sharp=30.0)
    for y in (-W / 2 + 0.07, W / 2 - 0.07):
        band = [(0.0, y, Hb + 0.002)] + [(R * math.cos(a) * 1.012, y, Hb + 0.002 + R * 0.55 * math.sin(a) * 1.02) for a in [k * math.pi / 12 for k in range(13)]]
        P.tube('lid_band', band[1:], bw * 0.3, 'paint_b', segs=6, bend=0.1)
    P.box('hasp', (0.014, 0.06, 0.07), (D / 2 + 0.01, 0.0, Hb + 0.0), 'paint_b', bev=0.003)
    P.mover('LID', P.statics[since:], (-D / 2, 0.0, Hb + 0.002))
    P.empty('M_lock', loc=(D / 2 + 0.014, 0.0, Hb - 0.05))
    P.views = [('a', 35, 25), ('b', 215, 30)]


def nd_chest_1(P):
    """A common treasure chest (Nomad Drive's Chest-01)."""
    chest(P, False)


def nd_chest_2(P):
    """A rare treasure chest (Nomad Drive's Chest-02): broader bands, studded."""
    chest(P, True)


def key(P, ornate):
    """A key (Nomad Drive's Key-01 and -02, 0.16 m): a ring bow (paint), the shank, its bit (paint_b); the rare one's
    bow a trefoil with a stone in it."""
    P.ao_distance = 0.01
    z = 0.005
    if ornate:
        for k in range(3):
            a = k * TAU / 3 + math.pi
            P.torus('bow', 0.014, 0.0035, loc=(-0.06 + math.cos(a) * 0.012, math.sin(a) * 0.012, z), material='paint', segs=14, rsegs=5)
        P.sphere('stone', 0.006, loc=(-0.06, 0.0, z + 0.001), material='lens_tail', u=8, v=5)
    else:
        P.torus('bow', 0.02, 0.004, loc=(-0.058, 0.0, z), material='paint', segs=18, rsegs=6)
    P.cyl('shank', 0.0035, 0.11, loc=(0.017, 0.0, z), material='paint', axis='X', segs=8, bev=0.001)
    P.box('collar', (0.006, 0.01, 0.01), (-0.03, 0.0, z), 'paint', bev=0.001)
    P.box('bit', (0.016, 0.018, 0.004), (0.064, 0.009, z), 'paint_b', bev=0.001)
    P.box('ward', (0.004, 0.006, 0.0045), (0.062, 0.016, z), 'paint', bev=None)
    P.views = [('a', 35, 50), ('b', 215, 50)]


def nd_key_1(P):
    """A common key (Nomad Drive's Key-01): an iron key with a ring bow."""
    key(P, False)


def nd_key_2(P):
    """A rare key (Nomad Drive's Key-02): a brass key with a trefoil bow and a red stone."""
    key(P, True)


MODELS = {
    'nd_flashlight': nd_flashlight,
    'nd_polisher': nd_polisher,
    'nd_shovel': nd_shovel,
    'nd_metal_detector': nd_metal_detector,
    'nd_crowbar': nd_crowbar,
    'nd_compass': nd_compass,
    'nd_engine_kit': nd_engine_kit,
    'nd_tire_kit': nd_tire_kit,
    'nd_charger': nd_charger,
    'nd_chest_1': nd_chest_1,
    'nd_chest_2': nd_chest_2,
    'nd_key_1': nd_key_1,
    'nd_key_2': nd_key_2,
}
MODELS = {k: H.settled(f) for k, f in MODELS.items()}


def _after(P, opts):
    J.COLORS.update(COLORS)
    J._after(P, opts)


def main(args):
    K.run(MODELS, args, after=_after, out_dir=OUT, geo=False)
