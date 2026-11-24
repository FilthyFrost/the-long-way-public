"""
The ND things (docs/ND/PLAN.md, ND1 and ND2): the instant camera and its film, the coffee machine with its bag of
coffee and the enamel mug, the plant pot, the seed packets and what grows from them (an apple, a potato, a tomato,
a watermelon), the cordless grinder — in our own design, at Nomad Drive's sizes (polaroid camera 0.16 x 0.18 x
0.14 m, polaroid film package 0.15 x 0.18, coffee machine 0.26 x 0.42 x 0.28, coffee pack 0.21 m tall, Mug, plant pot
0.33 m across, the seeds' packets 0.21 x 0.15, Tool-Grinder 0.44 m long):

    blender -b --factory-startup --python tools/blender/build.py -- items/nd_things [<model>|all] [--look] [--norender]

The junk script's conventions (items/junk.py): public/models/modcar/items/<model>.glb, origin at the bottom
centre, x forward, resting on z = 0; `paint` and `paint_b` take the item's two colours. What moves is its own
child named as the game finds it (assets.ts RIGID: LID, BUTTON_<what>, KNOB_<what>); where things come out of or
go is a marker (M_slot: the camera's print; M_cup, M_spout: the coffee machine's; M_brim: a mug's; M_soil: the
pot's; M_disc: the grinder's).
"""
import math

import bmesh
from mathutils import Matrix, Vector

from parts import _kit as K
from parts._kit import V, mat4
from items import junk as J
from items import nd_home as H

OUT = 'public/models/modcar/items'
TAU = math.tau

COLORS = {
    'nd_camera': (0xe9e1cd, 0x3a3d42), 'nd_film_pack': (0x2e4a6b, 0xf0e8d6), 'nd_photo': (0xf3efe6, 0x2f3236), 'nd_coffee_machine': (0xc8473d, 0x2f3236),
    'nd_coffee_pack': (0x8a5a3c, 0xe9d8b4), 'nd_mug': (0x3e7f96, 0xf1ece0), 'nd_plant_pot': (0xc0673f, 0xe8d6b0),
    'nd_seed_packet': (0xd8483a, 0xf1e6c8), 'nd_grinder': (0xe0a23a, 0x2f3236), 'nd_battery': (0x2f6b4f, 0xe8d36a), 'nd_apple': (0xc8372f, 0x6f9a3c),
    'nd_tomato': (0xd8452e, 0x5d8a34), 'nd_potato': (0xb8915c, 0x6b4a2f), 'nd_watermelon': (0x2f6b34, 0x9cc46a),
}


def jit(k, a=0.0):
    return H.jit(k, a)


def rbox(bm, size, loc, r=0.01, rot=(0, 0, 0)):
    """A box with its edges rounded by r into bm (a bevel of three segments)."""
    b2 = bmesh.new()
    K.bm_cube(b2, size)
    bmesh.ops.bevel(b2, geom=list(b2.edges), offset=r, segments=3, affect='EDGES', profile=0.5)
    K.bm_transform(b2, mat4(loc, rot))
    me = bmesh.new()
    tmp = K.bpy.data.meshes.new('tmp')
    b2.to_mesh(tmp)
    b2.free()
    bm.from_mesh(tmp)
    K.bpy.data.meshes.remove(tmp)
    me.free()


def soft(P, name, size, loc, mat, r=0.01, rot=(0, 0, 0)):
    """A rounded box of its own."""
    bm = bmesh.new()
    rbox(bm, size, loc, r, rot)
    return P.mesh(name, bm, mat, bev=None, sharp=50.0)


# ------------------------------------------------------------------------------------------------ the camera

def nd_camera(P):
    """An instant camera (Nomad Drive's polaroid camera): a chunky body (paint) with a hump over it for the
    viewfinder and the flash, a band down its front (paint_b) the lens sits in, a black lens barrel with its glass,
    a red shutter button, the flash's window, the viewfinder's front window and its rear eyepiece, strap lugs; the
    print comes out of the dark slot across its front at the bottom (M_slot), the film door's seam round it."""
    P.ao_distance = 0.05
    soft(P, 'body', (0.12, 0.155, 0.1), (0.0, 0.0, 0.05), 'paint', r=0.018)
    soft(P, 'hump', (0.095, 0.155, 0.06), (-0.01, 0.0, 0.112), 'paint', r=0.016)
    # the front band and the lens in it
    soft(P, 'band', (0.012, 0.05, 0.13), (0.058, 0.0, 0.075), 'paint_b', r=0.004)
    P.cyl('barrel', 0.03, 0.028, loc=(0.072, 0.0, 0.072), material='trim', axis='X', segs=24, bev=0.004)
    P.cyl('barrel_ring', 0.026, 0.006, loc=(0.087, 0.0, 0.072), material='alu', axis='X', segs=24, bev=0.002)
    P.cyl('glass', 0.019, 0.004, loc=(0.0895, 0.0, 0.072), material='glass_dark', axis='X', segs=20, bev=0.0015)
    P.torus('focus_ridge', 0.031, 0.0025, loc=(0.064, 0.0, 0.072), material='trim', axis='X', segs=24, rsegs=4)
    # the flash's window and the viewfinder's, over the lens; the eyepiece at the back
    soft(P, 'flash', (0.008, 0.05, 0.026), (0.037, -0.045, 0.122), 'lens_head', r=0.003)
    soft(P, 'flash_frame', (0.006, 0.058, 0.034), (0.034, -0.045, 0.122), 'trim', r=0.003)
    soft(P, 'finder', (0.008, 0.026, 0.02), (0.037, 0.045, 0.122), 'glass_dark', r=0.003)
    soft(P, 'finder_frame', (0.006, 0.034, 0.028), (0.034, 0.045, 0.122), 'trim', r=0.003)
    soft(P, 'eyepiece', (0.014, 0.03, 0.024), (-0.062, 0.045, 0.122), 'trim', r=0.005)
    P.cyl('eyeglass', 0.008, 0.003, loc=(-0.07, 0.045, 0.122), material='glass_dark', axis='X', segs=12, bev=0.001)
    # the shutter button on the front's left, a counter window on the back
    P.cyl('BUTTON_shutter', 0.011, 0.012, loc=(0.064, 0.055, 0.03), material='lens_tail', axis='X', segs=16, bev=0.003)
    soft(P, 'counter', (0.004, 0.022, 0.014), (-0.0605, -0.04, 0.085), 'glass_dark', r=0.002)
    # the slot and the film door's seam
    soft(P, 'slot_lip', (0.01, 0.118, 0.014), (0.061, 0.0, 0.022), 'trim', r=0.004)
    P.box('slot', (0.006, 0.106, 0.003), (0.0655, 0.0, 0.022), 'glass_dark', bev=None)
    P.box('seam', (0.0015, 0.152, 0.0015), (0.0605, 0.0, 0.044), 'trim', bev=None)
    P.empty('M_slot', loc=(0.066, 0.0, 0.022))
    for s in (-1, 1):
        P.torus('lug', 0.008, 0.0025, loc=(-0.02, s * 0.0795, 0.115), material='alu', axis='Y', segs=12, rsegs=4)
    P.views = [('a', 35, 18), ('b', 215, 18)]


def nd_film_pack(P):
    """A box of ten prints (Nomad Drive's polaroid film package, 0.15 x 0.18 m): a flat card box (paint) with a band
    round it (paint_b), a row of five coloured squares on its lid, its tear strip."""
    P.ao_distance = 0.03
    soft(P, 'box', (0.18, 0.15, 0.034), (0.0, 0.0, 0.017), 'paint', r=0.004)
    soft(P, 'band', (0.05, 0.152, 0.0355), (-0.04, 0.0, 0.017), 'paint_b', r=0.003)
    for i, m in enumerate(('lens_tail', 'lens_amber', 'paint_b', 'lens_head', 'glass_dark')):
        P.box('chip', (0.018, 0.018, 0.002), (0.045, -0.044 + i * 0.022, 0.0345), m, bev=0.001, segs=1)
    P.box('tear', (0.18, 0.006, 0.002), (0.0, 0.052, 0.0345), 'paint_b', bev=None)
    P.views = [('a', 35, 35), ('b', 215, 30)]


def nd_photo(P):
    """A print (Nomad Drive's polaroid print, 0.11 x 0.13 m): a cream card (paint) lying face up, its picture (P_img:
    the game paints the photo into it) nearer its top (+x), the wide margin below."""
    P.ao_distance = 0.01
    P.box('card', (0.13, 0.11, 0.0012), (0.0, 0.0, 0.0006), 'paint', bev=None)
    since = H.mark_since(P)
    P.box('img', (0.088, 0.094, 0.0004), (0.012, 0.0, 0.0014), 'glass_dark', bev=None)
    P.mover('P_img', P.statics[since:], (0.012, 0.0, 0.0014))
    P.views = [('a', 35, 50), ('b', 215, 40)]


# ------------------------------------------------------------------------------------------------ the coffee machine

def nd_coffee_machine(P):
    """A coffee machine (Nomad Drive's coffee machine, 0.26 x 0.42 x 0.28 m): a black base with its drip tray at the
    front where the cup goes (M_cup), a rounded tower (paint) at the back, its head reaching out over the tray with
    the spout under it (M_spout), the hopper on top under a hinged lid (LID, its hinge along y at the back), a
    rocker switch (BUTTON_power) with its lamp, a little gauge, a badge."""
    P.ao_distance = 0.08
    soft(P, 'base', (0.28, 0.25, 0.045), (0.0, 0.0, 0.0225), 'trim', r=0.012)
    for sx in (-1, 1):
        for sy in (-1, 1):
            P.cyl('foot', 0.012, 0.008, loc=(sx * 0.11, sy * 0.1, 0.004), material='rubber', segs=10)
    # the drip tray and its grille
    soft(P, 'tray', (0.12, 0.17, 0.016), (0.07, 0.0, 0.052), 'steel', r=0.005)
    for k in range(7):
        P.box('grille', (0.11, 0.006, 0.003), (0.07, -0.072 + k * 0.024, 0.0615), 'alu', bev=None)
    P.empty('M_cup', loc=(0.07, 0.0, 0.063))
    # the tower and its head
    soft(P, 'tower', (0.15, 0.23, 0.33), (-0.06, 0.0, 0.045 + 0.165), 'paint', r=0.035)
    soft(P, 'head', (0.16, 0.2, 0.085), (0.04, 0.0, 0.33), 'paint', r=0.03)
    soft(P, 'head_trim', (0.012, 0.205, 0.02), (0.112, 0.0, 0.298), 'chrome', r=0.006)
    P.lathe('spout', [(0.0, 0.0), (0.012, 0.0), (0.014, 0.012), (0.02, 0.026), (0.022, 0.03), (0.0, 0.03)],
            loc=(0.07, 0.0, 0.258), material='chrome', segs=16, sharp=50.0)
    P.cyl('spout_tip', 0.004, 0.008, loc=(0.07, 0.0, 0.255), material='trim', segs=8)
    P.empty('M_spout', loc=(0.07, 0.0, 0.252))
    # the hopper on top and its lid
    soft(P, 'hopper_rim', (0.13, 0.17, 0.016), (-0.04, 0.0, 0.378), 'trim', r=0.008)
    P.box('hopper', (0.1, 0.14, 0.004), (-0.04, 0.0, 0.3855), 'glass_dark', bev=None)
    since = H.mark_since(P)
    soft(P, 'lid', (0.13, 0.175, 0.02), (-0.04, 0.0, 0.395), 'paint_b', r=0.009)
    P.lathe('lid_knob', [(0.0, 0.0), (0.012, 0.0), (0.014, 0.008), (0.009, 0.016), (0.0, 0.017)], loc=(0.0, 0.0, 0.404),
            material='chrome', segs=14, sharp=50.0)
    P.mover('LID', P.statics[since:], (-0.105, 0.0, 0.395))
    P.empty('M_hopper', loc=(-0.04, 0.0, 0.39))
    # the switch, its lamp, the gauge, the badge
    soft(P, 'switch_plate', (0.01, 0.05, 0.03), (0.0155, 0.06, 0.15), 'trim', r=0.004)
    since = H.mark_since(P)
    soft(P, 'rocker', (0.012, 0.04, 0.02), (0.021, 0.06, 0.15), 'lens_tail', r=0.004)
    P.mover('BUTTON_power', P.statics[since:], (0.019, 0.06, 0.15))
    P.sphere('lamp', 0.006, loc=(0.017, 0.06, 0.175), material='lens_amber', u=10, v=6)
    P.empty('M_lamp', loc=(0.02, 0.06, 0.175))
    P.cyl('gauge_rim', 0.026, 0.012, loc=(0.016, -0.05, 0.19), material='chrome', axis='X', segs=20, bev=0.003)
    P.cyl('gauge', 0.021, 0.004, loc=(0.0225, -0.05, 0.19), material='gauge', axis='X', segs=20, bev=0.001)
    P.box('needle', (0.002, 0.003, 0.016), (0.025, -0.046, 0.194), 'lens_tail', rot=(30, 0, 0), bev=None)
    soft(P, 'badge', (0.004, 0.08, 0.018), (0.016, 0.0, 0.245), 'chrome', r=0.004)
    P.views = [('a', 35, 18), ('b', 215, 25)]


def nd_coffee_pack(P):
    """A bag of coffee (Nomad Drive's coffee pack, 0.21 m tall): a kraft bag (paint) a little fuller at its foot, its
    top rolled down twice and held by a tin tie (alu), a label (paint_b) and the round valve (trim)."""
    P.ao_distance = 0.04
    bm = bmesh.new()
    K.bm_cube(bm, (0.085, 0.11, 0.16))
    bmesh.ops.subdivide_edges(bm, edges=list(bm.edges), cuts=3, use_grid_fill=True)
    for v in bm.verts:
        t = (v.co.z + 0.08) / 0.16
        k = 1.06 - 0.1 * t
        v.co.x *= k * (1 + 0.04 * math.sin(v.co.y * 40))
        v.co.y *= k
        v.co.z += 0.08
    P.mesh('bag', bm, 'paint', bev=0.006, segs=2, sharp=40.0)
    for i in range(2):
        soft(P, 'roll', (0.03 - 0.004 * i, 0.112, 0.016), (-0.006 * i, 0.0, 0.168 + i * 0.016), 'paint', r=0.007)
    P.box('tie', (0.006, 0.13, 0.008), (0.012, 0.0, 0.176), 'alu', bev=0.002, segs=1)
    soft(P, 'label', (0.004, 0.075, 0.07), (0.044, 0.0, 0.08), 'paint_b', r=0.003)
    P.cyl('valve', 0.009, 0.004, loc=(0.045, 0.0, 0.135), material='trim', axis='X', segs=12, bev=0.001)
    P.views = [('a', 35, 15), ('b', 215, 15)]


def nd_mug(P):
    """An enamel mug (Nomad Drive's Mug): a straight-sided cup (paint) with a rolled rim and a dark band at its
    foot (trim), its handle; the brim's height as M_brim (the coffee in it is drawn by the game)."""
    P.ao_distance = 0.04
    r, h, t = 0.043, 0.092, 0.003
    prof = [(0.0, 0.003), (r - 0.006, 0.0), (r, 0.006), (r, h - 0.004), (r + 0.0005, h), (r - t, h), (r - t, 0.008),
            (0.0, 0.007)]
    P.lathe('cup', prof, loc=(0.0, 0.0, 0.0), material='paint', segs=28, sharp=60.0)
    P.torus('rim', r - 0.001, 0.0028, loc=(0.0, 0.0, h), material='trim', segs=28, rsegs=6)
    P.lathe('foot', [(r - 0.006, 0.0), (r + 0.0006, 0.006), (r + 0.0006, 0.012), (r - 0.004, 0.012)], loc=(0, 0, 0),
            material='trim', segs=28, sharp=60.0)
    pts = [(0.0, r - 0.002, 0.075), (0.0, r + 0.022, 0.078), (0.0, r + 0.03, 0.05), (0.0, r + 0.022, 0.024), (0.0, r - 0.002, 0.024)]
    P.tube('handle', pts, 0.0055, 'paint', segs=10, bend=0.4)
    P.empty('M_brim', loc=(0.0, 0.0, h - 0.008))
    P.views = [('a', 35, 25), ('b', 215, 30)]


# ------------------------------------------------------------------------------------------------ the plant pot

def nd_plant_pot(P):
    """A terracotta pot (Nomad Drive's plant pot, 0.33 m across): a tapering pot (paint) with a thick rim and a
    painted band round it (paint_b), on its saucer; its soil (leather) a little domed with a few pebbles; M_soil
    where what grows in it stands."""
    P.ao_distance = 0.1
    P.lathe('saucer', [(0.0, 0.0), (0.135, 0.0), (0.15, 0.004), (0.158, 0.028), (0.15, 0.03), (0.138, 0.012), (0.0, 0.012)],
            loc=(0, 0, 0), material='paint', segs=32, sharp=50.0)
    prof = [(0.0, 0.014), (0.105, 0.012), (0.112, 0.02), (0.132, 0.19), (0.152, 0.198), (0.158, 0.205), (0.158, 0.25),
            (0.152, 0.256), (0.138, 0.256), (0.134, 0.24), (0.124, 0.22)]
    P.lathe('pot', prof, loc=(0, 0, 0), material='paint', segs=36, sharp=45.0)
    P.lathe('band', [(0.1495, 0.208), (0.1595, 0.211), (0.1595, 0.222), (0.1495, 0.225)], loc=(0, 0, 0), material='paint_b',
            segs=36, sharp=45.0)
    soil = [(0.0, 0.236), (0.06, 0.234), (0.11, 0.229), (0.128, 0.222), (0.12, 0.2), (0.0, 0.2)]
    P.lathe('soil', soil, loc=(0, 0, 0), material='leather', segs=30, sharp=70.0)
    for i in range(6):
        a = i * 2.4 + 0.3
        rr = 0.05 + 0.06 * (0.5 + 0.5 * jit(i, 1.0))
        P.sphere('pebble', 0.006 + 0.003 * abs(jit(i, 2.0)), loc=(rr * math.cos(a), rr * math.sin(a), 0.232), material='ceramic',
                 u=8, v=5, scale=(1.3, 1.0, 0.6))
    P.empty('M_soil', loc=(0.0, 0.0, 0.236))
    P.views = [('a', 35, 30), ('b', 215, 25)]


def nd_seed_packet(P):
    """A packet of seeds (Nomad Drive's apple seeds … watermelon seeds, 0.21 x 0.15 m): a paper packet (paint_b) lying
    flat, a little fat where the seeds are, its picture window (paint: the plant's colour) under a band, its folded
    top, two lines of print."""
    P.ao_distance = 0.02
    bm = bmesh.new()
    K.bm_cube(bm, (0.2, 0.14, 0.008))
    bmesh.ops.subdivide_edges(bm, edges=list(bm.edges), cuts=4, use_grid_fill=True)
    for v in bm.verts:
        if v.co.z > 0:
            v.co.z += 0.004 * max(0.0, 1 - (abs(v.co.x + 0.02) / 0.09) ** 2) * max(0.0, 1 - (abs(v.co.y) / 0.065) ** 2)
        v.co.z += 0.004
    P.mesh('packet', bm, 'paint_b', bev=0.002, segs=1, sharp=40.0)
    P.box('fold', (0.02, 0.142, 0.01), (0.09, 0.0, 0.005), 'paint_b', bev=0.002, segs=1)
    P.cyl('picture', 0.04, 0.0015, loc=(-0.01, 0.0, 0.0125), material='paint', segs=24, bev=None)
    P.box('pic_ground', (0.03, 0.09, 0.0015), (-0.045, 0.0, 0.0124), 'paint', bev=None)
    P.box('band', (0.022, 0.13, 0.0012), (0.05, 0.0, 0.0125), 'paint', bev=None)
    for i in range(2):
        P.box('print', (0.003, 0.09 - 0.03 * i, 0.001), (-0.068 - 0.008 * i, 0.0, 0.0122), 'trim', bev=None)
    P.views = [('a', 35, 45), ('b', 215, 40)]


# ------------------------------------------------------------------------------------------------ the grinder

def nd_grinder(P):
    """A cordless angle grinder (Nomad Drive's Tool-Grinder, 0.44 m long): the motor's body (paint) along x with a
    rubber grip and the vents at its back (trim), the battery pack under its tail (trim, a paint_b band, a charge
    lamp), the gear head (alu) at the front with the disc under it (KNOB_disc: it spins about its own z; M_disc at
    its middle) half under its guard (steel), the side handle out to the left, the paddle switch under the body."""
    P.ao_distance = 0.05
    z0 = 0.075
    prof = [(0.0, 0.0), (0.03, 0.0), (0.035, 0.02), (0.036, 0.1), (0.034, 0.2), (0.031, 0.24), (0.0, 0.25)]
    P.lathe('body', prof, loc=(-0.14, 0.0, z0), material='paint', axis='X', segs=24, sharp=40.0)
    P.cyl('grip', 0.0375, 0.1, loc=(-0.03, 0.0, z0), material='rubber', axis='X', segs=24, bev=0.006)
    for k in range(4):
        P.box('vent', (0.012, 0.004, 0.03), (-0.115 + k * 0.016, 0.034, z0 + 0.008), 'trim', bev=0.001, segs=1)
        P.box('vent', (0.012, 0.004, 0.03), (-0.115 + k * 0.016, -0.034, z0 + 0.008), 'trim', bev=0.001, segs=1)
    soft(P, 'battery', (0.09, 0.078, 0.07), (-0.165, 0.0, z0 - 0.025), 'trim', r=0.012)
    soft(P, 'battery_band', (0.092, 0.08, 0.016), (-0.165, 0.0, z0 - 0.04), 'paint_b', r=0.006)
    P.sphere('charge', 0.004, loc=(-0.21, 0.025, z0 - 0.01), material='lens_amber', u=8, v=5)
    # the paddle switch under the body
    soft(P, 'paddle', (0.12, 0.026, 0.012), (-0.03, 0.0, z0 - 0.043), 'trim', r=0.005, rot=(0, -4, 0))
    # the gear head, the spindle, the disc, the guard
    soft(P, 'head', (0.07, 0.07, 0.06), (0.135, 0.0, z0 + 0.002), 'alu', r=0.014)
    P.cyl('spindle', 0.01, 0.025, loc=(0.145, 0.0, z0 - 0.035), material='steel', segs=12)
    since = H.mark_since(P)
    dz = z0 - 0.05
    P.cyl('disc', 0.0625, 0.004, loc=(0.145, 0.0, dz), material='steel', segs=36, bev=0.001)
    P.cyl('disc_hub', 0.02, 0.006, loc=(0.145, 0.0, dz - 0.004), material='trim', segs=16, bev=0.001)
    P.cyl('disc_nut', 0.009, 0.006, loc=(0.145, 0.0, dz - 0.008), material='alu', segs=6, bev=0.001)
    for k in range(3):
        a = k * TAU / 3
        P.box('disc_mark', (0.03, 0.004, 0.0012), (0.145 + 0.04 * math.cos(a), 0.04 * math.sin(a), dz + 0.0025), 'paint_b',
              rot=(0, 0, math.degrees(a)), bev=None)
    P.mover('KNOB_disc', P.statics[since:], (0.145, 0.0, dz))
    P.empty('M_disc', loc=(0.145, 0.0, dz))
    bm = bmesh.new()
    K.bm_lathe(bm, [(0.072, -0.012), (0.072, 0.006), (0.068, 0.012), (0.02, 0.012), (0.02, 0.008), (0.066, 0.008),
                    (0.068, 0.004), (0.068, -0.012)], segs=20, angle=math.pi * 1.05, start=math.pi * 0.47,
               matrix=Matrix.Translation((0.145, 0.0, dz)))
    P.mesh('guard', bm, 'steel', bev=None, sharp=40.0)
    # the side handle out to the left
    P.lathe('side_handle', [(0.0, 0.0), (0.012, 0.0), (0.016, 0.02), (0.017, 0.08), (0.015, 0.095), (0.0, 0.1)],
            loc=(0.135, 0.035, z0), material='rubber', axis='Y', segs=14, sharp=50.0)
    P.empty('M_grip', loc=(-0.03, 0.0, z0))
    P.views = [('a', 35, 20), ('b', 215, 30)]


def nd_battery(P):
    """A battery (Nomad Drive's consumable battery, 0.09 x 0.17 m): a fat cell standing on end, its jacket (paint) with a
    band round it (paint_b), its steel shoulders and foot, the positive stud on its top."""
    P.ao_distance = 0.03
    r = 0.043
    P.lathe('jacket', [(0.0, 0.006), (r - 0.003, 0.006), (r, 0.01), (r, 0.152), (r - 0.003, 0.156), (0.0, 0.156)], loc=(0, 0, 0),
            material='paint', segs=28, sharp=55.0)
    P.lathe('band', [(r + 0.0005, 0.06), (r + 0.001, 0.062), (r + 0.001, 0.104), (r + 0.0005, 0.106)], loc=(0, 0, 0),
            material='paint_b', segs=28, sharp=55.0)
    P.lathe('foot', [(0.0, 0.0), (r - 0.006, 0.0), (r - 0.002, 0.003), (r - 0.002, 0.008), (0.0, 0.008)], loc=(0, 0, 0),
            material='alu', segs=28, sharp=55.0)
    P.lathe('shoulder', [(0.0, 0.154), (r - 0.002, 0.154), (r - 0.002, 0.158), (r - 0.008, 0.162), (0.0, 0.162)], loc=(0, 0, 0),
            material='alu', segs=28, sharp=55.0)
    P.cyl('stud', 0.011, 0.008, loc=(0.0, 0.0, 0.166), material='alu', segs=16, bev=0.002)
    P.box('mark', (0.002, 0.012, 0.003), (r + 0.001, 0.0, 0.083), 'trim', bev=None)
    P.box('mark_v', (0.002, 0.003, 0.012), (r + 0.001, 0.0, 0.083), 'trim', bev=None)
    P.views = [('a', 35, 18), ('b', 215, 25)]


# ------------------------------------------------------------------------------------------------ what grows

def organic(bm_src, fn):
    for v in bm_src.verts:
        fn(v)


def nd_apple(P):
    """An apple (Nomad Drive's Apple, 0.12 m): its round body (paint) a little wider at the shoulders, the dimple at
    its top with the stalk (wood) and a leaf (paint_b)."""
    P.ao_distance = 0.03
    prof = [(0.0, 0.008), (0.014, 0.004), (0.034, 0.008), (0.05, 0.024), (0.058, 0.048), (0.058, 0.07), (0.052, 0.09),
            (0.038, 0.104), (0.018, 0.108), (0.007, 0.1), (0.0, 0.097)]
    bm = bmesh.new()
    K.bm_lathe(bm, prof, segs=24)
    for v in bm.verts:
        a = math.atan2(v.co.y, v.co.x)
        k = 1 + 0.025 * math.sin(a * 3 + 0.4) * min(1.0, v.co.z / 0.06)
        v.co.x *= k
        v.co.y *= k
    P.mesh('apple', bm, 'paint', bev=None, sharp=80.0)
    P.tube('stalk', [(0.0, 0.0, 0.098), (0.002, 0.001, 0.112), (0.006, 0.002, 0.122)], 0.0022, 'wood', segs=6, bend=0.4)
    leaf = bmesh.new()
    pts = [(0.0, 0.0), (0.012, 0.009), (0.028, 0.008), (0.04, 0.0), (0.028, -0.008), (0.012, -0.009)]
    K.bm_prism(leaf, pts, 0.0015, matrix=mat4((0.004, 0.002, 0.114), (12, -25, 35)))
    P.mesh('leaf', leaf, 'paint_b', bev=None, sharp=40.0)
    P.views = [('a', 35, 25), ('b', 215, 10)]


def nd_tomato(P):
    """A tomato (Nomad Drive's Tomato, 0.12 m): a squat round body (paint) with soft lobes, its green calyx (paint_b)
    a star of five sepals round the stalk."""
    P.ao_distance = 0.03
    bm = bmesh.new()
    K.bm_sphere(bm, 0.06, u=28, v=16)
    for v in bm.verts:
        a = math.atan2(v.co.y, v.co.x)
        z = v.co.z / 0.06
        k = 1 + 0.045 * math.cos(5 * a) * (1 - z * z) ** 0.5
        v.co.x *= k
        v.co.y *= k
        v.co.z *= 0.78
        if z > 0.85:
            v.co.z -= 0.006 * (z - 0.85) / 0.15
        v.co.z += 0.047
    P.mesh('tomato', bm, 'paint', bev=None, sharp=80.0)
    for i in range(5):
        a = i * TAU / 5 + 0.3
        bm2 = bmesh.new()
        K.bm_prism(bm2, [(0.0, -0.004), (0.022, -0.002), (0.03, 0.0), (0.022, 0.002), (0.0, 0.004)], 0.0015,
                   matrix=mat4((0.0, 0.0, 0.093), (0, -18, math.degrees(a))))
        P.mesh('sepal', bm2, 'paint_b', bev=None, sharp=40.0)
    P.cyl('stalk', 0.003, 0.012, loc=(0.0, 0.0, 0.099), material='paint_b', segs=8)
    P.views = [('a', 35, 30), ('b', 215, 10)]


def nd_potato(P):
    """A potato (Nomad Drive's Potato, 0.15 m): a lumpy oval (paint) with its eyes (paint_b) here and there."""
    P.ao_distance = 0.03
    bm = bmesh.new()
    K.bm_sphere(bm, 1.0, u=22, v=12)
    for v in bm.verts:
        x, y, z = v.co.x, v.co.y, v.co.z
        lump = 1 + 0.07 * math.sin(3.1 * x + 1.3 * y) + 0.05 * math.sin(4.3 * y - 2.1 * z + 0.7) + 0.04 * math.sin(5.7 * z + 2.0 * x)
        v.co.x = x * 0.072 * lump
        v.co.y = y * 0.05 * lump
        v.co.z = z * 0.046 * lump + 0.046
    P.mesh('potato', bm, 'paint', bev=None, sharp=80.0)
    for i in range(6):
        a = i * 1.7 + 0.4
        b = (jit(i, 3.0)) * 0.9
        p = V((0.07 * math.cos(a) * math.cos(b), 0.049 * math.sin(a) * math.cos(b), 0.046 + 0.045 * math.sin(b)))
        P.sphere('eye', 0.004, loc=tuple(p), material='paint_b', u=6, v=4, scale=(1.0, 1.0, 0.5))
    P.views = [('a', 35, 25), ('b', 215, 20)]


def nd_watermelon(P):
    """A watermelon (Nomad Drive's Watermelon, 0.3 m): an oval melon in dark (paint) and light (paint_b) stripes
    running from end to end, its stalk's scar (wood) at one end."""
    P.ao_distance = 0.05
    prof = [(0.0, -0.17), (0.04, -0.165), (0.09, -0.14), (0.125, -0.09), (0.142, -0.03), (0.145, 0.0), (0.142, 0.03),
            (0.125, 0.09), (0.09, 0.14), (0.04, 0.165), (0.0, 0.17)]
    n = 14
    seg = TAU / n
    for i in range(n):
        for (mat, a0, a1) in (('paint', 0.0, 0.62), ('paint_b', 0.62, 1.0)):
            bm = bmesh.new()
            K.bm_lathe(bm, prof, segs=4, angle=seg * (a1 - a0), start=seg * (i + a0),
                       matrix=Matrix.Translation((0.0, 0.0, 0.145)) @ Matrix.Rotation(math.pi / 2, 4, 'Y'))
            P.mesh('rind', bm, mat, bev=None, sharp=80.0)
    P.cyl('scar', 0.012, 0.006, loc=(0.168, 0.0, 0.145), material='wood', axis='X', segs=10, bev=0.002)
    P.views = [('a', 35, 25), ('b', 215, 20)]


MODELS = {
    'nd_camera': nd_camera,
    'nd_film_pack': nd_film_pack,
    'nd_photo': nd_photo,
    'nd_coffee_machine': nd_coffee_machine,
    'nd_coffee_pack': nd_coffee_pack,
    'nd_mug': nd_mug,
    'nd_plant_pot': nd_plant_pot,
    'nd_seed_packet': nd_seed_packet,
    'nd_grinder': nd_grinder,
    'nd_battery': nd_battery,
    'nd_apple': nd_apple,
    'nd_tomato': nd_tomato,
    'nd_potato': nd_potato,
    'nd_watermelon': nd_watermelon,
}
MODELS = {k: H.settled(f) for k, f in MODELS.items()}


def _after(P, opts):
    J.COLORS.update(COLORS)
    J._after(P, opts)


def main(args):
    K.run(MODELS, args, after=_after, out_dir=OUT, geo=False)
