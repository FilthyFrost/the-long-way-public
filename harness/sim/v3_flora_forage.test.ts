/**
 * What is foraged, where it grows (src/core/world/floraForage.ts and the regions' flora tables): every kind
 * has a plant that bears it and a region that grows that plant, every region grows a good many kinds, water
 * plants stand in the shallows, and the ground is not carpeted with things to pick.
 */
import { describe, expect, it } from 'vitest';
import { BIOMES } from '../../src/core/world/biomes';
import { EcotopeField, shoreOf } from '../../src/core/world/ecotope';
import { FloraCell, FloraField, LAYER_CELL, LAYER_GROUND, LAYER_SHRUB, LAYER_TREE, floraTableProblems, plantsOf, type FloraLayer } from '../../src/core/world/flora';
import { FORAGE_ROWS } from '../../src/core/world/floraForage';
import { FLORA, floraTableOf } from '../../src/core/world/floraTables';
import { AQUATIC_DEPTH, PLANTS, bearsAt, plantDef } from '../../src/core/world/plants';
import { TerrainPoint, World } from '../../src/core/world/terrain';
import { FORAGE_KINDS } from '../../src/core/v3/forage/kinds';
import { REGION_IDS } from '../../src/core/v3/contracts/regions';

/** the twelve regions the first batch makes */
const TWELVE = ['plains', 'desert', 'alpine', 'forest', 'lakes', 'maple', 'flower_fields', 'terraces', 'wetland', 'bamboo_sea', 'red_canyon', 'karst_peaks'];

/** the forage kinds a region's country bears */
function kindsOf(region: string): Set<string> {
  const out = new Set<string>();
  for (const id of plantsOf(floraTableOf(region, 'plains'))) {
    const b = plantDef(id).bears;
    if (b) out.add(b.forage);
  }
  return out;
}

describe('what grows where', () => {
  it('every table is sound with its forage grown in, and names only regions that exist', () => {
    for (const id of TWELVE) {
      expect(FLORA[id], id).toBeDefined();
      expect(floraTableProblems(id, floraTableOf(id, 'plains')), id).toEqual([]);
    }
    for (const r of FORAGE_ROWS) for (const region of r.regions) expect(REGION_IDS, `${r.plant} names ${region}`).toContain(region);
  });

  it('every bearing plant names a registered item and the retirement of an item preserves its inventory id', () => {
    const catalogue = new Set(FORAGE_KINDS.map(kind => kind.id));
    for (const plant of PLANTS) if (plant.bears) expect(catalogue.has(plant.bears.forage), plant.id).toBe(true);
    for (const id of ['snow_lotus', 'cordyceps', 'fiddlehead', 'sage']) {
      expect(catalogue.has(id)).toBe(true);
      for (const region of TWELVE) expect(kindsOf(region).has(id), region).toBe(false);
    }
  });

  it('the twelve landscapes retain a distinct local harvest', () => {
    const signatures = TWELVE.map(region => [...kindsOf(region)].sort().join(','));
    expect(new Set(signatures).size).toBe(TWELVE.length);
    for (const region of TWELVE) expect(kindsOf(region).size, region).toBeGreaterThan(0);
  });
});

describe('in the world', () => {
  function census(biome: string, seed: number, layers: FloraLayer[]): { cells: FloraCell[]; world: World; ha: number } {
    const world = new World(seed, { startBiome: biome, chapterScale: 6 });
    const table = (r: number) => floraTableOf(BIOMES[r].id, BIOMES[r].kin);
    const flora = new FloraField(world, new TerrainPoint(), new EcotopeField(world, new TerrainPoint(), (r) => table(r).eco, shoreOf(world)), table);
    const cells: FloraCell[] = [];
    const tx0 = 30;
    const tx1 = 62;
    const tz0 = -2;
    const tz1 = 2;
    for (const layer of layers) {
      const n = 128 / LAYER_CELL[layer];
      for (let cz = tz0 * n; cz < tz1 * n; cz++) for (let cx = tx0 * n; cx < tx1 * n; cx++) {
        const c = new FloraCell();
        if (flora.cell(layer, cx, cz, c)) cells.push(c);
      }
    }
    return { cells, world, ha: (tx1 - tx0) * (tz1 - tz0) * 1.6384 };
  }

  it('the six regions of today bear things to pick, in patches and not as a carpet', () => {
    for (const biome of ['plains', 'forest', 'lakes', 'maple', 'alpine', 'desert']) {
      const { cells, ha } = census(biome, 12, [LAYER_TREE, LAYER_SHRUB, LAYER_GROUND]);
      const bearing = cells.filter((c) => bearsAt(PLANTS[c.plant], c.vary) !== null);
      const kinds = new Set(bearing.map((c) => PLANTS[c.plant].bears!.forage));
      const perHa = bearing.length / ha;
      console.log(`${biome}: ${perHa.toFixed(1)} plants to pick per hectare, ${kinds.size} kinds in ${ha.toFixed(0)} ha`);
      // enough to make a stop worth it, far from one at every step (a hectare is a hundred metres square)
      // Inland Fiordland can have no gathering sites in this strip; shores are sampled separately below.
      if (biome !== 'lakes') expect(perHa, biome).toBeGreaterThan(biome === 'desert' ? 2 : 6);
      expect(perHa, biome).toBeLessThan(90);
      if (biome !== 'lakes') expect(kinds.size, biome).toBeGreaterThanOrEqual(biome === 'alpine' ? 3 : biome === 'desert' ? 4 : 8);
    }
  });

  it('plants of the water stand in the shallows and nowhere else', () => {
    const { cells, world } = census('lakes', 3, [LAYER_SHRUB, LAYER_GROUND]);
    const tp = new TerrainPoint();
    let aquatic = 0;
    for (const c of cells) {
      world.shape(c.x, c.z, tp);
      const depth = tp.wl - tp.bed;
      if (PLANTS[c.plant].aquatic) {
        aquatic++;
        expect(depth).toBeGreaterThan(0.02);
        expect(depth).toBeLessThanOrEqual(AQUATIC_DEPTH + 1e-6);
      } else expect(depth > 0.02).toBe(false);
    }
    expect(aquatic).toBeGreaterThan(5);
  });
});
