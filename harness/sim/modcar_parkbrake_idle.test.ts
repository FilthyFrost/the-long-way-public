/**
 * Parked on the handbrake with the engine idling in D (docs/V3/plan/growth.md §九, the J8–J10 note "停在缓坡上拉着手刹、
 * 怠速挂着 D 档……往前溜"; fix1): nobody at the wheel (ModVehicle.step: no driver, no automatic hold), the lever latched.
 *   - the handbrake holds the car on the flat and on 3, 6 and 10 % slopes, nose up and nose down: the Sugar Cube (its
 *     rear wheels driven and braked by the lever) and the frames that drive all four (the Goat, the Buffalo, the Rhino:
 *     the converter's creep went to the front wheels the lever does not hold, and dragged the car on at 4 mm/s —
 *     14 m an hour — against it);
 *   - the same idling car without the handbrake creeps as an automatic does: walking pace on the flat, faster
 *     nose down, held back nose up;
 *   - a steep slope can be beyond it: the lever holds through the rear tyres' grip only — 20 % on asphalt, but nose
 *     down on loose ground the locked rear wheels slide (the load is off them), as a real car's do.
 */
import { describe, expect, it } from 'vitest';
import { stockBuild } from '../../src/core/modcar/build';
import { ModSystems, type ModEnv } from '../../src/core/modcar/systems';
import { VehicleSim, type VehicleInput } from '../../src/core/vehicle/sim';
import type { VehicleSpec } from '../../src/core/vehicle/spec';
import { FlatGround, Surface } from '../../src/core/world/ground';

const ENV: ModEnv = { ambientC: 18, dark: false, rain: 0, sun: 1 };
const IDLE: VehicleInput = { steer: 0, throttle: 0, brake: 0, handbrake: 0 };

interface Rig {
  sys: ModSystems;
  sim: VehicleSim;
  ground: FlatGround;
}

/** a frame's factory build standing on a slope (+ = nose up), its engine started, the lever as asked; then nobody at the wheel */
function parked(frame: string, slope: number, lever: boolean, surface: number = Surface.Asphalt): Rig {
  const sys = new ModSystems(stockBuild(frame, { fuel: 1 }));
  const sim = new VehicleSim(sys.derived.spec as VehicleSpec);
  const ground = new FlatGround({ slopeX: slope, surface });
  sim.reset(0, 0, 0, 0, ground);
  sim.autoReverse = false;
  sys.bind(sim);
  const r = { sys, sim, ground };
  // settled on the slope with a driver's foot on the brake (the assist), the engine started
  sim.setParkBrake(true);
  run(r, 3);
  sys.crank(true);
  run(r, 1.5);
  sys.crank(false);
  sim.setParkBrake(lever);
  run(r, 1);
  // out of the seat: nothing holds it but what the parts do (ModVehicle.step, no driver)
  sim.autoHold = false;
  return r;
}

/** the game's rhythm: four physics steps to one of the systems' */
function run(r: Rig, seconds: number): void {
  const n = Math.round(seconds * 120);
  for (let i = 0; i < n; i++) {
    r.sim.substep(IDLE, r.ground);
    if (i % 4 === 3) r.sys.update(4 / 120, ENV);
  }
}

/** how far it moves along its length in `seconds` (m, + = forward) and how fast it goes at the end (km/h, + = forward) */
function watch(r: Rig, seconds: number): { moved: number; kmh: number } {
  const x0 = r.sim.px;
  run(r, seconds);
  return { moved: r.sim.px - x0, kmh: r.sim.vForward * 3.6 };
}

const SLOPES = [0, 0.03, -0.03, 0.06, -0.06, 0.1, -0.1];

describe('modcar · parked on the handbrake, idling in D', () => {
  for (const frame of ['sedan', 'pickup', 'goat', 'buffalo', 'rhino']) {
    it(`${frame}: the handbrake holds it on 0, 3, 6 and 10 % (up and down); without it, it creeps`, () => {
      const rows: string[] = [];
      for (const slope of SLOPES) {
        const r = parked(frame, slope, true);
        expect(r.sys.running, 'the engine idles').toBe(true);
        expect(r.sim.selector).toBe('D');
        expect(r.sim.handbrake).toBe(1);
        const w = watch(r, 30);
        rows.push(`${(slope * 100).toFixed(0).padStart(3)} %: ${(w.moved * 1000).toFixed(1)} mm in 30 s`);
        // (a real car on its handbrake does not move at all: a millimetre is the springs settling)
        expect(Math.abs(w.moved), `${frame} on ${slope * 100} % with the handbrake`).toBeLessThan(0.002);
        expect(Math.abs(w.kmh)).toBeLessThan(0.01);
      }
      // the same without the handbrake: an automatic idling in D creeps — walking pace on the flat …
      const flat = watch(parked(frame, 0, false), 15);
      expect(flat.kmh, `${frame} creeping on the flat`).toBeGreaterThan(2);
      expect(flat.kmh).toBeLessThan(8);
      // … faster nose down, held back nose up
      const down = watch(parked(frame, -0.03, false), 15);
      const up = watch(parked(frame, 0.03, false), 15);
      expect(down.moved).toBeGreaterThan(flat.moved);
      expect(up.moved).toBeLessThan(flat.moved);
      rows.push(`no handbrake: flat ${flat.kmh.toFixed(1)} km/h (${flat.moved.toFixed(1)} m in 15 s), 3 % down ${down.kmh.toFixed(1)} km/h, 3 % up ${up.kmh.toFixed(1)} km/h`);
      console.log(`${frame}\n  ${rows.join('\n  ')}`);
    });
  }

  it('a steep slope can be beyond it: the lever holds through the rear tyres, 20 % on asphalt, less nose down on loose ground', () => {
    // asphalt: 20 % either way
    for (const slope of [0.2, -0.2]) expect(Math.abs(watch(parked('sedan', slope, true), 20).moved)).toBeLessThan(0.002);
    // gravel and grass hold 15 % either way …
    for (const s of [Surface.Gravel, Surface.Grass]) for (const slope of [0.15, -0.15]) expect(Math.abs(watch(parked('sedan', slope, true, s), 20).moved)).toBeLessThan(0.002);
    // … but 25 % nose down on grass is beyond it: the driver's foot on all four brakes held it there (parked() settles it
    // so), the lever on the rear two does not — the locked rear wheels slide, down the hill it goes
    const steep = parked('sedan', -0.25, true, Surface.Grass);
    expect(Math.abs(steep.sim.vForward)).toBeLessThan(0.01);
    expect(watch(steep, 10).moved).toBeGreaterThan(1);
  });
});
