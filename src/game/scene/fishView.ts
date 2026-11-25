/**
 * The fish (V7, docs/V3/nodes/V7-life.md): the rivers, the lakes, the streams beside the road and the sea's shallows
 * had not a fish in them. Now every shallow water near the car has its schools: in a cell of CELL m with water
 * 0.4 to 6 m deep over its middle (not frozen, not salt) a school of five to fourteen, of the water's kind — a cold
 * river's dark olive trout, a warm lake's golden carp, the sea's blue-grey fish, a warm sea's bright small ones; each
 * swimming its slow loop under the surface, its tail beating, the school wandering together; and every ten or twenty
 * seconds one of them leaps out of the water in an arc, silver, and falls back, a ring of white spreading where it
 * left the water and where it came back.
 *
 * Drawn: every fish and every ring one instanced draw, a quad each whose shape the fragment shader cuts — a fish's
 * body and its tail, or a ring of white water. A fish under the water lies flat a hand under the surface, seen through
 * it: dark, tinted by the water, its edge soft; a fish in the air stands upright along its arc, lit.
 */
import * as THREE from 'three';
import type { World } from '../../core/world/terrain';
import { TerrainPoint } from '../../core/world/terrain';
import type { RenderCore } from '../render/core';
import { GLSL_COMMON, GLSL_FRAGMENT_PARS, globals } from '../render/shaderlib';

const CELL = 18;

/**
 * Waters where another system has fish of its own, which would be two kinds of fish in one water (docs/V3/plan/fishing.md:
 * the fishing module's pond, where every shadow is a fish one can catch): no school of these is drawn inside such a ring.
 * The system keeps the list itself (world metres), and empties it when it is gone from there.
 */
export const FISH_HUSH: { x: number; z: number; r: number }[] = [];

function hushed(x: number, z: number): boolean {
  for (let i = 0; i < FISH_HUSH.length; i++) {
    const h = FISH_HUSH[i];
    const dx = x - h.x;
    const dz = z - h.z;
    if (dx * dx + dz * dz < h.r * h.r) return true;
  }
  return false;
}
const RING = 4;
const MOST = 900;

const hash = (a: number, b: number, c: number): number => {
  let h = Math.imul(a | 0, 0x9e3779b1) ^ Math.imul((b | 0) + 0x7f4a7c15, 0x85ebca77) ^ Math.imul((c | 0) + 0x165667b1, 0xc2b2ae3d);
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  h ^= h >>> 13;
  return (h >>> 0) / 4294967296;
};

interface School {
  key: string;
  x: number;
  z: number;
  level: number;
  n: number;
  len: number;
  color: [number, number, number];
  /** its loop: radius (m), how fast (rad/s), which way */
  r: number;
  w: number;
  /** how frightened it is: 1 just now … 0 at ease (it swims fast while it is) */
  flee: number;
  seed: number;
  /** the next leap (s on the clock) */
  leap: number;
  /** the fish that leaps (index), when it left (s), and where its arc began and ends */
  jumper: number;
  jumpAt: number;
  jx0: number;
  jz0: number;
  jx1: number;
  jz1: number;
}

/** the fish near the car (ModGame updates it every frame) */
export class FishView {
  /** a school a cell, null where the cell holds none (asked once while it is near) */
  private readonly schools = new Map<string, School | null>();
  private readonly geo: THREE.InstancedBufferGeometry;
  private readonly mesh: THREE.Mesh;
  private readonly aAt = new THREE.InstancedBufferAttribute(new Float32Array(MOST * 4), 4);
  private readonly aShape = new THREE.InstancedBufferAttribute(new Float32Array(MOST * 4), 4);
  private readonly aTint = new THREE.InstancedBufferAttribute(new Float32Array(MOST * 4), 4);
  private readonly tp = new TerrainPoint();
  private lastX = Infinity;
  private lastZ = Infinity;
  private clock = 0;
  /** how many fish and rings are drawn (the harness asks) */
  fish = 0;

  constructor(
    private readonly core: RenderCore,
    private readonly world: World,
  ) {
    this.geo = new THREE.InstancedBufferGeometry();
    const quad = new THREE.PlaneGeometry(1, 1);
    this.geo.setIndex(quad.index);
    this.geo.setAttribute('position', quad.getAttribute('position'));
    this.geo.setAttribute('aAt', this.aAt);
    this.geo.setAttribute('aShape', this.aShape);
    this.geo.setAttribute('aTint', this.aTint);
    this.geo.instanceCount = 0;
    this.mesh = new THREE.Mesh(this.geo, fishMaterial());
    this.mesh.name = 'water:fish';
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 6;
    core.scene.add(this.mesh);
  }

  /** the school of a cell, or null where there is no shallow open water over its middle */
  private schoolOf(i: number, j: number, warm: number): School | null {
    const seed = this.world.seed | 0;
    const h0 = hash(i, j, seed);
    if (h0 > 0.75) return null;
    const x = (i + 0.2 + 0.6 * hash(i, j, seed + 1)) * CELL;
    const z = (j + 0.2 + 0.6 * hash(i, j, seed + 2)) * CELL;
    const tp = this.tp;
    this.world.shape(x, z, tp);
    const depth = tp.wl - tp.bed;
    if (!(tp.wkind >= 1) || depth < 0.4 || depth > 6 || tp.frozen > 0.2 || tp.bridge > 0.05) return null;
    // (none where the water is the road's: a ford)
    if (Math.abs(tp.d) < 6) return null;
    const sea = tp.wkind === 3;
    const k = hash(i, j, seed + 3);
    let color: [number, number, number];
    let len: number;
    if (sea && warm > 22) {
      // a warm sea's bright small fish
      const pal: [number, number, number][] = [[0.05, 0.25, 0.6], [0.75, 0.6, 0.05], [0.7, 0.25, 0.1], [0.1, 0.5, 0.5]];
      color = pal[Math.floor(k * pal.length)];
      len = 0.22 + 0.16 * hash(i, j, seed + 4);
    } else if (sea) {
      color = [0.16, 0.22, 0.27];
      len = 0.35 + 0.3 * hash(i, j, seed + 4);
    } else if (warm > 14 && tp.wkind === 1) {
      // a warm lake's carp: golden, now and then a red and white one
      color = k < 0.15 ? [0.75, 0.3, 0.12] : [0.42, 0.3, 0.12];
      len = 0.45 + 0.35 * hash(i, j, seed + 4);
    } else {
      color = [0.17, 0.19, 0.12];
      len = 0.28 + 0.3 * hash(i, j, seed + 4);
    }
    return {
      key: `${i},${j}`,
      x,
      z,
      level: tp.wl,
      n: 5 + Math.floor(10 * hash(i, j, seed + 5)),
      len,
      color,
      r: 2 + 4 * hash(i, j, seed + 6),
      flee: 0,
      w: (0.12 + 0.25 * hash(i, j, seed + 7)) * (hash(i, j, seed + 8) < 0.5 ? 1 : -1),
      seed: hash(i, j, seed + 9),
      leap: this.clock + 3 + 14 * hash(i, j, seed + 10),
      jumper: -1,
      jumpAt: 0,
      jx0: 0,
      jz0: 0,
      jx1: 0,
      jz1: 0,
    };
  }

  /** dt (s); the warmth of the place's sea level (°C) for its fish */
  update(dt: number, warm: number): void {
    dt = Math.min(dt, 0.1);
    this.clock += dt;
    const cam = this.core.camera;
    const o = this.core.origin;
    // (V10) a school is shy: someone near it on the bank or in the water, and it darts off, back a while after
    {
      const px = cam.position.x + o.x;
      const py = cam.position.y + o.y;
      const pz = cam.position.z + o.z;
      for (const sc of this.schools.values()) {
        if (!sc) continue;
        const dx = sc.x - px;
        const dz = sc.z - pz;
        const d = Math.hypot(dx, dz);
        if (d < 7.5 && py - sc.level < 3.5) {
          const k = (1 - d / 7.5) * 9 * dt;
          sc.x += (dx / (d || 1)) * k;
          sc.z += (dz / (d || 1)) * k;
          sc.flee = 1;
        } else if (sc.flee > 0) sc.flee = Math.max(0, sc.flee - dt * 0.25);
      }
    }
    const cx = cam.position.x + o.x;
    const cz = cam.position.z + o.z;
    // the cells round the camera, asked again when it has moved a little
    if (Math.abs(cx - this.lastX) + Math.abs(cz - this.lastZ) > 6) {
      this.lastX = cx;
      this.lastZ = cz;
      const ci = Math.floor(cx / CELL);
      const cj = Math.floor(cz / CELL);
      const keep = new Set<string>();
      for (let j = cj - RING; j <= cj + RING; j++)
        for (let i = ci - RING; i <= ci + RING; i++) {
          const key = `${i},${j}`;
          keep.add(key);
          if (this.schools.has(key)) continue;
          this.schools.set(key, this.schoolOf(i, j, warm));
        }
      for (const k of [...this.schools.keys()]) if (!keep.has(k)) this.schools.delete(k);
    }
    const A = this.aAt.array as Float32Array;
    const S = this.aShape.array as Float32Array;
    const T = this.aTint.array as Float32Array;
    let n = 0;
    const t = this.clock;
    const put = (x: number, y: number, z: number, yaw: number, len: number, mode: number, pitch: number, wig: number, r: number, g: number, b: number, a: number): void => {
      if (n >= MOST) return;
      const q = n * 4;
      A[q] = x - o.x;
      A[q + 1] = y - o.y;
      A[q + 2] = z - o.z;
      A[q + 3] = yaw;
      S[q] = len;
      S[q + 1] = mode;
      S[q + 2] = pitch;
      S[q + 3] = wig;
      T[q] = r;
      T[q + 1] = g;
      T[q + 2] = b;
      T[q + 3] = a;
      n++;
    };
    for (const s of this.schools.values()) {
      if (!s || (FISH_HUSH.length && hushed(s.x, s.z))) continue;
      // (the school wanders together about its cell's middle)
      const sx = s.x + Math.sin(t * 0.05 + s.seed * 30) * 3;
      const sz = s.z + Math.cos(t * 0.04 + s.seed * 17) * 3;
      // a leap now and then
      if (s.jumper < 0 && t > s.leap) {
        s.jumper = Math.floor(s.seed * 997) % s.n;
        s.jumpAt = t;
      }
      for (let i = 0; i < s.n; i++) {
        const a = t * s.w * (1 + 3 * s.flee) + i * 0.53 + s.seed * 6.283;
        const ri = s.r * (0.6 + 0.4 * Math.sin(i * 1.7 + s.seed * 9));
        const x = sx + Math.cos(a) * ri;
        const z = sz + Math.sin(a) * ri * 0.8;
        const yaw = Math.atan2(-Math.sin(a) * Math.sign(s.w), Math.cos(a) * Math.sign(s.w) * 0.8);
        if (i === s.jumper) {
          const u = (t - s.jumpAt) / 0.9;
          if (u < 0) continue;
          if (u === 0 || s.jx0 === 0) {
            s.jx0 = x;
            s.jz0 = z;
            s.jx1 = x + Math.sin(yaw) * 2.2;
            s.jz1 = z + Math.cos(yaw) * 2.2;
          }
          if (u < 1) {
            // the arc: out, over and back in; silver, upright along it
            const jx = s.jx0 + (s.jx1 - s.jx0) * u;
            const jz = s.jz0 + (s.jz1 - s.jz0) * u;
            const jy = s.level + 4 * u * (1 - u) * (0.5 + s.len * 1.2);
            const pitch = Math.atan2((1 - 2 * u) * (0.5 + s.len * 1.2) * 4, 2.2);
            put(jx, jy, jz, Math.atan2(s.jx1 - s.jx0, s.jz1 - s.jz0), s.len * 1.15, 1, pitch, t * 9, 0.75, 0.78, 0.8, 1);
          }
          // the rings where it left the water and where it came back
          const ring = (age: number, rx: number, rz: number): void => {
            if (age < 0 || age > 1.6) return;
            put(rx, s.level + 0.03, rz, 0, 0.3 + age * 1.6, 2, 0, 0, 0.95, 0.97, 0.98, 1 - age / 1.6);
          };
          ring(u * 0.9, s.jx0, s.jz0);
          ring((u - 1) * 0.9, s.jx1, s.jz1);
          if (u > 2.8) {
            s.jumper = -1;
            s.jx0 = 0;
            s.leap = t + 8 + 16 * ((s.seed * 113.7 + t * 0.37) % 1);
          }
          continue;
        }
        // seen through the water: drawn on its surface (the water writes its depth: under it they were hidden), dark and
        // tinted, as a fish a hand under it looks
        put(x, s.level + 0.025, z, yaw, s.len * 1.15 * (0.85 + 0.3 * Math.sin(i * 2.3 + s.seed)), 0, 0, t * 6 + i, s.color[0], s.color[1], s.color[2], 0.72);
      }
    }
    for (const a of [this.aAt, this.aShape, this.aTint]) a.needsUpdate = true;
    this.geo.instanceCount = n;
    this.mesh.visible = n > 0;
    this.fish = n;
  }
}

function fishMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { ...globals },
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -4,
    vertexShader: /* glsl */ `
      #include <common>
      #include <logdepthbuf_pars_vertex>
      attribute vec4 aAt;     // where (render origin), its heading
      attribute vec4 aShape;  // its length, mode (0 under the water, 1 in the air, 2 a ring), its pitch, its tail's phase
      attribute vec4 aTint;
      varying vec3 vPos;
      varying vec3 vNormal;
      varying vec2 vUv;
      varying vec4 vTint;
      varying float vMode;
      void main() {
        vec2 q = position.xy;
        vUv = q;
        vTint = aTint;
        vMode = aShape.y;
        float L = aShape.x;
        vec3 local;
        if (aShape.y < 1.5) {
          // a fish: x across its body (a third of its length), y along it; its tail beats
          float along = q.y;
          float wig = sin(aShape.w - along * 3.0) * 0.12 * smoothstep(0.0, -0.5, along);
          vec3 body = vec3(q.x * 0.36 + wig, 0.0, along) * L;
          if (aShape.y > 0.5) {
            // in the air: upright along its arc
            float p = aShape.z;
            body = vec3(0.0, q.x * 0.36 * L, 0.0) + vec3(wig * L, 0.0, 0.0) + vec3(0.0, sin(p), cos(p)) * along * L;
          }
          local = body;
        } else {
          // a ring lying on the water
          local = vec3(q.x, 0.0, q.y) * L * 2.0;
        }
        float c = cos(aAt.w);
        float s = sin(aAt.w);
        vec3 w = vec3(local.x * c + local.z * s, local.y, -local.x * s + local.z * c);
        vPos = aAt.xyz + w;
        vNormal = vec3(0.0, 1.0, 0.0);
        gl_Position = projectionMatrix * viewMatrix * vec4(vPos, 1.0);
        #include <logdepthbuf_vertex>
      }`,
    fragmentShader: /* glsl */ `
      ${GLSL_FRAGMENT_PARS}
      ${GLSL_COMMON}
      varying vec2 vUv;
      varying vec4 vTint;
      varying float vMode;
      void main() {
        #include <logdepthbuf_fragment>
        vec2 q = vUv;
        float a;
        vec3 col;
        if (vMode < 1.5) {
          // a body and a tail, cut out of the quad
          float y = q.y;
          float body = 1.0 - smoothstep(0.85, 1.0, length(vec2(q.x / 0.48, (y - 0.06) / 0.4)));
          float tail = step(-0.5, y) * step(y, -0.28) * step(abs(q.x), (-0.28 - y) * 1.9 + 0.04);
          a = max(body, tail);
          if (a < 0.05) discard;
          if (vMode < 0.5) {
            // seen through the water: dark, the water's tint over it, soft
            col = vTint.rgb * (uSkyColor * 0.35 + uSunColor * 0.15);
            a *= vTint.a;
          } else {
            // in the air: silver, lit, a darker back
            col = mix(vTint.rgb * 0.55, vTint.rgb, smoothstep(-0.2, 0.3, q.x)) * (uSkyColor * 0.7 + uSunColor * 0.8);
          }
        } else {
          // a ring of white water spreading
          // (broken by the water's own ripples: no ring of spray is a drawn ellipse)
          float r = length(q) * 2.0 + (rtNoiseAt(vPos.xz * 3.0 + vTint.a * 7.0, 1.0).r - 0.5) * 0.22;
          a = smoothstep(0.6, 0.78, r) * (1.0 - smoothstep(0.82, 1.0, r)) * vTint.a * (0.55 + 0.45 * rtNoiseAt(vPos.xz * 5.0, 1.0).g);
          if (a < 0.02) discard;
          col = vTint.rgb * (uSkyColor * 0.8 + uSunColor * 0.5);
        }
        col = rtFog(col, vPos, cameraPosition);
        gl_FragColor = vec4(col, a);
      }`,
  });
}
