/**
 * How wooded a spot is in a world of version 2, for everything that paints woods instead of standing trees:
 * the ground's crown masses, the lift of the far land's surface, the far-woods cards (worldBuild.ts).
 *
 * It is the ecotope's canopy (core/world/ecotope.ts), so that what is painted far off is what stands there
 * near. The trees themselves read it from the ecotope's tiles; the paint cannot — a tile is 128 m, the land
 * is painted to 20 km — so this file asks the core's own canopy function at the point itself, with what an
 * ecotope node is given: the regions that meet there, the road's distance, the relief, the water's edge by the
 * waters' own account, the view a coast road keeps. At a node of the ecotope's grid it is the tile's number.
 * (The slope is the caller's: an ecotope node measures it over 16 m, a far vertex has only its own coarse
 * grid. See woodOnSlope.)
 *
 * Also the height a region's woods stand to, from its flora table: how far the far land is lifted under them.
 */
import { BIOMES, regionSalt } from '../../core/world/biomes';
import { ROAD_CLEAR, WATER_FAR, WOOD_SHEER, WOOD_STEEP, canopyAt, shoreOf, treeLine, type EcoParams, type ShoreReader } from '../../core/world/ecotope';
import { floraTableOf } from '../../core/world/floraTables';
import { plantDef } from '../../core/world/plants';
import { TerrainPoint, type World } from '../../core/world/terrain';
import { SpineSample } from '../../core/world/spine';
import { inVentClearing, ventsNear } from '../../core/world/earth/geothermal';

/** (scratch for a geothermal field's vents: their planning shapes the land, the caller's point must stay) */
const ventTp = new TerrainPoint();
const ventSs = new SpineSample();

const params: EcoParams[] = [];
const paramsFor: string[] = [];
const heights: number[] = [];

/** a region's ecotope parameters by its registry index (looked up again when another region stands at that index: tests put regions in and take them out) */
function ecoOf(region: number): EcoParams {
  const b = BIOMES[region] ?? BIOMES[0];
  if (paramsFor[region] !== b.id) {
    paramsFor[region] = b.id;
    const t = floraTableOf(b.id, b.kin);
    params[region] = t.eco;
    // the height its woods stand to: the trees of its woods (the rules that ask for canopy), by their numbers
    let sum = 0;
    let n = 0;
    for (const r of t.trees) {
      if (!r.canopy || r.canopy[0] < 0.2) continue;
      const size = r.size ? (r.size[0] + r.size[1]) / 2 : 0.975;
      sum += r.perHa * plantDef(r.plant).height * size;
      n += r.perHa;
    }
    heights[region] = n > 0 ? sum / n : 0;
  }
  return params[region];
}

/** how tall the trees of a region's woods stand (m; 0: it has no woods) */
export function woodHeight(region: number): number {
  ecoOf(region);
  return heights[region];
}

const shores = new WeakMap<World, ShoreReader>();
const shoreOut = { dist: WATER_FAR, kind: 0 };

function smooth(t: number): number {
  return t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t);
}

/** how much of its wood a slope keeps (rise over run): all of it to WOOD_STEEP, none from WOOD_SHEER — the last thing the core's canopy is multiplied by */
export function woodOnSlope(slope: number, cling = 1): number {
  if (slope >= WOOD_SHEER * cling) return 0;
  return slope > WOOD_STEEP * cling ? 1 - smooth((slope - WOOD_STEEP * cling) / ((WOOD_SHEER - WOOD_STEEP) * cling)) : 1;
}

/** how steep the woods of the land at a shaped point still grow (EcoParams.cling: a wet karst's cling to its towers) */
export function clingOf(t: TerrainPoint): number {
  const a = ecoOf(t.ba).cling ?? 1;
  if (t.bt <= 0 || t.bb === t.ba) return a;
  return a + ((ecoOf(t.bb).cling ?? 1) - a) * t.bt;
}

/**
 * The canopy at a shaped point of a world of version 2, 0 … 1, on level ground: times woodOnSlope(its slope)
 * it is what an ecotope node there holds. `t` is the land at (x, z) as World.shape gave it (the coarse land
 * too: it knows no lakes, and woods are then painted across them as the first renderer painted them).
 */
export function canopyOf(world: World, t: TerrainPoint, x: number, z: number): number {
  const ad = t.d < 0 ? -t.d : t.d;
  if (ad < ROAD_CLEAR || t.zone !== 0 || t.wl > t.bed + 0.02) return 0;
  // (V5: a geothermal field's springs and vents stand in the open — no wood painted over them, nor the land lifted)
  if (world.earth) {
    const v = ventsNear(world, t.s, x, z, 0, ventTp, ventSs);
    if (v.length && inVentClearing(v, x, z)) return 0;
  }
  const pa = ecoOf(t.ba);
  const pb = t.bt > 0 && t.bb !== t.ba ? ecoOf(t.bb) : null;
  let wd = WATER_FAR;
  if (pa.thirsty > 0 || (pb !== null && pb.thirsty > 0)) {
    let shore = shores.get(world);
    if (!shore) shores.set(world, (shore = shoreOf(world)));
    shore(x, z, shoreOut);
    if (shoreOut.dist < WATER_FAR) wd = shoreOut.dist;
  }
  // (the tree line of a world of version 2 by the height above the sea: ecotope.ts treeLine)
  const alt = world.spine.altitude(t.bed);
  let c = canopyAt(pa, world.seed + regionSalt(t.ba) * 131, x, z, ad, t.relief, wd, 0, treeLine(world, t.ba, t.relief, alt));
  if (pb !== null) c += (canopyAt(pb, world.seed + regionSalt(t.bb) * 131, x, z, ad, t.relief, wd, 0, treeLine(world, t.bb, t.relief, alt)) - c) * t.bt;
  // a coast road keeps its view: between the road and the sea nothing tall grows
  return c > 0 ? c * (1 - world.sea.open(t.s, t.d)) : 0;
}
