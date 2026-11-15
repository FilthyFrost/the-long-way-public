/**
 * ModCar builds that lack a part (docs/MODCAR.md §3; spec.absent and SimMods.wheelFit): no engine,
 * no gearbox, no steering, no handbrake, an empty hub, a rim without its tyre — each does what the
 * missing part means, and nothing else breaks.
 */
import { describe, expect, it } from 'vitest';
import { WheelFit, type SimMods } from '../../src/core/vehicle/mods';
import { VehicleSim, zeroInput, type VehicleInput } from '../../src/core/vehicle/sim';
import { NO_ENGINE, type AbsentParts, type VehicleSpec } from '../../src/core/vehicle/spec';
import { FlatGround, Surface, type Ground } from '../../src/core/world/ground';
import { feel } from './modcar/feel';
import { build } from './modcar/specgen';

const DEG = 180 / Math.PI;
const flat = new FlatGround();
const full: VehicleInput = { steer: 0, throttle: 1, brake: 0, handbrake: 0 };

const lacking = (absent: AbsentParts): VehicleSpec => build({ frame: 'sedan', absent });

function drive(v: VehicleSim, inp: VehicleInput, seconds: number, ground: Ground = flat): void {
  for (let t = 0; t < seconds; t += v.h) v.substep(inp, ground);
}

/** a sim standing still with the assists off (nothing holds it but what the parts do) */
function bare(spec: VehicleSpec, setup?: (m: SimMods) => void): VehicleSim {
  const v = new VehicleSim(spec);
  setup?.(v.mods);
  v.autoHold = false;
  v.hold = false;
  v.autoReverse = false;
  v.reset(0, 0, 0, 0);
  return v;
}

describe('modcar · missing parts', () => {
  it('no engine: no torque, never runs, 0 rpm, nothing burnt; the car only rolls', () => {
    const spec = { ...lacking({ engine: true }), engine: NO_ENGINE };
    const v = new VehicleSim(spec);
    v.reset(0, 0, 0, 0);
    expect(v.rpm).toBe(0);
    drive(v, full, 5);
    expect(v.speed).toBeLessThan(0.01);
    expect(v.rpm).toBe(0);
    expect(v.engineKw).toBe(0);
    expect(v.fuelUsedL).toBe(0);
    // no starter to turn it over either
    v.cranking = true;
    drive(v, zeroInput(), 1);
    expect(v.rpm).toBe(0);
    // in D it rolls down a hill: there is nothing to hold it back but the brakes
    const r = bare(spec);
    drive(r, zeroInput(), 6, new FlatGround({ slopeX: -0.08 }));
    expect(r.kmh).toBeGreaterThan(8);
    // the same with an engine that is off (in D a dead engine does not hold the car either)
    const off = bare(build({ frame: 'sedan' }));
    off.engineOn = false;
    drive(off, zeroInput(), 6, new FlatGround({ slopeX: -0.08 }));
    expect(Math.abs(off.kmh - r.kmh)).toBeLessThan(1.5);
  });

  it('no gearbox: the engine revs freely, nothing drives, no park lock, no gear changes', () => {
    const spec = lacking({ gearbox: true });
    const v = new VehicleSim(spec);
    v.reset(0, 0, 0, 0);
    drive(v, full, 4);
    expect(v.speed).toBeLessThan(0.01);
    expect(v.rpm).toBeGreaterThan(0.6 * spec.engine.redline);
    expect(v.fuelUsedL).toBeGreaterThan(0);
    v.setManual(true);
    expect(v.shiftUp()).toBe(false);
    // P has nothing to lock: on a 10 % hill it rolls away; with a gearbox it holds
    const hill = new FlatGround({ slopeX: -0.1 });
    const p = bare(spec);
    p.shift('P');
    drive(p, zeroInput(), 6, hill);
    expect(p.kmh).toBeGreaterThan(8);
    const g = bare(build({ frame: 'sedan' }));
    g.shift('P');
    drive(g, zeroInput(), 6, hill);
    expect(g.kmh).toBeLessThan(0.1);
  });

  it('no steering: the road wheels stay straight whatever the input', () => {
    const v = new VehicleSim(lacking({ steering: true }));
    v.reset(0, 0, 0, 0);
    drive(v, { steer: 0, throttle: 0.5, brake: 0, handbrake: 0 }, 4);
    drive(v, { steer: 1, throttle: 0.4, brake: 0, handbrake: 0 }, 3);
    drive(v, { steer: -1, throttle: 0.4, brake: 0, handbrake: 0 }, 3);
    expect(v.kmh).toBeGreaterThan(20);
    expect(Math.abs(v.yaw) * DEG).toBeLessThan(0.1);
    expect(Math.abs(v.pz)).toBeLessThan(0.05);
    expect(v.steerAngle).toBe(0);
    for (const w of v.wheels) expect(w.steer).toBe(0);
    // and it never turns on the skidpad
    expect(feel.skidpad(lacking({ steering: true })).maxLatG).toBeLessThan(0.05);
  });

  it('no handbrake: the lever and the handbrake input do nothing — parked in N it rolls away', () => {
    const hill = new FlatGround({ slopeX: -0.12 });
    const hold: VehicleInput = { steer: 0, throttle: 0, brake: 0, handbrake: 1 };
    const without = bare(lacking({ handbrake: true }));
    without.shift('N');
    without.setParkBrake(true);
    expect(without.parkBrake).toBe(0);
    drive(without, hold, 6, hill);
    expect(without.handbrake).toBe(0);
    expect(without.kmh).toBeGreaterThan(10);
    const withIt = bare(build({ frame: 'sedan' }));
    withIt.shift('N');
    withIt.setParkBrake(true);
    drive(withIt, hold, 6, hill);
    expect(withIt.parkBrake).toBe(1);
    expect(withIt.kmh).toBeLessThan(0.1);
  });

  it('an empty hub: the corner drops onto it and grinds; coasting pulls towards it and stops sooner', () => {
    const spec = build({ frame: 'sedan' });
    const none = (i: number) => (m: SimMods): void => {
      m.wheelFit[i] = WheelFit.None;
    };
    // at rest: that corner is lower than with its wheel
    const v = bare(spec, none(0));
    drive(v, zeroInput(), 3);
    const ok = bare(spec);
    drive(ok, zeroInput(), 3);
    expect(v.roll * DEG).toBeLessThan(-1.5); // left side down
    expect(v.pitch * DEG).toBeLessThan(-0.5); // nose down
    expect(v.wheels[0].contact).toBe(true);
    expect(v.wheels[0].radius).toBeLessThan(spec.wheelRadius * 0.5);
    // coasting in N from 40 km/h: it scrapes, drifts to the left (the missing front-left), slows hard
    for (const s of [v, ok]) {
      s.shift('N');
      s.vx = 40 / 3.6;
    }
    let scrape = 0;
    const z0 = v.pz;
    for (let t = 0; t < 6; t += v.h) {
      v.substep(zeroInput(), flat);
      ok.substep(zeroInput(), flat);
      scrape = Math.max(scrape, v.feel.scrape);
    }
    expect(scrape).toBeGreaterThan(3);
    expect(v.pz - z0).toBeLessThan(-1);
    expect(v.yaw).toBeGreaterThan(0.03);
    expect(v.kmh).toBeLessThan(ok.kmh - 10);
    expect(v.exploded).toBe(false);
    // the wheel put back while parked lifts the corner onto it, gently
    const p = bare(spec, none(2));
    drive(p, zeroInput(), 3);
    p.mods.wheelFit[2] = WheelFit.Tyre;
    let maxVy = 0;
    for (let t = 0; t < 3; t += p.h) {
      p.substep(zeroInput(), flat);
      maxVy = Math.max(maxVy, Math.abs(p.vy));
    }
    expect(maxVy).toBeLessThan(0.1);
    expect(Math.abs(p.roll) * DEG).toBeLessThan(0.3);
    expect(Math.abs(p.py - spec.cgHeight)).toBeLessThan(0.01);
  });

  it('a rim without its tyre: small, very little grip, harsh', () => {
    const spec = build({ frame: 'sedan' });
    const rims = (m: SimMods): void => {
      for (let i = 0; i < 4; i++) {
        m.wheelFit[i] = WheelFit.Rim;
        m.radiusOffset[i] = -0.09;
      }
    };
    const tyre = feel.skidpad(spec);
    const rim = feel.skidpad(spec, { mods: rims });
    expect(rim.maxLatG).toBeLessThan(tyre.maxLatG * 0.5);
    expect(feel.brakeFrom(spec, { mods: rims }, 60)).toBeGreaterThan(feel.brakeFrom(spec, undefined, 60) * 2);
    // it sits lower by the missing sidewall, and the road comes straight through
    const gravel = new FlatGround({ surface: Surface.Gravel });
    const r = new VehicleSim(spec);
    rims(r.mods);
    r.reset(0, 0, 0, 0);
    const t = new VehicleSim(spec);
    t.reset(0, 0, 0, 0);
    const go: VehicleInput = { steer: 0, throttle: 0.5, brake: 0, handbrake: 0 };
    drive(r, go, 8, gravel);
    drive(t, go, 8, gravel);
    expect(t.py - r.py).toBeGreaterThan(0.07);
    expect(r.feel.buzz).toBeGreaterThan(t.feel.buzz * 1.2);
    expect(r.feel.rim).toBeGreaterThan(1);
    expect(t.feel.rim).toBe(0);
  });

  it('every absence at once still runs without trouble', () => {
    const v = new VehicleSim({ ...lacking({ engine: true, gearbox: true, steering: true, handbrake: true }), engine: NO_ENGINE });
    for (let i = 0; i < 4; i++) v.mods.wheelFit[i] = i === 1 ? WheelFit.None : WheelFit.Rim;
    v.reset(0, 0, 0, 0);
    drive(v, { steer: 1, throttle: 1, brake: 0, handbrake: 1 }, 5, new FlatGround({ slopeX: -0.1 }));
    expect(v.exploded).toBe(false);
    expect(v.rpm).toBe(0);
    expect(Math.abs(v.yaw) * DEG).toBeLessThan(20);
  });
});
