/** The vehicle against solids: nothing changes when nothing is near; light things by their kind. */
import { describe, expect, it } from 'vitest';
import { StaticSolids } from '../../src/core/onfoot/statics';
import { isLightSolid, VehicleSim, type VehicleInput } from '../../src/core/vehicle/sim';
import { T0_TRUCK, T3_RV } from '../../src/core/vehicle/spec';
import { FlatGround, Surface } from '../../src/core/world/ground';
import { fbm2 } from '../../src/core/math/noise';

function run(solids: StaticSolids | null, spec = T0_TRUCK): number[] {
  const relief = (x: number, z: number): number => 0.2 * fbm2(x / 15, z / 15, 3, 2);
  const g = new FlatGround({ relief, surface: Surface.Gravel });
  const v = new VehicleSim(spec);
  v.reset(0, relief(0, 0), 0, 0);
  v.solids = solids;
  const inp: VehicleInput = { steer: 0, throttle: 1, brake: 0, handbrake: 0 };
  for (let i = 0; i < 120 * 20; i++) {
    inp.steer = Math.sin(i / 200);
    inp.handbrake = i % 700 < 60 ? 1 : 0;
    v.substep(inp, g);
  }
  return v.serialize();
}

describe('vehicle and solids', () => {
  it('the handling is bit-identical with no solids, an empty set, or solids far away', () => {
    const a = run(null);
    expect(run(new StaticSolids())).toEqual(a);
    const far = new StaticSolids();
    far.box(0, 400, 2, 2, 0, -1, 3, false, 'site:building');
    far.post(-300, 0, 0.3, -1, 3, 'site:signpole');
    expect(run(far)).toEqual(a);
  });

  it('its own body and things below the floor are ignored', () => {
    const s = new StaticSolids();
    s.box(0, 0, 3, 1, 0, -1, 3, false, T3_RV.id);
    s.box(20, 0, 2, 2, 0, -1, 0.1, false, 'site:step');
    const v = new VehicleSim(T3_RV);
    v.reset(0, 0, 0, 0);
    v.solids = s;
    for (let i = 0; i < 120 * 6; i++) v.substep({ steer: 0, throttle: 1, brake: 0, handbrake: 0 }, new FlatGround());
    expect(v.hits).toBe(0);
    expect(v.px).toBeGreaterThan(25);
  });

  it('light kinds are knocked aside, fixed kinds stop the vehicle', () => {
    for (const t of ['light:x', 'site3:crate', 'site3:barrel', 'a:b:fence', 'site9:trolley']) expect(isLightSolid(t)).toBe(true);
    for (const t of ['site3:building', 'site3:pump', 'site3:wreck', 't0_truck', 'crate', '']) expect(isLightSolid(t)).toBe(false);
    const s = new StaticSolids();
    s.box(40, 0, 0.4, 0.4, 0, 0, 0.8, false, 'site1:barrel');
    s.box(80, 0, 0.3, 6, 0, -1, 3, false, 'site1:building');
    const v = new VehicleSim(T0_TRUCK);
    v.reset(0, 0, 0, 0);
    v.solids = s;
    const knocked: string[] = [];
    v.onKnock = (x) => knocked.push(x.tag);
    for (let i = 0; i < 120 * 20; i++) v.substep({ steer: 0, throttle: v.speed < 12 ? 1 : 0.2, brake: 0, handbrake: 0 }, new FlatGround());
    expect(knocked).toEqual(['site1:barrel']);
    expect(v.hits).toBeGreaterThan(0);
    expect(v.px + T0_TRUCK.body.centerX + T0_TRUCK.body.halfLength).toBeLessThan(79.75 + 0.2);
    expect(v.exploded).toBe(false);
  });
});
