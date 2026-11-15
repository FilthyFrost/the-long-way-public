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
    return b


def ring_inner(chart, uv, outer, d_in, rear_band, level=-0.028):
    """Half (y >= 0) of a hood inner frame ring on a top chart: between `outer` (an open polyline from the
    centre line round to the centre line, inside the hood outline) and the outline offset by d_in, with the band
    along the rear (hinge) edge only `rear_band` wide. Rolled inner edge."""
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
    # strut tower on the tub
    tc = np.array([xa, 0.555, 0.0])
    b.extend(K.cyl_buf((tc[0], tc[1], za + R - 0.02), (tc[0], tc[1], top - 0.006), 0.072, 'paint', 18, cap=False))
    V, N, T = K.lathe(np.array([(0.0, 0.0), (0.062, 0.0), (0.072, -0.006)]), (tc[0], tc[1], top - 0.0005), (0, 0, 1), 18)
    b.add(V, N, T, 'paint')
    b.extend(K.cyl_buf((tc[0], tc[1], top - 0.002), (tc[0], tc[1], top + 0.024), 0.016, 'steel', 10))
    for k in range(3):
        a = math.radians(30 + 120 * k)
        sp = np.array([tc[0] + 0.045 * math.cos(a), tc[1] + 0.045 * math.sin(a), top])
        b.extend(K.cyl_buf(sp, sp + (0, 0, 0.012), 0.006, 'steel', 6))
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
    # hood latch (half) on the top bar
    b.extend(K.box_buf((RAD_X - 0.025, 0.0, 0.80), (RAD_X + 0.006, 0.035, 0.86), 'steel', 0.004, 2))
    # hood hinge bracket at the cowl
    b.extend(K.box_buf((0.90, 0.60, 0.835), (0.95, 0.615, 0.88), 'steel', 0.003, 1))
    # wiring loom along the side wall
    path = np.array([(FIREWALL_X + 0.02, APRON_Y - 0.012, 0.74), (1.10, APRON_Y - 0.012, 0.76), (1.45, APRON_Y - 0.012, 0.74), (RAD_X - 0.03, APRON_Y - 0.05, 0.70)])
    b.extend(K.tube_buf(path, 0.007, 'trim', 6))
    return b


def engine_bay_asym():
    """Non-symmetric engine bay details: brake booster and master cylinder (driver side, left), heater box,
    wiper motor (right), battery tray (left front), washer bottle (right front), fuse box."""
    b = K.Buf()
    fx = FIREWALL_X
    V, N, T = K.lathe(np.array([(0.0, 0.0), (0.085, 0.0), (0.095, 0.012), (0.095, 0.058), (0.085, 0.07), (0.0, 0.07)]), (fx, 0.30, 0.70), (1, 0, 0), 16)
    b.add(V, N, T, 'steel')
    b.extend(K.cyl_buf((fx + 0.07, 0.30, 0.70), (fx + 0.22, 0.30, 0.70), 0.022, 'alu', 12))
    b.extend(K.cyl_buf((fx + 0.15, 0.30, 0.722), (fx + 0.15, 0.30, 0.78), 0.03, 'ceramic', 14))
    b.extend(K.cyl_buf((fx + 0.15, 0.30, 0.78), (fx + 0.15, 0.30, 0.795), 0.024, 'trim', 12))
    b.extend(K.box_buf((fx, -0.02, 0.66), (fx + 0.11, 0.22, 0.83), 'plastic_int', 0.02, 2))
    b.extend(K.cyl_buf((fx, -0.25, 0.79), (fx + 0.09, -0.25, 0.79), 0.04, 'steel', 14))
    b.extend(K.box_buf((fx + 0.02, -0.33, 0.76), (fx + 0.07, -0.17, 0.82), 'steel', 0.006, 2))
    # battery tray (the battery part sits on it), left front
    bx, by, bz = 1.52, 0.31, 0.555
    b.extend(K.box_buf((bx - 0.14, by - 0.10, bz - 0.012), (bx + 0.14, by + 0.10, bz), 'steel', 0.004, 1))
    b.extend(K.box_buf((bx - 0.02, by + 0.08, 0.42), (bx + 0.02, APRON_Y, bz - 0.012), 'steel', 0.004, 1))
    b.extend(K.box_buf((bx - 0.14, by - 0.10, bz), (bx - 0.13, by + 0.10, bz + 0.03), 'steel', 0.002, 1))
    # washer bottle (right front)
    b.extend(K.box_buf((1.47, -0.43, 0.55), (1.63, -0.33, 0.73), 'ceramic', 0.03, 2))
    b.extend(K.cyl_buf((1.55, -0.38, 0.73), (1.55, -0.38, 0.76), 0.018, 'trim', 10))
    # fuse box on the left side wall near the firewall
    b.extend(K.box_buf((fx + 0.05, APRON_Y - 0.05, 0.70), (fx + 0.17, APRON_Y - 0.002, 0.80), 'trim', 0.008, 2))
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
    b.extend(K.box_buf((-2.0, 0.0, BOOT_Z - 0.012), (-1.40, 0.70, BOOT_Z), 'paint', 0.004, 2))
    b.extend(K.box_buf((-2.0, 0.66, BOOT_Z), (-1.40, 0.70, 0.86), 'paint', 0.004, 2))
    b.extend(K.box_buf((-2.03, 0.0, BOOT_Z), (-2.015, 0.70, 0.86), 'paint', 0.004, 2))
    b.extend(K.box_buf((-1.45, 0.0, BOOT_Z), (-1.43, 0.70, 0.90), 'paint', 0.004, 2))
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
    b.extend(K.box_buf((D['rd_rear'], 0.62, 0.22), (D['fd_front'], 0.70, D['door_bot'] - 0.012), 'paint', 0.006, 2))
    xs = np.linspace(D['rd_rear'] + 0.04, D['fd_front'] - 0.02, 4)
    path = np.stack([xs, np.full(len(xs), 0.705), np.full(len(xs), D['door_bot'] - 0.006)], 1)
    b.extend(K.tube_buf(path, 0.008, 'rubber', 8))
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
    xs = np.linspace(-1.05, FIREWALL_X, 12)
    V = []
    for x in xs:
        th = tunnel_h(x)
        tw = 0.12 + 0.03 * float(K.sstep(-0.6, 0.6, x))
        sec = K.round_profile(np.array([(0.0, th), (tw, th), (tw + 0.035, th - 0.06), (tw + 0.06, PAN_Z), (0.70, PAN_Z), (0.72, 0.22)]),
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
            for y in np.linspace(0, 0.72, 10):
                V.append((x, y, z))
        V = np.array(V)
        T = K.grid_tris(len(xs), 10)
        b.extend(flip_down(recompute_normals(K.Buf().add(V, np.zeros_like(V), T, 'trim'))))
    b.extend(K.box_buf((-2.0, 0.0, BOOT_Z - 0.025), (-1.35, 0.72, BOOT_Z - 0.012), 'trim', 0.004, 1))
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
        b.extend(K.cyl_buf(p, p + (0, 0.022, 0), 0.0055, 'steel', 6))
    b.extend(K.cyl_buf((hx, yf - 0.002, hz), (hx, yf + 0.012, hz), 0.022, 'steel', 16))
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
    xs = np.linspace(-1.12, FIREWALL_X - 0.02, 12)
    V = []
    for x in xs:
        th = tunnel_h(x) + 0.055
        tw = 0.12 + 0.03 * float(K.sstep(-0.6, 0.6, x))
        sec = K.round_profile(np.array([(0.0, th), (tw, th), (tw + 0.035, th - 0.06), (tw + 0.06, FLOOR_Z), (0.69, FLOOR_Z), (0.70, 0.27)]),
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
    L.extend(K.box_buf((-1.42, 0.0, FLOOR_Z), (-1.30, 0.70, 0.30), 'fabric', 0.01, 2))
    L.extend(K.box_buf((-1.48, 0.0, 0.52), (-1.42, 0.70, 0.95), 'plastic_int', 0.01, 2))
    # parcel shelf under the rear window
    L.extend(K.box_buf((-1.62, 0.0, 0.905), (-1.40, 0.73, 0.925), 'plastic_int', 0.006, 2))
    # sill trims and kick panels
    L.extend(K.box_buf((D['rd_rear'], 0.60, FLOOR_Z), (D['fd_front'] - 0.02, 0.66, 0.33), 'plastic_int', 0.012, 2))
    L.extend(K.box_buf((0.66, 0.58, FLOOR_Z), (FIREWALL_X - 0.02, 0.70, 0.62), 'plastic_int', 0.02, 2))
    # rear quarter trim beside the rear seat
    L.extend(K.box_buf((-1.45, 0.62, 0.30), (D['rd_rear'] + 0.01, 0.70, 0.90), 'plastic_int', 0.02, 2))
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
    p = np.array([0.30, DRIVER_Y, 0.90])
    return p, d


def extrude_y(sec, ys, mat, inside=None, sec_fn=None, cap=True):
    """Extrude a closed (x, z) section along y (optionally varying: sec_fn(y) -> section), with end caps."""
    rows = [np.asarray(sec_fn(y) if sec_fn else sec, float) for y in ys]
    m = len(rows[0])
    V = np.array([(p[0], y, p[1]) for y, r in zip(ys, rows) for p in r])
    T = K.grid_tris(len(ys), m, True)
    b = recompute_normals(K.Buf().add(V, np.zeros_like(V), T, mat))
    if inside is not None:
        b = orient_out(b, np.asarray(inside, float))
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
        pts = np.array([(0.81, 0.90), (0.75, 0.932), (0.64, 0.946), (fx - 0.005 - brow, 0.944), (fx - 0.022 - brow, 0.928),
                        (fx - 0.016 - brow, 0.906), (fx + 0.01, 0.895), (0.81, 0.885)])
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
    pc = np.array([fx - 0.012, DRIVER_Y, 0.858])
    dn = K.unit(eye - pc)
    dn = K.unit(np.array([dn[0], 0.0, dn[2]]))
    R = K.frame_from((0, 1, 0), dn)          # X = across (+y), Z = dial normal
    M = K.mat4_trs(pc, R)
    b.extend(K.box_buf((-0.225, -0.072, -0.03), (0.225, 0.082, 0.0), 'plastic_int', 0.018, 3, xf=M))
    gauges = []
    a_, b_, _ = K.plane_basis(dn)
    for (gy, gz, r, name) in ((0.085, 0.004, 0.064, 'N_speed'), (-0.085, 0.004, 0.064, 'N_rpm'),
                              (0.183, -0.006, 0.030, 'N_fuel'), (-0.183, -0.006, 0.030, 'N_temp')):
        c = pc + R[:, 0] * gy + R[:, 1] * gz + dn * 0.0
        bez = np.array([(r - 0.003, -0.004), (r + 0.002, 0.003), (r + 0.007, 0.004), (r + 0.010, 0.0), (r + 0.010, -0.006)])
        V, N, T = K.lathe(bez, c, dn, 24 if r > 0.05 else 16)
        b.add(V, N, T, 'chrome')
        V, N, T = K.lathe(np.array([(0.0, -0.007), (r, -0.007), (r, -0.0045)]), c, dn, 24 if r > 0.05 else 16, prof_n=np.array([[0, 1.0], [0, 1.0], [-1.0, 0]]))
        b.add(V, N, T, 'gauge')
        big = r > 0.05
        nt = 25 if big else 5
        for k in range(nt):
            ang = math.radians(135.0 - 270.0 * k / (nt - 1)) if big else math.radians(45.0 - 90.0 * k / (nt - 1))
            major = (k % 4 == 0) if big else True
            ln = 0.011 if major else 0.006
            dirv = math.sin(ang) * a_ + math.cos(ang) * b_
            p0 = c + dn * (-0.0065) + dirv * (r - 0.004 - ln)
            p1 = c + dn * (-0.0065) + dirv * (r - 0.004)
            sd = np.cross(dn, dirv) * (0.0013 if major else 0.0008)
            Vt = np.array([p0 - sd, p0 + sd, p1 + sd, p1 - sd])
            b.add(Vt, np.tile(dn, (4, 1)), np.array([(0, 1, 2), (0, 2, 3)]), 'trim')
        gauges.append(dict(name=name, center=c + dn * (-0.006), normal=dn, r=r, up=b_, right=a_, big=big))
    # telltale lamps between the big dials
    for k, zz in enumerate((0.03, -0.01, -0.05)):
        cc = pc + R[:, 1] * zz + dn * 0.0005
        V, N, T = K.lathe(np.array([(0.0, 0.0), (0.005, 0.0)]), cc, dn, 10, prof_n=np.array([[0, 1.0], [0, 1.0]]))
        b.add(V, N, T, 'lens_amber' if k == 1 else 'emit')
    # round vents: ends and centre
    for vy, vz in ((0.62, 0.84), (-0.66, 0.84), (0.10, 0.865), (-0.10, 0.865)):
        c = np.array([fx - 0.002, vy, vz])
        V, N, T = K.lathe(np.array([(0.027, 0.0), (0.033, 0.005), (0.037, 0.003), (0.037, -0.006)]), c, (-1, 0, 0), 16)
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
    V, N, T = K.lathe(np.array([(0.0, 0.012), (0.03, 0.012), (0.055, 0.004), (0.068, 0.0)]), (gx, 0.0, gz), (0, 0, 1), 24)
    b.add(V, N, T, 'trim')
    hz = tunnel_h(-0.05) + 0.055
    b.extend(K.box_buf((-0.20, -0.032, hz - 0.005), (0.07, 0.032, hz + 0.012), 'plastic_int', 0.008, 2))
    b.extend(K.box_buf((-0.17, -0.012, hz + 0.008), (0.04, 0.012, hz + 0.0135), 'trim', 0.002, 1))
    return b
