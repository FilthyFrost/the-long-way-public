/**
 * The ground cover of a world of version 2 as the renderer reads it (docs/V3/nodes/W2-flora.md): how thick and
 * tall the grass stands, how many flowers, bare ground and litter — and the ROWS the flower fields and the
 * terraces' crops grow in.
 *
 * The cover itself is the core's (core/world/flora.ts `FloraField.cover`), and whatever is drawn plant by plant
 * could simply ask it. But the grass is a tuft every third of a metre and the ground's paint a pixel at a
 * time, and neither can ask the core that often. So this file takes the cover apart the way the core puts it
 * together: a smooth part (`coverBase`: what the ecotope and the region's table say, before the rows cut it
 * into stripes), which is sampled on a coarse grid and interpolated; and the rows, which are plain arithmetic
 * on a point's place (`rowCoord`, `rowOf`) and are done per tuft, or per pixel in the ground's paint
 * (render/terrainMaterials.ts, which is handed the row coordinate at every vertex).
 *
 * The same numbers as the core's, by construction and by test (harness/sim/v3_flora_view.test.ts holds the two
 * together at thousands of points: were the core's rule to change, the test says so).
 */
import { fbm2 } from '../../core/math/noise';
import { hash2 } from '../../core/math/rng';
import { ECO_PLOT, ECO_ROAD, ECO_SITE, ECO_WET, type Ecotope } from '../../core/world/ecotope';
import { onBench, type CoverParams } from '../../core/world/flora';

/** the smooth part of the cover at a point (coverBase fills one of these) */
export class CoverBase {
  /** grass: 0 none … 1 thick, and its height (m) */
  grass = 0;
  height = 0;
  /** flowers where a row runs (or anywhere, in a region without rows): 0 none … 1 a carpet */
  flowers = 0;
  /** 0 … 1: bare ground; leaf litter under trees */
  bare = 0;
  litter = 0;
}

function smooth(t: number): number {
  return t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t);
}

/**
 * The cover where the ecotope is `e`, for a region's cover parameters: everything of FloraField.cover but the
 * rows. (`flowers` is what stands in a row; whether a spot is in one is rowOf's to say, and whether rows run
 * on its ground at all, rowsRun's.)
 */
export function coverBase(e: Ecotope, c: CoverParams, out: CoverBase): CoverBase {
  if (e.flags & (ECO_ROAD | ECO_WET | ECO_SITE | ECO_PLOT)) {
    out.grass = out.height = out.flowers = out.litter = 0;
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
  out.flowers = c.flowers * open * (1 - bare);
  return out;
}

/** how fully a stretch must be cut into benches for its rows to keep to them (the core's BENCH_LAND) */
const BENCH_LAND = 0.5;

/**
 * Do a region's rows run on this ground: level enough by the ecotope's slope, or — on terraced country, for a
 * caller that knows the ground's own height `y` — a bench.
 */
export function rowsRun(rows: NonNullable<CoverParams['rows']>, slope: number, terrace: number, step: number, y?: number): boolean {
  return slope <= rows.maxSlope || (y !== undefined && terrace >= BENCH_LAND && onBench(y, step));
}

/**
 * The row coordinate of a point (m): the rows of a region lie across the x axis, bent a little by a slow
 * noise, where this divided by the region's row spacing is within the rows' share of a whole number.
 */
export function rowCoord(seed: number, x: number, z: number): number {
  return z + 14 * fbm2(x / 180, z / 180, seed + 0x6b2, 2);
}

/**
 * Which hue row k is: a number that, times the number of the region's hues and cut to a whole number within
 * them, is the hue's index (the first and the last hue take what falls outside: they are the commonest).
 */
export function rowHue01(seed: number, k: number): number {
  return 0.5 + 0.8 * (((hash2(k, 0x6b3, seed) >>> 8) & 0xffff) / 32768 - 1);
}

/** the same for ground without rows: the hue drifts in patches */
export function driftHue01(seed: number, x: number, z: number): number {
  return 0.5 + 0.8 * fbm2(x / 46, z / 46, seed + 0x6b1, 2);
}

/** the hue of a list by such a number (0 for an empty list) */
export function hueOf(hues: readonly number[], h01: number): number {
  const n = hues.length;
  return n === 0 ? 0 : hues[Math.min(n - 1, Math.max(0, Math.floor(h01 * n)))];
}

/** how often each hue of a list of n falls to a row (rowHue01 spread evenly over −0.3 … 1.3) */
export function hueShares(n: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const lo = i === 0 ? -0.3 : i / n;
    const hi = i === n - 1 ? 1.3 : (i + 1) / n;
    out.push((hi - lo) / 1.6);
  }
  return out;
}
