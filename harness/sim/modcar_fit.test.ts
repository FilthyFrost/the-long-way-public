import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import moto from '../../src/core/modcar/data/mounts/moto.json';
import pickup from '../../src/core/modcar/data/mounts/pickup.json';
import rv from '../../src/core/modcar/data/mounts/rv.json';
import sedan from '../../src/core/modcar/data/mounts/sedan.json';
import { partGeo } from '../../src/core/modcar/geo';
import { PARTS } from '../../src/core/modcar/parts';
import { stretchFit, type Model } from '../../src/game/modcar/assets';

// Parts stay where their mounts say: a stretch part inside its fit box once stretched (a light bar that
// floated metres off the roof), a frame's stock parts inside the room its mount leaves them (a radiator's
// cap through the bonnet). The mount files are in Blender axes (x forward, y left, z up).
type Mount = { cat: string; side?: number; fit?: [number, number, number]; space_min?: number[]; space_max?: number[] };
const FRAMES: Record<string, Record<string, Mount>> = {
  sedan: (sedan as unknown as { mounts: Record<string, Mount> }).mounts,
  pickup: (pickup as unknown as { mounts: Record<string, Mount> }).mounts,
  moto: (moto as unknown as { mounts: Record<string, Mount> }).mounts,
  rv: (rv as unknown as { mounts: Record<string, Mount> }).mounts,
};

/** a part's model as the game sees it, from its measured bounds */
function modelOf(id: string): Model | null {
  const g = partGeo(id);
  if (!g?.bbox) return null;
  const scene = new THREE.Group();
  const part = new THREE.Group();
  if (g.fit_nominal) part.userData.fit_nominal = g.fit_nominal;
  scene.add(part);
  const box = new THREE.Box3(new THREE.Vector3(...g.bbox[0]), new THREE.Vector3(...g.bbox[1]));
  return { scene, standIn: false, box };
}

/** where a stretch part's bounds end up on a mount with a fit box (mount frame, game axes) */
function placed(m: Model, fit: [number, number, number]): THREE.Box3 {
  const s = stretchFit(m, fit);
  const b = m.box.clone();
  b.min.multiply(s.scale);
  b.max.multiply(s.scale);
  return b.translate(s.shift);
}

/**
 * The frames' own parts that are known to overflow their room until the parts are re-proportioned:
 * remove an entry when its part is made to fit.
 */
const KNOWN_OVER = new Set([
  // (the single's kick-start peg stands 7 cm out on the right of the bike's room: an open frame, nothing to poke through)
  'moto:engine:eng_single',
]);

describe('modcar · parts sit where their mounts say', () => {
  it('a stretch part stays inside its fit box along every axis it fills, wherever it is fitted', () => {
    const bad: string[] = [];
    for (const [fr, mounts] of Object.entries(FRAMES)) {
      for (const [id, mt] of Object.entries(mounts)) {
        if (!mt.fit) continue;
        for (const p of PARTS) {
          if (!p.stretch || p.cat !== mt.cat) continue;
          const m = modelOf(p.id);
          if (!m) continue;
          const b = placed(m, mt.fit);
          const [len, wid] = mt.fit;
          // a plough is meant to be wider than the car and spikes to stand out a little: a quarter over at most
          const tol = (half: number): number => 0.06 + 0.25 * half;
          // (along a thin axis the part keeps its own depth: a bumper stands proud of its line)
          if (len >= 0.3 && (b.min.x < -len / 2 - tol(len / 2) || b.max.x > len / 2 + tol(len / 2))) bad.push(`${fr}:${id}:${p.id} x [${b.min.x.toFixed(2)}, ${b.max.x.toFixed(2)}] in ±${(len / 2).toFixed(2)}`);
          if (wid >= 0.3 && (b.min.z < -wid / 2 - tol(wid / 2) || b.max.z > wid / 2 + tol(wid / 2))) bad.push(`${fr}:${id}:${p.id} z [${b.min.z.toFixed(2)}, ${b.max.z.toFixed(2)}] in ±${(wid / 2).toFixed(2)}`);
        }
      }
    }
    expect(bad).toEqual([]);
  });

  it("a frame's stock parts fit the room their mounts leave them", () => {
    const bad: string[] = [];
    for (const [fr, mounts] of Object.entries(FRAMES)) {
      for (const [id, mt] of Object.entries(mounts)) {
        if (!mt.space_min || !mt.space_max) continue;
        const lo = mt.space_min;
        const hi = mt.space_max;
        // Blender (x, y left, z up) to the game's (x, y up, z right)
        const room = new THREE.Box3(new THREE.Vector3(lo[0], lo[2], -hi[1]), new THREE.Vector3(hi[0], hi[2], -lo[1])).expandByScalar(0.015);
        for (const p of PARTS) {
          if (p.cat !== mt.cat || !p.tags?.includes(`stock:${fr}`)) continue;
          const b = partGeo(p.id)?.bbox;
          if (!b) continue;
          const box = new THREE.Box3(new THREE.Vector3(...b[0]), new THREE.Vector3(...b[1]));
          const key = `${fr}:${id}:${p.id}`;
          if (!room.containsBox(box) && !KNOWN_OVER.has(key)) bad.push(key);
          // (a known one that now fits: take it off the list)
          if (room.containsBox(box) && KNOWN_OVER.has(key)) bad.push(`${key} fits now: remove it from KNOWN_OVER`);
        }
      }
    }
    expect(bad).toEqual([]);
  });
});
