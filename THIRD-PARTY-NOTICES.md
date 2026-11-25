# Third-party notices

Parts of this game's code follow code written by others, under licences that ask for their notice to be kept
with it. Each is listed with the files of ours that follow it.

## Painted Valley (Patch, `blendi/painted-valley` v1.1.1, https://patch.gg/blendi/painted-valley)

The game's look follows Painted Valley's way of painting a place (specs/art/STYLE.md; refs/NOTES.md). Its
source was read to learn the techniques and our own code written for them; where our code follows its code
closely, it is listed here:

- `src/game/scene/crowns/grow.ts` — the broad-leaved grower: a trunk and boughs grown by Painted Valley's
  rules (`src/valley/trees.js` `growTree`), clumps of leaf sprays on dark cores, rewritten for levels of detail
  and with numbers of our own; the conifer grower there is ours.
- `src/game/render/crownMaterial.ts` — how a crown's sprays, cores and bark are painted (`src/valley/trees.js`
  `leafFragment`, `coreFragment`, `woodFragment`), in the game's own light and palettes.
- `src/game/render/meadowMaterial.ts` and `src/game/scene/meadow.ts` — the meadow's blades: rings of instanced
  blades following the eye, each placed and shaped by its world cell's numbers, bent in an arc, turned partly to
  the eye, fading from ring to ring on distances of their own (`src/lib/blades.js`, its rings' figures, its tall
  and short patches, clumps, seed stalks and the low sun among them), read from a map of our land's samples and
  painted in the game's own ground paint.
- `src/game/scene/flora/broadleaf.ts` — the plant toolkit's round broadleaf: Painted Valley's rules for growing a
  tree (`src/valley/trees.js` `growTree`: a short leaning bole, limbs bending out and up from its top with boughs
  from them, clumps at their ends and on the dome of the crown, how deep in the crown a point lies), with its
  numbers scaled to our heights, a leader for a birch, and our own level-of-detail fitter.
- `src/game/scene/flora/atlas.ts` — the oak's and the birch's sprays: a spray of leaves as Painted Valley paints
  one (`src/valley/trees.js` `leafTexture`: pointed leaves spread round a twig's end and more in the middle, each at
  its own tone in red), drawn into our atlas's tiles.
- `src/core/character/skeleton.ts` — the player character's skeleton: the starter man's joints (CC0, Patch; the
  Universal Animation Library's skeleton) by name, parent and rest frame, with her own lengths.
- `src/game/character/clips.ts`, `src/game/character/material.ts` — the clips taken in place with their travel kept
  as a speed (`src/figure/man.js`), and the figure drawn in flat lit and shade paint with an ink number in the
  frame's alpha (`src/valley/wanderer.js`).
- `public/models/character/pv-clips.glb` — Painted Valley's `public/figure/starter-man-clips.glb` unchanged:
  Quaternius' Universal Animation Library 1 and 2 (CC0 1.0) and Patch's own clips made with anymove (CC0 1.0).

```
MIT License

Copyright (c) 2026 Patch

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

Painted Valley's pictures are CC0 1.0; none of them is in this repository (its stills, used as targets of the
look, stay on the developer's machine under `refs/targets/painted-valley/`).
