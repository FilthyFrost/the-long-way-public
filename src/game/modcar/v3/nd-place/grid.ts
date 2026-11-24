/**
 * The grid placing draws round the thing on what it goes onto (docs/V3/plan/prompts.md §四, the user's "格子是车的格子，
 * 车里车外完全对得上"): lines of 10 cm squares, brighter every half metre, in the frame of what it goes on — a vehicle's
 * model (the lines fixed to it, inside it and on the ground round it alike), else the world's — fading out within about a
 * metre of the thing (Nomad Drive's grid round a thing on a snapping plane: 2.5 times its half diagonal). A mesh of its own
 * laid over the surface, each of its corners put on it by the caller (a vehicle's floor from its height grid, the ground
 * from its height), drawn among the see-through things without writing depth; the lines come from where each pixel is in
 * the frame's own space (uToLattice), so they hold still on the vehicle while the patch goes with the thing.
 */
import * as THREE from 'three';

/** corners a side of the patch */
const N = 21;

const VS = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_vertex>
uniform mat4 uToLattice;
varying vec3 vLat;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vLat = (uToLattice * wp).xyz;
  // (drawn a centimetre and a half nearer the eye than it lies: the road's drawn surface stands up to 9 mm over the
  // ground's height the game goes by, and a floor seen at a slant fights a patch laid right on it)
  wp.xyz += normalize(cameraPosition - wp.xyz) * 0.015;
  gl_Position = projectionMatrix * viewMatrix * wp;
  #include <logdepthbuf_vertex>
}`;

const FS = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_fragment>
uniform float uCell;
uniform vec2 uCenter;
uniform float uRadius;
uniform vec3 uColor;
uniform vec3 uInk;
uniform float uOpacity;
varying vec3 vLat;
/** how far (pixels) a point is from the nearest line of squares of size s */
float lineDist(vec2 p, float s) {
  vec2 g = p / s;
  vec2 d = abs(fract(g + 0.5) - 0.5) / max(fwidth(g), vec2(1e-5));
  return min(d.x, d.y);
}
void main() {
  #include <logdepthbuf_fragment>
  vec2 p = vLat.xz;
  // a pale line every square, every five a little wider, each with a dark ink edge round it: it reads on a pale road and a dark floor alike
  float d = lineDist(p, uCell);
  float d5 = lineDist(p, uCell * 5.0);
  float core = max((1.0 - smoothstep(0.35, 1.15, d)) * 0.8, 1.0 - smoothstep(0.7, 1.6, d5));
  float ink = max((1.0 - smoothstep(1.2, 2.3, d)) * 0.42, (1.0 - smoothstep(1.7, 3.0, d5)) * 0.55);
  float a = max(core, ink);
  float r = length(p - uCenter);
  float fade = 1.0 - smoothstep(uRadius * 0.5, uRadius, r);
  vec3 col = mix(uInk, uColor, clamp(core / max(a, 1e-4), 0.0, 1.0));
  a *= fade * uOpacity;
  if (a < 0.004) discard;
  gl_FragColor = vec4(col, a);
}`;

export class PlaceGrid {
  readonly mesh: THREE.Mesh;
  private readonly mat: THREE.ShaderMaterial;
  private readonly pos: THREE.BufferAttribute;
  private key = '';
  private readonly p = new THREE.Vector3();

  constructor(scene: THREE.Scene, cell: number) {
    const geo = new THREE.BufferGeometry();
    this.pos = new THREE.BufferAttribute(new Float32Array(N * N * 3), 3);
    this.pos.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('position', this.pos);
    const idx: number[] = [];
    for (let j = 0; j < N - 1; j++) {
      for (let i = 0; i < N - 1; i++) {
        const a = j * N + i;
        idx.push(a, a + N, a + 1, a + 1, a + N, a + N + 1);
      }
    }
    geo.setIndex(idx);
    this.mat = new THREE.ShaderMaterial({
      vertexShader: VS,
      fragmentShader: FS,
      uniforms: {
        uToLattice: { value: new THREE.Matrix4() },
        uCell: { value: cell },
        uCenter: { value: new THREE.Vector2() },
        uRadius: { value: 1 },
        uColor: { value: new THREE.Color(0xf4f8ff) },
        uInk: { value: new THREE.Color(0x1d1b19) },
        uOpacity: { value: 1 },
      },
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      fog: false,
    });
    this.mat.toneMapped = false;
    this.mesh = new THREE.Mesh(geo, this.mat);
    this.mesh.name = 'nd:place-grid';
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 22;
    this.mesh.visible = false;
    scene.add(this.mesh);
  }

  hide(): void {
    this.mesh.visible = false;
  }

  /**
   * Shown round a point of the frame: toLattice takes render space to the frame's (its x and z the squares'), the middle
   * (u, w) and radius in it; at(u, w, out) puts a corner of the patch on the surface (render space). The corners are
   * laid again only when `key` says something moved (the thing by a few millimetres, the surface, the frame).
   */
  show(toLattice: THREE.Matrix4, u: number, w: number, radius: number, key: string, at: (u: number, w: number, out: THREE.Vector3) => void): void {
    const U = this.mat.uniforms;
    (U.uToLattice.value as THREE.Matrix4).copy(toLattice);
    (U.uCenter.value as THREE.Vector2).set(u, w);
    U.uRadius.value = radius;
    this.mesh.visible = true;
    if (key === this.key) return;
    this.key = key;
    const a = this.pos.array as Float32Array;
    for (let j = 0; j < N; j++) {
      for (let i = 0; i < N; i++) {
        at(u + ((i / (N - 1)) * 2 - 1) * radius, w + ((j / (N - 1)) * 2 - 1) * radius, this.p);
        const k = (j * N + i) * 3;
        a[k] = this.p.x;
        a[k + 1] = this.p.y;
        a[k + 2] = this.p.z;
      }
    }
    this.pos.needsUpdate = true;
  }

  dispose(): void {
    this.mesh.removeFromParent();
    this.mesh.geometry.dispose();
    this.mat.dispose();
  }
}
