"""
The kitchen's cookware (docs/V3/plan/cooking.md §4): things one carries, sets down and cooks with —

    blender -b --factory-startup --python tools/blender/build.py -- items/cookware [<model>|all] [--norender] [--look]

    kit_stove    a cassette stove (face +X): its burner on the left, the canister's bay under a cover on the right,
                 a lever that locks the canister, the knob
    kit_hob      an electric hotplate (face +X): the stove's size, its plate where the stove's burner is, the knob where
                 the stove's is, a panel with its lamp where the stove has its bay, a cord out of the back
    kit_gas      a gas canister, standing
    kit_board    a chopping board, its knife lying along it
    kit_pan      a frying pan            kit_pot      a soup pot, its lid
    kit_bowl     a mixing bowl           kit_grill    a ridged grill plate
    kit_steamer  a bamboo steamer, its lid      kit_oven   a cast-iron camp oven, its lid
    kit_kettle   a kettle, its lid       kit_plate    a plate        kit_dish   a small bowl
    kit_spice    the seasonings in their caddy: salt, pepper, soy sauce, oil, sugar, vinegar
    kit_cooler   a camping cooler: its lid hinged at the back (LID), a carrying handle at each end, a latch at the front

Writes public/models/modcar/items/<model>.glb: root mesh PART, origin at the bottom centre, resting on z = 0, +X its
front, conventional material names only, AO in 'Col'. What moves is a child mesh with its origin on its pivot, named
as the game keeps such pieces apart (COVER, LEVER, KNOB_fire, LID, P_knife); where a thing goes on another is an
empty: M_pot (a vessel on the stove), M_flame, M_can (the canister in its bay, lying along X), M_food (what is in a
vessel or on the board), M_knife (the knife at work). `paint` and `paint_b` take the item's two colours.
"""
import math

import bmesh
from mathutils import Matrix

from parts import _kit as K
from parts._kit import mat4

OUT = 'public/models/modcar/items'
TAU = math.tau


def D(*rad):
    """Radians in, the kit's degrees out."""
    return tuple(math.degrees(a) for a in rad)


# ------------------------------------------------------------------------------------------------ the stove

def kit_stove(P):
    P.ao_distance = 0.06
    dx, wy, h = 0.27, 0.37, 0.078           # front to back, side to side, the body's height
    zf = 0.012                               # on its feet
    top = zf + h
    yb, yc = -0.068, 0.122                   # the burner's centre line, the bay's
    body = P.box('body', (dx, wy, h), (0, 0, zf + h / 2), 'paint', bev=0.012, segs=1)
    # the canister's bay: a trough cut into the body from above
    cut = bmesh.new()
    K.bm_cube(cut, (dx - 0.046, 0.092, 0.2), mat4((0.0, yc, top + 0.1 - 0.07)))
    P.cut(body, cut)
    P.box('bay_floor', (dx - 0.05, 0.088, 0.003), (0.0, yc, top - 0.0695), 'trim', bev=None)
    # the regulator the canister's nozzle goes into, at the front of the bay
    P.cyl('regulator', 0.014, 0.012, (dx / 2 - 0.03, yc, top - 0.036), 'steel', axis='X', segs=24, bev=None)
    # the top under the burner: a pressed tray, the burner, its cap, four rests
    P.box('tray', (dx - 0.036, 0.222, 0.006), (0.0, yb, top + 0.001), 'trim', bev=0.003)
    P.cyl('burner', 0.036, 0.02, (0.0, yb, top + 0.012), 'steel', segs=40, r2=0.032, bev=None)
    P.torus('ports', 0.032, 0.0045, (0.0, yb, top + 0.02), 'trim', segs=40, rsegs=8)
    for i in range(24):
        a = TAU * i / 24
        P.cyl(f'port{i}', 0.0018, 0.006, (0.0322 * math.cos(a), yb + 0.0322 * math.sin(a), top + 0.0215), 'trim', segs=8, rot=D(0.0, math.pi / 2, a), bev=None)
    P.cyl('cap', 0.026, 0.008, (0.0, yb, top + 0.026), 'alu', segs=40, r2=0.022, bev=None)
    for k in range(4):
        a = TAU * k / 4 + TAU / 8
        P.box(f'rest{k}', (0.056, 0.008, 0.026), (0.078 * math.cos(a), yb + 0.078 * math.sin(a), top + 0.016), 'trim', rot=D(0.0, 0.0, a), bev=None)
    for sx in (-1, 1):
        for sy in (-1, 1):
            P.cyl('foot', 0.012, zf + 0.004, (sx * (dx / 2 - 0.035), sy * (wy / 2 - 0.035), (zf + 0.004) / 2), 'rubber', segs=18, bev=None)
    # a strip of the second colour along the front, the maker's plate
    P.box('strip', (0.003, 0.2, 0.012), (dx / 2 + 0.0008, yb + 0.01, zf + 0.022), 'paint_b', bev=None)
    # the cover over the bay, hinged along the back
    cw, cl = 0.104, dx - 0.03
    cover = P.box('cover', (cl, cw, 0.006), (0.0, yc, top + 0.0035), 'paint_b', bev=0.0025, segs=1)
    grip = P.box('grip', (0.012, 0.05, 0.006), (cl / 2 - 0.012, yc, top + 0.0085), 'trim', bev=0.002, segs=1)
    P.mover('COVER', [cover, grip], (-cl / 2, yc, top + 0.0035))
    # the lever on the front, right: down is locked
    lv = P.box('lever', (0.03, 0.03, 0.009), (dx / 2 + 0.017, yc + 0.01, zf + 0.036), 'trim', bev=0.003, segs=1)
    lk = P.cyl('lever_hub', 0.009, 0.034, (dx / 2 + 0.004, yc + 0.01, zf + 0.036), 'steel', axis='Y', segs=18, bev=None)
    P.mover('LEVER', [lv, lk], (dx / 2 + 0.004, yc + 0.01, zf + 0.036))
    # the knob, left of the lever
    kn = P.cyl('knob', 0.02, 0.018, (dx / 2 + 0.01, 0.036, zf + 0.04), 'trim', axis='X', segs=40, r2=0.017, bev=None)
    kp = P.box('pointer', (0.006, 0.006, 0.02), (dx / 2 + 0.02, 0.036, zf + 0.049), 'paint_b', bev=None)
    ribs = [P.box(f'knob_rib{i}', (0.016, 0.003, 0.003), (dx / 2 + 0.011, 0.036 + 0.0185 * math.cos(TAU * i / 12), zf + 0.04 + 0.0185 * math.sin(TAU * i / 12)), 'trim', rot=D(TAU * i / 12, 0.0, 0.0), bev=None) for i in range(12)]
    P.mover('KNOB_fire', [kn, kp, *ribs], (dx / 2 + 0.01, 0.036, zf + 0.04))
    P.empty('M_pot', (0.0, yb, top + 0.029))
    P.empty('M_flame', (0.0, yb, top + 0.03))
    P.empty('M_can', (-0.012, yc, top - 0.034))
    P.views = [('a', 35, 32), ('b', 325, 32)]


def kit_stove2(P):
    """A two-burner camp stove (docs/V3/plan/finish.md §八 6; faces +X): the cassette stove's layout twice over in one
    body. Each half has its burner, its knob (KNOB_fire; the second half's KNOB_fire_B), its canister's bay under a
    cover (COVER, COVER_B) with its lever (LEVER, LEVER_B) and its markers (M_pot, M_flame, M_can; the second's with
    _B — not _1: a loaded mesh of several materials is a group whose pieces are named so). The first half is the one
    at −Y; a carrying handle at each end."""
    P.ao_distance = 0.06
    dx, wy, h = 0.27, 0.75, 0.078           # front to back, side to side, the body's height
    zf = 0.012                               # on its feet
    top = zf + h
    half = 0.19                              # each half's middle, from the body's
    body = P.box('body', (dx, wy, h), (0, 0, zf + h / 2), 'paint', bev=0.012, segs=1)
    for k, oy in enumerate((-half, half)):
        sfx = '' if k == 0 else '_B'
        yb, yc = oy - 0.068, oy + 0.122      # the burner's centre line, the bay's
        cut = bmesh.new()
        K.bm_cube(cut, (dx - 0.046, 0.092, 0.2), mat4((0.0, yc, top + 0.1 - 0.07)))
        P.cut(body, cut)
        P.box('bay_floor', (dx - 0.05, 0.088, 0.003), (0.0, yc, top - 0.0695), 'trim', bev=None)
        P.cyl('regulator', 0.014, 0.012, (dx / 2 - 0.03, yc, top - 0.036), 'steel', axis='X', segs=24, bev=None)
        P.box('tray', (dx - 0.036, 0.222, 0.006), (0.0, yb, top + 0.001), 'trim', bev=0.003)
        P.cyl('burner', 0.036, 0.02, (0.0, yb, top + 0.012), 'steel', segs=40, r2=0.032, bev=None)
        P.torus('ports', 0.032, 0.0045, (0.0, yb, top + 0.02), 'trim', segs=40, rsegs=8)
        for i in range(24):
            a = TAU * i / 24
            P.cyl(f'port{k}_{i}', 0.0018, 0.006, (0.0322 * math.cos(a), yb + 0.0322 * math.sin(a), top + 0.0215), 'trim', segs=8,
                  rot=D(0.0, math.pi / 2, a), bev=None)
        P.cyl('cap', 0.026, 0.008, (0.0, yb, top + 0.026), 'alu', segs=40, r2=0.022, bev=None)
        for j in range(4):
            a = TAU * j / 4 + TAU / 8
            P.box(f'rest{k}_{j}', (0.056, 0.008, 0.026), (0.078 * math.cos(a), yb + 0.078 * math.sin(a), top + 0.016), 'trim',
                  rot=D(0.0, 0.0, a), bev=None)
        P.box('strip', (0.003, 0.2, 0.012), (dx / 2 + 0.0008, yb + 0.01, zf + 0.022), 'paint_b', bev=None)
        # the cover over the bay, hinged along the back
        cw, cl = 0.104, dx - 0.03
        cover = P.box('cover', (cl, cw, 0.006), (0.0, yc, top + 0.0035), 'paint_b', bev=0.0025, segs=1)
        grip = P.box('grip', (0.012, 0.05, 0.006), (cl / 2 - 0.012, yc, top + 0.0085), 'trim', bev=0.002, segs=1)
        P.mover('COVER' + sfx, [cover, grip], (-cl / 2, yc, top + 0.0035))
        # the lever on the front: down is locked
        lv = P.box('lever', (0.03, 0.03, 0.009), (dx / 2 + 0.017, yc + 0.01, zf + 0.036), 'trim', bev=0.003, segs=1)
        lk = P.cyl('lever_hub', 0.009, 0.034, (dx / 2 + 0.004, yc + 0.01, zf + 0.036), 'steel', axis='Y', segs=18, bev=None)
        P.mover('LEVER' + sfx, [lv, lk], (dx / 2 + 0.004, yc + 0.01, zf + 0.036))
        # the knob, beside the lever
        ky = oy + 0.036
        kn = P.cyl('knob', 0.02, 0.018, (dx / 2 + 0.01, ky, zf + 0.04), 'trim', axis='X', segs=40, r2=0.017, bev=None)
        kp = P.box('pointer', (0.006, 0.006, 0.02), (dx / 2 + 0.02, ky, zf + 0.049), 'paint_b', bev=None)
        ribs = [P.box(f'knob_rib{k}_{i}', (0.016, 0.003, 0.003),
                      (dx / 2 + 0.011, ky + 0.0185 * math.cos(TAU * i / 12), zf + 0.04 + 0.0185 * math.sin(TAU * i / 12)), 'trim',
                      rot=D(TAU * i / 12, 0.0, 0.0), bev=None) for i in range(12)]
        P.mover('KNOB_fire' + sfx, [kn, kp, *ribs], (dx / 2 + 0.01, ky, zf + 0.04))
        P.empty('M_pot' + sfx, (0.0, yb, top + 0.029))
        P.empty('M_flame' + sfx, (0.0, yb, top + 0.03))
        P.empty('M_can' + sfx, (-0.012, yc, top - 0.034))
    for sx in (-1, 1):
        for sy in (-1, 1):
            P.cyl('foot', 0.012, zf + 0.004, (sx * (dx / 2 - 0.035), sy * (wy / 2 - 0.035), (zf + 0.004) / 2), 'rubber', segs=18, bev=None)
    for sy in (-1, 1):
        P.box('handle', (0.09, 0.012, 0.012), (0.0, sy * (wy / 2 + 0.008), zf + 0.05), 'trim', bev=0.003, segs=1)
        for sx in (-1, 1):
            P.box('handle_arm', (0.008, 0.012, 0.012), (sx * 0.041, sy * (wy / 2 + 0.002), zf + 0.05), 'trim', bev=None)
    P.views = [('a', 35, 32), ('b', 325, 32)]


def kit_hob(P):
    """An electric hotplate (docs/V3/plan/rv.md R2: four of them are the Old Elephant's range) in the cassette stove's size
    and layout — its plate where the stove's burner is (M_pot, M_flame the same), the knob where the stove's is
    (KNOB_fire) — a panel on the right with the power lamp and a grille where the stove has its bay, a cord out of the
    back. Faces +X."""
    P.ao_distance = 0.06
    dx, wy, h = 0.27, 0.37, 0.07
    zf = 0.012
    top = zf + h
    yb, yc = -0.068, 0.122
    P.box('body', (dx, wy, h), (0, 0, zf + h / 2), 'paint', bev=0.012, segs=1)
    # the top: a dark glass panel over it all, the plate let into it with its chrome rim, the element's grooves
    P.box('glass', (dx - 0.016, wy - 0.016, 0.004), (0.0, 0.0, top + 0.001), 'trim', bev=0.0015, segs=1)
    P.cyl('plate', 0.082, 0.007, (0.0, yb, top + 0.005), 'steel', segs=48, bev=0.0015, bsegs=1)
    P.torus('plate_rim', 0.0845, 0.003, (0.0, yb, top + 0.006), 'chrome', segs=48, rsegs=6)
    for r in (0.025, 0.045, 0.065):
        P.torus(f'groove{int(r * 1000)}', r, 0.0016, (0.0, yb, top + 0.0088), 'trim', segs=44, rsegs=5)
    P.cyl('hub', 0.012, 0.002, (0.0, yb, top + 0.0095), 'trim', segs=20, bev=None)
    # the panel on the right: its power lamp, a grille of slots, the maker's plate
    P.cyl('lamp', 0.0065, 0.004, (dx / 2 - 0.045, yc + 0.04, top + 0.004), 'cap_oil', segs=16, bev=None)
    for i in range(6):
        P.box(f'slot{i}', (0.09, 0.004, 0.0015), (-0.03, yc - 0.035 + i * 0.012, top + 0.0035), 'steel', bev=None)
    P.box('badge', (0.05, 0.024, 0.0015), (dx / 2 - 0.05, yc - 0.04, top + 0.0035), 'paint_b', bev=0.0006, segs=1)
    for sx in (-1, 1):
        for sy in (-1, 1):
            P.cyl('foot', 0.012, zf + 0.004, (sx * (dx / 2 - 0.035), sy * (wy / 2 - 0.035), (zf + 0.004) / 2), 'rubber', segs=18, bev=None)
    # a strip of the second colour along the front
    P.box('strip', (0.003, 0.2, 0.01), (dx / 2 + 0.0008, yb + 0.01, zf + 0.02), 'paint_b', bev=None)
    # the knob, where the stove's is, a pointer on it
    kn = P.cyl('knob', 0.02, 0.018, (dx / 2 + 0.01, 0.036, zf + 0.037), 'trim', axis='X', segs=40, r2=0.017, bev=None)
    kp = P.box('pointer', (0.006, 0.006, 0.02), (dx / 2 + 0.02, 0.036, zf + 0.046), 'paint_b', bev=None)
    ribs = [P.box(f'knob_rib{i}', (0.016, 0.003, 0.003), (dx / 2 + 0.011, 0.036 + 0.0185 * math.cos(TAU * i / 12), zf + 0.037 + 0.0185 * math.sin(TAU * i / 12)), 'trim', rot=D(TAU * i / 12, 0.0, 0.0), bev=None) for i in range(12)]
    P.mover('KNOB_fire', [kn, kp, *ribs], (dx / 2 + 0.01, 0.036, zf + 0.037))
    # the cord out of the back, its plug lying behind
    P.tube('cord', [(-dx / 2 + 0.004, 0.10, zf + 0.03), (-dx / 2 - 0.03, 0.11, zf + 0.012), (-dx / 2 - 0.07, 0.08, 0.006), (-dx / 2 - 0.09, 0.03, 0.006)],
           0.0035, 'rubber', segs=8, bend=0.02)
    P.box('plug', (0.03, 0.022, 0.014), (-dx / 2 - 0.105, 0.025, 0.008), 'trim', bev=0.003, segs=1)
    P.empty('M_pot', (0.0, yb, top + 0.0105))
    P.empty('M_flame', (0.0, yb, top + 0.0098))
    P.views = [('a', 35, 32), ('b', 325, 32)]


def kit_gas(P):
    """A gas canister, standing: its valve and collar up."""
    P.ao_distance = 0.04
    r, h = 0.034, 0.16
    P.lathe('can', [(0.0, 0.0), (r - 0.004, 0.0), (r, 0.005), (r, h - 0.012), (r - 0.006, h), (0.0, h)], (0, 0, 0), 'paint', segs=42, sharp=50.0)
    P.lathe('band', [(r + 0.0006, 0.045), (r + 0.0006, 0.105)], (0, 0, 0), 'paint_b', segs=42, sharp=80.0)
    for z in (0.045, 0.105):
        P.torus(f'band_edge{z}', r + 0.0008, 0.0012, (0, 0, z), 'trim', segs=48, rsegs=6)
    P.box('panel', (0.004, 0.03, 0.04), (r + 0.0006, 0.0, 0.075), 'ceramic', bev=0.001, segs=1)
    P.lathe('shoulder', [(r - 0.006, h), (r - 0.008, h + 0.006), (0.019, h + 0.012), (0.019, h + 0.02), (0.0, h + 0.02)], (0, 0, 0), 'steel', segs=42, sharp=50.0)
    P.cyl('valve', 0.006, 0.012, (0, 0, h + 0.026), 'steel', segs=24, bev=0.001)
    # the notch in the collar that the stove's guide fits
    P.box('notch', (0.008, 0.008, 0.01), (0.019, 0.0, h + 0.015), 'trim', bev=None)
    P.views = [('a', 35, 22)]


# ------------------------------------------------------------------------------------------------ the board

def kit_board(P):
    P.ao_distance = 0.05
    L, W, t = 0.36, 0.25, 0.02
    P.prism('board', K.rounded_rect(W, L, 0.022, 4), t, (0, 0, t / 2), 'paint', bev=0.004)
    # a juice groove round it, a hole to hang it by
    for (sx, sy, lx, ly) in ((0, 1, W - 0.05, 0.006), (0, -1, W - 0.05, 0.006), (1, 0, 0.006, L - 0.05), (-1, 0, 0.006, L - 0.05)):
        P.box('groove', (lx, ly, 0.0012), (sx * (W / 2 - 0.022), sy * (L / 2 - 0.022), t + 0.0002), 'paint_b', bev=None)
    P.cyl('hole', 0.009, 0.0014, (-W / 2 + 0.03, L / 2 - 0.03, t + 0.0002), 'trim', segs=24, bev=None)
    # (the grain of its wood: faint darker lines along it, wavering)
    for i in range(9):
        x = -W / 2 + 0.03 + (W - 0.06) * (i + 0.5) / 9
        pts = [(x + 0.004 * math.sin(k * 1.3 + i), -L / 2 + 0.04 + (L - 0.08) * k / 6, t + 0.0003) for k in range(7)]
        P.tube(f'grain{i}', pts, 0.0007, 'paint_b', segs=4, bend=0.6, sharp=80.0)
    # the knife, lying along the right-hand edge: its handle towards the cook
    bx, by = 0.02, 0.105
    blade = P.prism('blade', [(-0.11, -0.021), (0.05, -0.021), (0.05, 0.021), (-0.075, 0.021), (-0.11, 0.004)], 0.0022, (bx, by, t + 0.0016), 'steel', bev=None)
    handle = P.box('handle', (0.095, 0.022, 0.016), (bx + 0.098, by + 0.006, t + 0.008), 'paint_b', bev=0.005, segs=2)
    bolster = P.box('bolster', (0.012, 0.03, 0.012), (bx + 0.052, by + 0.002, t + 0.006), 'steel', bev=0.002, segs=1)
    rivets = [P.cyl(f'knife_rivet{k}', 0.0028, 0.0172, (bx + 0.08 + 0.03 * k, by + 0.006, t + 0.008), 'steel', segs=12, bev=None) for k in range(3)]
    P.mover('P_knife', [blade, handle, bolster, *rivets], (bx, by, t))
    P.empty('M_food', (-0.01, -0.03, t))
    P.empty('M_knife', (-0.01, -0.03, t))
    P.views = [('a', 35, 38)]


# ------------------------------------------------------------------------------------------------ vessels

def kit_pan(P):
    """A frying pan: its handle towards +X."""
    P.ao_distance = 0.06
    r, h = 0.125, 0.042
    P.lathe('pan', [(0.0, 0.0), (r * 0.82, 0.0), (r * 0.9, 0.006), (r, h), (r + 0.004, h + 0.002), (r + 0.004, h + 0.005), (r - 0.003, h + 0.005)], (0, 0, 0), 'paint', segs=54, sharp=50.0)
    P.lathe('inside', [(r - 0.003, h + 0.005), (r * 0.9 - 0.003, 0.009), (r * 0.82, 0.005), (0.0, 0.005)], (0, 0, 0), 'trim', segs=54, sharp=50.0)
    # (its neck riveted to the wall, a steel ferrule, the wooden handle with a hole to hang it by)
    P.tube('neck', [(r - 0.002, 0.0, h - 0.006), (r + 0.02, 0.0, h + 0.002), (r + 0.05, 0.0, h + 0.012)], 0.0085, 'steel', segs=18, bend=0.4,
           radius_fn=lambda t: 1.25 - 0.25 * t)
    P.box('plate', (0.006, 0.034, 0.03), (r - 0.0025, 0.0, h - 0.014), 'steel', bev=0.003, segs=2)
    for k, (dy, dz) in enumerate([(-0.01, -0.006), (0.01, -0.006), (0.0, -0.022)]):
        P.sphere(f'rivet{k}', 0.0042, (r + 0.0012, dy, h + dz), 'steel', u=12, v=8, scale=(0.6, 1.0, 1.0))
        P.sphere(f'rivet_in{k}', 0.0038, (r - 0.0068, dy, h + dz), 'steel', u=12, v=8, scale=(0.6, 1.0, 1.0))
    P.cyl('ferrule', 0.0128, 0.016, (r + 0.052, 0.0, h + 0.0128), 'steel', axis='X', rot=D(0.0, math.pi / 2 - 0.15, 0.0), segs=24, bev=0.0015)
    P.tube('handle', [(r + 0.058, 0.0, h + 0.0135), (r + 0.11, 0.0, h + 0.022), (r + 0.172, 0.0, h + 0.031)], 0.0125, 'wood', segs=24, bend=0.3,
           radius_fn=lambda t: 0.92 + 0.14 * math.sin(math.pi * min(1.0, t * 1.1)))
    P.sphere('handle_end', 0.0128, (r + 0.172, 0.0, h + 0.031), 'wood', u=20, v=10, scale=(0.55, 1.0, 1.0), rot=D(0.0, -0.15, 0.0))
    P.cyl('hang', 0.0042, 0.0255, (r + 0.15, 0.0, h + 0.028), 'trim', segs=16, rot=D(0.0, -0.15, 0.0), bev=None)
    P.torus('lip', r + 0.002, 0.0032, (0, 0, h + 0.003), 'paint', segs=64, rsegs=8)
    P.empty('M_food', (0.0, 0.0, 0.006))
    P.views = [('a', 35, 35)]


def kit_pot(P):
    """A soup pot: two ears, a lid with a knob."""
    P.ao_distance = 0.07
    r, h = 0.115, 0.125
    P.lathe('pot', [(0.0, 0.0), (r - 0.012, 0.0), (r, 0.012), (r, h), (r + 0.005, h + 0.002), (r + 0.005, h + 0.006), (r - 0.004, h + 0.006)], (0, 0, 0), 'paint', segs=54, sharp=50.0)
    P.lathe('inside', [(r - 0.004, h + 0.006), (r - 0.004, 0.014), (r - 0.014, 0.006), (0.0, 0.006)], (0, 0, 0), 'steel', segs=54, sharp=50.0)
    P.torus('rim', r + 0.003, 0.0035, (0, 0, h + 0.004), 'paint', segs=64, rsegs=8)
    for s in (-1, 1):
        P.torus(f'ear{s}', 0.024, 0.006, (0.0, s * (r + 0.012), h - 0.03), 'paint_b', segs=40, rsegs=9, arc=math.pi, a0=0.0 if s > 0 else math.pi)
        for dx in (-0.024, 0.024):
            P.sphere(f'rivet{s}{dx}', 0.0045, (dx, s * (r + 0.001), h - 0.03), 'steel', u=12, v=8, scale=(1.0, 0.6, 1.0))
    lid = P.lathe('lid', [(0.0, 0.004), (r - 0.006, 0.0), (r + 0.004, 0.0), (r + 0.002, 0.004), (r * 0.5, 0.016), (0.0, 0.02)], (0, 0, h + 0.006), 'paint', segs=54, sharp=50.0)
    knob = P.lathe('knob', [(0.0, 0.0), (0.008, 0.0), (0.008, 0.01), (0.018, 0.016), (0.018, 0.024), (0.0, 0.027)], (0, 0, h + 0.024), 'paint_b', segs=40, sharp=50.0)
    lid_rim = P.torus('lid_rim', r + 0.002, 0.003, (0, 0, h + 0.009), 'paint', segs=64, rsegs=8)
    steam = P.cyl('steam_hole', 0.0045, 0.004, (r * 0.62, 0.0, h + 0.017), 'trim', segs=16, rot=D(0.0, -0.22, 0.0), bev=None)
    P.mover('LID', [lid, knob, lid_rim, steam], (0.0, 0.0, h + 0.006))
    P.empty('M_food', (0.0, 0.0, 0.008))
    P.views = [('a', 35, 30)]


def kit_bowl(P):
    """A mixing bowl."""
    P.ao_distance = 0.07
    r, h = 0.13, 0.085
    P.lathe('bowl', [(0.0, 0.0), (r * 0.42, 0.0), (r * 0.5, 0.006), (r * 0.86, h * 0.55), (r, h), (r + 0.004, h + 0.004), (r - 0.002, h + 0.006)], (0, 0, 0), 'paint', segs=54, sharp=50.0)
    P.lathe('inside', [(r - 0.002, h + 0.006), (r * 0.84, h * 0.55), (r * 0.48, 0.011), (0.0, 0.009)], (0, 0, 0), 'paint_b', segs=54, sharp=50.0)
    P.empty('M_food', (0.0, 0.0, 0.01))
    P.views = [('a', 35, 35)]


def kit_grill(P):
    """A grill plate: ridges across it, a handle at each end."""
    P.ao_distance = 0.05
    L, W, t = 0.3, 0.22, 0.014
    P.prism('plate', K.rounded_rect(W, L, 0.02, 4), t, (0, 0, t / 2 + 0.006), 'paint', bev=0.004)
    for k in range(9):
        P.box(f'ridge{k}', (W - 0.036, 0.008, 0.005), (0.0, -0.1 + 0.025 * k, t + 0.008), 'trim', bev=0.0015, segs=1)
    for s in (-1, 1):
        P.torus(f'ear{s}', 0.03, 0.006, (0.0, s * (L / 2 + 0.002), t / 2 + 0.008), 'paint_b', segs=40, rsegs=9, arc=math.pi, a0=0.0 if s > 0 else math.pi)
    P.cyl('foot', 0.07, 0.006, (0.0, 0.0, 0.003), 'trim', segs=40, bev=None)
    P.empty('M_food', (0.0, 0.0, t + 0.011))
    P.views = [('a', 35, 35)]


def kit_steamer(P):
    """A bamboo steamer: two tiers, a woven lid."""
    P.ao_distance = 0.07
    r = 0.12
    for k in range(2):
        z = 0.012 + 0.052 * k
        P.lathe(f'tier{k}', [(r - 0.01, z), (r, z), (r, z + 0.05), (r - 0.01, z + 0.05)], (0, 0, 0), 'paint', segs=48, sharp=50.0, loop=True)
        P.torus(f'band{k}', r + 0.001, 0.004, (0, 0, z + 0.012), 'paint_b', segs=48, rsegs=8)
        P.torus(f'band{k}b', r + 0.001, 0.004, (0, 0, z + 0.04), 'paint_b', segs=48, rsegs=8)
    for k in range(2):
        z = 0.012 + 0.052 * k
        for i in range(36):
            a = TAU * i / 36
            P.box(f'slat{k}_{i}', (0.0016, 0.006, 0.026), ((r + 0.0008) * math.cos(a), (r + 0.0008) * math.sin(a), z + 0.026), 'paint_b', rot=D(0.0, 0.0, a), bev=None)
    P.cyl('base', r - 0.004, 0.012, (0, 0, 0.006), 'paint', segs=48, bev=0.002)
    P.cyl('slats', r - 0.011, 0.004, (0, 0, 0.078), 'paint_b', segs=48, bev=None)
    lid = P.lathe('lid', [(0.0, 0.0), (r + 0.004, 0.0), (r + 0.004, 0.006), (r * 0.6, 0.024), (0.0, 0.03)], (0, 0, 0.116), 'paint', segs=48, sharp=50.0)
    rim = P.torus('lid_rim', r + 0.003, 0.005, (0, 0, 0.12), 'paint_b', segs=48, rsegs=8)
    knob = P.torus('lid_loop', 0.016, 0.004, (0, 0, 0.148), 'paint_b', segs=24, rsegs=8, rot=D(math.pi / 2, 0.0, 0.0))
    weave = []
    for i in range(16):
        a = TAU * i / 16
        weave.append(P.tube(f'weave{i}', [(0.02 * math.cos(a), 0.02 * math.sin(a), 0.146), (r * 0.6 * math.cos(a), r * 0.6 * math.sin(a), 0.141), ((r + 0.002) * math.cos(a), (r + 0.002) * math.sin(a), 0.123)],
                            0.0016, 'paint_b', segs=6, bend=0.5, sharp=80.0))
    P.mover('LID', [lid, rim, knob, *weave], (0.0, 0.0, 0.116))
    P.empty('M_food', (0.0, 0.0, 0.08))
    P.views = [('a', 35, 30)]


def kit_oven(P):
    """A cast-iron camp oven: three stub feet, a flanged lid, a wire bail."""
    P.ao_distance = 0.07
    r, h = 0.12, 0.105
    z0 = 0.012
    P.lathe('oven', [(0.0, z0), (r - 0.01, z0), (r, z0 + 0.012), (r + 0.002, z0 + h), (r + 0.007, z0 + h + 0.002), (r + 0.007, z0 + h + 0.007), (r - 0.004, z0 + h + 0.007)], (0, 0, 0), 'paint', segs=54, sharp=50.0)
    P.lathe('inside', [(r - 0.004, z0 + h + 0.007), (r - 0.006, z0 + 0.016), (r - 0.016, z0 + 0.008), (0.0, z0 + 0.008)], (0, 0, 0), 'trim', segs=54, sharp=50.0)
    for k in range(3):
        a = TAU * k / 3
        P.cyl(f'foot{k}', 0.012, z0 + 0.004, ((r - 0.03) * math.cos(a), (r - 0.03) * math.sin(a), (z0 + 0.004) / 2), 'paint', segs=21, r2=0.015, bev=None)
    for s in (-1, 1):
        P.box(f'lug{s}', (0.016, 0.014, 0.014), (0.0, s * (r + 0.008), z0 + h - 0.012), 'paint', bev=0.003, segs=1)
    P.tube('bail', [(0.0, -(r + 0.012), z0 + h - 0.012), (0.03, -(r + 0.03), z0 + h * 0.5), (0.05, -(r + 0.034), z0 + 0.02)], 0.003, 'steel', segs=5)
    P.tube('bail2', [(0.0, r + 0.012, z0 + h - 0.012), (0.03, r + 0.03, z0 + h * 0.5), (0.05, r + 0.034, z0 + 0.02)], 0.003, 'steel', segs=5)
    zl = z0 + h + 0.007
    lid = P.lathe('lid', [(0.0, 0.0), (r + 0.014, 0.0), (r + 0.014, 0.014), (r + 0.01, 0.014), (r + 0.01, 0.004), (r + 0.004, 0.004), (r * 0.7, 0.014), (0.0, 0.016)], (0, 0, zl), 'paint', segs=54, sharp=50.0)
    loop = P.torus('lid_loop', 0.02, 0.005, (0, 0, zl + 0.018), 'paint_b', segs=24, rsegs=8, rot=D(math.pi / 2, 0.0, 0.0))
    P.mover('LID', [lid, loop], (0.0, 0.0, zl))
    P.empty('M_food', (0.0, 0.0, z0 + 0.01))
    P.views = [('a', 35, 30)]


def kit_kettle(P):
    """A camp kettle: a spout towards -X, a bail handle over it, a small lid."""
    P.ao_distance = 0.07
    r, h = 0.085, 0.11
    P.lathe('kettle', [(0.0, 0.0), (r - 0.008, 0.0), (r, 0.01), (r, h * 0.6), (r * 0.62, h), (0.04, h + 0.004), (0.04, h + 0.008), (0.0, h + 0.004)], (0, 0, 0), 'paint', segs=48, sharp=50.0)
    P.tube('spout', [(-(r - 0.01), 0.0, h * 0.5), (-(r + 0.04), 0.0, h * 0.72), (-(r + 0.062), 0.0, h * 0.98)], 0.013, 'paint', segs=21, radius_fn=lambda t: 1.0 - 0.38 * t)
    P.torus('bail', 0.07, 0.006, (0.0, 0.0, h + 0.012), 'paint_b', segs=40, rsegs=9, arc=math.pi, a0=0.0, rot=D(math.pi / 2, 0.0, math.pi / 2))
    P.tube('grip', [(0.0, -0.026, h + 0.082), (0.0, 0.0, h + 0.084), (0.0, 0.026, h + 0.082)], 0.0095, 'wood', segs=20, bend=0.6)
    lid = P.lathe('lid', [(0.0, 0.0), (0.043, 0.0), (0.03, 0.008), (0.0, 0.01)], (0, 0, h + 0.008), 'paint', segs=40, sharp=50.0)
    knob = P.sphere('knob', 0.01, (0, 0, h + 0.024), 'paint_b', u=8, v=5)
    P.mover('LID', [lid, knob], (0.0, 0.0, h + 0.008))
    P.empty('M_food', (0.0, 0.0, 0.012))
    P.views = [('a', 35, 28)]


def kit_cooler(P):
    """A camping cooler (face +X) at Nomad Drive's size (0.73 m over its handles, 0.46 m high, 0.42 m
    deep): a blue tub, its walls 5 cm thick round a white liner — inside 0.53 m end to end, 0.31 m front to back, 0.36 m
    deep, as Nomad Drive's board inside it is (src/core/v3/nd/store.ts: what is put in stands on its floor) — a white
    lid hinged along its back edge with a moulded grip, a swinging bail handle at each end, the lid's latch and the drain
    plug at the front, two skids under it."""
    P.ao_distance = 0.08
    dx, wy, h = 0.42, 0.64, 0.385           # front to back, end to end, the body's height (to the lid)
    zf = 0.016                               # on its skids
    top = zf + h
    ix, iy, fz, t = 0.31, 0.53, zf + 0.024, 0.004   # inside: front to back, end to end; its floor; the liner's thickness

    def hollow():
        """the inside, cut out of the body and the bands round it (open at the top)"""
        bm = bmesh.new()
        hh = top - fz + 0.05
        K.bm_cube(bm, (ix, iy, hh), matrix=Matrix.Translation((0.0, 0.0, fz + hh / 2)))
        return bm

    # the body: an insulated tub, its rim a band of the lid's colour
    P.cut(P.box('body', (dx, wy, h - 0.012), (0, 0, zf + (h - 0.012) / 2), 'paint', bev=0.03, segs=3), hollow())
    P.cut(P.box('rim', (dx + 0.006, wy + 0.006, 0.014), (0, 0, top - 0.007), 'paint_b', bev=0.006, segs=2), hollow())
    # a groove round the body, half way up
    P.cut(P.box('groove', (dx + 0.004, wy + 0.004, 0.008), (0, 0, zf + h * 0.42), 'paint_b', bev=0.003, segs=1), hollow())
    # the white liner: its floor and its four walls, up to the rim
    P.box('liner_floor', (ix, iy, t), (0, 0, fz + t / 2), 'paint_b', bev=None)
    dz = top - 0.004 - fz
    for s in (-1, 1):
        P.box(f'liner_end{s}', (ix, t, dz), (0, s * (iy / 2 - t / 2), fz + dz / 2), 'paint_b', bev=None)
        P.box(f'liner_side{s}', (t, iy - 2 * t, dz), (s * (ix / 2 - t / 2), 0, fz + dz / 2), 'paint_b', bev=None)
    # the skids
    for s in (-1, 1):
        P.box(f'skid{s}', (dx - 0.06, 0.05, zf), (0, s * (wy / 2 - 0.09), zf / 2), 'trim', bev=0.004, segs=1)
    # the drain plug, low at the front
    P.cyl('plug', 0.014, 0.012, (dx / 2 + 0.004, wy / 2 - 0.09, zf + 0.035), 'trim', axis='X', segs=40, bev=None)
    # the bail handles at the ends: two pivots and a bar across, hanging down
    for s in (-1, 1):
        y = s * (wy / 2 + 0.014)
        P.cyl(f'pivot{s}a', 0.013, 0.014, (-0.12, s * (wy / 2 + 0.005), top - 0.06), 'trim', axis='Y', segs=40, bev=None)
        P.cyl(f'pivot{s}b', 0.013, 0.014, (0.12, s * (wy / 2 + 0.005), top - 0.06), 'trim', axis='Y', segs=40, bev=None)
        P.tube(f'bail{s}', [(-0.12, y, top - 0.06), (-0.105, y + s * 0.008, top - 0.15), (0.105, y + s * 0.008, top - 0.15), (0.12, y, top - 0.06)], 0.008, 'trim', segs=18, bend=0.02)
    # the lid: hinged along the back edge (-X), its top domed a little, a moulded grip at the front, the latch below it
    hl = 0.055
    lid = P.box('lid', (dx + 0.012, wy + 0.012, hl), (0.0, 0.0, top + hl / 2), 'paint_b', bev=0.022, segs=2)
    crown = P.box('lid_top', (dx - 0.06, wy - 0.08, 0.012), (0.0, 0.0, top + hl + 0.004), 'paint_b', bev=0.006, segs=2)
    grip = P.box('lid_grip', (0.035, 0.24, 0.018), (dx / 2 - 0.012, 0.0, top + hl - 0.013), 'paint', bev=0.006, segs=1)
    latch = P.box('latch', (0.014, 0.09, 0.06), (dx / 2 + 0.01, 0.0, top + 0.004), 'trim', bev=0.004, segs=1)
    P.mover('LID', [lid, crown, grip, latch], (-dx / 2 - 0.006, 0.0, top))
    P.empty('M_food', (0.0, 0.0, fz + t))
    P.views = [('a', 35, 30)]


# ------------------------------------------------------------------------------------------------ at table

def kit_plate(P):
    P.ao_distance = 0.04
    r = 0.105
    P.lathe('plate', [(0.0, 0.0), (r * 0.55, 0.0), (r * 0.6, 0.005), (r * 0.86, 0.009), (r, 0.018), (r - 0.004, 0.021), (r * 0.84, 0.013), (r * 0.58, 0.009), (0.0, 0.008)], (0, 0, 0), 'paint', segs=54, sharp=50.0)
    P.torus('line', r * 0.9, 0.0022, (0, 0, 0.0162), 'paint_b', segs=54, rsegs=7)
    P.views = [('a', 35, 38)]


def kit_dish(P):
    """A small bowl to eat from."""
    P.ao_distance = 0.04
    r, h = 0.07, 0.052
    P.lathe('bowl', [(0.0, 0.0), (0.03, 0.0), (0.034, 0.008), (r * 0.82, h * 0.5), (r, h), (r - 0.004, h + 0.002), (r * 0.8, h * 0.5), (0.03, 0.012), (0.0, 0.011)], (0, 0, 0), 'paint', segs=48, sharp=50.0)
    P.torus('line', r - 0.001, 0.002, (0, 0, h - 0.006), 'paint_b', segs=48, rsegs=7)
    P.views = [('a', 35, 35)]


def kit_spice(P):
    """The seasonings in their caddy: a salt shaker and a pepper mill, soy sauce and vinegar, oil, a pot of sugar."""
    P.ao_distance = 0.05
    L, W = 0.24, 0.1
    P.box('tray', (W, L, 0.012), (0, 0, 0.006), 'paint', bev=0.004)
    for s in (-1, 1):
        P.box(f'rail{s}', (0.006, L - 0.01, 0.022), (s * (W / 2 - 0.003), 0.0, 0.021), 'paint', bev=0.002, segs=1)
    P.torus('bail', L / 2 - 0.012, 0.004, (0.0, 0.0, 0.03), 'paint_b', segs=40, rsegs=8, arc=math.pi, a0=0.0, rot=D(math.pi / 2, 0.0, math.pi / 2))
    z = 0.012
    # salt: a white shaker with a steel cap
    P.cyl('salt', 0.017, 0.05, (0.0, -0.092, z + 0.025), 'ceramic', segs=24, bev=None)
    P.cyl('salt_cap', 0.0175, 0.012, (0.0, -0.092, z + 0.056), 'steel', segs=24, bev=None)
    # pepper: a wooden mill
    P.lathe('mill', [(0.0, 0.0), (0.016, 0.0), (0.018, 0.012), (0.011, 0.04), (0.016, 0.062), (0.012, 0.076), (0.0, 0.08)], (0.0, -0.052, z), 'wood', segs=24, sharp=50.0)
    # soy sauce: a dark bottle with a red cap
    P.lathe('soy', [(0.0, 0.0), (0.019, 0.0), (0.02, 0.008), (0.02, 0.06), (0.009, 0.084), (0.009, 0.096), (0.0, 0.096)], (0.0, -0.008, z), 'trim', segs=24, sharp=50.0)
    P.cyl('soy_cap', 0.011, 0.012, (0.0, -0.008, z + 0.102), 'paint_b', segs=24, bev=0.002)
    # oil: a golden bottle
    P.lathe('oil', [(0.0, 0.0), (0.017, 0.0), (0.018, 0.008), (0.018, 0.07), (0.008, 0.09), (0.008, 0.102), (0.0, 0.102)], (0.0, 0.034, z), 'cap_oil', segs=24, sharp=50.0)
    P.cyl('oil_cap', 0.0095, 0.01, (0.0, 0.034, z + 0.106), 'steel', segs=24, bev=0.002)
    # vinegar: a small dark-brown bottle
    P.lathe('vinegar', [(0.0, 0.0), (0.014, 0.0), (0.015, 0.006), (0.015, 0.044), (0.007, 0.06), (0.007, 0.07), (0.0, 0.07)], (0.0, 0.068, z), 'leather', segs=27, sharp=50.0)
    # sugar: a little lidded pot
    P.lathe('sugar', [(0.0, 0.0), (0.016, 0.0), (0.02, 0.01), (0.02, 0.034), (0.0, 0.034)], (0.0, 0.1, z), 'ceramic', segs=24, sharp=50.0)
    P.lathe('sugar_lid', [(0.0, 0.0), (0.021, 0.0), (0.021, 0.003), (0.006, 0.006), (0.006, 0.012), (0.0, 0.016)], (0.0, 0.1, z + 0.034), 'paint_b', segs=24, sharp=50.0)
    P.views = [('a', 35, 30)]


MODELS = {f.__name__: f for f in [kit_stove, kit_stove2, kit_hob, kit_gas, kit_board, kit_pan, kit_pot, kit_bowl, kit_grill, kit_steamer, kit_oven, kit_kettle, kit_plate, kit_dish, kit_spice, kit_cooler]}

# the two colours each is painted in the game (src/core/v3/kitchen/items.ts), for the --look previews only
COLORS = {
    'kit_stove': (0x3e8e87, 0xede3c8), 'kit_stove2': (0xc8553d, 0xede3c8), 'kit_hob': (0xede3c8, 0x2f3236), 'kit_gas': (0xc8323a, 0xf4efe2), 'kit_board': (0xc9a26b, 0x8a6a48), 'kit_pan': (0x2f3236, 0xb85c3e),
    'kit_pot': (0xd8c29a, 0x2f3236), 'kit_bowl': (0x7fb3d5, 0xf4efe2), 'kit_grill': (0x2f3236, 0x6f7a82), 'kit_steamer': (0xd9b877, 0xa8824a),
    'kit_oven': (0x33363a, 0x6f7a82), 'kit_kettle': (0xb85c3e, 0x2f3236), 'kit_plate': (0xf4efe2, 0x3e8e87), 'kit_dish': (0xf4efe2, 0xb85c3e),
    'kit_spice': (0xb9915f, 0xc8323a), 'kit_cooler': (0x3f86b8, 0xf2efe6),
}


def _lin(h):
    c = (((h >> 16) & 255) / 255, ((h >> 8) & 255) / 255, (h & 255) / 255)
    return tuple(x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c)


def _after(P, opts):
    """--look: cel previews in the item's own colours, back faces culled as the game culls them."""
    if not opts.get('look'):
        return
    names = K.mc.MAT_NAMES
    saved = {k: names[k] for k in ('paint', 'paint_b')}
    for key, h in zip(('paint', 'paint_b'), COLORS.get(P.id, ())):
        names[key] = (_lin(h), saved[key][1], saved[key][2])
    try:
        for m in K.bpy.data.materials:
            m.use_backface_culling = True
        K.render_toon(P, views=[(f'{i + 1}', yaw, pitch) for i, (_, yaw, pitch) in enumerate(getattr(P, 'views', None) or [('a', 35, 28)])], size=(480, 400), suffix='_look')
    finally:
        names.update(saved)


def main(args):
    K.run(MODELS, args, after=_after, out_dir=OUT, geo=False)
