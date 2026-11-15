"""Sedan: everything behind the outer skin. Door insides, belt mouldings, handles, hood and boot lid inner
frames, engine bay, boot, door apertures, underbody (UNDER) and the cabin (INTERIOR). Left-half builders
return K.Buf in Blender coordinates; the assembly (frames/_sedan_build.py) mirrors and names the objects."""
import math
import sys

sys.dont_write_bytecode = True

import numpy as np  # noqa: E402

from frames import _kit as K  # noqa: E402
from frames import sedan as S  # noqa: E402

D = S.D
PI = math.pi
FLOOR_Z = 0.245          # carpet top in the cabin
PAN_Z = 0.19             # underside of the floor pan
BOOT_Z = 0.38            # boot floor
FIREWALL_X = 0.84
RAD_X = 1.755            # radiator support plane
APRON_Y = 0.47           # engine bay side wall (inboard of the front wheelhouse)
SEAT_X = -0.20           # front seat reference (H point) x
REAR_SEAT_X = -0.92      # the stock bench's back clears the C pillars and the parcel shelf
DRIVER_Y = 0.36
EYE = (SEAT_X - 0.16, DRIVER_Y, FLOOR_Z + 0.035 + 0.90)   # the stock bucket seat's eye (parts_geo: -0.16 back, 0.90 up)


def rear_arch_front(z):
    """x of the rear wheel arch's front edge at height z."""
    dz = z - D['hub_z']
    return D['ax_r'] + math.sqrt(max(D['arch_r'] ** 2 - dz * dz, 0.0))


def tunnel_h(x):
    """Height of the top of the transmission tunnel (pan side) along x: gearbox at the front, propshaft behind."""
    return 0.31 + 0.15 * float(K.sstep(-0.35, 0.45, x))


def side_pt(x, z, level=0.0):
    """Point and normal on the lower body side (left) at side coordinates (x, z), moved by `level` along the
    normal (negative = inwards)."""
    P, N = S.SIDE_L.to3d(np.array([[x, z]]))
    return P[0] + N[0] * level, N[0]


# ============================================================================================ doors
def door_card(ex, w):
    """Door card (trim panel) on the inside of a door skin, with armrest, pull, crank, lock knob, chrome lines."""
    b = K.Buf()
    if w == 'F':
        x0, x1 = D['fd_rear'] + 0.03, D['fd_front'] - 0.03
    else:
        x0, x1 = D['rd_rear'] + 0.03, D['rd_front'] - 0.03
    z0, z1 = D['door_bot'] + 0.03, 0.80
    pts = [(x0, z0), (x1, z0), (x1, z1), (x0, z1)]
    radii = [0.03, 0.03, 0.02, 0.02]
    if w == 'R':
        # cut round the rear wheel arch notch
        xa, za = D['ax_r'], D['hub_z']
        Rn = D['arch_r'] + 0.03 + 0.035
        th0 = math.asin((z0 - za) / Rn)
        th1 = math.acos((x0 - xa) / Rn)
        ths = np.linspace(th0, th1, 14)
        arc = np.stack([xa + Rn * np.cos(ths), za + Rn * np.sin(ths)], 1)
        pts = [tuple(arc[0])] + [(x1, z0), (x1, z1), (x0, z1)] + [tuple(p) for p in arc[::-1][:-1]]
        pts = pts[1:] + pts[:1]
        radii = [0.03, 0.02, 0.02] + [0.0] * (len(pts) - 3)
        pts = np.array(pts)
        # order: (x1,z0) (x1,z1) (x0,z1) arc ... -> rounded
    loop = K.ccw(K.rounded_poly(np.array(pts), radii, 0.05, arc_step=0.012))
    g = K.grid_points(x0, x1, z0, z1, 0.075, dt=0.075)
    card = K.OffsetChart(S.SIDE_L, -0.104)
    V, N, T = K.mesh_region(card, [K.Loop(K.resample_keep(loop, 0.05))], [], g, spacing=0.075)
    b.add(V, -N, T, 'plastic_int')
    # card edge (thin rim towards the shut face)
    P, Nn = card.to3d(loop)
    V, N, Tr = K.roll_edge(P, -Nn, K.unit(np.cross(-Nn, np.gradient(P, axis=0))) * 0 + side_out(P, Nn), 0.004, 0.012, 0.0, 2, closed=True)
    b.add(V, N, Tr, 'plastic_int')
    # chrome lines and armrest
    xm = 0.5 * (x0 + x1)
    for zc, mat, h in ((0.70, 'chrome', 0.006), (0.47, 'chrome', 0.005)):
        xs = np.linspace(x0 + 0.04, x1 - 0.04, 6)
        if w == 'R' and zc < 0.6:
            xs = np.linspace(-0.85, x1 - 0.04, 5)
        P, Nn = K.OffsetChart(S.SIDE_L, -0.106).to3d(np.stack([xs, np.full(len(xs), zc)], 1))
        prof = np.array([(0.0, -h), (0.003, -h * 0.6), (0.004, 0.0), (0.003, h * 0.6), (0.0, h)])
        V, N, Tr = K.sweep(P, (0, 0, 1), prof[:, ::-1] * np.array([1, 1]) if False else np.stack([-prof[:, 0], prof[:, 1]], 1), closed=False)
        b.add(V, N, Tr, mat)
    # armrest: a rounded bar on the card
    ax0, ax1 = (x0 + 0.12, x1 - 0.28) if w == 'F' else (x0 + 0.10, x1 - 0.12)
    xs = np.linspace(ax0, ax1, 7)
    P, Nn = K.OffsetChart(S.SIDE_L, -0.104).to3d(np.stack([xs, np.full(len(xs), 0.60)], 1))
    prof = K.round_profile(np.array([(0.0, -0.025), (-0.055, -0.03), (-0.065, 0.0), (-0.05, 0.03), (0.0, 0.03)]), 0.012, 2)
    V, N, Tr = K.sweep(P, (0, 0, 1), np.stack([-prof[:, 0] * -1, prof[:, 1]], 1) * np.array([-1, 1]), closed=False)
    b.add(V, N, Tr, 'plastic_int')
    # window crank (chrome) and interior handle
    pc, nc = side_pt(xm + (0.10 if w == 'F' else 0.05), 0.69, -0.104)
    inward = -nc
    b.extend(K.cyl_buf(pc, pc + inward * 0.02, 0.022, 'chrome', 16))
    arm_end = pc + inward * 0.02 + np.array([0.0, 0.0, -0.07])
    b.extend(K.tube_buf(np.array([pc + inward * 0.02, arm_end]), 0.006, 'chrome', 8))
    b.extend(K.cyl_buf(arm_end, arm_end + inward * 0.04, 0.012, 'plastic_int', 12))
    ph, nh = side_pt(x1 - 0.13, 0.74, -0.104)
    b.extend(K.box_buf(ph + (-0.05, -0.012, -0.012), ph + (0.05, 0.0, 0.012), 'chrome', 0.004, 2))
    return b


def side_out(P, Nn):
    """In-surface direction towards larger |y| ... used for small rims: points 'outward' in the card plane."""
    c = P.mean(0)
    d = P - c
    d = d - Nn * (d * Nn).sum(1)[:, None]
    return K.unit(d)


def door_extras(ex, w):
    """Belt moulding, inner window sill, frame inner face, outside handle and key, hinges, glass channel."""
    b = K.Buf()
    jl = ex.jl
    if w == 'F':
        xa, xb = D['fd_front'] - 0.004, D['fd_rear'] + 0.004
    else:
        xa, xb = D['rd_front'] - 0.004, D['rd_rear'] + 0.004
    uv, P, NL, NG, _ = jl.between(float(S.u_of_x(xa)), float(S.u_of_x(xb)))
    P = K.resample(P, 0.05, closed=False)
    # belt moulding (chrome): sits on the junction, hugging the top strip and the glass line
    prof = K.round_profile(np.array([(0.012, -0.002), (0.012, 0.007), (0.002, 0.016), (-0.010, 0.016), (-0.012, 0.004), (-0.012, -0.002)]), 0.004, 1)
    V, N, Tr = K.sweep(P + np.array([0, 0, 0.0]), (0, 0, 1), np.stack([-prof[:, 0], prof[:, 1]], 1) if False else prof, closed=False)
    b.add(V, N, Tr, 'chrome')
    for e, sgn in ((0, 1), (-1, -1)):
        cap = K.fill_loop(V.reshape(len(P), -1, 3)[e], (np.sign(P[e, 0] - P[-1 - e, 0]) * 1.0, 0, 0), 'chrome')
        b.extend(cap)
    # inner window sill (plastic) from the card top to the glass line
    Pin = P.copy()
    Pin[:, 1] -= 0.045
    prof = K.round_profile(np.array([(0.035, -0.10), (0.032, 0.0), (0.012, 0.005), (-0.02, 0.0), (-0.025, -0.10)]), 0.008, 1)
    V, N, Tr = K.sweep(Pin + np.array([0, 0, -0.01]), (0, 0, 1), prof, closed=False)
    b.add(V, N, Tr, 'plastic_int')
    # outside handle (pull bar on a dark escutcheon) near the rear edge, just under the shoulder
    xh = (D['fd_rear'] + 0.12) if w == 'F' else (D['rd_rear'] + 0.20)
    zh = 0.835
    ph, nh = side_pt(xh, zh)
    R = K.frame_from((1, 0, 0), (0, 0, 1))
    b.extend(K.box_buf((-0.065, -0.006, -0.016), (0.065, 0.0015, 0.016), 'trim', 0.004, 2, xf=K.mat4_trs(ph)))
    b.extend(K.box_buf((-0.055, 0.0, -0.009), (0.055, 0.016, 0.008), 'chrome', 0.007, 3, xf=K.mat4_trs(ph)))
    if w == 'F':
        pk, nk = side_pt(xh + 0.105, zh)
        b.extend(K.cyl_buf(pk - nk * 0.002, pk + nk * 0.006, 0.0095, 'chrome', 16))
        b.extend(K.box_buf(pk + nk * 0.0062 + (-0.0012, -0.0005, -0.005), pk + nk * 0.0064 + (0.0012, 0.0005, 0.005), 'trim', 0.0, 1))
    # hinges on the front shut face (visible when open)
    xf = D['fd_front'] if w == 'F' else D['rd_front']
    for zz in (0.47, 0.76):
        p0, n0 = side_pt(xf - 0.004, zz, -0.03)
        b.extend(K.box_buf(p0 + (-0.012, -0.03, -0.03), p0 + (0.004, 0.0, 0.03), 'steel', 0.004, 2))
    return b


def door_frame_inner(ex, w):
    """Inner face of the window frame band (35 mm in), facing the cabin."""
    c = ex.cut['doorG_' + w]
    s = c.side('in')
    uvp = S.CG.to2d(s['P'])
    gs = ex.gs
    xs = np.linspace(s['uv'][-1, 0], s['uv'][0, 0], 12)[1:-1]
    Pj = np.array([gs.j_point(x)[0] for x in xs])
    loop = np.vstack([uvp, S.CG.to2d(Pj)])
    holes = []
    for name, poly in ex.cut['winG_' + w]:
        P, N = S.SIDE_G.to3d(poly)
        holes.append(K.Loop(S.CG.to2d(P)))
    us = np.linspace(0, S.G_GUIDE.length, 260)
    pts, sp = S.grid_from(us, S.g_t_samples())
    V, N, T = K.mesh_region(S.CG, [K.Loop(loop)], holes, pts, spacing=sp, level=-0.035)
    return K.Buf().add(V, -N, T, 'paint')


# ============================================================================================ hood / boot lid
def lid_inner(ex, name):
    """Inner frame of the hood / boot lid, 28 mm under the skin. The hood's is a perimeter ring (narrow at the
    hinge edge) so an engine can come up close under the skin; the boot lid's a panel with a lightening hole."""
    c = ex.cut[name]
    s = c.side('in')
    uv = s['uv']
    inner = K.offset_loop2(uv, (-0.035 if name == 'hood' else 0.035), closed=False)
    inner[0, 1] = 0.0
    inner[-1, 1] = 0.0
    if name == 'hood':
        return ring_inner(S.CT, uv, inner, -0.10, 0.065)
    xs = np.linspace(inner[-1, 0], inner[0, 0], 30)[1:-1]
    loop = np.vstack([inner, np.stack([xs, np.zeros(len(xs))], 1)])
    holes = [K.Loop(K.rrect_loop(-1.80, 0.30, 0.14, 0.17, 0.06, 0.035))]
    g = K.grid_points(uv[:, 0].min(), uv[:, 0].max(), 0.0, 0.8, 0.075, dt=0.075)
    V, N, T = K.mesh_region(S.CT, [K.Loop(K.resample_keep(loop, 0.05))], holes, g, spacing=0.075, level=-0.028)
    b = K.Buf().add(V, -N, T, 'paint')
    for H in holes:
        P, Nn = S.CT.to3d(H.uv, -0.028)
        E = side_out(P, Nn) * -1
        V, N, Tr = K.roll_edge(P, -Nn, E, 0.004, 0.012, 0.0, 2, closed=True)
        b.add(V, N, Tr, 'paint')
    # the inside of the skin (seen through the lightening hole and round the edge of the frame)
    b.extend(lid_back(S.CT, uv, spacing=0.09))
    return b


def ring_inner(chart, uv, outer, d_in, rear_band, level=-0.028, back=True):
    """Half (y >= 0) of a hood inner frame ring on a top chart: between `outer` (an open polyline from the
    centre line round to the centre line, inside the hood outline) and the outline offset by d_in, with the band
    along the rear (hinge) edge only `rear_band` wide. Rolled inner edge. back: also the inside of the skin with
    a pressed X (lid_back, lid_beads), so the opened hood is opaque."""
    ring_in = K.offset_loop2(uv, d_in, closed=False)
    ring_in[:, 0] = np.maximum(ring_in[:, 0], uv[:, 0].min() + rear_band)
    ring_in[0, 1] = 0.0
    ring_in[-1, 1] = 0.0
    ring_in = K.resample(ring_in, 0.012, closed=False)
    for _ in range(12):        # round the corners the rear clamp made (ends stay on the centre line)
        ring_in[1:-1] = 0.5 * ring_in[1:-1] + 0.25 * (ring_in[:-2] + ring_in[2:])
    ring_in = K.resample(ring_in, 0.03, closed=False)
    ring_in[0, 1] = 0.0
    ring_in[-1, 1] = 0.0
    loop = np.vstack([K.resample(outer, 0.05, closed=False), ring_in[::-1]])
    g = K.grid_points(uv[:, 0].min(), uv[:, 0].max(), 0.0, 0.85, 0.06, dt=0.06)
    V, N, T = K.mesh_region(chart, [K.Loop(loop)], [], g, spacing=0.06, level=level)
    b = K.Buf().add(V, -N, T, 'paint')
    P, Nn = chart.to3d(ring_in, level)
    P2, _ = chart.to3d(K.offset_loop2(ring_in, -0.01, closed=False), level)
    E = K.unit(P2 - P)
    E = K.unit(E - Nn * np.sum(E * Nn, 1)[:, None])
    V, N, Tr = K.roll_edge(P, -Nn, E, 0.004, 0.012, 0.0, 2, closed=False)
    b.add(V, N, Tr, 'paint')
    if back:
        # the skin's inside (the skin is single-sided: an opened hood would show the windscreen through it) with
        # a big pressed X in the open middle, beads 6 mm deep so the engine keeps its clearance
        b.extend(lid_back(chart, uv))
        reg = close_centre(ring_in)
        lo, hi = reg.min(0), reg.max(0)
        xm = 0.5 * (lo[0] + hi[0])
        lines = [((xm, 0.0), (lo[0], hi[1])), ((xm, 0.0), (hi[0], hi[1]))]
        b.extend(lid_beads(chart, reg, lines, margin=0.035))
    return b


def close_centre(pl, step=0.04):
    """Close an open half-outline that starts and ends on the centre line (y = 0) along the centre line."""
    pl = np.asarray(pl, float)
    n = max(2, int(abs(pl[0, 0] - pl[-1, 0]) / step) + 1)
    xs = np.linspace(pl[-1, 0], pl[0, 0], n)[1:-1]
    return np.vstack([pl, np.stack([xs, np.zeros(len(xs))], 1)])


def lid_back(chart, uv, level=-0.004, inset=0.006, spacing=0.075, mat='paint'):
    """The inside of a lid's skin (left half), `level` under it and facing down: the lid outline (an open polyline
    from the centre line round to the centre line) pulled in to the hem's flange. The skins are single-sided, so
    without it an opened lid is see-through from below."""
    reg0 = close_centre(uv)
    mid = len(uv) // 2
    probe = K.offset_loop2(uv, -0.01, closed=False)[mid:mid + 1]
    d = -inset if K.in_poly(probe, reg0)[0] else inset
    ol = K.offset_loop2(uv, d, closed=False)
    ol[0, 1] = 0.0
    ol[-1, 1] = 0.0
    ol = K.resample(ol, 0.035, closed=False)
    ol[0, 1] = 0.0
    ol[-1, 1] = 0.0
    loop = close_centre(ol)
    g = K.grid_points(loop[:, 0].min(), loop[:, 0].max(), 0.0, loop[:, 1].max(), spacing, dt=spacing)
    V, N, T = K.mesh_region(chart, [K.Loop(loop)], [], g, spacing=spacing, level=level)
    return K.Buf().add(V, -N, T, mat)


def lid_beads(chart, region, lines, level=-0.004, w=0.034, h=0.006, margin=0.03, step=0.03, mat='paint'):
    """Pressed beads on the inside of a lid (left half): each line (two uv points) is clipped to `region` (a closed
    uv loop) shrunk by `margin`, swept with a rounded bead profile standing `h` down from `level`; the ends taper
    into the sheet."""
    b = K.Buf()
    reg = K.ccw(np.asarray(region, float))
    shrunk = K.offset_loop2(reg, margin)
    prof = np.array([(-w / 2, 0.0), (-w * 0.30, h * 0.72), (0.0, h), (w * 0.30, h * 0.72), (w / 2, 0.0)])
    for p0, p1 in lines:
        p0 = np.asarray(p0, float)
        p1 = np.asarray(p1, float)
        ts = np.linspace(0.0, 1.0, 241)
        Q = p0[None] + (p1 - p0)[None] * ts[:, None]
        ins = K.in_poly(Q, shrunk)
        best, cur = (0, 0), None
        for i, f in enumerate(list(ins) + [False]):
            if f and cur is None:
                cur = i
            elif not f and cur is not None:
                if i - cur > best[1] - best[0]:
                    best = (cur, i)
                cur = None
        if best[1] - best[0] < 8:
            continue
        seg = K.resample(Q[best[0]:best[1]], step, closed=False)
        P, Nn = chart.to3d(seg, level)
        T = np.gradient(P, axis=0)
        T = K.unit(T)
        Sd = K.unit(np.cross(T, Nn))
        dn = -Nn
        s = np.concatenate([[0.0], np.cumsum(np.linalg.norm(np.diff(P, axis=0), axis=1))])
        tap = np.clip(np.minimum(s, s[-1] - s) / 0.05, 0.0, 1.0)
        tap = tap * tap * (3.0 - 2.0 * tap)
        V = (P[:, None, :] + Sd[:, None, :] * prof[None, :, 0:1] + dn[:, None, :] * (prof[None, :, 1:2] * tap[:, None, None])).reshape(-1, 3)
        Tr = K.grid_tris(len(P), len(prof))
        nb = recompute_normals(K.Buf().add(V, np.zeros_like(V), Tr, mat))
        Vb, Nb, Tb, Mb = nb.arrays()
        dref = np.repeat(dn, len(prof), axis=0)
        if float((Nb * dref).sum()) < 0.0:
            Nb = -Nb
        b.add(Vb, Nb, Tb, mat)
    return b


# ============================================================================================ engine bay, boot
def quad_sheet(p0, du, dv, nu, nv, normal, mat):
    """Flat grid sheet p0 + i/nu*du + j/nv*dv with a constant normal."""
    p0 = np.asarray(p0, float)
    du = np.asarray(du, float)
    dv = np.asarray(dv, float)
    V = np.array([p0 + du * (i / nu) + dv * (j / nv) for i in range(nu + 1) for j in range(nv + 1)])
    T = K.grid_tris(nu + 1, nv + 1)
    return K.Buf().add(V, np.tile(np.asarray(normal, float), (len(V), 1)), T, mat)


def tub(xa, za, r, y0, y1, a0, a1, mat, outward=True, n=18):
    """Part-cylinder about the axis (xa, *, za) along y between angles a0..a1 (deg)."""
    ths = np.radians(np.linspace(a0, a1, n))
    ys = np.array([y0, y1])
    V = np.array([(xa + r * math.cos(t), y, za + r * math.sin(t)) for t in ths for y in ys])
    s = 1.0 if outward else -1.0
    N = np.array([(s * math.cos(t), 0.0, s * math.sin(t)) for t in ths for y in ys])
    return K.Buf().add(V, N, K.grid_tris(len(ths), 2), mat)


def engine_bay():
    """Left half of the engine bay: side wall, wheelhouse tub with the strut tower, fender ledge, firewall,
    radiator support, hood hinge brackets, wiring."""
    b = K.Buf()
    top = 0.835
    xa, za = D['ax_f'], D['hub_z']
    y_out = 0.772
    # side wall of the bay, facing the engine
    b.extend(quad_sheet((FIREWALL_X, APRON_Y, 0.40), (RAD_X - FIREWALL_X, 0, 0), (0, 0, top - 0.40), 4, 2, (0, -1, 0), 'paint'))
    # wheelhouse tub seen from the bay (painted top side), outboard of the side wall
    R = 0.372
    b.extend(tub(xa, za, R, APRON_Y, y_out, 4, 176, 'paint', True))
    # strut tower bulging into the bay from the side wall, the strut's top mount on its cap
    b.extend(strut_tower(xa, 0.50, 0.08, 0.40, top + 0.003, APRON_Y))
    # stamped bead along the side wall (broken by the tower)
    for (x0, x1) in ((FIREWALL_X + 0.06, xa - 0.11), (xa + 0.10, RAD_X - 0.06)):
        b.extend(K.tube_buf(np.array([(x0, APRON_Y, 0.60), (x1, APRON_Y, 0.60)]), 0.007, 'paint', 6))
    # fender top ledge (under the hood gutter) from the side wall out to the body
    b.extend(quad_sheet((FIREWALL_X, APRON_Y, top), (RAD_X - FIREWALL_X, 0, 0), (0, y_out - APRON_Y, 0), 4, 1, (0, 0, 1), 'paint'))
    b.extend(quad_sheet((FIREWALL_X, APRON_Y, top - 0.004), (RAD_X - FIREWALL_X, 0, 0), (0, 0, 0.004), 2, 1, (0, -1, 0), 'paint'))
    # closing walls of the fender cavity in front of / behind the wheelhouse
    for x0 in (xa - R - 0.01, xa + R + 0.01):
        b.extend(quad_sheet((x0, APRON_Y, 0.40), (0, y_out - APRON_Y, 0), (0, 0, top - 0.40), 1, 2, (1 if x0 > xa else -1, 0, 0), 'paint'))
    # firewall and cowl ledge
    b.extend(quad_sheet((FIREWALL_X, 0.0, 0.30), (0, APRON_Y, 0), (0, 0, 0.58), 2, 3, (1, 0, 0), 'paint'))
    b.extend(K.box_buf((FIREWALL_X - 0.02, 0.0, 0.862), (0.935, 0.765, 0.876), 'paint', 0.004, 2))
    # radiator support: top bar, side post, bottom bar
    b.extend(K.box_buf((RAD_X, 0.0, 0.785), (RAD_X + 0.045, APRON_Y + 0.01, 0.832), 'paint', 0.008, 2))
    b.extend(K.box_buf((RAD_X, 0.0, 0.355), (RAD_X + 0.045, APRON_Y + 0.01, 0.40), 'paint', 0.008, 2))
    b.extend(K.box_buf((RAD_X, APRON_Y - 0.065, 0.355), (RAD_X + 0.045, APRON_Y + 0.01, 0.832), 'paint', 0.008, 2))
    # hood latch (half) on the top bar, above the radiator's space
    b.extend(K.box_buf((RAD_X - 0.025, 0.0, 0.81), (RAD_X + 0.006, 0.035, 0.862), 'steel', 0.004, 2))
    # hood hinge bracket at the cowl
    b.extend(K.box_buf((0.90, 0.60, 0.835), (0.95, 0.615, 0.88), 'steel', 0.003, 1))
    # ribbed heat shield on the firewall behind the engine (within 2 cm of it: the engine's space starts there)
    b.extend(heat_shield(FIREWALL_X, 0.27, 0.50, 0.80))
    # wiring loom: from the fuse box along the side wall, round the strut tower to the headlamp, a branch over
    # the radiator support's top bar, a branch down across the firewall under the heat shield
    wy = APRON_Y - 0.015
    main = [(FIREWALL_X + 0.24, wy, 0.755), (1.08, wy, 0.76), (xa - 0.065, 0.408, 0.77), (xa, 0.400, 0.775), (xa + 0.065, 0.408, 0.77),
            (xa + 0.13, wy, 0.76), (1.60, wy, 0.755), (RAD_X - 0.055, wy - 0.003, 0.74), (RAD_X - 0.02, 0.44, 0.69), (RAD_X - 0.012, 0.43, 0.665)]
    top_bar = [(RAD_X - 0.055, wy - 0.003, 0.74), (RAD_X + 0.008, 0.42, 0.838), (RAD_X + 0.02, 0.22, 0.839), (RAD_X + 0.02, 0.0, 0.839)]
    fw = [(FIREWALL_X + 0.13, wy, 0.725), (0.92, wy, 0.60), (FIREWALL_X + 0.012, 0.44, 0.52), (FIREWALL_X + 0.012, 0.30, 0.482),
          (FIREWALL_X + 0.012, 0.0, 0.482)]
    b.extend(harness([main, top_bar, fw], [0.008, 0.006, 0.006]))
    for x in (1.02, 1.44, 1.56):
        b.extend(K.box_buf((x - 0.008, APRON_Y - 0.009, 0.745), (x + 0.008, APRON_Y, 0.772), 'trim', 0.002, 1))
    b.extend(K.box_buf((RAD_X - 0.025, 0.415, 0.635), (RAD_X - 0.002, 0.445, 0.67), 'plastic_int', 0.004, 1))
    # brake lines from the master cylinder down the side wall to the wheel
    for dz in (0.0, 0.013):
        path = [(FIREWALL_X + 0.21, 0.395, 0.70 + dz), (1.07, 0.43, 0.695 + dz), (1.10, APRON_Y - 0.006, 0.665 + dz),
                (1.115, APRON_Y - 0.006, 0.56 + dz), (1.12, APRON_Y - 0.006, 0.44 + dz)]
        b.extend(K.tube_buf(smooth_path(path, 1), 0.0026, 'steel', 4))
    return b


# ============================================================================================ bay details (shared)
def smooth_path(pts, iters=2):
    """Chaikin corner cutting of an open polyline (end points kept)."""
    P = np.asarray(pts, float)
    for _ in range(iters):
        Q = [P[0]]
        for a, c in zip(P[:-1], P[1:]):
            Q.append(0.75 * a + 0.25 * c)
            Q.append(0.25 * a + 0.75 * c)
        Q.append(P[-1])
        P = np.array(Q)
    return P


def harness(paths, radii, mat='rubber', segs=5):
    """Wiring loom: smoothed tubes along the given polylines."""
    b = K.Buf()
    for path, r in zip(paths, radii):
        b.extend(K.tube_buf(smooth_path(path, 1), r, mat, segs))
    return b


def strut_tower(xa, yc, r, z0, ztop, wall_y, segs=14, mat='paint'):
    """Strut tower (left side) bulging into the bay from its side wall at y = wall_y: the inboard part of a
    vertical cylinder about (xa, yc) from z0 up to ztop, closed below; on the cap the strut's top mount (a rubber
    ring, a steel plate with three studs, the rod nut)."""
    b = K.Buf()
    s0 = max(-1.0, min(1.0, (wall_y - yc) / r))
    a0 = math.asin(s0)
    phis = np.linspace(PI - a0, 2 * PI + a0, segs)
    V = np.array([(xa + r * math.cos(p), yc + r * math.sin(p), z) for p in phis for z in (z0, ztop)])
    N = np.array([(math.cos(p), math.sin(p), 0.0) for p in phis for z in (0, 1)])
    b.add(V, N, K.grid_tris(len(phis), 2), mat)
    arc = np.array([(xa + r * math.cos(p), yc + r * math.sin(p), z0) for p in phis])
    b.extend(K.fill_loop(arc, (0, 0, -1), mat))
    # the cap: a disc over the tower (its outboard half rests on the fender ledge)
    V, N, T = K.lathe(np.array([(r, 0.0), (0.0, 0.0)]), (xa, yc, ztop), (0, 0, 1), segs + 4)
    b.add(V, N, T, mat)
    V, N, T = K.lathe(np.array([(0.047, 0.0005), (0.045, 0.004), (0.034, 0.005)]), (xa, yc, ztop), (0, 0, 1), 16)
    b.add(V, N, T, 'rubber')
    V, N, T = K.lathe(np.array([(0.034, 0.005), (0.031, 0.0065), (0.0, 0.0065)]), (xa, yc, ztop), (0, 0, 1), 16)
    b.add(V, N, T, 'steel')
    b.extend(K.cyl_buf((xa, yc, ztop + 0.006), (xa, yc, ztop + 0.0115), 0.0095, 'steel', 6))
    for k in range(3):
        a = math.radians(90 + 120 * k)
        p0 = np.array([xa + 0.040 * math.cos(a), yc + 0.040 * math.sin(a), ztop + 0.003])
        b.extend(K.cyl_buf(p0, p0 + (0, 0, 0.007), 0.0045, 'steel', 6))
    return b


def heat_shield(x0, w, z0, z1, wl=0.043, amp=0.005, mat='alu'):
    """Ribbed heat shield on the firewall (left half, y 0..w), standing off it by 4 mm, with three screws."""
    b = K.Buf()
    n = int(round((z1 - z0) / wl * 4)) + 1
    zs = np.linspace(z0, z1, n)
    xs = x0 + 0.004 + amp * (0.5 - 0.5 * np.cos(2 * PI * (zs - z0) / wl))
    V = np.array([(x, y, z) for (x, z) in zip(xs, zs) for y in (0.0, w)])
    sh = recompute_normals(K.Buf().add(V, np.zeros_like(V), K.grid_tris(n, 2), mat))
    Vb, Nb, Tb, Mb = sh.arrays()
    if float(Nb[:, 0].sum()) < 0.0:
        Nb = -Nb
    b.add(Vb, Nb, Tb, mat)
    for (y, z) in ((w - 0.025, z0 + 0.025), (w - 0.025, z1 - 0.025), (0.10, z1 - 0.025)):
        x = x0 + 0.004 + amp
        b.extend(K.cyl_buf((x - 0.001, y, z), (x + 0.003, y, z), 0.006, 'steel', 6))
    return b


def engine_bay_asym():
    """Non-symmetric engine bay details: brake booster and master cylinder (driver side, left), heater box,
    wiper motor (right), battery tray (left front), washer bottle (right front), fuse box."""
    b = K.Buf()
    fx = FIREWALL_X
    # (all of these stay outboard of the engine's space, |y| > 0.30)
    by_ = 0.395
    V, N, T = K.lathe(np.array([(0.0, 0.0), (0.064, 0.0), (0.072, 0.011), (0.072, 0.052), (0.064, 0.062), (0.0, 0.062)]), (fx, by_, 0.70), (1, 0, 0), 16)
    b.add(V, N, T, 'steel')
    b.extend(K.cyl_buf((fx + 0.062, by_, 0.70), (fx + 0.21, by_, 0.70), 0.02, 'alu', 12))
    b.extend(K.cyl_buf((fx + 0.14, by_, 0.72), (fx + 0.14, by_, 0.772), 0.026, 'ceramic', 14))
    b.extend(K.cyl_buf((fx + 0.14, by_, 0.772), (fx + 0.14, by_, 0.786), 0.021, 'trim', 12))
    # heater box on the right, its two hose stubs
    b.extend(K.box_buf((fx, -0.462, 0.60), (fx + 0.10, -0.31, 0.80), 'plastic_int', 0.02, 2))
    for hz in (0.66, 0.73):
        b.extend(K.tube_buf(smooth_path([(fx + 0.10, -0.38, hz), (fx + 0.15, -0.38, hz - 0.005), (fx + 0.17, -0.375, hz - 0.05)]), 0.012, 'rubber', 8))
    # relay box on the right side wall (the loom's other end)
    b.extend(K.box_buf((fx + 0.15, -APRON_Y, 0.72), (fx + 0.22, -APRON_Y + 0.04, 0.79), 'trim', 0.006, 2))
    # battery tray (the battery part sits on it), left front
    bx, by, bz = 1.52, 0.31, 0.555
    b.extend(K.box_buf((bx - 0.14, by - 0.10, bz - 0.012), (bx + 0.14, by + 0.10, bz), 'steel', 0.004, 1))
    b.extend(K.box_buf((bx - 0.02, by + 0.08, 0.42), (bx + 0.02, APRON_Y, bz - 0.012), 'steel', 0.004, 1))
    b.extend(K.box_buf((bx - 0.14, by - 0.10, bz), (bx - 0.13, by + 0.10, bz + 0.03), 'steel', 0.002, 1))
    # washer bottle (right front)
    b.extend(K.box_buf((1.47, -0.43, 0.55), (1.63, -0.33, 0.73), 'ceramic', 0.03, 2))
    b.extend(K.cyl_buf((1.55, -0.38, 0.73), (1.55, -0.38, 0.76), 0.018, 'trim', 10))
    # fuse box on the left side wall, the identification plate further forward
    b.extend(K.box_buf((fx + 0.13, APRON_Y - 0.05, 0.70), (fx + 0.25, APRON_Y - 0.002, 0.80), 'trim', 0.008, 2))
    b.extend(K.box_buf((1.45, APRON_Y - 0.003, 0.64), (1.53, APRON_Y - 0.001, 0.68), 'alu', 0.0, 1))
    return b


def recompute_normals(buf):
    """Smooth per-vertex normals from the triangles (for simple procedural sheets)."""
    V, N, T, M = buf.arrays()
    acc = np.zeros_like(V)
    cr = np.cross(V[T[:, 1]] - V[T[:, 0]], V[T[:, 2]] - V[T[:, 0]])
    for k in range(3):
        np.add.at(acc, T[:, k], cr)
    out = K.Buf()
    out.add(V, K.unit(acc), T, M[0] if M else 'paint')
    out.M = list(M)
    return out


def boot_interior():
    """Boot floor, side walls, rear panel inside, gutter ledge (left half)."""
    b = K.Buf()
    xt = D['ax_r'] - 0.372                      # rear end of the wheel tub
    b.extend(K.box_buf((-2.0, 0.0, BOOT_Z - 0.012), (xt, 0.70, BOOT_Z), 'paint', 0.004, 2))
    b.extend(K.box_buf((xt, 0.0, BOOT_Z - 0.012), (-1.40, 0.555, BOOT_Z), 'paint', 0.004, 2))
    b.extend(K.box_buf((-2.0, 0.66, BOOT_Z), (xt, 0.70, 0.86), 'paint', 0.004, 2))
    b.extend(K.box_buf((xt, 0.66, 0.665), (-1.40, 0.70, 0.86), 'paint', 0.004, 2))
    b.extend(K.box_buf((-2.03, 0.0, BOOT_Z), (-2.015, 0.70, 0.86), 'paint', 0.004, 2))
    b.extend(K.box_buf((-1.45, 0.0, BOOT_Z), (-1.43, 0.555, 0.90), 'paint', 0.004, 2))
    b.extend(K.box_buf((-1.45, 0.555, 0.665), (-1.43, 0.70, 0.90), 'paint', 0.004, 2))
    # rear wheel arch hump inside the boot (the part above the boot floor)
    za = D['hub_z']
    r = 0.365
    a0 = math.degrees(math.asin((BOOT_Z - za) / r))
    ths = np.radians(np.linspace(a0, 180 - a0, 18))
    ys = np.array([0.56, 0.70])
    V = np.array([(D['ax_r'] + r * math.cos(t), y, za + r * math.sin(t)) for t in ths for y in ys])
    Nn = np.array([(math.cos(t), 0.0, math.sin(t)) for t in ths for y in ys])
    b.add(V, Nn, K.grid_tris(len(ths), 2), 'paint')
    ring = np.array([(D['ax_r'] + r * math.cos(t), 0.56, za + r * math.sin(t)) for t in ths])
    b.extend(K.fill_loop(ring, (0, -1, 0), 'paint'))
    # gutter ledge round the lid opening
    b.extend(K.box_buf((-2.02, 0.70, 0.86), (-1.45, 0.76, 0.875), 'paint', 0.004, 2))
    return b


# ============================================================================================ apertures
def apertures():
    """Door aperture structure: B pillar post below the belt, sill tops with seals (left)."""
    b = K.Buf()
    # B pillar post between the doors (behind the gap)
    b.extend(K.box_buf((-0.335, 0.62, D['door_bot'] - 0.02), (-0.25, 0.70, 0.92), 'paint', 0.006, 2))
    # sill (threshold) top with a rubber seal
    xr_ = rear_arch_front(0.24) + 0.03
    b.extend(K.box_buf((xr_, 0.62, 0.22), (D['fd_front'], 0.70, D['door_bot'] - 0.012), 'paint', 0.006, 2))
    xs = np.linspace(xr_ + 0.02, D['fd_front'] - 0.02, 4)
    path = np.stack([xs, np.full(len(xs), 0.705), np.full(len(xs), D['door_bot'] - 0.006)], 1)
    b.extend(K.tube_buf(path, 0.008, 'rubber', 8))
    return b


def dial(c, dn, r, big, bezel_mat='chrome', segs=None):
    """A round instrument standing on a cluster face through c (normal dn, towards the eye): a bezel ring 7 mm
    wide and 13.5 mm tall, the dial face 7 mm under the cover glass (material 'gauge' with UVs: the face's circle
    fills the unit square, (0.5, 0.5) at the centre, u towards the driver's right, v up, as the game's gauge
    shader paints its 240 degree scale) and the glass. Returns (buf, gauge dict for the needle)."""
    segs = segs or (24 if big else 16)
    dn = K.unit(np.asarray(dn, float))
    up = K.unit(np.array([0.0, 0.0, 1.0]) - dn * dn[2])
    right = K.unit(np.cross(-dn, up))
    h_face, h_glass = 0.0055, 0.0125
    b = K.Buf()
    bez = np.array([(r, h_face), (r, 0.011), (r + 0.003, 0.0135), (r + 0.007, 0.009), (r + 0.007, 0.0)])
    pn = np.array([(-1.0, 0.0), (-0.7, 0.7), (0.0, 1.0), (0.8, 0.6), (1.0, 0.0)])
    V, N, T = K.lathe(bez, c, dn, segs, prof_n=pn, ref=up)
    b.add(V, N, T, bezel_mat)
    face = np.array([(0.0, h_face), (0.5 * r, h_face), (r, h_face)])
    V, N, T = K.lathe(face, c, dn, segs, prof_n=np.tile((0.0, 1.0), (len(face), 1)), ref=up)
    d = V - np.asarray(c, float)
    uv = np.stack([0.5 + 0.5 * (d @ right) / r, 0.5 + 0.5 * (d @ up) / r], 1)
    b.add(V, N, T, 'gauge', uv=uv)
    gl = np.array([(0.0, h_glass), (r + 0.0012, h_glass)])
    V, N, T = K.lathe(gl, c, dn, segs, prof_n=np.tile((0.0, 1.0), (2, 1)), ref=up)
    b.add(V, N, T, 'glass')
    g = dict(center=np.asarray(c, float) + dn * (h_face + 0.0005), normal=dn, r=r, up=up, right=right, big=big, scale_deg=240.0)
    return b, g


def rear_tub_cabin(xa, za, r, y0, y1, z_floor, mat='fabric'):
    """Cabin side of a rear wheel tub (left half): the half cylinder over the wheel from y0 to y1 facing away
    from the wheel, and its inboard wall at y0 facing the cabin, both above the floor."""
    b = K.Buf()
    a0 = math.asin(max(-1.0, min(1.0, (z_floor - za) / r)))
    ths = np.linspace(a0, math.pi - a0, 22)
    V = np.array([(xa + r * math.cos(t), y, za + r * math.sin(t)) for t in ths for y in (y0, y1)])
    N = np.array([(math.cos(t), 0.0, math.sin(t)) for t in ths for y in (y0, y1)])
    b.add(V, N, K.grid_tris(len(ths), 2), mat)
    ring = np.array([(xa + r * math.cos(t), y0, za + r * math.sin(t)) for t in ths])
    b.extend(K.fill_loop(ring, (0, -1, 0), mat))
    return b


# ============================================================================================ underbody
def dropped_crossmember(x, w, h, z_low, z_high, y_low, y_rise, y_end):
    """Half (y >= 0) of a box section crossmember that drops under the engine: centre z_low for |y| < y_low,
    rising to z_high at y_rise, out to y_end (centre heights; w along x, h tall)."""
    ys = [0.0, y_low, y_low + 0.35 * (y_rise - y_low), y_low + 0.65 * (y_rise - y_low), y_rise, y_end]
    zs = [z_low, z_low, z_low + 0.18 * (z_high - z_low), z_low + 0.82 * (z_high - z_low), z_high, z_high]
    path = np.array([(x, y, z) for y, z in zip(ys, zs)])
    prof = np.array([(w / 2, -h / 2), (w / 2, h / 2), (-w / 2, h / 2), (-w / 2, -h / 2)])   # CCW: outward normals
    V, N, T = K.sweep(path, (0, 0, 1), prof, closed=False, closed_prof=True, smooth_prof=False)
    b = K.Buf().add(V, N, T, 'steel')
    return b


def underbody():
    """UNDER (left half + centre parts with y >= 0 halves): floor pan, rails, crossmember, suspension, hubs,
    brake discs and calipers, rear axle, propshaft, wheelhouse liners, filler neck."""
    b = K.Buf()
    # floor pan underside with the tunnel (extruded section)
    xw = rear_arch_front(PAN_Z) + 0.02
    xs = np.unique(np.concatenate([np.linspace(-1.05, FIREWALL_X, 12), [xw - 0.02, xw]]))
    V = []
    for x in xs:
        th = tunnel_h(x)
        tw = 0.12 + 0.03 * float(K.sstep(-0.6, 0.6, x))
        ye = 0.70 if x >= xw - 1e-6 else 0.47
        sec = K.round_profile(np.array([(0.0, th), (tw, th), (tw + 0.035, th - 0.06), (tw + 0.06, PAN_Z), (ye, PAN_Z), (ye + 0.02, 0.22)]),
                              [0, 0.03, 0.03, 0.03, 0.02, 0], 2)
        V += [(x, y, z) for (y, z) in sec]
    V = np.array(V)
    T = K.grid_tris(len(xs), len(sec))
    pan = recompute_normals(K.Buf().add(V, np.zeros_like(V), T, 'trim'))
    b.extend(flip_down(pan))
    # rear floor kick-up and boot floor underside
    for (x0, x1, z0, z1) in ((-1.35, -1.05, BOOT_Z - 0.01, PAN_Z), ):
        xs = np.linspace(x0, x1, 10)
        V = []
        for x in xs:
            f = (x - x0) / (x1 - x0)
            z = z0 + (z1 - z0) * (3 * f * f - 2 * f ** 3)
            for y in np.linspace(0, 0.47, 8):
                V.append((x, y, z))
        V = np.array(V)
        T = K.grid_tris(len(xs), 8)
        b.extend(flip_down(recompute_normals(K.Buf().add(V, np.zeros_like(V), T, 'trim'))))
    xt = D['ax_r'] - 0.372
    b.extend(K.box_buf((-2.0, 0.0, BOOT_Z - 0.025), (xt, 0.72, BOOT_Z - 0.012), 'trim', 0.004, 1))
    b.extend(K.box_buf((xt, 0.0, BOOT_Z - 0.025), (-1.35, 0.47, BOOT_Z - 0.012), 'trim', 0.004, 1))
    # rails
    for (x0, x1, z) in ((-1.0, 1.70, PAN_Z - 0.06), ):
        b.extend(K.box_buf((x0, 0.44, z), (x1, 0.52, PAN_Z), 'steel', 0.006, 2))
    b.extend(K.box_buf((-1.98, 0.44, BOOT_Z - 0.08), (-1.40, 0.52, BOOT_Z - 0.02), 'steel', 0.006, 2))
    # front crossmember, dropped under the sump between the rails
    b.extend(dropped_crossmember(D['ax_f'], 0.12, 0.06, 0.155, 0.235, 0.29, 0.43, 0.50))
    # wheelhouse liners (front and rear)
    for xa, y0, y1 in ((D['ax_f'], APRON_Y, 0.78), (D['ax_r'], 0.50, 0.78)):
        b.extend(wheelhouse(xa, y0, y1))
    # front suspension (left): knuckle, wishbones, spring + damper, disc, caliper, tie rod
    hx, hy, hz = D['ax_f'], D['track_f'] / 2, D['hub_z']
    b.extend(hub_and_brake(hx, hy, hz, front=True))
    b.extend(K.tube_buf(np.array([(hx + 0.12, 0.30, 0.235), (hx, hy - 0.12, 0.22), (hx - 0.14, 0.30, 0.235)]), 0.014, 'steel', 10))
    b.extend(K.tube_buf(np.array([(hx + 0.10, 0.42, 0.52), (hx, hy - 0.13, 0.50), (hx - 0.10, 0.42, 0.52)]), 0.012, 'steel', 10))
    b.extend(K.helix((hx, 0.47, 0.25), (0, 0.0, 1), 0.055, 0.30, 5.5, n=33, wire=0.009, mat='steel', segs=4))
    b.extend(K.cyl_buf((hx, 0.47, 0.24), (hx, 0.47, 0.58), 0.022, 'trim', 12))
    b.extend(K.tube_buf(np.array([(hx - 0.10, 0.12, 0.27), (hx - 0.11, hy - 0.10, 0.27)]), 0.010, 'steel', 8))
    # rear axle (left half of the housing + diff half), springs, dampers, trailing arm
    rx, ry = D['ax_r'], D['track_r'] / 2
    b.extend(hub_and_brake(rx, ry, hz, front=False))
    b.extend(K.cyl_buf((rx, 0.0, hz), (rx, ry - 0.07, hz), 0.038, 'steel', 16, cap=False))
    dif = np.array([(0.0, -0.13), (0.07, -0.12), (0.115, -0.06), (0.125, 0.0), (0.11, 0.05), (0.06, 0.09), (0.0, 0.10)])
    V, N, T = K.lathe(dif, (rx, 0.0, hz), (1, 0, 0), 12, a0=-90, a1=90)
    b.add(V, N, T, 'steel')
    b.extend(K.helix((rx, 0.48, hz + 0.04), (0, 0, 1), 0.06, 0.24, 4.5, n=28, wire=0.009, mat='steel', segs=4))
    b.extend(K.cyl_buf((rx + 0.10, 0.50, hz), (rx + 0.06, 0.52, 0.55), 0.02, 'trim', 12))
    b.extend(K.tube_buf(np.array([(rx, 0.45, hz - 0.03), (rx + 0.45, 0.45, PAN_Z - 0.03)]), 0.016, 'steel', 10))
    # propshaft (half: y >= 0 surfaces are the full tube, mirrored copy is harmless) - built on the centre line
    return b


def centre_under():
    """Parts on the centre line that must not be mirrored: propshaft, diff cover, filler neck (right)."""
    b = K.Buf()
    hz = D['hub_z']
    b.extend(K.cyl_buf((0.50, 0.0, 0.30), (D['ax_r'] + 0.14, 0.0, hz + 0.01), 0.032, 'steel', 16))
    for x in (0.50, D['ax_r'] + 0.14):
        b.extend(K.cyl_buf((x - 0.02, 0.0, 0.30 if x > 0 else hz + 0.01), (x + 0.02, 0.0, 0.30 if x > 0 else hz + 0.01), 0.045, 'steel', 16))
    # fuel filler neck from the right rear flap down to the tank
    path = np.array([(-1.63, -0.76, 0.765), (-1.66, -0.66, 0.66), (-1.70, -0.45, 0.42), (-1.70, -0.35, 0.36)])
    b.extend(K.tube_buf(path, 0.022, 'rubber', 12))
    return b


def flip_down(buf):
    """Make a sheet face downwards (normals with -z)."""
    V, N, T, M = buf.arrays()
    s = np.where(N[:, 2:3] > 0, -1.0, 1.0)
    out = K.Buf()
    out.add(V, N * s, T, M[0])
    out.M = list(M)
    return out


def wheelhouse(xa, y0, y1, r=0.355):
    """Half-cylinder liner over a wheel from y0 (inner) to y1 (outer), facing the wheel."""
    za = D['hub_z']
    ths = np.radians(np.linspace(-8, 188, 20))
    ys = np.linspace(y0, y1, 3)
    V = []
    N = []
    for th in ths:
        for y in ys:
            V.append((xa + r * math.cos(th), y, za + r * math.sin(th)))
            N.append((-math.cos(th), 0.0, -math.sin(th)))
    V = np.array(V)
    N = np.array(N)
    T = K.grid_tris(len(ths), len(ys))
    b = K.Buf().add(V, N, T, 'trim')
    # inner side wall
    ring = np.array([(xa + r * math.cos(t), y0, za + r * math.sin(t)) for t in ths])
    bottom = np.array([(ring[-1, 0], y0, ring[-1, 2]), (ring[0, 0], y0, ring[0, 2])])
    b.extend(K.fill_loop(np.vstack([ring, bottom[:1] * 0 + ring[-1]])[:-1], (0, 1, 0), 'trim'))
    return b


def hub_and_brake(hx, hy, hz, front=True):
    """Frame-owned hub carrier, hub flange, brake disc and caliper at a wheel (left side: outer face +Y)."""
    b = K.Buf()
    yf = hy + 0.010           # hub flange face (the rim mounts here)
    # disc
    disc = np.array([(0.035, -0.006), (0.112, -0.006), (0.114, -0.004), (0.114, 0.004), (0.112, 0.006), (0.035, 0.006)])
    V, N, T = K.lathe(disc, (hx, yf - 0.030, hz), (0, 1, 0), 20)
    b.add(V, N, T, 'steel')
    # hat and hub flange with studs
    hat = np.array([(0.0, -0.024), (0.06, -0.024), (0.062, -0.02), (0.062, 0.0), (0.0, 0.0)])
    V, N, T = K.lathe(hat, (hx, yf, hz), (0, 1, 0), 16)
    b.add(V, N, T, 'steel')
    for k in range(4):
        a = math.radians(45 + 90 * k)
        p = np.array([hx + 0.049 * math.cos(a), yf, hz + 0.049 * math.sin(a)])
        b.extend(K.cyl_buf(p, p + (0, 0.007, 0), 0.0055, 'steel', 6))
    b.extend(K.cyl_buf((hx, yf - 0.002, hz), (hx, yf + 0.005, hz), 0.022, 'steel', 16))
    # caliper at the rear of the disc (front) / front of the disc (rear wheels)
    a = math.radians(160 if front else 20)
    cp = np.array([hx + 0.10 * math.cos(a), yf - 0.030, hz + 0.10 * math.sin(a)])
    R = K.mat4_rot((0, 1, 0), -math.degrees(a) + 90, cp)
    b.extend(K.box_buf(cp + (-0.03, -0.028, -0.055), cp + (0.03, 0.012, 0.055), 'alu', 0.008, 2, xf=R))
    # knuckle / carrier behind the disc
    b.extend(K.box_buf((hx - 0.05, yf - 0.075, hz - 0.11), (hx + 0.05, yf - 0.045, hz + 0.13), 'steel', 0.012, 2))
    return b


# ============================================================================================ interior
def interior(ex):
    """INTERIOR (left-half and centre builders are combined by the assembly). Returns dict of bufs and the
    needle / gauge layout."""
    out = {}
    L = K.Buf()   # mirrored
    C = K.Buf()   # centre / asymmetric (not mirrored)
    # floor carpet with tunnel (left half section, extruded)
    xw = rear_arch_front(FLOOR_Z) + 0.02
    xs = np.unique(np.concatenate([np.linspace(-1.12, FIREWALL_X - 0.02, 12), [xw - 0.02, xw]]))
    V = []
    for x in xs:
        th = tunnel_h(x) + 0.055
        tw = 0.12 + 0.03 * float(K.sstep(-0.6, 0.6, x))
        ye = 0.69 if x >= xw - 1e-6 else 0.47
        sec = K.round_profile(np.array([(0.0, th), (tw, th), (tw + 0.035, th - 0.06), (tw + 0.06, FLOOR_Z), (ye, FLOOR_Z), (ye + 0.01, 0.27)]),
                              [0, 0.03, 0.03, 0.03, 0.02, 0], 2)
        V += [(x, y, z) for (y, z) in sec]
    V = np.array(V)
    T = K.grid_tris(len(xs), len(sec))
    carpet = recompute_normals(K.Buf().add(V, np.zeros_like(V), T, 'fabric'))
    L.extend(face_up(carpet))
    # front footwell slope up to the firewall (toe board)
    L.extend(K.box_buf((FIREWALL_X - 0.20, 0.17, FLOOR_Z), (FIREWALL_X - 0.02, 0.68, FLOOR_Z + 0.02), 'fabric', 0.006, 2,
                       xf=K.mat4_rot((0, 1, 0), -38, (FIREWALL_X - 0.02, 0, FLOOR_Z))))
    # rear seat area raised floor and bulkhead behind the rear seat
    L.extend(K.box_buf((-1.42, 0.0, FLOOR_Z), (-1.30, 0.47, 0.30), 'fabric', 0.01, 2))
    L.extend(K.box_buf((-1.48, 0.0, 0.52), (-1.42, 0.47, 0.95), 'plastic_int', 0.01, 2))
    L.extend(K.box_buf((-1.48, 0.47, 0.665), (-1.42, 0.70, 0.95), 'plastic_int', 0.01, 2))
    # the rear wheel tubs inside the cabin, under the ends of the rear seat
    L.extend(rear_tub_cabin(D['ax_r'], D['hub_z'], 0.372, 0.47, 0.72, FLOOR_Z))
    # firewall face inside the cabin (the engine bay's firewall sheet faces the bay)
    L.extend(quad_sheet((FIREWALL_X - 0.004, 0.0, FLOOR_Z), (0, 0.70, 0), (0, 0, 0.64 - FLOOR_Z), 2, 2, (-1, 0, 0), 'trim'))
    # parcel shelf under the rear window
    # (from the rear window's foot forwards and under the deck: it reached back over the deck and showed through
    # it as a dark wedge at the C pillar's foot)
    L.extend(K.box_buf((-1.47, 0.0, 0.900), (-1.40, 0.70, 0.915), 'plastic_int', 0.006, 2))
    # sill trims and kick panels
    L.extend(K.box_buf((rear_arch_front(0.30) + 0.03, 0.60, FLOOR_Z), (D['fd_front'] - 0.02, 0.66, 0.33), 'plastic_int', 0.012, 2))
    L.extend(K.box_buf((0.66, 0.58, FLOOR_Z), (FIREWALL_X - 0.02, 0.70, 0.62), 'plastic_int', 0.02, 2))
    # rear quarter trim beside the rear seat
    L.extend(K.box_buf((-1.45, 0.62, 0.665), (D['rd_rear'] + 0.01, 0.70, 0.90), 'plastic_int', 0.02, 2))
    # headliner: greenhouse roof 30 mm inside, facing down
    gus = S.g_u_samples()
    row = np.stack([gus, np.full(len(gus), S.G_T[-1] - 0.02)], 1)
    Pr, _ = S.CG.to3d(row, -0.022)
    a, bb = Pr[-1], Pr[0]
    xc = np.linspace(a[0], bb[0], 30)[1:-1]
    loop = np.vstack([Pr[:, :2], np.stack([xc, np.zeros(len(xc))], 1)])
    g = K.grid_points(-1.3, 0.6, 0.0, 0.7, 0.06, dt=0.06)
    # 8 mm above the rail / header trims (level -0.03) where the two overlap, so the trim always wins the depth test
    V, N, T = K.mesh_region(S.CR, [K.Loop(loop)], [], g, spacing=0.06, level=-0.022)
    L.add(V, -N, T, 'fabric')
    # pillar trims (simple): A, B, C inner covers
    L.extend(pillar_trims(ex))
    # dashboard
    dash, gauges = dashboard()
    C.extend(dash)
    # pedals (driver, left)
    for (py, w_, name) in ((DRIVER_Y + 0.10, 0.05, 'clutch'), (DRIVER_Y, 0.06, 'brake'), (DRIVER_Y - 0.13, 0.04, 'throttle')):
        base = np.array([FIREWALL_X - 0.10, py, 0.62])
        pad = np.array([FIREWALL_X - 0.20, py, 0.36 if name != 'throttle' else 0.33])
        C.extend(K.tube_buf(np.array([base, (base + pad) / 2 + (0.02, 0, 0), pad + (0, 0, 0.04)]), 0.008, 'steel', 8))
        C.extend(K.box_buf(pad + (-0.012, -w_, -0.04 if name != 'throttle' else -0.06), pad + (0.012, w_, 0.04), 'rubber', 0.006, 2,
                           xf=K.mat4_rot((0, 1, 0), -20, pad)))
    # steering column shroud (the steering part mounts at its top)
    st = steering_mount()
    col_dir = st[1]
    p_top = st[0] + col_dir * 0.05
    p_bot = st[0] + col_dir * 0.36
    C.extend(K.cyl_buf(p_bot, p_top, 0.045, 'plastic_int', 20, r1=0.038))
    # centre console with radio place
    C.extend(console())
    # seat rails at the seat mounts
    for (sx, sy) in ((SEAT_X, DRIVER_Y), (SEAT_X, -DRIVER_Y)):
        for dy in (-0.18, 0.18):
            C.extend(K.box_buf((sx - 0.25, sy + dy - 0.015, FLOOR_Z), (sx + 0.25, sy + dy + 0.015, FLOOR_Z + 0.035), 'steel', 0.004, 2))
    for dy in (-0.45, 0.0, 0.45):
        C.extend(K.box_buf((REAR_SEAT_X - 0.1, dy - 0.02, FLOOR_Z), (REAR_SEAT_X + 0.1, dy + 0.02, FLOOR_Z + 0.02), 'steel', 0.004, 2))
    # interior mirror and sun visors
    mp = np.array([float(S.ws_x(0, 1.33)) - 0.08, 0.0, 1.31])
    C.extend(K.box_buf(mp + (-0.01, -0.012, 0.01), mp + (0.012, 0.012, 0.06), 'plastic_int', 0.004, 2))
    C.extend(K.box_buf(mp + (-0.025, -0.11, -0.03), mp + (0.0, 0.11, 0.02), 'plastic_int', 0.012, 3))
    C.extend(K.box_buf(mp + (-0.0262, -0.10, -0.022), mp + (-0.0255, 0.10, 0.012), 'glass_dark', 0.0, 1))
    for sy in (1, -1):
        vp = np.array([float(S.ws_x(0.35, 1.35)) - 0.12, sy * 0.36, 1.345])
        C.extend(K.box_buf(vp + (-0.17, -0.19, -0.012), vp + (0.0, 0.19, 0.008), 'fabric', 0.01, 3,
                           xf=K.mat4_rot((0, 1, 0), 12, vp)))
    out['L'] = L
    out['C'] = C
    out['gauges'] = gauges
    return out


def face_up(buf):
    V, N, T, M = buf.arrays()
    s = np.where(N[:, 2:3] < 0, -1.0, 1.0)
    o = K.Buf()
    o.add(V, N * s, T, M[0])
    o.M = list(M)
    return o


def pillar_trims(ex):
    b = K.Buf()
    gs = ex.gs
    # B pillar inner cover
    b.extend(K.box_buf((-0.345, 0.60, 0.90), (-0.25, 0.66, 1.33), 'plastic_int', 0.015, 2,
                       xf=K.mat4_rot((1, 0, 0), -14, (-0.3, 0.63, 0.90))))
    return b


def steering_mount():
    """(position of the steering wheel hub, column direction pointing forward-down)."""
    ang = math.radians(24.0)
    d = np.array([math.cos(ang), 0.0, -math.sin(ang)])
    p = np.array([0.30, DRIVER_Y, 0.875])
    return p, d


def extrude_y(sec, ys, mat, inside=None, sec_fn=None, cap=True):
    """Extrude a closed (x, z) section along y (optionally varying: sec_fn(y) -> section), with end caps."""
    rows = [np.asarray(sec_fn(y) if sec_fn else sec, float) for y in ys]
    m = len(rows[0])
    V = np.array([(p[0], y, p[1]) for y, r in zip(ys, rows) for p in r])
    T = K.grid_tris(len(ys), m, True)
    b = recompute_normals(K.Buf().add(V, np.zeros_like(V), T, mat))
    if inside is not None:
        # one decision for the whole (consistently wound) sheet, measured across the section only: a per-vertex
        # test against a 3D point flips vertices where a varying section slopes along y
        Vb, Nb, Tb, Mb = b.arrays()
        d = Vb - np.asarray(inside, float)
        d[:, 1] = 0.0
        if float((Nb * d).sum()) < 0.0:
            b = K.Buf().add(Vb, -Nb, Tb, mat)
    if cap:
        for y, r, sg in ((ys[0], rows[0], -1.0), (ys[-1], rows[-1], 1.0)):
            P = np.array([(p[0], y, p[1]) for p in r])
            b.extend(K.fill_loop(P, (0, sg, 0), mat))
    return b


DASH_FACE_X = 0.575


def dashboard():
    """Dash: padded top roll with a brow over the instrument pod, painted fascia with a wood strip, the pod
    with two big and two small dials (chrome bezels, ticks), glovebox, round vents, radio opening and heater
    sliders in the centre. Returns (buf, gauge layout list)."""
    b = K.Buf()
    fx = DASH_FACE_X

    def pad_sec(y):
        ay = abs(y - DRIVER_Y)
        brow = 0.03 * float(K.sstep(0.26, 0.20, ay)) if y > 0 else 0.0
        lift = 0.032 * float(K.sstep(0.30, 0.22, ay)) if y > 0 else 0.0     # hood over the raised cluster
        pts = np.array([(0.81, 0.90), (0.75, 0.932 + lift * 0.6), (0.64, 0.946 + lift), (fx - 0.005 - brow, 0.944 + lift),
                        (fx - 0.022 - brow, 0.928 + lift), (fx - 0.016 - brow, 0.906 + lift), (fx + 0.01, 0.895), (0.81, 0.885)])
        return K.round_profile(pts, [0, 0.03, 0.03, 0.012, 0.01, 0.008, 0.01, 0], 1)
    ys = np.concatenate([np.linspace(-0.70, 0.06, 3), np.linspace(0.09, 0.63, 8), [0.70]])
    b.extend(extrude_y(None, ys, 'plastic_int', inside=(0.72, 0.0, 0.915), sec_fn=pad_sec))
    # fascia (painted) under the roll
    fas = K.round_profile(np.array([(fx, 0.90), (fx, 0.67), (fx + 0.04, 0.64), (0.80, 0.64), (0.80, 0.90)]), [0, 0.03, 0.02, 0, 0], 2)
    b.extend(extrude_y(fas, np.linspace(-0.64, 0.64, 3), 'paint', inside=(0.70, 0.0, 0.78)))
    # dash end caps at the doors (rounded plastic blocks closing the fascia against the kick panels)
    for sy in (1.0, -1.0):
        b.extend(K.box_buf((fx - 0.004, min(sy * 0.64, sy * 0.715), 0.645), (0.80, max(sy * 0.64, sy * 0.715), 0.905), 'plastic_int', 0.02, 2))
    # wood strip (passenger side)
    b.extend(K.box_buf((fx - 0.008, -0.63, 0.828), (fx + 0.004, -0.13, 0.884), 'wood', 0.005, 2))
    b.extend(K.box_buf((fx - 0.0095, -0.632, 0.826), (fx - 0.006, -0.128, 0.829), 'chrome', 0.001, 1))
    # glovebox lid and push button
    b.extend(K.box_buf((fx - 0.006, -0.58, 0.69), (fx + 0.004, -0.20, 0.808), 'paint', 0.01, 2))
    b.extend(K.cyl_buf((fx - 0.006, -0.39, 0.79), (fx - 0.014, -0.39, 0.79), 0.009, 'chrome', 12))
    # instrument pod: a rounded box tilted towards the driver
    eye = np.array(EYE)
    pc = np.array([fx - 0.012, DRIVER_Y, 0.888])
    dn = K.unit(eye - pc)
    dn = K.unit(np.array([dn[0], 0.0, dn[2]]))
    R = K.frame_from((0, 1, 0), dn)          # X = across (+y), Z = dial normal
    M = K.mat4_trs(pc, R)
    b.extend(K.box_buf((-0.236, -0.072, -0.03), (0.236, 0.082, 0.0), 'plastic_int', 0.018, 3, xf=M))
    gauges = []
    for (gy, gz, r, name) in ((0.084, 0.004, 0.062, 'N_speed'), (-0.084, 0.004, 0.062, 'N_rpm'),
                              (0.192, -0.008, 0.029, 'N_fuel'), (-0.192, -0.008, 0.029, 'N_temp')):
        c = pc + R[:, 0] * gy + R[:, 1] * gz
        db, g = dial(c, dn, r, r > 0.05, 'chrome')
        b.extend(db)
        g['name'] = name
        gauges.append(g)
    # telltale lamps between the big dials
    for k, zz in enumerate((0.03, -0.01, -0.05)):
        cc = pc + R[:, 1] * zz + dn * 0.0005
        V, N, T = K.lathe(np.array([(0.0, 0.0), (0.005, 0.0)]), cc, dn, 10, prof_n=np.array([[0, 1.0], [0, 1.0]]))
        b.add(V, N, T, 'lens_amber' if k == 1 else 'emit')
    # round vents: ends and centre
    for vy, vz in ((0.62, 0.84), (-0.66, 0.84), (0.10, 0.865), (-0.10, 0.865)):
        c = np.array([fx - 0.002, vy, vz])
        V, N, T = K.lathe(np.array([(0.027, 0.0), (0.033, 0.005), (0.037, 0.003), (0.037, -0.006)])[::-1], c, (-1, 0, 0), 16)
        b.add(V, N, T, 'chrome')
        V, N, T = K.lathe(np.array([(0.0, -0.012), (0.028, -0.012)]), c, (-1, 0, 0), 14, prof_n=np.array([[0, 1.0], [0, 1.0]]))
        b.add(V, N, T, 'trim')
        for k in range(-1, 2):
            b.extend(K.box_buf(c + (-0.011, -0.026, 0.009 * k - 0.0015), c + (-0.004, 0.026, 0.009 * k + 0.0015), 'trim', 0.0, 1))
    # centre stack: heater sliders above the radio opening
    b.extend(K.box_buf((fx - 0.006, -0.085, 0.805), (fx + 0.002, 0.085, 0.845), 'chrome', 0.004, 2))
    b.extend(K.box_buf((fx - 0.008, -0.08, 0.81), (fx - 0.005, 0.08, 0.84), 'trim', 0.002, 1))
    for k in range(3):
        yy = -0.05 + 0.05 * k
        b.extend(K.box_buf((fx - 0.02, yy - 0.006, 0.82), (fx - 0.008, yy + 0.006, 0.832), 'plastic_int', 0.003, 2))
    # radio opening (the radio part sits in it): a dark recess with a chrome lip
    b.extend(K.box_buf((fx - 0.004, -0.097, 0.737), (fx + 0.002, 0.097, 0.793), 'chrome', 0.003, 2))
    b.extend(K.box_buf((fx - 0.006, -0.09, 0.742), (fx + 0.06, 0.09, 0.788), 'trim', 0.002, 1))
    return b, gauges


def orient_out(buf, inside_point):
    V, N, T, M = buf.arrays()
    d = V - inside_point
    s = np.where((N * d).sum(1, keepdims=True) < 0, -1.0, 1.0)
    o = K.Buf()
    o.add(V, N * s, T, M[0])
    o.M = list(M)
    return o


def console():
    """Short centre console under the radio with an ashtray, gear lever boot ring and handbrake slot."""
    b = K.Buf()
    b.extend(K.box_buf((0.44, -0.11, 0.48), (DASH_FACE_X + 0.03, 0.11, 0.66), 'plastic_int', 0.02, 3))
    b.extend(K.box_buf((0.435, -0.07, 0.575), (0.445, 0.07, 0.62), 'chrome', 0.004, 2))
    b.extend(K.box_buf((0.432, -0.065, 0.58), (0.437, 0.065, 0.615), 'trim', 0.002, 1))
    gx = 0.32
    gz = tunnel_h(gx) + 0.055
    V, N, T = K.lathe(np.array([(0.0, 0.012), (0.03, 0.012), (0.055, 0.004), (0.068, 0.0)])[::-1], (gx, 0.0, gz), (0, 0, 1), 24)
    b.add(V, N, T, 'trim')
    hz = tunnel_h(-0.05) + 0.055
    b.extend(K.box_buf((-0.20, -0.032, hz - 0.005), (0.07, 0.032, hz + 0.012), 'plastic_int', 0.008, 2))
    b.extend(K.box_buf((-0.17, -0.012, hz + 0.008), (0.04, 0.012, hz + 0.0135), 'trim', 0.002, 1))
    return b
