/**
 * What the mark is on, worked out as Nomad Drive's one ray from the eye does it (the cab's controls, cockpit.ts): each
 * thing one may work is met by a shape of its own — a small one by a box of its own a little larger than it — and of
 * those the ray meets the nearest is the one, unless something else stands in front of it.
 */
import * as THREE from 'three';

const INV = new THREE.Matrix4();
const BOX = new THREE.Box3();
const RAY = new THREE.Ray();
const P = new THREE.Vector3();

/**
 * Where a ray (render space) meets a mesh's own box — its geometry's, in its own frame, so turned as it is drawn (a
 * lever pulled up, a key turned) and not the world's box round it — `pad` metres larger all round; null: it misses.
 */
export function meshBoxHit(mesh: THREE.Mesh, origin: THREE.Vector3, dir: THREE.Vector3, pad: number): number | null {
  const g = mesh.geometry;
  if (!g.boundingBox) g.computeBoundingBox();
  if (!g.boundingBox || g.boundingBox.isEmpty()) return null;
  mesh.updateWorldMatrix(true, false);
  const w = mesh.matrixWorld;
  const e = w.elements;
  BOX.copy(g.boundingBox);
  // (the pad in the mesh's own units: a part scaled to its place keeps a pad of metres)
  const sx = pad / (Math.hypot(e[0], e[1], e[2]) || 1);
  const sy = pad / (Math.hypot(e[4], e[5], e[6]) || 1);
  const sz = pad / (Math.hypot(e[8], e[9], e[10]) || 1);
  BOX.min.x -= sx;
  BOX.max.x += sx;
  BOX.min.y -= sy;
  BOX.max.y += sy;
  BOX.min.z -= sz;
  BOX.max.z += sz;
  INV.copy(w).invert();
  RAY.origin.copy(origin).applyMatrix4(INV);
  RAY.direction.copy(dir).transformDirection(INV);
  const p = RAY.intersectBox(BOX, P);
  return p ? p.applyMatrix4(w).distanceTo(origin) : null;
}

/**
 * Of the things a ray meets (each at the distance it first meets it), the one marked: the nearest — unless the first
 * thing of anything the ray meets (`first`, its distance; null: nothing) stands more than `grace` in front of it, which
 * hides it (a lever behind the console's skin, a key behind the wheel's rim). Ties keep the first listed.
 */
export function nearestMarked<T>(hits: readonly { t: T; d: number }[], first: number | null, grace: number): T | null {
  let best: { t: T; d: number } | null = null;
  for (const h of hits) if (!best || h.d < best.d) best = h;
  if (!best) return null;
  return first === null || best.d <= first + grace ? best.t : null;
}
