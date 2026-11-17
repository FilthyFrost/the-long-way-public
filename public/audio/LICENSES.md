# Audio sources and licences

Everything under `public/audio/` was generated for this project; no third-party recordings are used.

## `modcar/engines/<engine>/` — ModCar engine banks

- **Made with:** AngeTheGreat's *Engine Simulator* — <https://github.com/ange-yaghi/engine-sim>,
  commit `85f7c3b959a908ed5232ede4f1a4ac7eafe6b630`, MIT licence, © 2022 Ange Yaghi; its script
  compiler *piranha* (<https://github.com/ange-yaghi/piranha>, MIT) and
  *simple-2d-constraint-solver* (MIT), all by the same author. Built headless from source by
  `tools/enginesim/prepare.mjs` (two small build patches, listed there) and driven by our own
  recorder `tools/enginesim/esim_render.cpp`.
- **Engine definitions:** our own scripts in `tools/enginesim/engines/*.mr`, written for the fictional
  ModCar engines (structure modelled on the MIT example engines that ship with Engine Simulator),
  including the workshop's generator `gen_d1` (`gen_d1.mr`, a fictional 418 cc air-cooled single
  diesel on a 50 Hz set; bank in `modcar/engines/gen_d1/`, recorded and built the same way).
- **Impulse responses:** the exhaust impulse responses bundled in Engine Simulator's
  `es/sound-library/` (part of the MIT-licensed repository) are convolved into the recordings.
- **Post-processing:** `tools/enginesim/bank_build.py` (loop cutting, resampling, synthesized flow
  noise, diesel knock, cooling-fin, valve and alternator-hum layers, levelling) — our code.
  Encoded with FFmpeg (libopus / native AAC) as a build tool only; no FFmpeg code ships with the game.
- **Licence of the result:** the audio is our output; the MIT notice of Engine Simulator is kept
  here as attribution:

  > Copyright 2022 AngeTheGreat (Ange Yaghi)
  >
  > Permission is hereby granted, free of charge, to any person obtaining a copy of this software and
  > associated documentation files (the "Software"), to deal in the Software without restriction,
  > including without limitation the rights to use, copy, modify, merge, publish, distribute,
  > sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is
  > furnished to do so, subject to the following conditions: The above copyright notice and this
  > permission notice shall be included in all copies or substantial portions of the Software.
  > THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND.

## Mechanical sounds (doors, latches, wrench, parts, spray, sponge, pouring, key, horns, handbrake, gears, the body, the workshop)

Synthesized at run time by `src/game/modcar/foley.ts` (no files), including the workshop's: the
generator's starter rope, switch and running dry; the recycler running, grinding and shredding by
material, its counter; the crafting bench's tools, hammer and "ding"; the power coming on and going
off, the lamps. Our code.

## Engine run-time layers (starter motor, induction, fan / gear whine, turbo, pops, blow-off)

Synthesized at run time by `src/game/modcar/engineAudio.ts` (the generator has no starter motor: its
rope is the foley above). Our code.

Nothing here comes from Drive Beyond Horizons, Arctic Drive, Crankcase REV or any other commercial
product.
