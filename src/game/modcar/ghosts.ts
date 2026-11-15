/**
 * Ghosts (docs/MODCAR.md §5.2): while a part is in the hands, every mount within reach that takes it
 * shows the part as a pale hologram where it would go; the one the mark is on glows brighter.
 *
 * The look is a stand-in additive material until the rendering line's ghostMaterial arrives
 * (src/game/render/carMaterials.ts); the placement — mirrored on right-hand mounts, stretched on
 * stretch mounts — is the real one.
 */
import * as THREE from 'three';
import { partDef } from '../../core/modcar/parts';
import type { MountDef } from '../../core/modcar/types';
import { cloneModel, partModel } from './assets';

export type GhostKind = 'empty' | 'replace' | 'blocked';

const COLOURS: Record<GhostKind, number> = { empty: 0x9ff3ff, replace: 0xbfe2ff, blocked: 0xff8a5a };

function ghostMat(kind: GhostKind, selected: boolean): THREE.ShaderMaterial {
  const m = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: { uColor: { value: new THREE.Color(COLOURS[kind]) }, uTime: { value: 0 }, uSel: { value: selected ? 1 : 0 }, uDim: { value: kind === 'replace' ? 0.6 : 1 } },
    vertexShader: /* glsl */ `
      varying vec3 vN;
      varying vec3 vV;
      varying float vY;
      #include <common>
      #include <logdepthbuf_pars_vertex>
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vN = normalize(mat3(modelMatrix) * normal);
        vV = normalize(cameraPosition - wp.xyz);
        vY = wp.y;
        gl_Position = projectionMatrix * viewMatrix * wp;
        #include <logdepthbuf_vertex>
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      uniform float uTime;
      uniform float uSel;
      uniform float uDim;
      varying vec3 vN;
      varying vec3 vV;
      varying float vY;
      #include <logdepthbuf_pars_fragment>
      void main() {
        #include <logdepthbuf_fragment>
        float rim = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.2);
        float scan = 0.5 + 0.5 * sin(vY * 140.0 - uTime * 6.0);
        float breathe = 0.75 + 0.25 * sin(uTime * 3.2);
        float a = (0.07 + 0.55 * rim + 0.06 * scan) * breathe * uDim * (0.6 + 0.9 * uSel);
        gl_FragColor = vec4(uColor * a, a);
      }`,
  });
  // light added on top; the frame's alpha (the ink ids of the vehicle under it) stays as it was
  m.blending = THREE.CustomBlending;
  m.blendSrc = THREE.OneFactor;
  m.blendDst = THREE.OneFactor;
  m.blendSrcAlpha = THREE.ZeroFactor;
  m.blendDstAlpha = THREE.OneFactor;
  return m;
}

interface Ghost {
  key: string;
  obj: THREE.Group;
  mats: THREE.ShaderMaterial[];
  kind: GhostKind;
}

export interface GhostSpec {
  /** where it hangs: a mount's scene node (CarView.mountNode) or a loose rim's object */
  node: THREE.Object3D;
  mount: MountDef | null;
  partId: string;
  kind: GhostKind;
  /** a key that stays the same while the ghost should stay */
  key: string;
}

export class GhostLayer {
  private ghosts = new Map<string, Ghost>();
  private time = 0;
  selected = '';

  /** show exactly these ghosts (others go away) */
  show(list: GhostSpec[]): void {
    const keep = new Set(list.map((g) => g.key));
    for (const [k, g] of this.ghosts) {
      if (keep.has(k)) continue;
      g.obj.removeFromParent();
      for (const m of g.mats) m.dispose();
      this.ghosts.delete(k);
    }
    for (const s of list) {
      if (this.ghosts.has(s.key)) continue;
      const obj = new THREE.Group();
      obj.name = `ghost:${s.key}`;
      s.node.add(obj);
      const g: Ghost = { key: s.key, obj, mats: [], kind: s.kind };
      this.ghosts.set(s.key, g);
      const def = partDef(s.partId);
      void partModel(s.partId).then((model) => {
        if (this.ghosts.get(s.key) !== g) return;
        const c = cloneModel(model);
        const m = s.mount;
        if (m && m.side > 0) c.scale.z = -1;
        if (def.stretch && m?.fit) {
          const size = model.box.getSize(new THREE.Vector3());
          c.scale.multiply(new THREE.Vector3(m.fit[0] < 0.3 ? 1 : m.fit[0] / Math.max(0.01, size.x), m.fit[2] / Math.max(0.01, size.y), m.fit[1] / Math.max(0.01, size.z)));
        }
        if (def.cat === 'rim' || def.cat === 'tire') {
          // a wheel ghost hangs on the hub's pivot: mirror there as well
          if (m && m.side > 0) c.scale.z = -1;
        }
        c.traverse((o) => {
          const mesh = o as THREE.Mesh;
          if (!mesh.isMesh) return;
          const mat = ghostMat(s.kind, false);
          g.mats.push(mat);
          mesh.material = mat;
          mesh.castShadow = false;
          mesh.renderOrder = 10;
        });
        obj.add(c);
      });
    }
  }

  clear(): void {
    this.show([]);
  }

  update(dt: number): void {
    this.time += dt;
    for (const [k, g] of this.ghosts) {
      const sel = k === this.selected ? 1 : 0;
      for (const m of g.mats) {
        m.uniforms.uTime.value = this.time;
        m.uniforms.uSel.value = sel;
      }
    }
  }
}
