/**
 * R3 (docs/V3/plan/rv.md): the Camel, a school bus made a motorhome.
 *   - the frame: 10.6 m by 2.4 (9.5 until docs/V3/plan/finish.md §18), its hood in front with the diesel six under it, the driver's seat behind the cowl, the
 *     entry door, the emergency door in the tail, a roof for a long rack with a ladder up its side, a house battery
 *   - found emptied: no seat behind the entry door, no beds built in — its floor is one place for things nearly the
 *     whole length and width of it
 *   - its living space: the aisle, the floor round the rear wheels' humps, the cab's right by the entry door, inside its
 *     body; the door's inside and the spot behind the driver's seat on it
 *   - it turns: its wheelbase and its lock make a circle far inside the tightest bend of the roads
 *   - the cot: a bed one finds where the houses have their sofas, carried in the arms, put in it
 *   - the plan: after the 100th kilometre the Rhino, the Snail, the Old Elephant, then the Camel, past the 130th
 */
import { describe, expect, it } from 'vitest';
import { aboardOf } from '../../src/core/modcar/aboard';
import { stockBuild } from '../../src/core/modcar/build';
import { zonesFor } from '../../src/core/modcar/cargo';
import { frameDef, frameSize } from '../../src/core/modcar/frames';
import { itemDef, hasItem } from '../../src/core/modcar/items';
import { partDef } from '../../src/core/modcar/parts';
import { vehiclePlan } from '../../src/core/modcar/schedule';
import { MIN_RADIUS_ANY } from '../../src/core/world/biomes';
import { ND_COT } from '../../src/core/v3/nd/items';
import { ND_BUILDINGS } from '../../src/core/v3/nd/cards';
// (Nomad Drive's kinds in the catalogue)
import '../../src/game/modcar/v3/nd-home';

describe('R3: the Camel', () => {
  it('the frame: a school bus 10.6 m by 2.4, its hood with the diesel six under it in front of the cab, two doors, a roof for a rack and a ladder, a house battery', () => {
    const f = frameDef('camel');
    expect(f.kind).toBe('rv');
    const size = frameSize('camel');
    expect(size.length).toBeGreaterThan(10.3);
    expect(size.length).toBeLessThan(10.9);
    expect(size.width).toBeGreaterThan(2.3);
    expect(size.width).toBeLessThan(2.5);
    const at = (id: string) => f.mounts.find((m) => m.id === id)!;
    // (a conventional bus: the engine ahead of the driver, over the front axle)
    expect(at('engine').pos.x).toBeGreaterThan(at('seat_driver').pos.x + 0.8);
    expect(Math.abs(at('engine').pos.x - at('hub_FL').pos.x)).toBeLessThan(0.3);
    for (const cat of ['roof', 'ladder', 'houseBattery', 'trunk', 'hood', 'radiator']) expect(f.mounts.some((m) => m.cat === cat), cat).toBe(true);
    expect(f.mounts.filter((m) => m.cat === 'door').map((m) => m.id)).toEqual(['door_side']);
    const b = stockBuild('camel');
    expect(b.parts.engine.part).toBe('eng_d6');
    expect(partDef(b.parts.engine.part).engine!.fuel).toBe('diesel');
    expect(partDef(b.parts.hub_RL.part).rim?.dual).toBe(true);
    expect(b.parts.houseBattery.part).toBe('bat_house');
    for (const m of ['seat_driver', 'door_side', 'trunk', 'hood', 'radiator', 'battery']) expect(b.parts[m], m).toBeTruthy();
  });

  it('found emptied: no seat behind the entry door, no beds built in; its floor one place for things nearly its whole length and width', () => {
    const f = frameDef('camel');
    expect(f.bare).toContain('seat_pass');
    expect(stockBuild('camel').parts.seat_pass).toBeUndefined();
    expect(aboardOf('camel')!.beds ?? []).toHaveLength(0);
    const zones = zonesFor('camel', stockBuild('camel'));
    const cabin = zones.find((z) => z.id === 'cabin')!;
    expect(cabin.x[1] - cabin.x[0]).toBeGreaterThan(6.5);
    expect(cabin.z[1] - cabin.z[0]).toBeGreaterThan(2.2);
    expect(cabin.max).toBe('large');
    for (const z of zones) {
      expect(z.x[0], z.id).toBeGreaterThanOrEqual(f.body.rear);
      expect(z.x[1], z.id).toBeLessThanOrEqual(f.body.front);
      expect(Math.max(Math.abs(z.z[0]), Math.abs(z.z[1])), z.id).toBeLessThanOrEqual(f.body.halfWidth);
      // (under the ceiling, 2.98 over the floor's 0.72)
      expect(z.top, z.id).toBeLessThan(2.9);
    }
  });

  it('its living space: inside its body, the door’s inside and the spot behind the seat on it', () => {
    const f = frameDef('camel');
    const a = aboardOf('camel')!;
    const inArea = (x: number, z: number) => a.areas.some((r) => x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1);
    for (const r of a.areas) {
      expect(r.x0).toBeGreaterThanOrEqual(f.body.rear);
      expect(r.x1).toBeLessThanOrEqual(f.body.front);
      expect(Math.max(Math.abs(r.z0), Math.abs(r.z1))).toBeLessThan(f.body.halfWidth);
    }
    expect(inArea(...a.doors[0].inside)).toBe(true);
    expect(inArea(...a.aft!)).toBe(true);
    // Flat wall-to-wall 0.84 m floor (#10): rear wheel humps eliminated so full width is walkable & placeable
    const wellX = f.mounts.find((m) => m.id === 'hub_RL')!.pos.x;
    expect(inArea(wellX, 1.0)).toBe(true);
    expect(inArea(wellX, -1.0)).toBe(true);
    expect(inArea(wellX, 0.0)).toBe(true);
  });

  it('it turns: its wheelbase and its lock make a circle far inside the tightest bend of the roads (it need not be shorter)', () => {
    const f = frameDef('camel');
    const front = f.mounts.find((m) => m.id === 'hub_FL')!.pos.x;
    const rear = f.mounts.find((m) => m.id === 'hub_RL')!.pos.x;
    const wb = front - rear;
    expect(wb).toBeGreaterThan(6);
    const radius = wb / Math.sin((f.steering.maxDeg * Math.PI) / 180);
    expect(radius).toBeLessThan(10);
    expect(radius * 4).toBeLessThan(MIN_RADIUS_ANY);
  });

  it('the cot: a bed of its own kind, carried in the arms, found where the houses, the cabins and the motel’s lobby have a sofa', () => {
    expect(hasItem(ND_COT)).toBe(true);
    const d = itemDef(ND_COT);
    expect(d.cat).toBe('furniture');
    expect(d.carry).toBe('large');
    const spots = Object.values(ND_BUILDINGS).flatMap((b) => (b.furnish ?? []).filter((f) => f.items.includes(ND_COT)).map((f) => f.spot));
    expect(spots.length).toBeGreaterThanOrEqual(3);
  });
});

describe('R3: the plan', () => {
  it('after the 100th kilometre the Rhino, the Snail, the Old Elephant, then the Camel — past the 130th', () => {
    for (let k = 0; k < 200; k++) {
      const seed = 9000 + k * 7919;
      const later = vehiclePlan(seed, 260).filter((p) => p.s >= 100_000);
      expect(later.slice(0, 4).map((p) => p.frame), `seed ${seed}`).toEqual(['rhino', 'snail', 'elephant', 'camel']);
      expect(later[3].s, `seed ${seed}`).toBeGreaterThan(130_000);
    }
  });
});
