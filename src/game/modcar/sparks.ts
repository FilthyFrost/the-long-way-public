/**
 * Sparks where metal drags on the road (docs/MODCAR.md §4: the physics reports `feel.scrape`, the speed
 * of the fastest scrape — an empty hub's drum or the body on the ground): short hot streaks thrown back
 * and up from the contact, falling and fading in half a second. One small pool of points for the game,
 * added light that leaves the frame's ink ids alone.
 */
import * as THREE from 'three';
import type { RenderCore } from '../render/core';

const N = 384;

export class Sparks {
  private readonly geo = new THREE.BufferGeometry();
  private readonly pos = new Float32Array(N * 3);
  private readonly life = new Float32Array(N);
  private readonly vel = new Float32Array(N * 3);
  /** world positions (the render positions are these minus the origin) */
  private readonly world = new Float64Array(N * 3);
  private readonly age = new Float32Array(N);
  private next = 0;
  private live = 0;
  readonly points: THREE.Points;

  constructor(private readonly core: RenderCore) {
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    this.geo.setAttribute('aLife', new THREE.BufferAttribute(this.life, 1));
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: { uScale: { value: 1 } },
      vertexShader: /* glsl */ `
        attribute float aLife;
        varying float vLife;
        uniform float uScale;
        #include <common>
        #include <logdepthbuf_pars_vertex>
        void main() {
          vLife = aLife;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * mv;
          gl_PointSize = aLife > 0.0 ? uScale * (2.0 + 5.0 * aLife) / max(0.5, -mv.z) * 6.0 : 0.0;
          #include <logdepthbuf_vertex>
        }`,
      fragmentShader: /* glsl */ `
        varying float vLife;
        #include <logdepthbuf_pars_fragment>
        void main() {
          #include <logdepthbuf_fragment>
          if (vLife <= 0.0) discard;
          vec2 d = gl_PointCoord - 0.5;
          float r = dot(d, d);
          if (r > 0.25) discard;
          // white-hot when new, orange as it cools
          vec3 c = mix(vec3(1.0, 0.3, 0.04), vec3(1.0, 0.85, 0.45), vLife * vLife) * (1.0 - r * 3.2) * (0.7 + 2.2 * vLife);
          gl_FragColor = vec4(c, 0.0);
        }`,
    });
    // light added on top; the alpha (the ink ids under it) stays
    mat.blending = THREE.CustomBlending;
    mat.blendSrc = THREE.OneFactor;
    mat.blendDst = THREE.OneFactor;
    mat.blendSrcAlpha = THREE.ZeroFactor;
    mat.blendDstAlpha = THREE.OneFactor;
    this.points = new THREE.Points(this.geo, mat);
    this.points.name = 'modcar:sparks';
    this.points.frustumCulled = false;
    this.points.renderOrder = 15;
    core.scene.add(this.points);
  }

  /**
   * Throw `count` sparks from a world point: back along `back` (unit, world; the way the road runs past
   * the contact), at about `speed` m/s, spread up and sideways.
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
      this.age[i] = 0.25 + Math.random() * 0.35;
      this.life[i] = 1;
    }
    this.live = N;
  }

  update(dt: number): void {
    if (!this.live) return;
    const o = this.core.origin;
    let any = 0;
    for (let i = 0; i < N; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] = Math.max(0, this.life[i] - dt / this.age[i]);
      this.vel[i * 3 + 1] -= 9.81 * dt;
      // a little drag
      const k = Math.exp(-dt * 1.5);
      this.vel[i * 3] *= k;
      this.vel[i * 3 + 2] *= k;
      this.world[i * 3] += this.vel[i * 3] * dt;
      this.world[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.world[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      this.pos[i * 3] = this.world[i * 3] - o.x;
      this.pos[i * 3 + 1] = this.world[i * 3 + 1] - o.y;
      this.pos[i * 3 + 2] = this.world[i * 3 + 2] - o.z;
      if (this.life[i] > 0) any++;
    }
    this.live = any;
    (this.geo.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    (this.geo.getAttribute('aLife') as THREE.BufferAttribute).needsUpdate = true;
  }
}
