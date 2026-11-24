/**
 * Ghosts (docs/MODCAR.md §5.2): while a part is in the hands, every mount within reach that takes it
 * shows the part as a hologram where it would go (render/carMaterials.ts ghostMaterial: cyan-white,
 * rim-lit, scanlines, breathing); a mount that already has a part shows it fainter ("replace"), a
 * vehicle that is moving shows orange-red ("blocked"); the one the mark is on glows brighter.
 * Placement follows the part's: mirrored on right-hand mounts, stretched on stretch mounts.
 */
import * as THREE from 'three';
import { partDef } from '../../core/modcar/parts';
import type { MountDef } from '../../core/modcar/types';
import { applyGhost, type GhostKind } from '../render/carMaterials';
import { cloneModel, partModel, stretchFit } from './assets';

export type { GhostKind };

interface Ghost {
  key: string;
  obj: THREE.Group;
  kind: GhostKind;
  /** the model is in (it loads on first use) */
  model: THREE.Object3D | null;
  /** drawn as the one aimed at */
  focused: boolean;
}

export interface GhostSpec {
  /** where it hangs: a mount's scene node (CarView.mountNode) or a loose rim's object */
  node: THREE.Object3D;
  mount: MountDef | null;
  partId: string;
  /** the model's variant (a tyre's rim: <tyre>@<rim>.glb) */
  variant?: string;
  kind: GhostKind;
  /** a key that stays the same while the ghost should stay */
  key: string;
  /** the ghost's own shape, in place of the part's model (a panel: the frame's own skin) */
  make?: () => THREE.Object3D;
}

/** an axle's part's ghost: at both ends of its axle, the right one mirrored */
function pairOf(c: THREE.Object3D, pair: number): THREE.Group {
  const g = new THREE.Group();
  const r = c.clone(true);
  c.position.z -= pair;
  r.position.z += pair;
  r.scale.z *= -1;
  g.add(c, r);
  return g;
}

export class GhostLayer {
  private ghosts = new Map<string, Ghost>();
  selected = '';
  /** the one ghost drawn (docs/V3/plan/hands.md §三: only one at a time); '': none */
  only = '';

  /** the ghost a ray (render space) meets first, by its own meshes, drawn or not, within far */
  cast(origin: THREE.Vector3, dir: THREE.Vector3, far: number): { key: string; dist: number } | null {
    let best: { key: string; dist: number } | null = null;
    const rc = this.rc;
    rc.set(origin, dir);
    rc.far = far;
    for (const [key, g] of this.ghosts) {
      if (!g.model) continue;
      g.model.updateWorldMatrix(true, true);
      const meshes: THREE.Object3D[] = [];
      g.model.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (mesh.isMesh && !mesh.userData.ghostDepth && !mesh.userData.ghostXray) meshes.push(mesh);
      });
      const h = rc.intersectObjects(meshes, false)[0];
      if (h && (!best || h.distance < best.dist)) best = { key, dist: h.distance };
    }
    return best;
  }

  private readonly rc = new THREE.Raycaster();

  /** show exactly these ghosts (others go away) */
  show(list: GhostSpec[]): void {
    const keep = new Set(list.map((g) => g.key));
    for (const [k, g] of this.ghosts) {
      if (keep.has(k)) continue;
      g.obj.removeFromParent();
      this.ghosts.delete(k);
    }
    for (const s of list) {
      const was = this.ghosts.get(s.key);
      if (was) {
        // a vehicle that starts or stops moving turns its ghosts blocked and back
        if (was.kind !== s.kind) {
          was.kind = s.kind;
          if (was.model) applyGhost(was.model, was.kind, was.focused);
        }
        continue;
      }
      const obj = new THREE.Group();
      obj.name = `ghost:${s.key}`;
      obj.visible = s.key === this.only;
      s.node.add(obj);
      const g: Ghost = { key: s.key, obj, kind: s.kind, model: null, focused: false };
      this.ghosts.set(s.key, g);
      if (s.make) {
        const c = s.make();
        g.focused = s.key === this.selected;
        applyGhost(c, g.kind, g.focused);
        g.model = c;
        obj.add(c);
        continue;
      }
      const def = partDef(s.partId);
      void partModel(s.partId, s.variant ?? '').then((model) => {
        if (this.ghosts.get(s.key) !== g) return;
        let c: THREE.Object3D = cloneModel(model);
        const m = s.mount;
        if (m && m.side > 0) c.scale.z = -1;
        // (placed as the part itself would be)
        if (def.stretch && m?.fit) {
          const st = stretchFit(model, m.fit);
          c.scale.multiply(st.scale);
          c.position.add(st.shift.multiply(new THREE.Vector3(1, 1, Math.sign(c.scale.z))));
        }
        if (m?.pair !== undefined) c = pairOf(c, m.pair);
        g.focused = s.key === this.selected;
        applyGhost(c, g.kind, g.focused);
        g.model = c;
        obj.add(c);
      });
    }
  }

  clear(): void {
    this.show([]);
  }

  /** the middle of the first ghost whose key starts so (render space), drawn or not; null: none in yet */
  centerOf(prefix: string): THREE.Vector3 | null {
    for (const [k, g] of this.ghosts) {
      if (!k.startsWith(prefix) || !g.model) continue;
      const b = new THREE.Box3().setFromObject(g.obj, true);
      if (!b.isEmpty()) return b.getCenter(new THREE.Vector3());
    }
    return null;
  }

  update(_dt: number): void {
    for (const [k, g] of this.ghosts) {
      g.obj.visible = k === this.only;
      const focused = k === this.selected;
      if (focused === g.focused || !g.model) continue;
      g.focused = focused;
      applyGhost(g.model, g.kind, focused);
    }
  }
}
