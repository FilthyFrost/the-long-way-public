/** Neighbouring landscapes of the same watershed or mountain flank. Distances are game-scale ecotones in metres.
 * Each corridor can be travelled in either direction. Keep seasonal/climate profiles independent of the dealer. */
import { ECO_PROFILES } from './data/ecoProfiles';
import { hash2 } from '../math/rng';
import type { LandKind } from './landform';

const corridors: readonly [string, number, string[]][] = [
  ['plains', 1200, ['forest', 'maple', 'lakes', 'wetland', 'terraces']],
  ['plains', 450, ['flower_fields']],
  ['plains', 3000, ['desert', 'red_canyon']],
  ['flower_fields', 1300, ['karst_peaks']],
  ['desert', 1100, ['red_canyon']],
  ['forest', 2600, ['alpine']],
  ['maple', 2800, ['alpine']],
  ['lakes', 3000, ['alpine']],
  ['forest', 1000, ['lakes', 'wetland', 'maple', 'flower_fields', 'terraces']],
  ['lakes', 750, ['wetland', 'flower_fields', 'maple']],
  ['flower_fields', 800, ['terraces', 'maple', 'wetland']],
  ['terraces', 1100, ['bamboo_sea', 'karst_peaks', 'wetland']],
  ['wetland', 1600, ['karst_peaks', 'bamboo_sea']],
  ['bamboo_sea', 950, ['karst_peaks']],
];
const borders = new Map<string, Map<string, number>>();
function connect(a: string, b: string, m: number): void {
  if (!borders.has(a)) borders.set(a, new Map());
  borders.get(a)!.set(b, m);
}
for (const [a, m, neighbours] of corridors) for (const b of neighbours) {
  connect(a, b, m);
  connect(b, a, m);
}
// An existing game's region is a landscape analogue, not a simulation of its reference country's climate.
const analogues: Readonly<Record<string, string>> = {
  plains: 'shenandoah-farm', desert: 'sonoran', red_canyon: 'redrock',
  forest: 'sierra-valley', alpine: 'sierra-high', maple: 'appalachian',
  lakes: 'fiordland', terraces: 'south-china-paddy', bamboo_sea: 'karst-river',
  karst_peaks: 'karst-river', flower_fields: 'blue-meadow', wetland: 'eglinton-grass',
};
const profiles = new Map(ECO_PROFILES.map(p => [p.id, p]));
export function snowLinesFor(id: string): readonly number[] {
  const profile = profiles.get(analogues[id] ?? id);
  return [0, 1, 2, 3].map(i => profile?.snowlineM[i] ?? 100000);
}
// An authored transition takes precedence over a generic ecotone. A self-edge varies habitat within
// its local landscape; it cannot by itself connect unrelated biomes using the same broad analogue.
for (const [from, profileId] of Object.entries(analogues)) {
  for (const edge of profiles.get(profileId)!.transitions) {
    if (edge.to === profileId) continue;
    for (const [to, nextId] of Object.entries(analogues)) {
      if (nextId === edge.to) connect(from, to, edge.widthM);
    }
  }
}
/** Compress each reference road's real extent into the chapter budget on a logarithmic scale. */
export function referenceSlots(id: string, roll: number): number | undefined {
  const profile = profiles.get(analogues[id]);
  if (!profile) return undefined;
  const [lo, hi] = profile.typicalStretchKm;
  const distance = lo + (hi - lo) * roll;
  return 6 + Math.min(2, Math.floor(Math.log1p(distance) / Math.log(60) * 3));
}
export const MAX_BORDER_WIDTH = Math.max(...Array.from(borders.values()).flatMap(row => [...row.values()]));
export function hasRouteProfile(id: string): boolean { return borders.has(id); }
export function borderWidth(a: string, b: string, regionCount = Infinity): number | undefined {
  // In an early three-region registry, the foothill forest cannot take a chapter of its own.
  if (regionCount === 3 && ((a === 'plains' && b === 'alpine') || (b === 'plains' && a === 'alpine'))) return 4200;
  return borders.get(a)?.get(b);
}

/** One choice per stretch, shared by the road and the surrounding land. Water and quiet runs have precedence.
 * A repeated entry makes a characteristic setting more frequent. */
const settings: Readonly<Record<string, readonly LandKind[]>> = {
  alpine: ['valley', 'hillside', 'ridge', 'hillside'],
  plains: ['open', 'ridge', 'hillside', 'open'],
  desert: ['open', 'ridge', 'open', 'hillside', 'canyon', 'valley'],
  forest: ['valley', 'hillside', 'open', 'valley'],
  lakes: ['open', 'hillside', 'ridge'],
  maple: ['hillside', 'ridge', 'valley'],
  flower_fields: ['open', 'ridge', 'open', 'hillside'],
  terraces: ['hillside', 'valley', 'open', 'hillside', 'valley', 'ridge', 'hillside', 'hillside'],
  wetland: ['open', 'hillside', 'open', 'open'],
  bamboo_sea: ['valley', 'hillside', 'valley', 'ridge'],
  red_canyon: ['canyon', 'ridge', 'open', 'canyon'],
  karst_peaks: ['open', 'valley', 'open', 'hillside'],
};
export function routeSetting(seed: number, k: number, region: string): LandKind {
  const row = settings[region];
  if (!row || k < 1) return 'open';
  return row[(hash2(k, 0x5341, seed) >>> 8) % row.length];
}
