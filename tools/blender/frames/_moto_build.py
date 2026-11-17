"""Assembly of the moto frame (frames/moto.py main()): every object of the frame GLB with its name, origin, parent
and materials, the mount empties, the dial UVs, the needles, the mount JSON (with the rig block), the AO bake,
the export, and the previews (also the fit study with the stock part GLBs placed at the mounts)."""
import math
import os
import sys
import time

sys.dont_write_bytecode = True

import bpy  # noqa: E402
import numpy as np  # noqa: E402
from mathutils import Matrix, Vector  # noqa: E402

from frames import _kit as K  # noqa: E402
from frames import _moto_fork as MF  # noqa: E402
from frames import _moto_frame as MFR  # noqa: E402
from frames import _moto_kit as MK  # noqa: E402
from frames import _moto_rear as MR  # noqa: E402
from frames import _preview as PV  # noqa: E402
from frames import moto as M  # noqa: E402
from lib import modcar as mc  # noqa: E402

D = M.D
OUT_GLB = 'public/models/modcar/frames/moto.glb'
OUT_JSON = 'src/core/modcar/data/mounts/moto.json'
SCRATCH = 'D:/modcar-scratch/moto'
PARTS_DIR = 'public/models/modcar/parts'

SY = np.diag([1.0, -1.0, 1.0])
unit = K.unit


def rot_y(deg):
    a = math.radians(deg)
    c, s = math.cos(a), math.sin(a)
    return np.array([[c, 0, s], [0, 1, 0], [-s, 0, c]])


def rot_x(deg):
    a = math.radians(deg)
    c, s = math.cos(a), math.sin(a)
    return np.array([[1, 0, 0], [0, c, -s], [0, s, c]])


def rot_z(deg):
    a = math.radians(deg)
    c, s = math.cos(a), math.sin(a)
    return np.array([[c, -s, 0], [s, c, 0], [0, 0, 1]])


def mirror_rot(R):
    """The rotation of the mirror-image mount (across the mid plane): S R S."""
    return SY @ R @ SY


def game_vec(v):
    return [round(float(v[0]), 5), round(float(v[2]), 5), round(float(-v[1]), 5)]


# ============================================================================================ mount layout
def tank_mount():
    """Tank on the backbone: its tunnel round the tube, nose up with the backbone's fall."""
    bb0 = M.axis_pt(D['t_bb'])
    bb1 = np.array(D['bb1'], float)
    d = bb1 - bb0
    tdir = d / np.linalg.norm(d)
    ang = math.degrees(math.atan2(-d[2], -d[0]))
    up = np.cross(-tdir, np.array([0, 1.0, 0]))
    up = up / np.linalg.norm(up)
    tc = bb0 + tdir * D['tank_s']
    return tc - up * 0.046, rot_y(-ang)


def layout():
    """Every mount: id -> dict(loc, rot (3x3, columns = the part's local axes), props, on (parent object or None)).
    Positions follow the stock parts' shapes (data/parts_geo.json) so each sits where it belongs."""
    L = {}

    def put(mid, loc, props, rot=None, on=None):
        if on:
            props = dict(props, on=on)
        L[mid] = dict(loc=np.asarray(loc, float), rot=np.eye(3) if rot is None else np.asarray(rot, float), props=props, on=on)

    put('hub_F', M.HUB_F, dict(cat='rim', axle='front', steer=True, driven=False, handbrake=False, side=0, wheel_r=D['wheel_r']),
        on='FORK_LOWER')
    put('hub_R', M.HUB_R, dict(cat='rim', axle='rear', steer=False, driven=True, handbrake=False, side=0, wheel_r=D['wheel_r']),
        on='SWINGARM')
    put('engine', M.ENGINE, dict(cat='engine', side=0, space_min=[-0.21, -0.12, 0.0], space_max=[0.24, 0.12, 0.45]))
    put('gearbox', M.GEARBOX, dict(cat='gearbox', side=0))
    put('exhaust', M.EXHAUST, dict(cat='exhaust', side=0, route='header round the front of the engine, silencer on the right'),
        rot=rot_x(D['exh_roll']))
    Rf = M.fork_frame()
    put('steering', M.STEER_MOUNT, dict(cat='steering', side=0, steer_axis='z'), rot=Rf, on='FORK')
    loc, R = tank_mount()
    put('fuelTank', loc, dict(cat='fuelTank', side=0), rot=R)
    put('seat_driver', (D['seat_x'], 0.0, D['seat_z']), dict(cat='seat', side=0, driver=True, floor_z=D['seat_z']))
    put('battery', D['battery'], dict(cat='battery', side=0))
    put('radiator', (0.330, 0.0, 0.270), dict(cat='radiator', side=0))
    put('headlight', M.HEADLIGHT, dict(cat='headlight', side=0), rot=rot_y(1.5), on='FORK')
    put('taillight', M.TAILLIGHT, dict(cat='taillight', side=0))
    # mirrors on the stock bar's lever perches (fork frame)
    for sname, sg in (('L', 1.0), ('R', -1.0)):
        p = M.STEER_MOUNT + Rf @ np.array([-0.080, sg * 0.226, 0.146])
        R = rot_y(-14.0)
        if sg < 0:
            R = mirror_rot(R)
        put('mirror_' + sname, p, dict(cat='mirror', side=-1 if sg > 0 else 1), rot=R, on='FORK')
    put('bumperFront', M.BUMPER_F, dict(cat='bumperFront', side=0, fit=[0.10, 0.30, 0.10], fit_anchor='center'), on='FORK_LOWER')
    put('bumperRear', M.BUMPER_R, dict(cat='bumperRear', side=0, fit=[0.10, 0.34, 0.11], fit_anchor='center'))
    put('horn', M.HORN, dict(cat='horn', side=0), rot=rot_x(180.0), on='FORK')
    c, nrm, right, up = M.ignition_frame()
    put('ignition', c, dict(cat='ignition', side=0), rot=K.frame_from(-nrm, up), on='FORK')
    put('gearLever', M.SHIFT_PIVOT, dict(cat='gearLever', side=0, kind='foot shift pedal pivot, left of the frame'))
    return L


# ============================================================================================ objects
def obj_with_origin(buf, name, origin, parent=None, rot=None):
    """Object whose origin is `origin` (world) and world rotation `rot` (3x3, columns = local axes)."""
    V, N, T, Mt = buf.arrays()
    R = np.eye(3) if rot is None else np.asarray(rot, float)
    b = K.Buf()
    if len(T):
        b.add((V - np.asarray(origin, float)) @ R, N @ R, T, 'paint')
        b.M = list(Mt)
    o = b.to_object(name)
    m = Matrix(R.tolist()).to_4x4()
    m.translation = Vector(origin)
    o.matrix_world = m
    if parent is not None:
        o.parent = parent
        o.matrix_parent_inverse = parent.matrix_world.inverted()
    return o


def mount_empty(name, loc, rot, props, parent=None):
    e = bpy.data.objects.new('M_' + name, None)
    e.empty_display_type = 'ARROWS'
    e.empty_display_size = 0.08
    bpy.context.scene.collection.objects.link(e)
    m = Matrix(np.asarray(rot, float).tolist()).to_4x4()
    m.translation = Vector(loc)
    e.matrix_world = m
    for k, v in props.items():
        e[k] = v
    if parent is not None:
        e.parent = parent
        e.matrix_parent_inverse = parent.matrix_world.inverted()
    return e


def needle(dial):
    """A tapered needle with a hub cap. Local frame: X = rest (zero reading, 210 deg on the dial), Z = dial normal."""
    r = dial['r']
    L = r * 0.86
    b = K.Buf()
    pts = np.array([(-0.010, -0.0024), (L, -0.0005), (L, 0.0005), (-0.010, 0.0024)])
    V = np.array([(p[0], p[1], 0.0012) for p in pts])
    b.add(V, np.tile((0, 0, 1.0), (4, 1)), np.array([(0, 1, 2), (0, 2, 3)]), 'emit')
    V, N, T = K.lathe(np.array([(0.0, 0.0042), (0.0048, 0.0034), (0.0056, 0.0)]), (0, 0, 0), (0, 0, 1), 16)
    b.add(V, N, T, 'trim')
    a = math.radians(210.0)
    rest = math.cos(a) * dial['right'] + math.sin(a) * dial['up']
    R = K.frame_from(rest, dial['normal'])
    return b, R


def add_uvs(obj, dials, lamps):
    """UVs: the dial faces ('gauge') from their dial frames (u right, v up as the rider sees them; centre 0.5);
    the round lenses radially round their lamp centres."""
    me = obj.data
    uv = me.uv_layers.new(name='UVMap')
    mw = np.array(obj.matrix_world)
    names = [m.name for m in me.materials]
    co = np.array([v.co[:] for v in me.vertices])
    cow = co @ mw[:3, :3].T + mw[:3, 3]
    data = np.zeros((len(me.loops), 2))
    for poly in me.polygons:
        mname = names[poly.material_index] if poly.material_index < len(names) else ''
        if mname == 'gauge' and dials:
            cen = cow[list(poly.vertices)].mean(0)
            d = min(dials, key=lambda g: np.linalg.norm(cen - g['center']))
            for li in poly.loop_indices:
                p = cow[me.loops[li].vertex_index] - d['center']
                data[li] = (0.5 + (p @ d['right']) / (2 * d['r']), 0.5 + (p @ d['up']) / (2 * d['r']))
        elif mname.startswith('lens') and lamps:
            cen = cow[list(poly.vertices)].mean(0)
            lp = min(lamps, key=lambda g: np.linalg.norm(cen - g[0]))
            c, ax, r = lp
            a1, a2, _ = K.plane_basis(ax)
            for li in poly.loop_indices:
                p = cow[me.loops[li].vertex_index] - c
                data[li] = (0.5 + (p @ a1) / (2 * r), 0.5 + (p @ a2) / (2 * r))
    uv.data.foreach_set('uv', data.ravel())


def build_objects():
    """Create every object; returns (objs dict, mesh list, empties list, extra info)."""
    t0 = time.time()
    M.LAMPS.clear()
    fr = MFR.Frame()
    lay = layout()
    tank = tank_mount()
    # ---------------------------------------------------------------- BODY
    body = K.Buf()
    left = K.Buf()
    left.extend(fr.loop_tube())
    left.extend(fr.stays())
    left.extend(fr.head_gussets())
    left.extend(fr.pivot_bosses())
    left.extend(fr.engine_plates())
    left.extend(fr.footpeg_hangers())
    left.extend(fr.side_cover())
    left.extend(fr.passenger_pegs())
    left.extend(fr.turn_signals_rear())
    body.extend(MFR.both(left))
    body.extend(fr.head_tube())
    body.extend(fr.backbone())
    body.extend(fr.cross_tubes())
    body.extend(MFR.both(fr.fender_mounts()))
    body.extend(fr.pivot_hardware())
    body.extend(fr.engine_bolts_centre())
    body.extend(fr.tank_mounts(tank))
    body.extend(fr.battery_tray())
    body.extend(fr.coil())
    body.extend(fr.loom())
    body.extend(fr.side_stand_lug())
    body.extend(fr.brake_pedal())
    body.extend(fr.shift_boss())
    body.extend(fr.rear_fender())
    nb, plate_c, plate_n, plate_up = fr.number_plate()
    body.extend(nb)
    body.extend(fr.taillight_bracket(M.TAILLIGHT))
    body.extend(fr.grab_rail())
    print('[moto] body', round(time.time() - t0, 1), 's')
    objs = {}
    objs['BODY'] = obj_with_origin(body, 'BODY', (0, 0, 0))
    # ---------------------------------------------------------------- FORK
    fk = MF.Fork()
    fork = obj_with_origin(fk.upper(), 'FORK', M.FORK_ORIGIN)
    objs['FORK'] = fork
    objs['FORK_LOWER'] = obj_with_origin(fk.lower(), 'FORK_LOWER', M.HUB_F, parent=fork)
    needles = {}
    for d in fk.dials:
        nb_, R = needle(d)
        V, N, T, Mt = nb_.arrays()
        bw = K.Buf()
        bw.add(V @ R.T + d['center'], N @ R.T, T, 'emit')
        bw.M = list(Mt)
        o = obj_with_origin(bw, d['name'], d['center'], parent=fork, rot=R)
        objs[d['name']] = o
        needles[d['name']] = dict(pivot=d['center'], normal=d['normal'], rest=R[:, 0])
    print('[moto] fork', round(time.time() - t0, 1), 's')
    # ---------------------------------------------------------------- SWINGARM, shocks, stand
    rr = MR.Rear()
    sa = obj_with_origin(rr.swingarm(), 'SWINGARM', rr.pv)
    objs['SWINGARM'] = sa
    shocks = {}
    for sg, sname in ((1.0, 'L'), (-1.0, 'R')):
        lo, up = MR.shock_points(sg)
        ax = unit(up - lo)
        X = unit(np.array([1.0, 0, 0]) - ax * ax[0])
        R = K.frame_from(X, ax)
        objs['SHOCK_UPPER_' + sname] = obj_with_origin(rr.shock_upper(sg), 'SHOCK_UPPER_' + sname, up, rot=R)
        objs['SHOCK_LOWER_' + sname] = obj_with_origin(rr.shock_lower(sg), 'SHOCK_LOWER_' + sname, lo, parent=sa, rot=R)
        shocks[sname] = dict(upper=up, lower=lo)
    objs['STAND'] = obj_with_origin(rr.stand(), 'STAND', M.STAND_PIVOT)
    print('[moto] rear', round(time.time() - t0, 1), 's')
    # ---------------------------------------------------------------- UVs (dials, lenses)
    add_uvs(fork, fk.dials, M.LAMPS)
    add_uvs(objs['BODY'], [], M.LAMPS)
    # ---------------------------------------------------------------- mounts
    empties = []
    for mid, m in lay.items():
        parent = objs.get(m['on']) if m['on'] else None
        empties.append(mount_empty(mid, m['loc'], m['rot'], m['props'], parent))
    meshes = [o for o in objs.values() if o.type == 'MESH']
    info = dict(needles=needles, shocks=shocks, fork=fk, frame=fr, rear=rr)
    return objs, meshes, empties, info


def json_extra(objs, info, tris, total):
    ns = {}
    for name, n in info['needles'].items():
        ns[name] = dict(pivot=game_vec(n['pivot']), axis_local='y', axis=game_vec(n['normal']), deg_full=-240.0,
                        rest='zero reading at 210 deg (bottom left) on the dial; the scale runs 240 deg clockwise as the '
                             'rider sees it, so a full reading is -240 deg about the axis (right hand)')
    lo = np.full(3, 1e9)
    hi = np.full(3, -1e9)
    for o in objs.values():
        if o.type != 'MESH':
            continue
        for c in o.bound_box:
            w = o.matrix_world @ Vector(c)
            lo = np.minimum(lo, w)
            hi = np.maximum(hi, w)
    glo = game_vec(lo)
    ghi = game_vec(hi)
    bb = dict(min=[min(glo[0], ghi[0]), min(glo[1], ghi[1]), min(glo[2], ghi[2])], max=[max(glo[0], ghi[0]), max(glo[1], ghi[1]), max(glo[2], ghi[2])])
    t_ax, lead = M.axle_offset()
    rr = info['rear']
    sa_len = float(np.linalg.norm(M.HUB_R - rr.pv))
    rig = dict(
        fork=dict(object='FORK', pivot=game_vec(M.FORK_ORIGIN), axis=game_vec(M.AX), rake_deg=D['rake'], trail=D['trail'],
                  offset=D['clamp_off'], axle_lead=round(lead, 4),
                  lower=dict(object='FORK_LOWER', axis=game_vec(M.AX), travel=0.14),
                  children='FORK_LOWER, N_speed, N_rpm and the mounts steering, headlight, mirror_L, mirror_R, ignition, horn; '
                           'FORK_LOWER carries hub_F and bumperFront'),
        swingarm=dict(object='SWINGARM', pivot=game_vec(rr.pv), axis=[0.0, 0.0, -1.0], length=round(sa_len, 4),
                      children='SHOCK_LOWER_L, SHOCK_LOWER_R and the mount hub_R'),
        shocks={k: dict(upper='SHOCK_UPPER_' + k, lower='SHOCK_LOWER_' + k, upper_eye=game_vec(v['upper']), lower_eye=game_vec(v['lower']),
                        length=round(float(np.linalg.norm(v['upper'] - v['lower'])), 4)) for k, v in info['shocks'].items()},
        stand=dict(object='STAND', pivot=game_vec(M.STAND_PIVOT), axis=game_vec(M.STAND_AXIS), fold_deg=round(M.STAND_FOLD_DEG, 2),
                   foot=game_vec(M.STAND_FOOT), note='modelled down, its foot pad just clear of the ground with the bike upright'),
    )
    notes = ('Game frame (+x forward, +y up, +z right), metres; axes are unit vectors and every angle follows the right-hand rule. '
             'fork: FORK has its origin on the steering axis at the top of the steering head and no rotation of its own; a turn of '
             '+a about rig.fork.axis (up the raked steering axis) steers the front wheel to the LEFT (counter-clockwise seen from '
             'above, the same sense as a wheel pivot rotation.y), so use a = -sim.steerAngle. FORK_LOWER (sliders, fender, disc, '
             'caliper, hub_F) is a child of FORK with its origin on the front axle; move it by the front suspension compression '
             '(metres, + = wheel up) along rig.fork.lower.axis. The steering mount sits on the fork tubes plane (the stock bar\'s caps '
             'on the tubes), 35 mm ahead of the axis: parent the steering part to FORK and do not spin it about its own origin. '
             'swingarm: SWINGARM pivots about rig.swingarm.axis through its pivot; +a raises the rear axle (bump): '
             'a = asin(rise / length). shocks: SHOCK_UPPER_* are fixed on the frame (origin = top eye), SHOCK_LOWER_* ride on '
             'the swingarm (origin = bottom eye); both have local +y (game) along the shock from the bottom eye to the top eye at '
             'rest; to keep them in line aim the upper\'s -y at the lower eye and the lower\'s +y at the upper eye (optional: the '
             'lower half slides inside the upper\'s shroud either way). stand: STAND is modelled down (foot on the ground with '
             'the bike upright); fold it for riding by +fold_deg about rig.stand.axis through rig.stand.pivot. needles turn about '
             'their local +y (game) = Blender local +Z by deg_full * reading. Mounts with "on" are children of that object in '
             'the GLB (pos/quat here are at rest, in the frame space).')
    eye = M.rider_eye()
    return dict(panels={}, needles=ns, wipers={}, eye_default=game_vec(eye), bbox=bb,
                triangles=dict(total=total, **tris), units='metres, game frame (+x forward, +y up, +z right)', rig=rig, notes=notes)


CLEAR = ('glass', 'glass_dark', 'lens_head', 'lens_tail', 'lens_amber')


def bake_ao_clear(meshes, samples=32, distance=0.05):
    """mc.bake_ao without letting glass and lenses occlude: their faces are split off into temporary objects
    (kept out of the scene during the bake), then joined back with AO = 1."""
    import bmesh
    spare = []
    for o in meshes:
        names = [m.name.split('.')[0] for m in o.data.materials]
        idx = {i for i, n in enumerate(names) if n in CLEAR}
        if not idx:
            continue
        g = o.copy()
        g.data = o.data.copy()
        g.name = o.name + '__clear'
        bpy.context.scene.collection.objects.link(g)
        for ob, keep_clear in ((o, False), (g, True)):
            bm = bmesh.new()
            bm.from_mesh(ob.data)
            dead = [f for f in bm.faces if (f.material_index in idx) != keep_clear]
            bmesh.ops.delete(bm, geom=dead, context='FACES')
            bm.to_mesh(ob.data)
            bm.free()
        bpy.context.scene.collection.objects.unlink(g)
        spare.append((o, g))
    mc.bake_ao(meshes, samples=samples, distance=distance)
    for o, g in spare:
        bpy.context.scene.collection.objects.link(g)
        me = g.data
        attr = me.color_attributes.get('Col') or me.color_attributes.new('Col', 'BYTE_COLOR', 'CORNER')
        n = len(attr.data)
        attr.data.foreach_set('color', np.ones(n * 4, np.float32))
        bpy.ops.object.select_all(action='DESELECT')
        g.select_set(True)
        o.select_set(True)
        bpy.context.view_layer.objects.active = o
        bpy.ops.object.join()


def bake_ao_bvh(meshes, distance=0.07, rays=40, seed=11):
    """Ambient occlusion into the corner colour 'Col' (0..1 grey), computed per vertex with a BVH of every mesh
    except glass and lenses: cosine-weighted rays over the vertex normal's hemisphere, an occluder only counts when
    the ray meets its front face (rays leave a vertex buried inside another part through that part's back faces, so
    a tube's buried end does not darken the visible tube). Deterministic (fixed ray set)."""
    from mathutils.bvhtree import BVHTree
    verts = []
    polys = []
    for o in meshes:
        me = o.data
        mw = o.matrix_world
        names = [m.name.split('.')[0] for m in me.materials]
        base = len(verts)
        for v in me.vertices:
            verts.append(mw @ v.co)
        for poly in me.polygons:
            if poly.material_index < len(names) and names[poly.material_index] in CLEAR:
                continue
            polys.append([base + i for i in poly.vertices])
    tree = BVHTree.FromPolygons(verts, polys, all_triangles=True)
    rng = np.random.RandomState(seed)
    u1 = (np.arange(rays) + rng.rand(rays)) / rays
    u2 = rng.rand(rays)
    # cosine-weighted hemisphere directions (z up)
    r = np.sqrt(u1)
    th = 2 * math.pi * u2
    local = np.stack([r * np.cos(th), r * np.sin(th), np.sqrt(np.maximum(0.0, 1 - u1))], 1)
    eps = 2e-4
    for o in meshes:
        me = o.data
        mw = o.matrix_world
        m3 = mw.to_3x3()
        # vertex normals from the custom split normals (each vertex has one normal: the buffer welds by normal)
        vn = np.zeros((len(me.vertices), 3))
        cn = np.empty(len(me.loops) * 3, np.float32)
        me.corner_normals.foreach_get('vector', cn)
        cn = cn.reshape(-1, 3)
        lv = np.empty(len(me.loops), np.int32)
        me.loops.foreach_get('vertex_index', lv)
        np.add.at(vn, lv, cn)
        ao = np.ones(len(me.vertices))
        for i, v in enumerate(me.vertices):
            n = Vector(vn[i]).normalized()
            n = (m3 @ n).normalized()
            p = mw @ v.co
            t1 = n.orthogonal().normalized()
            t2 = n.cross(t1)
            hit = 0
            for d in local:
                dirv = t1 * float(d[0]) + t2 * float(d[1]) + n * float(d[2])
                orig = p + n * eps
                left = distance
                for _ in range(4):
                    loc, fn, idx, dist = tree.ray_cast(orig, dirv, left)
                    if loc is None:
                        break
                    if fn.dot(dirv) < 0:      # a front face: occluded
                        hit += 1
                        break
                    left -= dist + 1e-4
                    if left <= 0:
                        break
                    orig = loc + dirv * 1e-4
            ao[i] = 1.0 - hit / rays
        attr = me.color_attributes.get('Col') or me.color_attributes.new('Col', 'BYTE_COLOR', 'CORNER')
        me.color_attributes.active_color = attr
        me.attributes.render_color_index = me.color_attributes.find('Col')
        col = np.repeat(ao[lv][:, None], 4, 1).astype(np.float32)
        col[:, 3] = 1.0
        attr.data.foreach_set('color', col.ravel())


def build(args):
    t0 = time.time()
    quick = '--quick' in args
    no_preview = '--no-preview' in args
    mc.reset_scene()
    objs, meshes, empties, info = build_objects()
    tris = {o.name: mc.triangles([o]) for o in meshes}
    total = sum(tris.values())
    print('[moto] triangles', total, {k: v for k, v in sorted(tris.items(), key=lambda kv: -kv[1])})
    if not quick:
        bake_ao_bvh(meshes, distance=0.07, rays=40)
        print('[moto] AO', round(time.time() - t0, 1), 's')
    print('[moto] grime masks', K.mask_frame(meshes))
    mc.export_glb(OUT_GLB, meshes + empties)
    extra = json_extra(objs, info, tris, total)
    mc.mounts_json(OUT_JSON, 'moto', extra)
    print('[moto] exported', round(time.time() - t0, 1), 's')
    if not no_preview:
        previews(quick, '--parts' in args)
    print('[moto] done', round(time.time() - t0, 1), 's')


# ============================================================================================ part import
def import_glb(path):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=path)
    objs = [o for o in bpy.data.objects if o not in before]
    for o in objs:
        if o.type == 'MESH':
            for a in o.data.color_attributes:
                if a.name != 'Col':
                    a.name = 'Col'
    return objs


def place_part(pid, loc, rot, mirror=False, variant=None):
    """Import a part GLB and put its root at a mount (mirror = a right-side mount: the game flips its local z)."""
    path = os.path.join(PARTS_DIR, (variant or pid) + '.glb')
    if not os.path.exists(path):
        print('[moto] missing part', path)
        return []
    objs = import_glb(path)
    R = np.asarray(rot, float)
    if mirror:
        R = R @ SY
    m = Matrix(R.tolist()).to_4x4()
    m.translation = Vector(loc)
    for o in objs:
        if o.parent is None:
            o.matrix_world = m @ o.matrix_world
    return objs


STOCK = dict(engine='eng_single', gearbox='gb_moto', battery='bat_moto', fuelTank='tank_moto', exhaust='exh_moto',
             steering='steer_bar', seat_driver='seat_saddle', headlight='hl_round', taillight='tl_round',
             mirror_L='mir_stock', mirror_R='mir_stock', ignition='ign_key', gearLever='gl_foot', horn='horn_beep')


def place_stock(lay, which=None):
    objs = []
    for mid, pid in STOCK.items():
        if which and mid not in which:
            continue
        m = lay[mid]
        loc = m['loc'].copy()
        if m['props'].get('cat') == 'seat' and 'floor_z' in m['props']:
            loc[2] = m['props']['floor_z']
        objs += place_part(pid, loc, m['rot'], mirror=m['props'].get('side', 0) > 0)
    for mid in ('hub_F', 'hub_R'):
        if which and mid not in which:
            continue
        m = lay[mid]
        objs += place_part('rim_moto18', m['loc'], m['rot'])
        objs += place_part('tire_moto', m['loc'], m['rot'], variant='tire_moto@rim_moto18')
    return objs


# ============================================================================================ previews
def factory_paints():
    """Preview colours of the factory paints (cherry body, charcoal frame) instead of the lib's defaults."""
    for name, col in (('paint', (0.578, 0.032, 0.042)), ('paint_b', (0.028, 0.031, 0.036))):
        m = bpy.data.materials.get(name)
        if m and m.node_tree:
            bs = m.node_tree.nodes.get('Principled BSDF')
            if bs:
                bs.inputs['Base Color'].default_value = (*col, 1.0)


def previews(quick, with_parts=False, tag=''):
    PV.materials()
    factory_paints()
    PV.scene_setup('anime', sun_elev=46.0, sun_az=-40.0)
    res = (1280, 720)
    smp = 16 if quick else 40
    T = (0.0, 0, 0.52)
    shots = [('side_r', 90, 2, 4.4), ('side_l', 270, 2, 4.4), ('f34', 35, 10, 4.0), ('r34', 215, 12, 4.0), ('front', 0, 4, 3.6),
             ('rear', 180, 6, 3.6)]
    pre = f'{SCRATCH}/moto{tag}'
    for name, yaw, pitch, dist in shots:
        PV.orbit(T, yaw, pitch, dist, lens=50)
        PV.render(f'{pre}_{name}.png', res=res, samples=smp)
    PV.orbit((0.0, 0, 0.5), 270, 89.5, 6, ortho=2.5)
    PV.render(f'{pre}_top.png', res=(1400, 800), samples=12)
    eye = M.rider_eye()
    PV.camera(tuple(eye), tuple(eye + np.array([1.0, 0.0, -0.36])), lens=26)
    PV.render(f'{pre}_rider.png', res=res, samples=smp)
    # close-ups: the head (fork, clamps, binnacle), the rear (swingarm, shocks, fender), the frame centre
    PV.camera((1.15, -0.95, 1.20), (0.38, 0.0, 0.85), lens=45)
    PV.render(f'{pre}_head.png', res=res, samples=smp)
    PV.camera((-0.25, -1.25, 0.75), (-0.62, 0.0, 0.48), lens=40)
    PV.render(f'{pre}_rear_close.png', res=res, samples=smp)
    PV.camera((0.35, 1.35, 0.62), (-0.08, 0.0, 0.42), lens=40)
    PV.render(f'{pre}_centre_l.png', res=res, samples=smp)
    if with_parts:
        lay = layout()
        place_stock(lay)
        PV.materials()
        factory_paints()
        for name, yaw, pitch, dist in (('parts_side_r', 90, 2, 4.4), ('parts_f34', 35, 10, 4.0), ('parts_r34', 215, 12, 4.0),
                                       ('parts_side_l', 270, 2, 4.4)):
            PV.orbit(T, yaw, pitch, dist, lens=50)
            PV.render(f'{pre}_{name}.png', res=res, samples=smp)
        PV.camera(tuple(eye), tuple(eye + np.array([1.0, 0.0, -0.36])), lens=26)
        PV.render(f'{pre}_parts_rider.png', res=res, samples=smp)


def fit(args):
    """Fit study: the stock part GLBs at the mounts, with the frame (Workbench, quick)."""
    mc.reset_scene()
    objs, meshes, empties, info = build_objects()
    lay = layout()
    if '--bare' not in args:
        place_stock(lay)
    PV.workbench(cavity=True)
    sc = bpy.context.scene
    sc.display.shading.show_object_outline = True
    shots = [('fit_side_r', (0.0, -6, 0.55), (0.0, 0, 0.55), 2.4), ('fit_side_l', (0.0, 6, 0.55), (0.0, 0, 0.55), 2.4),
             ('fit_top', (0.0, 0.0, 6), (0.0, 0, 0.5), 2.4), ('fit_front', (6, 0.0, 0.55), (0, 0, 0.55), 1.3),
             ('fit_rear', (-6, 0.0, 0.55), (0, 0, 0.55), 1.3)]
    for name, loc, tgt, ortho in shots:
        PV.camera(loc, tgt, ortho=ortho)
        if name == 'fit_top':
            bpy.context.scene.camera.rotation_euler = (0, 0, -math.pi / 2)
        PV.render(f'{SCRATCH}/{name}.png', res=(1600, 1000) if ('side' in name or 'top' in name) else (1000, 1000))
    for name, yaw, pitch, dist in (('fit_f34', 35, 12, 4.0), ('fit_r34', 215, 14, 4.0)):
        PV.orbit((0.0, 0, 0.52), yaw, pitch, dist, lens=50)
        PV.render(f'{SCRATCH}/{name}.png', res=(1400, 900))
    print('[moto] fit study written')


def kit_test(args):
    """Render each helper once (normals and bevels check)."""
    mc.reset_scene()
    b = K.Buf()
    tb, main = MK.bent_tube([(0, 0, 0.2), (0.3, 0, 0.2), (0.3, 0, 0.5), (0.0, 0.1, 0.6)], [0, 0.06, 0.05, 0], 0.015, 'paint_b', 12)
    b.extend(tb)
    br, bpath = MK.bent_tube([(0.15, 0, 0.2), (0.15, 0.0, 0.40), (0.30, 0.0, 0.40)], [0, 0.04, 0], 0.011, 'paint_b', 10)
    b.extend(br)
    b.extend(MK.weld(main, 0.015, bpath, 0.011, at='start'))
    b.extend(MK.weld(main, 0.015, bpath, 0.011, at='end'))
    hole = MK.circle2((0.05, 0.03), 0.008, 16)
    out = MK.rounded_poly2([(0, 0), (0.12, 0), (0.12, 0.06), (0.0, 0.08)], [0.01, 0.01, 0.02, 0.01], 0.004)
    b.extend(MK.plate(out, (0.4, 0.0, 0.2), (1, 0, 0), (0, 0, 1), 0.004, 'steel', holes=[hole]))
    b.extend(MK.bolt((0.45, 0.002, 0.23), (0, 1, 0), 0.006, 0.005))
    b.extend(MK.spring((0.0, 0.25, 0.1), (0, 0, 1), 0.026, 0.2, 8, 0.0045))
    b.extend(MK.disc((0.6, 0.0, 0.3), (0, 1, 0), 0.12, 0.05, 'steel', 48, thick=0.005))
    b.extend(MK.cap_nut((0.6, 0.004, 0.3), (0, 1, 0)))
    b.to_object('KIT')
    PV.materials()
    PV.scene_setup('anime')
    PV.orbit((0.3, 0, 0.35), 300, 20, 1.6, lens=50)
    PV.render(f'{SCRATCH}/kit_test.png', res=(1200, 800), samples=16)


def review(args):
    """Close-up review renders (factory paints), optionally with the stock parts."""
    mc.reset_scene()
    objs, meshes, empties, info = build_objects()
    if '--parts' in args:
        place_stock(layout())
    PV.materials()
    factory_paints()
    PV.scene_setup('anime', sun_elev=40.0, sun_az=-60.0)
    res = (1280, 800)
    smp = 32
    tag = '_p' if '--parts' in args else ''
    cams = [('rv_head_r', (0.85, -0.62, 1.12), (0.40, 0.0, 0.86), 40),
            ('rv_head_l', (0.80, 0.70, 1.05), (0.40, 0.0, 0.84), 40),
            ('rv_clamps_top', (0.05, -0.18, 1.32), (0.38, 0.0, 0.93), 40),
            ('rv_frame_l', (0.10, 1.10, 0.62), (-0.10, 0.0, 0.45), 35),
            ('rv_frame_r', (0.10, -1.10, 0.62), (-0.10, 0.0, 0.45), 35),
            ('rv_rear_r', (-0.45, -0.95, 0.62), (-0.68, 0.0, 0.42), 38),
            ('rv_rear_l', (-0.45, 0.95, 0.62), (-0.68, 0.0, 0.42), 38),
            ('rv_tail', (-1.65, -0.55, 0.85), (-0.85, 0.0, 0.55), 38),
            ('rv_front_hub', (0.95, -0.55, 0.45), (0.66, 0.0, 0.38), 40),
            ('rv_pegs_r', (-0.05, -0.65, 0.42), (-0.15, -0.1, 0.32), 40)]
    for name, loc, tgt, lens in cams:
        PV.camera(loc, tgt, lens=lens)
        PV.render(f'{SCRATCH}/{name}{tag}.png', res=res, samples=smp)


def rotate_about(obj, pivot, axis, deg):
    """Turn an object (and its children) about a world axis through a world point."""
    R = Matrix.Rotation(math.radians(deg), 4, Vector(axis))
    T = Matrix.Translation(Vector(pivot))
    obj.matrix_world = T @ R @ T.inverted() @ obj.matrix_world


def motion(args):
    """The moving pieces at their limits: fork at full lock (both ways), the swingarm in bump, the stand
    folded; with the stock parts on (the bar and the fork-mounted parts turned with the fork)."""
    mc.reset_scene()
    objs, meshes, empties, info = build_objects()
    lay = layout()
    parts = place_stock(lay)
    PV.materials()
    factory_paints()
    PV.scene_setup('anime', sun_elev=40.0, sun_az=-60.0)
    # parts that ride on the fork / swingarm: by mount (re-imported per mount, so collect them by position)
    on_fork = [p for p in parts if p.parent is None and any(np.linalg.norm(np.array(p.matrix_world.translation) - lay[m]['loc']) < 1e-4
                                                             for m in ('steering', 'headlight', 'mirror_L', 'mirror_R', 'ignition', 'horn', 'hub_F'))]
    on_sa = [p for p in parts if p.parent is None and np.linalg.norm(np.array(p.matrix_world.translation) - lay['hub_R']['loc']) < 1e-4]
    lock = float(args[args.index('--lock') + 1]) if '--lock' in args else 32.0
    rotate_about(objs['FORK'], M.FORK_ORIGIN, M.AX, lock)
    for p in on_fork:
        rotate_about(p, M.FORK_ORIGIN, M.AX, lock)
    bump = 9.0
    rr = info['rear']
    rotate_about(objs['SWINGARM'], rr.pv, (0, 1, 0), bump)
    for p in on_sa:
        rotate_about(p, rr.pv, (0, 1, 0), bump)
    rotate_about(objs['STAND'], M.STAND_PIVOT, M.STAND_AXIS, M.STAND_FOLD_DEG)
    for name, loc, tgt, lens, ortho in (('mo_top', (0.0, 0.0, 4.0), (0.0, 0.0, 0.5), 50, 2.3), ('mo_f34', None, None, 45, None),
                                        ('mo_side_l', (0.0, 3.4, 0.55), (0.0, 0, 0.5), 45, None), ('mo_stand', (0.05, 1.05, 0.30), (-0.10, 0.1, 0.22), 38, None)):
        if name == 'mo_f34':
            PV.orbit((0.1, 0, 0.6), 30, 30, 3.2, lens=45)
        else:
            PV.camera(loc, tgt, lens=lens, ortho=ortho)
            if name == 'mo_top':
                bpy.context.scene.camera.rotation_euler = (0, 0, -math.pi / 2)
        PV.render(f'{SCRATCH}/{name}.png', res=(1280, 800), samples=24)
