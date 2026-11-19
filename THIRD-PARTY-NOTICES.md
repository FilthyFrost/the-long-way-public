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
