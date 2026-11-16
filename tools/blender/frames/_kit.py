"""
Modelling kit for the ModCar frames (docs/MODCAR.md section 2.2 and 6), used by tools/blender/frames/<id>.py.

How the car shells are built
  * The exact surface of a shell is an SDF written with numpy (vectorised). Fillets come from round
    intersections (r_int), so every blend is G1 and the SDF gradient gives exact normals: highlights stay
    clean on any triangulation, no subdivision needed.
  * A parameterisation P(u, t) close to that surface (a 'proxy', class Chart) says where vertices go.
    u, t are in metres so the parameter domain is roughly isometric.
  * Regions of the (u, t) domain (panels, fixed body, around arches and lamp holes ...) are triangulated with
    a constrained Delaunay triangulation, mapped through the proxy and projected onto the SDF along the
    proxy normal. Boundary vertices can carry fixed 3D positions so neighbouring regions share them exactly.
  * Edges of openings and panel gaps get explicit rolled edges, flanges and hems (roll_edge), seals and
    trims are swept profiles (sweep), round things are lathes; small hard-surface parts are bevelled boxes.

Everything ends up in Blender objects with custom split normals (exact normals for the analytic parts,
angle-split weighted normals for the bevelled parts). Blender axes: X forward, Y left, Z up, metres.
"""
import math
import sys

sys.dont_write_bytecode = True

import bmesh  # noqa: E402
import bpy  # noqa: E402
import numpy as np  # noqa: E402
from mathutils import Matrix, Vector, geometry, kdtree  # noqa: E402

from lib import modcar as mc  # noqa: E402

# ============================================================================================ scalar helpers


def sstep(e0, e1, x):
    """Smoothstep from e0 to e1 (vectorised); e0 > e1 gives a falling step."""
    t = np.clip((np.asarray(x, float) - e0) / (e1 - e0), 0.0, 1.0)
    return t * t * (3.0 - 2.0 * t)


def lerp(a, b, t):
    return a + (b - a) * t


class Spline:
    """Cubic Hermite spline through (xs, ys), xs ascending. monotone=True: Fritsch-Carlson tangents (no
    overshoot), else Catmull-Rom. Linear extrapolation outside the knots. Vectorised."""

    def __init__(self, xs, ys, monotone=False):
        x = np.asarray(xs, float)
        y = np.asarray(ys, float)
        n = len(x)
        d = np.diff(y) / np.diff(x)
        m = np.zeros(n)
        if n == 2:
            m[:] = d[0]
        else:
            m[0] = d[0]
            m[-1] = d[-1]
            m[1:-1] = (y[2:] - y[:-2]) / (x[2:] - x[:-2])
            if monotone:
                for k in range(n - 1):
                    if d[k] == 0.0:
                        m[k] = m[k + 1] = 0.0
                for k in range(1, n - 1):
                    if d[k - 1] * d[k] <= 0:
                        m[k] = 0.0
                for k in range(n - 1):
                    if d[k] == 0:
                        continue
                    a, b = m[k] / d[k], m[k + 1] / d[k]
                    s = a * a + b * b
                    if s > 9.0:
                        tau = 3.0 / math.sqrt(s)
                        m[k] = tau * a * d[k]
                        m[k + 1] = tau * b * d[k]
        self.x, self.y, self.m = x, y, m

    def __call__(self, x):
        x = np.asarray(x, float)
        xs, ys, m = self.x, self.y, self.m
        i = np.clip(np.searchsorted(xs, x) - 1, 0, len(xs) - 2)
        x0 = xs[i]
        h = xs[i + 1] - x0
        s = np.clip((x - x0) / h, 0.0, 1.0)
        s2 = s * s
        s3 = s2 * s
        y = (2 * s3 - 3 * s2 + 1) * ys[i] + (s3 - 2 * s2 + s) * h * m[i] + (-2 * s3 + 3 * s2) * ys[i + 1] + (s3 - s2) * h * m[i + 1]
        y = np.where(x < xs[0], ys[0] + m[0] * (x - xs[0]), y)
        y = np.where(x > xs[-1], ys[-1] + m[-1] * (x - xs[-1]), y)
        return y


def arr(v):
    return np.asarray(v, float)


def unit(v):
    v = np.asarray(v, float)
    n = np.linalg.norm(v, axis=-1, keepdims=True)
    return v / np.maximum(n, 1e-12)


# ============================================================================================ SDF


def r_int(a, b, r):
    """Intersection of two (near-)distance fields with a circular fillet of radius r (r may be an array)."""
    ua = np.maximum(a + r, 0.0)
    ub = np.maximum(b + r, 0.0)
    return np.minimum(-r, np.maximum(a, b)) + np.sqrt(ua * ua + ub * ub)


def r_uni(a, b, r):
    """Union with a circular (concave) fillet of radius r."""
    ua = np.maximum(r - a, 0.0)
    ub = np.maximum(r - b, 0.0)
    return np.maximum(r, np.minimum(a, b)) - np.sqrt(ua * ua + ub * ub)


def r_sub(a, b, r):
    """a minus b with a fillet."""
    return r_int(a, -b, r)


def s_max(a, b, k):
    """Polynomial smooth max (blend width k)."""
    h = np.clip(0.5 - 0.5 * (b - a) / k, 0.0, 1.0)
    return b + (a - b) * h + k * h * (1.0 - h)


def s_min(a, b, k):
    return -s_max(-a, -b, k)


def sd_box2(px, py, hx, hy, r):
    """2D rounded rectangle distance (centred), corner radius r."""
    qx = np.abs(px) - hx + r
    qy = np.abs(py) - hy + r
    return np.sqrt(np.maximum(qx, 0) ** 2 + np.maximum(qy, 0) ** 2) + np.minimum(np.maximum(qx, qy), 0.0) - r


def grad(f, P, h=1e-5):
    P = np.asarray(P, float)
    g = np.empty_like(P)
    for k in range(3):
        d = np.zeros(3)
        d[k] = h
        g[:, k] = (f(P + d) - f(P - d)) / (2.0 * h)
    return g


def sdf_normals(f, P, h=1e-5):
    return unit(grad(f, P, h))


def raycast(f, O, D, level=0.0, tmax=0.3, iters=120, max_step=0.02):
    """First crossing of f = level marching from O along D (unit). O must be outside (f > level).
    Returns (t, hit). Sphere tracing with a capped step, then bisection on the overshoot."""
    O = np.asarray(O, float)
    D = np.asarray(D, float)
    n = len(O)
    t = np.zeros(n)
    tprev = np.zeros(n)
    state = np.zeros(n, np.int8)  # 0 marching, 1 converged, 2 overshot, 3 missed, 4 started inside
    d0 = f(O) - level
    state[d0 < 0] = 4
    for _ in range(iters):
        idx = np.nonzero(state == 0)[0]
        if len(idx) == 0:
            break
        d = f(O[idx] + D[idx] * t[idx, None]) - level
        neg = d < 0.0
        conv = (~neg) & (d < 2e-7)
        state[idx[neg]] = 2
        state[idx[conv]] = 1
        mv = ~neg & ~conv
        im = idx[mv]
        tprev[im] = t[im]
        t[im] += np.clip(d[mv] * 0.85, 1e-5, max_step)
        state[im[t[im] > tmax]] = 3
    b = np.nonzero(state == 2)[0]
    if len(b):
        lo = tprev[b].copy()
        hi = t[b].copy()
        for _ in range(40):
            mid = 0.5 * (lo + hi)
            inside = (f(O[b] + D[b] * mid[:, None]) - level) < 0.0
            hi = np.where(inside, mid, hi)
            lo = np.where(inside, lo, mid)
        t[b] = 0.5 * (lo + hi)
    hit = (state == 1) | (state == 2)
    return t, hit


def project(f, P, Nrm, level=0.0, back=0.04, tmax=0.12):
    """Move points P onto f = level along their (approximate) normals Nrm: march from P + back*N inwards.
    Points that miss fall back to Newton snapping. Returns (P', N') with N' = exact SDF normals."""
    P = np.asarray(P, float)
    Nrm = unit(Nrm)
    O = P + Nrm * back
    t, hit = raycast(f, O, -Nrm, level, tmax=back + tmax)
    Q = O - Nrm * t[:, None]
    if not hit.all():
        Q[~hit] = snap(f, P[~hit], level)
    return Q, sdf_normals(f, Q)


def snap(f, P, level=0.0, iters=10):
    P = np.array(P, float)
    for _ in range(iters):
        d = f(P) - level
        g = grad(f, P)
        P -= (d / np.maximum((g * g).sum(1), 1e-12))[:, None] * g
    return P


# ============================================================================================ charts


class Chart:
    """A proxy parameterisation of one shell: P(u, t) -> 3D points (vectorised), outward normals by finite
    differences, an inverse map (3D -> (u, t)) and the projection onto an SDF (with an iso level)."""

    def __init__(self, P, sdf, u_range, t_range, level=0.0, flip=False, inv_res=(500, 160)):
        self.Pf = P
        self.sdf = sdf
        self.u0, self.u1 = u_range
        self.t0, self.t1 = t_range
        self.level = level
        self.flip = flip
        self._inv = None
        self.inv_res = inv_res

    def P(self, u, t):
        return self.Pf(np.asarray(u, float), np.asarray(t, float))

    def frame(self, u, t, h=1e-4):
        u = np.asarray(u, float)
        t = np.asarray(t, float)
        Pu = (self.P(u + h, t) - self.P(u - h, t)) / (2 * h)
        Pt = (self.P(u, t + h) - self.P(u, t - h)) / (2 * h)
        n = np.cross(Pu, Pt)
        if self.flip:
            n = -n
        return self.P(u, t), unit(n), Pu, Pt

    def to3d(self, uv, level=None):
        uv = np.asarray(uv, float)
        P, n, _, _ = self.frame(uv[:, 0], uv[:, 1])
        return project(self.sdf, P, n, self.level if level is None else level)

    def _build_inv(self):
        nu, nt = self.inv_res
        uu, tt = np.meshgrid(np.linspace(self.u0, self.u1, nu), np.linspace(self.t0, self.t1, nt), indexing='ij')
        U = uu.ravel()
        T = tt.ravel()
        Pts = self.P(U, T)
        kd = kdtree.KDTree(len(U))
        for i, p in enumerate(Pts):
            kd.insert(p, i)
        kd.balance()
        self._inv = (kd, U, T)

    def to2d(self, pts, iters=6):
        """Inverse map: nearest proxy point, refined by Gauss-Newton on (u, t)."""
        if self._inv is None:
            self._build_inv()
        kd, U, T = self._inv
        pts = np.asarray(pts, float)
        u = np.empty(len(pts))
        t = np.empty(len(pts))
        for i, p in enumerate(pts):
            _, j, _ = kd.find(p)
            u[i] = U[j]
            t[i] = T[j]
        for _ in range(iters):
            P, _, Pu, Pt = self.frame(u, t)
            r = pts - P
            a = (Pu * Pu).sum(1)
            b = (Pu * Pt).sum(1)
            c = (Pt * Pt).sum(1)
            e = (Pu * r).sum(1)
            g = (Pt * r).sum(1)
            det = a * c - b * b
            det = np.where(np.abs(det) < 1e-14, 1e-14, det)
            du = (c * e - b * g) / det
            dt = (a * g - b * e) / det
            u += np.clip(du, -0.05, 0.05)
            t += np.clip(dt, -0.05, 0.05)
        return np.stack([u, t], 1)


class TopChart:
    """Height-field chart: (u, t) = (x, y); vertical rays from above (or below with up=False)."""

    def __init__(self, sdf, level=0.0, z_from=3.0, up=True):
        self.sdf = sdf
        self.level = level
        self.z_from = z_from
        self.up = up

    def to3d(self, uv, level=None):
        uv = np.asarray(uv, float)
        s = 1.0 if self.up else -1.0
        O = np.stack([uv[:, 0], uv[:, 1], np.full(len(uv), self.z_from * s)], 1)
        D = np.tile([0.0, 0.0, -s], (len(uv), 1))
        lv = self.level if level is None else level
        t, hit = raycast(self.sdf, O, D, lv, tmax=self.z_from * 2 + 1, max_step=0.05)
        self.last_hit = hit
        Q = O + D * t[:, None]
        return Q, sdf_normals(self.sdf, Q)

    def to2d(self, pts):
        pts = np.asarray(pts, float)
        return pts[:, :2].copy()


class FrameChart:
    """Chart on an arbitrary plane: uv -> O + u*e1 + v*e2, rays cast along -n from `start` above the plane."""

    def __init__(self, sdf, O, e1, e2, level=0.0, start=0.5):
        self.sdf = sdf
        self.O = np.asarray(O, float)
        self.e1 = unit(np.asarray(e1, float))
        e2 = np.asarray(e2, float)
        e2 = e2 - self.e1 * np.dot(e2, self.e1)
        self.e2 = unit(e2)
        self.n = np.cross(self.e1, self.e2)
        self.level = level
        self.start = start

    def to3d(self, uv, level=None):
        uv = np.asarray(uv, float)
        O = self.O + uv[:, 0:1] * self.e1 + uv[:, 1:2] * self.e2 + self.n * self.start
        D = np.tile(-self.n, (len(uv), 1))
        lv = self.level if level is None else level
        t, hit = raycast(self.sdf, O, D, lv, tmax=self.start * 2 + 0.5, max_step=0.03)
        self.last_hit = hit
        Q = O + D * t[:, None]
        return Q, sdf_normals(self.sdf, Q)

    def to2d(self, pts):
        d = np.asarray(pts, float) - self.O
        return np.stack([d @ self.e1, d @ self.e2], 1)


class PlaneChart:
    """Chart with rays along a fixed axis: axis 0 (x, rays -x if sign>0) etc. (u, t) are the other two coords."""

    def __init__(self, sdf, axis, sign=1.0, level=0.0, start=3.0):
        self.sdf = sdf
        self.axis = axis
        self.sign = sign
        self.level = level
        self.start = start
        self.others = [k for k in range(3) if k != axis]

    def to3d(self, uv, level=None):
        uv = np.asarray(uv, float)
        O = np.zeros((len(uv), 3))
        O[:, self.others[0]] = uv[:, 0]
        O[:, self.others[1]] = uv[:, 1]
        O[:, self.axis] = self.start * self.sign
        D = np.zeros((len(uv), 3))
        D[:, self.axis] = -self.sign
        lv = self.level if level is None else level
        t, hit = raycast(self.sdf, O, D, lv, tmax=self.start * 2 + 1, max_step=0.05)
        self.last_hit = hit
        Q = O + D * t[:, None]
        return Q, sdf_normals(self.sdf, Q)

    def to2d(self, pts):
        pts = np.asarray(pts, float)
        return pts[:, self.others].copy()


# ============================================================================================ 2D polygons


def loop_area(L):
    x, y = L[:, 0], L[:, 1]
    return 0.5 * np.sum(x * np.roll(y, -1) - np.roll(x, -1) * y)


def in_poly(P, L):
    """Even-odd point in polygon, vectorised over points P (m,2) for one closed loop L (n,2)."""
    x = P[:, 0][:, None]
    y = P[:, 1][:, None]
    x0 = L[:, 0][None, :]
    y0 = L[:, 1][None, :]
    x1 = np.roll(L[:, 0], -1)[None, :]
    y1 = np.roll(L[:, 1], -1)[None, :]
    cond = (y0 > y) != (y1 > y)
    with np.errstate(divide='ignore', invalid='ignore'):
        xi = x0 + (y - y0) * (x1 - x0) / (y1 - y0)
    c = cond & (x < xi)
    return (np.count_nonzero(c, axis=1) % 2) == 1


def in_region(P, outer, holes):
    P = np.asarray(P, float)
    ins = np.zeros(len(P), bool)
    for L in outer:
        for s in range(0, len(P), 4000):
            ins[s:s + 4000] |= in_poly(P[s:s + 4000], L)
    for L in holes:
        for s in range(0, len(P), 4000):
            ins[s:s + 4000] &= ~in_poly(P[s:s + 4000], L)
    return ins


def resample(L, step, closed=True):
    """Resample a polyline at roughly constant spacing (keeps the end points)."""
    L = np.asarray(L, float)
    pts = np.vstack([L, L[:1]]) if closed else L
    seg = np.linalg.norm(np.diff(pts, axis=0), axis=1)
    s = np.concatenate([[0], np.cumsum(seg)])
    total = s[-1]
    n = max(int(math.ceil(total / step)), 3 if closed else 1)
    q = np.linspace(0, total, n + 1)
    if closed:
        q = q[:-1]
    out = np.stack([np.interp(q, s, pts[:, k]) for k in range(pts.shape[1])], 1)
    return out


def rrect_loop(cx, cy, hx, hy, r, step):
    """Rounded rectangle loop (2D, CCW) sampled at about `step`."""
    r = min(r, hx, hy)
    pts = []
    for (ox, oy, a0) in ((hx - r, hy - r, 0.0), (-(hx - r), hy - r, 90.0), (-(hx - r), -(hy - r), 180.0), (hx - r, -(hy - r), 270.0)):
        n = max(2, int(math.ceil(r * math.pi / 2 / step)))
        for k in range(n):
            a = math.radians(a0 + 90.0 * k / n)
            pts.append((cx + ox + r * math.cos(a), cy + oy + r * math.sin(a)))
        # straight edge to next corner
    pts = np.array(pts)
    return resample(pts, step, True)


def circle_loop(cx, cy, r, step, a0=0.0):
    n = max(8, int(math.ceil(2 * math.pi * r / step)))
    a = a0 + np.linspace(0, 2 * math.pi, n, endpoint=False)
    return np.stack([cx + r * np.cos(a), cy + r * np.sin(a)], 1)


# ============================================================================================ region meshing


class Loop:
    """A boundary loop with optional fixed 3D positions / normals (shared with a neighbour region)."""

    def __init__(self, uv, P=None, N=None, closed=True):
        self.uv = np.asarray(uv, float)
        self.P = None if P is None else np.asarray(P, float)
        self.N = None if N is None else np.asarray(N, float)
        self.closed = closed


def rounded_poly(pts, radii, step, closed=True, seg_min=3, arc_step=None):
    """Polygon (2D) with rounded corners (radius per vertex, 0 = sharp): straight parts sampled at about
    `step`, arcs at `arc_step` (default step)."""
    arc_step = arc_step or step
    pts = np.asarray(pts, float)
    n = len(pts)
    radii = np.broadcast_to(np.asarray(radii, float), (n,))
    out = []
    rng = range(n) if closed else range(1, n - 1)
    if not closed:
        out.append(pts[0])
    for i in rng:
        p0, p1, p2 = pts[(i - 1) % n], pts[i], pts[(i + 1) % n]
        r = float(radii[i])
        if r <= 0:
            out.append(p1)
            continue
        d0 = unit(p0 - p1)
        d1 = unit(p2 - p1)
        ang = math.acos(float(np.clip(np.dot(d0, d1), -1, 1)))
        if ang < 1e-3 or abs(ang - math.pi) < 1e-3:
            out.append(p1)
            continue
        tl = min(r / math.tan(ang / 2), 0.49 * np.linalg.norm(p0 - p1), 0.49 * np.linalg.norm(p2 - p1))
        rr = tl * math.tan(ang / 2)
        a = p1 + d0 * tl
        b = p1 + d1 * tl
        c = p1 + unit(d0 + d1) * (rr / math.sin(ang / 2))
        a0 = math.atan2(a[1] - c[1], a[0] - c[0])
        a1 = math.atan2(b[1] - c[1], b[0] - c[0])
        da = (a1 - a0 + math.pi) % (2 * math.pi) - math.pi
        k = max(seg_min, int(math.ceil(abs(da) * rr / arc_step)))
        for j in range(k + 1):
            aa = a0 + da * j / k
            out.append(c + rr * np.array([math.cos(aa), math.sin(aa)]))
    if not closed:
        out.append(pts[-1])
    out = np.array(out)
    return resample_keep(out, step, closed)


def coarse_idx(P, tol=0.0015):
    """Indices of the points of an open polyline (2D or 3D) worth keeping: a point is dropped while every skipped
    point stays within tol of the chord from the last kept point to the next one (straight runs keep their
    ends, curves keep enough points)."""
    P = np.asarray(P, float)
    if len(P) < 3:
        return np.arange(len(P))
    keep = [0]
    i = 0
    while i < len(P) - 1:
        j = i + 1
        while j + 1 < len(P):
            a, c = P[i], P[j + 1]
            ab = c - a
            L = float(np.linalg.norm(ab))
            mid = P[i + 1:j + 1]
            if L < 1e-9:
                break
            t = np.clip(((mid - a) @ ab) / (L * L), 0.0, 1.0)
            d = np.linalg.norm(mid - (a + t[:, None] * ab), axis=1)
            if float(d.max()) > tol:
                break
            j += 1
        keep.append(j)
        i = j
    return np.array(keep)


def resample_keep(L, step, closed=True):
    """Subdivide long segments so no segment is longer than `step` (keeps every input point)."""
    L = np.asarray(L, float)
    out = []
    n = len(L)
    m = n if closed else n - 1
    for i in range(m):
        a = L[i]
        b = L[(i + 1) % n]
        k = max(1, int(math.ceil(np.linalg.norm(b - a) / step)))
        for j in range(k):
            out.append(a + (b - a) * j / k)
    if not closed:
        out.append(L[-1])
    out = np.array(out)
    # drop near duplicates
    keep = [0]
    for i in range(1, len(out)):
        if np.linalg.norm(out[i] - out[keep[-1]]) > step * 0.05:
            keep.append(i)
    out = out[keep]
    if closed and len(out) > 2 and np.linalg.norm(out[-1] - out[0]) < step * 0.05:
        out = out[:-1]
    return out


def offset_loop2(L, d, closed=True):
    """Offset a 2D polyline by d along its left normal (d > 0 = left of the travel direction).
    For a CCW loop, d < 0 offsets outwards."""
    L = np.asarray(L, float)
    if closed:
        T = np.roll(L, -1, 0) - np.roll(L, 1, 0)
    else:
        T = np.gradient(L, axis=0)
    T = unit(T)
    Nl = np.stack([-T[:, 1], T[:, 0]], 1)
    return L + Nl * d


def ccw(L):
    """Return the loop oriented counter-clockwise."""
    return L if loop_area(L) > 0 else L[::-1].copy()


def rect_loop(us, ts):
    """Closed loop around the rectangle spanned by the sample arrays us, ts (CCW in (u, t))."""
    us = np.asarray(us, float)
    ts = np.asarray(ts, float)
    b = np.stack([us, np.full(len(us), ts[0])], 1)
    r = np.stack([np.full(len(ts) - 2, us[-1]), ts[1:-1]], 1)
    t = np.stack([us[::-1], np.full(len(us), ts[-1])], 1)
    left = np.stack([np.full(len(ts) - 2, us[0]), ts[1:-1][::-1]], 1)
    return np.vstack([b, r, t, left])


def densify(uv, steps_fn, closed=True):
    """Insert points so that consecutive points are at most steps_fn(midpoint) apart (2D)."""
    uv = np.asarray(uv, float)
    out = []
    n = len(uv)
    m = n if closed else n - 1
    for i in range(m):
        a = uv[i]
        b = uv[(i + 1) % n]
        mid = 0.5 * (a + b)
        st = float(steps_fn(mid))
        k = max(1, int(math.ceil(np.linalg.norm(b - a) / max(st, 1e-5))))
        for j in range(k):
            out.append(a + (b - a) * j / k)
    if not closed:
        out.append(uv[-1])
    return np.array(out)


def grid_points(u0, u1, t0, t1, du, dt_fn=None, dt=None, u_fn=None):
    """Interior candidate points: u at spacing du (or the explicit array u_fn), t rows from dt_fn (array) or
    at spacing dt."""
    us = np.asarray(u_fn, float) if u_fn is not None else np.linspace(u0, u1, max(2, int(round((u1 - u0) / du)) + 1))
    ts = np.asarray(dt_fn, float) if dt_fn is not None else np.linspace(t0, t1, max(2, int(round((t1 - t0) / dt)) + 1))
    uu, tt = np.meshgrid(us, ts, indexing='ij')
    return np.stack([uu.ravel(), tt.ravel()], 1)


def mesh_region(chart, outer, holes=(), pts=None, clear=0.5, spacing=0.03, level=None, keep=None):
    """Triangulate the region (outer loops minus holes) of a chart's 2D domain.
    outer/holes: lists of Loop. pts: interior candidate points (m,2); those closer than clear*spacing to a
    boundary are dropped (spacing may be an array per point). keep: optional extra predicate on 2D centroids.
    Returns (V3, N3, tris) with exact positions on the chart's surface (iso level)."""
    loops = list(outer) + list(holes)
    bpts = []
    fixedP = []
    fixedN = []
    edges = []
    base = 0
    for L in loops:
        n = len(L.uv)
        bpts.append(L.uv)
        fixedP.append(L.P if L.P is not None else np.full((n, 3), np.nan))
        fixedN.append(L.N if L.N is not None else np.full((n, 3), np.nan))
        m = n if L.closed else n - 1
        for i in range(m):
            edges.append((base + i, base + (i + 1) % n))
        base += n
    B = np.vstack(bpts)
    FP = np.vstack(fixedP)
    FN = np.vstack(fixedN)
    outer_uv = [L.uv for L in outer]
    holes_uv = [L.uv for L in holes]
    G = np.zeros((0, 2))
    if pts is not None and len(pts):
        pts = np.asarray(pts, float)
        ins = in_region(pts, outer_uv, holes_uv)
        sp = np.broadcast_to(np.asarray(spacing, float), (len(pts),))
        # distance to the boundary: densified boundary in a kd tree
        dense = []
        for L in loops:
            Lc = np.vstack([L.uv, L.uv[:1]]) if L.closed else L.uv
            dense.append(resample(Lc, max(float(np.min(sp)) * 0.25, 1e-4), closed=False))
        D = np.vstack(dense)
        kd = kdtree.KDTree(len(D))
        for i, p in enumerate(D):
            kd.insert((p[0], p[1], 0.0), i)
        kd.balance()
        cand = np.nonzero(ins)[0]
        ok = np.zeros(len(pts), bool)
        for i in cand:
            _, _, dist = kd.find((pts[i, 0], pts[i, 1], 0.0))
            ok[i] = dist > clear * sp[i]
        G = pts[ok]
    V = np.vstack([B, G])
    res = geometry.delaunay_2d_cdt([Vector((float(p[0]), float(p[1]))) for p in V], edges, [], 0, 1e-7, True)
    V2 = np.array([(v.x, v.y) for v in res[0]])
    F = res[2]
    orig = res[3]
    tris = np.array([f for f in F if len(f) == 3], dtype=np.int64)
    if len(tris) == 0:
        return np.zeros((0, 3)), np.zeros((0, 3)), np.zeros((0, 3), np.int64)
    cen = V2[tris].mean(axis=1)
    inside = in_region(cen, outer_uv, holes_uv)
    if keep is not None:
        inside &= keep(cen)
    tris = tris[inside]
    used = np.unique(tris)
    remap = -np.ones(len(V2), np.int64)
    remap[used] = np.arange(len(used))
    tris = remap[tris]
    V2u = V2[used]
    P3 = np.full((len(used), 3), np.nan)
    N3 = np.full((len(used), 3), np.nan)
    nb = len(B)
    for k, vi in enumerate(used):
        o = orig[vi]
        for j in o:
            if j < nb and not np.isnan(FP[j, 0]):
                P3[k] = FP[j]
                if not np.isnan(FN[j, 0]):
                    N3[k] = FN[j]
                break
    need = np.isnan(P3[:, 0])
    missed = np.zeros(len(P3), bool)
    if need.any():
        if hasattr(chart, 'last_hit'):
            chart.last_hit = None
        q, nq = chart.to3d(V2u[need], level)
        P3[need] = q
        N3[need] = nq
        h = getattr(chart, 'last_hit', None)
        if h is not None and len(h) == int(need.sum()):
            missed[np.nonzero(need)[0][~np.asarray(h, bool)]] = True
    needn = np.isnan(N3[:, 0])
    if needn.any():
        N3[needn] = sdf_normals(chart.sdf, P3[needn])
    if missed.any():
        tris = tris[~missed[tris].any(axis=1)]
    return P3, N3, tris


def _split_loop(L, lines):
    """Insert the crossings of a Loop with axis-aligned lines (axis, value, lo, hi) as vertices. Fixed 3D
    positions / normals are interpolated. Returns (new Loop, list of (line index, coordinate along the line,
    vertex index in the new loop))."""
    uv = L.uv
    n = len(uv)
    m = n if L.closed else n - 1
    out_uv, out_P, out_N, cross = [], [], [], []
    hasP = L.P is not None
    hasN = L.N is not None
    for i in range(n):
        out_uv.append(uv[i])
        if hasP:
            out_P.append(L.P[i])
        if hasN:
            out_N.append(L.N[i])
        for li, (ax, val, lo, hi) in enumerate(lines):
            if abs(uv[i][ax] - val) < 1e-9 and lo - 1e-9 <= uv[i][1 - ax] <= hi + 1e-9:
                cross.append((li, float(uv[i][1 - ax]), len(out_uv) - 1))
        if i >= m:
            continue
        j = (i + 1) % n
        p, q = uv[i], uv[j]
        ins = []
        for li, (ax, val, lo, hi) in enumerate(lines):
            a, b = p[ax] - val, q[ax] - val
            if a * b < 0 and abs(a) > 1e-9 and abs(b) > 1e-9:
                f = a / (a - b)
                c = p + (q - p) * f
                if lo - 1e-9 <= c[1 - ax] <= hi + 1e-9:
                    ins.append((f, li, c))
        for f, li, c in sorted(ins, key=lambda e: e[0]):
            c = c.copy()
            c[lines[li][0]] = lines[li][1]
            out_uv.append(c)
            if hasP:
                out_P.append(L.P[i] + (L.P[j] - L.P[i]) * f)
            if hasN:
                out_N.append(unit(L.N[i] + (L.N[j] - L.N[i]) * f))
            cross.append((li, float(c[1 - lines[li][0]]), len(out_uv) - 1))
    NL = Loop(np.array(out_uv), np.array(out_P) if hasP else None, np.array(out_N) if hasN else None, L.closed)
    return NL, cross


def mesh_region_split(chart, outer, holes=(), pts=None, lines=(), zone_fn=None, clear=0.5, spacing=0.03, level=None,
                      line_step=None):
    """mesh_region with axis-aligned constraint lines through the region, so that material zones get exact
    boundaries. lines: (axis, value, lo, hi): axis 0 = the line u = value for t in [lo, hi], axis 1 = the line
    t = value for u in [lo, hi]. The loops get vertices where they cross a line (interpolated fixed P / N).
    zone_fn(centroids_uv) -> int array (default all 0). Returns (V3, N3, tris, zone)."""
    lines = [(int(ln[0]), float(ln[1]), float(ln[2]), float(ln[3])) for ln in lines]
    outer = list(outer)
    holes = list(holes)
    new_loops = []
    crossings = []
    for L in outer + holes:
        NL, cr = _split_loop(L, lines)
        new_loops.append(NL)
        crossings.append(cr)
    outer_n = new_loops[:len(outer)]
    holes_n = new_loops[len(outer):]
    bpts, fixedP, fixedN, edges = [], [], [], []
    base = 0
    gidx = []
    for L, cr in zip(new_loops, crossings):
        k = len(L.uv)
        bpts.append(L.uv)
        fixedP.append(L.P if L.P is not None else np.full((k, 3), np.nan))
        fixedN.append(L.N if L.N is not None else np.full((k, 3), np.nan))
        mm = k if L.closed else k - 1
        for i in range(mm):
            edges.append((base + i, base + (i + 1) % k))
        gidx.append([(li, c, base + vi) for (li, c, vi) in cr])
        base += k
    B = np.vstack(bpts)
    FP = np.vstack(fixedP)
    FN = np.vstack(fixedN)
    outer_uv = [L.uv for L in outer_n]
    holes_uv = [L.uv for L in holes_n]
    step = line_step or float(np.min(np.asarray(spacing, float)))
    # constraint segments along every line, inside the region
    extra = []
    for li, (ax, val, lo, hi) in enumerate(lines):
        cs = sorted([(c, vi) for cr in gidx for (l2, c, vi) in cr if l2 == li], key=lambda e: e[0])
        stops = [(lo, None)] + cs + [(hi, None)]
        for (c0, v0), (c1, v1) in zip(stops[:-1], stops[1:]):
            if c1 - c0 < 1e-7:
                continue
            mid = np.zeros((1, 2))
            mid[0, ax] = val
            mid[0, 1 - ax] = 0.5 * (c0 + c1)
            if not in_region(mid, outer_uv, holes_uv)[0]:
                continue
            k = max(1, int(math.ceil((c1 - c0) / step)))
            ids = []
            for j in range(k + 1):
                if j == 0 and v0 is not None:
                    ids.append(v0)
                    continue
                if j == k and v1 is not None:
                    ids.append(v1)
                    continue
                q = np.zeros(2)
                q[ax] = val
                q[1 - ax] = c0 + (c1 - c0) * j / k
                extra.append(q)
                ids.append(base + len(extra) - 1)
            for a_, b_ in zip(ids[:-1], ids[1:]):
                edges.append((a_, b_))
    E = np.array(extra).reshape(-1, 2)
    nb = len(B)
    G = np.zeros((0, 2))
    if pts is not None and len(pts):
        pts = np.asarray(pts, float)
        ins = in_region(pts, outer_uv, holes_uv)
        sp = np.broadcast_to(np.asarray(spacing, float), (len(pts),))
        dstep = max(float(np.min(sp)) * 0.25, 1e-4)
        dense = []
        for L in new_loops:
            Lc = np.vstack([L.uv, L.uv[:1]]) if L.closed else L.uv
            dense.append(resample(Lc, dstep, closed=False))
        for (ax, val, lo, hi) in lines:
            q = np.zeros((max(2, int((hi - lo) / dstep) + 1), 2))
            q[:, ax] = val
            q[:, 1 - ax] = np.linspace(lo, hi, len(q))
            dense.append(q)
        Dn = np.vstack(dense)
        kd = kdtree.KDTree(len(Dn))
        for i, p in enumerate(Dn):
            kd.insert((p[0], p[1], 0.0), i)
        kd.balance()
        ok = np.zeros(len(pts), bool)
        for i in np.nonzero(ins)[0]:
            _, _, dist = kd.find((pts[i, 0], pts[i, 1], 0.0))
            ok[i] = dist > clear * sp[i]
        G = pts[ok]
    V = np.vstack([B, E, G])
    res = geometry.delaunay_2d_cdt([Vector((float(p[0]), float(p[1]))) for p in V], edges, [], 0, 1e-7, True)
    V2 = np.array([(v.x, v.y) for v in res[0]])
    F = res[2]
    orig = res[3]
    tris = np.array([f for f in F if len(f) == 3], dtype=np.int64)
    if len(tris) == 0:
        return np.zeros((0, 3)), np.zeros((0, 3)), np.zeros((0, 3), np.int64), np.zeros(0, np.int64)
    cen = V2[tris].mean(axis=1)
    inside = in_region(cen, outer_uv, holes_uv)
    tris = tris[inside]
    cen = cen[inside]
    zone = np.asarray(zone_fn(cen), np.int64) if zone_fn is not None else np.zeros(len(tris), np.int64)
    used = np.unique(tris)
    remap = -np.ones(len(V2), np.int64)
    remap[used] = np.arange(len(used))
    tris = remap[tris]
    V2u = V2[used]
    P3 = np.full((len(used), 3), np.nan)
    N3 = np.full((len(used), 3), np.nan)
    for k, vi in enumerate(used):
        for j in orig[vi]:
            if j < nb and not np.isnan(FP[j, 0]):
                P3[k] = FP[j]
                if not np.isnan(FN[j, 0]):
                    N3[k] = FN[j]
                break
    need = np.isnan(P3[:, 0])
    missed = np.zeros(len(P3), bool)
    if need.any():
        if hasattr(chart, 'last_hit'):
            chart.last_hit = None
        q, nq = chart.to3d(V2u[need], level)
        P3[need] = q
        N3[need] = nq
        h = getattr(chart, 'last_hit', None)
        if h is not None and len(h) == int(need.sum()):
            missed[np.nonzero(need)[0][~np.asarray(h, bool)]] = True
    needn = np.isnan(N3[:, 0])
    if needn.any():
        N3[needn] = sdf_normals(chart.sdf, P3[needn])
    if missed.any():
        keep = ~missed[tris].any(axis=1)
        tris = tris[keep]
        zone = zone[keep]
    return P3, N3, tris, zone


def add_zones(buf, V, N, T, zone, mats, flip=False):
    """Add a split region to a Buf with one material per zone index (mats: zone index -> material name)."""
    for z in np.unique(zone):
        sel = T[zone == z]
        if len(sel):
            buf.add(V, -N if flip else N, sel, mats[int(z)])
    return buf


# ============================================================================================ strips


def loop_frames(P, N, closed=True):
    """Tangent T and in-surface binormal B = N x T for a polyline on a surface."""
    P = np.asarray(P, float)
    if closed:
        T = np.roll(P, -1, 0) - np.roll(P, 1, 0)
    else:
        T = np.empty_like(P)
        T[1:-1] = P[2:] - P[:-2]
        T[0] = P[1] - P[0]
        T[-1] = P[-1] - P[-2]
    T = unit(T)
    B = unit(np.cross(N, T))
    return T, B


def grid_tris(nr, nc, closed=False):
    """Quad grid rows x cols -> triangles (indices row-major)."""
    tris = []
    cmax = nc if closed else nc - 1
    for r in range(nr - 1):
        for c in range(cmax):
            a = r * nc + c
            b = r * nc + (c + 1) % nc
            d = (r + 1) * nc + c
            e = (r + 1) * nc + (c + 1) % nc
            tris.append((a, b, e))
            tris.append((a, e, d))
    return np.array(tris, np.int64).reshape(-1, 3)


def roll_edge(Q, Nq, E, r=0.0025, depth=0.03, hem=0.0, segs=2, closed=True, hem_r=0.0015, flange_rows=1, hem_segs=1,
              flange_dir=None):
    """Rolled panel edge along boundary points Q (on the panel surface) with surface normals Nq and unit
    in-surface directions E pointing out of the panel (towards the gap). The edge turns down over a quarter
    circle of radius r, continues as a flange to `depth` below the surface and, with hem > 0, folds back
    under the panel. Returns (V, N, tris)."""
    Q = np.asarray(Q, float)
    Nq = unit(Nq)
    E = unit(E)
    rows_p = []
    rows_n = []
    C = Q - Nq * r
    for k in range(segs + 1):
        a = 0.5 * math.pi * k / segs
        nn = math.cos(a) * Nq + math.sin(a) * E
        rows_p.append(C + nn * r)
        rows_n.append(nn)
    end = C + E * r
    Fd = -Nq if flange_dir is None else unit(np.broadcast_to(np.asarray(flange_dir, float), Nq.shape))
    for k in range(1, flange_rows + 1):
        s = (depth - r) * k / flange_rows
        rows_p.append(end + Fd * s)
        rows_n.append(E.copy())
    if hem > 0:
        bot = end + Fd * (depth - r)
        Ch = bot - E * hem_r
        for k in range(1, hem_segs + 1):
            a = 0.5 * math.pi * k / hem_segs
            nn = math.cos(a) * E - math.sin(a) * Nq
            rows_p.append(Ch + nn * hem_r)
            rows_n.append(nn)
        last = Ch - Nq * hem_r if hem_segs > 0 else bot
        rows_p.append(last - E * hem)
        rows_n.append(-Nq)
    V = np.vstack(rows_p)
    N = np.vstack(rows_n)
    tris = grid_tris(len(rows_p), len(Q), closed)
    return V, N, tris


def sweep(path, up, prof, prof_n=None, closed=False, closed_prof=False, smooth_prof=True):
    """Sweep a 2D profile along a 3D path. The profile coordinates are (side, up) in the frame
    S = T x U, U (U = given up vectors projected perpendicular to the tangent). prof_n: 2D normals of the
    profile points (computed from the polyline if omitted; smooth_prof=False duplicates profile corners).
    Returns (V, N, tris)."""
    path = np.asarray(path, float)
    up = np.broadcast_to(np.asarray(up, float), path.shape).copy()
    if closed:
        T = np.roll(path, -1, 0) - np.roll(path, 1, 0)
    else:
        T = np.empty_like(path)
        T[1:-1] = path[2:] - path[:-2]
        T[0] = path[1] - path[0]
        T[-1] = path[-1] - path[-2]
    T = unit(T)
    U = unit(up - T * (up * T).sum(1)[:, None])
    S = unit(np.cross(T, U))
    prof = np.asarray(prof, float)
    # the normals point away from the area the profile encloses (an open profile closed by its end points):
    # (t_y, -t_x) is outward for a counter-clockwise profile, so a clockwise one gets them flipped
    area = 0.5 * float(np.sum(prof[:, 0] * np.roll(prof[:, 1], -1) - np.roll(prof[:, 0], -1) * prof[:, 1])) if len(prof) > 2 else 0.0
    nsign = -1.0 if (prof_n is None and area < -1e-12) else 1.0
    if not smooth_prof:
        # hard profile corners: every profile edge gets its own pair of points with the edge normal
        k = len(prof)
        ne = k if closed_prof else k - 1
        pp = []
        pn = []
        for i in range(ne):
            a_, b_ = prof[i], prof[(i + 1) % k]
            t_ = unit(b_ - a_)
            nrm = np.array([t_[1], -t_[0]]) * nsign
            pp += [a_, b_]
            pn += [nrm, nrm]
        prof = np.array(pp)
        prof_n = np.array(pn)
        closed_prof = False
    if prof_n is None:
        prof_n = profile_normals(prof, closed_prof) * nsign
    prof_n = np.asarray(prof_n, float)
    m = len(prof)
    V = path[:, None, :] + prof[None, :, 0:1] * S[:, None, :] + prof[None, :, 1:2] * U[:, None, :]
    N = prof_n[None, :, 0:1] * S[:, None, :] + prof_n[None, :, 1:2] * U[:, None, :]
    V = V.reshape(-1, 3)
    N = unit(N.reshape(-1, 3))
    # rows = profile points along path: build tris with path as the 'row' direction
    tris = []
    n = len(path)
    pmax = n if closed else n - 1
    qmax = m if closed_prof else m - 1
    for i in range(pmax):
        i2 = (i + 1) % n
        for j in range(qmax):
            j2 = (j + 1) % m
            a = i * m + j
            b = i * m + j2
            c = i2 * m + j
            d = i2 * m + j2
            tris.append((a, c, d))
            tris.append((a, d, b))
    return V, N, np.array(tris, np.int64).reshape(-1, 3)


def profile_normals(prof, closed=False):
    """Outward 2D normals of a profile polyline (left of the direction of travel = outside for CCW)."""
    prof = np.asarray(prof, float)
    if closed:
        T = np.roll(prof, -1, 0) - np.roll(prof, 1, 0)
    else:
        T = np.empty_like(prof)
        T[1:-1] = prof[2:] - prof[:-2]
        T[0] = prof[1] - prof[0]
        T[-1] = prof[-1] - prof[-2]
    T = unit(T)
    return np.stack([T[:, 1], -T[:, 0]], 1)


def arc2(cx, cy, r, a0, a1, n):
    """2D arc points (degrees)."""
    a = np.radians(np.linspace(a0, a1, n))
    return np.stack([cx + r * np.cos(a), cy + r * np.sin(a)], 1)


def round_profile(points, radii, seg=3):
    """Round the corners of a 2D polyline profile (open): points (k,2), radii per interior point."""
    pts = np.asarray(points, float)
    out = [pts[0]]
    for i in range(1, len(pts) - 1):
        r = radii[i] if hasattr(radii, '__len__') else radii
        p0, p1, p2 = pts[i - 1], pts[i], pts[i + 1]
        if r <= 0:
            out.append(p1)
            continue
        d0 = unit(p0 - p1)
        d1 = unit(p2 - p1)
        cosang = float(np.clip(np.dot(d0, d1), -1, 1))
        ang = math.acos(cosang)
        if ang < 1e-3 or abs(ang - math.pi) < 1e-3:
            out.append(p1)
            continue
        tlen = r / math.tan(ang / 2)
        tlen = min(tlen, 0.49 * np.linalg.norm(p0 - p1), 0.49 * np.linalg.norm(p2 - p1))
        a = p1 + d0 * tlen
        b = p1 + d1 * tlen
        bis = unit(d0 + d1)
        rr = tlen * math.tan(ang / 2)
        c = p1 + bis * (rr / math.sin(ang / 2))
        a0 = math.atan2(a[1] - c[1], a[0] - c[0])
        a1 = math.atan2(b[1] - c[1], b[0] - c[0])
        da = (a1 - a0 + math.pi) % (2 * math.pi) - math.pi
        for k in range(seg + 1):
            aa = a0 + da * k / seg
            out.append(c + rr * np.array([math.cos(aa), math.sin(aa)]))
    out.append(pts[-1])
    return np.array(out)


def lathe(prof, center, axis, segs=32, a0=0.0, a1=360.0, ref=None, prof_n=None, cap=False):
    """Revolve a 2D profile (r, h) about an axis through `center`. ref = direction of angle 0.
    Returns (V, N, tris)."""
    prof = np.asarray(prof, float)
    axis = unit(np.asarray(axis, float))
    center = np.asarray(center, float)
    if ref is None:
        ref = np.array([1.0, 0, 0]) if abs(axis[0]) < 0.9 else np.array([0, 0, 1.0])
    ref = unit(np.asarray(ref, float) - axis * np.dot(ref, axis))
    side = np.cross(axis, ref)
    full = abs((a1 - a0) - 360.0) < 1e-6
    n = segs if full else segs + 1
    ang = np.radians(a0 + (a1 - a0) * np.arange(n) / segs)
    if prof_n is None:
        prof_n = profile_normals(prof)  # (dr, dh) outward
    prof_n = np.asarray(prof_n, float)
    V = []
    N = []
    for a in ang:
        radial = math.cos(a) * ref + math.sin(a) * side
        V.append(center + prof[:, 0:1] * radial + prof[:, 1:2] * axis)
        N.append(prof_n[:, 0:1] * radial + prof_n[:, 1:2] * axis)
    V = np.vstack(V)
    N = unit(np.vstack(N))
    m = len(prof)
    tris = []
    imax = n if full else n - 1
    for i in range(imax):
        i2 = (i + 1) % n
        for j in range(m - 1):
            a_ = i * m + j
            b_ = i * m + j + 1
            c_ = i2 * m + j
            d_ = i2 * m + j + 1
            tris.append((a_, c_, d_))
            tris.append((a_, d_, b_))
    return V, N, np.array(tris, np.int64)


# ============================================================================================ mesh buffer


class Buf:
    """Collects triangles with per-vertex normals and a material per triangle; becomes one Blender object."""

    def __init__(self):
        self.V = []
        self.N = []
        self.T = []
        self.M = []
        self.UV = []          # per add: (n, 2) texture coordinates or None (only objects that got some UVs
        self.n = 0            # are given a UV layer; missing ones become 0, 0)

    def add(self, V, N, tris, mat, uv=None):
        V = np.asarray(V, float)
        N = np.asarray(N, float)
        tris = np.asarray(tris, np.int64).reshape(-1, 3)
        if len(tris) == 0:
            return self
        self.V.append(V)
        self.N.append(unit(N))
        self.T.append(tris + self.n)
        self.M.extend([mat] * len(tris))
        self.UV.append(None if uv is None else np.asarray(uv, float).reshape(-1, 2))
        self.n += len(V)
        return self

    def has_uv(self):
        return any(u is not None for u in getattr(self, 'UV', []))

    def uv_array(self):
        """(n, 2) texture coordinates of all vertices (NaN where none were given)."""
        out = []
        uvs = getattr(self, 'UV', [])
        for k, V in enumerate(self.V):
            u = uvs[k] if k < len(uvs) else None
            out.append(np.full((len(V), 2), np.nan) if u is None else u)
        return np.vstack(out) if out else np.zeros((0, 2))

    def extend(self, other, xf=None):
        for V, N, T in zip(other.V, other.N, other.T):
            pass
        if not other.V:
            return self
        V = np.vstack(other.V)
        N = np.vstack(other.N)
        T = np.vstack(other.T)
        if xf is not None:
            V, N, T = xf(V, N, T)
        mats = list(other.M)
        V = np.asarray(V)
        self.V.append(V)
        self.N.append(N)
        self.T.append(T + self.n)
        self.M.extend(mats)
        self.UV.append(other.uv_array() if other.has_uv() else None)
        self.n += len(V)
        return self

    def arrays(self):
        if not self.V:
            return np.zeros((0, 3)), np.zeros((0, 3)), np.zeros((0, 3), np.int64), []
        return np.vstack(self.V), np.vstack(self.N), np.vstack(self.T), list(self.M)

    def mirrored(self, axis=1):
        """A copy mirrored across a coordinate plane (axis 1 = Y: the car's centre line)."""
        V, N, T, M = self.arrays()
        V = V.copy()
        N = N.copy()
        V[:, axis] *= -1
        N[:, axis] *= -1
        b = Buf()
        b.add(V, N, T[:, ::-1], 'paint', uv=self.uv_array() if self.has_uv() else None)
        b.M = list(M)
        return b

    def transformed(self, mat4):
        V, N, T, M = self.arrays()
        m = np.array(mat4, float)
        R = m[:3, :3]
        V2 = V @ R.T + m[:3, 3]
        Ninv = np.linalg.inv(R).T
        N2 = unit(N @ Ninv.T)
        if np.linalg.det(R) < 0:
            T = T[:, ::-1]
        b = Buf()
        b.add(V2, N2, T, 'paint', uv=self.uv_array() if self.has_uv() else None)
        b.M = list(M)
        return b

    def tri_count(self):
        return sum(len(t) for t in self.T)

    def to_object(self, name, coll=None, weld=1e-6, orient=True):
        V, N, T, M = self.arrays()
        UV = self.uv_array() if self.has_uv() else None
        if len(T) == 0:
            me = bpy.data.meshes.new(name)
            obj = bpy.data.objects.new(name, me)
            (coll or bpy.context.scene.collection).objects.link(obj)
            return obj
        # drop degenerate triangles
        a = V[T[:, 0]]
        b = V[T[:, 1]]
        c = V[T[:, 2]]
        cr = np.cross(b - a, c - a)
        area2 = np.linalg.norm(cr, axis=1)
        good = area2 > 1e-12
        T = T[good]
        cr = cr[good]
        M = [m for m, g in zip(M, good) if g]
        if orient:
            ns = N[T[:, 0]] + N[T[:, 1]] + N[T[:, 2]]
            flip = (cr * ns).sum(1) < 0
            T[flip] = T[flip][:, ::-1]
        if weld:
            key = np.round(V / weld).astype(np.int64)
            nk = np.round(N * 200).astype(np.int64)
            full = np.concatenate([key, nk], 1)
            if UV is not None:
                full = np.concatenate([full, np.round(np.nan_to_num(UV, nan=-9.0) * 4096).astype(np.int64)], 1)
            _, idx, inv = np.unique(full, axis=0, return_index=True, return_inverse=True)
            inv = inv.reshape(-1)
            V = V[idx]
            N = N[idx]
            if UV is not None:
                UV = UV[idx]
            T = inv[T]
            good = (T[:, 0] != T[:, 1]) & (T[:, 1] != T[:, 2]) & (T[:, 0] != T[:, 2])
            T = T[good]
            M = [m for m, g in zip(M, good) if g]
        used = np.unique(T)
        remap = -np.ones(len(V), np.int64)
        remap[used] = np.arange(len(used))
        V = V[used]
        N = N[used]
        if UV is not None:
            UV = UV[used]
        T = remap[T]
        me = bpy.data.meshes.new(name)
        me.vertices.add(len(V))
        me.vertices.foreach_set('co', V.astype(np.float32).ravel())
        me.loops.add(len(T) * 3)
        me.loops.foreach_set('vertex_index', T.astype(np.int32).ravel())
        me.polygons.add(len(T))
        me.polygons.foreach_set('loop_start', (np.arange(len(T)) * 3).astype(np.int32))
        me.polygons.foreach_set('loop_total', np.full(len(T), 3, np.int32))
        mats = sorted(set(M))
        for mn in mats:
            me.materials.append(mc.mat(mn))
        mi = {mn: i for i, mn in enumerate(mats)}
        me.polygons.foreach_set('material_index', np.array([mi[m] for m in M], np.int32))
        me.update(calc_edges=True)
        me.validate(clean_customdata=False)
        me.polygons.foreach_set('use_smooth', np.ones(len(me.polygons), bool))
        if len(me.vertices) == len(V):
            me.normals_split_custom_set_from_vertices([tuple(n) for n in N])
        else:
            vn = np.zeros((len(me.vertices), 3))
            vn[:] = (0, 0, 1)
            me.normals_split_custom_set_from_vertices([tuple(n) for n in vn])
        if UV is not None:
            lay = me.uv_layers.new(name='UVMap')
            lv = np.array([lp.vertex_index for lp in me.loops], np.int64)
            uvl = np.nan_to_num(UV, nan=0.0)[lv].astype(np.float32)
            lay.data.foreach_set('uv', uvl.ravel())
        obj = bpy.data.objects.new(name, me)
        (coll or bpy.context.scene.collection).objects.link(obj)
        return obj


def drop_all(objs, empties, panels, infos, dz, abs_props=('floor_z', 'cushion_z')):
    """Move the whole built frame by dz (z, metres): the root objects, the mount empties (and their absolute
    height properties), the panels' hinge positions and the needle / wiper pivots. A frame modelled with its
    hubs dz higher than its wheel radius and then moved down by dz sits that much lower over its wheels while
    the hubs stay at the wheel radius above the ground."""
    if not dz:
        return
    for o in list(objs) + list(empties):
        if o.parent is None:
            m = o.matrix_world.copy()
            m.translation.z += dz
            o.matrix_world = m
    for e in empties:
        for k in abs_props:
            if k in e:
                e[k] = round(float(e[k]) + dz, 4)
    for p in panels.values():
        p['hinge_pos'] = np.asarray(p['hinge_pos'], float) + (0.0, 0.0, dz)
    for group in infos:
        for info in group.values():
            if 'pivot' in info:
                info['pivot'] = np.asarray(info['pivot'], float) + (0.0, 0.0, dz)
    bpy.context.view_layer.update()


def bake_ao_open(meshes, open_objs, region, targets=('BODY', 'UNDER'), samples=32, distance=0.35, fade=0.04):
    """Ambient occlusion as mc.bake_ao, then a second pass for the vertices of `targets` inside `region`
    ((lo, hi), an axis-aligned box in world coordinates) with panels opened (open_objs: (object, local axis,
    degrees)): an engine bay is baked as the player sees it, bonnet up, instead of near-black under a shut
    bonnet. Outside the box the first pass is kept, blended over `fade`."""
    mc.bake_ao(meshes, samples=samples, distance=distance)
    objs = [o for o in meshes if o.name in targets]
    saved = {}
    for o in objs:
        a = o.data.color_attributes.get('Col')
        c = np.zeros(len(a.data) * 4)
        a.data.foreach_get('color', c)
        saved[o.name] = c.reshape(-1, 4).copy()
    keep = []
    for (o, axis, deg) in open_objs:
        keep.append((o, o.matrix_world.copy()))
        o.matrix_world = o.matrix_world @ Matrix.Rotation(math.radians(deg), 4, Vector(axis))
    bpy.context.view_layer.update()
    mc.bake_ao(objs, samples=samples, distance=distance)
    for (o, m) in keep:
        o.matrix_world = m
    bpy.context.view_layer.update()
    lo, hi = np.asarray(region[0], float), np.asarray(region[1], float)
    for o in objs:
        me = o.data
        a = me.color_attributes.get('Col')
        c = np.zeros(len(a.data) * 4)
        a.data.foreach_get('color', c)
        c = c.reshape(-1, 4)
        vi = np.zeros(len(me.loops), np.int64)
        me.loops.foreach_get('vertex_index', vi)
        co = np.zeros(len(me.vertices) * 3)
        me.vertices.foreach_get('co', co)
        W = np.array(o.matrix_world)
        P = co.reshape(-1, 3) @ W[:3, :3].T + W[:3, 3]
        d = np.linalg.norm(np.maximum(np.maximum(lo - P, P - hi), 0.0), axis=1)
        w = np.clip(1.0 - d / fade, 0.0, 1.0)[vi][:, None]
        a.data.foreach_set('color', (saved[o.name] * (1.0 - w) + c * w).ravel())


def obj_to_buf(obj, angle=35.0, xf=None):
    """Evaluated Blender object -> Buf with angle-split, area-weighted normals (for hard-surface pieces)."""
    dg = bpy.context.evaluated_depsgraph_get()
    ev = obj.evaluated_get(dg)
    me = ev.to_mesh()
    me.calc_loop_triangles()
    mw = obj.matrix_world if xf is None else xf
    nv = len(me.vertices)
    co = np.empty(nv * 3, np.float32)
    me.vertices.foreach_get('co', co)
    co = co.reshape(-1, 3).astype(float)
    nt = len(me.loop_triangles)
    tv = np.empty(nt * 3, np.int32)
    me.loop_triangles.foreach_get('vertices', tv)
    tv = tv.reshape(-1, 3)
    tl = np.empty(nt * 3, np.int32)
    me.loop_triangles.foreach_get('loops', tl)
    tl = tl.reshape(-1, 3)
    tmi = np.empty(nt, np.int32)
    me.loop_triangles.foreach_get('material_index', tmi)
    cn = np.empty(len(me.loops) * 3, np.float32)
    me.corner_normals.foreach_get('vector', cn) if hasattr(me, 'corner_normals') else None
    cn = cn.reshape(-1, 3).astype(float)
    mats = [m.name if m else 'trim' for m in me.materials] or ['trim']
    m4 = np.array(mw, float)
    R = m4[:3, :3]
    Vw = co @ R.T + m4[:3, 3]
    Nw = unit(cn @ np.linalg.inv(R))
    # explode per triangle corner to keep split normals
    V = Vw[tv.ravel()]
    N = Nw[tl.ravel()]
    T = np.arange(nt * 3).reshape(-1, 3)
    if np.linalg.det(R) < 0:
        T = T[:, ::-1]
    b = Buf()
    b.add(V, N, T, 'trim')
    b.M = [mats[i] if i < len(mats) else mats[0] for i in tmi]
    ev.to_mesh_clear()
    return b


def bm_to_buf(bm, mat, angle=35.0, weighted=True):
    """bmesh -> Buf with normals split above `angle` and face-area weighting (keeps flat faces flat)."""
    bm.normal_update()
    bmesh.ops.triangulate(bm, faces=bm.faces[:])
    bm.verts.index_update()
    bm.faces.index_update()
    lim = math.cos(math.radians(angle))
    fn = np.array([f.normal[:] for f in bm.faces])
    fa = np.array([f.calc_area() for f in bm.faces])
    V = []
    N = []
    T = []
    for f in bm.faces:
        tri = []
        for lp in f.loops:
            v = lp.vert
            acc = np.zeros(3)
            for g in v.link_faces:
                if np.dot(fn[g.index], fn[f.index]) >= lim:
                    w = fa[g.index] if weighted else 1.0
                    acc += fn[g.index] * (w + 1e-9)
            V.append(v.co[:])
            N.append(acc)
            tri.append(len(V) - 1)
        T.append(tri)
    b = Buf()
    b.add(np.array(V), unit(np.array(N)), np.array(T), mat)
    return b


def box_buf(mn, mx, mat, bevel=0.004, segs=2, angle=35.0, xf=None):
    """Axis-aligned box (min corner, max corner) with bevelled edges, optional 4x4 transform."""
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    mn = np.asarray(mn, float)
    mx = np.asarray(mx, float)
    c = (mn + mx) / 2
    s = mx - mn
    for v in bm.verts:
        v.co = Vector((c[0] + v.co.x * s[0], c[1] + v.co.y * s[1], c[2] + v.co.z * s[2]))
    if bevel > 0:
        bev = min(bevel, float(min(s)) * 0.45)
        segs = 1 if float(min(s)) < 0.035 or bev < 0.003 else min(segs, 2)
        bmesh.ops.bevel(bm, geom=list(bm.edges), offset=bev, segments=segs, profile=0.5, affect='EDGES', clamp_overlap=True)
    if xf is not None:
        bmesh.ops.transform(bm, matrix=Matrix(np.array(xf).tolist()), verts=bm.verts)
    b = bm_to_buf(bm, mat, angle)
    bm.free()
    return b


def prism_buf(poly2d, z0, z1, mat, bevel=0.003, segs=2, plane='xy', xf=None, angle=35.0):
    """Extrude a 2D polygon (CCW) between z0 and z1 with bevelled edges. plane selects the axes:
    'xy' (extrude along z), 'xz' (along y), 'yz' (along x)."""
    bm = bmesh.new()
    poly2d = np.asarray(poly2d, float)
    vb = [bm.verts.new((p[0], p[1], z0)) for p in poly2d]
    vt = [bm.verts.new((p[0], p[1], z1)) for p in poly2d]
    n = len(poly2d)
    bm.faces.new(vb[::-1])
    bm.faces.new(vt)
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((vb[i], vb[j], vt[j], vt[i]))
    bm.normal_update()
    if bevel > 0:
        edges = [e for e in bm.edges if e.calc_face_angle(0.0) > math.radians(25)]
        bmesh.ops.bevel(bm, geom=edges, offset=bevel, segments=segs, profile=0.5, affect='EDGES', clamp_overlap=True)
    M = None
    if plane == 'xz':
        M = Matrix(((1, 0, 0, 0), (0, 0, -1, 0), (0, 1, 0, 0), (0, 0, 0, 1)))  # (a, b, c) -> (a, -c, b)
    elif plane == 'yz':
        M = Matrix(((0, 0, 1, 0), (1, 0, 0, 0), (0, 1, 0, 0), (0, 0, 0, 1)))  # (a, b, c) -> (c, a, b)
    if M is not None:
        bmesh.ops.transform(bm, matrix=M, verts=bm.verts)
    if xf is not None:
        bmesh.ops.transform(bm, matrix=Matrix(np.array(xf).tolist()), verts=bm.verts)
    b = bm_to_buf(bm, mat, angle)
    bm.free()
    return b


def tube_buf(path, radius, mat, segs=12, closed=False, cap=True, up=None):
    """Round tube along a 3D path (radius scalar or per point)."""
    path = np.asarray(path, float)
    if up is None:
        up = np.array([0, 0, 1.0])
    a = np.linspace(0, 2 * math.pi, segs, endpoint=False)
    prof = np.stack([np.cos(a), np.sin(a)], 1)
    rad = np.broadcast_to(np.asarray(radius, float), (len(path),))
    upv = np.broadcast_to(up, path.shape).copy()
    T = np.gradient(path, axis=0)
    T = unit(T)
    bad = np.abs((upv * T).sum(1)) > 0.95
    upv[bad] = np.array([1.0, 0, 0]) if abs(up[0]) < 0.9 else np.array([0, 1.0, 0])
    V, N, tri = sweep(path, upv, prof * 1.0, prof, closed=closed, closed_prof=True)
    # scale per path point
    m = len(prof)
    V = V.reshape(len(path), m, 3)
    Vc = path[:, None, :]
    V = Vc + (V - Vc) * rad[:, None, None]
    V = V.reshape(-1, 3)
    b = Buf().add(V, N, tri, mat)
    if cap and not closed:
        for end, sgn in ((0, -1.0), (len(path) - 1, 1.0)):
            ring = V.reshape(len(path), m, 3)[end]
            c = path[end]
            nn = T[end] * sgn
            Vv = np.vstack([ring, c[None]])
            tris = np.array([(i, (i + 1) % m, m) for i in range(m)])
            b.add(Vv, np.tile(nn, (m + 1, 1)), tris, mat)
    return b


def disc_buf(center, axis, r_out, mat, r_in=0.0, segs=32, ref=None):
    """Flat disc / annulus facing +axis."""
    axis = unit(np.asarray(axis, float))
    prof = np.array([[r_in, 0.0], [r_out, 0.0]]) if r_in > 0 else np.array([[1e-5, 0.0], [r_out, 0.0]])
    pn = np.array([[0, 1.0], [0, 1.0]])
    V, N, T = lathe(prof, center, axis, segs, ref=ref, prof_n=pn)
    return Buf().add(V, N, T, mat)


# ============================================================================================ objects


def link(obj, coll=None):
    if obj.name not in (coll or bpy.context.scene.collection).objects:
        (coll or bpy.context.scene.collection).objects.link(obj)
    return obj


def set_origin(obj, point):
    """Move an object's origin to `point` (world) without moving its geometry."""
    p = Vector(point)
    off = obj.matrix_world.inverted() @ p
    obj.data.transform(Matrix.Translation(-off))
    obj.location = obj.matrix_world @ off if False else p
    return obj


def make_obj(buf, name, coll=None, origin=None, parent=None):
    o = buf.to_object(name, coll)
    if origin is not None:
        V = np.empty(len(o.data.vertices) * 3, np.float32)
        o.data.vertices.foreach_get('co', V)
        V = V.reshape(-1, 3) - np.asarray(origin, np.float32)
        # keep custom normals: transform geometry with mesh.transform (normals preserved under translation)
        o.data.transform(Matrix.Translation(-Vector(origin)))
        o.location = Vector(origin)
    if parent is not None:
        o.parent = parent
        o.matrix_parent_inverse = parent.matrix_world.inverted()
    return o


def tri_total(objs):
    return mc.triangles(objs)


def plot2d(path, polylines, size=1200, pad=0.02, colors=None, closed=None, points=None):
    """Debug: draw 2D polylines into a PNG (Blender image API). polylines: list of (n,2) arrays."""
    allp = np.vstack([np.asarray(p, float) for p in polylines] + ([np.asarray(points, float)] if points is not None else []))
    lo = allp.min(0)
    hi = allp.max(0)
    span = max(hi[0] - lo[0], hi[1] - lo[1]) * (1 + 2 * pad) + 1e-9
    W = size
    H = max(64, int(size * (hi[1] - lo[1] + 2 * pad * span) / span) + 2)
    img = np.ones((H, W, 4), np.float32)
    pal = [(0.85, 0.1, 0.1), (0.1, 0.35, 0.9), (0.1, 0.65, 0.2), (0.8, 0.5, 0.0), (0.5, 0.1, 0.7), (0, 0, 0)]

    def px(p):
        x = (p[0] - lo[0] + pad * span) / span * (W - 1)
        y = (p[1] - lo[1] + pad * span) / span * (W - 1)
        return x, y
    for k, pl in enumerate(polylines):
        pl = np.asarray(pl, float)
        col = (colors[k] if colors else pal[k % len(pal)])
        cl = closed[k] if closed else False
        segs = list(zip(pl[:-1], pl[1:])) + ([(pl[-1], pl[0])] if cl else [])
        for a, b in segs:
            xa, ya = px(a)
            xb, yb = px(b)
            n = int(max(abs(xb - xa), abs(yb - ya))) + 1
            xs = np.linspace(xa, xb, n).astype(int)
            ys = np.linspace(ya, yb, n).astype(int)
            ok = (xs >= 0) & (xs < W) & (ys >= 0) & (ys < H)
            img[ys[ok], xs[ok], :3] = col
        for p in pl[:1]:
            x, y = px(p)
            img[max(0, int(y) - 3):int(y) + 4, max(0, int(x) - 3):int(x) + 4, :3] = col
    if points is not None:
        for p in np.asarray(points, float):
            x, y = px(p)
            img[max(0, int(y) - 1):int(y) + 2, max(0, int(x) - 1):int(x) + 2, :3] = (0, 0, 0)
    im = bpy.data.images.new('plot2d', W, H, alpha=False)
    im.pixels.foreach_set(img.ravel())
    im.filepath_raw = path
    im.file_format = 'PNG'
    im.save()
    bpy.data.images.remove(im)


class FlatChart:
    """Plane through o spanned by a, b (normal n): for filling loops whose vertices are all fixed."""

    def __init__(self, o, a, b, n):
        self.o, self.a, self.b, self.n = (np.asarray(v, float) for v in (o, a, b, n))
        self.sdf = lambda P: (np.asarray(P) - self.o) @ self.n

    def to3d(self, uv, level=None):
        uv = np.asarray(uv, float)
        P = self.o + uv[:, 0:1] * self.a + uv[:, 1:2] * self.b
        return P, np.tile(self.n, (len(uv), 1))

    def to2d(self, P):
        d = np.asarray(P, float) - self.o
        return np.stack([d @ self.a, d @ self.b], 1)


def plane_basis(n):
    n = unit(np.asarray(n, float))
    a = np.cross(n, [0.0, 0.0, 1.0]) if abs(n[2]) < 0.9 else np.cross(n, [1.0, 0.0, 0.0])
    a = unit(a)
    b = np.cross(n, a)
    return a, b, n


def fill_loop(P, normal, mat, holes=(), interior_step=None):
    """Triangulate a closed, roughly planar 3D loop (with optional hole loops) using a constant normal."""
    P = np.asarray(P, float)
    a, b, n = plane_basis(normal)
    o = P.mean(0)
    ch = FlatChart(o, a, b, n)
    nn = np.tile(n, (len(P), 1))
    outer = [Loop(ch.to2d(P), P, nn)]
    hl = [Loop(ch.to2d(H), np.asarray(H, float), np.tile(n, (len(H), 1))) for H in holes]
    pts = None
    if interior_step:
        uv = ch.to2d(P)
        lo, hi = uv.min(0), uv.max(0)
        pts = grid_points(lo[0], hi[0], lo[1], hi[1], interior_step, dt=interior_step)
    V, N, T = mesh_region(ch, outer, hl, pts, spacing=interior_step or 0.05)
    return Buf().add(V, N, T, mat)


def panel_back(P, N, E, depth=0.0058, inset=0.0025, mat='paint'):
    """Flat back for a small single-sided panel (a fuel flap): its edge loop (points P with surface normals N and
    in-surface directions E pointing out of the panel) pulled `inset` in and `depth` under the skin, to meet the
    inner edge of its rolled hem; filled and facing inward, so the opened panel is not see-through."""
    P = np.asarray(P, float)
    Q = P - unit(N) * depth - unit(E) * inset
    return fill_loop(Q, -unit(np.asarray(N, float).mean(0)), mat)


def ring_tube(P_ring, axis_dir, depth, rows, mat, inward=True):
    """Extrude a closed ring of points along axis_dir by `depth` (a short tube, e.g. a lamp bucket). Normals
    point towards the ring's axis (inner surface) when inward=True."""
    P_ring = np.asarray(P_ring, float)
    d = unit(np.asarray(axis_dir, float))
    c = P_ring.mean(0)
    rowsP = []
    rowsN = []
    for k in range(rows + 1):
        Q = P_ring + d * depth * k / rows
        rad = Q - (c + d * depth * k / rows)
        rad = rad - d * (rad @ d)[:, None]
        nn = -unit(rad) if inward else unit(rad)
        rowsP.append(Q)
        rowsN.append(nn)
    V = np.vstack(rowsP)
    N = np.vstack(rowsN)
    T = grid_tris(rows + 1, len(P_ring), True)
    return Buf().add(V, N, T, mat)


def mat4_rot(axis, deg, origin=(0, 0, 0)):
    """4x4 rotation about an axis through origin (numpy)."""
    a = unit(np.asarray(axis, float))
    t = math.radians(deg)
    c, s = math.cos(t), math.sin(t)
    x, y, z = a
    R = np.array([[c + x * x * (1 - c), x * y * (1 - c) - z * s, x * z * (1 - c) + y * s],
                  [y * x * (1 - c) + z * s, c + y * y * (1 - c), y * z * (1 - c) - x * s],
                  [z * x * (1 - c) - y * s, z * y * (1 - c) + x * s, c + z * z * (1 - c)]])
    o = np.asarray(origin, float)
    M = np.eye(4)
    M[:3, :3] = R
    M[:3, 3] = o - R @ o
    return M


def mat4_trs(t=(0, 0, 0), R=None, s=1.0):
    M = np.eye(4)
    M[:3, :3] = (np.eye(3) if R is None else np.asarray(R, float)) * s
    M[:3, 3] = t
    return M


def frame_from(x_axis, z_hint):
    """3x3 rotation whose columns are X (given), Y = Z x X, Z (orthogonalised hint)."""
    X = unit(np.asarray(x_axis, float))
    Z = np.asarray(z_hint, float)
    Z = unit(Z - X * np.dot(Z, X))
    Y = np.cross(Z, X)
    return np.stack([X, Y, Z], 1)


def helix(center, axis, r, h, turns, n=None, wire=0.006, mat='steel', segs=8):
    """Coil spring along axis from center (bottom) up by h."""
    axis = unit(np.asarray(axis, float))
    ref = np.array([1.0, 0, 0]) if abs(axis[0]) < 0.9 else np.array([0, 1.0, 0])
    a1 = unit(np.cross(axis, ref))
    a2 = np.cross(axis, a1)
    n = n or int(turns * 24)
    t = np.linspace(0, 1, n)
    ang = t * turns * 2 * math.pi
    P = np.asarray(center, float) + np.outer(np.cos(ang) * r, a1) + np.outer(np.sin(ang) * r, a2) + np.outer(t * h, axis)
    return tube_buf(P, wire, mat, segs=segs, up=axis)


def cyl_buf(p0, p1, r, mat, segs=16, cap=True, r1=None):
    """Cylinder (or cone with r1) between two points with flat caps."""
    p0 = np.asarray(p0, float)
    p1 = np.asarray(p1, float)
    ax = p1 - p0
    L = float(np.linalg.norm(ax))
    r1 = r if r1 is None else r1
    prof = np.array([[0.0, 0.0], [r, 0.0], [r, 0.0], [r1, L], [r1, L], [0.0, L]]) if cap else np.array([[r, 0.0], [r1, L]])
    if cap:
        pn = np.array([[0, -1.0], [0, -1.0], [1, 0.0], [1, 0.0], [0, 1.0], [0, 1.0]])
        if abs(r1 - r) > 1e-9:
            sl = unit(np.array([L, r - r1]))
            pn[2] = sl
            pn[3] = sl
    else:
        sl = unit(np.array([L, r - r1]))
        pn = np.array([sl, sl])
    V, N, T = lathe(prof, p0, ax / max(L, 1e-9), segs, prof_n=pn)
    return Buf().add(V, N, T, mat)


class OffsetChart:
    """Another chart's surface moved by d along its normal (d < 0 = inwards): robust inner panels (door cards,
    frame insides) where an SDF iso level would not exist close to an edge of the shell."""

    def __init__(self, base, d):
        self.base = base
        self.d = d
        self.sdf = base.sdf

    def to3d(self, uv, level=None):
        P, N = self.base.to3d(uv)
        h = getattr(self.base, 'last_hit', None)
        self.last_hit = h
        return P + N * self.d, N

    def to2d(self, pts):
        return self.base.to2d(pts)
