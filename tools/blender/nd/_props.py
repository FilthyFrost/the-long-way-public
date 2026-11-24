"""
Props the ND6 places share (docs/ND/PLAN.md): a shipping container (20 or 40 ft, ISO sizes) with its corrugated walls,
its corner castings and its two doors (DOOR_<name>l / r: a container's, stuck one time in four — Nomad Drive's 'stuck'
kind — the inside out of reach while they are shut); a fence of posts and wire; headstones and crosses. All built in a
place's Blender frame (nd/_nd.py's conventions), lying square to its axes.
"""
import math

import bmesh
from mathutils import Matrix, Vector

from parts import _kit as K
from parts._kit import V
from places import _common as C
from nd import _nd as N
from nd._nd import Face, face_box

TAU = math.tau
CONTAINER = {20: (6.06, 2.44, 2.59), 40: (12.19, 2.44, 2.59)}


def corrugated(bm, face, s0, s1, z0, z1, pitch=0.28, depth=0.035, o=0.0):
    """a corrugated sheet's ribs on a face (over its sheet at o): upright trapezoid ribs along s standing out to
    `depth`, each a closed prism (C.outward turns it the right way out)"""
    n = max(1, int((s1 - s0) / pitch))
    w = (s1 - s0) / n
    for i in range(n):
        a = s0 + i * w
        prof = [(a, o), (a + w * 0.18, o + depth), (a + w * 0.5, o + depth), (a + w * 0.68, o)]
        lo = [bm.verts.new(face.p(s, oo, z0)) for (s, oo) in prof]
        hi = [bm.verts.new(face.p(s, oo, z1)) for (s, oo) in prof]
        bm.faces.new(lo[::-1])
        bm.faces.new(hi)
        for k in range(4):
            j = (k + 1) % 4
            bm.faces.new((lo[k], lo[j], hi[j], hi[k]))


def container(P, B, card, name, x, y, z, yaw=0.0, size=(6.05, 2.29, 2.60), mat='paint', pry='stuck', stacked=False, secs=0.4):
    """
    A shipping container (Nomad Drive's: 2.29 x 6.05 x 2.60 m) lying at (x, y) on z (its underside), its length turned
    `yaw` degrees from +X, its doors at its +X end (turned with it). Its walls corrugated in `mat` (paint: the yard's
    colour; paint_b, rust, steel: others), its corner posts, rails and castings dark; its floor of boards walkable
    inside; its roof a floor to stand on. Its two doors (DOOR_<name>l / r) swing out 90° in 0.4 s: the left one stuck one
    time in four, the right one found as the left one is; what is inside out of reach while the left one is shut.
    """
    L, W, H = size
    a = math.radians(yaw)
    ca, sa = math.cos(a), math.sin(a)
    R3 = Matrix.Rotation(a, 3, 'Z')

    def w(lx, ly):
        return (x + ca * lx - sa * ly, y + sa * lx + ca * ly)

    def wd(dx, dy):
        return (ca * dx - sa * dy, sa * dx + ca * dy)

    def tbox(lx, ly, hx, hy, z0, z1, floor=False):
        cx, cy = w(lx, ly)
        d = dict(u=N.r4(cx), v=N.r4(-cy), hx=N.r4(hx), hz=N.r4(hy), y0=N.r4(z0), y1=N.r4(z1), turn=N.r4(-a))
        if floor:
            d['floor'] = True
        card.solids.append(d)

    z0, z1 = z, z + H
    t = 0.05
    hl, hw = L / 2, W / 2
    # the faces: its two long sides, its shut end (-X), its doors' end (+X)
    def face(p, q, out):
        return Face(w(*p), w(*q), wd(*out), t)
    sides = [face((-hl, hw), (hl, hw), (0, 1)), face((hl, -hw), (-hl, -hw), (0, -1))]
    shut = face((-hl, -hw), (-hl, hw), (-1, 0))
    dend = face((hl, hw), (hl, -hw), (1, 0))
    for f in sides + [shut]:
        face_box(B[mat], f, 0.0, f.L, -t, -0.01, z0 + 0.1, z1 - 0.1)
        corrugated(B[mat], f, 0.12, f.L - 0.12, z0 + 0.12, z1 - 0.12)
        face_box(B['trim'], f, 0.0, f.L, -0.06, 0.04, z0, z0 + 0.12)
        face_box(B['trim'], f, 0.0, f.L, -0.06, 0.04, z1 - 0.12, z1)
    # (the doors' end: its sill and its header flush with the face, the leaves before them)
    face_box(B['trim'], dend, 0.0, dend.L, -0.08, 0.0, z0, z0 + 0.12)
    face_box(B['trim'], dend, 0.0, dend.L, -0.08, 0.0, z1 - 0.12, z1)
    # its roof, the floor's boards inside
    N.bm_box(B[mat], (x, y, z1 - 0.03), (L - 0.1, W - 0.1, 0.05), R3)
    N.bm_box(B['wood'], (x, y, z0 + 0.14), (L - 0.12, W - 0.12, 0.03), R3)
    # the corner posts and their castings
    for (lx, ly) in ((-hl, -hw), (-hl, hw), (hl, -hw), (hl, hw)):
        ix = lx - 0.06 * (1 if lx > 0 else -1)
        iy = ly - 0.06 * (1 if ly > 0 else -1)
        cx, cy = w(ix, iy)
        N.bm_box(B['trim'], (cx, cy, (z0 + z1) / 2), (0.12, 0.12, H), R3)
        for zz in (z0 + 0.06, z1 - 0.06):
            cx2, cy2 = w(lx - 0.08 * (1 if lx > 0 else -1), ly - 0.08 * (1 if ly > 0 else -1))
            N.bm_box(B['steel'], (cx2, cy2, zz), (0.17, 0.17, 0.12), R3)
    # the card: its sides and its shut end, its floor inside, its roof (stood on where it is not stacked over)
    tbox(0.0, hw - t / 2, hl, t / 2, z0, z1)
    tbox(0.0, -hw + t / 2, hl, t / 2, z0, z1)
    tbox(-hl + t / 2, 0.0, t / 2, hw, z0, z1)
    tbox(0.0, 0.0, hl - t, hw - t, z0 - (0.6 if not stacked else 0.0), z0 + 0.155, floor=True)
    tbox(0.0, 0.0, hl, hw, z1 - 0.06, z1, floor=True)
    # its doors (Nomad Drive's: two leaves of 1.14 x 2.39 m): corrugated sheet, their locking bars; hung at the
    # corners, opening out
    half = dend.L / 2
    dh = 2.39
    db = z0 + 0.105
    inside = (x - (hl - t), x + (hl - t), y - (hw - t), y + (hw - t), z0 + 0.15, z1 - 0.1, a)
    for side, (s0, s1, hinge_s, sd) in (('l', (half - 1.14, half, half - 1.14, 1)), ('r', (half, half + 1.14, half + 1.14, -1))):
        since = len(P.statics)
        lw = s1 - s0
        hp = dend.p(hinge_s, 0.02, 0.0)
        c = dend.p((s0 + s1) / 2, 0.02, 0.0)
        P.box('ct_door', (0.04, lw - 0.01, dh), (c.x, c.y, db + dh / 2), mat, rot=(0, 0, yaw), bev=0.004)
        # (the leaf's own ribs, upright, on its outer face: they swing with it)
        bm = bmesh.new()
        lf = Face(dend.xy(s0, 0.04), dend.xy(s1, 0.04), (dend.o.x, dend.o.y), 0.0)
        corrugated(bm, lf, 0.06, lf.L - 0.06, db + 0.14, db + dh - 0.14, pitch=0.22, depth=0.022)
        P.mesh('ct_door_ribs', bm, mat, sharp=40.0)
        for k in range(2):
            bp = dend.p(s0 + lw * (0.3 + 0.4 * k), 0.06, 0.0)
            C.post(P, 'ct_bar', (bp.x, bp.y, z0 + 0.15), (bp.x, bp.y, z1 - 0.15), 0.016, 'steel', segs=6)
            hq = dend.p(s0 + lw * (0.3 + 0.4 * k) + 0.06 * sd, 0.08, 0.0)
            P.box('ct_handle', (0.025, 0.12, 0.03), (hq.x, hq.y, z0 + 1.2), 'steel', rot=(0, 0, yaw), bev=None)
        P.mover(f'DOOR_{name}{side}', P.statics[since:], (hp.x, hp.y, z0))
        leaf = dend.s * sd
        out = dend.o
        cross = leaf.x * out.y - leaf.y * out.x
        # (both leaves before the compartment: what is in it in reach while either stands open)
        card.door(f'DOOR_{name}{side}', (hp.x, hp.y), lw - 0.01, 0.04, 90.0, db + dh, (leaf.x, leaf.y), 1 if cross > 0 else -1,
                  pry=pry, z0=db if z0 > 0.01 else 0.0, box=inside, secs=secs, mat='metal',
                  same=f'DOOR_{name}l' if side == 'r' else None)
    return (x, y, z0, z1)


def tsolid(card, cx, cy, hx, hy, z0, z1, ang=0.0, floor=False):
    """a card's solid about (cx, cy), hx along the Blender angle `ang` (radians), hy across it"""
    d = dict(u=N.r4(cx), v=N.r4(-cy), hx=N.r4(hx), hz=N.r4(hy), y0=N.r4(z0), y1=N.r4(z1))
    if abs(ang) > 1e-6:
        d['turn'] = N.r4(-ang)
    if floor:
        d['floor'] = True
    card.solids.append(d)


def fence(P, B, card, pts, h=1.9, mat='alu', strands=5, barbed=True, gap=None, post_every=2.6):
    """a wire fence along a line of points: posts, a top and a bottom rail, strands of wire between (barbed: three more
    on arms leaning out at the posts' tops, out to the line's right); `gap` (i, s0, s1): a gate's opening left in
    segment i; the card a thin wall along each run"""
    for i, (p0, p1) in enumerate(zip(pts[:-1], pts[1:])):
        a, b = V((p0[0], p0[1], 0.0)), V((p1[0], p1[1], 0.0))
        L = (b - a).length
        d = (b - a).normalized()
        out = V((d.y, -d.x, 0.0))
        runs = [(0.0, L)]
        if gap and gap[0] == i:
            runs = [(0.0, gap[1]), (gap[2], L)]
        for (s0, s1) in runs:
            if s1 - s0 < 0.05:
                continue
            n = max(1, int(math.ceil((s1 - s0) / post_every)))
            for k in range(n + 1):
                p = a + d * (s0 + (s1 - s0) * k / n)
                C.post(P, 'fence_post', (p.x, p.y, -0.05), (p.x, p.y, h + 0.05), 0.03, mat, segs=6, bev=None)
                if barbed:
                    C.post(P, 'fence_arm', (p.x, p.y, h), (p.x + out.x * 0.28, p.y + out.y * 0.28, h + 0.32), 0.012, mat, segs=4, bev=None)
            pa, pb = a + d * s0, a + d * s1
            for z in (0.08, h - 0.03):
                C.post(P, 'fence_rail', (pa.x, pa.y, z), (pb.x, pb.y, z), 0.02, mat, segs=6, bev=None)
            for k in range(strands):
                z = 0.08 + (h - 0.11) * (k + 1) / (strands + 1)
                C.post(P, 'fence_wire', (pa.x, pa.y, z), (pb.x, pb.y, z), 0.005, 'steel', segs=3, bev=None)
            if barbed:
                for k in range(3):
                    t = (k + 1) / 3
                    o = out * (0.28 * t)
                    C.post(P, 'fence_barb', (pa.x + o.x, pa.y + o.y, h + 0.32 * t), (pb.x + o.x, pb.y + o.y, h + 0.32 * t), 0.006, 'steel', segs=3, bev=None)
            mid = (pa + pb) / 2
            tsolid(card, mid.x, mid.y, (pb - pa).length / 2, 0.04, -0.3, h, math.atan2(d.y, d.x))


def headstone(P, B, card, x, y, kind, face=90.0, k=0):
    """a grave's headstone at (x, y), its front facing the Blender angle `face`: a rounded slab, a cross, an obelisk
    or a plain wooden cross; the mound of earth before it"""
    a = math.radians(face)
    R = Matrix.Rotation(a - math.pi / 2, 3, 'Z')
    lean = Matrix.Rotation(0.04 * C.jit(k, 1.0), 3, 'X') @ Matrix.Rotation(0.05 * C.jit(k, 2.0), 3, 'Y')
    if kind == 'slab':
        N.bm_box(B['ceramic'], (x, y, 0.45), (0.6, 0.12, 0.9), R @ lean)
        N.bm_box(B['ceramic'], (x, y, 0.05), (0.75, 0.25, 0.1), R)
    elif kind == 'cross':
        N.bm_box(B['ceramic'], (x, y, 0.55), (0.12, 0.1, 1.1), R @ lean)
        N.bm_box(B['ceramic'], (x, y, 0.82), (0.55, 0.1, 0.12), R @ lean)
        N.bm_box(B['ceramic'], (x, y, 0.06), (0.4, 0.3, 0.12), R)
    elif kind == 'obelisk':
        N.bm_box(B['ceramic'], (x, y, 0.15), (0.5, 0.5, 0.3), R)
        N.bm_box(B['ceramic'], (x, y, 0.85), (0.28, 0.28, 1.1), R @ lean)
        N.bm_box(B['ceramic'], (x, y, 1.45), (0.18, 0.18, 0.12), R @ lean)
    else:
        N.bm_box(B['wood'], (x, y, 0.5), (0.08, 0.06, 1.0), R @ lean)
        N.bm_box(B['wood'], (x, y, 0.72), (0.45, 0.06, 0.08), R @ lean)
    # the mound before it
    fx, fy = math.cos(a), math.sin(a)
    bm = bmesh.new()
    K.bm_cyl(bm, 0.5, 0.12, segs=12, matrix=Matrix.Translation((x + fx * 1.05, y + fy * 1.05, 0.03)) @ (R.to_4x4()) @ Matrix.Diagonal((0.85, 1.9, 1.0, 1.0)))
    P.mesh('grave_mound', bm, 'rust', sharp=40.0)
    card.post(x, y, 0.3 if kind != 'obelisk' else 0.28, -0.3, 1.0)


def steel_stair(P, B, card, a, b, z0, z1, w=0.9, n=None, rails=(True, True), mat='paint_b', name='stair'):
    """a straight flight of steel from a (its foot's front edge, Blender x, y) at z0 up to b (its head's back edge) at z1:
    n treads of grating (Nomad Drive's count; else one to 0.19 m) between two stringers, its rails on the sides asked
    for (rails: its left and its right, going up); its treads the card's floors, its rails' pieces walls"""
    a, b = V((a[0], a[1], 0.0)), V((b[0], b[1], 0.0))
    run = (b - a).length
    d = (b - a).normalized()
    p = V((-d.y, d.x, 0.0))
    ang = math.atan2(d.y, d.x)
    R = Matrix.Rotation(ang, 3, 'Z')
    rise = z1 - z0
    n = n or max(2, int(round(rise / 0.19)))
    g = run / n
    for i in range(n):
        zt = z0 + rise * (i + 1) / n
        c = a + d * (g * (i + 0.5))
        N.bm_box(B['steel'], (c.x, c.y, zt - 0.02), (g + 0.02, w, 0.04), R)
        e = a + d * (g * i + 0.02)
        N.bm_box(B['trim'], (e.x, e.y, zt - 0.03), (0.04, w, 0.06), R)
        tsolid(card, c.x, c.y, g / 2 + 0.01, w / 2, zt - 0.3, zt, ang, floor=True)
        for (on, sg) in zip(rails, (1, -1)):
            if on:
                q = c + p * (sg * (w / 2 + 0.03))
                tsolid(card, q.x, q.y, g / 2 + 0.01, 0.03, zt, zt + 1.0, ang)
    for sg in (1, -1):
        q = p * (sg * (w / 2 + 0.03))
        C.plank(P, f'{name}_stringer', (a.x + q.x, a.y + q.y, z0 + rise / n - 0.12), (b.x + q.x, b.y + q.y, z1 - 0.12), 0.05, 0.26, mat, up=(0, 0, 1), bev=0.004, floor=False)
    for (on, sg) in zip(rails, (1, -1)):
        if not on:
            continue
        q = p * (sg * (w / 2 + 0.04))
        m = max(2, int(run / 1.2) + 1)
        for k in range(m):
            t = k / (m - 1)
            c = a + d * (run * t) + q
            zt = z0 + rise * max(1, min(n, math.ceil(t * n))) / n
            C.post(P, f'{name}_post', (c.x, c.y, zt - 0.05), (c.x, c.y, zt + 1.0), 0.022, mat, segs=6, bev=None)
        for zz in (1.0, 0.5):
            C.post(P, f'{name}_rail', (a.x + q.x, a.y + q.y, z0 + rise / n + zz), (b.x + q.x, b.y + q.y, z1 + zz), 0.022, mat, segs=6, bev=None)


def landing(P, B, card, x0, x1, y0, y1, z, rails='', legs=True, mat='paint_b'):
    """a steel landing (axis-aligned): grating on its frame, legs to the ground, rails on the sides asked for (n, e, s,
    w: +y, +x, -y, -x); its floor and its rails the card's"""
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    N.bm_box(B['steel'], (cx, cy, z - 0.02), (x1 - x0, y1 - y0, 0.04))
    for (sx, sy, lx, ly) in ((cx, y0, x1 - x0, 0.08), (cx, y1, x1 - x0, 0.08), (x0, cy, 0.08, y1 - y0), (x1, cy, 0.08, y1 - y0)):
        N.bm_box(B[mat], (sx, sy, z - 0.07), (lx, ly, 0.1))
    card.box(x0, x1, y0, y1, z - 0.3, z, floor=True)
    if legs and z > 0.6:
        for (lx, ly) in ((x0 + 0.05, y0 + 0.05), (x1 - 0.05, y0 + 0.05), (x0 + 0.05, y1 - 0.05), (x1 - 0.05, y1 - 0.05)):
            N.bm_box(B[mat], (lx, ly, (z - 0.12) / 2), (0.08, 0.08, z - 0.12))
            card.post(lx, ly, 0.05, -0.3, z - 0.12)
    sides = {'n': ((x0, y1), (x1, y1)), 's': ((x0, y0), (x1, y0)), 'e': ((x1, y0), (x1, y1)), 'w': ((x0, y0), (x0, y1))}
    for k in rails:
        (ax, ay), (bx, by) = sides[k]
        L = math.hypot(bx - ax, by - ay)
        m = max(2, int(L / 1.2) + 1)
        for j in range(m):
            t = j / (m - 1)
            C.post(P, 'landing_post', (ax + (bx - ax) * t, ay + (by - ay) * t, z - 0.05), (ax + (bx - ax) * t, ay + (by - ay) * t, z + 1.0), 0.022, mat, segs=6, bev=None)
        for zz in (1.0, 0.5):
            C.post(P, 'landing_rail', (ax, ay, z + zz), (bx, by, z + zz), 0.022, mat, segs=6, bev=None)
        card.box(min(ax, bx) - 0.03, max(ax, bx) + 0.03, min(ay, by) - 0.03, max(ay, by) + 0.03, z, z + 1.0)


def lattice_mast(P, card, x, y, h, r0, r1, levels, mat='paint_b', name='mast'):
    """a three-legged lattice mast from the ground to h: its legs leaning in from r0 to r1 (m from its axis), a ring of
    struts at each level and the faces' diagonals between, alternating; its legs' feet the card's posts"""
    zs = [h * (k / levels) ** 1.0 for k in range(levels + 1)]
    rad = lambda z: r0 + (r1 - r0) * z / h
    ang = [math.pi / 2 + k * TAU / 3 for k in range(3)]
    pt = lambda k, z: (x + math.cos(ang[k]) * rad(z), y + math.sin(ang[k]) * rad(z), z)
    for k in range(3):
        C.post(P, f'{name}_leg', pt(k, 0.0), pt(k, h), 0.05, mat, segs=8, bev=None)
        p = pt(k, 0.0)
        card.post(p[0], p[1], 0.12, -0.3, 2.5)
        P.box(f'{name}_foot', (0.3, 0.3, 0.2), (p[0], p[1], 0.1), 'ceramic', bev=0.01)
    for i in range(1, levels + 1):
        z = zs[i]
        for k in range(3):
            C.post(P, f'{name}_strut', pt(k, z), pt((k + 1) % 3, z), 0.018, mat, segs=5, bev=None)
            za = zs[i - 1]
            if i % 2:
                C.post(P, f'{name}_brace', pt(k, za), pt((k + 1) % 3, z), 0.013, mat, segs=4, bev=None)
            else:
                C.post(P, f'{name}_brace', pt((k + 1) % 3, za), pt(k, z), 0.013, mat, segs=4, bev=None)
    card.post(x, y, r0 * 0.55, -0.3, h)
    return pt


def dish(P, at, face_deg, tilt_deg, r, mount=None, mat='alu', name='dish'):
    """a dish antenna at `at`, looking out the Blender angle face_deg, tilted up by tilt_deg: its bowl, its rim, its
    feed on three struts before it; a mount back to `mount` (a point of the mast)"""
    f, t = math.radians(face_deg), math.radians(tilt_deg)
    ax = V((math.cos(f) * math.cos(t), math.sin(f) * math.cos(t), math.sin(t)))
    c = V(at)
    depth = r * 0.32
    P.cyl(f'{name}_bowl', r, depth, tuple(c - ax * (depth / 2)), mat, axis=tuple(-ax), r2=r * 0.28, segs=18, bev=None)
    P.torus(f'{name}_rim', r, 0.02, loc=tuple(c), material='trim', axis=tuple(ax), segs=16, rsegs=3)
    feed = c + ax * (r * 0.75)
    up = V((0, 0, 1)) if abs(ax.z) < 0.9 else V((1, 0, 0))
    s1 = ax.cross(up).normalized()
    s2 = ax.cross(s1).normalized()
    for k in range(3):
        a = k * TAU / 3
        rim = c + (s1 * math.cos(a) + s2 * math.sin(a)) * (r * 0.92)
        C.post(P, f'{name}_strut', tuple(rim), tuple(feed), 0.008, 'steel', segs=3, bev=None)
    P.cyl(f'{name}_feed', 0.05 + r * 0.04, 0.12, tuple(feed), 'trim', axis=tuple(ax), segs=8)
    if mount is not None:
        back = c - ax * depth
        C.post(P, f'{name}_mount', tuple(back), tuple(mount), 0.03, 'steel', segs=6, bev=None)


def shelving(P, B, card, name, x, y, yaw=0.0, L=2.08, D=0.64, H=2.22, boards=(0.12, 1.02, 1.62, 2.2), spots=(1.02, 1.62), per=3, z=0.0, k=0):
    """a steel shelving unit (Nomad Drive's factories': 0.64 x 2.08 x 2.22 m) at (x, y) on z, its length turned `yaw`
    degrees from +X: four perforated uprights, boards at `boards`, cross-braced at its back; each board a floor of the
    card's (what is put on it rests on it; the walker is kept out by the boards over its step); `per` spots to each
    board in `spots`, named <name>_<board>_<k> (none: spots=())"""
    a = math.radians(yaw)
    ca, sa = math.cos(a), math.sin(a)
    R = Matrix.Rotation(a, 3, 'Z')
    w = lambda lx, ly: (x + ca * lx - sa * ly, y + sa * lx + ca * ly)
    for (lx, ly) in ((-L / 2 + 0.03, -D / 2 + 0.03), (L / 2 - 0.03, -D / 2 + 0.03), (-L / 2 + 0.03, D / 2 - 0.03), (L / 2 - 0.03, D / 2 - 0.03)):
        cx, cy = w(lx, ly)
        N.bm_box(B['paint_b'], (cx, cy, z + H / 2), (0.05, 0.05, H), R)
    for (j, zb) in enumerate(boards):
        cx, cy = w(0.0, 0.0)
        N.bm_box(B['steel'], (cx, cy, z + zb - 0.015), (L - 0.02, D - 0.02, 0.03), R)
        for ly in (-D / 2 + 0.02, D / 2 - 0.02):
            ex, ey = w(0.0, ly)
            N.bm_box(B['paint_b'], (ex, ey, z + zb - 0.04), (L, 0.03, 0.06), R)
        tsolid(card, cx, cy, L / 2, D / 2, z + zb - 0.04, z + zb, a, floor=True)
    # the cross at its back
    b0, b1 = w(-L / 2 + 0.05, D / 2 - 0.03), w(L / 2 - 0.05, D / 2 - 0.03)
    C.post(P, f'{name}_brace', (b0[0], b0[1], z + 0.15), (b1[0], b1[1], z + H - 0.1), 0.008, 'paint_b', segs=4, bev=None)
    C.post(P, f'{name}_brace', (b1[0], b1[1], z + 0.15), (b0[0], b0[1], z + H - 0.1), 0.008, 'paint_b', segs=4, bev=None)
    for zb in spots:
        for i in range(per):
            lx = -L / 2 + L * (i + 0.5) / per
            sx, sy = w(lx, -0.05)
            card.spot(f'{name}_{int(round(zb * 100))}_{i}', sx, sy, z + zb, yaw + 90 + 25 * C.jit(i + k, zb))


def tank(P, B, card, x, y, kind, yaw=0.0, mat='paint', z=0.0):
    """a tank: 'upright' on four legs with its ladder of rungs and its cap (Nomad Drive's Tank-02, -03), or 'lying' on two
    saddles with its fill and its gauge (Tank-01); its card's solid"""
    a = math.radians(yaw)
    ca, sa = math.cos(a), math.sin(a)
    if kind == 'lying':
        L, r = 4.6, 1.05
        P.cyl('tank_body', r, L, (x, y, z + 0.45 + r), mat, axis=(ca, sa, 0.0), segs=24)
        for s in (-1, 1):
            P.sphere('tank_end', r, loc=(x + ca * s * L / 2, y + sa * s * L / 2, z + 0.45 + r), material=mat, u=24, v=8, scale=(0.25 if abs(ca) > 0.5 else 1.0, 1.0 if abs(ca) > 0.5 else 0.25, 1.0))
            N.bm_box(B['ceramic'], (x + ca * s * L * 0.3, y + sa * s * L * 0.3, z + 0.3), (0.5 if abs(ca) > 0.5 else 2.0, 2.0 if abs(ca) > 0.5 else 0.5, 0.6))
        for k in range(3):
            P.torus('tank_band', r + 0.01, 0.025, loc=(x + ca * (k - 1) * L * 0.32, y + sa * (k - 1) * L * 0.32, z + 0.45 + r), material='trim', axis=(ca, sa, 0.0), segs=24, rsegs=3)
        P.cyl('tank_fill', 0.18, 0.25, (x, y, z + 0.45 + 2 * r + 0.08), 'trim', segs=12)
        P.cyl('tank_gauge', 0.09, 0.04, (x - sa * (r + 0.02), y + ca * (r + 0.02), z + 0.45 + r), 'alu', axis=(-sa, ca, 0.0), segs=12)
        tsolid(card, x, y, L / 2 + r * 0.25, r, -0.3, z + 0.45 + 2 * r, a)
        return
    r, h, legs = (1.5, 5.5, 3.0) if kind == 'upright' else (1.1, 3.6, 1.6)
    zb = z + legs
    P.cyl('tank_body', r, h, (x, y, zb + h / 2), mat, segs=28)
    P.cyl('tank_roof', r + 0.05, 0.6, (x, y, zb + h + 0.3), mat, segs=28, r2=0.25)
    P.cyl('tank_floor', r + 0.02, 0.12, (x, y, zb + 0.06), 'trim', segs=28)
    for k in range(4):
        b = a + math.pi / 4 + k * math.pi / 2
        lx, ly = x + math.cos(b) * r * 0.82, y + math.sin(b) * r * 0.82
        C.post(P, 'tank_leg', (lx, ly, z), (lx, ly, zb + 0.1), 0.09, 'trim', segs=8, bev=None)
        N.bm_box(B['ceramic'], (lx, ly, z + 0.1), (0.4, 0.4, 0.2))
        card.post(lx, ly, 0.1, -0.3, zb)
    for k in range(4):
        b0 = a + math.pi / 4 + k * math.pi / 2
        b1 = b0 + math.pi / 2
        C.post(P, 'tank_brace', (x + math.cos(b0) * r * 0.82, y + math.sin(b0) * r * 0.82, z + 0.3), (x + math.cos(b1) * r * 0.82, y + math.sin(b1) * r * 0.82, zb - 0.1), 0.03, 'trim', segs=5, bev=None)
    for zz in (zb + h * 0.33, zb + h * 0.66):
        P.torus('tank_band', r + 0.01, 0.025, loc=(x, y, zz), material='trim', segs=28, rsegs=3)
    # its rungs up its side (a ladder of iron, not one to climb: Nomad Drive's tanks are not climbed)
    lx, ly = x + math.cos(a) * (r + 0.18), y + math.sin(a) * (r + 0.18)
    px, py = -math.sin(a) * 0.22, math.cos(a) * 0.22
    for s in (-1, 1):
        C.post(P, 'tank_rail', (lx + px * s, ly + py * s, zb), (lx + px * s, ly + py * s, zb + h + 0.4), 0.015, 'trim', segs=4, bev=None)
    for kk in range(int(h / 0.3)):
        zz = zb + 0.2 + kk * 0.3
        C.post(P, 'tank_rung', (lx - px, ly - py, zz), (lx + px, ly + py, zz), 0.01, 'trim', segs=3, bev=None)
    card.post(x, y, r, zb, zb + h + 0.6)


def block_walls(B, card, x0, x1, y0, y1, zb, zt, t, holes=None, outer='paint', inner='ceramic', band=0.32, coping=True, lintels=True, floor_at=None):
    """four block walls round an axis-aligned box (x0..x1, y0..y1 its outer faces) from zb up to zt, t thick; their
    openings `holes` by side (n: +y, s: -y, e: +x, w: -x): (a0, a1, z0, z1, kind) with a0..a1 along the side in the
    place's own coordinates (x for n and s, y for e and w), kind 'door' (cased; a gap in the card's wall), 'window' (a
    sash), 'gap' (a gap in the card's wall, no casing: a shutter's own) or 'hole' (only the hole); the plinth's band
    and the coping; the card's walls, a gap left where an opening comes down to the floor (within 5 cm of zb + 0.15 or
    below), its lintel over it. Returns the faces by side."""
    import nd.station as S
    holes = holes or {}
    faces = {
        'n': (Face((x0, y1), (x1, y1), (0, 1), t), lambda a: a - x0),
        's': (Face((x1, y0), (x0, y0), (0, -1), t), lambda a: x1 - a),
        'e': (Face((x1, y1 - t), (x1, y0 + t), (1, 0), t), lambda a: (y1 - t) - a),
        'w': (Face((x0, y0 + t), (x0, y1 - t), (-1, 0), t), lambda a: a - (y0 + t)),
    }
    floor = zb + 0.15 if floor_at is None else floor_at
    out = {}
    for side, (f, to_s) in faces.items():
        hs = []
        for (a0, a1, z0, z1, kind) in holes.get(side, ()):
            s0, s1 = sorted((to_s(a0), to_s(a1)))
            hs.append((s0, s1, z0, z1, kind))
        S.solid_wall(B, f, zb, zt, [h[:4] for h in hs], outer, inner=inner)
        low = [(h[0], h[1]) for h in hs if h[2] < floor + 0.05]
        if band:
            S.band(B, 'trim', f, 0.0, 0.03, zb, zb + band + 0.15, gaps=[(a - 0.07, b + 0.07) for (a, b) in low])
        if coping:
            S.band(B, 'trim', f, -t - 0.03, 0.05, zt - 0.06, zt + 0.03)
        for (s0, s1, z0, z1, kind) in hs:
            if kind == 'door':
                S.opening_trim(B, f, s0, s1, z0, z1, mat='paint_b')
            elif kind == 'window':
                N.window(B, f, s0, s1, z0, z1, rows=1, cols=2)
        # the card: the wall's runs between its low openings, the lintels over them
        cuts = sorted(low)
        at = 0.0
        runs = []
        for (a, b) in cuts:
            if a > at + 0.01:
                runs.append((at, a))
            at = max(at, b)
        if at < f.L - 0.01:
            runs.append((at, f.L))
        for (a, b) in runs:
            p0, p1 = f.p(a, -t, 0.0), f.p(b, 0.0, 0.0)
            card.box(min(p0.x, p1.x), max(p0.x, p1.x), min(p0.y, p1.y), max(p0.y, p1.y), zb - 0.15, zt)
        if lintels:
            for (s0, s1, z0, z1, kind) in hs:
                if z0 < floor + 0.05:
                    p0, p1 = f.p(s0, -t, 0.0), f.p(s1, 0.0, 0.0)
                    card.box(min(p0.x, p1.x), max(p0.x, p1.x), min(p0.y, p1.y), max(p0.y, p1.y), z1, zt)
        out[side] = f
    return out


def slab(B, card, x0, x1, y0, y1, z, th=0.3, top='ceramic', under='ceramic', holes=(), floor=True):
    """a floor or a roof's slab, its top at z, `th` thick, over x0..x1, y0..y1 (axis-aligned), cut round the
    `holes` (x0, x1, y0, y1: a stairwell); the card's floors over the rest"""
    xs = sorted({x0, x1} | {h[0] for h in holes} | {h[1] for h in holes})
    ys = sorted({y0, y1} | {h[2] for h in holes} | {h[3] for h in holes})
    for i in range(len(xs) - 1):
        for j in range(len(ys) - 1):
            a, b, c, d = xs[i], xs[i + 1], ys[j], ys[j + 1]
            if b - a < 1e-3 or d - c < 1e-3:
                continue
            mx, my = (a + b) / 2, (c + d) / 2
            if any(h[0] < mx < h[1] and h[2] < my < h[3] for h in holes):
                continue
            N.bm_box(B[under], (mx, my, z - th / 2 - 0.01), (b - a, d - c, th - 0.02))
            N.bm_box(B[top], (mx, my, z - 0.01), (b - a, d - c, 0.02))
            if floor:
                card.box(a, b, c, d, z - min(th, 0.3), z, floor=True)


def railing(P, card, pts, z, h=1.03, mat='paint_b', every=1.5, gap=None, name='rail'):
    """a steel railing along a line of points at height z: posts, a top rail and a knee rail; `gap` (i, s0, s1) an
    opening left in segment i; the card's walls along it"""
    for i, (p0, p1) in enumerate(zip(pts[:-1], pts[1:])):
        a, b = V((p0[0], p0[1], 0.0)), V((p1[0], p1[1], 0.0))
        L = (b - a).length
        d = (b - a).normalized()
        runs = [(0.0, L)]
        if gap and gap[0] == i:
            runs = [(0.0, gap[1]), (gap[2], L)]
        for (s0, s1) in runs:
            if s1 - s0 < 0.05:
                continue
            n = max(1, int(math.ceil((s1 - s0) / every)))
            for k in range(n + 1):
                q = a + d * (s0 + (s1 - s0) * k / n)
                C.post(P, f'{name}_post', (q.x, q.y, z), (q.x, q.y, z + h), 0.022, mat, segs=6, bev=None)
            qa, qb = a + d * s0, a + d * s1
            for zz in (h, h * 0.5):
                C.post(P, f'{name}_bar', (qa.x, qa.y, z + zz), (qb.x, qb.y, z + zz), 0.022, mat, segs=6, bev=None)
            mid = (qa + qb) / 2
            tsolid(card, mid.x, mid.y, (qb - qa).length / 2, 0.04, z, z + h, math.atan2(d.y, d.x))


def roller_shutter(P, B, face, s0, s1, z0, z1, up, mat='paint_b'):
    """a roller shutter in an opening of a face (s0..s1, z0..z1): its slats from `up` (how far it is raised: its
    bottom) to the top, its guides at its sides, its box over it on the inside"""
    o = -face.t + 0.06
    n = max(1, int((z1 - up) / 0.09))
    for k in range(n):
        zz = up + (z1 - up) * (k + 0.5) / n
        face_box(B[mat], face, s0, s1, o - 0.02, o + 0.02, zz - 0.04, zz + 0.04)
    face_box(B['trim'], face, s0, s1, o - 0.03, o + 0.03, up - 0.03, up + 0.03)
    for s in (s0, s1 - 0.06):
        face_box(B['trim'], face, s, s + 0.06, o - 0.05, o + 0.05, z0, z1)
    face_box(B[mat], face, s0 - 0.1, s1 + 0.1, -face.t - 0.45, -face.t, z1, z1 + 0.45)

