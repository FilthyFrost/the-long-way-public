"""Smoke test of tools/blender/lib/modcar.py: a bevelled block, a tyre-ish cylinder, a mount, AO, GLB, preview."""
import math

import bmesh
import bpy

from lib import modcar as mc


def main(args):
    out = args[0] if args else 'D:/modcar-scratch/lib_smoke'
    mc.reset_scene()
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts:
        v.co.x *= 2.0
        v.co.y *= 0.9
        v.co.z = v.co.z * 0.5 + 0.55
    body = mc.mesh_object('BODY', bm, 'paint')
    mc.bevel(body, width=0.06, segments=3)
    mc.smooth(body)
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=32, radius1=0.3, radius2=0.3, depth=0.2)
    tyre = mc.mesh_object('TYRE', bm, 'rubber')
    tyre.rotation_euler = (math.pi / 2, 0, 0)
    tyre.location = (0.7, 0.55, 0.3)
    mc.smooth(tyre)
    mc.empty('M_hub_FL', loc=(0.7, 0.55, 0.3), props={'cat': 'rim', 'axle': 'front'})
    mc.bake_ao([body, tyre], samples=8)
    print('TRIS', mc.triangles([body, tyre]))
    mc.export_glb(out + '.glb', [body, tyre] + [o for o in bpy.data.objects if o.type == 'EMPTY'])
    print('MOUNTS', mc.mounts_json(out + '.mounts.json', 'smoke'))
    mc.preview(out + '.png', target=(0, 0, 0.5), dist=5.5)
    print('SMOKE OK')
