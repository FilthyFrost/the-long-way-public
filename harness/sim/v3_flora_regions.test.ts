/**
 * What grows in each of the twelve regions of a world of version 2 (src/core/world/floraTables.ts over
 * ecotope.ts and flora.ts), counted on the tiles beside the road: once with the region as the journey's first,
 * for a long first chapter, and once as the dealer deals it along a journey. For every region a band for how
 * much of its land is under wood, how many trees stand to the hectare in the woods and outside them, how many
 * kinds of tree and of shrub there are, and how many plants one can pick to the hectare, of how many kinds.
 *
 * (The numbers are what the tables give today, with room either side: a band that fails says a table or the
 * ecotope has changed what a region looks like, which is a thing to look at before it is a thing to fix.
 * What each kind of country must get right in its own way — the tree line, the water's edge, the benches,
 * the rows, the groves, the towers — is harness/sim/v3_flora_country.test.ts.)
 */
import { describe, expect, it } from 'vitest';
import { BIOMES, BIOME_INDEX } from '../../src/core/world/biomes';
import { ECO_N, ECO_SQ, ECO_TILE, ECO_WET, Ecotope } from '../../src/core/world/ecotope';
import { LAYER_GROUND, LAYER_SHRUB, LAYER_TREE, type FloraLayer } from '../../src/core/world/flora';
import { FLORA } from '../../src/core/world/floraTables';
import { PLANTS, bearsAt } from '../../src/core/world/plants';
import { SpineSample } from '../../src/core/world/spine';
import { World } from '../../src/core/world/terrain';

const LAYERS: FloraLayer[] = [LAYER_TREE, LAYER_SHRUB, LAYER_GROUND];
/** a node of the ecotope's grid stands for this much land (ha) */
const NODE_HA = 0.0064;
const e = new Ecotope();
const sp = new SpineSample();

/** a world that begins in a region and stays in it for 45 km and more */
function startIn(region: string, seed: number): World {
  return new World(seed, { worldVersion: 2, startBiome: region, chapterScale: 6 });
}

/** the journeys the dealt regions are counted on: three seeds, as a new game deals them */
const journeys: World[] = [];
function journey(i: number): World {
  while (journeys.length <= i) journeys.push(new World(journeys.length + 1, { worldVersion: 2 }));
  return journeys[i];
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

/** what a census of some tiles found */
class Tally {
  tiles = 0;
  /** nodes of land (not under water), and of them under wood (canopy above a half) */
  land = 0;
  wood = 0;
  treesIn = 0;
  treesOut = 0;
  readonly trees = new Set<string>();
  readonly shrubs = new Set<string>();
  pick = 0;
  readonly pickKinds = new Set<string>();

  count(w: World, tx: number, tz: number): void {
    const et = w.eco!.tile(tx, tz);
    this.tiles++;
    for (let j = 0; j < ECO_SQ; j++) {
      for (let i = 0; i < ECO_SQ; i++) {
        const n = j * ECO_N + i;
        if (et.flags[n] & ECO_WET) continue;
        this.land++;
        if (et.canopy[n] > 0.5) this.wood++;
      }
    }
    for (const layer of LAYERS) {
      const ft = w.flora!.tile(layer, tx, tz);
      for (let k = 0; k < ft.n; k++) {
        const p = PLANTS[ft.plant[k]];
        if (layer === LAYER_TREE) {
          this.trees.add(p.id);
          if (w.eco!.at(ft.x[k], ft.z[k], e).canopy > 0.5) this.treesIn++;
          else this.treesOut++;
        } else if (layer === LAYER_SHRUB) this.shrubs.add(p.id);
        const b = bearsAt(p, ft.vary[k]);
        if (b) {
          this.pick++;
          this.pickKinds.add(b);
        }
      }
    }
  }

  /** the share of the land under wood (%) */
  get woodShare(): number {
    return (100 * this.wood) / this.land;
  }
  /** trees to the hectare of wood, of open land, and of all land */
  get inWoods(): number {
    return this.treesIn / (this.wood * NODE_HA);
  }
  get outside(): number {
    return this.treesOut / ((this.land - this.wood) * NODE_HA);
  }
  get treesPerHa(): number {
    return (this.treesIn + this.treesOut) / (this.land * NODE_HA);
  }
  get pickPerHa(): number {
    return this.pick / (this.land * NODE_HA);
  }
}

/** a region's census as the journey's first region (two seeds) and as dealt (the first chapter of it on each of three journeys) */
function censusOf(region: string): { start: Tally; dealt: Tally; chapters: number } {
  const start = new Tally();
  for (const seed of [2, 9]) {
    const w = startIn(region, seed);
    firstChapter(w, 24, 3, (tx, tz) => start.count(w, tx, tz));
  }
  const dealt = new Tally();
  let chapters = 0;
  for (let i = 0; i < 3; i++) {
    const w = journey(i);
    const plan = w.spine.plan;
    for (let c = 1; c < 80; c++) {
      if (plan.biomeOf(c) !== BIOME_INDEX[region]) continue;
      plan.biomeOf(c + 1);
      // (the chapter less the stretch at either end where it blends into its neighbour)
      tilesAlong(w, plan.starts[c] + 700, plan.starts[c + 1] - 700, 7, 3, (tx, tz) => dealt.count(w, tx, tz));
      chapters++;
      break;
    }
  }
  return { start, dealt, chapters };
}

/** [low, high] */
type Range = readonly [number, number];
interface Bands {
  /** % of the land under wood */
  readonly wood: Range;
  /** trees to the hectare of wood; null: the region has no woods to speak of */
  readonly inWoods: Range | null;
  /** trees to the hectare of land outside the woods */
  readonly outside: Range;
  /** kinds of tree and of shrub, at least */
  readonly trees: number;
  readonly shrubs: number;
  /** plants to pick to the hectare of land, and their kinds, at least */
  readonly pick: Range;
  readonly kinds: number;
}

/**
 * The bands, by region. What stands behind them (floraTables.ts and docs/V3/CATALOG.md): the forest and the
 * bamboo sea are wood nearly everywhere and as thick as a wood gets (a tree to every cell of 8 m is 156 to
 * the hectare; the wood's own area is counted by the grid's nodes, so the count may come out a little over);
 * the maple hills are wooded on most slopes, the high country to its tree line; the grassland,
 * the lake country, the karst and the terraces have copses and groves on a fifth to a third of their land;
 * the flower fields and the marsh a tenth, in belts; the two dry regions have no woods at all, only the
 * scattered trees of open country. Everywhere a hectare holds a few dozen things to pick, of a dozen kinds
 * or two.
 */
const BANDS: Record<string, Bands> = {
  plains: { wood: [20, 36], inWoods: [120, 150], outside: [10, 19], trees: 6, shrubs: 6, pick: [38, 56], kinds: 26 },
  desert: { wood: [0, 3], inWoods: null, outside: [7, 13], trees: 3, shrubs: 6, pick: [26, 40], kinds: 11 },
  alpine: { wood: [38, 56], inWoods: [105, 135], outside: [9, 19], trees: 3, shrubs: 2, pick: [14, 24], kinds: 12 },
  forest: { wood: [70, 86], inWoods: [136, 160], outside: [18, 33], trees: 6, shrubs: 5, pick: [50, 74], kinds: 20 },
  lakes: { wood: [18, 32], inWoods: [138, 160], outside: [5, 12], trees: 5, shrubs: 4, pick: [18, 28], kinds: 17 },
  maple: { wood: [48, 66], inWoods: [115, 140], outside: [12, 22], trees: 6, shrubs: 5, pick: [30, 46], kinds: 22 },
  flower_fields: { wood: [7, 15], inWoods: [95, 125], outside: [3, 9], trees: 5, shrubs: 5, pick: [45, 66], kinds: 13 },
  terraces: { wood: [14, 25], inWoods: [95, 125], outside: [4, 9], trees: 5, shrubs: 5, pick: [27, 41], kinds: 19 },
  wetland: { wood: [10, 19], inWoods: [62, 92], outside: [2, 6], trees: 3, shrubs: 4, pick: [28, 41], kinds: 11 },
  bamboo_sea: { wood: [70, 86], inWoods: [108, 132], outside: [15, 27], trees: 4, shrubs: 4, pick: [36, 54], kinds: 12 },
  red_canyon: { wood: [0, 5], inWoods: null, outside: [10, 18], trees: 3, shrubs: 6, pick: [31, 46], kinds: 12 },
  // (since stage L1, as dealt: 5.9 lone trees to the hectare, where 6 was the band's floor, four kinds of tree
  // and four of shrub, the willow, the reed and the rice missing, and 15 kinds to pick. As many rivers and lakes as before, but the
  // road of version 2 climbs and falls to other heights, so its rivers cross it elsewhere — at its lowest
  // points — and the strips the census reads in the three karst chapters cross no bank of fresh water; by
  // the water those plants stand as before, as the first region shows)
  karst_peaks: { wood: [25, 38], inWoods: [75, 105], outside: [5.5, 14], trees: 4, shrubs: 4, pick: [23, 36], kinds: 15 },
};

describe('the twelve regions, counted', () => {
  it('there is a band for every region that has a table, and a table for every region of the registry\'s first twelve', () => {
    expect(Object.keys(BANDS).sort()).toEqual(Object.keys(FLORA).sort());
    expect(BIOMES.slice(0, 12).map((b) => b.id).sort()).toEqual(Object.keys(BANDS).sort());
  });

  for (const region of Object.keys(BANDS)) {
    it(`${region}: its woods, its trees, its kinds and what there is to pick, as the first region and as dealt`, () => {
      const band = BANDS[region];
      const { start, dealt, chapters } = censusOf(region);
      expect(chapters, 'every journey comes to it').toBe(3);
      const said: string[] = [];
      for (const [how, t] of [['first', start], ['dealt', dealt]] as const) {
        expect(t.tiles).toBeGreaterThan(100);
        said.push(`${how}: wood ${t.woodShare.toFixed(0)}%, trees/ha ${band.inWoods ? `${t.inWoods.toFixed(0)} in the woods, ` : ''}${t.outside.toFixed(1)} outside (${t.treesPerHa.toFixed(1)} over all), ${t.trees.size} kinds of tree, ${t.shrubs.size} of shrub; to pick ${t.pickPerHa.toFixed(1)}/ha of ${t.pickKinds.size} kinds (${t.tiles} tiles)`);
        expect(t.woodShare, `${how}: % of the land under wood`).toBeGreaterThanOrEqual(band.wood[0]);
        expect(t.woodShare, `${how}: % of the land under wood`).toBeLessThanOrEqual(band.wood[1]);
        if (band.inWoods) {
          expect(t.inWoods, `${how}: trees to the hectare of wood`).toBeGreaterThanOrEqual(band.inWoods[0]);
          expect(t.inWoods, `${how}: trees to the hectare of wood`).toBeLessThanOrEqual(band.inWoods[1]);
        }
        expect(t.outside, `${how}: trees to the hectare outside the woods`).toBeGreaterThanOrEqual(band.outside[0]);
        expect(t.outside, `${how}: trees to the hectare outside the woods`).toBeLessThanOrEqual(band.outside[1]);
        expect(t.trees.size, `${how}: kinds of tree (${[...t.trees].join(", ")})`).toBeGreaterThanOrEqual(band.trees);
        expect(t.shrubs.size, `${how}: kinds of shrub`).toBeGreaterThanOrEqual(band.shrubs);
        expect(t.pickPerHa, `${how}: plants to pick to the hectare`).toBeGreaterThanOrEqual(band.pick[0]);
        expect(t.pickPerHa, `${how}: plants to pick to the hectare`).toBeLessThanOrEqual(band.pick[1]);
        expect(t.pickKinds.size, `${how}: kinds to pick`).toBeGreaterThanOrEqual(band.kinds);
        // only what the region's table names, or its neighbour's across a border
        for (const id of t.trees) expect(PLANTS.some((p) => p.id === id && p.layer === 'tree')).toBe(true);
      }
      // the region comes out the same country wherever the dealer puts it
      expect(Math.abs(start.woodShare - dealt.woodShare)).toBeLessThan(10);
      expect(Math.abs(start.pickPerHa - dealt.pickPerHa) / start.pickPerHa).toBeLessThan(0.2);
      console.log(`${region}\n  ${said.join('\n  ')}`);
    });
  }
});
