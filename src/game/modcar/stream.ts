/**
 * The liquid going in (docs/MODCAR.md §5.3): a little stream from the can's spout into the filler's
 * mouth while it pours, in the liquid's colour, its bands running the way it flows (back up into the
 * spout while it is drawn out). A short bent tube made again only when its ends move.
 */
import * as THREE from 'three';
import { LAYER_SHADOW_FAR, LAYER_SHADOW_NEAR } from '../render/shadow';

const VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const FRAG = /* glsl */ `
uniform vec3 uColour;
uniform float uTime;
uniform float uDir;
varying vec2 vUv;
void main() {
  // bands running along the stream, a bright line down its middle
  float band = step(0.5, fract(vUv.x * 7.0 - uTime * 2.6 * uDir));
  float rim = abs(vUv.y - 0.5) * 2.0;
  vec3 c = uColour * mix(0.82, 1.08, band);
  c = mix(c, vec3(1.0, 0.98, 0.9), smoothstep(0.75, 0.0, abs(vUv.y - 0.25) * 4.0) * 0.45);
  gl_FragColor = vec4(c, 0.92 - rim * 0.15);
}`;

export class LiquidStream {
  private readonly mesh: THREE.Mesh;
  private readonly mat: THREE.ShaderMaterial;
  private readonly a = new THREE.Vector3(Infinity, 0, 0);
  private readonly b = new THREE.Vector3();
  private time = 0;

  constructor(scene: THREE.Scene) {
    this.mat = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: { uColour: { value: new THREE.Color() }, uTime: { value: 0 }, uDir: { value: 1 } },
      transparent: true,
      depthWrite: false,
    });
    this.mesh = new THREE.Mesh(new THREE.BufferGeometry(), this.mat);
    this.mesh.name = 'modcar:stream';
    this.mesh.visible = false;
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 10;
    this.mesh.layers.disable(LAYER_SHADOW_FAR);
    this.mesh.layers.disable(LAYER_SHADOW_NEAR);
    scene.add(this.mesh);
  }

  /**
   * from: the spout's tip, to: the filler's mouth (render space), or from = null for none; colour (sRGB
   * hex); dir +1 pouring in, −1 drawn back out
   */
  update(dt: number, from: THREE.Vector3 | null, to: THREE.Vector3, colour: number, dir: number): void {
    this.mesh.visible = !!from;
    if (!from) return;
    this.time += dt;
    this.mat.uniforms.uTime.value = this.time;
    this.mat.uniforms.uDir.value = dir;
    (this.mat.uniforms.uColour.value as THREE.Color).setHex(colour);
    if (from.distanceToSquared(this.a) < 1e-6 && to.distanceToSquared(this.b) < 1e-6) return;
    this.a.copy(from);
    this.b.copy(to);
    // (it falls a little on its way: the middle a touch below the straight line)
    const len = from.distanceTo(to);
    const mid = new THREE.Vector3().addVectors(from, to).multiplyScalar(0.5);
    mid.y -= len * 0.18;
    const curve = new THREE.QuadraticBezierCurve3(from.clone(), mid, to.clone());
    this.mesh.geometry.dispose();
    this.mesh.geometry = new THREE.TubeGeometry(curve, 12, dir > 0 ? 0.007 : 0.0045, 8, false);
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.mat.dispose();
    this.mesh.removeFromParent();
  }
}
