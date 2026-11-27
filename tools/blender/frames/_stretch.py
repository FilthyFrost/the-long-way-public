"""Lengthening a frame once it is built (docs/V3/plan/finish.md section 18: the campers to Nomad Drive's lengths, the
player's ask of 2026-11-26 - the Whale 1.2 m longer, the Old Elephant 1.5, the Camel 1.1, the Turtle 0.9 and 0.3 m
wider).

A frame is built as it was first drawn (frames/<id>.py and its _ext / _inner modules keep those numbers); then it is cut
across at a few places along its length and everything behind a cut is moved back by that cut's length, and, for a frame
made wider, everything out past a line along each side is moved out by half the widening. What spans a cut is drawn out
over the gap: a wall, a floor, a roof, a rail, a long window, a shelf. Every vertex is moved, none is scaled, so a
surface drawn out keeps its normals and the faces over the gap are the cut's own (a wall's straight run). The cuts are
placed where only such long, even pieces cross (harness: D:/cindy-scratch/finish/islands.mjs lists what crosses a
place). A piece that spans a cut but is short along it (a lamp, a hinge, a cushion, a hose), or one that only grazes it,
is moved whole with the side it mostly lies on, so that nothing small is ever drawn out.

Objects with origins of their own (doors, lids, the fuel flap, needles, wipers, the hubs' carriers, the Turtle's roof)
keep their origins where their pieces went: a hinge stays on its door. The mount empties, the panels' hinge positions,
the needles' and wipers' pivots, the elevating roof's pivots and the JSON's points and ranges (`eye_default`, `room`)
are moved by the same rules. Blender frame: +x forward, +y left, +z up (the game's x, -z, y)."""
import numpy as np

import bpy  # noqa: E402
from mathutils import Matrix, Vector  # noqa: E402

# per frame: its cuts across the length - (x of the cut in the frame as drawn, metres added there: everything behind it
# moves back so much) - and its widening - (|y| past which one moves out, metres added across: half to each side);
# `tol`: how far past a cut a long piece may reach and still be moved whole with its larger part
STRETCH = {
    # the Whale: behind the cab's seats, in front of the dinette's table and the shelves (0.75 m, the wheelbase); and
    # in the room's back between the galley's end and the bed, behind the rear wheels (0.45 m) - Nomad Drive's class C
    # has its rear overhang 0.56 of its wheelbase, the Whale's was 0.55 and is 0.56
    'rv': dict(cuts=((0.82, 0.75), (-2.42, 0.45))),
    # the Old Elephant: between the dinette's front bench (its back to the cab) and the fridge's cabinet - the corner
    # behind the driver, open floor, grows by 1.5 m; the long window over the dinette is drawn out
    'elephant': dict(cuts=((1.665, 1.5),)),
    # the Camel: behind its last window, in front of the emergency door - the back of the room
    'camel': dict(cuts=((-4.60, 1.1),)),
    # the Turtle: between the sliding door's front edge and the front doors' (the pillar there is drawn out); the
    # galley along the left wall, which reaches 8 cm past the cut, goes back whole with the door and the window over it.
    # Wider by 0.3 m out past 0.2 m either side of the middle: the seats, the wheel, the dials, the lamps, the wheels
    # move out with the sides; the dash, the floor, the roof, the bed and the glass are drawn out across the middle
    'turtle': dict(cuts=((0.72, 0.9),), widen=(0.2, 0.3), tol=0.1),
}
RIGID = 0.6    # a piece no longer than this along the cut's axis is moved whole
TOL = 0.02     # a piece reaching less than this past a cut is moved whole with its larger part
# objects whose origin is a hinge or a pivot: it goes where their pieces go
PIVOTED = ('P_', 'PG_', 'N_', 'WIPER_', 'FUEL_CAP', 'KNUCKLE_', 'POPUP_')


def spec(frame_id):
    return STRETCH.get(frame_id)


def shift_x(x, s):
    x = np.asarray(x, float)
    d = np.zeros_like(x)
    for at, dl in s['cuts']:
        d = d - np.where(x < at, dl, 0.0)
    return d


def shift_y(y, s):
    y = np.asarray(y, float)
    w = s.get('widen')
    if not w:
        return np.zeros_like(y)
    at, dw = w
    return np.where(np.abs(y) > at, np.sign(y) * 0.5 * dw, 0.0)


def point(p, s):
    """A point of the frame as drawn (Blender coordinates) where it is now."""
    p = np.asarray(p, float)
    return np.array([p[0] + float(shift_x(p[0], s)), p[1] + float(shift_y(p[1], s)), p[2]])


def piece(lo, hi, axis, s):
    """How a piece spanning [lo, hi] along x (axis 0) or y (axis 1) moves: one displacement for the whole of it, or
    None when it is drawn out (each of its points moved as a point)."""
    tol = s.get('tol', TOL)
    if axis == 0:
        planes = [at for at, _ in s['cuts']]
        f = lambda v: float(shift_x(v, s))  # noqa: E731
    else:
        w = s.get('widen')
        planes = [w[0], -w[0]] if w else []
        f = lambda v: float(shift_y(v, s))  # noqa: E731
    cross = [c for c in planes if lo < c < hi]
    if not cross or hi - lo <= RIGID or all(min(c - lo, hi - c) <= tol for c in cross):
        return f(0.5 * (lo + hi))
    return None


def islands(P, T):
    """Per vertex, the connected piece it is part of (vertices at one place - split by their normals - counted as one)."""
    if len(P) == 0:
        return np.zeros(0, np.int64)
    _, g = np.unique(np.round(P * 2e4).astype(np.int64), axis=0, return_inverse=True)
    g = g.reshape(-1)
    lab = np.arange(int(g.max()) + 1)
    if len(T):
        a, b, c = g[T[:, 0]], g[T[:, 1]], g[T[:, 2]]
        while True:
            m = np.minimum(np.minimum(lab[a], lab[b]), lab[c])
            new = lab.copy()
            np.minimum.at(new, a, m)
            np.minimum.at(new, b, m)
            np.minimum.at(new, c, m)
            new = new[new]
            if np.array_equal(new, lab):
                break
            lab = new
    return lab[g]


def displacement(P, T, s):
    """Each vertex's displacement (n, 3), its piece moved whole or drawn out."""
    lab = islands(P, T)
    uniq, inv = np.unique(lab, return_inverse=True)
    inv = inv.reshape(-1)
    k = len(uniq)
    lo = np.full((k, 3), np.inf)
    hi = np.full((k, 3), -np.inf)
    np.minimum.at(lo, inv, P)
    np.maximum.at(hi, inv, P)
    dx = np.empty(k)
    dy = np.empty(k)
    for i in range(k):
        r = piece(lo[i, 0], hi[i, 0], 0, s)
        dx[i] = np.nan if r is None else r
        r = piece(lo[i, 1], hi[i, 1], 1, s)
        dy[i] = np.nan if r is None else r
    DX = dx[inv]
    DY = dy[inv]
    DX = np.where(np.isnan(DX), shift_x(P[:, 0], s), DX)
    DY = np.where(np.isnan(DY), shift_y(P[:, 1], s), DY)
    return np.stack([DX, DY, np.zeros(len(P))], 1)


def _triangles(me):
    nl = len(me.loops)
    vi = np.empty(nl, np.int64)
    me.loops.foreach_get('vertex_index', vi)
    npoly = len(me.polygons)
    ls = np.empty(npoly, np.int64)
    lt = np.empty(npoly, np.int64)
    me.polygons.foreach_get('loop_start', ls)
    me.polygons.foreach_get('loop_total', lt)
    if npoly and (lt == 3).all():
        return vi.reshape(-1, 3)
    out = []
    for s0, n in zip(ls, lt):
        for j in range(1, n - 1):
            out.append((vi[s0], vi[s0 + j], vi[s0 + j + 1]))
    return np.array(out, np.int64).reshape(-1, 3)


def apply(frame_id, objs, empties, panels=None, infos=(), popups=None):
    """Stretch the built frame in place: its objects (meshes and their origins), its mount empties, and the hinge /
    pivot positions of panels, needles and wipers (infos: dicts name -> info with 'pivot') and popups."""
    s = spec(frame_id)
    if s is None:
        return
    meshes = [o for o in objs if o.type == 'MESH']
    plan = {}
    for o in meshes:
        me = o.data
        W = np.array(o.matrix_world)
        org = W[:3, 3].copy()
        nv = len(me.vertices)
        if nv == 0:
            d = point(org, s) - org
            plan[o.name] = (o, W, None, None, d)
            continue
        co = np.empty(nv * 3)
        me.vertices.foreach_get('co', co)
        P = co.reshape(-1, 3) @ W[:3, :3].T + W[:3, 3]
        D = displacement(P, _triangles(me), s)
        if np.abs(D - D[0]).max() < 1e-9:
            plan[o.name] = (o, W, None, None, D[0].copy())      # moved whole: its origin with it
        else:
            d = point(org, s) - org if o.name.startswith(PIVOTED) else np.zeros(3)
            plan[o.name] = (o, W, P, D, d)
    # origins: parents before their children (a child set after its parent's new place is known)
    depth = lambda o: 0 if o.parent is None else 1 + depth(o.parent)  # noqa: E731
    for o in sorted(meshes, key=depth):
        _, W, _, _, d = plan[o.name]
        M = Matrix(W.tolist())
        M.translation = Vector(W[:3, 3] + d)
        o.matrix_world = M
        bpy.context.view_layer.update()
    # the pieces of the objects drawn out: their vertices anew in their objects' frames, their normals kept
    for name, (o, W, P, D, d) in plan.items():
        if P is None:
            continue
        me = o.data
        nl = np.empty(len(me.loops) * 3)
        me.corner_normals.foreach_get('vector', nl)
        Wn = np.array(o.matrix_world)
        Q = (P + D - Wn[:3, 3]) @ np.linalg.inv(Wn[:3, :3]).T
        me.vertices.foreach_set('co', Q.astype(np.float32).ravel())
        me.update()
        me.normals_split_custom_set([tuple(v) for v in nl.reshape(-1, 3)])
    for e in empties:
        m = e.matrix_world.copy()
        m.translation = Vector(point(np.array(m.translation), s))
        e.matrix_world = m
    bpy.context.view_layer.update()
    by = {o.name: o for o in objs}
    for name, info in (panels or {}).items():
        if name in by:
            info['hinge_pos'] = np.array(by[name].matrix_world.translation)
    for group in infos:
        for name, info in group.items():
            if name in by and 'pivot' in info:
                info['pivot'] = np.array(by[name].matrix_world.translation)
    for name, info in (popups or {}).items():
        if name in by:
            info['pivot'] = np.array(by[name].matrix_world.translation)
        b = info.get('bellows')
        if b in by:
            info['bellows_at'] = np.array(by[b].matrix_world.translation)


def buf(frame_id, b):
    """A K.Buf of the frame as drawn (Blender coordinates), its pieces moved as the frame's (a copy)."""
    from frames import _kit as K
    s = spec(frame_id)
    if s is None or not b.V:
        return b
    V, N, T, M = b.arrays()
    out = K.Buf()
    out.add(V + displacement(V, T, s), N, T, 'paint', uv=b.uv_array() if b.has_uv() else None)
    out.M = list(M)
    return out


def box(frame_id, lo, hi):
    """An axis-aligned box of the frame as drawn (Blender coordinates; an AO bake's region) where it is now."""
    s = spec(frame_id)
    if s is None:
        return lo, hi
    a = point(np.array(lo, float), s)
    b = point(np.array(hi, float), s)
    return tuple(np.minimum(a, b)), tuple(np.maximum(a, b))


# ---------------------------------------------------------------------------------------------------- the JSON
def _game_range(v, axis, s):
    """[a, b] along the game's x (axis 'x') or z (axis 'z' = -Blender y), as a piece: moved whole or drawn out."""
    a, b = float(v[0]), float(v[1])
    if axis == 'x':
        d = piece(min(a, b), max(a, b), 0, s)
        if d is None:
            return [round(a + float(shift_x(a, s)), 4), round(b + float(shift_x(b, s)), 4)]
        return [round(a + d, 4), round(b + d, 4)]
    d = piece(min(-a, -b), max(-a, -b), 1, s)
    if d is None:
        return [round(a - float(shift_y(-a, s)), 4), round(b - float(shift_y(-b, s)), 4)]
    return [round(a - d, 4), round(b - d, 4)]


def _room(r, s):
    out = {}
    for k, v in r.items():
        if isinstance(v, dict):
            out[k] = _room(v, s)
        elif k == 'x' or k.endswith('_x') and isinstance(v, list):
            if v and isinstance(v[0], list):
                out[k] = [_game_range(u, 'x', s) for u in v]
            elif isinstance(v, list):
                out[k] = _game_range(v, 'x', s)
            else:
                out[k] = v
        elif k.endswith('_x'):
            out[k] = round(float(v) + float(shift_x(float(v), s)), 4)
        elif k == 'z' or k.endswith('_z'):
            out[k] = _game_range(v, 'z', s) if isinstance(v, list) else v
        elif k == 'z_in':
            out[k] = round(float(v) + float(abs(shift_y(float(v), s))), 4)
        else:
            out[k] = v
    return out


def map_json(frame_id, out):
    """The frame's JSON extras (game frame) moved as the frame: the driver's eye, the room's plan. (The panels', needles',
    wipers' and popups' positions come from their objects; the bounding box from the meshes.)"""
    s = spec(frame_id)
    if s is None:
        return out
    if 'eye_default' in out:
        x, y, z = out['eye_default']
        q = point(np.array([x, -z, y]), s)
        out['eye_default'] = [round(float(q[0]), 5), round(float(y), 5), round(float(-q[1]), 5)]
    if 'room' in out:
        out['room'] = _room(out['room'], s)
    out['stretch'] = dict(cuts=[[at, dl] for at, dl in s['cuts']], widen=list(s['widen']) if s.get('widen') else None,
                          note='the frame as first drawn, cut across at x and lengthened by the second number behind '
                               'each cut; widened past |z| by the second number across (tools/blender/frames/_stretch.py)')
    return out
