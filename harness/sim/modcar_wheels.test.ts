/**
 * ModCar wheel sizes (docs/MODCAR.md §3–4): per-axle radius (AxleSpec.wheelRadius) and per-wheel size
 * (SimMods.radiusOffset) lift or lower their corners and roll on their own radius — gearing and top
 * speed follow; a left/right mismatch pulls towards the smaller wheel; a big change while parked is
 * put in force without launching the car; the suspension rescale behaves like the same physical parts.
 */
import { describe, expect, it } from 'vitest';
import { RobotDriver, StraightPath } from '../../src/core/driver/robot';
import { rescaleAxle } from '../../src/core/vehicle/rescale';
import { VehicleSim, zeroInput, type VehicleInput } from '../../src/core/vehicle/sim';
import type { VehicleSpec } from '../../src/core/vehicle/spec';
import { FlatGround } from '../../src/core/world/ground';
import { feel } from './modcar/feel';
import { build, FRAMES } from './modcar/specgen';

const KMH = 1 / 3.6;
const DEG = 180 / Math.PI;
const flat = new FlatGround();

function parked(spec: VehicleSpec, offsets?: number[], seconds = 3): VehicleSim {
  const v = new VehicleSim(spec);
  if (offsets) for (let i = 0; i < 4; i++) v.mods.radiusOffset[i] = offsets[i];
  v.reset(0, 0, 0, 0);
  for (let t = 0; t < seconds; t += v.h) v.substep(zeroInput(), flat);
  return v;
}

/** world height of a body point (body frame x, y, z) */
function heightAt(v: VehicleSim, x: number, y: number, z: number): number {
  const b = new Float64Array(9);
  v.basis(b);
  return v.py + b[1] * x + b[4] * y + b[7] * z;
}

/** a build whose top speed is set by its gearing (plenty of power): it shows the rolling radius cleanly */
const geared = (radius?: [number, number]): VehicleSpec => build({ frame: 'sedan', kW: 150, nm: 300, gearedKmh: 110, radius });

describe('modcar · wheel sizes', () => {
  it('bigger rear wheels raise the rear and pitch the nose down by the difference', () => {
    const base = parked(geared());
    const big = parked(geared([0.285, 0.36]));
    const L = FRAMES.sedan.wheelbase;
    const b = base.spec.wheelbase * base.spec.weightFront;
    // a body point above the rear axle rises by the radius difference, one above the front not at all
    const rearUp = heightAt(big, -b, 0, 0) - heightAt(base, -b, 0, 0);
    const frontUp = heightAt(big, L - b, 0, 0) - heightAt(base, L - b, 0, 0);
    expect(rearUp).toBeGreaterThan(0.075 * 0.9);
    expect(rearUp).toBeLessThan(0.075 * 1.1);
    expect(Math.abs(frontUp)).toBeLessThan(0.01);
    expect(-big.pitch * DEG).toBeCloseTo(Math.atan(0.075 / L) * DEG, 0);
    // the wheel centres stay where the suspension holds them; the wheel itself is bigger
    const o = { x: 0, y: 0, z: 0 };
    big.wheelLocal(2, o);
    const yBig = o.y;
    base.wheelLocal(2, o);
    expect(Math.abs(yBig - o.y)).toBeLessThan(0.01);
    expect(big.wheels[2].radius).toBeCloseTo(0.36, 9);
    expect(big.wheels[0].radius).toBeCloseTo(0.285, 9);
  });

  it('rolling radius: top speed and engine speed follow the driven wheels as gearing predicts', () => {
    const a = feel.launch(geared());
    const b = feel.launch(geared([0.285, 0.36]));
    expect(b.top / a.top).toBeGreaterThan((0.36 / 0.285) * 0.97);
    expect(b.top / a.top).toBeLessThan((0.36 / 0.285) * 1.03);
    // and at one road speed the engine turns slower on the bigger wheels, by the same ratio
    const rpmAt = (spec: VehicleSpec): number => {
      const v = new VehicleSim(spec);
      v.reset(0, 0, 0, 0);
      v.setManual(true);
      const robot = new RobotDriver({ cruise: 20 * KMH, latG: 5 });
      const path = new StraightPath();
      for (let t = 0; t < 20; t += v.h) v.substep(robot.update(v.h, v, path), flat);
      return (v.rpm / v.kmh) * (v.gear === 1 ? 1 : NaN);
    };
    const ra = rpmAt(geared());
    const rb = rpmAt(geared([0.285, 0.36]));
    expect(ra / rb).toBeCloseTo(0.36 / 0.285, 1);
    // the wheels spin as they roll
    const v = new VehicleSim(geared([0.3, 0.45]));
    v.reset(0, 0, 0, 0);
    const go: VehicleInput = { steer: 0, throttle: 0.4, brake: 0, handbrake: 0 };
    for (let t = 0; t < 6; t += v.h) v.substep(go, flat);
    expect(v.wheels[0].omega * 0.3).toBeCloseTo(v.vForward, 0);
    expect(v.wheels[3].omega * 0.45).toBeCloseTo(v.vForward, 0);
  });

  it('a per-wheel size (radiusOffset) lifts its own corner', () => {
    const base = parked(build({ frame: 'sedan' }));
    const v = parked(build({ frame: 'sedan' }), [0.06, 0, 0, 0]);
    const s = v.spec;
    const a = s.wheelbase * (1 - s.weightFront);
    const up = heightAt(v, a, 0, -s.front.track / 2) - heightAt(base, a, 0, -s.front.track / 2);
    expect(up).toBeGreaterThan(0.035);
    expect(up).toBeLessThan(0.07);
    // left side up: rolled right side down
    expect(v.roll).toBeGreaterThan(0.005);
    expect(v.wheels[0].radius).toBeCloseTo(0.285 + 0.06, 9);
  });

  for (const [name, wheel, side] of [
    ['front left', 0, -1],
    ['front right', 1, 1],
    ['rear left', 2, -1],
    ['rear right', 3, 1],
  ] as const) {
    it(`a smaller ${name} wheel pulls the car towards it`, () => {
      const spec = build({ frame: 'sedan' });
      const drift = (off: number): { dz: number; dyaw: number } => {
        const v = new VehicleSim(spec);
        v.mods.radiusOffset[wheel] = off;
        v.reset(0, 0, 0, 0);
        const robot = new RobotDriver({ cruise: 60 * KMH, latG: 5 });
        const path = new StraightPath();
        for (let t = 0; t < 12; t += v.h) v.substep(robot.update(v.h, v, path), flat);
        const z0 = v.pz;
        const y0 = v.yaw;
        // hands off the wheel, hold the speed
        const inp = zeroInput();
        let integ = 0.3;
        for (let t = 0; t < 5; t += v.h) {
          const err = 60 * KMH - v.vForward;
          integ = Math.min(1, Math.max(0, integ + err * 0.1 * v.h));
          inp.throttle = Math.min(1, Math.max(0, err * 0.6 + integ));
          v.substep(inp, flat);
        }
        return { dz: v.pz - z0, dyaw: v.yaw - y0 };
      };
      const small = drift(-0.04);
      const big = drift(+0.04);
      const none = drift(0);
      expect(Math.abs(none.dz)).toBeLessThan(0.05);
      // towards the smaller wheel (+z is right; yaw + turns left)
      expect(Math.sign(small.dz)).toBe(side);
      expect(Math.abs(small.dz)).toBeGreaterThan(1.5);
      expect(Math.sign(small.dyaw)).toBe(-side);
      // and the other way when this wheel is the bigger one
      expect(Math.sign(big.dz)).toBe(-side);
    });
  }

  it('either convention for the reference wheel gives the same car', () => {
    // (a) spec.wheelRadius the frame's, cgHeight without the lift; (b) spec.wheelRadius the fitted
    // wheels' mean, cgHeight with it — docs/MODCAR.md §4 物理实现说明
    const a = build({ frame: 'sedan', radius: [0.33, 0.37] });
    const lift = (0.33 + 0.37) / 2 - a.wheelRadius;
    const b: VehicleSpec = { ...a, wheelRadius: (0.33 + 0.37) / 2, cgHeight: a.cgHeight + lift, emptyHubRadius: 0.45 * a.wheelRadius };
    const va = parked(a);
    const vb = parked(b);
    expect(Math.abs(va.py - vb.py)).toBeLessThan(1e-6);
    expect(Math.abs(va.pitch - vb.pitch)).toBeLessThan(1e-6);
    const la = feel.launch(a);
    const lb = feel.launch(b);
    expect(Math.abs(la.top - lb.top)).toBeLessThan(0.05);
    expect(Math.abs(la.t60 - lb.t60)).toBeLessThan(0.05);
    // an empty hub rides on the same hub either way
    const ea = parked({ ...a, emptyHubRadius: 0.45 * a.wheelRadius }, undefined);
    ea.mods.wheelFit[1] = 2;
    const eb = parked(b);
    eb.mods.wheelFit[1] = 2;
    for (let t = 0; t < 3; t += ea.h) {
      ea.substep(zeroInput(), flat);
      eb.substep(zeroInput(), flat);
    }
    expect(ea.wheels[1].radius).toBeCloseTo(eb.wheels[1].radius, 9);
    expect(Math.abs(ea.roll - eb.roll)).toBeLessThan(1e-3);
  });

  it('a 0.285 → 0.62 m wheel change while parked does not launch it (spec and per-wheel)', () => {
    const base = build({ frame: 'sedan' });
    const huge = build({ frame: 'sedan', radius: [0.62, 0.62] });
    const v = parked(base);
    const y0 = v.py;
    v.applySpec(huge);
    let maxVy = 0;
    let maxW = 0;
    for (let t = 0; t < 3; t += v.h) {
      v.substep(zeroInput(), flat);
      maxVy = Math.max(maxVy, Math.abs(v.vy));
      maxW = Math.max(maxW, Math.hypot(v.avx, v.avy, v.avz));
    }
    expect(maxVy).toBeLessThan(0.05);
    expect(maxW).toBeLessThan(0.05);
    expect(v.py - y0).toBeCloseTo(0.62 - 0.285, 2);
    expect(v.feel.bottomOuts).toBe(0);
    // and back down
    v.applySpec(base);
    maxVy = 0;
    for (let t = 0; t < 3; t += v.h) {
      v.substep(zeroInput(), flat);
      maxVy = Math.max(maxVy, Math.abs(v.vy));
    }
    expect(maxVy).toBeLessThan(0.05);
    expect(v.py).toBeCloseTo(y0, 2);
    // all four through radiusOffset
    const w = parked(base);
    for (let i = 0; i < 4; i++) w.mods.radiusOffset[i] = 0.62 - 0.285;
    maxVy = 0;
    for (let t = 0; t < 3; t += w.h) {
      w.substep(zeroInput(), flat);
      maxVy = Math.max(maxVy, Math.abs(w.vy));
    }
    expect(maxVy).toBeLessThan(0.05);
    expect(w.py - y0).toBeCloseTo(0.62 - 0.285, 2);
    // one corner only: the body tilts onto it and settles without a jump
    const c = parked(base);
    c.mods.radiusOffset[0] = 0.62 - 0.285;
    let maxUp = 0;
    for (let t = 0; t < 4; t += c.h) {
      c.substep(zeroInput(), flat);
      maxUp = Math.max(maxUp, c.vy);
    }
    expect(maxUp).toBeLessThan(0.5);
    expect(c.speed).toBeLessThan(0.02);
    expect(c.roll * DEG).toBeGreaterThan(5);
    expect(c.exploded).toBe(false);
  });

  it('a heavier part moving the centre of gravity is put in force where the car stands', () => {
    const base = build({ frame: 'sedan' });
    const heavy = build({ frame: 'sedan', mass: 1350, weightFront: 0.6, cgHeight: 0.6 });
    const v = parked(base);
    // the hub mounts stay where they are in the world
    const o = { x: 0, y: 0, z: 0 };
    v.wheelLocal(0, o);
    const b0 = new Float64Array(9);
    v.basis(b0);
    const hub0 = v.px + b0[0] * o.x + b0[3] * o.y + b0[6] * o.z;
    v.applySpec(heavy);
    v.wheelLocal(0, o);
    v.basis(b0);
    const hub1 = v.px + b0[0] * o.x + b0[3] * o.y + b0[6] * o.z;
    expect(Math.abs(hub1 - hub0)).toBeLessThan(0.005);
    let maxVy = 0;
    for (let t = 0; t < 3; t += v.h) {
      v.substep(zeroInput(), flat);
      maxVy = Math.max(maxVy, Math.abs(v.vy));
    }
    expect(maxVy).toBeLessThan(0.15);
    expect(v.speed).toBeLessThan(0.02);
  });
});

describe('modcar · suspension rescale', () => {
  const axle = FRAMES.sedan.front;
  it('more weight on the same springs: lower frequency, more sag, less damping (bounded)', () => {
    const heavy = rescaleAxle(axle, { mass: 265 }, { mass: 530 });
    expect(heavy.springHz).toBeCloseTo(axle.springHz * Math.sqrt(0.5), 6);
    expect(heavy.dampingRatio).toBeCloseTo(axle.dampingRatio * Math.sqrt(0.5), 6);
    expect(heavy.sag!).toBeGreaterThan(axle.sag!);
    // the anti-roll bar is the same bar: the same rate
    expect(heavy.antiRollRatio * 530 * heavy.springHz ** 2).toBeCloseTo(axle.antiRollRatio * 265 * axle.springHz ** 2, 3);
    const light = rescaleAxle(axle, { mass: 265 }, { mass: 100 });
    expect(light.springHz).toBeGreaterThan(axle.springHz);
    expect(light.sag!).toBeLessThan(axle.sag!);
    // an overload sits just clear of the bump stop, never in it
    const over = rescaleAxle(axle, { mass: 265 }, { mass: 4000 });
    expect(over.sag! * over.travel).toBeLessThan(over.travel - 0.035);
    expect(over.dampingRatio).toBeGreaterThanOrEqual(0.12);
    // natural-sag axles get the cap too once they would sink into the stop
    const nat = rescaleAxle({ ...axle, sag: undefined }, { mass: 265 }, { mass: 4000 });
    expect(nat.sag).toBeDefined();
  });

  it('a tall sidewall is a softer spring in series', () => {
    const road = rescaleAxle(axle, { mass: 265, sidewall: 0.09 }, { mass: 265, sidewall: 0.09 });
    expect(road.springHz).toBeCloseTo(axle.springHz, 6);
    const tractor = rescaleAxle(axle, { mass: 265, sidewall: 0.09 }, { mass: 265, sidewall: 0.3 });
    expect(tractor.springHz).toBeLessThan(axle.springHz * 0.97);
    expect(tractor.springHz).toBeGreaterThan(axle.springHz * 0.7);
  });

  it('a rescaled build sits where its springs put it: heavier sinks, lighter rides higher', () => {
    let last = Infinity;
    for (const mass of [700, 1000, 1600, 2600]) {
      const v = parked(build({ frame: 'sedan', mass }), undefined, 4);
      // what the springs compress beyond the frame's ride, front and rear, at the centre of gravity
      const W = v.wheels;
      const s = v.spec;
      const sinkF = W[0].staticComp - s.front.rideComp!;
      const sinkR = W[2].staticComp - s.rear.rideComp!;
      const sink = sinkF * (1 - s.weightFront) + sinkR * s.weightFront;
      expect(Math.abs(v.py - (s.cgHeight - sink)), `${mass} kg ride height`).toBeLessThan(0.01);
      // (until the springs are as far down as the rescale lets them sit: just clear of the bump stops)
      if (mass <= 1600) expect(v.py, `${mass} kg lower than the lighter one`).toBeLessThan(last);
      else expect(v.py).toBeLessThanOrEqual(last + 0.001);
      expect(v.speed).toBeLessThan(0.01);
      last = v.py;
    }
    // the frame's own load rides at its cgHeight
    const ref = parked(build({ frame: 'sedan' }), undefined, 4);
    expect(Math.abs(ref.py - ref.spec.cgHeight)).toBeLessThan(0.005);
  });
});
