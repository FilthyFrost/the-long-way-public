// The land's leaves drawn a batch at a time (docs/V3/nodes/P3-terrain-batch.md, scene/terrainBatch.ts): leaves of one
// material share a batch's fixed slots, a slot hidden and handed to the next leaf when its leaf goes, the batch of a
// material of its own let go with its last leaf, and every leaf set where the world puts it when the origin moves.
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { TerrainBatch } from '../../src/game/scene/terrainBatch';

/** a leaf of 4 points and 2 triangles whose points say which leaf it is */
function leaf(tag: number): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array([0, tag, 0, 1, tag, 0, 0, tag, 1, 1, tag, 1]), 3));
  g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array([0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0]), 3));
  g.setIndex(new THREE.BufferAttribute(new Uint16Array([0, 2, 1, 1, 2, 3]), 1));
  g.computeBoundingSphere();
  return g;
}

const at = (b: TerrainBatch, s: { page: { mesh: THREE.BatchedMesh; inst: Int32Array }; i: number }): THREE.Vector3 => {
  const m = new THREE.Matrix4();
  s.page.mesh.getMatrixAt(s.page.inst[s.i], m);
  return new THREE.Vector3().setFromMatrixPosition(m);
};

describe('the land drawn a batch at a time', () => {
  it('fills a batch, opens the next, and hands a freed slot to the next leaf', () => {
    const core = { origin: { x: 0, y: 0, z: 0 } };
    const parent = new THREE.Group();
    const b = new TerrainBatch(core, parent, 'world:terrain', 4, 6, 3, 2);
    const shared = new THREE.MeshBasicMaterial();
    const slots = [0, 1, 2, 3, 4].map((k) => b.add(leaf(k), shared, k * 256, 10, -k * 256, true));
    expect(b.pages.length).toBe(2);
    expect(parent.children.length).toBe(2);
    expect(b.leaves).toBe(5);
    expect(parent.children.every((c) => c.name === 'world:terrain')).toBe(true);
    expect(at(b, slots[3]).toArray()).toEqual([768, 10, -768]);
    // a leaf goes: its slot hidden, not given back to the buffers; the next leaf takes it and writes its points there
    const gone = slots[1];
    b.remove(gone);
    expect(gone.page.mesh.getVisibleAt(gone.page.inst[gone.i])).toBe(false);
    expect(b.leaves).toBe(4);
    const next = b.add(leaf(9), shared, 5000, 0, 5000, true);
    expect(next.page).toBe(gone.page);
    expect(next.i).toBe(gone.i);
    expect(next.page.made).toBe(3);
    expect(next.page.mesh.getVisibleAt(next.page.inst[next.i])).toBe(true);
    const pos = next.page.mesh.geometry.getAttribute('position');
    expect(pos.getY(next.i * 4)).toBe(9);
    expect(at(b, next).toArray()).toEqual([5000, 0, 5000]);
    // (the shared material's batches stay when empty: they are wanted again as soon as one drives on)
    for (const s of [slots[0], slots[2], slots[3], slots[4], next]) b.remove(s);
    expect(b.leaves).toBe(0);
    expect(b.pages.length).toBe(2);
  });

  it('lets a batch of a material of its own go with its last leaf', () => {
    const core = { origin: { x: 0, y: 0, z: 0 } };
    const parent = new THREE.Group();
    const b = new TerrainBatch(core, parent, 'world:terrain', 4, 6, 3, 2);
    const shared = new THREE.MeshBasicMaterial();
    const own = new THREE.MeshBasicMaterial();
    b.add(leaf(0), shared, 0, 0, 0, true);
    const far = [1, 2, 3].map((k) => b.add(leaf(k), own, k * 4096, 0, 0, false));
    // (two leaves to a batch of its own: three leaves, two batches)
    expect(b.pages.filter((p) => p.material === own).length).toBe(2);
    expect(b.pages.filter((p) => p.material === own).every((p) => p.size === 2)).toBe(true);
    let disposed = 0;
    for (const p of b.pages) if (p.material === own) p.mesh.geometry.addEventListener('dispose', () => disposed++);
    for (const s of far) b.remove(s);
    expect(disposed).toBe(2);
    expect(b.pages.length).toBe(1);
    expect(parent.children.length).toBe(1);
    // (a slot let go twice is let go once)
    b.remove(far[0]);
    expect(b.leaves).toBe(1);
  });

  it('sets every leaf where the world puts it when the render origin moves', () => {
    const core = { origin: { x: 0, y: 0, z: 0 } };
    const parent = new THREE.Group();
    const b = new TerrainBatch(core, parent, 'world:terrain', 4, 6);
    const shared = new THREE.MeshBasicMaterial();
    const s = b.add(leaf(0), shared, 12800, 40, 25600, true);
    expect(at(b, s).toArray()).toEqual([12800, 40, 25600]);
    core.origin.x = 12544;
    core.origin.z = 25856;
    b.rebase();
    expect(at(b, s).toArray()).toEqual([256, 40, -256]);
  });
});
