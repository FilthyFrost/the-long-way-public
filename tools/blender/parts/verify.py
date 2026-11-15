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
radio_tape hb_stock hb_drift gl_stock gl_short ign_key ign_button horn_beep horn_trumpet horn_air bf_stock
bf_bullbar bf_ram bf_plow br_stock br_spikes hl_round hl_square hl_spot tl_stock tl_round mir_stock mir_truck
roof_rack roof_lightbar roof_solar roof_spikes arm_plates arm_planks""".split()

TURBO = {'eng_i4', 'eng_i4d', 'eng_flat6', 'eng_v8', 'eng_d6'}
STRETCH_PREFIX = ('bf_', 'br_', 'roof_', 'arm_')


def budget(pid):
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
    for f, pid in zip(files, ids):
        tris, errs, warns, movers, empties = check(os.path.join(folder, f), pid)
        n_err += len(errs)
        flag = 'ERR ' if errs else ('warn' if warns else 'ok  ')
        extra = ' '.join(movers + empties)
        lines.append(f'{flag} {pid:28s} {tris:6d}  {extra}  {"; ".join(errs + warns)}')
    missing = [p for p in CATALOGUE if p not in ids]
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
    summary = f'VERIFY {len(files)} files, {len(CATALOGUE) - len(missing)}/{len(CATALOGUE)} catalogue parts, {n_err} errors'
    print(summary)
    os.makedirs('D:/modcar-scratch/parts', exist_ok=True)
    with open('D:/modcar-scratch/parts/verify.txt', 'w', encoding='utf-8') as fh:
        fh.write(out + '\n' + summary + '\n')
    if n_err:
        sys.exit(1)
