"""
The starting workshop (docs/MODCAR.md section 9), built in the background:

    blender -b --factory-startup --python tools/blender/build.py -- garage/garage [--noao] [--preview]

Writes public/models/modcar/garage/garage.glb (one mesh per material for everything that stands
still, and the moving pieces: the doors, the lift's carriage, the charger's needle and lamp, the light
switch, the tyre changer's table, the radio's pointer, the clock's hands, the fan) and
src/game/modcar/data/garage.json, the layout the game reads: the room and its openings (for the light
inside), the lamps, solids, the surfaces things can lie on, the spots where the parts wait at the start,
the devices, where the player starts and where the cars stand.

Game frame throughout (x to the door and the road, y up, z right); see _kit.py.

The room, from the door: the bench and its pegboard along the left wall with the charger cart, the
tool chest and the drums towards the door; the paint corner at the back left; the chalkboard, the
clock and the calendar on the back wall; the steel rack, the lift and the shelves along the right; the
tyre changer, the tyre stack and the sink by the door on the right. The project car in the middle.
"""

import math
import os

from . import _kit as kit
from . import deco as D
from . import machines as M
from . import outside as O
from . import props as P
from . import shell as S

OUT_GLB = 'public/models/modcar/garage/garage.glb'
OUT_LAYOUT = 'src/game/modcar/data/garage.json'

CAR_Z = -0.25


def main(args):
    opts = {a[2:]: True for a in args if a.startswith('--')}
    K = kit.Kit('garage')
    L = {'version': 2}

    # ---- the building
    S.build(K, L)

    # ---- the left wall: bench, pegboard, charger, tool chest, drums
    P.workbench(K, L)
    P.pegboard(K, L, -4.4, -2.05, 1.18, 2.45)
    D.pegboard_tools(K, -4.4, -2.05, 1.18, 2.45)
    D.bench_clutter(K, L)
    P.charger_cart(K, L, 2.2, S.Z0 + 0.42)
    M.tool_chest(K, L, 3.55, S.Z0 + 0.36, yaw_deg=90)
    M.radio(K, L, 3.5, 1.21, S.Z0 + 0.38, yaw_deg=90)
    for (x, z) in ((5.0, S.Z0 + 0.42), (5.65, S.Z0 + 0.4)):
        P.drum(K, L, x, z, 'p_red' if x < 5.3 else 'p_blue')
    P.drum(K, L, 5.3, S.Z0 + 0.98, 'p_yellow')
    D.extinguisher(K, S.X1 - 0.24, 0.55, S.Z0 + 0.62)
    D.broom(K, S.X1 - 0.3, S.Z0 + 0.2, lean_to=(0.6, -0.8))
    for x in (-1.55, -0.8):
        D.potted_plant(K, x, 1.3, S.Z0 + 0.06, 1.0, 'geranium')
    D.hanging_plant(K, 0.15, 2.35, S.Z0 + 0.55)

    # ---- the back: paint corner, chalkboard, clock, calendar, boxes
    M.paint_corner(K, L)
    M.chalkboard(K, L, S.X0 + 0.12, 1.66, -0.45)
    M.wall_clock(K, L, S.X0 + 0.12, 2.82, -0.45)
    M.calendar(K, S.X0 + 0.12, 1.82, 0.95)
    D.poster(K, S.X0 + 0.12, 1.85, 3.95, 0.5, 0.7, 1, 0, 'map')
    D.potted_plant(K, S.X0 + 0.1, 1.45, 2.25, 1.2, 'snake')
    M.stove(K, L, S.X0 + 0.45, 1.55)
    D.crate(K, L, -6.55, -1.7, yaw=8)
    D.cardboard(K, L, -6.6, -1.75, 0.5, 0.36, 0.42, yaw=-6, y=0.42)
    D.cardboard(K, L, -6.45, -0.95, 0.55, 0.42, 0.45, yaw=12)

    # ---- the right wall: rack, lift, shelves, tyre changer, tyres, sink
    P.steel_rack(K, L, -6.75, -4.85, [0.16, 0.95, 1.72])
    M.lift(K, L, -4.45, 3.2, span=2.9)
    zs0, zs1 = P.shelves(K, L, -2.2, 2.0, [0.42, 0.9, 1.38])
    spot_xs = [-1.75 + i * 1.15 for i in range(4)]
    D.shelf_fill(K, L, -2.2, 2.0, [0.42, 0.9, 1.38], zs0, zs1, spot_xs)
    M.tyre_changer(K, L, 3.7, S.Z1 - 0.62, yaw_deg=90)
    P.tyre_stack(K, L, 5.15, S.Z1 - 0.5, 5)
    P.tyre_stack(K, L, 5.75, S.Z1 - 0.45, 3)
    M.sink(K, L, S.X1 - 0.3, S.Z1 - 0.62)
    D.poster(K, S.X1 - 0.12, 2.05, 3.55, 0.48, 0.66, -1, 0, 'car')
    D.poster(K, S.X1 - 0.12, 2.1, -4.05, 0.46, 0.64, -1, 0, 'oil')
    D.potted_plant(K, 5.6, 0.0, 2.75, 2.2, 'fern')

    # ---- the floor round the car: jack, stands, a creeper, a drip pan, a mat by the bench
    M.floor_jack(K, 3.1, -1.75, yaw_deg=-30)
    M.axle_stand(K, -1.3, -1.6)
    M.axle_stand(K, -1.0, -1.85)
    M.creeper(K, -2.4, 1.0, yaw_deg=80)
    K.box('steel', (1.85, 0.015, CAR_Z), (0.6, 0.03, 0.45), bev=0.006, open='+y')
    K.box('rubber', (-1.6, 0.006, -3.95), (2.2, 0.012, 0.7), bev=0.004, tint=(1.6, 1.4, 1.3))

    # ---- up in the roof: planks and a ladder over the bench, a bicycle hung over the shelves
    D.roof_store(K)
    D.bicycle(K, 2.333, 3.05, 3.55, yaw=90)

    # ---- the doors
    P.sliding_doors(K, L)

    # ---- lamps (hung from the tie beams of the trusses, and over the bench from a rail between them)
    cord = S.EAVE - 0.1
    K.box('timber', (-2.333, S.EAVE - 0.02, -4.15), (4.7, 0.1, 0.08), bev=0.008, seg=0.6)
    # (over the bench low, over the car higher; each lights a pool, the room between them is the day's)
    for (x, y, z, reach, power) in ((-3.5, 2.05, -4.15, 3.2, 0.9), (-0.6, 2.05, -4.15, 3.2, 0.9), (0.0, 2.75, CAR_Z, 4.6, 2.4),
                                    (2.333, 2.75, CAR_Z, 4.6, 2.4), (-2.333, 2.5, 3.65, 3.8, 1.6), (-4.667, 2.6, 3.4, 3.8, 1.6),
                                    (4.667, 2.9, 0.2, 4.4, 2.2), (-4.667, 2.8, -1.0, 4.2, 2.0)):
        P.pendant(K, L, x, z, y, cord, reach=reach, power=power)

    # ---- outside
    O.gutters(K, L)
    O.rain_barrel(K, L, S.X0 - 0.55, S.Z0 - 0.6)
    for (wl, c, sill, w, h) in S.WINDOWS:
        if wl in ('L', 'R'):
            O.flower_box(K, wl, c, sill)
    O.woodpile(K, L, -5.6, -2.6, S.Z0 - 0.06)
    D.ladder(K, (S.X0 - 0.75, 0.0, 3.6), (S.X0 - 0.1, 3.5, 3.4))
    O.fuel_pump(K, L, 10.2, -5.2)
    O.mailbox(K, 20.9, -3.9)
    O.sign_post(K, 21.3, 4.6)
    M.sign_board(K, L, S.DOOR_H + 0.72)
    M.barn_lamp(K, L, S.DOOR_H + 0.62, -1.95)

    # ---- where the cars stand, where the player starts, the spots
    L['carSpot'] = {'x': 0.4, 'z': CAR_Z, 'yaw': 0.0}
    L['bay2'] = {'x': 11.4, 'z': 4.6, 'yaw': -0.22}
    L['spawn'] = {'x': -5.6, 'z': -1.25, 'heading': 0.1}
    L['exitX'] = 21.0
    # floor: the tutorial's two wheels and engine first (left of the car, between it and the bench),
    # then the big fun parts round the room
    for (x, z, yaw) in ((-0.6, -2.55, 0.3), (0.75, -2.95, -0.2), (2.6, -2.55, 0.0),
                        (-5.5, 0.45, 0.0), (1.2, 2.55, -2.6), (4.65, 3.0, 0.0), (-1.1, 2.6, 0.4),
                        (2.9, 2.35, 0.0), (4.4, 1.6, 0.0), (5.2, 3.3, 0.0), (5.3, 2.1, 0.0),
                        (-5.9, 2.55, 0.0), (4.5, -2.2, 0.0), (-1.9, 1.9, 0.0), (0.2, 2.4, 0.0)):
        P.spot(L, x, 0.0, z, yaw, 'floor')
    for y in (0.42, 0.9, 1.38):
        for x in spot_xs:
            P.spot(L, x, y, (zs0 + zs1) / 2, -math.pi / 2, 'shelf')
    for y in (0.17, 0.96, 1.73):
        for i in range(2):
            P.spot(L, -6.3 + i * 0.95, y, S.Z1 - 0.52, -math.pi / 2, 'rack')
    # jerrycans stand by the drums
    for i in range(3):
        P.spot(L, 4.35 + i * 0.3, 0.0, S.Z0 + 0.32, 0.0, 'cans')

    K.finish(ao=not opts.get('noao'), ao_samples=24, ao_distance=0.9, no_ao=('win_glass', 'skylight', 'bulb', 'led', 'dial', 'glass', 'shadow', 'fire', 'lamp_out'))
    K.report()
    K.export(OUT_GLB)
    L['triangles'] = K.tris
    K.layout = L
    K.write_layout(OUT_LAYOUT)
    if opts.get('preview'):
        kit.preview(os.path.join(kit.SCRATCH, 'preview_in.png'), (-6.2, 1.7, -0.8), (4, 1.2, 0.8))
