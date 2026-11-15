"""
Entry point for the ModCar Blender scripts (run in the background):

    blender -b --factory-startup --python tools/blender/build.py -- <script> [args...]

<script> is a module path under tools/blender without .py, e.g. frames/sedan, parts/engines, test/lib_smoke.
The module's main(args) is called with the remaining arguments. Output paths are relative to the repo root.
"""
import importlib
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
if HERE not in sys.path:
    sys.path.insert(0, HERE)

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
if not argv:
    raise SystemExit('usage: blender -b --python tools/blender/build.py -- <script> [args...]')
name = argv[0].replace(chr(92), '/').removesuffix('.py').replace('/', '.')
mod = importlib.import_module(name)
os.chdir(ROOT)
mod.main(argv[1:])
