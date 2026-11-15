"""
The moto artist's helpers (tools/blender/frames/moto.py): bent tube centre lines, round tubes on parallel-transport
frames, rounded-edge plates with holes, weld beads where tubes meet, bolts, nuts, springs, cables, lathes on any axis.
Everything returns frames._kit.Buf objects (triangles with exact per-vertex normals and a material per triangle);
Blender axes X forward, Y left, Z up, metres. The frames kit (_kit.py) is reused, not changed.
"""
import math
import sys

sys.dont_write_bytecode = True

import numpy as np  # noqa: E402

from frames import _kit as K  # noqa: E402

unit = K.unit

# segments round lathes and tubes follow their size: a chord of at most LATHE_CHORD / TUBE_CHORD metres, never
# more than the caller asks for, never fewer than 8 (lathes) / 5 (tubes) - big discs stay round, small bits cheap
LATHE_CHORD = 0.0135
TUBE_CHORD = 0.0085


def lathe_segs(segs, rmax):
    return int(max(8, min(segs, math.ceil(2 * math.pi * rmax / LATHE_CHORD))))


def tube_segs(segs, r):
    return int(max(5, min(segs, math.ceil(2 * math.pi * r / TUBE_CHORD))))


# ============================================================================================ paths
def bend_path(pts, radii, step=0.25, arc_deg=12.5, min_seg=2):
    """3D polyline through `pts` with each interior corner replaced by a circular arc of radius radii[i]
    (scalar or list; 0 = sharp). Arcs are sampled every `arc_deg` degrees; straight runs only get points every
    `step` metres (a straight tube needs no rings in between)."""
    P = np.asarray(pts, float)
    n = len(P)
    R = np.broadcast_to(np.asarray(radii, float), (n,)).copy()
    pieces = [P[0]]
    for i in range(1, n - 1):
        a, b, c = P[i - 1], P[i], P[i + 1]
        r = R[i]
        d0 = unit(a - b)
        d1 = unit(c - b)
        cosang = float(np.clip(np.dot(d0, d1), -1.0, 1.0))
        ang = math.acos(cosang)
        if r <= 0 or ang < 1e-3 or abs(ang - math.pi) < 1e-4:
            pieces.append(b)
            continue
        tl = r / math.tan(ang / 2)
        tl = min(tl, 0.49 * np.linalg.norm(a - b), 0.49 * np.linalg.norm(c - b))
        rr = tl * math.tan(ang / 2)
        p0 = b + d0 * tl
        p1 = b + d1 * tl
        bis = unit(d0 + d1)
        ctr = b + bis * (rr / math.sin(ang / 2))
        u = unit(p0 - ctr)
        w = unit(p1 - ctr)
        nrm = unit(np.cross(u, w))
        v = np.cross(nrm, u)
        sweep = math.atan2(float(np.dot(w, v)), float(np.dot(w, u)))
        k = max(min_seg, int(math.ceil(abs(math.degrees(sweep)) / arc_deg)))
        for j in range(k + 1):
            t = sweep * j / k
            pieces.append(ctr + rr * (math.cos(t) * u + math.sin(t) * v))
    pieces.append(P[-1])
    Q = np.array(pieces)
    return densify(Q, step)


def densify(Q, step):
    """Insert points on straight segments longer than `step`."""
    out = [Q[0]]
    for a, b in zip(Q[:-1], Q[1:]):
        L = float(np.linalg.norm(b - a))
        k = max(1, int(math.ceil(L / step)))
        for j in range(1, k + 1):
            out.append(a + (b - a) * j / k)
    out = np.array(out)
    keep = [0]
    for i in range(1, len(out)):
        if np.linalg.norm(out[i] - out[keep[-1]]) > 1e-6:
            keep.append(i)
    return out[keep]


def path_length(P):
    return float(np.sum(np.linalg.norm(np.diff(P, axis=0), axis=1)))


def trim_path(P, s0=0.0, s1=None):
    """Sub-path between arc lengths s0 and s1 (from the start)."""
    P = np.asarray(P, float)
    seg = np.linalg.norm(np.diff(P, axis=0), axis=1)
    s = np.concatenate([[0.0], np.cumsum(seg)])
    s1 = s[-1] if s1 is None else s1
    if s1 < 0:
        s1 = s[-1] + s1
    pts = [np.array([np.interp(s0, s, P[:, k]) for k in range(3)])]
    for i in range(len(P)):
        if s0 < s[i] < s1:
            pts.append(P[i])
    pts.append(np.array([np.interp(s1, s, P[:, k]) for k in range(3)]))
    return np.array(pts)


def point_at(P, s):
    P = np.asarray(P, float)
    seg = np.linalg.norm(np.diff(P, axis=0), axis=1)
    cs = np.concatenate([[0.0], np.cumsum(seg)])
    if s < 0:
        s = cs[-1] + s
    p = np.array([np.interp(s, cs, P[:, k]) for k in range(3)])
    i = int(np.clip(np.searchsorted(cs, s) - 1, 0, len(P) - 2))
    return p, unit(P[i + 1] - P[i])


def tangents(P):
    P = np.asarray(P, float)
    T = np.empty_like(P)
    T[1:-1] = P[2:] - P[:-2]
    T[0] = P[1] - P[0]
    T[-1] = P[-1] - P[-2]
    return unit(T)


def rmf(P, ref=None):
    """Rotation-minimising (parallel transport) normals along a path: returns T, N, B (B = T x N)."""
    T = tangents(P)
    n = len(P)
    N = np.empty_like(T)
    if ref is None:
        ref = np.array([0.0, 0.0, 1.0]) if abs(T[0][2]) < 0.9 else np.array([1.0, 0.0, 0.0])
    ref = np.asarray(ref, float)
    N[0] = unit(ref - T[0] * np.dot(ref, T[0]))
    for i in range(1, n):
        v = N[i - 1] - T[i] * np.dot(N[i - 1], T[i])
        if np.linalg.norm(v) < 1e-9:
            v = N[i - 1]
        N[i] = unit(v)
    B = np.cross(T, N)
    return T, N, B


# ============================================================================================ tubes
def tube(path, r, mat, segs=12, cap0='flat', cap1='flat', ref=None, r_fn=None, chamfer=0.0015, ellipse=None,
         twist=0.0):
    """Round tube along a path on parallel-transport frames (no flips). r: scalar or per-point array.
    caps: 'flat' (with a small chamfer), 'dome', 'open' or None. ellipse=(sx, sy) scales the section in the
    frame's N / B directions (oval tubes). Returns a Buf with exact normals."""
    P = np.asarray(path, float)
    segs = tube_segs(segs, float(np.max(np.broadcast_to(np.asarray(r, float), (len(P),)))) * (1.0 if ellipse is None else max(ellipse)))
    T, N, B = rmf(P, ref)
    rad = np.broadcast_to(np.asarray(r, float), (len(P),)).copy()
    if r_fn is not None:
        s = np.concatenate([[0.0], np.cumsum(np.linalg.norm(np.diff(P, axis=0), axis=1))])
        rad = rad * r_fn(s / max(s[-1], 1e-9))
    a = np.linspace(0, 2 * math.pi, segs, endpoint=False) + twist
    ca, sa = np.cos(a), np.sin(a)
    ex, ey = (1.0, 1.0) if ellipse is None else ellipse
    V = P[:, None, :] + rad[:, None, None] * (ex * ca[None, :, None] * N[:, None, :] + ey * sa[None, :, None] * B[:, None, :])
    Nr = unit(ey * ca[None, :, None] * N[:, None, :] + ex * sa[None, :, None] * B[:, None, :])
    tris = K.grid_tris(len(P), segs, closed=True)
    b = K.Buf().add(V.reshape(-1, 3), Nr.reshape(-1, 3), tris, mat)
    for end, kind in ((0, cap0), (len(P) - 1, cap1)):
        if kind in (None, 'open'):
            continue
        sgn = -1.0 if end == 0 else 1.0
        t = T[end] * sgn
        ring = V[end]
        c = P[end]
        if kind == 'dome':
            rows = 4
            rr = rad[end]
            Vs, Ns = [], []
            for k in range(1, rows + 1):
                ang = 0.5 * math.pi * k / rows
                q = c + t * rr * math.sin(ang) + (ring - c) * math.cos(ang)
                nn = unit(t * math.sin(ang) + unit(ring - c) * math.cos(ang))
                Vs.append(q)
                Ns.append(nn)
            allV = np.vstack([ring] + Vs)
            allN = np.vstack([Nr[end]] + Ns)
            tr = K.grid_tris(rows + 1, segs, closed=True)
            if end == 0:
                tr = tr[:, ::-1]
            b.add(allV, allN, tr, mat)
            continue
        # flat cap with a small chamfer ring
        ch = min(chamfer, rad[end] * 0.3)
        inner = c + (ring - c) * (1.0 - ch / max(rad[end], 1e-9)) + t * ch
        nch = unit(Nr[end] + t)
        Vc = np.vstack([ring, inner])
        Nc = np.vstack([nch, nch])
        tr = K.grid_tris(2, segs, closed=True)
        if end == 0:
            tr = tr[:, ::-1]
        b.add(Vc, Nc, tr, mat)
        Vf = np.vstack([inner, c[None] + t * ch])
        tri = np.array([(i, (i + 1) % segs, segs) for i in range(segs)])
        if end == 0:
            tri = tri[:, ::-1]
        b.add(Vf, np.tile(t, (segs + 1, 1)), tri, mat)
    return b


def bent_tube(pts, radii, r, mat, segs=12, step=0.012, **kw):
    path = bend_path(pts, radii, step)
    return tube(path, r, mat, segs, **kw), path


# ============================================================================================ lathes
def lathe(prof, center, axis, mat, segs=24, ref=None, smooth=True, a0=0.0, a1=360.0):
    """Surface of revolution of profile [(r, h), ...] about `axis` through `center`. smooth=False splits the
    normals at every profile corner (crisp machined steps)."""
    prof = np.asarray(prof, float)
    segs = lathe_segs(segs, float(np.max(np.abs(prof[:, 0]))))
    if smooth:
        V, N, T = K.lathe(prof, center, axis, segs, a0=a0, a1=a1, ref=ref)
        return K.Buf().add(V, N, T, mat)
    b = K.Buf()
    for p, q in zip(prof[:-1], prof[1:]):
        if np.linalg.norm(q - p) < 1e-9:
            continue
        seg = np.array([p, q])
        V, N, T = K.lathe(seg, center, axis, segs, a0=a0, a1=a1, ref=ref)
        b.add(V, N, T, mat)
    return b


def round_prof(points, radius, seg=1):
    """Profile polyline with rounded inner corners (radius scalar or per point)."""
    return K.round_profile(np.asarray(points, float), radius if hasattr(radius, '__len__') else [radius] * len(points), seg)


def disc(center, axis, r_out, r_in, mat, segs=32, thick=0.0, edge=0.0008, ref=None):
    """Flat ring (r_in = 0: a full disc) of thickness `thick` centred on `center` (0 = a single face facing
    +axis), its edges chamfered by `edge`."""
    axis = unit(np.asarray(axis, float))
    c = np.asarray(center, float)
    if thick <= 0:
        return K.disc_buf(c, axis, r_out, mat, r_in=r_in, segs=lathe_segs(segs, r_out), ref=ref)
    h = thick / 2
    e = min(edge, h * 0.8, (r_out - r_in) * 0.3)
    if r_in > 1e-6:
        prof = [(r_in + e, -h), (r_out - e, -h), (r_out, -h + e), (r_out, h - e), (r_out - e, h), (r_in + e, h),
                (r_in, h - e), (r_in, -h + e), (r_in + e, -h)]
    else:
        prof = [(1e-5, -h), (r_out - e, -h), (r_out, -h + e), (r_out, h - e), (r_out - e, h), (1e-5, h)]
    return lathe(prof, c, axis, mat, segs, ref=ref, smooth=False)


# ============================================================================================ plates
def _loop_normals(L):
    """Outward 2D normals of a CCW loop (for a CW loop they point inwards)."""
    T = unit(np.roll(L, -1, 0) - np.roll(L, 1, 0))
    return np.stack([T[:, 1], -T[:, 0]], 1)


def plate(outline, origin, e1, e2, thick, mat, holes=(), r_edge=None, segs=1, step=None, flat=False):
    """A flat plate: outline (2D CCW loop, metres in the plane origin + u*e1 + v*e2) with optional hole loops,
    `thick` along n = e1 x e2 (centred on the plane), every edge rounded with radius r_edge (default thick/2.5).
    Exact normals: flat faces, quarter-circle edges."""
    O = np.asarray(origin, float)
    e1 = unit(np.asarray(e1, float))
    e2 = np.asarray(e2, float)
    e2 = unit(e2 - e1 * np.dot(e2, e1))
    n = np.cross(e1, e2)
    h = thick / 2
    r = min(h * 0.95, thick / 2.5 if r_edge is None else r_edge)
    outer = K.ccw(np.asarray(outline, float))
    if step:
        outer = K.resample_keep(outer, step, True)
    hl = [K.ccw(np.asarray(H, float))[::-1] for H in holes]   # holes clockwise
    loops = [outer] + hl
    b = K.Buf()

    def to3(uv, z):
        return O + uv[:, 0:1] * e1 + uv[:, 1:2] * e2 + n * z

    def nrm3(n2, nz):
        return unit(n2[:, 0:1] * e1 + n2[:, 1:2] * e2 + n * nz)

    inner_loops = []
    for L in loops:
        n2 = _loop_normals(L)
        if flat:
            inner_loops.append(L)
            V = np.vstack([to3(L, h), to3(L, -h)])
            Nn = np.vstack([nrm3(n2, 0.0), nrm3(n2, 0.0)])
            b.add(V, Nn, K.grid_tris(2, len(L), closed=True), mat)
            continue
        Li = L - n2 * r
        inner_loops.append(Li)
        rowsP, rowsN = [], []
        # top edge round (from the top face to the side), side wall, bottom edge round
        for k in range(segs + 1):
            a = 0.5 * math.pi * k / segs
            rowsP.append(to3(Li + n2 * (r * math.sin(a)), h - r + r * math.cos(a)))
            rowsN.append(nrm3(n2 * math.sin(a), math.cos(a)))
        for k in range(segs + 1):
            a = 0.5 * math.pi * k / segs
            rowsP.append(to3(Li + n2 * (r * math.cos(a)), -h + r - r * math.sin(a)))
            rowsN.append(nrm3(n2 * math.cos(a), -math.sin(a)))
        V = np.vstack(rowsP)
        Nn = np.vstack(rowsN)
        tris = K.grid_tris(len(rowsP), len(L), closed=True)
        b.add(V, Nn, tris, mat)
    # faces
    for z, s in ((h, 1.0), (-h, -1.0)):
        ch = K.FlatChart(O + n * z, e1, e2, n * s)
        outer_l = [K.Loop(inner_loops[0], to3(inner_loops[0], z), np.tile(n * s, (len(inner_loops[0]), 1)))]
        holes_l = [K.Loop(Li, to3(Li, z), np.tile(n * s, (len(Li), 1))) for Li in inner_loops[1:]]
        V, Nn, T = K.mesh_region(ch, outer_l, holes_l, None)
        if len(T):
            b.add(V, Nn, T, mat)
    return b


def circle2(c, r, n=12, a0=0.0):
    a = a0 + np.linspace(0, 2 * math.pi, n, endpoint=False)
    return np.stack([c[0] + r * np.cos(a), c[1] + r * np.sin(a)], 1)


def slot2(c0, c1, r, n=8):
    """2D stadium (slot) between centres c0, c1 with radius r (CCW)."""
    c0 = np.asarray(c0, float)
    c1 = np.asarray(c1, float)
    d = unit(c1 - c0)
    ang = math.atan2(d[1], d[0])
    pts = []
    for k in range(n + 1):
        a = ang - math.pi / 2 + math.pi * k / n
        pts.append(c1 + r * np.array([math.cos(a), math.sin(a)]))
    for k in range(n + 1):
        a = ang + math.pi / 2 + math.pi * k / n
        pts.append(c0 + r * np.array([math.cos(a), math.sin(a)]))
    return np.array(pts)


def rounded_poly2(pts, radii, step=0.011, seg_min=2):
    return K.rounded_poly(np.asarray(pts, float), radii, step, True, seg_min)


# ============================================================================================ hardware
def bolt(pos, normal, r=0.0055, h=0.0045, mat='steel', washer=True, nut=False, ref=None, segs=6):
    """Hex bolt head (nut=True: a nut with the stud end showing) sitting on a surface at `pos` facing `normal`."""
    nrm = unit(np.asarray(normal, float))
    p = np.asarray(pos, float)
    b = K.Buf()
    z = 0.0
    if washer:
        b.extend(disc(p + nrm * 0.0009, nrm, r * 1.55, r * 0.55, mat, segs=8))
        b.extend(lathe([(r * 1.55, 0.0), (r * 1.55, 0.0009)], p, nrm, mat, 8, smooth=False))
        z = 0.0009
    if ref is None:
        ref = np.array([0.0, 0.0, 1.0]) if abs(nrm[2]) < 0.9 else np.array([1.0, 0.0, 0.0])
    a1 = unit(np.cross(nrm, ref))
    a2 = np.cross(nrm, a1)
    ang = np.linspace(0, 2 * math.pi, segs, endpoint=False) + math.pi / segs
    ring = np.stack([np.cos(ang), np.sin(ang)], 1) * r
    ch = r * 0.18
    rows = [p + ring[:, 0:1] * a1 + ring[:, 1:2] * a2 + nrm * zz for zz in (z, z + h - ch)]
    top = p + ring[:, 0:1] * (1 - ch / r * 1.2) * a1 + ring[:, 1:2] * (1 - ch / r * 1.2) * a2 + nrm * (z + h)
    quad = np.array([(0, 1, 2), (0, 2, 3)])
    for k in range(segs):
        k2 = (k + 1) % segs
        mid = 0.5 * (ring[k] + ring[k2])
        fn = unit(mid[0] * a1 + mid[1] * a2)
        b.add(np.array([rows[0][k], rows[0][k2], rows[1][k2], rows[1][k]]), np.tile(fn, (4, 1)), quad, mat)
        cn = unit(fn + nrm * 1.2)
        b.add(np.array([rows[1][k], rows[1][k2], top[k2], top[k]]), np.tile(cn, (4, 1)), quad, mat)
    cap = np.vstack([top, (p + nrm * (z + h))[None]])
    b.add(cap, np.tile(nrm, (segs + 1, 1)), np.array([(k, (k + 1) % segs, segs) for k in range(segs)]), mat)
    if nut:
        b.extend(K.cyl_buf(p + nrm * (z + h - 0.0005), p + nrm * (z + h + r * 0.45), r * 0.55, mat, 6))
    return b


def cap_nut(pos, normal, r=0.008, h=0.009, mat='chrome'):
    """Domed cap nut (acorn): hex base + dome."""
    nrm = unit(np.asarray(normal, float))
    p = np.asarray(pos, float)
    b = bolt(p, nrm, r, h * 0.55, mat, washer=False)
    prof = [(r * 0.86, h * 0.5), (r * 0.82, h * 0.72), (r * 0.6, h * 0.92), (r * 0.3, h * 1.0), (1e-5, h * 1.02)]
    b.extend(lathe(prof, p, nrm, mat, segs=14))
    return b


def spring(base, axis, r, h, turns, wire, mat='chrome', segs=6, dead=0.75, ref=None, phase=0.0):
    """Coil spring from `base` along `axis` for length h (coil centre radius r, wire radius `wire`); `dead`
    turns at each end are closed (pitch = wire diameter), the rest open."""
    axis = unit(np.asarray(axis, float))
    if ref is None:
        ref = np.array([1.0, 0, 0]) if abs(axis[0]) < 0.9 else np.array([0, 1.0, 0])
    a1 = unit(np.cross(axis, ref))
    a2 = np.cross(axis, a1)
    n = int(turns * 11) + 1
    tt = np.linspace(0.0, turns, n)
    pd = wire * 2.05
    Ld = pd * dead
    z = np.where(tt < dead, tt * pd,
                 np.where(tt > turns - dead, h - (turns - tt) * pd,
                          Ld + (tt - dead) / max(turns - 2 * dead, 1e-6) * (h - 2 * Ld)))
    ang = tt * 2 * math.pi + phase
    P = np.asarray(base, float) + np.outer(np.cos(ang) * r, a1) + np.outer(np.sin(ang) * r, a2) + np.outer(z, axis)
    return tube(P, wire, mat, segs, cap0='flat', cap1='flat')


def cable(pts, r, mat='trim', segs=6, radii=0.03, step=0.25, arc_deg=18.0):
    """A flexible cable / hose through control points (smoothly bent)."""
    path = bend_path(pts, radii, step, arc_deg)
    return tube(path, r, mat, segs, cap0='flat', cap1='flat'), path


def box(center, size, mat, R=None, bevel=0.003, segs=2):
    """Bevelled box of `size` centred at `center`, rotated by R (3x3, columns = box axes)."""
    s = np.asarray(size, float) / 2
    xf = np.eye(4)
    if R is not None:
        R = np.array(R, float)
        # a mirrored basis would turn the faces inside out (bmesh keeps the winding): the box is symmetric, so
        # flipping one of its axes gives the same box the right way out
        if np.linalg.det(R) < 0:
            R[:, 0] = -R[:, 0]
        xf[:3, :3] = R
    xf[:3, 3] = center
    return K.box_buf(-s, s, mat, bevel, segs, xf=xf)


# ============================================================================================ welds
def dist_to_path(Q, P):
    """Distance from points Q (m,3) to polyline P (n,3) and the closest parameter (segment index, t)."""
    Q = np.asarray(Q, float)
    A = P[:-1]
    Bv = P[1:] - P[:-1]
    L2 = np.maximum((Bv * Bv).sum(1), 1e-12)
    d = Q[:, None, :] - A[None, :, :]
    t = np.clip((d * Bv[None]).sum(2) / L2[None], 0.0, 1.0)
    C = A[None] + t[..., None] * Bv[None]
    dist = np.linalg.norm(Q[:, None, :] - C, axis=2)
    j = np.argmin(dist, axis=1)
    return dist[np.arange(len(Q)), j], j, t[np.arange(len(Q)), j]


def weld(main, r_main, branch, r_branch, at='start', bead=0.0032, mat='paint_b', segs=10, search=0.12,
         main_fn=None, out=0.25):
    """Weld bead where `branch` (path, radius r_branch) enters `main` (path, radius r_main) at its start (or end).
    For each angle round the branch, the first point (marching outwards along the branch from its buried end)
    where the branch surface leaves the main tube is on the intersection curve; a small round bead is swept
    along that closed curve. main_fn(Q) may give a signed distance of the main body instead (< 0 inside)."""
    B = np.asarray(branch, float)
    if at == 'end':
        B = B[::-1]
    T, N, Bn = rmf(B)
    seg = np.linalg.norm(np.diff(B, axis=0), axis=1)
    s = np.concatenate([[0.0], np.cumsum(seg)])
    smax = min(search, s[-1])
    ss = np.linspace(0.0, smax, 220)
    idx = np.clip(np.searchsorted(s, ss) - 1, 0, len(B) - 2)
    Pc = np.stack([np.interp(ss, s, B[:, k]) for k in range(3)], 1)
    ang = np.linspace(0, 2 * math.pi, segs, endpoint=False)
    Nn = N[idx][:, None, :] * np.cos(ang)[None, :, None] + Bn[idx][:, None, :] * np.sin(ang)[None, :, None]
    Q = Pc[:, None, :] + Nn * r_branch
    Qf = Q.reshape(-1, 3)
    if main_fn is not None:
        inside = (main_fn(Qf) < 0).reshape(len(ss), segs)
    else:
        dd, _, _ = dist_to_path(Qf, np.asarray(main, float))
        inside = (dd < r_main).reshape(len(ss), segs)
    pts = []
    nrms = []
    for j in range(segs):
        col = inside[:, j]
        k = np.nonzero(col[:-1] & ~col[1:])[0]
        if len(k) == 0:
            return K.Buf()
        k = k[0] + 1
        pts.append(Q[k, j])
        nrms.append(Nn[k, j])
    pts = np.array(pts)
    nrms = np.array(nrms)
    cur = pts + nrms * (bead * out)
    return tube(np.vstack([cur, cur[:1]]), bead, mat, 4, cap0=None, cap1=None)


# ============================================================================================ misc
def transform(buf, R=None, t=(0, 0, 0)):
    """Rigid transform of a Buf (R 3x3, translation t)."""
    V, N, T, M = buf.arrays()
    R = np.eye(3) if R is None else np.asarray(R, float)
    b = K.Buf()
    if len(T) == 0:
        return b
    V2 = V @ R.T + np.asarray(t, float)
    N2 = N @ R.T
    if np.linalg.det(R) < 0:
        T = T[:, ::-1]
    b.add(V2, N2, T, 'trim')
    b.M = list(M)
    return b


def recolor(buf, mat):
    buf.M = [mat] * len(buf.M)
    return buf


def frame_axes(x, z_hint):
    """3x3 with columns X (given), Y, Z (orthogonalised hint)."""
    return K.frame_from(x, z_hint)


# ============================================================================================ panels
def poly_dist(Q, L):
    """Distance from 2D points Q (m,2) to a closed 2D polyline L (n,2), and the unit direction away from it."""
    A = L
    Bv = np.roll(L, -1, 0) - L
    L2 = np.maximum((Bv * Bv).sum(1), 1e-12)
    d = Q[:, None, :] - A[None, :, :]
    t = np.clip((d * Bv[None]).sum(2) / L2[None], 0.0, 1.0)
    C = A[None] + t[..., None] * Bv[None]
    diff = Q[:, None, :] - C
    dist = np.linalg.norm(diff, axis=2)
    j = np.argmin(dist, axis=1)
    k = np.arange(len(Q))
    return dist[k, j], diff[k, j] / np.maximum(dist[k, j], 1e-12)[:, None]


def panel(outline, origin, e1, e2, mat, bulge=0.012, width=0.05, thick=0.003, r_edge=0.0025, spacing=0.012,
          segs=2, back=True):
    """A pressed panel: a 2D outline (CCW, in origin + u*e1 + v*e2) whose face swells out along n = e1 x e2 by
    `bulge` towards the middle (bulge * (1 - exp(-d / width)), d = distance to the edge), a rounded edge turning
    back by `thick`, and (back=True) a flat inner face. Exact normals from the height law."""
    O = np.asarray(origin, float)
    e1 = unit(np.asarray(e1, float))
    e2 = np.asarray(e2, float)
    e2 = unit(e2 - e1 * np.dot(e2, e1))
    n = np.cross(e1, e2)
    L = K.ccw(np.asarray(outline, float))
    L = K.resample_keep(L, spacing * 0.6, True)
    r = min(r_edge, thick * 0.95)
    n2 = _loop_normals(L)
    Li = L - n2 * r

    def height(Q):
        d, _ = poly_dist(Q, L)
        return bulge * (1.0 - np.exp(-np.maximum(d - r, 0.0) / width))

    def hnorm(Q):
        h = 1e-4
        gx = (height(Q + [h, 0]) - height(Q - [h, 0])) / (2 * h)
        gy = (height(Q + [0, h]) - height(Q - [0, h])) / (2 * h)
        return unit(-gx[:, None] * e1 - gy[:, None] * e2 + n)

    lo, hi = L.min(0), L.max(0)
    pts = K.grid_points(lo[0], hi[0], lo[1], hi[1], spacing, dt=spacing)
    pts = pts + (np.random.RandomState(7).rand(*pts.shape) - 0.5) * spacing * 0.08

    class _C:
        sdf = staticmethod(lambda P: (np.asarray(P) - O) @ n)

        def to3d(self, uv, level=None):
            uv = np.asarray(uv, float)
            hh = height(uv)
            return O + uv[:, 0:1] * e1 + uv[:, 1:2] * e2 + n * hh[:, None], hnorm(uv)

    ch = _C()
    hb = height(Li)
    Pb = O + Li[:, 0:1] * e1 + Li[:, 1:2] * e2 + n * hb[:, None]
    Nb = hnorm(Li)
    V, Nn, T = K.mesh_region(ch, [K.Loop(Li, Pb, Nb)], [], pts, spacing=spacing, clear=0.45)
    b = K.Buf().add(V, Nn, T, mat)
    # rounded edge: from the face edge round to the side, then down to the back plane
    rowsP, rowsN = [], []
    for k in range(segs + 1):
        a = 0.5 * math.pi * k / segs
        q = Li + n2 * (r * math.sin(a))
        z = hb - r + r * math.cos(a)
        rowsP.append(O + q[:, 0:1] * e1 + q[:, 1:2] * e2 + n * z[:, None])
        nn = unit(n2[:, 0:1] * math.sin(a) * e1 + n2[:, 1:2] * math.sin(a) * e2 + n * math.cos(a))
        rowsN.append(nn)
    q = Li + n2 * r
    rowsP.append(O + q[:, 0:1] * e1 + q[:, 1:2] * e2 - n * thick)
    rowsN.append(unit(n2[:, 0:1] * e1 + n2[:, 1:2] * e2))
    b.add(np.vstack(rowsP), np.vstack(rowsN), K.grid_tris(len(rowsP), len(L), closed=True), mat)
    if back:
        Lb = L.copy()
        P3 = O + Lb[:, 0:1] * e1 + Lb[:, 1:2] * e2 - n * thick
        chb = K.FlatChart(O - n * thick, e1, e2, -n)
        V, Nn, T = K.mesh_region(chb, [K.Loop(Lb, P3, np.tile(-n, (len(Lb), 1)))], [], None)
        b.add(V, Nn, T, mat)
    return b


def arc_pts(center, axis, ref, r, a0, a1, n):
    """Points on a circle about `axis` through `center` (angle 0 = ref direction, degrees)."""
    axis = unit(np.asarray(axis, float))
    ref = unit(np.asarray(ref, float) - axis * np.dot(ref, axis))
    side = np.cross(axis, ref)
    a = np.radians(np.linspace(a0, a1, n))
    return np.asarray(center, float) + r * (np.cos(a)[:, None] * ref + np.sin(a)[:, None] * side)
