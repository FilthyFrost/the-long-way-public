/**
 * What each kind of country must get right in its own way (src/core/world/floraTables.ts over ecotope.ts and
 * flora.ts, on worlds of version 2): no tree above the tree line; reeds and willows by fresh water and nowhere
 * else, and a coast road's view kept; plants of the water in the shallows only; tea on level ground and on
 * the benches of the terraced hillsides; flowers in rows on level ground, crops in rows on the benches;
 * bamboo in groves; a tower's gentler ground hung with scrub and its steep sides bare; and nothing anywhere
 * on the road's corridor, in deep water, on a place's ground or on a plot.
 *
 * (How much grows in each region, in bands, is harness/sim/v3_flora_regions.test.ts.)
 */
import { describe, expect, it } from 'vitest';
import { BIOMES, BIOME_INDEX } from '../../src/core/world/biomes';
import { ECO_N, ECO_PLOT, ECO_SQ, ECO_TILE, ECO_WET, Ecotope, ROAD_CLEAR, WOOD_SHEER, shoreOf, treeLine } from '../../src/core/world/ecotope';
import { Cover, LAYER_CELL, LAYER_GROUND, LAYER_SHRUB, LAYER_TREE, onBench, type FloraLayer, type FloraRule, type FloraTable } from '../../src/core/world/flora';
import { FLORA, floraTableOf } from '../../src/core/world/floraTables';
import { Surface } from '../../src/core/world/ground';
import { LandParams } from '../../src/core/world/landform';
import { AQUATIC_DEPTH, PLANTS } from '../../src/core/world/plants';
import { SpineSample } from '../../src/core/world/spine';
import { TerrainPoint, World, type Plot } from '../../src/core/world/terrain';

const LAYERS: FloraLayer[] = [LAYER_TREE, LAYER_SHRUB, LAYER_GROUND];
/** a node of the ecotope's grid stands for this much land (ha) */
const NODE_HA = 0.0064;
const e = new Ecotope();
const sp = new SpineSample();
const tp = new TerrainPoint();
const tq = new TerrainPoint();

const tableAt = (r: number): FloraTable => floraTableOf(BIOMES[r].id, BIOMES[r].kin);
const ruleOf = (region: number, layer: FloraLayer, rule: number): FloraRule => [tableAt(region).trees, tableAt(region).shrubs, tableAt(region).ground][layer][rule];

/** a world that begins in a region and stays in it for 45 km and more */
function startIn(region: string, seed: number): World {
  return new World(seed, { worldVersion: 2, startBiome: region, chapterScale: 6 });
}

/** call f for the tiles beside the road between two arc lengths: every `skip`-th column of tiles, `half` tiles either side of the road's own */
function tilesAlong(w: World, s0: number, s1: number, skip: number, half: number, f: (tx: number, tz: number) => void): void {
  w.spine.at(s0, sp);
  const txA = Math.ceil(sp.x / ECO_TILE);
  w.spine.at(s1, sp);
  const txB = Math.floor(sp.x / ECO_TILE);
  for (let tx = txA; tx < txB; tx += skip) {
    w.spine.at(w.spine.sAtX((tx + 0.5) * ECO_TILE), sp);
    const tzc = Math.floor(sp.z / ECO_TILE);
    for (let tz = tzc - half; tz <= tzc + half; tz++) f(tx, tz);
  }
}

/** the first chapter of a world, less its ends */
function firstChapter(w: World, skip: number, half: number, f: (tx: number, tz: number) => void): void {
  tilesAlong(w, 2500, w.spine.plan.starts[1] - 1500, skip, half, f);
}

/** the rise over run of the land itself at a point, over `h` m either side */
function slopeAt(w: World, x: number, z: number, h: number): number {
  w.shape(x + h, z, tq);
  const a = tq.bed;
  w.shape(x - h, z, tq);
  const b = tq.bed;
  w.shape(x, z + h, tq);
  const c = tq.bed;
  w.shape(x, z - h, tq);
  return Math.hypot((a - b) / (2 * h), (c - tq.bed) / (2 * h));
}

/** the twelve regions of the first batch */
const TWELVE = Object.keys(FLORA);

describe('what each kind of country must get right', () => {
  it('snow-country woods contain hardy evergreens, and every region ends its trees at its own absolute tree line', () => {
    const world = startIn('alpine', 9);
    const ground = new TerrainPoint();
    ground.d = 160;
    for (const [ri, region] of BIOMES.entries()) {
      if (region.ground === Surface.Snow) {
        for (const rule of tableAt(ri).trees) expect(PLANTS.find(p => p.id === rule.plant)?.evergreen).toBe(true);
      }
      if (!region.relief) continue;
      ground.ba = ground.bb = ri;
      ground.bed = region.relief.trees - world.spine.altitude(0);
      expect(world.vistas.treeScale(ground, 65535), region.id).toBe(0);
      ground.bed -= 40;
      expect(world.vistas.treeScale(ground, 65535), region.id).toBeLessThan(0.5);
      ground.bed -= 150;
      expect(world.vistas.treeScale(ground, 65535), region.id).toBe(1);
    }
  });

  it('keeps sheltered woodland and thins the foreground only where the land has a view', () => {
    const w = startIn('alpine', 9);
    let oneSide = 0;
    let sheltered = 0;
    for (let s = 3000; s <= 18000; s += 80) {
      const left = w.vistas.clearing(s, -24);
      const right = w.vistas.clearing(s, 24);
      if (Math.max(left, right) > 0.85 && Math.min(left, right) < 0.15) oneSide++;
      if (left < 0.05 && right < 0.05) sheltered++;
      expect(w.vistas.clearing(s, 120)).toBe(0);
    }
    expect(oneSide).toBeGreaterThan(2);
    expect(sheltered).toBeGreaterThan(2);
  });

  it('the tree line: in the high country and above the terraces no tree of the land stands above the line, and they thin towards it', () => {
    for (const [region, seed] of [['alpine', 9], ['terraces', 9]] as const) {
      const w = startIn(region, seed);
      const [from, to] = FLORA[region].eco.treeline!;
      // (since stage L1 a region of version 2 with a tree line of its own in metres above the sea has the table's
      // band end there — ecotope.ts treeLine —, its width as the table has it: what is measured is the height
      // over the band's end at each point, in relief or above the sea alike)
      const ri = BIOME_INDEX[region];
      const over = (relief: number, h: number): number => {
        const top = treeLine(w, ri, relief, w.spine.altitude(h));
        return relief - (top === top ? top : to);
      };
      // land (ha) and trees below the line's beginning, in its lower and its upper half, and above its end; the country well back from the road
      const land = [0, 0, 0, 0];
      const trees = [0, 0, 0, 0];
      let highest = -Infinity;
      const width = to - from;
      const zone = (o: number): number => (o < -width ? 0 : o <= -width / 2 ? 1 : o <= 0 ? 2 : 3);
      // (the terraces' line, 160 to 260 m of relief, stood within the far field's 300 m hills of the first
      // version 2 within a kilometre and a half of the road; since stage L1 terraced country's hills rise slowly
      // to 200 m over a kilometre and more and pass the line's end only at their tops: two kilometres either
      // side, and some hectares of tops — 9 measured — above it)
      // (and the high country's line, since stage L1 at 1,700 m above the sea, stands on its walls a kilometre and
      // more out: three kilometres either side)
      firstChapter(w, 20, region === 'terraces' ? 16 : 24, (tx, tz) => {
        const et = w.eco!.tile(tx, tz);
        for (let j = 0; j < ECO_SQ; j++) for (let i = 0; i < ECO_SQ; i++) if (!(et.flags[j * ECO_N + i] & ECO_WET)) land[zone(over(et.relief[j * ECO_N + i], et.h[j * ECO_N + i]))] += NODE_HA;
        const ft = w.flora!.tile(LAYER_TREE, tx, tz);
        for (let k = 0; k < ft.n; k++) {
          // (the trees of the land: a willow by a river stands at the water, and where a river has cut
          // through high ground the relief there is still the height it cut away)
          if (ruleOf(ft.region[k], LAYER_TREE, ft.rule[k]).water) continue;
          const at = w.eco!.at(ft.x[k], ft.z[k], e);
          const o = over(at.relief, at.h);
          trees[zone(o)]++;
          if (o > highest) highest = o;
        }
      });
      // there is land above the line to be bare: the test looks high enough
      expect(land[3], region).toBeGreaterThan(region === 'terraces' ? 5 : 20);
      expect(land[1], region).toBeGreaterThan(10);
      expect(land[2], region).toBeGreaterThan(10);
      // (a tree may stand between a node below the line's end and one above it: a square's rise, no more)
      expect(highest, region).toBeLessThan(20);
      expect(trees[3] / land[3], `${region}: trees to the hectare above the line`).toBeLessThan(0.3);
      // within the line they thin: in its upper half far fewer than in its lower half and than below it
      // (the land below the line holds the road's own clearing and the valley floors: its lower half is
      // hillside, and may be as wooded as any)
      const below = trees[0] / land[0];
      expect(trees[2] / land[2], `${region}: the line's upper half`).toBeLessThan(0.55 * below);
      expect(trees[2] / land[2], `${region}: the line's upper half`).toBeLessThan(0.6 * (trees[1] / land[1]));
      expect(trees[1] + trees[2], region).toBeGreaterThan(20);
      console.log(`${region}: trees to the hectare below the tree line ${below.toFixed(1)}, in its lower half ${(trees[1] / land[1]).toFixed(1)}, in its upper half ${(trees[2] / land[2]).toFixed(1)}, above it ${(trees[3] / land[3]).toFixed(2)}; the highest tree ${highest.toFixed(0)} m from the line's end`);
    }
  });

  it('reeds and willows stand by fresh water and nowhere else', () => {
    let reeds = 0;
    let willows = 0;
    for (const [region, seed] of [['lakes', 3], ['plains', 11], ['wetland', 7], ['forest', 5], ['karst_peaks', 21]] as const) {
      const w = startIn(region, seed);
      const reader = shoreOf(w);
      const out = { dist: 0, kind: 0 };
      firstChapter(w, 14, 3, (tx, tz) => {
        for (const layer of [LAYER_TREE, LAYER_SHRUB] as FloraLayer[]) {
          const ft = w.flora!.tile(layer, tx, tz);
          for (let k = 0; k < ft.n; k++) {
            const id = PLANTS[ft.plant[k]].id;
            if (id !== 'reed' && id !== 'willow') continue;
            if (id === 'reed') reeds++;
            else willows++;
            const rule = ruleOf(ft.region[k], layer, ft.rule[k]);
            // the water's own account, at the plant's own place: within its rule's reach of the edge (and
            // the width over which a band falls off, and what reading between nodes 8 m apart can be out by)
            reader(ft.x[k], ft.z[k], out);
            const reach = rule.water![1];
            expect(out.dist, `${region}: a ${id} ${out.dist.toFixed(1)} m from the water`).toBeLessThan(reach + Math.max(1.5, 0.25 * reach) + 4);
            expect(out.kind === 1 || out.kind === 2, `${region}: a ${id} by water of kind ${out.kind}`).toBe(true);
          }
        }
      });
    }
    expect(reeds).toBeGreaterThan(250);
    expect(willows).toBeGreaterThan(200);
    // (and by the sea neither: the lake country's beaches are sand, kelp and shells)
    const coast = [1, 2, 3, 4, 5, 6].map((seed) => new World(seed, { worldVersion: 2, startBiome: 'lakes', chapterScale: 2 })).find((w) => w.sea.seaOf(0))!;
    const sea = coast.sea.seaOf(0)!;
    let byTheSea = 0;
    let strand = 0;
    let inTheView = 0;
    let inland = 0;
    const reader = shoreOf(coast);
    const out = { dist: 0, kind: 0 };
    tilesAlong(coast, sea.runs[0].s0 + 700, sea.runs[0].s1 - 700, 1, 3, (tx, tz) => {
      for (const layer of LAYERS) {
        const ft = coast.flora!.tile(layer, tx, tz);
        for (let k = 0; k < ft.n; k++) {
          if (layer === LAYER_TREE) {
            // a coast road keeps its view: no tree between the road and the sea (sea.ts `open`)
            coast.shape(ft.x[k], ft.z[k], tp);
            if (coast.sea.open(tp.s, tp.d) > 0.9) inTheView++;
            else inland++;
          }
          reader(ft.x[k], ft.z[k], out);
          if (out.kind !== 3 || out.dist > 20) continue;
          const id = PLANTS[ft.plant[k]].id;
          if (id === 'reed' || id === 'willow' || id === 'cranberry_bush') byTheSea++;
          if (id === 'kelp_plant' || id === 'clam_plant' || id === 'crab_plant' || id === 'mussel_plant') strand++;
        }
      }
    });
    expect(byTheSea).toBe(0);
    expect(strand).toBeGreaterThan(20);
    expect(inTheView).toBe(0);
    expect(inland).toBeGreaterThan(200);
  });

  it('plants of the water stand in the shallows and nowhere else: wild rice, lotus, watercress, water chestnut', () => {
    const seen = new Map<string, number>();
    let dry = 0;
    for (const [region, seed] of [['wetland', 7], ['lakes', 3], ['terraces', 2], ['karst_peaks', 21]] as const) {
      const w = startIn(region, seed);
      firstChapter(w, 8, 3, (tx, tz) => {
        // (only the tiles that hold water: the others cannot hold a plant of it)
        const et = w.eco!.tile(tx, tz);
        let near = false;
        for (let n = 0; n < ECO_N * ECO_N && !near; n++) if (et.waterDist[n] < 12) near = true;
        if (!near) return;
        for (const layer of [LAYER_SHRUB, LAYER_GROUND] as FloraLayer[]) {
          const ft = w.flora!.tile(layer, tx, tz);
          for (let k = 0; k < ft.n; k++) {
            const p = PLANTS[ft.plant[k]];
            w.shape(ft.x[k], ft.z[k], tp);
            const depth = tp.wl - tp.bed;
            if (p.aquatic) {
              seen.set(p.id, (seen.get(p.id) ?? 0) + 1);
              expect(depth, `${region}: ${p.id}`).toBeGreaterThan(0.02);
              expect(depth, `${region}: ${p.id}`).toBeLessThanOrEqual(AQUATIC_DEPTH + 1e-9);
            } else {
              dry++;
              expect(depth > 0.02, `${region}: ${p.id} in ${depth.toFixed(2)} m of water`).toBe(false);
            }
          }
        }
      });
    }
    expect(dry).toBeGreaterThan(1000);
    for (const id of ['rice_stand', 'lotus_root_plant', 'watercress_plant', 'water_chestnut_plant']) expect(seen.get(id) ?? 0, id).toBeGreaterThan(20);
  });

  it('tea stands on level ground, and on the benches of the terraced hillsides', () => {
    const lp = new LandParams();
    // the two rules that stand tea in the terraces: by the ecotope's slope, and on the benches
    const rules = FLORA.terraces.shrubs;
    const level = rules.findIndex((r) => r.plant === 'tea_bush' && r.slope);
    const bench = rules.findIndex((r) => r.plant === 'tea_bush' && r.bench);
    expect(level).toBeGreaterThanOrEqual(0);
    expect(bench).toBeGreaterThanOrEqual(0);
    let onLevel = 0;
    let onBenches = 0;
    let onHillside = 0;
    let flat = 0;
    let hillsideHa = 0;
    for (const seed of [2, 9]) {
      const w = startIn('terraces', seed);
      firstChapter(w, 14, 3, (tx, tz) => {
        const ft = w.flora!.tile(LAYER_SHRUB, tx, tz);
        for (let k = 0; k < ft.n; k++) {
          if (PLANTS[ft.plant[k]].id !== 'tea_bush' || ft.region[k] !== BIOME_INDEX.terraces) continue;
          const x = ft.x[k];
          const z = ft.z[k];
          w.eco!.at(x, z, e);
          if (ft.rule[k] === level) {
            // by the slope band: the ecotope's slope there within the band and the width it falls off over
            onLevel++;
            expect(e.slope).toBeLessThanOrEqual(rules[level].slope![1] + 0.02 + 1e-6);
            continue;
          }
          expect(ft.rule[k]).toBe(bench);
          onBenches++;
          // on a bench: the stretch is cut into benches, and the bush's own ground lies at a bench's level
          expect(w.land.at(w.spine.sAtX(x), lp).terrace).toBeGreaterThan(0.3);
          expect(onBench(ft.y[k], lp.step)).toBe(true);
          // level under the bush itself (half a metre either side), on a hillside (the land 12 m either side)
          if (slopeAt(w, x, z, 0.5) < 0.08) flat++;
          if (slopeAt(w, x, z, 12) >= 0.1) onHillside++;
        }
        // how much terraced hillside there is: the land of the terraced stretches that climbs a tenth and more
        for (let j = 0; j < ECO_SQ; j += 4) {
          for (let i = 0; i < ECO_SQ; i += 4) {
            const x = (tx * ECO_SQ + i) * 8 + 3.3;
            const z = (tz * ECO_SQ + j) * 8 + 2.7;
            if (w.land.at(w.spine.sAtX(x), lp).terrace >= 1 && slopeAt(w, x, z, 12) >= 0.1) hillsideHa += 16 * NODE_HA;
          }
        }
      });
    }
    expect(onLevel).toBeGreaterThan(500);
    expect(onBenches).toBeGreaterThan(1500);
    // the benches of real hillsides, not level country that happens to lie at a bench's height
    expect(onHillside / onBenches).toBeGreaterThan(0.5);
    // nearly every one stands level (the rest at a bench's very edge, or where the terraces fade out)
    expect(flat / onBenches).toBeGreaterThan(0.85);
    // and there is tea on the hillsides: tens of bushes to the hectare of terraced slope, benches and risers together
    expect(hillsideHa).toBeGreaterThan(100);
    expect(onHillside / hillsideHa).toBeGreaterThan(12);
    console.log(`tea in the terraces: ${onLevel} on level ground by the slope band, ${onBenches} on benches (${((100 * flat) / onBenches).toFixed(0)}% level under the bush, ${((100 * onHillside) / onBenches).toFixed(0)}% on hillsides: ${(onHillside / hillsideHa).toFixed(1)} to the hectare of terraced hillside)`);
  });

  it('flowers stand in rows on the level ground of the flower fields and not on its slopes; the terraces\' crops in rows on the benches', () => {
    const c = new Cover();
    const rows = FLORA.flower_fields.cover.rows!;
    const w = startIn('flower_fields', 2);
    let level = 0;
    let inRow = 0;
    let steep = 0;
    let onSteep = 0;
    firstChapter(w, 10, 2, (tx, tz) => {
      for (let q = 0; q < 60; q++) {
        const x = tx * ECO_TILE + ((q * 37) % 128) + 0.5;
        const z = tz * ECO_TILE + ((q * 53) % 128) + 0.25;
        w.eco!.at(x, z, e);
        if (e.flags !== 0 || e.canopy > 0.02) continue;
        w.flora!.cover(x, z, c);
        if (e.slope > rows.maxSlope) {
          steep++;
          if (c.flowers > 0) onSteep++;
        } else {
          level++;
          if (c.flowers > 0) inRow++;
        }
      }
    });
    expect(level).toBeGreaterThan(3000);
    // of the level ground, the rows' share is in flower and the rest is the path between
    expect(inRow / level).toBeGreaterThan(rows.share - 0.08);
    expect(inRow / level).toBeLessThan(rows.share + 0.08);
    expect(steep).toBeGreaterThan(30);
    expect(onSteep).toBe(0);
    // a row is a row: along it one colour, across it flower and path by turns, a row's width apart
    let turns = 0;
    let hues = new Set<number>();
    let last = -1;
    const x0 = 9000;
    w.spine.at(w.spine.sAtX(x0), sp);
    for (let z = sp.z + 60; z < sp.z + 200; z += 0.25) {
      w.eco!.at(x0, z, e);
      if (e.flags !== 0 || e.canopy > 0.02 || e.slope > rows.maxSlope) continue;
      w.flora!.cover(x0, z, c);
      const on = c.flowers > 0 ? 1 : 0;
      if (last >= 0 && on !== last) turns++;
      last = on;
      if (on) hues.add(c.hue);
    }
    expect(turns).toBeGreaterThan(20);
    expect(hues.size).toBeGreaterThanOrEqual(3);
    // the terraces: crops in rows on the benches, for a caller that knows the ground's own height
    const farms = startIn('terraces', 2);
    const lp = new LandParams();
    const crops = FLORA.terraces.cover.rows!;
    let benches = 0;
    let withRows = 0;
    let blind = 0;
    let risers = 0;
    let onRisers = 0;
    firstChapter(farms, 10, 3, (tx, tz) => {
      for (let q = 0; q < 40; q++) {
        const x = tx * ECO_TILE + ((q * 37) % 128) + 0.5;
        const z = tz * ECO_TILE + ((q * 53) % 128) + 0.25;
        farms.eco!.at(x, z, e);
        if (e.flags !== 0 || e.canopy > 0.02 || e.slope <= crops.maxSlope + 0.05 || farms.land.at(farms.spine.sAtX(x), lp).terrace < 1) continue;
        // a terraced hillside (by the ecotope's slope it is no level ground)
        farms.shape(x, z, tp);
        farms.flora!.cover(x, z, c);
        if (c.flowers > 0) blind++;
        farms.flora!.cover(x, z, c, tp.bed);
        if (onBench(tp.bed, lp.step)) {
          benches++;
          if (c.flowers > 0) withRows++;
        } else {
          risers++;
          if (c.flowers > 0) onRisers++;
        }
      }
    });
    expect(benches).toBeGreaterThan(300);
    expect(risers).toBeGreaterThan(300);
    expect(blind).toBe(0);
    expect(onRisers).toBe(0);
    expect(withRows / benches).toBeGreaterThan(crops.share - 0.1);
    expect(withRows / benches).toBeLessThan(crops.share + 0.1);
  });

  it('bamboo stands in groves: a cane has canes about it, and between the groves there are none', () => {
    for (const [region, seed, groved, empty] of [['bamboo_sea', 9, 0.9, 0], ['terraces', 9, 0.75, 0.1], ['karst_peaks', 9, 0.75, 0.5]] as const) {
      const w = startIn(region, seed);
      let canes = 0;
      let inGrove = 0;
      let alone = 0;
      let tiles = 0;
      let without = 0;
      firstChapter(w, 8, 2, (tx, tz) => {
        const ft = w.flora!.tile(LAYER_TREE, tx, tz);
        const at: number[] = [];
        for (let k = 0; k < ft.n; k++) if (PLANTS[ft.plant[k]].id === 'bamboo') at.push(ft.x[k], ft.z[k]);
        tiles++;
        if (at.length === 0) without++;
        for (let a = 0; a < at.length; a += 2) {
          let near = 0;
          for (let b = 0; b < at.length; b += 2) if (a !== b && Math.hypot(at[a] - at[b], at[a + 1] - at[b + 1]) < 14) near++;
          canes++;
          if (near >= 3) inGrove++;
          if (near === 0) alone++;
        }
      });
      expect(canes, region).toBeGreaterThan(1000);
      // (counted within a tile: a cane at a tile's edge has neighbours across it that are not seen here)
      expect(inGrove / canes, `${region}: canes with three or more others within 14 m`).toBeGreaterThan(groved);
      expect(alone / canes, `${region}: canes with none`).toBeLessThan(0.06);
      expect(without / tiles, `${region}: tiles without a cane`).toBeGreaterThanOrEqual(empty);
    }
  });

  it('a tower carries scrub and some trees on its gentler ground and little on its steep sides; a tree with a slope band keeps to it', () => {
    // land (ha), trees and shrubs on towers, by how steep: gentle (below 0.6), middling (to 1), steep (to WOOD_SHEER), sheer
    const land = [0, 0, 0, 0];
    const trees = [0, 0, 0, 0];
    const shrubs = [0, 0, 0, 0];
    const cls = (s: number): number => (s < 0.6 ? 0 : s < 1 ? 1 : s < WOOD_SHEER ? 2 : 3);
    let scrub = 0;
    let off = 0;
    for (const seed of [2, 9]) {
      const w = startIn('karst_peaks', seed);
      firstChapter(w, 6, 5, (tx, tz) => {
        const et = w.eco!.tile(tx, tz);
        let tower = false;
        for (let j = 0; j < ECO_SQ; j++) {
          for (let i = 0; i < ECO_SQ; i++) {
            const n = j * ECO_N + i;
            if (et.landform[n] <= 8) continue;
            tower = true;
            land[cls(et.slope[n])] += NODE_HA;
          }
        }
        if (!tower) return;
        for (const layer of [LAYER_TREE, LAYER_SHRUB] as FloraLayer[]) {
          const ft = w.flora!.tile(layer, tx, tz);
          for (let k = 0; k < ft.n; k++) {
            w.eco!.at(ft.x[k], ft.z[k], e);
            const rule = ruleOf(ft.region[k], layer, ft.rule[k]);
            // the rule's slope band, wherever the plant stands
            if (rule.slope) expect(e.slope).toBeLessThanOrEqual(rule.slope[1] + Math.max(0.02, 0.25 * (rule.slope[1] - rule.slope[0])) + 1e-6);
            if (rule.landform) {
              // the scrub of the towers stands on a tower
              scrub++;
              expect(e.landform).toBeGreaterThan(rule.landform[0] - 3 - 1e-6);
            }
            if (e.landform <= 8) {
              off++;
              continue;
            }
            (layer === LAYER_TREE ? trees : shrubs)[cls(e.slope)]++;
          }
        }
      });
    }
    // (the ecotope's own landform is the land's: where it says tower, the land's point says so too)
    const w = startIn('karst_peaks', 2);
    let agree = 0;
    firstChapter(w, 24, 5, (tx, tz) => {
      const et = w.eco!.tile(tx, tz);
      for (let n = 0; n < ECO_N * ECO_N; n += 5) {
        w.shape(tx * ECO_TILE + (n % ECO_N) * 8, tz * ECO_TILE + Math.floor(n / ECO_N) * 8, tp);
        expect(et.landform[n]).toBeCloseTo(tp.landform, 3);
        if (tp.landform > 8) agree++;
      }
    });
    expect(agree).toBeGreaterThan(40);
    expect(land[0] + land[1]).toBeGreaterThan(3);
    expect(land[2]).toBeGreaterThan(3);
    expect(land[3]).toBeGreaterThan(2);
    expect(scrub).toBeGreaterThan(300);
    expect(off).toBeGreaterThan(1000);
    const gentle = land[0] + land[1];
    // the gentler ground: hung with scrub, and some trees
    expect((shrubs[0] + shrubs[1]) / gentle).toBeGreaterThan(90);
    expect((trees[0] + trees[1]) / gentle).toBeGreaterThan(20);
    // the steep sides: a fifth of that at most; the sheer ones: bare
    expect(shrubs[2] / land[2]).toBeLessThan(0.2 * ((shrubs[0] + shrubs[1]) / gentle));
    expect(trees[2] / land[2]).toBeLessThan(0.4 * ((trees[0] + trees[1]) / gentle));
    expect(trees[3] + shrubs[3]).toBe(0);
    console.log(`karst towers: to the hectare, on ground below 1 in 1: ${((trees[0] + trees[1]) / gentle).toFixed(0)} trees and ${((shrubs[0] + shrubs[1]) / gentle).toFixed(0)} shrubs; steeper, to ${WOOD_SHEER}: ${(trees[2] / land[2]).toFixed(0)} and ${(shrubs[2] / land[2]).toFixed(0)}; sheer: ${trees[3] + shrubs[3]} on ${land[3].toFixed(0)} ha`);
  });

  it('nothing stands on the road\'s corridor, in deep water, on a place\'s ground or on a plot, in any of the twelve regions', () => {
    let plants = 0;
    let nearRoad = 0;
    let unsettled = 0;
    for (const region of TWELVE) {
      // a plot of the caller's beside the road: 70 m square, a little way from the road, level at the land's height in its middle
      const base = startIn(region, 4);
      base.spine.at(5000, sp);
      const px = sp.x - Math.sin(sp.phi) * 60;
      const pz = sp.z + Math.cos(sp.phi) * 60;
      const ph = base.heightAt(px, pz);
      const plot: Plot = { x0: px - 35, x1: px + 35, z0: pz - 35, z1: pz + 35, skirt: 12, height: () => ph };
      const w = new World(4, { worldVersion: 2, startBiome: region, chapterScale: 6, plots: [plot] });
      let onPlotNodes = 0;
      // the tiles the road runs through and the next either side: the road, the places, the plot
      tilesAlong(w, 3000, 6200, 1, 1, (tx, tz) => {
        const et = w.eco!.tile(tx, tz);
        for (let n = 0; n < ECO_N * ECO_N; n++) if (et.flags[n] & ECO_PLOT) onPlotNodes++;
        for (const layer of LAYERS) {
          const C = LAYER_CELL[layer];
          const ft = w.flora!.tile(layer, tx, tz);
          for (let k = 0; k < ft.n; k++) {
            plants++;
            w.shape(ft.x[k], ft.z[k], tp);
            let far = Math.abs(tp.d);
            if (far < ROAD_CLEAR - 0.6) {
              // (the land's offset is the offset from the road point its search ended at: well away from the
              // road, inside a bend, that may not be the nearest one. The distance itself, then: to the
              // nearest of the road's points for 200 m either way.)
              far = Infinity;
              for (let s = tp.s - 200; s <= tp.s + 200; s += 0.5) {
                w.spine.at(s, sp);
                far = Math.min(far, Math.hypot(sp.x - ft.x[k], sp.z - ft.z[k]));
              }
              unsettled++;
            }
            if (far < 12) nearRoad++;
            if (far < ROAD_CLEAR - 0.6 || tp.zone !== 0) throw new Error(`${region}: ${PLANTS[ft.plant[k]].id} ${far.toFixed(1)} m from the road's middle`);
            if (tp.site > 0.02) throw new Error(`${region}: ${PLANTS[ft.plant[k]].id} on a place's ground`);
            if (tp.plot > 0.02) throw new Error(`${region}: ${PLANTS[ft.plant[k]].id} on the plot`);
            const depth = tp.wl - tp.bed;
            if (PLANTS[ft.plant[k]].aquatic ? !(depth > 0.02 && depth <= AQUATIC_DEPTH) : depth > 0.02) throw new Error(`${region}: ${PLANTS[ft.plant[k]].id} in ${depth.toFixed(2)} m of water`);
            // its height the land's own, itself in its own cell
            if (Math.abs(ft.y[k] - tp.bed) > 1e-3) throw new Error(`${region}: a plant ${Math.abs(ft.y[k] - tp.bed).toFixed(3)} m off the ground`);
            if (Math.floor(ft.x[k] / C) < tx * (ECO_TILE / C) || Math.floor(ft.x[k] / C) >= (tx + 1) * (ECO_TILE / C)) throw new Error('a plant outside its tile');
          }
        }
      });
      expect(onPlotNodes, `${region}: the plot is there`).toBeGreaterThan(60);
    }
    expect(plants).toBeGreaterThan(40000);
    // (plants do come close to the road: the bound is tested, not avoided)
    expect(nearRoad).toBeGreaterThan(400);
    expect(unsettled).toBeLessThan(20);
    expect(TWELVE.length).toBe(12);
  });
});
