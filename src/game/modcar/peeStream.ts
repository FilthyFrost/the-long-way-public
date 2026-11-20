/**
 * Relieving oneself, seen (the player: "尿尿没做粒子特效…ARCTIC DRIVE里就有"): a thin stream from the hips arcing to
 * the ground a step ahead, wavering a little as one stands, made of drops drawn as short streaks along the way
 * they fly so that they read as one stream; where it lands it splashes up in a few tiny drops, and a dark wet
 * patch spreads on the ground there, drying away slowly once one is done. Painted as the wheels' dust is
 * (wheelDust.ts): lit by the sky, the sun and the bounce, thinned by the haze, its alpha leaving the frame's ink
 * ids alone.
 */
import * as THREE from 'three';
import { GLSL_COMMON, globals } from '../render/shaderlib';

/** the most drops in the air at once */
export const PEE_MAX = 360;
/** drops a second while it flows */
const RATE = 240;
/** how fast it leaves (m/s): ahead, and up */
const OUT = 2.0;
const UP = 0.55;
/** the wet patch: how wide it grows (m), how long it takes to dry (s) */
const SPOT_R = 0.42;
const DRY_S = 40;

export class PeeStream {
  readonly mesh: THREE.Mesh;
  readonly spot: THREE.Mesh;
  /** drops in the air now; drops since the start (the probes') */
  live = 0;
  thrown = 0;
  private readonly geo = new THREE.InstancedBufferGeometry();
  private readonly world = new Float64Array(PEE_MAX * 3);
  private readonly vel = new Float32Array(PEE_MAX * 3);
  private readonly age = new Float32Array(PEE_MAX);
  /** the floor each drop lands on (world y); a splash's drop: how long it lives */
  private readonly floor = new Float32Array(PEE_MAX);
  private readonly life = new Float32Array(PEE_MAX);
  /** to the GPU: where (render space); its velocity (render space) and size; its own random and how thick */
  private readonly aPos = new Float32Array(PEE_MAX * 3);
  private readonly aVel = new Float32Array(PEE_MAX * 4);
  private readonly aInfo = new Float32Array(PEE_MAX * 2);
  private due = 0;
  private t = 0;
  /** the wet patch: where it is (world), how big it has grown (0 … 1), how wet it still is (0 … 1) */
  private readonly spotAt = { x: 0, y: 0, z: 0 };
  private spotGrow = 0;
  private spotWet = 0;
  private landed = 0;
  private readonly spotMat: THREE.ShaderMaterial;

  constructor(private readonly origin: { x: number; y: number; z: number }) {
    const g = this.geo;
    g.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0], 3));
    g.setIndex([0, 1, 2, 0, 2, 3]);
    g.setAttribute('aPos', new THREE.InstancedBufferAttribute(this.aPos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aVel', new THREE.InstancedBufferAttribute(this.aVel, 4).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aInfo', new THREE.InstancedBufferAttribute(this.aInfo, 2).setUsage(THREE.DynamicDrawUsage));
    g.instanceCount = 0;
    const m = new THREE.ShaderMaterial({
      uniforms: { ...globals },
      vertexShader: /* glsl */ `
        #include <common>
        #include <logdepthbuf_pars_vertex>
        attribute vec3 aPos;
        attribute vec4 aVel;
        attribute vec2 aInfo;
        varying vec3 vPos;
        varying vec2 vUv;
        varying float vThick;
        varying float vSeed;
        void main() {
          vUv = position.xy;
          vSeed = aInfo.x;
          vThick = aInfo.y;
          vPos = aPos;
          vec4 mv = viewMatrix * vec4(aPos, 1.0);
          // a streak along the way it flies, as the eye sees it: so many drops read as one stream
          vec3 dv = (viewMatrix * vec4(aVel.xyz, 0.0)).xyz;
          vec2 along = length(dv.xy) > 1e-4 ? normalize(dv.xy) : vec2(0.0, 1.0);
          // (across it to the right of the way it flies: the quad keeps its corners anticlockwise, facing the eye)
          vec2 across = vec2(along.y, -along.x);
          float r = aVel.w;
          float len = r + length(dv.xy) * 0.03;
          mv.xy += across * position.x * r + along * position.y * len;
          gl_Position = projectionMatrix * mv;
          #include <logdepthbuf_vertex>
        }`,
      fragmentShader: /* glsl */ `
        #include <common>
        #include <logdepthbuf_pars_fragment>
        ${GLSL_COMMON}
        varying vec3 vPos;
        varying vec2 vUv;
        varying float vThick;
        varying float vSeed;
        void main() {
          #include <logdepthbuf_fragment>
          float d = length(vec2(vUv.x, vUv.y * 0.8));
          float a = (1.0 - smoothstep(0.3, 1.0, d)) * vThick * 0.8;
          if (a < 0.01) discard;
          // pale, clear yellow: lit by the sky and the sun, a glint across its middle
          vec3 tint = vec3(0.9, 0.72, 0.2) * (0.92 + 0.16 * vSeed);
          float glint = pow(1.0 - min(1.0, abs(vUv.x) * 1.4), 6.0) * 0.35;
          vec3 col = tint * (uSkyColor * 0.32 + uSunColor * 0.34 + uBounceColor * 0.3) + uSunColor * glint * 0.18;
          col = rtFog(col, vPos, cameraPosition);
          gl_FragColor = vec4(col, a);
        }`,
    });
    PeeStream.inkSafe(m);
    this.mesh = new THREE.Mesh(g, m);
    this.mesh.name = 'modcar:pee';
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 8;
    // the wet patch: a disc lying on the ground, darker towards its middle, its edge broken
    const sg = new THREE.PlaneGeometry(2, 2, 1, 1);
    sg.rotateX(-Math.PI / 2);
    this.spotMat = new THREE.ShaderMaterial({
      uniforms: { ...globals, uWet: { value: 0 }, uR: { value: 0.1 }, uSeed: { value: 0 } },
      vertexShader: /* glsl */ `
        #include <common>
        #include <logdepthbuf_pars_vertex>
        uniform float uR;
        varying vec2 vUv;
        varying vec3 vPos;
        void main() {
          vUv = position.xz;
          vec4 w = modelMatrix * vec4(position * vec3(uR, 1.0, uR), 1.0);
          vPos = w.xyz;
          gl_Position = projectionMatrix * viewMatrix * w;
          #include <logdepthbuf_vertex>
        }`,
      fragmentShader: /* glsl */ `
        #include <common>
        #include <logdepthbuf_pars_fragment>
        ${GLSL_COMMON}
        uniform float uWet;
        uniform float uSeed;
        varying vec2 vUv;
        varying vec3 vPos;
        void main() {
          #include <logdepthbuf_fragment>
          float n = rtNoiseAt(vUv * 0.9 + uSeed * 13.0, 1.0).r;
          float d = length(vUv) + (n - 0.5) * 0.45;
          float a = (1.0 - smoothstep(0.55, 1.0, d)) * uWet * 0.42;
          if (a < 0.004) discard;
          // what is wet goes darker; a little warm in it
          vec3 col = vec3(0.05, 0.045, 0.02) * (uSkyColor * 0.6 + uSunColor * 0.4);
          col = rtFog(col, vPos, cameraPosition);
          gl_FragColor = vec4(col, a);
        }`,
    });
    PeeStream.inkSafe(this.spotMat);
    this.spotMat.polygonOffset = true;
    this.spotMat.polygonOffsetFactor = -2;
    this.spotMat.polygonOffsetUnits = -2;
    this.spot = new THREE.Mesh(sg, this.spotMat);
    this.spot.name = 'modcar:pee-spot';
    this.spot.visible = false;
    this.spot.renderOrder = 7;
  }

  /** blended over the frame without writing its alpha (the frame's ink ids are kept there), not in the depth */
  private static inkSafe(m: THREE.ShaderMaterial): void {
    m.transparent = true;
    m.depthWrite = false;
    m.blending = THREE.CustomBlending;
    m.blendSrc = THREE.SrcAlphaFactor;
    m.blendDst = THREE.OneMinusSrcAlphaFactor;
    m.blendSrcAlpha = THREE.ZeroFactor;
    m.blendDstAlpha = THREE.OneFactor;
  }

  private drop(x: number, y: number, z: number, vx: number, vy: number, vz: number, r: number, thick: number, floor: number, life: number): void {
    if (this.live >= PEE_MAX) return;
    const i = this.live++;
    this.world[i * 3] = x;
    this.world[i * 3 + 1] = y;
    this.world[i * 3 + 2] = z;
    this.vel[i * 3] = vx;
    this.vel[i * 3 + 1] = vy;
    this.vel[i * 3 + 2] = vz;
    this.age[i] = 0;
    this.floor[i] = floor;
    this.life[i] = life;
    this.aVel[i * 4 + 3] = r;
    this.aInfo[i * 2] = Math.random();
    this.aInfo[i * 2 + 1] = thick;
    this.thrown++;
  }

  /**
   * Every frame. `from`: where it leaves the body (world: the hips, a little ahead), null while it does not flow;
   * `yaw`: the way one faces on the plan (forward (cos, sin) in x, z); `floorY`: the ground one stands on (world y).
   */
  update(dt: number, from: { x: number; y: number; z: number } | null, yaw: number, floorY: number): void {
    this.t += dt;
    if (from) {
      this.due += RATE * dt;
      const n = Math.floor(this.due);
      this.due -= n;
      // (it wavers as one stands: slowly side to side and a little up and down)
      const sway = 0.07 * Math.sin(this.t * 1.7) + 0.03 * Math.sin(this.t * 4.3 + 1.1);
      const lift = UP + 0.06 * Math.sin(this.t * 2.3);
      const a = yaw + sway;
      const fx = Math.cos(a);
      const fz = Math.sin(a);
      for (let p = 0; p < n; p++) {
        const u = p / Math.max(1, n);
        const out = OUT * (0.96 + 0.08 * Math.random());
        // (spread over the frame just gone by, so the stream is even whatever the frame rate)
        const back = u * dt;
        const vx = fx * out + (Math.random() - 0.5) * 0.05;
        const vz = fz * out + (Math.random() - 0.5) * 0.05;
        const vy = lift + (Math.random() - 0.5) * 0.06;
        this.drop(from.x + vx * back, from.y + vy * back, from.z + vz * back, vx, vy, vz, 0.0065 + 0.0015 * Math.random(), 0.9, floorY, 2.5);
      }
    } else this.due = 0;
    const o = this.origin;
    let i = 0;
    let landX = 0;
    let landZ = 0;
    let landN = 0;
    while (i < this.live) {
      this.age[i] += dt;
      this.vel[i * 3 + 1] -= 9.81 * dt;
      this.world[i * 3] += this.vel[i * 3] * dt;
      this.world[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.world[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      const splash = this.life[i] < 1;
      if (this.world[i * 3 + 1] <= this.floor[i] || this.age[i] >= this.life[i]) {
        if (!splash && this.world[i * 3 + 1] <= this.floor[i]) {
          // where it lands: a tiny splash up out of it (now and then), and the patch there wetter
          landX += this.world[i * 3];
          landZ += this.world[i * 3 + 2];
          landN++;
          if (Math.random() < 0.35) {
            const ang = Math.random() * Math.PI * 2;
            const sp = 0.25 + 0.45 * Math.random();
            const x = this.world[i * 3];
            const z = this.world[i * 3 + 2];
            const fl = this.floor[i];
            this.kill(i);
            this.drop(x, fl + 0.005, z, Math.cos(ang) * sp, 0.5 + 0.7 * Math.random(), Math.sin(ang) * sp, 0.0035, 0.6, fl, 0.35);
            continue;
          }
        }
        this.kill(i);
        continue;
      }
      this.aPos[i * 3] = this.world[i * 3] - o.x;
      this.aPos[i * 3 + 1] = this.world[i * 3 + 1] - o.y;
      this.aPos[i * 3 + 2] = this.world[i * 3 + 2] - o.z;
      this.aVel[i * 4] = this.vel[i * 3];
      this.aVel[i * 4 + 1] = this.vel[i * 3 + 1];
      this.aVel[i * 4 + 2] = this.vel[i * 3 + 2];
      i++;
    }
    this.geo.instanceCount = this.live;
    for (const name of ['aPos', 'aVel', 'aInfo']) {
      const at = this.geo.getAttribute(name) as THREE.InstancedBufferAttribute;
      at.clearUpdateRanges();
      if (this.live) at.addUpdateRange(0, this.live * at.itemSize);
      at.needsUpdate = true;
    }
    this.updateSpot(dt, landN ? landX / landN : NaN, landN ? landZ / landN : NaN, landN, from ? floorY : NaN);
  }

  /** the wet patch: started where the stream first lands, growing while it flows, drying once it is done */
  private updateSpot(dt: number, x: number, z: number, n: number, floorY: number): void {
    if (n > 0) {
      const s = this.spotAt;
      // (a new patch when the stream lands far from the last one, or the last has dried)
      if (this.spotWet < 0.05 || Math.hypot(x - s.x, z - s.z) > 0.8) {
        s.x = x;
        s.z = z;
        s.y = Number.isFinite(floorY) ? floorY : s.y;
        this.spotGrow = 0;
        this.spotMat.uniforms.uSeed.value = Math.random();
      } else {
        // (it follows where the stream falls, slowly)
        s.x += (x - s.x) * Math.min(1, dt * 0.8);
        s.z += (z - s.z) * Math.min(1, dt * 0.8);
      }
      this.landed += n;
      this.spotGrow = Math.min(1, this.spotGrow + dt / 9);
      this.spotWet = Math.min(1, this.spotWet + dt * 1.5);
    } else this.spotWet = Math.max(0, this.spotWet - dt / DRY_S);
    const vis = this.spotWet > 0.004;
    this.spot.visible = vis;
    if (!vis) return;
    const o = this.origin;
    this.spot.position.set(this.spotAt.x - o.x, this.spotAt.y - o.y + 0.012, this.spotAt.z - o.z);
    this.spotMat.uniforms.uR.value = SPOT_R * (0.25 + 0.75 * Math.sqrt(this.spotGrow));
    this.spotMat.uniforms.uWet.value = Math.min(1, this.spotWet * 1.2);
  }

  /** a drop gone: the last one in the air takes its place */
  private kill(i: number): void {
    const j = --this.live;
    if (i === j) return;
    for (let c = 0; c < 3; c++) {
      this.world[i * 3 + c] = this.world[j * 3 + c];
      this.vel[i * 3 + c] = this.vel[j * 3 + c];
    }
    this.age[i] = this.age[j];
    this.floor[i] = this.floor[j];
    this.life[i] = this.life[j];
    for (let c = 0; c < 4; c++) this.aVel[i * 4 + c] = this.aVel[j * 4 + c];
    for (let c = 0; c < 2; c++) this.aInfo[i * 2 + c] = this.aInfo[j * 2 + c];
  }

  /** all of it gone (a teleport, a load) */
  clear(): void {
    this.live = 0;
    this.geo.instanceCount = 0;
    this.spotWet = 0;
    this.spot.visible = false;
  }
}
