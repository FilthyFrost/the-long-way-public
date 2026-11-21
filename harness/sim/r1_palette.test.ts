// Milestone R1 (docs/V3/nodes/R1-palettes.md): every place of the emergent Earth painted in a palette of its own —
// its woods, its grass, its straw, its soil, its flowers, its air — every plant's colour taken into it: no green
// crown in a snowfield, no green grass in a hot desert, the woods of a place one family of colour, the places
// along a journey each their own.
import { describe, expect, it } from 'vitest';
import { EarthJourney, SCENE_LENGTH, type Scene } from '../../src/core/earth/director';
import { wetnessAt } from '../../src/core/earth/climate';
import { grassColour, hueTurn, labOf, lchOf, leafColour, paletteOfPlace, swatches } from '../../src/core/world/earth/palette';
import { lookOfPlace } from '../../src/core/world/earth/region';
import { BIOMES } from '../../src/core/world/biomes';
import { World } from '../../src/core/world/terrain';

const SEEDS = [3, 7, 11, 99, 2026, 4242];
/** the crowns' own colours (scene/crowns/palette.ts): spruce, pine, larch, birch, beech, maple, olive, acacia, eucalyptus, saguaro, bamboo, coconut palm */
const LEAVES = [0x517f67, 0x709463, 0x98b565, 0x9fc572, 0x77a45a, 0x81ad60, 0xafb7a0, 0x98a862, 0x93ac97, 0x82a588, 0x8bb067, 0x82a651];
/** the ground's own colours (groundTables.ts): a meadow grass, a dry tussock, a sedge */
const BLADES = [0x9da95b, 0xb1a069, 0x8b9e5e];

function places(seed: number, n = 40): Scene[] {
  const j = new EarthJourney(seed);
  j.sceneAt((n - 1) * SCENE_LENGTH + 1);
  return j.scenes.slice(0, n);
}
const ALL = SEEDS.flatMap((seed) => places(seed).map((sc) => ({ seed, sc })));
const isGreen = (c: number): boolean => {
  const x = lchOf(c);
  return x.C > 0.06 && x.h > 100 && x.h < 175;
};

describe('the places\' palettes', () => {
  it('paints no crown green under snow, and no grass green in a hot desert', () => {
    let snowy = 0;
    let deserts = 0;
    for (const { seed, sc } of ALL) {
      const p = paletteOfPlace(sc, seed, sc.index);
      const w = wetnessAt(sc.macro, sc.macro.base);
      if (sc.look.sig.snow) {
        snowy++;
        for (const own of LEAVES) {
          const c = lchOf(leafColour(p, own));
          expect(c.C, `${sc.name} under snow`).toBeLessThanOrEqual(0.055);
          expect(c.L, sc.name).toBeLessThan(0.62);
        }
        for (const own of BLADES) expect(lchOf(grassColour(p, own)).C, sc.name).toBeLessThanOrEqual(0.05);
      }
      if (w < 0.2 && !sc.look.sig.snow) {
        deserts++;
        for (const own of BLADES) expect(isGreen(grassColour(p, own)), `${sc.name}: green grass in the desert`).toBe(false);
        for (const own of LEAVES) expect(lchOf(leafColour(p, own)).C, `${sc.name}: a lush crown in the desert`).toBeLessThanOrEqual(0.095);
      }
    }
    expect(snowy).toBeGreaterThan(5);
    expect(deserts).toBeGreaterThan(5);
  });

  it('keeps every place\'s woods one family of colour, each kind of tree still its own', () => {
    for (const { seed, sc } of ALL) {
      const p = paletteOfPlace(sc, seed, sc.index);
      const hues = LEAVES.map((own) => lchOf(leafColour(p, own)));
      // (the spread of their hues about the woods' key)
      const turns = hues.filter((c) => c.C > 0.02).map((c) => hueTurn(p.leaf.h, c.h));
      if (turns.length) expect(Math.max(...turns) - Math.min(...turns), sc.name).toBeLessThanOrEqual(50);
      // (and no two kinds the same colour: a birch is paler than a spruce wherever they grow)
      expect(lchOf(leafColour(p, 0x9fc572)).L, sc.name).toBeGreaterThan(lchOf(leafColour(p, 0x517f67)).L + 0.05);
    }
  });

  it('gives each place along a journey a palette of its own', () => {
    const dist = (a: number, b: number): number => {
      const x = labOf(a);
      const y = labOf(b);
      return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]);
    };
    for (const seed of SEEDS) {
      const sc = places(seed);
      let apart = 0;
      for (let k = 1; k < sc.length; k++) {
        const a = swatches(paletteOfPlace(sc[k - 1], seed, k - 1));
        const b = swatches(paletteOfPlace(sc[k], seed, k));
        const d = (dist(a.leaf[1], b.leaf[1]) + dist(a.grass[1], b.grass[1]) + dist(a.soil, b.soil)) / 3;
        if (d > 0.02) apart++;
      }
      expect(apart / (sc.length - 1), `seed ${seed}`).toBeGreaterThan(0.85);
    }
    // the same tree is painted as its place has it: a pine of the snow, of the desert, of the tropics
    const pines = ALL.map(({ seed, sc }) => lchOf(leafColour(paletteOfPlace(sc, seed, sc.index), 0x709463)));
    expect(Math.max(...pines.map((c) => c.C)) - Math.min(...pines.map((c) => c.C))).toBeGreaterThan(0.05);
    expect(Math.max(...pines.map((c) => c.L)) - Math.min(...pines.map((c) => c.L))).toBeGreaterThan(0.12);
  });

  it('paints a place\'s ground, woods and air out of its palette, and keeps its meadows above its last trees', () => {
    const w = new World(9, { worldVersion: 4 });
    for (let c = 1; c < 30; c++) {
      const def = BIOMES[w.spine.plan.biomeOf(c)];
      const look = def.earth!;
      const sc = w.earth!.pieces[c].scene!.place;
      expect(look.palette, def.label).toBeDefined();
      expect(look.crowns).toEqual(swatches(look.palette!).leaf);
      expect(look.palette!.air.haze).toBeGreaterThan(0);
      // (an alpine meadow or a tundra above its tree line: its ground's plants go on above the road)
      if (!['bare', 'ice', 'desert'].includes(sc.look.efg.struct)) expect(def.relief!.bare!, def.label).toBeGreaterThan(sc.macro.base + 300);
      // (its rock in layers only where rock shows)
      if (look.strata > 0) expect(['desert', 'bare', 'shrubland'].includes(sc.look.efg.struct) || ['tables', 'canyon', 'cliffs', 'towers'].includes(sc.look.landform.silhouette), def.label).toBe(true);
    }
    // (the look of a place is the same however it is asked for)
    const sc = places(9, 5)[3];
    expect(lookOfPlace(sc, 9, 3)).toEqual(lookOfPlace(sc, 9, 3));
  });
});
