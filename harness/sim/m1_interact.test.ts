/**
 * Milestone M1's interactions (docs/V3/nodes/M1-interact.md) that are plain data and maths: what shelters one
 * from the weather by the road (Sites.coverAt: inside a building's walls, under a canopy), and the two lists side
 * by side beside a vehicle (HandsList: the hotbar's things, which slot each row is).
 */
import { describe, expect, it } from 'vitest';
import { World } from '../../src/core/world/terrain';
import type { Site, SiteObject } from '../../src/core/world/sites';

/** a point of an object's own frame (u along its long side, v across, up from its floor) in the world */
function at(o: SiteObject, u: number, v: number): [number, number] {
  const c = Math.cos(o.yaw);
  const s = Math.sin(o.yaw);
  return [o.x + u * c - v * s, o.z + u * s + v * c];
}

describe('shelter by the road', () => {
  const world = new World(20261113, {});
  const sites: Site[] = world.sites.between(0, 30000, []);
  const buildings = sites.flatMap((s) => s.objects.filter((o) => o.kind === 'building'));
  const canopies = sites.flatMap((s) => s.objects.filter((o) => o.kind === 'canopy'));

  it('is the building one stands inside, between its walls and under its eaves', () => {
    expect(buildings.length).toBeGreaterThan(5);
    for (const o of buildings.slice(0, 12)) {
      for (const [fu, fv] of [[0, 0], [0.4, 0.4], [-0.4, -0.3], [0.45, -0.45]]) {
        const [x, z] = at(o, fu * o.w, fv * o.d);
        expect(world.sites.coverAt(x, o.y + 1.5, z)).toBe(o);
      }
    }
  });

  it('is nothing a step outside its walls, on its roof, or under the ground', () => {
    for (const o of buildings.slice(0, 12)) {
      const [x, z] = at(o, 0, -(o.d / 2 + 1));
      const out = world.sites.coverAt(x, o.y + 1.5, z);
      // (a canopy might stand in front of a door: then that is what covers one, never the building)
      expect(out === null || out.kind === 'canopy').toBe(true);
      const [cx, cz] = at(o, 0, 0);
      expect(world.sites.coverAt(cx, o.y + o.h + 2, cz)).not.toBe(o);
      expect(world.sites.coverAt(cx, o.y - 3, cz)).not.toBe(o);
    }
  });

  it('is the canopy one stands under at a filling station', () => {
    for (const o of canopies.slice(0, 6)) {
      const [x, z] = at(o, 0, 0);
      const c = world.sites.coverAt(x, o.y + 1.5, z);
      expect(c === o || c?.kind === 'building').toBe(true);
    }
  });
});
