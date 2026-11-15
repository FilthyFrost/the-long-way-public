/**
 * Suspension re-derived for a build that does not weigh what its frame was tuned for, or stands on
 * other tyres (docs/MODCAR.md §4: the frequency softens with √(reference mass / mass) — a loaded or
 * armoured car "sinks").
 *
 * An AxleSpec is a tuning for one corner mass, but the spring, the damper and the anti-roll bar are
 * physical parts: hung with more weight the same spring rings lower and sags further, the same damper
 * damps it less, the same bar resists roll as much as before. A tyre's sidewall is a spring in series
 * with them: a tall one makes the ride softer and bouncier.
 */
import { GRAVITY } from './sim';
import type { AxleSpec, VehicleSpec } from './spec';

/** a tyre's own vertical rate (N/m) per metre of sidewall is about this over its sidewall height */
const TYRE_RATE_X_SIDEWALL = 20000;
/** damping ratios the rescaled axle is kept within: under-damped enough to feel, never undamped */
const ZETA_MIN = 0.12;
const ZETA_MAX = 1.0;
/**
 * At rest a corner stays this share of its travel clear of the bump stop (which the simulation
 * starts 35 mm before full bump): an overload sits low, and the stop takes what is left over.
 */
const BUMP_CLEAR = 0.1;
const BUMP_STOP = 0.035;

export interface CornerLoad {
  /** sprung mass on one corner of the axle (kg) */
  mass: number;
  /** sidewall height of the tyre on it (m); omitted = the tyre plays no part */
  sidewall?: number;
}

/** series rate of a spring k and a tyre with this sidewall (N/m) */
function withTyre(k: number, sidewall: number | undefined): number {
  if (!sidewall || sidewall <= 0) return k;
  const kt = TYRE_RATE_X_SIDEWALL / sidewall;
  return (k * kt) / (k + kt);
}

/**
 * The axle as the same physical springs, dampers and bar make it when the corner carries `now`
 * instead of `ref` (the load the tuning in `axle` was made for). It also records the reference ride
 * (rideComp: more weight sinks the body) and the reference tyre load (tyreLoad: more weight, less
 * grip per newton) unless the axle has its own. Travel, brakes and the steering and drive flags are
 * left alone.
 */
export function rescaleAxle(axle: AxleSpec, ref: CornerLoad, now: CornerLoad): AxleSpec {
  const mr = Math.max(1e-3, ref.mass);
  const mn = Math.max(1e-3, now.mass);
  const om = 2 * Math.PI * axle.springHz;
  // what the tuning means at its own load: the wheel rate and the damper, both with the tyre in
  const kRefEff = mr * om * om;
  // the bare spring behind the reference tyre (the tuning is what the driver felt, tyre included)
  let ks = kRefEff;
  if (ref.sidewall && ref.sidewall > 0) {
    const kt = TYRE_RATE_X_SIDEWALL / ref.sidewall;
    ks = kt > kRefEff * 1.05 ? (kRefEff * kt) / (kt - kRefEff) : kRefEff * 20;
  }
  const kNow = withTyre(ks, now.sidewall ?? ref.sidewall);
  const c = axle.dampingRatio * 2 * Math.sqrt(kRefEff * mr);
  const springHz = Math.sqrt(kNow / mn) / (2 * Math.PI);
  const dampingRatio = Math.min(ZETA_MAX, Math.max(ZETA_MIN, c / (2 * Math.sqrt(kNow * mn))));
  // the anti-roll bar is a rate of its own: the sim gives it as a multiple of the wheel rate
  const antiRollRatio = (axle.antiRollRatio * kRefEff) / kNow;
  // the hub mounts are placed for the reference ride: what the springs compress beyond it sinks the body
  const naturalRef = (mr * GRAVITY) / kRefEff;
  const rideComp = axle.rideComp ?? (axle.sag !== undefined ? Math.min(naturalRef, axle.sag * axle.travel) : naturalRef);
  // the tyres were chosen for the frame's load: more weight on them, less grip per newton
  const tyreLoad = axle.tyreLoad ?? mr * GRAVITY;
  const out: AxleSpec = { ...axle, springHz, dampingRatio, antiRollRatio, rideComp, tyreLoad };
  const maxSag = Math.max(0.05, (axle.travel * (1 - BUMP_CLEAR) - BUMP_STOP) / axle.travel);
  if (axle.sag !== undefined) {
    // the preload is a fixed spring length: the extra weight compresses the spring past it
    const scRef = Math.min(naturalRef, axle.sag * axle.travel);
    const preloadForce = kRefEff * (naturalRef - scRef);
    const scNow = (mn * GRAVITY - preloadForce) / kNow;
    out.sag = Math.min(maxSag, Math.max(0.05, scNow / axle.travel));
  } else if ((mn * GRAVITY) / kNow > maxSag * axle.travel) {
    // an overload: the corner sits just clear of its bump stop, which takes the rest
    out.sag = maxSag;
  }
  return out;
}

/** the reference a frame's suspension was tuned at: the whole vehicle's mass and front share, and its tyres */
export interface SuspensionRef {
  mass: number;
  weightFront: number;
  /** sidewall of the reference tyres, front and rear (m) */
  sidewall?: [number, number];
}

/**
 * Both axles of `spec` (tuned for `ref`) rescaled for the mass and weight distribution `spec` has,
 * standing on tyres with `sidewall` (front, rear; m; omitted = the reference tyres).
 */
export function rescaleSuspension(spec: VehicleSpec, ref: SuspensionRef, sidewall?: [number, number]): VehicleSpec {
  const corner = (mass: number, share: number): number => (mass * share) / 2;
  const front = rescaleAxle(
    spec.front,
    { mass: corner(ref.mass, ref.weightFront), sidewall: ref.sidewall?.[0] },
    { mass: corner(spec.mass, spec.weightFront), sidewall: sidewall?.[0] ?? ref.sidewall?.[0] },
  );
  const rear = rescaleAxle(
    spec.rear,
    { mass: corner(ref.mass, 1 - ref.weightFront), sidewall: ref.sidewall?.[1] },
    { mass: corner(spec.mass, 1 - spec.weightFront), sidewall: sidewall?.[1] ?? ref.sidewall?.[1] },
  );
  return { ...spec, front, rear };
}
