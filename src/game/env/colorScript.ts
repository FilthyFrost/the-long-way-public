/**
 * Colour script (render style v2): the light of the hour from specs/art/style.json, keyed by sun
 * elevation, tinted per biome, then changed by the weather. Plain maths, no rendering — the
 * harness walks it headless to check that the light never jumps.
 */
import * as THREE from 'three';
import type { SkyState } from '../../core/env/time';
import type { WeatherState } from '../../core/env/weather';
import { LightState, lightAt } from '../render/style';

/** per-biome adjustments on top of the hour's light */
interface BiomeAir {
  horizon: [number, number, number];
  zenith: [number, number, number];
  haze: number;
}

const AIR: Record<string, BiomeAir> = {
  plains: { horizon: [1, 1, 1], zenith: [1, 1, 1], haze: 1 },
  desert: { horizon: [1.08, 1.0, 0.9], zenith: [0.98, 1.0, 1.02], haze: 0.85 },
  alpine: { horizon: [0.96, 1.0, 1.06], zenith: [0.95, 1.0, 1.04], haze: 0.8 },
  // the second round: green shade in the woods, a pale wet air over the lakes, low gold light in the maple hills
  forest: { horizon: [0.97, 1.02, 0.98], zenith: [0.97, 1.0, 1.0], haze: 1.15 },
  lakes: { horizon: [0.98, 1.0, 1.04], zenith: [0.98, 1.0, 1.02], haze: 1.25 },
  maple: { horizon: [1.07, 1.0, 0.9], zenith: [1.0, 1.0, 0.99], haze: 1.05 },
};

export class Look extends LightState {
  /** direction of the key light (sun, or the moon at night) */
  dir = new THREE.Vector3(0, 1, 0);
  /** star visibility 0..1 */
  stars = 0;
  /** how visible the sun disc is 0..1 */
  sunVis = 1;
  /** 1 while the key light is the moon */
  moon = 0;
}

const cA = new THREE.Color();
const cB = new THREE.Color();
const GREY = new THREE.Color(0.6, 0.65, 0.72);
const STORM = new THREE.Color(0.3, 0.34, 0.44);
const DUST = new THREE.Color(0.86, 0.52, 0.26);
const SNOW = new THREE.Color(0.78, 0.83, 0.9);
const DEG = Math.PI / 180;

export function computeLook(sky: SkyState, w: WeatherState, biomeA: string, biomeB: string, bt: number, out: Look): void {
  const elev = sky.sunElev / DEG;
  lightAt(elev, !sky.afternoon, out);

  // ---- key light: the sun while it is up, the moon after it; the light dips through the change
  const sunUp = THREE.MathUtils.smoothstep(elev, -5, -1);
  const moonElev = Math.asin(THREE.MathUtils.clamp(sky.moonY, -1, 1)) / DEG;
  const moonUp = THREE.MathUtils.smoothstep(moonElev, -2, 8) * (1 - THREE.MathUtils.smoothstep(elev, -9, -5));
  if (sunUp > 0) {
    out.dir.set(sky.sunX, Math.max(sky.sunY, 0.02), sky.sunZ).normalize();
    out.sun.multiplyScalar(sunUp);
    out.moon = 0;
  } else {
    out.dir.set(sky.moonX, Math.max(sky.moonY, 0.08), sky.moonZ).normalize();
    out.sun.multiplyScalar(moonUp);
    out.moon = 1;
  }
  out.stars = 1 - THREE.MathUtils.smoothstep(elev, -14, -4);

  // ---- the air of the place
  const a = AIR[biomeA] ?? AIR.plains;
  const b = AIR[biomeB] ?? a;
  cA.setRGB(a.horizon[0] + (b.horizon[0] - a.horizon[0]) * bt, a.horizon[1] + (b.horizon[1] - a.horizon[1]) * bt, a.horizon[2] + (b.horizon[2] - a.horizon[2]) * bt);
  out.horizon.multiply(cA);
  out.fog.multiply(cA);
  cB.setRGB(a.zenith[0] + (b.zenith[0] - a.zenith[0]) * bt, a.zenith[1] + (b.zenith[1] - a.zenith[1]) * bt, a.zenith[2] + (b.zenith[2] - a.zenith[2]) * bt);
  out.zenith.multiply(cB);
  out.mid.multiply(cB);
  out.haze *= a.haze + (b.haze - a.haze) * bt;

  // ---- weather
  // the air thickens with what is falling — and, ahead of a front, with what is about to
  const hazeRain = Math.max(w.rain, w.murkRain);
  const hazeSnow = Math.max(w.snow, w.murkSnow);
  const hazeDust = Math.max(w.dust, w.murkDust);
  out.haze *= (1 + 8 * hazeRain) * (1 + 22 * hazeSnow * hazeSnow + 5 * hazeSnow) * (1 + 80 * hazeDust * hazeDust + 10 * hazeDust);
  const day = 0.12 + 0.88 * sky.daylight;
  const oc = w.overcast;
  out.sunVis = (1 - 0.92 * oc) * (1 - 0.85 * w.dust) * (1 - 0.7 * w.fog);
  if (oc > 0) {
    // an overcast sky is a grey lid: little sun, an even, paler sky light
    cA.copy(GREY).multiplyScalar(day);
    out.sun.multiplyScalar(1 - 0.85 * oc);
    out.amb.lerp(cB.copy(cA).multiplyScalar(0.8), 0.55 * oc);
    out.zenith.lerp(cB.copy(cA).multiplyScalar(0.7), 0.85 * oc);
    out.mid.lerp(cB.copy(cA).multiplyScalar(0.85), 0.85 * oc);
    out.horizon.lerp(cA, 0.8 * oc);
    out.fog.lerp(cA, 0.7 * oc);
    out.fogSun.lerp(cA, 0.8 * oc);
    out.glow.lerp(cB.copy(cA).multiplyScalar(0.5), 0.8 * oc);
    out.cloudLit.lerp(cB.copy(cA).multiplyScalar(1.15), 0.7 * oc);
    out.cloudMid.lerp(cB.copy(cA).multiplyScalar(0.9), 0.7 * oc);
    out.cloudShade.lerp(cB.copy(cA).multiplyScalar(0.7), 0.7 * oc);
    out.cloudUnder.lerp(cB.copy(cA).multiplyScalar(0.55), 0.7 * oc);
  }
  if (w.rain > 0) {
    // a rain sky is a dark lid, not a bright mist
    const k = w.rain * Math.max(oc, 0.4);
    cA.copy(STORM).multiplyScalar(day);
    for (const c of [out.zenith, out.mid, out.horizon, out.fog, out.fogSun]) c.lerp(cA, 0.45 * k);
    for (const c of [out.cloudLit, out.cloudMid, out.cloudShade, out.cloudUnder]) c.lerp(cA, 0.5 * k).multiplyScalar(1 - 0.25 * k);
    out.amb.multiplyScalar(1 - 0.25 * k);
    out.sun.multiplyScalar(1 - 0.3 * w.rain);
    // (haze: see below — it follows the murk of the coming weather as well as what is falling)
  }
  if (w.fog > 0) {
    out.haze *= 1 + 45 * w.fog * w.fog + 6 * w.fog;
    cA.copy(out.horizon).lerp(cB.setRGB(0.72, 0.76, 0.8).multiplyScalar(day), 0.5);
    out.fog.lerp(cA, 0.6 * w.fog);
    out.fogSun.lerp(cA, 0.6 * w.fog);
    out.sun.multiplyScalar(1 - 0.5 * w.fog);
  }
  if (w.snow > 0) {

    cA.copy(SNOW).multiplyScalar(day);
    out.horizon.lerp(cA, 0.7 * w.snow);
    out.fog.lerp(cA, 0.75 * w.snow);
    out.fogSun.lerp(cA, 0.75 * w.snow);
    out.mid.lerp(cA, 0.5 * w.snow);
  }
  if (w.dust > 0) {
    // sand in the air: the whole sky goes to ochre and the sun to a pale disc
    cA.copy(DUST).multiplyScalar(day);

    for (const c of [out.horizon, out.fog, out.fogSun]) c.lerp(cA, 0.9 * w.dust);
    out.mid.lerp(cA, 0.8 * w.dust);
    out.zenith.lerp(cB.copy(cA).multiplyScalar(0.75), 0.75 * w.dust);
    out.amb.lerp(cB.copy(cA).multiplyScalar(0.6), 0.5 * w.dust);
    out.sun.lerp(cB.copy(cA).multiplyScalar(2.2), 0.5 * w.dust).multiplyScalar(1 - 0.5 * w.dust);
    for (const c of [out.cloudLit, out.cloudMid, out.cloudShade, out.cloudUnder]) c.lerp(cA, 0.7 * w.dust);
  }
  // the wall of a coming sandstorm is sand, and of a coming blizzard snow, before any of it has arrived
  if (w.murkDust > w.dust) {
    cA.copy(DUST).multiplyScalar(day);
    for (const c of [out.cloudLit, out.cloudMid, out.cloudShade, out.cloudUnder]) c.lerp(cA, 0.75 * (w.murkDust - w.dust));
  }
  if (w.murkSnow > w.snow) {
    cA.copy(SNOW).multiplyScalar(day * 0.8);
    for (const c of [out.cloudMid, out.cloudShade, out.cloudUnder]) c.lerp(cA, 0.45 * (w.murkSnow - w.snow));
  }
}
