/**
 * Plausible VehicleSpecs for the ModCar physics tests and measurements, built the way a parts derive
 * would (docs/MODCAR.md §2.2, §4): a frame (dimensions, suspension tuned at a reference load, brakes,
 * steering) plus the mass, centre of gravity, wheels, engine and gearbox of whatever is fitted.
 * The lead's src/core/modcar/derive.ts is the real one; this is the tests' own small generator.
 */
import { Rng } from '../../../src/core/math/rng';
import { WheelFit, type SimMods } from '../../../src/core/vehicle/mods';
import { rescaleSuspension } from '../../../src/core/vehicle/rescale';
import type { AbsentParts, AxleSpec, VehicleSpec } from '../../../src/core/vehicle/spec';

export type FrameId = 'sedan' | 'pickup' | 'moto' | 'rv';

interface Frame {
  length: number;
  width: number;
  height: number;
  wheelbase: number;
  track: [number, number];
  radius: number;
  /** frame + stock parts + driver (kg), the load its suspension is tuned at, and its front share */
  refMass: number;
  refFront: number;
  refCg: number;
  /** body ground clearance (m) at the reference ride */
  clearance: number;
  cdA: number;
  /** service brake force (N) */
  brakeN: number;
  front: AxleSpec;
  rear: AxleSpec;
  steering: VehicleSpec['steering'];
  sidewall: number;
  single?: boolean;
}

const axle = (o: Partial<AxleSpec>): AxleSpec => ({
  track: 1.3,
  springHz: 1.4,
  dampingRatio: 0.32,
  bumpScale: 0.7,
  reboundScale: 1.3,
  travel: 0.2,
  sag: 0.55,
  antiRollRatio: 0.5,
  muScale: 1,
  slipPeakDeg: 10,
  brakeShare: 0.5,
  steerable: false,
  driven: false,
  handbrake: false,
  ...o,
});

const carSteer = (maxDeg: number, ratio: number, slow = 1): VehicleSpec['steering'] => ({
  maxDeg,
  ratio,
  rateLow: 1.8 / slow,
  rateHigh: 0.65 / slow,
  smoothTime: 0.1 * slow,
  returnScale: 1.6,
  ackermann: 0.8,
  gripLimitG: 0.68,
  slipMarginDeg: 6,
});

export const FRAMES: Record<FrameId, Frame> = {
  sedan: {
    length: 4.05, width: 1.62, height: 1.42, wheelbase: 2.42, track: [1.35, 1.32], radius: 0.285,
    refMass: 1000, refFront: 0.53, refCg: 0.52, clearance: 0.15, cdA: 0.85, brakeN: 8400,
    front: axle({ track: 1.35, springHz: 1.45, travel: 0.19, antiRollRatio: 0.6, brakeShare: 0.68, steerable: true, slipPeakDeg: 10 }),
    rear: axle({ track: 1.32, springHz: 1.6, travel: 0.19, antiRollRatio: 0.3, brakeShare: 0.32, driven: true, handbrake: true, slipPeakDeg: 9 }),
    steering: carSteer(36, 16),
    sidewall: 0.09,
  },
  pickup: {
    length: 4.6, width: 1.68, height: 1.62, wheelbase: 2.8, track: [1.4, 1.38], radius: 0.34,
    refMass: 1380, refFront: 0.56, refCg: 0.66, clearance: 0.22, cdA: 1.35, brakeN: 10500,
    front: axle({ track: 1.4, springHz: 1.35, travel: 0.22, antiRollRatio: 0.55, brakeShare: 0.66, steerable: true, slipPeakDeg: 10.5 }),
    rear: axle({ track: 1.38, springHz: 1.55, travel: 0.22, antiRollRatio: 0.25, brakeShare: 0.34, driven: true, handbrake: true, slipPeakDeg: 9.5 }),
    steering: carSteer(35, 18, 1.1),
    sidewall: 0.12,
  },
  moto: {
    length: 2.1, width: 0.8, height: 1.1, wheelbase: 1.38, track: [0, 0], radius: 0.31,
    refMass: 235, refFront: 0.45, refCg: 0.62, clearance: 0.16, cdA: 0.55, brakeN: 2200,
    front: axle({ track: 0, springHz: 1.6, dampingRatio: 0.35, travel: 0.13, sag: 0.35, antiRollRatio: 0, brakeShare: 0.7, steerable: true, slipPeakDeg: 8 }),
    rear: axle({ track: 0, springHz: 1.8, dampingRatio: 0.35, travel: 0.11, sag: 0.35, antiRollRatio: 0, brakeShare: 0.3, driven: true, slipPeakDeg: 7 }),
    steering: { maxDeg: 32, ratio: 1, rateLow: 2.6, rateHigh: 1.0, smoothTime: 0.08, returnScale: 1.6, ackermann: 0, gripLimitG: 0.85, slipMarginDeg: 4 },
    sidewall: 0.08,
    single: true,
  },
  rv: {
    length: 6.8, width: 2.25, height: 3.05, wheelbase: 3.8, track: [1.75, 1.7], radius: 0.39,
    refMass: 3700, refFront: 0.44, refCg: 1.0, clearance: 0.24, cdA: 4.2, brakeN: 21000,
    front: axle({ track: 1.75, springHz: 1.15, dampingRatio: 0.3, travel: 0.2, antiRollRatio: 0.5, brakeShare: 0.5, steerable: true, slipPeakDeg: 11 }),
    rear: axle({ track: 1.7, springHz: 1.3, dampingRatio: 0.32, travel: 0.2, antiRollRatio: 0.3, brakeShare: 0.5, driven: true, handbrake: true, slipPeakDeg: 9 }),
    steering: carSteer(38, 22, 1.4),
    sidewall: 0.14,
  },
};

/**
 * A torque curve with a broad mid-range hump whose power peaks at `kW` near the redline; the redline
 * follows from the power and the peak torque (P = T·ω), within 1800–11000 rpm.
 */
export function engineFor(kW: number, nm: number): VehicleSpec['engine'] {
  const rf = [0.13, 0.25, 0.45, 0.6, 0.75, 0.88, 1.0];
  const tf = [0.62, 0.8, 1.0, 0.99, 0.94, 0.86, 0.72];
  // power peaks at 0.88 of the redline with 0.86 of the peak torque
  let redline = (kW * 1000) / (0.86 * 0.88 * nm * (Math.PI / 30));
  redline = Math.min(11000, Math.max(1800, redline));
  const peak = (kW * 1000) / (0.86 * 0.88 * redline * (Math.PI / 30));
  const curve: [number, number][] = rf.map((r, i) => [Math.round(r * redline), peak * tf[i]]);
  curve.push([Math.round(1.05 * redline), 0]);
  const idle = Math.max(600, Math.round(0.13 * redline));
  return { curve, idle, stall: Math.round(Math.min(0.42 * redline, idle + 1400)), redline: Math.round(redline), brakeNm: 0.12 * peak };
}

export interface BuildOptions {
  frame: FrameId;
  /** total mass (kg); default the frame's reference */
  mass?: number;
  weightFront?: number;
  /** CG height on wheels of the frame's radius (m) */
  cgHeight?: number;
  /** fitted wheel radius per axle (m); default the frame's */
  radius?: [number, number];
  /** tyre sidewall per axle (m) */
  sidewall?: [number, number];
  kW?: number;
  nm?: number;
  /** gearbox ratios and the top speed (km/h) the final drive is chosen for, on the frame's wheels */
  ratios?: number[];
  gearedKmh?: number;
  cdA?: number;
  mu?: number;
  absent?: AbsentParts;
  /** all-wheel drive */
  awd?: boolean;
  fuel?: boolean;
}

/** a frame with these parts, as a VehicleSpec */
export function build(o: BuildOptions): VehicleSpec {
  const f = FRAMES[o.frame];
  const mass = o.mass ?? f.refMass;
  const wf = o.weightFront ?? f.refFront;
  const cg = o.cgHeight ?? f.refCg;
  const kW = o.kW ?? (f.single ? 16 : o.frame === 'rv' ? 150 : o.frame === 'pickup' ? 62 : 52);
  const nm = o.nm ?? (f.single ? 20 : o.frame === 'rv' ? 700 : o.frame === 'pickup' ? 180 : 105);
  const engine = engineFor(kW, nm);
  const ratios = o.ratios ?? (f.single ? [2.8, 1.95, 1.5, 1.22, 1.0] : [3.6, 2.1, 1.4, 1.0]);
  const geared = (o.gearedKmh ?? (f.single ? 125 : o.frame === 'rv' ? 115 : o.frame === 'pickup' ? 140 : 152)) / 3.6;
  const final = (engine.redline * (Math.PI / 30) * f.radius) / (geared * ratios[ratios.length - 1]);
  const [rf, rr] = o.radius ?? [f.radius, f.radius];
  const front: AxleSpec = { ...f.front, wheelRadius: rf };
  const rear: AxleSpec = { ...f.rear, wheelRadius: rr, driven: true };
  if (o.awd) front.driven = true;
  const H = f.height;
  const L = f.length;
  const W = f.width;
  const bottom = -(cg - f.clearance);
  const spec: VehicleSpec = {
    id: `mc_${o.frame}`,
    label: o.frame,
    mass,
    wheelbase: f.wheelbase,
    weightFront: wf,
    cgHeight: cg,
    wheelRadius: f.radius,
    inertia: {
      roll: (mass * (W * W + H * H)) / 12 * 0.9,
      yaw: (mass * (L * L + W * W)) / 12 * 0.85,
      pitch: (mass * (L * L + H * H)) / 12 * 0.8,
    },
    front,
    rear,
    tire: { muLat: o.mu ?? (f.single ? 1.0 : 0.88), muLong: (o.mu ?? (f.single ? 1.0 : 0.88)) * 1.05, slideRatio: 0.85, loadSens: 0.12, relaxLen: f.single ? 0.4 : 0.55, minLatUnderLong: 0.3 },
    engine,
    gearbox: { ratios, reverse: f.single ? 2.8 : 3.7, final, efficiency: 0.88, upRpm: [0.45 * engine.redline, 0.92 * engine.redline], downRpm: [0.22 * engine.redline, 0.45 * engine.redline], shiftTime: 0.3 },
    brakes: { maxG: Math.min(1, f.brakeN / (mass * 9.81)) },
    aero: { cdA: o.cdA ?? f.cdA },
    steering: f.steering,
    body: { halfLength: L / 2, halfWidth: W / 2, bottom, top: H - cg + (f.single ? 0.45 : 0), centerX: 0 },
    eye: f.single ? { x: -0.1, y: 1.5 - cg, z: 0 } : { x: 0.2, y: 1.15 - cg, z: -0.35 },
    ...(o.fuel === false ? {} : { fuel: { tankL: 45, lPerKWh: 1.5, idleLph: 3 } }),
    ...(f.single ? { balance: {} } : {}),
    ...(o.absent ? { absent: o.absent } : {}),
  };
  const sw = o.sidewall ?? [f.sidewall, f.sidewall];
  return rescaleSuspension(spec, { mass: f.refMass, weightFront: f.refFront, sidewall: [f.sidewall, f.sidewall] }, sw);
}

export interface RandomBuild {
  spec: VehicleSpec;
  /** per-wheel things the derive writes into SimMods (mismatched sizes, bare rims, empty hubs) */
  setup: (m: SimMods) => void;
  /** a short description for a failure message */
  note: string;
}

const logRange = (rng: Rng, a: number, b: number): number => Math.exp(rng.range(Math.log(a), Math.log(b)));

/**
 * A random build across the ranges the ModCar parts allow: 120–8000 kg, 3–500 kW and up to
 * 1200 N·m, wheels of 0.06–0.75 m (with left/right mismatches, bare rims, an empty hub), CG height
 * 0.3–1.6 m, cdA 0.3–8, missing parts. Geared so the theoretical top speed stays below 290 km/h.
 */
export function randomBuild(rng: Rng): RandomBuild {
  const frame = rng.pick<FrameId>(['sedan', 'sedan', 'pickup', 'moto', 'moto', 'rv']);
  const f = FRAMES[frame];
  const kW = logRange(rng, 3, 500);
  // engines weigh about 0.6–2.4 kg/kW plus a block
  const engKg = 12 + kW * rng.range(0.6, 2.4);
  const extra = rng.chance(0.3) ? logRange(rng, 10, f.single ? 400 : 3000) : 0;
  const mass = Math.min(8000, Math.max(120, f.refMass * rng.range(0.55, 1.1) + engKg + extra - (f.single ? 30 : 120)));
  const torquePerKw = rng.range(1.2, 6);
  const nm = Math.min(1200, kW * torquePerKw);
  const base = f.radius;
  const rFront = rng.chance(0.55) ? base : logRange(rng, 0.06, 0.75);
  const rRear = rng.chance(0.5) ? rFront : logRange(rng, 0.06, 0.75);
  const cg = Math.min(1.6, Math.max(0.3, f.refCg * rng.range(0.7, 1.5)));
  const cdA = Math.min(8, Math.max(0.3, f.cdA * logRange(rng, 0.5, 2.5)));
  const mu = rng.range(0.55, 1.15);
  const absent: AbsentParts = {};
  if (rng.chance(0.04)) absent.engine = true;
  if (rng.chance(0.04)) absent.gearbox = true;
  if (rng.chance(0.04)) absent.steering = true;
  if (rng.chance(0.06)) absent.handbrake = true;
  let gearedKmh = rng.range(40, 260);
  const ratios = rng.chance(0.5) ? [3.6, 2.1, 1.4, 1.0] : rng.chance(0.5) ? [3.2, 1.8, 1.0] : [3.9, 2.6, 1.8, 1.35, 1.05];
  // keep the build's real top speed under 290 km/h: gearing at the wheels it has, or power against drag
  const rDrive = rRear;
  const vGear = (gearedKmh / 3.6) * (rDrive / base);
  const vDrag = Math.cbrt((2 * kW * 1000 * 0.88) / (1.2 * cdA));
  if (Math.min(vGear, vDrag) > 290 / 3.6 && vGear > 290 / 3.6) gearedKmh *= (285 / 3.6) / vGear;
  const spec = build({
    frame,
    mass,
    weightFront: Math.min(0.75, Math.max(0.3, f.refFront + rng.range(-0.12, 0.12))),
    cgHeight: cg,
    radius: [rFront, rRear],
    sidewall: [Math.min(0.3, rFront * rng.range(0.15, 0.45)), Math.min(0.3, rRear * rng.range(0.15, 0.45))],
    kW,
    nm,
    ratios,
    gearedKmh,
    cdA,
    mu,
    absent: Object.keys(absent).length > 0 ? absent : undefined,
    awd: !f.single && rng.chance(0.2),
  });
  // per-wheel: a left/right mismatch, a bare rim, an empty hub (cars only: a bike's hub is one wheel)
  const offsets = [0, 0, 0, 0];
  const fits = [0, 0, 0, 0];
  if (!f.single) {
    for (let i = 0; i < 4; i++) {
      const r = i < 2 ? rFront : rRear;
      if (rng.chance(0.08)) offsets[i] = Math.max(0.06, Math.min(0.75, r + rng.range(-0.15, 0.15))) - r;
      if (rng.chance(0.03)) {
        fits[i] = WheelFit.Rim;
        offsets[i] = -Math.min(r * 0.35, r - 0.06);
      } else if (rng.chance(0.02)) fits[i] = WheelFit.None;
    }
  } else if (rng.chance(0.04)) {
    // a bike with a bare rim on one wheel: both rays of that wheel
    const k = rng.int(2) * 2;
    const r = k === 0 ? rFront : rRear;
    fits[k] = fits[k + 1] = WheelFit.Rim;
    offsets[k] = offsets[k + 1] = -Math.min(r * 0.3, r - 0.06);
  }
  const setup = (m: SimMods): void => {
    for (let i = 0; i < 4; i++) {
      m.radiusOffset[i] = offsets[i];
      m.wheelFit[i] = fits[i];
    }
  };
  const note = `${frame} ${mass.toFixed(0)} kg ${kW.toFixed(0)} kW ${nm.toFixed(0)} Nm r ${rFront.toFixed(2)}/${rRear.toFixed(2)} cg ${cg.toFixed(2)} cdA ${cdA.toFixed(2)} off ${offsets.map((x) => x.toFixed(2))} fit ${fits} absent ${JSON.stringify(absent)}`;
  return { spec, setup, note };
}
