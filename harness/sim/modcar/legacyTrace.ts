/**
 * A fingerprint of everything the vehicle simulation does with the four legacy vehicles: pose,
 * velocities, drivetrain, every wheel's state and the road-feel channel, hashed at every step of a
 * set of scenarios that reach every branch the old vehicles use (rough ground, sliding, the selector,
 * the handbrake, the systems' modifiers, a suspension swap, walls and crates, pushing, a save/load).
 *
 * The ModCar extensions (docs/MODCAR.md §4) must leave these hashes untouched: a spec without the
 * new fields runs the old code, bit for bit. Regenerate the golden file only for an intended change
 * of the legacy physics:  npx tsx harness/sim/modcar/legacyTrace.ts --write
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { RobotDriver, CirclePath, StraightPath } from '../../../src/core/driver/robot';
import { fbm2 } from '../../../src/core/math/noise';
import { Rng } from '../../../src/core/math/rng';
import { StaticSolids } from '../../../src/core/onfoot/statics';
import { VehicleSim, zeroInput, type VehicleInput } from '../../../src/core/vehicle/sim';
import { VEHICLES, type VehicleSpec } from '../../../src/core/vehicle/spec';
import { stockState, suspendedSpec, VehicleSystems } from '../../../src/core/vehicle/systems';
import { FlatGround, Surface, type Ground } from '../../../src/core/world/ground';
import { SURFACE_COUNT } from '../../../src/core/vehicle/mods';

const KMH = 1 / 3.6;

/** FNV-1a over the bytes of the doubles fed in */
class Hasher {
  private h = 0x811c9dc5;
  private readonly f = new Float64Array(1);
  private readonly u = new Uint32Array(this.f.buffer);
  add(x: number): void {
    this.f[0] = x;
    for (let k = 0; k < 2; k++) {
      let w = this.u[k];
      for (let b = 0; b < 4; b++) {
        this.h ^= w & 0xff;
        this.h = Math.imul(this.h, 0x01000193);
        w >>>= 8;
      }
    }
  }
  get hex(): string {
    return (this.h >>> 0).toString(16).padStart(8, '0');
  }
}

function absorb(hs: Hasher, v: VehicleSim): void {
  hs.add(v.px);
  hs.add(v.py);
  hs.add(v.pz);
  hs.add(v.qx);
  hs.add(v.qy);
  hs.add(v.qz);
  hs.add(v.qw);
  hs.add(v.vx);
  hs.add(v.vy);
  hs.add(v.vz);
  hs.add(v.avx);
  hs.add(v.avy);
  hs.add(v.avz);
  hs.add(v.rpm);
  hs.add(v.gear);
  hs.add(v.dir);
  hs.add(v.throttle);
  hs.add(v.brake);
  hs.add(v.handbrake);
  hs.add(v.steerAngle);
  hs.add(v.wheelAngle);
  hs.add(v.maxSteerNow);
  hs.add(v.odometer);
  hs.add(v.fuelUsedL);
  hs.add(v.engineKw);
  hs.add(v.accX);
  hs.add(v.accY);
  hs.add(v.accZ);
  hs.add(v.shiftTimer);
  hs.add(v.hold ? 1 : 0);
  hs.add(v.hits);
  hs.add(v.maxPenetration);
  for (const w of v.wheels) {
    hs.add(w.comp);
    hs.add(w.compRate);
    hs.add(w.load);
    hs.add(w.fLong);
    hs.add(w.fLat);
    hs.add(w.alpha);
    hs.add(w.spin);
    hs.add(w.omega);
    hs.add(w.steer);
    hs.add(w.rolled);
    hs.add(w.slid);
    hs.add(w.util);
  }
  const f = v.feel;
  hs.add(f.thump);
  hs.add(f.thumps);
  hs.add(f.bottomOuts);
  hs.add(f.landings);
  hs.add(f.suspRms);
  hs.add(f.buzz);
  hs.add(f.bodyHits);
  hs.add(f.lastBodyHit);
  hs.add(f.airTime);
}

type Scenario = (spec: VehicleSpec, hs: Hasher) => void;

/** random inputs on rough dirt, put back on its wheels after a roll (the fuzz test's driving) */
const rough: Scenario = (spec, hs) => {
  const relief = (x: number, z: number): number => 0.35 * fbm2(x / 23, z / 23, 11, 3) + 0.06 * fbm2(x / 2.1, z / 2.1, 12, 2);
  const ground = new FlatGround({ relief, surface: Surface.Dirt });
  const v = new VehicleSim(spec);
  v.reset(0, relief(0, 0), 0, 0);
  const rng = new Rng(17);
  const inp = zeroInput();
  const b = new Float64Array(9);
  let next = 0;
  for (let t = 0; t < 40; t += v.h) {
    if (t >= next) {
      next = t + rng.range(0.2, 1.2);
      inp.steer = rng.range(-1, 1);
      inp.throttle = rng.chance(0.75) ? rng.next() : 0;
      inp.brake = rng.chance(0.2) ? rng.next() : 0;
      inp.handbrake = rng.chance(0.08) ? 1 : 0;
    }
    v.substep(inp, ground);
    absorb(hs, v);
    v.basis(b);
    if (b[4] < 0.2 && v.speed < 0.5) v.reset(v.px, relief(v.px, v.pz), v.pz, v.yaw);
  }
};

/** the skidpad, braking from speed and a lane change on asphalt, through the robot driver */
const handling: Scenario = (spec, hs) => {
  const ground = new FlatGround();
  const v = new VehicleSim(spec);
  v.reset(0, 0, -30, 0);
  const robot = new RobotDriver({ cruise: 4, latG: 5, decel: 5, laneKi: 0.03, laneTrimMax: 0.5 });
  const circle = new CirclePath(30);
  for (let t = 0; t < 25; t += v.h) {
    robot.opts.cruise = 4 + 0.6 * t;
    v.substep(robot.update(v.h, v, circle), ground);
    absorb(hs, v);
  }
  const s = new VehicleSim(spec);
  s.reset(0, 0, 0, 0);
  const straight = new StraightPath();
  const r2 = new RobotDriver({ cruise: 90 * KMH, latG: 5 });
  for (let t = 0; t < 30; t += s.h) {
    if (t > 14) r2.opts.lane = 3.2;
    const inp = r2.update(s.h, s, straight);
    if (t > 22) {
      inp.throttle = 0;
      inp.brake = 1;
    }
    s.substep(inp, ground);
    absorb(hs, s);
  }
};

/** every channel the vehicle systems write: flats, a missing wheel, grip, brakes, play and pull, limp mode */
const modded: Scenario = (spec, hs) => {
  const ground = new FlatGround({ surface: Surface.Gravel, relief: (x, z) => 0.03 * Math.sin(x * 0.7) * Math.cos(z * 0.5) });
  const v = new VehicleSim(spec);
  v.reset(0, 0, 0, 0);
  const m = v.mods;
  const inp: VehicleInput = zeroInput();
  for (let t = 0; t < 30; t += v.h) {
    if (t > 3 && t < 3 + v.h) {
      m.radiusDrop[0] = 0.06;
      for (let k = 0; k < SURFACE_COUNT; k++) {
        m.mu[k] = 0.7;
        m.rr[k] = 2.5;
      }
      m.steerPull = -0.012;
      m.steerPlay = 0.03;
      m.brake[0] = m.brake[2] = 0.8;
      m.brake[1] = m.brake[3] = 1.1;
      m.torque = 0.85;
      m.fuel = 1.1;
    }
    if (t > 12 && t < 12 + v.h) {
      m.radiusDrop[3] = spec.wheelRadius * 0.55;
      for (let k = 0; k < SURFACE_COUNT; k++) {
        m.mu[3 * SURFACE_COUNT + k] = 0.5;
        m.rr[3 * SURFACE_COUNT + k] = 25;
      }
      m.rpmLimit = 0.6;
    }
    if (t > 20 && t < 20 + v.h) m.engineCanRun = false;
    if (t > 24 && t < 24 + v.h) m.reset();
    inp.throttle = t < 18 ? 0.8 : t < 26 ? 0 : 0.5;
    inp.brake = t > 18 && t < 21 ? 0.6 : 0;
    inp.steer = 0.6 * Math.sin(t * 0.9);
    v.substep(inp, ground);
    absorb(hs, v);
  }
};

/** a lift kit fitted and taken off again while driving over bumps (applySpec keeps the state) */
const swapped: Scenario = (spec, hs) => {
  const ground = new FlatGround({ relief: (x) => (Math.floor(x / 9) % 3 === 0 ? 0.05 : 0) });
  const v = new VehicleSim(spec);
  v.reset(0, 0, 0, 0);
  const lifted = suspendedSpec(spec, 'part.suspension.3');
  const stiff = suspendedSpec(spec, 'part.suspension.2');
  const inp: VehicleInput = { steer: 0, throttle: 0.5, brake: 0, handbrake: 0 };
  for (let t = 0; t < 24; t += v.h) {
    if (t > 4 && t < 4 + v.h) v.applySpec(lifted);
    if (t > 10 && t < 10 + v.h) v.applySpec(stiff);
    if (t > 16 && t < 16 + v.h) v.applySpec(spec);
    inp.steer = 0.4 * Math.sin(t * 0.6);
    v.substep(inp, ground);
    absorb(hs, v);
  }
};

/** the selector, manual mode, the handbrake lever, the engine off and the starter, on a hill */
const controls: Scenario = (spec, hs) => {
  const ground = new FlatGround({ slopeX: 0.1 });
  const v = new VehicleSim(spec);
  v.reset(0, 0, 0, 0);
  const inp = zeroInput();
  const step = (sec: number, f?: (t: number) => void): void => {
    for (let t = 0; t < sec; t += v.h) {
      f?.(t);
      v.substep(inp, ground);
      absorb(hs, v);
    }
  };
  step(4);
  v.shift('P');
  step(2);
  v.shift('N');
  step(2);
  v.setParkBrake(true);
  step(2);
  inp.throttle = 0.7;
  v.shift('D');
  step(4);
  v.setManual(true);
  step(3, (t) => {
    if (t > 1 && t < 1 + v.h) v.shiftUp();
  });
  inp.throttle = 1;
  step(4, (t) => {
    if (t > 1.5 && t < 1.5 + v.h) v.shiftUp();
    if (t > 3 && t < 3 + v.h) v.shiftDown();
  });
  v.setManual(false);
  inp.throttle = 0;
  inp.brake = 1;
  step(5);
  v.engineOn = false;
  inp.brake = 0;
  step(3);
  v.cranking = true;
  step(1);
  v.cranking = false;
  v.engineOn = true;
  inp.brake = 1;
  step(2);
  inp.brake = 0;
  inp.handbrake = 1;
  step(2);
  v.autoReverse = false;
  inp.handbrake = 0;
  v.shift('R');
  inp.throttle = 0.6;
  step(4);
  // a save and a load in the middle of rolling back down
  const s = v.serialize();
  const w = new VehicleSim(spec);
  w.deserialize(s);
  for (const [i, wh] of w.wheels.entries()) wh.comp = v.wheels[i].comp;
  for (let t = 0; t < 3; t += w.h) {
    w.substep(inp, ground);
    absorb(hs, w);
  }
};

/** a wall, a post and crates, and someone pushing the vehicle in neutral */
const solids: Scenario = (spec, hs) => {
  const ground = new FlatGround();
  const st = new StaticSolids();
  st.box(40, 0, 3, 0.6, 0.2, -1, 0.3, false, 'light:crate');
  st.box(60, 1.2, 0.3, 4, 0, -1, 3, false, 'wall');
  st.post(54, -1.6, 0.25, -1, 3, 'post');
  const v = new VehicleSim(spec);
  v.reset(0, 0, 0, 0);
  v.solids = st;
  const robot = new RobotDriver({ cruise: 45 * KMH, latG: 5 });
  const path = new StraightPath();
  for (let t = 0; t < 14; t += v.h) {
    const inp = v.hits > 0 ? zeroInput() : robot.update(v.h, v, path);
    v.substep(inp, ground);
    absorb(hs, v);
  }
  v.shift('N');
  const idle = zeroInput();
  for (let t = 0; t < 4; t += v.h) {
    v.addPush(-600, 120, v.px + 1.5, v.pz + 0.4);
    v.substep(idle, ground);
    absorb(hs, v);
  }
};

/** the vehicle systems bound to the simulation: ignition, a puncture, a wheel taken off */
const systems: Scenario = (spec, hs) => {
  const ground: Ground = new FlatGround({ surface: Surface.Dirt });
  const v = new VehicleSim(spec);
  v.reset(0, 0, 0, 0);
  const sys = new VehicleSystems(spec, stockState(spec, 3, { fresh: true })).bind(v);
  const env = { ambientC: 24, dark: false, rain: 0 };
  const inp: VehicleInput = { steer: 0.15, throttle: 0.6, brake: 0, handbrake: 0 };
  for (let i = 0; i < 120 * 30; i++) {
    if (i === 120 * 8) sys.puncture(1);
    if (i === 120 * 16) sys.state.wheels[2].off = true;
    v.substep(inp, ground);
    if (i % 4 === 3) sys.update(v.h * 4, env);
    absorb(hs, v);
  }
};

/** a ramp taken fast and crooked, then a hard turn on a side slope: flights, landings, rolls, the body on the ground */
const tumble: Scenario = (spec, hs) => {
  const relief = (x: number, z: number): number => (x > 40 && x < 52 ? (x - 40) * 0.22 : 0) + (z > 8 ? (z - 8) * 0.45 : 0);
  const ground = new FlatGround({ relief });
  const v = new VehicleSim(spec);
  v.reset(0, 0, 0, 0);
  const inp: VehicleInput = { steer: 0, throttle: 1, brake: 0, handbrake: 0 };
  const b = new Float64Array(9);
  for (let t = 0; t < 30; t += v.h) {
    inp.steer = v.px > 46 ? 1 : 0.08;
    inp.throttle = v.px > 46 ? 0.6 : 1;
    v.substep(inp, ground);
    absorb(hs, v);
    v.basis(b);
    if (b[4] < 0.2 && v.speed < 0.5) {
      v.reset(v.px, relief(v.px, v.pz), v.pz, v.yaw);
      inp.steer = -1;
    }
  }
};

export const SCENARIOS: Record<string, Scenario> = { rough, handling, modded, swapped, controls, solids, systems, tumble };

/** hash of every scenario for one vehicle */
export function legacyTrace(spec: VehicleSpec): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [name, run] of Object.entries(SCENARIOS)) {
    const hs = new Hasher();
    run(spec, hs);
    out[name] = hs.hex;
  }
  return out;
}

export const GOLDEN_FILE = path.join(path.dirname(fileURLToPath(import.meta.url)), 'legacy-golden.json');

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const all: Record<string, Record<string, string>> = {};
  for (const spec of Object.values(VEHICLES)) all[spec.id] = legacyTrace(spec);
  const text = JSON.stringify(all, null, 2) + '\n';
  if (process.argv.includes('--write')) {
    fs.writeFileSync(GOLDEN_FILE, text);
    console.log(`wrote ${GOLDEN_FILE}`);
  }
  console.log(text);
}
