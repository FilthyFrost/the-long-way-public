/**
 * A fish's body that bends as a live fish bends (docs/V3/plan/fishing-fight.md §6): the model fishModel.ts makes —
 * its body, fins, tail and eyes, one unit long along +x with the head at +x, y up, the right side +z — baked into one
 * frame (its own copy of every geometry: the made model's are shared) and bent each frame side to side about its
 * spine. The bend is given as a curvature along the length (0 the tail's tip … 1 the snout); the spine is integrated
 * out from a pivot both ways, every vertex carried with the spine at its place along it, its normal turned with it.
 * A wave running down to the tail is a swim; the whole body curled into a C and flung the other way is a flop.
 *
 * A few thousand vertices rewritten from their rest pose: well under a tenth of a millisecond a frame.
 */
import * as THREE from 'three';

const BINS = 40;

interface Part {
  geo: THREE.BufferGeometry;
  rest: Float32Array;
  restN: Float32Array;
  /** each vertex's bin along the spine and the share into it */
  bin: Uint8Array;
  frac: Float32Array;
}

export class FishBody {
  /** the bent fish (its frame the model's); put it where it goes */
  readonly group = new THREE.Group();
  /** the spine's extent along x (the model's frame) */
  readonly x0: number;
  readonly x1: number;
  private readonly parts: Part[] = [];
  /** per bin edge: the spine's point (x, z) and its angle */
  private readonly px = new Float32Array(BINS + 1);
  private readonly pz = new Float32Array(BINS + 1);
  private readonly th = new Float32Array(BINS + 1);
  private readonly k = new Float32Array(BINS + 1);
  /** the body's section along it at rest (the first mesh: the lofted body): its top, its foot and its half-width, per bin */
  private readonly secTop = new Float32Array(BINS).fill(-Infinity);
  private readonly secBot = new Float32Array(BINS).fill(Infinity);
  private readonly secHalf = new Float32Array(BINS);
  /** its own copies of its materials once it is lit (fill): the shared ones are every other fish's of its kind too */
  private lit: { mat: THREE.ShaderMaterial; glow: THREE.Color; base: THREE.Color }[] | null = null;

  constructor(model: THREE.Object3D) {
    model.updateMatrixWorld(true);
    const inv = new THREE.Matrix4().copy(model.matrixWorld).invert();
    const m = new THREE.Matrix4();
    let x0 = Infinity;
    let x1 = -Infinity;
    const meshes: THREE.Mesh[] = [];
    model.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh) meshes.push(mesh);
    });
    const baked: { geo: THREE.BufferGeometry; mat: THREE.Material | THREE.Material[] }[] = [];
    for (const mesh of meshes) {
      const geo = mesh.geometry.clone();
      m.multiplyMatrices(inv, mesh.matrixWorld);
      geo.applyMatrix4(m);
      if (!geo.getAttribute('normal')) geo.computeVertexNormals();
      const pos = geo.getAttribute('position') as THREE.BufferAttribute;
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i);
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
      }
      baked.push({ geo, mat: mesh.material });
    }
    if (!Number.isFinite(x0)) {
      x0 = -0.5;
      x1 = 0.5;
    }
    this.x0 = x0;
    this.x1 = x1;
    const span = Math.max(1e-4, x1 - x0);
    for (const { geo, mat } of baked) {
      const pos = geo.getAttribute('position') as THREE.BufferAttribute;
      const nor = geo.getAttribute('normal') as THREE.BufferAttribute;
      pos.setUsage(THREE.DynamicDrawUsage);
      nor.setUsage(THREE.DynamicDrawUsage);
      const n = pos.count;
      const bin = new Uint8Array(n);
      const frac = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        const u = Math.max(0, Math.min(0.99999, (pos.getX(i) - x0) / span)) * BINS;
        bin[i] = Math.floor(u);
        frac[i] = u - Math.floor(u);
      }
      // (bent, it never reaches past a sphere round the middle as wide as it is long)
      geo.boundingSphere = new THREE.Sphere(new THREE.Vector3((x0 + x1) / 2, 0, 0), span * 0.75);
      const mesh = new THREE.Mesh(geo, mat);
      mesh.castShadow = true;
      mesh.userData.ownLook = true;
      this.group.add(mesh);
      this.parts.push({ geo, rest: (pos.array as Float32Array).slice(), restN: (nor.array as Float32Array).slice(), bin, frac });
      if (this.parts.length === 1)
        for (let i = 0; i < n; i++) {
          const b = bin[i];
          const y = pos.getY(i);
          if (y > this.secTop[b]) this.secTop[b] = y;
          if (y < this.secBot[b]) this.secBot[b] = y;
          this.secHalf[b] = Math.max(this.secHalf[b], Math.abs(pos.getZ(i)));
        }
    }
    // (a bin the body has no vertex in takes its neighbour's)
    for (let b = 1; b < BINS; b++)
      if (!Number.isFinite(this.secTop[b])) {
        this.secTop[b] = this.secTop[b - 1];
        this.secBot[b] = this.secBot[b - 1];
        this.secHalf[b] = this.secHalf[b - 1];
      }
    for (let b = BINS - 2; b >= 0; b--)
      if (!Number.isFinite(this.secTop[b])) {
        this.secTop[b] = this.secTop[b + 1];
        this.secBot[b] = this.secBot[b + 1];
        this.secHalf[b] = this.secHalf[b + 1];
      }
    this.pose(() => 0, 0.6);
  }

  /**
   * Lit as by a lamp held near it (0 none … about 0.5): its skin glows with its own colours, the rest with a grey — a
   * catch held up at night (fishing-feel.md §5). Its materials are copied the first time (sharing the scene's light).
   */
  fill(k: number): void {
    if (!this.lit) {
      if (k <= 0.001) return;
      this.lit = [];
      for (const o of this.group.children) {
        const mesh = o as THREE.Mesh;
        const src = mesh.material as THREE.ShaderMaterial;
        if (!mesh.isMesh || Array.isArray(src) || !src.isShaderMaterial || !src.uniforms?.uMapEmissive) continue;
        const mat = src.clone();
        const base = (src.uniforms.uEmissive.value as THREE.Color).clone();
        const glow = base.clone();
        // (the scene's light shared, only its own glow its own)
        mat.uniforms = { ...src.uniforms, uMapEmissive: { value: 0 }, uEmissive: { value: glow } };
        mesh.material = mat;
        this.lit.push({ mat, glow, base });
      }
    }
    for (const l of this.lit) {
      l.mat.uniforms.uMapEmissive.value = k;
      l.glow.copy(l.base).addScalar(k * 0.25);
    }
  }

  /** the share along the body (0 the tail's tip … 1 the snout) of a place along the model's x */
  uOf(x: number): number {
    return (x - this.x0) / Math.max(1e-4, this.x1 - this.x0);
  }

  /**
   * Bend it: `curv(u)` the bend at each share along the body (rad per unit of the model's length, + curls toward +z);
   * the spine stays put at the pivot (a share along it), straight along +x there.
   */
  pose(curv: (u: number) => number, pivot: number): void {
    const k = this.k;
    const dx = (this.x1 - this.x0) / BINS;
    for (let i = 0; i <= BINS; i++) k[i] = curv(i / BINS);
    const p = Math.max(0, Math.min(BINS, Math.round(pivot * BINS)));
    const px = this.px;
    const pz = this.pz;
    const th = this.th;
    px[p] = this.x0 + p * dx;
    pz[p] = 0;
    th[p] = 0;
    // (out toward the snout, then toward the tail)
    for (let i = p + 1; i <= BINS; i++) {
      const a = th[i - 1] + 0.5 * (k[i - 1] + k[i]) * dx;
      th[i] = a;
      const am = 0.5 * (th[i - 1] + a);
      px[i] = px[i - 1] + Math.cos(am) * dx;
      pz[i] = pz[i - 1] + Math.sin(am) * dx;
    }
    for (let i = p - 1; i >= 0; i--) {
      const a = th[i + 1] - 0.5 * (k[i + 1] + k[i]) * dx;
      th[i] = a;
      const am = 0.5 * (th[i + 1] + a);
      px[i] = px[i + 1] - Math.cos(am) * dx;
      pz[i] = pz[i + 1] - Math.sin(am) * dx;
    }
    for (const part of this.parts) {
      const pos = part.geo.getAttribute('position') as THREE.BufferAttribute;
      const nor = part.geo.getAttribute('normal') as THREE.BufferAttribute;
      const out = pos.array as Float32Array;
      const outN = nor.array as Float32Array;
      const rest = part.rest;
      const restN = part.restN;
      const n = pos.count;
      for (let v = 0; v < n; v++) {
        const b = part.bin[v];
        const f = part.frac[v];
        const o = v * 3;
        // the spine at the vertex's place along it, and the vertex's own offset from it
        const along = rest[o] - (this.x0 + (b + f) * dx);
        const a = th[b] + (th[b + 1] - th[b]) * f;
        const c = Math.cos(a);
        const s = Math.sin(a);
        const sx = px[b] + (px[b + 1] - px[b]) * f;
        const sz = pz[b] + (pz[b + 1] - pz[b]) * f;
        const z = rest[o + 2];
        out[o] = sx + along * c - z * s;
        out[o + 1] = rest[o + 1];
        out[o + 2] = sz + along * s + z * c;
        const nx = restN[o];
        const nz = restN[o + 2];
        outN[o] = nx * c - nz * s;
        outN[o + 1] = restN[o + 1];
        outN[o + 2] = nx * s + nz * c;
      }
      pos.needsUpdate = true;
      nor.needsUpdate = true;
    }
  }

  /** where the spine is at a share along the body (the model's frame: x, z) and which way it runs there */
  spineAt(u: number, out: { x: number; z: number; a: number }): { x: number; z: number; a: number } {
    const f0 = Math.max(0, Math.min(0.99999, u)) * BINS;
    const b = Math.floor(f0);
    const f = f0 - b;
    out.x = this.px[b] + (this.px[b + 1] - this.px[b]) * f;
    out.z = this.pz[b] + (this.pz[b + 1] - this.pz[b]) * f;
    out.a = this.th[b] + (this.th[b + 1] - this.th[b]) * f;
    return out;
  }

  /** the body's section at rest at a share along it (the model's frame): its top and foot (y), its half-width (z) */
  sectionAt(u: number): { top: number; bot: number; half: number } {
    const b = Math.max(0, Math.min(BINS - 1, Math.floor(u * BINS)));
    const top = Number.isFinite(this.secTop[b]) ? this.secTop[b] : 0.08;
    const bot = Number.isFinite(this.secBot[b]) ? this.secBot[b] : -0.08;
    return { top, bot, half: this.secHalf[b] || 0.04 };
  }

  dispose(): void {
    for (const p of this.parts) p.geo.dispose();
    for (const l of this.lit ?? []) l.mat.dispose();
    this.group.removeFromParent();
  }
}

/** a swim: a wave running down to the tail, growing toward it (amp: its size; phase: where the beat is, rad) */
export function swimCurve(amp: number, phase: number): (u: number) => number {
  return (u) => amp * Math.pow(1 - u, 1.3) * 6 * Math.sin(phase + u * 5.5);
}
