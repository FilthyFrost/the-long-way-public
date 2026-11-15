"""Preview rendering for the frame scripts: EEVEE with an anime-style sky (sky / hard horizon / dark ground gives
the two reflection bands of anime car paint), a zebra world for surface checks, and Workbench quick looks."""
import math
import sys

sys.dont_write_bytecode = True

import bmesh  # noqa: E402
import bpy  # noqa: E402
from mathutils import Vector  # noqa: E402


def _preview_material(name, col, rough=0.8):
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    b = m.node_tree.nodes.get('Principled BSDF')
    b.inputs['Base Color'].default_value = (*col, 1.0)
    b.inputs['Roughness'].default_value = rough
    return m


def scene_setup(world='anime', ground=True, sun_elev=48.0, sun_az=-35.0, strength=1.0, sun=3.2):
    """world: 'anime' | 'zebra' | 'studio'. sun_az: degrees, 0 = sun in front of the car (+X), -90 = on its right."""
    scene = bpy.context.scene
    w = bpy.data.worlds.get('preview') or bpy.data.worlds.new('preview')
    scene.world = w
    nt = w.node_tree
    nt.nodes.clear()
    out = nt.nodes.new('ShaderNodeOutputWorld')
    bg = nt.nodes.new('ShaderNodeBackground')
    bg.inputs['Strength'].default_value = strength
    nt.links.new(bg.outputs[0], out.inputs[0])
    tc = nt.nodes.new('ShaderNodeTexCoord')
    sep = nt.nodes.new('ShaderNodeSeparateXYZ')
    nt.links.new(tc.outputs['Generated'], sep.inputs[0])
    if world == 'zebra':
        mul = nt.nodes.new('ShaderNodeMath')
        mul.operation = 'MULTIPLY'
        mul.inputs[1].default_value = 40.0
        nt.links.new(sep.outputs['Z'], mul.inputs[0])
        sin = nt.nodes.new('ShaderNodeMath')
        sin.operation = 'SINE'
        nt.links.new(mul.outputs[0], sin.inputs[0])
        gt = nt.nodes.new('ShaderNodeMath')
        gt.operation = 'GREATER_THAN'
        gt.inputs[1].default_value = 0.0
        nt.links.new(sin.outputs[0], gt.inputs[0])
        nt.links.new(gt.outputs[0], bg.inputs['Color'])
    else:
        mr = nt.nodes.new('ShaderNodeMapRange')
        mr.inputs['From Min'].default_value = -1.0
        mr.inputs['From Max'].default_value = 1.0
        nt.links.new(sep.outputs['Z'], mr.inputs['Value'])
        ramp = nt.nodes.new('ShaderNodeValToRGB')
        cr = ramp.color_ramp
        cr.interpolation = 'LINEAR'
        if world == 'anime':
            stops = [(0.0, (0.10, 0.09, 0.085)), (0.485, (0.30, 0.27, 0.24)), (0.4995, (0.40, 0.37, 0.33)),
                     (0.5005, (1.25, 1.22, 1.15)), (0.53, (0.75, 0.86, 1.0)), (0.70, (0.38, 0.55, 0.85)),
                     (1.0, (0.20, 0.36, 0.70))]
        else:
            stops = [(0.0, (0.18, 0.18, 0.19)), (0.5, (0.45, 0.45, 0.46)), (1.0, (0.85, 0.86, 0.88))]
        cr.elements[0].position = stops[0][0]
        cr.elements[0].color = (*stops[0][1], 1.0)
        cr.elements[1].position = stops[-1][0]
        cr.elements[1].color = (*stops[-1][1], 1.0)
        for pos, col in stops[1:-1]:
            e = cr.elements.new(pos)
            e.color = (*col, 1.0)
        nt.links.new(mr.outputs['Result'], ramp.inputs['Fac'])
        nt.links.new(ramp.outputs['Color'], bg.inputs['Color'])
    sl = bpy.data.lights.get('preview_sun') or bpy.data.lights.new('preview_sun', 'SUN')
    sl.energy = sun if world != 'zebra' else 0.0
    sl.angle = math.radians(1.5)
    so = bpy.data.objects.get('preview_sun') or bpy.data.objects.new('preview_sun', sl)
    if so.name not in scene.collection.objects:
        scene.collection.objects.link(so)
    # light travels along the object's -Z: point it from the sun direction towards the car
    az = math.radians(sun_az)
    el = math.radians(sun_elev)
    sdir = Vector((math.cos(az) * math.cos(el), math.sin(az) * math.cos(el), math.sin(el)))
    so.rotation_euler = (-sdir).to_track_quat('-Z', 'Y').to_euler()
    g = bpy.data.objects.get('preview_ground')
    if ground:
        if g is None:
            bm = bmesh.new()
            bmesh.ops.create_grid(bm, x_segments=1, y_segments=1, size=30)
            me = bpy.data.meshes.new('preview_ground')
            bm.to_mesh(me)
            bm.free()
            g = bpy.data.objects.new('preview_ground', me)
            scene.collection.objects.link(g)
            me.materials.append(_preview_material('preview_ground', (0.30, 0.29, 0.28), 0.9))
        g.hide_render = False
    elif g:
        g.hide_render = True
    scene.render.engine = 'BLENDER_EEVEE'
    ee = scene.eevee
    ee.taa_render_samples = 48
    for attr, val in (('use_raytracing', True), ('use_shadows', True)):
        try:
            setattr(ee, attr, val)
        except Exception:
            pass
    scene.view_settings.view_transform = 'AgX'
    try:
        scene.view_settings.look = 'AgX - Medium High Contrast'
    except Exception:
        pass
    scene.render.film_transparent = False


def camera(loc, target, lens=50.0, ortho=None, name='preview_cam'):
    scene = bpy.context.scene
    cd = bpy.data.cameras.get(name) or bpy.data.cameras.new(name)
    cd.lens = lens
    cd.clip_start = 0.02
    cd.clip_end = 200
    if ortho:
        cd.type = 'ORTHO'
        cd.ortho_scale = ortho
    else:
        cd.type = 'PERSP'
    co = bpy.data.objects.get(name) or bpy.data.objects.new(name, cd)
    if co.name not in scene.collection.objects:
        scene.collection.objects.link(co)
    co.location = Vector(loc)
    co.rotation_euler = (Vector(target) - co.location).to_track_quat('-Z', 'Y').to_euler()
    scene.camera = co
    return co


def orbit(target, yaw_deg, pitch_deg, dist, lens=50.0, ortho=None):
    """yaw 0 = in front (+X), 90 = the car's right side (-Y), 180 = behind, 270 = its left side."""
    yaw = math.radians(yaw_deg)
    pitch = math.radians(pitch_deg)
    d = Vector((math.cos(yaw) * math.cos(pitch), -math.sin(yaw) * math.cos(pitch), math.sin(pitch)))
    return camera(tuple(Vector(target) + d * dist), target, lens, ortho)


def render(path, res=(1280, 720), samples=None):
    scene = bpy.context.scene
    scene.render.resolution_x, scene.render.resolution_y = res
    scene.render.resolution_percentage = 100
    if samples and scene.render.engine == 'BLENDER_EEVEE':
        scene.eevee.taa_render_samples = samples
    scene.render.image_settings.file_format = 'PNG'
    scene.render.filepath = path
    bpy.ops.render.render(write_still=True)


def workbench(cavity=True, color='MATERIAL'):
    scene = bpy.context.scene
    scene.render.engine = 'BLENDER_WORKBENCH'
    sh = scene.display.shading
    sh.light = 'STUDIO'
    sh.color_type = color
    sh.show_cavity = cavity
    sh.cavity_type = 'BOTH'
    sh.show_shadows = False
    scene.view_settings.view_transform = 'Standard'


def materials():
    """Nicer preview shading of the conventional materials (the game replaces them anyway)."""
    for m in bpy.data.materials:
        b = m.node_tree.nodes.get('Principled BSDF') if m.node_tree else None
        if b is None:
            continue
        if m.name in ('paint', 'paint_b'):
            b.inputs['Roughness'].default_value = 0.3
            b.inputs['Coat Weight'].default_value = 1.0
            b.inputs['Coat Roughness'].default_value = 0.02
        elif m.name == 'chrome':
            b.inputs['Roughness'].default_value = 0.06
            b.inputs['Metallic'].default_value = 1.0
        elif m.name in ('glass', 'glass_dark'):
            b.inputs['Roughness'].default_value = 0.0
            b.inputs['Base Color'].default_value = (0.015, 0.02, 0.025, 1.0)
            b.inputs['Alpha'].default_value = 0.5 if m.name == 'glass' else 0.85
            try:
                m.surface_render_method = 'BLENDED'
            except Exception:
                pass
