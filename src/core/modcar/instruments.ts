/**
 * What the cab's instruments show (docs/V3/plan/finish.md §五; the cluster itself is src/game/modcar/cluster.ts): the
 * dials' scales, where each needle stands for a reading, and the warning and indicator lamps — when each is lit and
 * how bright, as a real cluster's bulbs are.
 *
 * Scales as real ones are laid out: the speedometer to a little over what the vehicle's gearing gives at its red line
 * (as Nomad Drive works out its own, in steps of 20 or 40 km/h), the rev counter in thousands to the next whole
 * thousand past the red line, fuel E to F, the coolant C to H with the normal reading at the middle. The big dials turn
 * through 275° and the small ones through 90°, as Nomad Drive's do.
 *
 * The lamps are the ISO 2575 set a driver knows: the indicators (green, blinking with the hazard lights), dipped beam
 * (green) and main beam (blue); in red the parking brake (P), the brake system (!) when the brakes fade, oil pressure,
 * the charge lamp and the coolant's temperature; in amber low fuel, the engine and the tyre pressure. With the key on and
 * the engine stopped the charge and oil lamps are lit, as in any car. Turning the key to start lights every lamp for a
 * moment (the bulb check) and they go out one after another; a bulb comes up in 30 ms and fades in 80, and the whole
 * cluster dims a little with the engine off, sags while the starter turns, and is dimmer on a flat battery — Nomad
 * Drive's numbers.
 */
import type { Dash } from './systems';

const DEG = Math.PI / 180;

/** the lamps, in the order the bulb check lets them go out */
export const LAMP_IDS = ['turnL', 'turnR', 'low', 'high', 'park', 'brake', 'oil', 'charge', 'coolant', 'fuel', 'engine', 'tyre'] as const;
export type LampId = (typeof LAMP_IDS)[number];

export type LampColour = 'green' | 'blue' | 'red' | 'amber';

/** each lamp's colour (ISO 2575: red danger, amber caution, green working, blue main beam) and what it is called */
export const LAMP_INFO: Readonly<Record<LampId, { colour: LampColour; zh: string }>> = {
  turnL: { colour: 'green', zh: '左转向灯' },
  turnR: { colour: 'green', zh: '右转向灯' },
  low: { colour: 'green', zh: '近光灯' },
  high: { colour: 'blue', zh: '远光灯' },
  park: { colour: 'red', zh: '手刹' },
  brake: { colour: 'red', zh: '刹车系统' },
  oil: { colour: 'red', zh: '机油压力' },
  charge: { colour: 'red', zh: '充电' },
  coolant: { colour: 'red', zh: '水温过高' },
  fuel: { colour: 'amber', zh: '油量低' },
  engine: { colour: 'amber', zh: '发动机故障' },
  tyre: { colour: 'amber', zh: '胎压' },
};

/** the lamps' light (sRGB) */
export const LAMP_HEX: Readonly<Record<LampColour, string>> = { green: '#3fe06a', blue: '#3d8bff', red: '#ff3a2e', amber: '#ffb12a' };

/** the big dials' sweep and the small ones' (°), as Nomad Drive's */
export const BIG_SWEEP = 275;
export const SMALL_SWEEP = 90;

/** a speedometer's scale: its last numeral and the step between numerals (km/h) */
export interface SpeedScale {
  max: number;
  step: number;
}

/**
 * The speedometer's scale for a vehicle that does `topKmh` at its red line in its tallest gear: a tenth over that,
 * up to the next numeral — numerals every 20 km/h up to 180, every 40 beyond — at least 120, at most 280.
 */
export function speedScale(topKmh: number): SpeedScale {
  const t = Math.min(260, Math.max(100, Number.isFinite(topKmh) ? topKmh : 160)) * 1.1;
  const step = t <= 180 ? 20 : 40;
  const max = Math.min(280, Math.max(120, Math.ceil(t / step) * step));
  return { max, step };
}

/** what a vehicle does at its red line in its tallest gear (km/h), from its gearing, as Nomad Drive works its dial out */
export function gearedTopKmh(spec: { engine: { redline: number }; gearbox: { ratios: number[]; final: number }; wheelRadius: number }): number {
  const fwd = spec.gearbox.ratios.filter((g) => g > 0);
  if (!fwd.length || spec.gearbox.final <= 0) return 160;
  const wheelRpm = spec.engine.redline / (Math.min(...fwd) * spec.gearbox.final);
  return ((wheelRpm * Math.PI) / 30) * spec.wheelRadius * 3.6;
}

/** a rev counter's scale: its last numeral (thousands a minute) and where its red begins (rpm) */
export interface RpmScale {
  max: number;
  red: number;
}

/** the rev counter for an engine whose red line is `redline`: in thousands, to the next whole one past it (5 … 9) */
export function rpmScale(redline: number): RpmScale {
  const r = Number.isFinite(redline) && redline > 0 ? redline : 6000;
  const max = Math.min(9, Math.max(5, Math.floor(r / 1000) + 1));
  return { max, red: Math.min(r, max * 1000) };
}

/** the coolant's dial: C at 50 °C, the middle at 90 (where a warm engine sits), H at 130; its red from 112, where the engine loses power */
export const TEMP_C = 50;
export const TEMP_H = 130;
export const TEMP_RED = 112;

export function tempFrac(c: number): number {
  return Math.min(1, Math.max(0, (c - TEMP_C) / (TEMP_H - TEMP_C)));
}

/** the needles of a cluster */
export type NeedleKind = 'speed' | 'rpm' | 'fuel' | 'temp';

/** where a needle stands (0 … 1 of its dial) for what the vehicle reads; with the key off the fuel and the coolant rest at their stops */
export function needleFrac(kind: NeedleKind, d: { kmh: number; rpm: number; fuel: number; coolantC: number }, power: boolean, speed: SpeedScale, rpm: RpmScale): number {
  switch (kind) {
    case 'speed':
      return Math.min(1, Math.abs(d.kmh) / speed.max);
    case 'rpm':
      return power ? Math.min(1, Math.max(0, d.rpm / (rpm.max * 1000))) : 0;
    case 'fuel':
      return power ? Math.min(1, Math.max(0, d.fuel)) : 0;
    case 'temp':
      return power ? tempFrac(d.coolantC) : 0;
  }
}

/**
 * The angle of a needle at `frac` of its dial, clockwise from straight up as the driver sees it (rad): the big dials
 * from 137.5° left of the top round to 137.5° right of it; the small ones a quarter turn — from pointing left to
 * pointing up about a quarter dial's pivot in its corner, or across the top of a round one (45° either side).
 */
export function needleAngle(kind: NeedleKind, frac: number, form: 'quarter' | 'round' = 'quarter'): number {
  const f = Math.min(1, Math.max(0, frac));
  if (kind === 'speed' || kind === 'rpm') return (-BIG_SWEEP / 2 + BIG_SWEEP * f) * DEG;
  return ((form === 'round' ? -SMALL_SWEEP / 2 : -90) + SMALL_SWEEP * f) * DEG;
}

/** how quickly each needle follows (s): the speed and the revs at once, as Nomad Drive's do; fuel and coolant damped as real ones are */
export const NEEDLE_TAU: Readonly<Record<NeedleKind, number>> = { speed: 0.05, rpm: 0.05, fuel: 0.8, temp: 0.6 };

/** what the lamps are told besides the dashboard's data */
export interface LampInput {
  /** the key on: the driver at the wheel or the engine running, with a battery that has something in it */
  power: boolean;
  /** the hazard lights' lamps lit this moment (both indicators blink with them) */
  blink: boolean;
}

/** a brake that has lost this much of its bite lights the brake system's lamp (brakeHeat.ts: a drum fades first) */
export const BRAKE_FADE_LAMP = 0.85;

/** whether each lamp's condition holds now */
export function lampsWanted(d: Dash, i: LampInput, out: Record<LampId, boolean> = {} as Record<LampId, boolean>): Record<LampId, boolean> {
  const on = i.power;
  const stopped = !d.running;
  out.turnL = on && i.blink;
  out.turnR = on && i.blink;
  out.high = on && d.lightsOn && d.lights === 'high';
  out.low = on && d.lightsOn && d.lights !== 'high';
  out.park = on && d.handbrake;
  out.brake = on && d.brakes.some((b) => b.bite < BRAKE_FADE_LAMP);
  // (no pressure and no charge with the engine stopped: both lit with the key on, as in any car)
  out.oil = on && (stopped || d.lamps.oil);
  out.charge = on && (stopped || d.lamps.battery);
  out.coolant = on && d.lamps.temp;
  out.fuel = on && d.lamps.fuel;
  out.engine = on && d.lamps.check;
  out.tyre = on && d.tyres.some((t) => t.tread >= 0 && t.flat);
  return out;
}

/** the bulbs' character (Nomad Drive's classic, incandescent cluster) */
export const BULB = {
  /** time constants of a bulb coming up and going out (s) */
  attack: 0.03,
  release: 0.08,
  /** every lamp lit at least this long after the key is turned, and a quarter of a second past the starter; then one by one, this far apart (s) */
  check: 1.2,
  checkPast: 0.25,
  stagger: 0.05,
  /** the light with the engine stopped (the battery alone), while the starter turns, and on a flat battery (below 0.3 of its charge) */
  engineOff: 0.93,
  crankSag: 0.45,
  crankFlicker: 0.15,
  weakFloor: 0.55,
  weakBelow: 0.3,
};

function smoothstep01(x: number): number {
  const t = Math.min(1, Math.max(0, x));
  return t * t * (3 - 2 * t);
}

/**
 * The cluster's bulbs: each lamp's light 0 … 1 (`out`) after its bulb's rise and fall, the bulb check at the turn of
 * the key, and the supply (`supply`, 0 … 1) the whole cluster is lit by — the dials' lighting with it.
 */
export class Telltales {
  readonly out = Object.fromEntries(LAMP_IDS.map((id) => [id, 0])) as Record<LampId, number>;
  private readonly want = Object.fromEntries(LAMP_IDS.map((id) => [id, false])) as Record<LampId, boolean>;
  /** the light the cluster is given now */
  supply = 1;
  /** seconds since the key was turned to start (−1: no bulb check under way), and how long the starter has turned */
  private checkT = -1;
  private crankT = 0;
  private wasCranking = false;
  private flickerT = 0;

  /** a bulb check under way: every lamp lit by it until it lets each go */
  get checking(): boolean {
    return this.checkT >= 0;
  }

  /**
   * A step of `dt` s: `d` the dashboard's data, `power` the key on, `blink` the hazards' lamps lit, `battery` its charge
   * (0 … 1). Snaps where `dt` is Infinity (a cluster just made).
   */
  update(dt: number, d: Dash, power: boolean, blink: boolean, battery: number): void {
    lampsWanted(d, { power, blink }, this.want);
    // the bulb check: the key turned to start from a stopped engine
    const cranking = power && d.cranking;
    if (cranking && !this.wasCranking && !d.running) {
      this.checkT = 0;
      this.crankT = 0;
    }
    this.wasCranking = cranking;
    if (!power) this.checkT = -1;
    let checkEnd = 0;
    if (this.checkT >= 0) {
      if (cranking) this.crankT = this.checkT + (Number.isFinite(dt) ? dt : 0);
      this.checkT += Number.isFinite(dt) ? dt : 0;
      checkEnd = Math.max(BULB.check, this.crankT + BULB.checkPast);
      if (this.checkT > checkEnd + BULB.stagger * LAMP_IDS.length) this.checkT = -1;
    }
    // the supply: the battery alone with the engine stopped, sagging and flickering while the starter turns, dim on a flat battery
    let s = 0;
    if (power) {
      const weak = smoothstep01(battery / BULB.weakBelow);
      s = BULB.weakFloor + ((d.running ? 1 : BULB.engineOff) - BULB.weakFloor) * weak;
      if (cranking) {
        this.flickerT += Number.isFinite(dt) ? dt : 0;
        const fl = Math.sin(this.flickerT * 18 * 2.1) * 0.6 + Math.sin(this.flickerT * 18 * 3.7 + 1.3) * 0.4;
        s *= Math.min(1, Math.max(0, BULB.crankSag + fl * BULB.crankFlicker));
      }
    }
    this.supply = s;
    for (let i = 0; i < LAMP_IDS.length; i++) {
      const id = LAMP_IDS[i];
      const forced = this.checkT >= 0 && this.checkT < checkEnd + i * BULB.stagger;
      const target = this.want[id] || forced ? 1 : 0;
      const o = this.out[id];
      if (o === target) continue;
      const k = Number.isFinite(dt) ? 1 - Math.exp(-dt / (target > o ? BULB.attack : BULB.release)) : 1;
      const n = o + (target - o) * k;
      this.out[id] = Math.abs(target - n) < 0.002 ? target : n;
    }
  }

  /** a lamp's light as it shows: its bulb times the supply */
  light(id: LampId): number {
    return this.out[id] * this.supply;
  }
}

/** a tyre's stage for the cluster's display (tyres.ts tyreStage: 0 new … 3 worn through), −1 none, 4 blown */
export type TyreShown = number;
