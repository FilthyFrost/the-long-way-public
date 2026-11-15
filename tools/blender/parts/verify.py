"""
Check every ModCar part GLB against the conventions (run in Blender):

    blender -b --factory-startup --python tools/blender/build.py -- parts/verify

Re-imports public/models/modcar/parts/*.glb one by one and checks: a top-level mesh named PART, only
conventional material names, the AO colour attribute, the sub-mounts each category needs (M_tire,
M_tire2, M_turbo, M_exhaust_out), EYE on seats, fit_nominal on stretch parts, triangle budgets, and that
every non-panel part of the catalogue has a file. Prints a table and exits non-zero on errors.
"""
import json
import os
import sys

import bpy

from lib import modcar as mc

CATALOGUE = """eng_mower eng_single eng_2t eng_i4 eng_i4d eng_flat6 eng_v8 eng_d6 gb_3 gb_4 gb_5 gb_moto rad_small rad_std
rad_big bat_moto bat_std bat_truck tank_moto tank_std tank_big tank_drum exh_stock exh_sport exh_side exh_moto
turbo_small rim_steel13 rim_alloy15 rim_off16 rim_moto18 rim_truck19 rim_dually rim_cart tire_road tire_whitewall
tire_offroad tire_snow tire_slick tire_tractor tire_moto tire_truck steer_std steer_bad steer_sport steer_bar
steer_ship seat_bucket seat_bench seat_race seat_toilet seat_armchair seat_office seat_saddle seat_crate radio_old
radio_tape hb_stock hb_drift gl_stock gl_short gl_foot ign_key ign_button horn_beep horn_trumpet horn_air bf_stock
bf_bullbar bf_ram bf_plow br_stock br_spikes hl_round hl_square hl_spot tl_stock tl_round mir_stock mir_truck
roof_rack roof_lightbar roof_solar roof_spikes arm_plates arm_planks""".split()

TURBO = {'eng_i4', 'eng_i4d', 'eng_flat6', 'eng_v8', 'eng_d6'}
STRETCH_PREFIX = ('bf_', 'br_', 'roof_', 'arm_')


def catalogue():
    """The non-panel part ids of the game's catalogue (src/core/modcar/parts.ts; panels - doors, bonnets,
    boot lids - are the frames' work), or the list above when the file is not there."""
    import re
    path = 'src/core/modcar/parts.ts'
    if not os.path.exists(path):
        return CATALOGUE
    src = open(path, encoding='utf-8').read()
    ids = []
    for m in re.finditer(r'\bP\(\{', src):
        # the entry runs to its matching brace (entries may span several lines)
        depth, i = 0, m.end() - 1
        while i < len(src):
            if src[i] == '{':
                depth += 1
            elif src[i] == '}':
                depth -= 1
                if depth == 0:
                    break
            i += 1
        block = src[m.end() - 1: i + 1]
        mid = re.search(r"\bid:\s*'([a-z0-9_]+)'", block)
        if mid and not re.search(r'\bpanel:', block):
            ids.append(mid.group(1))
    return ids or CATALOGUE


def budget(pid):
    if pid.startswith('tool:'):
        return 2000
    if pid.startswith('eng_'):
        return 15000
    if pid.startswith('rim_dually'):
        return 7000
    if pid.startswith('rim_'):
        return 3200
    if pid.startswith('tire_'):
        return 4500
    if pid.startswith('seat_'):
        return 5000
    if pid.startswith(('bf_', 'br_', 'roof_', 'arm_', 'exh_', 'gb_', 'tank_', 'rad_')):
        return 5000
    return 2600   # small parts (2k target, a few meme parts allowed a little more)


def inside_out_islands(obj):
    """Closed islands whose signed volume is negative (faces pointing inwards). Open sheets are skipped."""
    import bmesh
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bm.verts.ensure_lookup_table()
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
        edges = {e for f in island for e in f.edges}
        if any(len(e.link_faces) != 2 for e in edges):
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


TOOLS_DIR = 'public/models/modcar/tools'


def tool_kinds():
    """The garage tools (src/core/modcar/tools.ts ToolKind): each wants tools/<kind>.glb."""
    import re
    path = 'src/core/modcar/tools.ts'
    if os.path.exists(path):
        m = re.search(r"export type ToolKind\s*=\s*([^;]+);", open(path, encoding='utf-8').read())
        if m:
            return re.findall(r"'([a-z0-9_]+)'", m.group(1))
    return ['jerrycan', 'bottle', 'oilcan', 'spray', 'sponge']


def check_tool(path, kind):
    """A tool model: the part checks, a 2k budget, and its origin at the bottom centre."""
    tris, errs, warns, movers, empties = check(path, 'tool:' + kind)
    xs, ys, zs = [], [], []
    for o in bpy.data.objects:
        if o.type == 'MESH':
            for v in o.data.vertices:
                w = o.matrix_world @ v.co
                xs.append(w.x)
                ys.append(w.y)
                zs.append(w.z)
    if zs and abs(min(zs)) > 0.002:
        errs.append(f'bottom at z {min(zs):.4f}, not on the origin')
    if xs:
        cx, cy = (min(xs) + max(xs)) / 2, (min(ys) + max(ys)) / 2
        if abs(cx) > 0.02 or abs(cy) > 0.03:
            warns.append(f'footprint centre ({cx:.3f}, {cy:.3f}) is off the origin')
    return tris, errs, warns, movers, empties


def check(path, pid):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=path)
    errs, warns = [], []
    objs = list(bpy.data.objects)
    roots = [o for o in objs if o.parent is None]
    part = bpy.data.objects.get('PART')
    if part is None or part.type != 'MESH':
        errs.append('no PART mesh')
    elif part.parent is not None:
        errs.append('PART is not the root')
    if len([r for r in roots if r.type == 'MESH' or r.name.startswith('M_')]) > 1:
        warns.append('several roots: ' + ','.join(r.name for r in roots))
    meshes = [o for o in objs if o.type == 'MESH']
    tris = 0
    for o in meshes:
        o.data.calc_loop_triangles()
        tris += len(o.data.loop_triangles)
        if not o.data.color_attributes:
            errs.append(f'{o.name}: no AO colour attribute')
        if '@' not in pid:
            nb = inside_out_islands(o)
            if nb:
                errs.append(f'{o.name}: {nb} inside-out closed islands')
        for m in o.data.materials:
            base = m.name.split('.')[0] if m else '?'
            if base not in mc.MAT_NAMES:
                errs.append(f'{o.name}: material {m.name!r} is not conventional')
    names = {o.name.split('.')[0] for o in objs}
    if pid.startswith('rim_') and '@' not in pid:
        if pid != 'rim_cart' and 'M_tire' not in names:
            errs.append('rim without M_tire')
        if pid == 'rim_dually' and 'M_tire2' not in names:
            errs.append('dually without M_tire2')
    if pid.startswith('eng_'):
        if 'M_exhaust_out' not in names:
            errs.append('engine without M_exhaust_out')
        if pid in TURBO and 'M_turbo' not in names:
            errs.append('turbo engine without M_turbo')
    if pid.startswith('seat_') and 'EYE' not in names:
        errs.append('seat without EYE')
    if pid.startswith(STRETCH_PREFIX) and '@' not in pid:
        if part is None or 'fit_nominal' not in part.keys():
            errs.append('stretch part without fit_nominal')
    if tris > budget(pid):
        warns.append(f'{tris} tris > budget {budget(pid)}')
    movers = sorted(o.name for o in meshes if o.name != 'PART')
    empties = sorted(o.name for o in objs if o.type == 'EMPTY')
    return tris, errs, warns, movers, empties


def main(args):
    folder = 'public/models/modcar/parts'
    files = sorted(f for f in os.listdir(folder) if f.endswith('.glb'))
    ids = [f[:-4] for f in files]
    lines = []
    n_err = 0
    tri_of = {}
    for f, pid in zip(files, ids):
        tris, errs, warns, movers, empties = check(os.path.join(folder, f), pid)
        tri_of[pid] = tris
        n_err += len(errs)
        flag = 'ERR ' if errs else ('warn' if warns else 'ok  ')
        extra = ' '.join(movers + empties)
        lines.append(f'{flag} {pid:28s} {tris:6d}  {extra}  {"; ".join(errs + warns)}')
    # a mounted wheel (rim + its tyre variant) should stay within 6k triangles per wheel
    over = []
    for pid in ids:
        if '@' not in pid:
            continue
        tyre, rim = pid.split('@')
        if rim not in tri_of:
            continue
        k = 2 if rim == 'rim_dually' else 1
        per_wheel = (tri_of[rim] + k * tri_of[pid]) / k
        if per_wheel > 6000:
            over.append(f'{tyre}@{rim} {per_wheel:.0f}')
    lines.append(f'wheels: {len(over)} rim+tyre combinations over 6000 tris per wheel' +
                 (': ' + ', '.join(over) if over else ''))
    tfiles = sorted(f for f in os.listdir(TOOLS_DIR) if f.endswith('.glb')) if os.path.isdir(TOOLS_DIR) else []
    for f in tfiles:
        kind = f[:-4]
        tris, errs, warns, movers, empties = check_tool(os.path.join(TOOLS_DIR, f), kind)
        n_err += len(errs)
        flag = 'ERR ' if errs else ('warn' if warns else 'ok  ')
        lines.append(f'{flag} {"tools/" + kind:28s} {tris:6d}  {"; ".join(errs + warns)}')
    for kind in tool_kinds():
        if f'{kind}.glb' not in tfiles:
            lines.append(f'ERR  {"tools/" + kind:28s}  missing file')
            n_err += 1
    cat = catalogue()
    missing = [p for p in cat if p not in ids]
    for p in missing:
        lines.append(f'ERR  {p:28s}  missing file')
        n_err += 1
    geo = json.load(open('src/core/modcar/data/parts_geo.json', encoding='utf-8'))['parts']
    nogeo = [p for p in ids if p not in geo]
    for p in nogeo:
        lines.append(f'ERR  {p:28s}  not in parts_geo.json')
        n_err += 1
    out = '\n'.join(lines)
    print(out)
    summary = (f'VERIFY {len(files)} files, {len(cat) - len(missing)}/{len(cat)} catalogue parts, '
               f'{len(tfiles)} tools, {n_err} errors')
    print(summary)
    os.makedirs('D:/modcar-scratch/parts', exist_ok=True)
    with open('D:/modcar-scratch/parts/verify.txt', 'w', encoding='utf-8') as fh:
        fh.write(out + '\n' + summary + '\n')
    if n_err:
        sys.exit(1)
