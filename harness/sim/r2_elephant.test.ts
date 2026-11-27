/**
 * R2 (docs/V3/plan/rv.md): the Old Elephant and its electricity.
 *   - the frame: a flat-fronted motorhome 9.8 m by 2.4 (8.2 until docs/V3/plan/finish.md §18), its V8 at the back under the bed on a three-speed, duals behind,
 *     a roof for a rack with a ladder up the side, a house battery on its own mount, no boot (its back is the bedroom's
 *     window); heavy and slow
 *   - its places for things inside its body under the ceiling: its floor in three and the deck over the engine — an empty
 *     shell since docs/V3/plan/finish.md §十九 step 7, as Nomad Drive's campers are, found with nothing in it
 *   - its living space: its floor wall to wall inside its body back to the engine deck, the door's inside on it; no bed
 *     built in
 *   - the house battery: charged by the alternator while running and by a solar roof (all of the solar's), the
 *     appliances drawn from it; with none, from the starter battery only down to the share it keeps to crank on
 *   - a fridge with no power keeps nothing cold: what is in it goes off at the open air's rate, and back
 *   - the hob: a stove of the kitchen's that needs no canister, lit only with power there, cooking as the stove does
 *   - what each electric thing draws
 *   - the plan: after the 100th kilometre the Rhino, the Snail, then the Old Elephant
 */
import { describe, expect, it } from 'vitest';
import { aboardOf } from '../../src/core/modcar/aboard';
import { fitPart, newInstance, removePart, stockBuild } from '../../src/core/modcar/build';
import { zonesFor } from '../../src/core/modcar/cargo';
import elephantBox from '../../src/core/modcar/data/mounts/elephant.json';
import { FRAMES, frameDef, frameSize } from '../../src/core/modcar/frames';
import { runProblems, warnings } from '../../src/core/modcar/rules';
import { boxDecay, newItem, putInside, setUnpowered } from '../../src/core/modcar/items';
import { partDef } from '../../src/core/modcar/parts';
import { vehiclePlan } from '../../src/core/modcar/schedule';
import { ModSystems, STARTER_KEEP, type ModEnv } from '../../src/core/modcar/systems';
import type { Build } from '../../src/core/modcar/types';
import { toggle } from '../../src/core/v3/appliances/appliances';
import { HOB, STOVE, VESSEL } from '../../src/core/v3/kitchen/items';
import { addPortion, fireOf, kitKind, potOf, putVessel, setFire, stoveStep, type StoveTick } from '../../src/core/v3/kitchen/kit';
import { ND_FRIDGE } from '../../src/core/v3/nd/items';
import { VehicleSim, type VehicleInput } from '../../src/core/vehicle/sim';
import type { VehicleSpec } from '../../src/core/vehicle/spec';
import { FlatGround } from '../../src/core/world/ground';
import { APPLIANCE_W, FRIDGE_W, HOB_W, wattsOf } from '../../src/game/modcar/v3/power/system';
// (the kitchen's kinds in the catalogue, the appliances', Nomad Drive's fridge)
import '../../src/game/modcar/v3/kitchen';
import '../../src/game/modcar/v3/nd-home';

const NIGHT: ModEnv = { ambientC: 18, dark: true, rain: 0, sun: 0 };
const NOON: ModEnv = { ambientC: 18, dark: false, rain: 0, sun: 1 };

function rig(build: Build): { sys: ModSystems; sim: VehicleSim; ground: FlatGround } {
  const sys = new ModSystems(build);
  const sim = new VehicleSim(sys.derived.spec as VehicleSpec);
  sim.reset(0, 0, 0, 0);
  sys.bind(sim);
  return { sys, sim, ground: new FlatGround() };
}

function run(r: ReturnType<typeof rig>, seconds: number, env: ModEnv, input: Partial<VehicleInput> = {}): void {
  const inp: VehicleInput = { steer: 0, throttle: 0, brake: 0, handbrake: 0, ...input };
  const n = Math.round(seconds * 120);
  for (let i = 0; i < n; i++) {
    r.sim.substep(inp, r.ground);
    if (i % 4 === 3) r.sys.update(4 / 120, env);
  }
}

const charge = (b: Build, mount: string): number => b.parts[mount]?.fluids.charge ?? NaN;

describe('R2: the Old Elephant', () => {
  it('the frame: a flat-fronted motorhome 9.8 m by 2.4, its V8 at the back on a three-speed, duals behind, a roof and a ladder, a house battery, no boot', () => {
    const f = frameDef('elephant');
    expect(f.kind).toBe('rv');
    const size = frameSize('elephant');
    expect(size.length).toBeGreaterThan(9.5);
    expect(size.length).toBeLessThan(10.0);
    expect(size.width).toBeGreaterThan(2.3);
    expect(size.width).toBeLessThan(2.5);
    expect(f.body.top).toBeGreaterThan(3.0);
    const at = (cat: string) => f.mounts.filter((m) => m.cat === cat);
    expect(at('roof')).toHaveLength(1);
    expect(at('ladder')).toHaveLength(1);
    expect(at('houseBattery')).toHaveLength(1);
    expect(at('trunk')).toHaveLength(0);
    // (a pusher: the engine behind the rear axle, under the bed)
    const eng = at('engine')[0];
    const rear = f.mounts.find((m) => m.id === 'hub_RL')!;
    expect(eng.pos.x).toBeLessThan(rear.pos.x);
    const b = stockBuild('elephant');
    expect(b.parts.engine.part).toBe('eng_v8');
    expect(b.parts.gearbox.part).toBe('gb_3');
    expect(b.parts.houseBattery.part).toBe('bat_house');
    expect(partDef(b.parts.hub_RL.part).rim?.dual).toBe(true);
    expect(partDef(b.parts.hub_FL.part).rim?.dual).toBeFalsy();
    for (const m of ['seat_driver', 'seat_pass', 'door_side', 'door_FL', 'door_FR', 'hood', 'battery', 'radiator']) expect(b.parts[m], m).toBeTruthy();
  });

  it('every frame’s works build has a radiator for a water-cooled engine', () => {
    for (const f of FRAMES.filter((x) => !x.towed)) {
      const b = stockBuild(f.id);
      expect([...runProblems(b), ...warnings(b)].map((p) => p.code), f.id).not.toContain('no_radiator');
    }
  });

  it('its places for things lie inside its body under the ceiling: a single continuous cabin floor with stairwell hole and the deck over the engine; it is found with nothing in it', () => {
    const f = frameDef('elephant');
    const zones = zonesFor('elephant', stockBuild('elephant'));
    for (const id of ['cabin', 'nook', 'pass', 'dash', 'wall']) expect(zones.some((z) => z.id === id), id).toBe(true);
    for (const id of ['lounge', 'fore', 'bed', 'galley', 'table', 'cubby', 'fridge', 'sofa']) expect(zones.some((z) => (z.id as string) === id), id).toBe(false);
    for (const z of zones) {
      expect(z.x[0], z.id).toBeGreaterThanOrEqual(f.body.rear);
      expect(z.x[1], z.id).toBeLessThanOrEqual(f.body.front);
      expect(Math.max(Math.abs(z.z[0]), Math.abs(z.z[1])), z.id).toBeLessThanOrEqual(f.body.halfWidth);
      // (the floor is drawn looking down from the zone's top: under the ceiling, 3.065)
      expect(z.top, z.id).toBeLessThanOrEqual(2.46);
    }
    const by = (id: string) => zones.find((z) => z.id === id)!;
    const [cabin, deck] = [by('cabin'), by('nook')];
    expect(deck.x[1]).toBeCloseTo(cabin.x[0], 6);
    expect(cabin.x[1] - cabin.x[0]).toBeGreaterThan(6.5);
    for (const z of [cabin, deck]) expect(z.z[1] - z.z[0], z.id).toBeGreaterThan(2.3);
    expect(cabin.holes?.length).toBe(1);
    expect(cabin.holes![0].z[0]).toBeLessThan(0.95);
    expect(deck.floor).toBeGreaterThan(cabin.floor + 0.6);
    // (no hobs on a worktop, no sofa: what is in it the player puts in)
    expect(f.fittings ?? []).toEqual([]);
    // (between its wheels' humps a metre and a tenth at the least, as its aisle was made — it was 76 cm)
    for (const r of aboardOf('elephant')!.areas) expect(r.z1 - r.z0, r.name).toBeGreaterThanOrEqual(1.1 - 1e-9);
  });

  it('its living space: its floor wall to wall inside its body back to the engine deck, the door’s inside on it, no bed built in', () => {
    const f = frameDef('elephant');
    const a = aboardOf('elephant')!;
    expect(a.roof).toBeFalsy();
    const inArea = (x: number, z: number) => a.areas.some((r) => x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1);
    for (const r of a.areas) {
      expect(r.x0).toBeGreaterThanOrEqual(f.body.rear);
      expect(r.x1).toBeLessThanOrEqual(f.body.front);
      expect(Math.max(Math.abs(r.z0), Math.abs(r.z1))).toBeLessThan(f.body.halfWidth);
    }
    expect(a.doors).toHaveLength(1);
    expect(a.doors[0].mount).toBe('door_side');
    expect(inArea(...a.doors[0].inside)).toBe(true);
    expect(inArea(...a.aft!)).toBe(true);
    // (back from the seat: behind the seats)
    expect(a.aft![0]).toBeLessThan(f.mounts.find((m) => m.id === 'seat_driver')!.pos.x);
    // (no bed built in: a cot put in is one)
    expect(a.beds ?? []).toHaveLength(0);
    // (its floor back to the engine deck's front, wall to wall: the model's own room — data/mounts/elephant.json)
    const room = (elephantBox as never as { room: { x: number[]; z: number[] } }).room;
    expect(Math.min(...a.areas.map((r) => r.x0))).toBeGreaterThanOrEqual(room.x[0] - 1e-9);
    expect(Math.min(...a.areas.map((r) => r.x0))).toBeLessThan(room.x[0] + 0.15);
    expect(Math.max(...a.areas.map((r) => r.z1)) - Math.min(...a.areas.map((r) => r.z0))).toBeGreaterThan(2.0);
  });
});

describe('R2: the house battery', () => {
  it('charged by the alternator while the engine runs, and by a solar roof — the solar all the house battery’s', () => {
    const b = stockBuild('elephant');
    b.parts.houseBattery.fluids.charge = 0.2;
    b.parts.battery.fluids.charge = 0.9;
    const r = rig(b);
    // (night, the engine off: nothing)
    run(r, 10, NIGHT);
    expect(charge(b, 'houseBattery')).toBeCloseTo(0.2, 6);
    r.sys.crank(true);
    run(r, 1.5, NIGHT);
    r.sys.crank(false);
    expect(r.sys.running).toBe(true);
    const h0 = charge(b, 'houseBattery');
    run(r, 60, NIGHT);
    expect(charge(b, 'houseBattery')).toBeGreaterThan(h0 + 0.05);
    // a solar panel on the roof: in the sun, the engine off, the house battery charges and the starter does not
    r.sys.stop('');
    fitPart(b, 'roof', newInstance('roof_solar'));
    const r2 = rig(b);
    const h1 = charge(b, 'houseBattery');
    const s1 = charge(b, 'battery');
    run(r2, 60, NOON);
    expect(charge(b, 'houseBattery')).toBeGreaterThan(h1 + 0.01);
    expect(charge(b, 'battery')).toBeCloseTo(s1, 6);
  });

  it('the appliances draw on the house battery; with none, on the starter battery only down to what it keeps to crank on', () => {
    const b = stockBuild('elephant');
    b.parts.houseBattery.fluids.charge = 0.5;
    const r = rig(b);
    expect(r.sys.applianceLevel()).toBeCloseTo(0.5, 6);
    const s0 = charge(b, 'battery');
    expect(r.sys.drawAppliances(1, 60)).toBe(true);
    expect(charge(b, 'houseBattery')).toBeLessThan(0.5);
    expect(charge(b, 'battery')).toBe(s0);
    // (flat: nothing drawn)
    b.parts.houseBattery.fluids.charge = 0;
    expect(r.sys.drawAppliances(1, 1)).toBe(false);
    // no house battery: the starter, down to its keep
    const w = stockBuild('rv');
    w.parts.battery.fluids.charge = STARTER_KEEP + 0.1;
    const rw = rig(w);
    expect(rw.sys.applianceLevel()).toBeCloseTo(0.1 / (1 - STARTER_KEEP), 6);
    for (let i = 0; i < 400; i++) rw.sys.drawAppliances(2, 10);
    expect(charge(w, 'battery')).toBeCloseTo(STARTER_KEEP, 6);
    expect(rw.sys.applianceLevel()).toBe(0);
    expect(rw.sys.drawAppliances(0.1, 1)).toBe(false);
    // none at all
    removePart(w, 'battery');
    expect(rig(w).sys.applianceLevel()).toBeNull();
  });

  it('a fridge with no power keeps nothing cold: what is in it goes off at the open air’s rate, and back', () => {
    const fridge = newItem(ND_FRIDGE);
    expect(boxDecay(fridge)).toBe(0.25);
    const milk = newItem('ing_milk');
    expect(putInside(fridge, milk, 100)).toBe(0);
    const inside = fridge.inside![0];
    expect(inside.fk).toBe(0.25);
    expect(setUnpowered(fridge, 200, true)).toBe(true);
    expect(boxDecay(fridge)).toBe(1);
    expect(inside.fk ?? 1).toBe(1);
    expect(setUnpowered(fridge, 210, true)).toBe(false);
    expect(setUnpowered(fridge, 300, false)).toBe(true);
    expect(inside.fk).toBe(0.25);
    expect(fridge.state).toBeUndefined();
  });

  it('what each electric thing draws: an appliance switched on, a fridge all the time, a hob at its heat', () => {
    const lamp = newItem('junk_lamp');
    expect(wattsOf(lamp)).toBe(0);
    toggle(lamp, true);
    expect(wattsOf(lamp)).toBe(APPLIANCE_W.lamp);
    const tv = newItem('junk_tv');
    toggle(tv, true);
    expect(wattsOf(tv)).toBe(APPLIANCE_W.tv);
    expect(wattsOf(newItem(ND_FRIDGE))).toBe(FRIDGE_W);
    const hob = newItem(HOB);
    expect(wattsOf(hob)).toBe(0);
    expect(setFire(hob, 2, 'on')).toBeNull();
    expect(wattsOf(hob)).toBe(HOB_W[2]);
    expect(wattsOf(newItem(STOVE))).toBe(0);
  });
});

describe('R2: the hob', () => {
  it('a stove of the kitchen’s with no canister, lit only with power there, cooking as the stove does', () => {
    const hob = newItem(HOB);
    expect(kitKind(HOB)).toBe('stove');
    expect(setFire(hob, 2)).toBe('nopower');
    expect(setFire(hob, 2, 'flat')).toBe('flat');
    expect(fireOf(hob)).toBe(0);
    expect(putVessel(hob, newItem(VESSEL.fry))).toBe(true);
    expect(addPortion(hob, { id: 'egg' })).toBe(true);
    expect(setFire(hob, 2, 'on')).toBeNull();
    const tick: StoveTick = { burning: false, ranOut: false, before: null, after: null, asked: false };
    for (let i = 0; i < 60 * 8; i++) stoveStep(hob, 1 / 60, tick);
    expect(tick.burning).toBe(true);
    expect(tick.ranOut).toBe(false);
    expect(potOf(hob)!.done!).toBeGreaterThan(0.3);
    expect(fireOf(hob)).toBe(2);
    // (the cassette stove still wants its canister)
    expect(setFire(newItem(STOVE), 2, 'on')).toBe('nocan');
  });
});

describe('R2: the plan', () => {
  it('after the 100th kilometre the Rhino, the Snail, then the Old Elephant', () => {
    for (let k = 0; k < 200; k++) {
      const seed = 5000 + k * 7919;
      const later = vehiclePlan(seed, 220).filter((p) => p.s >= 100_000);
      expect(later.slice(0, 3).map((p) => p.frame), `seed ${seed}`).toEqual(['rhino', 'snail', 'elephant']);
      expect(later[2].s).toBeGreaterThan(100_000);
    }
  });
});
