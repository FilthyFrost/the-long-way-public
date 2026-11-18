/**
 * The flora field (docs/V3/nodes/W2-flora.md): what grows where, decided once, in the core. Everything that
 * shows or uses plants asks here: the renderer stands the trees and shrubs it is told, foraging picks what the
 * plants bear, and later the animals' cover and a bullet's path read the same trees.
 *
 * The world is cut into cells, one grid per layer (trees and shrubs 8 m, ground plants 4 m), and a cell holds
 * one plant or none. A cell is decided from its own hash and the ecotope at its plant's place: the region's
 * flora table is a list of rules, each "this plant, so many to the hectare where it likes it, and what it
 * likes"; the cell's dice fall on one rule or on none. Rules are data: a region's country is changed by
 * changing rows, never code.
 *
 * Besides single plants there is the ground cover (groundCover): how thick and tall the grass stands at a
 * place, how many flowers and of which colour, in rows or not, how much bare ground and leaf litter. That is
 * what the grass is drawn from.
 *
 * Pure, no three, no DOM; deterministic for a seed whatever is asked first.
 *
 * The world makes its own field when it is first asked for it (terrain.ts `World.flora`), so this file knows
 * the land by its types only and loads nothing of it to run: the world hands the field a terrain point to
 * work with.
 */
import { fbm2 } from '../math/noise';
import { hash2 } from '../math/rng';
import { ECO_PLOT, ECO_ROAD, ECO_SITE, ECO_WET, ROAD_CLEAR, Ecotope, type EcoParams, type EcotopeField } from './ecotope';
import { AQUATIC_DEPTH, plantIndex, PLANTS } from './plants';
import type { TerrainPoint, World } from './terrain';

/** the layers, the side of a cell of each (m) */
export const LAYER_TREE = 0;
export const LAYER_SHRUB = 1;
export const LAYER_GROUND = 2;
export type FloraLayer = 0 | 1 | 2;
export const LAYER_CELL: readonly number[] = [8, 8, 4];
const LAYER_SALT: readonly number[] = [0x7ee5, 0x7ee6, 0x7ee7];

/** a band [low, high] of a quantity: inside it a plant is at home, outside it its numbers fall off over a quarter of the band's width */
export type Band = readonly [number, number];

/** one row of a region's flora table */
export interface FloraRule {
  /** the plant's id (plants.ts) */
  readonly plant: string;
  /** how many stand on a hectare where everything suits it */
  readonly perHa: number;
  /** what it likes: bands of the ecotope's quantities (one left out does not matter to it) */
  readonly canopy?: Band;
  readonly moisture?: Band;
  readonly slope?: Band;
  readonly relief?: Band;
  readonly shade?: Band;
  /** metres from the water's edge, and which waters count (bit 1 lake, 2 river, 4 sea; absent: any) */
  readonly water?: Band;
  readonly waterKinds?: number;
  /** metres from the road's centre line */
  readonly road?: Band;
  /** its size against the plant's full size: a range (default 0.75 … 1.2) */
  readonly size?: Band;
  /** it grows in groves: its numbers swell and fade over patches of about this size (m) */
  readonly grove?: number;
}

/** how a region's ground is covered where no single plant stands */
export interface CoverParams {
  /** how thick the grass is, 0 … 1, in the open, and how tall (m) */
  readonly grass: number;
  readonly height: number;
  /** flowers among the grass, 0 … 1, and the colours they come in (0xRRGGBB) */
  readonly flowers: number;
  readonly hues: readonly number[];
  /** flowers or crops in rows: metres from row to row, the share of that which is the row, and how level the ground must be (a slope above this has none) */
  readonly rows?: { readonly spacing: number; readonly share: number; readonly maxSlope: number };
  /** bare ground where nothing else speaks, 0 … 1 (sand, scree, salt) */
  readonly bare: number;
}

/** what a region's country grows: its ecotope parameters, its rules by layer, its ground cover */
export interface FloraTable {
  readonly eco: EcoParams;
  readonly trees: readonly FloraRule[];
  readonly shrubs: readonly FloraRule[];
  readonly ground: readonly FloraRule[];
  readonly cover: CoverParams;
}

/** one plant standing in a cell (FloraField.cell fills one of these) */
export class FloraCell {
  /** index into PLANTS */
  plant = -1;
  x = 0;
  z = 0;
  /** height of the land under it (m) */
  y = 0;
  /** its size against the plant's full size */
  size = 1;
  /** its turn (rad) and a number 0 … 1 for whatever else should differ from one to the next */
  yaw = 0;
  vary = 0;
  /** the rule of its region's table that stood it there (index within its layer's rules) */
  rule = -1;
  /** the region whose table it came from */
  region = 0;
}

/** the ground cover at a place (FloraField.cover fills one of these) */
export class Cover {
  /** grass: 0 none … 1 thick, and its height (m) */
  grass = 0;
  height = 0;
  /** flowers: 0 none … 1 a carpet, and their colour */
  flowers = 0;
  hue = 0;
  /** 0 … 1: bare ground; leaf litter under trees */
  bare = 0;
  litter = 0;
}

function smooth(t: number): number {
  return t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t);
}

/** how well a value sits in a band: 1 inside, falling to 0 over a quarter of the band's width (at least `soft`) outside */
export function bandFit(v: number, band: Band | undefined, soft = 0.02): number {
  if (!band) return 1;
  const lo = band[0];
  const hi = band[1];
  if (v >= lo && v <= hi) return 1;
  const m = Math.max(soft, 0.25 * (hi - lo));
  if (v < lo) return smooth(1 - (lo - v) / m);
  return smooth(1 - (v - hi) / m);
}

/** how well a spot suits a rule, 0 … 1 */
export function ruleFit(r: FloraRule, e: Ecotope): number {
  let f = bandFit(e.canopy, r.canopy) * bandFit(e.moisture, r.moisture) * bandFit(e.slope, r.slope) * bandFit(e.shade, r.shade);
  if (f <= 0) return 0;
  if (r.relief) f *= bandFit(e.relief, r.relief, 4);
  if (r.road) f *= bandFit(e.ad, r.road, 2);
  if (r.water) {
    if (r.waterKinds !== undefined && (e.waterKind === 0 || !(r.waterKinds & (1 << (e.waterKind - 1))))) return 0;
    f *= bandFit(e.waterDist, r.water, 1.5);
  }
  return f;
}

/** a rule's plant indices, looked up once per table */
interface Compiled {
  readonly rules: readonly FloraRule[];
  readonly plants: Int32Array;
}

/**
 * The flora of a world. `tp` is a terrain point for the field's own use (the caller makes it: `new
 * TerrainPoint()`, and not the ecotope field's); `tableOf(region)` gives a region's FloraTable by its
 * registry index (the same table object each time: its rules are compiled once).
 */
export class FloraField {
  private readonly e = new Ecotope();
  private readonly compiled = new Map<FloraTable, Compiled[]>();
  private readonly seed: number;

  constructor(
    private readonly world: World,
    private readonly tp: TerrainPoint,
    readonly eco: EcotopeField,
    private readonly tableOf: (region: number) => FloraTable,
  ) {
    this.seed = world.seed;
  }

  private layersOf(t: FloraTable): Compiled[] {
    let c = this.compiled.get(t);
    if (!c) {
      c = [t.trees, t.shrubs, t.ground].map((rules) => {
        const plants = new Int32Array(rules.length);
        for (let i = 0; i < rules.length; i++) {
          plants[i] = plantIndex(rules[i].plant);
          if (plants[i] < 0) throw new Error(`a flora rule names the plant ${rules[i].plant}, which is not in the catalogue`);
        }
        return { rules, plants };
      });
      this.compiled.set(t, c);
    }
    return c;
  }

  /**
   * The plant of cell (cx, cz) of a layer. False: nothing grows there. The cell's place, size and turn come
   * from its hash alone; which plant, from the hash and the ecotope there. Nothing stands on the road's
   * corridor, in water, on a place's ground or on a plot.
   */
  cell(layer: FloraLayer, cx: number, cz: number, out: FloraCell): boolean {
    const C = LAYER_CELL[layer];
    const h = hash2(cx, cz, this.seed + LAYER_SALT[layer]);
    const x = (cx + 0.12 + 0.76 * ((h & 0xff) / 255)) * C;
    const z = (cz + 0.12 + 0.76 * (((h >>> 8) & 0xff) / 255)) * C;
    const e = this.eco.at(x, z, this.e);
    if (e.ad < ROAD_CLEAR) return false;
    // which of the two regions that meet here stands this cell's plant: by the cell's own dice against the mix
    const h2 = hash2(cz, cx, this.seed + LAYER_SALT[layer] + 0x100);
    const region = e.rt > 0 && ((h2 >>> 20) & 0xfff) / 4096 < e.rt ? e.rb : e.ra;
    const table = this.tableOf(region);
    const lay = this.layersOf(table)[layer];
    const rules = lay.rules;
    if (rules.length === 0) return false;
    const u = ((h >>> 16) & 0xffff) / 65536;
    const perCell = (C * C) / 10000;
    let acc = 0;
    let pick = -1;
    for (let i = 0; i < rules.length; i++) {
      const r = rules[i];
      let p = r.perHa * perCell * ruleFit(r, e);
      if (p <= 0) continue;
      if (r.grove) {
        // groves: the same kind stands together and is absent between
        const g = fbm2(x / r.grove, z / r.grove, this.seed + 0x6a0 + lay.plants[i] * 17, 2);
        p *= 2 * smooth(0.5 + 1.6 * g);
      }
      acc += p;
      if (u < acc) {
        pick = i;
        break;
      }
    }
    if (pick < 0) return false;
    // the exact ground under it: not in water, not on a place's ground or a plot, not on the road's own bed
    const tp = this.tp;
    this.world.shape(x, z, tp);
    if (tp.zone !== 0 || tp.site > 0.02 || tp.plot > 0.02) return false;
    const depth = tp.wl - tp.bed;
    // a plant of the water stands in the shallows and nowhere else; every other plant stands on dry ground
    if (PLANTS[lay.plants[pick]].aquatic ? !(depth > 0.02 && depth <= AQUATIC_DEPTH) : depth > 0.02) return false;
    const r = rules[pick];
    const s0 = r.size ? r.size[0] : 0.75;
    const s1 = r.size ? r.size[1] : 1.2;
    out.plant = lay.plants[pick];
    out.rule = pick;
    out.region = region;
    out.x = x;
    out.z = z;
    out.y = tp.bed;
    out.size = s0 + (s1 - s0) * ((h2 & 0xff) / 255);
    out.yaw = (((h2 >>> 8) & 0xfff) / 4096) * 6.283185307179586;
    out.vary = ((h >>> 4) & 0xfff) / 4096;
    return true;
  }

  /**
   * The ground cover at (x, z): grass, flowers, bare ground, litter. Under trees the grass thins and the
   * litter comes; on steep or dry ground the bare shows; rows of flowers or crops run along the contour of
   * the land where the region grows them and the ground is level enough.
   */
  cover(x: number, z: number, out: Cover): Cover {
    const e = this.eco.at(x, z, this.e);
    const t = this.tableOf(e.rt >= 0.5 ? e.rb : e.ra);
    const c = t.cover;
    if (e.flags & (ECO_ROAD | ECO_WET | ECO_SITE | ECO_PLOT)) {
      out.grass = out.height = out.flowers = out.hue = out.litter = 0;
      out.bare = e.flags & ECO_WET ? 0 : 1;
      return out;
    }
    const open = 1 - e.canopy;
    const steep = smooth((e.slope - 0.45) / 0.35);
    const dry = smooth((0.18 - e.moisture) / 0.18);
    const bare = Math.min(1, c.bare + 0.8 * steep + 0.35 * dry * (1 - c.grass));
    out.bare = bare;
    out.litter = e.canopy * (1 - bare);
    out.grass = c.grass * (0.35 + 0.65 * open) * (1 - bare) * (0.7 + 0.3 * e.moisture);
    out.height = c.height * (0.7 + 0.6 * e.moisture) * (0.6 + 0.4 * open);
    let fl = c.flowers * open * (1 - bare);
    let hueAt = fbm2(x / 46, z / 46, this.seed + 0x6b1, 2);
    if (c.rows && fl > 0) {
      if (e.slope > c.rows.maxSlope) fl = 0;
      else {
        // rows across the x axis, bent a little by the land: one colour to a row
        const p = (z + 14 * fbm2(x / 180, z / 180, this.seed + 0x6b2, 2)) / c.rows.spacing;
        const k = Math.floor(p);
        const f = p - k;
        fl *= f < c.rows.share ? 1 : 0;
        hueAt = ((hash2(k, 0x6b3, this.seed) >>> 8) & 0xffff) / 32768 - 1;
      }
    }
    out.flowers = fl;
    const n = c.hues.length;
    out.hue = n === 0 ? 0 : c.hues[Math.min(n - 1, Math.max(0, Math.floor((0.5 + 0.8 * hueAt) * n)))];
    return out;
  }
}

/** every plant a table names, by layer, as ids (for the tests and the developer's preview) */
export function plantsOf(t: FloraTable): string[] {
  return [...new Set([...t.trees, ...t.shrubs, ...t.ground].map((r) => r.plant))];
}

/** what is wrong with a table (nothing: an empty list): a plant that does not exist or stands in the wrong layer, numbers out of range */
export function floraTableProblems(id: string, t: FloraTable): string[] {
  const bad: string[] = [];
  const layers: [string, readonly FloraRule[]][] = [
    ['tree', t.trees],
    ['shrub', t.shrubs],
    ['ground', t.ground],
  ];
  for (const [layer, rules] of layers) {
    for (const r of rules) {
      const i = plantIndex(r.plant);
      if (i < 0) bad.push(`${id}: no plant ${r.plant}`);
      else if (PLANTS[i].layer !== layer) bad.push(`${id}: ${r.plant} is a ${PLANTS[i].layer}, listed among the ${layer}s`);
      if (!(r.perHa > 0)) bad.push(`${id}: ${r.plant} has no numbers`);
      for (const b of [r.canopy, r.moisture, r.slope, r.shade, r.relief, r.water, r.road, r.size]) if (b && !(b[1] >= b[0])) bad.push(`${id}: ${r.plant} has a band upside down`);
    }
  }
  if (t.eco.wood < 0 || t.eco.wood > 1) bad.push(`${id}: wood is 0 to 1`);
  if (t.cover.grass < 0 || t.cover.grass > 1 || t.cover.flowers < 0 || t.cover.flowers > 1 || t.cover.bare < 0 || t.cover.bare > 1) bad.push(`${id}: cover shares are 0 to 1`);
  return bad;
}
