"""
Every place model (places/furniture and places/outside) in one go:

    blender -b --factory-startup --python tools/blender/build.py -- places/all [--toon] [--look] [--norender]

Writes public/models/modcar/places/<id>.glb; check them with places/verify.
"""
from places import furniture, outside


def main(args):
    flags = [a for a in args if a.startswith('--')]
    ids = [a for a in args if not a.startswith('--')]
    for mod in (furniture, outside):
        mine = [i for i in ids if i in mod.MODELS] if ids and 'all' not in ids else ['all']
        if mine:
            mod.main(mine + flags)
