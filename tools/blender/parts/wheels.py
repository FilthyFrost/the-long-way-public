"""
Rims and tyres (docs/MODCAR.md section 2.3).

    blender -b --factory-startup --python tools/blender/build.py -- parts/wheels [<id>|all|tyres|rims] [--norender]

Rims: origin at the wheel centre (= hub centre), axle along Blender Y, the outer (street) face towards +Y
(the LEFT side; the game mirrors for right-hand hubs). Each rim has the sub-mount empty M_tire at the wheel
centre (rim_dually: M_tire outer, M_tire2 inner). rim_cart has its own rubber and takes no tyre.
Tyres: origin at the wheel centre, axle along Y; the bead (inner radius) sits on the rim's bead seat.
Every tyre is generated for every rim that takes tyres: <tyre>@<rim>.glb; <tyre>.glb is the 13" preview.
"""
import math

import bmesh
import bpy
from mathutils import Matrix, Vector

from parts import _kit as K
from parts._kit import V, mat4

# bead-seat radius R, rim width w (between the flanges), flange height fh above R, flange thickness t
RIMS = {
    'rim_steel13': dict(R=0.165, w=0.13, fh=0.016, t=0.0035),
    'rim_alloy15': dict(R=0.19, w=0.17, fh=0.017, t=0.004),
    'rim_off16': dict(R=0.203, w=0.20, fh=0.018, t=0.004),
    'rim_moto18': dict(R=0.229, w=0.07, fh=0.011, t=0.003),
    'rim_truck19': dict(R=0.25, w=0.20, fh=0.020, t=0.0045),
    'rim_dually': dict(R=0.25, w=0.21, fh=0.020, t=0.0045),
}

# ----------------------------------------------------------------------------------------------- tyres
#
# A tread pattern: n pitches round the tyre, each split into rows at the fractions `fr`; the band across
# the crown is split at the lateral breakpoints `cols` (u = y / half tread width, |u| > 1 = over the
# shoulder); `cells` gives each band cell its kind: 'G' groove (never raised), 'R' rib (raised in every
# row), or a string of row indices that are raised ('0' = row 0, '02' = rows 0 and 2). For a side-specific
# pattern use a pair (outer, inner) [u > 0 is the outer side]. shear(u) shifts the rows round the tyre
# (in pitches), zig(row, col) shifts a breakpoint sideways (m).

TYRES = {
    'tire_road': dict(h=0.12, W=0.155, Tw=0.80, d=0.0085, c=0.006, n=30, fr=[0, 0.76],
                      cols=[-1.16, -1.0, -0.64, -0.53, -0.08, 0.08, 0.53, 0.64, 1.0, 1.16],
                      cells=['0', '0', 'G', 'R', 'G', 'R', 'G', '0', '0'],
                      walls=[(0.40, -0.004), (0.72, -0.002)],
                      shear=lambda u: 0.10 * u * u),
    'tire_whitewall': dict(h=0.12, W=0.16, Tw=0.76, d=0.0075, c=0.006, n=30, fr=[0, 0.84],
                           cols=[-1.12, -1.0, -0.72, -0.61, -0.27, -0.16, 0.16, 0.27, 0.61, 0.72, 1.0, 1.12],
                           cells=['0', '0', 'G', 'R', 'G', 'R', 'G', 'R', 'G', '0', '0'],
                           white=(0.22, 0.62)),
    'tire_offroad': dict(h=0.14, W=0.235, Tw=0.86, d=0.016, c=0.010, n=22, fr=[0, 0.5],
                         cols=[-1.26, -1.12, -1.0, -0.68, -0.56, -0.22, -0.1, 0.1, 0.22, 0.56, 0.68, 1.0, 1.12, 1.26],
                         cells=['0', '0', '0', 'G', '1', 'G', '01', 'G', '0', 'G', '1', '1', '1'],
                         shear=lambda u: 0.12 * u),
    'tire_tractor': dict(h=0.30, W=0.32, Tw=0.90, d=0.042, c=0.028, n=19, fr=[0, 0.36, 0.5, 0.86],
                         cols=[-1.34, -1.17, -1.0, -0.74, -0.48, -0.24, -0.05, 0.05, 0.24, 0.48, 0.74, 1.0, 1.17,
                               1.34],
                         cells=['2', '2', '2', '2', '2', '2', 'G', '0', '0', '0', '0', '0', '0'],
                         shear=lambda u: 0.95 * abs(u), chamfer=0.006),
    'tire_slick': dict(h=0.09, W=0.225, Tw=0.90, d=0.0, c=0.004, n=24, fr=[0, 0.5],
                       cols=[-1.08, -0.62, 0.0, 0.62, 1.08], cells=['G', 'G', 'G', 'G']),
    'tire_moto': dict(h=0.08, W=0.10, Tw=0.94, d=0.0055, c=0.034, n=18, fr=[0, 0.5],
                      cols=[-1.04, -0.72, -0.38, -0.06, 0.06, 0.38, 0.72, 1.04],
                      cells=['01', '1', '0', 'R', '1', '0', '01'],
                      shear=lambda u: 0.55 * u, round=True),
    'tire_snow': dict(h=0.12, W=0.175, Tw=0.82, d=0.0115, c=0.007, n=26, fr=[0, 0.8],
                      cols=[-1.18, -1.0, -0.64, -0.55, -0.22, -0.12, 0.12, 0.22, 0.55, 0.64, 1.0, 1.18],
                      cells=['0', '0', 'G', '0', 'G', '0', 'G', '0', 'G', '0', '0'],
                      zig=lambda k, j: (0.0035 if (k + j) % 2 else -0.0035) if j in (2, 3, 8, 9) else 0.0,
                      shear=lambda u: 0.18 * abs(u) + 0.08 * (1 if int((u + 2) * 3.0) % 2 else -1)),
    'tire_truck': dict(h=0.14, W=0.215, Tw=0.84, d=0.012, c=0.005, n=30, fr=[0, 0.5],
                       cols=[-1.12, -1.0, -0.66, -0.57, -0.24, -0.15, 0.15, 0.24, 0.57, 0.66, 1.0, 1.12],
                       cells=['01', '01', 'G', 'R', 'G', 'R', 'G', 'R', 'G', '01', '01'],
                       zig=lambda k, j: (0.0045 if k % 2 else -0.0045) if j in (2, 3, 4, 5, 6, 7, 8, 9) else 0.0,
                       notch=True),
}

TYRE_RIMS = ['rim_steel13', 'rim_alloy15', 'rim_off16', 'rim_moto18', 'rim_truck19', 'rim_dually']


def tyre_profile(T, R, wb, fh):
    """
    The section of the tyre as a closed loop of (y, r) points with tags, counter-clockwise in (r, y):
    returns (points, band_indices) where band points carry their u.
    """
    h = T['h']
    Ro = R + h
    Wt = max(T['W'], wb + 0.026)
    half = Wt / 2
    Tw = T['Tw'] * Wt
    tw2 = Tw / 2
    c = T['c']
    d = T['d']
    rnd = T.get('round', False)
    # outer side (y > 0) from the bead up to the shoulder (surface level)
    yb = wb / 2
    side = [
        (yb - 0.010, R, 'bead'),
        (yb - 0.0015, R + fh - 0.003, 'flange'),
        (yb + 0.0055, R + fh + 0.0035, 'flange'),
    ]
    walls = T.get('walls', [(0.34, -0.006), (0.56, 0.0), (0.80, -0.004)])
    for (f, dy) in walls:
        side.append((half + dy, R + f * h, 'wall'))
    # the band (lowered by d) across the crown; beyond the tread edge it follows an elliptic shoulder
    # from the edge E (phi = 0) towards the top of the sidewall W (phi = 90 deg)
    cols = T['cols']
    ex, er = tw2, Ro - c
    wx, wr = side[-1][0], side[-1][1]
    vmax = max(abs(x) for x in cols) - 1.0
    band = []
    for u in cols:
        au = abs(u)
        if au <= 1.0 or vmax <= 0:
            y = u * tw2
            r = Ro - c * au * au - d
        else:
            phi = (au - 1.0) / vmax * math.radians(58)
            sy = ex + (wx - ex) * math.sin(phi)
            sr = wr + (er - wr) * math.cos(phi)
            ny, nr = (er - wr) * math.sin(phi), (wx - ex) * math.cos(phi)
            ln = math.hypot(ny, nr) or 1.0
            y = math.copysign(sy - d * ny / ln, u)
            r = sr - d * nr / ln
        band.append((y, r, 'band', u))
    # assemble the loop: inner bead (y<0) -> inner side up -> band from y<0 to y>0 -> outer side down
    pts = []
    for (y, r, tag) in side:
        pts.append((-y, r, tag, None))
    pts.append(None)  # placeholder for the band
    for (y, r, tag) in reversed(side):
        pts.append((y, r, tag, None))
    i = pts.index(None)
    pts[i:i + 1] = band
    return pts, Ro, Wt


def build_tyre(P, tid, rim_id):
    T = TYRES[tid]
    rim = RIMS[rim_id]
    R, wb, fh = rim['R'], rim['w'], rim['fh']
    pts, Ro, Wt = tyre_profile(T, R, wb, fh)
    n, fr = T['n'], T['fr']
    rows = [(p, k) for p in range(n) for k in range(len(fr))]
    N = len(rows)
    if P.opts.get('stats'):
        print('  TYRE profile points', len(pts), 'rows', N, [p[2] for p in pts])
    pitch = math.tau / n
    shear = T.get('shear')
    zig = T.get('zig')
    # band column index for each profile point
    band_idx = [i for i, p in enumerate(pts) if p[2] == 'band']
    nb = len(band_idx)
    u_edges = [abs(pts[band_idx[0]][3]), abs(pts[band_idx[-1]][3])]
    bm = bmesh.new()
    grid = []  # grid[i_profile][i_row] -> vert
    for ip, (y, r, tag, u) in enumerate(pts):
        if tag == 'band':
            uu = u
        else:
            uu = -u_edges[0] if y < 0 else u_edges[1]
        sh = shear(uu) if shear else 0.0
        ring = []
        for ir, (p, k) in enumerate(rows):
            a = (p + fr[k] + sh) * pitch
            yy = y
            if zig and tag == 'band':
                yy = y + zig(ir, band_idx.index(ip))
            ring.append(bm.verts.new((r * math.cos(a), r * math.sin(a), yy)))
        grid.append(ring)
    M = len(pts)
    faces = {}
    for ip in range(M):
        jp = (ip + 1) % M
        for ir in range(N):
            jr = (ir + 1) % N
            f = bm.faces.new((grid[ip][ir], grid[ip][jr], grid[jp][jr], grid[jp][ir]))
            faces[(ip, ir)] = f
    bm.normal_update()
    # make sure the normals point out of the tyre
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    # whitewall: the outer side band of the sidewall
    if T.get('white'):
        lo, hi = T['white']
        for (ip, ir), f in faces.items():
            y0, r0 = pts[ip][0], pts[ip][1]
            y1, r1 = pts[(ip + 1) % M][0], pts[(ip + 1) % M][1]
            if y0 > 0 and y1 > 0 and pts[ip][2] != 'band' and pts[(ip + 1) % M][2] != 'band':
                rm = (r0 + r1) / 2
                if R + lo * T['h'] <= rm <= R + hi * T['h']:
                    f.material_index = 1
    # raise the tread blocks
    d = T['d']
    if d > 0:
        cells = T['cells']
        sel = []
        for ci in range(nb - 1):
            ip = band_idx[ci]
            kind = cells[ci]
            for ir, (p, k) in enumerate(rows):
                if kind == 'G':
                    continue
                if kind == 'R' or str(k) in kind:
                    sel.append(faces[(ip, ir)])
        # profile normal of each band point (for the direction of extrusion)
        nrm = {}
        for ci, ip in enumerate(band_idx):
            a = pts[band_idx[max(0, ci - 1)]]
            b = pts[band_idx[min(nb - 1, ci + 1)]]
            ty, tr = b[0] - a[0], b[1] - a[1]
            ln = math.hypot(ty, tr) or 1.0
            # outward normal of the crown: rotate the tangent (y, r) by 90 degrees towards +r
            ny, nr = -tr / ln, ty / ln
            if nr < 0:
                ny, nr = -ny, -nr
            nrm[round(pts[ip][0], 5)] = (ny, nr)
        res = bmesh.ops.extrude_face_region(bm, geom=sel)
        # the operator keeps the original faces (now hidden under the blocks): drop them
        bmesh.ops.delete(bm, geom=sel, context='FACES')
        new_verts = [g for g in res['geom'] if isinstance(g, bmesh.types.BMVert)]
        band_y = sorted(nrm.keys())
        for v in new_verts:
            # find the band column by its axial coordinate (zig offsets are small)
            yk = min(band_y, key=lambda q: abs(q - v.co.z))
            ny, nr = nrm[yk]
            rr = math.hypot(v.co.x, v.co.y)
            cx, cy = v.co.x / rr, v.co.y / rr
            v.co.x += cx * nr * d
            v.co.y += cy * nr * d
            v.co.z += ny * d
        if T.get('chamfer'):
            nv = set(new_verts)
            top = [f for f in res['geom'] if isinstance(f, bmesh.types.BMFace) and all(v in nv for v in f.verts)]
            top_set = set(top)
            edges = set()
            for f in top:
                for e in f.edges:
                    if any(lf not in top_set for lf in e.link_faces):
                        edges.add(e)
            bmesh.ops.bevel(bm, geom=list(edges), offset=T['chamfer'], offset_type='OFFSET', segments=1,
                            profile=0.5, affect='EDGES', clamp_overlap=True)
    # axle along Blender Y (lathe z -> +Y)
    K.bm_transform(bm, K.axis_matrix('Y'))
    mats = ['rubber', 'ceramic'] if T.get('white') else ['rubber']
    P.mesh('tyre', bm, mats, sharp=42.0)
    P.ao_distance = 0.08
    P.info.update({'radius': round(Ro, 4), 'inner_radius': R, 'width': round(Wt, 4),
                   'sidewall': round(Ro - R, 4), 'rim': rim_id})
    P.views = [('a', -38, 12), ('b', 8, 6)]


def tyre_builder(tid, rim_id):
    return lambda P: build_tyre(P, tid, rim_id)


def variants(P, tid):
    """Builds <tid>@<rim>.glb for every rim (no previews) and returns their geo entries."""
    entries = {}
    for rim_id in TYRE_RIMS:
        vid = f'{tid}@{rim_id}'
        Q = K.Part(vid, P.opts)
        build_tyre(Q, tid, rim_id)
        Q.finish()
        Q.export()
        entries[vid] = Q.geo_entry()
        print(f'PART {vid}: {Q.tris} tris')
    return entries


# ----------------------------------------------------------------------------------------------- rims


def barrel(P, R, w, fh, t, dc=0.026, well_off=0.012, segs=32, material='steel', lip_mat=None):
    """
    The rim barrel as a closed sheet section: flanges with rolled lips, bead seats and the drop-centre well.
    Outer face towards +Y. dc = well depth, well_off = the well's offset towards the outside.
    """
    hw = w / 2
    lip = 0.0032
    # outer surface (tyre side) from the outer lip to the inner lip, then the back surface
    sec = [
        # outer flange (rolled lip)
        (R + fh - lip, hw + t),
        (R + fh, hw + t * 0.2),
        (R + fh - lip * 1.3, hw - 0.0005),
        (R + 0.003, hw),                   # flange root
        (R, hw - 0.012),                   # bead seat
        (R - dc, hw - 0.022 - dc * 0.5),   # well wall
        (R - dc, -hw + 0.022 + dc * 0.5 + well_off),  # well floor
        (R, -hw + 0.012),
        (R + 0.003, -hw),
        (R + fh - lip * 1.3, -hw + 0.0005),
        (R + fh, -hw - t * 0.2),
        (R + fh - lip, -hw - t),
        # back surface (inside the wheel)
        (R - dc - t, -hw + 0.016 + dc * 0.5 + well_off),
        (R - dc - t, hw - 0.016 - dc * 0.5),
    ]
    prof = [(r, z) for (r, z) in sec]
    # loop must be counter-clockwise in (r, z): the list above runs clockwise, reverse it
    prof = list(reversed(prof))
    o = P.lathe('barrel', prof, material=material, axis='Y', segs=segs, loop=True, sharp=50.0)
    return o


def lug_nuts(P, n, pcd_r, y, r_nut=0.0105, h=0.016, material='chrome', a0=0.0, seat=True):
    """Hex lug nuts with a conical seat and a domed end, on the pitch circle pcd_r, sitting on y."""
    bm = bmesh.new()
    for i in range(n):
        a = a0 + math.tau * i / n
        cx, cz = pcd_r * math.cos(a), pcd_r * math.sin(a)
        base = Matrix.Translation((cx, y, cz)) @ K.axis_matrix('Y')
        if seat:
            K.bm_cyl(bm, r_nut * 1.15, h * 0.28, segs=8, r2=r_nut * 0.9,
                     matrix=base @ Matrix.Translation((0, 0, h * 0.14)))
        K.bm_cyl(bm, r_nut, h * 0.6, segs=6, matrix=base @ mat4((0, 0, h * 0.28 + h * 0.3), (0, 0, 30)))
        K.bm_cyl(bm, r_nut * 0.8, h * 0.14, segs=8, r2=r_nut * 0.5,
                 matrix=base @ Matrix.Translation((0, 0, h * 0.95)))
    return P.mesh('nuts', bm, material, sharp=50)


def valve(P, r, y, a=1.2):
    """Tyre valve stem poking out at radius r."""
    c, s = math.cos(a), math.sin(a)
    p0 = V((r * c, y - 0.01, r * s))
    p1 = V(((r - 0.006) * c, y + 0.022, (r - 0.006) * s))
    P.tube('valve', [p0, p1], 0.0042, 'rubber', segs=8, caps=True)
    P.cyl('vcap', 0.0034, 0.009, tuple(p1 + V((0, 0.004, 0))), 'chrome', axis='Y', segs=8, bev=None)


def build_rim_steel13(P):
    S = RIMS['rim_steel13']
    R, w, fh, t = S['R'], S['w'], S['fh'], S['t']
    barrel(P, R, w, fh, t, dc=0.024, well_off=0.010, segs=32, material='steel')
    # the pressed centre disc: mounting pad, a stiffening ring, ventilation slots, then it dishes into the well
    yf = 0.024  # mounting face (positive offset)
    th = 0.004
    prof = [(0.029, yf + th), (0.066, yf + th), (0.080, yf + 0.011), (0.094, yf + 0.011), (0.101, yf + 0.006),
            (0.123, yf - 0.008), (0.134, yf - 0.014), (0.143, yf - 0.016)]
    rings = [(r, z, z - th) for (r, z) in prof]
    ns = 32
    P.polar('disc', rings, lambda k: [math.tau * j / ns for j in range(ns)],
            hole=lambda k, j: k == 4 and j % 8 in (7, 0), material='steel', axis='Y')
    lug_nuts(P, 4, 0.05, yf + th, r_nut=0.0098, h=0.017, material='chrome', a0=math.radians(45))
    # small chrome hub cap
    cap = [(0.0, yf + 0.044), (0.019, yf + 0.041), (0.031, yf + 0.030), (0.0355, yf + 0.012), (0.033, yf + th)]
    P.lathe('cap', list(reversed(cap)), material='chrome', axis='Y', segs=20, close='start', sharp=50.0)
    valve(P, R - 0.012, yf - 0.020, a=math.radians(200))
    P.empty('M_tire', (0, 0, 0))
    P.info.update({'radius': R, 'width': w, 'tire': True})
    P.ao_distance = 0.06
    P.views = [('a', -52, 12), ('b', 160, 14)]


PARTS = {
    'rim_steel13': build_rim_steel13,
}
for _tid in TYRES:
    PARTS[_tid] = tyre_builder(_tid, 'rim_steel13')


DEFAULT_TYRE = {'rim_steel13': 'tire_road', 'rim_alloy15': 'tire_road', 'rim_off16': 'tire_offroad',
                'rim_moto18': 'tire_moto', 'rim_truck19': 'tire_truck', 'rim_dually': 'tire_truck'}


def import_glb(path):
    """Import a GLB (for previews): returns its mesh objects with their AO attribute renamed to 'Col'."""
    import bpy
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=path)
    objs = [o for o in bpy.data.objects if o not in before]
    for o in objs:
        if o.type == 'MESH':
            for a in o.data.color_attributes:
                if a.name != 'Col':
                    a.name = 'Col'
    return [o for o in objs if o.type == 'MESH']


def wheel_preview(P):
    """Render the rim with its default tyre mounted on M_tire (and M_tire2)."""
    import os
    tid = DEFAULT_TYRE.get(P.id)
    if not tid:
        return
    path = os.path.join(K.OUT_DIR, f'{tid}@{P.id}.glb')
    if not os.path.exists(path):
        print('no tyre for the preview:', path)
        return
    extra = []
    for e in P.empties:
        if e.name.startswith('M_tire'):
            objs = import_glb(path)
            for o in objs:
                if o.parent is None:
                    o.matrix_world = e.matrix_world @ o.matrix_world
            extra += objs
    K.render(P, views=[('a', -48, 10), ('b', 25, 6)], suffix='_wheel', extra_objs=extra)


def main(args):
    ids, opts = K.parse(args)
    if 'tyres' in ids:
        ids = [x for x in ids if x != 'tyres'] + list(TYRES)
    if 'rims' in ids:
        ids = [x for x in ids if x != 'rims'] + [k for k in PARTS if k.startswith('rim_')]
    if 'all' in ids:
        ids = list(TYRES) + [k for k in PARTS if k not in TYRES]
    rest = [a for a in args if a.startswith('--')]

    def after(P, o):
        if P.id in TYRES and not o.get('novariants'):
            K.write_geo(variants(P, P.id))
        if P.id in RIMS and not o.get('norender'):
            wheel_preview(P)

    K.run(PARTS, ids + rest, after=after)
