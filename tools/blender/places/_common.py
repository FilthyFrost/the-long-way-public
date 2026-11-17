"""
What the place models share (tools/blender/places/furniture.py, outside.py): the table of models with what the
game needs to know of each (its size at the places, the moving children and the markers), the finishing that
bakes the AO, the previews, and a few builders (panelled doors, handles, bottles, tyres...).

Conventions (the machines' and the items'): one GLB per model at public/models/modcar/places/<id>.glb, the root
mesh PART, its origin at the bottom centre of the footprint, standing on z = 0; the front (the side one stands
at: the doors, the drawers, the till, the pump's display) towards +X, the width (sites.ts w, the long side)
along Y, the depth (d) along X, the height (h) along Z. Conventional material names only; `paint` / `paint_b`
take the object's two colours chosen in the game. AO in the vertex colour 'Col', baked for PART and for every
moving child on its own (a door's inside is not darkened by the carcass it shuts against).

Moving children (origin on their pivot, no rotation), with glTF extras telling how they move. The extras are in
the GAME frame, as the GLB holds it (x forward, y up, z = -Blender Y; a positive angle turns about +axis by the
right-hand rule): move = 'hinge' | 'slide' | 'lift' | 'free', axis, open (degrees, or metres), hinge (the side):
    DOOR_L      hinged at its outer edge on Blender +Y (the thing's own left, as a car's; game -z), the pivot on
                the front face; opens by open = +105 about game y (Blender Z)
    DOOR_R      the same on Blender -Y (game +z); open = -105 about game y
    DOOR        a single door (the fridge's): hinged on game +z (Blender -Y), open = -105 about game y
    DRAWER_n    slides out along +x by open metres; the origin on its front face
    LID         hinged along its back (-x) edge, the pivot on that edge at the lid's underside; open = +95..+110
                about game z (Blender -Y): its front edge comes up
    LID (lift)  a loose lid (move='lift'): it comes off upwards (+y) by open metres
    NOZZLE      the pump's nozzle, its origin where it hangs on its hook; HOSE the hose as it hangs (move='free')
Markers (empties): M_inside the middle of the floor of the space inside (on a drawer's floor it is that
DRAWER's child), M_top where things lie on top, M_display, M_nozzle, M_hose, M_board, M_lamp_n...
"""
import math
import os

import bmesh
import bpy
from mathutils import Matrix, Vector

from parts import _kit as K
from parts._kit import V, mat4

OUT = 'public/models/modcar/places'
SCRATCH = 'D:/modcar-scratch/places'
K.SCRATCH = SCRATCH          # (the kit's previews go to the places' own scratch folder)
os.makedirs(SCRATCH, exist_ok=True)
TAU = math.tau

# triangle budgets: (fewest, most) per class
BUDGET = {'small': (400, 2500), 'furniture': (1500, 5000), 'big': (1500, 9000)}

# every model of every group: id -> its spec (see spec())
SPECS = {}


def spec(fn, size, cls='furniture', movers=None, markers=(), bounds=None, colours=(0x9a5a44, 0xe6dccb), args=(),
         ao=0.1, front=True, note='', group='', centre=(0.0, 0.0), z0=0.0, fit=False):
    """
    One model: fn(P, *args) builds it. size = (w, d, h) as the places use it (sites.ts put(..., w, d, h)): w along
    Y, d along X, h along Z. bounds = the real extents when something of it reaches outside that box on purpose (a
    bed's headboard, a bench's back, chairs at a table), else = size. movers = {name: extras} (see the module's
    doc), markers = the empties it must have, colours = paint / paint_b for the --look previews, ao = the AO
    distance (m), front = it has a front (+X) that the movers and markers sit on, centre = where the middle of
    its bounds is (x, y) when they reach out on one side only, z0 = where its lowest point is (a jetty's posts go
    down below the deck it stands on; bounds h then counts from z0), fit = scale it a little (per axis) and centre
    it so that its bounds are exactly its size (organic things: stones, a bag, a boat).
    """
    return dict(fn=fn, size=tuple(size), cls=cls, movers=dict(movers or {}), markers=tuple(markers),
                bounds=tuple(bounds) if bounds else tuple(size), colours=colours, args=tuple(args), ao=ao,
                front=front, note=note, group=group, centre=tuple(centre), z0=float(z0), fit=fit)


def door_l(open=105.0):
    """(game frame: a door hinged on game -z, i.e. Blender +Y, swings out by +open about game y)"""
    return dict(move='hinge', axis='y', open=float(open), hinge='-z')


def door_r(open=105.0):
    return dict(move='hinge', axis='y', open=-float(open), hinge='+z')


def drawer(open=0.3):
    return dict(move='slide', axis='x', open=float(open))


def lid(open=100.0):
    """(game frame: about +z, i.e. Blender -Y, a positive angle lifts the front edge of a lid hinged at the back)"""
    return dict(move='hinge', axis='z', open=float(open))


def lift(open=0.25):
    return dict(move='lift', axis='y', open=float(open))


def free():
    return dict(move='free')


def table(group, specs):
    """Register a group's specs and return the kit's table of builders."""
    out = {}
    for pid, sp in specs.items():
        sp['group'] = group
        SPECS[pid] = sp
        out[pid] = _builder(pid, sp)
    return out


# ------------------------------------------------------------------------------------------------ finishing

def _builder(pid, sp):
    def build(P):
        user_noao = bool(P.opts.get('no_ao'))
        P.opts['no_ao'] = True             # (we bake ourselves: PART and every mover on its own)
        P.ao_distance = sp['ao']
        P.ao_samples = 32
        P.ride = []
        res = sp['fn'](P, *sp['args'])
        if res is not None:
            return res
        if sp['fit']:
            fit(P, sp)
        ground(P, sp['z0'])
        _hook(P, sp, user_noao)
        return None
    build.__doc__ = sp['fn'].__doc__
    return build


def ground(P, base=0.0):
    """Set the whole model down so that its lowest point is on z = base (statics, movers, pivots and markers)."""
    zs = [v.co.z for o in P.statics for v in o.data.vertices]
    for (_, objs, _) in P.movers:
        zs += [v.co.z for o in objs for v in o.data.vertices]
    z0 = min(zs) - base
    if abs(z0) > 0.004:
        print(f'  NOTE {P.id}: lowest point at z {z0:.4f}, set down to 0')
    if abs(z0) < 1e-7:
        return
    m = Matrix.Translation((0, 0, -z0))
    for o in P.statics:
        o.data.transform(m)
        for c in P.cfg[o.name]['cutters']:
            c.data.transform(m)
    for i, (name, objs, piv) in enumerate(P.movers):
        for o in objs:
            o.data.transform(m)
            for c in P.cfg[o.name]['cutters']:
                c.data.transform(m)
        P.movers[i] = (name, objs, piv + V((0, 0, -z0)))
    for e in P.empties:
        e.location.z -= z0


def _all_points(P):
    pts = [v.co.copy() for o in P.statics for v in o.data.vertices]
    for (_, objs, _) in P.movers:
        pts += [v.co.copy() for o in objs for v in o.data.vertices]
    return pts


def _transform_all(P, m):
    for o in P.statics:
        o.data.transform(m)
        for c in P.cfg[o.name]['cutters']:
            c.data.transform(m)
    for i, (name, objs, piv) in enumerate(P.movers):
        for o in objs:
            o.data.transform(m)
            for c in P.cfg[o.name]['cutters']:
                c.data.transform(m)
        P.movers[i] = (name, objs, m @ V(piv))
    for e in P.empties:
        e.location = m @ V(e.location)


def fit(P, sp):
    """Scale the model per axis about the middle of its footprint and move it so that its bounds are its spec's
    bounds exactly (a few per cent: stones, cloth, a boat are not built to the millimetre)."""
    pts = _all_points(P)
    lo = V((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
    hi = V((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
    w, d, h = sp['bounds']
    k = V((d / (hi.x - lo.x), w / (hi.y - lo.y), h / (hi.z - lo.z)))
    if any(abs(x - 1.0) > 0.15 for x in k):
        print(f'  NOTE {P.id}: fit scales it by {tuple(round(x, 3) for x in k)}')
    c = V(((lo.x + hi.x) / 2, (lo.y + hi.y) / 2, lo.z))
    cx, cy = sp['centre']
    m = Matrix.Translation((cx, cy, sp['z0'])) @ Matrix.Diagonal((k.x, k.y, k.z, 1.0)) @ Matrix.Translation(-c)
    _transform_all(P, m)


def _hook(P, sp, noao):
    """After the kit's finish: markers onto their movers, the movers' extras, the size, the AO."""
    fin = P.finish

    def finish():
        root = fin()
        movers = {o.name: o for o in P.mover_objs}
        for name in sp['movers']:
            if name not in movers:
                raise RuntimeError(f'{P.id}: mover {name} was not built')
        for name, o in movers.items():
            meta = sp['movers'].get(name)
            if meta is None:
                raise RuntimeError(f'{P.id}: mover {name} is not in its spec')
            for k, v in meta.items():
                o[k] = v
        for e, mname in P.ride:
            m = movers[mname]
            e.parent = m
            e.location = e.location - m.location
        root['size'] = [float(x) for x in sp['size']]
        if not noao:
            K.bake_ao_bvh([root], distance=P.ao_distance, samples=P.ao_samples)
            for o in P.mover_objs:
                K.bake_ao_bvh([o], distance=P.ao_distance, samples=P.ao_samples)
        return root

    P.finish = finish


def ride(P, empty, mover):
    """Make the marker `empty` a child of the mover (it moves with the drawer it is in)."""
    P.ride.append((empty, mover))
    return empty


def marker(P, name, loc, up=(0, 0, 1), mover=None):
    """A marker at loc whose local +Z points along `up`."""
    q = V((0, 0, 1)).rotation_difference(V(up).normalized())
    e = P.empty(name, loc=tuple(loc), rot=[math.degrees(a) for a in q.to_euler('XYZ')])
    if mover:
        ride(P, e, mover)
    return e


# ------------------------------------------------------------------------------------------------ previews

def _lin(h):
    c = (((h >> 16) & 255) / 255, ((h >> 8) & 255) / 255, (h & 255) / 255)
    return tuple(x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c)


# a game axis as the Blender axis and the sign an angle / a move along it takes there
GAME_AXIS = {'x': (0, 1.0), 'y': (2, 1.0), 'z': (1, -1.0)}


def open_movers(P, k=1.0):
    """Swing / slide every mover by k times its `open` (for the previews; the extras are in the game frame)."""
    for o in P.mover_objs:
        mv, ax, a = o.get('move'), o.get('axis'), float(o.get('open', 0.0)) * k
        if mv not in ('hinge', 'slide', 'lift'):
            continue
        i, sg = GAME_AXIS[ax]
        if mv == 'hinge':
            r = [0.0, 0.0, 0.0]
            r[i] = math.radians(a) * sg
            o.rotation_euler = r
        else:
            o.location[i] += a * sg
    bpy.context.view_layer.update()


def after(P, opts):
    """
    Previews after the kit's (--toon renders the first view small): --look[=yaw,pitch/...] bigger cel previews in
    the model's own colours (SCRATCH/<id>_look_<k>.png), from its views or the ones given; --open the same with
    every mover opened (<id>_open_<k>.png); --cull culls back faces as the game does (a face the wrong way is a hole).
    """
    if opts.get('norender'):
        return
    spec_ = SPECS.get(P.id, {})
    look, opn = opts.get('look'), opts.get('open')
    if not look and not opn:
        return
    if look and look is not True:
        views = []
        for i, s in enumerate(str(look).split('/')):
            yaw, pitch = (float(t) for t in s.split(','))
            views.append((f'{i + 1}', yaw, pitch))
    else:
        views = [(f'{i + 1}', yaw, pitch) for i, (_, yaw, pitch) in
                 enumerate(getattr(P, 'views', None) or [('a', 35, 20), ('b', 215, 20)])]
    names = K.mc.MAT_NAMES
    saved = {k: names[k] for k in ('paint', 'paint_b')}
    for key, h in zip(('paint', 'paint_b'), spec_.get('colours', ())):
        names[key] = (_lin(h), saved[key][1], saved[key][2])
    try:
        if opts.get('cull'):
            for m in bpy.data.materials:
                m.use_backface_culling = True
        if look:
            K.render_toon(P, views=views, size=(800, 640), suffix='_look')
        if opn and P.mover_objs:
            open_movers(P, 1.0)
            K.render_toon(P, views=views[:1], size=(800, 640), suffix='_open')
            open_movers(P, -1.0)
    finally:
        names.update(saved)


_toon_materials = K._toon_materials


def _toon_glass():
    """The kit's cel preview materials, the glass made see-through (the toon previews draw it opaque otherwise)."""
    _toon_materials()
    for m in bpy.data.materials:
        base = m.name.split('.')[0]
        if base not in ('glass', 'glass_dark') or not m.node_tree:
            continue
        nt = m.node_tree
        out = next(n for n in nt.nodes if n.type == 'OUTPUT_MATERIAL')
        if not out.inputs['Surface'].links:
            continue
        src = out.inputs['Surface'].links[0].from_node
        tr = nt.nodes.new('ShaderNodeBsdfTransparent')
        mix = nt.nodes.new('ShaderNodeMixShader')
        mix.inputs['Fac'].default_value = 0.12 if base == 'glass' else 0.5
        nt.links.new(tr.outputs[0], mix.inputs[1])
        nt.links.new(src.outputs[0], mix.inputs[2])
        nt.links.new(mix.outputs[0], out.inputs['Surface'])
        try:
            m.surface_render_method = 'BLENDED'
        except Exception:
            pass


K._toon_materials = _toon_glass


def run(models, args):
    K.run(models, args, after=after, out_dir=OUT, geo=False)


# ------------------------------------------------------------------------------------------------ small helpers

def ccw(poly):
    """A 2D polygon counter-clockwise (reversed if its signed area is negative)."""
    a = sum(p[0] * q[1] - q[0] * p[1] for p, q in zip(poly, poly[1:] + poly[:1]))
    return list(poly) if a >= 0 else list(poly)[::-1]


def hull2d(pts):
    """Convex hull of 2D points, counter-clockwise."""
    pts = sorted(set((round(x, 6), round(y, 6)) for (x, y) in pts))

    def cross(o, a, b):
        return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])

    lo, hi = [], []
    for p in pts:
        while len(lo) >= 2 and cross(lo[-2], lo[-1], p) <= 0:
            lo.pop()
        lo.append(p)
    for p in reversed(pts):
        while len(hi) >= 2 and cross(hi[-2], hi[-1], p) <= 0:
            hi.pop()
        hi.append(p)
    return lo[:-1] + hi[:-1]


def offset_poly2(pts, d):
    """Push a convex CCW polygon out by d."""
    n = len(pts)
    out = []
    for i in range(n):
        a, b, c = V((*pts[i - 1], 0)), V((*pts[i], 0)), V((*pts[(i + 1) % n], 0))
        e1, e2 = (b - a).normalized(), (c - b).normalized()
        n1, n2 = V((e1.y, -e1.x, 0)), V((e2.y, -e2.x, 0))
        m = (n1 + n2).normalized()
        k = d / max(0.3, m.dot(n1))
        out.append((b.x + m.x * k, b.y + m.y * k))
    return out


def inside2d(poly, pt, margin=0.0):
    """Is pt inside the convex CCW polygon (grown by margin)?"""
    for p, q in zip(poly, poly[1:] + poly[:1]):
        ex, ey = q[0] - p[0], q[1] - p[1]
        ln = math.hypot(ex, ey) or 1.0
        if (ex * (pt[1] - p[1]) - ey * (pt[0] - p[0])) / ln < -margin:
            return False
    return True


def front_prism(P, name, poly_yz, x0, depth, material, bev=None, segs=1, **kw):
    """A flat plate standing on the plane X = x0 and facing +X (its front at x0 + depth): poly_yz its outline as
    (y, z) seen from the front."""
    poly_yz = ccw(poly_yz)
    poly = [(-z, y) for (y, z) in poly_yz]
    return P.prism(name, poly, depth, material=material, matrix=mat4((x0, 0, 0), (0, 90, 0)), center=False, bev=bev,
                   segs=segs, **kw)


def outward(bm):
    """Turn every closed island of bm whose faces point inwards (negative volume) the right way out."""
    seen = set()
    for f0 in bm.faces:
        if f0 in seen:
            continue
        island, stack = [], [f0]
        seen.add(f0)
        while stack:
            f = stack.pop()
            island.append(f)
            for e in f.edges:
                for g in e.link_faces:
                    if g not in seen:
                        seen.add(g)
                        stack.append(g)
        vol = 0.0
        for f in island:
            vs = [v.co for v in f.verts]
            for i in range(1, len(vs) - 1):
                vol += vs[0].dot(vs[i].cross(vs[i + 1])) / 6.0
        if vol < 0.0:
            bmesh.ops.reverse_faces(bm, faces=island)
    return bm


def mark(P):
    """The number of statics so far: pass it to xform() to move everything built after it."""
    return len(P.statics)


def xform(P, since, m):
    """Apply the matrix m to every static (and its boolean cutters) registered since mark() returned `since`."""
    for o in P.statics[since:]:
        o.data.transform(m)
        for c in P.cfg[o.name]['cutters']:
            c.data.transform(m)


def turned(loc, yaw):
    """The matrix that turns things built round the origin by yaw degrees about Z and puts them at loc."""
    return Matrix.Translation(V(loc)) @ Matrix.Rotation(math.radians(yaw), 4, 'Z')


def jit(k, a=0.0):
    """A fixed pseudo-random number in [-0.5, 0.5) (the same on every run)."""
    v = math.sin(k * 12.9898 + a * 78.233) * 43758.5453
    return (v - math.floor(v)) - 0.5


def cuts(bm, size, step, axes=(0, 1, 2)):
    """Loop cuts about `step` apart along the given axes of a box made by K.bm_cube (vertex AO on long faces)."""
    for i in axes:
        n = int(size[i] / step)
        if n > 0:
            edges = [e for e in bm.edges if abs((e.verts[0].co - e.verts[1].co)[i]) > size[i] * 0.99]
            bmesh.ops.subdivide_edges(bm, edges=edges, cuts=n, use_grid_fill=True)


def block(P, name, size, loc, material, rot=(0, 0, 0), bev=0.004, segs=1, step=None, axes=(0, 1, 2), open=None,
          **kw):
    """
    A box like P.box but without the kit's automatic loop cuts along long thin bars: step=None leaves it a plain
    box (hidden rails, mouldings), step > 0 cuts its faces every `step` m along `axes` so that its vertex AO has
    samples (a door's panel, a long board seen with shelves across it); step=0 is the kit's own P.box.
    """
    if step == 0:
        return P.box(name, size, loc, material, rot=rot, bev=bev, segs=segs, open=open, **kw)
    bm = bmesh.new()
    K.bm_cube(bm, size)
    if step:
        cuts(bm, size, step, axes)
    if open:
        dead = []
        for f in bm.faces:
            n = f.normal
            for i, ax in enumerate('xyz'):
                for sg in ('-', '+'):
                    if sg + ax in open and abs(n[i]) > 0.9 and (n[i] > 0) == (sg == '+'):
                        dead.append(f)
        bmesh.ops.delete(bm, geom=dead, context='FACES_ONLY')
    K.bm_transform(bm, mat4(loc, rot))
    return P.mesh(name, bm, material, bev=bev, segs=segs, **kw)


def plank(P, name, a, b, w, t, material='wood', up=(0, 0, 1), bev=0.004, segs=1, twist=0.0, step=None, floor=True):
    """A board from a to b (centre line), w wide across `up`'s perpendicular in its plane, t thick along `up`; with
    floor=True a splayed leg is cut off flat at z = 0 instead of poking through it."""
    a, b = V(a), V(b)
    L = (b - a).length
    d = (b - a).normalized()
    upv = V(up).normalized()
    side = upv.cross(d).normalized()
    upv = d.cross(side).normalized()
    bm = bmesh.new()
    K.bm_cube(bm, (L, w, t))
    n = int(L / step) if step else 0
    if n > 0:
        edges = [e for e in bm.edges if abs((e.verts[0].co - e.verts[1].co).x) > L * 0.99]
        bmesh.ops.subdivide_edges(bm, edges=edges, cuts=n, use_grid_fill=True)
    if twist:
        for v in bm.verts:
            u = v.co.x / L + 0.5
            ang = math.radians(twist) * (u - 0.5)
            y, z = v.co.y, v.co.z
            v.co.y, v.co.z = y * math.cos(ang) - z * math.sin(ang), y * math.sin(ang) + z * math.cos(ang)
    m = Matrix((d, side, upv)).transposed().to_4x4()
    K.bm_transform(bm, Matrix.Translation((a + b) / 2) @ m)
    if floor and min(a.z, b.z) < 0.03:
        for v in bm.verts:
            if v.co.z < 0.0:
                v.co.z = 0.0
    return P.mesh(name, bm, material, bev=bev, segs=segs)


def post(P, name, a, b, r, material='wood', segs=8, bev=0.003):
    """A round post or rod from a to b."""
    a, b = V(a), V(b)
    return P.cyl(name, r, (b - a).length, tuple((a + b) / 2), material, axis=tuple(b - a), segs=segs, bev=bev, bsegs=1)


def rect_face(bm, w, h, c, normal, up=(0, 0, 1)):
    """One flat w x h quad (h along `up`) at c facing `normal`: a patch on a face (a label, a hole, a slot)."""
    nrm = V(normal).normalized()
    upv = V(up)
    if abs(upv.normalized().dot(nrm)) > 0.9:
        upv = V((1, 0, 0)) if abs(nrm.x) < 0.9 else V((0, 1, 0))
    a = (upv - nrm * upv.dot(nrm)).normalized()
    b = nrm.cross(a)
    c = V(c)
    vs = [bm.verts.new(c + a * (sa * h / 2) + b * (sb * w / 2)) for (sa, sb) in ((-1, -1), (-1, 1), (1, 1), (1, -1))]
    f = bm.faces.new(vs)
    f.normal_update()
    if f.normal.dot(nrm) < 0:
        f.normal_flip()
    return f


def patch(P, name, w, h, c, normal, material, up=(0, 0, 1), t=0.0015, bev=None):
    """A raised flat patch t proud of a face (a label, a sticker, a price strip): a thin box on the face."""
    nrm = V(normal).normalized()
    upv = V(up)
    if abs(upv.normalized().dot(nrm)) > 0.9:
        upv = V((1, 0, 0)) if abs(nrm.x) < 0.9 else V((0, 1, 0))
    a = (upv - nrm * upv.dot(nrm)).normalized()
    b = a.cross(nrm)
    m = Matrix((nrm, b, a)).transposed().to_4x4()
    bm = bmesh.new()
    K.bm_cube(bm, (t, w, h), Matrix.Translation(V(c) + nrm * (t / 2)) @ m)
    return P.mesh(name, bm, material, bev=bev, segs=1, sharp=50.0)


def handle_bar(P, name, c, length, axis='Y', stand=0.03, r=0.006, normal=(1, 0, 0), material='chrome'):
    """A bar pull: two posts standing `stand` off a face (normal) and the bar between, along `axis`."""
    c = V(c)
    nrm = V(normal).normalized()
    ax = V((1, 0, 0)) if axis == 'X' else V((0, 1, 0)) if axis == 'Y' else V((0, 0, 1))
    rb = min(stand * 0.6, 0.012)
    a0, a1 = c - ax * (length / 2), c + ax * (length / 2)
    pts = [a0, a0 + nrm * (stand - rb), a0 + nrm * stand + ax * rb, a1 + nrm * stand - ax * rb, a1 + nrm * (stand - rb),
           a1]
    return P.tube(name, pts, r, material, segs=8, bend=0.0)


def cup_knob(P, name, c, normal=(1, 0, 0), r=0.016, h=0.026, material='wood', segs=8):
    """A turned round knob (a cupboard's, a drawer's) standing on a face."""
    prof = [(0.0, h), (r * 0.8, h * 0.96), (r, h * 0.7), (r * 0.45, h * 0.3), (r * 0.55, 0.0)]
    return P.lathe(name, prof[::-1], loc=tuple(c), material=material, axis=tuple(normal), segs=segs, sharp=55.0)


def panel_door(P, name, w, h, t, c, material='paint', frame=0.07, inset=0.008, panel_mat=None, rows=1, bev=0.006,
               grid=0.16):
    """
    A frame-and-panel door (or drawer front) facing +X: c = the centre of its back face; the stiles and rails
    stand `inset` proud of the panel(s) between them (rows panels one over another). Returns its objects.
    """
    cx, cy, cz = c
    pm = panel_mat or material
    # (the panel's face is cut into a grid: its vertex AO then darkens the corners under the frame, not all of it)
    objs = [block(P, name + '_panel', (t - inset, w - 0.01, h - 0.01), (cx + (t - inset) / 2, cy, cz), pm, bev=0.003,
                  segs=1, step=grid, axes=(1, 2))]
    xs = cx + t - inset / 2 - 0.0005
    fr = min(frame, w * 0.3, h * 0.3)
    for sy in (-1, 1):
        objs.append(block(P, name + '_stile', (inset + 0.001, fr, h), (xs, cy + sy * (w / 2 - fr / 2), cz), material,
                          bev=bev, segs=1))
    zs = [cz - h / 2 + fr / 2, cz + h / 2 - fr / 2]
    if rows > 1:
        ph = (h - 2 * fr - (rows - 1) * fr * 0.8) / rows
        for k in range(1, rows):
            zs.append(cz - h / 2 + fr + k * ph + (k - 0.5) * fr * 0.8)
    for z in zs:
        rh = fr if z in (zs[0], zs[1]) else fr * 0.8
        objs.append(block(P, name + '_rail', (inset + 0.001, w - 2 * fr + 0.002, rh), (xs, cy, z), material, bev=bev,
                          segs=1))
    return objs


def lathe_bm(bm, prof, loc, segs=10, axis='Z'):
    """A surface of revolution into an existing bmesh (many small round things joined into one object)."""
    m = Matrix.Translation(V(loc)) @ K.axis_matrix(axis)
    return K.bm_lathe(bm, prof, segs=segs, matrix=m)


BOTTLE = [(0.0, 0.0), (0.88, 0.0), (1.0, 0.04), (1.0, 0.58), (0.86, 0.68), (0.42, 0.8), (0.36, 0.95), (0.4, 0.97),
          (0.4, 1.0), (0.0, 1.0)]
JAR = [(0.0, 0.0), (0.9, 0.0), (1.0, 0.06), (1.0, 0.8), (0.86, 0.86), (0.86, 1.0), (0.0, 1.0)]
CAN = [(0.0, 0.0), (0.88, 0.0), (1.0, 0.05), (1.0, 0.94), (0.92, 1.0), (0.0, 1.0)]


def rounds(P, name, items, material, prof, segs=8):
    """Many round things (bottles, jars, tins) of one material in one object: items = [(x, y, z, r, h), ...]."""
    bm = bmesh.new()
    for (x, y, z, r, h) in items:
        lathe_bm(bm, [(r * a, z + h * b) for (a, b) in prof], (x, y, 0.0), segs=segs)
    return P.mesh(name, bm, material, sharp=50.0)


def boxes(P, name, items, material, bev=0.003):
    """Many small boxes (packets, cartons) of one material in one object: items = [(x, y, z, sx, sy, sz, yaw), ...]
    with (x, y, z) the bottom centre."""
    bm = bmesh.new()
    for (x, y, z, sx, sy, sz, yaw) in items:
        K.bm_cube(bm, (sx, sy, sz), mat4((x, y, z + sz / 2), (0, 0, yaw)))
    return P.mesh(name, bm, material, bev=bev, segs=1)


def tyre_prof(R, w, ri):
    """The section of a car tyre (outer radius R, section width w, bead radius ri) for P.lathe(..., loop=True),
    the outside on the right of travel; the tread a little squared off."""
    hw = w / 2
    sw = R - ri
    return [(ri, -hw * 0.78), (ri + sw * 0.35, -hw), (R - sw * 0.2, -hw * 0.96), (R - 0.008, -hw * 0.78),
            (R, -hw * 0.55), (R, hw * 0.55), (R - 0.008, hw * 0.78), (R - sw * 0.2, hw * 0.96),
            (ri + sw * 0.35, hw), (ri, hw * 0.78)][::-1]


def tread_blocks(bm, c, R, w, n=24, axis='Z', depth=0.008, rows=2, seed=0.0):
    """Tread blocks round a tyre of radius R and width w whose axis runs along `axis` through c (into bm)."""
    ax = K.axis_matrix(axis)
    for i in range(n):
        for row in range(rows):
            a = TAU * (i + (0.5 if row % 2 else 0.0)) / n
            off = (row - (rows - 1) / 2) * w * 0.5 / max(1, rows - 1) * 1.6 if rows > 1 else 0.0
            m = (Matrix.Translation(V(c)) @ ax @ Matrix.Rotation(a, 4, 'Z') @
                 Matrix.Translation((R + depth / 2 - 0.002, 0.0, off)) @ Matrix.Rotation(math.radians(12), 4, 'X'))
            K.bm_cube(bm, (depth, TAU * R / n * 0.55, w * 0.3), m)
