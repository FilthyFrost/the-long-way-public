"""
The filling station (docs/ND/PLAN.md, ND5): a prefab place of Nomad Drive's GasStation01 class (28.4 x 29.3 m, some
7 m to its sign; its shop's floor 0.16 m up, five double-sided metal shelves in it — faces 0.42 x 3.68 m, shelves at
0.85 and 1.37 m — and its counter (1.76 x 0.52 m); a garage bay beside it (5.2 x 6.1 m); an old store room behind a
door that may be found locked (25 %); a canopy over one pump on its island (1.6 x 3.2 m); a neon sign by the road
that comes on at six in the evening) in our own design:

    blender -b --factory-startup --python tools/blender/build.py -- nd/station [station] [--norender] [--noao] [--toon]

A roadside shop rendered cream (paint_b) on a dark plinth, the station's colour (paint) in the band under its capped
parapet and round its windows, a deep shop window and a glass door; the store room a lower annex with a tin awning
over its plank door; the garage bay open under a coloured lintel; the canopy's fascia striped in the station's colour
on four square columns; the pump a round-shouldered seventies pump whose nozzle (N_nozzle) the game takes off its
holster; the sign a box on a tall pole, its neon letters (N_lit_sign). A lamp's own glass that lights up with it is
the node N_lit_<lamp>. Its frame and its card: nd/_nd.py.
"""
import math

import bmesh
import bpy
from mathutils import Matrix, Vector

from parts import _kit as K
from parts._kit import V, mat4
from places import _common as C
from nd import _nd as N
from nd._nd import Face, face_box
from items import nd_fuel as F

TAU = math.tau
FL = 0.16                         # the shop's floor over the forecourt
G = -FL                           # the forecourt (the levelled ground) in the building's frame
T = 0.22                          # the shop's walls' thickness
SX0, SX1, SY0, SY1 = -6.0, 5.0, -11.0, -3.0     # the shop
GX1, GY1 = 10.2, -4.9                          # the garage bay (from the shop's east wall)
WX0, WY1 = -11.2, -8.4                         # the store room (from the shop's west wall)
HS, HG, HW = 3.3, 3.4, 2.8                     # walls' heights: shop, garage, store room
CX0, CX1, CY0, CY1, CZ = -8.2, 2.2, 1.2, 8.8, 4.3   # the canopy (its soffit's height over the floor)
PX, PY = -3.0, 5.0                             # the pump
SIGN = (11.6, 12.0)                            # the sign's pole


def jit(k, a=0.0):
    return C.jit(k, a)


def solid_wall(B, face, z0, z1, holes, mat, inner=None):
    """A wall of block on a face from z0 to z1 with its openings cut out (holes: (s0, s1, z0, z1)): boxes over the
    cells of the openings' grid that lie outside every opening; `inner` its inside's own coat (plaster)."""
    ss = sorted({0.0, face.L} | {h[0] for h in holes} | {h[1] for h in holes})
    zs = sorted({z0, z1} | {max(z0, min(z1, h[2])) for h in holes} | {max(z0, min(z1, h[3])) for h in holes})
    for i in range(len(ss) - 1):
        for j in range(len(zs) - 1):
            s0, s1, za, zb = ss[i], ss[i + 1], zs[j], zs[j + 1]
            if s1 - s0 < 1e-4 or zb - za < 1e-4:
                continue
            sm, zm = (s0 + s1) / 2, (za + zb) / 2
            if any(h[0] < sm < h[1] and h[2] < zm < h[3] for h in holes):
                continue
            face_box(B[mat], face, s0, s1, -face.t + (0.012 if inner else 0.0), 0.0, za, zb)
            if inner:
                face_box(B[inner], face, s0, s1, -face.t, -face.t + 0.012, za, zb)


def opening_trim(B, face, s0, s1, z0, z1, mat='paint', w=0.07):
    """A cased opening: its frame proud of the wall outside, its reveal through the wall."""
    face_box(B[mat], face, s0 - w, s0, 0.0, 0.03, z0, z1 + w)
    face_box(B[mat], face, s1, s1 + w, 0.0, 0.03, z0, z1 + w)
    face_box(B[mat], face, s0 - w, s1 + w, 0.0, 0.03, z1, z1 + w)
    for (a, b) in ((s0, s0 + 0.02), (s1 - 0.02, s1)):
        face_box(B[mat], face, a, b, -face.t, 0.0, z0, z1)
    face_box(B[mat], face, s0, s1, -face.t, 0.0, z1 - 0.02, z1)


def shop_window(B, face, s0, s1, z0, z1, mullions=2):
    """A shop window: a thin frame in the station's colour round big panes, a cream sill standing out under it."""
    opening_trim(B, face, s0, s1, z0, z1)
    face_box(B['paint_b'], face, s0 - 0.1, s1 + 0.1, -0.04, 0.09, z0 - 0.06, z0)
    om = -face.t * 0.5
    for k in range(mullions + 1):
        s = s0 + (s1 - s0) * k / mullions
        face_box(B['paint'], face, s - 0.025, s + 0.025, om - 0.03, om + 0.03, z0, z1)
    for z in (z0 + 0.02, z1 - 0.02):
        face_box(B['paint'], face, s0, s1, om - 0.03, om + 0.03, z - 0.025, z + 0.025)
    face_box(B['glass'], face, s0 + 0.02, s1 - 0.02, om - 0.004, om + 0.004, z0 + 0.04, z1 - 0.04)


def band(B, mat, face, o0, o1, z0, z1, gaps=()):
    """A band along a face (the plinth's, a cornice) broken at the openings that come down through it (gaps: (s0, s1))."""
    cuts = [-0.02] + [x for g in sorted(gaps) for x in g] + [face.L + 0.02]
    for k in range(0, len(cuts), 2):
        if cuts[k + 1] - cuts[k] > 1e-3:
            face_box(B[mat], face, cuts[k], cuts[k + 1], o0, o1, z0, z1)


def lit_panel(P, name, lamp, size, loc):
    """A lamp's diffuser (glass) as its own node N_lit_<lamp>: the game lights it with the lamp."""
    o = P.box(name, size, loc, 'glass', bev=None)
    P.mover(f'N_lit_{lamp}', [o], loc)


def gondola(P, B, card, name, x, y0, y1):
    """A double-sided metal shelf (Nomad Drive's metal shelf: two faces of 0.42 x 3.68 m, shelves at 0.85 and 1.37 m)
    along Y from y0 to y1 at x: a plinth, a pegboard spine, three shelves a side with their price rails, its end caps
    in the station's colour; its spots (two to a shelf, two shelves to a face)."""
    L = y1 - y0
    yc = (y0 + y1) / 2
    N.bm_box(B['trim'], (x, yc, 0.06), (0.86, L, 0.12))
    N.bm_box(B['paint_b'], (x, yc, 0.92), (0.05, L - 0.02, 1.64))
    for z in (0.3, 0.85, 1.37):
        for sg in (-1, 1):
            N.bm_box(B['paint_b'], (x + sg * 0.22, yc, z - 0.015), (0.4, L - 0.04, 0.03))
            N.bm_box(B['trim'], (x + sg * 0.42, yc, z + 0.02), (0.012, L - 0.04, 0.05))
    for y in (y0 + 0.02, y1 - 0.02):
        N.bm_box(B['paint_b'], (x, y, 0.85), (0.88, 0.04, 1.72))
        N.bm_box(B['paint'], (x, y + (0.024 if y > yc else -0.024), 1.62), (0.72, 0.012, 0.2))
    card.box(x - 0.44, x + 0.44, y0, y1, 0.0, 1.75)
    # (its shelves: what is put on them comes to rest there — the whole shelf keeps one out)
    for z in (0.3, 0.85, 1.37):
        for sg in (-1, 1):
            card.box(x + sg * 0.03, x + sg * 0.42, y0 + 0.04, y1 - 0.04, z - 0.03, z, floor=True)
    for f, sg in (('e', 1), ('w', -1)):
        for lv, z in (('m', 0.85), ('h', 1.37)):
            for k, t in enumerate((0.27, 0.73)):
                card.spot(f'{name}{f}{lv}{k}', x + sg * 0.22, y0 + L * t, z, 0 if sg > 0 else 180)


def pump(P, B, card):
    """A seventies fuel pump on its island: a cabinet in the station's colour with a round top, its dial face behind
    glass and the price wheels on both sides, the hose's root and the nozzle on its holster (N_nozzle; M_holster
    where it hangs, M_hose the hose's root, M_spout its tip and M_hosein where the hose goes into it)."""
    # the island: a raised curb striped at its ends, bollards
    N.bm_box(B['paint_b'], (PX, PY, G + 0.09), (1.6, 3.2, 0.18))
    for sg in (-1, 1):
        for k in range(4):
            N.bm_box(B['trim' if k % 2 else 'paint'], (PX - 0.6 + k * 0.4, PY + sg * 1.62, G + 0.09), (0.2, 0.04, 0.18))
        C.post(P, 'bollard', (PX, PY + sg * 1.85, G), (PX, PY + sg * 1.85, G + 0.9), 0.07, 'paint_b', segs=12)
        for z in (0.55, 0.75):
            C.post(P, 'bollard_band', (PX, PY + sg * 1.85, G + z), (PX, PY + sg * 1.85, G + z + 0.08), 0.073, 'paint', segs=12)
        card.post(PX, PY + sg * 1.85, 0.08, G, G + 0.9)
    card.box(PX - 0.8, PX + 0.8, PY - 1.6, PY + 1.6, G, G + 0.18, floor=True)
    z0 = G + 0.18
    # the cabinet and its round top
    N.bm_box(B['trim'], (PX, PY, z0 + 0.05), (0.66, 0.5, 0.1))
    N.bm_box(B['paint'], (PX, PY, z0 + 0.75), (0.6, 0.44, 1.3))
    P.cyl('shoulder', 0.22, 0.6, loc=(PX, PY, z0 + 1.4), material='paint', axis='X', segs=20)
    N.bm_box(B['paint_b'], (PX, PY, z0 + 1.25), (0.62, 0.46, 0.06))
    # its two faces (to ±X): the dial under glass, the price wheels, the badge
    for sg in (-1, 1):
        x = PX + sg * 0.305
        N.bm_box(B['paint_b'], (x, PY, z0 + 1.0), (0.02, 0.36, 0.42))
        N.bm_box(B['glass'], (x + sg * 0.012, PY, z0 + 1.0), (0.008, 0.3, 0.36))
        for k in range(4):
            N.bm_box(B['trim'], (x + sg * 0.006, PY - 0.09 + k * 0.06, z0 + 0.92), (0.01, 0.045, 0.07))
        P.cyl('dial', 0.12, 0.02, loc=(x + sg * 0.005, PY, z0 + 1.08), material='ceramic', axis='X', segs=20)
        N.bm_box(B['trim'], (x + sg * 0.016, PY + 0.03, z0 + 1.1), (0.006, 0.09, 0.008), Matrix.Rotation(0.6, 3, 'X'))
        P.cyl('badge', 0.11, 0.02, loc=(x + sg * 0.01, PY, z0 + 1.48), material='paint_b', axis='X', segs=20)
        N.bm_box(B['trim'], (x + sg * 0.005, PY, z0 + 0.45), (0.02, 0.3, 0.3))
    # the holster on its +Y end, the hose's root over it
    hy = PY + 0.23
    N.bm_box(B['trim'], (PX, hy + 0.04, z0 + 0.95), (0.14, 0.08, 0.2))
    P.empty('M_hose', loc=(PX, hy + 0.06, z0 + 1.32))
    C.post(P, 'hose_root', (PX, hy - 0.02, z0 + 1.32), (PX, hy + 0.06, z0 + 1.32), 0.035, 'trim', segs=10)
    # the nozzle hanging in its holster, its spout down in it and its hose's end up under the root (the game takes
    # it): the one held in the hands, the same shapes (items/nd_fuel.py), its body dark, its cap and grip cream
    at = (PX, hy + 0.075, z0 + 1.12)
    M = Matrix.Translation(at) @ Matrix.Rotation(math.pi / 2, 4, 'Z') @ Matrix.Rotation(math.pi / 2, 4, 'Y') @ Matrix.Translation((F.SHIFT, 0.0, 0.0))
    parts = F.nozzle_parts(P, M, body='trim', cap='paint_b')
    P.empty('M_holster', loc=at)
    P.empty('M_spout', loc=tuple(M @ V(F.SPOUT)))
    P.empty('M_hosein', loc=tuple(M @ V(F.HOSE_IN)))
    P.mover('N_nozzle', parts, at)
    card.box(PX - 0.34, PX + 0.34, PY - 0.26, PY + 0.26, z0, z0 + 1.65)


def canopy(P, B, card):
    """The canopy over the island: four square columns, a deep fascia striped in the station's colour, its soffit
    with two light panels (lit at night with the sign)."""
    cols = [(CX0 + 0.6, CY0 + 0.6), (CX1 - 0.6, CY0 + 0.6), (CX0 + 0.6, CY1 - 0.6), (CX1 - 0.6, CY1 - 0.6)]
    for (x, y) in cols:
        N.bm_box(B['paint_b'], (x, y, (G + CZ) / 2), (0.32, 0.32, CZ - G))
        N.bm_box(B['trim'], (x, y, G + 0.2), (0.36, 0.36, 0.4))
        card.box(x - 0.18, x + 0.18, y - 0.18, y + 0.18, G, CZ)
    # the roof slab and the soffit under it; the fascia round them: a coloured band, a cream one, a dark cap
    N.bm_box(B['trim'], ((CX0 + CX1) / 2, (CY0 + CY1) / 2, CZ + 0.45), (CX1 - CX0 - 0.1, CY1 - CY0 - 0.1, 0.1))
    N.bm_box(B['paint_b'], ((CX0 + CX1) / 2, (CY0 + CY1) / 2, CZ + 0.02), (CX1 - CX0 - 0.1, CY1 - CY0 - 0.1, 0.04))
    for (a, b, c, d) in ((CX0, CX1, CY0, CY0), (CX0, CX1, CY1, CY1), (CX0, CX0, CY0, CY1), (CX1, CX1, CY0, CY1)):
        horiz = c == d
        sx, sy = (b - a + 0.1, 0.08) if horiz else (0.08, d - c + 0.1)
        cx, cy = ((a + b) / 2, c) if horiz else (a, (c + d) / 2)
        N.bm_box(B['paint'], (cx, cy, CZ + 0.16), (sx, sy, 0.34))
        N.bm_box(B['paint_b'], (cx, cy, CZ + 0.47), (sx + (0.0 if horiz else 0.004), sy + (0.004 if horiz else 0.0), 0.28))
        N.bm_box(B['trim'], (cx, cy, CZ + 0.63), (sx + 0.02, sy + 0.02, 0.04))
    for k, x in enumerate((CX0 + 2.6, CX1 - 2.6)):
        N.bm_box(B['trim'], (x, (CY0 + CY1) / 2, CZ - 0.015), (1.4, 0.5, 0.03))
        lit_panel(P, f'canopy_panel_{k}', f'canopy_{"ab"[k]}', (1.3, 0.42, 0.012), (x, (CY0 + CY1) / 2, CZ - 0.032))
        card.lamp(f'canopy_{"ab"[k]}', x, (CY0 + CY1) / 2, CZ - 0.05, 9.0, warm=False, hours=(18, 6))
    card.spot('roof_a', CX0 + 1.5, CY1 - 1.2, CZ + 0.5, 30)


def neon_text(P, text, at, face, size):
    """Neon letters: the text as tubes standing off a face (its normal along +X turned by `face` radians about Z),
    in the first font that has them (Microsoft YaHei, SimHei; Blender's own has no Chinese)."""
    font = None
    for path in ('C:/Windows/Fonts/msyhbd.ttc', 'C:/Windows/Fonts/msyh.ttc', 'C:/Windows/Fonts/simhei.ttf'):
        try:
            font = bpy.data.fonts.load(path, check_existing=True)
            break
        except Exception:
            continue
    cu = bpy.data.curves.new('neon', 'FONT')
    cu.body = text
    if font:
        cu.font = font
    cu.size = size
    cu.align_x = 'CENTER'
    cu.align_y = 'CENTER'
    cu.extrude = 0.025
    cu.offset = 0.008
    # (a tube's curves in a few steps: a sign's letters some thousand faces, not ten)
    cu.resolution_u = 3
    ob = bpy.data.objects.new('neon_text', cu)
    bpy.context.scene.collection.objects.link(ob)
    ob.matrix_world = Matrix.Translation(at) @ Matrix.Rotation(face + math.pi / 2, 4, 'Z') @ Matrix.Rotation(math.pi / 2, 4, 'X')
    bpy.context.view_layer.update()
    me = bpy.data.meshes.new_from_object(ob.evaluated_get(bpy.context.evaluated_depsgraph_get()))
    me.transform(ob.matrix_world)
    bpy.data.objects.remove(ob)
    bm = bmesh.new()
    bm.from_mesh(me)
    bpy.data.meshes.remove(me)
    if not bm.faces:
        raise RuntimeError(f'neon {text!r}: no font with its letters')
    return P.mesh('neon', bm, 'glass', sharp=30.0)


def sign(P, B, card):
    """The sign by the road: a tall pole, a box on it in the station's colour faced cream, its neon letters on both
    faces (N_lit_sign: lit with the lamp `sign`, from six in the evening)."""
    sx, sy = SIGN
    C.post(P, 'sign_pole', (sx, sy, G), (sx, sy, G + 6.2), 0.12, 'steel', segs=12)
    N.bm_box(B['trim'], (sx, sy, G + 0.15), (0.5, 0.5, 0.3))
    card.post(sx, sy, 0.14, G, G + 6.2)
    zc = G + 6.4
    N.bm_box(B['paint'], (sx, sy, zc), (0.36, 2.7, 1.3))
    for sg in (-1, 1):
        N.bm_box(B['paint_b'], (sx + sg * 0.185, sy, zc), (0.02, 2.5, 1.1))
    N.bm_box(B['trim'], (sx, sy, zc + 0.68), (0.4, 2.76, 0.06))
    N.bm_box(B['trim'], (sx, sy, zc - 0.68), (0.3, 0.5, 0.06))
    letters = [neon_text(P, '加油', (sx + sg * 0.235, sy, zc), 0.0 if sg > 0 else math.pi, 0.85) for sg in (-1, 1)]
    P.mover('N_lit_sign', letters, (sx, sy, zc))
    card.lamp('sign', sx, sy, zc, 14.0, hours=(18, 6), neon=True)


def shop(P, B, card):
    """The shop: its walls with the shop window and the glass door in front, the flat roof behind its parapet, the
    floor's tiles, its shelves, the counter along the east wall, the drinks cooler, the lights and their switch."""
    front = Face((SX0, SY1), (SX1, SY1), (0, 1), T)
    back = Face((SX1, SY0), (SX0, SY0), (0, -1), T)
    west = Face((SX0, SY0), (SX0, SY1), (-1, 0), T)
    east = Face((SX1, SY1), (SX1, SY0), (1, 0), T)
    door = (2.4, 3.5, 0.0, 2.2)          # along the front from its west end
    win_a = (4.1, 10.4, 0.55, 2.55)
    win_b = (0.4, 1.9, 0.55, 2.55)
    win_c = (5.0, 6.0, 1.6, 2.5)         # along the back from its east end
    solid_wall(B, front, G, HS, [door, win_a, win_b], 'paint_b', inner='paint_b')
    solid_wall(B, back, G, HS, [win_c], 'paint_b', inner='paint_b')
    solid_wall(B, west, G, HS, [], 'paint_b', inner='paint_b')
    solid_wall(B, east, G, HS, [], 'paint_b', inner='paint_b')
    shop_window(B, front, *win_a, mullions=3)
    shop_window(B, front, *win_b, mullions=1)
    shop_window(B, back, *win_c, mullions=1)
    opening_trim(B, front, *door)
    # the plinth band, the coloured band under the parapet, the parapet and its cap, the roof and the ceiling
    for f in (front, back, west, east):
        band(B, 'trim', f, 0.0, 0.03, G, 0.32, gaps=[(door[0] - 0.07, door[1] + 0.07)] if f is front else ())
        face_box(B['paint'], f, -0.02, f.L + 0.02, 0.0, 0.03, HS - 0.42, HS + 0.4)
        face_box(B['paint'], f, 0.0, f.L, -T, 0.0, HS, HS + 0.4)
        face_box(B['paint_b'], f, -0.05, f.L + 0.05, -T - 0.03, 0.06, HS + 0.4, HS + 0.47)
    N.bm_box(B['trim'], ((SX0 + SX1) / 2, (SY0 + SY1) / 2, HS - 0.02), (SX1 - SX0 - 0.1, SY1 - SY0 - 0.1, 0.12))
    N.bm_box(B['paint_b'], ((SX0 + SX1) / 2, (SY0 + SY1) / 2, HS - 0.1), (SX1 - SX0 - 2 * T, SY1 - SY0 - 2 * T, 0.03))
    card.spot('roof_b', SX0 + 2.0, SY0 + 2.5, HS + 0.05, 120)
    # the floor: cream tiles, dark ones laid over them in a check
    iw, idp = SX1 - SX0 - 2 * T, SY1 - SY0 - 2 * T
    N.bm_box(B['ceramic'], ((SX0 + SX1) / 2, (SY0 + SY1) / 2, -0.01), (iw, idp, 0.02))
    nx, ny = round(iw / 0.5), round(idp / 0.5)
    tw, td = iw / nx, idp / ny
    for i in range(nx):
        for j in range(ny):
            if (i + j) % 2:
                N.bm_box(B['trim'], (SX0 + T + (i + 0.5) * tw, SY0 + T + (j + 0.5) * td, 0.0015), (tw - 0.004, td - 0.004, 0.003))
    card.box(SX0, SX1, SY0, SY1, G - 0.5, 0.0, floor=True)
    # a step up at the door
    N.bm_box(B['paint_b'], (SX0 + 2.95, SY1 + 0.25, G + FL / 2), (1.6, 0.5, FL))
    card.box(SX0 + 2.15, SX0 + 3.75, SY1, SY1 + 0.5, G - 0.5, 0.0, floor=True)
    # the walls' solids (the door's gap)
    card.box(SX0, SX0 + 2.4, SY1 - T, SY1, G, HS + 0.4)
    card.box(SX0 + 3.5, SX1, SY1 - T, SY1, G, HS + 0.4)
    card.box(SX0 + 2.4, SX0 + 3.5, SY1 - T, SY1, 2.2, HS + 0.4)
    card.box(SX0, SX1, SY0, SY0 + T, G, HS + 0.4)
    card.box(SX0, SX0 + T, SY0, SY1, G, HS + 0.4)
    card.box(SX1 - T, SX1, SY0, SY1, G, HS + 0.4)
    # the shelves: five in a row across the back of the shop
    for k, x in enumerate((-4.4, -2.6, -0.8, 1.0, 2.8)):
        gondola(P, B, card, f'sh{k}', x, -10.35, -6.67)
    # the counter along the east wall, the clerk's floor behind it: its panelled front, its top, the till, a rack of
    # sweets; a shelf in it (under the counter)
    cx0, cx1, cy0, cy1 = 3.0, 3.52, -5.8, -4.04
    cx, cy = (cx0 + cx1) / 2, (cy0 + cy1) / 2
    N.bm_box(B['paint'], (cx, cy, 0.5), (cx1 - cx0, cy1 - cy0, 1.0))
    N.bm_box(B['paint_b'], (cx0 - 0.01, cy, 0.5), (0.02, cy1 - cy0 - 0.1, 0.8))
    N.bm_box(B['wood'], (cx - 0.02, cy, 1.02), (cx1 - cx0 + 0.1, cy1 - cy0 + 0.06, 0.04))
    N.bm_box(B['wood'], (cx + 0.08, cy, 0.32), (0.3, cy1 - cy0 - 0.1, 0.02))
    P.box('till', (0.32, 0.36, 0.16), (cx + 0.02, cy0 + 0.4, 1.12), 'trim', bev=0.02, segs=2)
    P.box('till_screen', (0.04, 0.24, 0.14), (cx + 0.12, cy0 + 0.4, 1.28), 'trim', rot=(0, -20, 0), bev=0.01, segs=1)
    P.box('till_glass', (0.005, 0.2, 0.1), (cx + 0.1, cy0 + 0.4, 1.28), 'glass', rot=(0, -20, 0), bev=None)
    for k in range(3):
        P.box('sweets', (0.18, 0.32, 0.06), (cx - 0.05, cy1 - 0.3, 1.07 + k * 0.08), 'paint_b' if k % 2 else 'paint', bev=0.01, segs=1)
    card.box(cx0, cx1, cy0, cy1, 0.0, 1.04, floor=True)
    card.spot('counter_a', cx - 0.05, cy0 + 0.95, 1.04, 180)
    card.spot('counter_b', cx, cy0 + 1.25, 1.04, 200)
    card.spot('counter_c', cx - 0.08, cy0 + 0.75, 1.04, 160)
    card.spot('under_counter', cx + 0.1, cy0 + 0.9, 0.33, 0)
    card.spot('behind_a', 4.15, -5.3, 0.0, 180)
    card.spot('behind_b', 4.3, -4.5, 0.0, 200)
    # a shelf of cigarettes and oil on the wall behind the clerk
    for z in (1.5, 1.85):
        N.bm_box(B['wood'], (SX1 - T - 0.12, cy, z), (0.24, 1.6, 0.03))
    for k in range(9):
        N.bm_box(B['paint' if k % 3 else 'paint_b'], (SX1 - T - 0.12, cy - 0.7 + k * 0.17, 1.6), (0.12, 0.12, 0.18))
    # the drinks cooler on the west wall: its body, its glass doors, the bottles in it
    kx = SX0 + T + 0.36
    N.bm_box(B['paint_b'], (kx, -5.2, 1.0), (0.7, 1.6, 2.0))
    N.bm_box(B['trim'], (kx + 0.36, -5.2, 1.0), (0.03, 1.5, 1.85))
    for y in (-5.6, -4.8):
        N.bm_box(B['glass'], (kx + 0.375, y, 1.02), (0.01, 0.7, 1.7))
        C.post(P, 'handle', (kx + 0.4, y + 0.3, 0.8), (kx + 0.4, y + 0.3, 1.3), 0.012, 'chrome', segs=6)
    N.bm_box(B['paint'], (kx + 0.37, -5.2, 1.93), (0.02, 1.5, 0.12))
    for row, z in enumerate((0.35, 0.8, 1.25, 1.7)):
        N.bm_box(B['alu'], (kx + 0.05, -5.2, z - 0.03), (0.55, 1.45, 0.02))
        for k in range(8):
            y = -5.85 + k * 0.18
            P.cyl('bottle', 0.035, 0.24, loc=(kx + 0.12, y, z + 0.12), material='paint' if (k + row) % 3 else 'paint_b', segs=8)
    card.box(kx - 0.36, kx + 0.4, -6.0, -4.4, 0.0, 2.0)
    # the lights: two tube fittings under the ceiling over the shelves, the switch by the door
    for k, x in enumerate((-2.6, 1.6)):
        N.bm_box(B['paint_b'], (x, -8.5, HS - 0.2), (0.25, 2.4, 0.08))
        lit_panel(P, f'tube_{k}', f'shop_{"ab"[k]}', (0.16, 2.3, 0.03), (x, -8.5, HS - 0.25))
        card.lamp(f'shop_{"ab"[k]}', x, -8.5, HS - 0.3, 6.5, warm=False)
    P.box('switch_plate', (0.075, 0.012, 0.12), (SX0 + 2.15, SY1 - T - 0.006, 1.35), 'paint_b', bev=0.003)
    P.box('switch', (0.03, 0.02, 0.02), (SX0 + 2.15, SY1 - T - 0.02, 1.355), 'trim', bev=0.003)
    card.switch('shop', SX0 + 2.15, SY1 - T - 0.02, 1.35, ['shop_a', 'shop_b'])
    # the glass door: a coloured frame round its glass, a push bar; hung on its west edge, opening in
    hx, hy = SX0 + 2.4 + 0.03, SY1 - T / 2
    dw, dh, dt = 1.04, 2.16, 0.05
    since = len(P.statics)
    P.box('door_stile', (0.09, dt, dh), (hx + 0.045, hy, dh / 2), 'paint', bev=0.004)
    P.box('door_stile', (0.09, dt, dh), (hx + dw - 0.045, hy, dh / 2), 'paint', bev=0.004)
    P.box('door_rail', (dw, dt, 0.18), (hx + dw / 2, hy, 0.09), 'paint', bev=0.004)
    P.box('door_rail', (dw, dt, 0.09), (hx + dw / 2, hy, dh - 0.045), 'paint', bev=0.004)
    P.box('door_glass', (dw - 0.16, 0.012, dh - 0.3), (hx + dw / 2, hy, 0.18 + (dh - 0.3) / 2), 'glass', bev=None)
    P.box('door_bar', (dw - 0.3, 0.03, 0.03), (hx + dw / 2, hy + 0.06, 1.05), 'chrome', bev=0.008)
    P.box('door_pull', (0.03, 0.03, 0.3), (hx + dw - 0.15, hy - 0.06, 1.05), 'chrome', bev=0.008)
    P.mover('DOOR_shop', P.statics[since:], (hx, hy, 0.0))
    card.door('DOOR_shop', (hx, hy), dw, dt, 105.0, dh, (1.0, 0.0), -1, pry='none', secs=0.7, mat='metal')


def store(P, B, card):
    """The old store room against the shop's west wall: a lower annex, its plank door under a tin awning (it may be
    found locked), a shelf of boxes inside, its four spots."""
    t = 0.18
    f = Face((WX0, WY1), (SX0, WY1), (0, 1), t)
    w = Face((WX0, SY0), (WX0, WY1), (-1, 0), t)
    b = Face((SX0, SY0), (WX0, SY0), (0, -1), t)
    door = (1.5, 2.45, 0.0, 2.05)
    solid_wall(B, f, G, HW, [door], 'paint_b', inner='paint_b')
    solid_wall(B, w, G, HW, [(1.0, 1.8, 1.4, 2.0)], 'paint_b', inner='paint_b')
    solid_wall(B, b, G, HW, [], 'paint_b', inner='paint_b')
    opening_trim(B, f, *door, mat='wood')
    shop_window(B, w, 1.0, 1.8, 1.4, 2.0, mullions=1)
    for ff in (f, w, b):
        band(B, 'trim', ff, 0.0, 0.03, G, 0.3, gaps=[(door[0] - 0.07, door[1] + 0.07)] if ff is f else ())
        face_box(B['paint_b'], ff, -0.03, ff.L + 0.03, -t - 0.03, 0.05, HW, HW + 0.07)
    N.bm_box(B['trim'], ((WX0 + SX0) / 2, (SY0 + WY1) / 2, HW - 0.03), (SX0 - WX0 - 0.1, WY1 - SY0 - 0.1, 0.06))
    N.bm_box(B['paint_b'], ((WX0 + SX0) / 2, (SY0 + WY1) / 2, HW - 0.075), (SX0 - WX0 - 2 * t, WY1 - SY0 - 2 * t, 0.03))
    card.spot('roof_c', WX0 + 1.2, SY0 + 0.9, HW + 0.0, 60)
    # its floor of boards, a step up at its door, a tin awning over the door on two brackets
    N.bm_box(B['wood'], ((WX0 + SX0) / 2, (SY0 + WY1) / 2, -0.015), (SX0 - WX0 - 0.3, WY1 - SY0 - 0.3, 0.03))
    for k in range(9):
        N.bm_box(B['trim'], (WX0 + 0.4 + k * 0.55, (SY0 + WY1) / 2, 0.0005), (0.008, WY1 - SY0 - 0.4, 0.001))
    N.bm_box(B['paint_b'], (WX0 + 1.97, WY1 + 0.22, G + FL / 2), (1.3, 0.44, FL))
    card.box(WX0 + 1.32, WX0 + 2.62, WY1, WY1 + 0.44, G - 0.5, 0.0, floor=True)
    N.tin(B, (WX0 + 1.2, WY1, 2.45), (1, 0, 0), (0, 0.94, -0.34), 1.55, 0.85, seed=0.4, rust_every=2)
    for x in (WX0 + 1.3, WX0 + 2.65):
        C.post(P, 'awning_strut', (x, WY1 + 0.02, 1.95), (x, WY1 + 0.7, 2.18), 0.018, 'rust', segs=6)
    card.box(WX0, SX0, SY0, WY1, G - 0.5, 0.0, floor=True)
    card.box(WX0, WX0 + 1.5, WY1 - t, WY1, G, HW)
    card.box(WX0 + 2.45, SX0, WY1 - t, WY1, G, HW)
    card.box(WX0 + 1.5, WX0 + 2.45, WY1 - t, WY1, 2.05, HW)
    card.box(WX0, WX0 + t, SY0, WY1, G, HW)
    card.box(WX0, SX0, SY0, SY0 + t, G, HW)
    # a shelf of boxes against its back
    mx = (WX0 + SX0) / 2
    for z in (0.4, 1.1, 1.8):
        N.bm_box(B['wood'], (mx, SY0 + 0.45, z), (3.6, 0.5, 0.04))
    for x in (mx - 1.75, mx + 1.75):
        N.bm_box(B['wood'], (x, SY0 + 0.45, 1.0), (0.05, 0.5, 2.0))
    for k in range(6):
        N.bm_box(B['paint_b'] if k % 2 else B['wood'], (mx - 1.3 + k * 0.5, SY0 + 0.45, 0.62), (0.4, 0.38, 0.4))
    card.box(mx - 1.8, mx + 1.8, SY0 + t, SY0 + 0.72, 0.0, 2.0)
    for z in (0.4, 1.1, 1.8):
        card.box(mx - 1.75, mx + 1.75, SY0 + t + 0.02, SY0 + 0.7, z - 0.03, z + 0.02, floor=True)
    card.spot('store_a', mx - 0.6, SY0 + 0.45, 1.12, 90)
    card.spot('store_b', mx + 0.9, SY0 + 0.45, 1.82, 90)
    card.spot('store_c', mx - 1.2, WY1 - 0.7, 0.0, 30)
    card.spot('store_d', mx + 1.4, WY1 - 0.8, 0.0, 200)
    # its bulb and its switch inside the door
    P.box('store_bulb_cap', (0.1, 0.1, 0.06), (mx, (SY0 + WY1) / 2, HW - 0.12), 'trim', bev=0.01)
    lit_panel(P, 'store_bulb', 'store', (0.07, 0.07, 0.09), (mx, (SY0 + WY1) / 2, HW - 0.19))
    card.lamp('store', mx, (SY0 + WY1) / 2, HW - 0.2, 4.0)
    P.box('switch_plate', (0.075, 0.012, 0.12), (WX0 + 2.7, WY1 - t - 0.006, 1.35), 'paint_b', bev=0.003)
    card.switch('store', WX0 + 2.7, WY1 - t - 0.02, 1.35, ['store'])
    # the old door: planks on ledges, a hasp; hung on its east edge, opening in
    hx, hy = WX0 + 2.45 - 0.02, WY1 - t / 2
    dw, dh, dt = 0.92, 2.03, 0.045
    since = len(P.statics)
    for k in range(5):
        P.box('old_board', (dw / 5 - 0.006, dt, dh), (hx - (k + 0.5) * dw / 5, hy, dh / 2 + 0.005), 'wood', bev=0.003)
    for z in (0.3, 1.7):
        P.box('old_ledge', (dw - 0.06, 0.03, 0.12), (hx - dw / 2, hy - dt / 2 - 0.015, z), 'wood', bev=0.004)
    P.box('hasp', (0.03, 0.02, 0.14), (hx - dw + 0.08, hy + dt / 2 + 0.01, 1.05), 'rust', bev=0.002)
    P.mover('DOOR_old', P.statics[since:], (hx, hy, 0.0))
    card.door('DOOR_old', (hx, hy), dw, dt, 105.0, dh, (-1.0, 0.0), +1, pry='locker', secs=0.4)


def garage(P, B, card):
    """The garage bay against the shop's east wall: open in front under a coloured lintel, its back and east walls,
    the workbench and its tool board, a stack of tyres, a drum; a light and its switch."""
    t = 0.2
    e = Face((GX1, GY1), (GX1, SY0), (1, 0), t)
    b = Face((GX1, SY0), (SX1, SY0), (0, -1), t)
    f = Face((SX1, GY1), (GX1, GY1), (0, 1), t)
    solid_wall(B, e, G, HG, [], 'paint_b', inner='paint_b')
    solid_wall(B, b, G, HG, [], 'paint_b', inner='paint_b')
    solid_wall(B, f, G, HG, [(0.35, f.L - 0.35, G, 3.0)], 'paint_b', inner='paint_b')
    face_box(B['paint'], f, 0.25, f.L - 0.25, 0.0, 0.05, 2.98, 3.3)
    for ff in (e, b, f):
        band(B, 'trim', ff, 0.0, 0.03, G, 0.3, gaps=[(0.35, f.L - 0.35)] if ff is f else ())
        face_box(B['paint_b'], ff, -0.04, ff.L + 0.04, -t - 0.03, 0.05, HG, HG + 0.08)
    N.bm_box(B['trim'], ((SX1 + GX1) / 2, (SY0 + GY1) / 2, HG - 0.03), (GX1 - SX1 - 0.1, GY1 - SY0 - 0.1, 0.08))
    card.box(SX1, GX1, SY0, SY0 + t, G, HG)
    card.box(GX1 - t, GX1, SY0, GY1, G, HG)
    card.box(SX1, SX1 + 0.35, GY1 - t, GY1, G, HG)
    card.box(GX1 - 0.35, GX1, GY1 - t, GY1, G, HG)
    card.box(SX1, GX1, GY1 - t, GY1, 3.0, HG)
    card.spot('roof_d', GX1 - 1.0, SY0 + 1.5, HG + 0.01, 200)
    # oil stains on its floor (the ground's), the workbench along the back and its tool board
    for k in range(4):
        bm = bmesh.new()
        K.bm_cyl(bm, 0.3 + 0.4 * abs(jit(k, 1.0)), 0.004, segs=14,
                 matrix=Matrix.Translation((7.6 + 2.4 * jit(k, 2.0), -7.6 + 2.8 * jit(k, 3.0), G + 0.002)) @ Matrix.Diagonal((1.0, 0.6 + 0.6 * abs(jit(k, 4.0)), 1.0, 1.0)))
        P.mesh('oil', bm, 'trim', sharp=40.0)
    bx = (SX1 + GX1) / 2
    N.bm_box(B['wood'], (bx, SY0 + 0.55, G + 0.92), (3.4, 0.7, 0.06))
    for x in (bx - 1.6, bx + 1.6):
        for y in (SY0 + 0.3, SY0 + 0.8):
            N.bm_box(B['steel'], (x, y, G + 0.45), (0.06, 0.06, 0.9))
    N.bm_box(B['steel'], (bx, SY0 + 0.55, G + 0.25), (3.3, 0.6, 0.03))
    N.bm_box(B['paint_b'], (bx, SY0 + t + 0.015, G + 1.55), (2.6, 0.03, 1.0))
    for k in range(9):
        C.post(P, 'tool', (bx - 1.1 + k * 0.27, SY0 + t + 0.04, G + 1.85), (bx - 1.1 + k * 0.27, SY0 + t + 0.04, G + 1.45 - 0.08 * (k % 3)),
               0.012, 'steel' if k % 2 else 'trim', segs=6)
    P.box('vise', (0.18, 0.14, 0.14), (bx + 1.3, SY0 + 0.75, G + 1.02), 'paint', bev=0.01, segs=1)
    card.box(bx - 1.75, bx + 1.75, SY0 + t, SY0 + 0.92, G, G + 0.98, floor=True)
    card.spot('garage_a', bx - 0.9, SY0 + 0.6, G + 0.95, 90)
    card.spot('garage_b', bx + 0.5, SY0 + 0.6, G + 0.95, 70)
    # tyres stacked in a corner, a drum
    for k in range(4):
        P.torus('tyre', 0.3, 0.11, loc=(GX1 - 0.6, GY1 - 0.75, G + 0.12 + k * 0.23), material='rubber', segs=24, rsegs=8)
    card.post(GX1 - 0.6, GY1 - 0.75, 0.42, G, G + 1.0)
    P.cyl('drum', 0.29, 0.88, loc=(SX1 + 0.55, SY0 + 1.4, G + 0.44), material='paint', segs=20)
    for z in (0.25, 0.65):
        P.torus('drum_rib', 0.292, 0.012, loc=(SX1 + 0.55, SY0 + 1.4, G + z), material='paint', segs=24, rsegs=4)
    card.post(SX1 + 0.55, SY0 + 1.4, 0.3, G, G + 0.9)
    for k, (x, y) in enumerate(((6.4, -6.2), (8.5, -6.0), (7.2, -8.4), (9.1, -8.8))):
        card.spot(f'garage_{"cdef"[k]}', x, y, G, 40 + 70 * k)
    N.bm_box(B['paint_b'], (bx, (SY0 + GY1) / 2, HG - 0.11), (0.2, 1.6, 0.08))
    lit_panel(P, 'garage_tube', 'garage', (0.12, 1.5, 0.02), (bx, (SY0 + GY1) / 2, HG - 0.16))
    card.lamp('garage', bx, (SY0 + GY1) / 2, HG - 0.2, 6.0, warm=False)
    P.box('switch_plate', (0.012, 0.075, 0.12), (SX1 + 0.006, GY1 - t - 0.35, G + 1.35), 'paint_b', bev=0.003)
    card.switch('garage', SX1 + 0.02, GY1 - t - 0.35, G + 1.35, ['garage'])


def station(P):
    card = N.Card('station')
    B = N.new_set()
    shop(P, B, card)
    store(P, B, card)
    garage(P, B, card)
    canopy(P, B, card)
    pump(P, B, card)
    sign(P, B, card)
    # the forecourt's things: a bench by the shop window, a bin, the air stand
    N.bm_box(B['wood'], (1.5, SY1 + 0.55, G + 0.42), (1.6, 0.4, 0.05))
    for x in (0.85, 2.15):
        N.bm_box(B['steel'], (x, SY1 + 0.55, G + 0.2), (0.05, 0.36, 0.4))
    card.box(0.7, 2.3, SY1 + 0.35, SY1 + 0.75, G, G + 0.45)
    P.cyl('bin', 0.24, 0.85, loc=(4.4, SY1 + 0.55, G + 0.425), material='paint_b', segs=16)
    P.cyl('bin_lid', 0.26, 0.05, loc=(4.4, SY1 + 0.55, G + 0.87), material='paint', segs=16)
    card.post(4.4, SY1 + 0.55, 0.26, G, G + 0.9)
    C.post(P, 'air_post', (CX1 + 1.2, CY0 + 0.4, G), (CX1 + 1.2, CY0 + 0.4, G + 1.25), 0.1, 'paint', segs=10)
    P.box('air_head', (0.26, 0.2, 0.3), (CX1 + 1.2, CY0 + 0.4, G + 1.3), 'paint_b', bev=0.02, segs=2)
    card.post(CX1 + 1.2, CY0 + 0.4, 0.12, G, G + 1.45)
    # the forecourt's spots, about the pump and the island
    for k, (x, y, fc) in enumerate(((PX + 1.5, PY - 1.0, 20), (PX - 1.6, PY + 0.8, 160), (PX + 1.2, PY + 2.4, 90),
                                    (CX0 + 1.2, CY0 + 0.9, 300), (CX1 - 1.0, CY1 - 1.3, 200))):
        card.spot(f'pump_{"abcde"[k]}', x, y, G, fc)
    N.finish_bms(P, B)
    P.views = [('a', -60, 20), ('b', 30, 25), ('c', 150, 25)]
    card.extra['plinth'] = FL
    return card, (28.4, 29.3, 7.0), {'DOOR_shop': dict(move='hinge', axis='y', open=105.0),
                                       'DOOR_old': dict(move='hinge', axis='y', open=105.0)}


TABLE = {'station': station}


def main(args):
    N.run(TABLE, args)
