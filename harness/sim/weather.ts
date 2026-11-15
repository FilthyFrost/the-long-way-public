/**
 * Headless checks for the day clock and the weather schedule.
 */
import { DayClock, SkyState } from '../../src/core/env/time';
import { EVENT_WINDOW, WeatherState, WeatherSystem, type WeatherEvent } from '../../src/core/env/weather';
import { T0_TRUCK } from '../../src/core/vehicle/spec';
import { BIOMES, BIOME_INDEX } from '../../src/core/world/biomes';
import { GroundSample, Surface } from '../../src/core/world/ground';
import { SpineSample } from '../../src/core/world/spine';
import { World } from '../../src/core/world/terrain';
import { brakeTest, type Metrics } from './scenarios';

const DEG = 180 / Math.PI;

export function collectWeatherMetrics(): Metrics {
  const out: Metrics = {};
  const ev: WeatherEvent = { t0: 0, t1: 0, t2: 0, t3: 0, strength: 0, pick: 0 };

  // ---- 1) every event has three acts of the planned length
  let events = 0;
  let actViol = 0;
  let minBuild = 1e9;
  let maxBuild = 0;
  let minPeak = 1e9;
  let maxPeak = 0;
  let minAfter = 1e9;
  let maxAfter = 0;
  const windows = 300;
  const seeds = 40;
  for (let seed = 1; seed <= seeds; seed++) {
    const ws = new WeatherSystem(seed);
    let prevEnd = -1e9;
    for (let k = 0; k < windows; k++) {
      if (!ws.eventInWindow(k, ev)) continue;
      events++;
      const b = ev.t1 - ev.t0;
      const p = ev.t2 - ev.t1;
      const a = ev.t3 - ev.t2;
      minBuild = Math.min(minBuild, b);
      maxBuild = Math.max(maxBuild, b);
      minPeak = Math.min(minPeak, p);
      maxPeak = Math.max(maxPeak, p);
      minAfter = Math.min(minAfter, a);
      maxAfter = Math.max(maxAfter, a);
      if (ev.t0 < prevEnd + 30 || ev.t3 > (k + 1) * EVENT_WINDOW || ev.t0 < k * EVENT_WINDOW) actViol++;
      prevEnd = ev.t3;
    }
  }
  const clock = new DayClock();
  out.weather_events = events;
  out.weather_events_per_day = events / ((seeds * windows * EVENT_WINDOW) / clock.dayLength);
  out.weather_schedule_violations = actViol;
  // ---- 1b) weather is seen before it is felt: the front stands a third of the way up the sky well before anything falls
  {
    let minLead = 1e9;
    const st = new WeatherState();
    for (let seed = 1; seed <= 12; seed++) {
      const ws = new WeatherSystem(seed);
      for (let k = 0; k < 120; k++) {
        if (!ws.eventInWindow(k, ev)) continue;
        for (const bi of [0, 1, 2]) {
          const kind = WeatherSystem.kindFor(BIOMES[bi].id, ev.pick);
          if (kind === 'fog') continue;
          let tFront = NaN;
          let tFall = NaN;
          // (the event's own fall: a shower out of thick fair-weather cloud may be on already, and is not its doing)
          for (let t = ev.t0; t <= ev.t1 + 5; t += 1) {
            ws.targets(t, 14, 1, bi, bi, 0, st);
            if (tFront !== tFront && st.front > 0.33) tFront = t;
            if (tFall !== tFall && st.fall > 0.12) tFall = t;
          }
          if (tFront === tFront && tFall === tFall) minLead = Math.min(minLead, tFall - tFront);
        }
      }
    }
    out.weather_front_lead_min_s = minLead;
  }
  out.weather_buildup_min_s = minBuild;
  out.weather_buildup_max_s = maxBuild;
  out.weather_peak_min_s = minPeak;
  out.weather_peak_max_s = maxPeak;
  out.weather_aftermath_min_s = minAfter;
  out.weather_aftermath_max_s = maxAfter;

  // ---- 2) determinism and 3) continuity, walking six simulated hours per biome
  let mism = 0;
  let maxDelta = 0;
  let actOrderViol = 0;
  const sky = new SkyState();
  const fields = ['cloud', 'overcast', 'rain', 'snow', 'hail', 'dust', 'fog'] as const;
  for (let bi = 0; bi < BIOMES.length; bi++) {
    for (let seed = 1; seed <= 6; seed++) {
      const w1 = new WeatherSystem(seed * 7 + bi);
      const w2 = new WeatherSystem(seed * 7 + bi);
      const s1 = new WeatherState();
      const s2 = new WeatherState();
      const prev = new WeatherState();
      let lastAct = 0;
      for (let t = 0; t < 6 * 3600; t += 1) {
        clock.state(t, sky);
        w1.targets(t, sky.hour, sky.daylight, bi, bi, 0, s1);
        if (t % 97 === 0) {
          w2.targets(t, sky.hour, sky.daylight, bi, bi, 0, s2);
          for (const f of fields) if (s1[f] !== s2[f]) mism++;
        }
        if (t > 0) {
          for (const f of fields) {
            // hail is allowed to arrive in bursts; everything else must move gently
            if (f === 'hail') continue;
            const d = Math.abs(s1[f] - prev[f]);
            if (d > maxDelta) maxDelta = d;
          }
        }
        // acts only ever go 0→1→2→3→0
        if (s1.act !== lastAct) {
          const ok = (lastAct === 0 && s1.act === 1) || (lastAct === 1 && s1.act === 2) || (lastAct === 2 && s1.act === 3) || (lastAct === 3 && s1.act === 0);
          if (!ok) actOrderViol++;
          lastAct = s1.act;
        }
        prev.copy(s1);
      }
    }
  }
  out.weather_determinism_mismatches = mism;
  out.weather_max_change_per_s = maxDelta;
  out.weather_act_order_violations = actOrderViol;

  // ---- 4) the slow state: roads get wet in a storm and dry afterwards; snow settles in a blizzard
  const findEvent = (ws: WeatherSystem, biomeId: string, kinds: string[]): WeatherEvent | null => {
    for (let k = 0; k < 400; k++) {
      const e: WeatherEvent = { t0: 0, t1: 0, t2: 0, t3: 0, strength: 0, pick: 0 };
      if (ws.eventInWindow(k, e) && kinds.includes(WeatherSystem.kindFor(biomeId, e.pick))) return e;
    }
    return null;
  };
  {
    const ws = new WeatherSystem(11);
    const e = findEvent(ws, 'plains', ['storm']);
    let wetPeak = 0;
    let dryAt = NaN;
    if (e) {
      const bi = BIOME_INDEX.plains;
      for (let t = e.t0 - 30; t < e.t3 + 900; t += 0.5) {
        clock.state(t, sky);
        const s = ws.step(0.5, t, 13, 1, bi, bi, 0);
        if (t < e.t2 + 5 && s.wetness > wetPeak) wetPeak = s.wetness;
        if (t > e.t3 && isNaN(dryAt) && s.wetness < 0.05) dryAt = t - e.t3;
      }
    }
    out.weather_wetness_peak = wetPeak;
    out.weather_dry_time_s = dryAt;
  }
  {
    const ws = new WeatherSystem(12);
    const e = findEvent(ws, 'alpine', ['blizzard']);
    let coverPeak = 0;
    let minTemp = 99;
    if (e) {
      const bi = BIOME_INDEX.alpine;
      for (let t = e.t0 - 30; t < e.t3; t += 0.5) {
        const s = ws.step(0.5, t, 13, 1, bi, bi, 0);
        if (s.snowCover > coverPeak) coverPeak = s.snowCover;
        if (s.temp < minTemp) minTemp = s.temp;
      }
    }
    out.weather_snow_cover_peak = coverPeak;
    out.weather_blizzard_min_temp_c = minTemp;
  }

  // ---- 5) gameplay hooks: grip on the road follows the weather
  {
    const w = new World(5);
    const st = new SpineSample();
    w.spine.at(300, st);
    const gs = new GroundSample();
    w.sample(st.x, st.z, gs);
    const dry = gs.mu;
    w.wetness = 1;
    w.sample(st.x, st.z, gs);
    const wet = gs.mu;
    w.wetness = 0;
    w.snowCover = 1;
    w.sample(st.x, st.z, gs);
    const snow = gs.mu;
    out.weather_grip_wet_ratio = wet / dry;
    out.weather_grip_snow_ratio = snow / dry;
    out.weather_brake_snow_vs_dry = brakeTest(T0_TRUCK, Surface.Snow).brake_60_0_m / brakeTest(T0_TRUCK, Surface.Asphalt).brake_60_0_m;
  }

  // ---- 6) the day: best light lingers, night is short, the clock never jumps
  {
    let golden = 0;
    let night = 0;
    let maxJump = 0;
    let maxElev = -9;
    let prevHour = clock.hourAt(0);
    const dt = 1;
    for (let t = dt; t <= clock.dayLength; t += dt) {
      clock.state(t, sky);
      const el = sky.sunElev * DEG;
      if (sky.afternoon && el > -4 && el < 12) golden += dt;
      if (el < -8) night += dt;
      if (el > maxElev) maxElev = el;
      let dh = sky.hour - prevHour;
      if (dh < -12) dh += 24;
      if (Math.abs(dh) > maxJump) maxJump = Math.abs(dh);
      prevHour = sky.hour;
    }
    out.day_length_s = clock.dayLength;
    out.day_golden_evening_s = golden;
    out.day_night_s = night;
    out.day_max_hour_step = maxJump;
    out.day_max_sun_elev_deg = maxElev;
    // setHour round trip
    const c2 = new DayClock();
    let rt = 0;
    for (const h of [0, 3, 5.5, 6.2, 9, 12, 16.5, 18.7, 19.5, 22]) {
      c2.setHour(h, 123);
      rt = Math.max(rt, Math.abs(c2.hourAt(123) - h));
    }
    out.day_set_hour_error = rt;
  }
  return out;
}
