"""
The starting workshop's building (docs/MODCAR.md section 9): a timber-framed shed on a concrete slab,
board-and-batten walls painted an old barn red outside and left bare inside, a corrugated tin roof on
king-post trusses with two clear skylight sheets, windows with six panes, and the big sliding doors on
a track along the front, facing the road.

Game frame (see _kit.py): x towards the door, y up, z right; inner faces of the walls at x = +-7 and
z = +-5, floor at y = 0.
"""

import math

import bmesh
from mathutils import Matrix, Vector

V = Vector

# ---------------------------------------------------------------------------------------------- dimensions
X0, X1 = -7.0, 7.0          # back and front walls (inner faces)
Z0, Z1 = -5.0, 5.0          # left and right walls (inner faces)
EAVE = 3.9                  # top of the top plate
PITCH = math.tan(math.radians(24.0))
SEAT = 4.05                 # underside of the roof sheets over the wall line
BOARD_T = 0.025             # wall boards
BATTEN_T = 0.02
PLINTH = 0.28               # concrete curb under the boards
DOOR_Z = 2.3                # half width of the door opening
WAINSCOT = 1.13             # the inside painted up to here (the girt at 1.2 is its rail)
DOOR_H = 3.35
POSTS_X = [-7.0, -4.667, -2.333, 0.0, 2.333, 4.667, 7.0]
OVERHANG_EAVE = 0.45
OVERHANG_GABLE = 0.35

# windows: (wall, centre along it, sill, width, height); walls 'L' (z = -5), 'R' (z = +5), 'B' (x = -7)
WINDOWS = [
    ('R', -3.5, 1.55, 1.5, 1.05),
    ('R', -1.167, 1.55, 1.5, 1.05),
    ('R', 3.5, 1.55, 1.5, 1.05),
    ('L', -1.167, 1.3, 1.6, 1.0),
    ('L', 3.5, 1.3, 1.5, 1.0),
    ('B', 2.6, 1.45, 1.2, 0.95),
]
# clear roof sheets on the right (sunny) slope: (x0, x1, z0, z1) on the plan
SKYLIGHTS = [(-4.25, -3.05, 1.2, 3.6), (1.75, 2.95, 1.2, 3.6)]


def roof_under(z):
    """underside of the roof sheets above plan position z (inside the walls; the ridge at z = 0)"""
    return SEAT + (Z1 - abs(z)) * PITCH


# ---------------------------------------------------------------------------------------------- helpers

def hexa(K, mat, c, bev=0.0, tint=1.0, faces_mat=None, mover=None, cast=None):
    """
    A six-sided solid from its 8 corners (game frame): c = [b0, b1, b2, b3, t0, t1, t2, t3], bottom
    ring and top ring in the same order. faces_mat(normal) picks a material per face.
    """
    bm = bmesh.new()
    vs = [bm.verts.new(V(p)) for p in c]
    b0, b1, b2, b3, t0, t1, t2, t3 = vs
    for f in ((b0, b3, b2, b1), (t0, t1, t2, t3), (b0, b1, t1, t0), (b1, b2, t2, t1), (b2, b3, t3, t2), (b3, b0, t0, t3)):
        try:
            bm.faces.new(f)
        except ValueError:
            pass
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    K._cast(mat, bm, None, cast, mover)
    K._bevel(bm, bev)
    K._shade(bm, False)
    fm = None
    if faces_mat:
        bm.normal_update()
        bm.faces.index_update()
        normals = {f.index: f.normal.copy() for f in bm.faces}
        fm = lambda f: faces_mat(normals[f.index])
    K._pour(bm, mat, tint, mover, fm)


def spans(lo, hi, holes):
    """the parts of [lo, hi] not inside any (a, b) hole"""
    out = [(lo, hi)]
    for (a, b) in holes:
        nxt = []
        for (s, e) in out:
            if b <= s or a >= e:
                nxt.append((s, e))
                continue
            if a > s:
                nxt.append((s, a))
            if b < e:
                nxt.append((b, e))
        out = nxt
    return [(s, e) for (s, e) in out if e - s > 0.02]


def warm(K, amount=0.07):
    """a per-board tint: a little lighter or darker, a little warmer or cooler"""
    k = 1.0 + K.jitter(amount)
    w = K.jitter(amount * 0.5)
    return (k * (1 + w), k, k * (1 - w))


# ---------------------------------------------------------------------------------------------- walls

def board_wall(K, wall, a0, a1, y0, top, holes, board=0.24, paint=None):
    """
    Vertical boards along one wall between a0 and a1 (plan coordinate along the wall) from y0 to
    top(a) (a function: gables slope), skipping holes [(a, b, y0, y1)]. Outside faces are painted
    siding, the rest bare boards; battens over every joint outside. paint = the height the inside is
    painted to (a faded wainscot under the girt), or None.
      wall 'L': z = Z0 (outside -z) · 'R': z = Z1 (outside +z) · 'B': x = X0 (outside -x) · 'F': x = X1
    """
    if wall in ('L', 'R'):
        s = -1 if wall == 'L' else 1
        base = Z1 if wall == 'R' else Z0

        def P(a, y, d):  # d = depth outwards from the inner face
            return (a, y, base + s * d)
        out_n = V((0, 0, s))
    else:
        s = -1 if wall == 'B' else 1
        base = X0 if wall == 'B' else X1

        def P(a, y, d):
            return (base + s * d, y, a)
        out_n = V((s, 0, 0))
    n = max(1, int(round((a1 - a0) / board)))
    w = (a1 - a0) / n
    for i in range(n):
        ba = a0 + i * w + 0.003
        bb = a0 + (i + 1) * w - 0.003
        mid = (ba + bb) / 2
        # every so often a board was replaced and never painted
        bare = K.rng.random() < 0.06
        col_holes = [(h[2], h[3]) for h in holes if h[0] < bb and h[1] > ba]
        for (ys0, ye0) in spans(y0, max(top(ba), top(bb)), col_holes):
            # (the painted foot of the board and the bare rest of it, as two pieces)
            pieces = [(ys0, ye0, False)]
            if paint and ys0 < paint < ye0:
                pieces = [(ys0, paint, True), (paint, ye0, False)]
            elif paint and ye0 <= paint:
                pieces = [(ys0, ye0, True)]
            for (ys, ye, painted) in pieces:
                yta = min(ye, top(ba))
                ytb = min(ye, top(bb))
                c = [P(ba, ys, 0), P(bb, ys, 0), P(bb, ys, BOARD_T), P(ba, ys, BOARD_T),
                     P(ba, yta, 0), P(bb, ytb, 0), P(bb, ytb, BOARD_T), P(ba, yta, BOARD_T)]
                tint = warm(K)
                inner = 'wainscot' if painted and not bare else None
                fm = (lambda nrm, inner=inner: ('boards' if bare else 'siding') if nrm.dot(out_n) > 0.7 else (inner if nrm.dot(out_n) < -0.7 else None))
                hexa(K, 'boards', c, bev=0.004, tint=tint, faces_mat=fm)
        # the batten over the joint after this board (outside)
        if i < n - 1:
            ja = a0 + (i + 1) * w
            for (ys, ye) in spans(y0, top(ja), [(h[2], h[3]) for h in holes if h[0] < ja + 0.04 and h[1] > ja - 0.04]):
                c = [P(ja - 0.03, ys, BOARD_T), P(ja + 0.03, ys, BOARD_T), P(ja + 0.03, ys, BOARD_T + BATTEN_T), P(ja - 0.03, ys, BOARD_T + BATTEN_T),
                     P(ja - 0.03, ye - 0.01, BOARD_T), P(ja + 0.03, ye - 0.01, BOARD_T), P(ja + 0.03, ye - 0.01, BOARD_T + BATTEN_T), P(ja - 0.03, ye - 0.01, BOARD_T + BATTEN_T)]
                hexa(K, 'siding', c, bev=0.004, tint=warm(K, 0.04))
        del mid


def frame_box(K, mat, x0, x1, y0, y1, z0, z1, bev=0.012, tint=None, mover=None, seg=0.6):
    K.box(mat, ((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2), (x1 - x0, y1 - y0, z1 - z0), bev=bev,
          tint=tint if tint is not None else warm(K, 0.05), mover=mover, seg=seg)


def window(K, wall, c, sill, w, h):
    """frame, six panes, a deep sill inside and cream trim outside; returns the opening (for the light)"""
    t = BOARD_T
    if wall in ('L', 'R'):
        s = -1 if wall == 'L' else 1
        base = Z1 if wall == 'R' else Z0

        def B(a0, a1, y0, y1, d0, d1, mat, bev=0.006):
            z0, z1 = sorted((base + s * d0, base + s * d1))
            frame_box(K, mat, a0, a1, y0, y1, z0, z1, bev=bev, seg=None)
    else:
        s = -1 if wall == 'B' else 1
        base = X0 if wall == 'B' else X1

        def B(a0, a1, y0, y1, d0, d1, mat, bev=0.006):
            x0, x1 = sorted((base + s * d0, base + s * d1))
            frame_box(K, mat, x0, x1, y0, y1, a0, a1, bev=bev, seg=None)
    a0, a1 = c - w / 2, c + w / 2
    y0, y1 = sill, sill + h
    f = 0.055
    # the frame (in the wall's thickness, a little proud inside)
    B(a0 - f, a0, y0, y1, -0.05, t, 'timber')
    B(a1, a1 + f, y0, y1, -0.05, t, 'timber')
    B(a0 - f, a1 + f, y1, y1 + f, -0.05, t, 'timber')
    # the sill inside: deep enough for a pot or two
    B(a0 - f - 0.06, a1 + f + 0.06, y0 - 0.045, y0, -0.2, t + 0.04, 'timber', bev=0.008)
    # sash: muntins 2 x 3
    m = 0.028
    mid = t * 0.5
    for k in (1, 2):
        aa = a0 + w * k / 3
        B(aa - m / 2, aa + m / 2, y0, y1, mid - 0.015, mid + 0.015, 'g_trim', bev=0.003)
    yy = (y0 + y1) / 2
    B(a0, a1, yy - m / 2, yy + m / 2, mid - 0.015, mid + 0.015, 'g_trim', bev=0.003)
    B(a0, a1, y0, y0 + 0.035, mid - 0.018, mid + 0.018, 'g_trim', bev=0.003)
    B(a0, a1, y1 - 0.035, y1, mid - 0.018, mid + 0.018, 'g_trim', bev=0.003)
    B(a0, a0 + 0.035, y0, y1, mid - 0.018, mid + 0.018, 'g_trim', bev=0.003)
    B(a1 - 0.035, a1, y0, y1, mid - 0.018, mid + 0.018, 'g_trim', bev=0.003)
    # the glass (one sheet; the muntins sit on it)
    B(a0, a1, y0, y1, mid - 0.002, mid + 0.002, 'win_glass', bev=0.0)
    # trim outside: a casing round it and a drip cap on top
    o = t + BATTEN_T
    tw = 0.09
    B(a0 - f - tw, a0 - f, y0 - 0.06, y1 + f + tw, o - 0.005, o + 0.022, 'g_trim', bev=0.004)
    B(a1 + f, a1 + f + tw, y0 - 0.06, y1 + f + tw, o - 0.005, o + 0.022, 'g_trim', bev=0.004)
    B(a0 - f - tw - 0.03, a1 + f + tw + 0.03, y1 + f + tw, y1 + f + tw + 0.05, o - 0.005, o + 0.05, 'g_trim', bev=0.004)
    B(a0 - f - tw, a1 + f + tw, y0 - 0.1, y0 - 0.06, o - 0.005, o + 0.07, 'g_trim', bev=0.004)
    # the opening the room light comes through (inner face, room side)
    if wall in ('L', 'R'):
        zf = base
        return {'a': [a0, y0, zf], 'u': [w, 0, 0], 'v': [0, h, 0]}
    xf = base
    return {'a': [xf, y0, a0], 'u': [0, 0, w], 'v': [0, h, 0]}


def build(K, L):
    """the building; fills the layout L with the room, its openings, the walls as solids"""
    holes_L = [(c - w / 2 - 0.06, c + w / 2 + 0.06, s - 0.05, s + h + 0.06) for (wl, c, s, w, h) in WINDOWS if wl == 'L']
    holes_R = [(c - w / 2 - 0.06, c + w / 2 + 0.06, s - 0.05, s + h + 0.06) for (wl, c, s, w, h) in WINDOWS if wl == 'R']
    holes_B = [(c - w / 2 - 0.06, c + w / 2 + 0.06, s - 0.05, s + h + 0.06) for (wl, c, s, w, h) in WINDOWS if wl == 'B']
    eave = lambda a: EAVE + 0.15
    gable = lambda a: roof_under(a) + 0.02

    # ---- the slab
    K.grid('floor', (0, 0, 0), (14.5, 10.5), 0.2)
    # its edge outside (the slab stands a hand above the meadow)
    K.box('plinth', (0, -0.16, 0), (14.5, 0.32, 10.5), bev=0.01, open='+y', seg=1.5)

    # ---- curbs under the walls (concrete, a ledge inside and out)
    K.box('plinth', (0, PLINTH / 2, Z0 - 0.09), (14.36, PLINTH, 0.24), bev=0.012, seg=0.8)
    K.box('plinth', (0, PLINTH / 2, Z1 + 0.09), (14.36, PLINTH, 0.24), bev=0.012, seg=0.8)
    K.box('plinth', (X0 - 0.09, PLINTH / 2, 0), (0.24, PLINTH, 9.96), bev=0.012, seg=0.8)
    for (za, zb) in ((Z0 + 0.03, -DOOR_Z - 0.18), (DOOR_Z + 0.18, Z1 - 0.03)):
        K.box('plinth', (X1 + 0.09, PLINTH / 2, (za + zb) / 2), (0.24, PLINTH, zb - za), bev=0.012, seg=0.8)

    # ---- boards
    board_wall(K, 'L', X0 - 0.02, X1 + 0.02, PLINTH, eave, holes_L, paint=WAINSCOT)
    board_wall(K, 'R', X0 - 0.02, X1 + 0.02, PLINTH, eave, holes_R, paint=WAINSCOT)
    board_wall(K, 'B', Z0, Z1, PLINTH, lambda a: max(eave(a), gable(a)), holes_B, paint=WAINSCOT)
    # the front: beside the door, and the gable over it
    board_wall(K, 'F', Z0, -DOOR_Z - 0.18, PLINTH, eave, [], paint=WAINSCOT)
    board_wall(K, 'F', DOOR_Z + 0.18, Z1, PLINTH, eave, [], paint=WAINSCOT)
    board_wall(K, 'F', -DOOR_Z - 0.18, DOOR_Z + 0.18, DOOR_H + 0.25, lambda a: max(eave(a), gable(a)), [(-0.5, 0.5, 4.45, 5.4)])
    board_wall(K, 'F', Z0, -DOOR_Z - 0.18, EAVE + 0.15, gable, [])
    board_wall(K, 'F', DOOR_Z + 0.18, Z1, EAVE + 0.15, gable, [])

    # ---- the frame: posts, girts, top plates
    for x in POSTS_X:
        xa = max(X0, min(X1 - 0.16, x - 0.08))
        for z in (Z0, Z1 - 0.16):
            frame_box(K, 'timber', xa, xa + 0.16, PLINTH, EAVE, z, z + 0.16)
    for z in (-2.5, 0.0, 2.5):
        frame_box(K, 'timber', X0, X0 + 0.16, PLINTH, EAVE, z - 0.08, z + 0.08)
    # door jambs and the header
    for z in (-DOOR_Z - 0.18, DOOR_Z):
        frame_box(K, 'timber', X1 - 0.18, X1, 0.0, EAVE, z, z + 0.18)
    frame_box(K, 'timber', X1 - 0.2, X1, DOOR_H, DOOR_H + 0.25, -DOOR_Z - 0.18, DOOR_Z + 0.18)
    for z in (-3.6,):
        frame_box(K, 'timber', X1 - 0.16, X1, PLINTH, EAVE, z - 0.08, z + 0.08)
    frame_box(K, 'timber', X1 - 0.16, X1, PLINTH, EAVE, 3.52, 3.68)
    # girts (horizontal rails the boards are nailed to), cut at the windows
    for (wall, zf) in (('L', Z0), ('R', Z1 - 0.12)):
        holes = holes_L if wall == 'L' else holes_R
        for gy in (1.2, 2.55):
            for (a, b) in spans(X0 + 0.16, X1 - 0.16, [(h[0], h[1]) for h in holes if h[2] < gy + 0.08 and h[3] > gy]):
                frame_box(K, 'timber', a, b, gy - 0.07, gy + 0.07, zf, zf + 0.12, bev=0.01)
        frame_box(K, 'timber', X0, X1, EAVE - 0.16, EAVE, zf - 0.04, zf + 0.12)
    for gy in (1.2, 2.55):
        for (a, b) in spans(Z0 + 0.16, Z1 - 0.16, [(h[0], h[1]) for h in holes_B if h[2] < gy + 0.08 and h[3] > gy]):
            frame_box(K, 'timber', X0, X0 + 0.12, gy - 0.07, gy + 0.07, a, b, bev=0.01)
        for (a, b) in ((Z0 + 0.16, -DOOR_Z - 0.18), (DOOR_Z + 0.18, Z1 - 0.16)):
            frame_box(K, 'timber', X1 - 0.12, X1, gy - 0.07, gy + 0.07, a, b, bev=0.01)
    frame_box(K, 'timber', X0, X0 + 0.16, EAVE - 0.16, EAVE, Z0, Z1)
    frame_box(K, 'timber', X1 - 0.16, X1, EAVE - 0.16, EAVE, Z0, Z1)

    # ---- trusses: a tie beam, two rafters, a king post and two struts; purlins and a ridge beam
    truss_x = [-4.667, -2.333, 0.0, 2.333, 4.667]
    for x in truss_x:
        frame_box(K, 'timber', x - 0.07, x + 0.07, EAVE - 0.1, EAVE + 0.12, Z0, Z1, bev=0.012)
        for s in (-1, 1):
            # rafter from the wall top to the ridge (its top under the sheets)
            za, zb = s * (Z1 + 0.05), 0.0
            ya, yb = roof_under(za) - 0.02, roof_under(0) - 0.02
            d = 0.17
            c = [(x - 0.05, ya - d, za), (x + 0.05, ya - d, za), (x + 0.05, yb - d, zb), (x - 0.05, yb - d, zb),
                 (x - 0.05, ya, za), (x + 0.05, ya, za), (x + 0.05, yb, zb), (x - 0.05, yb, zb)]
            hexa(K, 'timber', c, bev=0.01, tint=warm(K, 0.05))
            # strut from the foot of the king post to the middle of the rafter
            zm = s * 2.6
            ym = roof_under(zm) - 0.17
            K.tube('timber', [(x, EAVE + 0.1, s * 0.06), (x, ym, zm)], 0.05, segs=6, tint=warm(K, 0.05))
        frame_box(K, 'timber', x - 0.06, x + 0.06, EAVE + 0.1, roof_under(0) - 0.04, -0.06, 0.06, bev=0.01)
    # purlins along the length, on the rafters
    for s in (-1, 1):
        for k in range(5):
            z = s * (0.35 + k * 1.15)
            y = roof_under(z) - 0.02
            K.box('timber', (0, y - 0.06, z), (X1 - X0 + 2 * OVERHANG_GABLE - 0.1, 0.12, 0.08), rot=(s * -24.0, 0, 0), bev=0.01, seg=0.7, tint=warm(K, 0.05))
    K.box('timber', (0, roof_under(0) - 0.09, 0), (X1 - X0 + 2 * OVERHANG_GABLE - 0.1, 0.18, 0.1), bev=0.012, seg=0.7)

    # ---- the roof: corrugated sheets (an inside and an outside face), skylights left out
    corrugated_roof(K)

    # ---- windows
    openings = []
    for (wl, c, s, w, h) in WINDOWS:
        o = window(K, wl, c, s, w, h)
        o['id'] = f'win_{wl}{c:+.1f}'
        o['sky'] = 0.62
        openings.append(o)
    # a round window in the front gable, a vent in the back one
    round_window(K, 4.92, 0.42)
    for (x0, x1, z0, z1) in SKYLIGHTS:
        za, zb = z0, z1
        ya, yb = roof_under(za), roof_under(zb)
        openings.append({'id': f'sky_{x0:+.1f}', 'a': [x0, ya, za], 'u': [x1 - x0, 0, 0], 'v': [0, yb - ya, zb - za], 'sky': 1.0})

    # ---- outside trim: corner boards, fascia boards along the eaves and the gables
    for (x, z) in ((X0, Z0), (X0, Z1), (X1, Z0), (X1, Z1)):
        sx = -1 if x < 0 else 1
        sz = -1 if z < 0 else 1
        o = BOARD_T + BATTEN_T
        K.box('g_trim', (x + sx * (o + 0.012), (PLINTH + EAVE + 0.15) / 2, z - sz * 0.05), (0.024, EAVE + 0.15 - PLINTH, 0.14), bev=0.005)
        K.box('g_trim', (x - sx * 0.05, (PLINTH + EAVE + 0.15) / 2, z + sz * (o + 0.012)), (0.14, EAVE + 0.15 - PLINTH, 0.024), bev=0.005)
    for s in (-1, 1):
        z = s * (Z1 + OVERHANG_EAVE)
        y = roof_under(Z1 + OVERHANG_EAVE) - 0.06
        K.box('g_trim', (0, y, z), (X1 - X0 + 2 * OVERHANG_GABLE, 0.2, 0.03), bev=0.005, seg=1.0)
    for x in (X0 - OVERHANG_GABLE + 0.02, X1 + OVERHANG_GABLE - 0.02):
        for s in (-1, 1):
            za, zb = s * (Z1 + OVERHANG_EAVE), 0.0
            ya, yb = roof_under(za) + 0.03, roof_under(0) + 0.03
            c = [(x - 0.015, ya - 0.2, za), (x + 0.015, ya - 0.2, za), (x + 0.015, yb - 0.2, zb), (x - 0.015, yb - 0.2, zb),
                 (x - 0.015, ya, za), (x + 0.015, ya, za), (x + 0.015, yb, zb), (x - 0.015, yb, zb)]
            hexa(K, 'g_trim', c, bev=0.004)

    # ---- layout: the room (a little into the walls), the openings, the walls as solids
    L['room'] = {'min': [X0 - 0.06, -0.3, Z0 - 0.06], 'max': [X1 + 0.06, roof_under(0) + 0.05, Z1 + 0.06], 'edge': 0.05}
    L['openings'] = openings
    L['door'] = {'x': X1, 'z': DOOR_Z, 'h': DOOR_H}
    solids = L.setdefault('solids', [])
    # [x, z, hx, hz, y0, y1, floor]
    solids += [
        [0, Z0 - 0.06, 7.3, 0.08, 0, EAVE + 0.2, 0],
        [0, Z1 + 0.06, 7.3, 0.08, 0, EAVE + 0.2, 0],
        [X0 - 0.06, 0, 0.08, 5.1, 0, EAVE + 0.2, 0],
        [X1 + 0.04, (Z0 + -DOOR_Z) / 2, 0.08, (-DOOR_Z - Z0) / 2, 0, EAVE + 0.2, 0],
        [X1 + 0.04, (Z1 + DOOR_Z) / 2, 0.08, (Z1 - DOOR_Z) / 2, 0, EAVE + 0.2, 0],
    ]
    return openings


def corrugated_roof(K):
    """two slopes of corrugated tin (waves along the slope), cut round the skylights, which get clear sheets"""
    xa, xb = X0 - OVERHANG_GABLE, X1 + OVERHANG_GABLE
    pitch_wave = 0.13
    amp = 0.014
    for s in (-1, 1):
        zr0, zr1 = 0.0, Z1 + OVERHANG_EAVE
        # rows of sheets along x: cut by the skylights on the right slope
        holes = [(x0, x1) for (x0, x1, z0, z1) in SKYLIGHTS] if s > 0 else []
        xs = []
        cur = xa
        for (h0, h1) in sorted(holes):
            xs.append((cur, h0, 'tin'))
            xs.append((h0, h1, 'sky'))
            cur = h1
        xs.append((cur, xb, 'tin'))
        for (x0, x1, kind) in xs:
            if kind == 'tin':
                sheet(K, s, x0, x1, zr0, zr1, pitch_wave, amp, 'tin_out', 'tin_in')
            else:
                # the skylight's own strip: tin below and above it, the clear sheet between
                for (x0s, x1s, z0s, z1s) in SKYLIGHTS:
                    if abs(x0s - x0) < 1e-6:
                        sheet(K, s, x0, x1, zr0, z0s, pitch_wave, amp, 'tin_out', 'tin_in')
                        sheet(K, s, x0, x1, z0s, z1s, pitch_wave, amp, 'skylight', 'skylight')
                        sheet(K, s, x0, x1, z1s, zr1, pitch_wave, amp, 'tin_out', 'tin_in')
    # ridge cap
    for s in (-1, 1):
        c = [(xa, roof_under(0) + 0.03, 0), (xb, roof_under(0) + 0.03, 0), (xb, roof_under(s * 0.28) + 0.03, s * 0.28), (xa, roof_under(s * 0.28) + 0.03, s * 0.28),
             (xa, roof_under(0) + 0.06, 0), (xb, roof_under(0) + 0.06, 0), (xb, roof_under(s * 0.28) + 0.06, s * 0.28), (xa, roof_under(s * 0.28) + 0.06, s * 0.28)]
        hexa(K, 'tin_out', c, bev=0.0, tint=0.9)


def sheet(K, s, x0, x1, z0, z1, pitch_wave, amp, mat_out, mat_in):
    """
    One strip of corrugated sheets on slope s between plan z0 and z1 (|z|), x0..x1: laid as sheets about
    0.86 m wide, each its own shade of grey — a few gone rusty, the odd newer one brighter. Two faces,
    the waves along x outside, flat underneath.
    """
    k = max(1, int(round((x1 - x0) / 0.86)))
    w = (x1 - x0) / k
    m = max(1, int(round((z1 - z0) / 0.9)))
    clear = mat_out == 'skylight'
    for q in range(k):
        xa = x0 + q * w
        xb = xa + w
        n = max(2, int(round(w / (pitch_wave / 4))))
        bm_o = bmesh.new()
        bm_i = bmesh.new()
        rows_o = []
        rows_i = []
        for j in range(m + 1):
            zz = s * (z0 + (z1 - z0) * j / m)
            y = roof_under(zz)
            rows_i.append([bm_i.verts.new((xa, y + 0.004, zz)), bm_i.verts.new((xb, y + 0.004, zz))])
            ro = []
            for i in range(n + 1):
                x = xa + w * i / n
                wv = amp * math.sin(TWO_PI * (x - X0) / pitch_wave)
                ro.append(bm_o.verts.new((x, y + 0.012 + wv, zz)))
            rows_o.append(ro)
        # (the underside is drawn flat: its ribs at this pitch would only shimmer from the floor)
        for j in range(m):
            for i in range(n):
                bm_o.faces.new((rows_o[j][i], rows_o[j][i + 1], rows_o[j + 1][i + 1], rows_o[j + 1][i]))
            bm_i.faces.new((rows_i[j][0], rows_i[j + 1][0], rows_i[j + 1][1], rows_i[j][1]))
        # outside faces up, inside faces down
        for f in bm_o.faces:
            f.normal_update()
            if f.normal.y < 0:
                f.normal_flip()
        for f in bm_i.faces:
            f.normal_update()
            if f.normal.y > 0:
                f.normal_flip()
        for bm in (bm_o, bm_i):
            for f in bm.faces:
                f.smooth = True
        t = 1.0 + K.jitter(0.07)
        tint_o = (t, t, t)
        tint_i = (t, t, t)
        if not clear:
            r = K.rng.random()
            if r < 0.14:
                # gone rusty, worse outside
                tint_o = (t * 1.16, t * 0.84, t * 0.64)
                tint_i = (t * 1.06, t * 0.92, t * 0.8)
            elif r < 0.22:
                # a newer sheet put in after a storm
                tint_o = (t * 1.14, t * 1.14, t * 1.16)
                tint_i = (t * 1.1, t * 1.1, t * 1.1)
        K._pour(bm_o, mat_out, tint_o)
        K._pour(bm_i, mat_in, tint_i)
    # the strip casts the sun's shadow as one flat quad (a clear sheet casts none)
    if not clear:
        qd = bmesh.new()
        za, zb = s * z0, s * z1
        vs = [qd.verts.new((x0, roof_under(za) + 0.01, za)), qd.verts.new((x1, roof_under(za) + 0.01, za)),
              qd.verts.new((x1, roof_under(zb) + 0.01, zb)), qd.verts.new((x0, roof_under(zb) + 0.01, zb))]
        qd.faces.new(vs)
        K._cast(mat_out, qd, None, True)
        qd.free()


TWO_PI = math.tau


def round_window(K, y, r):
    """the round window high in the front gable: a ring of trim, four panes"""
    x = X1 + 0.02
    K.lathe('g_trim', (x + BOARD_T + 0.02, y, 0), [(r + 0.09, -0.02), (r + 0.09, 0.025), (r, 0.025), (r, -0.02)], segs=28, axis='x', smooth=False)
    K.cyl('win_glass', (x + 0.012, y, 0), r, 0.004, axis='x', segs=28, smooth=False)
    K.box('g_trim', (x + 0.02, y, 0), (0.03, 2 * r, 0.03), bev=0.003)
    K.box('g_trim', (x + 0.02, y, 0), (0.03, 0.03, 2 * r), bev=0.003)
