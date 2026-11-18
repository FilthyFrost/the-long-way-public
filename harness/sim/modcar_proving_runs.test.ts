/**
 * The proving ground's runs and its robot driver (src/core/modcar/proving/runs.ts, pilot.ts; docs/MODCAR.md §28),
 * headless on the proving ground itself: each section's run, driven by the robot, measures what the handling lab
 * measures on its flat asphalt (0–100, 100→0, the skid pad's g) near enough; the slalom goes through its cones and
 * counts what it knocks; the off-road course and the grade hill are got through; a run that leaves its section
 * comes to nothing.
 */
import { describe, expect, it } from 'vitest';
import { stockBuild } from '../../src/core/modcar/build';
import { derive } from '../../src/core/modcar/derive';
import { frameDef } from '../../src/core/modcar/frames';
import { figuresOf } from '../../src/core/modcar/lab/figures';
import { applyToSim } from '../../src/core/modcar/simlink';
import { ConeField, type ConeBody } from '../../src/core/modcar/proving/cones';
import { ProvingGround, sectionOf, type SectionId } from '../../src/core/modcar/proving/layout';
import { Pilot, type PilotOptions } from '../../src/core/modcar/proving/pilot';
import { Runs, type RunResult } from '../../src/core/modcar/proving/runs';
import { newCarState, readCar } from '../../src/core/modcar/proving/telemetry';
import { VehicleSim, zeroInput, type VehicleInput } from '../../src/core/vehicle/sim';
import type { VehicleSpec } from '../../src/core/vehicle/spec';
import { tried } from '../../src/game/modcar/devLab';
import { modcarWorld } from '../../src/game/modcar/seamless';

const made = modcarWorld(4242, {});
const pg = new ProvingGround(made.level, made.world);

interface Drive {
  result: RunResult | null;
  sim: VehicleSim;
  cones: ConeField;
  pilot: Pilot;
}

/** a stock build (with a part tried on it) set down at a section and driven there by the robot until it is done (or `limit` s) */
function drive(frameId: string, section: SectionId, opts: PilotOptions = {}, limit = 240, part = ''): Drive {
  const b = part ? tried(stockBuild(frameId, { fuel: 0.6 }), part)! : stockBuild(frameId, { fuel: 0.6 });
  const d = derive(b);
  const sim = new VehicleSim(d.spec as VehicleSpec);
  applyToSim(sim, d, true);
  const s = sectionOf(section);
  sim.reset(s.x, pg.heightAt(s.x, s.z) + 0.05, s.z, s.yaw, pg);
  sim.setParkBrake(false);
  const cones = new ConeField(pg);
  const runs = new Runs(cones);
  const box = frameDef(frameId).body;
  const pilot = new Pilot(section, box.halfWidth, opts);
  const c = newCarState();
  const body: ConeBody = { x: 0, z: 0, vx: 0, vz: 0, yawRate: 0, fx: 1, fz: 0, front: box.front, rear: box.rear, halfWidth: box.halfWidth, bottom: box.bottom };
  const B = new Float64Array(9);
  let input: VehicleInput = zeroInput();
  let result: RunResult | null = null;
  const dt = 1 / 60;
  // (a moment to settle on its springs first)
  for (let t = 0; t < 0.5; t += dt) sim.update(dt, zeroInput(), pg);
  for (let t = 0; t < limit && !sim.exploded; t += dt) {
    sim.update(dt, input, pg);
    readCar(sim, t, sim.rpm, true, c);
    sim.basis(B);
    const fl = Math.hypot(B[0], B[2]) || 1;
    Object.assign(body, { x: sim.px, z: sim.pz, vx: sim.vx, vz: sim.vz, yawRate: sim.yawRate, fx: B[0] / fl, fz: B[2] / fl });
    cones.step(dt, [body]);
    runs.step(c);
    if (runs.justDone?.section === section && !result) result = runs.justDone;
    const cur = runs.current?.section === section ? runs.current.phase : result ? 'done' : null;
    input = { ...pilot.drive(dt, sim, cur) };
    if (pilot.wantStop && runs.current?.section === section) {
      runs.stop(c);
      if (runs.justDone?.section === section && !result) result = runs.justDone;
      if (!result && runs.results.length) result = runs.results[runs.results.length - 1];
    }
    if (pilot.done && result) break;
  }
  return { result, sim, cones, pilot };
}

const figure = (r: RunResult | null, key: string): number => r?.figures.find((f) => f.key === key)?.value ?? NaN;

describe('modcar · the proving ground’s runs, driven by its robot', () => {
  const lab = figuresOf(stockBuild('sedan', { fuel: 0.5 }));

  it('直线加速: the run’s 0–100 is the lab’s', () => {
    const { result, sim } = drive('sedan', 'accel');
    expect(sim.exploded).toBe(false);
    expect(result?.ok, result?.line).toBe(true);
    const t100 = figure(result, 't100');
    expect(t100 / lab.t0to100).toBeGreaterThan(0.9);
    expect(t100 / lab.t0to100).toBeLessThan(1.12);
    expect(figure(result, 'tk')).toBeGreaterThan(figure(result, 'tq'));
    expect(result!.trace.length).toBeGreaterThan(100);
  });

  it('刹车: from the brake line to a stop, the lab’s 100→0', () => {
    const { result } = drive('sedan', 'brake');
    expect(result?.ok, result?.line).toBe(true);
    expect(figure(result, 'v0')).toBeGreaterThan(90);
    const d100 = figure(result, 'd100');
    expect(d100 / lab.brake100m).toBeGreaterThan(0.85);
    expect(d100 / lab.brake100m).toBeLessThan(1.15);
  });

  it('定圆: lap after lap until it cannot hold the lane; the grip the lab finds', () => {
    const { result } = drive('sedan', 'skidpad', {}, 150);
    expect(result?.ok, result?.line).toBe(true);
    expect(figure(result, 'laps')).toBeGreaterThanOrEqual(2);
    const g = figure(result, 'g');
    expect(g / lab.maxLatG).toBeGreaterThan(0.8);
    expect(g / lab.maxLatG).toBeLessThan(1.15);
  });

  it('绕桩: through the ten cones at 45 km/h, none knocked or missed', () => {
    const { result, cones } = drive('sedan', 'slalom', { slalomKmh: 45 });
    expect(result?.ok, result?.line).toBe(true);
    expect(figure(result, 'missed')).toBe(0);
    expect(figure(result, 'cones')).toBe(0);
    expect(cones.knocked).toBe(0);
    expect(figure(result, 'g')).toBeGreaterThan(0.3);
  });

  it('绕桩: pushed to what the tyres hold, slicks are faster through it than road tyres, snow tyres slower', () => {
    const road = figure(drive('sedan', 'slalom').result, 'total');
    const slick = figure(drive('sedan', 'slalom', {}, 240, 'tire_slick').result, 'total');
    const snow = figure(drive('sedan', 'slalom', {}, 240, 'tire_snow').result, 'total');
    expect(slick).toBeLessThan(road * 0.92);
    expect(snow).toBeGreaterThan(road);
    // (and every frame gets through it so, none off its lane)
    for (const f of ['van', 'snail', 'rhino', 'rv', 'fox', 'moto']) expect(drive(f, 'slalom').result?.ok, f).toBe(true);
  });

  it('绕桩: too fast for it, cones go flying and count', () => {
    const { result, cones } = drive('pickup', 'slalom', { slalomKmh: 95 });
    expect(result).not.toBeNull();
    if (result!.ok) expect(figure(result, 'cones') + figure(result, 'missed')).toBeGreaterThan(0);
    expect(cones.knocked).toBeGreaterThan(0);
    // (a knocked cone came to rest on its side, off its spot)
    const c = cones.cones.find((x) => x.down && x.still);
    expect(c).toBeDefined();
    expect(Math.hypot(c!.x - c!.hx, c!.z - c!.hz)).toBeGreaterThan(0.5);
  });

  it('越野路段: the course got through, the body thrown about', () => {
    const { result, sim } = drive('goat', 'offroad', {}, 200);
    expect(sim.exploded).toBe(false);
    expect(result?.ok, result?.line).toBe(true);
    expect(figure(result, 'roll')).toBeGreaterThan(5);
    expect(figure(result, 't')).toBeGreaterThan(30);
  });

  it('坡道: the four-by-four up the 30 % ramp to its top', () => {
    const { result } = drive('goat', 'hill', { ramp: 1 }, 90);
    expect(result?.ok, result?.line).toBe(true);
    expect(figure(result, 'grade')).toBe(30);
  });
});

