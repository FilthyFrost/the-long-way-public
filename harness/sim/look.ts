/**
 * Transition smoothness: walk through whole weather events and a full day and check that the
 * light never jumps. Works on the colour script directly (no rendering needed).
 */
import * as THREE from 'three';
import { DayClock, SkyState } from '../../src/core/env/time';
import { WeatherState, WeatherSystem, type WeatherEvent } from '../../src/core/env/weather';
import { BIOMES } from '../../src/core/world/biomes';
import { Look, computeLook } from '../../src/game/env/colorScript';
import type { Metrics } from './scenarios';

const luma = (c: THREE.Color): number => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;

/** noon values: changes are measured as a share of them, so the limits do not depend on the light's units */
let LIGHT_SCALE = 1;
let SKY_SCALE = 1;

export function collectLookMetrics(): Metrics {
  {
    const s0 = new SkyState();
    DayClock.skyAtHour(13, 58, s0);
    const l0 = new Look();
    computeLook(s0, new WeatherState(), 'plains', 'plains', 0, l0);
    LIGHT_SCALE = (luma(l0.sun) + luma(l0.amb)) * l0.exposure;
    SKY_SCALE = luma(l0.horizon) * l0.exposure;
  }
  const clock = new DayClock();
  const sky = new SkyState();
  const look = new Look();
  const w = new WeatherState();
  let maxLightStep = 0;
  let maxSkyStep = 0;
  let maxFogStep = 0;
  let minNightAmbient = 1e9;
  const dt = 0.5;
  for (let bi = 0; bi < BIOMES.length; bi++) {
    const id = BIOMES[bi].id;
    const ws = new WeatherSystem(100 + bi);
    // two full days of scheduled weather
    let pLight = NaN;
    let pSky = NaN;
    let pFog = NaN;
    for (let t = 0; t < clock.dayLength * 2; t += dt) {
      clock.state(t, sky);
      ws.targets(t, sky.hour, sky.daylight, bi, bi, 0, w);
      computeLook(sky, w, id, id, 0, look);
      // what reaches the eye: light and ambient after exposure
      const light = ((luma(look.sun) + luma(look.amb)) * look.exposure) / LIGHT_SCALE;
      const skyL = (luma(look.horizon) * look.exposure) / SKY_SCALE;
      const fog = Math.log(look.haze);
      if (t > 0) {
        maxLightStep = Math.max(maxLightStep, Math.abs(light - pLight) / dt);
        maxSkyStep = Math.max(maxSkyStep, Math.abs(skyL - pSky) / dt);
        maxFogStep = Math.max(maxFogStep, Math.abs(fog - pFog) / dt);
      }
      pLight = light;
      pSky = skyL;
      pFog = fog;
      if (sky.night > 0.9) minNightAmbient = Math.min(minNightAmbient, luma(look.amb) * look.exposure);
    }
  }
  // one storm on the plains, start to finish, at midday
  const ws = new WeatherSystem(11);
  const ev: WeatherEvent = { t0: 0, t1: 0, t2: 0, t3: 0, strength: 0, pick: 0 };
  let k = 0;
  while (!(ws.eventInWindow(k, ev) && WeatherSystem.kindFor('plains', ev.pick) === 'storm')) k++;
  let dimmest = 1e9;
  let clearLight = 0;
  for (let t = ev.t0 - 20; t < ev.t3 + 20; t += dt) {
    DayClock.skyAtHour(13, 58, sky);
    ws.targets(t, 13, 1, 0, 0, 0, w);
    computeLook(sky, w, 'plains', 'plains', 0, look);
    const light = luma(look.sun);
    if (t < ev.t0 - 10) clearLight = light;
    if (light < dimmest) dimmest = light;
  }
  return {
    look_max_light_change_per_s: maxLightStep,
    look_max_sky_change_per_s: maxSkyStep,
    look_max_log_fog_change_per_s: maxFogStep,
    look_min_night_ambient: minNightAmbient,
    look_storm_light_ratio: dimmest / Math.max(clearLight, 1e-6),
  };
}
