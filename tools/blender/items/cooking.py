"""
Cooking's things (src/core/v3/cooking/items.ts, src/game/modcar/v3/cooking, node C1): the cookware, the twelve
kinds of dish and the spoiled one, the recipe page, the cuts of meat and the eggs, the camp stove, the drying
rack and the smoker as things set down, and the workshop's kitchen corner (a counter with a hob and pans
hanging over it):

    blender -b --factory-startup --python tools/blender/build.py -- items/cooking [<model>|all] [--norender]

Writes public/models/modcar/items/<model>.glb in the items' conventions: root mesh PART, origin at the bottom
centre, x forward, resting on z = 0, conventional material names only, AO in 'Col'. `paint` and `paint_b` take
the item's paint and paint2: for cookware the metal of the body and the dark of its handles; for a dish the
bowl or the plate and the food in it (which dish it is lives on the thing, the model is its bowl). The kitchen
corner is no item: the cooking view paints it in its own two colours. Small things seen in the hand and in a
hotbar picture: a handful of simple solids each, no text, no images.
"""
import math

from parts import _kit as K
from items.junk import settle

OUT = 'public/models/modcar/items'


def jit(k, a=0.0):
    """A fixed pseudo-random number in [-0.5, 0.5) (the same on every run)."""
    v = math.sin(k * 12.9898 + a * 78.233) * 43758.5453
    return (v - math.floor(v)) - 0.5


# ------------------------------------------------------------------------------------------------ cookware

def cook_bowl(P):
    """A mixing bowl, wide and shallow, with a rolled rim."""
    P.ao_distance = 0.04
    P.lathe('bowl', [(0.0, 0.0), (0.05, 0.0), (0.07, 0.006), (0.1, 0.04), (0.112, 0.085), (0.108, 0.088),
                     (0.096, 0.045), (0.064, 0.012), (0.0, 0.01)], material='paint', segs=24, sharp=50.0)
    P.torus('rim', 0.111, 0.004, loc=(0.0, 0.0, 0.087), material='alu', segs=24, rsegs=5)
    P.views = [('a', 35, 35), ('b', 215, 35)]


def cook_spit(P):
    """A roasting spit: a long iron rod, two prongs at its point, a wooden handle."""
    P.ao_distance = 0.03
    P.cyl('rod', 0.004, 0.5, (0.04, 0.0, 0.012), 'steel', axis='X', segs=8, bev=None)
    for s in (-1, 1):
        P.tube('prong', [(0.28, 0.0, 0.012), (0.31, 0.012 * s, 0.012), (0.36, 0.012 * s, 0.012)], 0.0032, 'steel',
               segs=6, bend=0.01)
    P.cyl('handle', 0.012, 0.13, (-0.26, 0.0, 0.012), 'wood', axis='X', segs=10, bev=0.003)
    P.torus('ferrule', 0.0125, 0.0025, loc=(-0.195, 0.0, 0.012), axis='X', material='alu', segs=12, rsegs=4)
    P.views = [('a', 35, 35), ('b', 215, 35)]


def cook_grill(P):
    """A folding grill: a frame of wire with bars across, two legs folded under."""
    P.ao_distance = 0.03
    w, d = 0.4, 0.28
    for y in (-d / 2, d / 2):
        P.cyl('frame', 0.005, w, (0.0, y, 0.03), 'steel', axis='X', segs=6, bev=None)
    for x in (-w / 2, w / 2):
        P.cyl('frame', 0.005, d, (x, 0.0, 0.03), 'steel', axis='Y', segs=6, bev=None)
    for i in range(9):
        P.cyl('bar', 0.0025, d, (-w / 2 + w * (i + 1) / 10, 0.0, 0.03), 'alu', axis='Y', segs=5, bev=None)
    for x in (-0.15, 0.15):
        P.tube('leg', [(x, -d / 2, 0.03), (x, -d / 2 + 0.02, 0.006), (x, d / 2 - 0.02, 0.006), (x, d / 2, 0.03)],
               0.004, 'steel', segs=6, bend=0.01)
    P.cyl('handle', 0.01, 0.12, (w / 2 + 0.06, 0.0, 0.03), 'wood', axis='X', segs=8, bev=0.003)
    P.views = [('a', 35, 45), ('b', 215, 45)]


def cook_pan(P):
    """A frying pan: a shallow steel body, its seasoned inside dark, a long handle."""
    P.ao_distance = 0.04
    P.lathe('pan', [(0.0, 0.0), (0.105, 0.0), (0.122, 0.01), (0.13, 0.042), (0.125, 0.044), (0.115, 0.014),
                    (0.1, 0.007), (0.0, 0.007)], material='paint', segs=28, sharp=45.0)
    P.cyl('inside', 0.101, 0.002, (0.0, 0.0, 0.008), 'trim', segs=24, bev=None)
    P.box('neck', (0.04, 0.026, 0.012), (-0.142, 0.0, 0.036), 'paint', bev=0.003)
    P.box('handle', (0.19, 0.03, 0.022), (-0.25, 0.0, 0.048), 'paint_b', rot=(0.0, -0.12, 0.0), bev=0.008)
    P.views = [('a', 35, 35), ('b', 215, 35)]


def cook_wok(P):
    """A wok: a deep round-bottomed steel bowl, a wooden handle on one side and a loop on the other."""
    P.ao_distance = 0.05
    P.lathe('wok', [(0.0, 0.0), (0.05, 0.002), (0.11, 0.022), (0.155, 0.06), (0.172, 0.094), (0.166, 0.096),
                    (0.148, 0.064), (0.104, 0.028), (0.048, 0.009), (0.0, 0.007)], material='paint', segs=28,
            sharp=50.0)
    P.box('neck', (0.05, 0.022, 0.014), (-0.19, 0.0, 0.09), 'paint', bev=0.003)
    P.cyl('handle', 0.014, 0.16, (-0.29, 0.0, 0.1), 'paint_b', axis='X', rot=(0.0, math.pi / 2 - 0.15, 0.0), segs=10,
          bev=0.004)
    P.torus('loop', 0.025, 0.004, loc=(0.19, 0.0, 0.092), axis='Z', material='paint', segs=12, rsegs=5,
            arc=math.pi, a0=-math.pi / 2)
    P.views = [('a', 35, 35), ('b', 215, 35)]


def cook_steamer(P):
    """A bamboo steamer: two woven tiers and a domed lid."""
    P.ao_distance = 0.04
    for k in range(2):
        z = k * 0.055
        P.lathe('tier', [(0.115, z), (0.12, z), (0.12, z + 0.052), (0.115, z + 0.052)], material='wood', segs=24,
                close=None, sharp=30.0)
        P.torus('band', 0.121, 0.003, loc=(0.0, 0.0, z + 0.026), material='wood', segs=24, rsegs=4)
        P.cyl('floor', 0.116, 0.004, (0.0, 0.0, z + 0.006), 'wood', segs=20, bev=None)
    P.lathe('lid', [(0.0, 0.15), (0.06, 0.145), (0.105, 0.128), (0.121, 0.11), (0.121, 0.107), (0.0, 0.107)],
            material='wood', segs=24, sharp=40.0)
    P.box('knob', (0.04, 0.012, 0.012), (0.0, 0.0, 0.155), 'paint_b', bev=0.003)
    P.views = [('a', 35, 30), ('b', 215, 30)]


def cook_pot(P):
    """A soup pot: a straight-sided body, two ears, a lid with a knob."""
    P.ao_distance = 0.05
    P.lathe('pot', [(0.0, 0.0), (0.108, 0.0), (0.118, 0.008), (0.12, 0.16), (0.116, 0.162), (0.112, 0.012),
                    (0.0, 0.01)], material='paint', segs=28, sharp=45.0)
    P.torus('rim', 0.12, 0.004, loc=(0.0, 0.0, 0.16), material='alu', segs=28, rsegs=5)
    P.lathe('lid', [(0.0, 0.185), (0.02, 0.184), (0.08, 0.176), (0.121, 0.163), (0.121, 0.16), (0.0, 0.16)],
            material='paint', segs=28, sharp=40.0)
    P.cyl('knob', 0.016, 0.014, (0.0, 0.0, 0.19), 'paint_b', segs=12, bev=0.003)
    for s in (-1, 1):
        P.torus('ear', 0.026, 0.006, loc=(0.0, s * 0.127, 0.135), axis='X', material='paint_b', segs=12, rsegs=5,
                arc=math.pi, a0=0.0 if s > 0 else math.pi)
    P.views = [('a', 35, 25), ('b', 215, 25)]


def cook_dutch_oven(P):
    """A cast-iron Dutch oven on three stubby feet, its lid with a rim for coals, a wire bail."""
    P.ao_distance = 0.05
    P.lathe('oven', [(0.0, 0.02), (0.12, 0.02), (0.135, 0.035), (0.138, 0.13), (0.133, 0.132), (0.128, 0.04),
                     (0.0, 0.032)], material='trim', segs=28, sharp=45.0)
    P.lathe('lid', [(0.0, 0.155), (0.11, 0.15), (0.14, 0.14), (0.142, 0.13), (0.0, 0.13)], material='trim', segs=28,
            sharp=40.0)
    P.torus('lidrim', 0.135, 0.005, loc=(0.0, 0.0, 0.155), material='trim', segs=28, rsegs=5)
    P.torus('handle', 0.025, 0.006, loc=(0.0, 0.0, 0.16), axis='X', material='paint', segs=12, rsegs=5, arc=math.pi)
    for k in range(3):
        a = k * math.tau / 3
        P.cyl('foot', 0.012, 0.024, (0.08 * math.cos(a), 0.08 * math.sin(a), 0.012), 'trim', segs=8, bev=0.002)
    P.torus('bail', 0.15, 0.003, loc=(0.0, 0.0, 0.12), axis='X', material='steel', segs=20, rsegs=4, arc=math.pi)
    P.views = [('a', 35, 25), ('b', 215, 25)]


def cook_kettle(P):
    """A camp kettle: a round body, a spout, a hinged wire handle with a wooden grip, a lid."""
    P.ao_distance = 0.04
    P.lathe('kettle', [(0.0, 0.0), (0.075, 0.0), (0.09, 0.02), (0.092, 0.08), (0.075, 0.115), (0.04, 0.125),
                       (0.0, 0.125)], material='paint', segs=24, sharp=45.0)
    P.cyl('lid', 0.04, 0.01, (0.0, 0.0, 0.13), 'paint', segs=16, bev=0.003)
    P.sphere('knob', 0.011, (0.0, 0.0, 0.142), 'paint_b', u=8, v=5)
    P.tube('spout', [(0.075, 0.0, 0.03), (0.11, 0.0, 0.07), (0.135, 0.0, 0.105)], 0.011, 'paint', segs=10,
           bend=0.02, radius_fn=lambda u: 1.0 - 0.45 * u)
    P.torus('bail', 0.07, 0.003, loc=(0.0, 0.0, 0.12), axis='X', material='steel', segs=16, rsegs=4, arc=math.pi)
    P.cyl('grip', 0.009, 0.05, (0.0, 0.0, 0.19), 'paint_b', axis='Y', segs=8, bev=0.003)
    P.views = [('a', 35, 25), ('b', 215, 25)]


def cook_board(P):
    """A wooden board, a cleaver lying on it."""
    P.ao_distance = 0.03
    P.box('board', (0.32, 0.22, 0.022), (0.0, 0.0, 0.011), 'wood', bev=0.006)
    P.box('blade', (0.15, 0.07, 0.003), (0.02, 0.02, 0.0245), 'steel', bev=0.0008)
    P.box('edge', (0.15, 0.006, 0.0025), (0.02, -0.016, 0.0245), 'alu', bev=None)
    P.box('handle', (0.1, 0.022, 0.016), (-0.105, 0.03, 0.03), 'paint_b', bev=0.005)
    P.views = [('a', 35, 45), ('b', 215, 45)]


def cook_mortar(P):
    """A stone mortar and its pestle leaning in it."""
    P.ao_distance = 0.04
    P.lathe('mortar', [(0.0, 0.0), (0.06, 0.0), (0.072, 0.02), (0.075, 0.075), (0.068, 0.078), (0.055, 0.03),
                       (0.0, 0.025)], material='ceramic', segs=20, sharp=45.0)
    P.tube('pestle', [(-0.01, 0.0, 0.035), (0.03, 0.0, 0.09), (0.055, 0.0, 0.135)], 0.014, 'ceramic', segs=10,
           bend=0.01, radius_fn=lambda u: 1.0 - 0.35 * u)
    P.views = [('a', 35, 25), ('b', 215, 25)]


def cook_rack(P):
    """A drying rack as it is set down: two A-frames of poles, four rails across, a few strings of drying things."""
    P.ao_distance = 0.08
    w = 0.7
    for y in (-w / 2, w / 2):
        P.tube('leg', [(-0.28, y, 0.0), (0.0, y, 0.78)], 0.014, 'wood', segs=8, bend=0.0)
        P.tube('leg', [(0.28, y, 0.0), (0.0, y, 0.78)], 0.014, 'wood', segs=8, bend=0.0)
    for (x, z) in [(0.0, 0.78), (-0.1, 0.52), (0.1, 0.52), (-0.19, 0.27), (0.19, 0.27)]:
        P.cyl('rail', 0.009, w + 0.06, (x, 0.0, z), 'wood', axis='Y', segs=8, bev=None)
    for i in range(5):
        y = -0.25 + i * 0.125
        P.cyl('string', 0.0018, 0.16, (0.0, y, 0.7), 'fabric', segs=4, bev=None)
        for k in range(3):
            P.sphere('dried', 0.022 + 0.004 * jit(i, k), (0.0, y + 0.012 * jit(k, i), 0.66 - k * 0.045), 'paint_b',
                     u=7, v=4, scale=(0.9, 0.9, 0.55))
    P.views = [('a', 35, 15), ('b', 215, 15)]


def cook_smoker(P):
    """A smoker box: a sheet-metal cabinet on legs, a door with a latch, a chimney, a firebox under it."""
    P.ao_distance = 0.08
    P.box('box', (0.36, 0.42, 0.42), (0.0, 0.0, 0.33), 'paint', bev=0.01)
    P.box('door', (0.01, 0.34, 0.33), (0.185, 0.0, 0.34), 'paint', bev=0.006)
    P.box('latch', (0.02, 0.03, 0.04), (0.195, 0.13, 0.36), 'steel', bev=0.003)
    P.box('fire', (0.3, 0.3, 0.1), (0.0, 0.0, 0.07), 'trim', bev=0.006)
    P.box('vent', (0.012, 0.16, 0.03), (0.155, 0.0, 0.07), 'rust', bev=0.002)
    P.cyl('chimney', 0.035, 0.18, (-0.08, 0.1, 0.62), 'paint_b', segs=12, bev=0.003)
    P.cyl('cap', 0.05, 0.012, (-0.08, 0.1, 0.72), 'paint_b', segs=12, bev=0.003)
    for (x, y) in [(-0.15, -0.18), (-0.15, 0.18), (0.15, -0.18), (0.15, 0.18)]:
        P.cyl('leg', 0.012, 0.03, (x, y, 0.015), 'trim', segs=8, bev=None)
    P.views = [('a', 35, 20), ('b', 215, 20)]


def cook_stove(P):
    """A camp stove: a low box with one burner on top, three pot rests round it, a gas canister at its side, a knob."""
    P.ao_distance = 0.05
    P.box('body', (0.3, 0.26, 0.09), (0.0, 0.0, 0.045), 'paint', bev=0.012)
    P.box('top', (0.26, 0.22, 0.008), (0.0, 0.0, 0.094), 'trim', bev=0.003)
    P.cyl('burner', 0.045, 0.02, (0.0, 0.0, 0.105), 'steel', segs=16, bev=0.003)
    P.torus('ring', 0.035, 0.004, loc=(0.0, 0.0, 0.117), material='alu', segs=16, rsegs=4)
    for k in range(3):
        a = k * math.tau / 3 + 0.4
        P.box('rest', (0.06, 0.012, 0.03), (0.07 * math.cos(a), 0.07 * math.sin(a), 0.115), 'trim',
              rot=(0.0, 0.0, a), bev=0.002)
    P.cyl('canister', 0.045, 0.1, (-0.07, -0.18, 0.05), 'paint_b', axis='X', segs=14, bev=0.006)
    P.cyl('knob', 0.016, 0.02, (0.16, 0.06, 0.055), 'paint_b', axis='X', segs=10, bev=0.003)
    P.views = [('a', 35, 30), ('b', 215, 30)]


def cook_jar(P):
    """A pickling jar of glazed stoneware: a wide belly, a narrow neck, a lid with a water rim."""
    P.ao_distance = 0.05
    P.lathe('jar', [(0.0, 0.0), (0.09, 0.0), (0.12, 0.05), (0.13, 0.14), (0.11, 0.22), (0.075, 0.25),
                    (0.075, 0.27), (0.0, 0.27)], material='paint', segs=24, sharp=40.0)
    P.lathe('rim', [(0.075, 0.25), (0.11, 0.25), (0.112, 0.27), (0.105, 0.272), (0.08, 0.265)], material='paint_b',
            segs=24, sharp=40.0)
    P.lathe('lid', [(0.0, 0.305), (0.04, 0.3), (0.085, 0.28), (0.09, 0.27), (0.0, 0.27)], material='paint_b',
            segs=24, sharp=40.0)
    P.sphere('knob', 0.016, (0.0, 0.0, 0.31), 'paint_b', u=8, v=5)
    P.views = [('a', 35, 25), ('b', 215, 25)]


def cook_cooler(P):
    """A cool box: a blue body, a white lid with a carrying handle, a latch at each end."""
    P.ao_distance = 0.06
    P.box('body', (0.5, 0.32, 0.25), (0.0, 0.0, 0.125), 'paint', bev=0.02)
    P.box('lid', (0.51, 0.33, 0.06), (0.0, 0.0, 0.28), 'paint_b', bev=0.02)
    P.box('handle', (0.2, 0.03, 0.025), (0.0, 0.0, 0.33), 'paint_b', bev=0.008)
    for s in (-1, 1):
        P.box('post', (0.02, 0.02, 0.03), (s * 0.09, 0.0, 0.318), 'paint_b', bev=0.004)
        P.box('latch', (0.012, 0.06, 0.05), (s * 0.255, 0.0, 0.23), 'trim', bev=0.003)
    P.views = [('a', 35, 25), ('b', 215, 25)]


# ------------------------------------------------------------------------------------------------ dishes

def bowl(P, r=0.075, h=0.055, fill=0.04, food='paint_b', heap=0.0):
    """A bowl in the item's paint with its food filled to `fill`, heaped `heap` over the rim."""
    P.lathe('bowl', [(0.0, 0.0), (0.032, 0.0), (0.035, 0.008), (r * 0.8, h * 0.45), (r, h), (r - 0.005, h + 0.002),
                     (r * 0.78, h * 0.45), (0.0, 0.012)], material='paint', segs=24, sharp=50.0)
    if heap > 0:
        P.lathe('food', [(0.0, fill + heap), (r * 0.5, fill + heap * 0.7), (r * 0.9, fill), (0.0, fill)],
                material=food, segs=20, sharp=60.0)
    else:
        P.cyl('food', r * (0.78 + 0.22 * fill / h) - 0.004, 0.004, (0.0, 0.0, fill), food, segs=20, bev=None)


def plate(P, r=0.11):
    P.lathe('plate', [(0.0, 0.0), (r * 0.55, 0.0), (r * 0.6, 0.006), (r * 0.85, 0.01), (r, 0.02), (r - 0.006, 0.022),
                      (r * 0.83, 0.014), (0.0, 0.012)], material='paint', segs=28, sharp=50.0)


def dish_soup(P):
    """A bowl of soup with a spoon in it, a few bits floating."""
    P.ao_distance = 0.03
    bowl(P, fill=0.045)
    for k in range(4):
        a = k * 1.7
        P.sphere('bit', 0.008, (0.035 * math.cos(a), 0.035 * math.sin(a), 0.047), 'paint_b', u=6, v=4,
                 scale=(1.2, 1.0, 0.4))
    P.tube('spoon', [(-0.01, 0.0, 0.04), (-0.06, 0.0, 0.07), (-0.11, 0.0, 0.09)], 0.004, 'alu', segs=6, bend=0.01)
    P.sphere('scoop', 0.014, (-0.005, 0.0, 0.042), 'alu', u=8, v=4, scale=(1.3, 1.0, 0.35))
    P.views = [('a', 35, 40), ('b', 215, 40)]


def dish_stew(P):
    """A deep bowl of stew: chunks standing out of a thick sauce."""
    P.ao_distance = 0.03
    bowl(P, r=0.08, h=0.065, fill=0.05)
    for k in range(6):
        a = k * 1.1
        P.sphere('chunk', 0.013 + 0.003 * jit(k), (0.04 * math.cos(a) * (0.5 + 0.5 * (k % 2)), 0.04 * math.sin(a) * (0.5 + 0.5 * (k % 2)), 0.053),
                 'paint_b' if k % 2 else 'paint', u=7, v=4, scale=(1.0, 1.0, 0.7), rot=(k * 0.3, 0.0, k))
    P.views = [('a', 35, 40), ('b', 215, 40)]


def dish_stirfry(P):
    """A plate with a heap of stir-fried greens and bits."""
    P.ao_distance = 0.03
    plate(P)
    for k in range(9):
        a = k * 0.7
        rr = 0.04 * (k % 3) / 2
        P.sphere('leaf', 0.022, (rr * math.cos(a), rr * math.sin(a), 0.022 + 0.008 * (k % 2)), 'paint_b', u=8, v=4,
                 scale=(1.3, 0.6, 0.25), rot=(0.2 * jit(k), 0.3 * jit(k, 1), a))
    P.views = [('a', 35, 45), ('b', 215, 45)]


def dish_roast(P):
    """Two skewers of roast chunks on a plate."""
    P.ao_distance = 0.03
    plate(P, 0.12)
    for s in (-1, 1):
        y = s * 0.025
        P.cyl('stick', 0.003, 0.22, (0.0, y, 0.03), 'wood', axis='X', segs=6, bev=None)
        for k in range(4):
            P.sphere('chunk', 0.016, (-0.06 + k * 0.04, y, 0.032), 'paint_b', u=7, v=5, scale=(1.0, 0.9, 0.85),
                     rot=(k * 0.5, 0.0, k * 0.7))
    P.views = [('a', 35, 45), ('b', 215, 45)]


def dish_fry(P):
    """A plate with two golden fried pieces."""
    P.ao_distance = 0.03
    plate(P)
    for k, (x, y) in enumerate([(-0.025, -0.01), (0.03, 0.015)]):
        P.lathe('piece', [(0.0, 0.015), (0.032, 0.015), (0.04, 0.022), (0.036, 0.03), (0.0, 0.032)],
                loc=(x, y, 0.0), material='paint_b', segs=16, sharp=50.0)
    P.views = [('a', 35, 45), ('b', 215, 45)]


def dish_steam(P):
    """A small bamboo steamer basket with three buns in it."""
    P.ao_distance = 0.03
    P.lathe('basket', [(0.0, 0.0), (0.085, 0.0), (0.09, 0.004), (0.09, 0.045), (0.084, 0.046), (0.083, 0.006),
                       (0.0, 0.006)], material='paint', segs=24, sharp=40.0)
    P.torus('band', 0.091, 0.003, loc=(0.0, 0.0, 0.025), material='paint', segs=24, rsegs=4)
    for k in range(3):
        a = k * math.tau / 3
        P.sphere('bun', 0.03, (0.038 * math.cos(a), 0.038 * math.sin(a), 0.02), 'paint_b', u=10, v=6,
                 scale=(1.0, 1.0, 0.75))
        P.sphere('pleat', 0.007, (0.038 * math.cos(a), 0.038 * math.sin(a), 0.043), 'paint_b', u=6, v=4)
    P.views = [('a', 35, 40), ('b', 215, 40)]


def dish_rice(P):
    """A bowl heaped with rice."""
    P.ao_distance = 0.03
    bowl(P, fill=0.05, heap=0.025)
    P.views = [('a', 35, 35), ('b', 215, 35)]


def dish_salad(P):
    """A plate of cold greens, fanned out."""
    P.ao_distance = 0.03
    plate(P)
    for k in range(7):
        a = k * 0.9
        P.sphere('leaf', 0.03, (0.03 * math.cos(a), 0.03 * math.sin(a), 0.02 + 0.004 * (k % 3)), 'paint_b', u=8, v=4,
                 scale=(1.2, 0.55, 0.12), rot=(0.1 * jit(k), 0.0, a))
    P.views = [('a', 35, 45), ('b', 215, 45)]


def dish_preserve(P):
    """A jar of preserves: glass-green, what is in it showing, a cloth tied over its mouth."""
    P.ao_distance = 0.03
    P.lathe('jar', [(0.0, 0.0), (0.04, 0.0), (0.045, 0.01), (0.045, 0.085), (0.034, 0.1), (0.034, 0.11), (0.0, 0.11)],
            material='paint', segs=20, sharp=40.0)
    P.cyl('inside', 0.046, 0.06, (0.0, 0.0, 0.045), 'paint_b', segs=20, bev=None)
    P.lathe('cloth', [(0.0, 0.122), (0.03, 0.118), (0.04, 0.105), (0.036, 0.1), (0.0, 0.1)], material='fabric',
            segs=16, sharp=40.0)
    P.torus('tie', 0.035, 0.002, loc=(0.0, 0.0, 0.104), material='fabric', segs=16, rsegs=4)
    P.views = [('a', 35, 25), ('b', 215, 25)]


def dish_sweet(P):
    """A small plate with a wedge of cake, its filling showing."""
    P.ao_distance = 0.03
    plate(P, 0.085)
    P.prism('cake', [(0.0, 0.0), (0.07, -0.03), (0.07, 0.03)], 0.035, loc=(-0.035, 0.0, 0.03), material='paint',
            rot=(0.0, 0.0, 0.0), bev=0.004)
    P.prism('filling', [(0.0, 0.0), (0.071, -0.031), (0.071, 0.031)], 0.008, loc=(-0.035, 0.0, 0.03),
            material='paint_b', bev=0.002)
    P.sphere('berry', 0.009, (0.02, 0.0, 0.053), 'paint_b', u=8, v=5)
    P.views = [('a', 35, 35), ('b', 215, 35)]


def dish_drink(P):
    """A cup with its drink in it, a handle."""
    P.ao_distance = 0.03
    P.lathe('cup', [(0.0, 0.0), (0.03, 0.0), (0.035, 0.01), (0.04, 0.07), (0.036, 0.072), (0.031, 0.012), (0.0, 0.01)],
            material='paint', segs=20, sharp=45.0)
    P.cyl('drink', 0.036, 0.003, (0.0, 0.0, 0.06), 'paint_b', segs=18, bev=None)
    P.torus('handle', 0.018, 0.005, loc=(0.045, 0.0, 0.04), axis='Y', material='paint', segs=12, rsegs=5,
            arc=math.pi * 1.2, a0=-math.pi * 0.6)
    P.views = [('a', 35, 30), ('b', 215, 30)]


def dish_camp(P):
    """A tin mess plate with a heap of camp food, a fork across it."""
    P.ao_distance = 0.03
    P.lathe('tin', [(0.0, 0.0), (0.09, 0.0), (0.105, 0.022), (0.1, 0.024), (0.087, 0.006), (0.0, 0.006)],
            material='paint', segs=24, sharp=40.0)
    P.lathe('food', [(0.0, 0.035), (0.04, 0.03), (0.07, 0.012), (0.0, 0.012)], material='paint_b', segs=18,
            sharp=60.0)
    P.box('fork', (0.15, 0.012, 0.003), (0.0, 0.05, 0.03), 'alu', rot=(0.0, 0.0, 0.3), bev=0.001)
    P.views = [('a', 35, 40), ('b', 215, 40)]


def dish_spoiled(P):
    """A bowl of something that has gone off: a dull mess, a fly's worth of crust."""
    P.ao_distance = 0.03
    bowl(P, fill=0.035)
    for k in range(5):
        P.sphere('mould', 0.011, (0.03 * math.cos(k * 1.3), 0.03 * math.sin(k * 1.3), 0.037), 'paint_b', u=6, v=4,
                 scale=(1.4, 1.1, 0.35))
    P.views = [('a', 35, 40), ('b', 215, 40)]


def recipe_page(P):
    """A page torn from an old cookbook: a bowl drawn on it in the second colour, lines of print."""
    P.ao_distance = 0.02
    P.box('page', (0.15, 0.105, 0.0016), (0.0, 0.0, 0.0008), 'paint', bev=None)
    P.lathe('bowl', [(0.0, 0.0), (0.02, 0.0), (0.026, 0.0)], loc=(-0.035, 0.012, 0.0018), material='paint_b', segs=16)
    P.cyl('drawn', 0.026, 0.0008, (-0.035, 0.012, 0.0018), 'paint_b', segs=16, bev=None)
    P.box('steam', (0.004, 0.02, 0.0007), (-0.035, 0.045, 0.0019), 'trim', bev=None)
    for i in range(4):
        P.box('line', (0.05 - 0.008 * (i % 2), 0.004, 0.0006), (0.04 - 0.004 * (i % 2), 0.034 - i * 0.014, 0.0019),
              'trim', bev=None)
    for i in range(2):
        P.box('line', (0.12, 0.004, 0.0006), (0.0, -0.03 - i * 0.014, 0.0019), 'trim', bev=None)
    P.views = [('a', 35, 55), ('b', 215, 55)]


# ------------------------------------------------------------------------------------------------ meat and eggs

def meat_cut(P):
    """A cut of meat: a thick slab, its fat along one edge."""
    P.ao_distance = 0.03
    P.sphere('meat', 0.07, (0.0, 0.0, 0.018), 'paint', u=12, v=6, scale=(1.25, 0.85, 0.28), rot=(0.0, 0.0, 0.2))
    P.sphere('fat', 0.06, (-0.04, 0.035, 0.02), 'paint_b', u=10, v=5, scale=(1.2, 0.28, 0.3), rot=(0.0, 0.0, 0.2))
    P.views = [('a', 35, 35), ('b', 215, 35)]


def meat_bone(P):
    """A bone with a knuckle at each end, a little meat still on it."""
    P.ao_distance = 0.03
    P.cyl('shaft', 0.014, 0.16, (0.0, 0.0, 0.018), 'paint', axis='X', segs=10, bev=None)
    for s in (-1, 1):
        for d in (-1, 1):
            P.sphere('knuckle', 0.019, (s * 0.085, d * 0.012, 0.019), 'paint', u=8, v=5)
    P.sphere('meat', 0.022, (0.02, 0.0, 0.025), 'paint_b', u=8, v=5, scale=(1.5, 1.0, 0.8))
    P.views = [('a', 35, 35), ('b', 215, 35)]


def egg_wild(P):
    """Three speckled eggs in a twist of straw."""
    P.ao_distance = 0.03
    P.torus('nest', 0.045, 0.012, loc=(0.0, 0.0, 0.012), material='paint_b', segs=16, rsegs=6)
    for k, (x, y) in enumerate([(-0.018, -0.01), (0.02, -0.006), (0.0, 0.022)]):
        P.sphere('egg', 0.022, (x, y, 0.026), 'paint', u=10, v=7, scale=(0.95, 0.95, 1.25), rot=(0.3 * jit(k), 0.4, 0.0))
    P.views = [('a', 35, 35), ('b', 215, 35)]


# ------------------------------------------------------------------------------------------------ the kitchen corner

def kitchen_corner(P):
    """
    The workshop's kitchen corner: a counter of old planks on a steel frame (depth along x, its front to +x, its
    width along y), a two-ring hob and a chopping board on its top, a backboard with a rail of pans and a pot
    hanging from it, a shelf of jars.
    """
    P.ao_distance = 0.2
    D, W, H = 0.62, 1.8, 0.9
    P.box('top', (D, W, 0.05), (0.0, 0.0, H - 0.025), 'wood', bev=0.01)
    for (x, y) in [(-D / 2 + 0.04, -W / 2 + 0.04), (-D / 2 + 0.04, W / 2 - 0.04), (D / 2 - 0.04, -W / 2 + 0.04),
                   (D / 2 - 0.04, W / 2 - 0.04)]:
        P.box('leg', (0.05, 0.05, H - 0.05), (x, y, (H - 0.05) / 2), 'steel', bev=0.006)
    P.box('shelf', (D - 0.06, W - 0.06, 0.03), (0.0, 0.0, 0.18), 'wood', bev=0.006)
    P.box('apron', (0.02, W - 0.1, 0.12), (D / 2 - 0.03, 0.0, H - 0.11), 'paint', bev=0.004)
    # the hob: a steel plate with two rings and knobs at its front
    P.box('hob', (0.42, 0.62, 0.04), (0.04, 0.0, H + 0.02), 'steel', bev=0.006)
    for y in (-0.15, 0.15):
        P.torus('ring', 0.07, 0.008, loc=(0.04, y, H + 0.045), material='trim', segs=16, rsegs=4)
        P.cyl('burner', 0.035, 0.012, (0.04, y, H + 0.046), 'trim', segs=12, bev=0.002)
        P.cyl('knob', 0.014, 0.016, (0.255, y, H + 0.02), 'paint_b', axis='X', segs=10, bev=0.003)
    P.box('board', (0.28, 0.36, 0.02), (0.06, 0.6, H + 0.01), 'wood', bev=0.005)
    # the backboard, its rail and what hangs from it
    P.box('back', (0.03, W, 0.9), (-D / 2 + 0.015, 0.0, H + 0.45), 'wood', bev=0.006)
    P.cyl('rail', 0.009, W - 0.2, (-D / 2 + 0.07, 0.0, H + 0.72), 'steel', axis='Y', segs=8, bev=None)
    for k, (y, kind) in enumerate([(-0.65, 'pan'), (-0.32, 'pot'), (0.05, 'pan'), (0.38, 'ladle'), (0.6, 'ladle')]):
        P.tube('hook', [(-D / 2 + 0.07, y, H + 0.72), (-D / 2 + 0.085, y, H + 0.69), (-D / 2 + 0.075, y, H + 0.66)],
               0.003, 'steel', segs=5, bend=0.005)
        if kind == 'pan':
            r = 0.12 if k == 0 else 0.1
            P.cyl('pan', r, 0.02, (-D / 2 + 0.06, y, H + 0.55 - r), 'paint', axis='X', segs=20, bev=0.004)
            P.box('pan_handle', (0.02, 0.025, 0.16), (-D / 2 + 0.06, y, H + 0.6), 'paint_b', bev=0.006)
        elif kind == 'pot':
            P.cyl('pot', 0.09, 0.14, (-D / 2 + 0.11, y, H + 0.5), 'paint', segs=18, bev=0.004)
            P.torus('pot_bail', 0.09, 0.003, loc=(-D / 2 + 0.11, y, H + 0.57), axis='X', material='steel', segs=14,
                    rsegs=4, arc=math.pi)
        else:
            P.cyl('ladle', 0.006, 0.22, (-D / 2 + 0.07, y, H + 0.55), 'steel', segs=6, bev=None)
            P.sphere('ladle_cup', 0.03, (-D / 2 + 0.075, y, H + 0.43), 'steel', u=8, v=4, scale=(1.0, 1.0, 0.6))
    # a shelf of jars over it all
    P.box('upper', (0.16, W - 0.2, 0.025), (-D / 2 + 0.11, 0.0, H + 0.86), 'wood', bev=0.005)
    for k in range(6):
        y = -0.7 + k * 0.28
        P.cyl('jar', 0.035, 0.08 + 0.02 * (k % 2), (-D / 2 + 0.1, y, H + 0.92 + 0.01 * (k % 2)), 'ceramic' if k % 2 else 'paint_b',
              segs=10, bev=0.003)
    P.views = [('a', 35, 15), ('b', 215, 15)]


MODELS = {
    'cook_bowl': cook_bowl,
    'cook_spit': cook_spit,
    'cook_grill': cook_grill,
    'cook_pan': cook_pan,
    'cook_wok': cook_wok,
    'cook_steamer': cook_steamer,
    'cook_pot': cook_pot,
    'cook_dutch_oven': cook_dutch_oven,
    'cook_kettle': cook_kettle,
    'cook_board': cook_board,
    'cook_mortar': cook_mortar,
    'cook_rack': cook_rack,
    'cook_smoker': cook_smoker,
    'cook_stove': cook_stove,
    'cook_jar': cook_jar,
    'cook_cooler': cook_cooler,
    'dish_soup': dish_soup,
    'dish_stew': dish_stew,
    'dish_stirfry': dish_stirfry,
    'dish_roast': dish_roast,
    'dish_fry': dish_fry,
    'dish_steam': dish_steam,
    'dish_rice': dish_rice,
    'dish_salad': dish_salad,
    'dish_preserve': dish_preserve,
    'dish_sweet': dish_sweet,
    'dish_drink': dish_drink,
    'dish_camp': dish_camp,
    'dish_spoiled': dish_spoiled,
    'recipe_page': recipe_page,
    'meat_cut': meat_cut,
    'meat_bone': meat_bone,
    'egg_wild': egg_wild,
    'kitchen_corner': kitchen_corner,
}


def main(args):
    # every model is set down on z = 0 with its footprint over the origin (the kitchen corner keeps its own
    # origin: the middle of its counter's foot, so the game can stand it against the wall by that point)
    table = {}
    for pid, build in MODELS.items():
        def settled(P, build=build, pid=pid):
            build(P)
            settle(P, center=pid != 'kitchen_corner')
        table[pid] = settled
    K.run(table, args, out_dir=OUT, geo=False)
