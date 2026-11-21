/**
 * The birds of the sky (V7, docs/V3/nodes/V7-life.md): flocks far off over the land, where the life by the road
 * (game/modcar/v3/life) keeps to the few hundred metres round the car and a bird or two in a cell of four — the sky
 * over every place was empty. Now each place has the flocks its country and its hour would have:
 *
 *   murmuration  starlings at dusk and at dawn over open country and marsh in the cold half of the year: a few hundred
 *                birds in one body that stretches, folds and rolls over as it drifts;
 *   skein        geese or cranes in spring and autumn over water and open land: a V of a dozen to forty, high, crossing
 *                the sky slowly, its arms rippling;
 *   gulls        over a coast and a big lake: a score wheeling on the wind, gliding more than they beat;
 *   swifts       over warm country on a summer's morning and evening: dark crescents darting high in loose circles;
 *   egrets       a line of white birds low over a warm wet country going home at dusk;
 *   parrots      a quick bright flock over a warm wood;
 *   ravens       a few black birds wheeling over a dry or a high country.
 *
 * Each a flock of its own path: born some hundreds of metres off where the eye looks, carried across the sky, gone
 * when it is far behind or its while is over, another born after it. Every bird of every flock one instanced draw: a
 * chevron of two wings beating at its own rate (a glider's held level), turned to its heading, drawn never smaller than
 * a pixel or two, dark against the sky (a white one lit by the sun), in the air's haze.
 */
import * as THREE from 'three';
import type { World } from '../../core/world/terrain';
import { TerrainPoint } from '../../core/world/terrain';
import type { RenderCore } from '../render/core';
import { GLSL_COMMON, GLSL_FRAGMENT_PARS, globals } from '../render/shaderlib';

type Kind = 'murmuration' | 'skein' | 'gulls' | 'swifts' | 'egrets' | 'parrots' | 'ravens';

interface Spec {
  count: readonly [number, number];
  /** wing span (m), beats a second (0: it glides most of the time), speed (m/s), height over the land (m) */
  span: number;
  flap: number;
  speed: readonly [number, number];
  height: readonly [number, number];
  /** the colour of its back (linear), and how much the sun lights it (a white bird's) */
  color: readonly [number, number, number];
  lit: number;
  /** how far off it is born (m) */
  far: readonly [number, number];
}

const SPECS: Record<Kind, Spec> = {
  murmuration: { count: [250, 600], span: 0.4, flap: 7, speed: [3, 6], height: [40, 130], color: [0.035, 0.035, 0.045], lit: 0.05, far: [380, 1100] },
  skein: { count: [12, 40], span: 1.6, flap: 2.6, speed: [11, 15], height: [140, 380], color: [0.09, 0.08, 0.075], lit: 0.12, far: [450, 1400] },
  gulls: { count: [10, 28], span: 1.2, flap: 0, speed: [5, 9], height: [30, 110], color: [0.75, 0.77, 0.8], lit: 0.9, far: [180, 700] },
  swifts: { count: [20, 50], span: 0.42, flap: 9, speed: [14, 22], height: [70, 200], color: [0.03, 0.03, 0.035], lit: 0.03, far: [200, 600] },
  egrets: { count: [6, 18], span: 1.0, flap: 2.2, speed: [8, 11], height: [18, 45], color: [0.86, 0.87, 0.84], lit: 1, far: [220, 700] },
  parrots: { count: [8, 22], span: 0.6, flap: 6, speed: [12, 16], height: [25, 70], color: [0.08, 0.32, 0.12], lit: 0.4, far: [160, 500] },
  ravens: { count: [3, 8], span: 1.2, flap: 0, speed: [5, 9], height: [60, 180], color: [0.03, 0.03, 0.04], lit: 0.05, far: [220, 700] },
};

/** the flocks a place has at an hour of its month, and how likely each (0 … 1) */
function kindsOf(world: World, s: number, hour: number): [Kind, number][] {
  const p = world.earth?.pieces.find((q) => q.start <= s && q.end > s);
  const sc = p?.kind === 'scene' ? p.scene?.place : undefined;
  if (!sc) return [['ravens', 0.3]];
  const m = sc.macro;
  const st = sc.look.efg.struct;
  const month = m.month;
  const warm = m.tSea;
  const open = st === 'grassland' || st === 'farmland' || st === 'savanna' || st === 'shrubland' || st === 'tundra' || st === 'woodland';
  const wet = m.water === 'wetland' || m.water === 'lake' || m.water === 'river';
  const coast = m.water === 'coast';
  const dusk = hour > 16.6 && hour < 19.6;
  const dawn = hour > 5.6 && hour < 8;
  const day = hour > 6.5 && hour < 18.5;
  const cold = month >= 9 || month <= 3;
  const passage = (month >= 3 && month <= 5) || (month >= 9 && month <= 11);
  const out: [Kind, number][] = [];
  if ((open || wet) && warm < 20 && (dusk || dawn) && cold) out.push(['murmuration', 0.85]);
  if ((open || wet || coast) && st !== 'desert' && st !== 'ice' && day && (passage || st === 'tundra')) out.push(['skein', 0.6]);
  if (coast && day) out.push(['gulls', 0.95]);
  if (m.water === 'lake' && day) out.push(['gulls', 0.4]);
  if (warm > 8 && month >= 5 && month <= 8 && (hour > 5.5 && hour < 9.5 || hour > 17 && hour < 20.8)) out.push(['swifts', 0.7]);
  if (warm > 16 && (wet || coast) && hour > 15.5 && hour < 19.2) out.push(['egrets', 0.75]);
  if (warm > 19 && (st === 'closed_forest' || st === 'open_forest' || st === 'woodland') && day) out.push(['parrots', 0.6]);
  if ((st === 'desert' || st === 'bare' || m.base > 1500 || st === 'shrubland') && day) out.push(['ravens', 0.6]);
  if (!out.length && day) out.push(['ravens', 0.25]);
  return out;
}

const MOST = 1600;

const rnd = (a: number): number => {
  const x = Math.sin(a * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
};

interface Flock {
  kind: Kind;
  spec: Spec;
  n: number;
  /** its middle (world m), its way (unit, on the plan) and its speed */
  x: number;
  y: number;
  z: number;
  dx: number;
  dz: number;
  speed: number;
  age: number;
  life: number;
  seed: number;
  /** each bird's own: a point in the unit ball (murmuration), its arm and rank (skein), its ring (gulls) … */
  own: Float32Array;
}

/** the sky's flocks near the road (ModGame updates it every frame) */
export class SkyFlocks {
  private readonly flocks: Flock[] = [];
  private readonly geo: THREE.InstancedBufferGeometry;
  private readonly mesh: THREE.Mesh;
  private readonly aBird = new THREE.InstancedBufferAttribute(new Float32Array(MOST * 4), 4);
  private readonly aWing = new THREE.InstancedBufferAttribute(new Float32Array(MOST * 4), 4);
  private readonly aColor = new THREE.InstancedBufferAttribute(new Float32Array(MOST * 4), 4);
  private readonly tp = new TerrainPoint();
  private wait = 2;
  private serial = 0;
  /** how many birds are drawn (the harness asks) */
  birds = 0;

  constructor(
    private readonly core: RenderCore,
    private readonly world: World,
  ) {
    // a chevron: two wings from the body back to their tips (y up is the beat), the body a little forward
    const pos = new Float32Array([
      0, 0, 0.16, -0.5, 0, -0.12, 0, 0, -0.18,
      0, 0, 0.16, 0, 0, -0.18, 0.5, 0, -0.12,
    ]);
    const tip = new Float32Array([0, 1, 0, 0, 0, 1]);
    this.geo = new THREE.InstancedBufferGeometry();
    this.geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.geo.setAttribute('aTip', new THREE.BufferAttribute(tip, 1));
    this.geo.setAttribute('aBird', this.aBird);
    this.geo.setAttribute('aWing', this.aWing);
    this.geo.setAttribute('aColor', this.aColor);
    this.geo.instanceCount = 0;
    this.mesh = new THREE.Mesh(this.geo, birdMaterial());
    this.mesh.name = 'sky:flocks';
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 3;
    core.scene.add(this.mesh);
  }

  /** dt (s), the road's distance of the car, the hour, how bad the weather is (0 fair … 1 a storm) */
  update(dt: number, s: number, hour: number, foul: number): void {
    dt = Math.min(dt, 0.1);
    const cam = this.core.camera;
    const o = this.core.origin;
    const cx = cam.position.x + o.x;
    const cz = cam.position.z + o.z;
    const fwd = new THREE.Vector3();
    cam.getWorldDirection(fwd);
    const fl = Math.hypot(fwd.x, fwd.z) || 1;
    const fx = fwd.x / fl;
    const fz = fwd.z / fl;
    // the old go when they are far behind or their while is over
    for (let i = this.flocks.length - 1; i >= 0; i--) {
      const f = this.flocks[i];
      f.age += dt;
      f.x += f.dx * f.speed * dt;
      f.z += f.dz * f.speed * dt;
      const d = Math.hypot(f.x - cx, f.z - cz);
      if (f.age > f.life || d > 2600) this.flocks.splice(i, 1);
    }
    // a new one now and then, of a kind the place has at this hour
    this.wait -= dt;
    const kinds = foul > 0.5 ? [] : kindsOf(this.world, s, hour);
    const most = kinds.length ? (kinds.some((k) => k[0] === 'murmuration') ? 3 : 4) : 0;
    if (this.wait <= 0 && this.flocks.length < most) {
      this.serial++;
      const pick = kinds[Math.floor(rnd(this.serial * 3.1) * kinds.length) % kinds.length];
      this.wait = 6 + 22 * rnd(this.serial * 5.7);
      if (rnd(this.serial * 7.3) < pick[1] * (1 - foul)) this.spawn(pick[0], cx, cz, fx, fz);
    }
    // the birds
    const B = this.aBird.array as Float32Array;
    const W = this.aWing.array as Float32Array;
    const C = this.aColor.array as Float32Array;
    let n = 0;
    const t = performance.now() / 1000;
    for (const f of this.flocks) {
      const fade = Math.min(1, f.age / 4, (f.life - f.age) / 4);
      for (let i = 0; i < f.n && n < MOST; i++, n++) {
        const q = i * 4;
        let px = 0;
        let py = 0;
        let pz = 0;
        let hx = f.dx;
        let hz = f.dz;
        let beat = 1;
        const u0 = f.own[q];
        const u1 = f.own[q + 1];
        const u2 = f.own[q + 2];
        const u3 = f.own[q + 3];
        if (f.kind === 'murmuration') {
          // one body that stretches, folds and rolls as it drifts
          const tt = t * 0.22 + f.seed * 40;
          // (tight enough that its middle is dark and its edge reads)
          const R = 24 + 0.05 * f.n;
          const wx = u0 * (1 + 0.65 * Math.sin(tt * 1.3 + u1 * 2.1)) + 0.35 * Math.sin(tt * 0.7 + u2 * 3.0);
          const wy = u1 * (0.45 + 0.3 * Math.sin(tt * 0.9 + u0 * 2.7)) + 0.2 * Math.sin(tt * 1.7 + u0 * 1.3);
          const wz = u2 * (1 + 0.5 * Math.sin(tt * 1.1 + u1 * 2.4 + 1)) + 0.3 * Math.cos(tt * 0.8 + u0 * 2.2);
          const yaw = tt * 0.35;
          px = (wx * Math.cos(yaw) - wz * Math.sin(yaw)) * R;
          pz = (wx * Math.sin(yaw) + wz * Math.cos(yaw)) * R;
          py = wy * R;
          // (each heads along the body's swirl)
          hx = -Math.sin(yaw + u3 * 0.6) * (u0 > 0 ? 1 : -1);
          hz = Math.cos(yaw + u3 * 0.6) * (u0 > 0 ? 1 : -1);
        } else if (f.kind === 'skein') {
          // a V behind its leader, its arms rippling
          const rank = Math.ceil(i / 2);
          const arm = i === 0 ? 0 : i % 2 ? 1 : -1;
          const sx = -f.dz;
          const sz = f.dx;
          const ripple = Math.sin(t * 0.9 + rank * 0.5 + f.seed * 9) * 0.6;
          px = -f.dx * rank * 4.2 + sx * arm * rank * (3.0 + 0.3 * u0) + sx * ripple;
          pz = -f.dz * rank * 4.2 + sz * arm * rank * (3.0 + 0.3 * u0) + sz * ripple;
          py = Math.sin(t * 0.7 + rank * 0.4) * 0.8;
        } else if (f.kind === 'gulls' || f.kind === 'ravens' || f.kind === 'swifts') {
          // wheeling: each on its own ring, at its own rate, rising and falling
          const r = (f.kind === 'swifts' ? 25 : 14) + (f.kind === 'swifts' ? 60 : 45) * u0;
          const w = (f.kind === 'swifts' ? 0.5 : 0.18) * (0.6 + 0.8 * u1) * (u2 > 0.5 ? 1 : -1);
          const a = t * w + u3 * 6.283;
          px = Math.cos(a) * r + Math.sin(t * 0.13 + u1 * 4) * r * 0.3;
          pz = Math.sin(a) * r;
          py = Math.sin(t * 0.3 + u3 * 5) * 9 + (u1 - 0.5) * 22;
          hx = -Math.sin(a) * Math.sign(w);
          hz = Math.cos(a) * Math.sign(w);
          // (a glider beats only now and then)
          if (f.spec.flap === 0) beat = Math.sin(t * 0.4 + u3 * 9) > 0.75 ? 1 : 0;
        } else {
          // a loose line or a quick bunch going somewhere
          const sx = -f.dz;
          const sz = f.dx;
          const spread = f.kind === 'egrets' ? 5 : 3;
          px = sx * (i - f.n / 2) * spread + f.dx * (u0 - 0.5) * 12 + sx * Math.sin(t * 0.5 + i) * 1.2;
          pz = sz * (i - f.n / 2) * spread + f.dz * (u0 - 0.5) * 12 + sz * Math.sin(t * 0.5 + i) * 1.2;
          py = Math.sin(t * (f.kind === 'parrots' ? 2.4 : 0.6) + i * 0.7) * (f.kind === 'parrots' ? 1.6 : 0.8) + (u1 - 0.5) * 4;
        }
        B[q] = f.x + px - o.x;
        B[q + 1] = f.y + py - o.y;
        B[q + 2] = f.z + pz - o.z;
        B[q + 3] = Math.atan2(hx, hz);
        // (born and gone by growing and shrinking: a speck that appears)
        W[q] = f.spec.span * (0.85 + 0.3 * u3) * Math.max(0, fade);
        W[q + 1] = f.spec.flap > 0 ? f.spec.flap * (0.9 + 0.2 * u1) : 2.4;
        W[q + 2] = u3 * 6.283;
        W[q + 3] = beat;
        C[q] = f.spec.color[0];
        C[q + 1] = f.spec.color[1];
        C[q + 2] = f.spec.color[2];
        C[q + 3] = f.spec.lit;
      }
    }
    for (const a of [this.aBird, this.aWing, this.aColor]) a.needsUpdate = true;
    this.geo.instanceCount = n;
    this.mesh.visible = n > 0;
    this.birds = n;
  }

  private spawn(kind: Kind, cx: number, cz: number, fx: number, fz: number): void {
    const spec = SPECS[kind];
    const k = this.serial;
    // born where the eye looks, some way off, to one side of it, and carried across it
    const bearing = Math.atan2(fz, fx) + (rnd(k * 1.7) - 0.5) * 1.5;
    const d = spec.far[0] + (spec.far[1] - spec.far[0]) * rnd(k * 2.3);
    const x = cx + Math.cos(bearing) * d;
    const z = cz + Math.sin(bearing) * d;
    this.world.shape(x, z, this.tp);
    const ground = Math.max(this.tp.h, this.tp.wl > -1e8 ? this.tp.wl : -1e9);
    const y = ground + spec.height[0] + (spec.height[1] - spec.height[0]) * rnd(k * 2.9);
    const across = bearing + (rnd(k * 3.7) < 0.5 ? 1 : -1) * (Math.PI / 2 + (rnd(k * 4.1) - 0.5) * 0.9);
    const n = Math.round(spec.count[0] + (spec.count[1] - spec.count[0]) * rnd(k * 4.9));
    const own = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) {
      // (a point in the unit ball, and three numbers of its own)
      let a = 0;
      let b = 0;
      let c = 0;
      for (let tries = 0; tries < 8; tries++) {
        a = rnd(k * 31 + i * 3.1) * 2 - 1;
        b = rnd(k * 37 + i * 5.3) * 2 - 1;
        c = rnd(k * 41 + i * 7.7) * 2 - 1;
        if (a * a + b * b + c * c <= 1) break;
      }
      own[i * 4] = kind === 'murmuration' ? a : rnd(k * 43 + i * 1.9);
      own[i * 4 + 1] = kind === 'murmuration' ? b : rnd(k * 47 + i * 2.7);
      own[i * 4 + 2] = kind === 'murmuration' ? c : rnd(k * 53 + i * 3.9);
      own[i * 4 + 3] = rnd(k * 59 + i * 4.3);
    }
    this.flocks.push({
      kind,
      spec,
      n,
      x,
      y,
      z,
      dx: Math.cos(across),
      dz: Math.sin(across),
      speed: spec.speed[0] + (spec.speed[1] - spec.speed[0]) * rnd(k * 6.1),
      age: 0,
      life: 70 + 80 * rnd(k * 6.7),
      seed: rnd(k * 7.9),
      own,
    });
  }
}

function birdMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { ...globals },
    side: THREE.DoubleSide,
    transparent: true,
    depthWrite: false,
    vertexShader: /* glsl */ `
      #include <common>
      #include <logdepthbuf_pars_vertex>
      uniform float uTime;
      attribute float aTip;
      attribute vec4 aBird;   // where it is (render origin), its heading (rad)
      attribute vec4 aWing;   // its span (m), beats a second, its phase, whether it beats now
      attribute vec4 aColor;  // its colour, how much the sun lights it
      varying vec3 vPos;
      varying vec3 vNormal;
      varying vec4 vColor;
      void main() {
        vec3 at = aBird.xyz;
        float dist = length(at - cameraPosition);
        // (never smaller than a pixel or two: a starling at a kilometre is a speck, not nothing)
        // (drawn never smaller than four or five pixels across its wings: a flock far off reads as a body of birds,
        // as a painter puts it in, not as a haze of specks)
        float span = aWing.x > 0.0 ? max(aWing.x, dist * 0.0052 * min(1.0, aWing.x * 4.0)) : 0.0;
        float beat = aWing.w > 0.5 ? sin(uTime * aWing.y * 6.2832 + aWing.z) : 0.12;
        vec3 p = position;
        p.y += aTip * beat * 0.34;
        float c = cos(aBird.w);
        float s = sin(aBird.w);
        vec3 w = vec3(p.x * c + p.z * s, p.y, -p.x * s + p.z * c) * span;
        vPos = at + w;
        vNormal = vec3(0.0, 1.0, 0.0);
        vColor = aColor;
        gl_Position = projectionMatrix * viewMatrix * vec4(vPos, 1.0);
        #include <logdepthbuf_vertex>
      }`,
    fragmentShader: /* glsl */ `
      ${GLSL_FRAGMENT_PARS}
      ${GLSL_COMMON}
      varying vec4 vColor;
      void main() {
        #include <logdepthbuf_fragment>
        vec3 col = vColor.rgb * (uSkyColor * 0.55 + uBounceColor * 0.2) + vColor.rgb * uSunColor * vColor.w * 0.9;
        col = rtFog(col, vPos, cameraPosition);
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
}
