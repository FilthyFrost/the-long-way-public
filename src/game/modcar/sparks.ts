/**
 * Sparks where metal drags on the road (docs/MODCAR.md §4: the physics reports `feel.scrape`, the speed
 * of the fastest scrape — an empty hub's drum or the body on the ground): short hot streaks thrown back
 * and up from the contact in bursts, white-yellow at the head and orange behind, cooling and falling
 * in half a second. One small pool of line segments for the game, added light that leaves the frame's
 * ink ids alone.
 */
import * as THREE from 'three';
import type { RenderCore } from '../render/core';

const N = 384;
/** how long a streak is: the distance it covers in this many seconds */
const TRAIL_S = 0.035;

export class Sparks {
  private readonly geo = new THREE.BufferGeometry();
  /** two vertices per spark: head, tail */
  private readonly pos = new Float32Array(N * 6);
  private readonly heat = new Float32Array(N * 2);
  private readonly life = new Float32Array(N);
  private readonly vel = new Float32Array(N * 3);
  /** world positions of the heads (the render positions are these minus the origin) */
  private readonly world = new Float64Array(N * 3);
  private readonly age = new Float32Array(N);
  private next = 0;
  private live = 0;
  readonly lines: THREE.LineSegments;

  constructor(private readonly core: RenderCore) {
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    this.geo.setAttribute('aHeat', new THREE.BufferAttribute(this.heat, 1));
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      vertexShader: /* glsl */ `
        attribute float aHeat;
        varying float vHeat;
        #include <common>
        #include <logdepthbuf_pars_vertex>
        void main() {
          vHeat = aHeat;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          #include <logdepthbuf_vertex>
        }`,
      fragmentShader: /* glsl */ `
        varying float vHeat;
        #include <logdepthbuf_pars_fragment>
        void main() {
          #include <logdepthbuf_fragment>
          if (vHeat <= 0.0) discard;
          // white-yellow where it is hottest (the head of a fresh spark), orange as it cools
          vec3 c = mix(vec3(1.0, 0.28, 0.03), vec3(1.0, 0.86, 0.5), vHeat * vHeat) * (0.5 + 2.4 * vHeat);
          gl_FragColor = vec4(c, 0.0);
        }`,
    });
    // light added on top; the alpha (the ink ids under it) stays
    mat.blending = THREE.CustomBlending;
    mat.blendSrc = THREE.OneFactor;
    mat.blendDst = THREE.OneFactor;
    mat.blendSrcAlpha = THREE.ZeroFactor;
    mat.blendDstAlpha = THREE.OneFactor;
    this.lines = new THREE.LineSegments(this.geo, mat);
    this.lines.name = 'modcar:sparks';
    this.lines.frustumCulled = false;
    this.lines.renderOrder = 15;
    core.scene.add(this.lines);
  }

  /**
   * Throw a burst of `count` sparks from a world point: back along `back` (unit, world; the way the road
   * runs past the contact), at about `speed` m/s, spread up and sideways.
   */
  emit(x: number, y: number, z: number, back: { x: number; z: number }, speed: number, count: number): void {
    for (let k = 0; k < count; k++) {
      const i = this.next;
      this.next = (this.next + 1) % N;
      const s = speed * (0.35 + 0.65 * Math.random());
      const side = (Math.random() - 0.5) * 0.9;
      this.world[i * 3] = x;
      this.world[i * 3 + 1] = y + 0.02;
      this.world[i * 3 + 2] = z;
      this.vel[i * 3] = back.x * s - back.z * side * s;
      this.vel[i * 3 + 1] = (0.2 + Math.random() * 0.6) * s * 0.6;
      this.vel[i * 3 + 2] = back.z * s + back.x * side * s;
      this.age[i] = 0.2 + Math.random() * 0.35;
      this.life[i] = 1;
    }
    this.live = N;
  }

  update(dt: number): void {
    if (!this.live) return;
    const o = this.core.origin;
    let any = 0;
    for (let i = 0; i < N; i++) {
      if (this.life[i] <= 0) {
        this.heat[i * 2] = this.heat[i * 2 + 1] = 0;
        continue;
      }
      this.life[i] = Math.max(0, this.life[i] - dt / this.age[i]);
      this.vel[i * 3 + 1] -= 9.81 * dt;
      // a little drag
      const k = Math.exp(-dt * 1.5);
      this.vel[i * 3] *= k;
      this.vel[i * 3 + 2] *= k;
      const vx = this.vel[i * 3];
      const vy = this.vel[i * 3 + 1];
      const vz = this.vel[i * 3 + 2];
      this.world[i * 3] += vx * dt;
      this.world[i * 3 + 1] += vy * dt;
      this.world[i * 3 + 2] += vz * dt;
      const hx = this.world[i * 3] - o.x;
      const hy = this.world[i * 3 + 1] - o.y;
      const hz = this.world[i * 3 + 2] - o.z;
      // the head where it is, the tail where it was a moment ago
      this.pos[i * 6] = hx;
      this.pos[i * 6 + 1] = hy;
      this.pos[i * 6 + 2] = hz;
      this.pos[i * 6 + 3] = hx - vx * TRAIL_S;
      this.pos[i * 6 + 4] = hy - vy * TRAIL_S;
      this.pos[i * 6 + 5] = hz - vz * TRAIL_S;
      const h = this.life[i];
      this.heat[i * 2] = h;
      this.heat[i * 2 + 1] = h * 0.35;
      if (h > 0) any++;
    }
    this.live = any;
    (this.geo.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    (this.geo.getAttribute('aHeat') as THREE.BufferAttribute).needsUpdate = true;
  }
}
