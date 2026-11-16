"""Sedan assembly: builds every object of the frame GLB with its name, origin and material, the mount empties,
the mount JSON, the AO bake, the export and the preview renders. Called from frames/sedan.py main()."""
import json
import math
import os
import sys
import time

sys.dont_write_bytecode = True

import bpy  # noqa: E402
import numpy as np  # noqa: E402
from mathutils import Matrix, Vector  # noqa: E402

from frames import _kit as K  # noqa: E402
from frames import _preview as PV  # noqa: E402
from frames import _sedan_ext as EX  # noqa: E402
from frames import _sedan_inner as IN  # noqa: E402
from frames import sedan as S  # noqa: E402
from lib import modcar as mc  # noqa: E402

D = S.D
OUT_GLB = 'public/models/modcar/frames/sedan.glb'
OUT_JSON = 'src/core/modcar/data/mounts/sedan.json'
SCRATCH = 'D:/modcar-scratch/frames/sedan'


def both(left, centre=None):
    """Left half + mirror (+ centre parts)."""
    b = K.Buf()
    b.extend(left)
    b.extend(left.mirrored())
    if centre is not None:
        b.extend(centre)
    return b


def obj_with_origin(buf, name, origin, parent=None, rot=None):
    """Object whose origin is `origin` (world) and optional world rotation `rot` (3x3, columns = local axes)."""
    V, N, T, M = buf.arrays()
    R = np.eye(3) if rot is None else np.asarray(rot, float)
    Vl = (V - np.asarray(origin, float)) @ R
    Nl = N @ R
    b = K.Buf()
    b.add(Vl, Nl, T, 'paint')
    b.M = list(M)
    o = b.to_object(name)
    m = Matrix.Identity(4)
    m3 = Matrix(R.tolist())
    m = m3.to_4x4()
    m.translation = Vector(origin)
    o.matrix_world = m
    if parent is not None:
        o.parent = parent
        o.matrix_parent_inverse = parent.matrix_world.inverted()
    return o


def mount(name, loc, props, rot=None, size=0.12):
    e = bpy.data.objects.new('M_' + name, None)
    e.empty_display_type = 'ARROWS'
    e.empty_display_size = size
    bpy.context.scene.collection.objects.link(e)
    m = Matrix.Identity(4)
    if rot is not None:
        m = Matrix(np.asarray(rot, float).tolist()).to_4x4()
    m.translation = Vector(loc)
    e.matrix_world = m
    for k, v in props.items():
        e[k] = v
    return e


def game_vec(v):
    return [round(float(v[0]), 5), round(float(v[2]), 5), round(float(-v[1]), 5)]


# ============================================================================================ build
def build(args):
    t0 = time.time()
    quick = '--quick' in args
    no_preview = '--no-preview' in args
    mc.reset_scene()
    ex = EX.Exterior()
    print('[sedan] exterior surfaces', round(time.time() - t0, 1), 's')

    # ---------------------------------------------------------------- BODY
    lb_left = ex.lower_body(False)
    lb_right = ex.lower_body(True)
    common = K.Buf()
    common.extend(ex.top_front())
    common.extend(ex.top_rear())
    common.extend(ex.greenhouse())
    common.extend(ex.roof())
    doors = {w: ex.door_skin(w).extend(ex.door_frame(w)) for w in ('F', 'R')}
    eb, pedges = ex.edges()
    common.extend(eb)
    common.extend(ex.opening_details())
    common.extend(IN.engine_bay())
    common.extend(IN.boot_interior())
    common.extend(IN.apertures())
    common.extend(trims(ex))
    common.extend(ex.greenhouse(-0.03))
    common.extend(aperture_seals(ex))
    left = K.Buf().extend(common).extend(lb_left)
    right = K.Buf().extend(common).extend(lb_right).extend(ex.fuel_details())
    body = K.Buf().extend(left).extend(right.mirrored())
    body.extend(centre_trims(ex))
    body.extend(IN.engine_bay_asym())
    o_body = body.to_object('BODY')
    print('[sedan] body', round(time.time() - t0, 1), 's')

    objs = [o_body]
    panels = {}
    # ---------------------------------------------------------------- doors
    gl = ex.glass()
    for w in ('F', 'R'):
        db = doors[w]
        db.extend(pedges['door_' + w])
        db.extend(IN.door_card(ex, w))
        db.extend(IN.door_extras(ex, w))
        db.extend(IN.door_frame_inner(ex, w))
        xh = D['fd_front'] if w == 'F' else D['rd_front']
        for side, sname in ((1, 'L'), (-1, 'R')):
            mid = 'door_%s%s' % (w, sname)
            hinge = np.array([xh, side * 0.806, 0.60])
            buf = db if side > 0 else db.mirrored()
            o = obj_with_origin(buf, 'P_' + mid, hinge)
            gb = gl['door_' + w] if side > 0 else gl['door_' + w].mirrored()
            og = obj_with_origin(gb, 'PG_' + mid, hinge, parent=o)
            objs += [o, og]
            panels['P_' + mid] = dict(mount=mid, glass='PG_' + mid, hinge='z', hinge_pos=hinge, axis=(0, 0, 1),
                                      open_deg=-70.0 * side if w == 'F' else -68.0 * side)
    # ---------------------------------------------------------------- hood and boot lid
    for name, hinge, odeg in (('hood', (D['hood_rear'] - 0.008, 0.0, 0.885), -58.0), ('trunk', (D['trunk_front'] + 0.01, 0.0, 0.912), 66.0)):
        lb = ex.lid(name)
        lb.extend(pedges[name])
        lb.extend(IN.lid_inner(ex, name))
        o = obj_with_origin(both(lb, lid_hardware(name)), 'P_' + name, hinge)
        objs.append(o)
        panels['P_' + name] = dict(mount=name, hinge='y', hinge_pos=np.array(hinge), axis=(0, 1, 0), open_deg=odeg)
    # ---------------------------------------------------------------- fuel flap
    ff = ex.fuel_flap().mirrored()
    fhinge = np.array([-1.63 + 0.052, -0.790, 0.712])
    o = obj_with_origin(ff, 'FUEL_CAP', fhinge)
    objs.append(o)
    panels['FUEL_CAP'] = dict(mount=None, hinge='z', hinge_pos=fhinge, axis=(0, 0, 1), open_deg=85.0)
    # ---------------------------------------------------------------- GLASS
    g = K.Buf()
    for kind in ('ws', 'rw'):
        g.extend(gl[kind])
        g.extend(gl[kind].mirrored())
    objs.append(g.to_object('GLASS'))
    # ---------------------------------------------------------------- UNDER
    under = both(IN.underbody(), IN.centre_under())
    objs.append(under.to_object('UNDER'))
    # ---------------------------------------------------------------- INTERIOR, needles
    it = IN.interior(ex)
    # the dial glass stays out of the AO bake (it would bake the gauge faces and the needles behind it black);
    # it is joined into INTERIOR after the bake
    ib, dial_glass = K.split_mat(both(it['L'], it['C']), ('glass',))
    o_int = ib.to_object('INTERIOR')
    objs.append(o_int)
    needles = {}
    for gdesc in it['gauges']:
        nb, info = needle(gdesc)
        rot = K.frame_from(info['rest'], gdesc['normal'])
        o = obj_with_origin(nb, gdesc['name'], gdesc['center'], rot=rot)
        objs.append(o)
        needles[gdesc['name']] = info
    # ---------------------------------------------------------------- wipers
    wipers = {}
    for wname, wy, wl in (('WIPER_L', 0.47, 0.44), ('WIPER_R', -0.06, 0.44)):
        wb, info = wiper(wy, wl)
        o = obj_with_origin(wb, wname, info['pivot'], rot=info['rot'])
        objs.append(o)
        wipers[wname] = info
    print('[sedan] objects', round(time.time() - t0, 1), 's')

    # ---------------------------------------------------------------- mounts
    empties = mounts(ex, panels, it)
    # the frame is modelled with its hubs body_drop above the wheel radius and moved down by it: it sits
    # that much lower over its wheels, the hubs stay at the wheel radius above the ground
    K.drop_all(objs, empties, panels, (needles, wipers), -D.get('body_drop', 0.0))
    # ---------------------------------------------------------------- AO, export, JSON
    meshes = [o for o in objs if o.type == 'MESH']
    tris = {o.name: mc.triangles([o]) for o in meshes}
    total = sum(tris.values())
    print('[sedan] triangles', total, {k: v for k, v in sorted(tris.items(), key=lambda kv: -kv[1])[:8]})
    if not quick:
        # the bay is baked with the bonnet up (the tutorial looks into it with the bonnet open)
        hood = next(o for o in meshes if o.name == 'P_hood')
        K.bake_ao_open(meshes, [(hood, panels['P_hood']['axis'], panels['P_hood']['open_deg'])],
                       ((IN.FIREWALL_X - 0.01, -0.76, -0.05), (IN.RAD_X + 0.10, 0.76, 0.85 - D.get('body_drop', 0.0))), samples=32, distance=0.35)
        print('[sedan] AO', round(time.time() - t0, 1), 's')
    if not quick:
        # the dial faces once more without the needles over them
        K.rebake_mats(o_int, [o for o in meshes if o.name.startswith('N_')], ('gauge',), samples=32, distance=0.35)
    K.join_white(o_int, dial_glass)
    tris = {o.name: mc.triangles([o]) for o in meshes}
    total = sum(tris.values())
    mc.export_glb(OUT_GLB, meshes + empties)
    extra = json_extra(objs, panels, needles, wipers, tris, total)
    mc.mounts_json(OUT_JSON, 'sedan', extra)
    print('[sedan] exported', round(time.time() - t0, 1), 's')
    if not no_preview:
        previews(quick)
    print('[sedan] done', round(time.time() - t0, 1), 's')


# ============================================================================================ trims
def trims(ex):
    """Exterior trims of the left half: drip rail, window seals and chrome reveal mouldings, cowl vent, mirror
    base, bumper brackets, sill strip."""
    b = K.Buf()
    gs = ex.gs
    # drip rail along the roof side above the doors (chrome)
    xs = np.linspace(float(gs.a_edge_x(D['rail_z'])) + 0.06, D['cp_top'] - 0.05, 26)
    P, N = S.SIDE_G.to3d(np.stack([xs, np.full(len(xs), D['rail_z'] + 0.016)], 1))
    prof = np.array([(0.0, -0.004), (0.006, -0.004), (0.008, 0.0), (0.008, 0.007), (0.005, 0.009), (0.0, 0.006)])
    V, Nn, T = K.sweep(P, N * 0 + (0, 0, 1), np.stack([-prof[:, 0], prof[:, 1]], 1) * np.array([-1, 1]), closed=False)
    b.add(V, Nn, T, 'chrome')
    # windscreen / rear window: rubber seal and chrome reveal moulding along the body edge
    for kind in ('ws', 'rw'):
        wv = ex.win[kind]
        cen = np.array([float(S.ws_x(0.0, 1.15)) - 0.1, 0.0, 1.15]) if kind == 'ws' else np.array([float(S.rw_x(0.0, 1.15)) + 0.1, 0.0, 1.15])
        E = EX.side_dir(wv['P'], wv['N'], np.tile(cen, (len(wv['P']), 1)), False)
        k = K.coarse_idx(wv['P'], 0.0012)        # the long gentle runs need few points
        P, Nn, E = wv['P'][k], wv['N'][k], E[k]
        Q = P + E * 0.006 - Nn * 0.004
        prof = np.array([(-0.007, -0.006), (-0.006, 0.003), (0.0, 0.0055), (0.006, 0.003), (0.007, -0.006)])
        V, NN, T = K.sweep(Q, Nn, prof, closed=False)
        b.add(V, NN, T, 'rubber')
        prof = np.array([(-0.0045, -0.001), (-0.0035, 0.003), (0.0035, 0.003), (0.0045, -0.001)])
        V, NN, T = K.sweep(P + E * 0.0015 + Nn * 0.0005, Nn, prof, closed=False)
        b.add(V, NN, T, 'chrome')
    # cowl vent grille in front of the windscreen (slots)
    for k in range(7):
        y = 0.10 + 0.08 * k
        p, n = S.CT.to3d(np.array([[0.885, y]]))
        b.extend(K.box_buf((-0.010, -0.024, -0.004), (0.010, 0.024, 0.0015), 'trim', 0.003, 2, xf=K.mat4_trs(p[0])))
    # mirror base (the mirror part sits on it): small pad at the A pillar foot
    mp, mn = mirror_mount_point()
    b.extend(K.box_buf((-0.04, -0.012, -0.004), (0.04, 0.004, 0.022), 'trim', 0.006, 2, xf=K.mat4_trs(mp)))
    # bumper brackets (steel), visible when a bumper is removed: a web and an end plate each
    # (no bumper brackets on the body: the bumper parts bring their own, which meet the body face at the mount)
    # sill chrome strip along the rocker (on the body below the doors)
    xs = np.linspace(D['fd_front'], IN.rear_arch_front(0.245) + 0.03, 12)
    P, N = S.SIDE_L.to3d(np.stack([xs, np.full(len(xs), 0.245)], 1))
    prof = np.array([(0.0, -0.008), (0.003, -0.006), (0.004, 0.0), (0.003, 0.006), (0.0, 0.008)])
    V, NN, T = K.sweep(P, (0, 0, 1), np.stack([-prof[:, 0], prof[:, 1]], 1) * np.array([-1, 1]), closed=False)
    b.add(V, NN, T, 'chrome')
    return b


def aperture_seals(ex):
    """Rubber seals round the door apertures in the greenhouse (on the flange, 15 mm in)."""
    b = K.Buf()
    for w in ('F', 'R'):
        so = ex.cut['doorG_' + w].side('out')
        P = so['P'] - so['N'] * 0.016 + so['E'] * 0.004
        P = K.resample(P, 0.05, closed=False)
        b.extend(K.tube_buf(P, 0.0065, 'rubber', 4))
    op = ex.opening_out
    far = np.hypot(op['P'][:, 0] - D['ax_r'], op['P'][:, 2] - D['hub_z']) > D['arch_r'] + 0.09
    P_all = op['P'] - op['N'] * 0.05
    idx = np.nonzero(far)[0]
    runs = np.split(idx, np.nonzero(np.diff(idx) > 1)[0] + 1) if len(idx) else []
    for run in runs:
        if len(run) < 2:
            continue
        P = K.resample(P_all[run], 0.06, closed=False)
        b.extend(K.tube_buf(P, 0.007, 'rubber', 4))
    return b


def centre_trims(ex):
    """Trims that are not symmetric: boot lock barrel on the rear panel, front emblem plate (fictional)."""
    b = K.Buf()
    x = float(S.rear_x(0.0, 0.79)) + 0.002
    b.extend(K.cyl_buf((x + 0.004, 0.0, 0.79), (x - 0.006, 0.0, 0.79), 0.012, 'chrome', 16))
    b.extend(K.box_buf((x - 0.0068, -0.0012, 0.784), (x - 0.0062, 0.0012, 0.796), 'trim', 0.0, 1))
    # number plate in the rear recess, an emblem on the front panel above the grille
    b.extend(plate_buf((ex.plate_x - 0.001, 0.0, 0.54), (-1.0, 0.0, 0.0), (0.0, 0.0, 1.0), 0.33, 0.15, '37 A52'))
    p, n = S.FRONT_L.to3d(np.array([[0.0, 0.808]]))
    b.extend(badge_buf(p[0], n[0], (0.0, 0.0, 1.0), 0.021))
    return b


# ============================================================================================ plates and badges
SEG7 = {'0': 'abcdef', '1': 'bc', '2': 'abged', '3': 'abgcd', '4': 'fgbc', '5': 'afgcd', '6': 'afgedc', '7': 'abc',
        '8': 'abcdefg', '9': 'abcdfg', 'A': 'abcefg', 'C': 'adef', 'E': 'adefg', 'H': 'bcefg', 'L': 'def', 'P': 'abefg',
        'U': 'bcdef', '-': 'g', ' ': ''}


def plate_buf(c, n, up, w=0.33, h=0.15, text='37 A52', plate_mat='ceramic', ink='trim'):
    """A plain number plate centred on c (its back on the surface, normal n towards the viewer, `up` in its
    plane): a thin plate with a pressed rim, made-up characters as raised seven-segment strokes, two screws."""
    n = K.unit(np.asarray(n, float))
    up = K.unit(np.asarray(up, float) - n * float(np.dot(up, n)))
    right = np.cross(up, n)
    M = K.mat4_trs(np.asarray(c, float), np.stack([right, up, n], 1))
    b = K.Buf()
    b.extend(K.box_buf((-w / 2, -h / 2, 0.0), (w / 2, h / 2, 0.004), plate_mat, 0.002, 1, xf=M))
    for (x0, x1, y0, y1) in ((-w / 2 + 0.006, w / 2 - 0.006, h / 2 - 0.011, h / 2 - 0.007), (-w / 2 + 0.006, w / 2 - 0.006, -h / 2 + 0.007, -h / 2 + 0.011),
                             (-w / 2 + 0.006, -w / 2 + 0.010, -h / 2 + 0.007, h / 2 - 0.007), (w / 2 - 0.010, w / 2 - 0.006, -h / 2 + 0.007, h / 2 - 0.007)):
        b.extend(K.box_buf((x0, y0, 0.004), (x1, y1, 0.0056), plate_mat, 0.0, 1, xf=M))
    ch = h * 0.48
    cw = ch * 0.46
    gap = cw * 0.36
    st = ch * 0.12
    tot = len(text) * cw + (len(text) - 1) * gap
    if tot > 0.80 * w:
        k = 0.80 * w / tot
        cw, gap, tot = cw * k, gap * k, tot * k
    x = -tot / 2
    for t in text:
        a0, a1, b0, b1 = x, x + cw, -ch / 2, ch / 2
        seg = {'a': (a0, a1, b1 - st, b1), 'd': (a0, a1, b0, b0 + st), 'g': (a0, a1, -st / 2, st / 2), 'b': (a1 - st, a1, 0.0, b1),
               'c': (a1 - st, a1, b0, 0.0), 'e': (a0, a0 + st, b0, 0.0), 'f': (a0, a0 + st, 0.0, b1)}
        for s_ in SEG7.get(t, ''):
            x0, x1, y0, y1 = seg[s_]
            b.extend(K.box_buf((x0, y0, 0.004), (x1, y1, 0.0062), ink, 0.0, 1, xf=M))
        x += cw + gap
    for sx in (-w / 2 + 0.03, w / 2 - 0.03):
        p = M[:3, :3] @ np.array([sx, h / 2 - 0.028, 0.004]) + M[:3, 3]
        b.extend(K.cyl_buf(p, p + n * 0.002, 0.006, 'chrome', 10))
    return b


def badge_buf(c, n, up, r=0.024, mat='chrome'):
    """A small fictional emblem: a domed disc in a raised ring with a bar across it."""
    n = K.unit(np.asarray(n, float))
    up = K.unit(np.asarray(up, float) - n * float(np.dot(up, n)))
    b = K.Buf()
    prof = np.array([(r, 0.0), (r, 0.003), (r * 0.86, 0.0055), (r * 0.55, 0.0045), (0.0, 0.0068)])
    V, N, T = K.lathe(prof, c, n, 24, ref=up)
    b.add(V, N, T, mat)
    right = np.cross(up, n)
    M = K.mat4_trs(np.asarray(c, float), np.stack([right, up, n], 1))
    b.extend(K.box_buf((-r * 1.25, -r * 0.16, 0.002), (r * 1.25, r * 0.16, 0.0075), mat, 0.0015, 1, xf=M))
    return b


def lid_hardware(name):
    """Hinges of the hood / boot lid (centre-less: built per side in the left half by the caller via both())."""
    b = K.Buf()
    return b


def mirror_mount_point():
    p, n = S.CT.to3d(np.array([[0.80, 0.772]]))
    return p[0], n[0]


# ============================================================================================ needles, wipers
def needle(g):
    """A tapered needle with a hub cap. Local frame: X = rest direction, Z = dial normal (towards the eye)."""
    r = g['r']
    L = r * 0.88
    w0 = 0.0028 if g['big'] else 0.002
    pts = np.array([(-0.012 if g['big'] else -0.006, -w0 * 0.8), (L, -0.0006), (L, 0.0006), (-0.012 if g['big'] else -0.006, w0 * 0.8)])
    V = np.array([(p[0], p[1], 0.0015) for p in pts])
    b = K.Buf()
    b.add(V, np.tile((0, 0, 1.0), (4, 1)), np.array([(0, 1, 2), (0, 2, 3)]), 'emit')
    V, N, T = K.lathe(np.array([(0.0, 0.004), (0.006 if g['big'] else 0.004, 0.003), (0.007 if g['big'] else 0.0045, 0.0)])[::-1], (0, 0, 0), (0, 0, 1), 16)
    b.add(V, N, T, 'trim')
    # world-space: the needle buf is built in local coordinates -> transform to world for obj_with_origin
    if 'scale_deg' in g:
        # the game's gauge shader paints a scale of scale_deg degrees from bottom left (210 deg for 240) round
        # over the top, clockwise as the driver sees it
        sc = float(g['scale_deg'])
        a0 = math.radians(90.0 + sc / 2.0)
        rest = math.cos(a0) * g['right'] + math.sin(a0) * g['up']
        full = -sc
    else:
        if g['big']:
            rest_ang = math.radians(135.0)
            full = -270.0
        else:
            rest_ang = math.radians(45.0)
            full = -90.0
        rest = math.sin(rest_ang) * g['right'] + math.cos(rest_ang) * g['up']
    R = K.frame_from(rest, g['normal'])
    Vw, Nw, Tw, Mw = b.arrays()
    out = K.Buf()
    out.add(Vw @ R.T + g['center'], Nw @ R.T, Tw, 'emit')
    out.M = list(Mw)
    info = dict(rest=rest, deg_full=full, axis_local='y', pivot=g['center'], normal=g['normal'])
    return out, info


def wiper(y_pivot, length):
    """Wiper arm + blade resting along the windscreen base, pointing to -Y. Local Z = glass normal."""
    zj = 0.93
    p = np.array([float(S.ws_x(abs(y_pivot), zj)) + 0.045, y_pivot, zj - 0.015])
    q, n = S.CT.to3d(np.array([[p[0], p[1]]]))
    p = q[0] + n[0] * 0.004
    nrm = K.unit(np.array([math.sin(S._WR), 0.0, math.cos(S._WR)]))
    rest = np.array([0.0, -1.0, 0.0])
    rest = K.unit(rest - nrm * np.dot(rest, nrm))
    R = K.frame_from(rest, nrm)
    b = K.Buf()
    # pivot cap
    V, N, T = K.lathe(np.array([(0.0, 0.026), (0.012, 0.024), (0.016, 0.012), (0.017, 0.0)])[::-1], (0, 0, 0), (0, 0, 1), 16)
    b.add(V, N, T, 'trim')
    # arm (a flat bar rising onto the glass) and blade
    arm = np.array([(0.0, 0.0, 0.022), (0.06, 0.0, 0.03), (length, 0.0, 0.03)])
    b.extend(K.tube_buf(arm, 0.0045, 'trim', 6))
    b.extend(K.box_buf((0.04, -0.008, 0.012), (length + 0.02, 0.008, 0.02), 'trim', 0.003, 1))
    b.extend(K.box_buf((0.03, -0.004, 0.0), (length + 0.03, 0.004, 0.012), 'rubber', 0.002, 1))
    Vw, Nw, Tw, Mw = b.arrays()
    out = K.Buf()
    out.add(Vw @ R.T + p, Nw @ R.T, Tw, 'trim')
    out.M = list(Mw)
    return out, dict(pivot=p, rot=R, normal=nrm, rest=rest, sweep_deg=-95.0, axis_local='y')


# ============================================================================================ mounts
def mounts(ex, panels, it):
    E = []
    hz = D['hub_z']
    for name, x, y, front, side in (('hub_FL', D['ax_f'], D['track_f'] / 2, True, -1), ('hub_FR', D['ax_f'], -D['track_f'] / 2, True, 1),
                                    ('hub_RL', D['ax_r'], D['track_r'] / 2, False, -1), ('hub_RR', D['ax_r'], -D['track_r'] / 2, False, 1)):
        E.append(mount(name, (x, y, hz), dict(cat='rim', axle='front' if front else 'rear', steer=front, driven=not front,
                                               handbrake=not front, side=side, hub_face=round(abs(y) + 0.010, 4), wheel_r=D['wheel_r'])))
    E.append(mount('engine', (1.30, 0.0, 0.195), dict(cat='engine', space_min=[-0.44, -0.30, 0.0], space_max=[0.40, 0.30, 0.66])))
    E.append(mount('gearbox', (0.60, 0.0, 0.30), dict(cat='gearbox', space_min=[-0.30, -0.13, 0.0], space_max=[0.24, 0.13, 0.22])))
    E.append(mount('radiator', (1.715, 0.0, 0.41), dict(cat='radiator', space_min=[-0.07, -0.34, 0.0], space_max=[0.035, 0.34, 0.40])))
    E.append(mount('battery', (1.52, 0.31, 0.555), dict(cat='battery', space_min=[-0.14, -0.10, 0.0], space_max=[0.14, 0.10, 0.24])))
    E.append(mount('fuelTank', (-1.70, 0.0, 0.205), dict(cat='fuelTank', space_min=[-0.26, -0.42, 0.0], space_max=[0.24, 0.42, 0.16])))
    E.append(mount('exhaust', (1.00, -0.14, 0.24), dict(cat='exhaust', tail=[-3.05, -0.26, -0.01], route='under floor, right of the tunnel')))
    p, d = IN.steering_mount()
    E.append(mount('steering', tuple(p), dict(cat='steering', column_deg=24.0), rot=K.frame_from(d, (math.sin(math.radians(24)), 0, math.cos(math.radians(24))))))
    # seat mounts at the floor attachment (the seat part's origin), floor_z repeated for the game
    for name, x, y, drv in (('seat_driver', IN.SEAT_X, IN.DRIVER_Y, True), ('seat_pass', IN.SEAT_X, -IN.DRIVER_Y, False), ('seat_rear', IN.REAR_SEAT_X, 0.0, False)):
        z = IN.FLOOR_Z + (0.035 if name != 'seat_rear' else 0.0)
        E.append(mount(name, (x, y, z), dict(cat='seat', driver=drv, floor_z=round(z, 4), cushion_z=0.48,
                                              side=0 if name == 'seat_rear' else (-1 if y > 0 else 1))))
    for pname, info in panels.items():
        if info['mount'] is None:
            continue
        m = info['mount']
        cat = 'door' if m.startswith('door') else m
        side = 0
        if m.startswith('door'):
            side = -1 if m.endswith('L') else 1
        E.append(mount(m, tuple(info['hinge_pos']), dict(cat=cat, panel=pname, hinge=info['hinge'], open_deg=info['open_deg'], side=side)))
    # bumpers (stretch: fit = [length, width, height], box centred on the mount)
    xb = float(S.front_x(0.0, 0.43))
    E.append(mount('bumperFront', (xb + 0.005, 0.0, 0.43), dict(cat='bumperFront', fit=[0.13, 1.66, 0.12])))
    xr = float(S.rear_x(0.0, 0.42))
    E.append(mount('bumperRear', (xr - 0.005, 0.0, 0.42), dict(cat='bumperRear', fit=[0.13, 1.66, 0.12])))
    c3, n3 = ex.lamp_mount
    for side, sname in ((1, 'L'), (-1, 'R')):
        E.append(mount('headlight_' + sname, (c3[0], side * c3[1], c3[2]), dict(cat='headlight', side=-side, recess='round', recess_d=D['lamp_d'], recess_depth=0.075)))
        tp, tn = ex.tail_mount
        E.append(mount('taillight_' + sname, (tp[0], side * tp[1], tp[2]), dict(cat='taillight', side=-side, recess='rect', recess_w=0.24, recess_h=0.125, recess_depth=0.045)))
        mp, mn = mirror_mount_point()
        E.append(mount('mirror_' + sname, (mp[0], side * mp[1], mp[2] + 0.02), dict(cat='mirror', side=-side)))
        E.append(mount('armor_' + sname, (-0.19, side * 0.835, 0.56), dict(cat='armor', side=-side, fit=[1.86, 0.05, 0.52], fit_anchor='center')))
    E.append(mount('roof', (-0.34, 0.0, 1.495), dict(cat='roof', fit=[1.40, 1.10, 0.15], fit_anchor='center')))
    E.append(mount('horn', (1.69, 0.30, 0.47), dict(cat='horn')))
    E.append(mount('radio', (IN.DASH_FACE_X, 0.0, 0.765), dict(cat='radio', slot=[0.18, 0.046], slot_depth=0.06)))
    E.append(mount('handbrake', (-0.06, 0.0, IN.tunnel_h(-0.06) + 0.055), dict(cat='handbrake')))
    E.append(mount('gearLever', (0.32, 0.0, IN.tunnel_h(0.32) + 0.067), dict(cat='gearLever')))
    p_, d_ = IN.steering_mount()
    pi_ = p_ + d_ * 0.12 + np.array([0.0, -0.043, 0.0])
    E.append(mount('ignition', tuple(pi_), dict(cat='ignition', on='steering column shroud, right side')))
    return E


def json_extra(objs, panels, needles, wipers, tris, total):
    ps = {}
    for name, info in panels.items():
        ps[name] = dict(mount=info['mount'], hinge=info['hinge'], hinge_pos=game_vec(info['hinge_pos']),
                        hinge_axis=game_vec(info['axis']), open_deg=info['open_deg'], glass=info.get('glass'))
    ns = {}
    for name, info in needles.items():
        ns[name] = dict(pivot=game_vec(info['pivot']), axis_local=info['axis_local'], axis=game_vec(info['normal']),
                        deg_full=info['deg_full'], rest='zero reading; positive angles turn counter-clockwise as seen by the driver')
    ws = {}
    for name, info in wipers.items():
        ws[name] = dict(pivot=game_vec(info['pivot']), axis_local=info['axis_local'], axis=game_vec(info['normal']),
                        sweep_deg=info['sweep_deg'])
    lo = np.full(3, 1e9)
    hi = np.full(3, -1e9)
    for o in objs:
        if o.type != 'MESH':
            continue
        for c in o.bound_box:
            w = o.matrix_world @ Vector(c)
            lo = np.minimum(lo, w)
            hi = np.maximum(hi, w)
    glo = game_vec(lo)
    ghi = game_vec(hi)
    bb = dict(min=[min(glo[0], ghi[0]), min(glo[1], ghi[1]), min(glo[2], ghi[2])], max=[max(glo[0], ghi[0]), max(glo[1], ghi[1]), max(glo[2], ghi[2])])
    eye = np.array(getattr(IN, 'EYE', (IN.SEAT_X - 0.06, IN.DRIVER_Y, 1.23)))
    eye = eye + (0.0, 0.0, -D.get('body_drop', 0.0))
    return dict(panels=ps, needles=ns, wipers=ws, eye_default=game_vec(eye), bbox=bb,
                triangles=dict(total=total, **tris), units='metres, game frame (+x forward, +y up, +z right)',
                notes='hinge: Blender-local axis name (z = vertical door hinge, y = transverse lid hinge); hinge_axis: '
                      'the same axis in the game frame; a rotation of open_deg about hinge_axis (right hand) opens the panel. '
                      'Needles and wipers turn about their local +y (game) = Blender local +Z.')


# ============================================================================================ previews
def previews(quick):
    PV.materials()
    PV.scene_setup('anime')
    res = (1280, 720)
    smp = 24 if quick else 48
    shots = [('f34', 35, 9, 7.6), ('r34', 145, 11, 7.6), ('side_l', 270, 2, 8.6), ('side_r', 90, 2, 8.6), ('front', 0, 4, 7.0), ('rear', 180, 6, 7.0)]
    for name, yaw, pitch, dist in shots:
        PV.orbit((0, 0, 0.70), yaw, pitch, dist, lens=50)
        PV.render(f'{SCRATCH}_{name}.png', res=res, samples=smp)
    PV.orbit((-0.1, 0, 0.6), 270, 89.5, 9, ortho=4.6)
    PV.render(f'{SCRATCH}_top.png', res=(1400, 720), samples=16)
    # driver's eye
    eye = Vector(IN.EYE) + Vector((0.0, 0.0, -D.get('body_drop', 0.0)))
    PV.camera(tuple(eye), tuple(eye + Vector((1.0, -0.02, -0.12))), lens=24)
    PV.render(f'{SCRATCH}_driver.png', res=res, samples=smp)
    # engine bay (hood hidden), panels removed
    def hide(names, h=True):
        for n in names:
            o = bpy.data.objects.get(n)
            if o:
                o.hide_render = h
                for c in o.children:
                    c.hide_render = h
    hide(['P_hood'])
    PV.camera((2.9, 1.1, 1.75), (1.25, 0.0, 0.62), lens=40)
    PV.render(f'{SCRATCH}_bay.png', res=res, samples=smp)
    hide(['P_hood'], False)
    for pn, cam in (('P_door_FL', ((0.4, 2.6, 1.15), (0.2, 0.4, 0.7))), ('P_door_RL', ((-0.8, 2.6, 1.15), (-0.7, 0.4, 0.7))),
                    ('P_trunk', ((-3.4, 1.3, 1.7), (-1.75, 0.0, 0.6)))):
        hide([pn])
        PV.camera(cam[0], cam[1], lens=40)
        PV.render(f'{SCRATCH}_open_{pn[2:]}.png', res=res, samples=smp)
        hide([pn], False)
    hide(['P_door_FL', 'P_door_RL', 'P_door_FR', 'P_door_RR', 'P_hood', 'P_trunk'])
    PV.orbit((0, 0, 0.7), 35, 12, 7.6, lens=50)
    PV.render(f'{SCRATCH}_stripped.png', res=res, samples=smp)
    hide(['P_door_FL', 'P_door_RL', 'P_door_FR', 'P_door_RR', 'P_hood', 'P_trunk'], False)
    g = bpy.data.objects.get('preview_ground')
    if g:
        g.hide_render = True
    PV.camera((2.2, -2.6, -1.6), (0.0, 0.0, 0.25), lens=35)
    PV.render(f'{SCRATCH}_under.png', res=res, samples=smp)
    if g:
        g.hide_render = False
