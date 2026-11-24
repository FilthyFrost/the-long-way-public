/**
 * The flashlight (docs/ND/PLAN.md, ND3; Nomad Drive's Flashlight, flashlight beam and chargable direct held item as the
 * game and its assets have them): it runs on its charge (100, a battery's worth, 0.35 a second while it is
 * on: four minutes and three quarters), held or lying about; found it is three tenths to wholly charged. Its beam is
 * wide (55°, 25 m, 2500 cd) or, focused, narrow (20°, 45 m, 12000 cd), the focus following the button over 0.35 s.
 * As its charge runs down its light dims, warms (3200 K to 2300 K) and, below a quarter, flickers and blacks out now
 * and then; spent, it sputters three times in 0.6 s and goes out, its battery gone (a new one goes in only then:
 * battery.ts). It comes on in 0.08 s (its filament glowing up from 1900 K) and goes off in 0.06. Pure: no three, no DOM.
 */
import { hash2, Rng } from '../../math/rng';
import type { ItemInstance } from '../../modcar/items';
import { chargeLeft } from './battery';

export const ND_FLASHLIGHT = 'nd_flashlight';

export const FLASHLIGHT = {
  max: 100,
  /** a second while it is on */
  drain: 0.35,
  /** found: between these shares charged */
  found: [0.3, 1] as const,
  /** the focus's travel (s) */
  focusS: 0.35,
  /** coming on, going off; the lens's afterglow (s) */
  warmS: 0.08,
  coolS: 0.06,
  glowS: 0.25,
  /** the beam wide and focused: full angle (degrees), the inner spot's share of it, reach (m), candela */
  wide: { deg: 55, inner: 0.45, reach: 25, cd: 2500 },
  narrow: { deg: 20, inner: 0.7, reach: 45, cd: 12000 },
  /** its colour full and nearly spent, and as it starts (K) */
  fullK: 3200,
  lowK: 2300,
  startK: 1900,
  /** spent: three pulses in this long (s), each first dark for half of it */
  sputterS: 0.6,
  /** brightness at no charge */
  dimAtZero: 0.25,
} as const;

export interface FlashlightState {
  /** switched on */
  on?: boolean;
  /** it was on when put away (it comes on again in the hands: Nomad Drive's) */
  was?: boolean;
}

declare module '../../modcar/items' {
  interface ItemState {
    /** a flashlight's switch (docs/ND/PLAN.md) */
    flashlight?: FlashlightState;
  }
}

/** a curve of keys (x, y) whose segments ease in and out (Nomad Drive's curves: every tangent flat) */
function curve(keys: readonly (readonly [number, number])[], x: number): number {
  if (x <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++) {
    const [x1, y1] = keys[i];
    if (x <= x1) {
      const [x0, y0] = keys[i - 1];
      const t = (x - x0) / (x1 - x0);
      return y0 + (y1 - y0) * t * t * (3 - 2 * t);
    }
  }
  return keys[keys.length - 1][1];
}

const BRIGHT = [[0, 0.25], [0.15, 0.55], [0.45, 0.88], [1, 1]] as const;
const WARM = [[0, 1], [0.3, 0.5], [0.65, 0.1], [1, 0]] as const;
const FLICKER = [[0, 1], [0.06, 0.75], [0.15, 0.2], [0.25, 0], [1, 0]] as const;

/** its light at a share of its charge: how bright (0.25 … 1), how warm (0 … 1), how much it flickers (0 … 1) */
export function lightAt(share: number): { bright: number; warm: number; flicker: number } {
  const r = Math.max(0, Math.min(1, share));
  return { bright: curve(BRIGHT, r), warm: curve(WARM, r), flicker: curve(FLICKER, r) };
}

/** its colour's temperature at a share of its charge (K) */
export function kelvinAt(share: number): number {
  return FLASHLIGHT.fullK + (FLASHLIGHT.lowK - FLASHLIGHT.fullK) * lightAt(share).warm;
}

/** a colour temperature as linear-ish RGB, 1 at its brightest channel (Tanner Helland's fit, near enough for a lamp) */
export function kelvinRgb(k: number, out: [number, number, number] = [1, 1, 1]): [number, number, number] {
  const t = k / 100;
  const r = t <= 66 ? 255 : 329.698727446 * Math.pow(t - 60, -0.1332047592);
  const g = t <= 66 ? 99.4708025861 * Math.log(t) - 161.1195681661 : 288.1221695283 * Math.pow(t - 60, -0.0755148492);
  const b = t >= 66 ? 255 : t <= 19 ? 0 : 138.5177312231 * Math.log(t - 10) - 305.0447927307;
  const c = (v: number) => Math.max(0, Math.min(255, v)) / 255;
  out[0] = c(r);
  out[1] = c(g);
  out[2] = c(b);
  return out;
}

/** the beam at a focus (0 wide … 1 narrow, eased): its half angles (rad), reach (m), how bright against the wide beam */
export function beamAt(focus: number): { half: number; inner: number; reach: number; gain: number } {
  const f = Math.max(0, Math.min(1, focus));
  const e = f * f * (3 - 2 * f);
  const W = FLASHLIGHT.wide;
  const N = FLASHLIGHT.narrow;
  const deg = W.deg + (N.deg - W.deg) * e;
  const inner = W.inner + (N.inner - W.inner) * e;
  const half = ((deg / 2) * Math.PI) / 180;
  return { half, inner: half * inner, reach: W.reach + (N.reach - W.reach) * e, gain: (W.cd + (N.cd - W.cd) * e) / W.cd };
}

/** its charge now */
export function lightCharge(t: ItemInstance): number {
  return chargeLeft(t, FLASHLIGHT.max);
}

/** switched on now */
export function isOn(t: ItemInstance): boolean {
  return !!t.state?.flashlight?.on;
}

/** switched on or off; false when it will not come on (its battery spent) */
export function switchLight(t: ItemInstance, on: boolean): boolean {
  if (on && lightCharge(t) <= 0) return false;
  t.state ??= {};
  const s = (t.state.flashlight ??= {});
  s.on = on;
  if (!on) delete s.was;
  return true;
}

/** put away (into the hotbar's other slot, a backpack, a box): off, remembering it was on */
export function stowLight(t: ItemInstance): void {
  const s = t.state?.flashlight;
  if (!s?.on) return;
  s.on = false;
  s.was = true;
}

/** back in the hands: on again if it was on when put away and has charge left */
export function unstowLight(t: ItemInstance): boolean {
  const s = t.state?.flashlight;
  if (!s?.was) return false;
  delete s.was;
  if (lightCharge(t) <= 0) return false;
  s.on = true;
  return true;
}

/** dt of it on: its charge drained; true when it has just run out (its battery spent: it sputters out) */
export function drainLight(t: ItemInstance, dt: number): boolean {
  if (!isOn(t) || dt <= 0) return false;
  const c = lightCharge(t);
  const left = Math.max(0, c - FLASHLIGHT.drain * dt);
  t.state ??= {};
  t.state.charge = left;
  if (left > 0) return false;
  t.state.flashlight!.on = false;
  return true;
}

/** the seconds it has left on (at its drain) */
export function lightLeftS(t: ItemInstance): number {
  return lightCharge(t) / FLASHLIGHT.drain;
}

/** a flashlight as found (once): three tenths to wholly charged, by `seed` */
export function foundLight(t: ItemInstance, seed: number): boolean {
  if (t.state?.found || t.state?.charge !== undefined) return false;
  const r = new Rng(hash2(seed | 0, 0xf1a5, 0x11));
  const [lo, hi] = FLASHLIGHT.found;
  t.state ??= {};
  t.state.charge = Math.round(FLASHLIGHT.max * (lo + r.next() * (hi - lo)) * 10) / 10;
  t.state.found = true;
  return true;
}

/**
 * The sputter as it runs out, `t` seconds into it: three pulses of 0.2 s, each dark (0.03) for its first half and
 * then at 0.8, 0.53 and 0.27 of the light; 0 once it is over.
 */
export function sputterAt(t: number): number {
  if (t < 0 || t >= FLASHLIGHT.sputterS) return 0;
  const pulse = FLASHLIGHT.sputterS / 3;
  const i = Math.floor(t / pulse);
  const into = t - i * pulse;
  if (into < pulse / 2) return 0.03;
  return [0.8, 0.533, 0.267][i] ?? 0;
}
