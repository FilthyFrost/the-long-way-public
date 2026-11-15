/**
 * ModCar single-track vehicles (spec.balance, docs/MODCAR.md §4 物理实现说明): a motorcycle stays up
 * at a standstill and at any speed in a straight line, leans into corners the right way and as far as
 * the corner asks (atan(a/g)) without its body rolling, wheelies when the engine and the centre of
 * gravity allow it, and falls over after a big enough knock.
 */
import { describe, expect, it } from 'vitest';
import { CirclePath, RobotDriver, StraightPath, type DrivePath, type PathProbe } from '../../src/core/driver/robot';
import { GRAVITY, VehicleSim, zeroInput, type VehicleInput } from '../../src/core/vehicle/sim';
import { FlatGround, Surface } from '../../src/core/world/ground';
import { feel } from './modcar/feel';
import { build } from './modcar/specgen';

const KMH = 1 / 3.6;
const DEG = 180 / Math.PI;
const flat = new FlatGround();

/** the frame's stock bike, with a little more engine so 120 km/h is well within reach */
const bike = build({ frame: 'moto', kW: 40, nm: 45, gearedKmh: 160 });

/** the same circle driven anticlockwise (a left turn) */
class LeftCircle implements DrivePath {
  constructor(public R: number) {}
  project(x: number, z: number, hint: number, out: { s: number; d: number }): void {
    const r = Math.sqrt(x * x + z * z);
    let a = Math.atan2(x, z);
    if (a < 0) a += 2 * Math.PI;
    const turns = Math.round((hint / this.R - a) / (2 * Math.PI));
    out.s = (a + turns * 2 * Math.PI) * this.R;
    out.d = r - this.R; // outside the circle = right of the path
  }
  probe(s: number, out: PathProbe): void {
    const a = s / this.R;
    out.x = this.R * Math.sin(a);
    out.y = 0;
    out.z = this.R * Math.cos(a);
    out.tx = Math.cos(a);
    out.tz = -Math.sin(a);
    out.kappa = -1 / this.R;
  }
}

describe('modcar · motorcycle balance', () => {
  it('stands up at rest, on the level and on a side slope, feet down (no lean)', () => {
    for (const slope of [0, 0.08]) {
      const g = new FlatGround({ slopeZ: slope });
      const v = new VehicleSim(bike);
      v.reset(0, 0, 0, 0);
      let maxRoll = 0;
      for (let t = 0; t < 12; t += v.h) {
        v.substep(zeroInput(), g);
        if (t > 1) maxRoll = Math.max(maxRoll, Math.abs(v.roll));
      }
      expect(maxRoll * DEG, `side slope ${slope}`).toBeLessThan(3);
      expect(Math.abs(v.lean)).toBeLessThan(0.002);
      expect(v.speed).toBeLessThan(0.05);
    }
  });

  it('stays upright from 0 to 120 km/h in a straight line', () => {
    const v = new VehicleSim(bike);
    v.reset(0, 0, 0, 0);
    const robot = new RobotDriver({ cruise: 125 * KMH, latG: 5 });
    const path = new StraightPath();
    let maxRoll = 0;
    let maxLean = 0;
    let top = 0;
    for (let t = 0; t < 45; t += v.h) {
      v.substep(robot.update(v.h, v, path), flat);
      maxRoll = Math.max(maxRoll, Math.abs(v.roll));
      maxLean = Math.max(maxLean, Math.abs(v.lean));
      top = Math.max(top, v.kmh);
    }
    expect(v.exploded).toBe(false);
    expect(top).toBeGreaterThan(120);
    expect(maxRoll * DEG).toBeLessThan(1);
    expect(maxLean * DEG).toBeLessThan(1);
    expect(Math.abs(v.pz)).toBeLessThan(0.5);
  });

  for (const [name, path, sign] of [
    ['right', new CirclePath(40), 1],
    ['left', new LeftCircle(40), -1],
  ] as const) {
    it(`on a 40 m circle (${name} turn): leans into the corner as far as it asks, the body stays upright`, () => {
      for (const kmh of [20, 35, 50]) {
        const v = new VehicleSim(bike);
        v.reset(0, 0, sign > 0 ? -40 : 40, 0);
        const robot = new RobotDriver({ cruise: kmh * KMH, latG: 5, decel: 5, laneKi: 0.03, laneTrimMax: 0.5 });
        let maxRoll = 0;
        let maxD = 0;
        for (let t = 0; t < 30; t += v.h) {
          v.substep(robot.update(v.h, v, path), flat);
          if (t > 12) {
            maxRoll = Math.max(maxRoll, Math.abs(v.roll));
            maxD = Math.max(maxD, Math.abs(robot.d));
          }
        }
        const ay = (-v.vForward * v.yawRate) / GRAVITY;
        expect(v.exploded).toBe(false);
        expect(Math.abs(v.kmh - kmh), `${kmh} km/h held`).toBeLessThan(2);
        expect(maxD, `${kmh} km/h on the line`).toBeLessThan(1.5);
        expect(maxRoll * DEG, `${kmh} km/h body roll`).toBeLessThan(2);
        // the lean is towards the inside of the turn and matches the corner
        expect(Math.sign(v.lean), `${kmh} km/h lean direction`).toBe(sign);
        expect(Math.abs(v.lean - Math.atan(ay)) * DEG, `${kmh} km/h lean = atan(a/g)`).toBeLessThan(2);
        expect(Math.abs(ay)).toBeGreaterThan((((kmh * KMH) ** 2 / 40) / GRAVITY) * 0.85);
      }
    });
  }

  it('pushed past what its steering can hold on the circle it still leans the right way and stays up', () => {
    for (const [path, sign] of [
      [new CirclePath(40), 1],
      [new LeftCircle(40), -1],
    ] as const) {
      const v = new VehicleSim(bike);
      v.reset(0, 0, sign > 0 ? -40 : 40, 0);
      const robot = new RobotDriver({ cruise: 70 * KMH, latG: 5, decel: 5, laneKi: 0.03, laneTrimMax: 0.5 });
      let maxRoll = 0;
      let leanSum = 0;
      for (let t = 0; t < 20; t += v.h) {
        v.substep(robot.update(v.h, v, path), flat);
        maxRoll = Math.max(maxRoll, Math.abs(v.roll));
        if (t > 10) leanSum += v.lean;
      }
      expect(v.exploded).toBe(false);
      expect(maxRoll * DEG).toBeLessThan(3);
      expect(Math.sign(leanSum)).toBe(sign);
      expect(Math.abs(v.lean) * DEG).toBeGreaterThan(25);
      expect(Math.abs(v.lean) * DEG).toBeLessThanOrEqual(52.01);
    }
  });

  it('on ice it leans only as far as the grip holds, however it slides', () => {
    const ice = new FlatGround({ surface: Surface.Ice });
    const v = new VehicleSim(bike);
    v.reset(0, 0, 0, 0);
    const go: VehicleInput = { steer: 0, throttle: 0.6, brake: 0, handbrake: 0 };
    for (let t = 0; t < 8; t += v.h) v.substep(go, ice);
    let most = 0;
    for (let t = 0; t < 6; t += v.h) {
      v.substep({ steer: t < 3 ? 1 : -1, throttle: 0.4, brake: 0, handbrake: 0 }, ice);
      most = Math.max(most, Math.abs(v.lean));
    }
    // ice grips about 0.14 of asphalt: atan(0.14 · tyre μ) is about 8°
    expect(v.exploded).toBe(false);
    expect(most * DEG).toBeGreaterThan(2);
    expect(most * DEG).toBeLessThan(10);
    expect(Math.abs(v.roll) * DEG).toBeLessThan(3);
  });

  it('the stance shares the load evenly in a bend (nothing topples it outwards)', () => {
    const v = new VehicleSim(bike);
    v.reset(0, 0, -40, 0);
    const robot = new RobotDriver({ cruise: 55 * KMH, latG: 5, decel: 5, laneKi: 0.03, laneTrimMax: 0.5 });
    const path = new CirclePath(40);
    for (let t = 0; t < 25; t += v.h) v.substep(robot.update(v.h, v, path), flat);
    const W = v.wheels;
    expect(Math.abs(W[0].load - W[1].load) / (W[0].load + W[1].load)).toBeLessThan(0.05);
    expect(Math.abs(W[2].load - W[3].load) / (W[2].load + W[3].load)).toBeLessThan(0.05);
  });

  it('wheelies with a 190 kW engine, not with the stock one; a V8 car does not', () => {
    const v8bike = build({ frame: 'moto', kW: 190, nm: 400, mass: 435, cgHeight: 0.68, weightFront: 0.42 });
    const big = feel.launch(v8bike);
    expect(big.exploded).toBe(false);
    expect(big.wheelieS).toBeGreaterThan(0.5);
    expect(big.maxPitch).toBeGreaterThan(10);
    // the tail touches before it goes over backwards
    expect(big.maxPitch).toBeLessThan(45);
    const stock = feel.launch(build({ frame: 'moto' }));
    expect(stock.wheelieS).toBeLessThan(0.25);
    expect(stock.maxPitch).toBeLessThan(6);
    const car = feel.launch(build({ frame: 'sedan', kW: 190, nm: 400, mass: 1180 }));
    expect(car.wheelieS).toBe(0);
  });

  it('a big knock sideways lays it down: the body on the ground, no lean, nothing blows up', () => {
    const v = new VehicleSim(bike);
    v.reset(0, 0, 0, 0);
    const idle: VehicleInput = zeroInput();
    for (let t = 0; t < 1; t += v.h) v.substep(idle, flat);
    // a violent knock: a roll rate of 12 rad/s about the body's length
    const b = new Float64Array(9);
    v.basis(b);
    v.avx = b[0] * 12;
    v.avy = b[1] * 12;
    v.avz = b[2] * 12;
    for (let t = 0; t < 5; t += v.h) v.substep(idle, flat);
    expect(v.exploded).toBe(false);
    expect(Math.abs(v.roll) * DEG).toBeGreaterThan(60);
    expect(v.feel.bodyHits).toBeGreaterThan(0);
    expect(Math.abs(v.lean)).toBeLessThan(0.02);
    expect(v.speed).toBeLessThan(0.5);
  });

  it('a small knock is caught: it rights itself', () => {
    const v = new VehicleSim(bike);
    v.reset(0, 0, 0, 0);
    const idle = zeroInput();
    for (let t = 0; t < 1; t += v.h) v.substep(idle, flat);
    const b = new Float64Array(9);
    v.basis(b);
    v.avx = b[0] * 1.5;
    v.avy = b[1] * 1.5;
    v.avz = b[2] * 1.5;
    for (let t = 0; t < 4; t += v.h) v.substep(idle, flat);
    expect(Math.abs(v.roll) * DEG).toBeLessThan(3);
  });
});
