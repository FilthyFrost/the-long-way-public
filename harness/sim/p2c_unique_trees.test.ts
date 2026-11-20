// Milestone 2-C (docs/V3/nodes/P2-C-unique-trees.md): the trees nearest the eye each drawn as itself — grown from a
// seed of its own place, at the size of the variant it stands in for, faded in from that variant at the edge of its
// reach, a dozen and a half at most at once, let go of a while after it is no longer near.
import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import type { RenderCore } from '../../src/game/render/core';
import { CrownView } from '../../src/game/scene/crowns/crownView';
import { VARIANTS } from '../../src/game/scene/crowns/species';
import { growOne, sizeOf } from '../../src/game/scene/crowns/speciesGrow';

/** trees of the first species at these places, all its fourth variant, 10 m tall and 4 m across (the crowns' stride) */
function treesAt(places: [number, number][]): Float32Array {
  const d = new Float32Array(places.length * 16);
  places.forEach(([x, z], i) => d.set([x, 0, z, 0, 1, 1, 0, 3, 0, 0, -1, 0, 0.5, 0, 4, 10], i * 16));
  return d;
}

function setUp(): { view: CrownView; camera: THREE.PerspectiveCamera; seen: () => THREE.InstancedMesh[] } {
  const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 5000);
  const view = new CrownView({ camera, origin: { x: 0, y: 0, z: 0 } } as unknown as RenderCore);
  const seen = (): THREE.InstancedMesh[] => view.group.children.filter((m) => m.visible && m.layers.mask === 1) as THREE.InstancedMesh[];
  return { view, camera, seen };
}

describe('the nearest trees each drawn as itself', () => {
  it('grows a tree as itself from its place: two trees of one variant are two shapes, each not its variant\'s', () => {
    const a = growOne('oak', true, 1234).near;
    const b = growOne('oak', true, 98765).near;
    expect(a.attributes.position.count).not.toBe(b.attributes.position.count);
    // (its own variant number for the draw's pick, every corner 0)
    expect(Array.from(a.attributes.aVar.array as Float32Array).every((v) => v === 0)).toBe(true);
    // and the M5 crowns' too, in one of their variants' shapes
    const m = growOne('oak', false, 1234);
    expect(m.near.attributes.aVar.count).toBe(m.near.attributes.position.count);
    expect(sizeOf(m.near)[0]).toBeGreaterThan(2);
    // (and its own shadow, smaller than it, every corner 0 too)
    expect(m.shadow.index!.count).toBeLessThan(m.near.index!.count);
    expect(m.shadow.attributes.aVar.count).toBe(m.shadow.attributes.position.count);
  });

  it('draws a tree near the eye by its own draw, at its variant\'s height; farther, its variant; between, both, faded', () => {
    CrownView.bakeAtOnce = true;
    try {
      const { view, camera, seen } = setUp();
      view.setTile('a', treesAt([[0, 0]]), 1);
      camera.position.set(0, 4, 20);
      view.update();
      const near = seen();
      expect(near).toHaveLength(1);
      const own = near[0];
      expect(own.count).toBe(1);
      expect(own.geometry.getAttribute('aPick').getX(0)).toBe(0);
      // (not the species' pack: a geometry of its own)
      expect(own.geometry.index!.count).toBeLessThan(5000 * 3);
      // at the height of the variant it stands in for (the fourth), from the data's size (1)
      const matrix = new THREE.Matrix4().fromArray(own.instanceMatrix.array as Float32Array, 0);
      const sy = new THREE.Vector3().setFromMatrixColumn(matrix, 1).length();
      camera.position.set(0, 4, 60);
      view.update();
      const pack = seen();
      expect(pack).toHaveLength(1);
      expect(pack[0]).not.toBe(own);
      expect(pack[0].geometry.getAttribute('aPick').getX(0)).toBe(3);
      const sizes = sizeOf(pack[0].geometry, VARIANTS);
      expect(sizeOf(own.geometry)[0] * sy).toBeCloseTo(sizes[6], 3);
      // at the edge of its reach (45 m): both, the one fading in as the other fades out
      camera.position.set(0, 4, 45);
      view.update();
      const both = seen();
      expect(both).toHaveLength(2);
      const fades = both.map((m) => m.geometry.getAttribute('aFade').getX(0)).sort((x, y) => x - y);
      expect(fades).toEqual([-45, 45]);
      view.dispose();
    } finally {
      CrownView.bakeAtOnce = false;
    }
  });

  it('draws sixteen at most as themselves, the rest as their variants', () => {
    CrownView.bakeAtOnce = true;
    try {
      const { view, camera, seen } = setUp();
      const places: [number, number][] = [];
      for (let x = -8; x <= 8; x += 4) for (let z = 0; z < 16; z += 2) places.push([x, z]);
      view.setTile('a', treesAt(places), places.length);
      // (16 to 31 m off: none at the edge, where a tree is drawn twice as it fades)
      camera.position.set(0, 4, 30);
      view.update();
      const drawn = seen();
      const ones = drawn.filter((m) => m.count === 1);
      expect(ones).toHaveLength(16);
      expect(drawn.reduce((n, m) => n + m.count, 0)).toBe(places.length);
      view.dispose();
    } finally {
      CrownView.bakeAtOnce = false;
    }
  });

  it('grows a tree anew where a tile set again under its name holds another tree', () => {
    CrownView.bakeAtOnce = true;
    try {
      const { view, camera, seen } = setUp();
      view.setTile('a', treesAt([[0, 0]]), 1);
      camera.position.set(0, 4, 20);
      view.update();
      const first = seen()[0];
      view.setTile('a', treesAt([[3, 1]]), 1);
      view.update();
      const second = seen();
      expect(second).toHaveLength(1);
      expect(second[0]).not.toBe(first);
      expect(view.group.children).not.toContain(first);
      view.dispose();
    } finally {
      CrownView.bakeAtOnce = false;
    }
  });

  it('lets a tree\'s own draw go twenty seconds after it was last drawn', () => {
    CrownView.bakeAtOnce = true;
    let now = 1000;
    const clock = vi.spyOn(performance, 'now').mockImplementation(() => now);
    try {
      const { view, camera, seen } = setUp();
      view.setTile('a', treesAt([[0, 0]]), 1);
      camera.position.set(0, 4, 20);
      view.update();
      const own = seen()[0];
      expect(view.group.children).toContain(own);
      view.dropTile('a');
      view.update();
      now += 10000;
      (view as unknown as { changed: boolean }).changed = true;
      view.update();
      expect(view.group.children).toContain(own);
      now += 11000;
      (view as unknown as { changed: boolean }).changed = true;
      view.update();
      expect(view.group.children).not.toContain(own);
      view.dispose();
    } finally {
      clock.mockRestore();
      CrownView.bakeAtOnce = false;
    }
  });
});
