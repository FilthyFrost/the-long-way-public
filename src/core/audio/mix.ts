/**
 * Sound mix as a pure function of what the vehicle and the weather are doing.
 * The browser side only applies these numbers to Web Audio nodes; the logic is testable headless.
 *
 * "enclosed" is the key cosy control: 0 = open cab, 1 = closed cabin. Closing in muffles wind
 * and rain outside and brings up the drumming of rain on the roof.
 */
import { clamp, lerp } from '../math/util';

export interface AudioInputs {
  rpm: number;
  idleRpm: number;
  redline: number;
  /** cylinders (sets the firing frequency) */
  cylinders: number;
  throttle: number;
  /** speed (m/s) */
  speed: number;
  /** highest tyre grip utilisation, 0…1 */
  slip: number;
  /** surface micro-roughness (m) under the wheels */
  rough: number;
  rain: number;
  hail: number;
  snow: number;
  dust: number;
  /** weather wind (m/s) */
  wind: number;
  enclosed: number;
  // --- vehicle systems (optional: absent = engine running, nothing else happening)
  /** engine turning by itself */
  engineOn?: boolean;
  /** starter motor turning; `starterRate` 0…1 = how lively (a weak battery cranks slowly) */
  cranking?: boolean;
  starterRate?: number;
  /** a shift is in progress (0…1 of its duration left) */
  shifting?: number;
  /** road-feel envelope 0…1: kerbs, joints, landings (RoadFeel.thump) */
  thump?: number;
  /** suspension busy-ness (RMS compression speed, m/s) */
  suspension?: number;
  /** a tyre is flat and turning (speed matters) */
  flat?: boolean;
  horn?: boolean;
  /** horn quirk: off-key */
  hornDetune?: boolean;
  /** extra rumble from the surface texture 0…1 (RoadFeel.buzz) */
  buzz?: number;
  /** how much of the road-noise bed to keep (absent: all; ModCar turns it down under its tyres' own sounds by surface) */
  roadScale?: number;
}

export class AudioMix {
  /** engine firing frequency (Hz) */
  engineHz = 20;
  engineGain = 0;
  /** low-pass on the engine tone (Hz): opens with load and revs */
  engineCutoff = 400;
  /** rumble an octave down */
  subGain = 0;
  windGain = 0;
  windCutoff = 600;
  roadGain = 0;
  roadCutoff = 500;
  skidGain = 0;
  /** rain heard directly (open air) */
  rainGain = 0;
  /** rain / hail drumming on the roof */
  roofGain = 0;
  hailGain = 0;
  /** low-pass over everything from outside (Hz) */
  outsideCutoff = 18000;
  /** starter motor: a rough buzz pulsing with the compression strokes */
  starterGain = 0;
  starterHz = 9;
  /** a low thud from the suspension (kerbs, joints, landings) */
  thumpGain = 0;
  /** the suspension working over rough ground / washboard */
  rattleGain = 0;
  /** a flat tyre flapping, pulses per second */
  flatGain = 0;
  flatHz = 0;
  hornGain = 0;
  hornHz = 420;
}

export function computeMix(i: AudioInputs, o: AudioMix): AudioMix {
  const rev = clamp((i.rpm - i.idleRpm) / (i.redline - i.idleRpm), 0, 1.1);
  const open = 1 - i.enclosed;
  const on = i.engineOn === undefined || i.engineOn ? 1 : 0;
  const rpm = Math.max(i.rpm, 1);
  o.engineHz = (rpm / 60) * (i.cylinders / 2);
  // a small engine: clear at idle, working hard under load, never shouting
  // (a shift pulls the load off for a moment: the note sags and darkens)
  const shift = clamp(i.shifting ?? 0, 0, 1);
  const load = i.throttle * (1 - 0.6 * shift);
  o.engineGain = (0.1 + 0.16 * load + 0.1 * rev) * on;
  o.engineCutoff = 260 + 900 * rev + 1500 * load * (0.4 + 0.6 * rev);
  o.subGain = (0.1 + 0.1 * (1 - rev)) * on;
  const crank = i.cranking ? 1 : 0;
  const sr = clamp(i.starterRate ?? 1, 0.2, 1);
  o.starterGain = 0.22 * crank * (0.6 + 0.4 * sr);
  o.starterHz = (4 + 6 * sr) * (i.cylinders / 2);
  const v = i.speed;
  // wind rises with the square of speed; an open cab hears much more of it
  const air = (v / 28) * (v / 28) * 0.42 + (i.wind / 22) * 0.22 + i.dust * 0.25;
  o.windGain = clamp(air * (0.3 + 0.7 * open), 0, 0.7);
  o.windCutoff = 350 + 60 * v + 30 * i.wind;
  o.roadGain = clamp((v / 26) * (0.12 + i.rough * 9) * (0.55 + 0.45 * open), 0, 0.6) * (i.roadScale ?? 1);
  o.roadCutoff = 240 + 22 * v + i.rough * 30000;
  o.skidGain = clamp((i.slip - 0.9) * 8, 0, 1) * clamp(v / 6, 0, 1) * 0.3;
  o.rainGain = clamp(i.rain * 0.42 * (0.25 + 0.75 * open), 0, 0.6);
  o.hailGain = clamp(i.hail * 0.5, 0, 0.6);
  o.roofGain = clamp((i.rain * 0.4 + i.hail * 0.5) * i.enclosed, 0, 0.6);
  o.outsideCutoff = lerp(18000, 1400, i.enclosed);
  o.thumpGain = clamp((i.thump ?? 0) * 0.9, 0, 0.9);
  o.rattleGain = clamp(Math.max(0, (i.suspension ?? 0) - 0.15) * 0.35 + (i.buzz ?? 0) * 0.04 * clamp(v / 10, 0, 1), 0, 0.35);
  o.flatGain = i.flat ? clamp(v / 4, 0, 1) * 0.3 : 0;
  // one flap per turn of a ~0.3 m wheel
  o.flatHz = i.flat ? v / (2 * Math.PI * 0.32) : 0;
  o.hornGain = i.horn ? 0.32 : 0;
  o.hornHz = i.hornDetune ? 290 : 420;
  return o;
}

/** how much quieter (dB) a source at gain g2 is than at g1 */
export function attenuationDb(g1: number, g2: number): number {
  return 20 * Math.log10(Math.max(g1, 1e-9) / Math.max(g2, 1e-9));
}
