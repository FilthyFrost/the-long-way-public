/**
 * The waterfalls drawn (V5, docs/V3/nodes/V5-landforms.md; where they fall: core/world/earth/waterfalls.ts).
 *
 *   The falling water a ribbon down the face from the lip to the foot, standing off the rock a little more in the middle
 *   of its fall than at either end (it leaves the lip and comes back to the rock's foot), wider as it falls; painted as
 *   white water is: strands running down it at the speed of falling water, darker between them, its edges broken into
 *   threads, whiter and thicker toward its foot where it is all spray; lit on its face, glowing against the sun.
 *   Its pool at the foot a bowl of deep teal with the white of the water's landing on it, or, where the fall comes down
 *   into the river beside the road, only that white on the river.
 *   Its spray puffs of mist rising from the foot and drifting, the steam's own (scene/geothermal.ts steamMaterial).
 *
 * A place's falls one mesh, their pools another, their spray one instanced draw for all of them.
 */
import * as THREE from 'three';
import type { World } from '../../core/world/terrain';
import { TerrainPoint } from '../../core/world/terrain';
import { SpineSample } from '../../core/world/spine';
import { fallsOf, hasFalls, type Fall } from '../../core/world/earth/waterfalls';
import type { RenderCore } from '../render/core';
import { GLSL_COMMON, GLSL_FRAGMENT_PARS, globals } from '../render/shaderlib';
import { steamMaterial } from './geothermal';

const ACROSS = 6;

/** resample a path (x, y, z …) to points about `step` m apart along it */
function resample(path: readonly number[], step: number): number[] {
  const pts: number[] = [];
  const n = path.length / 3;
  let total = 0;
  const seg: number[] = [];
  for (let i = 0; i + 1 < n; i++) {
    const d = Math.hypot(path[i * 3 + 3] - path[i * 3], path[i * 3 + 4] - path[i * 3 + 1], path[i * 3 + 5] - path[i * 3 + 2]);
    seg.push(d);
    total += d;
  }
  const m = Math.max(2, Math.ceil(total / step));
  let i = 0;
  let acc = 0;
  for (let k = 0; k <= m; k++) {
    const want = (k / m) * total;
    while (i < seg.length - 1 && acc + seg[i] < want) acc += seg[i++];
    const t = seg[i] > 0 ? Math.min(1, (want - acc) / seg[i]) : 0;
    for (let c = 0; c < 3; c++) pts.push(path[i * 3 + c] + (path[i * 3 + 3 + c] - path[i * 3 + c]) * t);
  }
  return pts;
}

/** a piece's falling water as one mesh, about (ax, ay, az) */
function fallGeometry(falls: readonly Fall[], ax: number, ay: number, az: number): THREE.BufferGeometry {
  const pos: number[] = [];
  const nrm: number[] = [];
  const fa: number[] = [];
  const tier: number[] = [];
  const idx: number[] = [];
  for (const f of falls) {
    const pts = resample(f.path, 2.5);
    const n = pts.length / 3;
    const base = pos.length / 3;
    const axx = f.oz;
    const azz = -f.ox;
    let along = 0;
    for (let i = 0; i < n; i++) {
      if (i > 0) along += Math.hypot(pts[i * 3] - pts[i * 3 - 3], pts[i * 3 + 1] - pts[i * 3 - 2], pts[i * 3 + 2] - pts[i * 3 - 1]);
      const t = i / (n - 1);
      // (where the face eases the water spreads over a ledge and breaks white: a cascade's tier)
      const i0 = Math.max(0, i - 1);
      const i1 = Math.min(n - 1, i + 1);
      const run = Math.hypot(pts[i1 * 3] - pts[i0 * 3], pts[i1 * 3 + 2] - pts[i0 * 3 + 2]);
      const slope = Math.abs(pts[i0 * 3 + 1] - pts[i1 * 3 + 1]) / Math.max(0.1, run);
      const ease = Math.min(1, Math.max(0, (1.7 - slope) / 0.9));
      // (it stands off the rock: out from the lip as it leaves it, most in the middle of its fall, back at the foot)
      const gap = 0.9 + 3.2 * Math.pow(Math.sin(Math.PI * Math.min(1, t * 1.15)), 0.7) + 1.4 * Math.exp(-t * 9);
      const w = f.w * (1 + 1.1 * t) * (1 + 0.55 * ease) * (1 + 0.08 * Math.sin(t * 9 + f.seed * 30));
      // (a little sway of its own across the face as it falls)
      const sway = 0.12 * f.w * Math.sin(t * 4.1 + f.seed * 17);
      for (let j = 0; j <= ACROSS; j++) {
        const u = j / ACROSS;
        const c = (u - 0.5) * w + sway;
        pos.push(pts[i * 3] + f.ox * gap + axx * c - ax, pts[i * 3 + 1] - ay, pts[i * 3 + 2] + f.oz * gap + azz * c - az);
        nrm.push(f.ox, 0.25, f.oz);
        fa.push(u, along, f.w, f.seed);
        tier.push(ease);
      }
    }
    for (let i = 0; i + 1 < n; i++)
      for (let j = 0; j < ACROSS; j++) {
        const a = base + i * (ACROSS + 1) + j;
        const b = a + 1;
        const c = a + ACROSS + 1;
        const d = c + 1;
        idx.push(a, c, b, b, c, d);
      }
    // (its whole length, for the shader's foot: the last vertices' along)
    for (let k = base; k < pos.length / 3; k++) fa[k * 4 + 2] = along;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('aFall', new THREE.Float32BufferAttribute(fa, 4));
  g.setAttribute('aTier', new THREE.Float32BufferAttribute(tier, 1));
  g.setIndex(idx);
  g.computeBoundingSphere();
  return g;
}

function fallMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { ...globals },
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    vertexShader: /* glsl */ `
      #include <common>
      #include <logdepthbuf_pars_vertex>
      attribute vec4 aFall;
      attribute float aTier;
      varying vec3 vPos;
      varying vec3 vNormal;
      varying vec4 vFall;
      varying float vTier;
      void main() {
        vFall = aFall;
        vTier = aTier;
        vNormal = normalize(normal);
        vec4 w = modelMatrix * vec4(position, 1.0);
        vPos = w.xyz;
        gl_Position = projectionMatrix * viewMatrix * w;
        #include <logdepthbuf_vertex>
      }`,
    fragmentShader: /* glsl */ `
      ${GLSL_FRAGMENT_PARS}
      ${GLSL_COMMON}
      varying vec4 vFall;
      varying float vTier;
      void main() {
        #include <logdepthbuf_fragment>
        float u = vFall.x;
        float along = vFall.y;
        float len = max(vFall.z, 1.0);
        float seed = vFall.w;
        float t = along / len;
        // falling water: strands running down at its speed (faster as it falls), darker between them
        float speed = 7.0 + 9.0 * t;
        // (long strands: a streak runs tens of metres down before it breaks)
        vec2 q = vec2(u * 6.0 + seed * 37.0, (along - uTime * speed) * 0.025);
        float s1 = rtNoiseAt(q, 1.0).r;
        float s2 = rtNoiseAt(vec2(u * 15.0 + seed * 11.0, (along - uTime * speed * 1.15) * 0.05), 1.0).g;
        float strand = s1 * 0.62 + s2 * 0.38;
        // its edges broken into threads; whiter and thicker toward its foot, all spray there
        float edge = smoothstep(0.0, 0.16 + 0.2 * s2, u) * smoothstep(1.0, 0.84 - 0.2 * s1, u);
        float body = edge * (0.42 + 0.58 * smoothstep(0.3, 0.7, strand)) * (0.75 + 0.25 * smoothstep(0.0, 0.08, t));
        body = max(body, edge * smoothstep(0.78, 1.0, t) * 0.9);
        // (over a ledge: spread, broken white)
        body = max(body, edge * vTier * (0.55 + 0.4 * s2));
        if (body < 0.03) discard;
        vec3 N = normalize(vNormal);
        float sh = rtShadow(vPos, N);
        float lam = clamp(dot(N, uSunDir) * 0.5 + 0.5, 0.0, 1.0);
        vec3 water = mix(vec3(0.5, 0.64, 0.7), vec3(0.97, 0.98, 1.0), clamp(smoothstep(0.38, 0.72, strand) + 0.35 * t + 0.6 * vTier, 0.0, 1.0));
        vec3 col = water * (uSkyColor * 0.85 + uBounceColor * 0.2 + uSunColor * (0.25 + 0.55 * lam) * sh);
        // seen against the sun, falling water glows
        vec3 V = normalize(cameraPosition - vPos);
        col += uSunColor * pow(max(dot(-V, uSunDir), 0.0), 5.0) * 0.45 * sh;
        col = rtFog(col, vPos, cameraPosition);
        gl_FragColor = vec4(col, clamp(body * 0.92, 0.0, 1.0));
      }`,
  });
}

// ---------------------------------------------------------------------------------------------- the pools

const PRINGS = 6;
const PSEG = 40;

function poolGeometry(world: World, falls: readonly Fall[], ax: number, ay: number, az: number): THREE.BufferGeometry {
  const tp = new TerrainPoint();
  const pos: number[] = [];
  const pr: number[] = [];
  const idx: number[] = [];
  for (const f of falls) {
    const n = f.path.length / 3;
    const fx = f.path[(n - 1) * 3] + f.ox * 2.5;
    const fz = f.path[(n - 1) * 3 + 2] + f.oz * 2.5;
    const own = f.pool === -Infinity;
    const R = f.w * 1.25 + 4;
    const base = pos.length / 3;
    for (let j = 0; j <= PRINGS; j++) {
      const rho = j / PRINGS;
      for (let k = 0; k < PSEG; k++) {
        const a = (k / PSEG) * Math.PI * 2;
        const w = 1 + 0.14 * Math.sin(3 * a + f.seed * 20) + 0.07 * Math.sin(5 * a + f.seed * 50);
        const x = fx + Math.cos(a) * R * rho * w;
        const z = fz + Math.sin(a) * R * rho * w;
        world.shape(x, z, tp);
        const y = own ? Math.max(tp.bed, f.path[(n - 1) * 3 + 1] - 0.4) + 0.25 : f.pool + 0.06;
        pos.push(x - ax, y - ay, z - az);
        pr.push(rho, own ? 1 : 0, f.seed, a);
      }
    }
    for (let j = 0; j < PRINGS; j++)
      for (let k = 0; k < PSEG; k++) {
        const a = base + j * PSEG + k;
        const b = base + j * PSEG + ((k + 1) % PSEG);
        idx.push(a, b, a + PSEG, b, b + PSEG, a + PSEG);
      }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aPool', new THREE.Float32BufferAttribute(pr, 4));
  g.setIndex(idx);
  g.computeBoundingSphere();
  return g;
}

function poolMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { ...globals },
    transparent: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -4,
    vertexShader: /* glsl */ `
      #include <common>
      #include <logdepthbuf_pars_vertex>
      attribute vec4 aPool;
      varying vec3 vPos;
      varying vec3 vNormal;
      varying vec4 vPool;
      void main() {
        vPool = aPool;
        vNormal = vec3(0.0, 1.0, 0.0);
        vec4 w = modelMatrix * vec4(position, 1.0);
        vPos = w.xyz;
        gl_Position = projectionMatrix * viewMatrix * w;
        #include <logdepthbuf_vertex>
      }`,
    fragmentShader: /* glsl */ `
      ${GLSL_FRAGMENT_PARS}
      ${GLSL_COMMON}
      varying vec4 vPool;
      void main() {
        #include <logdepthbuf_fragment>
        vec2 w = rtWorldXZ(vPos);
        float rho = vPool.x;
        float own = vPool.y;
        float seed = vPool.z;
        float n = rtNoiseAt(w + seed * 71.0 + vec2(uTime * 0.4, uTime * 0.31), 3.0).r;
        float n2 = rtNoiseAt(w + seed * 13.0 - vec2(uTime * 0.25, 0.0), 1.2).g;
        // the white where the water lands, rings of it running out and breaking up
        float land = 1.0 - smoothstep(0.12, 0.42 + 0.15 * n, rho);
        float rings = smoothstep(0.6, 0.85, sin((rho * 4.0 - uTime * 0.6 + seed * 7.0) * 6.2832 + n * 3.0) * 0.5 + 0.5) * (1.0 - smoothstep(0.4, 0.95, rho));
        float foam = max(land, rings * smoothstep(0.35, 0.7, n2));
        // its own pool: deep teal in the middle, paler to its stony edge
        vec3 deep = vec3(0.02, 0.2, 0.24);
        vec3 shallow = vec3(0.16, 0.46, 0.44);
        vec3 col = mix(deep, shallow, smoothstep(0.3, 0.95, rho));
        float sh = rtShadow(vPos, vec3(0.0, 1.0, 0.0));
        vec3 lit = col * (uSkyColor * 0.9 + uSunColor * 0.35 * sh);
        vec3 V = normalize(cameraPosition - vPos);
        float fres = pow(1.0 - clamp(V.y, 0.0, 1.0), 4.0);
        lit = mix(lit, mix(uSkyColor * 1.3, uFogColor, 0.3), fres * 0.6);
        vec3 white = vec3(0.95, 0.97, 0.98) * (uSkyColor * 0.8 + uSunColor * 0.5 * sh);
        lit = mix(lit, white, foam);
        float alpha = own > 0.5 ? 1.0 - smoothstep(0.88, 1.0, rho + (n - 0.5) * 0.1) : foam * (1.0 - smoothstep(0.8, 1.0, rho));
        if (alpha < 0.02) discard;
        lit = rtFog(lit, vPos, cameraPosition);
        gl_FragColor = vec4(lit, alpha);
      }`,
  });
}

// ---------------------------------------------------------------------------------------------- the spray

const MOST_PUFFS = 1600;

const hash = (a: number, b: number): number => {
  let h = Math.imul(a | 0, 0x9e3779b1) ^ Math.imul((b | 0) + 0x632be5ab, 0x85ebca77);
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  h ^= h >>> 13;
  return (h >>> 0) / 4294967296;
};

/** a fall's spray: the steam's rows (x, y, z, kind, phase, life, size, rise, thick, burst, seed, radius) */
function sprayOf(f: Fall, out: number[][]): void {
  const n = f.path.length / 3;
  const x = f.path[(n - 1) * 3] + f.ox * 3;
  const y = (f.pool === -Infinity ? f.path[(n - 1) * 3 + 1] : f.pool) + 0.5;
  const z = f.path[(n - 1) * 3 + 2] + f.oz * 3;
  const count = Math.round(10 + f.h / 5 + f.w);
  for (let i = 0; i < count; i++) {
    const k = f.seed * 1e6;
    out.push([x, y, z, 0, (i + hash(k, i)) / count, 7 * (0.8 + 0.4 * hash(i, k + 1)), (3.5 + f.w * 0.42) * (0.7 + 0.6 * hash(i, k + 2)), 5 + f.h * 0.16, 0.38, 0, f.seed, f.w * 0.9]);
  }
}

// ---------------------------------------------------------------------------------------------- the view

interface Live {
  falls: readonly Fall[];
  meshes: THREE.Mesh[];
  anchor: [number, number, number];
}

/** the waterfalls of the places near the road (ModGame updates it with the road's distance) */
export class WaterfallView {
  private readonly live = new Map<number, Live>();
  private readonly fallMat = fallMaterial();
  private readonly poolMat = poolMaterial();
  private readonly sprayMat = steamMaterial();
  private readonly spray: THREE.Mesh;
  private readonly sprayGeo: THREE.InstancedBufferGeometry;
  private readonly aVent = new THREE.InstancedBufferAttribute(new Float32Array(MOST_PUFFS * 4), 4);
  private readonly aPuff = new THREE.InstancedBufferAttribute(new Float32Array(MOST_PUFFS * 4), 4);
  private readonly aMore = new THREE.InstancedBufferAttribute(new Float32Array(MOST_PUFFS * 4), 4);
  private readonly tp = new TerrainPoint();
  private readonly st = new SpineSample();
  private planS = NaN;
  /** how many falls and puffs are drawn (the harness asks) */
  falls = 0;
  puffs = 0;

  constructor(
    private readonly core: RenderCore,
    private readonly world: World,
  ) {
    this.sprayGeo = new THREE.InstancedBufferGeometry();
    const quad = new THREE.PlaneGeometry(1, 1);
    this.sprayGeo.setIndex(quad.index);
    this.sprayGeo.setAttribute('position', quad.getAttribute('position'));
    this.sprayGeo.setAttribute('aVent', this.aVent);
    this.sprayGeo.setAttribute('aPuff', this.aPuff);
    this.sprayGeo.setAttribute('aMore', this.aMore);
    this.sprayGeo.instanceCount = 0;
    this.spray = new THREE.Mesh(this.sprayGeo, this.sprayMat);
    this.spray.name = 'waterfalls:spray';
    this.spray.frustumCulled = false;
    this.spray.renderOrder = 5;
    this.spray.visible = false;
    core.scene.add(this.spray);
    core.onRebase(() => {
      for (const l of this.live.values()) for (const m of l.meshes) core.place(m, l.anchor[0], l.anchor[1], l.anchor[2]);
      (this.sprayMat.uniforms.uOrigin.value as THREE.Vector3).copy(core.origin);
    });
    (this.sprayMat.uniforms.uOrigin.value as THREE.Vector3).copy(core.origin);
  }

  /** the falls of the places in reach (the harness asks) */
  near(): Fall[] {
    const out: Fall[] = [];
    for (const l of this.live.values()) out.push(...l.falls);
    return out;
  }

  update(s: number): void {
    const earth = this.world.earth;
    if (!earth || Math.abs(s - this.planS) < 150) return;
    this.planS = s;
    const keep = new Set<number>();
    let changed = false;
    for (const p of earth.pieces) {
      if (p.end < s - 2500 || p.start > s + 5000 || !hasFalls(p)) continue;
      keep.add(p.index);
      if (this.live.has(p.index)) continue;
      const falls = fallsOf(this.world, p, this.tp, this.st);
      const meshes: THREE.Mesh[] = [];
      const anchor: [number, number, number] = falls.length ? [falls[0].path[0], falls[0].path[1], falls[0].path[2]] : [0, 0, 0];
      if (falls.length) {
        const water = new THREE.Mesh(fallGeometry(falls, anchor[0], anchor[1], anchor[2]), this.fallMat);
        water.name = 'waterfalls:water';
        water.renderOrder = 4;
        const pools = new THREE.Mesh(poolGeometry(this.world, falls, anchor[0], anchor[1], anchor[2]), this.poolMat);
        pools.name = 'waterfalls:pools';
        pools.renderOrder = 3;
        for (const m of [water, pools]) {
          this.core.place(m, anchor[0], anchor[1], anchor[2]);
          this.core.scene.add(m);
          meshes.push(m);
        }
      }
      this.live.set(p.index, { falls, meshes, anchor });
      changed = true;
    }
    for (const [k, l] of this.live) {
      if (keep.has(k)) continue;
      for (const m of l.meshes) {
        this.core.scene.remove(m);
        m.geometry.dispose();
      }
      this.live.delete(k);
      changed = true;
    }
    if (changed) this.refillSpray();
  }

  private refillSpray(): void {
    const rows: number[][] = [];
    let falls = 0;
    for (const l of this.live.values()) {
      for (const f of l.falls) sprayOf(f, rows);
      falls += l.falls.length;
    }
    const n = Math.min(MOST_PUFFS, rows.length);
    const V = this.aVent.array as Float32Array;
    const P = this.aPuff.array as Float32Array;
    const M = this.aMore.array as Float32Array;
    for (let i = 0; i < n; i++) {
      const r = rows[i];
      V.set([r[0], r[1], r[2], r[3]], i * 4);
      P.set([r[4], r[5], r[6], r[7]], i * 4);
      M.set([r[8], r[9], r[10], r[11]], i * 4);
    }
    for (const a of [this.aVent, this.aPuff, this.aMore]) a.needsUpdate = true;
    this.sprayGeo.instanceCount = n;
    this.spray.visible = n > 0;
    this.falls = falls;
    this.puffs = n;
  }
}
