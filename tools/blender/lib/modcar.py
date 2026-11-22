"""
Shared Blender helpers for the ModCar models (docs/MODCAR.md section 6).

Run inside Blender 5.2 in the background, e.g.
    blender -b --factory-startup --python tools/blender/build.py -- sedan

Conventions:
  * Blender axes: X forward, Y left, Z up; metres. The glTF exporter (+Y up) turns this into the game's
    body frame: +x forward, +y up, +z right.  game(x, y, z) = blender(x, z, -y).
  * Frames: origin on the ground under the middle of the wheelbase, on the centre line.
  * Parts: origin at the point where the part sits on its mount; forward +X. Paired parts (rims, lamps,
    mirrors, door panels, armour) are modelled for the LEFT side (outer face towards +Y); the game mirrors them.
  * Materials are recognised only by name (MAT_NAMES); the game swaps them for its own shaders.
  * Vertex colour attribute "Col" = baked ambient occlusion (grey 0..1).
  * Empties "M_<mountId>" are the mounts; objects "P_<mountId>" are the hinged panels (origin on the hinge).
"""

import json
import math
import os

import bmesh
import bpy
from mathutils import Matrix, Vector

# preview colours / roughness / metal for Blender's own renders (the game ignores these values)
MAT_NAMES = {
    'paint': ((0.62, 0.16, 0.12), 0.35, 0.0),
    'paint_b': ((0.85, 0.80, 0.70), 0.35, 0.0),
    'trim': ((0.03, 0.03, 0.035), 0.6, 0.0),
    'chrome': ((0.9, 0.9, 0.92), 0.08, 1.0),
    'steel': ((0.42, 0.43, 0.45), 0.45, 0.8),
    'alu': ((0.7, 0.71, 0.72), 0.35, 0.9),
    'rubber': ((0.025, 0.025, 0.028), 0.85, 0.0),
    'glass': ((0.75, 0.85, 0.9), 0.05, 0.0),
    'glass_dark': ((0.08, 0.1, 0.12), 0.05, 0.0),
    'lens_head': ((0.95, 0.95, 0.9), 0.05, 0.0),
    'lens_tail': ((0.7, 0.04, 0.03), 0.1, 0.0),
    'lens_amber': ((0.95, 0.5, 0.05), 0.1, 0.0),
    'fabric': ((0.35, 0.22, 0.16), 0.9, 0.0),
    'leather': ((0.25, 0.12, 0.07), 0.55, 0.0),
    'wood': ((0.45, 0.28, 0.14), 0.7, 0.0),
    'plastic_int': ((0.18, 0.16, 0.15), 0.7, 0.0),
    'gauge': ((0.9, 0.88, 0.8), 0.5, 0.0),
    'ceramic': ((0.95, 0.95, 0.93), 0.15, 0.0),
    'rust': ((0.45, 0.2, 0.08), 0.9, 0.3),
    'emit': ((1.0, 0.9, 0.7), 0.5, 0.0),
    # (the two filler caps' colours, which the game's materials know: an amber and a blue that are no item's own)
    'cap_oil': ((0.82, 0.5, 0.03), 0.5, 0.0),
    'cap_water': ((0.06, 0.24, 0.62), 0.5, 0.0),
}


def reset_scene():
    """Empty the file: no default cube, camera or light."""
    bpy.ops.wm.read_factory_settings(use_empty=True)
    for c in list(bpy.data.collections):
        bpy.data.collections.remove(c)


def mat(name):
    """The material of a conventional name (created once per file)."""
    if name not in MAT_NAMES:
        raise ValueError(f'unknown material name {name!r}: use one of {sorted(MAT_NAMES)}')
    m = bpy.data.materials.get(name)
    if m is None:
        m = bpy.data.materials.new(name)
        col, rough, metal = MAT_NAMES[name]
        bsdf = m.node_tree.nodes.get('Principled BSDF')
        if bsdf is not None:
            bsdf.inputs['Base Color'].default_value = (*col, 1.0)
            bsdf.inputs['Roughness'].default_value = rough
            bsdf.inputs['Metallic'].default_value = metal
        m.diffuse_color = (*col, 1.0)
    return m


def set_material(obj, name):
    """Give a whole object one conventional material."""
    obj.data.materials.clear()
    obj.data.materials.append(mat(name))
    return obj


def collection(name, parent=None):
    c = bpy.data.collections.get(name)
    if c is None:
        c = bpy.data.collections.new(name)
        (parent or bpy.context.scene.collection).children.link(c)
    return c


def mesh_object(name, bm, material=None, coll=None):
    """Turn a bmesh into an object (the bmesh is freed)."""
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    obj = bpy.data.objects.new(name, me)
    (coll or bpy.context.scene.collection).objects.link(obj)
    if material:
        set_material(obj, material)
    return obj


def empty(name, loc=(0, 0, 0), rot=(0, 0, 0), size=0.1, coll=None, props=None):
    """A mount or hinge marker. rot = Euler XYZ radians. props become glTF extras."""
    e = bpy.data.objects.new(name, None)
    e.empty_display_type = 'ARROWS'
    e.empty_display_size = size
    e.location = loc
    e.rotation_euler = rot
    for k, v in (props or {}).items():
        e[k] = v
    (coll or bpy.context.scene.collection).objects.link(e)
    return e


def smooth(obj, angle_deg=35.0, weighted=True):
    """Smooth shading with sharp edges above angle_deg, and weighted normals (keeps flat faces flat)."""
    me = obj.data
    bm = bmesh.new()
    bm.from_mesh(me)
    lim = math.radians(angle_deg)
    for f in bm.faces:
        f.smooth = True
    for e in bm.edges:
        if len(e.link_faces) == 2 and e.calc_face_angle(0.0) > lim:
            e.smooth = False
    bm.to_mesh(me)
    bm.free()
    if weighted:
        m = obj.modifiers.new('weighted', 'WEIGHTED_NORMAL')
        m.keep_sharp = True
        m.weight = 50
    return obj


def bevel(obj, width=0.004, segments=2, angle_deg=30.0, harden=True):
    """Bevel modifier on edges sharper than angle_deg (applied at export)."""
    m = obj.modifiers.new('bevel', 'BEVEL')
    m.width = width
    m.segments = segments
    m.limit_method = 'ANGLE'
    m.angle_limit = math.radians(angle_deg)
    m.harden_normals = harden
    m.miter_outer = 'MITER_ARC'
    return obj


def subdivide(obj, levels=2, render_levels=None):
    m = obj.modifiers.new('subsurf', 'SUBSURF')
    m.levels = levels
    m.render_levels = render_levels if render_levels is not None else levels
    return obj


def mirror_y(obj, merge=True):
    """Mirror across the centre line (Blender Y)."""
    m = obj.modifiers.new('mirror', 'MIRROR')
    m.use_axis = (False, True, False)
    m.use_clip = True
    m.use_mirror_merge = merge
    return obj


def apply_modifiers(obj):
    """Bake the modifier stack into the mesh (before booleans, AO bake or measuring)."""
    dg = bpy.context.evaluated_depsgraph_get()
    ev = obj.evaluated_get(dg)
    me = bpy.data.meshes.new_from_object(ev, preserve_all_data_layers=True, depsgraph=dg)
    old = obj.data
    obj.modifiers.clear()
    obj.data = me
    if old.users == 0:
        bpy.data.meshes.remove(old)
    return obj


def triangles(objs):
    """Triangle count after modifiers (what the game will draw)."""
    dg = bpy.context.evaluated_depsgraph_get()
    n = 0
    for o in objs:
        if o.type != 'MESH':
            continue
        ev = o.evaluated_get(dg)
        me = ev.to_mesh()
        me.calc_loop_triangles()
        n += len(me.loop_triangles)
        ev.to_mesh_clear()
    return n


def bake_ao(objs, samples=24, distance=0.35):
    """Ambient occlusion into the vertex colour attribute 'Col' (modifiers are applied first)."""
    meshes = [o for o in objs if o.type == 'MESH']
    if not meshes:
        return
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    scene.cycles.device = 'CPU'
    scene.cycles.samples = samples
    scene.world = scene.world or bpy.data.worlds.new('World')
    scene.world.light_settings.distance = distance
    for o in meshes:
        apply_modifiers(o)
        me = o.data
        attr = me.color_attributes.get('Col') or me.color_attributes.new('Col', 'BYTE_COLOR', 'CORNER')
        me.color_attributes.active_color = attr
        me.attributes.render_color_index = me.color_attributes.find('Col')
    bpy.ops.object.select_all(action='DESELECT')
    for o in meshes:
        o.select_set(True)
    bpy.context.view_layer.objects.active = meshes[0]
    bpy.ops.object.bake(type='AO', target='VERTEX_COLORS')


# ------------------------------------------------------------------------------------------- grime masks

GLASS_MATS = ('glass', 'glass_dark')
# the mask texels per metre the game gives a model's surface (src/game/modcar/grime.ts reads mask_px)
MASK_DENSITY = 400.0


def mask_size(meshes, glass_scale=2.0):
    """The side (texels) of the square grime mask the game gives these meshes together: their surface at
    MASK_DENSITY per metre, glass counted glass_scale times finer, a power of two from 64 to 2048."""
    area = 0.0
    for o in meshes:
        me = o.data
        names = [m.name.split('.')[0] if m else '' for m in me.materials]
        for p in me.polygons:
            g = names[p.material_index] in GLASS_MATS if p.material_index < len(names) else False
            area += p.area * (glass_scale * glass_scale if g else 1.0)
    # (the packer fills about two thirds of the square)
    side = math.sqrt(area / 0.66) * MASK_DENSITY
    px = 64
    while px < side and px < 2048:
        px *= 2
    return px


def mask_uv(objs, glass_scale=2.0, angle_deg=66.0):
    """
    A second UV map 'MASK' over the given meshes, packed together into one square: the grime mask the game
    paints as dirt is scrubbed off (src/game/modcar/grime.ts). Faces are grouped by angle and projected
    (Smart UV Project), glass islands made glass_scale times larger (the windows are scraped at a finer
    grain), then everything packed with three texels between islands. A UV map the mesh had stays the first
    (the lens and gauge faces read it) and MASK comes after it (TEXCOORD_1); without one MASK is the only map
    (TEXCOORD_0). Each mesh is given mask_px, the side of the square, as a custom property (glTF extras),
    which also tells the game that it has a mask. Returns it.
    """
    from bpy_extras import bmesh_utils
    meshes = [o for o in objs if o.type == 'MESH' and len(o.data.polygons)]
    if not meshes:
        return 0
    for o in meshes:
        if o.modifiers:
            apply_modifiers(o)
    px = mask_size(meshes, glass_scale)
    margin = 3.0 / px
    for o in meshes:
        me = o.data
        lay = me.uv_layers.get('MASK') or me.uv_layers.new(name='MASK')
        me.uv_layers.active = lay
        o['mask_px'] = px
    if bpy.context.object and bpy.context.object.mode != 'OBJECT':
        bpy.ops.object.mode_set(mode='OBJECT')
    bpy.ops.object.select_all(action='DESELECT')
    for o in meshes:
        o.hide_set(False)
        o.select_set(True)
    bpy.context.view_layer.objects.active = meshes[0]
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.reveal()
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(angle_limit=math.radians(angle_deg), island_margin=margin, area_weight=0.0,
                             correct_aspect=True, scale_to_bounds=False)
    if glass_scale != 1.0:
        for o in meshes:
            bm = bmesh.from_edit_mesh(o.data)
            uvl = bm.loops.layers.uv['MASK']
            names = [m.name.split('.')[0] if m else '' for m in o.data.materials]
            for isl in bmesh_utils.bmesh_linked_uv_islands(bm, uvl):
                if not all(f.material_index < len(names) and names[f.material_index] in GLASS_MATS for f in isl):
                    continue
                pts = [l[uvl].uv.copy() for f in isl for l in f.loops]
                cu = sum((q.x for q in pts)) / len(pts)
                cv = sum((q.y for q in pts)) / len(pts)
                for f in isl:
                    for l in f.loops:
                        uv = l[uvl].uv
                        uv.x = cu + (uv.x - cu) * glass_scale
                        uv.y = cv + (uv.y - cv) * glass_scale
            bmesh.update_edit_mesh(o.data)
    bpy.ops.uv.pack_islands(rotate=True, scale=True, margin_method='FRACTION', margin=margin)
    bpy.ops.object.mode_set(mode='OBJECT')
    bpy.ops.object.select_all(action='DESELECT')
    return px


def to_game(v):
    """Blender point/vector -> game body frame (+x forward, +y up, +z right)."""
    return (v[0], v[2], -v[1])


_C = Matrix(((1, 0, 0), (0, 0, 1), (0, -1, 0)))


def matrix_to_game(m):
    """Blender world matrix -> (position, quaternion xyzw) in the game frame."""
    r = _C @ m.to_3x3() @ _C.transposed()
    q = r.to_quaternion()
    p = to_game(m.translation)
    return [round(c, 5) for c in p], [round(q.x, 6), round(q.y, 6), round(q.z, 6), round(q.w, 6)]


def mounts_json(path, frame_id, extra=None):
    """Write every empty named M_<id> (and its custom properties) as the frame's mount table."""
    out = {'frame': frame_id, 'mounts': {}}
    for o in bpy.data.objects:
        if o.type != 'EMPTY' or not o.name.startswith('M_'):
            continue
        pos, quat = matrix_to_game(o.matrix_world)
        entry = {'pos': pos, 'quat': quat}
        for k in o.keys():
            if k.startswith('_'):
                continue
            v = o[k]
            entry[k] = v.to_list() if hasattr(v, 'to_list') else v
        out['mounts'][o.name[2:]] = entry
    if extra:
        out.update(extra)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(out, f, indent=1, ensure_ascii=False, sort_keys=True)
    return out


def export_glb(path, objs=None):
    """Export the given objects (default: everything) to one GLB with modifiers applied."""
    os.makedirs(os.path.dirname(path), exist_ok=True)
    bpy.ops.object.select_all(action='DESELECT')
    sel = objs if objs is not None else list(bpy.context.scene.objects)
    for o in sel:
        o.select_set(True)
    bpy.ops.export_scene.gltf(
        filepath=path,
        export_format='GLB',
        use_selection=True,
        export_apply=True,
        export_yup=True,
        export_normals=True,
        export_texcoords=True,
        export_tangents=False,
        export_materials='EXPORT',
        export_vertex_color='NAME',
        export_vertex_color_name='Col',
        export_extras=True,
        export_image_format='NONE',
    )


def preview(path, target=(0, 0, 0.6), dist=6.0, yaw_deg=35.0, pitch_deg=12.0, size=(960, 540), engine='BLENDER_WORKBENCH'):
    """A quick render of the scene from an orbit position (Workbench by default: fast, no lights needed)."""
    scene = bpy.context.scene
    scene.render.engine = engine
    scene.render.resolution_x, scene.render.resolution_y = size
    scene.render.film_transparent = False
    if engine == 'BLENDER_WORKBENCH':
        sh = scene.display.shading
        sh.light = 'STUDIO'
        sh.color_type = 'MATERIAL'
        sh.show_cavity = True
        sh.cavity_type = 'BOTH'
        sh.show_shadows = True
    cam_data = bpy.data.cameras.get('preview') or bpy.data.cameras.new('preview')
    cam_data.lens = 50
    cam = bpy.data.objects.get('preview') or bpy.data.objects.new('preview', cam_data)
    if cam.name not in scene.collection.objects:
        scene.collection.objects.link(cam)
    yaw = math.radians(yaw_deg)
    pitch = math.radians(pitch_deg)
    t = Vector(target)
    # yaw 0 = in front of the car (+X), positive = round to the car's right (-Y)
    d = Vector((math.cos(yaw) * math.cos(pitch), -math.sin(yaw) * math.cos(pitch), math.sin(pitch)))
    cam.location = t + d * dist
    cam.rotation_euler = (t - cam.location).to_track_quat('-Z', 'Y').to_euler()
    scene.camera = cam
    os.makedirs(os.path.dirname(path), exist_ok=True)
    scene.render.filepath = path
    bpy.ops.render.render(write_still=True)
    bpy.data.objects.remove(cam)
