// F9 (docs/V3/plan/finish.md §十二): the weather only changes slowly.
//  - twenty-four worlds driven 300 km at 90 km/h, the weather stepped as the game steps it (a quarter of a second)
//    and looked at four times a second: from one second to the next the cloud, the overcast, the fog, the rain, the
//    snow and — by the weather's doing — the light that reaches the eye change no more than each one's threshold (the
//    sun's own rising is the clock's: harness/sim/look.ts holds that); from an open sky to heavy rain
//    takes two minutes at the least; the twenty worst moments are written down for the walkthrough to picture
//    (harness/shots/f9_weather.mjs);
//  - the cloud cover is one curve for the whole world: a region only takes its own share of it;
//  - an event is one kind from where it began to brew to its end — carried into a country that has no such weather it
//    dies away in two or three minutes, and is never cut to that country's kind;
//  - across a border the sky's band is wider than the ground's;
//  - a cut of the clock (a night slept through, a save read) is taken as the schedule has it at once.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import '../../src/core/v3/nd/cards';
import { DayClock, SkyState } from '../../src/core/env/time';
import { CARRIED_FADE, EVENT_WINDOW, WEATHER_CUT, WEATHER_LAG, WeatherState, WeatherSystem, calmOf, type WeatherEvent, type WeatherKind } from '../../src/core/env/weather';
import { BIOMES } from '../../src/core/world/biomes';
import { BiomeBlend, SKY_BAND } from '../../src/core/world/spine';
import { World } from '../../src/core/world/terrain';
import { Look, computeLook } from '../../src/game/env/colorScript';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const luma = (c: THREE.Color): number => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
const idOf = (name: string): number => BIOMES.findIndex((b) => b.id === name);
/** the weather as the game has it in a world of version 7 */
const NOW = { slow: true, oneSky: true } as const;

/** the most each may change from one second to the next (its lag's own bound, a little over) */
const LIMIT = { cloud: 1 / WEATHER_LAG.cloud + 0.0015, overcast: 1 / WEATHER_LAG.overcast + 0.0015, fog: 1 / WEATHER_LAG.fog + 0.0015, rain: 1 / WEATHER_LAG.fall + 0.0015, snow: 1 / WEATHER_LAG.fall + 0.0015, light: 0.012 } as const;
type Measure = keyof typeof LIMIT;

describe('F9: the weather only changes slowly', () => {
  it('twenty-four worlds driven 300 km at 90 km/h: nothing of the sky changes faster than its threshold from one second to the next', () => {
    const KMH = 90;
    const KM = 300;
    const speed = KMH / 3.6;
    const seconds = (KM * 1000) / speed;
    const worst: { seed: number; km: number; t: number; hour: number; what: Measure; rate: number; share: number; region: string }[] = [];
    const top: Record<Measure, number> = { cloud: 0, overcast: 0, fog: 0, rain: 0, snow: 0, light: 0 };
    let quickest = Infinity;
    let downpours = 0;
    let crossings = 0;
    // (how much weather there is: the share of the drive with something falling, with it falling hard, in fog, in dust)
    let samples = 0;
    const amid = { falling: 0, hard: 0, fog: 0, dust: 0, deck: 0 };
    // (the light at a clear noon: changes are a share of it)
    const s0 = new SkyState();
    DayClock.skyAtHour(13, 58, s0);
    const l0 = new Look();
    computeLook(s0, new WeatherState(), 'plains', 'plains', 0, l0);
    const scale = (luma(l0.sun) + luma(l0.amb)) * l0.exposure;
    for (let seed = 1; seed <= 24; seed++) {
      const world = new World(seed, { worldVersion: 7 });
      const ws = new WeatherSystem(seed, NOW);
      const clock = new DayClock();
      const sky = new SkyState();
      const look = new Look();
      const bl = new BiomeBlend();
      const hist: Record<Measure, number[]> = { cloud: [], overcast: [], fog: [], rain: [], snow: [], light: [] };
      // (the weather of the last second, to tell what of the light's change is the weather's and what the clock's)
      const past = [new WeatherState(), new WeatherState(), new WeatherState(), new WeatherState()];
      const was = new Look();
      let openAt = -Infinity;
      let wasIn = -1;
      for (let i = 0; i * 0.25 <= seconds; i++) {
        const t = i * 0.25;
        const s = t * speed;
        world.spine.skyAt(s, bl);
        clock.state(t, sky);
        const w = ws.step(0.25, t, sky.hour, sky.daylight, bl.a, bl.b, bl.t);
        computeLook(sky, w, BIOMES[bl.a].id, BIOMES[bl.b].id, bl.t, look);
        // the light that reaches the eye now, and what it would be now under the weather of a second ago: the
        // difference is the weather's doing (the sun's own rising and setting is the clock's, as fast as it ever was)
        const lit = ((luma(look.sun) + luma(look.amb)) * look.exposure) / scale;
        const old = past[i % 4];
        let weatherLit = lit;
        if (i >= 4) {
          computeLook(sky, old, BIOMES[bl.a].id, BIOMES[bl.b].id, bl.t, was);
          weatherLit = ((luma(was.sun) + luma(was.amb)) * was.exposure) / scale;
        }
        old.copy(w);
        const now: Record<Measure, number> = { cloud: w.cloud, overcast: w.overcast, fog: w.fog, rain: w.rain, snow: w.snow, light: lit };
        const here = bl.t > 0.5 ? bl.b : bl.a;
        if (here !== wasIn) {
          if (wasIn >= 0) crossings++;
          wasIn = here;
        }
        for (const key of Object.keys(LIMIT) as Measure[]) {
          const h = hist[key];
          h.push(now[key]);
          if (h.length <= 4) continue;
          const rate = key === 'light' ? Math.abs(lit - weatherLit) : Math.abs(now[key] - h[h.length - 5]);
          if (rate > top[key]) top[key] = rate;
          const share = rate / LIMIT[key];
          if (worst.length < 20 || share > worst[worst.length - 1].share) {
            // (one moment a minute at the most: the twenty are twenty different ones)
            const near = worst.findIndex((q) => q.seed === seed && Math.abs(q.t - t) < 60);
            if (near >= 0 && worst[near].share >= share) continue;
            if (near >= 0) worst.splice(near, 1);
            worst.push({ seed, km: +(s / 1000).toFixed(2), t, hour: +sky.hour.toFixed(2), what: key, rate: +rate.toFixed(5), share: +share.toFixed(3), region: BIOMES[here].id });
            worst.sort((a, b) => b.share - a.share);
            if (worst.length > 20) worst.length = 20;
          }
        }
        samples++;
        if (w.rain + w.snow + w.hail > 0.15) amid.falling++;
        if (w.rain + w.snow > 0.6) amid.hard++;
        if (w.fog > 0.3) amid.fog++;
        if (w.dust > 0.3) amid.dust++;
        if (w.overcast > 0.6) amid.deck++;
        // from an open sky to heavy rain or snow
        if (w.cloud < 0.35 && w.rain + w.snow < 0.01) openAt = t;
        if (w.rain + w.snow > 0.8 && openAt > -Infinity) {
          quickest = Math.min(quickest, t - openAt);
          downpours++;
          openAt = -Infinity;
        }
      }
    }
    mkdirSync(resolve(ROOT, 'loop/shots/f9_weather'), { recursive: true });
    writeFileSync(resolve(ROOT, 'loop/shots/f9_weather/worst.json'), JSON.stringify({ kmh: KMH, limits: LIMIT, top, worst }, null, 1));
    console.log(`[f9] 24 worlds × ${KM} km at ${KMH} km/h, ${crossings} borders crossed: the most in a second — cloud ${top.cloud.toFixed(4)} (≤ ${LIMIT.cloud.toFixed(4)}), overcast ${top.overcast.toFixed(4)} (≤ ${LIMIT.overcast.toFixed(4)}), fog ${top.fog.toFixed(4)} (≤ ${LIMIT.fog.toFixed(4)}), rain ${top.rain.toFixed(4)}, snow ${top.snow.toFixed(4)} (≤ ${LIMIT.rain.toFixed(4)}), light ${top.light.toFixed(4)} (≤ ${LIMIT.light}); ${downpours} downpours, the quickest from an open sky ${quickest.toFixed(0)} s`);
    console.log(`[f9] the worst: ${worst.slice(0, 6).map((q) => `${q.what} ${q.rate} at ${q.km} km of world ${q.seed} (${q.region}, ${q.hour} h)`).join('; ')}`);
    const pc = (n: number): string => `${((100 * n) / samples).toFixed(1)} %`;
    console.log(`[f9] of the drive: something falling ${pc(amid.falling)}, falling hard ${pc(amid.hard)}, under a dark deck ${pc(amid.deck)}, in fog ${pc(amid.fog)}, in dust ${pc(amid.dust)}`);
    // (slowly is not seldom: there is weather still)
    expect(amid.falling / samples).toBeGreaterThan(0.04);
    expect(amid.hard / samples).toBeGreaterThan(0.01);
    for (const key of Object.keys(LIMIT) as Measure[]) expect(top[key], key).toBeLessThanOrEqual(LIMIT[key]);
    expect(crossings).toBeGreaterThan(100);
    expect(downpours).toBeGreaterThanOrEqual(5);
    expect(quickest).toBeGreaterThanOrEqual(120);
  }, 600000);

  it('the cloud cover is one curve for the whole world: a region takes its own share of it', () => {
    const ws = new WeatherSystem(7, NOW);
    const a = new WeatherState();
    const b = new WeatherState();
    const plains = idOf('plains');
    const desert = idOf('desert');
    const ev: WeatherEvent = { t0: 0, t1: 0, t2: 0, t3: 0, strength: 0, pick: 0 };
    let n = 0;
    for (let t = 0; t < 40 * EVENT_WINDOW; t += 37) {
      // (calm weather only: an event draws its own deck)
      if (ws.eventInWindow(Math.floor(t / EVENT_WINDOW), ev) && t >= ev.t0 && t < ev.t3) continue;
      ws.targets(t, 14, 1, plains, plains, 0, a);
      ws.targets(t, 14, 1, desert, desert, 0, b);
      expect(b.cloud / calmOf(BIOMES[desert]).cloud).toBeCloseTo(a.cloud / calmOf(BIOMES[plains]).cloud, 9);
      n++;
    }
    expect(n).toBeGreaterThan(500);
  });

  /** an event that is `kind` in a region, in a world's schedule */
  const eventOf = (ws: WeatherSystem, region: string, kind: WeatherKind): WeatherEvent => {
    const ev: WeatherEvent = { t0: 0, t1: 0, t2: 0, t3: 0, strength: 0, pick: 0 };
    for (let k = 0; k < 4000; k++) if (ws.eventInWindow(k, ev) && WeatherSystem.kindFor(region, ev.pick) === kind && ev.t2 - ev.t1 > 420) return { ...ev };
    throw new Error(`no long ${kind} in the schedule`);
  };

  /** under an event from before it brews until a hundred seconds into its peak in one region, then over a border in a minute and on in the next: the weather as it was at the border, as it is at the end, and the most dust and the most rain on the way */
  const carry = (from: string, kind: WeatherKind, into: string): { at: WeatherState; end: WeatherState; dust: number; rain: number; kinds: Set<WeatherKind> } => {
    const ws = new WeatherSystem(11, NOW);
    const ev = eventOf(ws, from, kind);
    const a = idOf(from);
    const b = idOf(into);
    const mid = ev.t1 + 100;
    let w = ws.state;
    for (let t = ev.t0 - 120; t <= mid; t += 0.25) w = ws.step(0.25, t, 14, 1, a, a, 0);
    const at = new WeatherState().copy(w);
    let dust = 0;
    let rain = 0;
    const kinds = new Set<WeatherKind>();
    for (let t = mid; t <= mid + 60 + CARRIED_FADE + 100 && t < ev.t2 - 1; t += 0.25) {
      w = ws.step(0.25, t, 14, 1, a, b, Math.min(1, (t - mid) / 60));
      dust = Math.max(dust, w.dust);
      rain = Math.max(rain, w.rain);
      if (w.severity > 0.05) kinds.add(w.kind);
    }
    return { at, end: new WeatherState().copy(w), dust, rain, kinds };
  };

  it('an event keeps the kind it began as: hail off the plains is hail in the maple hills and in the desert, never cut to that country\'s own', () => {
    expect(WeatherSystem.hasKind('maple', 'hail')).toBe(true);
    expect(WeatherSystem.hasKind('desert', 'hail')).toBe(false);
    // (rain falls in the hand-written desert — it has storms of its own: an event of rain goes on in it)
    expect(WeatherSystem.carried('maple', 'hail')).toBe('same');
    expect(WeatherSystem.carried('desert', 'hail')).toBe('same');
    for (const into of ['maple', 'desert']) {
      const c = carry('plains', 'hail', into);
      // (hail itself comes in bursts: the event is read by its deck and the rain under it)
      expect(c.at.kind).toBe('hail');
      expect(c.at.overcast).toBeGreaterThan(0.6);
      expect(c.at.rain).toBeGreaterThan(0.2);
      expect([...c.kinds]).toEqual(['hail']);
      expect(c.end.rain).toBeGreaterThan(0.7 * c.at.rain);
      expect(c.end.overcast).toBeGreaterThan(0.6);
      expect(c.end.act).toBe(2);
      // (the desert's own would have been a wall of sand)
      expect(c.dust).toBeLessThan(0.05);
    }
  });

  it('carried to where nothing of the sort falls it dies away in two or three minutes: a wall of sand driven into the plains', () => {
    expect(WeatherSystem.carried('plains', 'sandstorm')).toBe('none');
    const c = carry('desert', 'sandstorm', 'plains');
    expect(c.at.kind).toBe('sandstorm');
    expect(c.at.dust).toBeGreaterThan(0.5);
    // (it is sand to its end — what the plains would have made of the same event, a thunderstorm, never comes)
    expect([...c.kinds]).toEqual(['sandstorm']);
    expect(c.rain).toBeLessThan(0.1);
    expect(c.end.dust).toBeLessThan(0.03);
    expect(c.end.severity).toBeLessThan(0.02);
  });

  it('between rain and snow an event passes over by the air\'s temperature: a storm off the plains goes on in the high country, its rain turning to snow', () => {
    expect(WeatherSystem.carried('alpine', 'storm')).toBe('phase');
    const c = carry('plains', 'storm', 'alpine');
    expect(c.at.kind).toBe('storm');
    expect(c.at.rain).toBeGreaterThan(0.5);
    expect(c.at.snow).toBeLessThan(0.02);
    expect([...c.kinds]).toEqual(['storm']);
    // (it goes on — as much falls —, and in the cold up there it falls as snow)
    expect(c.end.act).toBe(2);
    expect(c.end.temp).toBeLessThan(0);
    expect(c.end.rain + c.end.snow).toBeGreaterThan(0.7 * c.at.rain);
    expect(c.end.snow).toBeGreaterThan(4 * c.end.rain);
  });

  it('across a border the sky takes a wider band than the ground: five kilometres about it, as the plan has it', () => {
    let seen = 0;
    for (const seed of [3, 7, 11]) {
      const world = new World(seed, { worldVersion: 7 });
      const plan = world.spine.plan;
      const ground = new BiomeBlend();
      const sky = new BiomeBlend();
      plan.blend(200000, ground);
      for (let c = 1; c < plan.starts.length - 2; c++) {
        const at = plan.starts[c];
        const before = at - plan.starts[c - 1];
        const after = plan.starts[c + 1] - at;
        if (plan.biomes[c] === plan.biomes[c - 1] || before < SKY_BAND || after < SKY_BAND) continue;
        seen++;
        // at the border both are half way; two kilometres short of it the ground is all the old country, the sky already turning
        world.spine.biomeAt(at, ground);
        world.spine.skyAt(at, sky);
        expect(sky.t).toBeCloseTo(0.5, 6);
        world.spine.skyAt(at - 2000, sky);
        world.spine.biomeAt(at - 2000, ground);
        expect(sky.a).toBe(plan.biomes[c - 1]);
        expect(sky.b).toBe(plan.biomes[c]);
        expect(sky.t).toBeGreaterThan(0.005);
        expect(sky.t).toBeLessThan(0.1);
        expect(ground.t === 0 || ground.b === ground.a).toBe(true);
        // (short of the band: none of the next country yet — all the one before, however the mix is written)
        world.spine.skyAt(at - SKY_BAND / 2 - 1, sky);
        expect(sky.b === plan.biomes[c] && sky.a !== sky.b ? sky.t : sky.a === plan.biomes[c] ? 1 : 0).toBe(0);
        // (never a jump along it: a metre on, a little more of the next country)
        let prev = 0;
        for (let s = at - SKY_BAND / 2; s <= at + SKY_BAND / 2; s += 50) {
          world.spine.skyAt(s, sky);
          const share = sky.b === plan.biomes[c] && sky.a !== sky.b ? sky.t : sky.a === plan.biomes[c] ? 1 : 0;
          expect(share).toBeGreaterThanOrEqual(prev - 1e-9);
          expect(share - prev).toBeLessThan(0.03);
          prev = share;
        }
      }
    }
    expect(seen).toBeGreaterThan(3);
  });

  it('a cut of the clock is taken as the schedule has it: a night slept through, a save read', () => {
    const ws = new WeatherSystem(5, NOW);
    const raw = new WeatherSystem(5, NOW);
    const want = new WeatherState();
    const plains = idOf('plains');
    let w = ws.state;
    for (let t = 0; t < 600; t += 0.25) w = ws.step(0.25, t, 10, 1, plains, plains, 0);
    // (a time at which the sky is another one altogether)
    let far = 600 + WEATHER_CUT + 1;
    for (; far < 200000; far += 97) {
      raw.targets(far, 10, 1, plains, plains, 0, want);
      if (Math.abs(want.cloud - w.cloud) > 0.4) break;
    }
    w = ws.step(0.25, far, 10, 1, plains, plains, 0);
    expect(w.cloud).toBeCloseTo(want.cloud, 9);
    expect(w.overcast).toBeCloseTo(want.overcast, 9);
    // … and a quarter of a second on it is followed slowly again
    raw.targets(far + 0.25, 10, 1, plains, plains, 0, want);
    const c0 = w.cloud;
    w = ws.step(0.25, far + 0.25, 10, 1, plains, plains, 0);
    expect(Math.abs(w.cloud - c0)).toBeLessThanOrEqual(Math.abs(want.cloud - c0) * 0.01 + 1e-9);
  });
});
