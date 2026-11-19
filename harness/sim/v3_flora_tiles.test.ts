/**
 * The plants by the tile (src/core/world/flora.ts FloraField.tile) and the quick ways the cell's decision
 * takes (rules made into numbers, the open squares of the ecotope's grid, the dice against the most a table
 * can come to): a tile is its cells, kept in a bounded cache; and the decision is the plain one — the ecotope
 * read at the plant's place, every rule asked how well it fits, the land asked what the ground is — to the
 * bit, with none of the quick ways.
 */
import { describe, expect, it } from 'vitest';
import { fbm2 } from '../../src/core/math/noise';
import { hash2 } from '../../src/core/math/rng';
import { BIOMES } from '../../src/core/world/biomes';
import { ECO_SQ, ECO_TILE, Ecotope, OPEN_WATER, ROAD_CLEAR, type EcotopeField } from '../../src/core/world/ecotope';
import { FloraCell, FloraField, LAYER_CELL, LAYER_GROUND, LAYER_SHRUB, LAYER_TREE, hedgeAt, onBench, ruleFit, type FloraLayer, type FloraTable } from '../../src/core/world/flora';
import { floraTableOf } from '../../src/core/world/floraTables';
import { LandParams } from '../../src/core/world/landform';
import { AQUATIC_DEPTH, PLANTS, plantDef, plantIndex } from '../../src/core/world/plants';
import { SpineSample } from '../../src/core/world/spine';
import { TerrainPoint, World } from '../../src/core/world/terrain';

const LAYERS: FloraLayer[] = [LAYER_TREE, LAYER_SHRUB, LAYER_GROUND];
const tableAt = (r: number): FloraTable => floraTableOf(BIOMES[r].id, BIOMES[r].kin);
const tp = new TerrainPoint();
const eAt = new Ecotope();

function worldOf(seed: number, startBiome: string, chapterScale = 6): World {
  return new World(seed, { worldVersion: 2, startBiome, chapterScale });
}

/**
 * A cell decided the plain way (what flora.ts's own decision must come to): its place from its hash, the
 * ecotope read there through `at`, the land asked what the ground is, every rule that may stand on such
 * ground asked through `ruleFit`, its grove's noise, the dice. (The hashes' salts are flora.ts's.)
 */
function plainCell(world: World, eco: EcotopeField, layer: FloraLayer, cx: number, cz: number, out: FloraCell): boolean {
  const C = LAYER_CELL[layer];
  const salt = world.seed + [0x7ee5, 0x7ee6, 0x7ee7][layer];
  const h = hash2(cx, cz, salt);
  const x = (cx + 0.12 + 0.76 * ((h & 0xff) / 255)) * C;
  const z = (cz + 0.12 + 0.76 * (((h >>> 8) & 0xff) / 255)) * C;
  const e = eco.at(x, z, eAt);
  if (e.ad < ROAD_CLEAR) return false;
  const h2 = hash2(cz, cx, salt + 0x100);
  const region = e.rt > 0 && ((h2 >>> 20) & 0xfff) / 4096 < e.rt ? e.rb : e.ra;
  const t = tableAt(region);
  const rules = [t.trees, t.shrubs, t.ground][layer];
  world.shape(x, z, tp);
  if (tp.zone !== 0 || tp.site > 0.02 || tp.plot > 0.02) return false;
  const depth = tp.wl - tp.bed;
  if (depth > AQUATIC_DEPTH) return false;
  const shallow = depth > 0.02;
  const dice = ((h >>> 16) & 0xffff) / 65536;
  let acc = 0;
  let pick = -1;
  for (let i = 0; i < rules.length; i++) {
    const r = rules[i];
    if (!!plantDef(r.plant).aquatic !== shallow) continue;
    let p = ((r.perHa * C * C) / 10000) * ruleFit(r, e);
    if (p <= 0) continue;
    if (r.grove) {
      const g = fbm2(x / r.grove, z / r.grove, world.seed + 0x6a0 + plantIndex(r.plant) * 17, 2);
      const s = 0.5 + 1.6 * g;
      p *= 2 * (s <= 0 ? 0 : s >= 1 ? 1 : s * s * (3 - 2 * s));
    }
    if (r.hedge) p *= hedgeAt(x, z, r.hedge, world.seed);
    acc += p;
    if (dice < acc) {
      pick = i;
      break;
    }
  }
  if (pick < 0) return false;
  const r = rules[pick];
  if (r.bench && !onBench(tp.bed, e.step)) return false;
  out.plant = plantIndex(r.plant);
  out.rule = pick;
  out.region = region;
  out.x = x;
  out.z = z;
  out.y = tp.bed;
  out.size = (r.size ? r.size[0] : 0.75) + ((r.size ? r.size[1] : 1.2) - (r.size ? r.size[0] : 0.75)) * ((h2 & 0xff) / 255);
  out.yaw = (((h2 >>> 8) & 0xfff) / 4096) * 6.283185307179586;
  out.vary = ((h >>> 4) & 0xfff) / 4096;
  return true;
}

describe('the cell\'s decision', () => {
  it('is the plain one to the bit: in the woods, by lakes and rivers, round the places by the road, and where two regions meet', () => {
    const got = new FloraCell();
    const want = new FloraCell();
    let cells = 0;
    let plants = 0;
    let inWater = 0;
    let mixed = 0;
    let benches = 0;
    let towers = 0;
    const spots: [World, number, number, number, number][] = [
      [worldOf(8, 'forest'), 40, 44, -1, 2],
      [worldOf(3, 'lakes'), 20, 34, -3, 3],
      [worldOf(7, 'wetland'), 12, 24, -3, 3],
      // (towers: a stretch of karst country with a cluster beside the road)
      [worldOf(21, 'karst_peaks'), 52, 60, -19, -13],
      // (the road itself and whatever stands by it: the tiles the road runs through)
      [worldOf(11, 'plains'), 8, 44, -1, 1],
    ];
    // terraced hillsides: a stretch of the terraces that is cut into benches, the tiles beside the road there
    const farms = worldOf(6, 'terraces');
    const lp = new LandParams();
    const at = new SpineSample();
    let k = 3;
    while (farms.land.at((k + 0.5) * 1250, lp).terrace < 1) k++;
    farms.spine.at((k + 0.5) * 1250, at);
    spots.push([farms, Math.floor(at.x / ECO_TILE) - 3, Math.floor(at.x / ECO_TILE) + 3, Math.floor(at.z / ECO_TILE) - 3, Math.floor(at.z / ECO_TILE) + 3]);
    // a journey as it is dealt: the tiles across the first border between two regions
    const journey = new World(5, { worldVersion: 2 });
    const border = Math.floor(journey.spine.plan.starts[1] / ECO_TILE);
    spots.push([journey, border - 4, border + 4, -2, 2]);
    for (const [w, tx0, tx1, tz0, tz1] of spots) {
      const flora = w.flora!;
      for (const layer of LAYERS) {
        const n = ECO_TILE / LAYER_CELL[layer];
        for (let cz = tz0 * n; cz < tz1 * n; cz++) {
          for (let cx = tx0 * n; cx < tx1 * n; cx++) {
            cells++;
            const a = flora.cell(layer, cx, cz, got);
            const b = plainCell(w, w.eco!, layer, cx, cz, want);
            if (a !== b) throw new Error(`cell ${cx}, ${cz} of layer ${layer}: ${a ? 'a plant' : 'none'}, plainly ${b ? PLANTS[want.plant].id : 'none'}`);
            if (!a) continue;
            plants++;
            if (PLANTS[got.plant].aquatic) inWater++;
            if (got.region !== w.eco!.at(got.x, got.z, eAt).ra) mixed++;
            const rule = [tableAt(got.region).trees, tableAt(got.region).shrubs, tableAt(got.region).ground][layer][got.rule];
            if (rule.bench) benches++;
            if (rule.landform) towers++;
            if (got.plant !== want.plant || got.x !== want.x || got.z !== want.z || got.y !== want.y || got.size !== want.size || got.yaw !== want.yaw || got.vary !== want.vary || got.rule !== want.rule || got.region !== want.region) {
              throw new Error(`cell ${cx}, ${cz} of layer ${layer}: ${JSON.stringify(got)}, plainly ${JSON.stringify(want)}`);
            }
          }
        }
      }
    }
    expect(cells).toBeGreaterThan(200000);
    expect(plants).toBeGreaterThan(14000);
    // (what the quick ways must not lose: the plants of the shallows, the cells a border gives to the other
    // region, the plants of the benches and of the towers)
    expect(inWater).toBeGreaterThan(100);
    expect(mixed).toBeGreaterThan(100);
    expect(benches).toBeGreaterThan(100);
    expect(towers).toBeGreaterThan(100);
  });

  it('an open square of the ecotope\'s grid is dry land that is nobody\'s, wherever one stands in it', () => {
    let open = 0;
    let squares = 0;
    let bad = 0;
    for (const [seed, biome] of [[11, 'plains'], [3, 'lakes'], [7, 'wetland'], [21, 'karst_peaks']] as const) {
      const w = worldOf(seed, biome, 2);
      const eco = w.eco!;
      // (the tiles along the road, where the road, the places and most of the water are)
      for (let tx = 8; tx < 56; tx++) {
        for (let tz = -2; tz < 2; tz++) {
          const t = eco.tile(tx, tz);
          for (let j = 0; j < ECO_SQ; j++) {
            for (let i = 0; i < ECO_SQ; i++) {
              squares++;
              if (!t.open[j * ECO_SQ + i]) continue;
              open++;
              // three points of the square, its rim among them
              for (let k = 0; k < 3; k++) {
                const h = hash2(tx * 16 + i, tz * 16 + j, seed + k);
                const x = (tx * 16 + i + (h & 0xff) / 255) * 8;
                const z = (tz * 16 + j + ((h >>> 8) & 0xff) / 255) * 8;
                w.shape(x, z, tp);
                if (tp.zone !== 0 || tp.site > 0.02 || tp.plot > 0.02 || tp.wl > tp.bed + 0.02 || Math.abs(tp.d) < ROAD_CLEAR - 0.5) bad++;
              }
            }
          }
        }
      }
    }
    expect(bad).toBe(0);
    // most of the land is open: only there does a cell go without asking the land what its ground is
    expect(open / squares).toBeGreaterThan(0.6);
    expect(open / squares).toBeLessThan(0.97);
    expect(OPEN_WATER).toBeGreaterThan(Math.SQRT2 * 4);
  });
});

describe('the plants by the tile', () => {
  it('a tile is its cells, in their order, with the rows marked', () => {
    const c = new FloraCell();
    let plants = 0;
    for (const [seed, biome] of [[8, 'forest'], [3, 'lakes'], [9, 'alpine']] as const) {
      const w = worldOf(seed, biome);
      const flora = w.flora!;
      for (const layer of LAYERS) {
        const C = LAYER_CELL[layer];
        const per = ECO_TILE / C;
        for (const [tx, tz] of [[30, 0], [31, -1], [44, 2], [45, -3]]) {
          const t = flora.tile(layer, tx, tz);
          expect([t.layer, t.tx, t.tz]).toEqual([layer, tx, tz]);
          let n = 0;
          for (let j = 0; j < per; j++) {
            expect(t.row[j]).toBe(n);
            for (let i = 0; i < per; i++) {
              if (!flora.cell(layer, tx * per + i, tz * per + j, c)) continue;
              expect(t.plant[n]).toBe(c.plant);
              expect(t.x[n]).toBe(c.x);
              expect(t.z[n]).toBe(c.z);
              expect(t.y[n]).toBe(Math.fround(c.y));
              expect(t.size[n]).toBe(Math.fround(c.size));
              expect(t.yaw[n]).toBe(Math.fround(c.yaw));
              // (a plant's own number is a count of 4,096ths: the same number in the tile as in the cell, so it bears the same)
              expect(t.vary[n]).toBe(c.vary);
              expect(t.rule[n]).toBe(c.rule);
              expect(t.region[n]).toBe(c.region);
              // every plant inside its own cell
              expect(Math.floor(t.x[n] / C)).toBe(tx * per + i);
              expect(Math.floor(t.z[n] / C)).toBe(tz * per + j);
              n++;
            }
          }
          expect(t.row[per]).toBe(n);
          expect(t.n).toBe(n);
          for (const k of ['plant', 'x', 'z', 'y', 'size', 'yaw', 'vary', 'rule', 'region'] as const) expect(t[k].length).toBe(n);
          plants += n;
        }
      }
    }
    expect(plants).toBeGreaterThan(3000);
  });

  it('keeps no more tiles than it may, hands out the tile it has, and makes a dropped tile again the same', () => {
    const w = worldOf(8, 'forest');
    const flora = new FloraField(w, new TerrainPoint(), w.eco!, tableAt, 5);
    const first = flora.tile(LAYER_TREE, 30, 0);
    expect(flora.tile(LAYER_TREE, 30, 0)).toBe(first);
    expect(flora.size).toBe(1);
    // (the three layers of one tile are three tiles)
    flora.tile(LAYER_SHRUB, 30, 0);
    flora.tile(LAYER_GROUND, 30, 0);
    expect(flora.size).toBe(3);
    for (let i = 0; i < 12; i++) flora.tile(LAYER_TREE, 60 + i, 1);
    expect(flora.size).toBe(5);
    const again = flora.tile(LAYER_TREE, 30, 0);
    expect(again).not.toBe(first);
    expect(again.n).toBe(first.n);
    expect(again.n).toBeGreaterThan(50);
    for (const k of ['plant', 'x', 'z', 'y', 'size', 'yaw', 'vary', 'rule', 'region', 'row'] as const) expect(Array.from(again[k]), k).toEqual(Array.from(first[k]));
    // the one asked last stays, the one asked longest ago goes
    flora.capacity = 2;
    flora.tile(LAYER_TREE, 100, 0);
    flora.tile(LAYER_TREE, 101, 0);
    expect(flora.size).toBeLessThanOrEqual(5);
    expect(flora.tile(LAYER_TREE, 101, 0)).toBe(flora.tile(LAYER_TREE, 101, 0));
  });

  it('what a tile costs, layer by layer, in a forest and in a meadow (printed; bounded loosely: this machine is shared)', () => {
    for (const biome of ['forest', 'plains']) {
      const best = [Infinity, Infinity, Infinity, Infinity];
      const plants = [0, 0, 0];
      for (let round = 0; round < 3; round++) {
        const w = worldOf(8, biome);
        const flora = w.flora!;
        w.eco!.capacity = 1000;
        flora.capacity = 1000;
        const T = 30;
        let t0 = performance.now();
        for (let i = 0; i < T; i++) w.eco!.tile(40 + i, 1);
        best[3] = Math.min(best[3], (performance.now() - t0) / T);
        for (const layer of LAYERS) {
          t0 = performance.now();
          let n = 0;
          for (let i = 0; i < T; i++) n += flora.tile(layer, 40 + i, 1).n;
          best[layer] = Math.min(best[layer], (performance.now() - t0) / T);
          plants[layer] = n / T;
        }
      }
      console.log(`${biome}: a tile of the ecotope ${best[3].toFixed(3)} ms; its trees ${best[0].toFixed(3)} ms (${plants[0].toFixed(0)}), shrubs ${best[1].toFixed(3)} ms (${plants[1].toFixed(0)}), ground plants ${best[2].toFixed(3)} ms (${plants[2].toFixed(0)})`);
      expect(best[3]).toBeLessThan(4);
      for (const layer of LAYERS) expect(best[layer]).toBeLessThan(3);
    }
  });
});
