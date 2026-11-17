/**
 * Dust thrown up by the wheels (docs/MODCAR.md §23): where a tyre rolls on gravel, dirt, sand or dry grass it
 * throws soft puffs up behind it that hang, spread and drift off on the wind (a long cloud behind a car going
 * fast on a gravel shoulder, a burst where a wheel spins or slides), powder off snow; none off asphalt or ice,
 * and less and then none as the ground gets wet. Painted like the stove's smoke (garageSmoke.ts): soft round
 * puffs, their edges broken like a brush's, lit by the sky and the sun and thinned by the haze; their alpha
 * leaves the frame's ink ids alone.
 */
import * as THREE from 'three';
import { Surface } from '../../core/world/ground';
import { GLSL_COMMON, globals } from '../render/shaderlib';

/** the most puffs alive at once */
export const DUST_MAX = 720;

/** what a surface throws up: puffs a second from one wheel at 15 m/s, how long they hang (s), how big they grow (m), how thick, their colour */
interface DustKind {
  rate: number;
  life: number;
  size: number;
  alpha: number;
  tint: readonly [number, number, number];
  /** how wet the ground may be before none comes up (0 … 1) */
  dryTo: number;
}

const KINDS: Partial<Record<number, DustKind>> = {
  [Surface.Gravel]: { rate: 5, life: 2.2, size: 1.7, alpha: 0.36, tint: [0.62, 0.58, 0.5], dryTo: 0.45 },
  [Surface.Dirt]: { rate: 7, life: 2.8, size: 2.0, alpha: 0.48, tint: [0.56, 0.45, 0.32], dryTo: 0.4 },
  [Surface.Grass]: { rate: 1.6, life: 1.4, size: 1.1, alpha: 0.16, tint: [0.5, 0.48, 0.34], dryTo: 0.25 },
  [Surface.Sand]: { rate: 8, life: 3.2, size: 2.3, alpha: 0.6, tint: [0.8, 0.68, 0.48], dryTo: 0.7 },
  [Surface.Snow]: { rate: 6, life: 1.7, size: 1.5, alpha: 0.5, tint: [0.93, 0.95, 1.0], dryTo: 0.9 },
};

/** a hot brake's smoke (brakeHeat.ts): thin and pale, rising off the hub */
const SMOKE: DustKind = { rate: 0, life: 2.4, size: 0.75, alpha: 0.5, tint: [0.94, 0.94, 0.96], dryTo: 1 };
/** how fast a puff rises once its throw has died away (m/s): dust hangs, smoke climbs */
const DUST_RISE = 0.12;
const SMOKE_RISE = 0.7;

/**
 * Puffs a second one wheel throws up (0: none): on a dusty surface, more the faster it rolls and much more where
 * it spins or slides; none below a walking pace's roll, none once the ground is wet enough.
 * @param speed the wheel's speed over the ground (m/s)
 * @param slip how fast its tread slides over the ground (m/s)
 * @param wet how wet the ground is (0 … 1)
 */
export function dustRate(surface: number, speed: number, slip: number, wet: number): number {
  const k = KINDS[surface];
  if (!k) return 0;
  const dry = 1 - Math.min(1, Math.max(0, wet) / k.dryTo);
  if (dry <= 0) return 0;
  const roll = Math.min(1, Math.max(0, speed - 1.5) / 4) * (0.35 + speed / 15);
  const slide = Math.min(4, Math.max(0, slip - 0.6) * 0.45);
  return k.rate * (roll + slide) * dry;
}

/** a wheel as the dust needs it (a VehicleSim's) */
export interface DustWheel {
  readonly contact: boolean;
  readonly surface: number;
  readonly cx: number;
  readonly cy: number;
  readonly cz: number;
  readonly fx: number;
  readonly fz: number;
  readonly sx: number;
  readonly sz: number;
  readonly vLong: number;
  readonly vLat: number;
  readonly omega: number;
  readonly radius: number;
}

export class WheelDust {
  readonly mesh: THREE.Mesh;
  /** puffs alive now */
  live = 0;
  /** puffs thrown up since the start (the probes') */
  thrown = 0;
  private readonly geo = new THREE.InstancedBufferGeometry();
  /** world positions (the render positions are these minus the origin) */
  private readonly world = new Float64Array(DUST_MAX * 3);
  private readonly vel = new Float32Array(DUST_MAX * 3);
  private readonly age = new Float32Array(DUST_MAX);
  private readonly life = new Float32Array(DUST_MAX);
  private readonly rise = new Float32Array(DUST_MAX);
  /** per puff, to the GPU: where (render space); its age 0…1, start and end size, its own random; colour and thickness */
  private readonly aPos = new Float32Array(DUST_MAX * 3);
  private readonly aInfo = new Float32Array(DUST_MAX * 4);
  private readonly aTint = new Float32Array(DUST_MAX * 4);
  /** each vehicle's wheels' share of a puff not thrown yet */
  private readonly due = new WeakMap<object, Float32Array>();

  constructor(private readonly origin: { x: number; y: number; z: number }) {
    const g = this.geo;
    g.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0], 3));
    g.setIndex([0, 1, 2, 0, 2, 3]);
    g.setAttribute('aPos', new THREE.InstancedBufferAttribute(this.aPos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aInfo', new THREE.InstancedBufferAttribute(this.aInfo, 4).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aTint', new THREE.InstancedBufferAttribute(this.aTint, 4).setUsage(THREE.DynamicDrawUsage));
    g.instanceCount = 0;
    const m = new THREE.ShaderMaterial({
      uniforms: { ...globals },
      vertexShader: /* glsl */ `
        #include <common>
        #include <logdepthbuf_pars_vertex>
        attribute vec3 aPos;
        attribute vec4 aInfo;
        attribute vec4 aTint;
        varying vec3 vPos;
        varying vec2 vUv;
        varying float vAge;
        varying float vSeed;
        varying vec4 vTint;
        varying float vNear;
        void main() {
          float age = aInfo.x;
          vAge = age;
          vSeed = aInfo.w;
          vTint = aTint;
          vUv = position.xy;
          // grows quickly at first, then spreads slowly; its middle rises with its size so it never sinks into the ground
          float size = mix(aInfo.y, aInfo.z, 1.0 - pow(1.0 - age, 2.2));
          vec3 c = aPos;
          c.y += size * 0.35;
          vPos = c;
          vec4 mv = viewMatrix * vec4(c, 1.0);
          vNear = -mv.z;
          float a = aInfo.w * 6.283 + age * 0.6;
          vec2 q = mat2(cos(a), -sin(a), sin(a), cos(a)) * position.xy;
          mv.xy += q * size;
          gl_Position = projectionMatrix * mv;
          #include <logdepthbuf_vertex>
        }`,
      fragmentShader: /* glsl */ `
        #include <common>
        #include <logdepthbuf_pars_fragment>
        ${GLSL_COMMON}
        varying vec3 vPos;
        varying vec2 vUv;
        varying float vAge;
        varying float vSeed;
        varying vec4 vTint;
        varying float vNear;
        void main() {
          #include <logdepthbuf_fragment>
          float d = length(vUv);
          float n = rtNoiseAt(vUv * 0.8 + vSeed * 17.0, 1.0).r;
          float a = 1.0 - smoothstep(0.25, 1.0, d + (n - 0.5) * 0.6);
          // thick as it is thrown up, thinning as it spreads; faded where it is right at the eye
          a *= smoothstep(0.0, 0.06, vAge) * pow(1.0 - vAge, 1.35) * vTint.a * smoothstep(0.4, 2.0, vNear);
          if (a < 0.004) discard;
          // (lit mostly by the sun it hangs in, the sky's blue only a little: dust is the colour of what it came off)
          float lit = 0.6 + 0.4 * clamp(dot(normalize(vec3(vUv, 0.7)), normalize(vec3(0.0, 0.6, 0.8))), 0.0, 1.0);
          vec3 col = vTint.rgb * (uSkyColor * 0.45 + uSunColor * 0.42 * lit + uBounceColor * 0.6);
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
    this.mesh = new THREE.Mesh(g, m);
    this.mesh.name = 'modcar:dust';
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 8;
  }

  /** one puff, from a world point */
  private puff(x: number, y: number, z: number, vx: number, vy: number, vz: number, k: DustKind, grow: number, thick: number, rise = DUST_RISE): void {
    if (this.live >= DUST_MAX) return;
    const i = this.live++;
    this.rise[i] = rise;
    const r = Math.random();
    this.world[i * 3] = x;
    this.world[i * 3 + 1] = y;
    this.world[i * 3 + 2] = z;
    this.vel[i * 3] = vx;
    this.vel[i * 3 + 1] = vy;
    this.vel[i * 3 + 2] = vz;
    this.age[i] = 0;
    this.life[i] = k.life * (0.7 + 0.6 * r);
    this.aInfo[i * 4 + 1] = 0.22 + 0.12 * Math.random();
    this.aInfo[i * 4 + 2] = k.size * grow * (0.75 + 0.5 * Math.random());
    this.aInfo[i * 4 + 3] = Math.random();
    const sh = 0.92 + 0.16 * Math.random();
    this.aTint[i * 4] = k.tint[0] * sh;
    this.aTint[i * 4 + 1] = k.tint[1] * sh;
    this.aTint[i * 4 + 2] = k.tint[2] * sh;
    this.aTint[i * 4 + 3] = k.alpha * thick;
    this.thrown++;
  }

  /**
   * A vehicle's wheels throwing up what they roll on, this frame.
   * @param key the vehicle (what its wheels' shares are kept under)
   * @param wet how wet the ground is (0 … 1)
   * @param share how much of a wheel's dust each contact throws (a motorcycle's four contacts are two tracks)
   */
  kick(dt: number, key: object, wheels: readonly DustWheel[], wet: number, share = 1): void {
    let due = this.due.get(key);
    if (!due) this.due.set(key, (due = new Float32Array(wheels.length)));
    for (let i = 0; i < wheels.length; i++) {
      const w = wheels[i];
      const k = w.contact ? KINDS[w.surface] : undefined;
      if (!k) {
        due[i] = 0;
        continue;
      }
      const speed = Math.hypot(w.vLong, w.vLat);
      const tread = w.omega * w.radius;
      const slipL = tread - w.vLong;
      const slip = Math.hypot(slipL, w.vLat);
      const rate = dustRate(w.surface, speed, slip, wet) * share;
      if (rate <= 0) {
        due[i] = 0;
        continue;
      }
      due[i] += rate * dt;
      const n = Math.floor(due[i]);
      due[i] -= n;
      // the contact's velocity over the ground (world), and the way the tread throws (back along the wheel)
      const gvx = w.fx * w.vLong + w.sx * w.vLat;
      const gvz = w.fz * w.vLong + w.sz * w.vLat;
      const dir = tread >= 0 ? 1 : -1;
      const fast = Math.min(1, speed / 20);
      for (let p = 0; p < n; p++) {
        const u = Math.random();
        // from behind the tyre, along the frame just gone by (spread over it, so a fast car leaves an even cloud)
        const back = w.radius * 0.5 + u * speed * dt;
        const x = w.cx - w.fx * dir * back + (Math.random() - 0.5) * 0.25 * w.sx;
        const z = w.cz - w.fz * dir * back + (Math.random() - 0.5) * 0.25 * w.sz;
        const throwBack = 0.6 + 0.25 * Math.max(0, Math.abs(slipL) - 0.5);
        const side = (Math.random() - 0.5) * 1.4;
        const vx = gvx * 0.3 - w.fx * dir * throwBack + w.sx * side;
        const vz = gvz * 0.3 - w.fz * dir * throwBack + w.sz * side;
        this.puff(x, w.cy + 0.06, z, vx, 0.35 + 0.6 * Math.random(), vz, k, 0.7 + 0.6 * fast, 0.55 + 0.45 * fast);
      }
    }
  }

  /** smoke off a hot brake, `n` puffs from its hub (world), carried a little with the vehicle (vx, vz: its velocity) */
  smoke(x: number, y: number, z: number, vx: number, vz: number, n: number): void {
    for (let p = 0; p < n; p++) this.puff(x + (Math.random() - 0.5) * 0.15, y, z + (Math.random() - 0.5) * 0.15, vx * 0.4, 0.8 + 0.6 * Math.random(), vz * 0.4, SMOKE, 1, 1, SMOKE_RISE);
  }

  /** every frame: the puffs drifting on the wind (world m/s), slowing, rising a little; the dead ones gone */
  update(dt: number, wind: { x: number; z: number }): void {
    const o = this.origin;
    const drag = Math.exp(-dt * 1.7);
    const lift = Math.exp(-dt * 2.5);
    let i = 0;
    while (i < this.live) {
      this.age[i] += dt;
      if (this.age[i] >= this.life[i]) {
        this.kill(i);
        continue;
      }
      // (the air it is in moves with the wind; the throw dies away into it; a warm puff rises slowly)
      this.vel[i * 3] = wind.x + (this.vel[i * 3] - wind.x) * drag;
      this.vel[i * 3 + 2] = wind.z + (this.vel[i * 3 + 2] - wind.z) * drag;
      this.vel[i * 3 + 1] = this.rise[i] + (this.vel[i * 3 + 1] - this.rise[i]) * lift;
      this.world[i * 3] += this.vel[i * 3] * dt;
      this.world[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.world[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      this.aPos[i * 3] = this.world[i * 3] - o.x;
      this.aPos[i * 3 + 1] = this.world[i * 3 + 1] - o.y;
      this.aPos[i * 3 + 2] = this.world[i * 3 + 2] - o.z;
      this.aInfo[i * 4] = this.age[i] / this.life[i];
      i++;
    }
    this.geo.instanceCount = this.live;
    for (const name of ['aPos', 'aInfo', 'aTint']) {
      const a = this.geo.getAttribute(name) as THREE.InstancedBufferAttribute;
      a.clearUpdateRanges();
      if (this.live) a.addUpdateRange(0, this.live * a.itemSize);
      a.needsUpdate = true;
    }
  }

  /** a puff gone: the last one alive takes its place (they stay packed at the front) */
  private kill(i: number): void {
    const j = --this.live;
    if (i === j) return;
    for (let c = 0; c < 3; c++) {
      this.world[i * 3 + c] = this.world[j * 3 + c];
      this.vel[i * 3 + c] = this.vel[j * 3 + c];
    }
    this.age[i] = this.age[j];
    this.life[i] = this.life[j];
    this.rise[i] = this.rise[j];
    for (let c = 0; c < 4; c++) {
      this.aInfo[i * 4 + c] = this.aInfo[j * 4 + c];
      this.aTint[i * 4 + c] = this.aTint[j * 4 + c];
    }
  }

  /** every puff gone (a teleport) */
  clear(): void {
    this.live = 0;
    this.geo.instanceCount = 0;
  }
}
