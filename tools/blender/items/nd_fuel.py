"""
A filling station's nozzle (docs/ND/PLAN.md, ND5: Nomad Drive's gas pump nozzle) in our own design — a cast body with a
cream cap and grip, a steel spout bent a little down, the lever under it in its guard, the hose's end going into its
back:

    blender -b --factory-startup --python tools/blender/build.py -- items/nd_fuel [nd_nozzle|all] [--look] [--norender]

The junk script's conventions (items/junk.py): origin at the bottom middle, x forward (the spout), resting on z = 0;
`paint` and `paint_b` the item's two colours (dark, cream). Markers: M_spout its tip (what goes into a filler),
M_hosein where the hose goes into it. nozzle_parts() is the same nozzle anywhere: the station's hangs it on its pump
(nd/station.py).
"""
import math

import bmesh
from mathutils import Matrix, Vector

from parts import _kit as K
from parts._kit import V
from places import _common as C
from items import junk as J
from items import nd_home as H

OUT = 'public/models/modcar/items'
COLORS = {'nd_nozzle': (0x2f3236, 0xefe6cf)}

# where its tip and its hose's end are, in its own frame (before the shift that centres it)
SPOUT = (0.333, 0.0, 0.072)
HOSE_IN = (-0.1, 0.0, 0.086)
# the shift that puts its middle over the origin
SHIFT = -0.11


def nozzle_parts(P, M, body='paint', cap='paint_b', steel='steel', hose='rubber'):
    """The nozzle's pieces in its own frame (x the spout, z up, the guard's bottom on z = 0) put through M; the statics
    made (to be made a mover of, or left as they are)."""
    since = len(P.statics)

    def box(name, size, c, mat, rot=None):
        bm = bmesh.new()
        m = M @ Matrix.Translation(V(c))
        if rot is not None:
            m = m @ rot
        K.bm_cube(bm, tuple(size), m)
        P.mesh(name, bm, mat, sharp=40.0)

    def tube(name, a, b, r, mat, segs=10):
        C.post(P, name, M @ V(a), M @ V(b), r, mat, segs=segs)

    # the body, its cap rounded over the top, the badge on its side
    box('nozzle_body', (0.15, 0.05, 0.06), (0.07, 0.0, 0.1), body)
    box('nozzle_cap', (0.12, 0.054, 0.02), (0.075, 0.0, 0.138), cap)
    for sy in (-1, 1):
        box('nozzle_badge', (0.04, 0.004, 0.025), (0.08, sy * 0.026, 0.1), cap)
    # the spout bent a little down, its ring at the body
    tube('nozzle_spout', (0.14, 0.0, 0.104), (0.333, 0.0, 0.072), 0.0105, steel)
    tube('nozzle_ring', (0.14, 0.0, 0.104), (0.165, 0.0, 0.1), 0.017, steel)
    # the lever under it, the guard round the lever
    tube('nozzle_lever', (0.12, 0.0, 0.07), (0.025, 0.0, 0.034), 0.008, steel)
    tube('nozzle_guard_a', (0.13, 0.0, 0.072), (0.118, 0.0, 0.008), 0.006, steel, segs=6)
    tube('nozzle_guard_b', (0.118, 0.0, 0.008), (0.0, 0.0, 0.016), 0.006, steel, segs=6)
    tube('nozzle_guard_c', (0.0, 0.0, 0.016), (-0.006, 0.0, 0.07), 0.006, steel, segs=6)
    # the grip at its back, the hose's end going into it with its collar
    box('nozzle_grip', (0.075, 0.046, 0.052), (-0.012, 0.0, 0.086), cap, Matrix.Rotation(0.22, 4, 'Y'))
    tube('nozzle_collar', (-0.045, 0.0, 0.088), (-0.062, 0.0, 0.087), 0.021, steel)
    tube('nozzle_hose', (-0.05, 0.0, 0.088), (-0.1, 0.0, 0.086), 0.016, hose)
    return P.statics[since:]


def nd_nozzle(P):
    """The nozzle as it is held (Nomad Drive's gas pump nozzle: its hose's end into its back, its spout forward)."""
    P.ao_distance = 0.02
    M = Matrix.Translation((SHIFT, 0.0, 0.0))
    nozzle_parts(P, M)
    P.empty('M_spout', loc=tuple(M @ V(SPOUT)))
    P.empty('M_hosein', loc=tuple(M @ V(HOSE_IN)))
    P.views = [('a', 35, 15), ('b', 150, 15)]


MODELS = {'nd_nozzle': nd_nozzle}
MODELS = {k: H.settled(f) for k, f in MODELS.items()}


def _after(P, opts):
    J.COLORS.update(COLORS)
    J._after(P, opts)


def main(args):
    K.run(MODELS, args, after=_after, out_dir=OUT, geo=False)
