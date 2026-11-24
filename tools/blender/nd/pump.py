"""
The water pump (docs/ND/PLAN.md, ND2): a place of Nomad Drive's "Waterpump" kind (a minor place: its pump alone by
the road, its footprint some 0.9 m square and a metre high, the ground round it levelled for a metre and a half) in
our own design:

    blender -b --factory-startup --python tools/blender/build.py -- nd/pump [pump] [--norender] [--noao]

A low round well head of fieldstones (paint: the place's stone, mortared: paint_b) under a lid of heavy planks (wood) banded with
iron straps (steel), a flat stone set in the ground in front where the water splashes; the pump itself is a thing
of its own (items/nd_water.py nd_hand_pump) standing on the lid at its front edge, its spout over the rim (the
card's spot `pump`), a bucket left by it now and then (`side`). Its frame and its card: nd/_nd.py.
"""
import math

import bmesh
from mathutils import Matrix, Vector

from parts import _kit as K
from parts._kit import V, mat4
from places import _common as C
from nd import _nd as N

TAU = math.tau
R = 0.42          # the well head's outer radius
ZT = 0.42         # its wall's top
LID = 0.05        # the lid's planks


def stone(bm, c, size, seed, rot=0.0):
    """A fieldstone: a rounded lump, flattened, its faces a little uneven."""
    b2 = bmesh.new()
    bmesh.ops.create_icosphere(b2, subdivisions=2, radius=1.0)
    for v in b2.verts:
        n = v.co.normalized()
        k = 1.0 + 0.12 * C.jit(seed * 7.3 + n.x * 3.1, n.y * 2.3 + n.z * 1.7)
        v.co = Vector((n.x * size[0] * k, n.y * size[1] * k, n.z * size[2] * k))
    K.bm_transform(b2, mat4(c, (0, 0, rot)))
    tmp = K.bpy.data.meshes.new('tmp')
    b2.to_mesh(tmp)
    b2.free()
    bm.from_mesh(tmp)
    K.bpy.data.meshes.remove(tmp)


def pump(P):
    card = N.Card('pump')
    B = N.new_set()
    # ---------------------------------------------------------------------------------------- the well head
    # a mortared core (paint_b) and the fieldstones round it, course by course
    P.cyl('core', R - 0.035, ZT - 0.01, loc=(0, 0, (ZT - 0.01) / 2), material='paint_b', segs=28, bev=0.01)
    k = 0
    courses = 4
    for c in range(courses):
        z = 0.06 + c * (ZT - 0.08) / (courses - 1)
        n = 11 + (c % 2)
        for i in range(n):
            a = (i + 0.5 * (c % 2)) * TAU / n + 0.06 * C.jit(k, 1.0)
            rr = R - 0.045 + 0.008 * C.jit(k, 2.0)
            sx = 0.105 + 0.02 * C.jit(k, 3.0)
            sz = 0.062 + 0.012 * C.jit(k, 4.0)
            stone(B['paint'], (math.cos(a) * rr, math.sin(a) * rr, z), (0.06, sx, sz), k, rot=math.degrees(a))
            k += 1
    # ---------------------------------------------------------------------------------------- the lid
    for i in range(5):
        y = -R + 0.08 + i * (2 * R - 0.16) / 4
        # (cut to the round: each plank a little short of the rim's chord through its middle)
        half = 0.93 * math.sqrt(max(0.0, (R + 0.02) ** 2 - y * y))
        C.plank(P, 'lid_plank', V((-half, y, ZT + LID / 2)), V((half, y, ZT + LID / 2)), 0.17, LID, 'wood', up=(0, 0, 1), bev=0.006)
    for x in (-0.22, 0.22):
        half = math.sqrt(max(0.0, (R + 0.02) ** 2 - x * x))
        P.box('strap', (0.04, 2 * half, 0.008), (x, 0.0, ZT + LID + 0.004), 'steel', bev=0.002)
        for s in (-1, 1):
            P.cyl('nail', 0.008, 0.006, loc=(x, s * (half - 0.04), ZT + LID + 0.01), material='steel', segs=8, bev=0.002)
    # ---------------------------------------------------------------------------------------- the ground in front
    stone(B['paint'], (0.0, R + 0.3, 0.015), (0.3, 0.24, 0.035), 91)
    for j, (x, y, s) in enumerate(((-0.42, 0.35, 0.09), (0.45, 0.25, 0.07), (0.3, -0.45, 0.06), (-0.32, -0.4, 0.08))):
        stone(B['paint'], (x, y, 0.02), (s * 1.2, s, s * 0.55), 40 + j)
    # ---------------------------------------------------------------------------------------- where things stand
    card.spot('pump', 0.0, R - 0.16, ZT + LID, 90)
    card.spot('side', 0.55, 0.35, 0.0, 30)
    card.spot('back', -0.5, -0.45, 0.0, 200)
    # (ND4: an old plate left leaning by the well)
    card.spot('lean', -0.5, 0.45, 0.0, 120)
    # what cannot be walked through: the well head (the pump on it is the pump's own)
    card.post(0.0, 0.0, R, 0.0, ZT + LID)
    card.box(-R, R, -R, R, ZT + LID - 0.01, ZT + LID, floor=True)
    N.finish_bms(P, B)
    P.views = [('a', 60, 18), ('b', -40, 25)]
    size = (1.6, 1.8, ZT + LID + 0.7)
    card.extra['plinth'] = 0.0
    return card, size, {}


TABLE = {'pump': pump}


def main(args):
    N.run(TABLE, args)
