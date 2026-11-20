// The vehicles' far models (docs/V3/nodes/P3-carfar.md): a merged car's meshes reduced to their share of
// triangles, the cab's inside left out far off, and everything as it was when it comes near again.
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { MergedCar } from '../../src/game/render/carMerge';
import { FAR_SHARE, reduceIndex, simplifierReady } from '../../src/game/render/farSimplify';
import { LAYER_SHADOW_FAR, LAYER_SHADOW_NEAR } from '../../src/game/render/shadow';

const tris = (g: THREE.BufferGeometry): number => (g.index ? g.index.count : g.getAttribute('position').count) / 3;

function indexed(g: THREE.BufferGeometry): THREE.BufferGeometry {
  if (g.index) return g;
  const n = g.getAttribute('position').count;
  const ix = new Uint32Array(n);
  for (let i = 0; i < n; i++) ix[i] = i;
  g.setIndex(new THREE.BufferAttribute(ix, 1));
  return g;
}

describe('far models', () => {
  it('throws a merged car shadow through one hull, drawn in the shadow maps only', () => {
    const frame = new THREE.Group();
    const body = new THREE.Group();
    frame.add(body);
    const skin = new THREE.Mesh(indexed(new THREE.SphereGeometry(1.5, 32, 24)), new THREE.MeshBasicMaterial({ name: 'paint' }));
    const steel = new THREE.Mesh(indexed(new THREE.BoxGeometry(2, 0.2, 4, 4, 1, 8)), new THREE.MeshBasicMaterial({ name: 'steel' }));
    const glass = new THREE.Mesh(indexed(new THREE.PlaneGeometry(1, 0.6)), new THREE.MeshBasicMaterial({ name: 'glass' }));
    body.add(skin, steel, glass);
    const car = new MergedCar(frame, [{ id: 1, object: body, look: { paint: 0x884422 } }], () => false);
    // (the glass, as applyMaterials leaves it: out of the shadow maps)
    const merged = car.group.children as THREE.Mesh[];
    const g = merged.find((m) => m.name === 'merged:glass')!;
    g.layers.disable(LAYER_SHADOW_FAR);
    g.layers.disable(LAYER_SHADOW_NEAR);
    const calls = car.calls;
    car.castThroughHull(false);
    const hull = car.group.children.find((c) => c.name === 'merged:shadow-hull') as THREE.Mesh;
    expect(hull).toBeDefined();
    expect(car.calls).toBe(calls);
    expect(tris(hull.geometry)).toBe(tris(skin.geometry) + tris(steel.geometry));
    expect(hull.layers.isEnabled(0)).toBe(false);
    expect(hull.layers.isEnabled(LAYER_SHADOW_FAR) && hull.layers.isEnabled(LAYER_SHADOW_NEAR)).toBe(true);
    for (const m of merged) if (m !== hull) expect(m.layers.isEnabled(LAYER_SHADOW_FAR) || m.layers.isEnabled(LAYER_SHADOW_NEAR)).toBe(false);
    // a parked car's: the wide map only
    car.castThroughHull(true);
    expect(hull.layers.isEnabled(LAYER_SHADOW_NEAR)).toBe(false);
    car.dispose();
    expect(hull.parent).toBeNull();
  });

  it('reduces a smooth closed mesh to about its share', async () => {
    await simplifierReady();
    const g = new THREE.SphereGeometry(1, 128, 96);
    const pos = g.getAttribute('position').array as Float32Array;
    const ix = new Uint32Array(g.index!.array as ArrayLike<number>);
    const out = reduceIndex(pos, ix, 0.1);
    expect(out.length % 3).toBe(0);
    expect(out.length / 3).toBeLessThanOrEqual((ix.length / 3) * 0.1 * 1.6);
    expect(out.length / 3).toBeGreaterThan(50);
    for (let i = 0; i < out.length; i++) expect(out[i]).toBeLessThan(pos.length / 3);
  });

  it('reduces a shell of many small loose pieces too (clustered when edge collapse cannot reach)', async () => {
    await simplifierReady();
    const parts: THREE.BufferGeometry[] = [];
    for (let i = 0; i < 300; i++) {
      const b = new THREE.BoxGeometry(0.05, 0.05, 0.05, 2, 2, 2).toNonIndexed();
      b.translate((i % 20) * 0.2, Math.floor(i / 20) * 0.2, 0);
      parts.push(b);
    }
    const merged = new THREE.BufferGeometry();
    const all = new Float32Array(parts.reduce((s, p) => s + p.getAttribute('position').count * 3, 0));
    let at = 0;
    for (const p of parts) {
      all.set(p.getAttribute('position').array as Float32Array, at);
      at += p.getAttribute('position').count * 3;
    }
    merged.setAttribute('position', new THREE.BufferAttribute(all, 3));
    indexed(merged);
    const out = reduceIndex(all, merged.index!.array as Uint32Array, 0.1);
    expect(out.length / 3).toBeLessThan(tris(merged) * 0.5);
  });

  it('swaps a merged car to its middle and far models and back, the cab left out far off only', async () => {
    const frame = new THREE.Group();
    const body = new THREE.Group();
    frame.add(body);
    const skin = new THREE.Mesh(indexed(new THREE.SphereGeometry(1.5, 96, 64)), new THREE.MeshBasicMaterial({ name: 'paint' }));
    const seat = new THREE.Mesh(indexed(new THREE.BoxGeometry(0.5, 0.5, 0.5, 6, 6, 6)), new THREE.MeshBasicMaterial({ name: 'leather' }));
    body.add(skin, seat);
    const car = new MergedCar(frame, [{ id: 1, object: body, look: { paint: 0x884422 } }], () => false);
    const full = car.triangles;
    expect(full).toBeGreaterThan(12000);
    car.prepareFar();
    // (no worker under test: the reductions are done between ticks)
    car.setLevel(1);
    for (let i = 0; i < 60 && car.triangles === full; i++) await new Promise((r) => setTimeout(r, 20));
    const middle = car.triangles;
    expect(middle).toBeLessThan(full * 0.6);
    const seatMid = car.group.children.find((c) => c.name === 'merged:leather') as THREE.Mesh;
    expect(seatMid.visible).toBe(true);
    car.setLevel(2);
    for (let i = 0; i < 60 && car.triangles >= middle * 0.6; i++) await new Promise((r) => setTimeout(r, 20));
    expect(car.detail).toBe(2);
    const paint = car.group.children.find((c) => c.name === 'merged:paint') as THREE.Mesh;
    const leather = car.group.children.find((c) => c.name === 'merged:leather') as THREE.Mesh;
    expect(leather.visible).toBe(false);
    expect(tris(paint.geometry)).toBeLessThanOrEqual(Math.ceil(tris(skin.geometry) * FAR_SHARE.paint * 1.6));
    // the twin shares the near mesh's attributes: a part's new paint is written to both
    car.updatePart(1, { paint: 0x2244aa });
    const a = paint.geometry.getAttribute('aPaint') as THREE.BufferAttribute;
    expect(a.getZ(0)).toBeGreaterThan(a.getX(0));
    car.setLevel(0);
    expect(leather.visible).toBe(true);
    expect(car.triangles).toBe(full);
    car.dispose();
    expect(skin.visible).toBe(true);
  });
});
