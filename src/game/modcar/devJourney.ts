/**
 * The journey as its world has dealt it, for the developer's panel (devWorld.ts, the 传送 tab of devPanes.ts):
 * the regions that come next along the road with how much each asks of the traveller, and where the next
 * chapter of a given region begins. Read off the world's chapter plan, which deals as far as it is asked:
 * nothing here lays out road or land. Plain functions of the world (harness/sim/v3_dev_journey.test.ts).
 */
import { BIOMES } from '../../core/world/biomes';
import type { World } from '../../core/world/terrain';

/** how much a region asks of the traveller (core/world/biomes.ts RegionDef.intensity; a region that does not say is calm) */
export type Intensity = 'calm' | 'scenic' | 'highlight';

export const INTENSITIES: readonly Intensity[] = ['calm', 'scenic', 'highlight'];

/** what each is called */
export const INTENSITY_ZH: Readonly<Record<Intensity, string>> = { calm: '舒缓', scenic: '有看点', highlight: '高潮' };

/** one chapter of the journey: a region and the stretch of road it runs for */
export interface JourneyStop {
  /** the chapter's number along the road, from 0 */
  chapter: number;
  /** its region: the index into BIOMES, the id, the label */
  region: number;
  id: string;
  label: string;
  intensity: Intensity;
  /** where along the road it begins, and how long it is (m) */
  start: number;
  length: number;
}

/** how far into a region's chapter the developer is set down (m): past the border itself, still where the two regions blend */
export const REGION_ENTRY = 300;
/** how many chapters ahead a region is looked for */
export const REGION_SEARCH = 400;

export function intensityOf(region: number): Intensity {
  return BIOMES[region]?.intensity ?? 'calm';
}

/** chapter c of a world's journey */
function stopAt(world: World, c: number): JourneyStop {
  const plan = world.spine.plan;
  // (the plan deals as far as chapter c + 1, so that both ends of c are known)
  const region = plan.biomeOf(c);
  plan.biomeOf(c + 1);
  const def = BIOMES[region];
  return { chapter: c, region, id: def.id, label: def.label, intensity: intensityOf(region), start: plan.starts[c], length: plan.starts[c + 1] - plan.starts[c] };
}

/** the next n chapters of the journey from arc length s on: the one s lies in, and those after it */
export function journeyFrom(world: World, s: number, n: number): JourneyStop[] {
  const c0 = world.spine.plan.chapterAt(Math.max(0, s));
  const out: JourneyStop[] = [];
  for (let c = c0; c < c0 + n; c++) out.push(stopAt(world, c));
  return out;
}

/** how many of some chapters are of each intensity */
export function journeyTotals(stops: readonly JourneyStop[]): Record<Intensity, number> {
  const t: Record<Intensity, number> = { calm: 0, scenic: 0, highlight: 0 };
  for (const x of stops) t[x.intensity]++;
  return t;
}

/** does this world deal the region at all (a world knows the first `regionCount` regions of the registry: core/world/rules.ts) */
export function worldKnows(world: World, region: number): boolean {
  return region >= 0 && region < world.rules.regionCount;
}

/**
 * The next chapter of a region ahead of arc length s — after the chapter s lies in, among the next `within`
 * chapters; null when none of them is of that region.
 */
export function nextChapterOf(world: World, region: number, s: number, within = REGION_SEARCH): JourneyStop | null {
  if (!worldKnows(world, region)) return null;
  const plan = world.spine.plan;
  const c0 = plan.chapterAt(Math.max(0, s));
  for (let c = c0 + 1; c <= c0 + within; c++) if (plan.biomeOf(c) === region) return stopAt(world, c);
  return null;
}
