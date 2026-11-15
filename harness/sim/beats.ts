/**
 * The rhythm of a journey (docs/DESIGN_V2.md 3.3): how often the road shows something, measured on
 * real worlds at the cruising speed the design assumes (70 km/h).
 *
 *   npx tsx harness/sim/beats.ts list <seed> [biome] [km]   prints the beats of one journey
 */
import { beatsBetween, type Beat } from '../../src/core/world/beats';
import { QUIET_FROM_CHAPTER } from '../../src/core/world/quiet';
import { World } from '../../src/core/world/terrain';
import type { Metrics } from './scenarios';

const FULL = process.env.FULL === '1';
/** m/s at 70 km/h */
const V = 70 / 3.6;
/** sights closer together than this are one moment (m): twenty seconds of road */
const MOMENT = 400;

export function collectBeatMetrics(): Metrics {
  const seeds = FULL ? 36 : 12;
  const len = 110000;
  const gapsBig: number[] = [];
  const gapsAll: number[] = [];
  let km = 0;
  let big = 0;
  let moments = 0;
  let all = 0;
  let sameRun = 0;
  let pairs = 0;
  let quiet = 0;
  let lateKm = 0;
  let lateMax = 0;
  let earlyMax = 0;
  let mism = 0;
  const kinds = new Map<string, number>();
  const whats = new Set<string>();
  for (let i = 0; i < seeds; i++) {
    const biome = (['plains', 'desert', 'alpine'] as const)[i % 3];
    const world = new World(1000 + i * 37, { startBiome: biome });
    const beats = beatsBetween(world, 300, len);
    km += (len - 300) / 1000;
    const lateFrom = world.spine.plan.starts[QUIET_FROM_CHAPTER];
    lateKm += Math.max(0, len - lateFrom) / 1000;
    all += beats.length;
    let prevAll = 300;
    let prevBig = 300;
    let lastBig = -Infinity;
    let prev: Beat | null = null;
    let prev2: Beat | null = null;
    for (const b of beats) {
      gapsAll.push((b.s - prevAll) / V);
      prevAll = b.s;
      whats.add(b.what);
      if (b.weight < 2) continue;
      big++;
      kinds.set(b.kind, (kinds.get(b.kind) ?? 0) + 1);
      // Sights that come within twenty seconds of each other are one moment (a camp by its lake under
      // a viaduct): the rhythm is counted between moments, from the last sight of one to the first of
      // the next.
      if (b.s - lastBig > MOMENT) {
        moments++;
        const gap = (b.s - prevBig) / V;
        gapsBig.push(gap);
        // (the quiet stretches are laid out from the fourth chapter on: counted there, per 10 km of it)
        if (b.s >= lateFrom) {
          if (gap >= 110) quiet++;
          if (gap > lateMax) lateMax = gap;
        } else if (gap > earlyMax) earlyMax = gap;
        if (prev && prev2) {
          pairs++;
          if (prev.kind === b.kind && prev2.kind === b.kind) sameRun++;
        }
        prev2 = prev;
        prev = b;
      }
      lastBig = b.s;
      prevBig = b.s;
    }
    // the same journey whoever asks, and in whatever pieces
    if (i < 3) {
      const again = new World(1000 + i * 37, { startBiome: biome });
      again.heightAt(40000, 300);
      const a = beatsBetween(again, 20000, 40000);
      const b = beats.filter((q) => q.s >= 20000 && q.s < 40000);
      if (a.length !== b.length || a.some((q, j) => q.s !== b[j].s || q.what !== b[j].what)) mism++;
    }
  }
  const q = (xs: number[], p: number): number => {
    const s = xs.slice().sort((x, y) => x - y);
    return s.length ? s[Math.min(s.length - 1, Math.floor(p * s.length))] : NaN;
  };
  const m: Metrics = {
    beats_sights_per_10km: (big / km) * 10,
    beats_moments_per_10km: (moments / km) * 10,
    beats_all_per_10km: (all / km) * 10,
    beats_moment_median_gap_s: q(gapsBig, 0.5),
    beats_moment_p10_gap_s: q(gapsBig, 0.1),
    beats_moment_p90_gap_s: q(gapsBig, 0.9),
    beats_moment_max_gap_early_s: earlyMax,
    beats_moment_max_gap_late_s: lateMax,
    beats_all_median_gap_s: q(gapsAll, 0.5),
    beats_all_p90_gap_s: q(gapsAll, 0.9),
    beats_quiet_stretches_per_10km_late: lateKm > 0 ? (quiet / lateKm) * 10 : 0,
    beats_same_kind_three_running_share: pairs ? sameRun / pairs : 0,
    beats_kinds_seen: kinds.size,
    beats_things_seen: whats.size,
    beats_determinism_mismatches: mism,
  };
  for (const k of ['land', 'far', 'place', 'water', 'bridge']) m[`beats_${k}_per_10km`] = ((kinds.get(k) ?? 0) / km) * 10;
  return m;
}

if (process.argv[2] === 'list') {
  const world = new World(Number(process.argv[3] ?? 20261113), { startBiome: process.argv[4] ?? 'plains' });
  const beats = beatsBetween(world, 0, Number(process.argv[5] ?? 30) * 1000);
  let prev = 0;
  for (const b of beats) {
    if (b.weight >= 2) {
      console.log(`${(b.s / 1000).toFixed(2).padStart(7)} km  +${((b.s - prev) / V).toFixed(0).padStart(3)} s  ${'*'.repeat(b.weight).padEnd(3)} ${b.kind.padEnd(7)} ${b.what}`);
      prev = b.s;
    } else console.log(`${(b.s / 1000).toFixed(2).padStart(7)} km          .   ${b.kind.padEnd(7)} ${b.what}`);
  }
} else if (process.argv[1] && process.argv[1].endsWith('beats.ts')) {
  const m = collectBeatMetrics();
  for (const [k, v] of Object.entries(m)) console.log(k.padEnd(38), typeof v === 'number' ? v.toFixed(2) : v);
}
