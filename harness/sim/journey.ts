/**
 * What a journey through a world of version 2 is made of, region by region and stretch by stretch: which
 * regions come and for how long, how much each asks of the traveller, where the quiet runs lie, how many
 * stretches hold a lake, a river, a place to stop, a cluster of landforms, how far it is from one filling
 * station to the next. Read off the world's plans alone (nothing is driven).
 *
 *   npx tsx harness/sim/journey.ts [seeds = 12] [km = 300] [first seed = 1]
 *
 * prints the journey of each seed in a line a region and the sums over all of them; `journey()` gives the
 * same as numbers (harness/sim/v3_world_gen.test.ts holds a few of them to what a gentle journey needs).
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BIOMES } from '../../src/core/world/biomes';
import { cardOf, type Intensity } from '../../src/core/world/dealer';
import { World, type WorldOptions } from '../../src/core/world/terrain';

/** the speed a journey is timed at (km/h): an unhurried drive with the odd stop left out */
export const JOURNEY_KMH = 65;

export interface RegionLeg {
  chapter: number;
  id: string;
  intensity: Intensity;
  /** its first stretch and how many it runs for */
  k0: number;
  stretches: number;
  minutes: number;
  /** stretches of it that are quiet, hold a lake, a river, a place to stop, a filling station, a cluster of landforms, a coast */
  quiet: number;
  lakes: number;
  rivers: number;
  places: number;
  stations: number;
  clusters: number;
  landforms: number;
  coast: number;
  /** one letter a stretch: the lie of the land (o h v r c), then q quiet, L lake, R river, p place, S filling station, F cluster, ~ coast */
  programme: string;
}

export interface Journey {
  seed: number;
  km: number;
  legs: RegionLeg[];
  /** how far the first filling station is from the start, and the longest way from one to the next (km) */
  firstStationKm: number;
  stationGapKm: number;
  /** the longest run of stretches with no place to stop (stretches) */
  longestWithoutPlace: number;
}

/** the journey of one world over its first `km` kilometres (whole regions only: the one the distance ends in is left out) */
export function journey(seed: number, km = 300, opts: WorldOptions = { worldVersion: 2 }): Journey {
  const world = new World(seed, opts);
  const plan = world.spine.plan;
  const slot = world.rules.slot;
  const last = plan.chapterAt(km * 1000);
  const legs: RegionLeg[] = [];
  let lastStation = NaN;
  let firstStationKm = NaN;
  let stationGapKm = 0;
  let noPlace = 0;
  let longestWithoutPlace = 0;
  for (let c = 0; c < last; c++) {
    const region = BIOMES[plan.biomes[c]];
    const k0 = Math.round(plan.starts[c] / slot);
    const k1 = Math.round(plan.starts[c + 1] / slot);
    const leg: RegionLeg = { chapter: c, id: region.id, intensity: cardOf(region, plan.biomes[c]).intensity, k0, stretches: k1 - k0, minutes: (((k1 - k0) * slot) / 1000 / JOURNEY_KMH) * 60, quiet: 0, lakes: 0, rivers: 0, places: 0, stations: 0, clusters: 0, landforms: 0, coast: 0, programme: '' };
    for (let k = k0; k < k1; k++) {
      let p = world.land.kindOf(k)[0];
      if (world.quiet(k)) {
        leg.quiet++;
        p += 'q';
      }
      const water = world.water.feature(k);
      if (water) {
        if (water.kind === 'lake') leg.lakes++;
        else leg.rivers++;
        p += water.kind === 'lake' ? 'L' : 'R';
      }
      if (world.sea.coastOf(k)) {
        leg.coast++;
        p += '~';
      }
      const place = world.sites.placeOf(k);
      if (place) {
        leg.places++;
        noPlace = 0;
        if (place.kind === 'station') {
          leg.stations++;
          const at = place.s / 1000;
          if (Number.isNaN(lastStation)) firstStationKm = at;
          else if (at - lastStation > stationGapKm) stationGapKm = at - lastStation;
          lastStation = at;
        }
        p += place.kind === 'station' ? 'S' : 'p';
      } else {
        noPlace++;
        if (noPlace > longestWithoutPlace) longestWithoutPlace = noPlace;
      }
      const cluster = world.features ? world.features.of(k).length : 0;
      if (cluster > 0) {
        leg.clusters++;
        leg.landforms += cluster;
        p += 'F';
      }
      leg.programme += p + ' ';
    }
    legs.push(leg);
  }
  return { seed, km, legs, firstStationKm, stationGapKm, longestWithoutPlace };
}

/** the sums over several journeys */
export interface JourneySums {
  journeys: number;
  regions: number;
  stretches: number;
  /** regions of each kind, and of each intensity (by regions and by stretches) */
  byRegion: Record<string, number>;
  byIntensity: Record<Intensity, number>;
  stretchesByIntensity: Record<Intensity, number>;
  /** kinds of country met in one journey: the fewest and the most */
  kindsMin: number;
  kindsMax: number;
  minutesMin: number;
  minutesMean: number;
  minutesMax: number;
  quiet: number;
  lakes: number;
  rivers: number;
  places: number;
  stations: number;
  clusters: number;
  landforms: number;
  coast: number;
  /** regions after the first without their quiet run */
  regionsWithoutQuiet: number;
  firstStationKmMax: number;
  stationGapKmMax: number;
  longestWithoutPlace: number;
}

export function journeySums(js: readonly Journey[]): JourneySums {
  const s: JourneySums = {
    journeys: js.length,
    regions: 0,
    stretches: 0,
    byRegion: {},
    byIntensity: { calm: 0, scenic: 0, highlight: 0 },
    stretchesByIntensity: { calm: 0, scenic: 0, highlight: 0 },
    kindsMin: Infinity,
    kindsMax: 0,
    minutesMin: Infinity,
    minutesMean: 0,
    minutesMax: 0,
    quiet: 0,
    lakes: 0,
    rivers: 0,
    places: 0,
    stations: 0,
    clusters: 0,
    landforms: 0,
    coast: 0,
    regionsWithoutQuiet: 0,
    firstStationKmMax: 0,
    stationGapKmMax: 0,
    longestWithoutPlace: 0,
  };
  for (const j of js) {
    const kinds = new Set<string>();
    for (const l of j.legs) {
      kinds.add(l.id);
      s.regions++;
      s.stretches += l.stretches;
      s.byRegion[l.id] = (s.byRegion[l.id] ?? 0) + 1;
      s.byIntensity[l.intensity]++;
      s.stretchesByIntensity[l.intensity] += l.stretches;
      s.minutesMean += l.minutes;
      if (l.minutes < s.minutesMin) s.minutesMin = l.minutes;
      if (l.minutes > s.minutesMax) s.minutesMax = l.minutes;
      s.quiet += l.quiet;
      s.lakes += l.lakes;
      s.rivers += l.rivers;
      s.places += l.places;
      s.stations += l.stations;
      s.clusters += l.clusters;
      s.landforms += l.landforms;
      s.coast += l.coast;
      if (l.chapter > 0 && l.quiet !== 2) s.regionsWithoutQuiet++;
    }
    if (kinds.size < s.kindsMin) s.kindsMin = kinds.size;
    if (kinds.size > s.kindsMax) s.kindsMax = kinds.size;
    if (j.firstStationKm > s.firstStationKmMax) s.firstStationKmMax = j.firstStationKm;
    if (j.stationGapKm > s.stationGapKmMax) s.stationGapKmMax = j.stationGapKm;
    if (j.longestWithoutPlace > s.longestWithoutPlace) s.longestWithoutPlace = j.longestWithoutPlace;
  }
  s.minutesMean /= Math.max(1, s.regions);
  return s;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const seeds = Number(process.argv[2] ?? 12);
  const km = Number(process.argv[3] ?? 300);
  const first = Number(process.argv[4] ?? 1);
  const js: Journey[] = [];
  for (let seed = first; seed < first + seeds; seed++) {
    const j = journey(seed, km);
    js.push(j);
    console.log(`seed ${seed}: ${j.legs.length} regions, first filling station at ${j.firstStationKm.toFixed(1)} km, longest way between two ${j.stationGapKm.toFixed(1)} km, longest without a place ${j.longestWithoutPlace} stretches`);
    for (const l of j.legs) console.log(`  ${String(l.chapter).padStart(2)} ${l.id.padEnd(14)} ${l.intensity.padEnd(7)} ${String(l.stretches)} stretches ${l.minutes.toFixed(1).padStart(5)} min  ${l.programme}`);
  }
  const s = journeySums(js);
  const pct = (a: number, b: number): string => `${((100 * a) / b).toFixed(1)} %`;
  console.log(`\n${s.journeys} journeys of ${km} km: ${s.regions} regions, ${s.stretches} stretches`);
  console.log(`kinds of country met in one journey: ${s.kindsMin} to ${s.kindsMax} of ${BIOMES.length}`);
  console.log(`regions by kind: ${Object.entries(s.byRegion).sort((a, b) => b[1] - a[1]).map(([id, n]) => `${id} ${n}`).join(', ')}`);
  console.log(`by intensity (regions): calm ${pct(s.byIntensity.calm, s.regions)}, scenic ${pct(s.byIntensity.scenic, s.regions)}, highlight ${pct(s.byIntensity.highlight, s.regions)}; (stretches): calm ${pct(s.stretchesByIntensity.calm, s.stretches)}, scenic ${pct(s.stretchesByIntensity.scenic, s.stretches)}`);
  console.log(`minutes a region at ${JOURNEY_KMH} km/h: ${s.minutesMin.toFixed(1)} to ${s.minutesMax.toFixed(1)}, mean ${s.minutesMean.toFixed(1)}`);
  console.log(`stretches: quiet ${pct(s.quiet, s.stretches)}, with a lake ${pct(s.lakes, s.stretches)}, a river ${pct(s.rivers, s.stretches)}, a place ${pct(s.places, s.stretches)} (filling stations ${s.stations}), a cluster of landforms ${pct(s.clusters, s.stretches)} (${s.landforms} landforms), on the coast ${pct(s.coast, s.stretches)}`);
  console.log(`regions after the first without a quiet run of two: ${s.regionsWithoutQuiet}`);
  console.log(`first filling station at most ${s.firstStationKmMax.toFixed(1)} km from the start; longest way between two ${s.stationGapKmMax.toFixed(1)} km; longest run without a place ${s.longestWithoutPlace} stretches`);
}
