// Nothing sinks or interpenetrates (docs/V3/plan/finish.md §十九 step 6, src/game/modcar/loose.ts): a thing let fall comes
// to rest with its own box's lowest point on the surface under it, 1 mm over it as Nomad Drive drops a thing — the
// highest of the ground under its plan, so that no corner sinks on a slope — or on the top of a thing lying about under
// its middle (things stack), and comes down again when that is taken away; let go where it would lie in something's way
// (its box shrunk to 85 % meeting another thing, a wall) it is refused, and a thing let fall there by the game is moved
// aside to the nearest clear place within a metre; a thing thrown flies, comes down, slides and stops (slower than
// 0.12 m/s for 0.35 s), or is put on the ground after 8 s in the air.
import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { newItem, registerItemCat, registerItems } from '../../src/core/modcar/items';
import { Solid } from '../../src/core/world/solids';
import { DROP_SHRINK, LooseThings, REST_GAP, THROW, type Loose } from '../../src/game/modcar/loose';
import { CarMaterials } from '../../src/game/modcar/materials';
import { Places, type PlacesHost } from '../../src/game/modcar/places';

// (the things' models stay their stand-ins here: a box by how a thing is carried — small 0.14 × 0.12 × 0.1 m, large 0.5 × 0.6 × 0.5)
vi.mock('../../src/game/modcar/assets', async (original) => ({ ...(await original<typeof import('../../src/game/modcar/assets')>()), itemGlb: async () => null }));

registerItemCat({ id: 'tr', name: { zh: '试验', en: 'Test' } });
registerItems([
  { id: 'tr_small', cat: 'tr', name: { zh: '小东西', en: 'Small thing' }, stars: 1, mass: 0.2, carry: 'small' },
  { id: 'tr_crate', cat: 'tr', name: { zh: '大箱子', en: 'Crate' }, stars: 1, mass: 8, carry: 'large' },
]);

/** a world of things over a ground of the given height (and walls, if any) */
function aWorld(ground: (x: number, z: number) => number = () => 0, walls: Solid[] = []): LooseThings {
  const core = { scene: new THREE.Scene(), origin: { x: 0, y: 0, z: 0 }, place: () => {} };
  const L = new LooseThings(core as never, new CarMaterials(), (x, z) => ground(x, z));
  L.solidsNear = (_x, _z, _r, out) => void out.push(...walls);
  return L;
}
const run = (L: LooseThings, s: number): void => {
  for (let t = 0; t < s; t += 1 / 60) L.update(1 / 60);
};
const low = (L: LooseThings, l: Loose): number => l.y + L.snugBoxOf(l)!.minY;
const top = (L: LooseThings, l: Loose): number => l.y + L.snugBoxOf(l)!.maxY;
const SMALL = { minX: -0.07, maxX: 0.07, minY: 0, maxY: 0.12, minZ: -0.05, maxZ: 0.05 };

describe('a thing let fall', () => {
  it('comes to rest with its lowest point 1 mm over the ground', () => {
    const L = aWorld(() => 0.42);
    const l = L.addItem(newItem('tr_small'), 3, 2, -1, 0.3);
    L.drop(l);
    run(L, 1);
    expect(l.resting).toBe(true);
    expect(low(L, l)).toBeCloseTo(0.42 + REST_GAP, 5);
  });

  it('on a slope: on the highest of the ground under it, none of it in the ground', () => {
    // (a 20 % slope along x: the crate's uphill edge is 5 cm over its middle's ground)
    const g = (x: number): number => 0.2 * x;
    const L = aWorld(g);
    const l = L.addItem(newItem('tr_crate'), 0, 3, 0, 0);
    L.drop(l);
    run(L, 1.5);
    const b = L.baseBoxOf(l)!;
    for (const x of [b.minX, (b.minX + b.maxX) / 2, b.maxX]) expect(low(L, l)).toBeGreaterThanOrEqual(g(l.x + x) - 1e-6);
    expect(low(L, l)).toBeCloseTo(g(l.x + b.maxX) + REST_GAP, 4);
  });

  it('a table with an overhanging top on a slope stands on its uphill legs, not lifted by the overhang', () => {
    const g = (x: number): number => 0.1 * x;
    const L = aWorld(g);
    const l = L.addItem(newItem('tr_crate'), 0, 3, 0, 0);
    // replace stand-in with a table: narrow legs at ±0.4 m, overhanging tabletop at ±0.6 m, y = 0.72..0.76 m
    l.obj.clear();
    const mat = new THREE.MeshBasicMaterial();
    const topMesh = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.04, 0.8), mat);
    topMesh.position.y = 0.74;
    l.obj.add(topMesh);
    for (const sx of [-0.38, 0.38]) {
      for (const sz of [-0.28, 0.28]) {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.72, 0.04), mat);
        leg.position.set(sx, 0.36, sz);
        l.obj.add(leg);
      }
    }
    L.drop(l);
    run(L, 1.5);
    // uphill leg outer edge is at x = +0.40 (g = 0.04), NOT tabletop edge x = +0.60 (g = 0.06)
    expect(low(L, l)).toBeCloseTo(g(0.4) + REST_GAP, 4);
    expect(low(L, l)).toBeLessThan(g(0.6) - 0.01);
  });

  it('places seat loose site items safely even when a test mock world omits heightAt', () => {
    const core = { scene: new THREE.Scene(), origin: { x: 0, y: 0, z: 0 }, place: () => {} };
    const L = new LooseThings(core as never, new CarMaterials(), () => 0);
    const site = {
      id: 'site_no_height',
      kind: 'house',
      x: 0,
      z: 0,
      reach: 5,
      s: 0,
      seed: 1,
      containers: [],
      fuel: [],
      objects: [],
      loose: [{ id: 'site_no_height/l0', item: 'junk.thing', n: 1, x: 1, y: 0.5, z: 0, yaw: 0 }],
    };
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
    };
    const places = new Places(host as unknown as PlacesHost);
    expect(() => places.update(1, 0, 0)).not.toThrow();
    expect(L.list.length).toBe(1);
    expect(L.list[0].resting).toBe(true);
  });

  it('onto a thing lying under its middle: on its top; that taken away, it comes down onto the ground', () => {
    const L = aWorld();
    const crate = L.addItem(newItem('tr_crate'), 0, 0.5, 0, 0);
    L.drop(crate);
    run(L, 1);
    const small = L.addItem(newItem('tr_small'), 0.05, 2, 0.02, 0.4);
    L.drop(small);
    run(L, 1);
    expect(small.resting).toBe(true);
    expect(small.under).toBe(crate);
    expect(low(L, small)).toBeCloseTo(top(L, crate) + REST_GAP, 4);
    L.remove(crate);
    run(L, 1);
    expect(small.resting).toBe(true);
    expect(small.under).toBeNull();
    expect(low(L, small)).toBeCloseTo(REST_GAP, 4);
  });

  it('two things let fall at one spot: the second on the first, never in it', () => {
    const L = aWorld();
    const a = L.addItem(newItem('tr_small'), 1, 0.5, 1, 0);
    L.drop(a);
    run(L, 1);
    const b = L.addItem(newItem('tr_small'), 1, 0.5, 1, 0);
    L.drop(b);
    run(L, 1);
    expect(low(L, b)).toBeGreaterThanOrEqual(top(L, a));
  });

  it('half over a crate, in its way: moved aside to the nearest clear place, on the ground', () => {
    const L = aWorld();
    const crate = L.addItem(newItem('tr_crate'), 0, 0.5, 0, 0);
    L.drop(crate);
    run(L, 1);
    // (its middle just off the crate's side: it would come down on the ground half inside it)
    const b = L.snugBoxOf(crate)!;
    const small = L.addItem(newItem('tr_small'), b.maxX + 0.03, 1, 0, 0);
    L.drop(small);
    run(L, 1);
    expect(small.resting).toBe(true);
    expect(low(L, small)).toBeCloseTo(REST_GAP, 4);
    expect(L.blockerAt(L.snugBoxOf(small)!, small.x, small.y, small.z, small.yaw, small, null, null)).toBeNull();
    expect(Math.hypot(small.x - (b.maxX + 0.03), small.z)).toBeLessThanOrEqual(1.0001);
  });
});

describe('letting go (the hands: Nomad Drive refuses a drop in the way of something)', () => {
  it('is refused where its box, shrunk to 85 %, would meet another thing or a wall', () => {
    const wall = new Solid().set(5, 0, 0.1, 2, 0, -1, 3, false, 'wall');
    const L = aWorld(() => 0, [wall]);
    const crate = L.addItem(newItem('tr_crate'), 0, 0.5, 0, 0);
    L.drop(crate);
    run(L, 1);
    const b = L.snugBoxOf(crate)!;
    // beside the crate, 3 cm into its side: refused; 8 cm off it (its shrunk box clear): let go
    expect(L.dropPose(SMALL, b.maxX + 0.07 - 0.03, 1, 0, 0).ok).toBe(false);
    expect(L.dropPose(SMALL, b.maxX + 0.07 + 0.08, 1, 0, 0).ok).toBe(true);
    // over the crate's middle: onto its top
    const on = L.dropPose(SMALL, 0, 1.5, 0, 0);
    expect(on.ok).toBe(true);
    expect(on.support.under).toBe(crate);
    // into the wall: refused; a little short of it: let go
    expect(L.dropPose(SMALL, 5 - 0.1, 1, 0, 0).ok).toBe(false);
    expect(L.dropPose(SMALL, 5 - 0.1 - 0.07 - 0.02, 1, 0, 0).ok).toBe(true);
    expect(DROP_SHRINK).toBe(0.85);
  });
});

describe('a thing thrown', () => {
  it('flies, comes down, slides and stops, on the ground', () => {
    const L = aWorld();
    const l = L.addItem(newItem('tr_small'), 0, 1.3, 0, 0);
    L.fling(l, { x: 6, y: 2.5, z: 0 });
    let t = 0;
    while (!l.resting && t < 10) {
      L.update(1 / 60);
      t += 1 / 60;
    }
    expect(l.resting).toBe(true);
    expect(t).toBeLessThan(THROW.maxS);
    expect(l.x).toBeGreaterThan(3);
    expect(low(L, l)).toBeCloseTo(REST_GAP, 4);
  });

  it('off a wall it comes back, not through it', () => {
    const wall = new Solid().set(2, 0, 0.1, 3, 0, -1, 3, false, 'wall');
    const L = aWorld(() => 0, [wall]);
    const l = L.addItem(newItem('tr_small'), 0, 1.0, 0, 0);
    L.fling(l, { x: 8, y: 1, z: 0 });
    for (let i = 0; i < 600 && !l.resting; i++) L.update(1 / 60);
    expect(l.resting).toBe(true);
    expect(l.x + L.snugBoxOf(l)!.maxX).toBeLessThan(2 - 0.1 + 0.01);
  });

  it('too long in the air: put on the ground under it, 2 cm over it', () => {
    const L = aWorld(() => 0);
    const l = L.addItem(newItem('tr_small'), 0, 1, 0, 0);
    L.update(1 / 60);
    L.fling(l, { x: 0, y: 0, z: 0 });
    // (held in the air: no gravity for this test — as if it hung on something)
    l.fly!.t = THROW.maxS + 0.01;
    l.y = 50;
    L.update(1 / 60);
    expect(l.resting).toBe(true);
    expect(low(L, l)).toBeCloseTo(THROW.gap, 3);
  });
});
