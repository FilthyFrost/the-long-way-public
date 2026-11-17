"""
ModCar's building kit: the pieces from which the game's assembler builds every roadside building (the filling
station's kiosk, the garage's workshop, the shop, the farmhouse and its shed, the works' house, the keeper's
cottage) out of its size and BuildingSpec (src/core/world/sites.ts), by placing, stretching and repeating them.
Made with the parts kit (tools/blender/parts/_kit.py) like the parts, the items and the machines:

    blender -b --factory-startup --python tools/blender/build.py -- places/kit [<piece>|all] [--toon] [--norender]

Writes public/models/modcar/places/kit/<piece>.glb (not parts_geo.json): root mesh PART, conventional material
names only (`paint` = the building's wall colour, `paint_b` = its trim colour, both chosen per building), AO
baked into the vertex colour 'Col'. Previews: D:/modcar-scratch/kit/<piece>_toon_a.png (--toon).
Check them with places/kit_verify; places/kit_test assembles sample buildings from them as the game would and
renders them (it is the reference assembler: the placing rules are written out there).

FRAME of every piece (metres): X along the wall (or the ridge), Y through the wall with the OUTSIDE towards -Y,
Z up; the game frame is game(x, y, z) = blender(x, z, -y) as for every ModCar model. Unless a piece says
otherwise its origin is the bottom centre, and pieces that belong to a wall have Y = 0 on the wall's middle
plane (so they are placed at the wall's line, the bounds below give where they reach).

PIECES (bounds in the piece's frame; S = the game stretches that axis, R = it repeats along it in 1.0 m modules;
a piece marked R tiles seamlessly end to end, and so do all the X-stretched bands, which are plain extrusions):

  wall          X -.5..+.5  Y -.12..+.12  Z 0..1     S XZ   plaster both faces (paint); no bevels: every edge of
                                                             it is covered by a corner, jamb, lintel, sill, plinth
                                                             or cornice
  plinth        X -.5..+.5  Y -.20..+.10  Z 0..0.40  S X    base band, 8 cm proud of the wall face (paint_b)
  cornice       X -.5..+.5  Y -.21..+.11  Z 0..0.14  S X    moulded band under the eaves, 9 cm proud; its top
                                                             front edge is square (the roof rests on it)
  corner        X/Y +-.15                 Z 0..1     S Z    corner post (paint_b), 3 cm proud both ways
  jamb          X +-.05     Y +-.15       Z 0..1     S Z    opening side (paint_b), 3 cm proud both sides
  lintel        X -.5..+.5  Y +-.15       Z 0..0.16  S X
  sill          X -.5..+.5  Y -.20..+.14  Z 0..0.07  S X    window sill, 8 cm out, 2 cm into the room
  win           X -.5..+.5  Y +-.05       Z 0..1     S XZ   frame + one mullion + one transom (at 0.55) +
                                                             glass (paint_b frame)
  shutter       X 0..0.5    Y +-.025      Z 0..1     S XZ   board shutter, hinge at X = 0; boards on -Y,
                                                             ledges, brace and straps on +Y (show it open)
  door_wood     X 0..1      Y +-.025      Z 0..2.05  S X    leaf; hinge edge at X = 0 (knuckles there), handles
  door_shop     X 0..1      Y +-.025      Z 0..2.10  S X    on both faces at the far edge; they swing about Z.
  door_shed     X 0..1      Y +-.025      Z 0..2.00  S X    (handles, bars and straps stand off the leaf in Y)
  gate_box      X -.5..+.5  Y +-.20       Z 0..0.45  S X    roller-shutter box (paint_b, steel end caps)
  gate_rail     X +-.04     Y +-.06       Z 0..1     S Z    U channel open towards +X (turn 180 deg for the
                                                             right-hand rail)
  gate_shutter  X -.5..+.5  Y +-.03       Z 0..1     S XZ R Z  slats every 0.1 m: repeat it up (it tiles in Z)
  gate_bar      X -.5..+.5  Y +-.04       Z 0..0.08  S X    the shutter's bottom rail with its rubber seal
  roof_slope    X -.5..+.5  Y 0..1        Z -.12..1.06  R X, S Y + shear  one slope of corrugated steel:
                                                             underside z = y, from the eave (y 0) to the ridge
                                                             (y 1), 8 corrugations a module running down the
                                                             slope, crests 0.06 above the underside, its ends at
                                                             the middle of a flank (seams match); fascia (paint_b)
                                                             under the eave down to z -0.12. Placed with a scale
                                                             and a shear (z' = z + (rise - 1) y): its thickness,
                                                             corrugation and fascia keep their sizes
  roof_slope_rust                                            the same with a rust patch along the eave and runs
                                                             (mix about 1 module in 5)
  ridge         X -.5..+.5  Y +-.15       Z 0..0.15  R X    ridge cap, flanges at 1:2
  gable_end     X +-.12     Y -.5..+.5    Z 0..1     S YZ   plaster triangle, apex at Y 0
  mono_end      X +-.12     Y -.5..+.5    Z 0..1     S YZ   plaster right triangle: height 0 at Y -0.5 (low
                                                             end), 1 at Y +0.5 (high end)
  roof_flat     X/Y +-.5                  Z 0..0.14  S XY   felt top (rubber), plaster underside (paint): a
                                                             flat roof, or the ceiling under a pitched roof
  parapet       X -.5..+.5  Y +-.12       Z 0..0.45  S X    plaster with a flush coping (paint_b)
  verge         X -.5..+.5  Y +-.05       Z 0..0.20  S X    barge board (paint_b): the board on -Y, the cap
                                                             (Z 0.16..0.20) reaching back to +Y over the roof
  post          X/Y +-.06                 Z 0..1     S Z    porch post (wood)
  beam          X -.5..+.5  Y +-.075      Z 0..0.20  S X    (wood)
  awning        X -.5..+.5  Y -1..0       Z 0..0.30  R X, S Y  striped (paint / paint_b, fabric hem), steel
                                                             frame; origin at the wall end (Y 0), bottom
  step          X/Y +-.5                  Z 0..0.15  S XY   (paint_b)
  chimney       X/Y +-.3                  Z 0..1.80         stone courses (paint_b), cap and pot (ceramic)
  floor         X/Y +-.5                  Z 0..0.14  S X, R XY  boards along X (wood): repeat it across Y
  floor_slab    X/Y +-.5                  Z 0..0.14  S XY   plain slab (paint_b): a workshop's, a kiosk's
  signboard     X -.5..+.5  Y +-.04       Z 0..0.60  S X    panel (paint) in a frame (paint_b); its back (+Y)
                                                             goes on the wall
  pict_<kind>   X +-.25     Y +-.01       Z 0..0.5          raised shapes (paint_b), no backing; centred in the
                                                             0.5 square: fuel, wrench, shop, house, camp, fish,
                                                             game, view, light, works

How the pieces go together (where the gable_end sits, the overhangs, the corners...) is written out in
places/kit_test.py, which is the assembler the game's follows.
"""
import math
import os

import bmesh
import bpy
from mathutils import Matrix

from parts import _kit as K
from parts._kit import V

OUT = 'public/models/modcar/places/kit'
SCRATCH = 'D:/modcar-scratch/kit'
K.SCRATCH = SCRATCH             # (the kit's previews go to the building kit's own scratch folder)
os.makedirs(SCRATCH, exist_ok=True)
TAU = math.tau

# the conventional material names (src/game/render/carMaterials.ts CAR_MATERIAL_NAMES)
MATERIALS = ('paint', 'paint_b', 'trim', 'chrome', 'steel', 'alu', 'rubber', 'glass', 'glass_dark', 'lens_head',
             'lens_tail', 'lens_amber', 'fabric', 'leather', 'wood', 'plastic_int', 'gauge', 'ceramic', 'rust',
             'emit', 'cap_oil', 'cap_water')

T = 0.24                        # wall thickness
HT = T / 2

# what the verify checks: bounds (lo, hi in the piece's frame), the axes it tiles along, the triangle budget;
# `leaf`: for doors the bounds are those of the leaf's materials (handles stand off it)
PICTS = ('fuel', 'wrench', 'shop', 'house', 'camp', 'fish', 'game', 'view', 'light', 'works')
SPECS = {
    'wall': dict(lo=(-0.5, -HT, 0), hi=(0.5, HT, 1.0), stretch='XZ'),
    'plinth': dict(lo=(-0.5, -0.20, 0), hi=(0.5, 0.10, 0.40), stretch='X', tile='X'),
    'cornice': dict(lo=(-0.5, -0.21, 0), hi=(0.5, 0.11, 0.14), stretch='X', tile='X'),
    'corner': dict(lo=(-0.15, -0.15, 0), hi=(0.15, 0.15, 1.0), stretch='Z', tile='Z'),
    'jamb': dict(lo=(-0.05, -0.15, 0), hi=(0.05, 0.15, 1.0), stretch='Z', tile='Z'),
    'lintel': dict(lo=(-0.5, -0.15, 0), hi=(0.5, 0.15, 0.16), stretch='X', tile='X'),
    'sill': dict(lo=(-0.5, -0.20, 0), hi=(0.5, 0.14, 0.07), stretch='X', tile='X'),
    'win': dict(lo=(-0.5, -0.05, 0), hi=(0.5, 0.05, 1.0), stretch='XZ'),
    'shutter': dict(lo=(0.0, -0.025, 0), hi=(0.5, 0.025, 1.0), stretch='XZ', hinge=True),
    'door_wood': dict(lo=(0.0, -0.025, 0), hi=(1.0, 0.025, 2.05), stretch='X', leaf=('wood', 'glass'), budget=2500,
                      hinge=True),
    'door_shop': dict(lo=(0.0, -0.025, 0), hi=(1.0, 0.025, 2.10), stretch='X', leaf=('alu', 'glass'), budget=2500,
                      hinge=True),
    'door_shed': dict(lo=(0.0, -0.025, 0), hi=(1.0, 0.025, 2.00), stretch='X', leaf=('wood',), budget=2500,
                      hinge=True),
    'gate_box': dict(lo=(-0.5, -0.20, 0), hi=(0.5, 0.20, 0.45), stretch='X'),
    'gate_rail': dict(lo=(-0.04, -0.06, 0), hi=(0.04, 0.06, 1.0), stretch='Z', tile='Z'),
    'gate_shutter': dict(lo=(-0.5, -0.03, 0), hi=(0.5, 0.03, 1.0), stretch='XZ', tile='XZ'),
    'gate_bar': dict(lo=(-0.5, -0.04, 0), hi=(0.5, 0.04, 0.08), stretch='X', tile='X'),
    'roof_slope': dict(lo=(-0.5, 0.0, -0.12), hi=(0.5, 1.0, 1.06), stretch='Y+shear', tile='X'),
    'roof_slope_rust': dict(lo=(-0.5, 0.0, -0.12), hi=(0.5, 1.0, 1.06), stretch='Y+shear', tile='X'),
    'ridge': dict(lo=(-0.5, -0.15, 0), hi=(0.5, 0.15, 0.15), tile='X'),
    'gable_end': dict(lo=(-HT, -0.5, 0), hi=(HT, 0.5, 1.0), stretch='YZ'),
    'mono_end': dict(lo=(-HT, -0.5, 0), hi=(HT, 0.5, 1.0), stretch='YZ'),
    'roof_flat': dict(lo=(-0.5, -0.5, 0), hi=(0.5, 0.5, 0.14), stretch='XY', tile='XY'),
    'parapet': dict(lo=(-0.5, -HT, 0), hi=(0.5, HT, 0.45), stretch='X', tile='X'),
    'verge': dict(lo=(-0.5, -0.05, 0), hi=(0.5, 0.05, 0.20), stretch='X', tile='X'),
    'post': dict(lo=(-0.06, -0.06, 0), hi=(0.06, 0.06, 1.0), stretch='Z', tile='Z'),
    'beam': dict(lo=(-0.5, -0.075, 0), hi=(0.5, 0.075, 0.20), stretch='X', tile='X'),
    'awning': dict(lo=(-0.5, -1.0, 0), hi=(0.5, 0.0, 0.30), stretch='Y', tile='X'),
    'step': dict(lo=(-0.5, -0.5, 0), hi=(0.5, 0.5, 0.15), stretch='XY'),
    'chimney': dict(lo=(-0.3, -0.3, 0), hi=(0.3, 0.3, 1.80), budget=2000),
    'floor': dict(lo=(-0.5, -0.5, 0), hi=(0.5, 0.5, 0.14), stretch='X', tile='XY'),
    'floor_slab': dict(lo=(-0.5, -0.5, 0), hi=(0.5, 0.5, 0.14), stretch='XY', tile='XY'),
    'signboard': dict(lo=(-0.5, -0.04, 0), hi=(0.5, 0.04, 0.60), stretch='X'),
}
for _k in PICTS:
    SPECS['pict_' + _k] = dict(lo=(-0.25, -0.01, 0), hi=(0.25, 0.01, 0.5), budget=600, fit=True)


def jit(k, a=0.0):
    """A fixed pseudo-random number in [-0.5, 0.5) (the same on every run)."""
    v = math.sin(k * 12.9898 + a * 78.233) * 43758.5453
    return (v - math.floor(v)) - 0.5


# ------------------------------------------------------------------------------------------------ helpers

def bm_extrude(bm, poly, axis, a0, a1, mat=0, caps=True):
    """
    A closed 2D polygon extruded between a0 and a1 along `axis`: 'x' takes (y, z) points, 'z' takes (x, y)
    points, 'y' takes (x, z). Every face gets material index `mat`; normals point out. Returns the faces.
    """
    def P3(p, a):
        if axis == 'x':
            return (a, p[0], p[1])
        if axis == 'y':
            return (p[0], a, p[1])
        return (p[0], p[1], a)
    A = [bm.verts.new(P3(p, a0)) for p in poly]
    B = [bm.verts.new(P3(p, a1)) for p in poly]
    n = len(poly)
    fs = [bm.faces.new((A[i], A[(i + 1) % n], B[(i + 1) % n], B[i])) for i in range(n)]
    if caps:
        fs.append(bm.faces.new(A))
        fs.append(bm.faces.new(B[::-1]))
    for f in fs:
        f.material_index = mat
    bmesh.ops.recalc_face_normals(bm, faces=fs)
    return fs


def band_x(P, name, prof, material, x0=-0.5, x1=0.5, sharp=30.0):
    """A (y, z) profile extruded along X: the stretched and repeated bands (no bevels of their own: the
    chamfers are in the profile, so stretching X never widens them)."""
    bm = bmesh.new()
    bm_extrude(bm, prof, 'x', x0, x1)
    return P.mesh(name, bm, material, sharp=sharp)


def post_z(P, name, poly, material, z0=0.0, z1=1.0, sharp=30.0):
    """An (x, y) outline extruded along Z (posts, jambs, rails: stretched in Z only)."""
    bm = bmesh.new()
    bm_extrude(bm, poly, 'z', z0, z1)
    return P.mesh(name, bm, material, sharp=sharp)


def chamfer_rect(w, h, c, cx=0.0, cy=0.0):
    """A w x h rectangle with its corners cut by c, counter-clockwise."""
    a, b = w / 2, h / 2
    pts = [(a - c, -b), (a, -b + c), (a, b - c), (a - c, b), (-a + c, b), (-a, b - c), (-a, -b + c), (-a + c, -b)]
    return [(cx + x, cy + y) for (x, y) in pts]


def grooved_square(s, c, gw, gd):
    """A square post outline with chamfered corners and a V groove down the middle of each face."""
    a = s / 2
    out = []
    for k in range(4):
        ang = math.pi / 2 * k
        ca, sa = math.cos(ang), math.sin(ang)

        def R(x, y):
            return (x * ca - y * sa, x * sa + y * ca)
        # the face at y = -a (turned by k quarters), walked from x = -a + c to a - c, then the chamfer
        out += [R(-gw / 2, -a), R(0.0, -a + gd), R(gw / 2, -a), R(a - c, -a), R(a, -a + c)]
    # (start the loop at a corner so the polygon is walked in one direction)
    return out


def bm_box(bm, size, center, mat=0):
    vs = K.bm_cube(bm, size, Matrix.Translation(center))
    fs = list({f for v in vs for f in v.link_faces})
    for f in fs:
        f.material_index = mat
    return fs


def grid_box(size, center, steps, mat=0):
    """A box as a bmesh, its faces cut into a grid (steps = the cell size along x, y, z, or 0)."""
    bm = bmesh.new()
    K.bm_cube(bm, size)
    for i in range(3):
        if not steps[i]:
            continue
        n = int(round(size[i] / steps[i])) - 1
        if n > 0:
            edges = [e for e in bm.edges if abs((e.verts[0].co - e.verts[1].co)[i]) > size[i] * 0.99]
            bmesh.ops.subdivide_edges(bm, edges=edges, cuts=n, use_grid_fill=True)
    K.bm_transform(bm, Matrix.Translation(center))
    for f in bm.faces:
        f.material_index = mat
    return bm


def slab(P, name, size, loc, material, bev=0.004, segs=1, sharp=30.0):
    """A plain box (no loop cuts along it, unlike Part.box: these are short-sighted AO-wise but cheap)."""
    bm = bmesh.new()
    K.bm_cube(bm, size, Matrix.Translation(loc))
    return P.mesh(name, bm, material, bev=bev, segs=segs, sharp=sharp)


def bevel_edges(bm, edges, w, segs=1):
    bmesh.ops.bevel(bm, geom=list(edges), offset=w, offset_type='OFFSET', segments=segs, profile=0.5,
                    affect='EDGES', clamp_overlap=True)


def plate_y(P, name, poly, y0, y1, material, bev=None, segs=1, sharp=30.0):
    """A flat plate in the XZ plane (poly = (x, z) points) from y0 to y1."""
    bm = bmesh.new()
    bm_extrude(bm, poly, 'y', y0, y1)
    o = P.mesh(name, bm, material, sharp=sharp)
    if bev:
        P.cfg[o.name]['bev'] = (bev, segs, 30.0)
    return o


# ------------------------------------------------------------------------------------------------ walls

def p_wall(P):
    """Plaster, both faces; it is only ever seen between the trims that hide its edges."""
    bm = bmesh.new()
    K.bm_cube(bm, (1.0, T, 1.0), Matrix.Translation((0, 0, 0.5)))
    P.mesh('wall', bm, 'paint', sharp=30.0)
    P.views = [('a', 35, 18)]


PLINTH = [(0.10, 0.0), (-0.19, 0.0), (-0.19, 0.145), (-0.181, 0.155), (-0.19, 0.165), (-0.19, 0.29),
          (-0.20, 0.30), (-0.20, 0.378), (-0.178, 0.40), (0.10, 0.40)]


def p_plinth(P):
    """A rendered base band in two courses with a coping: a groove along it, the cap stepping out a centimetre
    and chamfered (all along X: it stretches)."""
    band_x(P, 'plinth', PLINTH, 'paint_b')
    P.views = [('a', 35, 20)]


CORNICE = [(0.11, 0.0), (-0.155, 0.0), (-0.165, 0.01), (-0.165, 0.045), (-0.21, 0.075), (-0.21, 0.14), (0.11, 0.14)]


def p_cornice(P):
    """A moulded band: a fillet, a cove stepping out, the main band; its top front edge square, the line the
    roof's underside passes through."""
    band_x(P, 'cornice', CORNICE, 'paint_b')
    P.views = [('a', 35, 10)]


def p_corner(P):
    """A corner post with chamfered edges and a groove down each face (two boards, as the barn's)."""
    post_z(P, 'corner', grooved_square(0.30, 0.022, 0.012, 0.006), 'paint_b')
    P.views = [('a', 35, 20)]


def p_jamb(P):
    post_z(P, 'jamb', chamfer_rect(0.10, 0.30, 0.012), 'paint_b')
    P.views = [('a', 35, 20)]


def p_lintel(P):
    band_x(P, 'lintel', chamfer_rect(0.30, 0.16, 0.015, 0.0, 0.08), 'paint_b')
    P.views = [('a', 35, 20)]


SILL = [(0.14, 0.0), (-0.12, 0.0), (-0.12, 0.015), (-0.2, 0.015), (-0.2, 0.046), (-0.19, 0.056), (-0.12, 0.07),
        (0.14, 0.07)]


def p_sill(P):
    """The sill: its top falls to the outside, a nose 8 cm out, 2 cm into the room."""
    band_x(P, 'sill', SILL, 'paint_b')
    P.views = [('a', 35, 25)]


def p_win(P):
    """A frame with one mullion and one transom, the glass one sheet through it; the bars are thin (3 cm
    stiles, 3.5 cm rails) so that a shop window (x3.4, x1.6) still reads as a window."""
    P.ao_distance = 0.06
    fw, fh, d = 0.03, 0.035, 0.10
    slab(P, 'stile', (fw, d, 1.0), (-0.5 + fw / 2, 0, 0.5), 'paint_b')
    slab(P, 'stile', (fw, d, 1.0), (0.5 - fw / 2, 0, 0.5), 'paint_b')
    slab(P, 'rail', (1 - 2 * fw, d, fh), (0, 0, fh / 2), 'paint_b')
    slab(P, 'rail', (1 - 2 * fw, d, fh), (0, 0, 1 - fh / 2), 'paint_b')
    zt, mw, th = 0.55, 0.024, 0.028
    slab(P, 'mullion', (mw, 0.07, 1 - 2 * fh), (0, 0, 0.5), 'paint_b', bev=0.003)
    for s in (-1, 1):
        a, b = s * mw / 2, s * (0.5 - fw)
        slab(P, 'transom', (abs(b - a), 0.07, th), ((a + b) / 2, 0, zt), 'paint_b', bev=0.003)
    P.mesh('glass', grid_box((1 - 2 * fw + 0.01, 0.006, 1 - 2 * fh + 0.01), (0, 0, 0.5), (0.24, 0, 0.24)), 'glass',
           sharp=30.0)
    P.views = [('a', 35, 15)]


def p_shutter(P):
    """A board shutter: three boards (on -Y), two ledges and a brace on +Y with the strap hinges on them; the
    hinge at X = 0. Folded open against the wall its ledge side faces out."""
    P.ao_distance = 0.05
    xs = [(0.0, 0.163), (0.168, 0.332), (0.337, 0.5)]
    for i, (a, b) in enumerate(xs):
        P.box('board', (b - a, 0.025, 1.0), ((a + b) / 2, -0.0125, 0.5), 'wood', bev=0.004, segs=1)
    lz = (0.17, 0.83)
    for z in lz:
        P.box('ledge', (0.44, 0.02, 0.1), (0.25, 0.01, z), 'wood', bev=0.004, segs=1)
    # the brace from the lower ledge at the hinge side up to the upper ledge at the free side
    z0, z1 = lz[0] + 0.05, lz[1] - 0.05
    xa, xb, hw = 0.1, 0.4, 0.04
    poly = [(xa - hw, z0), (xa + hw, z0), (xb + hw, z1), (xb - hw, z1)]
    plate_y(P, 'brace', poly, 0.0, 0.018, 'wood', bev=0.003)
    # strap hinges on the ledges
    for z in lz:
        poly = [(0.004, z - 0.016), (0.24, z - 0.009), (0.27, z), (0.24, z + 0.009), (0.004, z + 0.016)]
        plate_y(P, 'strap', poly, 0.02, 0.0245, 'steel', bev=0.0015)
    P.views = [('a', 215, 15)]


# ------------------------------------------------------------------------------------------------ doors

def handle_lever(P, x, z, side, r=0.009):
    """A lever handle on its plate on one face (side = -1: the -Y face) at the lock edge x, the lever pointing
    back towards the hinge."""
    y0 = side * 0.025
    P.box('plate', (0.045, 0.006, 0.2), (x, y0 + side * 0.003, z - 0.04), 'steel', bev=0.002, segs=1)
    P.cyl('rose', 0.016, 0.012, (x, y0 + side * 0.012, z), 'steel', axis='Y', segs=14, bev=0.002, bsegs=1)
    P.tube('lever', [(x, y0 + side * 0.012, z), (x, y0 + side * 0.06, z), (x - 0.11, y0 + side * 0.066, z)], r,
           'steel', segs=10, bend=0.02)
    P.cyl('keyhole', 0.006, 0.004, (x, y0 + side * 0.0065, z - 0.11), 'trim', axis='Y', segs=10, bev=None)


def knuckles(P, zs, r=0.011, h=0.1, x=0.004):
    for z in zs:
        P.cyl('knuckle', r, h, (x, 0, z), 'steel', axis='Z', segs=10, bev=0.002, bsegs=1)


def p_door_wood(P):
    """A frame-and-panel house door: stiles and rails, two fielded panels below the lock rail, four panes in
    the upper half, three hinge knuckles on the hinge edge, a lever handle on each face."""
    P.ao_distance = 0.08
    H = 2.05
    sw = 0.11                                     # stile width
    t = 0.025
    slab(P, 'stile', (sw, 2 * t, H), (sw / 2, 0, H / 2), 'wood', bev=0.005)
    slab(P, 'stile', (sw, 2 * t, H), (1 - sw / 2, 0, H / 2), 'wood', bev=0.005)
    rails = [(0.0, 0.22), (0.95, 1.12), (1.94, H)]
    for (z0, z1) in rails:
        slab(P, 'rail', (1 - 2 * sw, 2 * t, z1 - z0), (0.5, 0, (z0 + z1) / 2), 'wood', bev=0.005)
    # the lower panels either side of a muntin
    mz0, mz1 = 0.22, 0.95
    P.box('muntin', (0.06, 2 * t, mz1 - mz0), (0.5, 0, (mz0 + mz1) / 2), 'wood', bev=0.005, segs=1)
    for (x0, x1) in ((sw, 0.47), (0.53, 1 - sw)):
        cx, cz = (x0 + x1) / 2, (mz0 + mz1) / 2
        P.box('panel', (x1 - x0 + 0.01, 0.018, mz1 - mz0 + 0.01), (cx, 0, cz), 'wood', bev=None)
        P.box('field', (x1 - x0 - 0.07, 0.034, mz1 - mz0 - 0.07), (cx, 0, cz), 'wood', bev=0.012, segs=1)
    # the glazed upper half: four panes in glazing bars
    gz0, gz1 = 1.12, 1.94
    P.mesh('glass', grid_box((1 - 2 * sw + 0.01, 0.006, gz1 - gz0 + 0.01), (0.5, 0, (gz0 + gz1) / 2), (0.2, 0, 0.2)),
           'glass', sharp=30.0)
    gm = (gz0 + gz1) / 2
    P.box('gbar', (0.026, 0.03, gz1 - gz0), (0.5, 0, gm), 'wood', bev=0.004, segs=1)
    for s in (-1, 1):
        a, b = 0.5 + s * 0.013, (sw if s < 0 else 1 - sw)
        P.box('gbar', (abs(b - a), 0.03, 0.026), ((a + b) / 2, 0, gm), 'wood', bev=0.004, segs=1)
    # hinges and handles
    knuckles(P, (0.25, 1.0, 1.8))
    for side in (-1, 1):
        handle_lever(P, 0.945, 1.04, side)
    P.views = [('a', 30, 12)]


def p_door_shop(P):
    """An aluminium shop door: narrow stiles, a deep bottom rail, one tall pane held by beads on both faces, a
    push bar across each face on two standoffs, steel kick plates, the lock cylinder, hinge knuckles."""
    P.ao_distance = 0.08
    H = 2.1
    t = 0.025
    sw, tr, br = 0.075, 0.075, 0.2
    slab(P, 'stile', (sw, 2 * t, H), (sw / 2, 0, H / 2), 'alu')
    slab(P, 'stile', (sw, 2 * t, H), (1 - sw / 2, 0, H / 2), 'alu')
    slab(P, 'rail', (1 - 2 * sw, 2 * t, tr), (0.5, 0, H - tr / 2), 'alu')
    slab(P, 'rail', (1 - 2 * sw, 2 * t, br), (0.5, 0, br / 2), 'alu')
    gx0, gx1, gz0, gz1 = sw, 1 - sw, br, H - tr
    P.mesh('glass', grid_box((gx1 - gx0 + 0.01, 0.006, gz1 - gz0 + 0.01), (0.5, 0, (gz0 + gz1) / 2), (0.2, 0, 0.3)),
           'glass', sharp=30.0)
    bw = 0.014
    for side in (-1, 1):
        yb = side * 0.008
        for (cx, cz, sx, sz) in (((gx0 + gx1) / 2, gz0 + bw / 2, gx1 - gx0, bw), ((gx0 + gx1) / 2, gz1 - bw / 2, gx1 - gx0, bw),
                                 (gx0 + bw / 2, (gz0 + gz1) / 2, bw, gz1 - gz0 - 2 * bw),
                                 (gx1 - bw / 2, (gz0 + gz1) / 2, bw, gz1 - gz0 - 2 * bw)):
            slab(P, 'bead', (sx, 0.01, sz), (cx, yb, cz), 'alu', bev=None)
        # the push bar on its standoffs, the kick plate, the lock
        yf = side * (t + 0.05)
        P.tube('push_bar', [(0.13, yf, 1.0), (0.87, yf, 1.0)], 0.016, 'steel', segs=12)
        for xs in (0.19, 0.81):
            P.tube('standoff', [(xs, side * t, 1.0), (xs, yf, 1.0)], 0.011, 'steel', segs=10)
        slab(P, 'kick', (1 - 2 * sw - 0.03, 0.003, 0.15), (0.5, side * (t + 0.0015), 0.105), 'steel', bev=None)
        P.cyl('lock', 0.014, 0.01, (1 - sw / 2, side * (t + 0.005), 1.18), 'steel', axis='Y', segs=10, bev=None)
        P.cyl('keyway', 0.004, 0.003, (1 - sw / 2, side * (t + 0.0105), 1.18), 'trim', axis='Y', segs=8, bev=None)
    knuckles(P, (0.3, 1.05, 1.85), r=0.01)
    P.views = [('a', 30, 12)]


def p_door_shed(P):
    """Rough boards of uneven widths with gaps, two ledges and a Z brace behind (+Y), rusty strap hinges on the
    front (-Y) at the ledges, a D pull in front and a thumb-latch bar behind at the far edge."""
    P.ao_distance = 0.08
    H = 2.0
    widths = [0.165, 0.158, 0.172, 0.160, 0.168, 0.177]
    x = 0.0
    for i, w in enumerate(widths):
        g = 0.003 if 0 < i else 0.0
        g2 = 0.003 if i < len(widths) - 1 else 0.0
        z0 = 0.0 if i in (0, 3) else 0.004 + 0.008 * (jit(i, 1.0) + 0.5)
        z1 = H if i in (1, 4) else H - 0.004 - 0.01 * (jit(i, 2.0) + 0.5)
        a, b = x + g, x + w - g2
        P.box('board', (b - a, 0.025, z1 - z0), ((a + b) / 2, -0.0125, (z0 + z1) / 2), 'wood', bev=0.005, segs=1)
        x += w
    ledges = [(0.16, 0.30), (1.70, 1.84)]
    for (z0, z1) in ledges:
        P.box('ledge', (0.93, 0.025, z1 - z0), (0.5, 0.0125, (z0 + z1) / 2), 'wood', bev=0.006, segs=1)
    # the brace: from the lower ledge at the hinge side up to the upper ledge at the latch side
    za, zb = ledges[0][1], ledges[1][0]
    xa, xb = 0.13, 0.87
    phi = math.atan2(zb - za, xb - xa)
    hw = 0.06 / math.sin(phi)
    poly = [(xa - hw, za), (xa + hw, za), (xb + hw, zb), (xb - hw, zb)]
    plate_y(P, 'brace', poly, 0.0, 0.022, 'wood', bev=0.005)
    # T hinges on the front at the ledges (rusty), their knuckles on the hinge edge
    for (z0, z1) in ledges:
        zc = (z0 + z1) / 2
        poly = [(0.006, zc - 0.025), (0.40, zc - 0.012), (0.43, zc), (0.40, zc + 0.012), (0.006, zc + 0.025)]
        plate_y(P, 'strap', poly, -0.0295, -0.0245, 'rust', bev=0.0015)
        P.cyl('knuckle', 0.012, 0.09, (0.004, -0.02, zc), 'rust', axis='Z', segs=12, bev=0.002, bsegs=1)
        for k in range(3):
            P.cyl('nail', 0.006, 0.006, (0.08 + 0.12 * k, -0.031, zc), 'rust', axis='Y', segs=8, bev=None)
    # a D pull on the front, a latch bar behind
    P.tube('pull', [(0.9, -0.025, 0.93), (0.9, -0.072, 0.96), (0.9, -0.072, 1.14), (0.9, -0.025, 1.17)], 0.0095,
           'steel', segs=10, bend=0.03)
    for zz in (0.93, 1.17):
        P.box('pull_plate', (0.035, 0.004, 0.05), (0.9, -0.027, zz), 'steel', bev=0.0015, segs=1)
    P.box('latch', (0.2, 0.008, 0.022), (0.86, 0.029, 1.05), 'steel', bev=0.002, segs=1)
    P.box('latch_lift', (0.02, 0.03, 0.02), (0.78, 0.04, 1.05), 'steel', bev=0.003, segs=1)
    P.views = [('a', 215, 12)]


# ------------------------------------------------------------------------------------------------ the gate

def p_gate_box(P):
    """The roller shutter's box: a back flat on the wall, a rounded front, end caps; the shutter comes out of
    its underside at Y = +0.14 (box frame)."""
    P.ao_distance = 0.08
    r = 0.13

    def section(g):
        """the box's outline grown by g (the end caps stand 5 mm proud of the box all round but the back)"""
        pts = [(0.20, 0.005 - g), (0.20, 0.445 + g), (-0.17 - g, 0.445 + g), (-0.195 - g, 0.42 + g), (-0.195 - g, r)]
        for k in range(1, 7):
            a = math.pi + (math.pi / 2) * k / 6
            pts.append((-0.065 + (r + g) * math.cos(a), r + (r - 0.005 + g) * math.sin(a)))
        return pts
    band_x(P, 'box', section(0.0), 'paint_b', x0=-0.49, x1=0.49, sharp=35.0)
    for s in (-1, 1):
        band_x(P, 'cap', section(0.005), 'steel', x0=min(s * 0.49, s * 0.5), x1=max(s * 0.49, s * 0.5), sharp=35.0)
    P.views = [('a', 35, 12)]


def p_gate_rail(P):
    """A U channel the shutter runs in, open towards +X, its web on the -X side."""
    poly = [(-0.04, -0.06), (0.04, -0.06), (0.04, -0.05), (-0.03, -0.05), (-0.03, 0.05), (0.04, 0.05), (0.04, 0.06),
            (-0.04, 0.06)]
    post_z(P, 'rail', poly, 'steel')
    P.views = [('a', 35, 20)]


def slat_profile(n=10):
    """The shutter's section (y, z): n slats a metre, each bulging between thin joints; it tiles in Z."""
    front, back = [], []
    for k in range(n):
        z0 = k / n
        for (f, y) in ((0.0, 0.012), (0.12, 0.024), (0.3, 0.03), (0.7, 0.03), (0.88, 0.024)):
            front.append((-y, z0 + f / n))
            back.append((y, z0 + f / n))
    front.append((-0.012, 1.0))
    back.append((0.012, 1.0))
    return front + back[::-1]


def p_gate_shutter(P):
    band_x(P, 'slats', slat_profile(), 'steel', sharp=40.0)
    P.views = [('a', 35, 15)]


def p_gate_bar(P):
    """The bottom rail: a steel bar with a chamfered top, the rubber seal under it."""
    prof = [(-0.04, 0.015), (0.04, 0.015), (0.04, 0.066), (0.026, 0.08), (-0.026, 0.08), (-0.04, 0.066)]
    band_x(P, 'bar', prof, 'steel')
    band_x(P, 'seal', [(-0.013, 0.0), (0.013, 0.0), (0.016, 0.016), (-0.016, 0.016)], 'rubber')
    P.views = [('a', 35, 15)]


# ------------------------------------------------------------------------------------------------ roofs

WAVES = 8                       # corrugations a module


def roof_top(x, y, t0=0.035, a=0.025):
    """The sheet's top over the plan point (x, y): crests 0.06 above the underside z = y; the module's ends
    are at the middle of a rising flank (the seam's normals then match the next module's)."""
    return y + t0 + a * (1 + math.sin(TAU * WAVES * (x + 0.5))) / 2


def p_roof_slope(P, rust=False):
    """
    One slope of corrugated sheet, the corrugations running down the slope (along Y) and tiling along X:
    underside flat on z = y (eave y = 0 to ridge y = 1), top corrugated, a fascia board (paint_b) under the
    eave. The rust variant has two streaks of rust running down from the ridge.
    """
    P.ao_distance = 0.12
    nx = WAVES * 4
    # (rows only where the rust needs them: the corrugation runs along Y, and the shear is affine)
    ny = 8 if rust else 2
    xs = [-0.5 + i / nx for i in range(nx + 1)]
    ys = [j / ny for j in range(ny + 1)]
    bm = bmesh.new()
    Tp = [[bm.verts.new((x, y, roof_top(x, y))) for x in xs] for y in ys]
    Bt = [[bm.verts.new((-0.5, y, y)), bm.verts.new((0.5, y, y))] for y in ys]
    rusty = set()
    if rust:
        # (columns of the corrugation, rows of 1/8 from the eave) the rust where water stands along the eave,
        # its top in broad steps (two columns at least: a thinner step inks as a dotted line from afar), two
        # runs up from it to leaking fixings, and a short run down from the lap under the ridge; it is a patch,
        # not a line, so it still reads when the slope is stretched; clean by the seams
        for (c0, c1, top) in ((4, 6, 1), (7, 8, 2), (9, 11, 4), (12, 13, 2), (14, 16, 1), (17, 19, 2), (20, 22, 3),
                              (23, 24, 2), (25, 27, 1)):
            rusty |= {(c, j) for c in range(c0, c1 + 1) for j in range(0, top)}
        rusty |= {(c, j) for c in range(13, 16) for j in range(6, ny)}
    for j in range(ny):
        for i in range(nx):
            f = bm.faces.new((Tp[j][i], Tp[j][i + 1], Tp[j + 1][i + 1], Tp[j + 1][i]))
            if (i, j) in rusty:
                f.material_index = 1
        bm.faces.new((Bt[j][0], Bt[j + 1][0], Bt[j + 1][1], Bt[j][1]))
        bm.faces.new((Tp[j][0], Tp[j + 1][0], Bt[j + 1][0], Bt[j][0]))
        bm.faces.new((Tp[j][nx], Bt[j][1], Bt[j + 1][1], Tp[j + 1][nx]))
    bm.faces.new(Tp[0] + [Bt[0][1], Bt[0][0]])
    bm.faces.new(Tp[ny] + [Bt[ny][1], Bt[ny][0]])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    P.mesh('sheet', bm, ['steel', 'rust'] if rust else 'steel', sharp=40.0)
    # the fascia board under the eave (thin in Y: the game stretches Y by the slope's run)
    bm = bmesh.new()
    bm_box(bm, (1.0, 0.008, 0.132), (0.0, 0.007, -0.054))
    P.mesh('fascia', bm, 'paint_b', sharp=30.0)
    P.views = [('a', 35, 32)]


def p_roof_slope_rust(P):
    p_roof_slope(P, rust=True)


def ridge_profile(grow=0.0):
    """The ridge cap's section (y, z): flanges at 1:2 into a round roll, a plate 1.2 cm thick (grow: the
    whole section offset outwards, for the lap band)."""
    th = 0.012
    yf, zf = 0.144, 0.006          # the flange's foot (centre line of the plate)
    yr = 0.06                      # where the flange runs into the roll
    zr = zf + 0.5 * (yf - yr)
    top = 0.146 - th / 2           # the centre line's top
    # the roll passes through (yr, zr) and tops out at `top`: r^2 = yr^2 + (zr - zc)^2 with zc = top - r
    r = (yr * yr + (zr - top) ** 2) / (2 * (top - zr))
    zc = top - r
    a0 = math.atan2(zr - zc, yr)
    mid = [(yf, zf), (yr, zr)]
    n = 8
    for k in range(1, n):
        a = a0 + (math.pi - 2 * a0) * k / n
        mid.append((r * math.cos(a), zc + r * math.sin(a)))
    mid += [(-yr, zr), (-yf, zf)]

    def offset(pts, d):
        """the centre line moved by d to the right of travel (up, outside: it runs from +y over to -y)"""
        out = []
        for i, p in enumerate(pts):
            a = V(pts[max(0, i - 1)])
            b = V(pts[min(len(pts) - 1, i + 1)])
            t = (b - a).normalized()
            nrm = V((t.y, -t.x))
            out.append((p[0] + nrm.x * d, p[1] + nrm.y * d))
        return out
    outer = offset(mid, th / 2 + grow)
    inner = offset(mid, -th / 2)
    return outer + inner[::-1]


def p_ridge(P):
    """The ridge cap: a rolled top on two flanges, a lap band in the middle of each module."""
    P.ao_distance = 0.05
    base = ridge_profile()
    band = ridge_profile(0.004)
    bm = bmesh.new()
    rings = [(-0.5, base), (-0.025, base), (-0.025, band), (0.025, band), (0.025, base), (0.5, base)]
    R = [[bm.verts.new((x, y, z)) for (y, z) in prof] for (x, prof) in rings]
    n = len(base)
    for k in range(len(R) - 1):
        for i in range(n):
            j = (i + 1) % n
            bm.faces.new((R[k][i], R[k][j], R[k + 1][j], R[k + 1][i]))
    bm.faces.new(R[0])
    bm.faces.new(R[-1][::-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    P.mesh('ridge', bm, 'steel', sharp=40.0)
    P.views = [('a', 35, 25)]


def p_gable_end(P):
    """The plaster triangle of a gable: base Y -0.5..0.5, apex at (0, 1), 0.24 thick across X."""
    bm = bmesh.new()
    bm_extrude(bm, [(-0.5, 0.0), (0.5, 0.0), (0.0, 1.0)], 'x', -HT, HT)
    P.mesh('gable', bm, 'paint', sharp=30.0)
    P.views = [('a', 60, 15)]


def p_mono_end(P):
    """The plaster right triangle on an end wall under a mono roof: 0 high at Y -0.5, 1 high at Y +0.5."""
    bm = bmesh.new()
    bm_extrude(bm, [(-0.5, 0.0), (0.5, 0.0), (0.5, 1.0)], 'x', -HT, HT)
    P.mesh('mono_end', bm, 'paint', sharp=30.0)
    P.views = [('a', 60, 15)]


def p_roof_flat(P):
    """A flat roof slab: felt on top and round the edge (rubber), the plaster ceiling under it (paint)."""
    bm = bmesh.new()
    K.bm_cube(bm, (1.0, 1.0, 0.14), Matrix.Translation((0, 0, 0.07)))
    bm.normal_update()
    for f in bm.faces:
        f.material_index = 1 if f.normal.z < -0.5 else 0
    P.mesh('slab', bm, ['rubber', 'paint'], sharp=30.0)
    P.views = [('a', 35, 30)]


def p_parapet(P):
    """A low plaster wall over a flat roof's edge with a flush coping (paint_b) pitched a little inwards."""
    bm = bmesh.new()
    K.bm_cube(bm, (1.0, T, 0.38), Matrix.Translation((0, 0, 0.19)))
    P.mesh('parapet', bm, 'paint', sharp=30.0)
    band_x(P, 'coping', [(-HT, 0.38), (HT, 0.38), (HT, 0.425), (0.105, 0.44), (-0.105, 0.45), (-HT, 0.435)], 'paint_b')
    P.views = [('a', 35, 20)]


VERGE = [(-0.05, 0.012), (-0.038, 0.0), (-0.015, 0.0), (-0.015, 0.16), (0.05, 0.16), (0.05, 0.19), (0.04, 0.2),
         (-0.035, 0.2), (-0.05, 0.185)]


def p_verge(P):
    """A barge board: the board on -Y (3.5 cm), its cap reaching back over the roof's edge (to +Y)."""
    band_x(P, 'verge', VERGE, 'paint_b')
    P.views = [('a', 35, 20)]


# ------------------------------------------------------------------------------------------------ porch, front

def p_post(P):
    post_z(P, 'post', chamfer_rect(0.12, 0.12, 0.02), 'wood')
    P.views = [('a', 35, 20)]


def p_beam(P):
    band_x(P, 'beam', chamfer_rect(0.15, 0.20, 0.02, 0.0, 0.1), 'wood')
    P.views = [('a', 35, 20)]


def p_awning(P):
    """
    A shop's awning, one metre of it (it tiles along X): four stripes (paint, paint_b) sloping from the wall
    bar down to the front bar, the valance hanging from it with a scallop to each stripe and a fabric hem, the
    steel frame (wall bar, front bar, an arm in the middle).
    """
    P.ao_distance = 0.08
    ns, sub = 4, 4
    nx = ns * sub
    xs = [-0.5 + i / nx for i in range(nx + 1)]
    vs = [k / 5 for k in range(6)]
    th = 0.006

    def can(x, v, dz=0.0):
        y = -0.03 + (-0.975 + 0.03) * v
        z = 0.29 + (0.12 - 0.29) * v - 0.048 * v * (1 - v)
        return (x, y, z + dz)
    bm = bmesh.new()
    # (the pattern is set half a stripe over: the module's ends fall in the middle of a stripe and of a
    # scallop, where the hem is smooth, so the seam matches)
    def stripe(i, per):
        return int(math.floor((i + 0.5) / per + 0.5)) % 2
    Tv = [[bm.verts.new(can(x, v)) for x in xs] for v in vs]
    Bv = [[bm.verts.new(can(x, v, -th)) for x in xs] for v in vs]
    for j in range(len(vs) - 1):
        for i in range(nx):
            m = stripe(i, sub)
            for f in (bm.faces.new((Tv[j][i], Tv[j][i + 1], Tv[j + 1][i + 1], Tv[j + 1][i])),
                      bm.faces.new((Bv[j][i], Bv[j + 1][i], Bv[j + 1][i + 1], Bv[j][i + 1]))):
                f.material_index = m
        for i in (0, nx):
            f = bm.faces.new((Tv[j][i], Tv[j + 1][i], Bv[j + 1][i], Bv[j][i]))
            f.material_index = 0
    for j in (0, len(vs) - 1):
        for i in range(nx):
            f = bm.faces.new((Tv[j][i], Bv[j][i], Bv[j][i + 1], Tv[j][i + 1]))
            f.material_index = stripe(i, sub)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    P.mesh('canvas', bm, ['paint', 'paint_b'], sharp=50.0)
    # the valance: a scallop to each stripe, its hem of fabric
    per = 10
    nv = ns * per
    vx = [-0.5 + i / nv for i in range(nv + 1)]
    yv0, yv1 = -0.993, -0.987

    def zb(x):
        u = ((x + 0.5) * ns + 0.5) % 1.0
        return 0.045 * (1 - math.sin(math.pi * u) ** 0.7)
    rows = [lambda x: 0.12, lambda x: zb(x) + 0.016, lambda x: zb(x)]
    bm = bmesh.new()
    F = [[bm.verts.new((x, yv0, r(x))) for x in vx] for r in rows]
    Bk = [[bm.verts.new((x, yv1, r(x))) for x in vx] for r in rows]
    for j in range(2):
        for i in range(nv):
            m = stripe(i, per) if j == 0 else 2
            for f in (bm.faces.new((F[j][i], F[j + 1][i], F[j + 1][i + 1], F[j][i + 1])),
                      bm.faces.new((Bk[j][i], Bk[j][i + 1], Bk[j + 1][i + 1], Bk[j + 1][i]))):
                f.material_index = m
        for i in (0, nv):
            f = bm.faces.new((F[j][i], Bk[j][i], Bk[j + 1][i], F[j + 1][i]))
            f.material_index = 0 if j == 0 else 2
    for i in range(nv):
        f = bm.faces.new((F[2][i], Bk[2][i], Bk[2][i + 1], F[2][i + 1]))
        f.material_index = 2
        f = bm.faces.new((F[0][i], F[0][i + 1], Bk[0][i + 1], Bk[0][i]))
        f.material_index = stripe(i, per)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    P.mesh('valance', bm, ['paint', 'paint_b', 'fabric'], sharp=50.0)
    # the frame
    P.cyl('front_bar', 0.015, 1.0, (0, -0.985, 0.12), 'steel', axis='X', segs=10, bev=None)
    band_x(P, 'wall_bar', chamfer_rect(0.03, 0.035, 0.004, -0.015, 0.2825), 'steel')
    P.tube('arm', [(0, -0.012, 0.045), (0, -0.965, 0.112)], 0.009, 'steel', segs=8)
    P.box('bracket', (0.05, 0.024, 0.07), (0, -0.012, 0.045), 'steel', bev=0.003, segs=1)
    P.views = [('a', 35, 20)]


def p_step(P):
    """A concrete step, its top edges chamfered."""
    bm = bmesh.new()
    K.bm_cube(bm, (1.0, 1.0, 0.15), Matrix.Translation((0, 0, 0.075)))
    bevel_edges(bm, [e for e in bm.edges if all(v.co.z > 0.149 for v in e.verts)], 0.012)
    P.mesh('step', bm, 'paint_b', sharp=30.0)
    P.views = [('a', 35, 25)]


def p_chimney(P):
    """
    A stone chimney: eight courses of four stones each laid round in a pinwheel (the joints alternate course by
    course), a corbel course, a cap slab and a clay pot.
    """
    P.ao_distance = 0.06
    S, L, W = 0.5, 0.33, 0.17
    h = 0.19
    for c in range(8):
        z0 = c * h
        pin = [((-S / 2, -S / 2 + L), (-S / 2, -S / 2 + W)), ((S / 2 - W, S / 2), (-S / 2, S / 2 - W + 0.0)),
               ((-S / 2 + W, S / 2), (S / 2 - W, S / 2)), ((-S / 2, -S / 2 + W), (-S / 2 + W, S / 2))]
        # (the pinwheel: front, right, back, left stones; mirrored every other course)
        for k, ((x0, x1), (y0, y1)) in enumerate(pin):
            if c % 2:
                x0, x1 = -x1, -x0
            sh = 0.004 * (jit(c * 4 + k, 3.0))
            dx, dy = 0.004 * jit(c * 4 + k, 5.0), 0.004 * jit(c * 4 + k, 7.0)
            size = (x1 - x0 - 0.002 + sh, y1 - y0 - 0.002 - sh, h - 0.002)
            P.box('stone', size, ((x0 + x1) / 2 + dx, (y0 + y1) / 2 + dy, z0 + h / 2), 'paint_b', bev=0.011, segs=1)
    zt = 8 * h
    P.box('corbel', (0.58, 0.58, 0.08), (0, 0, zt + 0.04), 'paint_b', bev=0.01, segs=1)
    P.box('cap', (0.6, 0.6, 0.06), (0, 0, zt + 0.11), 'ceramic', bev=0.012, segs=1)
    P.lathe('pot', [(0.0, zt + 0.14), (0.085, zt + 0.14), (0.075, 1.765), (0.088, 1.775), (0.088, 1.8), (0.062, 1.8),
                    (0.06, 1.74), (0.0, 1.74)], material='ceramic', segs=14, sharp=40.0)
    P.views = [('a', 35, 18)]


FLOOR_W = [0.12, 0.13, 0.125, 0.12, 0.13, 0.125, 0.12, 0.13]


def p_floor(P):
    """Boards along X with V joints (it tiles in X and in Y: repeat it across the room's depth)."""
    P.ao_distance = 0.02
    y = -0.5
    for w in FLOOR_W:
        y0, y1 = y, y + w
        prof = [(y0, 0.0), (y1, 0.0), (y1, 0.135), (y1 - 0.005, 0.14), (y0 + 0.005, 0.14), (y0, 0.135)]
        band_x(P, 'board', prof, 'wood')
        y += w
    P.views = [('a', 35, 35)]


def p_floor_slab(P):
    bm = bmesh.new()
    K.bm_cube(bm, (1.0, 1.0, 0.14), Matrix.Translation((0, 0, 0.07)))
    P.mesh('slab', bm, 'paint_b', sharp=30.0)
    P.views = [('a', 35, 30)]


# ------------------------------------------------------------------------------------------------ signs

def p_signboard(P):
    """A board in a frame: the panel (paint) set 1.5 cm back from the frame (paint_b); flat back on +Y."""
    P.ao_distance = 0.04
    f = 0.035
    P.box('panel', (1 - 2 * f, 0.065, 0.6 - 2 * f), (0, 0.0075, 0.3), 'paint', bev=None)
    P.box('frame', (1.0, 0.08, f), (0, 0, f / 2), 'paint_b', bev=0.006, segs=1)
    P.box('frame', (1.0, 0.08, f), (0, 0, 0.6 - f / 2), 'paint_b', bev=0.006, segs=1)
    for s in (-1, 1):
        P.box('frame', (f, 0.08, 0.6 - 2 * f), (s * (0.5 - f / 2), 0, 0.3), 'paint_b', bev=0.006, segs=1)
    P.views = [('a', 25, 10)]


# pictograms: shapes designed in a unit square round (0, 0), (x right, z up as seen from the front, -Y),
# united, cut, then fitted to the 0.5 square [-0.25, 0.25] x [0, 0.5]

def circle(cx, cz, r, n=20, a0=0.0):
    return [(cx + r * math.cos(a0 + TAU * i / n), cz + r * math.sin(a0 + TAU * i / n)) for i in range(n)]


def ellipse(cx, cz, rx, rz, n=24):
    return [(cx + rx * math.cos(TAU * i / n), cz + rz * math.sin(TAU * i / n)) for i in range(n)]


def rrect(cx, cz, w, h, r, seg=3):
    return [(cx + x, cz + y) for (x, y) in K.rounded_rect(w, h, r, seg=seg)]


def rect(x0, z0, x1, z1):
    return [(x0, z0), (x1, z0), (x1, z1), (x0, z1)]


def turned(poly, ang, cx=0.0, cz=0.0):
    c, s = math.cos(ang), math.sin(ang)
    return [(cx + (x - cx) * c - (z - cz) * s, cz + (x - cx) * s + (z - cz) * c) for (x, z) in poly]


def stroke(path, w0, w1=None):
    """The outline of a polyline drawn w0 wide (tapering to w1), its ends square."""
    w1 = w0 if w1 is None else w1
    pts = [V((x, z)) for (x, z) in path]
    n = len(pts)
    left, right = [], []
    for i, p in enumerate(pts):
        a = pts[max(0, i - 1)]
        b = pts[min(n - 1, i + 1)]
        t = (b - a).normalized()
        nrm = V((-t.y, t.x))
        w = (w0 + (w1 - w0) * i / max(1, n - 1)) / 2
        if 0 < i < n - 1:
            # keep the width at a bend (miter, limited)
            t1 = (p - pts[i - 1]).normalized()
            n1 = V((-t1.y, t1.x))
            k = max(0.6, nrm.dot(n1))
            w /= k
        left.append(tuple(p + nrm * w))
        right.append(tuple(p - nrm * w))
    return left + right[::-1]


def arc_band(cx, cz, r0, r1, a0, a1, n=16):
    outer = [(cx + r1 * math.cos(a0 + (a1 - a0) * k / n), cz + r1 * math.sin(a0 + (a1 - a0) * k / n)) for k in range(n + 1)]
    inner = [(cx + r0 * math.cos(a0 + (a1 - a0) * k / n), cz + r0 * math.sin(a0 + (a1 - a0) * k / n)) for k in range(n + 1)]
    return outer + inner[::-1]


def gear(cx, cz, r_root, r_tip, n, phase=0.0):
    pts = []
    for i in range(n):
        a0 = phase + TAU * i / n
        da = TAU / n
        for (f, r) in ((0.0, r_root), (0.18, r_tip), (0.5, r_tip), (0.68, r_root)):
            a = a0 + f * da
            pts.append((cx + r * math.cos(a), cz + r * math.sin(a)))
    return pts


def ccw(poly):
    a = sum(p[0] * q[1] - q[0] * p[1] for p, q in zip(poly, poly[1:] + poly[:1]))
    return list(poly) if a >= 0 else list(poly)[::-1]


PT = 0.02                       # pictogram thickness


def shape(P, poly, name='shape'):
    return plate_y(P, name, ccw(poly), -PT / 2, PT / 2, 'paint_b', bev=None)


def unite(P, objs):
    """Boolean union of plates (they share both faces' planes: one outline, no coplanar faces left)."""
    base = objs[0]
    for o in objs[1:]:
        m = base.modifiers.new('u', 'BOOLEAN')
        m.operation = 'UNION'
        m.solver = 'EXACT'
        m.object = o
        K.mc.apply_modifiers(base)
        P.statics.remove(o)
        bpy.data.objects.remove(o)
    return base


def hole(P, obj, poly):
    """Cut a hole of the outline poly right through a plate."""
    bm = bmesh.new()
    bm_extrude(bm, ccw(poly), 'y', -PT, PT)
    P.cut(obj, bm)


def fit_square(P, size=0.5):
    """Scale the pictogram in X and Z (not its thickness) so that its larger side is `size`, centred in the
    square [-size/2, size/2] x [0, size]."""
    lo, hi = [1e9, 1e9], [-1e9, -1e9]
    for o in P.statics:
        for v in o.data.vertices:
            for k, i in enumerate((0, 2)):
                lo[k] = min(lo[k], v.co[i])
                hi[k] = max(hi[k], v.co[i])
    s = size / max(hi[0] - lo[0], hi[1] - lo[1])
    cx, cz = (lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2
    m = Matrix.Translation((0, 0, size / 2)) @ Matrix.Diagonal((s, 1.0, s, 1.0)) @ Matrix.Translation((-cx, 0, -cz))
    for o in P.statics:
        o.data.transform(m)
        for c in P.cfg[o.name]['cutters']:
            c.data.transform(m)


def finish_pict(P, objs):
    fit_square(P)
    P.ao_distance = 0.012
    P.views = [('a', 72, 8)]


def p_pict_fuel(P):
    """A fuel pump: the body with its window, the base, the hose round to the nozzle on its hook."""
    body = shape(P, rrect(-0.08, -0.02, 0.5, 0.72, 0.06))
    base = shape(P, rect(-0.41, -0.46, 0.25, -0.38))
    hose = shape(P, stroke(K.fillet_path([(0.15, 0.22), (0.33, 0.22), (0.36, 0.16), (0.36, -0.24)], 0.05), 0.06))
    noz = shape(P, turned(rect(0.30, 0.22, 0.44, 0.30), -0.5, 0.33, 0.26))
    head = shape(P, rect(-0.36, 0.30, 0.20, 0.36))
    o = unite(P, [body, base, hose, noz, head])
    hole(P, o, rrect(-0.08, 0.13, 0.32, 0.18, 0.025))
    finish_pict(P, [o])


def p_pict_wrench(P):
    """An open-ended spanner on the diagonal: the jaw at the top right, a ring at the bottom left."""
    ang = math.radians(45)
    handle = shape(P, turned(rect(-0.07, -0.34, 0.07, 0.34), ang - math.pi / 2))
    jaw = shape(P, circle(0.27, 0.27, 0.17, 24))
    ring = shape(P, circle(-0.28, -0.28, 0.14, 24))
    o = unite(P, [handle, jaw, ring])
    hole(P, o, turned(rect(0.27 - 0.065, 0.27, 0.27 + 0.065, 0.62), -ang, 0.27, 0.27))
    hole(P, o, circle(0.27, 0.27, 0.065, 16))
    hole(P, o, circle(-0.28, -0.28, 0.065, 16))
    finish_pict(P, [o])


def p_pict_shop(P):
    """A shopping basket: a tapered body with two slots, the rim, the arched handle."""
    body = shape(P, [(-0.40, 0.10), (0.40, 0.10), (0.30, -0.40), (-0.30, -0.40)])
    rim = shape(P, rrect(0.0, 0.14, 0.94, 0.10, 0.02))
    handle = shape(P, arc_band(0.0, 0.14, 0.24, 0.31, 0.0, math.pi, 18))
    o = unite(P, [body, rim, handle])
    for z in (-0.07, -0.23):
        hole(P, o, rrect(0.0, z, 0.50 - (0.06 if z < -0.1 else 0.0), 0.07, 0.025))
    finish_pict(P, [o])


def p_pict_house(P):
    """A house: walls, a roof with eaves, a chimney, the door and a window cut out."""
    walls = shape(P, rect(-0.34, -0.44, 0.34, 0.08))
    roof = shape(P, [(-0.48, 0.02), (0.48, 0.02), (0.0, 0.44)])
    chim = shape(P, rect(0.17, 0.12, 0.29, 0.40))
    o = unite(P, [walls, roof, chim])
    hole(P, o, rect(-0.22, -0.45, -0.06, -0.12))
    hole(P, o, rect(0.06, -0.24, 0.22, -0.08))
    finish_pict(P, [o])


def p_pict_camp(P):
    """A tent with its door open, the pole tip over the ridge, the ground."""
    tent = shape(P, [(-0.46, -0.36), (0.46, -0.36), (0.0, 0.40)])
    pole = shape(P, rect(-0.016, 0.30, 0.016, 0.48))
    ground = shape(P, rect(-0.50, -0.46, 0.50, -0.38))
    o = unite(P, [tent, pole, ground])
    hole(P, o, [(-0.13, -0.37), (0.13, -0.37), (0.0, 0.0)])
    finish_pict(P, [o])


def p_pict_fish(P):
    """A fish swimming left: the body, the tail, a back fin; the eye cut out."""
    body = shape(P, ellipse(-0.08, 0.0, 0.33, 0.19, 28))
    tail = shape(P, [(0.17, 0.0), (0.46, 0.21), (0.40, 0.0), (0.46, -0.21)])
    fin = shape(P, [(-0.12, 0.15), (0.06, 0.15), (0.02, 0.27)])
    o = unite(P, [body, tail, fin])
    hole(P, o, circle(-0.26, 0.05, 0.035, 12))
    hole(P, o, stroke([(-0.17, 0.12), (-0.13, 0.0), (-0.17, -0.12)], 0.025))
    finish_pict(P, [o])


def p_pict_game(P):
    """A stag's antlers over its head: two beams curving up and out, three tines each."""
    parts = []
    for s in (-1, 1):
        def m(path):
            return [(s * x, z) for (x, z) in path]
        parts.append(shape(P, stroke(m([(0.06, -0.12), (0.12, -0.04), (0.19, 0.05), (0.26, 0.15), (0.30, 0.26),
                                        (0.31, 0.37), (0.28, 0.47)]), 0.075, 0.045)))
        for tine in ([(0.19, 0.03), (0.13, 0.18), (0.12, 0.27)], [(0.28, 0.17), (0.40, 0.27), (0.45, 0.38)],
                     [(0.30, 0.33), (0.21, 0.42), (0.17, 0.47)]):
            parts.append(shape(P, stroke(m(tine), 0.05, 0.03)))
    parts.append(shape(P, ellipse(0.0, -0.28, 0.11, 0.17, 14)))
    for s in (-1, 1):
        parts.append(shape(P, turned(ellipse(s * 0.15, -0.16, 0.09, 0.035, 8), s * 0.45, s * 0.15, -0.16)))
    o = unite(P, parts)
    finish_pict(P, [o])


def p_pict_view(P):
    """Binoculars: two barrels with their lenses cut out, the bridge, the eyepieces."""
    parts = [shape(P, rrect(s * 0.21, -0.06, 0.30, 0.46, 0.09)) for s in (-1, 1)]
    parts.append(shape(P, rect(-0.09, -0.02, 0.09, 0.12)))
    parts += [shape(P, rrect(s * 0.21, 0.24, 0.20, 0.14, 0.03)) for s in (-1, 1)]
    o = unite(P, parts)
    for s in (-1, 1):
        hole(P, o, circle(s * 0.21, -0.15, 0.095, 20))
    finish_pict(P, [o])


def p_pict_light(P):
    """A lighthouse: the tapered tower with a band cut across, the gallery, the lamp room and its dome, two
    beams of light either side."""
    tower = shape(P, [(-0.14, -0.40), (0.14, -0.40), (0.09, 0.16), (-0.09, 0.16)])
    base = shape(P, rect(-0.22, -0.46, 0.22, -0.39))
    gallery = shape(P, rect(-0.15, 0.16, 0.15, 0.21))
    lamp = shape(P, rect(-0.08, 0.21, 0.08, 0.33))
    dome = shape(P, [(0.08 * math.cos(math.pi * k / 10), 0.33 + 0.08 * math.sin(math.pi * k / 10)) for k in range(11)])
    o = unite(P, [tower, base, gallery, lamp, dome])
    hole(P, o, [(-0.14, -0.16), (0.14, -0.16), (0.14, -0.08), (-0.14, -0.08)])
    hole(P, o, rect(-0.04, 0.235, 0.04, 0.305))
    beams = [shape(P, [(s * 0.13, 0.27), (s * 0.48, 0.36), (s * 0.48, 0.18)]) for s in (-1, 1)]
    finish_pict(P, [o] + beams)


def p_pict_works(P):
    """Two gears meshing: a big one top left, a small one bottom right, each with its bore."""
    big = shape(P, gear(-0.12, 0.08, 0.26, 0.33, 10))
    small = shape(P, gear(0.27, -0.24, 0.15, 0.21, 7, phase=0.2))
    hole(P, big, circle(-0.12, 0.08, 0.1, 18))
    hole(P, small, circle(0.27, -0.24, 0.055, 14))
    finish_pict(P, [big, small])


PIECES = {
    'wall': p_wall,
    'plinth': p_plinth,
    'cornice': p_cornice,
    'corner': p_corner,
    'jamb': p_jamb,
    'lintel': p_lintel,
    'sill': p_sill,
    'win': p_win,
    'shutter': p_shutter,
    'door_wood': p_door_wood,
    'door_shop': p_door_shop,
    'door_shed': p_door_shed,
    'gate_box': p_gate_box,
    'gate_rail': p_gate_rail,
    'gate_shutter': p_gate_shutter,
    'gate_bar': p_gate_bar,
    'roof_slope': p_roof_slope,
    'roof_slope_rust': p_roof_slope_rust,
    'ridge': p_ridge,
    'gable_end': p_gable_end,
    'mono_end': p_mono_end,
    'roof_flat': p_roof_flat,
    'parapet': p_parapet,
    'verge': p_verge,
    'post': p_post,
    'beam': p_beam,
    'awning': p_awning,
    'step': p_step,
    'chimney': p_chimney,
    'floor': p_floor,
    'floor_slab': p_floor_slab,
    'signboard': p_signboard,
    'pict_fuel': p_pict_fuel,
    'pict_wrench': p_pict_wrench,
    'pict_shop': p_pict_shop,
    'pict_house': p_pict_house,
    'pict_camp': p_pict_camp,
    'pict_fish': p_pict_fish,
    'pict_game': p_pict_game,
    'pict_view': p_pict_view,
    'pict_light': p_pict_light,
    'pict_works': p_pict_works,
}
assert set(PIECES) == set(SPECS), set(PIECES) ^ set(SPECS)


def main(args):
    K.run(PIECES, args, out_dir=OUT, geo=False)
