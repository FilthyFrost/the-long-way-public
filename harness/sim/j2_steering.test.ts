/**
 * The steering's free play (docs/V3/plan/growth.md §1.6, J2): the steering wheel turns through the play before the
 * road wheels follow — and once it is let go, the road wheels, rolling, come back to straight ahead. Before, they
 * stayed turned by half the play and the car kept curving the way it last turned (4.5–9.5 °/s at 60 km/h for
 * 1.5–3.2° of play, measured on the proving ground's straight): the user's "always pulls to one side".
 */
import { describe, expect, it } from 'vitest';
import { stockBuild } from '../../src/core/modcar/build';
import { ModSystems, type ModEnv } from '../../src/core/modcar/systems';
import { VehicleSim, type VehicleInput } from '../../src/core/vehicle/sim';
import type { VehicleSpec } from '../../src/core/vehicle/spec';
import { FlatGround } from '../../src/core/world/ground';

const ENV: ModEnv = { ambientC: 18, dark: false, rain: 0, sun: 1 };
const DEG = 180 / Math.PI;

function rig(playDeg: number): { sys: ModSystems; sim: VehicleSim; ground: FlatGround } {
  const sys = new ModSystems(stockBuild('sedan'));
  const sim = new VehicleSim(sys.derived.spec as VehicleSpec);
  const ground = new FlatGround({});
  sim.reset(0, 0.05, 0, 0, ground);
  sys.bind(sim);
  // (the play as an old car's suspension has it, whatever the systems would make of this one's)
  Object.defineProperty(sim.mods, 'steerPlay', { get: () => playDeg / DEG, set: () => {}, configurable: true });
  sys.crank(true);
  const r = { sys, sim, ground };
  for (let i = 0; i < 45; i++) step(r, {});
  sys.crank(false);
  sim.setParkBrake(false);
  return r;
}

/** four physics steps and one of the systems', as the game does */
function step(r: ReturnType<typeof rig>, input: Partial<VehicleInput>): void {
  const inp: VehicleInput = { steer: 0, throttle: 0, brake: 0, handbrake: 0, ...input };
  for (let i = 0; i < 4; i++) r.sim.substep(inp, r.ground);
  r.sys.update(4 / 120, ENV);
}

/** so many seconds at about 60 km/h with the steering at `steer` */
function cruise(r: ReturnType<typeof rig>, seconds: number, steer: number): void {
  for (let t = 0; t < seconds; t += 4 / 120) step(r, { steer, throttle: r.sim.kmh < 60 ? 0.45 : 0.08 });
}

/** the yaw rate over so many seconds hands off (°/s) */
function yawRate(r: ReturnType<typeof rig>, seconds: number): number {
  const a = r.sim.yaw;
  cruise(r, seconds, 0);
  let d = r.sim.yaw - a;
  if (d > Math.PI) d -= 2 * Math.PI;
  if (d < -Math.PI) d += 2 * Math.PI;
  return (d * DEG) / seconds;
}

describe('the steering let go', () => {
  for (const play of [0, 1.5, 2.2, 3.2]) {
    it(`with ${play}° of play: a nudge either way, let go, and the car runs straight again`, () => {
      const r = rig(play);
      for (let t = 0; t < 25 && r.sim.kmh < 60; t += 4 / 120) step(r, { throttle: 0.8 });
      expect(r.sim.kmh).toBeGreaterThan(55);
      expect(Math.abs(yawRate(r, 2))).toBeLessThan(0.05);
      for (const steer of [0.35, -0.35]) {
        cruise(r, 0.6, steer);
        cruise(r, 1, 0);
        expect(Math.abs(r.sim.wheelAngle * DEG)).toBeLessThan(0.05);
        expect(Math.abs(yawRate(r, 3))).toBeLessThan(0.3);
      }
    });
  }

  it('the play is still felt: turning in, the road wheels follow the steering wheel by half of it', () => {
    const r = rig(3.2);
    for (let t = 0; t < 25 && r.sim.kmh < 60; t += 4 / 120) step(r, { throttle: 0.8 });
    // (a few hundredths of a second into a turn: the steering wheel has moved, the road wheels lag by the play's half)
    step(r, { steer: 0.35, throttle: 0.1 });
    step(r, { steer: 0.35, throttle: 0.1 });
    const lag = (r.sim.steerAngle - r.sim.wheelAngle) * DEG;
    expect(lag).toBeGreaterThan(0.5);
    expect(lag).toBeLessThanOrEqual(1.6 + 1e-6);
  });
});
