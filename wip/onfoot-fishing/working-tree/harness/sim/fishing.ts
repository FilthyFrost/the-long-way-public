/**
 * Fishing measured headless (docs/DESIGN_V2.md 8.4) for specs/activities/fishing.json, and the
 * shared set-up the tests use: seed 7's jetty, a robot angler at the end of it.
 *
 *   npx tsx harness/sim/fishing.ts        prints the metrics
 */
import { Angling, BITE_WINDOW, BITE_WINDOW_RARE, CAST_MAX, CAST_MIN, FISH_STEP, SNAP_FULL, type RodTip } from '../../src/core/fishing/angling';
import { Angler, type AnglerKind } from '../../src/core/fishing/angler';
import { School, type FishEnv, type Zone } from '../../src/core/fishing/school';
import { FAIR, SPECIES, speciesFor } from '../../src/core/fishing/species';
import type { Site } from '../../src/core/world/sites';
import { World } from '../../src/core/world/terrain';

export const JETTY_SEED = 7;

/** seed 7's jetty and where one stands at the end of it, facing out */
export function jetty(world = new World(JETTY_SEED)): { world: World; site: Site; zone: Zone; stand: RodTip } {
  const out: Site[] = [];
  world.sites.between(2500, 3800, out);
  const site = out.find((s) => s.kind === 'jetty');
  if (!site) throw new Error('no jetty on seed 7 near s 3195');
  const zone = { x: site.zoneX, z: site.zoneZ, r: site.zoneR };
  const ex = site.e2x;
  const ez = site.e2z;
  const deck = site.objects.find((o) => o.kind === 'jetty')!;
  // a metre short of the deck's end (it ends 5 m short of the zone's centre)
  const stand = { x: zone.x - ex * 6, y: deck.y + 1.5, z: zone.z - ez * 6, heading: Math.atan2(ez, ex) };
  return { world, site, zone, stand };
}

export interface Session {
  catches: { id: string; seconds: number; lengthCm: number }[];
  lost: number;
  snaps: number;
  hooks: number;
  seconds: number;
}

/** a robot angler fishes from the jetty for `minutes` */
export function fishFor(kind: AnglerKind, seed: number, minutes: number, env: FishEnv = { hour: 12, weather: FAIR }, place = jetty()): Session {
  const school = new School(seed);
  const a = new Angling(seed, school);
  const bot = new Angler(kind, seed);
  const tip: RodTip = { ...place.stand };
  const n = Math.round((minutes * 60) / FISH_STEP);
  const res: Session = { catches: [], lost: 0, snaps: 0, hooks: 0, seconds: minutes * 60 };
  // the school settles first
  for (let i = 0; i < 600; i++) school.step(FISH_STEP, place.world, tip.x, tip.z, env, [place.zone]);
  for (let i = 0; i < n; i++) {
    school.step(FISH_STEP, place.world, tip.x, tip.z, env, [place.zone]);
    const inp = bot.decide(a, tip);
    a.events.length = 0;
    a.step(inp, tip, place.world);
    for (const e of a.events) {
      if (e === 'strike') res.hooks++;
      if (e === 'snap') res.snaps++;
      if (e === 'miss' || e === 'early') res.lost++;
    }
    if (a.caught) {
      const c = a.takeCatch()!;
      res.catches.push({ id: c.id, seconds: c.seconds, lengthCm: c.lengthCm });
    }
  }
  return res;
}

function quartile(v: number[], q: number): number {
  if (!v.length) return NaN;
  const s = [...v].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(q * (s.length - 1)))];
}

export function collectFishingMetrics(): Record<string, number> {
  const m: Record<string, number> = {};
  const place = jetty();
  const good: Session[] = [];
  const bad: Session[] = [];
  for (let k = 0; k < 12; k++) good.push(fishFor('competent', 100 + k, 8, undefined, place));
  for (let k = 0; k < 6; k++) bad.push(fishFor('careless', 200 + k, 8, undefined, place));
  const fishOnly = (s: Session) => s.catches.filter((c) => c.id.startsWith('fish.'));
  const times = good.flatMap((s) => s.catches.map((c) => c.seconds));
  m.catch_seconds_lq = quartile(times, 0.25);
  m.catch_seconds_median = quartile(times, 0.5);
  m.catch_seconds_uq = quartile(times, 0.75);
  const landRate = (ss: Session[]) => {
    const hooks = ss.reduce((a, s) => a + s.hooks, 0);
    const landed = ss.reduce((a, s) => a + s.catches.length, 0);
    return landed / Math.max(1, hooks);
  };
  // how many of the fish that came to the float ended in the hand
  const outcome = (ss: Session[]) => {
    const landed = ss.reduce((a, s) => a + s.catches.length, 0);
    const lost = ss.reduce((a, s) => a + s.lost + s.snaps, 0);
    return landed / Math.max(1, landed + lost);
  };
  m.competent_landed_share = outcome(good);
  m.careless_landed_share = outcome(bad);
  m.competent_hook_to_land = landRate(good);
  m.fish_per_hour_competent = (good.reduce((a, s) => a + fishOnly(s).length, 0) / good.reduce((a, s) => a + s.seconds, 0)) * 3600;
  const all = good.flatMap((s) => s.catches);
  m.junk_share = all.filter((c) => !c.id.startsWith('fish.')).length / Math.max(1, all.length);
  m.cast_min_m = Angling.castLength(0);
  m.cast_max_m = Angling.castLength(5);
  m.bite_window_s = BITE_WINDOW;
  m.bite_window_rare_s = BITE_WINDOW_RARE;
  m.snap_full_s = SNAP_FULL;
  void CAST_MIN;
  void CAST_MAX;
  // the species each lake offers at noon and at dusk against 11.2
  const want: Record<string, string[]> = {
    noon: ['fish.bleak', 'fish.crucian', 'fish.carp'],
    dusk: ['fish.bleak', 'fish.perch', 'fish.king'],
  };
  let wrong = 0;
  for (const [slot, hour] of [
    ['noon', 12],
    ['dusk', 18],
  ] as const) {
    const got = speciesFor('lake', hour).map((s) => s.id).sort();
    if (JSON.stringify(got) !== JSON.stringify([...want[slot]].sort())) wrong++;
  }
  m.lake_species_mismatches = wrong;
  m.species_count = SPECIES.length;
  // same seed, same inputs: the same fish
  const a = fishFor('competent', 7, 3, undefined, place);
  const b = fishFor('competent', 7, 3, undefined, place);
  m.determinism_diff = JSON.stringify(a) === JSON.stringify(b) ? 0 : 1;
  return m;
}

if (process.argv[1]?.endsWith('fishing.ts')) {
  const t = Date.now();
  console.log(collectFishingMetrics(), `${Date.now() - t} ms`);
}
