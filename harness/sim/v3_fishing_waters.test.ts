/**
 * The waters as an angler sees them (src/core/v3/fishing/waters.ts): every point of fishable water has a
 * class the fish table knows, one number for the whole of one water, a depth and a spot between 0 and 1;
 * the classes follow the country; good spots are few; a frozen tarn is fished through the ice.
 */
import { describe, expect, it } from 'vitest';
import { fishOf } from '../../src/core/v3/fishing/species';
import { MARGIN_DEPTH, WaterAt, waterAt } from '../../src/core/v3/fishing/waters';
import { WATERS_TODAY, type WaterClass } from '../../src/core/v3/fishing/types';
import { SpineSample } from '../../src/core/world/spine';
import { TerrainPoint, World } from '../../src/core/world/terrain';

/** walk the country beside the road and gather what the waters are */
function survey(world: World, km: number): WaterAt[] {
  const tp = new TerrainPoint();
  const p = new SpineSample();
  const out: WaterAt[] = [];
  for (let s = 600; s < km * 1000; s += 37) {
    world.spine.at(s, p);
    for (const d of [-260, -150, -80, -40, -20, 20, 40, 80, 150, 260]) {
      const w = new WaterAt();
      waterAt(world, p.x - Math.sin(p.phi) * d, p.z + Math.cos(p.phi) * d, tp, w);
      if (w.cls) out.push(w);
    }
  }
  return out;
}

describe('the waters', () => {
  it('every fishable point has a class the fish table knows, a depth past the margin, a spot between 0 and 1', () => {
    const all = [...survey(new World(7, { worldVersion: 2, startBiome: 'lakes', chapterScale: 3 }), 40), ...survey(new World(11, { worldVersion: 2, startBiome: 'forest', chapterScale: 3 }), 40)];
    expect(all.length).toBeGreaterThan(200);
    const classes = new Set<WaterClass>();
    for (const w of all) {
      expect(WATERS_TODAY).toContain(w.cls);
      expect(fishOf(w.cls!, w.ice).length + fishOf(w.cls!, false).length).toBeGreaterThan(0);
      expect(w.depth).toBeGreaterThan(MARGIN_DEPTH);
      expect(w.spot).toBeGreaterThanOrEqual(0);
      expect(w.spot).toBeLessThanOrEqual(1);
      classes.add(w.cls!);
    }
    expect(classes.has('pond') || classes.has('lake')).toBe(true);
    expect(classes.has('river')).toBe(true);
  });

  it('the classes follow the country: tarns in the mountains, marsh in the wetland, oases in dry country', () => {
    const by = (startBiome: string, seed: number): Set<WaterClass> => new Set(survey(new World(seed, { worldVersion: 2, startBiome, chapterScale: 6 }), 30).map((w) => w.cls!));
    expect(by('alpine', 3).has('tarn')).toBe(true);
    expect(by('alpine', 3).has('pond')).toBe(false);
    expect(by('wetland', 5).has('marsh')).toBe(true);
    const dry = [...by('desert', 2), ...by('desert', 9), ...by('red_canyon', 4)];
    expect(dry.every((c) => c === 'oasis' || c === 'river')).toBe(true);
  });

  it('one water has one number, two waters two; the same point gives the same answer for ever', () => {
    const world = new World(7, { worldVersion: 2, startBiome: 'lakes', chapterScale: 3 });
    const all = survey(world, 25);
    const ids = new Map<number, Set<WaterClass>>();
    for (const w of all) {
      if (!ids.has(w.id)) ids.set(w.id, new Set());
      ids.get(w.id)!.add(w.cls!);
    }
    expect(ids.size).toBeGreaterThan(3);
    for (const [, cls] of ids) expect(cls.size).toBe(1);
    const again = survey(new World(7, { worldVersion: 2, startBiome: 'lakes', chapterScale: 3 }), 25);
    expect(again.map((w) => [w.id, w.spot])).toEqual(all.map((w) => [w.id, w.spot]));
  });

  it('good spots are few: most water is ordinary, a tenth or less very good', () => {
    const all = [...survey(new World(21, { worldVersion: 2, startBiome: 'lakes', chapterScale: 3 }), 50), ...survey(new World(22, { worldVersion: 2, startBiome: 'maple', chapterScale: 3 }), 50)];
    const spots = all.map((w) => w.spot).sort((a, b) => a - b);
    const q = (f: number) => spots[Math.floor(f * (spots.length - 1))];
    console.log(`spots: ${spots.length} points, median ${q(0.5).toFixed(2)}, 90th ${q(0.9).toFixed(2)}, best ${q(1).toFixed(2)}; with weed ${all.filter((w) => w.weed > 0).length}, drop-off ${all.filter((w) => w.dropOff > 0.5).length}, bridge ${all.filter((w) => w.structure > 0).length}`);
    expect(q(0.5)).toBeGreaterThan(0.2);
    expect(q(0.5)).toBeLessThan(0.6);
    expect(spots.filter((s) => s > 0.85).length / spots.length).toBeLessThan(0.1);
    expect(spots.filter((s) => s > 0.85).length).toBeGreaterThan(0);
  });
});
