/**
 * Extreme ModCar builds driven hard (docs/MODCAR.md §10.3): random plausible specs across the ranges
 * the parts allow, each driven through a mixed program on level asphalt and on rough ground. Records
 * what would betray a numerical problem: non-finite state, runaway speed or spin, the body sinking
 * into the ground.
 */
import { fbm2 } from '../../../src/core/math/noise';
import { Rng } from '../../../src/core/math/rng';
import { VehicleSim, zeroInput } from '../../../src/core/vehicle/sim';
import { FlatGround, GroundSample, Surface, type Ground } from '../../../src/core/world/ground';
import type { RandomBuild } from './specgen';

export interface FuzzStats {
  /** state became non-finite */
  exploded: boolean;
  maxKmh: number;
  /** fastest body rotation (rad/s) */
  maxSpin: number;
  /** deepest a body-box corner went below the ground (m) and the lowest the centre of gravity got over it (m) */
  maxSink: number;
  minCgClear: number;
  /** times it was put back on its wheels after rolling over */
  flips: number;
  /** simulated seconds */
  seconds: number;
}

const relief = (x: number, z: number): number => 0.35 * fbm2(x / 23, z / 23, 11, 3) + 0.05 * fbm2(x / 2.1, z / 2.1, 12, 2);

/** one build through the program: `seconds` split between level asphalt and rough dirt */
export function fuzzBuild(b: RandomBuild, seconds: number, seed: number): FuzzStats {
  const st: FuzzStats = { exploded: false, maxKmh: 0, maxSpin: 0, maxSink: 0, minCgClear: Infinity, flips: 0, seconds: 0 };
  const flat = new FlatGround({ surface: Surface.Asphalt });
  const rough = new FlatGround({ relief, surface: Surface.Dirt });
  const rng = new Rng(seed);
  const half = seconds / 2;
  run(b, flat, 0, half, rng, st, true);
  if (!st.exploded) run(b, rough, relief(0, 0), seconds - half, rng, st, false);
  return st;
}

function run(b: RandomBuild, ground: Ground, y0: number, seconds: number, rng: Rng, st: FuzzStats, program: boolean): void {
  const v = new VehicleSim(b.spec);
  b.setup(v.mods);
  v.reset(0, y0, 0, rng.range(-Math.PI, Math.PI), ground);
  const inp = zeroInput();
  const basis = new Float64Array(9);
  const gs = new GroundSample();
  const bd = b.spec.body;
  let next = 0;
  let flipped = false;
  let k = 0;
  for (let t = 0; t < seconds; t += v.h, k++) {
    if (program && t < 9) {
      // level ground first: flat out, then a hard stop with the wheel turned and the handbrake
      inp.steer = t < 6 ? 0 : 0.7;
      inp.throttle = t < 6 ? 1 : 0;
      inp.brake = t < 6 ? 0 : 1;
      inp.handbrake = t > 7 ? 1 : 0;
    } else if (t >= next) {
      next = t + rng.range(0.2, 1.5);
      inp.steer = rng.range(-1, 1);
      inp.throttle = rng.chance(0.75) ? rng.next() : 0;
      inp.brake = rng.chance(0.2) ? rng.next() : 0;
      inp.handbrake = rng.chance(0.08) ? 1 : 0;
    }
    v.substep(inp, ground);
    st.seconds += v.h;
    if (v.exploded || !Number.isFinite(v.px + v.py + v.pz + v.vx + v.vy + v.vz + v.avx + v.avy + v.avz + v.rpm + v.lean)) {
      st.exploded = true;
      return;
    }
    const kmh = v.speed * 3.6;
    if (kmh > st.maxKmh) st.maxKmh = kmh;
    const spin = Math.hypot(v.avx, v.avy, v.avz);
    if (spin > st.maxSpin) st.maxSpin = spin;
    if ((k & 3) !== 0) continue;
    // the body box against the ground (every fourth step: it moves only centimetres meanwhile)
    v.basis(basis);
    ground.sample(v.px, v.pz, gs);
    const clear = v.py - gs.h;
    if (clear < st.minCgClear) st.minCgClear = clear;
    for (const y of [bd.bottom, bd.top]) {
      for (const x of [bd.centerX + bd.halfLength, bd.centerX - bd.halfLength]) {
        for (const z of [-bd.halfWidth, bd.halfWidth]) {
          const wx = v.px + basis[0] * x + basis[3] * y + basis[6] * z;
          const wy = v.py + basis[1] * x + basis[4] * y + basis[7] * z;
          const wz = v.pz + basis[2] * x + basis[5] * y + basis[8] * z;
          ground.sample(wx, wz, gs);
          const sink = gs.h - wy;
          if (sink > st.maxSink) st.maxSink = sink;
        }
      }
    }
    const up = basis[4];
    if (up < 0.2 && !flipped) {
      flipped = true;
      st.flips++;
    }
    if (flipped && up < 0.2 && v.speed < 0.5) {
      // put it back on its wheels, like the player would
      ground.sample(v.px, v.pz, gs);
      v.reset(v.px, gs.h, v.pz, v.yaw, ground);
      flipped = false;
    } else if (up > 0.6) flipped = false;
  }
}

/**
 * Parts swapped while driving (the game swaps them parked, but nothing may break if they change at
 * speed): every 1.5–4 s another random build of the same frame is put in force with applySpec, and the
 * wheels change size or fit through SimMods, on rough dirt with random inputs.
 */
export function swapFuzz(rng: Rng, makeBuild: (rng: Rng) => RandomBuild, seconds: number): FuzzStats {
  const st: FuzzStats = { exploded: false, maxKmh: 0, maxSpin: 0, maxSink: 0, minCgClear: Infinity, flips: 0, seconds: 0 };
  const first = makeBuild(rng);
  const frame = first.spec.id;
  const ground = new FlatGround({ relief, surface: Surface.Dirt });
  const v = new VehicleSim(first.spec);
  first.setup(v.mods);
  v.reset(0, relief(0, 0), 0, 0, ground);
  const inp = zeroInput();
  const gs = new GroundSample();
  const basis = new Float64Array(9);
  let next = 0;
  let swap = 1;
  for (let t = 0; t < seconds; t += v.h) {
    if (t >= next) {
      next = t + rng.range(0.2, 1.5);
      inp.steer = rng.range(-1, 1);
      inp.throttle = rng.chance(0.8) ? rng.next() : 0;
      inp.brake = rng.chance(0.15) ? rng.next() : 0;
      inp.handbrake = rng.chance(0.05) ? 1 : 0;
    }
    if (t >= swap) {
      swap = t + rng.range(1.5, 4);
      // another build of the same frame (a bike stays a bike), its wheels with it
      let b = makeBuild(rng);
      for (let k = 0; k < 20 && b.spec.id !== frame; k++) b = makeBuild(rng);
      if (b.spec.id === frame) {
        if (rng.chance(0.6)) v.applySpec(b.spec);
        b.setup(v.mods);
      }
    }
    v.substep(inp, ground);
    st.seconds += v.h;
    if (v.exploded || !Number.isFinite(v.px + v.py + v.pz + v.vx + v.vy + v.vz + v.avx + v.avy + v.avz + v.rpm + v.lean)) {
      st.exploded = true;
      return st;
    }
    st.maxKmh = Math.max(st.maxKmh, v.speed * 3.6);
    st.maxSpin = Math.max(st.maxSpin, Math.hypot(v.avx, v.avy, v.avz));
    ground.sample(v.px, v.pz, gs);
    st.minCgClear = Math.min(st.minCgClear, v.py - gs.h);
    v.basis(basis);
    if (basis[4] < 0.2 && v.speed < 0.5) {
      st.flips++;
      v.reset(v.px, gs.h, v.pz, v.yaw, ground);
    }
  }
  return st;
}
