"""Rhino: the cargo box and its tilt. A steel drop-side box on the subframe (a wooden plank deck on steel crossbearers,
drop sides with pressed beads and a top rail, a headboard, corner posts), its drop tailgate (the trunk panel), the
canvas tilt over five steel hoops (the roof sagging a little between them, laced down with rope to hooks on the
drop sides, the rear curtain rolled up over the opening), the rear mudguards and flaps, the side lockers between the
cab and the rear wheels, the fuel filler's pocket behind the right rear wheel, the spare wheel stood up behind the
cab with a jerry can either side, the rear lamps' brackets and the number plate. Left halves are mirrored by
frames/_rhino_build.py; 'centre' builders make both sides."""
import math
import sys

sys.dont_write_bytecode = True

import numpy as np  # noqa: E402

from frames import _kit as K  # noqa: E402
from frames import rhino as S  # noqa: E402
from frames._sedan_inner import recompute_normals, smooth_path  # noqa: E402

D = S.D
PI = math.pi
XF = D['bx_f']                 # the headboard's front face
XR = D['bx_r']                 # the tailgate's outer face
BW = D['bhw']                  # the drop sides' outer face
SIDE_T = 0.05                  # the drop sides', headboard's and tailgate's thickness
BIN = BW - SIDE_T              # their inner face
DECK = D['deck_z']             # the deck's top
DECK_T = 0.04                  # the planks
BEARER_Z = 1.08                # the crossbearers' underside (on the subframe runners)
SIDE_TOP = D['side_z1']
TILT_W = BW + 0.005            # the canvas hangs 5 mm outside the drop sides
POST_D = SIDE_T + 0.012         # the corner posts' depth along the box
BEADS = (D['deck_z'] + 0.12, D['deck_z'] + 0.23)   # the drop sides' and the tailgate's pressed beads
TILT_TOP = D['tilt_z']
TILT_R = D['tilt_r']
HEM_Z = 1.62                   # the canvas's laced bottom edge, 8 cm down over the drop sides' top
SH_Z = TILT_TOP - TILT_R       # where the side turns into the shoulder
TILT_XF = XF - 0.03            # the canvas's front panel (over the headboard's top)
TILT_XR = XR + 0.05            # the canvas's rear edge (over the rear posts)
HOOPS = D['hoops']
HOOP_IN = 0.035                # the hoops' centre line inside the canvas
HOOP_R = 0.018
SAG = 0.035                    # the roof's sag half way between two hoops
CANVAS_T = 0.006               # its inner skin under the outer
TAILGATE_HW = BIN - 0.004      # the tailgate's half width (4 mm short of the rear posts' inner faces)
FUEL = (-2.575, 0.98, 0.055)   # the filler flap's centre x, z and radius (on the pocket behind the right rear wheel)
POCKET = (-2.70, -2.45, 0.86, 1.08, BW - 0.135)   # x0, x1, z0, z1, its inner wall's y
SPARE = (-0.125, 0.0, 0.835, 0.41, 0.25)          # x, y, standing on z, radius, width (behind the cab)


# ============================================================================================ dense meshes for the AO
def dense(buf, step, fat=0.06):
    """The buffer with the long edges of its broad triangles halved until none is longer than `step`. The AO is
    baked into the corners: a box's long face is two triangles, and one dark corner where it meets another piece
    darkens it all (a drop side 2.7 m long goes black along its foot). Only triangles at least `fat` across (twice
    their area over their longest edge) ask for splits, so a bevel's long thin strips are cut only where they meet
    a split face. Edges are matched by position, so the faces either side of a hard edge split alike (no cracks);
    a split edge's point takes the mean normal (and UV) of its ends."""
    V, N, T, M = buf.arrays()
    if not len(T):
        return buf
    uv = buf.uv_array() if buf.has_uv() else None
    Vl, Nl = list(V), list(N)
    Ul = list(uv) if uv is not None else None
    keys = [tuple(np.round(v * 1e5).astype(np.int64)) for v in V]
    tris = [tuple(int(i) for i in t) for t in T]
    mats = list(M)

    def ekey(p, r):
        kp, kr = keys[p], keys[r]
        return (kp, kr) if kp < kr else (kr, kp)

    for _ in range(16):
        split = set()
        for (a, b, c) in tris:
            el = [np.linalg.norm(Vl[p] - Vl[r]) for p, r in ((a, b), (b, c), (c, a))]
            if max(el) <= step:
                continue
            area2 = np.linalg.norm(np.cross(Vl[b] - Vl[a], Vl[c] - Vl[a]))
            if area2 / max(el) < fat:
                continue
            for (p, r), ln in zip(((a, b), (b, c), (c, a)), el):
                if ln > step:
                    split.add(ekey(p, r))
        if not split:
            break
        mid = {}

        def m(p, r):
            k = (p, r) if p < r else (r, p)
            if k not in mid:
                Vl.append(0.5 * (Vl[p] + Vl[r]))
                n = Nl[p] + Nl[r]
                ln = np.linalg.norm(n)
                Nl.append(n / ln if ln > 1e-9 else Nl[p])
                if Ul is not None:
                    Ul.append(0.5 * (Ul[p] + Ul[r]))
                keys.append(tuple(np.round(Vl[-1] * 1e5).astype(np.int64)))
                mid[k] = len(Vl) - 1
            return mid[k]

        nt, nm = [], []
        for (a, b, c), mt in zip(tris, mats):
            vs = (a, b, c)
            e = [ekey(vs[i], vs[(i + 1) % 3]) in split for i in range(3)]
            ns = sum(e)
            if ns == 0:
                nt.append(vs)
                nm.append(mt)
            elif ns == 3:
                mab, mbc, mca = m(a, b), m(b, c), m(c, a)
                nt += [(a, mab, mca), (mab, b, mbc), (mca, mbc, c), (mab, mbc, mca)]
                nm += [mt] * 4
            elif ns == 1:
                k = e.index(True)
                p, r, o = vs[k], vs[(k + 1) % 3], vs[(k + 2) % 3]
                mm = m(p, r)
                nt += [(p, mm, o), (mm, r, o)]
                nm += [mt] * 2
            else:
                k = e.index(False)
                a_, b_, c_ = vs[k], vs[(k + 1) % 3], vs[(k + 2) % 3]
                m1, m2 = m(b_, c_), m(c_, a_)
                nt.append((m1, c_, m2))
                if np.linalg.norm(Vl[a_] - Vl[m1]) < np.linalg.norm(Vl[b_] - Vl[m2]):
                    nt += [(a_, b_, m1), (a_, m1, m2)]
                else:
                    nt += [(a_, b_, m2), (b_, m1, m2)]
                nm += [mt] * 3
        tris, mats = nt, nm
    out = K.Buf()
    out.add(np.array(Vl), np.array(Nl), np.array(tris, np.int64), 'paint', uv=np.array(Ul) if Ul is not None else None)
    out.M = mats
    return out


# ============================================================================================ the tilt's section
L_SIDE = SH_Z - HEM_Z
L_ARC = PI / 2 * TILT_R
L_TOP = TILT_W - TILT_R
S_TOTAL = L_SIDE + L_ARC + L_TOP


def section(s, inset=0.0):
    """Points (y, z) and outward normals of the tilt's half section (left) at arc length s from the hem (up the
    side, round the shoulder, across the top to the centre line), inset along the normal."""
    s = np.asarray(s, float)
    y = np.empty_like(s)
    z = np.empty_like(s)
    ny = np.empty_like(s)
    nz = np.empty_like(s)
    m = s < L_SIDE
    y[m], z[m], ny[m], nz[m] = TILT_W, HEM_Z + s[m], 1.0, 0.0
    m = (s >= L_SIDE) & (s < L_SIDE + L_ARC)
    a = (s[m] - L_SIDE) / TILT_R
    y[m] = TILT_W - TILT_R + TILT_R * np.cos(a)
    z[m] = SH_Z + TILT_R * np.sin(a)
    ny[m], nz[m] = np.cos(a), np.sin(a)
    m = s >= L_SIDE + L_ARC
    y[m] = TILT_W - TILT_R - (s[m] - L_SIDE - L_ARC)
    z[m] = TILT_TOP
    ny[m], nz[m] = 0.0, 1.0
    return y - ny * inset, z - nz * inset, ny, nz


def sag_x(x):
    """How far the roof sags at x: nothing over the hoops, SAG half way between two."""
    x = np.asarray(x, float)
    h = np.sort(np.asarray(HOOPS, float))
    out = np.zeros_like(x)
    for a, b in zip(h[:-1], h[1:]):
        m = (x > a) & (x < b)
        out[m] = SAG * np.sin(PI * (x[m] - a) / (b - a)) ** 2
    return out


S_RAIL = L_SIDE + 0.5 * L_ARC   # the shoulder rails' place round the section (45 deg round the shoulder)


def sag_w(s):
    """The sag's share round the section: the canvas is held at the laced hem, on the shoulder rails and on the
    ridge pole, and sags between them (a little on the side, all of it on the top)."""
    s = np.asarray(s, float)
    side = 0.35 * np.sin(PI * np.clip(s / S_RAIL, 0.0, 1.0)) ** 2
    top = np.sin(PI * np.clip((s - S_RAIL) / (S_TOTAL - S_RAIL), 0.0, 1.0)) ** 2
    return np.where(s < S_RAIL, side, top)


def tilt_point(x, s, inset=0.0):
    y, z, ny, nz = section(s)
    d = sag_x(x) * sag_w(s) + inset
    return np.stack([np.broadcast_to(x, np.shape(y)), y - ny * d, z - nz * d], -1)


def s_samples():
    return np.unique(np.concatenate([np.linspace(0.0, L_SIDE, 7), np.linspace(L_SIDE, L_SIDE + L_ARC, 9),
                                     np.linspace(L_SIDE + L_ARC, S_TOTAL, 8)]))


def x_samples():
    h = sorted(HOOPS, reverse=True)
    xs = [TILT_XF]
    for a, b in zip(h[:-1], h[1:]):
        xs += list(np.linspace(a, b, 7)[:-1])
    xs += [h[-1], TILT_XR]
    return np.array(xs)


def _grid_buf(P, mat, outward=True):
    """A quad grid of points P (rows along x, columns round the section) as a smooth sheet; normals away from the
    tilt's inside (towards it with outward=False)."""
    nr, nc = P.shape[:2]
    V = P.reshape(-1, 3)
    T = K.grid_tris(nr, nc)
    b = recompute_normals(K.Buf().add(V, np.zeros_like(V), T, mat))
    Vb, Nb, Tb, Mb = b.arrays()
    ref = np.stack([Vb[:, 0], np.zeros(len(Vb)), np.full(len(Vb), 2.0)], 1)
    s = 1.0 if float(((Vb - ref) * Nb).sum()) > 0 else -1.0
    if not outward:
        s = -s
    return K.Buf().add(Vb, Nb * s, Tb, mat)


# ============================================================================================ the tilt
def tilt_left():
    """The canvas (outer skin and the inner skin under it), its front panel over the headboard, the hems, the hoops
    and the shoulder rails under it, the straps over the hoops, the lacing down to the drop sides' hooks."""
    b = K.Buf()
    xs = x_samples()
    ss = s_samples()
    P = np.array([tilt_point(x, ss) for x in xs])
    xs_in = xs.copy()
    xs_in[0] = TILT_XF - CANVAS_T
    Pin = np.array([tilt_point(x, ss, CANVAS_T) for x in xs_in])
    b.extend(_grid_buf(P, 'paint_b', True))
    b.extend(_grid_buf(Pin, 'paint_b', False))
    # the front panel over the headboard (no sag there): outside and inside
    y, z, ny, nz = section(ss)
    for x, sg, ins in ((TILT_XF, 1.0, 0.0), (TILT_XF - CANVAS_T, -1.0, CANVAS_T)):
        yi, zi, _, _ = section(ss, ins)
        outline = np.vstack([[(x, 0.0, SIDE_TOP - 0.04), (x, yi[0], SIDE_TOP - 0.04)], np.stack([np.full(len(ss), x), yi, zi], 1)[1:]])
        # (points inside it too: the AO is baked per corner, and its edge is all crevice)
        b.extend(K.fill_loop(K.resample_keep(outline, 0.12), (sg, 0, 0), 'paint_b', interior_step=0.14))
    # hems: a seam round the front panel's edge, a rolled hem along the open rear edge and along the bottom
    for x, r in ((TILT_XF, 0.007), (TILT_XR, 0.009)):
        b.extend(K.tube_buf(tilt_point(x, ss, -0.002), r, 'paint_b', 6))
    hem = np.array([tilt_point(x, np.array([0.0]), -0.003)[0] for x in np.linspace(TILT_XF, TILT_XR, 12)])
    b.extend(K.tube_buf(hem, 0.008, 'paint_b', 6))
    # the hoops: steel bows standing in sockets in the drop sides' tops, inside the canvas
    for xh in HOOPS:
        yh, zh, _, _ = section(ss, HOOP_IN)
        path = np.vstack([[(xh, yh[0], SIDE_TOP - 0.02)], np.stack([np.full(len(ss), xh), yh, zh], 1)[1:]])
        b.extend(K.tube_buf(path, HOOP_R, 'steel', 8))
        # the socket at the drop side's top
        b.extend(K.box_buf((xh - 0.025, yh[0] - 0.022, SIDE_TOP - 0.05), (xh + 0.025, yh[0] + 0.022, SIDE_TOP + 0.015), 'steel', 0.003, 1))
        # the strap over it outside: a dark webbing band from the hem to the middle
        sp = tilt_point(xh, ss, -0.0016)
        prof = np.array([(-0.025, -0.0015), (0.025, -0.0015), (0.025, 0.0015), (-0.025, 0.0015)])
        N = np.stack([np.zeros(len(ss)), ny, nz], 1)
        V, NN, T = K.sweep(sp, N, prof, closed=False, closed_prof=True, smooth_prof=False)
        b.add(V, NN, T, 'trim')
    # the shoulder rails joining the hoops under the canvas
    a = np.radians(45.0)
    yr, zr = TILT_W - TILT_R + (TILT_R - HOOP_IN) * math.cos(a), SH_Z + (TILT_R - HOOP_IN) * math.sin(a)
    b.extend(K.cyl_buf((max(HOOPS), yr, zr), (min(HOOPS), yr, zr), 0.012, 'steel', 8))
    # the lacing: a rope from eyelets in the hem down to hooks on the drop side and back up, all along
    xs_l = np.linspace(TILT_XF - 0.06, TILT_XR + 0.06, 13)
    pts = []
    for i, x in enumerate(xs_l):
        pts.append((x, TILT_W + 0.003, HEM_Z + 0.012))
        if i < len(xs_l) - 1:
            pts.append((0.5 * (x + xs_l[i + 1]), BW + 0.016, HEM_Z - 0.06))
    b.extend(K.tube_buf(np.array(pts), 0.0045, 'rubber', 5))
    for i in range(len(xs_l) - 1):
        xm = 0.5 * (xs_l[i] + xs_l[i + 1])
        b.extend(K.box_buf((xm - 0.012, BW, HEM_Z - 0.075), (xm + 0.012, BW + 0.016, HEM_Z - 0.05), 'steel', 0.003, 1))
    for x in xs_l:
        V, N, T = K.lathe(np.array([(0.004, 0.0), (0.009, 0.0), (0.009, 0.002), (0.004, 0.002)]), (x, TILT_W, HEM_Z + 0.012), (0, 1, 0), 10)
        b.add(V, N, T, 'chrome')
    return b


def tilt_centre():
    """Both sides: the rear curtain rolled up over the opening outside the rear hoop, its two straps; the ridge
    pole under the canvas's middle."""
    b = K.Buf()
    xc, zc, r = TILT_XR - 0.065, TILT_TOP - 0.17, 0.055
    b.extend(K.cyl_buf((xc, -BW + 0.10, zc), (xc, BW - 0.10, zc), r, 'paint_b', 18))
    for sy in (-1, 1):
        y = sy * 0.55
        loop = [(xc + (r + 0.004) * math.cos(t), y, zc + (r + 0.004) * math.sin(t)) for t in np.linspace(-PI / 2, PI, 10)]
        loop += [(TILT_XR + 0.004, y, TILT_TOP - 0.02)]
        b.extend(K.tube_buf(np.array(loop), 0.005, 'trim', 5))
    b.extend(K.cyl_buf((max(HOOPS), 0.0, TILT_TOP - HOOP_IN), (min(HOOPS), 0.0, TILT_TOP - HOOP_IN), 0.014, 'steel', 8))
    return b


# ============================================================================================ the box
def box_left():
    """The box's left half: the plank deck on its crossbearers, the deck's side beam, the drop side with its beads,
    top rail, hinges and latches, the front and rear corner posts, the headboard, the rear mudguard and its flap,
    the side locker between the cab and the rear wheel, the amber side markers."""
    b = K.Buf()
    xf_in, xr_in = XF - SIDE_T, XR + SIDE_T
    # crossbearers (steel channels) on the subframe runners, the deck's underside sheet
    for x in np.linspace(xf_in - 0.05, xr_in + 0.05, 8):
        b.extend(K.box_buf((x - 0.03, 0.0, BEARER_Z), (x + 0.03, BW - 0.005, DECK - DECK_T), 'steel', 0.004, 1))
    V = np.array([(xf_in, 0.0, DECK - DECK_T - 0.001), (xr_in, 0.0, DECK - DECK_T - 0.001), (xr_in, BIN, DECK - DECK_T - 0.001), (xf_in, BIN, DECK - DECK_T - 0.001)])
    b.add(V, np.tile((0, 0, -1.0), (4, 1)), np.array([(0, 2, 1), (0, 3, 2)]), 'trim')
    # the deck: planks along the box with dark gaps between them
    n = 7
    w = BIN / n
    for k in range(n):
        y0, y1 = k * w + (0.002 if k else 0.0), (k + 1) * w - 0.002
        b.extend(K.box_buf((xr_in, y0, DECK - DECK_T), (xf_in, y1, DECK), 'wood', 0.002, 1))
    V = np.array([(xf_in, 0.0, DECK - 0.004), (xr_in, 0.0, DECK - 0.004), (xr_in, BIN, DECK - 0.004), (xf_in, BIN, DECK - 0.004)])
    b.add(V, np.tile((0, 0, 1.0), (4, 1)), np.array([(0, 1, 2), (0, 2, 3)]), 'trim')
    # the deck's side beam under the drop side's hinges
    b.extend(K.box_buf((XR, BIN, BEARER_Z + 0.02), (XF, BW, DECK), 'paint', 0.006, 2))
    # the drop side: a double-skinned panel, two pressed beads along it, the top rail
    x0, x1 = XR + POST_D + 0.003, XF - POST_D - 0.003
    b.extend(K.box_buf((x0, BIN, DECK + 0.004), (x1, BW, SIDE_TOP - 0.025), 'paint', 0.008, 2))
    b.extend(K.box_buf((x0, BIN - 0.002, SIDE_TOP - 0.032), (x1, BW, SIDE_TOP), 'paint', 0.01, 2))
    prof = K.round_profile(np.array([(0.0, -0.022), (0.006, -0.016), (0.008, 0.0), (0.006, 0.016), (0.0, 0.022)]), 0.004, 1)
    for zb in BEADS:
        path = np.array([(x0 + 0.03, BW, zb), (x1 - 0.03, BW, zb)])
        V, N, T = K.sweep(path, (0, 0, 1), prof, closed=False)
        b.add(V, N, T, 'paint')
        for e, sg in ((0, -1.0), (1, 1.0)):
            ring = V.reshape(2, -1, 3)[e]
            b.extend(K.fill_loop(ring, (sg, 0, 0), 'paint'))
    # its hinges along the bottom edge, a latch at each end
    for x in np.linspace(x0 + 0.25, x1 - 0.25, 5):
        b.extend(K.cyl_buf((x - 0.05, BW + 0.004, DECK - 0.004), (x + 0.05, BW + 0.004, DECK - 0.004), 0.011, 'steel', 8))
        b.extend(K.box_buf((x - 0.04, BW - 0.002, DECK - 0.002), (x + 0.04, BW + 0.006, DECK + 0.07), 'steel', 0.003, 1))
    for x in (x1 - 0.07, x0 + 0.07):
        b.extend(K.box_buf((x - 0.03, BW, SIDE_TOP - 0.16), (x + 0.03, BW + 0.012, SIDE_TOP - 0.10), 'steel', 0.004, 1))
        b.extend(K.box_buf((x - 0.012, BW + 0.008, SIDE_TOP - 0.20), (x + 0.012, BW + 0.02, SIDE_TOP - 0.11), 'chrome', 0.004, 1))
    # corner posts: at the headboard's ends and the rear (the tailgate latches onto them)
    for (xa, xb) in ((XF - POST_D, XF), (XR, XR + POST_D)):
        b.extend(K.box_buf((xa, BIN, BEARER_Z + 0.02), (xb, BW + 0.006, SIDE_TOP + 0.02), 'paint', 0.008, 2))
    # the headboard: a panel across the front with vertical pressed ribs on its face (towards the cab)
    b.extend(K.box_buf((XF - SIDE_T, 0.0, DECK - DECK_T), (XF, BIN, SIDE_TOP), 'paint', 0.006, 1))
    b.extend(K.box_buf((XF - SIDE_T - 0.002, 0.0, SIDE_TOP - 0.03), (XF + 0.004, BIN, SIDE_TOP + 0.006), 'paint', 0.008, 2))
    for y in (0.22, 0.52, 0.82):
        b.extend(K.box_buf((XF - 0.004, y - 0.022, DECK + 0.05), (XF + 0.006, y + 0.022, SIDE_TOP - 0.06), 'paint', 0.005, 1))
    # the rear mudguard over the wheel (a black shell on stays from the runner) and its flap
    xa = D['ax_r']
    rg, zg = 0.62, D['arch_z']
    th = np.radians(np.linspace(22.0, 158.0, 22))
    path = np.stack([xa + rg * np.cos(th), np.full(len(th), 0.955), zg + rg * np.sin(th)], 1)
    up = np.stack([np.cos(th), np.zeros(len(th)), np.sin(th)], 1)
    prof = np.array([(-0.145, -0.002), (0.145, -0.002), (0.145, 0.002), (-0.145, 0.002)])
    V, N, T = K.sweep(path, up, prof, closed=False, closed_prof=True, smooth_prof=False)
    b.add(V, N, T, 'trim')
    for e in (0, -1):
        ring = V.reshape(len(path), -1, 3)[e]
        b.extend(K.fill_loop(ring, -K.unit(path[1] - path[0]) if e == 0 else K.unit(path[-1] - path[-2]), 'trim'))
    for ang in (50.0, 130.0):
        t = math.radians(ang)
        p = np.array([xa + (rg + 0.002) * math.cos(t), 0.86, zg + (rg + 0.002) * math.sin(t)])
        b.extend(K.tube_buf(np.array([p, (p[0], 0.50, BEARER_Z - 0.03)]), 0.010, 'steel', 6))
    xfl = xa + rg * math.cos(math.radians(158.0)) - 0.03
    b.extend(K.box_buf((xfl - 0.012, 0.82, 0.30), (xfl, 1.08, zg + rg * math.sin(math.radians(158.0)) + 0.02), 'rubber', 0.004, 2))
    # the side locker between the cab and the rear wheel: a steel box under the deck, its lid's outline, a latch
    lx0, lx1, lz0, lz1, ly0 = -1.12, -0.40, 0.74, BEARER_Z, 0.80
    b.extend(K.box_buf((lx0, ly0, lz0), (lx1, BW - 0.004, lz1), 'paint', 0.01, 2))
    b.extend(K.box_buf((lx0 + 0.04, BW - 0.006, lz0 + 0.05), (lx1 - 0.04, BW - 0.002, lz1 - 0.04), 'trim', 0.002, 1))
    b.extend(K.box_buf((lx0 + 0.045, BW - 0.005, lz0 + 0.055), (lx1 - 0.045, BW + 0.0005, lz1 - 0.045), 'paint', 0.006, 1))
    xm = 0.5 * (lx0 + lx1)
    b.extend(K.box_buf((xm - 0.05, BW, lz1 - 0.10), (xm + 0.05, BW + 0.014, lz1 - 0.065), 'chrome', 0.004, 2))
    for x in (lx0 + 0.12, lx1 - 0.12):
        b.extend(K.cyl_buf((x - 0.04, BW + 0.004, lz0 + 0.05), (x + 0.04, BW + 0.004, lz0 + 0.05), 0.008, 'steel', 6))
    b.extend(K.box_buf((lx0 + 0.05, ly0 - 0.004, lz1), (lx0 + 0.09, 0.50, lz1 + 0.004), 'steel', 0.0, 1))
    b.extend(K.box_buf((lx1 - 0.09, ly0 - 0.004, lz1), (lx1 - 0.05, 0.50, lz1 + 0.004), 'steel', 0.0, 1))
    # amber side markers low on the drop side, front and rear
    for x in (XF - 0.16, XR + 0.16):
        b.extend(K.box_buf((x - 0.04, BW - 0.004, DECK + 0.02), (x + 0.04, BW + 0.010, DECK + 0.055), 'lens_amber', 0.006, 2))
    return b


def box_centre():
    """Both sides at once: the spare wheel stood up behind the cab on its tray and its clamp, the carrier's posts,
    a jerry can on a bracket either side of it, the rear lamps' brackets, the number plate and its lamp, two red
    clearance lamps on the rear hoop, two amber ones on the front of the tilt."""
    from frames._sedan_build import plate_buf
    b = K.Buf()
    b.extend(spare_wheel())
    x, _, z0, r, w = SPARE
    # the carrier: a tray across the rails, two posts outboard of the wheel, a top bar, the clamp strap over the tread
    b.extend(K.box_buf((x - w / 2 - 0.02, -0.42, 0.82), (x + w / 2 + 0.02, 0.42, z0), 'steel', 0.004, 1))
    for sy in (-1, 1):
        b.extend(K.box_buf((x - 0.018, sy * 0.47 - 0.018, 0.82), (x + 0.018, sy * 0.47 + 0.018, z0 + 2 * r + 0.04), 'steel', 0.005, 1))
    b.extend(K.box_buf((x - 0.018, -0.488, z0 + 2 * r + 0.02), (x + 0.018, 0.488, z0 + 2 * r + 0.056), 'steel', 0.005, 1))
    zc = z0 + r
    b.extend(K.box_buf((x - 0.03, -0.02, zc + r - 0.002), (x + 0.03, 0.02, z0 + 2 * r + 0.02), 'trim', 0.004, 1))
    # jerry cans either side of the spare on brackets off the rails, a strap round each
    for sy in (-1, 1):
        ya, yb = sorted((sy * 0.49, sy * 0.95))
        b.extend(K.box_buf((x - 0.105, ya, 0.80), (x + 0.105, yb, 0.82), 'steel', 0.003, 1))
        yc = sy * 0.72
        b.extend(jerry_can(np.array([x, yc, 0.82])))
        b.extend(K.box_buf((x - 0.0855, yc - 0.1755, 1.12), (x + 0.0855, yc + 0.1755, 1.15), 'trim', 0.003, 1))
    # the rear sill across the box's end under the tailgate (a steel member below its hinge line, set forward of the
    # gate's swing), a steel strip over the planks' ends, the body's hinge knuckles between the gate's
    zs0 = BEARER_Z - 0.03
    b.extend(K.box_buf((XR + 0.026, -BIN, zs0), (XR + SIDE_T + 0.03, BIN, DECK - DECK_T - 0.001), 'steel', 0.004, 1))
    b.extend(K.box_buf((XR + SIDE_T - 0.003, -BIN, DECK - DECK_T - 0.002), (XR + SIDE_T + 0.0004, BIN, DECK + 0.0005), 'steel', 0.0, 1))
    hx, hz = tailgate_hinge()[0], tailgate_hinge()[2]
    for y in (-1.0, -0.577, 0.0, 0.577, 1.0):
        b.extend(K.cyl_buf((hx, y - 0.05, hz), (hx, y + 0.05, hz), 0.011, 'steel', 8))
        b.extend(K.box_buf((hx - 0.005, y - 0.04, DECK - DECK_T - 0.004), (hx + 0.011, y + 0.04, hz), 'steel', 0.002, 1))
    # the rear lamps' brackets (the lamps are parts): a plate behind each lamp hung from the sill, a lip under it
    for sy in (-1, 1):
        yl = sy * TAIL_Y
        b.extend(K.box_buf((XR + 0.008, yl - 0.155, TAIL_Z - 0.078), (XR + 0.02, yl + 0.155, zs0 + 0.004), 'steel', 0.003, 1))
        b.extend(K.box_buf((XR - 0.03, yl - 0.155, TAIL_Z - 0.078), (XR + 0.02, yl + 0.155, TAIL_Z - 0.070), 'steel', 0.002, 1))
    # the number plate on its bracket left of the middle, its lamp over it
    pc = np.array([XR + 0.004, 0.42, TAIL_Z])
    b.extend(K.box_buf((XR + 0.008, 0.25, TAIL_Z - 0.09), (XR + 0.02, 0.59, zs0 + 0.004), 'steel', 0.003, 1))
    b.extend(plate_buf(pc, (-1.0, 0.0, 0.0), (0.0, 0.0, 1.0), 0.33, 0.15, '6W 410'))
    b.extend(K.box_buf((XR - 0.025, 0.37, TAIL_Z + 0.085), (XR + 0.006, 0.47, TAIL_Z + 0.105), 'trim', 0.006, 2))
    # clearance lamps on the tilt's corners: red at the rear hoop, amber on the front panel
    for sy in (-1, 1):
        y = sy * (TILT_W - 0.16)
        b.extend(K.box_buf((TILT_XR - 0.03, y - 0.035, TILT_TOP - 0.03), (TILT_XR + 0.004, y + 0.035, TILT_TOP + 0.006), 'lens_tail', 0.006, 2))
        b.extend(K.box_buf((TILT_XF - 0.004, y - 0.035, TILT_TOP - 0.05), (TILT_XF + 0.026, y + 0.035, TILT_TOP - 0.01), 'lens_amber', 0.006, 2))
    return b


# the rear lamps' mounts (on their brackets under the box's rear corners)
TAIL_Y = 0.90
TAIL_Z = 0.98


def spare_wheel():
    """The full-size spare stood up behind the cab, its axis along the truck: a knobbly mud tyre, a steel truck wheel
    with its eight nuts and the hub cap (the outer face forwards, towards the cab's back wall)."""
    b = K.Buf()
    x, y, z0, r, w = SPARE
    c = np.array([x, y, z0 + r])
    ri = 0.26
    prof = np.array([(ri, -w * 0.42), (ri + 0.03, -w * 0.47), (r - 0.06, -w * 0.5), (r - 0.014, -w * 0.47), (r, -w * 0.36),
                     (r, w * 0.36), (r - 0.014, w * 0.47), (r - 0.06, w * 0.5), (ri + 0.03, w * 0.47), (ri, w * 0.42)])
    V, N, T = K.lathe(prof, c, (-1, 0, 0), 30)
    b.add(V, N, T, 'rubber')
    for k in range(18):
        a = 2 * PI * k / 18
        for sgn, off in ((1, 0.0), (-1, PI / 18)):
            aa = a + off
            q = c + np.array([sgn * w * 0.2, r * math.cos(aa), r * math.sin(aa)])
            R = K.frame_from((1, 0, 0), (0, math.cos(aa), math.sin(aa)))
            b.extend(K.box_buf((-w * 0.18, -0.04, -0.004), (w * 0.18, 0.04, 0.016), 'rubber', 0.0, 1, xf=K.mat4_trs(q, R)))
    rim = np.array([(0.0, -0.03), (0.07, -0.03), (0.105, -0.022), (0.17, -0.012), (0.21, -0.03), (ri - 0.006, -w * 0.36), (ri + 0.004, -w * 0.42)])
    V, N, T = K.lathe(rim, c, (-1, 0, 0), 24)
    b.add(V, N, T, 'steel')
    V, N, T = K.lathe(np.array([(0.0, -0.075), (0.05, -0.072), (0.058, -0.05), (0.06, -0.03)]), c, (-1, 0, 0), 16)
    b.add(V, N, T, 'chrome')
    for k in range(8):
        a = 2 * PI * (k + 0.5) / 8
        p = c + np.array([0.03, 0.0825 * math.cos(a), 0.0825 * math.sin(a)])
        b.extend(K.cyl_buf(p, p + (0.016, 0, 0), 0.0115, 'chrome', 6))
    return b


def jerry_can(p):
    """A jerry can standing at p (its bottom's middle): the pressed X on its faces, the three handles, the spout."""
    b = K.Buf()
    dx, dy, dz = 0.165, 0.345, 0.47
    x0, y0 = p[0] - dx / 2, p[1] - dy / 2
    b.extend(K.box_buf((x0, y0, p[2]), (x0 + dx, y0 + dy, p[2] + dz), 'paint_b', 0.018, 2))
    # the pressed X on both broad faces (towards and away from the cab)
    for xf_, sg in ((x0 + dx, 1.0), (x0, -1.0)):
        for (ya, za, yb, zb) in ((y0 + 0.05, p[2] + 0.05, y0 + dy - 0.05, p[2] + dz - 0.10), (y0 + 0.05, p[2] + dz - 0.10, y0 + dy - 0.05, p[2] + 0.05)):
            path = np.array([(xf_, ya, za), (xf_, yb, zb)])
            prof = np.array([(-0.012, 0.0), (-0.006, 0.004), (0.006, 0.004), (0.012, 0.0)])
            V, N, T = K.sweep(path, (sg, 0, 0), prof, closed=False)
            b.add(V, N, T, 'paint_b')
    # the three handles on top and the spout with its cap at the front corner
    for k in range(3):
        y = y0 + 0.08 + 0.065 * k
        b.extend(K.tube_buf(np.array([(p[0] - 0.035, y, p[2] + dz), (p[0] - 0.03, y, p[2] + dz + 0.04), (p[0] + 0.03, y, p[2] + dz + 0.04),
                                      (p[0] + 0.035, y, p[2] + dz)]), 0.007, 'paint_b', 6))
    sp = np.array([p[0], y0 + dy - 0.06, p[2] + dz])
    b.extend(K.cyl_buf(sp, sp + (0, 0, 0.04), 0.022, 'paint_b', 12))
    b.extend(K.cyl_buf(sp + (0, 0, 0.035), sp + (0, 0, 0.06), 0.026, 'trim', 12))
    return b


# ============================================================================================ the tailgate (trunk)
def tailgate():
    """The drop tailgate (both halves): a double-skinned panel between the rear posts, two pressed beads on its
    face, its latches at the top corners, the hinges along its bottom edge, two red reflectors, a step in the
    middle. Hinged at its bottom edge, it drops back flat."""
    b = K.Buf()
    x0, x1 = XR, XR + SIDE_T
    hw = TAILGATE_HW
    b.extend(K.box_buf((x0, -hw, DECK + 0.004), (x1, hw, SIDE_TOP - 0.025), 'paint', 0.008, 2))
    b.extend(K.box_buf((x0 - 0.004, -hw, SIDE_TOP - 0.032), (x1 + 0.002, hw, SIDE_TOP), 'paint', 0.01, 2))
    prof = K.round_profile(np.array([(0.0, -0.022), (0.006, -0.016), (0.008, 0.0), (0.006, 0.016), (0.0, 0.022)]), 0.004, 1)
    for zb in BEADS:
        path = np.array([(x0, -hw + 0.06, zb), (x0, hw - 0.06, zb)])
        V, N, T = K.sweep(path, (0, 0, 1), prof, closed=False)
        b.add(V, N, T, 'paint')
        for e, sg in ((0, -1.0), (1, 1.0)):
            ring = V.reshape(2, -1, 3)[e]
            b.extend(K.fill_loop(ring, (0, sg, 0), 'paint'))
    for sy in (-1, 1):
        y = sy * (hw - 0.08)
        b.extend(K.box_buf((x0 - 0.012, y - 0.03, SIDE_TOP - 0.16), (x0, y + 0.03, SIDE_TOP - 0.10), 'steel', 0.004, 1))
        b.extend(K.box_buf((x0 - 0.02, y - 0.012, SIDE_TOP - 0.20), (x0 - 0.008, y + 0.012, SIDE_TOP - 0.11), 'chrome', 0.004, 1))
        b.extend(K.box_buf((x0 - 0.006, sy * 0.70 - 0.05, DECK + 0.03), (x0 + 0.002, sy * 0.70 + 0.05, DECK + 0.075), 'lens_tail', 0.003, 1))
    for y in np.linspace(-hw + 0.20, hw - 0.20, 4):
        b.extend(K.cyl_buf((x0 + 0.025, y - 0.06, DECK - 0.004), (x0 + 0.025, y + 0.06, DECK - 0.004), 0.011, 'steel', 8))
        b.extend(K.box_buf((x0 + 0.005, y - 0.05, DECK - 0.002), (x0 + 0.045, y + 0.05, DECK + 0.06), 'steel', 0.003, 1))
    # the step: two flat treads with raised ribs on stays in the middle of its face
    for zz in (DECK + 0.06, DECK + 0.24):
        b.extend(K.box_buf((x0 - 0.075, -0.20, zz - 0.007), (x0 - 0.012, 0.20, zz + 0.007), 'alu', 0.003, 1))
        for k in range(3):
            xr_ = x0 - 0.064 + 0.019 * k
            b.extend(K.box_buf((xr_ - 0.003, -0.19, zz + 0.006), (xr_ + 0.003, 0.19, zz + 0.011), 'alu', 0.0, 1))
    for y in (-0.212, 0.212):
        b.extend(K.box_buf((x0 - 0.08, y - 0.012, DECK + 0.04), (x0, y + 0.012, DECK + 0.26), 'trim', 0.004, 1))
    return b


def tailgate_hinge():
    """The tailgate's hinge line: along its bottom edge, mid-thickness."""
    return np.array([XR + SIDE_T / 2, 0.0, DECK - 0.004])


# ============================================================================================ the fuel filler
def fuel_pocket():
    """The filler's pocket behind the rear wheel (built on the left, the build mirrors it to the right side): a steel
    box under the deck's edge, the flap's opening in its outer face, the rolled lip, the screw cap inside."""
    b = K.Buf()
    x0, x1, z0, z1, yi = POCKET
    fx, fz, fr = FUEL
    ring = K.circle_loop(fx, fz, fr + 0.004, 0.008)
    face = np.array([(x0, z0), (x1, z0), (x1, z1), (x0, z1)])
    loop3 = np.stack([face[:, 0], np.full(4, BW), face[:, 1]], 1)
    hole3 = np.stack([ring[:, 0], np.full(len(ring), BW), ring[:, 1]], 1)
    b.extend(K.fill_loop(K.resample(loop3, 0.03), (0, 1, 0), 'paint', holes=[hole3[::-1]]))
    b.extend(K.box_buf((x0, yi, z0), (x1, BW - 0.002, z1), 'paint', 0.006, 1))
    # the lip into the opening, the pocket's back with the screw cap
    V, N, T = K.lathe(np.array([(fr + 0.004, 0.0), (fr + 0.004, -0.035)]), (fx, BW, fz), (0, 1, 0), 24, prof_n=np.array([[-1.0, 0.0], [-1.0, 0.0]]))
    b.add(V, N, T, 'trim')
    V, N, T = K.lathe(np.array([(0.0, -0.034), (fr + 0.004, -0.034)]), (fx, BW, fz), (0, 1, 0), 24, prof_n=np.array([[0.0, 1.0], [0.0, 1.0]]))
    b.add(V, N, T, 'trim')
    cap = np.array([[0.0, 0.0], [0.030, 0.0], [0.031, 0.004], [0.031, 0.014], [0.028, 0.018], [0.0, 0.018]])
    V, N, T = K.lathe(cap, (fx, BW - 0.034, fz), (0, 1, 0), 20)
    b.add(V, N, T, 'trim')
    return b


def fuel_flap():
    """The flap over the filler (left-hand build; the build mirrors it): a disc in the pocket's face with a rolled
    rim and a back, its hinge on the front edge."""
    b = K.Buf()
    fx, fz, fr = FUEL
    V, N, T = K.lathe(np.array([(0.0, 0.002), (fr - 0.004, 0.002), (fr - 0.001, 0.0), (fr, -0.004)]), (fx, BW, fz), (0, 1, 0), 24)
    b.add(V, N, T, 'paint')
    V, N, T = K.lathe(np.array([(fr, -0.004), (0.0, -0.004)]), (fx, BW, fz), (0, 1, 0), 24, prof_n=np.array([[0.0, -1.0], [0.0, -1.0]]))
    b.add(V, N, T, 'paint')
    b.extend(K.box_buf((fx + fr - 0.012, BW - 0.002, fz - 0.012), (fx + fr + 0.006, BW + 0.004, fz + 0.012), 'steel', 0.002, 1))
    return b
