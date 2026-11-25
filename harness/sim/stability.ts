/**
 * The stability gate's rig (docs/V3/plan/finish.md §四.1): a stock build with a load, set at a speed on a ground,
 * driven through a manoeuvre by a script of the driver's inputs; what its body did — how far it rolled, how long it
 * stood on the wheels of one side, how fast it spun, whether it lies on its side at the end.
 *
 * No world, no three: the simulation's own ground (a plane with a grip, and what the manoeuvres need on it — two
 * grips side by side, a cross slope, a shoulder to drop off, a kerb to slide into, a crest to fly over).
 */
import { stockBuild } from '../../src/core/modcar/build';
import { zonesFor } from '../../src/core/modcar/cargo';
import { derive, type Derived } from '../../src/core/modcar/derive';
import { frameDef } from '../../src/core/modcar/frames';
import { applyToSim } from '../../src/core/modcar/simlink';
import type { Build } from '../../src/core/modcar/types';
import { VehicleSim, zeroInput, type VehicleInput } from '../../src/core/vehicle/sim';
import type { VehicleSpec } from '../../src/core/vehicle/spec';
import { Surface, SURFACES, type Ground, type GroundSample } from '../../src/core/world/ground';

const KMH = 1 / 3.6;
const DEG = 180 / Math.PI;

/** the fourteen one drives (the Tadpole is towed) */
export const DRIVEN = ['sedan', 'pickup', 'moto', 'van', 'goat', 'wagon', 'fox', 'snail', 'buffalo', 'rhino', 'rv', 'turtle', 'elephant', 'camel'] as const;
/** the ones with a living space: tall, and held to less roll */
export const HOMES: ReadonlySet<string> = new Set(['rv', 'turtle', 'elephant', 'camel']);

export type Load = 'empty' | 'full' | 'roof' | 'trailer' | 'moto';
export const LOADS: readonly Load[] = ['empty', 'full', 'roof', 'trailer', 'moto'];

/** the grounds by name: what the tyres find on them (the grip of a wet road is the weather's 0.75 of a dry one) */
export const GRIPS = {
  dry: { surface: Surface.Asphalt, mu: 1 },
  wet: { surface: Surface.Asphalt, mu: 0.75 },
  gravel: { surface: Surface.Gravel, mu: SURFACES[Surface.Gravel].mu },
  grass: { surface: Surface.Grass, mu: SURFACES[Surface.Grass].mu },
  snow: { surface: Surface.Snow, mu: SURFACES[Surface.Snow].mu },
} as const;
export type Grip = keyof typeof GRIPS;

export interface PadOptions {
  grip: Grip;
  /** right of the middle line (z > 0) another ground */
  right?: Grip;
  /** the whole plane leans: so much down to the right for each metre (0.15: a 15 % cross slope) */
  cross?: number;
  /** right of z = `at` the ground is `depth` lower (a shoulder: + down; a kerb: − up), over `over` metres */
  step?: { at: number; depth: number; over: number };
  /** a crest across the way at x = `at`: `rise` high, `run` long each side */
  crest?: { at: number; rise: number; run: number };
}

const smooth = (x: number): number => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));

/** the ground of a manoeuvre */
export class Pad implements Ground {
  constructor(readonly o: PadOptions) {}

  height(x: number, z: number): number {
    const o = this.o;
    let h = 0;
    if (o.cross) h -= o.cross * z;
    if (o.step) h -= o.step.depth * smooth((z - o.step.at) / o.step.over);
    if (o.crest) {
      const u = Math.abs(x - o.crest.at) / o.crest.run;
      if (u < 1) h += o.crest.rise * (1 - smooth(u));
    }
    return h;
  }

  sample(x: number, z: number, out: GroundSample): void {
    const e = 0.02;
    const h = this.height(x, z);
    const dhx = (this.height(x + e, z) - this.height(x - e, z)) / (2 * e);
    const dhz = (this.height(x, z + e) - this.height(x, z - e)) / (2 * e);
    const inv = 1 / Math.sqrt(dhx * dhx + 1 + dhz * dhz);
    out.h = h;
    out.nx = -dhx * inv;
    out.ny = inv;
    out.nz = -dhz * inv;
    const g = GRIPS[this.o.right && z > 0 ? this.o.right : this.o.grip];
    out.surface = g.surface;
    out.mu = g.mu;
    out.rr = SURFACES[g.surface].rr;
  }
}

/** a stock build of a frame carrying a load (the masses as the game adds them: Build.cargo) */
export function loaded(frameId: string, load: Load): Build | null {
  const b = stockBuild(frameId, { fuel: 0.6 });
  const f = frameDef(frameId);
  const kerb = derive(b).mass;
  if (load === 'empty') return b;
  if (load === 'full') {
    // every floor it has, filled: a third of what it weighs between them (150 kg at least, 900 at most), a hand above each floor
    const zones = zonesFor(frameId, b).filter((z) => !z.wall && z.id !== 'roof');
    if (!zones.length) return null;
    const m = Math.max(150, Math.min(900, kerb * 0.33)) / zones.length;
    b.cargo = zones.map((z) => ({ m, x: (z.x[0] + z.x[1]) / 2, y: z.floor + 0.3, z: (z.z[0] + z.z[1]) / 2 }));
    return b;
  }
  if (load === 'roof') {
    // 80 kg on the roof, where a rack would carry it (the rack's own weight with it)
    if (f.balance) return null;
    b.cargo = [{ m: 95, x: 0, y: f.body.top + 0.2, z: 0 }];
    return b;
  }
  if (load === 'trailer') {
    // the Tadpole with 250 kg in it, as the towing puts its weight on the one that pulls it (12 % on the ball, the rest at its middle)
    if (f.balance || frameId === 'trailer') return null;
    const t = derive(stockBuild('trailer', {})).mass + 250;
    b.cargo = [
      { m: t * 0.12, x: f.body.rear - 0.15, y: 0.45, z: 0 },
      { m: t * 0.88, x: 0, y: 0.5, z: 0 },
    ];
    return b;
  }
  // a motorcycle on a rack behind it (the Swallow's 170 kg, half a metre out behind the body)
  if (f.balance) return null;
  b.cargo = [{ m: 170, x: f.body.rear - 0.5, y: 0.75, z: 0 }];
  return b;
}

/** what the driver does: told the time since the manoeuvre began and the car, it sets the inputs (throttle is the rig's unless it sets `coast`) */
export interface Script {
  /** how long it lasts (s) */
  seconds: number;
  /** the speed it is entered at (km/h) */
  kmh: number;
  /** sideways speed it is entered with (m/s, + to the right): a slide */
  slide?: number;
  drive(t: number, sim: VehicleSim, inp: VehicleInput): void;
  /** the rig holds the entry speed on the throttle while this says so (default: all the way) */
  holds?(t: number): boolean;
}

export interface Outcome {
  /** the most it rolled, against the ground it stood on (°) */
  roll: number;
  /** the longest it stood on the wheels of one side alone (s) */
  onSide: number;
  /** the longest it had no wheel on the ground (s) */
  air: number;
  /** the fastest it turned (°/s) and how far its heading had turned by the end (°) */
  spin: number;
  turned: number;
  /** on its side or its roof at the end, or the run blew up */
  lying: boolean;
  /** how far it went sideways from its line (m) and how fast it was at the end (km/h) */
  off: number;
  kmhEnd: number;
  /** the entry speed was reached (a heavy one may not reach a fast one: the run is not held against it) */
  entered: boolean;
}

const made = new Map<string, Derived | null>();

/** the derived build of a frame with a load (kept: the gate asks for each many times) */
export function derivedOf(frameId: string, load: Load): Derived | null {
  const key = `${frameId}|${load}`;
  let d = made.get(key);
  if (d === undefined) {
    const b = loaded(frameId, load);
    d = b ? derive(b) : null;
    made.set(key, d);
  }
  return d;
}

/** what a frame reaches flat out on dry asphalt (km/h; kept) */
const tops = new Map<string, number>();
export function topSpeed(frameId: string): number {
  let top = tops.get(frameId);
  if (top === undefined) {
    const d = derivedOf(frameId, 'empty')!;
    const g = new Pad({ grip: 'dry' });
    const v = new VehicleSim(d.spec as VehicleSpec);
    applyToSim(v, d, true);
    v.reset(0, 0.05, 0, 0, g);
    v.setParkBrake(false);
    const inp = zeroInput();
    inp.throttle = 1;
    let best = 0;
    let since = 0;
    for (let t = 0; t < 150 && since < 6; t += v.h) {
      v.substep(inp, g);
      if (v.vForward > best + 0.05) {
        best = v.vForward;
        since = 0;
      } else since += v.h;
    }
    top = best / KMH;
    tops.set(frameId, top);
  }
  return top;
}

/** run a script: the car set down on the pad at the entry speed along +x, its middle on z = `z0` */
export function run(d: Derived, pad: Pad, s: Script, z0 = 0, mods?: (sim: VehicleSim) => void): Outcome {
  const v = new VehicleSim(d.spec as VehicleSpec);
  applyToSim(v, d, true);
  mods?.(v);
  v.reset(0, pad.height(0, z0) + 0.05, z0, 0, pad);
  v.setParkBrake(false);
  v.autoReverse = false;
  const inp = zeroInput();
  // settle on its springs, then away at the entry speed (a moment for the gearbox to find its gear)
  for (let t = 0; t < 1; t += v.h) v.substep(inp, pad);
  v.shift('D');
  const v0 = s.kmh * KMH;
  v.vx = v0;
  v.vz = s.slide ?? 0;
  const hold = (): void => {
    const err = v0 - v.vForward;
    inp.throttle = Math.max(0, Math.min(1, err * 0.6 + 0.3));
  };
  for (let t = 0; t < 1.2; t += v.h) {
    hold();
    // (a slide is kept up to the manoeuvre's beginning: it is what the manoeuvre is)
    if (s.slide) v.vz = s.slide;
    v.substep(inp, pad);
  }
  const entered = Math.abs(v.vForward - v0) < Math.max(1.5, v0 * 0.08);
  const slope = Math.atan(pad.o.cross ?? 0);
  const out: Outcome = { roll: 0, onSide: 0, air: 0, spin: 0, turned: 0, lying: false, off: 0, kmhEnd: 0, entered };
  const yaw0 = v.yaw;
  const zStart = v.pz;
  let side = 0;
  let air = 0;
  let turned = 0;
  let yawWas = yaw0;
  const W = v.wheels;
  for (let t = 0; t < s.seconds && !v.exploded; t += v.h) {
    inp.steer = 0;
    inp.brake = 0;
    inp.handbrake = 0;
    if (!s.holds || s.holds(t)) hold();
    else inp.throttle = 0;
    s.drive(t, v, inp);
    v.substep(inp, pad);
    const roll = Math.abs(v.roll - slope) * DEG;
    if (roll > out.roll) out.roll = roll;
    const l = W[0].contact || W[2].contact;
    const r = W[1].contact || W[3].contact;
    side = l !== r ? side + v.h : 0;
    if (side > out.onSide) out.onSide = side;
    air = !l && !r ? air + v.h : 0;
    if (air > out.air) out.air = air;
    const sp = Math.abs(v.yawRate) * DEG;
    if (sp > out.spin) out.spin = sp;
    let dy = v.yaw - yawWas;
    dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    turned += dy;
    yawWas = v.yaw;
    const off = Math.abs(v.pz - zStart);
    if (off > out.off) out.off = off;
  }
  // (and what it comes to rest as: let go of everything for a moment)
  const rest = zeroInput();
  rest.brake = 1;
  for (let t = 0; t < 2.5 && !v.exploded; t += v.h) v.substep(rest, pad);
  out.turned = Math.abs(turned) * DEG;
  out.kmhEnd = v.speed / KMH;
  out.lying = v.exploded || Math.abs(v.roll - slope) * DEG > 45 || (!!d.frame.balance && (v as unknown as { balDown: boolean }).balDown);
  return out;
}

// ------------------------------------------------------------------ the manoeuvres

/** the wheel put hard over and held */
export const lock = (kmh: number, dir = 1): Script => ({
  seconds: 5,
  kmh,
  drive: (t, _v, inp) => {
    inp.steer = t > 0.3 ? dir : 0;
  },
});

/** lane to lane and back, thrice: hard over each way for as long as the body takes to follow */
export const lanes = (kmh: number, beat = 0.7): Script => ({
  seconds: beat * 8 + 2,
  kmh,
  drive: (t, _v, inp) => {
    const k = Math.floor(t / beat);
    inp.steer = k >= 8 ? 0 : k % 2 === 0 ? 1 : -1;
  },
});

/** in a bend, the throttle let go at once */
export const liftOff = (kmh: number): Script => ({
  seconds: 6,
  kmh,
  holds: (t) => t < 2.5,
  drive: (_t, _v, inp) => {
    inp.steer = 0.8;
  },
});

/** in a bend, the brake stood on */
export const brakeInBend = (kmh: number): Script => ({
  seconds: 6,
  kmh,
  holds: (t) => t < 2.5,
  drive: (t, _v, inp) => {
    inp.steer = 0.8;
    if (t >= 2.5) inp.brake = 1;
  },
});

/** straight, the brake stood on (on two grips: the left wheels on one, the right on the other) */
export const brake = (kmh: number): Script => ({
  seconds: 7,
  kmh,
  holds: (t) => t < 0.5,
  drive: (t, _v, inp) => {
    if (t >= 0.5) inp.brake = 1;
  },
});

/** along a cross slope, with a turn up it and a turn down it on the way */
export const traverse = (kmh: number): Script => ({
  seconds: 8,
  kmh,
  drive: (t, _v, inp) => {
    inp.steer = t > 2 && t < 3.2 ? -0.6 : t > 4.5 && t < 5.7 ? 0.6 : 0;
  },
});

/** the right wheels off the shoulder, then steered hard back up onto the road */
export const shoulder = (kmh: number): Script => ({
  seconds: 7,
  kmh,
  drive: (t, _v, inp) => {
    inp.steer = t < 0.6 ? 0.25 : t < 2.2 ? 0 : t < 3.2 ? -0.9 : t < 4.0 ? 0.6 : 0;
  },
});

/** sliding sideways (to the right) into a kerb */
export const kerbSlide = (kmh: number, slide: number): Script => ({
  seconds: 5,
  kmh,
  slide,
  holds: () => false,
  drive: () => undefined,
});

/** over a crest, turning a little as it lands */
export const crest = (kmh: number): Script => ({
  seconds: 6,
  kmh,
  drive: (t, _v, inp) => {
    inp.steer = t > 1.2 && t < 2.4 ? 0.3 : 0;
  },
});
