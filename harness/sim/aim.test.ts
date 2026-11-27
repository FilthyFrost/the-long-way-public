/**
 * What the mark is on (src/game/modcar/aim.ts, the cab's controls in cockpit.ts — the player's words of 2026-11-27:
 * the mouse on the handbrake, the passenger's seat lit): of the things the ray meets the nearest is the one, a seat's
 * box never stands over the lever beside it; a small control's box is its own, turned with it, a pad larger all round;
 * something else in front of a control by more than the skin's grace hides it.
 */
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { meshBoxHit, nearestMarked } from '../../src/game/modcar/aim';

const at = (x: number, y: number, z: number): THREE.Vector3 => new THREE.Vector3(x, y, z);

describe('nearestMarked', () => {
  it('is the nearest of the things met, whichever is listed first', () => {
    expect(nearestMarked([{ t: 'seat', d: 0.9 }, { t: 'handbrake', d: 0.7 }], 0.7, 0.02)).toBe('handbrake');
    expect(nearestMarked([{ t: 'handbrake', d: 0.7 }, { t: 'seat', d: 0.9 }], 0.7, 0.02)).toBe('handbrake');
    expect(nearestMarked([{ t: 'seat', d: 0.6 }, { t: 'handbrake', d: 0.7 }], 0.6, 0.02)).toBe('seat');
  });

  it('is nothing when nothing is met', () => {
    expect(nearestMarked([], null, 0.02)).toBeNull();
    expect(nearestMarked([], 0.5, 0.02)).toBeNull();
  });

  it('is hidden by something else in front of it by more than the grace, not by its own skin', () => {
    // (the console's skin 1 cm in front of the lever's box: still the lever; 5 cm in front: hidden)
    expect(nearestMarked([{ t: 'lever', d: 0.81 }], 0.8, 0.02)).toBe('lever');
    expect(nearestMarked([{ t: 'lever', d: 0.85 }], 0.8, 0.02)).toBeNull();
    // (nothing else met at all, or what is met first is the control itself)
    expect(nearestMarked([{ t: 'key', d: 0.6 }], null, 0.02)).toBe('key');
    expect(nearestMarked([{ t: 'key', d: 0.6 }], 0.6, 0.02)).toBe('key');
  });

  it('keeps the first listed of two met at the same distance', () => {
    expect(nearestMarked([{ t: 'a', d: 0.5 }, { t: 'b', d: 0.5 }], 0.5, 0.02)).toBe('a');
  });
});

describe('meshBoxHit', () => {
  /** a lever 30 cm long, 2 cm square, along its own x from its pivot */
  const lever = (): THREE.Mesh => {
    const g = new THREE.BoxGeometry(0.3, 0.02, 0.02);
    g.translate(0.15, 0, 0);
    return new THREE.Mesh(g, new THREE.MeshBasicMaterial());
  };

  it('meets the box where its face is, a pad nearer', () => {
    const m = lever();
    m.position.set(0, 0, 0);
    // (looking down on its middle from 1 m: its top at 0.01, the pad 1.2 cm over it)
    const d = meshBoxHit(m, at(0.15, 1, 0), at(0, -1, 0), 0.012);
    expect(d).not.toBeNull();
    expect(d!).toBeCloseTo(1 - 0.01 - 0.012, 6);
    expect(meshBoxHit(m, at(0.15, 1, 0), at(0, -1, 0), 0)!).toBeCloseTo(0.99, 6);
  });

  it('is the lever turned as it stands, not the world box round its sweep', () => {
    const m = lever();
    // (pulled up 45°: its tip at (0.21, 0.21))
    m.rotation.z = Math.PI / 4;
    m.updateMatrixWorld(true);
    // a look straight down at (0.2, ·, 0) meets it near its tip, 20 cm up; one from the side 15 cm up, its middle
    expect(meshBoxHit(m, at(0.2, 1, 0), at(0, -1, 0), 0.005)!).toBeCloseTo(1 - 0.2 - 0.0191, 2);
    expect(meshBoxHit(m, at(0.15, 0.15, 1), at(0, 0, -1), 0.005)).not.toBeNull();
    // the corner under the raised lever, inside the world's box round it, is missed
    const world = new THREE.Box3().setFromObject(m);
    expect(world.containsPoint(at(0.2, 0.02, 0))).toBe(true);
    expect(meshBoxHit(m, at(0.2, 0.02, 1), at(0, 0, -1), 0.005)).toBeNull();
  });

  it('keeps a pad of metres on a part scaled to its place', () => {
    const m = lever();
    m.scale.set(2, 2, 2);
    m.updateMatrixWorld(true);
    // (its top at 0.02 scaled, the pad still 1 cm)
    expect(meshBoxHit(m, at(0.3, 1, 0), at(0, -1, 0), 0.01)!).toBeCloseTo(1 - 0.02 - 0.01, 6);
  });

  it('misses beside the pad', () => {
    const m = lever();
    // (2 cm to the side of its 1 cm half-width: outside a 5 mm pad, inside a 2 cm one)
    expect(meshBoxHit(m, at(0.15, 1, 0.03), at(0, -1, 0), 0.005)).toBeNull();
    expect(meshBoxHit(m, at(0.15, 1, 0.03), at(0, -1, 0), 0.025)).not.toBeNull();
  });
});
