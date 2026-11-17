"""
Check the building kit's GLBs (public/models/modcar/places/kit/<piece>.glb) against the table in
tools/blender/places/kit.py (SPECS), run in Blender like every ModCar check:

    blender -b --factory-startup --python tools/blender/build.py -- places/kit_verify [<piece>...]

Each GLB is read as the game reads it (its JSON and binary chunks), and checked for:
  * the file; one root node, the mesh PART, with no transform of its own and no children
  * its bounds in the kit frame (X along the wall, Y through it, outside -Y, Z up; glTF (x, y, z) =
    kit (x, z, -y)) within 2 % of each axis's size of the table's lo / hi, which pins the origin too: the
    bottom centre (Y = 0 on the wall's middle plane for the wall's pieces), the hinge edge X = 0 for the doors
    and the shutter. For the doors the bounds are the leaf's (its materials; handles, bars and straps stand
    off it in Y, never beyond it in X or Z); pictograms lie inside their 0.5 square, centred, their larger
    side spanning it
  * only conventional material names (src/game/render/carMaterials.ts)
  * the AO: COLOR_0 on every primitive, grey values within 0..1
  * the triangle budget: 1500 a piece (stretched or not), doors 2500, the chimney 2000, pictograms 600
  * no closed island turned inside out
  * the repeating modules tile: along each axis the table says, every vertex on the module's low end has its
    twin on the high end one module on (position within 0.5 mm, normal within 8 degrees, AO within 0.08), and
    the other way round; the end caps (faces turned along the axis, hidden against the next module) are left
    out
Prints the table (also into D:/modcar-scratch/kit/verify.txt) and exits non-zero on errors.
"""
import json
import math
import os
import struct
import sys

import numpy as np

from places import kit as KIT

COMP = {5120: (np.int8, 127.0), 5121: (np.uint8, 255.0), 5122: (np.int16, 32767.0), 5123: (np.uint16, 65535.0),
        5125: (np.uint32, 4294967295.0), 5126: (np.float32, 1.0)}
NCOMP = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4, 'MAT4': 16}


def read_glb(path):
    with open(path, 'rb') as f:
        data = f.read()
    magic, _version, length = struct.unpack_from('<III', data, 0)
    if magic != 0x46546C67:
        raise ValueError('not a GLB')
    off, js, binc = 12, None, b''
    while off < length:
        clen, ctype = struct.unpack_from('<II', data, off)
        off += 8
        chunk = data[off:off + clen]
        off += clen
        if ctype == 0x4E4F534A:
            js = json.loads(chunk.decode('utf-8'))
        elif ctype == 0x004E4942:
            binc = chunk
    return js, binc


def accessor(js, binc, i):
    a = js['accessors'][i]
    bv = js['bufferViews'][a['bufferView']]
    dt, norm = COMP[a['componentType']]
    n = NCOMP[a['type']]
    item = np.dtype(dt).itemsize
    stride = bv.get('byteStride', item * n)
    off = bv.get('byteOffset', 0) + a.get('byteOffset', 0)
    count = a['count']
    if stride == item * n:
        out = np.frombuffer(binc, dtype=dt, count=count * n, offset=off).reshape(count, n).astype(np.float64)
    else:
        out = np.array([np.frombuffer(binc, dtype=dt, count=n, offset=off + k * stride) for k in range(count)],
                       dtype=np.float64)
    if a.get('normalized'):
        out /= norm
    return out


def kit_frame(v):
    """glTF (x, y, z) -> the kit's (X, Y, Z) = (x, -z, y)"""
    return np.stack([v[:, 0], -v[:, 2], v[:, 1]], axis=1)


def load(path):
    """The PART mesh's primitives: [(material name, positions, normals, ao, triangles)] in the kit frame."""
    js, binc = read_glb(path)
    scene = js['scenes'][js.get('scene', 0)]
    roots = scene['nodes']
    info = {'roots': [js['nodes'][r].get('name', '?') for r in roots], 'errors': []}
    if len(roots) != 1:
        info['errors'].append(f'{len(roots)} root nodes')
    node = js['nodes'][roots[0]]
    if node.get('name') != 'PART' or 'mesh' not in node:
        info['errors'].append(f'root is {node.get("name")!r}, not the mesh PART')
    if node.get('children'):
        info['errors'].append('PART has children')
    if 'matrix' in node or any(abs(x) > 1e-6 for x in node.get('translation', [0, 0, 0])) or \
            any(abs(x - y) > 1e-6 for x, y in zip(node.get('rotation', [0, 0, 0, 1]), [0, 0, 0, 1])) or \
            any(abs(x - 1) > 1e-6 for x in node.get('scale', [1, 1, 1])):
        info['errors'].append('PART has a transform of its own')
    prims = []
    for p in js['meshes'][node['mesh']]['primitives']:
        at = p['attributes']
        pos = kit_frame(accessor(js, binc, at['POSITION']))
        nrm = kit_frame(accessor(js, binc, at['NORMAL'])) if 'NORMAL' in at else None
        ao = None
        if 'COLOR_0' in at:
            a = js['accessors'][at['COLOR_0']]
            col = accessor(js, binc, at['COLOR_0'])
            if a['componentType'] != 5126 and not a.get('normalized'):
                col /= COMP[a['componentType']][1]
            ao = col[:, 0]
        idx = accessor(js, binc, p['indices']).astype(np.int64).reshape(-1, 3) if 'indices' in p else \
            np.arange(len(pos)).reshape(-1, 3)
        mat = js['materials'][p['material']]['name'] if 'material' in p else '(none)'
        prims.append((mat, pos, nrm, ao, idx, p.get('mode', 4)))
    return prims, info


def inside_out(prims):
    """closed islands (welded by position) whose signed volume is negative"""
    pts, tris = [], []
    for (_m, pos, _n, _a, idx, _mode) in prims:
        base = len(pts)
        pts.extend(map(tuple, np.round(pos, 5)))
        tris.extend((base + a, base + b, base + c) for (a, b, c) in idx)
    weld = {}
    wid = [weld.setdefault(p, len(weld)) for p in pts]
    P = np.array(list(weld.keys()))
    T = [(wid[a], wid[b], wid[c]) for (a, b, c) in tris]
    edges = {}
    for t, (a, b, c) in enumerate(T):
        for e in ((a, b), (b, c), (c, a)):
            edges.setdefault(tuple(sorted(e)), []).append(t)
    parent = list(range(len(T)))

    def find(x):
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x
    for ts in edges.values():
        for t in ts[1:]:
            ra, rb = find(ts[0]), find(t)
            if ra != rb:
                parent[ra] = rb
    islands = {}
    for t in range(len(T)):
        islands.setdefault(find(t), []).append(t)
    bad = 0
    for ts in islands.values():
        es = {}
        for t in ts:
            a, b, c = T[t]
            for e in ((a, b), (b, c), (c, a)):
                k = tuple(sorted(e))
                es[k] = es.get(k, 0) + 1
        if any(v != 2 for v in es.values()):
            continue
        vol = 0.0
        for t in ts:
            a, b, c = (P[i] for i in T[t])
            vol += np.dot(a, np.cross(b, c)) / 6.0
        if vol < -1e-9:
            bad += 1
    return bad


def tiling(prims, axis, lo, hi):
    """the vertices on the low end of `axis` against those on the high end, one module on"""
    span = hi[axis] - lo[axis]
    pos = np.concatenate([p[1] for p in prims])
    nrm = np.concatenate([p[2] for p in prims])
    ao = np.concatenate([p[3] if p[3] is not None else np.ones(len(p[1])) for p in prims])
    amin, amax = pos[:, axis].min(), pos[:, axis].max()
    side = np.abs(nrm[:, axis]) < 0.7          # leave out the end caps
    low = np.where((np.abs(pos[:, axis] - amin) < 1e-4) & side)[0]
    high = np.where((np.abs(pos[:, axis] - amax) < 1e-4) & side)[0]
    errs = []
    if abs((amax - amin) - span) > 1e-3:
        errs.append(f'tile {"XYZ"[axis]}: module {amax - amin:.4f} m, not {span:.4f}')
    if len(low) == 0 or len(high) == 0:
        errs.append(f'tile {"XYZ"[axis]}: nothing on its ends')
        return errs
    other = [k for k in range(3) if k != axis]

    def match(src, dst, shift):
        worst = 0
        for i in src:
            p = pos[i].copy()
            p[axis] += shift
            d = np.linalg.norm(pos[dst][:, other] - p[other], axis=1)
            cand = dst[d < 5e-4]
            if len(cand) == 0:
                return f'a vertex at {np.round(pos[i], 4).tolist()} has no twin on the other end'
            dots = nrm[cand] @ nrm[i]
            j = cand[int(np.argmax(dots))]
            if math.degrees(math.acos(max(-1.0, min(1.0, float(dots.max()))))) > 8.0:
                return f'normals differ at {np.round(pos[i], 4).tolist()}'
            worst = max(worst, abs(ao[i] - ao[j]))
        if worst > 0.08:
            return f'AO differs by {worst:.2f} across the seam'
        return None
    for (src, dst, shift) in ((low, high, span), (high, low, -span)):
        e = match(src, dst, shift)
        if e:
            errs.append(f'tile {"XYZ"[axis]}: {e}')
            break
    return errs


def check(name, spec):
    path = os.path.join(KIT.OUT, f'{name}.glb')
    if not os.path.exists(path):
        return 0, 0.0, ['missing file'], []
    kb = os.path.getsize(path) / 1024.0
    prims, info = load(path)
    errs = list(info['errors'])
    warns = []
    tris = sum(len(p[4]) for p in prims)
    for (mat, pos, nrm, ao, idx, mode) in prims:
        base = mat.split('.')[0]
        if base not in KIT.MATERIALS:
            errs.append(f'material {mat!r} is not conventional')
        if mode != 4:
            errs.append(f'primitive mode {mode}')
        if ao is None:
            errs.append(f'{mat}: no AO (COLOR_0)')
        elif ao.min() < -1e-3 or ao.max() > 1.0 + 1e-3:
            errs.append(f'{mat}: AO out of 0..1')
        if nrm is None:
            errs.append(f'{mat}: no normals')
    budget = spec.get('budget', 1500)
    if tris > budget:
        errs.append(f'{tris} tris > {budget}')
    lo_e, hi_e = np.array(spec['lo'], float), np.array(spec['hi'], float)
    size = hi_e - lo_e
    tol = np.maximum(0.02 * size, 1e-4)
    allpos = np.concatenate([p[1] for p in prims])
    lo_a, hi_a = allpos.min(axis=0), allpos.max(axis=0)
    if spec.get('leaf'):
        leaf = [p for p in prims if p[0].split('.')[0] in spec['leaf']]
        lp = np.concatenate([p[1] for p in leaf])
        lo_l, hi_l = lp.min(axis=0), lp.max(axis=0)
        for k in range(3):
            if abs(lo_l[k] - lo_e[k]) > tol[k] or abs(hi_l[k] - hi_e[k]) > tol[k]:
                errs.append(f'leaf {"XYZ"[k]} {lo_l[k]:.3f}..{hi_l[k]:.3f}, not {lo_e[k]:.3f}..{hi_e[k]:.3f}')
        for k in (0, 2):
            if lo_a[k] < lo_e[k] - tol[k] or hi_a[k] > hi_e[k] + tol[k]:
                errs.append(f'{"XYZ"[k]} {lo_a[k]:.3f}..{hi_a[k]:.3f} reaches beyond the leaf')
        if hi_a[1] - lo_a[1] > 0.2:
            errs.append(f'handles stand {hi_a[1] - lo_a[1]:.3f} m deep')
    elif spec.get('fit'):
        for k in range(3):
            if lo_a[k] < lo_e[k] - tol[k] or hi_a[k] > hi_e[k] + tol[k]:
                errs.append(f'{"XYZ"[k]} {lo_a[k]:.3f}..{hi_a[k]:.3f} outside {lo_e[k]:.3f}..{hi_e[k]:.3f}')
        if abs((hi_a[1] - lo_a[1]) - size[1]) > tol[1]:
            errs.append(f'thickness {hi_a[1] - lo_a[1]:.4f}, not {size[1]:.3f}')
        if max(hi_a[0] - lo_a[0], hi_a[2] - lo_a[2]) < 0.98 * size[0]:
            errs.append('does not span its square')
        if abs((lo_a[0] + hi_a[0]) / 2) > 0.005 or abs((lo_a[2] + hi_a[2]) / 2 - 0.25) > 0.005:
            errs.append('not centred in its square')
    else:
        for k in range(3):
            if abs(lo_a[k] - lo_e[k]) > tol[k] or abs(hi_a[k] - hi_e[k]) > tol[k]:
                errs.append(f'{"XYZ"[k]} {lo_a[k]:.3f}..{hi_a[k]:.3f}, not {lo_e[k]:.3f}..{hi_e[k]:.3f}')
    bad = inside_out(prims)
    if bad:
        errs.append(f'{bad} closed island(s) inside out')
    for ax in spec.get('tile', ''):
        errs += tiling(prims, 'XYZ'.index(ax), lo_e, hi_e)
    extra = [f'{"x".join(f"{s:.2f}" for s in size)}', f'S {spec.get("stretch", "-")}', f'R {spec.get("tile", "-")}']
    return tris, kb, errs, extra


def main(args):
    names = [a for a in args if not a.startswith('--')] or list(KIT.SPECS)
    lines = []
    n_err = 0
    extra_files = sorted(f[:-4] for f in os.listdir(KIT.OUT) if f.endswith('.glb') and f[:-4] not in KIT.SPECS) \
        if os.path.isdir(KIT.OUT) else []
    for name in names:
        tris, kb, errs, extra = check(name, KIT.SPECS[name])
        n_err += len(errs)
        flag = 'ERR ' if errs else 'ok  '
        lines.append(f'{flag} {name:16s} {tris:5d} tris {kb:6.1f} KB  {"  ".join(extra)}'
                     + (f'  | {"; ".join(errs)}' if errs else ''))
    for f in extra_files:
        lines.append(f'warn {f:16s} not in the kit table')
    out = '\n'.join(lines)
    print(out)
    summary = f'VERIFY {len(names)} kit pieces, {n_err} errors'
    print(summary)
    os.makedirs(KIT.SCRATCH, exist_ok=True)
    with open(os.path.join(KIT.SCRATCH, 'verify.txt'), 'w', encoding='utf-8') as fh:
        fh.write(out + '\n' + summary + '\n')
    if n_err:
        sys.exit(1)
