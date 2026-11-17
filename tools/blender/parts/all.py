"""
Rebuild every ModCar part in one Blender run:

    blender -b --factory-startup --python tools/blender/build.py -- parts/all [--norender] [--noao]

Runs each group module's main(['all', ...flags]) in turn (wheels builds every tyre variant too; tools writes
public/models/modcar/tools/).
"""
import importlib
import time

GROUPS = ['engines', 'drivetrain', 'fluids', 'wheels', 'cockpit', 'seats', 'body', 'lamps', 'tools', 'chassis']


def main(args):
    flags = [a for a in args if a.startswith('--')]
    only = [a for a in args if not a.startswith('--')]
    t0 = time.time()
    for g in GROUPS:
        if only and g not in only:
            continue
        mod = importlib.import_module(f'parts.{g}')
        print(f'=== group {g}')
        mod.main(['all'] + flags)
    print(f'ALL DONE in {time.time() - t0:.0f}s')
