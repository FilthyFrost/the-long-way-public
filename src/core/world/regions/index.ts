/**
 * The regions added to the world after its first six (biomes.ts): one file to a region in this folder,
 * and this list of them. biomes.ts puts the list after the six to make the registry, BIOMES.
 *
 * APPEND ONLY. A region's place in this list fixes its index in the registry, and that index is the
 * region's identity: the chapter plan deals it, a world's region count counts up to it, a save relies on
 * it, and it seeds the noise of the land and of the weather. A new region goes at the END of the list and
 * nowhere else; an entry is never taken out, moved or replaced by another, or every world that knew it
 * becomes a different world. (Worlds of version 1 know the first six only, whatever stands here.)
 *
 * A region's file is data: it takes its types from the other modules of the world (RegionDef, and the
 * kinds of surface from ground.ts) and loads none of them to run. The registry is put together before the
 * road, the rules and the land exist, and a region that loaded any of those would be loading them in a
 * circle (harness/sim/world_registry.test.ts watches for it).
 */
import type { RegionDef } from '../biomes';
import { BAMBOO_SEA } from './bamboo_sea';
import { FLOWER_FIELDS } from './flower_fields';
import { KARST_PEAKS } from './karst_peaks';
import { RED_CANYON } from './red_canyon';
import { TERRACES } from './terraces';
import { WETLAND } from './wetland';

export const ADDED_REGIONS: readonly RegionDef[] = [
  // the first six (docs/V3/nodes/W1-worldgen.md, step W1.3): registry indices 6 to 11
  FLOWER_FIELDS,
  TERRACES,
  WETLAND,
  BAMBOO_SEA,
  RED_CANYON,
  KARST_PEAKS,
];
