"""
The building kit put together as the game will: the reference assembler for the pieces of places/kit.py, and
its test. It imports the exported GLBs (public/models/modcar/places/kit/) and places, stretches and repeats
them by the rules below to build roadside buildings of src/core/world/sites.ts, then renders cel previews of
them, inked where the material changes as the game's frame pass inks (frame.ts inkAt), and a contact sheet of
every piece, into D:/modcar-scratch/kit/:

    blender -b --factory-startup --python tools/blender/build.py -- places/kit_test
        [farm|garage|shed|shop|sheet|all] [--close] [--blend]

    farm    the farmhouse: 8.6 x 6.6 x 2.9, gable roof rising 1.6, a door 1.0 wide at -1.7, a 1.3 window at
            +1.9 with shutters, side windows, a back window, a porch 1.7 deep on posts, a chimney, a ceiling
    garage  the roadside garage: 11.6 x 8.2 x 4.0, mono roof (rise 1.64, the front high), a 4.4 gate at -2.3
            down 40 %, a 1.6 window at +3.7, the wrench on its board
    shed    the farm's shed: 3.4 x 2.8 x 2.2, mono, a 1.8 opening with two board doors
    shop    the shop: 12 x 7 x 3.3, flat roof and parapets, a 1.5 double aluminium door, 2.8 shop windows,
            an awning 2.2 deep, the basket on a board standing on the parapet
    sheet   kit_contact_sheet.png: every piece as built, fitted to its cell
    --close also the close-ups (corners, eaves, the apex, doors, the gate, inside) used to look for gaps and
            z-fighting; --blend saves each assembled scene (test_<name>.blend)

THE RULES (building frame: X along the front, Y across with the FRONT at -Y, Z up from the floor's top; the
outer wall faces at X = +-w/2, Y = +-d/2; H = the wall height, R = the roof's rise; every piece is placed by
location . rotation . scale along the piece's own axes; no piece is ever mirrored):

  constants  T = 0.24 the walls' thickness (a wall's middle plane 0.12 inside its outer face); E = 0.09 how far
             the cornice stands out of the wall face; C = 0.02 the cornice's top over the wall top; OV = 0.35
             the eaves' overhang beyond the cornice's front edge; OVX = 0.30 the gables' beyond the end walls
  walls      each wall has a frame: origin on its middle plane at its middle, X along it, -Y outwards (front:
             no turn; right, X = +w/2: +90 deg about Z; back: 180; left: -90); s = the position along it
             corner   at the four crossings of the middle planes, Z 0 .. the wall top there (scale Z): 3 cm proud
                      outside and inside
             wall     between the corners, 2 cm into each: s +-(L/2 - 0.13), L = the outer length - 0.24
                      (scale X = length, Z = height), split round the openings as below (the pieces abut: the
                      game inks no line between pieces of one material, so the joins do not show)
             plinth   Z -0.20 .. 0.20 (scale X; deeper ground: scale Z from below); the front's and back's run
                      the outer length + 0.08 at each end, the end walls' stop at those ones' back faces
                      (s +-(d/2 - 0.22)); all stop 2 cm short of a door or a gate
             cornice  top at the wall top + C (bottom at top - 0.12; scale X); the front's and back's run the
                      outer length + 0.09 at each end, the end walls' stop at those ones' back faces (s +-(d/2 -
                      0.23)); under a mono roof the end walls' cornice, at H, runs on to the front corner post's
                      middle (s = d/2 - 0.12 towards the front)
  openings   [s0, s1] the clear width, z0 .. z1 (a door or a gate from 0, a window from its sill z0); doors 2.05
             (door_wood), 2.10 (door_shop), 2.00 (door_shed) high; a gate min(H - 0.45, 3.1); windows as the
             old style: sill 0.95 (0.75 when wider than 2), top min(H - 0.5, sill + 1.15 (1.6)); side windows
             1.1 wide, sill 0.95, top min(H - 0.45, 2.0)
             jamb     centred at s0 - 0.05 and s1 + 0.05, Z z0 .. z1
             lintel   s0 - 0.14 .. s1 + 0.14, Z z1 .. z1 + 0.16
             sill     (windows) s0 - 0.14 .. s1 + 0.14, its top at z0
             win      s0 .. s1, z0 .. z1, Y 0
             wall     beside it up to s0 - 0.08 / from s1 + 0.08; above it from the lintel's top - 0.02;
                      below a window up to the sill's bottom + 0.02 (2 cm into each trim)
             shutter  (house windows) one hinged at s0 - 0.10 turned 180 about Z, one at s1 + 0.10 turned 180
                      about X (its origin then at the window's top), both at Y -0.147, scale X = (s1 - s0) / 1.0,
                      Z = z1 - z0: they lie open on the wall, ledges out
             door     hinge at (s0, Y 0), scale X = s1 - s0 (0.75 .. 1.1), it swings about Z (+ = into the room).
                      Wider: two leaves of half the width, the second hinged at s1: door_shop turned 180 about
                      Z (it is the same both sides), door_shed turned 180 about Y (upside down, origin at its
                      top), so that its straps face out too. The floor goes through the wall in the opening
                      (s0 .. s1, Y -0.12 .. 0.11)
             gate     jambs and lintel as a door; gate_rail at s0 - 0.04 and (turned 180) at s1 + 0.04, Y -0.21,
                      Z 0 .. z1; gate_box over s0 - 0.14 .. s1 + 0.14 (it covers the lintel's ends), Y -0.35
                      (its back on the lintel's face), its bottom at z1; gate_shutter over s0 - 0.04 .. s1 + 0.04
                      at Y -0.21 from its bottom + 0.08 up to z1 + 0.2 (into the box), in modules of about 1 m
                      (it tiles in Z), gate_bar under it; a step as the apron (Z -0.15 .. 0)
  floor      Z -0.14 .. 0 inside the walls, 1 cm into them: floor (boards along X) scaled in X and repeated
             in Y in modules of about 1 m; floor_slab (concrete) scaled in both
  gable      the roof's underside is the plane through the eave cornices' front top edges (Y = +-(d/2 + E),
             Z = H + C), rising p = (R - C) / (d/2 + E) to the ridge line (Y 0, Z = H + R)
             roof_slope  modules along X over w + 2 OVX (n = the length rounded, each scaled to fit); its eave
                      (local Y 0) at Y = -(d/2 + E + OV), Z = H + C - p OV; run s = d/2 + E + OV; the back slope
                      the same turned 180 about Z. Its transform is a scale and a SHEAR, not a scale in Z:
                          x' = m x,   y' = s y,   z' = z + (p s - 1) y
                      the reference plane z = y goes to z' = p y' and the sheet's 6 cm, the corrugation and the
                      fascia keep their sizes (a plain Z scale by p s would thicken them on steep roofs and
                      flatten them on porches). three.js holds it in Object3D.matrix with matrixAutoUpdate off
                      (or an InstancedMesh's matrix, or baked into the geometry); Blender objects cannot (this
                      test bakes it). roof_slope_rust for about one module in five
             ridge    modules along X over w + 2 OVX + 0.08, its bottom at Z = H + R + 0.06 - 0.15 p - 0.005
             gable_end on each end wall's middle plane, Y -(d/2 + E) .. d/2 + E, its base at Z = H + C (on the
                      end walls' cornice), apex at H + R: scale Y = d + 2E, Z = R - C. Its base corners sit
                      on the eave cornices and close the eaves' ends
             verge    up each sloping edge: X along the slope, its local Y turned inwards, its back face (local
                      Y -0.015) on the roof's end plane X = +-(w/2 + OVX), the cap's underside (local Z 0.16) 2
                      mm over the crests (its foot then 0.16 - 0.06 cos(slope) - 0.002 under the roof's
                      underside); from 0.02 below the eave to where its top edge meets its pair's over the ridge
                      ((0.20 - that depth) x tan(slope) past the ridge line); the back slope's pair 1 cm further
                      out, so that the two never share a plane; a post 0.45 long (scale Z) as a finial over the
                      joint, 0.23 above the ridge line, in the boards' plane
  mono       front wall and its corners to H + R, back and end walls to H; the underside plane through the low
             (back) cornice's front top edge (Y = d/2 + E, Z = H + C) and the HIGH cornice's BACK top edge (Y =
             -d/2 + 0.23, Z = H + R + C): the plane falls away inwards from the high wall, and through its front
             edge it would cut the cornice and the wall top (they show through the corrugation's valleys).
             p = R / (d + E - 0.23). roof_slope turned 180 (its eave at the back) at Y = d/2 + E + OVB (OVB
             0.40), run = d + 2E + OVB + OVF (OVF 0.25), the same shear; mono_end on each end wall turned 180,
             Y -d/2 .. d/2 + E (scale Y = d + E), base at H + C, scale Z = p (d + E); verges up both sloping
             edges, and one along the high front edge (no turn, its back on the roof's front edge, the cap on
             the crests). Under the front overhang a wedge 6 cm high stays open over the cornice, closed at its
             back and its ends
  flat       parapet on every wall top (Z H .. H + 0.45; the front's and back's the outer length, the end walls'
             between them, abutting); roof_flat inside them, 1 cm into the walls, Z H - 0.10 .. H + 0.04
  ceiling    under a pitched roof: roof_flat (its underside is plaster) as for a flat roof
  porch      floor boards Z -0.14 .. 0 from the wall face out; posts 0.10 in from the porch's edge (wood, Z 0 ..
             the beam); the beam on them; a lean-to roof_slope from 0.25 beyond the beam's front face (eave) to
             the wall face, its underside on the beam's top front edge, the same shear; a verge as flashing on
             the wall over its top end (turned 180, its back on the wall face), verges up its two sides; a step
             at the door in front of the deck (Z -0.22 .. -0.07)
  awning     (fronts without posts) on the front wall, its wall end on the wall face, modules along X; Y scale
             = its depth, and deeper than 1 m scale Z (0.7 x depth here) or its canvas lies nearly flat
  sign       signboard on the wall over the door (bottom 0.3 over it) or over the gate box (0.17 over it), its
             back on the wall face (scale X); with an awning it stands on the parapet instead. The board wears
             the place's colour and a pale ink, not the walls' (a look of its own). The pictogram on its panel:
             its back on the panel's face (Y 0.025 in front of the board's middle), its bottom 0.05 over the
             board's (scale it uniformly for a bigger board)
  chimney    behind the ridge (Y ~ d/2 * 0.25), its top 0.6 over the ridge's crest line: 1.8 tall, its foot
             is in the attic
"""
import math
import os

import bmesh
import bpy
from mathutils import Matrix, Vector

from places import kit as KIT

V = Vector
SCR = KIT.SCRATCH
HT = KIT.HT
E, C = 0.09, 0.02
OV, OVX = 0.35, 0.30


def rot_z(deg):
    return Matrix.Rotation(math.radians(deg), 4, 'Z')


def scale3(sx, sy, sz):
    return Matrix.Diagonal((sx, sy, sz, 1.0))


def shear_roof(m, s_y, p):
    """the roof module's transform: x' = m x, y' = s_y y, z' = z + (p s_y - 1) y"""
    M = Matrix.Identity(4)
    M[0][0] = m
    M[1][1] = s_y
    M[2][1] = p * s_y - 1.0
    return M


# ------------------------------------------------------------------------------------------------ the library

class Lib:
    """Every piece's mesh, imported once from its GLB (materials shared by name)."""

    def __init__(self):
        self.meshes = {}
        self.mats = {}

    def mat(self, name):
        m = self.mats.get(name)
        if m is None:
            m = bpy.data.materials.new(name)
            self.mats[name] = m
        return m

    def mesh(self, piece):
        me = self.meshes.get(piece)
        if me is not None:
            return me
        before = set(bpy.data.objects)
        bpy.ops.import_scene.gltf(filepath=os.path.abspath(os.path.join(KIT.OUT, f'{piece}.glb')))
        new = [o for o in bpy.data.objects if o not in before]
        part = next(o for o in new if o.name.startswith('PART'))
        me = part.data
        me.name = piece
        for i, m in enumerate(me.materials):
            me.materials[i] = self.mat(m.name.split('.')[0])
        ca = me.color_attributes
        if ca and ca[0].name != 'Col':
            ca[0].name = 'Col'
        for o in new:
            bpy.data.objects.remove(o)
        self.meshes[piece] = me
        return me


# ------------------------------------------------------------------------------------------------ the assembler

class Asm:
    """Places pieces into the scene; paint and paint_b of each object are the building's own colours."""

    def __init__(self, lib, tag, colors):
        self.lib = lib
        self.tag = tag
        self.colors = colors
        self.objs = []
        self.count = {}

    def put(self, piece, M, tag=None):
        me = self.lib.mesh(piece)
        # (a Blender object holds location, rotation and scale only: a sheared transform - the roof's - is
        # baked into a copy of the mesh, as the game must too unless it sets the matrix itself)
        loc, rot, sca = M.decompose()
        M2 = Matrix.LocRotScale(loc, rot, sca)
        if max(abs(M[i][j] - M2[i][j]) for i in range(4) for j in range(4)) > 1e-6:
            me = me.copy()
            me.transform(M)
            M = Matrix.Identity(4)
        o = bpy.data.objects.new(f'{self.tag}:{piece}', me)
        bpy.context.scene.collection.objects.link(o)
        o.matrix_world = M
        for i, slot in enumerate(o.material_slots):
            base = me.materials[i].name.split('.')[0]
            if base in ('paint', 'paint_b'):
                slot.link = 'OBJECT'
                slot.material = self.lib.mat(f'{base}.{tag or self.tag}')
        self.objs.append(o)
        self.count[piece] = self.count.get(piece, 0) + 1
        return o


def modules(length, size=1.0):
    """how many modules of about `size` cover `length`, and the scale of each"""
    n = max(1, int(round(length / size)))
    return n, length / n / size


class Wall:
    """One wall's frame: origin on its middle plane at its middle, X along it, -Y outwards."""

    def __init__(self, B, origin, deg):
        self.M = B @ Matrix.Translation(origin) @ rot_z(deg)

    def at(self, s, y, z, rot=None, scale=(1, 1, 1)):
        R = rot if rot is not None else Matrix.Identity(4)
        return self.M @ Matrix.Translation((s, y, z)) @ R @ scale3(*scale)


def band(asm, wall, piece, s0, s1, y, z, sz=1.0):
    """an X-stretched piece from s0 to s1 along the wall"""
    if s1 - s0 > 1e-4:
        asm.put(piece, wall.at((s0 + s1) / 2, y, z, scale=(s1 - s0, 1, sz)))


def plaster(asm, wall, s0, s1, z0, z1):
    if s1 - s0 > 1e-4 and z1 - z0 > 1e-4:
        asm.put('wall', wall.at((s0 + s1) / 2, 0, z0, scale=(s1 - s0, 1, z1 - z0)))


def wall_run(asm, wall, length, top, ops, plinth_span, cornice_span):
    """
    One wall: its plaster between the corners and round the openings, the jambs, lintels, sills, windows, the
    plinth (stopping at doors) and the cornice. length = the outer length; ops = [dict(s0, s1, z0, z1, kind)].
    """
    La = length - KIT.T
    a, b = -(La / 2 - 0.13), La / 2 - 0.13
    cur = a
    for op in sorted(ops, key=lambda o: o['s0']):
        s0, s1, z0, z1, kind = op['s0'], op['s1'], op['z0'], op['z1'], op['kind']
        plaster(asm, wall, cur, s0 - 0.08, 0, top)
        win = kind == 'window'
        zl = z1 + 0.16
        plaster(asm, wall, s0 - 0.08, s1 + 0.08, zl - 0.02, top)
        if win:
            plaster(asm, wall, s0 - 0.08, s1 + 0.08, 0, z0 - 0.07 + 0.02)
            band(asm, wall, 'sill', s0 - 0.14, s1 + 0.14, 0, z0 - 0.07)
            asm.put('win', wall.at((s0 + s1) / 2, 0, z0, scale=(s1 - s0, 1, z1 - z0)))
        zj = z0 if win else 0.0
        for sj in (s0 - 0.05, s1 + 0.05):
            asm.put('jamb', wall.at(sj, 0, zj, scale=(1, 1, z1 - zj)))
        band(asm, wall, 'lintel', s0 - 0.14, s1 + 0.14, 0, z1)
        cur = s1 + 0.08
    plaster(asm, wall, cur, b, 0, top)
    # the plinth, stopping 2 cm short of doors and gates
    p0, p1 = plinth_span
    cuts = sorted((o['s0'] - 0.02, o['s1'] + 0.02) for o in ops if o['kind'] != 'window')
    x = p0
    for (c0, c1) in cuts:
        band(asm, wall, 'plinth', x, c0, 0, -0.20)
        x = c1
    band(asm, wall, 'plinth', x, p1, 0, -0.20)
    band(asm, wall, 'cornice', cornice_span[0], cornice_span[1], 0, top + C - 0.14)


def verge_along(asm, B, x_edge, inward, E0, A0, t_top=0.06, ext_lo=0.02, ext_hi=0.10, out=0.0):
    """
    A verge along a roof's sloping edge in the plane X = x_edge (building frame), from the eave point E0 (y, z
    of the underside at the eave) to the apex A0 (the underside at the ridge or the high end); inward = +1 when
    the roof lies at +X of the edge. The board's back on the edge plane, its cap 2 mm over the crests.
    """
    E0, A0 = V((0.0, E0[0], E0[1])), V((0.0, A0[0], A0[1]))
    u = (A0 - E0).normalized()
    Y = V((float(inward), 0.0, 0.0))
    X = u.copy()
    Z = X.cross(Y)
    if Z.z < 0:
        X = -u
        Z = X.cross(Y)
    n = Z
    # (the sheet is t_top thick vertically, t_top cos(slope) across)
    lift = t_top * abs(u.y) + 0.002 - 0.16
    if ext_hi is None:
        # (to the ridge: the board's top edge, 0.20 above its foot, meets its pair's right over the ridge line)
        ext_hi = (0.20 + lift) * abs(u.z / u.y)
    L = (A0 - E0).length
    mid = E0 + u * ((L + ext_hi - ext_lo) / 2) + n * lift
    org = V((x_edge - inward * out, mid.y, mid.z)) + Y * 0.015
    R = Matrix((X, Y, Z)).transposed().to_4x4()
    asm.put('verge', B @ Matrix.Translation(org) @ R @ scale3(L + ext_lo + ext_hi, 1, 1))


def building(asm, B, w, d, H, spec, rise=1.6, chimney_at=None):
    """Assemble one building from its size and spec (the sites.ts BuildingSpec) in the frame B."""
    roof = spec['roof']
    gate = spec.get('gate', False)
    R = rise
    Hf = H + R if roof == 'mono' else H          # the front wall's top
    # ---- the four walls: frame, outer length, top, openings
    door_h = {'door_wood': 2.05, 'door_shop': 2.1, 'door_shed': 2.0}
    door_piece = spec.get('door', 'door_wood')
    gate_h = min(H - 0.45, 3.1)
    zd = gate_h if gate else door_h[door_piece]
    front_ops = [dict(s0=spec['doorAt'] - spec['doorW'] / 2, s1=spec['doorAt'] + spec['doorW'] / 2, z0=0.0, z1=zd,
                      kind='gate' if gate else 'door')]
    ww = spec.get('windowW', 1.1)
    sill = 0.75 if ww > 2 else 0.95
    wtop = min(H - 0.5, sill + (1.6 if ww > 2 else 1.15))
    for at in spec.get('windows', []):
        front_ops.append(dict(s0=at - ww / 2, s1=at + ww / 2, z0=sill, z1=wtop, kind='window'))
    side_ops = [dict(s0=-0.55, s1=0.55, z0=0.95, z1=min(H - 0.45, 2.0), kind='window')] if spec.get('sideWindows') else []
    back_ops = [dict(s0=-0.6, s1=0.6, z0=1.0, z1=min(H - 0.5, 2.0), kind='window')] if spec.get('backWindow') else []
    walls = {
        'front': (Wall(B, (0, -d / 2 + HT, 0), 0), w, Hf, front_ops),
        'right': (Wall(B, (w / 2 - HT, 0, 0), 90), d, H, side_ops),
        'back': (Wall(B, (0, d / 2 - HT, 0), 180), w, H, back_ops),
        'left': (Wall(B, (-w / 2 + HT, 0, 0), -90), d, H, side_ops),
    }
    for key, (wall, length, top, ops) in walls.items():
        if key in ('front', 'back'):
            ps, cs = (-length / 2 - 0.08, length / 2 + 0.08), (-length / 2 - 0.09, length / 2 + 0.09)
        else:
            ps, cs = (-(length / 2 - 0.22), length / 2 - 0.22), (-(length / 2 - 0.23), length / 2 - 0.23)
            if roof == 'mono':
                # (under the high front the end walls' cornice runs on to the middle of the front corner post,
                # where it stops against it: there is no front cornice at its height to meet)
                cs = (-(length / 2 - 0.23), length / 2 - 0.12) if key == 'left' else (-(length / 2 - 0.12), length / 2 - 0.23)
        wall_run(asm, wall, length, top, ops, ps, cs)
    # ---- the corners
    for (sx, sy) in ((-1, -1), (1, -1), (1, 1), (-1, 1)):
        top = Hf if sy < 0 else H
        asm.put('corner', B @ Matrix.Translation((sx * (w / 2 - HT), sy * (d / 2 - HT), 0)) @ scale3(1, 1, top))
    # ---- what fills the openings
    fw = walls['front'][0]
    for op in front_ops + [dict(o, wall='right') for o in side_ops] + [dict(o, wall='left') for o in side_ops] + \
            [dict(o, wall='back') for o in back_ops]:
        wall = walls[op.get('wall', 'front')][0]
        s0, s1, z0, z1 = op['s0'], op['s1'], op['z0'], op['z1']
        if op['kind'] == 'window' and spec.get('shutters') and op.get('wall', 'front') == 'front':
            sw = (s1 - s0) / 2 / 0.5
            asm.put('shutter', wall.at(s0 - 0.10, -0.147, z0, rot=rot_z(180), scale=(sw, 1, z1 - z0)))
            asm.put('shutter', wall.at(s1 + 0.10, -0.147, z1, rot=Matrix.Rotation(math.pi, 4, 'X'),
                                       scale=(sw, 1, z1 - z0)))
        if op['kind'] == 'door':
            a = spec.get('doorOpen', 70)
            if s1 - s0 > 1.1:
                # two leaves, hinged at both jambs; the second one without mirroring: a shop door is the same
                # both sides and is turned round about Z, a shed door (straps outside, ledges inside) about Y
                # (upside down, its origin then at its top), so that its straps still face out
                half = (s1 - s0) / 2
                a2 = a * 0.4
                asm.put(door_piece, wall.at(s0, 0, 0, rot=rot_z(a), scale=(half, 1, 1)))
                if door_piece == 'door_shed':
                    asm.put(door_piece, wall.at(s1, 0, door_h[door_piece],
                                                rot=rot_z(-a2) @ Matrix.Rotation(math.pi, 4, 'Y'), scale=(half, 1, 1)))
                else:
                    asm.put(door_piece, wall.at(s1, 0, 0, rot=rot_z(180 - a2), scale=(half, 1, 1)))
            else:
                asm.put(door_piece, wall.at(s0, 0, 0, rot=rot_z(a), scale=(s1 - s0, 1, 1)))
            # the floor through the wall's thickness, up to the room's (which starts 1 cm into the wall)
            asm.put(spec.get('floor', 'floor'), wall.at((s0 + s1) / 2, -0.005, -0.14, scale=(s1 - s0, KIT.T - 0.01, 1)))
        if op['kind'] == 'gate':
            asm.put('gate_rail', wall.at(s0 - 0.04, -0.21, 0, scale=(1, 1, z1)))
            asm.put('gate_rail', wall.at(s1 + 0.04, -0.21, 0, rot=rot_z(180), scale=(1, 1, z1)))
            asm.put('gate_box', wall.at((s0 + s1) / 2, -0.35, z1, scale=(s1 - s0 + 0.28, 1, 1)))
            zb = z1 * (1 - spec.get('gateDown', 0.45))
            gx = s1 - s0 + 0.08
            n, k = modules(z1 + 0.2 - (zb + 0.08))
            for i in range(n):
                asm.put('gate_shutter', wall.at((s0 + s1) / 2, -0.21, zb + 0.08 + i * k, scale=(gx, 1, k)))
            asm.put('gate_bar', wall.at((s0 + s1) / 2, -0.21, zb, scale=(gx, 1, 1)))
            asm.put('floor_slab', wall.at((s0 + s1) / 2, -0.005, -0.14, scale=(s1 - s0, KIT.T - 0.01, 1)))
            # a concrete apron in front of it, at the floor's level
            asm.put('step', wall.at((s0 + s1) / 2, -HT - 0.8, -0.15, scale=(s1 - s0 + 0.4, 1.6, 1)))
        if op['kind'] == 'door' and not spec.get('porch'):
            asm.put('step', wall.at((s0 + s1) / 2, -HT - 0.2, -0.22, scale=(s1 - s0 + 0.4, 0.4, 1)))
    # ---- the sign over the door or the gate
    if spec.get('sign'):
        op = front_ops[0]
        sc = (op['s0'] + op['s1']) / 2
        zs = op['z1'] + (0.45 + 0.17 if gate else 0.3)
        bw = 2.2 if gate else 1.5
        y_sign = -HT - 0.04
        if spec.get('awning'):
            # (the awning takes the wall over the door: the board stands on the parapet, its back on the
            # parapet's front plane)
            zs, bw = H + 0.45, 2.6
        # (the board wears the place's own colour and a pale ink, not the walls')
        asm.put('signboard', fw.at(sc, y_sign, zs, scale=(bw, 1, 1)), tag='sign')
        asm.put('pict_' + spec['sign'], fw.at(sc, y_sign - 0.025 - 0.01, zs + 0.05), tag='sign')
    # ---- the floor inside, 1 cm into the walls
    fx, fy = w - 2 * (KIT.T - 0.01), d - 2 * (KIT.T - 0.01)
    fl = spec.get('floor', 'floor')
    if fl == 'floor':
        n, k = modules(fy)
        for i in range(n):
            asm.put('floor', B @ Matrix.Translation((0, -fy / 2 + (i + 0.5) * k, -0.14)) @ scale3(fx, k, 1))
    else:
        asm.put(fl, B @ Matrix.Translation((0, 0, -0.14)) @ scale3(fx, fy, 1))
    # ---- the roof
    if roof == 'gable':
        gable_roof(asm, B, w, d, H, R, spec)
    elif roof == 'mono':
        mono_roof(asm, B, w, d, H, R)
    else:
        flat_roof(asm, B, w, d, H)
    if spec.get('ceiling') and roof != 'flat':
        asm.put('roof_flat', B @ Matrix.Translation((0, 0, H - 0.10)) @ scale3(fx, fy, 1))
    if spec.get('porch'):
        porch(asm, B, w, d, H, spec)
    if spec.get('awning'):
        # modules along the front over the shop's width, the wall end on the wall face; deeper than a metre
        # it is scaled in Z too, or its canvas would lie nearly flat
        depth, z0 = spec['awning'], spec.get('awningAt', 2.55)
        L = w - 0.6
        n, m = modules(L)
        for i in range(n):
            asm.put('awning', fw.at(-L / 2 + (i + 0.5) * m, -HT, z0, scale=(m, depth, max(1.0, depth * 0.7))))
    if chimney_at is not None:
        cx, cy = chimney_at
        p = (R - C) / (d / 2 + E)
        z_top = H + R + 0.06 + 0.6
        asm.put('chimney', B @ Matrix.Translation((cx, cy, z_top - 1.8)))


def roof_modules(asm, B, x0, x1, y_eave, z_eave, run, p, turn, seed=0):
    """roof_slope modules from x0 to x1, eave (local Y 0) at (y_eave, z_eave), run s_y, slope p; turn 180 for
    a slope whose eave is at +Y"""
    n, m = modules(x1 - x0)
    for i in range(n):
        x = x0 + (i + 0.5) * m
        piece = 'roof_slope_rust' if (i * 7 + seed * 3) % 5 == 2 else 'roof_slope'
        asm.put(piece, B @ Matrix.Translation((x, y_eave, z_eave)) @ rot_z(turn) @ shear_roof(m, run, p))


def gable_roof(asm, B, w, d, H, R, spec):
    p = (R - C) / (d / 2 + E)
    run = d / 2 + E + OV
    ze = H + C - p * OV
    xa, xb = -(w / 2 + OVX), w / 2 + OVX
    roof_modules(asm, B, xa, xb, -run, ze, run, p, 0, seed=0)
    roof_modules(asm, B, xa, xb, run, ze, run, p, 180, seed=1)
    # the ridge
    L = xb - xa + 0.08
    n, m = modules(L)
    zr = H + R + 0.06 - 0.15 * p - 0.005
    for i in range(n):
        asm.put('ridge', B @ Matrix.Translation((-L / 2 + (i + 0.5) * m, 0, zr)) @ scale3(m, 1, 1))
    # the gable triangles on the end walls
    for sx in (-1, 1):
        asm.put('gable_end', B @ Matrix.Translation((sx * (w / 2 - HT), 0, H + C)) @ scale3(1, d + 2 * E, R - C))
    # the barge boards: up both slopes at both ends, the back slope's 1 cm further out
    for sx in (-1, 1):
        for sy, out in ((-1, 0.0), (1, 0.01)):
            verge_along(asm, B, sx * xb, -sx, (sy * run, ze), (0.0, H + R), out=out, ext_hi=None)
        if spec.get('finial', True):
            # a short post over the boards' joint at the apex (the post piece, 0.45 long, 0.23 over the ridge)
            asm.put('post', B @ Matrix.Translation((sx * (xb + 0.02), 0.0, H + R - 0.22)) @ scale3(1, 1, 0.45))


def mono_roof(asm, B, w, d, H, R):
    """
    A single slope from the low back wall up to the high front one. Its underside is the plane through the low
    cornice's front top edge and the HIGH cornice's BACK top edge: the plane falls away inwards from the high
    wall, and through its front edge it would cut the cornice and the wall top (they would show through the
    corrugation's valleys). Under the front overhang it leaves a wedge 6 cm high over the cornice, closed at
    the back.
    """
    OVB, OVF = 0.40, 0.25
    y_lo, z_lo = d / 2 + E, H + C
    y_hi, z_hi = -d / 2 + 0.23, H + R + C
    p = (z_hi - z_lo) / (y_lo - y_hi)
    ye, ze = y_lo + OVB, z_lo - p * OVB
    yf = -(d / 2 + E + OVF)
    zf = z_lo + p * (y_lo - yf)
    run = ye - yf
    xa, xb = -(w / 2 + OVX), w / 2 + OVX
    roof_modules(asm, B, xa, xb, ye, ze, run, p, 180)
    # the end walls' triangles, from the front wall's face to the back cornice's front edge
    span = y_lo + d / 2
    for sx in (-1, 1):
        asm.put('mono_end', B @ Matrix.Translation((sx * (w / 2 - HT), (y_lo - d / 2) / 2, H + C)) @ rot_z(180)
                @ scale3(1, span, p * span))
    for sx in (-1, 1):
        verge_along(asm, B, sx * xb, -sx, (ye, ze), (yf, zf), ext_lo=0.02, ext_hi=0.0)
    # along the high front edge: the board's back on the roof's front edge, the cap on the crests
    Lf = xb - xa + 0.07
    asm.put('verge', B @ Matrix.Translation((0, yf + 0.015, zf + 0.06 + 0.002 - 0.16)) @ scale3(Lf, 1, 1))


def flat_roof(asm, B, w, d, H):
    for (deg, org, L) in ((0, (0, -d / 2 + HT), w), (180, (0, d / 2 - HT), w),
                          (90, (w / 2 - HT, 0), d - 2 * KIT.T), (-90, (-w / 2 + HT, 0), d - 2 * KIT.T)):
        asm.put('parapet', B @ Matrix.Translation((org[0], org[1], H)) @ rot_z(deg) @ scale3(L, 1, 1))
    asm.put('roof_flat', B @ Matrix.Translation((0, 0, H - 0.10)) @ scale3(w - 2 * (KIT.T - 0.01), d - 2 * (KIT.T - 0.01), 1))


def porch(asm, B, w, d, H, spec):
    """posts, a beam and a lean-to roof over a deck in front of the house"""
    pd = spec['porch']
    y_wall = -d / 2
    y_post = y_wall - pd + 0.10
    zb_top = 2.22
    z_wall = 2.52
    # the deck: floor boards in front, from the deck's edge to the wall
    n, k = modules(pd)
    for i in range(n):
        asm.put('floor', B @ Matrix.Translation((0, y_wall - pd + (i + 0.5) * k, -0.14)) @ scale3(w, k, 1))
    # posts and the beam on them
    for x in (-w / 2 + 0.25, 0.0, w / 2 - 0.25):
        asm.put('post', B @ Matrix.Translation((x, y_post, 0)) @ scale3(1, 1, zb_top - 0.2))
    asm.put('beam', B @ Matrix.Translation((0, y_post, zb_top - 0.2)) @ scale3(w + 0.1, 1, 1))
    # the lean-to roof: underside through the beam's top front edge, up to the wall
    y_edge = y_post - 0.075
    p = (z_wall - zb_top) / (y_wall - y_edge)
    y_e = y_edge - 0.25
    run = y_wall - y_e
    z_e = zb_top - p * 0.25
    xa, xb = -(w / 2 + 0.15), w / 2 + 0.15
    roof_modules(asm, B, xa, xb, y_e, z_e, run, p, 0, seed=2)
    # flashing over its top end, verges on its sides
    asm.put('verge', B @ Matrix.Translation((0, y_wall - 0.05, z_wall + 0.06 + 0.002 - 0.16)) @ rot_z(180)
            @ scale3(xb - xa + 0.07, 1, 1))
    for sx in (-1, 1):
        verge_along(asm, B, sx * xb, -sx, (y_e, z_e), (y_wall, z_wall), ext_lo=0.02, ext_hi=0.0)
    # a step down from the deck at the door
    da = spec['doorAt']
    asm.put('step', B @ Matrix.Translation((da, y_wall - pd - 0.18, -0.22)) @ scale3(1.2, 0.36, 1))


# ------------------------------------------------------------------------------------------------ the two buildings

FARM = dict(roof='gable', doorAt=-1.7, doorW=1.0, gate=False, windows=[1.9], windowW=1.3, sideWindows=True,
            backWindow=True, porch=1.7, porchPosts=True, chimney=True, sign=None, shutters=True, ceiling=True,
            door='door_wood', doorOpen=70)
GARAGE = dict(roof='mono', doorAt=-2.3, doorW=4.4, gate=True, windows=[3.7], windowW=1.6, sideWindows=False,
              porch=0, sign='wrench', floor='floor_slab', gateDown=0.4)

SHOP = dict(roof='flat', doorAt=0.0, doorW=1.5, gate=False, windows=[-3.7, 3.7], windowW=2.8, sideWindows=False,
            porch=0, awning=2.2, sign='shop', door='door_shop', doorOpen=60, floor='floor_slab')

COLORS = {'farm': (0xd9b469, 0xf0e8d2), 'garage': (0xb8604c, 0xe9e2d0), 'shop': (0x9dbdb3, 0xeef0e4),
          'shed': (0xb8604c, 0xf0e8d2),
          'sign': (0x4f7f8a, 0xf2ecdc)}


def srgb_inv(v):
    """the linear value that the Standard view transform writes out as v"""
    return v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4


def srgb(h):
    c = (((h >> 16) & 255) / 255, ((h >> 8) & 255) / 255, (h & 255) / 255)
    return tuple(x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c)


# ------------------------------------------------------------------------------------------------ cel previews

PREVIEW = {
    # base colour (linear), metal-ish (gets the bright step), for the cel look (as the kit's toon previews)
    'steel': ((0.42, 0.43, 0.45), True), 'rust': ((0.42, 0.17, 0.07), False), 'wood': ((0.45, 0.28, 0.14), False),
    'glass': ((0.16, 0.21, 0.26), True), 'alu': ((0.7, 0.71, 0.72), True), 'rubber': ((0.05, 0.05, 0.055), False),
    'trim': ((0.03, 0.03, 0.035), False), 'ceramic': ((0.86, 0.86, 0.84), True), 'fabric': ((0.35, 0.22, 0.16), False),
    'chrome': ((0.9, 0.9, 0.92), True),
}


def _sock(sockets, name, kind):
    for s in sockets:
        if s.name == name and s.type == kind:
            return s
    raise KeyError(name)


def toon(m, c3, bright):
    """the cel look of the kit's previews (lit and shadow tones, a hard terminator, AO from 'Col')"""
    m.use_nodes = True
    nt = m.node_tree
    for n in list(nt.nodes):
        nt.nodes.remove(n)
    out = nt.nodes.new('ShaderNodeOutputMaterial')
    em = nt.nodes.new('ShaderNodeEmission')
    nt.links.new(em.outputs[0], out.inputs['Surface'])
    ao = nt.nodes.new('ShaderNodeVertexColor')
    ao.layer_name = 'Col'
    dif = nt.nodes.new('ShaderNodeBsdfDiffuse')
    s2r = nt.nodes.new('ShaderNodeShaderToRGB')
    nt.links.new(dif.outputs[0], s2r.inputs[0])
    bw = nt.nodes.new('ShaderNodeRGBToBW')
    nt.links.new(s2r.outputs['Color'], bw.inputs[0])
    ramp = nt.nodes.new('ShaderNodeValToRGB')
    ramp.color_ramp.interpolation = 'CONSTANT'
    els = ramp.color_ramp.elements
    lit = [min(1.0, c * 1.05) for c in c3]
    shade = [c * k for c, k in zip(c3, (0.42, 0.48, 0.66))]
    els[0].position = 0.0
    els[0].color = (*shade, 1)
    els[1].position = 0.3
    els[1].color = (*lit, 1)
    if bright:
        e = els.new(0.92)
        e.color = (min(1, lit[0] * 1.35 + 0.1), min(1, lit[1] * 1.35 + 0.1), min(1, lit[2] * 1.35 + 0.1), 1)
    nt.links.new(bw.outputs[0], ramp.inputs['Fac'])
    mul = nt.nodes.new('ShaderNodeMix')
    mul.data_type = 'RGBA'
    mul.blend_type = 'MULTIPLY'
    _sock(mul.inputs, 'Factor', 'VALUE').default_value = 0.85
    nt.links.new(ramp.outputs['Color'], _sock(mul.inputs, 'A', 'RGBA'))
    nt.links.new(ao.outputs['Color'], _sock(mul.inputs, 'B', 'RGBA'))
    nt.links.new(_sock(mul.outputs, 'Result', 'RGBA'), em.inputs['Color'])


def flat(m, c3, strength=1.0):
    m.use_nodes = True
    nt = m.node_tree
    for n in list(nt.nodes):
        nt.nodes.remove(n)
    out = nt.nodes.new('ShaderNodeOutputMaterial')
    em = nt.nodes.new('ShaderNodeEmission')
    em.inputs['Color'].default_value = (*c3, 1)
    em.inputs['Strength'].default_value = strength
    nt.links.new(em.outputs[0], out.inputs['Surface'])


LOOKS = {}


def setup_looks(lib, colors=COLORS):
    """each material's cel colour, and an id (a flat colour of its own) for the ink pass"""
    LOOKS.clear()
    for k, (name, m) in enumerate(sorted(lib.mats.items())):
        base, _, tag = name.partition('.')
        if base in ('paint', 'paint_b'):
            hexes = colors.get(tag, (0xc9a0a0, 0xe6dccb))
            look = (srgb(hexes[0] if base == 'paint' else hexes[1]), True)
        elif base in PREVIEW:
            look = PREVIEW[base]
        else:
            look = ((0.6, 0.6, 0.6), False)
        # (an id colour right on the ink pass's bins, so that no rounding can flip it)
        q = (k * 7 + 3) % 32, (k * 13 + 11) % 32, (k * 19 + 23) % 32
        LOOKS[m.name] = (look, tuple(srgb_inv(c / 31.0) for c in q))
    set_mode('toon')


def set_mode(mode):
    """'toon': the cel look; 'id': every material a flat colour of its own (the game inks where ids change)"""
    for name, (look, idc) in LOOKS.items():
        m = bpy.data.materials[name]
        if mode == 'toon':
            toon(m, *look)
        else:
            flat(m, idc)
    g = bpy.data.materials.get('_ground')
    if g is not None:
        if mode == 'toon':
            flat(g, (0.25, 0.36, 0.14))
        else:
            flat(g, (0.05, 0.9, 0.1))
    w = bpy.context.scene.world
    if w is not None and w.node_tree:
        bg = w.node_tree.nodes.get('Background')
        bg.inputs['Color'].default_value = (0.62, 0.70, 0.80, 1) if mode == 'toon' else (0.0, 0.0, 1.0, 1)


def ground(z=-0.14, size=80.0, color=(0.30, 0.42, 0.18)):
    bm = bmesh.new()
    bmesh.ops.create_circle(bm, cap_ends=True, segments=48, radius=size)
    bm.normal_update()
    for f in bm.faces:
        if f.normal.z < 0:
            f.normal_flip()
    me = bpy.data.meshes.new('_ground')
    bm.to_mesh(me)
    bm.free()
    o = bpy.data.objects.new('_ground', me)
    bpy.context.scene.collection.objects.link(o)
    o.location.z = z
    m = bpy.data.materials.new('_ground')
    toon(m, color, False)
    me.materials.append(m)
    return o


def ink_pass(toon_path, id_path, out_path, width=1, ink=(0.16, 0.10, 0.09), strength=0.85):
    """the game's ink (frame.ts inkAt): darken where the material id changes from a neighbour 1 px away"""
    import numpy as np
    a = bpy.data.images.load(toon_path)
    b = bpy.data.images.load(id_path)
    w, h = a.size
    col = np.array(a.pixels[:], dtype=np.float32).reshape(h, w, 4)
    ids = np.array(b.pixels[:], dtype=np.float32).reshape(h, w, 4)[:, :, :3]
    q = np.round(ids * 31).astype(np.int32)
    key = q[:, :, 0] * 1024 + q[:, :, 1] * 32 + q[:, :, 2]
    edge = np.zeros((h, w), dtype=bool)
    for k in range(1, width + 1):
        edge[:, :-k] |= key[:, :-k] != key[:, k:]
        edge[:-k, :] |= key[:-k, :] != key[k:, :]
    m = edge[:, :, None] * strength
    inkc = np.array([*ink, 1.0], dtype=np.float32)
    col = col * (1 - m) + (col * inkc) * m
    col[:, :, 3] = 1.0
    out = bpy.data.images.new('_ink', w, h)
    out.pixels[:] = col.reshape(-1)
    out.filepath_raw = out_path
    out.file_format = 'PNG'
    out.save()
    for im in (a, b, out):
        bpy.data.images.remove(im)


def scene_setup(size):
    scene = bpy.context.scene
    w = scene.world or bpy.data.worlds.new('World')
    scene.world = w
    w.use_nodes = True
    bg = w.node_tree.nodes.get('Background')
    bg.inputs['Color'].default_value = (0.62, 0.70, 0.80, 1)
    bg.inputs['Strength'].default_value = 1.0
    scene.render.engine = 'BLENDER_EEVEE'
    scene.render.resolution_x, scene.render.resolution_y = size
    scene.view_settings.view_transform = 'Standard'
    scene.view_settings.look = 'None'
    scene.render.use_freestyle = False
    scene.render.line_thickness_mode = 'ABSOLUTE'
    scene.render.line_thickness = 1.2
    fs = scene.view_layers[0].freestyle_settings
    fs.crease_angle = math.radians(128)
    ls = fs.linesets[0] if fs.linesets else fs.linesets.new('lines')
    ls.select_by_visibility = True
    ls.select_silhouette = True
    ls.select_border = True
    ls.select_crease = True
    ls.select_material_boundary = True
    if ls.linestyle is None:
        ls.linestyle = bpy.data.linestyles.new('toon_lines')
    ls.linestyle.color = (0.16, 0.10, 0.09)
    ls.linestyle.thickness = 1.2
    try:
        scene.eevee.taa_render_samples = 24
    except Exception:
        pass
    sun = bpy.data.lights.new('toon_sun', 'SUN')
    sun.energy = 4.0
    so = bpy.data.objects.new('toon_sun', sun)
    scene.collection.objects.link(so)
    cd = bpy.data.cameras.new('cam')
    cam = bpy.data.objects.new('cam', cd)
    scene.collection.objects.link(cam)
    scene.camera = cam
    return so, cam


def bounds(objs):
    pts = []
    for o in objs:
        if o.type != 'MESH':
            continue
        mw = o.matrix_world
        for c in o.bound_box:
            pts.append(mw @ V(c))
    lo = V((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
    hi = V((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
    return lo, hi


def shoot(path, so, cam, target, yaw, pitch, dist, lens=35.0, sun_yaw=None):
    yw, pt = math.radians(yaw), math.radians(pitch)
    d = V((math.cos(yw) * math.cos(pt), -math.sin(yw) * math.cos(pt), math.sin(pt)))
    az = -(yaw if sun_yaw is None else sun_yaw) + 50.0
    so.rotation_euler = (math.radians(90 - 45), 0, math.radians(az + 90))
    cam.data.lens = lens
    cam.data.clip_start = 0.05
    cam.data.clip_end = 500.0
    cam.location = target + d * dist
    cam.rotation_euler = (target - cam.location).to_track_quat('-Z', 'Y').to_euler()
    render_inked(path)


def render_inked(path):
    """the cel render, the id render, and the ink where the ids change (as the game draws its lines)"""
    scene = bpy.context.scene
    tmp_t, tmp_i = path[:-4] + '_t.png', path[:-4] + '_i.png'
    set_mode('toon')
    scene.render.filter_size = 1.5
    scene.eevee.taa_render_samples = 24
    scene.render.filepath = tmp_t
    bpy.ops.render.render(write_still=True)
    set_mode('id')
    scene.render.filter_size = 0.0
    scene.eevee.taa_render_samples = 1
    dither = scene.render.dither_intensity
    scene.render.dither_intensity = 0.0
    scene.render.filepath = tmp_i
    bpy.ops.render.render(write_still=True)
    scene.render.dither_intensity = dither
    ink_pass(tmp_t, tmp_i, path, width=1 if scene.render.resolution_x < 2000 else 2)
    set_mode('toon')
    for t in (tmp_t, tmp_i):
        os.remove(t)
    print(f'TEST wrote {path}')


def frame_dist(lo, hi, lens, aspect, margin=1.08):
    c = (lo + hi) / 2
    rad = (hi - lo).length / 2
    fov = 2 * math.atan(18.0 / lens) * min(1.0, 1.0 / aspect)
    return c, rad / math.sin(fov / 2) * margin


def report(asm):
    rows = ', '.join(f'{k} x{v}' for k, v in sorted(asm.count.items()))
    print(f'TEST {asm.tag}: {len(asm.objs)} pieces: {rows}')


def build_farm(lib):
    asm = Asm(lib, 'farm', COLORS['farm'])
    w, d = 8.6, 6.6
    building(asm, Matrix.Identity(4), w, d, 2.9, FARM, rise=1.6, chimney_at=(w / 2 * 0.45, d / 2 * 0.25))
    report(asm)
    return asm


def build_garage(lib):
    asm = Asm(lib, 'garage', COLORS['garage'])
    building(asm, Matrix.Identity(4), 11.6, 8.2, 4.0, GARAGE, rise=8.2 * 0.2)
    report(asm)
    return asm


SHED = dict(roof='mono', doorAt=0.0, doorW=1.8, gate=False, windows=[], sideWindows=False, porch=0,
            door='door_shed', doorOpen=55, floor='floor')


def build_shed(lib):
    asm = Asm(lib, 'shed', COLORS['shed'])
    building(asm, Matrix.Identity(4), 3.4, 2.8, 2.2, SHED, rise=2.8 * 0.2)
    report(asm)
    return asm


def build_shop(lib):
    asm = Asm(lib, 'shop', COLORS['shop'])
    building(asm, Matrix.Identity(4), 12.0, 7.0, 3.3, SHOP)
    report(asm)
    return asm


def render_building(name, builder, close, blend):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    lib = Lib()
    asm = builder(lib)
    ground()
    setup_looks(lib)
    size = (1400, 950)
    so, cam = scene_setup(size)
    lo, hi = bounds(asm.objs)
    c, dist = frame_dist(lo, hi, 35.0, size[0] / size[1], 0.78)
    c.z = lo.z + (hi.z - lo.z) * 0.42
    shoot(os.path.join(SCR, f'test_{name}_front.png'), so, cam, c, 35, 16, dist)
    shoot(os.path.join(SCR, f'test_{name}_back.png'), so, cam, c, 215, 18, dist)
    if close:
        for (tag, tgt, yaw, pitch, dd, lens) in CLOSE[name](lo, hi):
            shoot(os.path.join(SCR, f'test_{name}_{tag}.png'), so, cam, V(tgt), yaw, pitch, dd, lens=lens)
    if blend:
        bpy.ops.wm.save_as_mainfile(filepath=os.path.join(SCR, f'test_{name}.blend'))


CLOSE = {
    'farm': lambda lo, hi: [
        ('eave_fl', (-4.3, -3.3, 2.9), 50, 10, 2.6, 35), ('eave_br', (4.3, 3.3, 2.9), 230, 12, 2.6, 35),
        ('door', (-1.7, -3.3, 1.2), 70, 8, 5.5, 35), ('ridge', (-4.3, 0.0, 4.4), 160, 25, 3.0, 35),
        ('window', (1.9, -3.3, 1.5), 80, 5, 3.6, 35), ('under', (-4.0, -3.6, 2.5), 60, -25, 2.4, 30),
        ('inside', (0.0, 0.0, 1.4), 90, 0, 0.1, 18),
        ('flashing', (2.5, -3.4, 2.5), 30, 25, 2.2, 35), ('chimney', (1.94, 0.83, 4.4), 20, 30, 3.2, 35),
        ('apex', (4.3, 0.0, 4.5), 0, 8, 2.2, 35),
    ],
    'shed': lambda lo, hi: [('door', (0.0, -1.4, 1.1), 75, 6, 4.0, 35)],
    'shop': lambda lo, hi: [
        ('awning', (0.0, -4.0, 2.6), 60, 12, 6.0, 35), ('corner_fr', (6.0, -3.5, 3.4), 40, 20, 3.0, 35),
        ('roof', (2.0, 0.0, 3.4), 200, 45, 7.0, 35), ('door', (0.0, -3.5, 1.2), 85, 4, 4.5, 35),
    ],
    'garage': lambda lo, hi: [
        ('gate', (-2.3, -4.1, 2.0), 70, 8, 8.5, 35), ('corner_fl', (-5.8, -4.1, 4.6), 50, 10, 3.5, 35),
        ('corner_br', (5.8, 4.1, 3.6), 230, 12, 3.5, 35), ('high_edge', (5.8, -4.1, 5.7), 40, 25, 3.0, 35),
        ('sign', (-2.3, -4.1, 3.9), 85, 6, 3.4, 35), ('under', (5.5, -4.3, 5.2), 70, -30, 2.4, 30),
        ('inside', (2.0, 2.5, 2.0), 250, 18, 0.1, 18),
    ],
}


# ------------------------------------------------------------------------------------------------ contact sheet

def contact_sheet():
    """Every piece as built, each fitted to a cell, seen from the front three-quarters (ortho), labelled."""
    bpy.ops.wm.read_factory_settings(use_empty=True)
    lib = Lib()
    asm = Asm(lib, 'sheet', (0xd9b469, 0xf0e8d2))
    names = list(KIT.SPECS)
    cols = 7
    cell = 2.0
    yaw, pitch = 35.0, 20.0
    yw, pt = math.radians(yaw), math.radians(pitch)
    d = V((math.cos(yw) * math.cos(pt), -math.sin(yw) * math.cos(pt), math.sin(pt)))
    f = -d
    right = f.cross(V((0, 0, 1))).normalized()
    up = right.cross(f).normalized()
    labels = []
    for i, name in enumerate(names):
        me = lib.mesh(name)
        xs = [v.co for v in me.vertices]
        lo = V((min(p.x for p in xs), min(p.y for p in xs), min(p.z for p in xs)))
        hi = V((max(p.x for p in xs), max(p.y for p in xs), max(p.z for p in xs)))
        k = 1.25 / max((hi - lo).length, 1e-3)
        cen = (lo + hi) / 2
        r, c = divmod(i, cols)
        at = right * (c * cell) - up * (r * cell * 1.08)
        rot = Matrix.Identity(4)
        if name.startswith('pict_') or name in ('signboard',):
            rot = rot_z(50)
        M = Matrix.Translation(at) @ rot @ Matrix.Scale(k, 4) @ Matrix.Translation(-cen)
        asm.put(name, M)
        sp = KIT.SPECS[name]
        size = 'x'.join(f'{b - a:.2f}' for a, b in zip(sp['lo'], sp['hi']))
        labels.append((f'{name}  {size}', at - up * 0.82, k))
    setup_looks(lib, {'sheet': (0xd9b469, 0xf0e8d2)})
    lab_mat = bpy.data.materials.new('_label')
    flat(lab_mat, (0.05, 0.04, 0.04))
    for (name, at, k) in labels:
        cu = bpy.data.curves.new('_label', 'FONT')
        cu.body = name
        cu.align_x = 'CENTER'
        cu.size = 0.14
        t = bpy.data.objects.new('_label', cu)
        bpy.context.scene.collection.objects.link(t)
        t.data.materials.append(lab_mat)
        t.matrix_world = Matrix.Translation(at) @ Matrix((right, up, d)).transposed().to_4x4()
    rows = (len(names) + cols - 1) // cols
    size = (2400, int(2400 * (rows * 1.08) / cols) + 60)
    so, cam = scene_setup(size)
    cam.data.type = 'ORTHO'
    cam.data.ortho_scale = cols * cell
    centre = right * ((cols - 1) * cell / 2) - up * ((rows - 1) * cell * 1.08 / 2) - up * 0.15
    cam.location = centre + d * 40
    cam.rotation_euler = (-d).to_track_quat('-Z', 'Y').to_euler()
    cam.data.clip_end = 200
    az = -yaw + 50.0
    so.rotation_euler = (math.radians(45), 0, math.radians(az + 90))
    render_inked(os.path.join(SCR, 'kit_contact_sheet.png'))


def main(args):
    what = [a for a in args if not a.startswith('--')] or ['all']
    close = '--close' in args
    blend = '--blend' in args
    if 'farm' in what or 'all' in what:
        render_building('farm', build_farm, close, blend)
    if 'garage' in what or 'all' in what:
        render_building('garage', build_garage, close, blend)
    if 'shed' in what or 'all' in what:
        render_building('shed', build_shed, close, blend)
    if 'shop' in what or 'all' in what:
        render_building('shop', build_shop, close, blend)
    if 'sheet' in what or 'all' in what:
        contact_sheet()
