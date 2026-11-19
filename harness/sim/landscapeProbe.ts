/**
 * The landscape probe (docs/V3/nodes/L-landscape.md, "衡量“不再平”的探针"): what the land looks like from the
 * driver's seat, measured without drawing it, so that "flat" is a number before it is a picture.
 *
 * At a point of the road (arc length s) the eye stands PROBE_EYE m above the road's centre line and looks along
 * six rays, PROBE_RAYS degrees from the heading (negative: to the left), out to PROBE_REACH m. Along each ray the
 * land is sampled at distances that grow with the distance (PROBE_DISTANCES: every 3 m close in, then 1.8 % of
 * the distance), the near land as the meshes of the detailed disc draw it (World.shape) and from PROBE_COARSE m
 * on as the far ring draws it (coarse). What is seen at a sample is the land, or the water standing over it.
 *
 *   skyline   per ray: the highest elevation angle of the land, atan((h − eye) / distance), in degrees.
 *   layers    per ray: how many ridges stand one behind the other on the silhouette. Walking out along the ray,
 *             the running maximum of the elevation angle is a staircase; a CREST is a point where the running
 *             maximum was last raised and behind which the land then falls at least LAYER_DIP degrees below it
 *             (the land just behind it is hidden: it occludes). A crest counts as a layer when it stands at least
 *             LAYER_RISE degrees above the last crest that counted, the first above the level horizon (0°): land
 *             below eye level and swells of a few metres are not layers. A rise still under way where the ray
 *             ends is not counted.
 *   range     per side: the land's height range (highest less lowest, the road under the eye included) within
 *             0.3, 1 and 3 km of the eye, over the rays at 60°, 90° and 120° from the heading on that side.
 *   shut      per ray: the land within SHUT_AT m hides everything beyond it (the highest angle within SHUT_AT is
 *             not exceeded by anything further out). The share of the six is how shut in the road is.
 *
 * Pure: it reads the world as the game does and changes nothing but the world's lazily grown plans.
 *
 *   npx tsx harness/sim/landscapeProbe.ts [seeds = 6] [step = 250] [km = 300] [json out]
 *
 * prints the report over journeys of version 2 (every region as a long first chapter, and as dealt over `km`):
 * for each region the p10 / p50 / p90 of the numbers above, and the shares the minimum targets of stage L1 are
 * written in.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BIOMES } from '../../src/core/world/biomes';
import { BiomeBlend, SpineSample } from '../../src/core/world/spine';
import { TerrainPoint, World, type WorldOptions } from '../../src/core/world/terrain';

/** the driver's eye above the road (m) */
export const PROBE_EYE = 1.4;
/** how far each ray is walked (m) */
export const PROBE_REACH = 25000;
/** from this distance on the land is asked as the far ring asks it (coarse) */
export const PROBE_COARSE = 6000;
/** the rays: degrees from the heading, negative to the left; their order in every per-ray array */
export const PROBE_RAYS = [-90, -60, -30, 30, 60, 90] as const;
/** the extra rays the ranges are taken over (with ±60° and ±90°): to 3 km only */
const RANGE_BACK = [-120, 120] as const;
/** the radii of the ranges (m) */
export const RANGE_RADII = [300, 1000, 3000] as const;
/** a crest is a layer when it stands this much above the last one (deg) … */
export const LAYER_RISE = 0.4;
/** … and is a crest when the land behind it falls this far below it (deg) */
export const LAYER_DIP = 0.1;
/** a ray is shut when the land within this distance hides everything further (m) */
export const SHUT_AT = 150;

const DEG = 180 / Math.PI;

/** the distances along a ray (m): 3 m apart close in, then 1.8 % of the distance apart */
export const PROBE_DISTANCES: Float64Array = (() => {
  const a: number[] = [];
  for (let d = 6; d <= PROBE_REACH; d += Math.max(3, 0.018 * d)) a.push(d);
  return Float64Array.from(a);
})();
const N = PROBE_DISTANCES.length;
const N3 = PROBE_DISTANCES.findIndex((d) => d > RANGE_RADII[2]);

export interface ProbeResult {
  s: number;
  /** the region under the eye (index into BIOMES) and how fully (1: well inside it) */
  region: number;
  pure: number;
  /** the eye's height (m) */
  eye: number;
  /** per ray (PROBE_RAYS): the skyline's elevation angle (deg), the layers, shut (1) or not (0) */
  sky: Float64Array;
  layers: Int32Array;
  shut: Uint8Array;
  /** per side and radius: [left 0.3, 1, 3 km, right 0.3, 1, 3 km] (m) */
  range: Float64Array;
}

export function newProbe(): ProbeResult {
  return { s: 0, region: 0, pure: 1, eye: 0, sky: new Float64Array(6), layers: new Int32Array(6), shut: new Uint8Array(6), range: new Float64Array(6) };
}

const st = new SpineSample();
const tp = new TerrainPoint();
const bl = new BiomeBlend();
const theta = new Float64Array(N);

/** what one sees of the land at (x, z), the i-th distance along a ray: its height, or the water's over it */
function seen(world: World, x: number, z: number, i: number): number {
  world.shape(x, z, tp, PROBE_DISTANCES[i] >= PROBE_COARSE);
  return tp.wl > tp.bed ? tp.wl : tp.bed;
}

/** the layers of a ray's angle profile (see the file's header) */
export function layersOf(a: ArrayLike<number>, n = a.length): number {
  let run = -Infinity;
  let cand = NaN;
  let last = 0;
  let layers = 0;
  for (let i = 0; i < n; i++) {
    const t = a[i];
    if (t > run) {
      run = t;
      cand = t;
    } else if (cand === cand && t < cand - LAYER_DIP) {
      if (cand >= last + LAYER_RISE) {
        layers++;
        last = cand;
      }
      cand = NaN;
    }
  }
  return layers;
}

/** the probe at arc length s of a world's road */
export function probeAt(world: World, s: number, out: ProbeResult = newProbe()): ProbeResult {
  world.spine.at(s, st);
  const x0 = st.x;
  const z0 = st.z;
  const phi = st.phi;
  const eye = st.y + PROBE_EYE;
  out.s = s;
  out.eye = eye;
  world.spine.biomeAt(s, bl);
  out.region = bl.t < 0.5 ? bl.a : bl.b;
  out.pure = bl.t < 0.5 ? 1 - bl.t : bl.t;
  // (the ranges start from the road under the eye)
  const rlo = new Float64Array(6).fill(st.y);
  const rhi = new Float64Array(6).fill(st.y);
  const into = (side: number, i: number, h: number): void => {
    const d = PROBE_DISTANCES[i];
    for (let r = 0; r < 3; r++) {
      if (d > RANGE_RADII[r]) continue;
      const k = side * 3 + r;
      if (h < rlo[k]) rlo[k] = h;
      if (h > rhi[k]) rhi[k] = h;
    }
  };
  for (let ray = 0; ray < PROBE_RAYS.length; ray++) {
    const deg = PROBE_RAYS[ray];
    // (the road's right is its heading turned by +90°: d > 0 in World.shape)
    const az = phi + (deg * Math.PI) / 180;
    const cx = Math.cos(az);
    const cz = Math.sin(az);
    const side = deg < 0 ? 0 : 1;
    const ranged = deg === -60 || deg === 60 || deg === -90 || deg === 90;
    let nearMax = -Infinity;
    let farMax = -Infinity;
    let best = -Infinity;
    for (let i = 0; i < N; i++) {
      const d = PROBE_DISTANCES[i];
      const h = seen(world, x0 + cx * d, z0 + cz * d, i);
      const t = Math.atan2(h - eye, d) * DEG;
      theta[i] = t;
      if (t > best) best = t;
      if (d <= SHUT_AT) {
        if (t > nearMax) nearMax = t;
      } else if (t > farMax) farMax = t;
      if (ranged && i < N3) into(side, i, h);
    }
    out.sky[ray] = best;
    out.layers[ray] = layersOf(theta, N);
    out.shut[ray] = nearMax >= farMax ? 1 : 0;
  }
  for (const deg of RANGE_BACK) {
    const az = phi + (deg * Math.PI) / 180;
    const cx = Math.cos(az);
    const cz = Math.sin(az);
    const side = deg < 0 ? 0 : 1;
    for (let i = 0; i < N3; i++) {
      const d = PROBE_DISTANCES[i];
      into(side, i, seen(world, x0 + cx * d, z0 + cz * d, i));
    }
  }
  for (let k = 0; k < 6; k++) out.range[k] = rhi[k] - rlo[k];
  return out;
}

// ------------------------------------------------------------------------------------------------ journeys

/** one spot of a journey, as the report keeps it */
export interface Spot {
  region: number;
  /** the higher and the lower side's skyline (each the highest of its three rays, deg) */
  skyHi: number;
  skyLo: number;
  /** layers per ray (PROBE_RAYS order) */
  layers: number[];
  /** the ranges (m): the side with more and the side with less, at 0.3, 1 and 3 km */
  rangeHi: [number, number, number];
  rangeLo: [number, number, number];
  /** how many of the six rays are shut */
  shut: number;
}

export function spotOf(p: ProbeResult): Spot {
  const left = Math.max(p.sky[0], p.sky[1], p.sky[2]);
  const right = Math.max(p.sky[3], p.sky[4], p.sky[5]);
  const hiSide = p.range[2] >= p.range[5] ? 0 : 1;
  const r = (side: number): [number, number, number] => [p.range[side * 3], p.range[side * 3 + 1], p.range[side * 3 + 2]];
  let shut = 0;
  for (let i = 0; i < 6; i++) shut += p.shut[i];
  return { region: p.region, skyHi: Math.max(left, right), skyLo: Math.min(left, right), layers: Array.from(p.layers), rangeHi: r(hiSide), rangeLo: r(1 - hiSide), shut };
}

/**
 * The spots of a world's road between s0 and s1, `step` m apart, where the road is well inside one region (the
 * blend of two regions at a border is left out).
 */
export function spotsAlong(world: World, s0: number, s1: number, step: number, out: Spot[] = []): Spot[] {
  const p = newProbe();
  for (let s = s0; s < s1; s += step) {
    world.spine.biomeAt(s, bl);
    if (bl.t > 0.02 && bl.t < 0.98) continue;
    out.push(spotOf(probeAt(world, s, p)));
  }
  return out;
}

/** a world of version 2 begun in a region, with a long first chapter, and its spots within that chapter */
export function firstChapterSpots(seed: number, region: string, step: number, opts: WorldOptions = {}): Spot[] {
  const world = new World(seed, { worldVersion: 2, startBiome: region, chapterScale: 3, ...opts });
  return spotsAlong(world, 1000, world.spine.plan.starts[1] - 600, step);
}

/** a world of version 2 as its chapters are dealt, and its spots over the first `km` */
export function journeySpots(seed: number, km: number, step: number, opts: WorldOptions = {}): Spot[] {
  const world = new World(seed, { worldVersion: 2, ...opts });
  return spotsAlong(world, 1000, km * 1000, step);
}

/** the q-th quantile (0 … 1) of some numbers */
export function quantile(values: readonly number[], q: number): number {
  if (values.length === 0) return NaN;
  const a = values.slice().sort((p, r) => p - r);
  const i = Math.min(a.length - 1, Math.max(0, Math.round(q * (a.length - 1))));
  return a[i];
}

/** the shares the minimum targets of stage L1 are written in, over some spots */
export interface Shares {
  spots: number;
  /** spots with ≥ 1,000 m of range within 3 km on at least one side */
  range3Over1000: number;
  /** spots whose higher side's skyline is ≥ 15° */
  skyOver15: number;
  /** spots with both sides' skylines above 25° */
  bothOver25: number;
  /** rays at ±60° with ≥ 3 layers; all rays with ≥ 2 layers */
  layers3At60: number;
  layers2: number;
  /** spots whose range within 1 km (higher side) is 60–250 m; 10–60 m; 80–300 m */
  range1Hills: number;
  range1Plains: number;
  range1Dry: number;
  /** spots whose higher side's skyline is 4–12° */
  skyHills: number;
}

export function sharesOf(spots: readonly Spot[]): Shares {
  const n = spots.length || 1;
  let r3 = 0;
  let s15 = 0;
  let b25 = 0;
  let l60 = 0;
  let l2 = 0;
  let rh = 0;
  let rp = 0;
  let rd = 0;
  let sh = 0;
  for (const p of spots) {
    if (p.rangeHi[2] >= 1000) r3++;
    if (p.skyHi >= 15) s15++;
    if (p.skyLo > 25) b25++;
    if (p.layers[1] >= 3) l60++;
    if (p.layers[4] >= 3) l60++;
    for (const l of p.layers) if (l >= 2) l2++;
    const r1 = p.rangeHi[1];
    if (r1 >= 60 && r1 <= 250) rh++;
    if (r1 >= 10 && r1 <= 60) rp++;
    if (r1 >= 80 && r1 <= 300) rd++;
    if (p.skyHi >= 4 && p.skyHi <= 12) sh++;
  }
  return { spots: spots.length, range3Over1000: r3 / n, skyOver15: s15 / n, bothOver25: b25 / n, layers3At60: l60 / (2 * n), layers2: l2 / (6 * n), range1Hills: rh / n, range1Plains: rp / n, range1Dry: rd / n, skyHills: sh / n };
}

/** p10 / p50 / p90 of some numbers, as one short column */
function q3(values: readonly number[], digits = 0): string {
  return [0.1, 0.5, 0.9].map((q) => quantile(values, q).toFixed(digits)).join('/');
}

/** the report's table: a line a region */
export function reportTable(byRegion: ReadonlyMap<number, Spot[]>): string {
  const head = ['region', 'n', 'sky hi°', 'sky lo°', 'lay±30', 'lay±60', 'lay±90', 'r0.3 hi', 'r1 hi', 'r1 lo', 'r3 hi', 'r3 lo', 'shut/6', '≥1000@3', '≥15°', 'both>25°', '≥3@±60', '≥2 lay', 'r1 60–250', 'r1 10–60', 'sky 4–12'];
  const rows: string[][] = [head];
  for (const [region, spots] of [...byRegion.entries()].sort((a, b) => a[0] - b[0])) {
    const sh = sharesOf(spots);
    const pct = (v: number): string => `${Math.round(v * 100)}%`;
    const lay = (a: number, b: number): number[] => spots.flatMap((p) => [p.layers[a], p.layers[b]]);
    rows.push([
      BIOMES[region].id,
      String(spots.length),
      q3(spots.map((p) => p.skyHi), 1),
      q3(spots.map((p) => p.skyLo), 1),
      q3(lay(2, 3)),
      q3(lay(1, 4)),
      q3(lay(0, 5)),
      q3(spots.map((p) => p.rangeHi[0])),
      q3(spots.map((p) => p.rangeHi[1])),
      q3(spots.map((p) => p.rangeLo[1])),
      q3(spots.map((p) => p.rangeHi[2])),
      q3(spots.map((p) => p.rangeLo[2])),
      (spots.reduce((a, p) => a + p.shut, 0) / Math.max(1, spots.length)).toFixed(2),
      pct(sh.range3Over1000),
      pct(sh.skyOver15),
      pct(sh.bothOver25),
      pct(sh.layers3At60),
      pct(sh.layers2),
      pct(sh.range1Hills),
      pct(sh.range1Plains),
      pct(sh.skyHills),
    ]);
  }
  const w = head.map((_, c) => Math.max(...rows.map((r) => r[c].length)));
  return rows.map((r) => r.map((v, c) => (c === 0 ? v.padEnd(w[c]) : v.padStart(w[c]))).join('  ')).join('\n');
}

function group(spots: readonly Spot[], into: Map<number, Spot[]> = new Map()): Map<number, Spot[]> {
  for (const p of spots) {
    let list = into.get(p.region);
    if (!list) into.set(p.region, (list = []));
    list.push(p);
  }
  return into;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const seeds = Number(process.argv[2] ?? 6);
  const step = Number(process.argv[3] ?? 250);
  const km = Number(process.argv[4] ?? 300);
  const json = process.argv[5];
  const t0 = performance.now();
  const first = new Map<number, Spot[]>();
  for (const region of BIOMES) {
    for (let seed = 1; seed <= seeds; seed++) group(firstChapterSpots(seed, region.id, step), first);
  }
  const t1 = performance.now();
  const dealt = new Map<number, Spot[]>();
  for (let seed = 1; seed <= seeds; seed++) group(journeySpots(seed, km, step), dealt);
  const t2 = performance.now();
  console.log(`every region as the first chapter (chapter scale 3), ${seeds} seeds, a spot every ${step} m (${((t1 - t0) / 1000).toFixed(1)} s)`);
  console.log(reportTable(first));
  console.log(`\nas dealt over ${km} km, ${seeds} seeds, a spot every ${step} m (${((t2 - t1) / 1000).toFixed(1)} s)`);
  console.log(reportTable(dealt));
  if (json) {
    const dump = (m: Map<number, Spot[]>): Record<string, Shares & { p50: Record<string, number> }> => {
      const o: Record<string, Shares & { p50: Record<string, number> }> = {};
      for (const [r, spots] of m) {
        o[BIOMES[r].id] = { ...sharesOf(spots), p50: { skyHi: quantile(spots.map((p) => p.skyHi), 0.5), skyLo: quantile(spots.map((p) => p.skyLo), 0.5), range1Hi: quantile(spots.map((p) => p.rangeHi[1]), 0.5), range3Hi: quantile(spots.map((p) => p.rangeHi[2]), 0.5) } };
      }
      return o;
    };
    fs.writeFileSync(json, JSON.stringify({ seeds, step, km, first: dump(first), dealt: dump(dealt) }, null, 1) + '\n');
  }
}
