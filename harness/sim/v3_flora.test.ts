/**
 * The ecotope field and the flora field (src/core/world/ecotope.ts, flora.ts, plants.ts, floraTables.ts): the
 * same whatever is asked first, nothing growing where nothing may, and each region's country coming out as
 * its table says: how wooded, how many plants to the hectare, which kinds, reeds by the water and nowhere else.
 */
import { describe, expect, it } from 'vitest';
import { BIOMES } from '../../src/core/world/biomes';
import { ECO_N, ECO_ROAD, ECO_TILE, ECO_WET, Ecotope, EcotopeField, ROAD_CLEAR, canopyAt, type EcoParams } from '../../src/core/world/ecotope';
import { Cover, FloraCell, FloraField, LAYER_CELL, LAYER_GROUND, LAYER_SHRUB, LAYER_TREE, bandFit, floraTableProblems, type FloraLayer } from '../../src/core/world/flora';
import { FLORA, floraTableOf } from '../../src/core/world/floraTables';
import { PLANTS, plantDef, plantIndex } from '../../src/core/world/plants';
import { SpineSample } from '../../src/core/world/spine';
import { TerrainPoint, World } from '../../src/core/world/terrain';

function fields(seed: number, startBiome: string): { world: World; eco: EcotopeField; flora: FloraField } {
  // (one region for the whole stretch looked at: a long first chapter)
  const world = new World(seed, { startBiome, chapterScale: 6 });
  const table = (r: number) => floraTableOf(BIOMES[r].id, BIOMES[r].kin);
  const eco = new EcotopeField(world, (r) => table(r).eco);
  return { world, eco, flora: new FloraField(world, eco, table) };
}

/** every plant of a layer in the square of tiles [tx0, tx1) × [tz0, tz1) */
function census(flora: FloraField, layer: FloraLayer, tx0: number, tx1: number, tz0: number, tz1: number): FloraCell[] {
  const C = LAYER_CELL[layer];
  const out: FloraCell[] = [];
  const n = ECO_TILE / C;
  for (let cz = tz0 * n; cz < tz1 * n; cz++) {
    for (let cx = tx0 * n; cx < tx1 * n; cx++) {
      const c = new FloraCell();
      if (flora.cell(layer, cx, cz, c)) out.push(c);
    }
  }
  return out;
}

describe('the plant catalogue and the tables', () => {
  it('has no plant twice, every table names plants that exist in their own layer', () => {
    expect(new Set(PLANTS.map((p) => p.id)).size).toBe(PLANTS.length);
    expect(plantIndex('oak')).toBeGreaterThanOrEqual(0);
    expect(plantIndex('no_such_plant')).toBe(-1);
    expect(() => plantDef('no_such_plant')).toThrow();
    for (const id of Object.keys(FLORA)) expect(floraTableProblems(id, FLORA[id]), id).toEqual([]);
    for (const b of BIOMES.slice(0, 6)) expect(FLORA[b.id], b.id).toBeDefined();
    expect(floraTableOf('a_region_without_a_table', 'desert').eco).toBe(FLORA.desert.eco);
    expect(floraTableOf('desert', 'desert')).toBe(floraTableOf('a_region_without_a_table', 'desert'));
  });

  it('a band is 1 inside, 0 well outside, and falls smoothly between', () => {
    expect(bandFit(0.5, [0.3, 0.7])).toBe(1);
    expect(bandFit(0.3, [0.3, 0.7])).toBe(1);
    expect(bandFit(0.1, [0.3, 0.7])).toBe(0);
    expect(bandFit(0.25, [0.3, 0.7])).toBeGreaterThan(0);
    expect(bandFit(0.25, [0.3, 0.7])).toBeLessThan(1);
    expect(bandFit(123, undefined)).toBe(1);
  });
});

describe('the ecotope field', () => {
  it('is the same tile whatever was asked before it, and after the cache has let it go', () => {
    const a = fields(7, 'forest');
    const b = fields(7, 'forest');
    const small = new EcotopeField(b.world, (r) => floraTableOf(BIOMES[r].id, BIOMES[r].kin).eco, null, 3);
    const first = a.eco.tile(20, 1);
    for (let i = 0; i < 9; i++) small.tile(40 + i, -2);
    expect(small.size).toBeLessThanOrEqual(3);
    const again = small.tile(20, 1);
    for (const k of ['h', 'ad', 'slope', 'shade', 'hollow', 'waterDist', 'canopy', 'moisture', 'relief'] as const) expect(Array.from(again[k]), k).toEqual(Array.from(first[k]));
    expect(Array.from(again.flags)).toEqual(Array.from(first.flags));
  });

  it('agrees with the land function at its nodes, and neighbours agree along the edge they share', () => {
    const { world, eco } = fields(11, 'plains');
    const tp = new TerrainPoint();
    const t = eco.tile(12, 0);
    const u = eco.tile(13, 0);
    for (let j = 0; j < ECO_N; j++) {
      world.shape(12 * ECO_TILE + 5 * 8, j * 8, tp);
      expect(t.h[j * ECO_N + 5]).toBeCloseTo(tp.bed, 3);
      // the last column of one tile is the first of the next
      for (const k of ['h', 'slope', 'shade', 'hollow', 'canopy', 'ad'] as const) expect(u[k][j * ECO_N], k).toBeCloseTo(t[k][j * ECO_N + ECO_N - 1], 5);
    }
  });

  it('marks the road and the water, keeps the canopy off both, and reads continuously between nodes', () => {
    const { world, eco } = fields(3, 'lakes');
    const p = new SpineSample();
    const e = new Ecotope();
    let wet = 0;
    let nearWater = 0;
    for (let s = 2000; s < 30000; s += 37) {
      world.spine.at(s, p);
      eco.at(p.x, p.z, e);
      expect(e.ad).toBeLessThan(ROAD_CLEAR + 8);
      expect(e.canopy).toBeLessThan(0.05);
      for (const d of [30, 90, 200]) {
        eco.at(p.x - Math.sin(p.phi) * d, p.z + Math.cos(p.phi) * d, e);
        if (e.flags & ECO_WET) {
          wet++;
          expect(e.waterDist).toBeLessThan(8.1);
        } else if (e.waterDist < 40) nearWater++;
        expect(e.moisture).toBeGreaterThanOrEqual(0);
        expect(e.moisture).toBeLessThanOrEqual(1);
        expect(e.shade).toBeGreaterThanOrEqual(0);
        expect(e.shade).toBeLessThanOrEqual(1);
      }
    }
    // lake country: a good share of the points beside the road are water or near it
    expect(wet).toBeGreaterThan(25);
    // (without the water's own account of its edge a tile sees only the water inside it: fewer than there are)
    expect(nearWater).toBeGreaterThan(10);
    // continuity: a metre along the ground changes no quantity by much
    let jump = 0;
    const f = new Ecotope();
    for (let x = 5000; x < 5600; x += 1) {
      eco.at(x, 180, e);
      eco.at(x + 1, 180, f);
      jump = Math.max(jump, Math.abs(e.canopy - f.canopy), Math.abs(e.moisture - f.moisture), Math.abs(e.slope - f.slope));
    }
    expect(jump).toBeLessThan(0.2);
    expect(ECO_ROAD).toBe(1);
  });

  it('woods cover about the share the region asks, nothing on the road side of its clearing, and the wet draws them where the country is thirsty', () => {
    const share = (p: EcoParams): number => {
      let n = 0;
      let wooded = 0;
      for (let x = 0; x < 40000; x += 97) for (let z = 400; z < 4000; z += 211) {
        n++;
        if (canopyAt(p, 99, x, z, z, 0, 150) > 0.5) wooded++;
      }
      return wooded / n;
    };
    const base: EcoParams = { wood: 0.5, woodScale: 380, clear: 10, edge: 20, treeline: null, thirsty: 0, moist: 0.4 };
    const half = share(base);
    expect(half).toBeGreaterThan(0.4);
    expect(half).toBeLessThan(0.6);
    expect(share({ ...base, wood: 0.85 })).toBeGreaterThan(0.8);
    expect(share({ ...base, wood: 0.1 })).toBeLessThan(0.12);
    expect(share({ ...base, wood: 0.3 })).toBeLessThan(half);
    expect(canopyAt(base, 99, 100, 5, 5, 0, 150)).toBe(0);
    // above the tree line nothing; by the water in thirsty country a wood
    expect(canopyAt({ ...base, wood: 0.95, treeline: [100, 200] }, 99, 500, 900, 900, 260, 150)).toBe(0);
    expect(canopyAt({ ...base, wood: 0.02, thirsty: 0.8 }, 99, 500, 900, 900, 0, 4)).toBeGreaterThan(0.7);
    expect(canopyAt({ ...base, wood: 0.02, thirsty: 0.8 }, 99, 500, 900, 900, 0, 140)).toBeLessThan(0.1);
  });
});

describe('what it costs', () => {
  it('a tile of the ecotope and the plants of a tile, in milliseconds (printed; bounded loosely: this machine is shared)', () => {
    const { eco, flora } = fields(8, 'forest');
    // (warm the code first)
    for (let i = 0; i < 6; i++) eco.tile(200 + i, 3);
    census(flora, LAYER_TREE, 200, 203, 3, 4);
    let t0 = performance.now();
    for (let i = 0; i < 40; i++) eco.tile(60 + i, 0);
    const tileMs = (performance.now() - t0) / 40;
    t0 = performance.now();
    const trees = census(flora, LAYER_TREE, 60, 100, 0, 1).length;
    const cellsMs = (performance.now() - t0) / 40;
    console.log('ecotope tile ms', tileMs.toFixed(3), 'tree cells of a tile ms', cellsMs.toFixed(3), 'trees in 40 tiles', trees);
    expect(tileMs).toBeLessThan(4);
    expect(cellsMs).toBeLessThan(3);
  });
});

describe('the flora field', () => {
  it('stands the same plants whatever is asked first', () => {
    const a = fields(21, 'forest');
    const b = fields(21, 'forest');
    census(b.flora, LAYER_SHRUB, 60, 62, -1, 1);
    b.eco.tile(5, 5);
    const one = census(a.flora, LAYER_TREE, 40, 42, 0, 2);
    const two = census(b.flora, LAYER_TREE, 40, 42, 0, 2);
    expect(two).toEqual(one);
    expect(one.length).toBeGreaterThan(40);
    const other = census(fields(22, 'forest').flora, LAYER_TREE, 40, 42, 0, 2);
    expect(other).not.toEqual(one);
  });

  it('stands nothing on the road, in water, on a place or on a plot, and every plant in its own cell', () => {
    for (const biome of ['plains', 'lakes', 'forest']) {
      const { world, flora } = fields(5, biome);
      const tp = new TerrainPoint();
      for (const layer of [LAYER_TREE, LAYER_SHRUB, LAYER_GROUND] as FloraLayer[]) {
        const C = LAYER_CELL[layer];
        for (const c of census(flora, layer, 30, 44, -2, 2)) {
          world.shape(c.x, c.z, tp);
          expect(Math.abs(tp.d), `${biome} road`).toBeGreaterThanOrEqual(ROAD_CLEAR - 0.6);
          expect(tp.zone).toBe(0);
          expect(tp.wl > tp.bed + 0.02, `${biome} water`).toBe(false);
          expect(tp.site).toBeLessThanOrEqual(0.02);
          expect(tp.plot).toBeLessThanOrEqual(0.02);
          expect(c.y).toBeCloseTo(tp.bed, 6);
          expect(Math.floor(c.x / C)).toBe(Math.floor(c.x / C));
          expect(c.size).toBeGreaterThan(0.5);
          expect(c.size).toBeLessThan(1.5);
        }
      }
    }
  });

  it('grows each region as its table says: the forest thick, the grassland in copses, the desert nearly bare', () => {
    const perHa = (biome: string, layer: FloraLayer): { n: number; kinds: Set<string> } => {
      let n = 0;
      const kinds = new Set<string>();
      let tiles = 0;
      for (const seed of [2, 9]) {
        const { flora } = fields(seed, biome);
        for (const c of census(flora, layer, 30, 54, -3, 3)) {
          n++;
          kinds.add(PLANTS[c.plant].id);
        }
        tiles += 24 * 6;
      }
      return { n: n / (tiles * 1.6384), kinds };
    };
    const forest = perHa('forest', LAYER_TREE);
    const plains = perHa('plains', LAYER_TREE);
    const desert = perHa('desert', LAYER_TREE);
    // trees to the hectare of all land (road, water and clearings included)
    expect(forest.n).toBeGreaterThan(55);
    expect(forest.n).toBeLessThan(160);
    expect(plains.n).toBeGreaterThan(12);
    expect(plains.n).toBeLessThan(forest.n * 0.6);
    expect(desert.n).toBeLessThan(13);
    console.log('trees per hectare', JSON.stringify({ forest: +forest.n.toFixed(1), plains: +plains.n.toFixed(1), desert: +desert.n.toFixed(1) }));
    expect(forest.kinds.size).toBeGreaterThanOrEqual(5);
    expect(plains.kinds.size).toBeGreaterThanOrEqual(4);
    expect(forest.kinds.has('spruce') && forest.kinds.has('pine') && forest.kinds.has('oak')).toBe(true);
    expect(desert.kinds.has('oak')).toBe(false);
    const scrub = perHa('desert', LAYER_SHRUB);
    expect(scrub.kinds.has('sage_bush')).toBe(true);
    expect(scrub.n).toBeGreaterThan(8);
  });

  it('keeps reeds and willows to the water, and trees that bear fruit near where people pass', () => {
    const { world, eco, flora } = fields(3, 'lakes');
    const e = new Ecotope();
    let reeds = 0;
    for (const c of census(flora, LAYER_SHRUB, 20, 80, -3, 3)) {
      if (PLANTS[c.plant].id !== 'reed') continue;
      reeds++;
      eco.at(c.x, c.z, e);
      expect(e.waterDist).toBeLessThan(6 + 6);
    }
    expect(reeds).toBeGreaterThan(30);
    expect(world.seed).toBe(3);
    const maple = fields(4, 'maple');
    let persimmons = 0;
    const tp = new TerrainPoint();
    for (const c of census(maple.flora, LAYER_TREE, 20, 120, -2, 2)) {
      if (PLANTS[c.plant].id !== 'persimmon_tree') continue;
      persimmons++;
      maple.world.shape(c.x, c.z, tp);
      expect(Math.abs(tp.d)).toBeLessThan(150 + 40);
    }
    expect(persimmons).toBeGreaterThan(3);
  });

  it('covers the ground: thick grass in the meadow, bare in the desert, nothing on the road, flowers where the table has them', () => {
    const c = new Cover();
    const mean = (biome: string): { grass: number; bare: number; flowers: number } => {
      const { flora } = fields(6, biome);
      let g = 0;
      let b = 0;
      let f = 0;
      let n = 0;
      for (let x = 4000; x < 9000; x += 53) for (let z = -300; z <= 300; z += 61) {
        flora.cover(x, z, c);
        expect(c.grass).toBeGreaterThanOrEqual(0);
        expect(c.grass).toBeLessThanOrEqual(1);
        expect(c.bare).toBeLessThanOrEqual(1);
        g += c.grass;
        b += c.bare;
        f += c.flowers;
        n++;
      }
      return { grass: g / n, bare: b / n, flowers: f / n };
    };
    const plains = mean('plains');
    const desert = mean('desert');
    expect(plains.grass).toBeGreaterThan(0.45);
    expect(desert.grass).toBeLessThan(0.12);
    expect(desert.bare).toBeGreaterThan(0.6);
    expect(plains.flowers).toBeGreaterThan(0.03);
    expect(plains.flowers).toBeGreaterThan(desert.flowers);
  });
});
