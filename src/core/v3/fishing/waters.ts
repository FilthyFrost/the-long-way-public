/**
 * The waters as an angler sees them (node F1, docs/V3/nodes/F1-fishing.md "水域" and "钓点好不好"): which class
 * of water a point of water belongs to (the table of fish is by class), the water's own number (each water
 * brings its fish in an order of its own: bite.ts castBite), how deep it is, whether it is frozen over, and
 * how good a spot it is to cast into.
 *
 * What makes a spot good (0 … 1), from the world's own geometry and plants:
 *   - a drop-off: where the bed falls away (the depth changes fast across a few metres), fish wait;
 *   - weed: reeds and water plants within a dozen metres (the flora field's, in worlds of version 2);
 *   - structure: under and beside a bridge;
 *   - and some luck of the place (a hashed number for every 16 m cell of water): a spot is good or not for
 *     ever, so a player who finds one can come back to it.
 * The common fish are everywhere in their water, the rare keep to good spots, a legend to the very best
 * (bite.ts biteWeight).
 *
 * Pure; it asks the land function a handful of times a cast, never per frame.
 */
import { hash2 } from '../../math/rng';
import { BIOMES } from '../../world/biomes';
import { LAYER_GROUND, LAYER_SHRUB } from '../../world/flora';
import { PLANTS } from '../../world/plants';
import type { TerrainPoint, World } from '../../world/terrain';
import { WATER_SLOT, WaterPlan, type Lake, type River } from '../../world/water';
import type { WaterClass } from './types';

/** a lake whose long half-axis is no more than this (m) is a pond */
export const POND_HALF = 90;
/** water shallower than this (m) is a margin: no fish worth the name stand in it */
export const MARGIN_DEPTH = 0.35;

/** what a point of water is to an angler (waterAt fills one of these) */
export class WaterAt {
  /** null: not water (or too shallow to fish) */
  cls: WaterClass | null = null;
  /** the water's own number: the same for every point of one lake, one river, one stretch of sea */
  id = 0;
  ice = false;
  /** m of water over the bed */
  depth = 0;
  /** how good a spot it is, 0 … 1 */
  spot = 0;
  /** the parts of the spot, for the developer's panel: drop-off, weed, structure, the place's own luck */
  dropOff = 0;
  weed = 0;
  structure = 0;
  luck = 0;
}

/** which plants are weed to an angler (reeds and the plants of the water) */
const WEED = new Uint8Array(PLANTS.length);
for (let i = 0; i < PLANTS.length; i++) if (PLANTS[i].aquatic || PLANTS[i].id === 'reed') WEED[i] = 1;

function smooth(t: number): number {
  return t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t);
}

/** the lake or river feature a point of fresh water belongs to (null: none found) */
function featureAt(world: World, x: number, z: number, s0: number, kind: 1 | 2): Lake | River | null {
  const k0 = Math.floor(s0 / WATER_SLOT);
  let best: Lake | River | null = null;
  let bestD = Infinity;
  for (let k = k0 - 3; k <= k0 + 3; k++) {
    const f = world.water.feature(k);
    if (!f) continue;
    if (kind === 1 && f.kind === 'lake') {
      if (x < f.xMin || x > f.xMax || z < f.zMin || z > f.zMax) continue;
      const d = Math.hypot(x - f.cx, z - f.cz);
      if (d < bestD) {
        bestD = d;
        best = f;
      }
    } else if (kind === 2 && f.kind === 'river') {
      if (x < f.xMin || x > f.xMax) continue;
      // (the river whose water the point is nearest: 0 or less inside its water)
      const d = WaterPlan.riverShore(f, x, z);
      if (d < bestD) {
        bestD = d;
        best = f;
      }
    }
  }
  return best;
}

/**
 * What the point (x, z) is to an angler. `tp` is a scratch point the caller owns (the land function writes
 * it). A point that is not water, or is a margin shallower than MARGIN_DEPTH, has no class.
 */
export function waterAt(world: World, x: number, z: number, tp: TerrainPoint, out: WaterAt): WaterAt {
  out.cls = null;
  out.id = 0;
  out.ice = false;
  out.depth = 0;
  out.spot = out.dropOff = out.weed = out.structure = out.luck = 0;
  world.shape(x, z, tp);
  const depth = tp.wl - tp.bed;
  if (!(depth > MARGIN_DEPTH)) return out;
  out.depth = depth;
  out.ice = tp.frozen > 0.5;
  const region = BIOMES[tp.bt < 0.5 ? tp.ba : tp.bb];
  const id = region.id;
  const kin = region.kin;
  const s0 = world.spine.sAtX(x);
  if (tp.wkind === 3) {
    out.cls = 'sea';
    out.id = world.spine.plan.chapterAt(s0) * 4 + 3;
  } else if (tp.wkind === 2) {
    const f = featureAt(world, x, z, s0, 2);
    out.cls = kin === 'alpine' ? 'tarn' : 'river';
    out.id = (f ? f.slot : Math.floor(s0 / WATER_SLOT)) * 4 + 2;
  } else {
    const f = featureAt(world, x, z, s0, 1) as Lake | null;
    out.id = (f ? f.slot : Math.floor(s0 / WATER_SLOT)) * 4 + 1;
    if (kin === 'alpine' || id === 'alpine') out.cls = 'tarn';
    else if (id === 'wetland') out.cls = 'marsh';
    else if (kin === 'desert') out.cls = 'oasis';
    else out.cls = f && f.a > POND_HALF ? 'lake' : 'pond';
  }
  spotOf(world, x, z, depth, tp, out);
  return out;
}

/** a drop-off: how fast the bed falls away round the point (the depth's spread across 8 m), 0 … 1 */
function dropOffAt(world: World, x: number, z: number, depth: number, tp: TerrainPoint): number {
  let lo = depth;
  let hi = depth;
  for (let i = 0; i < 4; i++) {
    const ax = i === 0 ? 4 : i === 1 ? -4 : 0;
    const az = i === 2 ? 4 : i === 3 ? -4 : 0;
    world.shape(x + ax, z + az, tp);
    const d = tp.wl > -Infinity ? Math.max(0, tp.wl - tp.bed) : 0;
    if (d < lo) lo = d;
    if (d > hi) hi = d;
  }
  return smooth(((hi - lo) / 8 - 0.04) / 0.22);
}

/** weed within 12 m: reeds and plants of the water, from the flora field (worlds of version 2), 0 … 1 */
function weedAt(world: World, x: number, z: number): number {
  const flora = world.flora;
  if (!flora) return 0;
  let n = 0;
  const r2 = 12 * 12;
  const tx = Math.floor(x / 128);
  const tz = Math.floor(z / 128);
  for (const layer of [LAYER_SHRUB, LAYER_GROUND] as const) {
    for (let j = tz - 1; j <= tz + 1; j++) {
      for (let i = tx - 1; i <= tx + 1; i++) {
        // only tiles the 12 m round reaches
        if ((i + 1) * 128 < x - 12 || i * 128 > x + 12 || (j + 1) * 128 < z - 12 || j * 128 > z + 12) continue;
        const t = flora.tile(layer, i, j);
        for (let k = 0; k < t.n; k++) {
          if (!WEED[t.plant[k]]) continue;
          const dx = t.x[k] - x;
          const dz = t.z[k] - z;
          if (dx * dx + dz * dz <= r2) n++;
        }
      }
    }
  }
  return n >= 3 ? 1 : n / 3;
}

/** structure: under or beside a bridge (within 30 m of its span along the road, and in the river), 0 … 1 */
function structureAt(world: World, x: number, z: number, river: boolean): number {
  if (!river) return 0;
  const s0 = world.spine.sAtX(x);
  const k0 = Math.floor(s0 / WATER_SLOT);
  for (let k = k0 - 1; k <= k0 + 1; k++) {
    const f = world.water.feature(k);
    if (!f || f.kind !== 'river') continue;
    // the bridge stands where the river passes under the road: near its crossing point
    const d = Math.hypot(x - f.x0, z - f.z0);
    if (d < 45) return 1 - smooth((d - 15) / 30);
  }
  return 0;
}

function spotOf(world: World, x: number, z: number, depth: number, tp: TerrainPoint, out: WaterAt): void {
  out.dropOff = dropOffAt(world, x, z, depth, tp);
  out.weed = weedAt(world, x, z);
  out.structure = structureAt(world, x, z, out.cls === 'river' || (out.cls === 'tarn' && (out.id & 3) === 2));
  // the place's own luck: one number for every 16 m cell of water, for ever
  out.luck = ((hash2(Math.floor(x / 16), Math.floor(z / 16), world.seed ^ 0xf15a) >>> 8) & 0xffff) / 65535;
  const s = 0.18 + 0.3 * out.dropOff + 0.2 * out.weed + 0.2 * out.structure + 0.3 * out.luck * out.luck;
  out.spot = s < 0 ? 0 : s > 1 ? 1 : s;
}
