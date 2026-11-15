"""
The starting workshop (docs/MODCAR.md section 9), built in the background:

    blender -b --factory-startup --python tools/blender/build.py -- garage/garage [--noao] [--preview]

Writes public/models/modcar/garage/garage.glb (one mesh per material for everything that stands
still, and the moving pieces: the doors, the charger's needle and lamp, the light switch) and
src/game/modcar/data/garage.json, the layout the game reads: the room and its openings (for the light
inside), the lamps, solids, the surfaces things can lie on, the spots where the parts wait at the start,
the devices, where the player starts and where the cars stand.

Game frame throughout (x to the door and the road, y up, z right); see _kit.py.
"""

import math
import os

from . import _kit as kit
from . import props as P
from . import shell as S

OUT_GLB = 'public/models/modcar/garage/garage.glb'
OUT_LAYOUT = 'src/game/modcar/data/garage.json'


def main(args):
    opts = {a[2:]: True for a in args if a.startswith('--')}
    K = kit.Kit('garage')
    L = {'version': 1}

    # ---- the building
    S.build(K, L)

    # ---- furniture and machines
    P.workbench(K, L)
    P.pegboard(K, L, -4.4, -2.05, 1.18, 2.45)
    P.charger_cart(K, L, 2.2, S.Z0 + 0.42)
    P.shelves(K, L, -2.2, 2.0, [0.42, 0.9, 1.38])
    P.steel_rack(K, L, -6.75, -4.85, [0.16, 0.95, 1.72])
    P.sliding_doors(K, L)
    for (x, z) in ((5.0, S.Z0 + 0.42), (5.65, S.Z0 + 0.4)):
        P.drum(K, L, x, z, 'p_red' if x < 5.3 else 'p_blue')
    P.drum(K, L, 5.3, S.Z0 + 0.98, 'p_yellow')
    P.tyre_stack(K, L, 5.95, S.Z1 - 0.55, 5)

    # ---- lamps (hung from the tie beams of the trusses)
    cord = S.EAVE - 0.1
    for (x, y, z) in ((-4.667, 2.35, -3.85), (-2.333, 2.35, -3.85), (0.0, 2.35, -3.85), (0.0, 2.85, 0.0), (2.333, 2.85, 0.0),
                      (-2.333, 2.6, 3.6), (-4.667, 2.75, 3.3), (4.667, 3.0, 0.2)):
        P.pendant(K, L, x, z, y, cord)

    # ---- where the cars stand, where the player starts, the floor spots round the project car
    L['carSpot'] = {'x': 0.4, 'z': 0.0, 'yaw': 0.0}
    L['bay2'] = {'x': 11.2, 'z': 4.7, 'yaw': -0.22}
    L['spawn'] = {'x': -4.7, 'z': -0.6, 'heading': 0.12}
    L['exitX'] = 21.0
    # floor: the tutorial's two wheels and engine first (left of the car, between it and the bench),
    # then the big fun parts round the room
    for (x, z, yaw) in ((-0.4, -2.35, 0.3), (0.85, -2.75, -0.2), (2.55, -2.3, 0.0),
                        (-3.3, 1.75, 0.4), (-2.0, 2.3, 0.0), (-4.3, 0.5, 1.2), (3.6, 2.6, 0.2),
                        (-3.4, 3.15, 0.0), (-0.6, 3.3, 0.5), (4.6, 3.6, 0.0), (3.2, 3.7, 0.0),
                        (-5.8, -2.6, 0.0), (-5.6, 1.4, 0.0), (4.4, -2.0, 0.0), (5.6, 1.9, 0.0)):
        P.spot(L, x, 0.0, z, yaw, 'floor')
    # shelves and the rack
    z0, z1 = S.Z1 - 0.67, S.Z1 - 0.17
    for y in (0.42, 0.9, 1.38):
        for i in range(4):
            P.spot(L, -1.75 + i * 1.15, y, (z0 + z1) / 2, -math.pi / 2, 'shelf')
    for y in (0.17, 0.96, 1.73):
        for i in range(2):
            P.spot(L, -6.3 + i * 0.95, y, S.Z1 - 0.52, -math.pi / 2, 'rack')
    # jerrycans stand by the drums
    for i in range(3):
        P.spot(L, 4.35 + i * 0.32, 0.0, S.Z0 + 0.35, 0.0, 'cans')

    K.finish(ao=not opts.get('noao'), ao_samples=24, ao_distance=0.9, no_ao=('win_glass', 'skylight', 'bulb', 'led', 'p_black', 'dial'))
    K.report()
    K.export(OUT_GLB)
    L['triangles'] = K.tris
    K.layout = L
    K.write_layout(OUT_LAYOUT)
    if opts.get('preview'):
        kit.preview(os.path.join(kit.SCRATCH, 'preview_in.png'), (-6.2, 1.7, -0.8), (4, 1.2, 0.8))
