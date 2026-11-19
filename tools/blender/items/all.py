"""
Every item model (src/core/modcar/items.ts: food, drinks, medicine, clothes, backpacks, lamps, gear, junk,
boxes of components) in one go:

    blender -b --factory-startup --python tools/blender/build.py -- items/all [--norender]

Writes public/models/modcar/items/<model>.glb. The groups: items/consumables, items/wear, items/junk, items/forage.
"""
import importlib


def main(args):
    for name in ('consumables', 'wear', 'junk', 'forage'):
        try:
            mod = importlib.import_module(f'items.{name}')
        except ModuleNotFoundError:
            print(f'(no items.{name} yet)')
            continue
        mod.main(list(args) or ['all'])
