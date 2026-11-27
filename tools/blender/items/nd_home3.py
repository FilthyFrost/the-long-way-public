"""
Furniture for a home on wheels (docs/V3/plan/finish.md section 11.2, section 6.2's sixth chapter): a tool board for the
wall with a hook for each of the tools one lives by, a rack for fishing rods, a workbench to stand in a motorhome or a
trailer - in our own design:

    blender -b --factory-startup --python tools/blender/build.py -- items/nd_home3 [<model>|all] [--look] [--norender]

The conventions are nd_home.py's: origin at the bottom centre, x forward (its front), resting on z = 0; `paint` and
`paint_b` take the item's two colours. The board and the rack hang by their backs (their bottoms at z = 0, their fronts
+x): where a tool hangs on the board, a rod on the rack, is the game's (src/game/modcar/v3/nd-home/rooms.ts PEGS,
RACK) - the hooks drawn here stand at those places.
"""
import math

import bmesh
from mathutils import Matrix, Vector

from parts import _kit as K
from parts._kit import V, mat4
from items import junk as J
from items import nd_home as H

OUT = 'public/models/modcar/items'

COLORS = {
    'nd_pegboard': (0xd9c9a3, 0x8a5a3c), 'nd_rod_rack': (0x6b4a2f, 0xd9c9a3), 'nd_workbench': (0x4f6f8a, 0xb98a5a),
}

# the board's hooks (across it: y here, the game's -z; up it: z), as the game hangs the tools - rooms.ts PEGS
PEGS = ((0.36, 0.53), (0.18, 0.53), (0.0, 0.53), (-0.18, 0.53), (-0.36, 0.53), (-0.27, 0.27))
# the rack's rests (up it: z), a rod lying across each pair - rooms.ts RACK
RESTS = (0.07, 0.19, 0.31)


def nd_pegboard(P):
    """A tool board (0.9 x 0.6 m): a perforated sheet (paint) in a wooden frame (paint_b), a ledge along its foot the
    tools stand on, six double hooks of bent steel wire that hold them to it - five in a row along its top for the long
    tools' shafts, one lower for the grinder; hung by its back. (A tool stands on the ledge and up the wall from there:
    hung from a hook, a shovel reached a metre down the wall and through a van's floor.)"""
    P.ao_distance = 0.06
    W, Hh, t = 0.9, 0.6, 0.012
    P.box('sheet', (t, W - 0.04, Hh - 0.04), (-0.008, 0.0, Hh / 2), 'paint', bev=0.002, segs=1)
    for s in (-1, 1):
        P.box('stile', (0.026, 0.03, Hh), (-0.002, s * (W / 2 - 0.015), Hh / 2), 'paint_b', bev=0.004, segs=1)
    for z in (0.015, Hh - 0.015):
        P.box('rail', (0.026, W - 0.06, 0.03), (-0.002, 0.0, z), 'paint_b', bev=0.004, segs=1)
    # the sheet's holes: a lattice of dark dots, every 7.5 cm
    bm = bmesh.new()
    ny, nz = 11, 7
    for i in range(ny):
        for k in range(nz):
            y = -W / 2 + 0.075 + i * (W - 0.15) / (ny - 1)
            z = 0.075 + k * (Hh - 0.15) / (nz - 1)
            K.bm_cube(bm, (0.002, 0.012, 0.012), matrix=Matrix.Translation((-0.0015, y, z)))
    P.mesh('holes', bm, 'trim', bev=None)
    # the ledge the tools stand on, a lip along its front
    P.box('ledge', (0.075, W - 0.06, 0.014), (0.035, 0.0, 0.037), 'paint_b', bev=0.003, segs=1)
    P.box('ledge_lip', (0.008, W - 0.06, 0.03), (0.0685, 0.0, 0.052), 'paint_b', bev=0.003, segs=1)
    # the hooks: two prongs out of the sheet, turned up at their ends
    for (y, z) in PEGS:
        for dy in (-0.022, 0.022):
            P.box('prong', (0.06, 0.006, 0.006), (0.028, y + dy, z), 'steel', bev=0.002, segs=1)
            P.box('tip', (0.006, 0.006, 0.024), (0.055, y + dy, z + 0.012), 'steel', bev=0.002, segs=1)
        P.box('plate', (0.004, 0.07, 0.02), (0.0, y, z - 0.002), 'steel', bev=0.002, segs=1)
    P.views = [('a', 30, 10), ('b', 150, 10)]


def nd_rod_rack(P):
    """A rod rack (0.5 m wide, 0.4 high): a back rail (paint) with two shaped arms (paint) standing out of it, three
    felt-lined notches (paint_b) in each for a rod to lie across; hung by its back."""
    P.ao_distance = 0.06
    W, Hh, D = 0.5, 0.4, 0.14
    P.box('back', (0.016, W, 0.07), (-D / 2 + 0.008, 0.0, Hh - 0.06), 'paint', bev=0.004, segs=1)
    P.box('back_low', (0.016, W, 0.05), (-D / 2 + 0.008, 0.0, 0.05), 'paint', bev=0.004, segs=1)
    for s in (-1, 1):
        y = s * (W / 2 - 0.05)
        P.box('arm', (D - 0.016, 0.022, Hh - 0.02), (0.008, y, Hh / 2), 'paint', bev=0.004, segs=1)
        for z in RESTS:
            # a notch: a lip at the arm's front edge, a pad the rod lies on
            P.box('pad', (0.07, 0.03, 0.008), (0.04, y, z - 0.004), 'paint_b', bev=0.002, segs=1)
            P.box('lip', (0.012, 0.03, 0.035), (D / 2 + 0.004, y, z + 0.012), 'paint', bev=0.004, segs=1)
    P.views = [('a', 30, 10), ('b', 150, 10)]


def nd_workbench(P):
    """A workbench to stand in a motorhome or a trailer (1.1 x 0.55 m, 0.88 high): a steel frame (paint) with a low
    shelf, a thick wooden top (paint_b) with a back board, a vice at its left end, a drawer under the top (drawn shut)
    and a lamp on a bent arm over it."""
    P.ao_distance = 0.25
    L, D, Hh = 1.1, 0.55, 0.84
    for sx in (-1, 1):
        for sy in (-1, 1):
            P.box('leg', (0.045, 0.045, Hh), (sx * (D / 2 - 0.04), sy * (L / 2 - 0.04), Hh / 2), 'paint', bev=0.004, segs=1)
    for sy in (-1, 1):
        P.box('side_rail', (D - 0.08, 0.03, 0.04), (0.0, sy * (L / 2 - 0.04), 0.2), 'paint', bev=0.003, segs=1)
        P.box('side_top', (D - 0.08, 0.03, 0.05), (0.0, sy * (L / 2 - 0.04), Hh - 0.03), 'paint', bev=0.003, segs=1)
    for sx in (-1, 1):
        P.box('long_rail', (0.03, L - 0.08, 0.04), (sx * (D / 2 - 0.04), 0.0, 0.2), 'paint', bev=0.003, segs=1)
        P.box('long_top', (0.03, L - 0.08, 0.05), (sx * (D / 2 - 0.04), 0.0, Hh - 0.03), 'paint', bev=0.003, segs=1)
    P.box('shelf', (D - 0.1, L - 0.1, 0.018), (0.0, 0.0, 0.228), 'paint_b', bev=0.003, segs=1)
    P.mesh('top', J.slab((D + 0.04, L + 0.04, 0.045), (0.0, 0.0, Hh + 0.0225), step=0.12), 'paint_b', bev=0.006)
    P.box('backboard', (0.02, L + 0.04, 0.12), (-D / 2 - 0.01, 0.0, Hh + 0.105), 'paint_b', bev=0.004, segs=1)
    # the drawer under the top, on the right
    P.box('drawer', (0.02, 0.42, 0.11), (D / 2 - 0.03, -0.26, Hh - 0.115), 'paint', bev=0.004, segs=1)
    H.pull(P, D / 2 - 0.018, -0.26, Hh - 0.115)
    # the vice at the left end: its body on the top, the fixed jaw, the sliding jaw on its screw, the handle
    vy = L / 2 - 0.16
    P.box('vice_base', (0.16, 0.12, 0.03), (D / 2 - 0.1, vy, Hh + 0.06), 'steel', bev=0.006, segs=1)
    P.box('vice_body', (0.09, 0.09, 0.07), (D / 2 - 0.13, vy, Hh + 0.11), 'steel', bev=0.01, segs=2)
    P.box('jaw_fixed', (0.02, 0.12, 0.06), (D / 2 - 0.075, vy, Hh + 0.145), 'steel', bev=0.004, segs=1)
    P.box('jaw_slide', (0.03, 0.12, 0.07), (D / 2 - 0.015, vy, Hh + 0.14), 'steel', bev=0.004, segs=1)
    P.box('screw', (0.12, 0.02, 0.02), (D / 2 + 0.04, vy, Hh + 0.115), 'alu', bev=0.004, segs=1)
    P.box('handle', (0.012, 0.012, 0.16), (D / 2 + 0.095, vy, Hh + 0.115), 'alu', bev=0.003, segs=1)
    # the lamp: an arm up from the back board and out over the top, a shade
    ly = -L / 2 + 0.2
    J.bar(P, 'lamp_arm', (-D / 2 + 0.0, ly, Hh + 0.16), (-D / 2 + 0.0, ly, Hh + 0.5), 0.016, 0.016, 'alu', bev=0.004)
    J.bar(P, 'lamp_reach', (-D / 2 + 0.0, ly, Hh + 0.5), (-0.04, ly, Hh + 0.46), 0.016, 0.016, 'alu', bev=0.004)
    P.lathe('shade', [(0.0, 0.052), (0.028, 0.052), (0.07, 0.0), (0.075, 0.0), (0.03, 0.06), (0.0, 0.06)], loc=(-0.04, ly, Hh + 0.4), material='paint',
            segs=14, sharp=50.0)
    P.views = [('a', 35, 16), ('b', 145, 20)]


MODELS = {
    'nd_pegboard': nd_pegboard,
    'nd_rod_rack': nd_rod_rack,
    'nd_workbench': nd_workbench,
}
MODELS = {k: H.settled(f) for k, f in MODELS.items()}


def _after(P, opts):
    J.COLORS.update(COLORS)
    J._after(P, opts)


def main(args):
    K.run(MODELS, args, after=_after, out_dir=OUT, geo=False)
