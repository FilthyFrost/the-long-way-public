// Milestones E3–E4 (docs/V3/nodes/E3-earth-plants.md): the emergent Earth's plants by their traits and their places —
// every place's ground profile its own (its belts' grasses, sedges, mosses, low shrubs and flowers, by the height
// each card fits), the flowers in their pollinators' colours and in bloom in the place's own month, the crowns
// coloured by the leaves' traits (autumn red in the continental cold, gold by a milder sea; the dry country's
// grey), the last trees below the tree line low and bent, the roadside as the country has it.
import { describe, expect, it } from 'vitest';
import { EarthJourney, SCENE_LENGTH, type Scene } from '../../src/core/earth/director';
import { BIOMES } from '../../src/core/world/biomes';
import { profileOfPlace } from '../../src/core/world/earth/profile';
import { crownsOf } from '../../src/core/world/earth/region';
import { FLORA } from '../../src/core/world/floraTables';
import { blossoms, groundProfile, pigments, plants } from '../../src/core/world/groundTables';
import { World } from '../../src/core/world/terrain';

/** the places of the first 60 of some journeys */
function places(seeds: readonly number[]): Scene[] {
  const out: Scene[] = [];
  for (const seed of seeds) {
    const j = new EarthJourney(seed);
    j.sceneAt(59 * SCENE_LENGTH + 1);
    out.push(...j.scenes.slice(1, 60));
  }
  return out;
}

const ALL = places([1, 2, 3, 7, 11, 2026]);
const rgb = (c: number): [number, number, number] => [(c >> 16) & 255, (c >> 8) & 255, c & 255];
const chroma = (c: number): number => Math.max(...rgb(c)) - Math.min(...rgb(c));

describe('the emergent Earth\'s plants: their places', () => {
  it('gives every place a ground profile of its own: belts covering all heights, every plant and colour one the ground knows', () => {
    for (const sc of ALL) {
      const p = profileOfPlace(sc, 'test');
      expect(p.bands[0].fromM).toBe(-1000);
      expect(p.bands[p.bands.length - 1].toM).toBe(9000);
      for (let k = 1; k < p.bands.length; k++) expect(p.bands[k].fromM, sc.name).toBe(p.bands[k - 1].toM);
      for (const b of p.bands) {
        for (const g of [...b.ground, ...b.shrubs]) expect(plants.has(g), `${sc.name} ${g}`).toBe(true);
        for (const f of b.flowers) {
          expect(blossoms.has(f.name), `${sc.name} ${f.name}`).toBe(true);
          for (const c of f.colors) expect(pigments[c], `${sc.name} ${c}`).toBeDefined();
        }
      }
      expect(p.climate.highC.length).toBe(12);
      for (let k = 0; k < 12; k++) expect(p.climate.highC[k]).toBeGreaterThan(p.climate.lowC[k]);
    }
  });

  it('follows the belts up the slopes: a mountain place\'s profile changes its plants on the way up', () => {
    const tall = ALL.filter((sc) => sc.macro.relief > 900 && sc.look.belts.length > 1);
    expect(tall.length).toBeGreaterThan(3);
    let changed = 0;
    for (const sc of tall) if (profileOfPlace(sc, 'test').bands.length > 1) changed++;
    expect(changed / tall.length).toBeGreaterThan(0.8);
  });

  it('colours the flowers by their pollinators and has them in bloom in the place\'s month, none under snow', () => {
    const RED = new Set(['猩红', '橙红', '玫红']);
    let tropical = 0;
    for (const sc of ALL) {
      const p = profileOfPlace(sc, 'test');
      const road = p.bands.find((b) => sc.macro.base >= b.fromM && sc.macro.base < b.toM)!;
      for (const f of road.flowers) {
        if (sc.look.sig.snow) expect(f.bloomMonths, sc.name).toEqual([]);
        else expect(f.bloomMonths, sc.name).toContain(sc.macro.month);
      }
      if (sc.macro.tSea > 21 && road.flowers.length && !road.flowers.some((f) => f.name === '油菜')) {
        tropical++;
        expect(road.flowers.some((f) => f.colors.some((c) => RED.has(c))), sc.name).toBe(true);
      }
    }
    expect(tropical).toBeGreaterThan(0);
  });

  it('colours the crowns by the leaves\' traits: autumn red in the continental cold, gold by a milder sea, grey in the dry country', () => {
    const autumn = ALL.filter((sc) => sc.look.sig.veg === 'autumn' && sc.look.efg.struct !== 'tundra');
    for (const sc of autumn) {
      const [r, g] = rgb(crownsOf(sc)[1]);
      expect(r, sc.name).toBeGreaterThan(g);
      if (sc.macro.cont > 0.55) expect(r - g, `${sc.name} red`).toBeGreaterThan(80);
      else expect(r - g, `${sc.name} gold`).toBeLessThan(60);
    }
    const dry = ALL.filter((sc) => sc.look.efg.cover > 0.1 && sc.macro.wet < 0.3 && sc.look.sig.veg !== 'autumn' && sc.look.sig.veg !== 'blossom' && !sc.look.sig.snow);
    const wet = ALL.filter((sc) => sc.look.efg.cover > 0.5 && sc.macro.wet > 0.7 && sc.look.sig.veg === 'deepgreen');
    if (dry.length && wet.length) {
      const mean = (xs: Scene[]) => xs.reduce((a, sc) => a + chroma(crownsOf(sc)[1]), 0) / xs.length;
      expect(mean(dry)).toBeLessThan(mean(wet));
    }
  });

  it('keeps every region\'s ground its own, its last trees low below the tree line, its roadside as its country has it', () => {
    const w = new World(7, { worldVersion: 4 });
    let krumm = 0;
    let rows = 0;
    for (let c = 1; c < 60; c++) {
      const def = BIOMES[w.spine.plan.biomeOf(c)];
      const sc = w.earth!.pieces[c].scene!.place;
      expect(groundProfile(def.id)?.id).toBe(def.id);
      const t = FLORA[def.id];
      if (t.eco.treeline) {
        const low = t.trees.find((r) => r.size && r.size[1] <= 0.7 && r.relief);
        if (low) krumm++;
      }
      if (sc.look.efg.struct === 'farmland' && t.trees.some((r) => r.road && r.hedge)) rows++;
    }
    expect(krumm + rows).toBeGreaterThan(0);
  });
});
