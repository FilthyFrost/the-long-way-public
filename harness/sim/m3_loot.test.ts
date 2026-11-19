/**
 * Milestone M3, what the places hold where one sees it (docs/V3/nodes/M3-loot.md): the layout of a container's
 * things over its places for them (core/modcar/containerLayout.ts), the furniture of a building laid out the other way
 * round facing into its room in a world of version 2 (core/world/sites.ts), and a container at a place as the game
 * has it (places.ts): its things lying in it from the start, shut in until it is opened with E, one picked up gone
 * from it for good, and opened or shut as one left it.
 */
import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { layOut, type LayoutThing } from '../../src/core/modcar/containerLayout';
import { World } from '../../src/core/world/terrain';
import type { Site } from '../../src/core/world/sites';
import { LooseThings } from '../../src/game/modcar/loose';
import { CarMaterials } from '../../src/game/modcar/materials';
import { Places, type PlacesHost } from '../../src/game/modcar/places';
import type { ContainerSlot } from '../../src/game/modcar/siteArt';

// (no model is fetched: every thing lying about stays the stand-in it starts as)
vi.mock('../../src/game/modcar/assets', async (original) => ({ ...(await original<typeof import('../../src/game/modcar/assets')>()), itemGlb: async () => null }));
// (what the test's crate holds: three plain things)
vi.mock('../../src/core/modcar/loot', async (original) => {
  const real = await original<typeof import('../../src/core/modcar/loot')>();
  return { ...real, rollContainer: () => [{ item: 'drink_soda' }, { item: 'food_chips' }, { item: 'junk_mug' }] };
});

const stand = (w: number, d: number, h: number): LayoutThing => ({ ways: [{ w, d, h }, { w: d, d: w, h }, { w, d: h, h: d }] });

describe('a container’s things over its places', () => {
  it('go into the first place they fit, side by side along it, the row in its middle', () => {
    const at = layOut([stand(0.2, 0.2, 0.2), stand(0.2, 0.2, 0.2)], [{ width: 1, depth: 0.4, clear: 0.3 }]);
    expect(at.map((a) => a.room)).toEqual([0, 0]);
    expect(at[0].along + at[1].along).toBeCloseTo(0, 6);
    expect(Math.abs(at[0].along - at[1].along)).toBeCloseTo(0.23, 6);
  });

  it('are turned a quarter, or laid on their side, to fit; and stand before it when they fit nowhere', () => {
    // deeper than the place standing, not turned: turned it fits
    expect(layOut([stand(0.2, 0.6, 0.1)], [{ width: 1, depth: 0.3, clear: 0.3 }])[0]).toMatchObject({ room: 0, way: 1 });
    // taller than the place: on its side it fits
    expect(layOut([stand(0.1, 0.1, 0.4)], [{ width: 1, depth: 0.5, clear: 0.2 }])[0]).toMatchObject({ room: 0, way: 2 });
    // too big every way: on the floor before it
    expect(layOut([stand(2, 2, 2)], [{ width: 1, depth: 0.5, clear: 0.2 }])[0].room).toBe(-1);
    // the first place wanted first, the next when the first is full
    const two = layOut([stand(0.5, 0.2, 0.2), stand(0.5, 0.2, 0.2)], [{ width: 0.6, depth: 0.4, clear: 0.3 }, { width: 2, depth: 0.4, clear: 0.3 }]);
    expect(two.map((a) => a.room).sort()).toEqual([0, 1]);
  });

  it('lie the same way every time', () => {
    const things = [stand(0.3, 0.2, 0.1), stand(0.1, 0.1, 0.3), stand(0.25, 0.25, 0.25)];
    const rooms = [{ width: 0.8, depth: 0.3, clear: 0.2 }, { width: 1.5, depth: 0.5, clear: 0.5 }];
    expect(layOut(things, rooms)).toEqual(layOut(things, rooms));
  });
});

describe('furniture turned along a building', () => {
  /** an object's front on the plan (its own −z: sites.ts) */
  const front = (yaw: number): [number, number] => [Math.sin(yaw), -Math.cos(yaw)];

  it('faces into the room in a world of version 2, whichever way round the place is laid out', () => {
    const world = new World(20261113, { worldVersion: 2 });
    const sites: Site[] = world.sites.between(0, 120000, []);
    let seen = 0;
    for (const site of sites) {
      for (const c of site.containers) {
        if (c.obj < 0) continue;
        const o = site.objects[c.obj];
        if (!((o.kind === 'wardrobe' && site.kind === 'house') || (o.kind === 'counter' && site.kind === 'shop') || (o.kind === 'shelf' && c.kind === 'garage'))) continue;
        // the building round it: its front points to the building's middle along the building's length
        const b = site.objects.find((x) => x.kind === 'building' && Math.hypot(x.x - o.x, x.z - o.z) < Math.max(x.w, x.d));
        if (!b) continue;
        // (a counter's front is its customers' side: its keeper's side to the wall)
        const [fx, fz] = front(o.yaw);
        expect(fx * (b.x - o.x) + fz * (b.z - o.z), `${site.kind} ${site.id} ${o.kind}`).toBeGreaterThan(0);
        seen++;
      }
    }
    expect(seen).toBeGreaterThan(4);
  });
});

describe('a container at a place', () => {
  /** a place with a crate (a lid) whose one place for things is shut in it, the drawing as the game's would be */
  function aPlace() {
    const core = { scene: new THREE.Scene(), origin: { x: 0, y: 0, z: 0 }, place: () => {} };
    const L = new LooseThings(core as never, new CarMaterials(), () => 0);
    const crate = { kind: 'crate', x: 0, y: 0, z: 0, yaw: 0, w: 0.9, d: 0.7, h: 0.7, v: 0, pitch: 0, roll: 0, b: null };
    const site = { id: 'site9', kind: 'house', x: 0, z: 0, s: 0, reach: 5, seed: 3, objects: [crate], containers: [{ id: 'site9/c0', kind: 'crate', x: 0, y: 0, z: 0, yaw: 0, hx: 0.45, h: 0.7, hz: 0.35, shelf: 0.09, solid: true, obj: 0, seed: 11 }], fuel: [], loose: [] };
    const marker = new THREE.Object3D();
    marker.position.set(0, 0.09, 0);
    core.scene.add(marker);
    marker.updateMatrixWorld(true);
    // (room for the three things as their models are not in: each a box of 30 cm)
    const slot: ContainerSlot = { frame: marker, moves: false, shut: true, back: false, width: 1.2, depth: 0.6, clear: 0.5 };
    const opened: [string, boolean][] = [];
    const host = {
      world: { spine: { sAtX: (x: number) => x }, sites: { between: (_a: number, _b: number, out: unknown[]) => void out.push(site) } },
      origin: core.origin,
      loose: L,
      vehicles: [],
      play: () => {},
      loop: () => {},
      say: () => {},
      openContainer: () => {},
      fuelled: () => {},
      setOpen: (id: string, open: boolean) => void opened.push([id, open]),
      movesOf: () => true,
      slots: () => [slot],
    };
    const places = new Places(host as unknown as PlacesHost);
    return { L, places, opened };
  }
  const settle = async (places: Places): Promise<void> => {
    places.update(1, 0, 0);
    // (the things' sizes come back on the next turn: then they are laid out)
    await new Promise((r) => setTimeout(r, 0));
    places.update(1, 0, 0);
  };

  it('has its things in it from the start, shut in, reached once it is opened with E', async () => {
    const { L, places, opened } = aPlace();
    await settle(places);
    const pc = places.containerOf('site9/c0')!;
    expect(pc.things.length).toBe(3);
    expect(pc.things.every((l) => l.shut && L.list.includes(l))).toBe(true);
    // (inside the crate, on its bottom)
    for (const l of pc.things) expect(l.y).toBeGreaterThanOrEqual(0.09 - 1e-6);
    expect(L.pick({ x: 0, y: 1.5, z: 1 }, { x: 0, y: -0.9, z: -1 }, 5)).toBeNull();
    places.toggle(pc);
    expect(opened).toEqual([['site9/c0', true]]);
    expect(pc.things.every((l) => !l.shut)).toBe(true);
    expect(places.isOpen('site9/c0')).toBe(true);
    // the things lying in it are the place's own: not saved with the things lying about
    expect(pc.things.every((l) => places.owns(l))).toBe(true);
  });

  it('keeps what is left in it once a thing is taken out, and stays as one left it, open or shut', async () => {
    const { L, places } = aPlace();
    await settle(places);
    const pc = places.containerOf('site9/c0')!;
    places.toggle(pc);
    const taken = pc.things[0];
    L.remove(taken);
    places.update(1 / 60, 0, 0);
    expect(pc.things.length).toBe(2);
    expect(pc.contents!.length).toBe(2);
    const s = places.snapshot();
    expect(s.left['site9/c0'].length).toBe(2);
    expect(s.open).toEqual(['site9/c0']);
    expect(s.searched).toEqual(['site9/c0']);
    // shut again, it says so too
    places.toggle(pc);
    expect(pc.things.every((l) => l.shut)).toBe(true);
    expect(places.snapshot().open).toEqual([]);
  });
});
