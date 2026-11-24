/**
 * The spray can's mist (docs/MODCAR.md §16), drawn the way Arctic Drive draws it and a little more: a short,
 * dense cloud of soft puffs fanning out of the nozzle — a narrow fan, several hundred puffs a second, each
 * living 0.15 to 0.5 s, drifting off and swelling as it goes, in a darker and thinner version of the paint's
 * colour — and where the paint goes, a faint mist rolling over the surface and specks of paint landing on it.
 * Soft round puffs blended over the frame, lit by the sky and the sun, the ink ids under them left alone (no
 * outlines round a puff). One instanced quad, simulated here.
 */
import * as THREE from 'three';
import { GLSL_COMMON, globals } from '../render/shaderlib';

const MAX = 720;

/** what a puff is: out of the nozzle, over the surface, a speck on it */
const Kind = { Jet: 0, Mist: 1, Speck: 2 } as const;
type Kind = (typeof Kind)[keyof typeof Kind];

interface Puff {
  kind: Kind;
  p: THREE.Vector3;
  v: THREE.Vector3;
  age: number;
  life: number;
  /** its size grown (m) */
  size: number;
  rot: number;
  spin: number;
  alpha: number;
  r: number;
  g: number;
  b: number;
}

function mistMaterial(): THREE.ShaderMaterial {
  const m = new THREE.ShaderMaterial({
    uniforms: { ...globals },
    vertexShader: /* glsl */ `
      #include <common>
      #include <logdepthbuf_pars_vertex>
      attribute vec3 aPos;
      attribute vec4 aCol;
      attribute vec3 aMisc;
      varying vec2 vUv;
      varying vec4 vCol;
      varying float vHard;
      varying float vSeed;
      varying vec3 vPos;
      void main() {
        vUv = position.xy;
        vCol = aCol;
        vHard = aMisc.z;
        vSeed = aMisc.y;
        vPos = aPos;
        vec4 mv = viewMatrix * vec4(aPos, 1.0);
        float a = aMisc.y;
        vec2 q = mat2(cos(a), -sin(a), sin(a), cos(a)) * position.xy;
        mv.xy += q * aMisc.x;
        gl_Position = projectionMatrix * mv;
        #include <logdepthbuf_vertex>
      }`,
    fragmentShader: /* glsl */ `
      #include <common>
      #include <logdepthbuf_pars_fragment>
      ${GLSL_COMMON}
      varying vec2 vUv;
      varying vec4 vCol;
      varying float vHard;
      varying float vSeed;
      varying vec3 vPos;
      void main() {
        #include <logdepthbuf_fragment>
        float d = length(vUv);
        float a;
        if (vHard > 0.5) {
          // a speck of paint: a small round drop
          a = 1.0 - smoothstep(0.7, 1.0, d);
        } else {
          // a soft puff, its edge broken like a brush's
          float n = rtNoiseAt(vUv * 0.8 + vSeed * 7.0, 1.0).r;
          a = 1.0 - smoothstep(0.2, 1.0, d + (n - 0.5) * 0.5);
        }
        a *= vCol.a;
        if (a < 0.004) discard;
        // lit as the rest is: the sky all round, the sun from its side of the puff
        float lit = vHard > 0.5 ? 1.0 : 0.6 + 0.4 * clamp(dot(normalize(vec3(vUv, 0.7)), normalize(vec3(0.0, 0.6, 0.8))), 0.0, 1.0);
        vec3 col = vCol.rgb * (uSkyColor * 0.9 + uSunColor * 0.35 * lit);
        col = rtFog(col, vPos, cameraPosition);
        gl_FragColor = vec4(col, a);
      }`,
  });
  m.transparent = true;
  m.depthWrite = false;
  m.blending = THREE.CustomBlending;
  m.blendSrc = THREE.SrcAlphaFactor;
  m.blendDst = THREE.OneMinusSrcAlphaFactor;
  m.blendSrcAlpha = THREE.ZeroFactor;
  m.blendDstAlpha = THREE.OneFactor;
  return m;
}

/** a puff's size over its life (Arctic Drive's curve: nothing at birth, 0.57 a third of the way, whole at the end) */
function grow(k: number): number {
  return k < 0.374 ? (0.567 * k) / 0.374 : 0.567 + (0.433 * (k - 0.374)) / 0.626;
}

export class SprayMist {
  private readonly mesh: THREE.Mesh;
  private readonly geo: THREE.InstancedBufferGeometry;
  private readonly aPos: THREE.InstancedBufferAttribute;
  private readonly aCol: THREE.InstancedBufferAttribute;
  private readonly aMisc: THREE.InstancedBufferAttribute;
  private readonly puffs: Puff[] = [];
  private readonly col = new THREE.Color();
  private readonly side = new THREE.Vector3();
  private readonly up = new THREE.Vector3();
  private readonly t0 = new THREE.Vector3();
  private readonly t1 = new THREE.Vector3();
  /** what is owed of each kind (fractions of a puff carried to the next frame) */
  private owed = [0, 0, 0];
  private seed = 7;

  constructor(scene: THREE.Scene) {
    const g = new THREE.InstancedBufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0], 3));
    g.setIndex([0, 1, 2, 0, 2, 3]);
    this.aPos = new THREE.InstancedBufferAttribute(new Float32Array(MAX * 3), 3);
    this.aCol = new THREE.InstancedBufferAttribute(new Float32Array(MAX * 4), 4);
    this.aMisc = new THREE.InstancedBufferAttribute(new Float32Array(MAX * 3), 3);
    for (const a of [this.aPos, this.aCol, this.aMisc]) a.setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('aPos', this.aPos);
    g.setAttribute('aCol', this.aCol);
    g.setAttribute('aMisc', this.aMisc);
    g.instanceCount = 0;
    this.geo = g;
    this.mesh = new THREE.Mesh(g, mistMaterial());
    this.mesh.name = 'modcar:spraymist';
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 7;
    scene.add(this.mesh);
  }

  private rnd(): number {
    this.seed = (this.seed * 16807) % 2147483647;
    return this.seed / 2147483647;
  }

  /** how many puffs are about (the probe looks) */
  get count(): number {
    return this.puffs.length;
  }

  /**
   * A frame of spraying (render space): the nozzle and the way it points, the can's up (the fan opens across
   * it), the point the paint goes to on the surface and the surface's normal there (null: none), the
   * paint's colour (sRGB hex); `fill` 0…1 what is left (an emptying can spits thinner).
   */
  emit(dt: number, nozzle: THREE.Vector3, dir: THREE.Vector3, canUp: THREE.Vector3, hit: THREE.Vector3 | null, normal: THREE.Vector3 | null, hex: number, fill = 1): void {
    this.col.setHex(hex);
    const lum = this.col.r * 0.3 + this.col.g * 0.59 + this.col.b * 0.11;
    this.side.crossVectors(dir, canUp);
    if (this.side.lengthSq() < 1e-6) this.side.set(1, 0, 0);
    this.side.normalize();
    this.up.crossVectors(this.side, dir).normalize();
    const thin = 0.55 + 0.45 * Math.min(1, fill * 4);
    // out of the nozzle: a narrow fan (wider across the can than along it), quick and dense
    // (a thin short jet: docs/V3/plan/hands.md §六 — the cloud that was here hid where the paint went)
    this.owed[Kind.Jet] += dt * 90 * thin;
    while (this.owed[Kind.Jet] >= 1 && this.puffs.length < MAX) {
      this.owed[Kind.Jet] -= 1;
      const a = (this.rnd() * 2 - 1) * 0.06;
      const e = (this.rnd() * 2 - 1) * 0.03;
      const v = this.t0.copy(dir).addScaledVector(this.side, a).addScaledVector(this.up, e).normalize().multiplyScalar(1.2 + 0.6 * this.rnd());
      const k = 0.7 + 0.25 * this.rnd();
      this.add(Kind.Jet, nozzle, v, 0.06 + 0.1 * this.rnd(), 0.01 + 0.015 * this.rnd(), (0.12 + 0.06 * this.rnd()) * (0.75 + 0.5 * (1 - lum)) * thin, this.col.r * k, this.col.g * k, this.col.b * k);
    }
    // (nothing over the surface any more: the brush's shadow shows where it goes)
    this.owed[Kind.Mist] = this.owed[Kind.Speck] = 0;
    if (!hit || !normal || hit) return;
    // where it lands: a thin mist rolling off the surface, specks of paint dotting it round the point
    this.t1.crossVectors(normal, this.side);
    if (this.t1.lengthSq() < 1e-6) this.t1.crossVectors(normal, this.up);
    this.t1.normalize();
    const across = this.t0.crossVectors(normal, this.t1).normalize();
    this.owed[Kind.Mist] += dt * 34 * thin;
    while (this.owed[Kind.Mist] >= 1 && this.puffs.length < MAX) {
      this.owed[Kind.Mist] -= 1;
      const r = 0.12 * Math.sqrt(this.rnd());
      const th = this.rnd() * Math.PI * 2;
      const p = new THREE.Vector3().copy(hit).addScaledVector(this.t1, Math.cos(th) * r).addScaledVector(across, Math.sin(th) * r).addScaledVector(normal, 0.01);
      const v = new THREE.Vector3().copy(normal).multiplyScalar(0.05 + 0.1 * this.rnd()).addScaledVector(this.t1, (this.rnd() - 0.5) * 0.12).addScaledVector(across, (this.rnd() - 0.5) * 0.12);
      this.add(Kind.Mist, p, v, 0.4 + 0.4 * this.rnd(), 0.12 + 0.1 * this.rnd(), 0.13 * thin, this.col.r * 0.92, this.col.g * 0.92, this.col.b * 0.92);
    }
    this.owed[Kind.Speck] += dt * 70 * thin;
    while (this.owed[Kind.Speck] >= 1 && this.puffs.length < MAX) {
      this.owed[Kind.Speck] -= 1;
      const r = 0.16 * Math.sqrt(this.rnd());
      const th = this.rnd() * Math.PI * 2;
      const p = new THREE.Vector3().copy(hit).addScaledVector(this.t1, Math.cos(th) * r).addScaledVector(across, Math.sin(th) * r).addScaledVector(normal, 0.003);
      this.add(Kind.Speck, p, new THREE.Vector3(), 0.25 + 0.35 * this.rnd(), 0.003 + 0.0035 * this.rnd(), 1, this.col.r, this.col.g, this.col.b);
    }
  }

  private add(kind: Kind, at: THREE.Vector3, v: THREE.Vector3, life: number, size: number, alpha: number, r: number, g: number, b: number): void {
    this.puffs.push({ kind, p: at.clone(), v: v.clone(), age: 0, life, size, rot: this.rnd() * Math.PI * 2, spin: (this.rnd() - 0.5) * 3, alpha, r, g, b });
  }

  /** the puffs drift, swell and thin out; the specks fade where they landed */
  update(dt: number): void {
    let w = 0;
    const P = this.aPos.array as Float32Array;
    const C = this.aCol.array as Float32Array;
    const M = this.aMisc.array as Float32Array;
    for (let i = 0; i < this.puffs.length; i++) {
      const q = this.puffs[i];
      q.age += dt;
      if (q.age >= q.life) continue;
      const k = q.age / q.life;
      let size: number;
      let a: number;
      if (q.kind === Kind.Speck) {
        size = q.size;
        a = q.alpha * Math.min(1, (1 - k) / 0.4);
      } else {
        // (the jet slows in the air; the mist rises a little off the surface)
        q.v.multiplyScalar(Math.exp(-dt * (q.kind === Kind.Jet ? 2.4 : 1.2)));
        q.p.addScaledVector(q.v, dt);
        q.rot += q.spin * dt;
        size = q.size * Math.max(0.08, grow(k));
        a = q.alpha * Math.min(1, k / 0.08) * Math.pow(1 - k, 1.3);
      }
      this.puffs[w] = q;
      P[w * 3] = q.p.x;
      P[w * 3 + 1] = q.p.y;
      P[w * 3 + 2] = q.p.z;
      C[w * 4] = q.r;
      C[w * 4 + 1] = q.g;
      C[w * 4 + 2] = q.b;
      C[w * 4 + 3] = a;
      M[w * 3] = size;
      M[w * 3 + 1] = q.rot;
      M[w * 3 + 2] = q.kind === Kind.Speck ? 1 : 0;
      w++;
    }
    this.puffs.length = w;
    this.geo.instanceCount = w;
    if (w) {
      this.aPos.addUpdateRange(0, w * 3);
      this.aCol.addUpdateRange(0, w * 4);
      this.aMisc.addUpdateRange(0, w * 3);
      this.aPos.needsUpdate = this.aCol.needsUpdate = this.aMisc.needsUpdate = true;
    }
  }

  dispose(): void {
    this.mesh.removeFromParent();
    this.geo.dispose();
    (this.mesh.material as THREE.Material).dispose();
  }
}
