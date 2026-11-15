/**
 * Extreme ModCar builds driven hard (docs/MODCAR.md §10.3): random plausible specs across the ranges
 * the parts allow, each driven through a mixed program on level asphalt and on rough ground. Records
 * what would betray a numerical problem: non-finite state, runaway speed or spin, the body sinking
 * into the ground.
 */
import { fbm2 } from '../../../src/core/math/noise';
import { Rng } from '../../../src/core/math/rng';
import { StaticSolids } from '../../../src/core/onfoot/statics';
import { VehicleSim, zeroInput, type VehicleInput } from '../../../src/core/vehicle/sim';
import { FlatGround, GroundSample, Surface, type Ground } from '../../../src/core/world/ground';
import { feel } from './feel';
import { randomBuild as makeBuild, type RandomBuild } from './specgen';

/** full throttle on the level until it stops gaining: its top speed */
function launchTop(b: RandomBuild): { top: number; exploded: boolean } {
  return feel.launch(b.spec, { mods: b.setup });
}

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

const steep = (x: number, z: number): number => 1.6 * fbm2(x / 15, z / 15, 21, 3) + 0.15 * fbm2(x / 1.7, z / 1.7, 22, 2);

/** what a hard crash leaves: the deepest the body got into a wall or a post (m) */
export interface HarshStats extends FuzzStats {
  maxWallPenetration: number;
}

/**
 * Steep grass hills (slopes past 30 %) flat out with the wheel thrown about, then a run at full
 * throttle through a field of walls, posts and crates.
 */
export function harshFuzz(b: RandomBuild, rng: Rng, seconds = 25): HarshStats {
  const st: HarshStats = { exploded: false, maxKmh: 0, maxSpin: 0, maxSink: 0, minCgClear: Infinity, flips: 0, seconds: 0, maxWallPenetration: 0 };
  const hills = new FlatGround({ relief: steep, surface: Surface.Grass });
  const gs = new GroundSample();
  const basis = new Float64Array(9);
  {
    const v = new VehicleSim(b.spec);
    b.setup(v.mods);
    v.reset(0, steep(0, 0), 0, rng.range(-Math.PI, Math.PI), hills);
    const inp = zeroInput();
    let next = 0;
    for (let t = 0; t < seconds; t += v.h) {
      if (t >= next) {
        next = t + rng.range(0.3, 2);
        inp.steer = rng.range(-1, 1);
        inp.throttle = rng.chance(0.85) ? 1 : 0;
        inp.brake = rng.chance(0.1) ? 1 : 0;
      }
      v.substep(inp, hills);
      st.seconds += v.h;
      if (v.exploded || !Number.isFinite(v.px + v.py + v.pz + v.vx + v.vy + v.vz + v.avx + v.avy + v.avz + v.rpm)) {
        st.exploded = true;
        return st;
      }
      st.maxKmh = Math.max(st.maxKmh, v.speed * 3.6);
      st.maxSpin = Math.max(st.maxSpin, Math.hypot(v.avx, v.avy, v.avz));
      hills.sample(v.px, v.pz, gs);
      st.minCgClear = Math.min(st.minCgClear, v.py - gs.h);
      v.basis(basis);
      if (basis[4] < 0.2 && v.speed < 0.5) {
        st.flips++;
        v.reset(v.px, gs.h, v.pz, v.yaw, hills);
      }
    }
  }
  {
    const flat = new FlatGround();
    const solids = new StaticSolids();
    for (let k = 0; k < 12; k++) {
      const x = 40 + k * 25 + rng.range(-5, 5);
      const z = rng.range(-6, 6);
      const kind = rng.int(3);
      if (kind === 0) solids.box(x, z, rng.range(0.2, 2), rng.range(0.3, 5), rng.range(-1, 1), -1, rng.range(0.5, 3), false, 'wall');
      else if (kind === 1) solids.post(x, z, rng.range(0.1, 0.4), -1, 3, 'post');
      else solids.box(x, z, 0.4, 0.4, 0, -1, 0.8, false, 'light:crate');
    }
    const v = new VehicleSim(b.spec);
    b.setup(v.mods);
    v.reset(0, 0, 0, 0, flat);
    v.solids = solids;
    const inp: VehicleInput = { steer: 0, throttle: 1, brake: 0, handbrake: 0 };
    for (let t = 0; t < seconds; t += v.h) {
      inp.steer = Math.sin(t * 0.7) * 0.3;
      v.substep(inp, flat);
      st.seconds += v.h;
      if (v.exploded || !Number.isFinite(v.px + v.py + v.pz + v.vx + v.vy + v.vz + v.avx + v.avy + v.avz)) {
        st.exploded = true;
        return st;
      }
      st.maxSpin = Math.max(st.maxSpin, Math.hypot(v.avx, v.avy, v.avz));
    }
    st.maxWallPenetration = v.maxPenetration;
  }
  return st;
}

/** the fuzz test's settings: MODCAR_FUZZ=<builds> MODCAR_FUZZ_SECONDS=<seconds each> MODCAR_FUZZ_SEED=<seed> */
export const FUZZ = {
  builds: Number(process.env.MODCAR_FUZZ ?? 1000),
  seconds: Number(process.env.MODCAR_FUZZ_SECONDS ?? 30),
  seed: Number(process.env.MODCAR_FUZZ_SEED ?? 2026),
};

/**
 * Builds `from` to `to` (of the seeded sequence) through fuzzBuild and a flat-out run for the top
 * speed; what went wrong with each, if anything.
 */
export function fuzzRange(from: number, to: number, seconds = FUZZ.seconds, seed = FUZZ.seed): string[] {
  const rng = new Rng(seed);
  const bad: string[] = [];
  for (let i = 0; i < to; i++) {
    const b = makeBuild(rng);
    if (i < from) continue;
    const s = fuzzBuild(b, seconds, seed * 7 + i);
    const top = launchTop(b);
    const why: string[] = [];
    if (s.exploded || top.exploded) why.push('exploded');
    if (s.maxKmh > 300 || top.top > 300) why.push(`speed ${Math.max(s.maxKmh, top.top).toFixed(0)} km/h`);
    if (s.maxSpin > 30) why.push(`spin ${s.maxSpin.toFixed(1)} rad/s`);
    if (s.maxSink > 0.2) why.push(`body ${s.maxSink.toFixed(2)} m in the ground`);
    if (s.minCgClear < 0.05) why.push(`centre of gravity ${s.minCgClear.toFixed(2)} m over the ground`);
    if (why.length > 0) bad.push(`#${i} ${why.join(', ')}: ${b.note}`);
  }
  return bad;
}
