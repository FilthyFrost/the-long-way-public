"""
Make the workshop's GLB smaller without changing what is drawn (pure Python, no Blender needed):

    python tools/blender/garage/glb_pack.py public/models/modcar/garage/garage.glb

- normals as normalized bytes (KHR_mesh_quantization, which three's GLTFLoader reads), 4 bytes a
  vertex instead of 12;
- the corner colour (tint and AO) as normalized 16-bit integers, 8 bytes instead of 16;
- the shadow caster (S_shadow, only ever drawn into the shadow maps) keeps its positions alone.

Every accessor gets a bufferView of its own in the rewritten binary chunk.
"""

import json
import struct
import sys

FLOAT = 5126
BYTE = 5120
UNSIGNED_SHORT = 5123
COMPS = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4, 'MAT4': 16}
SIZE = {5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4}
FMT = {5120: 'b', 5121: 'B', 5122: 'h', 5123: 'H', 5125: 'I', 5126: 'f'}


def read_glb(path):
    data = open(path, 'rb').read()
    magic, version, length = struct.unpack_from('<III', data, 0)
    assert magic == 0x46546C67 and version == 2, 'not a GLB 2.0'
    off = 12
    js = None
    bin_ = b''
    while off < length:
        clen, ctype = struct.unpack_from('<II', data, off)
        chunk = data[off + 8:off + 8 + clen]
        if ctype == 0x4E4F534A:
            js = json.loads(chunk.decode('utf-8'))
        elif ctype == 0x004E4942:
            bin_ = chunk
        off += 8 + clen
    return js, bin_


def write_glb(path, js, bin_):
    j = json.dumps(js, separators=(',', ':')).encode('utf-8')
    j += b' ' * ((4 - len(j) % 4) % 4)
    b = bin_ + b'\0' * ((4 - len(bin_) % 4) % 4)
    total = 12 + 8 + len(j) + 8 + len(b)
    with open(path, 'wb') as f:
        f.write(struct.pack('<III', 0x46546C67, 2, total))
        f.write(struct.pack('<II', len(j), 0x4E4F534A))
        f.write(j)
        f.write(struct.pack('<II', len(b), 0x004E4942))
        f.write(b)


def accessor_values(js, bin_, i):
    """the accessor's elements as a flat list of numbers (and its component count)"""
    a = js['accessors'][i]
    bv = js['bufferViews'][a['bufferView']]
    n = COMPS[a['type']]
    ct = a['componentType']
    esize = SIZE[ct] * n
    stride = bv.get('byteStride', esize)
    base = bv.get('byteOffset', 0) + a.get('byteOffset', 0)
    fmt = '<' + FMT[ct] * n
    out = []
    for k in range(a['count']):
        out.extend(struct.unpack_from(fmt, bin_, base + k * stride))
    return out, n


def pack(path):
    js, bin_ = read_glb(path)
    before = len(bin_)
    # which accessors to convert, and which to drop
    normals = set()
    colours = set()
    used = set()
    for mesh in js.get('meshes', []):
        caster = mesh.get('name', '') == 'S_shadow'
        for prim in mesh['primitives']:
            attrs = prim['attributes']
            if caster:
                for k in [k for k in attrs if k != 'POSITION']:
                    del attrs[k]
            if 'NORMAL' in attrs and js['accessors'][attrs['NORMAL']]['componentType'] == FLOAT:
                normals.add(attrs['NORMAL'])
            if 'COLOR_0' in attrs and js['accessors'][attrs['COLOR_0']]['componentType'] == FLOAT:
                colours.add(attrs['COLOR_0'])
            used.update(attrs.values())
            if 'indices' in prim:
                used.add(prim['indices'])
    for node_skin in js.get('skins', []):
        if 'inverseBindMatrices' in node_skin:
            used.add(node_skin['inverseBindMatrices'])
    for anim in js.get('animations', []):
        for s in anim['samplers']:
            used.add(s['input'])
            used.add(s['output'])
    # rebuild the binary chunk: one bufferView per accessor still used
    out = bytearray()
    views = []
    remap = {}
    accessors = []
    for i, a in enumerate(js['accessors']):
        if i not in used:
            continue
        a = dict(a)
        if i in normals:
            vals, n = accessor_values(js, bin_, i)
            # three bytes a normal, padded to four (vertex attributes keep 4-byte strides)
            buf = bytearray()
            for k in range(a['count']):
                x, y, z = vals[k * 3:k * 3 + 3]
                buf += struct.pack('<bbbb', *(max(-127, min(127, round(c * 127))) for c in (x, y, z)), 0)
            a['componentType'] = BYTE
            a['normalized'] = True
            a.pop('min', None)
            a.pop('max', None)
            data, stride = bytes(buf), 4
        elif i in colours:
            vals, n = accessor_values(js, bin_, i)
            data = struct.pack('<' + 'H' * len(vals), *(max(0, min(65535, round(c * 65535))) for c in vals))
            a['componentType'] = UNSIGNED_SHORT
            a['normalized'] = True
            a.pop('min', None)
            a.pop('max', None)
            stride = None
        else:
            bv = js['bufferViews'][a['bufferView']]
            n = COMPS[a['type']]
            esize = SIZE[a['componentType']] * n
            st = bv.get('byteStride', esize)
            base = bv.get('byteOffset', 0) + a.get('byteOffset', 0)
            if st == esize:
                data = bin_[base:base + esize * a['count']]
            else:
                data = b''.join(bin_[base + k * st:base + k * st + esize] for k in range(a['count']))
            # (copied tightly packed: no stride needed)
            stride = None
        while len(out) % 4:
            out.append(0)
        view = {'buffer': 0, 'byteOffset': len(out), 'byteLength': len(data)}
        if stride:
            view['byteStride'] = stride
        old_view = js['bufferViews'][js['accessors'][i]['bufferView']]
        if 'target' in old_view:
            view['target'] = old_view['target']
        out += data
        a['bufferView'] = len(views)
        a.pop('byteOffset', None)
        views.append(view)
        remap[i] = len(accessors)
        accessors.append(a)
    js['accessors'] = accessors
    js['bufferViews'] = views
    js['buffers'] = [{'byteLength': len(out)}]
    for mesh in js.get('meshes', []):
        for prim in mesh['primitives']:
            prim['attributes'] = {k: remap[v] for k, v in prim['attributes'].items()}
            if 'indices' in prim:
                prim['indices'] = remap[prim['indices']]
    for anim in js.get('animations', []):
        for s in anim['samplers']:
            s['input'] = remap[s['input']]
            s['output'] = remap[s['output']]
    for ext in ('extensionsUsed', 'extensionsRequired'):
        lst = js.setdefault(ext, [])
        if 'KHR_mesh_quantization' not in lst:
            lst.append('KHR_mesh_quantization')
    write_glb(path, js, bytes(out))
    print(f'GARAGE packed {path}: {before / 1e6:.1f} MB -> {len(out) / 1e6:.1f} MB of binary')


if __name__ == '__main__':
    for p in sys.argv[1:]:
        pack(p)
