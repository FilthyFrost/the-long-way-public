"""
Check every place model against the conventions (run in Blender):

    blender -b --factory-startup --python tools/blender/build.py -- places/verify [<id> ...]

Re-imports public/models/modcar/places/<id>.glb for every model of places/furniture.py and places/outside.py and
checks: the file is there; the root is the mesh PART; it stands on z = 0 with its footprint centred (2 cm); its
bounds are its size at the places (3 %, or the bounds its spec gives); only conventional material names; the AO
colours are there (and not all white); the triangles within its class's budget; no inside-out closed islands;
the movers and markers its spec names are there, each mover with its extras and its origin on its hinge or
pivot edge (doors on their outer edge, drawers on their front, lids on their back edge); on a model with a front
the doors, drawers and the front markers are on the +X side. Prints a table, writes it to
D:/modcar-scratch/places/verify.txt and exits non-zero on errors.
"""
import os
import sys

import bpy
from mathutils import Vector

from lib import modcar as mc
from places import _common as C
from places import furniture, outside  # noqa: F401  (they fill C.SPECS)

V = Vector


def inside_out_islands(obj):
    """Closed islands whose signed volume is negative (faces pointing inwards). Open sheets are skipped."""
    import bmesh
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    seen = set()
    bad = 0
    for f0 in bm.faces:
        if f0.index in seen:
            continue
        stack = [f0]
        island = []
        seen.add(f0.index)
        while stack:
            f = stack.pop()
            island.append(f)
            for e in f.edges:
                for g in e.link_faces:
                    if g.index not in seen:
                        seen.add(g.index)
                        stack.append(g)
        if any(len(e.link_faces) != 2 for f in island for e in f.edges):
            continue
        vol = 0.0
        for f in island:
            vs = [v.co for v in f.verts]
            for i in range(1, len(vs) - 1):
                vol += vs[0].dot(vs[i].cross(vs[i + 1])) / 6.0
        if vol < -1e-9:
            bad += 1
    bm.free()
    return bad


def world_bounds(objs):
    lo = V((1e9, 1e9, 1e9))
    hi = V((-1e9, -1e9, -1e9))
    for o in objs:
        mw = o.matrix_world
        for v in o.data.vertices:
            p = mw @ v.co
            for i in range(3):
                lo[i] = min(lo[i], p[i])
                hi[i] = max(hi[i], p[i])
    return lo, hi


def local_bounds(o):
    lo = V((1e9, 1e9, 1e9))
    hi = V((-1e9, -1e9, -1e9))
    for v in o.data.vertices:
        for i in range(3):
            lo[i] = min(lo[i], v.co[i])
            hi[i] = max(hi[i], v.co[i])
    return lo, hi


def check(pid, sp):
    path = os.path.join(C.OUT, f'{pid}.glb')
    errs, warns = [], []
    if not os.path.exists(path):
        return 0, 0, ['missing file'], [], []
    kb = os.path.getsize(path) / 1024
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=path)
    bpy.context.view_layer.update()
    objs = list(bpy.data.objects)
    roots = [o for o in objs if o.parent is None]
    part = bpy.data.objects.get('PART')
    if part is None or part.type != 'MESH':
        errs.append('no PART mesh')
        return 0, kb, errs, warns, []
    if part.parent is not None:
        errs.append('PART is not the root')
    if [r.name for r in roots] != ['PART']:
        errs.append('roots: ' + ','.join(r.name for r in roots))
    meshes = [o for o in objs if o.type == 'MESH']
    # triangles, materials, AO, inside-out islands
    tris = 0
    for o in meshes:
        o.data.calc_loop_triangles()
        tris += len(o.data.loop_triangles)
        col = o.data.color_attributes.get('Col') or (o.data.color_attributes[0] if o.data.color_attributes else None)
        if col is None:
            errs.append(f'{o.name}: no AO colour attribute')
        else:
            vals = [d.color[0] for d in col.data]
            if vals and min(vals) > 0.97:
                warns.append(f'{o.name}: AO all white')
        nb = inside_out_islands(o)
        if nb:
            errs.append(f'{o.name}: {nb} inside-out closed islands')
        for m in o.data.materials:
            base = m.name.split('.')[0] if m else '?'
            if base not in mc.MAT_NAMES:
                errs.append(f'{o.name}: material {m.name!r} is not conventional')
    lo_b, hi_b = C.BUDGET[sp['cls']]
    if tris > hi_b:
        errs.append(f'{tris} tris > budget {hi_b} ({sp["cls"]})')
    elif tris < lo_b:
        warns.append(f'{tris} tris < {lo_b} ({sp["cls"]})')
    if kb > 250 or kb < 30:
        warns.append(f'{kb:.0f} KB outside 30..250')
    # standing on z = 0, centred, its size (Blender: d along X, w along Y, h along Z)
    lo, hi = world_bounds(meshes)
    w, d, h = sp['bounds']
    if abs(lo.z - sp['z0']) > 0.005:
        errs.append(f'bottom at z {lo.z:.4f} (not {sp["z0"]})')
    cx, cy = (lo.x + hi.x) / 2, (lo.y + hi.y) / 2
    centre = sp.get('centre', (0.0, 0.0))
    if abs(cx - centre[0]) > 0.02 or abs(cy - centre[1]) > 0.02:
        errs.append(f'footprint centre ({cx:.3f}, {cy:.3f})')
    ext = (hi.y - lo.y, hi.x - lo.x, hi.z - lo.z)
    for nm, got, want in zip(('w', 'd', 'h'), ext, (w, d, h)):
        if abs(got - want) > 0.03 * want + 0.002:
            errs.append(f'{nm} {got:.3f} != {want:.3f}')
    if 'size' not in part.keys():
        errs.append('PART without its size extras')
    # movers and markers
    names = {o.name: o for o in objs}
    movers = {o.name: o for o in meshes if o.name != 'PART'}
    empties = {o.name: o for o in objs if o.type == 'EMPTY'}
    for nm in sp['movers']:
        if nm not in movers:
            errs.append(f'no mover {nm}')
    for nm in movers:
        if nm not in sp['movers']:
            warns.append(f'mover {nm} not in its spec')
    for nm in sp['markers']:
        if nm not in empties:
            errs.append(f'no marker {nm}')
    front = hi.x
    for nm, o in movers.items():
        meta = sp['movers'].get(nm, {})
        for k in ('move', 'open'):
            if k in meta and k not in o.keys():
                errs.append(f'{nm}: no {k} extras')
        if o.rotation_mode != 'QUATERNION' and any(abs(a) > 1e-4 for a in o.rotation_euler) or \
                o.rotation_mode == 'QUATERNION' and abs(o.rotation_quaternion.w) < 0.9999:
            errs.append(f'{nm}: rotated (a mover has no rotation of its own)')
        piv = o.matrix_world.translation
        llo, lhi = local_bounds(o)
        mv = meta.get('move')
        if nm.startswith('DOOR'):
            # (the extras are in the game frame: hinge '-z' is Blender's +Y edge, the door turns about game y = Z)
            hinge = meta.get('hinge')
            if hinge not in ('-z', '+z') or meta.get('axis') != 'y':
                errs.append(f'{nm}: hinge {hinge!r} / axis {meta.get("axis")!r}')
            if hinge == '-z' and lhi.y > 0.02:
                errs.append(f'{nm}: reaches {lhi.y:.3f} beyond its hinge (Blender +Y edge)')
            if hinge == '+z' and llo.y < -0.02:
                errs.append(f'{nm}: reaches {llo.y:.3f} beyond its hinge (Blender -Y edge)')
            if (meta.get('open', 0) > 0) != (hinge == '-z'):
                errs.append(f'{nm}: opens the wrong way ({meta.get("open")})')
            if sp['front'] and piv.x < front - 0.12:
                errs.append(f'{nm}: hinge at x {piv.x:.3f}, not on the front ({front:.3f})')
            if lhi.x - llo.x > 0.2:
                warns.append(f'{nm}: {lhi.x - llo.x:.3f} thick')
        elif nm.startswith('DRAWER'):
            if lhi.x > 0.06 or llo.x > -0.05:
                errs.append(f'{nm}: origin not on its front face (x {llo.x:.3f}..{lhi.x:.3f})')
            if sp['front'] and piv.x < front - 0.12:
                errs.append(f'{nm}: front at x {piv.x:.3f}, not on the front ({front:.3f})')
            if mv != 'slide':
                errs.append(f'{nm}: move {mv}')
        elif nm == 'LID' and mv == 'hinge':
            if llo.x < -0.03:
                errs.append(f'LID: reaches {llo.x:.3f} behind its hinge (the back edge)')
            # (near the hinge it may not hang below it, or it would cut into the box as it opens; a hasp or a lip
            # may hang down at the front)
            low = min((v.co.z for v in o.data.vertices if v.co.x < 0.06), default=0.0)
            if low < -0.025:
                errs.append(f'LID: reaches {low:.3f} below its hinge near it')
            if meta.get('axis') != 'z' or meta.get('open', 0) <= 0:
                errs.append('LID: not hinged about game z opening its front edge upwards')
        else:
            if not all(llo[i] - 0.03 <= 0.0 <= lhi[i] + 0.03 for i in range(3)):
                errs.append(f'{nm}: origin outside it ({llo[:]} .. {lhi[:]})')
    for nm, e in empties.items():
        # (a marker inside a drawer rides on it; the hose's end on the nozzle)
        want = f'DRAWER_{nm.split("_")[-1]}' if nm.startswith('M_inside_') else 'NOZZLE' if nm == 'M_nozzle' else None
        if want and want in movers and (e.parent is None or e.parent.name != want):
            errs.append(f'marker {nm} is not a child of {want}')
        p = e.matrix_world.translation
        if not all(lo[i] - 0.1 <= p[i] <= hi[i] + 0.1 for i in range(3)):
            errs.append(f'marker {nm} outside the model at {tuple(round(c, 3) for c in p)}')
        if sp['front'] and nm in ('M_display', 'M_nozzle') and p.x < 0.0:
            errs.append(f'marker {nm} on the back (x {p.x:.3f})')
    extra = sorted(movers) + sorted(empties)
    return tris, kb, errs, warns, extra


def main(args):
    ids = [a for a in args if not a.startswith('--')] or list(C.SPECS)
    lines = []
    n_err = 0
    for pid in ids:
        sp = C.SPECS[pid]
        tris, kb, errs, warns, extra = check(pid, sp)
        n_err += len(errs)
        flag = 'ERR ' if errs else ('warn' if warns else 'ok  ')
        w, d, h = sp['size']
        lines.append(f'{flag} {pid:16s} {w:5.2f}x{d:4.2f}x{h:4.2f} {tris:6d} tris {kb:6.1f} KB  {" ".join(extra)}'
                     + (f'  | {"; ".join(errs + warns)}' if errs or warns else ''))
    out = '\n'.join(lines)
    print(out)
    summary = f'VERIFY {len(ids)} place models, {n_err} errors'
    print(summary)
    with open(os.path.join(C.SCRATCH, 'verify.txt'), 'w', encoding='utf-8') as fh:
        fh.write(out + '\n' + summary + '\n')
    if n_err:
        sys.exit(1)
