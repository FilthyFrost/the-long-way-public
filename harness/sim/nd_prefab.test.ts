// ND prefab buildings in the world (docs/ND/PLAN.md, core/world/prefabs.ts): a world asked for them lays each card
// at the first stretch it fits in, as that stretch's place, on levelled ground, its floor on its plinth, its solids
// and its things where its card puts them; a world not asked for them is the world it always was.
import { describe, expect, it } from 'vitest';
import '../../src/core/v3/nd/cards';
import { ND_BUILDINGS } from '../../src/core/v3/nd/cards';
import { prefabCard, prefabsAsked } from '../../src/core/world/prefabs';
import type { Site } from '../../src/core/world/sites';
import { TerrainPoint } from '../../src/core/world/terrain';
import { modcarWorld } from '../../src/game/modcar/seamless';

function placesOf(world: ReturnType<typeof modcarWorld>['world'], k1: number): Site[] {
  const out: Site[] = [];
  for (let k = 0; k <= k1; k++) for (const s of world.sites.sitesOf(k)) out.push(s);
  return out;
}

describe('ND prefab buildings', () => {
  it('the cabin is registered, and the address asks for it by name or all', () => {
    expect(prefabCard('cabin')).not.toBeNull();
    expect(prefabsAsked('cabin')).toEqual(['cabin']);
    expect(prefabsAsked('all')).toContain('cabin');
    expect(prefabsAsked('nothing,cabin')).toEqual(['cabin']);
    expect(prefabsAsked(null)).toBeNull();
  });

  it('a world asked for the cabin lays it by the road, level, with its solids and its things', () => {
    for (const seed of [7, 31]) {
      const world = modcarWorld(seed, { worldVersion: 5, prefabs: ['cabin'] }).world;
      const sites = placesOf(world, 12);
      const cabin = sites.find((s) => s.prefab === 'cabin');
      expect(cabin, `seed ${seed}`).toBeTruthy();
      const o = cabin!.objects.find((x) => x.kind === 'prefab')!;
      expect(o).toBeTruthy();
      const card = ND_BUILDINGS.cabin;
      // its solids are the card's, each one where the card says, its floor level on its plinth over the land
      expect(cabin!.solids.length).toBe(card.geo.solids.length);
      const tp = new TerrainPoint();
      world.shape(o.x, o.z, tp);
      expect(o.y - tp.h).toBeGreaterThan(card.geo.plinth - 0.05);
      expect(o.y - tp.h).toBeLessThan(card.geo.plinth + 0.35);
      const floor = cabin!.solids.find((s) => s.floor && Math.abs(s.y1 - o.y) < 1e-6);
      expect(floor).toBeTruthy();
      // its front faces the road: the road's centre line is on its front (−v) side
      const c = Math.cos(o.yaw);
      const s = Math.sin(o.yaw);
      const v = -(cabin!.x - o.x) * s + (cabin!.z - o.z) * c;
      expect(v).toBeLessThan(-card.geo.d / 2);
      // the things in it are ModCar's own kinds, at their spots
      expect(cabin!.loose.length).toBeGreaterThan(6);
      for (const t of cabin!.loose) expect(t.item.includes('.')).toBe(false);
      // and it is the stretch's one place
      expect(world.sites.placeOf(cabin!.slot)).toBe(cabin);
    }
  });

  it('a world not asked for them has no prefab and the same places as before', () => {
    const a = placesOf(modcarWorld(7, { worldVersion: 5 }).world, 10).map((s) => `${s.id}:${s.kind}:${s.x.toFixed(2)}`);
    const b = placesOf(modcarWorld(7, { worldVersion: 5, prefabs: [] }).world, 10).map((s) => `${s.id}:${s.kind}:${s.x.toFixed(2)}`);
    expect(b).toEqual(a);
    expect(placesOf(modcarWorld(7, { worldVersion: 5 }).world, 10).some((s) => s.prefab)).toBe(false);
  });
});
