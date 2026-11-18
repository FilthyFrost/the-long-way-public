/**
 * The places' floors under the wheels (src/game/modcar/floorGround.ts, docs/MODCAR.md §20): over a building's
 * plinth a wheel rolls on its top, a hand above the land; a floor that stands higher (a porch, a jetty's deck) is no
 * ground to it, nor is a solid that is not a floor; off the plinth it is the land again. A car set on one comes to
 * rest on it.
 */
import { describe, expect, it } from 'vitest';
import { stockBuild } from '../../src/core/modcar/build';
import { derive } from '../../src/core/modcar/derive';
import { applyToSim } from '../../src/core/modcar/simlink';
import type { VehicleSpec } from '../../src/core/vehicle/spec';
import { VehicleSim } from '../../src/core/vehicle/sim';
import { FlatGround, GroundSample, Surface } from '../../src/core/world/ground';
import { Solid, SolidSet, type SolidSource } from '../../src/core/world/solids';
import { FLOOR_STEP, FloorGround } from '../../src/game/modcar/floorGround';

class Box implements SolidSource {
  constructor(readonly list: Solid[]) {}
  solidsNear(x: number, z: number, r: number, out: Solid[]): void {
    for (const s of this.list) if (Math.hypot(x - s.x, z - s.z) < r + Math.hypot(s.hx, s.hz)) out.push(s);
  }
}

const land = new FlatGround({ surface: Surface.Grass });
const at = (g: FloorGround, x: number, z: number): GroundSample => {
  const o = new GroundSample();
  g.sample(x, z, o);
  return o;
};

describe('modcar · the places’ floors under the wheels', () => {
  const plinth = new Solid().set(10, 5, 5.8, 4.1, 0.3, -1, 0.21, true, 'site:building');
  const porch = new Solid().set(-10, 0, 2, 1, 0, -1, FLOOR_STEP + 0.2, true, 'site:porch');
  const crate = new Solid().set(0, -10, 1, 1, 0, 0, 0.2, false, 'site:crate');
  const set = new SolidSet();
  set.add(new Box([plinth, porch, crate]));
  let t = 0;
  const g = new FloorGround(land, set, () => t);

  it('a wheel over a plinth rolls on its top; off it, on the land', () => {
    const on = at(g, 10, 5);
    expect(on.h).toBeCloseTo(0.21, 6);
    expect(on.surface).toBe(Surface.Asphalt);
    expect(on.ny).toBe(1);
    // (a corner of it, turned with it)
    const c = Math.cos(0.3);
    const s = Math.sin(0.3);
    expect(at(g, 10 + 5.5 * c - 3.9 * s, 5 + 5.5 * s + 3.9 * c).h).toBeCloseTo(0.21, 6);
    // (just past its long side, where an unturned box would still have been)
    expect(at(g, 10 + 6.1 * c, 5 + 6.1 * s).h).toBe(0);
    expect(at(g, 30, 30).surface).toBe(Surface.Grass);
  });

  it('a floor higher than a kerb is no ground to it, nor a solid that is no floor', () => {
    expect(at(g, -10, 0).h).toBe(0);
    expect(at(g, 0, -10).h).toBe(0);
  });

  it('the floors are asked for again as the places come and go', () => {
    const fresh = new SolidSet();
    const src = new Box([]);
    fresh.add(src);
    const g2 = new FloorGround(land, fresh, () => t);
    expect(at(g2, 10, 5).h).toBe(0);
    src.list.push(plinth);
    // (kept a little while)
    expect(at(g2, 10, 5).h).toBe(0);
    t += 1.5;
    expect(at(g2, 10, 5).h).toBeCloseTo(0.21, 6);
  });

  it('a car set on a plinth comes to rest on it', () => {
    const b = stockBuild('sedan', { fuel: 0.3 });
    const d = derive(b);
    const spec = d.spec as VehicleSpec;
    const sim = new VehicleSim(spec);
    applyToSim(sim, d, true);
    // (the yaw of the game's plan: a car turned as the plinth is)
    sim.reset(10, 0.21 + 0.05, 5, 0.3, g);
    sim.setParkBrake(true);
    for (let i = 0; i < 240; i++) sim.substep({ steer: 0, throttle: 0, brake: 0, handbrake: 0 }, g);
    expect(sim.exploded).toBe(false);
    // (resting on the floor: its centre as high over the floor's top as it stands over the land)
    expect(sim.py - spec.cgHeight).toBeGreaterThan(0.21 - 0.08);
    expect(Math.hypot(sim.px - 10, sim.pz - 5)).toBeLessThan(0.1);
    expect(sim.speed).toBeLessThan(0.1);
  });
});
