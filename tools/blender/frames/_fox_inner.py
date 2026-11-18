"""Fox: everything behind the outer skin. Door insides, belt mouldings, handles, bonnet and boot lid inner frames,
the lip spoiler, the pop-up lamp pods (the moving pod and the well it folds into), the engine bay (laid out for a
longitudinal engine set well back, its front at the front axle), the boot, the door apertures, the underbody
(UNDER: floor pan and tunnel, rails, crossmembers, control arms, steering rack and tie rods, the live rear axle's
tubes and links, the propshaft, wheelhouse liners, the filler neck) and the two-seat cabin (INTERIOR). Left-half
builders return K.Buf in Blender coordinates; the assembly (frames/_fox_build.py) mirrors and names the objects."""
import math
import sys

sys.dont_write_bytecode = True

import numpy as np  # noqa: E402

from frames import _kit as K  # noqa: E402
from frames import fox as S  # noqa: E402
from frames._sedan_inner import (dial, dropped_crossmember, extrude_y, face_up, flip_down, harness,  # noqa: E402
                                 heat_shield, quad_sheet, rear_tub_cabin, recompute_normals, ring_inner,
                                 side_out, smooth_path, strut_tower, tub, lid_back)

D = S.D
PI = math.pi
FLOOR_Z = 0.165          # carpet top in the cabin
PAN_Z = 0.125            # underside of the floor pan
BOOT_Z = 0.425           # boot floor (over the tank)
SHELF_Z = 0.58           # the luggage shelf behind the seats
BULK_X = -0.82           # the bulkhead behind the seats (ahead of the rear wheelhouses)
FIREWALL_X = 0.47
RAD_X = 1.785            # radiator support plane (the radiator's room ends just behind it)
APRON_Y = 0.465          # engine bay side wall (inboard of the front wheelhouse)
POD_WALL_Y = 0.412       # the bay's side wall ahead of the wheelhouse, inboard of the pop-up pod's well
SEAT_X = -0.29           # seat floor attachment x: the stock bucket's head restraint is under the roof's rear
DRIVER_Y = 0.38
SEAT_Z = FLOOR_Z + 0.010  # the seats' floor attachment (on low rails)
EYE = (SEAT_X - 0.16, DRIVER_Y, SEAT_Z + 0.90)   # the stock bucket seat's eye (parts_geo: -0.16 back, 0.90 up)
DASH_FACE_X = 0.34
STACK_X = 0.30           # the centre stack's face (the radio's slot), proud of the dash face
GEAR_X = 0.02
HB_X = -0.20
# engine and the rooms the bay leaves (mount positions, Blender, modelled heights)
ENGINE = (0.86, 0.0, 0.150)
ENGINE_ROOM = ((-0.37, -0.29, 0.0), (0.34, 0.30, 0.645))
GEARBOX = (0.27, 0.0, 0.200)
GEARBOX_ROOM = ((-0.30, -0.13, 0.0), (0.22, 0.13, 0.22))
RADIATOR = (1.740, 0.0, 0.255)
RADIATOR_ROOM = ((-0.07, -0.34, 0.0), (0.035, 0.34, 0.40))
BATTERY = (1.420, 0.30, 0.395)
BATTERY_ROOM = ((-0.14, -0.10, 0.0), (0.14, 0.10, 0.24))
TANK = (-1.57, 0.0, 0.235)
TANK_ROOM = ((-0.26, -0.42, 0.0), (0.24, 0.42, 0.17))
HORN = (1.620, -0.360, 0.380)


def rear_arch_front(z):
    """x of the rear wheel arch's front edge at height z."""
    dz = z - D['hub_z']
    return D['ax_r'] + math.sqrt(max(D['arch_r'] ** 2 - dz * dz, 0.0))


def tunnel_h(x):
    """Height of the top of the transmission tunnel (pan side) along x: tall over the gearbox right behind the
    firewall, low and narrow over the propshaft between the seats."""
    return 0.345 + 0.105 * float(K.sstep(-0.12, 0.04, x))


def tunnel_w(x):
    """Half width of the tunnel's top (pan side) along x."""
    return 0.095 + 0.05 * float(K.sstep(-0.12, 0.04, x))


def side_pt(x, z, level=0.0):
    """Point and normal on the lower body side (left) at side coordinates (x, z), moved by `level` along the
    normal (negative = inwards)."""
    P, N = S.SIDE_L.to3d(np.array([[x, z]]))
    return P[0] + N[0] * level, N[0]


def bonnet_z(x, y):
    """Height of the bonnet skin (the lower body's top) at (x, |y|)."""
    return float(S.top_z(np.array([x]), np.array([abs(y)]))[0])


# ============================================================================================ doors
def door_card(ex):
    """Door card on the inside of the long door: a moulded armrest with a pull, a speaker grille low down at the
    front, the window crank, the opener; a stitched welt along the top."""
    b = K.Buf()
    x0, x1 = D['fd_rear'] + 0.03, D['fd_front'] - 0.03
    z0, z1 = D['door_bot'] + 0.03, 0.775
    loop = K.ccw(K.rounded_poly(np.array([(x0, z0), (x1, z0), (x1, z1), (x0, z1)]), [0.03, 0.03, 0.02, 0.02], 0.05, arc_step=0.012))
    g = K.grid_points(x0, x1, z0, z1, 0.075, dt=0.075)
    card = K.OffsetChart(S.SIDE_L, -0.100)
    V, N, T = K.mesh_region(card, [K.Loop(K.resample_keep(loop, 0.05))], [], g, spacing=0.075)
    b.add(V, -N, T, 'plastic_int')
    P, Nn = card.to3d(loop)
    V, N, Tr = K.roll_edge(P, -Nn, side_out(P, Nn), 0.004, 0.012, 0.0, 1, closed=True)
    b.add(V, N, Tr, 'plastic_int')
    # a welt along the top and a fabric insert panel
    xs = np.linspace(x0 + 0.04, x1 - 0.04, 7)
    P, Nn = K.OffsetChart(S.SIDE_L, -0.102).to3d(np.stack([xs, np.full(len(xs), 0.70)], 1))
    prof = np.array([(0.0, -0.005), (0.003, -0.003), (0.004, 0.0), (0.003, 0.003), (0.0, 0.005)])
    V, N, Tr = K.sweep(P, (0, 0, 1), np.stack([-prof[:, 0], prof[:, 1]], 1), closed=False)
    b.add(V, N, Tr, 'plastic_int')
    ins = K.ccw(K.rounded_poly(np.array([(x0 + 0.10, 0.50), (x1 - 0.30, 0.50), (x1 - 0.30, 0.66), (x0 + 0.10, 0.66)]), 0.02, 0.05, arc_step=0.012))
    V, N, T = K.mesh_region(K.OffsetChart(S.SIDE_L, -0.1015), [K.Loop(K.resample_keep(ins, 0.05))], [],
                            K.grid_points(x0, x1, 0.5, 0.66, 0.08, dt=0.08), spacing=0.08)
    b.add(V, -N, T, 'fabric')
    # armrest with the pull cup
    xs = np.linspace(x0 + 0.16, x1 - 0.36, 7)
    P, Nn = K.OffsetChart(S.SIDE_L, -0.100).to3d(np.stack([xs, np.full(len(xs), 0.47)], 1))
    prof = K.round_profile(np.array([(0.0, -0.022), (0.05, -0.026), (0.062, 0.0), (0.048, 0.026), (0.0, 0.026)]), 0.010, 2)
    V, N, Tr = K.sweep(P, (0, 0, 1), np.stack([prof[:, 0] * -1.0, prof[:, 1]], 1) * np.array([-1, 1]), closed=False)
    b.add(V, N, Tr, 'plastic_int')
    # speaker grille low at the front
    pc, nc = side_pt(x1 - 0.14, 0.32, -0.100)
    V, N, T = K.lathe(np.array([(0.0, 0.004), (0.050, 0.004), (0.058, 0.0)])[::-1], pc, -nc, 20)
    b.add(V, N, T, 'trim')
    # window crank and the opener
    pw, nw = side_pt(x0 + 0.40, 0.62, -0.100)
    inward = -nw
    b.extend(K.cyl_buf(pw, pw + inward * 0.02, 0.022, 'chrome', 14))
    end = pw + inward * 0.02 + np.array([0.0, 0.0, -0.07])
    b.extend(K.tube_buf(np.array([pw + inward * 0.02, end]), 0.006, 'chrome', 6))
    b.extend(K.cyl_buf(end, end + inward * 0.04, 0.012, 'plastic_int', 10))
    ph, nh = side_pt(x1 - 0.16, 0.66, -0.100)
    b.extend(K.box_buf(ph + (-0.05, -0.012, -0.012), ph + (0.05, 0.0, 0.012), 'chrome', 0.004, 2))
    return b


def door_extras(ex):
    """Belt moulding (black), inner window sill, flush outside pull and key barrel, hinges on the shut face."""
    b = K.Buf()
    jl = ex.jl
    xa, xb = D['fd_front'] - 0.004, D['fd_rear'] + 0.004
    uv, P, NL, NG, _ = jl.between(float(S.u_of_x(xa)), float(S.u_of_x(xb)))
    P = K.resample(P, 0.08, closed=False)
    prof = K.round_profile(np.array([(0.012, -0.002), (0.012, 0.007), (0.002, 0.015), (-0.010, 0.015), (-0.012, 0.004), (-0.012, -0.002)]), 0.004, 1)
    V, N, Tr = K.sweep(P, (0, 0, 1), prof, closed=False)
    b.add(V, N, Tr, 'trim')
    for e in (0, -1):
        b.extend(K.fill_loop(V.reshape(len(P), -1, 3)[e], (np.sign(P[e, 0] - P[-1 - e, 0]) * 1.0, 0, 0), 'trim'))
    Pin = P.copy()
    Pin[:, 1] -= 0.045
    prof = K.round_profile(np.array([(0.035, -0.09), (0.032, 0.0), (0.012, 0.005), (-0.02, 0.0), (-0.025, -0.09)]), 0.008, 1)
    V, N, Tr = K.sweep(Pin + np.array([0, 0, -0.01]), (0, 0, 1), prof, closed=False)
    b.add(V, N, Tr, 'plastic_int')
    # flush pull handle in a recess near the rear edge under the belt, the key barrel ahead of it
    xh, zh = D['fd_rear'] + 0.15, 0.795
    ph, nh = side_pt(xh, zh)
    b.extend(K.box_buf((-0.07, -0.007, -0.018), (0.07, 0.0015, 0.018), 'trim', 0.004, 2, xf=K.mat4_trs(ph)))
    b.extend(K.box_buf((-0.06, -0.002, -0.008), (0.06, 0.010, 0.008), 'trim', 0.006, 2, xf=K.mat4_trs(ph)))
    pk, nk = side_pt(xh + 0.11, zh)
    b.extend(K.cyl_buf(pk - nk * 0.002, pk + nk * 0.006, 0.0095, 'chrome', 14))
    b.extend(K.box_buf(pk + nk * 0.0062 + (-0.0012, -0.0005, -0.005), pk + nk * 0.0064 + (0.0012, 0.0005, 0.005), 'trim', 0.0, 1))
    for zz in (0.36, 0.66):
        p0, n0 = side_pt(D['fd_front'] - 0.004, zz, -0.03)
        b.extend(K.box_buf(p0 + (-0.012, -0.03, -0.03), p0 + (0.004, 0.0, 0.03), 'steel', 0.004, 2))
    return b


def door_frame_inner(ex):
    """Inner face of the window frame band (35 mm in), facing the cabin."""
    c = ex.cut['doorG']
    s = c.side('in')
    uvp = S.CG.to2d(s['P'])
    gs = ex.gs
    xs = np.linspace(s['uv'][-1, 0], s['uv'][0, 0], 14)[1:-1]
    Pj = np.array([gs.j_point(x)[0] for x in xs])
    loop = np.vstack([uvp, S.CG.to2d(Pj)])
    holes = []
    for name, poly in ex.cut['winG']:
        P, N = S.SIDE_G.to3d(poly)
        holes.append(K.Loop(S.CG.to2d(P)))
    us = np.linspace(0, S.G_GUIDE.length, 260)
    pts, sp = S.grid_from(us, S.g_t_samples())
    V, N, T = K.mesh_region(S.CG, [K.Loop(loop)], holes, pts, spacing=sp, level=-0.035)
    return K.Buf().add(V, -N, T, 'paint')


# ============================================================================================ bonnet, boot lid, spoiler
def lid_inner(ex, name):
    """Inner frame of the bonnet / boot lid, 28 mm under the skin. The bonnet's is a perimeter ring (narrow at
    the hinge edge) so the engine comes up close under the skin; the boot lid's a panel with a lightening hole."""
    c = ex.cut[name]
    s = c.side('in')
    uv = s['uv']
    inner = K.offset_loop2(uv, (-0.035 if name == 'hood' else 0.035), closed=False)
    inner[0, 1] = 0.0
    inner[-1, 1] = 0.0
    if name == 'hood':
        return hood_ring(S.CT, uv, inner, -0.095, 0.06)
    xs = np.linspace(inner[-1, 0], inner[0, 0], 24)[1:-1]
    loop = np.vstack([inner, np.stack([xs, np.zeros(len(xs))], 1)])
    xm = 0.5 * (uv[:, 0].min() + uv[:, 0].max())
    holes = [K.Loop(K.rrect_loop(xm, 0.27, 0.075, 0.15, 0.05, 0.03))]
    g = K.grid_points(uv[:, 0].min(), uv[:, 0].max(), 0.0, 0.7, 0.07, dt=0.07)
    V, N, T = K.mesh_region(S.CT, [K.Loop(K.resample_keep(loop, 0.05))], holes, g, spacing=0.07, level=-0.028)
    b = K.Buf().add(V, -N, T, 'paint')
    for H in holes:
        P, Nn = S.CT.to3d(H.uv, -0.028)
        E = side_out(P, Nn) * -1
        V, N, Tr = K.roll_edge(P, -Nn, E, 0.004, 0.012, 0.0, 2, closed=True)
        b.add(V, N, Tr, 'paint')
    b.extend(lid_back(S.CT, uv, spacing=0.08))
    return b


def hood_ring(chart, uv, outer, d_in, rear_band, level=-0.028):
    """The bonnet's inner frame (left half) as frames/_sedan_inner.ring_inner builds it (a perimeter ring, the
    narrow band along the hinge edge, the rolled inner edge, the inside of the skin with a pressed X), with
    coarser spacings: the Fox's long stepped bonnet would cost twice the saloon's triangles."""
    from frames._sedan_inner import close_centre, lid_beads
    ring_in = K.offset_loop2(uv, d_in, closed=False)
    ring_in[:, 0] = np.maximum(ring_in[:, 0], uv[:, 0].min() + rear_band)
    ring_in[0, 1] = 0.0
    ring_in[-1, 1] = 0.0
    ring_in = K.resample(ring_in, 0.012, closed=False)
    for _ in range(12):
        ring_in[1:-1] = 0.5 * ring_in[1:-1] + 0.25 * (ring_in[:-2] + ring_in[2:])
    ring_in = K.resample(ring_in, 0.04, closed=False)
    ring_in[0, 1] = 0.0
    ring_in[-1, 1] = 0.0
    loop = np.vstack([K.resample(outer, 0.06, closed=False), ring_in[::-1]])
    g = K.grid_points(uv[:, 0].min(), uv[:, 0].max(), 0.0, 0.85, 0.075, dt=0.075)
    V, N, T = K.mesh_region(chart, [K.Loop(loop)], [], g, spacing=0.075, level=level)
    b = K.Buf().add(V, -N, T, 'paint')
    P, Nn = chart.to3d(ring_in, level)
    P2, _ = chart.to3d(K.offset_loop2(ring_in, -0.01, closed=False), level)
    E = K.unit(P2 - P)
    E = K.unit(E - Nn * np.sum(E * Nn, 1)[:, None])
    V, N, Tr = K.roll_edge(P, -Nn, E, 0.004, 0.012, 0.0, 1, closed=False)
    b.add(V, N, Tr, 'paint')
    b.extend(lid_back(chart, uv, spacing=0.10))
    reg = close_centre(ring_in)
    lo, hi = reg.min(0), reg.max(0)
    xm = 0.5 * (lo[0] + hi[0])
    lines = [((xm, 0.0), (lo[0], hi[1])), ((xm, 0.0), (hi[0], hi[1]))]
    b.extend(lid_beads(chart, reg, lines, margin=0.035, step=0.045))
    return b


def lip_spoiler(ex):
    """The little lip spoiler along the boot lid's trailing edge (left half, rides with the lid): a wedge rising
    to a sharp edge, tapering into the lid at its ends."""
    s = ex.cut['trunk'].side('in')
    uv = s['uv']
    ye = 0.50
    ys = np.linspace(0.0, ye, 12)
    # the trailing edge of the lid at each y (the outline's rear part), 4 cm in from it
    rear = uv[uv[:, 0] < D['trunk_front'] - 0.15]
    o = np.argsort(rear[:, 1])
    xe = np.interp(ys, rear[o, 1], rear[o, 0]) + 0.040
    P, Nn = S.CT.to3d(np.stack([xe, ys], 1))
    prof = np.array([(0.060, -0.003), (0.030, 0.006), (0.0, 0.016), (-0.022, 0.026), (-0.030, 0.027), (-0.032, 0.022), (-0.030, -0.003)])
    prof = K.round_profile(prof, [0, 0.02, 0.02, 0.006, 0.003, 0.003, 0], 1)
    V, N, T = K.sweep(P, (0, 0, 1), prof[::-1], closed=False)
    m = len(prof)
    V = V.reshape(len(P), m, 3)
    tap = np.clip((ye - ys) / 0.10, 0.0, 1.0)
    tap = tap * tap * (3 - 2 * tap)
    for i in range(len(P)):
        d = V[i] - P[i]
        h = d @ Nn[i]
        V[i] = V[i] - np.outer(h * (1.0 - tap[i]), Nn[i]) - Nn[i] * 0.0015
    V = V.reshape(-1, 3)
    b = recompute_normals(K.Buf().add(V, np.zeros_like(V), T, 'paint'))
    Vb, Nb, Tb, Mb = b.arrays()
    up = np.repeat(Nn, m, axis=0)
    # (one decision for the whole sheet: the normals point out of the wedge, away from the lid)
    if float((Nb * (Vb - np.repeat(P, m, axis=0) + up * 0.005)).sum()) < 0:
        Nb = -Nb
    out = K.Buf().add(Vb, Nb, Tb, 'paint')
    # the inner end on the centre line is closed by the mirror half; no cap is needed there
    return out


# ============================================================================================ pop-up lamp pods
class Pod:
    """A pop-up lamp pod (left): the lid flush with the bonnet, the black box under it hinged at the lid's rear
    edge (the axis on the surface, across the car) and the lamp's seat in it. Shut, the lamp in it looks down
    into the well; the pod turns front-up by `open_deg` about the axis to stand up with the lamp looking ahead and
    the lid facing the windscreen. The box's front wall is an arc about the axis, so it clears the well."""

    DEPTH = 0.128      # box depth under the lid (along the lid's normal)
    SEAT = 0.030       # the lamp's mount (the lamp part's body mount) under the lid; its back is on the seat plate
    OPEN_W = 0.226     # the lamp opening in the face plate: across the car
    OPEN_L = 0.212     # along the lid

    def __init__(self, ex):
        c = ex.cut['pod']
        si = c.side('in')
        self.P_in = si['P']
        uv = si['uv']
        self.y0 = float(uv[:, 1].min()) + 0.006
        self.y1 = float(uv[:, 1].max()) - 0.006
        self.yc = 0.5 * (self.y0 + self.y1)
        # the lid's mean plane: slope s (forward-down) from its rear edge to its front edge on the middle line
        xr_, xf_ = float(uv[:, 0].min()), float(uv[:, 0].max())
        pr = S.CT.to3d(np.array([[xr_ + 0.003, self.yc]]))[0][0]
        pf = S.CT.to3d(np.array([[xf_ - 0.003, self.yc]]))[0][0]
        self.s = math.atan2(pr[2] - pf[2], pf[0] - pr[0])
        self.ex_ = np.array([math.cos(self.s), 0.0, -math.sin(self.s)])      # along the lid, forward
        self.ez_ = np.array([math.sin(self.s), 0.0, math.cos(self.s)])       # the lid's normal
        # the hinge: on the surface at the lid's rear edge (gap's middle)
        self.H = np.array([xr_ - 0.5 * D['gap'], 0.0, pr[2] + (pr[0] - xr_) * math.tan(self.s)])
        self.A = float((pf - self.H) @ self.ex_) + 0.002       # the lid's length = the front arc's radius
        self.open_deg = round(90.0 + math.degrees(self.s), 1)
        a_bot = math.sqrt(self.A ** 2 - self.DEPTH ** 2)
        self.a_bot = a_bot
        # the lamp: centred across the box, along it in the middle of the face plate's opening
        self.a_lamp = 0.5 * a_bot + 0.004
        self.lamp = self.H + self.ex_ * self.a_lamp - self.ez_ * self.SEAT + np.array([0.0, self.yc, 0.0])

    def w(self, a, h, y):
        """World point from pod coordinates (a along the lid, h along its normal, y across)."""
        a, h, y = np.broadcast_arrays(np.asarray(a, float), np.asarray(h, float), np.asarray(y, float))
        return self.H + a[..., None] * self.ex_ + h[..., None] * self.ez_ + y[..., None] * np.array([0.0, 1.0, 0.0])

    def box(self):
        """The pod's black box under the lid (left), in world coordinates (shut)."""
        b = K.Buf()
        A, Dp = self.A - 0.004, self.DEPTH
        ab = math.sqrt(A * A - Dp * Dp)
        y0, y1 = self.y0 + 0.002, self.y1 - 0.002
        top = -0.010
        th_b = -math.asin(Dp / A)
        th_t = -math.asin(-top / A)
        ths = np.linspace(th_b, th_t, 9)
        # side walls: the section {a >= 0, top >= h >= -depth, inside the arc}
        sec = [(0.0, top), (0.0, -Dp), (ab, -Dp)] + [(A * math.cos(t), A * math.sin(t)) for t in ths[1:]]
        sec = np.array(sec)
        for y, sg in ((y0, -1.0), (y1, 1.0)):
            Pw = self.w(sec[:, 0], sec[:, 1], y)
            b.extend(K.fill_loop(Pw, (0, sg, 0), 'trim'))
        # rear wall (on the axis side), the face plate with the lamp opening, the front arc
        nr = -self.ex_
        q = self.w(np.array([0.0, 0.0, 0.0, 0.0]), np.array([top, -Dp, -Dp, top]), np.array([y0, y0, y1, y1]))
        b.add(q, np.tile(nr, (4, 1)), np.array([(0, 1, 2), (0, 2, 3)]), 'trim')
        ac, yc = self.a_lamp, self.yc
        op = K.rrect_loop(ac, yc, self.OPEN_L / 2, self.OPEN_W / 2, 0.03, 0.012)
        outer = np.array([(0.0, y0), (ab, y0), (ab, y1), (0.0, y1)])
        outer = K.resample(outer, 0.03, closed=True)
        Po = self.w(outer[:, 0], np.full(len(outer), -Dp), outer[:, 1])
        Ph = self.w(op[:, 0], np.full(len(op), -Dp), op[:, 1])
        b.extend(K.fill_loop(Po, -self.ez_, 'trim', holes=[Ph]))
        # a short flange round the opening, inwards
        b.extend(K.ring_tube(Ph, self.ez_, 0.012, 1, 'trim'))
        # chrome bezel ring round the opening on the face plate
        Pb = self.w(op[:, 0], np.full(len(op), -Dp - 0.0012), op[:, 1])
        rim = K.rrect_loop(ac, yc, self.OPEN_L / 2 + 0.007, self.OPEN_W / 2 + 0.007, 0.036, 0.012)
        Pr = self.w(rim[:, 0], np.full(len(rim), -Dp - 0.0012), rim[:, 1])
        b.extend(K.fill_loop(Pr, -self.ez_, 'chrome', holes=[Pb]))
        # the front arc
        ys = np.linspace(y0, y1, 6)
        V = []
        N = []
        for t in ths:
            for y in ys:
                V.append(self.w(np.array(A * math.cos(t)), np.array(A * math.sin(t)), y))
                N.append(self.ex_ * math.cos(t) + self.ez_ * math.sin(t))
        b.add(np.array(V).reshape(-1, 3), np.array(N), K.grid_tris(len(ths), len(ys)), 'trim')
        # the lamp's seat inside (seen through the opening without a lamp)
        seat = K.resample(np.array([(0.012, y0 + 0.01), (ab - 0.01, y0 + 0.01), (ab - 0.01, y1 - 0.01), (0.012, y1 - 0.01)]), 0.04, closed=True)
        Ps = self.w(seat[:, 0], np.full(len(seat), -self.SEAT + 0.015), seat[:, 1])
        b.extend(K.fill_loop(Ps, -self.ez_, 'trim'))
        # the hinge's arm and its pivot (inboard, at the axis)
        hp = self.w(np.array(0.0), np.array(-0.008), y0 - 0.004)
        b.extend(K.cyl_buf(hp + (0, -0.01, 0), hp + (0, 0.006, 0), 0.008, 'steel', 10))
        return b

    def lamp_frame(self):
        """(position, 3x3 rotation, columns = the lamp's local axes) of the lamp's mount, shut: the rotation that
        the pod's opening takes to the lamp looking straight ahead, its top up."""
        a = math.radians(self.open_deg)
        # the pod opens by turning -open_deg about +Y (Blender): its inverse turns +open_deg about +Y
        c, s = math.cos(a), math.sin(a)
        R = np.array([[c, 0.0, s], [0.0, 1.0, 0.0], [-s, 0.0, c]])
        return self.lamp.copy(), R


def pod_well(ex, pod, depth=None):
    """The well the pod folds into (left, part of BODY): black walls from the lip of the pod's cut down along the
    pod's normal (the box's walls lean with the bonnet, so the well's do), a floor under the box, a drain hole."""
    b = K.Buf()
    lip = ex.pod_lip
    n = pod.ez_
    d = (pod.DEPTH + 0.022) if depth is None else depth
    b.extend(K.ring_tube(lip, -n, d, 2, 'trim'))
    floor = lip - n * d
    b.extend(K.fill_loop(floor, n, 'trim'))
    c = floor.mean(0)
    b.extend(K.cyl_buf(c - n * 0.004, c + n * 0.002, 0.012, 'rubber', 10))
    return b


# ============================================================================================ engine bay
def bay_top(x):
    """The top of the bay's side walls: just under the bonnet's side edge, following the bonnet line."""
    return bonnet_z(x, D['hood_w'] - 0.02) - 0.032


def side_wall(x0, x1, y, z0, ztop_fn, nx=12, nz=5, normal=(0, -1, 0), mat='paint'):
    """A vertical sheet at y from z0 up to ztop_fn(x), finely divided (the baked occlusion lives on its vertices)."""
    xs = np.linspace(x0, x1, nx + 1)
    V = []
    for x in xs:
        zt = ztop_fn(x)
        for j in range(nz + 1):
            V.append((x, y, z0 + (zt - z0) * j / nz))
    V = np.array(V)
    return K.Buf().add(V, np.tile(np.asarray(normal, float), (len(V), 1)), K.grid_tris(len(xs), nz + 1), mat)


def engine_bay():
    """Left half of the engine bay: side wall following the bonnet line, wheelhouse tub with the strut tower,
    fender ledge, firewall (open over the tunnel), cowl plenum, radiator support, bonnet hinge brackets,
    wiring, brake lines."""
    b = K.Buf()
    xa, za = D['ax_f'], D['hub_z']
    y_out = 0.76
    fx = FIREWALL_X
    # (ahead of the wheelhouse the pod's well takes the corner: the side wall steps in under the bonnet's step)
    xw = xa + 0.34
    b.extend(side_wall(fx, xw, APRON_Y, 0.30, bay_top, 11, 5))
    b.extend(side_wall(xw, RAD_X, POD_WALL_Y, 0.30, lambda x: bonnet_z(x, D['hood_front_w'] + 0.02) - 0.032, 4, 5))
    b.extend(quad_sheet((xw, POD_WALL_Y, 0.30), (0, APRON_Y - POD_WALL_Y, 0), (0, 0, bay_top(xw) - 0.30), 1, 2, (1, 0, 0), 'paint'))
    # wheelhouse tub seen from the bay (painted top side), outboard of the side wall
    R = 0.33
    b.extend(tub(xa, za, R, APRON_Y, y_out, 4, 176, 'paint', True))
    # strut tower bulging into the bay from the side wall, the strut's top mount on its cap
    b.extend(strut_tower(xa, 0.475, 0.098, 0.36, 0.768, APRON_Y))
    # stamped bead along the side wall (broken by the tower)
    for (x0, x1) in ((fx + 0.06, xa - 0.12), (xa + 0.11, xw - 0.04)):
        xs = np.linspace(x0, x1, 5)
        path = np.array([(x, APRON_Y, min(0.56, bay_top(x) - 0.08)) for x in xs])
        b.extend(K.tube_buf(path, 0.007, 'paint', 6))
    # fender top ledge (under the bonnet's side edge) from the side wall out to the body, up to the pod's well
    xs = np.linspace(fx, xw, 12)
    V = np.array([(x, y, bay_top(x)) for x in xs for y in np.linspace(APRON_Y, y_out, 5)])
    b.extend(face_up(recompute_normals(K.Buf().add(V, np.zeros_like(V), K.grid_tris(len(xs), 5), 'paint'))))
    # closing walls of the fender cavity in front of / behind the wheelhouse
    for x0 in (xa - R - 0.01, xa + R + 0.01):
        b.extend(quad_sheet((x0, APRON_Y, 0.30), (0, y_out - APRON_Y, 0), (0, 0, bay_top(x0) - 0.30), 1, 2, (1 if x0 > xa else -1, 0, 0), 'paint'))
    # firewall: beside the tunnel down to the floor, over it from the tunnel's top
    tw = tunnel_w(fx) + 0.06
    b.extend(quad_sheet((fx, tw, 0.16), (0, APRON_Y - tw, 0), (0, 0, 0.80 - 0.16), 4, 6, (1, 0, 0), 'paint'))
    b.extend(quad_sheet((fx, 0.0, tunnel_h(fx) + 0.01), (0, tw, 0), (0, 0, 0.80 - tunnel_h(fx) - 0.01), 2, 3, (1, 0, 0), 'paint'))
    # the tunnel's mouth in the firewall (the gearbox runs through it)
    xs = np.linspace(0.0, 1.0, 2)
    for (p0, p1) in (((fx + 0.001, 0.0, tunnel_h(fx) + 0.01), (fx + 0.001, tw, tunnel_h(fx) + 0.01)),
                     ((fx + 0.001, tw, tunnel_h(fx) + 0.01), (fx + 0.001, tw, 0.16))):
        b.extend(K.tube_buf(np.array([p0, p1]), 0.008, 'rubber', 6))
    # cowl plenum under the windscreen's base and the cowl panel (the vent slots are on top)
    b.extend(K.box_buf((fx - 0.02, 0.0, 0.795), (D['hood_rear'] - 0.004, 0.70, 0.838), 'paint', 0.006, 2))
    # radiator support: top bar, side post, bottom bar
    zt = bonnet_z(RAD_X, 0.3) - 0.045
    b.extend(K.box_buf((RAD_X, 0.0, zt - 0.040), (RAD_X + 0.045, POD_WALL_Y + 0.006, zt), 'paint', 0.008, 2))
    b.extend(K.box_buf((RAD_X, 0.0, 0.205), (RAD_X + 0.045, APRON_Y + 0.01, 0.245), 'paint', 0.008, 2))
    b.extend(K.box_buf((RAD_X, POD_WALL_Y - 0.06, 0.205), (RAD_X + 0.045, POD_WALL_Y + 0.006, zt), 'paint', 0.008, 2))
    # bonnet latch (half) on the top bar
    b.extend(K.box_buf((RAD_X - 0.022, 0.0, zt - 0.03), (RAD_X + 0.006, 0.032, zt + 0.012), 'steel', 0.004, 2))
    # bonnet hinge bracket at the cowl
    hz = bonnet_z(D['hood_rear'], 0.62)
    b.extend(K.box_buf((D['hood_rear'] - 0.03, 0.60, hz - 0.075), (D['hood_rear'] + 0.02, 0.615, hz - 0.03), 'steel', 0.003, 1))
    # ribbed heat shield on the firewall behind the engine, beside the tunnel's mouth
    b.extend(heat_shield(fx, 0.27, 0.48, 0.76))
    # wiring loom: from the fuse box along the side wall, round the strut tower to the pod, a branch over the
    # radiator support's top bar, a branch across the firewall
    wy = APRON_Y - 0.015
    pw = POD_WALL_Y - 0.012
    main = [(fx + 0.22, wy, 0.66), (0.92, wy, 0.64), (xa - 0.07, 0.36, 0.65), (xa, 0.355, 0.655), (xa + 0.07, 0.36, 0.645),
            (xa + 0.14, wy, 0.60), (xw - 0.02, wy, 0.56), (xw + 0.03, pw, 0.55), (RAD_X - 0.06, pw, 0.55), (RAD_X - 0.03, pw, 0.60)]
    top_bar = [(RAD_X - 0.06, pw, 0.55), (RAD_X + 0.008, 0.38, zt + 0.004), (RAD_X + 0.02, 0.22, zt + 0.005), (RAD_X + 0.02, 0.0, zt + 0.005)]
    fw = [(fx + 0.12, wy, 0.64), (fx + 0.06, wy, 0.56), (fx + 0.012, 0.44, 0.50), (fx + 0.012, 0.30, 0.47), (fx + 0.012, 0.21, 0.47)]
    b.extend(harness([main, top_bar, fw], [0.008, 0.006, 0.006]))
    for x in (0.92, 1.36):
        b.extend(K.box_buf((x - 0.008, APRON_Y - 0.009, 0.58), (x + 0.008, APRON_Y, 0.61), 'trim', 0.002, 1))
    # brake lines from the master cylinder down the side wall to the wheel
    for dz in (0.0, 0.013):
        path = [(fx + 0.20, 0.395, 0.64 + dz), (0.78, 0.43, 0.62 + dz), (0.82, APRON_Y - 0.006, 0.58 + dz),
                (0.84, APRON_Y - 0.006, 0.47 + dz), (0.85, APRON_Y - 0.006, 0.36 + dz)]
        b.extend(K.tube_buf(smooth_path(path, 1), 0.0026, 'steel', 4))
    return b


def engine_bay_asym():
    """Non-symmetric bay details: brake booster and master cylinder (driver side, left), heater box and relay box
    (right), the battery tray (left front), the washer bottle (right front), the fuse box. All stay outside the
    rooms the engine, radiator and battery mounts leave."""
    b = K.Buf()
    fx = FIREWALL_X
    by_ = 0.392
    V, N, T = K.lathe(np.array([(0.0, 0.0), (0.062, 0.0), (0.070, 0.011), (0.070, 0.050), (0.062, 0.060), (0.0, 0.060)]), (fx, by_, 0.64), (1, 0, 0), 16)
    b.add(V, N, T, 'steel')
    b.extend(K.cyl_buf((fx + 0.060, by_, 0.64), (fx + 0.20, by_, 0.64), 0.019, 'alu', 12))
    b.extend(K.cyl_buf((fx + 0.13, by_, 0.66), (fx + 0.13, by_, 0.708), 0.025, 'ceramic', 14))
    b.extend(K.cyl_buf((fx + 0.13, by_, 0.708), (fx + 0.13, by_, 0.722), 0.020, 'trim', 12))
    # heater box on the right of the firewall, its two hose stubs
    b.extend(K.box_buf((fx, -0.455, 0.55), (fx + 0.09, -0.315, 0.74), 'plastic_int', 0.02, 2))
    for hz in (0.60, 0.67):
        b.extend(K.tube_buf(smooth_path([(fx + 0.09, -0.38, hz), (fx + 0.14, -0.38, hz - 0.005), (fx + 0.16, -0.375, hz - 0.05)]), 0.012, 'rubber', 8))
    b.extend(K.box_buf((fx + 0.14, -APRON_Y, 0.62), (fx + 0.21, -APRON_Y + 0.04, 0.69), 'trim', 0.006, 2))
    # battery tray (the battery part sits on it), left, ahead of the engine
    bx, by, bz = BATTERY
    b.extend(K.box_buf((bx - 0.14, by - 0.10, bz - 0.012), (bx + 0.14, by + 0.10, bz), 'steel', 0.004, 1))
    b.extend(K.box_buf((bx - 0.02, by + 0.08, 0.27), (bx + 0.02, APRON_Y, bz - 0.012), 'steel', 0.004, 1))
    b.extend(K.box_buf((bx - 0.14, by - 0.10, bz), (bx - 0.13, by + 0.10, bz + 0.03), 'steel', 0.002, 1))
    # washer bottle (right front, ahead of the wheelhouse, inboard of the pod's well)
    b.extend(K.box_buf((1.30, -0.40, 0.36), (1.44, -0.31, 0.56), 'ceramic', 0.03, 2))
    b.extend(K.cyl_buf((1.37, -0.355, 0.56), (1.37, -0.355, 0.59), 0.018, 'trim', 10))
    # fuse box on the left side wall, the identification plate further forward
    b.extend(K.box_buf((fx + 0.12, APRON_Y - 0.05, 0.60), (fx + 0.24, APRON_Y - 0.002, 0.70), 'trim', 0.008, 2))
    b.extend(K.box_buf((1.40, APRON_Y - 0.003, 0.50), (1.48, APRON_Y - 0.001, 0.54), 'alu', 0.0, 1))
    return b


# ============================================================================================ boot
def boot_interior():
    """The small boot behind the rear axle (left half): floor, side walls, rear panel inside, the front wall
    up to the luggage shelf, the gutter ledge round the lid opening."""
    b = K.Buf()
    x_rear = -1.885                             # (ahead of the tail lamps' recesses)
    za = D['hub_z']
    r = 0.335
    # the full-width floor runs forward to where the wheel arch's hump rises out of it (stopping short of it,
    # it left a slot down into the wheelhouse beside each hump)
    xt = D['ax_r'] - math.sqrt(r * r - (BOOT_Z - za) ** 2) + 0.003
    yw = 0.69
    # (the floor itself is boot_floor(): one piece across, no seam down the middle)
    b.extend(K.box_buf((x_rear, yw - 0.04, BOOT_Z), (xt, yw, 0.835), 'paint', 0.004, 2))
    b.extend(K.box_buf((x_rear - 0.015, 0.0, BOOT_Z), (x_rear, yw, 0.835), 'paint', 0.004, 2))
    # the boot's front wall, up to the shelf behind the seats
    b.extend(K.box_buf((-1.42, 0.0, BOOT_Z), (-1.40, 0.46, SHELF_Z), 'paint', 0.004, 2))
    # rear wheel arch hump inside the boot (the part above the boot floor)
    a0 = math.degrees(math.asin((BOOT_Z - za) / r))
    a1 = math.degrees(math.acos(min(1.0, (D['ax_r'] - (-1.42)) / r)))
    ths = np.radians(np.linspace(a0, min(90.0, a1), 10))
    ys = np.array([0.46, yw])
    V = np.array([(D['ax_r'] + r * math.cos(PI - t), y, za + r * math.sin(t)) for t in ths for y in ys])
    Nn = np.array([(math.cos(PI - t), 0.0, math.sin(t)) for t in ths for y in ys])
    b.add(V, Nn, K.grid_tris(len(ths), 2), 'paint')
    ring = np.array([(D['ax_r'] + r * math.cos(PI - t), 0.46, za + r * math.sin(t)) for t in ths])
    ring = np.vstack([ring, [(ring[-1, 0], 0.46, BOOT_Z)]])
    b.extend(K.fill_loop(ring, (0, -1, 0), 'paint'))
    # gutter ledge round the lid opening (under the deck)
    b.extend(K.box_buf((x_rear, 0.62, 0.80), (D['trunk_front'] + 0.04, 0.67, 0.815), 'paint', 0.004, 2))
    b.extend(K.box_buf((D['trunk_front'] + 0.005, 0.0, 0.80), (D['trunk_front'] + 0.045, 0.67, 0.815), 'paint', 0.004, 2))
    return b


def boot_floor():
    """The boot's floor across the whole width (a centre part: the left half and its mirror met in a groove down
    the middle, the bevels of their edges a crack a floor drawn from above fell through): full width from the
    rear panel to where the wheel arches' humps rise out of it, between the humps on to the front wall."""
    b = K.Buf()
    x_rear = -1.885
    r = 0.335
    xt = D['ax_r'] - math.sqrt(r * r - (BOOT_Z - D['hub_z']) ** 2) + 0.003
    b.extend(K.box_buf((x_rear, -0.69, BOOT_Z - 0.012), (xt, 0.69, BOOT_Z), 'paint', 0.004, 2))
    b.extend(K.box_buf((xt - 0.012, -0.46, BOOT_Z - 0.012), (-1.40, 0.46, BOOT_Z), 'paint', 0.004, 2))
    return b


# ============================================================================================ apertures
def apertures():
    """Door aperture structure: the B pillar post behind the door below the belt, the sill top with its seal,
    the A pillar's hinge face."""
    b = K.Buf()
    b.extend(K.box_buf((D['fd_rear'] - 0.065, 0.62, D['door_bot'] - 0.02), (D['fd_rear'] - 0.005, 0.70, 0.86), 'paint', 0.006, 2))
    x0 = D['fd_rear'] - 0.02
    b.extend(K.box_buf((x0, 0.62, 0.13), (D['fd_front'], 0.70, D['door_bot'] - 0.012), 'paint', 0.006, 2))
    xs = np.linspace(x0 + 0.02, D['fd_front'] - 0.02, 5)
    path = np.stack([xs, np.full(len(xs), 0.705), np.full(len(xs), D['door_bot'] - 0.006)], 1)
    b.extend(K.tube_buf(path, 0.008, 'rubber', 8))
    b.extend(K.box_buf((D['fd_front'] + 0.005, 0.62, D['door_bot'] - 0.02), (D['fd_front'] + 0.07, 0.70, 0.84), 'paint', 0.006, 2))
    return b


# ============================================================================================ underbody
def underbody():
    """UNDER (left half): floor pan, rails, the front crossmember ahead of the sump, lower control arms and the
    tie rod out to the knuckle, the live rear axle's tube, trailing arm and upper link, wheelhouse liners. The
    hubs' carriers are objects of their own (knuckle()); springs, dampers, brakes and the differential are the
    axles' parts."""
    b = K.Buf()
    # floor pan underside with the tunnel (extruded section), from the bulkhead to the firewall
    xs = np.linspace(BULK_X, FIREWALL_X, 12)
    V = []
    for x in xs:
        th = tunnel_h(x)
        tw = tunnel_w(x)
        sec = K.round_profile(np.array([(0.0, th), (tw, th), (tw + 0.025, th - 0.05), (tw + 0.045, PAN_Z), (0.64, PAN_Z), (0.66, 0.15)]),
                              [0, 0.03, 0.03, 0.03, 0.02, 0], 2)
        V += [(x, y, z) for (y, z) in sec]
    V = np.array(V)
    T = K.grid_tris(len(xs), len(sec))
    b.extend(flip_down(recompute_normals(K.Buf().add(V, np.zeros_like(V), T, 'trim'))))
    # the kick-up behind the seats into the rear floor over the axle, the boot floor's underside
    xk = np.linspace(BULK_X - 0.12, BULK_X, 6)
    V = []
    for x in xk:
        f = (x - (BULK_X - 0.12)) / 0.12
        z = (SHELF_Z - 0.03) + (PAN_Z - (SHELF_Z - 0.03)) * (3 * f * f - 2 * f ** 3)
        for y in np.linspace(0.0, 0.47, 7):
            V.append((x, y, z))
    V = np.array(V)
    b.extend(flip_down(recompute_normals(K.Buf().add(V, np.zeros_like(V), K.grid_tris(len(xk), 7), 'trim'))))
    b.extend(K.box_buf((-1.40, 0.0, SHELF_Z - 0.045), (BULK_X - 0.12, 0.37, SHELF_Z - 0.03), 'trim', 0.004, 1))
    # (to where the boot's floor meets the wheel arch's hump, as the floor over it)
    xt = D['ax_r'] - math.sqrt(0.335 ** 2 - (BOOT_Z - D['hub_z']) ** 2) + 0.003
    b.extend(K.box_buf((-1.92, 0.0, BOOT_Z - 0.025), (xt, 0.70, BOOT_Z - 0.012), 'trim', 0.004, 1))
    b.extend(K.box_buf((xt, 0.0, BOOT_Z - 0.025), (-1.40, 0.46, BOOT_Z - 0.012), 'trim', 0.004, 1))
    # rails: front rails under the bay from the firewall to the radiator support, sill boxes, rear rails over
    # the axle
    b.extend(K.box_buf((FIREWALL_X - 0.30, 0.40, 0.17), (RAD_X + 0.02, 0.46, 0.24), 'steel', 0.006, 2))
    b.extend(K.box_buf((BULK_X - 0.05, 0.62, 0.13), (FIREWALL_X, 0.70, 0.17), 'steel', 0.006, 2))
    b.extend(K.box_buf((-1.86, 0.40, BOOT_Z - 0.08), (-1.36, 0.46, BOOT_Z - 0.025), 'steel', 0.006, 2))
    b.extend(K.box_buf((-1.36, 0.30, SHELF_Z - 0.10), (BULK_X - 0.05, 0.36, SHELF_Z - 0.045), 'steel', 0.006, 2))
    # front crossmember ahead of the sump (the engine's front is at the front axle), dropping between the rails
    b.extend(dropped_crossmember(1.30, 0.10, 0.055, 0.195, 0.205, 0.30, 0.40, 0.46))
    # wheelhouse liners (front and rear)
    for xa, y0, y1 in ((D['ax_f'], APRON_Y, 0.76), (D['ax_r'], 0.48, 0.76)):
        b.extend(wheelhouse(xa, y0, y1))
    # front suspension (left): the lower control arm from the crossmember and its rear bush to the knuckle, the
    # tie rod from the rack ahead of the axle (the strut is the suspension part's, the knuckle its own object)
    hx, hy, hz = D['ax_f'], D['track_f'] / 2, D['hub_z']
    b.extend(K.tube_buf(np.array([(hx + 0.15, 0.30, 0.20), (hx, hy - 0.12, 0.185), (hx - 0.14, 0.32, 0.20)]), 0.014, 'steel', 10))
    for (x, y) in ((hx + 0.15, 0.30), (hx - 0.14, 0.32)):
        b.extend(K.cyl_buf((x - 0.03, y, 0.20), (x + 0.03, y, 0.20), 0.022, 'rubber', 10))
    b.extend(K.tube_buf(np.array([(hx + 0.14, 0.24, 0.255), (hx + 0.15, hy - 0.11, 0.25)]), 0.010, 'steel', 8))
    b.extend(K.tube_buf(np.array([(hx + 0.15, hy - 0.11, 0.25), (hx + 0.06, hy - 0.10, 0.25)]), 0.008, 'steel', 6))
    # rear axle (left): its tube from the differential part's tube end out into the hub's carrier, the lower
    # trailing arm, the upper link to the differential, the Panhard rod's body end
    rx, ry = D['ax_r'], D['track_r'] / 2
    b.extend(K.cyl_buf((rx, AXLE_IN, hz), (rx, axle_end(ry), hz), 0.036, 'steel', 16))
    b.extend(K.tube_buf(np.array([(rx, 0.46, hz - 0.045), (rx + 0.44, 0.47, 0.20)]), 0.016, 'steel', 10))
    for p in ((rx, 0.46, hz - 0.045), (rx + 0.44, 0.47, 0.20)):
        b.extend(K.cyl_buf(np.array(p) + (0, -0.025, 0), np.array(p) + (0, 0.025, 0), 0.022, 'rubber', 10))
    b.extend(K.tube_buf(np.array([(rx + 0.08, 0.17, hz + 0.10), (rx + 0.36, 0.22, SHELF_Z - 0.10)]), 0.013, 'steel', 8))
    return b


# the rear axle's tubes start this far out from the centre: 2 cm inside the differential part's tube ends
AXLE_IN = 0.29
# where the differential part's companion flange is (ahead of the axle and below it: x, z from the axle centre)
DIFF_FLANGE = (0.2645, -0.024)


def axle_end(hy):
    """Where a live axle's tube ends: in the middle of its hub's carrier (knuckle())."""
    return hy - K.BRAKE_IN[1] - 0.003 - 0.015


def knuckle(hx, hy, hz, front=True):
    """A hub's carrier (left side: outer face +Y): the hub flange at the hub face with four studs and the centre
    cap, the spindle, and the knuckle just inboard of the brake (front: up to the strut's clamp; rear: the axle's
    end). An object of its own, KNUCKLE_<hub>, the game hangs on the wheel's pivot."""
    return K.knuckle_buf(hx, hy, hz, hy + 0.010, 0.060, 4, 0.0495, 45.0, stud_r=0.0055, stud_len=0.007, cap_r=0.022,
                         cap_out=0.005, carrier=(0.05, 0.03, 0.10, 0.19 if front else 0.12))


def centre_under():
    """Parts on the centre line that must not be mirrored: the steering rack (ahead of the front axle, with its
    boots), the propshaft (from the gearbox's tail back to the differential part's companion flange), the
    Panhard rod across the axle, the fuel filler neck (right)."""
    b = K.Buf()
    hz = D['hub_z']
    hx = D['ax_f']
    # steering rack across the front crossmember, boots at its ends, the pinion up to the column's shaft
    b.extend(K.cyl_buf((hx + 0.14, -0.24, 0.255), (hx + 0.14, 0.24, 0.255), 0.022, 'alu', 14))
    for sy in (1.0, -1.0):
        V, N, T = K.lathe(np.array([(0.012, 0.0), (0.022, 0.012), (0.017, 0.024), (0.022, 0.036), (0.017, 0.048), (0.022, 0.06), (0.010, 0.072)]),
                          (hx + 0.14, sy * 0.24, 0.255), (0, sy, 0), 12)
        b.add(V, N, T, 'rubber')
    b.extend(K.tube_buf(np.array([(hx + 0.14, 0.34, 0.255), (hx + 0.06, 0.36, 0.40), (FIREWALL_X + 0.01, DRIVER_Y, 0.52)]), 0.012, 'steel', 8))
    # propshaft
    xe, ze = D['ax_r'] + DIFF_FLANGE[0] + 0.022, hz + DIFF_FLANGE[1]
    x0 = GEARBOX[0] + GEARBOX_ROOM[0][0] - 0.005
    z0 = GEARBOX[2] + 0.085
    b.extend(K.cyl_buf((x0, 0.0, z0), (xe, 0.0, ze), 0.030, 'steel', 16))
    for x, z in ((x0, z0), (xe, ze)):
        b.extend(K.cyl_buf((x - 0.02, 0.0, z), (x + 0.02, 0.0, z), 0.043, 'steel', 16))
    # the centre bearing under the tunnel
    xm, zm = 0.5 * (x0 + xe), 0.5 * (z0 + ze)
    b.extend(K.box_buf((xm - 0.03, -0.07, zm - 0.04), (xm + 0.03, 0.07, zm + 0.05), 'rubber', 0.01, 2))
    # fuel filler neck from the right rear flap down to the tank
    tx = TANK[0]
    # (down outside the boot's side wall, then in under the boot floor and the rear rail into the tank's side:
    # across the boot's corner it stood up out of the floor)
    path = np.array([(D['fuel_x'], -0.76, D['fuel_z']), (D['fuel_x'], -0.735, D['fuel_z'] - 0.05),
                     (D['fuel_x'] + 0.005, -0.735, 0.37), (tx - 0.05, -0.62, 0.31), (tx - 0.05, -0.37, 0.31)])
    b.extend(K.tube_buf(smooth_path(path, 1), 0.022, 'rubber', 12))
    return b


def wheelhouse(xa, y0, y1, r=0.322):
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
    ring = np.array([(xa + r * math.cos(t), y0, za + r * math.sin(t)) for t in ths])
    b.extend(K.fill_loop(ring, (0, 1, 0), 'trim'))
    return b


# ============================================================================================ interior
def interior(ex):
    """INTERIOR (left-half and centre builders are combined by the assembly). Returns dict of bufs and the
    needle / gauge layout."""
    out = {}
    L = K.Buf()   # mirrored
    C = K.Buf()   # centre / asymmetric (not mirrored)
    # floor carpet with the tunnel (left half section, extruded) from the bulkhead to the toe board
    xs = np.linspace(BULK_X + 0.01, FIREWALL_X - 0.02, 14)
    V = []
    for x in xs:
        th = tunnel_h(x) + 0.04
        tw = tunnel_w(x) + 0.008
        sec = K.round_profile(np.array([(0.0, th), (tw, th), (tw + 0.025, th - 0.05), (tw + 0.045, FLOOR_Z), (0.635, FLOOR_Z), (0.645, 0.20)]),
                              [0, 0.03, 0.03, 0.03, 0.02, 0], 2)
        V += [(x, y, z) for (y, z) in sec]
    V = np.array(V)
    T = K.grid_tris(len(xs), len(sec))
    L.extend(face_up(recompute_normals(K.Buf().add(V, np.zeros_like(V), T, 'fabric'))))
    # toe board up to the firewall
    L.extend(K.box_buf((FIREWALL_X - 0.24, 0.20, FLOOR_Z), (FIREWALL_X - 0.04, 0.60, FLOOR_Z + 0.02), 'fabric', 0.006, 2,
                       xf=K.mat4_rot((0, 1, 0), -38, (FIREWALL_X - 0.24, 0, FLOOR_Z))))
    # firewall face inside the cabin, behind the dash
    tw0 = tunnel_w(FIREWALL_X) + 0.06
    L.extend(quad_sheet((FIREWALL_X - 0.004, tw0, FLOOR_Z), (0, 0.66 - tw0, 0), (0, 0, 0.62 - FLOOR_Z), 2, 2, (-1, 0, 0), 'trim'))
    th0 = tunnel_h(FIREWALL_X) + 0.045
    L.extend(quad_sheet((FIREWALL_X - 0.004, 0.0, th0), (0, tw0, 0), (0, 0, 0.62 - th0), 1, 1, (-1, 0, 0), 'trim'))
    # the bulkhead behind the seats and the luggage shelf over the rear axle, the wheel humps in it
    # (beside the rear wheel the bulkhead steps forward clear of its wheelhouse)
    L.extend(K.box_buf((BULK_X - 0.02, 0.0, FLOOR_Z), (BULK_X, 0.47, SHELF_Z), 'fabric', 0.006, 2))
    L.extend(K.box_buf((BULK_X + 0.005, 0.47, FLOOR_Z), (BULK_X + 0.025, 0.66, SHELF_Z), 'fabric', 0.006, 2))
    # (the shelf one piece across: halves meeting down the middle left the bevels' groove there)
    C.extend(K.box_buf((-1.42, -0.48, SHELF_Z - 0.015), (BULK_X, 0.48, SHELF_Z), 'fabric', 0.006, 2))
    r_hump = 0.335
    L.extend(rear_tub_cabin(D['ax_r'], D['hub_z'], r_hump, 0.48, 0.70, SHELF_Z - 0.015))
    # the rear struts' turrets standing up through the wheel humps (the strut parts' tops are under their caps)
    L.extend(strut_turret(D['ax_r'], 0.475, 0.098, SHELF_Z - 0.04, 0.770))
    w_hump = math.sqrt(r_hump ** 2 - (SHELF_Z - 0.015 - D['hub_z']) ** 2)
    for (x0, x1) in ((-1.42, D['ax_r'] - w_hump), (D['ax_r'] + w_hump, BULK_X)):
        if x1 - x0 > 0.01:
            L.extend(K.box_buf((x0, 0.48, SHELF_Z - 0.015), (x1, 0.70, SHELF_Z), 'fabric', 0.004, 1))
    # a strap across the shelf
    L.extend(K.box_buf((-1.16, 0.10, SHELF_Z), (-1.13, 0.40, SHELF_Z + 0.004), 'trim', 0.001, 1))
    # quarter trims beside the shelf (under the quarter windows) and the B pillar's lower trim
    L.extend(K.box_buf((-1.40, 0.64, SHELF_Z), (D['fd_rear'] - 0.06, 0.70, 0.86), 'plastic_int', 0.02, 2))
    # sill trims and kick panels
    L.extend(K.box_buf((D['fd_rear'] - 0.02, 0.635, FLOOR_Z), (D['fd_front'] - 0.02, 0.685, 0.235), 'plastic_int', 0.012, 2))
    L.extend(K.box_buf((D['fd_front'] - 0.03, 0.58, FLOOR_Z), (FIREWALL_X - 0.02, 0.69, 0.56), 'plastic_int', 0.02, 2))
    # headliner: greenhouse roof 22 mm inside, facing down
    gus = S.g_u_samples()
    row = np.stack([gus, np.full(len(gus), S.G_T[-1] - 0.02)], 1)
    Pr, _ = S.CG.to3d(row, -0.022)
    a, bb = Pr[-1], Pr[0]
    xc = np.linspace(a[0], bb[0], 30)[1:-1]
    loop = np.vstack([Pr[:, :2], np.stack([xc, np.zeros(len(xc))], 1)])
    g = K.grid_points(-1.1, 0.1, 0.0, 0.7, 0.06, dt=0.06)
    V, N, T = K.mesh_region(S.CR, [K.Loop(loop)], [], g, spacing=0.06, level=-0.022)
    L.add(V, -N, T, 'fabric')
    # dashboard
    dash, gauges = dashboard()
    C.extend(dash)
    # pedals (driver, left): hanging from under the dash, the pads before the toe board
    for (py, w_, name) in ((DRIVER_Y + 0.10, 0.045, 'clutch'), (DRIVER_Y, 0.055, 'brake'), (DRIVER_Y - 0.12, 0.035, 'throttle')):
        base = np.array([FIREWALL_X - 0.10, py, 0.56])
        pad = np.array([FIREWALL_X - 0.17, py, 0.30 if name != 'throttle' else 0.26])
        C.extend(K.tube_buf(np.array([base, (base + pad) / 2 + (0.02, 0, 0), pad + (0, 0, 0.04)]), 0.008, 'steel', 8))
        C.extend(K.box_buf(pad + (-0.012, -w_, -0.04 if name != 'throttle' else -0.06), pad + (0.012, w_, 0.04), 'rubber', 0.006, 2,
                           xf=K.mat4_rot((0, 1, 0), -24, pad)))
    # steering column shroud (the steering part mounts at its top)
    st = steering_mount()
    col_dir = st[1]
    p_top = st[0] + col_dir * 0.05
    p_bot = st[0] + col_dir * 0.30
    C.extend(K.cyl_buf(p_bot, p_top, 0.044, 'plastic_int', 20, r1=0.036))
    # centre console with the radio's slot, the gear lever's boot ring and the handbrake's slot
    C.extend(console())
    # low seat rails at the seat mounts
    for (sx, sy) in ((SEAT_X, DRIVER_Y), (SEAT_X, -DRIVER_Y)):
        for dy in (-0.17, 0.17):
            C.extend(K.box_buf((sx - 0.24, sy + dy - 0.014, FLOOR_Z - 0.002), (sx + 0.24, sy + dy + 0.014, SEAT_Z), 'steel', 0.003, 1))
    # interior mirror on a pad glued to the windscreen under its top edge (the glass lies 30 degrees from level,
    # so the pad lies along it), its stem down to the head; sun visors flat under the headliner (rolled with the
    # roof's crown), clear of the roof skin
    wr = math.degrees(S._WR)
    zg = 1.170
    pg = np.array([float(S.ws_x(0, zg)) - 0.007 / math.sin(S._WR) - 0.001, 0.0, zg])
    Mp = K.mat4_rot((0, 1, 0), -(90.0 - wr))
    Mp[:3, 3] = pg
    C.extend(K.box_buf((-0.010, -0.014, -0.013), (0.0, 0.014, 0.013), 'plastic_int', 0.003, 2, xf=Mp))
    mp = pg + np.array([-0.036, 0.0, -0.040])
    C.extend(K.tube_buf(np.array([pg + (-0.008, 0, -0.002), mp + (-0.011, 0, 0.012)]), 0.005, 'plastic_int', 8))
    C.extend(K.box_buf(mp + (-0.022, -0.10, -0.028), mp + (0.0, 0.10, 0.016), 'plastic_int', 0.010, 3))
    C.extend(K.box_buf(mp + (-0.0232, -0.09, -0.021), mp + (-0.0225, 0.09, 0.010), 'glass_dark', 0.0, 1))
    for sy in (1, -1):
        vz = 1.173
        vp = np.array([float(S.ws_x(0.35, vz)) - 0.10, sy * 0.35, vz])
        C.extend(K.box_buf(vp + (-0.16, -0.18, -0.010), vp + (0.0, 0.18, 0.007), 'fabric', 0.008, 3,
                           xf=K.mat4_rot((1, 0, 0), -sy * 2.5, vp)))
    out['L'] = L
    out['C'] = C
    out['gauges'] = gauges
    return out


def strut_turret(xa, yc, r, z0, ztop, segs=18, mat='fabric'):
    """A rear strut's turret in the luggage area (left): a carpeted round housing from z0 up to its cap, the strut's
    top mount on the cap."""
    b = K.Buf()
    V, N, T = K.lathe(np.array([(r, 0.0), (r, ztop - z0 - 0.012), (r - 0.012, ztop - z0), (0.0, ztop - z0)]), (xa, yc, z0), (0, 0, 1), segs)
    b.add(V, N, T, mat)
    V, N, T = K.lathe(np.array([(0.047, 0.0005), (0.045, 0.004), (0.034, 0.005)]), (xa, yc, ztop), (0, 0, 1), 16)
    b.add(V, N, T, 'rubber')
    V, N, T = K.lathe(np.array([(0.034, 0.005), (0.031, 0.0065), (0.0, 0.0065)]), (xa, yc, ztop), (0, 0, 1), 16)
    b.add(V, N, T, 'steel')
    b.extend(K.cyl_buf((xa, yc, ztop + 0.006), (xa, yc, ztop + 0.0115), 0.0095, 'steel', 6))
    return b


def steering_mount():
    """(position of the steering wheel hub, column direction pointing forward-down)."""
    ang = math.radians(COLUMN_DEG)
    d = np.array([math.cos(ang), 0.0, -math.sin(ang)])
    p = np.array([0.13, DRIVER_Y, 0.745])
    return p, d


COLUMN_DEG = 22.0


def dashboard():
    """Low dash: a padded top running into the windscreen's base, a black fascia, the binnacle over the
    driver's small round-faced cluster (a big rev counter in the middle, the speedometer to its right, fuel and
    temperature stacked on its left), round vents at the ends and in the centre, the glovebox, the centre stack
    with the heater controls and the radio's slot. Returns (buf, gauge layout list)."""
    b = K.Buf()
    fx = DASH_FACE_X

    def pad_sec(y):
        # over the cluster the pad rises and reaches out into a brow that shades the dials
        ay = abs(y - DRIVER_Y)
        lift = 0.045 * float(K.sstep(0.27, 0.19, ay)) if y > 0 else 0.0
        brow = 0.040 * float(K.sstep(0.25, 0.18, ay)) if y > 0 else 0.0
        pts = np.array([(0.53, 0.835), (0.49, 0.862 + lift * 0.3), (0.42, 0.888 + lift), (fx + 0.005 - brow, 0.893 + lift),
                        (fx - 0.014 - brow, 0.880 + lift), (fx - 0.010 - brow, 0.858 + lift * 0.9), (fx + 0.012, 0.848), (0.53, 0.822)])
        return K.round_profile(pts, [0, 0.03, 0.03, 0.012, 0.01, 0.008, 0.01, 0], 1)
    ys = np.array([-0.66, -0.33, 0.0, 0.06, 0.09, 0.12, 0.15, 0.19, 0.34, 0.49, 0.53, 0.56, 0.59, 0.62, 0.66])
    b.extend(extrude_y(None, ys, 'plastic_int', inside=(0.45, 0.0, 0.86), sec_fn=pad_sec))
    # fascia under the roll
    fas = K.round_profile(np.array([(fx, 0.852), (fx, 0.60), (fx + 0.04, 0.565), (0.46, 0.565), (0.46, 0.852)]), [0, 0.03, 0.02, 0, 0], 2)
    b.extend(extrude_y(fas, np.linspace(-0.62, 0.62, 3), 'plastic_int', inside=(0.40, 0.0, 0.70)))
    for sy in (1.0, -1.0):
        b.extend(K.box_buf((fx - 0.004, min(sy * 0.62, sy * 0.69), 0.57), (0.50, max(sy * 0.62, sy * 0.69), 0.875), 'plastic_int', 0.02, 2))
    # glovebox lid and its button (passenger side)
    b.extend(K.box_buf((fx - 0.006, -0.56, 0.63), (fx + 0.004, -0.20, 0.78), 'plastic_int', 0.012, 2))
    b.extend(K.cyl_buf((fx - 0.006, -0.38, 0.76), (fx - 0.014, -0.38, 0.76), 0.009, 'chrome', 12))
    # the binnacle: a rounded box tilted towards the driver's eye with a deep hood over the dials
    eye = np.array(EYE)
    pc = np.array([fx - 0.010, DRIVER_Y, 0.788])
    dn = K.unit(eye - pc)
    dn = K.unit(np.array([dn[0], 0.0, dn[2]]))
    R = K.frame_from((0, 1, 0), dn)          # X = across (+y), Z = dial normal (its Y points down: U is up)
    U = -R[:, 1]
    M = K.mat4_trs(pc, R)
    b.extend(K.box_buf((-0.20, -0.075, -0.035), (0.20, 0.075, 0.0), 'plastic_int', 0.018, 3, xf=M))
    gauges = []
    for (gy, gz, r, name) in ((0.0, 0.0, 0.058, 'N_rpm'), (-0.122, -0.008, 0.046, 'N_speed'),
                              (0.112, 0.024, 0.024, 'N_fuel'), (0.112, -0.034, 0.024, 'N_temp')):
        c = pc + R[:, 0] * gy + U * gz
        db, g = dial(c, dn, r, r > 0.04, 'chrome')
        b.extend(db)
        g['name'] = name
        gauges.append(g)
    # telltale lamps over the gap between the rev counter and the speedometer
    for k, zz in enumerate((0.062, 0.046)):
        cc = pc + R[:, 0] * -0.066 + U * zz + dn * 0.0005
        V, N, T = K.lathe(np.array([(0.0, 0.0), (0.0045, 0.0)]), cc, dn, 10, prof_n=np.array([[0, 1.0], [0, 1.0]]))
        b.add(V, N, T, 'lens_amber' if k == 1 else 'emit')
    # round vents: ends and centre
    for vy, vz in ((0.635, 0.79), (-0.60, 0.80), (0.085, 0.815), (-0.085, 0.815)):
        c = np.array([fx - 0.002, vy, vz])
        V, N, T = K.lathe(np.array([(0.025, 0.0), (0.031, 0.005), (0.035, 0.003), (0.035, -0.006)])[::-1], c, (-1, 0, 0), 16)
        b.add(V, N, T, 'trim')
        V, N, T = K.lathe(np.array([(0.0, -0.012), (0.026, -0.012)]), c, (-1, 0, 0), 14, prof_n=np.array([[0, 1.0], [0, 1.0]]))
        b.add(V, N, T, 'trim')
        for k in range(-1, 2):
            b.extend(K.box_buf(c + (-0.011, -0.024, 0.009 * k - 0.0015), c + (-0.004, 0.024, 0.009 * k + 0.0015), 'trim', 0.0, 1))
    return b, gauges


def console():
    """Centre stack and console: the heater controls over the radio's slot (proud of the dash face), an ashtray,
    then down onto the tunnel with the gear lever's boot ring and the handbrake's slot."""
    b = K.Buf()
    sx = STACK_X
    rz = RADIO_Z
    rh, rw, rd = 0.031, 0.098, 0.16
    # the stack round the radio's slot: above it, below it and its two sides
    xb = DASH_FACE_X + 0.04
    b.extend(K.box_buf((sx, -0.115, rz + rh), (xb, 0.115, 0.79), 'plastic_int', 0.015, 2))
    b.extend(K.box_buf((sx, -0.115, 0.50), (xb, 0.115, rz - rh), 'plastic_int', 0.015, 2))
    for sy in (1.0, -1.0):
        b.extend(K.box_buf((sx, min(sy * rw, sy * 0.115), rz - rh - 0.002), (xb, max(sy * rw, sy * 0.115), rz + rh + 0.002), 'plastic_int', 0.004, 1))
    # heater sliders
    b.extend(K.box_buf((sx - 0.006, -0.085, 0.725), (sx + 0.002, 0.085, 0.765), 'trim', 0.004, 2))
    for k in range(3):
        yy = -0.05 + 0.05 * k
        b.extend(K.box_buf((sx - 0.018, yy - 0.006, 0.738), (sx - 0.006, yy + 0.006, 0.752), 'alu', 0.003, 2))
    # the radio's slot (the radio part sits in it): a dark tube 16 cm deep with a lip round its mouth
    mouth = np.array([(sx + 0.001, -rw, rz - rh), (sx + 0.001, rw, rz - rh), (sx + 0.001, rw, rz + rh), (sx + 0.001, -rw, rz + rh)])
    mouth = K.resample(mouth, 0.03, closed=True)
    b.extend(K.ring_tube(mouth, (1, 0, 0), rd, 1, 'trim'))
    b.extend(K.fill_loop(mouth + np.array([rd, 0.0, 0.0]), (-1, 0, 0), 'trim'))
    lip_out = K.resample(np.array([(sx - 0.002, -rw - 0.008, rz - rh - 0.008), (sx - 0.002, rw + 0.008, rz - rh - 0.008),
                                   (sx - 0.002, rw + 0.008, rz + rh + 0.008), (sx - 0.002, -rw - 0.008, rz + rh + 0.008)]), 0.03, closed=True)
    b.extend(K.fill_loop(lip_out, (-1, 0, 0), 'alu', holes=[mouth - np.array([0.003, 0.0, 0.0])]))
    # ashtray under it
    b.extend(K.box_buf((sx - 0.004, -0.06, 0.545), (sx + 0.002, 0.06, 0.58), 'trim', 0.004, 2))
    # the console on the tunnel, the gear lever's boot ring and the handbrake's slot
    tz = tunnel_h(GEAR_X) + 0.04
    b.extend(K.box_buf((GEAR_X - 0.08, -0.12, tz - 0.01), (sx + 0.02, 0.12, tz + 0.04), 'plastic_int', 0.015, 3))
    gz = tz + 0.04
    V, N, T = K.lathe(np.array([(0.0, 0.012), (0.03, 0.012), (0.052, 0.004), (0.064, 0.0)])[::-1], (GEAR_X, 0.0, gz), (0, 0, 1), 24)
    b.add(V, N, T, 'trim')
    hz = tunnel_h(HB_X) + 0.04
    b.extend(K.box_buf((HB_X - 0.18, -0.036, hz - 0.005), (GEAR_X - 0.08, 0.036, hz + 0.022), 'plastic_int', 0.008, 2))
    b.extend(K.box_buf((HB_X - 0.15, -0.012, hz + 0.018), (HB_X + 0.10, 0.012, hz + 0.0235), 'trim', 0.002, 1))
    return b


RADIO_Z = 0.665
