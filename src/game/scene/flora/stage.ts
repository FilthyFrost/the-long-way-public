/**
 * The toolkit's samples set into the game's own world, for the player to judge them where they would stand
 * (docs/V3/nodes/P2-flora.md): a browser-side helper the sample harness imports (harness/shots/p2_flora.mjs).
 * Each plant is drawn by the crowns' material (material.ts) in the game's light, sky, fog and paint finish, and
 * casts its shadow into the wide shadow map as the world's trees do.
 */
import * as THREE from 'three';
import { LAYER_SHADOW_FAR } from '../../render/shadow';
import { FLORA, floraKind, growFlora, type FloraKind } from './catalog';
import type { Level } from './kit';
import { floraMaterial, floraSilhouette, shadowCaster } from './material';

export interface FloraSpec {
  id: string;
  /** where it stands (world), its turn (rad), its scale, its seed */
  x: number;
  z: number;
  turn?: number;
  scale?: number;
  seed: number;
  /** its level (0 near, 1 the middle distance); none: by its distance from the eye */
  level?: Level;
}

interface GameLike {
  core: { scene: THREE.Scene; camera: THREE.Camera; origin: { x: number; y: number; z: number } };
  ground: { sample(x: number, z: number, out: { h: number }): void };
}

export interface Placed {
  id: string;
  level: Level;
  triangles: number;
  height: number;
  ms: number;
}

/** the instance attributes of a kind (render/crownMaterial.ts aLook, aTree) */
function instanceLook(kind: FloraKind, seed: number, scale: number): { look: Float32Array; tree: Float32Array } {
  const l = kind.look;
  return {
    look: new Float32Array([0, (l.bears ? 2 : 0) + (l.evergreen ? 4 : 0), l.leaf, l.second]),
    tree: new Float32Array([(seed % 97) / 97, l.sway, (l.pale ? 1 : 0) + (l.bright ? 2 : 0), scale]),
  };
}

/**
 * Set plants into the world, on the ground where they stand; returns what it put and a function that takes them
 * out again. `silhouette`: all black (the outline test).
 */
export function placeFlora(game: GameLike, specs: readonly FloraSpec[], opts: { silhouette?: boolean } = {}): { placed: Placed[]; remove: () => void } {
  const mat = opts.silhouette ? floraSilhouette() : floraMaterial();
  const o = game.core.origin;
  const gs = { h: 0 };
  const meshes: THREE.Mesh[] = [];
  const placed: Placed[] = [];
  const cam = new THREE.Vector3();
  game.core.camera.getWorldPosition(cam);
  for (const s of specs) {
    const kind = floraKind(s.id);
    game.ground.sample(s.x, s.z, gs);
    const d = Math.hypot(s.x - (cam.x + o.x), s.z - (cam.z + o.z));
    const level: Level = s.level ?? (d < 70 ? 0 : 1);
    const scale = s.scale ?? 1;
    const model = growFlora(kind, s.seed, level);
    const { look, tree } = instanceLook(kind, s.seed, scale);
    const m = new THREE.Matrix4().compose(new THREE.Vector3(s.x - o.x, gs.h - o.y - 0.04, s.z - o.z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), s.turn ?? s.seed * 0.7), new THREE.Vector3(scale, scale, scale));
    for (const shadow of [false, true]) {
      if (shadow && kind.family !== 'tree' && kind.family !== 'shrub') continue;
      const g = shadow ? shadowCaster(model.geometry) : model.geometry;
      g.setAttribute('aFade', new THREE.InstancedBufferAttribute(new Float32Array([0, 0, 0]), 3));
      g.setAttribute('aLook', new THREE.InstancedBufferAttribute(look, 4));
      g.setAttribute('aTree', new THREE.InstancedBufferAttribute(tree, 4));
      const mesh = new THREE.InstancedMesh(g, mat, 1);
      mesh.setMatrixAt(0, m);
      mesh.instanceMatrix.needsUpdate = true;
      mesh.frustumCulled = false;
      mesh.name = shadow ? 'flora-sample-shadow' : 'flora-sample';
      if (shadow) mesh.layers.set(LAYER_SHADOW_FAR);
      game.core.scene.add(mesh);
      meshes.push(mesh);
    }
    placed.push({ id: s.id, level, triangles: model.triangles, height: model.height * scale, ms: model.ms });
  }
  return {
    placed,
    remove: () => {
      for (const m of meshes) {
        game.core.scene.remove(m);
        m.geometry.dispose();
      }
    },
  };
}

/** every kind's measure at both levels, over eight seeds: the worst triangles and the mean grow time */
export function floraReport(): { id: string; name: string; budget: string; near: number; mid: number; nearMs: number; midMs: number }[] {
  return FLORA.map((k) => {
    const row = { id: k.id, name: k.name, budget: k.budget, near: 0, mid: 0, nearMs: 0, midMs: 0 };
    for (const seed of [11, 23, 37, 51, 63, 77, 91, 105]) {
      for (const level of [0, 1] as const) {
        const d = growFlora(k, seed, level);
        if (level === 0) {
          row.near = Math.max(row.near, d.triangles);
          row.nearMs += d.ms / 8;
        } else {
          row.mid = Math.max(row.mid, d.triangles);
          row.midMs += d.ms / 8;
        }
        d.geometry.dispose();
      }
    }
    return row;
  });
}
